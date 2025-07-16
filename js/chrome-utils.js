// Chrome extension utilities for the Restaurant Scraper
export class ChromeUtils {
  constructor() {
    this.activeTabId = null;
    this.messageListeners = new Map();
  }

  // Get the active tab
  async getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  // Send message to content script
  sendMessage(tabId, message) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.tabs.sendMessage(tabId, message);
    }
  }

  // Send stop scraping signal
  stopScraping(tabId) {
    this.sendMessage(tabId, { type: 'STOP_SCRAPING' });
  }

  // Add message listener with automatic cleanup
  addMessageListener(tabId, callback) {
    const wrappedCallback = (message, sender, sendResponse) => {
      if (sender.tab && sender.tab.id === tabId) {
        callback(message, sender, sendResponse);
      }
    };

    chrome.runtime.onMessage.addListener(wrappedCallback);
    this.messageListeners.set(tabId, wrappedCallback);
    return wrappedCallback;
  }

  // Remove message listener
  removeMessageListener(tabId) {
    const listener = this.messageListeners.get(tabId);
    if (listener) {
      chrome.runtime.onMessage.removeListener(listener);
      this.messageListeners.delete(tabId);
    }
  }

  // Execute script in tab
  async executeScript(tabId, func, args = []) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId },
        func,
        args
      }, (injectionResults) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(injectionResults);
        }
      });
    });
  }

  // Create progress listener for restaurant extraction
  createRestaurantProgressListener(tabId, ui, onComplete) {
    return this.addMessageListener(tabId, (message, sender, sendResponse) => {
      if (message.type === 'RESTAURANT_PROGRESS') {
        const { phase, count } = message.data;
        ui.updateProgress(`${phase}: ${count} restaurants`, count > 0 ? 50 : 10);
      } else if (message.type === 'RESTAURANT_COMPLETE') {
        const { count } = message.data;
        ui.setStatus(`Extracted ${count} restaurants!`, 'success');
        ui.hideProgress();
        ui.showStopButton(false, 'restaurant');
        this.removeMessageListener(tabId);
        onComplete(true, count);
      } else if (message.type === 'RESTAURANT_ERROR') {
        const { error } = message.data;
        ui.setStatus(error, 'error');
        ui.hideProgress();
        ui.showStopButton(false, 'restaurant');
        this.removeMessageListener(tabId);
        onComplete(false, error);
      } else if (message.type === 'SCRAPING_STOPPED') {
        ui.setStatus('Restaurant extraction stopped', 'warning');
        ui.hideProgress();
        ui.showStopButton(false, 'restaurant');
        this.removeMessageListener(tabId);
        onComplete(false, 'stopped');
      }
    });
  }

  // Create progress listener for review scraping
  createReviewProgressListener(tabId, ui, onComplete) {
    return this.addMessageListener(tabId, (message, sender, sendResponse) => {
      if (message.type === 'SCRAPING_PROGRESS') {
        const { reviewCount, maxReviews, phase } = message.data;
        const percentage = maxReviews > 0 ? (reviewCount / maxReviews) * 100 : 0;
        ui.updateProgress(`${phase}: ${reviewCount} reviews found`, percentage);
      } else if (message.type === 'SCRAPING_COMPLETE') {
        const { reviewCount } = message.data;
        ui.setStatus(`Scraped ${reviewCount} reviews successfully!`, 'success');
        ui.hideProgress();
        ui.showStopButton(false, 'review');
        if (window.lastCsv) ui.showPauseButton(true);
        this.removeMessageListener(tabId);
        onComplete(true, reviewCount);
      } else if (message.type === 'REVIEW_ERROR') {
        const { error } = message.data;
        ui.setStatus(error, 'error');
        ui.hideProgress();
        ui.showStopButton(false, 'review');
        this.removeMessageListener(tabId);
        onComplete(false, error);
      } else if (message.type === 'SCRAPING_STOPPED') {
        ui.setStatus('Review scraping stopped', 'warning');
        ui.hideProgress();
        ui.showStopButton(false, 'review');
        if (window.lastCsv) ui.showPauseButton(true);
        this.removeMessageListener(tabId);
        onComplete(false, 'stopped');
      }
    });
  }

  // Cleanup all listeners
  cleanup() {
    for (const [tabId, listener] of this.messageListeners) {
      chrome.runtime.onMessage.removeListener(listener);
    }
    this.messageListeners.clear();
    this.activeTabId = null;
  }

  // Set active tab ID for tracking
  setActiveTab(tabId) {
    this.activeTabId = tabId;
  }

  // Get active tab ID
  getActiveTabId() {
    return this.activeTabId;
  }
} 