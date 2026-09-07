const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');

test('single-game Send cannot silently replace a missing or incompatible pinned profile', () => {
  const context = vm.createContext({state: {emulators: [{id:'spectrum', type:'eightyone'}],
    emulatorProfiles: [{id:'wrong', emulator_id:'other'}, {id:'absent-file', emulator_id:'spectrum', managed_exists:false}]},
    els: {emulator: {value:'spectrum'}}, compatibleGameEmulators: () => [{id:'spectrum'}],
    automaticProfileForGame: () => ({id:'automatic'})});
  vm.runInContext(source.slice(source.indexOf('function resolveLaunchBinding('), source.indexOf('async function sendSelectedToWebHub(')), context);
  for (const emulator_profile of ['deleted', 'wrong', 'absent-file']) {
    assert.throws(() => context.resolveLaunchBinding({emulator_profile}), /saved emulator profile/i);
  }
  assert.equal(context.resolveLaunchBinding({}).profileId, 'automatic');
});

test('scraper previews discard old responses and disable Apply during a new lookup', async () => {
  const pending = [], applied = [];
  const choice = {dataset: {scrapeMatch:'0'}};
  const button = {disabled:true}, error = {};
  const provider = {value:'first', addEventListener(name, fn) {this[name] = fn;}};
  const preview = {querySelector: () => choice, addEventListener(name, fn) {this[name] = fn;}};
  const overlay = {isConnected:true, querySelector(selector) {return ({'#scrape-provider':provider, '#scrape-error':error,
    '#scrape-preview-content':preview, '[data-action="apply"]':button})[selector];},
    addEventListener(name, fn) {this[name] = fn;}};
  const context = vm.createContext({state: {selected: {id:'game', title:'Game'}, activeCollection: {writable:true}},
    document: {createElement: () => overlay, body: {appendChild() {}}}, escapeHtml:String,
    optionalNetworkAllowed: () => true, prepareArtworkAssets: async () => {}, renderScrapePreview: payload => payload.provider,
    api: route => route === '/api/scrapers' ? Promise.resolve({providers:[]}) : new Promise(resolve => pending.push(resolve)),
    applySelectedScrapeMatch: async (_overlay, _game, payload) => applied.push(payload.provider)});
  vm.runInContext(source.slice(source.indexOf('async function showScrapePreviewModal('), source.indexOf('function renderScrapePreview(')), context);
  const first = context.showScrapePreviewModal();
  await new Promise(setImmediate);
  provider.value = 'second'; const second = provider.change();
  assert.equal(button.disabled, true);
  pending[1]({provider:'second', matches:[{}]}); await second;
  pending[0]({provider:'first', matches:[{}]}); await first;
  assert.equal(preview.innerHTML, 'second');
  await overlay.click({target:{closest: () => ({dataset:{action:'apply'}})}});
  assert.deepEqual(applied, ['second']);
  const third = provider.change();
  assert.equal(button.disabled, true);
  pending[2]({provider:'third', matches:[{}]}); await third;
});

test('a filtered edition still renders its full family and the saved default', () => {
  const first = { id: 'en', version_group: 'original', default_version: 'de', title: 'Adventure', system: 'DOS', languages: ['en'], countries: ['GB'], version: 'VGA' };
  const second = { id: 'de', version_group: 'original', default_version: 'de', title: 'Adventure', system: 'Windows', languages: ['de'], countries: ['DE'], version: 'Talkie' };
  const remake = { id: 'deluxe', title: 'Adventure Deluxe', languages: ['en'] };
  const context = vm.createContext({ state: { versionGroups: new Map([['original', [first, second]], ['deluxe', [remake]]]) } });
  vm.runInContext(source.slice(source.indexOf('function groupedGameRows('), source.indexOf('const ARCADE_LANGUAGE_FLAGS')), context);
  const result = JSON.parse(JSON.stringify(context.groupedGameRows([first, second, remake])));
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'de');
  assert.deepEqual(result[0].languages, ['en', 'de']);
  assert.deepEqual(result[0].version_systems, ['DOS', 'Windows']);
  assert.deepEqual(result[0].version_editions, ['VGA', 'Talkie']);
  assert.equal(context.groupedGameRows([first])[0].id, 'de', 'A language filter does not change launch policy');
  assert.equal(first.system, 'DOS', 'The native version records are not modified');
});

