const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('Spectrum uses its platform logo and distinct default hardware badges', () => {
  const context = vm.createContext({document:{createElement:()=>({})},icon:id=>({id})});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'source', 'game-launcher.js'), 'utf8'), context);
  const item={gameKey:'game_abcdefghijklmnop',systemId:'zx-spectrum',systemName:'ZX Spectrum'};
  vm.runInContext("gameStatusCache.set('game_abcdefghijklmnop', {state:'ready', defaultVersion:{languages:['en'], platforms:['ZX Spectrum'], systems:['48K-128K']}})",context);
  assert.deepEqual(Array.from(context.getGameDefaultIcons(item), row => [row.label,row.kind]), [['English','language'],['48K','system'],['128K','system']]);
  const container={classList:{add:()=>{}},dataset:{},children:[],appendChild(value){this.children.push(value);}};
  context.renderGameSystemIcon(container,item);
  assert.equal(container.children[0].id,'icon-system-zx-spectrum');
  vm.runInContext("gameStatusCache.set('game_abcdefghijklmnop', {state:'ready', defaultVersion:{languages:['en'], platforms:['ZX Spectrum']}})",context);
  assert.deepEqual(Array.from(context.getGameDefaultIcons(item), row => [row.label,row.kind]), [['English','language']], 'Older Host metadata must not repeat the library favicon as a system badge');
});

test('title icons follow the exact default, stay transient and refresh after a language-only change', async () => {
  let language = 'en'; let renders = 0;
  const item = {gameKey:'game_abcdefghijklmnop', title:'Adventure', emulatorName:'ScummVM'};
  const context = vm.createContext({bridge:{getGameStatus: async () => ({state:'ready', emulatorName:'ScummVM', languages:['en','de'],
    defaultVersion:{languages:[language], platforms:['DOS']}})},
    renderContentSurfaces: () => renders++, saveState: async () => { throw new Error('Default metadata must not persist'); }});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'source', 'game-launcher.js'), 'utf8'), context);
  assert.equal(context.getGameDefaultIcons(item).length, 0);
  await context.refreshGameStatus(item);
  assert.deepEqual(Array.from(context.getGameDefaultIcons(item), value => value.label), ['English','DOS']);
  language = 'de';
  await context.refreshGameStatus(item);
  assert.deepEqual(Array.from(context.getGameDefaultIcons(item), value => value.label), ['German','DOS']);
  assert.equal(renders, 2);
  assert.equal(Object.hasOwn(item, 'defaultVersion'), false);
  for (const value of context.getGameDefaultIcons(item)) assert.ok(fs.existsSync(path.join(__dirname, '..', value.src)));
  vm.runInContext("gameStatusCache.set('game_abcdefghijklmnop', {state:'ready', emulatorName:'ScummVM', defaultVersion:{languages:[], platforms:['../../secret']}})", context);
  assert.equal(context.getGameDefaultIcons(item)[0].src, 'assets/platforms/unknown.svg');
  vm.runInContext("gameStatusCache.set('game_abcdefghijklmnop', {state:'unavailable', defaultVersion:{languages:['en'], platforms:['DOS']}})", context);
  assert.equal(context.getGameDefaultIcons(item).length, 0);
});

