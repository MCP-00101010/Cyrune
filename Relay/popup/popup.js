'use strict';

function isPotentialHubPage(url = '') {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:'
      || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname));
  } catch {
    return false;
  }
}

function timerStatusText(status, action) {
  if (!status) return '';
  if (status.reason === 'Off' && !status.lastAt && !status.lastSkip) return '';
  let text = status.reason || '';
  if (text === 'Waiting' && status.nextAt) text = `Next ${action} in ${Math.max(0, Math.ceil((status.nextAt - Date.now()) / 1000))}s`;
  if (status.lastAt) text += ` · Last ${new Date(status.lastAt).toLocaleTimeString()}`;
  if (status.lastSkip) text += ` · Skipped: ${status.lastSkip.toLowerCase()}`;
  return text;
}

function pollTimerStatus(read, node, action) {
  let stopped = false, timer;
  async function update() {
    try { const result = await read(); if (result?.ok !== true) throw new Error('Status unavailable'); if (!stopped) node.textContent = timerStatusText(result.status, action); }
    catch { if (!stopped) node.textContent = 'Status unavailable'; }
    if (!stopped) timer = setTimeout(update, 1000);
  }
  void update();
  window.addEventListener('unload', () => { stopped = true; clearTimeout(timer); }, { once: true });
}

async function ensureActiveHubRelay(tab) {
  if (tab?.id === undefined || !isPotentialHubPage(tab.url || '')) return { attempted: false, ready: false, error: '' };
  let discovered = await browser.tabs.sendMessage(tab.id, { type: 'MW_DISCOVER' }).catch(() => null);
  if (discovered?.isMorpheus && discovered?.registered !== false) return { attempted: false, ready: true, error: '' };
  try {
    // Opening the browser-action popup grants activeTab access to this tab,
    // providing a reliable fallback when Firefox has not applied the manifest
    // content script to a local file page.
    await browser.tabs.executeScript(tab.id, { runAt: 'document_idle', file: '/content.js' });
    discovered = await browser.tabs.sendMessage(tab.id, { type: 'MW_DISCOVER' }).catch(() => null);
    return discovered?.isMorpheus && discovered?.registered !== false
      ? { attempted: true, ready: true, error: '' }
      : { attempted: true, ready: false, error: 'The relay was injected but did not identify the Hub page.' };
  } catch (error) {
    return { attempted: true, ready: false, error: error?.message || String(error) };
  }
}

