document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toneSelect = document.getElementById('tone');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load saved settings
  chrome.storage.sync.get(['geminiApiKey', 'defaultTone'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.defaultTone) {
      toneSelect.value = result.defaultTone;
    }
  });

  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      status.textContent = 'Please enter an API key.';
      status.className = 'status error';
      return;
    }

    chrome.storage.sync.set({
      geminiApiKey: apiKey,
      defaultTone: toneSelect.value
    }, () => {
      status.textContent = 'Settings saved!';
      status.className = 'status success';
      setTimeout(() => {
        status.textContent = '';
        status.className = 'status';
      }, 2000);
    });
  });
});
