const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, '..', 'source', name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const failure = code => Object.assign(new Error('Untrusted native error text'), { code });
const target = { boardId: 'board', tabId: 'tab', columnId: 'column' };
const game = (id = 'one', fields = {}) => ({ catalogueId: id, sourceId: 'source', entryRevision: 'revision', title: 'Jetpac',
  platformId: 'zx-spectrum', platformLabel: 'ZX Spectrum', hardwareLabel: '48K', editionLabel: '', targetKind: 'media-file',
  year: '1983', publisher: 'Ultimate', availability: 'ready', artworkRef: '', ...fields });
const page = (entries, fields = {}) => ({ ok: true, schemaVersion: 1, catalogueRevision: 'catalogue', entries, nextCursor: '', ...fields });
const detail = value => ({ ok: true, schemaVersion: 1, entry: { ...value, description: 'A game', languages: [], countries: [], suggestedTags: ['Action'] } });
const bound = payload => ({ ok: true, schemaVersion: 1, requestId: payload.requestId, results: payload.entries.map(value => ({
  catalogueId: value.catalogueId, ok: true, game: { title: 'Jetpac', systemId: 'zx-spectrum', systemName: 'ZX Spectrum',
    gameKey: `game_abcdefghijkl_${value.catalogueId}`, state: 'ready', tags: [] }
})) });
function harness(overrides = {}) {
  const calls = { binds: [], saves: [], reads: [] };
  let uuid = 0;
  const deps = { session: () => 1, uuid: () => `request-${++uuid}`, prepare: async () => {}, destination: () => {},
    search: async payload => { calls.reads.push(payload); return page([game()]); }, detail: async id => detail(game(id)),
    artwork: async () => null, bind: async payload => { calls.binds.push(plain(payload)); return bound(payload); },
    persist: async (destination, games) => { calls.saves.push(plain({ destination, games })); return { ok: true }; }, ...overrides };
  const context = vm.createContext({ TextEncoder });
  vm.runInContext(source('game-picker.js'), context);
  const picker = vm.runInContext('arcadeGamePicker', context).create(deps, target);
  return { picker, deps, calls };
}

test('ScummVM original platforms and variants survive mixed selection and compact placement', async () => {
  const rows = [game(), game('dos', { title: 'Monkey Island', platformId: 'dos', platformLabel: 'DOS', targetKind: 'scummvm-game', editionLabel: 'English' }),
    game('win', { title: 'Monkey Island', platformId: 'windows', platformLabel: 'Windows', targetKind: 'scummvm-game', editionLabel: 'German' })];
  const { picker, calls } = harness({ search: async () => page(rows), bind: async payload => {
    const result = bound(payload);
    result.results.forEach(item => {
      const row = rows.find(row => row.catalogueId === item.catalogueId);
      Object.assign(item.game, { title: row.title, systemId: row.platformId, systemName: row.platformLabel });
    });
    return result;
  } });
  await picker.search(); rows.slice().reverse().forEach(picker.toggle); await picker.confirm();
  assert.equal(picker.model.phase, 'complete');
  assert.deepEqual(calls.saves[0].games.map(game => game.systemId), ['windows', 'dos', 'zx-spectrum']);
  assert.doesNotMatch(JSON.stringify(calls.saves), /targetId|engineId|directory|arguments|catalogueId/);
});

test('picker rejects platform substitution after a ScummVM selection', async () => {
  const row = game('dos', { platformId: 'dos', platformLabel: 'DOS', targetKind: 'scummvm-game' });
  const { picker, calls } = harness({ search: async () => page([row]) });
  await picker.search('', ['dos']); picker.toggle(row); await picker.confirm();
  assert.equal(calls.saves.length, 0);
  assert.equal(picker.model.phase, 'refresh-required');
});

test('picker searches bounded pages, retains distinct variants and confirms in selection order', async () => {
  const { picker, calls } = harness();
  await picker.search('Jetpac', ['zx-spectrum']);
  assert.deepEqual(plain(calls.reads), [{ query: 'Jetpac', platformIds: ['zx-spectrum'], pageSize: 50, cursor: '' }]);
  picker.toggle(game('two', { hardwareLabel: '128K' })); picker.toggle(game());
  await picker.confirm();
  assert.equal(picker.model.phase, 'complete');
  assert.deepEqual(calls.binds[0].entries.map(value => value.catalogueId), ['two', 'one']);
  assert.equal(calls.saves.length, 1);
  assert.deepEqual(calls.saves[0].destination, target);
  assert.deepEqual(calls.saves[0].games[0].suggestedTags, []);
  assert.doesNotMatch(JSON.stringify(calls.saves), /catalogueId|sourceId|entryRevision|requestId|description|artworkRef/);
});

