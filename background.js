let blockedSites = [];
let studyMode = false;
let usageData = {};

let currentActive = {
  tabId: null,
  url: null,
  startTime: null,
};

let savingTimeInProgress = false; // prevent overlapping saves

const GEMINI_API_KEY = "AIzaSyCmKw4zT3vLqumy73gcde69cZSxbAqf7x4";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// Load initial data
chrome.storage.sync.get(["blockedSites", "studyMode"], (data) => {
  blockedSites = data.blockedSites || [];
  studyMode = data.studyMode || false;
  updateBlockingRules();
});

chrome.storage.local.get(["usageData"], (data) => {
  usageData = data.usageData || {};
});

function updateBlockingRules() {
  const removeRuleIds = blockedSites.map((_, i) => i + 1);

  if (!studyMode) {
    // Remove all dynamic rules if study mode off
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
  if (savingTimeInProgress) return;
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

      // Sanity checks
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

      currentActive.startTime = now;
    } catch (e) {
      // Ignore errors silently
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

    if (currentActive.tabId !== newTabId || currentActive.url !== tab.url) {
      currentActive = {
        tabId: newTabId,
        url: tab.url,
        startTime: Date.now(),
      };

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

// Gemini AI API call helper - FIXED extraction of text
async function callGeminiAI(prompt) {
  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt }
          ]
        }
      ]
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  console.log("Gemini API full response:", data);

  // Extract the generated text correctly (use .text inside content)
  const generatedText =
    data?.candidates?.[0]?.content?.text ||
    data?.generations?.[0]?.text ||
    "No response";

  return generatedText;
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // Update blocked sites
    if (message.blockedSites) {
      blockedSites = message.blockedSites;
      updateBlockingRules();
      sendResponse({ status: "blockedSites updated" });
      return false; // sync response
    }

    // Toggle study mode
    if (typeof message.studyMode === "boolean") {
      studyMode = message.studyMode;
      updateBlockingRules();
      sendResponse({ status: `studyMode set to ${studyMode}` });
      return false; // sync response
    }

    // Get usage data for tracker tab
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
      return false; // sync response
    }

    // Handle Gemini AI fetch request asynchronously
    if (message.action === "fetchGeminiAI") {
      (async () => {
        try {
          const aiResponse = await callGeminiAI(message.prompt);
          sendResponse({ success: true, data: aiResponse });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();

      return true; // keep message channel open for async response
    }

    // If none of the above, just ignore and close the channel
    sendResponse({ error: "Unknown message" });
    return false;

  } catch (err) {
    // Catch unexpected errors and respond
    sendResponse({ success: false, error: err.message || String(err) });
    return false;
  }
});

// Tab and window event listeners
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
