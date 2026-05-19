/**
 * Heatmap Module
 * Floor electricity consumption heatmap visualization
 */

// ============================================================================
// T042: Consumption Intensity Heatmap Functions
// ============================================================================

/**
 * Calculate floor consumption averages for heatmap.
 * @param {Object} buildingData - Building aggregate data with floors
 * @returns {Object} - Floor consumption data
 */
function calculateFloorConsumptionAverages(buildingData) {
    const floors = {};

    if (!buildingData || !buildingData.floors) {
        return floors;
    }

    for (const floor of buildingData.floors) {
        const floorNum = floor.floor_number;
        floors[floorNum] = {
            floor: floorNum,
            roomCount: floor.room_count,
            totalConsumption: floor.total_consumption,
            avgConsumption: floor.avg_consumption,
            anomalyCount: floor.anomaly_rooms ? floor.anomaly_rooms.length : 0
        };
    }

    return floors;
}

/**
 * Create consumption intensity heatmap using ECharts.
 * @param {HTMLElement} container - Container element
 * @param {Object[]} floorsData - Floor consumption data array
 */
function createConsumptionIntensityHeatmap(container, floorsData) {
    if (!container || typeof echarts === 'undefined') return;

    // Clear previous content
    container.innerHTML = '';

    // Create chart container
    const chartContainer = document.createElement('div');
    chartContainer.style.width = '100%';
    chartContainer.style.height = Math.max(300, floorsData.length * 40) + 'px';
    container.appendChild(chartContainer);

    // Sort floors by floor number
    const sortedFloors = [...floorsData].sort((a, b) => a.floor - b.floor);

    // Prepare data
    const floorLabels = sortedFloors.map(f => f.floor + '层');
    const consumptionValues = sortedFloors.map(f => f.avgConsumption);

    // Calculate color range
    const values = consumptionValues.filter(v => v > 0);
    const minVal = values.length > 0 ? Math.min(...values) : 0;
    const maxVal = values.length > 0 ? Math.max(...values) : 1;

    // Initialize chart
    const chart = echarts.init(chartContainer);

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function(params) {
                const data = params[0];
                const floor = sortedFloors[data.dataIndex];
                return '<strong>' + floor.floor + '层</strong><br/>' +
                       '平均消耗: ' + floor.avgConsumption.toFixed(2) + ' kWh/天<br/>' +
                       '总消耗: ' + floor.totalConsumption.toFixed(1) + ' kWh<br/>' +
                       '房间数: ' + floor.roomCount + ' 间' +
                       (floor.anomalyCount > 0 ? '<br/>异常: ' + floor.anomalyCount + ' 间' : '');
            }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            top: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'value',
            name: '平均消耗 (kWh/天)',
            axisLabel: { formatter: '{value}' }
        },
        yAxis: {
            type: 'category',
            data: floorLabels.reverse(),
            axisLabel: { fontWeight: 'bold' }
        },
        series: [{
            name: '平均消耗',
            type: 'bar',
            data: consumptionValues.reverse().map((val, idx) => {
                // Color gradient: green (low) -> yellow -> red (high)
                let color;
                if (maxVal === minVal) {
                    color = '#667eea';
                } else {
                    const ratio = (val - minVal) / (maxVal - minVal);
                    if (ratio < 0.5) {
                        const g = Math.floor(200 + 55 * ratio * 2);
                        color = 'rgb(76, ' + g + ', 80)';
                    } else {
                        const r = Math.floor(76 + 179 * (ratio - 0.5) * 2);
                        color = 'rgb(' + r + ', 200, 80)';
                    }
                }

                return {
                    value: val,
                    itemStyle: {
                        color: color,
                        borderRadius: 4
                    }
                };
            }),
            barWidth: '60%',
            label: {
                show: true,
                position: 'right',
                formatter: function(params) {
                    return params.value.toFixed(2) + ' kWh';
                }
            },
            emphasis: {
                itemStyle: {
                    shadowBlur: 10,
                    shadowColor: 'rgba(0, 0, 0, 0.3)'
                }
            }
        }]
    };

    chart.setOption(option);

    // Resize handler
    window.addEventListener('resize', function() {
        chart.resize();
    });

    return chart;
}

/**
 * Load and display consumption heatmap for a building.
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @param {HTMLElement} container - Container element
 */
