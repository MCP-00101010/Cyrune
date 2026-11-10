/* Local presentation order only: no collection or launch authority. */
globalThis.ArcadeNavigationOrder = (() => {
  const key = 'cyruneArcadeNavigationOrderV1';
  const valid = id => typeof id === 'string' && /^[a-z0-9_-]{1,120}$/i.test(id);
  const clean = value => Array.isArray(value) ? [...new Set(value.filter(valid))].slice(0, 128) : [];
  let saved = {};
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    saved = Object.fromEntries(Object.entries(value || {}).filter(([scope]) =>
      scope === 'platforms' || /^emulators:[a-z0-9_-]{1,80}$/i.test(scope))
      .slice(0, 128).map(([scope, ids]) => [scope, clean(ids)]));
  } catch (_) { /* Keep ordering usable when local storage is unavailable. */ }
  const controllers = new WeakMap();
  function ordered(scope, ids) {
    const available = clean(ids);
    return [...(saved[scope] || []).filter(id => available.includes(id)),
      ...available.filter(id => !(saved[scope] || []).includes(id))];
  }
  function remember(scope, ids) {
    // Retain temporarily unavailable emulators so reconnecting them preserves order.
    saved[scope] = clean([...ids, ...(saved[scope] || [])]);
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch (_) { /* Session order remains usable. */ }
  }
  function attach(container, scope, attribute) {
    controllers.get(container)?.destroy();
    let drag = null, suppressClick = false, timer;
    const selector = `[${attribute}]`;
    const items = () => [...container.children].filter(el => el.matches(selector) && !el.classList.contains('navigation-drag-preview'));
    const id = el => el.getAttribute(attribute);
    const arrange = () => {
      const nodes = new Map(items().map(el => [id(el), el]));
      ordered(scope, [...nodes.keys()]).forEach(value => container.append(nodes.get(value)));
    };
    arrange();
    items().forEach(el => {
      el.draggable = true;
      el.title += ' · Drag to reorder; Alt+Arrow keys to move';
      el.querySelectorAll('img').forEach(image => { image.draggable = false; });
    });
    const cleanup = () => {
      if (!drag) return;
      drag.source.classList.remove('navigation-drag-source');
      drag.preview.remove(); drag.ghost.remove(); drag = null;
    };
    const clone = source => {
      const copy = source.cloneNode(true);
      copy.removeAttribute(attribute); copy.removeAttribute('id'); copy.removeAttribute('draggable');
      copy.setAttribute('aria-hidden', 'true'); copy.tabIndex = -1;
      copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      copy.querySelectorAll('img').forEach(image => { image.draggable = false; });
      return copy;
    };
    const start = event => {
      const source = event.target.closest(selector);
      if (!source || source.parentElement !== container || source.disabled) return;
      cleanup();
      const rect = source.getBoundingClientRect();
      const ghost = clone(source);
      ghost.classList.add('navigation-drag-ghost');
      Object.assign(ghost.style, {width:`${rect.width}px`, height:`${rect.height}px`});
      container.append(ghost);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id(source));
      event.dataTransfer.setDragImage(ghost, event.clientX - rect.left, event.clientY - rect.top);
      const preview = clone(source);
      preview.classList.add('navigation-drag-preview');
      // Capture original geometry before preview insertion can move surrounding tiles.
      drag = {source, preview, ghost, before:items()[items().indexOf(source) + 1] || null,
        geometry:items().map(el => ({el, rect:el.getBoundingClientRect()}))};
      const current = drag;
      requestAnimationFrame(() => {
        ghost.remove();
        if (drag !== current) return;
        source.classList.add('navigation-drag-source');
        if (preview.parentElement !== container) container.insertBefore(preview, current.before);
      });
    };
    const over = event => {
      if (!drag) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      const tiles = drag.geometry;
      const target = tiles.find(({rect}) => event.clientY < rect.bottom &&
        (event.clientY < rect.top || event.clientX < rect.left + rect.width / 2));
      let before = target?.el || null;
      if (before === drag.source) before = tiles[tiles.findIndex(tile => tile.el === drag.source) + 1]?.el || null;
      if (before === drag.before) return;
      drag.before = before;
      container.insertBefore(drag.preview, before);
    };
    const drop = event => {
      if (!drag) return;
      event.preventDefault(); event.stopPropagation();
      const source = drag.source;
      container.insertBefore(source, drag.before);
      cleanup(); remember(scope, items().map(id));
      source.focus({preventScroll:true});
      suppressClick = true; clearTimeout(timer);
      timer = setTimeout(() => { suppressClick = false; }, 250);
    };
    const click = event => {
      if (drag || suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const keyboard = event => {
      if (!event.altKey || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      const source = event.target.closest(selector), nodes = items(), index = nodes.indexOf(source);
      const direction = ['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1;
      if (index < 0) return;
      event.preventDefault();
      const target = nodes[index + direction];
      if (!target) return;
      container.insertBefore(source, direction < 0 ? target : target.nextElementSibling);
      remember(scope, items().map(id)); source.focus({preventScroll:true});
    };
    container.addEventListener('dragstart', start);
    container.addEventListener('dragover', over);
    container.addEventListener('drop', drop);
    container.addEventListener('dragend', cleanup);
    container.addEventListener('click', click, true);
    container.addEventListener('keydown', keyboard);
    controllers.set(container, {destroy() {
      cleanup(); clearTimeout(timer);
      container.removeEventListener('dragstart', start);
      container.removeEventListener('dragover', over);
      container.removeEventListener('drop', drop);
      container.removeEventListener('dragend', cleanup);
      container.removeEventListener('click', click, true);
      container.removeEventListener('keydown', keyboard);
    }});
  }
  return {attach, ordered};
})();
