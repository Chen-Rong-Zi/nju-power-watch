/**
 * Cost Prediction Module
 * Monthly and semester electricity cost prediction
 */

/**
 * T080-T089: Cost prediction implementation
 */

/**
 * Calculate monthly cost prediction
 */
function calculateMonthlyCost(roomData, pricePerKwh) {
    pricePerKwh = pricePerKwh || 0.5; // Default 0.5 yuan/kWh

    var history = roomData.balance_history || {};
    var dates = Object.keys(history).sort();

    if (dates.length < 7) {
        return { error: '数据不足，需要至少7天数据' };
    }

    // Calculate daily consumption
    var totalConsumption = history[dates[0]] - history[dates[dates.length - 1]];
    var days = dates.length - 1;
    var dailyAvg = totalConsumption > 0 ? totalConsumption / days : 0;

    // Monthly prediction
    var monthlyConsumption = dailyAvg * 30;
    var monthlyCost = monthlyConsumption * pricePerKwh;

    // Trend analysis
    var recentDates = dates.slice(-7);
    var recentConsumption = history[recentDates[0]] - history[recentDates[recentDates.length - 1]];
    var recentDailyAvg = recentConsumption > 0 ? recentConsumption / (recentDates.length - 1) : dailyAvg;

    var trend = 'stable';
    if (recentDailyAvg > dailyAvg * 1.2) trend = 'increasing';
    else if (recentDailyAvg < dailyAvg * 0.8) trend = 'decreasing';

    return {
        dailyAvg: dailyAvg,
        monthlyConsumption: monthlyConsumption,
        monthlyCost: monthlyCost,
        pricePerKwh: pricePerKwh,
        trend: trend,
        confidence: dates.length > 30 ? 'high' : (dates.length > 14 ? 'medium' : 'low')
    };
}

/**
 * Calculate semester cost prediction
 */
function calculateSemesterCost(roomData, pricePerKwh, semesterDays) {
    semesterDays = semesterDays || 120; // Default 4 months
    pricePerKwh = pricePerKwh || 0.5;

    var monthly = calculateMonthlyCost(roomData, pricePerKwh);

    if (monthly.error) return monthly;

    var months = semesterDays / 30;
    var semesterCost = monthly.monthlyCost * months;
    var semesterConsumption = monthly.monthlyConsumption * months;

    return {
        dailyAvg: monthly.dailyAvg,
        monthlyCost: monthly.monthlyCost,
        monthlyConsumption: monthly.monthlyConsumption,
        semesterCost: semesterCost,
        semesterConsumption: semesterConsumption,
        semesterDays: semesterDays,
        pricePerKwh: pricePerKwh,
        confidence: monthly.confidence
    };
}

/**
 * Generate energy saving suggestions
 */
function generateSavingSuggestions(roomData) {
    var history = roomData.balance_history || {};
    var dates = Object.keys(history).sort();

    if (dates.length < 7) {
        return [];
    }

    var suggestions = [];
    var totalConsumption = history[dates[0]] - history[dates[dates.length - 1]];
    var days = dates.length - 1;
    var dailyAvg = totalConsumption > 0 ? totalConsumption / days : 0;

    // High consumption warning
    if (dailyAvg > 5) {
        suggestions.push({
            icon: '⚡',
            title: '高能耗提醒',
            description: '日均用电' + dailyAvg.toFixed(1) + '度，建议检查大功率电器使用情况',
            potentialSaving: dailyAvg * 0.3 * 30 * 0.5 // 30% reduction * 30 days * price
        });
    }

    // AC usage in summer
    var month = new Date().getMonth() + 1;
    if (month >= 6 && month <= 9 && dailyAvg > 3) {
        suggestions.push({
            icon: '🌡️',
            title: '空调使用建议',
            description: '夏季用电高峰，建议空调温度设置在26°C，可节省约20%电费',
            potentialSaving: dailyAvg * 0.2 * 30 * 0.5
        });
    }

    // General tips
    suggestions.push({
        icon: '💡',
        title: '随手关灯',
        description: '养成随手关灯、拔掉不用的电器插头的习惯',
        potentialSaving: 5 * 30 * 0.5
    });

    suggestions.push({
        icon: '🔌',
        title: '避免待机耗电',
        description: '电器待机也会耗电，长时间不使用请完全断电',
        potentialSaving: 3 * 30 * 0.5
    });

    return suggestions;
}

