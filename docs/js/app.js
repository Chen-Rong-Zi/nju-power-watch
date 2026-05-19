/**
 * NJU Electricity Data Viewer
 * Adapted for hierarchical aggregation structure
 */

// ==================== Global State ====================
const state = {
    overview: null,
    campusData: {},
    buildingData: {},
    roomData: null,
    chart: null,
    analytics: {
        currentPage: 'home',
        filters: {
            warningLevel: 'all',
            rankingCategory: 'high',
            timeRange: 30
        },
        cached: {}
    },
    subscriptions: [],
    alertHistory: []
};

// API configuration
const API = {
    baseUrl: './database/summaries',

    overviewUrl: function() {
        return `${this.baseUrl}/overview.json`;
    },

    campusUrl: function(campus) {
        return `${this.baseUrl}/campuses/${campus}/summary.json`;
    },

    buildingUrl: function(campus, building) {
        return `${this.baseUrl}/campuses/${campus}/buildings/${building}/summary.json`;
    },

    roomUrl: function(campus, building, roomId) {
        return `${this.baseUrl}/campuses/${campus}/buildings/${building}/rooms/${roomId}.json`;
    }
};

// Utility functions
function $(id) {
    return document.getElementById(id);
}

function show(id) {
    const el = $(id);
    if (el) el.style.display = 'block';
}

function hide(id) {
    const el = $(id);
    if (el) el.style.display = 'none';
}

function showError(message) {
    const el = $('error-message');
    if (el) el.textContent = message;
    show('error');
    setTimeout(() => hide('error'), 5000);
}

function showLoading() {
    show('loading');
}

function hideLoading() {
    hide('loading');
}

// ==================== Router ====================
const Router = {
    routes: {},
    currentRoute: null,

    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    },

    addRoute(path, handler) {
        this.routes[path] = handler;
    },

    navigate(path) {
        window.location.hash = path;
    },

    handleRoute() {
        const hash = window.location.hash.slice(1) || '/';

        // Check for exact match first
        if (this.routes[hash]) {
            this.currentRoute = hash;
            this.routes[hash]();
            return;
        }

        // Check for parameterized routes
        for (const [pattern, handler] of Object.entries(this.routes)) {
            const params = this.matchRoute(pattern, hash);
            if (params) {
                this.currentRoute = hash;
                handler(...params);
                return;
            }
        }

        // No match - redirect to home
        this.navigate('/');
    },

    matchRoute(pattern, hash) {
        const patternParts = pattern.split('/');
        const hashParts = hash.split('/');

        if (patternParts.length !== hashParts.length) {
            return null;
        }

        const params = [];
        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) {
                params.push(hashParts[i]);
            } else if (patternParts[i] !== hashParts[i]) {
                return null;
            }
        }

        return params;
    }
};

// ==================== Data Loading ====================
async function loadOverview() {
    try {
        const response = await fetch(API.overviewUrl());
        if (!response.ok) throw new Error('Failed to load overview');

        const data = await response.json();
        state.overview = data;

        populateCampusSelect(data.campuses);
    } catch (error) {
        console.error('Error loading overview:', error);
        showError('无法加载数据索引，请刷新页面重试');
    }
}

async function loadCampusData(campus) {
    if (state.campusData[campus]) {
        return state.campusData[campus];
    }

    try {
        showLoading();

        const response = await fetch(API.campusUrl(campus));
        if (!response.ok) throw new Error('Failed to load campus data');

        const data = await response.json();
        state.campusData[campus] = data;

        hideLoading();
        return data;
    } catch (error) {
        console.error('Error loading campus data:', error);
        hideLoading();
        showError('无法加载校区数据');
        return null;
    }
}

async function loadBuildingData(campus, building) {
    const cacheKey = `${campus}/${building}`;
    if (state.buildingData[cacheKey]) {
        return state.buildingData[cacheKey];
    }

    try {
        showLoading();

        const response = await fetch(API.buildingUrl(campus, building));
        if (!response.ok) throw new Error('Failed to load building data');

        const data = await response.json();
        state.buildingData[cacheKey] = data;

        hideLoading();
        return data;
    } catch (error) {
        console.error('Error loading building data:', error);
        hideLoading();
        showError('无法加载楼栋数据');
        return null;
    }
}

async function loadRoomData(campus, building, roomId) {
    try {
        showLoading();

        const response = await fetch(API.roomUrl(campus, building, roomId));
        if (!response.ok) throw new Error('Failed to load room data');

        const data = await response.json();

        hideLoading();
        return data;
    } catch (error) {
        console.error('Error loading room data:', error);
        hideLoading();
        showError('无法加载房间数据');
        return null;
    }
}

// ==================== Statistics ====================
function calculateStats(balanceHistory) {
    const dates = Object.keys(balanceHistory).sort();
    const balances = dates.map(d => balanceHistory[d]);

    if (balances.length === 0) return null;

    const current = balances[balances.length - 1];
    const min = Math.min(...balances);
    const max = Math.max(...balances);
    const avg = balances.reduce((a, b) => a + b, 0) / balances.length;

    let dailyConsumption = 0;
    if (balances.length >= 2) {
        const recentBalances = balances.slice(-Math.min(7, balances.length));
        if (recentBalances.length >= 2) {
            const consumption = recentBalances[0] - recentBalances[recentBalances.length - 1];
            dailyConsumption = consumption / (recentBalances.length - 1);
        }
    }

    return {
        current: current,
        min: min,
        max: max,
        avg: avg,
        dailyConsumption: Math.max(0, dailyConsumption),
        days: balances.length
    };
}

