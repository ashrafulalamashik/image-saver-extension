document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const srcUrl = urlParams.get('url');

  if (!srcUrl) {
    alert("No image URL provided.");
    return;
  }

  const canvas = document.getElementById('editorCanvas');
  const ctx = canvas.getContext('2d');
  const loading = document.getElementById('loading');
  let originalImage = new Image();

  // Draw state
  let isDrawing = false;
  let currentTool = 'move'; // move, draw, arrow, rect
  let startX = 0;
  let startY = 0;
  
  // History for Undo
  let history = [];

  function saveState() {
    history.push(canvas.toDataURL());
    if (history.length > 20) history.shift(); // Keep last 20 states
  }

  // Load image via Background Script to bypass CORS
  chrome.runtime.sendMessage({ action: 'convertForClipboard', srcUrl: srcUrl }, (response) => {
    if (response && response.success) {
      originalImage.onload = () => {
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        ctx.drawImage(originalImage, 0, 0);
        saveState();
        loading.classList.add('hidden');
      };
      originalImage.src = response.dataUrl;
    } else {
      loading.textContent = "Failed to load image.";
      console.error(response?.error);
    }
  });

  // Tools Selection
  const tools = {
    move: document.getElementById('toolMove'),
    draw: document.getElementById('toolDraw'),
    arrow: document.getElementById('toolArrow'),
    rect: document.getElementById('toolRect')
  };

  for (let key in tools) {
    tools[key].addEventListener('click', () => {
      for (let k in tools) tools[k].classList.remove('active');
      tools[key].classList.add('active');
      currentTool = key;
      canvas.className = key === 'move' ? 'tool-move' : '';
    });
  }

  const colorPicker = document.getElementById('colorPicker');
  const lineWidth = document.getElementById('lineWidth');

  // Canvas Mouse Events
  canvas.addEventListener('mousedown', (e) => {
    if (currentTool === 'move') return; // Let CSS/browser handle panning if we implement zoom later
    
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    startX = (e.clientX - rect.left) * scaleX;
    startY = (e.clientY - rect.top) * scaleY;

    if (currentTool === 'draw') {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const currX = (e.clientX - rect.left) * scaleX;
    const currY = (e.clientY - rect.top) * scaleY;

    ctx.strokeStyle = colorPicker.value;
    ctx.fillStyle = "transparent"; // for rects
    ctx.lineWidth = lineWidth.value;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (currentTool === 'draw') {
      ctx.lineTo(currX, currY);
      ctx.stroke();
    } else if (currentTool === 'arrow' || currentTool === 'rect') {
      // Need to restore previous state to animate drawing
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        ctx.beginPath();
        if (currentTool === 'rect') {
          ctx.rect(startX, startY, currX - startX, currY - startY);
          ctx.stroke();
        } else if (currentTool === 'arrow') {
          // Draw arrow line
          ctx.moveTo(startX, startY);
          ctx.lineTo(currX, currY);
          ctx.stroke();
          
          // Draw arrow head
          const angle = Math.atan2(currY - startY, currX - startX);
          const headlen = 15;
          ctx.beginPath();
          ctx.moveTo(currX, currY);
          ctx.lineTo(currX - headlen * Math.cos(angle - Math.PI / 6), currY - headlen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(currX - headlen * Math.cos(angle + Math.PI / 6), currY - headlen * Math.sin(angle + Math.PI / 6));
          ctx.lineTo(currX, currY);
          ctx.fillStyle = colorPicker.value;
          ctx.fill();
        }
      };
      img.src = history[history.length - 1]; // Load last saved state
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (isDrawing && currentTool !== 'move') {
      isDrawing = false;
      saveState();
    }
  });
  
  canvas.addEventListener('mouseleave', () => {
    if (isDrawing && currentTool !== 'move') {
      isDrawing = false;
      saveState();
    }
  });

  // Actions
  document.getElementById('btnUndo').addEventListener('click', () => {
    if (history.length > 1) {
      history.pop(); // remove current state
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = history[history.length - 1];
    }
  });

  document.getElementById('btnClear').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0);
    saveState();
  });

  // Remove Background
  document.getElementById('btnRemoveBg').addEventListener('click', async () => {
    const settings = await chrome.storage.sync.get({ removeBgApiKey: '' });
    if (!settings.removeBgApiKey) {
      alert("Please add your Remove.bg API Key in the Image Saver Settings page first.");
      chrome.runtime.openOptionsPage();
      return;
    }

    loading.innerHTML = "Removing Background ✨<br><small style='font-size:14px; font-weight:normal; margin-top:8px;'>Please wait...</small>";
    loading.classList.remove('hidden');

    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      
      const formData = new FormData();
      formData.append('image_file', blob);
      formData.append('size', 'auto');

      const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': settings.removeBgApiKey
        },
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.errors?.[0]?.title || `API Error: ${response.status}`);
      }

      const newBlob = await response.blob();
      const url = URL.createObjectURL(newBlob);
      
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        saveState();
        URL.revokeObjectURL(url);
        loading.classList.add('hidden');
      };
      img.src = url;
    } catch (err) {
      alert("Failed to remove background: " + err.message);
      loading.classList.add('hidden');
    }
  });

  // Download Action
  document.getElementById('btnDownload').addEventListener('click', () => {
    const format = document.getElementById('exportFormat').value; // e.g. image/png
    let ext = 'png';
    if (format === 'image/jpeg') ext = 'jpg';
    if (format === 'image/webp') ext = 'webp';

    const dataUrl = canvas.toDataURL(format, 0.92);

    // Call background script to download so it obeys settings
    chrome.runtime.sendMessage({
      action: 'downloadImage',
      srcUrl: srcUrl, // Pass original URL for base name extraction
      mimeType: format,
      ext: ext,
      // override dataUrl? Wait, background script will re-fetch it! 
      // We must pass the edited data URL.
      customDataUrl: dataUrl 
    });
  });
});