test('obsolete searches cannot replace newer results and closing drops late reads', async () => {
  const pending = [];
  const { picker } = harness({ search: () => { const item = deferred(); pending.push(item); return item.promise; } });
  const first = picker.search('old'); const second = picker.search('new'); await tick();
  pending[1].resolve(page([game('new')])); await second;
  pending[0].resolve(page([game('old')])); await first;
  assert.equal(picker.model.rows[0].catalogueId, 'new');
  const last = picker.search('late'); await tick(); assert.equal(picker.close(), true);
  pending[2].resolve(page([game('late')])); await last;
  assert.equal(picker.model.rows.length, 0);
  assert.equal(picker.model.nextCursor, ''); assert.equal(picker.model.query, '');
});

test('paging bounds the draft to 200 rows and selection to 100 games', async () => {
  let index = 0;
  const { picker } = harness({ search: async () => page(Array.from({ length: 50 }, () => game(`id${index++}`)), { nextCursor: 'next' }) });
  for (let count = 0; count < 6; count++) await picker.search('', [], count > 0);
  assert.equal(picker.model.rows.length, 200);
  picker.model.rows.slice(0, 101).forEach(picker.toggle);
  assert.equal(picker.model.selected.size, 100);
  assert.match(picker.model.error, /at most 100/);
  picker.toggle(game('missing', { availability: 'media-missing' }));
  assert.equal(picker.model.selected.size, 100);
});

test('revision changes and overlapping pages require a fresh search', async () => {
  for (const next of [page([game('two')], { catalogueRevision: 'changed' }), page([game()])]) {
    let count = 0;
    const { picker } = harness({ search: async () => count++ ? next : page([game()], { nextCursor: 'next' }) });
    await picker.search(); await picker.search('', [], true);
    assert.equal(picker.model.rows.length, 0); assert.equal(picker.model.nextCursor, '');
    assert.match(picker.model.error, /catalogue changed/);
  }
});

test('malformed envelopes and extra authority fields never enter the draft', async () => {
  for (const response of [page([game('one', { path: 'private' })]), page([game('one', { platformId: ['dos'], platformLabel: 'DOS', targetKind: 'scummvm-game' })]), page([game()], { ok: false }), page([game()], { schemaVersion: 2 }), page([game(), game()])]) {
    const { picker } = harness({ search: async () => response }); await picker.search();
    assert.equal(picker.model.rows.length, 0); assert.ok(picker.model.error);
    assert.doesNotMatch(picker.model.error, /private|Untrusted/);
  }
});

test('details use exact entry artwork and discard mismatched or obsolete replies', async () => {
  const old = deferred();
  const { picker } = harness({ detail: async id => id === 'old' ? old.promise : detail(game(id, { artworkRef: 'art' })),
    artwork: async () => ({ ok: true, schemaVersion: 1, catalogueId: 'different', artworkRef: 'art', contentType: 'image/png', width: 1, height: 1, data: 'aQ==' }) });
  const first = picker.inspect(game('old')); await tick(); await picker.inspect(game('new'));
  old.resolve(detail(game('old'))); await first;
  assert.equal(picker.model.detail.catalogueId, 'new'); assert.equal(picker.model.artwork, '');
});

test('explicit tag copying uses at most two reads and checks selected revisions before binding', async () => {
  let active = 0, peak = 0;
  const { picker, calls } = harness({ detail: async id => { active++; peak = Math.max(peak, active); await tick(); active--; return detail(game(id)); } });
  for (let i = 0; i < 10; i++) picker.toggle(game(`id${i}`));
  await picker.confirm(true);
  assert.equal(peak, 2); assert.equal(calls.saves.length, 1);
  assert.deepEqual(calls.saves[0].games[0].suggestedTags, ['Action']);
  const stale = harness({ detail: async id => detail(game(id, { entryRevision: 'changed' })) });
  stale.picker.toggle(game()); await stale.picker.confirm(true);
  assert.equal(stale.calls.binds.length, 0); assert.equal(stale.picker.model.phase, 'refresh-required');
});

