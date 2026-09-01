const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('widget settings use a full draft and restore original data on cancel', () => {
  const source = fs.readFileSync(path.join(__dirname, 'widgets.js'), 'utf8');
  const settings = source.match(/function openWidgetSettings[\s\S]*?\/\/ ={20,}\n\/\/ Built-in widgets/)?.[0] || '';
  assert.match(settings, /const savedData\s*= cloneData\(widget\.data\)/);
  assert.match(settings, /const draftWidget =/);
  assert.match(settings, /def\.renderSettings\(draftWidget, body\)/);
  assert.match(settings, /restoreSavedWidget\(\);\s*if \(!options\.deferUndo\) pushUndoSnapshot\(\);\s*applyDraftToWidget\(\)/);
  assert.match(settings, /widget\.data = cloneData\(savedData\)/);
  assert.match(settings, /await def\.beforeSettingsCommit\(draftWidget, body/);
  assert.match(settings, /cancelButton\.disabled = true/);
});

test('widget setting values are escaped and shared networking loads before widgets', () => {
  const widgets = fs.readFileSync(path.join(__dirname, 'widgets.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'Portal', 'index.html'), 'utf8');
  assert.match(widgets, /function _escapeWidgetSettingValue/);
  assert.match(widgets, /_escapeWidgetSettingValue\(c\.content\)/);
  assert.ok(html.indexOf('../Widgets/core/widget-network.js') < html.indexOf('../Widgets/core/widgets.js'));
});

test('to-do items accept optional validated deadlines for Daily Briefing', () => {
  const source = fs.readFileSync(path.join(__dirname, 'widgets.js'), 'utf8');
  const helper = source.slice(source.indexOf('function _todoDate'), source.indexOf("WIDGET_REGISTRY['todo']"));
  const context = vm.createContext({ Date, Number, String });
  vm.runInContext(helper, context);
  assert.equal(vm.runInContext("_todoDate('2026-09-03')", context), '2026-09-03');
  assert.equal(vm.runInContext("_todoDate('2026-02-31')", context), '');
  assert.match(source, /due\.type = 'date'/);
  assert.match(source, /dueDate: _todoDate\(dueInput\.value\)/);
});
