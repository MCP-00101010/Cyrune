"""Validate Relay productivity services and Portal widgets in disposable Firefox data."""
import importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
import sys
import time
from threading import Thread

from marionette_driver.addons import Addons
from marionette_driver.by import By
from marionette_driver.marionette import Marionette

REPO = Path(__file__).resolve().parents[1]


def validate_productivity_tools(driver, js, wait, request, root, popup_url, server, counts, portal):
    base = f'http://127.0.0.2:{server.server_port}'
    main_control = driver.open(type='tab', focus=True)['handle']
    driver.switch_to_window(main_control)
    driver.navigate(popup_url)
    request('activity', 'settings', {'enabled': True})
    web = driver.open(type='tab', focus=True)['handle']
    driver.switch_to_window(web)
    driver.navigate(base + '/tools')
    control = driver.open(type='tab', focus=False)['handle']
    driver.switch_to_window(control, focus=False)
    driver.navigate(popup_url + '?view=refresh')
    wait("return !document.querySelector('#unloadPause').disabled")
    tab_id = driver.execute_async_script('browser.tabs.query({active:true,currentWindow:true}).then(([tab])=>arguments[arguments.length-1](tab.id))', sandbox=None)

    def message(fields):
        result = driver.execute_async_script('browser.runtime.sendMessage(arguments[0]).then(arguments[arguments.length-1])', script_args=[fields], sandbox=None)
        assert result.get('ok'), result
        return result

    def site():
        return message({'type': 'CYRUNE_SITE_CONTROLS', 'action': 'state', 'tabId': tab_id})

    def override():
        return message({'type': 'CYRUNE_TAB_TIMERS', 'action': 'state', 'tabId': tab_id})

    js("document.querySelector('#siteDistracting').click()")
    wait(lambda: site()['distracting'])
    js("document.querySelector('#refreshAmount').value='10';document.querySelector('#refreshUnit').value='1';document.querySelector('#refreshEnabled').click();document.querySelector('#unloadAmount').value='1';document.querySelector('#unloadEnabled').click();document.querySelector('#unloadPause').value='1800';document.querySelector('#unloadPause').dispatchEvent(new Event('change'))")
    wait(lambda: (override().get('override') or {}).get('unload', {}).get('seconds') == 1800)
    driver.open(type='tab', focus=True)
    driver.switch_to_window(control, focus=False)
    wait(lambda: message({'type': 'CYRUNE_TAB_UNLOAD', 'action': 'state', 'tabId': tab_id})['status']['reason'] == 'Temporarily paused')
    initial = counts.get('/tools', 0)
    wait(lambda: counts.get('/tools', 0) > initial, seconds=20)
    wait(lambda: message({'type': 'CYRUNE_BROWSER_UTILITIES', 'action': 'state', 'tabId': tab_id})['status']['lastAt'] > 0)
    js("document.querySelector('#reloadPause').value='0';document.querySelector('#reloadPause').dispatchEvent(new Event('change'))")
    wait(lambda: (override().get('override') or {}).get('reload', {}).get('seconds') == 0)
    assert message({'type': 'CYRUNE_BROWSER_UTILITIES', 'action': 'state', 'tabId': tab_id})['rule']['enabled']
    assert message({'type': 'CYRUNE_BROWSER_UTILITIES', 'action': 'state', 'tabId': tab_id})['status']['nextAt'] == 0
    current = counts.get('/tools', 0)
    time.sleep(11)
    assert counts.get('/tools', 0) == current
    overview = driver.open(type='tab', focus=True)['handle']
    driver.switch_to_window(overview)
    driver.navigate(popup_url + '?view=timers')
    wait(f"return !!document.querySelector('[data-timer-tab=\"{tab_id}\"]')")
    js(f"document.querySelector('[data-timer-tab=\"{tab_id}\"]').click();document.querySelector('#timerBulkMode').value='none';document.querySelector('#timerBulkApply').click()")
    wait(lambda: override().get('override') is None)
    assert message({'type': 'CYRUNE_TAB_TIMERS', 'action': 'list', 'offset': 0, 'query': '', 'filter': 'timers'})['total'] >= 1
    (root / 'timer-overview.png').write_bytes(driver.screenshot(format='binary', full=False))
    driver.switch_to_window(control, focus=False)
    js("document.querySelector('[data-relay-category=activity]').click();document.querySelector('#siteAllowanceMinutes').value='1';document.querySelector('#siteAllowanceWarning').value='0';document.querySelector('#siteAllowanceBlock').checked=true;document.querySelector('#siteAllowanceEnabled').click()")
    wait(lambda: site()['allowance']['rule']['minutes'] == 1)
    (root / 'allowance-controls.png').write_bytes(driver.screenshot(format='binary', full=False))
    driver.switch_to_window(main_control, focus=False)
    focus = request('focus', 'state')['focus']
    request('focus', 'start', {'config': {'workMinutes': 1}, 'widgetId': 'native-tools'}, focus['revision'])
    driver.switch_to_window(web, focus=True)
    driver.switch_to_window(main_control, focus=False)
    print('Waiting for real activity allowance and focus completion...', flush=True)

    def blocked():
        return driver.execute_async_script('browser.tabs.get(arguments[0]).then(t=>arguments[arguments.length-1](t.url.includes("?view=blocked&")))', script_args=[tab_id], sandbox=None)

    wait(blocked, seconds=90)
    focus = request('focus', 'state')['focus']
    phase = next(row for row in focus['history'] if row['phase'] == 'work')
    report = request('activity', 'report', {'sessionId': phase['id']})['report']
    assert report['totalMs'] >= 45000 and report['distractingMs'] >= 45000, report
    driver.switch_to_window(web, focus=False)
    wait("return document.querySelector('#blockedReason')?.textContent.includes('Daily allowance reached')")
    (root / 'allowance-blocked.png').write_bytes(driver.screenshot(format='binary', full=False))
    driver.switch_to_window(portal, focus=True)
    wait("return document.querySelector('.focus-session-review [data-focus-review]')?.textContent.includes('Distracting')")
    assert js("return !document.querySelector('.focus-session-review').textContent.includes('unavailable')")
    (root / 'focus-session-review.png').write_bytes(driver.screenshot(format='binary', full=False))
    print(json.dumps({'ok': True, 'checks': ['Keep awake leaves reloads running', 'Pause preserves rules and prevents background reloads', 'Overview bulk resume and bounded list', 'Daily allowance blocks a real active site', 'Completed focus report retains phase-attributed browsing', 'Widget session review'], 'artifacts': str(root)}))