async function loadConsumptionHeatmap(campus, building, container) {
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载消耗热图...</p></div>';

    try {
        const response = await fetch('./database/consumption/building/' + campus + '_' + building + '.json');
        if (!response.ok) {
            container.innerHTML = '<div class="empty-state"><p>暂无消耗数据</p></div>';
            return;
        }

        const buildingData = await response.json();
        const floorsData = calculateFloorConsumptionAverages(buildingData);
        const floorList = Object.values(floorsData);

        if (floorList.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>无法提取楼层数据</p></div>';
            return;
        }

        container.innerHTML = '<h3 style="margin-bottom: 15px;">📊 楼层消耗热图</h3>';

        if (typeof echarts !== 'undefined') {
            createConsumptionIntensityHeatmap(container, floorList);
        } else {
            // Fallback to simple visualization
            createSimpleConsumptionHeatmap(container, floorList);
        }

    } catch (error) {
        console.error('Error loading consumption heatmap:', error);
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

/**
 * Create simple div-based consumption heatmap (fallback).
 * @param {HTMLElement} container - Container element
 * @param {Object[]} floorList - Floor data array
 */
function createSimpleConsumptionHeatmap(container, floorList) {
    const floorContainer = document.createElement('div');
    floorContainer.style.display = 'flex';
    floorContainer.style.flexDirection = 'column';
    floorContainer.style.gap = '8px';

    const values = floorList.map(f => f.avgConsumption);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    floorList.forEach(floor => {
        const ratio = maxVal === minVal ? 0.5 : (floor.avgConsumption - minVal) / (maxVal - minVal);

        // Green to Yellow to Red color
        let color;
        if (ratio < 0.5) {
            const g = 200;
            const r = Math.floor(76 + 179 * ratio * 2);
            color = 'rgb(' + r + ', ' + g + ', 80)';
        } else {
            const r = 255;
            const g = Math.floor(255 - 55 * (ratio - 0.5) * 2);
            color = 'rgb(' + r + ', ' + g + ', 80)';
        }

        const floorDiv = document.createElement('div');
        floorDiv.style.cssText = 'padding: 15px; border-radius: 8px; background: ' + color + '; color: white; font-weight: bold; cursor: pointer; transition: transform 0.2s;';
        floorDiv.innerHTML = floor.floor + '层 - 平均: ' + floor.avgConsumption.toFixed(2) + ' kWh/天 (' + floor.roomCount + '间)' +
            (floor.anomalyCount > 0 ? ' ⚠️ 异常' + floor.anomalyCount + '间' : '');

        floorContainer.appendChild(floorDiv);
    });

    container.appendChild(floorContainer);
}

/**
 * Extract floor number from room name
 * Supports multiple formats based on database analysis (15,104 rooms total):
 *
 * Format statistics:
 * - "第X层" format (5,822 rooms): "02舍第3层319房间", "19栋第16层1613"
 * - Pure numbers (4,738 rooms): "608", "0403", "1415"
 * - "XXX房间" format (2,077 rooms): "134房间", "633房间"
 * - "XAXXX" format (928 rooms): "5A521", "4A101"
 * - Hyphenated format (435 rooms): "302-3", "诚园-丙-201"
 * - "层" in brackets (5 rooms): "咖啡馆(二层)"
 * - Other/special (2,069 rooms): Merchant names, etc.
 */
function extractFloorNumber(roomName) {
    if (!roomName) return null;

    // Remove whitespace
    roomName = roomName.trim();

    // ============================================
    // Pattern 1: "第X层" format (HIGHEST PRIORITY)
    // Examples: "02舍第3层319房间", "19栋第16层1613"
    // ============================================
    var layerMatch = roomName.match(/第(\d+)层/);
    if (layerMatch) {
        return parseInt(layerMatch[1], 10);
    }

    // ============================================
    // Pattern 2: Chinese floor numbers in brackets
    // Examples: "咖啡馆(二层)", "机器人(一层东)"
    // ============================================
    var chineseFloorMap = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
        '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20
    };
    var chineseMatch = roomName.match(/[（(](一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五|十六|十七|十八|十九|二十)层/);
    if (chineseMatch) {
        return chineseFloorMap[chineseMatch[1]] || null;
    }

    // ============================================
    // Pattern 3: "XAXXX" format
    // Examples: "4A101", "5A521" -> floor is digit after A
    // ============================================
    var xaMatch = roomName.match(/[0-9]A([0-9])/i);
    if (xaMatch) {
        return parseInt(xaMatch[1], 10);
    }

    // ============================================
    // Pattern 4: Hyphenated format - extract last number part
    // Examples: "诚园-丙-201" -> 201 -> floor 2
    //           "302-3" -> 302 -> floor 3
    // ============================================
    if (roomName.indexOf('-') !== -1) {
        var parts = roomName.split('-');
        var lastPart = parts[parts.length - 1];
        var lastNumMatch = lastPart.match(/(\d+)/);
        if (lastNumMatch) {
            return extractFloorFromNumber(lastNumMatch[1]);
        }
    }

    // ============================================
    // Pattern 5: "XXX房间" format
    // Examples: "134房间", "633房间"
    // ============================================
    if (roomName.indexOf('房间') !== -1) {
        var roomMatch = roomName.match(/(\d+)房间/);
        if (roomMatch) {
            return extractFloorFromNumber(roomMatch[1]);
        }
    }

    // ============================================
    // Pattern 6: Pure numbers or numbers with other text
    // Extract the first number sequence
    // ============================================
    var numMatch = roomName.match(/(\d+)/);
    if (numMatch) {
        return extractFloorFromNumber(numMatch[1]);
    }

    // Cannot extract floor
    return null;
}

/**
 * Helper function: Extract floor from a pure number string
 * Logic:
 * - 4-digit: "1415" -> 14, "0205" -> 2
 * - 3-digit: "608" -> 6, "018" -> 1
 * - 1-2 digit: use as-is
 */
function extractFloorFromNumber(numStr) {
    if (!numStr) return null;

    var len = numStr.length;

    if (len === 4) {
        // 4-digit room number
        // "1415" -> floor 14
        // "0205" -> floor 2 (leading zero, take second digit)
        if (numStr.charAt(0) === '0') {
            return parseInt(numStr.charAt(1), 10);
        }
        return parseInt(numStr.substring(0, 2), 10);
    }

    if (len === 3) {
        // 3-digit room number
        // "608" -> floor 6
        // "018" -> floor 1 (leading zero, take second digit)
        if (numStr.charAt(0) === '0') {
            return parseInt(numStr.charAt(1), 10);
        }
        return parseInt(numStr.charAt(0), 10);
    }

    if (len === 2) {
        // 2-digit: "08" -> floor 0 (basement?) or floor 8
        // Usually first digit is floor
        if (numStr.charAt(0) === '0') {
            return parseInt(numStr.charAt(1), 10);
        }
        return parseInt(numStr.charAt(0), 10);
    }

    // 1-digit: use as-is
    return parseInt(numStr, 10);
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

        // T038: Try to use ECharts for heatmap visualization
        if (typeof echarts !== 'undefined' && floorList.length >= 3) {
            createEChartsHeatmap(container, floorList);
        } else {
            // Fallback to simple div visualization
            createSimpleHeatmap(container, floorList);
        }

    } catch (error) {
        console.error('Error loading building heatmap:', error);
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

/**
 * T038: Create ECharts heatmap visualization
 */
function createEChartsHeatmap(container, floorList) {
    // Create chart container
    var chartContainer = document.createElement('div');
    chartContainer.id = 'echarts-heatmap';
    chartContainer.style.width = '100%';
    chartContainer.style.height = Math.max(300, floorList.length * 40) + 'px';
    container.appendChild(chartContainer);

    // Prepare data for ECharts
    var floorNumbers = floorList.map(function(f) { return f.floor + '层'; });
    var avgBalances = floorList.map(function(f) { return f.avgBalance.toFixed(1); });
    var roomCounts = floorList.map(function(f) { return f.roomCount; });

    // Calculate color range
    var minBalance = Math.min.apply(null, floorList.map(function(f) { return f.avgBalance; }));
    var maxBalance = Math.max.apply(null, floorList.map(function(f) { return f.avgBalance; }));

    // Initialize ECharts
    var chart = echarts.init(chartContainer);

    var option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function(params) {
                var data = params[0];
                var floor = floorList[data.dataIndex];
                return '<strong>' + floor.floor + '层</strong><br/>' +
                       '平均余额: ' + floor.avgBalance.toFixed(1) + ' 度<br/>' +
                       '房间数: ' + floor.roomCount + ' 间';
            }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            top: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'value',
            name: '平均余额 (度)',
            axisLabel: { formatter: '{value}' }
        },
        yAxis: {
            type: 'category',
            data: floorNumbers.reverse(),
            axisLabel: { fontWeight: 'bold' }
        },
        series: [{
            name: '平均余额',
            type: 'bar',
            data: avgBalances.reverse().map(function(val, idx) {
                var floor = floorList[floorList.length - 1 - idx];
                var ratio = maxBalance === minBalance ? 0.5 :
                    (floor.avgBalance - minBalance) / (maxBalance - minBalance);

                // Color gradient: red (low) -> yellow -> green (high)
                var color;
                if (ratio < 0.5) {
                    var r = 231;
                    var g = Math.floor(76 + 149 * ratio * 2);
                    var b = 60;
                    color = 'rgb(' + r + ',' + g + ',' + b + ')';
                } else {
                    var r = Math.floor(231 - 178 * (ratio - 0.5) * 2);
                    var g = 225;
                    var b = 96;
                    color = 'rgb(' + r + ',' + g + ',' + b + ')';
                }

                return {
                    value: parseFloat(val),
                    itemStyle: {
                        color: color,
                        borderRadius: 4
                    }
                };
            }),
            barWidth: '60%',
            label: {
                show: true,
                position: 'right',
                formatter: '{c} 度'
            },
            emphasis: {
                itemStyle: {
                    shadowBlur: 10,
                    shadowColor: 'rgba(0, 0, 0, 0.3)'
                }
            }
        }]
    };

    chart.setOption(option);

    // Click handler for floor details
    chart.on('click', function(params) {
        var floor = floorList[floorList.length - 1 - params.dataIndex];
        if (floor) {
            showFloorRoomsModal(floor);
        }
    });

    // Resize handler
    window.addEventListener('resize', function() {
        chart.resize();
    });
}

/**
 * Simple div-based heatmap (fallback when ECharts not available)
 */
function createSimpleHeatmap(container, floorList) {
    var floorContainer = document.createElement('div');
    floorContainer.style.display = 'flex';
    floorContainer.style.flexDirection = 'column';
    floorContainer.style.gap = '8px';

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
