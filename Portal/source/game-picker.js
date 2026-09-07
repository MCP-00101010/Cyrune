// Draft-only catalogue picker. No catalogue records or request receipts enter state.
const arcadeGamePicker = (() => {
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
  const text = (value, limit) => typeof value === 'string' && [...value].length <= limit && !/\p{C}/u.test(value);
  const keys = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
  const platforms = Object.freeze({ 'zx-spectrum': 'ZX Spectrum', dos: 'DOS', windows: 'Windows', 'fm-towns': 'FM Towns', amiga: 'Amiga', 'atari-st': 'Atari ST', macintosh: 'Macintosh', unknown: 'Unspecified platform' });
  const baseFields = ['catalogueId', 'sourceId', 'entryRevision', 'title', 'platformId', 'platformLabel',
    'hardwareLabel', 'editionLabel', 'targetKind', 'year', 'publisher', 'availability', 'artworkRef'];
  const states = ['ready', 'available', 'source-unavailable', 'media-missing', 'configuration-required', 'unsupported', 'review-required'];
  const messages = {
    available: 'In Arcade library',
    'unsupported-protocol': 'The game catalogue is not enabled for this installation yet.',
    unavailable: 'The catalogue connection is unavailable. Refresh before confirming again.',
    unauthorized: 'The catalogue session ended. Refresh and select games again.',
    timeout: 'The request timed out. Its outcome may be unknown; refresh and select again.',
    busy: 'The catalogue is busy. You can retry the same request.',
    'catalogue-changed': 'The catalogue changed. Start a fresh search.',
    'entry-changed': 'A selected game changed. Review its current details and select it again.',
    'destination-unavailable': 'The chosen column is missing, locked or full. Restore it before placing these games.',
    'storage-unavailable': 'Portal cannot save changes. Restore its authoritative storage connection first.',
    'save-failed': 'The save could not be confirmed. Follow Portal’s storage recovery guidance; these results will not be inserted again automatically.',
    'binding-limit': 'This device has reached its game binding limit.',
    'review-required': 'Review the selected game in Arcade before adding it.',
    'configuration-required': 'Configure this game’s emulator in Arcade first.',
    'media-missing': 'The game file is missing.',
    'source-unavailable': 'The game’s collection is unavailable.',
    'selection-limit': 'Select at most 100 games.',
  };
  const failure = code => Object.assign(new Error(messages[code] || 'This game could not be added. Review it in Arcade.'), { code });
  function entry(value, detail = false) {
    if (!keys(value, detail ? [...baseFields, 'description', 'languages', 'countries', 'suggestedTags'] : baseFields)
        || !['catalogueId', 'sourceId', 'entryRevision'].every(field => id(value[field]))
        || !text(value.title, 160) || typeof value.platformId !== 'string' || !Object.hasOwn(platforms, value.platformId) || value.platformLabel !== platforms[value.platformId]
        || !text(value.hardwareLabel, 80) || !text(value.editionLabel, 160) || value.targetKind !== (value.platformId === 'zx-spectrum' ? 'media-file' : 'scummvm-game')
        || !text(value.year, 16) || !text(value.publisher, 160) || !states.includes(value.availability)
        || !text(value.artworkRef, 128) || (value.artworkRef && !/^[A-Za-z0-9_-]+$/.test(value.artworkRef))) throw failure('unavailable');
    if (detail && (!text(value.description, 2000) || ![['languages', 16], ['countries', 16], ['suggestedTags', 80]].every(([field, limit]) =>
      Array.isArray(value[field]) && value[field].length <= 12 && value[field].every(item => text(item, limit))))) throw failure('unavailable');
    if (!detail && new TextEncoder().encode(JSON.stringify(value)).length > 2048) throw failure('unavailable');
    return JSON.parse(JSON.stringify(value));
  }
  function detailEntry(response) {
    if (!keys(response, ['ok', 'schemaVersion', 'entry']) || response.ok !== true || response.schemaVersion !== 1) throw failure('unavailable');
    return entry(response.entry, true);
  }
  function create(deps, destination) {
    destination = Object.freeze({ ...destination });
    let closed = false, generation = 0, detailGeneration = 0, reading = 0, queue = [];
    let session = deps.session(), binding = null, placementAttempted = false;
    const model = { phase: 'browse', rows: [], selected: new Map(), failures: new Map(), approved: [],
      nextCursor: '', revision: '', query: '', platformIds: [], detail: null, artwork: '', error: '', loading: false };
    const emit = () => { if (!closed) deps.changed?.(model); };
    const error = caught => { model.error = failure(caught?.code || 'unavailable').message; emit(); };
    const mutable = () => !closed && model.phase === 'browse';
    function pump() {
      while (reading < 2 && queue.length) {
        const job = queue.shift();
        if (closed || !job.current()) { job.resolve(null); continue; }
        reading++;
        Promise.resolve().then(job.work).then(value => job.resolve(job.current() && !closed ? value : null), job.reject)
          .finally(() => { reading--; pump(); });
      }
    }
    const read = (work, current = () => !closed) => new Promise((resolve, reject) => {
      queue = queue.filter(job => { if (!job.current()) { job.resolve(null); return false; } return true; });
      queue.push({ work, current, resolve, reject }); pump();
    });
    async function search(query = '', platformIds = [], more = false) {
      if (!mutable()) return;
      if (!text(query, 160) || !Array.isArray(platformIds) || platformIds.length > 4 || new Set(platformIds).size !== platformIds.length || platformIds.some(value => typeof value !== 'string' || !Object.hasOwn(platforms, value))) {
        error(failure('invalid-request')); return;
      }
      const current = ++generation;
      if (!more) { model.rows = []; model.nextCursor = ''; model.revision = ''; }
      const cursor = more ? model.nextCursor : '';
      if (more && !cursor) return;
      model.query = query; model.platformIds = [...platformIds]; model.loading = true; model.error = ''; emit();
      try {
        const response = await read(() => deps.search({ query, platformIds, pageSize: 50, cursor }), () => current === generation);
        if (!response || current !== generation || closed) return;
        if (!keys(response, ['ok', 'schemaVersion', 'catalogueRevision', 'entries', 'nextCursor']) || response.ok !== true || response.schemaVersion !== 1
            || !id(response.catalogueRevision) || typeof response.nextCursor !== 'string' || !/^[\x20-\x7e]{0,256}$/.test(response.nextCursor) || !Array.isArray(response.entries)
            || response.entries.length > 50 || new TextEncoder().encode(JSON.stringify(response)).length > 256 * 1024) throw failure('unavailable');
        if (more && response.catalogueRevision !== model.revision) { model.rows = []; model.nextCursor = ''; throw failure('catalogue-changed'); }
        const rows = response.entries.map(value => entry(value));
        if (new Set(rows.map(value => value.catalogueId)).size !== rows.length) throw failure('unavailable');
        const previousIds = new Set(model.rows.map(value => value.catalogueId));
        if (more && rows.some(value => previousIds.has(value.catalogueId))) {
          model.rows = []; model.nextCursor = ''; throw failure('catalogue-changed');
        }
        model.rows = [...model.rows, ...rows].slice(-200);
        model.revision = response.catalogueRevision; model.nextCursor = response.nextCursor;
      } catch (caught) {
        if (current === generation && !closed) {
          if (caught?.code === 'catalogue-changed') { model.rows = []; model.nextCursor = ''; model.revision = ''; }
          error(caught);
        }
      }
      finally { if (current === generation) { model.loading = false; emit(); } }
    }
    function toggle(value) {
      if (!mutable()) return;
      if (model.selected.has(value.catalogueId)) model.selected.delete(value.catalogueId);
      else {
        if (!['ready', 'available'].includes(value.availability)) return;
        if (model.selected.size >= 100) { error(failure('selection-limit')); return; }
        model.selected.set(value.catalogueId, entry(value));
      }
      model.failures.delete(value.catalogueId); binding = null; emit();
    }
    async function inspect(value) {
      if (!mutable()) return;
      const current = ++detailGeneration;
      model.detail = null; model.artwork = ''; emit();
      try {
        const result = await read(() => deps.detail(value.catalogueId), () => current === detailGeneration);
        if (!result || closed || current !== detailGeneration) return;
        const detail = detailEntry(result);
        if (detail.catalogueId !== value.catalogueId) throw failure('unavailable');
        model.detail = detail; emit();
        if (!detail.artworkRef) return;
        const art = await read(() => deps.artwork(detail.catalogueId, detail.artworkRef), () => current === detailGeneration);
        if (!art || closed || current !== detailGeneration) return;
        if (!keys(art, ['ok', 'schemaVersion', 'catalogueId', 'artworkRef', 'contentType', 'width', 'height', 'data'])
            || art.ok !== true || art.schemaVersion !== 1 || art.catalogueId !== detail.catalogueId || art.artworkRef !== detail.artworkRef
            || art.contentType !== 'image/png' || !Number.isInteger(art.width) || !Number.isInteger(art.height)
            || art.width < 1 || art.height < 1 || art.width > 256 || art.height > 256 || typeof art.data !== 'string'
            || art.data.length > 4 * Math.ceil(128 * 1024 / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(art.data)) return;
        model.artwork = `data:image/png;base64,${art.data}`; emit();
      } catch { /* Detail/artwork failure keeps the exact-entry icon fallback. */ }
    }
    async function place() {
      if (closed || model.phase !== 'approved' || placementAttempted || !model.approved.length) return;
      model.phase = 'placing'; model.error = ''; emit();
      try {
        await deps.prepare();
        deps.destination(destination, model.approved.length);
      } catch (caught) { model.phase = 'approved'; error(caught); return; }
      // Save failures may represent an unknown authoritative outcome. Never
      // append this batch again; Portal owns its existing recovery procedure.
      placementAttempted = true;
      try {
        const saved = await deps.persist(destination, model.approved);
        if (!saved?.ok || saved.conflict) throw failure('save-failed');
        model.phase = 'complete'; emit();
      } catch { model.phase = 'save-failed'; error(failure('save-failed')); }
    }
    async function confirm(includeTags = false, retry = false) {
      if (closed || (model.phase !== 'browse' && !(retry && model.phase === 'retry')) || !model.selected.size) return;
      model.phase = 'binding'; model.error = ''; generation++; detailGeneration++; model.loading = false; emit();
      try {
        if (session !== deps.session()) throw failure('unauthorized');
        await deps.prepare(); deps.destination(destination, model.selected.size);
        const selected = [...model.selected.values()];
        const tags = new Map();
        if (!retry && includeTags) {
          await Promise.all(selected.map(async value => {
            const response = await read(() => deps.detail(value.catalogueId), () => model.phase === 'binding');
            if (!response) throw failure('unavailable');
            const detail = detailEntry(response);
            if (detail.catalogueId !== value.catalogueId || detail.entryRevision !== value.entryRevision || !['ready', 'available'].includes(detail.availability)) throw failure('entry-changed');
            tags.set(value.catalogueId, detail.suggestedTags);
          }));
        }
        if (session !== deps.session()) throw failure('unauthorized');
        binding ||= { payload: { requestId: deps.uuid(), entries: selected.map(value => ({ catalogueId: value.catalogueId, entryRevision: value.entryRevision })) }, tags };
        const response = await deps.bind(binding.payload);
        if (session !== deps.session() || !keys(response, ['ok', 'schemaVersion', 'requestId', 'results']) || response.ok !== true || response.schemaVersion !== 1
            || response.requestId !== binding.payload.requestId || !Array.isArray(response.results) || response.results.length !== selected.length) throw failure('unavailable');
        const approved = [], failures = new Map();
        response.results.forEach((result, index) => {
          if (result.catalogueId !== selected[index].catalogueId) throw failure('unavailable');
          if (result.ok === false && keys(result, ['catalogueId', 'ok', 'code']) && typeof result.code === 'string') {
            failures.set(result.catalogueId, failure(result.code).message); return;
          }
          const game = result.game;
          if (result.ok !== true || !keys(result, ['catalogueId', 'ok', 'game']) || !keys(game, ['title', 'systemId', 'systemName', 'gameKey', 'state', 'tags'])
              || !text(game.title, 160) || game.systemId !== selected[index].platformId || game.systemName !== selected[index].platformLabel || game.state !== 'ready'
              || typeof game.gameKey !== 'string' || !/^game_[A-Za-z0-9_-]{12,75}$/.test(game.gameKey) || !Array.isArray(game.tags) || game.tags.length) throw failure('unavailable');
          approved.push({ title: game.title, systemId: game.systemId, systemName: game.systemName, gameKey: game.gameKey,
            suggestedTags: binding.tags.get(result.catalogueId) || [] });
        });
        model.approved = approved; model.failures = failures; model.phase = approved.length ? 'approved' : 'complete'; emit();
        if (approved.length) await place();
      } catch (caught) {
        model.phase = caught?.code === 'busy' && binding && session === deps.session() ? 'retry' : 'refresh-required';
        error(caught);
      }
    }
    function refresh() {
      if (closed || ['binding', 'placing', 'approved', 'complete', 'save-failed'].includes(model.phase)) return;
      binding = null; model.selected.clear(); model.failures.clear(); session = deps.session(); model.phase = 'browse';
      void search(model.query, model.platformIds);
    }
    function close() {
      if (['binding', 'placing'].includes(model.phase)) return false;
      closed = true; generation++; detailGeneration++;
      model.rows = []; model.selected.clear(); model.approved = []; model.failures.clear(); model.detail = null; model.artwork = ''; binding = null;
      model.nextCursor = ''; model.revision = ''; model.query = ''; model.platformIds = [];
      queue.splice(0).forEach(job => job.resolve(null));
      return true;
    }
    return { model, search, toggle, inspect, confirm, place, refresh, close, message: failure };
  }
  return { create, message: code => failure(code).message };
})();
