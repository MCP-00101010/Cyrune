require('../web/platforms.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const crypto = require('node:crypto').webcrypto;
const source = fs.readFileSync(path.join(__dirname, '../web/portal-delivery.js'), 'utf8');
const context = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms, crypto });
vm.runInContext(source, context);
const create = context.ArcadePortalDelivery.createBatch;
const entries = () => [
  { gameId: '48k', title: 'Elite 48K', emulatorId: 'eightyone', profileId: '48' },
  { gameId: '128k', title: 'Elite 128K', emulatorId: 'spectaculator', profileId: '128' },
  { gameId: 'third', title: 'Other', emulatorId: 'eightyone', profileId: '' },
];

test('sequential sends preserve exact variants, pinned settings and compact payloads', async () => {
  const sent = [], views = [];
  const input = entries(); input[0].path = 'private';
  const batch = create(input, async payload => { sent.push(JSON.parse(JSON.stringify(payload))); return { ok: true, persisted: 'shared' }; }, view => views.push(view));
  input[0].emulatorId = 'changed';
  await batch.run();
  assert.deepEqual(sent.map(row => row.gameId), ['48k', '128k', 'third']);
  assert.deepEqual(sent.map(row => row.emulatorId), ['eightyone', 'spectaculator', 'eightyone']);
  assert.deepEqual(sent.map(row => row.profileId), ['48', '128', '']);
  assert.equal(new Set(sent.map(row => row.deliveryId)).size, 3);
  assert.ok(sent.every(row => Object.keys(row).sort().join() === 'deliveryId,emulatorId,gameId,profileId'));
  assert.ok(views.at(-1).records.every(row => row.status === 'delivered'));
});

test('queue acceptance is distinct from Portal persistence and is never resent', async () => {
  const sent = [];
  const batch = create(entries(), async row => { sent.push(row); return { ok: true, queued: true }; });
  await batch.run(); await batch.run();
  assert.equal(sent.length, 3);
  assert.ok(batch.snapshot().records.every(row => row.status === 'queued'));
});

test('partial failure and a lost acknowledgement retry only unconfirmed items with identical IDs', async () => {
  const sent = [], saved = new Set();
  let loseReply = true;
  const batch = create(entries(), async row => {
    sent.push(row); saved.add(row.deliveryId);
    if (row.gameId === '128k' && loseReply) { loseReply = false; throw new Error('Reply lost'); }
    return { ok: true, persisted: 'shared' };
  });
  await batch.run();
  assert.equal(batch.snapshot().records[1].status, 'unconfirmed');
  await batch.run();
  assert.equal(sent.length, 4);
  assert.equal(sent[1].deliveryId, sent[3].deliveryId);
  assert.equal(saved.size, 3);
});

test('approval alone and failed responses are not counted as delivery', async () => {
  const batch = create(entries(), async row => row.gameId === '48k' ? { ok: true, game: {} } : { ok: false });
  await batch.run();
  assert.ok(batch.snapshot().records.every(row => row.status === 'unconfirmed'));
});

test('double activation cannot overlap sends; Stop finishes the active send and keeps the rest', async () => {
  let finish;
  const sent = [];
  const batch = create(entries(), row => { sent.push(row); return new Promise(resolve => { finish = resolve; }); });
  const running = batch.run();
  await batch.run();
  assert.equal(sent.length, 1);
  batch.stop(); finish({ ok: true, queued: true }); await running;
  assert.deepEqual(Array.from(batch.snapshot().records, row => row.status), ['queued', 'pending', 'pending']);
  const resumed = batch.run();
  finish({ ok: true, queued: true });
  await new Promise(setImmediate);
  finish({ ok: true, queued: true }); await resumed;
  assert.equal(sent.length, 3);
});

test('invalid or oversized selections fail before any send', () => {
  for (const rows of [[], [entries()[0], entries()[0]], Array.from({ length: 101 }, (_, i) => ({ gameId: String(i) }))]) {
    assert.throws(() => create(rows, () => assert.fail('Must not send')), /between 1 and 100/);
  }
});

test('a maximum batch accepts all 100 games in order', async () => {
  const sent = [];
  const batch = create(Array.from({ length: 100 }, (_, index) => ({ gameId: `game${index}` })),
    async row => { sent.push(row.gameId); return { ok: true, queued: true }; });
  await batch.run();
  assert.equal(sent.length, 100);
  assert.equal(sent.at(-1), 'game99');
  assert.ok(batch.snapshot().records.every(row => row.status === 'queued'));
});

test('the Arcade action captures each pin and the collection default instead of the focused row emulator', async () => {
  let overlay;
  const sent = [];
  const document = { activeElement: null, querySelector: () => overlay || null,
    body: { appendChild: element => { overlay = element; } } };
  const element = () => {
    const children = new Map();
    return { dataset: {}, textContent: '', addEventListener() {}, setAttribute() {}, replaceChildren() {},
      focus() { document.activeElement = this; }, remove() { overlay = null; },
      querySelector(selector) { if (!children.has(selector)) children.set(selector, element()); return children.get(selector); } };
  };
  document.createElement = element;
  const ctx = vm.createContext({ArcadePlatforms:globalThis.ArcadePlatforms, document, crypto, portalDeliveryDraft: null, webHubHandoff: {},
    state: { activeCollection: { id: 'spectrum', default_emulator: 'collection-emulator' },
      emulatorProfiles: [{ id: 'auto-128', emulator_id: 'collection-emulator', rule: { systems: ['128K'] } }] },
    els: { emulator: { value: 'focused-row-emulator' } }, gameTags: () => [],
    sendArcadeGame: async payload => { sent.push(JSON.parse(JSON.stringify(payload))); return { ok: true, queued: true }; },
  });
  const app = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../web/scrape-views.js'),'utf8');
  vm.runInContext(source + '\n' + app.slice(app.indexOf('async function sendGamesToPortal('), app.indexOf('function formatCountryCodes(')), ctx);
  await ctx.sendGamesToPortal([
    { id: '48k', title: 'Elite', system: '48K', default_emulator: 'pinned-emulator', emulator_profile: 'missing-pin' },
    { id: '128k', title: 'Elite', system: '128K' },
  ]);
  assert.equal(sent[0].emulatorId, 'pinned-emulator');
  assert.equal(sent[0].profileId, 'missing-pin'); // Host must reject a broken explicit pin; no silent fallback.
  assert.equal(sent[1].emulatorId, 'collection-emulator');
  assert.equal(sent[1].profileId, 'auto-128');
  assert.deepEqual(Array.from(ctx.portalDeliveryDraft.batch.snapshot().records, row => row.title), ['Elite (48K)', 'Elite (128K)']);
});
