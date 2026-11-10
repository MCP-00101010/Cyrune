const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');

function harness(view = 'collection', writable = true) {
  const menus = [], pending = [];
  const game = { id: 'one', view, type: 'Spectrum' };
  const c = vm.createContext({
    state: { gamesById: new Map([['one', game], ['two', { ...game, id: 'two' }]]), selectedIds: new Set(),
      activeCollection: { id: 'fixture', writable } },
    webHubHandoff: {}, ArcadeScrapeDrafts: { load: () => null },
    compatibleGameEmulators: () => [], applyGameDefaultEmulator() {}, updateSelectedRow() {},
    loadGameDetails: id => new Promise(resolve => pending.push({ id, resolve })), renderDetails: async () => {},
    selectedGameList: () => [], canScrapeMetadata: () => writable, isGameFavourite: () => false,
    escapeHtml: value => value, window: { innerWidth: 1280, innerHeight: 800 },
    document: {
      querySelectorAll: () => [...menus], body: { appendChild: menu => menus.push(menu) },
      createElement: () => ({ style: {}, dataset: {}, innerHTML: '', listeners: {}, setAttribute() {},
        addEventListener(name, callback) { this.listeners[name] = callback; },
        querySelectorAll: () => [], querySelector: () => null,
        getBoundingClientRect: () => ({ left: 100, top: 100, width: 230, height: 300 }),
        remove() { menus.splice(menus.indexOf(this), 1); }
      })
    }
  });
  vm.runInContext('let arcadeContextMenuGeneration = 0;', c);
  for (const name of ['showContextMenu', 'hideContextMenu', 'clampMenuToViewport', 'arcadeContextMenuKeydown']) {
    const start = source.indexOf(`function ${name}(`);
    const prefix = source.slice(start - 6, start) === 'async ' ? start - 6 : start;
    vm.runInContext(source.slice(prefix, source.indexOf('\n}', start) + 2), c);
  }
  return { c, menus, pending, open: id => c.showContextMenu({ preventDefault() {}, clientX: 100, clientY: 100 }, id),
    actions: () => [...menus.at(-1).innerHTML.matchAll(/data-action="([^"]+)"/g)].map(match => match[1]) };
}

for (const view of ['collection', 'incoming', 'trash']) {
  test(`${view} menu groups tasks and offers only applicable Portal/collection actions`, async () => {
    const h = harness(view);
    await h.open('one');
    const actions = h.actions();
    assert.equal(actions.includes('send-webhub'), view === 'collection');
    assert.equal(actions.includes('launch-version'), view === 'collection');
    assert.equal(actions.includes('import-incoming'), view === 'incoming');
    assert.equal(actions.includes('restore-trash'), view === 'trash');
    if (view === 'collection') {
      assert.equal(actions[0], 'launch');
      assert.equal(actions.at(-1), 'delete');
      assert.ok(actions.indexOf('explorer') < actions.indexOf('metadata'));
      assert.ok(actions.indexOf('metadata') < actions.indexOf('send-webhub'));
    }
    if (view === 'trash') assert.equal(actions.at(-1), 'purge-trash');
  });
}

test('read-only collections omit file mutations while retaining launch and transfer', async () => {
  const h = harness('collection', false); await h.open('one');
  assert.ok(h.actions().includes('launch') && h.actions().includes('send-webhub'));
  assert.ok(!h.actions().some(action => ['delete', 'rename', 'metadata'].includes(action)));
});

test('menu opens without waiting for details and ignores an older selection response', async () => {
  const h = harness(); await h.open('one');
  assert.equal(h.menus.length, 1);
  await h.open('two');
  h.pending[0].resolve({ id: 'one', title: 'Late details' });
  await new Promise(setImmediate);
  assert.equal(h.c.state.selected.id, 'two');
  assert.equal(h.menus.length, 1);
});
