// Search and reviewed Inbox moves share exact, revalidated destinations.
function searchPlacementChoices(itemType = 'bookmark', includeSlots = true) {
  const choices = [];
  const add = (label, destination) => {
    try { resolveSearchPlacement(destination, itemType); choices.push({label,destination}); } catch { /* Unavailable. */ }
  };
  for (const board of state.boards) {
    for (const tab of board.tabs || []) {
      for (const column of getBoardItemContainers(board, tab)) {
        const base = {boardId:board.id,tabId:tab.id,columnId:column.id};
        const label = `${board.title} / ${tab.title} / ${column.title || 'Inbox'}`;
        add(label, base);
        const walk = (items, path) => {
          for (const item of items || []) if (item.type === 'folder') {
            add(`${path} / ${item.title}`, {...base,folderId:item.id});
            if (!isDynamicFolder(item)) walk(item.children, `${path} / ${item.title}`);
          }
        };
        walk(column.items, label);
      }
    }
    if (includeSlots) for (let slot = 0; slot < getSpeedDialSlotCount(board); slot++) add(`${board.title} / Speed Dial ${slot + 1}`, {kind:'speed-dial',boardId:board.id,slot});
  }
  if (includeSlots) for (let slot = 0; slot < (state.settings.essentialsDisplayCount || 10); slot++) add(`Essentials ${slot + 1}`, {kind:'essential',slot});
  return choices;
}

function resolveSearchPlacement(destination, itemType, count = 1) {
  const fail = () => { throw Object.assign(new Error('The destination is missing, locked, full or does not accept this item.'), {code:'destination-unavailable'}); };
  if (typeof portalReadOnlyMode !== 'undefined' && portalReadOnlyMode || !bridge.storageIsAvailable?.() || sharedDiskSyncIsBlocked()) {
    throw Object.assign(new Error('Restore Portal’s storage connection before placing items.'), {code:'storage-unavailable'});
  }
  if (!['bookmark','application','game'].includes(itemType) || !Number.isInteger(count) || count < 1 || count > 100) return fail();
  if (destination.kind === 'essential') {
    const slot = destination.slot;
    if (count !== 1 || !Number.isInteger(slot) || slot < 0 || slot >= (state.settings.essentialsDisplayCount || 10) || state.essentials[slot]) return fail();
    return {list:state.essentials, slot};
  }
  const board = state.boards.find(row => row.id === destination.boardId);
  if (!board || board.locked) return fail();
  if (destination.kind === 'speed-dial') {
    const slot = destination.slot;
    if (count !== 1 || !Number.isInteger(slot) || slot < 0 || slot >= getSpeedDialSlotCount(board) || board.speedDial[slot]) return fail();
    return {list:board.speedDial, slot};
  }
  const tab = board.tabs?.find(row => row.id === destination.tabId);
  const column = tab && getBoardItemContainers(board, tab).find(row => row.id === destination.columnId);
  if (!tab || tab.locked || !column || column.locked || !Array.isArray(column.items)) return fail();
  let list = column.items;
  if (destination.folderId) {
    const current = resolvePortalItemContext({area:'board-item',boardId:board.id,itemId:destination.folderId});
    if (!current || current.tabId !== tab.id || current.columnId !== column.id || current.locked || current.item.type !== 'folder'
        || isDynamicFolder(current.item) || !canInsertIntoFolder(current.item, itemType)) return fail();
    list = current.item.children;
  }
  if (!Array.isArray(list) || list.length + count > 10000) return fail();
  if (destination.beforeId && !list.some(row => row.id === destination.beforeId)) return fail();
  return {list, slot:null};
}

function resolveSearchSource(meta, itemId) {
  if (meta.area === 'import-manager-item') {
    const walk = (items, inherited = false) => {
      for (const item of items || []) {
        const locked = inherited || item.locked === true;
        if (item.id === itemId) return {item, list:items, locked};
        const found = walk(item.children, locked); if (found) return found;
      }
      return null;
    };
    return walk(state.importManager?.items);
  }
  const current = resolvePortalItemContext({...meta,itemId});
  if (!current) return null;
  const board = state.boards.find(row => row.id === current.boardId);
  const list = current.area === 'essential' ? state.essentials : current.area === 'speed-dial-item' ? board?.speedDial
    : findBoardItemInColumns(board, itemId)?.list;
  return list ? {...current,list} : null;
}

async function moveSearchItem(meta, itemId, destination) {
  const source = resolveSearchSource(meta, itemId);
  if (!source || source.locked) throw new Error('The original item is missing or locked.');
  const target = resolveSearchPlacement(destination, source.item.type);
  if (source.list === target.list && target.slot === null && !destination.beforeId) return false;
  if (destination.beforeId === itemId) return false;
  const index = source.list.indexOf(source.item);
  if (index < 0) throw new Error('The original item changed. Search again.');
  pushUndoSnapshot();
  if (['essential','speed-dial-item'].includes(meta.area)) source.list[index] = null;
  else source.list.splice(index, 1);
  if (target.slot !== null) {
    while (target.list.length <= target.slot) target.list.push(null);
    target.list[target.slot] = source.item;
  } else {
    const before = destination.beforeId ? target.list.findIndex(row => row.id === destination.beforeId) : target.list.length;
    target.list.splice(before, 0, source.item);
  }
  invalidateDerivedCaches(); renderContentSurfaces();
  const saved = await saveState();
  if (!saved?.ok || saved.conflict) throw new Error('The move could not be confirmed. Follow Portal’s storage recovery guidance.');
  return true;
}

async function persistSearchGames(destination, games) {
  const target = resolveSearchPlacement(destination, 'game', games.length);
  const cards = games.map(game => ({id:`game-item-${crypto.randomUUID()}`,type:'game',title:game.title,
    gameKey:game.gameKey,systemId:game.systemId,systemName:game.systemName,catalogueId:game.catalogueId,tags:[],thumbnailCache:''}));
  pushUndoSnapshot();
  if (target.slot !== null) {
    while (target.list.length <= target.slot) target.list.push(null);
    target.list[target.slot] = cards[0];
  } else {
    const index = destination.beforeId ? target.list.findIndex(row => row.id === destination.beforeId) : target.list.length;
    target.list.splice(index, 0, ...cards);
  }
  invalidateDerivedCaches(); renderContentSurfaces();
  return await saveState();
}
