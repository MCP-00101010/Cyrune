const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
const PREFS = 'cyruneBrowserUtilitiesV1', REFRESH = 'cyruneRefreshDomainsV2';
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(stored = {}) {
  const tabs = new Map([[1, { id: 1, windowId: 10, index: 0, highlighted: true, status: 'complete', title: 'Example', url: 'https://example.org/view?q=one#anchor' }]]);
  const alarms = new Map(), menus = new Map(), events = {}, clipboard = [], reloads = [], opened = [], imports = [];
  const pageActions = new Map();
  const action = tabId => {
    if (!pageActions.has(tabId)) pageActions.set(tabId, {});
    return pageActions.get(tabId);
  };
  let messageResult = { dirty: false }, failWrite = false, clock = Date.now();
  class Clock extends Date { static now() { return clock; } }
  const clone = value => JSON.parse(JSON.stringify(value));
  const event = name => ({ addListener(fn) { events[name] = fn; } });
  const browser = {
    runtime: { id: 'relay', getURL: name => `moz-extension://relay/${name}` },
    storage: { local: { get: async () => clone(stored), set: async value => {
      if (failWrite) throw new Error('Disk full');
      Object.assign(stored, clone(value));
    } } },
    tabs: { get: async id => { if (!tabs.has(id)) throw new Error('Closed'); return clone(tabs.get(id)); },
      query: async filter => [...tabs.values()].filter(tab => (filter.windowId === undefined || tab.windowId === filter.windowId)
        && (!filter.highlighted || tab.highlighted)),
      reload: async id => reloads.push(id), executeScript: async () => [],
      sendMessage: async () => typeof messageResult === 'function' ? messageResult() : messageResult,
      create: async options => opened.push(options), onUpdated: event('updated'), onRemoved: event('removed'), onActivated: event('activated') },
    alarms: { clear: async name => alarms.delete(name), create: (name, options) => alarms.set(name, options),
      getAll: async () => [...alarms.keys()].map(name => ({ name })), onAlarm: event('alarm') },
    browserAction: { setBadgeText: async () => {}, setTitle: async () => {} },
    pageAction: { show: async id => { action(id).shown = true; }, hide: async id => { action(id).shown = false; },
      setTitle: async ({ tabId, title }) => { action(tabId).title = title; },
      setIcon: async ({ tabId, imageData }) => { action(tabId).icon = imageData; } },
    menus: { create: options => menus.set(options.id, options), remove: async id => {
      menus.delete(id);
      for (const [child, options] of menus) if (options.parentId === id) menus.delete(child);
    }, onClicked: event('clicked') },
    notifications: { create: async () => {} }
  };
  const context = vm.createContext({ URL, browser, Date: Clock,
    document: { createElement: () => ({ getContext: () => ({ scale() {}, beginPath() {}, arc() {}, stroke() {}, moveTo() {}, lineTo() {}, getImageData: () => ({}) }) }) },
    navigator: { clipboard: { writeText: async text => clipboard.push(text) } },
    tabToImportItem: link => ({ ...link, type: 'bookmark', id: 'fixture' }),
    sendImportItemsToMorpheus: async (items, source) => { imports.push({ items, source }); return { ok: true, queued: true }; } });
  vm.runInContext(source.slice(source.indexOf('const RELAY_PUBLIC_SUFFIXES'), source.indexOf('function createSiteControls(')),context);
  vm.runInContext(source.slice(source.indexOf('const browserUtilities = (() => {'), source.indexOf('function setupBookmarkImportMenu()')), context);
  const api = vm.runInContext('browserUtilities', context);
  const request = (action, extra = {}) => api.popup({ action, tabId: 1, ...extra });
  const refresh = (mode, seconds = 30) => request('refresh', { mode, seconds, expectedUrl: 'https://example.org/view?q=one' });
  return { api, request, refresh, stored, tabs, browser, alarms, menus, events, clipboard, reloads, opened, imports, pageActions,
    message: result => { messageResult = result; }, failWrite: () => { failWrite = true; },advance: ms => { clock += ms; },now:()=>clock };
}

