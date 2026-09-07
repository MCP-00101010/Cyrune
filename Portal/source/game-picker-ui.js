let arcadeGamePickerDialog = null;

function showArcadeGamePicker(context) {
  if (arcadeGamePickerDialog) return;
  if (!bridge.catalogueIsAvailable?.()) { showNotice(arcadeGamePicker.message('unsupported-protocol')); return; }
  const destination = Object.freeze({ boardId: context?.boardId, tabId: context?.tabId, columnId: context?.columnId });
  let column;
  try { column = resolveGamePickerDestination(destination); }
  catch (error) { showNotice(arcadeGamePicker.message(error.code)); return; }
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <section class="modal-card arcade-game-picker" role="dialog" aria-modal="true" aria-labelledby="arcade-picker-title" tabindex="-1">
      <header><h2 id="arcade-picker-title">Add Game</h2><p data-picker-destination></p></header>
      <form class="arcade-picker-search">
        <label>Search games<input data-picker-query type="search" maxlength="160" placeholder="Search your Arcade library" autocomplete="off"></label>
        <label>Platform<select data-picker-platform><option value="">All platforms</option><option value="zx-spectrum">ZX Spectrum</option><option value="dos">DOS</option><option value="windows">Windows</option><option value="fm-towns">FM Towns</option><option value="amiga">Amiga</option><option value="atari-st">Atari ST</option><option value="macintosh">Macintosh</option><option value="unknown">Unspecified platform</option></select></label>
        <button type="submit" class="secondary-btn">Search</button>
      </form>
      <div data-picker-error role="alert"></div>
      <div class="arcade-picker-content">
        <div><div data-picker-results class="arcade-picker-results" aria-label="Arcade library results"></div><button data-picker-more class="secondary-btn" type="button" hidden>Load more</button></div>
        <aside data-picker-detail class="arcade-picker-detail" aria-label="Game details">Select Details to inspect a game.</aside>
      </div>
      <details><summary data-picker-selection-summary>Selected games (0)</summary><div data-picker-selection></div></details>
      <label class="arcade-picker-tags"><input data-picker-tags type="checkbox"> Copy suggested Arcade tags into Portal</label>
      <footer class="utility-panel-footer">
        <span data-picker-status role="status" aria-live="polite"></span>
        <button data-picker-refresh type="button" class="secondary-btn" hidden>Refresh selection</button>
        <button data-picker-add type="button" class="primary-btn" disabled>Add selected games</button>
        <button data-picker-close type="button" class="secondary-btn">Cancel</button>
      </footer>
    </section>`;
  const find = name => overlay.querySelector(`[data-picker-${name}]`);
  const query = find('query'), platform = find('platform'), results = find('results'), detail = find('detail');
  const add = find('add'), close = find('close'), refresh = find('refresh'), more = find('more'), tags = find('tags');
  find('destination').textContent = `Add to ${column.title || 'the chosen column'}.`;
  let timer, controller;
  let renderedRows = null;
  const resultControls = new Map();
  const render = model => {
    const focusKey = document.activeElement?.dataset?.pickerFocus;
    const resultScroll = results.scrollTop, detailScroll = detail.scrollTop;
    const browsing = model.phase === 'browse';
    const busy = ['binding', 'placing'].includes(model.phase);
    find('error').textContent = model.error;
    overlay.querySelector('section').setAttribute('aria-busy', String(busy));
    query.disabled = platform.disabled = tags.disabled = !browsing;
    overlay.querySelector('[type="submit"]').disabled = !browsing;
    close.disabled = busy;
    close.textContent = ['complete', 'save-failed'].includes(model.phase) ? 'Done' : 'Cancel';
    add.disabled = busy || (browsing ? !model.selected.size : !['retry', 'approved'].includes(model.phase));
    add.textContent = model.phase === 'retry' ? 'Retry same request' : model.phase === 'approved' ? 'Place approved games' : 'Add selected games';
    refresh.hidden = !['refresh-required', 'retry'].includes(model.phase);
    more.hidden = !browsing || !model.nextCursor;
    more.disabled = model.loading;
    find('status').textContent = busy ? (model.phase === 'placing' ? 'Saving games...' : 'Adding games...')
      : model.phase === 'complete' ? `${model.approved.length} games saved; ${model.failures.size} could not be added.`
      : model.phase === 'approved' ? `${model.approved.length} approved games await placement in the chosen column.`
      : model.phase === 'save-failed' ? 'Save outcome requires review.'
      : model.loading ? 'Searching...' : `${model.rows.length} results shown; ${model.selected.size} selected (maximum 100).`;
    if (renderedRows !== model.rows) {
      renderedRows = model.rows;
      resultControls.clear();
      results.replaceChildren();
      for (const game of model.rows) {
        const row = document.createElement('div'); row.className = 'arcade-picker-row';
        const label = document.createElement('label');
        const check = document.createElement('input'); check.type = 'checkbox';
        check.dataset.pickerFocus = `select:${game.catalogueId}`;
        check.addEventListener('change', () => controller.toggle(game));
        const body = document.createElement('span');
        const title = document.createElement('strong'); title.textContent = game.title;
        const metadata = document.createElement('small');
        metadata.textContent = [game.platformLabel, game.hardwareLabel, game.editionLabel, game.year, game.publisher].filter(Boolean).join(' · ');
        const availability = document.createElement('small');
        body.append(title, metadata, availability); label.append(check, body);
        const inspect = document.createElement('button'); inspect.type = 'button'; inspect.className = 'secondary-btn'; inspect.textContent = 'Details';
        inspect.dataset.pickerFocus = `detail:${game.catalogueId}`;
        inspect.setAttribute('aria-label', `Details for ${game.title}`);
        inspect.addEventListener('click', () => void controller.inspect(game));
        row.append(label, inspect); results.appendChild(row);
        resultControls.set(game.catalogueId, { check, availability, inspect });
      }
    }
    if (!model.rows.length) {
      const empty = document.createElement('p');
      empty.textContent = model.loading ? 'Searching the library...' : 'No matching games.';
      results.replaceChildren(empty);
    }
    for (const game of model.rows) {
      const { check, availability, inspect } = resultControls.get(game.catalogueId);
      check.checked = model.selected.has(game.catalogueId);
      check.disabled = !browsing || (!check.checked && (!['ready', 'available'].includes(game.availability) || model.selected.size >= 100));
      availability.textContent = model.failures.get(game.catalogueId) || (game.availability === 'ready' ? 'Ready' : arcadeGamePicker.message(game.availability));
      inspect.disabled = !browsing;
    }
    find('selection-summary').textContent = `Selected games (${model.selected.size})`;
    const selection = find('selection'); selection.replaceChildren();
    for (const game of model.selected.values()) {
      const row = document.createElement('div'); row.className = 'arcade-picker-selected';
      const name = document.createElement('span'); name.textContent = `${game.title} · ${game.hardwareLabel || game.platformLabel}${model.failures.has(game.catalogueId) ? ` — ${model.failures.get(game.catalogueId)}` : ''}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary-btn'; remove.textContent = 'Remove'; remove.disabled = !browsing;
      remove.dataset.pickerFocus = `remove:${game.catalogueId}`;
      remove.addEventListener('click', () => controller.toggle(game)); row.append(name, remove); selection.appendChild(row);
    }
    detail.replaceChildren();
    if (model.detail) {
      if (model.artwork) {
        const image = document.createElement('img'); image.src = model.artwork; image.alt = ''; image.width = 256; detail.appendChild(image);
      }
      const title = document.createElement('h3'); title.textContent = model.detail.title;
      const description = document.createElement('p'); description.textContent = model.detail.description || 'No description available.';
      const suggested = document.createElement('p'); suggested.textContent = `Suggested tags: ${model.detail.suggestedTags.join(', ') || 'None'}`;
      detail.append(title, description, suggested);
    } else detail.textContent = 'Select Details to inspect a game. Unavailable artwork uses the game’s text details.';
    if (focusKey) {
      const replacement = [...overlay.querySelectorAll('[data-picker-focus]')].find(control => control.dataset.pickerFocus === focusKey && !control.disabled);
      (replacement || (!add.disabled ? add : !close.disabled ? close : overlay.querySelector('section'))).focus({ preventScroll: true });
    }
    results.scrollTop = resultScroll; detail.scrollTop = detailScroll;
  };
  controller = arcadeGamePicker.create({
    session: () => bridge.catalogueSession(), uuid: () => crypto.randomUUID(), changed: render,
    search: payload => bridge.searchArcadeCatalogue(payload), detail: id => bridge.getArcadeCatalogueEntry(id),
    artwork: (id, ref) => bridge.getArcadeCatalogueArtwork(id, ref), bind: payload => bridge.bindArcadeCatalogueEntries(payload),
    destination: resolveGamePickerDestination, persist: persistGamePickerBatch,
    prepare: async () => {
      const result = await prepareForExternalDelivery();
      if (!result?.ok) throw Object.assign(new Error('Storage unavailable.'), { code: 'storage-unavailable' });
    },
  }, destination);
  const search = () => { clearTimeout(timer); void controller.search(query.value.trim(), platform.value ? [platform.value] : []); };
  const dismiss = () => {
    if (!controller.close()) return;
    clearTimeout(timer); overlay.remove(); arcadeGamePickerDialog = null;
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  query.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 150); });
  platform.addEventListener('change', search);
  overlay.querySelector('form').addEventListener('submit', event => { event.preventDefault(); search(); });
  more.addEventListener('click', () => void controller.search(controller.model.query, controller.model.platformIds, true));
  add.addEventListener('click', () => {
    if (controller.model.phase === 'approved') void controller.place();
    else void controller.confirm(tags.checked, controller.model.phase === 'retry');
  });
  refresh.addEventListener('click', () => controller.refresh());
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const controls = [...overlay.querySelectorAll('input, select, button, summary')].filter(control => !control.disabled && !control.hidden && control.getClientRects().length);
      if (!controls.length) { event.preventDefault(); return; }
      const index = controls.indexOf(document.activeElement);
      if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === controls.length - 1)) {
        event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0].focus();
      }
    }
  });
  document.body.appendChild(overlay); arcadeGamePickerDialog = overlay; query.focus(); search();
}
