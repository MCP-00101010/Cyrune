"""Verify postcode selection and MapLibre recentering in a disposable Firefox profile."""

import json
import base64
from pathlib import Path
import tempfile
import time

from marionette_driver.by import By
from marionette_driver.marionette import Marionette


REPO = Path(__file__).resolve().parents[1]


def main():
    root = Path(tempfile.mkdtemp(prefix="Cyrune-Weather-Locations-"))
    profile = root / "profile"
    profile.mkdir()
    browser = Marionette(
        bin=r"C:\Program Files\Mozilla Firefox\firefox.exe", port=0,
        profile=str(profile), headless=True, app_args=["--remote-allow-system-access"],
        gecko_log=str(root / "firefox.log"),
    )

    def js(code):
        return browser.execute_script("return window.eval(arguments[0])",
                                      script_args=[f"(function(){{{code}}})()"], sandbox=None)

    def check(code):
        if not js(code):
            detail = js("return {weatherConfig:weatherFixture.config,boards:state.boards.map(b=>b.id),effective:_weatherMapEffectiveConfig(mapFixture),mapConfig:mapFixture.config,center:_weatherMapInstances.get(mapFixture.id)?.map.getCenter(),notice:document.querySelector('#noticeMessage')?.textContent,settingsOpen:!document.querySelector('#widgetSettingsPanel').classList.contains('hidden'),errors:window.locationErrors,mapText:document.querySelector('[data-item-id=location-map]')?.textContent,refreshers:[..._widgetRefreshers.keys()]}")
            raise AssertionError(f"{code}; {detail}")

    def wait(code, seconds=20):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if js(code):
                return
            time.sleep(0.1)
        raise AssertionError(f"Timed out: {code}")

    def click(selector):
        browser.find_element(By.CSS_SELECTOR, selector).click()

    def search(selector, button, query):
        element = browser.find_element(By.CSS_SELECTOR, selector)
        element.clear()
        element.send_keys(query)
        click(button)
        wait("return !!document.querySelector('#wstgBody .weather-location-result')")
        click("#wstgBody .weather-location-result")

    try:
        browser.start_session()
        browser.set_window_rect(width=1300, height=950)
        browser.navigate((REPO / "Portal/index.html").as_uri())
        wait("return typeof _searchOpenMeteoLocations === 'function' && typeof state !== 'undefined'")
        wait("return !document.documentElement.classList.contains('hub-booting')")
        js("""
          hideNotice(); saveState=()=>{};pushUndoSnapshot=()=>{};
          window.locationErrors=[];window.addEventListener('error',event=>window.locationErrors.push(event.message));
          _ensureWeatherData=async widget=>_writeWeatherCache(widget,{
            current:{time:'2026-10-24T12:00',temperature_2m:18,weather_code:2,is_day:1},
            daily:{time:[]},hourly:{time:[]}
          });
          _ensureWeatherAirQualityData=async()=>null;
          _ensureWeatherMapData=async()=>null;_globalHazardLoad=async()=>null;_setWidgetTimer=()=>{};
          const blankStyle=value=>({version:8,metadata:{fixtureStyle:value},sources:{},layers:[{
            id:'fixture-background',type:'background',paint:{'background-color':value==='liberty'?'#e8edf2':'#17212b'}
          }]});
          _weatherMapStyleUrl=blankStyle;_globalHazardMapStyleUrl=blankStyle;
          const make=(type,id)=>({..._newWidgetState(type),id});
          window.weatherFixture=make('weather','location-weather');
          Object.assign(weatherFixture.config,{latitude:51.5,longitude:-0.1,locationName:'SW1A 1AA, England'});
          window.mapFixture=make('weatherMap','location-map');
          Object.assign(mapFixture.config,{latitude:51.5,longitude:-0.1,locationName:'SW1A 1AA, England'});
          window.hazardsFixture=make('globalHazards','location-hazards');
          window.sourceCity='London';
          state.boards=[{id:'location-board',tabs:[{id:'location-tab',columns:[{id:'location-column',items:[weatherFixture,mapFixture,hazardsFixture]}]}]}];
          state.activeBoardId='location-board';state.activeTabId='location-tab';
          const fixture=document.createElement('section');fixture.style.cssText='position:fixed;inset:0;z-index:100;background:#17191b;display:grid;grid-template-columns:1fr 1fr;overflow:auto;padding:20px;gap:12px';
          document.body.appendChild(fixture);
          for(const widget of [weatherFixture,mapFixture,hazardsFixture]) {
            fixture.appendChild(createWidgetElement(widget,'location-column'));
          }
          window.refreshLocationMap=()=>{
            const body=document.querySelector('[data-item-id=location-map]').firstElementChild;
            body.innerHTML='';WIDGET_REGISTRY.weatherMap.render(mapFixture,body,'column');
          };
        """)
        wait("return !!_weatherMapInstances.get(mapFixture.id)?.map && !!_globalHazardInstances.get(hazardsFixture.id)?.map")
        wait("return !!_weatherMapInstances.get(mapFixture.id).map.getStyle()?.metadata")
        check("return [...document.querySelectorAll('.widget-map-style-toggle svg')].every(svg=>getComputedStyle(svg).color==='rgb(248, 250, 252)')")
        click('[data-item-id="location-map"] .widget-map-style-toggle')
        check("return _weatherMapInstances.get(mapFixture.id).map.getStyle().metadata.fixtureStyle==='liberty'")
        (root / "light-map.png").write_bytes(base64.b64decode(browser.screenshot()))
        click('[data-item-id="location-map"] .widget-map-style-toggle')
        check("return _weatherMapInstances.get(mapFixture.id).map.getStyle().metadata.fixtureStyle==='dark'")
        (root / "dark-map.png").write_bytes(base64.b64decode(browser.screenshot()))
        wait("return document.querySelector('[data-item-id=location-weather] .widget-weather-location')?.textContent.includes('Westminster') && document.querySelector('[data-item-id=location-map] .widget-weather-map-location')?.textContent.includes('Westminster')")
        (root / "resolved-labels.png").write_bytes(base64.b64decode(browser.screenshot()))
        click('[data-item-id="location-hazards"] .widget-map-style-toggle')
        check("return _globalHazardInstances.get(hazardsFixture.id).map.getStyle().metadata.fixtureStyle==='liberty'")
        click('[data-item-id="location-hazards"] .widget-map-style-toggle')
        check("return _globalHazardInstances.get(hazardsFixture.id).map.getStyle().metadata.fixtureStyle==='dark'")
        check("return weatherFixture.config.locationName==='SW1A 1AA, England' && weatherFixture.config.latitude===51.5 && weatherFixture.config.longitude===-.1")
        check("const map=_weatherMapInstances.get(mapFixture.id).map;const canvas=map.getCanvas();_refreshWidget(mapFixture.id,'column');return _weatherMapInstances.get(mapFixture.id).map===map && map.getCanvas()===canvas")
        check("return Math.abs(_globalHazardInstances.get(hazardsFixture.id).map.getCenter().lat-51.5)<.001")
        # Live lookup of a public postcode through the SDK and the actual settings picker.
        js("document.querySelector('[data-item-id=location-weather] > .widget-action-btn:not(.widget-action-btn--reload)').focus();")
        click('[data-item-id="location-weather"] > .widget-action-btn:not(.widget-action-btn--reload)')
        search(".weather-location-search", ".weather-location-search-btn", "SW1A 1AA")
        click("#wstgDoneBtn")
        check("const c=_weatherMapInstances.get(mapFixture.id).map.getCenter();return Math.abs(c.lat-weatherFixture.config.latitude)<.001 && Math.abs(c.lng-weatherFixture.config.longitude)<.001")
        check("return !weatherFixture.config.locationName.includes('SW1A') && Math.abs(weatherFixture.config.latitude-51.50101)<.001")
        check("const label=document.querySelector('[data-item-id=location-weather] .widget-weather-location').textContent;return label===weatherFixture.config.locationName && !label.includes('SW1A')")
        check("return Math.abs(_globalHazardInstances.get(hazardsFixture.id).map.getCenter().lat-weatherFixture.config.latitude)<.001")
        js("document.querySelector('[data-item-id=location-map] > .widget-action-btn:not(.widget-action-btn--reload)').focus();")
        click('[data-item-id="location-map"] > .widget-action-btn:not(.widget-action-btn--reload)')
        search(".weather-map-location-search", ".weather-map-location-search-btn", "Edinburgh")
        check("return document.querySelector('.weather-map-location-selected').textContent.includes('Edinburgh')")
        click("#wstgDoneBtn")
        check("const c=_weatherMapInstances.get(mapFixture.id)?.map.getCenter();return c && Math.abs(c.lat-mapFixture.config.latitude)<.001 && Math.abs(c.lng-mapFixture.config.longitude)<.001 && c.lat>55")
        # User panning survives a normal refresh; a source-location change overrides it.
        js("_globalHazardInstances.get(hazardsFixture.id).map.jumpTo({center:[10,40],zoom:6});")
        js("_refreshWidget(hazardsFixture.id,'column');")
        check("return Math.abs(_globalHazardInstances.get(hazardsFixture.id).map.getCenter().lat-40)<.001")
        js("document.querySelector('[data-item-id=location-weather] > .widget-action-btn:not(.widget-action-btn--reload)').focus();")
        click('[data-item-id="location-weather"] > .widget-action-btn:not(.widget-action-btn--reload)')
        search(".weather-location-search", ".weather-location-search-btn", "Edinburgh")
        click("#wstgDoneBtn")
        check("return Math.abs(_globalHazardInstances.get(hazardsFixture.id).map.getCenter().lat-weatherFixture.config.latitude)<.001")
        check("return _weatherMapInstances.get(mapFixture.id).map.getCenter().lat>55 && mapFixture.config.useWeatherLocation===false")
        # Own watch location changes must also override the previous camera on Done.
        js("openWidgetSettings(hazardsFixture,()=>_refreshWidget(hazardsFixture.id,'column'));")
        click('label.settings-toggle:has([data-cfg="useWeatherLocation"])')
        search(".global-hazards-location-search", ".global-hazards-location-search-btn", "SW1A1AA")
        click("#wstgDoneBtn")
        check("return Math.abs(_globalHazardInstances.get(hazardsFixture.id).map.getCenter().lat-51.50101)<.001")
        js("openWidgetSettings(mapFixture,refreshLocationMap);")
        search(".weather-map-location-search", ".weather-map-location-search-btn", "SW1A1AA")
        click("#wstgCancelBtn")
        check("return mapFixture.config.locationName.includes('Edinburgh') && _weatherMapInstances.get(mapFixture.id).map.getCenter().lat>55")
        js("""
          mapFixture.config.inheritCyruneLocation=true;
          mapFixture.config.useWeatherLocation=false;
          window.fixtureSharedLocation={city:'Glasgow',latitude:55.8642,longitude:-4.2518};
          globalThis.CyruneSettings={get:()=>({values:{region:fixtureSharedLocation},sources:{}})};
          window.dispatchEvent(new CustomEvent('cyrune:settings-applied'));
        """)
        check("return Math.abs(_weatherMapInstances.get(mapFixture.id).map.getCenter().lat-55.8642)<.001")
        js("fixtureSharedLocation={city:'York',latitude:53.959,longitude:-1.0815};window.dispatchEvent(new CustomEvent('cyrune:settings-applied'));")
        check("return Math.abs(_weatherMapInstances.get(mapFixture.id).map.getCenter().lat-53.959)<.001")
        print(json.dumps({"result":"passed", "profile":str(root), "maps":"real MapLibre, local blank styles", "geocoding":"live city and public UK postcode"}))
    finally:
        try:
            browser.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()