function predictEmptyDate(currentBalance, dailyConsumption) {
    if (dailyConsumption <= 0) {
        return { daysUntilEmpty: Infinity, message: '用电量异常，无法预测' };
    }

    const daysUntilEmpty = Math.floor(currentBalance / dailyConsumption);
    const emptyDate = new Date();
    emptyDate.setDate(emptyDate.getDate() + daysUntilEmpty);

    return {
        daysUntilEmpty: daysUntilEmpty,
        emptyDate: emptyDate.toISOString().split('T')[0],
        message: '预计' + daysUntilEmpty + '天后余额不足'
    };
}

// ==================== UI Functions ====================
function formatDateDisplay(dateStr) {
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    return month + '-' + day;
}

function populateCampusSelect(campuses) {
    const select = $('campus-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- 请选择校区 --</option>';

    Object.keys(campuses).forEach(campus => {
        const option = document.createElement('option');
        option.value = campus;
        option.textContent = campus;
        option.dataset.totalRooms = campuses[campus].total_rooms;
        select.appendChild(option);
    });
}

function populateBuildingSelect(campusData) {
    const select = $('building-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- 请选择楼栋 --</option>';
    select.disabled = false;

    Object.keys(campusData.buildings).forEach(building => {
        const option = document.createElement('option');
        option.value = building;
        const info = campusData.buildings[building];
        option.textContent = building + ' (' + info.total_rooms + '间)';
        option.dataset.totalRooms = info.total_rooms;
        select.appendChild(option);
    });
}

function populateRoomSelect(buildingData) {
    const select = $('room-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- 请选择房间 --</option>';
    select.disabled = false;

    const searchInput = $('room-search');
    if (searchInput) {
        searchInput.disabled = false;
        searchInput.value = '';
    }

    Object.entries(buildingData.rooms).forEach(function(entry) {
        const roomId = entry[0];
        const roomInfo = entry[1];
        const option = document.createElement('option');
        option.value = roomId;
        option.textContent = roomInfo.room_name + ' (' + roomInfo.current_balance + '度)';
        option.dataset.name = roomInfo.room_name.toLowerCase();
        option.dataset.balance = roomInfo.current_balance;
        select.appendChild(option);
    });
}

function displayRoomInfo(roomData) {
    const campusEl = $('info-campus');
    const buildingEl = $('info-building');
    const roomEl = $('info-room');
    const recordsEl = $('info-records');

    if (campusEl) campusEl.textContent = roomData.campus;
    if (buildingEl) buildingEl.textContent = roomData.building;
    if (roomEl) roomEl.textContent = roomData.room_name;
    if (recordsEl) recordsEl.textContent = Object.keys(roomData.balance_history).length;

    // T022: Add warning badge indicator based on current balance
    const roomInfoEl = $('room-info');
    if (roomInfoEl) {
        // Remove existing warning badge
        const existingBadge = roomInfoEl.querySelector('.warning-indicator');
        if (existingBadge) existingBadge.remove();

        const balance = roomData.current_balance || Object.values(roomData.balance_history).pop() || 0;
        let warningLevel = null;
        let warningText = null;

        if (balance < 10) {
            warningLevel = 'red';
            warningText = '🔴 紧急: 余额严重不足';
        } else if (balance < 30) {
            warningLevel = 'orange';
            warningText = '🟠 警告: 余额偏低';
        } else if (balance < 50) {
            warningLevel = 'yellow';
            warningText = '🟡 提醒: 注意用电';
        }

        if (warningLevel) {
            const badge = document.createElement('div');
            badge.className = 'warning-indicator warning-badge ' + warningLevel;
            badge.style.cssText = 'margin-top: 15px; padding: 10px 16px; border-radius: 8px; font-size: 0.95rem;';
            badge.textContent = warningText + ' (' + balance.toFixed(1) + '度)';
            roomInfoEl.appendChild(badge);
        }
    }

    // T057/T066: Add recharge suggestions and pattern analysis
    displayAnalyticsCards(roomData);

    show('room-info');
}

/**
 * Display analytics cards (recharge suggestions and patterns)
 */
function displayAnalyticsCards(roomData) {
    // Find or create analytics container
    let analyticsContainer = document.getElementById('analytics-cards-container');

    if (!analyticsContainer) {
        analyticsContainer = document.createElement('section');
        analyticsContainer.id = 'analytics-cards-container';
        analyticsContainer.className = 'analytics-section';
        analyticsContainer.style.cssText = 'margin-top: 30px;';

        // Insert after chart section
        const chartSection = $('chart-section');
        if (chartSection && chartSection.parentNode) {
            chartSection.parentNode.insertBefore(analyticsContainer, chartSection.nextSibling);
        }
    }

    // Clear previous content
    analyticsContainer.innerHTML = '';

    // Check if we have enough data
    const historyLength = Object.keys(roomData.balance_history || {}).length;
    if (historyLength < 7) {
        analyticsContainer.innerHTML = '<p style="color: #666; text-align: center;">需要至少7天数据才能显示智能分析</p>';
        return;
    }

    // Add recharge suggestions card
    if (typeof createRechargeCard === 'function') {
        const rechargeCard = document.createElement('div');
        rechargeCard.innerHTML = createRechargeCard(roomData);
        analyticsContainer.appendChild(rechargeCard.firstElementChild);
    }

    // Add pattern analysis card
    if (typeof createPatternDisplay === 'function') {
        const patternCard = document.createElement('div');
        patternCard.innerHTML = createPatternDisplay(roomData);
        analyticsContainer.appendChild(patternCard.firstElementChild);

        // Initialize radar chart if ECharts is available
        if (typeof analyzePatterns === 'function' && typeof initPatternRadarChart === 'function') {
            const analysis = analyzePatterns(roomData);
            setTimeout(function() {
                initPatternRadarChart(analysis);
            }, 100);
        }
    }

    // T085: Add cost prediction card
    if (typeof createCostPredictionCard === 'function') {
        const costCard = document.createElement('div');
        costCard.innerHTML = createCostPredictionCard(roomData);
        analyticsContainer.appendChild(costCard.firstElementChild);
    }

    // T088: Add saving suggestions
    if (typeof createSavingSuggestionsCard === 'function') {
        const savingCard = document.createElement('div');
        savingCard.innerHTML = createSavingSuggestionsCard(roomData);
        analyticsContainer.appendChild(savingCard.firstElementChild);
    }

    // T095: Add subscription button
    if (typeof createSubscriptionButton === 'function') {
        const subDiv = document.createElement('div');
        subDiv.innerHTML = createSubscriptionButton(
            roomData.campus,
            roomData.building,
            roomData.room_id,
            roomData.room_name
        );
        analyticsContainer.appendChild(subDiv.firstElementChild);
    }

    // T106: Add achievements display
    if (typeof createAchievementsDisplay === 'function') {
        // Load building data for comparison
        loadBuildingDataForAchievements(roomData.campus, roomData.building, roomData);
    }

    // T107: Add challenges display
    if (typeof createChallengesDisplay === 'function') {
        const challengeDiv = document.createElement('div');
        challengeDiv.innerHTML = createChallengesDisplay(roomData);
        analyticsContainer.appendChild(challengeDiv.firstElementChild);
    }
}

/**
 * Load building data for achievements comparison
 */
async function loadBuildingDataForAchievements(campus, building, roomData) {
    try {
        const resp = await fetch('./database/summaries/campuses/' + campus + '/buildings/' + building + '/summary.json');
        const buildingData = await resp.json();

        if (typeof createAchievementsDisplay === 'function') {
            const analyticsContainer = document.getElementById('analytics-cards-container');
            if (analyticsContainer) {
                const achievementDiv = document.createElement('div');
                achievementDiv.innerHTML = createAchievementsDisplay(roomData, buildingData);
                analyticsContainer.appendChild(achievementDiv.firstElementChild);
            }
        }
    } catch (e) {
        console.error('Error loading building data for achievements:', e);
    }
}

/**
 * Display room data on the main page (instead of navigating to room route).
 * This includes the balance chart and consumption analogy/prediction features.
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @param {string} roomId - Room ID
 * @param {boolean} isFromSavedRoom - Whether this is from saved room (skip saving again)
 */
async function displayRoomOnMainPage(campus, building, roomId, isFromSavedRoom) {
    showLoading();

    try {
        // Load room data
        const roomData = await loadRoomData(campus, building, roomId);
        if (!roomData) {
            hideLoading();
            showError('无法加载房间数据');
            return;
        }

        state.roomData = roomData;

        // Display room info and chart
        displayRoomInfo(roomData);
        show('chart-section');
        updateChart(roomData, null);

        // Display consumption analogy and prediction
        await displayConsumptionAnalogy(campus, building, roomId, roomData);

        // Save user room for personalization (if not from saved room)
        if (!isFromSavedRoom) {
            try {
                const userConfig = await import('./modules/user-config.js');
                userConfig.saveUserRoom({
                    campus: campus,
                    building: building,
                    roomId: roomId,
                    roomName: roomData.room_name || roomId
                });
            } catch (e) {
                console.warn('Failed to save user room:', e);
            }
        }

        hideLoading();
    } catch (error) {
        console.error('Error displaying room:', error);
        hideLoading();
        showError('加载房间数据时出错');
    }
}

/**
 * Display consumption analogy and prediction features on the main page.
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @param {string} roomId - Room ID
 * @param {Object} roomData - Room data
 */
async function displayConsumptionAnalogy(campus, building, roomId, roomData) {
    // Find or create consumption analogy container
    let analogyContainer = document.getElementById('consumption-analogy-container');

    if (!analogyContainer) {
        analogyContainer = document.createElement('section');
        analogyContainer.id = 'consumption-analogy-container';
        analogyContainer.className = 'consumption-analogy-section';
        analogyContainer.style.cssText = 'margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 12px;';

        // Insert after chart section
        const chartSection = $('chart-section');
        if (chartSection && chartSection.parentNode) {
            chartSection.parentNode.insertBefore(analogyContainer, chartSection.nextSibling);
        }
    }

    // Clear previous content and show container
    analogyContainer.innerHTML = '';
    analogyContainer.style.display = 'block';

    try {
        // Load consumption modules
        const consumptionModule = await import('./modules/consumption.js');
        const consumptionAnalogyModule = await import('./modules/consumption-analogy.js');
        const predictionModule = await import('./modules/prediction.js');
        const userConfigModule = await import('./modules/user-config.js');

        // Load consumption data
        const consumptionData = await consumptionModule.loadRoomConsumption(roomId, campus, building);
        const predictionData = await consumptionModule.loadRoomPrediction(roomId, campus, building);

        if (!consumptionData || !consumptionData.consumption_history || consumptionData.consumption_history.length === 0) {
            analogyContainer.innerHTML = '<p style="color: #666; text-align: center;">需要更多数据才能显示消耗分析</p>';
            analogyContainer.style.display = 'block';
            return;
        }

        // Get the most recent daily consumption
        const history = consumptionData.consumption_history;
        const latest = history[history.length - 1];
        const latestConsumption = latest.consumption || 0;

        // Get analogy
        const analogy = consumptionAnalogyModule.getConsumptionAnalogy(latestConsumption);
        const formattedAnalogy = consumptionAnalogyModule.formatConsumptionWithAnalogy(latestConsumption);

        // Create consumption analogy banner
        const analogyBanner = document.createElement('div');
        analogyBanner.className = 'consumption-analogy-banner';
        analogyBanner.style.cssText = 'display: flex; align-items: center; gap: 15px; padding: 15px; background: white; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';

        analogyBanner.innerHTML = `
            <div class="analogy-icon" style="font-size: 2.5rem;">${analogy.icon}</div>
            <div class="analogy-content" style="flex: 1;">
                <div class="analogy-label" style="color: #666; font-size: 0.9rem;">今日消耗</div>
                <div class="analogy-value" style="font-size: 1.4rem; font-weight: bold;">
                    <span class="analogy-number">${latestConsumption.toFixed(1)}</span>
                    <span class="analogy-unit" style="font-weight: normal; color: #666;">kWh</span>
                </div>
                <div class="analogy-description" style="color: #333; margin-top: 5px;">${analogy.text}</div>
                <div class="analogy-context" style="color: ${consumptionAnalogyModule.getAnalogyContextLevel(latestConsumption).color}; font-size: 0.85rem; margin-top: 3px;">
                    ${analogy.context} | ${formattedAnalogy}
                </div>
            </div>
        `;

        analogyContainer.appendChild(analogyBanner);

        // Add prediction section if available
        if (predictionData && predictionModule.shouldDisplayPrediction(predictionData)) {
            const predictionSection = document.createElement('div');
            predictionSection.className = 'prediction-section';
            predictionSection.style.cssText = 'background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';

            const daysUntilDepletion = predictionData.days_until_depletion || 0;
            const dailyRate = predictionData.daily_rate || 0;
            const confidence = predictionData.confidence || 0;

            let urgencyClass = 'low';
            let urgencyIcon = '✅';
            let urgencyText = '电量充足';

            if (daysUntilDepletion <= 3) {
                urgencyClass = 'critical';
                urgencyIcon = '🔴';
                urgencyText = '即将耗尽';
            } else if (daysUntilDepletion <= 7) {
                urgencyClass = 'high';
                urgencyIcon = '🟠';
                urgencyText = '电量偏低';
            } else if (daysUntilDepletion <= 14) {
                urgencyClass = 'medium';
                urgencyIcon = '🟡';
                urgencyText = '需要关注';
            }

            predictionSection.innerHTML = `
                <h3 style="margin-bottom: 15px; color: #333;">消耗预测</h3>
                <div class="prediction-stats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px;">
                    <div class="prediction-stat" style="text-align: center;">
                        <div class="stat-label" style="color: #666; font-size: 0.85rem;">日均消耗</div>
                        <div class="stat-value" style="font-size: 1.2rem; font-weight: bold; color: #333;">${dailyRate.toFixed(2)} kWh</div>
                    </div>
                    <div class="prediction-stat" style="text-align: center;">
                        <div class="stat-label" style="color: #666; font-size: 0.85rem;">预计可用</div>
                        <div class="stat-value" style="font-size: 1.2rem; font-weight: bold; color: ${urgencyClass === 'critical' ? '#f44336' : urgencyClass === 'high' ? '#ff9800' : urgencyClass === 'medium' ? '#ffc107' : '#4caf50'};">
                            ${daysUntilDepletion} 天
                        </div>
                    </div>
                    <div class="prediction-stat" style="text-align: center;">
                        <div class="stat-label" style="color: #666; font-size: 0.85rem;">置信度</div>
                        <div class="stat-value" style="font-size: 1.2rem; font-weight: bold; color: ${confidence >= 0.9 ? '#4caf50' : confidence >= 0.7 ? '#2196f3' : '#ff9800'};">
                            ${Math.round(confidence * 100)}%
                        </div>
                    </div>
                    <div class="prediction-stat" style="text-align: center;">
                        <div class="stat-label" style="color: #666; font-size: 0.85rem;">状态</div>
                        <div class="stat-value" style="font-size: 1rem;">
                            ${urgencyIcon} ${urgencyText}
                        </div>
                    </div>
                </div>
            `;

            analogyContainer.appendChild(predictionSection);

            // Add recharge recommendation if balance is low
            const currentBalance = roomData.current_balance || Object.values(roomData.balance_history).pop() || 0;
            if (daysUntilDepletion <= 14 && currentBalance < 100) {
                const recSection = document.createElement('div');
                recSection.className = 'recharge-recommendation-section';
                recSection.style.cssText = 'background: #fff3e0; padding: 15px; border-radius: 8px; border-left: 4px solid #ff9800;';

                const recommendedRecharge = Math.ceil(dailyRate * 7);

                recSection.innerHTML = `
                    <h3 style="margin-bottom: 10px; color: #ff6f00;">充值建议</h3>
                    <p style="margin: 0; color: #333;">
                        建议充值 <strong>${recommendedRecharge} kWh</strong> 以覆盖未来7天的用电需求。
                    </p>
                `;

                analogyContainer.appendChild(recSection);
            }
        }

        // Add day-of-week pattern if available
        if (predictionData && predictionData.day_of_week_pattern) {
            const patternSection = document.createElement('div');
            patternSection.className = 'pattern-section';
            patternSection.style.cssText = 'background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';

            const pattern = predictionData.day_of_week_pattern;
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
            const values = days.map(d => pattern[d] || 0);
            const maxValue = Math.max(...values);

            const bars = dayLabels.map((label, i) => {
                const value = values[i];
                const height = maxValue > 0 ? (value / maxValue * 100) : 0;
                const isWeekend = i >= 5;

                return `
                    <div class="pattern-bar-container" style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                        <div class="pattern-bar" style="width: 100%; height: 80px; background: #f0f0f0; border-radius: 4px; position: relative; display: flex; align-items: flex-end;">
                            <div style="width: 100%; height: ${height}%; background: ${isWeekend ? '#ff9800' : '#667eea'}; border-radius: 4px; transition: height 0.3s ease;"></div>
                        </div>
                        <span class="bar-label" style="font-size: 0.75rem; color: #666; margin-top: 5px;">${label}</span>
                        <span class="bar-value" style="font-size: 0.7rem; color: #999;">${value.toFixed(1)}</span>
                    </div>
                `;
            }).join('');

            patternSection.innerHTML = `
                <h3 style="margin-bottom: 15px; color: #333;">周消耗模式</h3>
                <div class="pattern-chart" style="display: flex; gap: 8px; height: 120px;">
                    ${bars}
                </div>
                <div class="pattern-legend" style="display: flex; justify-content: center; gap: 20px; margin-top: 10px; font-size: 0.85rem; color: #666;">
                    <span><span style="display: inline-block; width: 12px; height: 12px; background: #667eea; border-radius: 2px; margin-right: 5px;"></span>工作日</span>
                    <span><span style="display: inline-block; width: 12px; height: 12px; background: #ff9800; border-radius: 2px; margin-right: 5px;"></span>周末</span>
                </div>
            `;

            analogyContainer.appendChild(patternSection);
        }

    } catch (error) {
        console.error('Error displaying consumption analogy:', error);
        analogyContainer.innerHTML = '<p style="color: #666; text-align: center;">加载消耗分析时出错</p>';
    }
}

/**
 * Hide the consumption analogy section.
 */
function hideConsumptionAnalogySection() {
    const analogyContainer = document.getElementById('consumption-analogy-container');
    if (analogyContainer) {
        analogyContainer.style.display = 'none';
        analogyContainer.innerHTML = '';
    }

    // Also hide analytics cards container
    const analyticsContainer = document.getElementById('analytics-cards-container');
    if (analyticsContainer) {
        analyticsContainer.style.display = 'none';
        analyticsContainer.innerHTML = '';
    }
}

function updateChart(roomData, days) {
    const canvas = $('electricity-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const dates = Object.keys(roomData.balance_history).sort();
    let filteredDates = dates;

    if (days && days < dates.length) {
        filteredDates = dates.slice(-days);
    }

    const labels = filteredDates.map(d => formatDateDisplay(d));
    const balances = filteredDates.map(d => roomData.balance_history[d]);

    if (state.chart) {
        state.chart.destroy();
    }

    state.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '剩余电量 (度)',
                data: balances,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                y: { beginAtZero: false, title: { display: true, text: '电量 (度)' } },
                x: { title: { display: true, text: '日期' } }
            }
        }
    });

    const stats = calculateStats(roomData.balance_history);

    if (stats) {
        const currentEl = $('stat-current');
        const avgEl = $('stat-avg');
        const minEl = $('stat-min');
        const maxEl = $('stat-max');

        if (currentEl) currentEl.textContent = stats.current.toFixed(1) + ' 度';
        if (avgEl) avgEl.textContent = stats.dailyConsumption.toFixed(1) + ' 度/天';
        if (minEl) minEl.textContent = stats.min.toFixed(1) + ' 度';
        if (maxEl) maxEl.textContent = stats.max.toFixed(1) + ' 度';
    }
}

