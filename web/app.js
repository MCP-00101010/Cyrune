const state = {
  games: [],
  filtered: [],
  selected: null,
  selectedIds: new Set(),
  emulators: [],
  emulatorProfiles: [],
  collections: [],
  activeCollection: null,
  recentIds: new Set(),
  multiFilters: {},
  openFilterKey: "",
  sortRules: [{ key: "title", dir: "asc" }],
  view: "all",
  ui: null,
};

let listClickTimer = 0;
let draggedColumnKey = "";
let virtualFrame = 0;
let virtualRange = { start: -1, end: -1, columns: -1 };
let webHubRequestSequence = 0;
const pendingWebHubRequests = new Map();
const usesExtensionTransport = window.location.protocol === "file:";
const extensionAssetCache = new Map();
let extensionRelayPromise = null;
const webHubHandoff = (() => {
  const params = new URLSearchParams(window.location.search);
  const gameId = String(params.get("game") || "");
  const rebindGameKey = String(params.get("hubRebind") || "");
  return {
    gameId: /^[a-zA-Z0-9_-]{1,120}$/.test(gameId) ? gameId : "",
    rebindGameKey: /^game_[a-zA-Z0-9_-]{12,75}$/.test(rebindGameKey) ? rebindGameKey : "",
  };
})();

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?._emuguiRes !== true) return;
  const pending = pendingWebHubRequests.get(event.data.requestId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingWebHubRequests.delete(event.data.requestId);
  if (event.data.ok === true) pending.resolve(event.data);
  else pending.reject(new Error(event.data.error || "The WebHub extension rejected the game shortcut."));
});

function waitForExtensionRelay() {
  if (!usesExtensionTransport || document.documentElement.dataset.morpheusExtensionRelay === "background-ready") {
    return Promise.resolve();
  }
  if (extensionRelayPromise) return extensionRelayPromise;
  extensionRelayPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Morpheus WebHub extension 1.0.50 or newer is required to open EmuGUI without its server."));
    }, 15000);
    const onMessage = (event) => {
      if (event.source !== window || event.data?._emugui !== true || event.data?._relayReady !== true) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve();
    };
    window.addEventListener("message", onMessage);
  });
  return extensionRelayPromise;
}

async function requestWebHub(type, payload = {}) {
  if (usesExtensionTransport) await waitForExtensionRelay();
  const requestId = `emugui-${Date.now()}-${++webHubRequestSequence}`;
  const timeoutMs = type === "MW_EMUGUI_RPC" && payload.path === "/api/pick-path" ? 305000 : 125000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingWebHubRequests.delete(requestId);
      reject(new Error("Morpheus WebHub extension 1.0.50 or newer is required."));
    }, timeoutMs);
    pendingWebHubRequests.set(requestId, { resolve, reject, timer });
    window.postMessage({ _emuguiReq: true, requestId, type, ...payload }, "*");
  });
}

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
  ["year", "Year"],
  ["system", "System"],
  ["tag", "Tags"],
  ["language", "Language"],
  ["country", "Country"],
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
  { key: "year", label: "Year", sort: "year", width: 72, visible: true, render: (game) => escapeHtml(gameYear(game)) },
  { key: "system", label: "System", sort: "system", width: 86, visible: true, render: (game) => `<span class="pill">${escapeHtml(game.system || game.memory || "")}</span>` },
  { key: "tags", label: "Tags", sort: "tag", width: 170, visible: true, render: (game) => escapeHtml(collectionTypeLabel(game)) },
  { key: "language", label: "Lang", sort: "language", width: 72, visible: true, render: (game) => escapeHtml(formatLanguageCodes(game)) },
  { key: "country", label: "Country", sort: "country", width: 78, visible: true, render: (game) => escapeHtml(formatCountryCodes(game.countries || [])) },
  { key: "poks", label: "POKs", sort: "poks", width: 64, visible: true, render: (game) => (game.pok_count ? `<span class="pill good">${game.pok_count}</span>` : "") },
  { key: "file", label: "Filename", sort: "file", width: 300, visible: false, render: (game) => escapeHtml(game.file_name || "") },
  { key: "format", label: "Format", sort: "format", width: 76, visible: false, render: (game) => escapeHtml(fileExtension(game.file_name)) },
  { key: "collection", label: "Collection", sort: "collection", width: 150, visible: false, render: (game) => escapeHtml(game.section || game.category || "") },
  { key: "favourite", label: "Fav", sort: "favourite", width: 62, visible: false, render: (game) => (game.favourite ? statusIcon("favourite", "Favourite", "★") : "") },
  { key: "recent", label: "Recent", sort: "recent", width: 78, visible: false, render: (game) => (state.recentIds.has(game.id) ? statusIcon("recent", "Recent", "↻") : "") },
];
const COLUMN_MAP = new Map(COLUMN_DEFS.map((column) => [column.key, column]));

state.ui = loadUiState();