test('flags use only local allowlisted assets and unknown codes retain accessible labels', () => {
  const context = vm.createContext({ LANGUAGE_NAMES: { EN: 'English', DE: 'German' }, COUNTRY_NAMES: { GB: 'United Kingdom' },
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;') });
  vm.runInContext(source.slice(source.indexOf('const ARCADE_LANGUAGE_FLAGS'), source.indexOf('async function showGameVersions(')), context);
  const flags = context.renderVersionFlags(['EN', 'de', 'en', '../../native'], true);
  assert.equal((flags.match(/<img /g) || []).length, 2);
  assert.match(flags, /alt="English"/);
  assert.match(flags, /alt="German"/);
  assert.equal(flags.includes('src="assets/language-flags/../'), false);
  assert.match(context.renderVersionFlags(['GB'], false), /gb\.svg/);
  assert.equal(context.renderVersionFlags(['fr', 'en', 'de', 'EN'], true), context.renderVersionFlags(['de', 'fr', 'en'], true));
  for (const filename of [...flags.matchAll(/src="([^"]+)"/g)].map(match => match[1])) {
    assert.ok(fs.existsSync(path.join(__dirname, '../web', filename)));
  }
});

test('context emulator choices match target kind, format and availability', () => {
  const context = vm.createContext({state: {emulators: [
    {id:'scumm', type:'scummvm', available:true, supported_extensions:[]},
    {id:'spectrum', type:'spectaculator', available:true, supported_extensions:['.tap', '.z80']},
    {id:'other', type:'generic', available:true, supported_extensions:['.st']},
    {id:'missing', type:'scummvm', available:false}
  ]}});
  vm.runInContext(source.slice(source.indexOf('function compatibleGameEmulators('), source.indexOf('async function showContextMenu(')), context);
  assert.deepEqual(Array.from(context.compatibleGameEmulators({type:'ScummVM', extension:''}), row => row.id), ['scumm']);
  assert.deepEqual(Array.from(context.compatibleGameEmulators({extension:'.Z80'}), row => row.id), ['spectrum']);
  assert.equal(context.compatibleGameEmulators({extension:'.nes'}).length, 0);
});

test('collection switches reset the launcher to a compatible collection default or available fallback', () => {
  const state = {emulators:[
    {id:'missing', type:'spectaculator', available:false},
    {id:'spectrum', type:'eightyone', available:true},
    {id:'alternate', type:'spectaculator', available:true},
    {id:'scumm', type:'scummvm', available:true}
  ], activeCollection:{id:'scummvm', platform_id:'scummvm', default_emulator:'scumm'}};
  const emulator = {value:'', innerHTML:''};
  const context = vm.createContext({state, els:{emulator}, escapeHtml:String,
    collectionPlatform:collection => collection.platform_id || 'zx-spectrum'});
  vm.runInContext(source.slice(source.indexOf('function renderEmulators('), source.indexOf('function showEmulatorProfileModal(')), context);
  context.renderEmulators();
  assert.equal(emulator.value, 'scumm');
  assert.equal(emulator.innerHTML.includes('value="spectrum"'), false);
  state.activeCollection = {id:'spectrum'};
  context.renderEmulators();
  assert.equal(emulator.value, 'spectrum', 'An unset default must not inherit ScummVM');
  assert.equal(emulator.innerHTML.includes('value="scumm"'), false);
  emulator.value='alternate';
  context.renderEmulators();
  assert.equal(emulator.value,'alternate','An ordinary refresh preserves a compatible manual choice');
  state.activeCollection={id:'second-spectrum',default_emulator:'spectrum'};
  context.renderEmulators();
  assert.equal(emulator.value,'spectrum','A different collection restores its own default');
  state.activeCollection={id:'scummvm',platform_id:'scummvm',default_emulator:'scumm'};
  context.renderEmulators();
  assert.equal(emulator.value,'scumm');
  state.emulators=[];
  context.renderEmulators();
  assert.equal(emulator.value,'');
});

test('launch resolution rejects incompatible pins and recovers from a stale platform selection', () => {
  const state={emulators:[
    {id:'scumm',type:'scummvm',available:true},
    {id:'spectrum',type:'eightyone',available:true,supported_extensions:['.tap']}
  ], emulatorProfiles:[], activeCollection:{default_emulator:'spectrum'}};
  const context=vm.createContext({state,els:{emulator:{value:'scumm'}},automaticProfileForGame:()=>({id:'48k'})});
  vm.runInContext(source.slice(source.indexOf('function compatibleGameEmulators('),source.indexOf('async function showContextMenu(')),context);
  vm.runInContext(source.slice(source.indexOf('function resolveLaunchBinding('),source.indexOf('async function sendSelectedToWebHub(')),context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.resolveLaunchBinding({extension:'.tap'}))),{emulatorId:'spectrum',profileId:'48k'});
  assert.throws(()=>context.resolveLaunchBinding({extension:'.tap',default_emulator:'scumm'}),/incompatible/);
  assert.throws(()=>context.resolveLaunchBinding({extension:'.tap'},'scumm'),/incompatible/);
  assert.throws(()=>context.resolveLaunchBinding({extension:'.nes'}),/No compatible emulator/);
  assert.deepEqual(JSON.parse(JSON.stringify(context.resolveLaunchBinding({type:'ScummVM'}))),{emulatorId:'scumm',profileId:''});
});

