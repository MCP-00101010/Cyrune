const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const portalRoot = path.join(__dirname, '..');

test('Portal and Widgets load the fixed shared-settings profile before widget runtime code', () => {
  const html = fs.readFileSync(path.join(portalRoot, 'index.html'), 'utf8');
  const adapter = fs.readFileSync(path.join(portalRoot, 'source', 'cyrune-settings.js'), 'utf8');
  const bridge = fs.readFileSync(path.join(portalRoot, 'source', 'bridge.js'), 'utf8');
  assert.ok(html.indexOf('../Nexus/client/component-settings.js') < html.indexOf('../Widgets/core/widget-sdk.js'));
  assert.ok(html.indexOf('source/cyrune-settings.js') < html.indexOf('../Widgets/core/widget-sdk.js'));
  assert.match(adapter, /component: 'portal-widgets'/);
  assert.match(adapter, /bridge\.getCyruneSettings\(\)/);
  assert.match(adapter, /cyrune:settings-revision/);
  assert.match(bridge, /MW_GET_CYRUNE_SETTINGS/);
});
