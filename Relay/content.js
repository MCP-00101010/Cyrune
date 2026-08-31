'use strict';

(() => {
if (globalThis.__morpheusWebHubRelayLoaded) return;
globalThis.__morpheusWebHubRelayLoaded = true;

// Keep the page/extension transport deliberately small. Firefox injects this
// once at document_idle, after Cyrune Portal's compatibility meta tag is available.
const IS_MORPHEUS = !!document.querySelector('meta[name="morpheus-webhub"]');
const IS_ARCADE = (!!document.querySelector('meta[name="cyrune-arcade"]')
  || !!document.querySelector('meta[name="morpheus-emugui"]'))
  && window.location.protocol === 'file:';
const IS_NEXUS = !!document.querySelector('meta[name="cyrune-nexus"]')
  && window.location.protocol === 'file:';
const PORTAL_CLIENT_PROTOCOLS = Object.freeze({ 'portal-relay': 1, 'component-settings': 2 });
const ARCADE_CLIENT_PROTOCOLS = Object.freeze({ 'arcade-relay': 1, 'arcade-service': 1, 'component-settings': 2 });
const NEXUS_CLIENT_PROTOCOLS = Object.freeze({ 'nexus-relay': 2, 'component-settings': 2 });
const pendingPagePushes = new Map();
let pushSequence = 0;
let registeredWithBackground = false;
let registrationPromise = null;
let hubSessionToken = '';
let arcadeRegistrationPromise = null;
let arcadeSessionToken = '';
let nexusRegistrationPromise = null;
let nexusSessionToken = '';

function nexusDocumentUrl(value = window.location.href) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'file:' || parsed.search) return '';
    parsed.hash = '';
    return parsed.href;
  } catch {
    return '';
  }
}

function setRelayDiagnostic(state, error = '') {
  const root = document.documentElement;
  if (!root) return;
  root.dataset.cyruneArcadeRelay = state;
  root.dataset.morpheusExtensionRelay = state;
  if (error) root.dataset.morpheusExtensionError = error;
  else delete root.dataset.morpheusExtensionError;
}

function relayPushToPage(message) {
  const pushRequestId = `mw-push-${Date.now()}-${++pushSequence}`;
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pendingPagePushes.delete(pushRequestId);
      resolve({ ok: false, error: 'The hub did not acknowledge the delivery in time' });
    }, 65000);
    pendingPagePushes.set(pushRequestId, { resolve, timer });
    window.postMessage({ _mw: true, _push: true, pushRequestId, ...message }, '*');
  });
}

function registerHub({ force = false } = {}) {
  if (registeredWithBackground && hubSessionToken && !force) {
    return Promise.resolve({ ok: true, hubSessionToken });
  }
  if (registrationPromise) return registrationPromise;
  registrationPromise = browser.runtime.sendMessage({
    type: 'MW_REGISTER',
    pageUrl: window.location.href,
    active: !document.hidden && document.hasFocus(),
    protocols: PORTAL_CLIENT_PROTOCOLS
  }).then(response => {
    if (response?.ok !== true) throw new Error(response?.error || 'The extension background rejected Hub registration');
    if (!response.hubSessionToken) throw new Error('The extension background did not establish a Hub session');
    registeredWithBackground = true;
    hubSessionToken = response.hubSessionToken;
    setRelayDiagnostic('background-ready');
    window.postMessage({ _mw: true, _relayReady: true }, '*');
    return response;
  }).catch(error => {
    registeredWithBackground = false;
    hubSessionToken = '';
    setRelayDiagnostic('background-error', error?.message || String(error));
    return { ok: false, error: error?.message || String(error) };
  }).finally(() => {
    registrationPromise = null;
  });
  return registrationPromise;
}