test('sending a shortcut reports an invalid emulator pin without an unhandled rejection', async () => {
  const messages=[];
  const context=vm.createContext({state:{selected:{id:'game'}},
    resolveLaunchBinding:()=>{throw new Error('Incompatible saved emulator');},
    renderDetails:async (message,error)=>messages.push([message,error])});
  vm.runInContext(source.slice(source.indexOf('async function sendSelectedToWebHub('),source.indexOf('async function sendGamesToPortal(')),context);
  await context.sendSelectedToWebHub();
  assert.deepEqual(messages,[['Incompatible saved emulator',true]]);
});
test('platform badges preserve all options, retain hardware tooltips and never interpolate asset paths', () => {
  const context = vm.createContext({ escapeHtml: value => String(value).replaceAll('"', '&quot;').replaceAll('<', '&lt;') });
  vm.runInContext(source.slice(source.indexOf('const ARCADE_PLATFORM_ICONS'), source.indexOf('async function showGameVersions(')), context);
  const html = context.renderPlatformIcons({ version_platforms: ['DOS', 'Windows', 'Steam', 'Unspecified platform', '../../private'] });
  assert.equal((html.match(/<img /g) || []).length, 4);
  for (const label of ['DOS', 'Windows', 'Steam edition', 'Unspecified platform']) assert.ok(html.includes(`alt="${label}"`));
  assert.equal(html.includes('../../private'), false);
  const spectrum = context.renderPlatformIcons({ version_systems: ['48K', '128K'] });
  assert.equal((spectrum.match(/game-system-badge/g) || []).length, 2);
  assert.match(spectrum, />48K<.*>128K</);
  assert.equal(context.renderPlatformIcons({version_systems:['128K', '16K-48K', '48K']}), context.renderPlatformIcons({version_systems:['16K','48K','128K']}));
  for (const filename of [...html.matchAll(/src="([^"]+)"/g)].map(match => match[1])) assert.ok(fs.existsSync(path.join(__dirname, '../web', filename)));
});


test('platform column profiles migrate the old layout and survive switching, reset and reload', () => {
  const defs = [{key:'title', width:340, visible:true}, {key:'series', width:150, visible:true}];
  let saved = JSON.stringify({columnOrder:['title'], columnWidths:{title:420}, columnVisibility:{title:true}});
  const context = vm.createContext({COLUMN_DEFS:defs, COLUMN_MAP:new Map(defs.map(row => [row.key,row])),
    COLLECTION_PLATFORMS:{'zx-spectrum':'ZX Spectrum', scummvm:'ScummVM'}, UI_STORAGE_KEY:'legacy-key',
    localStorage:{getItem:()=>saved,setItem:(key,value)=>{assert.equal(key,'legacy-key');saved=value;}},
    state:{}, renderTableStructure:()=>{},renderList:()=>{}});
  vm.runInContext(source.slice(source.indexOf('function columnSettings('), source.indexOf('function visibleColumns(')),context);
  context.state.ui=context.loadUiState();
  context.restorePlatformColumns('zx-spectrum');
  assert.equal(context.state.ui.columnWidths.title,420);
  context.state.ui.columnWidths.title=500;
  context.state.ui.columnVisibility.series=false;
  context.restorePlatformColumns('scummvm');
  assert.equal(context.state.ui.columnWidths.title,420,'New platforms start from the original layout');
  assert.equal(context.state.ui.columnVisibility.series,true);
  context.state.ui.columnOrder=['series','title'];
  context.state.ui.columnWidths.title=300;
  context.saveUiState();
  context.state.ui=context.loadUiState(); context.state.columnPlatform=null;
  context.restorePlatformColumns('zx-spectrum');
  assert.equal(context.state.ui.columnWidths.title,500);
  assert.equal(context.state.ui.columnVisibility.series,false);
  context.restorePlatformColumns('scummvm');
  assert.deepEqual(Array.from(context.state.ui.columnOrder),['series','title']);
  assert.equal(context.state.ui.columnWidths.title,300);
  Object.assign(context.state.ui,context.columnSettings()); context.saveUiState();
  context.restorePlatformColumns('zx-spectrum');
  assert.equal(context.state.ui.columnWidths.title,500,'Reset affects only the current platform');
  assert.equal(context.collectionPlatform({adapter:'scummvm-config-v1'}),'scummvm');
  assert.equal(context.collectionPlatform({platform_id:'zx-spectrum'}),'zx-spectrum');
});
