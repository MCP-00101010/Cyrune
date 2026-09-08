const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');

const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const block = source.slice(source.indexOf('// Catalogue transport stays dormant'), source.indexOf('// End catalogue transport.'));
const auth = source.slice(source.indexOf('function authorizeHubPageRequest('), source.indexOf('async function registerEmuGuiPage('));
const page = 'file:///C:/Cyrune/Portal/index.html';
const entry = { catalogueId: 'entry1', sourceId: 'source1', entryRevision: 'revision1', title: 'Elite',
  platformId: 'zx-spectrum', platformLabel: 'ZX Spectrum', hardwareLabel: '48K', editionLabel: '',
  targetKind: 'media-file', year: '', publisher: '', availability: 'ready', artworkRef: '' };
const search = () => ({ ok: true, schemaVersion: 1, catalogueRevision: 'catalogue1', entries: [{ ...entry }], nextCursor: '' });
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

function harness({ enabled = true, scummvm = false, clientScummvm = scummvm, atari = false, clientAtari = atari, reply = () => search() } = {}) {
  const ports = [], timers = new Set(), registrations = new Map();
  const sender = { tab: { id: 7, url: page }, frameId: 0, url: page };
  registrations.set(7, { url: page, sessionToken: 'token1', protocols: { 'arcade-catalogue': 1, 'arcade-scummvm': clientScummvm ? 1 : 0, 'arcade-atari-st': clientAtari ? 1 : 0 } });
  const context = vm.createContext({
    TextEncoder, URL, Promise, Date, atob, Blob, DecompressionStream,
    RELAY_PROTOCOLS: enabled ? { 'arcade-catalogue': 1, 'arcade-scummvm': scummvm ? 1 : 0, 'arcade-atari-st': atari ? 1 : 0 } : {}, hubRegistrations: registrations,
    setTimeout(callback, delay) { const timer = { callback, delay }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
    browser: {
      tabs: { get: async () => sender.tab },
      runtime: { connectNative() {
        const port = { messages: [], disconnected: false,
          onMessage: { addListener(fn) { port.receive = fn; } },
          onDisconnect: { addListener(fn) { port.lost = fn; } },
          disconnect() { port.disconnected = true; port.lost(); },
          postMessage(message) {
            port.messages.push(JSON.parse(JSON.stringify(message)));
            const response = message.type === 'ARCADE_CATALOGUE_OPEN_SESSION'
              ? { ok: true, schemaVersion: 1, sessionId: 'native' + ports.length } : reply(message);
            if (response !== undefined) Promise.resolve().then(() => port.receive(response));
          } };
        ports.push(port);
        return port;
      } }
    }
  });
  vm.runInContext(block + '\n' + auth + '\nthis.route = routeCatalogueRequest; this.close = closeCatalogueSession;', context);
  const message = (payload = {}, type = 'MW_SEARCH_ARCADE_CATALOGUE') => ({ type, payload, protocol: 1,
    morpheusPage: true, pageUrl: page, hubSessionToken: 'token1' });
  const route = async (msg = message(), from = sender) => JSON.parse(JSON.stringify(await context.route(msg, from)));
  return { context, ports, timers, registrations, sender, message, route };
}

test('catalogue gate stays closed without advertisement and creates no native connection', async () => {
  const h = harness({ enabled: false });
  assert.deepEqual(await h.route(), { ok: false, code: 'unsupported-protocol' });
  assert.equal(h.ports.length, 0);
  assert.match(source.slice(0, source.indexOf('const REQUIRED_CLIENT_PROTOCOLS')), /'arcade-catalogue': 1/);
});

test('ScummVM negotiation is native-only and old clients retain the Spectrum session', async () => {
  const scummvmPage = { ...search(), entries: [{ ...entry, platformId: 'dos', platformLabel: 'DOS', targetKind: 'scummvm-game' }] };
  const h = harness({ scummvm: true, reply: message => message.type === 'ARCADE_CATALOGUE_ENABLE_SCUMMVM'
    ? { ok: true, schemaVersion: 1 } : scummvmPage });
  assert.deepEqual(await h.route(h.message({ platformIds: ['dos'] })), scummvmPage);
  assert.equal(h.ports[0].messages[1].type, 'ARCADE_CATALOGUE_ENABLE_SCUMMVM');
  assert.deepEqual(h.ports[0].messages[2].payload, { platformIds: ['dos'] });
  const old = harness({ scummvm: true, clientScummvm: false });
  assert.deepEqual(await old.route(), search());
  assert.equal(old.ports[0].messages.length, 2);
  assert.deepEqual(await old.route(old.message({ platformIds: ['dos'] })), { ok: false, code: 'unsupported-protocol' });
});

test('old native ScummVM rejection leaves Spectrum browsing usable', async () => {
  for (const code of ['invalid-request', 'unsupported-protocol']) {
    const h = harness({ scummvm: true, reply: message => message.type === 'ARCADE_CATALOGUE_ENABLE_SCUMMVM' ? { ok: false, code } : search() });
    assert.deepEqual(await h.route(), search());
    assert.deepEqual(await h.route(), search());
    assert.equal(h.ports.length, 1);
    assert.equal(h.ports[0].disconnected, false);
  }
});

test('catalogue rejects forged, cross-tab, frame, navigated and wrong-role requests', async () => {
  const h = harness();
  for (const [msg, sender] of [
    [{ ...h.message(), hubSessionToken: 'forged' }, h.sender],
    [h.message(), { ...h.sender, tab: { id: 8, url: page } }],
    [h.message(), { ...h.sender, frameId: 1 }],
    [h.message(), { ...h.sender, url: 'file:///Arcade/index.html' }],
    [{ ...h.message(), morpheusPage: false }, h.sender]
  ]) assert.deepEqual(await h.route(msg, sender), { ok: false, code: 'unauthorized' });
  assert.equal(h.ports.length, 0);
});

test('catalogue rejects unknown context and malformed payloads before forwarding', async () => {
  const h = harness();
  for (const payload of [{ pageSize: true }, { pageSize: 101 }, { query: 'x'.repeat(161) },
    { platformIds: ['zx-spectrum', 'zx-spectrum'] }, { platformIds: ['unsupported'] }, { cursor: 'é' }, { path: 'C:/private' }]) {
    assert.deepEqual(await h.route(h.message(payload)), { ok: false, code: 'invalid-request' });
  }
  for (const field of ['role', 'sessionId', 'arguments']) assert.deepEqual(
    await h.route({ ...h.message(), [field]: 'forged' }), { ok: false, code: 'invalid-request' });
  assert.equal(h.ports.length, 0);
});

test('native session context stays extension-owned across paged requests', async () => {
  const h = harness();
  assert.deepEqual(await h.route(), search());
  assert.deepEqual(await h.route(), search());
  assert.equal(h.ports.length, 1);
  assert.equal(h.ports[0].messages.length, 3);
  assert.deepEqual(h.ports[0].messages[0], { type: 'ARCADE_CATALOGUE_OPEN_SESSION', protocol: 1,
    role: 'portal', tabId: 7, pageUrl: page });
  assert.deepEqual(h.ports[0].messages[1], { type: 'ARCADE_CATALOGUE_SEARCH', protocol: 1, sessionId: 'native1', payload: {} });
  assert.doesNotMatch(JSON.stringify(await h.route()), /sessionId|native1|pageUrl/);
});

test('two read limit bounds queued work; timeout drops queued native dispatch', async () => {
  const h = harness({ reply: () => undefined });
  const first = h.route();
  await flush();
  const second = h.route();
  await flush();
  assert.deepEqual(await h.route(), { ok: false, code: 'busy' });
  [...h.timers].find(timer => timer.delay === 15000).callback();
  assert.deepEqual(await first, { ok: false, code: 'timeout' });
  assert.deepEqual(await second, { ok: false, code: 'timeout' });
  assert.equal(h.ports[0].messages.length, 2);
  assert.equal(h.ports[0].disconnected, true);
});

test('navigation and disconnect discard late responses and require fresh native sessions', async () => {
  const h = harness({ reply: () => undefined });
  const first = h.route();
  await flush();
  h.context.close(7);
  h.ports[0].receive(search());
  assert.deepEqual(await first, { ok: false, code: 'unauthorized' });
  const second = h.route();
  await flush();
  assert.equal(h.ports.length, 2);
  h.ports[1].lost();
  assert.deepEqual(await second, { ok: false, code: 'unavailable' });
});

test('URL is rechecked after native response even before browser navigation event', async () => {
  const h = harness({ reply: () => undefined });
  const result = h.route();
  await flush();
  h.sender.tab.url = 'file:///other.html';
  h.ports[0].receive(search());
  assert.deepEqual(await result, { ok: false, code: 'unauthorized' });
});

test('old session failure cannot close a replacement connection', async () => {
  const h = harness({ reply: () => undefined });
  const old = h.route();
  await flush();
  h.context.close(7);
  const replacement = h.route();
  await flush();
  assert.deepEqual(await old, { ok: false, code: 'unauthorized' });
  assert.equal(h.ports.length, 2);
  assert.equal(h.ports[1].disconnected, false);
  h.ports[1].receive(search());
  assert.deepEqual(await replacement, search());
});

test('untrusted native paths, unknown fields, wrong identities and raw errors are discarded', async () => {
  for (const bad of [
    { ...search(), path: 'C:/private' },
    { ...search(), entries: [{ ...entry, executable: 'C:/private.exe' }] },
    { ...search(), entries: [{ ...entry, title: 'x'.repeat(161) }] },
    { ...search(), entries: [{ ...entry, artworkRef: 'https://private/' }] },
    { ok: false, code: 'unavailable', error: 'C:/private' }
  ]) {
    const h = harness({ reply: () => bad });
    assert.deepEqual(await h.route(), { ok: false, code: 'unavailable' });
    assert.equal(h.ports[0].disconnected, true);
  }
});

test('one mutation limit preserves request IDs and ordered partial retry outcomes', async () => {
  const payload = { requestId: '12345678-1234-1234-1234-123456789abc', entries: [
    { catalogueId: 'entry1', entryRevision: 'revision1' }, { catalogueId: 'entry2', entryRevision: 'revision2' }] };
  const response = { ok: true, schemaVersion: 1, requestId: payload.requestId, results: [
    { catalogueId: 'entry1', ok: true, game: { title: 'Elite', gameKey: 'game_123456789012',
      systemId: 'zx-spectrum', systemName: 'ZX Spectrum', state: 'ready', tags: [] } },
    { catalogueId: 'entry2', ok: false, code: 'entry-changed' }] };
  const h = harness({ reply: () => undefined });
  const msg = h.message(payload, 'MW_BIND_ARCADE_CATALOGUE_ENTRIES');
  const first = h.route(msg);
  await flush();
  const duplicate = h.route(msg);
  await flush();
  assert.deepEqual(await h.route({ ...msg, payload: { ...payload, requestId: '12345678-1234-1234-1234-123456789def' } }), { ok: false, code: 'busy' });
  assert.deepEqual(await h.route({ ...msg, payload: { ...payload, entries: payload.entries.slice(0, 1) } }), { ok: false, code: 'request-conflict' });
  h.ports[0].receive(response);
  assert.deepEqual(await first, response);
  assert.deepEqual(await duplicate, response);
  const retry = h.route(msg);
  await flush();
  h.ports[0].receive(response);
  assert.deepEqual(await retry, response);
  assert.deepEqual(h.ports[0].messages[1], h.ports[0].messages[2]);
});

function pngChunk(kind, bytes) {
  const data = Buffer.concat([Buffer.from(kind), bytes]);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, data, checksum]);
}

