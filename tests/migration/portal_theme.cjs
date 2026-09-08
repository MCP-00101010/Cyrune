const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function harness(storage = {}) {
  const broadcasts = [];
  const context = vm.createContext({ console, Promise, structuredClone,
    emuguiRegistrations: new Map([[20, {}]]),
    browser: { storage: { local: { get: async key => ({[key]: storage[key]}), set: async values => Object.assign(storage, plain(values)) } },
      tabs: { sendMessage: async (id, message) => broadcasts.push({id, message}) } }
  });
  const state = read('Portal/source/state.js');
  vm.runInContext(read('Portal/source/themes.js')
    + state.slice(0, state.indexOf('const defaultSettings ='))
    + state.slice(state.indexOf('function normalizeThemeStyleSettings('), state.indexOf('function migrateThemeStyleProfiles('))
    + read('Portal/source/arcade-theme.js'), context);
  const relay = read('Relay/background.js');
  vm.runInContext(relay.slice(relay.indexOf('// Portal theme projection:'), relay.indexOf('// End Portal theme projection.')), context);
  return {context, broadcasts, storage};
}

test('committed Portal theme projects colours/styles without media, boards or native data', async () => {
  const h = harness();
  const settings = {activeThemeName:'custom', customThemes:[{id:'custom',colorScheme:'light',colors:{
    bg:'#ffffff',panel:'#eeeeee',panelStrong:'#dddddd',panelMuted:'#cccccc',border:'#bbbbbb',text:'#111111',textMuted:'#555555',accent:'#a00000',accentStrong:'#800000',danger:'#ff0000'
  }}], themeStyleProfilesMigrated:true,themeStyleProfiles:{custom:{globalFontScale:'large',globalFontColorFromTheme:false,globalFontColor:'#123456',styleOverrides:{bookmark:true},bookmarkFontFamily:'Georgia',bookmarkBold:true}},
    sidebarOpacity:60,backgroundPath:'C:/private/wallpaper.jpg',secret:'private'};
  const projection = plain(h.context.createArcadeThemeProjection(settings));
  assert.equal(projection.variables['--text'], '#123456');
  assert.equal(projection.variables['--bookmark-font-family'], 'Georgia');
  assert.equal(projection.variables['--bookmark-font-weight'], 'bold');
  assert.equal(projection.variables['--base-font-size'], '16px');
  assert.equal(projection.variables['--panel-alpha'], '0.6');
  assert.doesNotMatch(JSON.stringify(projection), /private|backgroundPath|secret/);
  await h.context.publishPortalTheme(projection);
  await h.context.publishPortalTheme(projection);
  assert.equal(h.broadcasts.length, 1, 'Identical saves must not rebroadcast');
  const restarted = harness(h.storage);
  assert.deepEqual(plain(await restarted.context.readPortalTheme()), projection, 'Relay restart keeps the bounded theme');
  for (const mutation of [p=>p.path='C:/private',p=>p.variables['--bg']='url(file:///private)',p=>p.variables['--text']='red; background:url(x)',p=>p.variables['--bookmark-font-family']='url(https://evil)',p=>p.variables['--panel-alpha']='500',p=>p.variables['--bogus']='x',p=>p.variables['--shadow']='x'.repeat(10000)]) {
    const invalid = structuredClone(projection); mutation(invalid);
    assert.throws(()=>h.context.validatePortalTheme(invalid));
  }
  assert.deepEqual(plain(await h.context.readPortalTheme()), projection);
});

test('Arcade applies live theme changes and ignores out-of-order responses', async () => {
  const pending = [], listeners = {}, values = {};
  const context = vm.createContext({ document:{documentElement:{style:{setProperty:(k,v)=>values[k]=v},dataset:{}}},
    ArcadeTransport:{request:()=>new Promise(resolve=>pending.push(resolve))},
    window:{addEventListener:(name,fn)=>listeners[name]=fn} });
  vm.runInContext(read('Arcade/web/portal-theme.js'),context);
  listeners['cyrune:portal-theme-changed']();
  pending[1]({ok:true,theme:{schemaVersion:1,colorScheme:'light',variables:{'--bg':'#ffffff'}}});
  for (let i=0; i<10; i++) await Promise.resolve();
  pending[0]({ok:true,theme:{schemaVersion:1,colorScheme:'dark',variables:{'--bg':'#111111'}}});
  for (let i=0; i<10; i++) await Promise.resolve();
  assert.equal(values['--bg'],'#ffffff');
  assert.equal(context.document.documentElement.style.colorScheme,'light');
});
