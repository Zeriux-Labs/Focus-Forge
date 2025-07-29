// This content script works with the background script to enhance the blocking functionality
// The main blocking is handled by declarativeNetRequest in background.js

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle any content-specific actions here if needed
  if (message.action === "contentCheck") {
    sendResponse({ status: "Content script is active" });
    return true;
  }
  
  // Default response
  sendResponse({ status: "Unknown message" });
  return false;
});

// Add a class to the body to enable custom CSS styling if needed
document.body.classList.add('focus-forge-active');

// Log that the content script has loaded (for debugging)
console.log("Focus Forge content script loaded");
  
