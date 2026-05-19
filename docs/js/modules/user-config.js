/**
 * User Configuration Module
 *
 * Manages user room selection and preferences for personalized experience.
 * Stores configuration in localStorage for persistence across sessions.
 */

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEYS = {
    USER_ROOM: 'user.room',
    USER_PREFERENCES: 'user.preferences'
};

const DEFAULT_PREFERENCES = {
    predictionWindow: 14,
    anomalyThreshold: 2.0,
    confidenceThreshold: 0.70,
    showAnalogyOnLoad: true
};

// ============================================================================
// User Room Configuration
// ============================================================================

/**
 * Save user's room selection to localStorage.
 * @param {Object} config - Room configuration
 * @param {string} config.campus - Campus name (e.g., "仙林校区")
 * @param {string} config.building - Building name (e.g., "19幢")
 * @param {string} config.roomId - Room ID (e.g., "53463")
 * @param {string} [config.roomName] - Room display name (optional, defaults to roomId)
 */
function saveUserRoom(config) {
    if (!config.campus || !config.building || !config.roomId) {
        throw new Error('Required room configuration fields: campus, building, roomId');
    }

    const roomConfig = {
        ...config,
        roomName: config.roomName || config.roomId,
        savedAt: new Date().toISOString()
    };

    try {
        localStorage.setItem(STORAGE_KEYS.USER_ROOM, JSON.stringify(roomConfig));
    } catch (e) {
        console.error('Failed to save user room configuration:', e);
        throw new Error('localStorage not available');
    }
}

/**
 * Retrieve saved room configuration.
 * @returns {Object|null} Saved configuration or null if not set
 */
function getUserRoom() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.USER_ROOM);
        if (!stored) return null;

        const config = JSON.parse(stored);
        return config;
    } catch (e) {
        console.error('Failed to retrieve user room configuration:', e);
        return null;
    }
}

/**
 * Remove saved room configuration.
 */
function clearUserRoom() {
    try {
        localStorage.removeItem(STORAGE_KEYS.USER_ROOM);
    } catch (e) {
        console.error('Failed to clear user room configuration:', e);
    }
}

// ============================================================================
// User Preferences
// ============================================================================

/**
 * Save a user preference.
 * @param {string} key - Preference key
 * @param {number|boolean|string} value - Preference value
 */
function setPreference(key, value) {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
        const preferences = stored ? JSON.parse(stored) : { ...DEFAULT_PREFERENCES };

        preferences[key] = value;
        localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(preferences));
    } catch (e) {
        console.error('Failed to save preference:', e);
    }
}

/**
 * Retrieve a user preference.
 * @param {string} key - Preference key
 * @param {*} defaultValue - Value to return if not set
 * @returns {*} Saved value or defaultValue
 */
function getPreference(key, defaultValue) {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
        if (!stored) {
            return defaultValue !== undefined ? defaultValue : DEFAULT_PREFERENCES[key];
        }

        const preferences = JSON.parse(stored);
        if (preferences[key] !== undefined) {
            return preferences[key];
        }

        return defaultValue !== undefined ? defaultValue : DEFAULT_PREFERENCES[key];
    } catch (e) {
        console.error('Failed to retrieve preference:', e);
        return defaultValue !== undefined ? defaultValue : DEFAULT_PREFERENCES[key];
    }
}

/**
 * Get all user preferences with defaults applied.
 * @returns {Object} Complete preferences object
 */
function getAllPreferences() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
        const saved = stored ? JSON.parse(stored) : {};

        return { ...DEFAULT_PREFERENCES, ...saved };
    } catch (e) {
        console.error('Failed to retrieve preferences:', e);
        return { ...DEFAULT_PREFERENCES };
    }
}

// ============================================================================
// Export
// ============================================================================

export {
    saveUserRoom,
    getUserRoom,
    clearUserRoom,
    setPreference,
    getPreference,
    getAllPreferences,
    STORAGE_KEYS,
    DEFAULT_PREFERENCES
};

export default {
    saveUserRoom,
    getUserRoom,
    clearUserRoom,
    setPreference,
    getPreference,
    getAllPreferences,
    STORAGE_KEYS,
    DEFAULT_PREFERENCES
};
