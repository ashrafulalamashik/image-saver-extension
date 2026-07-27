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

document.addEventListener('mouseover', (e) => {
  if (e.target && e.target.tagName && e.target.tagName.toLowerCase() === 'img') {
    hoveredImage = e.target;
  }
}, true);

document.addEventListener('mouseout', (e) => {
  if (e.target === hoveredImage) {
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

// ── 3. Toast Notification UI ──────────────────────────────────

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

// ── 4. Message Listener for Popup & Background ──────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getImages') {
    // Gather all image URLs from the page
    const images = Array.from(document.querySelectorAll('img'))
      .map(img => img.src)
      .filter(src => src && src.startsWith('http')); // Filter out data URLs or invalid srcs
    
    // Deduplicate
    const uniqueImages = [...new Set(images)];
    
    sendResponse({ images: uniqueImages });
  } else if (request.action === 'triggerCopy') {
    // Background script told us to copy an image (from context menu)
    showToast('Copying image to clipboard...');
    performClipboardCopy(request.srcUrl);
    sendResponse({ success: true });
  }
});