// ==================== Event Handlers ====================
async function onCampusChange() {
    const campus = this.value;

    const buildingSelect = $('building-select');
    const roomSelect = $('room-select');
    const roomSearch = $('room-search');

    if (buildingSelect) {
        buildingSelect.innerHTML = '<option value="">-- 请先选择校区 --</option>';
        buildingSelect.disabled = true;
    }
    if (roomSelect) {
        roomSelect.innerHTML = '<option value="">-- 请先选择楼栋 --</option>';
        roomSelect.disabled = true;
    }
    if (roomSearch) roomSearch.disabled = true;

    hide('room-info');
    hide('chart-section');
    hideConsumptionAnalogySection();

    if (!campus) return;

    const campusData = await loadCampusData(campus);
    if (campusData) {
        populateBuildingSelect(campusData);
    }
}

async function onBuildingChange() {
    const building = this.value;
    const campusSelect = $('campus-select');
    const campus = campusSelect ? campusSelect.value : '';

    const roomSelect = $('room-select');
    const roomSearch = $('room-search');

    if (roomSelect) {
        roomSelect.innerHTML = '<option value="">-- 请选择房间 --</option>';
        roomSelect.disabled = true;
    }
    if (roomSearch) roomSearch.disabled = true;

    hide('room-info');
    hide('chart-section');
    hideConsumptionAnalogySection();

    if (!building || !campus) return;

    const buildingData = await loadBuildingData(campus, building);
    if (buildingData) {
        populateRoomSelect(buildingData);
    }
}

