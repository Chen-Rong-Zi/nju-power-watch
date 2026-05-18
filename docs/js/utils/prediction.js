/**
 * Prediction Utility Module
 * Forecasting algorithms for electricity consumption
 */

/**
 * Predict days until balance runs out
 * @param {number} currentBalance - Current electricity balance in kWh
 * @param {number} dailyConsumption - Average daily consumption in kWh
 * @returns {Object} Prediction result
 */
function predictDaysUntilEmpty(currentBalance, dailyConsumption) {
    if (dailyConsumption <= 0) {
        return {
            days: Infinity,
            date: null,
            confidence: 'low',
            message: '用电量异常，无法预测'
        };
    }

    const days = Math.floor(currentBalance / dailyConsumption);
    const date = new Date();
    date.setDate(date.getDate() + days);

    let confidence = 'high';
    if (days > 30) confidence = 'medium';

    return {
        days: days,
        date: date.toISOString().split('T')[0],
        confidence: confidence,
        message: `预计${days}天后余额不足`
    };
}

/**
 * Predict future balance for next N days
 * @param {Object} balanceHistory - Historical balance data
 * @param {number} days - Number of days to predict
 * @returns {Array} Array of {date, predictedBalance}
 */
function predictFutureBalance(balanceHistory, days = 7) {
    const dailyConsumption = calculateAvgDailyConsumption(balanceHistory);
    const dates = Object.keys(balanceHistory).sort();
    const lastDate = dates[dates.length - 1];
    const lastBalance = balanceHistory[lastDate];

    const predictions = [];
    let currentPredicted = lastBalance;

    for (let i = 1; i <= days; i++) {
        const nextDate = addDays(lastDate, i);
        currentPredicted = Math.max(0, currentPredicted - dailyConsumption);
        predictions.push({
            date: nextDate,
            predictedBalance: currentPredicted
        });
    }

    return predictions;
}

/**
 * Predict monthly consumption based on historical data
 * @param {Object} balanceHistory - Historical balance data
 * @returns {Object} Monthly prediction
 */
function predictMonthlyConsumption(balanceHistory) {
    const dailyData = getDailyConsumption(balanceHistory);
    if (dailyData.length < 7) {
        return { predicted: null, confidence: 'low', message: '数据不足' };
    }

    // Use recent 30 days or all available
    const recentData = dailyData.slice(-30);
    const avgDaily = recentData.reduce((a, b) => a + b, 0) / recentData.length;

    // Calculate trend
    const trend = calculateTrendSlope(recentData);

    // Predict next month
    const predictedMonthly = avgDaily * 30;
    const upperBound = (avgDaily + trend) * 30;
    const lowerBound = Math.max(0, (avgDaily - trend) * 30);

    let confidence = 'medium';
    if (recentData.length < 14) confidence = 'low';
    else if (recentData.length >= 30) confidence = 'high';

    return {
        predicted: predictedMonthly,
        range: { min: lowerBound, max: upperBound },
        avgDaily: avgDaily,
        trend: trend,
        confidence: confidence,
        daysAnalyzed: recentData.length
    };
}

/**
 * Predict semester cost
 * @param {Object} balanceHistory - Historical balance data
 * @param {number} pricePerKwh - Price per kWh in yuan
 * @param {number} semesterDays - Number of days in semester (default 120)
 * @returns {Object} Cost prediction
 */
function predictSemesterCost(balanceHistory, pricePerKwh = 0.5, semesterDays = 120) {
    const monthlyPred = predictMonthlyConsumption(balanceHistory);

    if (!monthlyPred.predicted) {
        return { total: null, monthly: null, confidence: 'low' };
    }

    const months = semesterDays / 30;
    const predictedTotal = monthlyPred.predicted * months;
    const upperTotal = monthlyPred.range.max * months;
    const lowerTotal = monthlyPred.range.min * months;

    return {
        total: predictedTotal,
        monthly: monthlyPred.predicted,
        range: { min: lowerTotal, max: upperTotal },
        pricePerKwh: pricePerKwh,
        days: semesterDays,
        confidence: monthlyPred.confidence
    };
}

/**
 * Apply seasonal adjustment factor
 * @param {number} baseConsumption - Base daily consumption
 * @param {Date} targetDate - Target date for prediction
 * @returns {number} Adjusted consumption
 */
function applySeasonalAdjustment(baseConsumption, targetDate) {
    const month = targetDate.getMonth(); // 0-11

    // Seasonal factors (based on typical Chinese dorm usage patterns)
    const seasonalFactors = {
        winter: 1.2,    // Dec-Feb: heating
        spring: 0.9,   // Mar-May: moderate
        summer: 1.5,   // Jun-Aug: AC
        autumn: 0.9    // Sep-Nov: moderate
    };

    let factor = 1.0;
    if (month >= 11 || month <= 1) {
        factor = seasonalFactors.winter;
    } else if (month >= 2 && month <= 4) {
        factor = seasonalFactors.spring;
    } else if (month >= 5 && month <= 7) {
        factor = seasonalFactors.summer;
    } else {
        factor = seasonalFactors.autumn;
    }

    return baseConsumption * factor;
}