function setupRelayPopupNavigation(mode = 'send') {
  const navigation = document.getElementById('relayNavigation');
  if (!navigation) return;
  const categories = mode === 'refresh'
    ? [['timers', 'Timers'], ['activity', 'Activity'], ['blocking', 'Blocking']]
    : [['send', 'Send to Portal'], ['focus', 'Focus & activity'], ['browser', 'Browser tools']];
  const panes = [...document.querySelectorAll('[data-relay-pane]')];
  const buttons = [];
  function select(id, focus = false) {
    panes.forEach(pane => { pane.hidden = pane.dataset.relayPane !== id; });
    buttons.forEach(button => {
      if (button.dataset.relayCategory === id) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelector('.relay-content').scrollTop = 0;
    if (focus) buttons.find(button => button.dataset.relayCategory === id)?.focus();
  }
  categories.forEach(([id, label], index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.dataset.relayCategory = id;
    button.addEventListener('click', () => select(id));
    button.addEventListener('keydown', event => {
      const offsets = {ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1};
      let next;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = categories.length - 1;
      else if (Object.hasOwn(offsets, event.key)) next = (index + offsets[event.key] + categories.length) % categories.length;
      else return;
      event.preventDefault(); select(categories[next][0], true);
    });
    buttons.push(button); navigation.appendChild(button);
  });
  select(categories[0][0]);
}

async function main() {
  if (window.location?.search === '?view=timers') { document.body.classList.add('timers-view');document.querySelector('header .title').textContent='Tab timers';await setupTimerOverview();return; }
  if (window.location?.search?.startsWith('?view=blocked&')) {
    document.body.classList.add('blocked-view');
    document.title = 'Site blocked · Cyrune Relay';
    const result = await browser.runtime.sendMessage({ type: 'CYRUNE_BLOCK_STATUS' }).catch(() => null);
    document.getElementById('blockedReason').textContent = result?.ok ? result.reason || 'This site is available again. Open it when you are ready.' : 'Site access is restricted. Review Timer & Activity Tracker.';
    document.getElementById('blockedDomain').textContent = result?.domain || '';
    return;
  }
  if (window.location?.search === '?view=refresh') {
    setupTimerOverviewLink();
    document.body.classList.add('refresh-popup');
    setupRelayPopupNavigation('refresh');
    document.querySelector('header .title').textContent = 'Timer & Activity Tracker';
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    await setupBrowserUtilities(tab);
    await setupSiteControls(tab);
    await setupTabUnload(tab);
    await setupTimerPauses(tab);
    pollTimerStatus(() => browser.runtime.sendMessage({type:'CYRUNE_BROWSER_UTILITIES',action:'state',tabId:tab?.id}), document.getElementById('refreshStatus'), 'reload');
    pollTimerStatus(() => browser.runtime.sendMessage({type:'CYRUNE_TAB_UNLOAD',action:'state',tabId:tab?.id}), document.getElementById('unloadStatus'), 'unload');
    return;
  }
  setupTimerOverviewLink();
  setupRelayPopupNavigation();
  const elMorpheus = document.getElementById('statusMorpheus');
  const elVersion  = document.getElementById('statusVersion');
  const elNative   = document.getElementById('statusNative');
  const elPending  = document.getElementById('statusPending');
  const elPath     = document.getElementById('statusPath');
  const elDetail   = document.getElementById('statusDetail');
  const tabInfo    = document.getElementById('tabInfo');
  const tabTitle   = document.getElementById('tabTitle');
  const tabUrl     = document.getElementById('tabUrl');
  const targetPicker = document.getElementById('targetPicker');
  const targetBoard = document.getElementById('targetBoard');
  const targetTab   = document.getElementById('targetTab');
  const sendBtn    = document.getElementById('sendBtn');
  const sendToTabBtn = document.getElementById('sendToTabBtn');
  const importBtn  = document.getElementById('importBtn');
  const feedback   = document.getElementById('feedback');
  const storageChoice = document.getElementById('storageChoice');
  const useRelayStorageBtn = document.getElementById('useRelayStorageBtn');

  const manifestVersion = browser.runtime.getManifest?.()?.version || '';
  if (elVersion) elVersion.textContent = manifestVersion ? `Extension version ${manifestVersion}` : 'Extension version unavailable';

  function setRow(el, text, cls) {
    el.textContent = text;
    el.className = 'status-row ' + (cls || '');
  }

  function showFeedback(text, cls) {
    feedback.textContent = text;
    feedback.className = 'feedback ' + (cls || '');
  }

  // Current active tab.
  const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
  void setupNativeMenuControls(currentTab);
  void setupBrowserUtilities(currentTab);
  void setupProductivityControls();
  const isReal = currentTab?.url &&
    !currentTab.url.startsWith('about:') &&
    !currentTab.url.startsWith('moz-extension:');

  if (isReal) {
    tabTitle.textContent = currentTab.title || 'Untitled';
    tabUrl.textContent   = currentTab.url;
    tabInfo.classList.remove('hidden');
  }

  // Extension status.
  let morpheusOpen = false;
  let nativeAvailable = false;
  let databasePath = null;
  let nativeError = '';
  let hubRelayError = '';
  let extensionId = '';
  let storageInfoReady = false;
  let storageMode = 'unselected';
  let authoritativeStorageAvailable = false;
  let authoritySelectionRequired = false;
  let fileSchemeAccess = null;
  let fileSchemeAccessRequired = false;
  let pendingIntake = 0;
  let sending = false;
  let refreshInFlight = null;
  let statusPollTimer = null;
  let targetBoards = [];
  let targetsLoaded = false;
  let targetsInFlight = null;

  function findSelectedTarget() {
    const board = targetBoards.find(item => item.id === targetBoard.value);
    const tab = board?.tabs?.find(item => item.id === targetTab.value);
    return board && tab ? { board, tab } : null;
  }

  function replaceOptions(select, options, selectedValue = '') {
    select.innerHTML = '';
    for (const optionData of options) {
      const option = document.createElement('option');
      option.value = optionData.id;
      option.textContent = optionData.title;
      select.appendChild(option);
    }
    if (options.some(option => option.id === selectedValue)) select.value = selectedValue;
  }

  async function rememberTarget() {
    const target = findSelectedTarget();
    if (!target) return;
    await browser.storage.local.set({
      morpheusPopupTarget: { boardId: target.board.id, tabId: target.tab.id }
    }).catch(() => {});
  }

  function renderTargetTabs(preferredTabId = '') {
    const board = targetBoards.find(item => item.id === targetBoard.value) || targetBoards[0];
    replaceOptions(targetTab, board?.tabs || [], preferredTabId);
    if (!targetTab.value && board?.tabs?.[0]) targetTab.value = board.tabs[0].id;
    targetPicker.classList.toggle('hidden', !morpheusOpen || !findSelectedTarget());
    updateActionButtons();
  }

  async function loadTargets() {
    if (!morpheusOpen) return false;
    if (targetsInFlight) return targetsInFlight;
    targetsInFlight = (async () => {
      const [response, stored] = await Promise.all([
        browser.runtime.sendMessage({ type: 'MW_GET_INBOX_TARGETS' }),
        browser.storage.local.get('morpheusPopupTarget').catch(() => ({}))
      ]);
      if (response?.ok !== true) throw new Error(response?.error || 'The Hub did not return any Inbox targets');
      targetBoards = Array.isArray(response?.boards) ? response.boards : [];
      const remembered = stored?.morpheusPopupTarget || {};
      const preferredBoardId = targetBoards.some(board => board.id === remembered.boardId)
        ? remembered.boardId
        : (targetBoards.some(board => board.id === response?.activeBoardId) ? response.activeBoardId : targetBoards[0]?.id || '');
      replaceOptions(targetBoard, targetBoards, preferredBoardId);
      if (!targetBoard.value && targetBoards[0]) targetBoard.value = targetBoards[0].id;
      const selectedBoard = targetBoards.find(board => board.id === targetBoard.value);
      const preferredTabId = selectedBoard?.tabs?.some(tab => tab.id === remembered.tabId)
        ? remembered.tabId
        : (selectedBoard?.tabs?.some(tab => tab.id === response?.activeTabId) ? response.activeTabId : selectedBoard?.tabs?.[0]?.id || '');
      targetsLoaded = true;
      renderTargetTabs(preferredTabId);
      return targetBoards.length > 0;
    })().catch(error => {
      targetBoards = [];
      targetsLoaded = true;
      targetPicker.classList.add('hidden');
      hubRelayError = error?.message || String(error);
      return false;
    }).finally(() => { targetsInFlight = null; });
    return targetsInFlight;
  }

  function updateActionButtons() {
    // An open Portal can accept a delivery immediately even while its storage
    // status is still warming up. Closed-Portal delivery requires the durable
    // Relay queue, so keep that path disabled until storage readiness is known.
    const disabled = sending || !isReal || (!morpheusOpen && !storageInfoReady);
    sendBtn.disabled = disabled;
    importBtn.disabled = disabled;
    sendToTabBtn.disabled = disabled || !findSelectedTarget();
  }

  function renderStatus() {
    setRow(elMorpheus,
      morpheusOpen
        ? '● Cyrune Portal is open'
        : (fileSchemeAccessRequired && fileSchemeAccess === false
          ? '○ Local-file access is disabled'
          : '○ Waiting for Cyrune Portal…'),
      morpheusOpen ? 'ok' : 'warn'
    );

    setRow(elNative,
      storageMode === 'host'
        ? (authoritativeStorageAvailable ? '● Storage: Host disk' : '○ Storage: Host disk unavailable')
        : (storageMode === 'relay' ? '● Storage: Relay' : '○ Storage: awaiting setup'),
      authoritativeStorageAvailable ? 'ok' : 'warn'
    );
    storageChoice.classList.toggle('hidden', !authoritySelectionRequired);
    elPending.textContent = pendingIntake === 1 ? '1 delivery waiting for Portal' : `${pendingIntake} deliveries waiting for Portal`;
    elPending.classList.toggle('hidden', pendingIntake === 0);

    if (storageMode === 'host') {
      elPath.textContent = databasePath ? `Shared DB: ${databasePath}` : 'Host database configuration unavailable';
      elPath.classList.remove('hidden');
      elPath.classList.toggle('warn', !databasePath);
      elPath.classList.toggle('muted', !databasePath);
      if (!authoritativeStorageAvailable) {
        elDetail.textContent = 'Restore Cyrune Host and its database connection, then reload Portal.';
        elDetail.classList.remove('hidden');
        elDetail.classList.add('warn');
      } else if (!morpheusOpen && fileSchemeAccessRequired && fileSchemeAccess === false) {
        elDetail.textContent = 'Open about:addons → Cyrune Relay → Permissions, then enable “Access local files on your computer”.';
        elDetail.classList.remove('hidden');
        elDetail.classList.add('warn');
      } else if (!morpheusOpen && hubRelayError) {
        elDetail.textContent = `Relay error: ${hubRelayError}`;
        elDetail.classList.remove('hidden');
        elDetail.classList.add('warn');
      } else {
        elDetail.classList.add('hidden');
      }
    } else {
      elPath.textContent = extensionId ? `Extension ID: ${extensionId}` : 'Extension ID unavailable';
      elPath.classList.remove('hidden');
      elPath.classList.add('muted');
      if (fileSchemeAccessRequired && fileSchemeAccess === false) {
        elDetail.textContent = 'Open about:addons → Cyrune Relay → Permissions, then enable “Access local files on your computer”.';
      } else if (!morpheusOpen && hubRelayError) {
        elDetail.textContent = `Relay error: ${hubRelayError}`;
      } else if (storageMode === 'unselected' && nativeError) {
        elDetail.textContent = `Native error: ${nativeError}`;
      } else {
        elDetail.textContent = '';
      }
      elDetail.classList.toggle('hidden', !elDetail.textContent);
      elDetail.classList.add('warn');
    }
    updateActionButtons();
  }

  function refreshStatus() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = browser.runtime.sendMessage({ type: 'MW_GET_STATUS' })
      .then(res => {
        morpheusOpen    = res?.morpheusOpen === true;
        nativeAvailable = res?.nativeAvailable === true;
        storageInfoReady = res?.storageInfoReady === true;
        storageMode = res?.storageMode || 'unselected';
        authoritativeStorageAvailable = res?.authoritativeStorageAvailable === true;
        authoritySelectionRequired = res?.authoritySelectionRequired === true;
        databasePath    = res?.databasePath || null;
        nativeError     = res?.nativeError || '';
        fileSchemeAccess = res?.fileSchemeAccess ?? null;
        fileSchemeAccessRequired = res?.fileSchemeAccessRequired === true;
        pendingIntake = Math.max(0, Number(res?.pendingIntake || 0));
        if (morpheusOpen) hubRelayError = '';
        else if (res?.hubRelayError) hubRelayError = res.hubRelayError;
        extensionId     = res?.extensionId || browser.runtime.id || '';
        renderStatus();
        if (morpheusOpen && !targetsLoaded) void loadTargets();
        return morpheusOpen && storageInfoReady;
      })
      .catch(() => {
        morpheusOpen = false;
        setRow(elMorpheus, '⚠ Extension error', 'err');
        updateActionButtons();
        return false;
      })
      .finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  const relayResult = await ensureActiveHubRelay(currentTab);
  if (relayResult.error) hubRelayError = relayResult.error;
  const initialStatusReady = await refreshStatus();
  if (!initialStatusReady) {
    statusPollTimer = setInterval(async () => {
      if (await refreshStatus()) {
        clearInterval(statusPollTimer);
        statusPollTimer = null;
      }
    }, 500);
  }
  window.addEventListener('unload', () => {
    if (statusPollTimer) clearInterval(statusPollTimer);
  }, { once: true });

  async function sendCurrentTab(type, okMessage, target = null) {
    sending = true;
    updateActionButtons();
    try {
      await refreshStatus();
      if (target && !morpheusOpen) throw new Error('Open Cyrune Portal to choose a specific board and tab');
      const res = await browser.runtime.sendMessage({
        type,
        targetBoardId: target?.board?.id || '',
        targetTabId: target?.tab?.id || '',
        url:   currentTab.url,
        title: currentTab.title || currentTab.url,
        faviconCache: currentTab.favIconUrl || ''
      });
      if (res.ok) {
        showFeedback(res.queued ? 'Queued securely for the next Portal session.' : okMessage, 'ok');
        setTimeout(() => window.close(), 1200);
      } else {
        sending = false;
        updateActionButtons();
        showFeedback('Error: ' + (res.error || 'unknown'), 'err');
      }
    } catch (err) {
      sending = false;
      updateActionButtons();
      showFeedback('Error: ' + err.message, 'err');
    }
  }

  targetBoard.addEventListener('change', () => {
    renderTargetTabs();
    void rememberTarget();
  });
  useRelayStorageBtn.addEventListener('click', async () => {
    useRelayStorageBtn.disabled = true;
    try {
      const result = await browser.runtime.sendMessage({ type: 'USE_RELAY_STORAGE' });
      if (result?.ok !== true) throw new Error(result?.error || 'Relay storage could not be selected');
      showFeedback('Relay storage selected. Reopen or reload Portal to connect.', 'ok');
      await refreshStatus();
    } catch (error) {
      showFeedback(error?.message || String(error), 'err');
    } finally {
      useRelayStorageBtn.disabled = false;
    }
  });
  targetTab.addEventListener('change', () => {
    updateActionButtons();
    void rememberTarget();
  });
  sendBtn.addEventListener('click', () => sendCurrentTab('MW_SEND_TAB', 'Sent to inbox!'));
  sendToTabBtn.addEventListener('click', () => {
    const target = findSelectedTarget();
    if (!target) return;
    void rememberTarget();
    sendCurrentTab('MW_SEND_TAB', `Sent to ${target.board.title} / ${target.tab.title}!`, target);
  });
  importBtn.addEventListener('click', () => sendCurrentTab('MW_SEND_TAB_TO_IMPORT_MANAGER', 'Sent to Import Manager!'));
}

function nativeMenuHostname(value) {
  try {
    const url = new URL(value || '');
    return /^https?:$/.test(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)
      ? url.hostname : '';
  } catch {
    return '';
  }
}

async function setupNativeMenuControls(currentTab) {
  const toggle = document.getElementById('nativeMenuEnabled');
  const exception = document.getElementById('nativeMenuSiteException');
  const detail = document.getElementById('nativeMenuDetail');
  if (!toggle || !exception || !detail) return;
  const key = 'cyruneNativeContextMenuV1';
  const hostname = nativeMenuHostname(currentTab?.url);
  let settings;
  function normalize(value) {
    return {
      enabled: value?.enabled === true,
      exceptions: [...new Set(Array.isArray(value?.exceptions)
        ? value.exceptions.filter(host => typeof host === 'string' && host.length <= 253).slice(0, 256) : [])]
    };
  }
  function render() {
    toggle.checked = settings.enabled;
    exception.checked = settings.exceptions.includes(hostname);
    toggle.disabled = false;
    exception.disabled = !settings.enabled || !hostname;
    toggle.title = !hostname ? 'Choose an ordinary web page to set a site exception.'
      : !settings.enabled ? 'Off. Websites control their own right-click menus.'
      : exception.checked ? `Site menu allowed on ${hostname}, including embedded frames.`
      : `Native menu enabled on ${hostname}. Firefox-protected pages are excluded.`;
    detail.textContent = '';
  }
  try {
    settings = normalize((await browser.storage.local.get(key))[key]);
    render();
  } catch {
    detail.textContent = 'Right-click settings unavailable. Reopen the popup to retry.';
    return;
  }
  async function save(siteChange) {
    const enabled = toggle.checked;
    const excluded = exception.checked;
    toggle.disabled = exception.disabled = true;
    try {
      const latest = normalize((await browser.storage.local.get(key))[key]);
      if (siteChange) {
        latest.exceptions = latest.exceptions.filter(host => host !== hostname);
        if (excluded) {
          if (latest.exceptions.length >= 256) throw new Error('Site exception limit reached (256).');
          latest.exceptions.push(hostname);
        }
      } else latest.enabled = enabled;
      await browser.storage.local.set({ [key]: latest });
      settings = latest;
      render();
      // Install the same idempotent handler in tabs opened before this update.
      // Firefox rejects protected pages; future eligible navigations use the manifest.
      if (settings.enabled) {
        const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
        const eligibleTabs = tabs.filter(tab => nativeMenuHostname(tab.url));
        await Promise.allSettled(eligibleTabs.map(tab => browser.tabs.executeScript(tab.id, {
          file: '/content.js', allFrames: true, runAt: 'document_start'
        })));
      }
    } catch (error) {
      render();
      detail.textContent = `Could not apply right-click settings: ${error?.message || String(error)}`;
    }
  }
  toggle.addEventListener('change', () => save(false));
  exception.addEventListener('change', () => save(true));
}

function popupCardError(element, message) {
  element.textContent = message || '';
  element.hidden = !message;
}

// Dispatch immediately to Relay's serialized persistence, so closing the popup
// cannot discard a queued frontend mutation. Older replies never replace newer UI.
function popupAutoSave(save, output) {
  let revision = 0;
  return async value => {
    const current = ++revision;
    popupCardError(output, '');
    try { await save(value); }
    catch(error) { if (current === revision) popupCardError(output, error.message || 'Could not save.'); }
  };
}

async function setupBrowserUtilities(currentTab) {
  const get = id => document.getElementById(id);
  const detail = get('refreshDetail'), feedback = get('utilityFeedback');
  if (!detail || !feedback || !Number.isInteger(currentTab?.id)) return;
  const settings = { restoreSelection:'restoreSelection',restoreCopy:'restoreCopy',restorePaste:'restorePaste',utilityCopyLinks:'copyLinks',utilityCollectLinks:'collectLinks',utilityCopyTabs:'copyTabs',utilitySiteException:'siteException' };
  let state;
  async function request(action, fields = {}) {
    const result = await browser.runtime.sendMessage({ type:'CYRUNE_BROWSER_UTILITIES',action,tabId:currentTab.id,...fields });
    if (!result?.ok) throw new Error(result?.error || 'Browser utilities unavailable. Reload Relay.');
    return result;
  }
  function renderPreferences() {
    for(const [id,name] of Object.entries(settings)) {
      get(id).checked=name==='siteException'?state.siteException:state.prefs[name]===true;
      get(id).disabled=name==='siteException'&&!nativeMenuHostname(currentTab.url);
    }
    get('copyPageBtn').disabled=!state.prefs.copyLinks||!nativeMenuHostname(currentTab.url);
    get('copySelectedTabsBtn').disabled=get('copyWindowTabsBtn').disabled=!state.prefs.copyTabs;
  }
  try {
    state=await request('state');
    if(!state.prefs)throw new Error('Update Relay to use browser utilities.');
    renderPreferences();
    if(state.rule){const unit=state.rule.seconds%3600===0?3600:state.rule.seconds%60===0?60:1;get('refreshUnit').value=String(unit);get('refreshAmount').value=String(state.rule.seconds/unit);}
    get('refreshEnabled').checked=state.rule?.enabled===true;
    for(const id of ['refreshEnabled','refreshAmount','refreshUnit'])get(id).disabled=!state.eligible;
  } catch(error) { popupCardError(detail,error.message);return; }
  for(const [id,name] of Object.entries(settings))get(id).addEventListener('change',async()=>{
    try { await request('preferences',{name,value:get(id).checked});state=await request('state');renderPreferences(); }
    catch(error){feedback.textContent=error.message;}
  });
  for(const [id,action,scope] of [['copyPageBtn','copyPage'],['copySelectedTabsBtn','copyTabs','selected'],['copyWindowTabsBtn','copyTabs','window']])get(id).addEventListener('click',async()=>{
    try{const result=await request(action,{scope,format:get('utilityCopyFormat').value});feedback.textContent=`${result.count} links copied.`;}
    catch(error){feedback.textContent=error.message;}
  });
  const save=popupAutoSave(value=>request('refresh',{...value,expectedUrl:state.url}),detail);
  function update() {
    const seconds=Number(get('refreshAmount').value)*Number(get('refreshUnit').value);
    const valid=Number.isInteger(seconds)&&seconds>=10&&seconds<=86400;
    get('refreshAmount').setAttribute('aria-invalid',String(!valid));
    if(!valid){popupCardError(detail,'Use an interval from 10 seconds to 24 hours.');return;}
    void save({mode:get('refreshEnabled').checked?'start':'pause',seconds});
  }
  let timer;
  get('refreshAmount').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(update,250);});
  for(const id of ['refreshEnabled','refreshAmount','refreshUnit'])get(id).addEventListener('change',()=>{clearTimeout(timer);update();});
}

