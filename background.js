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
      // Try to get the tab information
      let tab;
      try {
        tab = await chrome.tabs.get(currentActive.tabId);
      } catch (tabError) {
        // Tab no longer exists, reset current active and exit
        console.log(`Tab ${currentActive.tabId} no longer exists, resetting tracking`);
        currentActive = { tabId: null, url: null, startTime: null };
        savingTimeInProgress = false;
        return;
      }
      
      if (!tab || !tab.url) {
        savingTimeInProgress = false;
        return;
      }
      
      // Skip tracking for chrome:// pages, extension pages, and other special URLs
      if (tab.url.startsWith("chrome://") || 
          tab.url.startsWith("chrome-extension://") ||
          tab.url.startsWith("about:") ||
          tab.url.startsWith("edge://") ||
          tab.url.startsWith("brave://")) {
        savingTimeInProgress = false;
        return;
      }

      const now = Date.now();
      let timeSpent = now - currentActive.startTime;

      // More reasonable sanity checks
      // Ignore negative times and cap at 1 hour to prevent unrealistic tracking
      if (timeSpent < 0) {
        timeSpent = 0;
      } else if (timeSpent > 60 * 60 * 1000) { // 1 hour max
        timeSpent = 60 * 60 * 1000;
      }
      
      // Only track if time spent is at least 500ms to avoid micro-interactions
      if (timeSpent >= 500) {
        try {
          const hostname = new URL(tab.url).hostname.replace(/^www\./, "");
          
          if (!hostname) {
            savingTimeInProgress = false;
            return;
          }

          if (!usageData[hostname]) {
            usageData[hostname] = { visits: 0, totalTime: 0, lastVisit: 0 };
          }

          usageData[hostname].totalTime += timeSpent;
          usageData[hostname].lastVisit = now;
          await chrome.storage.local.set({ usageData });
        } catch (urlError) {
          console.error("Error parsing URL:", urlError, tab.url);
        }
      }
      
      // Update the start time for the next calculation
      currentActive.startTime = now;
    } catch (e) {
      console.error("Error saving tab time:", e);
      // Reset tracking on any other error
      currentActive = { tabId: null, url: null, startTime: null };
    }
  }

  savingTimeInProgress = false;
}

async function switchActiveTab(newTabId) {
  // Save time for the previous tab before switching
  await saveCurrentTabTime();

  if (newTabId === null) {
    currentActive = { tabId: null, url: null, startTime: null };
    return;
  }

  try {
    // Try to get the tab information
    let tab;
    try {
      tab = await chrome.tabs.get(newTabId);
    } catch (tabError) {
      // Tab no longer exists, reset current active and exit
      console.log(`Tab ${newTabId} no longer exists, cannot switch to it`);
      currentActive = { tabId: null, url: null, startTime: null };
      return;
    }
    
    if (!tab || !tab.url) {
      currentActive = { tabId: null, url: null, startTime: null };
      return;
    }
    
    // Skip tracking for chrome:// pages, extension pages, and other special URLs
    if (tab.url.startsWith("chrome://") || 
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("about:") ||
        tab.url.startsWith("edge://") ||
        tab.url.startsWith("brave://")) {
      currentActive = { tabId: null, url: null, startTime: null };
      return;
    }

    // Only update if we're switching to a different tab or URL
    if (currentActive.tabId !== newTabId || currentActive.url !== tab.url) {
      try {
        const hostname = new URL(tab.url).hostname.replace(/^www\./, "");
        
        if (hostname) {
          // Initialize usage data for this hostname if it doesn't exist
          if (!usageData[hostname]) {
            usageData[hostname] = { visits: 0, totalTime: 0, lastVisit: 0 };
          }
          
          // Increment visit count and update last visit timestamp
          usageData[hostname].visits += 1;
          usageData[hostname].lastVisit = Date.now();
          await chrome.storage.local.set({ usageData });
        }
        
        // Update current active tab information
        currentActive = {
          tabId: newTabId,
          url: tab.url,
          startTime: Date.now(),
        };
      } catch (urlError) {
        console.error("Error parsing URL during tab switch:", urlError, tab.url);
        currentActive = { tabId: null, url: null, startTime: null };
      }
    }
  } catch (e) {
    console.error("Error switching active tab:", e);
    currentActive = { tabId: null, url: null, startTime: null };
  }
}

// Gemini AI API call helper - FIXED extraction of text
async function callGeminiAI(prompt) {
  try {
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
      console.error(`Gemini API HTTP error: ${response.status} ${response.statusText}`);
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Gemini API full response:", data);

    // Extract the generated text correctly (use .text inside parts)
    const generatedText = 
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.content?.text ||
      data?.generations?.[0]?.text;
      
    if (!generatedText) {
      console.error("Failed to extract text from Gemini API response", data);
      return "No response - Error extracting text from API response";
    }

    return generatedText;
  } catch (error) {
    console.error("Gemini API call failed:", error);
    return `Error: ${error.message}`;
  }
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
  try {
    switchActiveTab(tabId);
  } catch (error) {
    console.error("Error in tab activation handler:", error);
    // Reset tracking on any error
    currentActive = { tabId: null, url: null, startTime: null };
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    if (changeInfo.status === "complete" && tab.active) {
      switchActiveTab(tabId);
    }
  } catch (error) {
    console.error("Error in tab update handler:", error);
    // Reset tracking on any error
    currentActive = { tabId: null, url: null, startTime: null };
  }
});

// Handle tab removal to prevent errors with non-existent tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    // If the closed tab was the active one, reset tracking
    if (currentActive.tabId === tabId) {
      console.log(`Active tab ${tabId} was closed, resetting tracking`);
      saveCurrentTabTime().then(() => {
        currentActive = { tabId: null, url: null, startTime: null };
      }).catch(error => {
        console.error("Error saving tab time during tab removal:", error);
        currentActive = { tabId: null, url: null, startTime: null };
      });
    }
  } catch (error) {
    console.error("Error in tab removal handler:", error);
    // Reset tracking on any error
    currentActive = { tabId: null, url: null, startTime: null };
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  try {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      await switchActiveTab(null);
    } else {
      try {
        const tabs = await chrome.tabs.query({ active: true, windowId });
        if (tabs.length > 0) {
          await switchActiveTab(tabs[0].id);
        } else {
          await switchActiveTab(null);
        }
      } catch (queryError) {
        console.error("Error querying tabs during window focus change:", queryError);
        await switchActiveTab(null);
      }
    }
  } catch (error) {
    console.error("Error handling window focus change:", error);
    // Reset tracking on any error
    currentActive = { tabId: null, url: null, startTime: null };
  }
});