/**
 * Calculate recharge amount for desired days
 * @param {number} currentBalance - Current balance
 * @param {number} dailyConsumption - Average daily consumption
 * @param {number} desiredDays - Number of days to cover
 * @returns {Object} Recharge calculation
 */
function calculateRechargeForDays(currentBalance, dailyConsumption, desiredDays) {
    if (dailyConsumption <= 0) {
        return { needed: 0, message: '无法计算' };
    }

    const needed = dailyConsumption * desiredDays;
    const recharge = Math.max(0, needed - currentBalance);

    return {
        currentBalance: currentBalance,
        dailyConsumption: dailyConsumption,
        desiredDays: desiredDays,
        needed: Math.ceil(needed),
        rechargeAmount: Math.ceil(recharge),
        coveredDays: currentBalance / dailyConsumption
    };
}

/**
 * Calculate days covered by recharge amount
 * @param {number} currentBalance - Current balance
 * @param {number} rechargeAmount - Amount to recharge
 * @param {number} dailyConsumption - Average daily consumption
 * @returns {Object} Days calculation
 */
function calculateDaysFromRecharge(currentBalance, rechargeAmount, dailyConsumption) {
    if (dailyConsumption <= 0) {
        return { days: 0, message: '无法计算' };
    }

    const totalBalance = currentBalance + rechargeAmount;
    const days = totalBalance / dailyConsumption;

    return {
        currentBalance: currentBalance,
        rechargeAmount: rechargeAmount,
        totalBalance: totalBalance,
        dailyConsumption: dailyConsumption,
        days: Math.floor(days)
    };
}

/**
 * Get optimal recharge suggestion based on patterns
 * @param {Object} balanceHistory - Historical data
 * @param {number} currentBalance - Current balance
 * @returns {Object} Suggestion
 */
function getOptimalRechargeSuggestion(balanceHistory, currentBalance) {
    const dailyConsumption = calculateAvgDailyConsumption(balanceHistory);
    if (dailyConsumption <= 0) {
        return { suggestion: '数据不足', confidence: 'low' };
    }

    // Suggest based on different timeframes
    const suggestions = [
        { days: 7, label: '一周', color: '#f39c12' },
        { days: 14, label: '两周', color: '#3498db' },
        { days: 30, label: '一个月', color: '#27ae60' },
        { days: 60, label: '两个月', color: '#9b59b6' }
    ];

    const results = suggestions.map(s => {
        const calc = calculateRechargeForDays(currentBalance, dailyConsumption, s.days);
        return {
            ...s,
            rechargeAmount: calc.rechargeAmount,
            coveredDays: calc.coveredDays
        };
    });

    // Find best suggestion (30 days if balance is low, otherwise 60)
    const best = currentBalance < 20 ? results[2] : results[3];

    return {
        suggestions: results,
        recommended: best,
        currentBalance: currentBalance,
        dailyConsumption: dailyConsumption,
        confidence: balanceHistory.length > 30 ? 'high' : 'medium'
    };
}

// Helper functions
function calculateAvgDailyConsumption(balanceHistory) {
    const dates = Object.keys(balanceHistory).sort();
    if (dates.length < 2) return 0;

    const first = balanceHistory[dates[0]];
    const last = balanceHistory[dates[dates.length - 1]];
    const days = dates.length - 1;
    const consumption = first - last;

    return consumption > 0 ? consumption / days : 0;
}

function getDailyConsumption(balanceHistory) {
    const dates = Object.keys(balanceHistory).sort();
    const consumption = [];

    for (let i = 1; i < dates.length; i++) {
        consumption.push(balanceHistory[dates[i - 1]] - balanceHistory[dates[i]]);
    }

    return consumption;
}

function calculateTrendSlope(data) {
    if (data.length < 2) return 0;
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += data[i];
        sumXY += i * data[i];
        sumX2 += i * i;
    }

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
}

function addDays(dateStr, days) {
    const date = new Date(
        dateStr.slice(0, 4),
        parseInt(dateStr.slice(4, 6)) - 1,
        dateStr.slice(6, 8)
    );
    date.setDate(date.getDate() + days);

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        predictDaysUntilEmpty,
        predictFutureBalance,
        predictMonthlyConsumption,
        predictSemesterCost,
        applySeasonalAdjustment,
        calculateRechargeForDays,
        calculateDaysFromRecharge,
        getOptimalRechargeSuggestion
    };
}
