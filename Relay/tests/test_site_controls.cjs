const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../background.js'),'utf8');
function fixture(saved={}){
  const storage=structuredClone(saved),tabs=new Map([[1,{id:1,url:'https://www.example.co.uk/one'}]]),updates=[],alarms=new Map();
  let clock=new Date(2026,9,23,12).getTime(),fail=false;
  const state={focus:{status:'idle',phase:'work',endsAt:0},activity:{enabled:false,paused:false,categories:{},exclusions:[],distractingDomains:[]}};
  const browser={runtime:{getURL:p=>'moz-extension://relay/'+p},storage:{local:{get:async()=>structuredClone(storage),set:async value=>{if(fail)throw new Error('Storage full');Object.assign(storage,structuredClone(value));}}},
    tabs:{get:async id=>structuredClone(tabs.get(id)),query:async()=>[...tabs.values()],update:async(id,change)=>{updates.push({id,...change});Object.assign(tabs.get(id),change);}},
    alarms:{clear:async id=>alarms.delete(id),create:(id,value)=>alarms.set(id,value),onAlarm:{addListener(){}}},webRequest:{onBeforeRequest:{addListener(){}}}};
  const context=vm.createContext({browser,URL,Date,Map,Set,crypto:crypto.webcrypto,setInterval(){}});
  vm.runInContext(source.slice(source.indexOf('const RELAY_PUBLIC_SUFFIXES'),source.indexOf('function createProductivityStore(')),context);
  const service=context.createSiteControls({browser,now:()=>clock,productivity:{request:async payload=>{
    if(payload.action==='site'){const a=payload.args;state.activity.categories[a.domain]=a.category;state.activity.exclusions=a.excluded?[a.domain]:[];state.activity.distractingDomains=a.distracting?[a.domain]:[];}
    return structuredClone(state);
  }}});
  const request=(action,extra={})=>service.popup({action,tabId:1,...extra});
  return {service,request,state,storage,tabs,updates,browser,domain:context.relaySiteDomain,fail:()=>{fail=true;},time:(hour,minute=0)=>{clock=new Date(2026,9,23,hour,minute).getTime();}};
}
const rule={scheduled:true,from:'09:00',until:'17:00',focus:false};
test('whole-domain matching respects public suffixes, private suffixes, wildcard exceptions and IDNA',()=>{
  const f=fixture();
  for(const [host,domain] of [['m.news.example.co.uk','example.co.uk'],['foo.alice.github.io','alice.github.io'],['bob.github.io','bob.github.io'],['www.ck','www.ck'],['a.b.ck','a.b.ck'],['x.bücher.de','xn--bcher-kva.de'],['localhost',''],['co.uk','']])assert.equal(f.domain(host),domain);
});
test('site choices use the current domain and retain custom category options',async()=>{
  const f=fixture();f.state.activity.categories['other.org']='Custom';
  const state=await f.request('state');assert.equal(state.domain,'example.co.uk');assert.ok(state.categories.includes('Custom'));
  await f.request('activity',{category:'Learning',excluded:true,distracting:false});assert.equal(f.state.activity.categories['example.co.uk'],'Learning');
  f.tabs.get(1).url='https://other.org/';await assert.rejects(f.request('activity',{expectedDomain:'example.co.uk'}),/site changed/);
});
test('daily blocking redirects before navigation, covers subdomains and handles overnight boundaries',async()=>{
  const f=fixture();await f.request('blocking',{rule});assert.equal(f.updates.length,1);
  const details={type:'main_frame',tabId:2,url:'https://m.example.co.uk/path?private=1'};
  let result=await f.service.beforeRequest(details);assert.match(result.redirectUrl,/view=blocked&domain=example.co.uk/);assert.doesNotMatch(result.redirectUrl,/private/);
  assert.deepEqual(JSON.parse(JSON.stringify(await f.service.beforeRequest({...details,type:'script'}))),{});
  f.tabs.get(1).url='https://www.example.co.uk/';await f.request('blocking',{rule:{...rule,from:'22:00',until:'07:00'}});
  for(const [hour,blocked] of [[21,false],[22,true],[2,true],[7,false]]){f.time(hour);assert.equal(!!(await f.service.beforeRequest(details)).redirectUrl,blocked);}
});
test('focus blocking applies only to running work, includes permitted private navigation and persists across restart',async()=>{
  const f=fixture();await f.request('blocking',{rule:{...rule,scheduled:false,focus:true}});
  const details={type:'main_frame',tabId:2,url:'https://example.co.uk/',incognito:true};
  f.state.focus={status:'running',phase:'work',endsAt:Date.now()+86400000000};
  assert.ok((await f.service.beforeRequest(details)).redirectUrl);
  for(const change of [{phase:'break'},{phase:'longBreak'},{phase:'work',status:'paused'}]){Object.assign(f.state.focus,change);assert.equal((await f.service.beforeRequest(details)).redirectUrl,undefined);}
  const restarted=fixture(f.storage);restarted.state.focus={status:'running',phase:'work',endsAt:Date.now()+86400000000};assert.ok((await restarted.service.beforeRequest(details)).redirectUrl);
});
test('invalid times, unsupported shapes and failed saves preserve durable blocking rules',async()=>{
  const f=fixture();
  for(const bad of [{...rule,from:'25:00'},{...rule,until:'09:00'},{...rule,path:'/private'}])await assert.rejects(f.request('blocking',{rule:bad}),/HH:MM/);
  await f.request('blocking',{rule:{...rule,scheduled:false}});const before=structuredClone(f.storage);f.fail();
  await assert.rejects(f.request('blocking',{rule}),/Storage full/);assert.deepEqual(f.storage,before);
});

