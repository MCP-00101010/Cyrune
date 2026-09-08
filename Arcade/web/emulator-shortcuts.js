/* Platform application links; executable paths and icon extraction stay native. */
globalThis.ArcadeEmulatorShortcuts = {
  create({container, status, api, collectionId}) {
    let generation = 0;
    const icons = new Map();
    const launching = new Set();
    const message = text => { status.textContent = text; status.hidden = !text; };
    return {
      async refresh() {
        const current = ++generation;
        const id = collectionId();
        const valid = () => current === generation && id === collectionId();
        container.replaceChildren(); message('');
        if (!id) return;
        try {
          const result = await api(`/api/emulator-shortcuts?collection_id=${encodeURIComponent(id)}`);
          if (!valid()) return;
          const rows = Array.isArray(result.shortcuts) ? result.shortcuts.slice(0, 64) : [];
          if (!rows.length) { message('No emulators configured.'); return; }
          const images = [];
          for (const emulator of rows) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'emulator-shortcut';
            button.title = `Open ${emulator.name}`; button.setAttribute('aria-label', button.title);
            const image = document.createElement('img'); image.alt = '';
            const key = `${emulator.id}:${emulator.iconRevision}`;
            image.src = icons.get(key) || 'assets/arcade.svg';
            const label = document.createElement('span');
            label.textContent = emulator.name === 'VisualBoyAdvance-M' ? 'VBA-M' : emulator.name;
            button.append(image, label); container.append(button);
            button.addEventListener('click', async () => {
              if (!valid() || launching.has(emulator.id)) return;
              launching.add(emulator.id); button.disabled = true; message('');
              try {
                await api('/api/launch-emulator', {method:'POST', body:JSON.stringify({collection_id:id, emulator_id:emulator.id})});
              } catch (error) { if (valid()) message(error.message || 'The emulator could not be opened.'); }
              finally { launching.delete(emulator.id); button.disabled = false; }
            });
            if (!icons.has(key)) images.push({image, key, emulator});
          }
          // Load one at a time so old platforms do not queue many native reads.
          for (const {image, key, emulator} of images) {
            if (!valid()) break;
            try {
              const result = await api(`/api/emulator-icon?collection_id=${encodeURIComponent(id)}&emulator_id=${encodeURIComponent(emulator.id)}`);
              if (typeof result.icon === 'string' && result.icon.length <= 700000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.icon)) {
                if (icons.size >= 64) icons.delete(icons.keys().next().value);
                icons.set(key, result.icon);
                if (valid()) image.src = result.icon;
              }
            } catch (_) { /* Keep the local fallback icon. */ }
          }
        } catch (error) { if (valid()) message(error.message || 'Emulators could not be loaded.'); }
      }
    };
  }
};
