(function nexusModelScope(root, factory) {
  const registry = root.CyruneComponentRegistry || (typeof module === 'object' && module.exports
    ? require('./component-registry.js') : null);
  const model = factory(registry);
  root.CyruneNexusModel = model;
  if (typeof module === 'object' && module.exports) module.exports = model;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createNexusModel(registry) {
  'use strict';

  const NEXUS_VERSION = '0.3.0';
  const SETTINGS_SCHEMA_VERSION = 2;
  const PREVIEW_STORAGE_KEY = 'cyrune.nexus.settings.preview.v2';
  const LEGACY_PREVIEW_STORAGE_KEYS = Object.freeze(['cyrune.nexus.settings.preview.v1']);

  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.components)) {
    throw new Error('Cyrune component registry did not load');
  }
  const COMPONENTS = registry.components;
  if (COMPONENTS.find(component => component.id === 'nexus')?.version !== NEXUS_VERSION) {
    throw new Error('Nexus registry version does not match the application');
  }

  const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    revision: 0,
    updatedAt: 0,
    region: { country: 'GB', city: '', timeZone: 'Europe/London', locationMode: 'manual', latitude: null, longitude: null },
    units: { system: 'metric', temperature: 'celsius', distance: 'kilometres', speed: 'kilometres-per-hour', mass: 'kilograms', volume: 'litres', pressure: 'hectopascals' },
    language: { primary: 'en-GB', secondary: '', interface: 'en-GB', content: 'en-GB' },
    formatting: { date: 'day-month-year', clock: '24-hour', currency: 'GBP', weekStart: 'monday' },
    behaviour: { externalLinks: 'new-tab', confirmPrivilegedActions: true, restoreLastView: true },
    accessibility: { scale: '100', reducedMotion: false, highContrast: false },
    privacy: { allowOptionalNetwork: true, allowApproximateLocation: false, allowPreciseLocation: false },
    overrides: { 'portal-widgets': {}, arcade: {} }
  });

  const COMPONENT_SETTING_PATHS = Object.freeze({
    'portal-widgets': Object.freeze([
      'region.country', 'region.city', 'region.timeZone', 'region.locationMode', 'region.latitude', 'region.longitude',
      'units.system', 'units.temperature', 'units.distance', 'units.speed', 'units.mass', 'units.volume', 'units.pressure',
      'language.primary', 'language.secondary', 'language.interface', 'language.content',
      'formatting.date', 'formatting.clock', 'formatting.currency', 'formatting.weekStart',
      'behaviour.externalLinks', 'behaviour.confirmPrivilegedActions', 'behaviour.restoreLastView',
      'accessibility.scale', 'accessibility.reducedMotion', 'accessibility.highContrast', 'privacy.allowOptionalNetwork'
    ]),
    arcade: Object.freeze([
      'region.country', 'region.timeZone',
      'units.system', 'units.temperature', 'units.distance', 'units.speed', 'units.mass', 'units.volume', 'units.pressure',
      'language.primary', 'language.secondary', 'language.interface', 'language.content',
      'formatting.date', 'formatting.clock', 'formatting.currency', 'formatting.weekStart',
      'behaviour.externalLinks', 'behaviour.confirmPrivilegedActions', 'behaviour.restoreLastView',
      'accessibility.scale', 'accessibility.reducedMotion', 'accessibility.highContrast', 'privacy.allowOptionalNetwork'
    ])
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function pick(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  function text(value, fallback, maxLength) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return (normalized || fallback).slice(0, maxLength);
  }

  function coordinate(value, minimum, maximum) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
  }

  function getPath(target, path) {
    return path.split('.').reduce((value, key) => value && typeof value === 'object' ? value[key] : undefined, target);
  }

  function setPath(target, path, value) {
    const [section, key] = path.split('.');
    if (!target[section] || typeof target[section] !== 'object') target[section] = {};
    target[section][key] = clone(value);
  }

  function normalizeSettings(candidate) {
    const source = candidate && typeof candidate === 'object' ? candidate : {};
    const output = clone(DEFAULT_SETTINGS);
    output.revision = Number.isSafeInteger(source.revision) && source.revision >= 0 ? source.revision : 0;
    output.updatedAt = Number.isSafeInteger(source.updatedAt) && source.updatedAt >= 0 ? source.updatedAt : 0;
    const region = source.region || {};
    output.region.country = text(region.country, output.region.country, 2).toUpperCase();
    output.region.city = text(region.city, '', 80);
    output.region.timeZone = text(region.timeZone, output.region.timeZone, 80);
    output.region.locationMode = pick(region.locationMode, ['manual', 'approximate', 'precise'], 'manual');
    output.region.latitude = coordinate(region.latitude, -90, 90);
    output.region.longitude = coordinate(region.longitude, -180, 180);

    const units = source.units || {};
    output.units.system = pick(units.system, ['metric', 'imperial', 'custom'], 'metric');
    const unitDefaults = output.units.system === 'imperial'
      ? { temperature: 'fahrenheit', distance: 'miles', speed: 'miles-per-hour', mass: 'pounds', volume: 'gallons-uk', pressure: 'inches-of-mercury' }
      : output.units;
    output.units.temperature = pick(units.temperature, ['celsius', 'fahrenheit'], unitDefaults.temperature);
    output.units.distance = pick(units.distance, ['kilometres', 'miles'], unitDefaults.distance);
    output.units.speed = pick(units.speed, ['kilometres-per-hour', 'miles-per-hour'], unitDefaults.speed);
    output.units.mass = pick(units.mass, ['kilograms', 'pounds'], unitDefaults.mass);
    output.units.volume = pick(units.volume, ['litres', 'gallons-uk', 'gallons-us'], unitDefaults.volume);
    output.units.pressure = pick(units.pressure, ['hectopascals', 'inches-of-mercury'], unitDefaults.pressure);

    const language = source.language || {};
    output.language.primary = text(language.primary, output.language.primary, 35);
    output.language.secondary = text(language.secondary, '', 35);
    output.language.interface = text(language.interface, output.language.primary, 35);
    output.language.content = text(language.content, output.language.primary, 35);

    const formatting = source.formatting || {};
    output.formatting.date = pick(formatting.date, ['day-month-year', 'month-day-year', 'year-month-day', 'locale'], output.formatting.date);
    output.formatting.clock = pick(formatting.clock, ['12-hour', '24-hour', 'locale'], output.formatting.clock);
    output.formatting.currency = text(formatting.currency, output.formatting.currency, 3).toUpperCase();
    output.formatting.weekStart = pick(formatting.weekStart, ['monday', 'sunday', 'saturday', 'locale'], output.formatting.weekStart);

    const behaviour = source.behaviour || {};
    output.behaviour.externalLinks = pick(behaviour.externalLinks, ['new-tab', 'current-tab', 'component-default'], output.behaviour.externalLinks);
    output.behaviour.confirmPrivilegedActions = behaviour.confirmPrivilegedActions !== false;
    output.behaviour.restoreLastView = behaviour.restoreLastView !== false;

    const accessibility = source.accessibility || {};
    output.accessibility.scale = pick(String(accessibility.scale || ''), ['90', '100', '110', '125'], output.accessibility.scale);
    output.accessibility.reducedMotion = accessibility.reducedMotion === true;
    output.accessibility.highContrast = accessibility.highContrast === true;

    const privacy = source.privacy || {};
    output.privacy.allowOptionalNetwork = privacy.allowOptionalNetwork !== false;
    output.privacy.allowApproximateLocation = privacy.allowApproximateLocation === true;
    output.privacy.allowPreciseLocation = privacy.allowPreciseLocation === true;
    if (!output.privacy.allowPreciseLocation && output.region.locationMode === 'precise') output.region.locationMode = 'manual';
    if (!output.privacy.allowApproximateLocation && output.region.locationMode === 'approximate') output.region.locationMode = 'manual';
    if (!output.privacy.allowPreciseLocation || output.region.latitude === null || output.region.longitude === null) {
      output.region.latitude = null;
      output.region.longitude = null;
    }

    const suppliedOverrides = source.schemaVersion === SETTINGS_SCHEMA_VERSION && source.overrides && typeof source.overrides === 'object'
      ? source.overrides : {};
    for (const [component, allowedPaths] of Object.entries(COMPONENT_SETTING_PATHS)) {
      const supplied = suppliedOverrides[component];
      if (!supplied || typeof supplied !== 'object') continue;
      const candidate = clone(output);
      delete candidate.overrides;
      const requestedPaths = [];
      for (const path of allowedPaths) {
        const value = getPath(supplied, path);
        if (value === undefined) continue;
        setPath(candidate, path, value);
        requestedPaths.push(path);
      }
      const normalizedCandidate = normalizeSettings({ ...candidate, schemaVersion: 1 });
      for (const path of requestedPaths) {
        const value = path === 'privacy.allowOptionalNetwork' && output.privacy.allowOptionalNetwork === false
          ? false
          : getPath(normalizedCandidate, path);
        setPath(output.overrides[component], path, value);
      }
    }
    return output;
  }

  function hasOverride(settings, component, path) {
    return getPath(settings?.overrides?.[component], path) !== undefined;
  }

  function effectiveSettings(settings, component = 'global') {
    const normalized = normalizeSettings(settings);
    const effective = clone(normalized);
    delete effective.overrides;
    if (!COMPONENT_SETTING_PATHS[component]) return effective;
    for (const path of COMPONENT_SETTING_PATHS[component]) {
      const value = getPath(normalized.overrides[component], path);
      if (value !== undefined) setPath(effective, path, value);
    }
    if (!normalized.privacy.allowOptionalNetwork) effective.privacy.allowOptionalNetwork = false;
    if (!normalized.privacy.allowPreciseLocation) {
      effective.region.latitude = null;
      effective.region.longitude = null;
    }
    return effective;
  }

  function settingSource(settings, component, path) {
    if (component !== 'global' && hasOverride(settings, component, path)) return 'component';
    return getPath(normalizeSettings(settings), path) === getPath(DEFAULT_SETTINGS, path) ? 'default' : 'global';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function safeDocumentUrl(value) {
    if (typeof value !== 'string' || value.length > 240) return '';
    if (/^https:\/\//i.test(value)) return value;
    if (value.includes('\\') || value.startsWith('/') || value.startsWith('./')) return '';
    const localPath = value.startsWith('../') ? value.slice(3) : value;
    const segments = localPath.split('/');
    if (!segments.length || segments.some(segment => !segment || segment === '..' || !/^[A-Za-z0-9._-]+$/.test(segment))) return '';
    return value;
  }

  function inlineMarkdown(value) {
    return escapeHtml(value).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
      const safe = safeDocumentUrl(url);
      return safe ? `<a href="${escapeHtml(safe)}">${label}</a>` : label;
    }).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function renderMarkdown(source) {
    const lines = String(source || '').replace(/\r/g, '').split('\n');
    const output = [];
    let listOpen = false;
    function closeList() { if (listOpen) { output.push('</ul>'); listOpen = false; } }
    lines.forEach(line => {
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      const item = line.match(/^\s*-\s+(.+)$/);
      if (heading) {
        closeList();
        const level = Math.min(4, heading[1].length + 1);
        output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      } else if (item) {
        if (!listOpen) { output.push('<ul>'); listOpen = true; }
        output.push(`<li>${inlineMarkdown(item[1])}</li>`);
      } else if (line.trim()) {
        closeList();
        output.push(`<p>${inlineMarkdown(line.trim())}</p>`);
      } else closeList();
    });
    closeList();
    return output.join('');
  }

  function componentById(id) {
    return COMPONENTS.find(component => component.id === id) || null;
  }

  return Object.freeze({
    NEXUS_VERSION,
    SETTINGS_SCHEMA_VERSION,
    PREVIEW_STORAGE_KEY,
    LEGACY_PREVIEW_STORAGE_KEYS,
    COMPONENTS,
    COMPONENT_SETTING_PATHS,
    DEFAULT_SETTINGS,
    clone,
    normalizeSettings,
    getPath,
    setPath,
    hasOverride,
    effectiveSettings,
    settingSource,
    escapeHtml,
    safeDocumentUrl,
    renderMarkdown,
    componentById
  });
}));
