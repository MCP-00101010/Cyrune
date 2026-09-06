const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'Portal');
const SAMPLE_TLE = {
  header: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   21275.51834491  .00001490  00000-0  33281-4 0  9992',
  line2: '2 25544  51.6442 172.5583 0003572  65.8134  36.0590 15.48867829306491'
};

function loadIssWidgets(fetchImpl = async () => { throw new Error('Unexpected fetch'); }) {
  const storage = new Map();
  const context = vm.createContext({
    console,
    URL,
    Date,
    Intl,
    AbortController,
    DOMException,
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    saveState: () => { throw new Error('ISS tracking must not save shared Hub state'); }
  });
  for (const filename of ['vendor/satellite-js/satellite.min.js', '../Widgets/core/widget-network.js', '../Widgets/core/widgets.js', '../Widgets/core/widget-response.js', '../Widgets/core/widget-sdk.js', '../Widgets/space-astronomy/iss-tracker-widget.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, filename), 'utf8'), context, { filename });
  }
  vm.runInContext('WidgetSDK.registry.adoptBuiltins()', context);
  return { context, storage };
}

test('ISS Tracker is a column widget with local interaction defaults', () => {
  const { context } = loadIssWidgets();
  const definition = vm.runInContext(`(() => {
    const def = WIDGET_REGISTRY.issTracker;
    return { name: def.name, allowedIn: def.allowedIn, config: def.defaultConfig, hasReload: typeof def.reload === 'function' };
  })()`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(definition)), {
    name: 'ISS Tracker',
    allowedIn: ['column'],
    config: { mapStyle: 'dark', showNightShade: true },
    hasReload: true
  });
});

test('pinned Satellite.js propagates a known ISS TLE into plausible coordinates', () => {
  const { context } = loadIssWidgets();
  context.tle = SAMPLE_TLE;
  const position = vm.runInContext("_issPosition(_issSatrec(tle), new Date('2021-10-02T12:26:25Z'))", context);
  assert.ok(position.latitude >= -51.7 && position.latitude <= 51.7);
  assert.ok(position.longitude >= -180 && position.longitude <= 180);
  assert.ok(position.altitude > 350 && position.altitude < 500);
  assert.ok(position.speed > 7 && position.speed < 8.5);
});

test('orbital ground track splits safely at the antimeridian', () => {
  const { context } = loadIssWidgets();
  context.tle = SAMPLE_TLE;
  const track = vm.runInContext("_issGroundTrack(_issSatrec(tle), new Date('2021-10-02T12:26:25Z'))", context);
  assert.equal(track.type, 'FeatureCollection');
  assert.deepEqual(JSON.parse(JSON.stringify(track.features.map(feature => feature.properties.segment))), ['past', 'future']);
  for (const feature of track.features) {
    assert.equal(feature.geometry.type, 'MultiLineString');
    assert.ok(feature.geometry.coordinates.length > 0);
    for (const line of feature.geometry.coordinates) {
      for (let index = 1; index < line.length; index += 1) {
        assert.ok(Math.abs(line[index][0] - line[index - 1][0]) <= 180);
      }
    }
  }
});

test('solar calculation produces a local night mesh and a continuous terminator', () => {
  const { context } = loadIssWidgets();
  const result = vm.runInContext(`(() => {
    const date = new Date('2026-08-03T12:00:00Z');
    const sun = _subsolarPoint(date);
    return {
      sun,
      daylight: _issDayNightGeoJson(date)
    };
  })()`, context);
  assert.ok(result.sun.longitude > -5 && result.sun.longitude < 5);
  assert.ok(result.sun.latitude > 15 && result.sun.latitude < 25);
  assert.equal(result.daylight.night.type, 'FeatureCollection');
  assert.ok(result.daylight.night.features.length > 500);
  assert.ok(result.daylight.night.features.length < 4000);
  for (const feature of result.daylight.night.features) {
    assert.equal(feature.geometry.type, 'Polygon');
    const ring = feature.geometry.coordinates[0];
    assert.deepEqual(ring[0], ring[ring.length - 1]);
    assert.ok(ring.length >= 4 && ring.length <= 7);
    assert.ok(Math.max(...ring.map(point => point[0])) - Math.min(...ring.map(point => point[0])) <= 5);
    assert.ok(Math.max(...ring.map(point => point[1])) - Math.min(...ring.map(point => point[1])) <= 5.000001);
  }
  assert.equal(result.daylight.border.geometry.type, 'MultiLineString');
  for (const line of result.daylight.border.geometry.coordinates) {
    for (let index = 1; index < line.length; index += 1) {
      assert.ok(Math.abs(line[index][0] - line[index - 1][0]) <= 1);
    }
  }
});