def validate_background_reload(driver, js, wait, root, popup_url, server, counts):
    url = f'http://127.0.0.2:{server.server_port}/background-refresh'
    driver.navigate(url)
    control = driver.open(type='tab', focus=False)['handle']
    driver.switch_to_window(control, focus=False)
    driver.navigate(popup_url + '?view=refresh')
    wait("return !document.querySelector('#refreshEnabled').disabled")
    tab_id = driver.execute_async_script('browser.tabs.query({active:true,currentWindow:true}).then(([tab])=>arguments[arguments.length-1](tab.id))', sandbox=None)

    def status():
        return driver.execute_async_script("browser.runtime.sendMessage({type:'CYRUNE_BROWSER_UTILITIES',action:'state',tabId:arguments[0]}).then(arguments[arguments.length-1])", script_args=[tab_id], sandbox=None)

    def select(active):
        script = 'browser.tabs.update(arguments[0],{active:true})' if active else "browser.tabs.create({url:'about:blank',active:true})"
        driver.execute_async_script(script + '.then(arguments[arguments.length-1])', script_args=[tab_id], sandbox=None)

    js("document.querySelector('#refreshAmount').value='10';document.querySelector('#refreshUnit').value='1';document.querySelector('#refreshEnabled').click()")
    wait(lambda: (status().get('rule') or {}).get('enabled'))
    assert status()['status']['nextAt'] == 0
    initial = counts['/background-refresh']
    time.sleep(12)
    assert counts['/background-refresh'] == initial, counts
    select(False)
    wait(lambda: status()['status']['nextAt'] > 0)
    wait(lambda: counts['/background-refresh'] > initial, seconds=15)
    wait(lambda: status()['status']['lastAt'] > 0)
    select(True)
    wait(lambda: status()['status']['nextAt'] == 0)
    current = counts['/background-refresh']
    time.sleep(12)
    assert counts['/background-refresh'] == current, counts
    select(False)
    wait(lambda: status()['status']['nextAt'] > 0)
    remaining = driver.execute_async_script("browser.runtime.sendMessage({type:'CYRUNE_BROWSER_UTILITIES',action:'state',tabId:arguments[0]}).then(s=>arguments[arguments.length-1](s.status.nextAt-Date.now()))", script_args=[tab_id], sandbox=None)
    assert 8500 <= remaining <= 10000, remaining
    time.sleep(1)
    assert counts['/background-refresh'] == current, counts
    wait(lambda: counts['/background-refresh'] > current, seconds=15)
    print(json.dumps({'ok': True, 'checks': ['No periodic reload while selected', 'Reload after switching away', 'Return cancels deadline with no catch-up', 'Deselection grants a fresh full interval'], 'artifacts': str(root)}))


