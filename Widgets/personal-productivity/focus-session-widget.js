// Focus Session controls the Relay-owned timer. Legacy SDK cache is read only
// for explicit adoption; runtime history never enters portable Portal data.

const FOCUS_SESSION_PRESETS = Object.freeze({
  pomodoro: { label: 'Pomodoro', workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
  deepWork: { label: 'Deep work', workMinutes: 50, breakMinutes: 10, longBreakMinutes: 30, longBreakEvery: 3 },
  shortSprint: { label: 'Short sprint', workMinutes: 15, breakMinutes: 3, longBreakMinutes: 10, longBreakEvery: 4 },
  custom: { label: 'Custom' }
});

let _focusSessionCalendarWarmAt = 0;

function _focusClampMinutes(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(240, parsed)) : fallback;
}

function _focusNormalizedConfig(widget) {
  const config = widget?.config || {};
  return {
    preset: Object.hasOwn(FOCUS_SESSION_PRESETS, config.preset) ? config.preset : 'pomodoro',
    workMinutes: _focusClampMinutes(config.workMinutes, 25),
    breakMinutes: _focusClampMinutes(config.breakMinutes, 5),
    longBreakMinutes: _focusClampMinutes(config.longBreakMinutes, 15),
    longBreakEvery: Math.max(1, Math.min(12, Math.round(Number(config.longBreakEvery) || 4))),
    autoStartNext: config.autoStartNext === true,
    showDailyTotals: config.showDailyTotals !== false,
    launchTarget: String(config.launchTarget || ''),
    warnCalendarConflicts: config.warnCalendarConflicts !== false,
    notifications: config.notifications === true
  };
}

function _focusPhaseLabel(phase) {
  return phase === 'longBreak' ? 'Long break' : phase === 'break' ? 'Short break' : 'Focus';
}

function _focusFormatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = value => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function _focusLocalDayKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function _focusCollectWidgetItems(widgetType) {
  if (typeof state === 'undefined') return [];
  const matches = [];
  const walk = items => {
    (items || []).forEach(item => {
      if (item?.type === 'widget' && item.widgetType === widgetType) matches.push(item);
      if (item?.children) walk(item.children);
    });
  };
  (state.boards || []).forEach(board => {
    const tabs = typeof getBoardTabs === 'function' ? getBoardTabs(board) : [{ columns: board.columns || [] }];
    tabs.forEach(tab => {
      (tab.columns || []).forEach(column => walk(column.items));
      walk(typeof getBoardInbox === 'function' ? getBoardInbox(board, tab)?.items : tab.inbox?.items);
    });
  });
  walk(state.navItems || []);
  return matches;
}

function _focusWarmCalendarData() {
  if (typeof _calendarEnsureData !== 'function' || Date.now() - _focusSessionCalendarWarmAt < 5 * 60 * 1000) return [];
  const widgets = _focusCollectWidgetItems('protonCalendar');
  if (!widgets.length) return [];
  _focusSessionCalendarWarmAt = Date.now();
  return widgets.map(widget => {
    try { return Promise.resolve(_calendarEnsureData(widget)).catch(() => null); } catch { return Promise.resolve(null); }
  });
}

function _focusFindCalendarConflict(start, end) {
  if (typeof _calendarRuntime === 'undefined') return null;
  const events = [];
  for (const runtime of _calendarRuntime.values()) {
    (runtime?.events || []).forEach(event => {
      const eventStart = Number(event.start);
      const eventEnd = Number(event.end) || eventStart + 60 * 60 * 1000;
      if (!event.allDay && eventEnd > start && eventStart < end) events.push(event);
    });
  }
  return events.sort((left, right) => left.start - right.start)[0] || null;
}

function _focusWalkFolders(items, location, board, output) {
  (items || []).forEach(item => {
    if (item?.type !== 'folder') return;
    output.push({ id: item.id, folder: item, board, label: `${location} / ${item.title || 'Untitled Folder'}` });
    const dynamic = typeof isDynamicFolder === 'function' ? isDynamicFolder(item) : item.dynamic === true;
    if (!dynamic) _focusWalkFolders(item.children || [], `${location} / ${item.title || 'Untitled Folder'}`, board, output);
  });
}

function _focusFolderOptions() {
  if (typeof state === 'undefined') return [];
  const folders = [];
  (state.boards || []).forEach(board => {
    const tabs = typeof getBoardTabs === 'function' ? getBoardTabs(board) : [{ title: '', columns: board.columns || [] }];
    tabs.forEach(tab => (tab.columns || []).forEach(column => {
      _focusWalkFolders(column.items, `${board.title || 'Untitled Board'} / ${tab.title || 'Untitled Tab'} / ${column.title || 'Untitled Column'}`, board, folders);
    }));
  });
  _focusWalkFolders(state.navItems || [], 'Sidebar', null, folders);
  return folders;
}

