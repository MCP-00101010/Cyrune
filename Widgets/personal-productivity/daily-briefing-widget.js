// Read-only roll-up of portable widget state and already-fetched local caches.
// The briefing never performs network requests or copies source data into its own state.

function _dailyBriefingAllWidgets() {
  const found = [];
  const seen = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (value.type === 'widget' && typeof value.widgetType === 'string') found.push(value);
    Object.values(value).forEach(visit);
  };
  if (typeof state !== 'undefined') {
    visit(state.boards || []);
    visit(state.navItems || []);
  }
  return found;
}

function _dailyBriefingRefreshAll() {
  if (typeof _refreshWidget !== 'function') return;
  _dailyBriefingAllWidgets().filter(widget => widget.widgetType === 'dailyBriefing').forEach(widget => {
    _refreshWidget(widget.id, 'column');
    _refreshWidget(widget.id, 'navpane');
  });
}

function _dailyBriefingDate(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function _dailyBriefingDateOnly(value, endOfDay = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return NaN;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date.getTime() : NaN;
}

function _dailyBriefingHttpUrl(value) {
  try { const url = new URL(String(value || '')); return /^https?:$/.test(url.protocol) ? url.href : ''; }
  catch { return ''; }
}

function _dailyBriefingImageUrl(value) {
  const url = _dailyBriefingHttpUrl(value);
  return url.startsWith('https://') ? url : '';
}

function _dailyBriefingTeamName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(?:afc|cf|fc|football|club)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function _dailyBriefingFavouriteTeams(source) {
  const values = Array.isArray(source.config?.favouriteTeams) ? source.config.favouriteTeams : [];
  const result = values.map(value => value && typeof value === 'object' ? value : { name: value }).filter(value => String(value?.name || '').trim());
  const legacy = String(source.config?.favouriteTeam || '').trim();
  if (legacy && !result.some(value => _dailyBriefingTeamName(value.name) === _dailyBriefingTeamName(legacy))) result.push({ id: 0, name: legacy });
  return result;
}

function _dailyBriefingFavouriteTeam(source, team) {
  const id = Math.max(0, Number(team?.id) || 0); const name = _dailyBriefingTeamName(team?.name || team); const provider = String(team?.provider || '');
  return _dailyBriefingFavouriteTeams(source).some(favourite => {
    const favouriteId = Math.max(0, Number(favourite.id) || 0); const favouriteProvider = String(favourite.provider || '');
    const providerIdMatch = id && favouriteId && id === favouriteId && (!provider || !favouriteProvider || provider === favouriteProvider);
    return providerIdMatch || (!!name && name === _dailyBriefingTeamName(favourite.name));
  });
}

function _dailyBriefingWeatherRows(source, window) {
  const cache = typeof _readWeatherCache === 'function' ? _readWeatherCache(source) : null; const payload = cache?.payload;
  if (!payload) return [];
  const conditionsFor = (code, isDay = true) => typeof _weatherCodeDetails === 'function' ? _weatherCodeDetails(code, isDay) : { symbol: '', label: 'Weather' };
  const format = (value, unit) => value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${Math.round(Number(value) * 10) / 10}${unit || ''}`;
  const daily = payload.daily || {}; const dailyUnits = payload.daily_units || {}; const rows = [];
  if (window.days === 1) {
    const current = payload.current || {}; const units = payload.current_units || {}; const conditions = conditionsFor(current.weather_code, Number(current.is_day) !== 0);
    if (current.temperature_2m !== undefined || current.weather_code !== undefined) {
      const details = [];
      if (current.apparent_temperature !== undefined) details.push(`Feels ${format(current.apparent_temperature, units.apparent_temperature || units.temperature_2m || '')}`);
      if (daily.temperature_2m_max?.[0] !== undefined || daily.temperature_2m_min?.[0] !== undefined) details.push(`High ${format(daily.temperature_2m_max?.[0], dailyUnits.temperature_2m_max || units.temperature_2m || '')} / Low ${format(daily.temperature_2m_min?.[0], dailyUnits.temperature_2m_min || units.temperature_2m || '')}`);
      if (daily.precipitation_probability_max?.[0] !== undefined) details.push(`Rain ${format(daily.precipitation_probability_max[0], dailyUnits.precipitation_probability_max || '%')}`);
      rows.push({ primary: `${conditions.symbol ? `${conditions.symbol} ` : ''}${format(current.temperature_2m, units.temperature_2m || '')} · ${conditions.label}`, secondary: details.join(' · ') || 'Current conditions' });
    }
    return rows;
  }
  (Array.isArray(daily.time) ? daily.time : []).forEach((date, index) => {
    const start = _dailyBriefingDateOnly(date); const end = _dailyBriefingDateOnly(date, true);
    if (!Number.isFinite(start) || end < window.start || start > window.end) return;
    const conditions = conditionsFor(daily.weather_code?.[index], true); const dateValue = new Date(start);
    const day = start === window.start ? 'Today' : dateValue.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
    const high = format(daily.temperature_2m_max?.[index], dailyUnits.temperature_2m_max || '°C'); const low = format(daily.temperature_2m_min?.[index], dailyUnits.temperature_2m_min || '°C');
    const rain = daily.precipitation_probability_max?.[index];
    rows.push({ primary: `${day}: ${conditions.symbol ? `${conditions.symbol} ` : ''}${conditions.label}`, secondary: `${high} / ${low}${rain === undefined ? '' : ` · Rain ${format(rain, dailyUnits.precipitation_probability_max || '%')}`}`, order: start });
  });
  return rows;
}

function _dailyBriefingWindow(widget, now = Date.now()) {
  const days = Math.max(1, Math.min(14, Number.parseInt(widget.config?.horizonDays, 10) || 1));
  const current = new Date(now); const start = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const end = new Date(current.getFullYear(), current.getMonth(), current.getDate() + days).getTime() - 1;
  return { now, start, end, days };
}

function _dailyBriefingRows(widget, now = Date.now()) {
  const window = _dailyBriefingWindow(widget, now);
  const widgets = _dailyBriefingAllWidgets().filter(source => source.id !== widget.id);
  const enabled = key => widget.config?.[key] !== false;
  const sections = [];
  const add = (title, rows, empty) => { if (rows.length || widget.config?.showEmptySections === true) sections.push({ title, rows: rows.slice(0, 8), empty }); };

  if (enabled('showTasks')) {
    const tasks = widgets.filter(source => source.widgetType === 'todo')
      .flatMap(source => Array.isArray(source.data?.items) ? source.data.items : [])
      .filter(item => !item?.done && String(item?.text || '').trim())
      .map(item => ({ item, due: _dailyBriefingDateOnly(item.dueDate || item.deadline, true) }))
      .filter(entry => Number.isFinite(entry.due) && entry.due <= window.end)
      .sort((left, right) => left.due - right.due)
      .map(entry => {
        const dueStart = _dailyBriefingDateOnly(entry.item.dueDate || entry.item.deadline); const date = new Date(dueStart);
        const secondary = entry.due < window.start ? `Overdue · ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
          : (dueStart === window.start ? 'Due today' : `Due ${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`);
        return { primary: String(entry.item.text).trim(), secondary, order: entry.due };
      });
    add('Tasks', tasks, 'No tasks are due in this window.');
  }

  if (enabled('showCalendar')) {
    const events = [];
    widgets.filter(source => source.widgetType === 'protonCalendar').forEach(source => {
      const runtime = typeof _calendarRuntime !== 'undefined' ? _calendarRuntime.get(source.id) : null;
      const loaded = Array.isArray(runtime?.events) ? runtime.events : [];
      const inWindow = typeof _calendarEventsInRange === 'function'
        ? _calendarEventsInRange(loaded, window.start, window.end + 1)
        : loaded.filter(event => Number(event.end) > window.start && Number(event.start) <= window.end);
      inWindow.forEach(event => {
        const sourceName = String(event.sourceName || '').trim();
        const eventStart = Math.max(Number(event.start), window.start);
        const timing = event.allDay
          ? `${new Date(eventStart).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · All day`
          : _dailyBriefingDate(eventStart);
        events.push({ primary: String(event.title || 'Calendar event'), secondary: sourceName ? `${timing} · ${sourceName}` : timing, order: eventStart });
      });
    });
    add('Calendar', events.sort((left, right) => left.order - right.order), 'No loaded events in this window.');
  }

  if (enabled('showWeather')) {
    const rows = widgets.filter(source => source.widgetType === 'weather').flatMap(source => _dailyBriefingWeatherRows(source, window));
    add('Weather', rows, 'No loaded weather forecast.');
  }

  if (enabled('showHazards')) {
    const hazards = [];
    widgets.filter(source => source.widgetType === 'globalHazards').forEach(source => {
      const cache = typeof _globalHazardReadCache === 'function' ? _globalHazardReadCache(source) : null;
      (cache?.events || []).filter(event => Number(event.timestamp || event.updatedAt) >= window.now - 24 * 60 * 60 * 1000)
        .forEach(event => hazards.push({ primary: String(event.title || 'Hazard'), secondary: `${event.severity || 'info'} · ${_dailyBriefingDate(event.timestamp || event.updatedAt)}`, order: Number(event.timestamp || event.updatedAt), action: { kind: 'hazard', url: _dailyBriefingHttpUrl(event.url) } }));
    });
    add('Hazards', hazards.sort((left, right) => right.order - left.order), 'No recent loaded hazards.');
  }

  if (enabled('showFootball')) {
    const matches = [];
    widgets.filter(source => source.widgetType === 'footballTracker').forEach(source => {
      const runtime = typeof _footballTrackerRuntime !== 'undefined' ? _footballTrackerRuntime.get(source.id) : null;
      const cached = runtime?.data?.matches || (typeof _footballTrackerCached === 'function' ? _footballTrackerCached(source, 'matches') : []);
      (Array.isArray(cached) ? cached : []).filter(match => Number(match.utcDate) >= window.now && Number(match.utcDate) <= window.end)
        .filter(match => _dailyBriefingFavouriteTeam(source, match.home) || _dailyBriefingFavouriteTeam(source, match.away))
        .forEach(match => matches.push({
          primary: `★ ${match.home?.name || match.home || 'Home'} v ${match.away?.name || match.away || 'Away'}`,
          secondary: _dailyBriefingDate(match.utcDate), order: Number(match.utcDate),
          crests: source.config?.showCrests === false ? [] : [match.home?.crest, match.away?.crest].map(_dailyBriefingImageUrl).filter(Boolean)
        }));
    });
    add('Football', matches.sort((left, right) => left.order - right.order), 'No loaded fixtures in this window.');
  }

  if (enabled('showMedia')) {
    const media = [];
    widgets.filter(source => source.widgetType === 'mediaWatchlist').forEach(source => {
      (Array.isArray(source.data?.records) ? source.data.records : []).filter(record => !record?.watched).forEach(record => {
        (Array.isArray(record.upcoming) ? record.upcoming : []).forEach(item => {
          const start = _dailyBriefingDateOnly(item.date); const end = _dailyBriefingDateOnly(item.date, true);
          if (Number.isFinite(start) && end >= window.start && start <= window.end) media.push({ primary: String(item.title || record.title || 'Upcoming release'), secondary: `${item.kind === 'episode' ? 'Episode' : 'Release'} · ${new Date(start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`, order: start });
        });
      });
    });
    add('Watchlist', media.sort((left, right) => left.order - right.order), 'No releases are due in this window.');
  }

  if (enabled('showRss')) {
    const articles = [];
    widgets.filter(source => source.widgetType === 'rssReader').forEach(source => {
      const cache = typeof _readRssCache === 'function' ? _readRssCache(source.id) : null;
      Object.values(cache?.feeds || {}).forEach(feed => {
        (feed?.items || []).filter(item => Number(item.timestamp) >= window.now - 24 * 60 * 60 * 1000)
          .forEach(item => articles.push({ primary: String(item.title || 'Untitled article'), secondary: `${feed.title || 'RSS'} · ${_dailyBriefingDate(item.timestamp)}`, order: Number(item.timestamp), action: { kind: 'rss', url: _dailyBriefingHttpUrl(item.link), widgetId: source.id, itemIds: [String(item.id || '')].filter(Boolean) } }));
      });
    });
    add('RSS', articles.sort((left, right) => right.order - left.order), 'No recently loaded RSS articles.');
  }

  if (enabled('showServices') && window.days === 1) {
    const warnings = [];
    widgets.filter(source => source.widgetType === 'serviceMonitor').forEach(source => {
      const history = typeof _serviceMonitorHistory === 'function' ? _serviceMonitorHistory(source) : {};
      (source.config?.endpoints || []).forEach(endpoint => {
        const latest = Array.isArray(history?.[endpoint.id]) ? history[endpoint.id].at(-1) : null;
        if (latest && latest.ok === false) warnings.push({ primary: endpoint.name || 'Service', secondary: latest.error || `HTTP ${latest.status || 'error'}` });
      });
    });
    add('Service warnings', warnings, 'No loaded service warnings.');
  }
  return { sections, window };
}

