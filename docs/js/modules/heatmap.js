/**
 * Heatmap Module
 * Floor electricity consumption heatmap visualization
 */

/**
 * Extract floor number from room name
 */
function extractFloorNumber(roomName) {
    if (!roomName) return null;

    var match = roomName.match(/^(\d+)/);
    if (match) {
        return parseInt(match[1], 10);
    }

    return null;
}

/**
 * Calculate floor averages
 */
function calculateFloorAverages(buildingData) {
    var floors = {};
    var rooms = buildingData.rooms || {};

    Object.keys(rooms).forEach(function(roomId) {
        var roomInfo = rooms[roomId];
        var floor = extractFloorNumber(roomInfo.room_name);
        if (floor === null) return;

        if (!floors[floor]) {
            floors[floor] = {
                floor: floor,
                rooms: [],
                totalBalance: 0,
                roomCount: 0
            };
        }

        var balance = roomInfo.current_balance || 0;
        floors[floor].rooms.push({
            roomId: roomId,
            roomName: roomInfo.room_name,
            balance: balance
        });
        floors[floor].totalBalance += balance;
        floors[floor].roomCount++;
    });

    Object.keys(floors).forEach(function(key) {
        var floor = floors[key];
        floor.avgBalance = floor.totalBalance / floor.roomCount;
    });

    return floors;
}

/**
 * Initialize dashboard page content
 */
function initDashboardPageContent(container) {
    container.innerHTML =
        '<div class="page-container">' +
            '<div class="page-header">' +
                '<h2>🏢 仪表盘</h2>' +
                '<p>查看校区和楼栋用电概览</p>' +
            '</div>' +

            '<div class="control-group" style="margin-bottom: 20px;">' +
                '<label for="dashboard-campus-select">选择校区:</label>' +
                '<select id="dashboard-campus-select">' +
                    '<option value="">-- 请选择校区 --</option>' +
                '</select>' +
            '</div>' +

            '<div class="control-group" style="margin-bottom: 20px;">' +
                '<label for="dashboard-building-select">选择楼栋:</label>' +
                '<select id="dashboard-building-select" disabled>' +
                    '<option value="">-- 请先选择校区 --</option>' +
                '</select>' +
            '</div>' +

            '<div id="dashboard-stats-container"></div>' +
            '<div id="dashboard-heatmap-container"></div>' +
        '</div>';

    loadDashboardData();
}

/**
 * Load dashboard data
 */
async function loadDashboardData() {
    var campusSelect = document.getElementById('dashboard-campus-select');
    var buildingSelect = document.getElementById('dashboard-building-select');

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

        campusSelect.addEventListener('change', async function() {
            var campus = campusSelect.value;
            buildingSelect.innerHTML = '<option value="">-- 请选择楼栋 --</option>';
            buildingSelect.disabled = true;

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

                // Show campus stats
                showCampusStats(campusData);
            } catch (e) {
                console.error('Error loading campus data:', e);
            }
        });

        buildingSelect.addEventListener('change', function() {
            var campus = campusSelect.value;
            var building = buildingSelect.value;
            if (campus && building) {
                loadBuildingHeatmap(campus, building);
            }
        });

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

/**
 * Show campus statistics
 */
function showCampusStats(campusData) {
    var container = document.getElementById('dashboard-stats-container');
    if (!container) return;

    var buildings = Object.keys(campusData.buildings || {});
    var totalRooms = 0;
    var totalConsumption = 0;

    buildings.forEach(function(building) {
        totalRooms += campusData.buildings[building].total_rooms || 0;
    });

    container.innerHTML =
        '<div class="dashboard-stats">' +
            '<div class="dashboard-stat">' +
                '<div class="stat-icon">🏢</div>' +
                '<div class="stat-label">楼栋数</div>' +
                '<div class="stat-value">' + buildings.length + '</div>' +
            '</div>' +
            '<div class="dashboard-stat">' +
                '<div class="stat-icon">🏠</div>' +
                '<div class="stat-label">总房间数</div>' +
                '<div class="stat-value">' + totalRooms + '</div>' +
            '</div>' +
        '</div>';
}

