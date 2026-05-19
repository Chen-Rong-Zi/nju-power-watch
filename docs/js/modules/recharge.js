/**
 * Recharge Suggestion Module
 * Smart recharge amount suggestions based on consumption patterns
 */

// Seasonal adjustment factors (higher in summer for AC usage)
var SEASONAL_FACTORS = {
    1: 0.9,   // January - winter break
    2: 0.8,   // February - winter break
    3: 1.0,   // March
    4: 1.0,   // April
    5: 1.1,   // May - warming up
    6: 1.3,   // June - AC usage starts
    7: 1.5,   // July - peak summer
    8: 1.5,   // August - peak summer
    9: 1.3,   // September - still warm
    10: 1.0,  // October
    11: 0.9,  // November
    12: 0.9   // December
};

/**
 * T052-T056: Recharge suggestion calculation functions
 */

/**
 * Calculate days until empty based on consumption history
 */
function calculateDaysUntilEmpty(currentBalance, balanceHistory) {
    var dailyConsumption = calculateDailyConsumption(balanceHistory);

    if (dailyConsumption <= 0) {
        return { days: Infinity, message: '用电量异常或无数据' };
    }

    var days = Math.floor(currentBalance / dailyConsumption);
    return {
        days: days,
        dailyConsumption: dailyConsumption,
        message: '预计' + days + '天后余额不足'
    };
}

/**
 * Calculate average daily consumption
 */
function calculateDailyConsumption(balanceHistory) {
    var dates = Object.keys(balanceHistory).sort();
    if (dates.length < 2) return 0;

    var firstBalance = balanceHistory[dates[0]];
    var lastBalance = balanceHistory[dates[dates.length - 1]];
    var consumption = firstBalance - lastBalance;
    var days = dates.length - 1;

    return consumption > 0 ? consumption / days : 0;
}

/**
 * T054: Get seasonal adjustment factor for current month
 */
function getSeasonalFactor() {
    var month = new Date().getMonth() + 1;
    return SEASONAL_FACTORS[month] || 1.0;
}

/**
 * T055: Convert recharge amount to estimated days
 */
function convertAmountToDays(amount, dailyConsumption) {
    if (dailyConsumption <= 0) return { days: 0, message: '无法计算' };

    var seasonalFactor = getSeasonalFactor();
    var adjustedConsumption = dailyConsumption * seasonalFactor;
    var days = Math.floor(amount / adjustedConsumption);

    return {
        days: days,
        seasonalFactor: seasonalFactor,
        message: '充值' + amount + '度可用约' + days + '天' +
                 (seasonalFactor > 1 ? ' (夏季用电高峰，建议多充)' : '')
    };
}

/**
 * T056: Convert desired days to recharge amount
 */
function convertDaysToAmount(days, dailyConsumption) {
    if (dailyConsumption <= 0 || days <= 0) return { amount: 0, message: '无法计算' };

    var seasonalFactor = getSeasonalFactor();
    var adjustedConsumption = dailyConsumption * seasonalFactor;
    var amount = Math.ceil(days * adjustedConsumption);

    // Round up to nearest 10
    amount = Math.ceil(amount / 10) * 10;

    return {
        amount: amount,
        seasonalFactor: seasonalFactor,
        message: '需要充值约' + amount + '度' +
                 (seasonalFactor > 1 ? ' (已考虑夏季用电高峰)' : '')
    };
}

/**
 * Generate recharge suggestions for a room
 */
function generateRechargeSuggestions(currentBalance, balanceHistory) {
    var dailyConsumption = calculateDailyConsumption(balanceHistory);
    var daysUntilEmpty = calculateDaysUntilEmpty(currentBalance, balanceHistory);
    var seasonalFactor = getSeasonalFactor();

    // Suggest amounts for different durations
    var suggestions = [
        { days: 7, label: '一周' },
        { days: 14, label: '两周' },
        { days: 30, label: '一个月' },
        { days: 60, label: '两个月' }
    ].map(function(s) {
        var result = convertDaysToAmount(s.days, dailyConsumption);
        return {
            label: s.label,
            days: s.days,
            amount: result.amount
        };
    });

    return {
        currentBalance: currentBalance,
        dailyConsumption: dailyConsumption,
        daysUntilEmpty: daysUntilEmpty.days,
        seasonalFactor: seasonalFactor,
        isSummer: seasonalFactor > 1.1,
        suggestions: suggestions
    };
}

