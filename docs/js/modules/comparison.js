/**
 * Comparison Module
 * Multi-room trend comparison functionality
 */

var comparisonState = {
    selectedRooms: [],
    timeRange: 30,
    roomData: {}
};

/**
 * T043: Initialize comparison page content
 */
function initComparisonPageContent(container) {
    container.innerHTML =
        '<div class="page-container">' +
            '<div class="page-header">' +
                '<h2>📈 对比分析</h2>' +
                '<p>选择多个房间，对比用电趋势</p>' +
            '</div>' +

            '<div class="control-group" style="margin-bottom: 20px;">' +
                '<label for="comparison-campus-select">选择校区:</label>' +
                '<select id="comparison-campus-select">' +
                    '<option value="">-- 请选择校区 --</option>' +
                '</select>' +
            '</div>' +

            '<div class="control-group" style="margin-bottom: 20px;">' +
                '<label for="comparison-building-select">选择楼栋:</label>' +
                '<select id="comparison-building-select" disabled>' +
                    '<option value="">-- 请先选择校区 --</option>' +
                '</select>' +
            '</div>' +

            '<div class="control-group" style="margin-bottom: 20px;">' +
                '<label>选择房间 (最多5间):</label>' +
                '<div id="room-selector" class="room-selector" style="display: none;">' +
                    '<div class="loading"><div class="spinner"></div><p>加载房间列表...</p></div>' +
                '</div>' +
            '</div>' +

            '<div class="control-group" style="margin-bottom: 20px;">' +
                '<label>时间范围:</label>' +
                '<div class="time-range-selector">' +
                    '<button class="btn active" data-range="7">最近7天</button>' +
                    '<button class="btn" data-range="30">最近30天</button>' +
                    '<button class="btn" data-range="all">全部数据</button>' +
                '</div>' +
            '</div>' +

            '<div id="selected-rooms-display" style="margin-bottom: 20px;"></div>' +
            '<div id="comparison-chart-container" class="chart-container comparison-chart" style="display: none;"></div>' +
            '<div id="comparison-stats-container" class="comparison-stats"></div>' +
        '</div>';

    loadComparisonData(container);
}

/**
 * Load comparison data and setup event handlers
 */
async function loadComparisonData(container) {
    var campusSelect = document.getElementById('comparison-campus-select');
    var buildingSelect = document.getElementById('comparison-building-select');

    if (!campusSelect) return;

    try {
        var resp = await fetch('./database/summaries/overview.json');
        var overview = await resp.json();

        Object.keys(overview.campuses).forEach(function(campus) {
            var opt = document.createElement('option');
            opt.value = campus;
            opt.textContent = campus;
            campusSelect.appendChild(opt);
        });

        // Campus change handler
        campusSelect.addEventListener('change', async function() {
            var campus = campusSelect.value;
            buildingSelect.innerHTML = '<option value="">-- 请选择楼栋 --</option>';
            buildingSelect.disabled = true;

            // Clear selections
            comparisonState.selectedRooms = [];
            comparisonState.roomData = {};
            updateSelectedRoomsDisplay();

            if (!campus) return;

            try {
                var campusResp = await fetch('./database/summaries/campuses/' + campus + '/summary.json');
                var campusData = await campusResp.json();

                Object.keys(campusData.buildings).forEach(function(building) {
                    var opt = document.createElement('option');
                    opt.value = building;
                    opt.textContent = building;
                    buildingSelect.appendChild(opt);
                });

                buildingSelect.disabled = false;
            } catch (e) {
                console.error('Error loading campus data:', e);
            }
        });

        // Building change handler
        buildingSelect.addEventListener('change', async function() {
            var campus = campusSelect.value;
            var building = buildingSelect.value;

            comparisonState.selectedRooms = [];
            comparisonState.roomData = {};
            updateSelectedRoomsDisplay();

            if (!campus || !building) return;

            await loadRoomSelector(campus, building);
        });

        // Time range handlers
        container.querySelectorAll('.time-range-selector .btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                container.querySelectorAll('.time-range-selector .btn').forEach(function(b) {
                    b.classList.remove('active');
                });
                e.target.classList.add('active');

                var range = e.target.dataset.range;
                comparisonState.timeRange = range === 'all' ? null : parseInt(range);
                renderComparisonChart();
            });
        });

    } catch (error) {
        console.error('Error loading comparison data:', error);
    }
}

/**
 * T044: Load room selector UI
 */
