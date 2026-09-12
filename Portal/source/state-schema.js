// Persisted-state versioning and non-destructive structural repair.

const CURRENT_STATE_SCHEMA_VERSION = 7;
const MIN_STATE_MIGRATION_SCHEMA_VERSION = 0;

function collectReferencedBoardIds(items) {
  const ids = new Set();
  for (const item of (items || [])) {
    if (item.type === 'board' && item.boardId) ids.add(item.boardId);
    if (item.children) for (const id of collectReferencedBoardIds(item.children)) ids.add(id);
  }
  return ids;
}

function repairOrphanedBoardNavItems(parsed) {
  if (!Array.isArray(parsed.navItems)) parsed.navItems = [];
  const referencedIds = collectReferencedBoardIds(parsed.navItems);
  const usedNavIds = new Set();
  const collectNavIds = items => (items || []).forEach(item => {
    if (item?.id) usedNavIds.add(item.id);
    if (item?.children) collectNavIds(item.children);
  });
  collectNavIds(parsed.navItems);
  for (const board of (parsed.boards || [])) {
    if (!board?.id || referencedIds.has(board.id)) continue;
    let navId = `nav-${board.id}`;
    let suffix = 2;
    while (usedNavIds.has(navId)) navId = `nav-${board.id}-${suffix++}`;
    parsed.navItems.push({
      id: navId,
      type: 'board',
      title: board.title || 'Recovered Board',
      boardId: board.id
    });
    usedNavIds.add(navId);
    referencedIds.add(board.id);
  }
}

function migrateStateSchema(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid Portal database');
  const source = parsed.schemaVersion === undefined ? 0 : parsed.schemaVersion;
  if (!Number.isInteger(source) || source < MIN_STATE_MIGRATION_SCHEMA_VERSION || source > CURRENT_STATE_SCHEMA_VERSION) {
    throw new Error(`Portal state schema ${source} is unsupported. Update Portal before opening this database.`);
  }
  if (source < CURRENT_STATE_SCHEMA_VERSION) upgradePortalState(parsed);
  parsed.schemaVersion = CURRENT_STATE_SCHEMA_VERSION;
  return parsed;
}

function upgradePortalState(parsed) {
  // Baseline: unversioned and schemas 1–6. This runs only at load/import.
  for (const [index, board] of (parsed.boards || []).entries()) {
    const id = board.id || `board-upgrade-${index}`;
    if (!Array.isArray(board.tabs)) board.tabs = [{
      id: board.tabId || `${id}-tab-1`, title: board.tabTitle || board.title || 'Home',
      columnCount: board.columnCount, backgroundImage: board.backgroundImage,
      backgroundFit: board.backgroundFit, containerOpacity: board.containerOpacity,
      sharedTags: board.sharedTags, tags: board.tags, columns: board.columns,
      inbox: board.inbox, locked: board.locked
    }];
    for (const tab of board.tabs) {
      const oldInbox = (tab.columns || []).find(column => column.isInbox);
      if (!tab.inbox && oldInbox) tab.inbox = oldInbox;
      tab.columns = (tab.columns || []).filter(column => !column.isInbox);
    }
    for (const field of ['columns', 'inbox', 'columnCount', 'backgroundImage', 'backgroundFit', 'containerOpacity', 'tabId', 'tabTitle']) delete board[field];
  }
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value.type === 'divider' && !value.children) { value.type = 'title'; value.title = ''; }
    if (value.type === 'folder') {
      if (value.labels && !value.tags) value.tags = value.labels;
      if (!value.folderMode && value.mode) value.folderMode = value.mode;
      delete value.labels;
      delete value.mode;
    }
    Object.values(value).forEach(visit);
  };
  visit(parsed);
  parsed.importManager = normalizeImportManagerState(parsed.importManager);
  parsed.boards = (parsed.boards || []).map(normalizeBoardRecord);
  const legacyImportBoard = parsed.boards.find(board => board?.isImportManager);
  if (legacyImportBoard) {
    const legacyItems = [];
    for (const tab of getBoardTabs(legacyImportBoard)) {
    for (const col of (tab.columns || [])) {
      if (!col?.isInbox && Array.isArray(col.items) && col.items.length) legacyItems.push(...cloneData(col.items));
    }
    }
    if (legacyItems.length) {
    stripTransientItemLocks(legacyItems);
    parsed.importManager.items.push(...legacyItems);
    if (!parsed.importManager.lastImportedAt) parsed.importManager.lastImportedAt = new Date().toISOString();
    }
  }

  for (const board of parsed.boards) delete board.isImportManager;
  if (!parsed.hubName || parsed.hubName === 'Morpheus WebHub') parsed.hubName = 'Cyrune Portal';
  parsed.settings = { ...defaultSettings, ...(parsed.settings || {}) };
  migrateStyleSettings(parsed.settings);
  migrateThemeStyleProfiles(parsed.settings);
  migrateServiceApiKeys(parsed.settings);
  migrateWidgetServiceSettings(parsed);
  migrateToIdTags(parsed);
  stripLegacySharedTagToggleFields(parsed);
}

