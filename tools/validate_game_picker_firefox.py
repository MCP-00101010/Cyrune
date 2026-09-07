"""Direct-file Firefox acceptance in an isolated profile and synthetic runtime.

Requires Mozilla's marionette-driver package and the installed Cyrune native
host registration. Uses https://firefox-source-docs.mozilla.org/python/marionette_driver.html
All browser/runtime artifacts remain in an external temporary directory.
"""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time

from marionette_driver.addons import Addons
from marionette_driver.by import By
from marionette_driver.keys import Keys
from marionette_driver.marionette import Marionette


REPO = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--firefox", default=r"C:\Program Files\Mozilla Firefox\firefox.exe")
    parser.add_argument("--entries", type=int, default=125)
    parser.add_argument("--selection", type=int, default=2, choices=[2, 100])
    parser.add_argument("--prepared", action="store_true", help="Check compatibility with previously prepared identities")
    parser.add_argument("--arcade-send", action="store_true", help="Check Arcade multiselect delivery while Portal is closed")
    parser.add_argument("--scummvm", action="store_true", help="Check ScummVM picker, collection handoff and batch delivery")
    parser.add_argument("--legacy-spectrum", action="store_true", help="Check an existing Spectrum shortcut while ScummVM stays active")
    args = parser.parse_args()
    if args.legacy_spectrum:
        args.scummvm = True
    if args.arcade_send and args.selection != 2:
        parser.error('--arcade-send uses a two-variant fixture; omit --selection')
    root = Path(tempfile.mkdtemp(prefix="Cyrune-Firefox-picker-"))
    spec = importlib.util.spec_from_file_location("workflow_fixture", REPO / "tests/migration/test_catalogue_workflow.py")
    fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture)
    if not 125 <= args.entries <= 100000:
        parser.error("entries must be between 125 and 100000")
    fixture.prepare_fixture(root, entries=args.entries, prepared=args.prepared)
    if args.scummvm:
        fixture.add_scummvm_fixture(root)
        spectrum_metadata_path = root / 'spectrum/collection-metadata.json'
        spectrum_metadata = json.loads(spectrum_metadata_path.read_text(encoding='utf-8'))
        spectrum_metadata['games'][0]['language'] = 'English'
        spectrum_metadata['games'][1]['language'] = 'German'
        spectrum_metadata_path.write_text(json.dumps(spectrum_metadata), encoding='utf-8')
        remake = root / 'ScummVM/adventure-deluxe'
        remake.mkdir()
        with (root / 'scummvm.ini').open('a', encoding='utf-8') as stream:
            stream.write(f'\n[adventure-deluxe]\nengineid=ags\ngameid=ags\ndescription=ScummVM Adventure Deluxe (English)\npath={remake}\nplatform=\nextra=Steam\nlanguage=en\n')
    if args.arcade_send:
        fixture_config_path = root / 'Arcade/config.json'
        fixture_config = json.loads(fixture_config_path.read_text(encoding='utf-8'))
        fixture_config['default_collection'] = 'spectrum'
        fixture_config_path.write_text(json.dumps(fixture_config), encoding='utf-8')
        (root / 'Arcade/state.json').write_text(json.dumps({'active_collection_id': 'spectrum', 'favourites': [], 'recent': []}), encoding='utf-8')
    metadata_before = (root / "spectrum/collection-metadata.json").read_bytes()
    expected_matches = min(50, len({game['title'] for game in json.loads(metadata_before)['games'] if '00' in game['title']}))
    data = {"schemaVersion": 6, "hubName": "Picker acceptance", "activeBoardId": "games", "activeTabId": "tab",
            "boards": [{"id": "games", "title": "Games", "tabs": [{"id": "tab", "title": "Games",
              "columns": [{"id": "chosen", "title": "Chosen column", "items": []}],
              "inbox": {"id": "inbox", "items": []}}]}],
            "navItems": [{"id": "nav", "type": "board", "boardId": "games"}], "essentials": [], "settings": {}, "tags": []}
    database = root / "portal.json"
    if args.legacy_spectrum:
        legacy_key = 'game_legacy_fixture_123456'
        legacy = {'libraryId':'spectrum','gameId':'game000','emulatorId':'fixture','profileId':'',
                  'label':'Game 000','systemId':'zx-spectrum','systemName':'ZX Spectrum'}
        host_path = root / 'host.json'
        host_config = json.loads(host_path.read_text(encoding='utf-8'))
        host_config['approvedGames'][legacy_key] = legacy
        host_path.write_text(json.dumps(host_config), encoding='utf-8')
        (root / 'Arcade/state.json').write_text(json.dumps({'active_collection_id':'scummvm','favourites':[],'recent':[]}), encoding='utf-8')
        data['boards'].append({'id':'zx','title':'ZX Spectrum','tabs':[{'id':'zx-tab','title':'Spectrum',
            'columns':[{'id':'zx-column','title':'Spectrum games','items':[{'id':'legacy-spectrum','type':'game',
                'title':'Game 000','gameKey':legacy_key,'systemId':'zx-spectrum','systemName':'ZX Spectrum','tags':['Games']}]}],
            'inbox':{'id':'zx-inbox','items':[]}}]})
        data['navItems'].append({'id':'nav-zx','type':'board','boardId':'zx'})
    database.write_text(json.dumps(data), encoding="utf-8")
    os.environ.update(CYRUNE_HOST_CONFIG=str(root / "host.json"), CYRUNE_ARCADE_DATA=str(root / "Arcade"),
                      CYRUNE_ARCADE_COLLECTION=str(root / "spectrum"), CYRUNE_ARCADE_COLLECTIONS_BASE=str(root),
                      CYRUNE_NEXUS_DATA=str(root / "Nexus"), PYTHONDONTWRITEBYTECODE="1")
    profile = root / "profile"
    profile.mkdir()
    browser = Marionette(bin=args.firefox, port=0, profile=str(profile), headless=True,
                         app_args=["--remote-allow-system-access"], gecko_log=str(root / "firefox.log"))
    checks = []
    def js(code):
        return browser.execute_script(code, sandbox=None)
    def wait(code, seconds=35):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if js(code):
                return
            time.sleep(0.15)
        raise AssertionError(f"Browser condition timed out: {code}")
    def element(selector):
        return browser.find_element(By.CSS_SELECTOR, selector)
    def assert_quiet_startup():
        # Include a recovery-poll interval; never dismiss an unexpected notice.
        deadline = time.monotonic() + 6
        while time.monotonic() < deadline:
            assert js("return document.getElementById('noticeOverlay').classList.contains('hidden')"), js("return document.getElementById('noticeMessage').textContent")
            time.sleep(0.15)
    try:
        browser.start_session()
        Addons(browser).install(str(REPO / "Relay"), temp=True)
        # Grant local-file access through Firefox's UI in this disposable profile.
        browser.navigate('about:addons')
        element('#category-extension').click()
        wait("return !!document.querySelector('addon-card[addon-id=\"morpheus-webhub@local\"]')")
        element('.addon-name-link').click()
        wait("return !!document.querySelector('addon-details')")
        element('#details-deck-button-permissions').click()
        element('[permission-type="file_scheme_access"]').click()
        wait("return document.querySelector('[permission-type=file_scheme_access]').pressed")
        browser.set_window_rect(width=1280, height=900)
        if args.arcade_send:
            browser.navigate((REPO / "Arcade/web/index.html").as_uri())
            wait("return document.querySelectorAll('.row-select').length >= 2")
            selected_ids = js("return [...document.querySelectorAll('.row-select')].slice(0,2).map(e=>e.dataset.id)")
            for game_id in selected_ids:
                element(f'.row-select[data-id="{game_id}"]').click()
            js("document.querySelector('.game-row').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:500,clientY:250}))")
            wait("return !!document.querySelector('[data-action=send-selected-webhub]')")
            element('[data-action=send-selected-webhub]').click()
            wait("return document.querySelector('[data-delivery-status]')?.textContent.includes('2 queued')", seconds=90)
            assert js("return document.querySelectorAll('[data-delivery-results] li').length === 2")
            assert not json.loads(database.read_text(encoding='utf-8'))['boards'][0]['tabs'][0]['inbox']['items']
            bindings = json.loads((root / 'host.json').read_text(encoding='utf-8'))['approvedGames']
            assert {binding['gameId'] for binding in bindings.values()} == set(selected_ids)
            for width, height in [(600, 800), (1280, 900)]:
                browser.set_window_rect(width=width, height=height)
                assert js("const r=document.querySelector('[data-portal-delivery] .modal').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth+1 && r.top>=0 && r.bottom<=innerHeight+1")
                (root / f'arcade-send-{width}.png').write_bytes(browser.screenshot(format='binary', full=False))
            element('[data-delivery-close]').click()
            checks.append('checked-row context action creates exact bindings and queues two games while Portal is closed')
            # Reload Relay before opening Portal: accepted deliveries must survive.
            browser.set_context('chrome')
            reloaded = browser.execute_async_script("""
                const done = arguments[arguments.length - 1];
                (async () => {
                    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
                    const addon = await AddonManager.getAddonByID('morpheus-webhub@local');
                    await addon.reload();
                    return true;
                })().then(done, error => done(String(error)));
            """)
            assert reloaded is True, reloaded
            browser.set_context('content')
            browser.navigate((REPO / 'Portal/index.html').as_uri())
            js("window.addEventListener('message', event => { if(event.data?._mw && (event.data._push || event.data._pushResponse)) { const rows=JSON.parse(document.documentElement.dataset.batchTrace||'[]'); rows.push({type:event.data.type,ok:event.data.ok,error:event.data.error}); document.documentElement.dataset.batchTrace=JSON.stringify(rows.slice(-20)); } })")
            wait("return !!document.querySelector('[data-column-id=chosen]')")
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                saved = json.loads(database.read_text(encoding='utf-8'))
                cards = saved['boards'][0]['tabs'][0]['inbox']['items']
                if len(cards) == 2:
                    break
                time.sleep(0.2)
            assert len(cards) == 2, f"Queued games were not persisted to the Inbox: {js('return document.documentElement.dataset.batchTrace')}"
            assert len({card['id'] for card in cards}) == 2
            assert {card['gameKey'] for card in cards} == set(bindings)
            browser.navigate((REPO / 'Portal/index.html').as_uri())
            wait("return !!document.querySelector('[data-column-id=chosen]')")
            assert_quiet_startup()
            saved = json.loads(database.read_text(encoding='utf-8'))
            assert len(saved['boards'][0]['tabs'][0]['inbox']['items']) == 2
            assert (root / 'spectrum/collection-metadata.json').read_bytes() == metadata_before
            checks.append('Relay restart, queued Inbox delivery, authoritative save and Portal reload without duplicates')
            print(json.dumps({'ok': True, 'browser': browser.session_capabilities.get('browserVersion'), 'checks': checks, 'artifacts': str(root)}))
            return
        browser.navigate((REPO / "Portal/index.html").as_uri())
        wait("return !!document.querySelector('[data-column-id=chosen]')")
        assert_quiet_startup()
        checks.append("authenticated native registration")
        checks.append("healthy startup without recovery or cache notices")
        if args.legacy_spectrum:
            element('.nav-item[data-id=nav-zx]').click()
            wait("return document.querySelector('#noticeOverlay').classList.contains('hidden') && document.querySelector('[data-column-id=zx-column] .game-default-system')?.textContent === '48K'")
            assert js("return document.querySelector('[data-column-id=zx-column] .game-default-language').alt") == 'English'
            assert_quiet_startup()
            browser.navigate((REPO / 'Portal/index.html').as_uri())
            wait("return document.querySelector('[data-column-id=zx-column] .game-default-system')?.textContent === '48K'")
            assert_quiet_startup()
            element('.nav-item[data-id=nav]').click()
            wait("return !!document.querySelector('[data-column-id=chosen]')")
            element('.nav-item[data-id=nav-zx]').click()
            wait("return document.querySelector('[data-column-id=zx-column] .game-default-system')?.textContent === '48K'")
            assert_quiet_startup()
            assert json.loads((root / 'Arcade/state.json').read_text(encoding='utf-8'))['active_collection_id'] == 'scummvm'
            assert json.loads((root / 'host.json').read_text(encoding='utf-8'))['approvedGames'][legacy_key] == legacy
            (root / 'portal-inactive-spectrum.png').write_bytes(browser.screenshot(format='binary', full=False))
            checks.append('Legacy Spectrum board, language/hardware badges, board switching and reload with ScummVM active; binding and active collection unchanged')
            print(json.dumps({'ok':True,'browser':browser.session_capabilities.get('browserVersion'),'checks':checks,'artifacts':str(root)}))
            return
        if args.scummvm:
            ini_before = (root / "scummvm.ini").read_bytes()
            js("document.querySelector('[data-column-id=chosen]').dispatchEvent(new MouseEvent('contextmenu', {bubbles:true,clientX:500,clientY:200}))")
            wait("return [...document.querySelectorAll('.context-menu button')].some(e => e.textContent === 'Add Game')")
            browser.find_element(By.XPATH, '//div[contains(@class,"context-menu")]/button[text()="Add Game"]').click()
            wait("return document.querySelectorAll('.arcade-picker-row').length === 50")
            element('[data-picker-query]').send_keys('ScummVM Adventure')
            wait("return document.querySelectorAll('.arcade-picker-row').length === 2")
            assert js("return document.querySelector('.arcade-picker-row').textContent.includes('2 versions')")
            element('.arcade-picker-row strong').click()
            assert js("return document.querySelectorAll('.arcade-picker-row input:checked').length === 1")
            element('.arcade-picker-row button').click()
            wait("return document.querySelector('[data-picker-detail]').textContent.includes('ScummVM Adventure')")
            element('[data-picker-add]').click()
            wait("return document.querySelector('[data-picker-status]').textContent.includes('1 games saved; 0')")
            cards = json.loads(database.read_text(encoding='utf-8'))['boards'][0]['tabs'][0]['columns'][0]['items']
            assert len(cards) == 1 and cards[0]['systemId'] == 'dos'
            assert not any(word in json.dumps(cards) for word in ('scummvm.ini', 'targetId', 'arguments', 'fixture.exe', 'catalogueId'))
            element('[data-picker-close]').click()
            browser.navigate((REPO / 'Portal/index.html').as_uri())
            wait("return document.querySelectorAll('[data-column-id=chosen][data-item-type=game] .game-scummvm-icon').length === 1")
            wait("return [...document.querySelectorAll('[data-column-id=chosen][data-item-type=game] .game-default-icon')].map(img => img.alt).join('/') === 'English/DOS'")
            assert_quiet_startup()
            checks.append('one picker entry per game; remakes stay separate; one compact shortcut survives disk save and reload')
            for width, height in [(600, 800), (1280, 900)]:
                browser.set_window_rect(width=width, height=height)
                js("document.querySelector('[data-column-id=chosen][data-item-type=game]').dispatchEvent(new MouseEvent('mouseover', {bubbles:true}))")
                wait("return document.querySelectorAll('#tooltip .game-tooltip-language').length === 2 && [...document.querySelectorAll('#tooltip img, .game-scummvm-icon')].every(img => img.complete && img.naturalWidth > 0)")
                assert set(js("return [...document.querySelectorAll('#tooltip .game-tooltip-language')].map(img => img.alt)")) == {'English', 'German'}
                assert js("return document.querySelector('#tooltip .game-tooltip-system').textContent === 'DOS / Windows'")
                js("document.body.dispatchEvent(new MouseEvent('mouseover', {bubbles:true}))")
            js("document.querySelector('[data-column-id=chosen][data-item-type=game]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:350,clientY:220}))")
            wait("return [...document.querySelectorAll('.context-menu button')].some(e => e.textContent === 'Launch Version…')")
            browser.find_element(By.XPATH, '//div[contains(@class,"context-menu")]/button[text()="Launch Version…"]').click()
            wait("return document.querySelectorAll('.game-version-row').length === 2")
            for width, height in [(600, 800), (1280, 900)]:
                browser.set_window_rect(width=width, height=height)
                assert js("const r=document.querySelector('.game-versions-modal').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth+1 && r.height<=innerHeight+1")
                (root / f'portal-game-versions-{width}.png').write_bytes(browser.screenshot(format='binary', full=False))
            element('.game-version-row:nth-child(2) button:last-child').click()
            wait("return document.querySelector('[data-version-status]').textContent === 'Default saved.'")
            assert js("return document.querySelector('.game-version-row:nth-child(2) strong').textContent === 'Default'")
            assert (root / 'Arcade/game-version-defaults.json').is_file()
            element('[data-version-close]').click()
            wait("return [...document.querySelectorAll('[data-column-id=chosen][data-item-type=game] .game-default-icon')].map(img => img.alt).join('/') === 'German/Windows'")
            assert js("const icons=document.querySelector('[data-column-id=chosen][data-item-type=game] .game-default-icons'); const lock=icons.parentElement.querySelector('.item-lock-btn'); const expected=lock ? lock.getBoundingClientRect().left-parseFloat(getComputedStyle(icons.parentElement).gap) : icons.parentElement.getBoundingClientRect().right; return Math.abs(icons.getBoundingClientRect().right-expected)<2")
            (root / 'portal-default-version-icons.png').write_bytes(browser.screenshot(format='binary', full=False))
            checks.append('Portal version chooser and shared default selection; language/platform options and responsive modal')
            # Exercise the collection query used by Open in Arcade; process launch
            # itself is checked with the joined native mocked-process fixture.
            browser.set_window_rect(width=1920, height=1000)
            browser.navigate((REPO / 'Arcade/web/index.html').as_uri() + '?collection=scummvm')
            wait("return document.querySelectorAll('.row-select').length === 2 && document.querySelector('#platform-select').value === 'scummvm'")
            assert js("return document.querySelector('#platform-select').value") == 'scummvm'
            assert js("return document.querySelector('#emulator').value") == 'scummvm'
            assert js("return [...document.querySelectorAll('#collection-select option')].filter(option => option.value && !option.disabled && !option.value.startsWith('__')).map(option => option.value)") == ['scummvm']
            assert js("return document.querySelector('.game-row:first-child .col-cell-publisher').textContent") == 'LucasArts'
            assert js("return document.querySelector('.game-row:first-child .col-cell-series').textContent") == 'The Secret of Monkey Island'
            element('#column-options').click()
            js("const width=document.querySelector('[data-column=series] [data-column-width]'); width.value='210'; width.dispatchEvent(new Event('input',{bubbles:true}))")
            element('.column-modal [data-action=apply]').click()
            js("const platform=document.querySelector('#platform-select'); platform.value='zx-spectrum'; platform.dispatchEvent(new Event('change',{bubbles:true}))")
            wait("return document.querySelector('#platform-select').value === 'zx-spectrum' && document.querySelectorAll('.row-select').length > 2 && document.querySelector('#busy-overlay').classList.contains('hidden')")
            assert js("return document.querySelector('col[data-col=series]').style.width") == '150px'
            assert js("return document.querySelector('#emulator').value") == 'fixture'
            assert 'scummvm' not in js("return [...document.querySelectorAll('#emulator option')].map(option => option.value)")
            assert js("return [...document.querySelectorAll('.game-row:first-child .game-system-badge')].map(badge => badge.textContent)") == ['48K', '128K']
            assert js("return [...document.querySelectorAll('.game-row:first-child .game-version-flags img')].map(img => img.alt)") == ['German', 'English']
            (root / 'arcade-spectrum-systems.png').write_bytes(browser.screenshot(format='binary', full=False))
            assert 'scummvm' not in js("return [...document.querySelectorAll('#collection-select option')].map(option => option.value)")
            js("const platform=document.querySelector('#platform-select'); platform.value='scummvm'; platform.dispatchEvent(new Event('change',{bubbles:true}))")
            wait("return document.querySelectorAll('.row-select').length === 2 && document.querySelector('#busy-overlay').classList.contains('hidden')")
            assert js("return document.querySelector('col[data-col=series]').style.width") == '210px'
            assert js("return document.querySelector('#emulator').value") == 'scummvm'
            browser.navigate((REPO / 'Arcade/web/index.html').as_uri() + '?collection=scummvm')
            wait("return document.querySelectorAll('.row-select').length === 2 && document.querySelector('#platform-select').value === 'scummvm'")
            assert js("return document.querySelector('col[data-col=series]').style.width") == '210px'
            checks.append('ScummVM publisher/series metadata, separate platform/collection selectors and platform column widths surviving switches and reload')
            # Manual preview exercises the same Apply route without provider credentials.
            element('.game-row:first-child .col-cell-title').click()
            wait("return !!document.querySelector('#scrape-metadata')")
            element('#scrape-metadata').click()
            wait("return !!document.querySelector('.scrape-modal [data-scrape-match]') && !document.querySelector('.scrape-modal [data-action=apply]').disabled")
            (root / 'scummvm-scrape-apply.png').write_bytes(browser.screenshot(format='binary', full=False))
            element('.scrape-modal [data-action=apply]').click()
            wait("return !document.querySelector('.scrape-modal') && document.querySelector('#busy-overlay').classList.contains('hidden')")
            override_files = list((root / 'Arcade/scummvm-overrides').glob('*.json'))
            assert len(override_files) == 1
            saved_override = override_files[0].read_bytes()
            assert len(json.loads(saved_override)['games']) == 1
            assert (root / 'scummvm.ini').read_bytes() == ini_before
            browser.navigate((REPO / 'Arcade/web/index.html').as_uri() + '?collection=scummvm')
            wait("return document.querySelectorAll('.row-select').length === 2 && document.querySelector('#platform-select').value === 'scummvm'")
            assert override_files[0].read_bytes() == saved_override
            checks.append('ScummVM scraper Apply enabled, native override saved and reload passed without changing the ScummVM INI')
            wait("return [...document.querySelectorAll('.game-platform-icon')].every(img => img.complete && img.naturalWidth > 0)")
            assert set(js("return [...document.querySelectorAll('.game-row:first-child .game-platform-icon')].map(img => img.alt)")) == {'DOS', 'Windows'}
            assert js("return document.querySelector('.game-row:nth-child(2) .game-platform-icon').alt") == 'Steam edition'
            row_heights = js("return [...document.querySelectorAll('.game-row')].map(row => { const height=row.getBoundingClientRect().height; const icons=row.querySelector('.game-platform-icons'); icons.style.display='none'; const baseline=row.getBoundingClientRect().height; icons.style.display=''; return {height,baseline}; })")
            assert all(row['height'] <= row['baseline'] + .1 for row in row_heights), row_heights
            (root / 'arcade-platform-column.png').write_bytes(browser.screenshot(format='binary', full=False))
            # Render every local badge at its actual column size for visual QA.
            badges = [('dos', 'png'), ('windows', 'png'), ('amiga', 'png'), ('fm-towns', 'png'),
                      ('atari-st', 'png'), ('macintosh', 'png'), ('zx-spectrum', 'png'), ('steam', 'svg'), ('unknown', 'svg')]
            preview = ''.join(f'<div style="display:flex;align-items:center;gap:16px;margin:12px"><img class="game-platform-icon{ " game-platform-steam" if name == "steam" else ""}" src="assets/platforms/{name}.{ext}" alt="{name}"><span>{name}</span></div>' for name, ext in badges)
            js("const preview=document.createElement('div'); preview.id='platform-preview'; preview.style='position:fixed;inset:100px auto auto 80px;z-index:99999;background:#17212c;padding:24px;color:white'; preview.innerHTML=" + json.dumps(preview) + "; document.body.append(preview)")
            wait("return [...document.querySelectorAll('#platform-preview img')].every(img => img.complete && img.naturalWidth > 0)")
            (root / 'arcade-platform-icons.png').write_bytes(browser.screenshot(format='binary', full=False))
            js("document.querySelector('#platform-preview').remove()")
            checks.append('local platform badges load; grouped DOS/Windows icons and explicit Steam with unspecified OS; all platform icons captured at column size')
            js("document.querySelector('.game-row').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:450,clientY:220}))")
            wait("return !!document.querySelector('[data-action=launch-version]')")
            assert js("return [...document.querySelectorAll('.context-menu [data-emulator]')].map(button => button.dataset.emulator)") == ['scummvm']
            element('[data-action=launch-version]').click()
            wait("return document.querySelectorAll('.game-version-row').length === 2")
            assert js("return document.querySelector('.game-version-row:nth-child(2) strong').textContent === 'Default'")
            assert js("return document.querySelectorAll('.game-row:first-child .game-version-flags img').length === 2")
            assert js("return [...document.querySelectorAll('.game-row:first-child .game-version-flags img')].map(img => img.alt)") == ['German', 'English']
            (root / 'arcade-game-versions.png').write_bytes(browser.screenshot(format='binary', full=False))
            element('.game-version-row:first-child button:last-child').click()
            wait("return document.querySelector('[data-version-status]').textContent.includes('Default saved')")
            element('[data-version-close]').click()
            for index in (1, 2):
                element(f'.game-row:nth-child({index}) .row-select').click()
            js("document.querySelector('.game-row').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:500,clientY:250}))")
            wait("return !!document.querySelector('[data-action=send-selected-webhub]')")
            element('[data-action=send-selected-webhub]').click()
            wait("return document.querySelector('[data-delivery-status]')?.textContent.includes('2 queued')", seconds=90)
            (root / 'scummvm-arcade-send.png').write_bytes(browser.screenshot(format='binary', full=False))
            browser.navigate((REPO / 'Portal/index.html').as_uri())
            js("window.addEventListener('message', event => { if(event.data?._mw && (event.data._push || event.data._pushResponse)) { const rows=JSON.parse(document.documentElement.dataset.batchTrace||'[]'); rows.push({type:event.data.type,ok:event.data.ok,error:event.data.error}); document.documentElement.dataset.batchTrace=JSON.stringify(rows.slice(-20)); } })")
            wait("return document.querySelectorAll('[data-column-id=chosen][data-item-type=game]').length === 1")
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                inbox = json.loads(database.read_text(encoding='utf-8'))['boards'][0]['tabs'][0]['inbox']['items']
                if len(inbox) == 2:
                    break
                time.sleep(.15)
            assert len(inbox) == 2 and {card['title'] for card in inbox} == {'ScummVM Adventure', 'ScummVM Adventure Deluxe'}, f"Inbox delivery trace: {js('return document.documentElement.dataset.batchTrace')}"
            assert (root / 'scummvm.ini').read_bytes() == ini_before
            checks.append('Arcade sees the Portal default, can change it, shows flags and separate remakes, and sends one shortcut per game to Portal Inbox')
            js("document.querySelector('[data-column-id=chosen]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:500,clientY:200}))")
            wait("return [...document.querySelectorAll('.context-menu button')].some(button => button.textContent === 'Add Game')")
            browser.find_element(By.XPATH, '//div[contains(@class,"context-menu")]/button[text()="Add Game"]').click()
            wait("return !!document.querySelector('[data-picker-query]')")
            element('[data-picker-query]').send_keys('Game 000')
            wait("return document.querySelectorAll('.arcade-picker-row').length > 0 && [...document.querySelectorAll('.arcade-picker-row strong')].every(title => title.textContent === 'Game 000')")
            element('.arcade-picker-row strong').click()
            element('[data-picker-add]').click()
            wait("return document.querySelector('[data-picker-status]').textContent.includes('1 games saved; 0')")
            element('[data-picker-close]').click()
            wait("return !!document.querySelector('[data-column-id=chosen] .game-spectrum-icon')")
            for hardware, language in [('48K', 'English'), ('128K', 'German')]:
                js("document.querySelector('[data-column-id=chosen] .game-spectrum-icon').closest('[data-item-type=game]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:500,clientY:250}))")
                wait("return [...document.querySelectorAll('.context-menu button')].some(button => button.textContent === 'Launch Version…')")
                browser.find_element(By.XPATH, '//div[contains(@class,"context-menu")]/button[text()="Launch Version…"]').click()
                wait("return document.querySelectorAll('.game-version-row').length === 2")
                js("[...document.querySelectorAll('.game-version-row')].find(row => row.querySelector('.game-version-label').textContent.includes(" + json.dumps(hardware) + ")).querySelector('button:last-child').click()")
                wait("return document.querySelector('[data-version-status]').textContent === 'Default saved.'")
                element('[data-version-close]').click()
                wait("const row=document.querySelector('[data-column-id=chosen] .game-spectrum-icon').closest('[data-item-type=game]'); return row.querySelector('.game-default-system')?.textContent === " + json.dumps(hardware) + " && row.querySelector('.game-default-language')?.alt === " + json.dumps(language))
            (root / 'portal-spectrum-default.png').write_bytes(browser.screenshot(format='binary', full=False))
            assert (root / 'spectrum/collection-metadata.json').read_bytes() == metadata_before
            checks.append('Spectrum icon matches Arcade; English/48K and German/128K defaults update without source metadata writes')
            print(json.dumps({'ok': True, 'browser': browser.session_capabilities.get('browserVersion'), 'checks': checks, 'artifacts': str(root)}))
            return
        # Open via the actual column context-menu event and its rendered action.
        wait("return !!document.querySelector('[data-column-id=chosen]')")
        js("document.querySelector('[data-column-id=chosen]').dispatchEvent(new MouseEvent('contextmenu', {bubbles:true,clientX:500,clientY:200}))")
        wait("return [...document.querySelectorAll('.context-menu button')].some(e => e.textContent === 'Add Game')")
        browser.find_element(By.XPATH, '//div[contains(@class,"context-menu")]/button[text()="Add Game"]').click()
        wait("return document.querySelectorAll('.arcade-picker-row').length === 50")
        assert js("return document.querySelector('[data-picker-query]').value === ''")
        checks.append("column action and first page")
        query_started = time.perf_counter()
        element('[data-picker-query]').send_keys('Game 00')
        wait(f"return document.querySelectorAll('.arcade-picker-row').length === {expected_matches}")
        query_seconds = round(time.perf_counter() - query_started, 3)
        # Click title text in the SECOND row, then verify its exact checkbox.
        element('.arcade-picker-row:nth-child(2) strong').click()
        assert js("return document.querySelector('.arcade-picker-row:nth-child(2) input').checked")
        element('.arcade-picker-row:nth-child(2) input').send_keys(Keys.SPACE)
        assert js("return !document.querySelector('.arcade-picker-row:nth-child(2) input').checked")
        element('.arcade-picker-row input').send_keys(Keys.SPACE)
        assert js("return document.activeElement.matches('.arcade-picker-row input')")
        element('[data-picker-query]').send_keys(Keys.CONTROL, 'a', Keys.NULL, Keys.BACK_SPACE)
        wait("return document.querySelectorAll('.arcade-picker-row').length === 50")
        checks.append("typed search and second-result title selection")
        element('[data-picker-more]').click()
        wait("return document.querySelectorAll('.arcade-picker-row').length === 100")
        assert 'Selected games (1)' in element('[data-picker-selection-summary]').text
        checks.append("keyboard selection survives paging")
        element('.arcade-picker-row button').click()
        wait("return !!document.querySelector('[data-picker-detail] img')")
        (root / "picker-desktop.png").write_bytes(browser.screenshot(format="binary", full=False))
        for width, height in [(600, 800), (1280, 900)]:
            browser.set_window_rect(width=width, height=height)
            assert js("const r=document.querySelector('.arcade-game-picker').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth+1 && r.height<=innerHeight+1")
            assert js("return document.querySelector('[data-picker-detail]').getBoundingClientRect().height >= 100")
            (root / f"picker-{width}.png").write_bytes(browser.screenshot(format="binary", full=False))
        checks.append("artwork and responsive layout")
        element('[data-picker-close]').click()
        wait("return !document.querySelector('.arcade-game-picker')")
        assert not (root / "catalogue-bindings.json").exists()
        assert (root / "spectrum/collection-metadata.json").read_bytes() == metadata_before
        assert not json.loads(database.read_text(encoding="utf-8"))["boards"][0]["tabs"][0]["columns"][0]["items"]
        checks.append("cancel leaves cards and bindings untouched")
        js("document.querySelector('[data-column-id=chosen]').dispatchEvent(new MouseEvent('contextmenu', {bubbles:true,clientX:500,clientY:200}))")
        browser.find_element(By.XPATH, '//div[contains(@class,"context-menu")]/button[text()="Add Game"]').click()
        wait("return document.querySelectorAll('.arcade-picker-row').length === 50")
        if args.selection == 100:
            element('[data-picker-more]').click()
            wait("return document.querySelectorAll('.arcade-picker-row').length === 100")
        for _ in range(args.selection):
            element('.arcade-picker-row input:not(:checked)').click()
        if args.selection == 2:
            element('[data-picker-tags]').click()
        element('[data-picker-add]').click()
        wait(f"return document.querySelector('[data-picker-status]').textContent.includes('{args.selection} games saved; 0')")
        saved = json.loads(database.read_text(encoding="utf-8"))
        cards = saved["boards"][0]["tabs"][0]["columns"][0]["items"]
        assert len(cards) == args.selection and len({card['gameKey'] for card in cards}) == args.selection
        assert all(bool(card["tags"]) == (args.selection == 2) for card in cards)
        assert "catalogueId" not in json.dumps(cards) and ".tap" not in json.dumps(cards)
        assert (root / "spectrum/collection-metadata.json").read_bytes() == metadata_before
        element('[data-picker-close]').click()
        browser.navigate((REPO / "Portal/index.html").as_uri())
        wait(f"return document.querySelectorAll('[data-column-id=chosen][data-item-type=game]').length==={args.selection}")
        assert_quiet_startup()
        checks.append("native binding, disk save and reload")
        checks.append("healthy reload without recovery or cache notices")
        print(json.dumps({"ok": True, "browser": browser.session_capabilities.get('browserVersion'), "entries": args.entries, "selection": args.selection,
                          "typedSearchSeconds": query_seconds, "checks": checks, "artifacts": str(root)}))
    except Exception:
        try:
            (root / "failure.png").write_bytes(browser.screenshot(format="binary", full=False))
            print(json.dumps({"ok": False, "checks": checks, "artifacts": str(root), "page": js("return document.body.innerText.slice(-1500)")}))
        except Exception:
            print(json.dumps({"ok": False, "checks": checks, "artifacts": str(root)}))
        raise
    finally:
        browser.cleanup()
        # Release mozprofile objects while Python's import machinery still exists.
        import gc
        browser = None
        gc.collect()


if __name__ == "__main__":
    main()
