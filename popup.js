// =============================================================
//  popup.js — Bulk Downloader Logic
//  Responsibilities:
//    1. Request images from active tab
//    2. Render image grid
//    3. Handle selection toggling
//    4. Trigger downloads via background.js
// =============================================================

let allImages = [];
let selectedImages = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('loading');
  const noImagesEl = document.getElementById('noImages');
  const imageGrid = document.getElementById('imageGrid');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const formatSelect = document.getElementById('formatSelect');

  // ── 1. Fetch Images from Content Script ────────────────────────
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Fallback if we cannot inject or access the tab (e.g. chrome:// URLs)
    if (!tab.url.startsWith('http')) {
      throw new Error('Cannot access this page.');
    }

    chrome.tabs.sendMessage(tab.id, { action: 'getImages' }, (response) => {
      loadingEl.classList.add('hidden');
      
      if (chrome.runtime.lastError || !response || !response.images || response.images.length === 0) {
        noImagesEl.classList.remove('hidden');
        return;
      }

      allImages = response.images;
      renderGrid();
      imageGrid.classList.remove('hidden');
    });
  } catch (err) {
    loadingEl.classList.add('hidden');
    noImagesEl.textContent = 'Cannot access images on this page.';
    noImagesEl.classList.remove('hidden');
  }

  // ── 2. Render Grid ─────────────────────────────────────────────
  
  function renderGrid() {
    imageGrid.innerHTML = '';
    
    allImages.forEach((src, index) => {
      const card = document.createElement('div');
      card.className = 'image-card';
      card.dataset.index = index;
      
      const img = document.createElement('img');
      img.src = src;
      img.loading = 'lazy'; // Improve performance for many images
      
      card.appendChild(img);
      imageGrid.appendChild(card);

      // Toggle selection
      card.addEventListener('click', () => {
        if (selectedImages.has(src)) {
          selectedImages.delete(src);
          card.classList.remove('selected');
        } else {
          selectedImages.add(src);
          card.classList.add('selected');
        }
        updateDownloadBtn();
      });
    });
  }

  // ── 3. Controls Logic ──────────────────────────────────────────

  function updateDownloadBtn() {
    const count = selectedImages.size;
    downloadBtn.textContent = `Download (${count})`;
    downloadBtn.disabled = count === 0;
  }

  let isAllSelected = false;
  selectAllBtn.addEventListener('click', () => {
    isAllSelected = !isAllSelected;
    
    const cards = document.querySelectorAll('.image-card');
    
    if (isAllSelected) {
      selectAllBtn.textContent = 'Deselect All';
      allImages.forEach(src => selectedImages.add(src));
      cards.forEach(card => card.classList.add('selected'));
    } else {
      selectAllBtn.textContent = 'Select All';
      selectedImages.clear();
      cards.forEach(card => card.classList.remove('selected'));
    }
    
    updateDownloadBtn();
  });

  // ── 4. Trigger Downloads ───────────────────────────────────────

  downloadBtn.addEventListener('click', () => {
    if (selectedImages.size === 0) return;

    const format = formatSelect.value; // 'png', 'jpg', 'webp'
    const formatMap = {
      'png':  { mimeType: 'image/png',  ext: 'png'  },
      'jpg':  { mimeType: 'image/jpeg', ext: 'jpg'  },
      'webp': { mimeType: 'image/webp', ext: 'webp' },
    };
    
    const chosenFormat = formatMap[format];

    // Download sequentially or simultaneously? Let's just fire messages.
    Array.from(selectedImages).forEach((srcUrl) => {
      chrome.runtime.sendMessage({
        action: 'downloadImage',
        srcUrl: srcUrl,
        mimeType: chosenFormat.mimeType,
        ext: chosenFormat.ext
      });
    });

    // Optional: Close popup or show success message
    downloadBtn.textContent = 'Downloading...';
    setTimeout(() => {
      window.close();
    }, 1000);
  });

});
