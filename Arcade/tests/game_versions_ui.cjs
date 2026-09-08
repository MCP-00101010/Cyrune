require('../web/platforms.js');
require('../web/metadata-scraping.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../web/scrape-views.js'),'utf8');

test('game dialogs use fresh versions even when the cached list contains only one edition', async () => {
  const versions = ['007','Empire','Replicants'].map((release, i) => ({
    catalogueId:`catalogue-${i}`, gameId:`game-${i}`, collectionId:'atari',
    imageFiles:[`Powermonger (1990)(Bullfrog)[cr ${release}].st`], label:'ST'}));
  const state = {activeCollection:{id:'atari'}, games:[{id:'game-0',catalogue_id:'catalogue-0',file_name:'old.st'}]};
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state, api:async () => ({versions})});
  vm.runInContext(source.slice(source.indexOf('async function loadGameDialogVersions('),source.indexOf('async function showGameProperties(')),context);
  const result = await context.loadGameDialogVersions({id:'game-0'}, 'atari');
  assert.equal(result.versions.length, 3);
  assert.deepEqual(Array.from(result.versions,v=>v.gameId),['game-0','game-1','game-2']);
  assert.equal(result.versions[0].imageFiles[0],versions[0].imageFiles[0]);
  state.activeCollection.id='other';
  await assert.rejects(context.loadGameDialogVersions({id:'game-0'},'atari'), /collection changed/);
});

test('single-game Send cannot silently replace a missing or incompatible pinned profile', () => {
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state: {emulators: [{id:'spectrum', type:'eightyone'}],
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
  const pending = [], applied = [], requests = [], artwork = [];
  let timer;
  const choice = {dataset: {scrapeMatch:'0'}};
  const button = {disabled:true}, error = {};
  const provider = {value:'first', addEventListener(name, fn) {this[name] = fn;}};
  const search = {value:'Game', addEventListener(name, fn) {this[name] = fn;}};
  const platform = {value:'current', addEventListener(name, fn) {this[name] = fn;}};
  const preview = {querySelector: selector => selector.startsWith('[data-scrape-images') ? null : choice, addEventListener(name, fn) {this[name] = fn;}};
  const overlay = {isConnected:true, querySelector(selector) {return ({'#scrape-provider':provider, '#scrape-error':error,
    '#scrape-preview-content':preview, '#scrape-search-term':search, '#scrape-search-platform':platform, '[data-action="apply"]':button})[selector];},
    addEventListener(name, fn) {this[name] = fn;}};
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms, ArcadeMetadataScraping:globalThis.ArcadeMetadataScraping,state: {selected: {id:'game', title:'Game', type:'Atari ST'}, activeCollection: {writable:true}},
    canScrapeMetadata:()=>true, rememberScraperProvider(){}, populateScraperProviders:async()=>[
      {id:'first',type:'screenscraper'},
      {id:'second',type:'thegamesdb'}],
    setTimeout:fn=>{timer=fn;return 1;}, clearTimeout:()=>{timer=null;},
    document: {createElement: () => overlay, body: {appendChild() {}}}, escapeHtml:String,
    optionalNetworkAllowed: () => true, prepareArtworkAssets: async values => {artwork.push(values);}, renderScrapePreview: payload => payload.provider,
    api: (route, options) => {
      if (route === '/api/scrape-targets') return Promise.resolve({games:[{id:'game', scrape_searches:{first:{search_term:'Remembered title', search_platform:'all'}}}]});
      requests.push(JSON.parse(options.body));return new Promise(resolve => pending.push(resolve));},
    applySelectedScrapeMatch: async (_overlay, _game, payload) => applied.push(payload.provider)});
  vm.runInContext(source.slice(source.indexOf('async function showScrapePreviewModal('), source.indexOf('function renderScrapePreview(')), context);
  const first = context.showScrapePreviewModal();
  await new Promise(setImmediate);
  assert.equal(requests[0].search_platform,'all');
  assert.equal(requests[0].search_term,'Remembered title');
  assert.match(platform.innerHTML,/Current system.*Atari ST/);
  assert.match(platform.innerHTML,/All platforms/);
  assert.doesNotMatch(platform.innerHTML,/Amiga/);
  assert.equal(platform.disabled,false,'Older provider payloads do not disable platform selection');
  provider.value = 'second'; const second = provider.change();
  assert.equal(requests[1].search_platform,'current');
  assert.equal(requests[1].search_term,undefined,'Different providers retain independent search defaults');
  assert.equal(button.disabled, true);
  pending[1]({provider:'second', query:{search_term:'Actual provider term'}, matches:[{}]}); await second;
  pending[0]({provider:'first', matches:[{}]}); await first;
  assert.equal(preview.innerHTML, 'second');
  assert.equal(search.value,'Actual provider term');
  await overlay.click({target:{closest: () => ({dataset:{action:'apply'}})}});
  assert.deepEqual(applied, ['second']);
  const third = provider.change();
  assert.equal(button.disabled, true);
  pending[2]({provider:'third', matches:[{}]}); await third;
  search.value='Edited title'; search.input();
  assert.equal(button.disabled,true);
  assert.equal(pending.length,3,'Typing waits before making a provider request');
  const edited=timer();
  assert.equal(requests[3].search_term,'Edited title');
  search.value='Newer title'; search.input();
  pending[3]({provider:'obsolete',query:{search_term:'Edited title'},matches:[{}]}); await edited;
  assert.equal(search.value,'Newer title');
  assert.equal(button.disabled,true);
  const latest=timer(); pending[4]({provider:'latest',query:{search_term:'Newer title'},matches:[{}]}); await latest;
  assert.equal(preview.innerHTML,'latest');
  assert.equal(button.disabled,false);
  platform.value='current'; const current=platform.change();
  assert.equal(button.disabled,true);
  assert.equal(requests[5].search_platform,'current');
  assert.equal(requests[5].search_term,'Newer title');
  platform.value='all'; const all=platform.change();
  pending[5]({provider:'stale-current',matches:[{}]}); await current;
  assert.equal(button.disabled,true);
  pending[6]({provider:'all-platforms',query:{search_platform:'all'},matches:[{remote_assets:{screenshot:'first.png'}}, {remote_assets:{screenshot:'second.png'}}]}); await all;
  assert.equal(preview.innerHTML,'all-platforms');
  assert.equal(requests[6].search_platform,'all');
  assert.deepEqual(Array.from(artwork.at(-1)),['first.png']);
  const alternate = {dataset:{scrapeMatch:'1'}};
  preview.change({target:{closest:()=>alternate}});
  assert.deepEqual(Array.from(artwork.at(-1)),['second.png']);
  const outdated=platform.change();
  pending[7]({provider:'old-service',matches:[{}]}); await outdated;
  assert.equal(button.disabled,true);
  assert.match(error.textContent,/Restart the browser/);
  provider.value='manual'; const manual=provider.change();
  assert.equal(platform.value,'current');
  assert.equal(platform.disabled,true);
  pending[8]({provider:'manual',matches:[{}]}); await manual;
  search.value=' '; search.input(); await timer();
  assert.equal(requests.length,9,'An empty field does not search or retain applicable results');
  assert.equal(button.disabled,true);
  search.value='Closed'; search.input(); overlay.isConnected=false; await timer();
  assert.equal(requests.length,9,'Closing the modal cancels pending work');
});

