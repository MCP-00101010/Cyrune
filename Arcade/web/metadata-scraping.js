/* Bounded, reviewable metadata batches over the existing Arcade API. */
(function (root) {
  'use strict';

  function bestMatch(matches) {
    let best = null;
    for (const match of Array.isArray(matches) ? matches : []) {
      if (!match?.candidate || typeof match.candidate.title !== 'string' || !match.candidate.title.trim()) continue;
      const score = Number(match.confidence);
      if (!Number.isFinite(score) || score < 0 || score > 100) continue;
      if (!best || score > Number(best.confidence)) best = match;
    }
    return best;
  }

  function providerAvailable(provider, networkAllowed) {
    return provider.type === 'manual' || Boolean(networkAllowed && provider.configured && provider.enabled !== false);
  }

  function preferredProvider(providers, saved, networkAllowed) {
    const choices = providers.filter(provider => providerAvailable(provider, networkAllowed));
    return (choices.find(provider => provider.id === saved) || choices.find(provider => provider.type !== 'manual') || choices[0])?.id || '';
  }

  function searchDefaults(game, provider) {
    const saved = game.scrape_searches?.[provider];
    const term = saved?.search_term;
    const customSearch = typeof term === 'string' && Boolean(term.trim()) && term.length <= 500;
    return {searchTerm:customSearch ? term : game.title || '',
      searchPlatform:saved?.search_platform === 'all' ? 'all' : 'current', customSearch};
  }

  function createBatch(games, {preview, apply, current, changed, provider = '', resume = null, clock = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
    if (!Array.isArray(games) || !games.length || games.length > 1000 || new Set(games.map(game => game.id)).size !== games.length) {
      throw new Error('A scrape batch must contain between 1 and 1,000 versions.');
    }
    const rows = games.map(game => ({game:{...game}, status:'queued', match:null, matches:[], selected:false, error:'',
      ...searchDefaults(game, provider), warnings:[], targetIds:game.target_ids}));
    const cache = new Map();
    for (const saved of Array.isArray(resume) ? resume.slice(0, 1000) : []) {
      const row = rows.find(row => row.game.id === saved.id);
      if (!row) continue;
      if (typeof saved.searchTerm === 'string' && saved.searchTerm.trim() && saved.searchTerm.length <= 500) {
        row.searchTerm = saved.searchTerm; row.customSearch = true;
      }
      if (['current','all'].includes(saved.searchPlatform)) row.searchPlatform = saved.searchPlatform;
      if (['saved','unconfirmed'].includes(saved.status)) row.status = saved.status;
      // Results are revalidated by searching again. Uncertain saves never replay.
    }
    let busy = false, stopped = false, pausedUntil = 0;
    const snapshot = () => ({busy, pausedUntil, rows:rows.map(row => ({...row}))});
    const emit = () => changed(snapshot());
    const valid = () => { if (!current()) throw new Error('The collection changed. Reopen scraping from the current library.'); };
    async function run(phase, onlyId = null) {
      if (busy) return;
      valid(); busy = true; stopped = false; emit();
      try {
        for (let index = 0; index < rows.length; index++) {
          const row = rows[index];
          if (stopped) break;
          if (onlyId !== null && row.game.id !== onlyId) continue;
          if (phase === 'search' ? (onlyId === null ? row.status !== 'queued' : ['saved','unconfirmed'].includes(row.status)) : row.status !== 'matched' || !row.selected) continue;
          valid(); row.status = phase === 'search' ? 'searching' : 'saving'; emit();
          try {
            if (phase === 'search') {
              row.match = null; row.matches = []; row.selected = false; row.error = ''; row.warnings = [];
              if (row.customSearch && (!row.searchTerm.trim() || row.searchTerm.length > 500)) throw Error('Enter a search term of 1 to 500 characters.');
              const options = {search_platform:row.searchPlatform, ...(onlyId !== null ? {refresh:true} : {}), ...(row.customSearch ? {search_term:row.searchTerm.trim()} : {})};
              const key = row.game.search_key && JSON.stringify([row.game.search_key, options]);
              const cached = onlyId === null && key && cache.has(key);
              const result = cached ? cache.get(key) : await preview(row.game, options);
              valid();
              if (result.ok === false) throw Object.assign(Error(result.error || 'Lookup failed'), {payload:result});
              if (row.searchPlatform === 'all' && result.query?.search_platform !== 'all') throw Error('Restart the browser to load the updated All platforms service.');
              if (key && result.needs_review !== true) cache.set(key, result);
              row.searchTerm = result.query?.search_term ?? row.searchTerm;
              row.searchOptions = {search_term:options.search_term ?? null, search_platform:options.search_platform};
              row.matches = result.matches || [];
              row.warnings = result.warnings || [];
              // A cached preview belongs to another registration; retain this row's scope.
              row.targetIds = cached ? row.game.target_ids : result.target_ids || row.game.target_ids;
              row.match = bestMatch(result.matches);
              row.status = row.match ? 'matched' : 'no-match';
              row.selected = Boolean(row.match && result.needs_review === false);
              if (row.game.type === 'ScummVM' && row.game.platform === 'unknown') row.selected = false;
            } else {
              const result = await apply({...row.game, target_ids:row.targetIds}, row.match, row.searchOptions);
              row.warnings.push(...(result?.warnings || []));
              row.status = 'saved'; row.selected = false;
            }
          } catch (error) {
            const retry = Number(error.payload?.retry_after);
            if (phase === 'search' && Number.isFinite(retry) && retry > 0) {
              row.status = 'queued'; row.error = ''; pausedUntil = clock() + Math.min(retry, 86400) * 1000;
              while (!stopped && clock() < pausedUntil) { valid(); emit(); await wait(Math.min(1000, pausedUntil - clock())); }
              pausedUntil = 0; index--; emit(); continue;
            }
            row.status = phase === 'search' ? 'failed' : 'unconfirmed';
            row.error = error.message || 'Request failed'; row.selected = false;
          }
          emit();
        }
      } finally { busy = false; emit(); }
    }
    return {
      snapshot, search:() => run('search'), apply:() => run('apply'), stop:() => {stopped = true;},
      draft:() => rows.map(row => ({id:row.game.id, searchTerm:row.searchTerm, searchPlatform:row.searchPlatform,
        status:row.status === 'saving' ? 'unconfirmed' : row.status})),
      retryFailed:() => { if (!busy) { for (const row of rows) if (['failed','no-match'].includes(row.status)) row.status = 'queued'; return run('search'); } },
      retry:id => run('search', id),
      edit(id, options) {
        if (busy) return;
        const row = rows.find(row => row.game.id === id);
        if (!row || ['saved','unconfirmed'].includes(row.status)) return;
        if ('searchTerm' in options) {row.searchTerm = String(options.searchTerm); row.customSearch = true;}
        if (['current','all'].includes(options.searchPlatform)) row.searchPlatform = options.searchPlatform;
        row.status = 'queued'; row.match = null; row.matches = []; row.selected = false; row.error = ''; row.warnings = []; emit();
      },
      choose(id, index) {
        if (busy) return;
        const row = rows.find(row => row.game.id === id);
        const match = row?.matches[index];
        if (row?.status !== 'matched' || !bestMatch([match])) return;
        row.match = match; row.selected = true; emit();
      },
      select(id, selected) {
        if (busy) return;
        const row = rows.find(row => row.game.id === id);
        if (row?.status === 'matched') { row.selected = Boolean(selected); emit(); }
      }
    };
  }

  root.ArcadeMetadataScraping = Object.freeze({bestMatch, createBatch, providerAvailable, preferredProvider, searchDefaults});
})(globalThis);
