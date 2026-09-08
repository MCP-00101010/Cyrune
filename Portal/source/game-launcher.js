const gameStatusCache = new Map();
const gameStatusRequests = new Map();
const gameTooltipItems = new WeakMap();
let gameVersionsDialog = null;

function groupGameShortcutItems(items) {
  const seen = new Set();
  return items.filter(item => {
    const group = item?.type === 'game' ? gameStatusCache.get(item.gameKey)?.versionGroup : '';
    if (!group) return true;
    if (seen.has(group)) return false;
    seen.add(group); return true;
  });
}

async function showGameVersionsModal(item) {
  if (!item?.gameKey || gameVersionsDialog) return;
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
  overlay.innerHTML = `<section class="modal-card game-versions-modal" role="dialog" aria-modal="true" aria-labelledby="portal-game-versions-title">
    <header><h2 id="portal-game-versions-title">Launch Version…</h2><p data-version-title></p></header>
    <p>Opening this game launches its default version. Choose another below, or save a new default for Portal and Arcade.</p>
    <div data-version-list class="game-version-list"></div><p data-version-status role="status">Loading versions…</p>
    <footer class="utility-panel-footer"><button data-version-close class="secondary-btn">Close</button></footer></section>`;
  overlay.querySelector('[data-version-title]').textContent = item.title || 'Game';
  const list = overlay.querySelector('[data-version-list]');
  const status = overlay.querySelector('[data-version-status]');
  const close = overlay.querySelector('[data-version-close]');
  let busy = false;
  const dismiss = () => { if (!busy) { overlay.remove(); gameVersionsDialog = null; previousFocus?.focus(); } };
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const buttons = [...overlay.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === buttons[0] || !event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0].focus();
      }
    }
  });
  document.body.appendChild(overlay); gameVersionsDialog = overlay; close.focus();
  const load = async () => {
    const result = await bridge.gameVersions(item.gameKey);
    if (!overlay.isConnected) return;
    if (!result || !Array.isArray(result.versions) || result.versions.length > 1000
        || result.versions.some(row => !row || typeof row.label !== 'string' || row.label.length > 520
          || ![row.catalogueId, row.entryRevision].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value))
          || typeof row.isDefault !== 'boolean')) throw new Error('Game versions could not be read.');
    list.replaceChildren();
    for (const version of result.versions) {
      const row = document.createElement('div'); row.className = 'game-version-row';
      const label = document.createElement('span'); label.className = 'game-version-label'; label.textContent = version.label;
      const marker = document.createElement('strong'); marker.textContent = version.isDefault ? 'Default' : '';
      const launch = document.createElement('button'); launch.className = 'primary-btn'; launch.textContent = 'Launch';
      const makeDefault = document.createElement('button'); makeDefault.className = 'secondary-btn';
      makeDefault.textContent = 'Use as default';
      const run = async action => {
        busy = true; overlay.querySelectorAll('button').forEach(button => { button.disabled = true; }); status.textContent = '';
        try {
          await bridge.gameVersions(item.gameKey, action, version);
          if (action === 'launch') { busy = false; dismiss(); return; }
          // Keep family metadata transient; existing shortcut keys and custom
          // presentation remain in the portable database.
          for (const { item: game } of collectStoredGames()) {
            if (game.gameKey === item.gameKey || gameStatusCache.get(game.gameKey)?.versionGroup === result.groupId) {
              await refreshGameStatus(game, { render: false });
            }
          }
          _renderGameShortcutSurfaces(); await load(); status.textContent = 'Default saved.';
        } catch (error) { status.textContent = error.message || 'That version could not be used.'; }
        finally { busy = false; close.disabled = false;
          list.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
      };
      launch.addEventListener('click', () => void run('launch'));
      makeDefault.addEventListener('click', () => void run('default'));
      row.append(label, marker, launch, makeDefault); list.appendChild(row);
    }
    status.textContent = result.versions.some(row => row.isDefault) ? '' : 'The saved default is missing. Choose an available version as default.';
  };
  try { await load(); } catch (error) { status.textContent = error.message || 'Game versions are unavailable.'; }
}

