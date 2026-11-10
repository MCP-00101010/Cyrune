const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../background.js'),'utf8');
const KEY='cyruneUnloadDomainsV1',prefix='cyrune-unload:';
function fixture(saved={}){
  let clock=1000,fail=false,probe=async()=>({dirty:false});
  const storage=structuredClone(saved),tabs=new Map(),alarms=new Map(),discarded=[],injected=[],edited=new Set(),cleared=[];
  const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);}});
  const browser={runtime:{getURL:p=>'moz-extension://relay/'+p},storage:{local:{get:async()=>structuredClone(storage),set:async v=>{if(fail)throw Error('Storage full');Object.assign(storage,structuredClone(v));}}},
    tabs:{get:async id=>{if(!tabs.has(id))throw Error('Closed');return structuredClone(tabs.get(id));},query:async()=>[...tabs.values()].map(t=>structuredClone(t)),
      sendMessage:async id=>probe(id),executeScript:async(id,options)=>injected.push({id,options}),discard:async id=>{discarded.push(id);tabs.get(id).discarded=true;},
      onActivated:event(),onUpdated:event(),onRemoved:event()},
    alarms:{getAll:async()=>[...alarms.keys()].map(name=>({name})),clear:async id=>alarms.delete(id),create:(id,value)=>alarms.set(id,value),onAlarm:event()}};
  const c=vm.createContext({browser,URL,Date,Map,Set});
  vm.runInContext(source.slice(source.indexOf('const RELAY_PUBLIC_SUFFIXES'),source.indexOf('function createSiteControls(')),c);
  vm.runInContext(source.slice(source.indexOf('function createTabUnloader('),source.indexOf('// Browser-local utilities')),c);
  const service=c.createTabUnloader({browser,now:()=>clock,isEdited:id=>edited.has(id),onDiscard:async id=>cleared.push(id)});
  const add=(id,changes={})=>tabs.set(id,{id,url:'https://www.example.org/'+id,status:'complete',active:false,pinned:false,audible:false,discarded:false,...changes});add(1);
  const request=(action,extra={})=>service.popup({action,tabId:1,...extra});
  return {service,request,browser,tabs,alarms,storage,discarded,injected,edited,cleared,add,advance:ms=>{clock+=ms;},probe:fn=>{probe=fn;},fail:()=>{fail=true;},fire:id=>service.alarm({name:prefix+id})};
}
test('off by default; domain rules persist, cover subdomains and preserve independent inactive countdowns',async()=>{
  const f=fixture();await f.service.start();assert.equal(f.alarms.size,0);
  await f.request('settings',{enabled:true,seconds:60});assert.equal(f.alarms.get(prefix+1).when,61000);assert.equal(f.injected[0].options.allFrames,true);
  f.advance(20000);f.add(2,{url:'https://news.example.org/other'});await f.service.syncTab(2);
  f.tabs.get(1).status='loading';await f.service.syncTab(1);f.tabs.get(1).status='complete';await f.service.syncTab(1);
  assert.equal(f.alarms.get(prefix+1).when,61000,'background refresh does not restart inactivity');assert.equal(f.alarms.get(prefix+2).when,81000);
  f.advance(40000);await f.fire(1);await f.fire(2);assert.deepEqual(f.discarded,[1]);assert.deepEqual(f.cleared,[1]);assert.equal(f.alarms.has(prefix+1),false);
  assert.equal((await f.request('state')).status.reason,'Unloaded');assert.equal((await f.request('state')).status.lastAt,61000);
  const restarted=fixture(f.storage);await restarted.service.start();assert.equal(restarted.alarms.get(prefix+1).when,61000,'restart gives fresh grace');
  assert.equal((await restarted.request('state')).rule.domain,'example.org');
});
test('selected, pinned, private, audible and edited tabs are protected; selection resets the countdown',async()=>{
  const f=fixture();for(const [id,changes] of [[2,{active:true}],[3,{pinned:true}],[4,{audible:true}],[5,{incognito:true}],[6,{}],[7,{audible:false,mutedInfo:{muted:true}}]])f.add(id,changes);f.edited.add(6);
  await f.request('settings',{enabled:true,seconds:60});f.advance(60000);for(let id=1;id<=7;id++)await f.fire(id);assert.deepEqual(f.discarded,[1]);
  f.advance(10000);f.tabs.get(2).active=false;await f.service.syncTab(2);assert.equal(f.alarms.get(prefix+2).when,131000);
  f.tabs.get(2).active=true;await f.service.syncTab(2);f.advance(20000);f.tabs.get(2).active=false;await f.service.syncTab(2);assert.equal(f.alarms.get(prefix+2).when,151000);
});
test('missing content handler fails closed; dirty response protects until navigation; late audio or selection prevents discard',async()=>{
  const f=fixture();await f.service.start();await f.request('settings',{enabled:true,seconds:60});f.advance(60000);
  f.probe(async()=>{throw Error('No receiver');});await f.fire(1);assert.equal(f.discarded.length,0);assert.equal(f.alarms.get(prefix+1).when,121000);
  f.probe(async()=>({dirty:true}));await f.fire(1);assert.equal(f.alarms.has(prefix+1),false);
  assert.equal((await f.request('state')).status.lastSkip,'Edited form');
  f.probe(async()=>({dirty:false}));await f.fire(1);assert.equal(f.discarded.length,0);
  for(const fn of f.browser.tabs.onUpdated.listeners)fn(1,{status:'loading'});await f.service.syncTab(1);
  f.probe(async()=>{f.tabs.get(1).audible=true;return {dirty:false};});await f.fire(1);assert.equal(f.discarded.length,0);
  f.tabs.get(1).audible=false;f.probe(async()=>{f.tabs.get(1).active=true;return {dirty:false};});await f.fire(1);assert.equal(f.discarded.length,0);
});
test('navigation and settings changes during the final form probe cancel stale unloads',async()=>{
  for(const change of ['navigation','settings']){
    const f=fixture();await f.request('settings',{enabled:true,seconds:60});f.advance(60000);
    f.probe(async()=>{if(change==='navigation')f.tabs.get(1).url='https://example.org/new';else await f.request('settings',{enabled:true,seconds:3600});return {dirty:false};});
    await f.fire(1);assert.equal(f.discarded.length,0);
  }
});
test('invalid settings and failed writes retain prior choices; stale popup domains are rejected',async()=>{
  const f=fixture();await f.request('settings',{enabled:true,seconds:60});
  for(const seconds of [0,59,86401,60.5,'60'])await assert.rejects(f.request('settings',{enabled:true,seconds}),/1 minute/);
  await assert.rejects(f.request('settings',{expectedDomain:'other.org',enabled:true,seconds:60}),/site changed/);
  f.fail();await assert.rejects(f.request('settings',{enabled:false,seconds:120}),/Storage full/);assert.equal((await f.request('state')).rule.enabled,true);
  for(const rules of [[{domain:'',enabled:true,seconds:60}],[{domain:'example.org',enabled:true,seconds:60},{domain:'example.org',enabled:true,seconds:60}]]){
    const bad=fixture({[KEY]:{schemaVersion:1,rules}});await assert.rejects(bad.request('state'),/recovery/);assert.deepEqual(bad.storage[KEY].rules,rules);
  }
});
test('a browser-refused discard is visible and never recorded as a completed unload',async()=>{
  const f=fixture();await f.request('settings',{enabled:true,seconds:60});f.advance(60000);
  f.browser.tabs.discard=async()=>{};await f.fire(1);let status=(await f.request('state')).status;
  assert.equal(status.lastAt,0);assert.equal(status.lastSkip,'Firefox kept tab loaded');
  f.browser.tabs.discard=async()=>{throw Error('Protected by beforeunload');};await assert.rejects(f.fire(1));status=(await f.request('state')).status;
  assert.equal(status.lastAt,0);assert.equal(status.lastSkip,'Firefox refused unload');
});
test('unloading is available only to the exact extension clock popup',async()=>{
  let calls=0,response;const c=vm.createContext({browser:{runtime:{id:'relay',getURL:p=>'moz-extension://relay/'+p}},tabUnloader:{popup:async()=>{calls++;return {ok:true};}}});
  const start=source.indexOf("    case 'CYRUNE_TAB_UNLOAD':"),end=source.indexOf("    case 'CYRUNE_BROWSER_UTILITIES':",start);
  vm.runInContext('function route(msg,sender,sendResponse){switch(msg.type){'+source.slice(start,end)+'}}',c);
  for(const sender of [{id:'other',url:'moz-extension://relay/popup/popup.html?view=refresh'},{id:'relay',url:'https://example.org/'},{id:'relay',url:'moz-extension://relay/popup/popup.html'}]){c.route({type:'CYRUNE_TAB_UNLOAD'},sender,v=>{response=v;});assert.equal(response.ok,false);}
  assert.equal(calls,0);c.route({type:'CYRUNE_TAB_UNLOAD'},{id:'relay',url:'moz-extension://relay/popup/popup.html?view=refresh'},v=>{response=v;});await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(response.ok,true);
});
