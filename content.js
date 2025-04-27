const blockedSites = [
    "youtube.com",
    "tiktok.com",
    "instagram.com",
    "netflix.com"
  ];
  
  let focusMode = false;
  
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ focusMode: false });
  });
  
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'focusMode' in changes) {
      focusMode = changes.focusMode.newValue;
    }
  });
  
  chrome.webNavigation.onCompleted.addListener(async (details) => {
    const url = new URL(details.url);
    const hostname = url.hostname;
  
    if (focusMode && blockedSites.some(site => hostname.includes(site))) {
      chrome.tabs.remove(details.tabId);
    }
  }, { url: blockedSites.map(site => ({ hostContains: site })) });
  
