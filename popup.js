const button = document.getElementById('go');
const status = document.getElementById('status');
const pause = document.getElementById('pause');
const reviewsBtn = document.getElementById('scrape-reviews');
const stopBtn = document.getElementById('stop-scraping');
const stopRestaurantBtn = document.getElementById('stop-restaurant-scraping');
const progressContainer = document.createElement('div');
progressContainer.id = 'progress-container';
progressContainer.style.display = 'none';
document.body.appendChild(progressContainer);

// Configuration object for easy tuning - gets updated by UI
let CONFIG = {
  MAX_REVIEWS: 2000,
  SCROLL_TIMEOUT: 800, // Reduced from 1500ms
  NO_CHANGE_LIMIT: 15, // Reduced from 20
  BATCH_SIZE: 50, // Process reviews in batches
  INTERSECTION_THRESHOLD: 0.1
};

// Sync config with UI settings
const syncConfig = () => {
  const maxReviews = document.getElementById('max-reviews')?.value;
  const scrollSpeed = document.getElementById('scroll-speed')?.value;
  
  if (maxReviews) CONFIG.MAX_REVIEWS = parseInt(maxReviews);
  if (scrollSpeed) {
    const speeds = { fast: 600, normal: 800, slow: 1200 };
    CONFIG.SCROLL_TIMEOUT = speeds[scrollSpeed] || 800;
  }
};

// Initially hide the pause and stop buttons
pause.style.display = 'none';
stopBtn.style.display = 'none';
stopRestaurantBtn.style.display = 'none';

// Global scraping state
let isScrapingActive = false;
let currentTabId = null;

// Status message enhancement
const setStatus = (message, type = 'info') => {
  status.textContent = message;
  status.className = type; // success, warning, error, info
};

// Show/hide stop buttons
const showStopButton = (show = true, type = 'review') => {
  if (type === 'review') {
    stopBtn.style.display = show ? 'block' : 'none';
  } else {
    stopRestaurantBtn.style.display = show ? 'block' : 'none';
  }
};

// Stop scraping functionality
const stopScraping = () => {
  if (isScrapingActive && currentTabId) {
    // Send stop signal to the injected script
    chrome.tabs.sendMessage(currentTabId, { type: 'STOP_SCRAPING' });
    isScrapingActive = false;
    showStopButton(false, 'review');
    showStopButton(false, 'restaurant');
    hideProgress();
    setStatus('🛑 Scraping stopped by user', 'warning');
  }
};

// Utility functions
const wait = ms => new Promise(r => setTimeout(r, ms));
const createProgressBar = () => {
  progressContainer.innerHTML = `
    <div style="margin: 10px 0; padding: 8px; background: #f0f0f0; border-radius: 4px;">
      <div id="progress-text" style="font-size: 12px; margin-bottom: 4px;">Starting...</div>
      <div style="background: #ddd; border-radius: 2px; height: 6px;">
        <div id="progress-bar" style="background: #4CAF50; height: 6px; width: 0%; border-radius: 2px; transition: width 0.3s;"></div>
      </div>
    </div>
  `;
  progressContainer.style.display = 'block';
};

const updateProgress = (text, percentage = 0) => {
  const progressText = document.getElementById('progress-text');
  const progressBar = document.getElementById('progress-bar');
  if (progressText) progressText.textContent = text;
  if (progressBar) progressBar.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
};

const hideProgress = () => {
  progressContainer.style.display = 'none';
};

button.addEventListener('click', async () => {
  setStatus('🔄 Extracting restaurants...', 'info');
  createProgressBar();
  syncConfig(); // Update config from UI
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
    setStatus('⚠️ Switch to the Google Maps tab first.', 'warning');
    hideProgress();
    return;
  }
  if (!tab.url.includes('google.com/maps') && !tab.url.includes('google.co.jp/maps')) {
    setStatus('⚠️ Not a Google Maps search page.', 'warning');
    hideProgress();
    return;
  }

  // Set scraping state
  isScrapingActive = true;
  currentTabId = tab.id;
  showStopButton(true, 'restaurant');

  // Listen for progress updates from restaurant extraction
  const progressListener = (message, sender, sendResponse) => {
    if (message.type === 'RESTAURANT_PROGRESS' && sender.tab.id === tab.id) {
      const { phase, count } = message.data;
      updateProgress(`${phase}: ${count} restaurants`, count > 0 ? 50 : 10);
    } else if (message.type === 'RESTAURANT_COMPLETE' && sender.tab.id === tab.id) {
      const { count } = message.data;
      setStatus(`✅ Extracted ${count} restaurants!`, 'success');
      hideProgress();
      showStopButton(false, 'restaurant');
      isScrapingActive = false;
      chrome.runtime.onMessage.removeListener(progressListener);
    } else if (message.type === 'SCRAPING_STOPPED' && sender.tab.id === tab.id) {
      setStatus('🛑 Restaurant extraction stopped', 'warning');
      hideProgress();
      showStopButton(false, 'restaurant');
      isScrapingActive = false;
      chrome.runtime.onMessage.removeListener(progressListener);
    }
  };

  chrome.runtime.onMessage.addListener(progressListener);
  
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scrapeAndDownloadOptimized,
    args: [CONFIG] // Pass config to injected function
  }, (injectionResults) => {
    if (chrome.runtime.lastError) {
      console.error('Injection failed:', chrome.runtime.lastError);
      setStatus('❌ Injection error; see console.', 'error');
      hideProgress();
      showStopButton(false, 'restaurant');
      isScrapingActive = false;
      chrome.runtime.onMessage.removeListener(progressListener);
    }
  });
});

