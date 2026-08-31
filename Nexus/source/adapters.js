(function nexusAdapterScope(root, factory) {
  const adapters = factory(root.CyruneComponentRegistry);
  root.CyruneNexusAdapters = adapters;
  if (typeof module === 'object' && module.exports) module.exports = adapters;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createNexusAdapters(registry) {
  'use strict';

  const ids = new Set((registry?.components || []).map(component => component.id));
  const runtimeSummaries = Object.freeze({
    arcade(component, context) {
      const service = context?.data?.arcade?.service;
      return service?.available
        ? `${context.health.summary} · ${Number(service.collectionCount || 0)} collections`
        : context.health.summary;
    },
    portal(_component, context) { return context.health.summary; },
    widgets(_component, context) { return context.health.summary; },
    relay(_component, context) { return context.health.summary; },
    host(_component, context) { return context.health.summary; },
    nexus(_component, context) { return context.health.summary; }
  });

  if (Object.keys(runtimeSummaries).some(id => !ids.has(id))) {
    throw new Error('Nexus adapter is not declared by the component registry');
  }

  function advertisedProtocols(component, snapshot) {
    if (component.id === 'relay') return snapshot?.services?.relay?.protocols || null;
    if (component.id === 'host') return snapshot?.services?.host?.protocols || null;
    if (component.id === 'portal' || component.id === 'arcade' || component.id === 'nexus') {
      const client = snapshot?.services?.clients?.[component.id];
      return client?.available ? (client.protocols || {}) : null;
    }
    return null;
  }

  function compatibility(component, snapshot) {
    const required = component?.protocols || {};
    const advertised = advertisedProtocols(component, snapshot);
    if (!advertised) return Object.freeze({ state: 'unknown', summary: 'Protocol compatibility not sampled' });
    const missing = [];
    const outdated = [];
    for (const [name, version] of Object.entries(required)) {
      if (!Number.isInteger(advertised[name])) missing.push(name);
      else if (advertised[name] < version) outdated.push(`${name} v${advertised[name]} < v${version}`);
    }
    if (missing.length || outdated.length) {
      return Object.freeze({
        state: 'incompatible',
        summary: [...missing.map(name => `${name} unavailable`), ...outdated].join(' · ')
      });
    }
    return Object.freeze({ state: 'compatible', summary: `${Object.keys(required).length} protocol contract${Object.keys(required).length === 1 ? '' : 's'} compatible` });
  }

  function runtimeSummary(component, context) {
    const adapter = runtimeSummaries[component?.adapter];
    return adapter ? adapter(component, context) : context.health.summary;
  }

  return Object.freeze({ compatibility, runtimeSummary });
}));