const GAME_LANGUAGE_FLAGS = Object.freeze({
  ar: ['sa', 'Arabic'], be: ['by', 'Belarusian'], bg: ['bg', 'Bulgarian'], br: ['fr', 'Breton'],
  ca: ['es-ct', 'Catalan'], cs: ['cz', 'Czech'], da: ['dk', 'Danish'], de: ['de', 'German'],
  el: ['gr', 'Greek'], en: ['gb', 'English'], es: ['es', 'Spanish'], et: ['ee', 'Estonian'],
  eu: ['es-pv', 'Basque'], fa: ['ir', 'Persian'], fi: ['fi', 'Finnish'], fr: ['fr', 'French'],
  he: ['il', 'Hebrew'], hr: ['hr', 'Croatian'], hu: ['hu', 'Hungarian'], it: ['it', 'Italian'],
  ja: ['jp', 'Japanese'], ko: ['kr', 'Korean'], lt: ['lt', 'Lithuanian'], lv: ['lv', 'Latvian'],
  nb: ['no', 'Norwegian Bokmål'], nl: ['nl', 'Dutch'], no: ['no', 'Norwegian'], pl: ['pl', 'Polish'],
  pt: ['pt', 'Portuguese'], ro: ['ro', 'Romanian'], ru: ['ru', 'Russian'], sk: ['sk', 'Slovak'],
  sr: ['rs', 'Serbian'], sv: ['se', 'Swedish'], tr: ['tr', 'Turkish'], uk: ['ua', 'Ukrainian'],
  zh: ['cn', 'Chinese'], 'en-us': ['us', 'English (US)'], 'en-gb': ['gb', 'English (UK)'],
  'fr-ca': ['ca', 'French (Canada)'], 'pt-br': ['br', 'Portuguese (Brazil)'],
  'zh-tw': ['tw', 'Chinese (Taiwan)'], 'zh-cn': ['cn', 'Chinese (China)']
});

function getGameLanguageDescriptors(values) {
  if (!Array.isArray(values)) return [];
  const codes = [...new Set(values.slice(0, 12).filter(value => typeof value === 'string'
    && /^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(value)).map(value => value.toLowerCase()))].sort();
  return codes.map(code => {
    const known = GAME_LANGUAGE_FLAGS[code] || GAME_LANGUAGE_FLAGS[code.split('-')[0]];
    return { code, flag: known?.[0] || '', label: known?.[1] || code.toUpperCase() };
  });
}

const GAME_PLATFORM_BADGES = Object.freeze({
  dos: ['dos.png', 'DOS'], windows: ['windows.png', 'Windows'], amiga: ['amiga.png', 'Amiga'],
  'fm towns': ['fm-towns.png', 'FM Towns'], 'atari st': ['atari-st.png', 'Atari ST'],
  macintosh: ['macintosh.png', 'Macintosh'], 'zx spectrum': ['zx-spectrum.png', 'ZX Spectrum'],
  steam: ['steam.svg', 'Steam edition'], 'unspecified platform': ['unknown.svg', 'Unspecified platform']
});

function isScummVMGame(item = {}) {
  const status = gameStatusCache.get(item.gameKey);
  const emulator = status?.emulatorName ?? item.emulatorName;
  if (emulator) return /^scumm\s?vm$/i.test(emulator.trim());
  return String(status?.systemId ?? item.systemId ?? '').toLowerCase() === 'scummvm';
}

