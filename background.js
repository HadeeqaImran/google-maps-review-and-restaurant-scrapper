// Background service worker for GMaps Restaurant Scraper Pro
chrome.runtime.onInstalled.addListener(() => {
  console.log('GMaps Restaurant Scraper Pro installed successfully');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // The popup will handle the click, but this is here for completeness
  console.log('Extension icon clicked');
});

// Optional: Listen for messages from content scripts (future enhancement)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPING_PROGRESS') {
    // Could be used for progress updates in the future
    console.log('Scraping progress:', message.data);
  }
  return true; // Keep message channel open for async response
}); 