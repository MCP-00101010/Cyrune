require('../web/platforms.js');
const test = require('node:test');
const assert = require('node:assert/strict');
require('../web/metadata-scraping.js');
const {bestMatch, createBatch, preferredProvider} = globalThis.ArcadeMetadataScraping;
const match = (title,confidence) => ({candidate:{title},confidence});

test('highest finite confidence wins regardless of provider ordering; ties retain provider order', () => {
  const first=match('First',91), second=match('Second',91);
  assert.equal(bestMatch([match('Weak',10),first,second,match('Bad',Infinity),match('Bad',101)]),first);
  assert.equal(bestMatch([{confidence:100},match('',100)]),null);
});

test('last provider is shared across scrapers with configured and network-aware fallback', () => {
  const providers=[{id:'manual',type:'manual'},{id:'tgdb',type:'remote',configured:true},{id:'ss',type:'remote',configured:true}];
  assert.equal(preferredProvider(providers,'ss',true),'ss');
  assert.equal(preferredProvider(providers,'deleted',true),'tgdb');
  assert.equal(preferredProvider(providers,'ss',false),'manual');
  assert.equal(preferredProvider([{id:'broken',configured:false}], 'broken',true),'');
});

test('batch previews do not save; Apply uses the reviewed highest match and skips unchecked/no-result games', async () => {
  const writes=[];
  const batch=createBatch(['a','b','c'].map(id=>({id,title:id})),{
    preview:async game=>({matches:game.id==='c'?[]:[match('Low',10),match(game.id,95)]}),
    apply:async (game,result)=>writes.push([game.id,result.candidate.title]),current:()=>true,changed(){}
  });
  await batch.search(); assert.deepEqual(writes,[]);
  batch.select('b',false); await batch.apply(); await batch.apply();
  assert.deepEqual(writes,[['a','a']]);
  assert.deepEqual(batch.snapshot().rows.map(row=>row.status),['saved','matched','no-match']);
});

test('stop/resume never repeats saved or unconfirmed writes and independent failures allow later games', async () => {
  const writes=[];
  const batch=createBatch(['a','b','c'].map(id=>({id,title:id})),{
    preview:async game=>({matches:[match(game.id,90)]}),
    apply:async game=>{writes.push(game.id); if(game.id==='a')batch.stop(); if(game.id==='b')throw Error('connection lost');},
    current:()=>true,changed(){}
  });
  await batch.search(); await batch.apply(); assert.deepEqual(writes,['a']);
  await batch.apply(); await batch.apply(); assert.deepEqual(writes,['a','b','c']);
  assert.deepEqual(batch.snapshot().rows.map(row=>row.status),['saved','unconfirmed','saved']);
});

test('changed collection and simultaneous Apply cannot produce cross-library or duplicate saves', async () => {
  let current=true, release; const writes=[];
  const batch=createBatch([{id:'a',title:'Best'},{id:'b',title:'Best'}],{current:()=>current,changed(){},
    preview:async()=>({matches:[match('Best',99)]}),apply:async game=>{writes.push(game.id);await new Promise(resolve=>{release=resolve;});}});
  await batch.search(); const pending=batch.apply(); await batch.apply();
  assert.deepEqual(writes,['a']); current=false; release();
  await assert.rejects(pending,/collection changed/); assert.deepEqual(writes,['a']);
  assert.equal(batch.snapshot().busy,false);
});

test('Pirates never auto-applies Space Quest, weak or tied results; reviewed matches remain usable', async () => {
  const writes=[];
  const choices=[
    [match('Space Quest III: The Pirates of Pestulon', 100)],
    [match('Pirates!', 60)],
    [match('Pirates!', 90),match('Pirates!', 90)],
    [match('Space Quest III: The Pirates of Pestulon',60),match('Pirates!',100)]
  ];
  const batch=createBatch(choices.map((_,id)=>({id:String(id),title:'Pirates'})),{
    preview:async game=>({matches:choices[Number(game.id)]}),
    apply:async game=>writes.push(game.id),current:()=>true,changed(){}
  });
  await batch.search();
  assert.deepEqual(batch.snapshot().rows.map(row=>row.selected),[false,false,false,true]);
  await batch.apply(); assert.deepEqual(writes,['3']);
  batch.select('1',true); await batch.apply(); assert.deepEqual(writes,['3','1']);
});

