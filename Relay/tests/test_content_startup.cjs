const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('startup requests wait for an in-flight discovery registration', async () => {
  let finishRenewal;
  const runtimeListeners=[],pageListeners=[],messages=[];
  const window={location:{href:'file:///hub.html'},addEventListener:(_type,fn)=>pageListeners.push(fn),postMessage:()=>{}};
  const document={hidden:false,hasFocus:()=>true,documentElement:{dataset:{}},querySelector:selector=>selector==='meta[name="morpheus-webhub"]'?{}:null};
  const browser={runtime:{onMessage:{addListener:fn=>runtimeListeners.push(fn)},sendMessage:async message=>{
    messages.push(message);
    if(message.type==='MW_REGISTER') {
      if(messages.length===1)return {ok:true,hubSessionToken:'current'};
      assert.equal(message.hubSessionToken,'current');
      return new Promise(resolve=>{finishRenewal=resolve;});
    }
    return {ok:true};
  }}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../content.js'),'utf8'),{window,document,browser,setTimeout,clearTimeout});
  await new Promise(resolve=>setImmediate(resolve));
  const discovery=runtimeListeners[0]({type:'MW_DISCOVER'});
  const request=pageListeners[0]({source:window,data:{_mw:true,_req:true,id:'read',type:'MW_GET_STATE'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(messages.length,2,'The state read must wait until registration completes');
  finishRenewal({ok:true,hubSessionToken:'current'});
  await Promise.all([discovery,request]);
  assert.equal(messages[2].hubSessionToken,'current');
});

test('known-good idle relay registers and catches the page bridge ping', async () => {
  let markerAvailable = true;
  const windowListeners = new Map();
  const documentListeners = new Map();
  const runtimeListeners = [];
  const runtimeMessages = [];
  const postedMessages = [];

  const window = {
    location: { href: 'file:///hub/index.html' },
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    postMessage(message) { postedMessages.push(message); }
  };
  const document = {
    readyState: 'complete',
    hidden: false,
    hasFocus: () => true,
    documentElement: { dataset: {} },
    querySelector: selector => markerAvailable && selector === 'meta[name="morpheus-webhub"]' ? {} : null,
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    }
  };
  const browser = {
    runtime: {
      sendMessage: async message => {
        runtimeMessages.push(message);
        if (message.type === 'MW_REGISTER') return { ok: true, hubSessionToken: 'session-1' };
        return message.type === 'MW_PING'
          ? { ok: true, nativeAvailable: true, databasePath: 'C:\\hub.json' }
          : { ok: true };
      },
      onMessage: { addListener: listener => runtimeListeners.push(listener) }
    }
  };

  const context = vm.createContext({
    browser,
    document,
    window,
    Date,
    Promise,
    setTimeout,
    clearTimeout
  });
  const filename = path.join(__dirname, '..', 'content.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(windowListeners.get('message')?.length, 1);
  assert.deepEqual(runtimeMessages.map(message => message.type), ['MW_REGISTER']);
  assert.equal(document.documentElement.dataset.morpheusExtensionRelay, 'background-ready');
  const readyCount = postedMessages.filter(message => message._relayReady).length;
  assert.deepEqual(JSON.parse(JSON.stringify(await runtimeListeners[0]({ type: 'MW_DISCOVER' }))), {
    ok: true,
    isMorpheus: true,
    registered: true,
    pageUrl: 'file:///hub/index.html',
    hubSessionToken: 'session-1',
    error: ''
  });
  assert.equal(postedMessages.filter(message => message._relayReady).length, readyCount,
    'Discovery of an unchanged session must not replay database requests or cancel catalogue reads');

  const request = {
    _mw: true,
    _req: true,
    id: 'startup-ping',
    type: 'MW_PING',
    morpheusPage: true
  };
  await windowListeners.get('message')[0]({ data: request, source: window });

  assert.deepEqual(runtimeMessages.map(message => message.type), ['MW_REGISTER', 'MW_REGISTER', 'MW_PING']);
  assert.equal(postedMessages.at(-1).id, 'startup-ping');
  assert.equal(postedMessages.at(-1).nativeAvailable, true);

  runtimeListeners[0]({ type: 'MW_CYRUNE_SETTINGS_CHANGED', revision: 4 });
  assert.equal(postedMessages.at(-1)._cyruneSettingsChanged, true);
  assert.equal(postedMessages.at(-1).revision, 4);

  const delivery = runtimeListeners[0]({
    type: 'MW_RECEIVE_TAB',
    deliveryId: 'delivery-1',
    url: 'https://example.com',
    title: 'Example'
  });
  const pushed = postedMessages.at(-1);
  assert.equal(pushed.type, 'MW_RECEIVE_TAB');
  assert.equal(pushed.deliveryId, 'delivery-1');
  await windowListeners.get('message')[0]({
    source: window,
    data: { _mw: true, _pushResponse: true, pushRequestId: pushed.pushRequestId, ok: true, persisted: 'shared' }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await delivery)), {
    ok: true,
    conflict: false,
    persisted: 'shared',
    boards: [],
    activeBoardId: '',
    activeTabId: '',
    error: ''
  });

  const gameDelivery = runtimeListeners[0]({
    type: 'MW_RECEIVE_GAME',
    deliveryId: 'game-delivery-1',
    game: { gameKey: 'game_abcdefghijklmnop', title: 'Jetpac', tags: ['Games'], thumbnailCache: '' }
  });
  const gamePush = postedMessages.at(-1);
  assert.equal(gamePush.type, 'MW_RECEIVE_GAME');
  assert.equal(gamePush.game.gameKey, 'game_abcdefghijklmnop');
  await windowListeners.get('message')[0]({
    source: window,
    data: { _mw: true, _pushResponse: true, pushRequestId: gamePush.pushRequestId, ok: true, persisted: 'shared' }
  });
  assert.equal((await gameDelivery).ok, true);

  const gameUpdate = runtimeListeners[0]({
    type: 'MW_UPDATE_GAME_BINDING',
    deliveryId: 'game-update-1',
    game: { gameKey: 'game_abcdefghijklmnop', title: 'Jetpac', profileName: 'Spectrum 48K' }
  });
  const updatePush = postedMessages.at(-1);
  assert.equal(updatePush.type, 'MW_UPDATE_GAME_BINDING');
  assert.equal(updatePush.game.profileName, 'Spectrum 48K');
  await windowListeners.get('message')[0]({
    source: window,
    data: { _mw: true, _pushResponse: true, pushRequestId: updatePush.pushRequestId, ok: true, persisted: 'shared' }
  });
  assert.equal((await gameUpdate).ok, true);

  const targetsDelivery = runtimeListeners[0]({ type: 'MW_GET_INBOX_TARGETS' });
  const targetsPush = postedMessages.at(-1);
  assert.equal(targetsPush.type, 'MW_GET_INBOX_TARGETS');
  await windowListeners.get('message')[0]({
    source: window,
    data: {
      _mw: true,
      _pushResponse: true,
      pushRequestId: targetsPush.pushRequestId,
      ok: true,
      boards: [{ id: 'board-1', title: 'Board', tabs: [{ id: 'tab-1', title: 'Tab' }] }],
      activeBoardId: 'board-1',
      activeTabId: 'tab-1'
    }
  });
  const targets = await targetsDelivery;
  assert.equal(targets.boards[0].tabs[0].id, 'tab-1');
  assert.equal(targets.activeBoardId, 'board-1');

  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  assert.equal(manifest.content_scripts[0].run_at, 'document_idle');
  assert.ok(manifest.content_scripts[0].matches.includes('file:///*'));
  assert.equal(manifest.permissions.includes('file:///*'), true);
});

test('discovery retries registration after the initial background handshake fails', async () => {
  const runtimeListeners = [];
  const runtimeMessages = [];
  let registrationAttempts = 0;
  const document = {
    hidden: false,
    hasFocus: () => true,
    documentElement: { dataset: {} },
    querySelector: selector => selector === 'meta[name="morpheus-webhub"]' ? {} : null
  };
  const window = {
    location: { href: 'file:///hub/index.html' },
    addEventListener: () => {},
    postMessage: () => {}
  };
  const browser = {
    runtime: {
      sendMessage: async message => {
        runtimeMessages.push(message);
        if (message.type === 'MW_REGISTER' && ++registrationAttempts === 1) {
          throw new Error('background was still starting');
        }
        return { ok: true, hubSessionToken: 'session-2' };
      },
      onMessage: { addListener: listener => runtimeListeners.push(listener) }
    }
  };
  const context = vm.createContext({ browser, document, window, Date, Promise, setTimeout, clearTimeout });
  const filename = path.join(__dirname, '..', 'content.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(document.documentElement.dataset.morpheusExtensionRelay, 'background-error');
  const discovered = await runtimeListeners[0]({ type: 'MW_DISCOVER' });
  assert.equal(discovered.registered, true);
  assert.equal(registrationAttempts, 2);
  assert.equal(document.documentElement.dataset.morpheusExtensionRelay, 'background-ready');
});

test('EmuGUI file page registers before requesting bounded game delivery', async () => {
  const listeners = [];
  const runtimeListeners = [];
  const runtimeMessages = [];
  const posted = [];
  const window = {
    location: { href: 'file:///F:/Projects/Coding/Cyrune/Arcade/web/index.html', protocol: 'file:', hostname: '', port: '' },
    addEventListener(type, listener) { if (type === 'message') listeners.push(listener); },
    postMessage(message) { posted.push(message); }
  };
  const document = {
    querySelector: selector => selector === 'meta[name="morpheus-emugui"]' ? {} : null,
    documentElement: { dataset: {} }
  };
  const browser = {
    runtime: {
      sendMessage: async message => {
        runtimeMessages.push(message);
        if (message.type === 'MW_EMUGUI_REGISTER') {
          return { ok: true, emuguiSessionToken: 'emugui-session-1', transport: 'extension' };
        }
        return { ok: true, deliveryId: 'game-one', persisted: 'shared' };
      },
      onMessage: { addListener: listener => runtimeListeners.push(listener) }
    }
  };
  const context = vm.createContext({ browser, document, window, Date, Promise, setTimeout, clearTimeout });
  const filename = path.join(__dirname, '..', 'content.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });

  await listeners[0]({ source: window, data: {
    _emuguiReq: true, requestId: 'request-1', type: 'MW_EMUGUI_SEND_GAME',
    gameId: 'jetpac', emulatorId: 'eightyone', profileId: 'profile-48k'
  } });

  assert.deepEqual(JSON.parse(JSON.stringify(runtimeMessages[0])), {
    type: 'MW_EMUGUI_REGISTER', pageUrl: 'file:///F:/Projects/Coding/Cyrune/Arcade/web/index.html',
    protocols: { 'arcade-relay': 1, 'arcade-service': 1, 'component-settings': 2, 'arcade-catalogue': 1, 'arcade-scummvm': 1, 'arcade-atari-st': 1, 'arcade-gameboy': 1 }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(runtimeMessages[1])), {
    type: 'MW_EMUGUI_SEND_GAME', gameId: 'jetpac', emulatorId: 'eightyone', profileId: 'profile-48k',
    rebindGameKey: '', deliveryId: '', emuguiSessionToken: 'emugui-session-1', pageUrl: 'file:///F:/Projects/Coding/Cyrune/Arcade/web/index.html'
  });
  assert.equal(posted.at(-1)._emuguiRes, true);
  assert.equal(posted.at(-1).persisted, 'shared');

  await listeners[0]({ source: window, data: {
    _emuguiReq: true, requestId: 'settings-1', type: 'MW_EMUGUI_GET_CYRUNE_SETTINGS'
  } });
  assert.equal(runtimeMessages.at(-1).type, 'MW_EMUGUI_GET_CYRUNE_SETTINGS');
  assert.equal(runtimeMessages.at(-1).emuguiSessionToken, 'emugui-session-1');
  runtimeListeners[0]({ type: 'MW_CYRUNE_SETTINGS_CHANGED', revision: 5 });
  assert.equal(posted.at(-1)._cyruneSettingsChanged, true);
  assert.equal(posted.at(-1).revision, 5);
});

test('EmuGUI file page relays namespaced API requests through its registered session', async () => {
  const listeners = [];
  const runtimeMessages = [];
  const posted = [];
  const pageUrl = 'file:///F:/Projects/Coding/Cyrune/Arcade/web/index.html';
  const window = {
    location: { href: pageUrl, protocol: 'file:', hostname: '', port: '' },
    addEventListener(type, listener) { if (type === 'message') listeners.push(listener); },
    postMessage(message) { posted.push(message); }
  };
  const document = {
    querySelector: selector => selector === 'meta[name="morpheus-emugui"]' ? {} : null,
    documentElement: { dataset: {} }
  };
  const browser = {
    runtime: {
      sendMessage: async message => {
        runtimeMessages.push(message);
        if (message.type === 'MW_EMUGUI_REGISTER') {
          return { ok: true, emuguiSessionToken: 'emugui-session-file', transport: 'extension' };
        }
        return { ok: true, result: { ok: true, games: [] } };
      },
      onMessage: { addListener: () => {} }
    }
  };
  const context = vm.createContext({ browser, document, window, Date, Promise, setTimeout, clearTimeout });
  const filename = path.join(__dirname, '..', 'content.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });

  await listeners[0]({ source: window, data: {
    _emuguiReq: true, requestId: 'request-api', type: 'MW_EMUGUI_RPC',
    method: 'GET', path: '/api/games', query: { collection: 'spectrum' }
  } });

  assert.deepEqual(JSON.parse(JSON.stringify(runtimeMessages[1])), {
    type: 'MW_EMUGUI_RPC', method: 'GET', path: '/api/games', query: { collection: 'spectrum' }, body: {},
    emuguiSessionToken: 'emugui-session-file', pageUrl
  });
  assert.equal(posted.some(message => message._emugui && message._relayReady), true);
  assert.equal(posted.at(-1).result.games.length, 0);
});

test('Nexus file page registers an exact role and relays only namespaced operations', async () => {
  const windowListeners = [];
  const runtimeListeners = [];
  const runtimeMessages = [];
  const posted = [];
  const pageUrl = 'file:///F:/Projects/Coding/Cyrune/Nexus/index.html#overview';
  const documentUrl = 'file:///F:/Projects/Coding/Cyrune/Nexus/index.html';
  const window = {
    location: { href: pageUrl, protocol: 'file:' },
    addEventListener(type, listener) { if (type === 'message') windowListeners.push(listener); },
    postMessage(message) { posted.push(message); }
  };
  const document = {
    querySelector: selector => selector === 'meta[name="cyrune-nexus"]' ? {} : null,
    documentElement: { dataset: {} }
  };
  const browser = {
    runtime: {
      sendMessage: async message => {
        runtimeMessages.push(message);
        if (message.type === 'MW_NEXUS_REGISTER') {
          return { ok: true, nexusSessionToken: 'nexus-session-1', relayVersion: '1.0.61' };
        }
        return { ok: true, settings: { schemaVersion: 1, revision: 2 } };
      },
      onMessage: { addListener: listener => runtimeListeners.push(listener) }
    }
  };
  const context = vm.createContext({ browser, document, window, URL, Date, Promise, Set, Number, String, setTimeout, clearTimeout });
  const filename = path.join(__dirname, '..', 'content.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  await new Promise(resolve => setImmediate(resolve));

  await windowListeners[0]({ source: window, data: {
    _nexusReq: true, requestId: 'settings-1', type: 'MW_NEXUS_GET_SETTINGS'
  } });
  await windowListeners[0]({ source: window, data: {
    _nexusReq: true, requestId: 'todo-1', type: 'MW_NEXUS_OPEN_TODO', component: 'portal'
  } });
  await windowListeners[0]({ source: window, data: {
    _nexusReq: true, requestId: 'remote-1', type: 'MW_NEXUS_CHECK_REMOTE'
  } });

  assert.deepEqual(JSON.parse(JSON.stringify(runtimeMessages)), [
    { type: 'MW_NEXUS_REGISTER', pageUrl: documentUrl, protocols: { 'nexus-relay': 2, 'component-settings': 2 } },
    { type: 'MW_NEXUS_GET_SETTINGS', nexusSessionToken: 'nexus-session-1', pageUrl: documentUrl },
    { type: 'MW_NEXUS_OPEN_TODO', component: 'portal', nexusSessionToken: 'nexus-session-1', pageUrl: documentUrl },
    { type: 'MW_NEXUS_CHECK_REMOTE', nexusSessionToken: 'nexus-session-1', pageUrl: documentUrl }
  ]);
  assert.equal(posted.some(message => message._nexus && message._relayReady), true);
  assert.equal(posted.at(-1)._nexusRes, true);
  assert.equal(posted.at(-1).settings.revision, 2);
  runtimeListeners[0]({ type: 'MW_NEXUS_SETTINGS_CHANGED', revision: 3 });
  assert.equal(posted.at(-1).revision, 3);
});
