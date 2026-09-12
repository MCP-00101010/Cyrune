const APP_VERSION = '0.12.22';
const PORTAL_UI_TEXT = Object.freeze({
  readOnlyCached: 'Read-only: reconnect Cyrune Relay to edit Portal data. The last authoritative cache remains available for viewing and export.',
  readOnlyIncompatible: 'Read-only: Cyrune Relay is incompatible or outdated. Reload the temporary extension from this checkout, then reload Portal.',
  authorityRecovered: 'Cyrune Relay is available again. Reloaded the authoritative Portal data.'
});

document.documentElement.classList.add('hub-booting');

const sidebarVersionEl = document.getElementById('aboutBtn');
const aboutVersionEl = document.getElementById('aboutVersionLine');
if (sidebarVersionEl) sidebarVersionEl.textContent = `v${APP_VERSION}`;
if (aboutVersionEl) aboutVersionEl.textContent = `Version ${APP_VERSION}`;

let activeModal = null;
let contextTarget = null;
let lastActiveColumnId = null;

let confirmCallback = null;
let confirmCancelCallback = null;
let confirmPreferenceSettingKey = null;
const SHARED_DISK_POLL_MS = 5000;
const SHARED_DISK_NOTICE_KEY = 'morpheus-shared-disk-notice';
let sharedStoragePollTimer = null;
let sharedDiskReloadPromptOpen = false;
let sharedDiskDataReloadInProgress = false;
let sharedRecoveryCheckInProgress = false;
let lastBridgeNativeReady = false;
let lastBridgeRecoveryPath = '';
let relayHasConnected = false;
let relayWasUnavailable = false;
let hubInitializationPromise = null;
let portalReadOnlyMode = false;
let portalReadOnlySnapshot = '';

function authoritativePortalStorageReady() {
  return typeof bridge !== 'undefined' && bridge.storageIsAvailable?.() === true;
}

function getPortalReadOnlyMessage() {
  const diagnostics = typeof bridge !== 'undefined' ? bridge.getDiagnostics?.() : null;
  const error = `${diagnostics?.relayError || ''} ${diagnostics?.bridgeError || ''}`.trim();
  if (/incompatible|outdated|protocol/i.test(error)) {
    return PORTAL_UI_TEXT.readOnlyIncompatible;
  }
  return PORTAL_UI_TEXT.readOnlyCached;
}

function getPortalCachedSnapshot() {
  if (typeof lastAuthoritativeSnapshot === 'string' && lastAuthoritativeSnapshot) return lastAuthoritativeSnapshot;
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

function setPortalReadOnlyMode(enabled, message = '') {
  portalReadOnlyMode = enabled === true;
  document.documentElement.classList.toggle('portal-readonly', portalReadOnlyMode);
  let banner = document.getElementById('portalReadOnlyBanner');
  if (portalReadOnlyMode) {
    portalReadOnlySnapshot = getPortalCachedSnapshot()
      || (typeof serializeStateSnapshot === 'function' ? serializeStateSnapshot() : JSON.stringify(state || {}));
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'portalReadOnlyBanner';
      banner.className = 'portal-readonly-banner';
      banner.setAttribute('role', 'status');
      document.body.appendChild(banner);
    }
    banner.textContent = message || getPortalReadOnlyMessage();
  } else {
    portalReadOnlySnapshot = '';
    banner?.remove();
  }
}

// --- Undo / redo ---

const MAX_UNDO = 50;
const MAX_UNDO_BYTES = 8 * 1024 * 1024;
let undoStack = [];
let redoStack = [];
let undoStackBytes = 0;
let redoStackBytes = 0;

function trimHistoryStack(stack, byteTotal) {
  while (stack.length > MAX_UNDO || (byteTotal > MAX_UNDO_BYTES && stack.length > 1)) {
    byteTotal -= stack.shift().length * 2;
  }
  return Math.max(0, byteTotal);
}

// --- Bulk selection ---

let selectedItemIds = new Set();
let selectionContext = null;

function toggleItemSelection(itemId, itemEl, context = 'board') {
  if (selectionContext && selectionContext !== context) clearSelection();
  selectionContext = context;
  if (selectedItemIds.has(itemId)) {
    selectedItemIds.delete(itemId);
    itemEl?.classList.remove('selected');
  } else {
    selectedItemIds.add(itemId);
    itemEl?.classList.add('selected');
  }
  if (selectedItemIds.size === 0) selectionContext = null;
  updateBulkToolbar();
}

function clearSelection() {
  selectedItemIds.clear();
  selectionContext = null;
  document.querySelectorAll('.board-column-item.selected').forEach(el => el.classList.remove('selected'));
  updateBulkToolbar();
}

function updateBulkToolbar() {
  const toolbar = document.getElementById('bulkToolbar');
  const countEl = document.getElementById('bulkCount');
  const moveBtn = document.getElementById('bulkMoveBtn');
  if (!toolbar) return;
  const n = selectedItemIds.size;
  toolbar.classList.toggle('hidden', n === 0);
  if (countEl) countEl.textContent = `${n} selected`;
  if (moveBtn) moveBtn.textContent = selectionContext === 'import-manager' ? 'Send to Tab Inbox…' : 'Move to Tab Inbox…';
}

function pushUndoSnapshot() {
  const snapshot = typeof serializeStateSnapshot === 'function' ? serializeStateSnapshot() : JSON.stringify(state);
  if (undoStack[undoStack.length - 1] === snapshot) return;
  undoStack.push(snapshot);
  undoStackBytes += snapshot.length * 2;
  undoStackBytes = trimHistoryStack(undoStack, undoStackBytes);
  redoStack = [];
  redoStackBytes = 0;
  updateUndoRedoUI();
}

function undo() {
  if (!undoStack.length) return;
  const current = typeof serializeStateSnapshot === 'function' ? serializeStateSnapshot() : JSON.stringify(state);
  redoStack.push(current);
  redoStackBytes += current.length * 2;
  redoStackBytes = trimHistoryStack(redoStack, redoStackBytes);
  const snapshot = undoStack.pop();
  undoStackBytes -= snapshot.length * 2;
  restoreStateSnapshot(snapshot);
  cleanTrashAfterRestore();
  saveState();
  renderAll();
  updateUndoRedoUI();
  if (!document.getElementById('trashPanel').classList.contains('hidden')) renderTrashPanel();
}

function redo() {
  if (!redoStack.length) return;
  const current = typeof serializeStateSnapshot === 'function' ? serializeStateSnapshot() : JSON.stringify(state);
  undoStack.push(current);
  undoStackBytes += current.length * 2;
  undoStackBytes = trimHistoryStack(undoStack, undoStackBytes);
  const snapshot = redoStack.pop();
  redoStackBytes -= snapshot.length * 2;
  restoreStateSnapshot(snapshot);
  cleanTrashAfterRestore();
  saveState();
  renderAll();
  updateUndoRedoUI();
  if (!document.getElementById('trashPanel').classList.contains('hidden')) renderTrashPanel();
}

