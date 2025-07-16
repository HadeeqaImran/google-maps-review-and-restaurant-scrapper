# Restaurant Scraper - Modular Architecture

This document explains the new modular architecture of the Restaurant Scraper Chrome extension.

## 📁 File Structure

```
restaurants-scrapper/
├── js/                           # Modular JavaScript files
│   ├── config.js                 # Configuration management
│   ├── ui.js                     # UI utilities and DOM manipulation
│   ├── chrome-utils.js           # Chrome extension API utilities
│   ├── utils.js                  # Common utility functions
│   └── scrapers/                 # Scraping modules
│       ├── restaurant-scraper.js # Restaurant extraction logic (modular)
│       ├── review-scraper.js     # Review scraping logic (modular)
│       └── injection-functions.js # Self-contained functions for injection
├── popup-new.js                  # Main popup script (modular)
├── popup.js                      # Original popup script (legacy)
├── popup.html                    # Popup interface
├── manifest.json                 # Extension manifest
├── background.js                 # Service worker
└── logo*.png                     # Extension icons
```

## 🧩 Module Architecture

### 1. **Config Module** (`js/config.js`)
Manages all extension configuration and settings.

**Features:**
- Centralized configuration management
- UI synchronization
- Runtime setting updates
- Default value management

**Key Methods:**
- `syncFromUI()` - Updates config from UI elements
- `get()` - Returns current configuration
- `set(key, value)` - Updates specific setting
- `reset()` - Resets to defaults

### 2. **UI Module** (`js/ui.js`)
Handles all user interface interactions and DOM manipulation.

**Features:**
- Status message management
- Progress bar creation and updates
- Button state management
- Page validation
- Collapsible sections

**Key Methods:**
- `setStatus(message, type)` - Updates status with color coding
- `createProgressBar()` - Creates animated progress indicator
- `updateProgress(text, percentage)` - Updates progress display
- `showStopButton(show, type)` - Controls stop button visibility
- `validateGoogleMapsPage(url)` - Validates current page

### 3. **Chrome Utils Module** (`js/chrome-utils.js`)
Manages all Chrome extension API interactions.

**Features:**
- Tab management
- Message passing between popup and content scripts
- Script injection
- Progress listeners
- Automatic cleanup

**Key Methods:**
- `getActiveTab()` - Gets current active tab
- `executeScript(tabId, func, args)` - Injects and runs scripts
- `createRestaurantProgressListener()` - Sets up restaurant extraction monitoring
- `createReviewProgressListener()` - Sets up review scraping monitoring
- `stopScraping(tabId)` - Sends stop signal to content script

### 4. **Utils Module** (`js/utils.js`)
Contains common utility functions used across modules.

**Features:**
- File operations (CSV download, filename sanitization)
- DOM utilities (element finding, text extraction)
- Performance helpers (debouncing, scrolling)
- Data processing (CSV generation, text cleaning)
- Logging with timestamps

**Key Functions:**
- `wait(ms)` - Promise-based delay
- `downloadCSV(csv, filename)` - Downloads CSV file
- `generateCSV(headers, rows)` - Creates CSV from data
- `findElement(selectors)` - Multi-selector element finding
- `log(message, level)` - Timestamped logging

### 5. **Restaurant Scraper Module** (`js/scrapers/restaurant-scraper.js`)
Handles restaurant extraction from Google Maps search results.

**Features:**
- Results pane detection
- Infinite scroll handling
- Restaurant data extraction
- Progress reporting
- Stop signal handling

**Key Methods:**
- `scrape()` - Main scraping function
- `scrollToLoadAll(pane)` - Handles infinite scrolling
- `extractRestaurants(pane)` - Extracts restaurant data
- `downloadRestaurantsCSV(restaurants)` - Generates and downloads CSV

### 6. **Review Scraper Module** (`js/scrapers/review-scraper.js`)
Handles review extraction from restaurant pages.

**Features:**
- Restaurant name detection
- Reviews tab clicking
- Review pane detection
- Review data extraction
- Multi-language support
- Scrolling optimization

**Key Methods:**
- `scrape()` - Main scraping function
- `clickReviewsTab()` - Finds and clicks Reviews tab
- `findReviewsPane()` - Locates review container
- `extractReviews(pane, restaurantName)` - Extracts review data
- `downloadReviewsCSV(reviews, restaurantName)` - Downloads reviews

### 7. **Injection Functions** (`js/scrapers/injection-functions.js`)
Self-contained functions for Chrome extension content script injection.

**Features:**
- No external dependencies
- Self-contained helper functions
- Backward compatible with original functionality
- Optimized for content script execution

