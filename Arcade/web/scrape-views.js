// Scraping dialogs use the shared app state/API and the transport-independent batch model.
async function showBulkScrapeModal(games) {
  if (document.querySelector('[data-bulk-scrape]') || !canScrapeMetadata()) return;
  if (!games.length || games.length > 100 || games.some(game => ['incoming','trash'].includes(game.view))) {
    await renderDetails('Select between 1 and 100 collection games.', true);
    return;
  }
  const collectionId = state.activeCollection.id;
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay'; overlay.dataset.bulkScrape = '';
  overlay.innerHTML = `<section class="modal bulk-scrape-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-scrape-title">
    <header class="bulk-scrape-header">
      <h2 id="bulk-scrape-title">Scrape Metadata</h2>
      <label class="bulk-scrape-provider">Metadata provider <select data-bulk-provider></select></label>
    </header>
    <div class="scrape-save-options"><label><input type="checkbox" data-bulk-missing> Fill missing fields only</label><button class="secondary" data-bulk-undo disabled>Undo last scrape</button></div>
    <div class="bulk-scrape-results" data-bulk-results></div>
    <p data-bulk-status role="status" aria-live="polite">Loading providers...</p>
    <footer class="modal-actions">
      <button class="secondary" data-bulk-failed hidden>Retry failed searches</button><button class="secondary" data-bulk-discard>Discard review</button><button class="secondary" data-bulk-search hidden>Find remaining matches</button>
      <button class="secondary" data-bulk-stop hidden>Stop after current game</button>
      <button data-bulk-apply disabled>Apply matches</button>
      <button class="secondary" data-bulk-close>Close</button>
    </footer></section>`;
  document.body.appendChild(overlay);
  const el = key => overlay.querySelector('[data-bulk-' + key + ']');
  let batch = null, running = false, error = '', providers = [], plannedGames = [];
  const undoGroup = 'batch-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const covers = createBulkArtworkObserver(el('results'), () => overlay.isConnected);
  const rowNodes = new Map();
  let draftTimer;
  const persist = () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      if (batch) globalThis.ArcadeScrapeDrafts.save(collectionId, el('provider').value, batch.draft(), games.map(game => game.id));
    }, 150);
  };
  const render = view => {
    if (!overlay.isConnected) return;
    const busy = running || view.busy;
    const focused = document.activeElement;
    const focusKey = focused?.dataset?.bulkTerm || focused?.dataset?.bulkPlatform || focused?.dataset?.bulkMatch;
    const focusKind = focused?.dataset?.bulkTerm ? 'term' : focused?.dataset?.bulkPlatform ? 'platform' : 'match';
    const caret = focusKind === 'term' ? [focused?.selectionStart, focused?.selectionEnd] : null;
    const remote = ['screenscraper','thegamesdb'].includes(providers.find(provider => provider.id === el('provider').value)?.type);
    const saved = view.rows.filter(row => row.status === 'saved').length;
    const selected = view.rows.filter(row => row.status === 'matched' && row.selected).length;
    const failed = view.rows.filter(row => ['failed','unconfirmed','no-match'].includes(row.status)).length;
    overlay.setAttribute('aria-busy', String(busy));
    el('provider').disabled = busy || view.rows.some(row => ['saved','unconfirmed'].includes(row.status));
    el('close').disabled = busy;
    el('missing').disabled = busy; el('undo').disabled = busy;
    el('stop').hidden = !busy; el('stop').disabled = !busy;
    el('search').hidden = !view.rows.some(row => row.status === 'queued'); el('search').disabled = busy;
    el('apply').disabled = busy || !selected; el('apply').textContent = `Apply ${selected} match${selected === 1 ? '' : 'es'}`;
    el('failed').hidden = !view.rows.some(row => ['failed','no-match'].includes(row.status)); el('failed').disabled = busy;
    el('discard').disabled = busy;
    const activeRows = new Set();
    for (const row of view.rows) {
      activeRows.add(row.game.id);
      const signature = JSON.stringify([row, busy, remote]);
      const existing = rowNodes.get(row.game.id);
      if (existing?.signature === signature) continue;
      const match = row.match;
      const cover = match?.remote_assets?.loading_screen || match?.candidate?.loading_screen || match?.remote_assets?.screenshot || match?.candidate?.screenshot || '';
      const id = escapeHtml(row.game.id);
      const locked = busy || ['saved','unconfirmed'].includes(row.status);
      const system = globalThis.ArcadePlatforms.searchLabel(row.game);
      const status = row.status === 'matched' && !row.selected ? 'Review match' : {queued:'Waiting', searching:'Searching...', matched:'Ready', 'no-match':'No match', failed:'Lookup failed', saving:'Saving...', saved:'Saved', unconfirmed:'Save not confirmed'}[row.status];
      const resultLabel = choice => escapeHtml([choice.candidate?.title, choice.candidate?.platform, choice.candidate?.year, choice.candidate?.publisher].filter(Boolean).join(' · '));
      const edition = [row.game.system, row.game.version, row.game.language, row.game.scrape_count > 1 ? `${row.game.scrape_count} versions` : ''].filter(Boolean).join(' · ');
      const html = `<div class="bulk-scrape-row">
        ${match ? `<button class="secondary bulk-scrape-artwork" data-bulk-preview="${id}" aria-label="View metadata and artwork for ${escapeHtml(match.candidate.title)}">` : '<div class="bulk-scrape-artwork">'}
          <span class="bulk-scrape-cover" ${cover ? `data-bulk-cover="${escapeHtml(cover)}" data-cover-title="${escapeHtml(match.candidate.title)}"` : ''}>
            ${cover ? renderBulkCover(cover, match.candidate.title) : `<small>${row.status === 'searching' ? 'Searching…' : match ? 'No artwork available' : 'No artwork yet'}</small>`}
          </span>
          ${match ? '<span class="bulk-scrape-artwork-caption">View details</span></button>' : '</div>'}
        <div class="bulk-scrape-body">
        <div class="bulk-scrape-heading">
          <input type="checkbox" data-bulk-game="${id}" aria-label="Apply metadata to ${escapeHtml(row.game.title)}" ${row.selected ? 'checked' : ''} ${busy || row.status !== 'matched' ? 'disabled' : ''}>
          <div class="bulk-scrape-title"><strong>${escapeHtml(row.game.title)}</strong><small>${escapeHtml(edition)}</small></div>
          <div class="bulk-scrape-state" ${match ? `title="Match score: ${Number(match.confidence)}%"` : ''}>${escapeHtml(status)}</div>
        </div>
        ${row.error ? `<div class="error">${escapeHtml(row.error)}</div>` : ''}
        ${match ? `<div class="bulk-scrape-match">${row.matches.length > 1
          ? `<label>Use metadata from · ${row.matches.length} search results<select data-bulk-match="${id}" ${locked ? 'disabled' : ''}>${row.matches.map((choice,index) =>
            `<option value="${index}" ${choice === match ? 'selected' : ''}>${resultLabel(choice)}</option>`).join('')}</select></label>`
          : `<div><small>Use metadata from</small><div class="bulk-scrape-result-title">${resultLabel(match)}</div></div>`}</div>` : ''}
        <div class="bulk-scrape-search">
          <label>Search term<input type="text" data-bulk-term="${id}" maxlength="500" value="${escapeHtml(row.searchTerm)}" ${locked ? 'disabled' : ''}></label>
          <label>Search platform<select data-bulk-platform="${id}" ${locked || !remote ? 'disabled' : ''}>
            <option value="current" ${row.searchPlatform === 'current' ? 'selected' : ''}>Current system (${escapeHtml(system)})</option>
            ${remote ? `<option value="all" ${row.searchPlatform === 'all' ? 'selected' : ''}>All platforms</option>` : ''}</select></label>
          <button class="secondary" data-bulk-retry="${id}" ${locked ? 'disabled' : ''}>Search again</button>
        </div>
        ${row.warnings.length ? `<div class="bulk-scrape-warnings">${row.warnings.map(warning => `<small>${escapeHtml(warning)}</small>`).join('')}</div>` : ''}
        </div></div>`;
      const template = document.createElement('template'); template.innerHTML = html;
      const node = template.content.firstElementChild;
      if (existing) existing.node.replaceWith(node); else el('results').appendChild(node);
      rowNodes.set(row.game.id, {signature, node});
    }
    for (const [id, entry] of rowNodes) if (!activeRows.has(id)) {entry.node.remove(); rowNodes.delete(id);}
    covers.refresh();
    if (view.rows.some(row => row.status === 'saving')) {clearTimeout(draftTimer); globalThis.ArcadeScrapeDrafts.save(collectionId, el('provider').value, batch.draft(), games.map(game => game.id));}
    else persist();
    if (focusKey) {
      const replacement = [...el('results').querySelectorAll(`[data-bulk-${focusKind}]`)].find(control => control.dataset['bulk' + focusKind[0].toUpperCase() + focusKind.slice(1)] === focusKey);
      replacement?.focus({preventScroll:true});
      if (caret && replacement) replacement.setSelectionRange(...caret);
    }
    el('status').textContent = error || (view.pausedUntil ? `Provider limit reached. Retrying in ${Math.max(1, Math.ceil((view.pausedUntil - Date.now()) / 1000))} seconds.` : '') || `${selected} ready, ${saved} saved, ${failed} without a confirmed match or save.`;
  };
  const current = () => overlay.isConnected && state.activeCollection?.id === collectionId;
  const run = async (action, id) => {
    if (running || !batch) return;
    running = true; error = ''; render(batch.snapshot());
    try {
      await batch[action](id);
      if (action === 'apply' && current()) await reloadGames();
    } catch (failure) { error = failure.message; }
    finally { running = false; render(batch.snapshot()); }
  };
  const start = async (resume = null) => {
    if (running) return;
    const provider = el('provider').value;
    if (!provider) { el('status').textContent = 'Configure a metadata provider to continue.'; return; }
    rememberScraperProvider(provider);
    batch = globalThis.ArcadeMetadataScraping.createBatch(plannedGames, {
      current, changed:render, provider, resume:resume?.rows,
      preview:async (game, options) => {
        const payload = await api('/api/scrape-preview', {method:'POST', body:JSON.stringify({collection_id:collectionId, game_id:game.id, provider, ...options})});
        if (current() && typeof payload.needs_review === 'boolean') updateScrapeReview(payload);
        return payload;
      },
      apply:(game, match, searchOptions) => api('/api/apply-scrape', {method:'POST', body:JSON.stringify({collection_id:collectionId, game_id:game.id,
        search_options:{provider, ...searchOptions},
        target_ids:game.target_ids, mode:el('missing').checked ? 'missing' : 'replace', undo_group:undoGroup, candidate:match.candidate, assets:match.assets || {}, remote_assets:match.remote_assets || {}})})
    });
    await run('search');
  };
  const dismiss = () => { if (!running) { clearTimeout(draftTimer); if (batch) globalThis.ArcadeScrapeDrafts.save(collectionId, el('provider').value, batch.draft(), games.map(game => game.id)); covers.disconnect(); overlay.remove(); previousFocus?.focus(); if (state.games && state.activeCollection.id === collectionId) applyFilters(); } };
  el('undo').addEventListener('click', async () => {
    if (running || !batch) return;
    running = true; render(batch.snapshot());
    try { await api('/api/metadata-care', {method:'POST', body:JSON.stringify({collection_id:collectionId, action:'undo'})}); await reloadGames(); running = false; dismiss(); }
    catch (failure) { running = false; error = failure.message; render(batch.snapshot()); }
  });
  el('provider').addEventListener('change', () => start());
  el('failed').addEventListener('click', () => void run('retryFailed'));
  el('discard').addEventListener('click', () => {batch = null; clearTimeout(draftTimer); globalThis.ArcadeScrapeDrafts.remove(collectionId); dismiss();});
  el('close').addEventListener('click', dismiss);
  el('stop').addEventListener('click', () => { batch?.stop(); el('stop').disabled = true; });
  el('search').addEventListener('click', () => void run('search'));
  el('apply').addEventListener('click', () => void run('apply'));
  el('results').addEventListener('change', event => {
    if (event.target.dataset.bulkPlatform) {batch?.edit(event.target.dataset.bulkPlatform, {searchPlatform:event.target.value}); return;}
    if (event.target.dataset.bulkMatch) {batch?.choose(event.target.dataset.bulkMatch, Number(event.target.value)); return;}
    const id = event.target.dataset.bulkGame;
    if (!id) return;
    batch?.select(id, event.target.checked);
    [...el('results').querySelectorAll('input')].find(input => input.dataset.bulkGame === id)?.focus({preventScroll:true});
  });
  el('results').addEventListener('input', event => {
    if (event.target.dataset.bulkTerm) batch?.edit(event.target.dataset.bulkTerm, {searchTerm:event.target.value});
  });
  el('results').addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.dataset.bulkTerm) {event.preventDefault(); void run('retry', event.target.dataset.bulkTerm);}
  });
  el('results').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.dataset.bulkRetry) void run('retry', button.dataset.bulkRetry);
    if (button?.dataset.bulkPreview) {
      const row = batch?.snapshot().rows.find(row => row.game.id === button.dataset.bulkPreview);
      if (row?.match) void showBulkMatchPreview(row, button);
    }
  });
  overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const controls = [...overlay.querySelectorAll('button,select,input')].filter(control => !control.disabled && control.getClientRects().length);
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    }
  });
  el('provider').disabled = true;
  try {
    providers = await populateScraperProviders(el('provider'));
    const plan = await api('/api/scrape-targets', {method:'POST', body:JSON.stringify({collection_id:collectionId, game_ids:games.map(game => game.id)})});
    plannedGames = plan.games || [];
    if (current()) {
      const draft = globalThis.ArcadeScrapeDrafts.load(collectionId);
      const same = draft && draft.rows.length === plannedGames.length && draft.rows.every(row => plannedGames.some(game => game.id === row.id));
      if (same && providers.some(provider => provider.id === draft.provider && !el('provider').querySelector(`option[value="${CSS.escape(provider.id)}"]`)?.disabled)) el('provider').value = draft.provider;
      await start(same && el('provider').value === draft.provider ? draft : null);
    }
  }
  catch (failure) { el('status').textContent = failure.message; }
}