test('a filtered edition still renders its full family and the saved default', () => {
  const first = { id: 'en', version_group: 'original', default_version: 'de', title: 'Adventure', system: 'DOS', languages: ['en'], countries: ['GB'], version: 'VGA' };
  const second = { id: 'de', version_group: 'original', default_version: 'de', title: 'Adventure', system: 'Windows', languages: ['de'], countries: ['DE'], version: 'Talkie' };
  const remake = { id: 'deluxe', title: 'Adventure Deluxe', languages: ['en'] };
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms, state: { versionGroups: new Map([['original', [first, second]], ['deluxe', [remake]]]) } });
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
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms, LANGUAGE_NAMES: { EN: 'English', DE: 'German' }, COUNTRY_NAMES: { GB: 'United Kingdom' },
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
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state: {emulators: [
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
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state, els:{emulator}, escapeHtml:String,
    collectionPlatform:collection => collection.platform_id || 'zx-spectrum'});
  vm.runInContext(source.slice(source.indexOf('function platformEmulatorTypes('), source.indexOf('function renderLayout(')), context);
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
  const context=vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state,els:{emulator:{value:'scumm'}},automaticProfileForGame:()=>({id:'48k'})});
  vm.runInContext(source.slice(source.indexOf('function compatibleGameEmulators('),source.indexOf('async function showContextMenu(')),context);
  vm.runInContext(source.slice(source.indexOf('function resolveLaunchBinding('),source.indexOf('async function sendSelectedToWebHub(')),context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.resolveLaunchBinding({extension:'.tap'}))),{emulatorId:'spectrum',profileId:'48k'});
  assert.throws(()=>context.resolveLaunchBinding({extension:'.tap',default_emulator:'scumm'}),/incompatible/);
  assert.throws(()=>context.resolveLaunchBinding({extension:'.tap'},'scumm'),/incompatible/);
  assert.throws(()=>context.resolveLaunchBinding({extension:'.nes'}),/No compatible emulator/);
  assert.deepEqual(JSON.parse(JSON.stringify(context.resolveLaunchBinding({type:'ScummVM'}))),{emulatorId:'scumm',profileId:''});
});

test('Atari launch choices include Hatari and filter hardware and file support', () => {
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state:{emulators:[
    {id:'steem', type:'steem', available:true, supported_extensions:['.st','.stt']},
    {id:'hatari', type:'hatari', available:true, supported_extensions:['.st','.stx','.msa','.dim']},
    {id:'scumm', type:'scummvm', available:true}, {id:'spectrum', type:'generic', available:true}
  ]}});
  vm.runInContext(source.slice(source.indexOf('function compatibleGameEmulators('),source.indexOf('async function showContextMenu(')),context);
  const ids = game => Array.from(context.compatibleGameEmulators(game), e => e.id);
  assert.deepEqual(ids({type:'Atari ST',system:'STe',extension:'.st'}),['steem','hatari']);
  assert.deepEqual(ids({type:'Atari ST',system:'Falcon',extension:'.st'}),['hatari']);
  assert.deepEqual(ids({type:'Atari ST',system:'ST',extension:'.stt'}),['steem']);
  assert.deepEqual(ids({type:'Spectrum',extension:'.tap'}),['spectrum']);
});

