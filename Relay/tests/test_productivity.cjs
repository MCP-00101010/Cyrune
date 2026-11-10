const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname,'../background.js'),'utf8');
function fixture(saved) {
  let time = new Date(2026,9,23,12).getTime(), mono=0, state=saved?structuredClone(saved):null, fail=false;
  const segments=[],days=[],notes=[],alarms=new Map();
  const flags={focused:true,idle:'active',private:false,url:'https://work.example/private/path?token=secret'};
  const event={addListener(){}};
  const store={read:async name=>structuredClone(name==='state'?(state?[{value:state}]:[]):name==='days'?days:segments),
    commit:async(next,rows=[],erase)=>{
      if(fail)throw new Error('Write failed');
      state=structuredClone(next);
      for(const row of rows){segments.push(structuredClone(row));const previous=days.find(item=>item.day===row.day&&item.hostname===row.hostname&&item.sessionId===row.sessionId&&item.phase===row.phase);if(previous)previous.milliseconds+=row.milliseconds;else days.push(structuredClone(row));}
      if(erase)for(const records of [days,segments])for(let i=records.length-1;i>=0;i--){const row=records[i];if((!erase.hostname||row.hostname===erase.hostname)&&(!erase.from||row.day>=erase.from)&&(!erase.to||row.day<=erase.to))records.splice(i,1);}
    }};
  const browser={runtime:{getURL:value=>value},alarms:{clear:async name=>alarms.delete(name),create:(name,value)=>alarms.set(name,value),onAlarm:event},
    tabs:{query:async()=>[{id:1,incognito:flags.private,url:flags.url}],sendMessage:async()=>{},onActivated:event,onUpdated:event,onRemoved:event},
    windows:{getLastFocused:async()=>({id:1,type:'normal',focused:flags.focused}),onFocusChanged:event},
    idle:{queryState:async()=>flags.idle,setDetectionInterval(){},onStateChanged:event},notifications:{create:async value=>notes.push(value)}};
  const context=vm.createContext({browser,structuredClone,URL,Date,Math,Map,Set,JSON,Number,String,performance:{now:()=>mono},crypto:crypto.webcrypto,
    setInterval(){},hubRegistrations:new Map(),fireHubNotification:async value=>notes.push(value),cancelHubNotification:async()=>{},
    contentSha256:async value=>crypto.createHash('sha256').update(value).digest('hex')});
  vm.runInContext(source.slice(source.indexOf('const RELAY_PUBLIC_SUFFIXES'), source.indexOf('function createSiteControls(')),context);
  vm.runInContext(source.slice(source.indexOf('function createProductivityService('),source.indexOf('// Browser-local utilities')),context);
  const service=context.createProductivityService({browser,store,now:()=>time,monotonic:()=>mono});
  let seq=0;
  const request=async(serviceName,action,args={},extra={})=>service.request({schemaVersion:1,service:serviceName,action,args,requestId:'test-'+(++seq),...extra});
  async function focus(action,args={},extra={}){const snapshot=await request('focus','state');return request('focus',action,args,{expectedRevision:snapshot.focus.revision,...extra});}
  return {service,request,focus,notes,alarms,flags,segments,days,saved:()=>structuredClone(state),advance:(ms,monotonicMs=ms)=>{time+=ms;mono+=monotonicMs;},fail:()=>{fail=true;}};
}
const config={workMinutes:1,breakMinutes:1,longBreakMinutes:2,longBreakEvery:2,autoStartNext:false,notifications:true};