test('failed searches can be edited and retried, alternative results chosen, and saved rows never replayed', async () => {
  const calls=[], writes=[];
  const batch=createBatch([{id:'a',title:'Wrong title'},{id:'b',title:'Saved'}],{
    preview:async (game, options)=>{
      calls.push([game.id,options]);
      return {query:{search_platform:options.search_platform}, matches:game.id==='b'?[match('Saved',90)]:
        options.search_term==='Pirates'?[match('Pirates Gold',60),match('Pirates!',95)]:[]};
    },
    apply:async (game, chosen)=>writes.push([game.id,chosen.candidate.title]), current:()=>true,changed(){}
  });
  await batch.search(); await batch.apply();
  batch.edit('a',{searchTerm:'Pirates',searchPlatform:'all'});
  assert.equal(batch.snapshot().rows[0].selected,false);
  await batch.retry('a');
  assert.deepEqual(calls.at(-1),['a',{search_term:'Pirates',search_platform:'all',refresh:true}]);
  assert.equal(batch.snapshot().rows[0].match.candidate.title,'Pirates!');
  batch.choose('a',0); await batch.apply();
  assert.deepEqual(writes,[['b','Saved'],['a','Pirates Gold']]);
  batch.edit('a',{searchTerm:'Again'}); await batch.retry('a'); await batch.apply();
  assert.equal(calls.length,3); assert.equal(writes.length,2);
});

test('edits invalidate matches immediately and in-flight retries cannot accept edits or apply stale data', async () => {
  let resolve; const writes=[];
  const batch=createBatch([{id:'a',title:'Pirates'}],{
    preview:async()=>new Promise(done=>{resolve=done;}), apply:async()=>writes.push('a'),current:()=>true,changed(){}
  });
  const initial=batch.search(); resolve({matches:[match('Pirates!',90)]}); await initial;
  batch.edit('a',{searchTerm:'Different'});
  await batch.apply(); assert.deepEqual(writes,[]);
  const retry=batch.retry('a');
  batch.edit('a',{searchTerm:'Ignored'}); await batch.apply();
  assert.equal(batch.snapshot().rows[0].searchTerm,'Different');
  resolve({matches:[]}); await retry;
  assert.equal(batch.snapshot().rows[0].status,'no-match');
  batch.edit('a',{searchTerm:' '}); await batch.retry('a');
  assert.match(batch.snapshot().rows[0].error,/Enter a search term/);
});

test('same-platform ScummVM versions reuse searches but retain their own apply targets; retries bypass cache', async () => {
  const requests=[], writes=[];
  const batch=createBatch(['dos1','dos2','amiga'].map(id=>({id,title:'Pirates',search_key:id==='amiga'?'amiga':'dos',target_ids:[id]})),{
    preview:async game=>{requests.push(game.id);return {matches:[match('Pirates!',95)],target_ids:[game.id]};},
    apply:async game=>writes.push(game.target_ids),current:()=>true,changed(){}
  });
  await batch.search(); assert.deepEqual(requests,['dos1','amiga']);
  await batch.retry('dos2'); assert.deepEqual(requests,['dos1','amiga','dos2']);
  await batch.apply(); assert.deepEqual(writes,[['dos1'],['dos2'],['amiga']]);
});

