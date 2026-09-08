/* Collection-scoped images, bounded memory and retryable failures. */
(function (root) {
  'use strict';
  function create({scope, request, revision = () => '', clock = Date.now, maxEntries = 128, maxChars = 32 * 1024 * 1024}) {
    const entries = new Map(), pending = new Map(), queue = [];
    let active = 0, chars = 0;
    const shared = value => /^https:\/\//i.test(value) || value.startsWith('scraper-artwork/');
    const key = (value, collection = scope(), generation = revision()) => JSON.stringify([shared(value) ? '' : collection, shared(value) ? '' : generation, value]);
    function read(value) {
      const id = key(value), row = entries.get(id);
      if (row && row.retryAt && row.retryAt <= clock()) {entries.delete(id); return null;}
      if (row) {entries.delete(id); entries.set(id, row);}
      return row;
    }
    function save(id, url) {
      chars -= entries.get(id)?.url.length || 0;
      entries.delete(id);
      if (url.length > maxChars) return;
      entries.set(id, {url, retryAt:url ? 0 : clock() + 15000}); chars += url.length;
      while (entries.size > maxEntries || chars > maxChars) {
        const oldest = entries.keys().next().value;
        chars -= entries.get(oldest).url.length; entries.delete(oldest);
      }
    }
    function pump() {
      while (active < 2 && queue.length) {
        const task = queue.shift(); active++;
        Promise.resolve().then(() => request(task.value, task.collection)).then(response => {
          const url = String(response.asset?.dataUrl || '');
          if (!/^data:image\/(png|jpeg|gif|webp|avif);base64,/i.test(url)) throw Error('Artwork unavailable');
          save(task.id, url);
        }).catch(() => save(task.id, '')).finally(() => {
          pending.delete(task.id); active--; task.resolve(); pump();
        });
      }
    }
    async function prepare(values, onReady = () => {}) {
      const collection = scope(), generation = revision();
      await Promise.all([...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].map(async value => {
        if (read(value)) return;
        const id = key(value, collection, generation);
        if (!pending.has(id)) {
          if (queue.length >= 128) return;
          let resolve;
          const promise = new Promise(done => {resolve = done;});
          pending.set(id, promise); queue.push({id, value, collection, resolve}); pump();
        }
        await pending.get(id);
        if (collection === scope() && generation === revision()) onReady(value);
      }));
    }
    return {has:value => Boolean(read(value)), get:value => read(value)?.url || '', prepare,
      retry(values) {for (const value of values) {const id = key(value); chars -= entries.get(id)?.url.length || 0; entries.delete(id);}},
      clear() {entries.clear(); chars = 0;}};
  }
  root.ArcadeArtwork = Object.freeze({create});
})(globalThis);