test('selected tabs in every window stay paused; switching away starts a full interval without resetting other background timers',async()=>{
  const f=fixture();f.tabs.get(1).active=true;
  for(const [id,windowId,active] of [[2,10,false],[3,20,true],[4,20,false]])f.tabs.set(id,{...f.tabs.get(1),id,windowId,active});
  await f.api.start();await f.refresh('start',30);
  assert.equal(f.alarms.has('cyrune-refresh:1'),false);assert.equal(f.alarms.has('cyrune-refresh:3'),false);
  const otherDeadline=f.alarms.get('cyrune-refresh:4').when;
  f.advance(60000);await f.api.alarm({name:'cyrune-refresh:1'});assert.deepEqual(f.reloads,[]);
  f.tabs.get(1).active=false;f.tabs.get(2).active=true;f.events.activated({tabId:2,windowId:10});await tick();
  assert.equal(f.alarms.get('cyrune-refresh:1').when,f.now()+30000);
  assert.equal(f.alarms.has('cyrune-refresh:2'),false);assert.equal(f.alarms.has('cyrune-refresh:3'),false);
  assert.equal(f.alarms.get('cyrune-refresh:4').when,otherDeadline);
  f.advance(30000);await f.api.alarm({name:'cyrune-refresh:1'});assert.deepEqual(f.reloads,[1]);
  f.tabs.get(1).active=true;f.tabs.get(2).active=false;f.events.activated({tabId:1,windowId:10});await tick();
  f.advance(60000);await f.api.alarm({name:'cyrune-refresh:1'});assert.deepEqual(f.reloads,[1]);assert.equal(f.alarms.has('cyrune-refresh:1'),false);
});

test('selecting a background tab during the form probe prevents its pending automatic reload',async()=>{
  const f=fixture();await f.refresh('start');f.message(()=>{f.tabs.get(1).active=true;return {dirty:false};});
  await f.api.alarm({name:'cyrune-refresh:1'});assert.deepEqual(f.reloads,[]);assert.equal(f.alarms.has('cyrune-refresh:1'),false);
});

test('refresh saves whole domains, restores after restart/reopen, and retains paused intervals', async () => {
  const f = fixture();
  await f.api.start();
  await f.refresh('start', 300);
  assert.equal(f.stored[REFRESH].pages[0].domain, 'example.org');
  assert.equal(f.alarms.has('cyrune-refresh:1'), true);
  f.tabs.delete(1);
  f.events.removed(1);
  assert.equal(f.alarms.has('cyrune-refresh:1'), false);
  const resumed = fixture(f.stored);
  await resumed.api.start();
  assert.equal((await resumed.request('state')).rule.seconds, 300);
  assert.equal(resumed.alarms.has('cyrune-refresh:1'), true);
  await resumed.refresh('pause', 300);
  assert.equal(resumed.alarms.has('cyrune-refresh:1'), false);
  assert.equal(resumed.stored[REFRESH].pages[0].seconds, 300);
  const paused = fixture(resumed.stored);
  await paused.api.start();
  assert.equal(paused.alarms.size, 0);
  await paused.refresh('forget');
  assert.deepEqual(paused.stored[REFRESH].pages, []);
});

test('address-bar clock follows the current page and exposes the refresh-only popup', async () => {
  const f = fixture();
  await f.api.start();
  assert.equal(f.pageActions.get(1).shown, true);
  assert.match(f.pageActions.get(1).title, /Timer & Activity Tracker/);
  await f.refresh('start', 60);
  assert.match(f.pageActions.get(1).title, /every 60s/);
  await f.refresh('pause', 60);
  assert.match(f.pageActions.get(1).title, /paused/);
  f.tabs.get(1).url = 'file:///local.html';
  await f.api.syncTab(1);
  assert.equal(f.pageActions.get(1).shown, false);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  assert.equal(manifest.page_action.default_popup, 'popup/popup.html?view=refresh');
});

test('alarms skip edited top pages or child frames, discarded/loading tabs, and navigated URLs', async () => {
  const f = fixture();
  await f.api.start();
  await f.refresh('start');
  await f.api.alarm({ name: 'cyrune-refresh:1' });
  assert.deepEqual(f.reloads, [1]);
  f.message({ dirty: true });
  await f.api.alarm({ name: 'cyrune-refresh:1' });
  assert.equal(f.reloads.length, 1);
  f.message({ dirty: false });
  f.api.formEdited({ id: 'relay', tab: { id: 1, url: f.tabs.get(1).url }, url: 'https://frame.example' });
  await f.api.alarm({ name: 'cyrune-refresh:1' });
  assert.equal(f.reloads.length, 1);
  f.events.updated(1, { status: 'loading' });
  f.tabs.get(1).status = 'loading';
  await tick();
  await f.api.alarm({ name: 'cyrune-refresh:1' });
  assert.equal(f.reloads.length, 1);
  f.tabs.get(1).status = 'complete';
  await f.api.syncTab(1);
  f.tabs.get(1).discarded = true;
  await f.api.alarm({ name: 'cyrune-refresh:1' });
  assert.equal(f.reloads.length, 1);
  f.tabs.get(1).discarded = false;
  f.tabs.get(1).url = 'https://other.org/view?q=two';
  await f.api.alarm({ name: 'cyrune-refresh:1' });
  assert.equal(f.reloads.length, 1);
  assert.equal(f.alarms.size, 0);
});