test('duplicate confirmation and dismissal cannot interrupt a binding batch', async () => {
  const pending = deferred(); let binds = 0;
  const { picker, calls } = harness({ bind: async payload => { binds++; await pending.promise; return bound(payload); } });
  picker.toggle(game()); const first = picker.confirm(); await tick();
  await picker.confirm(); assert.equal(picker.close(), false); assert.equal(binds, 1);
  pending.resolve(); await first; await picker.confirm(); await picker.place();
  assert.equal(calls.saves.length, 1);
});

test('a busy binding can be explicitly retried using the identical ordered request', async () => {
  const requests = [];
  const { picker, calls } = harness({ bind: async payload => { requests.push(plain(payload)); if (requests.length === 1) throw failure('busy'); return bound(payload); } });
  picker.toggle(game()); await picker.confirm(true);
  assert.equal(picker.model.phase, 'retry'); assert.equal(requests.length, 1);
  await picker.confirm(false, true);
  assert.deepEqual(requests[1], requests[0]); assert.equal(calls.saves.length, 1);
  assert.deepEqual(calls.saves[0].games[0].suggestedTags, ['Action']);
});

test('fatal connection errors require a fresh selection and never replay a binding', async () => {
  for (const code of ['timeout', 'unavailable', 'unauthorized', 'unsupported-protocol']) {
    let epoch = 1, binds = 0;
    const { picker, calls } = harness({ session: () => epoch, bind: async () => { binds++; epoch++; throw failure(code); } });
    picker.toggle(game()); await picker.confirm(); await picker.confirm(false, true);
    assert.equal(binds, 1); assert.equal(calls.saves.length, 0); assert.equal(picker.model.phase, 'refresh-required');
    picker.refresh(); await tick(); assert.equal(picker.model.selected.size, 0); assert.equal(picker.model.phase, 'browse');
  }
});

test('a session change during storage preparation prevents binding', async () => {
  let epoch = 1;
  const { picker, calls } = harness({ session: () => epoch, prepare: async () => { epoch++; } });
  picker.toggle(game()); await picker.confirm();
  assert.equal(calls.binds.length, 0); assert.equal(picker.model.phase, 'refresh-required');
});

test('partial binding successes are saved once while per-entry errors remain visible', async () => {
  const { picker, calls } = harness({ bind: async payload => { const response = bound(payload); response.results[1] = { catalogueId: 'two', ok: false, code: 'media-missing' }; return response; } });
  picker.toggle(game()); picker.toggle(game('two')); await picker.confirm();
  assert.equal(calls.saves[0].games.length, 1); assert.match(picker.model.failures.get('two'), /file is missing/);
  assert.equal(picker.model.selected.size, 2);
});

test('malformed binding batches never partially enter Portal state', async () => {
  for (const corrupt of [result => { result.results.reverse(); }, result => { result.results[1].game.path = 'private'; }, result => { result.requestId = 'other'; }, result => { result.ok = false; }]) {
    const { picker, calls } = harness({ bind: async payload => { const response = bound(payload); corrupt(response); return response; } });
    picker.toggle(game()); picker.toggle(game('two')); await picker.confirm();
    assert.equal(calls.saves.length, 0); assert.equal(picker.model.phase, 'refresh-required');
  }
});

test('loss of the captured column retains approved results without fallback or rebinding', async () => {
  let available = true;
  const { picker, calls, deps } = harness({ destination: () => { if (!available) throw failure('destination-unavailable'); },
    bind: async payload => { available = false; return bound(payload); } });
  picker.toggle(game()); await picker.confirm();
  assert.equal(picker.model.phase, 'approved'); assert.equal(calls.saves.length, 0);
  deps.bind = () => assert.fail('must not rebind approved results');
  available = true; await picker.place(); assert.equal(calls.saves.length, 1);
  assert.deepEqual(calls.saves[0].destination, target);
});