async function onRoomChange() {
    const roomId = this.value;

    if (!roomId) {
        hide('room-info');
        hide('chart-section');
        hideConsumptionAnalogySection();
        return;
    }

    const campusSelect = $('campus-select');
    const buildingSelect = $('building-select');
    const campus = campusSelect ? campusSelect.value : '';
    const building = buildingSelect ? buildingSelect.value : '';

    if (!campus || !building) {
        showError('请先选择校区和楼栋');
        return;
    }

    // Display room data on main page (instead of navigating to room route)
    await displayRoomOnMainPage(campus, building, roomId);
}

function onRoomSearch() {
    const searchTerm = this.value.toLowerCase();
    const roomSelect = $('room-select');
    if (!roomSelect) return;

    const options = roomSelect.options;
    for (let i = 0; i < options.length; i++) {
        const option = options[i];
        if (option.value === '') continue;

        const name = option.dataset.name || '';
        option.style.display = name.includes(searchTerm) ? '' : 'none';
    }
}

function onChartRangeClick(event) {
    const btn = event.target;
    if (!btn.classList.contains('btn')) return;

    document.querySelectorAll('.chart-controls .btn').forEach(function(b) {
        b.classList.remove('active');
    });
    btn.classList.add('active');

    const range = btn.id.replace('btn-', '');
    let days = null;

    if (range === '7d') days = 7;
    else if (range === '30d') days = 30;

    if (state.roomData) {
        updateChart(state.roomData, days);
    }
}