test('navigation during dirty-state lookup cannot reload a different page', async () => {
  const f = fixture();
  await f.refresh('start');
  f.message(() => { f.tabs.get(1).url = 'https://different.example/'; return { dirty: false }; });
  await f.api.alarm({ name: 'cyrune-refresh:1' });
  assert.equal(f.reloads.length, 0);
});

test('reload status records completion rather than a request and exposes protected-form skips',async()=>{
  const f=fixture();await f.api.start();await f.refresh('start');
  await f.api.alarm({name:'cyrune-refresh:1'});assert.equal((await f.request('state')).status.lastAt,0);assert.equal((await f.request('state')).status.reason,'Reloading');
  f.events.updated(1,{status:'complete'});await tick();assert.ok((await f.request('state')).status.lastAt>0);
  f.message({dirty:true});await f.api.alarm({name:'cyrune-refresh:1'});assert.equal((await f.request('state')).status.lastSkip,'Edited form');
});

test('refresh validates intervals, stale popup targets and private pages without writing', async () => {
  const f = fixture();
  for (const seconds of [0, 9, 86401, 1.5, '30', NaN]) await assert.rejects(f.refresh('start', seconds), /interval/);
  await assert.rejects(f.request('refresh', { mode: 'start', seconds: 30, expectedUrl: 'https://old.example' }), /navigated/);
  f.tabs.get(1).incognito = true;
  await assert.rejects(f.refresh('start'), /non-private/);
  assert.equal(f.stored[REFRESH], undefined);
  assert.equal((await f.request('state')).eligible, false);
});

test('failed writes retain saved timer and unsupported schemas are not overwritten', async () => {
  const f = fixture();
  await f.refresh('start', 60);
  f.failWrite();
  await assert.rejects(f.refresh('pause', 60), /Disk full/);
  assert.equal((await f.request('state')).rule.enabled, true);
  const invalid = fixture({ [REFRESH]: { schemaVersion: 99, pages: [] } });
  await assert.rejects(invalid.request('state'), /compatible/);
  assert.equal(invalid.stored[REFRESH].schemaVersion, 99);
});

test('protected pages cannot create a saved refresh rule without an attached web handler', async () => {
  const f = fixture();
  f.message(null);
  await assert.rejects(f.refresh('start'), /does not allow Relay/);
  assert.equal(f.stored[REFRESH], undefined);
  assert.equal(f.alarms.size, 0);
});

test('copy formats escape Markdown and preserve tab order while excluding private and non-web tabs', async () => {
  const f = fixture();
  f.tabs.get(1).title = 'A [title]';
  f.tabs.set(2, { id: 2, windowId: 10, index: 1, url: 'https://two.example/a(b)', title: 'Second', highlighted: true });
  f.tabs.set(3, { id: 3, windowId: 10, index: 2, url: 'file:///private.txt', title: 'Local', highlighted: true });
  f.tabs.set(4, { id: 4, windowId: 10, index: 3, url: 'https://private.example', incognito: true, highlighted: true });
  await f.request('copyTabs', { scope: 'selected', format: 'markdown' });
  assert.equal(f.clipboard[0], '[A \\[title\\]](https://example.org/view?q=one#anchor)\n[Second](https://two.example/a\\(b\\))');
  assert.equal(f.api.webUrl('https://user:password@example.org'), '');
  assert.equal(f.api.normalizeLinks([{ url: 'javascript:alert(1)' }, { url: 'https://a.example', title: 'First' }, { url: 'https://a.example', title: 'Duplicate' }]).length, 1);
  await assert.rejects(f.request('copyTabs', { scope: 'all', format: 'url' }), /scope/);
});

