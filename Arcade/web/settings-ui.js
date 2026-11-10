/* Arcade-owned settings presentation over the authenticated Arcade API. */
(function (root) {
  'use strict';
  function open(options) {
    if (document.querySelector('[data-arcade-settings]')) return;
    const {escapeHtml:esc, api} = options;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay'; overlay.dataset.arcadeSettings = '';
    overlay.innerHTML = `<section class="modal arcade-settings-modal" role="dialog" aria-modal="true" aria-labelledby="arcade-settings-title">
      <header class="settings-header"><h2 id="arcade-settings-title" title="Cyrune Arcade v${esc(options.version)}">Settings</h2><div class="settings-header-actions"><button type="button" class="secondary" data-settings-close title="Close Settings. Unsaved drafts are reviewed before discarding. Saved child editors keep their own changes.">Close</button><button type="button" data-settings-save>Save changes</button></div></header>
      <nav class="settings-tabs" aria-label="Settings sections"></nav>
      <div class="settings-content"><h3 class="settings-view-title" data-settings-heading></h3><div class="settings-body" data-settings-body></div>
      <div class="settings-status" data-settings-status role="status" aria-live="polite"></div></div>
    </section>`;
    const previousFocus = document.activeElement;
    const body = overlay.querySelector('[data-settings-body]');
    const status = overlay.querySelector('[data-settings-status]');
    const save = overlay.querySelector('[data-settings-save]');
    const drafts = new Map(), chosen = new Map(), originals = new Map();
    let section = options.platform || 'general', selected = null, generation = 0, busy = false;
    const layout = options.layout();
    let originalLayout = JSON.stringify(layout);
    const tabs = overlay.querySelector('.settings-tabs');
    const collectionPlatform = root.ArcadePlatforms.collection;
    const report = error => { status.textContent = error.message || String(error); status.classList.add('error'); };
    const dirtyNames = () => [
      ...(JSON.stringify(layout) !== originalLayout ? ['General layout'] : []),
      ...[...drafts].filter(([id, draft]) => JSON.stringify(draft) !== originals.get(id))
        .map(([id, draft]) => draft.name || options.collections().find(item => item.id === id)?.name || 'Library')
    ];
    const markDirty = () => {
      const generalDirty = JSON.stringify(layout) !== originalLayout;
      tabs.querySelectorAll('[data-settings-tab]').forEach(tab => {
        const id = tab.dataset.settingsTab;
        const dirty = id === 'general' ? generalDirty : options.collections().some(collection =>
          collectionPlatform(collection) === id && drafts.has(collection.id)
          && JSON.stringify(drafts.get(collection.id)) !== originals.get(collection.id));
        tab.dataset.dirty = String(dirty);
        tab.title = dirty ? 'Unsaved changes' : '';
      });
      overlay.querySelector('[data-settings-close]').textContent = dirtyNames().length ? 'Cancel…' : 'Close';
      save.textContent = section === 'general' ? 'Save layout' : 'Save library settings';
    };
    const close = () => {
      if (busy) return;
      sync();
      const names = dirtyNames();
      if (names.length) {
        status.innerHTML = `Unsaved changes: ${names.map(esc).join(', ')}.
          <button type="button" data-settings-discard>Discard unsaved changes</button>
          <button type="button" class="secondary" data-settings-keep>Keep editing</button>`;
        status.querySelector('[data-settings-keep]').focus();
        return;
      }
      ++generation; overlay.remove(); previousFocus?.focus();
    };
    root.ArcadeDialogs.mount(overlay, {close});
    const sync = () => {
      if (section === 'general') {
        for (const key of ['sidebar','details']) {
          const input = body.querySelector(`[data-layout="${key}"]`);
          if (input) layout[key] = input.checked;
        }
      } else if (selected && drafts.has(selected.id)) {
        const draft = drafts.get(selected.id);
        body.querySelectorAll('[data-library-field]').forEach(input => { draft[input.dataset.libraryField] = input.value; });
      }
      markDirty();
    };
    const field = (key, label, value, kind) => `<label class="library-setting"><span>${label}</span>
      <div class="path-picker-row"><input id="library-${key}" data-library-field="${key}" type="text" value="${esc(value || '')}" maxlength="${key === 'name' ? 160 : 2048}">
      ${kind ? `<button type="button" class="secondary" data-settings-action="browse" data-target="#library-${key}" data-kind="${kind}">Browse…</button>` : ''}</div></label>`;
    const actionButton = (action, text, disabled = false) => `<button type="button" class="secondary" data-settings-action="${action}"${disabled ? ' disabled' : ''}>${text}</button>`;
    const draw = async () => {
      const token = ++generation;
      status.textContent = ''; status.classList.remove('error'); selected = null;
      tabs.innerHTML = [['general','General'], ...Object.entries(options.platforms)].map(([id,name]) =>
        `<button type="button" class="settings-tab" data-settings-tab="${id}" aria-current="${section === id ? 'page' : 'false'}">
        ${options.renderIcon?.(id, 22) || ''}${name}</button>`).join('');
      overlay.querySelector('[data-settings-heading]').textContent = section === 'general' ? 'General' : options.platforms[section] || 'Library';
      markDirty();
      save.disabled = false;
      save.textContent = section === 'general' ? 'Save layout' : 'Save library settings';
      if (section === 'general') {
        body.innerHTML = `<section class="settings-section"><h3>Interface</h3>
          <label class="settings-check"><input type="checkbox" data-layout="sidebar" ${layout.sidebar ? 'checked' : ''}> Show navigation and filters</label>
          <label class="settings-check"><input type="checkbox" data-layout="details" ${layout.details ? 'checked' : ''}> Show game details</label></section>
          <section class="settings-section"><h3 title="Choose providers and manage their connection settings.">Metadata</h3>${actionButton('providers','Metadata Providers…')}</section>
          <section class="settings-section"><h3>Collection maintenance</h3><div class="settings-action-row">${actionButton('recovery','Recover interrupted change…')}${actionButton('reconnect','Reconnect Collection…')}</div></section>`;
        return;
      }
      const collections = options.collections().filter(item => collectionPlatform(item) === section);
      selected = collections.find(item => item.id === chosen.get(section)) || collections.find(item => item.id === options.active()?.id) || collections[0];
      if (!selected) {
        body.innerHTML = `<p>No ${esc(options.platforms[section])} collection is configured.</p>${section === 'zx-spectrum' ? actionButton('add','Add Collection…') : ''}`;
        save.disabled = true; return;
      }
      chosen.set(section, selected.id);
      const collection = selected;
      body.innerHTML = '<p>Loading library settings…</p>'; save.disabled = true;
      try {
        if (!drafts.has(collection.id)) {
          const result = await api('/api/collection-settings?collection_id=' + encodeURIComponent(collection.id));
          drafts.set(collection.id, {...result.settings});
          originals.set(collection.id, JSON.stringify(result.settings));
        }
        if (token !== generation || !overlay.isConnected) return;
        const draft = drafts.get(collection.id);
        body.innerHTML = `<section class="settings-section"><h3>Library</h3>
          <label class="library-setting"><span>Collection</span><select data-settings-collection>${collections.map(item => `<option value="${esc(item.id)}"${item.id === collection.id ? ' selected' : ''}>${esc(item.name)}${drafts.has(item.id) && JSON.stringify(drafts.get(item.id)) !== originals.get(item.id) ? ' • unsaved' : ''}</option>`).join('')}</select></label>
          ${field('name','Display name',draft.name)}<div title="Changing the folder does not move games. Existing Portal shortcuts may need reconnecting.">${field('root','Library folder',draft.root,'folder')}</div>
          ${section === 'scummvm' ? field('scummvm_config','ScummVM configuration file',draft.scummvm_config,'file') : ''}
          </section><section class="settings-section"><h3 title="Manage compatible emulators, their settings and the collection default.">Emulators</h3>${actionButton('emulators','Emulators &amp; Profiles…')}</section>
          <section class="settings-section"><h3>Library tools</h3><div class="settings-action-row">${actionButton('open','Open Library')}${actionButton('rebuild','Rebuild Index',!collection.available)}${section === 'zx-spectrum' ? actionButton('add','Add Collection…') : ''}${collection.writable ? actionButton('prepare','Preserve IDs for relocation…',!collection.available) : ''}</div></section>`;
        save.disabled = false;
      } catch (error) { if (token === generation) report(error); }
    };
    const childAction = async (action, collection) => {
      // Existing editors keep their own explicit Save/Cancel workflows.
      const before = new Set(document.querySelectorAll('.modal-overlay'));
      await options.action(action, collection);
      const child = [...document.querySelectorAll('.modal-overlay')].find(item => !before.has(item));
      if (!child) return;
      overlay.hidden = true;
      const observer = new MutationObserver(() => {
        if (child.isConnected) return;
        observer.disconnect();
        if (overlay.isConnected) { overlay.hidden = false; tabs.querySelector('[aria-current="page"]')?.focus(); }
      });
      observer.observe(document.body, {childList:true});
    };
    overlay.addEventListener('input', sync);
    overlay.addEventListener('change', async event => {
      if (event.target.matches('[data-settings-collection]')) { sync(); chosen.set(section,event.target.value); await draw(); }
    });
    overlay.addEventListener('click', async event => {
      if (busy) return;
      const button = event.target.closest('button');
      if (button?.hasAttribute('data-settings-discard')) { ++generation; overlay.remove(); previousFocus?.focus(); return; }
      if (button?.hasAttribute('data-settings-keep')) { status.textContent = ''; body.querySelector('input,button,select')?.focus(); return; }
      if (event.target === overlay || button?.hasAttribute('data-settings-close')) { close(); return; }
      if (!button) return;
      if (button.dataset.settingsTab) { sync(); section = button.dataset.settingsTab; await draw(); tabs.querySelector('[aria-current="page"]')?.focus(); return; }
      sync();
      try {
        if (button.hasAttribute('data-settings-save')) {
          busy = true; save.disabled = true; overlay.setAttribute('aria-busy','true');
          if (section === 'general') { options.saveLayout({...layout}); originalLayout = JSON.stringify(layout); }
          else if (selected && drafts.has(selected.id)) {
            const draft = drafts.get(selected.id);
            const payload = {collection_id:selected.id, revision:draft.revision, name:draft.name, root:draft.root,
              ...(section === 'scummvm' ? {scummvm_config:draft.scummvm_config} : {})};
            const result = await api('/api/collection-settings', {method:'POST', body:JSON.stringify(payload)});
            drafts.set(selected.id, {...result.settings});
            originals.set(selected.id, JSON.stringify(result.settings));
            await options.saved();
          }
          status.classList.remove('error'); status.textContent = dirtyNames().length ? 'Unsaved changes: ' + dirtyNames().join(', ') : '';
          markDirty();
          save.textContent = 'Saved';
        } else if (button.dataset.settingsAction === 'browse') {
          busy = true; await options.pickPathInto(body,button); sync();
        } else if (button.dataset.settingsAction) {
          const action = button.dataset.settingsAction;
          await childAction(action,selected);
        }
      } catch (error) { report(error); }
      finally { busy = false; save.disabled = section !== 'general' && !drafts.has(selected?.id); overlay.removeAttribute('aria-busy'); }
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      const category = event.target.closest('[data-settings-tab]');
      if (category && ['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Home','End'].includes(event.key)) {
        event.preventDefault();
        const categories = [...tabs.querySelectorAll('[data-settings-tab]')], current = categories.indexOf(category);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1
          : (current + (['ArrowDown','ArrowRight'].includes(event.key) ? 1 : -1) + categories.length) % categories.length;
        categories[next].click();
      }
      if (event.key !== 'Tab') return;
      const controls = [...overlay.querySelectorAll('button,input,select')].filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    });
    void draw().then(() => tabs.querySelector('[aria-current="page"]')?.focus());
  }
  root.ArcadeSettingsUI = Object.freeze({open});
})(globalThis);
