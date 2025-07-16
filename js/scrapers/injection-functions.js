// Self-contained injection functions for Chrome extension content script execution
// These functions cannot use imports as they run in the injected page context

// Self-contained restaurant scraping function for injection
export async function scrapeAndDownloadOptimizedInjection(userConfig = {}) {
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

  console.log(`Found ${restaurants.size} unique restaurants with ratings and reviews`);
  
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

// Self-contained review scraping function for injection
export async function scrapeReviewsOptimizedInjection(userConfig = {}) {
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