function updateUndoRedoUI() {
  const canUndo = undoStack.length === 0;
  const canRedo = redoStack.length === 0;
  ['undoBtn', 'stgUndoBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = canUndo; });
  ['redoBtn', 'stgRedoBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = canRedo; });
  updateTrashBadge();
}

function updateTrashBadge() {
  const count = recentlyDeleted.length;
  const el = document.getElementById('trashCount');
  if (!el) return;
  el.textContent = count;
  el.classList.toggle('hidden', count === 0);
}

// --- Tooltip ---

const tooltipEl = document.getElementById('tooltip');
let tooltipTarget = null;

function positionTooltip(target) {
  const gameTooltip = target.dataset.tooltipKind === 'game' && typeof renderGameTooltip === 'function';
  tooltipEl.classList.toggle('tooltip--game', gameTooltip);
  if (gameTooltip) renderGameTooltip(tooltipEl, target);
  else tooltipEl.textContent = target.dataset.tooltip;
  const color = target.dataset.tooltipColor || '';
  tooltipEl.style.setProperty('--tooltip-color', color);
  tooltipEl.classList.toggle('has-color', !!color);
  tooltipEl.style.left = '-9999px';
  tooltipEl.style.top = '-9999px';
  tooltipEl.classList.remove('hidden');
  const rect = target.getBoundingClientRect();
  const tW = tooltipEl.offsetWidth;
  const tH = tooltipEl.offsetHeight;
  let top = rect.top - tH - 6;
  let left = rect.left + rect.width / 2 - tW / 2;
  if (top < 4) top = rect.bottom + 6;
  left = Math.max(4, Math.min(left, window.innerWidth - tW - 4));
  tooltipEl.style.top = top + 'px';
  tooltipEl.style.left = left + 'px';
}

document.addEventListener('mouseover', e => {
  const target = e.target.closest('[data-tooltip]');
  if (target === tooltipTarget) return;
  tooltipTarget = target;
  if (!target) { tooltipEl.classList.add('hidden'); return; }
  if (target.dataset.tooltipKind === 'bookmark' && state.settings.showBookmarkTooltips === false) {
    tooltipEl.classList.add('hidden');
    return;
  }
  positionTooltip(target);
});

document.addEventListener('mouseout', e => {
  const target = e.target.closest('[data-tooltip]');
  if (!target) return;
  if (!target.contains(e.relatedTarget)) {
    tooltipTarget = null;
    tooltipEl.classList.add('hidden');
  }
});

function showConfirmDialog(message, onConfirm, okLabel = 'Delete', onCancel = null, options = {}) {
  const confirmOptions = (options && typeof options === 'object') ? options : {};
  const settingKey = confirmOptions.settingKey;
  confirmCallback = onConfirm;
  confirmCancelCallback = onCancel;
  confirmPreferenceSettingKey = settingKey && Object.prototype.hasOwnProperty.call(state.settings || {}, settingKey)
    ? settingKey
    : null;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmOkBtn').textContent = okLabel;
  const optOutRow = document.getElementById('confirmOptOutRow');
  const optOutCheckbox = document.getElementById('confirmDontShowAgain');
  if (optOutRow && optOutCheckbox) {
    optOutRow.classList.toggle('hidden', !confirmPreferenceSettingKey);
    optOutCheckbox.checked = false;
  }
  document.getElementById('confirmOverlay').classList.remove('hidden');
  centerPanel(document.getElementById('confirmCard'));
}

function hideConfirmDialog(options = {}) {
  const { invokeCancel = false } = options;
  const cancelCb = confirmCancelCallback;
  confirmCallback = null;
  confirmCancelCallback = null;
  confirmPreferenceSettingKey = null;
  document.getElementById('confirmOverlay').classList.add('hidden');
  document.getElementById('confirmOkBtn').textContent = 'Delete';
  const optOutRow = document.getElementById('confirmOptOutRow');
  const optOutCheckbox = document.getElementById('confirmDontShowAgain');
  if (optOutRow) optOutRow.classList.add('hidden');
  if (optOutCheckbox) optOutCheckbox.checked = false;
  if (invokeCancel && cancelCb) cancelCb();
}

function showNotice(message) {
  document.getElementById('noticeMessage').textContent = message;
  document.getElementById('noticeOverlay').classList.remove('hidden');
}

function hideNotice() {
  document.getElementById('noticeOverlay').classList.add('hidden');
}

function queueSharedDiskNotice(message) {
  try { sessionStorage.setItem(SHARED_DISK_NOTICE_KEY, message); } catch {}
}

function confirmDialogIsOpen() {
  return !document.getElementById('confirmOverlay').classList.contains('hidden');
}

function resetTransientUiForDataReload() {
  if (!elements.contextMenu.classList.contains('hidden')) hideContextMenu();
  if (selectedItemIds.size > 0) clearSelection();
  if (!elements.searchModal.classList.contains('hidden')) closeSearchModal();
  if (typeof setsManagerPanelOpen !== 'undefined' && setsManagerPanelOpen) hideSetManagerPanel();
  if (typeof importManagerPanelOpen !== 'undefined' && importManagerPanelOpen) hideImportManagerPanel();
  if (typeof inboxPanelOpen !== 'undefined' && inboxPanelOpen) hideInboxPanel();
  if (typeof hideHubToolsPanel === 'function') hideHubToolsPanel();
  if (typeof closeCommandPalette === 'function') closeCommandPalette();
  if (!document.getElementById('trashPanel').classList.contains('hidden')) hideTrashPanel();
  if (!document.getElementById('tagManagerPanel').classList.contains('hidden')) hideTagManagerPanel();
  if (!document.getElementById('dynamicRuleEditorPanel').classList.contains('hidden')) hideDynamicRuleEditor();
  if (!document.getElementById('settingsPanel').classList.contains('hidden')) hideSettingsPanel();
  if (!document.getElementById('folderModal').classList.contains('hidden')) hideFolderModal();
  if (!document.getElementById('boardSettingsPanel').classList.contains('hidden')) {
    document.getElementById('boardSettingsPanel').classList.add('hidden');
    document.getElementById('modalCard').classList.remove('hidden');
    elements.modalOverlay.classList.add('hidden');
    if (typeof boardSettingsCreatingId !== 'undefined') boardSettingsCreatingId = null;
    if (typeof _boardSettingsCancelSnapshot !== 'undefined') _boardSettingsCancelSnapshot = null;
  }
  if (!document.getElementById('modalCard').classList.contains('hidden')) hideModal();
  if (!document.getElementById('noticeOverlay').classList.contains('hidden')) hideNotice();
  if (!document.getElementById('confirmOverlay').classList.contains('hidden')) hideConfirmDialog();
  if (typeof dragPayload !== 'undefined') dragPayload = null;
  if (typeof removeDragPlaceholders === 'function') removeDragPlaceholders();
  sharedDiskReloadPromptOpen = false;
}

async function reloadHubData(options = {}) {
  const {
    source = 'shared',
    notice = '',
    fallbackToHardReload = false
  } = options;
  if (sharedDiskDataReloadInProgress) return false;
  sharedDiskDataReloadInProgress = true;
  document.documentElement.classList.add('hub-booting');
  try {
    resetTransientUiForDataReload();

    let snapshot = null;
    let databasePath = (state.databasePath || '').trim();
    let fileInfo = null;

    if (source === 'shared') {
      if (typeof bridge === 'undefined') throw new Error('Bridge unavailable');
      await bridge.whenReady;
      if (!authoritativePortalStorageReady()) throw new Error('Authoritative Portal storage unavailable');
      const loaded = await bridge.loadState();
      if (loaded?.error) throw new Error(loaded.error);
      if (bridge.storageMode?.() === 'host' && loaded?.fromDisk !== true) throw new Error('Shared database was not read from disk');
      snapshot = loaded?.json || null;
      fileInfo = loaded?.fileInfo || null;
      databasePath = (loaded?.databasePath || state.databasePath || '').trim();
      const authorityKey = databasePath || bridge.storageMode?.() || 'relay';
      if (!snapshot) throw new Error('No shared hub data was returned');
      restoreStateSnapshot(snapshot);
      if (databasePath) state.databasePath = databasePath;
      if (typeof acceptSharedDiskSnapshot === 'function') acceptSharedDiskSnapshot(fileInfo, authorityKey);
      else if (fileInfo) setSharedDiskBaseline(fileInfo, authorityKey);
      else resetSharedDiskBaseline(authorityKey);
      persistStateToLocalCache(snapshot, {
        source: 'shared',
        databasePath,
        sharedBaselineVersion: fileInfo?.version ?? null,
        sharedBaselinePath: authorityKey
      });
      setPortalReadOnlyMode(false);
      startSharedDiskPolling();
    } else {
      snapshot = localStorage.getItem(STORAGE_KEY) || serializeStateSnapshot();
      restoreStateSnapshot(snapshot);
      resetSharedDiskBaseline(state.databasePath || '');
      ensureLocalCacheMetadata(snapshot, {
        source: 'local',
        databasePath: state.databasePath || ''
      });
      setPortalReadOnlyMode(true);
    }

    undoStack = [];
    redoStack = [];
    isDirty = false;
    renderAll();
    if (typeof updateSidebarExtensionStatus === 'function') updateSidebarExtensionStatus();
    if (typeof updateDatabasePathControls === 'function') await updateDatabasePathControls();
    if (typeof updateAboutBridgeStatus === 'function') await updateAboutBridgeStatus();
    updateUndoRedoUI();
    document.documentElement.classList.remove('hub-booting');
    if (source === 'shared') void bridge.resumePendingIntake?.().catch(() => {});
    if (notice) showNotice(notice);
    return true;
  } catch (error) {
    console.error('Failed to reload hub data in-app:', error);
    document.documentElement.classList.remove('hub-booting');
    if (fallbackToHardReload) {
      queueSharedDiskNotice(notice || 'Reloaded hub data.');
      location.reload();
      return false;
    }
    showNotice(`Failed to reload hub data: ${error.message || error}`);
    return false;
  } finally {
    sharedDiskDataReloadInProgress = false;
  }
}

function reloadForSharedDisk(message) {
  void reloadHubData({
    source: 'shared',
    notice: message,
    fallbackToHardReload: true
  });
}

function shouldShowSharedAutoRefreshNotice() {
  return state.settings?.sharedAutoRefreshNotice !== false;
}

function getReloadHubSource() {
  if (authoritativePortalStorageReady()) {
    return 'shared';
  }
  return 'local';
}

function reloadHubDataManually() {
  const source = getReloadHubSource();
  const notice = source === 'shared'
    ? 'Reloaded hub data from the shared database.'
    : 'Reloaded hub data from the browser cache.';
  void reloadHubData({ source, notice });
}

async function prepareForExternalDelivery() {
  if (portalReadOnlyMode) return { ok: false, conflict: false, error: 'Portal is read-only until Cyrune Relay reconnects.' };
  if (sharedDiskSyncIsBlocked()) {
    return { ok: false, conflict: true, error: 'Shared database sync is paused in this hub tab.' };
  }
  if (typeof flushSharedDiskSaveQueue === 'function' && sharedDiskSaveIsPending()) {
    void flushSharedDiskSaveQueue();
    if (typeof waitForSharedDiskSaveIdle === 'function' && !await waitForSharedDiskSaveIdle()) {
      return { ok: false, conflict: false, error: 'Timed out waiting for this hub tab to finish saving.' };
    }
  }
  if (sharedDiskSyncIsBlocked()) {
    return { ok: false, conflict: true, error: 'Shared database sync is paused in this hub tab.' };
  }
  if (hasPendingSharedDiskChanges()) {
    return { ok: false, conflict: false, error: 'This hub tab still has unsaved changes.' };
  }
  if (!authoritativePortalStorageReady() || bridge.storageMode?.() !== 'host' || !state.databasePath) {
    return { ok: true };
  }

  const live = await bridge.getDatabaseFileInfo();
  const livePath = (live?.databasePath || state.databasePath || '').trim();
  const liveVersion = live?.fileInfo?.version || null;
  if (!livePath || liveVersion === getSharedDiskBaselineVersion()) return { ok: true };

  const reloaded = await reloadHubData({ source: 'shared', notice: '' });
  return reloaded
    ? { ok: true }
    : { ok: false, conflict: true, error: 'Could not refresh the latest shared database before delivery.' };
}

function resolveExternalInboxTarget(targetBoardId = '', targetTabId = '') {
  const board = targetBoardId
    ? state.boards.find(candidate => candidate.id === targetBoardId) || null
    : getActiveBoard();
  if (!board) return { error: 'No destination board is available.' };
  const tab = targetTabId
    ? findBoardTabById(board, targetTabId)
    : (board.id === state.activeBoardId ? getActiveTab() : getBoardTab(board));
  if (!tab) return { error: 'No destination tab is available.' };
  if (board.locked || tab.locked) return { error: 'The destination board or tab is locked.' };
  const inbox = getBoardInbox(board, tab);
  if (!inbox) return { error: 'The destination tab has no inbox.' };
  return { board, tab, inbox };
}

function findInboxDeliveryItem(itemId) {
  if (!itemId) return null;
  for (const board of state.boards || []) {
    for (const tab of getBoardTabs(board)) {
      const found = findBoardItemInList(getBoardInbox(board, tab)?.items || [], itemId);
      if (found?.item) return found.item;
    }
  }
  return null;
}

function awaitExternalDeliverySave(savePromise, timeoutMs = 45000) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ ok: false, timedOut: true }), timeoutMs);
    Promise.resolve(savePromise)
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        resolve({ ok: false, error: error?.message || String(error) });
      });
  });
}

