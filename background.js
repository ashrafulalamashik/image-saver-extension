// =============================================================
//  background.js — Service Worker (Manifest V3)
//  Responsibilities:
//    1. Register context-menu items on install
//    2. Handle context-menu clicks
//    3. Manage the offscreen document lifecycle
//    4. Trigger chrome.downloads after receiving the converted data URL
//    5. Show error notifications to the user
// =============================================================

const OFFSCREEN_HTML = 'offscreen.html';
const OFFSCREEN_REASONS = [chrome.offscreen.Reason.BLOBS, chrome.offscreen.Reason.CLIPBOARD];
const OFFSCREEN_JUSTIFICATION =
  'Fetch remote image, draw to Canvas, export as Blob/Data URL for format conversion, and write to clipboard.';

/** Timeout for offscreen conversion (30 seconds) */
const CONVERSION_TIMEOUT_MS = 30_000;

/**
 * Simple debounce guard: tracks in-flight conversions to prevent
 * duplicate downloads from rapid double-clicks.
 * Key = `${srcUrl}|${mimeType}`, value = timestamp
 */
const inflightConversions = new Map();
const DEBOUNCE_MS = 2000;

// ── 1. Context Menu Registration ──────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Parent item (visible label in the menu)
  chrome.contextMenus.create({
    id: 'imageSaver_parent',
    title: 'Save Image As…',
    contexts: ['image'],
  });

  // Child: PNG
  chrome.contextMenus.create({
    id: 'imageSaver_png',
    parentId: 'imageSaver_parent',
    title: 'PNG  (lossless)',
    contexts: ['image'],
  });

  // Child: Copy as PNG
  chrome.contextMenus.create({
    id: 'imageSaver_copy_png',
    parentId: 'imageSaver_parent',
    title: 'Copy as PNG',
    contexts: ['image'],
  });

  // Child: JPG
  chrome.contextMenus.create({
    id: 'imageSaver_jpg',
    parentId: 'imageSaver_parent',
    title: 'JPG  (smaller file)',
    contexts: ['image'],
  });

  // Child: WebP
  chrome.contextMenus.create({
    id: 'imageSaver_webp',
    parentId: 'imageSaver_parent',
    title: 'WebP  (modern format)',
    contexts: ['image'],
  });
});

// ── 2. Context Menu Click Handler ─────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const formatMap = {
    imageSaver_png:  { mimeType: 'image/png',  ext: 'png'  },
    imageSaver_jpg:  { mimeType: 'image/jpeg', ext: 'jpg'  },
    imageSaver_webp: { mimeType: 'image/webp', ext: 'webp' },
    imageSaver_copy_png: { mimeType: 'image/png', ext: 'png', copy: true },
  };

  const format = formatMap[info.menuItemId];
  if (!format || !info.srcUrl) return;

  // ── Debounce: prevent duplicate downloads from rapid clicks ──
  const debounceKey = `${info.srcUrl}|${format.mimeType}`;
  const lastTime = inflightConversions.get(debounceKey);
  if (lastTime && Date.now() - lastTime < DEBOUNCE_MS) {
    console.log('[ImageSaver] Duplicate click ignored (debounce).');
    return;
  }
  inflightConversions.set(debounceKey, Date.now());

  try {
    await ensureOffscreenDocument();

    if (format.copy) {
      const dataUrl = await convertImage(info.srcUrl, format.mimeType);
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab found to perform clipboard copy.');

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'copyToClipboard',
        dataUrl: dataUrl
      });

      if (response && response.error) {
        throw new Error(response.error);
      }

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Image Saver',
        message: 'Image copied to clipboard as PNG!',
        priority: 0,
      });
    } else {
      const dataUrl = await convertImage(info.srcUrl, format.mimeType);
      const filename = buildFilename(info.srcUrl, format.ext);

      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false,           // set to true if you want a Save dialog
      });
    }
  } catch (err) {
    console.error('[ImageSaver] Conversion failed:', err);
    showErrorNotification(err.message || 'Image conversion failed.');
  } finally {
    // Clean up debounce key after a delay
    setTimeout(() => inflightConversions.delete(debounceKey), DEBOUNCE_MS);
  }
});

// ── 3. Offscreen Document Management ──────────────────────────