test('equinox night mesh is split at the antimeridian into local cells', () => {
  const { context } = loadIssWidgets();
  const daylight = vm.runInContext("_subsolarPoint = () => ({ longitude: 170, latitude: 0 }); _issDayNightGeoJson(new Date(0))", context);
  assert.equal(daylight.night.type, 'FeatureCollection');
  assert.ok(daylight.night.features.length > 500);
  assert.ok(daylight.night.features.length < 4000);
  for (const feature of daylight.night.features) {
    const ring = feature.geometry.coordinates[0];
    assert.deepEqual(ring[0], ring[ring.length - 1]);
    assert.ok(Math.max(...ring.map(point => point[0])) - Math.min(...ring.map(point => point[0])) <= 5);
    assert.ok(Math.max(...ring.map(point => point[1])) - Math.min(...ring.map(point => point[1])) <= 5.000001);
  }
});

test('night mesh remains locally bounded across seasons and antimeridian sun positions', () => {
  const { context } = loadIssWidgets();
  const samples = [
    { longitude: 179.8, latitude: 23.44 },
    { longitude: -179.8, latitude: -23.44 },
    { longitude: 95, latitude: 0.5 },
    { longitude: -95, latitude: -0.5 }
  ];
  for (const sample of samples) {
    context.sampleSun = sample;
    const daylight = vm.runInContext('_subsolarPoint = () => sampleSun; _issDayNightGeoJson(new Date(0))', context);
    assert.ok(daylight.night.features.length > 1000);
    assert.ok(daylight.night.features.length < 1600);
    for (const feature of daylight.night.features) {
      const ring = feature.geometry.coordinates[0];
      assert.ok(ring.flat().every(Number.isFinite));
      assert.ok(Math.max(...ring.map(point => point[0])) - Math.min(...ring.map(point => point[0])) <= 5.000001);
      assert.ok(Math.max(...ring.map(point => point[1])) - Math.min(...ring.map(point => point[1])) <= 5.000001);
    }
  }
});

test('ISS orbital cache remains browser-local and honours its refresh age', () => {
  const { context, storage } = loadIssWidgets();
  context.tle = SAMPLE_TLE;
  vm.runInContext('_writeIssTleCache({ ...tle, fetchedAt: Date.now(), source: "test" })', context);
  assert.ok(storage.has('morpheus-widget-sdk-cache:v1:issTracker:shared:tle'));
  assert.equal(vm.runInContext('_isIssTleFresh(_readIssTleCache())', context), true);
  vm.runInContext('_issTleMemoryCache.fetchedAt = Date.now() - ISS_TLE_TTL_MS - 1', context);
  assert.equal(vm.runInContext('_isIssTleFresh(_readIssTleCache())', context), false);
});

test('Where The ISS At is preferred for TLE refresh', async () => {
  const requests = [];
  const { context } = loadIssWidgets(async url => {
    requests.push(String(url));
    return { ok: true, json: async () => SAMPLE_TLE };
  });
  const cache = await vm.runInContext('_fetchIssTle()', context);
  assert.equal(requests.length, 1);
  assert.match(requests[0], /api\.wheretheiss\.at\/v1\/satellites\/25544\/tles/);
  assert.equal(cache.source, 'Where The ISS At');
});

test('CelesTrak provides a fallback when the primary TLE source fails', async () => {
  const requests = [];
  const { context } = loadIssWidgets(async url => {
    requests.push(String(url));
    if (requests.length === 1) throw new Error('Primary unavailable');
    return {
      ok: true,
      text: async () => `${SAMPLE_TLE.header}\n${SAMPLE_TLE.line1}\n${SAMPLE_TLE.line2}\n`
    };
  });
  const cache = await vm.runInContext('_fetchIssTle()', context);
  assert.equal(requests.length, 2);
  assert.match(requests[1], /celestrak\.org\/NORAD\/elements\/gp\.php/);
  assert.equal(cache.source, 'CelesTrak');
});

