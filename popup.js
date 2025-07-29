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
  aiInsightsContent.innerHTML = "<p id='loadingText'>Analyzing your browsing habits with Gemini AI...</p>";
  createTypingAnimation(document.getElementById('loadingText'), "Analyzing your browsing habits with Gemini AI...");

  try {
    // Get usage data first
    const usageResponse = await new Promise(resolve =>
      chrome.runtime.sendMessage({ getUsageData: true, range: "month" }, resolve)
    );

    if (!usageResponse?.usageData || Object.keys(usageResponse.usageData).length === 0) {
      aiInsightsContent.innerHTML = `
        <div class="ai-error">
          <h3>No browsing data available</h3>
          <p id="noDataText"></p>
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
        <div class="ai-notice">
          <h3>Limited browsing data available</h3>
          <p id="limitedDataText"></p>
          <p id="currentSitesText"></p>
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
        <div class="ai-error">
          <h3>Gemini AI Error</h3>
          <p id="geminiErrorText"></p>
          <p id="geminiErrorHint"></p>
          <button id="retryAiBtn" class="retry-btn">Retry</button>
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
      <div class="ai-response">
        <div id="typingText" class="formatted-text"></div>
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
      <div class="ai-error">
        <h3>Error</h3>
        <p id="errorText"></p>
        <button id="retryAiBtn" class="retry-btn">Retry</button>
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
