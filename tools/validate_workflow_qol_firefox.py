"""Search, reviewed intake and named views in disposable Firefox/native data.

Requires marionette-driver and the installed native host registration. Never
launches media; all database, bindings and collection writes use a temporary root.
"""
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
    root = Path(tempfile.mkdtemp(prefix='Cyrune-QoL-Firefox-'))
    spec = importlib.util.spec_from_file_location('qol_fixture', REPO / 'tests/migration/test_catalogue_workflow.py')
    fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture)
    fixture.prepare_fixture(root, prepared=False)
    database = root / 'portal.json'
    database.write_text(json.dumps({
        'schemaVersion': 7, 'hubName': 'Workflow acceptance', 'activeBoardId': 'board', 'activeTabId': 'tab',
        'boards': [{'id': 'board', 'title': 'Home', 'tabs': [{'id': 'tab', 'title': 'Main',
            'columns': [{'id': 'chosen', 'title': 'Reading', 'items': [
                {'id': 'old', 'type': 'bookmark', 'title': 'Existing docs', 'url': 'https://docs.example/old'},
                {'id': 'folder', 'type': 'folder', 'title': 'Games', 'children': []}]}],
            'inbox': {'id': 'inbox-tab', 'items': [
                {'id': 'new', 'type': 'bookmark', 'title': 'New docs', 'url': 'https://docs.example/new'},
                {'id': 'review', 'type': 'bookmark', 'title': 'Review docs', 'url': 'https://docs.example/review'},
                {'id': 'match', 'type': 'bookmark', 'title': 'Matched news', 'url': 'https://news.example/article'}]}}], 'speedDial': []}],
        'navItems': [{'id': 'nav', 'type': 'board', 'boardId': 'board', 'title': 'Home'}],
        'essentials': [], 'tags': [], 'settings': {'activeThemeName': 'dark'},
        'automationRules': [{'id': 'news', 'name': 'News rule', 'conditions': {'hostname': 'news.example'},
                             'actions': {'titlePrefix': '[News] '}}]
    }), encoding='utf-8')
    os.environ.update(CYRUNE_HOST_CONFIG=str(root / 'host.json'), CYRUNE_ARCADE_DATA=str(root / 'Arcade'),
                      CYRUNE_ARCADE_COLLECTION=str(root / 'spectrum'), CYRUNE_ARCADE_COLLECTIONS_BASE=str(root),
                      CYRUNE_NEXUS_DATA=str(root / 'Nexus'), PYTHONDONTWRITEBYTECODE='1')
    profile = root / 'profile'
    profile.mkdir()
    browser = Marionette(bin=r'C:\Program Files\Mozilla Firefox\firefox.exe', port=0, profile=str(profile),
                         headless=True, app_args=['--remote-allow-system-access'], gecko_log=str(root / 'firefox.log'))

    def js(code):
        if browser.execute_script('return location.protocol', sandbox=None) != 'file:':
            return browser.execute_script(code, sandbox=None)
        return browser.execute_script('return window.eval(arguments[0])',
                                      script_args=[f'(function(){{{code}}})()'], sandbox=None)

    def wait(code, seconds=35):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if js(code):
                return
            time.sleep(.15)
        detail = js("return {notice:document.querySelector('#noticeMessage')?.textContent,errors:window.qolErrors||[]}")
        raise AssertionError(f'Timed out: {code}; {detail}')

    def element(selector):
        return browser.find_element(By.CSS_SELECTOR, selector)

    checks = []
    try:
        browser.start_session()
        Addons(browser).install(str(REPO / 'Relay'), temp=True)
        browser.navigate('about:addons')
        element('#category-extension').click()
        wait('return !!document.querySelector(\'addon-card[addon-id="morpheus-webhub@local"]\')')
        element('.addon-name-link').click()
        wait("return !!document.querySelector('addon-details')")
        element('#details-deck-button-permissions').click()
        element('[permission-type="file_scheme_access"]').click()
        wait("return document.querySelector('[permission-type=file_scheme_access]').pressed")
        browser.set_window_rect(width=1280, height=900)
        browser.navigate((REPO / 'Portal/index.html').as_uri())
        wait("return document.querySelector('[data-column-id=chosen]') && bridge.storageIsAvailable()")
        js("openSearchModal({query:'Game 00'})")
        wait("return document.querySelectorAll('[data-catalogue-focus]').length >= 2")
        assert js("return !!document.querySelector('#searchModal [data-search-action]')")
        element('[data-catalogue-focus]').click()
        wait("return !!document.querySelector('.search-placement-dialog')")
        js("const s=document.querySelector('.search-placement-dialog select');s.value=[...s.options].find(o=>o.textContent.endsWith('/ Games')).value")
        element('.search-placement-dialog button').click()
        wait("return document.querySelector('#noticeMessage')?.textContent.includes('Game added')")
        wait("return JSON.stringify(state.boards).includes('game_')")
        assert js("return state.boards[0].tabs[0].columns[0].items.find(i=>i.id==='folder').children.length === 1")
        js("document.querySelector('#noticeOverlay')?.classList.add('hidden'); closeSearchModal();openSearchModal({query:'docs'})")
        wait("return document.querySelectorAll('#searchModalResults [data-search-action]').length >= 2")
        element('#searchModalInput').send_keys(Keys.ARROW_DOWN)
        assert js("return document.activeElement.matches('[data-search-action]')")
        (root / 'search-wide.png').write_bytes(browser.screenshot(format='binary', full=False))
        # Exercise the browser's drag/drop event pipeline into an exact folder.
        js("""window.qolErrors=[];window.addEventListener('error',event=>window.qolErrors.push(event.message));
          const row=document.querySelector('#searchModalResults [data-bookmark-id=new]');
          const transfer=new DataTransfer();row.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
          const folder=document.querySelector('#boardColumns [data-item-id=folder]') || document.querySelector('[data-item-id=folder]');
          folder.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));
          folder.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));""")
        wait("return state.boards[0].tabs[0].columns[0].items.find(i=>i.id==='folder').children.some(i=>i.id==='new')")
        wait('return !sharedDiskSaveIsPending()')
        checks.append('Unified search: authenticated catalogue Add to folder, keyboard navigation and local drag/drop')
        js("openSearchModal({query:'@gh stars & sky'})")
        assert js("return document.querySelector('.unified-search-action').textContent==='Search GitHub: stars & sky'")
        js("closeSearchModal(); activePhaseTwoSection='automation';showHubToolsPanel('workflows')")
        wait("return !!document.querySelector('.phase2-intake-review')")
        review = js("return document.querySelector('.phase2-intake-review').textContent")
        assert 'Review docs' in review and 'Move to Home / Main / Reading' in review, review
        wait("return !document.querySelector('[data-review-suggested=chosen]').disabled && document.querySelector('[data-review-suggested=chosen]').getClientRects().length > 0")
        element('[data-review-suggested=chosen]').click()
        wait("return !state.boards[0].tabs[0].inbox.items.some(i=>i.id==='review')")
        wait("return document.querySelector('.phase2-intake-review').textContent.includes('Every bookmark matched')")
        js("const s=document.querySelector('.phase2-intake-review').previousElementSibling;s.value='all';s.dispatchEvent(new Event('change'))")
        assert js("return document.querySelector('.phase2-intake-review').textContent.includes('Why did this match?')")
        (root / 'intake-review.png').write_bytes(browser.screenshot(format='binary', full=False))
        checks.append('Inbox review suggests an exact-host destination, saves its explicit move and explains a matching rule')
        browser.navigate((REPO / 'Arcade/web/index.html').as_uri())
        wait("return document.querySelectorAll('.game-row').length > 0 && !state.collectionSwitchPending && document.querySelector('#busy-overlay').classList.contains('hidden')")
        js("document.querySelector('#search').value='Game 00';document.querySelector('#search').dispatchEvent(new Event('input'));state.sortRules=[{key:'title',dir:'desc'}];applyFilters()")
        element('#save-view').click()
        element('[data-view-name]').send_keys('My games')
        element('[data-view-save]').click()
        assert js("return !document.querySelector('[data-view-name]')"), js("return document.querySelector('[data-view-message]')?.textContent")
        element('#clear-filters').click()
        js("const s=document.querySelector('#saved-view');s.value=[...s.options].find(o=>o.textContent==='My games').value;s.dispatchEvent(new Event('change'))")
        assert js("return document.querySelector('#search').value==='Game 00' && state.sortRules[0].dir==='desc'"), js("return {query:els.search.value,sort:state.sortRules,saved:savedViewStore().list(collectionPlatform(state.activeCollection)),pending:state.collectionSwitchPending}")
        browser.navigate((REPO / 'Arcade/web/index.html').as_uri())
        wait("return [...document.querySelector('#saved-view').options].some(o=>o.textContent==='My games')")
        assert js("return document.querySelector('#saved-view').selectedOptions[0].textContent==='My games' && state.sortRules[0].dir==='desc'")
        for width in (1280, 600):
            browser.set_window_rect(width=width, height=900)
            (root / f'arcade-views-{width}.png').write_bytes(browser.screenshot(format='binary', full=False))
        checks.append('Arcade view save, restore, sort and reload persistence at wide and narrow widths')
        persisted = json.loads(database.read_text(encoding='utf-8'))
        assert 'game_' in json.dumps(persisted)
        assert str(root) not in json.dumps(persisted['boards'])
        print(json.dumps({'ok': True, 'checks': checks, 'artifacts': str(root)}))
    finally:
        browser.cleanup()


if __name__ == '__main__':
    main()
