# 🖼️ Image Saver — Chrome Extension

![Image Saver Cover](icons/icon128.png)

A modern, fast, and seamless Chrome Extension that allows users to instantly save any image from the web into their preferred format (PNG, JPG, or WebP) using just a right-click.

---

## 🚀 Case Study

### 📌 Problem Statement
While browsing the web, users frequently need to download images. However, modern websites often serve images in next-gen formats like `.webp` or dynamic `Data URLs`, which might not be compatible with older software, image editors, or specific user needs. Converting these images manually after downloading is time-consuming and tedious.

### 💡 The Solution
**Image Saver** eliminates the hassle by providing an on-the-fly image conversion tool embedded directly into the browser's context menu. Users simply right-click on any image and choose their desired output format (PNG, JPG, or WebP). The extension handles the fetching, canvas-based conversion, and downloading silently in the background.

### ✨ Key Features
- **Right-Click Context Menu:** Seamless integration into the browser. "Save Image As…" -> PNG, JPG, or WebP.
- **On-the-Fly Conversion:** Utilizes Chrome's Manifest V3 Offscreen API and HTML5 Canvas to convert image data dynamically.
- **Lossless & Optimized Output:** PNG for lossless quality, JPG for smaller file sizes (with intelligent transparent-to-white background handling), and WebP for modern web standards.
- **Smart Filename Generation:** Automatically sanitizes complex URLs, preserves Unicode characters, and prevents file system errors.
- **SVG Support:** Intelligently handles SVG graphics by forcing default viewports for crisp rasterization.
- **Debounce Protection:** Prevents accidental duplicate downloads when users double-click rapidly.
- **User Notifications:** Gracefully handles conversion failures (e.g., restricted URLs or extreme resolutions) via native Chrome Toast notifications.

### 🛠️ Challenges Overcome
Migrating to **Manifest V3** restricted the use of DOM APIs (like `<canvas>`) in Service Workers. To solve this, the extension leverages the **Offscreen Document API** (`chrome.offscreen`). The service worker fetches the image and delegates the rendering and conversion to an offscreen document, ensuring robust and compliant performance without compromising the user experience.

---

## 💻 Tech Stack

- **Platform:** Google Chrome Extension (Manifest V3)
- **Languages:** JavaScript (ES6+), HTML5
- **APIs Used:** 
  - `chrome.contextMenus`
  - `chrome.downloads`
  - `chrome.offscreen`
  - `chrome.notifications`
- **Core Technology:** HTML5 `<canvas>` for pixel manipulation and format encoding, Fetch API (Blobs).

---

## 📥 How to Install & Use (Guideline for Users)

Since this extension is in active development and not yet published on the Chrome Web Store, you can easily install it manually using "Developer Mode".

### Installation Steps:
1. **Download the Code:** 
   - Click the green `<> Code` button at the top of this repository and select **Download ZIP**.
   - Extract the downloaded ZIP file to a folder on your computer.
2. **Open Chrome Extensions Page:**
   - Open Google Chrome.
   - Click the three dots (menu) in the top-right corner -> **Extensions** -> **Manage Extensions**.
   - Alternatively, type `chrome://extensions/` in your address bar and hit Enter.
3. **Enable Developer Mode:**
   - In the top right corner of the Extensions page, toggle the **Developer mode** switch to **ON**.
4. **Load the Extension:**
   - Click the **Load unpacked** button that appears on the top left.
   - Select the extracted folder (`Image Saver`) that contains the `manifest.json` file.
5. **🎉 Success!** The Image Saver extension is now installed.

### How to Use:
1. Go to any website.
2. **Right-click** on any image.
3. Hover over **"Save Image As…"** in the context menu.
4. Choose your preferred format (**PNG, JPG, or WebP**).
5. The image will automatically convert and download to your default downloads folder!

---
*Designed & Developed by [Ashraful Alam Ashik](https://github.com/ashrafulalamashik)*