reviewsBtn.addEventListener('click', async () => {
  setStatus('🔄 Scraping reviews...', 'info');
  pause.style.display = 'none';
  createProgressBar();
  syncConfig(); // Update config from UI

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url.includes('/maps/place/')) {
    setStatus('⚠️ Open a restaurant page first.', 'warning');
    hideProgress();
    return;
  }

  // Set scraping state
  isScrapingActive = true;
  currentTabId = tab.id;
  showStopButton(true, 'review');

  // Listen for progress updates from the injected script
  const progressListener = (message, sender, sendResponse) => {
    if (message.type === 'SCRAPING_PROGRESS' && sender.tab.id === tab.id) {
      const { reviewCount, maxReviews, phase } = message.data;
      const percentage = maxReviews > 0 ? (reviewCount / maxReviews) * 100 : 0;
      updateProgress(`${phase}: ${reviewCount} reviews found`, percentage);
    } else if (message.type === 'SCRAPING_COMPLETE' && sender.tab.id === tab.id) {
      const { reviewCount } = message.data;
      setStatus(`✅ Scraped ${reviewCount} reviews successfully!`, 'success');
      hideProgress();
      showStopButton(false, 'review');
      isScrapingActive = false;
      if (window.lastCsv) pause.style.display = 'block';
      chrome.runtime.onMessage.removeListener(progressListener);
    } else if (message.type === 'SCRAPING_STOPPED' && sender.tab.id === tab.id) {
      setStatus('🛑 Review scraping stopped', 'warning');
      hideProgress();
      showStopButton(false, 'review');
      isScrapingActive = false;
      if (window.lastCsv) pause.style.display = 'block';
      chrome.runtime.onMessage.removeListener(progressListener);
    }
  };

  chrome.runtime.onMessage.addListener(progressListener);

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scrapeReviewsOptimized,
    args: [CONFIG] // Pass config to injected function
  }, () => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      setStatus('❌ Review scraping failed', 'error');
      hideProgress();
      showStopButton(false, 'review');
      isScrapingActive = false;
      chrome.runtime.onMessage.removeListener(progressListener);
    }
  });
});

pause.addEventListener('click', () => {
  if (window.lastCsv) {
    const blob = new Blob([window.lastCsv.csv], { type: "text/csv" });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = "restaurant_reviews.csv";
    a.click();
    URL.revokeObjectURL(dlUrl);
    setStatus(`📁 Downloaded ${window.lastCsv.length} reviews`, 'success');
  } else {
    setStatus('⚠️ No data to download. Run scraper first.', 'warning');
  }
});

stopBtn.addEventListener('click', stopScraping);
stopRestaurantBtn.addEventListener('click', stopScraping);