// ==================== Page Handlers ====================

/**
 * T038, T039: Check for saved user room and display on main page.
 * Uses the getUserRoom function from user-config.js module for robust handling.
 * @returns {boolean} - True if room was loaded, false otherwise
 */
async function checkAndRedirectToSavedRoom() {
    try {
        // Dynamically import user-config module for proper handling
        const userConfig = await import('./modules/user-config.js');
        const roomConfig = userConfig.getUserRoom();

        if (roomConfig && roomConfig.campus && roomConfig.building && roomConfig.roomId) {
            // Display saved room on main page (instead of redirecting)
            await displayRoomOnMainPage(roomConfig.campus, roomConfig.building, roomConfig.roomId, true);

            // Update selectors to show the saved room
            const campusSelect = $('campus-select');
            const buildingSelect = $('building-select');
            const roomSelect = $('room-select');

            if (campusSelect) campusSelect.value = roomConfig.campus;

            // Wait for building options to load
            setTimeout(async function() {
                if (buildingSelect) {
                    buildingSelect.value = roomConfig.building;
                    // Trigger change event to load rooms
                    buildingSelect.dispatchEvent(new Event('change'));

                    // Wait for room options to load
                    setTimeout(function() {
                        if (roomSelect) {
                            roomSelect.value = roomConfig.roomId;
                        }
                    }, 500);
                }
            }, 300);

            return true;
        }
    } catch (e) {
        console.warn('Failed to check saved room:', e);
    }
    return false;
}

