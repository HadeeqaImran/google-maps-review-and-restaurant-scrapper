// Main popup script for Restaurant Scraper - Modular Version
import { Config } from './js/config.js';
import { UI } from './js/ui.js';
import { ChromeUtils } from './js/chrome-utils.js';
import { scrapeAndDownloadOptimizedInjection, scrapeReviewsOptimizedInjection } from './js/scrapers/injection-functions.js';

class RestaurantScraperApp {
  constructor() {
    this.config = new Config();
    this.ui = new UI();
    this.chrome = new ChromeUtils();
    this.isScrapingActive = false;
    
    this.initializeApp();
  }

  initializeApp() {
    // Initialize UI elements
    this.ui.initializeCollapsible();
    this.setupEventListeners();
    this.ui.setStatus('Ready', 'info');
  }

  setupEventListeners() {
    // Restaurant extraction button
    const extractBtn = document.getElementById('go');
    if (extractBtn) {
      extractBtn.addEventListener('click', () => this.handleRestaurantExtraction());
    }

    // Review scraping button
    const reviewsBtn = document.getElementById('scrape-reviews');
    if (reviewsBtn) {
      reviewsBtn.addEventListener('click', () => this.handleReviewScraping());
    }

    // Download CSV button
    const pauseBtn = document.getElementById('pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this.handleDownloadCSV());
    }

    // Stop buttons
    const stopBtn = document.getElementById('stop-scraping');
    const stopRestaurantBtn = document.getElementById('stop-restaurant-scraping');
    
    if (stopBtn) {
      stopBtn.addEventListener('click', () => this.handleStopScraping());
    }
    
    if (stopRestaurantBtn) {
      stopRestaurantBtn.addEventListener('click', () => this.handleStopScraping());
    }

    // Settings change listeners
    this.setupSettingsListeners();
  }

  setupSettingsListeners() {
    // Review settings
    const maxReviewsInput = document.getElementById('max-reviews');
    if (maxReviewsInput) {
      maxReviewsInput.addEventListener('change', (e) => {
        this.config.set('MAX_REVIEWS', parseInt(e.target.value));
      });
    }
    
    const scrollSpeedSelect = document.getElementById('scroll-speed');
    if (scrollSpeedSelect) {
      scrollSpeedSelect.addEventListener('change', (e) => {
        const speeds = { fast: 600, normal: 800, slow: 1200 };
        const speed = speeds[e.target.value] || 800;
        this.config.set('SCROLL_TIMEOUT', speed);
      });
    }

    // Restaurant settings
    const maxRestaurantsInput = document.getElementById('max-restaurants');
    if (maxRestaurantsInput) {
      maxRestaurantsInput.addEventListener('change', (e) => {
        this.config.set('MAX_RESTAURANTS', parseInt(e.target.value));
      });
    }
    
    const restaurantScrollSpeedSelect = document.getElementById('restaurant-scroll-speed');
    if (restaurantScrollSpeedSelect) {
      restaurantScrollSpeedSelect.addEventListener('change', (e) => {
        const speeds = { fast: 600, normal: 800, slow: 1200 };
        const speed = speeds[e.target.value] || 800;
        this.config.set('RESTAURANT_SCROLL_TIMEOUT', speed);
        this.config.set('RESTAURANT_SCROLL_DELAY', speed);
      });
    }
    
    const maxScrollAttemptsSelect = document.getElementById('max-scroll-attempts');
    if (maxScrollAttemptsSelect) {
      maxScrollAttemptsSelect.addEventListener('change', (e) => {
        this.config.set('MAX_SCROLL_ATTEMPTS', parseInt(e.target.value));
      });
    }
  }

