/**
 * Pattern Recognition Module
 * Analyze electricity usage patterns and assign labels
 */

// Pattern thresholds
var PATTERN_THRESHOLDS = {
    HIGH_ENERGY: 3.0,        // kWh/day - above this is high energy
    ENERGY_SAVER: 1.5,       // kWh/day - below this is energy saver
    EMPTY_ROOM: 0.3,         // kWh/day - below this suggests empty room
    ABNORMAL_SPIKE: 3.0,     // multiplier for abnormal peak detection
    WEEKEND_RATIO: 1.5       // weekend/weekday ratio for weekend-heavy pattern
};

/**
 * T060-T064: Pattern analysis functions
 */

/**
 * Analyze room usage patterns
 */
function analyzePatterns(roomData) {
    var history = roomData.balance_history || {};
    var dates = Object.keys(history).sort();

    if (dates.length < 7) {
        return { patterns: [], message: '数据不足，需要至少7天数据' };
    }

    var balances = dates.map(function(d) { return history[d]; });
    var consumptions = [];

    // Calculate daily consumption
    for (var i = 1; i < balances.length; i++) {
        consumptions.push(balances[i - 1] - balances[i]);
    }

    var avgConsumption = consumptions.reduce(function(a, b) { return a + b; }, 0) / consumptions.length;
    var stdDev = calculateStdDev(consumptions);

    // Analyze patterns
    var patterns = [];
    var weekdayVsWeekend = analyzeWeekdayWeekend(dates, consumptions);
    var emptyRoom = detectEmptyRoom(consumptions);
    var abnormalPeaks = detectAbnormalPeaks(consumptions, avgConsumption, stdDev);

    // Assign pattern labels
    patterns = assignPatternLabels(avgConsumption, weekdayVsWeekend, emptyRoom, abnormalPeaks);

    return {
        avgConsumption: avgConsumption,
        stdDev: stdDev,
        weekdayVsWeekend: weekdayVsWeekend,
        isEmpty: emptyRoom,
        abnormalPeakCount: abnormalPeaks.length,
        patterns: patterns,
        radarData: generateRadarData(avgConsumption, weekdayVsWeekend, emptyRoom, abnormalPeaks)
    };
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values) {
    if (values.length === 0) return 0;
    var mean = values.reduce(function(a, b) { return a + b; }, 0) / values.length;
    var squaredDiffs = values.map(function(v) { return Math.pow(v - mean, 2); });
    return Math.sqrt(squaredDiffs.reduce(function(a, b) { return a + b; }, 0) / values.length);
}

/**
 * T061: Analyze weekday vs weekend consumption
 */
function analyzeWeekdayWeekend(dates, consumptions) {
    var weekdayTotal = 0;
    var weekdayCount = 0;
    var weekendTotal = 0;
    var weekendCount = 0;

    for (var i = 0; i < consumptions.length; i++) {
        var dateStr = dates[i + 1]; // consumption is between day i and i+1
        if (!dateStr) continue;

        var year = parseInt(dateStr.slice(0, 4));
        var month = parseInt(dateStr.slice(4, 6)) - 1;
        var day = parseInt(dateStr.slice(6, 8));
        var date = new Date(year, month, day);
        var dayOfWeek = date.getDay();

        if (dayOfWeek === 0 || dayOfWeek === 6) {
            weekendTotal += consumptions[i];
            weekendCount++;
        } else {
            weekdayTotal += consumptions[i];
            weekdayCount++;
        }
    }

    var weekdayAvg = weekdayCount > 0 ? weekdayTotal / weekdayCount : 0;
    var weekendAvg = weekendCount > 0 ? weekendTotal / weekendCount : 0;
    var ratio = weekdayAvg > 0 ? weekendAvg / weekdayAvg : 0;

    return {
        weekdayAvg: weekdayAvg,
        weekendAvg: weekendAvg,
        ratio: ratio,
        isWeekendHeavy: ratio > PATTERN_THRESHOLDS.WEEKEND_RATIO,
        isWeekdayHeavy: ratio < (1 / PATTERN_THRESHOLDS.WEEKEND_RATIO)
    };
}

/**
 * T062: Detect empty room (continuous low consumption)
 */
function detectEmptyRoom(consumptions) {
    var lowConsumptionDays = 0;
    var consecutiveLowDays = 0;
    var maxConsecutive = 0;

    for (var i = 0; i < consumptions.length; i++) {
        if (consumptions[i] < PATTERN_THRESHOLDS.EMPTY_ROOM) {
            lowConsumptionDays++;
            consecutiveLowDays++;
            maxConsecutive = Math.max(maxConsecutive, consecutiveLowDays);
        } else {
            consecutiveLowDays = 0;
        }
    }

    var lowRatio = lowConsumptionDays / consumptions.length;

    return {
        lowConsumptionDays: lowConsumptionDays,
        maxConsecutive: maxConsecutive,
        ratio: lowRatio,
        isEmpty: lowRatio > 0.7 || maxConsecutive > 14
    };
}

/**
 * T063: Detect abnormal consumption peaks
 */