test('domain allowance reports aggregate subdomains before site-list truncation',async()=>{
  const f=fixture();for(let i=0;i<250;i++)f.days.push({day:'2026-10-23',hostname:`s${i}.other.org`,milliseconds:60000,sessionId:'',phase:'outside'});
  f.days.push({day:'2026-10-23',hostname:'www.example.org',milliseconds:1000,sessionId:'',phase:'outside'},{day:'2026-10-23',hostname:'news.example.org',milliseconds:2000,sessionId:'',phase:'outside'});
  const result=await f.request('activity','report',{from:'2026-10-23',to:'2026-10-23',domains:['example.org']});assert.equal(result.report.totalMs,3000);assert.equal(result.report.domains[0].name,'example.org');assert.equal(result.report.domains[0].milliseconds,3000);
  await assert.rejects(f.request('activity','report',{domains:['www.example.org']}),/Invalid report/);
});
test('stopping a work phase retains its identity and partial time for review',async()=>{
  const f=fixture();await f.request('activity','settings',{enabled:true});await f.focus('start',{config});const session=(await f.request('focus','state')).focus.sessionId;
  f.advance(15000);await f.service.pulse();await f.focus('stop');const row=(await f.request('focus','state')).focus.history[0];assert.equal(row.id,session);assert.equal(row.stopped,true);assert.equal(row.durationMs,15000);
  const report=(await f.request('activity','report',{sessionId:session})).report;assert.equal(report.totalMs,15000);
});
test('one shared focus clock transitions while Portal is absent and duplicate commands have one outcome',async()=>{
  const f=fixture();await f.service.start();await f.focus('start',{config,widgetId:'focus-a'},{requestId:'same'});
  const started=await f.request('focus','state');
  await f.request('focus','start',{config,widgetId:'focus-a'},{requestId:'same',expectedRevision:0});
  assert.equal((await f.request('focus','state')).focus.sessionId,started.focus.sessionId);
  await assert.rejects(f.focus('start',{config,widgetId:'other'}),/current shared/);
  f.advance(60000);await f.service.pulse();
  const complete=await f.request('focus','state');assert.equal(complete.focus.phase,'break');assert.equal(complete.focus.status,'paused');assert.equal(complete.focus.workCount,1);
  assert.equal(f.notes.length,2);assert.equal(complete.focus.history.length,1);
  await f.focus('resume');f.advance(10000);await f.focus('pause');assert.equal((await f.request('focus','state')).focus.remainingMs,50000);
});
test('restart rebuilds alarms and long downtime produces one interrupted phase rather than invented work',async()=>{
  const f=fixture();await f.focus('start',{config:{...config,autoStartNext:true}});
  const saved=f.saved();const resumed=fixture(saved);await resumed.service.start();assert.equal(resumed.alarms.size,1);
  resumed.advance(86400000);await resumed.service.pulse();const result=await resumed.request('focus','state');
  assert.equal(result.focus.history.length,1);assert.equal(result.focus.history[0].interrupted,true);assert.equal(result.focus.workCount,0);assert.equal(result.focus.status,'paused');
});
test('legacy adoption preserves a verified backup and history, pauses selected timers and rejects competing adoption',async()=>{
  const f=fixture();const runtime={status:'running',phase:'work',remainingMs:30000,endsAt:Date.now()+30000,history:[{phase:'work',endedAt:1234,durationMs:60000,skipped:false}]};
  await f.focus('adopt',{widgetId:'old',runtime,config,activate:true});const result=await f.request('focus','state');
  assert.equal(result.focus.status,'paused');assert.equal(result.focus.history.length,1);assert.deepEqual(f.saved().migrations[0].backup,runtime);
  await f.focus('adopt',{widgetId:'old',runtime,config,activate:true});assert.equal((await f.request('focus','state')).focus.history.length,1);
  await assert.rejects(f.focus('adopt',{widgetId:'other',runtime,config,activate:true}),/Stop the current/);
});
test('activity requires opt-in, collects only hostnames, and stops at private/unfocused/idle states',async()=>{
  const f=fixture();await f.service.start();f.advance(15000);await f.service.pulse();assert.equal(f.segments.length,0);
  await f.request('activity','settings',{enabled:true});f.advance(15000);await f.service.pulse();assert.equal(f.segments[0].hostname,'work.example');assert.equal(f.segments[0].milliseconds,15000);
  assert.doesNotMatch(JSON.stringify(f.segments),/private\/path|token|secret/);
  for(const [key,value] of [['private',true],['focused',false],['idle','locked']]){
    f.flags[key]=value;await f.service.pulse();const count=f.segments.length;f.advance(15000);await f.service.pulse();assert.equal(f.segments.length,count);f.flags[key]=key==='idle'?'active':key==='focused';await f.service.pulse();
  }
});
test('activity is attributed to focus phases, respects exclusions, handles gaps, and supports deletion/export',async()=>{
  const f=fixture();await f.request('activity','settings',{enabled:true,categories:{'work.example':'Work'}});await f.focus('start',{config});
  f.advance(15000);await f.service.pulse();let report=(await f.request('activity','report')).report;
  assert.equal(report.totalMs,15000);assert.equal(report.categories[0].name,'Work');assert.equal(report.phases[0].name,'work');
  f.advance(3600000);await f.service.pulse();report=(await f.request('activity','report')).report;assert.equal(report.totalMs,15000);
  await f.request('activity','settings',{exclusions:['work.example']});f.advance(15000);await f.service.pulse();assert.equal((await f.request('activity','export',{detail:true})).report.totalMs,15000);
  await f.request('activity','delete',{hostname:'work.example'});assert.equal((await f.request('activity','report')).report.totalMs,0);
});
test('invalid, stale, revoked and failed mutations do not replace durable state',async()=>{
  const f=fixture();await assert.rejects(f.service.request({schemaVersion:1,service:'focus',action:'start',args:{config},requestId:'x',expectedRevision:0},()=>false),/expired/);
  await f.focus('start',{config});await assert.rejects(f.request('focus','stop',{}, {expectedRevision:0}),/state changed/);
  await assert.rejects(f.request('activity','settings',{exclusions:['https://secret/path']}),/Invalid activity/);
  const before=f.saved();f.fail();await assert.rejects(f.focus('pause'),/Write failed/);assert.deepEqual(f.saved(),before);
});