test('bulk dialog plans ScummVM versions and wires editable searches, result choice, review and apply in place', async () => {
  const vm=require('node:vm'), fs=require('node:fs'), path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../web/scrape-views.js'),'utf8');
  const controls=new Map();
  const control=key=>{
    if(!controls.has(key))controls.set(key,{value:key==='provider'?'ss':'',dataset:{},
      addEventListener(event,handler){this[event]=handler;},querySelectorAll:()=>[],focus(){}});
    const result = controls.get(key);
    if (key === 'results' && !result.children) {
      result.children=[]; result.appendChild=node=>result.children.push(node);
      Object.defineProperty(result, 'innerHTML', {get:()=>result.children.map(node=>node.html).join('')});
    }
    return result;
  };
  const overlay={dataset:{},isConnected:true,querySelector(selector){return control(selector.match(/data-bulk-([\w-]+)/)[1]);},
    addEventListener(event,handler){this[event]=handler;},setAttribute(){},remove(){this.isConnected=false;}};
  const games=['dos','amiga'].map(id=>({id,title:'Pirates',type:'ScummVM',system:id,platform:id,target_ids:[id],scrape_count:1}));
  const calls=[],reviews=[],writes=[];
  const context=vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,ArcadeMetadataScraping:globalThis.ArcadeMetadataScraping,
    setTimeout,clearTimeout,ArcadeScrapeDrafts:{load:()=>null,save(){},remove(){}},
    state:{activeCollection:{id:'scummvm'},selected:games[0]},document:{activeElement:null,querySelector:()=>null,
      createElement:tag=>{
        if(tag!=='template')return overlay;
        return {set innerHTML(html) {const node={html,replaceWith(next){const nodes=control('results').children;nodes[nodes.indexOf(this)]=next;},remove(){}};this.content={firstElementChild:node};}};
      },body:{appendChild(){}}},escapeHtml:String,canScrapeMetadata:()=>true,
    rememberScraperProvider(){},populateScraperProviders:async()=>[{id:'ss',type:'screenscraper'}],reloadGames:async()=>{},
    assetDisplayUrl:ref=>'data:image/png;base64,'+ref,extensionAssetCache:new Map(),
    api:async(route,options)=>{
      const body=JSON.parse(options.body); calls.push([route,body]);
      if(route==='/api/scrape-targets')return {games};
      if(route==='/api/apply-scrape'){writes.push(body);return {ok:true};}
      return {query:{search_platform:body.search_platform},target_ids:[body.game_id],
        matches:body.search_term==='Pirates!'?[
          {...match('Pirates Gold',60),remote_assets:{loading_screen:'gold-cover'}},
          {...match('Pirates!',95),remote_assets:{loading_screen:'pirates-cover'}}]:
          body.game_id==='amiga'?[match('Unrelated game',20)]:[]};
    }});
  vm.runInContext(source.slice(source.indexOf('async function showBulkScrapeModal('),source.indexOf('async function showScrapePreviewModal(')),context);
  context.showBulkMatchPreview=async row=>reviews.push(row.match.candidate.title);
  await context.showBulkScrapeModal([games[0]]);
  assert.equal(calls.filter(([route])=>route==='/api/scrape-preview').length,2);
  assert.match(control('results').innerHTML,/data-bulk-term="dos"/);
  assert.match(control('results').innerHTML,/data-bulk-term="amiga"/);
  assert.doesNotMatch(overlay.innerHTML,/Atari and Spectrum share metadata/);
  assert.doesNotMatch(control('results').innerHTML,/data-bulk-match="amiga"/,'A single result does not need a dropdown');
  assert.match(control('results').innerHTML,/bulk-scrape-result-title">Unrelated game/);
  control('results').input({target:{dataset:{bulkTerm:'dos'},value:'Pirates!'}});
  control('results').change({target:{dataset:{bulkPlatform:'dos'},value:'all'}});
  assert.match(control('results').innerHTML,/value="all" selected/);
  control('results').click({target:{closest:()=>({dataset:{bulkRetry:'dos'}})}});
  await new Promise(setImmediate);
  assert.deepEqual(calls.at(-1),['/api/scrape-preview',{collection_id:'scummvm',game_id:'dos',provider:'ss',search_platform:'all',refresh:true,search_term:'Pirates!'}]);
  assert.match(control('results').innerHTML,/data-bulk-match="dos"/);
  assert.match(control('results').innerHTML,/Use metadata from · 2 search results/);
  assert.match(control('results').innerHTML,/data-bulk-cover="pirates-cover"/);
  assert.ok(control('results').innerHTML.indexOf('data-bulk-cover="pirates-cover"') < control('results').innerHTML.indexOf('bulk-scrape-title'));
  control('results').change({target:{dataset:{bulkMatch:'dos'},value:'0'}});
  assert.match(control('results').innerHTML,/data-bulk-cover="gold-cover"/,'Choosing another result also changes the cover');
  assert.doesNotMatch(control('results').innerHTML,/data-bulk-cover="pirates-cover"/);
  control('results').click({target:{closest:()=>({dataset:{bulkPreview:'dos'}})}});
  assert.deepEqual(reviews,['Pirates Gold']);
  control('missing').checked = true;
  control('apply').click(); await new Promise(setImmediate);
  assert.equal(writes.length,1); assert.equal(writes[0].candidate.title,'Pirates Gold');
  assert.deepEqual(writes[0].target_ids,['dos']);
  assert.equal(writes[0].mode,'missing');
  assert.match(writes[0].undo_group,/^batch-/);
  assert.equal(overlay.isConnected,true,'Retry and save keep the batch open');
});

