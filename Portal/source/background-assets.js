// Board background optimization and Host-backed asset persistence.

const MAX_BACKGROUND_IMAGE_DIMENSION = 2560;
const BACKGROUND_ASSET_MIME = 'image/webp';
const BACKGROUND_ASSET_EXTENSION = 'webp';
const BACKGROUND_ASSET_REMOTE_MAX_BYTES = 25 * 1024 * 1024;

function updateBgDropZonePreview(imageUrl) {
  const dz = document.getElementById('bstgDropZone');
  if (imageUrl) {
    dz.style.backgroundImage = `url(${JSON.stringify(imageUrl)})`;
    dz.classList.add('has-preview');
  } else {
    dz.style.backgroundImage = '';
    dz.classList.remove('has-preview');
  }
}

function loadImageFromUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load image.'));
    img.src = src;
  });
}

async function optimizeBackgroundImageDataUrl(imageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('data:image/')) return imageUrl;
  try {
    const img = await loadImageFromUrl(imageUrl);
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    if (!width || !height) return imageUrl;
    const scale = Math.min(1, MAX_BACKGROUND_IMAGE_DIMENSION / Math.max(width, height));
    if (scale >= 1) return imageUrl;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(BACKGROUND_ASSET_MIME, 0.86);
  } catch {
    return imageUrl;
  }
}

async function storeBackgroundImageDataUrl(rawDataUrl, { fileName = '' } = {}) {
  const board = getActiveBoard();
  const tab = getActiveTab();
  if (!board || !tab) return null;
  const optimizedDataUrl = await optimizeBackgroundImageDataUrl(rawDataUrl);
  if (
    typeof bridge !== 'undefined' && bridge.isAvailable() && bridge.nativeIsAvailable()
    && typeof bridge.saveAssetDataUrl === 'function' && optimizedDataUrl.startsWith('data:image/')
  ) {
    const saved = await bridge.saveAssetDataUrl({
      kind: 'background', collectionName: board.title || 'Board', itemName: tab.title || fileName || 'Tab',
      extension: BACKGROUND_ASSET_EXTENSION, mimeType: BACKGROUND_ASSET_MIME, dataUrl: optimizedDataUrl
    });
    if (saved?.publicPath) return saved.publicPath;
    showNotice('Could not save the background image as an asset; keeping it embedded for now.');
  }
  return optimizedDataUrl;
}

async function applyBackgroundImageDataUrl(rawDataUrl, options = {}) {
  const board = getActiveBoard();
  const tab = getActiveTab();
  if (!board || !tab) return;
  tab.backgroundImage = await storeBackgroundImageDataUrl(rawDataUrl, options);
  document.getElementById('bstgBgUrl').value = '';
  updateBgDropZonePreview(tab.backgroundImage);

  applyBoardBackground(board);
}

function isRemoteBackgroundUrl(value) {
  return /^https?:\/\//i.test((value || '').trim());
}

async function cacheBackgroundImageUrl(url, { board = getActiveBoard(), tab = getActiveTab(), notifyFailure = true } = {}) {
  const trimmedUrl = (url || '').trim();
  if (!board || !tab || !isRemoteBackgroundUrl(trimmedUrl)) return null;
  if (
    typeof bridge === 'undefined' || !bridge.isAvailable() || !bridge.nativeIsAvailable()
    || typeof bridge.cacheAssetUrl !== 'function'
  ) return null;
  const saved = await bridge.cacheAssetUrl({
    url: trimmedUrl, kind: 'background', collectionName: board.title || 'Board', itemName: tab.title || 'Tab',
    maxBytes: BACKGROUND_ASSET_REMOTE_MAX_BYTES
  });
  if (saved?.publicPath) return saved.publicPath;
  if (notifyFailure) showNotice('Could not cache that web background locally; keeping the web URL for now.');
  return null;
}

async function promoteActiveBackgroundUrlToAsset() {
  const board = getActiveBoard();
  const tab = getActiveTab();
  if (!board || !tab || !isRemoteBackgroundUrl(tab.backgroundImage)) return false;
  const localPath = await cacheBackgroundImageUrl(tab.backgroundImage, { board, tab });
  if (!localPath) return false;
  tab.backgroundImage = localPath;
  document.getElementById('bstgBgUrl').value = localPath;
  updateBgDropZonePreview(localPath);

  applyBoardBackground(board);
  return true;
}

async function migrateEmbeddedBackgroundAssets() {
  if (
    typeof bridge === 'undefined' || !bridge.isAvailable() || !bridge.nativeIsAvailable()
    || typeof bridge.saveAssetDataUrl !== 'function'
  ) return 0;
  let migrated = 0;
  for (const board of (state.boards || [])) {
    for (const tab of getBoardTabs(board)) {
      if (typeof tab?.backgroundImage !== 'string' || !tab.backgroundImage.startsWith('data:image/')) continue;
      const saved = await bridge.saveAssetDataUrl({
        kind: 'background', collectionName: board.title || 'Board', itemName: tab.title || 'Tab',
        extension: BACKGROUND_ASSET_EXTENSION, mimeType: BACKGROUND_ASSET_MIME,
        dataUrl: await optimizeBackgroundImageDataUrl(tab.backgroundImage)
      });
      if (!saved?.publicPath) continue;
      tab.backgroundImage = saved.publicPath;
      migrated += 1;

    }
  }
  if (migrated > 0) {
    renderAll();
    saveState();
    showNotice(`Moved ${migrated} embedded background image${migrated === 1 ? '' : 's'} into the assets folder.`);
  }
  return migrated;
}

async function migrateRemoteBackgroundAssets() {
  if (
    typeof bridge === 'undefined' || !bridge.isAvailable() || !bridge.nativeIsAvailable()
    || typeof bridge.cacheAssetUrl !== 'function'
  ) return 0;
  let migrated = 0;
  for (const board of (state.boards || [])) {
    for (const tab of getBoardTabs(board)) {
      if (!isRemoteBackgroundUrl(tab?.backgroundImage)) continue;
      const localPath = await cacheBackgroundImageUrl(tab.backgroundImage, { board, tab, notifyFailure: false });
      if (!localPath) continue;
      tab.backgroundImage = localPath;
      migrated += 1;

    }
  }
  if (migrated > 0) {
    renderAll();
    saveState();
    showNotice(`Cached ${migrated} web background image${migrated === 1 ? '' : 's'} in the assets folder.`);
  }
  return migrated;
}

async function migrateBackgroundAssets() {
  const embedded = await migrateEmbeddedBackgroundAssets();
  const remote = await migrateRemoteBackgroundAssets();
  return embedded + remote;
}
