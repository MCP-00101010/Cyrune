const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..', 'Portal');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const reloadWidgets = ['service-monitor', 'system-monitor', 'git-workspace', 'recent-files'];

function widgetSource(name) {
  const match = html.match(new RegExp(`<script[^>]+src="([^"]*${name}-widget\\.js)"`));
  assert.ok(match, `${name} script is loaded by Portal`);
  return fs.readFileSync(path.resolve(root, match[1]), 'utf8');
}

test('new data widgets rely on the shared refresh icon without duplicate header buttons', () => {
  const framework = fs.readFileSync(path.join(__dirname, 'widgets.js'), 'utf8');
  assert.match(framework, /widget-action-btn widget-action-btn--reload/);
  for (const name of reloadWidgets) {
    const source = widgetSource(name);
    assert.match(source, /reload\(widget\)/);
    assert.doesNotMatch(source, /className = 'widget-inline-btn'/);
  }
  const service = widgetSource('service-monitor');
  assert.match(service, /className = 'service-monitor-check'/, 'per-endpoint checks remain available');
});

test('new widget top rows reserve space for the shared action rail', () => {
  const css = fs.readFileSync(path.join(__dirname, 'widget-action-layout.css'), 'utf8');
  for (const selector of ['service-monitor-header', 'system-monitor-header', 'git-workspace-header', 'recent-files-header']) {
    assert.match(css, new RegExp(`\\.${selector}`));
  }
  assert.match(css, /padding-right:\s*52px/);
  assert.match(css, /\.media-watchlist-card:first-child\s*>\s*\.media-watchlist-main[\s\S]*padding-right:\s*26px/);
  assert.match(css, /\.universal-search-input-row[\s\S]*margin-right:\s*26px/);
  assert.match(css, /\.daily-briefing-header[\s\S]*padding-right:\s*26px/);
  assert.ok(html.indexOf('widget-action-layout.css') > html.indexOf('universal-search-widget.css'));
});