function getGameDefaultIcons(item) {
  const status = gameStatusCache.get(item?.gameKey);
  const version = status?.state === 'ready' ? status.defaultVersion : null;
  if (!version) return [];
  const result = getGameLanguageDescriptors(version.languages).map(language => ({
    src: language.flag ? `assets/language-flags/${language.flag}.svg` : '',
    label: language.label, kind: 'language'
  }));
  const systems = version.systems ?? version.platforms;
  const platforms = Array.isArray(systems) ? systems.slice(0, 12) : [];
  const hardware = [...new Set(platforms.flatMap(value => /^(?:16|48|128)K(?:-(?:16|48|128)K)?$/i.test(String(value))
    ? String(value).toUpperCase().split('-') : []))].sort((a, b) => parseInt(a) - parseInt(b));
  if (hardware.length) return [...result, ...hardware.map(label => ({src:'', label, kind:'system'}))];
  if (!isScummVMGame(item) && (status.systemId || item.systemId) === 'atari-st' && platforms.some(value => ['ST', 'STe', 'TT', 'Falcon'].includes(value))) {
    return [...result, ...[...new Set(platforms)].filter(value => ['ST', 'STe', 'TT', 'Falcon'].includes(value)).map(label => ({src:'', label, kind:'system'}))];
  }
  for (const platform of [...new Set(platforms.filter(value => typeof value === 'string'))]) {
    const key = platform.trim().toLowerCase().replaceAll('-', ' ');
    // Older Host versions supplied the library platform here, not the hardware.
    // Keep its logo as the favicon; never present it as the default system.
    if (key === 'zx spectrum') continue;
    if (!isScummVMGame(item)) {
      if (key === 'atari st') continue;
      result.push({ src: '', label: platform, kind: 'system' });
      continue;
    }
    const [file, label] = GAME_PLATFORM_BADGES[key] || GAME_PLATFORM_BADGES['unspecified platform'];
    result.push({ src: `assets/platforms/${file}`, label, kind: key === 'steam' ? 'steam' : 'platform' });
  }
  return result;
}

function renderGameDefaultIcons(container, item) {
  const descriptors = getGameDefaultIcons(item);
  if (!descriptors.length) return;
  const badges = document.createElement('span'); badges.className = 'game-default-icons';
  for (const descriptor of descriptors) {
    const badge = document.createElement(descriptor.src ? 'img' : 'span');
    badge.className = `game-default-icon game-default-${descriptor.kind}`;
    badge.title = `Default version: ${descriptor.label}`;
    if (descriptor.src) { badge.src = descriptor.src; badge.alt = descriptor.label; }
    else badge.textContent = descriptor.label;
    badges.appendChild(badge);
  }
  container.appendChild(badges);
}

function _renderGameShortcutSurfaces() {
  if (typeof renderContentSurfaces === 'function') renderContentSurfaces();
  if (typeof renderEssentials === 'function') renderEssentials();
}

const GAME_SYSTEMS = Object.freeze({
  'zx-spectrum': { label: 'ZX Spectrum', iconId: 'icon-system-zx-spectrum' },
  'atari-st': { label: 'Atari ST', iconId: 'icon-system-atari-st' },
  'game-boy': { label: 'Game Boy', iconId: 'icon-system-game-boy' },
  snes: { label: 'Super Nintendo', iconId: 'icon-system-snes' },
  scummvm: { label: 'ScummVM', iconId: 'icon-system-scummvm' },
  dosbox: { label: 'DOSBox', iconId: 'icon-system-dosbox' },
  mame: { label: 'Arcade / MAME', iconId: 'icon-system-mame' }
});

