/**
 * Shared utilities for consumption and recharge frontend modules.
 *
 * This module provides common functions for:
 * - Caching with TTL
 * - Data formatting
 * - Validation
 * - DOM manipulation helpers
 */

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Simple in-memory cache with TTL support.
 */
const cache = new Map();

/**
 * Get item from cache.
 * @param {string} key - Cache key
 * @returns {any|null} - Cached value or null if not found/expired
 */
function cacheGet(key) {
    const item = cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
        cache.delete(key);
        return null;
    }

    return item.value;
}

/**
 * Set item in cache with TTL.
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlMs - Time to live in milliseconds (default: 1 hour)
 */
function cacheSet(key, value, ttlMs = 3600000) {
    cache.set(key, {
        value: value,
        expiry: Date.now() + ttlMs
    });
}

/**
 * Clear all cached items.
 */
function cacheClear() {
    cache.clear();
}

/**
 * Clear expired items from cache.
 */
function cacheCleanup() {
    const now = Date.now();
    for (const [key, item] of cache.entries()) {
        if (now > item.expiry) {
            cache.delete(key);
        }
    }
}

// Default TTL values (in milliseconds)
const CACHE_TTL = {
    CAMPUS: 24 * 60 * 60 * 1000,      // 24 hours
    BUILDING: 24 * 60 * 60 * 1000,    // 24 hours
    PREDICTION: 60 * 60 * 1000,       // 1 hour
    HISTORY: 6 * 60 * 60 * 1000,      // 6 hours
};

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetch JSON data with caching.
 * @param {string} url - URL to fetch
 * @param {number} ttl - Cache TTL in milliseconds
 * @returns {Promise<any>} - Parsed JSON data
 */
async function fetchWithCache(url, ttl = CACHE_TTL.CAMPUS) {
    const cacheKey = `fetch:${url}`;
    const cached = cacheGet(cacheKey);

    if (cached !== null) {
        return cached;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        cacheSet(cacheKey, data, ttl);
        return data;
    } catch (error) {
        console.error(`Failed to fetch ${url}:`, error);
        throw error;
    }
}

/**
 * Load campus aggregate data.
 * @param {string} campusName - Campus name (e.g., "仙林校区")
 * @returns {Promise<Object>} - Campus aggregate data
 */
async function loadCampusData(campusName) {
    const url = `database/consumption/campus/${encodeURIComponent(campusName)}.json`;
    return fetchWithCache(url, CACHE_TTL.CAMPUS);
}

/**
 * Load building aggregate data.
 * @param {string} campusName - Campus name
 * @param {string} buildingName - Building name
 * @returns {Promise<Object>} - Building aggregate data
 */
async function loadBuildingData(campusName, buildingName) {
    const url = `database/consumption/building/${campusName}_${buildingName}.json`;
    return fetchWithCache(url, CACHE_TTL.BUILDING);
}

/**
 * Load room prediction data.
 * @param {string} roomId - Room ID
 * @returns {Promise<Object|null>} - Prediction data or null if not available
 */
