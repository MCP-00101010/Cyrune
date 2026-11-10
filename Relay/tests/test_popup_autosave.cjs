const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../popup/popup.js'),'utf8');
function fixture(allowance,override){
  const nodes=new Map(),messages=[];
  function get(id){
    if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:true,hidden:true,textContent:'',attributes:{},events:{},
      addEventListener(name,fn){this.events[name]=fn;},setAttribute(key,value){this.attributes[key]=value;},replaceChildren(...children){this.children=children;}});
    return nodes.get(id);
  }
  get('refreshAmount').value='5';get('refreshUnit').value='60';get('unloadAmount').value='15';get('unloadUnit').value='60';
  const c=vm.createContext({URL,setTimeout:(...args)=>setTimeout(...args).unref(),clearTimeout,window:{addEventListener(){}},document:{getElementById:get,createElement:()=>({})},browser:{runtime:{sendMessage:async msg=>{
    messages.push(structuredClone(msg));
    if(msg.action==='state'&&msg.type==='CYRUNE_BROWSER_UTILITIES')return {ok:true,url:'https://example.org/',eligible:true,prefs:{copyLinks:true,copyTabs:true},rule:null};
    if(msg.action==='state'&&msg.type==='CYRUNE_TAB_UNLOAD')return {ok:true,domain:'example.org',rule:null};
    if(msg.action==='state'&&msg.type==='CYRUNE_TAB_TIMERS')return {ok:true,domain:'example.org',override};
    if(msg.action==='state')return {ok:true,domain:'example.org',category:'Social',distracting:false,excluded:false,allowance,categories:['Gaming','Productivity','Social','Uncategorized'],rule:{scheduled:false,from:'09:00',until:'17:00',focus:false}};
    return {ok:true};
  }}}});
  vm.runInContext(source.slice(0,source.lastIndexOf('main();')),c);
  return {get,messages,c,change:async id=>{await get(id).events.change();await new Promise(resolve=>setImmediate(resolve));}};
}
test('timer checkbox and interval changes save without buttons or success footers',async()=>{
  const f=fixture();await f.c.setupBrowserUtilities({id:1,url:'https://example.org/'});
  f.get('refreshEnabled').checked=true;await f.change('refreshEnabled');
  f.get('refreshAmount').value='2';await f.change('refreshAmount');
  assert.deepEqual(f.messages.filter(msg=>msg.action==='refresh').map(msg=>[msg.mode,msg.seconds]),[['start',300],['start',120]]);
  assert.equal(f.get('refreshDetail').hidden,true);
  f.get('refreshAmount').value='0';await f.change('refreshAmount');assert.equal(f.messages.filter(msg=>msg.action==='refresh').length,2);assert.equal(f.get('refreshDetail').hidden,false);
});
test('category, independent distraction flag and blocking changes autosave; incomplete times do not replace a rule',async()=>{
  const f=fixture();await f.c.setupSiteControls({id:1});
  f.get('siteDistracting').checked=true;await f.change('siteDistracting');
  const activity=f.messages.find(msg=>msg.action==='activity');assert.equal(activity.category,'Social');assert.equal(activity.distracting,true);
  f.get('siteBlockFrom').value='12:';await f.change('siteBlockFrom');assert.equal(f.messages.filter(msg=>msg.action==='blocking').length,0);
  f.get('siteBlockFrom').value='12:30';f.get('siteBlockScheduled').checked=true;await f.change('siteBlockFrom');
  assert.equal(f.messages.find(msg=>msg.action==='blocking').rule.from,'12:30');assert.equal(f.get('siteBlockDetail').hidden,true);
});
test('unload checkbox and interval autosave with bounded input',async()=>{
  const f=fixture();await f.c.setupTabUnload({id:1});f.get('unloadEnabled').checked=true;await f.change('unloadEnabled');
  f.get('unloadAmount').value='2';await f.change('unloadAmount');f.get('unloadAmount').value='0';await f.change('unloadAmount');
  assert.deepEqual(f.messages.filter(m=>m.action==='settings').map(m=>[m.enabled,m.seconds]),[[true,900],[true,120]]);assert.equal(f.get('unloadDetail').hidden,false);
});

test('one pause selector per timer sends only that card scope and retains saved site rules',async()=>{
  const f=fixture();await f.c.setupTimerPauses({id:1});
  assert.equal(f.get('reloadPause').value,'none');assert.equal(f.get('unloadPause').value,'none');
  f.get('reloadPause').value='1800';await f.change('reloadPause');
  f.get('unloadPause').value='0';await f.change('unloadPause');
  f.get('reloadPause').value='none';await f.change('reloadPause');
  assert.deepEqual(f.messages.filter(m=>m.action==='override').map(m=>[m.kind,m.mode,m.seconds,m.expectedDomain]),[
    ['reload','pause',1800,'example.org'],['unload','pause',0,'example.org'],['reload','none',0,'example.org']
  ]);
  assert.equal(f.messages.some(m=>m.action==='settings'||m.action==='refresh'),false);
  const restored=fixture(undefined,{reload:{seconds:1800,until:1234},unload:{seconds:0,until:0}});
  await restored.c.setupTimerPauses({id:1});
  assert.equal(restored.get('reloadPause').value,'1800');assert.equal(restored.get('unloadPause').value,'0');
});

test('allowance recovery errors do not disable or detach other site settings',async()=>{
  const f=fixture({error:'Site allowances need recovery. Existing records were retained.'});await f.c.setupSiteControls({id:1});
  assert.equal(f.get('siteDomain').textContent,'example.org');assert.equal(f.get('siteCategory').disabled,false);
  assert.match(f.get('siteAllowanceError').textContent,/recovery/);assert.equal(f.get('siteAllowanceEnabled').disabled,true);
  f.get('siteCategory').value='Gaming';await f.change('siteCategory');
  f.get('siteBlockFocus').checked=true;await f.change('siteBlockFocus');
  assert.equal(f.messages.find(m=>m.action==='activity').category,'Gaming');assert.equal(f.messages.find(m=>m.action==='blocking').rule.focus,true);
});
test('rapid changes dispatch immediately and an older failed reply cannot overwrite newer success',async()=>{
  const f=fixture(),pending=[];
  const save=f.c.popupAutoSave(value=>new Promise((resolve,reject)=>pending.push({value,resolve,reject})),f.get('error'));
  const first=save({category:'Social',distracting:false}),second=save({category:'Social',distracting:true});
  assert.equal(pending.length,2);pending[1].resolve();await second;pending[0].reject(new Error('Old failure'));await first;
  assert.equal(f.get('error').hidden,true);
});
test('compact cards have no save buttons or explanatory footers and daily controls share a row',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../popup/popup.html'),'utf8');
  assert.doesNotMatch(html,/refreshStartBtn|refreshPauseBtn|refreshForgetBtn|siteBlockSave|Save interval|Save blocking rules/);
  assert.match(html,/block-daily-row[^\n]*siteBlockScheduled[^\n]*siteBlockFrom[^\n]*siteBlockUntil/);
  for(const id of ['refreshDetail','siteActivityDetail','siteBlockDetail'])assert.match(html,new RegExp(`id="${id}"[^>]*hidden></p>`));
});