function migrateStyleSettings(settings) {
  if (!settings.styleOverrides) settings.styleOverrides = cloneData(defaultSettings.styleOverrides);
  else settings.styleOverrides = { ...defaultSettings.styleOverrides, ...settings.styleOverrides };
  if (settings.showBookmarkTags === undefined) settings.showBookmarkTags = settings.showTags !== false;
  if (settings.showFolderTags === undefined) settings.showFolderTags = settings.showTags !== false;
  if (settings.styleOverridesMigrated) return;

  const differs = (key, fallback) => settings[key] !== undefined && settings[key] !== fallback;
  settings.styleOverrides.hubName = differs('hubNameFontSize', 18) || !!settings.hubNameFontFamily || !!settings.hubNameBold || !!settings.hubNameItalic || !!settings.hubNameUnderline || differs('hubNameTextAlign', 'left') || !!settings.hubNameColor;
  settings.styleOverrides.boardTitle = differs('boardTitleFontSize', 22) || !!settings.boardTitleFontFamily || !!settings.boardTitleBold || !!settings.boardTitleItalic || !!settings.boardTitleUnderline || differs('boardTitleTextAlign', 'left') || !!settings.boardTitleColor;
  settings.styleOverrides.board = differs('boardFontSize', 14) || !!settings.boardFontFamily || !!settings.boardBold || !!settings.boardItalic || !!settings.boardUnderline || differs('boardTextAlign', 'left') || !!settings.boardColor;
  settings.styleOverrides.bookmark = differs('bookmarkFontSize', 14) || !!settings.bookmarkFontFamily || !!settings.bookmarkBold || !!settings.bookmarkItalic || !!settings.bookmarkUnderline || differs('bookmarkTextAlign', 'left') || !!settings.bookmarkColor;
  settings.styleOverrides.folder = differs('folderFontSize', 15) || !!settings.folderFontFamily || !!settings.folderBold || !!settings.folderItalic || !!settings.folderUnderline || differs('folderTextAlign', 'left') || !!settings.folderColor;
  settings.styleOverrides.title = differs('titleFontSize', 12) || differs('titleLineThickness', 1) || !!settings.titleLineColor || differs('titleLineStyle', 'solid') || !!settings.titleFontFamily || !!settings.titleBold || !!settings.titleItalic || !!settings.titleUnderline || !!settings.titleColor;
  settings.styleOverridesMigrated = true;
}


function buildLegacyThemeStyleSettings(settings) {
  const legacy = {};
  THEME_STYLE_SETTING_KEYS.forEach(key => {
    if (key === 'styleOverrides') {
      legacy.styleOverrides = cloneData(settings.styleOverrides || defaultThemeStyleSettings.styleOverrides);
      return;
    }
    if (settings[key] !== undefined) legacy[key] = cloneData(settings[key]);
  });
  return normalizeThemeStyleSettings(legacy);
}