test('game shortcuts launch through opaque bindings and retain no native paths', async () => {
  let launched = '';
  let forgotten = '';
  let opened = null;
  let revealed = '';
  const notices = [];
  const item = {
    id: 'game-item-1', type: 'game', title: 'Jetpac', gameKey: 'game_abcdefghijklmnop',
    tags: ['Games', 'ZX Spectrum'], thumbnailCache: 'data:image/png;base64,aQ=='
  };
  const context = vm.createContext({
    console, Map, Promise, Date, Math,
    bridge: {
      supports: capability => capability === 'emuguiService',
      getGameStatus: async gameKey => ({ gameKey, state: 'ready', title: 'Jetpac', thumbnailCache: '' }),
      launchGame: async gameKey => { launched = gameKey; return true; },
      openGameInArcade: async (gameKey, options) => { opened = { gameKey, options }; return true; },
      revealGame: async gameKey => { revealed = gameKey; return true; },
      forgetGame: async gameKey => { forgotten = gameKey; return true; }
    },
    saveState: async () => ({ ok: true }),
    renderBoard: () => {},
    renderContentSurfaces: () => {},
    renderAll: () => {},
    showNotice: message => notices.push(message),
    setTimeout,
    clearTimeout
  });
  const filename = path.join(__dirname, '..', 'source', 'game-launcher.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });

  const status = await context.refreshGameStatus(item, { render: false });
  assert.equal(status.state, 'ready');
  assert.equal(await context.launchGameShortcut(item), true);
  assert.equal(launched, item.gameKey);
  assert.equal(await context.openGameShortcutInArcade(item, { rebind: true }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(opened)), { gameKey: item.gameKey, options: { rebind: true } });
  assert.equal(await context.revealGameShortcut(item), true);
  assert.equal(revealed, item.gameKey);
  assert.equal(await context.forgetGameShortcut(item), true);
  assert.equal(forgotten, item.gameKey);
  assert.equal(context.getGameStatus(item).state, 'unbound');
  assert.equal(/path|command|argument/i.test(JSON.stringify(item)), false);
  assert.match(notices.at(-1), /no longer bound/i);
});

test('game system descriptors cover current and planned emulator families', () => {
  const context = vm.createContext({ console, Map, Promise, Date, Math });
  const filename = path.join(__dirname, '..', 'source', 'game-launcher.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const cases = [
    [{ tags: ['Games', 'ZX Spectrum'] }, ['zx-spectrum', 'icon-system-zx-spectrum']],
    [{ systemId: 'atari-st', systemName: 'Atari ST' }, ['atari-st', 'icon-system-atari-st']],
    [{ systemName: 'Game Boy Color' }, ['game-boy', 'icon-system-game-boy']],
    [{ systemName: 'Super Nintendo' }, ['snes', 'icon-system-snes']],
    [{ systemId: 'scummvm', systemName: 'ScummVM' }, ['scummvm', 'icon-system-scummvm']],
    [{ systemId: 'dosbox', systemName: 'DOSBox' }, ['dosbox', 'icon-system-dosbox']],
    [{ tags: ['Games', 'Arcade'] }, ['mame', 'icon-system-mame']]
  ];
  for (const [item, expected] of cases) {
    const descriptor = context.getGameSystemDescriptor(item);
    assert.deepEqual([descriptor.id, descriptor.iconId], expected);
  }
});

test('game status refresh backfills portable system identity', async () => {
  let saves = 0;
  let statusOptions = null;
  const item = { type: 'game', title: 'Jetpac', gameKey: 'game_abcdefghijklmnop', tags: ['Games'] };
  const context = vm.createContext({
    console, Map, Promise, Date, Math,
    bridge: {
      supports: () => true,
      getGameStatus: async (gameKey, options) => {
        statusOptions = options;
        return { gameKey, state: 'ready', title: 'Jetpac', systemId: 'zx-spectrum', systemName: 'ZX Spectrum', emulatorName: 'EightyOne', profileName: 'Spectrum 48K', thumbnailCache: 'data:image/jpeg;base64,aW1hZ2U=' };
      }
    },
    saveState: async () => { saves += 1; return { ok: true }; },
    renderBoard: () => {}
  });
  const filename = path.join(__dirname, '..', 'source', 'game-launcher.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  await context.refreshGameStatus(item, { render: false });
  assert.equal(item.systemId, 'zx-spectrum');
  assert.equal(item.systemName, 'ZX Spectrum');
  assert.equal(item.thumbnailCache, 'data:image/jpeg;base64,aW1hZ2U=');
  assert.equal(item.emulatorName, 'EightyOne');
  assert.equal(item.profileName, 'Spectrum 48K');
  assert.equal(statusOptions.includeThumbnail, true);
  assert.equal(saves, 1);
});

test('an Arcade rebind refreshes every matching Portal card without changing its opaque key', async () => {
  const first = { id: 'game-1', type: 'game', title: 'Jetpac', gameKey: 'game_abcdefghijklmnop' };
  const second = { id: 'game-2', type: 'game', title: 'Jetpac copy', gameKey: 'game_abcdefghijklmnop' };
  const state = { boards: [{ id: 'board-1', tabs: [{ id: 'tab-1', columns: [{ id: 'column-1', items: [first, second] }], inbox: { id: 'inbox-1', items: [] } }] }] };
  let saves = 0;
  const notices = [];
  const context = vm.createContext({
    console, Map, WeakMap, Promise, Date, Math, state,
    bridge: { supports: () => true },
    getBoardTabs: board => board.tabs || [],
    getBoardInbox: (_board, tab) => tab.inbox,
    isDynamicFolder: () => false,
    saveState: async () => { saves += 1; return { ok: true, persisted: 'shared' }; },
    renderContentSurfaces: () => {},
    renderAll: () => {},
    showNotice: message => notices.push(message)
  });
  const filename = path.join(__dirname, '..', 'source', 'game-launcher.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });

  const result = await context.applyExternalGameBindingUpdate({
    gameKey: 'game_abcdefghijklmnop', state: 'ready', systemId: 'zx-spectrum', systemName: 'ZX Spectrum',
    emulatorName: 'EightyOne', profileName: 'Spectrum 128K', thumbnailCache: 'data:image/png;base64,aQ=='
  });

  assert.equal(result.ok, true);
  assert.equal(saves, 1);
  assert.equal(first.profileName, 'Spectrum 128K');
  assert.equal(second.profileName, 'Spectrum 128K');
  assert.equal(first.gameKey, 'game_abcdefghijklmnop');
  assert.match(notices.at(-1), /rebound/i);
});

test('game state migration strips native launch material', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'source', 'state.js'), 'utf8');
  assert.match(source, /if \(item\.type === 'game'\)/);
  assert.match(source, /delete item\.romPath/);
  assert.match(source, /delete item\.emulatorPath/);
  const contextSource = fs.readFileSync(path.join(__dirname, '..', 'source', 'context.js'), 'utf8');
  const modalSource = fs.readFileSync(path.join(__dirname, '..', 'source', 'modal.js'), 'utf8');
  assert.match(contextSource, /Edit game shortcut/);
  assert.match(modalSource, /case 'editGame'/);
  assert.match(source, /item\.systemId =/);
});

