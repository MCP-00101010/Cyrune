const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

test('Nexus uses a separate exact registration and fixed-purpose operation set', () => {
  assert.match(source, /const nexusRegistrations = new Map\(\)/);
  assert.match(source, /NEXUS_AUTHORIZE_PAGE/);
  assert.match(source, /authorizeNexusPageRequest/);
  assert.match(source, /function canonicalNexusDocumentUrl/);
  assert.match(source, /parsed\.hash = ''/);
  assert.match(source, /canonicalNexusDocumentUrl\(changeInfo\.url\)/);
  assert.match(source, /This request is not authorized for Cyrune Nexus/);
  assert.match(source, /MW_NEXUS_GET_SETTINGS/);
  assert.match(source, /MW_NEXUS_SAVE_SETTINGS/);
  assert.match(source, /MW_NEXUS_GET_STATUS/);
  assert.match(source, /MW_NEXUS_GET_DOCUMENT/);
  assert.match(source, /MW_NEXUS_OPEN_TODO/);
  assert.match(source, /MW_NEXUS_CHECK_REMOTE/);
  assert.doesNotMatch(source, /NEXUS_[A-Z_]+.*(?:shell|command|arbitraryPath)/i);
});

test('Nexus document routing is allowlisted by component and document type', () => {
  assert.match(source, /allowedComponents = new Set\(\['portal', 'widgets', 'arcade', 'relay', 'host', 'nexus', 'project'\]\)/);
  assert.match(source, /allowedTypes = new Set\(\['todo', 'changelog', 'project'\]\)/);
  assert.match(source, /nexusNativeRequest\(\{ type: 'NEXUS_OPEN_TODO', component \}\)/);
  assert.match(source, /nexusNativeRequest\(\{ type: 'NEXUS_CHECK_REMOTE' \}\)/);
  assert.match(source, /MAX_NEXUS_SETTINGS_BYTES = 64 \* 1024/);
});