test('ISS assets, globe interaction, cleanup, and responsive styling are wired locally', () => {
  const widgets = fs.readFileSync(path.join(__dirname, 'iss-tracker-widget.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, 'iss-tracker-widget.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /vendor\/satellite-js\/satellite\.min\.js/);
  assert.ok(fs.existsSync(path.join(root, 'vendor/satellite-js/LICENSE.md')));
  assert.match(widgets, /map\.setProjection\?\.\(\{ type: 'globe' \}\)/);
  assert.match(widgets, /scrollZoom:\s*\{\s*around:\s*'center'\s*\}/);
  assert.match(widgets, /sourceIds\.night/);
  assert.match(widgets, /sourceIds\.terminator/);
  assert.match(widgets, /type: 'fill',[\s\S]*?source: sourceIds\.night/);
  assert.match(widgets, /'fill-antialias': false/);
  assert.match(widgets, /type: 'line',[\s\S]*?source: sourceIds\.terminator/);
  assert.doesNotMatch(widgets, /widget-iss-night-overlay/);
  assert.match(widgets, /widget-iss-map-shell widget-interactive-surface/);
  assert.match(widgets, /_destroyAllIssTrackers\(\)/);
  assert.match(styles, /\.widget-iss-map-shell\s*\{[^}]*height:\s*clamp\(/s);
  assert.match(styles, /\.widget-iss-facts\s*\{[^}]*grid-template-columns:\s*repeat\(4/s);
});

test('globe projection waits until the MapLibre style has loaded', () => {
  const issSource = fs.readFileSync(path.join(__dirname, 'iss-tracker-widget.js'), 'utf8');
  const construction = issSource.slice(issSource.indexOf('map = new maplibregl.Map(mapOptions)'), issSource.indexOf("map.on('load'"));
  const loadedSetup = issSource.slice(issSource.indexOf("map.on('load'"), issSource.indexOf("map.on('moveend'"));
  assert.doesNotMatch(construction, /setProjection/);
  assert.match(loadedSetup, /map\.setProjection\?\.\(\{ type: 'globe' \}\)/);
  assert.match(loadedSetup, /map\.addSource\(sourceIds\.night/);
  assert.match(loadedSetup, /map\.addSource\(sourceIds\.terminator/);
  assert.match(loadedSetup, /map\.addSource\(sourceIds\.track/);
  assert.match(loadedSetup, /globeGeoJsonOptions\s*=\s*\{[^}]*buffer:\s*0,[^}]*tolerance:\s*0,[^}]*maxzoom:\s*24/s);
  assert.match(loadedSetup, /catch \(error\)[\s\S]*?Unable to finish initialising the ISS globe/);
});

test('Focus ISS state is browser-local and recentres live updates except during an active drag', () => {
  const { context } = loadIssWidgets();
  context.map = {
    getCenter: () => ({ lng: 10, lat: 20 }),
    getZoom: () => 2,
    getBearing: () => 0,
    getPitch: () => 0
  };
  const view = vm.runInContext("_writeIssView('iss-focus', map, { focusOnIss: true }); _readIssView('iss-focus')", context);
  assert.equal(view.focusOnIss, true);

  const widgets = fs.readFileSync(path.join(__dirname, 'iss-tracker-widget.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, 'iss-tracker-widget.css'), 'utf8');
  assert.match(widgets, /focusButton\.className = 'widget-iss-focus-button'/);
  assert.match(widgets, /instance\.focusOnIss && instance\.mapReady && !instance\.mapDragging[\s\S]*?instance\.map\.jumpTo\(\{ center:/);
  assert.match(widgets, /map\.on\('dragstart',[\s\S]*?instance\.mapDragging = true/);
  assert.match(widgets, /map\.on\('dragend',[\s\S]*?instance\.mapDragging = false/);
  assert.match(widgets, /focusButton\.setAttribute\('aria-pressed'/);
  assert.match(styles, /\.widget-iss-focus-button\s*\{[^}]*top:\s*10px;[^}]*left:\s*10px/s);
  assert.match(styles, /\.widget-iss-focus-button\.active/);
});

test('ISS map attribution state survives widget recreation and Hub reloads', () => {
  const { context } = loadIssWidgets();
  context.instance = {
    widgetId: 'iss-attribution',
    focusOnIss: false,
    map: {
      getCenter: () => ({ lng: 10, lat: 20 }),
      getZoom: () => 2,
      getBearing: () => 0,
      getPitch: () => 0,
      getContainer: () => ({
        querySelector: () => ({
          classList: { contains: className => className === 'maplibregl-compact-show' }
        })
      })
    }
  };
  assert.equal(vm.runInContext('_captureIssAttribution(instance)', context), true);
  assert.equal(vm.runInContext("_readIssView('iss-attribution').attributionExpanded", context), true);

  const widgets = fs.readFileSync(path.join(__dirname, 'iss-tracker-widget.js'), 'utf8');
  const issSource = widgets.slice(widgets.indexOf("WIDGET_REGISTRY['issTracker']"));
  assert.match(widgets, /_destroyIssTracker[\s\S]*?_captureIssAttribution\(instance\)/);
  assert.match(issSource, /_restoreIssAttribution\(instance\)/);
});

test('custom north control is clickable and resets every globe orientation axis', () => {
  const widgets = fs.readFileSync(path.join(__dirname, 'iss-tracker-widget.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, 'iss-tracker-widget.css'), 'utf8');
  const issSource = widgets.slice(widgets.indexOf("WIDGET_REGISTRY['issTracker']"));
  assert.match(issSource, /northButton\.className = 'widget-iss-north-button'/);
  assert.match(issSource, /dragRotate:\s*true/);
  assert.match(issSource, /NavigationControl\(\{ showCompass: false \}\)/);
  assert.match(issSource, /northButton\.addEventListener\('click',[\s\S]*?event\.preventDefault\(\)[\s\S]*?map\.easeTo\(\{ bearing: 0, pitch: 0, roll: 0, duration: 450 \}\)/);
  const northStyle = styles.slice(styles.indexOf('.widget-iss-north-button {'), styles.indexOf('.widget-iss-north-button:hover'));
  assert.match(northStyle, /pointer-events:\s*auto/);
  assert.match(northStyle, /cursor:\s*pointer/);
});

test('map widgets expose one shared persistent light and dark basemap control below zoom', () => {
  const { context } = loadIssWidgets();
  assert.equal(vm.runInContext("_nextWidgetMapStyle('dark')", context), 'liberty');
  assert.equal(vm.runInContext("_nextWidgetMapStyle('liberty')", context), 'dark');
  const interaction = vm.runInContext(`(() => {
    let undoCount = 0;
    let saveCount = 0;
    let refreshCount = 0;
    document = {
      createElement(tagName) {
        return {
          tagName,
          dataset: {},
          children: [],
          listeners: {},
          setAttribute(name, value) { this[name] = value; },
          addEventListener(name, listener) { this.listeners[name] = listener; },
          appendChild(child) { this.children.push(child); },
          remove() { this.removed = true; }
        };
      }
    };
    pushUndoSnapshot = () => { undoCount += 1; };
    saveState = () => { saveCount += 1; };
    refreshRenderedWidget = (candidate, candidateContext) => {
      refreshCount += candidate.id === 'map-theme' && candidateContext === 'column' ? 1 : 100;
      return true;
    };
    const widget = { id: 'map-theme', widgetType: 'issTracker', config: { mapStyle: 'dark' } };
    const control = _createWidgetMapStyleControl(widget, 'column', _normalizeIssMapStyle);
    const container = control.onAdd();
    const button = container.children[0];
    const initialLabel = button['aria-label'];
    button.listeners.click({ preventDefault() {}, stopPropagation() {} });
    control.onRemove();
    return { style: widget.config.mapStyle, undoCount, saveCount, refreshCount, initialLabel, removed: container.removed };
  })()`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(interaction)), {
    style: 'liberty',
    undoCount: 1,
    saveCount: 1,
    refreshCount: 1,
    initialLabel: 'Switch to light basemap',
    removed: true
  });

  const framework = fs.readFileSync(path.join(root, '..', 'Widgets', 'core', 'widgets.js'), 'utf8');
  assert.match(framework, /className = 'widget-map-style-toggle'/);
  assert.match(framework, /pushUndoSnapshot\(\)[\s\S]*?widget\.config\.mapStyle = _nextWidgetMapStyle[\s\S]*?saveState\(\)[\s\S]*?refreshRenderedWidget\(widget, context\)/);
  assert.match(framework, /Switch to \$\{nextLabel\} basemap/);

  for (const relative of [
    ['space-astronomy', 'iss-tracker-widget.js'],
    ['weather-hazards', 'weather-map-widget.js'],
    ['weather-hazards', 'global-hazards-widget.js']
  ]) {
    const source = fs.readFileSync(path.join(root, '..', 'Widgets', ...relative), 'utf8');
    const navigation = source.indexOf('new maplibregl.NavigationControl({ showCompass: false })');
    const theme = source.indexOf('_createWidgetMapStyleControl(', navigation);
    assert.ok(navigation >= 0, `${relative[1]} has zoom controls`);
    assert.ok(theme > navigation, `${relative[1]} places its basemap control after zoom`);
  }
});
