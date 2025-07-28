const blockInput = document.getElementById("blockInput");
const addBlockBtn = document.getElementById("addBlockBtn");
const blockList = document.getElementById("blockList");
const powerButton = document.getElementById("powerButton");

const tabs = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");
const subTabs = document.querySelectorAll(".sub-tab-button");

const trackerContent = document.getElementById("trackerContent");
const aiInsightsContent = document.getElementById("aiInsightsContent");

let blockedSites = [];
let studyMode = false;
let currentRange = "today"; // for tracker tab

// Escape HTML entities to avoid injection issues
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, function (m) {
    return ({
      '&': "&amp;",
      '<': "&lt;",
      '>': "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[m];
  });
}

// --- Render blocked sites list ---
function renderList() {
  blockList.innerHTML = "";
  blockedSites.forEach((site, index) => {
    const li = document.createElement("li");
    li.textContent = site;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove site";
    removeBtn.onclick = () => removeSite(index);

    li.appendChild(removeBtn);
    blockList.appendChild(li);
  });
}

// Update blocking rules in background
function updateRules() {
  chrome.runtime.sendMessage({ blockedSites });
}

// Save sites to storage and update rules
function saveSites() {
  chrome.storage.sync.set({ blockedSites }, () => {
    updateRules();
  });
}

// Add site to block list
function addSite() {
  const site = blockInput.value.trim().toLowerCase();
  if (!site) return;
  if (blockedSites.includes(site)) {
    alert("Site already in block list.");
    return;
  }
  blockedSites.push(site);
  blockInput.value = "";
  renderList();
  saveSites();
}

// Remove site from block list
function removeSite(index) {
  blockedSites.splice(index, 1);
  renderList();
  saveSites();
}

// Update power button UI
function updatePowerButton() {
  if (studyMode) {
    powerButton.classList.remove("off");
    powerButton.title = "Turn OFF Study Mode";
  } else {
    powerButton.classList.add("off");
    powerButton.title = "Turn ON Study Mode";
  }
}

// Load usage data for Tracker tab
function loadUsageData(range) {
  trackerContent.innerHTML = "<p>Loading usage data...</p>";

  chrome.runtime.sendMessage({ getUsageData: true, range }, (response) => {
    if (!response || !response.usageData) {
      trackerContent.innerHTML = "<p>No usage data available.</p>";
      return;
    }

    const usageData = response.usageData;
    const sitesArray = Object.entries(usageData)
      .map(([site, data]) => ({
        site,
        visits: data.visits,
        totalTime: data.totalTime || 0,
      }))
      .sort((a, b) => b.visits - a.visits);

    if (sitesArray.length === 0) {
      trackerContent.innerHTML = "<p>No sites tracked yet.</p>";
      return;
    }

    function formatTime(ms) {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}m ${seconds}s`;
    }

    let reportHTML = `<h3>Top Visited Sites (${range.charAt(0).toUpperCase() + range.slice(1)}):</h3><ol>`;
    sitesArray.slice(0, 5).forEach(({ site, visits, totalTime }) => {
      reportHTML += `<li><strong>${escapeHTML(site)}</strong>: ${visits} visits, Time spent: ${formatTime(totalTime)}</li>`;
    });
    reportHTML += "</ol>";

    const totalVisits = sitesArray.reduce((sum, x) => sum + x.visits, 0);
    const totalTimeSpent = sitesArray.reduce((sum, x) => sum + x.totalTime, 0);
    const uniqueSites = sitesArray.length;

    reportHTML += `<p><em>Total site visits: ${totalVisits}</em></p>`;
    reportHTML += `<p><em>Total time spent: ${formatTime(totalTimeSpent)}</em></p>`;
    reportHTML += `<p><em>Unique sites: ${uniqueSites}</em></p>`;

    trackerContent.innerHTML = reportHTML;
  });
}

// Format data for AI prompt
function formatUsageDataForPrompt(usageData, blockedSites) {
  const usageSummary = Object.entries(usageData).map(([site, data]) => {
    const avgTime = data.totalTime / (data.visits || 1);
    return `- ${site}: ${data.visits} visits, total time ${(data.totalTime / 60000).toFixed(1)} min, avg time per visit ${(avgTime / 60000).toFixed(1)} min`;
  }).join("\n");

  const blockedList = blockedSites.length > 0 ? blockedSites.join(", ") : "None";

  return `Browsing Data:
${usageSummary}

Blocked Sites:
${blockedList}

Please analyze this browsing data and blocked sites, then provide personalized, concise, and actionable suggestions to improve my focus and productivity, including where I might reduce time or update my blocked sites.`;
}

// Load AI suggestions for AI Insights tab by asking background.js to call Gemini API
async function loadAISuggestions() {
  aiInsightsContent.innerHTML = "<p>Analyzing your browsing habits with Gemini AI...</p>";

  try {
    // Get usage data first
    const usageResponse = await new Promise(resolve =>
      chrome.runtime.sendMessage({ getUsageData: true, range: "month" }, resolve)
    );

    if (!usageResponse?.usageData) {
      aiInsightsContent.innerHTML = "<p>No usage data available.</p>";
      return;
    }

    const prompt = formatUsageDataForPrompt(usageResponse.usageData, blockedSites);

    // Send prompt to background for Gemini API call
    const aiResponse = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "fetchGeminiAI", prompt },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError.message);
          } else if (response?.success) {
            resolve(response.data);
          } else {
            reject(response?.error || "Unknown error from background");
          }
        }
      );
    });

    aiInsightsContent.innerHTML = `<pre style="white-space: pre-wrap;">${escapeHTML(aiResponse)}</pre>`;
  } catch (error) {
    aiInsightsContent.innerHTML = `<p>Error: ${escapeHTML(error)}</p>`;
  }
}

// Event Listeners

powerButton.addEventListener("click", () => {
  studyMode = !studyMode;
  chrome.storage.sync.set({ studyMode });
  chrome.runtime.sendMessage({ studyMode });
  updatePowerButton();
});

addBlockBtn.addEventListener("click", addSite);

blockInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") addSite();
});

tabs.forEach((tabBtn) => {
  tabBtn.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tabBtn.classList.add("active");

    const tabId = tabBtn.dataset.tab;
    tabContents.forEach(tc => {
      if (tc.id === tabId) tc.classList.remove("hidden");
      else tc.classList.add("hidden");
    });

    if (tabId === "trackerTab") {
      loadUsageData(currentRange);
    } else if (tabId === "aiInsightsTab") {
      loadAISuggestions();
    }
  });
});

subTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    subTabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentRange = btn.dataset.range;
    if (!trackerContent.classList.contains("hidden")) {
      loadUsageData(currentRange);
    }
  });
});

// Initial load from storage
chrome.storage.sync.get(["blockedSites", "studyMode"], (data) => {
  blockedSites = data.blockedSites || [];
  studyMode = data.studyMode || false;
  renderList();
  updatePowerButton();
});