function getGameSystemDescriptor(item = {}) {
  const explicitId = String(item.systemId || '').trim().toLowerCase();
  if (GAME_SYSTEMS[explicitId]) return { id: explicitId, ...GAME_SYSTEMS[explicitId] };
  const values = [item.systemId, item.systemName, ...(!explicitId && Array.isArray(item.tags) ? item.tags : [])]
    .map(value => String(value || '').trim()).filter(Boolean);
  const text = values.join(' ').toLowerCase().replace(/[_-]/g, ' ');
  const compact = text.replace(/[^a-z0-9+]+/g, '');
  let id = String(item.systemId || '').trim().toLowerCase();
  const matches = aliases => aliases.some(alias => text.includes(alias) || compact.includes(alias.replace(/[^a-z0-9+]+/g, '')));
  if (matches(['zx spectrum', 'spectrum', 'eightyone', 'spectaculator'])) id = 'zx-spectrum';
  else if (matches(['atari st', 'steem', 'hatari'])) id = 'atari-st';
  else if (matches(['game boy', 'gameboy', 'visualboy', 'sameboy', 'gambatte'])) id = 'game-boy';
  else if (matches(['super nintendo', 'snes', 'snes9x', 'bsnes'])) id = 'snes';
  else if (matches(['scummvm', 'scumm vm'])) id = 'scummvm';
  else if (matches(['dosbox', 'ms dos', 'dos game'])) id = 'dosbox';
  else if (matches(['mame', 'arcade'])) id = 'mame';
  const known = GAME_SYSTEMS[id];
  if (known) return { id, ...known };
  const label = String(item.systemName || '').trim();
  return id && label ? { id, label, iconId: 'icon-system-generic' } : null;
}

function renderGameSystemIcon(container, item) {
  const status = gameStatusCache.get(item?.gameKey);
  const system = getGameSystemDescriptor({ ...item, systemId: status?.systemId || item?.systemId, systemName: status?.systemName || item?.systemName });
  const scummvm = isScummVMGame(item);
  container.classList.add('game-system-icon');
  container.dataset.system = scummvm ? 'scummvm' : system?.id || 'generic';
  container.title = scummvm ? 'ScummVM' : system?.label || 'Game';
  if (scummvm) {
    const image = document.createElement('img');
    image.src = 'assets/scummvm/scummvm-icon.png';
    image.alt = 'ScummVM';
    image.className = 'game-scummvm-icon';
    container.appendChild(image);
  } else container.appendChild(icon(system?.iconId || 'icon-system-generic'));
  return container;
}

function registerGameTooltipTarget(target, item) {
  target.dataset.tooltip = item.title || 'Game';
  target.dataset.tooltipKind = 'game';
  gameTooltipItems.set(target, item);
}

function getGameTooltipDetails(item = {}) {
  const system = getGameSystemDescriptor(item);
  const status = gameStatusCache.get(item.gameKey) || {};
  return {
    title: String(item.title || 'Game'),
    system: status.platforms?.join(' / ') || system?.label || String(item.systemName || 'Game system'),
    emulator: String(status.emulatorName || item.emulatorName || 'Unknown emulator'),
    profile: String(status.profileName || item.profileName || 'Automatic'),
    languages: getGameLanguageDescriptors(status.languages),
    thumbnail: /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(String(item.thumbnailCache || '')) ? item.thumbnailCache : ''
  };
}

function renderGameTooltip(container, target) {
  const details = getGameTooltipDetails(gameTooltipItems.get(target));
  container.replaceChildren();
  if (details.thumbnail) {
    const image = document.createElement('img');
    image.className = 'game-tooltip-thumbnail';
    image.src = details.thumbnail;
    image.alt = '';
    container.appendChild(image);
  }
  const body = document.createElement('div');
  body.className = 'game-tooltip-body';
  const title = document.createElement('strong');
  title.className = 'game-tooltip-title';
  title.textContent = details.title;
  for (const language of details.languages) {
    const flag = document.createElement(language.flag ? 'img' : 'span');
    flag.className = 'game-tooltip-language';
    flag.title = language.label;
    if (language.flag) {
      flag.src = `assets/language-flags/${language.flag}.svg`;
      flag.alt = language.label;
      flag.width = 16;
      flag.height = 12;
    } else flag.textContent = language.label;
    title.appendChild(flag);
  }
  body.appendChild(title);
  const system = document.createElement('span');
  system.className = 'game-tooltip-system';
  system.textContent = details.system;
  body.appendChild(system);
  for (const [label, value] of [['Emulator', details.emulator], ['Profile', details.profile]]) {
    const row = document.createElement('div');
    row.className = 'game-tooltip-detail';
    const key = document.createElement('span');
    key.textContent = label;
    const text = document.createElement('span');
    text.textContent = value;
    row.append(key, text);
    body.appendChild(row);
  }
  container.appendChild(body);
}

