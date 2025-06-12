let blockedSites = [];
let studyMode = false;

// Usage data format:
// { site: "youtube.com", lastVisit: timestamp, visits: number }
// We'll store an object with site keys and visit counts/timestamps
let usageData = {};

// Load from storage at startup
chrome.storage.sync.get(["blockedSites", "studyMode"], (data) => {
  blockedSites = data.blockedSites || ["youtube.com", "tiktok.com", "instagram.com", "netflix.com"];
  studyMode = data.studyMode || false;
  updateBlockingRules();
});

chrome.storage.local.get(["usageData"], (data) => {
  usageData = data.usageData || {};
});

// Update blocking rules based on studyMode and blockedSites
function updateBlockingRules() {
  const removeRuleIds = blockedSites.map((_, i) => i + 1);

  if (!studyMode) {
    // Remove all blocking rules if studyMode is off
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: []
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error clearing rules:", chrome.runtime.lastError);
      } else {
        console.log("Study mode OFF: blocking rules cleared");
      }
    });
    return;
  }

  // If studyMode ON, create new blocking rules
  const newRules = blockedSites.map((site, i) => ({
    id: i + 1,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${site}^`,   // Block domain and subdomains
      resourceTypes: ["main_frame"]
    }
  }));

  // Update rules atomically: remove old and add new
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: newRules
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error updating rules:", chrome.runtime.lastError);
    } else {
      console.log("Blocking rules updated:", newRules);
    }
  });
}

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.blockedSites) {
    blockedSites = message.blockedSites;
    updateBlockingRules();
    sendResponse({ status: "blockedSites updated" });
  }
  if (typeof message.studyMode === "boolean") {
    studyMode = message.studyMode;
    updateBlockingRules();
    sendResponse({ status: `studyMode set to ${studyMode}` });
  }
  if (message.getUsageData) {
    // Return aggregated usage data
    sendResponse({ usageData });
  }
});

// Track website usage when tab is updated or activated
function trackSiteUsage(url) {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    const now = Date.now();

    if (!usageData[hostname]) {
      usageData[hostname] = { visits: 0, lastVisit: now };
    }
    usageData[hostname].visits += 1;
    usageData[hostname].lastVisit = now;

    // Save updated usage data
    chrome.storage.local.set({ usageData });
  } catch (e) {
    // Ignore invalid URLs
  }
}

// Track when tab is updated with new URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && !tab.url.startsWith("chrome://")) {
    trackSiteUsage(tab.url);
  }
});

// Track when tab is activated (user switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url && !tab.url.startsWith("chrome://")) {
    trackSiteUsage(tab.url);
  }
});