async function showHomePage() {
    state.analytics.currentPage = 'home';
    updateNavActive('home');

    // T038, T039: Check for saved user room and auto-redirect
    const redirected = await checkAndRedirectToSavedRoom();
    if (redirected) {
        return; // Redirected to room view
    }

    // 隐藏所有动态页面
    document.querySelectorAll('[id^="page-"]').forEach(function(p) {
        p.style.display = 'none';
    });

    // 隐藏消耗视角的动态内容容器
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.style.display = 'none';
        mainContent.innerHTML = '';
    }

    // 显示主内容区域
    document.querySelectorAll('main > section').forEach(function(s) {
        s.style.display = 'block';
    });

    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) navMenu.style.display = 'flex';

    // T032: Handle pending room navigation from rankings
    if (state.pendingRoomNavigation) {
        var nav = state.pendingRoomNavigation;
        state.pendingRoomNavigation = null;

        // Set campus
        var campusSelect = $('campus-select');
        if (campusSelect) {
            campusSelect.value = nav.campus;
            // Trigger change event
            var event = new Event('change');
            campusSelect.dispatchEvent(event);

            // Wait for buildings to load, then set building and room
            setTimeout(async function() {
                var buildingSelect = $('building-select');
                if (buildingSelect) {
                    buildingSelect.value = nav.building;
                    var buildingEvent = new Event('change');
                    buildingSelect.dispatchEvent(buildingEvent);

                    // Wait for rooms to load, then set room
                    setTimeout(async function() {
                        var roomSelect = $('room-select');
                        if (roomSelect) {
                            roomSelect.value = nav.roomId;
                            var roomEvent = new Event('change');
                            roomSelect.dispatchEvent(roomEvent);
                        }
                    }, 500);
                }
            }, 300);
        }
    }
}

function updateNavActive(page) {
    document.querySelectorAll('.nav-menu a').forEach(function(link) {
        link.classList.remove('active');
        if (link.dataset.page === page) {
            link.classList.add('active');
        }
    });
}

function showWarningsPage() {
    state.analytics.currentPage = 'warnings';
    updateNavActive('warnings');

    // 隐藏主内容区域
    document.querySelectorAll('main > section').forEach(function(s) {
        s.style.display = 'none';
    });

    // 显示或创建warnings页面
    let pageContainer = document.getElementById('page-warnings');
    if (!pageContainer) {
        pageContainer = document.createElement('div');
        pageContainer.id = 'page-warnings';
        document.querySelector('main').appendChild(pageContainer);
    }

    // 隐藏其他页面
    document.querySelectorAll('[id^="page-"]').forEach(function(p) {
        p.style.display = 'none';
    });
    pageContainer.style.display = 'block';

    // 初始化页面内容
    if (typeof initWarningsPageContent === 'function') {
        initWarningsPageContent(pageContainer);
    }
}

