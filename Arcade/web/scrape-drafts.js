/* Local review choices only. Provider results and save requests are never persisted. */
(function (root) {
  'use strict';
  const key = 'cyrune-arcade-scrape-review-v1';
  function load(collection) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw || raw.length > 800000) return null;
      const data = JSON.parse(raw);
      if (data.collection !== collection || typeof data.provider !== 'string' || data.provider.length > 120 ||
          !Number.isFinite(data.savedAt) || Date.now() - data.savedAt > 7 * 86400000 ||
          !Array.isArray(data.rows) || !data.rows.length || data.rows.length > 1000 ||
          !Array.isArray(data.gameIds) || !data.gameIds.length || data.gameIds.length > 100 ||
          data.gameIds.some(id => typeof id !== 'string' || !id || id.length > 160)) return null;
      const ids = new Set();
      for (const row of data.rows) {
        if (!row || typeof row.id !== 'string' || !row.id || row.id.length > 160 || ids.has(row.id) ||
            typeof row.searchTerm !== 'string' || row.searchTerm.length > 500 ||
            !['current','all'].includes(row.searchPlatform) || typeof row.status !== 'string') return null;
        ids.add(row.id);
      }
      return data;
    } catch { return null; }
  }
  function save(collection, provider, rows, gameIds = rows.map(row => row.id).slice(0,100)) {
    try {
      if (!rows.some(row => row.status !== 'saved')) { remove(collection); return; }
      const raw = JSON.stringify({collection, provider, gameIds, savedAt:Date.now(), rows:rows.slice(0, 1000).map(row =>
        ({id:row.id, searchTerm:row.searchTerm, searchPlatform:row.searchPlatform, status:row.status}))});
      if (raw.length <= 800000) localStorage.setItem(key, raw);
    } catch { /* Storage can be unavailable in a private window. */ }
  }
  function remove(collection) {try {if (load(collection)) localStorage.removeItem(key);} catch {}}
  root.ArcadeScrapeDrafts = Object.freeze({load, save, remove});
})(globalThis);
