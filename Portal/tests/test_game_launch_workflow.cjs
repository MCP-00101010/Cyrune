const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function node() {
  return {children: [], dataset: {}, style: {}, events: {}, className: '',
    classList: {add() {}, remove() {}, contains() {return false;}},
    appendChild(child) {this.children.push(child); return child;},
    addEventListener(name, callback) {this.events[name] = callback;},
    setAttribute() {}, removeAttribute() {}};
}
function context(extra = {}) {
  const c = vm.createContext({document: {createElement: node, querySelector: () => null, getElementById: () => null},
    icon: node, state: {settings: {}}, getActiveBoard: () => ({}), isInboxColumnId: () => false,
    isDynamicFolder: () => false, selectedItemIds: new Set(), computeInheritedTags: () => [], ...extra});
  for (const file of ['game-launcher.js', 'render-items.js', 'render.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../source', file), 'utf8'), c);
  }
  return c;
}

test('game cards remain clickable and have no readiness badges after a failed status lookup', async () => {
  let launches = 0;
  const c = context({bridge: {launchGame: async () => launches++}});
  const game = {type: 'game', id: 'game-card', gameKey: 'game_abcdefghijklmnop', title: 'Elite', tags: []};
  vm.runInContext("gameStatusCache.set('game_abcdefghijklmnop', {state:'unavailable', error:'binding-forgotten'})", c);
  for (const card of [c.createBoardItemElement(game, 'column'), c.createGameSearchResultItem(game)]) {
    const descendants = item => [item, ...item.children.flatMap(descendants)];
    assert.equal(descendants(card).some(item => item.className.includes('application-status')), false);
    assert.equal(card.disabled, undefined);
    card.events.click();
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(launches, 2, 'Each click attempts launch once regardless of cached metadata status');
});

test('launch failures explain missing setup without showing internal binding codes', async () => {
  const notices = [];
  let calls = 0;
  const c = context({showNotice: message => notices.push(message), bridge: {
    launchGame: async () => {calls++; throw new Error('binding-forgotten');},
    getGameStatus: async () => ({state: 'unavailable', error: 'binding-forgotten'})
  }});
  // Rendering is covered above; this test observes the failed action itself.
  c.renderContentSurfaces = () => {};
  c.renderEssentials = () => {};
  c.renderSpeedDial = () => {};
  c.renderBoard = () => {};
  assert.equal(await c.launchGameShortcut({gameKey: 'game_abcdefghijklmnop', title: 'Elite'}), false);
  assert.equal(calls, 1);
  assert.match(notices[0], /saved launch setup.*missing.*Repair shortcut/);
  assert.doesNotMatch(notices[0], /binding-forgotten/);
});

test('public game references persist on metadata refresh and accompany explicit repair', async () => {
  let saves = 0, opened;
  const c = context({saveState: async () => saves++, bridge: {
    getGameStatus: async () => ({state: 'ready', catalogueId: 'stable_catalogue_entry'}),
    openGameInArcade: async (key, options) => {opened = {key, options};}
  }});
  const game = {gameKey: 'game_abcdefghijklmnop', title: 'Elite'};
  await c.refreshGameStatus(game, {render: false});
  assert.equal(game.catalogueId, 'stable_catalogue_entry');
  assert.equal(saves, 1);
  assert.equal(await c.openGameShortcutInArcade(game, {rebind: true}), true);
  assert.equal(opened.options.catalogueId, game.catalogueId);
  assert.equal(opened.options.rebind, true);
});
