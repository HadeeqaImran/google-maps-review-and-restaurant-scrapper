// Configuration management for the Restaurant Scraper extension
export class Config {
  constructor() {
    this.settings = {
      MAX_REVIEWS: 2000,
      SCROLL_TIMEOUT: 800,
      NO_CHANGE_LIMIT: 15,
      BATCH_SIZE: 50,
      INTERSECTION_THRESHOLD: 0.1,
      MAX_NO_CHANGE: 3,
      SCROLL_DELAY: 600
    };
  }

  // Update configuration from UI elements
  syncFromUI() {
    const maxReviews = document.getElementById('max-reviews')?.value;
    const scrollSpeed = document.getElementById('scroll-speed')?.value;
    
    if (maxReviews) {
      this.settings.MAX_REVIEWS = parseInt(maxReviews);
    }
    
    if (scrollSpeed) {
      const speeds = { fast: 600, normal: 800, slow: 1200 };
      this.settings.SCROLL_TIMEOUT = speeds[scrollSpeed] || 800;
      this.settings.SCROLL_DELAY = speeds[scrollSpeed] || 600;
    }
  }

  // Get current configuration
  get() {
    return { ...this.settings };
  }

  // Update specific setting
  set(key, value) {
    if (this.settings.hasOwnProperty(key)) {
      this.settings[key] = value;
    }
  }

  // Reset to defaults
  reset() {
    this.settings = {
      MAX_REVIEWS: 2000,
      SCROLL_TIMEOUT: 800,
      NO_CHANGE_LIMIT: 15,
      BATCH_SIZE: 50,
      INTERSECTION_THRESHOLD: 0.1,
      MAX_NO_CHANGE: 3,
      SCROLL_DELAY: 600
    };
  }
} 