function detectAbnormalPeaks(consumptions, avg, stdDev) {
    if (stdDev === 0) return [];

    var peaks = [];
    var threshold = avg + PATTERN_THRESHOLDS.ABNORMAL_SPIKE * stdDev;

    for (var i = 0; i < consumptions.length; i++) {
        if (consumptions[i] > threshold && consumptions[i] > avg * 2) {
            peaks.push({
                index: i,
                value: consumptions[i],
                deviation: (consumptions[i] - avg) / stdDev
            });
        }
    }

    return peaks;
}

/**
 * T064: Assign pattern labels
 */
function assignPatternLabels(avgConsumption, weekdayWeekend, emptyRoom, abnormalPeaks) {
    var labels = [];

    // Empty room check first (highest priority)
    if (emptyRoom.isEmpty) {
        labels.push({ label: '空房间', class: 'empty-room', icon: '🏠', description: '长期低用电，可能无人居住' });
    }

    // Energy level labels
    if (avgConsumption > PATTERN_THRESHOLDS.HIGH_ENERGY) {
        labels.push({ label: '高能耗', class: 'high-energy', icon: '⚡', description: '日均用电' + avgConsumption.toFixed(1) + '度，高于平均水平' });
    } else if (avgConsumption < PATTERN_THRESHOLDS.ENERGY_SAVER) {
        labels.push({ label: '节能模范', class: 'energy-saver', icon: '🌱', description: '日均用电仅' + avgConsumption.toFixed(1) + '度，非常节约' });
    } else {
        labels.push({ label: '用电正常', class: 'average', icon: '📊', description: '日均用电' + avgConsumption.toFixed(1) + '度' });
    }

    // Weekend pattern
    if (weekdayWeekend.isWeekendHeavy) {
        labels.push({ label: '周末活跃', class: 'weekend-heavy', icon: '🎉', description: '周末用电量明显高于工作日' });
    }

    // Abnormal peaks
    if (abnormalPeaks.length > 2) {
        labels.push({ label: '波动较大', class: 'high-energy', icon: '📈', description: '发现' + abnormalPeaks.length + '次异常用电高峰' });
    }

    return labels;
}

/**
 * T065: Generate radar chart data
 */
function generateRadarData(avgConsumption, weekdayWeekend, emptyRoom, abnormalPeaks) {
    // Normalize values to 0-100 scale
    var consumptionScore = Math.min(100, avgConsumption * 20);
    var consistencyScore = 100 - Math.min(100, abnormalPeaks.length * 20);
    var weekdayScore = Math.min(100, weekdayWeekend.weekdayAvg * 25);
    var weekendScore = Math.min(100, weekdayWeekend.weekendAvg * 25);
    var stabilityScore = emptyRoom.isEmpty ? 20 : 80;

    return {
        indicators: [
            { name: '用电量', max: 100 },
            { name: '稳定性', max: 100 },
            { name: '工作日用电', max: 100 },
            { name: '周末用电', max: 100 },
            { name: '规律性', max: 100 }
        ],
        values: [consumptionScore, consistencyScore, weekdayScore, weekendScore, stabilityScore]
    };
}

/**
 * Create pattern display HTML
 */
function createPatternDisplay(roomData) {
    var analysis = analyzePatterns(roomData);

    if (analysis.patterns.length === 0) {
        return '<div class="analytics-card"><p style="color: #666;">' + analysis.message + '</p></div>';
    }

    var html =
        '<div class="analytics-card">' +
            '<h3>🏷️ 用电特征标签</h3>' +
            '<div style="margin-bottom: 20px;">';

    analysis.patterns.forEach(function(pattern) {
        html += '<span class="pattern-badge ' + pattern.class + '">' + pattern.icon + ' ' + pattern.label + '</span>';
    });

    html += '</div>';

    // Pattern descriptions
    html += '<div style="margin-top: 16px; font-size: 0.9rem; color: #666;">';
    analysis.patterns.forEach(function(pattern) {
        html += '<p>• ' + pattern.description + '</p>';
    });
    html += '</div>';

    // Radar chart
    if (analysis.radarData) {
        html += '<div id="pattern-radar-chart" class="radar-chart-container"></div>';
    }

    html += '</div>';

    return html;
}

/**
 * Initialize radar chart using ECharts
 */
function initPatternRadarChart(analysis) {
    if (typeof echarts === 'undefined' || !analysis.radarData) return;

    var container = document.getElementById('pattern-radar-chart');
    if (!container) return;

    var chart = echarts.init(container);

    var option = {
        radar: {
            indicator: analysis.radarData.indicators,
            shape: 'polygon',
            splitNumber: 4,
            axisName: {
                color: '#666'
            },
            splitLine: {
                lineStyle: {
                    color: '#ddd'
                }
            },
            splitArea: {
                show: true,
                areaStyle: {
                    color: ['#f8f9fa', '#fff']
                }
            }
        },
        series: [{
            type: 'radar',
            data: [{
                value: analysis.radarData.values,
                name: '用电特征',
                areaStyle: {
                    color: 'rgba(102, 126, 234, 0.3)'
                },
                lineStyle: {
                    color: '#667eea',
                    width: 2
                },
                itemStyle: {
                    color: '#667eea'
                }
            }]
        }]
    };

    chart.setOption(option);

    window.addEventListener('resize', function() {
        chart.resize();
    });
}
