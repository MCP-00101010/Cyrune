const cyruneSettings = (() => {
  const factory = globalThis.CyruneComponentSettingsClient;
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
    root.dataset.cyruneUnits = units.system || 'metric';
    root.dataset.cyruneOptionalNetwork = String(privacy.allowOptionalNetwork !== false);
    window.dispatchEvent(new CustomEvent('cyrune:settings-applied', {
      detail: { component: profile.component, revision: profile.revision }
    }));
  }

  if (factory && typeof bridge !== 'undefined') {
    client = factory.create({
      component: 'portal-widgets',
      request: () => bridge.getCyruneSettings(),
      apply: applyProfile
    });
    const refresh = () => { client.refresh().catch(() => {}); };
    bridge.whenReady.then(refresh);
    window.addEventListener('morpheus:bridge-ready', refresh);
    window.addEventListener('cyrune:settings-revision', event => {
      const current = client.get();
      if (Number(event.detail?.revision || 0) > Number(current?.revision || -1)) refresh();
    });
  }

  return Object.freeze({
    get: () => client?.get() || null,
    refresh: () => client ? client.refresh() : Promise.resolve(null),
    subscribe: listener => client ? client.subscribe(listener) : (() => {})
  });
})();

globalThis.CyruneSettings = cyruneSettings;