**Note:** These functions are needed because when Chrome injects scripts into pages, they cannot access ES6 imports. The modular scrapers are for development/maintenance, while injection functions are for runtime execution.

### 8. **Main App Class** (`popup-new.js`)
Orchestrates all modules and handles user interactions.

**Features:**
- Module coordination
- Event handling
- Error management
- State management
- Cleanup on close

## 🔄 How It Works

### 1. **Initialization**
```javascript
// App creates instances of all modules
this.config = new Config();
this.ui = new UI();
this.chrome = new ChromeUtils();
```

### 2. **Restaurant Extraction Flow**
```
User clicks "Extract Restaurants"
  ↓
UI validates Google Maps search page
  ↓
Chrome utils executes restaurant scraper
  ↓
Restaurant scraper sends progress updates
  ↓
UI updates progress bar in real-time
  ↓
Results downloaded as CSV
```

### 3. **Review Scraping Flow**
```
User clicks "Scrape Reviews"
  ↓
UI validates restaurant page
  ↓
Chrome utils executes review scraper
  ↓
Review scraper clicks Reviews tab
  ↓
Finds and scrolls through reviews
  ↓
Extracts review data
  ↓
Downloads reviews as CSV
```

## 🎯 Benefits of Modular Architecture

### **Maintainability**
- **Single Responsibility**: Each module has one clear purpose
- **Easy Updates**: Changes isolated to relevant modules
- **Clear Dependencies**: Import/export relationships are explicit

### **Reusability**
- **Shared Utilities**: Common functions used across modules
- **Pluggable Components**: Easy to swap or extend modules
- **Configuration Management**: Centralized settings

### **Debugging**
- **Isolated Testing**: Test individual modules separately
- **Clear Error Paths**: Errors traced to specific modules
- **Comprehensive Logging**: Timestamped logs from each module

### **Scalability**
- **Easy Extensions**: Add new scrapers or features
- **Performance**: Import only needed modules
- **Memory Management**: Proper cleanup and resource management

## 🔧 Development Guidelines

### **Adding New Features**
1. Identify the appropriate module
2. Add the feature following module patterns
3. Update interfaces if needed
4. Test the feature in isolation

### **Creating New Scrapers**
1. Create new file in `js/scrapers/`
2. Follow the scraper class pattern
3. Import required utilities
4. Export main function for compatibility

### **Modifying UI**
1. All UI changes go through `UI` module
2. Keep DOM manipulation centralized
3. Use consistent status message types
4. Maintain accessibility

### **Chrome API Changes**
1. All Chrome API calls go through `ChromeUtils`
2. Handle errors gracefully
3. Clean up listeners properly
4. Use consistent message patterns

## 🚀 Migration from Legacy Code

The original `popup.js` file (900+ lines) has been split into:
- **Config**: 50 lines
- **UI**: 120 lines  
- **Chrome Utils**: 140 lines
- **Utils**: 150 lines
- **Restaurant Scraper**: 180 lines
- **Review Scraper**: 330 lines
- **Injection Functions**: 650 lines (self-contained for Chrome injection)
- **Main App**: 200 lines

**Total**: ~1,820 lines (well-organized vs 900+ monolithic)

**Note:** The injection functions duplicate some functionality to ensure Chrome content script compatibility, but the development benefits far outweigh this trade-off.

## 📦 Backward Compatibility

The modular version maintains backward compatibility by:
- Exporting the same main functions (`scrapeAndDownloadOptimized`, `scrapeReviewsOptimized`)
- Preserving all existing functionality
- Maintaining the same UI behavior
- Using the same Chrome extension APIs

## 🔍 Troubleshooting

### **Module Loading Issues**
- Ensure `popup.html` uses `type="module"`
- Check file paths in import statements
- Verify all exports are properly defined

### **Extension Permissions**
- Manifest must include all required permissions
- Background script must be properly configured
- Content script policies must allow module loading

### **Browser Compatibility**
- Modern browsers support ES6 modules
- Chrome extensions support modules in Manifest V3
- No transpilation needed for target browsers

## 📈 Performance Benefits

### **Memory Usage**
- **Before**: All code loaded at once (~900 lines)
- **After**: Only needed modules loaded dynamically

### **Load Time**
- **Before**: Single large file parsing
- **After**: Parallel module loading and parsing

### **Error Isolation**
- **Before**: One error could break entire extension
- **After**: Errors contained within modules

This modular architecture makes the Restaurant Scraper extension more maintainable, scalable, and robust while preserving all existing functionality. 