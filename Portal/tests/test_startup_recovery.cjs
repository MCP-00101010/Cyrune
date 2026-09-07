const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../source/app.js'), 'utf8');

test('queued games wait for Portal initialization before insertion and acknowledgement', async () => {
  let ready, handler;
  const calls = [];
  const context = vm.createContext({
    hubInitializationPromise: new Promise(resolve => { ready = resolve; }),
    window: { addEventListener: (_name, callback) => { handler = callback; } },
    persistExternalGameDelivery: async detail => { calls.push(detail.game.title); return { ok: true, persisted: 'shared' }; },
    bridge: { respondToPush: (id, result) => calls.push({ id, result }) },
  });
  vm.runInContext(app.slice(app.indexOf("  window.addEventListener('morpheus:receive-game'"),
    app.indexOf("  window.addEventListener('morpheus:update-game-binding'")), context);
  handler({ detail: { game: { title: 'Queued game' }, pushRequestId: 'push1' } });
  await new Promise(setImmediate);
  assert.equal(calls.length, 0);
  ready(); await new Promise(setImmediate);
  assert.equal(calls[0], 'Queued game');
  assert.equal(calls[1].id, 'push1');
  assert.equal(calls[1].result.persisted, 'shared');
});

function harness(mode = 'host') {
  const reloads = [], readOnly = [], intake = [];
  let online = true, loadFails = false, reloadFails = false;
  let location = mode === 'host' ? '/portal.json' : null;
  const context = vm.createContext({
    console: { warn() {} }, state: { databasePath: '' }, defaultState: {},
    STORAGE_KEY: 'morpheus-webhub-state', startSharedDiskPolling() {},
    PORTAL_UI_TEXT: { authorityRecovered: 'Relay recovered' },
    sharedRecoveryCheckInProgress: false, sharedDiskDataReloadInProgress: false,
    sharedStoragePollTimer: null, lastBridgeNativeReady: false, lastBridgeRecoveryPath: '',
    relayHasConnected: false, relayWasUnavailable: false, hubInitializationPromise: null,
    SHARED_DISK_POLL_MS: 5000, SHARED_DISK_NOTICE_KEY: 'notice',
    bridge: {
      whenReady: Promise.resolve(), isAvailable: () => online,
      resumePendingIntake: async () => { intake.push(context.state.hubName); },
      getStorageInfo: async () => ({ authoritativeStorageAvailable: online, storageMode: mode, databasePath: location }),
      loadState: async () => { if (loadFails) throw new Error('Synthetic read failure');
        return { json: '{"hubName":"Saved","databasePath":""}', fromDisk: mode === 'host', fileInfo: { version: 'v1' } }; }
    },
    restoreStateSnapshot: json => { context.state = JSON.parse(json); },
    serializeStateSnapshot: () => JSON.stringify(context.state),
    acceptSharedDiskSnapshot() {}, persistStateToLocalCache() {}, resetSharedDiskBaseline() {},
    ensureLocalCacheMetadata() {}, loadState: () => ({ hubName: 'Cached', databasePath: location || '' }),
    authoritativePortalStorageReady: () => online,
    sharedDiskSyncIsBlocked: () => false, refreshBridgeStatusUi: async () => {},
    reloadHubData: async options => { reloads.push(options); return !reloadFails; },
    setPortalReadOnlyMode: value => readOnly.push(value), getPortalReadOnlyMessage: () => 'Read only',
    renderAll() {}, updateUndoRedoUI() {}, isDirty: false,
    document: { documentElement: { classList: { remove() {} } } },
    localStorage: { getItem: () => '{"hubName":"Cached"}' },
    sessionStorage: { getItem: () => null },
    summarizeHubSnapshot: () => ({}), hubSnapshotContentCount: () => 1,
    setInterval: () => 1, setTimeout: () => 1,
  });
  vm.runInContext(app.slice(app.indexOf('async function handleRecoveredSharedStorage('), app.indexOf('function promptSharedDiskConflict(')), context);
  vm.runInContext(app.slice(app.indexOf('async function initializeHubState()'), app.lastIndexOf('hubInitializationPromise = initializeHubState();')), context);
  return { context, reloads, readOnly, intake,
    online(value) { online = value; }, location(value) { location = value; },
    loadFails(value) { loadFails = value; }, reloadFails(value) { reloadFails = value; },
    async initialize() { context.hubInitializationPromise = context.initializeHubState(); await context.hubInitializationPromise; },
    check: () => context.checkForSharedRecovery() };
}

for (const mode of ['host', 'relay']) {
  test(`normal ${mode} startup and repeated polling do not announce recovery or reload data`, async () => {
    const h = harness(mode);
    await h.initialize();
    assert.deepEqual(h.intake, ['Saved']);
    await h.check(); await h.check();
    assert.equal(h.reloads.length, 0);
    assert.equal(h.context.lastBridgeRecoveryPath, mode === 'host' ? '/portal.json' : 'relay');
  });
}

test('Relay recovery is announced once after an observed outage', async () => {
  const h = harness(); await h.initialize();
  h.online(false); await h.check();
  assert.equal(h.readOnly.at(-1), true);
  h.online(true); await h.check(); await h.check();
  assert.equal(h.reloads.length, 1);
  assert.equal(h.reloads[0].notice, 'Relay recovered');
});

test('Relay first connecting after startup is quiet; a later outage is announced', async () => {
  const h = harness(); h.online(false); await h.initialize();
  await h.check();
  h.online(true); await h.check();
  assert.equal(h.reloads[0].notice, '');
  h.online(false); await h.check();
  h.online(true); await h.check();
  assert.equal(h.reloads[1].notice, 'Relay recovered');
});

test('changing storage location reloads data without claiming Relay reconnected', async () => {
  const h = harness(); await h.initialize();
  h.location('/other.json'); await h.check();
  assert.equal(h.reloads.length, 1);
  assert.equal(h.reloads[0].notice, '');
});

test('recovery checks wait for startup to establish its successful baseline', async () => {
  const h = harness();
  let finish;
  h.context.hubInitializationPromise = new Promise(resolve => { finish = resolve; });
  const check = h.check();
  await Promise.resolve();
  assert.equal(h.reloads.length, 0);
  await h.context.initializeHubState(); finish(); await check;
  assert.equal(h.reloads.length, 0);
});

test('failed recovery retries without consuming the outage notification', async () => {
  const h = harness(); await h.initialize();
  h.online(false); await h.check();
  h.online(true); h.reloadFails(true); await h.check();
  h.reloadFails(false); await h.check(); await h.check();
  assert.equal(h.reloads.length, 2);
  assert.equal(h.reloads[1].notice, 'Relay recovered');
});

test('a failed initial storage read retries quietly while Relay stays connected', async () => {
  const h = harness(); h.loadFails(true); await h.initialize();
  assert.equal(h.intake.length, 0);
  h.loadFails(false); await h.check();
  assert.equal(h.reloads.length, 1);
  assert.equal(h.reloads[0].notice, '');
});
