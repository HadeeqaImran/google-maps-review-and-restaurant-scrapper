// Common utilities for the Restaurant Scraper extension

// Utility function to wait for a specified number of milliseconds
export const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Download CSV file utility
export const downloadCSV = (csv, filename) => {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Sanitize filename for download
export const sanitizeFilename = (filename) => {
  return filename.replace(/[^\w\s-]/g, '').trim();
};

// Generate CSV from array data
export const generateCSV = (headers, rows) => {
  const headerLine = headers.map(header => `"${header}"`).join(',');
  const dataLines = rows.map(row => 
    row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
};

// Escape CSV cell content
export const escapeCsvCell = (content) => {
  if (!content) return '';
  return content.toString().replace(/"/g, '""');
};

// Debounce function for performance optimization
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Check if element is scrollable
export const isScrollable = (element) => {
  return element && element.scrollHeight > element.clientHeight + 10;
};

// Find scrollable parent element
export const findScrollableParent = (element) => {
  if (!element) return window;
  
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    if (isScrollable(parent)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return window;
};

// Perform scroll operation
export const performScroll = (element, distance = 1000) => {
  if (element === window) {
    window.scrollBy(0, distance);
  } else {
    element.scrollBy(0, distance);
  }
};

// Get element text content safely
export const getTextContent = (element) => {
  if (!element) return '';
  return element.textContent?.trim() || '';
};

// Get element attribute safely
export const getAttribute = (element, attribute) => {
  if (!element) return '';
  return element.getAttribute(attribute) || '';
};

// Find element by multiple selectors
export const findElement = (selectors) => {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
};

// Find all elements by multiple selectors
export const findElements = (selectors) => {
  const elements = [];
  for (const selector of selectors) {
    const found = document.querySelectorAll(selector);
    elements.push(...found);
  }
  return elements;
};

// Clean text content by removing extra whitespace and newlines
export const cleanText = (text) => {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').replace(/\n+/g, ' ').trim();
};

// Check if two elements are the same
export const isSameElement = (element1, element2) => {
  return element1 === element2;
};

// Get unique elements from array
export const getUniqueElements = (elements) => {
  return [...new Set(elements)];
};

// Log with timestamp
export const log = (message, level = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'success' ? '✅' : '🔍';
  console[level](`${prefix} [${timestamp}] ${message}`);
};

// Chrome extension message helper
export const sendChromeMessage = (type, data = {}) => {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type, data });
    return true;
  }
  return false;
};

// Extract numeric value from string
export const extractNumber = (text) => {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
};

// Format number for display
export const formatNumber = (num) => {
  if (typeof num !== 'number') return '0';
  return num.toLocaleString();
};

// Check if string contains any of the keywords (case insensitive)
export const containsKeyword = (text, keywords) => {
  if (!text || !keywords) return false;
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
}; 