const ARCADE_VERSION = '0.2.58';

const state = {
  games: [],
  gamesById: new Map(),
  gameDetails: new Map(),
  filtered: [],
  selected: null,
  selectedIds: new Set(),
  emulators: [],
  emulatorProfiles: [],
  collections: [],
  activeCollection: null,
  recentIds: new Set(),
  multiFilters: {},
  excludedFilters: {},
  openFilterKey: "",
  sortRules: [{ key: "title", dir: "asc" }],
  view: "all",
  ui: null,
};

let listClickTimer = 0;
let draggedColumnKey = "";
let virtualFrame = 0;
let filterFrame = 0;
let detailRenderGeneration = 0;
let virtualRange = { start: -1, end: -1, columns: -1 };
const extensionAssetCache = globalThis.ArcadeArtwork.create({
  scope:() => state.activeCollection?.id || '',
  revision:() => state.metadataGeneration || 0,
  request:(path, collectionId) => globalThis.ArcadeTransport.asset(path, collectionId)
});
const requestArcadeRpc = globalThis.ArcadeTransport.rpc;
const sendArcadeGame = globalThis.ArcadeTransport.sendGame;
let portalDeliveryDraft = null;
const arcadeCyruneSettings = globalThis.ArcadeTransport.settings;
const optionalNetworkAllowed = globalThis.ArcadeTransport.optionalNetworkAllowed;
const webHubHandoff = (() => {
  const params = new URLSearchParams(window.location.search);
  const gameId = String(params.get("game") || "");
  const collectionId = String(params.get("collection") || "");
  const rebindGameKey = String(params.get("hubRebind") || "");
  return {
    gameId: /^[a-zA-Z0-9_-]{1,120}$/.test(gameId) ? gameId : "",
    collectionId: /^[a-zA-Z0-9_-]{1,120}$/.test(collectionId) ? collectionId : "",
    rebindGameKey: /^game_[a-zA-Z0-9_-]{12,75}$/.test(rebindGameKey) ? rebindGameKey : "",
  };
})();

const COUNTRY_NAMES = {
  BR: "Brazil",
  CA: "Canada",
  CZ: "Czech Republic",
  DE: "Germany",
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  GR: "Greece",
  HR: "Croatia",
  HU: "Hungary",
  IT: "Italy",
  JP: "Japan",
  NL: "Netherlands",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  RU: "Russia",
  SK: "Slovakia",
  TR: "Turkey",
  US: "United States",
  UZ: "Uzbekistan",
};

const LANGUAGE_NAMES = {
  AR: "Arabic",
  CS: "Czech",
  DA: "Danish",
  DE: "German",
  EL: "Greek",
  EN: "English",
  ES: "Spanish",
  FI: "Finnish",
  FR: "French",
  HR: "Croatian",
  HU: "Hungarian",
  IT: "Italian",
  JA: "Japanese",
  KO: "Korean",
  NL: "Dutch",
  NO: "Norwegian",
  PL: "Polish",
  PT: "Portuguese",
  RO: "Romanian",
  RU: "Russian",
  SK: "Slovak",
  SV: "Swedish",
  TR: "Turkish",
  UZ: "Uzbek",
};

const SYSTEM_ORDER = ["16K", "16K-48K", "48K", "48K-128K", "128K"];
const TAG_SUGGESTIONS = ["Official", "Homebrew", "CSSCGC", "ULAPlus", "Demo", "Covertape", "Magazine", "Education", "Utility", "BASIC", "Modern", "Scene"];
const SORT_FIELDS = [
  ["title", "Name"],
  ["publisher", "Publisher"],
  ["series", "Series"],
  ["year", "Year"],
  ["system", "System"],
  ["tag", "Tags"],
  ["language", "Language"],
  ["country", "Country"],
  ["version", "Version"],
  ["poks", "POKs"],
  ["favourite", "Favourite"],
  ["recent", "Recent"],
];
const COUNTRY_OPTIONS = Object.keys(COUNTRY_NAMES).sort((a, b) => COUNTRY_NAMES[a].localeCompare(COUNTRY_NAMES[b]));
const LANGUAGE_OPTIONS = Object.keys(LANGUAGE_NAMES).sort((a, b) => LANGUAGE_NAMES[a].localeCompare(LANGUAGE_NAMES[b]));
const ADD_COLLECTION_VALUE = "__add_collection__";
const UI_STORAGE_KEY = "desasteron-spectrum-launcher-ui-v2";
const VIRTUAL_ROW_HEIGHT = 38;
const VIRTUAL_BUFFER_ROWS = 12;
const COLUMN_DEFS = [
  { key: "title", label: "Title", sort: "title", width: 340, visible: true, render: renderTitleCell },
  { key: "publisher", label: "Publisher", sort: "publisher", width: 180, visible: true, render: (game) => escapeHtml(game.publisher || "") },
  { key: "series", label: "Series", sort: "series", width: 150, visible: true, render: (game) => escapeHtml(game.series || "") },
  { key: "year", label: "Year", sort: "year", width: 72, visible: true, render: (game) => escapeHtml(gameYear(game)) },
  { key: "system", label: "System", sort: "system", width: 110, visible: true, render: renderPlatformIcons },
  { key: "tags", label: "Tags", sort: "tag", width: 170, visible: true, render: (game) => escapeHtml(collectionTypeLabel(game)) },
  { key: "language", label: "Lang", sort: "language", width: 90, visible: true, render: (game) => renderVersionFlags(game.languages || [], true) },
  { key: "country", label: "Country", sort: "country", width: 90, visible: true, render: (game) => renderVersionFlags(game.countries || [], false) },
  { key: "versions", label: "Versions", sort: "version", width: 170, visible: true, render: (game) => escapeHtml(game.version_editions?.join(' / ') || game.version || '') },
  { key: "poks", label: "POKs", sort: "poks", width: 64, visible: true, render: (game) => (game.pok_count ? `<span class="pill good">${game.pok_count}</span>` : "") },
  { key: "file", label: "Filename", sort: "file", width: 300, visible: false, render: (game) => escapeHtml(game.file_name || "") },
  { key: "format", label: "Format", sort: "format", width: 76, visible: false, render: (game) => escapeHtml(fileExtension(game.file_name)) },
  { key: "collection", label: "Collection", sort: "collection", width: 150, visible: false, render: (game) => escapeHtml(game.section || game.category || "") },
  { key: "favourite", label: "Fav", sort: "favourite", width: 62, visible: false, render: (game) => (game.favourite ? statusIcon("favourite", "Favourite", "★") : "") },
  { key: "recent", label: "Recent", sort: "recent", width: 78, visible: false, render: (game) => (state.recentIds.has(game.id) ? statusIcon("recent", "Recent", "↻") : "") },
];
const COLUMN_MAP = new Map(COLUMN_DEFS.map((column) => [column.key, column]));
const COLLECTION_PLATFORMS = Object.freeze(Object.fromEntries(Object.entries(globalThis.ArcadePlatforms.libraries).map(([id, platform]) => [id, platform.label])));

state.ui = loadUiState();

const els = {
  shell: document.querySelector("#shell"),
  gameTable: document.querySelector("#game-table"),
  library: document.querySelector(".library"),
  colgroup: document.querySelector("#game-colgroup"),
  headRow: document.querySelector("#game-head-row"),
  count: document.querySelector("#library-count"),
  version: document.querySelector("#arcade-version"),
  resultCount: document.querySelector("#result-count"),
  selectionCount: document.querySelector("#selection-count"),
  activeSummary: document.querySelector("#active-summary"),
  list: document.querySelector("#game-list"),
  details: document.querySelector("#details"),
  search: document.querySelector("#search"),
  emulator: document.querySelector("#emulator"),
  collectionSelect: document.querySelector("#collection-select"),
  platformSelect: document.querySelector("#platform-select"),
  bulkEdit: document.querySelector("#bulk-edit"),
  importSelectTools: document.querySelector("#import-select-tools"),
  columnOptions: document.querySelector("#column-options"),
  toggleSidebar: document.querySelector("#toggle-sidebar"),
  toggleDetails: document.querySelector("#toggle-details"),
  selectVisible: null,
  clearFilters: document.querySelector("#clear-filters"),
  filterPoks: document.querySelector("#filter-poks"),
  filterView: document.querySelector("#filter-view"),
  filterCleanup: document.querySelector("#filter-cleanup"),
  incomingIndicator: document.querySelector("#incoming-indicator"),
  trashIndicator: document.querySelector("#trash-indicator"),
  filterSystem: document.querySelector("#filter-system"),
  filterLanguage: document.querySelector("#filter-language"),
  filterCountry: document.querySelector("#filter-country"),
  filterYear: document.querySelector("#filter-year"),
  filterPublisher: document.querySelector("#filter-publisher"),
  filterTag: document.querySelector("#filter-tag"),
  busyOverlay: document.querySelector("#busy-overlay"),
  busyTitle: document.querySelector("#busy-title"),
  busyMessage: document.querySelector("#busy-message"),
  busyProgress: document.querySelector("#busy-progress"),
};

if (els.version) {
  els.version.textContent = `v${ARCADE_VERSION}`;
  els.version.setAttribute('aria-label', `Open Arcade settings, version ${ARCADE_VERSION}`);
}

function columnSettings(value = {}) {
  const order = Array.isArray(value.columnOrder) ? [...new Set(value.columnOrder.filter(key => COLUMN_MAP.has(key)))] : [];
  const result = {
    columnOrder: [...order, ...COLUMN_DEFS.map(column => column.key).filter(key => !order.includes(key))],
    columnVisibility: Object.fromEntries(COLUMN_DEFS.map(column => [column.key,
      typeof value.columnVisibility?.[column.key] === 'boolean' ? value.columnVisibility[column.key] : column.visible])),
    columnWidths: Object.fromEntries(COLUMN_DEFS.map(column => [column.key,
      Number.isFinite(value.columnWidths?.[column.key]) ? Math.max(48, Math.min(640, value.columnWidths[column.key])) : column.width]))
  };
  if (!Object.values(result.columnVisibility).some(Boolean)) result.columnVisibility.title = true;
  return result;
}

function loadUiState() {
  let parsed = {};
  try { parsed = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || '{}') || {}; } catch (_) { /* Use defaults. */ }
  return {
    ...columnSettings(parsed),
    platformFilters: Object.fromEntries(Object.keys(COLLECTION_PLATFORMS)
      .map(key => [key, filterSettings(parsed.platformFilters?.[key])])),
    scraperProvider: typeof parsed.scraperProvider === 'string' && /^[a-z0-9_-]{1,64}$/i.test(parsed.scraperProvider) ? parsed.scraperProvider : '',
    legacyColumns: columnSettings(parsed.legacyColumns || parsed),
    platformColumns: Object.fromEntries(Object.keys(COLLECTION_PLATFORMS)
      .filter(key => parsed.platformColumns?.[key] && typeof parsed.platformColumns[key] === 'object')
      .map(key => [key, columnSettings(parsed.platformColumns[key])])),
    platformCollections: Object.fromEntries(Object.keys(COLLECTION_PLATFORMS)
      .filter(key => typeof parsed.platformCollections?.[key] === 'string')
      .map(key => [key, parsed.platformCollections[key].slice(0, 120)])),
    sidebarCollapsed: Boolean(parsed.sidebarCollapsed), detailsCollapsed: Boolean(parsed.detailsCollapsed)
  };
}

function saveUiState() {
  if (state.columnPlatform) state.ui.platformColumns[state.columnPlatform] = columnSettings(state.ui);
  try { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(state.ui)); } catch (_) { /* Keep preferences in memory if storage is unavailable. */ }
}

function filterSettings(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  const keys = ['system', 'language', 'country', 'year', 'publisher', 'tag'];
  const choices = field => Object.fromEntries(keys.map(key => [key, Array.isArray(value[field]?.[key])
    ? [...new Set(value[field][key].filter(item => typeof item === 'string' && item.length <= 200).slice(0, 200))] : []]));
  return {search:typeof value.search === 'string' ? value.search.slice(0, 500) : '',
    multiFilters:choices('multiFilters'), excludedFilters:choices('excludedFilters'),
    cleanup:['artwork','description','review'].includes(value.cleanup) ? value.cleanup : '',
    poks:['include','exclude'].includes(value.poks) ? value.poks : 'neutral',
    view:['all','favourites','recent','new','incoming','trash'].includes(value.view) ? value.view : 'all'};
}

function rememberPlatformFilters() {
  if (!state.filterPlatform) return;
  state.ui.platformFilters[state.filterPlatform] = filterSettings({search:els.search.value,
    multiFilters:state.multiFilters, excludedFilters:state.excludedFilters,
    poks:els.filterPoks.dataset.filterState, view:els.filterView.value, cleanup:els.filterCleanup?.value});
  saveUiState();
}

function restorePlatformFilters(platform) {
  if (state.filterPlatform === platform) return;
  rememberPlatformFilters();
  const saved = filterSettings(state.ui.platformFilters[platform]);
  state.filterPlatform = platform;
  els.search.value = saved.search;
  if (els.filterCleanup) els.filterCleanup.value = saved.cleanup;
  state.multiFilters = saved.multiFilters;
  state.excludedFilters = saved.excludedFilters;
  state.openFilterKey = '';
  setFilterCheckbox(els.filterPoks, saved.poks, 'POKs');
  // Build this collection's available views before selecting the stored view.
  renderViewOptions();
  els.filterView.value = [...els.filterView.options].some(option => option.value === saved.view) ? saved.view : 'all';
}

function collectionPlatform(collection) {
  return globalThis.ArcadePlatforms.collection(collection);
}

function restorePlatformColumns(platform) {
  if (state.columnPlatform === platform) return;
  if (state.columnPlatform) saveUiState();
  Object.assign(state.ui, columnSettings(state.ui.platformColumns[platform] || state.ui.legacyColumns));
  state.columnPlatform = platform;
  saveUiState();
  renderTableStructure();
  renderList();
}

function visibleColumns() {
  return state.ui.columnOrder
    .map((key) => COLUMN_MAP.get(key))
    .filter((column) => column && platformColumnAvailable(column.key) && state.ui.columnVisibility[column.key]);
}

function platformColumnAvailable(key) {
  return key !== 'poks' || Boolean(globalThis.ArcadePlatforms.libraries[collectionPlatform(state.activeCollection)]?.poks);
}

function platformEmulatorTypes(collection = state.activeCollection) {
  return globalThis.ArcadePlatforms.libraries[collectionPlatform(collection)]?.emulators || [];
}

function platformEmulators(collection = state.activeCollection) {
  return state.emulators.filter(emu => platformEmulatorTypes(collection).includes(emu.type || 'generic'));
}

function renderLayout() {
  els.shell.classList.toggle("sidebar-collapsed", state.ui.sidebarCollapsed);
  els.shell.classList.toggle("details-collapsed", state.ui.detailsCollapsed);
  els.toggleSidebar.classList.toggle("active", !state.ui.sidebarCollapsed);
  els.toggleDetails.classList.toggle("active", !state.ui.detailsCollapsed);
  els.toggleSidebar.textContent = state.ui.sidebarCollapsed ? ">" : "<";
  els.toggleDetails.textContent = state.ui.detailsCollapsed ? "<" : ">";
  els.toggleSidebar.title = state.ui.sidebarCollapsed ? "Show filters panel" : "Hide filters panel";
  els.toggleDetails.title = state.ui.detailsCollapsed ? "Show details panel" : "Hide details panel";
  els.toggleSidebar.setAttribute("aria-label", els.toggleSidebar.title);
  els.toggleDetails.setAttribute("aria-label", els.toggleDetails.title);
}

function toggleSidebar(which) {
  if (which === 'details' && window.innerWidth <= 1100) {
    els.shell.classList.toggle('mobile-details-open');
    return;
  }
  if (which === "sidebar") {
    state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed;
  } else {
    state.ui.detailsCollapsed = !state.ui.detailsCollapsed;
  }
  saveUiState();
  renderLayout();
  scheduleVirtualRender();
}

function resetColumnLayout() {
  state.ui.columnOrder = COLUMN_DEFS.map((column) => column.key);
  state.ui.columnVisibility = Object.fromEntries(COLUMN_DEFS.map((column) => [column.key, column.visible]));
  state.ui.columnWidths = Object.fromEntries(COLUMN_DEFS.map((column) => [column.key, column.width]));
  saveUiState();
  renderTableStructure();
  renderList();
  renderCounts();
}

function renderTableStructure() {
  const columns = visibleColumns();
  els.colgroup.innerHTML = [
    '<col class="col-select" style="width: 42px">',
    ...columns.map((column) => `<col data-col="${escapeHtml(column.key)}" style="width: ${columnWidth(column.key)}px">`),
  ].join("");
  els.headRow.innerHTML = [
    '<th class="select-column"><input id="select-visible" type="checkbox" title="Select or clear filtered games"></th>',
    ...columns.map((column) => renderHeaderCell(column)).join(""),
  ].join("");
  els.selectVisible = document.querySelector("#select-visible");
  els.selectVisible?.addEventListener("change", () => {
    const visibleIds = state.filtered.map((game) => game.id);
    if (els.selectVisible.checked) {
      visibleIds.forEach((id) => state.selectedIds.add(id));
    } else {
      visibleIds.forEach((id) => state.selectedIds.delete(id));
    }
    renderList();
    renderCounts();
  });
  bindColumnHeaders();
  updateTableMinWidth();
  updateSortHeaders();
}

function renderHeaderCell(column) {
  const sort = column.sort ? ` data-sort="${escapeHtml(column.sort)}"` : "";
  return `
    <th data-col="${escapeHtml(column.key)}"${sort} draggable="true" title="${escapeHtml(column.label)}">
      <span class="header-label">${escapeHtml(column.label)}</span>
      <span class="sort-indicator"></span>
      <span class="column-resizer" title="Resize column"></span>
    </th>
  `;
}

function bindColumnHeaders() {
  els.headRow.querySelectorAll("th[data-col]").forEach((header) => {
    header.addEventListener("click", (event) => {
      if (event.target.closest(".column-resizer")) return;
      if (header.dataset.sort) toggleColumnSort(header.dataset.sort);
    });
    header.addEventListener("contextmenu", (event) => {
      if (header.dataset.sort) showSortHeaderMenu(event, header.dataset.sort);
    });
    header.addEventListener("dragstart", (event) => {
      if (event.target.closest(".column-resizer")) {
        event.preventDefault();
        return;
      }
      header.classList.add("dragging");
      draggedColumnKey = header.dataset.col;
      event.dataTransfer.setData("text/plain", header.dataset.col);
      event.dataTransfer.effectAllowed = "move";
    });
    header.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      showColumnDropMarker(header, event);
    });
    header.addEventListener("dragleave", () => {
      header.classList.remove("drop-before", "drop-after");
    });
    header.addEventListener("dragend", () => {
      draggedColumnKey = "";
      clearColumnDropMarkers();
    });
    header.addEventListener("drop", (event) => {
      event.preventDefault();
      clearColumnDropMarkers();
      const sourceKey = event.dataTransfer.getData("text/plain") || draggedColumnKey;
      draggedColumnKey = "";
      moveColumn(sourceKey, header.dataset.col, dropSide(header, event));
    });
    header.querySelector(".column-resizer").addEventListener("mousedown", (event) => startColumnResize(event, header.dataset.col));
  });
}

function showColumnDropMarker(header, event) {
  clearColumnDropMarkers(header);
  const sourceKey = event.dataTransfer.getData("text/plain") || draggedColumnKey;
  if (!sourceKey || sourceKey === header.dataset.col) return;
  header.classList.add(dropSide(header, event) === "after" ? "drop-after" : "drop-before");
}

function clearColumnDropMarkers(except = null) {
  els.headRow.querySelectorAll("th[data-col]").forEach((header) => {
    if (header === except) return;
    header.classList.remove("drop-before", "drop-after", "dragging");
  });
}

function dropSide(header, event) {
  const rect = header.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2 ? "after" : "before";
}

function columnWidth(key) {
  const width = Number(state.ui.columnWidths[key] || COLUMN_MAP.get(key)?.width || 120);
  return Math.max(48, Math.min(640, width));
}

function updateTableMinWidth() {
  const total = 42 + visibleColumns().reduce((sum, column) => sum + columnWidth(column.key), 0);
  els.gameTable.style.minWidth = `${total}px`;
}

