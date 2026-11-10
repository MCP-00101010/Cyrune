/* Browser-local working views. No collection, binding or launch authority. */
globalThis.ArcadeSavedViews = (() => {
  const key = 'cyrune-arcade-saved-views-v1';
  function normalize(input, adapters) {
    if (!Array.isArray(input)) return [];
    const ids = new Set();
    return input.slice(0, 40).flatMap(value => {
      if (!value || typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id) || ids.has(value.id)
          || typeof value.name !== 'string' || !value.name.trim() || !adapters.platforms.includes(value.platform)) return [];
      ids.add(value.id);
      return [{id:value.id, name:value.name.trim().slice(0, 80), platform:value.platform,
        filters:adapters.filters(value.filters), columns:adapters.columns(value.columns && typeof value.columns === 'object' ? value.columns : {}),
        sortRules:(Array.isArray(value.sortRules) ? value.sortRules : []).slice(0, 8)
          .filter(rule => rule && adapters.sorts.includes(rule.key) && ['asc','desc'].includes(rule.dir))
          .map(rule => ({key:rule.key, dir:rule.dir}))}];
    });
  }
  function create(adapters) {
    let rows = [];
    try { const raw = adapters.storage.getItem(key); if (!raw || raw.length <= 512000) rows = normalize(JSON.parse(raw || '[]'), adapters); } catch { /* Defaults. */ }
    function commit(next) {
      const clean = normalize(next, adapters);
      adapters.storage.setItem(key, JSON.stringify(clean));
      rows = clean;
    }
    return {
      list:platform => structuredClone(rows.filter(row => row.platform === platform)),
      save(value) {
        const next = normalize([value], adapters)[0];
        if (!next) throw new Error('Enter a name for this view.');
        if (rows.length >= 40 && !rows.some(row => row.id === next.id)) throw new Error('Save at most 40 views. Remove an unused view first.');
        commit([...rows.filter(row => row.id !== next.id), next]);
        return next.id;
      },
      remove(id) { commit(rows.filter(row => row.id !== id)); }
    };
  }
  return Object.freeze({create, normalize});
})();