function showComparisonPage() {
    state.analytics.currentPage = 'comparison';
    updateNavActive('comparison');

    document.querySelectorAll('main > section').forEach(function(s) {
        s.style.display = 'none';
    });

    let pageContainer = document.getElementById('page-comparison');
    if (!pageContainer) {
        pageContainer = document.createElement('div');
        pageContainer.id = 'page-comparison';
        document.querySelector('main').appendChild(pageContainer);
    }

    document.querySelectorAll('[id^="page-"]').forEach(function(p) {
        p.style.display = 'none';
    });
    pageContainer.style.display = 'block';

    if (typeof initComparisonPageContent === 'function') {
        initComparisonPageContent(pageContainer);
    }
}

function showDashboardPage() {
    state.analytics.currentPage = 'dashboard';
    updateNavActive('dashboard');

    document.querySelectorAll('main > section').forEach(function(s) {
        s.style.display = 'none';
    });

    let pageContainer = document.getElementById('page-dashboard');
    if (!pageContainer) {
        pageContainer = document.createElement('div');
        pageContainer.id = 'page-dashboard';
        document.querySelector('main').appendChild(pageContainer);
    }

    document.querySelectorAll('[id^="page-"]').forEach(function(p) {
        p.style.display = 'none';
    });
    pageContainer.style.display = 'block';

    if (typeof initDashboardPageContent === 'function') {
        initDashboardPageContent(pageContainer);
    }
}

// ==================== Consumption Perspective Pages ====================
function showConsumptionOverviewPage() {
    state.analytics.currentPage = 'consumption-overview';
    updateNavActive('consumption');

    document.querySelectorAll('main > section').forEach(function(s) {
        s.style.display = 'none';
    });

    let pageContainer = document.getElementById('main-content');
    if (!pageContainer) {
        pageContainer = document.createElement('div');
        pageContainer.id = 'main-content';
        document.querySelector('main').appendChild(pageContainer);
    }

    document.querySelectorAll('[id^="page-"]').forEach(function(p) {
        p.style.display = 'none';
    });
    pageContainer.style.display = 'block';

    // Load and render consumption overview
    if (typeof CampusView !== 'undefined' && CampusView.renderOverview) {
        CampusView.renderOverview(pageContainer);
    } else {
        // Dynamic import fallback
        import('./modules/campus-view.js')
            .then(function(module) {
                module.renderOverview(pageContainer);
            })
            .catch(function(err) {
                console.error('Failed to load campus-view module:', err);
                pageContainer.innerHTML = '<p class="error">无法加载消耗视角模块</p>';
            });
    }
}

function showCampusPage(campusName) {
    state.analytics.currentPage = 'campus';
    updateNavActive('consumption');

    document.querySelectorAll('main > section').forEach(function(s) {
        s.style.display = 'none';
    });

    let pageContainer = document.getElementById('main-content');
    if (!pageContainer) {
        pageContainer = document.createElement('div');
        pageContainer.id = 'main-content';
        document.querySelector('main').appendChild(pageContainer);
    }

    document.querySelectorAll('[id^="page-"]').forEach(function(p) {
        p.style.display = 'none';
    });
    pageContainer.style.display = 'block';

    // Load and render campus view
    if (typeof CampusView !== 'undefined' && CampusView.renderCampusView) {
        CampusView.renderCampusView(decodeURIComponent(campusName), pageContainer);
    } else {
        import('./modules/campus-view.js')
            .then(function(module) {
                module.renderCampusView(decodeURIComponent(campusName), pageContainer);
            })
            .catch(function(err) {
                console.error('Failed to load campus-view module:', err);
                pageContainer.innerHTML = '<p class="error">无法加载校区视角模块</p>';
            });
    }
}

function showBuildingPage(campusName, buildingName) {
    state.analytics.currentPage = 'building';
    updateNavActive('consumption');

    document.querySelectorAll('main > section').forEach(function(s) {
        s.style.display = 'none';
    });

    let pageContainer = document.getElementById('main-content');
    if (!pageContainer) {
        pageContainer = document.createElement('div');
        pageContainer.id = 'main-content';
        document.querySelector('main').appendChild(pageContainer);
    }

    document.querySelectorAll('[id^="page-"]').forEach(function(p) {
        p.style.display = 'none';
    });
    pageContainer.style.display = 'block';

    // Load and render building view
    import('./modules/building-view.js')
        .then(function(module) {
            module.renderBuildingView(
                decodeURIComponent(campusName),
                decodeURIComponent(buildingName),
                pageContainer
            );
        })
        .catch(function(err) {
            console.error('Failed to load building-view module:', err);
            pageContainer.innerHTML = '<p class="error">无法加载楼栋视角模块</p>';
        });
}

function showRoomPage(campusName, buildingName, roomId) {
    state.analytics.currentPage = 'room';
    updateNavActive('consumption');

    document.querySelectorAll('main > section').forEach(function(s) {
        s.style.display = 'none';
    });

    let pageContainer = document.getElementById('main-content');
    if (!pageContainer) {
        pageContainer = document.createElement('div');
        pageContainer.id = 'main-content';
        document.querySelector('main').appendChild(pageContainer);
    }

    document.querySelectorAll('[id^="page-"]').forEach(function(p) {
        p.style.display = 'none';
    });
    pageContainer.style.display = 'block';

    // Load and render room view
    import('./modules/room-view.js')
        .then(function(module) {
            module.renderRoomView(
                decodeURIComponent(campusName),
                decodeURIComponent(buildingName),
                roomId,
                pageContainer
            );
        })
        .catch(function(err) {
            console.error('Failed to load room-view module:', err);
            pageContainer.innerHTML = '<p class="error">无法加载房间视角模块</p>';
        });
}

