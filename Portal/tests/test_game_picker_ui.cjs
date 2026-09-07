const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, '..', 'source', name), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

// A small DOM fixture executes the real dialog and controller. Browser layout
// and native direct-file acceptance are separate rollout gates.
function documentFixture() {
  const document = { activeElement: null };
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.listeners = {}; this.value = ''; this.scrollTop = 0; }
    setAttribute(name, value) {
      this.attrs[name] = value;
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      if (['type', 'value'].includes(name)) this[name] = value;
      if (['disabled', 'hidden', 'checked'].includes(name)) this[name] = true;
    }
    append(...elements) { elements.forEach(element => this.appendChild(element)); }
    appendChild(element) { element.parent = this; this.children.push(element); return element; }
    replaceChildren(...elements) { this.children.forEach(child => { child.parent = null; }); this.children = []; this.append(...elements); this._text = ''; }
    set textContent(value) { this.replaceChildren(); this._text = value; }
    get textContent() { return (this._text || '') + this.children.map(child => child.textContent).join(''); }
    set innerHTML(html) {
      this.replaceChildren(); const stack = [this];
      for (const token of html.matchAll(/<\/?[^>]+>|[^<]+/g)) {
        const value = token[0];
        if (value.startsWith('</')) { stack.pop(); continue; }
        if (!value.startsWith('<')) { stack.at(-1)._text = (stack.at(-1)._text || '') + value; continue; }
        const tag = /^<([\w-]+)/.exec(value)[1]; const element = new Element(tag);
        for (const attr of value.slice(tag.length + 1, -1).matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) element.setAttribute(attr[1], attr[2] || '');
        stack.at(-1).appendChild(element); if (!['input', 'img', 'br'].includes(tag)) stack.push(element);
      }
    }
    matches(selector) {
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector.trim());
      if (attr) {
        const value = attr[1] === 'data-picker-focus' ? this.dataset.pickerFocus : this.attrs[attr[1]];
        return value !== undefined && (attr[2] === undefined || value === attr[2]);
      }
      return this.tagName === selector.trim();
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(selector.split(',').some(part => child.matches(part)) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    fire(type, fields = {}) {
      const event = { target: this, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...fields };
      for (const callback of this.listeners[type] || []) callback(event);
      return event;
    }
    focus() { if (!this.disabled) document.activeElement = this; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    get isConnected() { return this === document.body || !!this.parent?.isConnected; }
    getClientRects() { return this.hidden ? [] : [{}]; }
  }
  document.createElement = tag => new Element(tag); document.body = new Element('body');
  return document;
}
function harness({ enabled = true, pending = null, multiple = false } = {}) {
  const document = documentFixture(), saves = [], notices = [], searches = [];
  const previous = document.createElement('button'); document.body.appendChild(previous); previous.focus();
  const game = { catalogueId: 'one', sourceId: 'source', entryRevision: 'revision', title: '<img src=x onerror=bad()>',
    platformId: 'zx-spectrum', platformLabel: 'ZX Spectrum', hardwareLabel: '48K', editionLabel: 'Original', targetKind: 'media-file',
    year: '1983', publisher: 'Ultimate', availability: 'ready', artworkRef: '' };
  const context = vm.createContext({ document, TextEncoder, crypto: { randomUUID: () => 'request' }, setTimeout, clearTimeout,
    showNotice: message => notices.push(message),
    bridge: { catalogueIsAvailable: () => enabled, catalogueSession: () => 1,
      searchArcadeCatalogue: async payload => { searches.push(payload); return { ok: true, schemaVersion: 1, catalogueRevision: 'catalogue',
        entries: multiple ? [game, { ...game, catalogueId: 'two', availability: 'available', hardwareLabel: '128K' }] : [game], nextCursor: '' }; },
      getArcadeCatalogueEntry: async () => ({ ok: true, schemaVersion: 1, entry: { ...game, description: 'Description', suggestedTags: [], countries: [], languages: [] } }),
      bindArcadeCatalogueEntries: async payload => { if (pending) await pending; return { ok: true, schemaVersion: 1, requestId: payload.requestId,
        results: [{ catalogueId: 'one', ok: true, game: { title: game.title, systemId: 'zx-spectrum', systemName: 'ZX Spectrum', gameKey: 'game_abcdefghijklmnop', state: 'ready', tags: [] } }] }; } },
    resolveGamePickerDestination: destination => { assert.equal(destination.columnId, 'column'); return { title: 'Games' }; },
    prepareForExternalDelivery: async () => ({ ok: true }), persistGamePickerBatch: async (destination, games) => { saves.push({ destination, games }); return { ok: true }; }
  });
  vm.runInContext(source('game-picker.js'), context); vm.runInContext(source('game-picker-ui.js'), context);
  context.showArcadeGamePicker({ boardId: 'board', tabId: 'tab', columnId: 'column' });
  const overlay = document.body.children[1];
  return { document, context, previous, overlay, saves, notices, searches, find: name => overlay.querySelector(`[data-picker-${name}]`) };
}

