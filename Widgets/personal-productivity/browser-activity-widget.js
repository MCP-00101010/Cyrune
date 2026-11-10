// Browser activity is Relay-owned; only view choices are cached. Offline reports stay in memory.
const _browserActivityViews = new Map();
const _browserActivitySettingsDrafts = new WeakMap();

function _browserActivityDateRange(days, timestamp = Date.now()) {
  const today = new Date(timestamp), start = new Date(today);
  start.setDate(start.getDate() - days + 1);
  const date = value => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  return { from: date(start), to: date(today) };
}

function _browserActivityPie(rows, totalMs, escape, minutes) {
  const colors = ['#818cf8','#34d399','#fbbf24','#f472b6','#38bdf8','#c084fc','#fb923c','#a3e635','#2dd4bf','#94a3b8'];
  const total = Math.max(0, Number(totalMs) || 0);
  if (!total) return '<p>No recorded browsing in this period.</p>';
  const positive = rows.filter(row => row.milliseconds > 0).sort((a,b)=>b.milliseconds-a.milliseconds);
  const needsOther = positive.length > 10 || positive.reduce((sum, row) => sum + row.milliseconds, 0) < total;
  const slices = positive.slice(0, needsOther ? 9 : 10).map(row => ({ ...row }));
  const remainder = Math.max(0, total - slices.reduce((sum, row) => sum + row.milliseconds, 0));
  if (remainder) slices.push({ name: 'Others', milliseconds: remainder });
  const percentage = row => `${(row.milliseconds / total * 100).toFixed(1)}%`;
  let angle = 0;
  const stops = slices.map((row, index) => {
    const start = angle;
    angle = Math.min(360, angle + row.milliseconds / total * 360);
    return `${colors[index]} ${start}deg ${angle}deg`;
  });
  return `<div class="activity-pie" role="img" aria-label="${escape(slices.map(row => `${row.name}: ${minutes(row.milliseconds)} (${percentage(row)})`).join('; '))}" style="background:conic-gradient(${stops.join(',')})"></div>
    <div class="activity-ranking activity-chart-legend" tabindex="0">${slices.map((row, index) => `<div class="activity-row"><span title="${escape(row.name)}"><i style="background:${colors[index]}" aria-hidden="true"></i>${escape(row.name)}</span><strong>${minutes(row.milliseconds)} <small>(${percentage(row)})</small></strong></div>`).join('')}</div>`;
}