function startColumnResize(event, key) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startWidth = columnWidth(key);
  const onMove = (moveEvent) => {
    const width = Math.max(48, Math.min(640, startWidth + moveEvent.clientX - startX));
    state.ui.columnWidths[key] = width;
    const col = els.colgroup.querySelector(`col[data-col="${escapeAttributeSelector(key)}"]`);
    if (col) col.style.width = `${width}px`;
    updateTableMinWidth();
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    saveUiState();
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function moveColumn(sourceKey, targetKey, side = "before") {
  if (!sourceKey || !targetKey || sourceKey === targetKey) return;
  const currentOrder = [...state.ui.columnOrder];
  const order = state.ui.columnOrder.filter((key) => key !== sourceKey);
  let targetIndex = order.indexOf(targetKey);
  if (targetIndex < 0) targetIndex = order.length;
  if (side === "after") targetIndex += 1;
  order.splice(targetIndex, 0, sourceKey);
  if (order.join("\u0001") === currentOrder.join("\u0001")) return;
  state.ui.columnOrder = order;
  saveUiState();
  renderTableStructure();
  renderList();
}

async function api(path, options = {}) {
  const target = new URL(path, "https://arcade.invalid");
  let body = {};
  if (options.body) {
    try {
      body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
    } catch (_error) {
      throw new Error("The Cyrune Arcade request body is invalid.");
    }
  }
  const collectionRoutes = new Set('games game game-versions poks recent scrape-targets scrape-preview apply-scrape metadata-care update-metadata favourite favourites-bulk game-version-default launch open-pok open-explorer rename metadata-preview metadata-undo delete delete-bulk import-incoming import-incoming-bulk restore-trash purge-trash move-language rebuild'.split(' ').map(name => '/api/' + name));
  const collectionId = options.collectionId || state.activeCollection?.id;
  if (collectionId && collectionRoutes.has(target.pathname)) {
    if (String(options.method || 'GET').toUpperCase() === 'GET') target.searchParams.set('collection_id', collectionId);
    else if (!('collection_id' in body)) body.collection_id = collectionId;
  }
  if (target.pathname === '/api/games') {
    if (state.summaryRevision && collectionId === state.summaryCollection) target.searchParams.set('since', state.summaryRevision);
  }
  const summaryBase = target.searchParams.has('since') ? [...state.games] : [];
  const response = await requestArcadeRpc({
    method: String(options.method || "GET").toUpperCase(),
    path: target.pathname,
    query: Object.fromEntries(target.searchParams.entries()),
    body: body && typeof body === "object" ? body : {},
  });
  let payload = response.result || {};
  if (target.pathname === '/api/scrape-preview' && payload.job_id) {
    const deadline = Date.now() + 180000;
    while (true) {
      if (Date.now() > deadline) throw new Error('Scraper request timed out. Search again.');
      await new Promise(resolve => setTimeout(resolve, 250));
      const job = await api('/api/scrape-job?id=' + encodeURIComponent(payload.job_id) + '&collection_id=' + encodeURIComponent(collectionId || body.collection_id || ''));
      if (job.status === 'done') {payload = job.result || {}; break;}
    }
  }
  if (payload.ok === false && payload.cancelled !== true) {
    const error = new Error(payload.error || "Request failed");
    error.payload = payload;
    throw error;
  }
  if (target.pathname === '/api/games' && payload.revision) {
    if (payload.delta && payload.collection_id !== state.summaryCollection) throw Error('The library changed. Reload Arcade.');
    const rows = new Map(payload.delta ? summaryBase.map(game => [game.id, game]) : []);
    for (const id of payload.removed || []) rows.delete(id);
    for (const game of payload.games || []) rows.set(game.id, {...payload.defaults, ...game});
    for (const [id, revision] of Object.entries(payload.entry_revisions || {})) {
      if (rows.has(id)) rows.set(id, {...rows.get(id), entry_revision:revision});
    }
    payload.games = [...rows.values()];
  }
  return payload;
}

function acceptSummaryPayload(payload) {
  if (payload.unchanged && payload.collection_id === state.summaryCollection && payload.revision === state.summaryRevision) return;
  if (payload.revision) {state.summaryRevision = payload.revision; state.summaryCollection = payload.collection_id;}
  replaceGameSummaries(payload.games);
}

async function init() {
  renderLayout();
  renderTableStructure();
  bindEvents();

  const recovery = await api("/api/catalogue-recovery/status", { method: "POST", body: "{}" });
  if (recovery.status === "recovery-required") {
    throw new Error("An interrupted collection change needs review. Open Catalogue Recovery to continue.");
  }

  // Prioritize the library. Collection counts can involve filesystem walks and
  // should not hold the first useful render behind secondary startup data.
  if (webHubHandoff.collectionId) {
    const collections = await api("/api/collections");
    if (collections.active?.id !== webHubHandoff.collectionId) {
      const selected = collections.collections.find(item => item.id === webHubHandoff.collectionId && item.available !== false);
      if (!selected) throw new Error("This game’s collection is unavailable.");
      const job = await api("/api/select-collection", { method: "POST", body: JSON.stringify({ collection_id: selected.id }) });
      await waitForJob(job.job_id);
    }
  }
  const context = await api("/api/collection-context");
  state.activeCollection = {id:context.collection_id};
  const gamesPayload = await api("/api/games?view=all");
  acceptSummaryPayload(gamesPayload);
  applyFilters();

  const [collectionsPayload, emulatorsPayload, profilesPayload, recentPayload] = await Promise.all([
    api("/api/collections"),
    api("/api/emulators"),
    api("/api/emulator-profiles"),
    api("/api/recent"),
  ]);
  state.collections = collectionsPayload.collections;
  state.activeCollection = collectionsPayload.active;
  state.emulators = emulatorsPayload.emulators;
  state.emulatorProfiles = profilesPayload.profiles || [];
  state.recentIds = new Set(recentPayload.recent.map((item) => item.game_id));
  renderCollections();
  renderEmulators();
  applyFilters();
  if (webHubHandoff.gameId && state.games.some((game) => game.id === webHubHandoff.gameId)) {
    await selectGame(webHubHandoff.gameId);
  }
}

function bindEvents() {
  els.version.addEventListener('click', () => showArcadeSettings());
  document.querySelector('#platform-grid').addEventListener('click', async event => {
    const button = event.target.closest('[data-platform]');
    if (!button) return;
    if (![...els.platformSelect.options].some(option => option.value === button.dataset.platform)) {
      showArcadeSettings(button.dataset.platform); return;
    }
    els.platformSelect.value = button.dataset.platform;
    els.platformSelect.dispatchEvent(new Event('change'));
  });
  els.search.addEventListener("input", scheduleFilterApply);
  document.addEventListener("click", hideContextMenu);
  window.addEventListener("blur", hideContextMenu);
  bindFilterCheckbox(els.filterPoks, 'neutral', 'POKs', applyFilters);
  [els.filterView, els.filterCleanup].filter(Boolean).forEach((select) => {
    select.addEventListener("change", applyFilters);
  });
  els.emulator.addEventListener("change", () => {
    if (state.selected) renderDetails();
  });

  els.collectionSelect.addEventListener("change", async () => {
    if (els.collectionSelect.value === ADD_COLLECTION_VALUE) {
      renderCollections(); showAddCollectionModal(); return;
    }
    await selectCollection(els.collectionSelect.value);
  });
  els.platformSelect.addEventListener('change', async () => {
    const platform = els.platformSelect.value;
    const choices = state.collections.filter(collection => collectionPlatform(collection) === platform && collection.available !== false);
    const selected = choices.find(collection => collection.id === state.ui.platformCollections[platform]) || choices[0];
    if (selected) await selectCollection(selected.id);
    else { renderCollections(); showArcadeSettings(platform); }
  });

  els.collectionSelect.addEventListener("pointerdown", refreshCollectionsForDropdown);
  els.collectionSelect.addEventListener("focus", refreshCollectionsForDropdown);

  els.clearFilters.addEventListener("click", () => {
    els.search.value = "";
    if (els.filterCleanup) els.filterCleanup.value = "";
    [els.filterPoks].forEach((input) => {
      setFilterCheckbox(input, 'neutral', 'POKs');
    });
    state.multiFilters = {};
    state.excludedFilters = {};
    state.openFilterKey = "";
    state.selectedIds.clear();
    [els.filterSystem, els.filterLanguage, els.filterCountry, els.filterYear, els.filterPublisher, els.filterTag].forEach((combo) => {
      renderFilterCombo(combo);
    });
    els.filterView.value = "";
    els.filterView.value = "all";
    applyFilters();
  });

  els.bulkEdit.addEventListener("click", handleBulkAction);
  els.importSelectTools?.addEventListener("click", handleImportSelectTools);
  els.columnOptions.addEventListener("click", showColumnOptionsModal);
  els.toggleSidebar.addEventListener("click", () => toggleSidebar("sidebar"));
  els.toggleDetails.addEventListener("click", () => toggleSidebar("details"));
  els.list.addEventListener("click", handleListClick);
  els.list.addEventListener("dblclick", handleListDoubleClick);
  els.list.addEventListener("contextmenu", handleListContextMenu);
  els.list.addEventListener("change", handleListChange);
  els.library.addEventListener("scroll", scheduleVirtualRender, { passive: true });
  window.addEventListener("resize", scheduleVirtualRender);
  updateSortHeaders();
}

async function withBusy(title, message, work) {
  showBusy(title, message);
  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return await work();
  } finally {
    hideBusy();
  }
}

function showBusy(title, message) {
  els.busyTitle.textContent = title;
  els.busyMessage.textContent = message;
  setBusyProgress(null);
  els.busyOverlay.classList.remove("hidden");
}

function hideBusy() {
  els.busyOverlay.classList.add("hidden");
}

function setBusyProgress(percent) {
  if (typeof percent === "number") {
    els.busyProgress.classList.add("determinate");
    els.busyProgress.style.setProperty("--busy-progress", `${Math.max(0, Math.min(100, percent))}%`);
  } else {
    els.busyProgress.classList.remove("determinate");
    els.busyProgress.style.removeProperty("--busy-progress");
  }
}

async function waitForJob(jobId) {
  if (!jobId) return;
  while (true) {
    const payload = await api(`/api/job?id=${encodeURIComponent(jobId)}`);
    const job = payload.job || {};
    els.busyTitle.textContent = job.title || "Working";
    els.busyMessage.textContent = job.message || "Working...";
    if (job.total > 0 && job.phase === "indexing") {
      setBusyProgress((Number(job.current || 0) / Number(job.total)) * 100);
    } else {
      setBusyProgress(null);
    }
    if (job.status === "done") {
      setBusyProgress(100);
      return;
    }
    if (job.status === "error" || job.status === "missing") {
      throw new Error(job.error || "Indexing failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
}

async function reloadGames() {
  const selectedId = state.selected?.id || "";
  const generation = state.collectionViewGeneration || 0;
  const requestGeneration = state.reloadGeneration = (state.reloadGeneration || 0) + 1;
  const payload = await api("/api/games?view=all");
  if (generation !== (state.collectionViewGeneration || 0) || requestGeneration !== state.reloadGeneration) return;
  acceptSummaryPayload(payload);
  const validIds = new Set(state.games.map((game) => game.id));
  state.selectedIds = new Set([...state.selectedIds].filter((id) => validIds.has(id)));
  state.selected = selectedId ? state.gamesById.get(selectedId) || null : null;
  if (state.selected) {
    state.selected = await loadGameDetails(selectedId) || state.selected;
  }
  applyFilters();
  await renderDetails();
}

function replaceGameSummaries(games) {
  state.metadataGeneration = (state.metadataGeneration || 0) + 1;
  state.games = Array.isArray(games) ? games : [];
  state.gamesById = new Map(state.games.map((game) => [game.id, game]));
  state.gameDetails.clear();
  state.versionGroups = new Map();
  for (const game of state.games) {
    const key = game.version_group || game.id;
    if (!state.versionGroups.has(key)) state.versionGroups.set(key, []);
    state.versionGroups.get(key).push(game);
  }
}

function groupedGameRows(games, filters = null) {
  const seen = new Set();
  return games.flatMap(game => {
    const key = game.version_group || game.id;
    if (seen.has(key)) return [];
    seen.add(key);
    const family = state.versionGroups?.get(key) || [game];
    const members = family.filter(row => !filters || !matchesExcludedFilters(row, '', filters));
    if (!members.length) return [];
    const launch = family.find(row => row.id === game.default_version) || family[0];
    const union = field => [...new Set(members.flatMap(row => row[field] || []).filter(Boolean))];
    // Keep the title and details attached to the same edition, even when filters hide it.
    return [{ ...launch,
      version_count:members.length, languages: union('languages'), countries: union('countries'),
      version_systems: union('system'), version_editions: union('version'),
      version_platforms: union('platform_options'),
      favourite: members.some(row => row.favourite) }];
  });
}

const ARCADE_LANGUAGE_FLAGS = Object.freeze({ ar: 'sa', be: 'by', bg: 'bg', br: 'fr', ca: 'es-ct', cs: 'cz', da: 'dk',
  de: 'de', el: 'gr', en: 'gb', es: 'es', et: 'ee', eu: 'es-pv', fa: 'ir', fi: 'fi', fr: 'fr', he: 'il', hr: 'hr',
  hu: 'hu', it: 'it', ja: 'jp', ko: 'kr', lt: 'lt', lv: 'lv', nb: 'no', nl: 'nl', no: 'no', pl: 'pl', pt: 'pt',
  ro: 'ro', ru: 'ru', sk: 'sk', sr: 'rs', sv: 'se', tr: 'tr', uk: 'ua', zh: 'cn',
  uz: 'uz', 'en-us': 'us', 'en-gb': 'gb', 'fr-ca': 'ca', 'pt-br': 'br', 'zh-tw': 'tw', 'zh-cn': 'cn' });
const ARCADE_FLAG_ASSETS = new Set(Object.values(ARCADE_LANGUAGE_FLAGS));

function renderVersionFlags(values, language) {
  return `<span class="game-version-flags">${[...new Set(values.map(value => String(value).toLowerCase()))].sort().map(code => {
    const flag = language ? ARCADE_LANGUAGE_FLAGS[code] : code === 'uk' ? 'gb' : code;
    const label = (language ? LANGUAGE_NAMES : COUNTRY_NAMES)[code.toUpperCase()] || code.toUpperCase();
    return ARCADE_FLAG_ASSETS.has(flag)
      ? `<img src="assets/language-flags/${flag}.svg" alt="${escapeHtml(label)}" title="${escapeHtml(label)}" width="20" height="15">`
      : `<span role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">◎</span>`;
  }).join('')}</span>`;
}

const ARCADE_PLATFORM_ICONS = Object.freeze({
  dos: ['dos.png', 'DOS'], windows: ['windows.png', 'Windows'], amiga: ['amiga.png', 'Amiga'],
  'fm-towns': ['fm-towns.png', 'FM Towns'], 'atari-st': ['atari-st.png', 'Atari ST'],
  macintosh: ['macintosh.png', 'Macintosh'], 'zx-spectrum': ['zx-spectrum.png', 'ZX Spectrum'],
  steam: ['steam.svg', 'Steam edition'], unknown: ['unknown.svg', 'Unspecified platform']
});

function renderPlatformIcons(game) {
  const values = game.version_platforms?.length ? game.version_platforms
    : game.platform_options?.length ? game.platform_options
    : game.version_systems?.length ? game.version_systems : [game.system || game.memory || ''];
  if (game.type === 'Atari ST') {
    const order = ['ST', 'STe', 'TT', 'Falcon'];
    const systems = [...new Set(values)].filter(value => order.includes(value)).sort((a,b) => order.indexOf(a)-order.indexOf(b));
    return `<span class="game-platform-icons">${systems.map(system => `<span class="game-system-badge" title="Atari ${system}">${system}</span>`).join('')}</span>`;
  }
  const hardware = [...new Set(values.flatMap(value => /^(?:16|48|128)K(?:-(?:16|48|128)K)?$/i.test(String(value))
    ? String(value).toUpperCase().split('-') : []))].sort((a, b) => parseInt(a) - parseInt(b));
  if (hardware.length) return `<span class="game-platform-icons">${hardware.map(system =>
    `<span class="game-system-badge" title="ZX Spectrum ${system}">${system}</span>`).join('')}</span>`;
  const icons = new Map();
  for (const value of values) {
    const label = String(value).slice(0, 80);
    const normalized = label.trim().toLowerCase().replaceAll(' ', '-');
    let id = Object.hasOwn(ARCADE_PLATFORM_ICONS, normalized) ? normalized : 'unknown';
    if (normalized === 'ms-dos') id = 'dos';
    const [file, name] = ARCADE_PLATFORM_ICONS[id];
    const title = id === 'zx-spectrum' && /k/i.test(label) ? `${name} (${label})` : name;
    if (icons.has(id)) icons.get(id).labels.add(title);
    else icons.set(id, { file, name, labels: new Set([title]) });
  }
  return `<span class="game-platform-icons">${[...icons].map(([id, icon]) =>
    `<img class="game-platform-icon${id === 'steam' ? ' game-platform-steam' : ''}" src="assets/platforms/${icon.file}" alt="${escapeHtml(icon.name)}" title="${escapeHtml([...icon.labels].join(' / '))}" width="26" height="26">`
  ).join('')}</span>`;
}

async function loadGameDialogVersions(game, collectionId) {
  const result = await api(`/api/game-versions?game_id=${encodeURIComponent(game.id)}`);
  if (state.activeCollection?.id !== collectionId) throw new Error('The collection changed. Reopen the game dialog.');
  return { ...result, versions: result.versions.map(version => {
    const summary = state.games.find(row => row.catalogue_id === version.catalogueId);
    return { ...version, gameId: version.gameId || summary?.id || '',
      collectionId: version.collectionId || collectionId,
      imageFiles: version.imageFiles?.length ? version.imageFiles : summary?.type !== 'ScummVM' && summary?.file_name ? [summary.file_name] : [] };
  }) };
}

async function showGameProperties(game) {
  const collectionId = state.activeCollection.id;
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<section class="modal game-properties-modal" role="dialog" aria-modal="true" aria-labelledby="game-properties-title">
    <header><h2 id="game-properties-title">Properties</h2><p>${escapeHtml(game.title)}</p></header>
    <p class="meta" data-prop-provenance></p>
    <label class="property-field">Game version<select data-prop-version></select></label>
    <div data-prop-images class="property-image-files" aria-label="Disk image filenames"></div>
    <label class="property-default"><input type="checkbox" data-prop-default> Use this version as the default in Arcade and Portal</label>
    <fieldset class="property-section"><legend>Game disks</legend><p class="meta">These disk settings apply with either emulator.</p><div class="property-grid">
      <label class="property-field">Drive B<select data-prop-drive></select></label>
      <label class="property-field">Save disk<select data-prop-disk></select></label>
    </div></fieldset>
    <fieldset class="property-section"><legend>Default launch</legend><div class="property-grid">
      <label class="property-field">Emulator<select data-prop-emulator></select></label>
      <label class="property-field">Emulator profile<select data-prop-profile></select></label>
    </div></fieldset>
    <p class="meta">Create or import a disk to add it immediately to this game’s Safe Disks folder. Save applies your launch settings.</p>
    <details data-prop-history hidden><summary>Save disk backups</summary>
      <div class="property-backups"><label class="property-field">Backup<select data-prop-backup></select></label>
        <button class="secondary" data-prop-restore>Restore selected backup</button></div>
    </details>
    <p data-prop-status role="status" aria-live="polite">Loading properties…</p>
    <footer class="property-footer"><button data-prop-recover class="secondary" hidden>Recover interrupted save</button><button class="secondary" data-prop-cancel>Cancel</button><button data-prop-save>Save</button></footer>
  </section>`;
  document.body.appendChild(overlay);
  const el = name => overlay.querySelector('[data-prop-' + name + ']');
  void loadGameDetails(game.id).then(details => {const note = details?.scrape_provenance; if (overlay.isConnected && state.activeCollection.id === collectionId) el('provenance').textContent = note?.scraped_at ? `Metadata: ${note.provider || 'Manual'} · ${note.platform || game.system} · ${note.scraped_at.slice(0,10)}` : '';}).catch(() => {});
  let data = null, busy = true, dirty = false, selectedDisk = '';
  const controls = () => [...overlay.querySelectorAll('button,input,select')];
  const refreshEnabled = () => {
    controls().forEach(control => { control.disabled = busy || !data || data.recoveryRequired; });
    el('version').disabled = busy || dirty;
    el('cancel').disabled = busy;
    el('recover').disabled = busy || !data;
    el('save').disabled = busy || !data || data.recoveryRequired;
    el('restore').disabled ||= !el('backup').value;
    overlay.setAttribute('aria-busy', String(busy));
  };
  const dismiss = () => { if (!busy) { overlay.remove(); previousFocus?.focus(); } };
  const profiles = (selected = '') => {
    const emulator = data.emulators.find(row => row.id === el('emulator').value);
    el('profile').innerHTML = '<option value="">Emulator defaults</option>' + (emulator?.profiles || []).map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`).join('');
    if (selected && !(emulator?.profiles || []).some(row => row.id === selected)) {
      el('profile').insertAdjacentHTML('beforeend', `<option value="${escapeHtml(selected)}">Missing saved profile</option>`);
    }
    el('profile').value = selected;
  };
  const backups = () => {
    const disk = data.saveDisks.find(row => row.name === selectedDisk);
    el('backup').innerHTML = '<option value="">Select a backup</option>' + (disk?.backups || []).map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.label)}</option>`).join('');
    el('history').hidden = !disk?.backups?.length;
    if (el('history').hidden) el('history').open = false;
  };
  const disks = (selected = '') => {
    selectedDisk = selected;
    el('disk').innerHTML = '<option value="">Select a save disk</option>' + data.saveDisks.map(row => `<option value="${escapeHtml(row.name)}">${escapeHtml(row.name)}</option>`).join('');
    if (selected && !data.saveDisks.some(row => row.name === selected)) {
      el('disk').insertAdjacentHTML('beforeend', `<option value="${escapeHtml(selected)}">Unavailable: ${escapeHtml(selected)}</option>`);
    }
    el('disk').insertAdjacentHTML('beforeend', '<option disabled role="separator">────────────────────</option><option value="@create">Create empty save disk</option><option value="@import">Import save disk…</option>');
    el('disk').value = selected;
    backups();
  };
  const load = async () => {
    busy = true; data = null; refreshEnabled();
    try {
      data = await api(`/api/game-properties?collectionId=${encodeURIComponent(collectionId)}&gameId=${encodeURIComponent(el('version').value)}`);
      if (!overlay.isConnected) return;
      el('recover').hidden = !data.recoveryRequired;
      const settings = data.settings;
      el('images').replaceChildren(...data.gameDisks.map(row => {
        const item = document.createElement('div'); item.textContent = row.filename || row.name; return item;
      }));
      el('emulator').innerHTML = data.emulators.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`).join('');
      el('emulator').value = settings.emulatorId;
      profiles(settings.profileId);
      el('drive').innerHTML = '<option value="empty">Empty</option>' + data.gameDisks.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name + (row.filename ? ' — ' + row.filename : ''))}</option>`).join('') + '<option value="save">Save disk</option>';
      el('drive').value = settings.driveB;
      disks(settings.saveDisk); el('default').checked = false; dirty = false;
      el('status').textContent = data.recoveryRequired ? 'An earlier save was interrupted. Recover it before making changes.' : '';
    } catch (error) { data = null; el('status').textContent = error.message; }
    finally { busy = false; refreshEnabled(); }
  };
  const runDiskAction = async action => {
    if (!data || busy || data.recoveryRequired) return;
    busy = true; refreshEnabled();
    el('status').textContent = action === 'create' ? 'Creating save disk…' : action === 'import' ? 'Choose a save disk to import…' : 'Restoring backup…';
    try {
      const request = {collectionId, gameId:data.gameId, action};
      if (action === 'import') {
        const picked = await api('/api/game-properties/pick-save', {method:'POST', body:JSON.stringify({collectionId, gameId:data.gameId})});
        if (picked.cancelled) { el('status').textContent = ''; return; }
        request.token = picked.token;
        el('status').textContent = 'Importing save disk…';
      } else if (action === 'restore') {
        request.name = selectedDisk; request.backup = el('backup').value;
      }
      const result = await api('/api/game-properties/save-disk', {method:'POST', body:JSON.stringify(request)});
      // Refresh the disk choices without committing or replacing the user's
      // emulator/profile draft, default checkbox or original settings revision.
      data.saveDisks = result.saveDisks;
      disks(result.selectedDisk);
      if (action !== 'restore') { el('drive').value = 'save'; dirty = true; }
      const verb = action === 'create' ? 'Created' : action === 'import' ? 'Imported' : 'Restored';
      el('status').textContent = `${verb} ${result.selectedDisk}.${action !== 'restore' ? ' Selected for drive B.' : ''}`;
    } catch (error) { el('status').textContent = error.message; }
    finally { busy = false; refreshEnabled(); el('disk').focus(); }
  };
  el('version').addEventListener('change', load);
  overlay.addEventListener('input', event => {
    if ([el('version'),el('disk'),el('backup')].includes(event.target) || busy) return;
    dirty = true; refreshEnabled();
  });
  el('emulator').addEventListener('change', () => profiles());
  el('disk').addEventListener('change', () => {
    const choice = el('disk').value;
    if (choice === '@create' || choice === '@import') {
      el('disk').value = selectedDisk;
      void runDiskAction(choice.slice(1));
      return;
    }
    selectedDisk = choice;
    if (choice) el('drive').value = 'save';
    dirty = true; backups(); refreshEnabled();
  });
  el('backup').addEventListener('change', refreshEnabled);
  el('restore').addEventListener('click', () => void runDiskAction('restore'));
  el('save').addEventListener('click', async () => {
    if (!data || busy) return;
    busy = true; refreshEnabled(); el('status').textContent = 'Saving properties…';
    try {
      await api('/api/game-properties', {method:'POST', body:JSON.stringify({collectionId, gameId:data.gameId, revision:data.revision,
        settings:{emulatorId:el('emulator').value, profileId:el('profile').value, driveB:el('drive').value, saveDisk:selectedDisk},
        diskAction:{kind:'none'}, makeDefault:el('default').checked})});
      if (state.activeCollection?.id === collectionId) await reloadGames();
      busy = false; dismiss();
    } catch (error) { el('status').textContent = error.message; }
    finally { busy = false; refreshEnabled(); }
  });
  el('recover').addEventListener('click', async () => {
    busy = true; refreshEnabled();
    try {
      await api('/api/game-properties/recover', {method:'POST', body:JSON.stringify({collectionId, gameId:data.gameId})});
      await load();
    } catch (error) { el('status').textContent = error.message; }
    finally { busy = false; refreshEnabled(); }
  });
  el('cancel').addEventListener('click', dismiss);
  overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button,input,select,summary')].filter(control => !control.disabled && control.getClientRects().length);
      if (!focusable.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === focusable[0] || !event.shiftKey && document.activeElement === focusable.at(-1)) {
        event.preventDefault(); focusable[event.shiftKey ? focusable.length-1 : 0].focus();
      }
    }
  });
  refreshEnabled();
  try {
    const result = await loadGameDialogVersions(game, collectionId);
    if (!overlay.isConnected) return;
    if (!result.versions.length || result.versions.some(row => !row.gameId || row.collectionId !== collectionId)) {
      throw new Error('Game versions need to refresh. Reload Relay and Arcade, then reopen Properties.');
    }
    el('version').innerHTML = result.versions.map(row => `<option value="${escapeHtml(row.gameId)}">${escapeHtml(row.imageFiles[0] || row.label)}</option>`).join('');
    if (!result.versions.some(row => row.gameId === game.id)) throw new Error('This game version is no longer available. Reopen Properties.');
    el('version').value = game.id;
    await load(); el('version').focus();
  } catch (error) { busy = false; el('status').textContent = error.message; refreshEnabled(); }
}

