// Browser API fixture around complete production scripts and real native pipes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { webcrypto } = require('node:crypto');
const [root, scenario, python] = process.argv.slice(2);
const repo = path.resolve(__dirname, '../..');
const source = name => fs.readFileSync(path.join(repo, name), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const pageUrl = pathToFileURL(path.join(repo, 'Portal/index.html')).href;
const sender = { tab: { id: 7, url: pageUrl }, frameId: 0, url: pageUrl };
const ports = [], nativeRequests = [], pageReplies = [], timers = new Set();
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); }, removeListener(fn) { this.listeners = this.listeners.filter(value => value !== fn); } });
const setTimer = (fn, delay, ...args) => { const timer = setTimeout(() => { timers.delete(timer); fn(...args); }, delay); timers.add(timer); return timer; };
const clearTimer = timer => { clearTimeout(timer); timers.delete(timer); };
function nativePort() {
  const child = spawn(python, ['-B', path.join(__dirname, 'catalogue_native_fixture.py'), root, scenario], { windowsHide: true });
  let buffer = Buffer.alloc(0), ended = false;
  const port = { onMessage: event(), onDisconnect: event(), child,
    disconnect() { child.stdin.end(); },
    postMessage(message) {
      nativeRequests.push(clone(message));
      if (scenario === 'save-conflict' && message.type === 'PORTAL_DATABASE_WRITE') {
        const filename = path.join(root, 'portal.json');
        fs.writeFileSync(filename, JSON.stringify({ ...JSON.parse(fs.readFileSync(filename)), hubName: 'Concurrent edit' }));
      }
      const body = Buffer.from(JSON.stringify(message)), size = Buffer.alloc(4); size.writeUInt32LE(body.length);
      child.stdin.write(Buffer.concat([size, body]));
    } };
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  child.stdin.on('error', () => {});
  child.stdout.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
      const length = buffer.readUInt32LE(0), message = JSON.parse(buffer.subarray(4, length + 4));
      buffer = buffer.subarray(length + 4); port.onMessage.listeners.forEach(fn => fn(message));
    }
  });
  child.on('exit', () => { if (!ended) { ended = true; port.onDisconnect.listeners.forEach(fn => fn()); } });
  ports.push(port); return port;
}
async function main() {
  const storage = new Map(), onBackground = event();
  const browser = {
    runtime: { id: 'workflow-fixture', getManifest: () => ({ version: 'fixture' }), getURL: value => `moz-extension://fixture/${value}`,
      onMessage: onBackground, connectNative: nativePort,
      sendNativeMessage: async (_name, message) => new Promise((resolve, reject) => {
        const port = nativePort(); port.onMessage.addListener(value => { resolve(value); port.disconnect(); });
        port.onDisconnect.addListener(() => reject(new Error('Native process disconnected'))); port.postMessage(message);
      }) },
    extension: { isAllowedFileSchemeAccess: async () => true },
    storage: { local: { get: async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : [...storage.keys()])
      .filter(key => storage.has(key)).map(key => [key, clone(storage.get(key))])),
      set: async values => Object.entries(values).forEach(([key, value]) => storage.set(key, clone(value))),
      remove: async keys => (Array.isArray(keys) ? keys : [keys]).forEach(key => storage.delete(key)) } },
    tabs: { query: async () => [], get: async () => sender.tab, sendMessage: async () => ({ ok: true }),
      executeScript: async () => [], onRemoved: event(), onUpdated: event(), onActivated: event() },
    windows: { onFocusChanged: event() },
    alarms: { create() {}, clear: async () => true, onAlarm: event() },
    notifications: { onClicked: event() },
    contextMenus: { create() {}, removeAll: async () => {}, onClicked: event() }, commands: { onCommand: event() }
  };
  const common = { console, URL, TextEncoder, TextDecoder, Uint8Array, atob, btoa, Blob, DecompressionStream,
    crypto: webcrypto, structuredClone, setTimeout: setTimer, clearTimeout: clearTimer, AbortController };
  const background = vm.createContext({ ...common, browser });
  let backgroundSource = source('Relay/background.js');
  if (scenario === 'closed-gate') backgroundSource = backgroundSource.replace("  'arcade-catalogue': 1,", '');
  vm.runInContext(backgroundSource, background, { filename: 'Relay/background.js' });
  await vm.runInContext('ensureNativeStorageReady()', background);
  const send = message => new Promise(resolve => onBackground.listeners[0](clone(message), sender, resolve));

  const windowEvents = new Map();
  const window = { location: { href: pageUrl, protocol: 'file:' }, innerWidth: 1600,
    addEventListener(type, fn) { const list = windowEvents.get(type) || []; list.push(fn); windowEvents.set(type, list); },
    dispatchEvent() {}, postMessage(data) {
      if (data._res) pageReplies.push(clone(data));
      setImmediate(() => (windowEvents.get('message') || []).forEach(fn => fn({ source: window, data: clone(data) })));
    } };
  const document = { hidden: false, hasFocus: () => true, documentElement: { dataset: {} }, getElementById: () => null,
    querySelector: selector => selector === 'meta[name="morpheus-webhub"]' ? {} : null };
  const content = vm.createContext({ ...common, window, document, browser: { runtime: { sendMessage: send, onMessage: event() } } });
  const protocols = "Object.freeze({ 'portal-relay': 1, 'component-settings': 2 })";
  let contentSource = source('Relay/content.js');
  if (['closed-gate', 'old-content'].includes(scenario)) contentSource = contentSource.replace(/(const PORTAL_CLIENT_PROTOCOLS = )Object\.freeze\(\{[^\n]+\}\)/, '$1' + protocols);
  vm.runInContext(contentSource, content, { filename: 'Relay/content.js' });
  const localCache = new Map(); let undo = [], renders = 0;
  const portal = vm.createContext({ ...common, window, document, getResolvedThemeId: value => value || 'default-dark',
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    localStorage: { getItem: key => localCache.get(key) || null, setItem: (key, value) => localCache.set(key, value), removeItem: key => localCache.delete(key) },
    pushUndoSnapshot: () => undo.push(vm.runInContext('serializeStateSnapshot()', portal)),
    renderContentSurfaces: () => { renders++; }, renderAll() {}, showNotice() {} });
  let bridgeSource = source('Portal/source/bridge.js');
  if (scenario === 'closed-gate') bridgeSource = bridgeSource.replace(/(const CLIENT_PROTOCOLS = )Object\.freeze\(\{[^\n]+\}\)/, '$1' + protocols);
  vm.runInContext(bridgeSource, portal, { filename: 'Portal/source/bridge.js' });
  const bridge = vm.runInContext('bridge', portal); await bridge.whenReady; await tick();
  assert.equal(bridge.storageIsAvailable(), true);
  if (scenario === 'closed-gate') {
    assert.equal(bridge.catalogueIsAvailable(), false);
    await assert.rejects(bridge.searchArcadeCatalogue({}), error => error.code === 'unsupported-protocol');
    assert.equal(nativeRequests.some(value => value.type.startsWith('ARCADE_CATALOGUE')), false); return;
  }
  for (const file of ['state-schema.js', 'state.js', 'game-picker.js']) vm.runInContext(source(`Portal/source/${file}`), portal, { filename: file });
  vm.runInContext(`state.boards = [{ id: 'board', title: 'Games', tabs: [{ id: 'tab', title: 'Games',
    columns: [{ id: 'column', title: 'Chosen', items: [] }, { id: 'other', title: 'Other', items: [] }], inbox: { id: 'inbox', items: [] } }] }];
    state.navItems = [{ id: 'nav', type: 'board', boardId: 'board' }]; state.activeBoardId = 'board'; state.activeTabId = 'tab';`, portal);
  const initial = vm.runInContext('serializeStateSnapshot()', portal);
  fs.writeFileSync(path.join(root, 'portal.json'), initial);
  const loaded = await bridge.loadState();
  portal.baseline = loaded;
  vm.runInContext('state.databasePath = baseline.databasePath; setSharedDiskBaseline(baseline.fileInfo, baseline.databasePath)', portal);
  // Execute Portal's actual pre-insertion storage check, with reload as a
  // fixture boundary (these scenarios do not require a page-wide reload).
  portal.portalReadOnlyMode = false;
  portal.authoritativePortalStorageReady = () => bridge.storageIsAvailable();
  portal.reloadHubData = () => assert.fail('Unexpected authoritative reload in workflow fixture');
  const app = source('Portal/source/app.js');
  vm.runInContext(app.slice(app.indexOf('async function prepareForExternalDelivery('), app.indexOf('function resolveExternalInboxTarget(')), portal);
  const destination = { boardId: 'board', tabId: 'tab', columnId: 'column' };
  const pickerApi = vm.runInContext('arcadeGamePicker', portal);
  const create = () => pickerApi.create({ session: () => bridge.catalogueSession(), uuid: () => webcrypto.randomUUID(),
    search: payload => bridge.searchArcadeCatalogue({ ...payload, groupVersions: scenario === 'scummvm' }), detail: id => bridge.getArcadeCatalogueEntry(id),
    artwork: (id, ref) => bridge.getArcadeCatalogueArtwork(id, ref), bind: payload => bridge.bindArcadeCatalogueEntries(payload),
    prepare: async () => { const result = await portal.prepareForExternalDelivery(); assert.equal(result.ok, true); },
    destination: portal.resolveGamePickerDestination, persist: portal.persistGamePickerBatch }, destination);
  let picker = create(); await picker.search();
  if (scenario === 'scummvm') {
    await picker.search('ScummVM Adventure');
    assert.equal(picker.model.rows.length, 1, picker.model.error);
    assert.match(picker.model.rows[0].editionLabel, /2 versions/);
    picker.toggle(picker.model.rows[0]);
    await picker.confirm();
    assert.equal(picker.model.phase, 'complete', picker.model.error);
    const saved = JSON.parse(fs.readFileSync(path.join(root, 'portal.json')));
    const cards = saved.boards[0].tabs[0].columns[0].items;
    assert.deepEqual(cards.map(card => card.systemId), ['dos']);
    assert.equal(new Set(cards.map(card => card.gameKey)).size, 1);
    assert.doesNotMatch(JSON.stringify(cards), /targetId|engineid|scummvm.ini|fixture.exe|arguments|catalogueId/);
    assert.equal(await bridge.launchGame(cards[0].gameKey), true);
    const versions = await bridge.gameVersions(cards[0].gameKey);
    assert.equal(versions.versions.length, 2);
    const german = versions.versions.find(row => row.languages.includes('de'));
    await bridge.gameVersions(cards[0].gameKey, 'launch', german);
    await bridge.launchGame(cards[0].gameKey);
    await bridge.gameVersions(cards[0].gameKey, 'default', german);
    await bridge.launchGame(cards[0].gameKey);
    const launches = fs.readFileSync(path.join(root, 'launches.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(launches[0].args, [path.join(root, 'fixture.exe'), '--no-console',
      '--config=' + path.join(root, 'scummvm.ini'), '--path=' + path.join(root, 'ScummVM/adventure-en'), 'adventure-en']);
    assert.deepEqual(launches.map(row => row.args.at(-1)), ['adventure-en', 'adventure-de', 'adventure-en', 'adventure-de']);
    assert.equal(launches[0].shell, false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'catalogue-bindings.json'))).schemaVersion, 2);
    assert.equal(nativeRequests.filter(request => request.type === 'ARCADE_CATALOGUE_ENABLE_SCUMMVM').length, 1);
    return;
  }
  if (['old-content', 'old-host', 'old-arcade'].includes(scenario)) {
    assert.equal(picker.model.rows.length, 0); assert.ok(picker.model.error);
    assert.equal(fs.existsSync(path.join(root, 'catalogue-bindings.json')), false);
    assert.equal(fs.readFileSync(path.join(root, 'portal.json'), 'utf8'), initial); return;
  }
  assert.equal(picker.model.rows.length, 50, picker.model.error);
  assert.ok(picker.model.rows.every(value => value.availability === 'available'));
  const variants = picker.model.rows.filter(value => value.title === 'Game 000'); assert.equal(variants.length, 2);
  assert.notEqual(variants[0].hardwareLabel, variants[1].hardwareLabel);
  assert.equal(fs.existsSync(path.join(root, 'catalogue-bindings.json')), false);
  assert.equal(fs.readFileSync(path.join(root, 'portal.json'), 'utf8'), initial);
  picker.toggle(variants[1]); picker.toggle(variants[0]);
  await picker.search('', [], true); assert.equal(picker.model.rows.length, 100); assert.equal(picker.model.selected.size, 2);
  await picker.inspect(variants[0]); assert.equal(picker.model.detail.title, 'Game 000');
  assert.match(picker.model.artwork, /^data:image\/png;base64,/);
  if (scenario === 'reconnect') {
    background.closeCatalogueSession(7); window.postMessage({ _mw: true, _relayReady: true }); await tick();
    await picker.confirm(); assert.equal(picker.model.phase, 'refresh-required');
    assert.equal(fs.existsSync(path.join(root, 'catalogue-bindings.json')), false);
    picker.close(); picker = create(); await picker.search(); picker.toggle(picker.model.rows[0]);
  }
  if (scenario === 'stale-entry') {
    fs.appendFileSync(path.join(root, 'spectrum/game001.tap'), 'changed');
    const current = await bridge.searchArcadeCatalogue({ query: 'Game 000', platformIds: [], pageSize: 50, cursor: '', groupVersions: false });
    const ready = current.entries.find(value => value.hardwareLabel === '48K'); assert.ok(ready);
    picker.toggle(ready); picker.toggle(ready); // Refresh one selection; retain the other stale selection.
  }
  if (scenario === 'lost-column') {
    const bind = bridge.bindArcadeCatalogueEntries;
    bridge.bindArcadeCatalogueEntries = async payload => { const result = await bind(payload); vm.runInContext('state.boards[0].tabs[0].columns[0].locked = true', portal); return result; };
  }
  await picker.confirm(scenario === 'happy');
  if (scenario === 'lost-column') {
    assert.equal(picker.model.phase, 'approved'); assert.equal(undo.length, 0);
    vm.runInContext('state.boards[0].tabs[0].columns[0].locked = false', portal); await picker.place();
  }
  if (scenario === 'save-conflict') {
    assert.equal(picker.model.phase, 'save-failed'); assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'portal.json'))).hubName, 'Concurrent edit');
    const before = nativeRequests.filter(value => value.type === 'PORTAL_DATABASE_WRITE').length;
    await picker.place(); await picker.confirm(); assert.equal(nativeRequests.filter(value => value.type === 'PORTAL_DATABASE_WRITE').length, before); return;
  }
  assert.equal(picker.model.phase, 'complete', JSON.stringify({ error: picker.model.error, replies: pageReplies.slice(-3) }));
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'portal.json'))), cards = saved.boards[0].tabs[0].columns[0].items;
  const expected = ['stale-entry', 'reconnect'].includes(scenario) ? 1 : 2;
  assert.equal(cards.length, expected); assert.equal(saved.boards[0].tabs[0].columns[1].items.length, 0);
  assert.equal(undo.length, 1); assert.equal(renders, 1);
  assert.equal(nativeRequests.filter(value => value.type === 'PORTAL_DATABASE_WRITE').length, 1);
  assert.equal(picker.model.failures.size, scenario === 'stale-entry' ? 1 : 0);
  for (const card of cards) {
    assert.equal(card.type, 'game'); assert.equal(card.systemId, 'zx-spectrum');
    assert.equal(card.tags.length, scenario === 'happy' ? 1 : 0);
    const status = await bridge.getGameStatus(card.gameKey); assert.equal(status.state, 'ready');
  }
  const privateValues = [root, 'fixture.exe', 'game000.tap', 'game001.tap', 'arguments', 'catalogueId', 'entryRevision', 'sessionId'];
  for (const value of privateValues) assert.ok(!JSON.stringify(cards).includes(value), value);
  const bindings = JSON.parse(fs.readFileSync(path.join(root, 'catalogue-bindings.json')));
  assert.equal(Object.keys(bindings.bindings).length, expected);
  if (scenario === 'happy') {
    assert.equal(await bridge.launchGame(cards[0].gameKey), true);
    const launches = fs.readFileSync(path.join(root, 'launches.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(launches.length, 1); assert.equal(launches[0].shell, false);
    const filename = variants[1].hardwareLabel === '48K' ? 'game000.tap' : 'game001.tap';
    assert.deepEqual(launches[0].args, [path.join(root, 'fixture.exe'), '--game', path.join(root, 'spectrum', filename)]);
    assert.equal(launches[0].activeSource, 'different-active-source');
  }
  const catalogueReplies = pageReplies.filter(value => value.schemaVersion === 1);
  for (const value of [root, 'fixture.exe', 'game000.tap', 'game001.tap', 'sessionId', 'arguments'])
    assert.ok(!JSON.stringify(catalogueReplies).includes(value), value);
  assert.ok(!JSON.stringify([...storage]).includes('catalogueId'));
  vm.runInContext('restoreStateSnapshot(' + JSON.stringify(undo[0]) + ')', portal);
  assert.equal(vm.runInContext('state.boards[0].tabs[0].columns[0].items.length', portal), 0);
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'catalogue-bindings.json'))).bindings).length, expected);
  assert.equal(nativeRequests.filter(value => value.type === 'LAUNCH_GAME').length, scenario === 'happy' ? 1 : 0);
}
main().then(() => { console.log(JSON.stringify({ scenario, ok: true })); }, error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { timers.forEach(clearTimeout); ports.forEach(port => port.disconnect());
    await Promise.all(ports.map(port => port.child.exitCode !== null ? Promise.resolve() : new Promise(resolve => {
      const timer = setTimeout(() => { port.child.kill(); resolve(); }, 1500); port.child.once('exit', () => { clearTimeout(timer); resolve(); });
    }))); });
