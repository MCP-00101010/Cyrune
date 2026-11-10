// Location lookup shared by weather, hazard and astronomy settings.

const _widgetLocationLabelRuntime = new Map();

function _widgetLocationDisplayName(widget, widgetType, config, fallback) {
  const label = String(config?.locationName || '').trim();
  const postcode = label.split(',')[0].replace(/\s/g, '').toUpperCase();
  if (!/^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(postcode)) return label || fallback;
  const key = `${postcode}:${config.latitude}:${config.longitude}`;
  const cached = WidgetSDK.cache.get(widgetType, widget.id, 'location-label');
  if (cached?.key === key && typeof cached.label === 'string') return cached.label;
  const owner = `${widgetType}:${widget.id}`;
  const previous = _widgetLocationLabelRuntime.get(owner);
  if (previous?.key === key && previous.retryAt > Date.now()) return fallback;
  previous?.controller.abort();
  const record = { key, controller: new AbortController(), retryAt: Infinity };
  _widgetLocationLabelRuntime.set(owner, record);
  _searchOpenMeteoLocations(postcode, record.controller.signal, widgetType).then(locations => {
    if (_widgetLocationLabelRuntime.get(owner) !== record) return;
    record.retryAt = Date.now() + 5 * 60 * 1000;
    if (!locations.length) return;
    const resolved = _openMeteoLocationLabel(locations[0]).slice(0, 200);
    WidgetSDK.cache.set(widgetType, widget.id, 'location-label', { key, label: resolved }, { ttlMs: 30 * 86400000 });
    _refreshWidget(widget.id, 'column');
    _refreshWidget(widget.id, 'navpane');
  }).catch(() => {
    if (_widgetLocationLabelRuntime.get(owner) === record) record.retryAt = Date.now() + 5 * 60 * 1000;
  });
  return fallback;
}

function _clearWidgetLocationLabel(widget, widgetType) {
  const owner = `${widgetType}:${widget.id}`;
  _widgetLocationLabelRuntime.get(owner)?.controller.abort();
  _widgetLocationLabelRuntime.delete(owner);
  WidgetSDK.cache.remove(widgetType, widget.id, 'location-label');
}

async function _searchOpenMeteoLocations(query, signal, widgetType = 'weather') {
  const postcode = String(query).replace(/\s/g, '').toUpperCase();
  if (/^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(postcode)) {
    const response = await _fetchWithTimeout(`https://api.postcodes.io/postcodes/${postcode}`, {
      signal, widgetType, maxResponseBytes: 64 * 1024
    });
    if (response.status === 404) return [];
    const payload = await response.json();
    if (!response.ok || payload?.status !== 200) throw new Error('Postcode lookup is unavailable. Try again or search by city.');
    const result = payload.result;
    const latitude = result?.latitude;
    const longitude = result?.longitude;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return [];
    return [{ name: result.bua || result.admin_district || result.region || result.country || 'Selected location',
      latitude, longitude, timezone: 'Europe/London',
      admin1: result.region || result.admin_county || '', country: result.country || 'United Kingdom', country_code: 'GB' }];
  }
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '6');
  url.searchParams.set('language', (navigator.language || 'en').split('-')[0]);
  url.searchParams.set('format', 'json');
  const response = await _fetchWithTimeout(url, { signal, widgetType, maxResponseBytes: 64 * 1024 });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.reason || `Location search returned ${response.status}`);
  return Array.isArray(payload?.results) ? payload.results : [];
}

function _openMeteoLocationLabel(location) {
  return [...new Set([location?.name, location?.admin1, location?.country].filter(Boolean))].join(', ');
}

function _bindOpenMeteoLocationSearch(options = {}) {
  const { input, button, results, signal, onSelect, disabledAfter, widgetType = 'weather' } = options;
  let generation = 0;
  const showMessage = (message, isError = false) => {
    results.innerHTML = '';
    const row = document.createElement('div');
    row.className = `weather-location-message${isError ? ' is-error' : ''}`;
    row.textContent = message;
    results.appendChild(row);
  };
  const run = async () => {
    const query = input.value.trim();
    if (query.length < 2) return showMessage('Enter at least two characters.', true);
    const requestGeneration = ++generation;
    button.disabled = true;
    showMessage('Searching...');
    try {
      const locations = await _searchOpenMeteoLocations(query, signal, widgetType);
      if (requestGeneration !== generation) return;
      results.innerHTML = '';
      if (!locations.length) return showMessage('No matching locations found.');
      locations.forEach(location => {
        const resultButton = document.createElement('button');
        resultButton.type = 'button';
        resultButton.className = 'weather-location-result';
        resultButton.textContent = _openMeteoLocationLabel(location);
        resultButton.addEventListener('click', () => {
          onSelect?.(location, resultButton.textContent);
          results.innerHTML = '';
        });
        results.appendChild(resultButton);
      });
    } catch (error) {
      if (requestGeneration === generation && error?.name !== 'AbortError') {
        showMessage(error?.message || 'Location search failed.', true);
      }
    } finally {
      if (requestGeneration === generation) button.disabled = disabledAfter?.() === true;
    }
  };
  button.addEventListener('click', run);
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void run();
  });
  signal?.addEventListener('abort', () => { generation += 1; }, { once: true });
  return run;
}