/**
 * Creates the offscreen document if it does not already exist.
 * Chrome only allows one offscreen document per extension at a time.
 */
async function ensureOffscreenDocument() {
  // getContexts is the MV3 way to check existing offscreen docs
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_HTML)],
  });

  if (existingContexts.length > 0) return; // already open

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_HTML,
    reasons: OFFSCREEN_REASONS,
    justification: OFFSCREEN_JUSTIFICATION,
  });
}

// ── 4. Message Passing to Offscreen ───────────────────────────

/**
 * Sends the image URL + desired MIME type to offscreen.js.
 * Returns a Promise that resolves to the converted Data URL.
 * Includes a 30-second timeout to prevent hanging if offscreen crashes.
 *
 * @param {string} srcUrl   - Original image URL
 * @param {string} mimeType - Target format: 'image/png' | 'image/jpeg' | 'image/webp'
 * @returns {Promise<string>} Data URL of the converted image
 */
function convertImage(srcUrl, mimeType) {
  return new Promise((resolve, reject) => {
    const messageId = `img_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // ── Timeout guard ──
    const timeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error('Conversion timed out after 30 seconds. The image may be too large or the converter crashed.'));
    }, CONVERSION_TIMEOUT_MS);

    // One-time listener for the response
    const listener = (message) => {
      if (message.messageId !== messageId) return;

      clearTimeout(timeoutId);
      chrome.runtime.onMessage.removeListener(listener);

      if (message.error) {
        reject(new Error(message.error));
      } else {
        resolve(message.dataUrl);
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    // Send request to offscreen document
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'convertImage',
      messageId,
      srcUrl,
      mimeType,
    });
  });
}

// ── 5. Helpers ─────────────────────────────────────────────────

/**
 * Derives a clean filename from the source URL.
 * Preserves Unicode characters (letters, numbers, dashes, underscores, dots).
 * Only strips filesystem-unsafe characters.
 * Falls back to a timestamped name if the URL has no parseable filename.
 *
 * @param {string} srcUrl
 * @param {string} ext - Target extension without dot, e.g. 'png'
 * @returns {string}
 */
function buildFilename(srcUrl, ext) {
  try {
    const url = new URL(srcUrl);
    // Get the last path segment, strip any existing extension
    const segments = url.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || '';
    // Decode URI component to handle %XX encoded Unicode chars
    const decoded = decodeURIComponent(last);
    // Strip file extension, then remove only filesystem-unsafe chars
    // Keeps: Unicode letters, digits, spaces, hyphens, underscores, dots
    const base = decoded
      .replace(/\.[^.]+$/, '')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')  // only strip FS-unsafe chars
      .trim() || 'image';
    return `${base}.${ext}`;
  } catch {
    return `image_${Date.now()}.${ext}`;
  }
}

// ── 6. Error Notifications ────────────────────────────────────

/**
 * Shows a Chrome notification to inform the user about conversion errors.
 *
 * @param {string} errorMessage - Human-readable error description
 */
function showErrorNotification(errorMessage) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Image Saver — Error',
    message: errorMessage,
    priority: 1,
  });
}

// ── 7. Message Listener for Content/Popup Scripts ──────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadImage') {
    // Called by content.js (Alt+P) or popup.js
    (async () => {
      try {
        await ensureOffscreenDocument();
        const dataUrl = await convertImage(request.srcUrl, request.mimeType || 'image/png');
        const filename = buildFilename(request.srcUrl, request.ext || 'png');

        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: false,
        });
        sendResponse({ success: true });
      } catch (err) {
        console.error('[ImageSaver] Download failed via message:', err);
        showErrorNotification(err.message || 'Image download failed.');
        sendResponse({ error: err.message });
      }
    })();
    return true; // Keep channel open for async response
  } else if (request.action === 'copyHoveredImage') {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const dataUrl = await convertImage(request.srcUrl, 'image/png');
        sendResponse({ success: true, dataUrl: dataUrl });
      } catch (err) {
        console.error('[ImageSaver] Copy via shortcut failed:', err);
        showErrorNotification(err.message || 'Image copy failed.');
        sendResponse({ error: err.message });
      }
    })();
    return true; // Keep channel open for async response
  }
});