function registerArcade({ force = false } = {}) {
  if (arcadeSessionToken && !force) return Promise.resolve({ ok: true, arcadeSessionToken, emuguiSessionToken: arcadeSessionToken });
  if (arcadeRegistrationPromise) return arcadeRegistrationPromise;
  arcadeRegistrationPromise = browser.runtime.sendMessage({
    type: 'MW_EMUGUI_REGISTER',
    pageUrl: window.location.href,
    protocols: ARCADE_CLIENT_PROTOCOLS
  }).then(response => {
    const token = response?.arcadeSessionToken || response?.emuguiSessionToken;
    if (response?.ok !== true || !token) {
      throw new Error(response?.error || 'Cyrune Relay rejected Arcade registration');
    }
    arcadeSessionToken = token;
    setRelayDiagnostic('background-ready');
    window.postMessage({ _arcade: true, _emugui: true, _relayReady: true, transport: response.transport || '' }, '*');
    return { ...response, arcadeSessionToken: token, emuguiSessionToken: token };
  }).catch(error => {
    arcadeSessionToken = '';
    setRelayDiagnostic('background-error', error?.message || String(error));
    return { ok: false, error: error?.message || String(error) };
  }).finally(() => {
    arcadeRegistrationPromise = null;
  });
  return arcadeRegistrationPromise;
}

function registerNexus({ force = false } = {}) {
  if (nexusSessionToken && !force) return Promise.resolve({ ok: true, nexusSessionToken });
  if (nexusRegistrationPromise) return nexusRegistrationPromise;
  nexusRegistrationPromise = browser.runtime.sendMessage({
    type: 'MW_NEXUS_REGISTER',
    pageUrl: nexusDocumentUrl(),
    protocols: NEXUS_CLIENT_PROTOCOLS
  }).then(response => {
    if (response?.ok !== true || !response.nexusSessionToken) {
      throw new Error(response?.error || 'Cyrune Relay rejected Nexus registration');
    }
    nexusSessionToken = response.nexusSessionToken;
    setRelayDiagnostic('background-ready');
    window.postMessage({ _nexus: true, _relayReady: true, relayVersion: response.relayVersion || '' }, '*');
    return response;
  }).catch(error => {
    nexusSessionToken = '';
    setRelayDiagnostic('background-error', error?.message || String(error));
    window.postMessage({ _nexus: true, _relayError: true, error: error?.message || String(error) }, '*');
    return { ok: false, error: error?.message || String(error) };
  }).finally(() => {
    nexusRegistrationPromise = null;
  });
  return nexusRegistrationPromise;
}