async function showGameVersions(game) {
  const collectionId = state.activeCollection.id;
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<section class="modal game-versions-modal" role="dialog" aria-modal="true" aria-labelledby="game-versions-title">
    <h2 id="game-versions-title">Launch Version…</h2><p data-version-title></p>
    <p>Double-click launches the default. Launching another version here leaves the default unchanged.</p>
    <div data-version-list class="game-version-list"></div><p data-version-status role="status">Loading versions…</p>
    <div class="modal-actions"><button data-version-close class="secondary">Close</button></div></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-version-title]').textContent = game.title;
  const status = overlay.querySelector('[data-version-status]');
  const list = overlay.querySelector('[data-version-list]');
  const close = overlay.querySelector('[data-version-close]');
  let busy = false;
  const dismiss = () => { if (!busy) { overlay.remove(); previousFocus?.focus(); } };
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const buttons = [...overlay.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === buttons[0] || !event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0].focus();
      }
    }
  });
  close.focus();
  const load = async () => {
    const result = await loadGameDialogVersions(game, collectionId);
    if (!overlay.isConnected) return;
    list.replaceChildren();
    for (const version of result.versions) {
      const row = document.createElement('div'); row.className = 'game-version-row';
      const label = document.createElement('span'); label.className = 'game-version-label';
      for (const filename of version.imageFiles || []) {
        const file = document.createElement('span'); file.className = 'game-version-filename'; file.textContent = filename;
        label.appendChild(file);
      }
      const description = document.createElement('span'); description.className = 'game-version-description'; description.textContent = version.label;
      label.appendChild(description);
      const marker = document.createElement('strong'); marker.textContent = version.isDefault ? 'Default' : '';
      const launch = document.createElement('button'); launch.textContent = 'Launch';
      const makeDefault = document.createElement('button'); makeDefault.className = 'secondary';
      makeDefault.textContent = 'Use as default';
      const run = async action => {
        busy = true; overlay.querySelectorAll('button').forEach(button => { button.disabled = true; }); status.textContent = '';
        try {
          if (action === 'default') {
            await api('/api/game-version-default', { method: 'POST', body: JSON.stringify({ game_id: game.id,
              catalogueId: version.catalogueId, entryRevision: version.entryRevision }) });
            await reloadGames(); await load(); status.textContent = 'Default saved for Arcade and Portal.';
          } else {
            await reloadGames();
            const target = state.games.find(row => row.catalogue_id === version.catalogueId && row.entry_revision === version.entryRevision);
            if (!target) throw new Error('The library changed. Close this window and try again.');
            await selectGame(target.id);
            const result = await launchGame('', '', true);
            await refreshRecentAfterLaunch(); await renderDetails(launchMessage(result));
            busy = false; dismiss();
          }
        } catch (error) { status.textContent = error.message; }
        finally { busy = false; close.disabled = false;
          list.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
      };
      launch.addEventListener('click', () => void run('launch'));
      makeDefault.addEventListener('click', () => void run('default'));
      row.append(label, marker, launch, makeDefault); list.appendChild(row);
    }
    status.textContent = result.versions.some(version => version.isDefault) ? '' : 'The saved default is missing. Choose an available version as default.';
  };
  try { await load(); } catch (error) { status.textContent = error.message; }
}

async function reloadCollections() {
  const generation = state.collectionViewGeneration || 0;
  const payload = await api("/api/collections");
  if (generation !== (state.collectionViewGeneration || 0)) return;
  state.collections = payload.collections;
  state.activeCollection = payload.active;
  renderCollections();
  renderEmulators();
}

async function refreshCollectionsForDropdown() {
  if (state.collectionSwitchPending) return;
  try {
    await reloadCollections();
  } catch (_error) {
    // Keep the existing dropdown usable if a refresh fails.
  }
}

function renderMetadataFilters(filters = activeFiltersSnapshot()) {
  renderFilterCombo(els.filterSystem, buildSimpleOptions("system", filteredForCounts("system", filters)), "System", "All Systems");
  renderFilterCombo(els.filterLanguage, buildLanguageOptions(filteredForCounts("language", filters)), "Language", "All Languages");
  renderFilterCombo(els.filterCountry, buildCountryOptions(filteredForCounts("country", filters)), "Country", "All Countries");
  renderFilterCombo(els.filterYear, buildYearOptions(filteredForCounts("year", filters)), "Year", "All Years");
  renderFilterCombo(els.filterPublisher, buildSimpleOptions("publisher", filteredForCounts("publisher", filters)), "Publisher", "All Publishers");
  renderFilterCombo(els.filterTag, buildTagOptions(filteredForCounts("tag", filters)), "Tag", "All Tags");
}

function renderFilterCombo(combo, options = null, label = "", allLabel = "") {
  const key = combo.id.replace("filter-", "");
  if (options) {
    combo.dataset.label = label;
    combo.dataset.allLabel = allLabel;
    combo._options = options;
  }
  const selected = new Set(selectedFilterValues(key));
  const excluded = new Set(state.excludedFilters[key] || []);
  // Keep active choices accessible even when another filter reduces their count to zero.
  const available = [...(combo._options || [])];
  for (const value of [...selected, ...excluded]) {
    if (!available.some(option => option.value === value)) available.push({value, label: LANGUAGE_NAMES[value] || COUNTRY_NAMES[value] || value, count:0});
  }
  const optionLabel = value => available.find(option => option.value === value)?.label || value;
  const buttonLabel = [...selected].map(optionLabel).concat([...excluded].map(value => `Exclude ${optionLabel(value)}`)).join(', ')
    || combo.dataset.allLabel || allLabel;
  const openClass = state.openFilterKey === key ? " open" : "";
  combo.innerHTML = `
    <button type="button" class="filter-combo-button">${escapeHtml(buttonLabel)}</button>
    <div class="filter-combo-panel">
      <small class="filter-help">Click: Any / Include / Exclude</small>
      ${available
        .map((option) => {
          const checked = selected.has(option.value) ? " checked" : "";
          const count = ` (${option.count || 0})`;
          return `
            <label>
              <input type="checkbox" value="${escapeHtml(option.value)}"${checked}>
              ${escapeHtml(option.label)}${escapeHtml(count)}
            </label>
          `;
        })
        .join("")}
    </div>
  `;
  combo.classList.toggle("open", Boolean(openClass));
  combo.querySelector(".filter-combo-button").addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelectorAll(".filter-combo.open").forEach((other) => {
      if (other !== combo) other.classList.remove("open");
    });
    const isOpen = combo.classList.toggle("open");
    state.openFilterKey = isOpen ? key : "";
  });
  combo.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    bindFilterCheckbox(checkbox, excluded.has(checkbox.value) ? 'exclude' : selected.has(checkbox.value) ? 'include' : 'neutral', optionLabel(checkbox.value), () => {
      const value = checkbox.value;
      state.multiFilters[key] = [...selected].filter(item => item !== value);
      state.excludedFilters[key] = [...excluded].filter(item => item !== value);
      if (checkbox.dataset.filterState === 'include') state.multiFilters[key].push(value);
      if (checkbox.dataset.filterState === 'exclude') state.excludedFilters[key].push(value);
      state.openFilterKey = key;
      applyFilters();
      [...combo.querySelectorAll('input')].find(input => input.value === value)?.focus({preventScroll:true});
    });
  });
}

function setFilterCheckbox(input, mode, label) {
  input.dataset.filterState = mode;
  input.classList.add('filter-tristate');
  input.checked = mode === 'include';
  input.indeterminate = mode === 'exclude';
  input.setAttribute('aria-label', `${label}: ${mode === 'neutral' ? 'unrestricted' : mode}. Click or press Space to cycle any, include, exclude.`);
  input.title = `${label}: ${mode === 'neutral' ? 'unrestricted' : mode}. Click to cycle any, include, exclude.`;
}

function bindFilterCheckbox(input, mode, label, changed) {
  setFilterCheckbox(input, mode, label);
  input.addEventListener('change', () => {
    const next = {neutral:'include', include:'exclude', exclude:'neutral'}[input.dataset.filterState];
    setFilterCheckbox(input, next, label);
    changed();
  });
}

