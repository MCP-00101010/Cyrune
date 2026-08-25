import assert from 'node:assert/strict';

const port = Number(process.argv[2] || 9224);
const targetUrl = 'file:///F:/Projects/Coding/Cyrune/Arcade/web/index.html';
const socket = new WebSocket(`ws://127.0.0.1:${port}/session`);
const pending = new Map();
let sequence = 0;

socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  if (message.type === 'success') request.resolve(message.result);
  else request.reject(new Error(message.message || JSON.stringify(message)));
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', () => reject(new Error(`Could not connect to Firefox BiDi on port ${port}`)), { once: true });
});

function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await command('session.new', { capabilities: { alwaysMatch: {} } });

let arcadeContext = null;
let snapshot = null;
let reloadedAfterExtensionInstall = false;
const deadline = Date.now() + 20000;
while (Date.now() < deadline) {
  const tree = await command('browsingContext.getTree');
  const contexts = [...(tree.contexts || [])];
  while (contexts.length) {
    const candidate = contexts.shift();
    if (candidate.url?.startsWith(targetUrl)) arcadeContext = candidate.context;
    contexts.push(...(candidate.children || []));
  }
  if (arcadeContext) {
    if (!reloadedAfterExtensionInstall) {
      await command('browsingContext.navigate', {
        context: arcadeContext,
        url: targetUrl,
        wait: 'complete'
      });
      reloadedAfterExtensionInstall = true;
    }
    const evaluated = await command('script.evaluate', {
      expression: `(async () => {
        const game = state.games.find(item => String(item.screenshot || item.loading_screen || '').startsWith('https://'));
        if (game && state.selected?.id !== game.id) await selectGame(game.id);
        await new Promise(resolve => setTimeout(resolve, 250));
        return JSON.stringify({
          relay: document.documentElement.dataset.morpheusExtensionRelay || '',
          relayError: document.documentElement.dataset.morpheusExtensionError || '',
          gameTitle: game?.title || '',
          metadataVisible: !!document.querySelector('.scraped-meta'),
          images: [...document.querySelectorAll('.artwork-card img')].map(image => ({
            dataUrl: image.src.startsWith('data:image/'),
            complete: image.complete,
            width: image.naturalWidth,
            height: image.naturalHeight,
            missing: image.closest('.artwork-card')?.classList.contains('image-missing') === true
          }))
        });
      })()`,
      target: { context: arcadeContext },
      awaitPromise: true,
      resultOwnership: 'none'
    });
    if (evaluated.result?.type === 'string') snapshot = JSON.parse(evaluated.result.value);
    else snapshot = { evaluation: evaluated };
    if (snapshot?.relay === 'background-ready' && snapshot.images.length && snapshot.images.every(image => image.complete)) break;
  }
  await new Promise(resolve => setTimeout(resolve, 250));
}

await command('session.end').catch(() => {});
socket.close();

assert.ok(arcadeContext, 'The exact Arcade file URL was not open in Firefox');
assert.equal(snapshot?.relay, 'background-ready', snapshot?.relayError || `Relay did not register: ${JSON.stringify(snapshot)}`);
assert.ok(snapshot?.gameTitle, 'No game with remote scraped artwork was available');
assert.equal(snapshot?.metadataVisible, true, 'The selected game metadata did not render');
assert.ok(snapshot?.images.length > 0, 'No scraped artwork cards rendered');
assert.ok(snapshot.images.every(image => image.dataUrl && image.complete && image.width > 0 && image.height > 0 && !image.missing), `Scraped artwork did not load through Relay: ${JSON.stringify(snapshot)}`);
console.log(JSON.stringify(snapshot));
