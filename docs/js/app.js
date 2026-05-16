/**
 * NJU Electricity Data Viewer
 * Adapted for hierarchical aggregation structure
 */

// Global state
const state = {
    overview: null,
    campusData: {},
    buildingData: {},
    roomData: null,
    chart: null
};

// API configuration - using new summaries structure
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
    $(id).style.display = 'block';
}

function hide(id) {
    $(id).style.display = 'none';
}

function showError(message) {
    $('error-message').textContent = message;
    show('error');
    setTimeout(() => hide('error'), 5000);
}

function showLoading() {
    show('loading');
}

function hideLoading() {
    hide('loading');
}

// Data loading functions
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
        showError(`无法加载 ${campus} 的数据`);
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
        showError(`无法加载 ${building} 的数据`);
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

// Statistics calculation functions
function calculateStats(balanceHistory) {
    const dates = Object.keys(balanceHistory).sort();
    const balances = dates.map(d => balanceHistory[d]);
    
    if (balances.length === 0) return null;
    
    const current = balances[balances.length - 1];
    const min = Math.min(...balances);
    const max = Math.max(...balances);
    const avg = balances.reduce((a, b) => a + b, 0) / balances.length;
    
    // Calculate average daily consumption (last 7 days or all available)
    let dailyConsumption = 0;
    if (balances.length >= 2) {
        const recentBalances = balances.slice(-Math.min(7, balances.length));
        if (recentBalances.length >= 2) {
            const consumption = recentBalances[0] - recentBalances[recentBalances.length - 1];
            dailyConsumption = consumption / (recentBalances.length - 1);
        }
    }
    
    // Calculate trend (linear regression slope)
    let trend = 0;
    if (balances.length >= 2) {
        const n = balances.length;
        const avgX = (n - 1) / 2;
        const avgY = avg;
        
        let numerator = 0;
        let denominator = 0;
        
        for (let i = 0; i < n; i++) {
            numerator += (i - avgX) * (balances[i] - avgY);
            denominator += Math.pow(i - avgX, 2);
        }
        
        trend = numerator / denominator;
    }
    
    return {
        current: current,
        min: min,
        max: max,
        avg: avg,
        dailyConsumption: Math.max(0, dailyConsumption),
        trend: trend,
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
        message: `预计${daysUntilEmpty}天后余额不足`
    };
}

// Helper functions
function formatDateDisplay(dateStr) {
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    return `${month}-${day}`;
}

// UI functions
function populateCampusSelect(campuses) {
    const select = $('campus-select');
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
    select.innerHTML = '<option value="">-- 请选择楼栋 --</option>';
    select.disabled = false;
    
    Object.keys(campusData.buildings).forEach(building => {
        const option = document.createElement('option');
        option.value = building;
        const info = campusData.buildings[building];
        option.textContent = `${building} (${info.total_rooms}间)`;
        option.dataset.totalRooms = info.total_rooms;
        select.appendChild(option);
    });
}

function populateRoomSelect(buildingData) {
    const select = $('room-select');
    select.innerHTML = '<option value="">-- 请选择房间 --</option>';
    select.disabled = false;
    
    const searchInput = $('room-search');
    searchInput.disabled = false;
    searchInput.value = '';
    
    Object.entries(buildingData.rooms).forEach(([roomId, roomInfo]) => {
        const option = document.createElement('option');
        option.value = roomId;
        option.textContent = `${roomInfo.room_name} (${roomInfo.current_balance}度)`;
        option.dataset.name = roomInfo.room_name.toLowerCase();
        option.dataset.balance = roomInfo.current_balance;
        select.appendChild(option);
    });
}

function displayRoomInfo(roomData) {
    $('info-campus').textContent = roomData.campus;
    $('info-building').textContent = roomData.building;
    $('info-room').textContent = roomData.room_name;
    $('info-records').textContent = Object.keys(roomData.balance_history).length;
    
    show('room-info');
}

function updateChart(roomData, days = null) {
    const ctx = $('electricity-chart').getContext('2d');
    
    const dates = Object.keys(roomData.balance_history).sort();
    let filteredDates = dates;
    
    if (days && days < dates.length) {
        filteredDates = dates.slice(-days);
    }
    
    const labels = filteredDates.map(d => formatDateDisplay(d));
    const balances = filteredDates.map(d => roomData.balance_history[d]);
    
    // Destroy existing chart
    if (state.chart) {
        state.chart.destroy();
    }
    
    // Create new chart
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
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: '电量 (度)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '日期'
                    }
                }
            }
        }
    });
    
    // Calculate and display statistics
    const stats = calculateStats(roomData.balance_history);
    
    if (stats) {
        $('stat-current').textContent = `${stats.current.toFixed(1)} 度`;
        $('stat-avg').textContent = `${stats.dailyConsumption.toFixed(1)} 度/天`;
        $('stat-min').textContent = `${stats.min.toFixed(1)} 度`;
        $('stat-max').textContent = `${stats.max.toFixed(1)} 度`;
        
        // Show prediction
        const prediction = predictEmptyDate(stats.current, stats.dailyConsumption);
        if (Number.isFinite(prediction.daysUntilEmpty)) {
            $('stat-avg').title = prediction.message;
        }
    }
}

// Event handlers
async function onCampusChange() {
    const campus = this.value;
    
    // Reset downstream selects
    $('building-select').innerHTML = '<option value="">-- 请先选择校区 --</option>';
    $('building-select').disabled = true;
    $('room-select').innerHTML = '<option value="">-- 请先选择楼栋 --</option>';
    $('room-select').disabled = true;
    $('room-search').disabled = true;
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
    const campus = $('campus-select').value;
    
    // Reset room select
    $('room-select').innerHTML = '<option value="">-- 请选择房间 --</option>';
    $('room-select').disabled = true;
    $('room-search').disabled = true;
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
    
    const campus = $('campus-select').value;
    const building = $('building-select').value;
    
    // Load room data
    const roomData = await loadRoomData(campus, building, roomId);
    
    if (roomData) {
        state.roomData = roomData;
        displayRoomInfo(roomData);
        show('chart-section');
        
        // Default to showing all data
        updateChart(roomData, null);
    } else {
        showError('该房间暂无历史数据');
        hide('chart-section');
    }
}

function onRoomSearch() {
    const searchTerm = this.value.toLowerCase();
    const options = $('room-select').options;
    
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
    
    // Update active state
    document.querySelectorAll('.chart-controls .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update chart
    const range = btn.id.replace('btn-', '');
    let days = null;
    
    if (range === '7d') days = 7;
    else if (range === '30d') days = 30;
    // else 'all' -> days = null
    
    if (state.roomData) {
        updateChart(state.roomData, days);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Load overview
    loadOverview();
    
    // Event listeners
    $('campus-select').addEventListener('change', onCampusChange);
    $('building-select').addEventListener('change', onBuildingChange);
    $('room-select').addEventListener('change', onRoomChange);
    $('room-search').addEventListener('input', onRoomSearch);
    $('chart-section').addEventListener('click', onChartRangeClick);
});