test('game cards use system icons while rich tooltips retain artwork and launch details', () => {
  const boardRenderer = fs.readFileSync(path.join(__dirname, '..', 'source', 'render-items.js'), 'utf8');
  const searchRenderer = fs.readFileSync(path.join(__dirname, '..', 'source', 'render.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'source', 'styles.css'), 'utf8');
  const document = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(boardRenderer, /renderGameSystemIcon\(favicon, item\)/);
  assert.match(searchRenderer, /renderGameSystemIcon\(iconEl, item\)/);
  assert.match(styles, /\.bookmark-favicon\.game-system-icon/);
  assert.match(styles, /\.game-tooltip-thumbnail/);
  assert.match(styles, /\.game-tooltip-detail/);
  for (const id of ['zx-spectrum', 'atari-st', 'game-boy', 'snes', 'scummvm', 'dosbox', 'mame', 'generic']) {
    assert.match(document, new RegExp(`id="icon-system-${id}"`));
  }
});

test('game tooltip details expose safe display labels rather than binding IDs', () => {
  const context = vm.createContext({ console, Map, WeakMap, Promise, Date, Math });
  const filename = path.join(__dirname, '..', 'source', 'game-launcher.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const details = context.getGameTooltipDetails({
    title: 'Jetpac', systemId: 'zx-spectrum', emulatorName: 'EightyOne', profileName: 'Spectrum 48K',
    thumbnailCache: 'data:image/png;base64,aQ==', emulatorId: 'hidden-emulator-id', profileId: 'hidden-profile-id'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(details)), {
    title: 'Jetpac', system: 'ZX Spectrum', emulator: 'EightyOne', profile: 'Spectrum 48K', languages: [], thumbnail: 'data:image/png;base64,aQ=='
  });
  assert.doesNotMatch(JSON.stringify(details), /hidden-/);
});

test('existing shortcuts obtain language flags and the official ScummVM icon from status', async () => {
  const element = tag => ({ tag, children: [], dataset: {}, classList: { add() {} },
    appendChild(child) { this.children.push(child); }, append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; } });
  const context = vm.createContext({ console, Map, WeakMap, Promise, Date, Math,
    document: { createElement: element }, icon: id => ({ id }), saveState: async () => ({ ok: true }),
    bridge: { getGameStatus: async () => ({ state: 'ready', emulatorName: 'ScummVM', profileName: 'ScummVM settings', languages: ['en', 'de'] }) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'source', 'game-launcher.js'), 'utf8'), context);
  const item = { title: 'Adventure', gameKey: 'game_abcdefghijklmnop', systemId: 'dos', systemName: 'DOS' };
  assert.equal(context.getGameTooltipDetails(item).languages.length, 0);
  await context.refreshGameStatus(item, { render: false });
  assert.equal(Object.hasOwn(item, 'languages'), false, 'languages remain transient status metadata');
  const details = context.getGameTooltipDetails(item);
  assert.equal(details.system, 'DOS');
  assert.deepEqual(Array.from(details.languages, value => value.flag), ['de', 'gb']);
  const target = element('a');
  context.registerGameTooltipTarget(target, item);
  const tooltip = element('div');
  context.renderGameTooltip(tooltip, target);
  const title = tooltip.children[0].children[0];
  assert.equal(title.textContent, 'Adventure');
  assert.deepEqual(title.children.map(value => [value.src, value.alt]), [
    ['assets/language-flags/de.svg', 'German'], ['assets/language-flags/gb.svg', 'English']
  ]);
  const favicon = element('div');
  context.renderGameSystemIcon(favicon, item);
  assert.equal(favicon.children[0].src, 'assets/scummvm/scummvm-icon.png');
  assert.equal(favicon.children[0].alt, 'ScummVM');
  assert.equal(favicon.dataset.system, 'scummvm');
  assert.equal(item.systemId, 'dos');
});

