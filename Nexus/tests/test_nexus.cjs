const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const nexusRoot = path.resolve(__dirname, '..');
const model = require(path.join(nexusRoot, 'source', 'model.js'));

test('component metadata covers each Cyrune product and has safe documents', () => {
  assert.deepEqual(model.COMPONENTS.map(component => component.id), ['portal', 'widgets', 'arcade', 'relay', 'host', 'nexus']);
  for (const component of model.COMPONENTS) {
    assert.ok(model.safeDocumentUrl(component.todo));
    assert.ok(model.safeDocumentUrl(component.changelog));
  }
  assert.deepEqual(Object.fromEntries(model.COMPONENTS.map(component => [component.id, component.page || ''])), {
    portal: '../Portal/index.html',
    widgets: '../Widgets/core/sdk/fixture.html',
    arcade: '../Arcade/web/index.html',
    relay: '',
    host: '',
    nexus: 'index.html'
  });
});

test('settings normalization applies safe defaults and bounded values', () => {
  const settings = model.normalizeSettings({
    revision: 3,
    region: { country: 'us-too-long', city: '  York  ', locationMode: 'precise' },
    units: { system: 'unknown', temperature: 'fahrenheit' },
    language: { primary: 'de-DE', secondary: 'en-GB' },
    accessibility: { reducedMotion: true },
    privacy: { allowPreciseLocation: false }
  });
  assert.equal(settings.revision, 3);
  assert.equal(settings.updatedAt, 0);
  assert.equal(settings.region.country, 'US');
  assert.equal(settings.region.city, 'York');
  assert.equal(settings.region.locationMode, 'manual');
  assert.equal(settings.units.system, 'metric');
  assert.equal(settings.units.temperature, 'fahrenheit');
  assert.equal(settings.language.primary, 'de-DE');
  assert.equal(settings.accessibility.reducedMotion, true);
});

test('imperial unit presets apply coherent defaults while preserving overrides', () => {
  const preset = model.normalizeSettings({ units: { system: 'imperial' } });
  assert.equal(preset.units.temperature, 'fahrenheit');
  assert.equal(preset.units.distance, 'miles');
  assert.equal(preset.units.volume, 'gallons-uk');
  const custom = model.normalizeSettings({ units: { system: 'imperial', temperature: 'celsius', volume: 'gallons-us' } });
  assert.equal(custom.units.temperature, 'celsius');
  assert.equal(custom.units.volume, 'gallons-us');
});

test('schema one settings migrate to schema two with empty component overrides', () => {
  const migrated = model.normalizeSettings({ schemaVersion: 1, revision: 4, region: { city: 'Leeds' } });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.revision, 4);
  assert.equal(migrated.region.city, 'Leeds');
  assert.deepEqual(migrated.overrides, { 'portal-widgets': {}, arcade: {} });
});

test('component settings resolve sparse overrides and expose their source', () => {
  const settings = model.normalizeSettings({
    schemaVersion: 2,
    region: { city: 'London' },
    units: { system: 'metric' },
    overrides: { 'portal-widgets': { region: { city: 'Edinburgh' }, units: { system: 'imperial' } } }
  });
  const effective = model.effectiveSettings(settings, 'portal-widgets');
  assert.equal(effective.region.city, 'Edinburgh');
  assert.equal(effective.units.system, 'imperial');
  assert.equal(model.settingSource(settings, 'portal-widgets', 'region.city'), 'component');
  assert.equal(model.settingSource(settings, 'portal-widgets', 'region.timeZone'), 'default');
  const networkCeiling = model.normalizeSettings({
    schemaVersion: 2,
    privacy: { allowOptionalNetwork: false },
    overrides: { arcade: { privacy: { allowOptionalNetwork: true } } }
  });
  assert.equal(model.effectiveSettings(networkCeiling, 'arcade').privacy.allowOptionalNetwork, false);
  assert.equal(networkCeiling.overrides.arcade.privacy.allowOptionalNetwork, false);
});

test('coordinates survive only with an explicit precise-location permission', () => {
  const denied = model.normalizeSettings({ region: { latitude: 51.5, longitude: -0.1 } });
  assert.equal(denied.region.latitude, null);
  const allowed = model.normalizeSettings({
    region: { locationMode: 'precise', latitude: 51.5, longitude: -0.1 },
    privacy: { allowPreciseLocation: true }
  });
  assert.equal(allowed.region.latitude, 51.5);
  assert.equal(allowed.region.longitude, -0.1);
});

test('safe document URLs reject script, data, and Windows paths', () => {
  assert.equal(model.safeDocumentUrl('javascript:alert(1)'), '');
  assert.equal(model.safeDocumentUrl('data:text/html,test'), '');
  assert.equal(model.safeDocumentUrl('C:\\Users\\example\\secret.md'), '');
  assert.equal(model.safeDocumentUrl('../../outside.md'), '');
  assert.equal(model.safeDocumentUrl('../Portal/../../outside.md'), '');
  assert.equal(model.safeDocumentUrl('../Portal/Portal-TODO.md'), '../Portal/Portal-TODO.md');
  assert.equal(model.safeDocumentUrl('https://example.com/status'), 'https://example.com/status');
});

test('Markdown rendering escapes HTML and removes unsafe link targets', () => {
  const rendered = model.renderMarkdown('# Hello\n\n- `<img>`\n- [bad](javascript:alert(1))\n- [good](../Portal/Portal-TODO.md)');
  assert.match(rendered, /<h2>Hello<\/h2>/);
  assert.doesNotMatch(rendered, /<img>/);
  assert.doesNotMatch(rendered, /javascript:/);
  assert.match(rendered, /href="\.\.\/Portal\/Portal-TODO\.md"/);
});