test('second library result remains selectable and selection keeps existing row controls', async () => {
  const h = harness({ multiple: true }); await tick();
  const [first, second] = h.find('results').querySelectorAll('input');
  assert.equal(second.disabled, false);
  second.focus(); second.fire('change');
  assert.equal(second.checked, true);
  assert.equal(first.checked, false);
  assert.equal(h.find('results').querySelectorAll('input')[1], second);
  first.fire('change');
  assert.equal(h.find('selection-summary').textContent, 'Selected games (2)');
  second.fire('change');
  assert.equal(h.find('selection-summary').textContent, 'Selected games (1)');
  assert.equal(first.checked, true);
  h.find('close').fire('click');
});

test('disabled catalogue capability cannot open the dialog or query the catalogue', () => {
  const h = harness({ enabled: false });
  assert.equal(h.overlay, undefined); assert.equal(h.searches.length, 0); assert.equal(h.notices.length, 1);
});

test('dialog renders metadata as text, preserves selection focus and cancels without saving', async () => {
  const h = harness(); await tick();
  assert.equal(h.document.activeElement, h.find('query')); assert.equal(h.find('tags').checked, undefined);
  assert.match(h.find('results').textContent, /<img src=x onerror=bad\(\)>/);
  assert.equal(h.find('results').querySelector('img'), null);
  const check = h.find('results').querySelector('input'); check.focus(); h.find('results').scrollTop = 50; check.fire('change');
  assert.equal(h.document.activeElement.dataset.pickerFocus, 'select:one'); assert.equal(h.find('results').scrollTop, 50);
  assert.equal(h.find('selection-summary').textContent, 'Selected games (1)'); assert.equal(h.find('add').disabled, false);
  h.find('query').value = 'Jetpac'; h.overlay.querySelector('form').fire('submit'); await tick();
  assert.equal(h.searches.at(-1).query, 'Jetpac'); assert.equal(h.find('selection-summary').textContent, 'Selected games (1)');
  h.find('close').focus(); assert.equal(h.overlay.fire('keydown', { key: 'Tab' }).prevented, true);
  assert.equal(h.document.activeElement, h.find('query'));
  const escape = h.overlay.fire('keydown', { key: 'Escape' });
  assert.equal(escape.stopped, true); assert.equal(h.overlay.isConnected, false);
  assert.equal(h.document.activeElement, h.previous); assert.equal(h.saves.length, 0);
});

test('dialog blocks dismissal and duplicate additions while binding and reports the saved batch', async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ pending }); await tick();
  h.find('results').querySelector('input').fire('change'); h.find('add').fire('click'); await tick();
  assert.equal(h.find('close').disabled, true); assert.equal(h.find('add').disabled, true);
  h.overlay.fire('keydown', { key: 'Escape' }); h.find('add').fire('click');
  assert.equal(h.overlay.isConnected, true); assert.equal(h.saves.length, 0);
  finish(); await tick();
  assert.equal(h.saves.length, 1); assert.equal(h.saves[0].destination.columnId, 'column');
  assert.match(h.find('status').textContent, /1 games saved; 0/); assert.equal(h.find('close').textContent, 'Done');
  h.find('close').fire('click'); assert.equal(h.overlay.isConnected, false);
});