async function persistExternalTabDelivery(detail = {}, allowRebase = true) {
  const prepared = await prepareForExternalDelivery();
  if (!prepared.ok) return prepared;

  const url = typeof detail.url === 'string' ? detail.url.trim() : '';
  if (!url || !isValidUrl(url)) return { ok: false, error: 'The received tab URL is invalid.' };

  const deliveryId = detail.deliveryId || `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const itemId = `bm-delivery-${deliveryId}`;
  let target = resolveExternalInboxTarget(detail.targetBoardId || '', detail.targetTabId || '');
  if (target.error) return { ok: false, error: target.error };

  const targetBoardId = target.board.id;
  const targetTabId = target.tab.id;
  let item = findInboxDeliveryItem(itemId);
  if (!item) {
    item = {
      id: itemId,
      type: 'bookmark',
      title: detail.title || url || 'Untitled',
      url: normalizeUrl(url),
      tags: [],
      faviconCache: detail.faviconCache || ''
    };
    pushUndoSnapshot();
    target.inbox.items.push(item);
    if (typeof phaseTwoApplyAutomationRecords === 'function') {
      phaseTwoApplyAutomationRecords([{ item, parent: target.inbox.items, source: 'extension' }], {
        pushUndo: false,
        persist: false,
        render: false
      });
    }
  }

  const deliveryMutationSequence = getLocalStateMutationSequence() + 1;
  let result = await awaitExternalDeliverySave(saveState());
  if (result?.conflict && allowRebase && getLocalStateMutationSequence() === deliveryMutationSequence) {
    const reloaded = await reloadHubData({ source: 'shared', notice: '' });
    if (!reloaded) return { ok: false, conflict: true, error: 'The shared database changed during delivery.' };
    target = resolveExternalInboxTarget(targetBoardId, targetTabId);
    if (target.error) return { ok: false, error: target.error };
    if (!findInboxDeliveryItem(itemId)) target.inbox.items.push(item);
    result = await awaitExternalDeliverySave(saveState());
  }

  renderNav();
  renderBoardTabBar(getActiveBoard(), getActiveTab());
  updateInboxBadge();
  if (typeof inboxPanelOpen !== 'undefined' && inboxPanelOpen) renderInboxPanel();
  if (!result?.ok || result.conflict) {
    return {
      ok: false,
      conflict: result?.conflict === true,
      error: result?.conflict
        ? 'The shared database changed during delivery.'
        : (result?.timedOut
          ? 'Timed out while saving the delivered bookmark.'
          : 'The bookmark was added locally but could not be saved yet.')
    };
  }
  return { ok: true, persisted: result.persisted || 'shared' };
}

async function persistExternalGameDelivery(detail = {}, allowRebase = true) {
  const prepared = await prepareForExternalDelivery();
  if (!prepared.ok) return prepared;
  const source = detail.game && typeof detail.game === 'object' ? detail.game : {};
  const gameKey = String(source.gameKey || '').trim();
  if (!/^game_[a-zA-Z0-9_-]{12,75}$/.test(gameKey)) return { ok: false, error: 'The received game binding is invalid.' };
  const thumbnail = String(source.thumbnailCache || '');
  if (thumbnail && (!/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(thumbnail) || thumbnail.length > 700000)) {
    return { ok: false, error: 'The received game thumbnail is invalid.' };
  }
  const deliveryId = String(detail.deliveryId || `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 160);
  const itemId = `game-delivery-${deliveryId}`;
  let target = resolveExternalInboxTarget(detail.targetBoardId || '', detail.targetTabId || '');
  if (target.error) return { ok: false, error: target.error };
  const targetBoardId = target.board.id;
  const targetTabId = target.tab.id;
  let item = findInboxDeliveryItem(itemId);
  if (!item) {
    item = {
      id: itemId,
      type: 'game',
      title: String(source.title || 'Game').slice(0, 160),
      gameKey,
      tags: (Array.isArray(source.tags) ? source.tags : []).map(tag => String(tag || '').slice(0, 80)).filter(Boolean).slice(0, 12),
      systemId: /^[a-z0-9][a-z0-9_-]{0,47}$/.test(String(source.systemId || '').trim().toLowerCase())
        ? String(source.systemId).trim().toLowerCase() : '',
      systemName: String(source.systemName || '').trim().slice(0, 80),
      emulatorName: String(source.emulatorName || '').trim().slice(0, 120),
      profileName: String(source.profileName || '').trim().slice(0, 120),
      thumbnailCache: thumbnail
    };
    pushUndoSnapshot();
    target.inbox.items.push(item);
    if (typeof phaseTwoApplyAutomationRecords === 'function') {
      phaseTwoApplyAutomationRecords([{ item, parent: target.inbox.items, source: 'extension' }], { pushUndo: false, persist: false, render: false });
    }
  }

  const deliveryMutationSequence = getLocalStateMutationSequence() + 1;
  let result = await awaitExternalDeliverySave(saveState());
  if (result?.conflict && allowRebase && getLocalStateMutationSequence() === deliveryMutationSequence) {
    const reloaded = await reloadHubData({ source: 'shared', notice: '' });
    if (!reloaded) return { ok: false, conflict: true, error: 'The shared database changed during delivery.' };
    target = resolveExternalInboxTarget(targetBoardId, targetTabId);
    if (target.error) return { ok: false, error: target.error };
    if (!findInboxDeliveryItem(itemId)) target.inbox.items.push(item);
    result = await awaitExternalDeliverySave(saveState());
  }
  renderNav();
  renderBoardTabBar(getActiveBoard(), getActiveTab());
  updateInboxBadge();
  if (typeof inboxPanelOpen !== 'undefined' && inboxPanelOpen) renderInboxPanel();
  if (!result?.ok || result.conflict) {
    return { ok: false, conflict: result?.conflict === true, error: result?.conflict
      ? 'The shared database changed during delivery.'
      : (result?.timedOut ? 'Timed out while saving the delivered game.' : 'The game was added locally but could not be saved yet.') };
  }
  return { ok: true, persisted: result.persisted || 'shared' };
}

