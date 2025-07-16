// Restaurant scraper module for extracting restaurant data from Google Maps
import { wait, downloadCSV, generateCSV, sendChromeMessage, log } from '../utils.js';

export class RestaurantScraper {
  constructor(config) {
    this.config = config;
    this.shouldStop = false;
    this.messageListener = null;
  }

  // Initialize stop signal listener
  initializeStopListener() {
    this.messageListener = (message, sender, sendResponse) => {
      if (message.type === 'STOP_SCRAPING') {
        this.shouldStop = true;
        log('Stop signal received');
      }
    };
    
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener(this.messageListener);
    }
  }

  // Clean up message listener
  cleanup() {
    if (this.messageListener && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
    }
  }

  // Find the results pane
  findResultsPane() {
    const pane = document.querySelector('[role="feed"]');
    if (!pane) {
      log("Results pane not found - make sure you're on a Google Maps search page", 'error');
      return null;
    }
    return pane;
  }

  // Send progress update
  sendProgress(phase, count) {
    sendChromeMessage('RESTAURANT_PROGRESS', { phase, count });
  }

  // Send completion message
  sendComplete(count) {
    sendChromeMessage('RESTAURANT_COMPLETE', { count });
  }

  // Send error message
  sendError(error) {
    sendChromeMessage('RESTAURANT_ERROR', { error });
  }

  // Send stopped message
  sendStopped(count) {
    sendChromeMessage('SCRAPING_STOPPED', { count });
  }

  // Scroll and load all restaurant results
  async scrollToLoadAll(pane) {
    let lastHeight = pane.scrollHeight;
    let noChangeCount = 0;
    let scrollAttempts = 0;
    const maxNoChange = this.config.MAX_NO_CHANGE || 3;

    // Send initial progress
    this.sendProgress('Scrolling to load restaurants', 0);

    while (noChangeCount < maxNoChange && !this.shouldStop) {
      scrollAttempts++;
      
      // Scroll to bottom
      pane.scrollTo(0, pane.scrollHeight);
      log(`Scroll attempt ${scrollAttempts} (height: ${lastHeight})`);
      
      // Wait for content to load
      await wait(this.config.SCROLL_DELAY || 600);
      
      // Check for stop signal
      if (this.shouldStop) {
        log("Scraping stopped by user");
        break;
      }
      
      const newHeight = pane.scrollHeight;
      if (newHeight > lastHeight) {
        log(`Height increased: ${lastHeight} → ${newHeight}`, 'success');
        lastHeight = newHeight;
        noChangeCount = 0;
        
        // Count current restaurants and send progress
        const currentRestaurants = this.countRestaurants(pane);
        this.sendProgress('Loading restaurants', currentRestaurants);
        
        // Wait for new content to render
        await wait(1000);
      } else {
        noChangeCount++;
        log(`No height change (${noChangeCount}/${maxNoChange})`, 'warn');
      }

      // Check for end banner
      if (pane.querySelector('.HlvSq')) {
        log("End banner detected", 'success');
        break;
      }
    }

    return !this.shouldStop;
  }

  // Count restaurants in the pane
  countRestaurants(pane) {
    const anchors = pane.querySelectorAll('a.hfpxzc[href*="/maps/place/"]');
    return anchors.length;
  }

  // Extract restaurant data from the pane
  extractRestaurants(pane) {
    const anchors = pane.querySelectorAll('a.hfpxzc[href*="/maps/place/"]');
    const restaurants = new Map();
    
    for (const anchor of anchors) {
      const url = anchor.href.split("&")[0];
      const name = anchor.getAttribute("aria-label")?.trim();
      if (name && url && !restaurants.has(url)) {
        restaurants.set(url, name.replace(/,/g, " "));
      }
    }

    log(`Found ${restaurants.size} unique restaurants`, 'success');
    return restaurants;
  }

  // Generate and download CSV
  downloadRestaurantsCSV(restaurants) {
    const rows = Array.from(restaurants.entries()).map(([url, name]) => [name, url]);
    const csv = generateCSV(['Name', 'Link'], rows);
    downloadCSV(csv, "restaurants.csv");
    log(`Downloaded CSV with ${restaurants.size} restaurants`, 'success');
  }

  // Main scraping function
  async scrape() {
    log("Optimized restaurant scraping started", 'info');
    
    this.initializeStopListener();

    try {
      const pane = this.findResultsPane();
      if (!pane) {
        this.sendError('Results pane not found - make sure you\'re on a Google Maps search page');
        return 0;
      }

      // Scroll to load all restaurants
      const completed = await this.scrollToLoadAll(pane);

      // Extract restaurants
      const restaurants = this.extractRestaurants(pane);
      
      // Handle stopped case
      if (this.shouldStop) {
        log("Restaurant extraction stopped by user");
        this.sendStopped(restaurants.size);
        return restaurants.size;
      }
      
      if (restaurants.size === 0) {
        log("No restaurants found - check selectors", 'warn');
        this.sendError('No restaurants found - make sure you\'re on a Google Maps search results page');
        return 0;
      }

      // Download CSV
      this.downloadRestaurantsCSV(restaurants);

      // Send completion message
      this.sendComplete(restaurants.size);

      return restaurants.size;

    } catch (error) {
      log(`Restaurant scraping error: ${error.message}`, 'error');
      this.sendError(`Scraping failed: ${error.message}`);
      return 0;
    } finally {
      this.cleanup();
    }
  }
}

// Export the main scraping function for backward compatibility
export async function scrapeAndDownloadOptimized(userConfig = {}) {
  const scraper = new RestaurantScraper(userConfig);
  return await scraper.scrape();
} 