function migrateThemeStyleProfiles(settings) {
  const rawProfiles = settings.themeStyleProfiles && typeof settings.themeStyleProfiles === 'object' && !Array.isArray(settings.themeStyleProfiles)
    ? settings.themeStyleProfiles
    : {};
  const normalizedProfiles = {};
  Object.entries(rawProfiles).forEach(([themeId, profile]) => {
    if (typeof themeId !== 'string' || !themeId.trim()) return;
    normalizedProfiles[themeId] = normalizeThemeStyleSettings(profile);
  });
  settings.themeStyleProfiles = normalizedProfiles;

  const requestedTheme = settings.activeThemeName || defaultSettings.activeThemeName;
  const activeThemeId = (settings.customThemes || []).some(theme => theme.id === requestedTheme) ? requestedTheme : getResolvedThemeId(requestedTheme);
  const activeProfile = settings.themeStyleProfiles[activeThemeId];
  if (!settings.themeStyleProfilesMigrated || !activeProfile) {
    const legacyProfile = buildLegacyThemeStyleSettings(settings);
    settings.themeStyleProfiles[activeThemeId] = normalizeThemeStyleSettings({
      ...(activeProfile || {}),
      ...legacyProfile,
      styleOverrides: {
        ...(activeProfile?.styleOverrides || {}),
        ...(legacyProfile.styleOverrides || {})
      }
    });
  }
  settings.themeStyleProfilesMigrated = true;
}

function migrateWidgetServiceSettings(parsed) {
  const serviceKeys = parsed.settings?.serviceApiKeys;
  if (!serviceKeys) return;

  const visitItem = item => {
    if (!item) return;
    if (item.type === 'widget' && item.widgetType === 'nasaApod' && item.config && typeof item.config === 'object') {
      const oldKey = typeof item.config.apiKey === 'string' ? item.config.apiKey.trim() : '';
      if (oldKey && !serviceKeys.nasa) serviceKeys.nasa = oldKey;
      delete item.config.apiKey;
      if (item.data?.apodCache && typeof item.data.apodCache === 'object') {
        delete item.data.apodCache.apiKey;
      }
    }
    if (item.children) item.children.forEach(visitItem);
  };

  (parsed.essentials || []).forEach(visitItem);
  (parsed.navItems || []).forEach(visitItem);
  for (const board of (parsed.boards || [])) {
    for (const tab of getBoardTabs(board)) {
      for (const col of (tab.columns || [])) {
        (col.items || []).forEach(visitItem);
      }
      (getBoardInbox(board, tab)?.items || []).forEach(visitItem);
    }
  }
}


function migrateToIdTags(parsed) {
  if (Array.isArray(parsed.tags)) return; // already migrated

  parsed.tags = [];
  const nameToId = new Map();
  let seq = 0;
  const ts = Date.now();

  function findGroupId(name) {
    for (const g of (parsed.settings?.tagGroups || [])) {
      if ((g.tags || []).includes(name)) return g.id;
    }
    return null;
  }

  function getOrCreate(name) {
    if (nameToId.has(name)) return nameToId.get(name);
    const id = `tag-${ts}-${seq++}`;
    const color = parsed.settings?.tagColors?.[name] || null;
    parsed.tags.push({ id, name, groupId: findGroupId(name), color });
    nameToId.set(name, id);
    return id;
  }

  function migrateItemTags(item) {
    if (!item) return;
    if (Array.isArray(item.tags))       item.tags       = item.tags.map(t => getOrCreate(t));
    if (Array.isArray(item.sharedTags)) item.sharedTags = item.sharedTags.map(t => getOrCreate(t));
    if (item.children) item.children.forEach(migrateItemTags);
  }

  for (const board of (parsed.boards || [])) {
    migrateItemTags(board);
    (board.speedDial || []).forEach(migrateItemTags);
    for (const tab of getBoardTabs(board)) {
      for (const col of (tab.columns || [])) col.items.forEach(migrateItemTags);
      (getTabInbox(tab, tab.id)?.items || []).forEach(migrateItemTags);
    }
  }
  (parsed.navItems  || []).forEach(migrateItemTags);
  (parsed.essentials|| []).forEach(migrateItemTags);
  (parsed.sets || []).forEach(set => (set.items || []).forEach(migrateItemTags));
  (parsed.importManager?.items || []).forEach(migrateItemTags);

  for (const g of (parsed.settings?.tagGroups || [])) delete g.tags;
  if (parsed.settings) delete parsed.settings.tagColors;
}