test('activity intervals split exactly at focus deadlines and local midnight',async()=>{
  const f=fixture();await f.request('activity','settings',{enabled:true});await f.focus('start',{config});
  f.advance(55000);await f.service.pulse(); // unknown long gap is discarded
  f.advance(10000);await f.service.pulse();
  const report=(await f.request('activity','report')).report;
  assert.equal(report.phases.find(row=>row.name==='work').milliseconds,5000);
  assert.equal(report.phases.find(row=>row.name==='outside').milliseconds,5000);
  f.advance(12*3600000-65000-5000);await f.service.pulse();
  f.advance(10000);await f.service.pulse();
  const last=f.segments.slice(-2);assert.equal(last.length,2);assert.notEqual(last[0].day,last[1].day);
  assert.equal(last[0].milliseconds,5000);assert.equal(last[1].milliseconds,5000);
});

test('exports retain aggregate totals when detail expires and failed/corrupt adoption preserves state',async()=>{
  const f=fixture();await f.request('activity','settings',{enabled:true});f.advance(15000);await f.service.pulse();
  f.segments.length=0;
  const report=(await f.request('activity','export',{detail:true})).report;
  assert.equal(report.totalMs,15000);assert.equal(report.detail.length,0);
  await assert.rejects(f.focus('adopt',{widgetId:'old',runtime:{status:'running',phase:'work',history:[],remainingMs:1,endsAt:'bad'},activate:true,config}),/Invalid legacy/);
  assert.equal(f.saved().migrations.length,0);
  const corrupt=f.saved();corrupt.focus.remainingMs=NaN;
  await assert.rejects(fixture(corrupt).request('focus','state'),/recovery/);
});

test('productivity routes recheck authenticated registration and exclude the refresh-only popup',async()=>{
  const start=source.indexOf("    case 'MW_PRODUCTIVITY':"),end=source.indexOf("    case ",source.indexOf("    case 'CYRUNE_PRODUCTIVITY':",start)+12);
  let authorized=true,calls=0,response;
  const c=vm.createContext({browser:{runtime:{id:'relay',getURL:p=>'moz-extension://relay/'+p}},
    authorizeHubPageRequest:()=>authorized,productivityService:{request:async(_payload,check)=>{calls++;await Promise.resolve();if(check&&!check())throw new Error('expired');return {ok:true};}}});
  vm.runInContext('function route(msg,sender,sendResponse){switch(msg.type){'+source.slice(start,end)+'}}',c);
  c.route({type:'MW_PRODUCTIVITY',payload:{}},{tab:{id:1}},r=>{response=r;});authorized=false;
  await new Promise(resolve=>setImmediate(resolve));assert.equal(response.ok,false);
  for(const url of ['moz-extension://relay/popup/popup.html?view=refresh','https://web.example/']){
    response=null;c.route({type:'CYRUNE_PRODUCTIVITY'},{id:'relay',url},r=>{response=r;});
    assert.equal(response.ok,false);
  }
  assert.equal(calls,1);
});