function _browserActivityRender(widget, element, context = 'column') {
  const key = widget.id + ':' + context;
  _browserActivityViews.get(key)?.();
  let state, report, busy = false, disposed = false, offlineState = false;
  const saved = WidgetSDK.cache.get('browserActivity', widget.id, 'view') || {};
  const view = { range: [1,7,30,365].includes(Number(saved.range)) ? Number(saved.range) : 7,
    tab: ['sites','categories','focus'].includes(saved.tab) ? saved.tab : 'sites',
    hostname: String(saved.hostname || '').slice(0,253),
    scrolls: Object.fromEntries(['phases','sessions','days','sitesPie','categoriesPie'].map(key=>[key,Math.max(0,Math.min(1000000,Number(saved.scrolls?.[key])||0))])) };
  let availableSites = [], reportScope;
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const minutes = ms => `${(ms / 60000).toFixed(1)} min`;
  const request = (action, args = {}) => WidgetSDK.productivity.request('browserActivity', 'activity', action, args);
  function range() { return _browserActivityDateRange(view.range); }
  function remember() { WidgetSDK.cache.set('browserActivity', widget.id, 'view', view); }
  function retainScroll() {
    element.querySelectorAll('[data-activity-scroll]').forEach(list => { view.scrolls[list.dataset.activityScroll] = list.scrollTop; });
  }
  function disableControls(disabled) { element.querySelectorAll('button,input,select').forEach(control => { control.disabled = disabled; }); }
  async function perform(task) {
    if (busy) return;
    busy = true;
    disableControls(true);
    try { await task(); await refresh(true); } catch (error) {
      element.querySelector('[data-activity-message]').textContent = error.message;
      const toggle = element.querySelector('[data-activity-toggle]');
      if (toggle) toggle.checked = !!state?.activity.enabled && !state.activity.paused;
    } finally { busy = false; if (!offlineState) disableControls(false); }
  }
  function paint(offline = false) {
    offlineState = offline;
    const settings = state?.activity;
    retainScroll();
    const focused = document.activeElement;
    const focusSelector = element.contains(focused) ? (focused.dataset.activityTab ? `[data-activity-tab="${focused.dataset.activityTab}"]`
      : ['toggle','range','host'].map(name => `[data-activity-${name}]`).find(selector => focused.matches(selector))) : null;
    const sessionLabel = sessionId => {
      if (sessionId === 'outside') return 'Outside Focus';
      const phase = state.focus.history.find(row => row.id === sessionId);
      if (phase) return `${phase.phase === 'work' ? 'Focus' : 'Break'} · ${new Date(phase.endedAt).toLocaleString()}`;
      if (sessionId === state.focus.sessionId) return `${state.focus.phase === 'work' ? 'Focus' : 'Break'} · current phase`;
      return 'Earlier phase';
    };
    element.classList.add('browser-activity-widget');
    element.classList.toggle('browser-activity-sidebar', context === 'navpane');
    const ranking = (rows, key = view.tab) => `<div class="activity-ranking" tabindex="0" data-activity-scroll="${key}">${rows.slice(0,10).map(row=>`<div class="activity-row"><span title="${esc(row.name)}">${esc(row.name)}</span><strong>${minutes(row.milliseconds)}</strong></div>`).join('') || '<p>No recorded browsing in this period.</p>'}</div>`;
    const rows = view.tab === 'categories' ? report.categories : report.sites;
    const panelId = `activity-panel-${widget.id}-${context}`;
    element.innerHTML = `<div class="activity-toolbar"><label class="activity-tracking">Tracking <span class="settings-toggle"><input type="checkbox" role="switch" data-activity-toggle aria-label="Activity tracking" ${settings?.enabled&&!settings.paused?'checked':''}><span class="toggle-track"></span></span></label><span class="activity-total">${minutes(report.totalMs)}</span></div>
      <div class="activity-filters"><select data-activity-range aria-label="Report range">${[[1,'Today'],[7,'7 days'],[30,'30 days'],[365,'Year']].map(([value,label])=>`<option value="${value}" ${Number(view.range)===value?'selected':''}>${label}</option>`).join('')}</select>
      <select data-activity-host aria-label="Filter reports by site"><option value="">All sites</option>${[...new Set([...availableSites,...(view.hostname?[view.hostname]:[])])].map(host=>`<option value="${esc(host)}" ${view.hostname===host?'selected':''}>${esc(host)}</option>`).join('')}</select></div>
      ${offline ? `<div class="activity-note">Offline · sampled ${esc(new Date(report.sampledAt).toLocaleString())}</div>` : ''}
      <div class="activity-tabs" role="tablist" aria-label="Activity reports">${[['sites','Sites'],['categories','Categories'],['focus','Work / Focus']].map(([tab,label])=>`<button type="button" role="tab" data-activity-tab="${tab}" id="${esc(panelId)}-${tab}" aria-controls="${esc(panelId)}" aria-selected="${view.tab===tab}" tabindex="${view.tab===tab?0:-1}">${label}</button>`).join('')}</div>
      <div data-activity-panel id="${esc(panelId)}" role="tabpanel" aria-labelledby="${esc(panelId)}-${view.tab}">
      ${view.tab==='focus' ? `<h4>Work / breaks</h4>${ranking(report.phases.map(row=>({...row,name:row.name==='work'?'Focus':row.name==='outside'?'Outside Focus':row.name==='longBreak'?'Long break':'Short break'})),'phases')}
        <h4>Focus sessions</h4>${ranking(report.sessions.map(row=>({...row,name:sessionLabel(row.name)})),'sessions')}
        <h4>Daily trend${report.days.length>10?' · latest 10':''}</h4><div class="activity-ranking" tabindex="0" data-activity-scroll="days">${report.days.slice(-10).map(row=>`<div class="activity-row"><span>${esc(row.name)}</span><meter min="0" max="${Math.max(1,...report.days.map(item=>item.milliseconds))}" value="${row.milliseconds}"></meter><strong>${minutes(row.milliseconds)}</strong></div>`).join('')}</div>`
        : `<div class="activity-chart-heading">${view.tab==='sites'?'Top sites':'Top categories'}</div>${_browserActivityPie(rows,report.totalMs,esc,minutes)}${view.tab==='categories'&&report.distractingMs?`<div class="activity-row"><span>Distracting</span><strong>${minutes(report.distractingMs)}</strong></div>`:''}`}
      </div>
      <div class="activity-controls"><button type="button" data-activity-export title="Export up to 1,000 detailed intervals for the selected range and site">Export</button><button type="button" data-activity-delete title="Delete activity for the selected range and site">Delete</button></div>
      <p data-activity-message role="status">${report.omittedSites ? `${report.omittedSites} additional sites omitted.` : ''}</p>`;
    const legend = element.querySelector('.activity-chart-legend');
    if (legend) legend.dataset.activityScroll = view.tab + 'Pie';
    element.querySelectorAll('[data-activity-scroll]').forEach(list => {
      list.scrollTop = view.scrolls[list.dataset.activityScroll] || 0;
      list.onscroll = () => { retainScroll(); remember(); };
    });
    element.querySelectorAll('[data-activity-tab]').forEach(button => {
      button.onclick = () => { retainScroll(); view.tab = button.dataset.activityTab; remember(); paint(offline); element.querySelector(`[data-activity-tab="${view.tab}"]`).focus(); };
      button.onkeydown = event => {
        const tabs = ['sites','categories','focus'], index = tabs.indexOf(view.tab);
        const next = event.key==='ArrowRight'?tabs[(index+1)%3]:event.key==='ArrowLeft'?tabs[(index+2)%3]:event.key==='Home'?'sites':event.key==='End'?'focus':null;
        if (next) { event.preventDefault(); element.querySelector(`[data-activity-tab="${next}"]`).click(); }
      };
    });
    if (focusSelector) element.querySelector(focusSelector)?.focus({preventScroll:true});
    element.querySelector('[data-activity-range]').onchange = event => { view.range = Number(event.target.value); remember(); void refresh(true); };
    element.querySelector('[data-activity-host]').onchange = event => { view.hostname = event.target.value.slice(0,253); remember(); void refresh(true); };
    if (offline) element.querySelectorAll('[data-activity-toggle],[data-activity-range],[data-activity-host],[data-activity-export],[data-activity-delete]').forEach(control => { control.disabled = true; });
    else if (busy) disableControls(true);
    if (offline) return;
    const host = () => view.hostname.trim().toLowerCase();
    element.querySelector('[data-activity-toggle]').onchange = event => { const enabled = event.target.checked; void perform(()=>request('settings', { enabled, paused:false })); };
    element.querySelector('[data-activity-delete]').onclick = () => perform(async()=>{
      if (!window.confirm('Delete recorded activity for this date range' + (host() ? ' on ' + host() : ' on all sites') + '?')) return;
      await request('delete',{ ...range(),...(host()?{hostname:host()}:{}) });
    });
    element.querySelector('[data-activity-export]').onclick = () => perform(async()=>{
      const result = await request('export',{ ...range(),detail:true,...(host()?{hostname:host()}:{}) });
      const url=URL.createObjectURL(new Blob([JSON.stringify(result.report,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='cyrune-browser-activity.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
  }
  let reading = false, queued = false;
  async function refresh(force = false) {
    if (disposed) return;
    if (reading) { queued = true; return; }
    // Preserve settings drafts while the user is editing them.
    if (!force && !busy && element.contains(document.activeElement) && document.activeElement.matches('input,select')) return;
    reading = true;
    const scope = { ...range(), ...(view.hostname ? {hostname:view.hostname} : {}) };
    try {
      state = await request('state');
      const all = (await request('report', {from:scope.from,to:scope.to})).report;
      availableSites = all.sites.map(row=>row.name);
      const selected = scope.hostname ? (await request('report',scope)).report : all;
      if (disposed) return;
      if (JSON.stringify(scope)!==JSON.stringify({...range(),...(view.hostname?{hostname:view.hostname}:{})})) { queued = true; return; }
      report = selected;
      reportScope = {range:view.range,hostname:view.hostname};
      paint();
    } catch (error) {
      if (disposed) return;
      if (report) { Object.assign(view,reportScope); paint(true); }
      else element.textContent='Browser Activity unavailable: '+error.message;
    } finally { reading=false; if(queued&&!disposed){queued=false;void refresh(true);} }
  }
  const unsubscribe=WidgetSDK.productivity.subscribe(()=>{void refresh();});
  WidgetSDK.runtime.schedule(key+':activity',()=>{void refresh();},15000);
  _browserActivityViews.set(key,()=>{disposed=true;unsubscribe();WidgetSDK.runtime.cancelSchedule(key+':activity');});
  element.textContent='Connecting to Relay activity…';void refresh();
}
WIDGET_REGISTRY['browserActivity'] = {
  id:'browserActivity',name:'Browser Activity',category:'Personal & Productivity',description:'Local active-site reports collected by Relay while Portal is closed.',
  allowedIn:['column','navpane'],defaultConfig:{},defaultData:{},settingsSchema:{type:'object',properties:{},additionalProperties:false},
  capabilities:{extensionRelay:{optional:true},timers:true,localCache:{quotaBytes:128*1024}},responsive:{minWidth:220,preferredWidth:420,compactBelow:300},
  render:_browserActivityRender,
  liveSettingsPreview:false,
  renderSettings(_widget, container) {
    container.innerHTML = `
      <label class="settings-row"><span>Idle cutoff</span><select class="settings-select" data-activity-setting="idleSeconds" disabled>${[60,120,300,600,1800].map(seconds=>`<option value="${seconds}">${seconds/60} min</option>`).join('')}</select></label>
      <label class="settings-row"><span>Detail retention</span><select class="settings-select" data-activity-setting="retentionDays" disabled>${[7,30,90].map(days=>`<option value="${days}">${days} days</option>`).join('')}</select></label>
      <label class="settings-row"><span>Distracting-site budget (min/day; 0 off)</span><input class="settings-text-input" type="number" min="0" max="1440" data-activity-setting="budgetMinutes" disabled></label>
      <p class="settings-help" data-activity-settings-status>Connecting to Relay…</p>`;
    const draft = { original:null };
    _browserActivitySettingsDrafts.set(container,draft);
    if (typeof WidgetSDK === 'undefined') return;
    void WidgetSDK.productivity.request('browserActivity','activity','state').then(state=>{
      if (_browserActivitySettingsDrafts.get(container)!==draft) return;
      draft.original = state.activity;
      for(const key of ['idleSeconds','retentionDays','budgetMinutes']) {
        const input=container.querySelector(`[data-activity-setting="${key}"]`);input.value=String(state.activity[key]);input.disabled=false;
      }
      container.querySelector('[data-activity-settings-status]').textContent='Changes apply when you choose Done. Cancel keeps the current profile preferences.';
    }).catch(()=>{if(_browserActivitySettingsDrafts.get(container)===draft)container.querySelector('[data-activity-settings-status]').textContent='Relay unavailable. Global preferences cannot be edited; you can still add or rename this widget.';});
  },
  async beforeSettingsCommit(_widget,container) {
    const draft=_browserActivitySettingsDrafts.get(container);
    if (!draft?.original || typeof WidgetSDK === 'undefined') return true;
    const changes={};
    for(const key of ['idleSeconds','retentionDays','budgetMinutes']) {
      const value=Number(container.querySelector(`[data-activity-setting="${key}"]`).value);
      if(value!==draft.original[key])changes[key]=value;
    }
    if(Object.keys(changes).length)await WidgetSDK.productivity.request('browserActivity','activity','settings',changes);
    return true;
  },
  cleanup(widget){for(const [key,stop] of _browserActivityViews)if(key.startsWith(widget.id+':')){stop();_browserActivityViews.delete(key);}WidgetSDK.cache.remove('browserActivity',widget.id,'view');WidgetSDK.cache.remove('browserActivity',widget.id,'report');}
};
