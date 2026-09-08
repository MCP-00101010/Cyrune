require('../web/platforms.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../web/scrape-views.js'),'utf8');
function include(context, ...names) {
  for (const name of names) {
    const start = source.indexOf(`function ${name}(`);
    vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
  }
}

test('a delayed collection dropdown refresh cannot restore the previous platform', async () => {
  let release;
  const state={activeCollection:{id:'old'},collections:[],collectionViewGeneration:0};
  const context=vm.createContext({state,api:()=>new Promise(resolve=>{release=resolve;}),
    renderCollections(){assert.fail('Stale response must not render');},renderEmulators(){assert.fail('Stale response must not render');}});
  const start=source.indexOf('async function reloadCollections(');
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
  const pending=context.reloadCollections();
  state.collectionViewGeneration++;state.activeCollection={id:'new'};
  release({collections:[{id:'old'}],active:{id:'old'}});await pending;
  assert.equal(state.activeCollection.id,'new');
});

test('platform switching waits for matching rows, rejects overlapping switches and clears failed views', async () => {
  const old = {id:'old', platform_id:'game-boy'}, next = {id:'next', platform_id:'scummvm'};
  const state = {collections:[old,next],activeCollection:old,games:[{id:'old-game'}],filtered:[{id:'old-game'}],
    selected:{id:'old-game'},selectedIds:new Set(['old-game'])};
  let release; let calls=0; let busy=false; let fail=false;
  const result = new Promise(resolve => {release=resolve;});
  const context=vm.createContext({state,els:{busyMessage:{},library:{scrollTop:200},details:{}},
    rememberPlatformFilters(){},setBusyProgress(){},escapeHtml:String,renderEmulators(){},renderDetails:async()=>{},renderList(){},
    acceptSummaryPayload:payload=>{state.games=payload.games;},replaceGameSummaries:games=>{state.games=games;},applyFilters:()=>{state.filtered=state.games;},
    withBusy:async(_title,_message,work)=>{busy=true;try{return await work();}finally{busy=false;}},
    waitForJob:async()=>{},reloadCollections:async()=>{state.activeCollection=next;},
    renderCollections:()=>{
      if(state.activeCollection===next) assert.ok(state.games.every(g=>g.id!=='old-game'),'Never render old rows as the new platform');
    },api:async(path)=>{
      if(path==='/api/select-collection'){calls++;return {job_id:'job'};}
      if(path==='/api/collections')return {collections:[old,next],active:next};
      if(fail)throw new Error('List request failed');
      return result;
    }});
  const start=source.indexOf('async function selectCollection(');
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
  const switchPromise=context.selectCollection('next');
  await new Promise(setImmediate);
  await context.selectCollection('next');
  assert.equal(calls,1);assert.equal(busy,true);assert.equal(state.activeCollection,old);
  assert.equal(context.els.busyMessage.textContent,'Loading game list...');
  release({games:[{id:'new-game'}]});await switchPromise;
  assert.equal(state.activeCollection,next);assert.equal(busy,false);assert.equal(context.els.library.scrollTop,0);
  assert.equal(state.collectionSwitchPending,false);
  state.activeCollection=old;state.games=[{id:'old-game'}];fail=true;
  await context.selectCollection('next');
  assert.equal(busy,false);assert.equal(state.collectionSwitchPending,false);assert.equal(state.games.length,0);
  assert.match(context.els.details.innerHTML,/List request failed.*Reload Arcade/);
});

test('filter checkboxes cycle any/include/exclude with native mixed state and accessible labels', () => {
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,});
  include(context, 'setFilterCheckbox', 'bindFilterCheckbox');
  const input = {dataset:{}, classList:{add() {}}, setAttribute(key, value) {this[key] = value;},
    addEventListener(event, fn) {this[event] = fn;}};
  const seen = [];
  context.bindFilterCheckbox(input, 'neutral', 'French', () => seen.push(input.dataset.filterState));
  input.change(); assert.equal(input.checked, true); assert.equal(input.indeterminate, false);
  input.change(); assert.equal(input.checked, false); assert.equal(input.indeterminate, true);
  assert.match(input['aria-label'], /French: exclude/);
  input.change(); assert.equal(input.indeterminate, false);
  assert.deepEqual(seen, ['include', 'exclude', 'neutral']);
});

