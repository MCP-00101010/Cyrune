"""Validate Relay's native menus in disposable Firefox, without live user data.

Run with marionette-driver available. Evidence is written to a temporary directory.
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
from threading import Thread
import time

from marionette_driver.addons import Addons
from marionette_driver.by import By
from marionette_driver.marionette import Marionette


REPO = Path(__file__).resolve().parents[1]
KEY = "cyruneNativeContextMenuV1"


def main():
    root = Path(tempfile.mkdtemp(prefix="Cyrune-Relay-Native-Menu-"))
    os.environ.update(CYRUNE_HOST_CONFIG=str(root / "host.json"),
                      CYRUNE_NEXUS_DATA=str(root / "Nexus"),
                      CYRUNE_ARCADE_DATA=str(root / "Arcade"))

    class Page(BaseHTTPRequestHandler):
        def do_GET(self):
            page = f"""<!doctype html><title>Native menu fixture</title>
            <script>window.blocked=0;window.addEventListener('contextmenu',e=>{{window.blocked++;e.preventDefault();}},true);</script>
            <style>a,img,video,iframe{{display:block;margin:20px;width:180px;height:55px}}</style>
            <a id=link href='/destination'>Example link</a>
            <img id=picture src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='>
            <video id=video controls></video>
            {'<iframe id=frame src="http://127.0.0.3:' + str(server3.server_port) + '/frame"></iframe>' if self.path != '/frame' else ''}
            """
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(page.encode())

        def log_message(self, *_args):
            pass

    server3 = ThreadingHTTPServer(("127.0.0.3", 0), Page)
    server = ThreadingHTTPServer(("127.0.0.2", 0), Page)
    for item in (server3, server):
        Thread(target=item.serve_forever, daemon=True).start()
    url = f"http://127.0.0.2:{server.server_port}/"
    profile = root / "profile"
    profile.mkdir()
    driver = Marionette(bin=r"C:\Program Files\Mozilla Firefox\firefox.exe", port=0,
                        profile=str(profile), headless=True,
                        app_args=["--remote-allow-system-access"], gecko_log=str(root / "firefox.log"))

    def js(code, *args):
        return driver.execute_script(code, script_args=list(args), sandbox=None)

    def chrome(code):
        with driver.using_context("chrome"):
            return js(code)

    def wait(predicate):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(0.1)
        raise AssertionError("Firefox condition timed out")

    def close_menu():
        chrome("document.getElementById('contentAreaContextMenu').hidePopup()")

    def right_click(selector):
        driver.actions.sequence("pointer", "mouse", {"pointerType": "mouse"}).pointer_move(
            0, 0, origin=driver.find_element(By.CSS_SELECTOR, selector)).pointer_down(2).pointer_up(2).perform()
        time.sleep(0.25)

    checks = []
    try:
        driver.start_session()
        Addons(driver).install(str(REPO / "Relay"), temp=True)
        uuid = chrome("return JSON.parse(Services.prefs.getStringPref('extensions.webextensions.uuids'))['morpheus-webhub@local']")
        popup = f"moz-extension://{uuid}/popup/popup.html"
        driver.navigate(popup)
        wait(lambda: js("return !document.getElementById('nativeMenuEnabled').disabled"))
        assert not js("return document.getElementById('nativeMenuEnabled').checked")
        (root / "popup-off.png").write_bytes(driver.screenshot(format="binary", full=False))
        driver.navigate(url)
        right_click("#link")
        assert js("return window.blocked") == 1
        assert chrome("return document.getElementById('contentAreaContextMenu').state") == "closed"
        checks.append("default off preserves site blocking")

        web_handle = driver.current_window_handle
        popup_handle = driver.open(type="tab", focus=True)["handle"]
        driver.switch_to_window(popup_handle)
        driver.navigate(popup)
        js("document.querySelector('.browser-utilities').open=true")
        wait(lambda: js("return !document.getElementById('nativeMenuEnabled').disabled"))
        driver.find_element(By.ID, "nativeMenuEnabled").click()
        wait(lambda: js("return document.getElementById('nativeMenuEnabled').checked && !document.getElementById('nativeMenuEnabled').disabled"))
        (root / "popup-on.png").write_bytes(driver.screenshot(format="binary", full=False))
        driver.switch_to_window(web_handle)
        time.sleep(0.4)
        # The site handler ran once while disabled; enabling needs no page reload.
        js("window.blocked=0")
        for selector, item in [("#link", "context-openlinkintab"), ("#picture", "context-saveimage"), ("#video", "context-media-play")]:
            right_click(selector)
            assert chrome("return document.getElementById('contentAreaContextMenu').state") == "open", selector
            items = chrome("return [...document.getElementById('contentAreaContextMenu').querySelectorAll('[id]')].filter(e=>!e.hidden).map(e=>e.id)")
            assert item in items, (item, items)
            assert js("return window.blocked") == 0
            close_menu()
            checks.append(f"native menu and target-specific item: {selector}")
        driver.switch_to_frame(driver.find_element(By.ID, "frame"))
        right_click("#link")
        assert chrome("return document.getElementById('contentAreaContextMenu').state") == "open", js("return {url:location.href,blocked:window.blocked}")
        assert js("return window.blocked") == 0
        close_menu()
        driver.switch_to_default_content()
        checks.append("cross-origin embedded frame restored")

        # Settings remain extension-owned; exercise updates without reloading the web tab.
        driver.switch_to_window(popup_handle)
        driver.execute_async_script("browser.storage.local.set({[arguments[0]]:{enabled:true,exceptions:['127.0.0.2']}}).then(()=>arguments[arguments.length-1](true))", script_args=[KEY], sandbox=None)
        driver.switch_to_window(web_handle)
        time.sleep(0.3)
        driver.switch_to_frame(driver.find_element(By.ID, "frame"))
        right_click("#link")
        assert chrome("return document.getElementById('contentAreaContextMenu').state") == "closed"
        assert js("return window.blocked") == 1
        driver.switch_to_default_content()
        checks.append("top-level host exception applies live to cross-origin frame")
        driver.switch_to_window(popup_handle)
        driver.find_element(By.ID, "nativeMenuEnabled").click()
        wait(lambda: js("return !document.getElementById('nativeMenuEnabled').checked && !document.getElementById('nativeMenuEnabled').disabled"))
        driver.switch_to_window(web_handle)
        time.sleep(0.3)
        right_click("#link")
        assert chrome("return document.getElementById('contentAreaContextMenu').state") == "closed"
        assert js("return window.blocked") == 1
        checks.append("global toggle disables existing page handler without reload")
        print(json.dumps({"checks": checks, "evidence": str(root)}, indent=2))
    finally:
        driver.quit()
        driver.cleanup()
        for item in (server3, server):
            item.shutdown()


if __name__ == "__main__":
    main()