async function loadRoomPrediction(roomId) {
    try {
        const url = `database/consumption/predictions/${roomId}.json`;
        return await fetchWithCache(url, CACHE_TTL.PREDICTION);
    } catch (error) {
        return null;
    }
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format a number with locale-specific separators.
 * @param {number} value - Number to format
 * @param {number} decimals - Decimal places (default: 2)
 * @returns {string} - Formatted number
 */
function formatNumber(value, decimals = 2) {
    if (typeof value !== 'number' || isNaN(value)) {
        return '--';
    }
    return value.toLocaleString('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Format consumption value with unit.
 * @param {number} kwh - Consumption in kWh
 * @returns {string} - Formatted string (e.g., "3.5 kWh")
 */
function formatConsumption(kwh) {
    return `${formatNumber(kwh)} kWh`;
}

/**
 * Format balance value with unit.
 * @param {number} balance - Balance amount
 * @returns {string} - Formatted string (e.g., "45.50 元")
 */
function formatBalance(balance) {
    return `${formatNumber(balance)} 元`;
}

/**
 * Format confidence as percentage.
 * @param {number} confidence - Confidence value (0.0-1.0)
 * @returns {string} - Formatted percentage (e.g., "85%")
 */
function formatConfidence(confidence) {
    return `${Math.round(confidence * 100)}%`;
}

/**
 * Format large numbers with appropriate suffixes.
 * @param {number} value - Number to format
 * @returns {string} - Formatted string (e.g., "1.5万", "2.3千")
 */
function formatLargeNumber(value) {
    if (value === null || value === undefined || isNaN(value)) return '--';

    if (value >= 10000) {
        return `${(value / 10000).toFixed(1)}万`;
    } else if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}千`;
    }
    return formatNumber(value, 1);
}

/**
 * Format confidence level description.
 * @param {number} confidence - Confidence value (0.0-1.0)
 * @returns {string} - Chinese description (高/中/低)
 */
function formatConfidenceLevel(confidence) {
    if (confidence >= 0.90) return '高';
    if (confidence >= 0.70) return '中';
    return '低';
}

/**
 * Format days until depletion.
 * @param {number} days - Days count
 * @returns {string} - Formatted string
 */
function formatDaysUntilDepletion(days) {
    if (days >= 999) return '充足';
    if (days <= 0) return '已耗尽';
    if (days < 7) return `${Math.ceil(days)} 天 (需关注)`;
    return `${Math.ceil(days)} 天`;
}

/**
 * Format date for display.
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date (e.g., "2026-05-18")
 */
function formatDate(date) {
    if (typeof date === 'string') {
        return date.split('T')[0];
    }
    if (date instanceof Date) {
        return date.toISOString().split('T')[0];
    }
    return '--';
}

/**
 * Format date range for display.
 * @param {Object} range - Date range object with start and end
 * @returns {string} - Formatted range (e.g., "2026-05-01 至 2026-05-18")
 */
function formatDateRange(range) {
    if (!range || !range.start || !range.end) return '--';
    return `${formatDate(range.start)} 至 ${formatDate(range.end)}`;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate schema version.
 * @param {Object} data - Data object
 * @returns {boolean} - True if valid schema version
 */
function validateSchemaVersion(data) {
    if (!data || !data.schema_version) return false;
    const parts = data.schema_version.split('.');
    return parts.length === 3 && parts.every(p => !isNaN(parseInt(p)));
}

/**
 * Validate campus data structure.
 * @param {Object} data - Campus data
 * @returns {boolean} - True if valid
 */
function validateCampusData(data) {
    const required = ['entity_type', 'entity_id', 'statistics', 'buildings'];
    return validateSchemaVersion(data) &&
           data.entity_type === 'campus' &&
           required.every(field => data[field] !== undefined);
}

/**
 * Validate building data structure.
 * @param {Object} data - Building data
 * @returns {boolean} - True if valid
 */
function validateBuildingData(data) {
    const required = ['entity_type', 'entity_id', 'statistics', 'floors'];
    return validateSchemaVersion(data) &&
           data.entity_type === 'building' &&
           required.every(field => data[field] !== undefined);
}

/**
 * Validate prediction data structure.
 * @param {Object} data - Prediction data
 * @returns {boolean} - True if valid
 */
function validatePredictionData(data) {
    const required = ['room_id', 'daily_rate', 'confidence', 'days_until_depletion'];
    return validateSchemaVersion(data) &&
           required.every(field => data[field] !== undefined);
}

/**
 * Check if prediction should be displayed (confidence >= 70%).
 * @param {Object} prediction - Prediction data
 * @returns {boolean} - True if should display
 */
function shouldDisplayPrediction(prediction) {
    return prediction && prediction.confidence >= 0.70;
}

// ============================================================================
// DOM Utilities
// ============================================================================

/**
 * Create element with attributes and children.
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Attributes object
 * @param {Array|string} children - Child elements or text content
 * @returns {HTMLElement} - Created element
 */
function createElement(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);

    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
            element.setAttribute(key, value);
        }
    });

    if (typeof children === 'string') {
        element.textContent = children;
    } else if (Array.isArray(children)) {
        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof HTMLElement) {
                element.appendChild(child);
            }
        });
    }

    return element;
}

/**
 * Clear all children from an element.
 * @param {HTMLElement} element - Element to clear
 */
function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

/**
 * Show loading indicator in element.
 * @param {HTMLElement} element - Container element
 */
function showLoading(element) {
    clearElement(element);
    element.appendChild(createElement('div', { className: 'loading' }, '加载中...'));
}

/**
 * Show error message in element.
 * @param {HTMLElement} element - Container element
 * @param {string} message - Error message
 */
function showError(element, message) {
    clearElement(element);
    element.appendChild(createElement('div', { className: 'error' }, `错误: ${message}`));
}

/**
 * Show empty state in element.
 * @param {HTMLElement} element - Container element
 * @param {string} message - Empty state message
 */
function showEmpty(element, message = '暂无数据') {
    clearElement(element);
    element.appendChild(createElement('div', { className: 'empty' }, message));
}

// ============================================================================
// LocalStorage Configuration
// ============================================================================

const CONFIG_KEYS = {
    PREDICTION_WINDOW: 'consumption.prediction_window',
    ANOMALY_THRESHOLD: 'consumption.anomaly_threshold',
    CONFIDENCE_THRESHOLD: 'consumption.confidence_threshold',
};

const DEFAULT_CONFIG = {
    prediction_window: 14,
    anomaly_threshold: 2.0,
    confidence_threshold: 0.70,
};

/**
 * Get configuration value from localStorage.
 * @param {string} key - Configuration key
 * @param {any} defaultValue - Default value if not set
 * @returns {any} - Configuration value
 */
function getConfig(key, defaultValue) {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;

    const parsed = parseFloat(stored);
    return isNaN(parsed) ? stored : parsed;
}

/**
 * Set configuration value in localStorage.
 * @param {string} key - Configuration key
 * @param {any} value - Value to set
 */
function setConfig(key, value) {
    localStorage.setItem(key, String(value));
}

/**
 * Get all configuration values.
 * @returns {Object} - Configuration object
 */
function getAllConfig() {
    return {
        prediction_window: getConfig(CONFIG_KEYS.PREDICTION_WINDOW, DEFAULT_CONFIG.prediction_window),
        anomaly_threshold: getConfig(CONFIG_KEYS.ANOMALY_THRESHOLD, DEFAULT_CONFIG.anomaly_threshold),
        confidence_threshold: getConfig(CONFIG_KEYS.CONFIDENCE_THRESHOLD, DEFAULT_CONFIG.confidence_threshold),
    };
}

// ============================================================================
// Chart Color Utilities
// ============================================================================

/**
 * Get color for consumption intensity (green to red gradient).
 * @param {number} value - Consumption value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {string} - CSS color value
 */
function getConsumptionColor(value, min, max) {
    if (max === min) return '#4CAF50'; // Default green

    const ratio = (value - min) / (max - min);

    // Green (low) -> Yellow (medium) -> Red (high)
    if (ratio < 0.5) {
        const r = Math.round(255 * ratio * 2);
        return `rgb(${r}, 200, 80)`;
    } else {
        const g = Math.round(200 * (1 - (ratio - 0.5) * 2));
        return `rgb(255, ${g}, 80)`;
    }
}

/**
 * Get color for anomaly z-score.
 * @param {number} zScore - Z-score value
 * @returns {string} - CSS color value
 */
function getAnomalyColor(zScore) {
    const absZ = Math.abs(zScore);
    if (absZ >= 3) return '#f44336'; // Red
    if (absZ >= 2.5) return '#ff9800'; // Orange
    if (absZ >= 2) return '#ffeb3b'; // Yellow
    return '#4CAF50'; // Green
}

// ============================================================================
// Event Utilities
// ============================================================================

/**
 * Debounce function calls.
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function calls.
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} - Throttled function
 */
function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ============================================================================
// Export
// ============================================================================

// ES6 module exports
export {
    // Cache
    cacheGet,
    cacheSet,
    cacheClear,
    cacheCleanup,
    CACHE_TTL,

    // Data fetching
    fetchWithCache,
    loadCampusData,
    loadBuildingData,
    loadRoomPrediction,

    // Formatting
    formatNumber,
    formatConsumption,
    formatBalance,
    formatConfidence,
    formatConfidenceLevel,
    formatLargeNumber,
    formatDaysUntilDepletion,
    formatDate,
    formatDateRange,

    // Validation
    validateSchemaVersion,
    validateCampusData,
    validateBuildingData,
    validatePredictionData,
    shouldDisplayPrediction,

    // DOM
    createElement,
    clearElement,
    showLoading,
    showError,
    showEmpty,

    // Config
    CONFIG_KEYS,
    DEFAULT_CONFIG,
    getConfig,
    setConfig,
    getAllConfig,

    // Colors
    getConsumptionColor,
    getAnomalyColor,

    // Events
    debounce,
    throttle,
};