test('only the address-bar popup can change site rules; blocked pages receive reason-only status',async()=>{
  let calls=0,response;
  const c=vm.createContext({URL,browser:{runtime:{id:'relay',getURL:p=>'moz-extension://relay/'+p}},siteControls:{popup:async()=>{calls++;return {ok:true};},status:async domain=>({ok:true,domain,reason:'Blocked'})}});
  const start=source.indexOf("    case 'CYRUNE_SITE_CONTROLS':"),end=source.indexOf("    case 'MW_PRODUCTIVITY':",start);
  vm.runInContext('function route(msg,sender,sendResponse){switch(msg.type){'+source.slice(start,end)+'}}',c);
  for(const url of ['https://example.org/','moz-extension://relay/popup/popup.html','moz-extension://relay/popup/popup.html?view=blocked&domain=example.org']){
    c.route({type:'CYRUNE_SITE_CONTROLS'},{id:'relay',url},result=>{response=result;});assert.equal(response.ok,false);
  }
  assert.equal(calls,0);
  c.route({type:'CYRUNE_BLOCK_STATUS'},{id:'relay',url:'moz-extension://relay/popup/popup.html?view=blocked&domain=example.org'},result=>{response=result;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(response.domain,'example.org');assert.equal(response.reason,'Blocked');
});

test('public blocked-page mode initializes no privileged popup controls',async()=>{
  const messages=[],nodes={blockedReason:{},blockedDomain:{}};
  const c=vm.createContext({window:{location:{search:'?view=blocked&domain=example.org'}},document:{body:{classList:{add(){}}},getElementById:id=>nodes[id]},
    browser:{runtime:{sendMessage:async msg=>{messages.push(msg);return {ok:true,domain:'example.org',reason:'Blocked during your focus session'};}}}});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../popup/popup.js'),'utf8'),c);
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(messages.map(msg=>msg.type),['CYRUNE_BLOCK_STATUS']);assert.match(nodes.blockedReason.textContent,/focus session/);
});

test('categories sort alphabetically with Uncategorized last and flags remain separate',async()=>{
  const f=fixture();f.state.activity.categories['custom.org']='Art';
  const state=await f.request('state');assert.equal(state.categories.at(-1),'Uncategorized');assert.ok(state.categories.includes('Gaming'));assert.ok(state.categories.includes('Technology and software'));assert.ok(!state.categories.includes('Productivity'));assert.ok(!state.categories.includes('Distracting'));
  const names=state.categories.slice(0,-1);assert.deepEqual([...names],[...names].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'})));
  await f.request('activity',{category:'Social',excluded:false,distracting:true});const saved=await f.request('state');assert.equal(saved.category,'Social');assert.equal(saved.distracting,true);
});

test('site controls offer the requested twenty website category names without descriptions',async()=>{
  const state=await fixture().request('state');
  const expected=['E-commerce and online retail','Marketplaces and auctions','Communication and messaging','Social networks and online communities',
    'News and journalism','Entertainment and streaming','Gaming','Education and e-learning','Reference and knowledge','Search and discovery',
    'Business and professional services','Finance and payments','Health and wellness','Travel and transportation','Food and dining',
    'Government and public services','Technology and software','Real estate and housing','Nonprofit, charity, and advocacy','Personal, portfolio, and creator websites'];
  expected.sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
  assert.deepEqual([...state.categories],[...expected,'Uncategorized']);
});

test('automatic site edits preserve input order even when the first tab lookup is delayed',async()=>{
  const f=fixture(),get=f.browser.tabs.get;let calls=0,release;
  f.browser.tabs.get=async id=>{if(++calls===1)await new Promise(resolve=>{release=resolve;});return get(id);};
  const first=f.request('activity',{category:'Social',excluded:false,distracting:false});
  const second=f.request('activity',{category:'Gaming',excluded:true,distracting:true});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);release();await Promise.all([first,second]);
  assert.equal(f.state.activity.categories['example.co.uk'],'Gaming');assert.deepEqual(f.state.activity.distractingDomains,['example.co.uk']);
});