function summarizeHubSnapshot(snapshot) {
  const summary = {
    bytes: typeof snapshot === 'string' ? snapshot.length : 0,
    boards: 0,
    bookmarks: 0,
    folders: 0,
    titles: 0,
    importItems: 0
  };
  try {
    const parsed = JSON.parse(snapshot || '{}');
    summary.boards = Array.isArray(parsed.boards) ? parsed.boards.length : 0;
    summary.importItems = Array.isArray(parsed.importManager?.items) ? parsed.importManager.items.length : 0;
    const walk = value => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (value.type === 'bookmark') summary.bookmarks++;
      else if (value.type === 'folder') summary.folders++;
      else if (value.type === 'title') summary.titles++;
      Object.values(value).forEach(walk);
    };
    walk(parsed.boards);
    walk(parsed.importManager?.items);
  } catch {}
  return summary;
}

function hubSnapshotContentCount(summary) {
  return summary.boards + summary.bookmarks + summary.folders + summary.titles + summary.importItems;
}

async function refreshBridgeStatusUi() {
  if (typeof updateSidebarExtensionStatus === 'function') updateSidebarExtensionStatus();
  if (typeof updateDatabasePathControls === 'function') await updateDatabasePathControls();
  if (typeof updateAboutBridgeStatus === 'function') await updateAboutBridgeStatus();
}

async function handleRecoveredSharedStorage(info, { notify = false } = {}) {
  const databasePath = (info?.databasePath || '').trim();
  const authorityKey = databasePath || String(info?.storageMode || '').trim();
  if (!authorityKey || sharedDiskSyncIsBlocked()) return;
  return await reloadHubData({
    source: 'shared',
    notice: notify ? PORTAL_UI_TEXT.authorityRecovered : ''
  });
}

function startSharedRecoveryPolling() {
  if (sharedStoragePollTimer) return;
  if (typeof bridge === 'undefined') return;
  sharedStoragePollTimer = setInterval(async () => {
    try {
      await checkForSharedRecovery();
      if (authoritativePortalStorageReady() && bridge.storageMode?.() === 'host' && state.databasePath) {
        await checkForExternalSharedDiskChanges();
      }
    } catch {}
  }, SHARED_DISK_POLL_MS);
}

async function checkForSharedRecovery() {
  // Initial loading establishes the baseline; it is not a recovery event.
  await hubInitializationPromise;
  if (sharedRecoveryCheckInProgress || sharedDiskDataReloadInProgress) return;
  if (typeof bridge === 'undefined') return;
  sharedRecoveryCheckInProgress = true;
  try {
    await bridge.whenReady;
    const info = await bridge.getStorageInfo();
    const extensionReady = bridge.isAvailable();
    if (extensionReady) relayHasConnected = true;
    else if (relayHasConnected) relayWasUnavailable = true;
    const nativeReady = extensionReady && info?.authoritativeStorageAvailable === true;
    const databasePath = (info?.databasePath || info?.storageMode || '').trim();

    const recovered = nativeReady && (!lastBridgeNativeReady || lastBridgeRecoveryPath !== databasePath);
    const statusChanged = lastBridgeNativeReady !== nativeReady || lastBridgeRecoveryPath !== databasePath;

    lastBridgeNativeReady = nativeReady;
    lastBridgeRecoveryPath = databasePath;

    if (statusChanged) await refreshBridgeStatusUi();
    if (statusChanged && !nativeReady) setPortalReadOnlyMode(true);
    if (recovered) {
      const restored = await handleRecoveredSharedStorage(info, { notify: relayWasUnavailable });
      if (restored) relayWasUnavailable = false;
      else lastBridgeNativeReady = false; // Retry a failed authoritative reload.
    }
  } finally {
    sharedRecoveryCheckInProgress = false;
  }
}

function promptSharedDiskConflict(detail = {}) {
  if (sharedDiskReloadPromptOpen) return;
  if (confirmDialogIsOpen()) {
    setTimeout(() => promptSharedDiskConflict(detail), 600);
    return;
  }
  sharedDiskReloadPromptOpen = true;
  const path = detail.databasePath || state.databasePath || 'the shared database';
  showConfirmDialog(
    `The shared database changed on disk before this browser finished saving to ${path}. Reload the latest shared copy now?`,
    () => {
      sharedDiskReloadPromptOpen = false;
      reloadForSharedDisk('Reloaded shared database after a save conflict with another browser or sync tool.');
    },
    'Reload',
    () => {
      sharedDiskReloadPromptOpen = false;
      showNotice('Shared disk sync is paused in this tab until you reload. Export JSON if you need to keep this local copy first.');
    }
  );
}

