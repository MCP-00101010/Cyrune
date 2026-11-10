const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function makeElement() {
  const classes = new Set(['hidden']);
  const element = {
    textContent: '',
    className: '',
    disabled: true,
    value: '',
    children: [],
    listeners: {},
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name)
    },
    addEventListener(type, listener) { this.listeners[type] = listener; },
    appendChild(child) {
      this.children.push(child);
      if (!this.value && child.value) this.value = child.value;
      return child;
    }
  };
  Object.defineProperty(element, 'innerHTML', {
    get() { return ''; },
    set() { element.children = []; element.value = ''; }
  });
  return element;
}

test('daily time stays compact, updates while open and hides when tracking is disabled',async()=>{
  const node={},timers=[];let unload,value={trackingEnabled:true,todayMs:3720000};
  const context=vm.createContext({window:{addEventListener:(_name,fn)=>{unload=fn;}},setTimeout:fn=>{timers.push(fn);return 1;},clearTimeout(){}});
  const source=fs.readFileSync(path.join(__dirname,'../popup/popup.js'),'utf8');
  vm.runInContext(source.slice(source.indexOf('function pollSiteTodayTime('),source.indexOf('async function setupProductivityControls(')),context);
  context.pollSiteTodayTime(async()=>value,node);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(node.textContent,'1h 2m');assert.equal(node.hidden,false);
  value={trackingEnabled:true,todayMs:0};await timers.shift()();assert.equal(node.textContent,'0 min');
  value={trackingEnabled:false,todayMs:null};await timers.shift()();assert.equal(node.hidden,true);assert.equal(node.textContent,'');
  unload();const count=timers.length;await timers.shift()();assert.equal(timers.length,count-1);
});

test('popup enables delivery actions when a later status refresh finds the hub', async () => {
  const elementIds = [
    'statusMorpheus', 'statusVersion', 'statusNative', 'statusPending', 'statusPath', 'statusDetail',
    'tabInfo', 'tabTitle', 'tabUrl', 'targetPicker', 'targetBoard', 'targetTab',
    'sendBtn', 'sendToTabBtn', 'importBtn', 'feedback', 'storageChoice', 'useRelayStorageBtn', 'tabTimersOpen'
  ];
  const elements = Object.fromEntries(elementIds.map(id => [id, makeElement()]));
  const statuses = [
    { ok: true, morpheusOpen: false, nativeAvailable: false, storageInfoReady: false },
    { ok: true, morpheusOpen: true, nativeAvailable: false, storageInfoReady: false },
    { ok: true, morpheusOpen: true, nativeAvailable: true, storageInfoReady: true, databasePath: 'C:\\hub.json', storageMode: 'host', authoritativeStorageAvailable: true }
  ];
  let statusIndex = 0;
  let intervalCallback = null;
  const injectedTabs = [];
  const runtimeMessages = [];
  let relayReady = false;
  const context = vm.createContext({
    console,
    URL,
    document: { getElementById: id => elements[id], createElement: () => makeElement() },
    window: {
      addEventListener: () => {},
      close: () => {}
    },
    browser: {
      tabs: {
        query: async () => [{ id: 7, url: 'https://example.com', title: 'Example' }],
        sendMessage: async (_tabId, message) => message.type === 'MW_DISCOVER' && relayReady
          ? { ok: true, isMorpheus: true }
          : null,
        executeScript: async (tabId, details) => {
          injectedTabs.push({ tabId, details });
          relayReady = true;
        }
      },
      runtime: {
        id: 'test-extension',
        sendMessage: async message => {
          runtimeMessages.push(message);
          if (message.type === 'MW_GET_INBOX_TARGETS') return {
            ok: true,
            activeBoardId: 'board-1',
            activeTabId: 'tab-1',
            boards: [
              { id: 'board-1', title: 'Board One', tabs: [{ id: 'tab-1', title: 'Tab One' }] },
              { id: 'board-2', title: 'Board Two', tabs: [{ id: 'tab-2', title: 'Tab Two' }] }
            ]
          };
          if (message.type !== 'MW_GET_STATUS') return { ok: true };
          return statuses[Math.min(statusIndex++, statuses.length - 1)];
        },
        getManifest: () => ({ version: '1.0.20' })
      },
      storage: {
        local: {
          get: async () => ({ morpheusPopupTarget: { boardId: 'board-2', tabId: 'tab-2' } }),
          set: async () => {}
        }
      }
    },
    setInterval: callback => { intervalCallback = callback; return 1; },
    clearInterval: () => {},
    setTimeout,
    clearTimeout
  });
  const filename = path.join(__dirname, '..', 'popup', 'popup.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(elements.sendBtn.disabled, true);
  assert.equal(elements.importBtn.disabled, true);
  assert.equal(typeof intervalCallback, 'function');

  await intervalCallback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.sendBtn.disabled, false);
  assert.equal(elements.sendToTabBtn.disabled, false);
  assert.equal(elements.importBtn.disabled, false);
  assert.equal(elements.targetBoard.value, 'board-2');
  assert.equal(elements.targetTab.value, 'tab-2');

  await elements.sendToTabBtn.listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  const targetedSend = runtimeMessages.findLast(message => message.type === 'MW_SEND_TAB');
  assert.equal(targetedSend.targetBoardId, 'board-2');
  assert.equal(targetedSend.targetTabId, 'tab-2');

  await intervalCallback();
  assert.match(elements.statusNative.textContent, /Storage: Host disk/);

  const relay = await context.ensureActiveHubRelay({ id: 42, url: 'file:///F:/hub/index.html' });
  assert.equal(relay.ready, true);
  assert.deepEqual(JSON.parse(JSON.stringify(injectedTabs)), [{
    tabId: 42,
    details: { runAt: 'document_idle', file: '/content.js' }
  }]);
});

