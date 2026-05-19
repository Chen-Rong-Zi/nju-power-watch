/**
 * Prediction display utilities for frontend.
 *
 * This module provides functions for:
 * - Formatting prediction data
 * - Displaying confidence indicators
 * - Calculating depletion estimates
 */

import {
    formatNumber,
    formatConsumption,
    formatConfidence,
    formatConfidenceLevel,
    formatDaysUntilDepletion,
} from './utils.js';

// ============================================================================
// Prediction Validation
// ============================================================================

/**
 * Check if prediction should be displayed (confidence >= 70%).
 * @param {Object} prediction - Prediction data
 * @returns {boolean} - True if should display
 */
export function shouldDisplayPrediction(prediction) {
    return prediction && prediction.confidence >= 0.70;
}

/**
 * Validate prediction data structure.
 * @param {Object} data - Prediction data
 * @returns {boolean} - True if valid
 */
export function validatePredictionData(data) {
    if (!data) return false;
    const required = ['room_id', 'daily_rate', 'confidence', 'days_until_depletion'];
    return required.every(field => data[field] !== undefined);
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format daily consumption rate with unit.
 * @param {number} rate - Daily rate in kWh
 * @returns {string} - Formatted string
 */
export function formatDailyRate(rate) {
    if (rate === null || rate === undefined || isNaN(rate)) {
        return '数据不足';
    }
    return `${formatNumber(rate, 2)} kWh/天`;
}

/**
 * Format depletion prediction.
 * @param {number} days - Days until depletion
 * @param {number} confidence - Prediction confidence
 * @returns {string} - Formatted prediction
 */
export function formatDepletionPrediction(days, confidence) {
    if (days === null || days === undefined) {
        return '无法预测';
    }

    const daysStr = formatDaysUntilDepletion(days);
    const confLevel = formatConfidenceLevel(confidence);
    const confPercent = formatConfidence(confidence);

    return `${daysStr} (置信度: ${confLevel} ${confPercent})`;
}

/**
 * Format confidence interval.
 * @param {Object} ci - Confidence interval object {low, high}
 * @returns {string} - Formatted interval
 */
export function formatConfidenceInterval(ci) {
    if (!ci || ci.low === undefined || ci.high === undefined) {
        return '--';
    }
    return `${formatNumber(ci.low, 2)} - ${formatNumber(ci.high, 2)} kWh/天`;
}

/**
 * Format recharge recommendation.
 * @param {number} amount - Recommended amount in kWh
 * @param {string} reason - Recommendation reason
 * @returns {string} - Formatted recommendation
 */
export function formatRechargeRecommendation(amount, reason) {
    if (!amount || amount <= 0) {
        return '暂无充值建议';
    }
    return `建议充值 ${formatConsumption(amount)} (覆盖7天)\n${reason || ''}`;
}

// ============================================================================
// Prediction Display Components
// ============================================================================

/**
 * Create prediction summary card HTML.
 * @param {Object} prediction - Prediction data
 * @returns {string} - HTML string
 */
export function createPredictionSummaryCard(prediction) {
    if (!prediction) {
        return '<div class="prediction-card"><p class="empty-message">暂无预测数据</p></div>';
    }

    const confidenceClass = prediction.confidence >= 0.9 ? 'high' :
                           prediction.confidence >= 0.7 ? 'medium' : 'low';

    return `
        <div class="prediction-card">
            <h3>消耗预测</h3>
            <div class="prediction-stats">
                <div class="prediction-stat">
                    <span class="stat-label">日均消耗</span>
                    <span class="stat-value">${formatDailyRate(prediction.daily_rate)}</span>
                </div>
                <div class="prediction-stat">
                    <span class="stat-label">预计可用</span>
                    <span class="stat-value depletion-days">${formatDaysUntilDepletion(prediction.days_until_depletion)}</span>
                </div>
                <div class="prediction-stat">
                    <span class="stat-label">置信度</span>
                    <span class="stat-value confidence--${confidenceClass}">${formatConfidence(prediction.confidence)}</span>
                </div>
                <div class="prediction-stat">
                    <span class="stat-label">数据点</span>
                    <span class="stat-value">${prediction.data_points_used || '--'} 天</span>
                </div>
            </div>
            ${prediction.confidence_interval ? `
            <div class="prediction-ci">
                <span class="ci-label">95% 置信区间:</span>
                <span class="ci-value">${formatConfidenceInterval(prediction.confidence_interval)}</span>
            </div>
            ` : ''}
        </div>
    `;
}

/**
 * Create recharge recommendation card HTML.
 * @param {Object} prediction - Prediction data
 * @returns {string} - HTML string
 */
export function createRechargeRecommendationCard(prediction) {
    if (!prediction || !shouldDisplayPrediction(prediction)) {
        return '<div class="recharge-recommendation"><p>数据不足，无法提供充值建议</p></div>';
    }

    const days = prediction.days_until_depletion;
    const amount = prediction.recommended_recharge;
    const reason = prediction.recharge_recommendation_reason || '';

    let urgencyClass = 'low';
    let urgencyIcon = '🟢';

    if (days <= 7) {
        urgencyClass = 'critical';
        urgencyIcon = '🔴';
    } else if (days <= 14) {
        urgencyClass = 'high';
        urgencyIcon = '🟠';
    } else if (days <= 21) {
        urgencyClass = 'medium';
        urgencyIcon = '🟡';
    }

    return `
        <div class="recharge-recommendation urgency--${urgencyClass}">
            <div class="recommendation-header">
                <span class="urgency-icon">${urgencyIcon}</span>
                <span class="recommendation-title">充值建议</span>
            </div>
            ${amount ? `
            <div class="recommendation-amount">
                建议充值: <strong>${formatConsumption(amount)}</strong>
                <span class="recommendation-note">(覆盖7天)</span>
            </div>
            ` : ''}
            <p class="recommendation-reason">${reason}</p>
        </div>
    `;
}

/**
 * Create day-of-week pattern chart data.
 * @param {Object} pattern - Day pattern object
 * @returns {Object} - Chart data
 */
export function prepareDayOfWeekChartData(pattern) {
    if (!pattern) {
        return { labels: [], values: [] };
    }

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    return {
        labels: dayLabels,
        values: days.map(d => pattern[d] || 0)
    };
}

/**
 * Create day-of-week pattern chart HTML.
 * @param {Object} pattern - Day pattern object
 * @returns {string} - HTML string
 */
export function createDayOfWeekPatternCard(pattern) {
    if (!pattern) {
        return '<div class="pattern-card"><p class="empty-message">暂无消耗模式数据</p></div>';
    }

    const chartData = prepareDayOfWeekChartData(pattern);
    const maxValue = Math.max(...chartData.values);
    const avgValue = chartData.values.reduce((a, b) => a + b, 0) / chartData.values.length;

    // Create simple bar visualization
    const bars = chartData.labels.map((label, i) => {
        const value = chartData.values[i];
        const height = maxValue > 0 ? (value / maxValue * 100) : 0;
        const isWeekend = i >= 5;
        const barClass = isWeekend ? 'bar--weekend' : 'bar--weekday';

        return `
            <div class="pattern-bar-container">
                <div class="pattern-bar ${barClass}" style="height: ${height}%;">
                    <span class="bar-value">${value.toFixed(1)}</span>
                </div>
                <span class="bar-label">${label}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="pattern-card">
            <h3>周消耗模式</h3>
            <p class="pattern-summary">
                工作日平均: ${formatNumber(avgValue, 2)} kWh
                | 周末: ${formatNumber((chartData.values[5] + chartData.values[6]) / 2, 2)} kWh
            </p>
            <div class="pattern-chart">
                ${bars}
            </div>
        </div>
    `;
}

// ============================================================================
// Prediction Utilities
// ============================================================================

/**
 * Get prediction urgency level.
 * @param {number} days - Days until depletion
 * @returns {string} - Urgency level (critical/high/medium/low)
 */
export function getPredictionUrgency(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days <= 3) return 'critical';
    if (days <= 7) return 'high';
    if (days <= 14) return 'medium';
    return 'low';
}

/**
 * Get prediction status message.
 * @param {Object} prediction - Prediction data
 * @returns {string} - Status message
 */
export function getPredictionStatus(prediction) {
    if (!prediction) return '暂无预测数据';

    if (!shouldDisplayPrediction(prediction)) {
        return '数据不足，预测可信度较低';
    }

    const days = prediction.days_until_depletion;
    const urgency = getPredictionUrgency(days);

    const messages = {
        critical: `⚠️ 电量即将耗尽，仅剩 ${days} 天！`,
        high: `⚡ 电量偏低，约 ${days} 天后耗尽`,
        medium: `📊 预计可用 ${days} 天`,
        low: `✅ 电量充足，预计可用 ${days} 天`,
        unknown: '无法预测'
    };

    return messages[urgency] || '未知状态';
}

// ============================================================================
// Export
// ============================================================================

export const PredictionModule = {
    // Validation
    shouldDisplayPrediction,
    validatePredictionData,

    // Formatting
    formatDailyRate,
    formatDepletionPrediction,
    formatConfidenceInterval,
    formatRechargeRecommendation,

    // Components
    createPredictionSummaryCard,
    createRechargeRecommendationCard,
    createDayOfWeekPatternCard,
    prepareDayOfWeekChartData,

    // Utilities
    getPredictionUrgency,
    getPredictionStatus,
};

export default PredictionModule;