async function loadRoomSelector(campus, building) {
    var container = document.getElementById('room-selector');
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载房间列表...</p></div>';

    try {
        var resp = await fetch('./database/summaries/campuses/' + campus + '/buildings/' + building + '/summary.json');
        var buildingData = await resp.json();

        container.innerHTML = '';

        var rooms = buildingData.rooms || {};
        Object.keys(rooms).forEach(function(roomId) {
            var roomInfo = rooms[roomId];
            var item = document.createElement('div');
            item.className = 'room-selector-item';
            item.dataset.roomId = roomId;
            item.dataset.roomName = roomInfo.room_name;

            var isSelected = comparisonState.selectedRooms.indexOf(roomId) !== -1;

            item.innerHTML =
                '<input type="checkbox" ' + (isSelected ? 'checked' : '') + '>' +
                '<span>' + roomInfo.room_name + ' (' + (roomInfo.current_balance || 0).toFixed(1) + '度)</span>';

            item.addEventListener('click', function(e) {
                if (e.target.tagName !== 'INPUT') {
                    var checkbox = item.querySelector('input');
                    checkbox.checked = !checkbox.checked;
                }
                toggleRoomSelection(roomId, campus, building, roomInfo.room_name);
            });

            container.appendChild(item);
        });

    } catch (error) {
        console.error('Error loading room selector:', error);
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

/**
 * Toggle room selection
 */
function toggleRoomSelection(roomId, campus, building, roomName) {
    var index = comparisonState.selectedRooms.indexOf(roomId);

    if (index !== -1) {
        // Remove from selection
        comparisonState.selectedRooms.splice(index, 1);
        delete comparisonState.roomData[roomId];
    } else {
        // Check if max reached
        if (comparisonState.selectedRooms.length >= 5) {
            alert('最多只能选择5个房间进行对比');
            var item = document.querySelector('.room-selector-item[data-room-id="' + roomId + '"]');
            if (item) {
                var checkbox = item.querySelector('input');
                if (checkbox) checkbox.checked = false;
            }
            return;
        }

        // Add to selection
        comparisonState.selectedRooms.push(roomId);
        comparisonState.roomData[roomId] = {
            campus: campus,
            building: building,
            roomName: roomName
        };

        // Load room data
        loadRoomDetailForComparison(campus, building, roomId);
    }

    updateSelectedRoomsDisplay();
}

/**
 * Load room detail data for comparison
 */
async function loadRoomDetailForComparison(campus, building, roomId) {
    try {
        var resp = await fetch('./database/summaries/campuses/' + campus + '/buildings/' + building + '/rooms/' + roomId + '.json');
        var roomData = await resp.json();

        comparisonState.roomData[roomId].data = roomData;

        // Render chart if we have data for all selected rooms
        var allLoaded = comparisonState.selectedRooms.every(function(id) {
            return comparisonState.roomData[id] && comparisonState.roomData[id].data;
        });

        if (allLoaded && comparisonState.selectedRooms.length >= 2) {
            renderComparisonChart();
            renderComparisonStats();
        }
    } catch (error) {
        console.error('Error loading room data:', error);
    }
}

/**
 * Update selected rooms display
 */
function updateSelectedRoomsDisplay() {
    var container = document.getElementById('selected-rooms-display');
    if (!container) return;

    if (comparisonState.selectedRooms.length === 0) {
        container.innerHTML = '<p style="color: #666;">请选择至少2个房间进行对比</p>';
        return;
    }

    var html = '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';
    comparisonState.selectedRooms.forEach(function(roomId) {
        var room = comparisonState.roomData[roomId];
        if (room) {
            html += '<span class="pattern-badge average" style="cursor: pointer;" data-room-id="' + roomId + '">' +
                    room.roomName + ' ✕</span>';
        }
    });
    html += '</div>';

    container.innerHTML = html;

    // Add click handlers to remove rooms
    container.querySelectorAll('.pattern-badge').forEach(function(badge) {
        badge.addEventListener('click', function() {
            var roomId = badge.dataset.roomId;
            comparisonState.selectedRooms = comparisonState.selectedRooms.filter(function(id) {
                return id !== roomId;
            });
            delete comparisonState.roomData[roomId];

            // Update checkbox
            var item = document.querySelector('.room-selector-item[data-room-id="' + roomId + '"]');
            if (item) {
                var checkbox = item.querySelector('input');
                if (checkbox) checkbox.checked = false;
            }

            updateSelectedRoomsDisplay();
            renderComparisonChart();
            renderComparisonStats();
        });
    });
}

/**
 * T045: Render comparison chart using Chart.js
 */
function renderComparisonChart() {
    var container = document.getElementById('comparison-chart-container');
    if (!container || comparisonState.selectedRooms.length < 2) {
        if (container) container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // Get all dates across all rooms
    var allDates = new Set();
    comparisonState.selectedRooms.forEach(function(roomId) {
        var room = comparisonState.roomData[roomId];
        if (room && room.data && room.data.balance_history) {
            Object.keys(room.data.balance_history).forEach(function(date) {
                allDates.add(date);
            });
        }
    });

    var sortedDates = Array.from(allDates).sort();

    // Apply time range filter
    var displayDates = sortedDates;
    if (comparisonState.timeRange && sortedDates.length > comparisonState.timeRange) {
        displayDates = sortedDates.slice(-comparisonState.timeRange);
    }

    // Color palette for lines
    var colors = ['#667eea', '#e74c3c', '#27ae60', '#f39c12', '#9b59b6'];

    // Build datasets
    var datasets = comparisonState.selectedRooms.map(function(roomId, index) {
        var room = comparisonState.roomData[roomId];
        var data = displayDates.map(function(date) {
            return room && room.data && room.data.balance_history ? room.data.balance_history[date] : null;
        });

        return {
            label: room ? room.roomName : 'Room ' + roomId,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length] + '20',
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5
        };
    });

    // Format labels
    var labels = displayDates.map(function(d) {
        return d.slice(4, 6) + '-' + d.slice(6, 8);
    });

    container.innerHTML = '<canvas id="comparison-canvas"></canvas>';
    var canvas = document.getElementById('comparison-canvas');

    if (canvas) {
        new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
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
                        title: { display: true, text: '电量 (度)' },
                        beginAtZero: false
                    },
                    x: {
                        title: { display: true, text: '日期' }
                    }
                }
            }
        });
    }
}

