const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'daily-briefing-widget.js'), 'utf8');

function context() {
  const sandbox = vm.createContext({ WIDGET_REGISTRY: {}, console, setTimeout, clearTimeout });
  vm.runInContext(source, sandbox);
  return sandbox;
}

test('daily briefing aggregates portable tasks and gracefully reports absent sources', () => {
  const sandbox = context();
  sandbox.state = { boards: [{ tabs: [{ columns: [{ items: [
    { id: 'brief', type: 'widget', widgetType: 'dailyBriefing', config: { horizonDays: '7' }, data: {} },
    { id: 'tasks', type: 'widget', widgetType: 'todo', config: {}, data: { items: [{ text: 'Ship Cyrune', done: false }, { text: 'Old', done: true }] } }
  ] }] }] }] };
  const result = vm.runInContext(`_dailyBriefingRows(state.boards[0].tabs[0].columns[0].items[0], Date.parse('2026-08-31T09:00:00Z'))`, sandbox);
  assert.equal(result.window.days, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(result.sections[0].rows)), [{ primary: 'Ship Cyrune', secondary: 'Open task' }]);
  assert.equal(result.sections.find(section => section.title === 'Weather').rows.length, 0);
});

test('daily briefing descriptor is read-only, configurable, and supports board or sidebar placement', () => {
  const sandbox = context();
  const descriptor = sandbox.WIDGET_REGISTRY.dailyBriefing;
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.allowedIn)), ['column', 'navpane']);
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.defaultData)), {});
  assert.equal(descriptor.defaultConfig.showCalendar, true);
  assert.match(source, /never performs network requests/);
});
