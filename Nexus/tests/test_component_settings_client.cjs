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

function profile(component = 'portal-widgets', revision = 2) {
  return {
    profileSchemaVersion: 1,
    settingsSchemaVersion: 1,
    component,
    revision,
    updatedAt: 1234,
    values: {
      region: { country: 'GB', city: 'London', timeZone: 'Europe/London', locationMode: 'manual', secret: 'drop-me' },
      units: { system: 'metric', temperature: 'celsius' },
      language: { interface: 'en-GB' },
      accessibility: { scale: '110', reducedMotion: true, highContrast: false },
      privacy: { allowOptionalNetwork: false },
      unknown: { value: true },
    },
  };
}

test('component settings client normalizes and clones a fixed profile', () => {
  const api = makeClientApi();
  const normalized = api.normalizeProfile(profile(), 'portal-widgets');
  assert.equal(normalized.values.region.city, 'London');
  assert.equal(normalized.values.accessibility.scale, '110');
  assert.equal(normalized.values.privacy.allowOptionalNetwork, false);
  assert.equal(normalized.values.region.secret, undefined);
  assert.equal(normalized.values.unknown, undefined);
  normalized.values.region.city = 'Changed';
  assert.equal(api.normalizeProfile(profile(), 'portal-widgets').values.region.city, 'London');
});

test('component settings client rejects unknown or mismatched component roles', () => {
  const api = makeClientApi();
  assert.throws(() => api.normalizeProfile(profile('arcade'), 'portal-widgets'), /role mismatch/);
  assert.throws(() => api.normalizeProfile(profile('portal-widgets'), 'unknown'), /role mismatch/);
  assert.throws(() => api.normalizeProfile({ ...profile(), profileSchemaVersion: 2 }, 'portal-widgets'), /Unsupported/);
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
