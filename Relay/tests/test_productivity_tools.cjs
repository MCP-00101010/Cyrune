const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../background.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(saved={}){
  const storage=structuredClone(saved),alarms=new Map(),events={},notes=[],changed=[],tabs=new Map([[1,{id:1,url:'https://www.example.org/one',title:'One',windowId:1,index:0,status:'complete'}]]);
  let time=new Date(2026,9,23,12).getTime(),fail=false,used=0;
  const event=name=>({addListener:fn=>{events[name]=fn;}});
  const browser={runtime:{getURL:p=>'moz-extension://relay/'+p},storage:{local:{get:async()=>structuredClone(storage),set:async v=>{if(fail)throw Error('Storage full');Object.assign(storage,structuredClone(v));}}},
    tabs:{get:async id=>{if(!tabs.has(id))throw Error('Closed');return structuredClone(tabs.get(id));},update:async(id,change)=>Object.assign(tabs.get(id),change),query:async()=>[...tabs.values()],onRemoved:event('removed'),onUpdated:event('updated')},
    alarms:{clear:async id=>alarms.delete(id),create:(id,value)=>alarms.set(id,value),onAlarm:event('alarm')},notifications:{create:async n=>notes.push(n)}};
  const c=vm.createContext({browser,URL,Date,Map,Set,setInterval(){}});
  vm.runInContext(source.slice(source.indexOf('const RELAY_PUBLIC_SUFFIXES'),source.indexOf('function createProductivityStore(')),c);
  vm.runInContext(source.slice(source.indexOf('function createTimerOverrides('),source.indexOf('// Browser-local utilities')),c);
  vm.runInContext(source.slice(source.indexOf('function createTabUnloader('),source.indexOf('function createTimerOverrides(')),c);
  const overrides=c.createTimerOverrides({browser,now:()=>time,changed:async ids=>changed.push([...ids])});
  const activity={enabled:true,paused:false,categories:{},exclusions:[],distractingDomains:['example.org']};
  const productivity={request:async msg=>{if(msg.action==='state')return {activity,focus:{status:'idle'}};assert.equal(msg.action,'report');assert.deepEqual([...msg.args.domains],['example.org']);return {report:{domains:[{name:'example.org',milliseconds:used}]}};}};
  const allowances=c.createSiteAllowances({browser,productivity,now:()=>time});
  return {c,browser,storage,alarms,events,notes,tabs,overrides,allowances,activity,changed,productivity,now:()=>time,advance:ms=>{time+=ms;},used:ms=>{used=ms;},fail:()=>{fail=true;}};
}
test('resuming or expiring an override gives unloading a fresh full inactivity interval',async()=>{
  const f=fixture();f.browser.tabs.executeScript=async()=>[];
  const unloader=f.c.createTabUnloader({browser:f.browser,now:f.now});
  const overrides=f.c.createTimerOverrides({browser:f.browser,now:f.now,changed:ids=>Promise.all(ids.map(id=>unloader.resetTab(id)))});f.c.timerOverrides=overrides;
  await unloader.popup({action:'settings',tabId:1,enabled:true,seconds:60});f.advance(50000);
  await overrides.set(f.tabs.get(1),'awake',1800);assert.equal(f.alarms.has('cyrune-unload:1'),false);
  f.advance(1800000);await overrides.expire();assert.equal(f.alarms.get('cyrune-unload:1').when,f.now()+60000);
  await overrides.set(f.tabs.get(1),'pause',0);f.advance(50000);await overrides.set(f.tabs.get(1),'none',0);assert.equal(f.alarms.get('cyrune-unload:1').when,f.now()+60000);
});
test('tab overrides preserve domain choices, expire automatically and clear on navigation/close',async()=>{
  const f=fixture();f.overrides.start();const tab=f.tabs.get(1);
  await f.overrides.set(tab,'awake',1800);assert.equal(f.overrides.paused(tab,'unload'),true);assert.equal(f.overrides.paused(tab,'reload'),false);
  assert.deepEqual(f.storage,{});f.advance(1800000);await f.overrides.expire();assert.equal(f.overrides.get(tab),null);assert.equal(f.changed.length,2);
  await f.overrides.set(tab,'pause',0);assert.equal(f.overrides.paused(tab,'reload'),true);f.advance(86400000);assert.ok(f.overrides.get(tab));
  f.events.updated(1,{url:'https://other.org/'},{...tab,url:'https://other.org/'});await tick();assert.equal(f.overrides.get(tab),null);
  await f.overrides.set(tab,'awake',0);f.events.removed(1);await tick();assert.equal(f.overrides.get(tab),null);
  for(const [mode,seconds] of [['bad',1800],['pause',1],['pause','1800']])await assert.rejects(f.overrides.set(tab,mode,seconds));
});