const els = {
  shell: document.querySelector("#shell"),
  gameTable: document.querySelector("#game-table"),
  library: document.querySelector(".library"),
  colgroup: document.querySelector("#game-colgroup"),
  headRow: document.querySelector("#game-head-row"),
  count: document.querySelector("#library-count"),
  resultCount: document.querySelector("#result-count"),
  selectionCount: document.querySelector("#selection-count"),
  activeSummary: document.querySelector("#active-summary"),
  list: document.querySelector("#game-list"),
  details: document.querySelector("#details"),
  search: document.querySelector("#search"),
  emulator: document.querySelector("#emulator"),
  editEmulators: document.querySelector("#edit-emulators"),
  editScrapers: document.querySelector("#edit-scrapers"),
  collectionSelect: document.querySelector("#collection-select"),
  rebuild: document.querySelector("#rebuild"),
  bulkEdit: document.querySelector("#bulk-edit"),
  importSelectTools: document.querySelector("#import-select-tools"),
  columnOptions: document.querySelector("#column-options"),
  toggleSidebar: document.querySelector("#toggle-sidebar"),
  toggleDetails: document.querySelector("#toggle-details"),
  selectVisible: null,
  clearFilters: document.querySelector("#clear-filters"),
  filterPoks: document.querySelector("#filter-poks"),
  filterView: document.querySelector("#filter-view"),
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

function loadUiState() {
  const defaults = {
    columnOrder: COLUMN_DEFS.map((column) => column.key),
    columnVisibility: Object.fromEntries(COLUMN_DEFS.map((column) => [column.key, column.visible])),
    columnWidths: Object.fromEntries(COLUMN_DEFS.map((column) => [column.key, column.width])),
    sidebarCollapsed: false,
    detailsCollapsed: false,
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || "{}");
    const order = Array.isArray(parsed.columnOrder) ? parsed.columnOrder.filter((key) => COLUMN_MAP.has(key)) : [];
    const missing = defaults.columnOrder.filter((key) => !order.includes(key));
    const visibility = { ...defaults.columnVisibility, ...(parsed.columnVisibility || {}) };
    if (!Object.values(visibility).some(Boolean)) {
      visibility.title = true;
    }
    return {
      columnOrder: [...order, ...missing],
      columnVisibility: visibility,
      columnWidths: { ...defaults.columnWidths, ...(parsed.columnWidths || {}) },
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      detailsCollapsed: Boolean(parsed.detailsCollapsed),
    };
  } catch (_error) {
    return defaults;
  }
}

function saveUiState() {
  localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(state.ui));
}

function visibleColumns() {
  return state.ui.columnOrder
    .map((key) => COLUMN_MAP.get(key))
    .filter((column) => column && state.ui.columnVisibility[column.key]);
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
  if (usesExtensionTransport) {
    const target = new URL(path, "http://emugui.local");
    let body = {};
    if (options.body) {
      try {
        body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
      } catch (_error) {
        throw new Error("The EmuGUI request body is invalid.");
      }
    }
    const response = await requestWebHub("MW_EMUGUI_RPC", {
      method: String(options.method || "GET").toUpperCase(),
      path: target.pathname,
      query: Object.fromEntries(target.searchParams.entries()),
      body: body && typeof body === "object" ? body : {},
    });
    const payload = response.result || {};
    if (payload.ok === false && payload.cancelled !== true) {
      const error = new Error(payload.error || "Request failed");
      error.payload = payload;
      throw error;
    }
    return payload;
  }
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_error) {
    payload = {
      error: text.trim() || `Request returned ${response.status} ${response.statusText}`,
    };
  }
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed");
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function init() {
  const [collectionsPayload, gamesPayload, emulatorsPayload, profilesPayload, recentPayload] = await Promise.all([
    api("/api/collections"),
    api("/api/games?view=all"),
    api("/api/emulators"),
    api("/api/emulator-profiles"),
    api("/api/recent"),
  ]);
  state.collections = collectionsPayload.collections;
  state.activeCollection = collectionsPayload.active;
  state.games = gamesPayload.games;
  state.emulators = emulatorsPayload.emulators;
  state.emulatorProfiles = profilesPayload.profiles || [];
  state.recentIds = new Set(recentPayload.recent.map((item) => item.game_id));
  renderLayout();
  renderTableStructure();
  renderCollections();
  renderEmulators();
  renderMetadataFilters();
  bindEvents();
  applyFilters();
  if (webHubHandoff.gameId && state.games.some((game) => game.id === webHubHandoff.gameId)) {
    await selectGame(webHubHandoff.gameId);
  }
}