function renderBulkCover(reference, title) {
  const url = assetDisplayUrl(reference);
  return url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)} cover / loading screen" decoding="async">`
    : `<small>${extensionAssetCache.has(reference) ? 'Artwork unavailable' : 'Loading artwork...'}</small>`;
}

function createBulkArtworkObserver(root, active) {
  const load = async node => {
    const reference = node.dataset.bulkCover;
    await prepareArtworkAssets([reference]);
    if (active() && node.isConnected && node.dataset.bulkCover === reference) {
      node.innerHTML = renderBulkCover(reference, node.dataset.coverTitle);
    }
  };
  const watched = new Set();
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      observer.unobserve(entry.target);
      void load(entry.target);
    }
  }, {root, rootMargin:'80px'}) : null;
  return {
    refresh() {
      for (const node of watched) if (!node.isConnected) {observer?.unobserve(node); watched.delete(node);}
      const nodes = [...root.querySelectorAll('[data-bulk-cover]')];
      if (observer) nodes.forEach(node => {if (!watched.has(node)) {watched.add(node); observer.observe(node);}});
      else nodes.slice(0, 4).forEach(node => void load(node));
    },
    disconnect() {observer?.disconnect();}
  };
}

async function showBulkMatchPreview(row, previousFocus) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const payload = {matches:[row.match]};
  overlay.innerHTML = `<section class="modal scrape-modal" role="dialog" aria-modal="true" aria-label="Review scrape match">
    <h2>${escapeHtml(row.game.title)} · ${escapeHtml(row.game.system)}</h2>
    <div data-bulk-artwork>${renderScrapePreview(payload)}</div>
    <footer class="modal-actions"><button data-close-preview>Close preview</button></footer></section>`;
  const dismiss = () => {overlay.remove(); previousFocus?.focus();};
  overlay.addEventListener('click', event => {if (event.target === overlay || event.target.closest('[data-close-preview]')) dismiss();});
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') {event.preventDefault(); dismiss();}
    if (event.key === 'Tab') {event.preventDefault(); overlay.querySelector('[data-close-preview]').focus();}
  });
  document.body.appendChild(overlay);
  overlay.querySelector('[data-close-preview]').focus();
  await prepareArtworkAssets(Object.values(row.match.remote_assets || {}));
  if (overlay.isConnected) overlay.querySelector('[data-bulk-artwork]').innerHTML = renderScrapePreview(payload);
}

