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
  if (typeof state !== 'undefined') visit(state.boards || []);
  return found;
}

function _dailyBriefingDate(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function _dailyBriefingWindow(widget, now = Date.now()) {
  const days = Math.max(1, Math.min(14, Number.parseInt(widget.config?.horizonDays, 10) || 1));
  return { now, end: now + days * 24 * 60 * 60 * 1000, days };
}

function _dailyBriefingRows(widget, now = Date.now()) {
  const window = _dailyBriefingWindow(widget, now);
  const widgets = _dailyBriefingAllWidgets().filter(source => source.id !== widget.id);
  const enabled = key => widget.config?.[key] !== false;
  const sections = [];
  const add = (title, rows, empty) => sections.push({ title, rows: rows.slice(0, 8), empty });

  if (enabled('showTasks')) {
    const tasks = widgets.filter(source => source.widgetType === 'todo')
      .flatMap(source => Array.isArray(source.data?.items) ? source.data.items : [])
      .filter(item => !item?.done && String(item?.text || '').trim())
      .map(item => ({ primary: String(item.text).trim(), secondary: 'Open task' }));
    add('Tasks', tasks, 'No open tasks found.');
  }

  if (enabled('showCalendar')) {
    const events = [];
    widgets.filter(source => source.widgetType === 'protonCalendar').forEach(source => {
      const runtime = typeof _calendarRuntime !== 'undefined' ? _calendarRuntime.get(source.id) : null;
      (runtime?.events || []).filter(event => Number(event.start) >= window.now && Number(event.start) <= window.end)
        .forEach(event => events.push({ primary: String(event.title || 'Calendar event'), secondary: _dailyBriefingDate(event.start), order: Number(event.start) }));
    });
    add('Calendar', events.sort((left, right) => left.order - right.order), 'No loaded events in this window.');
  }

  if (enabled('showWeather')) {
    const rows = [];
    widgets.filter(source => source.widgetType === 'weather').forEach(source => {
      const cache = typeof _readWeatherCache === 'function' ? _readWeatherCache(source) : null;
      const current = cache?.payload?.current;
      const units = cache?.payload?.current_units || {};
      if (current) rows.push({
        primary: `${source.config?.locationName || source.title || 'Weather'}: ${current.temperature_2m ?? '—'}${units.temperature_2m || ''}`,
        secondary: typeof _weatherCodeDetails === 'function' ? _weatherCodeDetails(current.weather_code, current.is_day === 1).label : 'Current conditions'
      });
    });
    add('Weather', rows, 'No loaded weather forecast.');
  }

  if (enabled('showHazards')) {
    const hazards = [];
    widgets.filter(source => source.widgetType === 'globalHazards').forEach(source => {
      const cache = typeof _globalHazardReadCache === 'function' ? _globalHazardReadCache(source) : null;
      (cache?.events || []).filter(event => Number(event.timestamp || event.updatedAt) >= window.now - 24 * 60 * 60 * 1000)
        .forEach(event => hazards.push({ primary: String(event.title || 'Hazard'), secondary: `${event.severity || 'info'} · ${_dailyBriefingDate(event.timestamp || event.updatedAt)}`, order: Number(event.timestamp || event.updatedAt) }));
    });
    add('Hazards', hazards.sort((left, right) => right.order - left.order), 'No recent loaded hazards.');
  }

  if (enabled('showFootball')) {
    const matches = [];
    widgets.filter(source => source.widgetType === 'footballTracker').forEach(source => {
      const runtime = typeof _footballTrackerRuntime !== 'undefined' ? _footballTrackerRuntime.get(source.id) : null;
      const cached = runtime?.data?.matches || (typeof _footballTrackerCached === 'function' ? _footballTrackerCached(source, 'matches') : []);
      (Array.isArray(cached) ? cached : []).filter(match => Number(match.utcDate) >= window.now && Number(match.utcDate) <= window.end)
        .forEach(match => matches.push({ primary: `${match.home?.name || match.home || 'Home'} v ${match.away?.name || match.away || 'Away'}`, secondary: _dailyBriefingDate(match.utcDate), order: Number(match.utcDate) }));
    });
    add('Football', matches.sort((left, right) => left.order - right.order), 'No loaded fixtures in this window.');
  }

  if (enabled('showMedia')) {
    const media = widgets.filter(source => source.widgetType === 'mediaWatchlist')
      .flatMap(source => Array.isArray(source.data?.records) ? source.data.records : [])
      .filter(record => !record?.watched)
      .map(record => ({ primary: String(record.title || 'Untitled'), secondary: record.date ? `Release ${record.date}` : 'On watchlist' }));
    add('Watchlist', media, 'No unwatched titles found.');
  }

  if (enabled('showRss')) {
    const articles = [];
    widgets.filter(source => source.widgetType === 'rssReader').forEach(source => {
      const cache = typeof _readRssCache === 'function' ? _readRssCache(source.id) : null;
      Object.values(cache?.feeds || {}).forEach(feed => {
        (feed?.items || []).filter(item => Number(item.timestamp) >= window.now - 24 * 60 * 60 * 1000)
          .forEach(item => articles.push({ primary: String(item.title || 'Untitled article'), secondary: `${feed.title || 'RSS'} · ${_dailyBriefingDate(item.timestamp)}`, order: Number(item.timestamp) }));
      });
    });
    add('RSS', articles.sort((left, right) => right.order - left.order), 'No recently loaded RSS articles.');
  }

  if (enabled('showServices')) {
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
        const primary = document.createElement('span');
        primary.textContent = row.primary;
        const secondary = document.createElement('small');
        secondary.textContent = row.secondary;
        item.append(primary, secondary);
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
    showHazards: true, showFootball: true, showMedia: true, showRss: true, showServices: true
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
      ['showServices', 'Service warnings']
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
