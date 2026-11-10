const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const key = 'cyruneNativeContextMenuV1';

test('tab markers are extension-only, temporary on reload and reversible when unloading is cancelled',async()=>{
  let handler,timer;const document={title:'Feed',readyState:'loading',querySelectorAll:()=>[],addEventListener(){}};
  vm.runInNewContext(read('content.js'),{document,setTimeout:fn=>{timer=fn;return 1;},clearTimeout(){},window:{location:new URL('https://example.org/feed'),addEventListener(){}},
    browser:{runtime:{id:'relay',onMessage:{addListener:fn=>{handler=fn;}},sendMessage:async()=>({})},storage:{onChanged:{addListener(){}}}}});
  await handler({type:'CYRUNE_UTILITY_FEEDBACK',mode:'unloaded'},{id:'other'});assert.equal(document.title,'Feed');
  await handler({type:'CYRUNE_UTILITY_FEEDBACK',mode:'unloaded'},{id:'relay'});assert.equal(document.title,'💤 Feed');
  await handler({type:'CYRUNE_UTILITY_FEEDBACK',mode:'clear'},{id:'relay'});assert.equal(document.title,'Feed');
  await handler({type:'CYRUNE_UTILITY_FEEDBACK',mode:'reloaded'},{id:'relay'});assert.equal(document.title,'↻ Feed');timer();assert.equal(document.title,'Feed');
  await handler({type:'CYRUNE_UTILITY_FEEDBACK',mode:'reloaded'},{id:'relay'});document.title='New site title';timer();assert.equal(document.title,'New site title');
});

test('an untouched app editor and synthetic site events must not block automatic reload or unloading',async()=>{
  const events={};let handler;
  const field={isContentEditable:true,textContent:'Write a comment'};
  const c=vm.createContext({URL,window:{location:new URL('https://example.org/feed'),addEventListener:(name,fn)=>{events[name]=fn;}},
    document:{readyState:'complete',querySelectorAll:()=>[field],addEventListener(){}},
    browser:{runtime:{id:'relay',onMessage:{addListener:fn=>{handler=fn;}},sendMessage:async()=>({})},storage:{onChanged:{addListener(){}}}}});
  vm.runInContext(read('content.js'),c);await tick();
  assert.equal((await handler({type:'CYRUNE_UTILITY_DIRTY'},{id:'relay'})).dirty,false,'an untouched editor is not an unsaved user edit');
  events.input({isTrusted:false,target:field});
  assert.equal((await handler({type:'CYRUNE_UTILITY_DIRTY'},{id:'relay'})).dirty,false,'site-generated input events are not user edits');
  events.input({isTrusted:true,target:field});
  assert.equal((await handler({type:'CYRUNE_UTILITY_DIRTY'},{id:'relay'})).dirty,true,'real typing remains protected');
});

test('form probes detect pre-injection edits and retain frame edit protection without exporting values',async()=>{
  for(const field of [
    {tagName:'INPUT',type:'text',value:'private draft',defaultValue:''},
    {tagName:'TEXTAREA',value:'private draft',defaultValue:''},
    {tagName:'INPUT',type:'file',files:[{}]}
  ]){
    const events={},sent=[];let handler;
    const c=vm.createContext({URL,window:{location:new URL('https://frame.example.org'),addEventListener:(name,fn)=>{events[name]=fn;}},
      document:{readyState:'complete',querySelectorAll:()=>[field],addEventListener(){}},
      browser:{runtime:{id:'relay',onMessage:{addListener:fn=>{handler=fn;}},sendMessage:async message=>{sent.push(message);return {};}},storage:{onChanged:{addListener(){}}}}});
    vm.runInContext(read('content.js'),c);await tick();
    assert.equal((await handler({type:'CYRUNE_UTILITY_DIRTY'},{id:'relay'})).dirty,true);
    assert.deepEqual(JSON.parse(JSON.stringify(sent.find(m=>m.type==='CYRUNE_UTILITY_FORM_EDITED'))),{type:'CYRUNE_UTILITY_FORM_EDITED'});
    assert.doesNotMatch(JSON.stringify(sent),/private draft/);assert.equal(handler({type:'CYRUNE_UTILITY_DIRTY'},{id:'other'}),undefined);
    field.value=field.defaultValue;events.input({isTrusted:true});assert.equal((await handler({type:'CYRUNE_UTILITY_DIRTY'},{id:'relay'})).dirty,true);
  }
});

test('web handler preserves the native default, follows live settings and never creates a client bridge', async () => {
  const listeners = {}, requests = [];
  let enabled = false, changed;
  const context = vm.createContext({
    window: { location: new URL('https://example.org/page'), addEventListener(type, fn, options) {
      assert.equal(listeners[type], undefined, 'reinjection must be idempotent');
      listeners[type] = fn;
      if (type === 'contextmenu') assert.equal(options.capture, true);
    } },
    document: { addEventListener() {}, querySelectorAll: () => [], querySelector() { throw new Error('Web pages must not inspect client markers'); } },
    browser: {
      runtime: { onMessage: { addListener() {} }, sendMessage: async message => { requests.push(message); return { enabled }; } },
      storage: { onChanged: { addListener(fn) { changed = fn; } } }
    }
  });
  vm.runInContext(read('content.js'), context);
  await tick();
  let stopped = 0;
  const event = { isTrusted: true, stopImmediatePropagation() { stopped++; },
    preventDefault() { throw new Error('Must preserve Firefox native menu'); } };
  listeners.contextmenu(event);
  assert.equal(stopped, 0, 'default is off');
  enabled = true;
  changed({ [key]: {} }, 'local');
  await tick();
  listeners.contextmenu(event);
  assert.equal(stopped, 1);
  listeners.contextmenu({ ...event, isTrusted: false });
  assert.equal(stopped, 1, 'synthetic site events are untouched');
  enabled = false;
  changed({ [key]: {} }, 'local');
  await tick();
  listeners.contextmenu(event);
  assert.equal(stopped, 1, 'turning off restores site handlers immediately');
  vm.runInContext(read('content.js'), context);
  assert.equal(requests.filter(request => request.type === 'CYRUNE_NATIVE_MENU_STATE').length, 3);
  assert.ok(requests.every(request => ['CYRUNE_NATIVE_MENU_STATE', 'CYRUNE_WEB_UTILITIES_STATE'].includes(request.type)));
  assert.equal(listeners.message, undefined);
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.content_scripts[1].run_at, 'document_start');
  assert.equal(manifest.content_scripts[1].all_frames, true);
});

