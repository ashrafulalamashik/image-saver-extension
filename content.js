// =============================================================
//  content.js — Injected into all web pages
//  Responsibilities:
//    1. Track the currently hovered image
//    2. Listen for Alt+P shortcut to download hovered image
//    3. Show in-page toast notifications
//    4. Provide list of all image URLs to the popup
// =============================================================

let hoveredImage = null;

// ── 1. Track Hovered Image ────────────────────────────────────

function getBackgroundImageUrl(element) {
  try {
    const bg = window.getComputedStyle(element).backgroundImage;
    if (bg && bg !== 'none') {
      const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
      if (match && match[1]) {
        // Resolve relative URLs if needed, though getComputedStyle usually returns absolute
        return match[1];
      }
    }
  } catch (e) {}
  return null;
}

document.addEventListener('mouseover', (e) => {
  if (!e.target) return;
  
  if (e.target.tagName && e.target.tagName.toLowerCase() === 'img') {
    hoveredImage = {
      src: e.target.currentSrc || e.target.src,
      element: e.target,
      isCss: false
    };
  } else {
    const bgUrl = getBackgroundImageUrl(e.target);
    if (bgUrl) {
      hoveredImage = {
        src: bgUrl,
        element: e.target,
        isCss: true
      };
    }
  }
}, true);

document.addEventListener('mouseout', (e) => {
  if (hoveredImage && e.target === hoveredImage.element) {
    hoveredImage = null;
  }
}, true);

// ── 2. Keyboard Shortcuts (Alt+P, Alt+C) ──────────────────────────────

document.addEventListener('keydown', (e) => {
  // Check for Alt + P (Download)
  if (e.altKey && e.key.toLowerCase() === 'p') {
    if (hoveredImage && hoveredImage.src) {
      e.preventDefault(); // Prevent default browser behavior

      const srcUrl = hoveredImage.src;
      showToast('Downloading image as PNG...');

      chrome.runtime.sendMessage({
        action: 'downloadImage',
        srcUrl: srcUrl,
        mimeType: 'image/png',
        ext: 'png'
      }, (response) => {
        if (response && response.success) {
          showToast('Image saved successfully! 🖼️');
        } else {
          showToast('Failed to save image. ❌');
        }
      });
    }
  }

  // Check for Alt + C (Copy as PNG)
  if (e.altKey && e.key.toLowerCase() === 'c') {
    if (hoveredImage && hoveredImage.src) {
      e.preventDefault(); 
      showToast('Copying image to clipboard...');
      performClipboardCopy(hoveredImage.src);
    }
  }

  // Check for Alt + I (Image Info Tooltip)
  if (e.altKey && e.key.toLowerCase() === 'i') {
    if (hoveredImage && hoveredImage.src) {
      e.preventDefault();
      showImageInfo(hoveredImage);
    }
  }
});

function performClipboardCopy(srcUrl) {
  (async () => {
    try {
      showToast('Preparing image for clipboard...');
      const response = await chrome.runtime.sendMessage({
        action: 'convertForClipboard',
        srcUrl: srcUrl
      });
      
      if (!response || !response.success || !response.dataUrl) {
        throw new Error(response ? response.error : 'Failed to convert image');
      }

      const res = await fetch(response.dataUrl);
      const blob = await res.blob();

      const writeBlob = async () => {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        showToast('Image copied to clipboard! 📋');
      };

      if (document.hasFocus()) {
        await writeBlob();
      } else {
        showToast('Click anywhere on the page to copy 🖱️');
        const onFocus = async () => {
          window.removeEventListener('focus', onFocus);
          try {
            await writeBlob();
          } catch (err) {
            console.error(err);
            showToast('Clipboard error: ' + err.message);
          }
        };
        window.addEventListener('focus', onFocus);
      }
    } catch (err) {
      console.error('[ImageSaver] Clipboard write error:', err);
      showToast('Failed to copy: ' + err.message);
    }
  })();
}

// ── 3. Toast & Tooltip UI ───────────────────────────────────

let toastElement = null;
let toastTimeout = null;

function showToast(message) {
  if (!toastElement) {
    toastElement = document.createElement('div');
    toastElement.className = 'image-saver-toast';
    document.body.appendChild(toastElement);
  }

  toastElement.textContent = message;
  toastElement.classList.add('show');

  if (toastTimeout) clearTimeout(toastTimeout);
  
  toastTimeout = setTimeout(() => {
    toastElement.classList.remove('show');
  }, 3000);
}

