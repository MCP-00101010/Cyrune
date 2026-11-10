const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function luminance(hex) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

test('primary labels retain AA contrast across built-in and custom accent brightness', () => {
  const properties = new Map();
  const context = vm.createContext({ document: { documentElement: { style: {
    setProperty: (key, value) => properties.set(key, value)
  } } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../source/themes.js'), 'utf8'), context);
  const themes = vm.runInContext('BUILTIN_THEMES', context);
  for (const accent of [...themes.map(theme => theme.colors.accent), '#ffffff', '#000000', '#777777', '#ffff00']) {
    context.candidate = { ...themes[0], colors: { ...themes[0].colors, accent } };
    vm.runInContext('applyTheme(candidate)', context);
    const foreground = properties.get('--accent-foreground');
    const values = [luminance(accent), luminance(foreground)].sort((a, b) => b - a);
    assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, `${accent} with ${foreground}`);
  }
});