// Optimized restaurant scraping function - SELF-CONTAINED
async function scrapeAndDownloadOptimized(userConfig = {}) {
  console.log("🔍 Optimized restaurant scraping started");
  
  const CONFIG = {
    MAX_NO_CHANGE: 3,
    SCROLL_DELAY: userConfig?.SCROLL_TIMEOUT || 600,
    INTERSECTION_THRESHOLD: 0.1
  };

  // Stop flag for pause functionality
  let shouldStop = false;

  // Listen for stop messages
  const messageListener = (message, sender, sendResponse) => {
    if (message.type === 'STOP_SCRAPING') {
      shouldStop = true;
      console.log('🛑 Stop signal received');
    }
  };
  
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener(messageListener);
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  
  // Helper function for downloading CSV (embedded)
  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pane = document.querySelector('[role="feed"]');
  if (!pane) {
    console.error("❌ Results pane not found - make sure you're on a Google Maps search page");
    return;
  }

  let lastHeight = pane.scrollHeight;
  let noChangeCount = 0;
  let scrollAttempts = 0;

  // Send initial progress
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'RESTAURANT_PROGRESS',
      data: { phase: 'Scrolling to load restaurants', count: 0 }
    });
  }

  // Simplified but effective scrolling loop
  while (noChangeCount < CONFIG.MAX_NO_CHANGE && !shouldStop) {
    scrollAttempts++;
    
    // Scroll to bottom
    pane.scrollTo(0, pane.scrollHeight);
    console.log(`Scroll attempt ${scrollAttempts} (height: ${lastHeight})`);
    
    // Wait for content to load
    await wait(CONFIG.SCROLL_DELAY);
    
    // Check for stop signal
    if (shouldStop) {
      console.log("🛑 Scraping stopped by user");
      break;
    }
    
    const newHeight = pane.scrollHeight;
    if (newHeight > lastHeight) {
      console.log(`✅ Height increased: ${lastHeight} → ${newHeight}`);
      lastHeight = newHeight;
      noChangeCount = 0;
      
      // Count current restaurants and send progress
      const currentRestaurants = pane.querySelectorAll('a.hfpxzc[href*="/maps/place/"]').length;
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'RESTAURANT_PROGRESS',
          data: { phase: 'Loading restaurants', count: currentRestaurants }
        });
      }
      
      // Wait for new content to render
      await wait(1000);
    } else {
      noChangeCount++;
      console.log(`⏸️ No height change (${noChangeCount}/${CONFIG.MAX_NO_CHANGE})`);
    }

    // Check for end banner
    if (pane.querySelector('.HlvSq')) {
      console.log("🏁 End banner detected");
      break;
    }
  }

  // Collect restaurant links
  const anchors = pane.querySelectorAll('a.hfpxzc[href*="/maps/place/"]');
  const restaurants = new Map();
  
  for (const anchor of anchors) {
    const url = anchor.href.split("&")[0];
    const name = anchor.getAttribute("aria-label")?.trim();
    if (name && url && !restaurants.has(url)) {
      restaurants.set(url, name.replace(/,/g, " "));
    }
  }

  console.log(`🎯 Found ${restaurants.size} unique restaurants`);
  
  // Clean up message listener
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.removeListener(messageListener);
  }
  
  // Handle stopped case
  if (shouldStop) {
    console.log("🛑 Restaurant extraction stopped by user");
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'SCRAPING_STOPPED',
        data: { count: restaurants.size }
      });
    }
    return restaurants.size;
  }
  
  if (restaurants.size === 0) {
    console.warn("❌ No restaurants found - check selectors");
    return;
  }

  // Generate and download CSV
  const rows = Array.from(restaurants.entries()).map(([url, name]) => [name, url]);
  const header = '"Name","Link"';
  const csv = [header, ...rows.map(([n,u]) => `"${n}","${u}"`)].join("\n");
  
  downloadCSV(csv, "restaurants.csv");
  console.log(`✅ Downloaded CSV with ${restaurants.size} restaurants`);

  // Send completion message
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'RESTAURANT_COMPLETE',
      data: { count: restaurants.size }
    });
  }

  return restaurants.size;
}