async function showScrapePreviewModal() {
  const game = state.selected;
  if (!game) return;
  if (game.type === 'ScummVM') return showBulkScrapeModal([game]);
  const canApply = canScrapeMetadata();
  const collectionId = state.activeCollection?.id;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal scrape-modal">
      <div class="scrape-modal-header">
        <div class="scrape-title-search"><h2>${escapeHtml(game.title)}</h2>
          <div class="scrape-search-controls">
            <label for="scrape-search-term">Search term
              <input id="scrape-search-term" type="text" maxlength="500" value="${escapeHtml(game.title)}" autocomplete="off" spellcheck="false">
            </label>
            <label for="scrape-search-platform">Search platform
              <select id="scrape-search-platform"><option value="current">Current platform</option></select>
            </label>
            <label for="scrape-provider">Metadata supplier
              <select id="scrape-provider"></select>
            </label>
          </div>
        </div>
      </div>
      ${canApply ? "" : '<div class="meta">This collection is read-only. You can preview matches, but cannot save scraped metadata yet.</div>'}
      <div class="scrape-save-options"><label><input type="checkbox" data-scrape-missing> Fill missing fields only</label><button class="secondary" data-protection>Protected fields…</button></div>
      <div id="scrape-preview-content" class="scrape-preview-content">Loading providers...</div>
      <div class="modal-actions sticky-actions">
        <button data-action="apply" disabled>Apply Selected</button>
        <button class="secondary" data-action="cancel">Close</button>
      </div>
      <div class="message error" id="scrape-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-protection]')?.addEventListener('click', () => showMetadataCareModal(game));
  const providerSelect = overlay.querySelector("#scrape-provider");
  const searchInput = overlay.querySelector("#scrape-search-term");
  const platformSelect = overlay.querySelector("#scrape-search-platform");
  const errorBox = overlay.querySelector("#scrape-error");
  const previewBox = overlay.querySelector("#scrape-preview-content");
  const applyButton = overlay.querySelector('[data-action="apply"]');
  let currentPreview = null;
  let previewGeneration = 0;
  let searchTimer = null, customSearch = false;
  let providers = [], savedSearches = {};
  const loadProviders = async () => { providers = await populateScraperProviders(providerSelect) || []; };
  const restoreSearch = () => {
    const defaults = globalThis.ArcadeMetadataScraping.searchDefaults({...game, scrape_searches:savedSearches}, providerSelect.value);
    searchInput.value = defaults.searchTerm;
    customSearch = defaults.customSearch;
    updatePlatforms();
    platformSelect.value = platformSelect.disabled ? 'current' : defaults.searchPlatform;
  };
  const updatePlatforms = () => {
    const provider = providers.find(item => item.id === providerSelect.value);
    const choices = ['screenscraper', 'thegamesdb'].includes(provider?.type) ? [{id:'all', label:'All platforms'}] : [];
    const selected = platformSelect.value || 'current';
    const active = globalThis.ArcadePlatforms.searchLabel(game);
    platformSelect.innerHTML = `<option value="current">Current system (${escapeHtml(active)})</option>` + choices.map(choice =>
      `<option value="${escapeHtml(choice.id)}">${escapeHtml(choice.label)}</option>`).join('');
    platformSelect.value = choices.some(choice => choice.id === selected) ? selected : 'current';
    platformSelect.disabled = !choices.length;
  };
  const loadMatchArtwork = async (payload, index, generation) => {
    const match = payload.matches?.[index];
    if (!match) return;
    await prepareArtworkAssets(Object.values(match.remote_assets || {}));
    if (generation !== previewGeneration || currentPreview !== payload || !overlay.isConnected) return;
    const images = previewBox.querySelector(`[data-scrape-images="${index}"]`);
    if (images) images.innerHTML = renderScrapeImages(match.remote_assets || {}, match.candidate || {});
  };
  const loadPreview = async () => {
    clearTimeout(searchTimer);
    if (!overlay.isConnected) return;
    rememberScraperProvider(providerSelect.value);
    const generation = ++previewGeneration;
    currentPreview = null;
    applyButton.disabled = true;
    errorBox.textContent = "";
    previewBox.innerHTML = '<div class="meta">Looking up metadata...</div>';
    if (customSearch && !searchInput.value.trim()) {
      previewBox.innerHTML = '<div class="meta">Enter a search term.</div>';
      return;
    }
    try {
      const searchOptions = {provider:providerSelect.value || 'manual',
        search_term:customSearch ? searchInput.value.trim() : null, search_platform:platformSelect.value || 'current'};
      const payload = await api("/api/scrape-preview", {
        method: "POST",
        body: JSON.stringify({ collection_id:collectionId, game_id: game.id, provider: providerSelect.value || "manual",
          search_platform: platformSelect.value || 'current',
          ...(customSearch ? {search_term:searchInput.value.trim()} : {}) }),
      });
      if (generation !== previewGeneration || !overlay.isConnected) return;
      if (typeof payload.needs_review === 'boolean') updateScrapeReview(payload);
      if (platformSelect.value === 'all' && payload.query?.search_platform !== 'all') {
        throw new Error('The running Arcade service needs updating for All platforms. Restart the browser to reload Cyrune Host, then try again.');
      }
      searchInput.value = payload.query?.search_term ?? searchInput.value;
      payload.search_options = searchOptions;
      currentPreview = payload;
      previewBox.innerHTML = renderScrapePreview(payload);
      const firstChoice = previewBox.querySelector("[data-scrape-match]");
      if (firstChoice) firstChoice.checked = true;
      applyButton.disabled = !canApply || !firstChoice;
      void loadMatchArtwork(payload, 0, generation);
    } catch (error) {
      if (generation !== previewGeneration || !overlay.isConnected) return;
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
      if (state.games && state.activeCollection?.id === collectionId) applyFilters();
      return;
    }
    if (button.dataset.action === "apply" && canApply) {
      await applySelectedScrapeMatch(overlay, game, currentPreview, collectionId);
    }
  });
  previewBox.addEventListener("change", (event) => {
    if (event.target.closest("[data-scrape-match]")) {
      applyButton.disabled = !canApply || !currentPreview;
      const selected = event.target.closest("[data-scrape-match]");
      if (currentPreview) void loadMatchArtwork(currentPreview, Number(selected.dataset.scrapeMatch), previewGeneration);
    }
  });
  providerSelect.addEventListener("change", () => { restoreSearch(); return loadPreview(); });
  platformSelect.addEventListener("change", loadPreview);
  searchInput.addEventListener('input', () => {
    customSearch = true;
    ++previewGeneration;
    currentPreview = null;
    applyButton.disabled = true;
    previewBox.innerHTML = '<div class="meta">Waiting for search...</div>';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadPreview, 500);
  });
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); void loadPreview(); }
  });
  try {
    await loadProviders();
    const plan = await api('/api/scrape-targets', {method:'POST', body:JSON.stringify({collection_id:collectionId, game_ids:[game.id]})});
    savedSearches = plan.games?.find(row => row.target_ids?.includes(game.id) || row.id === game.id)?.scrape_searches || {};
    restoreSearch();
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
          <div data-scrape-images="${index}">${renderScrapeImages(remoteAssets, candidate)}</div>
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
    ["Boxart", assetDisplayUrl(remoteAssets.loading_screen)],
    ["Screenshot", assetDisplayUrl(remoteAssets.screenshot)],
  ].filter(([, value]) => value);
  if (!images.length) return `<div class="scrape-image-stack"><div class="scrape-preview-image empty">${Object.values(remoteAssets).some(Boolean) ? 'Select match to load artwork' : 'No image'}</div></div>`;
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

