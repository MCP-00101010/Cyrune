const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../web/scrape-views.js'),'utf8');
const controller = source.slice(source.indexOf('function showCatalogueRecoveryModal()'), source.indexOf('function showCataloguePreparationModal()'));

async function main() {
  const handlers = {};
  const document = { activeElement: null, body: { appendChild() {} }, createElement: () => overlay };
  const element = (action) => ({ disabled: false, hidden: false, textContent: '', dataset: { action },
    focus() { document.activeElement = this; }, closest() { return this; } });
  const buttons = Object.fromEntries(['review', 'confirm', 'reload', 'cancel'].map((action) => [action, element(action)]));
  buttons.reload.hidden = true;
  const status = element();
  const preview = element();
  const error = element();
  const direction = { ...element(), value: '', addEventListener(name, fn) { handlers[name] = fn; },
    set innerHTML(html) { this.value = html.match(/value="([^"]+)"/)?.[1] || ''; } };
  const overlay = {
    removed: false, innerHTML: '',
    querySelector(selector) {
      if (selector.includes('direction')) return direction;
      if (selector.includes('status')) return status;
      if (selector.includes('preview')) return preview;
      if (selector.includes('error')) return error;
      return buttons[selector.match(/"(.+)"/)[1]];
    },
    querySelectorAll: () => [direction, ...Object.values(buttons)],
    addEventListener(name, fn) { handlers[name] = fn; },
    setAttribute() {}, remove() { this.removed = true; },
  };
  const requests = [];
  let response = async () => ({ status: 'recovery-required', collectionName: '<Fixture>', operation: 'prepare', directions: ['forward', 'rollback'] });
  let reloads = 0;
  const context = { document, els: { version: element() }, window: { location: { reload() { reloads++; } } },
    escapeHtml: (value) => String(value),
    api: async (route, options) => { requests.push({ route, body: JSON.parse(options.body) }); return await response(); },
  };
  vm.createContext(context);
  vm.runInContext(controller, context);
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const click = async (action) => { handlers.click({ target: buttons[action] }); await settle(); };
  context.showCatalogueRecoveryModal();
  await settle();
  assert.equal(requests[0].route, '/api/catalogue-recovery/status');
  assert.equal(buttons.confirm.disabled, true);
  assert.match(status.textContent, /<Fixture>: interrupted catalogue preparation/);
  await click('confirm');
  assert.equal(requests.length, 1);
  response = async () => ({ status: 'preview', direction: 'forward', documents: 2, moves: 1, reviewToken: 'finish-token' });
  await click('review');
  assert.equal(buttons.confirm.disabled, false);
  direction.value = 'rollback';
  handlers.change();
  assert.equal(buttons.confirm.disabled, true, 'Changing the recovery choice invalidates its review');
  await click('confirm');
  assert.equal(requests.length, 2);
  response = async () => ({ status: 'preview', direction: 'rollback', documents: 1, moves: 1, reviewToken: 'restore-token' });
  await click('review');
  assert.equal(requests.at(-1).body.direction, 'rollback');
  assert.match(preview.textContent, /Restore the previous state/);
  let release;
  response = () => new Promise((resolve) => { release = resolve; });
  await click('confirm');
  await click('confirm');
  await click('cancel');
  assert.equal(overlay.removed, false);
  assert.equal(requests.length, 4);
  assert.deepEqual(requests.at(-1).body, { review_token: 'restore-token' });
  release({ status: 'rolled-back' });
  await settle();
  assert.match(preview.textContent, /Previous state restored/);
  assert.equal(buttons.reload.hidden, false);
  assert.equal(buttons.confirm.disabled, true);
  await click('reload');
  assert.equal(reloads, 1);
  response = async () => { throw new Error('Saved transaction conflict'); };
  await click('review');
  assert.match(error.textContent, /transaction conflict/);
  assert.equal(buttons.confirm.disabled, true);
  assert.equal(buttons.review.disabled, false);
  handlers.keydown({ key: 'Escape', preventDefault() {} });
  assert.ok(overlay.removed);
  assert.equal(document.activeElement, context.els.version);

  // Execute startup itself to ensure pending recovery stops before library reads.
  const startup = source.slice(source.indexOf('async function init()'), source.indexOf('function bindEvents()'));
  Object.assign(context, { renderLayout() {}, renderTableStructure() {}, bindEvents() {},
    api: async (route) => { assert.equal(route, '/api/catalogue-recovery/status'); return { status: 'recovery-required' }; } });
  vm.runInContext(startup, context);
  await assert.rejects(context.init(), /Open Catalogue Recovery/);
  assert.ok(!source.includes('document.body.innerHTML = `<pre>'), 'Startup failure must retain the recovery controls');
  console.log('Recovery choice, confirmation, retry, startup and dismissal flows pass.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
