// UI utilities for the Restaurant Scraper extension
export class UI {
  constructor() {
    this.elements = {
      status: document.getElementById('status'),
      pause: document.getElementById('pause'),
      stopBtn: document.getElementById('stop-scraping'),
      stopRestaurantBtn: document.getElementById('stop-restaurant-scraping'),
      progressContainer: this.createProgressContainer()
    };
  }

  createProgressContainer() {
    const container = document.createElement('div');
    container.id = 'progress-container';
    container.style.display = 'none';
    document.body.appendChild(container);
    return container;
  }

  // Status message management
  setStatus(message, type = 'info') {
    if (this.elements.status) {
      this.elements.status.textContent = message;
      this.elements.status.className = type; // success, warning, error, info
    }
  }

  // Progress bar management
  createProgressBar() {
    this.elements.progressContainer.innerHTML = `
      <div style="margin: 10px 0; padding: 8px; background: #f0f0f0; border-radius: 4px;">
        <div id="progress-text" style="font-size: 12px; margin-bottom: 4px;">Starting...</div>
        <div style="background: #ddd; border-radius: 2px; height: 6px;">
          <div id="progress-bar" style="background: #4CAF50; height: 6px; width: 0%; border-radius: 2px; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
    this.elements.progressContainer.style.display = 'block';
  }

  updateProgress(text, percentage = 0) {
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    if (progressText) progressText.textContent = text;
    if (progressBar) progressBar.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
  }

  hideProgress() {
    this.elements.progressContainer.style.display = 'none';
  }

  // Button state management
  showStopButton(show = true, type = 'review') {
    const button = type === 'review' ? this.elements.stopBtn : this.elements.stopRestaurantBtn;
    if (button) {
      button.style.display = show ? 'block' : 'none';
    }
  }

  showPauseButton(show = true) {
    if (this.elements.pause) {
      this.elements.pause.style.display = show ? 'block' : 'none';
    }
  }

  // Initialize collapsible sections
  initializeCollapsible() {
    const coll = document.querySelector(".collapsible");
    const content = document.querySelector(".content");
    
    if (coll && content) {
      coll.addEventListener("click", function() {
        this.classList.toggle("active");
        content.classList.toggle("active");
      });
    }
  }

  // Cleanup UI state
  resetUI() {
    this.hideProgress();
    this.showStopButton(false, 'review');
    this.showStopButton(false, 'restaurant');
    this.showPauseButton(false);
    this.setStatus('Ready', 'info');
  }

  // Validate current page
  validateGoogleMapsPage(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { valid: false, error: 'Switch to the Google Maps tab first.' };
    }
    
    if (!url.includes('google.com/maps') && !url.includes('google.co.jp/maps')) {
      return { valid: false, error: 'Not a Google Maps search page.' };
    }
    
    return { valid: true };
  }

  validateRestaurantSearchPage(url) {
    const basicValidation = this.validateGoogleMapsPage(url);
    if (!basicValidation.valid) return basicValidation;

    // Check if we're on a search results page (not a specific place page)
    if (url.includes('/maps/place/') || (!url.includes('/search/') && !url.includes('search?') && !url.includes('data='))) {
      return { 
        valid: false, 
        error: 'Open a restaurants search page first - search for restaurants in Google Maps.' 
      };
    }

    return { valid: true };
  }

  validateRestaurantPage(url) {
    const basicValidation = this.validateGoogleMapsPage(url);
    if (!basicValidation.valid) return basicValidation;

    if (!url.includes('/maps/place/')) {
      return { 
        valid: false, 
        error: 'Open a restaurant page first.' 
      };
    }

    return { valid: true };
  }
} 