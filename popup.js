const blockInput = document.getElementById("blockInput");
const addBlockBtn = document.getElementById("addBlockBtn");
const blockList = document.getElementById("blockList");
const powerButton = document.getElementById("powerButton");
const statusDot = document.querySelector(".status-dot");
const statusText = document.querySelector(".status-indicator span");

const tabs = document.querySelectorAll(".nav-tab");
const tabContents = document.querySelectorAll(".tab-content");
const subTabs = document.querySelectorAll(".filter-btn");

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
  
  // Update site count
  const siteCount = document.querySelector(".site-count");
  if (siteCount) {
    siteCount.textContent = `${blockedSites.length} sites`;
  }
  
  if (blockedSites.length === 0) {
    blockList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🚫</div>
        <div class="empty-text">No blocked sites</div>
        <div class="empty-subtext">Add websites to block during study mode</div>
      </div>
    `;
    return;
  }
  
  blockedSites.forEach((site, index) => {
    const li = document.createElement("li");
    
    const siteSpan = document.createElement("span");
    siteSpan.className = "site-url";
    siteSpan.textContent = site;
    
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.innerHTML = "✕";
    removeBtn.title = "Remove site";
    removeBtn.onclick = () => removeSite(index);

    li.appendChild(siteSpan);
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
    powerButton.classList.add("on");
    powerButton.classList.remove("off");
    powerButton.title = "Turn OFF Study Mode";
    
    // Update status indicator
    if (statusDot) {
      statusDot.classList.add("active");
    }
    if (statusText) {
      statusText.textContent = "Active";
    }
  } else {
    powerButton.classList.remove("on");
    powerButton.classList.add("off");
    powerButton.title = "Turn ON Study Mode";
    
    // Update status indicator
    if (statusDot) {
      statusDot.classList.remove("active");
    }
    if (statusText) {
      statusText.textContent = "Inactive";
    }
  }
}

// Load usage data for Tracker tab
function loadUsageData(range) {
  trackerContent.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <div>Loading usage data...</div>
    </div>
  `;

  chrome.runtime.sendMessage({ getUsageData: true, range }, (response) => {
    if (!response || !response.usageData) {
      trackerContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <div class="empty-text">No usage data available</div>
          <div class="empty-subtext">Browse the web to see your activity here</div>
        </div>
      `;
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
      trackerContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <div class="empty-text">No sites tracked yet</div>
          <div class="empty-subtext">Start browsing to see your activity</div>
        </div>
      `;
      return;
    }

    function formatTime(ms) {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}m ${seconds}s`;
    }

    const totalVisits = sitesArray.reduce((sum, x) => sum + x.visits, 0);
    const totalTimeSpent = sitesArray.reduce((sum, x) => sum + x.totalTime, 0);
    const uniqueSites = sitesArray.length;

    let reportHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">Top Visited Sites</div>
          <div class="card-subtitle">${range.charAt(0).toUpperCase() + range.slice(1)} overview</div>
        </div>
        
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
          <div style="text-align: center; padding: 1rem; background: var(--bg-glass); border-radius: var(--radius-lg); border: 1px solid var(--border-primary);">
            <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-primary);">${totalVisits}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Total Visits</div>
          </div>
          <div style="text-align: center; padding: 1rem; background: var(--bg-glass); border-radius: var(--radius-lg); border: 1px solid var(--border-primary);">
            <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-primary);">${formatTime(totalTimeSpent)}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Total Time</div>
          </div>
          <div style="text-align: center; padding: 1rem; background: var(--bg-glass); border-radius: var(--radius-lg); border: 1px solid var(--border-primary);">
            <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-primary);">${uniqueSites}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Unique Sites</div>
          </div>
        </div>
        
        <div class="sites-list">
    `;
    
    sitesArray.slice(0, 5).forEach(({ site, visits, totalTime }, index) => {
      reportHTML += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--bg-glass); border-radius: var(--radius-md); margin-bottom: 0.5rem; border: 1px solid var(--border-secondary);">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 1.5rem; height: 1.5rem; background: var(--primary-gradient); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600; color: white;">${index + 1}</div>
            <div>
              <div style="font-weight: 500; color: var(--text-primary);">${escapeHTML(site)}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${visits} visits</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 500; color: var(--text-primary);">${formatTime(totalTime)}</div>
          </div>
        </div>
      `;
    });

    reportHTML += `
        </div>
      </div>
    `;

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

// Fixed typing speed (milliseconds per character)
const TYPING_SPEED = 10;

// Function to create typing animation effect that properly handles HTML content
function createTypingAnimation(element, htmlText, callback = null) {
  element.innerHTML = '';
  
  // If the text doesn't contain HTML tags, use simple character-by-character animation
  if (!htmlText.includes('<')) {
    let i = 0;
    function typeWriter() {
      if (i < htmlText.length) {
        element.textContent += htmlText.charAt(i);
        i++;
        setTimeout(typeWriter, TYPING_SPEED);
      } else if (callback) {
        setTimeout(callback, 300);
      }
    }
    typeWriter();
    return;
  }
  
  // For HTML content, parse it and animate only the text content
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlText;
  
  // Extract all text content while preserving structure
  const textContent = tempDiv.textContent || tempDiv.innerText || '';
  
  // Set up the final HTML structure immediately but hide text
  element.innerHTML = htmlText;
  
  // Hide all text content initially
  const allTextNodes = [];
  function collectTextNodes(node) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      allTextNodes.push({
        node: node,
        originalText: node.textContent,
        currentLength: 0
      });
      node.textContent = '';
    } else {
      for (let child of node.childNodes) {
        collectTextNodes(child);
      }
    }
  }
  collectTextNodes(element);
  
  // Animate text content
  let currentNodeIndex = 0;
  let totalCharsTyped = 0;
  
  function typeNextChar() {
    if (currentNodeIndex >= allTextNodes.length) {
      if (callback) {
        setTimeout(callback, 300);
      }
      return;
    }
    
    const currentTextNode = allTextNodes[currentNodeIndex];
    const targetLength = currentTextNode.currentLength + 1;
    
    if (targetLength <= currentTextNode.originalText.length) {
      currentTextNode.node.textContent = currentTextNode.originalText.substring(0, targetLength);
      currentTextNode.currentLength = targetLength;
      totalCharsTyped++;
      
      setTimeout(typeNextChar, TYPING_SPEED);
    } else {
      // Move to next text node
      currentNodeIndex++;
      setTimeout(typeNextChar, TYPING_SPEED);
    }
  }
  
  typeNextChar();
}

// Load AI suggestions for AI Insights tab by asking background.js to call Gemini API
async function loadAISuggestions() {
  aiInsightsContent.innerHTML = `
    <div class="loading-state">
      <div class="ai-loading-animation">
        <div class="ai-brain">
          <div class="brain-pulse"></div>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>
      </div>
      <div id='loadingText'>Analyzing your browsing habits with Gemini AI...</div>
    </div>
  `;
  createTypingAnimation(document.getElementById('loadingText'), "Analyzing your browsing habits with Gemini AI...");

  try {
    // Get usage data first
    const usageResponse = await new Promise(resolve =>
      chrome.runtime.sendMessage({ getUsageData: true, range: "month" }, resolve)
    );

    if (!usageResponse?.usageData || Object.keys(usageResponse.usageData).length === 0) {
      aiInsightsContent.innerHTML = `
        <div class="card">
          <div class="ai-error">
            <div class="card-header">
              <div class="card-title">No browsing data available</div>
            </div>
            <p id="noDataText"></p>
          </div>
        </div>
      `;
      
      // Add typing animation for no data message
      const noDataMessage = "Browse the web for a while with Focus Forge enabled to collect data for AI insights.";
      createTypingAnimation(document.getElementById("noDataText"), noDataMessage);
      return;
    }

    // Check if we have enough data to make meaningful suggestions
    const sites = Object.keys(usageResponse.usageData);
    if (sites.length < 3) {
      aiInsightsContent.innerHTML = `
        <div class="card">
          <div class="ai-notice">
            <div class="card-header">
              <div class="card-title">Limited browsing data available</div>
            </div>
            <p id="limitedDataText"></p>
            <p id="currentSitesText"></p>
          </div>
        </div>
      `;
      
      // Add typing animation for limited data notice
      const limitedMessage = `Only ${sites.length} site(s) tracked. Continue browsing to get more personalized insights.`;
      const sitesMessage = `Current sites: ${sites.join(", ")}`;
      
      // Create typing animation with callback for the second message
      createTypingAnimation(
        document.getElementById("limitedDataText"), 
        limitedMessage, 
        () => createTypingAnimation(document.getElementById("currentSitesText"), sitesMessage)
      );
      
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

    // Check if we got a valid response
    if (!aiResponse || aiResponse === "No response" || aiResponse.includes("Error:")) {
      aiInsightsContent.innerHTML = `
        <div class="card">
          <div class="ai-error">
            <div class="card-header">
              <div class="card-title">Gemini AI Error</div>
            </div>
            <p id="geminiErrorText"></p>
            <p id="geminiErrorHint"></p>
            <button id="retryAiBtn" class="retry-btn">Retry</button>
          </div>
        </div>
      `;
      
      // Add typing animation for Gemini error message
      const errorMessage = escapeHTML(aiResponse || "Failed to get a response from Gemini AI");
      const hintText = "This could be due to API limits, network issues, or an invalid API key.";
      
      // Create typing animation with callback for the hint message
      createTypingAnimation(
        document.getElementById("geminiErrorText"), 
        errorMessage, 
        () => createTypingAnimation(document.getElementById("geminiErrorHint"), hintText)
      );
      
      // Add retry button functionality
      document.getElementById("retryAiBtn").addEventListener("click", loadAISuggestions);
      return;
    }

    // Format the AI response with better styling and add typing animation
    aiInsightsContent.innerHTML = `
      <div class="card">
        <div class="ai-response">
          <div class="card-header">
            <div class="card-title">AI Insights</div>
            <div class="card-subtitle">Personalized recommendations based on your browsing habits</div>
          </div>
          <div id="typingText" class="formatted-text"></div>
        </div>
      </div>
    `;
    
    // Since the AI response already contains HTML tags, we just need to:
    // 1. Decode any HTML entities that might be encoded
    // 2. Process any remaining markdown formatting
    // 3. Handle line breaks
    
    let formattedText = aiResponse
      // Decode HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Process any remaining markdown formatting (in case there's mixed content)
      .replace(/\*\*([^*<>]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*<>]+?)\*/g, '<em>$1</em>')
      // Convert - text to bullet points (only at start of line)
      .replace(/^- (.+)$/gm, '• $1')
      // Replace newlines with <br> for proper line breaks
      .replace(/\n/g, '<br>');
    
    // Create typing animation effect
    createTypingAnimation(document.getElementById("typingText"), formattedText);
  } catch (error) {
    aiInsightsContent.innerHTML = `
      <div class="card">
        <div class="ai-error">
          <div class="card-header">
            <div class="card-title">Error</div>
          </div>
          <p id="errorText"></p>
          <button id="retryAiBtn" class="retry-btn">Retry</button>
        </div>
      </div>
    `;
    
    // Add typing animation for error message
    const errorMessage = escapeHTML(error.toString());
    createTypingAnimation(document.getElementById("errorText"), errorMessage);
    
    // Add retry button functionality
    document.getElementById("retryAiBtn").addEventListener("click", loadAISuggestions);
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
      if (tc.id === tabId) {
        tc.classList.remove("hidden");
        tc.classList.add("active");
      } else {
        tc.classList.add("hidden");
        tc.classList.remove("active");
      }
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
    
    // Check if tracker tab is currently active
    const trackerTab = document.getElementById("trackerTab");
    if (trackerTab && !trackerTab.classList.contains("hidden")) {
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
