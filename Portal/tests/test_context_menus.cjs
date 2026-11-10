const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function context() {
  const board = { id: 'board', tabs: [{ id: 'tab' }], speedDial: [] };
  const c = vm.createContext({ state: { boards: [board] }, contextTarget: null,
    getActiveBoard: () => board, getGameStatus: () => ({ state: 'ready' }),
    getApplicationStatus: () => ({ state: 'ready' }), findSpeedDialSlot: () => 0,
    isDynamicFolder: () => false, isInboxColumnId: () => false, window: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../source/context.js'), 'utf8'), c);
  c.showContextMenu = (_x, _y, actions) => { c.actions = c._orderedContextMenuActions(actions); };
  return c;
}

test('common game commands retain the same task order across placements and search', () => {
  const c = context(), item = { id: 'game', type: 'game', gameKey: 'game_abcdefghijklmnop' };
  const event = { preventDefault() {}, stopPropagation() {} };
  const actual = [];
  for (const run of [
    () => c.handleBoardContextMenu(event, item, 'column', null, 0),
    () => c.handleEssentialContextMenu(event, 0, item),
    () => c.handleSpeedDialContextMenu(event, item, 0),
    () => c.handleSearchResultContextMenu(event, item, { area: 'board-item', boardId: 'board' })
  ]) {
    run();
    assert.match(c.actions.at(-1).action, /^delete/);
    actual.push(Array.from(c.actions, action => action.action).filter(id =>
      ['launchGame', 'launchGameVersion', 'openGameInArcade', 'revealGame', 'editGame', 'repairGame', 'forgetGame'].includes(id)));
  }
  for (const ordered of actual) assert.deepEqual(ordered, [
    'launchGame', 'launchGameVersion', 'openGameInArcade', 'revealGame', 'editGame'
  ]);
});

test('organization, maintenance and locking precede deletion without changing action identities', () => {
  const c = context();
  const actions = [
    { action: 'deleteItem' }, { action: 'lockItem' }, { action: 'refreshFavicon' },
    { action: 'moveToBoard' }, { action: 'editBookmark' }, { action: 'openNewTab' },
    { label: 'Add to set', group: 'organize', submenu: [{ action: 'set:1' }] }
  ];
  assert.deepEqual(Array.from(c._orderedContextMenuActions(actions), row => row.group),
    ['open', 'edit', 'organize', 'organize', 'tools', 'protect', 'remove']);
  assert.equal(actions[0].action, 'deleteItem');
});

test('all game placements offer repair only for a broken shortcut and never offer forgetting', () => {
  const c = context(), game = {id: 'game', type: 'game', gameKey: 'game_abcdefghijklmnop'};
  const event = {preventDefault() {}, stopPropagation() {}};
  const placements = [
    () => c.handleBoardContextMenu(event, game, 'column', null, 0),
    () => c.handleEssentialContextMenu(event, 0, game),
    () => c.handleSpeedDialContextMenu(event, game, 0),
    () => c.handleSearchResultContextMenu(event, game, {area: 'board-item', boardId: 'board'})
  ];
  for (const status of [{state: 'ready'}, {state: 'checking'}, {state: 'unavailable'},
    {state: 'unavailable', error: 'binding-forgotten'}, {state: 'changed'}, {state: 'unbound'}]) {
    c.getGameStatus = () => status;
    for (const render of placements) {
      render();
      assert.equal(c.actions.some(action => action.action === 'forgetGame'), false);
      assert.equal(c.actions.some(action => /Rebind|Forget/.test(action.label)), false);
      const repair = c.actions.find(action => action.action === 'repairGame');
      assert.equal(!!repair, !!status.error || ['changed', 'unbound'].includes(status.state));
      if (repair) {assert.equal(repair.label, 'Repair shortcut…'); assert.equal(repair.group, 'tools');}
    }
  }
});

test('keyboard menu navigation wraps and reaches the last action', () => {
  const c = context();
  c.document = { activeElement: null };
  const buttons = Array.from({ length: 3 }, (_, id) => ({ id, focus() { c.document.activeElement = this; } }));
  const currentTarget = { querySelectorAll: () => buttons };
  const key = name => c._contextMenuKeydown({ key: name, currentTarget, preventDefault() {}, stopPropagation() {} });
  key('Home'); assert.equal(c.document.activeElement.id, 0);
  key('ArrowUp'); assert.equal(c.document.activeElement.id, 2);
  key('ArrowDown'); assert.equal(c.document.activeElement.id, 0);
  key('End'); assert.equal(c.document.activeElement.id, 2);
});
