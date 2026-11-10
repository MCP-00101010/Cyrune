const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  let focused = null;
  const buttons = ['general', 'ui', 'theme', 'style', 'api-keys', 'about'].map(tab => {
    const classes = new Set();
    const attributes = new Map();
    return {
      dataset: { tab }, textContent: tab === 'ui' ? 'Interface' : tab,
      classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
      setAttribute: (key, value) => attributes.set(key, value),
      removeAttribute: key => attributes.delete(key),
      focus: () => { focused = tab; }, classes, attributes
    };
  });
  const body = { dataset: {}, scrollTop: 100 };
  const title = { textContent: '' };
  const panel = { querySelectorAll: () => buttons, querySelector: () => body };
  const context = vm.createContext({
    styleLoads: 0,
    document: { getElementById: id => id === 'settingsPanel' ? panel : title, querySelectorAll: () => buttons }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../source/settings.js'), 'utf8'), context);
  vm.runInContext('loadActiveThemeStyleControls = () => { styleLoads++; }', context);
  return { context, buttons, body, title, focused: () => focused };
}

test('settings category selection synchronizes navigation, pane, heading and stale routes', () => {
  const f = fixture();
  f.context.selectPortalSettingsCategory('ui');
  assert.equal(f.body.dataset.activeTab, 'ui');
  assert.equal(f.title.textContent, 'Interface');
  assert.equal(f.body.scrollTop, 0);
  assert.deepEqual(f.buttons.filter(b => b.classes.has('active')).map(b => b.dataset.tab), ['ui']);
  assert.equal(f.buttons[1].attributes.get('aria-current'), 'page');
  f.context.selectPortalSettingsCategory('style');
  assert.equal(f.context.styleLoads, 1);
  f.context.selectPortalSettingsCategory('removed-category');
  assert.equal(f.body.dataset.activeTab, 'general');
  assert.equal(f.buttons[1].attributes.has('aria-current'), false);
});

test('settings category arrows, Home and End move focus while ordinary keys remain available', () => {
  const f = fixture();
  function key(index, key) {
    let prevented = false;
    f.context.handlePortalSettingsCategoryKey({ currentTarget: f.buttons[index], key, preventDefault: () => { prevented = true; } });
    return prevented;
  }
  assert.equal(key(0, 'ArrowUp'), true);
  assert.equal(f.focused(), 'about');
  key(5, 'ArrowRight');
  assert.equal(f.focused(), 'general');
  key(0, 'End');
  assert.equal(f.focused(), 'about');
  key(5, 'Home');
  assert.equal(f.focused(), 'general');
  assert.equal(key(0, 'Tab'), false);
});
