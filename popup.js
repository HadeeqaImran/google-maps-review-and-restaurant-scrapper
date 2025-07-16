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
  // Review settings
  MAX_REVIEWS: 2000,
  SCROLL_TIMEOUT: 800,
  NO_CHANGE_LIMIT: 15,
  BATCH_SIZE: 50,
  INTERSECTION_THRESHOLD: 0.1,
  REVIEW_SORT: 'most-relevant',
  
  // Restaurant settings
  MAX_RESTAURANTS: 2000,
  RESTAURANT_SCROLL_TIMEOUT: 800,
  MAX_SCROLL_ATTEMPTS: 50,
  RESTAURANT_SCROLL_DELAY: 600,
  MAX_NO_CHANGE: 3
};

// Sync config with UI settings
const syncConfig = () => {
  // Review settings
  const maxReviews = document.getElementById('max-reviews')?.value;
  const scrollSpeed = document.getElementById('scroll-speed')?.value;
  const reviewSort = document.getElementById('review-sort')?.value;
  
  if (maxReviews) CONFIG.MAX_REVIEWS = parseInt(maxReviews);
  if (scrollSpeed) {
    const speeds = { fast: 600, normal: 800, slow: 1200 };
    CONFIG.SCROLL_TIMEOUT = speeds[scrollSpeed] || 800;
  }
  if (reviewSort) CONFIG.REVIEW_SORT = reviewSort;

  // Restaurant settings
  const maxRestaurants = document.getElementById('max-restaurants')?.value;
  const restaurantScrollSpeed = document.getElementById('restaurant-scroll-speed')?.value;
  
  if (maxRestaurants) CONFIG.MAX_RESTAURANTS = parseInt(maxRestaurants);
  if (restaurantScrollSpeed) {
    const speeds = { fast: 600, normal: 800, slow: 1200 };
    CONFIG.RESTAURANT_SCROLL_TIMEOUT = speeds[restaurantScrollSpeed] || 800;
    CONFIG.RESTAURANT_SCROLL_DELAY = speeds[restaurantScrollSpeed] || 800;
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
    setStatus('Scraping stopped by user', 'warning');
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
  setStatus('Extracting restaurants...', 'info');
  createProgressBar();
  syncConfig(); // Update config from UI
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
    setStatus('Switch to the Google Maps tab first.', 'warning');
    hideProgress();
    return;
  }
  if (!tab.url.includes('google.com/maps') && !tab.url.includes('google.co.jp/maps')) {
    setStatus('Not a Google Maps search page.', 'warning');
    hideProgress();
    return;
  }
  
  // Check if we're on a search results page (not a specific place page)
  if (tab.url.includes('/maps/place/') || (!tab.url.includes('/search/') && !tab.url.includes('search?') && !tab.url.includes('data='))) {
    setStatus('Open a restaurants search page first - search for restaurants in Google Maps.', 'warning');
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
      setStatus(`Extracted ${count} restaurants!`, 'success');
      hideProgress();
      showStopButton(false, 'restaurant');
      isScrapingActive = false;
      chrome.runtime.onMessage.removeListener(progressListener);
    } else if (message.type === 'RESTAURANT_ERROR' && sender.tab.id === tab.id) {
      const { error } = message.data;
      setStatus(error, 'error');
      hideProgress();
      showStopButton(false, 'restaurant');
      isScrapingActive = false;
      chrome.runtime.onMessage.removeListener(progressListener);
    } else if (message.type === 'SCRAPING_STOPPED' && sender.tab.id === tab.id) {
      setStatus('Restaurant extraction stopped', 'warning');
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
      setStatus('Injection error; see console.', 'error');
      hideProgress();
      showStopButton(false, 'restaurant');
      isScrapingActive = false;
      chrome.runtime.onMessage.removeListener(progressListener);
    }
  });
});

reviewsBtn.addEventListener('click', async () => {
  setStatus('Scraping reviews...', 'info');
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
      setStatus(`Scraped ${reviewCount} reviews successfully!`, 'success');
      hideProgress();
      showStopButton(false, 'review');
      isScrapingActive = false;
      if (window.lastCsv) pause.style.display = 'block';
      chrome.runtime.onMessage.removeListener(progressListener);
    } else if (message.type === 'REVIEW_ERROR' && sender.tab.id === tab.id) {
      const { error } = message.data;
      setStatus(error, 'error');
      hideProgress();
      showStopButton(false, 'review');
      isScrapingActive = false;
      chrome.runtime.onMessage.removeListener(progressListener);
    } else if (message.type === 'SCRAPING_STOPPED' && sender.tab.id === tab.id) {
      setStatus('Review scraping stopped', 'warning');
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
      setStatus('Review scraping failed', 'error');
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
    a.download = window.lastCsv.filename || "reviews.csv";
    a.click();
    URL.revokeObjectURL(dlUrl);
    setStatus(`Downloaded ${window.lastCsv.length} reviews`, 'success');
  } else {
    setStatus('No data to download. Run scraper first.', 'warning');
  }
});

