/* Arcade-owned presentation lifecycle. No transport or collection authority. */
(() => {
  'use strict';
  const requests = new WeakMap();
  const localDialogs = new WeakSet();
  function topDialog() {
    return [...document.querySelectorAll('.modal-overlay')].filter(el => !el.hidden && el.getClientRects().length).at(-1);
  }
  function controls(overlay) {
    return [...overlay.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
  }
  function busy(overlay) {
    return (requests.get(overlay) || 0) > 0 || overlay.matches('[aria-busy="true"]')
      || !!overlay.querySelector('[aria-busy="true"]');
  }
  function mount(overlay, options = {}) {
    if (options.localOnly === true) localDialogs.add(overlay);
    const previous = document.activeElement;
    document.body.appendChild(overlay);
    const dialog = overlay.querySelector('.modal') || overlay;
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    const heading = dialog.querySelector('h2');
    if (heading && !dialog.hasAttribute('aria-labelledby')) {
      heading.id ||= `arcade-dialog-${++mount.sequence}`;
      dialog.setAttribute('aria-labelledby', heading.id);
    }
    const dismiss = () => {
      if (busy(overlay)) return;
      if (options.close) { options.close(); return; }
      const cancel = overlay.querySelector('[data-action="cancel"], [data-action="close"], [data-settings-close], [data-prop-cancel], [data-version-close], [data-delivery-close], [data-bulk-close], [data-care-close], [data-close-preview]');
      if (cancel && !cancel.disabled) cancel.click();
      else if (!cancel) overlay.remove();
    };
    overlay.addEventListener('keydown', event => {
      if (topDialog() !== overlay) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); dismiss();
      } else if (event.key === 'Tab') {
        const items = controls(overlay), first = items[0], last = items.at(-1);
        if (!items.length || event.shiftKey && document.activeElement === first
          || !event.shiftKey && document.activeElement === last || !dialog.contains(document.activeElement)) {
          event.preventDefault(); event.stopImmediatePropagation();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    }, true);
    overlay.addEventListener('click', event => {
      if (topDialog() !== overlay) return;
      if (busy(overlay) && !event.target.closest('[data-delivery-stop], [data-bulk-stop]')) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (event.target === overlay) { event.stopImmediatePropagation(); dismiss(); }
    }, true);
    const observer = new MutationObserver(() => {
      if (overlay.isConnected) return;
      observer.disconnect();
      if (previous?.isConnected && (!topDialog() || topDialog().contains(previous))) previous.focus({preventScroll:true});
    });
    observer.observe(document.body, {childList:true});
    queueMicrotask(() => { if (overlay.isConnected && topDialog() === overlay) (controls(overlay)[0] || dialog).focus(); });
    return overlay;
  }
  mount.sequence = 0;
  async function request(run) {
    const top = topDialog();
    const overlay = top && !localDialogs.has(top) ? top : null;
    if (overlay) requests.set(overlay, (requests.get(overlay) || 0) + 1);
    try { return await run(); }
    finally { if (overlay) requests.set(overlay, Math.max(0, (requests.get(overlay) || 1) - 1)); }
  }
  globalThis.ArcadeDialogs = Object.freeze({mount, request});

  function menuKeys(event, menu, close, parent) {
    const items = [...menu.querySelectorAll('button:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    const key = event.key;
    if (['ArrowDown','ArrowUp','Home','End'].includes(key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const next = key === 'Home' ? 0 : key === 'End' ? items.length - 1
        : (index + (key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (key === 'ArrowLeft' && parent) {
      event.preventDefault(); event.stopImmediatePropagation();
      menu.remove(); parent.setAttribute('aria-expanded','false'); parent.focus();
    } else if (key === 'Escape' || key === 'Tab') {
      if (key === 'Escape') event.preventDefault();
      event.stopImmediatePropagation(); close(); parent?.focus();
    }
  }
  function position(menu, x, y) {
    menu.style.left = `${x}px`; menu.style.top = `${y}px`;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(x, innerWidth - rect.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, innerHeight - rect.height - 4))}px`;
  }
  function submenu(trigger, html, onClick) {
    document.querySelectorAll('.arcade-submenu').forEach(menu => {
      menu._trigger?.setAttribute('aria-expanded','false'); menu.remove();
    });
    const menu = document.createElement('div');
    menu.className = 'context-menu arcade-submenu'; menu.setAttribute('role','menu');
    menu._trigger = trigger; menu.innerHTML = html;
    menu.querySelectorAll('button').forEach(button => { button.type = 'button'; button.setAttribute('role','menuitem'); });
    document.body.appendChild(menu);
    const rect = trigger.getBoundingClientRect();
    const width = menu.getBoundingClientRect().width;
    position(menu, rect.right + width + 4 > innerWidth ? rect.left - width - 2 : rect.right + 2, rect.top);
    trigger.setAttribute('aria-expanded','true');
    menu.addEventListener('click', onClick);
    menu.addEventListener('keydown', event => menuKeys(event, menu, () => {
      if (globalThis.hideContextMenu) globalThis.hideContextMenu({restoreFocus:true});
      else document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
    }, trigger), true);
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  function show(event, actions) {
    event.preventDefault(); event.stopPropagation();
    document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
    const previous = document.activeElement;
    const menu = document.createElement('div'); menu.className = 'context-menu'; menu.setAttribute('role','menu');
    let group = '';
    for (const action of actions) {
      if (group && group !== action.group) { const divider = document.createElement('div'); divider.className='context-separator'; divider.setAttribute('role','separator'); menu.appendChild(divider); }
      group = action.group;
      const button = document.createElement('button'); button.type='button'; button.textContent=action.label;
      button.setAttribute('role','menuitem'); button.disabled=!!action.disabled;
      if (group === 'remove') button.classList.add('danger');
      button.addEventListener('click', () => { menu.remove(); previous?.focus(); void action.run(); }); menu.appendChild(button);
    }
    document.body.appendChild(menu); position(menu,event.clientX,event.clientY);
    menu.addEventListener('keydown', event => menuKeys(event,menu,() => {menu.remove();previous?.focus();}));
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  globalThis.ArcadeMenus = Object.freeze({submenu, show});

  function refresh() {
    const root = document.documentElement;
    const scale = parseFloat(getComputedStyle(root).fontSize) / 16;
    root.dataset.arcadeCompact = String(innerWidth < 1100 * scale);
    root.dataset.arcadeNarrow = String(innerWidth < 700 * scale);
    const text = document.querySelector('.game-row .title-text') || document.body;
    const configured = getComputedStyle(root).getPropertyValue?.('--arcade-bookmark-font-size')?.trim() || '';
    const configuredPixels = configured.endsWith('rem') ? parseFloat(configured) * 16 * scale : parseFloat(configured) || 0;
    const font = Math.max(configuredPixels, parseFloat(getComputedStyle(document.body).fontSize), parseFloat(getComputedStyle(text).fontSize));
    const row = Math.max(38, Math.ceil(38 * scale), Math.ceil(font * 1.35 + 19));
    root.style.setProperty('--arcade-row-height', `${row}px`);
    window.dispatchEvent(new CustomEvent('arcade:appearance-changed', {detail:{rowHeight:row}}));
  }
  globalThis.ArcadeAppearance = Object.freeze({refresh});
  window.addEventListener('resize', refresh);
  window.addEventListener('cyrune:settings-applied', refresh);
  refresh();
})();
