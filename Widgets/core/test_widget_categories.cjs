const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'Portal');

function readWidgetDefinitions(source) {
  const definitions = {};
  for (const match of source.matchAll(/WIDGET_REGISTRY\['([^']+)'\]\s*=\s*\{/g)) {
    const blockEnd = source.indexOf('allowedIn:', match.index);
    const block = source.slice(match.index, blockEnd + 120);
    const name = block.match(/name:\s*'([^']+)'/)?.[1];
    const category = block.match(/category:\s*'([^']+)'/)?.[1];
    const allowed = block.match(/allowedIn:\s*\[([^\]]+)\]/)?.[1]
      ?.split(',')
      .map(value => value.trim().replaceAll("'", ''));
    definitions[match[1]] = { name, category, allowedIn: allowed || [] };
  }
  return definitions;
}

test('widget library is grouped into ordered categories for board and sidebar menus', () => {
  const widgets = [
    fs.readFileSync(path.join(__dirname, 'widgets.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'space-astronomy', 'nasa-apod-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'weather-hazards', 'weather-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'weather-hazards', 'weather-map-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'space-astronomy', 'iss-tracker-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'space-astronomy', 'astronomy-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'content-feeds', 'rss-reader-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'system-network', 'ip-info-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'personal-productivity', 'calendar-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'personal-productivity', 'daily-briefing-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'utilities', 'calculator-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'utilities', 'translator-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'personal-productivity', 'focus-session-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'sports', 'football-tracker-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'weather-hazards', 'global-hazards-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'personal-productivity', 'saved-sessions-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'system-network', 'service-monitor-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'system-network', 'system-monitor-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'coding-development', 'git-workspace-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'content-feeds', 'media-watchlist-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'system-network', 'recent-files-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'personal-productivity', 'universal-search-widget.js'), 'utf8'),
    fs.readFileSync(path.join(root, '..', 'Widgets', 'gaming', 'nexus-mods-tracker-widget.js'), 'utf8')
  ].join('\n');
  const contextSource = fs.readFileSync(path.join(root, 'source/context.js'), 'utf8');
  const definitions = readWidgetDefinitions(widgets);
  const categoryOrder = vm.runInNewContext(
    widgets.slice(widgets.indexOf('const WIDGET_CATEGORY_ORDER'), widgets.indexOf('];', widgets.indexOf('const WIDGET_CATEGORY_ORDER')) + 2)
      .replace('const WIDGET_CATEGORY_ORDER =', '')
  );
  assert.equal(Object.keys(definitions).length, 27);
  Object.values(definitions).forEach(definition => assert.ok(categoryOrder.includes(definition.category)));

  const helperStart = contextSource.indexOf('function _buildWidgetSubmenu');
  const helperEnd = contextSource.indexOf('\nfunction _findNavItem', helperStart);
  const context = vm.createContext({ WIDGET_REGISTRY: definitions, WIDGET_CATEGORY_ORDER: categoryOrder });
  vm.runInContext(contextSource.slice(helperStart, helperEnd), context);

  const boardMenu = vm.runInContext("_buildWidgetSubmenu('column', 'addWidget')", context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(boardMenu.map(group => group.label))),
    ['Personal & Productivity', 'Utilities', 'Weather & Hazards', 'System & Network', 'Sports', 'Content & Feeds', 'Gaming', 'Space & Astronomy', 'Coding & Development']
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(boardMenu[0].submenu.map(item => item.label))),
    ['Calendar', 'Clock', 'Countdown', 'Daily Briefing', 'Focus Session', 'Notes', 'Saved Sessions', 'To-do List', 'Universal Search Launcher']
  );
  assert.equal(boardMenu.flatMap(group => group.submenu).length, 27);
  assert.deepEqual(
    JSON.parse(JSON.stringify(boardMenu.find(group => group.label === 'Gaming').submenu.map(item => item.label))),
    ['Nexus Mods Tracker']
  );

  const sidebarMenu = vm.runInContext("_buildWidgetSubmenu('navpane', 'addNavWidget')", context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sidebarMenu.map(group => group.label))),
    ['Personal & Productivity', 'Utilities', 'System & Network', 'Sports', 'Content & Feeds', 'Coding & Development']
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(sidebarMenu.flatMap(group => group.submenu).map(item => item.action))),
    ['addNavWidget:clock', 'addNavWidget:countdown', 'addNavWidget:dailyBriefing', 'addNavWidget:focusSession', 'addNavWidget:savedSessions', 'addNavWidget:universalSearch', 'addNavWidget:calculatorConverter', 'addNavWidget:translator', 'addNavWidget:ipInfo', 'addNavWidget:recentFiles', 'addNavWidget:serviceMonitor', 'addNavWidget:systemMonitor', 'addNavWidget:footballTracker', 'addNavWidget:mediaWatchlist', 'addNavWidget:gitWorkspace']
  );
});

test('context menu renderer supports recursive submenus without removing their ancestors', () => {
  const source = fs.readFileSync(path.join(root, 'source/context.js'), 'utf8');
  assert.match(source, /function _clearSubmenusFromDepth\(depth\)/);
  assert.match(source, /Number\(submenu\.dataset\.menuDepth \|\| 1\) >= depth/);
  assert.match(source, /function _appendContextMenuAction\(menu, action, depth = 0\)/);
  assert.match(source, /action\.submenu\.forEach\(subAction => _appendContextMenuAction\(submenu, subAction, depth \+ 1\)\)/);
  assert.match(source, /submenu\.dataset\.menuDepth = String\(depth \+ 1\)/);
  assert.match(source, /_positionContextSubmenu\(submenu, button\)/);
  assert.match(source, /typeof action\.run === 'function'/);
  assert.match(source, /_buildWidgetSubmenu\('column', 'addWidget'\)/);
  assert.match(source, /_buildWidgetSubmenu\('navpane', 'addNavWidget'\)/);
});