test('artwork requests coalesce and notify for each completed image without waiting for the slow image', async () => {
  const vm=require('node:vm'), fs=require('node:fs'), path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../web/scrape-views.js'),'utf8');
  const pending=new Map(), calls=[], ready=[];
  const context=vm.createContext({request:value=>{calls.push(value);return new Promise(resolve=>pending.set(value,resolve));}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/artwork.js'),'utf8'),context);
  context.extensionAssetCache=context.ArcadeArtwork.create({scope:()=> 'one', request:context.request});
  vm.runInContext(source.slice(source.indexOf('async function prepareArtworkAssets('),source.indexOf('function resolveLaunchMeta(')),context);
  const first=context.prepareArtworkAssets(['cover','screen'],value=>ready.push(value));
  const duplicate=context.prepareArtworkAssets(['cover']);
  await new Promise(setImmediate);
  assert.deepEqual(calls,['cover','screen']);
  pending.get('cover')({asset:{dataUrl:'data:image/png;base64,Y292ZXI='}}); await duplicate;
  assert.deepEqual(ready,['cover']);
  assert.equal(context.extensionAssetCache.get('cover'),'data:image/png;base64,Y292ZXI=');
  pending.get('screen')({asset:{dataUrl:'data:image/png;base64,c2NyZWVu'}}); await first;
  assert.deepEqual(ready,['cover','screen']);
  await context.prepareArtworkAssets(['cover']); assert.equal(calls.length,2);
});

test('bulk artwork loads only visible rows and never paints a replaced match', async () => {
  const vm=require('node:vm'), fs=require('node:fs'), path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../web/scrape-views.js'),'utf8');
  let intersect, finish; const calls=[], observed=[];
  const visible={dataset:{bulkCover:'cover',coverTitle:'Pirates'},isConnected:true};
  const hidden={dataset:{bulkCover:'other',coverTitle:'Other'},isConnected:true};
  const context=vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,extensionAssetCache:new Map(),escapeHtml:String,assetDisplayUrl:()=>'',
    prepareArtworkAssets:values=>{calls.push(Array.from(values));return new Promise(resolve=>{finish=resolve;});},
    IntersectionObserver:class{constructor(callback){intersect=callback;} observe(node){observed.push(node);} unobserve(){} disconnect(){}}});
  vm.runInContext(source.slice(source.indexOf('function renderBulkCover('),source.indexOf('async function showBulkMatchPreview(')),context);
  const observer=context.createBulkArtworkObserver({querySelectorAll:()=>[visible,hidden]},()=>true);
  observer.refresh(); assert.equal(calls.length,0); assert.equal(observed.length,2);
  intersect([{target:visible,isIntersecting:true},{target:hidden,isIntersecting:false}]);
  assert.deepEqual(calls,[['cover']]);
  visible.isConnected=false; finish(); await new Promise(setImmediate);
  assert.equal(visible.innerHTML,undefined);
});


test('quota pauses retain queued work and completed selections', async () => {
  let now=0, count=0; const states=[];
  const batch=ArcadeMetadataScraping.createBatch([{id:'one',title:'One'},{id:'two',title:'Two'}], {
    clock:()=>now, wait:async ms=>{now+=ms;}, current:()=>true, changed:view=>states.push(view), apply:async()=>{},
    preview:async game=>{if(game.id==='two' && count++===0)return {ok:false,error:'quota',retry_after:2};
      return {matches:[match(game.title,90)],needs_review:false};}
  });
  await batch.search();
  assert.ok(states.some(view=>view.pausedUntil>0 && view.rows[0].selected && view.rows[1].status==='queued'));
  assert.ok(batch.snapshot().rows.every(row=>row.status==='matched' && row.selected));
});

