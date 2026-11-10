"""Exercise widget layout and activity interactions in disposable Firefox data."""

import json
from pathlib import Path
import tempfile
import time

from marionette_driver.by import By
from marionette_driver.keys import Keys
from marionette_driver.marionette import Marionette

REPO = Path(__file__).resolve().parents[1]


def main():
    root = Path(tempfile.mkdtemp(prefix="Cyrune-Widget-Layout-"))
    (root / "profile").mkdir()
    browser = Marionette(bin=r"C:\Program Files\Mozilla Firefox\firefox.exe", port=0,
                         profile=str(root / "profile"), headless=True,
                         app_args=["--remote-allow-system-access"], gecko_log=str(root / "firefox.log"))

    def js(code):
        return browser.execute_script("return window.eval(arguments[0])",
                                      script_args=[f"(function(){{{code}}})()"], sandbox=None)

    def wait(code):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if js(code):
                return
            time.sleep(.1)
        raise AssertionError(code)

    def click(selector):
        browser.find_element(By.CSS_SELECTOR, selector).click()

    def check(code):
        assert js(code), code

    try:
        browser.start_session()
        browser.set_window_rect(width=1200, height=1000)
        browser.navigate((REPO / "Portal/index.html").as_uri())
        wait("return typeof WidgetSDK!=='undefined' && !document.documentElement.classList.contains('hub-booting')")
        js("""
          hideNotice();saveState=()=>{};pushUndoSnapshot=()=>{};
          window.layoutCalls=[];
          window.layoutState={activity:{enabled:true,paused:false},adopted:[],focus:{revision:1,
            phase:'work',status:'paused',remainingMs:1500000,workCount:1,config:{workMinutes:25,breakMinutes:5,longBreakMinutes:15},
            history:[{id:'phase-one',phase:'work',endedAt:Date.now(),durationMs:1200000}]}};
          window.layoutReport=host=>({sampledAt:Date.now(),totalMs:host?120000:3600000,distractingMs:host?0:600000,
            sites:host?[{name:host,milliseconds:120000}]:Array.from({length:16},(_,i)=>({name:`site-${i}.example`,milliseconds:(16-i)*20000})),
            categories:[{name:'Work',milliseconds:host?120000:3000000},{name:'Leisure',milliseconds:host?0:600000}],
            days:[{name:'2026-10-24',milliseconds:host?120000:3600000}],
            phases:[{name:'work',milliseconds:host?120000:2400000},{name:'outside',milliseconds:host?0:1200000}],
            sessions:[{name:'phase-one',milliseconds:host?120000:2400000}],omittedSites:0});
          window.layoutOffline=false;window.layoutReject=false;
          _widgetSdkExtensionInvoke=async(_type,method,payload)=>{
            if(method!=='productivityRequest')throw Error('Unexpected fixture operation');
            layoutCalls.push(payload);
            if(layoutOffline)throw Error('Fixture offline');
            if(payload.action==='settings'){
              if(layoutReject)throw Error('Tracking change failed');
              Object.assign(layoutState.activity,payload.args);
            }
            return payload.action==='report'||payload.action==='export'?{report:layoutReport(payload.args.hostname)}:structuredClone(layoutState);
          };
          _ensureIssTle=async()=>null;_readIssTleCache=()=>null;
          _issMapStyleUrl=()=>({version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#17212b'}}]});
          _issDayNightGeoJson=()=>({night:{type:'FeatureCollection',features:[]},border:{type:'FeatureCollection',features:[]}});
          window.layoutWidgets=['browserActivity','focusSession','issTracker','clock'].map((type,i)=>({..._newWidgetState(type),id:`layout-${type}`,title:`Custom ${type}`}));
          WidgetSDK.cache.set('browserActivity','layout-browserActivity','view',{sitesMode:'list',categoriesMode:'list',tab:'sites'});
          state.boards=[{id:'layout-board',tabs:[{id:'layout-tab',columns:[{id:'layout-column',items:layoutWidgets}]}]}];
          state.activeBoardId='layout-board';state.activeTabId='layout-tab';
          window.layoutRoot=document.createElement('section');layoutRoot.style.cssText='position:fixed;inset:0;z-index:100;background:#17191b;overflow:auto;display:grid;grid-template-columns:1fr 1fr;align-content:start;align-items:start;gap:12px;padding:16px';
          document.body.append(layoutRoot);
          layoutWidgets.forEach(widget=>layoutRoot.append(createWidgetElement(widget,'layout-column')));
          window.noOverlap=(a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.right<=y.left||y.right<=x.left||x.bottom<=y.top||y.bottom<=x.top;};
        """)
        wait("return !!document.querySelector('[data-activity-host]') && !!_issTrackerInstances.get('layout-issTracker')?.map")
        wait("return !!document.querySelector('.widget-map-style-toggle')")
        baseline = js("""
          const iss=document.querySelector('[data-item-id=layout-issTracker]');
          return {issControlsSeparate:noOverlap(iss.querySelector('.widget-map-style-toggle'),iss.querySelector('.widget-iss-north-button')),
            names:layoutWidgets.every(w=>document.querySelector(`[data-item-id="${w.id}"]`).textContent.includes(w.title))};
        """)
        js("const filter=document.querySelector('[data-activity-host]');filter.value='site-0.example';filter.dispatchEvent(new Event('change',{bubbles:true}));")
        time.sleep(.4)
        baseline["siteFilterUpdatesReport"] = js("return document.querySelector('.activity-total').textContent==='2.0 min'")
        print(json.dumps({"initial_checks": baseline, "artifacts": str(root)}), flush=True)
        assert all(baseline.values()), baseline
        js("window.confirm=()=>true;")
        click('[data-activity-delete]')
        wait("return layoutCalls.some(c=>c.action==='delete') && !document.querySelector('[data-activity-toggle]').disabled")
        check("return layoutCalls.find(c=>c.action==='delete').args.hostname==='site-0.example'")
        check("return document.querySelector('[data-activity-toggle]').type==='checkbox' && document.querySelector('[data-activity-toggle]').checked")
        click('[data-activity-toggle]')
        wait("return layoutState.activity.enabled===false && !document.querySelector('[data-activity-toggle]').checked")
        click('[data-activity-toggle]')
        wait("return layoutState.activity.enabled===true && document.querySelector('[data-activity-toggle]').checked")
        browser.find_element(By.CSS_SELECTOR, '[data-activity-toggle]').send_keys(Keys.SPACE)
        wait("return layoutState.activity.enabled===false")
        browser.find_element(By.CSS_SELECTOR, '[data-activity-toggle]').send_keys(Keys.SPACE)
        wait("return layoutState.activity.enabled===true")
        js("layoutReject=true")
        click('[data-activity-toggle]')
        wait("return document.querySelector('[data-activity-message]').textContent.includes('failed')")
        check("return document.querySelector('[data-activity-toggle]').checked && layoutState.activity.enabled")
        js("layoutReject=false;const f=document.querySelector('[data-activity-host]');f.value='';f.dispatchEvent(new Event('change',{bubbles:true}));")
        wait("return document.querySelector('.activity-total').textContent==='60.0 min'")
        check("return document.querySelectorAll('.activity-ranking .activity-row').length===10")
        check("return !!document.querySelector('.activity-pie') && !document.querySelector('[data-activity-chart]') && document.querySelector('.activity-chart-legend').textContent.includes('Others') && document.querySelector('.activity-chart-legend small').textContent==='(8.9%)'")
        click('[data-activity-tab=categories]')
        check("return !!document.querySelector('.activity-pie') && document.querySelector('.activity-chart-legend small').textContent==='(83.3%)'")
        click('[data-activity-tab=focus]')
        check("return document.querySelector('[data-activity-panel]').textContent.includes('Focus sessions') && !document.querySelector('[data-activity-chart]')")
        click('[data-activity-tab=sites]')
        check("return !!document.querySelector('.activity-pie')")
        browser.find_element(By.CSS_SELECTOR, '[data-activity-tab=sites]').send_keys(Keys.ARROW_RIGHT)
        check("return document.querySelector('[data-activity-tab=categories]').getAttribute('aria-selected')==='true' && !!document.querySelector('.activity-pie')")
        click('[data-activity-tab=sites]')
        check("return document.querySelector('.focus-session-dial .focus-session-phase') && !document.querySelector('.focus-session-phase').textContent.includes('paused')")
        check("return layoutWidgets.every(w=>parseFloat(getComputedStyle(document.querySelector(`[data-item-id=${w.id}]`)).borderTopWidth)>0)")
        for theme in ['light', 'default-dark']:
            js(f"applyTheme(getThemeById('{theme}'));")
            check("const probe=document.createElement('div');probe.style.cssText='border:1px solid var(--border);border-radius:var(--radius)';document.body.append(probe);const expected=getComputedStyle(probe);const same=layoutWidgets.every(w=>{const actual=getComputedStyle(document.querySelector(`[data-item-id=${w.id}]`));return actual.borderTopColor===expected.borderTopColor&&actual.borderTopLeftRadius===expected.borderTopLeftRadius;});probe.remove();return same;")
        # Names are a host contract, including settings Done/Cancel and clearing.
        js("openWidgetSettings(layoutWidgets[3],()=>refreshRenderedWidget(layoutWidgets[3]));document.querySelector('#wstgTitle').value='Renamed clock';")
        click('#wstgDoneBtn')
        check("return document.querySelector('[data-item-id=layout-clock] .widget-custom-title').textContent==='Renamed clock'")
        js("openWidgetSettings(layoutWidgets[3],()=>refreshRenderedWidget(layoutWidgets[3]));document.querySelector('#wstgTitle').value='';")
        click('#wstgCancelBtn')
        check("return document.querySelector('[data-item-id=layout-clock] .widget-custom-title').textContent==='Renamed clock'")
        js("openWidgetSettings(layoutWidgets[3],()=>refreshRenderedWidget(layoutWidgets[3]));document.querySelector('#wstgTitle').value='';")
        click('#wstgDoneBtn')
        check("return !document.querySelector('[data-item-id=layout-clock] .widget-custom-title')")
        js("layoutWidgets[3].title='Custom clock';refreshRenderedWidget(layoutWidgets[3]);")
        (root / "board.png").write_bytes(browser.screenshot(format="binary", full=False))
        # Restore all local view choices through an actual host rerender.
        js("refreshRenderedWidget(layoutWidgets[0]);")
        wait("return !!document.querySelector('.activity-pie')")
        # Test actual sidebar hosting and 150% text scaling at a narrow card width.
        js("""
          for(const widget of layoutWidgets){if(widget.widgetType==='issTracker')continue;
            const nav=structuredClone(widget);nav.id+='-nav';
            const host=createNavItem(nav);host.style.width='260px';layoutRoot.append(host);}
          layoutRoot.style.gridTemplateColumns='280px 1fr';
          layoutRoot.style.setProperty('--widget-text-scale','1.5');
        """)
        wait("return !!document.querySelector('.nav-widget-item [data-activity-toggle]')")
        for theme in ['light', 'default-dark']:
            js(f"applyTheme(getThemeById('{theme}'));")
            check("const probe=document.createElement('div');probe.style.cssText='border:1px solid var(--border);border-radius:var(--radius)';document.body.append(probe);const expected=getComputedStyle(probe);const same=[...document.querySelectorAll('.widget-card,.nav-widget-item')].every(e=>{const actual=getComputedStyle(e);return actual.borderTopColor===expected.borderTopColor&&actual.borderTopLeftRadius===expected.borderTopLeftRadius;});probe.remove();return same;")
        for phase, label in [('break', 'Short break'), ('longBreak', 'Long break'), ('work', 'Focus')]:
            js(f"layoutState.focus.phase='{phase}';layoutState.focus.revision++;window.dispatchEvent(new CustomEvent('cyrune-productivity-changed'));")
            wait(f"return [...document.querySelectorAll('.focus-session-phase')].every(e=>e.textContent==='{label}')")
            check("return [...document.querySelectorAll('.focus-session-phase')].every(e=>{const x=e.getBoundingClientRect(),y=e.closest('.focus-session-dial').getBoundingClientRect();return x.left>=y.left&&x.right<=y.right&&x.bottom<=y.bottom;})")
        check("return [...document.querySelectorAll('.nav-widget-item')].every(e=>e.querySelector('.widget-custom-title') && e.scrollWidth<=e.clientWidth)")
        check("return [...document.querySelectorAll('.activity-toolbar')].every(e=>e.scrollWidth<=e.clientWidth)")
        check("const iss=document.querySelector('[data-item-id=layout-issTracker]');return noOverlap(iss.querySelector('.widget-map-style-toggle'),iss.querySelector('.widget-iss-north-button'))")
        js("document.querySelectorAll('.widget-card').forEach(e=>e.style.display='none');layoutRoot.style.gridTemplateColumns='280px 280px';layoutRoot.scrollTop=0;")
        (root / "compact.png").write_bytes(browser.screenshot(format="binary", full=False))
        js("layoutOffline=true;window.dispatchEvent(new CustomEvent('cyrune-productivity-changed'));document.activeElement.blur();")
        wait("return !!document.querySelector('.activity-note')")
        check("return [...document.querySelectorAll('[data-activity-toggle]')].every(e=>e.disabled)")
        click('.nav-widget-item [data-activity-tab=focus]')
        check("return document.querySelector('.nav-widget-item [data-activity-panel]').textContent.includes('Focus sessions')")
        print(json.dumps({"result": "passed", "artifacts": str(root), "data": "synthetic Relay responses; real Portal hosts and MapLibre"}))
    finally:
        try:
            browser.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()