/**
 * Create cost prediction card HTML
 */
function createCostPredictionCard(roomData) {
    var prediction = calculateMonthlyCost(roomData, 0.5);

    if (prediction.error) {
        return '<div class="cost-card"><p style="color: rgba(255,255,255,0.8);">' + prediction.error + '</p></div>';
    }

    var html =
        '<div class="cost-card">' +
            '<h3 style="margin-bottom: 16px;">💰 电费预估</h3>' +

            '<div class="cost-input">' +
                '<label>电价 (元/度):</label>' +
                '<input type="number" id="cost-price-input" value="' + prediction.pricePerKwh + '" step="0.1" min="0.1" max="2" onchange="updateCostPrediction()">' +
            '</div>' +

            '<div class="prediction-result">' +
                '<div style="display: flex; justify-content: space-between; margin-bottom: 12px;">' +
                    '<div>' +
                        '<div style="font-size: 0.85rem; opacity: 0.8;">日均用电</div>' +
                        '<div class="prediction-value">' + prediction.dailyAvg.toFixed(1) + ' 度</div>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size: 0.85rem; opacity: 0.8;">月均费用</div>' +
                        '<div class="prediction-value">¥' + prediction.monthlyCost.toFixed(0) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div style="font-size: 0.85rem; opacity: 0.8;">' +
                    '趋势: ' + (prediction.trend === 'increasing' ? '📈 上升' :
                               prediction.trend === 'decreasing' ? '📉 下降' : '➡️ 稳定') +
                '</div>' +
            '</div>';

    // Semester prediction
    var semester = calculateSemesterCost(roomData, prediction.pricePerKwh, 120);
    if (!semester.error) {
        html +=
            '<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.2);">' +
                '<div style="font-size: 0.85rem; opacity: 0.8;">学期预估 (4个月)</div>' +
                '<div style="font-size: 1.5rem; font-weight: bold;">¥' + semester.semesterCost.toFixed(0) + '</div>' +
            '</div>';
    }

    html += '</div>';

    return html;
}

/**
 * Update cost prediction when price changes
 */
function updateCostPrediction() {
    var priceInput = document.getElementById('cost-price-input');
    if (!priceInput || typeof state === 'undefined' || !state.roomData) return;

    var price = parseFloat(priceInput.value) || 0.5;
    var prediction = calculateMonthlyCost(state.roomData, price);
    var semester = calculateSemesterCost(state.roomData, price, 120);

    // Update display (simplified - in production would update DOM directly)
    console.log('Updated prediction:', prediction);
}

/**
 * Create saving suggestions HTML
 */
function createSavingSuggestionsCard(roomData) {
    var suggestions = generateSavingSuggestions(roomData);

    if (suggestions.length === 0) {
        return '';
    }

    var html =
        '<div class="analytics-card" style="margin-top: 20px;">' +
            '<h3>💡 省电建议</h3>';

    suggestions.forEach(function(s) {
        html +=
            '<div style="display: flex; align-items: flex-start; margin-bottom: 16px;">' +
                '<div style="font-size: 1.5rem; margin-right: 12px;">' + s.icon + '</div>' +
                '<div>' +
                    '<div style="font-weight: 600; margin-bottom: 4px;">' + s.title + '</div>' +
                    '<div style="font-size: 0.9rem; color: #666;">' + s.description + '</div>' +
                    (s.potentialSaving ?
                        '<div style="font-size: 0.85rem; color: #27ae60; margin-top: 4px;">' +
                        '预计每月可省: ¥' + s.potentialSaving.toFixed(0) + '</div>' : '') +
                '</div>' +
            '</div>';
    });

    html += '</div>';

    return html;
}

// Make function globally available
window.updateCostPrediction = updateCostPrediction;