test('failed or conflicted saves are terminal and cannot duplicate insertion', async () => {
  for (const outcome of [{ ok: false }, { ok: true, conflict: true }, null]) {
    let saves = 0;
    const { picker } = harness({ persist: async () => { saves++; if (!outcome) throw failure('unavailable'); return outcome; } });
    picker.toggle(game()); await picker.confirm(); await picker.place(); await picker.confirm(); picker.refresh();
    assert.equal(saves, 1); assert.equal(picker.model.phase, 'save-failed'); assert.match(picker.model.error, /storage recovery/);
  }
});

function stateHarness() {
  const column = { id: 'column', items: [] }, other = { id: 'other-column', items: [] };
  const tab = { id: 'tab', columns: [column] }, board = { id: 'board', tabs: [tab] };
  const state = { boards: [board, { id: 'other', tabs: [{ id: 'other-tab', columns: [other] }] }], activeBoardId: 'other', tags: [{ id: 'action', name: 'Action' }] };
  let saves = 0, undo = 0, id = 0;
  const context = vm.createContext({ state, bridge: { storageIsAvailable: () => true }, portalReadOnlyMode: false,
    sharedDiskSyncIsBlocked: () => false, isInboxColumnId: value => value === 'inbox', crypto: { randomUUID: () => String(++id) },
    pushUndoSnapshot: () => { undo++; }, invalidateDerivedCaches: () => {}, renderContentSurfaces: () => {},
    createTag: name => { const tag = { id: `tag${++id}`, name }; state.tags.push(tag); return tag; }, saveState: async () => { saves++; return { ok: true }; } });
  const script = source('state.js');
  vm.runInContext(script.slice(script.indexOf('function resolveGamePickerDestination('), script.indexOf('function getActiveBoard()')), context);
  return { context, state, column, other, board, tab, counts: () => ({ saves, undo }) };
}

test('batch persistence uses the captured column, one Undo/save and portable fields only', async () => {
  const h = stateHarness();
  await h.context.persistGamePickerBatch(target, [
    { title: 'Jetpac', systemId: 'zx-spectrum', systemName: 'ZX Spectrum', gameKey: 'game_abcdefghijklmnop', suggestedTags: ['Action', 'New', 'New', '', ' '], path: 'private', catalogueId: 'one' },
    { title: 'Another', systemId: 'zx-spectrum', systemName: 'ZX Spectrum', gameKey: 'game_abcdefghijklmnop', suggestedTags: [] }
  ]);
  assert.deepEqual(h.counts(), { saves: 1, undo: 1 }); assert.equal(h.other.items.length, 0);
  assert.equal(h.column.items.length, 2); assert.equal(h.state.tags.length, 2);
  assert.deepEqual(plain(h.column.items[0].tags), ['action', h.state.tags[1].id]);
  assert.deepEqual(Object.keys(h.column.items[0]).sort(), ['gameKey', 'id', 'systemId', 'systemName', 'tags', 'thumbnailCache', 'title', 'type']);
  assert.notEqual(h.column.items[0].id, h.column.items[1].id);
});

test('captured destination validation rejects removed, locked, full and read-only destinations', () => {
  for (const change of [h => { h.board.locked = true; }, h => { h.tab.locked = true; }, h => { h.column.locked = true; },
    h => { h.tab.columns = []; }, h => { h.column.items = Array(10000).fill({}); }, h => { h.context.portalReadOnlyMode = true; },
    h => { h.context.bridge.storageIsAvailable = () => false; }, h => { h.context.sharedDiskSyncIsBlocked = () => true; }]) {
    const h = stateHarness(); change(h);
    assert.throws(() => h.context.resolveGamePickerDestination(target, 1), error => ['storage-unavailable', 'destination-unavailable'].includes(error.code));
    assert.deepEqual(h.counts(), { saves: 0, undo: 0 }); assert.equal(h.other.items.length, 0);
  }
});

