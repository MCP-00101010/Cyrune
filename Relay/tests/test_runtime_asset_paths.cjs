const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

test('managed asset targets are derived by Host behind opaque sessions', () => {
  assert.doesNotMatch(source, /function createAssetWriteSession/);
  assert.doesNotMatch(source, /assetWriteSessions/);
  assert.match(source, /type: 'PORTAL_BEGIN_ASSET_WRITE',[\s\S]*collectionName: options\.collectionName/);
  assert.match(source, /type: 'PORTAL_APPEND_ASSET_WRITE',[\s\S]*sessionId/);
  assert.match(source, /type: 'PORTAL_FINISH_ASSET_WRITE', sessionId/);
  assert.match(source, /type: 'PORTAL_CACHE_ASSET_URL',[\s\S]*collectionName: options\.collectionName/);
});

test('Relay manifest and changelog identify the current component release', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.html'), 'utf8');
  const icon = fs.readFileSync(path.join(__dirname, '..', 'icons', 'icon-48.svg'), 'utf8');
  assert.equal(manifest.version, '1.1.13');
  assert.match(popup, /rel="icon" type="image\/svg\+xml" href="\.\.\/icons\/icon-48\.svg"/);
  assert.match(icon, /RJ45-style connector/);
});

test('authenticated roles advertise fixed component protocols and use a focused Nexus handler', () => {
  for (const declaration of ["'portal-relay': 2", "'arcade-relay': 2", "'nexus-relay': 2", "'host-native': 3"]) {
    assert.match(source, new RegExp(declaration));
  }
  assert.match(source, /function handleNexusRuntimeMessage\(msg, sender, sendResponse\)/);
  assert.match(source, /protocols: RELAY_PROTOCOLS/);
  assert.match(source, /capabilities: RELAY_COMPONENT_CAPABILITIES/);
});

test('remote Arcade artwork requires the authoritative optional-network permission', () => {
  assert.match(source, /NEXUS_GET_COMPONENT_SETTINGS', component: 'arcade'/);
  assert.match(source, /allowOptionalNetwork !== true/);
  assert.match(source, /Optional network access is disabled in Cyrune Nexus/);
  assert.match(source, /target\.protocol !== 'https:'/);
  assert.match(source, /ARCADE_REMOTE_ARTWORK_HOSTS\.has\(target\.hostname\.toLowerCase\(\)\)/);
  assert.match(source, /ARCADE_REMOTE_ARTWORK_HOSTS\.has\(finalUrl\.hostname\.toLowerCase\(\)\)/);
});

test('Portal persistence uses fixed Host operations instead of page-shaped path requests', () => {
  for (const operation of [
    'PORTAL_DATABASE_STAT',
    'PORTAL_DATABASE_READ_CHUNK',
    'PORTAL_DATABASE_WRITE',
    'PORTAL_LIST_DATABASE_BACKUPS',
    'PORTAL_LIST_THEMES',
    'PORTAL_WRITE_THEME'
  ]) assert.match(source, new RegExp(`'${operation}'`));
  for (const legacyOperation of [
    "type: 'READ_FILE_CHUNK'",
    "type: 'WRITE_FILE'",
    "type: 'LIST_THEMES'",
    "type: 'WRITE_THEME'"
  ]) assert.doesNotMatch(source, new RegExp(legacyOperation));
});


test('content bridge advertises the negotiated native Atari adapter for both game clients', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
  for (const role of ['PORTAL', 'ARCADE']) {
    const declaration = content.split('\n').find(line => line.startsWith('const ' + role + '_CLIENT_PROTOCOLS'));
    assert.match(declaration, /'arcade-atari-st': 1/);
  }
});