async function setupTabUnload(tab) {
  const get=id=>document.getElementById(id);
  let domain;
  async function request(action,fields={}) {
    const result=await browser.runtime.sendMessage({type:'CYRUNE_TAB_UNLOAD',action,tabId:tab?.id,expectedDomain:domain,...fields});
    if(!result?.ok)throw new Error(result?.error||'Unload settings unavailable.');
    return result;
  }
  try {
    const state=await request('state');domain=state.domain;
    if(state.rule){const unit=state.rule.seconds%3600===0?3600:60;get('unloadUnit').value=String(unit);get('unloadAmount').value=String(state.rule.seconds/unit);}
    get('unloadEnabled').checked=state.rule?.enabled===true;
    for(const id of ['unloadEnabled','unloadAmount','unloadUnit'])get(id).disabled=false;
  }catch(error){popupCardError(get('unloadDetail'),error.message);return;}
  const save=popupAutoSave(value=>request('settings',value),get('unloadDetail'));
  function update(){
    const seconds=Number(get('unloadAmount').value)*Number(get('unloadUnit').value),valid=Number.isInteger(seconds)&&seconds>=60&&seconds<=86400;
    get('unloadAmount').setAttribute('aria-invalid',String(!valid));
    if(!valid){popupCardError(get('unloadDetail'),'Use an interval from 1 minute to 24 hours.');return;}
    void save({enabled:get('unloadEnabled').checked,seconds});
  }
  let timer;
  get('unloadAmount').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(update,250);});
  for(const id of ['unloadEnabled','unloadAmount','unloadUnit'])get(id).addEventListener('change',()=>{clearTimeout(timer);update();});
}

