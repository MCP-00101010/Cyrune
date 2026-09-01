const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'daily-briefing-widget.js'), 'utf8');

function context() {
  const sandbox = vm.createContext({ WIDGET_REGISTRY: {}, console, URL, setTimeout, clearTimeout });
  vm.runInContext(source, sandbox);
  return sandbox;
}

test('daily briefing includes only deadline tasks in the selected window and hides empty sections', () => {
  const sandbox = context();
  sandbox.state = { boards: [{ tabs: [{ columns: [{ items: [
    { id: 'brief', type: 'widget', widgetType: 'dailyBriefing', config: { horizonDays: '7' }, data: {} },
    { id: 'tasks', type: 'widget', widgetType: 'todo', config: {}, data: { items: [
      { text: 'Ship Cyrune', done: false, dueDate: '2026-09-02' },
      { text: 'Undated', done: false },
      { text: 'Old', done: true, dueDate: '2026-09-01' }
    ] } }
  ] }] }] }] };
  const result = vm.runInContext(`_dailyBriefingRows(state.boards[0].tabs[0].columns[0].items[0], Date.parse('2026-08-31T09:00:00Z'))`, sandbox);
  assert.equal(result.window.days, 7);
  assert.equal(result.window.end, new Date(2026, 8, 7).getTime() - 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.sections[0].rows)).map(row => row.primary), ['Ship Cyrune']);
  assert.equal(result.sections.some(section => section.title === 'Weather'), false);
});

test('daily briefing includes sidebar calendar events that overlap today, including all-day holidays', () => {
  const sandbox = context();
  const today = new Date(2026, 7, 31).getTime(); const tomorrow = new Date(2026, 8, 1).getTime();
  sandbox._calendarRuntime = new Map([['calendar', { events: [
    { title: 'Summer bank holiday', start: today, end: tomorrow, allDay: true, sourceName: 'UK bank holidays' },
    { title: 'Overnight maintenance', start: today - 3600000, end: today + 3600000, allDay: false, sourceName: 'Main' },
    { title: 'Tomorrow only', start: tomorrow, end: tomorrow + 3600000, allDay: false, sourceName: 'Main' }
  ] }]]);
  sandbox.state = {
    boards: [{ tabs: [{ columns: [{ items: [{ id: 'brief', type: 'widget', widgetType: 'dailyBriefing', config: { horizonDays: '1' }, data: {} }] }] }] }],
    navItems: [{ id: 'calendar', type: 'widget', widgetType: 'protonCalendar', config: {}, data: {} }]
  };
  const result = vm.runInContext(`_dailyBriefingRows(state.boards[0].tabs[0].columns[0].items[0], new Date(2026, 7, 31, 9).getTime())`, sandbox);
  const calendar = result.sections.find(section => section.title === 'Calendar');
  assert.deepEqual([...calendar.rows].map(row => row.primary), ['Summer bank holiday', 'Overnight maintenance']);
  assert.match(calendar.rows.find(row => row.primary === 'Summer bank holiday').secondary, /All day · UK bank holidays/);
});