stopBtn.addEventListener('click', stopScraping);
stopRestaurantBtn.addEventListener('click', stopScraping);

// Optimized restaurant scraping function - SELF-CONTAINED
async function scrapeAndDownloadOptimized(userConfig = {}) {
  console.log("🔍 Optimized restaurant scraping started");
  
  const CONFIG = {
    MAX_RESTAURANTS: userConfig?.MAX_RESTAURANTS || 500,
    MAX_SCROLL_ATTEMPTS: userConfig?.MAX_SCROLL_ATTEMPTS || 10,
    SCROLL_DELAY: userConfig?.RESTAURANT_SCROLL_DELAY || 600,
    MAX_NO_CHANGE: userConfig?.MAX_NO_CHANGE || 3,
    INTERSECTION_THRESHOLD: 0.1
  };

  // Stop flag for pause functionality
  let shouldStop = false;

  // Listen for stop messages
  const messageListener = (message, sender, sendResponse) => {
    if (message.type === 'STOP_SCRAPING') {
      shouldStop = true;
      console.log('Stop signal received');
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
    console.error("Results pane not found - make sure you're on a Google Maps search page");
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.runtime.sendMessage({
        type: 'RESTAURANT_ERROR',
        data: { error: 'Results pane not found - make sure you\'re on a Google Maps search page' }
      });
    }
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

    // Enhanced scrolling loop with configurable limits
  while (scrollAttempts < CONFIG.MAX_SCROLL_ATTEMPTS && !shouldStop) {
    scrollAttempts++;
    
    // Count current restaurants
    const currentRestaurants = pane.querySelectorAll('a.hfpxzc[href*="/maps/place/"]').length;
    
    // Check if we've reached the exact target
    if (currentRestaurants >= CONFIG.MAX_RESTAURANTS) {
      console.log(`🎯 Target reached: ${currentRestaurants}/${CONFIG.MAX_RESTAURANTS} restaurants`);
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'RESTAURANT_PROGRESS',
          data: { phase: 'Target reached', count: currentRestaurants }
        });
      }
      break;
    }
    
    // Scroll to bottom
    pane.scrollTo(0, pane.scrollHeight);
    console.log(`Scroll attempt ${scrollAttempts}/${CONFIG.MAX_SCROLL_ATTEMPTS} - Found: ${currentRestaurants}/${CONFIG.MAX_RESTAURANTS}`);
    
    // Wait for content to load
    await wait(CONFIG.SCROLL_DELAY);
    
    // Check for stop signal
    if (shouldStop) {
      console.log("Scraping stopped by user");
      break;
    }

    const newHeight = pane.scrollHeight;
    if (newHeight > lastHeight) {
      console.log(`Height increased: ${lastHeight} → ${newHeight}`);
      lastHeight = newHeight;
      noChangeCount = 0;
      
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
      console.log(`⏸️ No height change (${noChangeCount})`);
      
      // Only stop due to no changes if we've tried many times AND found a reasonable number
      if (noChangeCount >= Math.max(CONFIG.MAX_NO_CHANGE * 3, 15) && currentRestaurants > CONFIG.MAX_RESTAURANTS * 0.8) {
        console.log("🏁 Stopping: too many attempts without changes and found substantial results");
        break;
      }
    }

    // Check for end banner
    if (pane.querySelector('.HlvSq')) {
      console.log("🏁 End banner detected - no more content available");
      break;
    }
  }

  // Log completion reason
  if (scrollAttempts >= CONFIG.MAX_SCROLL_ATTEMPTS) {
    console.log(`Stopped after ${CONFIG.MAX_SCROLL_ATTEMPTS} scroll attempts`);
  }

  // Enhanced restaurant data extraction
  const anchors = pane.querySelectorAll('a.hfpxzc[href*="/maps/place/"]');
  const restaurants = new Map();
  
  for (const anchor of anchors) {
    const url = anchor.href.split("&")[0];
    const name = anchor.getAttribute("aria-label")?.trim();
    
    if (name && url && !restaurants.has(url)) {
      // Extract additional restaurant data
      const restaurantContainer = anchor.closest('[data-result-index]') || anchor.closest('.Nv2PK') || anchor.parentElement;
      
      // Extract star rating
      let starRating = '';
      const starSelectors = [
        'span[role="img"][aria-label*="star"]',
        '.MW4etd',
        '.fontBodyMedium > span[aria-label*="star"]',
        '[data-value="Rating"]'
      ];
      
      for (const selector of starSelectors) {
        const starElement = restaurantContainer?.querySelector(selector);
        if (starElement) {
          const ariaLabel = starElement.getAttribute('aria-label') || '';
          const textContent = starElement.textContent || '';
          
          // Try to extract rating from aria-label (e.g., "4.5 stars")
          const ratingMatch = ariaLabel.match(/(\d+\.?\d*)\s*star/i) || textContent.match(/(\d+\.?\d*)/);
          if (ratingMatch) {
            starRating = ratingMatch[1];
            break;
          }
        }
      }
      
      // Extract review count
      let reviewCount = '';
      const reviewSelectors = [
        'span[aria-label*="review"]',
        '.UY7F9',
        '.fontBodyMedium > span:last-child',
        'span:contains("(")',
        '[data-value="Review count"]'
      ];
      
      for (const selector of reviewSelectors) {
        const reviewElement = restaurantContainer?.querySelector(selector);
        if (reviewElement) {
          const text = reviewElement.textContent || reviewElement.getAttribute('aria-label') || '';
          
          // Extract number from text like "(123)" or "123 reviews"
          const countMatch = text.match(/\((\d+(?:,\d+)*)\)|(\d+(?:,\d+)*)\s*review/i);
          if (countMatch) {
            reviewCount = countMatch[1] || countMatch[2];
            reviewCount = reviewCount.replace(/,/g, ''); // Remove commas
            break;
          }
        }
      }
      
      // If we couldn't find review count in container, try nearby text nodes
      if (!reviewCount && restaurantContainer) {
        const textNodes = [];
        const walker = document.createTreeWalker(
          restaurantContainer,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (text && text.match(/\(\d+\)/)) {
            const match = text.match(/\((\d+(?:,\d+)*)\)/);
            if (match) {
              reviewCount = match[1].replace(/,/g, '');
              break;
            }
          }
        }
      }
      
      restaurants.set(url, {
        name: name.replace(/,/g, " "),
        starRating: starRating || 'N/A',
        reviewCount: reviewCount || 'N/A'
      });
    }
  }

  console.log(`🎯 Found ${restaurants.size} unique restaurants with ratings and reviews`);
  
  // Clean up message listener
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.removeListener(messageListener);
  }
  
  // Handle stopped case
  if (shouldStop) {
    console.log("Restaurant extraction stopped by user");
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'SCRAPING_STOPPED',
        data: { count: restaurants.size }
      });
    }
    return restaurants.size;
  }
  
  if (restaurants.size === 0) {
    console.warn("No restaurants found - check selectors");
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.runtime.sendMessage({
        type: 'RESTAURANT_ERROR',
        data: { error: 'No restaurants found - make sure you\'re on a Google Maps search results page' }
      });
    }
    return;
  }

  // Generate and download enhanced CSV
  const rows = Array.from(restaurants.entries()).map(([url, data]) => [
    data.name, 
    data.starRating, 
    data.reviewCount, 
    url
  ]);
  const header = '"Name","Star Rating","Number of Reviews","Link"';
  const csv = [header, ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join("\n");
  
  downloadCSV(csv, "restaurants.csv");
  console.log(`Downloaded CSV with ${restaurants.size} restaurants including ratings and reviews`);

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
    BATCH_SIZE: userConfig?.BATCH_SIZE || 50,
    REVIEW_SORT: userConfig?.REVIEW_SORT || 'most-relevant'
  };

  // Stop flag for pause functionality
  let shouldStop = false;

  // Listen for stop messages
  const messageListener = (message, sender, sendResponse) => {
    if (message.type === 'STOP_SCRAPING') {
      shouldStop = true;
      console.log('Stop signal received');
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
    
    console.log('🔍 Looking for Reviews tab...');
    
    // Method 1: Try multiple specific selectors for different layouts
    const specificSelectors = [
      "#QA0Szd > div > div > div.w6VYqd > div.bJzME.tTVLSc > div > div.e07Vkf.kA9KIf > div > div > div:nth-child(3) > div > div > button:nth-child(2)",
      "#QA0Szd > div > div > div.w6VYqd > div.bJzME.tTVLSc > div > div.e07Vkf.kA9KIf > div > div > div:nth-child(3) > div > div > button:nth-child(3)",
      "button[role='tab'][aria-selected='false']"
    ];
    
    for (const selector of specificSelectors) {
      const button = document.querySelector(selector);
      if (button) {
        const text = button.textContent || button.getAttribute('aria-label') || '';
        if (labelKeywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()))) {
          console.log(`✅ Found Reviews tab with selector: ${selector}`);
          button.click();
          await wait(2000);
          return true;
        }
      }
    }
    
    // Method 2: Search all tab buttons more carefully
    const allButtons = document.querySelectorAll('button[role="tab"], button[data-tab-index], .tab button, [role="tablist"] button');
    console.log(`🔍 Found ${allButtons.length} potential tab buttons`);
    
    for (const button of allButtons) {
      const text = button.textContent || '';
      const label = button.getAttribute('aria-label') || '';
      const fullText = `${text} ${label}`.toLowerCase();
      
      console.log(`🔍 Checking button: "${text.trim()}" / "${label}"`);
      
      if (labelKeywords.some(keyword => fullText.includes(keyword.toLowerCase()))) {
        console.log(`✅ Found Reviews tab: "${text.trim()}"`);
        button.click();
        await wait(2000);
        return true;
      }
    }
    
    // Method 3: Look for the Reviews tab by checking for non-active tabs
    const tabs = document.querySelectorAll('button[role="tab"]');
    for (const tab of tabs) {
      const isSelected = tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('selected');
      if (!isSelected) {
        const text = (tab.textContent || '').toLowerCase();
        if (labelKeywords.some(keyword => text.includes(keyword.toLowerCase()))) {
          console.log(`✅ Found non-active Reviews tab: "${tab.textContent}"`);
          tab.click();
          await wait(2000);
          return true;
        }
      }
    }
    
    console.log('⚠️ Reviews tab not found after exhaustive search, proceeding anyway');
    return false;
  };

  const setReviewSortOrder = async (sortType) => {
    console.log(`🔄 Setting review sort order to: ${sortType} (NEW APPROACH)`);
    
    try {
      // Wait for reviews to fully load after tab click
      await wait(2000);
      
      // NEW STRATEGY: Comprehensive element discovery and direct interaction
      console.log('🔍 Starting comprehensive sort interaction...');
      
      const sortTexts = {
        'most-relevant': ['most relevant', 'relevance', 'relevant', 'default'],
        'newest': ['newest', 'recent', 'new', 'latest', 'date'],
        'highest-rating': ['highest', 'high rating', 'best', 'top rated'],
        'lowest-rating': ['lowest', 'low rating', 'worst', 'poor']
      };
      
      const targetTexts = sortTexts[sortType] || sortTexts['most-relevant'];
      console.log(`🎯 Target sort: ${sortType} -> Looking for: ${targetTexts.join(', ')}`);
      
      // Strategy 1: Search for direct sort options anywhere on page
      const allClickables = document.querySelectorAll('button, [role="button"], [tabindex="0"], [onclick], [jsaction]');
      let foundDirectOption = null;
      
      console.log(`📊 Scanning ${allClickables.length} clickable elements...`);
      
      for (const element of allClickables) {
        const text = element.textContent?.toLowerCase().trim() || '';
        const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
        const title = element.getAttribute('title')?.toLowerCase() || '';
        const fullText = `${text} ${ariaLabel} ${title}`;
        
        // Check if this element matches our target sort type exactly
        if (targetTexts.some(target => fullText.includes(target.toLowerCase()))) {
          console.log(`🎯 Found direct sort option:`, {
            text: text,
            tagName: element.tagName,
            className: element.className
          });
          
          foundDirectOption = element;
          
          // Click it directly
          console.log(`🎯 Clicking direct option: "${text}"`);
          element.click();
          await wait(2000);
          
          // Quick verification
          const currentUrl = window.location.href;
          const currentReviews = Array.from(document.querySelectorAll('[data-review-id]')).slice(0, 2);
          
          console.log('✅ Direct click completed, checking results...');
          return true;
        }
      }
      
            if (!foundDirectOption) {
        console.log('🔍 No direct option found, trying traditional approach...');
        
        // Fallback: Look for sort button and try standard approach
        const buttons = document.querySelectorAll('button');
        let sortButton = null;
        
        for (const button of buttons) {
          const text = button.textContent?.toLowerCase() || '';
          const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
          
          if (text.includes('sort') || ariaLabel.includes('sort') || 
              text.includes('most relevant') || ariaLabel.includes('most relevant')) {
            sortButton = button;
            console.log(`✅ Found sort button: "${button.textContent}"`);
            break;
          }
        }
        
        if (sortButton) {
          console.log('🔄 Clicking sort button and waiting...');
          sortButton.click();
          await wait(3000);
          
          // Try to find and click sort options after button click
          const sortOptions = document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="option"]');
          
          for (const option of sortOptions) {
            const optionText = option.textContent?.toLowerCase() || '';
            const optionLabel = option.getAttribute('aria-label')?.toLowerCase() || '';
            const optionFullText = `${optionText} ${optionLabel}`;
            
            if (targetTexts.some(target => optionFullText.includes(target.toLowerCase()))) {
              console.log(`🎯 Found sort option after button click: "${option.textContent}"`);
              option.click();
              await wait(2000);
              return true;
            }
          }
        }
        
        console.log('⚠️ Could not complete sort operation');
        return false;
      }
      
      return true;
      for (const button of buttons) {
        const text = button.textContent?.toLowerCase() || '';
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        
        if (text.includes('sort') || ariaLabel.includes('sort') || 
            text.includes('most relevant') || ariaLabel.includes('most relevant') ||
            text.includes('relevance') || ariaLabel.includes('relevance')) {
          sortButton = button;
          console.log(`✅ Found sort button with text: "${button.textContent}"`);
          break;
        }
      }
      
      // Strategy 2: Look for button containing sort icon or specific selectors
      if (!sortButton) {
        const sortSelectors = [
          'button[data-value="Sort"]',
          'button[jsaction*="sort"]',
          'button[aria-haspopup="true"]',
          '.gm2-caption-title'
        ];
        
        for (const selector of sortSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.toLowerCase().includes('sort')) {
            sortButton = element;
            console.log(`✅ Found sort button with selector: ${selector}`);
            break;
          }
        }
      }
      
      if (!sortButton) {
        console.log('⚠️ Sort button not found, continuing with default sort');
        return false;
      }
      
      console.log('🔄 Clicking sort button...');
      
      // Take a screenshot of the current state (for debugging)
      console.log('📸 Sort button details:', {
        text: sortButton.textContent,
        tagName: sortButton.tagName,
        className: sortButton.className,
        id: sortButton.id,
        coords: sortButton.getBoundingClientRect()
      });
      
      // Enhanced clicking with event simulation
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      });
      sortButton.dispatchEvent(clickEvent);
      
      // Also try regular click as fallback
      sortButton.click();
      
      // Wait longer for dropdown to appear and be fully rendered
      await wait(2500);
      
      // Debug: Check if dropdown appeared
      console.log('🔍 Post-click debugging...');
      const dropdownElements = document.querySelectorAll('[role="menu"], [role="listbox"], .dropdown, [aria-expanded="true"]');
      console.log(`📋 Found ${dropdownElements.length} potential dropdown elements after click`);
      dropdownElements.forEach((el, i) => {
        console.log(`  ${i + 1}. ${el.tagName} - ${el.className} - visible: ${el.offsetHeight > 0}`);
      });
      
      // Map sort types to their text representations (more comprehensive)
      const sortTexts = {
        'most-relevant': ['most relevant', 'relevance', 'relevant'],
        'newest': ['newest', 'recent', 'new', 'latest'],
        'highest-rating': ['highest rating', 'high rating', 'highest', 'best'],
        'lowest-rating': ['lowest rating', 'low rating', 'lowest', 'worst']
      };
      
      const targetTexts = sortTexts[sortType] || sortTexts['most-relevant'];
      console.log(`🔍 Looking for sort option matching: ${targetTexts.join(', ')}`);
      
      // Enhanced dropdown option detection with more comprehensive selectors
      const optionSelectors = [
        '[role="menuitem"]',
        '[role="option"]',
        'div[data-value]',
        'li[role="menuitem"]',
        'button[role="menuitem"]',
        '.gm2-caption-title',
        'div[jsaction]',
        '[role="menu"] div',
        '[role="menu"] button',
        '[role="menu"] li',
        'div[aria-label*="sort"]',
        'div[aria-label*="Sort"]',
        '[data-index]',
        '.action-menu-item',
        'div[tabindex="0"]',
        'span[role="button"]'
      ];
      
      let foundOption = null;
      
      // First try to find all visible dropdown elements
      console.log('🔍 Scanning for dropdown elements...');
      const allDropdownElements = [];
      
      for (const selector of optionSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          // Check if element is visible and in viewport
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0) {
            allDropdownElements.push(element);
          }
        }
      }
      
      console.log(`🔍 Found ${allDropdownElements.length} visible dropdown elements`);
      
      // Search through all visible elements
      for (const option of allDropdownElements) {
        const text = (option.textContent || '').toLowerCase().trim();
        const ariaLabel = (option.getAttribute('aria-label') || '').toLowerCase();
        const fullText = `${text} ${ariaLabel}`;
        
        console.log(`  - Checking option: "${text}" (aria: "${ariaLabel}")`);
        
        if (targetTexts.some(target => fullText.includes(target.toLowerCase()))) {
          foundOption = option;
          console.log(`✅ Found matching sort option: "${option.textContent}" | "${ariaLabel}"`);
          break;
        }
      }
      
      if (!foundOption) {
        console.log('⚠️ Sort option not found in dropdown after comprehensive search');
        console.log('📋 Available options:');
        allDropdownElements.forEach((el, i) => {
          console.log(`  ${i + 1}. "${el.textContent?.trim()}" (${el.tagName})`);
        });
        
        // Try alternative approach: Keyboard navigation
        console.log('🎹 Trying keyboard navigation approach...');
        try {
          // Focus on the sort button first
          sortButton.focus();
          await wait(200);
          
          // Send arrow down to open dropdown
          const arrowDown = new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            keyCode: 40,
            which: 40,
            bubbles: true,
            cancelable: true
          });
          sortButton.dispatchEvent(arrowDown);
          await wait(500);
          
          // Try to navigate to the desired option based on sort type
          const navigationMap = {
            'most-relevant': 0, // Usually first option
            'newest': 1,
            'highest-rating': 2,
            'lowest-rating': 3
          };
          
          const targetIndex = navigationMap[sortType] || 0;
          console.log(`🎯 Navigating to option index: ${targetIndex}`);
          
          // Send arrow down keys to navigate to target
          for (let i = 0; i < targetIndex; i++) {
            const arrowDownNav = new KeyboardEvent('keydown', {
              key: 'ArrowDown',
              keyCode: 40,
              which: 40,
              bubbles: true,
              cancelable: true
            });
            document.activeElement.dispatchEvent(arrowDownNav);
            await wait(200);
          }
          
          // Press Enter to select
          const enterSelect = new KeyboardEvent('keydown', {
            key: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          document.activeElement.dispatchEvent(enterSelect);
          await wait(1000);
          
          console.log('✅ Keyboard navigation completed');
          return true;
          
        } catch (keyboardError) {
          console.log(`⚠️ Keyboard navigation failed: ${keyboardError.message}`);
        }
        
        // Try to close dropdown by clicking elsewhere
        document.body.click();
        return false;
      }
      
      console.log(`🔄 Clicking sort option: "${foundOption.textContent}"`);
      
      // Enhanced clicking with multiple methods and aggressive interaction
      let clickSuccessful = false;
      
      try {
        // Method 1: Direct element interaction
        if (foundOption.click) {
          foundOption.click();
          await wait(200);
          console.log('✅ Method 1: Direct click attempted');
        }
        
        // Method 2: MouseEvent simulation with full event chain
        const mouseEvents = ['mousedown', 'mouseup', 'click'];
        for (const eventType of mouseEvents) {
          const event = new MouseEvent(eventType, {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: foundOption.getBoundingClientRect().left + 10,
            clientY: foundOption.getBoundingClientRect().top + 10
          });
          foundOption.dispatchEvent(event);
          await wait(50);
        }
        console.log('✅ Method 2: Mouse event chain completed');
        
        // Method 3: Focus and keyboard interaction
        if (foundOption.focus) {
          foundOption.focus();
          await wait(100);
          
          // Simulate Enter key press
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          foundOption.dispatchEvent(enterEvent);
          
          const enterUpEvent = new KeyboardEvent('keyup', {
            key: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          foundOption.dispatchEvent(enterUpEvent);
          
          console.log('✅ Method 3: Keyboard Enter simulation completed');
        }
        
        // Method 4: Pointer events (modern approach)
        try {
          const pointerDown = new PointerEvent('pointerdown', {
            pointerId: 1,
            bubbles: true,
            cancelable: true,
            clientX: foundOption.getBoundingClientRect().left + 10,
            clientY: foundOption.getBoundingClientRect().top + 10
          });
          const pointerUp = new PointerEvent('pointerup', {
            pointerId: 1,
            bubbles: true,
            cancelable: true,
            clientX: foundOption.getBoundingClientRect().left + 10,
            clientY: foundOption.getBoundingClientRect().top + 10
          });
          
          foundOption.dispatchEvent(pointerDown);
          await wait(50);
          foundOption.dispatchEvent(pointerUp);
          console.log('✅ Method 4: Pointer events completed');
        } catch (pointerError) {
          console.log('⚠️ Pointer events not supported, skipping');
        }
        
        // Method 5: Touch events for mobile compatibility
        try {
          const touchStart = new TouchEvent('touchstart', {
            bubbles: true,
            cancelable: true,
            touches: [{
              clientX: foundOption.getBoundingClientRect().left + 10,
              clientY: foundOption.getBoundingClientRect().top + 10,
              target: foundOption
            }]
          });
          const touchEnd = new TouchEvent('touchend', {
            bubbles: true,
            cancelable: true,
            changedTouches: [{
              clientX: foundOption.getBoundingClientRect().left + 10,
              clientY: foundOption.getBoundingClientRect().top + 10,
              target: foundOption
            }]
          });
          
          foundOption.dispatchEvent(touchStart);
          await wait(50);
          foundOption.dispatchEvent(touchEnd);
          console.log('✅ Method 5: Touch events completed');
        } catch (touchError) {
          console.log('⚠️ Touch events not supported, skipping');
        }
        
        // Method 6: Try triggering any onclick handlers directly
        if (foundOption.onclick) {
          foundOption.onclick();
          console.log('✅ Method 6: Direct onclick handler called');
        }
        
        // Method 7: Try finding and triggering parent element events
        let parent = foundOption.parentElement;
        while (parent && parent !== document.body) {
          if (parent.click) {
            console.log(`🔄 Trying parent element: ${parent.tagName}`);
            parent.click();
            await wait(100);
            break;
          }
          parent = parent.parentElement;
        }
        
        // Method 8: Scroll element into view and try again
        foundOption.scrollIntoView({ behavior: 'instant', block: 'center' });
        await wait(200);
        foundOption.click();
        console.log('✅ Method 8: Scroll into view and click completed');
        
        console.log('🎯 All click methods attempted - checking for success...');
        clickSuccessful = true;
        
      } catch (clickError) {
        console.log(`⚠️ Error during enhanced clicking: ${clickError.message}`);
      }
      
      // Enhanced verification approach
      console.log('⏳ Waiting for sort to take effect and verifying...');
      
      // Store initial state for comparison
      const initialSortText = sortButton.textContent?.toLowerCase() || '';
      const initialReviews = Array.from(document.querySelectorAll('[data-review-id]')).slice(0, 5).map(el => el.getAttribute('data-review-id'));
      
      console.log('📊 Initial state:', {
        sortButtonText: initialSortText,
        firstFiveReviewIds: initialReviews
      });
      
      // Wait and check multiple times
      let verificationAttempts = 0;
      let sortApplied = false;
      
      while (verificationAttempts < 8 && !sortApplied) {
        await wait(1000);
        verificationAttempts++;
        
        // Check if button text changed
        const currentSortText = sortButton.textContent?.toLowerCase() || '';
        const buttonTextChanged = targetTexts.some(target => currentSortText.includes(target.toLowerCase()));
        
        // Check if review order changed
        const currentReviews = Array.from(document.querySelectorAll('[data-review-id]')).slice(0, 5).map(el => el.getAttribute('data-review-id'));
        const reviewOrderChanged = JSON.stringify(initialReviews) !== JSON.stringify(currentReviews);
        
        console.log(`🔍 Verification attempt ${verificationAttempts}:`, {
          buttonText: currentSortText,
          buttonChanged: buttonTextChanged,
          reviewOrderChanged: reviewOrderChanged,
          currentFirstReview: currentReviews[0]
        });
        
        if (buttonTextChanged || reviewOrderChanged) {
          sortApplied = true;
          console.log('✅ Sort verification successful!');
          break;
        }
        
        // If still not applied after 3 attempts, try clicking again
        if (verificationAttempts === 3 && !sortApplied) {
          console.log('🔄 Sort not detected, trying additional click methods...');
          
          // Try clicking the option again with different approach
          try {
            // Method: Direct property manipulation
            if (foundOption.setAttribute) {
              foundOption.setAttribute('aria-selected', 'true');
            }
            
            // Method: Trigger input event
            const inputEvent = new Event('input', { bubbles: true });
            foundOption.dispatchEvent(inputEvent);
            
            // Method: Trigger change event
            const changeEvent = new Event('change', { bubbles: true });
            foundOption.dispatchEvent(changeEvent);
            
            // Method: Try clicking with different coordinates
            const rect = foundOption.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const preciseClick = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: centerX,
              clientY: centerY
            });
            foundOption.dispatchEvent(preciseClick);
            
            console.log('🎯 Additional click methods applied');
            
          } catch (retryError) {
            console.log(`⚠️ Retry click failed: ${retryError.message}`);
          }
        }
        
        // If still not applied after 6 attempts, try alternative elements
        if (verificationAttempts === 6 && !sortApplied) {
          console.log('🔍 Trying alternative clickable elements...');
          
          // Look for parent containers or related elements
          let elementToTry = foundOption.parentElement;
          while (elementToTry && elementToTry !== document.body) {
            if (elementToTry.click && elementToTry.textContent?.toLowerCase().includes(targetTexts[0])) {
              console.log(`🎯 Trying parent element: ${elementToTry.tagName}.${elementToTry.className}`);
              elementToTry.click();
              await wait(500);
              break;
            }
            elementToTry = elementToTry.parentElement;
          }
        }
      }
      
      if (sortApplied) {
        console.log(`✅ Sort successfully applied after ${verificationAttempts} attempts: "${sortButton.textContent}"`);
        return true;
      } else {
        console.log(`⚠️ Sort could not be verified after ${verificationAttempts} attempts. Current button text: "${sortButton.textContent}"`);
        console.log('💡 This might be due to network delays or interface changes. Sort may still be processing.');
        return false;
      }
      
    } catch (error) {
      console.log(`⚠️ Error setting sort order: ${error.message}`);
      console.log('🔍 Stack trace:', error.stack);
      return false;
    }
  };

  const findReviewsPane = () => {
    console.log('🔍 Looking for reviews pane...');
    
    // First check if we have any reviews at all
    const reviewElements = document.querySelectorAll('[data-review-id], .jftiEf, .MyEned, .wiI7pd');
    console.log(`🔍 Found ${reviewElements.length} potential review elements`);
    
    if (reviewElements.length === 0) {
      console.log('❌ No review elements found - this place might not have reviews');
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
        console.log(`🔍 Checking selector "${selector}": ${hasReviews ? 'Found reviews' : 'No reviews'}`);
        if (hasReviews) {
          console.log(`✅ Found reviews pane with selector: ${selector}`);
          return element;
        }
      }
    }
    
    // Enhanced last resort: find by review elements and traverse up
    const firstReview = document.querySelector('[data-review-id], .jftiEf');
    if (firstReview) {
      console.log('🔍 Found review element, traversing up to find scrollable container...');
      
      // Try to find scrollable parent
      let parent = firstReview;
      while (parent && parent !== document.body) {
        parent = parent.parentElement;
        if (parent && (parent.scrollHeight > parent.clientHeight + 10)) {
          console.log('✅ Found scrollable reviews container');
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
          console.log('✅ Found reviews container via traversal');
          return container;
        }
      }
    }
    
    console.log('❌ Could not find reviews pane');
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

  const tabClicked = await clickReviewsTab();

  // If we clicked the tab, wait a bit more for content to load
  if (tabClicked) {
    console.log('⏳ Waiting for reviews to load after tab click...');
    await wait(1000);
    
    // Set the sort order if specified
    if (CONFIG.REVIEW_SORT && CONFIG.REVIEW_SORT !== 'most-relevant') {
      await setReviewSortOrder(CONFIG.REVIEW_SORT);
    }
  }

  const pane = findReviewsPane();
  if (!pane) {
    console.error("Reviews pane not found");
    
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
    
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.runtime.sendMessage({
        type: 'REVIEW_ERROR',
        data: { error: errorMessage }
      });
    }
    return;
  }

  console.log("Reviews pane located");

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

  while (totalScrolls < 100 && !shouldStop) {
    totalScrolls++;
    
    const currentReviewCount = countUniqueReviews(pane);
    
    // Check if we've reached the exact target
    if (currentReviewCount >= CONFIG.MAX_REVIEWS) {
      console.log(`🎯 Target reached: ${currentReviewCount}/${CONFIG.MAX_REVIEWS} reviews`);
      break;
    }
    
    await performScroll(scrollableElement);
    await wait(CONFIG.SCROLL_TIMEOUT);

    // Check for stop signal
    if (shouldStop) {
      console.log("Review scraping stopped by user");
      break;
    }

    const newReviewCount = countUniqueReviews(pane);
    
    if (newReviewCount > lastReviewCount) {
      const newReviews = newReviewCount - lastReviewCount;
      console.log(`📈 ${newReviews} new reviews (total: ${newReviewCount}/${CONFIG.MAX_REVIEWS})`);
      lastReviewCount = newReviewCount;
      noChangeCount = 0;

      // Send progress update
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'SCRAPING_PROGRESS',
          data: { reviewCount: newReviewCount, maxReviews: CONFIG.MAX_REVIEWS, phase: 'Loading reviews' }
        });
      }

      // Wait for DOM stabilization
      await wait(1000);
    } else {
      noChangeCount++;
      console.log(`⏸️ No new reviews (${noChangeCount}) - Found: ${newReviewCount}/${CONFIG.MAX_REVIEWS}`);
      
      // Only stop due to no changes if we've tried many times AND found a reasonable number
      if (noChangeCount >= Math.max(CONFIG.NO_CHANGE_LIMIT * 2, 20) && newReviewCount > CONFIG.MAX_REVIEWS * 0.8) {
        console.log("🏁 Stopping: too many attempts without changes and found substantial results");
        break;
      }
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
    console.log("Review scraping stopped by user");
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
    console.warn("No reviews extracted");
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
  const filename = (restaurantName && restaurantName !== 'Unknown Restaurant') 
    ? `${sanitizeFilename(restaurantName)}_reviews.csv` 
    : 'reviews.csv';
  downloadCSV(csv, filename);

  console.log(`Downloaded ${reviews.length} reviews`);
  window.lastCsv = { csv, length: reviews.length, filename };

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
  // Make collapsible sections work - Reviews section
  const reviewsColl = document.querySelector(".collapsible:not(.restaurant-settings)");
  const reviewsContent = document.querySelector(".content:not(.restaurant-content)");
  
  if (reviewsColl && reviewsContent) {
    reviewsColl.addEventListener("click", function() {
      this.classList.toggle("active");
      reviewsContent.classList.toggle("active");
    });
  }

  // Make collapsible sections work - Restaurant settings section
  const restaurantColl = document.querySelector(".collapsible.restaurant-settings");
  const restaurantContent = document.querySelector(".content.restaurant-content");
  
  if (restaurantColl && restaurantContent) {
    restaurantColl.addEventListener("click", function() {
      this.classList.toggle("active");
      restaurantContent.classList.toggle("active");
    });
  }
  
  // Update CONFIG when review settings change
  const maxReviewsInput = document.getElementById('max-reviews');
  if (maxReviewsInput) {
    maxReviewsInput.addEventListener('change', function() {
      CONFIG.MAX_REVIEWS = parseInt(this.value);
    });
  }
  
  const scrollSpeedSelect = document.getElementById('scroll-speed');
  if (scrollSpeedSelect) {
    scrollSpeedSelect.addEventListener('change', function() {
      const speeds = { fast: 600, normal: 800, slow: 1200 };
      CONFIG.SCROLL_TIMEOUT = speeds[this.value];
    });
  }
  
  const reviewSortSelect = document.getElementById('review-sort');
  if (reviewSortSelect) {
    reviewSortSelect.addEventListener('change', function() {
      CONFIG.REVIEW_SORT = this.value;
    });
  }
  


  // Update CONFIG when restaurant settings change
  const maxRestaurantsInput = document.getElementById('max-restaurants');
  if (maxRestaurantsInput) {
    maxRestaurantsInput.addEventListener('input', function() {
      CONFIG.MAX_RESTAURANTS = parseInt(this.value);
    });
  }
  
  const restaurantScrollSpeedSelect = document.getElementById('restaurant-scroll-speed');
  if (restaurantScrollSpeedSelect) {
    restaurantScrollSpeedSelect.addEventListener('change', function() {
      const speeds = { fast: 600, normal: 800, slow: 1200 };
      CONFIG.RESTAURANT_SCROLL_TIMEOUT = speeds[this.value];
      CONFIG.RESTAURANT_SCROLL_DELAY = speeds[this.value];
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