test('late settings reads cannot overwrite a newer decision and failures disable interception', async () => {
  const pending = [], listeners = {};
  let changed;
  vm.runInNewContext(read('content.js'), {
    window: { location: new URL('https://example.org'), addEventListener(type, fn) { listeners[type] = fn; } },
    document: { addEventListener() {}, querySelectorAll: () => [] },
    browser: { runtime: { onMessage: { addListener() {} }, sendMessage: message => message.type === 'CYRUNE_WEB_UTILITIES_STATE'
      ? Promise.resolve({}) : new Promise((resolve, reject) => pending.push({ resolve, reject })) },
      storage: { onChanged: { addListener(fn) { changed = fn; } } } }
  });
  changed({ [key]: {} }, 'local');
  pending[1].resolve({ enabled: false });
  pending[0].resolve({ enabled: true });
  await tick();
  const event = { isTrusted: true, stopImmediatePropagation() { throw new Error('Must be disabled'); } };
  listeners.contextmenu(event);
  listeners.pageshow();
  pending[2].reject(new Error('Extension unavailable'));
  await tick();
  listeners.contextmenu(event);
});

test('frame menu state uses Firefox top-tab identity and returns only a boolean', async () => {
  let settings = { enabled: true, exceptions: ['example.org'] }, reads = 0;
  const source = read('background.js');
  const start = source.indexOf("    case 'CYRUNE_NATIVE_MENU_STATE':");
  const end = source.indexOf("    case 'USE_RELAY_STORAGE':", start);
  const context = vm.createContext({ URL, browser: { runtime: { id: 'relay' }, storage: { local: {
    async get() { reads++; return { [key]: settings }; }
  } } } });
  vm.runInContext(`function route(msg, sender, sendResponse) { switch (msg.type) {${source.slice(start, end)}} }`, context);
  const request = sender => new Promise(resolve => context.route({ type: 'CYRUNE_NATIVE_MENU_STATE', hostname: 'forged.org' }, sender, resolve));
  const sender = { id: 'relay', url: 'https://embedded.example/frame', tab: { id: 3, url: 'https://example.org/page' } };
  assert.deepEqual(JSON.parse(JSON.stringify(await request(sender))), { enabled: false });
  settings = { enabled: true, exceptions: [] };
  assert.equal((await request(sender)).enabled, true);
  assert.equal((await request({ ...sender, id: 'other' })).enabled, false);
  assert.equal((await request({ ...sender, tab: { url: 'file:///client.html' } })).enabled, false);
  assert.equal(reads, 2, 'unsupported senders cannot read settings');
  settings = { enabled: 'true' };
  assert.equal((await request(sender)).enabled, false);
});

async function popup(url = 'https://example.org/page') {
  let stored = {}, fail = false;
  const elements = Object.fromEntries(['nativeMenuEnabled', 'nativeMenuSiteException', 'nativeMenuDetail'].map(id => [id, {
    disabled: true, checked: false, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }
  }]));
  const injections = [];
  const context = vm.createContext({ URL, document: { getElementById: id => elements[id] }, browser: {
    storage: { local: { get: async () => stored, set: async value => {
      if (fail) throw new Error('Storage unavailable');
      stored = value;
    } } },
    tabs: { query: async () => [{ id: 7, url: 'https://example.org' }], executeScript: async (id, options) => injections.push({ id, options }) }
  } });
  const source = read('popup/popup.js');
  vm.runInContext(source.slice(0, source.lastIndexOf('main();')), context);
  await context.setupNativeMenuControls({ url });
  return { elements, injections, stored: () => stored[key], fail: () => { fail = true; } };
}

test('popup persists opt-in and exact-host exceptions, applies to open tabs, and rolls back failed saves', async () => {
  const p = await popup();
  const toggle = p.elements.nativeMenuEnabled, exception = p.elements.nativeMenuSiteException;
  assert.equal(toggle.checked, false);
  assert.equal(exception.disabled, true);
  toggle.checked = true;
  await toggle.listeners.change();
  assert.equal(p.stored().enabled, true);
  assert.equal(exception.disabled, false);
  assert.equal(p.injections[0].options.allFrames, true);
  exception.checked = true;
  await exception.listeners.change();
  assert.deepEqual(Array.from(p.stored().exceptions), ['example.org']);
  exception.checked = false;
  await exception.listeners.change();
  assert.deepEqual(Array.from(p.stored().exceptions), []);
  p.fail();
  toggle.checked = false;
  await toggle.listeners.change();
  assert.equal(toggle.checked, true);
  assert.match(p.elements.nativeMenuDetail.textContent, /Storage unavailable/);
  const local = await popup('about:config');
  assert.equal(local.elements.nativeMenuEnabled.disabled, false);
  assert.equal(local.elements.nativeMenuSiteException.disabled, true);
});