function bindEvents() {
  els.search.addEventListener("input", applyFilters);
  document.addEventListener("click", hideContextMenu);
  window.addEventListener("blur", hideContextMenu);
  [els.filterPoks].forEach((input) => input.addEventListener("change", applyFilters));
  [els.filterView].forEach((select) => {
    select.addEventListener("change", applyFilters);
  });
  els.emulator.addEventListener("change", () => {
    if (state.selected) renderDetails();
  });

  els.collectionSelect.addEventListener("change", async () => {
    if (els.collectionSelect.value === ADD_COLLECTION_VALUE) {
      renderCollections();
      showAddCollectionModal();
      return;
    }
    const selected = state.collections.find((collection) => collection.id === els.collectionSelect.value);
    if (!selected || selected.available === false) {
      renderCollections();
      return;
    }
    if (selected.id === state.activeCollection?.id) {
      renderCollections();
      return;
    }
    await withBusy(`Switching to ${selected?.name || "collection"}`, "Starting index...", async () => {
      const payload = await api("/api/select-collection", {
        method: "POST",
        body: JSON.stringify({ collection_id: els.collectionSelect.value }),
      });
      await waitForJob(payload.job_id);
      state.selected = null;
      state.selectedIds.clear();
      await reloadCollections();
      await reloadGames();
    });
  });

  els.collectionSelect.addEventListener("pointerdown", refreshCollectionsForDropdown);
  els.collectionSelect.addEventListener("focus", refreshCollectionsForDropdown);

  els.clearFilters.addEventListener("click", () => {
    els.search.value = "";
    [els.filterPoks].forEach((input) => {
      input.checked = false;
    });
    state.multiFilters = {};
    state.openFilterKey = "";
    state.selectedIds.clear();
    [els.filterSystem, els.filterLanguage, els.filterCountry, els.filterYear, els.filterPublisher, els.filterTag].forEach((combo) => {
      renderFilterCombo(combo);
    });
    els.filterView.value = "";
    els.filterView.value = "all";
    applyFilters();
  });

  els.rebuild.addEventListener("click", async () => {
    await withBusy("Rebuilding Index", "Scanning the selected collection...", async () => {
      const payload = await api("/api/rebuild", { method: "POST", body: "{}" });
      await waitForJob(payload.job_id);
      await reloadGames();
    });
  });

  els.bulkEdit.addEventListener("click", handleBulkAction);
  els.importSelectTools?.addEventListener("click", handleImportSelectTools);
  els.columnOptions.addEventListener("click", showColumnOptionsModal);
  els.editEmulators.addEventListener("click", showEmulatorProfileModal);
  els.editScrapers.addEventListener("click", showScraperSettingsModal);
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
  const payload = await api("/api/games?view=all");
  state.games = payload.games;
  const validIds = new Set(state.games.map((game) => game.id));
  state.selectedIds = new Set([...state.selectedIds].filter((id) => validIds.has(id)));
  renderMetadataFilters();
  applyFilters();
  if (!state.selected) {
    await renderDetails();
  }
}

async function reloadCollections() {
  const payload = await api("/api/collections");
  state.collections = payload.collections;
  state.activeCollection = payload.active;
  renderCollections();
  renderEmulators();
}

async function refreshCollectionsForDropdown() {
  try {
    await reloadCollections();
  } catch (_error) {
    // Keep the existing dropdown usable if a refresh fails.
  }
}

function renderMetadataFilters() {
  renderFilterCombo(els.filterSystem, buildSimpleOptions("system", filteredForCounts("system")), "System", "All Systems");
  renderFilterCombo(els.filterLanguage, buildLanguageOptions(filteredForCounts("language")), "Language", "All Languages");
  renderFilterCombo(els.filterCountry, buildCountryOptions(filteredForCounts("country")), "Country", "All Countries");
  renderFilterCombo(els.filterYear, buildYearOptions(filteredForCounts("year")), "Year", "All Years");
  renderFilterCombo(els.filterPublisher, buildSimpleOptions("publisher", filteredForCounts("publisher")), "Publisher", "All Publishers");
  renderFilterCombo(els.filterTag, buildTagOptions(filteredForCounts("tag")), "Tag", "All Tags");
}

function renderFilterCombo(combo, options = null, label = "", allLabel = "") {
  const key = combo.id.replace("filter-", "");
  if (options) {
    combo.dataset.label = label;
    combo.dataset.allLabel = allLabel;
    combo._options = options;
  }
  const available = combo._options || [];
  const selected = new Set((state.multiFilters[key] || []).filter((value) => available.some((option) => option.value === value)));
  state.multiFilters[key] = [...selected];
  const buttonLabel = selected.size
    ? [...selected]
        .map((value) => available.find((option) => option.value === value)?.label || value)
        .join(", ")
    : combo.dataset.allLabel || allLabel;
  const openClass = state.openFilterKey === key ? " open" : "";
  combo.innerHTML = `
    <button type="button" class="filter-combo-button">${escapeHtml(buttonLabel)}</button>
    <div class="filter-combo-panel">
      ${available
        .map((option) => {
          const checked = selected.has(option.value) ? " checked" : "";
          const count = option.count ? ` (${option.count})` : "";
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
    checkbox.addEventListener("change", () => {
      const values = [...combo.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value);
      state.multiFilters[key] = values;
      state.openFilterKey = key;
      applyFilters();
    });
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

function renderCollections() {
  els.collectionSelect.innerHTML = [
    ...state.collections.map((collection) => {
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
  const previous = els.emulator.value;
  els.emulator.innerHTML = state.emulators
    .map((emu) => {
      const label = emu.available ? emu.name : `${emu.name} (missing)`;
      return `<option value="${escapeHtml(emu.id)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  const collectionDefault = state.activeCollection?.default_emulator || "";
  const preferred = collectionDefault || previous;
  if (preferred && state.emulators.some((emulator) => emulator.id === preferred)) {
    els.emulator.value = preferred;
  }
}

function showEmulatorProfileModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const spectrumEmulators = state.emulators.map(cloneEmulator);
  const editableEmulators = Object.fromEntries(spectrumEmulators.map((emu) => [emu.id, cloneEmulator(emu)]));
  let selectedEmulatorId = spectrumEmulators[0]?.id || "eightyone";
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
            <span>Default for ${escapeHtml(state.activeCollection?.name || "active collection")}</span>
            <select id="collection-default-emulator">
              <option value="">No default</option>
              ${spectrumEmulators.map((emu) => `<option value="${escapeHtml(emu.id)}"${state.activeCollection?.default_emulator === emu.id ? " selected" : ""}>${escapeHtml(emu.name || emu.id)}</option>`).join("")}
            </select>
          </label>
          <div id="selected-emulator-settings"></div>
          <section class="emulator-card">
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
    selectedSettings.innerHTML = emulatorProfileCard(selectedEmulatorId, emulatorDisplayName(selectedEmulatorId), emulator);
    renderManagedProfiles(overlay, selectedEmulatorId);
  };
  const syncSelectedEmulator = () => {
    const form = readEmulatorProfileForm(overlay, selectedEmulatorId);
    if (form) {
      editableEmulators[selectedEmulatorId] = { ...(editableEmulators[selectedEmulatorId] || {}), ...form };
    }
  };
  renderSelectedEmulator();
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
      });
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
          collection_id: state.activeCollection?.id || "",
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
    <label><span>System ID</span><input data-scraper-provider="screenscraper" data-scraper-field="system_id" type="text" value="${escapeHtml(provider.system_id || "135")}" placeholder="135"></label>
    <label><span>Softname</span><input data-scraper-provider="screenscraper" data-scraper-field="softname" type="text" value="${escapeHtml(provider.softname || "DesasteronSpectrumLauncher")}"></label>
    <label><span>Language</span><input data-scraper-provider="screenscraper" data-scraper-field="preferred_language" type="text" value="${escapeHtml(provider.preferred_language || "en")}" placeholder="en"></label>
    <label><span>Region</span><input data-scraper-provider="screenscraper" data-scraper-field="preferred_region" type="text" value="${escapeHtml(provider.preferred_region || "wor")}" placeholder="wor"></label>
    <label class="wide"><span>Base URL</span><input data-scraper-provider="screenscraper" data-scraper-field="base_url" type="text" value="${escapeHtml(provider.base_url || "https://api.screenscraper.fr/api2")}"></label>
    <label><span>Username</span><input data-scraper-provider="screenscraper" data-scraper-field="username" type="text" value="${escapeHtml(provider.username || "")}"></label>
    <label><span>Password${provider.has_password ? " (saved)" : ""}</span><input data-scraper-provider="screenscraper" data-scraper-field="password" type="password" value="" placeholder="${provider.has_password ? "Leave blank to keep saved password" : ""}"></label>
    <label><span>Developer ID (optional)</span><input data-scraper-provider="screenscraper" data-scraper-field="developer_id" type="text" value="${escapeHtml(provider.developer_id || "")}"></label>
    <label><span>Developer Password${provider.has_developer_password ? " (saved)" : ""} (optional)</span><input data-scraper-provider="screenscraper" data-scraper-field="developer_password" type="password" value="" placeholder="${provider.has_developer_password ? "Leave blank to keep saved password" : ""}"></label>
  `;
}

function thegamesdbSettingsFields(provider) {
  return `
    <label><span>Enabled</span><select data-scraper-provider="thegamesdb" data-scraper-field="enabled">
      <option value="true"${provider.enabled ? " selected" : ""}>Enabled</option>
      <option value="false"${provider.enabled ? "" : " selected"}>Disabled</option>
    </select></label>
    <label><span>Platform ID</span><input data-scraper-provider="thegamesdb" data-scraper-field="platform_id" type="text" value="${escapeHtml(provider.platform_id || "4913")}" placeholder="4913"></label>
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
        <label><span>Launch Adapter</span><select data-field="type"${emulator.built_in ? " disabled" : ""}>
          ${["generic", "eightyone", "spectaculator"].map((value) => `<option value="${value}"${adapter === value ? " selected" : ""}>${value}</option>`).join("")}
        </select></label>
        <label><span>Supported Extensions</span><input data-field="supported_extensions" type="text" value="${escapeHtml(extensions)}"></label>
        <label class="wide"><span>Executable Path</span>${pathPickerInput("path", emulator.path || "", "file")}</label>
        <label class="wide"><span>Working Directory</span>${pathPickerInput("working_dir", emulator.working_dir || "", "folder")}</label>
        <label class="wide"><span>Launch Arguments (JSON array)</span><textarea data-field="arguments" data-format="arguments">${escapeHtml(formatArgumentList(emulator.arguments || ["{file}"]))}</textarea></label>
        <div class="meta wide">Allowed placeholders: {file}, {file_dir}, {file_name}, {collection_root}, {pok_file}, {system}, {title}. Arguments are passed directly without a shell.</div>
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

function showAddEmulatorModal(onAdd) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal managed-profile-modal">
      <h2>Add Emulator</h2>
      <p>Create a native-only emulator definition. You can configure profiles after saving it.</p>
      <div class="profile-edit-grid">
        <label><span>ID</span><input id="add-emulator-id" type="text" placeholder="snes9x"></label>
        <label><span>Name</span><input id="add-emulator-name" type="text" placeholder="Snes9x"></label>
        <label><span>Launch Adapter</span><select id="add-emulator-type"><option value="generic">generic</option><option value="eightyone">eightyone</option><option value="spectaculator">spectaculator</option></select></label>
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
      arguments: ["{file}"],
      built_in: false,
    });
    overlay.remove();
  });
}

function applyFilters() {
  renderMetadataFilters();
  renderViewOptions();
  state.filtered = state.games.filter((game) => matchesActiveFilters(game));
  sortFilteredGames();
  renderList();
  renderCounts();
  updateSortHeaders();
}

