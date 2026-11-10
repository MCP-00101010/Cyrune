const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function harness(options = {}) {
  const state = { activeBoardId: 'board', activeTabId: 'tab', boards: [{ id: 'board', tabs: [
    { id: 'tab', inbox: { items: [] } }, { id: 'other', inbox: { items: [] } }
  ] }], importManager: { items: [] } };
  const calls = { saves: 0, reloads: 0, undo: 0, automation: 0, render: [], prepare: 0 };
  let sequence = 0;
  let saved = '';
  const timers = [];
  const undoHistory = [];
  const context = vm.createContext({ state, console, Date, Math,
    setTimeout: options.fakeTimers ? callback => { timers.push(callback); return callback; } : setTimeout,
    clearTimeout: options.fakeTimers ? () => {} : clearTimeout,
    isValidUrl: value => /^https?:\/\//.test(value), normalizeUrl: value => value,
    createFolderRecord: (title, rest) => ({ type: 'folder', title, ...rest }),
    prepareForExternalDelivery: async () => { calls.prepare++; return options.prepare || { ok: true }; },
    pushUndoSnapshot: () => { calls.undo++; undoHistory.push(JSON.stringify(state)); },
    getBoardTabs: board => board.tabs,
    getBoardInbox: (board, tab) => tab.inbox,
    getBoardTab: board => board.tabs[0],
    getActiveBoard: () => state.boards.find(board => board.id === state.activeBoardId),
    getActiveTab: () => state.boards[0].tabs.find(tab => tab.id === state.activeTabId),
    findBoardTabById: (board, id) => board.tabs.find(tab => tab.id === id),
    findBoardItemInList: (items, id) => items.find(item => item.id === id) ? { item: items.find(item => item.id === id) } : null,
    renderNav: () => calls.render.push('nav'),
    renderBoardTabBar: () => calls.render.push('tabs'),
    updateInboxBadge: () => calls.render.push('badge'),
    showNotice: () => {},
    getLocalStateMutationSequence: () => sequence,
    getAuthoritativePortalSnapshot: () => saved,
    phaseTwoWalkItems: (items, source, records, parent) => items.forEach(item => records.push({ item, source, parent })),
    phaseTwoApplyAutomationRecords: (records, opts) => { calls.automation++; options.automate?.(records, state, opts); },
    saveState: async () => {
      calls.saves++; sequence++;
      const result = options.save ? await options.save(calls.saves, state, () => sequence++) : { ok: true, persisted: 'shared' };
      if (result.ok && !result.conflict) saved = JSON.stringify(state);
      return result;
    },
    reloadHubData: async () => {
      calls.reloads++;
      undoHistory.length = 0; // reloadHubData clears real Undo/Redo history.
      if (options.reload) return options.reload(state, value => { saved = JSON.stringify(value); });
      state.boards[0].tabs.forEach(tab => { tab.inbox.items = []; });
      state.importManager = { items: [] };
      saved = JSON.stringify(state);
      return true;
    }
  });
  for (const name of ['import.js', 'external-deliveries.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'source', name), 'utf8'), context);
  }
  context.renderImportManagerPanel = () => calls.render.push('import');
  context.getImportManagerCounts = () => ({ bookmarks: state.importManager.items.length, folders: 0 });
  const receive = (kind, detail) => vm.runInContext('portalExternalDeliveries', context).receive(kind, detail);
  return { state, calls, receive, timers, context, undoHistory, setSaved: value => { saved = value; } };
}

const payloads = {
  'bookmark-inbox': { deliveryId: '42', title: 'Example', url: 'https://example.com' },
  'game-inbox': { deliveryId: '42', game: { gameKey: 'game_abcdefghijklmnop', title: 'Game', romPath: 'private', arguments: ['private'] } },
  'import-manager': { deliveryId: '42', items: [{ type: 'bookmark', title: 'Example', url: 'https://example.com' }] }
};
const itemsFor = (state, kind) => kind === 'import-manager' ? state.importManager.items : state.boards[0].tabs[0].inbox.items;

for (const kind of Object.keys(payloads)) {
  test(`${kind} waits for the loaded snapshot before capturing its destination or saving`, async () => {
    const gate = deferred();
    const h = await harness();
    h.context.hubInitializationPromise = gate.promise;
    const pending = h.receive(kind, payloads[kind]);
    await new Promise(setImmediate);
    assert.equal(h.calls.prepare, 0);
    assert.equal(h.calls.saves, 0);
    // Initialization replaces the defaults with the existing user's snapshot.
    h.state.boards[0].id = 'loaded-board';
    h.state.activeBoardId = 'loaded-board';
    h.state.boards[0].tabs[0].inbox.items.push({ id: 'existing', type: 'bookmark', url: 'https://existing.example' });
    gate.resolve();
    assert.equal((await pending).ok, true);
    assert.equal(h.state.boards[0].tabs[0].inbox.items[0].id, 'existing');
    assert.equal(h.calls.saves, 1);
    assert.equal(itemsFor(h.state, kind).some(item => item.id.includes('delivery-42')), true);
  });

  test(`${kind} persists before returning success and acknowledges saved duplicates without writing`, async () => {
    const gate = deferred();
    const h = await harness({ save: () => gate.promise });
    let completed = false;
    const result = h.receive(kind, payloads[kind]).then(value => { completed = true; return value; });
    await new Promise(setImmediate);
    assert.equal(completed, false);
    assert.equal(h.calls.saves, 1);
    gate.resolve({ ok: true, persisted: 'shared' });
    assert.equal((await result).ok, true);
    const duplicate = await h.receive(kind, payloads[kind]);
    assert.equal(duplicate.duplicate, true);
    assert.equal(h.calls.saves, 1);
    assert.equal(itemsFor(h.state, kind).length, 1);
    assert.equal(h.calls.undo, 1);
    if (kind !== 'import-manager') assert.deepEqual(h.calls.render, ['nav', 'tabs', 'badge']);
  });

  test(`${kind} rebases exactly once with one usable Undo snapshot after reload`, async () => {
    const h = await harness({ save: n => n === 1 ? { ok: false, conflict: true } : { ok: true } });
    assert.equal((await h.receive(kind, payloads[kind])).ok, true);
    assert.equal(h.calls.reloads, 1);
    assert.equal(h.calls.saves, 2);
    assert.equal(h.calls.undo, 2); // Initial candidate, then fresh post-reload baseline.
    assert.equal(h.undoHistory.length, 1);
    assert.equal(itemsFor(h.state, kind).length, 1);
    Object.assign(h.state, JSON.parse(h.undoHistory.pop()));
    assert.equal(itemsFor(h.state, kind).length, 0);
  });

  test(`${kind} verifies a local duplicate absent from the authoritative snapshot`, async () => {
    const h = await harness({ save: n => n === 1 ? { ok: false, error: 'write failed' } : { ok: true } });
    assert.equal((await h.receive(kind, payloads[kind])).ok, false);
    assert.equal((await h.receive(kind, payloads[kind])).ok, true);
    assert.equal(h.calls.saves, 2);
    assert.equal(h.calls.undo, 1);
    assert.equal(h.undoHistory.length, 1);
    assert.equal(itemsFor(h.state, kind).length, 1);
    Object.assign(h.state, JSON.parse(h.undoHistory.pop()));
    assert.equal(itemsFor(h.state, kind).length, 0);
  });
}

test('game validation rejects invalid bindings/images and projects only portable fields', async () => {
  const h = await harness();
  assert.equal((await h.receive('game-inbox', { game: { gameKey: 'bad' } })).ok, false);
  assert.equal((await h.receive('game-inbox', { game: { gameKey: 'game_abcdefghijklmnop', thumbnailCache: 'x'.repeat(700001) } })).ok, false);
  assert.equal(h.calls.saves, 0);
  await h.receive('game-inbox', {...payloads['game-inbox'], game: {...payloads['game-inbox'].game, catalogueId: 'stable_game_entry'}});
  const item = itemsFor(h.state, 'game-inbox')[0];
  assert.equal(item.gameKey, 'game_abcdefghijklmnop');
  assert.equal(item.catalogueId, 'stable_game_entry');
  assert.equal(item.romPath, undefined);
  assert.equal(item.arguments, undefined);
});

test('conflict never reloads over an intervening user edit and never retries twice', async () => {
  const h = await harness({ save: (n, state, mutate) => { mutate(); return { ok: false, conflict: true }; } });
  assert.equal((await h.receive('bookmark-inbox', payloads['bookmark-inbox'])).conflict, true);
  assert.equal(h.calls.reloads, 0);
  const retry = await harness({ save: () => ({ ok: false, conflict: true }) });
  assert.equal((await retry.receive('bookmark-inbox', payloads['bookmark-inbox'])).conflict, true);
  assert.equal(retry.calls.reloads, 1);
  assert.equal(retry.calls.saves, 2);
});

test('rebase retains the captured tab and refuses a removed destination', async () => {
  const h = await harness({ save: n => n === 1 ? { ok: false, conflict: true } : { ok: true }, reload: state => {
    state.boards[0].tabs[0].inbox.items = []; state.activeTabId = 'other'; return true;
  } });
  assert.equal((await h.receive('bookmark-inbox', payloads['bookmark-inbox'])).ok, true);
  assert.equal(h.state.boards[0].tabs[0].inbox.items.length, 1);
  assert.equal(h.state.boards[0].tabs[1].inbox.items.length, 0);
  const removed = await harness({ save: () => ({ ok: false, conflict: true }), reload: state => { state.boards[0].tabs.shift(); return true; } });
  assert.equal((await removed.receive('bookmark-inbox', payloads['bookmark-inbox'])).ok, false);
  assert.equal(removed.calls.saves, 1);
});

test('timeout fences subsequent deliveries until the underlying save settles and prevents late rebase', async () => {
  const gate = deferred();
  const h = await harness({ fakeTimers: true, save: () => gate.promise });
  const first = h.receive('bookmark-inbox', payloads['bookmark-inbox']);
  await new Promise(setImmediate);
  h.timers[0]();
  assert.equal((await first).timedOut, true);
  const second = h.receive('game-inbox', payloads['game-inbox']);
  await new Promise(setImmediate);
  assert.equal(h.calls.saves, 1);
  assert.equal(h.calls.prepare, 1);
  gate.resolve({ ok: false, conflict: true });
  assert.equal((await second).conflict, true);
  assert.equal(h.calls.reloads, 1); // Only the second, still-live delivery may rebase.
  assert.equal(h.calls.saves, 3);
});

test('unavailable authority prevents any mutation', async () => {
  const h = await harness({ prepare: { ok: false, error: 'unavailable' } });
  assert.equal((await h.receive('bookmark-inbox', payloads['bookmark-inbox'])).ok, false);
  assert.equal(h.calls.saves, 0);
  assert.equal(h.calls.undo, 0);
});

test('shared polling uses semantic snapshots and startup rejects an empty successful read', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'source', 'app.js'), 'utf8');
  assert.match(app, /snapshotsMatch\(liveJson, currentJson\)/);
  assert.match(app, /!loaded\?\.json && loaded\?\.fileInfo\?\.exists !== false/);
  assert.match(app, /The shared database returned no hub data/);
});