/**
 * T046: Render comparison statistics
 */
function renderComparisonStats() {
    var container = document.getElementById('comparison-stats-container');
    if (!container || comparisonState.selectedRooms.length < 2) {
        if (container) container.innerHTML = '';
        return;
    }

    // Calculate stats for each room
    var stats = comparisonState.selectedRooms.map(function(roomId) {
        var room = comparisonState.roomData[roomId];
        if (!room || !room.data || !room.data.balance_history) return null;

        var history = room.data.balance_history;
        var dates = Object.keys(history).sort();
        var balances = dates.map(function(d) { return history[d]; });

        var current = balances[balances.length - 1] || 0;
        var consumption = balances.length > 1 ? balances[0] - balances[balances.length - 1] : 0;
        var dailyAvg = balances.length > 1 ? consumption / (balances.length - 1) : 0;

        return {
            roomId: roomId,
            roomName: room.roomName,
            current: current,
            totalConsumption: consumption,
            dailyAvg: dailyAvg
        };
    }).filter(function(s) { return s !== null; });

    // Calculate differences
    if (stats.length >= 2) {
        var maxDaily = Math.max.apply(null, stats.map(function(s) { return s.dailyAvg; }));
        var minDaily = Math.min.apply(null, stats.map(function(s) { return s.dailyAvg; }));
        var maxRoom = stats.find(function(s) { return s.dailyAvg === maxDaily; });
        var minRoom = stats.find(function(s) { return s.dailyAvg === minDaily; });

        container.innerHTML =
            '<div class="comparison-stat">' +
                '<div class="stat-label">最高日耗</div>' +
                '<div class="stat-value">' + maxDaily.toFixed(1) + ' 度/天</div>' +
                '<div style="font-size: 0.8rem; color: #999;">' + (maxRoom ? maxRoom.roomName : '') + '</div>' +
            '</div>' +
            '<div class="comparison-stat">' +
                '<div class="stat-label">最低日耗</div>' +
                '<div class="stat-value">' + minDaily.toFixed(1) + ' 度/天</div>' +
                '<div style="font-size: 0.8rem; color: #999;">' + (minRoom ? minRoom.roomName : '') + '</div>' +
            '</div>' +
            '<div class="comparison-stat">' +
                '<div class="stat-label">用电差距</div>' +
                '<div class="stat-value">' + (maxDaily - minDaily).toFixed(1) + ' 度/天</div>' +
                '<div style="font-size: 0.8rem; color: #999;">相差 ' + ((maxDaily / minDaily - 1) * 100).toFixed(0) + '%</div>' +
            '</div>';
    }
}