test('reload and unload pauses have independent deadlines and resume without changing each other',async()=>{
  const f=fixture(),tab=f.tabs.get(1);
  await f.overrides.set(tab,'pause',1800,'reload');
  assert.equal(f.overrides.paused(tab,'reload'),true);
  assert.equal(f.overrides.paused(tab,'unload'),false);
  const reloadUntil=f.overrides.get(tab).reload.until;
  f.advance(60000);
  await f.overrides.set(tab,'pause',3600,'unload');
  assert.equal(f.overrides.get(tab).reload.until,reloadUntil);
  await f.overrides.set(tab,'none',0,'reload');
  assert.equal(f.overrides.paused(tab,'reload'),false);
  assert.equal(f.overrides.paused(tab,'unload'),true);
  await f.overrides.set(tab,'pause',1800,'reload');
  f.advance(1800000);await f.overrides.expire();
  assert.equal(f.overrides.paused(tab,'reload'),false);
  assert.equal(f.overrides.paused(tab,'unload'),true);
  f.advance(1800000);await f.overrides.expire();assert.equal(f.overrides.get(tab),null);
  assert.deepEqual(f.storage,{});
});

test('pause changes rearm only the affected service and flush expired pauses before another edit',async()=>{
  const f=fixture(),changes=[],tab=f.tabs.get(1);
  const overrides=f.c.createTimerOverrides({browser:f.browser,now:f.now,changed:async(ids,kinds)=>changes.push([...kinds])});
  await overrides.set(tab,'pause',1800,'reload');
  await overrides.set(tab,'pause',3600,'unload');
  assert.deepEqual(changes,[['reload'],['unload']]);
  f.advance(1800000);await overrides.set(tab,'pause',0,'unload');
  assert.deepEqual(changes,[['reload'],['unload'],['reload'],['unload']]);
  assert.equal(overrides.paused(tab,'reload'),false);
  assert.equal(overrides.get(tab).unload.until,0);
});

test('card pause requests reject unknown scopes and stale domains without changing another pause',async()=>{
  const f=fixture(),service={};
  const controller=f.c.createTabTimerController({browser:f.browser,refresh:service,unloader:service,overrides:f.overrides});
  await controller.request({action:'override',tabId:1,kind:'reload',mode:'pause',seconds:1800,expectedDomain:'example.org'});
  for(const kind of [undefined,'all','other'])await assert.rejects(controller.request({action:'override',tabId:1,kind,mode:'none',seconds:0}));
  await assert.rejects(controller.request({action:'override',tabId:1,kind:'unload',mode:'pause',seconds:0,expectedDomain:'other.org'}));
  assert.equal(f.overrides.paused(f.tabs.get(1),'reload'),true);
  assert.equal(f.overrides.paused(f.tabs.get(1),'unload'),false);
});
test('daily allowances warn once, block at the limit, survive restart and reset at local midnight',async()=>{
  const f=fixture();await f.allowances.save('example.org',{enabled:true,minutes:20,warningMinutes:5,block:true});
  f.used(15*60000);await f.allowances.refresh(f.activity);assert.equal(f.notes.length,1);assert.match(f.notes[0].message,/5 min remaining/);assert.equal(f.allowances.reason('example.org'),'');
  f.advance(15000);await f.allowances.refresh(f.activity);assert.equal(f.notes.length,1);
  f.used(20*60000);f.advance(15000);await f.allowances.refresh(f.activity);assert.match(f.allowances.reason('example.org'),/20 min/);assert.equal(f.notes.length,2);
  const again=fixture(f.storage);again.used(20*60000);await again.allowances.refresh(again.activity);assert.match(again.allowances.reason('example.org'),/allowance/);assert.equal(again.notes.length,0);
  f.advance(86400000);f.used(0);await f.allowances.refresh(f.activity);assert.equal(f.allowances.reason('example.org'),'');assert.equal(f.allowances.status('example.org').usedMs,0);
  f.activity.distractingDomains=[];await f.allowances.refresh(f.activity);assert.equal(f.allowances.reason('example.org'),'');
});
test('allowance settings validate bounds and retain confirmed records on failed writes or unsupported data',async()=>{
  const f=fixture();await f.allowances.save('example.org',{enabled:true,minutes:20,warningMinutes:5,block:false});const before=structuredClone(f.storage);
  for(const rule of [{minutes:1,warningMinutes:5,block:true},{minutes:1441,warningMinutes:0,block:true},{minutes:10,warningMinutes:0,block:'yes'},{minutes:10,warningMinutes:0,block:true,extra:1}])await assert.rejects(f.allowances.save('example.org',{enabled:true,...rule}));
  f.fail();await assert.rejects(f.allowances.save('example.org',{enabled:true,minutes:30,warningMinutes:5,block:true}));assert.deepEqual(f.storage,before);
  const corrupt=fixture({cyruneSiteAllowancesV1:{schemaVersion:2,rules:{},notices:{}}});await assert.rejects(corrupt.allowances.ready(),/recovery/);
  for(const rules of [7,[],true])await assert.rejects(fixture({cyruneSiteAllowancesV1:{schemaVersion:1,rules,notices:{}}}).allowances.ready(),/recovery/);
});
test('an exceeded allowance blocks navigation even without a scheduled or focus rule',async()=>{
  const f=fixture();await f.allowances.save('example.org',{enabled:true,minutes:20,warningMinutes:5,block:true});f.used(20*60000);
  const controls=f.c.createSiteControls({browser:f.browser,productivity:f.productivity,allowances:f.allowances});
  const result=await controls.beforeRequest({type:'main_frame',tabId:1,url:'https://news.example.org/new'});assert.match(result.redirectUrl,/view=blocked/);
  assert.match((await controls.status('example.org')).reason,/Daily allowance reached/);
  assert.equal((await controls.beforeRequest({type:'main_frame',tabId:1,url:'https://other.org/'})).redirectUrl,undefined);
});

