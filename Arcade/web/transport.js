(function initialiseArcadeTransport(global) {
  "use strict";

  let requestSequence = 0;
  let relayPromise = null;
  const pendingRequests = new Map();

  function isArcadeMessage(data) {
    return data?._arcade === true || data?._emugui === true;
  }

  global.addEventListener("message", (event) => {
    if (event.source !== global) return;
    if (isArcadeMessage(event.data) && event.data?._cyruneSettingsChanged === true) {
      global.dispatchEvent(new CustomEvent("cyrune:settings-revision", {
        detail: { revision: Number(event.data.revision || 0) },
      }));
      return;
    }
    if (event.data?._arcadeRes !== true && event.data?._emuguiRes !== true) return;
    const pending = pendingRequests.get(event.data.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRequests.delete(event.data.requestId);
    if (event.data.ok === true) pending.resolve(event.data);
    else pending.reject(new Error(event.data.error || "Cyrune Relay rejected the Arcade request."));
  });

  function waitForRelay() {
    if (document.documentElement.dataset.cyruneArcadeRelay === "background-ready"
        || document.documentElement.dataset.morpheusExtensionRelay === "background-ready") {
      return Promise.resolve();
    }
    if (relayPromise) return relayPromise;
    relayPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        global.removeEventListener("message", onMessage);
        reject(new Error("A current Cyrune Relay installation is required to open Arcade."));
      }, 15000);
      const onMessage = (event) => {
        if (event.source !== global || !isArcadeMessage(event.data) || event.data?._relayReady !== true) return;
        clearTimeout(timer);
        global.removeEventListener("message", onMessage);
        resolve();
      };
      global.addEventListener("message", onMessage);
    });
    return relayPromise;
  }

  async function request(type, payload = {}) {
    await waitForRelay();
    const requestId = `arcade-${Date.now()}-${++requestSequence}`;
    const timeoutMs = type === "MW_EMUGUI_RPC" && payload.path === "/api/pick-path" ? 305000 : 125000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error("A current Cyrune Relay installation is required."));
      }, timeoutMs);
      pendingRequests.set(requestId, { resolve, reject, timer });
      // Keep the legacy marker and message names during the compatibility window.
      global.postMessage({ _arcadeReq: true, _emuguiReq: true, requestId, type, ...payload }, "*");
    });
  }

  const settings = (() => {
    const factory = global.CyruneComponentSettingsClient;
    let client = null;

    function applyProfile(profile) {
      const values = profile.values || {};
      const accessibility = values.accessibility || {};
      const language = values.language || {};
      const units = values.units || {};
      const privacy = values.privacy || {};
      const root = document.documentElement;
      if (language.interface) root.lang = language.interface;
      if (accessibility.scale) root.style.fontSize = `${accessibility.scale}%`;
      root.dataset.cyruneReducedMotion = String(accessibility.reducedMotion === true);
      root.dataset.cyruneHighContrast = String(accessibility.highContrast === true);
      root.dataset.cyruneUnits = units.system || "metric";
      root.dataset.cyruneOptionalNetwork = String(privacy.allowOptionalNetwork !== false);
      global.dispatchEvent(new CustomEvent("cyrune:settings-applied", {
        detail: { component: profile.component, revision: profile.revision },
      }));
    }

    if (factory) {
      client = factory.create({
        component: "arcade",
        request: async () => {
          const response = await request("MW_EMUGUI_GET_CYRUNE_SETTINGS");
          return response.profile;
        },
        apply: applyProfile,
      });
      const refresh = () => { client.refresh().catch(() => {}); };
      global.addEventListener("cyrune:settings-revision", (event) => {
        const current = client.get();
        if (Number(event.detail?.revision || 0) > Number(current?.revision || -1)) refresh();
      });
      refresh();
    }

    return Object.freeze({
      get: () => client?.get() || null,
      refresh: () => client ? client.refresh() : Promise.resolve(null),
      subscribe: (listener) => client ? client.subscribe(listener) : (() => {}),
    });
  })();

  const api = Object.freeze({
    request,
    rpc: (payload) => request("MW_EMUGUI_RPC", payload),
    asset: (path) => request("MW_EMUGUI_ASSET", { path }),
    sendGame: (payload) => request("MW_EMUGUI_SEND_GAME", payload),
    settings,
    optionalNetworkAllowed: () => settings.get()?.values?.privacy?.allowOptionalNetwork !== false,
  });
  global.ArcadeTransport = api;
  global.CyruneSettings = settings;
})(globalThis);
