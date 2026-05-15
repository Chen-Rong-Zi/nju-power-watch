/**
 * NJU Electricity Data Viewer
 * Static frontend for viewing electricity data
 */

// Global state
const state = {
    campuses: [],
    campusData: {},
    currentRoom: null,
    roomData: [],
    chart: null
};

// API configuration
const API = {
    // Use relative paths (works for both local and GitHub Pages)
    baseUrl: './data',
    
    indexUrl: function() {
        return `${this.baseUrl}/index.json`;
    },
    
    campusUrl: function(campus) {
        return `${this.baseUrl}/campus_${campus}.json`;
    },
    
    roomDataUrl: function(roomPath) {
        // Use relative path from docs directory
        // roomPath is like: "仙林校区/19幢/19栋第16层1613-53463"
        return `./database/${roomPath}`;
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
async function loadIndex() {
    try {
        const response = await fetch(API.indexUrl());
        if (!response.ok) throw new Error('Failed to load index');
        
        const data = await response.json();
        state.campuses = data.campuses;
        
        populateCampusSelect();
    } catch (error) {
        console.error('Error loading index:', error);
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

async function loadRoomHistory(roomPath) {
    try {
        showLoading();
        
        // Get list of JSON files in room directory
        // For static hosting, we need to read the directory listing
        // Since we can't list directories, we'll need to parse dates from paths
        
        // Alternative: Use pre-generated index or load data from summary.json
        
        // For now, let's load the most recent files by trying common dates
        const roomData = [];
        const today = new Date();
        
        // Try last 30 days
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = formatDateForFile(date);
            
            try {
                const response = await fetch(`./database/${roomPath}/${dateStr}.json`);
                if (response.ok) {
                    const data = await response.json();
                    roomData.push({
                        date: date,
                        dateStr: dateStr,
                        data: data
                    });
                }
            } catch (e) {
                // File doesn't exist, skip
            }
        }
        
        // Sort by date (oldest first)
        roomData.sort((a, b) => a.date - b.date);
        
        hideLoading();
        return roomData;
    } catch (error) {
        console.error('Error loading room history:', error);
        hideLoading();
        showError('无法加载房间历史数据');
        return [];
    }
}

// Helper functions
function formatDateForFile(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function formatDateDisplay(date) {
    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric'
    });
}

function parseBalance(balanceStr) {
    if (!balanceStr) return 0;
    return parseFloat(balanceStr.replace('度', '')) || 0;
}

// UI functions
function populateCampusSelect() {
    const select = $('campus-select');
    select.innerHTML = '<option value="">-- 请选择校区 --</option>';
    
    state.campuses.forEach(campus => {
        const option = document.createElement('option');
        option.value = campus;
        option.textContent = campus;
        select.appendChild(option);
    });
}

function populateBuildingSelect(buildings) {
    const select = $('building-select');
    select.innerHTML = '<option value="">-- 请选择楼栋 --</option>';
    select.disabled = false;
    
    Object.keys(buildings).forEach(building => {
        const option = document.createElement('option');
        option.value = building;
        option.textContent = building;
        select.appendChild(option);
    });
}

function populateRoomSelect(rooms) {
    const select = $('room-select');
    select.innerHTML = '<option value="">-- 请选择房间 --</option>';
    select.disabled = false;
    
    const searchInput = $('room-search');
    searchInput.disabled = false;
    searchInput.value = '';
    
    rooms.forEach(room => {
        const option = document.createElement('option');
        option.value = room.i; // room id
        option.textContent = room.n; // room name
        option.dataset.path = room.p; // path
        option.dataset.records = room.r; // record count
        option.dataset.name = room.n.toLowerCase();
        select.appendChild(option);
    });
}

function displayRoomInfo(roomId, roomPath) {
    const option = $(`room-select`).querySelector(`option[value="${roomId}"]`);
    
    if (option) {
        $('info-campus').textContent = $('campus-select').value;
        $('info-building').textContent = $('building-select').value;
        $('info-room').textContent = option.textContent;
        $('info-records').textContent = option.dataset.records;
        
        show('room-info');
    }
}

function updateChart(roomData, days = null) {
    const ctx = $('electricity-chart').getContext('2d');
    
    // Filter data by days if specified
    let filteredData = roomData;
    if (days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        filteredData = roomData.filter(d => d.date >= cutoff);
    }
    
    // Prepare chart data
    const labels = filteredData.map(d => formatDateDisplay(d.date));
    const balances = filteredData.map(d => parseBalance(d.data['剩余电量']));
    
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
    
    // Update statistics
    if (balances.length > 0) {
        const current = balances[balances.length - 1];
        const min = Math.min(...balances);
        const max = Math.max(...balances);
        const avg = balances.reduce((a, b) => a + b, 0) / balances.length;
        
        // Calculate daily consumption
        let dailyConsumption = 0;
        if (balances.length >= 2) {
            dailyConsumption = (balances[0] - balances[balances.length - 1]) / (balances.length - 1);
        }
        
        $('stat-current').textContent = `${current.toFixed(1)} 度`;
        $('stat-avg').textContent = `${dailyConsumption.toFixed(1)} 度/天`;
        $('stat-min').textContent = `${min.toFixed(1)} 度`;
        $('stat-max').textContent = `${max.toFixed(1)} 度`;
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

function onBuildingChange() {
    const building = this.value;
    const campus = $('campus-select').value;
    
    // Reset room select
    $('room-select').innerHTML = '<option value="">-- 请选择房间 --</option>';
    $('room-select').disabled = true;
    $('room-search').disabled = true;
    hide('room-info');
    hide('chart-section');
    
    if (!building || !campus) return;
    
    const campusData = state.campusData[campus];
    if (campusData && campusData[building]) {
        populateRoomSelect(campusData[building]);
    }
}

async function onRoomChange() {
    const roomId = this.value;
    const option = this.selectedOptions[0];
    
    if (!roomId || !option) {
        hide('room-info');
        hide('chart-section');
        return;
    }
    
    const roomPath = option.dataset.path;
    const roomName = option.textContent;
    
    // Display room info
    displayRoomInfo(roomId, roomPath);
    
    // Load room history
    const roomData = await loadRoomHistory(roomPath);
    
    if (roomData.length > 0) {
        state.roomData = roomData;
        show('chart-section');
        updateChart(roomData, 30); // Show last 30 days by default
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
        if (option.value === '') continue; // Skip placeholder
        
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
    
    if (state.roomData.length > 0) {
        updateChart(state.roomData, days);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Load index
    loadIndex();
    
    // Event listeners
    $('campus-select').addEventListener('change', onCampusChange);
    $('building-select').addEventListener('change', onBuildingChange);
    $('room-select').addEventListener('change', onRoomChange);
    $('room-search').addEventListener('input', onRoomSearch);
    $('chart-section').addEventListener('click', onChartRangeClick);
});
