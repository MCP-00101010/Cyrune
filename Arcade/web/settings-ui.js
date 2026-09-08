/* Arcade-owned settings presentation over the authenticated Arcade API. */
(function (root) {
  'use strict';
  function open(options) {
    if (document.querySelector('[data-arcade-settings]')) return;
    const {escapeHtml:esc, api} = options;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay'; overlay.dataset.arcadeSettings = '';
    overlay.innerHTML = `<section class="modal arcade-settings-modal" role="dialog" aria-modal="true" aria-labelledby="arcade-settings-title">
      <header class="settings-header"><h2 id="arcade-settings-title">Cyrune Arcade Settings</h2><span>v${esc(options.version)}</span></header>
      <nav class="settings-tabs" aria-label="Settings sections"></nav>
      <div class="settings-body" data-settings-body></div>
      <p class="settings-status" data-settings-status role="status" aria-live="polite"></p>
      <footer class="modal-actions"><button type="button" data-settings-save>Save Changes</button><button type="button" class="secondary" data-settings-close>Cancel</button></footer>
    </section>`;
    document.body.appendChild(overlay);
    const previousFocus = document.activeElement;
    const body = overlay.querySelector('[data-settings-body]');
    const status = overlay.querySelector('[data-settings-status]');
    const save = overlay.querySelector('[data-settings-save]');
    const drafts = new Map(), chosen = new Map();
    let section = options.platform || 'general', selected = null, generation = 0, busy = false;
    const layout = options.layout();
    const tabs = overlay.querySelector('.settings-tabs');
    const collectionPlatform = root.ArcadePlatforms.collection;
    const report = error => { status.textContent = error.message || String(error); status.classList.add('error'); };
    const close = () => { if (!busy) { ++generation; overlay.remove(); previousFocus?.focus(); } };
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
      save.disabled = false;
      save.textContent = section === 'general' ? 'Save Layout' : 'Save Library Settings';
      if (section === 'general') {
        body.innerHTML = `<section class="settings-section"><h3>Interface</h3>
          <label class="settings-check"><input type="checkbox" data-layout="sidebar" ${layout.sidebar ? 'checked' : ''}> Show navigation and filters</label>
          <label class="settings-check"><input type="checkbox" data-layout="details" ${layout.details ? 'checked' : ''}> Show game details</label></section>
          <section class="settings-section"><h3>Metadata</h3><p>Choose providers and manage their connection settings.</p>${actionButton('providers','Metadata Providers…')}</section>
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
        }
        if (token !== generation || !overlay.isConnected) return;
        const draft = drafts.get(collection.id);
        body.innerHTML = `<section class="settings-section"><h3>Library</h3>
          <label class="library-setting"><span>Collection</span><select data-settings-collection>${collections.map(item => `<option value="${esc(item.id)}"${item.id === collection.id ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
          ${field('name','Display name',draft.name)}${field('root','Library folder',draft.root,'folder')}
          ${section === 'scummvm' ? field('scummvm_config','ScummVM configuration file',draft.scummvm_config,'file') : ''}
          <p>Changing the folder does not move games. Existing Portal shortcuts may need reconnecting.</p>
          </section><section class="settings-section"><h3>Emulators</h3><p>Manage compatible emulators, their settings and the collection default.</p>${actionButton('emulators','Emulators &amp; Profiles…')}</section>
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
      if (event.target === overlay || button?.hasAttribute('data-settings-close')) { close(); return; }
      if (!button) return;
      if (button.dataset.settingsTab) { sync(); section = button.dataset.settingsTab; await draw(); tabs.querySelector('[aria-current="page"]')?.focus(); return; }
      sync();
      try {
        if (button.hasAttribute('data-settings-save')) {
          busy = true; save.disabled = true; overlay.setAttribute('aria-busy','true');
          if (section === 'general') options.saveLayout(layout);
          else if (selected && drafts.has(selected.id)) {
            const draft = drafts.get(selected.id);
            const payload = {collection_id:selected.id, revision:draft.revision, name:draft.name, root:draft.root,
              ...(section === 'scummvm' ? {scummvm_config:draft.scummvm_config} : {})};
            const result = await api('/api/collection-settings', {method:'POST', body:JSON.stringify(payload)});
            drafts.set(selected.id, {...result.settings});
            await options.saved();
          }
          status.classList.remove('error'); status.textContent = 'Settings saved.';
          overlay.querySelector('[data-settings-close]').textContent = 'Close';
        } else if (button.dataset.settingsAction === 'browse') {
          busy = true; await options.pickPathInto(body,button); sync();
        } else if (button.dataset.settingsAction) {
          const action = button.dataset.settingsAction;
          if (['open','rebuild','prepare','add'].includes(action)) { close(); await options.action(action,selected); }
          else await childAction(action,selected);
        }
      } catch (error) { report(error); }
      finally { busy = false; save.disabled = section !== 'general' && !drafts.has(selected?.id); overlay.removeAttribute('aria-busy'); }
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
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