def validate_unload(driver, js, wait, root, popup_url, server, audio_server, counts):
    base = f'http://127.0.0.2:{server.server_port}'
    audio_base = f'http://127.0.0.3:{audio_server.server_port}'
    handles = {}
    for name in ['clean', 'form', 'audio']:
        handle = driver.open(type='tab', focus=True)['handle']
        driver.switch_to_window(handle)
        driver.navigate((audio_base if name == 'audio' else base) + '/' + name)
        handles[name] = handle
        if name == 'form':
            driver.find_element(By.ID, 'draft').send_keys('Unsaved draft')
        if name == 'audio':
            driver.find_element(By.ID, 'play').click()
    driver.switch_to_window(handles['clean'], focus=True)
    control = driver.open(type='tab', focus=False)['handle']
    driver.switch_to_window(control, focus=False)
    driver.navigate(popup_url + '?view=refresh')
    wait("return !document.querySelector('#unloadEnabled').disabled")

    def command(message):
        result = driver.execute_async_script('browser.runtime.sendMessage(arguments[0]).then(arguments[arguments.length-1])', script_args=[message], sandbox=None)
        assert result.get('ok'), result
        return result

    def tabs():
        return driver.execute_async_script('browser.tabs.query({}).then(tabs=>arguments[arguments.length-1](tabs.map(t=>({id:t.id,url:t.url,title:t.title,audible:t.audible,discarded:t.discarded,active:t.active,status:t.status}))))', sandbox=None)

    ids = {name: next(tab['id'] for tab in tabs() if tab['url'] == (audio_base if name == 'audio' else base) + '/' + name) for name in handles}
    wait(lambda: any(tab['id'] == ids['audio'] and tab['audible'] for tab in tabs()))
    command({'type': 'CYRUNE_BROWSER_UTILITIES', 'action': 'refresh', 'mode': 'start', 'seconds': 10, 'tabId': ids['clean'], 'expectedUrl': base + '/clean'})
    # Audio uses a different domain so the clean-page reload test cannot stop its stream.
    command({'type': 'CYRUNE_TAB_UNLOAD', 'action': 'settings', 'enabled': True, 'seconds': 60, 'tabId': ids['audio']})
    js("document.querySelector('#unloadAmount').value='1';document.querySelector('#unloadEnabled').click()")
    wait(lambda: (command({'type': 'CYRUNE_TAB_UNLOAD', 'action': 'state', 'tabId': ids['clean']}).get('rule') or {}).get('enabled'))
    (root / 'unload-card.png').write_bytes(driver.screenshot(format='binary', full=False))
    # Move Firefox selection away from every test site; keep control messaging in a background tab.
    blank = driver.open(type='tab', focus=True)['handle']
    driver.switch_to_window(blank)
    driver.navigate('about:blank')
    driver.switch_to_window(control, focus=False)
    print('Waiting for the real one-minute Firefox unload alarm...', flush=True)
    wait(lambda: any(tab['id'] == ids['clean'] and tab['title'].startswith('↻ ') for tab in tabs()))
    wait("return document.querySelector('#refreshStatus').textContent.includes('Last')")
    wait(lambda: any(tab['id'] == ids['clean'] and tab['discarded'] for tab in tabs()), seconds=85)
    observed = {tab['id']: tab for tab in tabs()}
    assert observed[ids['clean']]['title'].startswith('💤 '), observed
    assert command({'type': 'CYRUNE_TAB_UNLOAD', 'action': 'state', 'tabId': ids['form']})['status']['reason'] == 'Edited form'
    assert not observed[ids['form']]['discarded'], observed
    assert not observed[ids['audio']]['discarded'] and observed[ids['audio']]['audible'], observed
    before = counts.get('/clean', 0)
    assert before >= 2, counts  # Reloads happened without postponing unloading.
    time.sleep(12)
    assert counts.get('/clean', 0) == before, counts  # Discarded tabs are not reloaded in the background.
    driver.execute_async_script('browser.tabs.update(arguments[0],{active:true}).then(arguments[arguments.length-1])', script_args=[ids['clean']], sandbox=None)
    wait(lambda: any(tab['id'] == ids['clean'] and not tab['discarded'] and tab['status'] == 'complete' for tab in tabs()))
    driver.switch_to_window(handles['clean'], focus=False)
    wait("return document.querySelector('#draft') && location.pathname==='/clean'")
    assert counts.get('/clean', 0) > before, counts
    driver.switch_to_window(control, focus=False)
    assert not next(tab for tab in tabs() if tab['id'] == ids['clean'])['discarded']
    driver.navigate(popup_url + '?view=refresh')
    wait("return !document.querySelector('#unloadEnabled').disabled")
    assert js("return document.querySelector('#unloadEnabled').checked && document.querySelector('#unloadAmount').value==='1'")
    print(json.dumps({'ok': True, 'checks': ['Untouched app editors and synthetic input do not block timers', 'Reload completion marker and live last-reload status', 'Confirmed unload sleep marker', 'One-minute background discard despite automatic reloads', 'Audio and real edited form protected with visible reason', 'Reload pauses while discarded', 'Firefox restores on selection', 'Domain settings retained'], 'artifacts': str(root)}))