test('language flags are bounded, accessible and backed by local licensed assets', () => {
  const context = vm.createContext({ console, Map, WeakMap, Promise, Date, Math });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'source', 'game-launcher.js'), 'utf8'), context);
  const descriptors = context.getGameLanguageDescriptors(['EN', 'en', 'de', 'fr-ca', '../gb', '<svg>', null, { language: 'en' }]);
  assert.deepEqual(Array.from(descriptors, value => [value.flag, value.label]), [
    ['de', 'German'], ['gb', 'English'], ['ca', 'French (Canada)']
  ]);
  assert.equal(context.getGameLanguageDescriptors('de').length, 0);
  assert.equal(context.getGameLanguageDescriptors(Array(12).fill('en').concat('de')).length, 1);
  assert.equal(context.getGameLanguageDescriptors(['zz'])[0].flag, '');
  const countriesOnly = { countries: ['DE'], systemId: 'dos', title: 'German adventure' };
  assert.equal(context.getGameTooltipDetails(countriesOnly).languages.length, 0);
  for (const [flag] of Object.values(vm.runInContext('GAME_LANGUAGE_FLAGS', context))) {
    const svg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'language-flags', `${flag}.svg`), 'utf8');
    assert.match(svg, /<svg/);
    assert.doesNotMatch(svg, /<script|<foreignObject|\son\w+=|(?:href|src)=["'](?:https?:|data:|\/\/)/i);
  }
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'assets', 'scummvm', 'NOTICE.md'), 'utf8'), /CC BY-SA 3\.0/);
});

