"""Exercise Widget Templates in an isolated Firefox profile without Relay or live data."""

import base64
import json
from pathlib import Path
import tempfile
import time

from marionette_driver.by import By
from marionette_driver.keys import Keys
from marionette_driver.marionette import Marionette


REPO = Path(__file__).resolve().parents[1]


def main():
    root = Path(tempfile.mkdtemp(prefix="Cyrune-Widget-Tidy-"))
    profile = root / "profile"
    profile.mkdir()
    browser = Marionette(
        bin=r"C:\Program Files\Mozilla Firefox\firefox.exe",
        port=0,
        profile=str(profile),
        headless=True,
        app_args=["--remote-allow-system-access"],
        gecko_log=str(root / "firefox.log"),
    )

    def js(code):
        return browser.execute_script(
            "return window.eval(arguments[0])",
            script_args=[f"(function(){{{code}}})()"],
            sandbox=None,
        )

    def click(selector):
        browser.find_element(By.CSS_SELECTOR, selector).click()

    def check(code):
        assert js(code), code

    def wait(code):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if js(code):
                return
            time.sleep(.1)
        raise AssertionError(code)

    try:
        browser.start_session()
        browser.set_window_rect(width=1000, height=850)
        browser.navigate((REPO / "Portal/index.html").as_uri())
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if js("return typeof WidgetSDK !== 'undefined' && typeof openWidgetSettings === 'function' && !document.documentElement.classList.contains('hub-booting')"):
                break
            time.sleep(0.1)
        js("""
          hideNotice();
          document.documentElement.style.setProperty('--ui-panel-alpha','.15');
          saveState = () => {}; pushUndoSnapshot = () => {};
          window.tidyWidget = {id:'tidy-notes', widgetType:'notes', title:'Original',
            config:{...WIDGET_REGISTRY.notes.defaultConfig,content:'Before'},data:{marker:'original'}};
          window.tidyOpen = () => openWidgetSettings(window.tidyWidget, () => {});
          window.tidyOpen();
        """)
        check("return !document.querySelector('#wstgBody .widget-preset-settings')")
        check("return !document.querySelector('.widget-templates-dialog')")
        click("#wstgTemplatesBtn")
        check("return document.querySelector('dialog').open && document.activeElement.closest('dialog')")
        wait("return !!document.querySelector('dialog').style.left")
        check("return getComputedStyle(document.querySelector('dialog')).backgroundColor.startsWith('rgb(')")
        start = js("const d=document.querySelector('dialog');window.templateStart=d.getBoundingClientRect();window.parentTemplateStart=document.querySelector('#widgetSettingsPanel').getBoundingClientRect();const r=d.querySelector('.settings-header').getBoundingClientRect();return {x:Math.round(r.left+40),y:Math.round(r.top+15)};")
        browser.actions.sequence('pointer', 'templates-drag', {'pointerType': 'mouse'}).pointer_move(start['x'], start['y']).pointer_down().pointer_move(start['x']+100, start['y']+60, duration=300).pointer_up().perform()
        check("const r=document.querySelector('dialog').getBoundingClientRect(),p=document.querySelector('#widgetSettingsPanel').getBoundingClientRect();return r.left>=templateStart.left+90&&r.top>=templateStart.top+50&&p.left===parentTemplateStart.left&&p.top===parentTemplateStart.top;")
        (root / 'templates-opaque-dragged.png').write_bytes(browser.screenshot(format='binary', full=False))
        js("document.querySelector('.widget-preset-name').value='Saved notes';")
        click(".widget-preset-save")
        check("return WidgetSDK.presets.list('notes').length===1")
        click(".widget-templates-close")
        check("return document.activeElement.id==='wstgTemplatesBtn'")
        js("const input=document.querySelector('[data-cfg=content]');input.value='After';input.dispatchEvent(new Event('input',{bubbles:true}));")
        click("#wstgTemplatesBtn")
        # Library updates must not rebuild a widget-specific settings form.
        js("window.tidyForm = document.querySelector('[data-cfg=content]');document.querySelector('.widget-preset-name').value='Changed notes';")
        click(".widget-preset-save")
        check("return window.tidyForm===document.querySelector('[data-cfg=content]') && window.tidyForm.value==='After'")
        js("const select=document.querySelector('.widget-preset-select');select.value=WidgetSDK.presets.list('notes').find(row=>row.name==='Saved notes').id;select.dispatchEvent(new Event('change'));")
        click(".widget-preset-apply")
        check("return !document.querySelector('dialog') && document.querySelector('[data-cfg=content]').value==='Before'")
        click("#wstgCancelBtn")
        check("return tidyWidget.config.content==='Before' && tidyWidget.data.marker==='original'")
        js("tidyOpen();")
        click("#wstgTemplatesBtn")
        js("const select=document.querySelector('.widget-preset-select');select.value=WidgetSDK.presets.list('notes').find(row=>row.name==='Changed notes').id;select.dispatchEvent(new Event('change'));")
        click(".widget-preset-apply")
        click("#wstgDoneBtn")
        check("return tidyWidget.config.content==='After'")
        js("tidyOpen();")
        click("#wstgTemplatesBtn")
        browser.find_element(By.CSS_SELECTOR, ".widget-preset-select").send_keys(Keys.ESCAPE)
        check("return !document.querySelector('dialog') && !document.querySelector('#widgetSettingsPanel').classList.contains('hidden') && document.activeElement.id==='wstgTemplatesBtn'")
        # Cross-type imports must fail before modifying the library.
        click("#wstgTemplatesBtn")
        js("""
          const file = new File([JSON.stringify({schemaVersion:1,presets:[{widgetType:'clock',name:'Wrong type'}]})], 'wrong.json', {type:'application/json'});
          const transfer=new DataTransfer();transfer.items.add(file);
          const input=document.querySelector('.widget-preset-file');input.files=transfer.files;
          input.dispatchEvent(new Event('change'));
        """)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if js("return document.querySelector('.widget-templates-status').textContent.includes('only')"):
                break
            time.sleep(0.05)
        check("return WidgetSDK.presets.list('clock').length===0 && document.querySelector('.widget-templates-status').textContent.includes('only')")
        browser.set_window_rect(width=380, height=680)
        wait("const d=document.querySelector('dialog');const r=d.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight && d.scrollWidth<=d.clientWidth")
        screenshot = root / "templates-compact.png"
        screenshot.write_bytes(base64.b64decode(browser.screenshot()))
        click(".widget-templates-close")
        for _ in range(3):
            click("#wstgTemplatesBtn")
            click(".widget-templates-close")
        click("#wstgTemplatesBtn")
        wait("return !!document.querySelector('dialog').style.left")
        js("window.closedTemplate=document.querySelector('dialog');const r=closedTemplate.getBoundingClientRect();closedTemplate.querySelector('.settings-header').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:r.left+30,clientY:r.top+15}));window.closedTemplateLeft=closedTemplate.style.left;closedTemplate.close();")
        wait("return !document.querySelector('dialog')")
        check("document.dispatchEvent(new MouseEvent('mousemove',{clientX:0,clientY:0}));return closedTemplate.style.left===closedTemplateLeft;")
        check("return !document.querySelector('dialog') && WidgetSDK.presets.list('notes').length===2")
        click("#wstgCancelBtn")
        # Every built-in settings form must still render after its footer is removed.
        forms = js("""
          const errors=[];let count=0;
          for (const [type,def] of Object.entries(WIDGET_REGISTRY)) {
            if (typeof def.renderSettings !== 'function') continue;
            try {
              const container=document.createElement('div');
              def.renderSettings(_newWidgetState(type),container);
              count++;
            } catch(error) { errors.push(type+': '+error.message); }
          }
          return {count,errors};
        """)
        assert not forms["errors"], forms
        print(json.dumps({"result": "passed", "settingsForms": forms["count"],
                          "profile": str(root), "screenshot": str(screenshot)}))
    finally:
        try:
            browser.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()