/**
 * Create recharge suggestion card HTML
 */
function createRechargeCard(roomData) {
    var balance = roomData.current_balance || 0;
    var history = roomData.balance_history || {};

    var suggestions = generateRechargeSuggestions(balance, history);

    if (suggestions.dailyConsumption <= 0) {
        return '<div class="recharge-card"><p style="color: #666;">用电数据不足，无法提供建议</p></div>';
    }

    var html =
        '<div class="recharge-card">' +
            '<h3 style="margin-bottom: 16px; color: #667eea;">💡 智能充值建议</h3>' +
            '<div style="margin-bottom: 16px;">' +
                '<p><strong>当前余额:</strong> ' + balance.toFixed(1) + ' 度</p>' +
                '<p><strong>日均消耗:</strong> ' + suggestions.dailyConsumption.toFixed(2) + ' 度/天</p>' +
                '<p><strong>预计可用:</strong> ' + (suggestions.daysUntilEmpty === Infinity ? '未知' : suggestions.daysUntilEmpty + ' 天') + '</p>' +
                (suggestions.isSummer ? '<p style="color: #f39c12;">☀️ 夏季用电高峰期，建议增加充值量</p>' : '') +
            '</div>' +

            '<div class="recharge-input-group">' +
                '<div>' +
                    '<label>输入充值金额(度):</label><br>' +
                    '<input type="number" id="recharge-amount-input" placeholder="如100" min="10" max="1000" step="10">' +
                '</div>' +
                '<div>' +
                    '<label>或输入目标天数:</label><br>' +
                    '<input type="number" id="recharge-days-input" placeholder="如30" min="1" max="180">' +
                '</div>' +
            '</div>' +

            '<div id="recharge-result" class="recharge-result" style="display: none;"></div>' +

            '<h4 style="margin: 20px 0 12px; color: #333;">推荐充值方案</h4>' +
            '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';

    suggestions.suggestions.forEach(function(s) {
        html += '<button class="btn" onclick="selectRechargeAmount(' + s.amount + ')" style="font-size: 0.85rem;">' +
                s.label + ': ' + s.amount + '度</button>';
    });

    html += '</div></div>';

    return html;
}

/**
 * Select recharge amount and show result
 */
function selectRechargeAmount(amount) {
    var daysInput = document.getElementById('recharge-days-input');
    var amountInput = document.getElementById('recharge-amount-input');
    var resultDiv = document.getElementById('recharge-result');

    if (amountInput) amountInput.value = amount;
    if (daysInput) daysInput.value = '';

    if (resultDiv && typeof state !== 'undefined' && state.roomData) {
        var dailyConsumption = calculateDailyConsumption(state.roomData.balance_history || {});
        var result = convertAmountToDays(amount, dailyConsumption);

        resultDiv.style.display = 'block';
        resultDiv.innerHTML =
            '<strong>' + amount + '度</strong> 可用约 <strong>' + result.days + '天</strong><br>' +
            '<span style="font-size: 0.85rem; color: #666;">' + result.message + '</span>';
    }
}

// Make function available globally
window.selectRechargeAmount = selectRechargeAmount;

// ============================================================================
// T023: Consumption-based Recharge Display Utilities
// ============================================================================

/**
 * Format recharge event for display in consumption perspective.
 * @param {Object} event - Recharge event object
 * @returns {string} - Formatted string
 */
function formatRechargeEventForConsumption(event) {
    if (!event) return '无充值记录';

    var amount = (event.recharge_amount || 0).toFixed(1) + ' kWh';
    var date = event.estimated_date || '未知日期';
    var confidence = formatRechargeConfidence(event.confidence);

    return date + ': ' + amount + ' (' + confidence + ')';
}

/**
 * Format confidence level for display.
 * @param {string} confidence - Confidence level (high/medium/low)
 * @returns {string} - Formatted confidence string
 */
function formatRechargeConfidence(confidence) {
    var labels = {
        high: '高置信度',
        medium: '中置信度',
        low: '低置信度'
    };
    return labels[confidence] || '未知';
}

/**
 * Calculate recharge statistics from events.
 * @param {Object[]} events - Array of recharge events
 * @returns {Object} - Statistics object
 */