async function setupSiteControls(tab) {
  const get=id=>document.getElementById(id);
  const inputs=['siteCategory','siteDistracting','siteExcluded','siteBlockScheduled','siteBlockFrom','siteBlockUntil','siteBlockFocus'];
  let state;
  async function request(action,fields={}) {
    const result=await browser.runtime.sendMessage({type:'CYRUNE_SITE_CONTROLS',action,tabId:tab?.id,expectedDomain:state?.domain,...fields});
    if(!result?.ok)throw new Error(result?.error||'Site settings unavailable.');
    return result;
  }
  try {
    state=await request('state');get('siteDomain').textContent=state.domain;
    get('siteCategory').replaceChildren(...state.categories.map(category=>{const option=document.createElement('option');option.value=option.textContent=category;return option;}));
    get('siteCategory').value=state.category;get('siteExcluded').checked=state.excluded;get('siteDistracting').checked=state.distracting;
    get('siteBlockScheduled').checked=state.rule.scheduled;get('siteBlockFrom').value=state.rule.from;get('siteBlockUntil').value=state.rule.until;get('siteBlockFocus').checked=state.rule.focus;
    inputs.forEach(id=>{get(id).disabled=false;});
    if(state.allowance)setupSiteAllowance(tab,state);
  }catch(error){get('siteDomain').textContent=error.message;return;}
  pollSiteTodayTime(()=>request('activityTime'),get('siteTodayTime'));
  const activity=popupAutoSave(value=>request('activity',value),get('siteActivityDetail'));
  for(const id of ['siteCategory','siteDistracting','siteExcluded'])get(id).addEventListener('change',()=>{
    void activity({category:get('siteCategory').value,excluded:get('siteExcluded').checked,distracting:get('siteDistracting').checked});
  });
  const blocking=popupAutoSave(value=>request('blocking',{rule:value}),get('siteBlockDetail'));
  function updateBlocking() {
    const from=get('siteBlockFrom').value,until=get('siteBlockUntil').value;
    const valid=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    get('siteBlockFrom').setAttribute('aria-invalid',String(!valid(from)));get('siteBlockUntil').setAttribute('aria-invalid',String(!valid(until)));
    if(!valid(from)||!valid(until)){popupCardError(get('siteBlockDetail'),'Use HH:MM.');return;}
    if(get('siteBlockScheduled').checked&&from===until){popupCardError(get('siteBlockDetail'),'Start and end times must differ.');return;}
    void blocking({scheduled:get('siteBlockScheduled').checked,from,until,focus:get('siteBlockFocus').checked});
  }
  let timer;
  for(const id of ['siteBlockFrom','siteBlockUntil'])get(id).addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(updateBlocking,250);});
  for(const id of ['siteBlockScheduled','siteBlockFrom','siteBlockUntil','siteBlockFocus'])get(id).addEventListener('change',()=>{clearTimeout(timer);updateBlocking();});
}