let tooltipElement = null;

async function showImageInfo(imgData) {
  if (tooltipElement) {
    tooltipElement.remove();
  }

  tooltipElement = document.createElement('div');
  tooltipElement.className = 'image-saver-tooltip';
  
  // Basic info we can show immediately
  tooltipElement.innerHTML = `
    <strong>🔍 Image Info</strong><br/>
    Loading details...
  `;
  document.body.appendChild(tooltipElement);

  // Position it near the mouse or centered on the element
  const rect = imgData.element.getBoundingClientRect();
  tooltipElement.style.top = Math.max(10, rect.top + window.scrollY + 10) + 'px';
  tooltipElement.style.left = Math.max(10, rect.left + window.scrollX + 10) + 'px';

  try {
    let width, height, type;
    
    // Fetch headers for size and type
    const res = await fetch(imgData.src, { method: 'HEAD' });
    const sizeBytes = res.headers.get('content-length');
    type = res.headers.get('content-type') || 'Unknown';
    
    let sizeStr = 'Unknown size';
    if (sizeBytes) {
      const kb = parseInt(sizeBytes, 10) / 1024;
      if (kb > 1024) sizeStr = (kb / 1024).toFixed(2) + ' MB';
      else sizeStr = kb.toFixed(2) + ' KB';
    }

    if (!imgData.isCss && imgData.element.naturalWidth) {
      width = imgData.element.naturalWidth;
      height = imgData.element.naturalHeight;
    } else {
      // Need to load the image to get dimensions
      const tempImg = new Image();
      await new Promise((resolve) => {
        tempImg.onload = resolve;
        tempImg.onerror = resolve;
        tempImg.src = imgData.src;
      });
      width = tempImg.naturalWidth || 'Unknown';
      height = tempImg.naturalHeight || 'Unknown';
    }

    const sourceText = imgData.isCss ? 'CSS Background' : '&lt;img&gt; tag';
    const altText = (!imgData.isCss && imgData.element.alt) ? imgData.element.alt : 'None';

    tooltipElement.innerHTML = `
      <strong>🔍 Image Saver Info</strong>
      <button class="image-saver-tooltip-close">×</button>
      <hr/>
      <div class="is-info-row"><span>Type:</span> <span>${type}</span></div>
      <div class="is-info-row"><span>Size:</span> <span>${sizeStr}</span></div>
      <div class="is-info-row"><span>Dimensions:</span> <span>${width} x ${height}</span></div>
      <div class="is-info-row"><span>Source:</span> <span>${sourceText}</span></div>
      <div class="is-info-row"><span>Alt:</span> <span class="is-truncate">${altText}</span></div>
    `;

    tooltipElement.querySelector('.image-saver-tooltip-close').addEventListener('click', () => {
      tooltipElement.remove();
    });

  } catch (err) {
    tooltipElement.innerHTML = `
      <strong>🔍 Image Saver Info</strong>
      <button class="image-saver-tooltip-close">×</button>
      <hr/>
      <div style="color:red;">Failed to load info. (CORS or Network error)</div>
    `;
    tooltipElement.querySelector('.image-saver-tooltip-close').addEventListener('click', () => {
      tooltipElement.remove();
    });
  }
}

// ── 4. Message Listener for Popup & Background ──────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getImages') {
    // Gather all image URLs from the page
    const imgTags = Array.from(document.querySelectorAll('img'))
      .map(img => img.src);
      
    // Smart Extractor: Gather CSS background images from ALL elements
    const allElements = document.querySelectorAll('*');
    const bgImages = [];
    allElements.forEach(el => {
      const bg = getBackgroundImageUrl(el);
      if (bg) bgImages.push(bg);
    });

    const allImages = [...imgTags, ...bgImages]
      .filter(src => src && src.startsWith('http')); // Filter out data URLs or invalid srcs
    
    // Deduplicate
    const uniqueImages = [...new Set(allImages)];
    
    sendResponse({ images: uniqueImages });
  } else if (request.action === 'triggerCopy') {
    // Background script told us to copy an image (from context menu)
    showToast('Copying image to clipboard...');
    performClipboardCopy(request.srcUrl);
    sendResponse({ success: true });
  } else if (request.action === 'copyBase64') {
    // Copy base64 string to clipboard
    navigator.clipboard.writeText(request.text)
      .then(() => showToast('Base64 copied to clipboard! 📋'))
      .catch(() => showToast('Failed to copy Base64.'));
    sendResponse({ success: true });
  }
});