function getGameStatus(item) {
  if (!item?.gameKey) return { state: 'unbound', title: item?.title || 'Game', thumbnailCache: '' };
  return gameStatusCache.get(item.gameKey) || {
    state: typeof bridge !== 'undefined' && bridge.supports?.('emuguiService') ? 'checking' : 'unavailable',
    title: item.title || 'Game',
    thumbnailCache: item.thumbnailCache || ''
  };
}

function getGameStatusMessage(status, title = 'This game') {
  const messages = {
    unbound: `${title} is not set up on this device.`,
    'library-missing': `${title}'s Cyrune Arcade library is not currently active.`,
    'game-missing': `${title} is missing from its Cyrune Arcade library.`,
    'emulator-missing': `${title}'s emulator is unavailable.`,
    'profile-missing': `${title}'s emulator profile is unavailable.`,
    incompatible: `${title}'s saved emulator configuration is incompatible.`,
    changed: `${title}'s source configuration has changed and should be rebound.`,
    unavailable: 'Cyrune Arcade is unavailable.'
  };
  return status?.error || messages[status?.state] || `${title} is not ready to launch.`;
}

function getGameStatusPresentation(status = {}) {
  const labels = {
    checking: 'Checking',
    unbound: 'Set up',
    'library-missing': 'Library',
    'game-missing': 'Missing',
    'emulator-missing': 'Emulator',
    'profile-missing': 'Profile',
    incompatible: 'Incompatible',
    changed: 'Changed',
    unavailable: 'Offline'
  };
  return {
    label: status.state === 'ready' ? 'Ready' : (labels[status.state] || 'Unavailable'),
    title: status.state === 'ready' ? 'Ready to launch' : getGameStatusMessage(status, 'This game')
  };
}

async function refreshGameStatus(item, options = {}) {
  if (!item?.gameKey || typeof bridge?.getGameStatus !== 'function') return getGameStatus(item);
  if (gameStatusRequests.has(item.gameKey)) return gameStatusRequests.get(item.gameKey);
  const previous = gameStatusCache.get(item.gameKey);
  const request = bridge.getGameStatus(item.gameKey, { includeThumbnail: !item.thumbnailCache }).then(status => {
    const normalized = status || { gameKey: item.gameKey, state: 'unbound', title: item.title || 'Game', thumbnailCache: '' };
    gameStatusCache.set(item.gameKey, normalized);
    let changed = previous?.state !== normalized.state || previous?.versionGroup !== normalized.versionGroup
      || JSON.stringify(previous?.defaultVersion) !== JSON.stringify(normalized.defaultVersion)
      || JSON.stringify(getGameLanguageDescriptors(previous?.languages)) !== JSON.stringify(getGameLanguageDescriptors(normalized.languages));
    let portableMetadataChanged = false;
    const canPersistMetadata = (typeof portalReadOnlyMode === 'undefined' || !portalReadOnlyMode)
      && (typeof bridge.storageIsAvailable !== 'function' || bridge.storageIsAvailable());
    if (canPersistMetadata && normalized.thumbnailCache && normalized.thumbnailCache !== item.thumbnailCache) {
      item.thumbnailCache = normalized.thumbnailCache;
      changed = true;
      portableMetadataChanged = true;
    }
    for (const field of ['systemId', 'systemName', 'emulatorName', 'profileName']) {
      const value = String(normalized[field] || '');
      if (canPersistMetadata && value && value !== item[field]) {
        item[field] = value;
        changed = true;
        portableMetadataChanged = true;
      }
    }
    if (portableMetadataChanged) void saveState();
    if (options.render !== false && changed) _renderGameShortcutSurfaces();
    return normalized;
  }).catch(error => {
    const status = { gameKey: item.gameKey, state: 'unavailable', title: item.title || 'Game', thumbnailCache: item.thumbnailCache || '', error: error?.message || '' };
    gameStatusCache.set(item.gameKey, status);
    return status;
  }).finally(() => gameStatusRequests.delete(item.gameKey));
  gameStatusRequests.set(item.gameKey, request);
  return request;
}