if (IS_MORPHEUS) {
  setRelayDiagnostic('loaded');
  void registerHub();

  browser.runtime.onMessage.addListener(msg => {
    if (msg.type === 'MW_CYRUNE_SETTINGS_CHANGED') {
      window.postMessage({ _mw: true, _cyruneSettingsChanged: true, revision: Number(msg.revision || 0) }, '*');
      return;
    }
    if (msg.type === 'MW_PORTAL_STATE_CHANGED') {
      window.postMessage({
        _mw: true,
        _portalStateChanged: true,
        revision: Number(msg.revision || 0),
        version: msg.version || null,
        contentHash: msg.contentHash || '',
        authority: msg.authority || ''
      }, '*');
      return;
    }
    if (msg.type === 'MW_DISCOVER') {
      return registerHub({ force: true }).then(result => ({
        ok: result?.ok === true,
        isMorpheus: true,
        registered: result?.ok === true,
        pageUrl: window.location.href,
        hubSessionToken: result?.hubSessionToken || '',
        error: result?.ok === true ? '' : (result?.error || 'Hub registration failed')
      }));
    }
    if (msg.type === 'MW_RECEIVE_TAB') {
      return relayPushToPage({
        type: 'MW_RECEIVE_TAB',
        deliveryId: msg.deliveryId || '',
        targetBoardId: msg.targetBoardId || '',
        targetTabId: msg.targetTabId || '',
        url: msg.url,
        title: msg.title,
        faviconCache: msg.faviconCache || ''
      });
    }
    if (msg.type === 'MW_RECEIVE_IMPORT_ITEMS') {
      return relayPushToPage({
        type: 'MW_RECEIVE_IMPORT_ITEMS',
        deliveryId: msg.deliveryId || '',
        items: msg.items || [],
        source: msg.source || ''
      });
    }
    if (msg.type === 'MW_RECEIVE_GAME') {
      return relayPushToPage({
        type: 'MW_RECEIVE_GAME',
        deliveryId: msg.deliveryId || '',
        targetBoardId: msg.targetBoardId || '',
        targetTabId: msg.targetTabId || '',
        game: msg.game || null
      });
    }
    if (msg.type === 'MW_UPDATE_GAME_BINDING') {
      return relayPushToPage({
        type: 'MW_UPDATE_GAME_BINDING',
        deliveryId: msg.deliveryId || '',
        game: msg.game || null
      });
    }
    if (msg.type === 'MW_GET_INBOX_TARGETS') {
      return relayPushToPage({ type: 'MW_GET_INBOX_TARGETS' });
    }
    if (msg.type === 'MW_OPEN_COMMAND_PALETTE') {
      return relayPushToPage({ type: 'MW_OPEN_COMMAND_PALETTE' });
    }
    if (msg.type === 'MW_NOTIFICATION_EVENT') {
      return relayPushToPage({ type: 'MW_NOTIFICATION_EVENT', event: msg.event || null });
    }
    if (msg.type === 'MW_OPEN_NOTIFICATION_TARGET') {
      return relayPushToPage({ type: 'MW_OPEN_NOTIFICATION_TARGET', event: msg.event || null });
    }
  });
}
if (IS_ARCADE) {
  setRelayDiagnostic('loaded');
  void registerArcade();
  browser.runtime.onMessage.addListener(msg => {
    if (msg.type === 'MW_CYRUNE_SETTINGS_CHANGED') {
      window.postMessage({ _arcade: true, _emugui: true, _cyruneSettingsChanged: true, revision: Number(msg.revision || 0) }, '*');
    }
  });
}
if (IS_NEXUS) {
  setRelayDiagnostic('loaded');
  void registerNexus();
  browser.runtime.onMessage.addListener(msg => {
    if (msg.type === 'MW_NEXUS_SETTINGS_CHANGED') {
      window.postMessage({ _nexus: true, _settingsChanged: true, revision: Number(msg.revision || 0) }, '*');
    }
  });
}

