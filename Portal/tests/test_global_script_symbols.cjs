const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('classic Hub scripts do not silently override top-level function declarations', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)]
    .map(match => match[1])
    .filter(file => file.startsWith('source/') || file.startsWith('../Widgets/'));
  const declarations = new Map();

  for (const file of scripts) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
      const locations = declarations.get(match[1]) || [];
      locations.push(file);
      declarations.set(match[1], locations);
    }
  }

  const duplicates = [...declarations]
    .filter(([, locations]) => locations.length > 1)
    .map(([name, locations]) => `${name}: ${locations.join(', ')}`);
  assert.deepEqual(duplicates, []);
});

test('Import Manager exposes distinct item and path selectors', () => {
  const stateSource = fs.readFileSync(path.join(__dirname, '..', 'source', 'state.js'), 'utf8');
  const importSource = fs.readFileSync(path.join(__dirname, '..', 'source', 'import.js'), 'utf8');
  assert.match(stateSource, /function findImportManagerItemPath\(itemId\)/);
  assert.match(importSource, /function getImportManagerItemById\(itemId,/);
  assert.doesNotMatch(`${stateSource}\n${importSource}`, /function findImportManagerItemById\(/);
});

test('Undo history uses canonical snapshots with duplicate and memory bounds', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'source', 'app.js'), 'utf8');
  assert.match(appSource, /const MAX_UNDO_BYTES = 8 \* 1024 \* 1024/);
  assert.match(appSource, /serializeStateSnapshot\(\)/);
  assert.match(appSource, /undoStack\[undoStack\.length - 1\] === snapshot/);
  assert.match(appSource, /trimHistoryStack\(undoStack, undoStackBytes\)/);
  assert.match(appSource, /trimHistoryStack\(redoStack, redoStackBytes\)/);
});

test('binding status changes use targeted content rendering', () => {
  const renderSource = fs.readFileSync(path.join(__dirname, '..', 'source', 'render.js'), 'utf8');
  const gameSource = fs.readFileSync(path.join(__dirname, '..', 'source', 'game-launcher.js'), 'utf8');
  const applicationSource = fs.readFileSync(path.join(__dirname, '..', 'source', 'application-launcher.js'), 'utf8');
  assert.match(renderSource, /function renderContentSurfaces\(options = \{\}\)/);
  assert.match(renderSource, /renderContentSurfaces\(\{ prepare: false \}\)/);
  assert.match(gameSource, /renderContentSurfaces\(\)/);
  assert.match(applicationSource, /renderContentSurfaces\(\)/);
});

test('background asset presentation is split from the main stylesheet', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'source', 'styles.css'), 'utf8');
  const backgroundStyles = fs.readFileSync(path.join(root, 'source', 'background-assets.css'), 'utf8');
  assert.match(html, /source\/background-assets\.css/);
  assert.doesNotMatch(styles, /\.bg-drop-zone\s*\{/);
  assert.match(backgroundStyles, /\.bg-drop-zone\.has-preview/);
});