test('selected-link actions use bounded frame-scoped reads and the existing acknowledged import queue', async () => {
  const f = fixture();
  await f.api.start();
  f.message({ links: [{ url: 'https://a.example', title: 'A' }, { url: 'https://a.example', title: 'Duplicate' }, { url: 'file:///private' }] });
  const click = action => f.api.menuClick({ menuItemId: 'cyrune-utility-selection-' + action, frameId: 7 }, f.tabs.get(1));
  await click('url');
  assert.equal(f.clipboard[0], 'https://a.example/');
  await click('open');
  assert.equal(f.opened.length, 1);
  assert.equal(f.opened[0].active, false);
  assert.equal(f.opened[0].index, 1);
  const imported = await click('import');
  assert.equal(imported.queued, true);
  assert.equal(f.imports[0].source, 'selected-links');
  assert.equal(f.imports[0].items.length, 1);
  f.message({ links: Array.from({ length: 21 }, (_, n) => ({ url: `https://a.example/${n}` })) });
  await assert.rejects(click('open'), /at most 20/);
  assert.equal(f.opened.length, 1, 'over-limit requests must not open a partial batch');
  await f.request('preferences', { name: 'collectLinks', value: false });
  await assert.rejects(click('url'), /disabled/);
  assert.equal(f.menus.has('cyrune-utility-selection-url'), false);
});

test('restoration controls are independent and cross-origin frames follow the top site exception', async () => {
  const f = fixture();
  const sender = { id: 'relay', tab: f.tabs.get(1), url: 'https://frame.example' };
  assert.equal((await f.api.webState(sender)).restoreCopy, false);
  await f.request('preferences', { name: 'restoreCopy', value: true });
  assert.equal((await f.api.webState(sender)).restoreCopy, true);
  assert.equal((await f.api.webState(sender)).restorePaste, false);
  await f.request('preferences', { name: 'siteException', value: true });
  assert.equal((await f.api.webState(sender)).restoreCopy, false);
  assert.deepEqual(JSON.parse(JSON.stringify(await f.api.webState({ ...sender, id: 'forged' }))), {});
  assert.equal(f.stored[PREFS].exceptions[0], 'example.org');
});

test('popup mutation route rejects ordinary pages and limits clock popup authority', () => {
  let calls = 0, response;
  const start = source.indexOf("    case 'CYRUNE_BROWSER_UTILITIES':");
  const end = source.indexOf("    case 'CYRUNE_NATIVE_MENU_STATE':", start);
  const c = vm.createContext({ browser: { runtime: { id: 'relay', getURL: file => 'moz-extension://relay/' + file } },
    browserUtilities: { popup() { calls++; return Promise.resolve({ ok: true }); }, formEdited() {} } });
  vm.runInContext(`function route(msg,sender,sendResponse){switch(msg.type){${source.slice(start, end)}}}`, c);
  c.route({ type: 'CYRUNE_BROWSER_UTILITIES' }, { id: 'relay', url: 'https://example.org', tab: { id: 1 } }, value => { response = value; });
  assert.equal(response.ok, false);
  assert.equal(calls, 0);
  c.route({ type: 'CYRUNE_BROWSER_UTILITIES', action: 'preferences' },
    { id: 'relay', url: 'moz-extension://relay/popup/popup.html?view=refresh' }, () => {});
  assert.equal(calls, 0);
  c.route({ type: 'CYRUNE_BROWSER_UTILITIES', action: 'state' },
    { id: 'relay', url: 'moz-extension://relay/popup/popup.html?view=refresh' }, () => {});
  assert.equal(calls, 1);
});

 test('domain refresh includes new paths and subdomains and migration pauses conflicting old page rules',async()=>{
  const f=fixture();await f.refresh('start',60);
  f.tabs.set(2,{id:2,url:'https://news.example.org/another?q=two',status:'complete'});await f.api.syncTab(2);
  assert.equal(f.alarms.has('cyrune-refresh:2'),true);
  const legacy={schemaVersion:1,pages:[{url:'https://www.example.org/a',seconds:30,enabled:true},{url:'https://example.org/b',seconds:60,enabled:true}]};
  const migrated=fixture({cyruneRefreshPagesV1:legacy});await migrated.api.start();
  assert.equal(migrated.stored[REFRESH].pages.length,1);assert.equal(migrated.stored[REFRESH].pages[0].enabled,false);
  assert.deepEqual(migrated.stored.cyruneRefreshPagesV1,legacy);
 });

test('automatic timer edits preserve input order across delayed tab lookups',async()=>{
  const f=fixture(),get=f.browser.tabs.get;let calls=0,release;
  f.browser.tabs.get=async id=>{if(++calls===1)await new Promise(resolve=>{release=resolve;});return get(id);};
  const first=f.refresh('start',30),second=f.refresh('pause',60);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);release();await Promise.all([first,second]);
  const state=await f.request('state');assert.equal(state.rule.seconds,60);assert.equal(state.rule.enabled,false);
});