// Relay page requests to the extension background and delivery acknowledgements
// back to the popup/background sender.
window.addEventListener('message', async event => {
  if (IS_NEXUS && event.source === window && event.data?._nexusReq === true) {
    const requestId = String(event.data.requestId || '').slice(0, 100);
    const type = String(event.data.type || '');
    const allowed = new Set([
      'MW_NEXUS_PING', 'MW_NEXUS_GET_SETTINGS', 'MW_NEXUS_SAVE_SETTINGS',
      'MW_NEXUS_GET_STATUS', 'MW_NEXUS_GET_DOCUMENT', 'MW_NEXUS_OPEN_TODO',
      'MW_NEXUS_CHECK_REMOTE'
    ]);
    if (!requestId || !allowed.has(type)) return;
    let response;
    try {
      const registration = await registerNexus();
      if (registration?.ok !== true || !nexusSessionToken) throw new Error(registration?.error || 'Cyrune Nexus is not registered');
      const message = { type, nexusSessionToken, pageUrl: nexusDocumentUrl() };
      if (type === 'MW_NEXUS_SAVE_SETTINGS') Object.assign(message, {
        settings: event.data.settings && typeof event.data.settings === 'object' ? event.data.settings : null,
        expectedRevision: Number(event.data.expectedRevision)
      });
      if (type === 'MW_NEXUS_GET_DOCUMENT') Object.assign(message, {
        component: String(event.data.component || '').slice(0, 24),
        documentType: String(event.data.documentType || '').slice(0, 24)
      });
      if (type === 'MW_NEXUS_OPEN_TODO') Object.assign(message, {
        component: String(event.data.component || '').slice(0, 24)
      });
      response = await browser.runtime.sendMessage(message);
    } catch (error) {
      response = { ok: false, error: error?.message || String(error) };
    }
    window.postMessage({ _nexusRes: true, requestId, ...(response || { ok: false, error: 'No extension response' }) }, '*');
    return;
  }
  if (IS_ARCADE && event.source === window && (event.data?._arcadeReq === true || event.data?._emuguiReq === true)) {
    const requestId = String(event.data.requestId || '');
    const type = String(event.data.type || '');
    if (!requestId || !['MW_EMUGUI_SEND_GAME', 'MW_EMUGUI_RPC', 'MW_EMUGUI_ASSET', 'MW_EMUGUI_GET_CYRUNE_SETTINGS'].includes(type)) return;
    let response;
    try {
      const registration = await registerArcade();
      if (registration?.ok !== true || !arcadeSessionToken) throw new Error(registration?.error || 'Cyrune Arcade is not registered');
      const message = {
        type,
        emuguiSessionToken: arcadeSessionToken,
        pageUrl: window.location.href
      };
      if (type === 'MW_EMUGUI_SEND_GAME') Object.assign(message, {
          gameId: String(event.data.gameId || '').slice(0, 120),
          emulatorId: String(event.data.emulatorId || '').slice(0, 120),
          profileId: String(event.data.profileId || '').slice(0, 120),
          rebindGameKey: String(event.data.rebindGameKey || '').slice(0, 80),
          deliveryId: String(event.data.deliveryId || '').slice(0, 160)
        });
      if (type === 'MW_EMUGUI_RPC') Object.assign(message, {
          method: String(event.data.method || '').slice(0, 8),
          path: String(event.data.path || '').slice(0, 96),
          query: event.data.query && typeof event.data.query === 'object' ? event.data.query : {},
          body: event.data.body && typeof event.data.body === 'object' ? event.data.body : {}
        });
      if (type === 'MW_EMUGUI_ASSET') message.path = String(event.data.path || '').slice(0, 2048);
      response = await browser.runtime.sendMessage(message);
    } catch (error) {
      response = { ok: false, error: error?.message || String(error) };
    }
    window.postMessage({ _arcadeRes: true, _emuguiRes: true, requestId, ...(response || { ok: false, error: 'No extension response' }) }, '*');
    return;
  }
  if (!IS_MORPHEUS) return;
  if (event.data?._mw && event.source === window && event.data._pushResponse) {
    const pending = pendingPagePushes.get(event.data.pushRequestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingPagePushes.delete(event.data.pushRequestId);
    pending.resolve({
      ok: event.data.ok === true,
      conflict: event.data.conflict === true,
      persisted: event.data.persisted || '',
      boards: Array.isArray(event.data.boards) ? event.data.boards : [],
      activeBoardId: event.data.activeBoardId || '',
      activeTabId: event.data.activeTabId || '',
      error: event.data.error || ''
    });
    return;
  }
  if (!event.data?._mw || event.source !== window || !event.data._req) return;

  const { id, type } = event.data;
  const reply = data => window.postMessage({ _mw: true, _res: true, id, ...data }, '*');
  try {
    const registration = await registerHub();
    if (registration?.ok !== true || !hubSessionToken) {
      throw new Error(registration?.error || 'The Hub relay is not registered');
    }
    const response = await browser.runtime.sendMessage({
      type,
      ...event.data,
      morpheusPage: IS_MORPHEUS,
      pageUrl: window.location.href,
      hubSessionToken
    });
    reply(response);
  } catch (error) {
    setRelayDiagnostic('background-error', error?.message || String(error));
    reply({ ok: false, error: error?.message || String(error) });
  }
});

})();