function buildLanguageOptions(games = state.games) {
  const counts = new Map();
  games.forEach((game) => {
    const codes = game.languages?.length ? game.languages : languageCodesFromLabel(game.language);
    codes.forEach((code) => {
      counts.set(code, (counts.get(code) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: LANGUAGE_NAMES[value] || value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildCountryOptions(games = state.games) {
  const counts = new Map();
  games.forEach((game) => {
    (game.countries || []).forEach((code) => {
      counts.set(code, (counts.get(code) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: COUNTRY_NAMES[value] || value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildSimpleOptions(key, games = state.games) {
  const counts = countBy((game) => game[key] || "", games);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => {
      if (key === "system") return systemSortValue(a.label) - systemSortValue(b.label);
      if (key === "year") return String(b.label).localeCompare(String(a.label));
      return b.count - a.count || String(a.label).localeCompare(String(b.label));
    });
}

function buildYearOptions(games = state.games) {
  const counts = countBy((game) => gameYear(game), games);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => String(b.label).localeCompare(String(a.label)));
}

function buildTagOptions(games = state.games) {
  const counts = new Map();
  games.forEach((game) => {
    gameTags(game).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function systemSortValue(label) {
  const index = SYSTEM_ORDER.indexOf(String(label));
  return index === -1 ? SYSTEM_ORDER.length : index;
}

function countBy(getValue, games = state.games) {
  const counts = new Map();
  games.forEach((game) => {
    const value = getValue(game);
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
}

function gameYear(game) {
  const match = String(game.year || "").match(/\d{4}|19XX|20XX/i);
  return match ? match[0].toUpperCase() : "";
}

function fileExtension(fileName) {
  const match = String(fileName || "").match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : "";
}

async function selectCollection(collectionId) {
  if (state.collectionSwitchPending) return;
  const selected = state.collections.find(collection => collection.id === collectionId);
  if (!selected || selected.available === false || selected.id === state.activeCollection?.id) { renderCollections(); return; }
  state.collectionSwitchPending = true;
  state.collectionViewGeneration = (state.collectionViewGeneration || 0) + 1;
  try {
    rememberPlatformFilters();
    await withBusy(`Switching to ${selected.name || 'collection'}`, 'Starting index...', async () => {
      const payload = await api('/api/select-collection', {method: 'POST', body: JSON.stringify({collection_id: selected.id})});
      await waitForJob(payload.job_id);
      els.busyMessage.textContent = 'Loading game list...';
      setBusyProgress(null);
      state.selected = null; state.selectedIds.clear();
      const [collections, games] = await Promise.all([
        api('/api/collections'), api('/api/games?view=all', {collectionId:selected.id})
      ]);
      acceptSummaryPayload(games);
      state.filtered = [];
      state.collections = collections.collections;
      state.activeCollection = collections.active;
      els.library.scrollTop = 0;
      renderCollections(); renderEmulators(); applyFilters();
      await renderDetails();
    });
  } catch (error) {
    // The native switch may have completed before the list request failed.
    // Resync its identity and clear stale rows before enabling game actions.
    state.selected = null; state.selectedIds.clear();
    replaceGameSummaries([]); state.filtered = [];
    try { await reloadCollections(); } catch (_) { /* Keep the recovery message visible. */ }
    renderList();
    els.details.innerHTML = `<div class="empty-state">${escapeHtml(error.message || 'The collection could not be loaded.')} Reload Arcade to retry.</div>`;
  } finally { state.collectionSwitchPending = false; renderCollections(); }
}

function renderCollections() {
  els.filterPoks.closest('label').hidden = !platformColumnAvailable('poks');
  const platform = collectionPlatform(state.activeCollection);
  restorePlatformFilters(platform);
  restorePlatformColumns(platform);
  if (state.activeCollection?.id) {
    state.ui.platformCollections[platform] = state.activeCollection.id;
    saveUiState();
  }
  els.platformSelect.innerHTML = Object.entries(COLLECTION_PLATFORMS)
    .filter(([key]) => state.collections.some(collection => collectionPlatform(collection) === key))
    .map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
  els.platformSelect.value = platform;
  els.collectionSelect.innerHTML = [
    ...state.collections.filter(collection => collectionPlatform(collection) === platform).map((collection) => {
      const access = collection.writable ? "" : " (read-only)";
      const availability = collection.available ? "" : " (unavailable)";
      const label = `${collection.name}${access}${availability}`;
      const disabled = collection.available ? "" : " disabled";
      return `<option value="${escapeHtml(collection.id)}"${disabled}>${escapeHtml(label)}</option>`;
    }),
    '<option disabled>────────────────────</option>',
    `<option value="${ADD_COLLECTION_VALUE}">Add Collection...</option>`,
  ].join("");
  if (state.activeCollection?.id) {
    els.collectionSelect.value = state.activeCollection.id;
  }
  renderViewOptions();
  renderPlatformNavigation(platform);
}

const ARCADE_NAV_ICONS = Object.freeze(Object.fromEntries(Object.entries(globalThis.ArcadePlatforms.libraries).map(([id, platform]) => [id, platform.icon])));

function renderNavigationIcon(id, size = 40) {
  const source = ARCADE_NAV_ICONS[id];
  if (!source) return '';
  return id === 'atari-st'
    ? `<svg class="platform-native-icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 3h2v6c0 6-3 10-8 12v-3c4-2 6-5 6-9ZM14 3h2v6c0 4 2 7 6 9v3c-5-2-8-6-8-12ZM11 3h2v18h-2Z"/></svg>`
    : `<img src="${source}" alt="" width="${size}" height="${size}">`;
}

function renderPlatformNavigation(platform) {
  const grid = document.querySelector('#platform-grid');
  if (!grid) return;
  const focused = grid.contains(document.activeElement) ? document.activeElement.closest('[data-platform]')?.dataset.platform : null;
  grid.innerHTML = Object.entries(COLLECTION_PLATFORMS).map(([id, name]) =>
    `<button type="button" class="platform-slot" data-platform="${id}" aria-pressed="${id === platform}" title="${name}">
      ${renderNavigationIcon(id)}<span>${name}</span></button>`).join('');
  if (focused) [...grid.querySelectorAll('[data-platform]')].find(button => button.dataset.platform === focused)?.focus({preventScroll:true});
}

function showArcadeSettings(platform = 'general') {
  globalThis.ArcadeSettingsUI.open({platform, platforms:COLLECTION_PLATFORMS, renderIcon:renderNavigationIcon,
    collections:() => state.collections, active:() => state.activeCollection, version:ARCADE_VERSION,
    api, escapeHtml, pickPathInto,
    layout:() => ({sidebar:!state.ui.sidebarCollapsed, details:!state.ui.detailsCollapsed}),
    saveLayout:value => {
      state.ui.sidebarCollapsed = !value.sidebar; state.ui.detailsCollapsed = !value.details;
      saveUiState(); renderLayout(); scheduleVirtualRender();
    },
    saved:async () => { await reloadCollections(); state.selected = null; state.selectedIds.clear(); await reloadGames(); },
    action:async (action, collection) => {
      if (action === 'emulators') return showEmulatorProfileModal(collection);
      if (action === 'providers') return showScraperSettingsModal();
      if (action === 'recovery') return showCatalogueRecoveryModal();
      if (action === 'reconnect') return showCatalogueReattachmentModal();
      if (action === 'add') return showAddCollectionModal();
      await selectCollection(collection.id);
      if (action === 'prepare') return showCataloguePreparationModal();
      if (action === 'rebuild') await withBusy('Rebuilding Index', 'Scanning the selected collection...', async () => {
        const payload = await api('/api/rebuild', {method:'POST', body:'{}'});
        await waitForJob(payload.job_id); await reloadGames();
      });
    }
  });
}

function renderViewOptions() {
  const active = state.collections.find((collection) => collection.id === state.activeCollection?.id);
  const incomingCount = active?.incoming_count || 0;
  const trashCount = active?.trash_count || 0;
  const incomingFilteredCount = state.games.length ? viewFilteredCount("incoming") : incomingCount;
  const trashFilteredCount = state.games.length ? viewFilteredCount("trash") : trashCount;
  const incomingOption = active?.writable && active?.available && incomingCount > 0
    ? `<option value="incoming">Incoming (${viewCountLabel(incomingFilteredCount, incomingCount)})</option>`
    : "";
  const trashOption = active?.writable && active?.available && trashCount > 0
    ? `<option value="trash">Bin (${viewCountLabel(trashFilteredCount, trashCount)})</option>`
    : "";
  const current = els.filterView.value || "all";
  els.filterView.innerHTML = `
    <option value="all">All Games</option>
    <option value="favourites">Favourites</option>
    <option value="recent">Recent</option>
    <option value="new">Newly indexed (14 days)</option>
    ${incomingOption}
    ${trashOption}
  `;
  els.filterView.value = [...els.filterView.options].some((option) => option.value === current) ? current : "all";
  renderViewBeacon(els.incomingIndicator, incomingCount, "IN", "Inbox", "in incoming");
  renderViewBeacon(els.trashIndicator, trashCount, "BIN", "Bin", "in bin");
}

function viewFilteredCount(view) {
  return state.games.filter((game) => game.view === view && matchesActiveFilters(game, "view")).length;
}

function viewCountLabel(filtered, total) {
  return filtered === total
    ? total.toLocaleString()
    : `${filtered.toLocaleString()}/${total.toLocaleString()}`;
}

function renderViewBeacon(element, count, badge, label, titleSuffix) {
  if (!element) return;
  const visible = count > 0;
  element.hidden = !visible;
  element.textContent = visible ? badge : "";
  element.title = visible ? `${count.toLocaleString()} file${count === 1 ? "" : "s"} ${titleSuffix}` : "";
  element.setAttribute("aria-label", visible ? `${label}: ${count.toLocaleString()} file${count === 1 ? "" : "s"}` : label);
}

function renderEmulators() {
  const previous = state.emulatorCollection === state.activeCollection?.id ? els.emulator.value : '';
  const emulators = platformEmulators();
  els.emulator.innerHTML = emulators
    .map((emu) => {
      const label = emu.available ? emu.name : `${emu.name} (missing)`;
      return `<option value="${escapeHtml(emu.id)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  const collectionDefault = state.activeCollection?.default_emulator || "";
  els.emulator.value = [collectionDefault, previous].find(id => emulators.some(emu => emu.id === id))
    || emulators.find(emu => emu.available)?.id || emulators[0]?.id || '';
  state.emulatorCollection = state.activeCollection?.id;
  if (globalThis.ArcadeEmulatorShortcuts) {
    state.emulatorShortcuts ||= globalThis.ArcadeEmulatorShortcuts.create({
      container: document.querySelector('#emulator-shortcuts'), status: document.querySelector('#emulator-shortcuts-status'),
      api, collectionId: () => state.activeCollection?.id
    });
    void state.emulatorShortcuts.refresh();
  }
}

function showEmulatorProfileModal(collection = state.activeCollection) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const spectrumEmulators = platformEmulators(collection).map(cloneEmulator);
  const editableEmulators = Object.fromEntries(spectrumEmulators.map((emu) => [emu.id, cloneEmulator(emu)]));
  let selectedEmulatorId = spectrumEmulators.find(emu => emu.id === els.emulator.value)?.id || spectrumEmulators[0]?.id || '';
  overlay.innerHTML = `
    <div class="modal emulator-modal">
      <div class="modal-scroll">
        <h2>Emulators &amp; Profiles</h2>
        <div class="platform-tabs" role="tablist">
          <button class="platform-tab active" type="button" role="tab" aria-selected="true">Configured Emulators</button>
        </div>
        <section class="platform-panel">
          <div class="emulator-select-row">
            <label>
              <span>Emulator</span>
              <select id="spectrum-emulator-select">
                ${spectrumEmulators.map((emu) => `<option value="${escapeHtml(emu.id)}">${escapeHtml(emu.name || emu.id)}</option>`).join("")}
              </select>
            </label>
            <button class="secondary" data-action="add-emulator" type="button">Add Emulator</button>
          </div>
          <label>
            <span>Default for ${escapeHtml(collection?.name || "active collection")}</span>
            <select id="collection-default-emulator">
              <option value="">No default</option>
              ${spectrumEmulators.map((emu) => `<option value="${escapeHtml(emu.id)}"${collection?.default_emulator === emu.id ? " selected" : ""}>${escapeHtml(emu.name || emu.id)}</option>`).join("")}
            </select>
          </label>
          <div id="selected-emulator-settings"></div>
          <section class="emulator-card" ${collectionPlatform(collection) !== 'zx-spectrum' ? 'hidden' : ''}>
            <h3>Managed Profiles</h3>
            <p>Imported profiles are copied into the launcher and selected by launch rules.</p>
            <div id="managed-profile-list" class="managed-profile-list"></div>
            <div class="profile-import-grid">
              <label><span>Name</span><input id="profile-name" type="text" placeholder="48K, Plus3, TOS 1.04"></label>
              <label class="wide"><span>Source Profile File</span><div class="path-picker-row"><input id="profile-source" type="text" placeholder="C:\\path\\to\\profile.ini"><button class="secondary" data-action="pick-path" data-target="#profile-source" data-kind="file" type="button">Browse</button></div></label>
              <label class="wide"><span>System Rule</span><div class="profile-rule-checks">
                ${["16K", "16K-48K", "48K", "48K-128K", "128K"].map((system) => `<label><input type="checkbox" value="${system}" data-profile-system> ${system}</label>`).join("")}
              </div></label>
              <button class="secondary wide" data-action="import-profile" type="button">Import Managed Profile</button>
            </div>
          </section>
        </section>
        <div class="message error" id="emulator-error"></div>
      </div>
      <div class="modal-actions sticky-actions">
        <button data-action="save">Save Changes</button>
        <button class="secondary" data-action="cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const errorBox = overlay.querySelector("#emulator-error");
  const selectedSettings = overlay.querySelector("#selected-emulator-settings");
  const emulatorSelect = overlay.querySelector("#spectrum-emulator-select");
  const renderSelectedEmulator = () => {
    const emulator = editableEmulators[selectedEmulatorId] || { id: selectedEmulatorId };
    selectedSettings.innerHTML = selectedEmulatorId ? emulatorProfileCard(selectedEmulatorId, emulator.name || emulatorDisplayName(selectedEmulatorId), emulator) : '<p>No emulator configured for this platform. Add one to continue.</p>';
    renderManagedProfiles(overlay, selectedEmulatorId);
  };
  const syncSelectedEmulator = () => {
    const form = readEmulatorProfileForm(overlay, selectedEmulatorId);
    if (form) {
      editableEmulators[selectedEmulatorId] = { ...(editableEmulators[selectedEmulatorId] || {}), ...form };
    }
  };
  renderSelectedEmulator();
  emulatorSelect.value = selectedEmulatorId;
  emulatorSelect.addEventListener("change", () => {
    try {
      syncSelectedEmulator();
      errorBox.textContent = "";
    } catch (error) {
      errorBox.textContent = error.message;
      emulatorSelect.value = selectedEmulatorId;
      return;
    }
    selectedEmulatorId = emulatorSelect.value;
    renderSelectedEmulator();
  });
  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay) {
      overlay.remove();
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "cancel") {
      overlay.remove();
      return;
    }
    if (button.dataset.action === "pick-path") {
      await pickPathInto(overlay, button);
      return;
    }
    if (button.dataset.action === "add-emulator") {
      showAddEmulatorModal((emulator) => {
        editableEmulators[emulator.id] = emulator;
        const option = document.createElement("option");
        option.value = emulator.id;
        option.textContent = emulator.name;
        emulatorSelect.appendChild(option);
        const defaultOption = option.cloneNode(true);
        overlay.querySelector("#collection-default-emulator")?.appendChild(defaultOption);
        selectedEmulatorId = emulator.id;
        emulatorSelect.value = emulator.id;
        renderSelectedEmulator();
      }, collection);
      return;
    }
    if (button.dataset.action === "delete-emulator") {
      try {
        errorBox.textContent = "";
        const payload = await api("/api/emulators/delete", {
          method: "POST",
          body: JSON.stringify({ emulator_id: selectedEmulatorId }),
        });
        state.emulators = payload.emulators || [];
        const collections = payload.collections || {};
        state.collections = collections.collections || state.collections;
        state.activeCollection = collections.active || state.activeCollection;
        overlay.remove();
        renderEmulators();
      } catch (error) {
        errorBox.textContent = error.message;
      }
      return;
    }
    if (button.dataset.action === "import-profile") {
      try {
        errorBox.textContent = "";
        const systems = [...overlay.querySelectorAll("[data-profile-system]:checked")].map((input) => input.value);
        const payload = await api("/api/emulator-profiles/import", {
          method: "POST",
          body: JSON.stringify({
            emulator_id: selectedEmulatorId,
            name: overlay.querySelector("#profile-name").value,
            source_path: overlay.querySelector("#profile-source").value,
            rule: { systems },
          }),
        });
        state.emulatorProfiles = payload.profiles || [];
        overlay.querySelector("#profile-name").value = "";
        overlay.querySelector("#profile-source").value = "";
        overlay.querySelectorAll("[data-profile-system]").forEach((input) => {
          input.checked = false;
        });
        renderManagedProfiles(overlay, selectedEmulatorId);
      } catch (error) {
        errorBox.textContent = error.message;
      }
      return;
    }
    if (button.dataset.action === "edit-profile") {
      const profile = state.emulatorProfiles.find((item) => item.id === button.dataset.profileId);
      if (profile) showManagedProfileEditor(profile, overlay, selectedEmulatorId);
      return;
    }
    if (button.dataset.action === "delete-profile" || button.dataset.action === "update-profile-source") {
      try {
        errorBox.textContent = "";
        const path = button.dataset.action === "delete-profile" ? "/api/emulator-profiles/delete" : "/api/emulator-profiles/update-source";
        const payload = await api(path, {
          method: "POST",
          body: JSON.stringify({ profile_id: button.dataset.profileId }),
        });
        state.emulatorProfiles = payload.profiles || [];
        renderManagedProfiles(overlay, selectedEmulatorId);
      } catch (error) {
        errorBox.textContent = error.message;
      }
      return;
    }
    if (button.dataset.action !== "save") return;
    try {
      errorBox.textContent = "";
      syncSelectedEmulator();
      const emulators = Object.values(editableEmulators).filter(Boolean);
      const payload = await api("/api/emulators", {
        method: "POST",
        body: JSON.stringify({
          emulators,
          collection_id: collection?.id || "",
          default_emulator: overlay.querySelector("#collection-default-emulator")?.value || "",
        }),
      });
      state.emulators = payload.emulators;
      state.collections = payload.collections?.collections || state.collections;
      state.activeCollection = payload.collections?.active || state.activeCollection;
      renderEmulators();
      overlay.remove();
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
}

async function showScraperSettingsModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal emulator-modal">
      <div class="modal-scroll">
        <h2>Metadata Providers</h2>
        <section class="emulator-card">
          <h3>ScreenScraper</h3>
          <p>Used for Spectrum game metadata, screenshots, and loading screens. Credentials are kept in Windows Credential Manager; password fields can be left blank to keep existing values.</p>
          <div id="screenscraper-settings-content" class="profile-import-grid">
            <div class="meta wide">Loading provider settings...</div>
          </div>
        </section>
        <section class="emulator-card">
          <h3>TheGamesDB</h3>
          <p>Key-based lookup for game metadata. Spectrum platform ID defaults to 4913.</p>
          <div id="thegamesdb-settings-content" class="profile-import-grid">
            <div class="meta wide">Loading provider settings...</div>
          </div>
        </section>
        <div class="message error" id="scraper-settings-error"></div>
      </div>
      <div class="modal-actions sticky-actions">
        <button data-action="save">Save Providers</button>
        <button class="secondary" data-action="cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const errorBox = overlay.querySelector("#scraper-settings-error");
  const screenscraperContent = overlay.querySelector("#screenscraper-settings-content");
  const thegamesdbContent = overlay.querySelector("#thegamesdb-settings-content");
  try {
    const payload = await api("/api/scrapers");
    const screenscraper = (payload.providers || []).find((item) => item.id === "screenscraper") || {};
    const thegamesdb = (payload.providers || []).find((item) => item.id === "thegamesdb") || {};
    screenscraperContent.innerHTML = screenscraperSettingsFields(screenscraper);
    thegamesdbContent.innerHTML = thegamesdbSettingsFields(thegamesdb);
    if (!payload.secret_storage?.available) {
      errorBox.textContent = payload.secret_storage?.error || "Credential storage is unavailable.";
    }
  } catch (error) {
    screenscraperContent.innerHTML = "";
    thegamesdbContent.innerHTML = "";
    errorBox.textContent = error.message;
  }
  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay) {
      overlay.remove();
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "cancel") {
      overlay.remove();
      return;
    }
    if (button.dataset.action !== "save") return;
    try {
      errorBox.textContent = "";
      const settings = readScraperSettings(overlay);
      await api("/api/scrapers", {
        method: "POST",
        body: JSON.stringify({ scrapers: settings }),
      });
      overlay.remove();
      await renderDetails("Metadata provider settings saved.");
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
}

function screenscraperSettingsFields(provider) {
  return `
    <label><span>Enabled</span><select data-scraper-provider="screenscraper" data-scraper-field="enabled">
      <option value="true"${provider.enabled ? " selected" : ""}>Enabled</option>
      <option value="false"${provider.enabled ? "" : " selected"}>Disabled</option>
    </select></label>
    <label><span>Spectrum System ID (Atari/ScummVM automatic)</span><input data-scraper-provider="screenscraper" data-scraper-field="system_id" type="text" value="${escapeHtml(provider.system_id === "135" ? "76" : provider.system_id || "76")}" placeholder="76"></label>
    <label><span>Softname</span><input data-scraper-provider="screenscraper" data-scraper-field="softname" type="text" value="${escapeHtml(provider.softname || "DesasteronSpectrumLauncher")}"></label>
    <label><span>Language</span><input data-scraper-provider="screenscraper" data-scraper-field="preferred_language" type="text" value="${escapeHtml(provider.preferred_language || "en")}" placeholder="en"></label>
    <label><span>Region</span><input data-scraper-provider="screenscraper" data-scraper-field="preferred_region" type="text" value="${escapeHtml(provider.preferred_region || "wor")}" placeholder="wor"></label>
    <label class="wide"><span>Base URL</span><input data-scraper-provider="screenscraper" data-scraper-field="base_url" type="text" value="${escapeHtml(provider.base_url || "https://api.screenscraper.fr/api2")}"></label>
    <label><span>Username</span><input data-scraper-provider="screenscraper" data-scraper-field="username" type="text" value="${escapeHtml(provider.username || "")}"></label>
    <label><span>Password${provider.has_password ? " (saved)" : ""}</span><input data-scraper-provider="screenscraper" data-scraper-field="password" type="password" value="" placeholder="${provider.has_password ? "Leave blank to keep saved password" : ""}"></label>
    <label><span>Developer ID</span><input data-scraper-provider="screenscraper" data-scraper-field="developer_id" type="text" value="${escapeHtml(provider.developer_id || "")}"></label>
    <label><span>Developer Password${provider.has_developer_password ? " (saved)" : ""}</span><input data-scraper-provider="screenscraper" data-scraper-field="developer_password" type="password" value="" placeholder="${provider.has_developer_password ? "Leave blank to keep saved password" : ""}"></label>
  `;
}

function thegamesdbSettingsFields(provider) {
  return `
    <label><span>Enabled</span><select data-scraper-provider="thegamesdb" data-scraper-field="enabled">
      <option value="true"${provider.enabled ? " selected" : ""}>Enabled</option>
      <option value="false"${provider.enabled ? "" : " selected"}>Disabled</option>
    </select></label>
    <label><span>Spectrum Platform ID</span><input data-scraper-provider="thegamesdb" data-scraper-field="platform_id" type="text" value="${escapeHtml(provider.platform_id ?? "4913")}" placeholder="4913"></label>
    <div class="wide meta">ScummVM searches use each version's original system automatically. Unspecified systems search across platforms.</div>
    <label class="wide"><span>Base URL</span><input data-scraper-provider="thegamesdb" data-scraper-field="base_url" type="text" value="${escapeHtml(provider.base_url || "https://api.thegamesdb.net/v1")}"></label>
    <label class="wide"><span>API Key${provider.has_api_key ? " (saved)" : ""}</span><input data-scraper-provider="thegamesdb" data-scraper-field="api_key" type="password" value="" placeholder="${provider.has_api_key ? "Leave blank to keep saved key" : ""}"></label>
  `;
}

function readScraperSettings(root) {
  const settings = {};
  root.querySelectorAll("[data-scraper-field]").forEach((input) => {
    const provider = input.dataset.scraperProvider || "screenscraper";
    const key = input.dataset.scraperField;
    if ((key === "password" || key === "developer_password" || key === "api_key") && !input.value) return;
    settings[provider] = settings[provider] || {};
    settings[provider][key] = key === "enabled" ? input.value === "true" : input.value.trim();
  });
  return settings;
}

function supportedSpectrumEmulators() {
  const supportedIds = ["eightyone", "spectaculator"];
  return supportedIds.map((id) => state.emulators.find((emu) => emu.id === id) || { id, name: emulatorDisplayName(id) });
}

function cloneEmulator(emulator) {
  return {
    ...emulator,
    supported_extensions: [...(emulator.supported_extensions || [])],
  };
}

function emulatorDisplayName(id) {
  return {
    eightyone: "EightyOne",
    spectaculator: "Spectaculator",
  }[id] || id;
}

function renderManagedProfiles(root, emulatorId = "") {
  const list = root.querySelector("#managed-profile-list");
  if (!list) return;
  const profiles = emulatorId ? state.emulatorProfiles.filter((profile) => profile.emulator_id === emulatorId) : state.emulatorProfiles;
  if (!profiles.length) {
    list.innerHTML = `<div class="empty-state">No managed profiles imported for ${escapeHtml(emulatorDisplayName(emulatorId) || "this emulator")} yet.</div>`;
    return;
  }
  list.innerHTML = profiles
    .map((profile) => {
      const rule = profile.rule || {};
      const systems = (rule.systems || []).join(", ") || "fallback";
      const warnings = [
        profile.source_newer ? "source newer" : "",
        profile.source_hash_changed ? "source changed" : "",
        !profile.source_exists ? "source missing" : "",
        !profile.managed_exists ? "managed copy missing" : "",
      ].filter(Boolean);
      return `
        <div class="managed-profile">
          <div>
            <strong>${escapeHtml(profile.name)}</strong>
            <div class="meta">${escapeHtml(profile.emulator_id)} · ${escapeHtml(systems)}${warnings.length ? ` · ${escapeHtml(warnings.join(", "))}` : ""}</div>
            <div class="meta">${escapeHtml(profile.managed_path || "")}</div>
          </div>
          <div class="managed-profile-actions">
            <button class="secondary" data-action="edit-profile" data-profile-id="${escapeHtml(profile.id)}">Edit</button>
            <button class="secondary" data-action="update-profile-source" data-profile-id="${escapeHtml(profile.id)}" ${profile.source_exists ? "" : "disabled"}>Update</button>
            <button class="secondary danger-text" data-action="delete-profile" data-profile-id="${escapeHtml(profile.id)}">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function showManagedProfileEditor(profile, parentRoot, selectedEmulatorId) {
  const rule = profile.rule || {};
  const selectedSystems = new Set(rule.systems || []);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal managed-profile-modal">
      <h2>Edit Managed Profile</h2>
      <div class="profile-edit-grid">
        <label><span>Name</span><input id="edit-profile-name" type="text" value="${escapeHtml(profile.name || "")}"></label>
        <label class="wide"><span>System Rule</span><div class="profile-rule-checks">
          ${SYSTEM_ORDER.map((system) => `<label><input type="checkbox" value="${system}" data-edit-profile-system${selectedSystems.has(system) ? " checked" : ""}> ${system}</label>`).join("")}
        </div></label>
        <label class="wide"><span>Tag Rule</span><input id="edit-profile-tags" type="text" value="${escapeHtml((rule.tags || []).join(", "))}" list="profile-tag-suggestions" placeholder="CSSCGC, ULAPlus"></label>
        <datalist id="profile-tag-suggestions">${TAG_SUGGESTIONS.map((tag) => `<option value="${escapeHtml(tag)}"></option>`).join("")}</datalist>
        <div class="wide">
          <span class="field-caption">Source Profile</span>
          <div class="path-box">${escapeHtml(profile.source_path || "")}</div>
        </div>
        <div class="wide">
          <span class="field-caption">Managed Copy</span>
          <div class="path-box">${escapeHtml(profile.managed_path || "")}</div>
        </div>
      </div>
      <div class="modal-actions">
        <button data-action="save-profile">Save Profile</button>
        <button class="secondary" data-action="cancel">Cancel</button>
      </div>
      <div class="message error" id="managed-profile-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#edit-profile-name")?.focus();
  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay) {
      overlay.remove();
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "cancel") {
      overlay.remove();
      return;
    }
    if (button.dataset.action !== "save-profile") return;
    const errorBox = overlay.querySelector("#managed-profile-error");
    try {
      errorBox.textContent = "";
      const systems = [...overlay.querySelectorAll("[data-edit-profile-system]:checked")].map((input) => input.value);
      const payload = await api("/api/emulator-profiles/update", {
        method: "POST",
        body: JSON.stringify({
          profile_id: profile.id,
          name: overlay.querySelector("#edit-profile-name").value,
          priority: profile.priority ?? 100,
          rule: {
            systems,
            tags: splitCsv(overlay.querySelector("#edit-profile-tags").value),
          },
        }),
      });
      state.emulatorProfiles = payload.profiles || [];
      renderManagedProfiles(parentRoot, selectedEmulatorId);
      overlay.remove();
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
}

function emulatorProfileCard(id, title, emulator) {
  const extensions = formatExtensionList(emulator.supported_extensions);
  const adapter = emulator.type || "generic";
  const extra =
    adapter === "eightyone"
      ? `
        <label class="wide"><span>Active Config Target</span>${pathPickerInput("eightyone_config_target", emulator.eightyone_config_target || "", "file")}</label>
      `
      : adapter === "spectaculator"
      ? `
        <label class="wide"><span>SpecStub / POK Helper</span>${pathPickerInput("pok_helper_path", emulator.pok_helper_path || "", "file")}</label>
        <label class="wide"><span>Running-instance Arguments (JSON array)</span><textarea data-field="current_arguments" data-format="arguments">${escapeHtml(formatArgumentList(emulator.current_arguments || ["{file}"]))}</textarea></label>
        <label class="wide"><span>POK Arguments (JSON array)</span><textarea data-field="pok_arguments" data-format="arguments">${escapeHtml(formatArgumentList(emulator.pok_arguments || ["{pok_file}"]))}</textarea></label>
      `
      : "";
  const deleteButton = emulator.built_in
    ? ""
    : '<button class="secondary danger-text" data-action="delete-emulator" type="button">Delete Emulator</button>';
  return `
    <section class="emulator-card" data-emulator-id="${escapeHtml(id)}">
      <div class="emulator-card-title"><h3>${escapeHtml(title)}</h3>${deleteButton}</div>
      <div class="emulator-grid">
        <label><span>Name</span><input data-field="name" type="text" value="${escapeHtml(emulator.name || title)}"></label>
        <label><span>Launch Adapter</span><select data-field="type"${(emulator.built_in || ["scummvm", "steem", "hatari"].includes(adapter)) ? " disabled" : ""}>
          ${platformEmulatorTypes().map((value) => `<option value="${value}"${adapter === value ? " selected" : ""}>${value}</option>`).join("")}
        </select></label>
        <label><span>Supported Extensions</span><input data-field="supported_extensions" type="text" value="${escapeHtml(extensions)}"></label>
        <label class="wide"><span>Executable Path</span>${pathPickerInput("path", emulator.path || "", "file")}</label>
        ${["scummvm", "steem", "hatari"].includes(adapter) ? '<div class="meta wide">Uses the selected game edition and the emulator’s existing settings.</div>' : `
        <label class="wide"><span>Working Directory</span>${pathPickerInput("working_dir", emulator.working_dir || "", "folder")}</label>
        <label class="wide"><span>Launch Arguments (JSON array)</span><textarea data-field="arguments" data-format="arguments">${escapeHtml(formatArgumentList(emulator.arguments || ["{file}"]))}</textarea></label>
        <div class="meta wide">Allowed placeholders: {file}, {file_dir}, {file_name}, {collection_root}, {pok_file}, {system}, {title}. Arguments are passed directly without a shell.</div>`}
        ${extra}
      </div>
    </section>
  `;
}

function formatArgumentList(value) {
  return JSON.stringify(Array.isArray(value) ? value : ["{file}"]);
}

function formatExtensionList(value) {
  if (Array.isArray(value)) return value.join(", ");
  return String(value || "");
}

function pathPickerInput(field, value, kind) {
  const id = `path-${field}-${Math.random().toString(36).slice(2)}`;
  return `
    <div class="path-picker-row">
      <input id="${id}" data-field="${escapeHtml(field)}" type="text" value="${escapeHtml(value)}">
      <button class="secondary" data-action="pick-path" data-target="#${id}" data-kind="${escapeHtml(kind)}" type="button">Browse</button>
    </div>
  `;
}

async function pickPathInto(root, button) {
  const input = root.querySelector(button.dataset.target);
  if (!input) return;
  const payload = await api("/api/pick-path", {
    method: "POST",
    body: JSON.stringify({
      kind: button.dataset.kind || "file",
      initial: input.value,
      title: button.dataset.kind === "folder" ? "Select folder" : "Select file",
    }),
  });
  if (payload.ok && payload.path) {
    input.value = payload.path;
  }
}

function readEmulatorProfileForm(root, id) {
  const card = root.querySelector(`[data-emulator-id="${id}"]`);
  if (!card) return null;
  const result = { id };
  card.querySelectorAll("[data-field]").forEach((input) => {
    if (input.disabled) return;
    if (input.dataset.format === "arguments") {
      let parsed;
      try {
        parsed = JSON.parse(input.value);
      } catch (_error) {
        throw new Error(`${input.closest("label")?.querySelector("span")?.textContent || "Arguments"} must be a JSON array.`);
      }
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
        throw new Error("Command arguments must be a JSON array of strings.");
      }
      result[input.dataset.field] = parsed;
    } else {
      result[input.dataset.field] = input.value.trim();
    }
  });
  return result;
}

function showAddEmulatorModal(onAdd, collection = state.activeCollection) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal managed-profile-modal">
      <h2>Add Emulator</h2>
      <p>Create a native-only emulator definition. You can configure profiles after saving it.</p>
      <div class="profile-edit-grid">
        <label><span>ID</span><input id="add-emulator-id" type="text" placeholder="snes9x"></label>
        <label><span>Name</span><input id="add-emulator-name" type="text" placeholder="Snes9x"></label>
        <label><span>Launch Adapter</span><select id="add-emulator-type">${platformEmulatorTypes(collection).map(type => `<option value="${type}">${type}</option>`).join('')}</select></label>
        <label><span>Extensions</span><input id="add-emulator-extensions" type="text" placeholder=".smc, .sfc"></label>
        <label class="wide"><span>Executable Path</span>${pathPickerInput("add-emulator-path", "", "file")}</label>
        <label class="wide"><span>Working Directory</span>${pathPickerInput("add-emulator-working-dir", "", "folder")}</label>
      </div>
      <div class="modal-actions"><button data-action="add">Add</button><button class="secondary" data-action="cancel">Cancel</button></div>
      <div class="message error" id="add-emulator-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#add-emulator-id")?.focus();
  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay || event.target.closest("button")?.dataset.action === "cancel") {
      overlay.remove();
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "pick-path") {
      await pickPathInto(overlay, button);
      return;
    }
    if (button.dataset.action !== "add") return;
    const id = overlay.querySelector("#add-emulator-id").value.trim().toLowerCase();
    const name = overlay.querySelector("#add-emulator-name").value.trim();
    const errorBox = overlay.querySelector("#add-emulator-error");
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(id)) {
      errorBox.textContent = "ID must start with a letter and use only letters, numbers, _ or -.";
      return;
    }
    if (!name || state.emulators.some((emulator) => emulator.id === id)) {
      errorBox.textContent = !name ? "Name is required." : "That emulator ID already exists.";
      return;
    }
    onAdd({
      id,
      name,
      type: overlay.querySelector("#add-emulator-type").value,
      path: overlay.querySelector('[data-field="add-emulator-path"]').value.trim(),
      working_dir: overlay.querySelector('[data-field="add-emulator-working-dir"]').value.trim(),
      supported_extensions: overlay.querySelector("#add-emulator-extensions").value,
      arguments: ['scummvm', 'steem', 'hatari'].includes(overlay.querySelector('#add-emulator-type').value) ? [] : ['{file}'],
      built_in: false,
    });
    overlay.remove();
  });
}

function applyFilters() {
  els.filterPoks.closest('label').hidden = !platformColumnAvailable('poks');
  const filters = activeFiltersSnapshot();
  renderMetadataFilters(filters);
  renderViewOptions();
  state.filtered = groupedGameRows(state.games.filter((game) => matchesActiveFilters(game, "", filters)), filters);
  const visible = new Map(state.filtered.map(game => [game.version_group || game.id, game]));
  state.selectedIds = new Set([...state.selectedIds].map(id => {
    const game = state.gamesById.get(id);
    return visible.get(game?.version_group || id)?.id;
  }).filter(Boolean));
  sortFilteredGames();
  renderList();
  renderCounts();
  updateSortHeaders();
  rememberPlatformFilters();
}

function scheduleFilterApply() {
  if (filterFrame) cancelAnimationFrame(filterFrame);
  filterFrame = requestAnimationFrame(() => {
    filterFrame = 0;
    applyFilters();
  });
}

function activeFiltersSnapshot() {
  return {
    query: els.search.value.trim().toLowerCase(),
    cleanup: els.filterCleanup?.value || "",
    system: new Set(selectedFilterValues("system")),
    language: new Set(selectedFilterValues("language")),
    country: new Set(selectedFilterValues("country")),
    year: new Set(selectedFilterValues("year")),
    publisher: new Set(selectedFilterValues("publisher")),
    tag: new Set(selectedFilterValues("tag")),
    view: els.filterView.value || "all",
    poks: platformColumnAvailable('poks') ? els.filterPoks.dataset.filterState || (els.filterPoks.checked ? 'include' : 'neutral') : 'neutral',
    excluded: Object.fromEntries(Object.entries(state.excludedFilters).map(([key, values]) => [key, new Set(values)])),
  };
}

function matchesActiveFilters(game, excludeKey = "", filters = activeFiltersSnapshot()) {
  if (filters.query && !matchesQuery(game, filters.query)) return false;
  if (filters.cleanup && !game.cleanup?.[filters.cleanup]) return false;
  if (excludeKey !== "system" && filters.system.size && !filters.system.has(game.system)) return false;
  if (excludeKey !== "language" && filters.language.size && !intersects(gameLanguageCodes(game), filters.language)) return false;
  if (excludeKey !== "country" && filters.country.size && !intersects(game.countries || [], filters.country)) return false;
  if (excludeKey !== "year" && filters.year.size && !filters.year.has(gameYear(game))) return false;
  if (excludeKey !== "publisher" && filters.publisher.size && !filters.publisher.has(game.publisher)) return false;
  if (excludeKey !== "tag" && filters.tag.size && !intersects(gameTags(game), filters.tag)) return false;
  if ((filters.poks === 'include' || filters.poks === true) && !game.has_poks) return false;
  if (matchesExcludedFilters(game, excludeKey, filters)) return false;
  if (excludeKey === "view") return true;
  if (filters.view === "all" && ["incoming", "trash"].includes(game.view)) return false;
  if (filters.view === "favourites" && !game.favourite) return false;
  if (filters.view === "recent" && !state.recentIds.has(game.id)) return false;
  if (filters.view === "new" && !game.newly_indexed) return false;
  if (filters.view === "incoming" && game.view !== "incoming") return false;
  if (filters.view === "trash" && game.view !== "trash") return false;
  return true;
}

function matchesExcludedFilters(game, excludeKey, filters) {
  if (filters.poks === 'exclude' && game.has_poks) return true;
  const exclusions = Object.entries(filters.excluded || {}).filter(([key, excluded]) => key !== excludeKey && excluded.size);
  if (!exclusions.length) return false;
  const values = {system:[game.system], language:gameLanguageCodes(game), country:game.countries || [],
    year:[gameYear(game)], publisher:[game.publisher], tag:gameTags(game)};
  return exclusions.some(([key, excluded]) => intersects(values[key] || [], excluded));
}

function filteredForCounts(excludeKey, filters) {
  return state.games.filter((game) => matchesActiveFilters(game, excludeKey, filters));
}

function selectedFilterValues(key) {
  return state.multiFilters[key] || [];
}

function intersects(values, filters) {
  return values.some((value) => filters.has(value));
}

function sortFilteredGames() {
  const rules = state.sortRules.filter((rule) => rule.key);
  if (!rules.length) return;
  state.filtered.sort((a, b) => {
    for (const rule of rules) {
      const result = compareSortValues(sortValue(a, rule.key), sortValue(b, rule.key), rule.key);
      if (result !== 0) {
        return rule.dir === "desc" ? -result : result;
      }
    }
    return compareSortValues(sortValue(a, "title"), sortValue(b, "title"), "title");
  });
}

function compareSortValues(a, b, key) {
  const emptyA = a === "" || a === null || typeof a === "undefined";
  const emptyB = b === "" || b === null || typeof b === "undefined";
  if (emptyA && !emptyB) return 1;
  if (!emptyA && emptyB) return -1;
  if (emptyA && emptyB) return 0;
  if (typeof a === "number" || typeof b === "number") {
    return Number(a || 0) - Number(b || 0);
  }
  if (key === "system") {
    return systemSortValue(a) - systemSortValue(b);
  }
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function sortValue(game, key) {
  if (key === "title") return game.sort_title || game.title_key || game.title;
  if (key === "publisher") return game.publisher || "";
  if (key === "series") return game.series || "";
  if (key === "year") return gameYear(game);
  if (key === "system") return game.system || game.memory || "";
  if (key === "tag") return gameTags(game).join(" ");
  if (key === "language") return formatLanguageCodes(game);
  if (key === "country") return formatCountryCodes(game.countries || []);
  if (key === "version") return game.version_editions?.join(' / ') || game.version || '';
  if (key === "poks") return game.has_poks ? Number(game.pok_count || 1) : 0;
  if (key === "favourite") return game.favourite ? 1 : 0;
  if (key === "recent") return state.recentIds.has(game.id) ? 1 : 0;
  if (key === "file") return game.file_name || "";
  if (key === "format") return fileExtension(game.file_name);
  if (key === "collection") return game.section || game.category || "";
  return "";
}

function matchesQuery(game, query) {
  return [
    game.title,
    game.file_name,
    game.system,
    game.memory,
    game.section,
    game.category,
    game.language,
    ...(gameTags(game)),
    ...(game.countries || []),
    game.publisher,
    game.series,
    game.year,
    ...(game.tosec_tags || []),
    ...(game.flags || []),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function renderCounts() {
  const collectionName = state.activeCollection?.name || "collection";
  const access = state.activeCollection?.writable ? "" : " read-only";
  els.count.textContent = `${state.games.length.toLocaleString()} ${collectionName}${access} games indexed`;
  els.resultCount.textContent = `${state.filtered.length.toLocaleString()} games`;
  const selectedCount = state.selectedIds.size;
  els.selectionCount.textContent = selectedCount ? `${selectedCount.toLocaleString()} selected` : "";
  const selectedGames = selectedGameList();
  const incomingSelected = selectedGames.some((game) => game.view === "incoming");
  const trashSelected = selectedGames.some((game) => game.view === "trash");
  els.bulkEdit.textContent = incomingSelected ? "Incoming Actions" : trashSelected ? "Bin Actions" : "Bulk Actions";
  els.bulkEdit.disabled = !selectedCount;
  const visibleIds = state.filtered.map((game) => game.id);
  const checkedVisible = visibleIds.filter((id) => state.selectedIds.has(id)).length;
  if (els.selectVisible) {
    els.selectVisible.checked = visibleIds.length > 0 && checkedVisible === visibleIds.length;
    els.selectVisible.indeterminate = checkedVisible > 0 && checkedVisible < visibleIds.length;
  }
  renderImportSelectTools();
  const bits = [];
  if (els.search.value.trim()) bits.push(`search "${els.search.value.trim()}"`);
  if (platformColumnAvailable('poks') && els.filterPoks.dataset.filterState !== 'neutral') {
    if (els.filterPoks.dataset.filterState === 'exclude') bits.push('exclude POKs');
    else if (els.filterPoks.checked) bits.push('POKs');
  }
  if (els.filterView.value === "favourites") bits.push("favourites");
  if (els.filterView.value === "recent") bits.push("recent");
  if (els.filterView.value === "incoming") bits.push("incoming");
  if (els.filterView.value === "trash") bits.push("bin");
  const cleanupLabel = {artwork:'missing artwork', description:'missing description', review:'needs scrape review'}[els.filterCleanup?.value];
  if (cleanupLabel) bits.push(cleanupLabel);
  bits.push(...filterSummary("system"));
  bits.push(...filterSummary("language", LANGUAGE_NAMES));
  bits.push(...filterSummary("country", COUNTRY_NAMES));
  bits.push(...filterSummary("year"));
  bits.push(...filterSummary("publisher"));
  bits.push(...filterSummary("tag"));
  els.activeSummary.textContent = bits.length ? ` filtered by ${bits.join(", ")}` : "";
}

function renderImportSelectTools() {
  if (!els.importSelectTools) return;
  const importView = ["incoming", "trash"].includes(els.filterView.value) ? els.filterView.value : "";
  els.importSelectTools.hidden = !importView;
  if (!importView) return;
  const counts = importStatusCounts();
  els.importSelectTools.querySelectorAll("[data-import-select]").forEach((button) => {
    const count = counts[button.dataset.importSelect] || 0;
    button.disabled = count === 0;
    button.title = count
      ? `Select ${count.toLocaleString()} ${importStatusLabel(button.dataset.importSelect).toLowerCase()} file${count === 1 ? "" : "s"}`
      : `No ${importStatusLabel(button.dataset.importSelect).toLowerCase()} files in this view`;
  });
}

function importStatusCounts() {
  return state.filtered.reduce((counts, game) => {
    if (["incoming", "trash"].includes(game.view)) {
      counts[game.import_status || "new"] = (counts[game.import_status || "new"] || 0) + 1;
    }
    return counts;
  }, {});
}

function importStatusLabel(status) {
  if (status === "system-match") return "Duplicate";
  if (status === "title-match") return "Variant";
  return "New";
}

function handleImportSelectTools(event) {
  const button = event.target.closest("[data-import-select]");
  if (!button) return;
  const status = button.dataset.importSelect;
  const importView = ["incoming", "trash"].includes(els.filterView.value) ? els.filterView.value : "";
  if (!importView) return;
  state.selectedIds.clear();
  state.filtered
    .filter((game) => game.view === importView && (game.import_status || "new") === status)
    .forEach((game) => state.selectedIds.add(game.id));
  renderList();
  renderCounts();
}

function handleBulkAction() {
  const selectedGames = selectedGameList();
  if (!selectedGames.length) return;
  if (selectedGames.some((game) => game.view === "incoming")) {
    showIncomingBulkModal(selectedGames.filter((game) => game.view === "incoming"));
    return;
  }
  if (selectedGames.some((game) => game.view === "trash")) {
    showTrashBulkModal(selectedGames.filter((game) => game.view === "trash"));
    return;
  }
  showCollectionBulkModal(selectedGames);
}

function showCollectionBulkModal(games) {
  if (!games.length) return;
  const favouriteAddGames = games.filter((game) => !isGameFavourite(game));
  const favouriteRemoveGames = games.filter((game) => isGameFavourite(game));
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h2>Bulk Actions</h2>
      <p>${games.length.toLocaleString()} collection game${games.length === 1 ? "" : "s"} selected.</p>
      <div class="modal-actions">
        <button data-action="metadata" ${state.activeCollection?.writable ? '' : 'disabled'}>Edit Metadata</button>
        <button data-action="scrape" ${canScrapeMetadata() ? '' : 'disabled'}>Scrape Metadata</button>
        ${!webHubHandoff.rebindGameKey ? '<button class="secondary" data-action="send-selected-webhub">Send selected games to Portal</button>' : ''}
        <button class="secondary" data-action="set-country" ${state.activeCollection?.writable ? '' : 'disabled'}>Set Country</button>
        <button class="secondary" data-action="set-language" ${state.activeCollection?.writable ? '' : 'disabled'}>Set Language</button>
        <button class="secondary" data-action="favourite-add" ${favouriteAddGames.length ? "" : "disabled"}>Add to Favourites (${favouriteAddGames.length.toLocaleString()})</button>
        <button class="secondary" data-action="favourite-remove" ${favouriteRemoveGames.length ? "" : "disabled"}>Remove from Favourites (${favouriteRemoveGames.length.toLocaleString()})</button>
        <button class="secondary danger-text" data-action="delete" ${state.activeCollection?.writable ? '' : 'disabled'}>Delete Selected</button>
        <button class="secondary" data-action="cancel">Cancel</button>
      </div>
      <div class="message error" id="collection-bulk-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const errorBox = overlay.querySelector("#collection-bulk-error");
  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay) {
      overlay.remove();
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "cancel") {
      overlay.remove();
      return;
    }
    if (action === "send-selected-webhub") {
      overlay.remove();
      await sendGamesToPortal(games);
      return;
    }
    if (action === 'scrape') { overlay.remove(); await showBulkScrapeModal(games); return; }
    if (action === "metadata") {
      overlay.remove();
      showMetadataModal(games.map((game) => game.id), true);
      return;
    }
    if (action === "set-country" || action === "set-language") {
      overlay.remove();
      showMetadataModal(games.map((game) => game.id), true, action === "set-country" ? "countries" : "languages");
      return;
    }
    try {
      errorBox.textContent = "";
      button.disabled = true;
      if (action === "delete" && !confirmBulkDeleteCollection(games)) {
        overlay.remove();
        await renderDetails("Delete cancelled.");
        return;
      }
      const actionGames = action === "favourite-add" ? favouriteAddGames : action === "favourite-remove" ? favouriteRemoveGames : games;
      if (!actionGames.length) {
        errorBox.textContent = "No selected games are eligible for that action.";
        button.disabled = true;
        return;
      }
      const result = await withBusy(
        collectionBulkTitle(action),
        collectionBulkMessage(action, actionGames.length),
        async () => {
          const message = action === "delete"
            ? await bulkDeleteCollectionGames(actionGames, false)
            : await bulkSetFavourite(actionGames, action === "favourite-add");
          els.busyMessage.textContent = "Reloading library...";
          setBusyProgress(null);
          await reloadGames();
          return message;
        },
      );
      overlay.remove();
      state.selected = null;
      state.selectedIds.clear();
      renderList();
      renderCounts();
      await renderDetails(result);
    } catch (error) {
      button.disabled = false;
      errorBox.textContent = error.message;
    }
  });
}

function collectionBulkTitle(action) {
  if (action === "delete") return "Moving to Bin";
  if (action === "favourite-add") return "Adding Favourites";
  return "Removing Favourites";
}

function collectionBulkMessage(action, count) {
  const noun = `${count.toLocaleString()} game${count === 1 ? "" : "s"}`;
  if (action === "delete") return `Moving ${noun} to bin...`;
  if (action === "favourite-add") return `Adding ${noun} to favourites...`;
  return `Removing ${noun} from favourites...`;
}

function confirmBulkDeleteCollection(games) {
  return window.confirm(`Move ${games.length.toLocaleString()} selected game${games.length === 1 ? "" : "s"} to _Deleted?`);
}

async function bulkDeleteCollectionGames(games, confirmFirst = true) {
  if (confirmFirst && !confirmBulkDeleteCollection(games)) return "Delete cancelled.";
  const payload = await api("/api/delete-bulk", {
    method: "POST",
    body: JSON.stringify({ game_ids: games.map((game) => game.id) }),
  });
  const deleted = Number(payload.count || 0);
  setBusyProgress(100);
  return `Moved ${deleted} game${deleted === 1 ? "" : "s"} to bin.`;
}

async function bulkSetFavourite(games, favourite) {
  const targets = favourite ? games : games.flatMap(favouriteGameMembers);
  const updated = await setGameFavourites(targets, favourite);
  setBusyProgress(100);
  return `${favourite ? "Added" : "Removed"} ${updated} favourite${updated === 1 ? "" : "s"}.`;
}

function showIncomingBulkModal(games) {
  if (!games.length) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h2>Incoming Actions</h2>
      <p>${games.length.toLocaleString()} incoming file${games.length === 1 ? "" : "s"} selected.</p>
      <div class="modal-actions">
        <button data-action="import">Import Selected</button>
        <button class="secondary danger-text" data-action="delete">Delete Selected</button>
        <button class="secondary" data-action="cancel">Cancel</button>
      </div>
      <div class="message error" id="incoming-bulk-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const errorBox = overlay.querySelector("#incoming-bulk-error");
  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay) {
      overlay.remove();
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "cancel") {
      overlay.remove();
      return;
    }
    try {
      errorBox.textContent = "";
      button.disabled = true;
      button.textContent = button.dataset.action === "import" ? "Importing..." : "Deleting...";
      const isImport = button.dataset.action === "import";
      if (!isImport && !confirmBulkDeleteIncoming(games)) {
        overlay.remove();
        await renderDetails("Delete cancelled.");
        return;
      }
      const result = await withBusy(
        isImport ? "Importing Incoming" : "Moving Incoming to Bin",
        `${isImport ? "Importing" : "Moving"} ${games.length.toLocaleString()} file${games.length === 1 ? "" : "s"}...`,
        async () => {
          const message = isImport ? await bulkImportIncoming(games) : await bulkDeleteGames(games, false);
          els.busyMessage.textContent = "Reloading library...";
          setBusyProgress(null);
          await reloadCollections();
          await reloadGames();
          return message;
        },
      );
      overlay.remove();
      state.selected = null;
      state.selectedIds.clear();
      await renderDetails(result);
    } catch (error) {
      button.disabled = false;
      button.textContent = button.dataset.action === "import" ? "Import Selected" : "Delete Selected";
      errorBox.textContent = error.message;
    }
  });
}

async function bulkImportIncoming(games) {
  els.busyMessage.textContent = `Importing ${games.length.toLocaleString()} incoming file${games.length === 1 ? "" : "s"}...`;
  setBusyProgress(null);
  const payload = await api("/api/import-incoming-bulk", {
    method: "POST",
    body: JSON.stringify({ game_ids: games.map((game) => game.id) }),
  });
  const imported = payload.count ?? payload.imported?.length ?? 0;
  setBusyProgress(100);
  return `Imported ${imported} incoming file${imported === 1 ? "" : "s"}.`;
}

function confirmBulkDeleteIncoming(games) {
  return window.confirm(`Move ${games.length.toLocaleString()} selected incoming file${games.length === 1 ? "" : "s"} to _Deleted?`);
}

async function bulkDeleteGames(games, confirmFirst = true) {
  if (confirmFirst && !confirmBulkDeleteIncoming(games)) return "Delete cancelled.";
  const payload = await api("/api/delete-bulk", {
    method: "POST",
    body: JSON.stringify({ game_ids: games.map((game) => game.id) }),
  });
  const deleted = Number(payload.count || 0);
  setBusyProgress(100);
  return `Moved ${deleted} incoming file${deleted === 1 ? "" : "s"} to _Deleted.`;
}

function showTrashBulkModal(games) {
  if (!games.length) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h2>Bin Actions</h2>
      <p>${games.length.toLocaleString()} bin file${games.length === 1 ? "" : "s"} selected.</p>
      <div class="modal-actions">
        <button data-action="restore">Restore Selected</button>
        <button class="secondary danger-text" data-action="purge">Remove Permanently</button>
        <button class="secondary" data-action="cancel">Cancel</button>
      </div>
      <div class="message error" id="trash-bulk-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const errorBox = overlay.querySelector("#trash-bulk-error");
  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay) {
      overlay.remove();
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "cancel") {
      overlay.remove();
      return;
    }
    try {
      errorBox.textContent = "";
      button.disabled = true;
      button.textContent = button.dataset.action === "restore" ? "Restoring..." : "Removing...";
      const isRestore = button.dataset.action === "restore";
      if (!isRestore && !confirmPurgeTrash(games)) {
        overlay.remove();
        await renderDetails("Permanent removal cancelled.");
        return;
      }
      const result = await withBusy(
        isRestore ? "Restoring from Bin" : "Removing from Bin",
        `${isRestore ? "Restoring" : "Removing"} ${games.length.toLocaleString()} file${games.length === 1 ? "" : "s"}...`,
        async () => {
          const message = isRestore ? await restoreTrashGames(games) : await purgeTrashGames(games, false);
          els.busyMessage.textContent = "Reloading library...";
          setBusyProgress(null);
          await reloadCollections();
          await reloadGames();
          return message;
        },
      );
      overlay.remove();
      state.selected = null;
      state.selectedIds.clear();
      await renderDetails(result);
    } catch (error) {
      button.disabled = false;
      button.textContent = button.dataset.action === "restore" ? "Restore Selected" : "Remove Permanently";
      errorBox.textContent = error.message;
    }
  });
}

async function restoreTrashGames(games) {
  els.busyMessage.textContent = `Restoring ${games.length.toLocaleString()} bin file${games.length === 1 ? "" : "s"}...`;
  setBusyProgress(null);
  const payload = await api("/api/restore-trash", {
    method: "POST",
    body: JSON.stringify({ game_ids: games.map((game) => game.id) }),
  });
  const restored = payload.count ?? payload.restored?.length ?? 0;
  setBusyProgress(100);
  return `Restored ${restored} file${restored === 1 ? "" : "s"} from bin.`;
}

function confirmPurgeTrash(games) {
  return window.confirm(`Permanently remove ${games.length.toLocaleString()} selected bin file${games.length === 1 ? "" : "s"}? This cannot be undone.`);
}

async function purgeTrashGames(games, confirmFirst = true) {
  if (confirmFirst && !confirmPurgeTrash(games)) return "Permanent removal cancelled.";
  els.busyMessage.textContent = `Permanently removing ${games.length.toLocaleString()} bin file${games.length === 1 ? "" : "s"}...`;
  setBusyProgress(null);
  const payload = await api("/api/purge-trash", {
    method: "POST",
    body: JSON.stringify({ game_ids: games.map((game) => game.id) }),
  });
  const purged = payload.count ?? payload.purged?.length ?? 0;
  setBusyProgress(100);
  return `Permanently removed ${purged} file${purged === 1 ? "" : "s"}.`;
}

function filterSummary(key, names = null) {
  return selectedFilterValues(key).map((value) => names?.[value] || value)
    .concat((state.excludedFilters[key] || []).map(value => `exclude ${names?.[value] || value}`));
}

function selectedGameList() {
  return [...state.selectedIds].map((id) => state.gamesById.get(id)).filter(Boolean);
}

function renderList() {
  renderVirtualRows(true);
}

function scheduleVirtualRender() {
  if (virtualFrame) return;
  virtualFrame = requestAnimationFrame(() => {
    virtualFrame = 0;
    renderVirtualRows(false);
  });
}

function renderVirtualRows(force = false) {
  const columns = visibleColumns();
  const columnCount = columns.length + 1;
  if (!state.filtered.length) {
    virtualRange = { start: 0, end: 0, columns: columnCount };
    els.list.innerHTML = `<tr class="empty-row"><td colspan="${columnCount}"><div class="empty-state">No games match the current filters.</div></td></tr>`;
    return;
  }
  const viewportHeight = els.library.clientHeight || window.innerHeight;
  const scrollTop = els.library.scrollTop || 0;
  const visibleRows = Math.ceil(viewportHeight / VIRTUAL_ROW_HEIGHT);
  const maxStart = Math.max(0, state.filtered.length - visibleRows);
  const start = Math.min(maxStart, Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_BUFFER_ROWS));
  const end = Math.min(state.filtered.length, start + visibleRows + VIRTUAL_BUFFER_ROWS * 2);
  if (!force && virtualRange.start === start && virtualRange.end === end && virtualRange.columns === columnCount) return;
  virtualRange = { start, end, columns: columnCount };
  const topHeight = start * VIRTUAL_ROW_HEIGHT;
  const bottomHeight = Math.max(0, (state.filtered.length - end) * VIRTUAL_ROW_HEIGHT);
  const rows = [
    virtualSpacerRow(topHeight, columnCount),
    ...state.filtered.slice(start, end).map((game) => renderGameRow(game, columns)),
    virtualSpacerRow(bottomHeight, columnCount),
  ];
  els.list.innerHTML = rows.join("");
}

function virtualSpacerRow(height, columnCount) {
  if (height <= 0) return "";
  return `<tr class="virtual-spacer" aria-hidden="true"><td colspan="${columnCount}" style="height: ${height}px; padding: 0; border: 0;"></td></tr>`;
}

function renderGameRow(game, columns) {
  const selected = state.selected?.id === game.id ? "selected" : "";
  const cells = columns
    .map((column) => `<td class="col-cell col-cell-${escapeHtml(column.key)}">${column.render(game)}</td>`)
    .join("");
  return `
    <tr class="game-row ${selected}" data-id="${escapeHtml(game.id)}">
      <td class="select-column"><input class="row-select" type="checkbox" data-id="${escapeHtml(game.id)}" ${state.selectedIds.has(game.id) ? "checked" : ""}></td>
      ${cells}
    </tr>
  `;
}

function renderTitleCell(game) {
  const flags = [
    importStatusIcon(game),
    game.favourite ? statusIcon("favourite", "Favourite", "★") : "",
    state.recentIds.has(game.id) ? statusIcon("recent", "Recent", "↻") : "",
  ].join("");
  return `<div class="title-cell"><span class="title-text">${escapeHtml(game.title)}</span>${game.version_count > 1 ? `<span class="version-count" title="Available versions">${game.version_count}</span>` : ''}${flags}</div>`;
}

function importStatusIcon(game) {
  if (!["incoming", "trash"].includes(game.view)) return "";
  if (game.import_status === "system-match") {
    return statusIcon("import-match", importStatusTooltip(game, "Likely duplicate: same title and system already exist."), "DUP");
  }
  if (game.import_status === "title-match") {
    return statusIcon("import-variant", importStatusTooltip(game, "Possible variant: title exists, but system differs."), "VAR");
  }
  return statusIcon("import-new", "New: no matching title found in collection.", "NEW");
}

function importStatusTooltip(game, summary) {
  const matches = game.import_matches || [];
  if (!matches.length) return summary;
  return [
    summary,
    "",
    "In collection:",
    ...matches.map((match) => {
      const languages = (match.languages || []).map((code) => String(code).toLowerCase()).join("/");
      const countries = (match.countries || []).join("/");
      return [match.title, match.system, match.publisher, countries, languages].filter(Boolean).join(" | ");
    }),
  ].join("\n");
}

function statusIcon(kind, label, symbol) {
  return `<span class="status-icon ${escapeHtml(kind)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${escapeHtml(symbol)}</span>`;
}

function handleListClick(event) {
  if (event.target.closest(".row-select")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  clearTimeout(listClickTimer);
  listClickTimer = setTimeout(() => selectGame(row.dataset.id), 180);
}

async function handleListDoubleClick(event) {
  const row = event.target.closest("tr[data-id]");
  if (!row || event.target.closest(".row-select")) return;
  clearTimeout(listClickTimer);
  await selectGame(row.dataset.id);
  await launchSelected();
}

function handleListContextMenu(event) {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  showContextMenu(event, row.dataset.id);
}

function handleListChange(event) {
  const checkbox = event.target.closest(".row-select");
  if (!checkbox) return;
  if (checkbox.checked) {
    state.selectedIds.add(checkbox.dataset.id);
  } else {
    state.selectedIds.delete(checkbox.dataset.id);
  }
  renderCounts();
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".filter-combo")) {
    state.openFilterKey = "";
    document.querySelectorAll(".filter-combo.open").forEach((combo) => combo.classList.remove("open"));
  }
});

function collectionTypeLabel(game) {
  const tags = gameTags(game);
  return tags.slice(0, 2).join(", ");
}

function gameTags(game) {
  const tags = [
    ...(game.tags || []),
    ...(game.hardware || []),
    game.type && game.type !== "Official" ? game.type : "",
    game.section === "Homebrew & Scene" ? "Homebrew" : "",
    game.is_ulaplus ? "ULAPlus" : "",
  ].filter(Boolean);
  return [...new Set(tags)];
}

async function selectGame(id) {
  const previousId = state.selected?.id;
  const summary = state.gamesById.get(id);
  if (!summary) return;
  state.selected = summary;
  const generation = state.metadataGeneration || 0;
  updateSelectedRow(previousId, id);
  await renderDetails();
  let details;
  try {details = await loadGameDetails(id);} catch (error) {
    if (state.selected === summary) await renderDetails(error.message, true);
    return;
  }
  if (state.selected?.id !== id || generation !== (state.metadataGeneration || 0)) return;
  state.selected = details || summary;
  applyGameDefaultEmulator(state.selected);
  updateSelectedRow(previousId, id);
  await renderDetails();
}

async function loadGameDetails(id) {
  const generation = state.metadataGeneration || 0, collectionId = state.activeCollection?.id;
  const cached = state.gameDetails.get(id);
  if (cached) return cached;
  const payload = await api(`/api/game?game_id=${encodeURIComponent(id)}`);
  if (generation !== (state.metadataGeneration || 0) || collectionId !== state.activeCollection?.id) return null;
  const details = payload.game || null;
  if (details) {
    state.gameDetails.set(id, details);
    while (state.gameDetails.size > 256) state.gameDetails.delete(state.gameDetails.keys().next().value);
  }
  return details;
}

function applyGameDefaultEmulator(game) {
  if (!game?.default_emulator) return;
  if (state.emulators.some((emulator) => emulator.id === game.default_emulator)) {
    els.emulator.value = game.default_emulator;
  }
}

function updateSelectedRow(previousId, nextId) {
  if (previousId && previousId !== nextId) {
    const previous = els.list.querySelector(`tr[data-id="${escapeAttributeSelector(previousId)}"]`);
    previous?.classList.remove("selected");
  }
  if (nextId) {
    const next = els.list.querySelector(`tr[data-id="${escapeAttributeSelector(nextId)}"]`);
    next?.classList.add("selected");
  }
}

function escapeAttributeSelector(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function renderDetails(message = "", isError = false) {
  const generation = ++detailRenderGeneration;
  const game = state.selected;
  if (!game) {
    els.details.innerHTML = message
      ? `<div class="empty-state">${escapeHtml(message)}</div>`
      : '<div class="empty-state">Select a game</div>';
    return;
  }
  const renderId = game.id;
  const artwork = [game.screenshot, game.loading_screen].filter(value => value && !extensionAssetCache.has(value));
  if (artwork.length) {
    // Saving and delivering a shortcut must not wait for artwork downloads.
    void prepareArtworkAssets(artwork, () => {
      if (generation !== detailRenderGeneration || state.selected !== game) return;
      const panel = els.details.querySelector('.artwork-panel');
      if (panel?.dataset.gameId === game.id) {
        panel.outerHTML = renderArtworkPanel([['Screenshot', game.screenshot], ['Loading', game.loading_screen]].filter(([, value]) => value), game.id);
      }
    }).catch(() => {});
  }
  const poks = [];
  if (state.selected?.id !== renderId || generation !== detailRenderGeneration) return;
  const detailTags = [
    game.system || game.memory,
    formatLanguageCodes(game),
    formatCountryCodes(game.countries || []),
    game.year,
    game.publisher,
    ...(gameTags(game)),
    game.is_ulaplus ? "ULAPlus" : "",
    game.has_poks ? `${game.pok_count} POK${game.pok_count === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  els.details.innerHTML = `
    <div class="detail-title">${escapeHtml(game.title)}</div>
    <div class="detail-tags">
      ${detailTags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
    </div>
    <div class="detail-actions">
      <button id="send-webhub" class="secondary">${webHubHandoff.rebindGameKey ? "Update Portal Shortcut" : "Send to Portal"}</button>
    </div>
    ${renderScrapedMetadata(game)}
    ${(game.screenshot || game.loading_screen) ? '<button class="secondary" data-retry-artwork>Reload artwork</button>' : ''}
    ${game.scrape_provenance?.scraped_at ? `<div class="meta">Metadata: ${escapeHtml(game.scrape_provenance.provider || 'Manual')} · ${escapeHtml(game.scrape_provenance.platform || game.system)} · ${escapeHtml(game.scrape_provenance.scraped_at.slice(0, 10))}</div>` : ''}
    ${renderLaunchMeta(game)}
    ${platformColumnAvailable('poks') ? `<h2 class="section-heading">POKs</h2><div data-detail-poks>${game.has_poks ? '<span class="meta">Loading POKs...</span>' : renderPoks(poks)}</div>` : ''}
    ${message ? `<div class="message ${isError ? "error" : ""}">${escapeHtml(message)}</div>` : ""}
  `;
  document.querySelector("#send-webhub").addEventListener("click", sendSelectedToWebHub);
  els.details.querySelector('[data-retry-artwork]')?.addEventListener('click', () => {
    extensionAssetCache.retry([game.screenshot, game.loading_screen].filter(Boolean));
    void renderDetails();
  });
  if (game.has_poks && platformColumnAvailable('poks')) {
    void api(`/api/poks?game_id=${encodeURIComponent(game.id)}`).then(payload => {
      if (generation !== detailRenderGeneration || state.selected !== game) return;
      const panel = els.details.querySelector('[data-detail-poks]');
      if (!panel) return;
      panel.innerHTML = renderPoks(payload.poks || []);
      panel.querySelectorAll('.open-pok').forEach(button => button.addEventListener('click', () => openPok(button.dataset.pokId)));
    }).catch(() => {
      if (generation === detailRenderGeneration) {
        const panel = els.details.querySelector('[data-detail-poks]');
        if (panel) panel.textContent = 'POKs could not be loaded. Select the game again to retry.';
      }
    });
  }
  document.querySelectorAll(".open-pok").forEach((button) => {
    button.addEventListener("click", () => openPok(button.dataset.pokId));
  });
}

function renderLaunchMeta(game) {
  const launch = resolveLaunchMeta(game);
  return `
    <h2 class="section-heading">Launch</h2>
    <div class="launch-meta">
      <div>
        <span>Emulator</span>
        <strong>${escapeHtml(launch.emulatorName)}</strong>
        <small>${escapeHtml(launch.emulatorSource)}</small>
        <span class="launch-profile-label">Profile</span>
        <strong>${escapeHtml(launch.profileName)}</strong>
        <small>${escapeHtml(launch.profileSource)}</small>
      </div>
    </div>
  `;
}

function renderScrapedMetadata(game) {
  const fields = [
    ["Genre", game.genre],
    ["Developer", game.developer],
    ["Region", game.region],
    ["Rating", game.rating],
  ].filter(([, value]) => value);
  const multiplayer = [["Players", game.players], ["Co-op", game.coop]].filter(([, value]) => value);
  const description = String(game.description || "").trim();
  const assets = [
    ["Screenshot", game.screenshot],
    ["Loading", game.loading_screen],
  ].filter(([, value]) => value);
  if (!fields.length && !multiplayer.length && !description && !assets.length) return "";
  return `
    <h2 class="section-heading">Metadata</h2>
    <div class="scraped-meta">
      ${renderArtworkPanel(assets, game.id)}
      ${fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
      ${multiplayer.length ? `<div class="multiplayer-meta">${multiplayer.map(([label, value]) => `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>` : ""}
      ${description ? `<div class="description-box"><span>Description</span><p>${escapeHtml(description)}</p></div>` : ""}
      </div>
    `;
  }

function renderArtworkPanel(assets, gameId = '') {
  if (!assets.length) return "";
  return `
    <div class="artwork-panel" data-game-id="${escapeHtml(gameId)}">
      ${assets.map(([label, value]) => `
        <figure class="artwork-card">
          ${assetDisplayUrl(value) ? `<img src="${escapeHtml(assetDisplayUrl(value))}" alt="${escapeHtml(label)}" decoding="async" onerror="this.closest('.artwork-card').classList.add('image-missing')">` : `<span class="meta">${extensionAssetCache.has(value) ? 'Artwork unavailable' : 'Loading artwork...'}</span>`}
        </figure>
      `).join("")}
    </div>
  `;
}

function assetDisplayUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return extensionAssetCache.get(text) || "";
}

async function prepareArtworkAssets(values, onReady = () => {}) {
  return extensionAssetCache.prepare(values || [], onReady);
}

function resolveLaunchMeta(game) {
  const emulatorId = game.default_emulator || els.emulator.value || "";
  const emulator = state.emulators.find((item) => item.id === emulatorId);
  const pinnedProfile = game.emulator_profile ? state.emulatorProfiles.find((profile) => profile.id === game.emulator_profile) : null;
  let profile = null;
  let profileSource = "Automatic rules";
  if (pinnedProfile) {
    if (!emulatorId || pinnedProfile.emulator_id === emulatorId) {
      profile = pinnedProfile;
      profileSource = "Game default";
    } else {
      return {
        emulatorName: emulator?.name || emulatorId || "Collection default",
        emulatorSource: game.default_emulator ? "Game default" : "Launcher selection",
        profileName: `${emulatorDisplayName(pinnedProfile.emulator_id)}: ${pinnedProfile.name}`,
        profileSource: `Unavailable for ${emulator?.name || emulatorId || "selected emulator"}`,
      };
    }
  } else {
    profile = automaticProfileForGame(emulatorId, game);
  }
  return {
    emulatorName: emulator?.name || emulatorId || "Collection default",
    emulatorSource: game.default_emulator ? "Game default" : "Launcher selection",
    profileName: profile ? `${emulatorDisplayName(profile.emulator_id)}: ${profile.name}` : "Automatic / none",
    profileSource,
  };
}

function resolveLaunchBinding(game, emulatorOverride = "") {
  const compatible = compatibleGameEmulators(game);
  const explicit = emulatorOverride || game.default_emulator;
  const emulatorId = explicit || [els.emulator.value, state.activeCollection?.default_emulator]
    .find(id => compatible.some(emu => emu.id === id)) || compatible[0]?.id || '';
  if (!compatible.some(emu => emu.id === emulatorId)) {
    throw new Error(explicit ? 'The selected or saved emulator is unavailable or incompatible with this game.'
      : 'No compatible emulator is available for this game. Configure one in Emulators & Profiles.');
  }
  if (state.emulators.find(item => item.id === emulatorId)?.type && ["scummvm", "steem", "hatari"].includes(state.emulators.find(item => item.id === emulatorId)?.type)) return { emulatorId, profileId: "" };
  const pinnedProfile = game.emulator_profile
    ? state.emulatorProfiles.find((profile) => profile.id === game.emulator_profile && (!emulatorId || profile.emulator_id === emulatorId))
    : null;
  if (game.emulator_profile && (!pinnedProfile || pinnedProfile.managed_exists === false)) {
    throw new Error('The saved emulator profile is unavailable or incompatible. Choose a valid profile in Arcade.');
  }
  const profile = pinnedProfile || automaticProfileForGame(emulatorId, game);
  return { emulatorId, profileId: profile?.id || "" };
}

async function sendSelectedToWebHub() {
  const game = state.selected;
  if (!game) return;
  try {
    const binding = resolveLaunchBinding(game);
    await renderDetails("Sending game shortcut to Cyrune Portal...");
    const result = await sendArcadeGame({
      gameId: game.id,
      emulatorId: binding.emulatorId,
      profileId: binding.profileId,
      rebindGameKey: webHubHandoff.rebindGameKey,
      deliveryId: `arcade-game-${game.id}-${Date.now()}`
    });
    if (webHubHandoff.rebindGameKey) {
      webHubHandoff.rebindGameKey = "";
      const url = new URL(window.location.href);
      url.searchParams.delete("hubRebind");
      window.history.replaceState(null, "", url);
      await renderDetails(`Updated the existing Portal shortcut${result.persisted ? ` (${result.persisted})` : ""}.`);
    } else {
      await renderDetails(`Sent to Cyrune Portal Inbox${result.persisted ? ` (${result.persisted})` : ""}.`);
    }
  } catch (error) {
    await renderDetails(error.message || "The game could not be sent to Cyrune Portal.", true);
  }
}

async function sendGamesToPortal(games) {
  if (document.querySelector('[data-portal-delivery]')) return;
  if (webHubHandoff.rebindGameKey) return;
  const focusBefore = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.dataset.portalDelivery = '';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="portal-delivery-title">
    <h2 id="portal-delivery-title">Send games to Portal</h2>
    <p data-delivery-status role="status" aria-live="polite">Sending selected games…</p>
    <p data-delivery-help>Queued games will arrive in Portal’s Inbox when it is available.</p>
    <ul data-delivery-results class="portal-delivery-results"></ul>
    <div class="modal-actions">
      <button data-delivery-retry hidden>Retry remaining</button>
      <button data-delivery-discard class="secondary" hidden>Discard remaining</button>
      <button data-delivery-stop class="secondary">Stop after current game</button>
      <button data-delivery-close class="secondary" disabled>Close</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const status = overlay.querySelector('[data-delivery-status]');
  const results = overlay.querySelector('[data-delivery-results]');
  const retry = overlay.querySelector('[data-delivery-retry]');
  const discard = overlay.querySelector('[data-delivery-discard]');
  const stop = overlay.querySelector('[data-delivery-stop]');
  const close = overlay.querySelector('[data-delivery-close]');
  const labels = { pending: 'Not sent', sending: 'Sending…', delivered: 'Delivered', queued: 'Queued', unconfirmed: 'Not confirmed — retry available' };
  const render = view => {
    const count = value => view.records.filter(record => record.status === value).length;
    status.textContent = `${count('delivered')} delivered · ${count('queued')} queued · ${count('unconfirmed')} not confirmed · ${count('pending')} not sent`;
    results.replaceChildren(...view.records.map(record => {
      const row = document.createElement('li');
      row.textContent = `${record.title} — ${labels[record.status]}${record.message ? `: ${record.message}` : ''}`;
      return row;
    }));
    retry.hidden = view.running || !view.records.some(record => ['pending', 'unconfirmed'].includes(record.status));
    discard.hidden = retry.hidden;
    overlay.querySelector('[data-delivery-help]').textContent = count('unconfirmed')
      ? 'Unconfirmed games may already be queued. Retry avoids duplicates. Discard abandons the remaining attempts; it does not remove delivered or queued games.'
      : 'Queued games will arrive in Portal’s Inbox when it is available. Close keeps unfinished attempts available in this Arcade page.';
    stop.hidden = !view.running;
    close.disabled = view.running;
    overlay.querySelector('[role="dialog"]').setAttribute('aria-busy', String(view.running));
    if (view.running && document.activeElement === retry) stop.focus();
    if (!view.running && document.activeElement === stop) (retry.hidden ? close : retry).focus();
  };
  const dismiss = () => {
    if (close.disabled) return;
    if (portalDeliveryDraft?.batch.snapshot().records.every(record => ['delivered', 'queued'].includes(record.status))) portalDeliveryDraft = null;
    overlay.remove();
    focusBefore?.focus();
  };
  close.addEventListener('click', dismiss);
  discard.addEventListener('click', () => { portalDeliveryDraft = null; dismiss(); });
  retry.addEventListener('click', () => {
    stop.disabled = false;
    void portalDeliveryDraft.batch.run();
  });
  stop.addEventListener('click', () => {
    portalDeliveryDraft?.batch.stop();
    stop.disabled = true;
  });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const buttons = [...overlay.querySelectorAll('button')].filter(button => !button.hidden && !button.disabled);
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  stop.focus();
  try {
    if (portalDeliveryDraft) {
      portalDeliveryDraft.render = render;
      overlay.querySelector('[data-delivery-help]').textContent = 'These are the remaining games from your previous send. Retry keeps their delivery identities and skips games already accepted by Portal or Relay.';
      render(portalDeliveryDraft.batch.snapshot());
      retry.focus();
      return;
    }
    if (!games.length || games.length > 100 || games.some(game => ['incoming', 'trash'].includes(game.view))) {
      throw new Error('Select between 1 and 100 collection games. Incoming and deleted games must first be added or restored to a collection.');
    }
    const collectionId = state.activeCollection?.id;
    const launcher = state.activeCollection?.default_emulator || els.emulator.value;
    // Freeze each game's launch policy before starting. A different row's pinned
    // emulator/profile must never overwrite another selected game's settings.
    const entries = [];
    for (const game of games) {
      // Library summaries already carry the launch pins and profile-rule tags.
      // Native binding validates each game; no separate per-row detail fetch.
      const emulatorId = game.default_emulator || launcher;
      const pinned = game.emulator_profile;
      const profile = pinned ? state.emulatorProfiles.find(value => value.id === pinned) : automaticProfileForGame(emulatorId, game);
      entries.push({ title: `${game.title}${game.system ? ` (${game.system})` : ''}`, gameId: game.id, emulatorId, profileId: pinned || profile?.id || '' });
    }
    const draft = { render, batch: null };
    draft.batch = globalThis.ArcadePortalDelivery.createBatch(entries, payload => {
      if (state.activeCollection?.id !== collectionId) throw new Error('The collection changed.');
      return sendArcadeGame(payload);
    }, view => draft.render(view));
    portalDeliveryDraft = draft;
    await draft.batch.run();
    close.focus();
  } catch (error) {
    status.textContent = error.message || 'The selected games could not be sent.';
    stop.hidden = true;
    close.disabled = false;
    close.focus();
  }
}

function automaticProfileForGame(emulatorId, game) {
  const candidates = state.emulatorProfiles
    .filter((profile) => profile.emulator_id === emulatorId)
    .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100));
  let fallback = null;
  const tags = new Set(gameTags(game));
  for (const profile of candidates) {
    const rule = profile.rule || {};
    const systems = rule.systems || [];
    const profileTags = rule.tags || [];
    if (!systems.length && !profileTags.length) {
      fallback = fallback || profile;
      continue;
    }
    if (systems.includes(game.system)) return profile;
    if (profileTags.some((tag) => tags.has(tag))) return profile;
  }
  return fallback;
}

function formatCountryCodes(codes) {
  return codes.map((code) => String(code).toUpperCase()).join(", ");
}

function formatLanguageCodes(game) {
  return gameLanguageCodes(game)
    .map((code) => String(code).toLowerCase())
    .join(", ");
}

function gameLanguageCodes(game) {
  return game.languages?.length ? game.languages : languageCodesFromLabel(game.language);
}

function languageCodesFromLabel(label) {
  if (!label) return [];
  const entries = Object.entries(LANGUAGE_NAMES);
  return String(label)
    .split("/")
    .map((part) => part.trim())
    .map((name) => entries.find(([_code, labelName]) => labelName === name)?.[0] || "")
    .filter(Boolean);
}

function renderPoks(poks) {
  if (!poks.length) return '<div class="empty-state">No matched POKs</div>';
  return `
    <div class="pok-list">
      ${poks
        .map((pok) => `
          <div class="pok-item">
            <div class="pok-main">
              <strong>${escapeHtml(pok.title)}</strong>
              <button class="secondary open-pok" data-pok-id="${escapeHtml(pok.id)}">Send</button>
            </div>
            ${renderPokCheats(pok.cheats || [])}
            <div class="meta">${escapeHtml(pok.file_name || pok.output_path)}${pok.linked_game_count > 1 ? ` · shared with ${pok.linked_game_count} games` : ""}</div>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function renderPokCheats(cheats) {
  if (!cheats.length) return '<div class="meta">No cheat descriptions found in file</div>';
  const visible = cheats.slice(0, 8);
  const extra = cheats.length > visible.length ? `<li>+ ${cheats.length - visible.length} more</li>` : "";
  return `
    <ul class="pok-cheats">
      ${visible.map((cheat) => `<li>${escapeHtml(cheat.name)}</li>`).join("")}
      ${extra}
    </ul>
  `;
}

async function launchSelected() {
  try {
    const result = await launchGame("");
    await refreshRecentAfterLaunch();
    await renderDetails(launchMessage(result));
  } catch (error) {
    if (error.payload?.needs_choice) {
      const choice = await showLaunchChoice(error.payload);
      if (!choice) {
        await renderDetails("Launch cancelled.");
        return;
      }
      await runLaunchChoice(choice);
      return;
    }
    if (error.payload?.needs_confirmation) {
      const choice = window.confirm(error.message) ? "new" : "";
      if (!choice) {
        await renderDetails("Launch cancelled.");
        return;
      }
      await runLaunchChoice(choice);
      return;
    }
    await renderDetails(error.message, true);
  }
}

async function runLaunchChoice(choice, emulator = "") {
  try {
    const result = await launchGame(choice, emulator);
    await refreshRecentAfterLaunch();
    await renderDetails(launchMessage(result));
  } catch (error) {
    await renderDetails(error.message, true);
  }
}

async function launchGame(launchAction, emulator = "", exactVersion = false) {
  const summary = state.gamesById.get(state.selected.id);
  if (!exactVersion && summary?.version_group && !summary.default_version) {
    throw new Error('The saved default version is missing. Choose another in Launch Version…');
  }
  const binding = resolveLaunchBinding(state.selected, emulator);
  return api("/api/launch", {
    method: "POST",
    body: JSON.stringify({
      game_id: state.selected.id,
      emulator: binding.emulatorId,
      launch_action: launchAction,
      profile_id: binding.profileId,
    }),
  });
}

function showLaunchChoice(payload) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const currentButton = payload.supports_current
      ? '<button data-choice="current">Open in Current</button>'
      : "";
    const newButton = payload.supports_new
      ? '<button class="secondary" data-choice="new">Open New</button>'
      : "";
    overlay.innerHTML = `
      <div class="modal">
        <h2>Emulator Running</h2>
        <p>${escapeHtml(payload.emulator_name || "The selected emulator")} is already open.</p>
        <div class="modal-actions">
          ${currentButton}
          ${newButton}
          <button class="secondary" data-choice="">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const choice = button.dataset.choice || "";
        overlay.remove();
        resolve(choice);
      });
    });
  });
}

function showCatalogueReattachmentModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="catalogue-reattachment-title">
      <h2 id="catalogue-reattachment-title">Reconnect Collection</h2>
      <p>Reconnect a prepared collection after moving or copying its folder. Choose the original collection, then select its new folder.</p>
      <label><span>Prepared collection</span><select data-reattachment-source disabled></select></label>
      <p>The review checks every retained game ID and file against the prepared collection. Confirmation updates its location while preserving catalogue identities. Existing device approvals still apply.</p>
      <div data-reattachment-summary class="preview-summary" role="status" aria-live="polite">Loading prepared collections...</div>
      <div class="modal-actions">
        <button data-action="choose" disabled>Choose Folder</button>
        <button data-action="review" disabled>Review Reconnection</button>
        <button data-action="confirm" disabled>Confirm Reconnection</button>
        <button data-action="reload" hidden>Reload Library</button>
        <button data-action="cancel" class="secondary">Close</button>
      </div>
      <div data-reattachment-error class="message error" role="alert"></div>
    </div>`;
  document.body.appendChild(overlay);
  const source = overlay.querySelector('[data-reattachment-source]');
  const summary = overlay.querySelector('[data-reattachment-summary]');
  const errorBox = overlay.querySelector('[data-reattachment-error]');
  const buttons = Object.fromEntries(["choose", "review", "confirm", "reload", "cancel"].map((action) => [action, overlay.querySelector(`[data-action="${action}"]`)]));
  let busy = false;
  let selectionToken = "";
  let reviewToken = "";
  let writableSources = [];
  const clearReview = () => { selectionToken = ""; reviewToken = ""; };
  const update = () => {
    source.disabled = busy || !writableSources.length;
    buttons.choose.disabled = busy || !writableSources.includes(source.value);
    buttons.review.disabled = busy || !selectionToken;
    buttons.confirm.disabled = busy || !reviewToken;
    buttons.cancel.disabled = busy;
    overlay.setAttribute("aria-busy", String(busy));
  };
  const close = () => {
    if (busy) return;
    overlay.remove();
    els.version.focus();
  };
  source.addEventListener("change", () => {
    clearReview();
    summary.textContent = "Choose the new folder for this collection.";
    update();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const controls = [...overlay.querySelectorAll("select, button")].filter((control) => !control.disabled && !control.hidden);
      const index = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
    }
  });
  const run = async (action) => {
    if (busy || (action === "review" && !selectionToken) || (action === "confirm" && !reviewToken)) return;
    const selected = selectionToken;
    const reviewed = reviewToken;
    clearReview();
    busy = true;
    update();
    errorBox.textContent = "";
    summary.textContent = action === "choose" ? "Choose the relocated folder in the folder picker." : "Checking collection...";
    try {
      if (action === "sources") {
        const result = await api("/api/catalogue-reattachment/sources", { method: "POST", body: "{}" });
        writableSources = result.sources.filter((item) => item.writable).map((item) => item.collectionId);
        source.innerHTML = result.sources.map((item) => `<option value="${escapeHtml(item.collectionId)}"${item.writable ? "" : " disabled"}>${escapeHtml(item.name)}${item.available ? "" : " (folder unavailable)"}${item.writable ? "" : " (read-only)"}</option>`).join("");
        source.value = writableSources.includes(state.activeCollection?.id) ? state.activeCollection.id : writableSources[0] || "";
        summary.textContent = writableSources.length ? "Choose the new folder for the selected collection." : "No writable prepared collection is available to reconnect.";
      } else if (action === "choose") {
        const result = await api("/api/pick-path", { method: "POST", body: JSON.stringify({ kind: "catalogue-reattachment", collection_id: source.value }) });
        if (result.cancelled) summary.textContent = "Folder selection cancelled. No collection changes were made.";
        else {
          selectionToken = result.selectionToken;
          summary.textContent = `Selected folder: ${result.folderName}. Review it before reconnecting.`;
        }
      } else if (action === "review") {
        const result = await api("/api/catalogue-reattachment/preview", { method: "POST", body: JSON.stringify({ selection_token: selected }) });
        summary.textContent = `${result.entries.toLocaleString()} retained game files verified. Catalogue identities will be preserved. Confirm this location change within five minutes.`;
        reviewToken = result.reviewToken;
      } else {
        const result = await api("/api/catalogue-reattachment/confirm", { method: "POST", body: JSON.stringify({ review_token: reviewed }) });
        summary.textContent = result.status === "unchanged" ? "This collection already uses the selected folder. Reload the library to continue." : "Collection reconnected. Reload the library to continue.";
        buttons.reload.hidden = false;
      }
    } catch (error) {
      clearReview();
      summary.textContent = "Choose the folder again for a fresh review. If reconnection was interrupted, check Catalogue Recovery first.";
      errorBox.textContent = error.message;
    } finally {
      busy = false;
      update();
      (reviewToken ? buttons.confirm : selectionToken ? buttons.review : buttons.cancel).focus();
    }
  };
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) { close(); return; }
    const action = event.target.closest("button")?.dataset.action;
    if (busy || !action) return;
    if (action === "cancel") close();
    else if (action === "reload") window.location.reload();
    else void run(action);
  });
  void run("sources");
}

function showCatalogueRecoveryModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="catalogue-recovery-title">
      <h2 id="catalogue-recovery-title">Catalogue Recovery</h2>
      <p>Review an interrupted collection change before repairing it. Recovery uses the collection recorded with that change.</p>
      <div data-recovery-status role="status" aria-live="polite">Checking for interrupted work...</div>
      <label><span>Recovery choice</span><select data-recovery-direction disabled></select></label>
      <p>Finish applies the saved change. Restore returns its managed records and file moves to their previous state. Once confirmed, an interrupted repair must resume the same choice.</p>
      <div data-recovery-preview class="preview-summary" role="status" aria-live="polite"></div>
      <div class="modal-actions">
        <button data-action="review" disabled>Review Recovery</button>
        <button data-action="confirm" disabled>Confirm Recovery</button>
        <button data-action="reload" hidden>Reload Library</button>
        <button data-action="cancel" class="secondary">Close</button>
      </div>
      <div data-recovery-error class="message error" role="alert"></div>
    </div>`;
  document.body.appendChild(overlay);
  const direction = overlay.querySelector('[data-recovery-direction]');
  const status = overlay.querySelector('[data-recovery-status]');
  const preview = overlay.querySelector('[data-recovery-preview]');
  const errorBox = overlay.querySelector('[data-recovery-error]');
  const review = overlay.querySelector('[data-action="review"]');
  const confirm = overlay.querySelector('[data-action="confirm"]');
  const reload = overlay.querySelector('[data-action="reload"]');
  const cancel = overlay.querySelector('[data-action="cancel"]');
  let token = "";
  let busy = false;
  let available = false;
  const updateButtons = () => {
    direction.disabled = busy || !available;
    review.disabled = busy;
    confirm.disabled = busy || !token;
    cancel.disabled = busy;
    overlay.setAttribute("aria-busy", String(busy));
  };
  const close = () => {
    if (busy) return;
    overlay.remove();
    els.version.focus();
  };
  const loadStatus = async () => {
    const result = await api("/api/catalogue-recovery/status", { method: "POST", body: "{}" });
    available = result.status === "recovery-required";
    const choices = available ? result.directions : [];
    direction.innerHTML = choices.map((value) => `<option value="${escapeHtml(value)}">${value === "forward" ? "Finish saved change" : "Restore previous state"}</option>`).join("");
    status.textContent = available ? `${result.collectionName}: interrupted ${result.operation === "prepare" ? "catalogue preparation" : result.operation === "reattach" ? "source reattachment" : "metadata change"}.` : "No interrupted catalogue change needs recovery.";
    review.textContent = available ? "Review Recovery" : "Check Again";
    return available;
  };
  direction.addEventListener("change", () => {
    token = "";
    preview.textContent = "Review the selected recovery choice before confirming.";
    updateButtons();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const controls = [...overlay.querySelectorAll("select, button")].filter((control) => !control.disabled && !control.hidden);
      const index = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
    }
  });
  const run = async (action) => {
    if (busy || (action === "confirm" && !token)) return;
    const reviewedToken = token;
    token = "";
    busy = true;
    updateButtons();
    errorBox.textContent = "";
    preview.textContent = "Checking recovery...";
    try {
      if (action === "status" || !available) {
        await loadStatus();
        preview.textContent = "";
      } else if (action === "review") {
        const result = await api("/api/catalogue-recovery/preview", { method: "POST", body: JSON.stringify({ direction: direction.value }) });
        preview.textContent = `${result.documents.toLocaleString()} managed records to update; ${result.moves.toLocaleString()} file moves. ${result.direction === "forward" ? "Finish the saved change" : "Restore the previous state"}. Confirm within five minutes.`;
        token = result.reviewToken;
      } else {
        const result = await api("/api/catalogue-recovery/confirm", { method: "POST", body: JSON.stringify({ review_token: reviewedToken }) });
        preview.textContent = result.status === "rolled-back" ? "Previous state restored. Reload the library to continue." : "Saved change completed. Reload the library to continue.";
        available = false;
        direction.innerHTML = "";
        status.textContent = "Recovery completed.";
        review.textContent = "Check Again";
        reload.hidden = false;
      }
    } catch (error) {
      token = "";
      available = false;
      review.textContent = "Check Again";
      preview.textContent = "Check recovery again before choosing or confirming. An interrupted repair keeps its confirmed choice.";
      errorBox.textContent = error.message;
    } finally {
      busy = false;
      updateButtons();
      (token ? confirm : cancel).focus();
    }
  };
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) { close(); return; }
    const action = event.target.closest("button")?.dataset.action;
    if (busy || !action) return;
    if (action === "cancel") close();
    else if (action === "reload") window.location.reload();
    else void run(action);
  });
  void run("status");
}

function showCataloguePreparationModal() {
  const collection = state.collections.find((item) => item.id === state.activeCollection?.id);
  if (!collection?.available || !collection.writable) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="catalogue-prepare-title">
      <h2 id="catalogue-prepare-title">Preserve IDs for relocation</h2>
      <p><strong>${escapeHtml(collection.name)}</strong></p>
      <p>Portal already browses this library through Add Game. This optional maintenance step records identities for collection relocation.</p>
      <p>Preparation records stable game identities on this device and fills missing IDs in collection metadata. Existing game IDs, favourites and recent history are preserved.</p>
      <p>Use this before moving a collection whose prepared identities need to be retained.</p>
      <div data-preparation-summary class="preview-summary" role="status" aria-live="polite">Review preparation to see the changes.</div>
      <div class="modal-actions">
        <button data-action="review">Review Preparation</button>
        <button data-action="confirm" disabled>Confirm Preparation</button>
        <button data-action="cancel" class="secondary">Cancel</button>
      </div>
      <div data-preparation-error class="message error" role="alert"></div>
    </div>`;
  document.body.appendChild(overlay);
  const reviewButton = overlay.querySelector('[data-action="review"]');
  const confirmButton = overlay.querySelector('[data-action="confirm"]');
  const cancelButton = overlay.querySelector('[data-action="cancel"]');
  const summary = overlay.querySelector('[data-preparation-summary]');
  const errorBox = overlay.querySelector('[data-preparation-error]');
  let reviewToken = "";
  let busy = false;
  const close = () => {
    if (busy) return;
    overlay.remove();
    els.version.focus();
  };
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const buttons = [...overlay.querySelectorAll("button")].filter((button) => !button.disabled);
      const index = buttons.indexOf(document.activeElement);
      event.preventDefault();
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  });
  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay) { close(); return; }
    const action = event.target.closest("button")?.dataset.action;
    if (busy || !action) return;
    if (action === "cancel") { close(); return; }
    if (action === "confirm" && !reviewToken) return;
    const token = reviewToken;
    reviewToken = "";
    busy = true;
    reviewButton.disabled = confirmButton.disabled = cancelButton.disabled = true;
    overlay.setAttribute("aria-busy", "true");
    errorBox.textContent = "";
    summary.textContent = action === "review" ? "Checking collection and game files..." : "Preparing collection...";
    try {
      const result = await api(`/api/catalogue-preparation/${action === "review" ? "preview" : "confirm"}`, {
        method: "POST", body: JSON.stringify({ collection_id: collection.id, ...(action === "confirm" ? { review_token: token } : {}) }),
      });
      if (action === "review") {
        reviewToken = result.reviewToken;
        summary.textContent = `${result.entries.toLocaleString()} game files verified. ${result.newEntries.toLocaleString()} new catalogue identities; ${result.retainedEntries.toLocaleString()} existing identities retained; ${result.pinnedIds.toLocaleString()} missing metadata IDs to fill. Confirm within five minutes.`;
      } else {
        summary.textContent = result.status === "unchanged" ? "This collection is already prepared. No changes were needed." : "Collection prepared. Use Add Game in a Portal board column to choose games.";
        cancelButton.textContent = "Close";
      }
    } catch (error) {
      reviewToken = "";
      summary.textContent = "Review preparation again before confirming. If a request was interrupted, the next review will check the collection's current state.";
      errorBox.textContent = error.message;
    } finally {
      busy = false;
      overlay.removeAttribute("aria-busy");
      reviewButton.disabled = cancelButton.disabled = false;
      confirmButton.disabled = !reviewToken;
      (reviewToken ? confirmButton : cancelButton).focus();
    }
  });
  reviewButton.focus();
}

function showAddCollectionModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h2>Add Collection</h2>
      <p>Add a folder as a browsable Spectrum collection. Existing metadata will be used when present.</p>
      <label>
        <span>Collection root folder</span>
        <input id="new-collection-root" type="text" placeholder="E:\\\\Emulation\\\\Software Library\\\\Sinclair\\\\ZX Spectrum\\\\TheSpectrum">
      </label>
      <label>
        <span>Display name</span>
        <input id="new-collection-name" type="text" placeholder="Collection name">
      </label>
      <label><input id="new-collection-metadata" type="checkbox" checked> Create metadata database on first index</label>
      <label><input id="new-collection-writable" type="checkbox"> Allow rename/delete/manage actions</label>
      <div class="modal-actions">
        <button data-action="add">Add Collection</button>
        <button class="secondary" data-action="cancel">Cancel</button>
      </div>
      <div id="new-collection-error" class="message error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const rootInput = overlay.querySelector("#new-collection-root");
  const nameInput = overlay.querySelector("#new-collection-name");
  const metadataInput = overlay.querySelector("#new-collection-metadata");
  const writableInput = overlay.querySelector("#new-collection-writable");
  const errorBox = overlay.querySelector("#new-collection-error");
  rootInput.focus();
  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay) {
      overlay.remove();
      renderCollections();
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "cancel") {
      overlay.remove();
      renderCollections();
      return;
    }
    try {
      errorBox.textContent = "";
      const payload = await api("/api/add-collection", {
        method: "POST",
        body: JSON.stringify({
          root: rootInput.value,
          name: nameInput.value,
          auto_metadata: metadataInput.checked,
          writable: writableInput.checked,
        }),
      });
      await reloadCollections();
      if (payload.collection?.id) {
        els.collectionSelect.value = payload.collection.id;
      }
      overlay.remove();
      if (payload.collection?.id) {
        const name = payload.collection.name || "collection";
        await withBusy(`Switching to ${name}`, "Starting index...", async () => {
          const switchPayload = await api("/api/select-collection", {
            method: "POST",
            body: JSON.stringify({ collection_id: payload.collection.id }),
          });
          await waitForJob(switchPayload.job_id);
          state.selected = null;
          state.selectedIds.clear();
          await reloadCollections();
          await reloadGames();
        });
      }
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
}

function showColumnOptionsModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal column-modal">
      <h2>Columns</h2>
      <p>Choose visible columns, order, and default widths. Headers can also be dragged and resized directly.</p>
      <div class="column-editor">
        ${state.ui.columnOrder.map((key) => columnEditorRow(key)).join("")}
      </div>
      <div class="modal-actions">
        <button data-action="apply">Done</button>
        <button class="secondary" data-action="reset">Reset Columns</button>
      </div>
      <div class="message error" id="column-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const list = overlay.querySelector(".column-editor");
  const errorBox = overlay.querySelector("#column-error");
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.remove();
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "up" || action === "down") {
      const row = button.closest(".column-editor-row");
      const sibling = action === "up" ? row.previousElementSibling : row.nextElementSibling;
      if (sibling) {
        list.insertBefore(action === "up" ? row : sibling, action === "up" ? sibling : row);
        applyColumnEditorState(list, errorBox);
      }
      return;
    }
    if (action === "reset") {
      resetColumnLayout();
      overlay.remove();
      return;
    }
    if (action === "apply") {
      overlay.remove();
    }
  });
  list.addEventListener("change", (event) => {
    if (event.target.matches("[data-column-visible]")) {
      if (!applyColumnEditorState(list, errorBox)) {
        event.target.checked = true;
      }
    }
  });
  list.addEventListener("input", (event) => {
    if (!event.target.matches("[data-column-width]")) return;
    const row = event.target.closest(".column-editor-row");
    const key = row.dataset.column;
    const width = Math.max(48, Math.min(640, Number(event.target.value) || columnWidth(key)));
    state.ui.columnWidths[key] = width;
    saveUiState();
    const col = els.colgroup.querySelector(`col[data-col="${escapeAttributeSelector(key)}"]`);
    if (col) col.style.width = `${width}px`;
    updateTableMinWidth();
  });
}

function applyColumnEditorState(list, errorBox) {
  const rows = [...list.querySelectorAll(".column-editor-row")];
  const visibility = {...state.ui.columnVisibility};
  const widths = {...state.ui.columnWidths};
  const order = rows.map((row) => row.dataset.column);
  order.push(...state.ui.columnOrder.filter(key => !platformColumnAvailable(key)));
  rows.forEach((row) => {
    const key = row.dataset.column;
    visibility[key] = row.querySelector("[data-column-visible]").checked;
    widths[key] = Math.max(48, Math.min(640, Number(row.querySelector("[data-column-width]").value) || columnWidth(key)));
  });
  if (!rows.some(row => visibility[row.dataset.column])) {
    errorBox.textContent = "Keep at least one column visible.";
    return false;
  }
  errorBox.textContent = "";
  const changed =
    order.join("\u0001") !== state.ui.columnOrder.join("\u0001") ||
    JSON.stringify(visibility) !== JSON.stringify(state.ui.columnVisibility) ||
    JSON.stringify(widths) !== JSON.stringify(state.ui.columnWidths);
  if (!changed) return true;
  state.ui.columnOrder = order;
  state.ui.columnVisibility = visibility;
  state.ui.columnWidths = widths;
  saveUiState();
  renderTableStructure();
  renderList();
  renderCounts();
  return true;
}

function columnEditorRow(key) {
  const column = COLUMN_MAP.get(key);
  if (!column || !platformColumnAvailable(key)) return "";
  return `
    <div class="column-editor-row" data-column="${escapeHtml(key)}">
      <label><input data-column-visible type="checkbox" ${state.ui.columnVisibility[key] ? "checked" : ""}> ${escapeHtml(column.label)}</label>
      <input data-column-width type="number" min="48" max="640" step="10" value="${columnWidth(key)}" title="Width in pixels">
      <button class="secondary" data-action="up" type="button">Up</button>
      <button class="secondary" data-action="down" type="button">Down</button>
    </div>
  `;
}

function toggleColumnSort(key) {
  const existingIndex = state.sortRules.findIndex((rule) => rule.key === key);
  if (existingIndex >= 0) {
    state.sortRules = state.sortRules.map((rule, index) => {
      if (index !== existingIndex) return rule;
      return { ...rule, dir: rule.dir === "asc" ? "desc" : "asc" };
    });
  } else {
    state.sortRules = [{ key, dir: "asc" }, ...state.sortRules.filter((rule) => rule.key)].slice(0, 3);
  }
  applyFilters();
}

function setSortDirection(key, dir) {
  const existingIndex = state.sortRules.findIndex((rule) => rule.key === key);
  if (existingIndex >= 0) {
    state.sortRules = state.sortRules.map((rule, index) => (index === existingIndex ? { ...rule, dir } : rule));
  } else {
    state.sortRules = [{ key, dir }, ...state.sortRules.filter((rule) => rule.key)].slice(0, 3);
  }
  applyFilters();
}

function setSortRulePosition(key, position) {
  const current = state.sortRules.find((rule) => rule.key === key);
  const nextRule = { key, dir: current?.dir || "asc" };
  const remaining = state.sortRules.filter((rule) => rule.key && rule.key !== key);
  remaining.splice(position, 0, nextRule);
  state.sortRules = remaining.slice(0, 3);
  applyFilters();
}

function clearSortRule(key) {
  state.sortRules = state.sortRules.filter((rule) => rule.key && rule.key !== key);
  if (!state.sortRules.length) {
    state.sortRules = [{ key: "title", dir: "asc" }];
  }
  applyFilters();
}

function resetSortRules() {
  state.sortRules = [{ key: "title", dir: "asc" }];
  applyFilters();
}

function updateSortHeaders() {
  document.querySelectorAll("th[data-sort]").forEach((header) => {
    const key = header.dataset.sort;
    const column = COLUMN_DEFS.find((item) => item.sort === key);
    const label = column?.label || key;
    const ruleIndex = state.sortRules.findIndex((rule) => rule.key === key);
    const rule = ruleIndex >= 0 ? state.sortRules[ruleIndex] : null;
    header.classList.toggle("sorted", Boolean(rule));
    header.classList.toggle("sorted-primary", ruleIndex === 0);
    header.classList.toggle("sort-asc", rule?.dir === "asc");
    header.classList.toggle("sort-desc", rule?.dir === "desc");
    header.setAttribute("aria-sort", ruleIndex === 0 ? (rule.dir === "desc" ? "descending" : "ascending") : "none");
    const indicator = header.querySelector(".sort-indicator");
    if (indicator) {
      indicator.innerHTML = rule ? `${ruleIndex + 1}${rule.dir === "desc" ? "&darr;" : "&uarr;"}` : "";
    }
    header.title = rule
      ? `${label}: ${["primary", "secondary", "tertiary"][ruleIndex]} sort, ${rule.dir === "desc" ? "descending" : "ascending"}`
      : `${label}: left-click to sort, right-click for sort priority`;
  });
}

function showSortHeaderMenu(event, key) {
  event.preventDefault();
  event.stopPropagation();
  hideContextMenu();
  const label = COLUMN_DEFS.find((column) => column.sort === key)?.label || SORT_FIELDS.find(([fieldKey]) => fieldKey === key)?.[1] || key;
  const currentIndex = state.sortRules.findIndex((rule) => rule.key === key);
  const currentRule = currentIndex >= 0 ? state.sortRules[currentIndex] : null;
  const nextDir = currentRule?.dir === "desc" ? "asc" : "desc";
  const menu = document.createElement("div");
  menu.className = "context-menu sort-context-menu";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.innerHTML = `
    <div class="context-section">
      <button data-action="primary">Use ${escapeHtml(label)} as Primary</button>
      <button data-action="secondary">Use ${escapeHtml(label)} as Secondary</button>
      <button data-action="tertiary">Use ${escapeHtml(label)} as Tertiary</button>
    </div>
    <div class="context-section">
      <button data-action="direction" data-dir="${nextDir}">Set ${nextDir === "desc" ? "Descending" : "Ascending"}</button>
      <button data-action="clear" ${currentRule ? "" : "disabled"}>Remove from Sort</button>
      <button data-action="reset">Reset to Title</button>
    </div>
  `;
  document.body.appendChild(menu);
  clampMenuToViewport(menu);
  menu.addEventListener("click", (clickEvent) => {
    clickEvent.stopPropagation();
    const button = clickEvent.target.closest("button");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    hideContextMenu();
    if (action === "primary") setSortRulePosition(key, 0);
    if (action === "secondary") setSortRulePosition(key, 1);
    if (action === "tertiary") setSortRulePosition(key, 2);
    if (action === "direction") setSortDirection(key, button.dataset.dir === "desc" ? "desc" : "asc");
    if (action === "clear") clearSortRule(key);
    if (action === "reset") resetSortRules();
  });
}

function compatibleGameEmulators(game) {
  const scummvm = game?.type === 'ScummVM';
  const atari = game?.type === 'Atari ST';
  const extension = String(game?.extension || '').toLowerCase();
  return state.emulators.filter(emu => {
    if (game?.type === 'Game Boy' && emu.type !== 'generic') return false;
    if (!emu.available || (emu.type === 'scummvm') !== scummvm || (['steem', 'hatari'].includes(emu.type)) !== atari) return false;
    if (emu.type === 'steem' && ['TT', 'Falcon'].includes(game.system)) return false;
    if (scummvm) return true;
    const extensions = emu.supported_extensions || [];
    return !extensions.length || extensions.some(value => String(value).toLowerCase() === extension);
  });
}

async function showContextMenu(event, gameId) {
  event.preventDefault();
  hideContextMenu();
  const game = state.gamesById.get(gameId);
  if (!game) return;
  const previousId = state.selected?.id;
  state.selected = game;
  applyGameDefaultEmulator(game);
  updateSelectedRow(previousId, gameId);
  const details = await loadGameDetails(gameId);
  if (state.selected?.id === gameId && details) state.selected = details;
  await renderDetails();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  const isIncoming = game.view === "incoming";
  const isTrash = game.view === "trash";
  const selectedForPortal = state.selectedIds.has(gameId) ? selectedGameList() : [];
  const editButtons = state.activeCollection?.writable && !isIncoming && !isTrash
    ? `
      <button data-action="metadata">Edit Metadata</button>
      <button data-action="set-country">Set Country</button>
      <button data-action="set-language">Set Language</button>
      <button data-action="rename">Rename</button>
      <button data-action="delete" class="danger">Delete</button>
    `
    : "";
  const importButton = state.activeCollection?.writable && isIncoming
    ? '<button data-action="import-incoming">Import into Collection</button>'
    : "";
  const trashButtons = state.activeCollection?.writable && isTrash
    ? `
      <button data-action="restore-trash">Restore to Collection</button>
      <button data-action="purge-trash" class="danger">Remove Permanently</button>
    `
    : "";
  const emulatorButtons = compatibleGameEmulators(state.selected)
    .map(
      (emu) =>
        `<button data-action="launch" data-emulator="${escapeHtml(emu.id)}">Open with ${escapeHtml(emu.name)}</button>`,
    )
    .join("");
  menu.innerHTML = `
    <div class="context-section">
      ${!isIncoming && !isTrash && game.type === 'Atari ST' ? '<button data-action="properties">Properties…</button>' : ''}
      ${!isIncoming && !isTrash ? '<button data-action="launch-version">Launch Version…</button>' : ''}
      ${!isIncoming && !isTrash ? '<button data-action="scrape">Scrape Metadata</button>' : ''}
      ${!isIncoming && !isTrash && selectedForPortal.length > 1 && canScrapeMetadata()
        ? `<button data-action="scrape-selected">Scrape selected games (${selectedForPortal.length})</button>` : ''}
      ${globalThis.ArcadeScrapeDrafts.load(state.activeCollection.id) ? '<button data-action="resume-scrape">Resume scrape review</button>' : ''}
      ${emulatorButtons}
      ${!isIncoming && !isTrash ? `<button data-action="favourite">${isGameFavourite(game) ? 'Remove from Favourites' : 'Add to Favourites'}</button>` : ''}
      <button data-action="send-webhub">${webHubHandoff.rebindGameKey ? "Update Portal Shortcut" : "Send to Portal"}</button>
      ${selectedForPortal.length > 1 && !webHubHandoff.rebindGameKey && !isIncoming && !isTrash
        ? `<button data-action="send-selected-webhub">Send selected games to Portal (${selectedForPortal.length})</button>` : ''}
      <button data-action="research-web">Search the Web</button>
    </div>
    <div class="context-section">
      <button data-action="explorer">Open in Explorer</button>
      ${importButton}
      ${trashButtons}
      ${!isIncoming && !isTrash && canScrapeMetadata() ? '<button data-action="metadata-care">Metadata & protection…</button><button data-action="scrape-undo">Undo last scrape</button>' : ""}
      ${editButtons}
    </div>
  `;
  document.body.appendChild(menu);
  clampMenuToViewport(menu);
  menu.addEventListener("click", async (clickEvent) => {
    clickEvent.stopPropagation();
    const button = clickEvent.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    const emulator = button.dataset.emulator;
    hideContextMenu();
    if (action === 'send-selected-webhub') { await sendGamesToPortal(selectedForPortal); return; }
    if (action === 'resume-scrape') {const draft = globalThis.ArcadeScrapeDrafts.load(state.activeCollection.id); if (draft) await showBulkScrapeModal(state.games.filter(game => draft.gameIds.includes(game.id)).slice(0,100)); return;}
    if (action === 'scrape-selected') { await showBulkScrapeModal(selectedForPortal); return; }
    await handleContextAction(action, emulator);
  });
}

function hideContextMenu() {
  document.querySelectorAll(".context-menu").forEach((menu) => menu.remove());
}

function clampMenuToViewport(menu) {
  const rect = menu.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - rect.width - 8);
  const top = Math.min(rect.top, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

async function handleContextAction(action, emulator) {
  if (!state.selected) return;
  try {
    if (action === 'scrape') { await showScrapePreviewModal(); return; }
    if (action === 'properties') { await showGameProperties(state.selected); return; }
    if (action === 'favourite') { await toggleFavourite(); return; }
    if (action === 'launch-version') { await showGameVersions(state.selected); return; }
    if (action === "launch") {
      if (emulator) {
        els.emulator.value = emulator;
      }
      const result = await launchGame("", emulator);
      await refreshRecentAfterLaunch();
      await renderDetails(launchMessage(result));
      return;
    }
    if (action === "send-webhub") {
      await sendSelectedToWebHub();
      return;
    }
    if (action === "research-web") {
      openGameResearchSearch(state.selected);
      return;
    }
    if (action === "rename") {
      await renameSelected();
      return;
    }
    if (action === "metadata") {
      showMetadataModal([state.selected.id], false);
      return;
    }
    if (action === "set-country" || action === "set-language") {
      showMetadataModal([state.selected.id], false, action === "set-country" ? "countries" : "languages");
      return;
    }
    if (action === "delete") {
      await deleteSelected();
      return;
    }
    if (action === "import-incoming") {
      await importIncomingSelected();
      return;
    }
    if (action === "restore-trash") {
      await restoreTrashGames([state.selected]);
      state.selected = null;
      await reloadCollections();
      await reloadGames();
      await renderDetails("Restored from bin.");
      return;
    }
    if (action === "purge-trash") {
      const message = await purgeTrashGames([state.selected]);
      state.selected = null;
      await reloadCollections();
      await reloadGames();
      await renderDetails(message);
      return;
    }
    if (action === 'metadata-care') { await showMetadataCareModal(state.selected); return; }
    if (action === 'scrape-undo') {
      await api('/api/metadata-care', {method:'POST', body:JSON.stringify({collection_id:state.activeCollection.id, action:'undo'})});
      await reloadGames(); await renderDetails('Last scrape undone.'); return;
    }
    if (action === "explorer") {
      await api("/api/open-explorer", {
        method: "POST",
        body: JSON.stringify({ game_id: state.selected.id }),
      });
      await renderDetails("Opened in Explorer.");
    }
  } catch (error) {
    if (error.payload?.needs_choice) {
      const choice = await showLaunchChoice(error.payload);
      if (choice) {
        await runLaunchChoice(choice, emulator);
      }
      return;
    }
    await renderDetails(error.message, true);
  }
}

function openGameResearchSearch(game) {
  const title = String(game?.title || "").trim().slice(0, 160);
  if (!title) return;
  const platform = String(game?.platform || game?.computer || globalThis.ArcadePlatforms.searchLabel(game)).trim().slice(0, 80);
  const system = String(game?.system || game?.memory || "").trim().slice(0, 80);
  const terms = [...new Set([title, platform, system].filter(Boolean))];
  const url = new URL("https://duckduckgo.com/");
  url.searchParams.set("q", terms.join(" "));
  const linkPreference = arcadeCyruneSettings.get()?.values?.behaviour?.externalLinks;
  if (linkPreference === "current-tab") window.location.assign(url.href);
  else window.open(url.href, "_blank", "noopener,noreferrer");
}

async function importIncomingSelected() {
  const game = state.selected;
  if (!game || game.view !== "incoming") return;
  const result = await api("/api/import-incoming", {
    method: "POST",
    body: JSON.stringify({ game_id: game.id }),
  });
  state.selected = null;
  await reloadCollections();
  await reloadGames();
  await renderDetails(`Imported ${result.name || game.file_name}.`);
}

function canScrapeMetadata() {
  const platform = globalThis.ArcadePlatforms.libraries[collectionPlatform(state.activeCollection)];
  return Boolean(platform && (state.activeCollection?.writable || platform.presentationOverrides || platform.metadataWritable));
}

function rememberScraperProvider(provider) {
  if (!/^[a-z0-9_-]{1,64}$/i.test(provider || '')) return;
  state.ui.scraperProvider = provider;
  saveUiState();
}

function updateScrapeReview(payload) {
  if (typeof payload.needs_review !== 'boolean') return;
  const ids = new Set(payload.target_ids || []);
  for (const game of state.games) if (ids.has(game.id)) {
    game.cleanup = {...game.cleanup, review:payload.needs_review};
  }
}

async function populateScraperProviders(select) {
  const payload = await api('/api/scrapers');
  const providers = payload.providers || [];
  const network = optionalNetworkAllowed();
  select.innerHTML = providers.map(provider => {
    const available = globalThis.ArcadeMetadataScraping.providerAvailable(provider, network);
    const suffix = provider.type !== 'manual' && !network ? ' (network disabled)' : !provider.configured ? ' (not configured)' : provider.enabled === false ? ' (disabled)' : '';
    return `<option value="${escapeHtml(provider.id)}"${available ? '' : ' disabled'}>${escapeHtml(provider.name + suffix)}</option>`;
  }).join('');
  select.value = globalThis.ArcadeMetadataScraping.preferredProvider(providers, state.ui.scraperProvider, network);
  return providers;
}

function showMetadataModal(gameIds, isBulk, focusField = "") {
  if (!state.activeCollection?.writable) return;
  const games = gameIds.map((id) => state.selected?.id === id ? state.selected : state.gamesById.get(id)).filter(Boolean);
  if (!games.length) return;
  const game = games[0];
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const title = isBulk ? `Bulk Edit ${games.length.toLocaleString()} Games` : "Edit Metadata";
  overlay.innerHTML = `
    <div class="modal metadata-modal">
      <h2>${escapeHtml(title)}</h2>
      <p>${isBulk ? "Tick only the fields you want to apply to all selected games." : "TOSEC fields can rename and re-sort the ROM file."}</p>
      <section class="metadata-section">
        <h3>TOSEC Data</h3>
        <div class="metadata-grid">
          ${metadataField("title", "Title", game.title, "text", isBulk, "", "wide")}
          ${metadataField("version", "Version", game.version || "", "text", isBulk, "v1.0")}
          ${metadataField("demo", "Demo", game.demo || "", "text", isBulk, "demo-playable")}
          ${metadataField("date", "Date", game.year || "", "text", isBulk, "1985 or 1985-06")}
          ${metadataField("publisher", "Publisher", game.publisher || "", "text", isBulk)}
          ${metadataSelectField("system", "System", SYSTEM_ORDER, game.system || game.memory || "", isBulk)}
          ${metadataField("video", "Video", game.video || "", "text", isBulk, "PAL")}
          ${metadataMultiSelectField("countries", "Country", COUNTRY_OPTIONS, game.countries || [], isBulk, COUNTRY_NAMES)}
          ${metadataMultiSelectField("languages", "Language", LANGUAGE_OPTIONS, game.languages || [], isBulk, LANGUAGE_NAMES)}
          ${metadataField("copyright_status", "Copyright", game.copyright_status || "", "text", isBulk, "PD")}
          ${metadataField("development_status", "Development", game.development_status || "", "text", isBulk, "beta")}
          ${metadataField("media_type", "Media Type", game.media_type || "", "text", isBulk, "Disk")}
          ${metadataField("media_label", "Media Label", game.media_label || "", "text", isBulk, "Disk 1 of 2")}
          ${metadataField("dump_flags", "Dump Flags", (game.dump_flags || game.flags || []).join(", "), "text", isBulk, "cr, h, t, a")}
          ${metadataField("more_info", "More Info", (game.more_info || []).join(", "), "text", isBulk, "trainer")}
          ${metadataField("genre", "Genre", game.genre || "", "text", isBulk, "Arcade")}
          ${metadataField("description", "Description", game.description || "", "text", isBulk, "Short game description", "wide")}
        </div>
      </section>
      <section class="metadata-section">
        <h3>Collection Metadata</h3>
        <div class="metadata-grid">
          ${metadataTagField("tags", "Tags", gameTags(game).join(", "), isBulk, "CSSCGC, Covertape")}
          ${metadataField("developer", "Developer", game.developer || "", "text", isBulk, "Datasoft, Inc.")}
          ${metadataField("platform", "Platform", game.platform || "", "text", isBulk, "Sinclair ZX Spectrum")}
          ${metadataField("region", "Region", game.region || "", "text", isBulk, "Europe")}
          ${metadataField("players", "Players", game.players || "", "text", isBulk, "2")}
          ${metadataField("coop", "Co-op", game.coop || "", "text", isBulk, "No")}
          ${metadataField("rating", "Rating", game.rating || "", "text", isBulk, "E")}
          ${metadataField("screenshot", "Screenshot", game.screenshot || "", "text", isBulk, "_assets/scraped/screenshots/...png", "wide")}
          ${metadataField("loading_screen", "Loading Screen", game.loading_screen || "", "text", isBulk, "_assets/scraped/loading-screens/...png", "wide")}
          ${metadataField("scraper_source", "Scraper Source", game.scraper_source || "", "text", isBulk, "screenscraper")}
          ${metadataField("scraper_id", "Scraper ID", game.scraper_id || "", "text", isBulk)}
          ${metadataSelectField("default_emulator", "Default Emulator", ["", ...state.emulators.map((emu) => emu.id)], game.default_emulator || "", isBulk, ["Collection Default", ...state.emulators.map((emu) => emu.name)], "wide")}
          ${metadataProfileField(game.emulator_profile || "", isBulk)}
        </div>
      </section>
      <label><input id="metadata-rename-files" type="checkbox" ${isBulk ? "" : "checked"}> Update TOSEC-style filenames and folder letters</label>
      <section class="metadata-section metadata-preview">
        <h3>Preview</h3>
        <div id="metadata-preview-content" class="metadata-preview-content">Loading preview...</div>
      </section>
      <div class="modal-actions">
        <button data-action="save">Save Metadata</button>
        <button class="secondary" data-action="undo">Undo Last Edit</button>
        <button class="secondary" data-action="cancel">Cancel</button>
      </div>
      <div class="message error" id="metadata-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const errorBox = overlay.querySelector("#metadata-error");
  setupMetadataComboDropdowns(overlay);
  setupMetadataProfileFilter(overlay, isBulk);
  bindMetadataPreview(overlay, gameIds, isBulk);
  focusMetadataQuickAction(overlay, focusField, isBulk);
  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay) {
      overlay.remove();
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (!button.dataset.action) return;
    if (button.dataset.action === "cancel") {
      overlay.remove();
      return;
    }
    if (button.dataset.action === "undo") {
      try {
        button.disabled = true;
        button.textContent = "Undoing...";
        const result = await api("/api/metadata-undo", { method: "POST", body: "{}" });
        await reloadGames();
        overlay.remove();
        state.selected = null;
        await renderDetails(`Restored ${result.restored_count || 0} metadata edit${result.restored_count === 1 ? "" : "s"}.`);
      } catch (error) {
        button.disabled = false;
        button.textContent = "Undo Last Edit";
        errorBox.textContent = error.message;
      }
      return;
    }
    try {
      if (isBulk && gameIds.length > 20 && !window.confirm(
        `Apply this metadata edit to ${gameIds.length.toLocaleString()} games? Review the preview and warnings before continuing.`,
      )) return;
      button.disabled = true;
      button.textContent = "Saving...";
      errorBox.textContent = "";
      const changes = collectMetadataChanges(overlay, isBulk);
      if (isBulk && !Object.keys(changes).length) {
        errorBox.textContent = "Tick at least one field to apply.";
        button.disabled = false;
        button.textContent = "Save Metadata";
        return;
      }
      const result = await withBusy(
        isBulk ? "Updating Metadata" : "Updating Game",
        `${isBulk ? "Updating" : "Saving"} ${gameIds.length.toLocaleString()} game${gameIds.length === 1 ? "" : "s"}...`,
        async () => {
          setBusyProgress(null);
          const payload = await api("/api/update-metadata", {
            method: "POST",
            body: JSON.stringify({
              game_ids: gameIds,
              changes,
              rename_files: overlay.querySelector("#metadata-rename-files").checked,
            }),
          });
          setBusyProgress(100);
          els.busyMessage.textContent = "Reloading library...";
          await reloadGames();
          return payload;
        },
      );
      overlay.remove();
      state.selected = null;
      const warningText = result.warnings?.length ? ` ${result.warnings.join(" ")}` : "";
      await renderDetails(`Updated ${result.updated_count || gameIds.length} game${gameIds.length === 1 ? "" : "s"}.${warningText}`);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Save Metadata";
      errorBox.textContent = error.payload?.errors?.join("; ") || error.message;
    }
  });
}

function focusMetadataQuickAction(overlay, field, isBulk) {
  if (!field) return;
  const combo = overlay.querySelector(`[data-meta="${field}"]`);
  if (!combo) return;
  if (isBulk) {
    const apply = overlay.querySelector(`[data-apply="${field}"]`);
    if (apply) apply.checked = true;
  }
  combo.classList.add("open");
  combo.closest(".metadata-field")?.scrollIntoView({ block: "center" });
  combo.querySelector(".metadata-combo-button")?.focus();
}

function metadataField(id, label, value, type = "text", isBulk = false, placeholder = "", layout = "") {
  const control = `<input data-meta="${id}" type="${type}" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder)}">`;
  return metadataFieldShell(id, label, control, isBulk, layout);
}

function metadataTagField(id, label, value, isBulk = false, placeholder = "", layout = "wide") {
  const datalistId = `${id}-suggestions`;
  const options = TAG_SUGGESTIONS.map((tag) => `<option value="${escapeHtml(tag)}"></option>`).join("");
  const control = `
    <input data-meta="${id}" type="text" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder)}" list="${datalistId}">
    <datalist id="${datalistId}">${options}</datalist>
  `;
  return metadataFieldShell(id, label, control, isBulk, layout);
}

function metadataSelectField(id, label, values, current, isBulk = false, labels = null, layout = "") {
  const options = values
    .map((value, index) => {
      const optionLabel = labels?.[index] ?? value;
      const selected = value === current ? " selected" : "";
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(optionLabel || "None")}</option>`;
    })
    .join("");
  return metadataFieldShell(id, label, `<select data-meta="${id}">${options}</select>`, isBulk, layout);
}

function metadataProfileField(current, isBulk = false) {
  const options = [
    '<option value="">Automatic Rules</option>',
    ...state.emulatorProfiles.map((profile) => {
      const selected = profile.id === current ? " selected" : "";
      return `<option value="${escapeHtml(profile.id)}" data-profile-emulator="${escapeHtml(profile.emulator_id)}"${selected}>${escapeHtml(`${emulatorDisplayName(profile.emulator_id)}: ${profile.name}`)}</option>`;
    }),
  ].join("");
  return metadataFieldShell("emulator_profile", "Default Profile", `<select data-meta="emulator_profile">${options}</select>`, isBulk, "wide");
}

function metadataMultiSelectField(id, label, values, currentValues, isBulk = false, labels = null, layout = "") {
  const selected = new Set((currentValues || []).map((value) => String(value).toUpperCase()));
  const options = values
    .map((value) => {
      const checked = selected.has(value) ? " checked" : "";
      const optionLabel = labels?.[value] ? `${labels[value]} (${value})` : value;
      return `
        <label>
          <input type="checkbox" value="${escapeHtml(value)}"${checked}>
          ${escapeHtml(optionLabel)}
        </label>
      `;
    })
    .join("");
  return metadataFieldShell(
    id,
    label,
    `
      <div class="metadata-combo" data-meta="${id}">
        <button type="button" class="metadata-combo-button"></button>
        <div class="metadata-combo-panel">${options}</div>
      </div>
    `,
    isBulk,
    layout,
  );
}

function metadataFieldShell(id, label, control, isBulk, layout = "") {
  const apply = isBulk ? `<input class="metadata-apply" type="checkbox" data-apply="${id}" title="Apply ${escapeHtml(label)}">` : "";
  return `
    <label class="metadata-field ${escapeHtml(layout)}">
      <span>${apply}${escapeHtml(label)}</span>
      ${control}
    </label>
  `;
}

function collectMetadataChanges(overlay, isBulk) {
  const changes = {};
  overlay.querySelectorAll("[data-meta]").forEach((input) => {
    const key = input.dataset.meta;
    if (isBulk && !overlay.querySelector(`[data-apply="${key}"]`)?.checked) return;
    if (input.classList.contains("metadata-combo")) {
      changes[key] = [...input.querySelectorAll("input[type='checkbox']:checked")].map((checkbox) => checkbox.value);
    } else if (key === "tags" || key === "dump_flags" || key === "more_info") {
      changes[key] = splitCsv(input.value);
    } else {
      changes[key] = input.value.trim();
    }
  });
  return changes;
}

function setupMetadataComboDropdowns(overlay) {
  overlay.querySelectorAll(".metadata-combo").forEach((combo) => {
    const button = combo.querySelector(".metadata-combo-button");
    const update = () => updateMetadataComboButton(combo);
    update();
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      overlay.querySelectorAll(".metadata-combo.open").forEach((other) => {
        if (other !== combo) other.classList.remove("open");
      });
      combo.classList.toggle("open");
    });
    combo.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", update);
    });
  });
  overlay.addEventListener("click", (event) => {
    if (!event.target.closest(".metadata-combo")) {
      overlay.querySelectorAll(".metadata-combo.open").forEach((combo) => combo.classList.remove("open"));
    }
  });
}

function setupMetadataProfileFilter(overlay, isBulk) {
  const emulatorSelect = overlay.querySelector('[data-meta="default_emulator"]');
  const profileSelect = overlay.querySelector('[data-meta="emulator_profile"]');
  if (!emulatorSelect || !profileSelect) return;
  const applyDefault = overlay.querySelector('[data-apply="default_emulator"]');
  const sync = () => {
    const selectedEmulator = isBulk && applyDefault && !applyDefault.checked ? "" : emulatorSelect.value;
    [...profileSelect.options].forEach((option) => {
      const profileEmulator = option.dataset.profileEmulator || "";
      const unavailable = Boolean(selectedEmulator && profileEmulator && profileEmulator !== selectedEmulator);
      option.disabled = unavailable;
    });
    if (profileSelect.selectedOptions[0]?.disabled) {
      profileSelect.value = "";
      profileSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  emulatorSelect.addEventListener("change", sync);
  applyDefault?.addEventListener("change", sync);
  sync();
}

function updateMetadataComboButton(combo) {
  const key = combo.dataset.meta;
  const checked = [...combo.querySelectorAll("input[type='checkbox']:checked")].map((checkbox) => checkbox.value);
  const names = key === "languages" ? LANGUAGE_NAMES : COUNTRY_NAMES;
  const label = checked.length ? checked.map((code) => names[code] || code).join(", ") : "None";
  combo.querySelector(".metadata-combo-button").textContent = label;
}

function bindMetadataPreview(overlay, gameIds, isBulk) {
  let previewTimer = 0;
  const schedule = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => refreshMetadataPreview(overlay, gameIds, isBulk), 180);
  };
  overlay.querySelectorAll("[data-meta], #metadata-rename-files, .metadata-apply").forEach((input) => {
    input.addEventListener("input", schedule);
    input.addEventListener("change", schedule);
  });
  schedule();
}

async function refreshMetadataPreview(overlay, gameIds, isBulk) {
  const box = overlay.querySelector("#metadata-preview-content");
  if (!box) return;
  const changes = collectMetadataChanges(overlay, isBulk);
  if (isBulk && !Object.keys(changes).length) {
    box.innerHTML = '<div class="meta">Tick fields to preview bulk changes.</div>';
    return;
  }
  try {
    const payload = await api("/api/metadata-preview", {
      method: "POST",
      body: JSON.stringify({
        game_ids: gameIds,
        changes,
        rename_files: overlay.querySelector("#metadata-rename-files").checked,
      }),
    });
    box.innerHTML = renderMetadataPreview(payload);
  } catch (error) {
    box.innerHTML = `<div class="message error">${escapeHtml(error.message)}</div>`;
  }
}

function renderMetadataPreview(payload) {
  const preview = payload.previews?.[0];
  if (!preview) return '<div class="meta">No preview available.</div>';
  const changeText = payload.count > 1
    ? (payload.changes?.length ? payload.changes.join("; ") : "metadata values from fields")
    : "single game metadata";
  const warnings = [...new Set([...(payload.warnings || []), ...(preview.warnings || [])])];
  return `
    <div class="preview-summary">
      ${payload.count > 1 ? `<div><strong>${payload.count.toLocaleString()} games</strong></div>` : ""}
      <div>Changes: ${escapeHtml(changeText)}</div>
      <div>Rename files: ${payload.rename_files ? "Yes" : "No"}</div>
    </div>
    <div class="preview-grid">
      <span>Current filename</span><strong>${escapeHtml(preview.current_filename)}</strong>
      <span>New filename</span><strong>${escapeHtml(preview.new_filename)}</strong>
      <span>Current folder</span><strong>${escapeHtml(preview.current_folder)}</strong>
      <span>New folder</span><strong>${escapeHtml(preview.new_folder)}</strong>
    </div>
    ${warnings.length ? `<div class="preview-warnings">${warnings.map((warning) => `<div>${escapeHtml(warning)}</div>`).join("")}</div>` : ""}
  `;
}

function splitCsv(value) {
  return String(value || "")
    .split(/[;,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function renameSelected() {
  const game = state.selected;
  const dot = game.file_name.lastIndexOf(".");
  const stem = dot > 0 ? game.file_name.slice(0, dot) : game.file_name;
  const extension = dot > 0 ? game.file_name.slice(dot) : "";
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h2>Rename File</h2>
      <p>This only changes the physical filename. Metadata stays authoritative.</p>
      <label>
        <span>Filename</span>
        <div class="rename-row">
          <input id="rename-stem" type="text" value="${escapeHtml(stem)}">
          <strong>${escapeHtml(extension)}</strong>
        </div>
      </label>
      <div class="modal-actions">
        <button data-action="save">Rename</button>
        <button class="secondary" data-action="cancel">Cancel</button>
      </div>
      <div class="message error" id="rename-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector("#rename-stem");
  const errorBox = overlay.querySelector("#rename-error");
  input.focus();
  input.select();
  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay) {
      overlay.remove();
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "cancel") {
      overlay.remove();
      return;
    }
    try {
      errorBox.textContent = "";
      const newStem = input.value.trim();
      if (!newStem || newStem === stem) {
        overlay.remove();
        return;
      }
      const result = await api("/api/rename", {
        method: "POST",
        body: JSON.stringify({ game_id: game.id, name: `${newStem}${extension}` }),
      });
      overlay.remove();
      state.selected = null;
      await reloadGames();
      await renderDetails(`Renamed to ${result.name}.`);
    } catch (error) {
      errorBox.textContent = error.message;
    }
  });
}

async function deleteSelected() {
  const ok = window.confirm(`Move "${state.selected.file_name}" to _Deleted?`);
  if (!ok) return;
  await api("/api/delete", {
    method: "POST",
    body: JSON.stringify({ game_id: state.selected.id }),
  });
  state.selected = null;
  await reloadGames();
  await renderDetails("Moved to _Deleted.");
}

async function refreshRecentAfterLaunch() {
  const recentPayload = await api("/api/recent");
  state.recentIds = new Set(recentPayload.recent.map((item) => item.game_id));
  applyFilters();
}

function launchMessage(result) {
  if (result.reused) {
    return result.pid
      ? `Sent to running emulator. PID ${result.pid}.`
      : "Sent to running emulator.";
  }
  return result.pid ? `Launch command sent. PID ${result.pid}.` : "Launch command sent.";
}

function favouriteGameMembers(game) {
  const summary = state.gamesById.get(game.id) || game;
  return state.versionGroups?.get(summary.version_group || summary.id) || [summary];
}

function isGameFavourite(game) {
  return favouriteGameMembers(game).some(member => member.favourite);
}

async function setGameFavourites(games, favourite) {
  const targets = new Map(games.map(game => [game.id, state.gamesById.get(game.id)]));
  const payload = await api("/api/favourites-bulk", {
    method: "POST",
    body: JSON.stringify({ game_ids: [...targets.keys()], favourite }),
  });
  for (const id of payload.updated || []) {
    const summary = targets.get(id);
    // Preserve the shared objects used by versionGroups and avoid applying an
    // old collection's response to a newly loaded library with overlapping IDs.
    if (!summary || state.gamesById.get(id) !== summary) continue;
    summary.favourite = favourite;
    const details = state.gameDetails.get(id);
    if (details) details.favourite = favourite;
    if (state.selected?.id === id) state.selected.favourite = favourite;
  }
  applyFilters();
  return Number(payload.count || 0);
}

async function toggleFavourite() {
  const game = state.selected;
  if (!game) return;
  const pending = state.favouritePending ||= new Set();
  const members = favouriteGameMembers(game);
  const key = members[0].id;
  if (pending.has(key)) return;
  pending.add(key);
  try {
    const favourite = !isGameFavourite(game);
    await setGameFavourites(favourite ? [game] : members.filter(member => member.favourite), favourite);
    await renderDetails();
  } catch (error) {
    if (state.selected?.id === game.id) await renderDetails(error.message, true);
  } finally {
    pending.delete(key);
  }
}

async function openPok(pokId) {
  try {
    const result = await api("/api/open-pok", {
      method: "POST",
      body: JSON.stringify({ pok_id: pokId }),
    });
    await renderDetails(result.pid ? `POK sent to Spectaculator. PID ${result.pid}.` : "POK sent to Spectaculator.");
  } catch (error) {
    await renderDetails(error.message, true);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init().catch((error) => {
  els.count.textContent = "Library unavailable";
  els.details.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "The library could not be loaded.")} Reload the page after resolving the issue.</div>`;
});