function matchesActiveFilters(game, excludeKey = "") {
  const query = els.search.value.trim().toLowerCase();
  const systemFilter = selectedFilterValues("system");
  const languageFilter = selectedFilterValues("language");
  const countryFilter = selectedFilterValues("country");
  const yearFilter = selectedFilterValues("year");
  const publisherFilter = selectedFilterValues("publisher");
  const tagFilter = selectedFilterValues("tag");
  const viewFilter = els.filterView.value || "all";
  if (query && !matchesQuery(game, query)) return false;
  if (excludeKey !== "system" && systemFilter.length && !systemFilter.includes(game.system)) return false;
  if (excludeKey !== "language" && languageFilter.length && !intersects(gameLanguageCodes(game), languageFilter)) return false;
  if (excludeKey !== "country" && countryFilter.length && !intersects(game.countries || [], countryFilter)) return false;
  if (excludeKey !== "year" && yearFilter.length && !yearFilter.includes(gameYear(game))) return false;
  if (excludeKey !== "publisher" && publisherFilter.length && !publisherFilter.includes(game.publisher)) return false;
  if (excludeKey !== "tag" && tagFilter.length && !intersects(gameTags(game), tagFilter)) return false;
  if (els.filterPoks.checked && !game.has_poks) return false;
  if (excludeKey === "view") return true;
  if (viewFilter === "all" && ["incoming", "trash"].includes(game.view)) return false;
  if (viewFilter === "favourites" && !game.favourite) return false;
  if (viewFilter === "recent" && !state.recentIds.has(game.id)) return false;
  if (viewFilter === "incoming" && game.view !== "incoming") return false;
  if (viewFilter === "trash" && game.view !== "trash") return false;
  return true;
}

function filteredForCounts(excludeKey) {
  return state.games.filter((game) => matchesActiveFilters(game, excludeKey));
}

function selectedFilterValues(key) {
  return state.multiFilters[key] || [];
}