def main():
    root = Path(tempfile.mkdtemp(prefix='Cyrune-Productivity-'))
    spec = importlib.util.spec_from_file_location('fixture', REPO / 'tests/migration/test_catalogue_workflow.py')
    fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture)
    fixture.prepare_fixture(root, prepared=False)
    items = [{'id': 'focus-a', 'type': 'widget', 'widgetType': 'focusSession',
              'config': {'preset': 'custom', 'workMinutes': 1, 'breakMinutes': 1, 'notifications': True}, 'data': {}},
             {'id': 'focus-b', 'type': 'widget', 'widgetType': 'focusSession', 'config': {}, 'data': {}},
             {'id': 'activity', 'type': 'widget', 'widgetType': 'browserActivity', 'config': {}, 'data': {}}]
    (root / 'portal.json').write_text(json.dumps({
        'schemaVersion': 7, 'hubName': 'Productivity acceptance', 'activeBoardId': 'board', 'activeTabId': 'tab',
        'boards': [{'id': 'board', 'title': 'Home', 'tabs': [{'id': 'tab', 'title': 'Main',
                    'columns': [{'id': f'column-{index}', 'title': 'Productivity', 'items': [item]} for index, item in enumerate(items)], 'inbox': {'id': 'inbox-tab', 'items': []}}], 'speedDial': []}],
        'navItems': [], 'essentials': [], 'tags': [], 'settings': {'activeThemeName': 'dark'}}), encoding='utf-8')
    os.environ.update(CYRUNE_HOST_CONFIG=str(root / 'host.json'), CYRUNE_NEXUS_DATA=str(root / 'Nexus'),
                      CYRUNE_ARCADE_DATA=str(root / 'Arcade'), PYTHONDONTWRITEBYTECODE='1')
    profile = root / 'profile'
    profile.mkdir()
    counts = {}

    class Page(BaseHTTPRequestHandler):
        def do_GET(self):
            counts[self.path] = counts.get(self.path, 0) + 1
            self.send_response(200)
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(b'<!doctype html><title>Activity fixture</title><p>Reading</p><div contenteditable="true">Write a comment</div><input type="range"><input id="draft"><script>setInterval(()=>window.dispatchEvent(new Event("input")),1000)</script><button id="play" onclick="window.audio=new AudioContext();window.osc=audio.createOscillator();window.gain=audio.createGain();gain.gain.value=0.001;osc.frequency.value=55;osc.connect(gain);gain.connect(audio.destination);osc.start()">Play</button>')

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(('127.0.0.2', 0), Page)
    Thread(target=server.serve_forever, daemon=True).start()
    audio_server = ThreadingHTTPServer(('127.0.0.3', 0), Page) if '--unload' in sys.argv else None
    if audio_server:
        Thread(target=audio_server.serve_forever, daemon=True).start()
    driver = Marionette(bin=r'C:\Program Files\Mozilla Firefox\firefox.exe', port=0, profile=str(profile), headless=True,
                        app_args=['--remote-allow-system-access'], gecko_log=str(root / 'firefox.log'))

    def js(code):
        if driver.execute_script('return location.protocol', sandbox=None) == 'file:':
            return driver.execute_script('return window.eval(arguments[0])', script_args=['(function(){' + code + '})()'], sandbox=None)
        return driver.execute_script(code, sandbox=None)

    def wait(code, seconds=35):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            if (code() if callable(code) else js(code)):
                return
            time.sleep(.15)
        raise AssertionError(f'Timed out: {code}; {js("return document.body.innerText.slice(-3000)")}')

    def request(service, action, args=None, revision=None):
        envelope = {'schemaVersion': 1, 'service': service, 'action': action, 'args': args or {}, 'requestId': 'native-' + str(time.time_ns())}
        if revision is not None:
            envelope['expectedRevision'] = revision
        result = driver.execute_async_script("browser.runtime.sendMessage({type:'CYRUNE_PRODUCTIVITY',payload:arguments[0]}).then(arguments[arguments.length-1])",
                                             script_args=[envelope], sandbox=None)
        assert result.get('ok'), result
        return result

    checks = []
    def compact_layout():
        js("const tab=state.boards[0].tabs[0],widgets=tab.columns.flatMap(c=>c.items);tab.columns=[{id:'compact',title:'Focus',items:[widgets[0]]}];tab.columnCount=1;state.navItems=[widgets[1],widgets[2]];renderAll()")
        driver.set_window_rect(width=600, height=1000)
        wait("return document.querySelector('.focus-session--navpane [data-focus-primary]') && document.querySelector('.browser-activity-sidebar [data-activity-toggle]')")
        assert js("return [...document.querySelectorAll('.focus-session,.browser-activity-widget')].every(e=>e.getBoundingClientRect().width>=180)")
        (root / 'widgets-narrow.png').write_bytes(driver.screenshot(format='binary', full=False))
        js("document.querySelector('.browser-activity-sidebar [data-activity-tab=focus]').click();document.querySelector('.browser-activity-sidebar').scrollIntoView()")
        (root / 'activity-controls-sidebar.png').write_bytes(driver.screenshot(format='binary', full=False))

    try:
        driver.start_session()
        Addons(driver).install(str(REPO / 'Relay'), temp=True)
        with driver.using_context('chrome'):
            uuid = js("return JSON.parse(Services.prefs.getStringPref('extensions.webextensions.uuids'))['morpheus-webhub@local']")
        popup_url = f'moz-extension://{uuid}/popup/popup.html'
        driver.navigate('about:addons')
        driver.find_element(By.CSS_SELECTOR, '#category-extension').click()
        wait('return !!document.querySelector(\'addon-card[addon-id="morpheus-webhub@local"]\')')
        driver.find_element(By.CSS_SELECTOR, '.addon-name-link').click()
        wait("return !!document.querySelector('addon-details')")
        driver.find_element(By.CSS_SELECTOR, '#details-deck-button-permissions').click()
        driver.find_element(By.CSS_SELECTOR, '[permission-type="file_scheme_access"]').click()
        wait("return document.querySelector('[permission-type=file_scheme_access]').pressed")
        driver.set_window_rect(width=1280, height=1000)
        if '--today-time' in sys.argv:
            driver.navigate(popup_url)
            request('activity', 'settings', {'enabled': True})
            main_control = driver.current_window_handle
            web = driver.open(type='tab', focus=True)['handle']
            driver.switch_to_window(web)
            driver.navigate(f'http://127.0.0.2:{server.server_port}/today')
            control = driver.open(type='tab', focus=False)['handle']
            driver.switch_to_window(control, focus=False)
            driver.navigate(popup_url + '?view=refresh')
            wait("return !document.querySelector('#siteTodayTime').hidden")
            wait("return document.querySelector('#siteTodayTime').textContent==='1 min'", seconds=85)
            layout = js("const time=document.querySelector('#siteTodayTime').getBoundingClientRect(),heading=document.querySelector('.activity-heading').getBoundingClientRect(),category=document.querySelector('#siteCategory').getBoundingClientRect();return {right:Math.abs(time.right-heading.right),above:time.bottom<category.top}")
            assert layout['right'] < 1 and layout['above'], layout
            (root / 'today-time.png').write_bytes(driver.screenshot(format='binary', full=False))
            driver.switch_to_window(main_control, focus=False)
            request('activity', 'settings', {'paused': True})
            driver.switch_to_window(control, focus=False)
            wait("return !document.querySelector('#siteTodayTime').hidden && document.querySelector('#siteTodayTime').textContent==='1 min'")
            driver.switch_to_window(main_control, focus=False)
            request('activity', 'settings', {'enabled': False})
            driver.switch_to_window(control, focus=False)
            wait("return document.querySelector('#siteTodayTime').hidden")
            print(json.dumps({'ok': True, 'checks': ['Real tracked minute appears without an allowance', 'Compact total above category at right edge', 'Paused tracking retains total', 'Disabled tracking hides total'], 'artifacts': str(root)}))
            return
        if '--allowance-recovery' in sys.argv:
            driver.navigate(popup_url)
            original = {'schemaVersion': 1, 'rules': {'127.0.0.2': {'minutes': 20, 'warningMinutes': 5, 'block': True}}, 'notices': {}}

            def seed_and_restart(record):
                driver.execute_async_script('browser.storage.local.set({cyruneSiteAllowancesV1:arguments[0]}).then(()=>arguments[arguments.length-1](true))', script_args=[record], sandbox=None)
                driver.navigate('about:blank')
                with driver.using_context('chrome'):
                    driver.execute_async_script("const done=arguments[arguments.length-1];const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');AddonManager.getAddonByID('morpheus-webhub@local').then(a=>a.reload()).then(()=>done(true),e=>done(String(e)))", sandbox=None)

            for record in [original, {'schemaVersion': 99, 'rules': {}, 'notices': {}}]:
                seed_and_restart(record)
                driver.navigate(f'http://127.0.0.2:{server.server_port}/recovery')
                control = driver.open(type='tab', focus=False)['handle']
                driver.switch_to_window(control, focus=False)
                driver.navigate(popup_url + '?view=refresh')
                wait("return !document.querySelector('#siteCategory').disabled")
                expected_focus = not js("return document.querySelector('#siteBlockFocus').checked")
                js("document.querySelector('#siteCategory').value='Gaming';document.querySelector('#siteCategory').dispatchEvent(new Event('change'));document.querySelector('#siteBlockFocus').click()")
                wait(lambda: driver.execute_async_script('browser.tabs.query({active:true,currentWindow:true}).then(([tab])=>browser.runtime.sendMessage({type:"CYRUNE_SITE_CONTROLS",action:"state",tabId:tab.id})).then(v=>arguments[arguments.length-1](v.category))', sandbox=None) == 'Gaming')
                saved = driver.execute_async_script('browser.storage.local.get(null).then(arguments[arguments.length-1])', sandbox=None)
                wait(lambda: driver.execute_async_script('browser.storage.local.get("cyruneDomainRulesV1").then(v=>arguments[arguments.length-1](v.cyruneDomainRulesV1?.rules?.["127.0.0.2"]?.focus))', sandbox=None) == expected_focus)
                assert saved['cyruneSiteAllowancesV1MigrationBackup'] == original
                if record['schemaVersion'] == 1:
                    assert saved['cyruneSiteAllowancesV1']['rules']['127.0.0.2']['enabled'] is True
                    assert not js("return document.querySelector('#siteDomain').textContent.includes('recovery')")
                else:
                    assert saved['cyruneSiteAllowancesV1'] == record
                    assert js("return document.querySelector('#siteAllowanceError').textContent.includes('recovery')")
                    assert js("return document.querySelector('#siteAllowanceEnabled').disabled")
                    js("document.querySelector('[data-relay-category=activity]').click()")
                    assert js("return document.querySelector('#siteAllowance').getClientRects().length > 0")
                (root / f'allowance-recovery-{record["schemaVersion"]}.png').write_bytes(driver.screenshot(format='binary', full=False))
                driver.navigate(popup_url)
            print(json.dumps({'ok': True, 'checks': ['Earlier allowance format converts with original backup', 'Category and blocking controls remain usable with invalid allowances', 'Invalid records retained and errors confined to allowance card'], 'artifacts': str(root)}))
            return
        if '--background-refresh' in sys.argv:
            validate_background_reload(driver, js, wait, root, popup_url, server, counts)
            return
        if '--unload' in sys.argv:
            validate_unload(driver, js, wait, root, popup_url, server, audio_server, counts)
            return
        driver.navigate((REPO / 'Portal/index.html').as_uri())
        wait("return document.querySelectorAll('[data-focus-primary]').length === 2 && document.querySelector('[data-activity-toggle]')")
        assert js("return !document.querySelector('.browser-activity-widget [data-activity-toggle]').checked")
        if '--website-categories' in sys.argv:
            driver.navigate(popup_url)
            request('activity', 'settings', {'categories': {'learn.example': 'Learning', 'work.example': 'Work'}})
            seed = """
              const done=arguments[arguments.length-1],open=indexedDB.open('cyruneProductivityV1',1);
              open.onsuccess=()=>{const db=open.result,tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),read=store.get('current');
                read.onsuccess=()=>{const row=read.result;row.value.schemaVersion=3;store.put(row);};
                tx.oncomplete=()=>{db.close();done(true);};tx.onerror=()=>done(false);};
            """
            assert driver.execute_async_script(seed, sandbox=None)
            driver.navigate('about:blank')
            with driver.using_context('chrome'):
                driver.execute_async_script("const done=arguments[arguments.length-1];const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');AddonManager.getAddonByID('morpheus-webhub@local').then(a=>a.reload()).then(()=>done(true))", sandbox=None)
            driver.navigate(popup_url)
            migrated = request('activity', 'state')['activity']
            assert migrated['categories'] == {'learn.example': 'Education and e-learning', 'work.example': 'Work'}, migrated
            record = driver.execute_async_script("const done=arguments[arguments.length-1],open=indexedDB.open('cyruneProductivityV1',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('state'),read=tx.objectStore('state').get('current');read.onsuccess=()=>done(read.result.value);tx.oncomplete=()=>db.close();};", sandbox=None)
            assert record['schemaVersion'] == 4 and record['categoryMigration']['backup'] == {'learn.example': 'Learning', 'work.example': 'Work'}
            main_control = driver.current_window_handle
            web = driver.open(type='tab', focus=True)['handle']
            driver.switch_to_window(web)
            driver.navigate(f'http://127.0.0.2:{server.server_port}/categories')
            control = driver.open(type='tab', focus=False)['handle']
            driver.switch_to_window(control, focus=False)
            driver.navigate(popup_url + '?view=refresh')
            wait("return !document.querySelector('#siteCategory').disabled")
            options = js("return [...document.querySelector('#siteCategory').options].map(o=>o.textContent)")
            assert len(options) == 22 and 'Marketplace' not in options and 'Marketplaces and auctions' in options and 'Learning' not in options, options
            js("document.querySelector('#siteCategory').value='Technology and software';document.querySelector('#siteCategory').dispatchEvent(new Event('change'))")
            driver.switch_to_window(main_control, focus=False)
            wait(lambda: request('activity', 'state')['activity']['categories'].get('127.0.0.2') == 'Technology and software')
            driver.switch_to_window(control, focus=False)
            (root / 'website-categories.png').write_bytes(driver.screenshot(format='binary', full=False))
            print(json.dumps({'ok': True, 'checks': ['Schema-3 IndexedDB migration and original category backup', 'New category names in real clock dropdown', 'Ambiguous Work preserved', 'New category selection persists through real Relay'], 'artifacts': str(root)}))
            return
        if '--productivity-tools' in sys.argv:
            validate_productivity_tools(driver, js, wait, request, root, popup_url, server, counts, driver.current_window_handle)
            compact_layout()
            return
        if '--site-controls' in sys.argv or '--popup-layout' in sys.argv:
            counts = {}

            alias = ThreadingHTTPServer(('127.0.0.1', 0), Page)
            Thread(target=alias.serve_forever, daemon=True).start()
            try:
                # Global preferences belong to Done/Cancel, never the portable widget config.
                js("openWidgetSettings(state.boards[0].tabs[0].columns[2].items[0],()=>renderAll())")
                wait("return !document.querySelector('[data-activity-setting=idleSeconds]').disabled")
                js("document.querySelector('[data-activity-setting=idleSeconds]').value='300'")
                driver.find_element(By.CSS_SELECTOR, '#wstgCancelBtn').click()
                js("openWidgetSettings(state.boards[0].tabs[0].columns[2].items[0],()=>renderAll())")
                wait("return !document.querySelector('[data-activity-setting=idleSeconds]').disabled")
                assert js("return document.querySelector('[data-activity-setting=idleSeconds]').value") == '120'
                js("document.querySelector('[data-activity-setting=idleSeconds]').value='300';document.querySelector('[data-activity-setting=retentionDays]').value='7'")
                driver.find_element(By.CSS_SELECTOR, '#wstgDoneBtn').click()
                wait("return document.querySelector('#widgetSettingsPanel').classList.contains('hidden')")
                assert js("return Object.keys(state.boards[0].tabs[0].columns[2].items[0].config).length===0")
                assert js("return !document.querySelector('.browser-activity-widget [data-activity-idle]')")
                driver.set_pref('network.dns.localDomains', 'www.cyrune.test,news.cyrune.test')
                base = f'http://www.cyrune.test:{alias.server_port}'
                driver.navigate(base + '/one')
                web = driver.current_window_handle
                clock = popup_url + '?view=refresh'

                def native_clock_screenshot(filename):
                    with driver.using_context('chrome'):
                        wait("return [...document.querySelectorAll('[id^=pageAction-urlbar-]')].some(e=>e.id.includes('morpheus')&&!e.hidden)")
                        action_id = js("return [...document.querySelectorAll('[id^=pageAction-urlbar-]')].find(e=>e.id.includes('morpheus')&&!e.hidden).id")
                        driver.find_element(By.ID, action_id).click()
                        wait("return [...document.querySelectorAll('panel')].some(p=>p.state==='open'&&p.querySelector('browser.webextension-popup-browser'))")
                        (root / filename).write_bytes(driver.screenshot(format='binary', full=False))
                        js("for(const panel of document.querySelectorAll('panel'))if(panel.state==='open')panel.hidePopup()")

                native_clock_screenshot('native-domain-popup.png')

                def popup():
                    handle = driver.open(type='tab', focus=False)['handle']
                    driver.switch_to_window(handle, focus=False)
                    driver.navigate(clock)
                    wait("return !document.querySelector('#siteCategory').disabled && !document.querySelector('#refreshEnabled').disabled")
                    return handle

                control = popup()
                assert js("return document.querySelector('header .title').textContent") == 'Timer & Activity Tracker'
                assert js("return document.querySelector('#siteDomain').textContent.includes('cyrune.test')")
                layout = js("""const rect=id=>document.getElementById(id).getBoundingClientRect(),center=id=>{const r=rect(id);return r.y+r.height/2;};
                  const gaps=[...document.querySelectorAll('.site-card label')].flatMap(label=>{
                    const input=label.querySelector('input,select');if(!input)return [];
                    const node=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());if(!node)return [];
                    const range=document.createRange(),text=node.textContent;range.setStart(node,text.search(/\\S/));range.setEnd(node,text.trimEnd().length);
                    const r=range.getBoundingClientRect(),i=input.getBoundingClientRect();return [input.type==='checkbox'?r.left-i.right:i.left-r.right];
                  });
                  return {gaps,centers:['refreshEnabled','refreshAmount','refreshUnit'].map(center),unloadCenters:['unloadEnabled','unloadAmount','unloadUnit'].map(center),checkboxLefts:['refreshEnabled','unloadEnabled','siteDistracting','siteExcluded','siteBlockScheduled','siteBlockFocus'].map(id=>rect(id).left),overflow:[...document.querySelectorAll('.site-card input,.site-card select')].some(e=>e.getBoundingClientRect().right>e.closest('.site-card').getBoundingClientRect().right)};""")
                assert all(abs(gap - 6) < 1 for gap in layout['gaps']), layout
                assert max(layout['centers']) - min(layout['centers']) < 1, layout
                assert max(layout['unloadCenters']) - min(layout['unloadCenters']) < 1, layout
                assert max(layout['checkboxLefts']) - min(layout['checkboxLefts']) < 1, layout
                assert not layout['overflow'], layout
                if '--popup-layout' in sys.argv:
                    (root / 'aligned-popup.png').write_bytes(driver.screenshot(format='binary', full=False))
                    previous = set(driver.window_handles)
                    js("document.querySelector('#tabTimersOpen').click()")
                    wait(lambda: bool(set(driver.window_handles) - previous))
                    driver.switch_to_window(next(iter(set(driver.window_handles) - previous)))
                    wait("return document.body.classList.contains('timers-view')")
                    js("document.querySelector('#timerFilter').value='all';document.querySelector('#timerFilter').dispatchEvent(new Event('change'))")
                    wait("return !!document.querySelector('[data-timer-tab]')")
                    (root / 'overview-layout.png').write_bytes(driver.screenshot(format='binary', full=False))
                    print(json.dumps({'ok': True, 'checks': ['Reload controls share one row', 'Consistent 6px label/control spacing', 'Checkbox alignment and no overflow', 'Header opens overview and renders web-tab rows'], 'artifacts': str(root)}))
                    return
                def site_state():
                    return driver.execute_async_script("const done=arguments[arguments.length-1];browser.tabs.query({active:true,currentWindow:true}).then(([tab])=>browser.runtime.sendMessage({type:'CYRUNE_SITE_CONTROLS',action:'state',tabId:tab.id})).then(done)", sandbox=None)

                assert js("const names=[...document.querySelector('#siteCategory').options].map(o=>o.value);return names.at(-1)==='Uncategorized' && names.includes('Gaming') && names.includes('Productivity') && !names.includes('Distracting') && JSON.stringify(names.slice(0,-1))===JSON.stringify(names.slice(0,-1).sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'})))")

                js("document.querySelector('#refreshAmount').value='10';document.querySelector('#refreshUnit').value='1';document.querySelector('#refreshEnabled').click()")
                wait("return document.querySelector('#refreshEnabled').checked && !document.querySelector('#refreshEnabled').disabled")
                js("const category=document.querySelector('#siteCategory');category.value='Learning';category.dispatchEvent(new Event('change'))")
                wait(lambda: site_state().get('category') == 'Learning')
                js("document.querySelector('#siteDistracting').click()")
                wait(lambda: site_state().get('distracting') is True)
                js("document.querySelector('#siteExcluded').click()")
                wait(lambda: site_state().get('excluded') is True)
                (root / 'domain-controls.png').write_bytes(driver.screenshot(format='binary', full=False))
                driver.switch_to_window(web)
                driver.navigate(f'http://news.cyrune.test:{alias.server_port}/two')
                driver.switch_to_window(control, focus=False)
                driver.navigate(clock)
                wait("return !document.querySelector('#siteCategory').disabled")
                assert js("return document.querySelector('#siteCategory').value==='Learning' && document.querySelector('#siteExcluded').checked && document.querySelector('#siteDistracting').checked && document.querySelector('#refreshEnabled').checked")
                driver.open(type='tab', focus=True)
                driver.switch_to_window(control, focus=False)
                time.sleep(11)
                assert counts.get('/two', 0) >= 2, counts
                driver.switch_to_window(web, focus=True)
                driver.switch_to_window(control, focus=False)
                js("document.querySelector('#refreshEnabled').click()")
                wait("return !document.querySelector('#refreshEnabled').disabled && !document.querySelector('#refreshEnabled').checked")
                # Actual running work blocks the already-open matching tab.
                js("document.querySelector('#siteBlockFocus').click()")
                wait(lambda: site_state().get('rule', {}).get('focus') is True)
                driver.navigate(popup_url)
                state = request('focus', 'state')
                request('focus', 'start', {'config': {'workMinutes': 1}, 'widgetId': 'native'}, state['focus']['revision'])
                driver.switch_to_window(web)
                wait("return location.search.startsWith('?view=blocked&') && document.querySelector('#blockedReason').textContent.includes('focus session')")
                (root / 'focus-blocked.png').write_bytes(driver.screenshot(format='binary', full=False))
                native_clock_screenshot('native-blocked-page-popup.png')
                before = counts.get('/never-loaded', 0)
                driver.navigate(base + '/never-loaded')
                wait("return document.querySelector('#blockedReason')?.textContent.includes('focus session')")
                assert counts.get('/never-loaded', 0) == before, counts
                driver.switch_to_window(control, focus=False)
                state = request('focus', 'state')
                request('focus', 'pause', revision=state['focus']['revision'])
                driver.switch_to_window(web)
                driver.navigate(base + '/allowed-paused')
                assert js('return location.hostname') == 'www.cyrune.test'
                driver.switch_to_window(control, focus=False)
                driver.navigate(clock)
                wait("return !document.querySelector('#siteBlockScheduled').disabled")
                # Build a local-time schedule containing the current minute.
                js("const d=new Date(),fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'),m=d.getHours()*60+d.getMinutes();document.querySelector('#siteBlockScheduled').checked=true;document.querySelector('#siteBlockFrom').value=fmt((m+1439)%1440);document.querySelector('#siteBlockUntil').value=fmt((m+10)%1440);document.querySelector('#siteBlockScheduled').dispatchEvent(new Event('change'))")
                wait(lambda: site_state().get('rule', {}).get('scheduled') is True)
                driver.switch_to_window(web)
                wait("return document.querySelector('#blockedReason')?.textContent.includes('daily rule')")
                (root / 'schedule-blocked.png').write_bytes(driver.screenshot(format='binary', full=False))
                driver.navigate('about:blank')
                with driver.using_context('chrome'):
                    driver.execute_async_script("const done=arguments[arguments.length-1];const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');AddonManager.getAddonByID('morpheus-webhub@local').then(a=>a.reload()).then(()=>done(true),e=>done(String(e)))", sandbox=None)
                driver.navigate(base + '/after-restart')
                wait("return document.querySelector('#blockedReason')?.textContent.includes('daily rule')")
                assert counts.get('/after-restart', 0) == 0
                print(json.dumps({'ok': True, 'checks': ['Global widget settings Done/Cancel', 'Real three-card popup', 'Automatic category/flag/exclusion/reload across subdomains', 'Open-tab focus enforcement', 'Pre-request blocking without site load', 'Pause allows access', 'Daily rules and restart persistence'], 'artifacts': str(root)}))
                return
            finally:
                alias.shutdown()
        if '--creation-only' in sys.argv:
            js("contextTarget={columnId:'column-2'};handleContextMenuAction('addWidget:browserActivity')")
            wait("return !document.querySelector('#widgetSettingsPanel').classList.contains('hidden') && document.querySelector('#wstgBody').textContent.includes('Enable tracking')")
            (root / 'activity-create-settings.png').write_bytes(driver.screenshot(format='binary', full=False))
            driver.find_element(By.CSS_SELECTOR, '#wstgDoneBtn').click()
            wait("return document.querySelectorAll('.browser-activity-widget').length===2 && document.querySelector('#widgetSettingsPanel').classList.contains('hidden')")
            js("contextTarget={columnId:'column-2'};handleContextMenuAction('addWidget:browserActivity')")
            driver.find_element(By.CSS_SELECTOR, '#wstgCancelBtn').click()
            assert js("return document.querySelectorAll('.browser-activity-widget').length===2")
            js("handleContextMenuAction('addNavWidget:browserActivity')")
            wait("return !document.querySelector('#widgetSettingsPanel').classList.contains('hidden')")
            driver.find_element(By.CSS_SELECTOR, '#wstgDoneBtn').click()
            wait("return !!document.querySelector('.browser-activity-sidebar [data-activity-toggle]') && document.querySelector('#widgetSettingsPanel').classList.contains('hidden')")
            assert js("return [...document.querySelectorAll('[data-activity-toggle]')].every(e=>!e.checked)")
            print(json.dumps({'ok': True, 'checks': ['Actual Add Widget settings, Done and Cancel, sidebar creation, tracking remains off'], 'artifacts': str(root)}))
            return
        if '--layout-only' in sys.argv:
            driver.find_element(By.CSS_SELECTOR, '[data-activity-toggle]').click()
            wait("const toggle=document.querySelector('[data-activity-toggle]');return toggle.checked&&!toggle.disabled")
            driver.find_element(By.CSS_SELECTOR, '[data-activity-toggle]').click()
            wait("const toggle=document.querySelector('[data-activity-toggle]');return !toggle.checked&&!toggle.disabled")
            compact_layout()
            print(json.dumps({'ok': True, 'checks': ['Actual Relay tracking enable/disable through the widget switch', 'Real board/sidebar widgets at supported compact widths'], 'artifacts': str(root)}))
            return
        driver.find_element(By.CSS_SELECTOR, '[data-focus-primary]').click()
        wait("return [...document.querySelectorAll('.focus-session-phase')].every(e=>e.textContent.includes('running'))")
        (root / 'widgets-wide.png').write_bytes(driver.screenshot(format='binary', full=False))
        checks.append('Two real Portal widgets control one shared running timer; tracking defaults off')
        driver.navigate(popup_url)
        snapshot = request('focus', 'state')
        deadline = snapshot['focus']['endsAt']
        assert snapshot['focus']['status'] == 'running'
        wait("return document.querySelector('#focusStatus').textContent.includes('running')")
        checks.append('Relay popup displays the widget-started timer')
        # Close every Portal view, leaving only the extension popup document open.
        while time.time() * 1000 < deadline + 1500:
            time.sleep(min(1, max(.05, (deadline + 1500 - time.time() * 1000) / 1000)))
        snapshot = request('focus', 'state')
        assert snapshot['focus']['phase'] == 'break' and snapshot['focus']['status'] == 'paused', snapshot
        assert len(snapshot['focus']['history']) == 1 and not snapshot['focus']['history'][0]['interrupted']
        notes = driver.execute_async_script("browser.notifications.getAll().then(arguments[arguments.length-1])", sandbox=None)
        assert any('productivity-focus' in key for key in notes), notes
        checks.append('Firefox alarm completes a phase and creates a real notification with Portal closed')
        request('activity', 'settings', {'enabled': True, 'idleSeconds': 1800})
        idle = driver.execute_async_script("browser.idle.queryState(1800).then(arguments[arguments.length-1])", sandbox=None)
        assert idle == 'active', 'Native acceptance needs a recently active desktop; idle state: ' + idle
        # about: and extension documents must never contribute browsing time.
        time.sleep(1)
        assert request('activity', 'report')['report']['totalMs'] == 0
        driver.navigate(f'http://127.0.0.2:{server.server_port}/private-path?token=fixture')
        time.sleep(17)
        driver.navigate(popup_url)
        report = request('activity', 'export', {'detail': True})['report']
        assert report['totalMs'] > 0, report
        assert all(row['hostname'] == '127.0.0.2' for row in report['detail'])
        assert 'private-path' not in json.dumps(report) and 'token=' not in json.dumps(report)
        checks.append('Real focused browser activity is collected outside Portal with hostname-only export')
        driver.navigate('about:blank')
        with driver.using_context('chrome'):
            driver.execute_async_script("const done=arguments[arguments.length-1];const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');AddonManager.getAddonByID('morpheus-webhub@local').then(a=>a.reload()).then(()=>done(true),e=>done(String(e)))", sandbox=None)
        driver.navigate(popup_url)
        wait("return !!document.querySelector('#focusStatus')")
        assert request('focus', 'state')['focus']['phase'] == 'break'
        assert request('activity', 'report')['report']['totalMs'] == report['totalMs']
        checks.append('Real extension restart retains Focus history and IndexedDB activity totals')
        request('activity', 'delete', {'hostname': '127.0.0.2'})
        assert request('activity', 'export', {'detail': True})['report']['totalMs'] == 0
        request('activity', 'settings', {'enabled': False})
        request('focus', 'stop', revision=request('focus', 'state')['focus']['revision'])
        driver.navigate((REPO / 'Portal/index.html').as_uri())
        wait("return document.querySelectorAll('.focus-session-phase').length === 2 && document.querySelector('.browser-activity-widget')")
        assert js("return [...document.querySelectorAll('[data-focus-primary]')].every(e=>e.getAttribute('aria-label')==='Start')")
        compact_layout()
        checks.append('Deletion removes detail and totals; reopened widgets reflect shared stopped state')
        print(json.dumps({'ok': True, 'checks': checks, 'artifacts': str(root)}))
    finally:
        driver.cleanup()
        server.shutdown()
        if audio_server:
            audio_server.shutdown()


if __name__ == '__main__':
    main()
