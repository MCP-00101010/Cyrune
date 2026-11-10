'use strict';

// One lifecycle owns all external delivery persistence. Presentation and payload
// validation remain specific to the three supported destinations.
const portalExternalDeliveries = (() => {
  let tail = Promise.resolve();
  const timeoutMs = 45000;

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


  function normalize(kind, detail) {
    const deliveryId = String(detail.deliveryId || `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 160);
    if (kind === 'import-manager') {
      const items = (Array.isArray(detail.items) ? detail.items : [])
        .map(normalizeExternalImportItem).filter(Boolean)
        .map((item, index) => assignExternalImportDeliveryIds(item, deliveryId, [index]));
      if (!items.length) throw new Error('No valid bookmarks were received for Import Manager.');
      return items;
    }
    if (kind === 'bookmark-inbox') {
      const url = typeof detail.url === 'string' ? detail.url.trim() : '';
      if (!url || !isValidUrl(url)) throw new Error('The received tab URL is invalid.');
      return [{ id: `bm-delivery-${deliveryId}`, type: 'bookmark',
        title: detail.title || url || 'Untitled', url: normalizeUrl(url), tags: [],
        faviconCache: detail.faviconCache || '' }];
    }
    if (kind !== 'game-inbox') throw new Error('Unsupported external delivery destination.');
    const source = detail.game && typeof detail.game === 'object' ? detail.game : {};
    const gameKey = String(source.gameKey || '').trim();
    if (!/^game_[a-zA-Z0-9_-]{12,75}$/.test(gameKey)) throw new Error('The received game binding is invalid.');
    const thumbnail = String(source.thumbnailCache || '');
    if (thumbnail && (!/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(thumbnail) || thumbnail.length > 700000)) {
      throw new Error('The received game thumbnail is invalid.');
    }
    const itemId = `game-delivery-${deliveryId}`;
    const item = {
      id: itemId,
      type: 'game',
      title: String(source.title || 'Game').slice(0, 160),
      gameKey,
      catalogueId: typeof source.catalogueId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(source.catalogueId) ? source.catalogueId : '',
      tags: (Array.isArray(source.tags) ? source.tags : []).map(tag => String(tag || '').slice(0, 80)).filter(Boolean).slice(0, 12),
      systemId: /^[a-z0-9][a-z0-9_-]{0,47}$/.test(String(source.systemId || '').trim().toLowerCase())
        ? String(source.systemId).trim().toLowerCase() : '',
      systemName: String(source.systemName || '').trim().slice(0, 80),
      emulatorName: String(source.emulatorName || '').trim().slice(0, 120),
      profileName: String(source.profileName || '').trim().slice(0, 120),
      thumbnailCache: thumbnail
    };

    return [item];
  }

  function contains(items, id) {
    return (items || []).some(item => item.id === id || item.type === 'folder' && contains(item.children, id));
  }

  function snapshotContains(snapshot, kind, items) {
    const lists = kind === 'import-manager' ? [snapshot.importManager?.items || []]
      : (snapshot.boards || []).flatMap(board => getBoardTabs(board).map(tab => getBoardInbox(board, tab)?.items || []));
    return items.every(item => lists.some(list => contains(list, item.id)));
  }

  function savedDuplicate(kind, items) {
    try {
      const saved = getAuthoritativePortalSnapshot();
      return !!saved && snapshotContains(JSON.parse(saved), kind, items);
    } catch { return false; }
  }

  function insert(kind, originals, destination, pushUndo) {
    let parent;
    if (kind === 'import-manager') {
      if (!state.importManager) state.importManager = { items: [], lastImportedAt: null };
      parent = state.importManager.items;
    } else {
      const target = resolveExternalInboxTarget(destination.boardId, destination.tabId);
      if (target.error) throw new Error(target.error);
      parent = target.inbox.items;
    }
    const missing = originals.filter(item => kind === 'import-manager'
      ? !getImportManagerItemById(item.id) : !findInboxDeliveryItem(item.id))
      .map(item => JSON.parse(JSON.stringify(item)));
    if (!missing.length) return false;
    if (pushUndo) pushUndoSnapshot();
    parent.push(...missing);
    if (typeof phaseTwoApplyAutomationRecords === 'function') {
      const records = [];
      if (kind === 'import-manager') phaseTwoWalkItems(missing, 'import-manager', records, parent);
      else missing.forEach(item => records.push({ item, parent, source: 'extension' }));
      phaseTwoApplyAutomationRecords(records, { pushUndo: false, persist: false, render: false });
    }
    if (kind === 'import-manager') state.importManager.lastImportedAt = new Date().toISOString();
    return true;
  }

  function render(kind, detail, result) {
    if (kind === 'import-manager') {
      renderImportManagerPanel();
      if (result.ok && !result.conflict) {
        const { bookmarks, folders } = getImportManagerCounts();
        const source = detail.source === 'bookmarks-menu' ? ' from Firefox bookmarks' : '';
        showNotice(`Imported ${bookmarks} bookmarks in ${folders} folders${source} into Import Manager.`);
      }
    } else {
      renderNav();
      renderBoardTabBar(getActiveBoard(), getActiveTab());
      updateInboxBadge();
      if (typeof inboxPanelOpen !== 'undefined' && inboxPanelOpen) renderInboxPanel();
    }
  }

  async function perform(kind, detail, attempt) {
    const prepared = await prepareForExternalDelivery();
    if (!prepared.ok) return prepared;
    if (attempt.timedOut) return { ok: false, timedOut: true, error: 'The delivery expired before it could start.' };
    let items;
    let destination;
    try {
      items = normalize(kind, detail);
      if (kind !== 'import-manager') {
        if (attempt.destinationError) throw new Error(attempt.destinationError);
        const target = resolveExternalInboxTarget(attempt.destination.boardId, attempt.destination.tabId);
        if (target.error) throw new Error(target.error);
        destination = { boardId: target.board.id, tabId: target.tab.id };
      }
      if (snapshotContains(state, kind, items) && savedDuplicate(kind, items)) {
        return { ok: true, duplicate: true, persisted: 'shared' };
      }
      insert(kind, items, destination, true);
      const sequence = getLocalStateMutationSequence() + 1;
      let result = await saveState();
      if (result?.conflict && !attempt.timedOut && getLocalStateMutationSequence() === sequence) {
        if (!await reloadHubData({ source: 'shared', notice: '' })) {
          result = { ok: false, conflict: true, error: 'Could not refresh the shared database during delivery.' };
        } else if (snapshotContains(state, kind, items) && savedDuplicate(kind, items)) {
          result = { ok: true, duplicate: true, persisted: 'shared' };
        } else {
          // Authoritative reload resets Undo/Redo history. Capture its fresh
          // baseline so the accepted delivery still has one usable Undo step.
          insert(kind, items, destination, true);
          result = await saveState();
        }
      }
      result = result?.ok && !result.conflict
        ? { ok: true, persisted: result.persisted || 'shared', ...(result.duplicate ? { duplicate: true } : {}) }
        : { ok: false, conflict: result?.conflict === true,
          error: result?.error || (result?.conflict ? 'The shared database changed during delivery.' : 'The delivery could not be saved yet.') };
      render(kind, detail, result);
      return result;
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  async function receive(kind, detail = {}) {
    // Defaults are not an authoritative snapshot. Wait before capturing a
    // destination, even when Relay can already accept writes during startup.
    if (typeof hubInitializationPromise !== 'undefined') await hubInitializationPromise;
    return receiveInitialized(kind, detail);
  }

  function receiveInitialized(kind, detail) {
    // The caller may time out, but the queue remains fenced until the original
    // save settles. A retry cannot mutate/rebase under an uncertain write.
    const attempt = { timedOut: false };
    // Capture the destination before waiting behind another delivery. Changes
    // to active tabs while persistence is pending cannot redirect this request.
    if (kind !== 'import-manager') {
      const target = resolveExternalInboxTarget(detail.targetBoardId || '', detail.targetTabId || '');
      if (target.error) attempt.destinationError = target.error;
      else attempt.destination = { boardId: target.board.id, tabId: target.tab.id };
    }
    const work = tail.then(() => attempt.timedOut
      ? { ok: false, timedOut: true, error: 'The delivery expired before it could start.' }
      : perform(kind, detail, attempt));
    tail = work.catch(() => {});
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        attempt.timedOut = true;
        resolve({ ok: false, timedOut: true,
          error: 'Timed out while saving the delivery. Its result is not yet confirmed.' });
      }, timeoutMs);
      work.then(result => { clearTimeout(timer); resolve(result); }, error => {
        clearTimeout(timer); resolve({ ok: false, error: error?.message || String(error) });
      });
    });
  }

  return Object.freeze({ receive });
})();
