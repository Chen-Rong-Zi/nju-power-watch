/**
 * Consumption Analogy Module
 *
 * Provides intuitive descriptions for electricity consumption amounts.
 * Helps users understand their energy usage through everyday comparisons.
 */

// ============================================================================
// Consumption Analogy Database
// ============================================================================

/**
 * Lookup table for consumption analogies.
 * Each entry maps a kWh range to a human-readable description.
 */
const CONSUMPTION_ANALOGIES = [
    {
        min: 0,
        max: 0.5,
        text: '相当于给手机充电约30次',
        icon: '📱',
        context: '非常省电',
        level: 'success'
    },
    {
        min: 0.5,
        max: 2,
        text: '相当于运行笔记本电脑一个下午',
        icon: '💻',
        context: '省电',
        level: 'success'
    },
    {
        min: 2,
        max: 5,
        text: '相当于烧开约10壶水',
        icon: '🫖',
        context: '正常',
        level: 'info'
    },
    {
        min: 5,
        max: 10,
        text: '相当于使用微波炉加热食物20次',
        icon: '🍳',
        context: '正常',
        level: 'info'
    },
    {
        min: 10,
        max: 30,
        text: '相当于空调运行约2小时',
        icon: '❄️',
        context: '用电较多',
        level: 'warning'
    },
    {
        min: 30,
        max: 100,
        text: '相当于1kg木材燃烧产生的电能',
        icon: '🪵',
        context: '用电较高',
        level: 'warning'
    },
    {
        min: 100,
        max: 200,
        text: '相当于电动汽车行驶约100公里',
        icon: '🚗',
        context: '用电很高',
        level: 'danger'
    },
    {
        min: 200,
        max: Infinity,
        text: '相当于一个普通家庭一整天的用电量',
        icon: '🏠',
        context: '用电极高',
        level: 'danger'
    }
];

// ============================================================================
// Context Level Styling
// ============================================================================

const CONTEXT_LEVELS = {
    success: { className: 'consumption-low', color: '#4caf50' },
    info: { className: 'consumption-normal', color: '#2196f3' },
    warning: { className: 'consumption-high', color: '#ff9800' },
    danger: { className: 'consumption-very-high', color: '#f44336' }
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Find the appropriate analogy for a given consumption amount.
 * @param {number} kwh - Consumption in kilowatt-hours (must be >= 0)
 * @returns {Object|null} Matching analogy object or null if kwh < 0
 */
function getConsumptionAnalogy(kwh) {
    if (typeof kwh !== 'number' || kwh < 0) {
        return null;
    }

    const analogy = CONSUMPTION_ANALOGIES.find(
        item => kwh >= item.min && kwh < item.max
    );

    return analogy || CONSUMPTION_ANALOGIES[CONSUMPTION_ANALOGIES.length - 1];
}

/**
 * Format consumption value with analogy text.
 * @param {number} kwh - Consumption in kilowatt-hours
 * @param {Object} options - Formatting options
 * @param {boolean} options.showValue - Show numeric value (default: true)
 * @param {boolean} options.showIcon - Show icon (default: true)
 * @param {boolean} options.showContext - Show context label (default: true)
 * @param {string} options.unit - Unit suffix (default: "kWh")
 * @returns {string} Formatted string
 */
function formatConsumptionWithAnalogy(kwh, options = {}) {
    const {
        showValue = true,
        showIcon = true,
        showContext = true,
        unit = 'kWh'
    } = options;

    const analogy = getConsumptionAnalogy(kwh);
    if (!analogy) return '--';

    const parts = [];

    if (showValue) {
        parts.push(`${kwh.toFixed(1)} ${unit}`);
    }

    const analogyParts = [];
    if (showIcon) {
        analogyParts.push(analogy.icon);
    }
    analogyParts.push(analogy.text);

    parts.push(analogyParts.join(' '));

    if (showContext) {
        parts.push(`(${analogy.context})`);
    }

    return parts.join(' - ');
}

/**
 * Get the context level for styling purposes.
 * @param {number} kwh - Consumption in kilowatt-hours
 * @returns {Object} Context level with className and color
 */
function getAnalogyContextLevel(kwh) {
    const analogy = getConsumptionAnalogy(kwh);
    if (!analogy) {
        return CONTEXT_LEVELS.info;
    }

    return CONTEXT_LEVELS[analogy.level] || CONTEXT_LEVELS.info;
}

/**
 * Create an HTML element for the consumption analogy display.
 * @param {number} kwh - Consumption in kilowatt-hours
 * @param {string} className - Additional CSS class
 * @returns {HTMLElement} Analogy display element
 */
function createAnalogyElement(kwh, className = '') {
    const analogy = getConsumptionAnalogy(kwh);
    if (!analogy) return null;

    const context = getAnalogyContextLevel(kwh);

    const container = document.createElement('div');
    container.className = `consumption-analogy ${context.className} ${className}`.trim();

    container.innerHTML = `
        <span class="analogy-icon">${analogy.icon}</span>
        <span class="analogy-text">${analogy.text}</span>
        <span class="analogy-context">${analogy.context}</span>
    `;

    return container;
}

// ============================================================================
// Export
// ============================================================================

export {
    CONSUMPTION_ANALOGIES,
    CONTEXT_LEVELS,
    getConsumptionAnalogy,
    formatConsumptionWithAnalogy,
    getAnalogyContextLevel,
    createAnalogyElement
};

export default {
    CONSUMPTION_ANALOGIES,
    CONTEXT_LEVELS,
    getConsumptionAnalogy,
    formatConsumptionWithAnalogy,
    getAnalogyContextLevel,
    createAnalogyElement
};
