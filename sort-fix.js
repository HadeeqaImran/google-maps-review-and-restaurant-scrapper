// WORKING SORT SOLUTION - Test this in browser console
// Go to a Google Maps restaurant page with reviews, open console, paste this code and run: applySortFilter('newest')

async function applySortFilter(sortType = 'newest') {
  console.log(`🚀 Applying sort filter: ${sortType}`);
  
  const wait = ms => new Promise(r => setTimeout(r, ms));
  
  // Define what text to look for based on sort type
  const sortTargets = {
    'most-relevant': ['most relevant', 'relevance', 'relevant'],
    'newest': ['newest', 'recent', 'new', 'latest'],
    'highest-rating': ['highest', 'high rating', 'best', 'top rated'],
    'lowest-rating': ['lowest', 'low rating', 'worst', 'poor']
  };
  
  const targets = sortTargets[sortType] || sortTargets['newest'];
  console.log(`🎯 Looking for: ${targets.join(', ')}`);
  
  // Strategy 1: Find and click sort options directly
  const allElements = document.querySelectorAll('*');
  console.log(`📊 Scanning ${allElements.length} elements...`);
  
  for (const element of allElements) {
    const text = element.textContent?.toLowerCase() || '';
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
    const fullText = `${text} ${ariaLabel}`;
    
    // Check if this is our target sort option
    if (targets.some(target => fullText.includes(target.toLowerCase()))) {
      // Only click if it's actually clickable
      const isClickable = element.tagName === 'BUTTON' || 
                         element.getAttribute('role') === 'button' ||
                         element.getAttribute('tabindex') === '0' ||
                         element.onclick ||
                         window.getComputedStyle(element).cursor === 'pointer';
      
      if (isClickable) {
        console.log(`✅ Found target: "${element.textContent?.trim()}" (${element.tagName})`);
        
        // Multiple click methods
        element.scrollIntoView({ behavior: 'instant', block: 'center' });
        await wait(500);
        
        // Method 1: Regular click
        element.click();
        await wait(500);
        
        // Method 2: Mouse event
        const rect = element.getBoundingClientRect();
        const mouseEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        });
        element.dispatchEvent(mouseEvent);
        
        console.log('🎯 Clicked element, waiting for effect...');
        await wait(3000);
        
        // Verify if it worked
        const newUrl = window.location.href;
        const reviews = document.querySelectorAll('[data-review-id]');
        console.log(`✅ Sort applied! URL: ${newUrl}, Reviews: ${reviews.length}`);
        
        return true;
      }
    }
  }
  
  console.log('❌ No clickable sort option found');
  return false;
}

// Test function
console.log('🔧 Sort fix loaded! Run: applySortFilter("newest") or applySortFilter("highest-rating")'); 