async function launchGameShortcut(item) {
  if (!item?.gameKey) return false;
  try {
    await bridge.launchGame(item.gameKey);
    gameStatusCache.set(item.gameKey, { ...getGameStatus(item), state: 'ready' });
    return true;
  } catch (error) {
    const status = await refreshGameStatus(item, { render: false });
    _renderGameShortcutSurfaces();
    showNotice(status.state === 'ready'
      ? (error?.message || `${item.title || 'The game'} could not be launched.`)
      : getGameStatusMessage(status, item.title || 'This game'));
    return false;
  }
}

async function openGameShortcutInArcade(item, options = {}) {
  if (!item?.gameKey) return false;
  try {
    await bridge.openGameInArcade(item.gameKey, { rebind: options.rebind === true });
    return true;
  } catch (error) {
    const status = await refreshGameStatus(item, { render: false });
    showNotice(status.state === 'ready'
      ? (error?.message || 'The game could not be opened in Cyrune Arcade.')
      : getGameStatusMessage(status, item.title || 'This game'));
    return false;
  }
}

async function revealGameShortcut(item) {
  if (!item?.gameKey) return false;
  try {
    await bridge.revealGame(item.gameKey);
    return true;
  } catch (error) {
    const status = await refreshGameStatus(item, { render: false });
    showNotice(status.state === 'ready'
      ? (error?.message || 'The game file could not be revealed.')
      : getGameStatusMessage(status, item.title || 'This game'));
    return false;
  }
}

async function applyExternalGameBindingUpdate(source = {}) {
  const gameKey = String(source.gameKey || '').trim();
  if (!/^game_[a-zA-Z0-9_-]{12,75}$/.test(gameKey)) throw new Error('The updated game binding is invalid.');
  const entries = collectStoredGames().filter(entry => entry.item.gameKey === gameKey);
  if (!entries.length) throw new Error('The game shortcut is no longer in this Hub.');
  const thumbnail = String(source.thumbnailCache || '');
  if (thumbnail && (!/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(thumbnail) || thumbnail.length > 700000)) {
    throw new Error('The updated game thumbnail is invalid.');
  }
  for (const { item } of entries) {
    for (const [field, limit] of [['systemName', 80], ['emulatorName', 120], ['profileName', 120]]) {
      item[field] = String(source[field] || '').trim().slice(0, limit);
    }
    const systemId = String(source.systemId || '').trim().toLowerCase();
    item.systemId = /^[a-z0-9][a-z0-9_-]{0,47}$/.test(systemId) ? systemId : '';
    if (thumbnail) item.thumbnailCache = thumbnail;
  }
  const status = { ...source, gameKey, state: 'ready', thumbnailCache: thumbnail || entries[0].item.thumbnailCache || '' };
  gameStatusCache.set(gameKey, status);
  const saved = await saveState();
  _renderGameShortcutSurfaces();
  showNotice(`${entries[0].item.title || 'Game'} was rebound on this device.`);
  return { ok: saved?.ok !== false, persisted: saved?.persisted || '' };
}

