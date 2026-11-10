const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'Portal');
const source = fs.readFileSync(path.join(__dirname, 'focus-session-widget.js'), 'utf8');

function createContext(extra = {}) {
  const cache = new Map();
  const notificationCalls = { scheduled: [], cancelled: [], published: [], permission: true };
  const context = vm.createContext({
    WIDGET_REGISTRY: {},
    WidgetSDK: {
      cache: {
        get: (type, id, key) => cache.get(`${type}:${id}:${key}`) || null,
        set: (type, id, key, value) => cache.set(`${type}:${id}:${key}`, JSON.parse(JSON.stringify(value))),
        remove: (type, id, key) => cache.delete(`${type}:${id}:${key}`)
      },
      runtime: { schedule: () => {}, cancelSchedule: () => {} },
      notifications: {
        schedule: async job => { notificationCalls.scheduled.push(job); return true; },
        cancel: async id => { notificationCalls.cancelled.push(id); return true; },
        publish: async event => { notificationCalls.published.push(event); return event; },
        requestPermission: async () => notificationCalls.permission
      }
    },
    state: { boards: [], navItems: [], sets: [] },
    getBoardTabs: board => board.tabs || [],
    Date,
    Intl,
    Math,
    Number,
    Object,
    String,
    Map,
    Promise,
    setTimeout,
    clearTimeout,
    ...extra
  });
  context.__cache = cache;
  context.__notificationCalls = notificationCalls;
  vm.runInContext(source, context);
  return context;
}

function makeWidget(config = {}) {
  return {
    id: 'focus-1', type: 'widget', widgetType: 'focusSession', data: {},
    config: {
      preset: 'custom', workMinutes: 1, breakMinutes: 1, longBreakMinutes: 2, longBreakEvery: 2,
      autoStartNext: false, showDailyTotals: true, launchTarget: '', warnCalendarConflicts: true, notifications: false,
      ...config
    }
  };
}






test('calendar warnings find timed overlaps and ignore all-day entries', () => {
  const calendarRuntime = new Map([
    ['calendar-1', { events: [
      { title: 'All day', start: 0, end: 86400000, allDay: true },
      { title: 'Stand-up', start: 20000, end: 40000, allDay: false }
    ] }]
  ]);
  const context = createContext({ _calendarRuntime: calendarRuntime });
  const conflict = vm.runInContext('_focusFindCalendarConflict(10000, 30000)', context);
  assert.equal(conflict.title, 'Stand-up');
  assert.equal(vm.runInContext('_focusFindCalendarConflict(50000, 60000)', context), null);
});



test('optional Set launch deduplicates URLs and stays user-triggered', () => {
  const opened = [];
  const set = { id: 'set-1', title: 'Work', items: [
    { type: 'bookmark', url: 'https://one.example/' },
    { type: 'bookmark', url: 'https://one.example/' },
    { type: 'bookmark', url: 'https://two.example/' }
  ] };
  const context = createContext({
    state: { boards: [], navItems: [], sets: [set] },
    findSetById: id => id === set.id ? set : null,
    resolveSetItems: value => value.items,
    openHubBookmark: bookmark => opened.push(bookmark.url)
  });
  context.widget = makeWidget({ launchTarget: 'set:set-1' });
  assert.equal(vm.runInContext('_focusLaunchTarget(widget)', context), true);
  assert.deepEqual(opened, ['https://one.example/', 'https://two.example/']);
});

test('optional folder launch resolves nested bookmarks from the configured board', () => {
  const opened = [];
  const folder = {
    id: 'folder-1', type: 'folder', title: 'Research', children: [
      { type: 'bookmark', url: 'https://paper.example/' },
      { id: 'folder-2', type: 'folder', title: 'Notes', children: [{ type: 'bookmark', url: 'https://notes.example/' }] }
    ]
  };
  const board = { id: 'board-1', title: 'Work', tabs: [{ title: 'Today', columns: [{ title: 'Main', items: [folder] }] }] };
  const context = createContext({
    state: { boards: [board], navItems: [], sets: [] },
    getBoardTabs: value => value.tabs,
    isDynamicFolder: () => false,
    resolveFolderChildren: value => value.children,
    openHubBookmark: bookmark => opened.push(bookmark.url)
  });
  context.widget = makeWidget({ launchTarget: 'folder:folder-1' });
  assert.equal(vm.runInContext('_focusLaunchTarget(widget)', context), true);
  assert.deepEqual(opened, ['https://paper.example/', 'https://notes.example/']);
});




test('Focus Session exposes the complete SDK contract for board and sidebar use', () => {
  const context = createContext();
  const descriptor = context.WIDGET_REGISTRY.focusSession;
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.allowedIn)), ['column', 'navpane']);
  assert.equal(descriptor.category, 'Personal & Productivity');
  assert.equal(descriptor.capabilities.timers, true);
  assert.equal(descriptor.capabilities.notifications.optional, true);
  assert.equal(descriptor.capabilities.localCache.quotaBytes, 128 * 1024);
  assert.equal(descriptor.capabilities.extensionRelay.optional, true);
  assert.equal(typeof descriptor.onSettingsCommit, 'function');
  assert.equal(typeof descriptor.cleanup, 'function');
  assert.equal(typeof descriptor.renderSettings, 'function');
});

test('Focus assets load after the SDK and include compact sidebar styling', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'focus-session-widget.css'), 'utf8');
  assert.ok(html.indexOf('../Widgets/core/widget-sdk.js') < html.indexOf('../Widgets/personal-productivity/focus-session-widget.js'));
  assert.match(html, /\.\.\/Widgets\/personal-productivity\/focus-session-widget\.css/);
  assert.match(css, /focus-session--navpane/);
  assert.match(css, /@container \(max-width: 250px\)/);
  assert.match(css, /padding-inline-end: var\(--widget-action-rail-width, 26px\)/);
  assert.match(source, /element.classList.add\('focus-session'\)/);
  assert.match(source, /endsAt/);
});

test('Focus is a view of Relay state and never executes or persists a second timer', () => {
  assert.match(source, /WidgetSDK\.productivity\.request/);
  assert.match(source, /snapshot\?\.focus\.revision/);
  assert.doesNotMatch(source, /function _focusStartTimer|function _focusAdvanceExpired/);
  assert.doesNotMatch(source, /cache\.set\('focusSession', widget\.id, 'runtime'/);
  assert.match(source, /Adopt this timer \(paused\)/);
});
test('session review separates timer duration, non-distracting browsing and distracting browsing and escapes hostnames',()=>{
  const c=createContext();c.report={totalMs:180000,distractingMs:60000,sites:[{name:'<unsafe>',milliseconds:60000},{name:'work.example',milliseconds:120000}]};c.phase={durationMs:1500000};
  const html=vm.runInContext('_focusSessionReviewMarkup(report,phase,false)',c);assert.match(html,/Session <strong>25m/);assert.match(html,/Focused <strong>2m/);assert.match(html,/Distracting <strong>1m/);assert.match(html,/&lt;unsafe&gt;/);assert.match(html,/Tracking off/);
});