function _dailyBriefingActivate(action) {
  if (!action) return;
  if (action.kind === 'rss' && action.widgetId && typeof _readRssView === 'function' && typeof _writeRssView === 'function') {
    const view = _readRssView(action.widgetId); const read = new Set(view.readIds || []); (action.itemIds || []).forEach(id => read.add(id));
    _writeRssView(action.widgetId, { readIds: [...read] });
    if (typeof _refreshWidget === 'function') _refreshWidget(action.widgetId, 'column');
  }
}

function _dailyBriefingRender(widget, element) {
  const { sections, window } = _dailyBriefingRows(widget);
  element.className = 'widget-daily-briefing';
  const header = document.createElement('div');
  header.className = 'daily-briefing-header';
  const heading = document.createElement('strong');
  heading.textContent = window.days === 1 ? 'Today' : `Next ${window.days} days`;
  const stamp = document.createElement('span');
  stamp.textContent = `Updated ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  header.append(heading, stamp);
  element.appendChild(header);
  if (!sections.length) {
    const empty = document.createElement('p'); empty.className = 'daily-briefing-empty daily-briefing-empty-overall'; empty.textContent = 'Nothing is due or active in this window.'; element.appendChild(empty); return;
  }
  sections.forEach(section => {
    const block = document.createElement('section');
    block.className = 'daily-briefing-section';
    const title = document.createElement('h4');
    title.textContent = section.title;
    block.appendChild(title);
    if (!section.rows.length) {
      const empty = document.createElement('p');
      empty.className = 'daily-briefing-empty';
      empty.textContent = section.empty;
      block.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      section.rows.forEach(row => {
        const item = document.createElement('li');
        const content = document.createElement(row.action?.url ? 'a' : 'div'); content.className = 'daily-briefing-row-content';
        if (row.action?.url) { content.href = row.action.url; content.target = '_blank'; content.rel = 'noreferrer noopener'; content.addEventListener('click', () => _dailyBriefingActivate(row.action)); }
        const primary = document.createElement('div'); primary.className = 'daily-briefing-primary';
        if (row.crests?.length) {
          const crests = document.createElement('span'); crests.className = 'daily-briefing-football-crests'; crests.setAttribute('aria-hidden', 'true');
          row.crests.forEach(url => {
            const crest = document.createElement('img'); crest.src = url; crest.alt = ''; crest.loading = 'lazy'; crest.referrerPolicy = 'no-referrer';
            crest.addEventListener('error', () => crest.remove()); crests.appendChild(crest);
          });
          primary.appendChild(crests);
        }
        const primaryText = document.createElement('span'); primaryText.textContent = row.primary; primary.appendChild(primaryText);
        const secondary = document.createElement('small');
        secondary.textContent = row.secondary;
        content.append(primary, secondary); item.appendChild(content);
        list.appendChild(item);
      });
      block.appendChild(list);
    }
    element.appendChild(block);
  });
}

WIDGET_REGISTRY['dailyBriefing'] = {
  name: 'Daily Briefing',
  category: 'Personal & Productivity',
  description: 'A read-only summary of tasks, events, forecasts, fixtures, watchlists, and service warnings',
  allowedIn: ['column', 'navpane'],
  defaultConfig: {
    horizonDays: '1', showTasks: true, showCalendar: true, showWeather: true,
    showHazards: true, showFootball: true, showMedia: true, showRss: true, showServices: true,
    showEmptySections: false
  },
  defaultData: {},
  render(widget, element, context) {
    _dailyBriefingRender(widget, element);
    _setWidgetTimer(widget.id, context, () => {
      if (!element.isConnected) return;
      element.innerHTML = '';
      _dailyBriefingRender(widget, element);
    }, 60000);
  },
  renderSettings(widget, container) {
    const config = widget.config || {};
    const sources = [
      ['showTasks', 'Tasks'], ['showCalendar', 'Calendar'], ['showWeather', 'Weather'],
      ['showHazards', 'Hazards'], ['showFootball', 'Football'], ['showMedia', 'Media watchlist'], ['showRss', 'RSS'],
      ['showServices', 'Service warnings (Today only)'], ['showEmptySections', 'Show empty sections']
    ];
    container.innerHTML = `<label class="settings-row"><span>Briefing window</span><select data-cfg="horizonDays" class="settings-select"><option value="1">Today</option><option value="7">Next 7 days</option><option value="14">Next 14 days</option></select></label>`;
    container.querySelector('[data-cfg="horizonDays"]').value = String(config.horizonDays || '1');
    sources.forEach(([key, label]) => {
      const row = document.createElement('label');
      row.className = 'settings-row';
      const text = document.createElement('span');
      text.textContent = label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.cfg = key;
      input.checked = config[key] !== false;
      row.append(text, input);
      container.appendChild(row);
    });
  }
};