test('activity migration retains a backup and maps site assignments/exclusions to whole domains',async()=>{
  const original=fixture();await original.request('activity','settings',{categories:{'www.example.co.uk':'Custom','example.co.uk':'Learning'},exclusions:['m.example.co.uk']});
  const legacy=original.saved();legacy.schemaVersion=1;
  const f=fixture(legacy),state=await f.request('activity','state');
  assert.equal(state.activity.categories['example.co.uk'],'Education and e-learning');assert.deepEqual([...state.activity.exclusions],['example.co.uk']);
  assert.deepEqual(f.saved().domainMigration.backup,legacy.activity);assert.equal(f.saved().schemaVersion,4);
  await f.request('activity','site',{domain:'example.co.uk',category:'Work',excluded:false,distracting:false});await f.request('activity','settings',{enabled:true});
  f.flags.url='https://news.example.co.uk/sensitive';await f.service.pulse();f.advance(15000);await f.service.pulse();
  assert.equal((await f.request('activity','report')).report.categories[0].name,'Work');
});

test('legacy Distracting category migrates to an independent flag with a retained backup',async()=>{
  const base=fixture();await base.request('activity','settings',{enabled:true});
  const legacy=base.saved();legacy.schemaVersion=2;legacy.activity.categories={'facebook.com':'Distracting','work.example':'Learning'};delete legacy.activity.distractingDomains;
  const f=fixture(legacy),result=await f.request('activity','state');
  assert.equal(result.activity.categories['facebook.com'],'Uncategorized');assert.deepEqual([...result.activity.distractingDomains],['facebook.com']);
  assert.equal(result.activity.categories['work.example'],'Education and e-learning');assert.deepEqual(f.saved().distractionMigration.backup,legacy.activity);
  await f.request('activity','site',{domain:'facebook.com',category:'Social',excluded:false,distracting:true});
  assert.equal((await f.request('activity','state')).activity.categories['facebook.com'],'Social');
});

test('website taxonomy migration renames clear matches, preserves ambiguous/custom choices and keeps its backup across restart',async()=>{
  const base=fixture();await base.request('activity','settings',{enabled:true,categories:{
    'chat.example':'Communication','video.example':'Entertainment','learn.example':'Learning','news.example':'News','social.example':'Social',
    'work.example':'Work','tools.example':'Productivity','personal.example':'Personal','shop.example':'Shopping','custom.example':'My category'
  },exclusions:['personal.example']});
  const legacy=base.saved();legacy.schemaVersion=3;legacy.activity.distractingDomains=['social.example'];
  const f=fixture(legacy);
  f.days.push({day:'2026-10-23',hostname:'news.example',milliseconds:1000,sessionId:'',phase:'outside'});
  const state=await f.request('activity','state');
  assert.equal(f.saved().schemaVersion,4);
  for(const [domain,label] of Object.entries({'chat.example':'Communication and messaging','video.example':'Entertainment and streaming',
    'learn.example':'Education and e-learning','news.example':'News and journalism','social.example':'Social networks and online communities',
    'work.example':'Work','tools.example':'Productivity','personal.example':'Personal','shop.example':'Shopping','custom.example':'My category'})) {
    assert.equal(state.activity.categories[domain],label);
  }
  assert.deepEqual([...state.activity.distractingDomains],['social.example']);assert.deepEqual([...state.activity.exclusions],['personal.example']);
  assert.deepEqual(f.saved().categoryMigration.backup,legacy.activity.categories);
  assert.equal((await f.request('activity','report')).report.categories[0].name,'News and journalism');
  const restarted=fixture(f.saved());await restarted.request('activity','state');
  assert.deepEqual(restarted.saved().categoryMigration,f.saved().categoryMigration);
});

test('failed website taxonomy migration retains the original record for recovery',async()=>{
  const base=fixture();await base.request('activity','settings',{categories:{'news.example':'News'}});
  const legacy=base.saved();legacy.schemaVersion=3;
  const f=fixture(legacy);f.fail();await assert.rejects(f.request('activity','state'),/Write failed/);
  assert.deepEqual(f.saved(),legacy);
});

test('distracting flags span categories and daily budgets count flagged sites',async()=>{
  const f=fixture();await f.request('activity','settings',{enabled:true,budgetMinutes:1});
  await f.request('activity','site',{domain:'work.example',category:'Social',excluded:false,distracting:true});
  for(let i=0;i<4;i++){f.advance(15000);await f.service.pulse();}
  const report=(await f.request('activity','report')).report;
  assert.equal(report.distractingMs,60000);assert.equal(report.categories[0].name,'Social');assert.equal(f.notes.length,1);
  await f.request('activity','site',{domain:'work.example',category:'Social',excluded:false,distracting:false});
  assert.equal((await f.request('activity','report')).report.distractingMs,0);
  assert.equal((await f.request('activity','state')).activity.categories['work.example'],'Social');
});
