const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApplicationLauncher() {
  const state = {
    essentials: [],
    boards: [{
      id: 'board-1',
      title: 'Home',
      speedDial: [null, null, null],
      speedDialSlotCount: 3,
      tabs: [{
        id: 'tab-1',
        title: 'Main',
        columns: [{ id: 'column-1', title: 'Apps', items: [] }],
        inbox: { id: 'inbox-1', items: [] }
      }]
    }]
  };
  let undoCount = 0;
  let renderCount = 0;
  const context = vm.createContext({
    console, state, Date, Math, Map, Promise, structuredClone,
    bridge: { supports: () => true },
    getBoardForContext: () => state.boards[0],
    getActiveBoard: () => state.boards[0],
    getBoardTabs: board => board.tabs,
    getBoardInbox: (_board, tab) => tab.inbox,
    getBoardItemContainers: board => board.tabs[0].columns,
    getBoardTab: board => board.tabs[0],
    isDynamicFolder: () => false,
    firstEmptySpeedDialSlot: board => board.speedDial.findIndex(item => !item),
    setSpeedDialSlot: (board, slot, item) => {
      if (slot < 0 || slot >= board.speedDialSlotCount || board.speedDial[slot]) return false;
      board.speedDial[slot] = item;
      return true;
    },
    findBoardItemInColumns: () => null,
    pushUndoSnapshot: () => { undoCount += 1; },
    renderAll: () => { renderCount += 1; },
    saveState: () => Promise.resolve(),
    showNotice: () => {},
    setTimeout,
    clearTimeout
  });
  const filename = path.join(__dirname, '..', 'source', 'application-launcher.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return { context, state, counts: () => ({ undoCount, renderCount }) };
}

function loadDnd() {
  const application = {
    id: 'app-1', type: 'application', title: 'Editor',
    appKey: 'app_abcdefghijklmnop', applicationKind: 'executable', tags: []
  };
  const board = { id: 'board-1', speedDial: [application] };
  const state = { essentials: [null, { ...application, id: 'app-2' }], importManager: { items: [] } };
  const context = vm.createContext({
    console, state,
    getActiveBoard: () => board,
    removeSpeedDialItemById: (_board, itemId) => {
      const slot = board.speedDial.findIndex(item => item?.id === itemId);
      if (slot === -1) return null;
      const item = board.speedDial[slot];
      board.speedDial[slot] = null;
      return item;
    },
    trimEssentialsTail: () => {
      while (state.essentials.length && !state.essentials.at(-1)) state.essentials.pop();
    }
  });
  const filename = path.join(__dirname, '..', 'source', 'dnd.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return { context, state, board };
}

test('approved applications can be stored in exact Speed Dial and Essentials slots', () => {
  const harness = loadApplicationLauncher();
  harness.context.speedApplication = { appKey: 'app_speed123456789', label: 'Speed App', kind: 'executable' };
  harness.context.essentialApplication = { appKey: 'app_essential123456', label: 'Essential App', kind: 'protocol-link' };

  const speedItem = vm.runInContext("_storeApprovedApplication(speedApplication, { area: 'speed-dial', slot: 2 })", harness.context);
  const essentialItem = vm.runInContext("_storeApprovedApplication(essentialApplication, { area: 'essential', slot: 1 })", harness.context);

  assert.equal(harness.state.boards[0].speedDial[2], speedItem);
  assert.equal(harness.state.essentials[1], essentialItem);
  assert.equal(speedItem.type, 'application');
  assert.equal(essentialItem.type, 'application');
  assert.equal('nativePath' in speedItem, false);
  assert.deepEqual(harness.counts(), { undoCount: 2, renderCount: 2 });

  const entries = vm.runInContext('collectStoredApplications(state)', harness.context);
  assert.deepEqual(JSON.parse(JSON.stringify(entries.map(entry => [entry.area, entry.slot, entry.item.id]))), [
    ['essential', 1, essentialItem.id],
    ['speed-dial-item', 2, speedItem.id]
  ]);
});

test('compact launcher drag rules accept applications and games while preserving item types', () => {
  const harness = loadDnd();

  vm.runInContext("dragPayload = { area: 'board', itemType: 'application', itemId: 'app-1' }", harness.context);
  assert.equal(vm.runInContext('_compactLauncherAreaAllowed(dragPayload.area)', harness.context), true);
  vm.runInContext("dragPayload.itemType = 'game'", harness.context);
  assert.equal(vm.runInContext('_compactLauncherAreaAllowed(dragPayload.area)', harness.context), true);

  vm.runInContext("dragPayload = { area: 'essential', itemType: 'application', itemId: 'app-2', slot: 1 }", harness.context);
  const essentialItem = vm.runInContext('_takeDraggedCompactLauncherItem(getActiveBoard())', harness.context);
  assert.equal(essentialItem.type, 'application');
  assert.equal(harness.state.essentials.length, 0);

  vm.runInContext("dragPayload = { area: 'speed-dial', itemType: 'application', itemId: 'app-1', slot: 0 }", harness.context);
  const speedItem = vm.runInContext('_takeDraggedCompactLauncherItem(getActiveBoard())', harness.context);
  assert.equal(speedItem.type, 'application');
  assert.equal(harness.board.speedDial[0], null);
});

test('compact drop previews reuse application artwork and game thumbnails or system icons', () => {
  const dnd = fs.readFileSync(path.join(__dirname, '..', 'source', 'dnd.js'), 'utf8');
  const itemRenderer = fs.readFileSync(path.join(__dirname, '..', 'source', 'render-items.js'), 'utf8');
  const surfaceRenderer = fs.readFileSync(path.join(__dirname, '..', 'source', 'render.js'), 'utf8');
  const preview = dnd.slice(dnd.indexOf('function createEssentialSlotPreview'), dnd.indexOf('function createExternalSlotPreview'));
  const artwork = itemRenderer.slice(itemRenderer.indexOf('function appendCompactLauncherArtwork'), itemRenderer.indexOf('// --- Board item element ---'));

  assert.match(preview, /appendCompactLauncherArtwork\(wrapper, item, 64\)/);
  assert.match(artwork, /item\.type === 'application' && item\.iconCache/);
  assert.match(artwork, /item\.type === 'game'[\s\S]*?compact-game-thumbnail/);
  assert.match(artwork, /renderGameSystemIcon\(artwork, item\)/);
  assert.match(surfaceRenderer, /const isGame = item\.type === 'game'/);
  assert.match(surfaceRenderer, /registerGameTooltipTarget\(link, item\)/);
  assert.match(surfaceRenderer, /launchGameShortcut\(item\)/);
  assert.match(surfaceRenderer, /refreshGameStatus\(item\)/);
});
