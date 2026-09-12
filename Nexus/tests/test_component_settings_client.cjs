const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'client', 'component-settings.js'), 'utf8');

function makeClientApi() {
  const context = vm.createContext({ console });
  vm.runInContext(source, context, { filename: 'component-settings.js' });
  return context.CyruneComponentSettingsClient;
}

function profile(component = 'portal-widgets', revision = 2, profileSchemaVersion = 2) {
  return {
    profileSchemaVersion,
    settingsSchemaVersion: 2,
    component,
    revision,
    updatedAt: 1234,
    values: {
      region: { country: 'GB', city: 'London', timeZone: 'Europe/London', locationMode: 'precise', latitude: 51.5, longitude: -0.1, secret: 'drop-me' },
      units: { system: 'metric', temperature: 'celsius' },
      language: { interface: 'en-GB' },
      accessibility: { scale: '110', reducedMotion: true, highContrast: false },
      privacy: { allowOptionalNetwork: false },
      unknown: { value: true },
    },
    sources: { 'region.city': 'component', 'units.system': 'global' },
  };
}

test('component settings client normalizes and clones a fixed profile', () => {
  const api = makeClientApi();
  const normalized = api.normalizeProfile(profile(), 'portal-widgets');
  assert.equal(normalized.values.region.city, 'London');
  assert.equal(normalized.values.accessibility.scale, '110');
  assert.equal(normalized.values.privacy.allowOptionalNetwork, false);
  assert.equal(normalized.values.region.latitude, 51.5);
  assert.equal(normalized.sources['region.city'], 'component');
  assert.equal(normalized.sources['units.system'], 'global');
  assert.equal(normalized.values.region.secret, undefined);
  assert.equal(normalized.values.unknown, undefined);
  normalized.values.region.city = 'Changed';
  assert.equal(api.normalizeProfile(profile(), 'portal-widgets').values.region.city, 'London');
});

test('component settings client rejects unknown or mismatched component roles', () => {
  const api = makeClientApi();
  assert.throws(() => api.normalizeProfile(profile('arcade'), 'portal-widgets'), /role mismatch/);
  assert.throws(() => api.normalizeProfile(profile('portal-widgets'), 'unknown'), /role mismatch/);
  assert.throws(() => api.normalizeProfile(profile('portal-widgets', 2, 1), 'portal-widgets'), /Unsupported/);
  assert.throws(() => api.normalizeProfile({ ...profile(), profileSchemaVersion: 3 }, 'portal-widgets'), /Unsupported/);
});

test('component settings client omits incomplete or invalid coordinate pairs', () => {
  const api = makeClientApi();
  const raw = profile();
  raw.values.region.longitude = 220;
  const normalized = api.normalizeProfile(raw, 'portal-widgets');
  assert.equal(normalized.values.region.latitude, undefined);
  assert.equal(normalized.values.region.longitude, undefined);
});

test('component settings client retains newer revisions and publishes safe copies', async () => {
  const api = makeClientApi();
  const responses = [profile('arcade', 4), profile('arcade', 3)];
  const applied = [];
  const observed = [];
  const client = api.create({
    component: 'arcade',
    request: async () => responses.shift(),
    apply: value => applied.push(value),
  });
  client.subscribe(value => observed.push(value));
  await client.refresh();
  await client.refresh();
  assert.equal(client.get().revision, 4);
  assert.deepEqual(applied.map(value => value.revision), [4]);
  assert.deepEqual(observed.map(value => value.revision), [4]);
  const copy = client.get();
  copy.values.region.country = 'US';
  assert.equal(client.get().values.region.country, 'GB');
});
