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

  // Set review sort order (SIMPLIFIED APPROACH)
  async setReviewSortOrder(sortType) {
    log(`Setting review sort order to: ${sortType} (SIMPLIFIED)`, 'info');
    
    try {
      // Wait for reviews to fully load after tab click
      await wait(2000);
      
      // SIMPLIFIED APPROACH: Direct option search
      const sortTextsMapping = {
        'most-relevant': ['most relevant', 'relevance', 'relevant'],
        'newest': ['newest', 'recent', 'new', 'latest'],
        'highest-rating': ['highest', 'high rating', 'best', 'top rated'],
        'lowest-rating': ['lowest', 'low rating', 'worst', 'poor']
      };
      
      const targetTextsForSort = sortTextsMapping[sortType] || sortTextsMapping['most-relevant'];
      
      // Search all clickable elements for direct sort options
      const allClickables = document.querySelectorAll('button, [role="button"], [tabindex="0"], [onclick]');
      
      for (const element of allClickables) {
        const text = element.textContent?.toLowerCase() || '';
        const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
        const fullText = `${text} ${ariaLabel}`;
        
        if (targetTextsForSort.some(target => fullText.includes(target.toLowerCase()))) {
          log(`Found direct sort option: "${text}"`, 'success');
          element.click();
          await wait(3000);
          return true;
        }
      }
      
      log('No direct sort option found, trying sort button approach', 'warn');
      
      // Look for the sort dropdown button with multiple strategies
      let sortButton = null;
      
      // Strategy 1: Look for buttons with sort-related text or aria-label
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        const text = button.textContent?.toLowerCase() || '';
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        
        if (text.includes('sort') || ariaLabel.includes('sort') || 
            text.includes('most relevant') || ariaLabel.includes('most relevant') ||
            text.includes('relevance') || ariaLabel.includes('relevance')) {
          sortButton = button;
          log(`Found sort button with text: "${button.textContent}"`, 'success');
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
            log(`Found sort button with selector: ${selector}`, 'success');
            break;
          }
        }
      }
      
      if (!sortButton) {
        log('Sort button not found, continuing with default sort', 'warn');
        return false;
      }
      
      log('Clicking sort button...', 'info');
      
      // Take a screenshot of the current state (for debugging)
      log('Sort button details:', 'info');
      log(JSON.stringify({
        text: sortButton.textContent,
        tagName: sortButton.tagName,
        className: sortButton.className,
        id: sortButton.id,
        coords: sortButton.getBoundingClientRect()
      }), 'info');
      
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
      log('Post-click debugging...', 'info');
      const dropdownElements = document.querySelectorAll('[role="menu"], [role="listbox"], .dropdown, [aria-expanded="true"]');
      log(`Found ${dropdownElements.length} potential dropdown elements after click`, 'info');
      dropdownElements.forEach((el, i) => {
        log(`  ${i + 1}. ${el.tagName} - ${el.className} - visible: ${el.offsetHeight > 0}`, 'info');
      });
      
      // Map sort types to their text representations (more comprehensive)
      const sortTextsAlternate = {
        'most-relevant': ['most relevant', 'relevance', 'relevant'],
        'newest': ['newest', 'recent', 'new', 'latest'],
        'highest-rating': ['highest rating', 'high rating', 'highest', 'best'],
        'lowest-rating': ['lowest rating', 'low rating', 'lowest', 'worst']
      };
      
      const targetTextsAlternate = sortTextsAlternate[sortType] || sortTextsAlternate['most-relevant'];
      log(`Looking for sort option matching: ${targetTextsAlternate.join(', ')}`, 'info');
      
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
      log('Scanning for dropdown elements...', 'info');
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
      
      log(`Found ${allDropdownElements.length} visible dropdown elements`, 'info');
      
      // Search through all visible elements
      for (const option of allDropdownElements) {
        const text = (option.textContent || '').toLowerCase().trim();
        const ariaLabel = (option.getAttribute('aria-label') || '').toLowerCase();
        const fullText = `${text} ${ariaLabel}`;
        
        log(`  - Checking option: "${text}" (aria: "${ariaLabel}")`, 'info');
        
                  if (targetTextsAlternate.some(target => fullText.includes(target.toLowerCase()))) {
          foundOption = option;
          log(`Found matching sort option: "${option.textContent}" | "${ariaLabel}"`, 'success');
          break;
        }
      }
      
      if (!foundOption) {
        log('Sort option not found in dropdown after comprehensive search', 'warn');
        log('Available options:', 'info');
        allDropdownElements.forEach((el, i) => {
          log(`  ${i + 1}. "${el.textContent?.trim()}" (${el.tagName})`, 'info');
        });
        
        // Try alternative approach: Keyboard navigation
        log('Trying keyboard navigation approach...', 'info');
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
          log(`Navigating to option index: ${targetIndex}`, 'info');
          
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
          
          log('Keyboard navigation completed', 'success');
          return true;
          
        } catch (keyboardError) {
          log(`Keyboard navigation failed: ${keyboardError.message}`, 'error');
        }
        
        // Try to close dropdown by clicking elsewhere
        document.body.click();
        return false;
      }
      
      log(`Clicking sort option: "${foundOption.textContent}"`, 'info');
      
      // Enhanced clicking with multiple methods and aggressive interaction
      let clickSuccessful = false;
      
      try {
        // Method 1: Direct element interaction
        if (foundOption.click) {
          foundOption.click();
          await wait(200);
          log('Method 1: Direct click attempted', 'success');
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
        log('Method 2: Mouse event chain completed', 'success');
        
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
          
          log('Method 3: Keyboard Enter simulation completed', 'success');
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
          log('Method 4: Pointer events completed', 'success');
        } catch (pointerError) {
          log('Pointer events not supported, skipping', 'warn');
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
          log('Method 5: Touch events completed', 'success');
        } catch (touchError) {
          log('Touch events not supported, skipping', 'warn');
        }
        
        // Method 6: Try triggering any onclick handlers directly
        if (foundOption.onclick) {
          foundOption.onclick();
          log('Method 6: Direct onclick handler called', 'success');
        }
        
        // Method 7: Try finding and triggering parent element events
        let parent = foundOption.parentElement;
        while (parent && parent !== document.body) {
          if (parent.click) {
            log(`Trying parent element: ${parent.tagName}`, 'info');
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
        log('Method 8: Scroll into view and click completed', 'success');
        
        log('All click methods attempted - checking for success...', 'info');
        clickSuccessful = true;
        
      } catch (clickError) {
        log(`Error during enhanced clicking: ${clickError.message}`, 'error');
      }
      
      // Enhanced verification approach
      log('Waiting for sort to take effect and verifying...', 'info');
      
      // Store initial state for comparison
      const initialSortText = sortButton.textContent?.toLowerCase() || '';
      const initialReviews = Array.from(document.querySelectorAll('[data-review-id]')).slice(0, 5).map(el => el.getAttribute('data-review-id'));
      
      log('Initial state:', 'info');
      log(JSON.stringify({
        sortButtonText: initialSortText,
        firstFiveReviewIds: initialReviews
      }), 'info');
      
      // Wait and check multiple times
      let verificationAttempts = 0;
      let sortApplied = false;
      
      while (verificationAttempts < 8 && !sortApplied) {
        await wait(1000);
        verificationAttempts++;
        
        // Check if button text changed
        const currentSortText = sortButton.textContent?.toLowerCase() || '';
        const buttonTextChanged = targetTextsAlternate.some(target => currentSortText.includes(target.toLowerCase()));
        
        // Check if review order changed
        const currentReviews = Array.from(document.querySelectorAll('[data-review-id]')).slice(0, 5).map(el => el.getAttribute('data-review-id'));
        const reviewOrderChanged = JSON.stringify(initialReviews) !== JSON.stringify(currentReviews);
        
        log(`Verification attempt ${verificationAttempts}:`, 'info');
        log(JSON.stringify({
          buttonText: currentSortText,
          buttonChanged: buttonTextChanged,
          reviewOrderChanged: reviewOrderChanged,
          currentFirstReview: currentReviews[0]
        }), 'info');
        
        if (buttonTextChanged || reviewOrderChanged) {
          sortApplied = true;
          log('Sort verification successful!', 'success');
          break;
        }
        
        // If still not applied after 3 attempts, try clicking again
        if (verificationAttempts === 3 && !sortApplied) {
          log('Sort not detected, trying additional click methods...', 'info');
          
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
            
            log('Additional click methods applied', 'success');
            
          } catch (retryError) {
            log(`Retry click failed: ${retryError.message}`, 'error');
          }
        }
        
        // If still not applied after 6 attempts, try alternative elements
        if (verificationAttempts === 6 && !sortApplied) {
          log('Trying alternative clickable elements...', 'info');
          
          // Look for parent containers or related elements
          let elementToTry = foundOption.parentElement;
          while (elementToTry && elementToTry !== document.body) {
            if (elementToTry.click && elementToTry.textContent?.toLowerCase().includes(targetTextsAlternate[0])) {
              log(`Trying parent element: ${elementToTry.tagName}.${elementToTry.className}`, 'info');
              elementToTry.click();
              await wait(500);
              break;
            }
            elementToTry = elementToTry.parentElement;
          }
        }
      }
      
      if (sortApplied) {
        log(`Sort successfully applied after ${verificationAttempts} attempts: "${sortButton.textContent}"`, 'success');
        return true;
      } else {
        log(`Sort could not be verified after ${verificationAttempts} attempts. Current button text: "${sortButton.textContent}"`, 'warn');
        log('This might be due to network delays or interface changes. Sort may still be processing.', 'info');
        return false;
      }
      
    } catch (error) {
      log(`Error setting sort order: ${error.message}`, 'error');
      log(`Stack trace: ${error.stack}`, 'error');
      return false;
    }
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
    const filename = (restaurantName && restaurantName !== 'Unknown Restaurant') 
      ? `${sanitizeFilename(restaurantName)}_reviews.csv` 
      : 'reviews.csv';
    downloadCSV(csv, filename);
    
    log(`Downloaded ${reviews.length} reviews`, 'success');
    window.lastCsv = { csv, length: reviews.length, filename };
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
        
        // Set the sort order if specified
        if (this.config.REVIEW_SORT && this.config.REVIEW_SORT !== 'most-relevant') {
          await this.setReviewSortOrder(this.config.REVIEW_SORT);
        }
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

      while (totalScrolls < 100 && !this.shouldStop) {
        totalScrolls++;
        
        const currentReviewCount = this.countUniqueReviews(pane);
        
        // Check if we've reached the exact target
        if (currentReviewCount >= this.config.MAX_REVIEWS) {
          log(`🎯 Target reached: ${currentReviewCount}/${this.config.MAX_REVIEWS} reviews`, 'success');
          break;
        }
        
        performScroll(scrollableElement);
        await wait(this.config.SCROLL_TIMEOUT);

        // Check for stop signal
        if (this.shouldStop) {
          log("Review scraping stopped by user");
          break;
        }

        const newReviewCount = this.countUniqueReviews(pane);
        
        if (newReviewCount > lastReviewCount) {
          const newReviews = newReviewCount - lastReviewCount;
          log(`${newReviews} new reviews (total: ${newReviewCount}/${this.config.MAX_REVIEWS})`, 'success');
          lastReviewCount = newReviewCount;
          noChangeCount = 0;

          // Send progress update
          this.sendProgress(newReviewCount, this.config.MAX_REVIEWS, 'Loading reviews');

          // Wait for DOM stabilization
          await wait(1000);
        } else {
          noChangeCount++;
          log(`No new reviews (${noChangeCount}) - Found: ${newReviewCount}/${this.config.MAX_REVIEWS}`, 'warn');
          
          // Only stop due to no changes if we've tried many times AND found a reasonable number
          if (noChangeCount >= Math.max(this.config.NO_CHANGE_LIMIT * 2, 20) && newReviewCount > this.config.MAX_REVIEWS * 0.8) {
            log("🏁 Stopping: too many attempts without changes and found substantial results", 'info');
            break;
          }
        }
      }

      // Send processing phase update
      this.sendProgress(lastReviewCount, this.config.MAX_REVIEWS, 'Processing reviews');

      // Handle stopped case
      if (this.shouldStop) {
        log("Review scraping stopped by user - extracting partial results");
        
        // Extract reviews that were loaded so far
        const partialReviews = this.extractReviews(pane, restaurantName);
        
        if (partialReviews.length > 0) {
          // Generate and download CSV with partial results
          const csv = this.generateReviewCSV(partialReviews);
          const filename = (restaurantName && restaurantName !== 'Unknown Restaurant') 
            ? `${this.sanitizeFilename(restaurantName)}_reviews_partial.csv` 
            : 'reviews_partial.csv';
          this.downloadCSV(csv, filename);
          
          log(`Downloaded ${partialReviews.length} partial reviews`);
          window.lastCsv = { csv, length: partialReviews.length, filename };
        }
        
        this.sendStopped(partialReviews.length);
        return partialReviews.length;
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