function startSharedDiskPolling() {
  startSharedRecoveryPolling();
}

async function checkForExternalSharedDiskChanges() {
  if (sharedDiskDataReloadInProgress) return;
  if (!authoritativePortalStorageReady() || bridge.storageMode?.() !== 'host') return;
  const live = await bridge.getDatabaseFileInfo();
  const livePath = (live?.databasePath || '').trim();
  if (!livePath) return;
  if (livePath !== (state.databasePath || '').trim()) {
    state.databasePath = livePath;
    resetSharedDiskBaseline(livePath);
    persistStateToLocalCache(serializeStateSnapshot(), {
      source: 'local',
      databasePath: livePath,
      sharedBaselineVersion: null,
      sharedBaselinePath: livePath
    });
    if (typeof updateDatabasePathControls === 'function') await updateDatabasePathControls();
    if (typeof updateAboutBridgeStatus === 'function') await updateAboutBridgeStatus();
  }
  if (sharedDiskSyncIsBlocked()) return;
  if (typeof sharedDiskSaveIsPending === 'function' && sharedDiskSaveIsPending()) return;
  const liveVersion = live?.fileInfo?.version || null;
  const baselineVersion = getSharedDiskBaselineVersion();
  if (liveVersion === baselineVersion) return;
  if (liveVersion === null && baselineVersion === null) return;
  const loaded = await bridge.loadState();
  const liveJson = loaded?.json || null;
  if (!liveJson) return;
  const currentJson = typeof serializeStateSnapshot === 'function' ? serializeStateSnapshot() : JSON.stringify(state);
  const snapshotsAreEquivalent = typeof snapshotsMatch === 'function'
    ? snapshotsMatch(liveJson, currentJson)
    : liveJson === currentJson;
  if (liveJson && snapshotsAreEquivalent) {
    if (typeof acceptSharedDiskSnapshot === 'function') acceptSharedDiskSnapshot(loaded?.fileInfo || live?.fileInfo || null, livePath);
    else setSharedDiskBaseline(loaded?.fileInfo || live?.fileInfo || null, livePath);
    persistStateToLocalCache(currentJson, {
      source: 'shared',
      databasePath: livePath,
      sharedBaselineVersion: (loaded?.fileInfo || live?.fileInfo || null)?.version ?? null,
      sharedBaselinePath: livePath
    });
    return;
  }
  if (sharedDiskReloadPromptOpen || confirmDialogIsOpen()) return;
  if (hasPendingSharedDiskChanges()) {
    sharedDiskReloadPromptOpen = true;
    showConfirmDialog(
      `The shared database changed on disk at ${livePath}. Reload now and discard this window's newer local copy?`,
      () => {
        sharedDiskReloadPromptOpen = false;
        reloadForSharedDisk(shouldShowSharedAutoRefreshNotice()
          ? 'Reloaded shared database after detecting an external change.'
          : '');
      },
      'Reload',
      () => { sharedDiskReloadPromptOpen = false; }
    );
    return;
  }
  reloadForSharedDisk(shouldShowSharedAutoRefreshNotice()
    ? 'Reloaded shared database after detecting an external change.'
    : '');
}