test('stored games are indexed across compact launchers, columns, folders, and Inboxes for the command palette', () => {
  const launched = [];
  const state = {
    essentials: [{ id: 'game-essential', type: 'game', title: 'Atic Atac', gameKey: 'game_essential123456' }],
    boards: [{ id: 'board-1', title: 'Home', speedDial: [{ id: 'game-speed', type: 'game', title: 'Saboteur', gameKey: 'game_speeddial123456' }], tabs: [{
      id: 'tab-1', title: 'Main',
      columns: [{ id: 'column-1', title: 'Games', items: [{
        id: 'folder-1', type: 'folder', title: 'Spectrum', children: [{
          id: 'game-1', type: 'game', title: 'Jetpac', gameKey: 'game_abcdefghijklmnop', tags: ['ZX Spectrum']
        }]
      }] }],
      inbox: { id: 'inbox-1', items: [{ id: 'game-2', type: 'game', title: 'Knight Lore', gameKey: 'game_qrstuvwxyz123456' }] }
    }] }],
    sets: [], tags: []
  };
  const context = vm.createContext({
    console, Map, Promise, Date, Math, state,
    bridge: { supports: () => true },
    getBoardTabs: board => board.tabs || [],
    getBoardInbox: (_board, tab) => tab.inbox,
    isDynamicFolder: () => false,
    getGameStatus: () => ({ state: 'ready' }),
    launchGameShortcut: item => launched.push(item.title),
    resolveTag: id => ({ name: id }),
    localStorage: { getItem: () => null, setItem: () => {} },
    SMART_VIEW_DEFINITIONS: [], WIDGET_REGISTRY: {},
    collectStoredBookmarks: () => [], resolveSetItems: () => []
  });
  const launcher = path.join(__dirname, '..', 'source', 'game-launcher.js');
  vm.runInContext(fs.readFileSync(launcher, 'utf8'), context, { filename: launcher });
  const stored = Array.from(context.collectStoredGames());
  assert.deepEqual(stored.map(entry => entry.item.title), ['Atic Atac', 'Saboteur', 'Jetpac', 'Knight Lore']);
  assert.deepEqual(stored.slice(0, 2).map(entry => [entry.area, entry.slot]), [['essential', 0], ['speed-dial-item', 0]]);
  assert.match(stored[2].location, /Home \/ Main \/ Games \/ Spectrum/);
  context.launchGameShortcut = item => launched.push(item.title);

  const palette = path.join(__dirname, '..', 'source', 'command-palette.js');
  vm.runInContext(fs.readFileSync(palette, 'utf8'), context, { filename: palette });
  const entries = Array.from(context.buildCommandPaletteEntries()).filter(entry => entry.group === 'Games');
  assert.deepEqual(entries.map(entry => entry.label), ['Atic Atac', 'Saboteur', 'Jetpac', 'Knight Lore']);
  entries[0].run();
  assert.deepEqual(launched, ['Atic Atac']);
});

test('game shortcuts duplicate within Essentials and Speed Dial without changing their binding', () => {
  const essential = { id: 'game-essential', type: 'game', title: 'Jetpac', gameKey: 'game_abcdefghijklmnop' };
  const speed = { id: 'game-speed', type: 'game', title: 'Knight Lore', gameKey: 'game_qrstuvwxyz123456' };
  const board = { id: 'board-1', speedDial: [speed, null, null], speedDialSlotCount: 3, tabs: [] };
  const state = { essentials: [essential], boards: [board] };
  let undoCount = 0;
  const context = vm.createContext({
    console, Map, Promise, Date, Math, state,
    bridge: { supports: () => true },
    contextTarget: null,
    cloneData: value => structuredClone(value),
    getBoardForContext: () => board,
    getActiveBoard: () => board,
    firstEmptySpeedDialSlot: target => target.speedDial.findIndex(item => !item),
    setSpeedDialSlot: (target, slot, item) => {
      if (slot < 0 || target.speedDial[slot]) return false;
      target.speedDial[slot] = item;
      return true;
    },
    findBoardItemInColumns: () => null,
    pushUndoSnapshot: () => { undoCount += 1; },
    renderAll: () => {},
    saveState: async () => ({ ok: true }),
    showNotice: () => {}
  });
  const filename = path.join(__dirname, '..', 'source', 'game-launcher.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });

  assert.equal(context.duplicateGameShortcut({ area: 'essential', slot: 0, item: essential }), true);
  assert.equal(context.duplicateGameShortcut({ area: 'speed-dial-item', slot: 0, item: speed }), true);
  assert.equal(state.essentials[1].gameKey, essential.gameKey);
  assert.equal(board.speedDial[1].gameKey, speed.gameKey);
  assert.equal(undoCount, 2);
});
test('game families collapse within a container without removing portable records', async () => {
  const context = vm.createContext({ console, Map, Promise, Date, Math,
    bridge: { getGameStatus: async key => ({ gameKey: key, state: 'ready', versionGroup: key === 'remake' ? 'deluxe' : 'original' }) } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'source', 'game-launcher.js'), 'utf8'), context);
  const items = [{ type: 'game', gameKey: 'english' }, { type: 'game', gameKey: 'german' },
    { type: 'game', gameKey: 'remake' }, { type: 'bookmark', title: 'Unrelated' }];
  assert.equal(context.groupGameShortcutItems(items).length, 4, 'No guessing before native family identity is known');
  for (const item of items.slice(0, 3)) await context.refreshGameStatus(item, { render: false });
  assert.deepEqual(Array.from(context.groupGameShortcutItems(items)), [items[0], items[2], items[3]]);
  assert.equal(items.length, 4);
  assert.deepEqual(context.groupGameShortcutItems([items[1]])[0], items[1], 'A separate container keeps its own placement');
  assert.equal(JSON.stringify(items).includes('versionGroup'), false);
});
test('startup status refresh stays transient until Portal storage authority is ready', async () => {
  let saves = 0;
  const context = vm.createContext({ console, Map, Promise, Date, Math, portalReadOnlyMode: true,
    bridge: { storageIsAvailable: () => true, getGameStatus: async () => ({ state: 'ready', emulatorName: 'ScummVM', versionGroup: 'family' }) },
    saveState: () => { saves++; }, renderContentSurfaces() {}, renderEssentials() {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'source', 'game-launcher.js'), 'utf8'), context);
  const item = { type: 'game', title: 'Adventure', gameKey: 'game_approved' };
  await context.refreshGameStatus(item);
  assert.equal(saves, 0); assert.equal(item.emulatorName, undefined);
  context.portalReadOnlyMode = false;
  await context.refreshGameStatus(item);
  assert.equal(saves, 1); assert.equal(item.emulatorName, 'ScummVM');
});


