const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('game repair forwards only a bounded public reference through native navigation', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
  const start = source.indexOf('async function openGameInEmuGui(');
  const requests = [], tabs = [];
  const c = vm.createContext({URL, nativeAvailable: true, EMUGUI_REQUEST_TIMEOUT_MS: 120000,
    ensureNativeStorageReady: async () => {}, sendPersistentNativeMessage: async request => {
      requests.push(request);
      return {ok: true, url: 'file:///C:/Cyrune/Arcade/web/index.html?game=elite'};
    }, browser: {tabs: {query: async () => [], create: async tab => tabs.push(tab)}}});
  vm.runInContext(source.slice(start, source.indexOf('async function writeNativeSnapshot(', start)), c);
  assert.equal((await c.openGameInEmuGui('game_abcdefghijklmnop', true, 'stable_game_entry')).ok, true);
  assert.equal(requests[0].catalogueId, 'stable_game_entry');
  assert.equal(requests[0].rebind, true);
  assert.equal(tabs.length, 1);
  for (const invalid of ['../private', 'x'.repeat(81), {}, null]) {
    await assert.rejects(c.openGameInEmuGui('game_abcdefghijklmnop', true, invalid), /Invalid game reference/);
  }
  assert.equal(requests.length, 1);
  assert.doesNotMatch(source, /case 'MW_FORGET_GAME'/);
});
