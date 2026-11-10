const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function load(fetchImpl) {
  const context = vm.createContext({ URL, AbortController, navigator: { language: 'en-GB' }, _fetchWithTimeout: fetchImpl });
  const helper = path.join(__dirname, 'location-search.js');
  vm.runInContext(fs.readFileSync(helper, 'utf8'), context);
  return context;
}

test('UK postcode lookup keeps exact coordinates but displays the resolved locality', async () => {
  for (const query of ['SW1A 1AA', 'SW1A1AA', 'sw1a 1aa']) {
    const calls = [];
    const context = load(async (url, options) => {
      calls.push({ url: String(url), options });
      const postcode = new URL(url).hostname === 'api.postcodes.io';
      return { ok: true, json: async () => postcode
        ? { status: 200, result: { postcode: 'SW1A 1AA', latitude: 51.501, longitude: -0.1416, bua: 'City of Westminster', admin_district: 'Westminster', country: 'England' } }
        : { results: [] } };
    });
    context.query = query;
    const results = await vm.runInContext("_searchOpenMeteoLocations(query, undefined, 'globalHazards')", context);
    assert.equal(results.length, 1, query);
    assert.equal(results[0].name, 'City of Westminster');
    context.location = results[0];
    assert.doesNotMatch(vm.runInContext('_openMeteoLocationLabel(location)', context), /SW1A/);
    assert.equal(results[0].latitude, 51.501);
    assert.equal(results[0].longitude, -0.1416);
    assert.equal(results[0].timezone, 'Europe/London');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.postcodes.io/postcodes/SW1A1AA');
    assert.equal(calls[0].options.widgetType, 'globalHazards');
  }
});

test('postcode labels fall back to the administrative locality when no built-up-area name is supplied', async () => {
  const context = load(async () => ({ ok:true, json:async()=>({status:200,result:{
    postcode:'EH1 1YZ',latitude:55.95,longitude:-3.19,admin_district:'City of Edinburgh',country:'Scotland'
  }}) }));
  const results = await vm.runInContext("_searchOpenMeteoLocations('EH11YZ')", context);
  assert.equal(results[0].name, 'City of Edinburgh');
  assert.equal(results[0].latitude, 55.95);
});

test('city and non-UK postal searches keep their original geocoder', async () => {
  for (const query of ['Edinburgh', '10115']) {
    const context = load(async url => {
      assert.equal(new URL(url).hostname, 'geocoding-api.open-meteo.com');
      assert.equal(new URL(url).searchParams.get('name'), query);
      return { ok: true, json: async () => ({ results: [{ name: query, latitude: 52, longitude: 13 }] }) };
    });
    context.query = query;
    assert.equal((await vm.runInContext('_searchOpenMeteoLocations(query)', context))[0].name, query);
  }
});

test('missing postcodes and malformed coordinates never become a selectable location', async () => {
  for (const response of [
    { ok: false, status: 404, json: async () => ({ status: 404 }) },
    { ok: true, json: async () => ({ status: 200, result: { latitude: null, longitude: 0 } }) },
    { ok: true, json: async () => ({ status: 200, result: { latitude: 91, longitude: 0 } }) }
  ]) {
    const context = load(async () => response);
    assert.equal((await vm.runInContext("_searchOpenMeteoLocations('SW1A1AA')", context)).length, 0);
  }
});

test('postcode lookup preserves cancellation and reports outages instead of inventing a location', async () => {
  const controller = new AbortController();
  const context = load(async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    return { ok: false, status: 503, json: async () => ({ status: 503 }) };
  });
  context.signal = controller.signal;
  await assert.rejects(vm.runInContext("_searchOpenMeteoLocations('SW1A1AA', signal)", context), /unavailable/);
});

test('saved postcode labels resolve for display without changing the widget location or portable data', async () => {
  const cache = new Map(), refreshed = [];
  const context = load(async () => ({ok:true,json:async()=>({status:200,result:{
    postcode:'SW1A 1AA',bua:'City of Westminster',latitude:51.50101,longitude:-0.141563,country:'England'
  }})}));
  context.WidgetSDK = {cache:{get:(_type,id,key)=>cache.get(`${id}:${key}`),set:(_type,id,key,value)=>cache.set(`${id}:${key}`,value)}};
  context._refreshWidget = (id, placement) => refreshed.push([id, placement]);
  context.widget = {id:'old-weather',config:{locationName:'SW1A 1AA, England',latitude:51.5,longitude:-0.1},data:{}};
  const original = structuredClone(context.widget);
  assert.equal(vm.runInContext("_widgetLocationDisplayName(widget,'weather',widget.config,'Weather')",context),'Weather');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext("_widgetLocationDisplayName(widget,'weather',widget.config,'Weather')",context),'City of Westminster, England');
  assert.deepEqual(context.widget, original);
  assert.deepEqual(refreshed,[['old-weather','column'],['old-weather','navpane']]);
});