test('native Atari default editions show language and hardware badges', () => {
  const context = vm.createContext({ console, Map, Promise, Date, Math });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'source', 'game-launcher.js'), 'utf8'), context);
  const item = { type: 'game', gameKey: 'game_abcdefghijklmnop', systemId: 'atari-st' };
  vm.runInContext("gameStatusCache.set('game_abcdefghijklmnop', {state:'ready', systemId:'atari-st', defaultVersion:{languages:['de'], platforms:['STe'], systems:['STe']}})", context);
  assert.deepEqual(Array.from(context.getGameDefaultIcons(item), row => [row.label, row.kind]), [['German', 'language'], ['STe', 'system']]);
});


test('ScummVM artwork is exclusive to ScummVM games, independent of tags and stale shortcut labels', () => {
  const context = vm.createContext({document:{createElement:()=>({})},icon:id=>({id})});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'source', 'game-launcher.js'), 'utf8'), context);
  const render = item => {
    const container={classList:{add(){}},dataset:{},children:[],appendChild(child){this.children.push(child);}};
    context.renderGameSystemIcon(container,item);
    return container;
  };
  const native = {gameKey:'game_abcdefghijklmnop',systemId:'atari-st',systemName:'Atari ST',tags:['ScummVM'],emulatorName:'ScummVM'};
  vm.runInContext("gameStatusCache.set('game_abcdefghijklmnop', {state:'ready',systemId:'atari-st',emulatorName:'STEem SSE',defaultVersion:{languages:['en'],systems:['STe']}})",context);
  assert.equal(render(native).children[0].id,'icon-system-atari-st');
  assert.deepEqual(Array.from(context.getGameDefaultIcons(native),row=>[row.src,row.label]),[['assets/language-flags/gb.svg','English'],['','STe']]);
  assert.equal(render({systemId:'zx-spectrum',tags:['ScummVM']}).children[0].id,'icon-system-zx-spectrum');
  assert.equal(render({systemId:'scummvm'}).children[0].src,'assets/scummvm/scummvm-icon.png');
  vm.runInContext("gameStatusCache.set('game_abcdefghijklmnop', {state:'ready',systemId:'atari-st',emulatorName:'ScummVM',defaultVersion:{languages:[],systems:['Atari ST']}})",context);
  assert.equal(render(native).children[0].src,'assets/scummvm/scummvm-icon.png');
  assert.equal(context.getGameDefaultIcons(native)[0].src,'assets/platforms/atari-st.png');
  vm.runInContext("gameStatusCache.set('game_abcdefghijklmnop', {state:'ready',systemId:'atari-st',emulatorName:'STEem SSE',defaultVersion:{languages:[],systems:['Unknown hardware']}})",context);
  assert.deepEqual(Array.from(context.getGameDefaultIcons(native),row=>[row.src,row.label]),[['','Unknown hardware']]);
});
