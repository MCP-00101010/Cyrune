(function nexusAppScope() {
  'use strict';

  const model = globalThis.CyruneNexusModel;
  const adapters = globalThis.CyruneNexusAdapters;
  const bridge = globalThis.CyruneNexusBridge;
  const service = globalThis.CyruneNexusService;
  if (!model || !adapters) throw new Error('Cyrune Nexus model or adapters did not load');

  const viewRoot = document.getElementById('view-root');
  const viewTitle = document.getElementById('view-title');
  const viewEyebrow = document.getElementById('view-eyebrow');
  const noticeRegion = document.getElementById('notice-region');
  const componentNav = document.getElementById('component-nav');
  let activeView = 'overview';
  let settings = loadPreview();
  let snapshot = null;
  let settingsAuthority = 'connecting';
  let serviceError = '';
  let serviceRefresh = null;
  let refreshRequestedWhileActive = false;
  let serviceAuthenticated = false;
  let remoteCheck = null;
  let remoteCheckPending = false;
  let settingsScope = 'global';
  let settingsHistory = [];
  const documentRepository = service?.createDocumentRepository({
    bridge,
    isAuthenticated: () => serviceAuthenticated
  }) || null;

  function loadPreview() {
    try {
      model.upgradePreview(localStorage);
      const stored = localStorage.getItem(model.PREVIEW_STORAGE_KEY);
      if (stored) return model.normalizeSettings(JSON.parse(stored));
    } catch (_error) { /* unavailable preview never replaces authoritative settings */ }
    return model.normalizeSettings(null);
  }

  function cacheSettings(value) {
    try { localStorage.setItem(model.PREVIEW_STORAGE_KEY, JSON.stringify(value)); } catch (_error) { /* cache is optional */ }
  }

  function formatAge(timestamp) {
    const elapsed = Date.now() - Number(timestamp || 0);
    if (!Number.isFinite(elapsed) || elapsed < 0 || !timestamp) return 'Unknown';
    if (elapsed < 60000) return 'Just now';
    if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m ago`;
    if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)}h ago`;
    if (elapsed < 604800000) return `${Math.floor(elapsed / 86400000)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  function liveComponent(component) {
    return snapshot?.components?.find(item => item.id === component.id) || component;
  }

  function componentHealth(component) {
    const sampledAt = snapshot?.sampledAt || 0;
    if (!snapshot) return { state: 'source-only', summary: 'Live health pending', guidance: '', sampledAt: 0 };
    if (component.id === 'portal' || component.id === 'arcade' || component.id === 'nexus') {
      return snapshot.data?.[component.id]?.health || { state: 'unavailable', summary: 'Health adapter unavailable', guidance: 'Refresh Nexus after restoring Relay and Host.', sampledAt };
    }
    if (component.id === 'host') {
      return snapshot.services?.host?.health || { state: snapshot.services?.host?.available ? 'healthy' : 'unavailable', summary: snapshot.services?.host?.available ? 'Host is responding' : 'Host is unavailable', guidance: 'Reload Relay to restart the native Host connection.', sampledAt };
    }
    if (component.id === 'relay') {
      return { state: snapshot.services?.relay?.available ? 'healthy' : 'unavailable', summary: snapshot.services?.relay?.available ? 'Relay is authenticated to this tab' : 'Relay is unavailable', guidance: 'Reload the Cyrune Relay extension and this page.', sampledAt };
    }
    return { state: 'source-only', summary: 'Browser-local runtime is not yet instrumented', guidance: 'Open Portal to exercise hosted Widgets; deeper Widget health remains planned.', sampledAt };
  }

  function healthTone(state) {
    if (state === 'healthy') return 'status-live';
    if (state === 'attention') return 'status-attention';
    if (state === 'unavailable') return 'status-unavailable';
    return 'status-source';
  }

  function healthLabel(state) {
    return ({ healthy: 'Healthy', attention: 'Attention', unavailable: 'Unavailable', 'source-only': 'Source only' })[state] || 'Unknown';
  }

  function componentIconPath(id) {
    if (id === 'project') return 'assets/icons/cyrune.svg';
    return model.componentById(id)?.icon || 'assets/icons/cyrune.svg';
  }

  function componentIconMarkup(id, classes = 'component-symbol') {
    const component = model.componentById(id);
    const launch = component?.page ? ` data-open-component-page="${component.id}" title="Open Cyrune ${component.name} in a new tab"` : '';
    return `<img class="${classes}" src="${componentIconPath(id)}" alt="" aria-hidden="true"${launch}>`;
  }

  function renderServiceChrome() {
    const connected = serviceAuthenticated;
    const sample = document.querySelector('.sample-time');
    if (sample) sample.innerHTML = `<span class="connection-dot${connected ? ' is-online' : ' is-offline'}"></span>${connected ? (snapshot ? `Live snapshot · ${formatAge(snapshot.sampledAt)}` : 'Relay & Host connected · status unavailable') : (settingsAuthority === 'connecting' ? 'Connecting to Relay…' : 'Disconnected preview')}`;
    const footer = document.querySelector('.sidebar-footer');
    if (footer) {
      const dot = footer.querySelector('.connection-dot');
      dot?.classList.toggle('is-online', connected);
      dot?.classList.toggle('is-offline', !connected);
      const strong = footer.querySelector('strong');
      const small = footer.querySelector('small');
      if (strong) strong.textContent = settingsAuthority === 'authoritative' ? 'Authoritative' : (connected ? 'Partial service' : 'Local fallback');
      if (small) small.textContent = connected ? `Relay ${snapshot?.services?.relay?.version || ''} · ${settingsAuthority === 'authoritative' ? 'settings and status connected' : (serviceError || 'status only')}` : (serviceError || 'Relay not connected');
    }
  }

  async function refreshAuthoritative({ announceResult = false } = {}) {
    if (!bridge) {
      settingsAuthority = 'preview';
      serviceError = 'Nexus bridge is unavailable';
      renderServiceChrome();
      return false;
    }
    if (serviceRefresh) {
      refreshRequestedWhileActive = true;
      return serviceRefresh;
    }
    serviceRefresh = (async () => {
      try {
        await bridge.request('MW_NEXUS_PING', {}, 8000);
        serviceAuthenticated = true;
        const [settingsResult, statusResult] = await Promise.allSettled([
          bridge.request('MW_NEXUS_GET_SETTINGS'),
          bridge.request('MW_NEXUS_GET_STATUS', {}, 30000)
        ]);
        snapshot = statusResult.status === 'fulfilled' ? (statusResult.value.snapshot || null) : null;
        remoteCheck = null;
        if (settingsResult.status === 'fulfilled') {
          settings = model.normalizeSettings(settingsResult.value.settings);
          settingsHistory = Array.isArray(settingsResult.value.history) ? settingsResult.value.history.slice(-50) : [];
          settingsAuthority = 'authoritative';
          cacheSettings(settings);
        } else {
          settingsAuthority = 'status-only';
        }
        const failures = [];
        if (settingsResult.status === 'rejected') failures.push(`Settings: ${settingsResult.reason?.message || 'unavailable'}`);
        if (statusResult.status === 'rejected') failures.push(`Status: ${statusResult.reason?.message || 'unavailable'}`);
        serviceError = failures.join(' · ');
        render();
        if (announceResult) announce(failures.length ? `Nexus refreshed with partial results. ${serviceError}` : 'Authoritative Nexus settings and project status refreshed.', failures.length ? 'error' : 'success');
        return failures.length === 0;
      } catch (error) {
        serviceAuthenticated = false;
        snapshot = null;
        settingsAuthority = 'preview';
        serviceError = error?.message || String(error);
        renderServiceChrome();
        if (announceResult) announce(`Authoritative Nexus service is unavailable. ${serviceError}`, 'error');
        return false;
      } finally {
        serviceRefresh = null;
        if (refreshRequestedWhileActive) {
          refreshRequestedWhileActive = false;
          window.setTimeout(() => { void refreshAuthoritative(); }, 0);
        }
      }
    })();
    return serviceRefresh;
  }

  function announce(message, tone) {
    noticeRegion.innerHTML = '';
    const notice = document.createElement('div');
    notice.className = `notice notice-${tone || 'info'}`;
    notice.textContent = message;
    noticeRegion.appendChild(notice);
    window.setTimeout(() => { if (notice.isConnected) notice.remove(); }, 5000);
  }

  function settingControlMeta(name) {
    if (settingsScope !== 'global' && !model.COMPONENT_SETTING_PATHS[settingsScope]?.includes(name)) return null;
    const source = model.settingSource(settings, settingsScope, name);
    const overridden = source === 'component';
    return {
      source,
      overridden,
      disabled: settingsScope !== 'global' && !overridden,
      badge: source === 'component' ? 'Override' : (source === 'default' ? 'Default' : 'Global'),
      override: settingsScope === 'global' ? '' : `<label class="override-control"><input type="checkbox" data-override-path="${model.escapeHtml(name)}"${overridden ? ' checked' : ''}>Override for ${settingsScope === 'arcade' ? 'Arcade' : 'Portal & Widgets'}</label>`
    };
  }

  function selectMarkup(name, label, value, options, hint) {
    const meta = settingControlMeta(name);
    if (!meta) return '';
    return `<div class="field"><span class="field-label"><span>${model.escapeHtml(label)}</span><small class="value-source source-${meta.source}">${meta.badge}</small></span><select name="${model.escapeHtml(name)}" data-setting-control="${model.escapeHtml(name)}"${meta.disabled ? ' disabled' : ''}>${options.map(option => `<option value="${model.escapeHtml(option[0])}"${option[0] === value ? ' selected' : ''}>${model.escapeHtml(option[1])}</option>`).join('')}</select>${hint ? `<small>${model.escapeHtml(hint)}</small>` : ''}${meta.override}</div>`;
  }

  function inputMarkup(name, label, value, placeholder, maxLength, type = 'text') {
    const meta = settingControlMeta(name);
    if (!meta) return '';
    const numeric = type === 'number' ? ' type="number" step="any"' : '';
    return `<div class="field"><span class="field-label"><span>${model.escapeHtml(label)}</span><small class="value-source source-${meta.source}">${meta.badge}</small></span><input${numeric} name="${model.escapeHtml(name)}" data-setting-control="${model.escapeHtml(name)}" value="${model.escapeHtml(value ?? '')}" placeholder="${model.escapeHtml(placeholder || '')}" maxlength="${maxLength || 80}"${meta.disabled ? ' disabled' : ''}>${meta.override}</div>`;
  }

  function toggleMarkup(name, title, detail, checked) {
    const meta = settingControlMeta(name);
    if (!meta) return '';
    return `<div class="toggle-frame"><label class="toggle-row"><span><strong>${model.escapeHtml(title)}</strong><small>${model.escapeHtml(detail)}</small></span><input type="checkbox" name="${model.escapeHtml(name)}" data-setting-control="${model.escapeHtml(name)}"${checked ? ' checked' : ''}${meta.disabled ? ' disabled' : ''}><i aria-hidden="true"></i></label><span class="toggle-source"><small class="value-source source-${meta.source}">${meta.badge}</small>${meta.override}</span></div>`;
  }

  function renderOverview() {
    viewTitle.textContent = 'Overview';
    viewEyebrow.textContent = 'Project control centre';
    const connected = serviceAuthenticated && !!snapshot;
    const cards = model.COMPONENTS.map(component => {
      const live = liveComponent(component);
      const health = componentHealth(component);
      return `
      <button class="component-card accent-${component.accent}" type="button" data-open-component="${component.id}">
        <span class="component-card-top">${componentIconMarkup(component.id)}<span class="status-pill ${healthTone(health.state)}">${healthLabel(health.state)}</span></span>
        <span class="component-name">${component.name}</span><span class="component-version">${model.escapeHtml(live.version || component.version)}</span>
        <span class="component-summary">${model.escapeHtml(component.summary)}</span>
        <span class="component-foot"><span>${model.escapeHtml(health.summary)}${health.sampledAt ? ` · ${formatAge(health.sampledAt)}` : ''}</span><span aria-hidden="true">→</span></span>
      </button>`;
    }).join('');

    const relay = snapshot?.services?.relay || {};
    const host = snapshot?.services?.host || {};
    const repository = snapshot?.repository?.available === false ? null : (snapshot?.repository || null);
    const data = snapshot?.data || {};
    const locationRow = (label, record) => {
      const health = record?.health || { state: 'unavailable', summary: 'Unavailable' };
      const schema = record?.schema?.valid === false ? 'invalid schema' : (record?.schema?.version === null || record?.schema?.version === undefined ? 'unversioned schema' : `schema ${record.schema.version}`);
      const backup = record?.backup?.managed ? `${record.backup.count || 0} backup${record.backup.count === 1 ? '' : 's'}` : 'component-managed protection';
      const file = record?.exists ? `${formatBytes(record.size)} · changed ${formatAge(record.modifiedMs)}` : 'No authoritative file yet';
      return `<div class="runtime-location"><span><i class="mini-beacon health-${health.state}"></i>${model.escapeHtml(label)}</span><strong>${model.escapeHtml(record?.location || 'Unavailable')}</strong><small>${model.escapeHtml(`${healthLabel(health.state)} · ${schema} · ${backup} · ${file}`)}</small></div>`;
    };
    const recoveryItems = ['portal', 'arcade', 'nexus'].map(id => data[id]).filter(record => record?.health && record.health.state !== 'healthy').map(record => `<li class="health-${record.health.state}"><strong>${model.escapeHtml(record.health.summary)}</strong><span>${model.escapeHtml(record.health.guidance)} <code>${model.escapeHtml(record.health.code)}</code></span></li>`).join('');
    const recoveryMarkup = recoveryItems ? `<ul class="health-guidance" aria-label="Runtime recovery guidance">${recoveryItems}</ul>` : '';
    const remoteSummary = remoteCheck?.available
      ? (remoteCheck.branchAvailable === false
        ? ['Not on origin', 'The current local branch is not advertised by origin.']
        : (remoteCheck.headMatchesRemote
        ? ['In sync', 'Local HEAD matches origin.']
        : (remoteCheck.trackingCurrent
          ? ['Origin unchanged', `Live origin matches the cached tracking ref; local state remains +${repository?.ahead || 0} / -${repository?.behind || 0}.`]
          : ['Origin changed', 'The live origin differs from the cached tracking ref. Fetch when you want updated ahead/behind counts.'])))
      : null;
    const remoteMarkup = remoteCheckPending
      ? '<div class="repo-remote is-pending"><strong>Checking origin…</strong><span>Non-interactive read-only comparison in progress.</span></div>'
      : (remoteSummary
        ? `<div class="repo-remote ${remoteCheck.headMatchesRemote ? 'is-current' : 'is-changed'}"><strong>${remoteSummary[0]}</strong><span>${model.escapeHtml(remoteSummary[1])} Checked ${formatAge(remoteCheck.sampledAt)}.</span></div>`
        : (remoteCheck?.error
          ? `<div class="repo-remote is-error"><strong>Origin unavailable</strong><span>${model.escapeHtml(remoteCheck.error)}</span></div>`
          : '<div class="repo-remote"><strong>Live origin not checked</strong><span>Cached ahead/behind counts remain local until you request a remote comparison.</span></div>'));
    const repositoryMarkup = repository
      ? `<div class="repo-live"><div class="repo-branch"><span>⌁</span><div><small>Branch</small><strong>${model.escapeHtml(repository.branch || 'HEAD')}</strong></div></div><div class="repo-counts"><div><small>Staged</small><strong>${repository.staged || 0}</strong></div><div><small>Modified</small><strong>${repository.unstaged || 0}</strong></div><div><small>Untracked</small><strong>${repository.untracked || 0}</strong></div><div><small>Upstream</small><strong>+${repository.ahead || 0} / -${repository.behind || 0}</strong></div></div><p>${model.escapeHtml(repository.lastCommit?.shortHash || '')} · ${model.escapeHtml(repository.lastCommit?.subject || 'No commit metadata')}</p>${remoteMarkup}</div>`
      : `<div class="repo-placeholder"><span>⌁</span><strong>Repository inspection is not connected</strong><p>Nexus shows branch, last commit, local changes and cached upstream state without exposing the checkout path.</p></div>`;

    viewRoot.innerHTML = `
      <section class="hero-row"><div><span class="section-kicker">System snapshot</span><h2>The shape of Cyrune, at a glance.</h2><p>${connected ? `Authoritative status sampled ${formatAge(snapshot.sampledAt)} through the exact Nexus Relay and Host boundary.` : 'Source metadata remains available while Nexus reconnects to its authoritative Relay and Host service.'}</p></div><div class="hero-metric"><strong>${model.COMPONENTS.length}</strong><span>components tracked</span></div></section>
      <section class="component-grid" aria-label="Component status">${cards}</section>
      <section class="dashboard-grid">
        <article class="panel service-panel"><div class="panel-heading"><div><span class="section-kicker">Service boundary</span><h2>Relay & Host</h2></div><span class="status-pill ${connected ? 'status-live' : 'status-waiting'}">${connected ? 'Authenticated' : 'Disconnected'}</span></div><div class="status-list"><div><span><i class="mini-beacon ${relay.available ? 'is-online' : 'is-offline'}"></i>Relay extension</span><strong>${relay.available ? `v${model.escapeHtml(relay.version || '')} · ${formatAge(snapshot?.sampledAt)}` : 'Not connected'}</strong></div><div><span><i class="mini-beacon ${host.available ? 'is-online' : 'is-offline'}"></i>Native Host</span><strong>${host.available ? `${model.escapeHtml(host.version || 'Available')} · ${formatAge(host.sampledAt)}` : 'Not connected'}</strong></div><div><span><i class="mini-beacon ${relay.fileSchemeAccess === true ? 'is-online' : (relay.fileSchemeAccess === false ? 'is-offline' : 'is-pending')}"></i>File scheme access</span><strong>${relay.fileSchemeAccess === false ? 'Disabled' : (connected ? 'Allowed' : 'Unknown')}</strong></div><div><span><i class="mini-beacon ${relay.nexusRole ? 'is-online' : 'is-pending'}"></i>Nexus client role</span><strong>${relay.nexusRole ? 'Bound to this tab' : 'Unavailable'}</strong></div></div>${serviceError ? `<p class="service-guidance">${model.escapeHtml(serviceError)}</p>` : ''}</article>
        <article class="panel runtime-panel"><div class="panel-heading"><div><span class="section-kicker">Shared state</span><h2>Runtime data</h2></div><button class="text-button" type="button" data-view-link="variables">Variables →</button></div><div class="runtime-locations">${locationRow('Portal database', data.portal)}${locationRow('Arcade data', data.arcade)}${locationRow('Nexus settings', data.nexus)}</div>${recoveryMarkup}<div class="two-stat"><div><small>Settings revision</small><strong>${settingsAuthority === 'authoritative' ? `Authoritative ${settings.revision}` : `Cached ${settings.revision}`}</strong></div><div><small>Validation receipt</small><strong>${snapshot?.validation ? formatAge(snapshot.validation.timestamp) : 'Unavailable'}</strong></div></div></article>
        <article class="panel repo-panel"><div class="panel-heading"><div><span class="section-kicker">Repository</span><h2>Working tree</h2></div><div class="panel-actions">${repository ? `<button class="text-button" type="button" data-check-remote${remoteCheckPending ? ' disabled' : ''}>${remoteCheckPending ? 'Checking…' : 'Check origin'}</button>` : ''}<span class="status-pill ${repository?.clean ? 'status-live' : 'status-waiting'}">${repository ? (repository.clean ? 'Clean' : 'Changes') : 'No snapshot'}</span></div></div>${repositoryMarkup}</article>
        <article class="panel activity-panel"><div class="panel-heading"><div><span class="section-kicker">Recent work</span><h2>Project activity</h2></div><button class="text-button" type="button" data-view-link="activity">View all →</button></div><ol class="timeline"><li><i></i><div><strong>${model.escapeHtml(repository?.lastCommit?.subject || 'Nexus authoritative service')}</strong><span>${repository?.lastCommit?.shortHash ? `Commit ${model.escapeHtml(repository.lastCommit.shortHash)}` : 'Settings, status and document boundary'}</span></div><time>${formatAge(repository?.lastCommit?.timestamp || snapshot?.sampledAt)}</time></li><li><i></i><div><strong>Shared variables</strong><span>${connected ? `Authoritative revision ${settings.revision}` : 'Cached fallback active'}</span></div><time>${formatAge(settings.updatedAt)}</time></li><li class="${snapshot?.validation ? '' : 'is-muted'}"><i></i><div><strong>Coordinated validation</strong><span>${snapshot?.validation ? 'Sanitized receipt available' : 'Waiting for validation receipt writer'}</span></div><time>${snapshot?.validation ? formatAge(snapshot.validation.timestamp) : 'Planned'}</time></li></ol></article>
      </section>`;
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  function renderVariables() {
    viewTitle.textContent = 'Variables';
    viewEyebrow.textContent = 'Shared Cyrune preferences';
    const displayed = model.effectiveSettings(settings, settingsScope);
    const scopeLabel = settingsScope === 'global' ? 'Global defaults' : (settingsScope === 'arcade' ? 'Arcade' : 'Portal & Widgets');
    const historyItems = [...settingsHistory].reverse().slice(0, 12).map(record => {
      const changed = (record.changedKeys || []).map(path => path.split('.').map(part => part.replace(/([A-Z])/g, ' $1')).join(' › ')).join(', ');
      return `<li><span><strong>Revision ${Number(record.revision || 0)}</strong><small>${model.escapeHtml(changed || 'No portable values changed')}</small></span><time>${formatAge(record.updatedAt)}</time></li>`;
    }).join('') || '<li class="is-muted"><span><strong>No authoritative history yet</strong><small>Saved changes will list their portable setting names here.</small></span><time>—</time></li>';
    viewRoot.innerHTML = `
      <section class="page-intro"><div><span class="section-kicker">Settings schema ${model.SETTINGS_SCHEMA_VERSION}</span><h2>One set of preferences. Every component.</h2><p>${settingsAuthority === 'authoritative' ? 'Global values flow into fixed component profiles; sparse overrides change only the selected component.' : 'Relay or Host is unavailable. Changes can be retained as a browser-local fallback and applied authoritatively after reconnection.'}</p></div><span class="draft-badge ${settingsAuthority === 'authoritative' ? 'is-authoritative' : ''}">${settingsAuthority === 'authoritative' ? 'Authoritative' : 'Local fallback'} · revision ${settings.revision}</span></section>
      <section class="settings-scope" aria-label="Settings scope"><div><span class="section-kicker">Effective settings</span><strong>${scopeLabel}</strong><small>Default → global → component → local Widget setting</small></div><div class="scope-tabs"><button type="button" data-settings-scope="global" class="${settingsScope === 'global' ? 'is-active' : ''}">Global</button><button type="button" data-settings-scope="portal-widgets" class="${settingsScope === 'portal-widgets' ? 'is-active' : ''}">Portal & Widgets</button><button type="button" data-settings-scope="arcade" class="${settingsScope === 'arcade' ? 'is-active' : ''}">Arcade</button></div></section>
      <section class="settings-tools" aria-label="Settings tools"><label><span aria-hidden="true">⌕</span><input id="settings-search" type="search" placeholder="Search settings…" autocomplete="off"></label><button type="button" class="button button-secondary" id="export-variables">Export JSON</button><label class="button button-secondary settings-import">Import JSON<input id="import-variables" type="file" accept="application/json,.json" hidden></label></section>
      <form id="variables-form" class="settings-layout">
        <aside class="settings-index" aria-label="Variable groups"><a href="#variables-region">Region</a><a href="#variables-units">Units</a><a href="#variables-language">Language</a><a href="#variables-formatting">Formatting</a><a href="#variables-behaviour">Behaviour</a><a href="#variables-accessibility">Accessibility</a><a href="#variables-privacy">Privacy</a></aside>
        <div class="settings-sections">
          <section class="settings-section" id="variables-region"><div class="settings-heading"><span>01</span><div><h2>Region & location</h2><p>Precise coordinates are exposed only to the Portal & Widgets profile when the global permission is enabled.</p></div></div><div class="field-grid">${inputMarkup('region.country', 'Country / region code', displayed.region.country, 'GB', 2)}${inputMarkup('region.city', 'City (optional)', displayed.region.city, 'London', 80)}${inputMarkup('region.timeZone', 'Time zone', displayed.region.timeZone, 'Europe/London', 80)}${selectMarkup('region.locationMode', 'Location mode', displayed.region.locationMode, [['manual', 'Manual only'], ['approximate', 'Approximate (opt-in)'], ['precise', 'Precise coordinates (opt-in)']], 'Automatic modes also require the global privacy permission below.')}${inputMarkup('region.latitude', 'Latitude', displayed.region.latitude, '51.5074', 24, 'number')}${inputMarkup('region.longitude', 'Longitude', displayed.region.longitude, '-0.1278', 24, 'number')}</div></section>
          <section class="settings-section" id="variables-units"><div class="settings-heading"><span>02</span><div><h2>Units</h2><p>Choose a system, then override individual measurements when needed.</p></div></div><div class="field-grid">${selectMarkup('units.system', 'Unit system', displayed.units.system, [['metric', 'Metric'], ['imperial', 'Imperial'], ['custom', 'Custom']])}${selectMarkup('units.temperature', 'Temperature', displayed.units.temperature, [['celsius', 'Celsius (°C)'], ['fahrenheit', 'Fahrenheit (°F)']])}${selectMarkup('units.distance', 'Distance', displayed.units.distance, [['kilometres', 'Kilometres'], ['miles', 'Miles']])}${selectMarkup('units.speed', 'Speed', displayed.units.speed, [['kilometres-per-hour', 'Kilometres per hour'], ['miles-per-hour', 'Miles per hour']])}${selectMarkup('units.mass', 'Mass', displayed.units.mass, [['kilograms', 'Kilograms'], ['pounds', 'Pounds']])}${selectMarkup('units.volume', 'Volume', displayed.units.volume, [['litres', 'Litres'], ['gallons-uk', 'UK gallons'], ['gallons-us', 'US gallons']])}${selectMarkup('units.pressure', 'Pressure', displayed.units.pressure, [['hectopascals', 'Hectopascals'], ['inches-of-mercury', 'Inches of mercury']])}</div></section>
          <section class="settings-section" id="variables-language"><div class="settings-heading"><span>03</span><div><h2>Language</h2><p>BCP 47 language tags keep interface and content preferences portable.</p></div></div><div class="field-grid">${inputMarkup('language.primary', 'Primary language', displayed.language.primary, 'en-GB', 35)}${inputMarkup('language.secondary', 'Secondary language', displayed.language.secondary, 'de-DE', 35)}${inputMarkup('language.interface', 'Interface language', displayed.language.interface, 'en-GB', 35)}${inputMarkup('language.content', 'Content language', displayed.language.content, 'en-GB', 35)}</div></section>
          <section class="settings-section" id="variables-formatting"><div class="settings-heading"><span>04</span><div><h2>Formatting</h2><p>Consistent dates, time, currency and calendar behaviour across Cyrune.</p></div></div><div class="field-grid">${selectMarkup('formatting.date', 'Date order', displayed.formatting.date, [['day-month-year', 'Day / month / year'], ['month-day-year', 'Month / day / year'], ['year-month-day', 'Year / month / day'], ['locale', 'Language default']])}${selectMarkup('formatting.clock', 'Clock', displayed.formatting.clock, [['24-hour', '24-hour'], ['12-hour', '12-hour'], ['locale', 'Language default']])}${inputMarkup('formatting.currency', 'Currency code', displayed.formatting.currency, 'GBP', 3)}${selectMarkup('formatting.weekStart', 'First day of week', displayed.formatting.weekStart, [['monday', 'Monday'], ['sunday', 'Sunday'], ['saturday', 'Saturday'], ['locale', 'Language default']])}</div></section>
          <section class="settings-section" id="variables-behaviour"><div class="settings-heading"><span>05</span><div><h2>Behaviour</h2><p>Portable interaction defaults that components may adopt consistently.</p></div></div>${selectMarkup('behaviour.externalLinks', 'External links', displayed.behaviour.externalLinks, [['new-tab', 'Open in a new tab'], ['current-tab', 'Open in the current tab'], ['component-default', 'Use component default']])}<div class="toggle-stack">${toggleMarkup('behaviour.confirmPrivilegedActions', 'Confirm privileged actions', 'Ask before launches, external writes, or other device-affecting operations.', displayed.behaviour.confirmPrivilegedActions)}${toggleMarkup('behaviour.restoreLastView', 'Restore the last view', 'Let components reopen their most recently used local view.', displayed.behaviour.restoreLastView)}</div></section>
          <section class="settings-section" id="variables-accessibility"><div class="settings-heading"><span>06</span><div><h2>Accessibility</h2><p>Shared comfort preferences; components still retain accessible fallbacks.</p></div></div>${selectMarkup('accessibility.scale', 'Interface scale', displayed.accessibility.scale, [['90', '90%'], ['100', '100%'], ['110', '110%'], ['125', '125%']])}<div class="toggle-stack">${toggleMarkup('accessibility.reducedMotion', 'Reduce motion', 'Minimise non-essential transitions and animated movement.', displayed.accessibility.reducedMotion)}${toggleMarkup('accessibility.highContrast', 'Increase contrast', 'Prefer stronger borders and clearer surface separation.', displayed.accessibility.highContrast)}</div></section>
          <section class="settings-section" id="variables-privacy"><div class="settings-heading"><span>07</span><div><h2>Privacy & network</h2><p>Location permissions are global ceilings; a component override may only narrow optional network access.</p></div></div><div class="toggle-stack">${toggleMarkup('privacy.allowOptionalNetwork', 'Allow optional online lookups', 'Components may use their declared bounded providers.', displayed.privacy.allowOptionalNetwork)}${toggleMarkup('privacy.allowApproximateLocation', 'Allow approximate location', 'Permit coarse automatic regional location when requested.', displayed.privacy.allowApproximateLocation)}${toggleMarkup('privacy.allowPreciseLocation', 'Allow precise location', 'Permit stored coordinates only for components that declare the capability.', displayed.privacy.allowPreciseLocation)}</div></section>
        </div>
        <footer class="settings-actions"><span><strong>${settingsAuthority === 'authoritative' ? 'Host-backed settings' : 'Disconnected fallback'}</strong><small>${scopeLabel} · ${settingsAuthority === 'authoritative' ? `revision ${settings.revision} · ${formatAge(settings.updatedAt)}` : (serviceError || 'Authoritative persistence is not connected.')}</small></span><button type="button" class="button button-secondary" id="reset-variables">${settingsScope === 'global' ? 'Reset global defaults' : 'Clear component overrides'}</button><button type="submit" class="button button-primary">${settingsAuthority === 'authoritative' ? 'Apply settings' : 'Save local fallback'}</button></footer>
      </form>
      <section class="panel settings-history"><div class="panel-heading"><div><span class="section-kicker">Portable change history</span><h2>Recent settings revisions</h2></div></div><ol>${historyItems}</ol></section>`;
    document.getElementById('variables-form').addEventListener('submit', saveVariables);
    document.getElementById('reset-variables').addEventListener('click', resetVariables);
    document.querySelector('select[name="units.system"]')?.addEventListener('change', applyUnitPreset);
    document.getElementById('settings-search').addEventListener('input', filterVariableSections);
    document.getElementById('export-variables').addEventListener('click', exportVariables);
    document.getElementById('import-variables').addEventListener('change', importVariables);
    document.querySelectorAll('[data-settings-scope]').forEach(button => button.addEventListener('click', () => {
      settingsScope = button.dataset.settingsScope;
      renderVariables();
    }));
    document.querySelectorAll('[data-override-path]').forEach(input => input.addEventListener('change', () => {
      const control = [...document.querySelectorAll('[data-setting-control]')]
        .find(candidate => candidate.dataset.settingControl === input.dataset.overridePath);
      if (control) control.disabled = !input.checked;
    }));
  }

  function filterVariableSections(event) {
    const query = String(event.currentTarget.value || '').trim().toLowerCase();
    document.querySelectorAll('.settings-section').forEach(section => {
      section.hidden = !!query && !section.textContent.toLowerCase().includes(query);
    });
  }

  function exportVariables() {
    const documentValue = { kind: 'cyrune-settings', schemaVersion: model.SETTINGS_SCHEMA_VERSION, exportedAt: Date.now(), settings };
    const blob = new Blob([JSON.stringify(documentValue, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cyrune-settings-revision-${settings.revision}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importVariables(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > 128 * 1024) return announce('Settings import exceeds the 128 KiB limit.', 'error');
    try {
      const documentValue = JSON.parse(await file.text());
      if (documentValue?.kind !== 'cyrune-settings' || documentValue.schemaVersion !== model.SETTINGS_SCHEMA_VERSION || !documentValue.settings) {
        throw new Error('This is not a compatible Cyrune settings export.');
      }
      const draft = model.normalizeSettings(documentValue.settings);
      draft.revision = settings.revision;
      draft.updatedAt = settings.updatedAt;
      await persistVariables(draft);
      announce('Imported settings were validated and applied.', 'success');
    } catch (error) {
      announce(error?.message || 'Could not import Cyrune settings.', 'error');
    }
  }

  function applyUnitPreset(event) {
    const presets = {
      metric: { temperature: 'celsius', distance: 'kilometres', speed: 'kilometres-per-hour', mass: 'kilograms', volume: 'litres', pressure: 'hectopascals' },
      imperial: { temperature: 'fahrenheit', distance: 'miles', speed: 'miles-per-hour', mass: 'pounds', volume: 'gallons-uk', pressure: 'inches-of-mercury' }
    };
    const preset = presets[event.currentTarget.value];
    if (!preset) return;
    Object.entries(preset).forEach(([name, value]) => { event.currentTarget.form.elements.namedItem(`units.${name}`).value = value; });
  }

  function setPath(target, path, value) {
    const parts = path.split('.');
    target[parts[0]][parts[1]] = value;
  }

  async function saveVariables(event) {
    event.preventDefault();
    const draft = model.clone(settings);
    const controls = [...event.currentTarget.querySelectorAll('[data-setting-control]')];
    const readControl = control => {
      if (control.type === 'checkbox') return control.checked;
      if (control.dataset.settingControl === 'region.latitude' || control.dataset.settingControl === 'region.longitude') {
        return control.value.trim() === '' ? null : Number(control.value);
      }
      return control.value;
    };
    if (settingsScope === 'global') {
      controls.forEach(control => setPath(draft, control.dataset.settingControl, readControl(control)));
    } else {
      draft.overrides ||= {};
      draft.overrides[settingsScope] = {};
      const selected = new Set([...event.currentTarget.querySelectorAll('[data-override-path]:checked')]
        .map(input => input.dataset.overridePath));
      controls.forEach(control => {
        const path = control.dataset.settingControl;
        if (selected.has(path)) model.setPath(draft.overrides[settingsScope], path, readControl(control));
      });
    }
    await persistVariables(model.normalizeSettings(draft));
  }

  async function persistVariables(draft) {
    if (settingsAuthority === 'authoritative' && bridge) {
      try {
        const response = await bridge.request('MW_NEXUS_SAVE_SETTINGS', {
          settings: draft,
          expectedRevision: settings.revision
        });
        settings = model.normalizeSettings(response.settings);
        cacheSettings(settings);
        if (response.conflict === true) {
          announce('Settings changed in another Nexus tab. The authoritative revision has been reloaded; review and apply again.', 'error');
        } else {
          announce(`Authoritative Cyrune settings revision ${settings.revision} saved.`, 'success');
          void refreshAuthoritative();
        }
        renderVariables();
        return;
      } catch (error) {
        settingsAuthority = 'preview';
        serviceError = error?.message || String(error);
      }
    }
    draft.revision = settings.revision + 1;
    draft.updatedAt = Date.now();
    settings = model.normalizeSettings(draft);
    cacheSettings(settings);
    announce('Saved a browser-local fallback. Reconnect Relay and Host before treating it as shared Cyrune configuration.', 'error');
    renderVariables();
  }

  async function resetVariables() {
    if (settingsScope === 'global') {
      const defaults = model.normalizeSettings({
        revision: settings.revision,
        updatedAt: settings.updatedAt,
        schemaVersion: model.SETTINGS_SCHEMA_VERSION,
        overrides: settings.overrides
      });
      await persistVariables(defaults);
      return;
    }
    const draft = model.clone(settings);
    draft.overrides ||= {};
    draft.overrides[settingsScope] = {};
    await persistVariables(model.normalizeSettings(draft));
  }

  function renderActivity() {
    viewTitle.textContent = 'Activity';
    viewEyebrow.textContent = 'Project history and validation';
    const components = [...(snapshot?.components || [])].sort((left, right) => (right.updatedMs || 0) - (left.updatedMs || 0));
    const items = components.length ? components.map(component => `<li><i></i><div><strong>${model.escapeHtml(component.name)} source</strong><span>Version ${model.escapeHtml(component.version || 'Unknown')}</span></div><time>${formatAge(component.updatedMs)}</time></li>`).join('') : '<li class="is-muted"><i></i><div><strong>Authoritative activity unavailable</strong><span>Reconnect Relay and Host to refresh component timestamps.</span></div><time>Offline</time></li>';
    const events = [...(snapshot?.events || [])].sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0)).slice(0, 50);
    const eventItems = events.length
      ? events.map(event => `<li><i></i><div><strong>${model.escapeHtml(event.component)} · ${model.escapeHtml(event.code)}</strong><span>${model.escapeHtml(event.summary)}</span></div><time>${formatAge(event.timestamp)}</time></li>`).join('')
      : '<li class="is-muted"><i></i><div><strong>No operational events recorded</strong><span>The bounded journal contains only fixed codes and summaries.</span></div><time>Quiet</time></li>';
    const receipt = snapshot?.validation || null;
    const versionItems = Object.entries(receipt?.versions || {}).map(([name, version]) => `<li><span>${model.escapeHtml(name)}</span><strong>${model.escapeHtml(version)}</strong></li>`).join('');
    const testItems = Object.entries(receipt?.tests || {}).map(([name, counts]) => {
      const passed = typeof counts === 'number' ? counts : Number(counts?.passed || 0);
      return `<li><span>${model.escapeHtml(name)}</span><strong>${passed} passed</strong></li>`;
    }).join('');
    const checkItems = Object.entries(receipt?.checks || {}).map(([name, outcome]) => `<li><span>${model.escapeHtml(name)}</span><strong class="receipt-outcome receipt-${model.escapeHtml(String(outcome))}">${model.escapeHtml(String(outcome))}</strong></li>`).join('');
    const receiptMarkup = receipt ? `<section class="validation-grid"><article class="panel receipt-summary"><span class="section-kicker">Latest coordinated validation</span><h2>${formatAge(receipt.timestamp)}</h2><p>Commit <code>${model.escapeHtml(String(receipt.commit || '').slice(0, 10))}</code> · schema ${Number(receipt.schemaVersion || 0)}</p></article><article class="panel"><div class="panel-heading"><div><span class="section-kicker">Versions</span><h2>Validated components</h2></div></div><ul class="receipt-list">${versionItems}</ul></article><article class="panel"><div class="panel-heading"><div><span class="section-kicker">Tests</span><h2>Passing suites</h2></div></div><ul class="receipt-list">${testItems}</ul></article><article class="panel"><div class="panel-heading"><div><span class="section-kicker">Checks</span><h2>Release gates</h2></div></div><ul class="receipt-list">${checkItems}</ul></article></section>` : `<section class="panel receipt-empty"><span class="section-kicker">Coordinated validation</span><h2>No sanitized receipt yet</h2><p>Run <code>.\tools\validate.ps1</code> successfully, then refresh Nexus. Failed or interrupted runs never replace the last known-good receipt.</p></section>`;
    viewRoot.innerHTML = `<section class="page-intro"><div><span class="section-kicker">Sanitized records</span><h2>What changed, and what was verified.</h2><p>Activity combines content-free source metadata, repository state, bounded operational events and validation receipts. No command output, private paths, database contents or credentials are returned.</p></div></section>${receiptMarkup}<section class="panel activity-ledger"><div class="panel-heading"><div><span class="section-kicker">Operational journal</span><h2>Recent bounded events</h2></div></div><ol class="timeline">${eventItems}</ol></section><section class="panel activity-ledger"><div class="panel-heading"><div><span class="section-kicker">Source activity</span><h2>Component updates</h2></div></div><ol class="timeline">${items}</ol></section>`;
  }

  function renderProject() {
    viewTitle.textContent = 'Project';
    viewEyebrow.textContent = 'Monorepo status';
    const protocolRows = model.COMPONENTS.map(component => {
      const compatibility = adapters.compatibility(component, snapshot);
      const contracts = Object.entries(component.protocols || {}).map(([name, version]) => `${name} v${version}`).join(' · ') || 'No cross-component protocol';
      return `<tr><th>${componentIconMarkup(component.id, 'protocol-icon')}<span>${model.escapeHtml(component.name)}</span></th><td>${model.escapeHtml(contracts)}</td><td><span class="compatibility-${compatibility.state}">${model.escapeHtml(compatibility.summary)}</span></td></tr>`;
    }).join('');
    const todoCards = model.COMPONENTS.map(component => `<article class="todo-summary" id="project-todo-summary-${component.id}">${componentIconMarkup(component.id, 'protocol-icon')}<div><strong>${model.escapeHtml(component.name)}</strong><span>Reading TODO…</span></div></article>`).join('');
    viewRoot.innerHTML = `<section class="page-intro"><div><span class="section-kicker">Cyrune monorepo</span><h2>Architecture, migration and release state.</h2><p>Project combines the root migration checklist, component work queues, protocol readiness and the latest coordinated validation state.</p></div></section><section class="panel protocol-matrix"><div class="panel-heading"><div><span class="section-kicker">Expansion contracts</span><h2>Protocol compatibility matrix</h2></div></div><div class="table-scroll"><table><thead><tr><th>Component</th><th>Required contracts</th><th>Observed readiness</th></tr></thead><tbody>${protocolRows}</tbody></table></div></section><section class="panel todo-summary-panel"><div class="panel-heading"><div><span class="section-kicker">Work queues</span><h2>Component TODO summary</h2></div></div><div class="todo-summary-grid">${todoCards}</div></section><section class="document-grid">${projectDocumentPanel('todo', 'Migration and cutover', '../CYRUNE-MONOREPO-TODO.md')}${projectDocumentPanel('project', 'Project architecture', '../PROJECT.md')}</section>`;
    loadTodoSummaries();
    loadProjectDocument('todo', '../CYRUNE-MONOREPO-TODO.md');
    loadProjectDocument('project', '../PROJECT.md');
  }

  async function loadTodoSummaries() {
    await Promise.all(model.COMPONENTS.map(async component => {
      const target = document.getElementById(`project-todo-summary-${component.id}`);
      if (!target) return;
      try {
        const markdown = await documentRepository.load({
          cacheKey: `${component.id}:todo`, url: component.todo,
          serviceDocument: { component: component.id, documentType: 'todo' },
          revision: snapshot?.sampledAt || 0
        });
        const open = String(markdown).split(/\r?\n/).map(line => {
          const match = line.match(/^-\s+(?:\[\s\]\s+)?(.+)$/);
          return match && !/^\[[xX]\]\s+/.test(match[1]) ? match[1] : '';
        }).filter(Boolean);
        const detail = open.slice(0, 3).map(item => item.replace(/[`*_#]/g, '').trim()).join(' · ');
        target.querySelector('span').textContent = open.length ? `${open.length} open · ${detail}` : 'No unchecked TODO entries';
      } catch {
        target.querySelector('span').textContent = 'TODO summary unavailable offline';
      }
    }));
  }

  function renderComponent(id) {
    const component = model.componentById(id);
    if (!component) return renderOverview();
    const live = liveComponent(component);
    const repository = snapshot?.repository;
    const health = componentHealth(component);
    const compatibility = adapters.compatibility(component, snapshot);
    const runtimeLabel = adapters.runtimeSummary(component, { health, data: snapshot?.data || {} });
    viewTitle.textContent = component.name;
    viewEyebrow.textContent = 'Component status';
    viewRoot.innerHTML = `<section class="component-hero accent-${component.accent}">${componentIconMarkup(component.id, 'component-symbol large')}<div><span class="section-kicker">Cyrune component</span><h2>${model.escapeHtml(component.name)}</h2><p>${model.escapeHtml(component.summary)}</p></div><div class="version-stack"><small>Source version</small><strong>${model.escapeHtml(live.version || component.version)}</strong><span>Updated ${formatAge(live.updatedMs)}</span></div></section><section class="component-facts"><div><small>Runtime health</small><strong>${model.escapeHtml(runtimeLabel)}</strong></div><div><small>Protocol compatibility</small><strong class="compatibility-${compatibility.state}">${model.escapeHtml(compatibility.summary)}</strong></div><div><small>Health sampled</small><strong>${formatAge(health.sampledAt)}</strong></div><div><small>Repository state</small><strong>${repository ? (repository.clean ? 'Clean' : `${repository.staged + repository.unstaged} changes`) : 'Unavailable'}</strong></div><div><small>Validation</small><strong>${snapshot?.validation ? formatAge(snapshot.validation.timestamp) : 'No receipt'}</strong></div></section>${health.state !== 'healthy' && health.guidance ? `<section class="component-health-guidance health-${health.state}"><span class="status-pill ${healthTone(health.state)}">${healthLabel(health.state)}</span><div><strong>${model.escapeHtml(health.summary)}</strong><p>${model.escapeHtml(health.guidance)}</p></div></section>` : ''}<section class="document-grid">${documentPanel(component, 'todo', 'Open work', component.todo)}${documentPanel(component, 'changelog', 'Release history', component.changelog)}</section>`;
    loadDocument(component, 'todo', component.todo);
    loadDocument(component, 'changelog', component.changelog);
  }

  function documentPanel(component, type, label, url) {
    const action = type === 'todo' ? `<button class="text-button" type="button" data-open-todo="${component.id}">Edit in VS Code ↗</button>` : '';
    return `<article class="panel document-panel"><div class="panel-heading"><div><span class="section-kicker">${label}</span><h2>${type === 'todo' ? 'TODO' : 'Changelog'}</h2></div>${action}</div><div class="document-content" id="document-${component.id}-${type}"><div class="document-loading"><span></span><p>Reading local document…</p></div></div></article>`;
  }

  function projectDocumentPanel(id, label, url) {
    const action = id === 'todo' ? '<button class="text-button" type="button" data-open-todo="project">Edit in VS Code ↗</button>' : `<a class="text-button" href="${url}" target="_blank" rel="noopener">Open file ↗</a>`;
    return `<article class="panel document-panel"><div class="panel-heading"><div><span class="section-kicker">${label}</span><h2>${id === 'todo' ? 'Migration TODO' : 'PROJECT.md'}</h2></div>${action}</div><div class="document-content" id="project-document-${id}"><div class="document-loading"><span></span><p>Reading local document…</p></div></div></article>`;
  }

  async function openTodoInVscode(component) {
    if (!serviceAuthenticated || !bridge) {
      announce('Reconnect Cyrune Relay and Host before opening a TODO in Visual Studio Code.', 'error');
      return;
    }
    try {
      await bridge.request('MW_NEXUS_OPEN_TODO', { component });
      announce('TODO opened in Visual Studio Code.', 'success');
    } catch (error) {
      announce(error?.message || 'The TODO could not be opened in Visual Studio Code.', 'error');
    }
  }

  async function checkRepositoryRemote() {
    if (!serviceAuthenticated || !bridge || remoteCheckPending) {
      if (!serviceAuthenticated) announce('Reconnect Cyrune Relay and Host before checking origin.', 'error');
      return;
    }
    remoteCheckPending = true;
    render();
    try {
      const response = await bridge.request('MW_NEXUS_CHECK_REMOTE', {}, 25000);
      remoteCheck = response.remote?.available ? response.remote : { error: 'Origin did not return a usable branch result.' };
      announce('Origin checked without changing the repository.', 'success');
    } catch (error) {
      remoteCheck = { error: error?.message || 'Cyrune origin could not be checked.' };
      announce(remoteCheck.error, 'error');
    } finally {
      remoteCheckPending = false;
      render();
    }
  }

  async function loadTextDocument(target, url, fallback, serviceDocument) {
    try {
      let markdown;
      if (documentRepository) {
        markdown = await documentRepository.load({
          cacheKey: `${serviceDocument?.component || 'local'}:${serviceDocument?.documentType || url}`,
          url,
          serviceDocument,
          revision: snapshot?.sampledAt || 0
        });
      } else {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Document unavailable');
        markdown = await response.text();
        if (!markdown || markdown.length > 500000) throw new Error('Document is empty or too large');
      }
      target.innerHTML = model.renderMarkdown(markdown);
    } catch (_error) {
      target.innerHTML = `<div class="document-fallback"><span>≡</span><strong>Preview unavailable in this file context</strong><p>${model.escapeHtml(fallback)}</p></div>`;
    }
  }

  function loadDocument(component, type, url) {
    const target = document.getElementById(`document-${component.id}-${type}`);
    if (target) loadTextDocument(target, url, `Open the source document directly. Host permits only the allowlisted ${type} for ${component.name}.`, { component: component.id, documentType: type });
  }

  function loadProjectDocument(id, url) {
    const target = document.getElementById(`project-document-${id}`);
    if (target) loadTextDocument(target, url, 'Open the project document directly. Host permits only this allowlisted project file.', { component: 'project', documentType: id });
  }

  function render() {
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('is-active', button.dataset.view === activeView));
    document.querySelectorAll('[data-component]').forEach(button => button.classList.toggle('is-active', button.dataset.component === activeView));
    if (activeView === 'overview') renderOverview();
    else if (activeView === 'variables') renderVariables();
    else if (activeView === 'activity') renderActivity();
    else if (activeView === 'project') renderProject();
    else renderComponent(activeView);
    renderServiceChrome();
    viewRoot.focus({ preventScroll: true });
  }

  function navigate(view) {
    activeView = ['overview', 'variables', 'activity', 'project'].includes(view) || model.componentById(view) ? view : 'overview';
    if (location.hash !== `#${activeView}`) history.replaceState(null, '', `#${activeView}`);
    render();
  }

  componentNav.innerHTML = model.COMPONENTS.map(component => `<button class="nav-item component-nav-item" type="button" data-component="${component.id}">${componentIconMarkup(component.id, 'component-nav-icon')}${component.name}<small>${model.escapeHtml(component.version)}</small></button>`).join('') + `<button class="nav-item component-nav-item" type="button" data-component="project"><img class="component-nav-icon" src="${componentIconPath('project')}" alt="" aria-hidden="true">Project<small>Monorepo</small></button>`;
  document.addEventListener('click', event => {
    const pageIcon = event.target.closest('[data-open-component-page]');
    if (pageIcon) {
      const component = model.componentById(pageIcon.dataset.openComponentPage);
      if (component?.page) {
        event.preventDefault();
        event.stopPropagation();
        window.open(component.page, '_blank', 'noopener');
      }
      return;
    }
    const remote = event.target.closest('[data-check-remote]');
    if (remote) {
      event.preventDefault();
      void checkRepositoryRemote();
      return;
    }
    const todo = event.target.closest('[data-open-todo]');
    if (todo) {
      event.preventDefault();
      void openTodoInVscode(todo.dataset.openTodo);
      return;
    }
    const target = event.target.closest('[data-view], [data-component], [data-open-component], [data-view-link]');
    if (target) navigate(target.dataset.view || target.dataset.component || target.dataset.openComponent || target.dataset.viewLink);
  });
  document.getElementById('refresh-button').addEventListener('click', () => { void refreshAuthoritative({ announceResult: true }); });
  window.addEventListener('cyrune:nexus-relay-ready', () => { void refreshAuthoritative(); });
  window.addEventListener('cyrune:nexus-settings-changed', event => {
    const revision = Number(event.detail?.revision || 0);
    if (revision > settings.revision) {
      documentRepository?.discardOlderServiceRevisions(revision);
      void refreshAuthoritative();
    }
  });
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
  navigate(location.hash.slice(1) || 'overview');
  window.setTimeout(() => { void refreshAuthoritative(); }, 250);
}());