// Review scraping function - SELF-CONTAINED
async function scrapeReviewsOptimized(userConfig = {}) {
  console.log("🔍 Optimized review scraping started");
  
  const CONFIG = {
    MAX_REVIEWS: userConfig?.MAX_REVIEWS || 2000,
    SCROLL_TIMEOUT: userConfig?.SCROLL_TIMEOUT || 800,
    NO_CHANGE_LIMIT: userConfig?.NO_CHANGE_LIMIT || 15,
    BATCH_SIZE: userConfig?.BATCH_SIZE || 50
  };

  // Stop flag for pause functionality
  let shouldStop = false;

  // Listen for stop messages
  const messageListener = (message, sender, sendResponse) => {
    if (message.type === 'STOP_SCRAPING') {
      shouldStop = true;
      console.log('🛑 Stop signal received');
    }
  };
  
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener(messageListener);
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Helper functions embedded within main function
  const getRestaurantName = () => {
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
  };

  const clickReviewsTab = async () => {
    const labelKeywords = ['Review', 'Reviews', 'クチコミ', 'Reseñas', 'Avis', 'Rezension'];
    
    // Try specific selector first
    let reviewsTab = document.querySelector("#QA0Szd > div > div > div.w6VYqd > div.bJzME.tTVLSc > div > div.e07Vkf.kA9KIf > div > div > div:nth-child(3) > div > div > button:nth-child(3)");
    
    // Fallback to keyword search
    if (!reviewsTab) {
      const buttons = document.querySelectorAll('button[role="tab"]');
      for (const button of buttons) {
        const label = button.getAttribute('aria-label') || button.textContent || '';
        if (labelKeywords.some(keyword => label.includes(keyword))) {
          reviewsTab = button;
          break;
        }
      }
    }
    
    if (reviewsTab) {
      console.log('🎯 Reviews tab found, clicking...');
      reviewsTab.click();
      await wait(1500);
      return true;
    }
    
    console.log('⚠️ Reviews tab not found, proceeding anyway');
    return false;
  };

  const findReviewsPane = () => {
    const selectors = [
      '#QA0Szd > div > div > div.w6VYqd > div.bJzME.tTVLSc > div > div.e07Vkf.kA9KIf > div > div > div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde > div:nth-child(9)',
      '[role="feed"]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.querySelector('[data-review-id]')) {
        return element;
      }
    }
    
    // Last resort: find by review elements
    const firstReview = document.querySelector('[data-review-id]');
    if (firstReview) {
      return firstReview.closest('[role="feed"]') || 
             firstReview.closest('div[jsrenderer]') ||
             firstReview.parentElement.parentElement;
    }
    
    return null;
  };

  const findScrollableElement = (pane) => {
    if (!pane) return window;
    
    // Check if pane itself is scrollable
    if (pane.scrollHeight > pane.clientHeight) {
      return pane;
    }
    
    // Find scrollable parent
    let parent = pane.parentElement;
    while (parent && parent !== document.body) {
      if (parent.scrollHeight > parent.clientHeight) {
        return parent;
      }
      parent = parent.parentElement;
    }
    
    return window;
  };

  const performScroll = async (element) => {
    if (element === window) {
      window.scrollBy(0, 1000);
    } else {
      element.scrollBy(0, element.scrollHeight);
    }
  };

  const countUniqueReviews = (pane) => {
    const reviewElements = pane.querySelectorAll('[data-review-id]');
    const uniqueIds = new Set();
    
    for (const element of reviewElements) {
      const id = element.getAttribute('data-review-id');
      if (id) uniqueIds.add(id);
    }
    
    return uniqueIds.size;
  };

  const extractReviews = (pane, restaurantName) => {
    const reviewElements = Array.from(pane.querySelectorAll('[data-review-id]'));
    const reviews = [];
    const seen = new Set();
    
    console.log(`📦 Processing ${reviewElements.length} review elements`);
    
    for (const element of reviewElements) {
      try {
        // Enhanced author extraction
        const authorSelectors = ['.d4r55', '.WNxzHc', '[data-href*="/maps/contrib/"]'];
        let author = 'Anonymous';
        
        for (const selector of authorSelectors) {
          const authorEl = element.querySelector(selector);
          if (authorEl && authorEl.textContent.trim()) {
            author = authorEl.textContent.trim();
            break;
          }
        }
        
        // Enhanced star rating extraction
        const starElement = element.querySelector('span[role="img"]');
        const starLabel = starElement?.getAttribute('aria-label') || '';
        const stars = (starLabel.match(/(\d+(\.\d+)?)/) || [''])[0];
        
        // Enhanced review text extraction
        const textSelectors = ['.wiI7pd', '.MyEned', '[data-expandable-section]'];
        let text = '';
        
        for (const selector of textSelectors) {
          const textEl = element.querySelector(selector);
          if (textEl && textEl.textContent.trim()) {
            text = textEl.textContent.replace(/\n+/g, ' ').trim();
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
        console.warn('Error processing review:', error);
      }
    }
    
    return reviews;
  };

  const generateReviewCSV = (reviews) => {
    const header = '"Restaurant","Reviewer","Stars","Review"';
    const csvLines = reviews.map(([restaurant, author, stars, text]) =>
      `"${(restaurant || '').replace(/"/g,'""')}","${(author || '').replace(/"/g,'""')}","${stars}","${(text || '').replace(/"/g,'""')}"`
    );
    return [header, ...csvLines].join('\n');
  };

  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sanitizeFilename = (filename) => {
    return filename.replace(/[^\w\s-]/g, '').trim();
  };

  // Main execution
  const restaurantName = getRestaurantName();
  console.log(`🏪 Restaurant: ${restaurantName}`);

  await clickReviewsTab();

  const pane = findReviewsPane();
  if (!pane) {
    console.error("❌ Reviews pane not found");
    return;
  }

  console.log("✅ Reviews pane located");

  const scrollableElement = findScrollableElement(pane);
  console.log(`📜 Scrollable element: ${scrollableElement === window ? 'window' : 'custom element'}`);

  // Optimized scroll loop
  let lastReviewCount = 0;
  let noChangeCount = 0;
  let totalScrolls = 0;

  // Send initial progress
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'SCRAPING_PROGRESS',
      data: { reviewCount: 0, maxReviews: CONFIG.MAX_REVIEWS, phase: 'Scrolling to load reviews' }
    });
  }

  while (true && !shouldStop) {
    totalScrolls++;
    
    await performScroll(scrollableElement);
    await wait(CONFIG.SCROLL_TIMEOUT);

    // Check for stop signal
    if (shouldStop) {
      console.log("🛑 Review scraping stopped by user");
      break;
    }

    const currentReviewCount = countUniqueReviews(pane);
    
    if (currentReviewCount > lastReviewCount) {
      const newReviews = currentReviewCount - lastReviewCount;
      console.log(`📈 ${newReviews} new reviews (total: ${currentReviewCount})`);
      lastReviewCount = currentReviewCount;
      noChangeCount = 0;

      // Send progress update
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'SCRAPING_PROGRESS',
          data: { reviewCount: currentReviewCount, maxReviews: CONFIG.MAX_REVIEWS, phase: 'Loading reviews' }
        });
      }

      // Wait for DOM stabilization
      await wait(1000);
    } else {
      noChangeCount++;
      console.log(`⏸️ No new reviews (${noChangeCount}/${CONFIG.NO_CHANGE_LIMIT})`);
    }

    // Exit conditions
    if (currentReviewCount >= CONFIG.MAX_REVIEWS) {
      console.log(`🎯 Max reviews reached: ${CONFIG.MAX_REVIEWS}`);
      break;
    }

    if (noChangeCount >= CONFIG.NO_CHANGE_LIMIT) {
      console.log("🏁 No new content detected, stopping");
      break;
    }
  }

  // Send processing phase update
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'SCRAPING_PROGRESS',
      data: { reviewCount: lastReviewCount, maxReviews: CONFIG.MAX_REVIEWS, phase: 'Processing reviews' }
    });
  }

  // Clean up message listener
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.removeListener(messageListener);
  }

  // Handle stopped case
  if (shouldStop) {
    console.log("🛑 Review scraping stopped by user");
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'SCRAPING_STOPPED',
        data: { reviewCount: lastReviewCount }
      });
    }
    return lastReviewCount;
  }

  // Extract reviews
  const reviews = extractReviews(pane, restaurantName);
  
  if (reviews.length === 0) {
    console.warn("❌ No reviews extracted");
    // Send completion message even if no reviews
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'SCRAPING_COMPLETE',
        data: { reviewCount: 0 }
      });
    }
    return;
  }

  // Generate and download CSV
  const csv = generateReviewCSV(reviews);
  const filename = `${sanitizeFilename(restaurantName)}_reviews.csv`;
  downloadCSV(csv, filename);

  console.log(`✅ Downloaded ${reviews.length} reviews`);
  window.lastCsv = { csv, length: reviews.length };

  // Send completion message
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'SCRAPING_COMPLETE',
      data: { reviewCount: reviews.length }
    });
  }

  return reviews.length;
}