test('sending a shortcut reports an invalid emulator pin without an unhandled rejection', async () => {
  const messages=[];
  const context=vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state:{selected:{id:'game'}},
    resolveLaunchBinding:()=>{throw new Error('Incompatible saved emulator');},
    renderDetails:async (message,error)=>messages.push([message,error])});
  vm.runInContext(source.slice(source.indexOf('async function sendSelectedToWebHub('),source.indexOf('async function sendGamesToPortal(')),context);
  await context.sendSelectedToWebHub();
  assert.deepEqual(messages,[['Incompatible saved emulator',true]]);
});
test('platform badges preserve all options, retain hardware tooltips and never interpolate asset paths', () => {
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms, escapeHtml: value => String(value).replaceAll('"', '&quot;').replaceAll('<', '&lt;') });
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
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,COLUMN_DEFS:defs, COLUMN_MAP:new Map(defs.map(row => [row.key,row])),
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


function favouriteHarness() {
  const pending = [], rendered = [];
  const state = {games: [], gamesById: new Map(), gameDetails: new Map(), selected: null};
  const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms,state, api: (route, options) => new Promise((resolve, reject) =>
    pending.push({route, request: JSON.parse(options.body), resolve, reject})),
    applyFilters: () => { state.filtered = context.groupedGameRows(state.games.filter(game => game.favourite)); },
    renderDetails: async (...args) => rendered.push(args)});
  vm.runInContext(source.slice(source.indexOf('function replaceGameSummaries('), source.indexOf('const ARCADE_LANGUAGE_FLAGS')), context);
  vm.runInContext(source.slice(source.indexOf('function favouriteGameMembers('), source.indexOf('async function openPok(')), context);
  context.replaceGameSummaries([
    {id:'default', version_group:'family', default_version:'default', favourite:false},
    {id:'alternative', version_group:'family', default_version:'default', favourite:false},
    {id:'other', favourite:false}]);
  state.selected = {...state.games[0]};
  state.gameDetails.set('default', state.selected);
  return {context, state, pending, rendered};
}

test('favourites immediately update grouped rows, details and the filtered list', async () => {
  const {context, state, pending} = favouriteHarness();
  const original = state.games[0];
  const adding = context.toggleFavourite();
  await context.toggleFavourite();
  assert.equal(pending.length, 1, 'Repeated clicks do not submit duplicate changes');
  assert.equal(context.groupedGameRows(state.games)[0].favourite, false, 'Wait for persisted success');
  pending[0].resolve({ok:true, updated:['default'], count:1}); await adding;
  assert.equal(state.games[0], original, 'Version groups retain the updated object');
  assert.equal(context.groupedGameRows(state.games)[0].favourite, true);
  assert.equal(state.gameDetails.get('default').favourite, true);
  assert.equal(state.filtered.length, 1);
  const removing = context.toggleFavourite();
  pending[1].resolve({ok:true, updated:['default'], count:1}); await removing;
  assert.equal(context.groupedGameRows(state.games)[0].favourite, false);
  assert.equal(state.filtered.length, 0);
});

test('removing a grouped favourite clears starred alternative editions', async () => {
  const {context, state, pending} = favouriteHarness();
  state.games[1].favourite = true;
  assert.equal(context.isGameFavourite(state.selected), true);
  const removing = context.toggleFavourite();
  assert.deepEqual(pending[0].request, {game_ids:['alternative'], favourite:false});
  pending[0].resolve({ok:true, updated:['alternative'], count:1}); await removing;
  assert.equal(context.isGameFavourite(state.selected), false);
  assert.equal(state.filtered.length, 0);
});

test('favourite responses preserve a newer selection and ignore replaced library records', async () => {
  const {context, state, pending} = favouriteHarness();
  const adding = context.toggleFavourite();
  state.selected = state.games[2];
  pending[0].resolve({ok:true, updated:['default'], count:1}); await adding;
  assert.equal(state.selected.id, 'other');
  assert.equal(state.selected.favourite, false);
  const later = context.toggleFavourite();
  context.replaceGameSummaries([{id:'other', favourite:false}]);
  state.selected = state.games[0];
  pending[1].resolve({ok:true, updated:['other'], count:1}); await later;
  assert.equal(state.selected.favourite, false);
});

test('failed favourite saves leave the visible state unchanged and allow retry', async () => {
  const {context, state, pending, rendered} = favouriteHarness();
  const adding = context.toggleFavourite();
  pending[0].reject(new Error('Save failed')); await adding;
  assert.equal(context.isGameFavourite(state.selected), false);
  assert.deepEqual(rendered[0], ['Save failed', true]);
  const retry = context.toggleFavourite();
  pending[1].resolve({ok:true, updated:['default'], count:1}); await retry;
  assert.equal(context.isGameFavourite(state.selected), true);
});
