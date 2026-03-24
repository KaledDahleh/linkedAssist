// EasyReach Background Service Worker

chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes('linkedin.com/messaging')) {
    chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
  }
});