test('exclusions veto inclusions, support multi-valued fields and leave unknown values visible', () => {
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state:{recentIds:new Set()}, gameLanguageCodes:g=>g.languages || [],
    gameYear:g=>g.year || '', gameTags:g=>g.tags || [], matchesQuery:()=>true});
  include(context, 'intersects', 'matchesExcludedFilters', 'matchesActiveFilters');
  const filters = {system:new Set(), language:new Set(['EN']), country:new Set(), year:new Set(),
    publisher:new Set(), tag:new Set(), excluded:{language:new Set(['FR'])}, view:'all', poks:'neutral'};
  assert.equal(context.matchesActiveFilters({languages:['EN','FR']}, '', filters), false);
  assert.equal(context.matchesActiveFilters({languages:['EN']}, '', filters), true);
  filters.language.clear();
  assert.equal(context.matchesActiveFilters({}, '', filters), true);
  assert.equal(context.matchesActiveFilters({languages:['FR']}, 'language', filters), true, 'Facet counts omit their own constraint');
  for (const [field, game] of Object.entries({system:{system:'STe'}, country:{countries:['FR','GB']},
    year:{year:'1990'}, publisher:{publisher:'Pub'}, tag:{tags:['Demo']}})) {
    filters.excluded = {[field]:new Set(Object.values(game).flat())};
    assert.equal(context.matchesActiveFilters(game, '', filters), false, field);
  }
  filters.excluded = {}; filters.poks = 'exclude';
  assert.equal(context.matchesActiveFilters({has_poks:true}, '', filters), false);
  assert.equal(context.matchesActiveFilters({has_poks:false}, '', filters), true);
  filters.poks = 'neutral';
  for (const cleanup of ['artwork', 'description', 'review']) {
    filters.cleanup = cleanup;
    assert.equal(context.matchesActiveFilters({cleanup:{[cleanup]:true}}, '', filters), true);
    assert.equal(context.matchesActiveFilters({cleanup:{[cleanup]:false}}, '', filters), false);
  }
});

test('platform controls hide POKs and restrict emulator adapters without changing saved columns', () => {
  const state = {activeCollection:{platform_id:'atari-st'}, ui:{columnOrder:['title','poks'], columnVisibility:{title:true,poks:true}},
    emulators:['eightyone','spectaculator','scummvm','steem','hatari'].map(type=>({id:type,type}))};
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state, COLUMN_MAP:new Map(['title','poks'].map(key=>[key,{key}]))});
  include(context, 'collectionPlatform', 'platformColumnAvailable', 'platformEmulatorTypes', 'platformEmulators', 'visibleColumns');
  for (const [platform, emulators] of Object.entries({'atari-st':['steem','hatari'], scummvm:['scummvm'], 'zx-spectrum':['eightyone','spectaculator']})) {
    state.activeCollection.platform_id = platform;
    assert.deepEqual(Array.from(context.platformEmulators(), emu=>emu.id), emulators);
    assert.equal(context.visibleColumns().some(row=>row.key === 'poks'), platform === 'zx-spectrum');
  }
  assert.equal(state.ui.columnVisibility.poks, true);
});

test('excluded editions leave the remaining count and badges while retaining the hidden default launch identity', () => {
  const versions = ['EN','DE','FR'].map((language,i)=>({id:language,version_group:'family',default_version:'FR',
    title:i===2?'Pirates!':'Space Quest III: The Pirates of Pestulon', publisher:i===2?'MicroProse':'Sierra',
    languages:[language], countries:[language], system:['ST','STe','Falcon'][i], version:language, platform_options:[language]}));
  const state = {games:versions, gamesById:new Map(versions.map(game=>[game.id,game])), selectedIds:new Set(['FR']),
    versionGroups:new Map([['family',versions]])};
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state, els:{filterPoks:{closest:()=>({})}}, platformColumnAvailable:()=>false,
    activeFiltersSnapshot:()=>({}), renderMetadataFilters(){}, renderViewOptions(){}, matchesActiveFilters:g=>g.id!=='FR',
    matchesExcludedFilters:g=>g.id==='FR', sortFilteredGames(){}, renderList(){}, renderCounts(){}, updateSortHeaders(){}, rememberPlatformFilters(){}});
  include(context, 'groupedGameRows', 'applyFilters'); context.applyFilters();
  const row = state.filtered[0];
  assert.equal(state.filtered.length, 1); assert.equal(row.version_count,2);
  assert.equal(row.id,'FR'); assert.equal(row.default_version,'FR');
  assert.equal(row.title,'Pirates!'); assert.equal(row.publisher,'MicroProse');
  assert.deepEqual(Array.from(row.languages),['EN','DE']);
  assert.deepEqual(Array.from(row.version_systems),['ST','STe']);
  assert.deepEqual(Array.from(row.version_editions),['EN','DE']);
  assert.deepEqual(Array.from(state.selectedIds),['FR']);
  assert.equal(versions[2].languages[0],'FR');
  context.matchesExcludedFilters=()=>true; context.matchesActiveFilters=()=>false; context.applyFilters();
  assert.equal(state.filtered.length,0);
});