// --- Trash panel ---

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTimeSince(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getTrashItemLabel(entry) {
  const a = entry.source?.area;
  if (a === 'nav-board') return 'Board';
  if (a === 'folder-board') return 'Board';
  if (a === 'set') return 'Set';
  if (a === 'nav-item') {
    const t = entry.item?.type;
    return t === 'folder' ? 'Nav folder' : t === 'title' ? 'Nav title' : 'Nav item';
  }
  if (a === 'speed-dial') return 'Speed dial';
  if (a === 'essential') return 'Essential';
  const t = entry.item?.type;
  return t === 'folder' ? 'Folder' : t === 'bookmark' ? 'Bookmark' : t === 'title' ? 'Title' : 'Item';
}

function renderTrashPanel() {
  const list = document.getElementById('trashList');
  const emptyEl = document.getElementById('trashEmpty');
  const clearBtn = document.getElementById('trashClearAllBtn');
  const count = recentlyDeleted.length;
  updateTrashBadge();
  if (count === 0) {
    list.innerHTML = '';
    emptyEl.classList.remove('hidden');
    clearBtn.disabled = true;
    return;
  }
  emptyEl.classList.add('hidden');
  clearBtn.disabled = false;
  list.innerHTML = '';
  for (const entry of recentlyDeleted) {
    const name = entry.item?.title || entry.item?.navItem?.title || entry.item?.board?.title || '(untitled)';
    const div = document.createElement('div');
    div.className = 'trash-item';
    div.innerHTML = `
      <div class="trash-item-info">
        <span class="trash-item-name">${escapeHtml(name)}</span>
        <span class="trash-item-meta">${getTrashItemLabel(entry)} · ${formatTimeSince(entry.deletedAt)}</span>
      </div>
      <div class="trash-item-actions">
        <button class="secondary-btn trash-restore-btn" data-trash-id="${entry.trashId}">Restore</button>
        <button class="danger-btn trash-delete-btn" data-trash-id="${entry.trashId}">×</button>
      </div>`;
    list.appendChild(div);
  }
}

function showTrashPanel() {
  document.getElementById('modalCard').classList.add('hidden');
  const panel = document.getElementById('trashPanel');
  panel.classList.remove('hidden');
  centerPanel(panel);
  makeDraggable(panel, document.getElementById('trashDragHandle'));
  renderTrashPanel();
}

function hideTrashPanel() {
  document.getElementById('trashPanel').classList.add('hidden');
  document.getElementById('modalCard').classList.remove('hidden');
}

function confirmDelete(settingKey, message, onConfirm) {
  if (!state.settings[settingKey]) { onConfirm(); return; }
  showConfirmDialog(message, onConfirm, 'Delete', null, { settingKey });
}

// --- Draggable panels ---

function makeDraggable(panel, handle, onDrop) {
  if (panel.dataset.draggableAttached) return;
  panel.dataset.draggableAttached = '1';
  handle.addEventListener('mousedown', e => {
    if (e.target.closest('input, select, button, textarea, label')) return;
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    let ox = e.clientX - rect.left, oy = e.clientY - rect.top;
    const onMove = e => {
      const x = Math.min(Math.max(0, e.clientX - ox), window.innerWidth - panel.offsetWidth);
      const y = Math.min(Math.max(0, e.clientY - oy), window.innerHeight - panel.offsetHeight);
      panel.style.left = x + 'px';
      panel.style.top  = y + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (onDrop) onDrop();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function centerPanel(panel) {
  requestAnimationFrame(() => {
    panel.classList.add('draggable');
    panel.style.left = Math.round((window.innerWidth  - panel.offsetWidth)  / 2) + 'px';
    panel.style.top  = Math.round((window.innerHeight - panel.offsetHeight) / 2) + 'px';
  });
}

// --- Init ---

function attachEventListeners() {
  document.getElementById('aboutBtn').addEventListener('click', () => showSettingsPanel('about'));
  elements.quickSearchBtn?.addEventListener('click', () => openSearchModal({}));
  elements.quickTagManagerBtn?.addEventListener('click', showTagManagerPanel);
  document.getElementById('trashBtn').addEventListener('click', showTrashPanel);
  document.getElementById('trashCloseBtn').addEventListener('click', hideTrashPanel);
  document.getElementById('trashClearAllBtn').addEventListener('click', () => {
    clearTrash();
    renderTrashPanel();
  });
  document.getElementById('trashList').addEventListener('click', e => {
    const restoreBtn = e.target.closest('.trash-restore-btn');
    const deleteBtn = e.target.closest('.trash-delete-btn');
    if (restoreBtn) {
      restoreFromTrash(restoreBtn.dataset.trashId);
      renderAll();
      saveState();
      renderTrashPanel();
    } else if (deleteBtn) {
      removeTrashItem(deleteBtn.dataset.trashId);
      renderTrashPanel();
    }
  });
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);

  document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
    const n = selectedItemIds.size;
    if (!n) return;
    const isImportSelection = selectionContext === 'import-manager';
    showConfirmDialog(isImportSelection
      ? `Delete ${n} selected imported ${n > 1 ? 'items' : 'item'}?`
      : `Delete ${n} selected ${n > 1 ? 'items' : 'item'}?`, () => {
      pushUndoSnapshot();
      if (isImportSelection) {
        const toDelete = collectSelectedImportManagerItems(selectedItemIds);
        toDelete.forEach(item => removeImportManagerItemById(item.id));
        clearSelection();
        renderAll();
        saveState();
        return;
      }
      const board = getActiveBoard();
      for (const itemId of [...selectedItemIds]) {
        const found = findBoardItemInColumns(board, itemId);
        if (found?.item) {
          pushToTrash(cloneData(found.item), { area: 'board-item', boardId: board.id });
          found.list.splice(found.list.indexOf(found.item), 1);
        }
      }
      clearSelection();
      renderAll();
      saveState();
      updateTrashBadge();
    }, `Delete ${n} ${n === 1 ? 'Item' : 'Items'}`);
  });
  document.getElementById('bulkTagBtn').addEventListener('click', () => {
    showModal('bulkAddTags', { title: 'Add Tags to Selected', showName: false, showTags: true });
  });
  document.getElementById('bulkMoveBtn').addEventListener('click', () => {
    const isImportSelection = selectionContext === 'import-manager';
    const ab = getActiveBoard();
    const activeTab = getActiveTab();
    const selectOptions = _sortedInboxTargetOptions(
      state.boards.filter(b => !b.locked),
      isImportSelection
        ? {}
        : { excludeBoardId: ab?.id || null, excludeTabId: activeTab?.id || null }
    );
    if (!selectOptions.length) { alert('No other tab inboxes to move to.'); return; }
    showModal('bulkMoveToBoard', {
      title: isImportSelection ? 'Send Selected to Tab Inbox' : 'Move Selected to Tab Inbox',
      showName: false,
      showBoardTabSelect: true,
      selectLabel: 'Target board',
      selectSecondaryLabel: 'Target tab inbox',
      inboxTargetExclusions: isImportSelection
        ? {}
        : { excludeBoardId: ab?.id || null, excludeTabId: activeTab?.id || null }
    });
  });
  document.getElementById('bulkDeselectBtn').addEventListener('click', clearSelection);

  document.getElementById('sidebarCollapseBtn').addEventListener('click', () => {
    const sidebar = document.getElementById('navSidebar');
    const appShell = document.querySelector('.app-shell');
    const collapsed = sidebar.classList.toggle('collapsed');
    appShell.classList.toggle('sidebar-collapsed', collapsed);
    const btn = document.getElementById('sidebarCollapseBtn');
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  });

  elements.boardSettingsBtn.addEventListener('click', () => {
    showBoardMetaModal('edit');
  });
  elements.speedDialToggleBtn?.addEventListener('click', () => {
    const board = getActiveBoardContainer();
    if (!board) return;
    pushUndoSnapshot();
    board.showSpeedDial = board.showSpeedDial === false;
    renderBoard();
    saveState();
  });
  elements.setBarToggleBtn?.addEventListener('click', () => {
    const board = getActiveBoardContainer();
    const tab = getActiveTab();
    if (!board || !tab) return;
    pushUndoSnapshot();
    tab.showSetBar = tab.showSetBar === false;

    renderBoard();
    saveState();
  });
  makeDraggable(document.getElementById('modalCard'), document.getElementById('modalCardHeader'));
  makeDraggable(document.getElementById('confirmCard'), document.getElementById('confirmCardHeader'));
  document.getElementById('confirmDontShowAgain')?.addEventListener('change', event => {
    const settingKey = confirmPreferenceSettingKey;
    if (!settingKey || !Object.prototype.hasOwnProperty.call(state.settings || {}, settingKey)) return;
    state.settings[settingKey] = !event.target.checked;
    const settingsCheckboxId = `stg${settingKey.charAt(0).toUpperCase()}${settingKey.slice(1)}`;
    const settingsCheckbox = document.getElementById(settingsCheckboxId);
    if (settingsCheckbox) settingsCheckbox.checked = state.settings[settingKey];
    saveState();
  });
  elements.modalCancelBtn.addEventListener('click', hideModal);
  elements.modalOverlay.addEventListener('click', event => {
    if (event.target !== elements.modalOverlay) return;
    if (!document.getElementById('notificationCenterPanel').classList.contains('hidden')) {
      hideNotificationCenter();
    } else if (!document.getElementById('dynamicRuleEditorPanel').classList.contains('hidden')) {
      hideDynamicRuleEditor();
    } else if (!document.getElementById('settingsPanel').classList.contains('hidden')) {
      hideSettingsPanel();
    } else if (!document.getElementById('boardSettingsPanel').classList.contains('hidden')) {
      cancelBoardSettingsPanel();
    } else if (!document.getElementById('trashPanel').classList.contains('hidden')) {
      hideTrashPanel();
    } else if (typeof setsManagerPanelOpen !== 'undefined' && setsManagerPanelOpen) {
      hideSetManagerPanel();
    } else if (typeof inboxPanelOpen !== 'undefined' && inboxPanelOpen) {
      hideInboxPanel();
    } else if (typeof importManagerPanelOpen !== 'undefined' && importManagerPanelOpen) {
      hideImportManagerPanel();
    } else {
      hideModal();
    }
  });
  elements.modalForm.addEventListener('submit', handleModalSubmit);
  document.getElementById('modalSpeedDialSlots')?.addEventListener('input', handleModalSpeedDialSlotsInput);
  document.getElementById('cmCollectionShowSpeedDial')?.addEventListener('change', handleModalCollectionShowSpeedDialChange);
  elements.modalInput2.addEventListener('input', () => {
    if (activeModal !== 'addBookmark') return;
    const url = elements.modalInput2.value.trim();
    const warning = document.getElementById('modalDuplicateWarning');
    if (!warning) return;
    if (!url) { warning.classList.add('hidden'); return; }
    const dup = findDuplicateUrl(url);
    if (dup) {
      warning.textContent = `Already saved: "${dup.item.title}"`;
      warning.classList.remove('hidden');
    } else {
      warning.classList.add('hidden');
    }
  });
  initChipInput(elements.modalInput3, tagChipOpts());
  initChipInput(elements.modalInput4, tagChipOpts());
  elements.navList.addEventListener('contextmenu', handleNavListContextMenu);
  elements.navList.addEventListener('dragover', handleNavListDragOver);
  elements.navList.addEventListener('drop', handleNavListDrop);
  elements.speedDial.addEventListener('contextmenu', event => {
    if (event.target.closest('.speed-link')) return;
    event.preventDefault();
    if (getActiveBoard()?.locked) return;
    contextTarget = { area: 'speed-dial' };
    showContextMenu(event.clientX, event.clientY, [
      { label: 'Add bookmark', action: 'addSpeedDialBookmark' },
      { label: 'Add application', action: 'addApplication' }
    ]);
  });
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    const cb = confirmCallback;
    hideConfirmDialog();
    if (cb) {
      try { cb(); } catch (err) {
        console.error('[confirmOkBtn] callback threw:', err);
        showNotice(`An error occurred: ${err.message || err}`);
      }
    }
  });
  document.getElementById('confirmCancelBtn').addEventListener('click', () => hideConfirmDialog({ invokeCancel: true }));
  document.getElementById('confirmOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('confirmOverlay')) hideConfirmDialog({ invokeCancel: true });
  });

  document.getElementById('noticeOkBtn').addEventListener('click', hideNotice);
  document.getElementById('noticeOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('noticeOverlay')) hideNotice();
  });

  document.addEventListener('click', event => {
    if (!elements.contextMenu.contains(event.target)) hideContextMenu();
  });

  window.addEventListener('beforeunload', event => {
    if (isDirty && state.settings.warnOnClose) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  document.getElementById('searchModalDoneBtn').addEventListener('click', closeSearchModal);

  document.getElementById('searchModalInput').addEventListener('input', () => {
    const q = elements.searchModalInput.value.trim();
    if (q || activeTagFilters.size > 0) scheduleSearchResultsRender();
    else {
      _cancelScheduledSearchRender();
      elements.searchModalResults.innerHTML = '';
    }
  });

  document.getElementById('searchModal').addEventListener('click', e => {
    if (e.target.id === 'searchTagFilterToggleBtn') {
      const pickerEl = document.getElementById('searchTagPicker');
      const willShow = pickerEl.classList.contains('hidden');
      _showTagPicker(willShow);
      if (willShow || elements.searchModalInput.value.trim() || activeTagFilters.size > 0) renderSearchResults();
      return;
    }

    // filter chips (Name, URL, Tags, Show types)
    const chip = e.target.closest('.search-filter-chip');
    if (chip) {
      const key = chip.dataset.filter;
      searchFilters[key] = !searchFilters[key];
      chip.classList.toggle('active', searchFilters[key]);
      const q = elements.searchModalInput.value.trim();
      if (q || activeTagFilters.size > 0) renderSearchResults();
      return;
    }

    // sort buttons in tag picker
    const sortBtn = e.target.closest('.search-tag-sort-btn');
    if (sortBtn) {
      document.querySelectorAll('.search-tag-sort-btn').forEach(b => b.classList.remove('active'));
      sortBtn.classList.add('active');
      _tagPickerSort = sortBtn.dataset.sort;
      renderSearchResults();
      return;
    }

    // AND/OR mode button
    if (e.target.id === 'searchTagModeBtn') {
      _tagFilterMode = _tagFilterMode === 'or' ? 'and' : 'or';
      e.target.dataset.mode = _tagFilterMode;
      e.target.textContent = _tagFilterMode === 'and' ? 'ALL' : 'ANY';
      renderSearchResults();
      return;
    }

    // tag chip clicks in picker list
    const pickerChip = e.target.closest('#searchTagPickerList .tag-chip');
    if (pickerChip) {
      const id = pickerChip.dataset.tagId;
      if (activeTagFilters.has(id)) activeTagFilters.delete(id);
      else activeTagFilters.add(id);
      renderSearchResults();
    }
  });

  document.addEventListener('keydown', event => {
    const inInput = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

    if (!inInput && event.ctrlKey && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }

    if (!inInput && event.ctrlKey && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
      event.preventDefault();
      redo();
      return;
    }

    if (event.ctrlKey && event.key === 'f') {
      event.preventDefault();
      openSearchModal({});
      return;
    }

    if (!inInput && event.key === '/') {
      event.preventDefault();
      openSearchModal({});
      return;
    }

    if (!inInput && (event.key === 'n' || event.key === 'N') && elements.modalOverlay.classList.contains('hidden')) {
      const board = getActiveBoard();
      const tab = getActiveTab();
      if (board && tab && (tab.columns || []).length) {
        const columnId = lastActiveColumnId || tab.columns[0]?.id;
        contextTarget = { area: 'board-empty', columnId };
        showModal('addBookmark', {
          title: 'New Bookmark', placeholder1: 'New Bookmark',
          showUrl: true, placeholder2: 'Bookmark URL',
          showTags: true, inheritedTags: getContextInheritedTags(contextTarget)
        });
        event.preventDefault();
        return;
      }
    }

    if (event.key !== 'Escape') return;
    if (!document.getElementById('noticeOverlay').classList.contains('hidden')) { hideNotice(); return; }
    if (!document.getElementById('confirmOverlay').classList.contains('hidden')) { hideConfirmDialog({ invokeCancel: true }); return; }
    if (!document.getElementById('notificationCenterPanel').classList.contains('hidden')) { hideNotificationCenter(); return; }
    if (!elements.searchModal.classList.contains('hidden')) { closeSearchModal(); return; }
    if (typeof inboxPanelOpen !== 'undefined' && inboxPanelOpen) { hideInboxPanel(); return; }
    if (!elements.contextMenu.classList.contains('hidden')) { hideContextMenu(); return; }
    if (!document.getElementById('dynamicRuleEditorPanel').classList.contains('hidden')) { hideDynamicRuleEditor(); return; }
    if (typeof setsManagerPanelOpen !== 'undefined' && setsManagerPanelOpen) { hideSetManagerPanel(); return; }
    if (typeof importManagerPanelOpen !== 'undefined' && importManagerPanelOpen) { hideImportManagerPanel(); return; }
    if (!document.getElementById('trashPanel').classList.contains('hidden')) { hideTrashPanel(); return; }
    if (!document.getElementById('tagManagerPanel').classList.contains('hidden')) { hideTagManagerPanel(); return; }
    if (!document.getElementById('settingsPanel').classList.contains('hidden')) { hideSettingsPanel(); return; }
    if (!document.getElementById('boardSettingsPanel').classList.contains('hidden')) { cancelBoardSettingsPanel(); return; }
    if (selectedItemIds.size > 0) { clearSelection(); return; }
    if (!elements.modalOverlay.classList.contains('hidden')) { hideModal(); return; }
  });

  document.addEventListener('dragover', event => {
    if (isExternalDrag(event)) event.preventDefault();
  });
  document.addEventListener('drop', event => {
    if (isExternalDrag(event)) event.preventDefault();
  });

  // Receive a tab sent by the extension popup → drop into the active board's inbox.
  window.addEventListener('morpheus:receive-tab', e => {
    const detail = e.detail || {};
    void persistExternalTabDelivery(detail)
      .then(result => bridge.respondToPush(detail.pushRequestId, result))
      .catch(error => bridge.respondToPush(detail.pushRequestId, {
        ok: false,
        error: error?.message || String(error)
      }));
  });

  window.addEventListener('morpheus:receive-import-items', e => {
    if (typeof receiveExternalImportItems === 'function') {
      const detail = e.detail || {};
      void receiveExternalImportItems(detail.items || [], {
        source: detail.source || '',
        deliveryId: detail.deliveryId || ''
      })
        .then(result => bridge.respondToPush(detail.pushRequestId, result))
        .catch(error => bridge.respondToPush(detail.pushRequestId, {
          ok: false,
          error: error?.message || String(error)
        }));
    }
  });

  window.addEventListener('morpheus:receive-game', e => {
    const detail = e.detail || {};
    void Promise.resolve(hubInitializationPromise)
      .then(() => persistExternalGameDelivery(detail))
      .then(result => bridge.respondToPush(detail.pushRequestId, result))
      .catch(error => bridge.respondToPush(detail.pushRequestId, { ok: false, error: error?.message || String(error) }));
  });

  window.addEventListener('morpheus:update-game-binding', e => {
    const detail = e.detail || {};
    void Promise.resolve(hubInitializationPromise)
      .then(() => applyExternalGameBindingUpdate(detail.game || {}))
      .then(result => bridge.respondToPush(detail.pushRequestId, result))
      .catch(error => bridge.respondToPush(detail.pushRequestId, { ok: false, error: error?.message || String(error) }));
  });

  window.addEventListener('morpheus:get-inbox-targets', e => {
    void Promise.resolve(hubInitializationPromise)
      .then(() => {
        if (document.documentElement.classList.contains('hub-booting')) {
          throw new Error('The shared database is still unavailable.');
        }
        const boards = (state.boards || [])
          .filter(board => !board.locked)
          .map(board => ({
            id: board.id,
            title: board.title || 'Untitled Board',
            tabs: getBoardTabs(board).map(tab => ({ id: tab.id, title: tab.title || 'Untitled Tab' }))
          }))
          .filter(board => board.tabs.length > 0);
        bridge.respondToPush(e.detail?.pushRequestId, {
          ok: true,
          boards,
          activeBoardId: state.activeBoardId || '',
          activeTabId: state.activeTabId || ''
        });
      })
      .catch(error => bridge.respondToPush(e.detail?.pushRequestId, {
        ok: false,
        boards: [],
        error: error?.message || String(error)
      }));
  });

  window.addEventListener('morpheus:shared-disk-conflict', e => {
    promptSharedDiskConflict(e.detail || {});
  });

  window.addEventListener('morpheus:authoritative-state-changed', e => {
    const detail = e.detail || {};
    if (detail.version && detail.version === getSharedDiskBaselineVersion()) return;
    if (sharedDiskSaveIsPending() || hasPendingSharedDiskChanges()) {
      notifySharedDiskConflict({
        fileInfo: { version: detail.version || null, contentHash: detail.contentHash || '' },
        databasePath: detail.authority === 'host' ? state.databasePath : 'Relay storage'
      });
      return;
    }
    void reloadHubData({
      source: 'shared',
      notice: 'Portal data changed in another tab and was reloaded.'
    });
  });

  window.addEventListener('morpheus:bridge-ready', () => {
    void refreshBridgeStatusUi();
    void checkForSharedRecovery();
  });
}

attachEventListeners();
attachSettingsListeners();
attachBoardSettingsListeners();
attachFolderModalListeners();
attachDynamicRuleEditorListeners();
attachInboxListeners();
attachImportManagerListeners();
attachSetPanelListeners();
attachBookmarkImportListener();

async function initializeHubState() {
  let loadedFromShared = false;
  let startupSharedPath = '';
  let startupSharedLoadFailed = false;
  let startupSharedLoadError = '';
  try {
    if (typeof bridge !== 'undefined') {
      await bridge.whenReady;
      if (bridge.isAvailable()) {
        const info = await bridge.getStorageInfo();
        if (info?.authoritativeStorageAvailable) {
          const authorityKey = info.databasePath || info.storageMode || 'relay';
          startupSharedPath = authorityKey;
          const loaded = await bridge.loadState();
          if (loaded?.error) throw new Error(loaded.error);
          if (info.storageMode === 'host' && loaded?.fromDisk !== true) throw new Error('Shared database was not read from disk');
          if (!loaded?.json && loaded?.fileInfo?.exists !== false) {
            throw new Error('The shared database returned no hub data');
          }
          if (loaded?.json) {
            restoreStateSnapshot(loaded.json);
          } else {
            state = cloneData(defaultState);
            if (info.databasePath) state.databasePath = info.databasePath;
            const initialSnapshot = serializeStateSnapshot();
            const initialized = await bridge.saveState(initialSnapshot, {
              expectedVersion: loaded?.fileInfo?.version ?? null,
              expectedHash: loaded?.fileInfo?.contentHash || ''
            });
            if (!initialized?.ok || initialized.conflict) throw new Error('Relay could not initialize authoritative Portal storage');
            const verified = await bridge.loadState();
            if (!verified?.json || !snapshotsMatch(verified.json, initialSnapshot)) {
              throw new Error('The initialized Portal snapshot could not be verified');
            }
            restoreStateSnapshot(verified.json);
            loaded.fileInfo = verified.fileInfo || initialized.fileInfo || null;
          }
          if (info.databasePath) state.databasePath = info.databasePath;
          if (typeof acceptSharedDiskSnapshot === 'function') acceptSharedDiskSnapshot(loaded.fileInfo || null, authorityKey);
          else if (loaded?.fileInfo) setSharedDiskBaseline(loaded.fileInfo, authorityKey);
          else resetSharedDiskBaseline(authorityKey);
          persistStateToLocalCache(null, {
            source: 'shared',
            databasePath: info.databasePath || '',
            sharedBaselineVersion: loaded?.fileInfo?.version ?? null,
            sharedBaselinePath: authorityKey
          });
          startSharedDiskPolling();
          loadedFromShared = true;
          setPortalReadOnlyMode(false);
        }
      }
    }
    if (!loadedFromShared) {
      state = loadState();
      resetSharedDiskBaseline(state.databasePath || '');
      ensureLocalCacheMetadata(localStorage.getItem(STORAGE_KEY), {
        source: 'local',
        databasePath: state.databasePath || ''
      });
      setPortalReadOnlyMode(true, getPortalReadOnlyMessage());
    }
  } catch (error) {
    console.warn('Failed to initialize hub state from preferred source, falling back to browser cache.', error);
    const localSnapshot = localStorage.getItem(STORAGE_KEY);
    state = loadState();
    const localHasContent = hubSnapshotContentCount(summarizeHubSnapshot(localSnapshot)) > 0;
    startupSharedLoadFailed = !!startupSharedPath && !localHasContent;
    startupSharedLoadError = error?.message || String(error);
    resetSharedDiskBaseline(state.databasePath || '');
    ensureLocalCacheMetadata(localStorage.getItem(STORAGE_KEY), {
      source: 'local',
      databasePath: state.databasePath || ''
    });
    setPortalReadOnlyMode(true, 'Read-only: authoritative Portal storage could not be reached. The cached view is available while Cyrune Relay reconnects.');
  }

  if (typeof initializeServiceSecrets === 'function') {
    try {
      await initializeServiceSecrets();
    } catch (error) {
      console.warn('Failed to initialize service secrets', error);
    }
  }

  renderAll();
  if (typeof initializePhaseOneFeatures === 'function') initializePhaseOneFeatures();
  if (typeof initializeCommandPalette === 'function') initializeCommandPalette();
  if (typeof updateSidebarExtensionStatus === 'function') updateSidebarExtensionStatus();
  updateUndoRedoUI();
  isDirty = false;
  if (!startupSharedLoadFailed) document.documentElement.classList.remove('hub-booting');
  lastBridgeNativeReady = loadedFromShared;
  lastBridgeRecoveryPath = loadedFromShared ? startupSharedPath.trim() : '';
  const relayAvailable = typeof bridge !== 'undefined' && bridge.isAvailable();
  relayHasConnected = loadedFromShared || relayAvailable;
  relayWasUnavailable = relayHasConnected && !relayAvailable;
  startSharedRecoveryPolling();

  if (loadedFromShared) void bridge.resumePendingIntake?.().catch(() => {});
  if (startupSharedLoadFailed) {
    requestAnimationFrame(() => showNotice(
      `Cyrune Portal could not read the shared database at ${startupSharedPath}. The empty local fallback is being kept hidden while the connection retries. ${startupSharedLoadError}`
    ));
    setTimeout(() => { checkForSharedRecovery().catch(() => {}); }, 0);
  }

  try {
    const sharedDiskNotice = sessionStorage.getItem(SHARED_DISK_NOTICE_KEY);
    if (sharedDiskNotice) {
      sessionStorage.removeItem(SHARED_DISK_NOTICE_KEY);
      requestAnimationFrame(() => showNotice(sharedDiskNotice));
    }
  } catch {}

  if (typeof migrateBackgroundAssets === 'function') {
    setTimeout(() => {
      migrateBackgroundAssets().catch(error => {
        console.warn('Failed to migrate background assets', error);
      });
    }, 500);
  }

}

hubInitializationPromise = initializeHubState();
bridge.startGameIntake?.();