function _focusLaunchOptions() {
  const options = [{ value: '', label: 'Do not open anything' }];
  if (typeof state !== 'undefined') {
    (state.sets || []).forEach(set => options.push({ value: `set:${set.id}`, label: `Set · ${set.title || 'Untitled Set'}` }));
    _focusFolderOptions().forEach(entry => options.push({ value: `folder:${entry.id}`, label: `Folder · ${entry.label}` }));
  }
  return options;
}

function _focusFindFolder(folderId) {
  return _focusFolderOptions().find(entry => entry.id === folderId) || null;
}

function _focusCollectFolderBookmarks(folder, board, seen = new Set()) {
  if (!folder || seen.has(folder.id)) return [];
  seen.add(folder.id);
  const children = typeof resolveFolderChildren === 'function' ? resolveFolderChildren(folder, board) : folder.children || [];
  const bookmarks = [];
  children.forEach(item => {
    if (item?.type === 'bookmark' && item.url) bookmarks.push(item);
    if (item?.type === 'folder') bookmarks.push(..._focusCollectFolderBookmarks(item, board, seen));
  });
  return bookmarks;
}

function _focusResolveLaunchBookmarks(target) {
  const value = String(target || '');
  if (value.startsWith('set:')) {
    const set = typeof findSetById === 'function' ? findSetById(value.slice(4)) : null;
    return { found: !!set, label: set?.title || 'Set', bookmarks: set && typeof resolveSetItems === 'function' ? resolveSetItems(set).filter(item => item?.url) : [] };
  }
  if (value.startsWith('folder:')) {
    const match = _focusFindFolder(value.slice(7));
    return { found: !!match, label: match?.folder?.title || 'Folder', bookmarks: match ? _focusCollectFolderBookmarks(match.folder, match.board) : [] };
  }
  return { found: true, label: '', bookmarks: [] };
}