test('search, positive/negative filters, POK state and view survive platform switches and reload', () => {
  const saved = new Map();
  const input={dataset:{},classList:{add(){}},setAttribute(){}};
  const state={ui:{platformFilters:{}}, multiFilters:{}, excludedFilters:{}};
  const els={search:{value:''},filterCleanup:{value:''},filterPoks:input,filterView:{value:'all',options:[{value:'all'},{value:'favourites'}]}};
  const context=vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state,els,saveUiState(){saved.set('ui',JSON.stringify(state.ui));},renderViewOptions(){}});
  include(context,'filterSettings','setFilterCheckbox','rememberPlatformFilters','restorePlatformFilters');
  context.restorePlatformFilters('zx-spectrum');
  els.search.value='Jetpac'; state.multiFilters={system:['48K']}; state.excludedFilters={language:['FR']};
  input.dataset.filterState='exclude'; els.filterView.value='favourites';
  els.filterCleanup.value='review';
  context.restorePlatformFilters('atari-st');
  assert.equal(els.search.value,''); assert.equal(input.dataset.filterState,'neutral');
  assert.equal(els.filterCleanup.value,'');
  els.search.value='Powermonger'; state.excludedFilters={language:['DE']};
  context.restorePlatformFilters('zx-spectrum');
  assert.equal(els.filterCleanup.value,'review');
  assert.equal(els.search.value,'Jetpac'); assert.equal(input.indeterminate,true);
  assert.equal(els.filterView.value,'favourites'); assert.deepEqual(Array.from(state.multiFilters.system),['48K']);
  context.rememberPlatformFilters();
  state.ui=JSON.parse(saved.get('ui')); state.filterPlatform='';
  context.restorePlatformFilters('atari-st');
  assert.equal(els.search.value,'Powermonger'); assert.deepEqual(Array.from(state.excludedFilters.language),['DE']);
  const clean=context.filterSettings({search:7,multiFilters:{language:['EN',null,{},'EN']},excludedFilters:null,poks:'evil',view:'bad'});
  assert.equal(clean.search,''); assert.deepEqual(Array.from(clean.multiFilters.language),['EN']); assert.equal(clean.view,'all');
});

test('details and save completion do not wait for artwork, and late artwork cannot replace a new selection', async () => {
  let finish;
  const pending = new Promise(resolve => {finish = resolve;});
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,detailRenderGeneration:0, state:{selected:{id:'first',title:'First',screenshot:'image'}},
    els:{details:{querySelector:()=>null}}, extensionAssetCache:new Map(), prepareArtworkAssets:()=>pending, escapeHtml:String,
    formatLanguageCodes:()=>'', formatCountryCodes:()=>'', gameTags:()=>[], isGameFavourite:()=>false,
    renderScrapedMetadata:()=>'', renderLaunchMeta:()=>'', platformColumnAvailable:()=>false,
    webHubHandoff:{}, document:{querySelector:()=>({addEventListener(){}}),querySelectorAll:()=>[]},
    launchSelected(){}, sendSelectedToWebHub(){}, toggleFavourite(){}, showScrapePreviewModal(){}});
  const start = source.indexOf('async function renderDetails(');
  vm.runInContext(source.slice(start, source.indexOf('\n}', start)+2), context);
  await context.renderDetails('Saved');
  assert.match(context.els.details.innerHTML, /Saved/);
  context.state.selected = {id:'second',title:'Second'};
  await context.renderDetails(); finish(); await new Promise(setImmediate);
  assert.match(context.els.details.innerHTML, /Second/);
  assert.doesNotMatch(context.els.details.innerHTML, /First/);
});

test('each completed detail image paints immediately without requesting POKs or rebuilding details again', async () => {
  let ready; const panel={dataset:{gameId:'game'}}; let requests=0;
  const context=vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,detailRenderGeneration:0,state:{selected:{id:'game',title:'Game',screenshot:'screen',loading_screen:'cover',has_poks:true}},
    els:{details:{querySelector:selector=>selector==='.artwork-panel'?panel:null}},extensionAssetCache:new Map(),
    prepareArtworkAssets:(_values, callback)=>{ready=callback;return new Promise(()=>{});},escapeHtml:String,
    api:async()=>{requests++;return {poks:[]};},renderPoks:()=>'',renderArtworkPanel:()=>'<div>ready image</div>',
    formatLanguageCodes:()=>'',formatCountryCodes:()=>'',gameTags:()=>[],isGameFavourite:()=>false,
    renderScrapedMetadata:()=>'',renderLaunchMeta:()=>'',platformColumnAvailable:()=>true,webHubHandoff:{},
    document:{querySelector:()=>({addEventListener(){}}),querySelectorAll:()=>[]},sendSelectedToWebHub(){}});
  const start=source.indexOf('async function renderDetails(');
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
  await context.renderDetails(); const html=context.els.details.innerHTML;
  ready('cover'); assert.equal(panel.outerHTML,'<div>ready image</div>');
  ready('screen'); assert.equal(requests,1);
  assert.equal(context.els.details.innerHTML,html);
  context.state.selected={id:'other'};panel.outerHTML='new selection';ready('cover');
  assert.equal(panel.outerHTML,'new selection');
});