function calculateRechargeStatsFromEvents(events) {
    if (!events || events.length === 0) {
        return {
            total: 0,
            count: 0,
            average: 0,
            lastRecharge: null
        };
    }

    var total = 0;
    for (var i = 0; i < events.length; i++) {
        total += events[i].recharge_amount || 0;
    }

    var count = events.length;
    var average = total / count;

    // Sort by date descending
    var sorted = events.slice().sort(function(a, b) {
        return (b.estimated_date || '').localeCompare(a.estimated_date || '');
    });

    return {
        total: total,
        count: count,
        average: average,
        lastRecharge: sorted[0] || null,
        firstRecharge: sorted[sorted.length - 1] || null
    };
}

/**
 * Create recharge history table HTML for consumption perspective.
 * @param {Object[]} events - Recharge events
 * @param {number} limit - Maximum rows to show
 * @returns {string} - HTML string
 */
function createConsumptionRechargeTable(events, limit) {
    limit = limit || 10;
    if (!events || events.length === 0) {
        return '<p class="empty-message">暂无充值记录</p>';
    }

    var sorted = events.slice()
        .sort(function(a, b) {
            return (b.estimated_date || '').localeCompare(a.estimated_date || '');
        })
        .slice(0, limit);

    var rows = '';
    for (var i = 0; i < sorted.length; i++) {
        var event = sorted[i];
        var date = event.estimated_date || '--';
        var amount = (event.recharge_amount || 0).toFixed(1);
        var balanceBefore = (event.balance_before || 0).toFixed(1);
        var balanceAfter = (event.balance_after || 0).toFixed(1);
        var confidenceClass = 'confidence--' + (event.confidence || 'low');

        rows += '<tr class="recharge-row">' +
            '<td class="date-cell">' + date + '</td>' +
            '<td class="amount-cell">' + amount + ' kWh</td>' +
            '<td class="balance-cell">' + balanceBefore + ' → ' + balanceAfter + '</td>' +
            '<td class="confidence-cell"><span class="confidence-badge ' + confidenceClass + '">' +
                formatRechargeConfidence(event.confidence) + '</span></td>' +
        '</tr>';
    }

    return '<table class="recharge-table">' +
        '<thead><tr><th>日期</th><th>充值量</th><th>余额变化</th><th>置信度</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>';
}

/**
 * Create recharge summary card HTML for consumption perspective.
 * @param {Object} stats - Recharge statistics
 * @returns {string} - HTML string
 */
function createConsumptionRechargeSummaryCard(stats) {
    if (!stats || stats.count === 0) {
        return '<div class="recharge-summary-card">' +
            '<h3>充值统计</h3>' +
            '<p class="empty-message">暂无充值记录</p>' +
        '</div>';
    }

    var lastRechargeHtml = '';
    if (stats.lastRecharge) {
        lastRechargeHtml = '<div class="summary-stat">' +
            '<span class="stat-label">最近充值</span>' +
            '<span class="stat-value">' + (stats.lastRecharge.estimated_date || '--') + '</span>' +
        '</div>';
    }

    return '<div class="recharge-summary-card">' +
        '<h3>充值统计</h3>' +
        '<div class="summary-stats">' +
            '<div class="summary-stat">' +
                '<span class="stat-label">总充值量</span>' +
                '<span class="stat-value">' + stats.total.toFixed(1) + ' kWh</span>' +
            '</div>' +
            '<div class="summary-stat">' +
                '<span class="stat-label">充值次数</span>' +
                '<span class="stat-value">' + stats.count + ' 次</span>' +
            '</div>' +
            '<div class="summary-stat">' +
                '<span class="stat-label">平均充值</span>' +
                '<span class="stat-value">' + stats.average.toFixed(1) + ' kWh</span>' +
            '</div>' +
            lastRechargeHtml +
        '</div>' +
    '</div>';
}

// Export for ES6 modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateDaysUntilEmpty: calculateDaysUntilEmpty,
        calculateDailyConsumption: calculateDailyConsumption,
        generateRechargeSuggestions: generateRechargeSuggestions,
        createRechargeCard: createRechargeCard,
        // New consumption-based functions
        formatRechargeEventForConsumption: formatRechargeEventForConsumption,
        formatRechargeConfidence: formatRechargeConfidence,
        calculateRechargeStatsFromEvents: calculateRechargeStatsFromEvents,
        createConsumptionRechargeTable: createConsumptionRechargeTable,
        createConsumptionRechargeSummaryCard: createConsumptionRechargeSummaryCard
    };
}