function pollSiteTodayTime(read,node) {
  let stopped=false,timer;
  async function update() {
    try {
      const result=await read();
      if(!stopped){
        node.hidden=!result.trackingEnabled || !Number.isFinite(result.todayMs) || result.todayMs<0;
        const minutes=Math.floor((result.todayMs||0)/60000);
        node.textContent=node.hidden?'':minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes} min`;
      }
    }catch{if(!stopped){node.hidden=true;node.textContent='';}}
    if(!stopped)timer=setTimeout(update,5000);
  }
  void update();
  window.addEventListener('unload',()=>{stopped=true;clearTimeout(timer);},{once:true});
}

async function setupProductivityControls() {
  const get = id => document.getElementById(id);
  if (!get('focusStatus') || !get('focusPauseResume') || !get('activityStatus')) return;
  let state, busy = false;
  async function request(service, action, args = {}) {
    const result = await browser.runtime.sendMessage({ type: 'CYRUNE_PRODUCTIVITY', payload: { schemaVersion: 1, service, action, args,
      expectedRevision: state?.focus.revision, requestId: `popup-${Date.now()}-${Math.random().toString(36).slice(2)}` } });
    if (!result?.ok) throw new Error(result?.error || 'Update Relay to use Focus and Activity.');
    return result;
  }
  async function refresh() {
    state = await request('focus', 'state');
    if (!state.focus || !state.activity) throw new Error('Productivity state unavailable.');
    const remaining = state.focus.status === 'running' ? Math.max(0,state.focus.endsAt-Date.now()) : state.focus.remainingMs;
    get('focusStatus').textContent = `Focus · ${state.focus.phase} · ${state.focus.status} · ${Math.ceil(remaining/60000)} min`;
    get('focusPauseResume').textContent = state.focus.status === 'running' ? 'Pause' : 'Resume';
    get('focusPauseResume').disabled = busy || state.focus.status === 'idle';
    get('focusStop').disabled = busy || state.focus.status === 'idle';
    get('activityStatus').textContent = !state.activity.enabled ? 'Activity tracking off · enable in Browser Activity widget' : state.activity.paused ? 'Activity tracking paused' : '● Activity tracking enabled';
    get('activityPauseResume').textContent = state.activity.paused ? 'Resume tracking' : 'Pause tracking';
    get('activityPauseResume').disabled = busy || !state.activity.enabled;
  }
  async function run(service, action, args) {
    if (busy) return;
    busy = true;
    try { await request(service,action,args); } catch(error) { get('productivityFeedback').textContent=error.message; }
    finally { busy=false; await refresh().catch(error=>{get('productivityFeedback').textContent=error.message;}); }
  }
  try { await refresh(); } catch(error) { get('focusStatus').textContent=error.message;return; }
  get('focusPauseResume').onclick=()=>run('focus',state.focus.status==='running'?'pause':'resume');
  get('focusStop').onclick=()=>run('focus','stop');
  get('activityPauseResume').onclick=()=>run('activity','settings',{paused:!state.activity.paused});
}

function setupTimerOverviewLink() {
  document.getElementById('tabTimersOpen').onclick=()=>{void browser.tabs.create({url:browser.runtime.getURL('popup/popup.html?view=timers')});};
}

async function setupTimerPauses(tab) {
  const controls=['reload','unload'].map(kind=>({kind,input:document.getElementById(`${kind}Pause`),error:document.getElementById(`${kind}PauseError`)}));
  let domain;
  const request=async(action,extra={})=>{const result=await browser.runtime.sendMessage({type:'CYRUNE_TAB_TIMERS',action,tabId:tab?.id,expectedDomain:domain,...extra});if(!result?.ok)throw new Error(result?.error||'Timer override unavailable');return result;};
  try {
    const state=await request('state');domain=state.domain;
    controls.forEach(({kind,input})=>{input.value=state.override?.[kind] ? String(state.override[kind].seconds) : 'none';input.disabled=false;});
  } catch(error){controls.forEach(control=>popupCardError(control.error,error.message));return;}
  controls.forEach(({kind,input,error})=>{
    const save=popupAutoSave(value=>request('override',value),error);
    input.addEventListener('change',()=>{void save({kind,mode:input.value==='none'?'none':'pause',seconds:input.value==='none'?0:Number(input.value)});});
  });
}

function setupSiteAllowance(tab,state) {
  if(state.allowance.error){popupCardError(document.getElementById('siteAllowanceError'),state.allowance.error);return;}
  const get=id=>document.getElementById(id),value=state.allowance.rule;
  get('siteAllowanceEnabled').checked=value.enabled;get('siteAllowanceMinutes').value=String(value.minutes);get('siteAllowanceWarning').value=String(value.warningMinutes);get('siteAllowanceBlock').checked=value.block;
  function enabled(){const disabled=!get('siteDistracting').checked;for(const id of ['siteAllowanceEnabled','siteAllowanceMinutes','siteAllowanceWarning','siteAllowanceBlock'])get(id).disabled=disabled;}
  enabled();get('siteDistracting').addEventListener('change',enabled);
  get('siteAllowanceUsage').textContent=value.enabled?`${Math.floor(state.allowance.usedMs/60000)}/${value.minutes} min`:'';
  const error=get('siteAllowanceError'),save=popupAutoSave(async rule=>{
    const result=await browser.runtime.sendMessage({type:'CYRUNE_SITE_CONTROLS',action:'allowance',tabId:tab?.id,expectedDomain:state.domain,rule});if(!result?.ok)throw new Error(result?.error||'Allowance unavailable');
  },error);
  let timer;
  const update=()=>{const minutes=Number(get('siteAllowanceMinutes').value),warningMinutes=Number(get('siteAllowanceWarning').value);
    if(!Number.isInteger(minutes)||minutes<1||minutes>1440||!Number.isInteger(warningMinutes)||warningMinutes<0||warningMinutes>60||warningMinutes>=minutes){popupCardError(error,'Use a warning below the daily limit.');return;}
    void save({enabled:get('siteAllowanceEnabled').checked,minutes,warningMinutes,block:get('siteAllowanceBlock').checked});};
  for(const id of ['siteAllowanceEnabled','siteAllowanceMinutes','siteAllowanceWarning','siteAllowanceBlock']) {get(id).addEventListener('change',()=>{clearTimeout(timer);update();});if(get(id).type==='number')get(id).addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(update,250);});}
}

async function setupTimerOverview() {
  const get=id=>document.getElementById(id),selected=new Map();let rows=[],offset=0,total=0,busy=false,disposed=false,timer,searchTimer;
  const request=async fields=>{const result=await browser.runtime.sendMessage({type:'CYRUNE_TAB_TIMERS',...fields});if(!result?.ok)throw new Error(result?.error||'Tab timers unavailable');return result;};
  function selectionUI(){get('timerBulkApply').textContent=selected.size?`Apply (${selected.size})`:'Apply';get('timerSelectAll').checked=!!rows.length&&rows.every(row=>selected.get(row.id)===row.domain);}
  async function refresh(){
    if(busy||disposed||get('timerRows').contains(document.activeElement))return;busy=true;
    try {const result=await request({action:'list',offset,query:get('timerSearch').value,filter:get('timerFilter').value});if(disposed)return;rows=result.rows;total=result.total;
      if(offset>=total&&offset){offset=Math.max(0,Math.floor((total-1)/100)*100);busy=false;return refresh();}
      const fragment=document.createDocumentFragment();
      for(const row of rows){
        const tr=document.createElement('tr'),check=document.createElement('input');check.type='checkbox';check.dataset.timerTab=String(row.id);check.setAttribute('aria-label',`Select ${row.title}`);check.checked=selected.get(row.id)===row.domain;
        function cell(text){const td=document.createElement('td');if(text!==undefined)td.textContent=text;tr.appendChild(td);return td;}
        cell().appendChild(check);const title=cell(row.title),domain=document.createElement('small');domain.textContent=row.domain+(row.active?' · Selected':'');title.appendChild(domain);
        cell(timerStatusText(row.refresh,'reload')||'—');cell(timerStatusText(row.unload,'unload')||'—');
        const overrideCell=cell(row.override ? [row.override.reload?'Reload paused':'',row.override.unload?'Unload paused':''].filter(Boolean).join(', ') : '—');
        if(row.override){const until=document.createElement('small');until.textContent=row.override.until?new Date(row.override.until).toLocaleTimeString():'Until closed';overrideCell.appendChild(until);}
        check.onchange=()=>{if(check.checked){if(selected.size>=100){check.checked=false;return;}selected.set(row.id,row.domain);}else selected.delete(row.id);selectionUI();};fragment.appendChild(tr);
      }
      get('timerRows').replaceChildren(fragment);
      get('timerPage').textContent=`${total?offset+1:0}–${Math.min(offset+100,total)} / ${total}`;get('timerPrev').disabled=!offset;get('timerNext').disabled=offset+100>=total;selectionUI();popupCardError(get('timerOverviewError'),'');
    }catch(e){popupCardError(get('timerOverviewError'),e.message);}finally{busy=false;}
  }
  get('timerSearch').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{offset=0;void refresh();},250);};
  get('timerFilter').onchange=()=>{offset=0;selected.clear();void refresh();};
  get('timerPrev').onclick=()=>{offset=Math.max(0,offset-100);void refresh();};get('timerNext').onclick=()=>{offset+=100;void refresh();};
  get('timerSelectAll').onchange=event=>{for(const row of rows){if(event.target.checked&&selected.size<100)selected.set(row.id,row.domain);else if(!event.target.checked)selected.delete(row.id);}void refresh();};
  get('timerBulkApply').onclick=async()=>{if(!selected.size)return;get('timerBulkApply').disabled=true;try{await request({action:'bulk',tabs:[...selected].map(([id,domain])=>({id,domain})),mode:get('timerBulkMode').value,seconds:Number(get('timerBulkDuration').value)});selected.clear();await refresh();}catch(e){popupCardError(get('timerOverviewError'),e.message);}finally{get('timerBulkApply').disabled=false;}};
  async function tick(){await refresh();if(!disposed)timer=setTimeout(tick,3000);}await tick();
  window.addEventListener('unload',()=>{disposed=true;clearTimeout(timer);clearTimeout(searchTimer);},{once:true});
}

main();
