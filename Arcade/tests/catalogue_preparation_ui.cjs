// Execute the production dialog controller with a minimal DOM and synthetic RPC.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../web/scrape-views.js'),'utf8');
const controller = source.slice(source.indexOf('function showCataloguePreparationModal()'), source.indexOf('function showAddCollectionModal()'));

async function main() {
  const handlers = {};
  const document = { activeElement: null, body: { appendChild() {} }, createElement: () => overlay };
  const element = (action) => ({ disabled: false, textContent: '', dataset: { action }, focus() { document.activeElement = this; }, closest() { return this; } });
  const buttons = { review: element('review'), confirm: element('confirm'), cancel: element('cancel') };
  const summary = element();
  const error = element();
  const overlay = {
    removed: false,
    set innerHTML(value) { this.html = value; buttons.confirm.disabled = true; },
    querySelector(selector) {
      if (selector.includes('summary')) return summary;
      if (selector.includes('error')) return error;
      return buttons[selector.match(/"(.+)"/)[1]];
    },
    querySelectorAll: () => Object.values(buttons),
    addEventListener(name, fn) { handlers[name] = fn; },
    setAttribute() {}, removeAttribute() {}, remove() { this.removed = true; },
  };
  const requests = [];
  let response;
  const state = { activeCollection: { id: 'reviewed-source' }, collections: [{ id: 'reviewed-source', name: '<Synthetic>', available: true, writable: true }] };
  const context = { document, state, els: { version: element() },
    escapeHtml: (text) => text.replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    api: async (route, options) => { requests.push({ route, body: JSON.parse(options.body) }); return await response(); },
  };
  vm.createContext(context);
  vm.runInContext(controller, context);
  const click = (action) => handlers.click({ target: buttons[action] });
  context.showCataloguePreparationModal();
  assert.equal(requests.length, 0, 'Opening a dialog must not prepare or preview automatically');
  assert.ok(overlay.html.includes('&lt;Synthetic&gt;'));
  await click('confirm');
  assert.equal(requests.length, 0, 'Confirmation requires a reviewed token');
  response = async () => ({ reviewToken: 'opaque-review', entries: 2, newEntries: 1, retainedEntries: 1, pinnedIds: 1 });
  await click('review');
  assert.equal(buttons.confirm.disabled, false);
  assert.match(summary.textContent, /2 game files verified/);
  state.activeCollection.id = 'another-source';
  let release;
  response = () => new Promise((resolve) => { release = resolve; });
  const confirming = click('confirm');
  await click('confirm');
  await click('cancel');
  assert.equal(requests.length, 2, 'Double confirmation sends only once');
  assert.equal(overlay.removed, false, 'Cannot dismiss an active mutation');
  assert.deepEqual(requests[1], { route: '/api/catalogue-preparation/confirm', body: { collection_id: 'reviewed-source', review_token: 'opaque-review' } });
  release({ status: 'committed', entries: 2 });
  await confirming;
  assert.equal(buttons.confirm.disabled, true);
  assert.match(summary.textContent, /Collection prepared/);
  assert.match(summary.textContent, /Use Add Game in a Portal board column/);
  await click('confirm');
  assert.equal(requests.length, 2, 'Completed confirmation discards its token');
  response = async () => ({ reviewToken: 'stale', entries: 2, newEntries: 0, retainedEntries: 2, pinnedIds: 0 });
  await click('review');
  response = async () => { throw new Error('The collection changed. Review again.'); };
  await click('confirm');
  assert.equal(buttons.confirm.disabled, true);
  assert.match(error.textContent, /collection changed/);
  assert.match(summary.textContent, /Review preparation again/);
  let prevented = false;
  handlers.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(document.activeElement, buttons.review);
  handlers.keydown({ key: 'Escape', preventDefault() {} });
  assert.ok(overlay.removed);
  assert.equal(document.activeElement, context.els.version);
  console.log('Preparation dialog review, confirmation, race, error and keyboard flows pass.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
