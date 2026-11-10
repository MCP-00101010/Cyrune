"""Exercise Relay browser utilities in disposable Firefox and native-data roots."""
from __future__ import annotations

from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
from threading import Thread
import time

from marionette_driver.addons import Addons
from marionette_driver.by import By
from marionette_driver.keys import Keys
from marionette_driver.marionette import Marionette

REPO = Path(__file__).resolve().parents[1]


def main():
    root = Path(tempfile.mkdtemp(prefix="Cyrune-Relay-Utilities-"))
    os.environ.update(CYRUNE_HOST_CONFIG=str(root / "host.json"), CYRUNE_NEXUS_DATA=str(root / "Nexus"),
                      CYRUNE_ARCADE_DATA=str(root / "Arcade"))
    requests = Counter()

    class Page(BaseHTTPRequestHandler):
        def do_GET(self):
            requests[self.path] += 1
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"""<!doctype html><title>Utility [fixture]</title>
            <style>body{font:16px sans-serif;padding:20px}#locked{user-select:none}a{display:inline-block;margin:8px}textarea{display:block;width:350px;height:60px}</style>
            <script>window.blocked={copy:0,paste:0};for(const name of ['copy','paste'])window.addEventListener(name,e=>{window.blocked[name]++;e.preventDefault()},true)</script>
            <p id=locked>Locked text selection</p><p id=plain>Text for copying</p>
            <div id=links><a id=first href='https://one.example/path'>First [link]</a><a href='https://two.example/path'>Second</a><a href='https://one.example/path'>Duplicate</a><a href='javascript:void(0)'>Unsafe</a></div>
            <textarea id=editor aria-label=Editor></textarea>""")

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.2", 0), Page)
    Thread(target=server.serve_forever, daemon=True).start()
    page_url = f"http://127.0.0.2:{server.server_port}/refresh?exact=one"
    profile = root / "profile"
    profile.mkdir()
    driver = Marionette(bin=r"C:\Program Files\Mozilla Firefox\firefox.exe", profile=str(profile), port=0,
                        headless=True, app_args=["--remote-allow-system-access"], gecko_log=str(root / "firefox.log"))
    checks = []

    def js(code, *args):
        return driver.execute_script(code, script_args=list(args), sandbox=None)

    def chrome(code):
        with driver.using_context("chrome"):
            return js(code)

    def wait(predicate, seconds=20):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(0.1)
        raise AssertionError("Firefox condition timed out")

    def key(letter):
        driver.actions.sequence("key", "keyboard").key_down(Keys.CONTROL).key_down(letter).key_up(letter).key_up(Keys.CONTROL).perform()

    def read_clipboard():
        return chrome("return Cc['@mozilla.org/widget/clipboardhelper;1'] ? (function(){const t=Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);t.init(null);t.addDataFlavor('text/plain');Services.clipboard.getData(t,Services.clipboard.kGlobalClipboard);let data={};t.getTransferData('text/plain',data);return data.value.QueryInterface(Ci.nsISupportsString).data})() : ''")

    def popup_for_active_page(refresh=False):
        # Keep the fixture selected while loading the real popup document in a
        # background tab, so its normal tabs.query captures the fixture's tab ID.
        handle = driver.open(type="tab", focus=False)["handle"]
        driver.switch_to_window(handle, focus=False)
        driver.navigate(clock_url if refresh else popup_url)
        wait(lambda: js("return !document.getElementById('refreshAmount').disabled"))
        js("document.querySelector('.browser-utilities').open=true")
        return handle

    def menu_command(label):
        chrome("const root=[...document.querySelectorAll('#contentAreaContextMenu menu')].find(e=>e.getAttribute('label')==='Cyrune utilities');if(root)root.openMenu(true)")
        wait(lambda: chrome("return [...document.querySelectorAll('#contentAreaContextMenu menuitem')].some(e=>e.getAttribute('label')===" + json.dumps(label) + ")"))
        chrome("[...document.querySelectorAll('#contentAreaContextMenu menuitem')].find(e=>e.getAttribute('label')===" + json.dumps(label) + ").doCommand();document.getElementById('contentAreaContextMenu').hidePopup()")

    try:
        driver.start_session()
        Addons(driver).install(str(REPO / "Relay"), temp=True)
        uuid = chrome("return JSON.parse(Services.prefs.getStringPref('extensions.webextensions.uuids'))['morpheus-webhub@local']")
        popup_url = f"moz-extension://{uuid}/popup/popup.html"
        clock_url = popup_url + '?view=refresh'
        driver.navigate(page_url)
        web_handle = driver.current_window_handle
        def clock_id():
            return chrome("return [...document.querySelectorAll('[id^=pageAction-urlbar-]')].find(e=>e.id.includes('morpheus')&&!e.hidden)?.id")
        wait(clock_id)
        with driver.using_context('chrome'):
            driver.find_element(By.ID, clock_id()).click()
            wait(lambda: js("return [...document.querySelectorAll('panel')].some(p=>p.state==='open'&&p.querySelector('browser.webextension-popup-browser'))"))
            (root / 'addressbar-clock-popup.png').write_bytes(driver.screenshot(format='binary', full=False))
        chrome("for(const panel of document.querySelectorAll('panel'))if(panel.state==='open')panel.hidePopup()")
        checks.append('native address-bar clock opens its dedicated popup')
        assert js("return getComputedStyle(document.getElementById('locked')).userSelect") == "none"
        popup_handle = popup_for_active_page()
        for setting in ("restoreSelection", "restoreCopy", "restorePaste"):
            js("document.getElementById(arguments[0]).click()", setting)
            wait(lambda: js("return !document.getElementById('restoreSelection').disabled"))
        (root / "utilities-popup.png").write_bytes(driver.screenshot(format="binary", full=False))
        driver.switch_to_window(web_handle)
        wait(lambda: js("return getComputedStyle(document.getElementById('locked')).userSelect==='text'"))
        js("const r=document.createRange();r.selectNodeContents(document.getElementById('plain'));getSelection().removeAllRanges();getSelection().addRange(r)")
        key("c")
        wait(lambda: read_clipboard() == "Text for copying")
        assert js("return window.blocked.copy") == 0
        driver.find_element(By.ID, "editor").click()
        key("v")
        wait(lambda: js("return document.getElementById('editor').value==='Text for copying'"))
        assert js("return window.blocked.paste") == 0
        checks.append("native selection, copy and paste restoration")

        js("const r=document.createRange();r.selectNodeContents(document.getElementById('links'));getSelection().removeAllRanges();getSelection().addRange(r)")
        driver.actions.sequence("pointer", "mouse", {"pointerType": "mouse"}).pointer_move(
            0, 0, origin=driver.find_element(By.ID, "first")).pointer_down(2).pointer_up(2).perform()
        menu_command("Copy selected links: URLs")
        wait(lambda: read_clipboard() == "https://one.example/path\nhttps://two.example/path")
        checks.append("actual context-menu selection collection with deduplication and scheme filtering")
        driver.actions.sequence("pointer", "mouse", {"pointerType": "mouse"}).pointer_move(
            0, 0, origin=driver.find_element(By.ID, "first")).pointer_down(2).pointer_up(2).perform()
        menu_command("Send selected links to Portal Import Manager")

        driver.switch_to_window(popup_handle, focus=False)
        def queued_links():
            return driver.execute_async_script("browser.storage.local.get('cyruneDurableIntakeV1').then(s=>arguments[arguments.length-1]((s.cyruneDurableIntakeV1?.items||[]).filter(i=>i.payload.source==='selected-links').flatMap(i=>i.payload.items.map(item=>item.url))))", sandbox=None)
        wait(lambda: len(queued_links()) == 2)
        assert queued_links() == ["https://one.example/path", "https://two.example/path"]
        checks.append("actual selected-link import queues one deduplicated Portal delivery")
        js("document.getElementById('utilityCopyFormat').value='markdown';document.getElementById('copyPageBtn').click()")
        wait(lambda: js("return document.getElementById('utilityFeedback').textContent.includes('copied')"))
        assert read_clipboard() == f"[Utility \\[fixture\\]]({page_url})"
        checks.append("popup page Markdown copying")
        driver.navigate(clock_url)
        wait(lambda: js("return !document.getElementById('refreshAmount').disabled"))
        assert js("return getComputedStyle(document.querySelector('.refresh-controls')).display") == 'block'
        assert js("return getComputedStyle(document.querySelector('.browser-utilities')).display") == 'none'
        (root / 'refresh-only-popup.png').write_bytes(driver.screenshot(format='binary', full=False))
        js("document.getElementById('refreshAmount').value='10';document.getElementById('refreshUnit').value='1';document.getElementById('refreshEnabled').click()")
        wait(lambda: js("return document.getElementById('refreshEnabled').checked && !document.getElementById('refreshEnabled').disabled"))
        driver.switch_to_window(web_handle)
        driver.open(type="tab", focus=True)
        driver.switch_to_window(web_handle, focus=False)
        initial = requests["/refresh?exact=one"]
        time.sleep(11)
        assert requests["/refresh?exact=one"] == initial, "Edited form must suppress refresh"
        checks.append("edited-form reload suppression")
        driver.navigate(page_url)
        initial = requests["/refresh?exact=one"]
        # Selection pauses periodic reloads. Move to an unrelated tab while
        # retaining Marionette access to the extension control document.
        timer_page = driver.current_window_handle
        driver.open(type="tab", focus=True)
        driver.switch_to_window(popup_handle, focus=False)
        wait(lambda: requests["/refresh?exact=one"] > initial, seconds=15)
        checks.append("saved ten-second interval reloads the actual page")

        # Close and reopen the URL, then verify that the real popup reads the
        # remembered interval without entering it again.
        driver.switch_to_window(timer_page, focus=False)
        driver.close()
        driver.switch_to_window(popup_handle)
        new_web = driver.open(type="tab", focus=True)["handle"]
        driver.switch_to_window(new_web)
        driver.navigate(page_url)
        reopened_popup = popup_for_active_page(refresh=True)
        assert js("return document.getElementById('refreshAmount').value") == "10"
        assert js("return document.getElementById('refreshUnit').value") == "1"
        assert js("return document.getElementById('refreshEnabled').checked")
        checks.append("reopened domain restores enabled interval")
        driver.switch_to_window(new_web)
        with driver.using_context("chrome"):
            driver.execute_async_script("const done=arguments[arguments.length-1];const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');AddonManager.getAddonByID('morpheus-webhub@local').then(a=>a.reload()).then(()=>done(true),e=>done(String(e)))", sandbox=None)
        driver.switch_to_window(new_web)
        reopened_popup = popup_for_active_page(refresh=True)
        assert js("return document.getElementById('refreshAmount').value") == "10"
        alarms = driver.execute_async_script("browser.alarms.getAll().then(a=>arguments[arguments.length-1](a.map(item=>item.name)))", sandbox=None)
        assert not any(name.startswith("cyrune-refresh:") for name in alarms)
        checks.append("extension background restart restores saved rules while keeping selected tabs paused")
        js("document.getElementById('refreshEnabled').click()")
        wait(lambda: js("return !document.getElementById('refreshEnabled').checked"))
        driver.navigate(clock_url)
        wait(lambda: js("return !document.getElementById('refreshAmount').disabled"))
        assert js("return document.getElementById('refreshAmount').value") == "10"
        assert js("return !document.getElementById('refreshEnabled').checked")
        checks.append("pause retains the interval on reopening popup")
        driver.switch_to_window(reopened_popup, focus=False)
        print(json.dumps({"checks": checks, "evidence": str(root)}, indent=2))
    finally:
        driver.quit()
        driver.cleanup()
        server.shutdown()


if __name__ == "__main__":
    main()
