'use strict';

const RELAY_PROTOCOLS = Object.freeze({
  'arcade-catalogue': 1,
  'arcade-scummvm': 1,
  'arcade-atari-st': 1, 'arcade-gameboy': 1,
  'portal-relay': 2,
  'arcade-relay': 2,
  'nexus-relay': 2,
  'host-native': 3,
  'component-settings': 2
});
const REQUIRED_CLIENT_PROTOCOLS = Object.freeze({
  portal: Object.freeze({ 'portal-relay': 2, 'component-settings': 2 }),
  arcade: Object.freeze({ 'arcade-relay': 2, 'arcade-service': 2, 'component-settings': 2 }),
  nexus: Object.freeze({ 'nexus-relay': 2, 'component-settings': 2 })
});
const RELAY_COMPONENT_CAPABILITIES = Object.freeze([
  'browser-sessions', 'durable-intake', 'exact-page-auth', 'native-transport', 'notifications'
]);

// Tab ID of the currently registered Cyrune Portal page.
let morpheusTabId = null;

// Shared database file path resolved via native host config.
let saveFilePath = null;

// Whether the native messaging host is reachable.
let nativeAvailable = false;
let nativeError = '';
let hubPageUrl = '';
let hubRelayError = '';
let hubRegisteredAt = 0;
const hubRegistrations = new Map();
const emuguiRegistrations = new Map();
const nexusRegistrations = new Map();
let lastActiveWebTab = null;
let storageInfoReady = false;
let fileSchemeAccess = null;
let fileSchemeAccessRequired = false;

// All shared-database writes are serialized here. Requests are never merged:
// every caller receives the result for its own snapshot.
const nativeSaveQueue = [];
let nativeSaveQueueRunning = false;

const MENU_IMPORT_BOOKMARK_ID = 'morpheus-import-bookmark';
const DATABASE_READ_CHUNK_BYTES = 512 * 1024;
const PAGE_DATABASE_READ_CHUNK_BYTES = 256 * 1024;
const ASSET_WRITE_CHUNK_CHARS = 512 * 1024;
const MAX_BACKGROUND_ASSET_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const MAX_NATIVE_FAVICON_BYTES = 1024 * 1024;
const MAX_FEED_RESPONSE_BYTES = 2 * 1024 * 1024;
const FEED_FETCH_TIMEOUT_MS = 15000;
const URL_HEALTH_TIMEOUT_MS = 15000;
const IMAGE_ASSET_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpg', 'jpeg', 'png', 'svg', 'webp']);
const NATIVE_REQUEST_TIMEOUT_MS = 15000;
const EMUGUI_REQUEST_TIMEOUT_MS = 120000;
const MAX_EMUGUI_TRANSFER_BYTES = 32 * 1024 * 1024;
const MAX_EMUGUI_REMOTE_ASSET_BYTES = 4 * 1024 * 1024;
const EMUGUI_REMOTE_ASSET_TIMEOUT_MS = 30000;
const EMUGUI_REMOTE_ASSET_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const ARCADE_REMOTE_ARTWORK_HOSTS = new Set([
  'cdn.thegamesdb.net',
  'images.thegamesdb.net',
  'media.screenscraper.fr',
  'screenscraper.fr',
  'www.screenscraper.fr'
]);
const DIRECTORY_APPROVAL_TIMEOUT_MS = 300000;
const TRANSLATOR_ASSET_TIMEOUT_MS = 45000;
const TRANSLATOR_ASSET_MAX_CHUNK_BYTES = 1024 * 1024;
const NATIVE_RETRY_COOLDOWN_MS = 5000;
const NOTIFICATION_JOBS_KEY = 'morpheusNotificationJobsV1';
const NOTIFICATION_EVENTS_KEY = 'morpheusNotificationEventsV1';
const NOTIFICATION_PENDING_ACTION_KEY = 'morpheusNotificationPendingActionV1';
const LAST_HUB_URL_KEY = 'morpheusLastHubUrlV1';
const PORTAL_SNAPSHOT_KEY = 'cyrunePortalSnapshotV1';
const PORTAL_AUTHORITY_KEY = 'cyrunePortalAuthorityV1';
const PORTAL_SNAPSHOT_MIGRATION_RECEIPT_KEY = 'cyrunePortalSnapshotMigrationReceiptV1';
const DURABLE_INTAKE_KEY = 'cyruneDurableIntakeV1';
const NOTIFICATION_ALARM_PREFIX = 'morpheus-notification:';
const MAX_NOTIFICATION_JOBS = 256;
const MAX_NOTIFICATION_EVENTS = 200;
const MAX_DURABLE_INTAKE_ITEMS = 128;
const MAX_DURABLE_INTAKE_BYTES = 4 * 1024 * 1024;
const MAX_DURABLE_DELIVERY_BYTES = 1024 * 1024;
let notificationMutation = Promise.resolve();
let relaySnapshotMutation = Promise.resolve();
let durableIntakeMutation = Promise.resolve();
let durableIntakeDrain = null;
let durableIntakeDrainRequested = false;
const TRANSLATOR_ASSET_ROOT = 'https://firefox-settings-attachments.cdn.mozilla.net/';
const TRANSLATOR_ASSETS = Object.freeze({
  'ende:model:2.1': { location: 'main-workspace/translations-models/23db71e7-b6d9-45eb-a47d-0290d7d8ef63.bin', size: 31561787, hash: '8df29d9494d19f47fd5d97c6a73474c6f657e9f81c1a607c431d02befdf3810f' },
  'ende:lex:2.1': { location: 'main-workspace/translations-models/bc072b1a-7749-43f7-9fe0-34a6dff10c4a.bin', size: 4347672, hash: '7ed39f1cffbd68a27ddf05bbfe068de2060f1d7e69f1a20e27ae923551dd7393' },
  'ende:vocab:2.1': { location: 'main-workspace/translations-models/261225ea-5a52-455b-981c-7d09c6e6da3c.spm', size: 810073, hash: '69f730becafa48e3bb2c244eab66456877c08959a02f2bd5519b5a3088b62f9c' },
  'deen:model:2.0': { location: 'main-workspace/translations-models/f44b1b1b-9df6-4ece-971e-0e5ce96fae54.bin', size: 31561787, hash: '3e6f7c2c2425d10824797270b382bee718ff34af2cab9308841c82ca46dc6f20' },
  'deen:lex:2.0': { location: 'main-workspace/translations-models/d0e4efcb-6145-43db-a69e-568904cc2925.bin', size: 4945796, hash: '113b98460468360cca68c042e1cddf49c4e1931cbb975ed04349c9a3bd607010' },
  'deen:vocab:2.0': { location: 'main-workspace/translations-models/8ad4d93e-21e6-4862-81d5-c1c3a7d0767b.spm', size: 810073, hash: '69f730becafa48e3bb2c244eab66456877c08959a02f2bd5519b5a3088b62f9c' }
});
const HUB_PAGE_REQUEST_TYPES = new Set([
  'MW_PING', 'MW_GET_STORAGE_INFO', 'MW_SET_DATABASE_PATH', 'MW_PICK_DATABASE_PATH',
  'MW_SAVE', 'MW_LOAD', 'MW_LOAD_SHARED_CHUNK', 'MW_GET_DATABASE_FILE_INFO',
  'MW_OPEN_FILE_PICKER', 'MW_BEGIN_ASSET_WRITE', 'MW_APPEND_ASSET_WRITE',
  'MW_FINISH_ASSET_WRITE', 'MW_ABORT_ASSET_WRITE', 'MW_CACHE_ASSET_URL',
  'MW_FETCH_FAVICON', 'MW_FETCH_FEED', 'MW_FETCH_CALENDAR', 'MW_CHECK_URL', 'MW_SECRET_STATUS', 'MW_SECRET_GET',
  'MW_SECRET_SET', 'MW_SECRET_DELETE', 'MW_SECRET_LIST', 'MW_LIST_THEMES',
  'MW_WRITE_THEME', 'MW_CAPTURE_BROWSER_SESSION', 'MW_LAUNCH_BROWSER_SESSION',
  'MW_LIST_DATABASE_BACKUPS', 'MW_READ_DATABASE_BACKUP', 'MW_CREATE_DATABASE_BACKUP',
  'MW_MONITOR_SERVICE', 'MW_SYSTEM_METRICS', 'MW_APPROVE_DIRECTORY',
  'MW_GIT_WORKSPACE_STATUS', 'MW_OPEN_APPROVED_DIRECTORY', 'MW_LIST_RECENT_FILES', 'MW_OPEN_APPROVED_FILE',
  'MW_APPROVE_APPLICATION', 'MW_APPROVE_APPLICATION_LINK', 'MW_GET_APPLICATION_STATUS', 'MW_LAUNCH_APPROVED_APPLICATION',
  'MW_REVEAL_APPROVED_APPLICATION', 'MW_FORGET_APPROVED_APPLICATION',
  'MW_EMUGUI_STATUS', 'MW_GET_GAME_STATUS', 'MW_LAUNCH_GAME', 'MW_GAME_VERSIONS', 'MW_OPEN_GAME_IN_EMUGUI',
  'MW_REVEAL_GAME',
  'MW_FETCH_TRANSLATOR_ASSET_CHUNK', 'MW_NOTIFICATION_SCHEDULE', 'MW_NOTIFICATION_CANCEL',
  'MW_NOTIFICATION_LIST', 'MW_NOTIFICATION_MARK_READ', 'MW_NOTIFICATION_CLEAR', 'MW_PRODUCTIVITY',
  'MW_GET_CYRUNE_SETTINGS', 'MW_PUBLISH_PORTAL_THEME'
]);
const EMUGUI_PAGE_REQUEST_TYPES = new Set(['MW_EMUGUI_SEND_GAME', 'MW_EMUGUI_RPC', 'MW_EMUGUI_ASSET', 'MW_EMUGUI_GET_CYRUNE_SETTINGS', 'MW_EMUGUI_GET_PORTAL_THEME']);
const NEXUS_PAGE_REQUEST_TYPES = new Set([
  'MW_NEXUS_PING', 'MW_NEXUS_GET_SETTINGS', 'MW_NEXUS_SAVE_SETTINGS',
  'MW_NEXUS_GET_STATUS', 'MW_NEXUS_GET_DOCUMENT', 'MW_NEXUS_OPEN_TODO',
  'MW_NEXUS_CHECK_REMOTE'
]);
const MAX_NEXUS_SETTINGS_BYTES = 64 * 1024;

// Catalogue transport stays dormant until the four-participant rollout gate.
const CATALOGUE_ROUTES = Object.freeze({
  MW_SEARCH_ARCADE_CATALOGUE: 'ARCADE_CATALOGUE_SEARCH',
  MW_GET_ARCADE_CATALOGUE_ENTRY: 'ARCADE_CATALOGUE_GET_ENTRY',
  MW_GET_ARCADE_CATALOGUE_ARTWORK: 'ARCADE_CATALOGUE_GET_ARTWORK',
  MW_BIND_ARCADE_CATALOGUE_ENTRIES: 'ARCADE_CATALOGUE_BIND_ENTRIES'
});
const CATALOGUE_CODES = new Set(['invalid-request', 'unsupported-protocol', 'unauthorized', 'unavailable',
  'busy', 'timeout', 'catalogue-changed', 'entry-changed', 'entry-missing', 'source-unavailable',
  'media-missing', 'configuration-required', 'unsupported-target', 'review-required', 'binding-limit',
  'binding-forgotten', 'request-conflict', 'persistence-failed']);
const CATALOGUE_PLATFORMS = Object.freeze({ 'zx-spectrum': 'ZX Spectrum', 'game-boy': 'Game Boy', dos: 'DOS', windows: 'Windows', 'fm-towns': 'FM Towns', amiga: 'Amiga', 'atari-st': 'Atari ST', macintosh: 'Macintosh', unknown: 'Unspecified platform' });
const catalogueSessions = new Map();
const catalogueBytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const catalogueObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const catalogueId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const catalogueText = (value, limit) => typeof value === 'string' && [...value].length <= limit && !/\p{C}/u.test(value);
const catalogueKeys = (value, fields) => catalogueObject(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));

function validateCataloguePayload(type, payload) {
  if (!catalogueObject(payload) || catalogueBytes(payload) > 32 * 1024) return false;
  if (type === 'MW_SEARCH_ARCADE_CATALOGUE') {
    const { query = '', platformIds = [], pageSize = 50, cursor = '' } = payload;
    return Object.keys(payload).every(key => ['query', 'platformIds', 'pageSize', 'cursor', 'groupVersions'].includes(key))
      && (payload.groupVersions === undefined || typeof payload.groupVersions === 'boolean')
      && catalogueText(query, 160) && Array.isArray(platformIds) && platformIds.length <= 4
      && platformIds.every(id => typeof id === 'string' && Object.hasOwn(CATALOGUE_PLATFORMS, id)) && new Set(platformIds).size === platformIds.length
      && Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100
      && typeof cursor === 'string' && /^[\x20-\x7e]{0,256}$/.test(cursor);
  }
  if (type === 'MW_GET_ARCADE_CATALOGUE_ENTRY') return catalogueKeys(payload, ['catalogueId']) && catalogueId(payload.catalogueId);
  if (type === 'MW_GET_ARCADE_CATALOGUE_ARTWORK') return catalogueKeys(payload, ['catalogueId', 'artworkRef'])
    && catalogueId(payload.catalogueId) && typeof payload.artworkRef === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(payload.artworkRef);
  return catalogueKeys(payload, ['requestId', 'entries']) && typeof payload.requestId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(payload.requestId)
    && Array.isArray(payload.entries) && payload.entries.length >= 1 && payload.entries.length <= 100
    && payload.entries.every(entry => catalogueKeys(entry, ['catalogueId', 'entryRevision']) && catalogueId(entry.catalogueId) && catalogueId(entry.entryRevision))
    && new Set(payload.entries.map(entry => entry.catalogueId)).size === payload.entries.length;
}

function validateCatalogueEntry(entry, detail) {
  const text = { title: 160, platformLabel: 80, hardwareLabel: 80, editionLabel: 160, year: 16, publisher: 160, artworkRef: 128 };
  const fields = [...Object.keys(text), 'catalogueId', 'sourceId', 'entryRevision', 'platformId', 'targetKind', 'availability'];
  if (!catalogueKeys(entry, detail ? [...fields, 'description', 'languages', 'countries', 'suggestedTags'] : fields)) return false;
  if (!['catalogueId', 'sourceId', 'entryRevision'].every(key => catalogueId(entry[key]))
    || !Object.entries(text).every(([key, limit]) => catalogueText(entry[key], limit))
    || typeof entry.platformId !== 'string' || !Object.hasOwn(CATALOGUE_PLATFORMS, entry.platformId) || entry.platformLabel !== CATALOGUE_PLATFORMS[entry.platformId]
    || !(['zx-spectrum','game-boy'].includes(entry.platformId) ? entry.targetKind === 'media-file' : entry.targetKind === 'scummvm-game' || entry.platformId === 'atari-st' && entry.targetKind === 'disk-set')
    || !['ready', 'available', 'source-unavailable', 'media-missing', 'configuration-required', 'unsupported', 'review-required'].includes(entry.availability)
    || !/^[A-Za-z0-9_-]{0,128}$/.test(entry.artworkRef) || catalogueBytes(Object.fromEntries(fields.map(key => [key, entry[key]]))) > 2048) return false;
  return !detail || (catalogueText(entry.description, 2000)
    && Object.entries({ languages: 16, countries: 16, suggestedTags: 80 }).every(([key, limit]) =>
      Array.isArray(entry[key]) && entry[key].length <= 12 && entry[key].every(value => catalogueText(value, limit))));
}

function validateCatalogueResponse(type, payload, response) {
  const limit = type === 'MW_GET_ARCADE_CATALOGUE_ENTRY' ? 16 * 1024 : type === 'MW_GET_ARCADE_CATALOGUE_ARTWORK' ? 192 * 1024 : 256 * 1024;
  if (!catalogueObject(response) || catalogueBytes(response) > limit) return false;
  if (response.ok === false) return catalogueKeys(response, ['ok', 'code']) && CATALOGUE_CODES.has(response.code);
  if (response.ok !== true || response.schemaVersion !== 1) return false;
  if (type === 'MW_SEARCH_ARCADE_CATALOGUE') return catalogueKeys(response, ['ok', 'schemaVersion', 'catalogueRevision', 'entries', 'nextCursor'])
    && catalogueId(response.catalogueRevision) && typeof response.nextCursor === 'string' && /^[\x20-\x7e]{0,256}$/.test(response.nextCursor)
    && Array.isArray(response.entries) && response.entries.length <= (payload.pageSize ?? 50)
    && response.entries.every(entry => validateCatalogueEntry(entry, false))
    && new Set(response.entries.map(entry => entry.catalogueId)).size === response.entries.length;
  if (type === 'MW_GET_ARCADE_CATALOGUE_ENTRY') return catalogueKeys(response, ['ok', 'schemaVersion', 'entry'])
    && validateCatalogueEntry(response.entry, true) && response.entry.catalogueId === payload.catalogueId;
  if (type === 'MW_GET_ARCADE_CATALOGUE_ARTWORK') return catalogueKeys(response, ['ok', 'schemaVersion', 'catalogueId', 'artworkRef', 'contentType', 'width', 'height', 'data'])
    && response.catalogueId === payload.catalogueId && response.artworkRef === payload.artworkRef && response.contentType === 'image/png'
    && Number.isInteger(response.width) && response.width >= 1 && response.width <= 256
    && Number.isInteger(response.height) && response.height >= 1 && response.height <= 256
    && typeof response.data === 'string' && response.data.length <= 4 * Math.ceil(128 * 1024 / 3)
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(response.data);
  if (type !== 'MW_BIND_ARCADE_CATALOGUE_ENTRIES') return false;
  return catalogueKeys(response, ['ok', 'schemaVersion', 'requestId', 'results']) && response.requestId === payload.requestId
    && Array.isArray(response.results) && response.results.length === payload.entries.length
    && response.results.every((result, index) => {
      if (!catalogueObject(result) || result.catalogueId !== payload.entries[index].catalogueId) return false;
      if (result.ok === false) return catalogueKeys(result, ['catalogueId', 'ok', 'code']) && CATALOGUE_CODES.has(result.code);
      return result.ok === true && catalogueKeys(result, ['catalogueId', 'ok', 'game'])
        && catalogueKeys(result.game, ['title', 'systemId', 'systemName', 'gameKey', 'state', 'tags'])
        && result.game.state === 'ready' && Array.isArray(result.game.tags) && result.game.tags.length === 0
        && catalogueText(result.game.title, 160) && typeof result.game.systemId === 'string' && Object.hasOwn(CATALOGUE_PLATFORMS, result.game.systemId) && result.game.systemName === CATALOGUE_PLATFORMS[result.game.systemId]
        && typeof result.game.gameKey === 'string' && /^game_[A-Za-z0-9_-]{12,75}$/.test(result.game.gameKey);
    });
}

async function validateCataloguePng(response) {
  // Host emits exactly IHDR / IDAT / IEND, 8-bit RGBA, and filter-zero rows.
  const bytes = Uint8Array.from(atob(response.data), c => c.charCodeAt(0));
  if (bytes.length < 57 || bytes.length > 128 * 1024 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return false;
  const view = new DataView(bytes.buffer);
  let offset = 8, compressed;
  for (const kind of ['IHDR', 'IDAT', 'IEND']) {
    if (offset + 12 > bytes.length) return false;
    const length = view.getUint32(offset);
    if (offset + length + 12 > bytes.length || String.fromCharCode(...bytes.slice(offset + 4, offset + 8)) !== kind) return false;
    let crc = 0xffffffff;
    for (let i = offset + 4; i < offset + 8 + length; i++) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(offset + length + 8)) return false;
    if (kind === 'IHDR' && (length !== 13 || view.getUint32(offset + 8) !== response.width || view.getUint32(offset + 12) !== response.height
      || ![8, 6, 0, 0, 0].every((value, i) => bytes[offset + 16 + i] === value))) return false;
    if (kind === 'IDAT') compressed = bytes.slice(offset + 8, offset + 8 + length);
    if (kind === 'IEND' && length !== 0) return false;
    offset += length + 12;
  }
  if (offset !== bytes.length || typeof DecompressionStream !== 'function') return false;
  const expected = (response.width * 4 + 1) * response.height;
  const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return size === expected;
      if (size + value.length > expected) return false;
      for (let i = 0; i < value.length; i++) if ((size + i) % (response.width * 4 + 1) === 0 && value[i] !== 0) return false;
      size += value.length;
    }
  } finally { await reader.cancel().catch(() => {}); }
}

function closeCatalogueSession(tabId, code = 'unauthorized') {
  const state = catalogueSessions.get(tabId);
  if (!state) return;
  catalogueSessions.delete(tabId);
  state.closed = true;
  clearTimeout(state.leaseTimer);
  for (const reject of state.pending) reject({ code });
  state.pending.clear();
  state.active?.reject({ code });
  state.active = null;
  try { state.port.disconnect(); } catch {}
}

async function cataloguePageCurrent(msg, sender, state = null) {
  if (!authorizeHubPageRequest(msg, sender) || sender.frameId !== 0 || sender.url !== msg.pageUrl) return false;
  if (state && (state.closed || state.token !== msg.hubSessionToken || state.url !== msg.pageUrl)) return false;
  const tab = await browser.tabs.get(sender.tab.id).catch(() => null);
  return tab?.url === msg.pageUrl && tab.status !== 'loading' && authorizeHubPageRequest(msg, sender) && !state?.closed;
}

function catalogueExchange(state, message) {
  return new Promise((resolve, reject) => {
    if (state.closed) return reject({ code: 'unauthorized' });
    state.active = { resolve, reject };
    try { state.port.postMessage(message); } catch { closeCatalogueSession(state.tabId, 'unavailable'); }
  });
}

async function routeCatalogueRequest(msg, sender) {
  try {
    if (!await cataloguePageCurrent(msg, sender)) return { ok: false, code: 'unauthorized' };
    const registration = hubRegistrations.get(sender.tab.id);
    if (msg.protocol !== 1 || RELAY_PROTOCOLS['arcade-catalogue'] !== 1 || registration.protocols?.['arcade-catalogue'] !== 1) {
      return { ok: false, code: 'unsupported-protocol' };
    }
    const fields = ['type', 'payload', 'protocol', 'morpheusPage', 'pageUrl', 'hubSessionToken', '_mw', '_req', 'id'];
    if (Object.keys(msg).some(key => !fields.includes(key)) || !validateCataloguePayload(msg.type, msg.payload)) return { ok: false, code: 'invalid-request' };
    if (typeof browser.runtime.connectNative !== 'function') return { ok: false, code: 'unavailable' };
    let state = catalogueSessions.get(sender.tab.id);
    if (state && (state.token !== registration.sessionToken || state.url !== registration.url)) {
      closeCatalogueSession(sender.tab.id);
      state = null;
    }
    if (!state) {
      if (catalogueSessions.size >= 64) return { ok: false, code: 'busy' };
      const port = browser.runtime.connectNative('morpheus_webhub');
      state = { port, tabId: sender.tab.id, token: registration.sessionToken, url: registration.url,
        reads: 0, mutations: 0, closed: false, pending: new Set(), tail: Promise.resolve(), sessionId: '', scummvm: false, atari: false };
      catalogueSessions.set(state.tabId, state);
      state.leaseTimer = setTimeout(() => closeCatalogueSession(state.tabId), 30 * 60 * 1000);
      port.onDisconnect.addListener(() => { if (catalogueSessions.get(state.tabId) === state) closeCatalogueSession(state.tabId, 'unavailable'); });
      port.onMessage.addListener(response => {
        const active = state.active;
        state.active = null;
        if (!state.closed) active?.resolve(response);
      });
    }
    const mutation = msg.type === 'MW_BIND_ARCADE_CATALOGUE_ENTRIES';
    const counter = mutation ? 'mutations' : 'reads';
    const selection = mutation ? JSON.stringify(msg.payload.entries.map(entry => [entry.catalogueId, entry.entryRevision])) : '';
    if (mutation && state.inFlight?.requestId === msg.payload.requestId) {
      if (state.inFlight.selection !== selection) return { ok: false, code: 'request-conflict' };
      const shared = state.inFlight;
      if (shared.waiters >= 64) return { ok: false, code: 'busy' };
      shared.waiters += 1;
      try {
        const response = await shared.promise;
        return await cataloguePageCurrent(msg, sender, state) ? response : { ok: false, code: 'unauthorized' };
      } finally { shared.waiters -= 1; }
    }
    if (state[counter] >= (mutation ? 1 : 2)) return { ok: false, code: 'busy' };
    state[counter] += 1;
    let timer, rejectPending;
    const work = state.tail.then(async () => {
      if (!await cataloguePageCurrent(msg, sender, state)) throw { code: 'unauthorized' };
      if (!state.sessionId) {
        const opened = await catalogueExchange(state, { type: 'ARCADE_CATALOGUE_OPEN_SESSION', protocol: 1,
          role: 'portal', tabId: state.tabId, pageUrl: state.url });
        if (opened?.ok === false && CATALOGUE_CODES.has(opened.code)) throw { code: opened.code };
        if (!catalogueKeys(opened, ['ok', 'schemaVersion', 'sessionId']) || opened.ok !== true || opened.schemaVersion !== 1 || !catalogueId(opened.sessionId)) throw { code: 'unavailable' };
        state.sessionId = opened.sessionId;
        if (RELAY_PROTOCOLS['arcade-scummvm'] === 1 && registration.protocols?.['arcade-scummvm'] === 1) {
          const enabled = await catalogueExchange(state, { type: 'ARCADE_CATALOGUE_ENABLE_SCUMMVM', protocol: 1,
            sessionId: state.sessionId, payload: {} });
          if (catalogueKeys(enabled, ['ok', 'schemaVersion']) && enabled.ok === true && enabled.schemaVersion === 1) state.scummvm = true;
          else if (!(catalogueKeys(enabled, ['ok', 'code']) && enabled.ok === false
            && ['unsupported-protocol', 'invalid-request'].includes(enabled.code))) throw { code: 'unavailable' };
        }
        if (RELAY_PROTOCOLS['arcade-atari-st'] === 1 && registration.protocols?.['arcade-atari-st'] === 1) {
          const enabled = await catalogueExchange(state, { type: 'ARCADE_CATALOGUE_ENABLE_ATARI', protocol: 1,
            sessionId: state.sessionId, payload: {} });
          if (catalogueKeys(enabled, ['ok', 'schemaVersion']) && enabled.ok === true && enabled.schemaVersion === 1) state.atari = true;
          else if (!(catalogueKeys(enabled, ['ok', 'code']) && enabled.ok === false
            && ['unsupported-protocol', 'invalid-request'].includes(enabled.code))) throw { code: 'unavailable' };
        }
        if (RELAY_PROTOCOLS['arcade-gameboy'] === 1 && registration.protocols?.['arcade-gameboy'] === 1) {
          const enabled = await catalogueExchange(state, { type: 'ARCADE_CATALOGUE_ENABLE_GAMEBOY', protocol: 1,
            sessionId: state.sessionId, payload: {} });
          if (catalogueKeys(enabled, ['ok', 'schemaVersion']) && enabled.ok === true && enabled.schemaVersion === 1) state.gameboy = true;
          else if (!(catalogueKeys(enabled, ['ok', 'code']) && enabled.ok === false
            && ['unsupported-protocol', 'invalid-request'].includes(enabled.code))) throw { code: 'unavailable' };
        }
      }
      if (!await cataloguePageCurrent(msg, sender, state)) throw { code: 'unauthorized' };
      if (!state.scummvm && msg.type === 'MW_SEARCH_ARCADE_CATALOGUE' && msg.payload.platformIds?.some(id => id !== 'zx-spectrum' && !(state.atari && id === 'atari-st') && !(state.gameboy && id === 'game-boy'))) {
        return { ok: false, code: 'unsupported-protocol' };
      }
      const response = await catalogueExchange(state, { type: CATALOGUE_ROUTES[msg.type], protocol: 1, sessionId: state.sessionId, payload: msg.payload });
      if (!await cataloguePageCurrent(msg, sender, state)) throw { code: 'unauthorized' };
      if (!validateCatalogueResponse(msg.type, msg.payload, response)) throw { code: 'unavailable' };
      if (response.ok === true) {
        const permitted = entry => entry.targetKind === 'media-file' && (entry.platformId !== 'game-boy' || state.gameboy) || entry.targetKind === 'scummvm-game' && state.scummvm || entry.targetKind === 'disk-set' && state.atari;
        if (response.entries?.some(entry => !permitted(entry)) || response.entry && !permitted(response.entry)
          || response.results?.some(result => result.ok && result.game.systemId !== 'zx-spectrum' && !state.scummvm && !(state.atari && result.game.systemId === 'atari-st'))) throw { code: 'unavailable' };
      }
      if (msg.type === 'MW_GET_ARCADE_CATALOGUE_ARTWORK' && response.ok === true && !await validateCataloguePng(response)) throw { code: 'unavailable' };
      if (!await cataloguePageCurrent(msg, sender, state)) throw { code: 'unauthorized' };
      return response;
    });
    state.tail = work.catch(() => {});
    const outcome = Promise.race([work, new Promise((resolve, reject) => {
        rejectPending = reject;
        state.pending.add(reject);
        timer = setTimeout(() => closeCatalogueSession(state.tabId, 'timeout'), mutation ? 30000 : 15000);
      })]);
    if (mutation) state.inFlight = { requestId: msg.payload.requestId, selection, promise: outcome, waiters: 0 };
    try {
      return await outcome;
    } catch (error) {
      if (catalogueSessions.get(state.tabId) === state) {
        closeCatalogueSession(state.tabId, CATALOGUE_CODES.has(error?.code) ? error.code : 'unavailable');
      }
      throw error;
    } finally {
      clearTimeout(timer);
      state.pending.delete(rejectPending);
      state[counter] -= 1;
      if (mutation) state.inFlight = null;
    }
  } catch (error) { return { ok: false, code: CATALOGUE_CODES.has(error?.code) ? error.code : 'unavailable' }; }
}
function validateGameVersionReply(response, action) {
  if (!catalogueKeys(response, ['ok', 'result']) || response.ok !== true || catalogueBytes(response) > 600 * 1024) return false;
  const result = response.result;
  if (action !== 'list') return catalogueKeys(result, ['ok']) && result.ok === true;
  return catalogueKeys(result, ['groupId', 'title', 'defaultId', 'versions'])
    && catalogueId(result.groupId) && catalogueId(result.defaultId) && catalogueText(result.title, 160)
    && Array.isArray(result.versions) && result.versions.length >= 1 && result.versions.length <= 1000
    && new Set(result.versions.map(row => row?.catalogueId)).size === result.versions.length
    && result.versions.every(row => catalogueKeys(row, ['catalogueId', 'entryRevision', 'label', 'platformLabel', 'languages', 'countries', 'isDefault'])
      && catalogueId(row.catalogueId) && catalogueId(row.entryRevision) && catalogueText(row.label, 520)
      && catalogueText(row.platformLabel, 80) && typeof row.isDefault === 'boolean'
      && ['languages', 'countries'].every(field => Array.isArray(row[field]) && row[field].length <= 12
        && row[field].every(value => catalogueText(value, 16))));
}
// End catalogue transport.

// Keep one native-host process alive for startup and chunked reads. Firefox's
// sendNativeMessage launches a fresh process per call; doing that for every
// 512 KiB database chunk made a normal hub load unnecessarily slow.
let nativePort = null;
let nativePortActiveRequest = null;
const nativePortRequestQueue = [];

function pumpNativePortQueue() {
  if (nativePortActiveRequest || !nativePortRequestQueue.length) return;
  while (nativePortRequestQueue.length && nativePortRequestQueue[0].expires <= Date.now()) {
    nativePortRequestQueue.shift().reject(new Error('Native request expired before it started. Retry the operation.'));
  }
  if (!nativePortRequestQueue.length) return;
  if (!nativePort) {
    try {
      const port = browser.runtime.connectNative('morpheus_webhub');
      nativePort = port;
      port.onMessage.addListener(response => {
        if (nativePort !== port) return;
        const active = nativePortActiveRequest;
        nativePortActiveRequest = null;
        if (active) {
          clearTimeout(active.timer);
          active.resolve(response);
        }
        pumpNativePortQueue();
      });
      port.onDisconnect.addListener(() => {
        if (nativePort !== port) return;
        const active = nativePortActiveRequest;
        nativePortActiveRequest = null;
        nativePort = null;
        nativeAvailable = false;
        storageInfoReady = false;
        const message = browser.runtime.lastError?.message || 'Native host disconnected';
        nativeError = message;
        if (active) {
          clearTimeout(active.timer);
          active.reject(new Error(message));
        }
        pumpNativePortQueue();
      });
    } catch (error) {
      const active = nativePortRequestQueue.shift();
      if (active) active.reject(error);
      nativePort = null;
      nativeAvailable = false;
      nativeError = error?.message || String(error);
      pumpNativePortQueue();
      return;
    }
  }

  nativePortActiveRequest = nativePortRequestQueue.shift();
  const activeRequest = nativePortActiveRequest;
  try {
    if (activeRequest.check && !activeRequest.check()) {
      nativePortActiveRequest = null;
      activeRequest.reject(new Error('The page session changed before this request started.'));
      pumpNativePortQueue(); return;
    }
    nativePort.postMessage(activeRequest.message);
    if (nativePortActiveRequest !== activeRequest) return;
    const requestTimeoutMs = Number.isFinite(activeRequest.timeoutMs) && activeRequest.timeoutMs > 0
      ? activeRequest.timeoutMs
      : NATIVE_REQUEST_TIMEOUT_MS;
    activeRequest.timer = setTimeout(() => {
      const active = nativePortActiveRequest;
      const timedOutPort = nativePort;
      nativePortActiveRequest = null;
      nativePort = null;
      nativeAvailable = false;
      storageInfoReady = false;
      nativeError = `Native host request timed out after ${requestTimeoutMs / 1000} seconds`;
      if (active) active.reject(new Error(nativeError));
      try { timedOutPort?.disconnect(); } catch {}
      pumpNativePortQueue();
    }, requestTimeoutMs);
  } catch (error) {
    const active = nativePortActiveRequest;
    nativePortActiveRequest = null;
    nativePort = null;
    clearTimeout(active?.timer);
    nativeAvailable = false;
    storageInfoReady = false;
    nativeError = error?.message || String(error);
    active.reject(error);
    pumpNativePortQueue();
  }
}

function sendPersistentNativeMessage(message, timeoutMs = NATIVE_REQUEST_TIMEOUT_MS, check = null) {
  if (check && !check()) return Promise.reject(new Error('The page session changed.'));
  if (typeof browser.runtime.connectNative !== 'function') {
    return sendNativeRequest(message);
  }
  return new Promise((resolve, reject) => {
    const bytes = JSON.stringify(message).length;
    if (nativePortRequestQueue.length >= 128 || nativePortRequestQueue.reduce((sum, item) => sum + (item.bytes || 0), bytes) > 32 * 1024 * 1024) {
      reject(new Error('Native requests are busy. Retry shortly.')); return;
    }
    nativePortRequestQueue.push({ message, resolve, reject, timeoutMs, bytes, check, expires:Date.now() + Math.max(15000, Math.min(timeoutMs, 305000)) });
    pumpNativePortQueue();
  });
}

function sendNativeRequest(message, timeoutMs = NATIVE_REQUEST_TIMEOUT_MS) {
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : NATIVE_REQUEST_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      nativeAvailable = false;
      storageInfoReady = false;
      nativeError = `Native host request timed out after ${safeTimeoutMs / 1000} seconds`;
      reject(new Error(nativeError));
    }, safeTimeoutMs);
    Promise.resolve(browser.runtime.sendNativeMessage('morpheus_webhub', message))
      .then(response => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}


// ---------------------------------------------------------------------------
// Native host probe and configuration refresh
// ---------------------------------------------------------------------------

let nativeRefreshPromise = null;
let lastNativeRefreshAt = 0;

// The selection is durable; native connectivity never selects a different store.
// Adapters execute fixed-purpose operations and cannot fall back to one another.
const portalSnapshotAuthority = (() => {
  let authority = null;
  let generation = 0;
  let serial = Promise.resolve();
  let pendingOperations = 0;
  let selectionError = '';
  const ready = browser.storage.local.get(PORTAL_AUTHORITY_KEY).then(stored => {
    const marker = stored?.[PORTAL_AUTHORITY_KEY];
    if (marker && marker.schemaVersion === 1 && ['host', 'relay'].includes(marker.authority)
        && Object.keys(marker).length === 2) authority = marker.authority;
    else if (marker != null) selectionError = 'The saved Portal storage choice is invalid. Choose storage in Cyrune Relay.';
  }).catch(() => {
    selectionError = 'The Portal storage choice could not be read. Choose storage in Cyrune Relay.';
  });
  function sequence(task) {
    if (pendingOperations >= 128) return Promise.reject(new Error('Portal storage is busy. Retry shortly.'));
    pendingOperations++;
    const next = serial.then(task, task).finally(() => { pendingOperations--; });
    serial = next.catch(() => {});
    return next;
  }
  async function select(mode) {
    const marker = { schemaVersion: 1, authority: mode };
    await browser.storage.local.set({ [PORTAL_AUTHORITY_KEY]: marker });
    const verified = (await browser.storage.local.get(PORTAL_AUTHORITY_KEY))?.[PORTAL_AUTHORITY_KEY];
    if (verified?.schemaVersion !== 1 || verified.authority !== mode || Object.keys(verified).length !== 2) {
      throw new Error('The Portal storage choice could not be verified. Retry in Cyrune Relay.');
    }
    authority = mode;
    selectionError = '';
    generation++;
  }
  function status() {
    return {
      storageMode: authority || 'unselected',
      authoritySelectionRequired: authority === null && storageInfoReady,
      authoritativeStorageAvailable: authority === 'relay'
        || authority === 'host' && nativeAvailable && !!saveFilePath,
      databasePath: authority === 'host' ? saveFilePath || null : null,
      storageError: selectionError || (authority === 'host' && (!nativeAvailable || !saveFilePath)
        ? 'Portal uses Host storage. Reconnect Cyrune Host to use the configured database.'
        : authority === null ? 'Choose Portal storage in the Cyrune Relay popup.' : '')
    };
  }
  function requireAvailable(mode = authority) {
    if (!mode || mode === 'host' && (!nativeAvailable || !saveFilePath)) {
      throw new Error(status().storageError || 'Portal storage is unavailable.');
    }
  }
  const adapters = {
    host: {
      async read() {
        try {
          const loaded = await readNativeFileChunked(saveFilePath);
          return { json: loaded.content || null, fileInfo: loaded.fileInfo || null,
            fromDisk: true, databasePath: saveFilePath, storageMode: 'host' };
        } catch (error) {
          throw new Error(`Shared database read failed: ${error.message || error}`);
        }
      },
      async info() {
        const response = await sendNativeRequest({ type: 'PORTAL_DATABASE_STAT', includeHash: false });
        if (response?.ok === false) throw new Error(response.error || 'Shared database information is unavailable');
        return { databasePath: saveFilePath, fileInfo: response?.fileInfo || null };
      },
      write(content, baseline) {
        return scheduleNativeSave(content, baseline.expectedVersion, baseline.expectedHash, saveFilePath);
      },
      chunk: (...args) => readNativeSharedStateChunk(...args)
    },
    relay: {
      async read() {
        const snapshot = await readRelaySnapshotEnvelope();
        return { json: snapshot?.content || null, fileInfo: relaySnapshotFileInfo(snapshot),
          fromDisk: false, databasePath: null, storageMode: 'relay' };
      },
      async info() {
        return { databasePath: null, fileInfo: relaySnapshotFileInfo(await readRelaySnapshotEnvelope()) };
      },
      write(content, baseline) {
        return scheduleRelaySnapshotSave(content, baseline.expectedVersion, baseline.expectedHash);
      }
    }
  };
  async function operate(operation, ...args) {
    await ready;
    await ensureNativeStorageReady();
    const mode = authority;
    const selectedGeneration = generation;
    return sequence(async () => {
      if (generation !== selectedGeneration || authority !== mode) {
        throw new Error('Portal storage changed before the operation started. Reload Portal before retrying.');
      }
      requireAvailable(mode);
      if (!adapters[mode][operation]) throw new Error('This operation requires configured Host storage.');
      return adapters[mode][operation](...args);
    });
  }
  return {
    status,
    async discover() {
      await ready;
      return sequence(async () => {
        // An existing explicit choice wins over later Host availability.
        if (authority === null && !selectionError) await select(saveFilePath ? 'host' : 'relay');
      });
    },
    async chooseRelay() {
      await ensureNativeStorageReady();
      await ready;
      return sequence(async () => {
        if (authority !== null) throw new Error('Portal storage is already selected. Use Portal storage settings to change it.');
        await select('relay');
      });
    },
    async configure(path) {
      await ready;
      await ensureNativeStorageReady();
      return sequence(async () => {
        if (!nativeAvailable) throw new Error('Reconnect Cyrune Host before changing the database location.');
        const response = await sendNativeRequest({ type: 'PORTAL_SET_DATABASE_PATH', databasePath: path || '' });
        if (response?.ok !== true) throw new Error(response?.error || 'The database location could not be updated.');
        // If the marker write fails after the native commit, block operations
        // until the selection can be recovered instead of using the old store.
        saveFilePath = path;
        authority = null;
        generation++;
        selectionError = 'The storage choice changed but could not be confirmed. Retry the storage setting.';
        await select(path ? 'host' : 'relay');
        return true;
      });
    },
    read: () => operate('read'),
    info: () => operate('info'),
    chunk: (...args) => operate('chunk', ...args),
    write: (content, baseline) => operate('write', content, baseline)
  };
})();

function refreshNativeStorage() {
  if (nativeRefreshPromise) return nativeRefreshPromise;
  lastNativeRefreshAt = Date.now();
  storageInfoReady = false;
  nativeRefreshPromise = (async () => {
    try {
      const ping = await sendPersistentNativeMessage({ type: 'PING' });
      nativeAvailable = ping?.ok === true;
      if (!nativeAvailable) throw new Error('Native host did not return ok');
      validateHostProtocols(ping.protocols);
      const config = await sendPersistentNativeMessage({ type: 'PORTAL_GET_STORAGE_CONFIG' });
      if (config?.ok !== true || !config.config || typeof config.config !== 'object' || Array.isArray(config.config)
          || !Object.hasOwn(config.config, 'databasePath')
          || config.config.databasePath != null && typeof config.config.databasePath !== 'string') {
        throw new Error('Host storage configuration is unavailable.');
      }
      saveFilePath = normalizeDatabasePath(config?.config?.databasePath || '');
      await portalSnapshotAuthority.discover();
      nativeError = '';
    } catch (error) {
      nativeAvailable = false;
      nativeError = error?.message || String(error);
    } finally {
      storageInfoReady = true;
    }
  })().finally(() => {
    nativeRefreshPromise = null;
  });
  return nativeRefreshPromise;
}

const nativeProbePromise = refreshNativeStorage();
const hostConfigPromise = nativeProbePromise;

async function ensureNativeStorageReady() {
  await hostConfigPromise;
  if (!nativeAvailable && Date.now() - lastNativeRefreshAt >= NATIVE_RETRY_COOLDOWN_MS) {
    await refreshNativeStorage();
  }
}


// ---------------------------------------------------------------------------
// File path helpers
// ---------------------------------------------------------------------------

function deriveThemesDir() {
  if (!saveFilePath) return null;
  const sep = saveFilePath.includes('\\') ? '\\' : '/';
  return saveFilePath.replace(/[/\\][^/\\]*$/, '') + sep + 'themes';
}

function joinThemePath(filename) {
  const dir = deriveThemesDir();
  if (!dir) return null;
  if (!/^[a-z0-9][a-z0-9_-]{0,79}\.json$/i.test(String(filename || ''))) return null;
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir + sep + filename;
}

function isPotentialHubUrl(url = '') {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:'
      || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname));
  } catch {
    return false;
  }
}

async function refreshFileSchemeAccess() {
  try {
    const info = typeof browser.runtime.getBrowserInfo === 'function'
      ? await browser.runtime.getBrowserInfo()
      : null;
    const majorVersion = Number.parseInt(info?.version || '', 10);
    fileSchemeAccessRequired = Number.isFinite(majorVersion) && majorVersion >= 153;
    if (!fileSchemeAccessRequired || typeof browser.extension?.isAllowedFileSchemeAccess !== 'function') {
      fileSchemeAccess = true;
      return true;
    }
    fileSchemeAccess = await browser.extension.isAllowedFileSchemeAccess();
    return fileSchemeAccess;
  } catch {
    // Firefox 142–152 exposed the API but always returned false even though
    // matching file pages were allowed. Only enforce it when 153+ is known.
    fileSchemeAccess = fileSchemeAccessRequired ? false : true;
    return fileSchemeAccess;
  }
}

function createHubSessionToken() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeClientProtocols(value) {
  const allowed = new Set(['portal-relay', 'arcade-relay', 'arcade-service', 'nexus-relay', 'component-settings', 'arcade-catalogue', 'arcade-scummvm', 'arcade-atari-st', 'arcade-gameboy']);
  const output = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  for (const [name, version] of Object.entries(value)) {
    if (allowed.has(name) && Number.isInteger(version) && version > 0 && version <= 100) output[name] = version;
  }
  return output;
}

function validateClientProtocols(role, value) {
  const protocols = sanitizeClientProtocols(value);
  const requiredProtocols = REQUIRED_CLIENT_PROTOCOLS[role] || {};
  const incompatible = Object.entries(requiredProtocols)
    .filter(([name, minimumVersion]) => (protocols[name] || 0) < minimumVersion)
    .map(([name, minimumVersion]) => `${name} v${minimumVersion}+`);
  if (!incompatible.length) return { ok: true, protocols };
  const label = role === 'portal' ? 'Portal' : role === 'arcade' ? 'Arcade' : 'Nexus';
  return {
    ok: false,
    errorCode: 'INCOMPATIBLE_PROTOCOL',
    error: `Cyrune ${label} is incompatible with this Relay build. Required: ${incompatible.join(', ')}. Reload both components from the same Cyrune checkout.`,
    requiredProtocols,
    protocols: RELAY_PROTOCOLS
  };
}

function validateHostProtocols(value) {
  const version = Number(value?.['host-native'] || 0);
  if (version >= RELAY_PROTOCOLS['host-native']) return true;
  throw new Error(`Cyrune Host is incompatible with this Relay build (host-native v${RELAY_PROTOCOLS['host-native']}+ is required)`);
}

function selectRegisteredHub() {
  const candidates = [...hubRegistrations.entries()]
    .sort((left, right) => {
      const activeDifference = Number(right[1].active === true) - Number(left[1].active === true);
      if (activeDifference) return activeDifference;
      return (right[1].lastActiveAt || right[1].registeredAt) - (left[1].lastActiveAt || left[1].registeredAt);
    });
  const selected = candidates[0] || null;
  morpheusTabId = selected?.[0] ?? null;
  hubPageUrl = selected?.[1]?.url || '';
  hubRegisteredAt = selected?.[1]?.registeredAt || 0;
  return selected;
}

function rememberMorpheusTab(tab, pageUrl = '', options = {}) {
  if (tab?.id === undefined) return false;
  const url = pageUrl || tab.url || '';
  if (!isPotentialHubUrl(url)) return false;
  const existing = hubRegistrations.get(tab.id);
  const now = Date.now();
  const active = options.active === true || tab.active === true;
  const registration = {
    url,
    active,
    registeredAt: now,
    lastActiveAt: active ? now : (existing?.lastActiveAt || 0),
    sessionToken: options.sessionToken || existing?.sessionToken || createHubSessionToken(),
    protocols: Object.keys(options.protocols || {}).length ? sanitizeClientProtocols(options.protocols) : (existing?.protocols || {})
  };
  hubRegistrations.set(tab.id, registration);
  void browser.storage.local.set({ [LAST_HUB_URL_KEY]: url }).catch(() => {});
  selectRegisteredHub();
  hubRelayError = '';
  if (options.drainIntake !== false) {
    setTimeout(() => { void drainDurableIntake().catch(() => {}); }, 0);
  }
  return registration;
}

function forgetMorpheusTab(tabId = morpheusTabId, error = '') {
  closeCatalogueSession(tabId);
  hubRegistrations.delete(tabId);
  selectRegisteredHub();
  hubRelayError = error || '';
}

function authorizeHubPageRequest(msg, sender) {
  const tabId = sender?.tab?.id;
  const registration = tabId === undefined ? null : hubRegistrations.get(tabId);
  const pageUrl = msg?.pageUrl || sender?.tab?.url || '';
  return !!registration
    && msg?.morpheusPage === true
    && msg?.hubSessionToken === registration.sessionToken
    && pageUrl === registration.url
    && (!sender.tab.url || sender.tab.url === registration.url);
}

async function registerEmuGuiPage(sender, pageUrl, protocols = {}) {
  const tabId = sender?.tab?.id;
  const url = String(pageUrl || sender?.tab?.url || '');
  if (tabId === undefined || !url || (sender.tab.url && sender.tab.url !== url)) {
    return { ok: false, error: 'Cyrune Arcade registration came from an unsupported page' };
  }
  const protocolCheck = validateClientProtocols('arcade', protocols);
  if (!protocolCheck.ok) return protocolCheck;
  let parsed;
  try { parsed = new URL(url); } catch { return { ok: false, error: 'Cyrune Arcade page address is invalid' }; }
  if (parsed.protocol !== 'file:') return { ok: false, error: 'Cyrune Arcade must be opened from its configured local file page' };
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Cyrune Host is required to authorize the Arcade file page' };
  const result = await sendPersistentNativeMessage({ type: 'EMUGUI_AUTHORIZE_PAGE', pageUrl: url }, EMUGUI_REQUEST_TIMEOUT_MS);
  const authorized = result?.ok === true && result.authorized === true;
  if (!authorized) return { ok: false, error: 'This is not the configured Cyrune Arcade page' };
  const transport = 'extension';
  const registration = { url, sessionToken: createHubSessionToken(), registeredAt: Date.now(), transport,
    protocols: protocolCheck.protocols };
  emuguiRegistrations.set(tabId, registration);
  return {
    ok: true,
    arcadeSessionToken: registration.sessionToken,
    emuguiSessionToken: registration.sessionToken,
    transport,
    relayVersion: browser.runtime.getManifest?.()?.version || '',
    protocols: RELAY_PROTOCOLS,
    capabilities: RELAY_COMPONENT_CAPABILITIES
  };
}

function authorizeEmuGuiPageRequest(msg, sender) {
  const tabId = sender?.tab?.id;
  const registration = tabId === undefined ? null : emuguiRegistrations.get(tabId);
  return !!registration
    && msg?.emuguiSessionToken === registration.sessionToken
    && msg?.pageUrl === registration.url
    && (!sender.tab.url || sender.tab.url === registration.url);
}

async function registerNexusPage(sender, pageUrl, protocols = {}) {
  const tabId = sender?.tab?.id;
  const url = canonicalNexusDocumentUrl(pageUrl || sender?.tab?.url || '');
  const senderUrl = canonicalNexusDocumentUrl(sender?.tab?.url || '');
  if (tabId === undefined || !url || !senderUrl || senderUrl !== url) {
    return { ok: false, error: 'Cyrune Nexus registration came from an unsupported page' };
  }
  const protocolCheck = validateClientProtocols('nexus', protocols);
  if (!protocolCheck.ok) return protocolCheck;
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Cyrune Host is required to authorize the Nexus file page' };
  const result = await sendPersistentNativeMessage({ type: 'NEXUS_AUTHORIZE_PAGE', pageUrl: url });
  if (result?.ok !== true || result.authorized !== true) {
    return { ok: false, error: 'This is not the configured Cyrune Nexus page' };
  }
  const registration = { url, sessionToken: createHubSessionToken(), registeredAt: Date.now(),
    protocols: protocolCheck.protocols };
  nexusRegistrations.set(tabId, registration);
  return {
    ok: true,
    nexusSessionToken: registration.sessionToken,
    relayVersion: browser.runtime.getManifest?.()?.version || '',
    nativeAvailable: true,
    protocols: RELAY_PROTOCOLS,
    capabilities: RELAY_COMPONENT_CAPABILITIES
  };
}

function canonicalNexusDocumentUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'file:' || parsed.search) return '';
    parsed.hash = '';
    return parsed.href;
  } catch {
    return '';
  }
}

function authorizeNexusPageRequest(msg, sender) {
  const tabId = sender?.tab?.id;
  const registration = tabId === undefined ? null : nexusRegistrations.get(tabId);
  const messageUrl = canonicalNexusDocumentUrl(msg?.pageUrl || '');
  const senderUrl = canonicalNexusDocumentUrl(sender?.tab?.url || '');
  return !!registration
    && msg?.nexusSessionToken === registration.sessionToken
    && messageUrl === registration.url
    && senderUrl === registration.url;
}

async function nexusNativeRequest(message) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Cyrune Host is not available' };
  return sendPersistentNativeMessage(message);
}

async function getNexusStatus() {
  const response = await nexusNativeRequest({ type: 'NEXUS_GET_STATUS' });
  if (response?.ok !== true || !response.snapshot) return response || { ok: false, error: 'Nexus status is unavailable' };
  const snapshot = response.snapshot;
  snapshot.services = snapshot.services && typeof snapshot.services === 'object' ? snapshot.services : {};
  snapshot.services.relay = {
    available: true,
    version: browser.runtime.getManifest?.()?.version || '',
    fileSchemeAccess,
    fileSchemeAccessRequired,
    nexusRole: true,
    nativeAvailable,
    protocols: RELAY_PROTOCOLS,
    capabilities: RELAY_COMPONENT_CAPABILITIES
  };
  snapshot.services.clients = {
    portal: { available: hubRegistrations.size > 0, protocols: selectRegisteredHub()?.[1]?.protocols || {} },
    arcade: { available: emuguiRegistrations.size > 0, protocols: [...emuguiRegistrations.values()][0]?.protocols || {} },
    nexus: { available: nexusRegistrations.size > 0, protocols: [...nexusRegistrations.values()][0]?.protocols || {} }
  };
  return { ok: true, snapshot };
}

// Portal theme projection: bounded presentation cache, never a Portal database.
const PORTAL_THEME_KEY = 'cyrunePortalThemeV1';
let portalThemeQueue = Promise.resolve();
function validatePortalTheme(value) {
  if (!value || value.schemaVersion !== 1 || !['dark', 'light'].includes(value.colorScheme)
      || Object.keys(value).some(key => !['schemaVersion', 'colorScheme', 'variables'].includes(key))) throw new Error('Invalid Portal theme');
  const variables = value.variables;
  if (!variables || Array.isArray(variables) || Object.keys(variables).length !== 38) throw new Error('Invalid Portal theme tokens');
  const color = /^(?:#[\da-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d{1,4}))?\s*\))$/i;
  const rules = {
    '--radius': /^(?:\d|[1-4]\d|50)(?:\.\d{1,2})?px$/,
    '--shadow': /^(?:none|(?:0|\d{1,3}px) (?:0|\d{1,3}px) (?:0|\d{1,3}px)(?: (?:0|\d{1,3}px))? rgba?\([\d.,\s]+\))$/,
    '--base-font-size': /^(?:[89]|[1-4]\d|50)px$/,
    '--panel-alpha': /^(?:0\.[1-9]\d{0,3}|1)$/
  };
  for (const key of ['bg','panel','panel-2','panel-muted','line','text','muted','accent','accent-strong','danger']) rules[`--${key}`] = color;
  for (const prefix of ['hub-name','bookmark','board','title']) {
    rules[`--${prefix}-color`] = color;
    rules[`--${prefix}-font-size`] = /^(?:[89]|[1-7]\d|80)px$/;
    rules[`--${prefix}-font-family`] = /^[a-z\d\s,'"-]{1,160}$/i;
    rules[`--${prefix}-font-weight`] = /^(?:normal|bold|600)$/;
    rules[`--${prefix}-font-style`] = /^(?:normal|italic)$/;
    rules[`--${prefix}-text-decoration`] = /^(?:none|underline)$/;
  }
  const clean = {};
  for (const [key, rule] of Object.entries(rules)) {
    const token = variables[key];
    if (typeof token !== 'string' || token.length > 160 || !rule.test(token)) throw new Error('Invalid Portal theme token');
    clean[key] = token;
  }
  return { schemaVersion: 1, colorScheme: value.colorScheme, variables: clean };
}
async function readPortalTheme() {
  const stored = (await browser.storage.local.get(PORTAL_THEME_KEY))[PORTAL_THEME_KEY];
  if (!stored) return null;
  try { return validatePortalTheme(stored); } catch { return null; }
}
function publishPortalTheme(theme) {
  const clean = validatePortalTheme(theme);
  const pending = portalThemeQueue.then(async () => {
    if (JSON.stringify(await readPortalTheme()) === JSON.stringify(clean)) return { ok: true };
    await browser.storage.local.set({ [PORTAL_THEME_KEY]: clean });
    await Promise.all([...emuguiRegistrations.keys()].map(tabId =>
      browser.tabs.sendMessage(tabId, { type: 'MW_PORTAL_THEME_CHANGED' }).catch(() => null)));
    return { ok: true };
  });
  portalThemeQueue = pending.catch(() => {});
  return pending;
}
// End Portal theme projection.

async function broadcastNexusSettingsChanged(revision) {
  await Promise.all([
    ...[...nexusRegistrations.keys()].map(tabId =>
      browser.tabs.sendMessage(tabId, { type: 'MW_NEXUS_SETTINGS_CHANGED', revision }).catch(() => null)
    ),
    ...[...hubRegistrations.keys()].map(tabId =>
      browser.tabs.sendMessage(tabId, { type: 'MW_CYRUNE_SETTINGS_CHANGED', revision }).catch(() => null)
    ),
    ...[...emuguiRegistrations.keys()].map(tabId =>
      browser.tabs.sendMessage(tabId, { type: 'MW_CYRUNE_SETTINGS_CHANGED', revision }).catch(() => null)
    )
  ]);
}

async function broadcastPortalStateChanged(fileInfo, sourceTabId = null) {
  await Promise.all([...hubRegistrations.keys()]
    .filter(tabId => tabId !== sourceTabId)
    .map(tabId => browser.tabs.sendMessage(tabId, {
      type: 'MW_PORTAL_STATE_CHANGED',
      revision: Number(fileInfo?.revision || 0),
      version: fileInfo?.version || null,
      contentHash: fileInfo?.contentHash || '',
      authority: fileInfo?.authority || (nativeAvailable && saveFilePath ? 'host' : 'relay')
    }).catch(() => null)));
}

async function discoverMorpheusTab(tab, { inject = false } = {}) {
  if (tab?.id === undefined || !isPotentialHubUrl(tab.url || '')) return false;
  const discover = async () => {
    try {
      const response = await browser.tabs.sendMessage(tab.id, { type: 'MW_DISCOVER' });
      const current = hubRegistrations.get(tab.id);
      if (response?.isMorpheus === true && response?.registered !== false
          && current?.url === response.pageUrl && current?.sessionToken === response.hubSessionToken) {
        rememberMorpheusTab(tab, response.pageUrl || tab.url || '', {
          active: tab.active === true,
          sessionToken: response.hubSessionToken || ''
        });
        return true;
      }
      if (response?.isMorpheus === true && response?.error) hubRelayError = response.error;
    } catch (error) {
      hubRelayError = error?.message || String(error);
    }
    return false;
  };

  if (await discover()) return true;
  if (!inject) return false;
  try {
    await browser.tabs.executeScript(tab.id, { runAt: 'document_idle', file: '/content.js' });
  } catch (error) {
    hubRelayError = error?.message || String(error);
    return false;
  }
  return discover();
}

async function ensureMorpheusTab() {
  await refreshFileSchemeAccess();
  if (fileSchemeAccess === false && hubPageUrl.startsWith('file:')) {
    forgetMorpheusTab(morpheusTabId, 'Firefox local-file access is disabled for this extension');
  }
  if (morpheusTabId !== null) {
    if (Date.now() - hubRegisteredAt < 5000) {
      return { id: morpheusTabId, url: hubPageUrl };
    }
    try {
      const tab = await browser.tabs.get(morpheusTabId);
      if (await discoverMorpheusTab(tab)) return tab;
    } catch (error) {
      hubRelayError = error?.message || String(error);
    }
    forgetMorpheusTab(morpheusTabId, hubRelayError || 'The registered Portal relay is no longer available');
  }

  const tabs = await browser.tabs.query({});
  const candidates = (tabs || [])
    .filter(tab => isPotentialHubUrl(tab.url || ''))
    .sort((left, right) => Number(right.active === true) - Number(left.active === true));
  for (const tab of candidates) {
    if (tab.url?.startsWith('file:') && fileSchemeAccess === false) {
      hubRelayError = 'Firefox 153+ requires “Access local files on your computer” to be enabled for Cyrune Relay';
      continue;
    }
    if (await discoverMorpheusTab(tab, { inject: true })) return tab;
  }
  return null;
}

function assetExtensionFromUrl(url, fallback = 'webp') {
  try {
    const parsed = new URL(url);
    const candidates = [
      parsed.pathname || '',
      decodeURIComponent(parsed.search || '')
    ];
    for (const candidate of candidates) {
      const match = candidate.match(/\.([a-z0-9]{2,5})(?:$|[?#&=/%])/i);
      const ext = (match?.[1] || '').toLowerCase();
      if (IMAGE_ASSET_EXTENSIONS.has(ext)) return ext === 'jpeg' ? 'jpg' : ext;
    }
  } catch {}
  return fallback;
}

function normalizeDatabasePath(path) {
  const trimmed = typeof path === 'string' ? path.trim() : '';
  return trimmed || null;
}

function getStorageInfo() {
  return {
    component: 'relay',
    componentVersion: browser.runtime.getManifest?.()?.version || '',
    protocols: RELAY_PROTOCOLS,
    componentCapabilities: RELAY_COMPONENT_CAPABILITIES,
    nativeAvailable,
    ...portalSnapshotAuthority.status(),
    storageInfoReady,
    nativeError: nativeAvailable ? '' : nativeError,
    hubRelayError,
    fileSchemeAccess,
    fileSchemeAccessRequired,
    extensionId: browser.runtime.id || '',
    capabilities: ['productivityService', 'portalAuthority', 'durableIntake', 'urlHealth', 'serviceMonitor', 'systemMetrics', 'approvedDirectories', 'gitWorkspace', 'recentFiles', 'applicationLauncher', 'emuguiService', 'commandPalette', 'browserSessions', 'backupTimeline', 'portableBundles', 'translationModels', 'notificationScheduler', 'cyruneSettings', 'portalTheme']
  };
}

function notificationAlarmName(id) { return `${NOTIFICATION_ALARM_PREFIX}${id}`; }
function notificationId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function sanitizeNotificationSource(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    widgetType: String(source.widgetType || '').slice(0, 80),
    widgetId: String(source.widgetId || '').slice(0, 120),
    label: String(source.label || '').slice(0, 120)
  };
}
function sanitizeNotificationJob(value) {
  const id = String(value?.id || '').trim().replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 160);
  const when = Number(value?.when);
  if (!id || !Number.isFinite(when) || when > Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) throw new Error('Invalid notification schedule');
  const title = String(value?.title || 'Cyrune Portal').trim().slice(0, 100) || 'Cyrune Portal';
  const message = String(value?.message || '').trim().slice(0, 500);
  if (!message) throw new Error('A notification message is required');
  return {
    id, title, message, when: Math.max(Date.now(), when),
    expiresAt: Math.max(when, Number(value?.expiresAt) || when + 24 * 60 * 60 * 1000),
    createdAt: Number(value?.createdAt) || Date.now(),
    dedupeKey: String(value?.dedupeKey || id).slice(0, 180),
    source: sanitizeNotificationSource(value?.source)
  };
}
async function readNotificationStorage(key, fallback) {
  const stored = await browser.storage.local.get(key);
  return stored && Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : fallback;
}
function mutateNotifications(task) {
  const next = notificationMutation.then(task, task);
  notificationMutation = next.catch(() => {});
  return next;
}
function scheduleHubNotification(value) {
  return mutateNotifications(async () => {
    const job = sanitizeNotificationJob(value);
    const storedJobs = await readNotificationStorage(NOTIFICATION_JOBS_KEY, []);
    const jobs = Array.isArray(storedJobs) ? storedJobs : [];
    const nextJobs = [job, ...jobs.filter(item => item?.id !== job.id)].slice(0, MAX_NOTIFICATION_JOBS);
    await browser.storage.local.set({ [NOTIFICATION_JOBS_KEY]: nextJobs });
    await Promise.resolve(browser.alarms.clear(notificationAlarmName(job.id))).catch(() => {});
    browser.alarms.create(notificationAlarmName(job.id), { when: job.when });
    return { ok: true, job };
  });
}
function cancelHubNotification(id) {
  return mutateNotifications(async () => {
    const safeId = String(id || '').slice(0, 160);
    const jobs = await readNotificationStorage(NOTIFICATION_JOBS_KEY, []);
    await browser.storage.local.set({ [NOTIFICATION_JOBS_KEY]: (Array.isArray(jobs) ? jobs : []).filter(job => job?.id !== safeId) });
    await Promise.resolve(browser.alarms.clear(notificationAlarmName(safeId))).catch(() => {});
    return { ok: true };
  });
}
function fireHubNotification(jobValue) {
  return mutateNotifications(async () => {
    const job = sanitizeNotificationJob(jobValue);
    const now = Date.now();
    const jobs = await readNotificationStorage(NOTIFICATION_JOBS_KEY, []);
    await browser.storage.local.set({ [NOTIFICATION_JOBS_KEY]: (Array.isArray(jobs) ? jobs : []).filter(item => item?.id !== job.id) });
    if (job.expiresAt < now) return { ok: true, expired: true };
    const notificationIdValue = `morpheus:${job.id}:${job.when}`;
    const events = await readNotificationStorage(NOTIFICATION_EVENTS_KEY, []);
    const event = { id: notificationId(), jobId: job.id, notificationId: notificationIdValue, title: job.title, message: job.message, createdAt: now, read: false, dedupeKey: job.dedupeKey, source: job.source };
    const nextEvents = [event, ...(Array.isArray(events) ? events : []).filter(item => item?.dedupeKey !== event.dedupeKey)].slice(0, MAX_NOTIFICATION_EVENTS);
    await browser.storage.local.set({ [NOTIFICATION_EVENTS_KEY]: nextEvents });
    await browser.notifications.create(notificationIdValue, { type: 'basic', iconUrl: browser.runtime.getURL('icons/icon-96.svg'), title: job.title, message: job.message });
    void sendToMorpheus({ type: 'MW_NOTIFICATION_EVENT', event }).catch(() => {});
    return { ok: true, event };
  });
}
function listHubNotifications() {
  return mutateNotifications(async () => {
    const jobs = await readNotificationStorage(NOTIFICATION_JOBS_KEY, []);
    const events = await readNotificationStorage(NOTIFICATION_EVENTS_KEY, []);
    const pendingAction = await readNotificationStorage(NOTIFICATION_PENDING_ACTION_KEY, null);
    if (pendingAction) await browser.storage.local.remove(NOTIFICATION_PENDING_ACTION_KEY);
    return { ok: true, jobs: Array.isArray(jobs) ? jobs : [], events: Array.isArray(events) ? events : [], pendingAction };
  });
}
function markHubNotificationsRead(ids) {
  return mutateNotifications(async () => {
    const selected = new Set((Array.isArray(ids) ? ids : []).map(String));
    const events = await readNotificationStorage(NOTIFICATION_EVENTS_KEY, []);
    const next = (Array.isArray(events) ? events : []).map(event => !selected.size || selected.has(String(event?.id)) ? { ...event, read: true } : event);
    await browser.storage.local.set({ [NOTIFICATION_EVENTS_KEY]: next });
    return { ok: true, events: next };
  });
}
function clearHubNotifications() {
  return mutateNotifications(async () => { await browser.storage.local.set({ [NOTIFICATION_EVENTS_KEY]: [] }); return { ok: true }; });
}
async function rehydrateNotificationAlarms() {
  if (!browser.alarms?.create) return;
  const jobs = await readNotificationStorage(NOTIFICATION_JOBS_KEY, []);
  for (const rawJob of Array.isArray(jobs) ? jobs : []) {
    try {
      const job = sanitizeNotificationJob(rawJob);
      const now = Date.now();
      if (job.expiresAt < now) { await cancelHubNotification(job.id); continue; }
      if (job.when <= now) await fireHubNotification(job);
      else browser.alarms.create(notificationAlarmName(job.id), { when: job.when });
    } catch {}
  }
}

if (browser.alarms?.onAlarm) {
  browser.alarms.onAlarm.addListener(alarm => {
    if (!String(alarm?.name || '').startsWith(NOTIFICATION_ALARM_PREFIX)) return;
    const id = alarm.name.slice(NOTIFICATION_ALARM_PREFIX.length);
    void readNotificationStorage(NOTIFICATION_JOBS_KEY, []).then(jobs => {
      const job = (Array.isArray(jobs) ? jobs : []).find(item => item?.id === id);
      return job ? fireHubNotification(job) : null;
    }).catch(error => console.warn('Cyrune Relay: notification alarm failed', error));
  });
  void rehydrateNotificationAlarms().catch(error => console.warn('Cyrune Relay: notification rehydration failed', error));
}

if (browser.notifications?.onClicked) {
  browser.notifications.onClicked.addListener(clickedId => {
    void (async () => {
      const events = await readNotificationStorage(NOTIFICATION_EVENTS_KEY, []);
      const event = (Array.isArray(events) ? events : []).find(item => item?.notificationId === clickedId);
      if (!event) return;
      await markHubNotificationsRead([event.id]);
      const tab = await ensureMorpheusTab().catch(() => null);
      if (tab) {
        await browser.tabs.update(tab.id, { active: true }).catch(() => {});
        if (tab.windowId !== undefined && browser.windows?.update) await browser.windows.update(tab.windowId, { focused: true }).catch(() => {});
        await sendToMorpheus({ type: 'MW_OPEN_NOTIFICATION_TARGET', event }).catch(() => {});
        return;
      }
      await browser.storage.local.set({ [NOTIFICATION_PENDING_ACTION_KEY]: event });
      const lastUrl = await readNotificationStorage(LAST_HUB_URL_KEY, '');
      if (isPotentialHubUrl(lastUrl) && browser.tabs.create) await browser.tabs.create({ url: lastUrl, active: true });
    })().catch(error => console.warn('Cyrune Relay: notification click failed', error));
  });
}

function sanitizeSessionTab(tab, group = null) {
  if (!/^https?:\/\//i.test(String(tab?.url || ''))) return null;
  return {
    title: String(tab.title || tab.url || ''),
    url: String(tab.url),
    pinned: tab.pinned === true,
    active: tab.active === true,
    group: group ? { title: String(group.title || ''), color: String(group.color || '') } : null
  };
}

async function captureBrowserSession(scope = 'window') {
  let tabs = [];
  let skippedPrivate = 0;
  if (scope === 'recent') {
    const recentlyClosed = typeof browser.sessions?.getRecentlyClosed === 'function' ? await browser.sessions.getRecentlyClosed({ maxResults: 25 }) : [];
    for (const entry of recentlyClosed) {
      if (entry.tab) tabs.push(entry.tab);
      if (entry.window?.tabs) tabs.push(...entry.window.tabs);
    }
  } else {
    const query = { currentWindow: true };
    if (scope === 'active-tab' || scope === 'group') query.active = true;
    if (scope === 'highlighted') query.highlighted = true;
    tabs = await browser.tabs.query(query);
    if ((scope === 'active-tab' || scope === 'group') && (!tabs.length || tabs.every(tab => isPotentialHubUrl(tab.url || ''))) && lastActiveWebTab) {
      tabs = [lastActiveWebTab];
    }
    if (scope === 'group') {
      const groupId = tabs[0]?.groupId;
      tabs = Number.isInteger(groupId) && groupId >= 0 ? await browser.tabs.query({ windowId: tabs[0]?.windowId, groupId }) : tabs;
    }
  }
  const groupCache = new Map();
  const sanitized = [];
  for (const tab of tabs) {
    if (tab.incognito === true) { skippedPrivate++; continue; }
    let group = null;
    if (Number.isInteger(tab.groupId) && tab.groupId >= 0 && typeof browser.tabGroups?.get === 'function') {
      if (!groupCache.has(tab.groupId)) {
        try { groupCache.set(tab.groupId, await browser.tabGroups.get(tab.groupId)); } catch { groupCache.set(tab.groupId, null); }
      }
      group = groupCache.get(tab.groupId);
    }
    const record = sanitizeSessionTab(tab, group);
    if (record) sanitized.push(record);
  }
  return { ok: true, title: scope === 'recent' ? 'Recently Closed' : 'Firefox Session', createdAt: new Date().toISOString(), tabs: sanitized, skippedPrivate };
}

async function launchBrowserSession(tabs, options = {}) {
  const safeTabs = (Array.isArray(tabs) ? tabs : []).map(tab => sanitizeSessionTab(tab, tab.group)).filter(Boolean);
  const seen = new Set();
  const unique = safeTabs.filter(tab => { const key = tab.url.replace(/#.*$/, ''); if (seen.has(key)) return false; seen.add(key); return true; });
  const created = [];
  const failures = [];
  for (const tab of unique) {
    try {
      const opened = await browser.tabs.create({ url: tab.url, active: false, pinned: tab.pinned });
      created.push({ id: opened.id, group: tab.group });
    } catch (error) { failures.push({ url: tab.url, error: error?.message || String(error) }); }
    if (options.staggerMs) await new Promise(resolve => setTimeout(resolve, Math.min(1000, Number(options.staggerMs))));
  }
  let groupingSupported = typeof browser.tabs.group === 'function' && typeof browser.tabGroups?.update === 'function';
  if (options.recreateGroups !== false && groupingSupported) {
    const groups = new Map();
    for (const entry of created) if (entry.group?.title) {
      const key = `${entry.group.title}|${entry.group.color}`;
      if (!groups.has(key)) groups.set(key, { ...entry.group, tabIds: [] });
      groups.get(key).tabIds.push(entry.id);
    }
    for (const group of groups.values()) {
      try { const groupId = await browser.tabs.group({ tabIds: group.tabIds }); await browser.tabGroups.update(groupId, { title: group.title, color: group.color || undefined }); } catch { groupingSupported = false; }
    }
  }
  return { ok: true, opened: created.length, failed: failures.length, failures, groupingSupported };
}

async function listDatabaseBackups() {
  await ensureNativeStorageReady();
  if (!nativeAvailable || !saveFilePath) throw new Error('A native shared database must be configured');
  return sendNativeRequest({ type: 'PORTAL_LIST_DATABASE_BACKUPS' });
}

async function readDatabaseBackup(name) {
  await ensureNativeStorageReady();
  if (!nativeAvailable || !saveFilePath) throw new Error('A native shared database must be configured');
  let offset = 0; let readVersion = null; let metadata = null; const chunks = [];
  while (true) {
    const res = await sendNativeRequest({ type: 'PORTAL_READ_DATABASE_BACKUP_CHUNK', name, offset, length: PAGE_DATABASE_READ_CHUNK_BYTES, expectedVersion: readVersion });
    readVersion ||= res.readVersion;
    metadata ||= res;
    chunks.push(res.chunk || '');
    if (res.done) break;
    if (!res.nextOffset || res.nextOffset <= offset) throw new Error('Backup read stalled');
    offset = res.nextOffset;
  }
  const bytes = chunks.map(chunk => Uint8Array.from(atob(chunk), character => character.charCodeAt(0)));
  const total = bytes.reduce((sum, chunk) => sum + chunk.length, 0); const joined = new Uint8Array(total); let cursor = 0;
  for (const chunk of bytes) { joined.set(chunk, cursor); cursor += chunk.length; }
  return { ok: true, content: new TextDecoder().decode(joined), summary: metadata.summary, fileInfo: metadata.fileInfo };
}

async function createDatabaseBackup() {
  await ensureNativeStorageReady();
  if (!nativeAvailable || !saveFilePath) throw new Error('A native shared database must be configured');
  return sendNativeRequest({ type: 'PORTAL_CREATE_DATABASE_BACKUP' });
}

async function setDatabasePath(path) {
  return portalSnapshotAuthority.configure(normalizeDatabasePath(path));
}

function makeHubBookmarkId(prefix = 'bm') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeFaviconUrl(url) {
  return typeof url === 'string' ? url.trim() : '';
}

function tabToImportItem({ url, title, faviconCache = '' } = {}) {
  const normalizedUrl = typeof url === 'string' ? url.trim() : '';
  if (!normalizedUrl) return null;
  return {
    id: makeHubBookmarkId(),
    type: 'bookmark',
    title: title || normalizedUrl,
    url: normalizedUrl,
    tags: [],
    faviconCache: normalizeFaviconUrl(faviconCache)
  };
}

function bookmarkNodeToImportItem(node) {
  if (!node) return null;
  if (node.url) {
    return {
      id: makeHubBookmarkId(),
      type: 'bookmark',
      title: node.title || node.url,
      url: node.url,
      tags: [],
      faviconCache: ''
    };
  }
  const children = (node.children || [])
    .map(bookmarkNodeToImportItem)
    .filter(Boolean);
  return {
    id: makeHubBookmarkId('folder'),
    type: 'folder',
    title: node.title || 'Imported folder',
    collapsed: true,
    tags: [],
    sharedTags: [],
    children
  };
}

function makeDeliveryId(prefix = 'delivery') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function contentSha256(content) {
  const bytes = new TextEncoder().encode(String(content || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function relaySnapshotVersion(revision, contentHash) {
  return `relay:${Math.max(0, Number(revision) || 0)}:${String(contentHash || '')}`;
}

function relaySnapshotFileInfo(envelope) {
  if (!envelope) return { exists: false, authority: 'relay', version: null, contentHash: '', size: 0 };
  return {
    exists: true,
    authority: 'relay',
    version: relaySnapshotVersion(envelope.revision, envelope.contentHash),
    contentHash: envelope.contentHash,
    size: new TextEncoder().encode(envelope.content || '').byteLength,
    updatedAt: envelope.updatedAt || null,
    revision: envelope.revision
  };
}

function mutateRelaySnapshot(task) {
  const next = relaySnapshotMutation.then(task, task);
  relaySnapshotMutation = next.catch(() => {});
  return next;
}

let relaySnapshotUpgrade = null;

async function upgradeRelaySnapshotStorage() {
  const stored = await browser.storage.local.get([PORTAL_SNAPSHOT_KEY, 'morpheusState']);
  if (stored?.[PORTAL_SNAPSHOT_KEY] || typeof stored?.morpheusState !== 'string') return;
  const content = stored.morpheusState;
  const contentHash = await contentSha256(content);
  const migrated = { schemaVersion: 1, revision: 1, content, contentHash, updatedAt: new Date().toISOString() };
  await browser.storage.local.set({ [PORTAL_SNAPSHOT_KEY]: migrated });
  const verified = (await browser.storage.local.get(PORTAL_SNAPSHOT_KEY))?.[PORTAL_SNAPSHOT_KEY];
  if (!verified || verified.contentHash !== contentHash || await contentSha256(verified.content) !== contentHash) {
    throw new Error('Portal snapshot upgrade failed verification; its original is retained');
  }
  await browser.storage.local.set({ [PORTAL_SNAPSHOT_MIGRATION_RECEIPT_KEY]: {
    schemaVersion: 1, source: 'morpheusState', destination: PORTAL_SNAPSHOT_KEY,
    revision: 1, contentHash, completedAt: migrated.updatedAt
  } });
  await browser.storage.local.remove('morpheusState');
}

async function readRelaySnapshotEnvelope() {
  if (!relaySnapshotUpgrade) relaySnapshotUpgrade = upgradeRelaySnapshotStorage().catch(error => {
    relaySnapshotUpgrade = null;
    throw error;
  });
  await relaySnapshotUpgrade;
  const stored = await browser.storage.local.get(PORTAL_SNAPSHOT_KEY);
  const envelope = stored?.[PORTAL_SNAPSHOT_KEY];
  if (!envelope) return null;
  if (envelope.schemaVersion !== 1 || !Number.isInteger(envelope.revision) || envelope.revision < 0
      || typeof envelope.content !== 'string' || typeof envelope.contentHash !== 'string'
      || await contentSha256(envelope.content) !== envelope.contentHash) {
    throw new Error('Relay-owned Portal snapshot failed content verification');
  }
  return envelope;
}

function scheduleRelaySnapshotSave(content, expectedVersion = null, expectedHash = '') {
  return mutateRelaySnapshot(async () => {
    const current = await readRelaySnapshotEnvelope();
    const incomingHash = await contentSha256(content);
    const currentInfo = relaySnapshotFileInfo(current);
    const versionMatches = expectedVersion == null || expectedVersion === currentInfo.version;
    const hashMatches = !expectedHash || expectedHash === currentInfo.contentHash;
    if ((!versionMatches || !hashMatches) && currentInfo.contentHash !== incomingHash) {
      return { ok: false, conflict: true, fileInfo: currentInfo, databasePath: null, storageMode: 'relay' };
    }
    if (currentInfo.contentHash === incomingHash) {
      return { ok: true, conflict: false, fileInfo: currentInfo, databasePath: null, storageMode: 'relay', unchanged: true };
    }
    const saved = {
      schemaVersion: 1,
      revision: (current?.revision || 0) + 1,
      contentHash: incomingHash,
      content,
      updatedAt: new Date().toISOString()
    };
    await browser.storage.local.set({ [PORTAL_SNAPSHOT_KEY]: saved });
    const verified = await readRelaySnapshotEnvelope();
    if (!verified || verified.revision !== saved.revision || verified.contentHash !== incomingHash) {
      throw new Error('Relay-owned Portal snapshot verification failed');
    }
    return { ok: true, conflict: false, fileInfo: relaySnapshotFileInfo(verified), databasePath: null, storageMode: 'relay' };
  });
}

function sanitizeDurableDelivery(message) {
  const type = String(message?.type || '');
  if (!['MW_RECEIVE_TAB', 'MW_RECEIVE_IMPORT_ITEMS', 'MW_RECEIVE_GAME', 'MW_UPDATE_GAME_BINDING'].includes(type)) {
    throw new Error('Unsupported durable delivery type');
  }
  const deliveryId = String(message?.deliveryId || '').trim().slice(0, 160);
  if (!deliveryId) throw new Error('A durable delivery ID is required');
  const payload = { ...message, deliveryId };
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).byteLength > MAX_DURABLE_DELIVERY_BYTES) {
    throw new Error('Delivery exceeds the Relay intake limit');
  }
  return { deliveryId, type, payload, bytes: new TextEncoder().encode(serialized).byteLength };
}

async function readDurableIntake() {
  const stored = (await browser.storage.local.get(DURABLE_INTAKE_KEY))?.[DURABLE_INTAKE_KEY];
  if (!stored || stored.schemaVersion !== 1 || !Array.isArray(stored.items)) return [];
  return stored.items.filter(item => item && typeof item.deliveryId === 'string' && item.payload);
}

function mutateDurableIntake(task) {
  const next = durableIntakeMutation.then(task, task);
  durableIntakeMutation = next.catch(() => {});
  return next;
}

async function enqueueDurableDelivery(message) {
  const delivery = sanitizeDurableDelivery(message);
  return mutateDurableIntake(async () => {
    const items = await readDurableIntake();
    if (items.some(item => item.deliveryId === delivery.deliveryId)) {
      return { ok: true, queued: true, duplicate: true, deliveryId: delivery.deliveryId, pendingCount: items.length };
    }
    const record = { ...delivery, createdAt: new Date().toISOString(), attempts: 0 };
    const next = [...items, record];
    const totalBytes = next.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
    if (next.length > MAX_DURABLE_INTAKE_ITEMS || totalBytes > MAX_DURABLE_INTAKE_BYTES) {
      throw new Error('Relay durable intake is full; open Portal and retry');
    }
    await browser.storage.local.set({
      [DURABLE_INTAKE_KEY]: { schemaVersion: 1, items: next, updatedAt: new Date().toISOString() }
    });
    return { ok: true, queued: true, deliveryId: delivery.deliveryId, pendingCount: next.length };
  });
}

async function removeDurableDelivery(deliveryId) {
  return mutateDurableIntake(async () => {
    const items = await readDurableIntake();
    const next = items.filter(item => item.deliveryId !== deliveryId);
    await browser.storage.local.set({
      [DURABLE_INTAKE_KEY]: { schemaVersion: 1, items: next, updatedAt: new Date().toISOString() }
    });
    return next.length;
  });
}

async function deliverOrQueue(message) {
  try {
    const result = await sendToMorpheus(message);
    if (result?.ok === true) {
      await removeDurableDelivery(message.deliveryId);
      return { ...result, deliveryId: message.deliveryId };
    }
    if (result?.conflict === true) return result;
  } catch {}
  return enqueueDurableDelivery(message);
}

async function drainDurableIntake() {
  durableIntakeDrainRequested = true;
  if (durableIntakeDrain) return durableIntakeDrain;
  durableIntakeDrain = (async () => {
    let delivered = 0;
    let pendingCount = 0;
    do {
      // A fresh Portal registration can arrive while a send to its previous
      // document is still pending. Revisit the retained queue after that send
      // settles instead of losing the new registration's drain request.
      durableIntakeDrainRequested = false;
      const items = await readDurableIntake();
      for (const item of items) {
        try {
          const result = await sendToMorpheus(item.payload);
          if (result?.ok !== true) break;
          await removeDurableDelivery(item.deliveryId);
          delivered += 1;
        } catch {
          break;
        }
      }
      pendingCount = (await readDurableIntake()).length;
    } while (durableIntakeDrainRequested);
    return { delivered, pendingCount };
  })().finally(() => { durableIntakeDrain = null; });
  return durableIntakeDrain;
}

async function sendImportItemsToMorpheus(items, source = '', deliveryId = '') {
  return deliverOrQueue({
    type: 'MW_RECEIVE_IMPORT_ITEMS',
    items: items || [],
    source,
    deliveryId: deliveryId || makeDeliveryId('import')
  });
}

async function sendToMorpheus(message) {
  let tab = await ensureMorpheusTab();
  if (!tab) throw new Error(hubRelayError || 'Cyrune Portal is not open');
  try {
    return await browser.tabs.sendMessage(tab.id, message);
  } catch (error) {
    forgetMorpheusTab(tab.id, error?.message || String(error));
    tab = await ensureMorpheusTab();
    if (!tab) throw new Error(hubRelayError || 'Cyrune Portal relay is unavailable');
    return browser.tabs.sendMessage(tab.id, message);
  }
}

async function importBookmarkNode(bookmarkId) {
  if (!bookmarkId) throw new Error('No bookmark was selected');
  const roots = await browser.bookmarks.getSubTree(bookmarkId);
  const items = roots.map(bookmarkNodeToImportItem).filter(Boolean);
  if (!items.length) throw new Error('No bookmarks found');
  const result = await sendImportItemsToMorpheus(items, 'bookmarks-menu');
  if (!result?.ok) throw new Error(result?.error || 'The hub rejected the bookmark import');
}

async function getDatabaseFileInfo() {
  return portalSnapshotAuthority.info();
}

function decodeBase64Chunk(chunk) {
  const binary = atob(chunk || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeChunkedText(chunks, totalSize) {
  const bytes = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder('utf-8').decode(bytes);
}

async function readNativeFileChunkedOnce(_path) {
  let offset = 0;
  let totalSize = 0;
  let fileInfo = null;
  let readVersion = null;
  const chunks = [];

  while (true) {
    const res = await sendPersistentNativeMessage({
      type: 'PORTAL_DATABASE_READ_CHUNK',
      offset,
      length: DATABASE_READ_CHUNK_BYTES,
      expectedVersion: readVersion
    });
    if (!res?.ok) throw new Error(res?.error || 'Native chunk read failed');
    fileInfo = res.fileInfo ? { ...(fileInfo || {}), ...res.fileInfo } : fileInfo;
    readVersion = readVersion || res.readVersion || res.fileInfo?.version || null;
    if (res.readVersion && readVersion !== res.readVersion) {
      throw new Error('Shared database changed during chunked read; retry required');
    }
    if (fileInfo && fileInfo.exists === false) {
      return { content: null, fileInfo };
    }
    const bytes = decodeBase64Chunk(res.chunk || '');
    chunks.push(bytes);
    totalSize = Number.isFinite(res.totalSize) ? res.totalSize : totalSize;
    offset = Number.isFinite(res.nextOffset) ? res.nextOffset : offset + bytes.length;
    if (res.done) break;
    if (!bytes.length) throw new Error('Native chunk read stalled');
  }

  const receivedSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (totalSize && receivedSize !== totalSize) {
    throw new Error(`Shared database chunk read was incomplete (${receivedSize} of ${totalSize} bytes)`);
  }

  return {
    content: decodeChunkedText(chunks, totalSize || receivedSize),
    fileInfo
  };
}

async function readNativeFileChunked(path) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await readNativeFileChunkedOnce(path);
    } catch (error) {
      lastError = error;
      if (!/changed during chunked read/i.test(error?.message || '')) throw error;
    }
  }
  throw lastError || new Error('Shared database could not be read consistently');
}

async function loadSharedStateChunk(offset = 0, length = PAGE_DATABASE_READ_CHUNK_BYTES, expectedVersion = null) {
  return portalSnapshotAuthority.chunk(offset, length, expectedVersion);
}

async function readNativeSharedStateChunk(offset, length, expectedVersion) {
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLength = Math.max(1, Math.min(PAGE_DATABASE_READ_CHUNK_BYTES, Number(length) || PAGE_DATABASE_READ_CHUNK_BYTES));
  const res = await sendPersistentNativeMessage({
    type: 'PORTAL_DATABASE_READ_CHUNK',
    offset: safeOffset,
    length: safeLength,
    expectedVersion: expectedVersion || null
  });
  if (!res?.ok) throw new Error(res?.error || 'Shared database chunk read failed');
  return {
    chunk: res.chunk || '',
    nextOffset: res.nextOffset ?? safeOffset,
    totalSize: res.totalSize ?? 0,
    done: res.done === true,
    readVersion: res.readVersion || res.fileInfo?.version || null,
    fileInfo: res.fileInfo || null,
    databasePath: saveFilePath
  };
}

async function beginAssetWrite(options = {}) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  const res = await sendNativeRequest({
    type: 'PORTAL_BEGIN_ASSET_WRITE',
    collectionName: options.collectionName || '',
    itemName: options.itemName || '',
    extension: options.extension || 'webp'
  });
  if (!res?.ok) return { ok: false, error: res?.error || 'Failed to begin asset write' };
  return {
    ok: true,
    sessionId: res.sessionId,
    publicPath: res.publicPath,
    relativePath: res.relativePath,
    chunkChars: Math.min(ASSET_WRITE_CHUNK_CHARS, Number(res.chunkChars) || ASSET_WRITE_CHUNK_CHARS)
  };
}

async function appendAssetWriteChunk(sessionId, chunk) {
  return sendNativeRequest({
    type: 'PORTAL_APPEND_ASSET_WRITE',
    sessionId,
    chunk: chunk || ''
  });
}

async function finishAssetWrite(sessionId) {
  const res = await sendNativeRequest({ type: 'PORTAL_FINISH_ASSET_WRITE', sessionId });
  return {
    ok: res?.ok !== false,
    error: res?.error || '',
    fileInfo: res?.fileInfo || null,
    publicPath: res?.publicPath || '',
    relativePath: res?.relativePath || ''
  };
}

async function abortAssetWrite(sessionId) {
  return sendNativeRequest({ type: 'PORTAL_ABORT_ASSET_WRITE', sessionId });
}

async function cacheAssetUrl(options = {}) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  const url = typeof options.url === 'string' ? options.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Only http and https URLs can be cached' };
  const res = await sendNativeRequest({
    type: 'PORTAL_CACHE_ASSET_URL',
    url,
    collectionName: options.collectionName || '',
    itemName: options.itemName || '',
    extension: options.extension || assetExtensionFromUrl(url),
    maxBytes: options.maxBytes || MAX_BACKGROUND_ASSET_DOWNLOAD_BYTES
  });
  if (!res?.ok) return { ok: false, error: res?.error || 'Failed to cache URL asset' };
  return {
    ok: true,
    publicPath: res.publicPath || '',
    relativePath: res.relativePath || '',
    fileInfo: res.fileInfo || null,
    contentType: res.contentType || '',
    bytes: res.bytes || 0
  };
}

async function fetchFavicon(options = {}) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  const url = typeof options.url === 'string' ? options.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Only http and https URLs support native favicon fetch' };
  return sendNativeRequest({
    type: 'FETCH_FAVICON',
    url,
    maxBytes: options.maxBytes || MAX_NATIVE_FAVICON_BYTES
  });
}

async function fetchFeedText(options = {}) {
  const url = typeof options.url === 'string' ? options.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Only http and https feed URLs are supported' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, */*;q=0.2'
      }
    });
    if (!response.ok) return { ok: false, error: `Feed returned ${response.status}` };
    const declaredLength = Number(response.headers?.get?.('content-length') || 0);
    if (declaredLength > MAX_FEED_RESPONSE_BYTES) return { ok: false, error: 'Feed exceeds the 2 MiB response limit' };
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_FEED_RESPONSE_BYTES) return { ok: false, error: 'Feed exceeds the 2 MiB response limit' };
    return {
      ok: true,
      text: new TextDecoder('utf-8').decode(buffer),
      finalUrl: response.url || url,
      contentType: response.headers?.get?.('content-type') || '',
      bytes: buffer.byteLength
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === 'AbortError' ? 'Feed request timed out' : (error?.message || 'Feed request failed')
    };
  } finally {
    clearTimeout(timer);
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

async function fetchTranslatorAssetChunk(options = {}) {
  const assetId = String(options.assetId || '');
  const asset = TRANSLATOR_ASSETS[assetId];
  if (!asset) return { ok: false, error: 'Unknown translation model asset' };
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  if (offset >= asset.size) return { ok: false, error: 'Translation model offset is out of range' };
  const requestedLength = Math.max(1, Math.min(
    TRANSLATOR_ASSET_MAX_CHUNK_BYTES,
    Math.floor(Number(options.length) || TRANSLATOR_ASSET_MAX_CHUNK_BYTES),
    asset.size - offset
  ));
  const end = offset + requestedLength - 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATOR_ASSET_TIMEOUT_MS);
  try {
    const response = await fetch(`${TRANSLATOR_ASSET_ROOT}${asset.location}`, {
      method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/octet-stream', Range: `bytes=${offset}-${end}` }
    });
    if (response.status !== 206) return { ok: false, error: `Mozilla model server returned ${response.status}; partial content was required` };
    const contentRange = String(response.headers?.get?.('content-range') || '');
    const rangeMatch = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
    if (!rangeMatch || Number(rangeMatch[1]) !== offset || Number(rangeMatch[3]) !== asset.size) {
      return { ok: false, error: 'Mozilla model server returned an invalid byte range' };
    }
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > requestedLength || Number(rangeMatch[2]) !== offset + buffer.byteLength - 1) {
      return { ok: false, error: 'Mozilla model server returned an invalid chunk size' };
    }
    const nextOffset = offset + buffer.byteLength;
    return {
      ok: true, assetId, offset, nextOffset, totalSize: asset.size, hash: asset.hash,
      done: nextOffset >= asset.size, chunk: bytesToBase64(new Uint8Array(buffer))
    };
  } catch (error) {
    return { ok: false, error: error?.name === 'AbortError' ? 'Translation model download timed out' : (error?.message || 'Translation model download failed') };
  } finally {
    clearTimeout(timer);
  }
}

async function checkUrlHealth(options = {}) {
  const url = typeof options.url === 'string' ? options.url.trim() : '';
  if (!/^https?:\/\//i.test(url) || url.length > 4096) {
    return { ok: true, reachable: false, status: 0, finalUrl: url, errorType: 'unsupported', error: 'Only bounded HTTP and HTTPS URLs can be checked' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_HEALTH_TIMEOUT_MS);
  const request = async method => fetch(url, {
    method,
    credentials: 'omit',
    redirect: 'follow',
    cache: 'no-store',
    signal: controller.signal,
    headers: method === 'GET' ? { Range: 'bytes=0-0' } : undefined
  });
  try {
    let response = null;
    let headError = null;
    try {
      response = await request('HEAD');
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      headError = error;
    }
    if (!response || response.status === 405 || response.status === 501) {
      try {
        response = await request('GET');
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        if (headError) {
          const combined = new Error(`HEAD failed: ${headError?.message || headError}; GET failed: ${error?.message || error}`);
          combined.cause = error;
          throw combined;
        }
        throw error;
      }
    }
    try { await response.body?.cancel?.(); } catch {}
    return {
      ok: true,
      reachable: true,
      status: response.status,
      statusText: String(response.statusText || '').slice(0, 128),
      finalUrl: response.url || url,
      errorType: response.status === 401 || response.status === 403 ? 'authentication' : (response.status >= 400 ? 'http' : '')
    };
  } catch (error) {
    const message = error?.message || 'Network request failed';
    const causeCode = String(error?.cause?.code || error?.code || '').toUpperCase();
    const dnsFailure = /ENOTFOUND|EAI_AGAIN|DNS/.test(causeCode) || /DNS|name not resolved|host not found/i.test(message);
    return {
      ok: true,
      reachable: false,
      status: 0,
      finalUrl: url,
      errorType: error?.name === 'AbortError' ? 'timeout' : (dnsFailure ? 'dns' : 'network'),
      error: error?.name === 'AbortError' ? 'Request timed out' : message
    };
  } finally {
    clearTimeout(timer);
  }
}

async function monitorService(options = {}) {
  const url = typeof options.url === 'string' ? options.url.trim() : '';
  if (!/^https:\/\//i.test(url) || url.length > 4096) return { ok: false, error: 'Only bounded HTTPS endpoints can be monitored' };
  const timeoutSeconds = Math.max(3, Math.min(30, Number(options.timeoutSeconds) || 10));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET', credentials: 'omit', redirect: 'follow', cache: 'no-store', signal: controller.signal,
      headers: { Accept: options.assertionType === 'json' ? 'application/json, text/plain;q=0.8, */*;q=0.2' : 'text/plain, application/json;q=0.8, */*;q=0.2' }
    });
    const declaredLength = Number(response.headers?.get?.('content-length') || 0);
    if (declaredLength > 128 * 1024) return { ok: false, error: 'Service response exceeds the 128 KiB limit' };
    let text = '';
    if (options.assertionType === 'text' || options.assertionType === 'json') {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > 128 * 1024) return { ok: false, error: 'Service response exceeds the 128 KiB limit' };
      text = new TextDecoder('utf-8').decode(buffer);
    } else {
      try { await response.body?.cancel?.(); } catch {}
    }
    return { ok: true, status: response.status, finalUrl: response.url || url, text, durationMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, error: error?.name === 'AbortError' ? 'Service check timed out' : (error?.message || 'Service check failed') };
  } finally { clearTimeout(timer); }
}

async function fetchCalendarText(options = {}) {
  const url = typeof options.url === 'string' ? options.url.trim() : '';
  if (!/^https:\/\//i.test(url)) return { ok: false, error: 'Only HTTPS calendar URLs are supported' };
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { return { ok: false, error: 'Calendar URL is invalid' }; }
  const requested = options.headers && typeof options.headers === 'object' ? options.headers : {};
  const headers = {
    Accept: typeof requested.Accept === 'string'
      ? requested.Accept.slice(0, 256)
      : 'text/calendar, application/json, text/plain, */*;q=0.2'
  };
  if (parsedUrl.hostname === 'api.football-data.org'
      && typeof requested['X-Auth-Token'] === 'string' && requested['X-Auth-Token'].length <= 512) {
    headers['X-Auth-Token'] = requested['X-Auth-Token'];
  }
  if (parsedUrl.hostname === 'api.sportmonks.com'
      && typeof requested.Authorization === 'string' && requested.Authorization.length <= 512) {
    headers.Authorization = requested.Authorization;
  }
  if (parsedUrl.hostname === 'v3.football.api-sports.io'
      && typeof requested['x-apisports-key'] === 'string' && requested['x-apisports-key'].length <= 512) {
    headers['x-apisports-key'] = requested['x-apisports-key'];
  }
  const hasProviderCredential = !!(headers['X-Auth-Token'] || headers.Authorization || headers['x-apisports-key']);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET', credentials: 'omit', redirect: hasProviderCredential ? 'error' : 'follow', cache: 'no-store', signal: controller.signal, headers
    });
    if (!response.ok) {
      const declaredLength = Number(response.headers?.get?.('content-length') || 0);
      let detail = '';
      if (!declaredLength || declaredLength <= MAX_FEED_RESPONSE_BYTES) {
        try {
          const errorBuffer = await response.arrayBuffer();
          if (errorBuffer.byteLength <= MAX_FEED_RESPONSE_BYTES) {
            const errorText = new TextDecoder('utf-8').decode(errorBuffer);
            try { const payload = JSON.parse(errorText); detail = String(payload?.message || payload?.error || ''); }
            catch { detail = errorText.replace(/\s+/g, ' ').trim().slice(0, 300); }
          }
        } catch {}
      }
      return { ok: false, status: response.status, error: `${parsedUrl.hostname} returned ${response.status}${detail ? `: ${detail}` : ''}` };
    }
    const declaredLength = Number(response.headers?.get?.('content-length') || 0);
    if (declaredLength > MAX_FEED_RESPONSE_BYTES) return { ok: false, error: 'Calendar response exceeds the 2 MiB limit' };
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_FEED_RESPONSE_BYTES) return { ok: false, error: 'Calendar response exceeds the 2 MiB limit' };
    return {
      ok: true, text: new TextDecoder('utf-8').decode(buffer), finalUrl: response.url || url,
      contentType: response.headers?.get?.('content-type') || '', bytes: buffer.byteLength
    };
  } catch (error) {
    return { ok: false, error: error?.name === 'AbortError' ? 'Calendar request timed out' : (error?.message || 'Calendar request failed') };
  } finally {
    clearTimeout(timer);
  }
}

async function secretStatus() {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: true, available: false, provider: '', error: nativeError || 'Native host not available' };
  return sendNativeRequest({ type: 'SECRET_STATUS' });
}

async function secretGet(key) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available', value: '' };
  return sendNativeRequest({ type: 'SECRET_GET', key });
}

async function secretSet(key, value) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  return sendNativeRequest({ type: 'SECRET_SET', key, value });
}

async function secretDelete(key) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  return sendNativeRequest({ type: 'SECRET_DELETE', key });
}

async function secretList() {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: true, keys: [] };
  return sendNativeRequest({ type: 'SECRET_LIST' });
}

async function systemMetrics(metrics = []) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  const allowed = new Set(['cpu', 'memory', 'disk', 'network', 'uptime', 'battery', 'platform']);
  return sendNativeRequest({ type: 'SYSTEM_METRICS', metrics: [...new Set((Array.isArray(metrics) ? metrics : []).filter(metric => allowed.has(metric)))] });
}

async function approveDirectory(purpose, title) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  if (!['git', 'recent-files'].includes(purpose)) return { ok: false, error: 'Unsupported directory purpose' };
  return sendNativeRequest(
    { type: 'APPROVE_DIRECTORY', purpose, title: String(title || 'Select folder').slice(0, 160) },
    DIRECTORY_APPROVAL_TIMEOUT_MS
  );
}

async function gitWorkspaceStatus(handle) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  return sendNativeRequest({ type: 'GIT_WORKSPACE_STATUS', handle: String(handle || '').slice(0, 80) });
}

async function openApprovedDirectory(handle, purpose, action) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  if (!['git', 'recent-files'].includes(purpose) || !['folder', 'terminal'].includes(action)) return { ok: false, error: 'Unsupported directory action' };
  return sendNativeRequest({ type: 'OPEN_APPROVED_DIRECTORY', handle: String(handle || '').slice(0, 80), purpose, action });
}

async function listRecentFiles(options = {}) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  const extensions = (Array.isArray(options.extensions) ? options.extensions : []).map(value => String(value).slice(0, 16)).slice(0, 20);
  return sendNativeRequest({
    type: 'LIST_RECENT_FILES', handle: String(options.handle || '').slice(0, 80), extensions,
    maxAgeHours: Math.max(1, Math.min(8760, Number(options.maxAgeHours) || 168)),
    limit: Math.max(1, Math.min(100, Number(options.limit) || 30)), recursive: options.recursive === true
  });
}

async function openApprovedFile(handle, relativePath, action) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  if (!['open', 'reveal'].includes(action)) return { ok: false, error: 'Unsupported file action' };
  return sendNativeRequest({ type: 'OPEN_APPROVED_FILE', handle: String(handle || '').slice(0, 80), relativePath: String(relativePath || '').slice(0, 2048), action });
}

async function approveApplication(appKey, title) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  return sendNativeRequest({
    type: 'APPROVE_APPLICATION',
    appKey: String(appKey || '').slice(0, 80),
    title: String(title || 'Select application').slice(0, 160)
  }, DIRECTORY_APPROVAL_TIMEOUT_MS);
}

async function approveApplicationLink(appKey, title, targetUri, iconHint) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  return sendNativeRequest({
    type: 'APPROVE_APPLICATION_LINK',
    appKey: String(appKey || '').slice(0, 80),
    title: String(title || 'Application').slice(0, 160),
    targetUri: String(targetUri || '').slice(0, 4096),
    iconHint: String(iconHint || '').slice(0, 2048)
  });
}

async function getApplicationStatus(appKey) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  return sendNativeRequest({ type: 'GET_APPLICATION_STATUS', appKey: String(appKey || '').slice(0, 80) });
}

async function runApprovedApplicationAction(type, appKey) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  const allowed = new Set(['LAUNCH_APPROVED_APPLICATION', 'REVEAL_APPROVED_APPLICATION', 'FORGET_APPROVED_APPLICATION']);
  if (!allowed.has(type)) return { ok: false, error: 'Unsupported application action' };
  const message = { type, appKey: String(appKey || '').slice(0, 80) };
  // Firefox tears down the process created for sendNativeMessage immediately
  // after its reply. On Windows that process can own launched children, making
  // an application appear for a moment and then vanish. Keep launches on the
  // long-lived native port so the child survives the response lifecycle.
  return type === 'LAUNCH_APPROVED_APPLICATION'
    ? sendPersistentNativeMessage(message)
    : sendNativeRequest(message);
}

async function getEmuGuiStatus() {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  return sendPersistentNativeMessage({ type: 'EMUGUI_STATUS' }, EMUGUI_REQUEST_TIMEOUT_MS);
}

async function createEmuGuiHubBinding(gameId, emulatorId, profileId) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  return sendPersistentNativeMessage({
    type: 'EMUGUI_CREATE_HUB_BINDING',
    gameId: String(gameId || '').slice(0, 120),
    emulatorId: String(emulatorId || '').slice(0, 120),
    profileId: String(profileId || '').slice(0, 120)
  }, EMUGUI_REQUEST_TIMEOUT_MS);
}

async function sendEmuGuiGameToHub(message) {
  const rebindGameKey = String(message.rebindGameKey || '').slice(0, 80);
  const binding = rebindGameKey
    ? await sendPersistentNativeMessage({
        type: 'REBIND_GAME',
        gameKey: rebindGameKey,
        gameId: String(message.gameId || '').slice(0, 120),
        emulatorId: String(message.emulatorId || '').slice(0, 120),
        profileId: String(message.profileId || '').slice(0, 120)
      }, EMUGUI_REQUEST_TIMEOUT_MS)
    : await createEmuGuiHubBinding(message.gameId, message.emulatorId, message.profileId);
  if (binding?.ok === false || !binding?.game) throw new Error(binding?.error || 'Cyrune Arcade could not create the game binding');
  const deliveryId = message.deliveryId || makeDeliveryId('game');
  const delivered = await deliverOrQueue({
    type: rebindGameKey ? 'MW_UPDATE_GAME_BINDING' : 'MW_RECEIVE_GAME',
    deliveryId,
    targetBoardId: message.targetBoardId || '',
    targetTabId: message.targetTabId || '',
    game: binding.game
  });
  if (!delivered?.ok) throw new Error(delivered?.error || 'Relay could not accept the game shortcut');
  return { ...delivered, ok: true, deliveryId, game: binding.game };
}

async function getGameStatus(gameKey, includeThumbnail = false) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  return sendPersistentNativeMessage(
    { type: 'GAME_STATUS', gameKey: String(gameKey || '').slice(0, 80), includeThumbnail: includeThumbnail === true },
    EMUGUI_REQUEST_TIMEOUT_MS
  );
}

async function runGameAction(type, gameKey) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  if (!['LAUNCH_GAME', 'REVEAL_GAME', 'FORGET_GAME'].includes(type)) return { ok: false, error: 'Unsupported game action' };
  const request = { type, gameKey: String(gameKey || '').slice(0, 80) };
  return sendPersistentNativeMessage(request, EMUGUI_REQUEST_TIMEOUT_MS);
}

// Bound complete transfers, not just individual chunks. Waiting work expires
// before dispatch, so a timed-out queued mutation cannot run later.
const arcadeTransferGate = (() => {
  let active = 0;
  const queue = [];
  const pump = () => {
    while (active < 2 && queue.length) {
      const item = queue.shift(); clearTimeout(item.timer); active++;
      Promise.resolve().then(item.work).then(item.resolve, item.reject).finally(() => {active--; pump();});
    }
  };
  return work => new Promise((resolve, reject) => {
    if (queue.length >= 64) {reject(new Error('Arcade is busy. Try again shortly.')); return;}
    const item = {work, resolve, reject};
    item.timer = setTimeout(() => {
      const index = queue.indexOf(item);
      if (index >= 0) {queue.splice(index, 1); reject(new Error('Arcade request expired before it started.'));}
    }, 15000);
    queue.push(item); pump();
  });
})();

function runEmuGuiPageRpc(message, sender) {
  const check = () => authorizeEmuGuiPageRequest(message, sender);
  return arcadeTransferGate(() => executeEmuGuiPageRpc(message, check));
}

async function executeEmuGuiPageRpc(message, check = null) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  const path = String(message.path || '').slice(0, 96);
  const timeoutMs = path === '/api/pick-path' ? DIRECTORY_APPROVAL_TIMEOUT_MS : EMUGUI_REQUEST_TIMEOUT_MS;
  const response = await sendPersistentNativeMessage({
    type: 'EMUGUI_API',
    method: String(message.method || '').slice(0, 8),
    path,
    query: message.query && typeof message.query === 'object' ? message.query : {},
    body: message.body && typeof message.body === 'object' ? message.body : {}
  }, timeoutMs, check);
  if (response?.ok !== true) return response || { ok: false, error: 'Cyrune Arcade API request failed' };
  return { ok: true, result: await readEmuGuiNativeTransfer(response.transfer) };
}

async function fetchEmuGuiRemoteAsset(url) {
  let settings;
  try {
    settings = await nexusNativeRequest({ type: 'NEXUS_GET_COMPONENT_SETTINGS', component: 'arcade' });
  } catch {
    return { ok: false, error: 'Arcade optional-network permission is unavailable' };
  }
  if (settings?.profile?.values?.privacy?.allowOptionalNetwork !== true) {
    return { ok: false, error: 'Optional network access is disabled in Cyrune Nexus' };
  }
  let target;
  try {
    target = new URL(String(url || ''));
  } catch {
    return { ok: false, error: 'Cyrune Arcade artwork URL is invalid' };
  }
  if (target.protocol !== 'https:') return { ok: false, error: 'Only HTTPS Cyrune Arcade artwork URLs are supported' };
  if (!ARCADE_REMOTE_ARTWORK_HOSTS.has(target.hostname.toLowerCase())) {
    return { ok: false, error: 'Cyrune Arcade artwork origin is not approved' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMUGUI_REMOTE_ASSET_TIMEOUT_MS);
  try {
    const response = await fetch(target.href, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'follow',
      cache: 'force-cache',
      signal: controller.signal,
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1' }
    });
    if (!response.ok) return { ok: false, error: `Cyrune Arcade artwork returned ${response.status}` };
    let finalUrl;
    try { finalUrl = new URL(response.url || target.href); } catch { finalUrl = null; }
    if (!finalUrl || finalUrl.protocol !== 'https:' || !ARCADE_REMOTE_ARTWORK_HOSTS.has(finalUrl.hostname.toLowerCase())) {
      return { ok: false, error: 'Cyrune Arcade artwork redirected to an unsupported origin' };
    }
    const contentType = String(response.headers?.get?.('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    if (!EMUGUI_REMOTE_ASSET_TYPES.has(contentType)) return { ok: false, error: 'Cyrune Arcade artwork returned an unsupported image type' };
    const declaredLength = Number(response.headers?.get?.('content-length') || 0);
    if (declaredLength > MAX_EMUGUI_REMOTE_ASSET_BYTES) return { ok: false, error: 'Cyrune Arcade artwork exceeds the 4 MiB limit' };
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > MAX_EMUGUI_REMOTE_ASSET_BYTES) {
      return { ok: false, error: 'Cyrune Arcade artwork is empty or exceeds the 4 MiB limit' };
    }
    return {
      ok: true,
      asset: {
        dataUrl: `data:${contentType};base64,${bytesToBase64(new Uint8Array(buffer))}`,
        contentType,
        bytes: buffer.byteLength,
        source: 'remote'
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === 'AbortError' ? 'Cyrune Arcade artwork request timed out' : (error?.message || 'Cyrune Arcade artwork request failed')
    };
  } finally {
    clearTimeout(timer);
  }
}

function loadEmuGuiPageAsset(path, collectionId, check = null) {
  if (check && !check()) return Promise.reject(new Error('The page session changed.'));
  return executeEmuGuiPageAsset(path, collectionId, check);
}

async function executeEmuGuiPageAsset(path, collectionId, check = null) {
  const requestedPath = String(path || '').slice(0, 2048);
  if (/^https?:\/\//i.test(requestedPath)) return fetchEmuGuiRemoteAsset(requestedPath);
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  let asset = await arcadeTransferGate(async () => {
  const response = await sendPersistentNativeMessage(
    { type: 'EMUGUI_ASSET', path: requestedPath, ...(collectionId !== undefined ? {collectionId} : {}) },
    EMUGUI_REQUEST_TIMEOUT_MS, check
  );
  if (response?.ok !== true) throw new Error(response?.error || 'Cyrune Arcade artwork request failed');
  return readEmuGuiNativeTransfer(response.transfer);
  });
  if (asset.job_id) {
    const deadline = Date.now() + 110000;
    while (true) {
      if (Date.now() > deadline) throw new Error('Artwork download timed out. Retry shortly.');
      await new Promise(resolve => setTimeout(resolve, 250));
      // Only hold a slot while transferring; provider I/O must not block game reads.
      const reply = await arcadeTransferGate(() => executeEmuGuiPageRpc({method:'GET', path:'/api/scrape-job', query:{id:asset.job_id, collection_id:collectionId || asset.collection_id || ''}}, check));
      if (!reply.ok || reply.result?.ok === false) throw new Error(reply.result?.error || reply.error || 'Artwork request failed');
      if (reply.result.status === 'done') {asset = reply.result.result; break;}
    }
  }
  if (asset.ok === false) throw new Error(asset.error || 'Artwork unavailable');
  return { ok:true, asset };
}

async function readEmuGuiNativeTransfer(initialTransfer) {
  let transfer = initialTransfer;
  const chunks = [];
  let receivedSize = 0;
  let totalSize = 0;
  let transferId = '';
  while (true) {
    if (!transfer || typeof transfer !== 'object') throw new Error('Cyrune Arcade returned an invalid transfer');
    const currentId = String(transfer.transferId || '');
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(currentId)) throw new Error('Cyrune Arcade returned an invalid transfer ID');
    if (transferId && currentId !== transferId) throw new Error('Cyrune Arcade transfer changed during delivery');
    transferId = currentId;
    const advertisedSize = Number(transfer.totalSize);
    if (!Number.isSafeInteger(advertisedSize) || advertisedSize < 0 || advertisedSize > MAX_EMUGUI_TRANSFER_BYTES) {
      throw new Error('Cyrune Arcade transfer is too large');
    }
    if (totalSize && advertisedSize !== totalSize) throw new Error('Cyrune Arcade transfer size changed during delivery');
    totalSize = advertisedSize;
    const bytes = decodeBase64Chunk(String(transfer.chunk || ''));
    if (bytes.length > 512 * 1024 || receivedSize + bytes.length > totalSize) {
      throw new Error('Cyrune Arcade returned an invalid transfer chunk');
    }
    chunks.push(bytes);
    receivedSize += bytes.length;
    const nextOffset = Number(transfer.nextOffset);
    if (!Number.isSafeInteger(nextOffset) || nextOffset !== receivedSize) {
      throw new Error('Cyrune Arcade transfer offset is invalid');
    }
    if (transfer.done === true) break;
    if (!bytes.length) throw new Error('Cyrune Arcade transfer stalled');
    const response = await sendPersistentNativeMessage({
      type: 'EMUGUI_TRANSFER_CHUNK',
      transferId,
      offset: receivedSize
    }, EMUGUI_REQUEST_TIMEOUT_MS);
    if (response?.ok !== true) throw new Error(response?.error || 'Cyrune Arcade transfer failed');
    transfer = response.transfer;
  }
  if (receivedSize !== totalSize) {
    throw new Error(`Cyrune Arcade transfer was incomplete (${receivedSize} of ${totalSize} bytes)`);
  }
  try {
    return JSON.parse(decodeChunkedText(chunks, totalSize));
  } catch {
    throw new Error('Cyrune Arcade returned invalid JSON');
  }
}

async function openGameInEmuGui(gameKey, rebind = false, catalogueId = '') {
  if (typeof catalogueId !== 'string' || catalogueId && !/^[A-Za-z0-9_-]{1,80}$/.test(catalogueId)) {
    throw new Error('Invalid game reference');
  }
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  const result = await sendPersistentNativeMessage({
    type: 'OPEN_GAME_IN_EMUGUI',
    gameKey: String(gameKey || '').slice(0, 80),
    rebind: rebind === true,
    catalogueId
  }, EMUGUI_REQUEST_TIMEOUT_MS);
  if (result?.ok === false) return result;
  let target;
  try {
    target = new URL(String(result?.url || ''));
  } catch {
    return { ok: false, error: 'Cyrune Arcade returned an invalid page address' };
  }
  const localFileTarget = target.protocol === 'file:' && /\/web\/index\.html$/i.test(target.pathname);
  if (!localFileTarget) {
    return { ok: false, error: 'Cyrune Arcade returned an unsupported page address' };
  }
  const tabs = await browser.tabs.query({});
  const existing = (tabs || []).find(tab => {
    try {
      const url = new URL(tab.url || '');
      return url.protocol === 'file:' && url.pathname.toLowerCase() === target.pathname.toLowerCase();
    } catch { return false; }
  });
  if (existing) {
    await browser.tabs.update(existing.id, { url: target.href, active: true });
    if (existing.windowId != null && browser.windows?.update) await browser.windows.update(existing.windowId, { focused: true });
  } else {
    await browser.tabs.create({ url: target.href, active: true });
  }
  return { ok: true };
}


// ---------------------------------------------------------------------------
// Save — correlated native FIFO + storage.local fallback
// ---------------------------------------------------------------------------

async function writeNativeSnapshot(content, expectedVersion = null, expectedHash = '', databasePath = saveFilePath) {
  try {
    const res = await sendNativeRequest({
      type: 'PORTAL_DATABASE_WRITE',
      content,
      expectedVersion,
      expectedHash: expectedHash || ''
    });
    return {
      ok: res?.ok === true,
      conflict: res?.conflict === true,
      fileInfo: res?.fileInfo || null,
      databasePath: databasePath || null
    };
  } catch (e) {
    console.warn('Cyrune Relay: native write failed', e);
    return {
      ok: false,
      error: e.message,
      conflict: false,
      fileInfo: null,
      databasePath: databasePath || null
    };
  }
}

function scheduleNativeSave(content, expectedVersion = null, expectedHash = '', databasePath = saveFilePath) {
  return new Promise(resolve => {
    nativeSaveQueue.push({ content, expectedVersion, expectedHash, databasePath, resolve });
    void drainNativeSaveQueue();
  });
}

async function drainNativeSaveQueue() {
  if (nativeSaveQueueRunning) return;
  nativeSaveQueueRunning = true;
  try {
    while (nativeSaveQueue.length) {
      const request = nativeSaveQueue.shift();
      const result = await writeNativeSnapshot(
        request.content,
        request.expectedVersion,
        request.expectedHash,
        request.databasePath
      );
      request.resolve(result);
    }
  } finally {
    nativeSaveQueueRunning = false;
  }
}

async function saveState(json, { expectedVersion = null, expectedHash = '' } = {}) {
  try {
    return await portalSnapshotAuthority.write(json, { expectedVersion, expectedHash });
  } catch (error) {
    return { ok: false, conflict: false, error: error.message || 'Portal storage is unavailable',
      ...portalSnapshotAuthority.status() };
  }
}

async function loadState() {
  return portalSnapshotAuthority.read();
}


// ---------------------------------------------------------------------------
// File picker — delegates to native host
// ---------------------------------------------------------------------------

async function openFilePicker(accept, title) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  try {
    return await sendNativeRequest({
      type: 'OPEN_FILE_PICKER',
      accept,
      title
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function pickDatabasePath(title, defaultName) {
  await ensureNativeStorageReady();
  if (!nativeAvailable) return { ok: false, error: 'Native host not available' };
  try {
    return await sendNativeRequest({
      type: 'SAVE_FILE_PICKER',
      accept: 'json',
      title,
      defaultName
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

function handleNexusRuntimeMessage(msg, sender, sendResponse) {
  switch (msg.type) {

    case 'MW_NEXUS_REGISTER':
      registerNexusPage(sender, msg.pageUrl, msg.protocols)
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    case 'MW_NEXUS_PING':
      refreshFileSchemeAccess()
        .then(() => sendResponse({
          ok: true,
          relayVersion: browser.runtime.getManifest?.()?.version || '',
          nativeAvailable,
          fileSchemeAccess,
          protocols: RELAY_PROTOCOLS,
          capabilities: RELAY_COMPONENT_CAPABILITIES,
          operations: ['nexusSettings', 'nexusStatus', 'nexusDocuments', 'nexusTodoEditor', 'repositoryRemoteCheck', 'componentSettings']
        }))
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    case 'MW_NEXUS_GET_SETTINGS':
      nexusNativeRequest({ type: 'NEXUS_GET_SETTINGS' })
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    case 'MW_NEXUS_SAVE_SETTINGS': {
      let serialized = '';
      try { serialized = JSON.stringify(msg.settings); } catch {}
      if (!serialized || serialized.length > MAX_NEXUS_SETTINGS_BYTES) {
        sendResponse({ ok: false, error: 'Nexus settings payload is invalid or too large' });
        return true;
      }
      nexusNativeRequest({
        type: 'NEXUS_SAVE_SETTINGS', settings: msg.settings, expectedRevision: msg.expectedRevision
      }).then(async response => {
        if (response?.ok === true && response.conflict !== true) {
          await broadcastNexusSettingsChanged(response.settings?.revision || 0);
        }
        sendResponse(response);
      }).catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    case 'MW_NEXUS_GET_STATUS':
      getNexusStatus().then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    case 'MW_NEXUS_GET_DOCUMENT': {
      const component = String(msg.component || '').toLowerCase();
      const documentType = String(msg.documentType || '').toLowerCase();
      const allowedComponents = new Set(['portal', 'widgets', 'arcade', 'relay', 'host', 'nexus', 'project']);
      const allowedTypes = new Set(['todo', 'changelog', 'project']);
      if (!allowedComponents.has(component) || !allowedTypes.has(documentType)) {
        sendResponse({ ok: false, error: 'Unsupported Nexus component document' });
        return true;
      }
      nexusNativeRequest({ type: 'NEXUS_GET_DOCUMENT', component, documentType }).then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    case 'MW_NEXUS_OPEN_TODO': {
      const component = String(msg.component || '').toLowerCase();
      const allowedComponents = new Set(['portal', 'widgets', 'arcade', 'relay', 'host', 'nexus', 'project']);
      if (!allowedComponents.has(component)) {
        sendResponse({ ok: false, error: 'Unsupported Nexus TODO' });
        return true;
      }
      nexusNativeRequest({ type: 'NEXUS_OPEN_TODO', component }).then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }
    case 'MW_NEXUS_CHECK_REMOTE':
      nexusNativeRequest({ type: 'NEXUS_CHECK_REMOTE' }).then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    default:
      return false;
  }
}

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (Object.hasOwn(CATALOGUE_ROUTES, msg?.type || '')) {
    routeCatalogueRequest(msg, sender).then(sendResponse);
    return true;
  }
  if (HUB_PAGE_REQUEST_TYPES.has(msg?.type) && !authorizeHubPageRequest(msg, sender)) {
    sendResponse({ ok: false, error: 'This request is not authorized for the registered Hub page' });
    return false;
  }
  if (EMUGUI_PAGE_REQUEST_TYPES.has(msg?.type) && !authorizeEmuGuiPageRequest(msg, sender)) {
    sendResponse({ ok: false, error: 'This request is not authorized for Cyrune Arcade' });
    return false;
  }
  if (NEXUS_PAGE_REQUEST_TYPES.has(msg?.type) && !authorizeNexusPageRequest(msg, sender)) {
    sendResponse({ ok: false, error: 'This request is not authorized for Cyrune Nexus' });
    return false;
  }
  if (handleNexusRuntimeMessage(msg, sender, sendResponse)) return true;
  switch (msg.type) {

    case 'CYRUNE_SITE_CONTROLS':
      if (sender?.id !== browser.runtime.id || sender?.url !== browser.runtime.getURL('popup/popup.html?view=refresh')) {
        sendResponse({ ok: false, error: 'Open Timer & Activity Tracker to edit site rules.' }); return false;
      }
      siteControls.popup(msg).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    case 'CYRUNE_BLOCK_STATUS': {
      const prefix = browser.runtime.getURL('popup/popup.html') + '?view=blocked&';
      if (sender?.id !== browser.runtime.id || !sender?.url?.startsWith(prefix)) { sendResponse({ ok: false }); return false; }
      const domain = new URL(sender.url).searchParams.get('domain');
      siteControls.status(domain).then(sendResponse).catch(() => sendResponse({ ok: false }));
      return true;
    }
    case 'MW_PRODUCTIVITY':
      productivityService.request(msg.payload, () => authorizeHubPageRequest(msg, sender))
        .then(result => sendResponse(authorizeHubPageRequest(msg, sender) ? result : { ok: false, error: 'Portal registration expired.' }))
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;

    case 'CYRUNE_PRODUCTIVITY':
      if (sender?.id !== browser.runtime.id || sender?.url !== browser.runtime.getURL('popup/popup.html')) {
        sendResponse({ ok: false, error: 'Open the Relay popup to control productivity services.' }); return false;
      }
      productivityService.request(msg.payload).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    case 'CYRUNE_WEB_UTILITIES_STATE':
      browserUtilities.webState(sender).then(sendResponse).catch(() => sendResponse({}));
      return true;

    case 'CYRUNE_UTILITY_FORM_EDITED':
      browserUtilities.formEdited(sender);
      return false;

    case 'CYRUNE_TAB_TIMERS': {
      const overview=sender?.url===browser.runtime.getURL('popup/popup.html?view=timers');
      if(sender?.id!==browser.runtime.id || sender.frameId !== undefined && sender.frameId !== 0 || sender.tab && sender.tab.url !== sender.url
          || !overview && sender?.url!==browser.runtime.getURL('popup/popup.html?view=refresh')) {
        sendResponse({ok:false,error:'Open Relay timer controls.'});return false;
      }
      tabTimerController.request(msg,overview).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message}));return true;
    }
    case 'CYRUNE_TAB_UNLOAD':
      if (sender?.id !== browser.runtime.id || sender?.url !== browser.runtime.getURL('popup/popup.html?view=refresh')) {
        sendResponse({ ok: false, error: 'Open Timer & Activity Tracker to change unload settings.' }); return false;
      }
      tabUnloader.popup(msg).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
      return true;

    case 'CYRUNE_BROWSER_UTILITIES':
      if (sender?.id !== browser.runtime.id || ![
        browser.runtime.getURL('popup/popup.html'), browser.runtime.getURL('popup/popup.html?view=refresh')
      ].includes(sender?.url) || sender?.url.endsWith('?view=refresh') && !['state', 'refresh'].includes(msg.action)) {
        sendResponse({ ok: false, error: 'Browser utilities are only available in the Relay popup.' });
        return false;
      }
      browserUtilities.popup(msg).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
      return true;

    case 'CYRUNE_NATIVE_MENU_STATE': {
      // Read-only internal content-script request. Top-level tab identity comes
      // from Firefox, so cross-origin frames follow the same site exception.
      let hostname = '';
      try {
        const url = new URL(sender?.tab?.url || '');
        if (/^https?:$/.test(url.protocol)) hostname = url.hostname;
      } catch { /* Unsupported tabs remain disabled. */ }
      if (sender?.id !== browser.runtime.id || !hostname) {
        sendResponse({ enabled: false });
        return false;
      }
      browser.storage.local.get('cyruneNativeContextMenuV1').then(stored => {
        const settings = stored.cyruneNativeContextMenuV1;
        const exceptions = Array.isArray(settings?.exceptions) ? settings.exceptions.slice(0, 256) : [];
        sendResponse({ enabled: settings?.enabled === true && !exceptions.includes(hostname) });
      }).catch(() => sendResponse({ enabled: false }));
      return true;
    }

    case 'USE_RELAY_STORAGE':
      if (sender?.tab || sender?.id !== browser.runtime.id
          || sender?.url !== browser.runtime.getURL('popup/popup.html')) {
        sendResponse({ ok: false, error: 'Storage selection is only available in the Cyrune Relay popup.' });
        return false;
      }
      portalSnapshotAuthority.chooseRelay()
        .then(() => sendResponse({ ok: true, storageInfo: getStorageInfo() }))
        .catch(error => sendResponse({ ok: false, error: error.message }));
      return true;

    case 'MW_PING':
      // Extension presence must not wait for native-host startup. The page asks
      // for authoritative storage info immediately after this handshake.
      if (authorizeHubPageRequest(msg, sender)) rememberMorpheusTab(sender.tab, msg.pageUrl || sender.tab.url || '', {
        active: msg.active === true
      });
      sendResponse({ ok: true, version: browser.runtime.getManifest?.()?.version || '', ...getStorageInfo() });
      break;

    case 'MW_REGISTER':
      {
      const protocolCheck = validateClientProtocols('portal', msg.protocols);
      if (!protocolCheck.ok) {
        hubRelayError = protocolCheck.error;
        sendResponse(protocolCheck);
        break;
      }
      const renewing = authorizeHubPageRequest({ ...msg, morpheusPage: true }, sender);
      if (!renewing) closeCatalogueSession(sender.tab?.id);
      const registration = rememberMorpheusTab(sender.tab, msg.pageUrl || sender.tab?.url || '', {
        active: msg.active === true,
        sessionToken: renewing ? msg.hubSessionToken : createHubSessionToken(),
        protocols: protocolCheck.protocols
      });
      if (!registration) {
        sendResponse({ ok: false, error: 'Hub registration came from an unsupported page' });
        break;
      }
      sendResponse({ ok: true, hubSessionToken: registration.sessionToken, ...getStorageInfo() });
      break;
      }

    case 'MW_EMUGUI_REGISTER':
      registerEmuGuiPage(sender, msg.pageUrl, msg.protocols)
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;

    case 'MW_GET_CYRUNE_SETTINGS':
      nexusNativeRequest({ type: 'NEXUS_GET_COMPONENT_SETTINGS', component: 'portal-widgets' })
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;

    case 'MW_EMUGUI_GET_CYRUNE_SETTINGS':
      nexusNativeRequest({ type: 'NEXUS_GET_COMPONENT_SETTINGS', component: 'arcade' })
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;

    case 'MW_PUBLISH_PORTAL_THEME':
      Promise.resolve().then(() => publishPortalTheme(msg.theme))
        .then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
      return true;

    case 'MW_EMUGUI_GET_PORTAL_THEME':
      readPortalTheme().then(theme => sendResponse({ ok: true, theme }))
        .catch(() => sendResponse({ ok: false, error: 'Portal theme is unavailable' }));
      return true;

    case 'MW_GET_STATUS':
      if (!nativeAvailable) void ensureNativeStorageReady();
      Promise.all([ensureMorpheusTab(), readDurableIntake()])
        .then(([tab, intake]) => sendResponse({ ok: true, morpheusOpen: !!tab, pendingIntake: intake.length, ...getStorageInfo() }))
        .catch(error => sendResponse({
          ok: true,
          morpheusOpen: false,
          ...getStorageInfo(),
          hubRelayError: error?.message || String(error)
        }));
      return true;

    case 'MW_GET_STORAGE_INFO':
      ensureNativeStorageReady()
        .then(() => sendResponse({ ok: true, ...getStorageInfo() }))
        .catch(() => sendResponse({ ok: true, nativeAvailable: false, databasePath: null }));
      return true;

    case 'MW_NOTIFICATION_SCHEDULE':
      scheduleHubNotification(msg.job)
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || 'Could not schedule notification' }));
      return true;

    case 'MW_NOTIFICATION_CANCEL':
      cancelHubNotification(msg.id)
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || 'Could not cancel notification' }));
      return true;

    case 'MW_NOTIFICATION_LIST':
      listHubNotifications()
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, events: [], jobs: [], error: error?.message || 'Could not load notifications' }));
      return true;

    case 'MW_NOTIFICATION_MARK_READ':
      markHubNotificationsRead(msg.ids)
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || 'Could not update notifications' }));
      return true;

    case 'MW_NOTIFICATION_CLEAR':
      clearHubNotifications()
        .then(sendResponse)
        .catch(error => sendResponse({ ok: false, error: error?.message || 'Could not clear notifications' }));
      return true;

    case 'MW_SET_DATABASE_PATH':
      setDatabasePath(msg.path || '')
        .then(ok => ok
          ? sendResponse({ ok: true, ...getStorageInfo() })
          : sendResponse({ ok: false, error: 'Failed to update database path' }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_PICK_DATABASE_PATH':
      pickDatabasePath(msg.title || 'Choose shared database location', msg.defaultName || 'cyrune-portal.json')
        .then(res => sendResponse(res))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_SAVE':
      saveState(msg.json, {
        expectedVersion: msg.expectedVersion ?? null,
        expectedHash: msg.expectedHash || ''
      })
        .then(async result => {
          if (result?.ok === true && result.conflict !== true) {
            await broadcastPortalStateChanged(result.fileInfo || null, sender?.tab?.id ?? null);
          }
          sendResponse(result || { ok: true });
        })
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_LOAD':
      loadState()
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_LOAD_SHARED_CHUNK':
      loadSharedStateChunk(msg.offset, msg.length, msg.expectedVersion)
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_GET_DATABASE_FILE_INFO':
      getDatabaseFileInfo()
        .then(result => sendResponse({ ok: true, ...result }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_OPEN_FILE_PICKER':
      openFilePicker(msg.accept || '', msg.title || 'Select file')
        .then(res => sendResponse(res))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_BEGIN_ASSET_WRITE':
      beginAssetWrite(msg)
        .then(res => sendResponse(res))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_APPEND_ASSET_WRITE':
      appendAssetWriteChunk(msg.sessionId || '', msg.chunk || '')
        .then(res => sendResponse(res || { ok: true }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_FINISH_ASSET_WRITE':
      finishAssetWrite(msg.sessionId || '')
        .then(res => sendResponse(res || { ok: true }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_ABORT_ASSET_WRITE':
      abortAssetWrite(msg.sessionId || '')
        .then(res => sendResponse(res || { ok: true }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_CACHE_ASSET_URL':
      cacheAssetUrl(msg)
        .then(res => sendResponse(res || { ok: true }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_FETCH_FAVICON':
      fetchFavicon(msg)
        .then(res => sendResponse(res || { ok: false, error: 'No favicon found' }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_FETCH_FEED':
      fetchFeedText(msg)
        .then(res => sendResponse(res || { ok: false, error: 'Feed request failed' }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_FETCH_TRANSLATOR_ASSET_CHUNK':
      fetchTranslatorAssetChunk(msg)
        .then(res => sendResponse(res || { ok: false, error: 'Translation model download failed' }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_FETCH_CALENDAR':
      fetchCalendarText(msg)
        .then(res => sendResponse(res || { ok: false, error: 'Calendar request failed' }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_CHECK_URL':
      checkUrlHealth(msg)
        .then(res => sendResponse(res))
        .catch(e => sendResponse({ ok: true, reachable: false, status: 0, finalUrl: msg.url || '', error: e.message }));
      return true;

    case 'MW_MONITOR_SERVICE':
      monitorService(msg)
        .then(res => sendResponse(res))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_SYSTEM_METRICS':
      systemMetrics(msg.metrics)
        .then(res => sendResponse(res))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_APPROVE_DIRECTORY':
      approveDirectory(msg.purpose, msg.title).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_GIT_WORKSPACE_STATUS':
      gitWorkspaceStatus(msg.handle).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_OPEN_APPROVED_DIRECTORY':
      openApprovedDirectory(msg.handle, msg.purpose, msg.action).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_LIST_RECENT_FILES':
      listRecentFiles(msg).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_OPEN_APPROVED_FILE':
      openApprovedFile(msg.handle, msg.relativePath, msg.action).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_APPROVE_APPLICATION':
      approveApplication(msg.appKey, msg.title).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_APPROVE_APPLICATION_LINK':
      approveApplicationLink(msg.appKey, msg.title, msg.targetUri, msg.iconHint).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_GET_APPLICATION_STATUS':
      getApplicationStatus(msg.appKey).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_LAUNCH_APPROVED_APPLICATION':
      runApprovedApplicationAction('LAUNCH_APPROVED_APPLICATION', msg.appKey).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_REVEAL_APPROVED_APPLICATION':
      runApprovedApplicationAction('REVEAL_APPROVED_APPLICATION', msg.appKey).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_FORGET_APPROVED_APPLICATION':
      runApprovedApplicationAction('FORGET_APPROVED_APPLICATION', msg.appKey).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_EMUGUI_STATUS':
      getEmuGuiStatus().then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_EMUGUI_SEND_GAME':
      sendEmuGuiGameToHub(msg).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_EMUGUI_RPC':
      runEmuGuiPageRpc(msg, sender).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_EMUGUI_ASSET':
      loadEmuGuiPageAsset(msg.path, msg.collectionId, () => authorizeEmuGuiPageRequest(msg, sender)).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_GET_GAME_STATUS':
      getGameStatus(msg.gameKey, msg.includeThumbnail === true).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_LAUNCH_GAME':
      runGameAction('LAUNCH_GAME', msg.gameKey).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_GAME_VERSIONS': {
      const { gameKey, action = 'list', catalogueId = '', entryRevision = '' } = msg;
      if (typeof gameKey !== 'string' || !/^game_[A-Za-z0-9_-]{12,75}$/.test(gameKey)
          || !['list', 'launch', 'default'].includes(action)
          || (action === 'list' ? catalogueId !== '' || entryRevision !== ''
            : ![catalogueId, entryRevision].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value)))) {
        sendResponse({ ok: false, error: 'Invalid game version request' }); return false;
      }
      ensureNativeStorageReady().then(() => sendPersistentNativeMessage({ type: 'GAME_VERSIONS', gameKey, action, catalogueId, entryRevision }, EMUGUI_REQUEST_TIMEOUT_MS))
        .then(response => {
          if (response?.ok === false) throw new Error('Game versions are unavailable. Refresh the library and try again.');
          if (!validateGameVersionReply(response, action)) throw new Error('Game versions could not be read. Reload Relay and try again.');
          sendResponse(response);
        }).catch(error => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    case 'MW_OPEN_GAME_IN_EMUGUI':
      openGameInEmuGui(msg.gameKey, msg.rebind === true, msg.catalogueId ?? '').then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_REVEAL_GAME':
      runGameAction('REVEAL_GAME', msg.gameKey).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_SECRET_STATUS':
      secretStatus()
        .then(res => sendResponse(res || { ok: true, available: false }))
        .catch(e => sendResponse({ ok: false, available: false, error: e.message }));
      return true;

    case 'MW_SECRET_GET':
      secretGet(msg.key || '')
        .then(res => sendResponse(res || { ok: true, value: '' }))
        .catch(e => sendResponse({ ok: false, value: '', error: e.message }));
      return true;

    case 'MW_SECRET_SET':
      secretSet(msg.key || '', msg.value || '')
        .then(res => sendResponse(res || { ok: true }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_SECRET_DELETE':
      secretDelete(msg.key || '')
        .then(res => sendResponse(res || { ok: true }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_SECRET_LIST':
      secretList()
        .then(res => sendResponse(res || { ok: true, keys: [] }))
        .catch(e => sendResponse({ ok: false, keys: [], error: e.message }));
      return true;

    case 'MW_CAPTURE_BROWSER_SESSION':
      captureBrowserSession(msg.scope || 'window')
        .then(sendResponse)
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_LAUNCH_BROWSER_SESSION':
      launchBrowserSession(msg.tabs || [], { staggerMs: msg.staggerMs, recreateGroups: msg.recreateGroups })
        .then(sendResponse)
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_LIST_DATABASE_BACKUPS':
      listDatabaseBackups()
        .then(sendResponse)
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_READ_DATABASE_BACKUP':
      readDatabaseBackup(msg.name || '')
        .then(sendResponse)
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_CREATE_DATABASE_BACKUP':
      createDatabaseBackup()
        .then(sendResponse)
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;

    case 'MW_LIST_THEMES': {
      ensureNativeStorageReady()
        .then(() => {
          if (!nativeAvailable || !saveFilePath) return sendResponse({ ok: true, themes: [] });
          return sendNativeRequest({ type: 'PORTAL_LIST_THEMES' })
            .then(result => sendResponse({ ok: true, themes: Array.isArray(result?.themes) ? result.themes : [] }));
        })
        .catch(() => sendResponse({ ok: true, themes: [] }));
      return true;
    }

    case 'MW_WRITE_THEME': {
      ensureNativeStorageReady()
        .then(() => {
          const theme = msg.theme;
          const themeId = theme?.id || 'custom';
          if (!joinThemePath(themeId + '.json')) return sendResponse({ ok: false, error: 'Theme ID must contain only letters, numbers, hyphens, or underscores' });
          if (!nativeAvailable) return sendResponse({ ok: false, error: 'Not available' });
          return sendNativeRequest({
            type: 'PORTAL_WRITE_THEME',
            themeId,
            content: JSON.stringify(theme, null, 2)
          })
            .then(res => sendResponse(res || { ok: true }));
        })
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    case 'MW_SEND_TAB': {
      const deliveryId = msg.deliveryId || makeDeliveryId('tab');
      deliverOrQueue({
            type: 'MW_RECEIVE_TAB',
            deliveryId,
            targetBoardId: msg.targetBoardId || '',
            targetTabId: msg.targetTabId || '',
            url:   msg.url,
            title: msg.title,
            faviconCache: msg.faviconCache || ''
          })
        .then(result => sendResponse(result?.ok
          ? { ...result, ok: true, deliveryId }
          : { ok: false, conflict: result?.conflict === true, error: result?.error || 'Relay could not accept the delivery' }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;
      }

    case 'MW_GET_INBOX_TARGETS':
      sendToMorpheus({ type: 'MW_GET_INBOX_TARGETS' })
        .then(result => sendResponse(result?.ok
          ? result
          : { ok: false, boards: [], error: result?.error || 'The hub did not return any Inbox targets' }))
        .catch(e => sendResponse({ ok: false, boards: [], error: e.message }));
      return true;

    case 'MW_SEND_TAB_TO_IMPORT_MANAGER': {
      const item = tabToImportItem(msg);
      if (!item) {
        sendResponse({ ok: false, error: 'No tab URL to import' });
        break;
      }
      const deliveryId = msg.deliveryId || makeDeliveryId('import');
      sendImportItemsToMorpheus([item], 'popup', deliveryId)
        .then(result => sendResponse(result?.ok
          ? { ...result, ok: true, deliveryId }
          : { ok: false, conflict: result?.conflict === true, error: result?.error || 'The hub rejected the import' }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    default:
      break;
  }
});

// Productivity storage is profile-local and transactionally separate from Portal data.
// Public Suffix List, MPL-2.0, https://publicsuffix.org/list/public_suffix_list.dat
// Bundled 2026-10-23; SHA-256: 0232f4df0831911356e8ee1f4d5c3b6b12c0ed3f6bd66b0f81c8ab5d3d49e9ca
// Source and licence: https://github.com/publicsuffix/list (no runtime downloads).
// The following suffix data is subject to the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this data, obtain one at https://mozilla.org/MPL/2.0/.
const RELAY_PUBLIC_SUFFIXES = new Set("ac com.ac edu.ac gov.ac mil.ac net.ac org.ac ad ae ac.ae co.ae gov.ae mil.ae net.ae org.ae sch.ae aero airline.aero airport.aero accident-investigation.aero accident-prevention.aero aerobatic.aero aeroclub.aero aerodrome.aero agents.aero air-surveillance.aero air-traffic-control.aero aircraft.aero airtraffic.aero ambulance.aero association.aero author.aero ballooning.aero broker.aero caa.aero cargo.aero catering.aero certification.aero championship.aero charter.aero civilaviation.aero club.aero conference.aero consultant.aero consulting.aero control.aero council.aero crew.aero design.aero dgca.aero educator.aero emergency.aero engine.aero engineer.aero entertainment.aero equipment.aero exchange.aero express.aero federation.aero flight.aero freight.aero fuel.aero gliding.aero government.aero groundhandling.aero group.aero hanggliding.aero homebuilt.aero insurance.aero journal.aero journalist.aero leasing.aero logistics.aero magazine.aero maintenance.aero marketplace.aero media.aero microlight.aero modelling.aero navigation.aero parachuting.aero paragliding.aero passenger-association.aero pilot.aero press.aero production.aero recreation.aero repbody.aero res.aero research.aero rotorcraft.aero safety.aero scientist.aero services.aero show.aero skydiving.aero software.aero student.aero taxi.aero trader.aero trading.aero trainer.aero union.aero workinggroup.aero works.aero af com.af edu.af gov.af net.af org.af ag co.ag com.ag net.ag nom.ag org.ag ai com.ai net.ai off.ai org.ai al com.al edu.al gov.al mil.al net.al org.al am co.am com.am commune.am net.am org.am ao co.ao ed.ao edu.ao gov.ao gv.ao it.ao og.ao org.ao pb.ao aq ar bet.ar com.ar coop.ar edu.ar gob.ar gov.ar int.ar mil.ar musica.ar mutual.ar net.ar org.ar seg.ar senasa.ar tur.ar arpa e164.arpa home.arpa in-addr.arpa ip6.arpa iris.arpa uri.arpa urn.arpa as gov.as asia at ac.at sth.ac.at co.at gv.at or.at au asn.au com.au edu.au gov.au id.au net.au org.au conf.au oz.au act.au nsw.au nt.au qld.au sa.au tas.au vic.au wa.au act.edu.au catholic.edu.au nsw.edu.au nt.edu.au qld.edu.au sa.edu.au tas.edu.au vic.edu.au wa.edu.au qld.gov.au sa.gov.au tas.gov.au vic.gov.au wa.gov.au aw com.aw ax az biz.az co.az com.az edu.az gov.az info.az int.az mil.az name.az net.az org.az pp.az pro.az ba com.ba edu.ba gov.ba mil.ba net.ba org.ba bb biz.bb co.bb com.bb edu.bb gov.bb info.bb net.bb org.bb store.bb tv.bb bd ac.bd ai.bd co.bd com.bd edu.bd gov.bd id.bd info.bd it.bd mil.bd net.bd org.bd sch.bd tv.bd be ac.be bf gov.bf bg 0.bg 1.bg 2.bg 3.bg 4.bg 5.bg 6.bg 7.bg 8.bg 9.bg a.bg b.bg c.bg d.bg e.bg f.bg g.bg h.bg i.bg j.bg k.bg l.bg m.bg n.bg o.bg p.bg q.bg r.bg s.bg t.bg u.bg v.bg w.bg x.bg y.bg z.bg bh com.bh edu.bh gov.bh net.bh org.bh bi co.bi com.bi edu.bi or.bi org.bi biz bj africa.bj agro.bj architectes.bj assur.bj avocats.bj co.bj com.bj eco.bj econo.bj edu.bj info.bj loisirs.bj money.bj net.bj org.bj ote.bj restaurant.bj resto.bj tourism.bj univ.bj bm com.bm edu.bm gov.bm net.bm org.bm bn com.bn edu.bn gov.bn net.bn org.bn bo com.bo edu.bo gob.bo int.bo mil.bo net.bo org.bo tv.bo web.bo academia.bo agro.bo arte.bo blog.bo bolivia.bo ciencia.bo cooperativa.bo democracia.bo deporte.bo ecologia.bo economia.bo empresa.bo ia.bo indigena.bo industria.bo info.bo medicina.bo movimiento.bo musica.bo natural.bo nombre.bo noticias.bo patria.bo plurinacional.bo politica.bo profesional.bo pueblo.bo revista.bo salud.bo tecnologia.bo tksat.bo transporte.bo wiki.bo br 9guacu.br abc.br adm.br adv.br agr.br aju.br am.br anani.br aparecida.br api.br app.br arq.br art.br ato.br b.br barueri.br belem.br bet.br bhz.br bib.br bio.br blog.br bmd.br boavista.br bsb.br campinagrande.br campinas.br caxias.br cim.br cng.br cnt.br com.br contagem.br coop.br coz.br cri.br cuiaba.br curitiba.br def.br des.br det.br dev.br ecn.br eco.br edu.br emp.br enf.br eng.br esp.br etc.br eti.br far.br feira.br flog.br floripa.br fm.br fnd.br fortal.br fot.br foz.br fst.br g12.br geo.br ggf.br goiania.br gov.br ac.gov.br al.gov.br am.gov.br ap.gov.br ba.gov.br ce.gov.br df.gov.br es.gov.br go.gov.br ma.gov.br mg.gov.br ms.gov.br mt.gov.br pa.gov.br pb.gov.br pe.gov.br pi.gov.br pr.gov.br rj.gov.br rn.gov.br ro.gov.br rr.gov.br rs.gov.br sc.gov.br se.gov.br sp.gov.br to.gov.br gru.br ia.br imb.br ind.br inf.br jab.br jampa.br jdf.br joinville.br jor.br jus.br leg.br leilao.br lel.br log.br londrina.br macapa.br maceio.br manaus.br maringa.br mat.br med.br mil.br morena.br mp.br mus.br natal.br net.br niteroi.br *.nom.br not.br ntr.br odo.br ong.br org.br osasco.br palmas.br poa.br ppg.br pro.br psc.br psi.br pvh.br qsl.br radio.br rec.br recife.br rep.br ribeirao.br rio.br riobranco.br riopreto.br salvador.br sampa.br santamaria.br santoandre.br saobernardo.br saogonca.br seg.br sjc.br slg.br slz.br social.br sorocaba.br srv.br taxi.br tc.br tec.br teo.br the.br tmp.br trd.br tur.br tv.br udi.br vet.br vix.br vlog.br wiki.br xyz.br zlg.br bs com.bs edu.bs gov.bs net.bs org.bs bt com.bt edu.bt gov.bt net.bt org.bt bv bw ac.bw co.bw gov.bw net.bw org.bw by gov.by mil.by com.by of.by bz co.bz com.bz edu.bz gov.bz net.bz org.bz ca ab.ca bc.ca mb.ca nb.ca nf.ca nl.ca ns.ca nt.ca nu.ca on.ca pe.ca qc.ca sk.ca yk.ca gc.ca cat cc cd gov.cd cf cg ch ci ac.ci xn--aroport-bya.ci asso.ci co.ci com.ci ed.ci edu.ci go.ci gouv.ci int.ci net.ci or.ci org.ci *.ck !www.ck cl co.cl gob.cl gov.cl mil.cl cm co.cm com.cm gov.cm net.cm cn ac.cn com.cn edu.cn gov.cn mil.cn net.cn org.cn xn--55qx5d.cn xn--od0alg.cn xn--io0a7i.cn ah.cn bj.cn cq.cn fj.cn gd.cn gs.cn gx.cn gz.cn ha.cn hb.cn he.cn hi.cn hk.cn hl.cn hn.cn jl.cn js.cn jx.cn ln.cn mo.cn nm.cn nx.cn qh.cn sc.cn sd.cn sh.cn sn.cn sx.cn tj.cn tw.cn xj.cn xz.cn yn.cn zj.cn co com.co edu.co gov.co mil.co net.co nom.co org.co com coop cr ac.cr co.cr ed.cr fi.cr go.cr or.cr sa.cr cu com.cu edu.cu gob.cu inf.cu nat.cu net.cu org.cu cv com.cv edu.cv id.cv int.cv net.cv nome.cv org.cv publ.cv cw com.cw edu.cw net.cw org.cw cx gov.cx cy ac.cy biz.cy com.cy ekloges.cy gov.cy ltd.cy mil.cy net.cy org.cy press.cy pro.cy tm.cy cz gov.cz de dj dk dm co.dm com.dm edu.dm gov.dm net.dm org.dm do art.do com.do edu.do gob.do gov.do mil.do net.do org.do sld.do web.do dz art.dz asso.dz com.dz edu.dz gov.dz net.dz org.dz pol.dz soc.dz tm.dz ec abg.ec adm.ec agron.ec arqt.ec art.ec bar.ec chef.ec com.ec cont.ec cpa.ec cue.ec dent.ec dgn.ec disco.ec doc.ec edu.ec eng.ec esm.ec fin.ec fot.ec gal.ec gob.ec gov.ec gye.ec ibr.ec info.ec k12.ec lat.ec loj.ec med.ec mil.ec mktg.ec mon.ec net.ec ntr.ec odont.ec org.ec pro.ec prof.ec psic.ec psiq.ec pub.ec rio.ec rrpp.ec sal.ec tech.ec tul.ec tur.ec uio.ec vet.ec xxx.ec edu ee aip.ee com.ee edu.ee fie.ee gov.ee lib.ee med.ee org.ee pri.ee riik.ee eg ac.eg com.eg edu.eg eun.eg gov.eg info.eg me.eg mil.eg name.eg net.eg org.eg sci.eg sport.eg tv.eg *.er es com.es edu.es gob.es nom.es org.es et biz.et com.et edu.et gov.et info.et name.et net.et org.et eu fi aland.fi fj ac.fj biz.fj com.fj edu.fj gov.fj id.fj info.fj mil.fj name.fj net.fj org.fj pro.fj *.fk fm com.fm edu.fm net.fm org.fm fo fr asso.fr com.fr gouv.fr nom.fr prd.fr tm.fr avoues.fr cci.fr greta.fr huissier-justice.fr ga gb gd edu.gd gov.gd ge com.ge cyb.ge edu.ge gov.ge llc.ge net.ge online.ge org.ge pvt.ge school.ge tnx.ge gf gg co.gg net.gg org.gg gh biz.gh com.gh edu.gh gov.gh mil.gh net.gh org.gh gi com.gi edu.gi gov.gi ltd.gi mod.gi org.gi gl co.gl com.gl edu.gl net.gl org.gl gm gn ac.gn com.gn edu.gn gov.gn net.gn org.gn gov gp asso.gp com.gp edu.gp mobi.gp net.gp org.gp gq gr com.gr edu.gr gov.gr net.gr org.gr gs gt com.gt edu.gt gob.gt ind.gt mil.gt net.gt org.gt gu com.gu edu.gu gov.gu guam.gu info.gu net.gu org.gu web.gu gw gy co.gy com.gy edu.gy gov.gy net.gy org.gy hk com.hk edu.hk gov.hk idv.hk net.hk org.hk xn--ciqpn.hk xn--gmqw5a.hk xn--55qx5d.hk xn--mxtq1m.hk xn--lcvr32d.hk xn--wcvs22d.hk xn--gmq050i.hk xn--uc0atv.hk xn--uc0ay4a.hk xn--od0alg.hk xn--zf0avx.hk xn--mk0axi.hk xn--tn0ag.hk xn--od0aq3b.hk xn--io0a7i.hk hm hn com.hn edu.hn gob.hn mil.hn net.hn org.hn hr com.hr from.hr iz.hr name.hr ht adult.ht art.ht asso.ht com.ht coop.ht edu.ht firm.ht gouv.ht info.ht med.ht net.ht org.ht perso.ht pol.ht pro.ht rel.ht shop.ht hu 2000.hu agrar.hu bolt.hu casino.hu city.hu co.hu erotica.hu erotika.hu film.hu forum.hu games.hu hotel.hu info.hu ingatlan.hu jogasz.hu konyvelo.hu lakas.hu media.hu news.hu org.hu priv.hu reklam.hu sex.hu shop.hu sport.hu suli.hu szex.hu tm.hu tozsde.hu utazas.hu video.hu id ac.id ai.id biz.id co.id desa.id go.id kop.id mil.id my.id net.id or.id ponpes.id sch.id web.id xn--9tfky.id ie gov.ie il ac.il co.il gov.il idf.il k12.il muni.il net.il org.il xn--4dbrk0ce xn--4dbgdty6c.xn--4dbrk0ce xn--5dbhl8d.xn--4dbrk0ce xn--8dbq2a.xn--4dbrk0ce xn--hebda8b.xn--4dbrk0ce im ac.im co.im ltd.co.im plc.co.im com.im net.im org.im tt.im tv.im in 5g.in 6g.in ac.in aero.in ai.in alumni.in am.in bank.in bihar.in biz.in business.in ca.in cn.in co.in com.in coop.in cs.in delhi.in dr.in edu.in er.in fin.in firm.in gen.in gov.in gujarat.in ind.in info.in int.in internet.in io.in me.in mil.in net.in nic.in org.in pg.in post.in pro.in res.in school.in travel.in tv.in ub.in uk.in up.in us.in info int eu.int io co.io com.io edu.io gov.io mil.io net.io nom.io org.io iq com.iq edu.iq gov.iq mil.iq net.iq org.iq ir ac.ir co.ir gov.ir id.ir net.ir org.ir sch.ir xn--mgba3a4f16a.ir xn--mgba3a4fra.ir is it edu.it gov.it abr.it abruzzo.it aosta-valley.it aostavalley.it bas.it basilicata.it cal.it calabria.it cam.it campania.it emilia-romagna.it emiliaromagna.it emr.it friuli-v-giulia.it friuli-ve-giulia.it friuli-vegiulia.it friuli-venezia-giulia.it friuli-veneziagiulia.it friuli-vgiulia.it friuliv-giulia.it friulive-giulia.it friulivegiulia.it friulivenezia-giulia.it friuliveneziagiulia.it friulivgiulia.it fvg.it laz.it lazio.it lig.it liguria.it lom.it lombardia.it lombardy.it lucania.it mar.it marche.it mol.it molise.it piedmont.it piemonte.it pmn.it pug.it puglia.it sar.it sardegna.it sardinia.it sic.it sicilia.it sicily.it taa.it tos.it toscana.it trentin-sud-tirol.it xn--trentin-sd-tirol-rzb.it trentin-sudtirol.it xn--trentin-sdtirol-7vb.it trentin-sued-tirol.it trentin-suedtirol.it trentino-a-adige.it trentino-aadige.it trentino-alto-adige.it trentino-altoadige.it trentino-s-tirol.it trentino-stirol.it trentino-sud-tirol.it xn--trentino-sd-tirol-c3b.it trentino-sudtirol.it xn--trentino-sdtirol-szb.it trentino-sued-tirol.it trentino-suedtirol.it trentinoa-adige.it trentinoaadige.it trentinoalto-adige.it trentinoaltoadige.it trentinos-tirol.it trentinostirol.it trentinosud-tirol.it xn--trentinosd-tirol-rzb.it xn--trentinosdtirol-7vb.it trentinosued-tirol.it trentinosuedtirol.it trentinsud-tirol.it xn--trentinsd-tirol-6vb.it trentinsudtirol.it xn--trentinsdtirol-nsb.it trentinsued-tirol.it trentinsuedtirol.it tuscany.it umb.it umbria.it val-d-aosta.it val-daosta.it vald-aosta.it valle-aosta.it valle-d-aosta.it valle-daosta.it valleaosta.it valled-aosta.it valledaosta.it vallee-aoste.it xn--valle-aoste-ebb.it vallee-d-aoste.it xn--valle-d-aoste-ehb.it valleeaoste.it xn--valleaoste-e7a.it valleedaoste.it xn--valledaoste-ebb.it vao.it vda.it ven.it veneto.it ag.it agrigento.it al.it alessandria.it alto-adige.it altoadige.it an.it ancona.it andria-barletta-trani.it andria-trani-barletta.it andriabarlettatrani.it andriatranibarletta.it ao.it aosta.it aoste.it ap.it aq.it ar.it arezzo.it ascoli-piceno.it ascolipiceno.it asti.it at.it av.it avellino.it ba.it balsan.it balsan-sudtirol.it xn--balsan-sdtirol-nsb.it balsan-suedtirol.it bari.it barletta-trani-andria.it barlettatraniandria.it belluno.it benevento.it bergamo.it bg.it bi.it biella.it bl.it bn.it bo.it bologna.it bolzano.it bolzano-altoadige.it bozen.it bozen-sudtirol.it xn--bozen-sdtirol-2ob.it bozen-suedtirol.it br.it brescia.it brindisi.it bs.it bt.it bulsan.it bulsan-sudtirol.it xn--bulsan-sdtirol-nsb.it bulsan-suedtirol.it bz.it ca.it cagliari.it caltanissetta.it campidano-medio.it campidanomedio.it campobasso.it carbonia-iglesias.it carboniaiglesias.it carrara-massa.it carraramassa.it caserta.it catania.it catanzaro.it cb.it ce.it cesena-forli.it xn--cesena-forl-mcb.it cesenaforli.it xn--cesenaforl-i8a.it ch.it chieti.it ci.it cl.it cn.it co.it como.it cosenza.it cr.it cremona.it crotone.it cs.it ct.it cuneo.it cz.it dell-ogliastra.it dellogliastra.it en.it enna.it fc.it fe.it fermo.it ferrara.it fg.it fi.it firenze.it florence.it fm.it foggia.it forli-cesena.it xn--forl-cesena-fcb.it forlicesena.it xn--forlcesena-c8a.it fr.it frosinone.it ge.it genoa.it genova.it go.it gorizia.it gr.it grosseto.it iglesias-carbonia.it iglesiascarbonia.it im.it imperia.it is.it isernia.it kr.it la-spezia.it laquila.it laspezia.it latina.it lc.it le.it lecce.it lecco.it li.it livorno.it lo.it lodi.it lt.it lu.it lucca.it macerata.it mantova.it massa-carrara.it massacarrara.it matera.it mb.it mc.it me.it medio-campidano.it mediocampidano.it messina.it mi.it milan.it milano.it mn.it mo.it modena.it monza.it monza-brianza.it monza-e-della-brianza.it monzabrianza.it monzaebrianza.it monzaedellabrianza.it ms.it mt.it na.it naples.it napoli.it no.it novara.it nu.it nuoro.it og.it ogliastra.it olbia-tempio.it olbiatempio.it or.it oristano.it ot.it pa.it padova.it padua.it palermo.it parma.it pavia.it pc.it pd.it pe.it perugia.it pesaro-urbino.it pesarourbino.it pescara.it pg.it pi.it piacenza.it pisa.it pistoia.it pn.it po.it pordenone.it potenza.it pr.it prato.it pt.it pu.it pv.it pz.it ra.it ragusa.it ravenna.it rc.it re.it reggio-calabria.it reggio-emilia.it reggiocalabria.it reggioemilia.it rg.it ri.it rieti.it rimini.it rm.it rn.it ro.it roma.it rome.it rovigo.it sa.it salerno.it sassari.it savona.it si.it siena.it siracusa.it so.it sondrio.it sp.it sr.it ss.it su.it sud-sardegna.it sudsardegna.it xn--sdtirol-n2a.it suedtirol.it sv.it ta.it taranto.it te.it tempio-olbia.it tempioolbia.it teramo.it terni.it tn.it to.it torino.it tp.it tr.it trani-andria-barletta.it trani-barletta-andria.it traniandriabarletta.it tranibarlettaandria.it trapani.it trentino.it trento.it treviso.it trieste.it ts.it turin.it tv.it ud.it udine.it urbino-pesaro.it urbinopesaro.it va.it varese.it vb.it vc.it ve.it venezia.it venice.it verbania.it verbano-cusio-ossola.it vercelli.it verona.it vi.it vibo-valentia.it vibovalentia.it vicenza.it viterbo.it vr.it vs.it vt.it vv.it je co.je net.je org.je *.jm jo agri.jo ai.jo com.jo edu.jo eng.jo fm.jo gov.jo mil.jo net.jo org.jo per.jo phd.jo sch.jo tv.jo jobs jp ac.jp ad.jp co.jp ed.jp go.jp gr.jp lg.jp ne.jp or.jp aichi.jp akita.jp aomori.jp chiba.jp ehime.jp fukui.jp fukuoka.jp fukushima.jp gifu.jp gunma.jp hiroshima.jp hokkaido.jp hyogo.jp ibaraki.jp ishikawa.jp iwate.jp kagawa.jp kagoshima.jp kanagawa.jp kochi.jp kumamoto.jp kyoto.jp mie.jp miyagi.jp miyazaki.jp nagano.jp nagasaki.jp nara.jp niigata.jp oita.jp okayama.jp okinawa.jp osaka.jp saga.jp saitama.jp shiga.jp shimane.jp shizuoka.jp tochigi.jp tokushima.jp tokyo.jp tottori.jp toyama.jp wakayama.jp yamagata.jp yamaguchi.jp yamanashi.jp xn--ehqz56n.jp xn--1lqs03n.jp xn--qqqt11m.jp xn--f6qx53a.jp xn--djrs72d6uy.jp xn--mkru45i.jp xn--0trq7p7nn.jp xn--5js045d.jp xn--kbrq7o.jp xn--pssu33l.jp xn--ntsq17g.jp xn--uisz3g.jp xn--6btw5a.jp xn--1ctwo.jp xn--6orx2r.jp xn--rht61e.jp xn--rht27z.jp xn--nit225k.jp xn--rht3d.jp xn--djty4k.jp xn--klty5x.jp xn--kltx9a.jp xn--kltp7d.jp xn--c3s14m.jp xn--vgu402c.jp xn--efvn9s.jp xn--1lqs71d.jp xn--4pvxs.jp xn--uuwu58a.jp xn--zbx025d.jp xn--8pvr4u.jp xn--5rtp49c.jp xn--ntso0iqx3a.jp xn--elqq16h.jp xn--4it168d.jp xn--klt787d.jp xn--rny31h.jp xn--7t0a264c.jp xn--uist22h.jp xn--8ltr62k.jp xn--2m4a15e.jp xn--32vp30h.jp xn--4it797k.jp xn--5rtq34k.jp xn--k7yn95e.jp xn--tor131o.jp xn--d5qv7z876c.jp *.kawasaki.jp !city.kawasaki.jp *.kitakyushu.jp !city.kitakyushu.jp *.kobe.jp !city.kobe.jp *.nagoya.jp !city.nagoya.jp *.sapporo.jp !city.sapporo.jp *.sendai.jp !city.sendai.jp *.yokohama.jp !city.yokohama.jp aisai.aichi.jp ama.aichi.jp anjo.aichi.jp asuke.aichi.jp chiryu.aichi.jp chita.aichi.jp fuso.aichi.jp gamagori.aichi.jp handa.aichi.jp hazu.aichi.jp hekinan.aichi.jp higashiura.aichi.jp ichinomiya.aichi.jp inazawa.aichi.jp inuyama.aichi.jp isshiki.aichi.jp iwakura.aichi.jp kanie.aichi.jp kariya.aichi.jp kasugai.aichi.jp kira.aichi.jp kiyosu.aichi.jp komaki.aichi.jp konan.aichi.jp kota.aichi.jp mihama.aichi.jp miyoshi.aichi.jp nishio.aichi.jp nisshin.aichi.jp obu.aichi.jp oguchi.aichi.jp oharu.aichi.jp okazaki.aichi.jp owariasahi.aichi.jp seto.aichi.jp shikatsu.aichi.jp shinshiro.aichi.jp shitara.aichi.jp tahara.aichi.jp takahama.aichi.jp tobishima.aichi.jp toei.aichi.jp togo.aichi.jp tokai.aichi.jp tokoname.aichi.jp toyoake.aichi.jp toyohashi.aichi.jp toyokawa.aichi.jp toyone.aichi.jp toyota.aichi.jp tsushima.aichi.jp yatomi.aichi.jp akita.akita.jp daisen.akita.jp fujisato.akita.jp gojome.akita.jp hachirogata.akita.jp happou.akita.jp higashinaruse.akita.jp honjo.akita.jp honjyo.akita.jp ikawa.akita.jp kamikoani.akita.jp kamioka.akita.jp katagami.akita.jp kazuno.akita.jp kitaakita.akita.jp kosaka.akita.jp kyowa.akita.jp misato.akita.jp mitane.akita.jp moriyoshi.akita.jp nikaho.akita.jp noshiro.akita.jp odate.akita.jp oga.akita.jp ogata.akita.jp semboku.akita.jp yokote.akita.jp yurihonjo.akita.jp aomori.aomori.jp gonohe.aomori.jp hachinohe.aomori.jp hashikami.aomori.jp hiranai.aomori.jp hirosaki.aomori.jp itayanagi.aomori.jp kuroishi.aomori.jp misawa.aomori.jp mutsu.aomori.jp nakadomari.aomori.jp noheji.aomori.jp oirase.aomori.jp owani.aomori.jp rokunohe.aomori.jp sannohe.aomori.jp shichinohe.aomori.jp shingo.aomori.jp takko.aomori.jp towada.aomori.jp tsugaru.aomori.jp tsuruta.aomori.jp abiko.chiba.jp asahi.chiba.jp chonan.chiba.jp chosei.chiba.jp choshi.chiba.jp chuo.chiba.jp funabashi.chiba.jp futtsu.chiba.jp hanamigawa.chiba.jp ichihara.chiba.jp ichikawa.chiba.jp ichinomiya.chiba.jp inzai.chiba.jp isumi.chiba.jp kamagaya.chiba.jp kamogawa.chiba.jp kashiwa.chiba.jp katori.chiba.jp katsuura.chiba.jp kimitsu.chiba.jp kisarazu.chiba.jp kozaki.chiba.jp kujukuri.chiba.jp kyonan.chiba.jp matsudo.chiba.jp midori.chiba.jp mihama.chiba.jp minamiboso.chiba.jp mobara.chiba.jp mutsuzawa.chiba.jp nagara.chiba.jp nagareyama.chiba.jp narashino.chiba.jp narita.chiba.jp noda.chiba.jp oamishirasato.chiba.jp omigawa.chiba.jp onjuku.chiba.jp otaki.chiba.jp sakae.chiba.jp sakura.chiba.jp shimofusa.chiba.jp shirako.chiba.jp shiroi.chiba.jp shisui.chiba.jp sodegaura.chiba.jp sosa.chiba.jp tako.chiba.jp tateyama.chiba.jp togane.chiba.jp tohnosho.chiba.jp tomisato.chiba.jp urayasu.chiba.jp yachimata.chiba.jp yachiyo.chiba.jp yokaichiba.chiba.jp yokoshibahikari.chiba.jp yotsukaido.chiba.jp ainan.ehime.jp honai.ehime.jp ikata.ehime.jp imabari.ehime.jp iyo.ehime.jp kamijima.ehime.jp kihoku.ehime.jp kumakogen.ehime.jp masaki.ehime.jp matsuno.ehime.jp matsuyama.ehime.jp namikata.ehime.jp niihama.ehime.jp ozu.ehime.jp saijo.ehime.jp seiyo.ehime.jp shikokuchuo.ehime.jp tobe.ehime.jp toon.ehime.jp uchiko.ehime.jp uwajima.ehime.jp yawatahama.ehime.jp echizen.fukui.jp eiheiji.fukui.jp fukui.fukui.jp ikeda.fukui.jp katsuyama.fukui.jp mihama.fukui.jp minamiechizen.fukui.jp obama.fukui.jp ohi.fukui.jp ono.fukui.jp sabae.fukui.jp sakai.fukui.jp takahama.fukui.jp tsuruga.fukui.jp wakasa.fukui.jp ashiya.fukuoka.jp buzen.fukuoka.jp chikugo.fukuoka.jp chikuho.fukuoka.jp chikujo.fukuoka.jp chikushino.fukuoka.jp chikuzen.fukuoka.jp chuo.fukuoka.jp dazaifu.fukuoka.jp fukuchi.fukuoka.jp hakata.fukuoka.jp higashi.fukuoka.jp hirokawa.fukuoka.jp hisayama.fukuoka.jp iizuka.fukuoka.jp inatsuki.fukuoka.jp kaho.fukuoka.jp kasuga.fukuoka.jp kasuya.fukuoka.jp kawara.fukuoka.jp keisen.fukuoka.jp koga.fukuoka.jp kurate.fukuoka.jp kurogi.fukuoka.jp kurume.fukuoka.jp minami.fukuoka.jp miyako.fukuoka.jp miyama.fukuoka.jp miyawaka.fukuoka.jp mizumaki.fukuoka.jp munakata.fukuoka.jp nakagawa.fukuoka.jp nakama.fukuoka.jp nishi.fukuoka.jp nogata.fukuoka.jp ogori.fukuoka.jp okagaki.fukuoka.jp okawa.fukuoka.jp oki.fukuoka.jp omuta.fukuoka.jp onga.fukuoka.jp onojo.fukuoka.jp oto.fukuoka.jp saigawa.fukuoka.jp sasaguri.fukuoka.jp shingu.fukuoka.jp shinyoshitomi.fukuoka.jp shonai.fukuoka.jp soeda.fukuoka.jp sue.fukuoka.jp tachiarai.fukuoka.jp tagawa.fukuoka.jp takata.fukuoka.jp toho.fukuoka.jp toyotsu.fukuoka.jp tsuiki.fukuoka.jp ukiha.fukuoka.jp umi.fukuoka.jp usui.fukuoka.jp yamada.fukuoka.jp yame.fukuoka.jp yanagawa.fukuoka.jp yukuhashi.fukuoka.jp aizubange.fukushima.jp aizumisato.fukushima.jp aizuwakamatsu.fukushima.jp asakawa.fukushima.jp bandai.fukushima.jp date.fukushima.jp fukushima.fukushima.jp furudono.fukushima.jp futaba.fukushima.jp hanawa.fukushima.jp higashi.fukushima.jp hirata.fukushima.jp hirono.fukushima.jp iitate.fukushima.jp inawashiro.fukushima.jp ishikawa.fukushima.jp iwaki.fukushima.jp izumizaki.fukushima.jp kagamiishi.fukushima.jp kaneyama.fukushima.jp kawamata.fukushima.jp kitakata.fukushima.jp kitashiobara.fukushima.jp koori.fukushima.jp koriyama.fukushima.jp kunimi.fukushima.jp miharu.fukushima.jp mishima.fukushima.jp namie.fukushima.jp nango.fukushima.jp nishiaizu.fukushima.jp nishigo.fukushima.jp okuma.fukushima.jp omotego.fukushima.jp ono.fukushima.jp otama.fukushima.jp samegawa.fukushima.jp shimogo.fukushima.jp shirakawa.fukushima.jp showa.fukushima.jp soma.fukushima.jp sukagawa.fukushima.jp taishin.fukushima.jp tamakawa.fukushima.jp tanagura.fukushima.jp tenei.fukushima.jp yabuki.fukushima.jp yamato.fukushima.jp yamatsuri.fukushima.jp yanaizu.fukushima.jp yugawa.fukushima.jp anpachi.gifu.jp ena.gifu.jp gifu.gifu.jp ginan.gifu.jp godo.gifu.jp gujo.gifu.jp hashima.gifu.jp hichiso.gifu.jp hida.gifu.jp higashishirakawa.gifu.jp ibigawa.gifu.jp ikeda.gifu.jp kakamigahara.gifu.jp kani.gifu.jp kasahara.gifu.jp kasamatsu.gifu.jp kawaue.gifu.jp kitagata.gifu.jp mino.gifu.jp minokamo.gifu.jp mitake.gifu.jp mizunami.gifu.jp motosu.gifu.jp nakatsugawa.gifu.jp ogaki.gifu.jp sakahogi.gifu.jp seki.gifu.jp sekigahara.gifu.jp shirakawa.gifu.jp tajimi.gifu.jp takayama.gifu.jp tarui.gifu.jp toki.gifu.jp tomika.gifu.jp wanouchi.gifu.jp yamagata.gifu.jp yaotsu.gifu.jp yoro.gifu.jp annaka.gunma.jp chiyoda.gunma.jp fujioka.gunma.jp higashiagatsuma.gunma.jp isesaki.gunma.jp itakura.gunma.jp kanna.gunma.jp kanra.gunma.jp katashina.gunma.jp kawaba.gunma.jp kiryu.gunma.jp kusatsu.gunma.jp maebashi.gunma.jp meiwa.gunma.jp midori.gunma.jp minakami.gunma.jp naganohara.gunma.jp nakanojo.gunma.jp nanmoku.gunma.jp numata.gunma.jp oizumi.gunma.jp ora.gunma.jp ota.gunma.jp shibukawa.gunma.jp shimonita.gunma.jp shinto.gunma.jp showa.gunma.jp takasaki.gunma.jp takayama.gunma.jp tamamura.gunma.jp tatebayashi.gunma.jp tomioka.gunma.jp tsukiyono.gunma.jp tsumagoi.gunma.jp ueno.gunma.jp yoshioka.gunma.jp asaminami.hiroshima.jp daiwa.hiroshima.jp etajima.hiroshima.jp fuchu.hiroshima.jp fukuyama.hiroshima.jp hatsukaichi.hiroshima.jp higashihiroshima.hiroshima.jp hongo.hiroshima.jp jinsekikogen.hiroshima.jp kaita.hiroshima.jp kui.hiroshima.jp kumano.hiroshima.jp kure.hiroshima.jp mihara.hiroshima.jp miyoshi.hiroshima.jp naka.hiroshima.jp onomichi.hiroshima.jp osakikamijima.hiroshima.jp otake.hiroshima.jp saka.hiroshima.jp sera.hiroshima.jp seranishi.hiroshima.jp shinichi.hiroshima.jp shobara.hiroshima.jp takehara.hiroshima.jp abashiri.hokkaido.jp abira.hokkaido.jp aibetsu.hokkaido.jp akabira.hokkaido.jp akkeshi.hokkaido.jp asahikawa.hokkaido.jp ashibetsu.hokkaido.jp ashoro.hokkaido.jp assabu.hokkaido.jp atsuma.hokkaido.jp bibai.hokkaido.jp biei.hokkaido.jp bifuka.hokkaido.jp bihoro.hokkaido.jp biratori.hokkaido.jp chippubetsu.hokkaido.jp chitose.hokkaido.jp date.hokkaido.jp ebetsu.hokkaido.jp embetsu.hokkaido.jp eniwa.hokkaido.jp erimo.hokkaido.jp esan.hokkaido.jp esashi.hokkaido.jp fukagawa.hokkaido.jp fukushima.hokkaido.jp furano.hokkaido.jp furubira.hokkaido.jp haboro.hokkaido.jp hakodate.hokkaido.jp hamatonbetsu.hokkaido.jp hidaka.hokkaido.jp higashikagura.hokkaido.jp higashikawa.hokkaido.jp hiroo.hokkaido.jp hokuryu.hokkaido.jp hokuto.hokkaido.jp honbetsu.hokkaido.jp horokanai.hokkaido.jp horonobe.hokkaido.jp ikeda.hokkaido.jp imakane.hokkaido.jp ishikari.hokkaido.jp iwamizawa.hokkaido.jp iwanai.hokkaido.jp kamifurano.hokkaido.jp kamikawa.hokkaido.jp kamishihoro.hokkaido.jp kamisunagawa.hokkaido.jp kamoenai.hokkaido.jp kayabe.hokkaido.jp kembuchi.hokkaido.jp kikonai.hokkaido.jp kimobetsu.hokkaido.jp kitahiroshima.hokkaido.jp kitami.hokkaido.jp kiyosato.hokkaido.jp koshimizu.hokkaido.jp kunneppu.hokkaido.jp kuriyama.hokkaido.jp kuromatsunai.hokkaido.jp kushiro.hokkaido.jp kutchan.hokkaido.jp kyowa.hokkaido.jp mashike.hokkaido.jp matsumae.hokkaido.jp mikasa.hokkaido.jp minamifurano.hokkaido.jp mombetsu.hokkaido.jp moseushi.hokkaido.jp mukawa.hokkaido.jp muroran.hokkaido.jp naie.hokkaido.jp nakagawa.hokkaido.jp nakasatsunai.hokkaido.jp nakatombetsu.hokkaido.jp nanae.hokkaido.jp nanporo.hokkaido.jp nayoro.hokkaido.jp nemuro.hokkaido.jp niikappu.hokkaido.jp niki.hokkaido.jp nishiokoppe.hokkaido.jp noboribetsu.hokkaido.jp numata.hokkaido.jp obihiro.hokkaido.jp obira.hokkaido.jp oketo.hokkaido.jp okoppe.hokkaido.jp otaru.hokkaido.jp otobe.hokkaido.jp otofuke.hokkaido.jp otoineppu.hokkaido.jp oumu.hokkaido.jp ozora.hokkaido.jp pippu.hokkaido.jp rankoshi.hokkaido.jp rebun.hokkaido.jp rikubetsu.hokkaido.jp rishiri.hokkaido.jp rishirifuji.hokkaido.jp saroma.hokkaido.jp sarufutsu.hokkaido.jp shakotan.hokkaido.jp shari.hokkaido.jp shibecha.hokkaido.jp shibetsu.hokkaido.jp shikabe.hokkaido.jp shikaoi.hokkaido.jp shimamaki.hokkaido.jp shimizu.hokkaido.jp shimokawa.hokkaido.jp shinshinotsu.hokkaido.jp shintoku.hokkaido.jp shiranuka.hokkaido.jp shiraoi.hokkaido.jp shiriuchi.hokkaido.jp sobetsu.hokkaido.jp sunagawa.hokkaido.jp taiki.hokkaido.jp takasu.hokkaido.jp takikawa.hokkaido.jp takinoue.hokkaido.jp teshikaga.hokkaido.jp tobetsu.hokkaido.jp tohma.hokkaido.jp tomakomai.hokkaido.jp tomari.hokkaido.jp toya.hokkaido.jp toyako.hokkaido.jp toyotomi.hokkaido.jp toyoura.hokkaido.jp tsubetsu.hokkaido.jp tsukigata.hokkaido.jp urakawa.hokkaido.jp urausu.hokkaido.jp uryu.hokkaido.jp utashinai.hokkaido.jp wakkanai.hokkaido.jp wassamu.hokkaido.jp yakumo.hokkaido.jp yoichi.hokkaido.jp aioi.hyogo.jp akashi.hyogo.jp ako.hyogo.jp amagasaki.hyogo.jp aogaki.hyogo.jp asago.hyogo.jp ashiya.hyogo.jp awaji.hyogo.jp fukusaki.hyogo.jp goshiki.hyogo.jp harima.hyogo.jp himeji.hyogo.jp ichikawa.hyogo.jp inagawa.hyogo.jp itami.hyogo.jp kakogawa.hyogo.jp kamigori.hyogo.jp kamikawa.hyogo.jp kasai.hyogo.jp kasuga.hyogo.jp kawanishi.hyogo.jp miki.hyogo.jp minamiawaji.hyogo.jp nishinomiya.hyogo.jp nishiwaki.hyogo.jp ono.hyogo.jp sanda.hyogo.jp sannan.hyogo.jp sasayama.hyogo.jp sayo.hyogo.jp shingu.hyogo.jp shinonsen.hyogo.jp shiso.hyogo.jp sumoto.hyogo.jp taishi.hyogo.jp taka.hyogo.jp takarazuka.hyogo.jp takasago.hyogo.jp takino.hyogo.jp tamba.hyogo.jp tatsuno.hyogo.jp toyooka.hyogo.jp yabu.hyogo.jp yashiro.hyogo.jp yoka.hyogo.jp yokawa.hyogo.jp ami.ibaraki.jp asahi.ibaraki.jp bando.ibaraki.jp chikusei.ibaraki.jp daigo.ibaraki.jp fujishiro.ibaraki.jp hitachi.ibaraki.jp hitachinaka.ibaraki.jp hitachiomiya.ibaraki.jp hitachiota.ibaraki.jp ibaraki.ibaraki.jp ina.ibaraki.jp inashiki.ibaraki.jp itako.ibaraki.jp iwama.ibaraki.jp joso.ibaraki.jp kamisu.ibaraki.jp kasama.ibaraki.jp kashima.ibaraki.jp kasumigaura.ibaraki.jp koga.ibaraki.jp miho.ibaraki.jp mito.ibaraki.jp moriya.ibaraki.jp naka.ibaraki.jp namegata.ibaraki.jp oarai.ibaraki.jp ogawa.ibaraki.jp omitama.ibaraki.jp ryugasaki.ibaraki.jp sakai.ibaraki.jp sakuragawa.ibaraki.jp shimodate.ibaraki.jp shimotsuma.ibaraki.jp shirosato.ibaraki.jp sowa.ibaraki.jp suifu.ibaraki.jp takahagi.ibaraki.jp tamatsukuri.ibaraki.jp tokai.ibaraki.jp tomobe.ibaraki.jp tone.ibaraki.jp toride.ibaraki.jp tsuchiura.ibaraki.jp tsukuba.ibaraki.jp uchihara.ibaraki.jp ushiku.ibaraki.jp yachiyo.ibaraki.jp yamagata.ibaraki.jp yawara.ibaraki.jp yuki.ibaraki.jp anamizu.ishikawa.jp hakui.ishikawa.jp hakusan.ishikawa.jp kaga.ishikawa.jp kahoku.ishikawa.jp kanazawa.ishikawa.jp kawakita.ishikawa.jp komatsu.ishikawa.jp nakanoto.ishikawa.jp nanao.ishikawa.jp nomi.ishikawa.jp nonoichi.ishikawa.jp noto.ishikawa.jp shika.ishikawa.jp suzu.ishikawa.jp tsubata.ishikawa.jp tsurugi.ishikawa.jp uchinada.ishikawa.jp wajima.ishikawa.jp fudai.iwate.jp fujisawa.iwate.jp hanamaki.iwate.jp hiraizumi.iwate.jp hirono.iwate.jp ichinohe.iwate.jp ichinoseki.iwate.jp iwaizumi.iwate.jp iwate.iwate.jp joboji.iwate.jp kamaishi.iwate.jp kanegasaki.iwate.jp karumai.iwate.jp kawai.iwate.jp kitakami.iwate.jp kuji.iwate.jp kunohe.iwate.jp kuzumaki.iwate.jp miyako.iwate.jp mizusawa.iwate.jp morioka.iwate.jp ninohe.iwate.jp noda.iwate.jp ofunato.iwate.jp oshu.iwate.jp otsuchi.iwate.jp rikuzentakata.iwate.jp shiwa.iwate.jp shizukuishi.iwate.jp sumita.iwate.jp tanohata.iwate.jp tono.iwate.jp yahaba.iwate.jp yamada.iwate.jp ayagawa.kagawa.jp higashikagawa.kagawa.jp kanonji.kagawa.jp kotohira.kagawa.jp manno.kagawa.jp marugame.kagawa.jp mitoyo.kagawa.jp naoshima.kagawa.jp sanuki.kagawa.jp tadotsu.kagawa.jp takamatsu.kagawa.jp tonosho.kagawa.jp uchinomi.kagawa.jp utazu.kagawa.jp zentsuji.kagawa.jp akune.kagoshima.jp amami.kagoshima.jp hioki.kagoshima.jp isa.kagoshima.jp isen.kagoshima.jp izumi.kagoshima.jp kagoshima.kagoshima.jp kanoya.kagoshima.jp kawanabe.kagoshima.jp kinko.kagoshima.jp kouyama.kagoshima.jp makurazaki.kagoshima.jp matsumoto.kagoshima.jp minamitane.kagoshima.jp nakatane.kagoshima.jp nishinoomote.kagoshima.jp satsumasendai.kagoshima.jp soo.kagoshima.jp tarumizu.kagoshima.jp yusui.kagoshima.jp aikawa.kanagawa.jp atsugi.kanagawa.jp ayase.kanagawa.jp chigasaki.kanagawa.jp ebina.kanagawa.jp fujisawa.kanagawa.jp hadano.kanagawa.jp hakone.kanagawa.jp hiratsuka.kanagawa.jp isehara.kanagawa.jp kaisei.kanagawa.jp kamakura.kanagawa.jp kiyokawa.kanagawa.jp matsuda.kanagawa.jp minamiashigara.kanagawa.jp miura.kanagawa.jp nakai.kanagawa.jp ninomiya.kanagawa.jp odawara.kanagawa.jp oi.kanagawa.jp oiso.kanagawa.jp sagamihara.kanagawa.jp samukawa.kanagawa.jp tsukui.kanagawa.jp yamakita.kanagawa.jp yamato.kanagawa.jp yokosuka.kanagawa.jp yugawara.kanagawa.jp zama.kanagawa.jp zushi.kanagawa.jp aki.kochi.jp geisei.kochi.jp hidaka.kochi.jp higashitsuno.kochi.jp ino.kochi.jp kagami.kochi.jp kami.kochi.jp kitagawa.kochi.jp kochi.kochi.jp mihara.kochi.jp motoyama.kochi.jp muroto.kochi.jp nahari.kochi.jp nakamura.kochi.jp nankoku.kochi.jp nishitosa.kochi.jp niyodogawa.kochi.jp ochi.kochi.jp okawa.kochi.jp otoyo.kochi.jp otsuki.kochi.jp sakawa.kochi.jp sukumo.kochi.jp susaki.kochi.jp tosa.kochi.jp tosashimizu.kochi.jp toyo.kochi.jp tsuno.kochi.jp umaji.kochi.jp yasuda.kochi.jp yusuhara.kochi.jp amakusa.kumamoto.jp arao.kumamoto.jp aso.kumamoto.jp choyo.kumamoto.jp gyokuto.kumamoto.jp kamiamakusa.kumamoto.jp kikuchi.kumamoto.jp kumamoto.kumamoto.jp mashiki.kumamoto.jp mifune.kumamoto.jp minamata.kumamoto.jp minamioguni.kumamoto.jp nagasu.kumamoto.jp nishihara.kumamoto.jp oguni.kumamoto.jp ozu.kumamoto.jp sumoto.kumamoto.jp takamori.kumamoto.jp uki.kumamoto.jp uto.kumamoto.jp yamaga.kumamoto.jp yamato.kumamoto.jp yatsushiro.kumamoto.jp ayabe.kyoto.jp fukuchiyama.kyoto.jp higashiyama.kyoto.jp ide.kyoto.jp ine.kyoto.jp joyo.kyoto.jp kameoka.kyoto.jp kamo.kyoto.jp kita.kyoto.jp kizu.kyoto.jp kumiyama.kyoto.jp kyotamba.kyoto.jp kyotanabe.kyoto.jp kyotango.kyoto.jp maizuru.kyoto.jp minami.kyoto.jp minamiyamashiro.kyoto.jp miyazu.kyoto.jp muko.kyoto.jp nagaokakyo.kyoto.jp nakagyo.kyoto.jp nantan.kyoto.jp oyamazaki.kyoto.jp sakyo.kyoto.jp seika.kyoto.jp tanabe.kyoto.jp uji.kyoto.jp ujitawara.kyoto.jp wazuka.kyoto.jp yamashina.kyoto.jp yawata.kyoto.jp asahi.mie.jp inabe.mie.jp ise.mie.jp kameyama.mie.jp kawagoe.mie.jp kiho.mie.jp kisosaki.mie.jp kiwa.mie.jp komono.mie.jp kumano.mie.jp kuwana.mie.jp matsusaka.mie.jp meiwa.mie.jp mihama.mie.jp minamiise.mie.jp misugi.mie.jp miyama.mie.jp nabari.mie.jp shima.mie.jp suzuka.mie.jp tado.mie.jp taiki.mie.jp taki.mie.jp tamaki.mie.jp toba.mie.jp tsu.mie.jp udono.mie.jp ureshino.mie.jp watarai.mie.jp yokkaichi.mie.jp furukawa.miyagi.jp higashimatsushima.miyagi.jp ishinomaki.miyagi.jp iwanuma.miyagi.jp kakuda.miyagi.jp kami.miyagi.jp kawasaki.miyagi.jp marumori.miyagi.jp matsushima.miyagi.jp minamisanriku.miyagi.jp misato.miyagi.jp murata.miyagi.jp natori.miyagi.jp ogawara.miyagi.jp ohira.miyagi.jp onagawa.miyagi.jp osaki.miyagi.jp rifu.miyagi.jp semine.miyagi.jp shibata.miyagi.jp shichikashuku.miyagi.jp shikama.miyagi.jp shiogama.miyagi.jp shiroishi.miyagi.jp tagajo.miyagi.jp taiwa.miyagi.jp tome.miyagi.jp tomiya.miyagi.jp wakuya.miyagi.jp watari.miyagi.jp yamamoto.miyagi.jp zao.miyagi.jp aya.miyazaki.jp ebino.miyazaki.jp gokase.miyazaki.jp hyuga.miyazaki.jp kadogawa.miyazaki.jp kawaminami.miyazaki.jp kijo.miyazaki.jp kitagawa.miyazaki.jp kitakata.miyazaki.jp kitaura.miyazaki.jp kobayashi.miyazaki.jp kunitomi.miyazaki.jp kushima.miyazaki.jp mimata.miyazaki.jp miyakonojo.miyazaki.jp miyazaki.miyazaki.jp morotsuka.miyazaki.jp nichinan.miyazaki.jp nishimera.miyazaki.jp nobeoka.miyazaki.jp saito.miyazaki.jp shiiba.miyazaki.jp shintomi.miyazaki.jp takaharu.miyazaki.jp takanabe.miyazaki.jp takazaki.miyazaki.jp tsuno.miyazaki.jp achi.nagano.jp agematsu.nagano.jp anan.nagano.jp aoki.nagano.jp asahi.nagano.jp azumino.nagano.jp chikuhoku.nagano.jp chikuma.nagano.jp chino.nagano.jp fujimi.nagano.jp hakuba.nagano.jp hara.nagano.jp hiraya.nagano.jp iida.nagano.jp iijima.nagano.jp iiyama.nagano.jp iizuna.nagano.jp ikeda.nagano.jp ikusaka.nagano.jp ina.nagano.jp karuizawa.nagano.jp kawakami.nagano.jp kiso.nagano.jp kisofukushima.nagano.jp kitaaiki.nagano.jp komagane.nagano.jp komoro.nagano.jp matsukawa.nagano.jp matsumoto.nagano.jp miasa.nagano.jp minamiaiki.nagano.jp minamimaki.nagano.jp minamiminowa.nagano.jp minowa.nagano.jp miyada.nagano.jp miyota.nagano.jp mochizuki.nagano.jp nagano.nagano.jp nagawa.nagano.jp nagiso.nagano.jp nakagawa.nagano.jp nakano.nagano.jp nozawaonsen.nagano.jp obuse.nagano.jp ogawa.nagano.jp okaya.nagano.jp omachi.nagano.jp omi.nagano.jp ookuwa.nagano.jp ooshika.nagano.jp otaki.nagano.jp otari.nagano.jp sakae.nagano.jp sakaki.nagano.jp saku.nagano.jp sakuho.nagano.jp shimosuwa.nagano.jp shinanomachi.nagano.jp shiojiri.nagano.jp suwa.nagano.jp suzaka.nagano.jp takagi.nagano.jp takamori.nagano.jp takayama.nagano.jp tateshina.nagano.jp tatsuno.nagano.jp togakushi.nagano.jp togura.nagano.jp tomi.nagano.jp ueda.nagano.jp wada.nagano.jp yamagata.nagano.jp yamanouchi.nagano.jp yasaka.nagano.jp yasuoka.nagano.jp chijiwa.nagasaki.jp futsu.nagasaki.jp goto.nagasaki.jp hasami.nagasaki.jp hirado.nagasaki.jp iki.nagasaki.jp isahaya.nagasaki.jp kawatana.nagasaki.jp kuchinotsu.nagasaki.jp matsuura.nagasaki.jp nagasaki.nagasaki.jp obama.nagasaki.jp omura.nagasaki.jp oseto.nagasaki.jp saikai.nagasaki.jp sasebo.nagasaki.jp seihi.nagasaki.jp shimabara.nagasaki.jp shinkamigoto.nagasaki.jp togitsu.nagasaki.jp tsushima.nagasaki.jp unzen.nagasaki.jp ando.nara.jp gose.nara.jp heguri.nara.jp higashiyoshino.nara.jp ikaruga.nara.jp ikoma.nara.jp kamikitayama.nara.jp kanmaki.nara.jp kashiba.nara.jp kashihara.nara.jp katsuragi.nara.jp kawai.nara.jp kawakami.nara.jp kawanishi.nara.jp koryo.nara.jp kurotaki.nara.jp mitsue.nara.jp miyake.nara.jp nara.nara.jp nosegawa.nara.jp oji.nara.jp ouda.nara.jp oyodo.nara.jp sakurai.nara.jp sango.nara.jp shimoichi.nara.jp shimokitayama.nara.jp shinjo.nara.jp soni.nara.jp takatori.nara.jp tawaramoto.nara.jp tenkawa.nara.jp tenri.nara.jp uda.nara.jp yamatokoriyama.nara.jp yamatotakada.nara.jp yamazoe.nara.jp yoshino.nara.jp aga.niigata.jp agano.niigata.jp gosen.niigata.jp itoigawa.niigata.jp izumozaki.niigata.jp joetsu.niigata.jp kamo.niigata.jp kariwa.niigata.jp kashiwazaki.niigata.jp minamiuonuma.niigata.jp mitsuke.niigata.jp muika.niigata.jp murakami.niigata.jp myoko.niigata.jp nagaoka.niigata.jp niigata.niigata.jp ojiya.niigata.jp omi.niigata.jp sado.niigata.jp sanjo.niigata.jp seiro.niigata.jp seirou.niigata.jp sekikawa.niigata.jp shibata.niigata.jp tagami.niigata.jp tainai.niigata.jp tochio.niigata.jp tokamachi.niigata.jp tsubame.niigata.jp tsunan.niigata.jp uonuma.niigata.jp yahiko.niigata.jp yoita.niigata.jp yuzawa.niigata.jp beppu.oita.jp bungoono.oita.jp bungotakada.oita.jp hasama.oita.jp hiji.oita.jp himeshima.oita.jp hita.oita.jp kamitsue.oita.jp kokonoe.oita.jp kuju.oita.jp kunisaki.oita.jp kusu.oita.jp oita.oita.jp saiki.oita.jp taketa.oita.jp tsukumi.oita.jp usa.oita.jp usuki.oita.jp yufu.oita.jp akaiwa.okayama.jp asakuchi.okayama.jp bizen.okayama.jp hayashima.okayama.jp ibara.okayama.jp kagamino.okayama.jp kasaoka.okayama.jp kibichuo.okayama.jp kumenan.okayama.jp kurashiki.okayama.jp maniwa.okayama.jp misaki.okayama.jp nagi.okayama.jp niimi.okayama.jp nishiawakura.okayama.jp okayama.okayama.jp satosho.okayama.jp setouchi.okayama.jp shinjo.okayama.jp shoo.okayama.jp soja.okayama.jp takahashi.okayama.jp tamano.okayama.jp tsuyama.okayama.jp wake.okayama.jp yakage.okayama.jp aguni.okinawa.jp ginowan.okinawa.jp ginoza.okinawa.jp gushikami.okinawa.jp haebaru.okinawa.jp higashi.okinawa.jp hirara.okinawa.jp iheya.okinawa.jp ishigaki.okinawa.jp ishikawa.okinawa.jp itoman.okinawa.jp izena.okinawa.jp kadena.okinawa.jp kin.okinawa.jp kitadaito.okinawa.jp kitanakagusuku.okinawa.jp kumejima.okinawa.jp kunigami.okinawa.jp minamidaito.okinawa.jp motobu.okinawa.jp nago.okinawa.jp naha.okinawa.jp nakagusuku.okinawa.jp nakijin.okinawa.jp nanjo.okinawa.jp nishihara.okinawa.jp ogimi.okinawa.jp okinawa.okinawa.jp onna.okinawa.jp shimoji.okinawa.jp taketomi.okinawa.jp tarama.okinawa.jp tokashiki.okinawa.jp tomigusuku.okinawa.jp tonaki.okinawa.jp urasoe.okinawa.jp uruma.okinawa.jp yaese.okinawa.jp yomitan.okinawa.jp yonabaru.okinawa.jp yonaguni.okinawa.jp zamami.okinawa.jp abeno.osaka.jp chihayaakasaka.osaka.jp chuo.osaka.jp daito.osaka.jp fujiidera.osaka.jp habikino.osaka.jp hannan.osaka.jp higashiosaka.osaka.jp higashisumiyoshi.osaka.jp higashiyodogawa.osaka.jp hirakata.osaka.jp ibaraki.osaka.jp ikeda.osaka.jp izumi.osaka.jp izumiotsu.osaka.jp izumisano.osaka.jp kadoma.osaka.jp kaizuka.osaka.jp kanan.osaka.jp kashiwara.osaka.jp katano.osaka.jp kawachinagano.osaka.jp kishiwada.osaka.jp kita.osaka.jp kumatori.osaka.jp matsubara.osaka.jp minato.osaka.jp minoh.osaka.jp misaki.osaka.jp moriguchi.osaka.jp neyagawa.osaka.jp nishi.osaka.jp nose.osaka.jp osakasayama.osaka.jp sakai.osaka.jp sayama.osaka.jp sennan.osaka.jp settsu.osaka.jp shijonawate.osaka.jp shimamoto.osaka.jp suita.osaka.jp tadaoka.osaka.jp taishi.osaka.jp tajiri.osaka.jp takaishi.osaka.jp takatsuki.osaka.jp tondabayashi.osaka.jp toyonaka.osaka.jp toyono.osaka.jp yao.osaka.jp ariake.saga.jp arita.saga.jp fukudomi.saga.jp genkai.saga.jp hamatama.saga.jp hizen.saga.jp imari.saga.jp kamimine.saga.jp kanzaki.saga.jp karatsu.saga.jp kashima.saga.jp kitagata.saga.jp kitahata.saga.jp kiyama.saga.jp kouhoku.saga.jp kyuragi.saga.jp nishiarita.saga.jp ogi.saga.jp omachi.saga.jp ouchi.saga.jp saga.saga.jp shiroishi.saga.jp taku.saga.jp tara.saga.jp tosu.saga.jp yoshinogari.saga.jp arakawa.saitama.jp asaka.saitama.jp chichibu.saitama.jp fujimi.saitama.jp fujimino.saitama.jp fukaya.saitama.jp hanno.saitama.jp hanyu.saitama.jp hasuda.saitama.jp hatogaya.saitama.jp hatoyama.saitama.jp hidaka.saitama.jp higashichichibu.saitama.jp higashimatsuyama.saitama.jp honjo.saitama.jp ina.saitama.jp iruma.saitama.jp iwatsuki.saitama.jp kamiizumi.saitama.jp kamikawa.saitama.jp kamisato.saitama.jp kasukabe.saitama.jp kawagoe.saitama.jp kawaguchi.saitama.jp kawajima.saitama.jp kazo.saitama.jp kitamoto.saitama.jp koshigaya.saitama.jp kounosu.saitama.jp kuki.saitama.jp kumagaya.saitama.jp matsubushi.saitama.jp minano.saitama.jp misato.saitama.jp miyashiro.saitama.jp miyoshi.saitama.jp moroyama.saitama.jp nagatoro.saitama.jp namegawa.saitama.jp niiza.saitama.jp ogano.saitama.jp ogawa.saitama.jp ogose.saitama.jp okegawa.saitama.jp omiya.saitama.jp otaki.saitama.jp ranzan.saitama.jp ryokami.saitama.jp saitama.saitama.jp sakado.saitama.jp satte.saitama.jp sayama.saitama.jp shiki.saitama.jp shiraoka.saitama.jp soka.saitama.jp sugito.saitama.jp toda.saitama.jp tokigawa.saitama.jp tokorozawa.saitama.jp tsurugashima.saitama.jp urawa.saitama.jp warabi.saitama.jp yashio.saitama.jp yokoze.saitama.jp yono.saitama.jp yorii.saitama.jp yoshida.saitama.jp yoshikawa.saitama.jp yoshimi.saitama.jp aisho.shiga.jp gamo.shiga.jp higashiomi.shiga.jp hikone.shiga.jp koka.shiga.jp konan.shiga.jp kosei.shiga.jp koto.shiga.jp kusatsu.shiga.jp maibara.shiga.jp moriyama.shiga.jp nagahama.shiga.jp nishiazai.shiga.jp notogawa.shiga.jp omihachiman.shiga.jp otsu.shiga.jp ritto.shiga.jp ryuoh.shiga.jp takashima.shiga.jp takatsuki.shiga.jp torahime.shiga.jp toyosato.shiga.jp yasu.shiga.jp akagi.shimane.jp ama.shimane.jp gotsu.shimane.jp hamada.shimane.jp higashiizumo.shimane.jp hikawa.shimane.jp hikimi.shimane.jp izumo.shimane.jp kakinoki.shimane.jp masuda.shimane.jp matsue.shimane.jp misato.shimane.jp nishinoshima.shimane.jp ohda.shimane.jp okinoshima.shimane.jp okuizumo.shimane.jp shimane.shimane.jp tamayu.shimane.jp tsuwano.shimane.jp unnan.shimane.jp yakumo.shimane.jp yasugi.shimane.jp yatsuka.shimane.jp arai.shizuoka.jp atami.shizuoka.jp fuji.shizuoka.jp fujieda.shizuoka.jp fujikawa.shizuoka.jp fujinomiya.shizuoka.jp fukuroi.shizuoka.jp gotemba.shizuoka.jp haibara.shizuoka.jp hamamatsu.shizuoka.jp higashiizu.shizuoka.jp ito.shizuoka.jp iwata.shizuoka.jp izu.shizuoka.jp izunokuni.shizuoka.jp kakegawa.shizuoka.jp kannami.shizuoka.jp kawanehon.shizuoka.jp kawazu.shizuoka.jp kikugawa.shizuoka.jp kosai.shizuoka.jp makinohara.shizuoka.jp matsuzaki.shizuoka.jp minamiizu.shizuoka.jp mishima.shizuoka.jp morimachi.shizuoka.jp nishiizu.shizuoka.jp numazu.shizuoka.jp omaezaki.shizuoka.jp shimada.shizuoka.jp shimizu.shizuoka.jp shimoda.shizuoka.jp shizuoka.shizuoka.jp susono.shizuoka.jp yaizu.shizuoka.jp yoshida.shizuoka.jp ashikaga.tochigi.jp bato.tochigi.jp haga.tochigi.jp ichikai.tochigi.jp iwafune.tochigi.jp kaminokawa.tochigi.jp kanuma.tochigi.jp karasuyama.tochigi.jp kuroiso.tochigi.jp mashiko.tochigi.jp mibu.tochigi.jp moka.tochigi.jp motegi.tochigi.jp nasu.tochigi.jp nasushiobara.tochigi.jp nikko.tochigi.jp nishikata.tochigi.jp nogi.tochigi.jp ohira.tochigi.jp ohtawara.tochigi.jp oyama.tochigi.jp sakura.tochigi.jp sano.tochigi.jp shimotsuke.tochigi.jp shioya.tochigi.jp takanezawa.tochigi.jp tochigi.tochigi.jp tsuga.tochigi.jp ujiie.tochigi.jp utsunomiya.tochigi.jp yaita.tochigi.jp aizumi.tokushima.jp anan.tokushima.jp ichiba.tokushima.jp itano.tokushima.jp kainan.tokushima.jp komatsushima.tokushima.jp matsushige.tokushima.jp mima.tokushima.jp minami.tokushima.jp miyoshi.tokushima.jp mugi.tokushima.jp nakagawa.tokushima.jp naruto.tokushima.jp sanagochi.tokushima.jp shishikui.tokushima.jp tokushima.tokushima.jp wajiki.tokushima.jp adachi.tokyo.jp akiruno.tokyo.jp akishima.tokyo.jp aogashima.tokyo.jp arakawa.tokyo.jp bunkyo.tokyo.jp chiyoda.tokyo.jp chofu.tokyo.jp chuo.tokyo.jp edogawa.tokyo.jp fuchu.tokyo.jp fussa.tokyo.jp hachijo.tokyo.jp hachioji.tokyo.jp hamura.tokyo.jp higashikurume.tokyo.jp higashimurayama.tokyo.jp higashiyamato.tokyo.jp hino.tokyo.jp hinode.tokyo.jp hinohara.tokyo.jp inagi.tokyo.jp itabashi.tokyo.jp katsushika.tokyo.jp kita.tokyo.jp kiyose.tokyo.jp kodaira.tokyo.jp koganei.tokyo.jp kokubunji.tokyo.jp komae.tokyo.jp koto.tokyo.jp kouzushima.tokyo.jp kunitachi.tokyo.jp machida.tokyo.jp meguro.tokyo.jp minato.tokyo.jp mitaka.tokyo.jp mizuho.tokyo.jp musashimurayama.tokyo.jp musashino.tokyo.jp nakano.tokyo.jp nerima.tokyo.jp ogasawara.tokyo.jp okutama.tokyo.jp ome.tokyo.jp oshima.tokyo.jp ota.tokyo.jp setagaya.tokyo.jp shibuya.tokyo.jp shinagawa.tokyo.jp shinjuku.tokyo.jp suginami.tokyo.jp sumida.tokyo.jp tachikawa.tokyo.jp taito.tokyo.jp tama.tokyo.jp toshima.tokyo.jp chizu.tottori.jp hino.tottori.jp kawahara.tottori.jp koge.tottori.jp kotoura.tottori.jp misasa.tottori.jp nanbu.tottori.jp nichinan.tottori.jp sakaiminato.tottori.jp tottori.tottori.jp wakasa.tottori.jp yazu.tottori.jp yonago.tottori.jp asahi.toyama.jp fuchu.toyama.jp fukumitsu.toyama.jp funahashi.toyama.jp himi.toyama.jp imizu.toyama.jp inami.toyama.jp johana.toyama.jp kamiichi.toyama.jp kurobe.toyama.jp nakaniikawa.toyama.jp namerikawa.toyama.jp nanto.toyama.jp nyuzen.toyama.jp oyabe.toyama.jp taira.toyama.jp takaoka.toyama.jp tateyama.toyama.jp toga.toyama.jp tonami.toyama.jp toyama.toyama.jp unazuki.toyama.jp uozu.toyama.jp yamada.toyama.jp arida.wakayama.jp aridagawa.wakayama.jp gobo.wakayama.jp hashimoto.wakayama.jp hidaka.wakayama.jp hirogawa.wakayama.jp inami.wakayama.jp iwade.wakayama.jp kainan.wakayama.jp kamitonda.wakayama.jp katsuragi.wakayama.jp kimino.wakayama.jp kinokawa.wakayama.jp kitayama.wakayama.jp koya.wakayama.jp koza.wakayama.jp kozagawa.wakayama.jp kudoyama.wakayama.jp kushimoto.wakayama.jp mihama.wakayama.jp misato.wakayama.jp nachikatsuura.wakayama.jp shingu.wakayama.jp shirahama.wakayama.jp taiji.wakayama.jp tanabe.wakayama.jp wakayama.wakayama.jp yuasa.wakayama.jp yura.wakayama.jp asahi.yamagata.jp funagata.yamagata.jp higashine.yamagata.jp iide.yamagata.jp kahoku.yamagata.jp kaminoyama.yamagata.jp kaneyama.yamagata.jp kawanishi.yamagata.jp mamurogawa.yamagata.jp mikawa.yamagata.jp murayama.yamagata.jp nagai.yamagata.jp nakayama.yamagata.jp nanyo.yamagata.jp nishikawa.yamagata.jp obanazawa.yamagata.jp oe.yamagata.jp oguni.yamagata.jp ohkura.yamagata.jp oishida.yamagata.jp sagae.yamagata.jp sakata.yamagata.jp sakegawa.yamagata.jp shinjo.yamagata.jp shirataka.yamagata.jp shonai.yamagata.jp takahata.yamagata.jp tendo.yamagata.jp tozawa.yamagata.jp tsuruoka.yamagata.jp yamagata.yamagata.jp yamanobe.yamagata.jp yonezawa.yamagata.jp yuza.yamagata.jp abu.yamaguchi.jp hagi.yamaguchi.jp hikari.yamaguchi.jp hofu.yamaguchi.jp iwakuni.yamaguchi.jp kudamatsu.yamaguchi.jp mitou.yamaguchi.jp nagato.yamaguchi.jp oshima.yamaguchi.jp shimonoseki.yamaguchi.jp shunan.yamaguchi.jp tabuse.yamaguchi.jp tokuyama.yamaguchi.jp toyota.yamaguchi.jp ube.yamaguchi.jp yuu.yamaguchi.jp chuo.yamanashi.jp doshi.yamanashi.jp fuefuki.yamanashi.jp fujikawa.yamanashi.jp fujikawaguchiko.yamanashi.jp fujiyoshida.yamanashi.jp hayakawa.yamanashi.jp hokuto.yamanashi.jp ichikawamisato.yamanashi.jp kai.yamanashi.jp kofu.yamanashi.jp koshu.yamanashi.jp kosuge.yamanashi.jp minami-alps.yamanashi.jp minobu.yamanashi.jp nakamichi.yamanashi.jp nanbu.yamanashi.jp narusawa.yamanashi.jp nirasaki.yamanashi.jp nishikatsura.yamanashi.jp oshino.yamanashi.jp otsuki.yamanashi.jp showa.yamanashi.jp tabayama.yamanashi.jp tsuru.yamanashi.jp uenohara.yamanashi.jp yamanakako.yamanashi.jp yamanashi.yamanashi.jp ke ac.ke co.ke go.ke info.ke me.ke mobi.ke ne.ke or.ke sc.ke kg com.kg edu.kg gov.kg mil.kg net.kg org.kg kh com.kh edu.kh gov.kh net.kh org.kh ki biz.ki com.ki edu.ki gov.ki info.ki net.ki org.ki km ass.km com.km edu.km gov.km mil.km nom.km org.km prd.km tm.km asso.km coop.km gouv.km medecin.km notaires.km pharmaciens.km presse.km veterinaire.km kn edu.kn gov.kn net.kn org.kn kp com.kp edu.kp gov.kp org.kp rep.kp tra.kp kr ac.kr ai.kr co.kr es.kr go.kr hs.kr io.kr it.kr kg.kr me.kr mil.kr ms.kr ne.kr or.kr pe.kr re.kr sc.kr busan.kr chungbuk.kr chungnam.kr daegu.kr daejeon.kr gangwon.kr gwangju.kr gyeongbuk.kr gyeonggi.kr gyeongnam.kr incheon.kr jeju.kr jeonbuk.kr jeonnam.kr seoul.kr ulsan.kr kw com.kw edu.kw emb.kw gov.kw ind.kw net.kw org.kw ky com.ky edu.ky net.ky org.ky kz com.kz edu.kz gov.kz mil.kz net.kz org.kz la com.la edu.la gov.la info.la int.la net.la org.la per.la lb com.lb edu.lb gov.lb net.lb org.lb lc co.lc com.lc edu.lc gov.lc net.lc org.lc li lk ac.lk assn.lk com.lk edu.lk gov.lk grp.lk hotel.lk int.lk ltd.lk net.lk ngo.lk org.lk sch.lk soc.lk web.lk lr com.lr edu.lr gov.lr net.lr org.lr ls ac.ls biz.ls co.ls edu.ls gov.ls info.ls net.ls org.ls sc.ls lt gov.lt lu lv asn.lv com.lv conf.lv edu.lv gov.lv id.lv mil.lv net.lv org.lv ly com.ly edu.ly gov.ly id.ly med.ly net.ly org.ly plc.ly sch.ly ma ac.ma co.ma gov.ma net.ma org.ma press.ma mc asso.mc tm.mc md me ac.me co.me edu.me gov.me its.me net.me org.me priv.me mg co.mg com.mg edu.mg gov.mg mil.mg nom.mg org.mg prd.mg mh mil mk com.mk edu.mk gov.mk inf.mk name.mk net.mk org.mk ml ac.ml art.ml asso.ml com.ml edu.ml gouv.ml gov.ml info.ml inst.ml net.ml org.ml pr.ml presse.ml *.mm mn edu.mn gov.mn org.mn mo com.mo edu.mo gov.mo net.mo org.mo mobi mp mq mr gov.mr ms com.ms edu.ms gov.ms net.ms org.ms mt com.mt edu.mt net.mt org.mt mu ac.mu co.mu com.mu gov.mu net.mu or.mu org.mu museum mv aero.mv biz.mv com.mv coop.mv edu.mv gov.mv info.mv int.mv mil.mv museum.mv name.mv net.mv org.mv pro.mv mw ac.mw biz.mw co.mw com.mw coop.mw edu.mw gov.mw int.mw net.mw org.mw mx com.mx edu.mx gob.mx net.mx org.mx my biz.my com.my edu.my gov.my mil.my name.my net.my org.my mz ac.mz adv.mz co.mz edu.mz gov.mz mil.mz net.mz org.mz na alt.na co.na com.na gov.na net.na org.na name nc asso.nc nom.nc ne net nf arts.nf com.nf firm.nf info.nf net.nf other.nf per.nf rec.nf store.nf web.nf ng com.ng edu.ng gov.ng i.ng mil.ng mobi.ng name.ng net.ng org.ng sch.ng ni ac.ni biz.ni co.ni com.ni edu.ni gob.ni in.ni info.ni int.ni mil.ni net.ni nom.ni org.ni web.ni nl no fhs.no folkebibl.no fylkesbibl.no gielda.no herad.no idrett.no kommune.no museum.no priv.no suohkan.no tjielte.no uenorge.no vgs.no dep.no mil.no stat.no aa.no ah.no bu.no fm.no hl.no hm.no jan-mayen.no mr.no nl.no nt.no of.no ol.no oslo.no rl.no sf.no st.no svalbard.no tm.no tr.no va.no vf.no gs.aa.no gs.ah.no gs.bu.no gs.fm.no gs.hl.no gs.hm.no gs.jan-mayen.no gs.mr.no gs.nl.no gs.nt.no gs.of.no gs.ol.no gs.oslo.no gs.rl.no gs.sf.no gs.st.no gs.svalbard.no gs.tm.no gs.tr.no gs.va.no gs.vf.no akrehamn.no xn--krehamn-dxa.no algard.no xn--lgrd-poac.no arna.no bronnoysund.no xn--brnnysund-m8ac.no brumunddal.no bryne.no drobak.no xn--drbak-wua.no egersund.no fetsund.no floro.no xn--flor-jra.no fredrikstad.no hokksund.no honefoss.no xn--hnefoss-q1a.no jessheim.no jorpeland.no xn--jrpeland-54a.no kirkenes.no kopervik.no krokstadelva.no langevag.no xn--langevg-jxa.no leirvik.no mjondalen.no xn--mjndalen-64a.no mo-i-rana.no mosjoen.no xn--mosjen-eya.no nesoddtangen.no orkanger.no osoyro.no xn--osyro-wua.no raholt.no xn--rholt-mra.no sandnessjoen.no xn--sandnessjen-ogb.no skedsmokorset.no slattum.no spjelkavik.no stathelle.no stavern.no stjordalshalsen.no xn--stjrdalshalsen-sqb.no tananger.no tranby.no vossevangen.no aarborte.no aejrie.no afjord.no xn--fjord-lra.no agdenes.no nes.akershus.no aknoluokta.no xn--koluokta-7ya57h.no al.no xn--l-1fa.no alaheadju.no xn--laheadju-7ya.no alesund.no xn--lesund-hua.no alstahaug.no alta.no xn--lt-liac.no alvdal.no amli.no xn--mli-tla.no amot.no xn--mot-tla.no andasuolo.no andebu.no andoy.no xn--andy-ira.no ardal.no xn--rdal-poa.no aremark.no arendal.no xn--s-1fa.no aseral.no xn--seral-lra.no asker.no askim.no askoy.no xn--asky-ira.no askvoll.no asnes.no xn--snes-poa.no audnedal.no aukra.no aure.no aurland.no aurskog-holand.no xn--aurskog-hland-jnb.no austevoll.no austrheim.no averoy.no xn--avery-yua.no badaddja.no xn--bdddj-mrabd.no xn--brum-voa.no bahcavuotna.no xn--bhcavuotna-s4a.no bahccavuotna.no xn--bhccavuotna-k7a.no baidar.no xn--bidr-5nac.no bajddar.no xn--bjddar-pta.no balat.no xn--blt-elab.no balestrand.no ballangen.no balsfjord.no bamble.no bardu.no barum.no batsfjord.no xn--btsfjord-9za.no bearalvahki.no xn--bearalvhki-y4a.no beardu.no beiarn.no berg.no bergen.no berlevag.no xn--berlevg-jxa.no bievat.no xn--bievt-0qa.no bindal.no birkenes.no bjerkreim.no bjugn.no bodo.no xn--bod-2na.no bokn.no bomlo.no xn--bmlo-gra.no bremanger.no bronnoy.no xn--brnny-wuac.no budejju.no nes.buskerud.no bygland.no bykle.no cahcesuolo.no xn--hcesuolo-7ya35b.no davvenjarga.no xn--davvenjrga-y4a.no davvesiida.no deatnu.no dielddanuorri.no divtasvuodna.no divttasvuotna.no donna.no xn--dnna-gra.no dovre.no drammen.no drangedal.no dyroy.no xn--dyry-ira.no eid.no eidfjord.no eidsberg.no eidskog.no eidsvoll.no eigersund.no elverum.no enebakk.no engerdal.no etne.no etnedal.no evenassi.no xn--eveni-0qa01ga.no evenes.no evje-og-hornnes.no farsund.no fauske.no fedje.no fet.no finnoy.no xn--finny-yua.no fitjar.no fjaler.no fjell.no fla.no xn--fl-zia.no flakstad.no flatanger.no flekkefjord.no flesberg.no flora.no folldal.no forde.no xn--frde-gra.no forsand.no fosnes.no xn--frna-woa.no frana.no frogn.no froland.no frosta.no froya.no xn--frya-hra.no fuoisku.no fuossko.no fusa.no fyresdal.no gaivuotna.no xn--givuotna-8ya.no galsa.no xn--gls-elac.no gamvik.no gangaviika.no xn--ggaviika-8ya47h.no gaular.no gausdal.no giehtavuoatna.no gildeskal.no xn--gildeskl-g0a.no giske.no gjemnes.no gjerdrum.no gjerstad.no gjesdal.no gjovik.no xn--gjvik-wua.no gloppen.no gol.no gran.no grane.no granvin.no gratangen.no grimstad.no grong.no grue.no gulen.no guovdageaidnu.no ha.no xn--h-2fa.no habmer.no xn--hbmer-xqa.no hadsel.no xn--hgebostad-g3a.no hagebostad.no halden.no halsa.no hamar.no hamaroy.no xn--hamary-fya.no hammarfeasta.no xn--hmmrfeasta-s4ac.no hammerfest.no hapmir.no xn--hpmir-xqa.no haram.no hareid.no harstad.no hasvik.no hattfjelldal.no haugesund.no os.hedmark.no valer.hedmark.no xn--vler-qoa.hedmark.no hemne.no hemnes.no hemsedal.no hitra.no hjartdal.no hjelmeland.no hobol.no xn--hobl-ira.no hof.no hol.no hole.no holmestrand.no holtalen.no xn--holtlen-hxa.no os.hordaland.no hornindal.no horten.no hoyanger.no xn--hyanger-q1a.no hoylandet.no xn--hylandet-54a.no hurdal.no hurum.no hvaler.no hyllestad.no ibestad.no inderoy.no xn--indery-fya.no iveland.no ivgu.no jevnaker.no jolster.no xn--jlster-bya.no jondal.no kafjord.no xn--kfjord-iua.no karasjohka.no xn--krjohka-hwab49j.no karasjok.no karlsoy.no xn--karlsy-fya.no karmoy.no xn--karmy-yua.no kautokeino.no klabu.no xn--klbu-woa.no klepp.no kongsberg.no kongsvinger.no kraanghke.no xn--kranghke-b0a.no kragero.no xn--krager-gya.no kristiansand.no kristiansund.no krodsherad.no xn--krdsherad-m8a.no xn--kvfjord-nxa.no xn--kvnangen-k0a.no kvafjord.no kvalsund.no kvam.no kvanangen.no kvinesdal.no kvinnherad.no kviteseid.no kvitsoy.no xn--kvitsy-fya.no laakesvuemie.no xn--lrdal-sra.no lahppi.no xn--lhppi-xqa.no lardal.no larvik.no lavagis.no lavangen.no leangaviika.no xn--leagaviika-52b.no lebesby.no leikanger.no leirfjord.no leka.no leksvik.no lenvik.no lerdal.no lesja.no levanger.no lier.no lierne.no lillehammer.no lillesand.no lindas.no xn--linds-pra.no lindesnes.no loabat.no xn--loabt-0qa.no lodingen.no xn--ldingen-q1a.no lom.no loppa.no lorenskog.no xn--lrenskog-54a.no loten.no xn--lten-gra.no lund.no lunner.no luroy.no xn--lury-ira.no luster.no lyngdal.no lyngen.no malatvuopmi.no xn--mlatvuopmi-s4a.no malselv.no xn--mlselv-iua.no malvik.no mandal.no marker.no marnardal.no masfjorden.no masoy.no xn--msy-ula0h.no matta-varjjat.no xn--mtta-vrjjat-k7af.no meland.no meldal.no melhus.no meloy.no xn--mely-ira.no meraker.no xn--merker-kua.no midsund.no midtre-gauldal.no moareke.no xn--moreke-jua.no modalen.no modum.no molde.no heroy.more-og-romsdal.no sande.more-og-romsdal.no xn--hery-ira.xn--mre-og-romsdal-qqb.no sande.xn--mre-og-romsdal-qqb.no moskenes.no moss.no muosat.no xn--muost-0qa.no naamesjevuemie.no xn--nmesjevuemie-tcba.no xn--nry-yla5g.no namdalseid.no namsos.no namsskogan.no nannestad.no naroy.no narviika.no narvik.no naustdal.no navuotna.no xn--nvuotna-hwa.no nedre-eiker.no nesna.no nesodden.no nesseby.no nesset.no nissedal.no nittedal.no nord-aurdal.no nord-fron.no nord-odal.no norddal.no nordkapp.no bo.nordland.no xn--b-5ga.nordland.no heroy.nordland.no xn--hery-ira.nordland.no nordre-land.no nordreisa.no nore-og-uvdal.no notodden.no notteroy.no xn--nttery-byae.no odda.no oksnes.no xn--ksnes-uua.no omasvuotna.no oppdal.no oppegard.no xn--oppegrd-ixa.no orkdal.no orland.no xn--rland-uua.no orskog.no xn--rskog-uua.no orsta.no xn--rsta-fra.no osen.no osteroy.no xn--ostery-fya.no valer.ostfold.no xn--vler-qoa.xn--stfold-9xa.no ostre-toten.no xn--stre-toten-zcb.no overhalla.no ovre-eiker.no xn--vre-eiker-k8a.no oyer.no xn--yer-zna.no oygarden.no xn--ygarden-p1a.no oystre-slidre.no xn--ystre-slidre-ujb.no porsanger.no porsangu.no xn--porsgu-sta26f.no porsgrunn.no rade.no xn--rde-ula.no radoy.no xn--rady-ira.no xn--rlingen-mxa.no rahkkeravju.no xn--rhkkervju-01af.no raisa.no xn--risa-5na.no rakkestad.no ralingen.no rana.no randaberg.no rauma.no re.no rendalen.no rennebu.no rennesoy.no xn--rennesy-v1a.no rindal.no ringebu.no ringerike.no ringsaker.no risor.no xn--risr-ira.no rissa.no roan.no rodoy.no xn--rdy-0nab.no rollag.no romsa.no romskog.no xn--rmskog-bya.no roros.no xn--rros-gra.no rost.no xn--rst-0na.no royken.no xn--ryken-vua.no royrvik.no xn--ryrvik-bya.no ruovat.no rygge.no salangen.no salat.no xn--slat-5na.no xn--slt-elab.no saltdal.no samnanger.no sandefjord.no sandnes.no sandoy.no xn--sandy-yua.no sarpsborg.no sauda.no sauherad.no sel.no selbu.no selje.no seljord.no siellak.no sigdal.no siljan.no sirdal.no skanit.no xn--sknit-yqa.no skanland.no xn--sknland-fxa.no skaun.no skedsmo.no ski.no skien.no skierva.no xn--skierv-uta.no skiptvet.no skjak.no xn--skjk-soa.no skjervoy.no xn--skjervy-v1a.no skodje.no smola.no xn--smla-hra.no snaase.no xn--snase-nra.no snasa.no xn--snsa-roa.no snillfjord.no snoasa.no sogndal.no sogne.no xn--sgne-gra.no sokndal.no sola.no solund.no somna.no xn--smna-gra.no sondre-land.no xn--sndre-land-0cb.no songdalen.no sor-aurdal.no xn--sr-aurdal-l8a.no sor-fron.no xn--sr-fron-q1a.no sor-odal.no xn--sr-odal-q1a.no sor-varanger.no xn--sr-varanger-ggb.no sorfold.no xn--srfold-bya.no sorreisa.no xn--srreisa-q1a.no sortland.no sorum.no xn--srum-gra.no spydeberg.no stange.no stavanger.no steigen.no steinkjer.no stjordal.no xn--stjrdal-s1a.no stokke.no stor-elvdal.no stord.no stordal.no storfjord.no strand.no stranda.no stryn.no sula.no suldal.no sund.no sunndal.no surnadal.no sveio.no svelvik.no sykkylven.no tana.no bo.telemark.no xn--b-5ga.telemark.no time.no tingvoll.no tinn.no tjeldsund.no tjome.no xn--tjme-hra.no tokke.no tolga.no tonsberg.no xn--tnsberg-q1a.no torsken.no xn--trna-woa.no trana.no tranoy.no xn--trany-yua.no troandin.no trogstad.no xn--trgstad-r1a.no tromsa.no tromso.no xn--troms-zua.no trondheim.no trysil.no tvedestrand.no tydal.no tynset.no tysfjord.no tysnes.no xn--tysvr-vra.no tysvar.no ullensaker.no ullensvang.no ulstein.no ulvik.no unjarga.no xn--unjrga-rta.no utsira.no vaapste.no vadso.no xn--vads-jra.no xn--vry-yla5g.no vaga.no xn--vg-yiab.no vagan.no xn--vgan-qoa.no vagsoy.no xn--vgsy-qoa0j.no vaksdal.no valle.no vang.no vanylven.no vardo.no xn--vard-jra.no varggat.no xn--vrggt-xqad.no varoy.no vefsn.no vega.no vegarshei.no xn--vegrshei-c0a.no vennesla.no verdal.no verran.no vestby.no sande.vestfold.no vestnes.no vestre-slidre.no vestre-toten.no vestvagoy.no xn--vestvgy-ixa6o.no vevelstad.no vik.no vikna.no vindafjord.no voagat.no volda.no voss.no *.np nr biz.nr com.nr edu.nr gov.nr info.nr net.nr org.nr nu nz ac.nz co.nz cri.nz geek.nz gen.nz govt.nz health.nz iwi.nz kiwi.nz maori.nz xn--mori-qsa.nz mil.nz net.nz org.nz parliament.nz school.nz om co.om com.om edu.om gov.om med.om museum.om net.om org.om pro.om onion org pa abo.pa ac.pa com.pa edu.pa gob.pa ing.pa med.pa net.pa nom.pa org.pa sld.pa pe com.pe edu.pe gob.pe mil.pe net.pe nom.pe org.pe pf com.pf edu.pf org.pf *.pg ph com.ph edu.ph gov.ph i.ph mil.ph net.ph ngo.ph org.ph pk ac.pk biz.pk com.pk edu.pk fam.pk gkp.pk gob.pk gog.pk gok.pk gop.pk gos.pk gov.pk net.pk org.pk web.pk pl com.pl net.pl org.pl agro.pl aid.pl atm.pl auto.pl biz.pl edu.pl gmina.pl gsm.pl info.pl mail.pl media.pl miasta.pl mil.pl nieruchomosci.pl nom.pl pc.pl powiat.pl priv.pl realestate.pl rel.pl sex.pl shop.pl sklep.pl sos.pl szkola.pl targi.pl tm.pl tourism.pl travel.pl turystyka.pl gov.pl ap.gov.pl griw.gov.pl ic.gov.pl is.gov.pl kmpsp.gov.pl konsulat.gov.pl kppsp.gov.pl kwp.gov.pl kwpsp.gov.pl mup.gov.pl mw.gov.pl oia.gov.pl oirm.gov.pl oke.gov.pl oow.gov.pl oschr.gov.pl oum.gov.pl pa.gov.pl pinb.gov.pl piw.gov.pl po.gov.pl pr.gov.pl psp.gov.pl psse.gov.pl pup.gov.pl rzgw.gov.pl sa.gov.pl sdn.gov.pl sko.gov.pl so.gov.pl sr.gov.pl starostwo.gov.pl ug.gov.pl ugim.gov.pl um.gov.pl umig.gov.pl upow.gov.pl uppo.gov.pl us.gov.pl uw.gov.pl uzs.gov.pl wif.gov.pl wiih.gov.pl winb.gov.pl wios.gov.pl witd.gov.pl wiw.gov.pl wkz.gov.pl wsa.gov.pl wskr.gov.pl wsse.gov.pl wuoz.gov.pl wzmiuw.gov.pl zp.gov.pl zpisdn.gov.pl augustow.pl babia-gora.pl bedzin.pl beskidy.pl bialowieza.pl bialystok.pl bielawa.pl bieszczady.pl boleslawiec.pl bydgoszcz.pl bytom.pl cieszyn.pl czeladz.pl czest.pl dlugoleka.pl elblag.pl elk.pl glogow.pl gniezno.pl gorlice.pl grajewo.pl ilawa.pl jaworzno.pl jelenia-gora.pl jgora.pl kalisz.pl karpacz.pl kartuzy.pl kaszuby.pl katowice.pl kazimierz-dolny.pl kepno.pl ketrzyn.pl klodzko.pl kobierzyce.pl kolobrzeg.pl konin.pl konskowola.pl kutno.pl lapy.pl lebork.pl legnica.pl lezajsk.pl limanowa.pl lomza.pl lowicz.pl lubin.pl lukow.pl malbork.pl malopolska.pl mazowsze.pl mazury.pl mielec.pl mielno.pl mragowo.pl naklo.pl nowaruda.pl nysa.pl olawa.pl olecko.pl olkusz.pl olsztyn.pl opoczno.pl opole.pl ostroda.pl ostroleka.pl ostrowiec.pl ostrowwlkp.pl pila.pl pisz.pl podhale.pl podlasie.pl polkowice.pl pomorskie.pl pomorze.pl prochowice.pl pruszkow.pl przeworsk.pl pulawy.pl radom.pl rawa-maz.pl rybnik.pl rzeszow.pl sanok.pl sejny.pl skoczow.pl slask.pl slupsk.pl sosnowiec.pl stalowa-wola.pl starachowice.pl stargard.pl suwalki.pl swidnica.pl swiebodzin.pl swinoujscie.pl szczecin.pl szczytno.pl tarnobrzeg.pl tgory.pl turek.pl tychy.pl ustka.pl walbrzych.pl warmia.pl warszawa.pl waw.pl wegrow.pl wielun.pl wlocl.pl wloclawek.pl wodzislaw.pl wolomin.pl wroclaw.pl zachpomor.pl zagan.pl zarow.pl zgora.pl zgorzelec.pl pm pn co.pn edu.pn gov.pn net.pn org.pn post pr ac.pr biz.pr com.pr edu.pr est.pr gov.pr info.pr isla.pr name.pr net.pr org.pr pro.pr prof.pr pro aaa.pro aca.pro acct.pro avocat.pro bar.pro cpa.pro eng.pro jur.pro law.pro med.pro recht.pro ps com.ps edu.ps gov.ps net.ps org.ps plo.ps sec.ps pt com.pt edu.pt gov.pt int.pt net.pt nome.pt org.pt publ.pt pw gov.pw py com.py coop.py edu.py gov.py mil.py net.py org.py qa com.qa edu.qa gov.qa mil.qa name.qa net.qa org.qa sch.qa re asso.re com.re ro arts.ro com.ro firm.ro info.ro nom.ro nt.ro org.ro rec.ro store.ro tm.ro www.ro rs ac.rs co.rs edu.rs gov.rs in.rs org.rs ru rw ac.rw co.rw coop.rw gov.rw mil.rw net.rw org.rw sa com.sa edu.sa gov.sa med.sa net.sa org.sa pub.sa sch.sa sb com.sb edu.sb gov.sb net.sb org.sb sc com.sc edu.sc gov.sc net.sc org.sc sd com.sd edu.sd gov.sd info.sd med.sd net.sd org.sd tv.sd se a.se ac.se b.se bd.se brand.se c.se d.se e.se f.se fh.se fhsk.se fhv.se g.se h.se i.se k.se komforb.se kommunalforbund.se komvux.se l.se lanbib.se m.se n.se naturbruksgymn.se o.se org.se p.se parti.se pp.se press.se r.se s.se t.se tm.se u.se w.se x.se y.se z.se sg com.sg edu.sg gov.sg net.sg org.sg sh com.sh gov.sh mil.sh net.sh org.sh si sj sk org.sk sl com.sl edu.sl gov.sl net.sl org.sl sm sn art.sn com.sn edu.sn gouv.sn org.sn univ.sn so com.so edu.so gov.so me.so net.so org.so sr ss biz.ss co.ss com.ss edu.ss gov.ss me.ss net.ss org.ss sch.ss st co.st com.st consulado.st edu.st embaixada.st mil.st net.st org.st principe.st saotome.st store.st su sv com.sv edu.sv gob.sv org.sv red.sv sx gov.sx sy com.sy edu.sy gov.sy mil.sy net.sy org.sy sz ac.sz co.sz org.sz tc td tel tf tg th ac.th co.th go.th in.th mi.th net.th or.th tj biz.tj co.tj com.tj edu.tj go.tj gov.tj int.tj mil.tj name.tj net.tj nic.tj org.tj test.tj web.tj tk tl gov.tl tm co.tm com.tm edu.tm gov.tm mil.tm net.tm nom.tm org.tm tn com.tn ens.tn fin.tn gov.tn ind.tn info.tn intl.tn mincom.tn nat.tn net.tn org.tn perso.tn tourism.tn to com.to edu.to gov.to mil.to net.to org.to tr av.tr bbs.tr bel.tr biz.tr com.tr dr.tr edu.tr gen.tr gov.tr info.tr k12.tr kep.tr mil.tr name.tr net.tr org.tr pol.tr tel.tr tsk.tr tv.tr web.tr nc.tr gov.nc.tr tt biz.tt co.tt com.tt edu.tt gov.tt info.tt mil.tt name.tt net.tt org.tt pro.tt tv tw club.tw com.tw ebiz.tw edu.tw game.tw gov.tw idv.tw mil.tw net.tw org.tw tz ac.tz co.tz go.tz hotel.tz info.tz me.tz mil.tz mobi.tz ne.tz or.tz sc.tz tv.tz ua com.ua edu.ua gov.ua in.ua net.ua org.ua cherkassy.ua cherkasy.ua chernigov.ua chernihiv.ua chernivtsi.ua chernovtsy.ua ck.ua cn.ua cr.ua crimea.ua cv.ua dn.ua dnepropetrovsk.ua dnipropetrovsk.ua donetsk.ua dp.ua if.ua ivano-frankivsk.ua kh.ua kharkiv.ua kharkov.ua kherson.ua khmelnitskiy.ua khmelnytskyi.ua kiev.ua kirovograd.ua km.ua kr.ua kropyvnytskyi.ua krym.ua ks.ua kv.ua kyiv.ua lg.ua lt.ua lugansk.ua luhansk.ua lutsk.ua lv.ua lviv.ua mk.ua mykolaiv.ua nikolaev.ua od.ua odesa.ua odessa.ua pl.ua poltava.ua rivne.ua rovno.ua rv.ua sb.ua sebastopol.ua sevastopol.ua sm.ua sumy.ua te.ua ternopil.ua uz.ua uzhgorod.ua uzhhorod.ua vinnica.ua vinnytsia.ua vn.ua volyn.ua yalta.ua zakarpattia.ua zaporizhzhe.ua zaporizhzhia.ua zhitomir.ua zhytomyr.ua zp.ua zt.ua ug ac.ug co.ug com.ug edu.ug go.ug gov.ug mil.ug ne.ug or.ug org.ug sc.ug us.ug uk ac.uk co.uk gov.uk ltd.uk me.uk net.uk nhs.uk org.uk plc.uk police.uk *.sch.uk us dni.us isa.us nsn.us ak.us al.us ar.us as.us az.us ca.us co.us ct.us dc.us de.us fl.us ga.us gu.us hi.us ia.us id.us il.us in.us ks.us ky.us la.us ma.us md.us me.us mi.us mn.us mo.us ms.us mt.us nc.us nd.us ne.us nh.us nj.us nm.us nv.us ny.us oh.us ok.us or.us pa.us pr.us ri.us sc.us sd.us tn.us tx.us ut.us va.us vi.us vt.us wa.us wi.us wv.us wy.us k12.ak.us k12.al.us k12.ar.us k12.as.us k12.az.us k12.ca.us k12.co.us k12.ct.us k12.dc.us k12.fl.us k12.ga.us k12.gu.us k12.ia.us k12.id.us k12.il.us k12.in.us k12.ks.us k12.ky.us k12.la.us k12.ma.us k12.md.us k12.me.us k12.mi.us k12.mn.us k12.mo.us k12.ms.us k12.mt.us k12.nc.us k12.ne.us k12.nh.us k12.nj.us k12.nm.us k12.nv.us k12.ny.us k12.oh.us k12.ok.us k12.or.us k12.pa.us k12.pr.us k12.sc.us k12.tn.us k12.tx.us k12.ut.us k12.va.us k12.vi.us k12.vt.us k12.wa.us k12.wi.us cc.ak.us lib.ak.us cc.al.us lib.al.us cc.ar.us lib.ar.us cc.as.us lib.as.us cc.az.us lib.az.us cc.ca.us lib.ca.us cc.co.us lib.co.us cc.ct.us lib.ct.us cc.dc.us lib.dc.us cc.de.us cc.fl.us lib.fl.us cc.ga.us lib.ga.us cc.gu.us lib.gu.us cc.hi.us lib.hi.us cc.ia.us lib.ia.us cc.id.us lib.id.us cc.il.us lib.il.us cc.in.us lib.in.us cc.ks.us lib.ks.us cc.ky.us lib.ky.us cc.la.us lib.la.us cc.ma.us lib.ma.us cc.md.us lib.md.us cc.me.us lib.me.us cc.mi.us lib.mi.us cc.mn.us lib.mn.us cc.mo.us lib.mo.us cc.ms.us cc.mt.us lib.mt.us cc.nc.us lib.nc.us cc.ne.us lib.ne.us cc.nh.us lib.nh.us cc.nj.us lib.nj.us cc.nm.us lib.nm.us cc.nv.us lib.nv.us cc.ny.us lib.ny.us cc.oh.us lib.oh.us cc.ok.us lib.ok.us cc.or.us lib.or.us cc.pa.us lib.pa.us cc.pr.us lib.pr.us cc.ri.us lib.ri.us cc.sc.us lib.sc.us cc.sd.us lib.sd.us cc.tn.us lib.tn.us cc.tx.us lib.tx.us cc.ut.us lib.ut.us cc.va.us lib.va.us cc.vi.us lib.vi.us cc.vt.us lib.vt.us cc.wa.us lib.wa.us cc.wi.us lib.wi.us cc.wv.us cc.wy.us k12.wy.us lib.wy.us chtr.k12.ma.us paroch.k12.ma.us pvt.k12.ma.us ann-arbor.mi.us cog.mi.us dst.mi.us eaton.mi.us gen.mi.us mus.mi.us tec.mi.us washtenaw.mi.us uy com.uy edu.uy gub.uy mil.uy net.uy org.uy uz co.uz com.uz net.uz org.uz va vc com.vc edu.vc gov.vc mil.vc net.vc org.vc ve arts.ve bib.ve co.ve com.ve e12.ve edu.ve emprende.ve firm.ve gob.ve gov.ve ia.ve info.ve int.ve mil.ve net.ve nom.ve org.ve rar.ve rec.ve store.ve tec.ve web.ve vg edu.vg vi co.vi com.vi k12.vi net.vi org.vi vn ac.vn ai.vn biz.vn com.vn edu.vn gov.vn health.vn id.vn info.vn int.vn io.vn name.vn net.vn org.vn pro.vn angiang.vn bacgiang.vn backan.vn baclieu.vn bacninh.vn baria-vungtau.vn bentre.vn binhdinh.vn binhduong.vn binhphuoc.vn binhthuan.vn camau.vn cantho.vn caobang.vn daklak.vn daknong.vn danang.vn dienbien.vn dongnai.vn dongthap.vn gialai.vn hagiang.vn haiduong.vn haiphong.vn hanam.vn hanoi.vn hatinh.vn haugiang.vn hoabinh.vn hue.vn hungyen.vn khanhhoa.vn kiengiang.vn kontum.vn laichau.vn lamdong.vn langson.vn laocai.vn longan.vn namdinh.vn nghean.vn ninhbinh.vn ninhthuan.vn phutho.vn phuyen.vn quangbinh.vn quangnam.vn quangngai.vn quangninh.vn quangtri.vn soctrang.vn sonla.vn tayninh.vn thaibinh.vn thainguyen.vn thanhhoa.vn thanhphohochiminh.vn thuathienhue.vn tiengiang.vn travinh.vn tuyenquang.vn vinhlong.vn vinhphuc.vn yenbai.vn vu com.vu edu.vu net.vu org.vu wf ws com.ws edu.ws gov.ws net.ws org.ws yt xn--mgbaam7a8h xn--y9a3aq xn--54b7fta0cc xn--90ae xn--mgbcpq6gpa1a xn--90ais xn--fiqs8s xn--fiqz9s xn--lgbbat1ad8j xn--wgbh1c xn--e1a4c xn--qxa6a xn--mgbah1a3hjkrd xn--node xn--qxam xn--j6w193g xn--gmqw5a.xn--j6w193g xn--55qx5d.xn--j6w193g xn--mxtq1m.xn--j6w193g xn--wcvs22d.xn--j6w193g xn--uc0atv.xn--j6w193g xn--od0alg.xn--j6w193g xn--2scrj9c xn--3hcrj9c xn--45br5cyl xn--h2breg3eve xn--h2brj9c8c xn--mgbgu82a xn--rvc1e0am3e xn--h2brj9c xn--mgbbh1a xn--mgbbh1a71e xn--fpcrj9c3d xn--gecrj9c xn--s9brj9c xn--45brj9c xn--xkc2dl3a5ee0h xn--mgba3a4f16a xn--mgba3a4fra xn--mgbtx2b xn--mgbayh7gpa xn--3e0b707e xn--80ao21a xn--q7ce6a xn--fzc2c9e2c xn--xkc2al3hye2a xn--mgbc0a9azcg xn--d1alf xn--l1acc xn--mix891f xn--mix082f xn--mgbx4cd0ab xn--mgb9awbf xn--mgbai9azgqp6j xn--mgbai9a5eva00b xn--ygbi2ammx xn--90a3ac xn--80au.xn--90a3ac xn--90azh.xn--90a3ac xn--d1at.xn--90a3ac xn--c1avg.xn--90a3ac xn--o1ac.xn--90a3ac xn--o1ach.xn--90a3ac xn--p1ai xn--wgbl6a xn--mgberp4a5d4ar xn--mgberp4a5d4a87g xn--mgbqly7c0a67fbc xn--mgbqly7cvafr xn--mgbpl2fh xn--yfro4i67o xn--clchc0ea0b2g2a9gcd xn--ogbpf8fl xn--mgbtf8fl xn--o3cw4h xn--o3cyx2a.xn--o3cw4h xn--12co0c3b4eva.xn--o3cw4h xn--m3ch0j3a.xn--o3cw4h xn--h3cuzk1di.xn--o3cw4h xn--12c1fe0br.xn--o3cw4h xn--12cfi8ixb8l.xn--o3cw4h xn--pgbs0dh xn--kpry57d xn--kprw13d xn--nnx388a xn--j1amh xn--mgb2ddes xxx ye com.ye edu.ye gov.ye mil.ye net.ye org.ye ac.za agric.za alt.za co.za edu.za gov.za grondar.za law.za mil.za net.za ngo.za nic.za nis.za nom.za org.za school.za tm.za web.za zm ac.zm biz.zm co.zm com.zm edu.zm gov.zm info.zm mil.zm net.zm org.zm sch.zm zw ac.zw co.zw gov.zw mil.zw org.zw aaa aarp abb abbott abbvie abc able abogado abudhabi academy accenture accountant accountants aco actor ads adult aeg aetna afl africa agakhan agency aig airbus airforce airtel akdn alibaba alipay allfinanz allstate ally alsace alstom amazon americanexpress americanfamily amex amfam amica amsterdam analytics android anquan anz aol apartments app apple aquarelle arab aramco archi army art arte asda associates athleta attorney auction audi audible audio auspost author auto autos aws axa azure baby baidu banamex band bank bar barcelona barclaycard barclays barefoot bargains baseball basketball bauhaus bayern bbc bbt bbva bcg bcn beats beauty beer berlin best bestbuy bet bharti bible bid bike bing bingo bio black blackfriday blockbuster blog bloomberg blue bms bmw bnpparibas boats boehringer bofa bom bond boo book booking bosch bostik boston bot boutique box bradesco bridgestone broadway broker brother brussels build builders business buy buzz bzh cab cafe cal call calvinklein cam camera camp canon capetown capital capitalone car caravan cards care career careers cars casa case cash casino catering catholic cba cbn cbre center ceo cern cfa cfd chanel channel charity chase chat cheap chintai christmas chrome church cipriani circle cisco citadel citi citic city claims cleaning click clinic clinique clothing cloud club clubmed coach codes coffee college cologne commbank community company compare computer comsec condos construction consulting contact contractors cooking cool corsica country coupon coupons courses cpa credit creditcard creditunion cricket crown crs cruise cruises cuisinella cymru cyou dad dance data date dating datsun day dclk dds deal dealer deals degree delivery dell deloitte delta democrat dental dentist desi design dev dhl diamonds diet digital direct directory discount discover dish diy dnp docs doctor dog domains dot download drive dtv dubai dupont durban dvag dvr earth eat eco edeka education email emerck energy engineer engineering enterprises epson equipment ericsson erni esq estate eurovision eus events exchange expert exposed express extraspace fage fail fairwinds faith family fan fans farm farmers fashion fast fedex feedback ferrari ferrero fidelity fido film final finance financial fire firestone firmdale fish fishing fit fitness flickr flights flir florist flowers fly foo food football ford forex forsale forum foundation fox free fresenius frl frogans frontier ftr fujitsu fun fund furniture futbol fyi gal gallery gallo gallup game games gap garden gay gbiz gdn gea gent genting george ggee gift gifts gives giving glass gle global globo gmail gmbh gmo gmx godaddy gold goldpoint golf goodyear goog google gop got grainger graphics gratis green gripe grocery group gucci guge guide guitars guru hair hamburg hangout haus hbo hdfc hdfcbank health healthcare help helsinki here hermes hiphop hisamitsu hitachi hiv hkt hockey holdings holiday homedepot homegoods homes homesense honda horse hospital host hosting hot hotel hotels hotmail house how hsbc hughes hyatt hyundai ibm icbc ice icu ieee ifm ikano imamat imdb immo immobilien inc industries infiniti ing ink institute insurance insure international intuit investments ipiranga irish ismaili ist istanbul itau itv jaguar java jcb jeep jetzt jewelry jio jll jmp jnj joburg jot joy jpmorgan jprs juegos kaufen kddi kerryhotels kerryproperties kfh kia kids kim kindle kitchen kiwi koeln komatsu kosher kpmg kpn krd kred kuokgroup kyoto lacaixa lamborghini lamer land landrover lanxess lasalle lat latino latrobe law lawyer lds lease leclerc lefrak legal lego lexus lgbt lidl life lifeinsurance lifestyle lighting like lilly limited limo lincoln link live living llc llp loan loans locker locus lol london lotte lotto love lpl lplfinancial ltd ltda lundbeck luxe luxury madrid maif maison makeup man management mango map market marketing markets marriott marshalls mattel mba mckinsey med media meet melbourne meme memorial men menu merck merckmsd miami microsoft mini mint mit mitsubishi mlb mls mma mobile moda moe moi mom monash money monster mormon mortgage moscow moto motorcycles mov movie msd mtn mtr music nab nagoya navy nba nec netbank netflix network neustar new news next nextdirect nexus nfl ngo nhk nico nike nikon ninja nissan nissay nokia norton now nowruz nowtv nra nrw ntt nyc obi observer office okinawa olayan olayangroup ollo omega one ong onl online ooo open oracle orange organic origins osaka otsuka ott ovh page panasonic paris pars partners parts party pay pccw pet pfizer pharmacy phd philips phone photo photography photos physio pics pictet pictures pid pin ping pink pioneer pizza place play playstation plumbing plus pnc pohl poker politie porn praxi press prime prod productions prof progressive promo properties property protection pru prudential pub pwc qpon quebec quest racing radio read realestate realtor realty recipes red redumbrella rehab reise reisen reit reliance ren rent rentals repair report republican rest restaurant review reviews rexroth rich richardli ricoh ril rio rip rocks rodeo rogers room rsvp rugby ruhr run rwe ryukyu saarland safe safety sakura sale salon samsclub samsung sandvik sandvikcoromant sanofi sap sarl sas save saxo sbi sbs scb schaeffler schmidt scholarships school schule schwarz science scot search seat secure security seek select sener services seven sew sex sexy sfr shangrila sharp shell shia shiksha shoes shop shopping shouji show silk sina singles site ski skin sky skype sling smart smile sncf soccer social softbank software sohu solar solutions song sony soy spa space sport spot srl stada staples star statebank statefarm stc stcgroup stockholm storage store stream studio study style sucks supplies supply support surf surgery suzuki swatch swiss sydney systems tab taipei talk taobao target tatamotors tatar tattoo tax taxi tci tdk team tech technology temasek tennis teva thd theater theatre tiaa tickets tienda tips tires tirol tjmaxx tjx tkmaxx tmall today tokyo tools top toray toshiba total tours town toyota toys trade trading training travel travelers travelersinsurance trust trv tube tui tunes tushu tvs ubank ubs unicom university uno uol ups vacations vana vanguard vegas ventures verisign versicherung vet viajes video vig viking villas vin vip virgin visa vision viva vivo vlaanderen vodka volvo vote voting voto voyage wales walmart walter wang wanggou watch watches weather weatherchannel web webcam weber website wed wedding weibo weir whoswho wien wiki williamhill win windows wine winners wme woodside work works world wow wtc wtf xbox xerox xihuan xin xn--11b4c3d xn--1ck2e1b xn--1qqw23a xn--30rr7y xn--3bst00m xn--3ds443g xn--3pxu8k xn--42c2d9a xn--45q11c xn--4gbrim xn--55qw42g xn--55qx5d xn--5su34j936bgsg xn--5tzm5g xn--6frz82g xn--6qq986b3xl xn--80adxhks xn--80aqecdr1a xn--80asehdb xn--80aswg xn--8y0a063a xn--9dbq2a xn--9et52u xn--9krt00a xn--b4w605ferd xn--bck1b9a5dre4c xn--c1avg xn--c2br7g xn--cck2b3b xn--cckwcxetd xn--cg4bki xn--czr694b xn--czrs0t xn--czru2d xn--d1acj3b xn--eckvdtc9d xn--efvy88h xn--fct429k xn--fhbei xn--fiq228c5hs xn--fiq64b xn--fjq720a xn--flw351e xn--fzys8d69uvgm xn--g2xx48c xn--gckr3f0f xn--gk3at1e xn--hxt814e xn--i1b6b1a6a2e xn--imr513n xn--io0a7i xn--j1aef xn--jlq480n2rg xn--jvr189m xn--kcrx77d1x4a xn--kput3i xn--mgba3a3ejt xn--mgba7c0bbn0a xn--mgbab2bd xn--mgbca7dzdo xn--mgbi4ecexp xn--mgbt3dhd xn--mk1bu44c xn--mxtq1m xn--ngbc5azd xn--ngbe9e0a xn--ngbrx xn--nqv7f xn--nqv7fs00ema xn--nyqy26a xn--otu796d xn--p1acf xn--pssy2u xn--q9jyb4c xn--qcka1pmc xn--rhqv96g xn--rovu88b xn--ses554g xn--t60b56a xn--tckwe xn--tiq49xqyj xn--unup4y xn--vermgensberater-ctb xn--vermgensberatung-pwb xn--vhquv xn--vuq861b xn--w4r85el8fhu5dnra xn--w4rs40l xn--xhq521b xn--zfr164b xyz yachts yahoo yamaxun yandex yodobashi yoga yokohama you youtube yun zappos zara zero zip zone zuerich co.krd edu.krd art.pl gliwice.pl krakow.pl poznan.pl wroc.pl zakopane.pl cc.ua inf.ua ltd.ua 611.to a2hosted.com cpserver.com activetrail.biz myaddr.dev myaddr.io dyn.addr.tools myaddr.tools adobeaemcloud.com *.dev.adobeaemcloud.com aem.live hlx.live adobeaemcloud.net aem.network aem.page hlx.page aem.reviews adobeio-static.net adobeioruntime.net africa.com *.auiusercontent.com beep.pl aiven.app *.aivencloud.com akadns.net akamai.net akamai-staging.net akamaiedge.net akamaiedge-staging.net akamaihd.net akamaihd-staging.net akamaiorigin.net akamaiorigin-staging.net akamaized.net akamaized-staging.net edgekey.net edgekey-staging.net edgesuite.net edgesuite-staging.net barsy.ca *.compute.estate *.alces.network alibabacloudcs.com *.ztna-dingtalk.com ms.fun ms.show kasserver.com altervista.org alwaysdata.net myamaze.net execute-api.cn-north-1.amazonaws.com.cn execute-api.cn-northwest-1.amazonaws.com.cn execute-api.af-south-1.amazonaws.com execute-api.ap-east-1.amazonaws.com execute-api.ap-northeast-1.amazonaws.com execute-api.ap-northeast-2.amazonaws.com execute-api.ap-northeast-3.amazonaws.com execute-api.ap-south-1.amazonaws.com execute-api.ap-south-2.amazonaws.com execute-api.ap-southeast-1.amazonaws.com execute-api.ap-southeast-2.amazonaws.com execute-api.ap-southeast-3.amazonaws.com execute-api.ap-southeast-4.amazonaws.com execute-api.ap-southeast-5.amazonaws.com execute-api.ca-central-1.amazonaws.com execute-api.ca-west-1.amazonaws.com execute-api.eu-central-1.amazonaws.com execute-api.eu-central-2.amazonaws.com execute-api.eu-north-1.amazonaws.com execute-api.eu-south-1.amazonaws.com execute-api.eu-south-2.amazonaws.com execute-api.eu-west-1.amazonaws.com execute-api.eu-west-2.amazonaws.com execute-api.eu-west-3.amazonaws.com execute-api.il-central-1.amazonaws.com execute-api.me-central-1.amazonaws.com execute-api.me-south-1.amazonaws.com execute-api.sa-east-1.amazonaws.com execute-api.us-east-1.amazonaws.com execute-api.us-east-2.amazonaws.com execute-api.us-gov-east-1.amazonaws.com execute-api.us-gov-west-1.amazonaws.com execute-api.us-west-1.amazonaws.com execute-api.us-west-2.amazonaws.com consent-portal.bedrock-agentcore.ap-northeast-1.amazonaws.com consent-portal.bedrock-agentcore.ap-northeast-2.amazonaws.com consent-portal.bedrock-agentcore.ap-south-1.amazonaws.com consent-portal.bedrock-agentcore.ap-south-2.amazonaws.com consent-portal.bedrock-agentcore.ap-southeast-1.amazonaws.com consent-portal.bedrock-agentcore.ap-southeast-2.amazonaws.com consent-portal.bedrock-agentcore.ap-southeast-5.amazonaws.com consent-portal.bedrock-agentcore.ap-southeast-7.amazonaws.com consent-portal.bedrock-agentcore.ca-central-1.amazonaws.com consent-portal.bedrock-agentcore.eu-central-1.amazonaws.com consent-portal.bedrock-agentcore.eu-north-1.amazonaws.com consent-portal.bedrock-agentcore.eu-south-1.amazonaws.com consent-portal.bedrock-agentcore.eu-south-2.amazonaws.com consent-portal.bedrock-agentcore.eu-west-1.amazonaws.com consent-portal.bedrock-agentcore.eu-west-2.amazonaws.com consent-portal.bedrock-agentcore.eu-west-3.amazonaws.com consent-portal.bedrock-agentcore.sa-east-1.amazonaws.com consent-portal.bedrock-agentcore.us-east-1.amazonaws.com consent-portal.bedrock-agentcore.us-east-2.amazonaws.com consent-portal.bedrock-agentcore.us-gov-west-1.amazonaws.com consent-portal.bedrock-agentcore.us-west-1.amazonaws.com consent-portal.bedrock-agentcore.us-west-2.amazonaws.com cloudfront.net auth.af-south-1.amazoncognito.com auth.ap-east-1.amazoncognito.com auth.ap-east-2.amazoncognito.com auth.ap-northeast-1.amazoncognito.com auth.ap-northeast-2.amazoncognito.com auth.ap-northeast-3.amazoncognito.com auth.ap-south-1.amazoncognito.com auth.ap-south-2.amazoncognito.com auth.ap-southeast-1.amazoncognito.com auth.ap-southeast-2.amazoncognito.com auth.ap-southeast-3.amazoncognito.com auth.ap-southeast-4.amazoncognito.com auth.ap-southeast-5.amazoncognito.com auth.ap-southeast-6.amazoncognito.com auth.ap-southeast-7.amazoncognito.com auth.ca-central-1.amazoncognito.com auth.ca-west-1.amazoncognito.com auth.eu-central-1.amazoncognito.com auth.eu-central-2.amazoncognito.com auth.eu-north-1.amazoncognito.com auth.eu-south-1.amazoncognito.com auth.eu-south-2.amazoncognito.com auth.eu-west-1.amazoncognito.com auth.eu-west-2.amazoncognito.com auth.eu-west-3.amazoncognito.com auth.il-central-1.amazoncognito.com auth.me-central-1.amazoncognito.com auth.me-south-1.amazoncognito.com auth.mx-central-1.amazoncognito.com auth.sa-east-1.amazoncognito.com auth.us-east-1.amazoncognito.com auth-fips.us-east-1.amazoncognito.com auth.us-east-2.amazoncognito.com auth-fips.us-east-2.amazoncognito.com auth-fips.us-gov-east-1.amazoncognito.com auth-fips.us-gov-west-1.amazoncognito.com auth.us-west-1.amazoncognito.com auth-fips.us-west-1.amazoncognito.com auth.us-west-2.amazoncognito.com auth-fips.us-west-2.amazoncognito.com auth.cognito-idp.eusc-de-east-1.on.amazonwebservices.eu *.compute.amazonaws.com.cn *.compute.amazonaws.com *.compute-1.amazonaws.com us-east-1.amazonaws.com emrappui-prod.cn-north-1.amazonaws.com.cn emrnotebooks-prod.cn-north-1.amazonaws.com.cn emrstudio-prod.cn-north-1.amazonaws.com.cn emrappui-prod.cn-northwest-1.amazonaws.com.cn emrnotebooks-prod.cn-northwest-1.amazonaws.com.cn emrstudio-prod.cn-northwest-1.amazonaws.com.cn emrappui-prod.af-south-1.amazonaws.com emrnotebooks-prod.af-south-1.amazonaws.com emrstudio-prod.af-south-1.amazonaws.com emrappui-prod.ap-east-1.amazonaws.com emrnotebooks-prod.ap-east-1.amazonaws.com emrstudio-prod.ap-east-1.amazonaws.com emrappui-prod.ap-northeast-1.amazonaws.com emrnotebooks-prod.ap-northeast-1.amazonaws.com emrstudio-prod.ap-northeast-1.amazonaws.com emrappui-prod.ap-northeast-2.amazonaws.com emrnotebooks-prod.ap-northeast-2.amazonaws.com emrstudio-prod.ap-northeast-2.amazonaws.com emrappui-prod.ap-northeast-3.amazonaws.com emrnotebooks-prod.ap-northeast-3.amazonaws.com emrstudio-prod.ap-northeast-3.amazonaws.com emrappui-prod.ap-south-1.amazonaws.com emrnotebooks-prod.ap-south-1.amazonaws.com emrstudio-prod.ap-south-1.amazonaws.com emrappui-prod.ap-south-2.amazonaws.com emrnotebooks-prod.ap-south-2.amazonaws.com emrstudio-prod.ap-south-2.amazonaws.com emrappui-prod.ap-southeast-1.amazonaws.com emrnotebooks-prod.ap-southeast-1.amazonaws.com emrstudio-prod.ap-southeast-1.amazonaws.com emrappui-prod.ap-southeast-2.amazonaws.com emrnotebooks-prod.ap-southeast-2.amazonaws.com emrstudio-prod.ap-southeast-2.amazonaws.com emrappui-prod.ap-southeast-3.amazonaws.com emrnotebooks-prod.ap-southeast-3.amazonaws.com emrstudio-prod.ap-southeast-3.amazonaws.com emrappui-prod.ap-southeast-4.amazonaws.com emrnotebooks-prod.ap-southeast-4.amazonaws.com emrstudio-prod.ap-southeast-4.amazonaws.com emrappui-prod.ca-central-1.amazonaws.com emrnotebooks-prod.ca-central-1.amazonaws.com emrstudio-prod.ca-central-1.amazonaws.com emrappui-prod.ca-west-1.amazonaws.com emrnotebooks-prod.ca-west-1.amazonaws.com emrstudio-prod.ca-west-1.amazonaws.com emrappui-prod.eu-central-1.amazonaws.com emrnotebooks-prod.eu-central-1.amazonaws.com emrstudio-prod.eu-central-1.amazonaws.com emrappui-prod.eu-central-2.amazonaws.com emrnotebooks-prod.eu-central-2.amazonaws.com emrstudio-prod.eu-central-2.amazonaws.com emrappui-prod.eu-north-1.amazonaws.com emrnotebooks-prod.eu-north-1.amazonaws.com emrstudio-prod.eu-north-1.amazonaws.com emrappui-prod.eu-south-1.amazonaws.com emrnotebooks-prod.eu-south-1.amazonaws.com emrstudio-prod.eu-south-1.amazonaws.com emrappui-prod.eu-south-2.amazonaws.com emrnotebooks-prod.eu-south-2.amazonaws.com emrstudio-prod.eu-south-2.amazonaws.com emrappui-prod.eu-west-1.amazonaws.com emrnotebooks-prod.eu-west-1.amazonaws.com emrstudio-prod.eu-west-1.amazonaws.com emrappui-prod.eu-west-2.amazonaws.com emrnotebooks-prod.eu-west-2.amazonaws.com emrstudio-prod.eu-west-2.amazonaws.com emrappui-prod.eu-west-3.amazonaws.com emrnotebooks-prod.eu-west-3.amazonaws.com emrstudio-prod.eu-west-3.amazonaws.com emrappui-prod.il-central-1.amazonaws.com emrnotebooks-prod.il-central-1.amazonaws.com emrstudio-prod.il-central-1.amazonaws.com emrappui-prod.me-central-1.amazonaws.com emrnotebooks-prod.me-central-1.amazonaws.com emrstudio-prod.me-central-1.amazonaws.com emrappui-prod.me-south-1.amazonaws.com emrnotebooks-prod.me-south-1.amazonaws.com emrstudio-prod.me-south-1.amazonaws.com emrappui-prod.sa-east-1.amazonaws.com emrnotebooks-prod.sa-east-1.amazonaws.com emrstudio-prod.sa-east-1.amazonaws.com emrappui-prod.us-east-1.amazonaws.com emrnotebooks-prod.us-east-1.amazonaws.com emrstudio-prod.us-east-1.amazonaws.com emrappui-prod.us-east-2.amazonaws.com emrnotebooks-prod.us-east-2.amazonaws.com emrstudio-prod.us-east-2.amazonaws.com emrappui-prod.us-gov-east-1.amazonaws.com emrnotebooks-prod.us-gov-east-1.amazonaws.com emrstudio-prod.us-gov-east-1.amazonaws.com emrappui-prod.us-gov-west-1.amazonaws.com emrnotebooks-prod.us-gov-west-1.amazonaws.com emrstudio-prod.us-gov-west-1.amazonaws.com emrappui-prod.us-west-1.amazonaws.com emrnotebooks-prod.us-west-1.amazonaws.com emrstudio-prod.us-west-1.amazonaws.com emrappui-prod.us-west-2.amazonaws.com emrnotebooks-prod.us-west-2.amazonaws.com emrstudio-prod.us-west-2.amazonaws.com amazonlightsail.com *.ap-east-1.cs.amazonlightsail.com *.ap-northeast-1.cs.amazonlightsail.com *.ap-northeast-2.cs.amazonlightsail.com *.ap-south-1.cs.amazonlightsail.com *.ap-southeast-1.cs.amazonlightsail.com *.ap-southeast-2.cs.amazonlightsail.com *.ap-southeast-3.cs.amazonlightsail.com *.ap-southeast-5.cs.amazonlightsail.com *.ca-central-1.cs.amazonlightsail.com *.eu-central-1.cs.amazonlightsail.com *.eu-north-1.cs.amazonlightsail.com *.eu-south-2.cs.amazonlightsail.com *.eu-west-1.cs.amazonlightsail.com *.eu-west-2.cs.amazonlightsail.com *.eu-west-3.cs.amazonlightsail.com *.sa-east-1.cs.amazonlightsail.com *.us-east-1.cs.amazonlightsail.com *.us-east-2.cs.amazonlightsail.com *.us-west-2.cs.amazonlightsail.com *.airflow.af-south-1.on.aws *.airflow.ap-east-1.on.aws *.airflow.ap-northeast-1.on.aws *.airflow.ap-northeast-2.on.aws *.airflow.ap-northeast-3.on.aws *.airflow.ap-south-1.on.aws *.airflow.ap-south-2.on.aws *.airflow.ap-southeast-1.on.aws *.airflow.ap-southeast-2.on.aws *.airflow.ap-southeast-3.on.aws *.airflow.ap-southeast-4.on.aws *.airflow.ap-southeast-5.on.aws *.airflow.ap-southeast-7.on.aws *.airflow.ca-central-1.on.aws *.airflow.ca-west-1.on.aws *.airflow.eu-central-1.on.aws *.airflow.eu-central-2.on.aws *.airflow.eu-north-1.on.aws *.airflow.eu-south-1.on.aws *.airflow.eu-south-2.on.aws *.airflow.eu-west-1.on.aws *.airflow.eu-west-2.on.aws *.airflow.eu-west-3.on.aws *.airflow.il-central-1.on.aws *.airflow.me-central-1.on.aws *.airflow.me-south-1.on.aws *.airflow.sa-east-1.on.aws *.airflow.us-east-1.on.aws *.airflow.us-east-2.on.aws *.airflow.us-west-1.on.aws *.airflow.us-west-2.on.aws *.cn-north-1.airflow.amazonaws.com.cn *.cn-northwest-1.airflow.amazonaws.com.cn *.airflow.cn-north-1.on.amazonwebservices.com.cn *.airflow.cn-northwest-1.on.amazonwebservices.com.cn *.af-south-1.airflow.amazonaws.com *.ap-east-1.airflow.amazonaws.com *.ap-northeast-1.airflow.amazonaws.com *.ap-northeast-2.airflow.amazonaws.com *.ap-northeast-3.airflow.amazonaws.com *.ap-south-1.airflow.amazonaws.com *.ap-south-2.airflow.amazonaws.com *.ap-southeast-1.airflow.amazonaws.com *.ap-southeast-2.airflow.amazonaws.com *.ap-southeast-3.airflow.amazonaws.com *.ap-southeast-4.airflow.amazonaws.com *.ap-southeast-5.airflow.amazonaws.com *.ap-southeast-7.airflow.amazonaws.com *.ca-central-1.airflow.amazonaws.com *.ca-west-1.airflow.amazonaws.com *.eu-central-1.airflow.amazonaws.com *.eu-central-2.airflow.amazonaws.com *.eu-north-1.airflow.amazonaws.com *.eu-south-1.airflow.amazonaws.com *.eu-south-2.airflow.amazonaws.com *.eu-west-1.airflow.amazonaws.com *.eu-west-2.airflow.amazonaws.com *.eu-west-3.airflow.amazonaws.com *.il-central-1.airflow.amazonaws.com *.me-central-1.airflow.amazonaws.com *.me-south-1.airflow.amazonaws.com *.sa-east-1.airflow.amazonaws.com *.us-east-1.airflow.amazonaws.com *.us-east-2.airflow.amazonaws.com *.us-west-1.airflow.amazonaws.com *.us-west-2.airflow.amazonaws.com *.rds.cn-north-1.amazonaws.com.cn *.rds.cn-northwest-1.amazonaws.com.cn *.af-south-1.rds.amazonaws.com *.ap-east-1.rds.amazonaws.com *.ap-east-2.rds.amazonaws.com *.ap-northeast-1.rds.amazonaws.com *.ap-northeast-2.rds.amazonaws.com *.ap-northeast-3.rds.amazonaws.com *.ap-south-1.rds.amazonaws.com *.ap-south-2.rds.amazonaws.com *.ap-southeast-1.rds.amazonaws.com *.ap-southeast-2.rds.amazonaws.com *.ap-southeast-3.rds.amazonaws.com *.ap-southeast-4.rds.amazonaws.com *.ap-southeast-5.rds.amazonaws.com *.ap-southeast-6.rds.amazonaws.com *.ap-southeast-7.rds.amazonaws.com *.ca-central-1.rds.amazonaws.com *.ca-west-1.rds.amazonaws.com *.eu-central-1.rds.amazonaws.com *.eu-central-2.rds.amazonaws.com *.eu-west-1.rds.amazonaws.com *.eu-west-2.rds.amazonaws.com *.eu-west-3.rds.amazonaws.com *.il-central-1.rds.amazonaws.com *.me-central-1.rds.amazonaws.com *.me-south-1.rds.amazonaws.com *.mx-central-1.rds.amazonaws.com *.sa-east-1.rds.amazonaws.com *.us-east-1.rds.amazonaws.com *.us-east-2.rds.amazonaws.com *.us-gov-east-1.rds.amazonaws.com *.us-gov-west-1.rds.amazonaws.com *.us-northeast-1.rds.amazonaws.com *.us-west-1.rds.amazonaws.com *.us-west-2.rds.amazonaws.com s3.dualstack.cn-north-1.amazonaws.com.cn s3-accesspoint.dualstack.cn-north-1.amazonaws.com.cn s3-website.dualstack.cn-north-1.amazonaws.com.cn s3.cn-north-1.amazonaws.com.cn s3-accesspoint.cn-north-1.amazonaws.com.cn s3-deprecated.cn-north-1.amazonaws.com.cn s3-object-lambda.cn-north-1.amazonaws.com.cn s3-website.cn-north-1.amazonaws.com.cn s3.dualstack.cn-northwest-1.amazonaws.com.cn s3-accesspoint.dualstack.cn-northwest-1.amazonaws.com.cn s3.cn-northwest-1.amazonaws.com.cn s3-accesspoint.cn-northwest-1.amazonaws.com.cn s3-object-lambda.cn-northwest-1.amazonaws.com.cn s3-website.cn-northwest-1.amazonaws.com.cn s3.dualstack.af-south-1.amazonaws.com s3-accesspoint.dualstack.af-south-1.amazonaws.com s3-website.dualstack.af-south-1.amazonaws.com s3.af-south-1.amazonaws.com s3-accesspoint.af-south-1.amazonaws.com s3-object-lambda.af-south-1.amazonaws.com s3-website.af-south-1.amazonaws.com s3.dualstack.ap-east-1.amazonaws.com s3-accesspoint.dualstack.ap-east-1.amazonaws.com s3.ap-east-1.amazonaws.com s3-accesspoint.ap-east-1.amazonaws.com s3-object-lambda.ap-east-1.amazonaws.com s3-website.ap-east-1.amazonaws.com s3.dualstack.ap-northeast-1.amazonaws.com s3-accesspoint.dualstack.ap-northeast-1.amazonaws.com s3-website.dualstack.ap-northeast-1.amazonaws.com s3.ap-northeast-1.amazonaws.com s3-accesspoint.ap-northeast-1.amazonaws.com s3-object-lambda.ap-northeast-1.amazonaws.com s3-website.ap-northeast-1.amazonaws.com s3.dualstack.ap-northeast-2.amazonaws.com s3-accesspoint.dualstack.ap-northeast-2.amazonaws.com s3-website.dualstack.ap-northeast-2.amazonaws.com s3.ap-northeast-2.amazonaws.com s3-accesspoint.ap-northeast-2.amazonaws.com s3-object-lambda.ap-northeast-2.amazonaws.com s3-website.ap-northeast-2.amazonaws.com s3.dualstack.ap-northeast-3.amazonaws.com s3-accesspoint.dualstack.ap-northeast-3.amazonaws.com s3-website.dualstack.ap-northeast-3.amazonaws.com s3.ap-northeast-3.amazonaws.com s3-accesspoint.ap-northeast-3.amazonaws.com s3-object-lambda.ap-northeast-3.amazonaws.com s3-website.ap-northeast-3.amazonaws.com s3.dualstack.ap-south-1.amazonaws.com s3-accesspoint.dualstack.ap-south-1.amazonaws.com s3-website.dualstack.ap-south-1.amazonaws.com s3.ap-south-1.amazonaws.com s3-accesspoint.ap-south-1.amazonaws.com s3-object-lambda.ap-south-1.amazonaws.com s3-website.ap-south-1.amazonaws.com s3.dualstack.ap-south-2.amazonaws.com s3-accesspoint.dualstack.ap-south-2.amazonaws.com s3-website.dualstack.ap-south-2.amazonaws.com s3.ap-south-2.amazonaws.com s3-accesspoint.ap-south-2.amazonaws.com s3-object-lambda.ap-south-2.amazonaws.com s3-website.ap-south-2.amazonaws.com s3.dualstack.ap-southeast-1.amazonaws.com s3-accesspoint.dualstack.ap-southeast-1.amazonaws.com s3-website.dualstack.ap-southeast-1.amazonaws.com s3.ap-southeast-1.amazonaws.com s3-accesspoint.ap-southeast-1.amazonaws.com s3-object-lambda.ap-southeast-1.amazonaws.com s3-website.ap-southeast-1.amazonaws.com s3.dualstack.ap-southeast-2.amazonaws.com s3-accesspoint.dualstack.ap-southeast-2.amazonaws.com s3-website.dualstack.ap-southeast-2.amazonaws.com s3.ap-southeast-2.amazonaws.com s3-accesspoint.ap-southeast-2.amazonaws.com s3-object-lambda.ap-southeast-2.amazonaws.com s3-website.ap-southeast-2.amazonaws.com s3.dualstack.ap-southeast-3.amazonaws.com s3-accesspoint.dualstack.ap-southeast-3.amazonaws.com s3-website.dualstack.ap-southeast-3.amazonaws.com s3.ap-southeast-3.amazonaws.com s3-accesspoint.ap-southeast-3.amazonaws.com s3-object-lambda.ap-southeast-3.amazonaws.com s3-website.ap-southeast-3.amazonaws.com s3.dualstack.ap-southeast-4.amazonaws.com s3-accesspoint.dualstack.ap-southeast-4.amazonaws.com s3-website.dualstack.ap-southeast-4.amazonaws.com s3.ap-southeast-4.amazonaws.com s3-accesspoint.ap-southeast-4.amazonaws.com s3-object-lambda.ap-southeast-4.amazonaws.com s3-website.ap-southeast-4.amazonaws.com s3.dualstack.ap-southeast-5.amazonaws.com s3-accesspoint.dualstack.ap-southeast-5.amazonaws.com s3-website.dualstack.ap-southeast-5.amazonaws.com s3.ap-southeast-5.amazonaws.com s3-accesspoint.ap-southeast-5.amazonaws.com s3-deprecated.ap-southeast-5.amazonaws.com s3-object-lambda.ap-southeast-5.amazonaws.com s3-website.ap-southeast-5.amazonaws.com s3.dualstack.ca-central-1.amazonaws.com s3-accesspoint.dualstack.ca-central-1.amazonaws.com s3-accesspoint-fips.dualstack.ca-central-1.amazonaws.com s3-fips.dualstack.ca-central-1.amazonaws.com s3-website.dualstack.ca-central-1.amazonaws.com s3.ca-central-1.amazonaws.com s3-accesspoint.ca-central-1.amazonaws.com s3-accesspoint-fips.ca-central-1.amazonaws.com s3-fips.ca-central-1.amazonaws.com s3-object-lambda.ca-central-1.amazonaws.com s3-website.ca-central-1.amazonaws.com s3.dualstack.ca-west-1.amazonaws.com s3-accesspoint.dualstack.ca-west-1.amazonaws.com s3-accesspoint-fips.dualstack.ca-west-1.amazonaws.com s3-fips.dualstack.ca-west-1.amazonaws.com s3-website.dualstack.ca-west-1.amazonaws.com s3.ca-west-1.amazonaws.com s3-accesspoint.ca-west-1.amazonaws.com s3-accesspoint-fips.ca-west-1.amazonaws.com s3-fips.ca-west-1.amazonaws.com s3-object-lambda.ca-west-1.amazonaws.com s3-website.ca-west-1.amazonaws.com s3.dualstack.eu-central-1.amazonaws.com s3-accesspoint.dualstack.eu-central-1.amazonaws.com s3-website.dualstack.eu-central-1.amazonaws.com s3.eu-central-1.amazonaws.com s3-accesspoint.eu-central-1.amazonaws.com s3-object-lambda.eu-central-1.amazonaws.com s3-website.eu-central-1.amazonaws.com s3.dualstack.eu-central-2.amazonaws.com s3-accesspoint.dualstack.eu-central-2.amazonaws.com s3-website.dualstack.eu-central-2.amazonaws.com s3.eu-central-2.amazonaws.com s3-accesspoint.eu-central-2.amazonaws.com s3-object-lambda.eu-central-2.amazonaws.com s3-website.eu-central-2.amazonaws.com s3.dualstack.eu-north-1.amazonaws.com s3-accesspoint.dualstack.eu-north-1.amazonaws.com s3.eu-north-1.amazonaws.com s3-accesspoint.eu-north-1.amazonaws.com s3-object-lambda.eu-north-1.amazonaws.com s3-website.eu-north-1.amazonaws.com s3.dualstack.eu-south-1.amazonaws.com s3-accesspoint.dualstack.eu-south-1.amazonaws.com s3-website.dualstack.eu-south-1.amazonaws.com s3.eu-south-1.amazonaws.com s3-accesspoint.eu-south-1.amazonaws.com s3-object-lambda.eu-south-1.amazonaws.com s3-website.eu-south-1.amazonaws.com s3.dualstack.eu-south-2.amazonaws.com s3-accesspoint.dualstack.eu-south-2.amazonaws.com s3-website.dualstack.eu-south-2.amazonaws.com s3.eu-south-2.amazonaws.com s3-accesspoint.eu-south-2.amazonaws.com s3-object-lambda.eu-south-2.amazonaws.com s3-website.eu-south-2.amazonaws.com s3.dualstack.eu-west-1.amazonaws.com s3-accesspoint.dualstack.eu-west-1.amazonaws.com s3-website.dualstack.eu-west-1.amazonaws.com s3.eu-west-1.amazonaws.com s3-accesspoint.eu-west-1.amazonaws.com s3-deprecated.eu-west-1.amazonaws.com s3-object-lambda.eu-west-1.amazonaws.com s3-website.eu-west-1.amazonaws.com s3.dualstack.eu-west-2.amazonaws.com s3-accesspoint.dualstack.eu-west-2.amazonaws.com s3.eu-west-2.amazonaws.com s3-accesspoint.eu-west-2.amazonaws.com s3-object-lambda.eu-west-2.amazonaws.com s3-website.eu-west-2.amazonaws.com s3.dualstack.eu-west-3.amazonaws.com s3-accesspoint.dualstack.eu-west-3.amazonaws.com s3-website.dualstack.eu-west-3.amazonaws.com s3.eu-west-3.amazonaws.com s3-accesspoint.eu-west-3.amazonaws.com s3-object-lambda.eu-west-3.amazonaws.com s3-website.eu-west-3.amazonaws.com s3.dualstack.il-central-1.amazonaws.com s3-accesspoint.dualstack.il-central-1.amazonaws.com s3-website.dualstack.il-central-1.amazonaws.com s3.il-central-1.amazonaws.com s3-accesspoint.il-central-1.amazonaws.com s3-object-lambda.il-central-1.amazonaws.com s3-website.il-central-1.amazonaws.com s3.dualstack.me-central-1.amazonaws.com s3-accesspoint.dualstack.me-central-1.amazonaws.com s3-website.dualstack.me-central-1.amazonaws.com s3.me-central-1.amazonaws.com s3-accesspoint.me-central-1.amazonaws.com s3-object-lambda.me-central-1.amazonaws.com s3-website.me-central-1.amazonaws.com s3.dualstack.me-south-1.amazonaws.com s3-accesspoint.dualstack.me-south-1.amazonaws.com s3.me-south-1.amazonaws.com s3-accesspoint.me-south-1.amazonaws.com s3-object-lambda.me-south-1.amazonaws.com s3-website.me-south-1.amazonaws.com s3.amazonaws.com s3-1.amazonaws.com s3-ap-east-1.amazonaws.com s3-ap-northeast-1.amazonaws.com s3-ap-northeast-2.amazonaws.com s3-ap-northeast-3.amazonaws.com s3-ap-south-1.amazonaws.com s3-ap-southeast-1.amazonaws.com s3-ap-southeast-2.amazonaws.com s3-ca-central-1.amazonaws.com s3-eu-central-1.amazonaws.com s3-eu-north-1.amazonaws.com s3-eu-west-1.amazonaws.com s3-eu-west-2.amazonaws.com s3-eu-west-3.amazonaws.com s3-external-1.amazonaws.com s3-fips-us-gov-east-1.amazonaws.com s3-fips-us-gov-west-1.amazonaws.com mrap.accesspoint.s3-global.amazonaws.com s3-me-south-1.amazonaws.com s3-sa-east-1.amazonaws.com s3-us-east-2.amazonaws.com s3-us-gov-east-1.amazonaws.com s3-us-gov-west-1.amazonaws.com s3-us-west-1.amazonaws.com s3-us-west-2.amazonaws.com s3-website-ap-northeast-1.amazonaws.com s3-website-ap-southeast-1.amazonaws.com s3-website-ap-southeast-2.amazonaws.com s3-website-eu-west-1.amazonaws.com s3-website-sa-east-1.amazonaws.com s3-website-us-east-1.amazonaws.com s3-website-us-gov-west-1.amazonaws.com s3-website-us-west-1.amazonaws.com s3-website-us-west-2.amazonaws.com s3.dualstack.sa-east-1.amazonaws.com s3-accesspoint.dualstack.sa-east-1.amazonaws.com s3-website.dualstack.sa-east-1.amazonaws.com s3.sa-east-1.amazonaws.com s3-accesspoint.sa-east-1.amazonaws.com s3-object-lambda.sa-east-1.amazonaws.com s3-website.sa-east-1.amazonaws.com s3.dualstack.us-east-1.amazonaws.com s3-accesspoint.dualstack.us-east-1.amazonaws.com s3-accesspoint-fips.dualstack.us-east-1.amazonaws.com s3-fips.dualstack.us-east-1.amazonaws.com s3-website.dualstack.us-east-1.amazonaws.com s3.us-east-1.amazonaws.com s3-accesspoint.us-east-1.amazonaws.com s3-accesspoint-fips.us-east-1.amazonaws.com s3-deprecated.us-east-1.amazonaws.com s3-fips.us-east-1.amazonaws.com s3-object-lambda.us-east-1.amazonaws.com s3-website.us-east-1.amazonaws.com s3.dualstack.us-east-2.amazonaws.com s3-accesspoint.dualstack.us-east-2.amazonaws.com s3-accesspoint-fips.dualstack.us-east-2.amazonaws.com s3-fips.dualstack.us-east-2.amazonaws.com s3-website.dualstack.us-east-2.amazonaws.com s3.us-east-2.amazonaws.com s3-accesspoint.us-east-2.amazonaws.com s3-accesspoint-fips.us-east-2.amazonaws.com s3-deprecated.us-east-2.amazonaws.com s3-fips.us-east-2.amazonaws.com s3-object-lambda.us-east-2.amazonaws.com s3-website.us-east-2.amazonaws.com s3.dualstack.us-gov-east-1.amazonaws.com s3-accesspoint.dualstack.us-gov-east-1.amazonaws.com s3-accesspoint-fips.dualstack.us-gov-east-1.amazonaws.com s3-fips.dualstack.us-gov-east-1.amazonaws.com s3-website.dualstack.us-gov-east-1.amazonaws.com s3.us-gov-east-1.amazonaws.com s3-accesspoint.us-gov-east-1.amazonaws.com s3-accesspoint-fips.us-gov-east-1.amazonaws.com s3-fips.us-gov-east-1.amazonaws.com s3-object-lambda.us-gov-east-1.amazonaws.com s3-website.us-gov-east-1.amazonaws.com s3.dualstack.us-gov-west-1.amazonaws.com s3-accesspoint.dualstack.us-gov-west-1.amazonaws.com s3-accesspoint-fips.dualstack.us-gov-west-1.amazonaws.com s3-fips.dualstack.us-gov-west-1.amazonaws.com s3-website.dualstack.us-gov-west-1.amazonaws.com s3.us-gov-west-1.amazonaws.com s3-accesspoint.us-gov-west-1.amazonaws.com s3-accesspoint-fips.us-gov-west-1.amazonaws.com s3-fips.us-gov-west-1.amazonaws.com s3-object-lambda.us-gov-west-1.amazonaws.com s3-website.us-gov-west-1.amazonaws.com s3.dualstack.us-west-1.amazonaws.com s3-accesspoint.dualstack.us-west-1.amazonaws.com s3-accesspoint-fips.dualstack.us-west-1.amazonaws.com s3-fips.dualstack.us-west-1.amazonaws.com s3-website.dualstack.us-west-1.amazonaws.com s3.us-west-1.amazonaws.com s3-accesspoint.us-west-1.amazonaws.com s3-accesspoint-fips.us-west-1.amazonaws.com s3-fips.us-west-1.amazonaws.com s3-object-lambda.us-west-1.amazonaws.com s3-website.us-west-1.amazonaws.com s3.dualstack.us-west-2.amazonaws.com s3-accesspoint.dualstack.us-west-2.amazonaws.com s3-accesspoint-fips.dualstack.us-west-2.amazonaws.com s3-fips.dualstack.us-west-2.amazonaws.com s3-website.dualstack.us-west-2.amazonaws.com s3.us-west-2.amazonaws.com s3-accesspoint.us-west-2.amazonaws.com s3-accesspoint-fips.us-west-2.amazonaws.com s3-deprecated.us-west-2.amazonaws.com s3-fips.us-west-2.amazonaws.com s3-object-lambda.us-west-2.amazonaws.com s3-website.us-west-2.amazonaws.com labeling.ap-northeast-1.sagemaker.aws labeling.ap-northeast-2.sagemaker.aws labeling.ap-south-1.sagemaker.aws labeling.ap-southeast-1.sagemaker.aws labeling.ap-southeast-2.sagemaker.aws labeling.ca-central-1.sagemaker.aws labeling.eu-central-1.sagemaker.aws labeling.eu-west-1.sagemaker.aws labeling.eu-west-2.sagemaker.aws labeling.us-east-1.sagemaker.aws labeling.us-east-2.sagemaker.aws labeling.us-west-2.sagemaker.aws notebook.af-south-1.sagemaker.aws notebook.ap-east-1.sagemaker.aws notebook.ap-northeast-1.sagemaker.aws notebook.ap-northeast-2.sagemaker.aws notebook.ap-northeast-3.sagemaker.aws notebook.ap-south-1.sagemaker.aws notebook.ap-south-2.sagemaker.aws notebook.ap-southeast-1.sagemaker.aws notebook.ap-southeast-2.sagemaker.aws notebook.ap-southeast-3.sagemaker.aws notebook.ap-southeast-4.sagemaker.aws notebook.ca-central-1.sagemaker.aws notebook-fips.ca-central-1.sagemaker.aws notebook.ca-west-1.sagemaker.aws notebook-fips.ca-west-1.sagemaker.aws notebook.eu-central-1.sagemaker.aws notebook.eu-central-2.sagemaker.aws notebook.eu-north-1.sagemaker.aws notebook.eu-south-1.sagemaker.aws notebook.eu-south-2.sagemaker.aws notebook.eu-west-1.sagemaker.aws notebook.eu-west-2.sagemaker.aws notebook.eu-west-3.sagemaker.aws notebook.il-central-1.sagemaker.aws notebook.me-central-1.sagemaker.aws notebook.me-south-1.sagemaker.aws notebook.sa-east-1.sagemaker.aws notebook.us-east-1.sagemaker.aws notebook-fips.us-east-1.sagemaker.aws notebook.us-east-2.sagemaker.aws notebook-fips.us-east-2.sagemaker.aws notebook.us-gov-east-1.sagemaker.aws notebook-fips.us-gov-east-1.sagemaker.aws notebook.us-gov-west-1.sagemaker.aws notebook-fips.us-gov-west-1.sagemaker.aws notebook.us-west-1.sagemaker.aws notebook-fips.us-west-1.sagemaker.aws notebook.us-west-2.sagemaker.aws notebook-fips.us-west-2.sagemaker.aws notebook.cn-north-1.sagemaker.com.cn notebook.cn-northwest-1.sagemaker.com.cn studio.af-south-1.sagemaker.aws studio.ap-east-1.sagemaker.aws studio.ap-northeast-1.sagemaker.aws studio.ap-northeast-2.sagemaker.aws studio.ap-northeast-3.sagemaker.aws studio.ap-south-1.sagemaker.aws studio.ap-southeast-1.sagemaker.aws studio.ap-southeast-2.sagemaker.aws studio.ap-southeast-3.sagemaker.aws studio.ca-central-1.sagemaker.aws studio.eu-central-1.sagemaker.aws studio.eu-central-2.sagemaker.aws studio.eu-north-1.sagemaker.aws studio.eu-south-1.sagemaker.aws studio.eu-south-2.sagemaker.aws studio.eu-west-1.sagemaker.aws studio.eu-west-2.sagemaker.aws studio.eu-west-3.sagemaker.aws studio.il-central-1.sagemaker.aws studio.me-central-1.sagemaker.aws studio.me-south-1.sagemaker.aws studio.sa-east-1.sagemaker.aws studio.us-east-1.sagemaker.aws studio.us-east-2.sagemaker.aws studio.us-gov-east-1.sagemaker.aws studio-fips.us-gov-east-1.sagemaker.aws studio.us-gov-west-1.sagemaker.aws studio-fips.us-gov-west-1.sagemaker.aws studio.us-west-1.sagemaker.aws studio.us-west-2.sagemaker.aws studio.cn-north-1.sagemaker.com.cn studio.cn-northwest-1.sagemaker.com.cn *.experiments.sagemaker.aws analytics-gateway.ap-northeast-1.amazonaws.com analytics-gateway.ap-northeast-2.amazonaws.com analytics-gateway.ap-south-1.amazonaws.com analytics-gateway.ap-southeast-1.amazonaws.com analytics-gateway.ap-southeast-2.amazonaws.com analytics-gateway.eu-central-1.amazonaws.com analytics-gateway.eu-west-1.amazonaws.com analytics-gateway.us-east-1.amazonaws.com analytics-gateway.us-east-2.amazonaws.com analytics-gateway.us-west-2.amazonaws.com amplifyapp.com *.awsapprunner.com webview-assets.aws-cloud9.af-south-1.amazonaws.com vfs.cloud9.af-south-1.amazonaws.com webview-assets.cloud9.af-south-1.amazonaws.com webview-assets.aws-cloud9.ap-east-1.amazonaws.com vfs.cloud9.ap-east-1.amazonaws.com webview-assets.cloud9.ap-east-1.amazonaws.com webview-assets.aws-cloud9.ap-northeast-1.amazonaws.com vfs.cloud9.ap-northeast-1.amazonaws.com webview-assets.cloud9.ap-northeast-1.amazonaws.com webview-assets.aws-cloud9.ap-northeast-2.amazonaws.com vfs.cloud9.ap-northeast-2.amazonaws.com webview-assets.cloud9.ap-northeast-2.amazonaws.com webview-assets.aws-cloud9.ap-northeast-3.amazonaws.com vfs.cloud9.ap-northeast-3.amazonaws.com webview-assets.cloud9.ap-northeast-3.amazonaws.com webview-assets.aws-cloud9.ap-south-1.amazonaws.com vfs.cloud9.ap-south-1.amazonaws.com webview-assets.cloud9.ap-south-1.amazonaws.com webview-assets.aws-cloud9.ap-southeast-1.amazonaws.com vfs.cloud9.ap-southeast-1.amazonaws.com webview-assets.cloud9.ap-southeast-1.amazonaws.com webview-assets.aws-cloud9.ap-southeast-2.amazonaws.com vfs.cloud9.ap-southeast-2.amazonaws.com webview-assets.cloud9.ap-southeast-2.amazonaws.com webview-assets.aws-cloud9.ca-central-1.amazonaws.com vfs.cloud9.ca-central-1.amazonaws.com webview-assets.cloud9.ca-central-1.amazonaws.com webview-assets.aws-cloud9.eu-central-1.amazonaws.com vfs.cloud9.eu-central-1.amazonaws.com webview-assets.cloud9.eu-central-1.amazonaws.com webview-assets.aws-cloud9.eu-north-1.amazonaws.com vfs.cloud9.eu-north-1.amazonaws.com webview-assets.cloud9.eu-north-1.amazonaws.com webview-assets.aws-cloud9.eu-south-1.amazonaws.com vfs.cloud9.eu-south-1.amazonaws.com webview-assets.cloud9.eu-south-1.amazonaws.com webview-assets.aws-cloud9.eu-west-1.amazonaws.com vfs.cloud9.eu-west-1.amazonaws.com webview-assets.cloud9.eu-west-1.amazonaws.com webview-assets.aws-cloud9.eu-west-2.amazonaws.com vfs.cloud9.eu-west-2.amazonaws.com webview-assets.cloud9.eu-west-2.amazonaws.com webview-assets.aws-cloud9.eu-west-3.amazonaws.com vfs.cloud9.eu-west-3.amazonaws.com webview-assets.cloud9.eu-west-3.amazonaws.com webview-assets.aws-cloud9.il-central-1.amazonaws.com vfs.cloud9.il-central-1.amazonaws.com webview-assets.aws-cloud9.me-south-1.amazonaws.com vfs.cloud9.me-south-1.amazonaws.com webview-assets.cloud9.me-south-1.amazonaws.com webview-assets.aws-cloud9.sa-east-1.amazonaws.com vfs.cloud9.sa-east-1.amazonaws.com webview-assets.cloud9.sa-east-1.amazonaws.com webview-assets.aws-cloud9.us-east-1.amazonaws.com vfs.cloud9.us-east-1.amazonaws.com webview-assets.cloud9.us-east-1.amazonaws.com webview-assets.aws-cloud9.us-east-2.amazonaws.com vfs.cloud9.us-east-2.amazonaws.com webview-assets.cloud9.us-east-2.amazonaws.com webview-assets.aws-cloud9.us-west-1.amazonaws.com vfs.cloud9.us-west-1.amazonaws.com webview-assets.cloud9.us-west-1.amazonaws.com webview-assets.aws-cloud9.us-west-2.amazonaws.com vfs.cloud9.us-west-2.amazonaws.com webview-assets.cloud9.us-west-2.amazonaws.com awsapps.com cn-north-1.eb.amazonaws.com.cn cn-northwest-1.eb.amazonaws.com.cn elasticbeanstalk.com af-south-1.elasticbeanstalk.com ap-east-1.elasticbeanstalk.com ap-northeast-1.elasticbeanstalk.com ap-northeast-2.elasticbeanstalk.com ap-northeast-3.elasticbeanstalk.com ap-south-1.elasticbeanstalk.com ap-south-2.elasticbeanstalk.com ap-southeast-1.elasticbeanstalk.com ap-southeast-2.elasticbeanstalk.com ap-southeast-3.elasticbeanstalk.com ap-southeast-4.elasticbeanstalk.com ap-southeast-5.elasticbeanstalk.com ap-southeast-6.elasticbeanstalk.com ap-southeast-7.elasticbeanstalk.com ca-central-1.elasticbeanstalk.com ca-west-1.elasticbeanstalk.com eu-central-1.elasticbeanstalk.com eu-central-2.elasticbeanstalk.com eu-north-1.elasticbeanstalk.com eu-south-1.elasticbeanstalk.com eu-south-2.elasticbeanstalk.com eu-west-1.elasticbeanstalk.com eu-west-2.elasticbeanstalk.com eu-west-3.elasticbeanstalk.com il-central-1.elasticbeanstalk.com me-central-1.elasticbeanstalk.com me-south-1.elasticbeanstalk.com sa-east-1.elasticbeanstalk.com us-east-1.elasticbeanstalk.com us-east-2.elasticbeanstalk.com us-gov-east-1.elasticbeanstalk.com us-gov-west-1.elasticbeanstalk.com us-west-1.elasticbeanstalk.com us-west-2.elasticbeanstalk.com *.elb.amazonaws.com.cn *.elb.amazonaws.com awsglobalaccelerator.com lambda-url.af-south-1.on.aws lambda-url.ap-east-1.on.aws lambda-url.ap-northeast-1.on.aws lambda-url.ap-northeast-2.on.aws lambda-url.ap-northeast-3.on.aws lambda-url.ap-south-1.on.aws lambda-url.ap-southeast-1.on.aws lambda-url.ap-southeast-2.on.aws lambda-url.ap-southeast-3.on.aws lambda-url.ca-central-1.on.aws lambda-url.eu-central-1.on.aws lambda-url.eu-north-1.on.aws lambda-url.eu-south-1.on.aws lambda-url.eu-west-1.on.aws lambda-url.eu-west-2.on.aws lambda-url.eu-west-3.on.aws lambda-url.me-south-1.on.aws lambda-url.sa-east-1.on.aws lambda-url.us-east-1.on.aws lambda-url.us-east-2.on.aws lambda-url.us-west-1.on.aws lambda-url.us-west-2.on.aws *.private.repost.aws transfer-webapp.af-south-1.on.aws transfer-webapp.ap-east-1.on.aws transfer-webapp.ap-east-2.on.aws transfer-webapp.ap-northeast-1.on.aws transfer-webapp.ap-northeast-2.on.aws transfer-webapp.ap-northeast-3.on.aws transfer-webapp.ap-south-1.on.aws transfer-webapp.ap-south-2.on.aws transfer-webapp.ap-southeast-1.on.aws transfer-webapp.ap-southeast-2.on.aws transfer-webapp.ap-southeast-3.on.aws transfer-webapp.ap-southeast-4.on.aws transfer-webapp.ap-southeast-5.on.aws transfer-webapp.ap-southeast-6.on.aws transfer-webapp.ap-southeast-7.on.aws transfer-webapp.ca-central-1.on.aws transfer-webapp.ca-west-1.on.aws transfer-webapp.eu-central-1.on.aws transfer-webapp.eu-central-2.on.aws transfer-webapp.eu-north-1.on.aws transfer-webapp.eu-south-1.on.aws transfer-webapp.eu-south-2.on.aws transfer-webapp.eu-west-1.on.aws transfer-webapp.eu-west-2.on.aws transfer-webapp.eu-west-3.on.aws transfer-webapp.il-central-1.on.aws transfer-webapp.me-central-1.on.aws transfer-webapp.me-south-1.on.aws transfer-webapp.mx-central-1.on.aws transfer-webapp.sa-east-1.on.aws transfer-webapp.us-east-1.on.aws transfer-webapp.us-east-2.on.aws transfer-webapp.us-gov-east-1.on.aws transfer-webapp-fips.us-gov-east-1.on.aws transfer-webapp.us-gov-west-1.on.aws transfer-webapp-fips.us-gov-west-1.on.aws transfer-webapp.us-west-1.on.aws transfer-webapp.us-west-2.on.aws transfer-webapp.cn-north-1.on.amazonwebservices.com.cn transfer-webapp.cn-northwest-1.on.amazonwebservices.com.cn transfer-webapp.eusc-de-east-1.on.amazonwebservices.eu eero.online eero-stage.online opentunnel.xyz antagonist.cloud claude.app claudeusercontent.com frame.claudeusercontent.com *.cursorusercontent.com apigee.io panel.dev siiites.com int.apple *.cloud.int.apple *.r.cloud.int.apple *.ap-north-1.r.cloud.int.apple *.ap-south-1.r.cloud.int.apple *.ap-south-2.r.cloud.int.apple *.eu-central-1.r.cloud.int.apple *.eu-north-1.r.cloud.int.apple *.us-central-1.r.cloud.int.apple *.us-central-2.r.cloud.int.apple *.us-east-1.r.cloud.int.apple *.us-east-2.r.cloud.int.apple *.us-west-1.r.cloud.int.apple *.us-west-2.r.cloud.int.apple *.us-west-3.r.cloud.int.apple appspacehosted.com appspaceusercontent.com appudo.net appwrite.global appwrite.network *.appwrite.run on-aptible.com f5.si arvanedge.ir user.aseinet.ne.jp gv.vc d.gv.vc user.party.eus pimienta.org poivron.org potager.org sweetpepper.org myasustor.com *.atlassian-3p.com *.atlassian-3p-us-gov-mod.com *.atlassian-isolated-3p.com cdn.prod.atlassian-dev.net myfritz.link myfritz.net *.awdev.ca *.advisor.ws ecommerce-shop.pl b-data.io balena-devices.com base.ec official.ec buyshop.jp fashionstore.jp handcrafted.jp kawaiishop.jp supersale.jp theshop.jp shopselect.net base.shop beagleboard.io bearblog.dev *.beget.app *.begetcdn.cloud pages.gay bnr.la bitbucket.io blackbaudcdn.net of.je square.site bluebite.io boomla.net boutir.com boxfuse.io square7.ch bplaced.com bplaced.de square7.de bplaced.net square7.net brave.app *.s.brave.app brave.dev *.s.brave.dev brave.io *.s.brave.io shop.brendly.ba shop.brendly.hr shop.brendly.rs browsersafetymark.io radio.am radio.fm cdn.bubble.io bubbleapps.io *.bwcloud-os-instance.de cafjs.com canva-apps.cn canva-code.cn my.canvasite.cn khsj.cn canva-apps.com canva-hosted-embed.com canvacode.com rice-labs.com canva.link canva.run my.canva.site drr.ac uwu.ai carrd.co crd.co ju.mp api.gov.uk cdn77-storage.com rsc.contentproxy9.cz r.cdn77.net cdn77-ssl.net c.cdn77.org rsc.cdn77.org ssl.origin.cdn77-secure.org za.bz br.com cn.com de.com eu.com jpn.com mex.com ru.com sa.com uk.com us.com za.com com.de gb.net hu.net jp.net se.net uk.net ae.org com.se cx.ua discourse.diy discourse.group discourse.team clerk.app clerkstage.app *.lcl.dev *.lclstage.dev *.stg.dev *.stgstage.dev cleverapps.cc *.services.clever-cloud.com cleverapps.io cleverapps.tech clickrising.net cloudns.asia cloudns.be cloud-ip.biz cloudns.biz cloud-ip.cc cloudns.cc cloudns.ch cloudns.cl cloudns.club abrdns.com dnsabr.com ip-ddns.com cloudns.cx cloudns.eu cloudns.in cloudns.info ddns-ip.net dns-cloud.net dns-dynamic.net cloudns.nz cloudns.org ip-dynamic.org cloudns.ph cloudns.pro cloudns.pw cloudns.us c66.me cloud66.ws jdevcloud.com wpdevcloud.com cloudaccess.host freesite.host cloudaccess.net cloudbeesusercontent.io *.cloudera.site cloudflare.app cf-ipfs.com cloudflare-ipfs.com trycloudflare.com pages.dev r2.dev workers.dev cloudflare.net cdn.cloudflare.net cdn.cloudflareanycast.net cdn.cloudflarecn.net cdn.cloudflareglobal.net cust.cloudscale.ch objects.lpg.cloudscale.ch objects.rma.cloudscale.ch lpg.objectstorage.ch rma.objectstorage.ch wnext.app cnpy.gdn *.otap.co co.ca co.com sch.ac dev.cv store.cv codeberg.page codepen.app codepen.dev csb.app preview.csb.app co.nl co.no *.devinapps.com webhosting.be site.webhosting.be prvw.eu hosting-cluster.nl site.hosting-cluster.nl ctfcloud.net convex.app convex.cloud eu-west-1.convex.cloud us-east-1.convex.cloud convex.site eu-west-1.convex.site us-east-1.convex.site ac.ru edu.ru gov.ru int.ru mil.ru corespeed.app dyn.cosidns.de dnsupdater.de dynamisches-dns.de internet-dns.de l-o-g-i-n.de dynamic-dns.info feste-ip.net knx-server.net static-access.net craft.me realm.cz cfolks.pl cyon.link cyon.site biz.dk co.dk firm.dk reg.dk store.dk dyndns.dappnode.io builtwithdark.com darklang.io aws.databricksapps.com *.azure.databricksapps.com gcp.databricksapps.com aws-gov.databricksapps.us demo.datadetect.com instance.datadetect.com edgestack.me dattolocal.com dattorelay.com dattoweb.com mydatto.com dattolocal.net mydatto.net ddnss.de dyn.ddnss.de dyndns.ddnss.de dyn-ip24.de dyndns1.de home-webserver.de dyn.home-webserver.de myhome-server.de ddnss.org debian.net definima.io definima.net deno.dev deno-staging.dev deno.net sandbox.deno.net deployagent.com piebox.site deployagent.space dedyn.io deuxfleurs.eu deuxfleurs.page *.at.ply.gg d6.ply.gg joinmc.link playit.plus *.at.playit.plus with.playit.plus icp0.io *.raw.icp0.io icp1.io *.raw.icp1.io opencloud.me *.icp.net caffeine.site caffeine.xyz mybox.company intouch.email mybox.me mybox.page dfirma.pl dkonto.pl you2.pl ondigitalocean.app *.digitaloceanspaces.com qzz.io us.kg xx.kg dpdns.org discordsays.com discordsez.com jozi.biz ccwu.cc cc.cd us.ci de5.net dnshome.at resolve.bar ddns.berlin dnshome.cloud ddnssec.de dnshome.de dyndnssec.de heimdns.de srvdns.de dnshome.eu dnshome.it dyn.now heimdns.online ddns.wtf online.th shop.th co.scot me.scot org.scot drayddns.com shoparena.pl dreamhosters.com durumis.com duckdns.org dy.fi tunk.org dyndns.biz for-better.biz for-more.biz for-some.biz for-the.biz selfip.biz webhop.biz ftpaccess.cc game-server.cc myphotos.cc scrapping.cc blogdns.com cechire.com dnsalias.com dnsdojo.com doesntexist.com dontexist.com doomdns.com dyn-o-saur.com dynalias.com dyndns-at-home.com dyndns-at-work.com dyndns-blog.com dyndns-free.com dyndns-home.com dyndns-ip.com dyndns-mail.com dyndns-office.com dyndns-pics.com dyndns-remote.com dyndns-server.com dyndns-web.com dyndns-wiki.com dyndns-work.com est-a-la-maison.com est-a-la-masion.com est-le-patron.com est-mon-blogueur.com from-ak.com from-al.com from-ar.com from-ca.com from-ct.com from-dc.com from-de.com from-fl.com from-ga.com from-hi.com from-ia.com from-id.com from-il.com from-in.com from-ks.com from-ky.com from-ma.com from-md.com from-mi.com from-mn.com from-mo.com from-ms.com from-mt.com from-nc.com from-nd.com from-ne.com from-nh.com from-nj.com from-nm.com from-nv.com from-oh.com from-ok.com from-or.com from-pa.com from-pr.com from-ri.com from-sc.com from-sd.com from-tn.com from-tx.com from-ut.com from-va.com from-vt.com from-wa.com from-wi.com from-wv.com from-wy.com getmyip.com gotdns.com hobby-site.com homelinux.com homeunix.com iamallama.com is-a-anarchist.com is-a-blogger.com is-a-bookkeeper.com is-a-bulls-fan.com is-a-caterer.com is-a-chef.com is-a-conservative.com is-a-cpa.com is-a-cubicle-slave.com is-a-democrat.com is-a-designer.com is-a-doctor.com is-a-financialadvisor.com is-a-geek.com is-a-green.com is-a-guru.com is-a-hard-worker.com is-a-hunter.com is-a-landscaper.com is-a-lawyer.com is-a-liberal.com is-a-libertarian.com is-a-llama.com is-a-musician.com is-a-nascarfan.com is-a-nurse.com is-a-painter.com is-a-personaltrainer.com is-a-photographer.com is-a-player.com is-a-republican.com is-a-rockstar.com is-a-socialist.com is-a-student.com is-a-teacher.com is-a-techie.com is-a-therapist.com is-an-accountant.com is-an-actor.com is-an-actress.com is-an-anarchist.com is-an-artist.com is-an-engineer.com is-an-entertainer.com is-certified.com is-gone.com is-into-anime.com is-into-cars.com is-into-cartoons.com is-into-games.com is-leet.com is-not-certified.com is-slick.com is-uberleet.com is-with-theband.com isa-geek.com isa-hockeynut.com issmarterthanyou.com likes-pie.com likescandy.com neat-url.com saves-the-whales.com selfip.com sells-for-less.com sells-for-u.com servebbs.com simple-url.com space-to-rent.com teaches-yoga.com writesthisblog.com ath.cx fuettertdasnetz.de isteingeek.de istmein.de lebtimnetz.de leitungsen.de traeumtgerade.de barrel-of-knowledge.info barrell-of-knowledge.info dyndns.info for-our.info groks-the.info groks-this.info here-for-more.info knowsitall.info selfip.info webhop.info forgot.her.name forgot.his.name at-band-camp.net blogdns.net broke-it.net buyshouses.net dnsalias.net dnsdojo.net does-it.net dontexist.net dynalias.net dynathome.net endofinternet.net from-az.net from-co.net from-la.net from-ny.net gets-it.net ham-radio-op.net homeftp.net homeip.net homelinux.net homeunix.net in-the-band.net is-a-chef.net is-a-geek.net isa-geek.net kicks-ass.net office-on-the.net podzone.net scrapper-site.net selfip.net sells-it.net servebbs.net serveftp.net thruhere.net webhop.net merseine.nu mine.nu shacknet.nu blogdns.org blogsite.org boldlygoingnowhere.org dnsalias.org dnsdojo.org doesntexist.org dontexist.org doomdns.org dvrdns.org dynalias.org dyndns.org go.dyndns.org home.dyndns.org endofinternet.org endoftheinternet.org from-me.org game-host.org gotdns.org hobby-site.org homedns.org homeftp.org homelinux.org homeunix.org is-a-bruinsfan.org is-a-candidate.org is-a-celticsfan.org is-a-chef.org is-a-geek.org is-a-knight.org is-a-linux-user.org is-a-patsfan.org is-a-soxfan.org is-found.org is-lost.org is-saved.org is-very-bad.org is-very-evil.org is-very-good.org is-very-nice.org is-very-sweet.org isa-geek.org kicks-ass.org misconfused.org podzone.org readmyblog.org selfip.org sellsyourhome.org servebbs.org serveftp.org servegame.org stuff-4-sale.org webhop.org better-than.tv dyndns.tv on-the-web.tv worse-than.tv is-by.us land-4-sale.us stuff-4-sale.us dyndns.ws mypets.ws 1cooldns.com bumbleshrimp.com ddnsfree.com ddnsgeek.com ddnsguru.com dynuddns.com dynuhosting.com giize.com gleeze.com kozow.com loseyourip.com ooguy.com pivohosting.com theworkpc.com wiredbladehosting.com casacam.net dynu.net dynuddns.net mysynology.net opik.net spryt.net accesscam.org camdvr.org freeddns.org mywire.org roxa.org webredirect.org myddns.rocks dynv6.net e4.cz easypanel.app easypanel.host *.ewp.live twmail.cc twmail.net twmail.org mymailer.com.tw url.tw at.emf.camp rt.ht elementor.cloud elementor.cool emergent.cloud preview.emergentagent.com emergent.host mytuleap.com tuleap-partners.com encr.app frontend.encr.app encoreapi.com lp.dev api.lp.dev objects.lp.dev eu.encoway.cloud eu.org al.eu.org asso.eu.org at.eu.org au.eu.org be.eu.org bg.eu.org ca.eu.org cd.eu.org ch.eu.org cn.eu.org cy.eu.org cz.eu.org de.eu.org dk.eu.org edu.eu.org ee.eu.org es.eu.org fi.eu.org fr.eu.org gr.eu.org hr.eu.org hu.eu.org ie.eu.org il.eu.org in.eu.org int.eu.org is.eu.org it.eu.org jp.eu.org kr.eu.org lt.eu.org lu.eu.org lv.eu.org me.eu.org mk.eu.org mt.eu.org my.eu.org net.eu.org ng.eu.org nl.eu.org no.eu.org nz.eu.org pl.eu.org pt.eu.org ro.eu.org ru.eu.org se.eu.org si.eu.org sk.eu.org tr.eu.org uk.eu.org us.eu.org eurodir.ru eu-1.evennode.com eu-2.evennode.com eu-3.evennode.com eu-4.evennode.com us-1.evennode.com us-2.evennode.com us-3.evennode.com us-4.evennode.com relay.evervault.app relay.evervault.dev exe.xyz expo.app on.expo.app staging.expo.app on.staging.expo.app fspages.org ru.net adygeya.ru bashkiria.ru bir.ru cbg.ru com.ru dagestan.ru grozny.ru kalmykia.ru kustanai.ru marine.ru mordovia.ru msk.ru mytis.ru nalchik.ru nov.ru pyatigorsk.ru spb.ru vladikavkaz.ru vladimir.ru abkhazia.su adygeya.su aktyubinsk.su arkhangelsk.su armenia.su ashgabad.su azerbaijan.su balashov.su bashkiria.su bryansk.su bukhara.su chimkent.su dagestan.su east-kazakhstan.su exnet.su georgia.su grozny.su ivanovo.su jambyl.su kalmykia.su kaluga.su karacol.su karaganda.su karelia.su khakassia.su krasnodar.su kurgan.su kustanai.su lenug.su mangyshlak.su mordovia.su msk.su murmansk.su nalchik.su navoi.su north-kazakhstan.su nov.su obninsk.su penza.su pokrovsk.su sochi.su spb.su tashkent.su termez.su togliatti.su troitsk.su tselinograd.su tula.su tuva.su vladikavkaz.su vladimir.su vologda.su channelsdvr.net u.channelsdvr.net edgecompute.app fastly-edge.com fastly-terrarium.com freetls.fastly.net map.fastly.net a.prod.fastly.net global.prod.fastly.net a.ssl.fastly.net b.ssl.fastly.net global.ssl.fastly.net fastlylb.net map.fastlylb.net *.user.fm fastvps-server.com fastvps.host myfast.host fastvps.site myfast.space conn.uk copro.uk hosp.uk fedorainfracloud.org fedorapeople.org cloud.fedoraproject.org app.os.fedoraproject.org app.os.stg.fedoraproject.org mydobiss.com fh-muenster.io payload.dev figma.site figma-gov.site preview.site filegear.me hosted-by-files.com firebaseapp.com fldrv.com on-fleek.app flutterflow.app sprites.app fly.dev e2b.app framer.ai framer.app framercanvas.com framer.media framer.photos framer.website framer.wiki *.0e.vc freebox-os.com freeboxos.com fbx-os.fr fbxos.fr freebox-os.fr freeboxos.fr freedesktop.org freemyip.com *.frusky.de wien.funkfeuer.at daemon.asia dix.asia mydns.bz 0am.jp 0g0.jp 0j0.jp 0t0.jp mydns.jp pgw.jp wjg.jp keyword-on.net live-on.net server-on.net mydns.tw mydns.vc *.futurecms.at *.ex.futurecms.at *.in.futurecms.at futurehosting.at futuremailing.at *.ex.ortsinfo.at *.kunden.ortsinfo.at *.statics.cloud gadget.app gadget.host campaign.gov.uk service.gov.uk independent-commission.uk independent-inquest.uk independent-inquiry.uk independent-panel.uk independent-review.uk public-inquiry.uk royal-commission.uk gehirn.ne.jp usercontent.jp gentapps.com gentlentapis.com cdn-edges.net gsj.bz gitbook.io github.app githubusercontent.com githubpreview.dev github.io gitlab.io gitpage.si glideos.app nog.community co.ro shop.ro lolipop.io angry.jp babyblue.jp babymilk.jp backdrop.jp bambina.jp bitter.jp blush.jp boo.jp boy.jp boyfriend.jp but.jp candypop.jp capoo.jp catfood.jp cheap.jp chicappa.jp chillout.jp chips.jp chowder.jp chu.jp ciao.jp cocotte.jp coolblog.jp cranky.jp cutegirl.jp daa.jp deca.jp deci.jp digick.jp egoism.jp fakefur.jp fem.jp flier.jp floppy.jp fool.jp frenchkiss.jp girlfriend.jp girly.jp gloomy.jp gonna.jp greater.jp hacca.jp heavy.jp her.jp hiho.jp hippy.jp holy.jp hungry.jp icurus.jp itigo.jp jellybean.jp kikirara.jp kill.jp kilo.jp kuron.jp littlestar.jp lolipopmc.jp lolitapunk.jp lomo.jp lovepop.jp lovesick.jp main.jp mods.jp mond.jp mongolian.jp moo.jp namaste.jp nikita.jp nobushi.jp noor.jp oops.jp parallel.jp parasite.jp pecori.jp peewee.jp penne.jp pepper.jp perma.jp pigboat.jp pinoko.jp punyu.jp pupu.jp pussycat.jp pya.jp raindrop.jp readymade.jp sadist.jp schoolbus.jp secret.jp staba.jp stripper.jp sub.jp sunnyday.jp thick.jp tonkotsu.jp under.jp upper.jp velvet.jp verse.jp versus.jp vivian.jp watson.jp weblike.jp whitesnow.jp zombie.jp heteml.net vibehost.space graphic.design goip.de *.hosted.app *.run.app *.mtls.run.app web.app *.0emm.com appspot.com *.r.appspot.com blogspot.com codespot.com googleapis.com googlecode.com pagespeedmobilizer.com withgoogle.com withyoutube.com *.gateway.dev cloud.goog translate.goog *.usercontent.goog cloudfunctions.net cloud.run ai.studio goupile.fr pymnt.uk gov.nl grafana-dev.net grayjayleagues.com grebedoc.dev xn--gnstigbestellen-zvb.de xn--gnstigliefern-wob.de gv.uy hackclub.app xn--hkkinen-5wa.fi hashbang.sh hasura.app hasura-app.io hatenablog.com hatenadiary.com hateblo.jp hatenablog.jp hatenadiary.jp hatenadiary.org pages.it.hs-heilbronn.de pages-research.it.hs-heilbronn.de heiyu.space helioho.st heliohost.us hepforge.org onhercules.app hercules-app.com hercules-dev.com here.now herokuapp.com *.compute.herokuapp.com heyflow.page heyflow.site ravendb.cloud ravendb.community development.run ravendb.run hidns.co hidns.vip homesklep.pl *.kin.one *.id.pub *.kin.pub seprox.hooc.me hoplix.shop orx.biz biz.ng co.biz.ng dl.biz.ng go.biz.ng lg.biz.ng on.biz.ng col.ng firm.ng gen.ng ltd.ng ngo.ng plc.ng hstgr.cloud hostyhosting.io hf.space static.hf.space hypernode.io iobb.net co.cz *.moonscale.io moonscale.net gr.com iki.fi ibxos.it iliadboxos.it imagine.diy imagine-proxy.work smushcdn.com wphostedmail.com wpmucdn.com tempurl.host wpmudev.host dyn-berlin.de in-berlin.de in-brb.de in-butter.de in-dsl.de in-vpn.de in-dsl.net in-vpn.net in-dsl.org in-vpn.org oninferno.net info.cx ac.leg.br al.leg.br am.leg.br ap.leg.br ba.leg.br ce.leg.br df.leg.br es.leg.br go.leg.br ma.leg.br mg.leg.br ms.leg.br mt.leg.br pa.leg.br pb.leg.br pe.leg.br pi.leg.br pr.leg.br rj.leg.br rn.leg.br ro.leg.br rr.leg.br rs.leg.br sc.leg.br se.leg.br sp.leg.br to.leg.br pixolino.com na4u.ru botdash.app botdash.dev botdash.gg botdash.net botda.sh botdash.xyz online-server.cloud apps-1and1.com live-website.com webspace-host.com apps-1and1.net websitebuilder.online app-ionos.space iopsys.se *.inbrowser.dev *.dweb.link *.inbrowser.link ipifony.net home64.de ipv64.de ipv64.net iqhs.pl ir.md is-a-good.dev iservschule.de mein-iserv.de schuldock.de schulplattform.de schulserver.de test-iserv.de iserv.dev iserv.host ispmanager.name mel.cloudlets.com.au cloud.interhostsolutions.be alp1.ae.flow.ch appengine.flow.ch es-1.axarnet.cloud diadem.cloud vip.jelastic.cloud jele.cloud it1.eur.aruba.jenv-aruba.cloud it1.jenv-aruba.cloud keliweb.cloud cs.keliweb.cloud oxa.cloud tn.oxa.cloud uk.oxa.cloud primetel.cloud uk.primetel.cloud ca.reclaim.cloud uk.reclaim.cloud us.reclaim.cloud ch.trendhosting.cloud de.trendhosting.cloud jele.club dopaas.com paas.hosted-by-previder.com rag-cloud.hosteur.com rag-cloud-ch.hosteur.com jcloud.ik-server.com jcloud-ver-jpc.ik-server.com demo.jelastic.com paas.massivegrid.com jed.wafaicloud.com ryd.wafaicloud.com j.scaleforce.com.cy jelastic.dogado.eu fi.cloudplatform.fi jele.host mircloud.host paas.beebyte.io sekd1.beebyteapp.io jele.io jc.neen.it jcloud.kz cloudjiffy.net fra1-de.cloudjiffy.net west1-us.cloudjiffy.net jls-sto1.elastx.net jls-sto2.elastx.net jls-sto3.elastx.net fr-1.paas.massivegrid.net lon-1.paas.massivegrid.net lon-2.paas.massivegrid.net ny-1.paas.massivegrid.net ny-2.paas.massivegrid.net sg-1.paas.massivegrid.net jelastic.saveincloud.net nordeste-idc.saveincloud.net j.scaleforce.net sdscloud.pl unicloud.pl mircloud.ru enscaled.sg jele.site jelastic.team orangecloud.tn j.layershift.co.uk phx.enscaled.us mircloud.us myjino.ru *.hosting.myjino.ru *.landing.myjino.ru *.spectrum.myjino.ru *.vps.myjino.ru jote.cloud jotelulu.cloud eu1-plenit.com la1-plenit.com us1-plenit.com webadorsite.com jouwweb.site js.org elastic.k2.cloud lb.ru-msk.k2.cloud s3.ru-msk.k2.cloud website.ru-msk.k2.cloud lb.ru-spb.k2.cloud s3.ru-spb.k2.cloud website.ru-spb.k2.cloud s3.k2.cloud website.k2.cloud kaas.gg khplay.nl kapsi.fi kdns.fr ezproxy.kuleuven.be kuleuven.cloud keenetic.io keenetic.link keenetic.name keenetic.pro ae.kg keymachine.de kiloapps.ai kiloapps.io kinghost.net uni5.net koobin.events webthings.io krellian.net co.de shiptoday.app shiptoday.build laravel.cloud on-forge.com on-vapor.com *.eth.limo *.eth.link git-repos.de lcube-server.de svn-repos.de leadpages.co lpages.co lpusercontent.com leapcell.app leapcell.dev leapcell.online liara.run iran.liara.run libp2p.direct runcontainers.dev co.business co.education co.events co.financial co.network co.place co.technology linkyard-cloud.ch linkyard.cloud members.linode.com *.nodebalancer.linode.com *.linodeobjects.com ip.linodeusercontent.com we.bs filegear-sg.me ggff.net *.user.localcert.dev localtonet.com *.localto.net lodz.pl pabianice.pl plock.pl sieradz.pl skierniewice.pl zgierz.pl loginline.app loginline.dev loginline.io loginline.services loginline.site lohmus.me lovable.app lovableproject.com lovable.run lovable.sh krasnik.pl leczna.pl lubartow.pl lublin.pl poniatowa.pl swidnik.pl glug.org.uk lug.org.uk lugs.org.uk barsy.bg barsy.club barsycenter.com barsyonline.com barsy.de barsy.dev barsy.eu barsy.gr barsy.in barsy.info barsy.io barsy.me barsy.menu barsyonline.menu barsy.mobi barsy.net barsy.online barsy.org barsy.pro barsy.pub barsy.ro barsy.rs barsy.shop barsyonline.shop barsy.site barsy.store barsy.support barsy.uk barsy.co.uk barsyonline.co.uk *.lutrausercontent.com luyani.app luyani.net *.magentosite.cloud magicpatterns.app magicpatternsapp.com hb.cldmail.ru matlab.cloud modelscape.com mwcloudnonprod.com polyspace.com mayfirst.info mcdir.me mcdir.ru vps.mcdir.ru mcpre.ru mediatech.by mediatech.dev hra.health medusajs.app miniserver.com memset.net messerli.app atmeta.com apps.fbsbx.com *.metaaiusercontent.com *.cloud.metacentrum.cz custom.metacentrum.cz flt.cloud.muni.cz usr.cloud.muni.cz meteorapp.com eu.meteorapp.com co.pl *.azurecontainer.io azure-api.net azure-mobile.net azureedge.net azurefd.net azurestaticapps.net 1.azurestaticapps.net 2.azurestaticapps.net 3.azurestaticapps.net 4.azurestaticapps.net 5.azurestaticapps.net 6.azurestaticapps.net 7.azurestaticapps.net centralus.azurestaticapps.net eastasia.azurestaticapps.net eastus2.azurestaticapps.net westeurope.azurestaticapps.net westus2.azurestaticapps.net azurewebsites.net australiacentral-01.azurewebsites.net australiacentral2-01.azurewebsites.net australiaeast-01.azurewebsites.net australiasoutheast-01.azurewebsites.net austriaeast-01.azurewebsites.net belgiumcentral-01.azurewebsites.net brazilsouth-01.azurewebsites.net brazilsoutheast-01.azurewebsites.net canadacentral-01.azurewebsites.net canadaeast-01.azurewebsites.net centralindia-01.azurewebsites.net centralus-01.azurewebsites.net centraluseuap-01.azurewebsites.net chilecentral-01.azurewebsites.net denmarkeast-01.azurewebsites.net eastasia-01.azurewebsites.net eastasiastage-01.azurewebsites.net eastus-01.azurewebsites.net eastus2-01.azurewebsites.net eastus2euap-01.azurewebsites.net eastus3-01.azurewebsites.net francecentral-01.azurewebsites.net francesouth-01.azurewebsites.net germanynorth-01.azurewebsites.net germanywestcentral-01.azurewebsites.net indiasouthcentral-01.azurewebsites.net indonesiacentral-01.azurewebsites.net israelcentral-01.azurewebsites.net israelnorthwest-01.azurewebsites.net italynorth-01.azurewebsites.net japaneast-01.azurewebsites.net japanwest-01.azurewebsites.net jioindiacentral-01.azurewebsites.net jioindiawest-01.azurewebsites.net koreacentral-01.azurewebsites.net koreasouth-01.azurewebsites.net malaysiawest-01.azurewebsites.net mexicocentral-01.azurewebsites.net newzealandnorth-01.azurewebsites.net northcentralus-01.azurewebsites.net northcentralusstage-01.azurewebsites.net northeastus5-01.azurewebsites.net northeurope-01.azurewebsites.net norwayeast-01.azurewebsites.net norwaywest-01.azurewebsites.net *.p.azurewebsites.net polandcentral-01.azurewebsites.net qatarcentral-01.azurewebsites.net southafricanorth-01.azurewebsites.net southafricawest-01.azurewebsites.net southcentralus-01.azurewebsites.net southcentralus2-01.azurewebsites.net southeastasia-01.azurewebsites.net southeastus5-01.azurewebsites.net southindia-01.azurewebsites.net spaincentral-01.azurewebsites.net swedencentral-01.azurewebsites.net swedensouth-01.azurewebsites.net switzerlandnorth-01.azurewebsites.net switzerlandwest-01.azurewebsites.net taiwannorth-01.azurewebsites.net taiwannorthwest-01.azurewebsites.net uaecentral-01.azurewebsites.net uaenorth-01.azurewebsites.net uksouth-01.azurewebsites.net ukwest-01.azurewebsites.net westcentralus-01.azurewebsites.net westeurope-01.azurewebsites.net westindia-01.azurewebsites.net westus-01.azurewebsites.net westus2-01.azurewebsites.net westus3-01.azurewebsites.net cloudapp.net trafficmanager.net blob.core.usgovcloudapi.net file.core.usgovcloudapi.net web.core.usgovcloudapi.net servicebus.usgovcloudapi.net usgovcloudapp.net usgovtrafficmanager.net blob.core.windows.net file.core.windows.net web.core.windows.net servicebus.windows.net azure-api.us azurewebsites.us routingthecloud.com sn.mynetname.net routingthecloud.net routingthecloud.org same-app.com same-preview.com csx.cc miren.app miren.systems mydbserver.com webspaceconfig.de mittwald.info mittwaldserver.info typo3server.info project.space mkm.fan mocha.app mochausercontent.com mocha-sandbox.dev modx.dev bmoattachments.org net.ru org.ru pp.ru my.be hostedpi.com caracal.mythic-beasts.com customer.mythic-beasts.com fentiger.mythic-beasts.com lynx.mythic-beasts.com ocelot.mythic-beasts.com oncilla.mythic-beasts.com onza.mythic-beasts.com sphinx.mythic-beasts.com vs.mythic-beasts.com x.mythic-beasts.com yali.mythic-beasts.com cust.retrosnub.co.uk ui.nabu.casa kr.object.fin-ncloudstorage.com s3-website.kr.object.fin-ncloudstorage.com kr.object.private.fin-ncloudstorage.com kr.gov-ncloudstorage.com kr-private.gov-ncloudstorage.com kr.object.gov-ncloudstorage.com s3-website.kr.object.gov-ncloudstorage.com krs.object.gov-ncloudstorage.com s3-website.krs.object.gov-ncloudstorage.com kr.object.private.gov-ncloudstorage.com krs.object.private.gov-ncloudstorage.com kr.objectstorage.ncloud.com sg.objectstorage.ncloud.com kr.ncloudstorage.com kr-naver.ncloudstorage.com kr-naver-dev.ncloudstorage.com kr-private.ncloudstorage.com de.object.ncloudstorage.com s3-website.de.object.ncloudstorage.com kr.object.ncloudstorage.com s3-website.kr.object.ncloudstorage.com sg.object.ncloudstorage.com s3-website.sg.object.ncloudstorage.com us.object.ncloudstorage.com s3-website.us.object.ncloudstorage.com kr.object.private.ncloudstorage.com sg.object.private.ncloudstorage.com kr.website.ncloudstorage.com kr-naver.website.ncloudstorage.com kr-naver-dev.website.ncloudstorage.com jp.object.ncpstorage.com jp.jp4.object.ncpstorage.com jp.jp5.object.ncpstorage.com kr.object.ncpstorage.com s3-website-jp.object.ncpstorage.com jp.object.private.ncpstorage.com jp.jp4.object.private.ncpstorage.com jp.jp5.object.private.ncpstorage.com kr.object.private.ncpstorage.com needle.run co.site cloud.nospamproxy.com o365.cloud.nospamproxy.com netlib.re netlify.app 4u.com nfshost.com ipfs.nftstorage.link ngo.us ngrok.app ngrok-free.app ngrok.dev ngrok-free.dev ngrok.io ap.ngrok.io au.ngrok.io eu.ngrok.io in.ngrok.io jp.ngrok.io sa.ngrok.io us.ngrok.io ngrok.pizza ngrok.pro torun.pl nh-serv.co.uk nimsite.uk mmafan.biz myftp.biz no-ip.biz no-ip.ca fantasyleague.cc gotdns.ch 3utilities.com blogsyte.com ciscofreak.com damnserver.com ddnsking.com ditchyourip.com dnsiskinky.com dynns.com geekgalaxy.com health-carereform.com homesecuritymac.com homesecuritypc.com myactivedirectory.com mysecuritycamera.com myvnc.com net-freaks.com onthewifi.com point2this.com quicksytes.com securitytactics.com servebeer.com servecounterstrike.com serveexchange.com serveftp.com servegame.com servehalflife.com servehttp.com servehumour.com serveirc.com servemp3.com servep2p.com servepics.com servequake.com servesarcasm.com stufftoread.com unusualperson.com workisboring.com dvrcam.info ilovecollege.info no-ip.info brasilia.me ddns.me dnsfor.me hopto.me loginto.me noip.me webhop.me bounceme.net ddns.net eating-organic.net mydissent.net myeffect.net mymediapc.net mypsx.net mysecuritycamera.net nhlfan.net no-ip.net pgafan.net privatizehealthinsurance.net redirectme.net serveblog.net serveminecraft.net sytes.net cable-modem.org collegefan.org couchpotatofries.org hopto.org mlbfan.org myftp.org mysecuritycamera.org nflfan.org no-ip.org read-books.org ufcfan.org zapto.org no-ip.co.uk golffan.us noip.us pointto.us stage.nodeart.io *.developer.app noop.app *.northflank.app *.build.run *.code.run *.database.run *.migration.run aberdeen.wa.us bainbridge-isl.wa.us bellevue.wa.us bremerton.wa.us centralia.wa.us chehalis.wa.us forks.wa.us gig-harbor.wa.us hoquiam.wa.us keyport.wa.us kingston.wa.us olympia.wa.us port-angeles.wa.us port-ludlow.wa.us port-orchard.wa.us port-townsend.wa.us poulsbo.wa.us redmond.wa.us renton.wa.us sea.wa.us seattle.wa.us sequim.wa.us shelton.wa.us silverdale.wa.us yarrow-point.wa.us noticeable.news notion.site dnsking.ch mypi.co myiphost.com forumz.info soundcast.me tcp4.me dnsup.net hicam.net now-dns.net ownip.net vpndns.net dynserv.org now-dns.org x443.pw ntdll.top freeddns.us nsupdate.info nerdpol.ovh prvcy.page observablehq.cloud static.observableusercontent.com omg.lol cloudycluster.net omniwe.site 123webseite.at 123website.be simplesite.com.br 123website.ch simplesite.com 123webseite.de 123hjemmeside.dk 123miweb.es 123kotisivu.fi 123siteweb.fr simplesite.gr 123homepage.it 123website.lu 123website.nl 123hjemmeside.no service.one website.one simplesite.pl 123paginaweb.pt 123minsida.se onid.ca is-a-fullstack.dev is-cool.dev is-not-a.dev localplayer.dev is-local.org opensocial.site *.oaiusercontent.com chatgpt.site opencraft.hosting 16-b.it 32-b.it 64-b.it orsites.com operaunite.com *.customer-oci.com *.oci.customer-oci.com *.ocp.customer-oci.com *.ocs.customer-oci.com *.oraclecloudapps.com *.oraclegovcloudapps.com *.oraclegovcloudapps.uk tech.orange can.re authgear-staging.com authgearapps.com outsystemscloud.com *.hosting.ovh.net *.webpaas.ovh.net ownprovider.com own.pm *.owo.codes ox.rs oy.lc pgfog.com gotpantheon.com pantheonsite.io *.paywhirl.com *.xmit.co xmit.dev madethis.site srv.us gh.srv.us gl.srv.us mypep.link pplx.app forgeblocks.com id.forgerock.io support.site on-web.fr *.upsun.app upsunapp.com ent.platform.sh eu.platform.sh us.platform.sh *.platformsh.site *.tst.site playcode.site pley.games onporter.run co.bn postman-echo.com pstmn.io mock.pstmn.io httpbin.org prequalifyme.today xen.prgmr.com priv.at c01.kr eliv-api.kr eliv-cdn.kr eliv-dns.kr mmv.kr vki.kr dev.project-study.com platter-app.dev e.id chirurgiens-dentistes-en-france.fr byen.site nyc.mn *.cn.st pubtls.org puter.app puter.site puter.work pythonanywhere.com eu.pythonanywhere.com qa2.com qcx.io *.sys.qcx.io myqnapcloud.cn mycloudnas.com mynascloud.com myqnapcloud.com qoto.io qualifioapp.com ladesk.com *.qualyhqpartner.com *.qualyhqportal.com qbuser.com *.quipelements.com vapor.cloud vaporcloud.io rackmaze.com rackmaze.net cloudsite.builders myradweb.net servername.us web.in in.net myrdbx.io site.rb-hosting.io up.railway.app *.on-rancher.cloud *.on-k3s.io *.on-rio.io ravpage.co.il readthedocs-hosted.com readthedocs.io rhcloud.com instances.spawn.cc *.clusters.rdpa.co *.srvrless.rdpa.co onrender.com app.render.com replit.app id.replit.app firewalledreplit.co id.firewalledreplit.co repl.co id.repl.co *.replit.dev *.teams.replit.dev repl.run resindevice.io devices.resinstaging.io retool.app adimo.co.uk itcouldbewor.se aus.basketball nz.basketball subsc-pay.com subsc-pay.net git-pages.rit.edu rocketpreview.app *.builtwithrocket.new rocky.page rub.de ruhr-uni-bochum.de io.noc.ruhr-uni-bochum.de xn--90amc.xn--p1acf xn--j1aef.xn--p1acf xn--j1ael8b.xn--p1acf xn--h1ahn.xn--p1acf xn--j1adp.xn--p1acf xn--c1avg.xn--p1acf xn--80aaa0cvac.xn--p1acf xn--h1aliz.xn--p1acf xn--90a1af.xn--p1acf xn--41a.xn--p1acf ras.ru nyat.app 180r.com dojin.com sakuratan.com sakuraweb.com x0.com 2-d.jp bona.jp crap.jp daynight.jp eek.jp flop.jp halfmoon.jp jeez.jp matrix.jp mimoza.jp ivory.ne.jp mail-box.ne.jp mints.ne.jp mokuren.ne.jp opal.ne.jp sakura.ne.jp sumomo.ne.jp topaz.ne.jp netgamers.jp nyanta.jp o0o0.jp rdy.jp rgr.jp rulez.jp s3.isk01.sakurastorage.jp s3.isk02.sakurastorage.jp saloon.jp sblo.jp skr.jp tank.jp uh-oh.jp undo.jp rs.webaccel.jp user.webaccel.jp websozai.jp xii.jp squares.net jpn.org kirara.st x0.to from.tv sakura.tv *.builder.code.com *.dev-builder.code.com *.stg-builder.code.com *.001.test.code-builder-stg.platform.salesforce.com *.aa.crm.dev *.ab.crm.dev *.ac.crm.dev *.ad.crm.dev *.ae.crm.dev *.af.crm.dev *.ci.crm.dev *.d.crm.dev *.pa.crm.dev *.pb.crm.dev *.pc.crm.dev *.pd.crm.dev *.pe.crm.dev *.pf.crm.dev *.w.crm.dev *.wa.crm.dev *.wb.crm.dev *.wc.crm.dev *.wd.crm.dev *.we.crm.dev *.wf.crm.dev sandcats.io sav.case logoip.com logoip.de fr-par-1.baremetal.scw.cloud fr-par-2.baremetal.scw.cloud nl-ams-1.baremetal.scw.cloud cockpit.fr-par.scw.cloud ddl.fr-par.scw.cloud dtwh.fr-par.scw.cloud fnc.fr-par.scw.cloud functions.fnc.fr-par.scw.cloud ifr.fr-par.scw.cloud k8s.fr-par.scw.cloud nodes.k8s.fr-par.scw.cloud kafk.fr-par.scw.cloud mgdb.fr-par.scw.cloud rdb.fr-par.scw.cloud s3.fr-par.scw.cloud s3-website.fr-par.scw.cloud scbl.fr-par.scw.cloud whm.fr-par.scw.cloud priv.instances.scw.cloud pub.instances.scw.cloud k8s.scw.cloud cockpit.nl-ams.scw.cloud ddl.nl-ams.scw.cloud dtwh.nl-ams.scw.cloud ifr.nl-ams.scw.cloud k8s.nl-ams.scw.cloud nodes.k8s.nl-ams.scw.cloud kafk.nl-ams.scw.cloud mgdb.nl-ams.scw.cloud rdb.nl-ams.scw.cloud s3.nl-ams.scw.cloud s3-website.nl-ams.scw.cloud scbl.nl-ams.scw.cloud whm.nl-ams.scw.cloud cockpit.pl-waw.scw.cloud ddl.pl-waw.scw.cloud dtwh.pl-waw.scw.cloud ifr.pl-waw.scw.cloud k8s.pl-waw.scw.cloud nodes.k8s.pl-waw.scw.cloud kafk.pl-waw.scw.cloud mgdb.pl-waw.scw.cloud rdb.pl-waw.scw.cloud s3.pl-waw.scw.cloud s3-website.pl-waw.scw.cloud scbl.pl-waw.scw.cloud scalebook.scw.cloud smartlabeling.scw.cloud dedibox.fr scw.site ams.scw.site waw.scw.site schokokeks.net gov.scot service.gov.scot mygov.scot scrysec.com client.scrypted.io firewall-gateway.com firewall-gateway.de my-gateway.de my-router.de spdns.de spdns.eu firewall-gateway.net my-firewall.org myfirewall.org spdns.org seidat.net sellfy.store minisite.ms senseering.net servebolt.cloud biz.ua co.ua pp.ua as.sh.cn vicp.fun yicp.fun zicp.fun sheezy.games myshopblocks.com myshopify.com shopitsite.com shopware.shop shopware.store mo-siemens.io 1kapp.com appchizi.com applinzi.com sinaapp.com vipsinaapp.com siteleaf.net small-web.org aeroport.fr avocat.fr chambagri.fr chirurgiens-dentistes.fr experts-comptables.fr medecin.fr notaires.fr pharmacien.fr port.fr veterinaire.fr vp4.me *.snowflake.app *.privatelink.snowflake.app streamlit.app streamlitapp.com try-snowplow.com mafelo.net sol.site playstation-cloud.com srht.site apps.lair.io *.stolos.io 4.at my.at my.de *.nxa.eu nx.gw spawnbase.app customer.speedpartner.de myspreadshop.at myspreadshop.com.au myspreadshop.be myspreadshop.ca myspreadshop.ch myspreadshop.com myspreadshop.de myspreadshop.dk myspreadshop.es myspreadshop.fi myspreadshop.fr myspreadshop.ie myspreadshop.it myspreadshop.net myspreadshop.nl myspreadshop.no myspreadshop.pl myspreadshop.se myspreadshop.co.uk w-corp-staticblitz.com w-credentialless-staticblitz.com w-staticblitz.com bolt.host stackhero-network.com runs.onstackit.cloud stackit.gg stackit.rocks stackit.run stackit.zone sryze.cc indevs.in musician.io novecore.site statichost.page feedback.ac forms.ac assessments.cx calculators.cx funnels.cx paynow.cx quizzes.cx researched.cx tests.cx surveys.so ipfs.storacha.link ipfs.w3s.link storebase.store strapiapp.com media.strapiapp.com vps-host.net atl.jelastic.vps-host.net njs.jelastic.vps-host.net ric.jelastic.vps-host.net streak-link.com streaklinks.com streakusercontent.com soc.srcf.net user.srcf.net utwente.io temp-dns.com supabase.co realtime.supabase.co storage.supabase.co supabase.in supabase.net surge.sh syncloud.it dscloud.biz direct.quickconnect.cn dsmynas.com familyds.com diskstation.me dscloud.me i234.me myds.me synology.me dscloud.mobi dsmynas.net familyds.net dsmynas.org familyds.org direct.quickconnect.to vpnplus.to mytabit.com mytabit.co.il tabitorder.co.il taifun-dns.de erp.dev web.erp.dev ts.net *.c.ts.net gda.pl gdansk.pl gdynia.pl med.pl sopot.pl taveusercontent.com p.tawk.email p.tawkto.email tche.br site.tb-hosting.com directwp.eu ec.cc eu.cc gu.cc uk.cc us.cc edugit.io s3.teckids.org telebit.app telebit.io *.telebit.xyz teleport.sh *.firenet.ch *.svc.firenet.ch reservd.com thingdustdata.com cust.dev.thingdust.io reservd.dev.thingdust.io cust.disrec.thingdust.io reservd.disrec.thingdust.io cust.prod.thingdust.io cust.testing.thingdust.io reservd.testing.thingdust.io tickets.io t3.storage.dev t3.storageapi.dev arvo.network azimuth.network tlon.network torproject.net pages.torproject.net townnews-staging.com 12hp.at 2ix.at 4lima.at lima-city.at 12hp.ch 2ix.ch 4lima.ch lima-city.ch trafficplex.cloud de.cool 12hp.de 2ix.de 4lima.de lima-city.de 1337.pictures clan.rip lima-city.rocks webspace.rocks lima.zone *.transurl.be *.transurl.eu site.transip.me *.transurl.nl *.triton.zone tunnelmole.net tuxfamily.org typedream.app pro.typeform.com uber.space hk.com inc.hk ltd.hk hk.org it.com umso.co unison-services.cloud virtual-user.de virtualuser.de obj.ag name.pm sch.tf biz.wf sch.wf org.yt rs.ba bielsko.pl urown.cloud dnsupdate.info us.org v.ua val.run web.val.run vercel.app v0.build vercel.dev vusercontent.net tmp.now vercel.run now.sh 2038.io v-info.info vistablog.ir deus-canvas.com vivenushop.com vivenushop.dev voorloper.cloud *.vultrobjects.com wafflecell.com wal.app wasmer.app webflow.io webflowtest.io *.webhare.dev hotelwithflight.com reserve-online.net book.online cprapid.com pleskns.com wp2.host pdns.page plesk.page cpanel.site wpsquared.site *.wadl.top remotewd.com box.ca pages.wiardweb.com toolforge.org wmcloud.org beta.wmcloud.org wmflabs.org hrsn.dev is-a.dev vps.hrsn.net localcert.net windsurf.app windsurf.build drive-platform.com drive-platform.io panel.gg daemon.panel.gg base44.app base44-sandbox.com wixsite.com wixstudio.com editorx.io wixstudio.io wix.run messwithdns.com woltlab-demo.com myforum.community community-pro.de diskussionsbereich.de community-pro.net meinforum.net affinitylottery.org.uk raffleentry.org.uk weeklylottery.org.uk wpenginepowered.com js.wpenginepowered.com grok.me *.xenonconnect.de half.host cistron.nl demon.nl xs4all.space xtooldevice.com yandexcloud.net storage.yandexcloud.net website.yandexcloud.net sourcecraft.site official.academy yolasite.com ynh.fr nohost.me noho.st za.net za.org zap.cloud zeabur.app *.zerops.app prg1-zerops.zone *.zerops.zone bss.design basicserver.io virtualserver.io enterprisecloud.nu zone.id nett.to zabc.net".split(' '));
function relaySiteDomain(value) {
  let host;
  try { host = new URL(value.includes('://') ? value : 'https://' + value).hostname.toLowerCase().replace(/\.$/, ''); } catch { return ''; }
  if (!host || host === 'localhost' || host === '127.0.0.1') return '';
  if (/^[\d.]+$/.test(host) || host.startsWith('[')) return host;
  const parts = host.split('.');
  if (parts.length === 1) return RELAY_PUBLIC_SUFFIXES.has(host) ? '' : host;
  let suffix = 1;
  for (let index = 0; index < parts.length; index++) {
    const candidate = parts.slice(index).join('.');
    if (RELAY_PUBLIC_SUFFIXES.has('!' + candidate)) { suffix = parts.length - index - 1; break; }
    if (RELAY_PUBLIC_SUFFIXES.has(candidate)) suffix = Math.max(suffix, parts.length - index);
    if (index > 0 && RELAY_PUBLIC_SUFFIXES.has('*.' + candidate)) suffix = Math.max(suffix, parts.length - index + 1);
  }
  return parts.length > suffix ? parts.slice(-suffix - 1).join('.') : '';
}

function relayTabDomain(tab) {
  if (!tab || tab.incognito) return '';
  if (tab.url?.startsWith(browser.runtime.getURL('popup/popup.html') + '?view=blocked&')) {
    const domain = new URL(tab.url).searchParams.get('domain') || '';
    return relaySiteDomain(domain) === domain ? domain : '';
  }
  return /^https?:/.test(tab.url || '') ? relaySiteDomain(tab.url) : '';
}

function relayTimerPaused(tab, kind) {
  return typeof timerOverrides !== 'undefined' && timerOverrides.paused(tab, kind);
}

function createSiteAllowances({ browser, productivity, now = () => Date.now() }) {
  const KEY = 'cyruneSiteAllowancesV1';
  let rules = {}, notices = {}, initialized, queue = Promise.resolve(), usage = new Map(), flags = [], sampledAt = -Infinity, sampledDay = '', sampledDomains = '';
  const localDay = () => { const d = new Date(now()); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const valid = rule => rule && Object.keys(rule).every(key => ['enabled','minutes','warningMinutes','block'].includes(key)) && typeof rule.enabled === 'boolean'
    && Number.isInteger(rule.minutes) && rule.minutes >= 1 && rule.minutes <= 1440 && Number.isInteger(rule.warningMinutes)
    && rule.warningMinutes >= 0 && rule.warningMinutes <= 60 && rule.warningMinutes < rule.minutes && typeof rule.block === 'boolean';
  async function ready() {
    if (!initialized) initialized = (async () => {
      const stored = await browser.storage.local.get([KEY, KEY + 'MigrationBackup']);
      const saved = stored[KEY];
      // Early 1.6.0 records used minutes=0 for off, before the separate toggle.
      const legacy = rule => rule && typeof rule === 'object' && !Array.isArray(rule)
        && Object.keys(rule).length === 3 && Object.keys(rule).every(key => ['minutes','warningMinutes','block'].includes(key))
        && Number.isInteger(rule.minutes) && rule.minutes >= 0 && rule.minutes <= 1440
        && Number.isInteger(rule.warningMinutes) && rule.warningMinutes >= 0 && rule.warningMinutes <= 60
        && (rule.minutes === 0 || rule.warningMinutes < rule.minutes) && typeof rule.block === 'boolean';
      if (saved !== undefined && (!saved || saved.schemaVersion !== 1 || !saved.rules || !saved.notices || typeof saved.rules !== 'object' || typeof saved.notices !== 'object' || Array.isArray(saved.rules) || Array.isArray(saved.notices)
          || Object.keys(saved.rules).length > 256 || Object.keys(saved.notices).length > 256
          || Object.entries(saved.rules).some(([domain, rule]) => !domain || domain.length > 253 || relaySiteDomain(domain) !== domain || !(valid(rule) || legacy(rule)))
          || Object.entries(saved.notices).some(([domain, value]) => !Object.hasOwn(saved.rules,domain) || !/^\d{4}-\d{2}-\d{2}:(warning|limit)$/.test(value)))) throw new Error('Site allowances need recovery. Existing records were retained.');
      let next = saved;
      if (saved && Object.values(saved.rules).some(legacy)) {
        next = { ...saved, rules:Object.fromEntries(Object.entries(saved.rules).map(([domain, rule]) => [domain, legacy(rule)
          ? {enabled:rule.minutes > 0, minutes:rule.minutes || 20, warningMinutes:Math.min(rule.warningMinutes,(rule.minutes || 20)-1), block:rule.block} : rule])) };
        const writes = {[KEY]:next};
        if (stored[KEY + 'MigrationBackup'] === undefined) writes[KEY + 'MigrationBackup'] = saved;
        await browser.storage.local.set(writes);
      }
      rules = next?.rules || {}; notices = next?.notices || {};
    })();
    await initialized;
  }
  function serialized(task) { const result = queue.then(async () => { await ready(); return task(); }); queue = result.catch(() => {}); return result; }
  function status(domain) {
    const rule = (Object.hasOwn(rules,domain) ? rules[domain] : null) || { enabled:false, minutes:20, warningMinutes:5, block:false };
    const usedMs = usage.get(domain) || 0;
    return { rule, usedMs, active: flags.includes(domain), reached: rule.enabled && usedMs >= rule.minutes * 60000 };
  }
  function reason(domain) {
    const value = status(domain);
    return value.active && value.reached && value.rule.block ? `Daily allowance reached · ${value.rule.minutes} min` : '';
  }
  function save(domain, rule) {
    return serialized(async () => {
      if (!domain || relaySiteDomain(domain) !== domain || !valid(rule)) throw new Error('Use a daily limit of 1–1440 min and a warning below the limit.');
      if (!Object.hasOwn(rules,domain) && Object.keys(rules).length >= 256) throw new Error('Allowance limit reached (256).');
      const next = { ...rules, [domain]: { ...rule } }, nextNotices = { ...notices };
      await browser.storage.local.set({ [KEY]: { schemaVersion:1, rules:next, notices:nextNotices } });
      rules = next; notices = nextNotices; sampledAt = -Infinity;
    });
  }
  function refresh(activity) {
    return serialized(async () => {
      flags = [...activity.distractingDomains];
      const today = localDay(), domains = Object.keys(rules).filter(domain => rules[domain].enabled && flags.includes(domain));
      if (!domains.length) { usage.clear(); sampledAt=-Infinity; return; }
      const domainKey=domains.join('|');
      if (sampledDay === today && sampledDomains === domainKey && now() >= sampledAt && now() - sampledAt < 1000) return;
      const result = await productivity.request({ schemaVersion:1, service:'activity', action:'report', args:{from:today,to:today,domains} });
      usage = new Map(result.report.domains.map(row => [row.name,row.milliseconds])); sampledAt = now(); sampledDay = today; sampledDomains=domainKey;
      for (const domain of domains) {
        const value = status(domain), phase = value.reached ? 'limit' : value.rule.warningMinutes && value.usedMs >= (value.rule.minutes-value.rule.warningMinutes)*60000 ? 'warning' : '';
        if (!phase || notices[domain] === `${today}:limit` || notices[domain] === `${today}:${phase}`) continue;
        const nextNotices = { ...notices, [domain]:`${today}:${phase}` };
        await browser.storage.local.set({ [KEY]:{schemaVersion:1,rules,notices:nextNotices} }); notices = nextNotices;
        await browser.notifications.create({ type:'basic', iconUrl:browser.runtime.getURL('icons/icon-96.svg'), title:phase === 'limit' ? 'Daily allowance reached' : 'Site allowance',
          message:`${domain} · ${phase === 'limit' ? `${value.rule.minutes} min used` : `${Math.max(0,Math.ceil(value.rule.minutes-value.usedMs/60000))} min remaining`}` }).catch(() => {});
      }
    });
  }
  return {ready,save,refresh,status,reason,has:domain=>Object.hasOwn(rules,domain)&&rules[domain].enabled};
}

const RELAY_WEBSITE_CATEGORIES = Object.freeze([
  'E-commerce and online retail',
  'Marketplaces and auctions',
  'Communication and messaging',
  'Social networks and online communities',
  'News and journalism',
  'Entertainment and streaming',
  'Gaming',
  'Education and e-learning',
  'Reference and knowledge',
  'Search and discovery',
  'Business and professional services',
  'Finance and payments',
  'Health and wellness',
  'Travel and transportation',
  'Food and dining',
  'Government and public services',
  'Technology and software',
  'Real estate and housing',
  'Nonprofit, charity, and advocacy',
  'Personal, portfolio, and creator websites'
]);

function createSiteControls({ browser, productivity, allowances = null, now = () => Date.now() }) {
  const KEY = 'cyruneDomainRulesV1', ALARM = 'cyrune-site-boundary';
  const categories = RELAY_WEBSITE_CATEGORIES;
  let rules = {}, ready, queue = Promise.resolve();
  const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  function valid(rule) {
    return rule && typeof rule === 'object' && !Array.isArray(rule) && Object.keys(rule).every(key => ['scheduled', 'from', 'until', 'focus'].includes(key))
      && typeof rule.scheduled === 'boolean' && typeof rule.focus === 'boolean' && time(rule.from) && time(rule.until) && (!rule.scheduled || rule.from !== rule.until);
  }
  async function load() {
    const stored = (await browser.storage.local.get(KEY))[KEY];
    if (stored && (stored.schemaVersion !== 1 || !stored.rules || typeof stored.rules !== 'object' || Object.keys(stored.rules).length > 256
        || Object.entries(stored.rules).some(([domain, rule]) => relaySiteDomain(domain) !== domain || !valid(rule)))) throw new Error('Site rules need recovery. Existing rules were retained.');
    rules = stored?.rules || {};
  }
  function ensureReady() { if (!ready) ready = load(); return ready; }
  function blockedUrl(domain) { return browser.runtime.getURL('popup/popup.html') + '?view=blocked&domain=' + encodeURIComponent(domain); }
  function reason(domain, focus, timestamp = now()) {
    const rule = rules[domain] || { scheduled:false, focus:false, from:'00:00', until:'00:00' };
    const date = new Date(timestamp), minutes = date.getHours() * 60 + date.getMinutes();
    const parse = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const from = parse(rule.from), until = parse(rule.until), messages = [];
    if (rule.scheduled && (from < until ? minutes >= from && minutes < until : minutes >= from || minutes < until)) messages.push(`Blocked until ${rule.until} · daily rule ${rule.from}–${rule.until}`);
    if (rule.focus && focus?.status === 'running' && focus.phase === 'work' && focus.endsAt > timestamp) messages.push('Blocked during your focus session');
    if (allowances?.reason(domain)) messages.push(allowances.reason(domain));
    return messages.join('\n');
  }
  const snapshot = () => productivity.request({ schemaVersion: 1, service: 'focus', action: 'state', args: {} });
  async function refreshAllowance(activity) {
    if (!allowances) return undefined;
    try { await allowances.refresh(activity); return null; }
    catch (error) { return {error:error.message || 'Site allowances unavailable.'}; }
  }
  async function activityTime(domain, activity) {
    if (!activity.enabled) return {trackingEnabled:false,todayMs:null};
    const date = new Date(now()), day = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    try {
      const result = await productivity.request({schemaVersion:1,service:'activity',action:'report',args:{from:day,to:day,domains:[domain]}});
      const total = result.report.domains.find(row => row.name === domain)?.milliseconds || 0;
      return {trackingEnabled:true,todayMs:Number.isFinite(total) && total >= 0 ? total : null};
    } catch { return {trackingEnabled:true,todayMs:null}; }
  }
  async function schedule() {
    const date = new Date(now()), boundaries = [];
    for (const rule of Object.values(rules)) if (rule.scheduled) for (const value of [rule.from, rule.until]) {
      const next = new Date(date); next.setHours(Number(value.slice(0, 2)), Number(value.slice(3)), 0, 0);
      if (next.getTime() <= date.getTime()) next.setDate(next.getDate() + 1);
      boundaries.push(next.getTime());
    }
    await browser.alarms.clear(ALARM);
    if (boundaries.length) browser.alarms.create(ALARM, { when: Math.min(...boundaries) });
  }
  async function enforce(focus) {
    await ensureReady();
    if (allowances) await refreshAllowance((await snapshot()).activity);
    const tabs = await browser.tabs.query({});
    await Promise.allSettled(tabs.filter(tab => /^https?:/.test(tab.url || '') && reason(relaySiteDomain(tab.url), focus))
      .map(tab => browser.tabs.update(tab.id, { url: blockedUrl(relaySiteDomain(tab.url)) })));
    await schedule();
  }
  async function beforeRequest(details) {
    if (details.type !== 'main_frame' || details.tabId < 0) return {};
    await ensureReady();
    const domain = relaySiteDomain(details.url);
    if (allowances) await allowances.ready().catch(() => {});
    if (!rules[domain] && !allowances?.has(domain)) return {};
    const state = await snapshot();
    await refreshAllowance(state.activity);
    return reason(domain, state.focus) ? { redirectUrl: blockedUrl(domain) } : {};
  }
  function popup(msg) {
    const task = queue.then(() => handlePopup(msg));
    queue = task.catch(() => {});
    return task;
  }
  async function handlePopup(msg) {
    await ensureReady();
    const tab = await browser.tabs.get(msg.tabId);
    const domain = relayTabDomain(tab);
    if (!domain || msg.expectedDomain && msg.expectedDomain !== domain) throw new Error('The site changed. Reopen Timer & Activity Tracker.');
    const state = await snapshot();
    if (msg.action === 'activityTime') return {ok:true,domain,...await activityTime(domain,state.activity)};
    const allowanceError = await refreshAllowance(state.activity);
    if (msg.action === 'state') return { ok: true, domain, category: state.activity.categories[domain] || 'Uncategorized', distracting: state.activity.distractingDomains.includes(domain),
      categories: [...new Set([...categories, ...Object.values(state.activity.categories)].filter(value => !['uncategorized', 'uncategorised', 'distracting'].includes(value.toLowerCase())))].sort((a,b)=>a.localeCompare(b, 'en', { sensitivity: 'base' })).concat('Uncategorized'), excluded: state.activity.exclusions.includes(domain),
      tracking: state.activity.enabled && !state.activity.paused, allowance: allowanceError || allowances?.status(domain), rule: rules[domain] || { scheduled: false, from: '09:00', until: '17:00', focus: false } };
    const task = (async () => {
      const latest = await browser.tabs.get(msg.tabId);
      if (relayTabDomain(latest) !== domain) throw new Error('The site changed. Reopen the popup.');
      if (msg.action === 'activity') return productivity.request({ schemaVersion: 1, service: 'activity', action: 'site',
        args: { domain, category: msg.category, excluded: msg.excluded, distracting: msg.distracting }, requestId: crypto.randomUUID() });
      if (msg.action === 'allowance' && allowances) { await allowances.save(domain,msg.rule); await enforce(state.focus); return {ok:true}; }
      if (msg.action !== 'blocking' || !valid(msg.rule)) throw new Error('Use distinct times in HH:MM format and valid blocking choices.');
      if (!rules[domain] && Object.keys(rules).length >= 256) throw new Error('Site rule limit reached (256).');
      const next = { ...rules, [domain]: { ...msg.rule } };
      await browser.storage.local.set({ [KEY]: { schemaVersion: 1, rules: next } }); rules = next;
      await enforce((await snapshot()).focus);
      return { ok: true };
    })();
    return task;
  }
  async function status(domain) {
    await ensureReady();
    if (relaySiteDomain(domain) !== domain) throw new Error('Invalid site.');
    const state = await snapshot(); await refreshAllowance(state.activity);
    return { ok: true, domain, reason: reason(domain, state.focus) };
  }
  function start() {
    // Register before asynchronous reads so startup navigations await durable rules.
    browser.webRequest.onBeforeRequest.addListener(details => beforeRequest(details).catch(() => ({ cancel: true })),
      { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] }, ['blocking']);
    const check = () => { void snapshot().then(state => enforce(state.focus)).catch(() => {}); };
    browser.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) check(); });
    setInterval(check, 15000);
    check();
  }
  return { start, popup, enforce, beforeRequest, status, reason };
}

function createProductivityStore() {
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('cyruneProductivityV1', 1);
      request.onupgradeneeded = () => {
        for (const name of ['state', 'segments', 'days']) request.result.createObjectStore(name, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Productivity storage is unavailable. Existing data was retained.'));
    });
    return database;
  }
  async function read(name) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Productivity records could not be read.'));
    });
  }
  async function commit(state, segments = [], erase = null) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['state', 'segments', 'days'], 'readwrite');
      tx.objectStore('state').put({ id: 'current', value: state });
      for (const segment of segments) {
        tx.objectStore('segments').put(segment);
        const id = JSON.stringify([segment.day, segment.hostname, segment.sessionId, segment.phase]);
        const request = tx.objectStore('days').get(id);
        request.onsuccess = () => tx.objectStore('days').put({ id, day: segment.day, hostname: segment.hostname,
          sessionId: segment.sessionId, phase: segment.phase, milliseconds: (request.result?.milliseconds || 0) + segment.milliseconds });
      }
      for (const [name, limit, days] of [['segments', 20000, state.activity.retentionDays], ['days', 50000, 365]]) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => {
          const date = new Date(); date.setDate(date.getDate() - days);
          const cutoff = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          const records = request.result.sort((a, b) => a.day.localeCompare(b.day) || (a.from || 0) - (b.from || 0));
          for (let index = 0; index < records.length; index++) {
            const row = records[index];
            if (row.day < cutoff || index < records.length - limit || erase && (!erase.hostname || row.hostname === erase.hostname)
                && (!erase.from || row.day >= erase.from) && (!erase.to || row.day <= erase.to)) tx.objectStore(name).delete(row.id);
          }
        };
      }
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(new Error('Productivity changes could not be saved. Retry after checking browser storage.'));
    });
  }
  return { read, commit };
}

function createProductivityService({ browser, store, now = () => Date.now(), monotonic = () => performance.now() }) {
  const ALARM = 'cyrune-productivity-focus';
  const defaults = { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4, autoStartNext: false, notifications: false };
  let state, initialized, queue = Promise.resolve(), current = null, lastNotify = 0;
  const clone = value => structuredClone(value);
  const id = () => crypto.randomUUID();
  function fresh() {
    return { schemaVersion: 4, revision: 0,
      focus: { revision: 0, status: 'idle', phase: 'work', endsAt: 0, remainingMs: 1500000, startedAt: 0, sessionId: '', workCount: 0,
        config: { ...defaults }, history: [], source: null, interrupted: false },
      activity: { enabled: false, paused: false, idleSeconds: 120, exclusions: [], distractingDomains: [], categories: {}, retentionDays: 30, budgetMinutes: 0 },
      migrations: [], receipts: [], outbox: null, budgetNotified: '' };
  }
  function host(value) {
    if (typeof value !== 'string' || value.length > 253 || !value || /[\s/:@?#]/.test(value)) return '';
    try { return new URL('https://' + value).hostname === value.toLowerCase() ? value.toLowerCase() : ''; } catch { return ''; }
  }
  function day(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function config(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(defaults, key))) throw new Error('Invalid focus settings.');
    const result = { ...defaults, ...value };
    for (const key of ['workMinutes', 'breakMinutes', 'longBreakMinutes', 'longBreakEvery']) {
      if (!Number.isFinite(result[key]) || result[key] < 1 || result[key] > (key === 'longBreakEvery' ? 12 : 240)) throw new Error('Focus durations must be 1–240 minutes.');
    }
    if (!Number.isInteger(result.longBreakEvery) || typeof result.autoStartNext !== 'boolean' || typeof result.notifications !== 'boolean') throw new Error('Invalid focus settings.');
    return result;
  }
  const duration = focus => focus.config[focus.phase === 'work' ? 'workMinutes' : focus.phase === 'break' ? 'breakMinutes' : 'longBreakMinutes'] * 60000;
  function transition(next, timestamp, recovered = false) {
    const focus = next.focus;
    if (focus.status !== 'running' || timestamp < focus.endsAt) return;
    const finished = focus.phase;
    focus.revision++;
    focus.history.unshift({ id: focus.sessionId, phase: finished, endedAt: focus.endsAt,
      durationMs: duration(focus), skipped: false, interrupted: recovered });
    focus.history = focus.history.slice(0, 2000);
    if (finished === 'work' && !recovered) focus.workCount++;
    focus.phase = finished !== 'work' ? 'work' : focus.workCount && focus.workCount % focus.config.longBreakEvery === 0 ? 'longBreak' : 'break';
    focus.status = focus.config.autoStartNext && !recovered ? 'running' : 'paused';
    focus.remainingMs = duration(focus);
    focus.startedAt = 0;
    focus.endsAt = focus.status === 'running' ? timestamp + focus.remainingMs : 0;
    focus.sessionId = id();
    focus.interrupted = recovered;
    if (focus.config.notifications) next.outbox = { at: timestamp, title: finished === 'work' ? 'Focus complete' : 'Break complete',
      message: recovered ? 'Timer elapsed while Firefox was unavailable. Review and start the next phase.'
        : `${focus.phase === 'work' ? 'Focus' : focus.phase === 'longBreak' ? 'Long break' : 'Short break'} ${focus.status === 'running' ? 'started' : 'is ready'}.` };
  }
  async function initialize() {
    const records = await store.read('state');
    state = records[0]?.value || fresh();
    if (![1, 2, 3, 4].includes(state.schemaVersion) || !state.focus || !state.activity || !Array.isArray(state.focus.history) || state.focus.history.length > 2000) throw new Error('Update Relay to read productivity data. Existing records were retained.');
    state.focus.config = config(state.focus.config);
    if (!['idle', 'running', 'paused'].includes(state.focus.status) || !['work', 'break', 'longBreak'].includes(state.focus.phase)
        || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Number.isSafeInteger(state.focus.revision) || state.focus.revision < 0
        || !Number.isFinite(state.focus.endsAt) || !Number.isFinite(state.focus.remainingMs) || state.focus.remainingMs < 0 || state.focus.remainingMs > 14400000
        || !Number.isSafeInteger(state.focus.workCount) || state.focus.workCount < 0 || typeof state.focus.sessionId !== 'string' || state.focus.sessionId.length > 160
        || state.focus.history.some(row => !row || !['work', 'break', 'longBreak'].includes(row.phase) || !Number.isFinite(row.endedAt) || !Number.isFinite(row.durationMs) || row.durationMs < 0 || row.durationMs > 14400000)
        || !Array.isArray(state.migrations) || state.migrations.length > 32 || !Array.isArray(state.receipts) || state.receipts.length > 64
        || typeof state.activity.enabled !== 'boolean' || typeof state.activity.paused !== 'boolean'
        || !Array.isArray(state.activity.exclusions) || state.activity.exclusions.length > 256 || state.activity.exclusions.some(value => !host(value))
        || !state.activity.categories || Object.keys(state.activity.categories).length > 256
        || Object.entries(state.activity.categories).some(([key, value]) => !host(key) || typeof value !== 'string' || value.length > 60)
        || ![7, 30, 90].includes(state.activity.retentionDays) || !Number.isInteger(state.activity.idleSeconds) || state.activity.idleSeconds < 60 || state.activity.idleSeconds > 1800) {
      throw new Error('Productivity data needs recovery. Existing records were retained; restore a browser-profile backup.');
    }
    if (state.schemaVersion === 1) {
      const next = clone(state);
      next.domainMigration = { at: now(), backup: clone(state.activity) };
      next.activity.categories = {};
      for (const [hostname, category] of Object.entries(state.activity.categories).sort(([a], [b]) => a.localeCompare(b))) {
        const domain = relaySiteDomain(hostname);
        if (domain && (!next.activity.categories[domain] || hostname === domain)) next.activity.categories[domain] = category;
      }
      next.activity.exclusions = [...new Set(state.activity.exclusions.map(relaySiteDomain).filter(Boolean))];
      next.schemaVersion = 2; next.revision++;
      await store.commit(next); state = next;
    }
    if (state.schemaVersion === 2) {
      const next = clone(state);
      next.distractionMigration = { at: now(), backup: clone(state.activity) };
      next.activity.distractingDomains = [];
      for (const [domain, category] of Object.entries(next.activity.categories)) {
        if (category.trim().toLowerCase() === 'distracting') {
          next.activity.distractingDomains.push(domain);
          next.activity.categories[domain] = 'Uncategorized';
        } else if (['uncategorised', 'uncategorized'].includes(category.toLowerCase())) next.activity.categories[domain] = 'Uncategorized';
      }
      next.schemaVersion = 3; next.revision++;
      await store.commit(next); state = next;
    }
    if (!Array.isArray(state.activity.distractingDomains) || state.activity.distractingDomains.length > 256
        || state.activity.distractingDomains.some(domain => !host(domain) || relaySiteDomain(domain) !== domain)) throw new Error('Activity flags need recovery. Existing records were retained.');
    if (state.schemaVersion === 3) {
      const next = clone(state);
      next.categoryMigration = { at: now(), backup: clone(state.activity.categories) };
      const renamed = {
        communication: 'Communication and messaging',
        entertainment: 'Entertainment and streaming',
        gaming: 'Gaming',
        learning: 'Education and e-learning',
        news: 'News and journalism',
        social: 'Social networks and online communities'
      };
      for (const [domain, category] of Object.entries(next.activity.categories)) {
        next.activity.categories[domain] = Object.hasOwn(renamed, category.trim().toLowerCase()) ? renamed[category.trim().toLowerCase()] : category;
      }
      next.schemaVersion = 4; next.revision++;
      await store.commit(next); state = next;
    }
    if (state.focus.status === 'running') {
      const next = clone(state);
      if (next.focus.endsAt <= now()) transition(next, now(), true);
      // An unexpired deadline survives a short restart; no browser activity is backfilled.
      next.revision++;
      await store.commit(next);
      state = next;
    }
    await schedule();
  }
  async function ready() { if (!initialized) initialized = initialize(); await initialized; }
  function serialized(task) {
    const result = queue.then(async () => { await ready(); return task(); });
    queue = result.catch(() => {});
    return result;
  }
  async function schedule() {
    await browser.alarms.clear(ALARM);
    if (state.focus.status === 'running') browser.alarms.create(ALARM, { when: state.focus.endsAt });
  }
  async function emit() {
    if (typeof siteControls !== 'undefined') void siteControls.enforce(state.focus).catch(() => {});
    const event = { type: 'MW_PRODUCTIVITY_CHANGED', revision: state.revision };
    for (const tabId of hubRegistrations.keys()) void browser.tabs.sendMessage(tabId, event).catch(() => {});
    if (state.outbox) {
      const notification = state.outbox;
      await fireHubNotification({ id: 'productivity-focus', when: notification.at, expiresAt: notification.at + 86400000,
        title: notification.title, message: notification.message, dedupeKey: `focus:${notification.at}`,
        source: state.focus.source || { widgetType: 'focusSession', widgetId: '', label: 'Focus Session' } });
      const next = clone(state); next.outbox = null;
      await store.commit(next); state = next;
    }
  }
  function split(segment) {
    const rows = [];
    let from = segment.from, remaining = segment.milliseconds;
    while (remaining > 0) {
      const end = new Date(from); end.setHours(24, 0, 0, 0);
      const milliseconds = Math.min(remaining, end.getTime() - from);
      rows.push({ id: id(), from, day: day(from), hostname: segment.hostname, sessionId: segment.sessionId, phase: segment.phase, milliseconds });
      remaining -= milliseconds; from += milliseconds;
    }
    return rows;
  }
  async function settle(timestamp = now()) {
    const next = clone(state), rows = [];
    if (current) {
      const elapsed = Math.min(Math.max(0, monotonic() - current.mono), Math.max(0, timestamp - current.from));
      // Sleep/clock gaps are unknown time, never a long active browsing interval.
      if (elapsed > 0 && elapsed <= 45000) {
        const deadline = next.focus.status === 'running' ? next.focus.endsAt : 0;
        const before = deadline > current.from ? Math.min(elapsed, deadline - current.from) : elapsed;
        rows.push(...split({ ...current, milliseconds: before }));
        if (before < elapsed) {
          transition(next, timestamp, timestamp - deadline > 60000);
          rows.push(...split({ ...current, from: current.from + before, milliseconds: elapsed - before,
            sessionId: next.focus.status === 'running' ? next.focus.sessionId : '', phase: next.focus.status === 'running' ? next.focus.phase : 'outside' }));
        }
      }
      current = null;
    }
    transition(next, timestamp, next.focus.status === 'running' && timestamp - next.focus.endsAt > 60000);
    if (rows.length || next.focus.status !== state.focus.status || next.focus.endsAt !== state.focus.endsAt) {
      next.revision++;
      await store.commit(next, rows);
      state = next;
      await schedule();
    }
  }
  async function sample() {
    await settle();
    if (!state.activity.enabled || state.activity.paused) return;
    const idle = await browser.idle.queryState(state.activity.idleSeconds);
    const window = await browser.windows.getLastFocused();
    if (idle !== 'active' || !window.focused || window.type !== 'normal') return;
    const [tab] = await browser.tabs.query({ active: true, windowId: window.id });
    if (!tab || tab.incognito || tab.discarded || !tab.url) return;
    let url;
    try { url = new URL(tab.url); } catch { return; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || ['localhost', '127.0.0.1'].includes(url.hostname) || state.activity.exclusions.includes(relaySiteDomain(url.hostname))) return;
    current = { from: now(), mono: monotonic(), hostname: url.hostname,
      sessionId: state.focus.status === 'running' ? state.focus.sessionId : '', phase: state.focus.status === 'running' ? state.focus.phase : 'outside' };
  }
  async function report(args = {}) {
    const from = args.from || day(now() - 6 * 86400000), to = args.to || day(now());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error('Choose a valid date range.');
    if (args.domains !== undefined && (!Array.isArray(args.domains) || args.domains.length > 256 || args.domains.some(value => !host(value) || relaySiteDomain(value) !== value))
        || args.hostname !== undefined && !host(args.hostname) || args.sessionId !== undefined && (typeof args.sessionId !== 'string' || args.sessionId.length > 160)
        || args.detail !== undefined && typeof args.detail !== 'boolean') throw new Error('Invalid report filter.');
    const records = (await store.read('days')).filter(row => row.day >= from && row.day <= to
      && (!args.domains || args.domains.includes(relaySiteDomain(row.hostname))) && (!args.hostname || row.hostname === args.hostname) && (!args.sessionId || row.sessionId === args.sessionId));
    const sites = new Map(), days = new Map(), sessions = new Map(), categories = new Map(), phases = new Map(), domains = new Map();
    let totalMs = 0, distractingMs = 0;
    for (const row of records) {
      totalMs += row.milliseconds;
      sites.set(row.hostname, (sites.get(row.hostname) || 0) + row.milliseconds);
      days.set(row.day, (days.get(row.day) || 0) + row.milliseconds);
      const domain = relaySiteDomain(row.hostname);
      domains.set(domain,(domains.get(domain)||0)+row.milliseconds);
      const category = state.activity.categories[domain] || 'Uncategorized';
      if (state.activity.distractingDomains.includes(domain)) distractingMs += row.milliseconds;
      categories.set(category, (categories.get(category) || 0) + row.milliseconds);
      const key = row.sessionId || 'outside';
      sessions.set(key, (sessions.get(key) || 0) + row.milliseconds);
      phases.set(row.phase, (phases.get(row.phase) || 0) + row.milliseconds);
    }
    const entries = map => [...map].map(([name, milliseconds]) => ({ name, milliseconds })).sort((a, b) => b.milliseconds - a.milliseconds);
    return { sampledAt: now(), from, to, totalMs, distractingMs, domains: args.domains ? entries(domains).slice(0,256) : [], sites: entries(sites).slice(0, 200), days: entries(days).sort((a, b) => a.name.localeCompare(b.name)),
      categories: entries(categories).sort((a,b)=>a.name === 'Uncategorized' ? 1 : b.name === 'Uncategorized' ? -1 : a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })), phases: entries(phases), sessions: entries(sessions).slice(0, 200), omittedSites: Math.max(0, sites.size - 200),
      ...await details() };
    async function details() {
      if (args.detail !== true) return { detail: [], truncated: false };
      const segments = (await store.read('segments')).filter(row => row.day >= from && row.day <= to
        && (!args.domains || args.domains.includes(relaySiteDomain(row.hostname))) && (!args.hostname || row.hostname === args.hostname) && (!args.sessionId || row.sessionId === args.sessionId)).sort((a, b) => a.from - b.from);
      return { detail: segments.slice(-1000), truncated: segments.length > 1000 };
    }
  }
  function validate(payload) {
    if (!payload || payload.schemaVersion !== 1 || !['focus', 'activity'].includes(payload.service)
        || typeof payload.action !== 'string' || JSON.stringify(payload).length > 128 * 1024
        || Object.keys(payload).some(key => !['schemaVersion', 'service', 'action', 'args', 'expectedRevision', 'requestId'].includes(key))) throw new Error('Invalid productivity request.');
    const allowed = payload.service === 'focus' ? ['state', 'start', 'pause', 'resume', 'skip', 'stop', 'adopt'] : ['state', 'report', 'settings', 'site', 'delete', 'export'];
    if (!allowed.includes(payload.action)) throw new Error('Unsupported productivity operation.');
    const args = payload.args || {};
    if (typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid productivity arguments.');
    const fields = { state: [], start: ['config', 'widgetId'], pause: [], resume: [], skip: [], stop: [], adopt: ['widgetId', 'runtime', 'config', 'activate'],
      report: ['from', 'to', 'hostname', 'sessionId', 'detail','domains'], export: ['from', 'to', 'hostname', 'sessionId', 'detail','domains'],
      site: ['domain', 'category', 'excluded', 'distracting'], settings: ['enabled', 'paused', 'idleSeconds', 'exclusions', 'categories', 'retentionDays', 'budgetMinutes'], delete: ['from', 'to', 'hostname'] };
    if (Object.keys(args).some(key => !fields[payload.action].includes(key))) throw new Error('Unknown productivity argument.');
    return args;
  }
  async function request(payload, authorized = () => true) {
    return serialized(async () => {
      if (!authorized()) throw new Error('Portal registration expired. Reconnect before retrying.');
      const args = validate(payload);
      await sample();
      const action = payload.action;
      if (action === 'state') return { ok: true, schemaVersion: 1, revision: state.revision,
        focus: clone(state.focus), activity: clone(state.activity), currentHost: current?.hostname || '',
        adopted: state.migrations.map(record => record.widgetId), sampledAt: now() };
      if (action === 'report' || action === 'export') return { ok: true, report: await report(args) };
      if (typeof payload.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(payload.requestId)) throw new Error('A request identity is required.');
      const signature = await contentSha256(JSON.stringify({ service: payload.service, action, args }));
      const receipt = state.receipts.find(item => item.id === payload.requestId);
      if (receipt) {
        if (receipt.signature !== signature) throw new Error('Request identity conflict.');
        return { ok: true, duplicate: true, revision: state.revision };
      }
      if (payload.service === 'focus' && payload.expectedRevision !== state.focus.revision) throw new Error('Focus state changed. Review the current timer and try again.');
      const next = clone(state), focus = next.focus;
      let erase = null;
      if (payload.service === 'focus') {
        if (action === 'adopt') {
          if (typeof args.widgetId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(args.widgetId) || !args.runtime || !Array.isArray(args.runtime.history)
              || !['idle', 'running', 'paused'].includes(args.runtime.status) || !['work', 'break', 'longBreak'].includes(args.runtime.phase)
              || !Number.isFinite(args.runtime.remainingMs) || args.runtime.remainingMs < 0 || args.runtime.remainingMs > 14400000
              || args.runtime.status === 'running' && (!Number.isFinite(args.runtime.endsAt) || args.runtime.endsAt < 0)
              || typeof args.activate !== 'boolean'
              || Object.keys(args.runtime).some(key => !['status', 'phase', 'endsAt', 'remainingMs', 'phaseStartedAt', 'completedWorkSessions', 'sessionActive', 'history', 'historyOpen'].includes(key))
              || ['endsAt', 'phaseStartedAt', 'completedWorkSessions'].some(key => args.runtime[key] !== undefined && (!Number.isFinite(args.runtime[key]) || args.runtime[key] < 0))
              || ['sessionActive', 'historyOpen'].some(key => args.runtime[key] !== undefined && typeof args.runtime[key] !== 'boolean')
              || args.runtime.history.length > 120 || next.migrations.length >= 32) throw new Error('Invalid legacy Focus snapshot.');
          if (next.migrations.some(record => record.widgetId === args.widgetId)) return { ok: true, duplicate: true };
          const imported = args.runtime.history.map((entry, index) => {
            if (!['work', 'break', 'longBreak'].includes(entry.phase) || !Number.isFinite(entry.endedAt) || !Number.isFinite(entry.durationMs)
                || entry.endedAt < 0 || entry.durationMs < 0 || entry.durationMs > 14400000
                || Object.keys(entry).some(key => !['phase', 'endedAt', 'durationMs', 'skipped'].includes(key))
                || entry.skipped !== undefined && typeof entry.skipped !== 'boolean') throw new Error('Invalid legacy phase history.');
            return { id: `legacy-${args.widgetId}-${index}`, phase: entry.phase, endedAt: entry.endedAt, durationMs: entry.durationMs, skipped: entry.skipped === true, interrupted: false };
          });
          next.migrations.push({ widgetId: args.widgetId, backup: clone(args.runtime), importedAt: now() });
          focus.history = [...focus.history, ...imported].sort((a, b) => b.endedAt - a.endedAt).slice(0, 2000);
          if (args.activate === true) {
            if (focus.status !== 'idle') throw new Error('Stop the current shared timer before adopting another timer.');
            focus.config = config(args.config);
            if (!['work', 'break', 'longBreak'].includes(args.runtime.phase)) throw new Error('Invalid legacy phase.');
            focus.phase = args.runtime.phase;
            focus.remainingMs = Math.min(duration(focus), args.runtime.remainingMs);
            if (args.runtime.status === 'running') focus.remainingMs = Math.max(0, Math.min(duration(focus), Number(args.runtime.endsAt) - now()));
            focus.status = 'paused'; focus.interrupted = true;
          }
          // Legacy notification is cancelled only after the imported snapshot commits.
        } else if (action === 'start') {
          if (args.widgetId !== undefined && (typeof args.widgetId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(args.widgetId))) throw new Error('Invalid Focus widget identity.');
          if (focus.status === 'running' || focus.status === 'paused') throw new Error('Resume or stop the current shared session first.');
          focus.config = config(args.config);
          focus.status = 'running'; focus.phase = 'work'; focus.workCount = 0; focus.sessionId = id(); focus.startedAt = now();
          focus.remainingMs = duration(focus); focus.endsAt = now() + focus.remainingMs; focus.interrupted = false;
          focus.source = { widgetType: 'focusSession', widgetId: String(args.widgetId || '').slice(0, 120), label: 'Focus Session' };
        } else if (action === 'pause') {
          if (focus.status !== 'running') throw new Error('No running focus timer.');
          focus.remainingMs = Math.max(0, focus.endsAt - now()); focus.status = 'paused'; focus.endsAt = 0;
        } else if (action === 'resume') {
          if (focus.status !== 'paused') throw new Error('No paused focus timer.');
          focus.status = 'running'; focus.endsAt = now() + focus.remainingMs; focus.startedAt = now(); focus.interrupted = false;
          if (!focus.sessionId) focus.sessionId = id();
        } else if (action === 'skip') {
          if (focus.status === 'idle') throw new Error('Start a focus session before skipping a phase.');
          focus.history.unshift({ id: focus.sessionId || id(), phase: focus.phase, endedAt: now(), durationMs: Math.max(0, duration(focus) - (focus.endsAt ? focus.endsAt - now() : focus.remainingMs)), skipped: true, interrupted: false });
          focus.phase = focus.phase === 'work' ? 'break' : 'work'; focus.remainingMs = duration(focus); focus.endsAt = 0;
          focus.status = 'paused'; focus.sessionId = id();
        } else if (action === 'stop') {
          const elapsed = Math.max(0, duration(focus) - (focus.endsAt ? focus.endsAt-now() : focus.remainingMs));
          if (focus.phase === 'work' && focus.sessionId && elapsed) focus.history.unshift({id:focus.sessionId,phase:'work',endedAt:now(),durationMs:elapsed,skipped:true,stopped:true,interrupted:false});
          focus.status = 'idle'; focus.phase = 'work'; focus.endsAt = 0; focus.remainingMs = duration(focus); focus.sessionId = '';
        }
        focus.history = focus.history.slice(0, 2000);
        focus.revision++;
        if (['start', 'resume'].includes(action) && focus.config.notifications) next.outbox = { at: now(), title: focus.phase === 'work' ? 'Focus started' : 'Break started', message: `${Math.ceil(focus.remainingMs / 60000)} minutes. You can close Portal.` };
      } else if (action === 'site') {
        if (!host(args.domain) || relaySiteDomain(args.domain) !== args.domain || typeof args.excluded !== 'boolean'
            || typeof args.distracting !== 'boolean' || typeof args.category !== 'string' || args.category.trim().toLowerCase() === 'distracting' || !args.category.trim() || args.category.length > 60 || /[\x00-\x1f]/.test(args.category)) throw new Error('Invalid domain activity settings.');
        if (!Object.hasOwn(next.activity.categories, args.domain) && Object.keys(next.activity.categories).length >= 256) throw new Error('Category limit reached (256).');
        next.activity.categories[args.domain] = args.category;
        next.activity.distractingDomains = next.activity.distractingDomains.filter(value => value !== args.domain);
        if (args.distracting) {
          if (next.activity.distractingDomains.length >= 256) throw new Error('Distracting site limit reached (256).');
          next.activity.distractingDomains.push(args.domain);
        }
        next.activity.exclusions = next.activity.exclusions.filter(value => value !== args.domain);
        if (args.excluded) {
          if (next.activity.exclusions.length >= 256) throw new Error('Exclusion limit reached (256).');
          next.activity.exclusions.push(args.domain);
        }
      } else if (action === 'settings') {
        const settings = { ...next.activity, ...args };
        if (typeof settings.enabled !== 'boolean' || typeof settings.paused !== 'boolean' || !Number.isInteger(settings.idleSeconds)
            || settings.idleSeconds < 60 || settings.idleSeconds > 1800 || ![7, 30, 90].includes(settings.retentionDays)
            || !Number.isInteger(settings.budgetMinutes) || settings.budgetMinutes < 0 || settings.budgetMinutes > 1440
            || !Array.isArray(settings.exclusions) || settings.exclusions.length > 256 || settings.exclusions.some(value => !host(value))
            || !settings.categories || typeof settings.categories !== 'object' || Array.isArray(settings.categories)
            || Object.keys(settings.categories).length > 256 || Object.entries(settings.categories).some(([key, value]) => !host(key) || typeof value !== 'string' || !value.trim() || value.trim().toLowerCase() === 'distracting' || value.length > 60)) throw new Error('Invalid activity settings.');
        next.activity = settings;
      } else if (action === 'delete') {
        if (args.hostname && !host(args.hostname) || ['from', 'to'].some(key => args[key] && !/^\d{4}-\d{2}-\d{2}$/.test(args[key]))) throw new Error('Invalid deletion scope.');
        erase = args;
      }
      next.receipts = [{ id: payload.requestId, signature }, ...next.receipts].slice(0, 64);
      next.revision++;
      if (!authorized()) throw new Error('Portal registration expired.');
      await store.commit(next, [], erase);
      state = next;
      if (action === 'adopt') await cancelHubNotification(`focus:${args.widgetId}`);
      await schedule(); await emit(); await sample();
      return { ok: true, revision: state.revision };
    });
  }
  async function pulse() {
    await sample();
    const timestamp = now();
    if (timestamp - lastNotify >= 15000) { lastNotify = timestamp; await emit(); }
    if (state.activity.enabled && state.activity.budgetMinutes && state.budgetNotified !== day(timestamp)) {
      const today = await report({ from: day(timestamp), to: day(timestamp) });
      const distracting = today.distractingMs;
      if (distracting >= state.activity.budgetMinutes * 60000) {
        const next = clone(state); next.budgetNotified = day(timestamp); await store.commit(next); state = next;
        await browser.notifications.create({ type: 'basic', iconUrl: browser.runtime.getURL('icons/icon-96.svg'), title: 'Browser activity reminder', message: 'Your daily distracting-site budget has been reached.' });
      }
    }
  }
  async function start() {
    await ready(); await emit();
    setInterval(() => { void serialized(pulse).catch(() => { current = null; }); }, 15000);
    const changed = () => { void serialized(sample).catch(() => { current = null; }); };
    browser.tabs.onActivated.addListener(changed);
    browser.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.status) changed(); });
    browser.tabs.onRemoved.addListener(changed);
    browser.windows.onFocusChanged.addListener(changed);
    browser.idle.setDetectionInterval(120);
    browser.idle.onStateChanged.addListener(changed);
    browser.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) void serialized(async () => { await sample(); await emit(); }).catch(() => {}); });
    await serialized(sample);
  }
  return { start, request, pulse: () => serialized(pulse), host, day, config, transition };
}

function createTabUnloader({ browser, now = () => Date.now(), isEdited = () => false, onDiscard = async () => {} }) {
  const KEY = 'cyruneUnloadDomainsV1', PREFIX = 'cyrune-unload:';
  let rules = [], ready, requests = Promise.resolve();
  const inactive = new Map(), generations = new Map(), protectedForms = new Set();
  const due = new Map(), last = new Map(), skipped = new Map();
  function protection(tab) {
    if (tab?.discarded) return 'Unloaded';
    if (relayTimerPaused(tab,'unload')) return 'Temporarily paused';
    if (isEdited(tab?.id) || protectedForms.has(tab?.id)) return 'Edited form';
    if (tab?.pinned) return 'Pinned tab';
    if (tab?.audible) return 'Audio playing';
    if (tab?.mutedInfo?.muted) return 'Muted tab';
    if (tab?.status !== 'complete') return 'Loading';
    if (tab?.active) return 'Selected tab';
    return '';
  }
  async function load() {
    const stored = (await browser.storage.local.get(KEY))[KEY];
    if (stored && (stored.schemaVersion !== 1 || !Array.isArray(stored.rules) || stored.rules.length > 256
        || new Set(stored.rules.map(rule => rule?.domain)).size !== stored.rules.length
        || stored.rules.some(rule => !rule || Object.keys(rule).some(key => !['domain', 'enabled', 'seconds'].includes(key))
          || typeof rule.domain !== 'string' || !rule.domain || rule.domain.length > 253 || relaySiteDomain(rule.domain) !== rule.domain || typeof rule.enabled !== 'boolean'
          || !Number.isInteger(rule.seconds) || rule.seconds < 60 || rule.seconds > 86400))) throw new Error('Unload settings need recovery. Existing records were retained.');
    rules = stored?.rules || [];
  }
  function ensureReady() { if (!ready) ready = load(); return ready; }
  function ruleFor(tab) {
    if (!tab || tab.incognito || !/^https?:/.test(tab.url || '')) return null;
    try { const url = new URL(tab.url); if (url.username || url.password) return null; } catch { return null; }
    return rules.find(rule => rule.domain === relayTabDomain(tab));
  }
  const eligible = tab => tab && !relayTimerPaused(tab,'unload') && !tab.active && !tab.pinned && !tab.audible && !tab.mutedInfo?.muted && !tab.discarded && tab.status === 'complete';
  async function syncTab(tabId, retry = false) {
    await ensureReady();
    const generation = (generations.get(tabId) || 0) + 1; generations.set(tabId, generation);
    await browser.alarms.clear(PREFIX + tabId);
    due.delete(tabId);
    const tab = await browser.tabs.get(tabId).catch(() => null);
    if (generations.get(tabId) !== generation) return;
    if (!tab || tab.active || !ruleFor(tab)?.enabled) { inactive.delete(tabId); return; }
    if (!inactive.has(tabId)) inactive.set(tabId, now());
    if (!eligible(tab) || isEdited(tabId) || protectedForms.has(tabId)) {
      const reason = protection(tab); if (reason && reason !== 'Unloaded' && reason !== 'Selected tab') skipped.set(tabId, reason);
      return;
    }
    const rule = ruleFor(tab);
    const when = Math.max(now() + (retry ? 60000 : 1000), inactive.get(tabId) + rule.seconds * 1000);
    due.set(tabId, when); browser.alarms.create(PREFIX + tabId, { when });
  }
  async function syncAll() {
    await ensureReady();
    const tabs = await browser.tabs.query({});
    await Promise.allSettled(tabs.map(tab => syncTab(tab.id)));
  }
  async function alarm({ name }) {
    if (!name.startsWith(PREFIX)) return;
    await ensureReady();
    const tabId = Number(name.slice(PREFIX.length)), generation = generations.get(tabId);
    try {
      let tab = await browser.tabs.get(tabId).catch(() => null), rule = ruleFor(tab);
      if (!rule?.enabled || !eligible(tab) || isEdited(tabId) || protectedForms.has(tabId) || !inactive.has(tabId)
          || now() - inactive.get(tabId) < rule.seconds * 1000) return;
      const expectedUrl = tab.url;
      const result = await browser.tabs.sendMessage(tabId, { type: 'CYRUNE_UTILITY_DIRTY' }, { frameId: 0 }).catch(() => null);
      if (result?.dirty === true) { protectedForms.add(tabId); skipped.set(tabId, 'Edited form'); }
      if (typeof result?.dirty !== 'boolean') skipped.set(tabId, 'Page access unavailable');
      if (result?.dirty === false) await browser.tabs.sendMessage(tabId, { type: 'CYRUNE_UTILITY_FEEDBACK', mode: 'unloaded' }, { frameId: 0 }).catch(() => {});
      tab = await browser.tabs.get(tabId).catch(() => null); rule = ruleFor(tab);
      if (result?.dirty !== false || !rule?.enabled || !eligible(tab) || tab.url !== expectedUrl || isEdited(tabId)
          || !inactive.has(tabId) || now() - inactive.get(tabId) < rule.seconds * 1000
          || generations.get(tabId) !== generation) return;
      try { await browser.tabs.discard(tabId); }
      catch (error) { skipped.set(tabId, 'Firefox refused unload'); throw error; }
      if ((await browser.tabs.get(tabId)).discarded) { last.set(tabId, now()); skipped.delete(tabId); await onDiscard(tabId); }
      else skipped.set(tabId, 'Firefox kept tab loaded');
    } finally {
      const tab = await browser.tabs.get(tabId).catch(() => null);
      if (tab && !tab.discarded) await browser.tabs.sendMessage(tabId, { type: 'CYRUNE_UTILITY_FEEDBACK', mode: 'clear' }, { frameId: 0 }).catch(() => {});
      await syncTab(tabId, true);
    }
  }
  function popup(msg) {
    const task = requests.then(async () => {
      await ensureReady();
      if (!Number.isInteger(msg.tabId)) throw new Error('Choose a browser tab.');
      const tab = await browser.tabs.get(msg.tabId), domain = relayTabDomain(tab);
      if (!domain || msg.expectedDomain && msg.expectedDomain !== domain) throw new Error('The site changed. Reopen the popup.');
      if (msg.action === 'state') {
        const rule = rules.find(rule => rule.domain === domain) || null;
        return { ok: true, domain, rule, status: { reason: rule?.enabled ? protection(tab) || 'Waiting' : 'Off', nextAt: due.get(tab.id) || 0, lastAt: last.get(tab.id) || 0, lastSkip: skipped.get(tab.id) || '' } };
      }
      if (msg.action !== 'settings' || typeof msg.enabled !== 'boolean' || !Number.isInteger(msg.seconds) || msg.seconds < 60 || msg.seconds > 86400) throw new Error('Use an unload interval from 1 minute to 24 hours.');
      const next = rules.filter(rule => rule.domain !== domain);
      if (next.length >= 256) throw new Error('Unload domain limit reached (256).');
      next.push({ domain, seconds: msg.seconds, enabled: msg.enabled });
      if (relayTabDomain(await browser.tabs.get(tab.id)) !== domain) throw new Error('The site changed. Reopen the popup.');
      await browser.storage.local.set({ [KEY]: { schemaVersion: 1, rules: next } }); rules = next;
      if (msg.enabled) {
        const tabs = await browser.tabs.query({});
        await Promise.allSettled(tabs.filter(item => ruleFor(item)?.domain === domain && !item.discarded).map(item => browser.tabs.executeScript(item.id,
          { file: '/content.js', allFrames: true, runAt: 'document_start' })));
      }
      await syncAll();
      return { ok: true };
    });
    requests = task.catch(() => {});
    return task;
  }
  async function start() {
    await ensureReady();
    const alarms = await browser.alarms.getAll();
    await Promise.all(alarms.filter(alarm => alarm.name.startsWith(PREFIX)).map(alarm => browser.alarms.clear(alarm.name)));
    await syncAll();
    browser.alarms.onAlarm.addListener(value => { void alarm(value).catch(() => {}); });
    browser.tabs.onActivated.addListener(() => { void syncAll().catch(() => {}); });
    browser.tabs.onUpdated.addListener((tabId, change) => {
      if (change.status === 'loading') { protectedForms.delete(tabId); skipped.delete(tabId); }
      if (change.url || change.status || Object.hasOwn(change, 'audible') || Object.hasOwn(change, 'mutedInfo') || Object.hasOwn(change, 'pinned') || Object.hasOwn(change, 'discarded')) void syncTab(tabId).catch(() => {});
    });
    browser.tabs.onRemoved.addListener(tabId => {
      inactive.delete(tabId); generations.delete(tabId); protectedForms.delete(tabId);
      due.delete(tabId); last.delete(tabId); skipped.delete(tabId);
      void browser.alarms.clear(PREFIX + tabId);
    });
  }
  function resetTab(tabId) { inactive.delete(tabId); skipped.delete(tabId); return syncTab(tabId); }
  return { start, popup, alarm, syncTab, syncAll, resetTab, ready:ensureReady, hasRule:tab=>!!ruleFor(tab)?.enabled };
}

function createTimerOverrides({browser,now=()=>Date.now(),changed=async()=>{}}) {
  const records=new Map(),ALARM='cyrune-timer-overrides';
  const kinds=['reload','unload'];
  function get(tab) {
    const record=records.get(tab?.id);
    if(!record || record.domain!==relayTabDomain(tab))return null;
    const value={domain:record.domain};
    for(const kind of kinds)if(record[kind] && (!record[kind].until || record[kind].until>now()))value[kind]={...record[kind]};
    return value.reload || value.unload ? value : null;
  }
  function paused(tab,kind) { return !!get(tab)?.[kind]; }
  async function schedule() {
    await browser.alarms.clear(ALARM);
    const deadlines=[...records.values()].flatMap(row=>kinds.map(kind=>row[kind]?.until)).filter(Boolean);
    if(deadlines.length)browser.alarms.create(ALARM,{when:Math.min(...deadlines)});
  }
  async function set(tab,mode,seconds,kind) {
    const domain=relayTabDomain(tab);
    if(!domain || !Number.isInteger(tab.id) || !['none','awake','pause'].includes(mode) || ![0,1800,3600].includes(seconds))throw new Error('Choose a tab override and duration.');
    if(kind!==undefined && (!kinds.includes(kind) || !['none','pause'].includes(mode)))throw new Error('Choose reload or unload and a pause duration.');
    await expire();
    if(relayTabDomain(await browser.tabs.get(tab.id))!==domain)throw new Error('The tab changed. Refresh its controls.');
    if(mode!=='none' && !records.has(tab.id) && records.size>=256)throw new Error('Override limit reached (256).');
    const record=kind ? (get(tab) || {domain}) : {domain};
    const affected=kind ? [kind] : kinds;
    for(const target of affected) {
      if(mode==='none' || mode==='awake' && target==='reload')delete record[target];
      else record[target]={seconds,until:seconds ? now()+seconds*1000 : 0};
    }
    if(record.reload || record.unload)records.set(tab.id,record);else records.delete(tab.id);
    await schedule(); await changed([tab.id],affected); return get(tab);
  }
  async function expire() {
    const expired={reload:[],unload:[]};
    for(const [id,row] of records) {
      for(const kind of kinds)if(row[kind]?.until && row[kind].until<=now()){delete row[kind];expired[kind].push(id);}
      if(!row.reload && !row.unload)records.delete(id);
    }
    await schedule();
    for(const kind of kinds)if(expired[kind].length)await changed(expired[kind],[kind]);
  }
  function start() {
    browser.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM)void expire().catch(()=>{});});
    browser.tabs.onRemoved.addListener(id=>{records.delete(id);void schedule().catch(()=>{});});
    browser.tabs.onUpdated.addListener((id,change,tab)=>{if(change.url && records.has(id) && records.get(id).domain!==relayTabDomain(tab)){records.delete(id);void schedule().then(()=>changed([id])).catch(()=>{});}});
  }
  return {start,get,paused,set,expire};
}

function createTabTimerController({browser,refresh,unloader,overrides}) {
  let queue=Promise.resolve();
  function request(msg,overview=false) {
    const task=queue.then(async()=>{
      if(msg.action==='list' && overview) {
        if(!Number.isInteger(msg.offset) || msg.offset<0 || msg.offset>100000 || typeof msg.query!=='string' || msg.query.length>128 || !['timers','unloaded','all'].includes(msg.filter))throw new Error('Invalid tab filter.');
        await Promise.all([refresh.ready(),unloader.ready()]);
        const query=msg.query.toLowerCase();
        const tabs=(await browser.tabs.query({})).filter(tab=>/^https?:/.test(tab.url||'') && relayTabDomain(tab)
          && (msg.filter==='all' || msg.filter==='unloaded' ? msg.filter==='all' || tab.discarded : refresh.hasRule(tab) || unloader.hasRule(tab) || overrides.get(tab) || tab.discarded)
          && (!query || `${tab.title||''} ${relayTabDomain(tab)}`.toLowerCase().includes(query))).sort((a,b)=>a.windowId-b.windowId || a.index-b.index);
        const rows=await Promise.all(tabs.slice(msg.offset,msg.offset+100).map(async tab=>({id:tab.id,domain:relayTabDomain(tab),title:String(tab.title||relayTabDomain(tab)).slice(0,160),
          discarded:!!tab.discarded,active:!!tab.active,override:overrides.get(tab),refresh:(await refresh.popup({action:'state',tabId:tab.id})).status,unload:(await unloader.popup({action:'state',tabId:tab.id})).status})));
        return {ok:true,rows,total:tabs.length};
      }
      if(msg.action==='bulk' && overview) {
        if(!Array.isArray(msg.tabs) || !msg.tabs.length || msg.tabs.length>100 || new Set(msg.tabs.map(tab=>tab.id)).size!==msg.tabs.length)throw new Error('Choose 1–100 tabs.');
        const targets=await Promise.all(msg.tabs.map(async value=>{const tab=await browser.tabs.get(value.id);if(!Number.isInteger(value.id) || relayTabDomain(tab)!==value.domain || !value.domain)throw new Error('A selected tab changed. Refresh the list.');return tab;}));
        if(!['none','awake','pause'].includes(msg.mode) || ![0,1800,3600].includes(msg.seconds))throw new Error('Choose an override and duration.');
        const results=await Promise.allSettled(targets.map(tab=>overrides.set(tab,msg.mode,msg.seconds)));
        const failed=results.filter(row=>row.status==='rejected').length;
        return {ok:!failed,changed:targets.length-failed,error:failed ? `${failed} tab overrides failed. Refresh the list.` : ''};
      }
      if(!Number.isInteger(msg.tabId))throw new Error('Choose a web tab.');
      const tab=await browser.tabs.get(msg.tabId),domain=relayTabDomain(tab);
      if(!domain || msg.expectedDomain && msg.expectedDomain!==domain)throw new Error('The site changed. Reopen the controls.');
      if(msg.action==='state')return {ok:true,domain,override:overrides.get(tab)};
      if(msg.action!=='override')throw new Error('Unsupported timer operation.');
      if(!['reload','unload'].includes(msg.kind))throw new Error('Choose the reload or unload card.');
      return {ok:true,override:await overrides.set(tab,msg.mode,msg.seconds,msg.kind)};
    });
    queue=task.catch(()=>{}); return task;
  }
  return {request};
}

// Browser-local utilities have no page-to-Cyrune or native authority.
const browserUtilities = (() => {
  const PREFS = 'cyruneBrowserUtilitiesV1', REFRESH = 'cyruneRefreshDomainsV2', LEGACY_REFRESH = 'cyruneRefreshPagesV1';
  const PREFIX = 'cyrune-refresh:', MENU = 'cyrune-utility-';
  const defaults = { copyLinks: true, collectLinks: true, copyTabs: true,
    restoreSelection: false, restoreCopy: false, restorePaste: false, exceptions: [] };
  let prefs = { ...defaults }, pages = [], ready, mutation = Promise.resolve();
  const scheduled = new Map(), generations = new Map(), dirtyTabs = new Set();
  const refreshDue = new Map(), refreshLast = new Map(), refreshSkipped = new Map(), refreshing = new Map();
  const selectedByWindow = new Map();
  const formats = ['url', 'text', 'markdown'];

  function webUrl(value, page = false) {
    if (typeof value !== 'string' || value.length > 4096) return '';
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return '';
      if (page) {
        if (['localhost', '127.0.0.1'].includes(url.hostname)) return '';
        url.hash = '';
      }
      return url.href;
    } catch { return ''; }
  }
  function normalizeLinks(links) {
    if (!Array.isArray(links) || links.length > 200) throw new Error('Choose at most 200 links.');
    const seen = new Set();
    return links.flatMap(link => {
      const url = webUrl(link?.url);
      if (!url || seen.has(url)) return [];
      seen.add(url);
      const title = typeof link.title === 'string' ? link.title.slice(0, 2000).replace(/\s+/g, ' ').trim().slice(0, 500) : '';
      return [{ url, title: title || url }];
    });
  }
  function formatLinks(links, format) {
    if (!formats.includes(format)) throw new Error('Unsupported copy format.');
    return links.map(({ url, title }) => format === 'url' ? url : format === 'text' ? `${title} — ${url}`
      : `[${title.replace(/([\\\[\]])/g, '\\$1')}](${url.replace(/([\\()])/g, '\\$1')})`).join('\n');
  }
  async function copy(links, format) {
    const safe = normalizeLinks(links);
    if (!safe.length) throw new Error('No web links were found.');
    await navigator.clipboard.writeText(formatLinks(safe, format));
    return { ok: true, count: safe.length };
  }
  function serialize(task) {
    const next = mutation.then(task, task);
    mutation = next.catch(() => {});
    return next;
  }
  async function load() {
    const stored = await browser.storage.local.get([PREFS, REFRESH, LEGACY_REFRESH]);
    const settings = stored[PREFS];
    let saved = stored[REFRESH];
    if (!saved && stored[LEGACY_REFRESH]) {
      const legacy = stored[LEGACY_REFRESH];
      if (legacy.schemaVersion !== 1 || !Array.isArray(legacy.pages) || legacy.pages.length > 256 || legacy.pages.some(rule =>
          !webUrl(rule?.url, true) || typeof rule.enabled !== 'boolean' || !Number.isInteger(rule.seconds) || rule.seconds < 10 || rule.seconds > 86400)) throw new Error('Saved refresh settings need recovery; original records were retained.');
      const domains = new Map(), conflicts = new Set();
      for (const rule of [...legacy.pages].sort((a, b) => a.url.localeCompare(b.url))) {
        const domain = relaySiteDomain(rule.url);
        if (!domain) continue;
        const previous = domains.get(domain);
        if (previous && (previous.seconds !== rule.seconds || previous.enabled !== rule.enabled)) conflicts.add(domain);
        if (!previous) domains.set(domain, { domain, seconds: rule.seconds, enabled: rule.enabled });
      }
      for (const domain of conflicts) domains.get(domain).enabled = false;
      saved = { schemaVersion: 2, pages: [...domains.values()], conflicts: [...conflicts], migratedAt: Date.now() };
      await browser.storage.local.set({ [REFRESH]: saved });
    }
    if (settings && settings.schemaVersion !== 1 || saved && saved.schemaVersion !== 2) {
      throw new Error('Browser utility settings need a compatible Relay version.');
    }
    for (const name of Object.keys(defaults)) {
      if (name !== 'exceptions' && typeof settings?.[name] === 'boolean') prefs[name] = settings[name];
    }
    prefs.exceptions = Array.isArray(settings?.exceptions) ? [...new Set(settings.exceptions
      .filter(host => typeof host === 'string' && host.length <= 253))].slice(0, 256) : [];
    if (saved && (!Array.isArray(saved.pages) || saved.pages.length > 256 || saved.pages.some(rule =>
      !rule?.domain || relaySiteDomain(rule.domain) !== rule.domain || typeof rule.enabled !== 'boolean'
      || !Number.isInteger(rule.seconds) || rule.seconds < 10 || rule.seconds > 86400))) {
      throw new Error('Saved refresh settings are invalid; existing data was retained.');
    }
    pages = saved?.pages || [];
  }
  async function ensureReady() {
    if (!ready) ready = load();
    await ready;
  }
  function ruleFor(tab) {
    return tab && !tab.incognito && (webUrl(tab.url, true) || tab.url?.startsWith(browser.runtime.getURL('popup/popup.html') + '?view=blocked&'))
      ? pages.find(rule => rule.domain === relayTabDomain(tab)) : null;
  }
  const clockIcons = new Map();
  function clockIcon(active) {
    if (clockIcons.has(active)) return clockIcons.get(active);
    const icons = {};
    for (const size of [19, 38]) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.scale(size / 24, size / 24);
      context.strokeStyle = active ? '#22c55e' : '#94a3b8';
      context.lineWidth = 2;
      context.lineCap = 'round';
      context.beginPath();
      context.arc(12, 12, 9, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(12, 6); context.lineTo(12, 12); context.lineTo(16, 14);
      context.stroke();
      icons[size] = context.getImageData(0, 0, size, size);
    }
    clockIcons.set(active, icons);
    return icons;
  }
  async function badge(tabId, rule, tab) {
    // Clear the former toolbar indicator when reloading an existing installation.
    await browser.browserAction.setBadgeText({ tabId, text: '' }).catch(() => {});
    await browser.browserAction.setTitle({ tabId, title: 'Cyrune Relay' }).catch(() => {});
    if (!browser.pageAction) return;
    if (!relayTabDomain(tab)) {
      await browser.pageAction.hide(tabId);
      return;
    }
    await browser.pageAction.setIcon({ tabId, imageData: clockIcon(rule?.enabled === true) });
    await browser.pageAction.setTitle({ tabId, title: rule?.enabled
      ? `Timer & Activity Tracker · automatic refresh · every ${rule.seconds}s` : rule ? `Timer & Activity Tracker · reload paused · every ${rule.seconds}s` : 'Timer & Activity Tracker' });
    await browser.pageAction.show(tabId);
  }
  async function syncTab(tabId) {
    const generation = (generations.get(tabId) || 0) + 1;
    generations.set(tabId, generation);
    await browser.alarms.clear(PREFIX + tabId);
    const tab = await browser.tabs.get(tabId).catch(() => null);
    if (generations.get(tabId) !== generation) return;
    if (!tab) {
      generations.delete(tabId);
      scheduled.delete(tabId);
      refreshDue.delete(tabId); refreshLast.delete(tabId); refreshSkipped.delete(tabId); refreshing.delete(tabId);
      return;
    }
    const rule = ruleFor(tab);
    scheduled.delete(tabId);
    refreshDue.delete(tabId);
    if (rule?.enabled && !relayTimerPaused(tab,'reload') && !tab.active && !tab.discarded && /^https?:/.test(tab.url) && tab.status === 'complete') {
      scheduled.set(tabId, rule.domain);
      const when = Date.now() + rule.seconds * 1000; refreshDue.set(tabId, when);
      browser.alarms.create(PREFIX + tabId, { when });
    }
    if (tab) await badge(tabId, rule, tab);
  }
  async function syncTabs() {
    const tabs = await browser.tabs.query({});
    await Promise.allSettled(tabs.map(tab => syncTab(tab.id)));
  }
  async function alarm({ name }) {
    if (!name.startsWith(PREFIX)) return;
    await ensureReady();
    const tabId = Number(name.slice(PREFIX.length)), expected = scheduled.get(tabId);
    const generation = generations.get(tabId);
    if (!expected) return;
    try {
      let tab = await browser.tabs.get(tabId);
      const expectedUrl = tab.url;
      let rule = ruleFor(tab);
      if (!rule?.enabled || relayTimerPaused(tab,'reload') || rule.domain !== expected || tab.active || tab.status !== 'complete' || tab.discarded || dirtyTabs.has(tabId)) return;
      const state = await browser.tabs.sendMessage(tabId, { type: 'CYRUNE_UTILITY_DIRTY' }, { frameId: 0 }).catch(() => null);
      if (state?.dirty === true) refreshSkipped.set(tabId, 'Edited form');
      if (typeof state?.dirty !== 'boolean') refreshSkipped.set(tabId, 'Page access unavailable');
      tab = await browser.tabs.get(tabId);
      rule = ruleFor(tab);
      if (tab.url !== expectedUrl || state?.dirty !== false || !rule?.enabled || rule.domain !== expected || tab.status !== 'complete'
          || relayTimerPaused(tab,'reload') || tab.active || tab.discarded || dirtyTabs.has(tabId) || generations.get(tabId) !== generation) return;
      refreshing.set(tabId, expectedUrl);
      try { await browser.tabs.reload(tabId); } catch (error) { refreshing.delete(tabId); refreshSkipped.set(tabId, 'Reload failed'); throw error; }
    } finally {
      await syncTab(tabId);
    }
  }
  async function webState(sender) {
    await ensureReady();
    await mutation;
    if (sender?.id !== browser.runtime.id || !webUrl(sender?.tab?.url, true)) return {};
    const disabled = prefs.exceptions.includes(new URL(sender.tab.url).hostname);
    return Object.fromEntries(['restoreSelection', 'restoreCopy', 'restorePaste'].map(key => [key, !disabled && prefs[key]]));
  }
  function formEdited(sender) {
    if (sender?.id === browser.runtime.id && Number.isInteger(sender?.tab?.id) && webUrl(sender.tab.url, true)) dirtyTabs.add(sender.tab.id);
  }
  async function injectOpenTabs() {
    const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    await Promise.allSettled(tabs.filter(tab => webUrl(tab.url, true)).map(tab => browser.tabs.executeScript(tab.id,
      { file: '/content.js', allFrames: true, runAt: 'document_start' })));
  }
  async function requireWebHandler(tabId) {
    const request = () => browser.tabs.sendMessage(tabId, { type: 'CYRUNE_UTILITY_DIRTY' }, { frameId: 0 });
    let state = await request().catch(() => null);
    if (typeof state?.dirty !== 'boolean') {
      await browser.tabs.executeScript(tabId, { file: '/content.js', runAt: 'document_start' }).catch(() => {});
      state = await request().catch(() => null);
    }
    if (typeof state?.dirty !== 'boolean') throw new Error('Firefox does not allow Relay on this page. Reload it or choose another page.');
  }
  let popupRequests = Promise.resolve();
  function popup(msg) {
    const task = popupRequests.then(() => handlePopup(msg));
    popupRequests = task.catch(() => {});
    return task;
  }
  async function handlePopup(msg) {
    await ensureReady();
    if (!Number.isInteger(msg.tabId)) throw new Error('Choose a browser tab.');
    const tab = await browser.tabs.get(msg.tabId);
    const url = webUrl(tab.url, true), hostname = url ? new URL(url).hostname : '';
    if (msg.action === 'state') return { ok: true, prefs, rule: ruleFor(tab) || null, url: url || tab.url, domain: relayTabDomain(tab),
      eligible: !!relayTabDomain(tab) && (!!url || tab.url?.startsWith(browser.runtime.getURL('popup/popup.html') + '?view=blocked&')), edited: dirtyTabs.has(tab.id), siteException: prefs.exceptions.includes(hostname),
      status: { reason: !ruleFor(tab)?.enabled ? 'Off' : relayTimerPaused(tab,'reload') ? 'Temporarily paused' : tab.discarded ? 'Unloaded' : dirtyTabs.has(tab.id) ? 'Edited form' : refreshing.has(tab.id) ? 'Reloading' : tab.status !== 'complete' ? 'Loading' : 'Waiting', nextAt: refreshDue.get(tab.id) || 0, lastAt: refreshLast.get(tab.id) || 0, lastSkip: refreshSkipped.get(tab.id) || '' } };
    if (msg.action === 'preferences') return serialize(async () => {
      const next = { ...prefs };
      if (msg.name === 'siteException' && hostname && typeof msg.value === 'boolean') {
        next.exceptions = prefs.exceptions.filter(host => host !== hostname);
        if (msg.value) {
          if (next.exceptions.length >= 256) throw new Error('Site exception limit reached (256).');
          next.exceptions.push(hostname);
        }
      } else if (Object.hasOwn(defaults, msg.name) && msg.name !== 'exceptions' && typeof msg.value === 'boolean') next[msg.name] = msg.value;
      else throw new Error('Unsupported browser utility setting.');
      await browser.storage.local.set({ [PREFS]: { schemaVersion: 1, ...next } });
      prefs = next;
      await setupMenus();
      await injectOpenTabs();
      return { ok: true };
    });
    if (msg.action === 'refresh') return serialize(async () => {
      if (!relayTabDomain(tab) || !url && !tab.url?.startsWith(browser.runtime.getURL('popup/popup.html') + '?view=blocked&')) throw new Error('Choose a non-private web page.');
      if (msg.expectedUrl !== (url || tab.url)) throw new Error('The tab navigated. Reopen the popup.');
      const latest = await browser.tabs.get(tab.id);
      if (latest.url !== tab.url) throw new Error('The tab navigated. Reopen the popup.');
      if (msg.mode === 'start' && url) await requireWebHandler(tab.id);
      if ((await browser.tabs.get(tab.id)).url !== tab.url) throw new Error('The tab navigated. Reopen the popup.');
      let next = pages.filter(rule => rule.domain !== relayTabDomain(tab));
      if (msg.mode !== 'forget') {
        if (!['start', 'pause'].includes(msg.mode) || !Number.isInteger(msg.seconds) || msg.seconds < 10 || msg.seconds > 86400) {
          throw new Error('Choose a whole interval from 10 seconds to 24 hours.');
        }
        if (next.length >= 256) throw new Error('Saved page limit reached (256). Forget an existing page first.');
        next.push({ domain: relayTabDomain(tab), seconds: msg.seconds, enabled: msg.mode === 'start' });
      }
      await browser.storage.local.set({ [REFRESH]: { schemaVersion: 2, pages: next } });
      pages = next;
      await syncTabs();
      if (msg.mode === 'start') await injectOpenTabs();
      return { ok: true };
    });
    if (msg.action === 'copyTabs') {
      if (!prefs.copyTabs) throw new Error('Enable tab copying first.');
      if (!['selected', 'window'].includes(msg.scope)) throw new Error('Unsupported tab scope.');
      const tabs = await browser.tabs.query({ windowId: tab.windowId, ...(msg.scope === 'selected' ? { highlighted: true } : {}) });
      return copy(tabs.filter(item => !item.incognito).sort((a, b) => a.index - b.index), msg.format);
    }
    if (msg.action === 'copyPage') {
      if (!prefs.copyLinks) throw new Error('Enable link copying first.');
      return copy([tab], msg.format);
    }
    throw new Error('Unsupported browser utility action.');
  }
  const menuDefinitions = () => {
    const items = [];
    const add = (id, title, contexts) => items.push({ id: MENU + id, title, contexts });
    if (prefs.copyLinks) {
      add('link-label', 'Copy link text', ['link']);
      add('link-text', 'Copy link: title and URL', ['link']);
      add('link-markdown', 'Copy link as Markdown', ['link']);
      add('page-text', 'Copy page: title and URL', ['page']);
      add('page-markdown', 'Copy page as Markdown', ['page']);
    }
    if (prefs.collectLinks) {
      for (const [format, title] of [['url', 'URLs'], ['text', 'titles and URLs'], ['markdown', 'Markdown']]) {
        add('selection-' + format, 'Copy selected links: ' + title, ['selection']);
      }
      add('selection-open', 'Open selected links in background tabs (max 20)', ['selection']);
      add('selection-import', 'Send selected links to Portal Import Manager', ['selection']);
    }
    if (prefs.copyTabs) for (const [scope, title] of [['selected', 'selected tabs'], ['window', 'window tabs']]) {
      for (const [format, label] of [['url', 'URLs'], ['text', 'titles and URLs'], ['markdown', 'Markdown']]) {
        add(`tabs-${scope}-${format}`, `Copy ${title}: ${label}`, ['tab']);
      }
    }
    return items;
  };
  let menuMutation = Promise.resolve();
  function setupMenus() {
    menuMutation = menuMutation.catch(() => {}).then(async () => {
      if (!browser.menus?.create) return;
      await browser.menus.remove(MENU + 'root').catch(() => {});
      const items = menuDefinitions();
      if (!items.length) return;
      browser.menus.create({ id: MENU + 'root', title: 'Cyrune utilities', contexts: ['page', 'link', 'selection', 'tab'],
        documentUrlPatterns: ['http://*/*', 'https://*/*'] });
      for (const item of items) browser.menus.create({ ...item, parentId: MENU + 'root' });
    });
    return menuMutation;
  }
  async function menuClick(info, tab) {
    const id = String(info.menuItemId || '');
    if (!id.startsWith(MENU) || id === MENU + 'root') return;
    await ensureReady();
    const action = id.slice(MENU.length);
    if (!menuDefinitions().some(item => item.id === id)) throw new Error('This utility is disabled.');
    if (action.startsWith('tabs-')) {
      const [, scope, format] = action.split('-');
      return popup({ action: 'copyTabs', tabId: tab.id, scope, format });
    }
    if (action.startsWith('link-')) {
      const links = normalizeLinks([{ url: info.linkUrl, title: info.linkText }]);
      if (action === 'link-label') {
        if (!links.length) throw new Error('No web link was found.');
        await navigator.clipboard.writeText(links[0].title);
        return { ok: true, count: 1 };
      }
      return copy(links, action.slice(5));
    }
    if (action.startsWith('page-')) return copy([{ url: info.pageUrl || tab.url, title: tab.title }], action.slice(5));
    if (action.startsWith('selection-')) {
      let result;
      const request = () => browser.tabs.sendMessage(tab.id, { type: 'CYRUNE_UTILITY_LINKS' }, { frameId: info.frameId || 0 });
      try { result = await request(); } catch {
        await browser.tabs.executeScript(tab.id, { file: '/content.js', frameId: info.frameId || 0 });
        result = await request();
      }
      if (result?.error) throw new Error(result.error);
      const links = normalizeLinks(result?.links);
      if (!links.length) throw new Error('No web links were found in the selection.');
      if (action === 'selection-open') {
        if (links.length > 20) throw new Error('Choose at most 20 links to open at once.');
        for (let index = 0; index < links.length; index++) await browser.tabs.create({ url: links[index].url,
          active: false, windowId: tab.windowId, openerTabId: tab.id, index: tab.index + 1 + index });
        return { ok: true, count: links.length };
      }
      if (action === 'selection-import') {
        if (tab.incognito) throw new Error('Import from a non-private window.');
        const response = await sendImportItemsToMorpheus(links.map(tabToImportItem), 'selected-links');
        if (!response?.ok) throw new Error(response?.error || 'Portal could not accept these links.');
        return { ...response, count: links.length };
      }
      return copy(links, action.slice(10));
    }
  }
  async function notify(message) {
    await browser.notifications.create({ type: 'basic', iconUrl: browser.runtime.getURL('icons/icon-48.svg'),
      title: 'Cyrune Relay', message }).catch(() => {});
  }
  async function start() {
    await ensureReady();
    await setupMenus();
    const alarms = await browser.alarms.getAll();
    await Promise.all(alarms.filter(item => item.name.startsWith(PREFIX)).map(item => browser.alarms.clear(item.name)));
    for (const tab of await browser.tabs.query({})) if (tab.active) selectedByWindow.set(tab.windowId, tab.id);
    await syncTabs();
    browser.alarms.onAlarm.addListener(event => { void alarm(event).catch(() => {}); });
    browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
      const previous = selectedByWindow.get(windowId);
      selectedByWindow.set(windowId, tabId);
      // Only the selected/deselected pair changes: unrelated background timers
      // keep their deadlines, including timers in other browser windows.
      void Promise.allSettled([...new Set([previous, tabId])].filter(Number.isInteger).map(syncTab));
    });
    browser.tabs.onUpdated.addListener((tabId, change) => {
      if (change.status === 'loading') { dirtyTabs.delete(tabId); refreshSkipped.delete(tabId); }
      if (change.url && refreshing.get(tabId) !== change.url) refreshing.delete(tabId);
      if (change.status === 'complete' && refreshing.has(tabId)) {
        const expectedUrl = refreshing.get(tabId); refreshing.delete(tabId);
        void browser.tabs.get(tabId).then(tab => {
          if (tab.url !== expectedUrl || tab.discarded) return;
          refreshLast.set(tabId, Date.now()); refreshSkipped.delete(tabId);
          return browser.tabs.sendMessage(tabId, { type: 'CYRUNE_UTILITY_FEEDBACK', mode: 'reloaded' }, { frameId: 0 });
        }).catch(() => {});
      }
      if (change.url || change.status) void syncTab(tabId).catch(() => {});
    });
    browser.tabs.onRemoved.addListener(tabId => {
      generations.delete(tabId);
      scheduled.delete(tabId);
      dirtyTabs.delete(tabId);
      refreshDue.delete(tabId); refreshLast.delete(tabId); refreshSkipped.delete(tabId); refreshing.delete(tabId);
      for (const [windowId, selected] of selectedByWindow) if (selected === tabId) selectedByWindow.delete(windowId);
      void browser.alarms.clear(PREFIX + tabId);
    });
    browser.menus.onClicked.addListener((info, tab) => {
      if (!String(info.menuItemId).startsWith(MENU)) return;
      void menuClick(info, tab).then(result => {
        if (result?.count) return notify(result.queued ? `${result.count} links queued for Portal.` : `${result.count} link${result.count === 1 ? '' : 's'} processed.`);
      }).catch(error => notify(error.message));
    });
  }
  return { start, popup, webState, formEdited, menuClick, webUrl, normalizeLinks, formatLinks, alarm, syncTab, ready:ensureReady, hasRule:tab=>!!ruleFor(tab)?.enabled, isEdited: tabId => dirtyTabs.has(tabId) };
})();

function setupBookmarkImportMenu() {
  if (!browser.menus?.create) return;
  browser.menus.remove(MENU_IMPORT_BOOKMARK_ID)
    .catch(() => {})
    .then(() =>
      browser.menus.create({
        id: MENU_IMPORT_BOOKMARK_ID,
        title: 'Send to Cyrune Portal Import Manager',
        contexts: ['bookmark']
      })
    )
    .catch(e => console.warn('Cyrune Relay: failed to create bookmark import menu', e));
}

if (browser.menus?.onClicked) {
  setupBookmarkImportMenu();
  browser.menus.onClicked.addListener((info) => {
    if (info.menuItemId !== MENU_IMPORT_BOOKMARK_ID) return;
    importBookmarkNode(info.bookmarkId).catch(e => {
      console.warn('Cyrune Relay: bookmark import failed', e);
    });
  });
}

if (browser.commands?.onCommand) {
  browser.commands.onCommand.addListener(command => {
    if (command !== 'open-command-palette') return;
    void ensureMorpheusTab()
      .then(async tab => {
        if (!tab) throw new Error('Cyrune Portal is not open');
        if (browser.tabs.update) await browser.tabs.update(tab.id, { active: true }).catch(() => {});
        if (tab.windowId !== undefined && browser.windows?.update) {
          await browser.windows.update(tab.windowId, { focused: true }).catch(() => {});
        }
        return sendToMorpheus({ type: 'MW_OPEN_COMMAND_PALETTE' });
      })
      .catch(error => console.warn('Cyrune Relay: command palette shortcut failed', error));
  });
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

browser.tabs.onRemoved.addListener(tabId => {
  if (hubRegistrations.has(tabId)) forgetMorpheusTab(tabId);
  emuguiRegistrations.delete(tabId);
  nexusRegistrations.delete(tabId);
});

if (browser.tabs.onUpdated) {
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' || changeInfo.url) closeCatalogueSession(tabId);
    const registration = hubRegistrations.get(tabId);
    if (registration && changeInfo.url && changeInfo.url !== registration.url) {
      forgetMorpheusTab(tabId, 'The Portal tab navigated away');
    }
    const nexusRegistration = nexusRegistrations.get(tabId);
    if (nexusRegistration && changeInfo.url && canonicalNexusDocumentUrl(changeInfo.url) !== nexusRegistration.url) {
      nexusRegistrations.delete(tabId);
    }
    const arcadeRegistration = emuguiRegistrations.get(tabId);
    if (arcadeRegistration && changeInfo.url && changeInfo.url !== arcadeRegistration.url) {
      emuguiRegistrations.delete(tabId);
    }
    if (changeInfo.status === 'complete' && isPotentialHubUrl(tab?.url || '')) {
      void discoverMorpheusTab(tab, { inject: true });
    }
  });
}

if (browser.tabs.onActivated) {
  browser.tabs.onActivated.addListener(({ tabId }) => {
    const now = Date.now();
    for (const [registeredTabId, registration] of hubRegistrations) {
      registration.active = registeredTabId === tabId;
      if (registration.active) registration.lastActiveAt = now;
    }
    selectRegisteredHub();
    if (typeof browser.tabs.get === 'function') {
      void browser.tabs.get(tabId).then(tab => {
        if (/^https?:\/\//i.test(tab?.url || '') && !isPotentialHubUrl(tab.url)) lastActiveWebTab = tab;
      }).catch(() => {});
    }
  });
}

// Content scripts are not retroactively attached when a temporary/reloaded
// extension starts while the Hub tab is already open. Rebuild the registry
// once at background startup; normal tab updates handle later navigations.
void ensureMorpheusTab();
void browserUtilities.start().catch(() => {});
const productivityService = createProductivityService({ browser, store: createProductivityStore() });
const siteAllowances = createSiteAllowances({browser,productivity:productivityService});
const siteControls = createSiteControls({ browser, productivity: productivityService, allowances:siteAllowances });
siteControls.start();
void productivityService.start().catch(() => {});
const tabUnloader = createTabUnloader({ browser, isEdited: browserUtilities.isEdited, onDiscard: tabId => browserUtilities.syncTab(tabId) });
void tabUnloader.start().catch(() => {});
const timerOverrides = createTimerOverrides({browser,changed:(ids,kinds=['reload','unload'])=>Promise.allSettled(ids.flatMap(id=>kinds.map(kind=>kind==='reload'?browserUtilities.syncTab(id):tabUnloader.resetTab(id))))});
timerOverrides.start();
const tabTimerController = createTabTimerController({browser,refresh:browserUtilities,unloader:tabUnloader,overrides:timerOverrides});
