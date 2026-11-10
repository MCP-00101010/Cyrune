// The Search panel composes Portal records, shared web providers and transient
// Arcade pages. Only explicit placement binds a catalogue entry on this device.
const portalUnifiedSearch = (() => {
  const key = 'cyrune-portal-search-preferences-v1';
  let preferences = {remember:false, recents:[], provider:''};
  try {
    const raw = localStorage.getItem(key);
    const value = raw && raw.length < 16000 ? JSON.parse(raw) : {};
    preferences = {remember:value.remember === true, provider:typeof value.provider === 'string' ? value.provider.slice(0,80) : '',
      recents:value.remember === true && Array.isArray(value.recents) ? value.recents.filter(item => typeof item === 'string' && item.length <= 300).slice(0,20) : []};
  } catch { /* Defaults. */ }
  let controller, catalogueKey = '', root, selected = -1, lastQuery = '', dragging = null, busy = false, previousFocus, providerSelect;
  const input = () => elements.searchModalInput;
  const remember = () => {
    if (!preferences.remember || !input().value.trim()) return;
    const query = input().value.trim().slice(0,300);
    preferences.recents = [query,...preferences.recents.filter(value => value !== query)].slice(0,20); savePreferences();
  };
  const savePreferences = () => { try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Optional history. */ } };
  const providerConfig = () => {
    const widget = typeof _commandPaletteStoredWidgets === 'function' ? _commandPaletteStoredWidgets().find(entry => entry.item.widgetType === 'universalSearch')?.item : null;
    return widget?.config || {};
  };
  const button = (label, run, row = true) => {
    const el = document.createElement('button'); el.type = 'button'; el.className = 'unified-search-action secondary-btn'; el.textContent = label;
    if (row) el.dataset.searchAction = 'true';
    el.addEventListener('click', run); return el;
  };
  function chooseDestination(itemType, run) {
    const choices = searchPlacementChoices(itemType);
    if (!choices.length) { showNotice('Create an unlocked destination or free a launcher slot first.'); return; }
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay search-placement-overlay';
    const card = document.createElement('section'); card.className = 'modal-card search-placement-dialog';
    card.setAttribute('role','dialog'); card.setAttribute('aria-modal','true'); card.setAttribute('aria-label','Choose destination');
    const label = document.createElement('label'); label.textContent = 'Place in';
    const select = document.createElement('select'); choices.forEach((choice,index) => select.add(new Option(choice.label,String(index))));
    const preferred = choices.findIndex(choice => choice.destination.boardId === state.activeBoardId && choice.destination.tabId === state.activeTabId && !choice.destination.folderId);
    if (preferred >= 0) select.value = String(preferred);
    label.append(select);
    const oldFocus = document.activeElement;
    const close = () => { overlay.remove(); if (oldFocus?.isConnected) oldFocus.focus(); };
    const apply = button('Place here', () => { const destination = choices[Number(select.value)]?.destination; if (destination) { close(); void run(destination); } }, false);
    const cancel = button('Cancel', close, false);
    card.append(label,apply,cancel); overlay.append(card); document.body.append(overlay); select.focus();
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const controls = [select,apply,cancel], index = controls.indexOf(document.activeElement);
        if (event.shiftKey && index === 0 || !event.shiftKey && index === 2) { event.preventDefault(); controls[event.shiftKey ? 2 : 0].focus(); }
      }
    });
  }
  function decorate(el, item, meta) {
    el.dataset.searchAction = 'true'; el.tabIndex = 0;
    el.addEventListener('click', remember);
    if (el.tagName !== 'A') el.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); el.click(); }
    });
    if (!['bookmark','game','application'].includes(item.type)) return el;
    el.draggable = true;
    el.title = `${el.title || item.title || ''}\nDrag to move; Shift+Enter chooses a destination.`;
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); event.stopImmediatePropagation(); chooseDestination(item.type, destination => moveLocal(meta,item.id,destination)); }
    }, true);
    el.addEventListener('dragstart', event => {
      if (!resolveSearchSource(meta,item.id) || resolveSearchSource(meta,item.id).locked) { event.preventDefault(); return; }
      dragging = {meta:{...meta},itemId:item.id,type:item.type};
      event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain',item.title || item.type);
      event.stopPropagation();
      elements.searchModal.classList.add('search-is-dragging');
    });
    el.addEventListener('dragend', clearDrag);
    return el;
  }
  async function moveLocal(meta, id, destination) {
    if (busy) { showNotice('Wait for the current placement to finish before moving another item.'); return; }
    busy = true;
    try { await moveSearchItem(meta,id,destination); remember(); }
    catch (error) { showNotice(error.message); }
    finally { busy = false; }
  }
  async function addGame(game, destination) {
    if (busy) { showNotice('Wait for the current placement to finish before adding another game.'); return; }
    busy = true;
    let placing;
    try {
      placing = arcadeGamePicker.create({session:() => bridge.catalogueSession(), uuid:() => crypto.randomUUID(),
        bind:payload => bridge.bindArcadeCatalogueEntries(payload),
        destination:(target,count) => resolveSearchPlacement(target,'game',count || 1), persist:persistSearchGames,
        prepare:async () => { const result = await prepareForExternalDelivery(); if (!result?.ok) throw Object.assign(new Error(),{code:'storage-unavailable'}); }
      },destination);
      placing.toggle(game); await placing.confirm();
      const model = placing.model;
      if (model.phase === 'complete' && model.approved.length) { remember(); showNotice('Game added. Undo is available.'); }
      else showNotice(model.error || [...model.failures.values()][0] || 'The game was not added. Search again and review its current setup.');
    } catch (error) { showNotice(error.message || 'The game could not be added.'); }
    finally { placing?.close(); busy = false; }
  }
  function clearDrag() { dragging = null; elements.searchModal.classList.remove('search-is-dragging'); document.querySelectorAll('.search-drop-target').forEach(el => el.classList.remove('search-drop-target')); }
  function dropDestination(target) {
    if (target.closest('#searchModal')) return null;
    const slot = target.closest('.essential-slot, .speed-slot');
    if (slot) return {element:slot,destination:{kind:slot.classList.contains('essential-slot') ? 'essential' : 'speed-dial',boardId:state.activeBoardId,slot:Number(slot.dataset.slot)}};
    const card = target.closest('.board-column-item[data-item-id]');
    const column = target.closest('[data-column-id]');
    if (!column || !column.dataset.columnId) return null;
    const destination = {boardId:state.activeBoardId,tabId:state.activeTabId,columnId:column.dataset.columnId};
    if (card) {
      const source = resolvePortalItemContext({area:'board-item',boardId:destination.boardId,itemId:card.dataset.itemId});
      if (source?.item.type === 'folder') destination.folderId = source.item.id;
      else if (card.closest('.folder-children')) {
        destination.folderId = card.closest('.folder-children').parentElement.closest('[data-item-id]')?.dataset.itemId;
        destination.beforeId = card.dataset.itemId;
      } else destination.beforeId = card.dataset.itemId;
    }
    return {element:card || column,destination};
  }
  function drawCatalogue(model) {
    if (!root?.isConnected) return;
    const section = root.querySelector('[data-catalogue-results]'); if (!section) return;
    const focused = document.activeElement?.dataset.catalogueFocus;
    section.replaceChildren();
    const status = document.createElement('p'); status.setAttribute('role','status');
    status.textContent = model.loading ? 'Searching Arcade…' : model.error || (model.rows.length ? 'Arcade library · Add a game or drag it to a destination' : 'No matching Arcade games.');
    section.append(status);
    for (const game of model.rows) {
      const row = button(`${game.title} · ${game.hardwareLabel || game.platformLabel}${game.editionLabel ? ` · ${game.editionLabel}` : ''}`, () => chooseDestination('game', destination => addGame(game,destination)));
      row.dataset.catalogueFocus = game.catalogueId;
      row.setAttribute('aria-label',`Add ${game.title}, ${game.hardwareLabel || game.platformLabel}, ${game.editionLabel || 'standard edition'}`);
      row.disabled = !['ready','available'].includes(game.availability);
      if (row.disabled) row.title = arcadeGamePicker.message(game.availability);
      row.draggable = !row.disabled;
      row.addEventListener('dragstart', event => {
        dragging = {game,type:'game'}; event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('text/plain',game.title); event.stopPropagation(); elements.searchModal.classList.add('search-is-dragging');
      }); row.addEventListener('dragend',clearDrag); section.append(row);
    }
    if (model.nextCursor) section.append(button('Load more Arcade games',() => void controller.search(model.query,model.platformIds,true)));
    if (model.error) section.append(button('Retry Arcade search',() => controller.refresh()));
    if (focused) [...section.querySelectorAll('[data-catalogue-focus]')].find(el => el.dataset.catalogueFocus === focused)?.focus({preventScroll:true});
  }
  function render() {
    const query = input().value.trim();
    if (query !== lastQuery) { selected = -1; lastQuery = query; }
    root = document.createElement('div'); root.className = 'unified-search-sources'; elements.searchModalResults.append(root);
    const config = providerConfig(), parsed = CyruneSearchProviders.parse(query,config);
    if (providerSelect) {
      const choices = CyruneSearchProviders.choices('@',config);
      const signature = JSON.stringify(choices.map(choice => [choice.provider.id,choice.label]));
      if (providerSelect.dataset.providers !== signature) {
        providerSelect.replaceChildren();
        choices.forEach(choice => providerSelect.add(new Option(choice.label,choice.provider.id)));
        providerSelect.dataset.providers = signature;
      }
      providerSelect.value = choices.some(choice => choice.provider.id === preferences.provider) ? preferences.provider : parsed.provider.id;
    }
    if (!query) {
      const hint = document.createElement('p'); hint.textContent = 'Find Portal items and Arcade games, enter a URL, or type @ for web providers. Drag results to place them; Shift+Enter moves a Portal item.'; root.append(hint);
      for (const recent of preferences.recents) root.append(button(recent,() => { input().value = recent; input().focus(); renderSearchResults(); }));
    } else {
      const choices = CyruneSearchProviders.choices(query,config);
      if (query.startsWith('@') && !query.includes(' ')) {
        for (const choice of choices) root.append(button(`${choice.label} · @${choice.provider.alias}`,() => { input().value = choice.fill; input().focus(); renderSearchResults(); }));
      } else {
        const direct = CyruneSearchProviders.directUrl(query);
        const providers = CyruneSearchProviders.choices('@',config).map(choice => choice.provider);
        const provider = parsed.explicit ? parsed.provider : providers.find(value => value.id === preferences.provider) || parsed.provider;
        const url = direct || CyruneSearchProviders.url(provider, parsed.query);
        if (url && parsed.query) root.append(button(direct ? `Open ${direct}` : `Search ${provider.name}: ${parsed.query}`,event => {
          event.preventDefault(); remember(); openHubBookmark({type:'bookmark',title:query,url});
        }));
      }
    }
    const nextKey = query && !parsed.explicit && !query.startsWith('@') && !activeTagFilters.size && searchFilters.typeGame && query.length <= 160 ? query : '';
    const section = document.createElement('section'); section.dataset.catalogueResults = ''; section.setAttribute('aria-label','Arcade library results'); root.append(section);
    if (nextKey !== catalogueKey) { controller?.close(); controller = null; catalogueKey = nextKey; }
    if (!nextKey) return;
    if (!bridge.catalogueIsAvailable?.()) { section.textContent = 'Arcade library search is unavailable. Connect Relay and Host to browse; saved Portal games remain searchable.'; return; }
    if (!controller) {
      controller = arcadeGamePicker.create({session:() => bridge.catalogueSession(), changed:drawCatalogue,
        search:payload => bridge.searchArcadeCatalogue(payload)},{});
      void controller.search(nextKey);
    } else drawCatalogue(controller.model);
  }
  function init() {
    const modal = elements.searchModal;
    modal.setAttribute('role','dialog'); modal.setAttribute('aria-label','Unified search');
    input().setAttribute('aria-label','Search Portal, Arcade and the web');
    input().placeholder = 'Search Portal, Arcade, URLs or @providers…';
    const footer = modal.querySelector('.utility-panel-footer');
    const provider = document.createElement('select'); providerSelect = provider; provider.setAttribute('aria-label','Web search provider');
    for (const choice of CyruneSearchProviders.choices('@',providerConfig())) provider.add(new Option(choice.label,choice.provider.id));
    provider.value = preferences.provider || CyruneSearchProviders.parse('',providerConfig()).provider.id;
    provider.addEventListener('change',() => { preferences.provider = provider.value; savePreferences(); renderSearchResults(); });
    const label = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.checked = preferences.remember;
    label.append(check,document.createTextNode('Remember searches'));
    check.addEventListener('change',() => { preferences.remember = check.checked; if (!check.checked) preferences.recents = []; savePreferences(); renderSearchResults(); });
    footer.prepend(provider,label);
    modal.addEventListener('keydown',event => {
      if (!['ArrowDown','ArrowUp','Enter','Home','End'].includes(event.key) || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target !== input() && !event.target.matches('[data-search-action]')) return;
      const rows = [...modal.querySelectorAll('[data-search-action]')].filter(el => !el.disabled);
      if (!rows.length) return;
      const index = rows.indexOf(document.activeElement);
      if (event.key === 'Enter') {
        if (event.target !== input()) return;
        event.preventDefault(); rows[Math.max(0,selected)]?.click(); return;
      }
      if (event.target === input() && ['Home','End'].includes(event.key)) return;
      event.preventDefault();
      selected = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0,Math.min(rows.length - 1,(index < 0 ? selected : index) + (event.key === 'ArrowDown' ? 1 : -1)));
      rows[selected]?.focus();
    });
    document.addEventListener('dragover',event => {
      if (!dragging) return;
      event.stopImmediatePropagation();
      document.querySelectorAll('.search-drop-target').forEach(el => el.classList.remove('search-drop-target'));
      const drop = dropDestination(event.target);
      if (!drop) return;
      try { resolveSearchPlacement(drop.destination,dragging.type); event.preventDefault(); event.dataTransfer.dropEffect = dragging.game ? 'copy' : 'move'; drop.element.classList.add('search-drop-target'); }
      catch { event.dataTransfer.dropEffect = 'none'; }
    },true);
    document.addEventListener('drop',event => {
      if (!dragging) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const payload = dragging, drop = dropDestination(event.target); clearDrag();
      if (!drop) return;
      if (payload.game) void addGame(payload.game,drop.destination);
      else void moveLocal(payload.meta,payload.itemId,drop.destination);
    },true);
  }
  return {init,render,decorate,opened:() => { previousFocus = document.activeElement; },closed:() => {
    catalogueKey = ''; controller?.close(); controller = null; root = null; selected = -1; clearDrag(); if (previousFocus?.isConnected) previousFocus.focus();
  }};
})();