/**
 * Load building heatmap
 */
async function loadBuildingHeatmap(campus, building) {
    var container = document.getElementById('dashboard-heatmap-container');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载楼层数据...</p></div>';

    try {
        var resp = await fetch('./database/summaries/campuses/' + campus + '/buildings/' + building + '/summary.json');
        var buildingData = await resp.json();

        var floorsData = calculateFloorAverages(buildingData);
        var floorList = Object.keys(floorsData).map(function(key) { return floorsData[key]; });
        floorList.sort(function(a, b) { return a.floor - b.floor; });

        if (floorList.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>无法提取楼层数据</p></div>';
            return;
        }

        container.innerHTML = '<h3 style="margin-bottom: 15px;">🏢 楼层用电分布</h3>';

        // Create simple floor visualization
        var floorContainer = document.createElement('div');
        floorContainer.style.display = 'flex';
        floorContainer.style.flexDirection = 'column';
        floorContainer.style.gap = '8px';

        // Calculate min/max for color mapping
        var balances = floorList.map(function(f) { return f.avgBalance; });
        var minBalance = Math.min.apply(null, balances);
        var maxBalance = Math.max.apply(null, balances);

        floorList.forEach(function(floor) {
            var ratio = maxBalance === minBalance ? 0.5 : (floor.avgBalance - minBalance) / (maxBalance - minBalance);

            // Green to Yellow to Red
            var color;
            if (ratio < 0.5) {
                var g = 174;
                var r = Math.floor(255 * (ratio * 2));
                color = 'rgb(' + r + ', ' + g + ', 86)';
            } else {
                var r = 255;
                var g = Math.floor(174 * (1 - (ratio - 0.5) * 2));
                color = 'rgb(' + r + ', ' + g + ', 86)';
            }

            var floorDiv = document.createElement('div');
            floorDiv.style.cssText = 'padding: 15px; border-radius: 8px; background: ' + color + '; color: white; font-weight: bold; cursor: pointer; transition: transform 0.2s;';
            floorDiv.innerHTML = floor.floor + '层 - 平均余额: ' + floor.avgBalance.toFixed(1) + '度 (' + floor.roomCount + '间)';

            floorDiv.addEventListener('click', function() {
                showFloorRoomsModal(floor);
            });

            floorContainer.appendChild(floorDiv);
        });

        container.appendChild(floorContainer);

    } catch (error) {
        console.error('Error loading building heatmap:', error);
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

/**
 * Show floor rooms modal
 */
function showFloorRoomsModal(floor) {
    var modal = document.createElement('div');
    modal.className = 'modal show';

    var roomList = floor.rooms.map(function(room) {
        return '<div class="room-item" style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;">' +
            '<strong>' + room.roomName + '</strong> - ' + room.balance.toFixed(1) + ' 度' +
        '</div>';
    }).join('');

    modal.innerHTML =
        '<div class="modal-content">' +
            '<h3>' + floor.floor + '层 房间列表</h3>' +
            '<p style="color: #666; margin-bottom: 15px;">共 ' + floor.roomCount + ' 间房间</p>' +
            '<div style="max-height: 300px; overflow-y: auto;">' + roomList + '</div>' +
            '<button class="btn" onclick="this.closest(\'.modal\').remove()" style="margin-top: 15px;">关闭</button>' +
        '</div>';

    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Initialize comparison page content (placeholder)
 */
function initComparisonPageContent(container) {
    container.innerHTML =
        '<div class="page-container">' +
            '<div class="page-header">' +
                '<h2>📈 对比分析</h2>' +
                '<p>对比多个房间的用电情况</p>' +
            '</div>' +
            '<div class="empty-state">' +
                '<div class="empty-icon">🚧</div>' +
                '<p>功能开发中，敬请期待...</p>' +
            '</div>' +
        '</div>';
}
