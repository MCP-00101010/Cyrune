const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
function loadFunction(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}

function fixture() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set(['hidden']);
      nodes.set(id, {
        value: '', listeners: {},
        classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle() {} },
        addEventListener(type, listener) { this.listeners[type] = listener; },
        querySelector: () => ({}), querySelectorAll: () => [], focus() {}
      });
    }
    return nodes.get(id);
  };
  const board = { id: 'board', tabs: [
    { id: 'first', columns: [{ id: 'first-column', items: [] }] },
    { id: 'second', columns: [{ id: 'target-column', items: [] }] }
  ] };
  const other = { id: 'other', tabs: [{ id: 'other-tab', columns: [{ id: 'other-column', items: [] }] }] };
  const sandbox = vm.createContext({
    WIDGET_REGISTRY: {}, _wstgAbort: null, AbortController, URL, console,
    document: { getElementById: node }, window: { addEventListener() {} }, elements: { modalOverlay: node('overlay') },
    state: { boards: [board, other], activeBoardId: board.id, navItems: [] },
    contextTarget: { columnId: 'target-column' }, cloneData: structuredClone,
    centerPanel() {}, makeDraggable() {},
    saves: 0, undo: 0, renders: 0,
    saveState() { sandbox.saves++; }, pushUndoSnapshot() { sandbox.undo++; },
    renderAll() { sandbox.renders++; }, renderNav() { sandbox.renders++; }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'Widgets/content-feeds/media-watchlist-widget.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'Widgets/personal-productivity/browser-activity-widget.js'), 'utf8'), sandbox);
  for (const name of ['getActiveBoard', 'getBoardTabs', 'findBoardTabByColumnId']) vm.runInContext(loadFunction('Portal/source/state.js', name), sandbox);
  vm.runInContext(loadFunction('Widgets/core/widgets.js', '_newWidgetState'), sandbox);
  // The settings renderer is separate from the host's Done/Cancel lifecycle.
  sandbox.WIDGET_REGISTRY.mediaWatchlist.renderSettings = draft => {
    draft.data.records.push({ id: 'series', type: 'series', title: 'Example series' });
  };
  const widgets = fs.readFileSync(path.join(root, 'Widgets/core/widgets.js'), 'utf8');
  vm.runInContext(widgets.slice(widgets.indexOf('function openWidgetSettings('), widgets.indexOf('// Built-in widgets')), sandbox);
  for (const name of ['_refreshContextSource', '_contextActionIsReadOnly', 'handleContextMenuAction']) vm.runInContext(loadFunction('Portal/source/context.js', name), sandbox);
  return { sandbox, node, board, other };
}

test('Done creates Media Watchlist in its original tab and closes settings after an async commit', async () => {
  const { sandbox, node, board, other } = fixture();
  vm.runInContext("handleContextMenuAction('addWidget:mediaWatchlist')", sandbox);
  assert.equal(node('widgetSettingsPanel').classList.contains('hidden'), false);
  assert.equal(board.tabs[1].columns[0].items.length, 0);
  sandbox.state.activeBoardId = other.id;
  sandbox.contextTarget = { columnId: 'other-column' };
  await node('wstgDoneBtn').listeners.click();
  const items = board.tabs[1].columns[0].items;
  assert.equal(items.length, 1);
  assert.equal(items[0].widgetType, 'mediaWatchlist');
  assert.equal(items[0].data.records[0].title, 'Example series');
  assert.equal(board.tabs[0].columns[0].items.length, 0);
  assert.equal(other.tabs[0].columns[0].items.length, 0);
  assert.equal(node('widgetSettingsPanel').classList.contains('hidden'), true);
  assert.equal(node('overlay').classList.contains('hidden'), true);
  assert.equal(sandbox.saves, 1);
  assert.equal(sandbox.undo, 1);
});

test('Cancel discards a new Media Watchlist without saving or creating an undo entry', () => {
  const { sandbox, node, board } = fixture();
  vm.runInContext("handleContextMenuAction('addWidget:mediaWatchlist')", sandbox);
  node('wstgCancelBtn').listeners.click();
  assert.equal(board.tabs[1].columns[0].items.length, 0);
  assert.equal(node('widgetSettingsPanel').classList.contains('hidden'), true);
  assert.equal(sandbox.saves, 0);
  assert.equal(sandbox.undo, 0);
});

test('Browser Activity opens creation settings and Done adds it without enabling tracking', async () => {
  const { sandbox, node, board } = fixture();
  vm.runInContext("handleContextMenuAction('addWidget:browserActivity')", sandbox);
  assert.equal(node('widgetSettingsPanel').classList.contains('hidden'), false);
  assert.match(node('wstgBody').innerHTML, /Idle cutoff/);
  assert.equal(board.tabs[1].columns[0].items.length, 0);
  await node('wstgDoneBtn').listeners.click();
  const widget = board.tabs[1].columns[0].items[0];
  assert.equal(widget.widgetType, 'browserActivity');
  assert.deepEqual(JSON.parse(JSON.stringify(widget.config)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(widget.data)), {});
  assert.equal(sandbox.saves, 1);
});

test('Cancel discards Browser Activity creation without saving', () => {
  const { sandbox, node, board } = fixture();
  vm.runInContext("handleContextMenuAction('addWidget:browserActivity')", sandbox);
  node('wstgCancelBtn').listeners.click();
  assert.equal(board.tabs[1].columns[0].items.length, 0);
  assert.equal(sandbox.saves, 0);
});
