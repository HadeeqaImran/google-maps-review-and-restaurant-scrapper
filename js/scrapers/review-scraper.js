// Review scraper module for extracting review data from Google Maps
import { 
  wait, 
  downloadCSV, 
  generateCSV, 
  sanitizeFilename, 
  sendChromeMessage, 
  log, 
  findElement,
  getTextContent, 
  getAttribute,
  containsKeyword,
  cleanText,
  findScrollableParent,
  performScroll,
  isScrollable
} from '../utils.js';

export class ReviewScraper {
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

  // Get restaurant name from page
  getRestaurantName() {
    const selectors = [
      'h1.DUwDvf.lfPIob',
      'h1',
      '[data-value="title"]',
      '.section-hero-header-title',
      '.qrShPb'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        let name = element.textContent.trim();
        name = name.split('·')[0].trim();
        name = name.split('(')[0].trim();
        if (name && name !== 'Unknown') return name;
      }
    }
    return 'Unknown Restaurant';
  }

  // Click on Reviews tab
  async clickReviewsTab() {
    const labelKeywords = ['Review', 'Reviews', 'クチコミ', 'Reseñas', 'Avis', 'Rezension'];
    
    log('Looking for Reviews tab...');
    
    // Method 1: Try multiple specific selectors for different layouts
    const specificSelectors = [
      "#QA0Szd > div > div > div.w6VYqd > div.bJzME.tTVLSc > div > div.e07Vkf.kA9KIf > div > div > div:nth-child(3) > div > div > button:nth-child(2)",
      "#QA0Szd > div > div > div.w6VYqd > div.bJzME.tTVLSc > div > div.e07Vkf.kA9KIf > div > div > div:nth-child(3) > div > div > button:nth-child(3)",
      "button[role='tab'][aria-selected='false']"
    ];
    
    for (const selector of specificSelectors) {
      const button = document.querySelector(selector);
      if (button) {
        const text = getTextContent(button) + ' ' + getAttribute(button, 'aria-label');
        if (containsKeyword(text, labelKeywords)) {
          log(`Found Reviews tab with selector: ${selector}`, 'success');
          button.click();
          await wait(2000);
          return true;
        }
      }
    }
    
    // Method 2: Search all tab buttons more carefully
    const allButtons = document.querySelectorAll('button[role="tab"], button[data-tab-index], .tab button, [role="tablist"] button');
    log(`Found ${allButtons.length} potential tab buttons`);
    
    for (const button of allButtons) {
      const text = getTextContent(button);
      const label = getAttribute(button, 'aria-label');
      const fullText = `${text} ${label}`;
      
      log(`Checking button: "${text.trim()}" / "${label}"`);
      
      if (containsKeyword(fullText, labelKeywords)) {
        log(`Found Reviews tab: "${text.trim()}"`, 'success');
        button.click();
        await wait(2000);
        return true;
      }
    }
    
    // Method 3: Look for the Reviews tab by checking for non-active tabs
    const tabs = document.querySelectorAll('button[role="tab"]');
    for (const tab of tabs) {
      const isSelected = getAttribute(tab, 'aria-selected') === 'true' || tab.classList.contains('selected');
      if (!isSelected) {
        const text = getTextContent(tab);
        if (containsKeyword(text, labelKeywords)) {
          log(`Found non-active Reviews tab: "${text}"`, 'success');
          tab.click();
          await wait(2000);
          return true;
        }
      }
    }
    
    log('Reviews tab not found after exhaustive search, proceeding anyway', 'warn');
    return false;
  }

  // Find reviews pane
  findReviewsPane() {
    log('Looking for reviews pane...');
    
    // First check if we have any reviews at all
    const reviewElements = document.querySelectorAll('[data-review-id], .jftiEf, .MyEned, .wiI7pd');
    log(`Found ${reviewElements.length} potential review elements`);
    
    if (reviewElements.length === 0) {
      log('No review elements found - this place might not have reviews', 'error');
      return null;
    }
    
    const selectors = [
      '#QA0Szd > div > div > div.w6VYqd > div.bJzME.tTVLSc > div > div.e07Vkf.kA9KIf > div > div > div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde > div:nth-child(9)',
      '[role="feed"]',
      '.m6QErb.DxyBCb',
      '.review-dialog-list',
      '.section-scrollbox'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const hasReviews = element.querySelector('[data-review-id], .jftiEf, .MyEned');
        log(`Checking selector "${selector}": ${hasReviews ? 'Found reviews' : 'No reviews'}`);
        if (hasReviews) {
          log(`Found reviews pane with selector: ${selector}`, 'success');
          return element;
        }
      }
    }
    
    // Enhanced last resort: find by review elements and traverse up
    const firstReview = document.querySelector('[data-review-id], .jftiEf');
    if (firstReview) {
      log('Found review element, traversing up to find scrollable container...');
      
      // Try to find scrollable parent
      let parent = firstReview;
      while (parent && parent !== document.body) {
        parent = parent.parentElement;
        if (parent && isScrollable(parent)) {
          log('Found scrollable reviews container', 'success');
          return parent;
        }
      }
      
      // Fallback to common parent containers
      const containers = [
        firstReview.closest('[role="feed"]'),
        firstReview.closest('div[jsrenderer]'),
        firstReview.closest('.m6QErb'),
        firstReview.parentElement?.parentElement,
        firstReview.parentElement
      ].filter(Boolean);
      
      for (const container of containers) {
        if (container && container.querySelectorAll('[data-review-id], .jftiEf').length > 0) {
          log('Found reviews container via traversal', 'success');
          return container;
        }
      }
    }
    
    log('Could not find reviews pane', 'error');
    return null;
  }

  // Count unique reviews
  countUniqueReviews(pane) {
    const reviewElements = pane.querySelectorAll('[data-review-id]');
    const uniqueIds = new Set();
    
    for (const element of reviewElements) {
      const id = getAttribute(element, 'data-review-id');
      if (id) uniqueIds.add(id);
    }
    
    return uniqueIds.size;
  }

  // Extract reviews from pane
  extractReviews(pane, restaurantName) {
    const reviewElements = Array.from(pane.querySelectorAll('[data-review-id]'));
    const reviews = [];
    const seen = new Set();
    
    log(`Processing ${reviewElements.length} review elements`);
    
    for (const element of reviewElements) {
      try {
        // Enhanced author extraction
        const authorSelectors = ['.d4r55', '.WNxzHc', '[data-href*="/maps/contrib/"]'];
        let author = 'Anonymous';
        
        for (const selector of authorSelectors) {
          const authorEl = element.querySelector(selector);
          if (authorEl && getTextContent(authorEl)) {
            author = getTextContent(authorEl);
            break;
          }
        }
        
        // Enhanced star rating extraction
        const starElement = element.querySelector('span[role="img"]');
        const starLabel = getAttribute(starElement, 'aria-label');
        const stars = (starLabel.match(/(\d+(\.\d+)?)/) || [''])[0];
        
        // Enhanced review text extraction
        const textSelectors = ['.wiI7pd', '.MyEned', '[data-expandable-section]'];
        let text = '';
        
        for (const selector of textSelectors) {
          const textEl = element.querySelector(selector);
          if (textEl && getTextContent(textEl)) {
            text = cleanText(getTextContent(textEl));
            break;
          }
        }
        
        // Skip if no meaningful content
        if (!stars && !text) continue;
        
        const uniqueKey = `${author}|${stars}|${text.slice(0, 100)}`;
        
        if (author && author !== 'Anonymous' && !seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          reviews.push([restaurantName, author, stars, text]);
        }
      } catch (error) {
        log(`Error processing review: ${error.message}`, 'warn');
      }
    }
    
    return reviews;
  }

  // Send progress update
  sendProgress(reviewCount, maxReviews, phase) {
    sendChromeMessage('SCRAPING_PROGRESS', { reviewCount, maxReviews, phase });
  }

  // Send completion message
  sendComplete(reviewCount) {
    sendChromeMessage('SCRAPING_COMPLETE', { reviewCount });
  }

  // Send error message
  sendError(error) {
    sendChromeMessage('REVIEW_ERROR', { error });
  }

  // Send stopped message
  sendStopped(reviewCount) {
    sendChromeMessage('SCRAPING_STOPPED', { reviewCount });
  }

  // Generate and download review CSV
  downloadReviewsCSV(reviews, restaurantName) {
    const csv = generateCSV(['Restaurant', 'Reviewer', 'Stars', 'Review'], reviews);
    const filename = `${sanitizeFilename(restaurantName)}_reviews.csv`;
    downloadCSV(csv, filename);
    
    log(`Downloaded ${reviews.length} reviews`, 'success');
    window.lastCsv = { csv, length: reviews.length };
  }

  // Main scraping function
  async scrape() {
    log("Optimized review scraping started", 'info');
    
    this.initializeStopListener();

    try {
      // Main execution
      const restaurantName = this.getRestaurantName();
      log(`Restaurant: ${restaurantName}`);

      const tabClicked = await this.clickReviewsTab();

      // If we clicked the tab, wait a bit more for content to load
      if (tabClicked) {
        log('Waiting for reviews to load after tab click...');
        await wait(1000);
      }

      const pane = this.findReviewsPane();
      if (!pane) {
        log("Reviews pane not found", 'error');
        
        // Provide more specific error messages
        let errorMessage = 'Reviews pane not found - ';
        const reviewElements = document.querySelectorAll('[data-review-id], .jftiEf, .MyEned, .wiI7pd');
        
        if (reviewElements.length === 0) {
          errorMessage += 'this place might not have any reviews yet.';
        } else if (!tabClicked) {
          errorMessage += 'could not find or click the Reviews tab.';
        } else {
          errorMessage += 'make sure you\'re on a restaurant page with reviews.';
        }
        
        this.sendError(errorMessage);
        return 0;
      }

      log("Reviews pane located", 'success');

      const scrollableElement = findScrollableParent(pane);
      log(`Scrollable element: ${scrollableElement === window ? 'window' : 'custom element'}`);

      // Optimized scroll loop
      let lastReviewCount = 0;
      let noChangeCount = 0;
      let totalScrolls = 0;

      // Send initial progress
      this.sendProgress(0, this.config.MAX_REVIEWS, 'Scrolling to load reviews');

      while (true && !this.shouldStop) {
        totalScrolls++;
        
        performScroll(scrollableElement);
        await wait(this.config.SCROLL_TIMEOUT);

        // Check for stop signal
        if (this.shouldStop) {
          log("Review scraping stopped by user");
          break;
        }

        const currentReviewCount = this.countUniqueReviews(pane);
        
        if (currentReviewCount > lastReviewCount) {
          const newReviews = currentReviewCount - lastReviewCount;
          log(`${newReviews} new reviews (total: ${currentReviewCount})`, 'success');
          lastReviewCount = currentReviewCount;
          noChangeCount = 0;

          // Send progress update
          this.sendProgress(currentReviewCount, this.config.MAX_REVIEWS, 'Loading reviews');

          // Wait for DOM stabilization
          await wait(1000);
        } else {
          noChangeCount++;
          log(`No new reviews (${noChangeCount}/${this.config.NO_CHANGE_LIMIT})`, 'warn');
        }

        // Exit conditions
        if (currentReviewCount >= this.config.MAX_REVIEWS) {
          log(`Max reviews reached: ${this.config.MAX_REVIEWS}`, 'success');
          break;
        }

        if (noChangeCount >= this.config.NO_CHANGE_LIMIT) {
          log("No new content detected, stopping", 'success');
          break;
        }
      }

      // Send processing phase update
      this.sendProgress(lastReviewCount, this.config.MAX_REVIEWS, 'Processing reviews');

      // Handle stopped case
      if (this.shouldStop) {
        log("Review scraping stopped by user");
        this.sendStopped(lastReviewCount);
        return lastReviewCount;
      }

      // Extract reviews
      const reviews = this.extractReviews(pane, restaurantName);
      
      if (reviews.length === 0) {
        log("No reviews extracted", 'warn');
        // Send completion message even if no reviews
        this.sendComplete(0);
        return 0;
      }

      // Generate and download CSV
      this.downloadReviewsCSV(reviews, restaurantName);

      // Send completion message
      this.sendComplete(reviews.length);

      return reviews.length;

    } catch (error) {
      log(`Review scraping error: ${error.message}`, 'error');
      this.sendError(`Scraping failed: ${error.message}`);
      return 0;
    } finally {
      this.cleanup();
    }
  }
}

// Export the main scraping function for backward compatibility
export async function scrapeReviewsOptimized(userConfig = {}) {
  const scraper = new ReviewScraper(userConfig);
  return await scraper.scrape();
} 