test('earlier allowance records recover without blocking site settings or losing choices',async()=>{
  const original={schemaVersion:1,rules:{'example.org':{minutes:20,warningMinutes:5,block:true},'other.org':{minutes:0,warningMinutes:0,block:false}},notices:{'example.org':'2026-10-23:warning'}};
  const f=fixture({cyruneSiteAllowancesV1:original});
  const controls=f.c.createSiteControls({browser:f.browser,productivity:f.productivity,allowances:f.allowances});
  const state=await controls.popup({action:'state',tabId:1});
  assert.equal(state.domain,'example.org');assert.equal(state.allowance.rule.enabled,true);assert.equal(state.allowance.rule.minutes,20);
  assert.equal(f.storage.cyruneSiteAllowancesV1.rules['other.org'].enabled,false);
  assert.deepEqual(f.storage.cyruneSiteAllowancesV1MigrationBackup,original);
  assert.deepEqual(f.storage.cyruneSiteAllowancesV1.notices,original.notices);
  await fixture(f.storage).allowances.ready();
});

test('unrecoverable allowances leave category and scheduled blocking settings usable',async()=>{
  const f=fixture({cyruneSiteAllowancesV1:{schemaVersion:99,rules:{},notices:{}}});
  const controls=f.c.createSiteControls({browser:f.browser,productivity:f.productivity,allowances:f.allowances,now:f.now});
  const state=await controls.popup({action:'state',tabId:1});assert.equal(state.domain,'example.org');assert.match(state.allowance.error,/recovery/);
  await controls.popup({action:'blocking',tabId:1,rule:{scheduled:true,from:'09:00',until:'17:00',focus:true}});
  assert.equal(f.storage.cyruneDomainRulesV1.rules['example.org'].focus,true);
  assert.equal(f.storage.cyruneSiteAllowancesV1.schemaVersion,99);
  assert.match((await controls.beforeRequest({type:'main_frame',tabId:1,url:'https://example.org/'})).redirectUrl,/view=blocked/);
  assert.equal((await controls.beforeRequest({type:'main_frame',tabId:1,url:'https://other.org/'})).cancel,undefined);
});