async function forgetGameShortcut(item) {
  if (!item?.gameKey) return false;
  try {
    await bridge.forgetGame(item.gameKey);
    gameStatusCache.set(item.gameKey, { gameKey: item.gameKey, state: 'unbound', title: item.title || 'Game', thumbnailCache: item.thumbnailCache || '' });
    _renderGameShortcutSurfaces();
    showNotice(`${item.title || 'Game'} is no longer bound on this device.`);
    return true;
  } catch (error) {
    showNotice(error?.message || 'The game binding could not be removed.');
    return false;
  }
}

function duplicateGameShortcut(context = contextTarget) {
  const board = getBoardForContext(context) || getActiveBoard();
  let source = context?.item || null;
  let target = null;
  let insertAt = -1;
  if (context?.area === 'essential') {
    source = state.essentials?.[context.slot] || source;
    target = state.essentials;
    insertAt = target.findIndex((item, index) => index > context.slot && !item);
    if (insertAt === -1) insertAt = target.length;
  } else if (context?.area === 'speed-dial-item') {
    source = board?.speedDial?.[context.slot] || source;
    insertAt = firstEmptySpeedDialSlot(board);
    if (insertAt === -1) {
      showNotice('No empty speed dial slot is available.');
      return false;
    }
  } else {
    const found = board ? findBoardItemInColumns(board, context?.itemId) : null;
    if (found?.item) {
      source = found.item;
      target = found.list;
      insertAt = found.list.indexOf(found.item) + 1;
    }
  }
  if (!source || source.type !== 'game') return false;
  pushUndoSnapshot();
  const copy = cloneData(source);
  copy.id = `game-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  copy.title = `${copy.title || 'Game'} (copy)`;
  if (context?.area === 'speed-dial-item') setSpeedDialSlot(board, insertAt, copy);
  else if (target) target.splice(insertAt, context?.area === 'essential' && insertAt < target.length ? 1 : 0, copy);
  else return false;
  renderAll();
  void saveState();
  return true;
}

function collectStoredGames(root = state) {
  const entries = [];
  const walk = (items, metadata, path = [], inheritedLocked = false) => {
    const { includeSlot = false, ...entryMetadata } = metadata;
    for (let index = 0; index < (items || []).length; index += 1) {
      const item = items[index];
      if (!item) continue;
      const locked = inheritedLocked || item.locked === true || entryMetadata.locked === true;
      if (item.type === 'game') {
        entries.push({
          key: [entryMetadata.area, entryMetadata.boardId || '', entryMetadata.tabId || '', entryMetadata.columnId || '', ...path, item.id].join(':'),
          item,
          ...entryMetadata,
          ...(includeSlot ? { slot: index } : {}),
          location: [...entryMetadata.locationParts, ...path].join(' / '),
          locked
        });
      } else if (item.type === 'folder' && !isDynamicFolder(item)) {
        walk(item.children || [], metadata, [...path, item.title || 'Untitled Folder'], locked);
      }
    }
  };
  walk(root.essentials || [], { area: 'essential', locationParts: ['Essentials'], locked: false, includeSlot: true });
  for (const board of (root.boards || [])) {
    walk(board.speedDial || [], { area: 'speed-dial-item', boardId: board.id, locationParts: [board.title || 'Untitled Board', 'Speed Dial'], locked: board.locked === true, includeSlot: true });
    for (const tab of getBoardTabs(board)) {
      for (const column of (tab.columns || [])) {
        walk(column.items || [], { area: 'board', boardId: board.id, tabId: tab.id, columnId: column.id, locationParts: [board.title || 'Untitled Board', tab.title || 'Untitled Tab', column.title || 'Untitled Column'], locked: board.locked === true });
      }
      const inbox = getBoardInbox(board, tab);
      walk(inbox?.items || [], { area: 'inbox', boardId: board.id, tabId: tab.id, columnId: inbox?.id || '', locationParts: [board.title || 'Untitled Board', tab.title || 'Untitled Tab', 'Inbox'], locked: board.locked === true });
    }
  }
  return entries;
}
