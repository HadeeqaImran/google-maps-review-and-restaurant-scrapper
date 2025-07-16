// Configuration management for the Restaurant Scraper extension
export class Config {
  constructor() {
    this.settings = {
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
  }

  // Update configuration from UI elements
  syncFromUI() {
    // Review settings
    const maxReviews = document.getElementById('max-reviews')?.value;
    const scrollSpeed = document.getElementById('scroll-speed')?.value;
    const reviewSort = document.getElementById('review-sort')?.value;
    
    if (maxReviews) {
      this.settings.MAX_REVIEWS = parseInt(maxReviews);
    }
    
    if (scrollSpeed) {
      const speeds = { fast: 600, normal: 800, slow: 1200 };
      this.settings.SCROLL_TIMEOUT = speeds[scrollSpeed] || 800;
    }
    
    if (reviewSort) {
      this.settings.REVIEW_SORT = reviewSort;
    }

    // Restaurant settings
    const maxRestaurants = document.getElementById('max-restaurants')?.value;
    const restaurantScrollSpeed = document.getElementById('restaurant-scroll-speed')?.value;
    
    if (maxRestaurants) {
      this.settings.MAX_RESTAURANTS = parseInt(maxRestaurants);
    }
    
    if (restaurantScrollSpeed) {
      const speeds = { fast: 600, normal: 800, slow: 1200 };
      this.settings.RESTAURANT_SCROLL_TIMEOUT = speeds[restaurantScrollSpeed] || 800;
      this.settings.RESTAURANT_SCROLL_DELAY = speeds[restaurantScrollSpeed] || 800;
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
  }
} 