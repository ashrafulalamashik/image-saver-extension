document.addEventListener('DOMContentLoaded', () => {
  const folderNameInput = document.getElementById('folderName');
  const namePrefixInput = document.getElementById('namePrefix');
  const appendTimestampCheckbox = document.getElementById('appendTimestamp');
  const saveBtn = document.getElementById('saveBtn');
  const statusMsg = document.getElementById('status');

  // Load existing settings
  chrome.storage.sync.get({
    folderName: '',
    namePrefix: '',
    appendTimestamp: false
  }, (items) => {
    folderNameInput.value = items.folderName;
    namePrefixInput.value = items.namePrefix;
    appendTimestampCheckbox.checked = items.appendTimestamp;
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const folderName = folderNameInput.value.trim();
    const namePrefix = namePrefixInput.value.trim();
    const appendTimestamp = appendTimestampCheckbox.checked;

    // Optional: Validate folder name to prevent dangerous paths
    const safeFolderName = folderName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim();

    chrome.storage.sync.set({
      folderName: safeFolderName,
      namePrefix: namePrefix,
      appendTimestamp: appendTimestamp
    }, () => {
      // Update UI to show changes were saved
      if (folderName !== safeFolderName) {
        folderNameInput.value = safeFolderName; // Show cleaned name
      }
      
      statusMsg.textContent = 'Settings saved!';
      statusMsg.classList.add('show');
      
      setTimeout(() => {
        statusMsg.classList.remove('show');
      }, 2000);
    });
  });
});