test('HTML loads standalone assets in model-bridge-app order', () => {
  const html = fs.readFileSync(path.join(nexusRoot, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(nexusRoot, 'source', 'app.js'), 'utf8');
  assert.ok(html.indexOf('source/model.js') < html.indexOf('source/bridge.js'));
  assert.ok(html.indexOf('source/bridge.js') < html.indexOf('source/app.js'));
  assert.match(html, /data-view="variables"/);
  assert.match(html, /id="component-nav"/);
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="assets\/icons\/nexus\.svg"/);
  assert.match(html, /class="brand-mark" src="assets\/icons\/nexus\.svg"/);
  assert.match(app, /function componentIconPath\(id\)/);
  assert.match(app, /componentIconPath\('project'\)/);
  assert.match(app, /data-open-component-page/);
  assert.match(app, /window\.open\(component\.page, '_blank', 'noopener'\)/);
  assert.match(app, /event\.stopPropagation\(\)/);
  assert.doesNotMatch(app, /component\.name\.slice\(0, 1\)/);
  for (const id of ['cyrune', ...model.COMPONENTS.map(component => component.id)]) {
    assert.ok(fs.existsSync(path.join(nexusRoot, 'assets', 'icons', `${id}.svg`)), `missing Nexus icon for ${id}`);
  }
  assert.doesNotMatch(html, /https?:\/\//);
});

test('Nexus bridge exposes only fixed-purpose authenticated operations', () => {
  const bridge = fs.readFileSync(path.join(nexusRoot, 'source', 'bridge.js'), 'utf8');
  const app = fs.readFileSync(path.join(nexusRoot, 'source', 'app.js'), 'utf8');
  for (const operation of ['MW_NEXUS_PING', 'MW_NEXUS_GET_SETTINGS', 'MW_NEXUS_SAVE_SETTINGS', 'MW_NEXUS_GET_STATUS', 'MW_NEXUS_GET_DOCUMENT', 'MW_NEXUS_OPEN_TODO', 'MW_NEXUS_CHECK_REMOTE']) {
    assert.match(bridge, new RegExp(operation));
  }
  assert.match(app, /expectedRevision: settings\.revision/);
  assert.match(app, /response\.conflict === true/);
  assert.match(app, /settingsAuthority === 'authoritative'/);
  assert.doesNotMatch(bridge, /filesystem|shell|git fetch|command/i);
});

test('repository remote status is an explicit fixed-purpose action', () => {
  const app = fs.readFileSync(path.join(nexusRoot, 'source', 'app.js'), 'utf8');
  assert.match(app, /data-check-remote/);
  assert.match(app, /bridge\.request\('MW_NEXUS_CHECK_REMOTE', \{\}, 25000\)/);
  assert.match(app, /Fetch when you want updated ahead\/behind counts/);
  assert.doesNotMatch(app, /git (?:fetch|pull|push|reset|checkout)/i);
});

test('health adapters render fixed states and preserve partial service results', () => {
  const app = fs.readFileSync(path.join(nexusRoot, 'source', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(nexusRoot, 'source', 'styles.css'), 'utf8');
  assert.match(app, /Promise\.allSettled/);
  assert.match(app, /settingsAuthority = 'status-only'/);
  assert.match(app, /function componentHealth\(component\)/);
  assert.match(app, /health\.guidance|health\.sampledAt/);
  assert.match(app, /Runtime recovery guidance|runtime recovery guidance/i);
  assert.match(styles, /status-attention/);
  assert.match(styles, /health-guidance/);
});

test('Variables exposes global and component scopes with explicit override controls', () => {
  const app = fs.readFileSync(path.join(nexusRoot, 'source', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(nexusRoot, 'source', 'styles.css'), 'utf8');
  assert.match(app, /data-settings-scope="portal-widgets"/);
  assert.match(app, /data-settings-scope="arcade"/);
  assert.match(app, /data-override-path/);
  assert.match(app, /Default → global → component → local Widget setting/);
  assert.match(styles, /\.value-source/);
  assert.match(styles, /\.override-control/);
});

test('TODO actions use the fixed VS Code operation while changelogs have no open link', () => {
  const app = fs.readFileSync(path.join(nexusRoot, 'source', 'app.js'), 'utf8');
  assert.match(app, /data-open-todo=/);
  assert.match(app, /bridge\.request\('MW_NEXUS_OPEN_TODO', \{ component \}\)/);
  assert.match(app, /type === 'todo' \? .*Edit in VS Code/);
  assert.match(app, /type === 'todo' \? 'TODO' : 'Changelog'/);
  assert.doesNotMatch(app, /component\.changelog[^\n]+Open file/);
});

test('Activity renders only sanitized validation receipt fields', () => {
  const app = fs.readFileSync(path.join(nexusRoot, 'source', 'app.js'), 'utf8');
  assert.match(app, /receipt\?\.versions/);
  assert.match(app, /receipt\?\.tests/);
  assert.match(app, /receipt\?\.checks/);
  assert.match(app, /Latest coordinated validation/);
  assert.match(app, /Failed or interrupted runs never replace the last known-good receipt/);
  assert.doesNotMatch(app, /receipt\?\.(?:output|path|command|environment)/);
});

test('component manifest, model, and changelog versions align', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(nexusRoot, 'component.json'), 'utf8'));
  const changelog = fs.readFileSync(path.join(nexusRoot, 'Nexus-CHANGELOG.md'), 'utf8');
  assert.equal(manifest.version, model.NEXUS_VERSION);
  assert.ok(changelog.includes(`## [${model.NEXUS_VERSION}]`));
});
