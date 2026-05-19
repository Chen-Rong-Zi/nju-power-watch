/**
 * Warning System Module
 * Smart electricity warning detection and display
 */

// Warning thresholds
const WARNING_THRESHOLDS = {
    RED: { balance: 10, daysUntilEmpty: 0 },
    ORANGE: { balance: Infinity, daysUntilEmpty: 3 },
    YELLOW: { balance: Infinity, daysUntilEmpty: 7 },
    ABNORMAL: { stdDevMultiplier: 2 }
};

// T040: Consumption-based warning thresholds
const CONSUMPTION_THRESHOLDS = {
    HIGH_RATE: 5.0,        // kWh/day - High consumption rate warning
    VERY_HIGH_RATE: 8.0,   // kWh/day - Very high consumption warning
    RAPID_DEPLETION: 3,    // days - Days until depletion for urgent warning
    ANOMALY_Z_SCORE: 2.0   // Z-score threshold for anomaly detection
};

// Store all warnings for filtering
let allWarnings = [];

/**
 * Detect warnings for a room
 */
function detectWarnings(roomData) {
    const warnings = [];
    const balance = roomData.current_balance || 0;
    const balanceHistory = roomData.balance_history || {};

    const dailyConsumption = calculateAvgDailyConsumption(balanceHistory);
    const daysUntilEmpty = dailyConsumption > 0 ? balance / dailyConsumption : Infinity;

    // Red warning
    if (balance < WARNING_THRESHOLDS.RED.balance) {
        warnings.push({
            level: 'red',
            type: 'low-balance',
            title: '余额严重不足',
            message: '当前余额仅 ' + balance.toFixed(1) + ' 度，请尽快充值',
            roomId: roomData.room_id,
            roomName: roomData.room_name,
            value: balance,
            priority: 1
        });
    }

    // Orange warning
    if (daysUntilEmpty <= WARNING_THRESHOLDS.ORANGE.daysUntilEmpty && daysUntilEmpty > 0) {
        warnings.push({
            level: 'orange',
            type: 'soon-empty',
            title: '即将断电',
            message: '预计 ' + Math.floor(daysUntilEmpty) + ' 天后余额不足',
            roomId: roomData.room_id,
            roomName: roomData.room_name,
            value: daysUntilEmpty,
            priority: 2
        });
    }

    // Yellow warning
    if (daysUntilEmpty <= WARNING_THRESHOLDS.YELLOW.daysUntilEmpty && daysUntilEmpty > WARNING_THRESHOLDS.ORANGE.daysUntilEmpty) {
        warnings.push({
            level: 'yellow',
            type: 'warning',
            title: '余额偏低',
            message: '预计 ' + Math.floor(daysUntilEmpty) + ' 天后需要充值',
            roomId: roomData.room_id,
            roomName: roomData.room_name,
            value: daysUntilEmpty,
            priority: 3
        });
    }

    return warnings.sort(function(a, b) { return a.priority - b.priority; });
}

// ============================================================================
// T040: Consumption-Based Warning Detection
// ============================================================================

/**
 * Detect consumption-based warnings for a room.
 * @param {Object} roomData - Room data with consumption records
 * @param {Object} buildingStats - Building statistics for comparison
 * @returns {Array} - Array of consumption warnings
 */