async function applySelectedScrapeMatch(overlay, game, preview, collectionId = state.activeCollection?.id) {
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
          collection_id:collectionId,
          game_id: game.id,
          target_ids: preview.target_ids,
          search_options: preview.search_options,
          mode:overlay.querySelector('[data-scrape-missing]')?.checked ? 'missing' : 'replace',
          candidate: match.candidate || {},
          assets: match.assets || {},
          remote_assets: match.remote_assets || {},
        }),
      });
      await reloadGames();
      return payload;
    });
    const updated = result.game || state.gamesById.get(game.id);
    if (updated) {
      state.gameDetails.set(game.id, updated);
      state.selected = updated;
    }
    overlay.remove();
    await renderDetails([`Applied metadata from ${match.candidate?.scraper_source || preview.provider?.name || "provider"}.`, ...(result.warnings || [])].join(' '));
  } catch (error) {
    errorBox.textContent = error.message;
  }
}

async function showMetadataCareModal(game) {
  if (!game || !canScrapeMetadata()) return;
  const collectionId = state.activeCollection.id;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<section class="modal metadata-care-modal" role="dialog" aria-modal="true" aria-label="Metadata and protection">
    <h2>${escapeHtml(game.title)}</h2><p>Protected fields keep their values when scraping. Edited fields are protected automatically.</p>
    <p class="meta" data-care-provenance></p><div data-care-fields>Loading metadata…</div><p data-care-error role="status"></p>
    <footer class="modal-actions"><button data-care-save disabled>Save</button><button class="secondary" data-care-close>Cancel</button></footer></section>`;
  document.body.appendChild(overlay);
  const el = key => overlay.querySelector(`[data-care-${key}]`);
  let busy = false;
  const dismiss = () => { if (!busy) overlay.remove(); };
  el('close').addEventListener('click', dismiss);
  overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const controls = [...overlay.querySelectorAll('button,input,textarea')].filter(control => !control.disabled);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    }
  });
  const request = data => api('/api/metadata-care', {method:'POST', body:JSON.stringify({collection_id:collectionId, game_id:game.id, ...data})});
  try {
    const result = await request({});
    if (!overlay.isConnected) return;
    const note = result.provenance;
    el('provenance').textContent = note?.scraped_at ? `Metadata: ${note.provider || 'Manual'} · ${note.platform || game.system} · ${note.scraped_at.slice(0,10)}` : '';
    const label = key => ({loading_screen:'Cover / loading screen', youtube_id:'YouTube ID', coop:'Co-op'}[key] || key[0].toUpperCase() + key.slice(1).replaceAll('_', ' '));
    el('fields').innerHTML = result.fields.map(key => `<div class="metadata-care-field">
      <label>${escapeHtml(label(key))}${key === 'description'
        ? `<textarea data-care-value="${key}" maxlength="2000">${escapeHtml(result.values[key])}</textarea>`
        : `<input type="text" data-care-value="${key}" value="${escapeHtml(result.values[key])}" maxlength="${['screenshot','loading_screen'].includes(key) ? 500 : 160}">`}</label>
      <label class="metadata-care-lock"><input type="checkbox" data-care-lock="${key}" ${result.protected_fields.includes(key) ? 'checked' : ''}> Protect</label>
    </div>`).join('');
    el('save').disabled = false;
    el('save').addEventListener('click', async () => {
      if (busy) return;
      busy = true; el('save').disabled = true; el('close').disabled = true;
      try {
        const changes = Object.fromEntries([...overlay.querySelectorAll('[data-care-value]')].map(input => [input.dataset.careValue, input.value]));
        const protected_fields = [...overlay.querySelectorAll('[data-care-lock]:checked')].map(input => input.dataset.careLock);
        await request({changes, protected_fields}); await reloadGames();
        overlay.remove();
      } catch (error) { el('error').textContent = error.message; }
      finally { busy = false; el('save').disabled = false; el('close').disabled = false; }
    });
    overlay.querySelector('input,textarea')?.focus();
  } catch (error) { el('error').textContent = error.message; }
}
