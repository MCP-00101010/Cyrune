const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'browser-activity-widget.js'),'utf8');

test('activity ranges use local calendar days across both daylight-saving transitions',()=>{
  const original=process.env.TZ;
  process.env.TZ='Europe/London';
  try {
    const context=vm.createContext({WIDGET_REGISTRY:{},Map,WeakMap,Date});vm.runInContext(source,context);
    for(const [timestamp,today,week,year] of [
      ['2026-03-30T00:30:00+01:00','2026-03-30','2026-03-24','2025-03-31'],
      ['2026-10-26T23:30:00+00:00','2026-10-26','2026-10-20','2025-10-27']
    ]) for(const [days,from] of [[1,today],[7,week],[365,year]]) {
      const range=context._browserActivityDateRange(days,Date.parse(timestamp));
      assert.equal(range.from,from);assert.equal(range.to,today);
    }
  } finally {if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});

test('activity pie charts preserve omitted time, bound legends and handle empty reports',()=>{
  const context=vm.createContext({WIDGET_REGISTRY:{},Map,WeakMap});vm.runInContext(source,context);
  const escape=value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;');
  const minutes=value=>`${value/60000} min`;
  const rows=Array.from({length:12},(_,i)=>({name:`site-${i}`,milliseconds:60000}));
  rows[0].name='<unsafe>';
  const chart=context._browserActivityPie(rows,900000,escape,minutes);
  assert.equal((chart.match(/class="activity-row"/g)||[]).length,10);
  assert.match(chart,/Others: 6 min \(40.0%\)/);
  assert.match(chart,/<small>\(6.7%\)<\/small>/);
  assert.match(chart,/&lt;unsafe&gt;/);
  assert.doesNotMatch(chart,/<unsafe>/);
  const exact=context._browserActivityPie(rows.slice(0,10),600000,escape,minutes);
  assert.match(exact,/site-9/);
  assert.doesNotMatch(exact,/Other/);
  assert.doesNotMatch(context._browserActivityPie([],0,escape,minutes),/conic-gradient/);
  assert.doesNotMatch(source,/sitesMode|categoriesMode|data-activity-chart/);
  const sorted=context._browserActivityPie([{name:'small',milliseconds:60000},{name:'largest',milliseconds:120000}],180000,escape,minutes);
  assert.ok(sorted.indexOf('largest:')<sorted.indexOf('small:'));
});

test('Browser Activity supports board and sidebar with fixed Relay authority and portable empty data',()=>{
  const context=vm.createContext({WIDGET_REGISTRY:{},Map});vm.runInContext(source,context);
  const descriptor=context.WIDGET_REGISTRY.browserActivity;
  assert.deepEqual([...descriptor.allowedIn],['column','navpane']);
  assert.equal(descriptor.capabilities.extensionRelay.optional,true);
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.defaultData)),{});
  assert.match(source,/WidgetSDK\.productivity\.request\('browserActivity', 'activity'/);
  assert.doesNotMatch(source,/browser\.(tabs|idle|windows)|fetch\(|nativeHost/);
});

test('Browser Activity retains view choices without storing browsing reports in widget cache',()=>{
  assert.match(source,/cache\.set\('browserActivity', widget.id, 'view', view\)/);
  assert.doesNotMatch(source,/cache\.set\([^\n]*'report'/);
  assert.match(source,/if \(offline\) return/);
  assert.match(source,/window.confirm\('Delete recorded activity/);
  const css=fs.readFileSync(path.join(__dirname,'browser-activity-widget.css'),'utf8');
  assert.match(css,/\.activity-toolbar[^}]*padding-right:var\(--widget-action-rail-width,26px\)/);
  assert.match(source,/classList.add\('browser-activity-widget'\)/);
  assert.doesNotMatch(source,/element.className\s*=/);
});

test('global preference drafts do not save on render or Cancel and commit only changed fields on Done',async()=>{
  const calls=[],state={activity:{idleSeconds:120,retentionDays:30,budgetMinutes:0}},nodes=new Map();
  const container={innerHTML:'',querySelector:selector=>{
    if(!nodes.has(selector))nodes.set(selector,{value:'',disabled:true,textContent:''});return nodes.get(selector);
  }};
  const context=vm.createContext({WIDGET_REGISTRY:{},Map,WeakMap,WidgetSDK:{productivity:{request:async(...args)=>{calls.push(args);return structuredClone(state);}}}});
  vm.runInContext(source,context);const descriptor=context.WIDGET_REGISTRY.browserActivity,widget={config:{},data:{}};
  descriptor.renderSettings(widget,container);await new Promise(resolve=>setImmediate(resolve));
  container.querySelector('[data-activity-setting="idleSeconds"]').value='300';
  assert.equal(calls.filter(args=>args[2]==='settings').length,0,'editing and cancelling have no service mutation');
  descriptor.renderSettings(widget,container);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(container.querySelector('[data-activity-setting="idleSeconds"]').value,'120');
  container.querySelector('[data-activity-setting="retentionDays"]').value='7';
  await descriptor.beforeSettingsCommit(widget,container);
  const write=calls.find(args=>args[2]==='settings');assert.deepEqual(JSON.parse(JSON.stringify(write[3])),{retentionDays:7});
  assert.deepEqual(widget,{config:{},data:{}});
});