function detectConsumptionWarnings(roomData, buildingStats) {
    const warnings = [];

    // Get prediction data if available
    const prediction = roomData.prediction || {};
    const dailyRate = prediction.daily_rate || 0;
    const daysUntilDepletion = prediction.days_until_depletion || 999;
    const isAnomaly = prediction.is_anomaly || false;
    const zScore = prediction.anomaly_z_score || 0;

    // High consumption rate warning
    if (dailyRate >= CONSUMPTION_THRESHOLDS.VERY_HIGH_RATE) {
        warnings.push({
            level: 'red',
            type: 'high-consumption',
            title: '消耗量异常高',
            message: '日均消耗 ' + dailyRate.toFixed(1) + ' kWh，远超平均水平',
            roomId: roomData.room_id || roomData.roomId,
            roomName: roomData.room_name || roomData.roomName,
            value: dailyRate,
            priority: 1,
            category: 'consumption'
        });
    } else if (dailyRate >= CONSUMPTION_THRESHOLDS.HIGH_RATE) {
        warnings.push({
            level: 'orange',
            type: 'high-consumption',
            title: '消耗量偏高',
            message: '日均消耗 ' + dailyRate.toFixed(1) + ' kWh，建议关注用电',
            roomId: roomData.room_id || roomData.roomId,
            roomName: roomData.room_name || roomData.roomName,
            value: dailyRate,
            priority: 2,
            category: 'consumption'
        });
    }

    // Rapid depletion warning (will run out soon)
    if (daysUntilDepletion <= CONSUMPTION_THRESHOLDS.RAPID_DEPLETION && daysUntilDepletion > 0) {
        warnings.push({
            level: 'red',
            type: 'rapid-depletion',
            title: '电量即将耗尽',
            message: '按当前消耗速度，仅剩 ' + Math.ceil(daysUntilDepletion) + ' 天电量',
            roomId: roomData.room_id || roomData.roomId,
            roomName: roomData.room_name || roomData.roomName,
            value: daysUntilDepletion,
            priority: 1,
            category: 'consumption'
        });
    }

    // Anomaly detection warning
    if (isAnomaly && Math.abs(zScore) >= CONSUMPTION_THRESHOLDS.ANOMALY_Z_SCORE) {
        const direction = zScore > 0 ? '高于' : '低于';
        warnings.push({
            level: Math.abs(zScore) >= 3 ? 'red' : 'orange',
            type: 'anomaly',
            title: '消耗模式异常',
            message: '消耗量 ' + direction + '平均水平 ' + Math.abs(zScore).toFixed(1) + ' 个标准差',
            roomId: roomData.room_id || roomData.roomId,
            roomName: roomData.room_name || roomData.roomName,
            value: zScore,
            priority: 2,
            category: 'consumption'
        });
    }

    return warnings;
}

/**
 * Load consumption-based warnings from building aggregates.
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @returns {Promise<Array>} - Array of consumption warnings
 */
async function loadConsumptionWarnings(campus, building) {
    const warnings = [];

    try {
        const response = await fetch('./database/consumption/building/' + campus + '_' + building + '.json');
        if (!response.ok) return warnings;

        const data = await response.json();
        const anomalyRooms = data.anomaly_rooms || [];

        for (const anomaly of anomalyRooms) {
            const severity = Math.abs(anomaly.z_score) >= 3 ? 'red' : 'orange';
            const direction = anomaly.z_score > 0 ? '高于' : '低于';

            warnings.push({
                level: severity,
                type: 'consumption-anomaly',
                title: '消耗异常房间',
                message: anomaly.room_name + ' 消耗量 ' + direction + '平均 ' + Math.abs(anomaly.z_score).toFixed(1) + 'σ',
                roomId: anomaly.room_id,
                roomName: anomaly.room_name,
                value: anomaly.consumption,
                priority: Math.abs(anomaly.z_score) >= 3 ? 1 : 2,
                category: 'consumption',
                campus: campus,
                building: building
            });
        }
    } catch (error) {
        console.error('Error loading consumption warnings:', error);
    }

    return warnings;
}

/**
 * Create consumption warning card HTML.
 * @param {Object} warning - Warning object
 * @returns {string} - HTML string
 */
function createConsumptionWarningCard(warning) {
    const levelClass = 'warning-card ' + warning.level;
    const levelLabels = { red: '紧急', orange: '警告', yellow: '提醒' };

    return '<div class="' + levelClass + '" data-room-id="' + warning.roomId + '">' +
        '<div class="warning-header">' +
            '<span class="warning-badge ' + warning.level + '">' + (levelLabels[warning.level] || warning.level) + '</span>' +
            '<span class="warning-room">' + warning.roomName + '</span>' +
        '</div>' +
        '<div class="warning-title">' + warning.title + '</div>' +
        '<div class="warning-details">' + warning.message + '</div>' +
        (warning.campus ? '<div class="warning-location">' + warning.campus + ' - ' + warning.building + '</div>' : '') +
    '</div>';
}

