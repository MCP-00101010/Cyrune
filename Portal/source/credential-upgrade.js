// One verified credential cutover per browser profile. Secrets remain in Host.
function collectLegacyWidgetServiceSecretKeys(root = state) {
  const collected = { tmdb: [], footballData: [] };
  const seen = { tmdb: new Set(), footballData: new Set() };
  const add = (serviceName, key) => {
    if (!key || seen[serviceName].has(key)) return;
    seen[serviceName].add(key);
    collected[serviceName].push(key);
  };
  const visit = item => {
    if (!item || typeof item !== 'object') return;
    if (item.type === 'widget' && item.id) {
      if (item.widgetType === 'mediaWatchlist') add('tmdb', `media-watchlist:${item.id}:tmdb-token`);
      if (item.widgetType === 'protonCalendar') {
        (item.config?.calendars || []).filter(source => source?.type === 'football' && source.id).forEach(source => {
          add('footballData', `proton-calendar:${item.id}:${source.id}`);
        });
      }
    }
    (item.children || []).forEach(visit);
  };
  (root?.essentials || []).forEach(visit);
  (root?.navItems || []).forEach(visit);
  if (typeof recentlyDeleted !== 'undefined' && Array.isArray(recentlyDeleted)) {
    recentlyDeleted.forEach(entry => visit(entry?.item));
  }
  for (const board of (root?.boards || [])) {
    for (const tab of (typeof getBoardTabs === 'function' ? getBoardTabs(board) : board.tabs || [])) {
      for (const column of (tab.columns || [])) (column.items || []).forEach(visit);
      (typeof getBoardInbox === 'function' ? getBoardInbox(board, tab)?.items || [] : tab.inbox?.items || []).forEach(visit);
    }
  }
  return collected;
}

async function upgradeServiceCredentials() {
  let complete = false;
  try { complete = localStorage.getItem('cyrune.credentials.upgrade.v1') === 'done'; } catch {}
  const portable = state.settings?.serviceApiKeys || {};
  if (complete && !Object.values(portable).some(Boolean)) return true;
  const legacy = collectLegacyWidgetServiceSecretKeys(state);
  let verified = true;
  let changed = false;
  for (const [service, key] of Object.entries(SERVICE_SECRET_KEYS)) {
    let current = String(await bridge.secretGet(key) || '');
    const old = [];
    for (const source of legacy[service] || []) old.push([source, String(await bridge.secretGet(source) || '')]);
    const candidate = current || String(portable[service] || '').trim() || old.find(([,value]) => value)?.[1] || '';
    if (!current && candidate) {
      const saved = await bridge.secretSet(key, candidate);
      current = String(await bridge.secretGet(key) || '');
      if (!saved || current !== candidate) { verified = false; continue; }
      changed = true;
    }
    // A different old credential is retained in its secure target for recovery.
    for (const [source, value] of old) if (value && value === current) await bridge.secretDelete(source);
    if (portable[service] && current !== String(portable[service]).trim()) verified = false;
  }
  if (verified) {
    if (changed || Object.values(portable).some(Boolean)) {
      clearStoredServiceApiKeys(state);
      await saveState();
    }
    try { localStorage.setItem('cyrune.credentials.upgrade.v1', 'done'); } catch {}
  }
  return verified;
}
