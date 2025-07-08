const blockInput = document.getElementById("blockInput");
const addBlockBtn = document.getElementById("addBlockBtn");
const blockList = document.getElementById("blockList");
const powerButton = document.getElementById("powerButton");

const tabs = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");
const subTabs = document.querySelectorAll(".sub-tab-button");

let blockedSites = [];
let studyMode = false;
let currentRange = "today"; // default range

// Render the blocked sites list UI
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

// Send updated block list to background script to update blocking rules
function updateRules() {
  chrome.runtime.sendMessage({ blockedSites });
}

// Save current sites to storage and update rules
function saveSites() {
  chrome.storage.sync.set({ blockedSites }, () => {
    updateRules();
  });
}

// Add new site to block list if valid and not duplicate
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

// Remove a site by index and update storage and UI
function removeSite(index) {
  blockedSites.splice(index, 1);
  renderList();
  saveSites();
}

// Update the power button UI according to studyMode state
function updatePowerButton() {
  if (studyMode) {
    powerButton.classList.remove("off");
    powerButton.title = "Turn OFF Study Mode";
  } else {
    powerButton.classList.add("off");
    powerButton.title = "Turn ON Study Mode";
  }
}

// Load blocked sites and studyMode on start from chrome.storage
chrome.storage.sync.get(["blockedSites", "studyMode"], (data) => {
  blockedSites = data.blockedSites || ["youtube.com", "tiktok.com", "instagram.com", "netflix.com"];
  studyMode = data.studyMode || false;
  renderList();
  updatePowerButton();
});

// Power button toggles studyMode and updates background
powerButton.addEventListener("click", () => {
  studyMode = !studyMode;
  chrome.storage.sync.set({ studyMode });
  chrome.runtime.sendMessage({ studyMode });
  updatePowerButton();
});

// Add site button
addBlockBtn.addEventListener("click", addSite);

// Support Enter key to add site
blockInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") addSite();
});

// Main tab switching
tabs.forEach((tabBtn) => {
  tabBtn.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tabBtn.classList.add("active");

    const tabId = tabBtn.dataset.tab;
    tabContents.forEach(tc => {
      if (tc.id === tabId) tc.classList.remove("hidden");
      else tc.classList.add("hidden");
    });

    if (tabId === "insightsTab") {
      loadUsageData(currentRange); // load default range
    }
  });
});

// Sub-tab switching (Today, Week, Month)
subTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    subTabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentRange = btn.dataset.range;
    loadUsageData(currentRange);
  });
});

// Load usage data from background based on range
function loadUsageData(range) {
  const insightsDiv = document.getElementById("insightsContent");
  insightsDiv.innerHTML = "<p>Loading usage data...</p>";

  chrome.runtime.sendMessage({ getUsageData: true, range }, (response) => {
    if (!response || !response.usageData) {
      insightsDiv.innerHTML = "<p>No usage data available.</p>";
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
      insightsDiv.innerHTML = "<p>No sites tracked yet.</p>";
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
      reportHTML += `<li><strong>${site}</strong>: ${visits} visits, Time spent: ${formatTime(totalTime)}</li>`;
    });
    reportHTML += "</ol>";

    const totalVisits = sitesArray.reduce((sum, x) => sum + x.visits, 0);
    const totalTimeSpent = sitesArray.reduce((sum, x) => sum + x.totalTime, 0);
    const uniqueSites = sitesArray.length;

    reportHTML += `<p><em>Total site visits: ${totalVisits}</em></p>`;
    reportHTML += `<p><em>Total time spent: ${formatTime(totalTimeSpent)}</em></p>`;
    reportHTML += `<p><em>Unique sites: ${uniqueSites}</em></p>`;

    insightsDiv.innerHTML = reportHTML;
  });
}