test('daily briefing shows useful weather, favourite fixtures and only dated upcoming media', () => {
  const sandbox = context();
  sandbox._readWeatherCache = () => ({ payload: {
    current: { temperature_2m: 14, apparent_temperature: 12, weather_code: 3, is_day: 1 },
    current_units: { temperature_2m: '°C', apparent_temperature: '°C' },
    daily: { time: ['2026-08-31', '2026-09-01'], weather_code: [3, 61], temperature_2m_max: [20, 17], temperature_2m_min: [11, 9], precipitation_probability_max: [20, 70] },
    daily_units: { temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_probability_max: '%' }
  } });
  sandbox._weatherCodeDetails = code => ({ symbol: code === 3 ? '☁' : '☂', label: code === 3 ? 'Overcast' : 'Rain' });
  sandbox._footballTrackerRuntime = new Map([['football', { data: { matches: [
    { id: 1, utcDate: Date.parse('2026-09-01T19:00:00Z'), home: { id: 10, name: 'Celtic', crest: 'https://crests.example/celtic.png' }, away: { id: 11, name: 'Hearts', crest: 'https://crests.example/hearts.png' } },
    { id: 2, utcDate: Date.parse('2026-09-02T19:00:00Z'), home: { id: 12, name: 'Hibs' }, away: { id: 13, name: 'Aberdeen' } }
  ] } }]]);
  sandbox.state = { boards: [{ tabs: [{ columns: [{ items: [
    { id: 'brief', type: 'widget', widgetType: 'dailyBriefing', config: { horizonDays: '7' }, data: {} },
    { id: 'weather', type: 'widget', widgetType: 'weather', config: { locationName: 'Long Crendon' }, data: {} },
    { id: 'football', type: 'widget', widgetType: 'footballTracker', config: { favouriteTeams: [{ id: 10, name: 'Celtic' }] }, data: {} },
    { id: 'media', type: 'widget', widgetType: 'mediaWatchlist', config: {}, data: { records: [
      { title: 'The X-Files', watched: false, upcoming: [] },
      { title: 'Future Film', watched: false, upcoming: [{ title: 'Future Film release', kind: 'release', date: '2026-09-03' }] }
    ] } }
  ] }] }] }] };
  const result = vm.runInContext(`_dailyBriefingRows(state.boards[0].tabs[0].columns[0].items[0], Date.parse('2026-08-31T09:00:00Z'))`, sandbox);
  const weather = result.sections.find(section => section.title === 'Weather');
  assert.match(weather.rows[0].primary, /Overcast/);
  assert.doesNotMatch(weather.rows[0].primary, /Long Crendon/);
  const football = result.sections.find(section => section.title === 'Football');
  assert.deepEqual([...football.rows].map(row => row.primary), ['★ Celtic v Hearts']);
  assert.deepEqual([...football.rows[0].crests], ['https://crests.example/celtic.png', 'https://crests.example/hearts.png']);
  assert.deepEqual([...result.sections.find(section => section.title === 'Watchlist').rows].map(row => row.primary), ['Future Film release']);
  assert.equal(result.sections.some(section => section.title === 'Service warnings'), false);
  sandbox.state.boards[0].tabs[0].columns[0].items[0].config.horizonDays = '1';
  const today = vm.runInContext(`_dailyBriefingRows(state.boards[0].tabs[0].columns[0].items[0], Date.parse('2026-08-31T09:00:00Z'))`, sandbox);
  assert.match(today.sections.find(section => section.title === 'Weather').rows[0].primary, /14°C · Overcast/);
});

test('football favourites do not equate IDs owned by different providers', () => {
  const sandbox = context();
  sandbox.source = { config: { favouriteTeams: [{ id: 10, name: 'Celtic', provider: 'sportmonks' }] } };
  sandbox.same = { id: 10, name: 'Unrelated Club', provider: 'theSportsDb' };
  sandbox.alias = { id: 999, name: 'Celtic FC', provider: 'theSportsDb' };
  assert.equal(vm.runInContext('_dailyBriefingFavouriteTeam(source, same)', sandbox), false);
  assert.equal(vm.runInContext('_dailyBriefingFavouriteTeam(source, alias)', sandbox), true);
});

test('RSS briefing actions mark the source article read before opening its link', () => {
  const sandbox = context(); let written = null; const refreshes = [];
  sandbox._readRssView = () => ({ readIds: ['existing'] });
  sandbox._writeRssView = (_widgetId, value) => { written = value; };
  sandbox._refreshWidget = (...args) => refreshes.push(args);
  sandbox.action = { kind: 'rss', widgetId: 'rss-1', itemIds: ['article-1'], url: 'https://example.test/article' };
  vm.runInContext('_dailyBriefingActivate(action)', sandbox);
  assert.deepEqual([...written.readIds], ['existing', 'article-1']);
  assert.deepEqual(refreshes, [['rss-1', 'column']]);
});

test('daily briefing descriptor is read-only, configurable, and supports board or sidebar placement', () => {
  const sandbox = context();
  const descriptor = sandbox.WIDGET_REGISTRY.dailyBriefing;
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.allowedIn)), ['column', 'navpane']);
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.defaultData)), {});
  assert.equal(descriptor.defaultConfig.showCalendar, true);
  assert.equal(descriptor.defaultConfig.showEmptySections, false);
  assert.match(source, /never performs network requests/);
  assert.match(source, /Service warnings \(Today only\)/);
  const styles = fs.readFileSync(path.join(__dirname, 'daily-briefing-widget.css'), 'utf8');
  assert.match(styles, /daily-briefing-football-crests/);
});