async function bridgeHarness({ activated = false, handshake = {}, answer = () => ({ ok: false, code: 'busy' }) } = {}) {
  const listeners = [], requests = [], timers = [];
  const window = { location: { href: 'file:///Portal/index.html' }, addEventListener: (type, listener) => { if (type === 'message') listeners.push(listener); }, dispatchEvent: () => {},
    postMessage: message => {
      requests.push(plain(message));
      const response = message.type === 'MW_PING' ? { ok: true, nativeAvailable: true, protocols: { 'portal-relay': 2, 'component-settings': 2, 'arcade-catalogue': 1 }, capabilities: ['emuguiService'], ...handshake } : answer(message);
      if (response) setImmediate(() => emit({ _mw: true, _res: true, id: message.id, ...response }));
    } };
  const emit = data => listeners.forEach(listener => listener({ source: window, data }));
  const context = vm.createContext({ window, document: { hidden: false, hasFocus: () => true },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return setTimeout(callback, delay); }, clearTimeout });
  let script = source('bridge.js');
  // Exercise a legacy Portal participant alongside the activated release.
  if (!activated) script = script.replace(", 'arcade-catalogue': 1", '');
  vm.runInContext(script, context); const bridge = vm.runInContext('bridge', context); await bridge.whenReady;
  return { bridge, requests, emit, timers };
}

test('legacy Portal catalogue gate refuses all four routes without emitting requests', async () => {
  const { bridge, requests } = await bridgeHarness(); assert.equal(bridge.catalogueIsAvailable(), false);
  for (const work of [() => bridge.searchArcadeCatalogue({}), () => bridge.getArcadeCatalogueEntry('one'), () => bridge.getArcadeCatalogueArtwork('one', 'art'), () => bridge.bindArcadeCatalogueEntries({})])
    await assert.rejects(work(), error => error.code === 'unsupported-protocol');
  assert.equal(requests.length, 1);
});

test('optional catalogue support does not disable core Portal with older Relay or unavailable Arcade', async () => {
  for (const handshake of [{ protocols: { 'portal-relay': 2, 'component-settings': 2 } }, { nativeAvailable: false }, { capabilities: [] }]) {
    const { bridge } = await bridgeHarness({ activated: true, handshake });
    assert.equal(bridge.isAvailable(), true); assert.equal(bridge.catalogueIsAvailable(), false);
    await assert.rejects(bridge.searchArcadeCatalogue({}), error => error.code === 'unsupported-protocol');
  }
});

test('catalogue bridge removes only transport envelope fields and retains fixed error codes', async () => {
  const { bridge, requests } = await bridgeHarness({ activated: true, answer: message => message.type === 'MW_SEARCH_ARCADE_CATALOGUE' ? page([game()]) : { ok: false, code: 'busy', error: 'private path' } });
  const payload = { query: '', platformIds: [], pageSize: 50, cursor: '' };
  assert.deepEqual(plain(await bridge.searchArcadeCatalogue(payload)), page([game()]));
  assert.deepEqual(requests[1].payload, { ...payload, groupVersions: true }); assert.equal(requests[1].protocol, 1);
  await assert.rejects(bridge.bindArcadeCatalogueEntries({}), error => error.code === 'busy' && !error.message.includes('private'));
});

test('Relay reconnection rejects pending catalogue bindings without replaying them', async () => {
  const { bridge, requests, emit } = await bridgeHarness({ activated: true, answer: () => null });
  const epoch = bridge.catalogueSession(); const pending = bridge.bindArcadeCatalogueEntries({ requestId: 'one', entries: [] });
  const rejected = assert.rejects(pending, error => error.code === 'unauthorized');
  emit({ _mw: true, _relayReady: true }); await rejected;
  assert.equal(requests.filter(value => value.type === 'MW_BIND_ARCADE_CATALOGUE_ENTRIES').length, 1);
  assert.ok(bridge.catalogueSession() > epoch);
});
test('grouped catalogue rejection is reported without an old-client retry', async () => {
  const { bridge, requests } = await bridgeHarness({ activated: true, answer: () => ({ok:false, code:'invalid-request'}) });
  await assert.rejects(bridge.searchArcadeCatalogue({ query:'Elite' }), error => error.code === 'invalid-request');
  assert.equal(requests.filter(message => message.type === 'MW_SEARCH_ARCADE_CATALOGUE').length, 1);
});

test('Game Boy cartridge results retain variant labels in the picker', async () => {
  const cartridge=game('advance',{platformId:'game-boy',platformLabel:'Game Boy',hardwareLabel:'GBA'});
  const {picker}=harness({search:async()=>page([cartridge])});
  await picker.search('', ['game-boy']);
  assert.equal(picker.model.rows[0].hardwareLabel,'GBA');
});
