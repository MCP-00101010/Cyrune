(function nexusBridgeScope(root) {
  'use strict';

  const pending = new Map();
  const allowed = new Set([
    'MW_NEXUS_PING', 'MW_NEXUS_GET_SETTINGS', 'MW_NEXUS_SAVE_SETTINGS',
    'MW_NEXUS_GET_STATUS', 'MW_NEXUS_GET_DOCUMENT', 'MW_NEXUS_OPEN_TODO',
    'MW_NEXUS_CHECK_REMOTE'
  ]);
  let sequence = 0;
  let relayReady = false;

  function request(type, payload = {}, timeoutMs = 20000) {
    if (!allowed.has(type)) return Promise.reject(new Error('Unsupported Nexus bridge request'));
    const requestId = `nexus-${Date.now()}-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Cyrune Relay did not answer the Nexus request in time'));
      }, Math.max(1000, Math.min(120000, Number(timeoutMs) || 20000)));
      pending.set(requestId, { resolve, reject, timer });
      window.postMessage({ _nexusReq: true, requestId, type, ...payload }, '*');
    });
  }

  window.addEventListener('message', event => {
    if (event.source !== window || !event.data) return;
    if (event.data._nexusRes === true) {
      const entry = pending.get(String(event.data.requestId || ''));
      if (!entry) return;
      pending.delete(String(event.data.requestId || ''));
      window.clearTimeout(entry.timer);
      if (event.data.ok === true) entry.resolve(event.data);
      else entry.reject(new Error(event.data.error || 'Cyrune Nexus request failed'));
      return;
    }
    if (event.data._nexus === true && event.data._relayReady === true) {
      relayReady = true;
      window.dispatchEvent(new CustomEvent('cyrune:nexus-relay-ready', { detail: event.data }));
    }
    if (event.data._nexus === true && event.data._relayError === true) {
      relayReady = false;
      window.dispatchEvent(new CustomEvent('cyrune:nexus-relay-error', { detail: event.data }));
    }
    if (event.data._nexus === true && event.data._settingsChanged === true) {
      window.dispatchEvent(new CustomEvent('cyrune:nexus-settings-changed', { detail: event.data }));
    }
  });

  root.CyruneNexusBridge = Object.freeze({
    request,
    isRelayReady: () => relayReady
  });
}(globalThis));