test('queued deliveries keep their original destination while another save is pending', async () => {
  const gate = deferred();
  const h = await harness({ save: n => n === 1 ? gate.promise : { ok: true } });
  const first = h.receive('bookmark-inbox', payloads['bookmark-inbox']);
  await new Promise(setImmediate);
  const queued = h.receive('game-inbox', payloads['game-inbox']);
  h.state.activeTabId = 'other';
  gate.resolve({ ok: true });
  await first;
  assert.equal((await queued).ok, true);
  assert.equal(h.state.boards[0].tabs[0].inbox.items.length, 2);
  assert.equal(h.state.boards[0].tabs[1].inbox.items.length, 0);
});

test('an expired queued delivery never inserts after the earlier write settles', async () => {
  const gate = deferred();
  const h = await harness({ fakeTimers: true, save: () => gate.promise });
  const first = h.receive('bookmark-inbox', payloads['bookmark-inbox']);
  await new Promise(setImmediate);
  const queued = h.receive('game-inbox', payloads['game-inbox']);
  h.timers[1]();
  assert.equal((await queued).timedOut, true);
  gate.resolve({ ok: true });
  await first;
  await new Promise(setImmediate);
  assert.equal(h.calls.saves, 1);
  assert.equal(h.state.boards[0].tabs[0].inbox.items.length, 1);
});

