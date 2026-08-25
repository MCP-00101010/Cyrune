const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

test('managed assets follow the configured external Portal database root', () => {
  assert.match(source, /const databasePath = normalizeDatabasePath\(saveFilePath\)/);
  assert.match(source, /const assetRoot = databasePath \? dirname\(databasePath\) : deriveHubRootPath\(\)/);
  assert.match(source, /databasePath \|\| !fileUrlToPath\(hubPageUrl\) \? pathToFileUrl\(finalPath\) : relativePath/);
  assert.match(source, /\.\.\.\(databasePath \? \[\] : \['assets'\]\)/);
});

test('Relay manifest version is bumped for the runtime path change', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, '1.0.54');
});