function artwork({ scanlines = Buffer.from([0, 255, 0, 0, 255]), extra = Buffer.alloc(0) } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
    extra, pngChunk('IDAT', zlib.deflateSync(scanlines)), pngChunk('IEND', Buffer.alloc(0))]);
  return { ok: true, schemaVersion: 1, catalogueId: 'entry1', artworkRef: 'art1', contentType: 'image/png',
    width: 1, height: 1, data: png.toString('base64') };
}

test('entry-owned artwork is decoded within pixel and binary limits before page delivery', async () => {
  const response = artwork();
  const h = harness({ reply: () => response });
  const msg = h.message({ catalogueId: 'entry1', artworkRef: 'art1' }, 'MW_GET_ARCADE_CATALOGUE_ARTWORK');
  assert.deepEqual(await h.route(msg), response);
  assert.deepEqual(h.ports[0].messages[1].payload, msg.payload);
});

test('artwork rejects foreign ownership, metadata, dimensions, corrupt PNG and decompression overflow', async () => {
  const badCrc = artwork();
  const bytes = Buffer.from(badCrc.data, 'base64'); bytes[bytes.length - 1] ^= 1;
  badCrc.data = bytes.toString('base64');
  for (const response of [badCrc, { ...artwork(), catalogueId: 'entry2' }, { ...artwork(), artworkRef: 'other' },
    { ...artwork(), width: 257 }, { ...artwork(), contentType: 'image/svg+xml' }, { ...artwork(), data: 'not base64' },
    artwork({ scanlines: Buffer.alloc(1000000) }), artwork({ scanlines: Buffer.from([5, 1, 2, 3, 4]) }),
    artwork({ extra: pngChunk('tEXt', Buffer.from('private\0C:/native/path')) })]) {
    const h = harness({ reply: () => response });
    assert.deepEqual(await h.route(h.message({ catalogueId: 'entry1', artworkRef: 'art1' }, 'MW_GET_ARCADE_CATALOGUE_ARTWORK')),
      { ok: false, code: 'unavailable' });
  }
});
test('version replies cannot carry native authority or unbounded option lists', () => {
  const context = vm.createContext({ TextEncoder, Map, Set, Object, Array, RELAY_PROTOCOLS: {} });
  vm.runInContext(block, context);
  const row = { catalogueId: 'entry', entryRevision: 'revision', label: 'DOS · English', platformLabel: 'DOS', languages: ['en'], countries: [], isDefault: true };
  const reply = { ok: true, result: { groupId: 'group', title: 'Game', defaultId: 'entry', versions: [row] } };
  assert.equal(context.validateGameVersionReply(reply, 'list'), true);
  assert.equal(context.validateGameVersionReply({ ok: true, result: { ok: true } }, 'default'), true);
  row.path = 'C:/private/game';
  assert.equal(context.validateGameVersionReply(reply, 'list'), false);
  delete row.path;
  reply.result.versions = Array(1001).fill(row);
  assert.equal(context.validateGameVersionReply(reply, 'list'), false);
});


test('Atari disk sets require independent page, Relay and native capability', async () => {
  const result = { ...search(), entries: [{ ...entry, platformId: 'atari-st', platformLabel: 'Atari ST', hardwareLabel: 'STe', targetKind: 'disk-set' }] };
  const reply = message => message.type === 'ARCADE_CATALOGUE_ENABLE_ATARI' ? { ok: true, schemaVersion: 1 } : result;
  const h = harness({ atari: true, reply });
  assert.deepEqual(await h.route(h.message({ platformIds: ['atari-st'] })), result);
  assert.equal(h.ports[0].messages[1].type, 'ARCADE_CATALOGUE_ENABLE_ATARI');
  for (const options of [{ atari: true, clientAtari: false }, { scummvm: true }]) {
    const old = harness({ ...options, reply: message => message.type.includes('ENABLE') ? { ok: true, schemaVersion: 1 } : result });
    assert.equal((await old.route()).ok, false, 'ScummVM Atari ports do not authorize native disk sets');
  }
  const oldHost = harness({ atari: true, reply: message => message.type.includes('ENABLE') ? { ok: false, code: 'unsupported-protocol' } : search() });
  assert.deepEqual(await oldHost.route(), search());
});
