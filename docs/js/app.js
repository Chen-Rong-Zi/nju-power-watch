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
        const handler = this.routes[hash];

        if (handler) {
            this.currentRoute = hash;
            handler();
        } else {
            this.navigate('/');
        }
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
        return;
    }

    const campusSelect = $('campus-select');
    const buildingSelect = $('building-select');
    const campus = campusSelect ? campusSelect.value : '';
    const building = buildingSelect ? buildingSelect.value : '';

    const roomData = await loadRoomData(campus, building, roomId);

    if (roomData) {
        state.roomData = roomData;
        displayRoomInfo(roomData);
        show('chart-section');
        updateChart(roomData, null);
    } else {
        showError('该房间暂无历史数据');
        hide('chart-section');
    }
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
function showHomePage() {
    state.analytics.currentPage = 'home';
    updateNavActive('home');

    // 隐藏所有动态页面
    document.querySelectorAll('[id^="page-"]').forEach(function(p) {
        p.style.display = 'none';
    });

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

function showRankingsPage() {
    state.analytics.currentPage = 'rankings';
    updateNavActive('rankings');

    document.querySelectorAll('main > section').forEach(function(s) {
        s.style.display = 'none';
    });

    let pageContainer = document.getElementById('page-rankings');
    if (!pageContainer) {
        pageContainer = document.createElement('div');
        pageContainer.id = 'page-rankings';
        document.querySelector('main').appendChild(pageContainer);
    }

    document.querySelectorAll('[id^="page-"]').forEach(function(p) {
        p.style.display = 'none';
    });
    pageContainer.style.display = 'block';

    if (typeof initRankingsPageContent === 'function') {
        initRankingsPageContent(pageContainer);
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

// ==================== Initialize ====================
function initRouter() {
    Router.addRoute('/', showHomePage);
    Router.addRoute('/warnings', showWarningsPage);
    Router.addRoute('/rankings', showRankingsPage);
    Router.addRoute('/comparison', showComparisonPage);
    Router.addRoute('/dashboard', showDashboardPage);
    Router.init();
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
});