test('popup includes the Firefox local-file permission instruction', () => {
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8');
  assert.match(popup, /Access local files on your computer/);
  assert.match(popup, /about:addons/);
});

async function loadPopupWithStorageStatus(status) {
  const elements = new Map(), messages = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  };
  let currentStatus = { ok: true, morpheusOpen: false, nativeAvailable: false, storageInfoReady: true, ...status };
  const context = vm.createContext({
    console, URL, setTimeout, clearTimeout,
    setInterval: () => 1, clearInterval: () => {},
    document: { getElementById: id => id === 'relayNavigation' ? null : element(id), createElement: makeElement },
    window: { addEventListener: () => {}, close: () => {} },
    browser: {
      tabs: { query: async () => [], sendMessage: async () => null },
      runtime: {
        getManifest: () => ({ version: 'test' }),
        sendMessage: async message => {
          messages.push(message);
          if (message.type === 'MW_GET_STATUS') return currentStatus;
          if (message.type === 'USE_RELAY_STORAGE') {
            currentStatus = { ...currentStatus, storageMode: 'relay', authoritativeStorageAvailable: true, authoritySelectionRequired: false };
            return { ok: true, storageInfo: currentStatus };
          }
          throw new Error('Unexpected popup message');
        }
      },
      storage: { local: { get: async () => ({}), set: async () => {} } }
    }
  });
  const filename = path.join(__dirname, '..', 'popup', 'popup.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  await new Promise(resolve => setImmediate(resolve));
  return { element, messages };
}

test('popup offers an explicit Relay choice only when authority is unresolved', async () => {
  const h = await loadPopupWithStorageStatus({ storageMode: 'unselected', authoritySelectionRequired: true, authoritativeStorageAvailable: false });
  assert.equal(h.element('storageChoice').classList.contains('hidden'), false);
  assert.match(h.element('statusNative').textContent, /awaiting setup/);
  assert.equal(h.messages.some(message => message.type === 'USE_RELAY_STORAGE'), false);
  await h.element('useRelayStorageBtn').listeners.click();
  assert.equal(h.messages.filter(message => message.type === 'USE_RELAY_STORAGE').length, 1);
  assert.equal(h.element('storageChoice').classList.contains('hidden'), true);
  assert.match(h.element('statusNative').textContent, /Storage: Relay/);
});

test('popup keeps Host outage distinct from selected Relay storage', async () => {
  const host = await loadPopupWithStorageStatus({ storageMode: 'host', authoritativeStorageAvailable: false, authoritySelectionRequired: false });
  assert.match(host.element('statusNative').textContent, /Host disk unavailable/);
  assert.equal(host.element('storageChoice').classList.contains('hidden'), true);
  const relay = await loadPopupWithStorageStatus({ storageMode: 'relay', authoritativeStorageAvailable: true, authoritySelectionRequired: false });
  assert.match(relay.element('statusNative').textContent, /Storage: Relay/);
  assert.equal(relay.element('storageChoice').classList.contains('hidden'), true);
});

test('popup allows explicit recovery of an invalid choice even when Host is connected', async () => {
  const h = await loadPopupWithStorageStatus({ nativeAvailable: true, storageMode: 'unselected', authoritySelectionRequired: true, authoritativeStorageAvailable: false });
  assert.equal(h.element('storageChoice').classList.contains('hidden'), false);
  assert.equal(h.messages.some(message => message.type === 'USE_RELAY_STORAGE'), false);
  await h.element('useRelayStorageBtn').listeners.click();
  assert.equal(h.messages.filter(message => message.type === 'USE_RELAY_STORAGE').length, 1);
  assert.equal(h.element('storageChoice').classList.contains('hidden'), true);
});