// ==================== Initialize ====================
function initRouter() {
    Router.addRoute('/', showHomePage);
    Router.addRoute('/warnings', showWarningsPage);
    Router.addRoute('/comparison', showComparisonPage);
    Router.addRoute('/dashboard', showDashboardPage);

    // Consumption perspective routes (T017, T027, T038)
    Router.addRoute('/consumption', showConsumptionOverviewPage);
    Router.addRoute('/campus/:campus', showCampusPage);
    Router.addRoute('/building/:campus/:building', showBuildingPage);
    Router.addRoute('/room/:campus/:building/:roomId', showRoomPage);

    Router.init();
}

// ==================== T045: Lazy Loading for Chart Libraries ====================

/**
 * Chart library loader state.
 */
const ChartLoader = {
    chartJsLoaded: false,
    echartsLoaded: false,
    chartJsLoading: false,
    echartsLoading: false,
    chartJsCallbacks: [],
    echartsCallbacks: []
};

/**
 * Load Chart.js library lazily.
 * @param {Function} callback - Callback to run after loading
 */
function loadChartJs(callback) {
    if (typeof Chart !== 'undefined') {
        ChartLoader.chartJsLoaded = true;
        if (callback) callback();
        return;
    }

    if (ChartLoader.chartJsLoading) {
        if (callback) ChartLoader.chartJsCallbacks.push(callback);
        return;
    }

    ChartLoader.chartJsLoading = true;

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = function() {
        ChartLoader.chartJsLoaded = true;
        ChartLoader.chartJsLoading = false;
        if (callback) callback();
        ChartLoader.chartJsCallbacks.forEach(function(cb) { cb(); });
        ChartLoader.chartJsCallbacks = [];
    };
    script.onerror = function() {
        console.error('Failed to load Chart.js');
        ChartLoader.chartJsLoading = false;
    };

    document.head.appendChild(script);
}

/**
 * Load ECharts library lazily.
 * @param {Function} callback - Callback to run after loading
 */
function loadECharts(callback) {
    if (typeof echarts !== 'undefined') {
        ChartLoader.echartsLoaded = true;
        if (callback) callback();
        return;
    }

    if (ChartLoader.echartsLoading) {
        if (callback) ChartLoader.echartsCallbacks.push(callback);
        return;
    }

    ChartLoader.echartsLoading = true;

    const script = document.createElement('script');
    script.src = 'js/vendor/echarts.min.js';
    script.onload = function() {
        ChartLoader.echartsLoaded = true;
        ChartLoader.echartsLoading = false;
        if (callback) callback();
        ChartLoader.echartsCallbacks.forEach(function(cb) { cb(); });
        ChartLoader.echartsCallbacks = [];
    };
    script.onerror = function() {
        console.error('Failed to load ECharts');
        ChartLoader.echartsLoading = false;
    };

    document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', function() {
    initRouter();
    loadOverview();

    const campusSelect = $('campus-select');
    const buildingSelect = $('building-select');
    const roomSelect = $('room-select');
    const roomSearch = $('room-search');
    const chartSection = $('chart-section');

    if (campusSelect) campusSelect.addEventListener('change', onCampusChange);
    if (buildingSelect) buildingSelect.addEventListener('change', onBuildingChange);
    if (roomSelect) roomSelect.addEventListener('change', onRoomChange);
    if (roomSearch) roomSearch.addEventListener('input', onRoomSearch);
    if (chartSection) chartSection.addEventListener('click', onChartRangeClick);

    // T043, T044: Initialize user configuration controls
    initUserConfiguration();
});

/**
 * T043, T044: Initialize user configuration with localStorage persistence.
 */
function initUserConfiguration() {
    const configSection = $('consumption-config');
    if (!configSection) return;

    // Show config section when in consumption perspective
    function updateConfigVisibility() {
        const hash = window.location.hash;
        const showConfig = hash.includes('consumption') || hash.includes('campus') ||
                          hash.includes('building') || hash.includes('room');
        configSection.style.display = showConfig ? 'block' : 'none';
    }

    updateConfigVisibility();
    window.addEventListener('hashchange', updateConfigVisibility);

    // Load saved configuration
    const predictionWindow = $('config-prediction-window');
    const anomalyThreshold = $('config-anomaly-threshold');
    const confidenceThreshold = $('config-confidence-threshold');
    const saveBtn = $('btn-save-config');

    if (predictionWindow) {
        const saved = localStorage.getItem('consumption.prediction_window');
        if (saved) predictionWindow.value = saved;
    }
    if (anomalyThreshold) {
        const saved = localStorage.getItem('consumption.anomaly_threshold');
        if (saved) anomalyThreshold.value = saved;
    }
    if (confidenceThreshold) {
        const saved = localStorage.getItem('consumption.confidence_threshold');
        if (saved) confidenceThreshold.value = saved;
    }

    // Save configuration
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            if (predictionWindow) {
                localStorage.setItem('consumption.prediction_window', predictionWindow.value);
            }
            if (anomalyThreshold) {
                localStorage.setItem('consumption.anomaly_threshold', anomalyThreshold.value);
            }
            if (confidenceThreshold) {
                localStorage.setItem('consumption.confidence_threshold', confidenceThreshold.value);
            }

            // Show save confirmation
            saveBtn.textContent = '已保存 ✓';
            setTimeout(function() {
                saveBtn.textContent = '保存配置';
            }, 2000);
        });
    }
}
