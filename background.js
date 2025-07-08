let blockedSites = [];
let studyMode = false;
let usageData = {};

let currentActive = {
  tabId: null,
  url: null,
  startTime: null,
};

let savingTimeInProgress = false; // prevent overlapping calls

// Load initial data
chrome.storage.sync.get(["blockedSites", "studyMode"], (data) => {
  blockedSites = data.blockedSites || ["youtube.com", "tiktok.com", "instagram.com", "netflix.com"];
  studyMode = data.studyMode || false;
  updateBlockingRules();
});

chrome.storage.local.get(["usageData"], (data) => {
  usageData = data.usageData || {};
});

function updateBlockingRules() {
  const removeRuleIds = blockedSites.map((_, i) => i + 1);
  if (!studyMode) {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: []
    });
    return;
  }

  const newRules = blockedSites.map((site, i) => ({
    id: i + 1,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${site}^`,
      resourceTypes: ["main_frame"],
    },
  }));

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: newRules
  });
}

async function saveCurrentTabTime() {
  if (savingTimeInProgress) return; // skip if a save is ongoing
  savingTimeInProgress = true;

  if (currentActive.tabId !== null && currentActive.startTime !== null) {
    try {
      const tab = await chrome.tabs.get(currentActive.tabId);
      if (!tab || !tab.url || tab.url.startsWith("chrome://")) {
        savingTimeInProgress = false;
        return;
      }

      const now = Date.now();
      let timeSpent = now - currentActive.startTime;

      // sanity check to avoid negative or huge jumps (>1 hour)
      if (timeSpent < 0 || timeSpent > 60 * 60 * 1000) {
        timeSpent = 0;
      }

      const hostname = new URL(tab.url).hostname.replace("www.", "");

      if (!usageData[hostname]) {
        usageData[hostname] = { visits: 0, totalTime: 0, lastVisit: 0 };
      }

      usageData[hostname].totalTime += timeSpent;
      usageData[hostname].lastVisit = now;
      await chrome.storage.local.set({ usageData });

      // Reset startTime after saving
      currentActive.startTime = now;
    } catch (e) {
      // ignore errors
    }
  }

  savingTimeInProgress = false;
}

async function switchActiveTab(newTabId) {
  await saveCurrentTabTime();

  if (newTabId === null) {
    currentActive = { tabId: null, url: null, startTime: null };
    return;
  }

  try {
    const tab = await chrome.tabs.get(newTabId);
    if (!tab || !tab.url || tab.url.startsWith("chrome://")) {
      currentActive = { tabId: null, url: null, startTime: null };
      return;
    }

    // Only reset startTime if switching to a different tab or URL
    if (currentActive.tabId !== newTabId || currentActive.url !== tab.url) {
      currentActive = {
        tabId: newTabId,
        url: tab.url,
        startTime: Date.now(),
      };

      // Count visit once on tab switch or URL change
      const hostname = new URL(tab.url).hostname.replace("www.", "");
      if (!usageData[hostname]) {
        usageData[hostname] = { visits: 0, totalTime: 0, lastVisit: 0 };
      }
      usageData[hostname].visits += 1;
      usageData[hostname].lastVisit = Date.now();
      await chrome.storage.local.set({ usageData });
    }
  } catch (e) {
    currentActive = { tabId: null, url: null, startTime: null };
  }
}

// Event listeners
chrome.tabs.onActivated.addListener(({ tabId }) => {
  switchActiveTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    switchActiveTab(tabId);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await switchActiveTab(null);
  } else {
    const tabs = await chrome.tabs.query({ active: true, windowId });
    if (tabs.length > 0) {
      await switchActiveTab(tabs[0].id);
    } else {
      await switchActiveTab(null);
    }
  }
});

// Message handler
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
    const now = Date.now();
    let threshold = 0;

    if (message.range === "today") {
      threshold = now - 24 * 60 * 60 * 1000;
    } else if (message.range === "week") {
      threshold = now - 7 * 24 * 60 * 60 * 1000;
    } else if (message.range === "month") {
      threshold = now - 30 * 24 * 60 * 60 * 1000;
    }

    const filteredUsage = {};
    for (const [site, data] of Object.entries(usageData)) {
      if (data.lastVisit >= threshold) {
        filteredUsage[site] = data;
      }
    }

    sendResponse({ usageData: filteredUsage });
  }

  return true;
});