test('automation routing is reapplied with a fresh Undo baseline after authoritative reload', async () => {
  const h = await harness({
    save: n => n === 1 ? { ok: false, conflict: true } : { ok: true },
    automate: (records, state) => records.forEach(({ item, parent }) => {
      parent.splice(parent.indexOf(item), 1);
      item.tags = ['fresh-tag'];
      state.boards[0].tabs[1].inbox.items.push(item);
    })
  });
  assert.equal((await h.receive('bookmark-inbox', payloads['bookmark-inbox'])).ok, true);
  assert.equal(h.state.boards[0].tabs[0].inbox.items.length, 0);
  assert.equal(h.state.boards[0].tabs[1].inbox.items.length, 1);
  assert.equal(h.calls.automation, 2);
  assert.equal(h.calls.undo, 2);
  assert.equal(h.undoHistory.length, 1);
  assert.equal((await h.receive('bookmark-inbox', payloads['bookmark-inbox'])).duplicate, true);
  assert.equal(h.calls.saves, 2);
});

test('Import Manager keeps nested delivery IDs stable and does not open the panel', async () => {
  const h = await harness();
  const result = await h.receive('import-manager', { deliveryId: 'tree', items: [
    { type: 'folder', title: 'Folder', children: [ { type: 'bookmark', url: 'https://example.com' }, { type: 'bookmark', url: 'javascript:bad' } ] }
  ] });
  assert.equal(result.ok, true);
  const folder = h.state.importManager.items[0];
  assert.equal(folder.id, 'bm-import-delivery-tree-0');
  assert.equal(folder.children.length, 1);
  assert.equal(folder.children[0].id, 'bm-import-delivery-tree-0-0');
  assert.deepEqual(h.calls.render, ['import']);
});