test('resumed review rechecks matches and never replays uncertain or saved writes', async () => {
  const searched=[], saved=[];
  const batch=ArcadeMetadataScraping.createBatch(['saved','unconfirmed','matched'].map(id=>({id,title:id})), {
    resume:['saved','unconfirmed','matched'].map(id=>({id,status:id,searchTerm:'Edited title',searchPlatform:'all'})),
    current:()=>true,changed:()=>{},preview:async(game,options)=>{searched.push([game.id,options]);return {query:{search_platform:'all'},matches:[match('Edited title',95)],needs_review:false};},
    apply:async game=>saved.push(game.id)
  });
  await batch.search();await batch.apply();
  assert.deepEqual(searched.map(row=>row[0]),['matched']);assert.deepEqual(saved,['matched']);
  assert.equal(batch.draft().find(row=>row.id==='unconfirmed').status,'unconfirmed');
});

test('artwork is scoped, bounded and recovers after transient failure', async () => {
  require('../web/artwork.js');let scope='one', now=0, fail=false;const requests=[];
  const cache=ArcadeArtwork.create({scope:()=>scope,clock:()=>now,maxEntries:2,request:async(ref,collection)=>{
    requests.push([ref,collection]);if(fail)throw Error('offline');return {asset:{dataUrl:'data:image/png;base64,'+collection}};
  }});
  await cache.prepare(['cover.png']);scope='two';assert.equal(cache.has('cover.png'),false);
  await cache.prepare(['cover.png']);assert.equal(cache.get('cover.png'),'data:image/png;base64,two');
  fail=true;await cache.prepare(['retry.png']);assert.equal(cache.has('retry.png'),true);
  now=16000;fail=false;await cache.prepare(['retry.png']);assert.equal(cache.get('retry.png'),'data:image/png;base64,two');
  scope='one';assert.equal(cache.has('cover.png'),false,'Least recently used images are evicted');
  assert.equal(requests.length,4);
});

test('late artwork cannot replace an image from a newer metadata revision', async () => {
  require('../web/artwork.js'); let revision=1; const releases=[],ready=[];
  const cache=ArcadeArtwork.create({scope:()=> 'same-collection',revision:()=>revision,
    request:()=>new Promise(resolve=>releases.push(resolve))});
  const old=cache.prepare(['cover.png'],()=>ready.push('old'));
  await Promise.resolve();revision=2;
  const fresh=cache.prepare(['cover.png'],()=>ready.push('fresh'));
  await Promise.resolve();
  releases[1]({asset:{dataUrl:'data:image/png;base64,new'}});await fresh;
  releases[0]({asset:{dataUrl:'data:image/png;base64,old'}});await old;
  assert.equal(cache.get('cover.png'),'data:image/png;base64,new');
  assert.deepEqual(ready,['fresh']);
});

test('batch reuses provider-specific successful searches and applies only the searched choices', async () => {
  const requests=[],applied=[];
  const games=[{id:'one',title:'Original',scrape_searches:{ss:{search_term:'Better title',search_platform:'all'}}},
    {id:'two',title:'Second',scrape_searches:{other:{search_term:'Different provider',search_platform:'all'}}}];
  const batch=ArcadeMetadataScraping.createBatch(games,{provider:'ss',current:()=>true,changed(){},
    preview:async(game,options)=>{requests.push(options);return {needs_review:false,query:{search_platform:options.search_platform},
      matches:[{confidence:100,candidate:{title:'Confirmed'}}]};},
    apply:async(game,match,options)=>applied.push({id:game.id,...options})});
  await batch.search();await batch.apply();
  assert.equal(requests[0].search_term,'Better title');assert.equal(requests[0].search_platform,'all');
  assert.equal(requests[1].search_term,undefined,'Automatic lookup remains automatic, including cartridge hashes');
  assert.deepEqual(applied,[{id:'one',search_term:'Better title',search_platform:'all'},
    {id:'two',search_term:null,search_platform:'current'}]);
  const resumed=ArcadeMetadataScraping.createBatch(games,{provider:'ss',current:()=>true,changed(){},preview(){},apply(){},
    resume:[{id:'one',searchTerm:'Unfinished correction',searchPlatform:'current',status:'queued'}]});
  assert.equal(resumed.snapshot().rows[0].searchTerm,'Unfinished correction');
});
