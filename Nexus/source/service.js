(function nexusServiceScope(root, factory) {
  root.CyruneNexusService = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function createNexusService() {
  'use strict';

  const MAX_DOCUMENT_BYTES = 500000;
  const DOCUMENT_CACHE_PREFIX = 'cyrune-nexus-document-cache:v1:';

  function createDocumentRepository(options = {}) {
    const cache = new Map();
    const inFlight = new Map();
    const bridge = options.bridge || null;
    const isAuthenticated = options.isAuthenticated || (() => false);

    function persistentKey(request) {
      return `${DOCUMENT_CACHE_PREFIX}${String(request.cacheKey || request.url || '').replace(/[^a-z0-9:._-]/gi, '_').slice(0, 180)}`;
    }

    function readPersistent(request) {
      try {
        const record = JSON.parse(localStorage.getItem(persistentKey(request)) || 'null');
        return typeof record?.markdown === 'string' && record.markdown.length <= MAX_DOCUMENT_BYTES ? record.markdown : '';
      } catch { return ''; }
    }

    function writePersistent(request, markdown) {
      try { localStorage.setItem(persistentKey(request), JSON.stringify({ cachedAt: Date.now(), markdown })); } catch { /* optional offline cache */ }
    }

    async function fetchFileDocument(request) {
      const response = await fetch(request.url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Document unavailable');
      return response.text();
    }

    async function fetchDocument(request) {
      if (isAuthenticated() && bridge && request.serviceDocument) {
        try {
          const response = await bridge.request('MW_NEXUS_GET_DOCUMENT', request.serviceDocument);
          return response.document?.markdown || '';
        } catch (serviceError) {
          try { return await fetchFileDocument(request); }
          catch { return readPersistent(request) || Promise.reject(serviceError); }
        }
      }
      try { return await fetchFileDocument(request); }
      catch (fileError) { return readPersistent(request) || Promise.reject(fileError); }
    }

    async function load(request = {}) {
      const authority = isAuthenticated() && bridge && request.serviceDocument ? 'service' : 'file';
      const revision = authority === 'service' ? Number(request.revision || 0) : 0;
      const key = `${authority}:${revision}:${String(request.cacheKey || request.url || '')}`;
      if (cache.has(key)) return cache.get(key);
      if (inFlight.has(key)) return inFlight.get(key);
      const pending = Promise.resolve(fetchDocument(request)).then(markdown => {
        const text = String(markdown || '');
        if (!text || text.length > MAX_DOCUMENT_BYTES) {
          throw new Error(text ? 'Document exceeds the preview limit' : 'Authoritative document is empty');
        }
        cache.set(key, text);
        writePersistent(request, text);
        return text;
      }).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
      return pending;
    }

    function discardOlderServiceRevisions(revision) {
      const current = Number(revision || 0);
      for (const key of cache.keys()) {
        if (!key.startsWith('service:')) continue;
        const cachedRevision = Number(key.split(':', 3)[1] || 0);
        if (cachedRevision < current) cache.delete(key);
      }
    }

    return Object.freeze({ load, discardOlderServiceRevisions });
  }

  return Object.freeze({ createDocumentRepository, MAX_DOCUMENT_BYTES, DOCUMENT_CACHE_PREFIX });
}));
