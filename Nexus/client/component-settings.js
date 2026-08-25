(function cyruneComponentSettingsClientScope(root) {
  'use strict';

  const PROFILE_SCHEMA_VERSION = 2;
  const SUPPORTED_PROFILE_SCHEMA_VERSIONS = new Set([1, PROFILE_SCHEMA_VERSION]);
  const COMPONENTS = new Set(['portal-widgets', 'arcade']);
  const DEFAULTS = Object.freeze({
    region: { country: 'GB', city: '', timeZone: 'Europe/London', locationMode: 'manual', latitude: null, longitude: null },
    units: { system: 'metric', temperature: 'celsius', distance: 'kilometres', speed: 'kilometres-per-hour', mass: 'kilograms', volume: 'litres', pressure: 'hectopascals' },
    language: { primary: 'en-GB', secondary: '', interface: 'en-GB', content: 'en-GB' },
    formatting: { date: 'day-month-year', clock: '24-hour', currency: 'GBP', weekStart: 'monday' },
    behaviour: { externalLinks: 'new-tab', confirmPrivilegedActions: true, restoreLastView: true },
    accessibility: { scale: '100', reducedMotion: false, highContrast: false },
    privacy: { allowOptionalNetwork: true, allowApproximateLocation: false, allowPreciseLocation: false }
  });
  const ENUMS = Object.freeze({
    'region.locationMode': ['manual', 'approximate', 'precise'],
    'units.system': ['metric', 'imperial', 'custom'],
    'units.temperature': ['celsius', 'fahrenheit'],
    'units.distance': ['kilometres', 'miles'],
    'units.speed': ['kilometres-per-hour', 'miles-per-hour'],
    'units.mass': ['kilograms', 'pounds'],
    'units.volume': ['litres', 'gallons-uk', 'gallons-us'],
    'units.pressure': ['hectopascals', 'inches-of-mercury'],
    'formatting.date': ['day-month-year', 'month-day-year', 'year-month-day', 'locale'],
    'formatting.clock': ['12-hour', '24-hour', 'locale'],
    'formatting.weekStart': ['monday', 'sunday', 'saturday', 'locale'],
    'behaviour.externalLinks': ['new-tab', 'current-tab', 'component-default'],
    'accessibility.scale': ['90', '100', '110', '125']
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizedValue(section, key, supplied, fallback) {
    const path = `${section}.${key}`;
    if (path === 'region.latitude' || path === 'region.longitude') {
      if (supplied === null) return null;
      const value = typeof supplied === 'number' && Number.isFinite(supplied) ? supplied : NaN;
      const minimum = key === 'latitude' ? -90 : -180;
      const maximum = key === 'latitude' ? 90 : 180;
      return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
    }
    if (typeof fallback === 'boolean') return typeof supplied === 'boolean' ? supplied : fallback;
    if (ENUMS[path]) return ENUMS[path].includes(supplied) ? supplied : fallback;
    if (typeof supplied !== 'string') return fallback;
    const value = supplied.trim();
    if (value.length > 80 || [...value].some(character => character.charCodeAt(0) < 32)) return fallback;
    return value || (key === 'city' || key === 'secondary' ? '' : fallback);
  }

  function normalizeProfile(raw, expectedComponent) {
    const profile = raw && typeof raw === 'object' ? raw : {};
    if (!SUPPORTED_PROFILE_SCHEMA_VERSIONS.has(profile.profileSchemaVersion)) throw new Error('Unsupported Cyrune component settings profile');
    if (!COMPONENTS.has(expectedComponent) || profile.component !== expectedComponent) throw new Error('Cyrune component settings role mismatch');
    const revision = Number(profile.revision);
    const updatedAt = Number(profile.updatedAt);
    if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(updatedAt) || updatedAt < 0) {
      throw new Error('Invalid Cyrune component settings revision');
    }
    const suppliedValues = profile.values && typeof profile.values === 'object' ? profile.values : {};
    const values = {};
    const sources = {};
    for (const [section, defaults] of Object.entries(DEFAULTS)) {
      const supplied = suppliedValues[section];
      if (!supplied || typeof supplied !== 'object') continue;
      values[section] = {};
      for (const [key, fallback] of Object.entries(defaults)) {
        if (!Object.prototype.hasOwnProperty.call(supplied, key)) continue;
        values[section][key] = normalizedValue(section, key, supplied[key], fallback);
        const path = `${section}.${key}`;
        sources[path] = profile.profileSchemaVersion === PROFILE_SCHEMA_VERSION && profile.sources?.[path] === 'component'
          ? 'component'
          : 'global';
      }
    }
    if (values.region && (values.region.latitude === null || values.region.longitude === null)) {
      delete values.region.latitude;
      delete values.region.longitude;
      delete sources['region.latitude'];
      delete sources['region.longitude'];
    }
    return {
      profileSchemaVersion: PROFILE_SCHEMA_VERSION,
      settingsSchemaVersion: Number(profile.settingsSchemaVersion) || 1,
      component: expectedComponent,
      revision,
      updatedAt,
      values,
      sources
    };
  }

  function create(options) {
    const component = String(options?.component || '');
    if (!COMPONENTS.has(component) || typeof options?.request !== 'function') {
      throw new Error('Cyrune component settings client configuration is invalid');
    }
    const listeners = new Set();
    let current = null;
    let pending = null;

    async function refresh() {
      if (pending) return pending;
      pending = Promise.resolve(options.request()).then(response => {
        const next = normalizeProfile(response?.profile || response, component);
        if (current && next.revision < current.revision) return clone(current);
        current = next;
        if (typeof options.apply === 'function') options.apply(clone(next));
        for (const listener of [...listeners]) listener(clone(next));
        return clone(next);
      }).finally(() => { pending = null; });
      return pending;
    }

    return Object.freeze({
      component,
      refresh,
      get: () => current ? clone(current) : null,
      subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        if (current) listener(clone(current));
        return () => listeners.delete(listener);
      }
    });
  }

  root.CyruneComponentSettingsClient = Object.freeze({
    PROFILE_SCHEMA_VERSION,
    SUPPORTED_PROFILE_SCHEMA_VERSIONS,
    create,
    normalizeProfile
  });
}(globalThis));