// All helper functions are now embedded within the main scraping functions for self-containment

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Make collapsible sections work
  const coll = document.querySelector(".collapsible");
  const content = document.querySelector(".content");
  
  if (coll && content) {
    coll.addEventListener("click", function() {
      this.classList.toggle("active");
      content.classList.toggle("active");
    });
  }
  
  // Update CONFIG when settings change
  const maxReviewsInput = document.getElementById('max-reviews');
  if (maxReviewsInput) {
    maxReviewsInput.addEventListener('change', function() {
      window.CONFIG = window.CONFIG || {};
      window.CONFIG.MAX_REVIEWS = parseInt(this.value);
    });
  }
  
  const scrollSpeedSelect = document.getElementById('scroll-speed');
  if (scrollSpeedSelect) {
    scrollSpeedSelect.addEventListener('change', function() {
      window.CONFIG = window.CONFIG || {};
      const speeds = { fast: 600, normal: 800, slow: 1200 };
      window.CONFIG.SCROLL_TIMEOUT = speeds[this.value];
    });
  }

  // Initialize stop buttons
  const stopButton = document.getElementById('stop-scraping');
  if (stopButton) {
    stopButton.style.display = 'none';
  }

  const stopRestaurantButton = document.getElementById('stop-restaurant-scraping');
  if (stopRestaurantButton) {
    stopRestaurantButton.style.display = 'none';
  }
});