test('failed allowance conversion preserves the original and never replaces an existing backup',async()=>{
  const original={schemaVersion:1,rules:{'example.org':{minutes:20,warningMinutes:5,block:true}},notices:{}};
  const f=fixture({cyruneSiteAllowancesV1:original});f.fail();await assert.rejects(f.allowances.ready(),/Storage full/);
  assert.deepEqual(f.storage,{cyruneSiteAllowancesV1:original});
  const saved={schemaVersion:1,rules:{},notices:{}};
  const again=fixture({cyruneSiteAllowancesV1:original,cyruneSiteAllowancesV1MigrationBackup:saved});await again.allowances.ready();
  assert.deepEqual(again.storage.cyruneSiteAllowancesV1MigrationBackup,saved);
});
test('disabling an allowance retains its choices and editing it does not repeat daily alerts',async()=>{
  const f=fixture(),rule={enabled:true,minutes:20,warningMinutes:5,block:true};await f.allowances.save('example.org',rule);f.used(20*60000);await f.allowances.refresh(f.activity);assert.equal(f.notes.length,1);
  await f.allowances.save('example.org',{...rule,enabled:false});await f.allowances.refresh(f.activity);assert.equal(f.allowances.reason('example.org'),'');assert.equal(f.allowances.status('example.org').rule.minutes,20);
  await f.allowances.save('example.org',rule);await f.allowances.refresh(f.activity);assert.equal(f.notes.length,1);assert.match(f.allowances.reason('example.org'),/allowance/);
});
test('overview lists bounded tab metadata, filters private tabs and applies overrides without changing saved rules',async()=>{
  const f=fixture();f.tabs.set(2,{...f.tabs.get(1),id:2,incognito:true});
  const service={ready:async()=>{},hasRule:()=>true,popup:async()=>({status:{reason:'Waiting'}})};
  const controller=f.c.createTabTimerController({browser:f.browser,refresh:service,unloader:service,overrides:f.overrides});
  const list=await controller.request({action:'list',offset:0,query:'',filter:'timers'},true);assert.equal(list.total,1);assert.equal(list.rows[0].domain,'example.org');assert.equal(list.rows[0].url,undefined);
  await assert.rejects(controller.request({action:'list',offset:0,query:'',filter:'timers'}));
  await controller.request({action:'bulk',tabs:[{id:1,domain:'example.org'}],mode:'pause',seconds:1800},true);assert.equal(f.overrides.paused(f.tabs.get(1),'reload'),true);assert.deepEqual(f.storage,{});
  f.tabs.get(1).url='https://other.org/';await assert.rejects(controller.request({action:'bulk',tabs:[{id:1,domain:'example.org'}],mode:'none',seconds:0},true),/changed/);
  await assert.rejects(controller.request({action:'bulk',tabs:Array.from({length:101},(_,id)=>({id,domain:'example.org'})),mode:'pause',seconds:1800},true),/1–100/);
});

test('clock reports today for the whole domain independently of allowances and tracking pause',async()=>{
  const f=fixture(),requests=[],request=f.productivity.request;
  f.productivity.request=async msg=>{requests.push(msg);return request(msg);};f.used(3720000);
  const controls=f.c.createSiteControls({browser:f.browser,productivity:f.productivity,now:f.now});
  f.activity.paused=true;
  let value=await controls.popup({action:'activityTime',tabId:1,expectedDomain:'example.org'});
  assert.equal(value.todayMs,3720000);assert.equal(value.trackingEnabled,true);
  assert.deepEqual(JSON.parse(JSON.stringify(requests.find(r=>r.action==='report').args)),{from:'2026-10-23',to:'2026-10-23',domains:['example.org']});
  f.advance(86400000);f.used(0);value=await controls.popup({action:'activityTime',tabId:1});assert.equal(value.todayMs,0);
  assert.equal(requests.findLast(r=>r.action==='report').args.from,'2026-10-24');
  f.activity.enabled=false;requests.length=0;value=await controls.popup({action:'activityTime',tabId:1});assert.equal(value.trackingEnabled,false);assert.equal(value.todayMs,null);assert.equal(requests.some(r=>r.action==='report'),false);
});
test('overview authority rejects ordinary pages, blocked mode and embedded extension documents',async()=>{
  let response,calls=0;const c=vm.createContext({browser:{runtime:{id:'relay',getURL:p=>'moz-extension://relay/'+p}},tabTimerController:{request:async()=>{calls++;return {ok:true};}}});
  const start=source.indexOf("    case 'CYRUNE_TAB_TIMERS':"),end=source.indexOf("    case 'CYRUNE_TAB_UNLOAD':",start);
  vm.runInContext('function route(msg,sender,sendResponse){switch(msg.type){'+source.slice(start,end)+'}}',c);
  for(const sender of [{id:'relay',url:'https://example.org/'},{id:'relay',url:'moz-extension://relay/popup/popup.html?view=blocked&domain=example.org'},{id:'relay',url:'moz-extension://relay/popup/popup.html?view=timers',frameId:2},{id:'relay',url:'moz-extension://relay/popup/popup.html?view=timers',tab:{url:'https://example.org/'}}]){c.route({type:'CYRUNE_TAB_TIMERS'},sender,v=>{response=v;});assert.equal(response.ok,false);}
  assert.equal(calls,0);c.route({type:'CYRUNE_TAB_TIMERS'},{id:'relay',url:'moz-extension://relay/popup/popup.html?view=timers',frameId:0},v=>{response=v;});await tick();assert.equal(calls,1);
});
