const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourceText = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const controller = sourceText.slice(sourceText.indexOf('function showCatalogueReattachmentModal()'), sourceText.indexOf('function showCatalogueRecoveryModal()'));

async function main() {
  const handlers = {};
  const document = { activeElement: null, body: { appendChild() {} }, createElement: () => overlay };
  const element = (action) => ({ disabled: false, hidden: false, textContent: '', dataset: { action },
    focus() { document.activeElement = this; }, closest() { return this; } });
  const buttons = Object.fromEntries(['choose', 'review', 'confirm', 'reload', 'cancel'].map((action) => [action, element(action)]));
  buttons.reload.hidden = true;
  const summary = element();
  const error = element();
  const source = { ...element(), value: '', innerHTML: '', addEventListener(name, fn) { handlers[name] = fn; } };
  const overlay = {
    removed: false, innerHTML: '',
    querySelector(selector) {
      if (selector.includes('source')) return source;
      if (selector.includes('summary')) return summary;
      if (selector.includes('error')) return error;
      return buttons[selector.match(/"(.+)"/)[1]];
    },
    querySelectorAll: () => [source, ...Object.values(buttons)],
    addEventListener(name, fn) { handlers[name] = fn; },
    setAttribute() {}, remove() { this.removed = true; },
  };
  const requests = [];
  let response = async () => ({ sources: [{ collectionId: 'missing', name: '<Fixture>', available: false, writable: true },
    { collectionId: 'other', name: 'Other', available: true, writable: true }] });
  let reloads = 0;
  const context = { document, state: { activeCollection: null }, els: { catalogueReattachment: element() },
    window: { location: { reload() { reloads++; } } },
    escapeHtml: (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    api: async (route, options) => { requests.push({ route, body: JSON.parse(options.body) }); return await response(); },
  };
  vm.createContext(context);
  vm.runInContext(controller, context);
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const click = async (action) => { handlers.click({ target: buttons[action] }); await settle(); };
  context.showCatalogueReattachmentModal();
  await settle();
  assert.equal(requests[0].route, '/api/catalogue-reattachment/sources');
  assert.equal(source.value, 'missing');
  assert.match(source.innerHTML, /&lt;Fixture&gt; \(folder unavailable\)/);
  assert.equal(buttons.choose.disabled, false, 'An unavailable source can be reconnected before library loading');
  await click('review');
  await click('confirm');
  assert.equal(requests.length, 1);
  response = async () => ({ cancelled: true });
  await click('choose');
  assert.equal(buttons.review.disabled, true);
  assert.match(summary.textContent, /cancelled/);
  response = async () => ({ selectionToken: 'picked', folderName: '<New folder>' });
  await click('choose');
  assert.deepEqual(requests.at(-1), { route: '/api/pick-path', body: { kind: 'catalogue-reattachment', collection_id: 'missing' } });
  assert.equal(buttons.review.disabled, false);
  source.value = 'other';
  handlers.change();
  assert.equal(buttons.review.disabled, true);
  await click('choose');
  assert.equal(requests.at(-1).body.collection_id, 'other');
  response = async () => ({ reviewToken: 'reviewed', entries: 12 });
  await click('review');
  assert.deepEqual(requests.at(-1).body, { selection_token: 'picked' });
  assert.equal(buttons.review.disabled, true);
  assert.equal(buttons.confirm.disabled, false);
  assert.match(summary.textContent, /12 retained game files verified/);
  let release;
  response = () => new Promise((resolve) => { release = resolve; });
  await click('confirm');
  const requestCount = requests.length;
  await click('confirm');
  await click('cancel');
  assert.equal(requests.length, requestCount);
  assert.equal(overlay.removed, false);
  assert.deepEqual(requests.at(-1).body, { review_token: 'reviewed' });
  release({ status: 'committed' });
  await settle();
  assert.match(summary.textContent, /Collection reconnected/);
  assert.equal(buttons.confirm.disabled, true);
  await click('reload');
  assert.equal(reloads, 1);
  response = async () => { throw new Error('Changed source'); };
  await click('choose');
  assert.match(error.textContent, /Changed source/);
  assert.equal(buttons.confirm.disabled, true);
  assert.equal(buttons.review.disabled, true);
  handlers.keydown({ key: 'Escape', preventDefault() {} });
  assert.ok(overlay.removed);
  assert.equal(document.activeElement, context.els.catalogueReattachment);
  console.log('Reconnection source selection, picker, review, confirmation and retry flows pass.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