/**
 * Initialize consumption warnings section.
 * @param {HTMLElement} container - Container element
 */
function initConsumptionWarningsSection(container) {
    const section = document.createElement('div');
    section.className = 'consumption-warnings-section';
    section.innerHTML =
        '<h3 style="margin-bottom: 15px;">⚡ 消耗量预警</h3>' +
        '<p style="color: #666; margin-bottom: 15px;">基于消耗数据分析的异常提醒</p>' +
        '<div id="consumption-warnings-list"></div>';

    container.appendChild(section);

    // Load consumption warnings from all buildings
    loadAllConsumptionWarnings();
}

/**
 * Load consumption warnings from all campuses and buildings.
 */
async function loadAllConsumptionWarnings() {
    const listEl = document.getElementById('consumption-warnings-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载消耗预警...</p></div>';

    const allWarnings = [];

    try {
        // Load overview to get all campuses
        const overviewResp = await fetch('./database/consumption/overview.json');
        if (!overviewResp.ok) {
            listEl.innerHTML = '<p class="empty-message">暂无消耗数据</p>';
            return;
        }

        const overview = await overviewResp.json();
        const campuses = overview.campuses || [];

        // Load warnings from each campus
        for (const campusSummary of campuses) {
            const campusResp = await fetch('./database/consumption/campus/' + encodeURIComponent(campusSummary.campus_name) + '.json');
            if (!campusResp.ok) continue;

            const campusData = await campusResp.json();
            const buildings = campusData.buildings || [];

            // Check buildings with high anomaly count
            for (const building of buildings) {
                if (building.anomaly_count > 0) {
                    const buildingWarnings = await loadConsumptionWarnings(
                        campusSummary.campus_name,
                        building.building_name
                    );
                    allWarnings.push(...buildingWarnings);
                }
            }
        }

        // Sort by priority
        allWarnings.sort((a, b) => a.priority - b.priority);

        // Render warnings
        if (allWarnings.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>所有房间消耗正常</p></div>';
            return;
        }

        listEl.innerHTML = '';
        allWarnings.slice(0, 20).forEach(warning => {
            const cardDiv = document.createElement('div');
            cardDiv.innerHTML = createConsumptionWarningCard(warning);
            listEl.appendChild(cardDiv.firstElementChild);
        });

        // Add summary
        const summary = document.createElement('p');
        summary.style.cssText = 'color: #666; font-size: 0.85rem; margin-top: 15px;';
        summary.textContent = '共发现 ' + allWarnings.length + ' 个消耗异常房间';
        listEl.appendChild(summary);

    } catch (error) {
        console.error('Error loading consumption warnings:', error);
        listEl.innerHTML = '<p class="error">加载消耗预警失败</p>';
    }
}

/**
 * Calculate average daily consumption
 */
function calculateAvgDailyConsumption(balanceHistory) {
    const dates = Object.keys(balanceHistory).sort();
    if (dates.length < 2) return 0;

    const first = balanceHistory[dates[0]];
    const last = balanceHistory[dates[dates.length - 1]];
    const days = dates.length - 1;
    const consumption = first - last;

    return consumption > 0 ? consumption / days : 0;
}

/**
 * Create warning card HTML
 */
function createWarningCard(warning) {
    const card = document.createElement('div');
    card.className = 'warning-card ' + warning.level;
    card.dataset.roomId = warning.roomId;

    card.innerHTML =
        '<div class="warning-header">' +
            '<span class="warning-badge ' + warning.level + '">' + getLevelLabel(warning.level) + '</span>' +
            '<span class="warning-room">' + warning.roomName + '</span>' +
        '</div>' +
        '<div class="warning-title">' + warning.title + '</div>' +
        '<div class="warning-details">' + warning.message + '</div>' +
        '<div class="warning-location">' + warning.campus + ' - ' + warning.building + '</div>';

    return card;
}

function getLevelLabel(level) {
    const labels = { red: '紧急', orange: '警告', yellow: '提醒' };
    return labels[level] || level;
}

/**
 * Filter warnings by level
 */
function filterWarnings(level) {
    if (!allWarnings) return;

    var filtered = level === 'all' ? allWarnings : allWarnings.filter(function(w) {
        return w.level === level;
    });
    renderWarnings(filtered);
}

/**
 * Render warnings list
 */
function renderWarnings(warnings) {
    var listEl = document.getElementById('warning-list');
    if (!listEl) return;

    if (warnings.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>暂无预警信息，所有宿舍电量正常</p></div>';
        return;
    }

    listEl.innerHTML = '';
    warnings.forEach(function(warning) {
        listEl.appendChild(createWarningCard(warning));
    });
}

/**
 * Load warnings data
 */
async function loadWarningsData() {
    var listEl = document.getElementById('warning-list');
    var statsEl = document.getElementById('warning-stats');

    if (!listEl) return;

    try {
        var overviewResp = await fetch('./database/summaries/overview.json');
        var overview = await overviewResp.json();

        allWarnings = [];
        var campuses = Object.keys(overview.campuses);

        for (var i = 0; i < campuses.length; i++) {
            var campus = campuses[i];

            try {
                var campusResp = await fetch('./database/summaries/campuses/' + campus + '/summary.json');
                var campusData = await campusResp.json();

                var buildings = Object.keys(campusData.buildings || {});

                for (var j = 0; j < buildings.length; j++) {
                    var building = buildings[j];

                    try {
                        var buildingResp = await fetch('./database/summaries/campuses/' + campus + '/buildings/' + building + '/summary.json');
                        var buildingData = await buildingResp.json();

                        var rooms = buildingData.rooms || {};
                        var roomIds = Object.keys(rooms);

                        // 只扫描部分房间（最多20间）以提高速度
                        var sampleRooms = roomIds.slice(0, 20);

                        for (var k = 0; k < sampleRooms.length; k++) {
                            var roomId = sampleRooms[k];
                            var roomInfo = rooms[roomId];

                            // 使用房间摘要数据检测预警
                            var balance = roomInfo.current_balance || 0;

                            if (balance < WARNING_THRESHOLDS.RED.balance) {
                                allWarnings.push({
                                    level: 'red',
                                    type: 'low-balance',
                                    title: '余额严重不足',
                                    message: '当前余额仅 ' + balance.toFixed(1) + ' 度',
                                    roomId: roomId,
                                    roomName: roomInfo.room_name,
                                    value: balance,
                                    priority: 1,
                                    campus: campus,
                                    building: building
                                });
                            } else if (balance < 30) {
                                allWarnings.push({
                                    level: 'yellow',
                                    type: 'low-balance',
                                    title: '余额偏低',
                                    message: '当前余额 ' + balance.toFixed(1) + ' 度',
                                    roomId: roomId,
                                    roomName: roomInfo.room_name,
                                    value: balance,
                                    priority: 3,
                                    campus: campus,
                                    building: building
                                });
                            }
                        }
                    } catch (e) {
                        // Skip building errors
                    }
                }
            } catch (e) {
                // Skip campus errors
            }
        }

        // Sort by priority
        allWarnings.sort(function(a, b) { return a.priority - b.priority; });

        // Update stats
        var redCount = allWarnings.filter(function(w) { return w.level === 'red'; }).length;
        var orangeCount = allWarnings.filter(function(w) { return w.level === 'orange'; }).length;
        var yellowCount = allWarnings.filter(function(w) { return w.level === 'yellow'; }).length;

        if (statsEl) {
            statsEl.innerHTML =
                '<div class="dashboard-stats">' +
                    '<div class="dashboard-stat warning">' +
                        '<div class="stat-icon">🔴</div>' +
                        '<div class="stat-label">紧急</div>' +
                        '<div class="stat-value">' + redCount + '</div>' +
                    '</div>' +
                    '<div class="dashboard-stat">' +
                        '<div class="stat-icon">🟠</div>' +
                        '<div class="stat-label">警告</div>' +
                        '<div class="stat-value">' + orangeCount + '</div>' +
                    '</div>' +
                    '<div class="dashboard-stat">' +
                        '<div class="stat-icon">🟡</div>' +
                        '<div class="stat-label">提醒</div>' +
                        '<div class="stat-value">' + yellowCount + '</div>' +
                    '</div>' +
                '</div>';
        }

        renderWarnings(allWarnings);

    } catch (error) {
        console.error('Error loading warnings:', error);
        listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>加载预警数据失败</p></div>';
    }
}

/**
 * Initialize warnings page content
 */
function initWarningsPageContent(container) {
    container.innerHTML =
        '<div class="page-container">' +
            '<div class="page-header">' +
                '<h2>⚠️ 预警中心</h2>' +
                '<p>监控宿舍电量异常情况，及时提醒充值</p>' +
            '</div>' +

            '<div class="filter-controls">' +
                '<button class="btn active" data-filter="all">全部</button>' +
                '<button class="btn" data-filter="red">🔴 紧急</button>' +
                '<button class="btn" data-filter="orange">🟠 警告</button>' +
                '<button class="btn" data-filter="yellow">🟡 提醒</button>' +
            '</div>' +

            '<div class="warning-stats" id="warning-stats"></div>' +

            '<div class="warning-list" id="warning-list">' +
                '<div class="loading">' +
                    '<div class="spinner"></div>' +
                    '<p>加载预警数据...</p>' +
                '</div>' +
            '</div>' +

            // T096: Subscription management section
            '<div class="analytics-card" style="margin-top: 30px;">' +
                '<h3>🔔 我的订阅</h3>' +
                '<div id="subscription-management">' +
                    '<p style="color: #666;">选择房间后可订阅预警通知</p>' +
                '</div>' +
            '</div>' +

            // T097: Alert history section
            '<div class="analytics-card" style="margin-top: 20px;">' +
                '<h3>📋 预警历史</h3>' +
                '<div id="alert-history-container">' +
                    '<p style="color: #666;">暂无预警记录</p>' +
                '</div>' +
            '</div>' +
        '</div>';

    // Add filter handlers
    container.querySelectorAll('.filter-controls .btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            container.querySelectorAll('.filter-controls .btn').forEach(function(b) {
                b.classList.remove('active');
            });
            e.target.classList.add('active');
            filterWarnings(e.target.dataset.filter);
        });
    });

    // Load data
    loadWarningsData();
    loadSubscriptionManagement();
    loadAlertHistory();
}