function _focusLaunchTarget(widget) {
  const target = _focusNormalizedConfig(widget).launchTarget;
  if (!target) return false;
  const resolved = _focusResolveLaunchBookmarks(target);
  if (!resolved.found) {
    if (typeof showNotice === 'function') showNotice('The configured focus launch target no longer exists.');
    return false;
  }
  const seen = new Set();
  const bookmarks = resolved.bookmarks.filter(item => {
    const url = String(item?.url || '');
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  if (!bookmarks.length) {
    if (typeof showNotice === 'function') showNotice(`${resolved.label || 'The launch target'} has no bookmarks to open.`);
    return false;
  }
  const open = () => bookmarks.forEach(bookmark => {
    if (typeof openHubBookmark === 'function') openHubBookmark(bookmark);
  });
  if (bookmarks.length > 10 && typeof showConfirmDialog === 'function') showConfirmDialog(`Open ${bookmarks.length} focus bookmarks?`, open, 'Open Bookmarks');
  else open();
  return true;
}

function _focusEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

const _focusServiceViews = new Map();
function _focusSessionReviewMarkup(report, phase, tracking) {
  const minutes=value=>`${Math.round(Math.max(0,value)/60000)}m`;
  return `<div class="focus-review-totals"><span>Session <strong>${minutes(phase.durationMs)}</strong></span><span title="Browsing on sites not flagged distracting">Focused <strong>${minutes(report.totalMs-report.distractingMs)}</strong></span><span>Distracting <strong>${minutes(report.distractingMs)}</strong></span></div>
    ${!tracking?'<div class="focus-review-state">Tracking off</div>':''}${report.sites.slice(0,3).map(site=>`<div class="focus-review-site"><span>${_focusEscape(site.name)}</span><strong>${minutes(site.milliseconds)}</strong></div>`).join('')}`;
}
function _focusRenderWidget(widget, element, context = 'column') {
  const key = widget.id + ':' + context;
  _focusServiceViews.get(key)?.();
  let snapshot, pending = false, disposed = false, lastRevision = -1;
  const legacy = WidgetSDK.cache.get('focusSession', widget.id, 'runtime');
  const view = WidgetSDK.cache.get('focusSession', widget.id, 'view') || {};
  const request = (action, args = {}) => WidgetSDK.productivity.request('focusSession', 'focus', action, args, snapshot?.focus.revision);
  const config = () => Object.fromEntries(['workMinutes','breakMinutes','longBreakMinutes','longBreakEvery','autoStartNext','notifications'].map(name => [name, _focusNormalizedConfig(widget)[name]]));
  const reviewPhases=()=>snapshot.focus.history.filter(row=>typeof row.id==='string'&&row.phase==='work'&&!row.interrupted&&(!row.skipped||row.stopped)&&!row.id.startsWith('legacy-')).slice(0,20);
  let reviewRead=0;
  async function updateReview() {
    const generation=++reviewRead,phase=reviewPhases().find(row=>row.id===view.reviewSessionId)||reviewPhases()[0],output=element.querySelector('[data-focus-review]');
    if(!phase||!output)return;
    try {const result=await WidgetSDK.productivity.request('focusSession','activity','report',{sessionId:phase.id,from:_focusLocalDayKey(Date.now()-365*86400000),to:_focusLocalDayKey(phase.endedAt)});
      if(disposed||generation!==reviewRead)return;
      output.innerHTML=_focusSessionReviewMarkup(result.report,phase,snapshot.activity.enabled&&!snapshot.activity.paused);
    }catch{if(!disposed&&generation===reviewRead)output.textContent='Review unavailable';}
  }
  function clock() {
    const output = element.querySelector('[data-focus-countdown]');
    if (output && snapshot) {
      const focus = snapshot.focus, remaining = focus.status === 'running' ? Math.max(0, focus.endsAt - Date.now()) : focus.remainingMs;
      output.textContent = _focusFormatDuration(remaining);
      const duration = focus.config[focus.phase === 'work' ? 'workMinutes' : focus.phase === 'break' ? 'breakMinutes' : 'longBreakMinutes'] * 60000;
      element.querySelector('[data-focus-dial]')?.style.setProperty('--focus-progress', `${Math.max(0, Math.min(1, 1 - remaining / duration)) * 360}deg`);
    }
  }
  async function command(action, args = {}) {
    if (pending) return;
    pending = true;
    element.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
      if (action === 'start') {
        await Promise.all(_focusWarmCalendarData());
        const conflict = _focusFindCalendarConflict(Date.now(), Date.now() + _focusNormalizedConfig(widget).workMinutes * 60000);
        if (_focusNormalizedConfig(widget).warnCalendarConflicts && conflict && typeof showNotice === 'function') showNotice(`Focus overlaps Calendar: ${conflict.title}`);
      }
      await request(action, args);
      if (action === 'start') _focusLaunchTarget(widget);
      lastRevision = -1;
      await refresh();
    } catch (error) {
      const message = element.querySelector('[data-focus-error]');
      if (message) message.textContent = error.message;
    } finally {
      pending = false;
      element.querySelectorAll('button').forEach(button => { button.disabled = snapshot?.focus.status === 'idle' && button.matches('[data-focus-skip],[data-focus-stop]'); });
    }
  }
  function paint() {
    const focus = snapshot.focus;
    const legacyPending = legacy && !snapshot.adopted.includes(widget.id) && (legacy.history?.length || legacy.status === 'running' || legacy.status === 'paused');
    element.classList.add('focus-session');
    element.classList.toggle('focus-session--navpane', context === 'navpane');
    element.innerHTML = `<div class="focus-session-dial focus-session-dial--${focus.phase}" data-focus-dial><div class="focus-session-time" data-focus-countdown></div><div class="focus-session-phase">${_focusPhaseLabel(focus.phase)}</div></div>
      <div class="focus-session-controls"><button type="button" class="focus-session-primary" data-focus-primary title="${focus.status === 'idle' ? 'Start' : focus.status === 'running' ? 'Pause' : 'Resume'}" aria-label="${focus.status === 'idle' ? 'Start' : focus.status === 'running' ? 'Pause' : 'Resume'}">${focus.status === 'running' ? 'Ⅱ' : '▶'}</button><button type="button" data-focus-skip title="Skip phase" aria-label="Skip phase">↠</button><button type="button" data-focus-stop title="Stop" aria-label="Stop">■</button></div>
      <div class="focus-session-stats" ${_focusNormalizedConfig(widget).showDailyTotals ? '' : 'hidden'}>${focus.history.filter(row => row.phase === 'work' && !row.skipped && !row.interrupted && _focusLocalDayKey(row.endedAt) === _focusLocalDayKey()).length} completed today · ${focus.workCount} in cycle</div>
      <div data-focus-browsing class="focus-session-stats"></div>
      ${reviewPhases().length?`<details class="focus-session-review" ${view.reviewOpen!==false?'open':''}><summary>Session review</summary><select data-focus-review-phase aria-label="Review focus session"><option value="">Latest</option>${reviewPhases().map(row=>`<option value="${_focusEscape(row.id)}" ${view.reviewSessionId===row.id?'selected':''}>${_focusEscape(new Date(row.endedAt).toLocaleString())}${row.stopped?' · Stopped':''}</option>`).join('')}</select><div data-focus-review></div></details>`:''}
      ${focus.interrupted ? '<div class="focus-session-conflict">Interrupted while Firefox was unavailable. Review before resuming.</div>' : ''}
      ${legacyPending ? '<div class="focus-session-conflict">Earlier local timer/history found. The original cache is retained.</div><button type="button" data-focus-import>Import history only</button><button type="button" data-focus-adopt>Adopt this timer (paused)</button>' : ''}
      <details class="focus-session-history" ${view.historyOpen ? 'open' : ''}><summary>Recent phases</summary>${focus.history.slice(0,20).map(row => `<div class="focus-session-history-row"><span>${row.interrupted ? 'Interrupted ' : row.skipped ? 'Skipped ' : ''}${_focusPhaseLabel(row.phase)}</span><time>${_focusEscape(new Date(row.endedAt).toLocaleString())}</time></div>`).join('')}</details>
      <div data-focus-error role="status"></div>`;
    element.querySelector('[data-focus-primary]').onclick = () => command(focus.status === 'idle' ? 'start' : focus.status === 'running' ? 'pause' : 'resume', focus.status === 'idle' ? { config: config(), widgetId: widget.id } : {});
    element.querySelector('[data-focus-skip]').onclick = () => command('skip');
    element.querySelector('[data-focus-stop]').onclick = () => command('stop');
    element.querySelector('[data-focus-skip]').disabled = focus.status === 'idle';
    element.querySelector('[data-focus-stop]').disabled = focus.status === 'idle';
    for (const [selector, activate] of [['[data-focus-import]',false],['[data-focus-adopt]',true]]) {
      const button = element.querySelector(selector);
      if (button) button.onclick = () => command('adopt', { widgetId: widget.id, runtime: legacy, config: config(), activate });
    }
    element.querySelector('.focus-session-history').ontoggle = event => { view.historyOpen = event.target.open; WidgetSDK.cache.set('focusSession', widget.id, 'view', view); };
    const review=element.querySelector('.focus-session-review');
    if(review){review.ontoggle=event=>{view.reviewOpen=event.target.open;WidgetSDK.cache.set('focusSession',widget.id,'view',view);};element.querySelector('[data-focus-review-phase]').onchange=event=>{view.reviewSessionId=event.target.value;WidgetSDK.cache.set('focusSession',widget.id,'view',view);void updateReview();};}
    clock();
  }
  let reading = false;
  async function refresh() {
    if (disposed || reading) return;
    reading = true;
    try {
      const result = await request('state');
      if (disposed) return;
      snapshot = result;
      if (lastRevision !== result.focus.revision) { paint(); lastRevision = result.focus.revision; }
      clock();
      const today = _focusLocalDayKey();
      const report = await WidgetSDK.productivity.request('focusSession', 'activity', 'report', { from: today, to: today });
      const output = element.querySelector('[data-focus-browsing]');
      if (output) output.textContent = `Browsing today · ${Math.round(report.report.totalMs / 60000)} min`;
      await updateReview();
    } catch (error) {
      element.textContent = `Focus unavailable: ${error.message}`;
      lastRevision = -1;
    } finally { reading = false; }
  }
  const unsubscribe = WidgetSDK.productivity.subscribe(() => { void refresh(); });
  let ticks = 0;
  WidgetSDK.runtime.schedule(key + ':focus', () => { clock(); if (++ticks % 15 === 0) void refresh(); }, 1000);
  const stop = () => { disposed = true; unsubscribe(); WidgetSDK.runtime.cancelSchedule(key + ':focus'); };
  _focusServiceViews.set(key, stop);
  element.textContent = 'Connecting to Relay Focus…';
  void refresh();
}

WIDGET_REGISTRY['focusSession'] = {
  id: 'focusSession',
  name: 'Focus Session',
  category: 'Personal & Productivity',
  description: 'One shared Relay Pomodoro timer, background notifications, daily history, and optional launch helpers.',
  allowedIn: ['column', 'navpane'],
  liveSettingsPreview: false,
  defaultConfig: {
    preset: 'pomodoro', workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4,
    autoStartNext: false, showDailyTotals: true, launchTarget: '', warnCalendarConflicts: true, notifications: false
  },
  defaultData: {},
  settingsSchema: {
    type: 'object',
    properties: {
      preset: { type: 'string', enum: Object.keys(FOCUS_SESSION_PRESETS) },
      workMinutes: { type: 'number' }, breakMinutes: { type: 'number' }, longBreakMinutes: { type: 'number' }, longBreakEvery: { type: 'number' },
      autoStartNext: { type: 'boolean' }, showDailyTotals: { type: 'boolean' }, launchTarget: { type: 'string' },
      warnCalendarConflicts: { type: 'boolean' }, notifications: { type: 'boolean' }
    },
    additionalProperties: false
  },
  capabilities: { extensionRelay: { optional: true }, timers: true, localCache: { quotaBytes: 128 * 1024 }, notifications: { optional: true } },
  responsive: { minWidth: 180, preferredWidth: 360, compactBelow: 250 },
  migrate(widget) {
    widget.config = { ...this.defaultConfig, ...(widget.config || {}) };
    widget.data = {};
    return widget;
  },
  onSettingsCommit() { /* Presets apply only on the next explicit Start. */ },
  cleanup(widget) {
    for (const [key, stop] of _focusServiceViews) if (key.startsWith(widget.id + ':')) { stop(); _focusServiceViews.delete(key); }
    // Legacy runtime remains a recoverable migration source; removing a view never stops the shared timer.
    WidgetSDK.cache.remove('focusSession', widget.id, 'view');
  },
  render(widget, element, context) { _focusRenderWidget(widget, element, context); },
  renderSettings(widget, container) {
    const config = _focusNormalizedConfig(widget);
    const options = _focusLaunchOptions();
    container.innerHTML = `
      <div class="settings-row"><span>Preset</span><select class="settings-select focus-settings-preset" data-cfg="preset">
        ${Object.entries(FOCUS_SESSION_PRESETS).map(([key, preset]) => `<option value="${key}" ${config.preset === key ? 'selected' : ''}>${preset.label}</option>`).join('')}
      </select></div>
      <div class="settings-row"><span>Focus minutes</span><input class="settings-text-input" type="number" min="1" max="240" step="1" data-cfg="workMinutes" value="${config.workMinutes}" /></div>
      <div class="settings-row"><span>Short-break minutes</span><input class="settings-text-input" type="number" min="1" max="240" step="1" data-cfg="breakMinutes" value="${config.breakMinutes}" /></div>
      <div class="settings-row"><span>Long-break minutes</span><input class="settings-text-input" type="number" min="1" max="240" step="1" data-cfg="longBreakMinutes" value="${config.longBreakMinutes}" /></div>
      <div class="settings-row"><span>Long break after</span><select class="settings-select" data-cfg="longBreakEvery">
        ${[2, 3, 4, 5, 6, 8].map(count => `<option value="${count}" ${config.longBreakEvery === count ? 'selected' : ''}>${count} focus sessions</option>`).join('')}
      </select></div>
      <div class="settings-row"><span>Open when the session starts</span><select class="settings-select" data-cfg="launchTarget">
        ${options.map(option => `<option value="${_focusEscape(option.value)}" ${config.launchTarget === option.value ? 'selected' : ''}>${_focusEscape(option.label)}</option>`).join('')}
      </select></div>
      <div class="settings-row"><span>Start the next phase automatically</span><label class="settings-toggle"><input type="checkbox" data-cfg="autoStartNext" ${config.autoStartNext ? 'checked' : ''} /><span class="toggle-track"></span></label></div>
      <div class="settings-row"><span>Show today's totals</span><label class="settings-toggle"><input type="checkbox" data-cfg="showDailyTotals" ${config.showDailyTotals ? 'checked' : ''} /><span class="toggle-track"></span></label></div>
      <div class="settings-row"><span>Warn about upcoming Calendar conflicts</span><label class="settings-toggle"><input type="checkbox" data-cfg="warnCalendarConflicts" ${config.warnCalendarConflicts ? 'checked' : ''} /><span class="toggle-track"></span></label></div>
      <div class="settings-row"><span>Phase start/end notifications</span><label class="settings-toggle"><input type="checkbox" data-cfg="notifications" ${config.notifications ? 'checked' : ''} /><span class="toggle-track"></span></label></div>
`;

    const preset = container.querySelector('.focus-settings-preset');
    preset?.addEventListener('change', () => {
      const values = FOCUS_SESSION_PRESETS[preset.value];
      if (!values?.workMinutes) return;
      ['workMinutes', 'breakMinutes', 'longBreakMinutes', 'longBreakEvery'].forEach(key => {
        const input = container.querySelector(`[data-cfg="${key}"]`);
        if (input) {
          input.value = String(values[key]);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });
  }
};
