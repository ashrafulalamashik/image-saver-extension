// =============================================================
//  offscreen.js — Offscreen Document Script (Manifest V3)
//  Responsibilities:
//    1. Listen for 'convertImage' messages from background.js
//    2. Fetch the remote image as a Blob (handles CORS via blob URL)
//    3. Draw the image onto an HTMLCanvasElement
//    4. Export the canvas as a Data URL in the requested MIME type
//    5. Send the Data URL (or an error) back to background.js
// =============================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Only handle messages addressed to this offscreen document
  if (message.target !== 'offscreen' || !['convertImage', 'copyImage'].includes(message.action)) {
    return false; // not for us — don't claim the message
  }

  if (message.action === 'convertImage') {
    handleConversion(message)
      .then((dataUrl) => {
        chrome.runtime.sendMessage({
          messageId: message.messageId,
          dataUrl,
        });
      })
      .catch((err) => {
        console.error('[ImageSaver/offscreen] Error:', err);
        chrome.runtime.sendMessage({
          messageId: message.messageId,
          error: err.message ?? String(err),
        });
      });
  } else if (message.action === 'copyImage') {
    handleCopy(message)
      .then(() => {
        chrome.runtime.sendMessage({
          messageId: message.messageId,
          success: true,
        });
      })
      .catch((err) => {
        console.error('[ImageSaver/offscreen] Copy Error:', err);
        chrome.runtime.sendMessage({
          messageId: message.messageId,
          error: err.message ?? String(err),
        });
      });
  }

  // Return false because we reply using chrome.runtime.sendMessage instead of sendResponse.
  // Returning true without calling sendResponse causes a "message channel closed" error.
  return false;
});

// ── Core Conversion Pipeline ───────────────────────────────────

/**
 * Fetches `srcUrl`, draws it to a canvas, and returns a Data URL
 * encoded in `mimeType`.
 *
 * For SVG images, forces a minimum viewport of 1024×1024 to ensure
 * sharp rasterization even when the SVG lacks explicit dimensions.
 *
 * @param {{ srcUrl: string, mimeType: string }} param0
 * @returns {Promise<string>} Data URL
 */
async function handleConversion({ srcUrl, mimeType }) {
  // ── Step 1: Fetch the image as a Blob ─────────────────────
  //
  // We fetch through the extension's background context so that the
  // <all_urls> host permission applies, letting us grab cross-origin images.
  // Converting to an object URL lets HTMLImageElement load it without
  // triggering additional CORS preflight issues.
  const response = await fetch(srcUrl);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();

  // ── SVG handling: wrap in a sized blob if needed ───────────
  const isSvg = blob.type === 'image/svg+xml' || srcUrl.toLowerCase().endsWith('.svg');
  let objectUrl;

  if (isSvg) {
    // Read SVG text and inject explicit width/height if missing
    const svgText = await blob.text();
    const sizedSvg = ensureSvgDimensions(svgText, 1024, 1024);
    const sizedBlob = new Blob([sizedSvg], { type: 'image/svg+xml' });
    objectUrl = URL.createObjectURL(sizedBlob);
  } else {
    objectUrl = URL.createObjectURL(blob);
  }

  try {
    // ── Step 2: Decode into an HTMLImageElement ──────────────
    const img = await loadImage(objectUrl);

    // ── Step 3: Draw to Canvas ───────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth  || img.width;
    canvas.height = img.naturalHeight || img.height;

    const ctx = canvas.getContext('2d');

    // For JPG: fill with white first — JPG has no alpha channel,
    // so transparent pixels would render as black without this.
    if (mimeType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(img, 0, 0);

    // ── Step 4: Export as Data URL ───────────────────────────
    // Explicit quality for lossy formats: JPEG 0.92, WebP 0.85
    let quality;
    if (mimeType === 'image/jpeg') {
      quality = 0.92;
    } else if (mimeType === 'image/webp') {
      quality = 0.85;
    }

    const dataUrl = canvas.toDataURL(mimeType, quality);

    if (!dataUrl || dataUrl === 'data:,') {
      throw new Error('canvas.toDataURL returned an empty result.');
    }

    return dataUrl;
  } finally {
    // Always revoke the object URL to free memory
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Converts the image to a PNG blob and writes it to the clipboard.
 * 
 * @param {{ srcUrl: string }} param0
 * @returns {Promise<void>}
 */
async function handleCopy({ srcUrl }) {
  // Use handleConversion to get a data URL for PNG
  const dataUrl = await handleConversion({ srcUrl, mimeType: 'image/png' });
  
  // Convert Data URL to Blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  
  // Write to clipboard (Requires 'clipboardWrite' permission and CLIPBOARD offscreen reason)
  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': blob
    })
  ]);
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Wraps HTMLImageElement loading in a Promise.
 * Resolves on `load`, rejects on `error`.
 *
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Image failed to load: ${src}`));
    img.src = src;
  });
}

/**
 * Ensures an SVG string has explicit width and height attributes
 * on its root <svg> element. If the SVG already has width/height,
 * they are preserved. Otherwise, the given defaults are injected.
 *
 * This prevents browsers from rendering SVGs at 0×0 when they
 * lack explicit viewport dimensions.
 *
 * @param {string} svgText     - Raw SVG markup
 * @param {number} defaultW    - Default width (px)
 * @param {number} defaultH    - Default height (px)
 * @returns {string} SVG markup with guaranteed dimensions
 */
function ensureSvgDimensions(svgText, defaultW, defaultH) {
  // Quick check: if width and height already present, return as-is
  if (/\bwidth\s*=/.test(svgText) && /\bheight\s*=/.test(svgText)) {
    return svgText;
  }

  // Inject width/height into the opening <svg> tag
  return svgText.replace(
    /<svg\b/i,
    `<svg width="${defaultW}" height="${defaultH}"`
  );
}