/**
 * T096: Load subscription management UI
 */
function loadSubscriptionManagement() {
    var container = document.getElementById('subscription-management');
    if (!container) return;

    var subscriptions = [];
    if (typeof getAlertSubscriptions === 'function') {
        subscriptions = getAlertSubscriptions();
    }

    if (subscriptions.length === 0) {
        container.innerHTML = '<p style="color: #666;">暂无订阅，请在房间详情页订阅预警</p>';
        return;
    }

    var html = '<div style="display: flex; flex-direction: column; gap: 12px;">';

    subscriptions.forEach(function(sub) {
        html +=
            '<div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 8px;">' +
                '<div>' +
                    '<div style="font-weight: 600;">' + sub.roomName + '</div>' +
                    '<div style="font-size: 0.85rem; color: #666;">' + sub.campus + ' - ' + sub.building + '</div>' +
                '</div>' +
                '<button class="btn" onclick="unsubscribeFromWarnings(\'' + sub.roomId + '\')">取消订阅</button>' +
            '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
}

/**
 * Unsubscribe from warnings
 */
function unsubscribeFromWarnings(roomId) {
    if (typeof removeAlertSubscription === 'function') {
        removeAlertSubscription(roomId);
        loadSubscriptionManagement();
    }
}

/**
 * T097: Load alert history
 */
function loadAlertHistory() {
    var container = document.getElementById('alert-history-container');
    if (!container) return;

    if (typeof createAlertHistoryDisplay === 'function') {
        container.innerHTML = createAlertHistoryDisplay();
    } else {
        container.innerHTML = '<p style="color: #666;">暂无预警记录</p>';
    }
}

// Make functions globally available
window.unsubscribeFromWarnings = unsubscribeFromWarnings;

// Make filterWarnings available globally
window.filterWarnings = filterWarnings;