  async handleRestaurantExtraction() {
    try {
      this.ui.setStatus('Extracting restaurants...', 'info');
      this.ui.createProgressBar();
      this.config.syncFromUI();
      
      const tab = await this.chrome.getActiveTab();
      
      // Validate page
      const validation = this.ui.validateRestaurantSearchPage(tab.url);
      if (!validation.valid) {
        this.ui.setStatus(validation.error, 'warning');
        this.ui.hideProgress();
        return;
      }

      // Set scraping state
      this.isScrapingActive = true;
      this.chrome.setActiveTab(tab.id);
      this.ui.showStopButton(true, 'restaurant');

      // Create progress listener
      this.chrome.createRestaurantProgressListener(
        tab.id, 
        this.ui, 
        (success, result) => {
          this.isScrapingActive = false;
          this.chrome.setActiveTab(null);
        }
      );

      // Execute script
      try {
        await this.chrome.executeScript(tab.id, scrapeAndDownloadOptimizedInjection, [this.config.get()]);
      } catch (error) {
        console.error('Script execution failed:', error);
        this.ui.setStatus('Injection error; see console.', 'error');
        this.ui.hideProgress();
        this.ui.showStopButton(false, 'restaurant');
        this.isScrapingActive = false;
        this.chrome.removeMessageListener(tab.id);
      }

    } catch (error) {
      console.error('Restaurant extraction failed:', error);
      this.ui.setStatus('Failed to extract restaurants', 'error');
      this.ui.hideProgress();
      this.ui.showStopButton(false, 'restaurant');
      this.isScrapingActive = false;
    }
  }

  async handleReviewScraping() {
    try {
      this.ui.setStatus('Scraping reviews...', 'info');
      this.ui.showPauseButton(false);
      this.ui.createProgressBar();
      this.config.syncFromUI();

      const tab = await this.chrome.getActiveTab();
      
      // Validate page
      if (!tab.url.includes('/maps/place/')) {
        this.ui.setStatus('Open a restaurant page first.', 'warning');
        this.ui.hideProgress();
        return;
      }

      // Set scraping state
      this.isScrapingActive = true;
      this.chrome.setActiveTab(tab.id);
      this.ui.showStopButton(true, 'review');

      // Create progress listener
      this.chrome.createReviewProgressListener(
        tab.id, 
        this.ui, 
        (success, result) => {
          this.isScrapingActive = false;
          this.chrome.setActiveTab(null);
        }
      );

      // Execute script
      try {
        await this.chrome.executeScript(tab.id, scrapeReviewsOptimizedInjection, [this.config.get()]);
      } catch (error) {
        console.error('Script execution failed:', error);
        this.ui.setStatus('Review scraping failed', 'error');
        this.ui.hideProgress();
        this.ui.showStopButton(false, 'review');
        this.isScrapingActive = false;
        this.chrome.removeMessageListener(tab.id);
      }

    } catch (error) {
      console.error('Review scraping failed:', error);
      this.ui.setStatus('Failed to scrape reviews', 'error');
      this.ui.hideProgress();
      this.ui.showStopButton(false, 'review');
      this.isScrapingActive = false;
    }
  }

  handleDownloadCSV() {
    if (window.lastCsv) {
      const blob = new Blob([window.lastCsv.csv], { type: "text/csv" });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = window.lastCsv.filename || "reviews.csv";
      a.click();
      URL.revokeObjectURL(dlUrl);
      this.ui.setStatus(`Downloaded ${window.lastCsv.length} reviews`, 'success');
    } else {
      this.ui.setStatus('No data to download. Run scraper first.', 'warning');
    }
  }

  handleStopScraping() {
    if (this.isScrapingActive) {
      const tabId = this.chrome.getActiveTabId();
      if (tabId) {
        this.chrome.stopScraping(tabId);
        this.isScrapingActive = false;
        this.ui.showStopButton(false, 'review');
        this.ui.showStopButton(false, 'restaurant');
        this.ui.hideProgress();
        this.ui.setStatus('Scraping stopped by user', 'warning');
        this.chrome.setActiveTab(null);
      }
    }
  }

  // Cleanup when popup closes
  cleanup() {
    this.chrome.cleanup();
    this.isScrapingActive = false;
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.restaurantScraperApp = new RestaurantScraperApp();
});

// Cleanup when popup is closed
window.addEventListener('beforeunload', () => {
  if (window.restaurantScraperApp) {
    window.restaurantScraperApp.cleanup();
  }
}); 