function intersects(values, filters) {
  return values.some((value) => filters.includes(value));
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
  if (key === "year") return gameYear(game);
  if (key === "system") return game.system || game.memory || "";
  if (key === "tag") return gameTags(game).join(" ");
  if (key === "language") return formatLanguageCodes(game);
  if (key === "country") return formatCountryCodes(game.countries || []);
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
  els.bulkEdit.disabled = !selectedCount || !state.activeCollection?.writable;
  const visibleIds = state.filtered.map((game) => game.id);
  const checkedVisible = visibleIds.filter((id) => state.selectedIds.has(id)).length;
  if (els.selectVisible) {
    els.selectVisible.checked = visibleIds.length > 0 && checkedVisible === visibleIds.length;
    els.selectVisible.indeterminate = checkedVisible > 0 && checkedVisible < visibleIds.length;
  }
  renderImportSelectTools();
  const bits = [];
  if (els.search.value.trim()) bits.push(`search "${els.search.value.trim()}"`);
  if (els.filterPoks.checked) bits.push("POKs");
  if (els.filterView.value === "favourites") bits.push("favourites");
  if (els.filterView.value === "recent") bits.push("recent");
  if (els.filterView.value === "incoming") bits.push("incoming");
  if (els.filterView.value === "trash") bits.push("bin");
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
  const favouriteAddGames = games.filter((game) => !game.favourite);
  const favouriteRemoveGames = games.filter((game) => game.favourite);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h2>Bulk Actions</h2>
      <p>${games.length.toLocaleString()} collection game${games.length === 1 ? "" : "s"} selected.</p>
      <div class="modal-actions">
        <button data-action="metadata">Edit Metadata</button>
        <button class="secondary" data-action="favourite-add" ${favouriteAddGames.length ? "" : "disabled"}>Add to Favourites (${favouriteAddGames.length.toLocaleString()})</button>
        <button class="secondary" data-action="favourite-remove" ${favouriteRemoveGames.length ? "" : "disabled"}>Remove from Favourites (${favouriteRemoveGames.length.toLocaleString()})</button>
        <button class="secondary danger-text" data-action="delete">Delete Selected</button>
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
    if (action === "metadata") {
      overlay.remove();
      showMetadataModal(games.map((game) => game.id), true);
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
  let deleted = 0;
  const errors = [];
  for (const [index, game] of games.entries()) {
    els.busyMessage.textContent = `Moving ${index + 1} of ${games.length.toLocaleString()} games to bin...`;
    setBusyProgress((index / games.length) * 100);
    try {
      await api("/api/delete", {
        method: "POST",
        body: JSON.stringify({ game_id: game.id }),
      });
      deleted += 1;
    } catch (error) {
      errors.push(`${game.file_name}: ${error.message}`);
    }
    setBusyProgress(((index + 1) / games.length) * 100);
  }
  if (errors.length) throw new Error(`Moved ${deleted}, failed ${errors.length}. ${errors.slice(0, 3).join(" ")}`);
  return `Moved ${deleted} game${deleted === 1 ? "" : "s"} to bin.`;
}

async function bulkSetFavourite(games, favourite) {
  let updated = 0;
  const errors = [];
  for (const [index, game] of games.entries()) {
    els.busyMessage.textContent = `${favourite ? "Adding" : "Removing"} ${index + 1} of ${games.length.toLocaleString()} favourites...`;
    setBusyProgress((index / games.length) * 100);
    try {
      const payload = await api("/api/favourite", {
        method: "POST",
        body: JSON.stringify({ game_id: game.id, favourite }),
      });
      const changed = payload.game || { ...game, favourite };
      const gameIndex = state.games.findIndex((item) => item.id === game.id);
      if (gameIndex !== -1) state.games[gameIndex] = changed;
      updated += 1;
    } catch (error) {
      errors.push(`${game.file_name}: ${error.message}`);
    }
    setBusyProgress(((index + 1) / games.length) * 100);
  }
  if (errors.length) throw new Error(`Updated ${updated}, failed ${errors.length}. ${errors.slice(0, 3).join(" ")}`);
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
  let deleted = 0;
  const errors = [];
  for (const [index, game] of games.entries()) {
    els.busyMessage.textContent = `Moving ${index + 1} of ${games.length.toLocaleString()} incoming files to bin...`;
    setBusyProgress((index / games.length) * 100);
    try {
      await api("/api/delete", {
        method: "POST",
        body: JSON.stringify({ game_id: game.id }),
      });
      deleted += 1;
    } catch (error) {
      errors.push(`${game.file_name}: ${error.message}`);
    }
    setBusyProgress(((index + 1) / games.length) * 100);
  }
  if (errors.length) throw new Error(`Deleted ${deleted}, failed ${errors.length}. ${errors.slice(0, 3).join(" ")}`);
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
  return selectedFilterValues(key).map((value) => names?.[value] || value);
}

function selectedGameList() {
  return [...state.selectedIds].map((id) => state.games.find((game) => game.id === id)).filter(Boolean);
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
  return `<div class="title-cell"><span class="title-text">${escapeHtml(game.title)}</span>${flags}</div>`;
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
  state.selected = state.games.find((game) => game.id === id);
  applyGameDefaultEmulator(state.selected);
  updateSelectedRow(previousId, id);
  await renderDetails();
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
  const game = state.selected;
  if (!game) {
    els.details.innerHTML = message
      ? `<div class="empty-state">${escapeHtml(message)}</div>`
      : '<div class="empty-state">Select a game</div>';
    return;
  }
  const renderId = game.id;
  await prepareArtworkAssets([game.screenshot, game.loading_screen]);
  const poks = game.has_poks ? (await api(`/api/poks?game_id=${encodeURIComponent(game.id)}`)).poks : [];
  if (state.selected?.id !== renderId) return;
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
      <button id="launch">Launch Game</button>
      <button id="send-webhub" class="secondary">${webHubHandoff.rebindGameKey ? "Update WebHub Shortcut" : "Send to WebHub"}</button>
      <button id="favourite" class="secondary">${game.favourite ? "Remove Favourite" : "Add Favourite"}</button>
      <button id="scrape-metadata" class="secondary">Scrape Metadata</button>
    </div>
    ${renderScrapedMetadata(game)}
    ${renderLaunchMeta(game)}
    <h2 class="section-heading">POKs</h2>
    ${renderPoks(poks)}
    ${message ? `<div class="message ${isError ? "error" : ""}">${escapeHtml(message)}</div>` : ""}
  `;
  document.querySelector("#launch").addEventListener("click", launchSelected);
  document.querySelector("#send-webhub").addEventListener("click", sendSelectedToWebHub);
  document.querySelector("#favourite").addEventListener("click", toggleFavourite);
  document.querySelector("#scrape-metadata").addEventListener("click", showScrapePreviewModal);
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
    ["Platform", game.platform],
    ["Region", game.region],
    ["Players", game.players],
    ["Co-op", game.coop],
    ["Rating", game.rating],
  ].filter(([, value]) => value);
  const description = String(game.description || "").trim();
  const assets = [
    ["Screenshot", game.screenshot],
    ["Loading", game.loading_screen],
  ].filter(([, value]) => value);
  if (!fields.length && !description && !assets.length) return "";
  return `
    <h2 class="section-heading">Metadata</h2>
    <div class="scraped-meta">
      ${renderArtworkPanel(assets)}
      ${fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
      ${description ? `<div class="description-box"><span>Description</span><p>${escapeHtml(description)}</p></div>` : ""}
        ${assets.length ? `<div class="asset-list">${assets.map(([label, value]) => `<span class="pill asset-pill" title="${escapeHtml(value)}">${escapeHtml(label)}</span>`).join("")}</div>` : ""}
      </div>
    `;
  }

function renderArtworkPanel(assets) {
  if (!assets.length) return "";
  return `
    <div class="artwork-panel">
      ${assets.map(([label, value]) => `
        <figure class="artwork-card">
          <img src="${escapeHtml(assetDisplayUrl(value))}" alt="${escapeHtml(label)}" loading="lazy" onerror="this.closest('.artwork-card').classList.add('image-missing')">
          <figcaption>${escapeHtml(label)}</figcaption>
        </figure>
      `).join("")}
    </div>
  `;
}

function assetDisplayUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("http://") || text.startsWith("https://")) return text;
  if (usesExtensionTransport) return extensionAssetCache.get(text) || "";
  return `/api/asset?path=${encodeURIComponent(text)}`;
}

async function prepareArtworkAssets(values) {
  if (!usesExtensionTransport) return;
  const missing = [...new Set((values || []).map((value) => String(value || "").trim())
    .filter((value) => value && !/^https?:\/\//i.test(value) && !extensionAssetCache.has(value)))];
  await Promise.all(missing.map(async value => {
    try {
      const response = await requestWebHub("MW_EMUGUI_ASSET", { path: value });
      extensionAssetCache.set(value, String(response.asset?.dataUrl || ""));
    } catch (_error) {
      extensionAssetCache.set(value, "");
    }
  }));
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

function resolveLaunchBinding(game) {
  const emulatorId = game.default_emulator || els.emulator.value || "";
  const pinnedProfile = game.emulator_profile
    ? state.emulatorProfiles.find((profile) => profile.id === game.emulator_profile && (!emulatorId || profile.emulator_id === emulatorId))
    : null;
  const profile = pinnedProfile || automaticProfileForGame(emulatorId, game);
  return { emulatorId, profileId: profile?.id || "" };
}

async function sendSelectedToWebHub() {
  const game = state.selected;
  if (!game) return;
  const binding = resolveLaunchBinding(game);
  try {
    await renderDetails("Sending game shortcut to WebHub...");
    const result = await requestWebHub("MW_EMUGUI_SEND_GAME", {
      gameId: game.id,
      emulatorId: binding.emulatorId,
      profileId: binding.profileId,
      rebindGameKey: webHubHandoff.rebindGameKey,
      deliveryId: `emugui-game-${game.id}-${Date.now()}`
    });
    if (webHubHandoff.rebindGameKey) {
      webHubHandoff.rebindGameKey = "";
      const url = new URL(window.location.href);
      url.searchParams.delete("hubRebind");
      window.history.replaceState(null, "", url);
      await renderDetails(`Updated the existing WebHub shortcut${result.persisted ? ` (${result.persisted})` : ""}.`);
    } else {
      await renderDetails(`Sent to WebHub Inbox${result.persisted ? ` (${result.persisted})` : ""}.`);
    }
  } catch (error) {
    await renderDetails(error.message || "The game could not be sent to WebHub.", true);
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

async function runLaunchChoice(choice) {
  try {
    const result = await launchGame(choice);
    await refreshRecentAfterLaunch();
    await renderDetails(launchMessage(result));
  } catch (error) {
    await renderDetails(error.message, true);
  }
}

async function launchGame(launchAction, emulator = els.emulator.value) {
  return api("/api/launch", {
    method: "POST",
    body: JSON.stringify({
      game_id: state.selected.id,
      emulator,
      launch_action: launchAction,
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
  const visibility = {};
  const widths = {};
  const order = rows.map((row) => row.dataset.column);
  rows.forEach((row) => {
    const key = row.dataset.column;
    visibility[key] = row.querySelector("[data-column-visible]").checked;
    widths[key] = Math.max(48, Math.min(640, Number(row.querySelector("[data-column-width]").value) || columnWidth(key)));
  });
  if (!Object.values(visibility).some(Boolean)) {
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
  if (!column) return "";
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

function showContextMenu(event, gameId) {
  event.preventDefault();
  hideContextMenu();
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;
  const previousId = state.selected?.id;
  state.selected = game;
  applyGameDefaultEmulator(game);
  updateSelectedRow(previousId, gameId);
  renderDetails();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  const isIncoming = game.view === "incoming";
  const isTrash = game.view === "trash";
  const editButtons = state.activeCollection?.writable && !isIncoming && !isTrash
    ? `
      <button data-action="metadata">Edit Metadata</button>
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
  const emulatorButtons = state.emulators
    .filter((emu) => emu.available)
    .map(
      (emu) =>
        `<button data-action="launch" data-emulator="${escapeHtml(emu.id)}">Open with ${escapeHtml(emu.name)}</button>`,
    )
    .join("");
  menu.innerHTML = `
    <div class="context-section">
      ${emulatorButtons}
      <button data-action="send-webhub">${webHubHandoff.rebindGameKey ? "Update WebHub Shortcut" : "Send to WebHub"}</button>
    </div>
    <div class="context-section">
      <button data-action="explorer">Open in Explorer</button>
      ${importButton}
      ${trashButtons}
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
    if (action === "rename") {
      await renameSelected();
      return;
    }
    if (action === "metadata") {
      showMetadataModal([state.selected.id], false);
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
        await runLaunchChoice(choice);
      }
      return;
    }
    await renderDetails(error.message, true);
  }
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

async function showScrapePreviewModal() {
  const game = state.selected;
  if (!game) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal scrape-modal">
      <div class="scrape-modal-header">
        <h2>${escapeHtml(game.title)}</h2>
        <span class="scrape-provider-label">Provider</span>
        <select id="scrape-provider"></select>
      </div>
      <div id="scrape-preview-content" class="scrape-preview-content">Loading providers...</div>
      <div class="modal-actions sticky-actions">
        <button data-action="apply" disabled>Apply Selected</button>
        <button class="secondary" data-action="cancel">Close</button>
      </div>
      <div class="message error" id="scrape-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const providerSelect = overlay.querySelector("#scrape-provider");
  const errorBox = overlay.querySelector("#scrape-error");
  const previewBox = overlay.querySelector("#scrape-preview-content");
  const applyButton = overlay.querySelector('[data-action="apply"]');
  let currentPreview = null;
  const loadProviders = async () => {
    const payload = await api("/api/scrapers");
    providerSelect.innerHTML = payload.providers
      .map((provider) => {
        const label = provider.configured ? provider.name : `${provider.name} (not configured)`;
        return `<option value="${escapeHtml(provider.id)}">${escapeHtml(label)}</option>`;
      })
      .join("");
  };
  const loadPreview = async () => {
    errorBox.textContent = "";
    previewBox.innerHTML = '<div class="meta">Looking up metadata...</div>';
    try {
      const payload = await api("/api/scrape-preview", {
        method: "POST",
        body: JSON.stringify({ game_id: game.id, provider: providerSelect.value || "manual" }),
      });
      currentPreview = payload;
      previewBox.innerHTML = renderScrapePreview(payload);
      const firstChoice = previewBox.querySelector("[data-scrape-match]");
      if (firstChoice) firstChoice.checked = true;
      applyButton.disabled = !firstChoice;
    } catch (error) {
      currentPreview = null;
      applyButton.disabled = true;
      previewBox.innerHTML = "";
      errorBox.textContent = error.message;
    }
  };
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
    if (button.dataset.action === "apply") {
      await applySelectedScrapeMatch(overlay, game, currentPreview);
    }
  });
  previewBox.addEventListener("change", (event) => {
    if (event.target.closest("[data-scrape-match]")) {
      applyButton.disabled = false;
    }
  });
  providerSelect.addEventListener("change", loadPreview);
  try {
    await loadProviders();
    await loadPreview();
  } catch (error) {
    previewBox.innerHTML = "";
    errorBox.textContent = error.message;
  }
}

function renderScrapePreview(payload) {
  const matches = payload.matches || [];
  const warnings = payload.warnings || [];
  const header = warnings.length
    ? `<div class="preview-summary">${warnings.map((warning) => `<div class="warning-line">${escapeHtml(warning)}</div>`).join("")}</div>`
    : "";
  if (!matches.length) return `${header}<div class="meta">No matches found.</div>`;
  return header + matches.map((match, index) => {
    const candidate = match.candidate || {};
    const remoteAssets = match.remote_assets || {};
    const confidence = Number(match.confidence || 0);
    const fields = [
      ["Title", `${candidate.title || ""}${candidate.title ? ` (${confidence}%)` : ""}`],
      ["Year", candidate.year],
      ["Publisher", candidate.publisher],
      ["Developer", candidate.developer],
      ["Genre", candidate.genre],
      ["Platform", candidate.platform],
      ["Region", candidate.region],
      ["Players", candidate.players],
      ["Co-op", candidate.coop],
      ["Rating", candidate.rating],
      ["Scraper ID", candidate.scraper_id],
    ].filter(([, value]) => value);
    return `
      <div class="scrape-match">
        <div class="scrape-match-body">
          <label class="scrape-choice" title="Select this match">
            <input type="radio" name="scrape-match" data-scrape-match="${index}" ${index === 0 ? "checked" : ""}>
          </label>
          ${renderScrapeImages(remoteAssets, candidate)}
          <div>
            <div class="preview-grid">
              ${fields.map(([label, value]) => `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`).join("")}
              ${candidate.description ? `<span>Description</span><strong>${escapeHtml(candidate.description)}</strong>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderScrapeImages(remoteAssets, candidate) {
  const images = [
    ["Boxart", remoteAssets.loading_screen],
    ["Screenshot", remoteAssets.screenshot],
  ].filter(([, value]) => value);
  if (!images.length) return '<div class="scrape-image-stack"><div class="scrape-preview-image empty">No image</div></div>';
  return `
    <div class="scrape-image-stack">
      ${images.map(([label, value]) => `
        <figure class="scrape-preview-image">
          <img src="${escapeHtml(value)}" alt="${escapeHtml(`${candidate.title || "Scrape"} ${label}`)}">
        </figure>
      `).join("")}
    </div>
  `;
}

async function applySelectedScrapeMatch(overlay, game, preview) {
  const errorBox = overlay.querySelector("#scrape-error");
  const selected = overlay.querySelector("[data-scrape-match]:checked");
  const match = selected && preview?.matches?.[Number(selected.dataset.scrapeMatch)];
  if (!match) {
    errorBox.textContent = "Select a scrape match first.";
    return;
  }
  try {
    errorBox.textContent = "";
    const result = await withBusy("Applying Metadata", `Updating ${game.title}...`, async () => {
      const payload = await api("/api/apply-scrape", {
        method: "POST",
        body: JSON.stringify({
          game_id: game.id,
          candidate: match.candidate || {},
          assets: match.assets || {},
          remote_assets: match.remote_assets || {},
        }),
      });
      await reloadGames();
      return payload;
    });
    const updated = result.game || state.games.find((item) => item.id === game.id);
    if (updated) state.selected = updated;
    overlay.remove();
    await renderDetails(`Applied metadata from ${match.candidate?.scraper_source || preview.provider?.name || "provider"}.`);
  } catch (error) {
    errorBox.textContent = error.message;
  }
}

function showMetadataModal(gameIds, isBulk) {
  if (!state.activeCollection?.writable) return;
  const games = gameIds.map((id) => state.games.find((game) => game.id === id)).filter(Boolean);
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
    try {
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

async function toggleFavourite() {
  const game = state.selected;
  const favourite = !game.favourite;
  const payload = await api("/api/favourite", {
    method: "POST",
    body: JSON.stringify({ game_id: game.id, favourite }),
  });
  const updated = payload.game || { ...game, favourite };
  const index = state.games.findIndex((item) => item.id === game.id);
  if (index !== -1) {
    state.games[index] = updated;
  }
  state.selected = updated;
  applyFilters();
  await renderDetails();
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
  document.body.innerHTML = `<pre>${escapeHtml(error.stack || error.message)}</pre>`;
});
