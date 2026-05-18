/**
 * Rankings Module
 * Building electricity rankings and comparisons
 */

/**
 * Calculate rankings for rooms in a building
 * 使用 building summary 中的数据（只有 current_balance）
 */
function calculateRankings(buildingData, category, days) {
    category = category || 'high';
    days = days || 30;

    var rooms = buildingData.rooms || {};
    var rankedRooms = [];

    Object.keys(rooms).forEach(function(roomId) {
        var roomInfo = rooms[roomId];
        var rankData = calculateRoomRankValue(roomInfo, category, days);
        rankedRooms.push({
            roomId: roomId,
            roomName: roomInfo.room_name,
            currentBalance: roomInfo.current_balance || 0,
            rankValue: rankData.rankValue,
            label: rankData.label
        });
    });

    // Sort by rank value
    // - low (余额不足): 升序，余额低的排前面
    // - savers (节能模范): 降序，余额高的排前面
    // - high (高耗电): 降序，rankValue = 500 - balance，余额低的排前面
    var sortOrder = category === 'low' ? 'asc' : 'desc';
    rankedRooms.sort(function(a, b) {
        if (sortOrder === 'desc') return b.rankValue - a.rankValue;
        return a.rankValue - b.rankValue;
    });

    return rankedRooms.slice(0, 20);
}

/**
 * Calculate rank value for a room
 * 注意：building summary 中没有 balance_history，只有 current_balance
 */
function calculateRoomRankValue(roomInfo, category, days) {
    var balance = roomInfo.current_balance || 0;

    var rankValue = 0;
    var label = '';

    if (category === 'high') {
        // 高耗电：余额越低说明消耗越多（反向排序）
        // 使用反向余额作为排名值（余额低的排名靠前）
        rankValue = 500 - balance; // 假设初始余额约500度
        if (rankValue < 0) rankValue = 0;
        label = '当前余额 ' + balance.toFixed(1) + ' 度';
    } else if (category === 'savers') {
        // 节能模范：余额越高说明消耗越少
        rankValue = balance;
        label = '当前余额 ' + balance.toFixed(1) + ' 度';
    } else if (category === 'low') {
        // 余额不足：余额最低的排在前面
        rankValue = balance;
        label = '当前余额 ' + balance.toFixed(1) + ' 度';
    } else if (category === 'growth') {
        // 用电增长：需要历史数据，summary中没有
        // 显示提示信息
        rankValue = 0;
        label = '需详细数据';
    }

    return { rankValue: rankValue, label: label };
}

function createRankingCard(rank, index) {
    var card = document.createElement('div');
    card.className = 'ranking-card';
    card.dataset.roomId = rank.roomId;
    card.dataset.roomName = rank.roomName;
    card.style.cursor = 'pointer';

    var isTop3 = index < 3;
    card.innerHTML =
        '<div class="rank-number ' + (isTop3 ? 'top-3' : '') + '">' + (index + 1) + '</div>' +
        '<div class="room-info">' +
            '<div class="room-name">' + rank.roomName + '</div>' +
            '<div class="room-stats">' + rank.label + '</div>' +
        '</div>' +
        '<div class="rank-value">' + formatValue(rank.currentBalance) + ' 度</div>';

    // T032: Add click-to-detail navigation
    card.addEventListener('click', function() {
        navigateToRoomDetail(rank.roomId, rank.roomName);
    });

    return card;
}

/**
 * T032: Navigate to room detail page
 * Sets the room selection and navigates to home page to show details
 */
function navigateToRoomDetail(roomId, roomName) {
    // Get current selections
    var campusSelect = document.getElementById('rankings-campus-select');
    var buildingSelect = document.getElementById('rankings-building-select');

    if (!campusSelect || !buildingSelect) return;

    var campus = campusSelect.value;
    var building = buildingSelect.value;

    if (!campus || !building) return;

    // Store navigation info in state for the home page to pick up
    if (typeof state !== 'undefined') {
        state.pendingRoomNavigation = {
            campus: campus,
            building: building,
            roomId: roomId,
            roomName: roomName
        };
    }

    // Navigate to home page which will handle the room selection
    window.location.hash = '/';
}

function formatValue(value) {
    if (value === 0) return '--';
    if (value > 1000) return (value / 1000).toFixed(1) + 'k';
    return value.toFixed(1);
}

function getCategoryLabel(category) {
    var labels = {
        high: '当前余额 (度)',
        savers: '当前余额 (度)',
        low: '当前余额 (度)',
        growth: '需要历史数据'
    };
    return labels[category] || category;
}

function getCategoryDescription(category) {
    var descriptions = {
        high: '余额较低的房间可能消耗较多',
        savers: '余额较高的房间消耗较少',
        low: '余额最低的房间需要关注',
        growth: '需要加载详细数据进行分析'
    };
    return descriptions[category] || '';
}

var rankingsState = {
    campus: '',
    building: '',
    category: 'high',
    days: 30
};

function initRankingsPageContent(container) {
    container.innerHTML =
        '<div class="page-container">' +
            '<div class="page-header">' +
                '<h2>📊 排行榜</h2>' +
                '<p>查看宿舍用电排名，对比分析能耗情况</p>' +
            '</div>' +

            '<div class="control-group" style="margin-bottom: 20px;">' +
                '<label for="rankings-campus-select">选择校区:</label>' +
                '<select id="rankings-campus-select">' +
                    '<option value="">-- 请选择校区 --</option>' +
                '</select>' +
            '</div>' +

            '<div class="control-group" style="margin-bottom: 20px;">' +
                '<label for="rankings-building-select">选择楼栋:</label>' +
                '<select id="rankings-building-select" disabled>' +
                    '<option value="">-- 请先选择校区 --</option>' +
                '</select>' +
            '</div>' +

            '<div class="tabs" id="rankings-tabs">' +
                '<div class="tab active" data-category="low">⚠️ 余额不足</div>' +
                '<div class="tab" data-category="savers">🌱 节能模范</div>' +
                '<div class="tab" data-category="high">⚡ 高耗电</div>' +
            '</div>' +

            '<p id="rankings-hint" style="color: #666; margin-bottom: 15px; font-size: 0.9rem;"></p>' +

            '<div id="rankings-chart-container" class="chart-container" style="height: 300px; display: none;"></div>' +

            '<div class="ranking-list" id="ranking-list">' +
                '<div class="empty-state">' +
                    '<div class="empty-icon">📊</div>' +
                    '<p>请选择校区和楼栋查看排名</p>' +
                '</div>' +
            '</div>' +
        '</div>';

    loadRankingsData(container);
}

async function loadRankingsData(container) {
    var campusSelect = document.getElementById('rankings-campus-select');
    var buildingSelect = document.getElementById('rankings-building-select');

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
            rankingsState.campus = campus;
            rankingsState.building = '';

            if (!campus) return;

            try {
                var campusResp = await fetch('./database/summaries/campuses/' + campus + '/summary.json');
                var campusData = await campusResp.json();

                Object.keys(campusData.buildings).forEach(function(building) {
                    var opt = document.createElement('option');
                    opt.value = building;
                    opt.textContent = building + ' (' + campusData.buildings[building].total_rooms + '间)';
                    buildingSelect.appendChild(opt);
                });

                buildingSelect.disabled = false;
            } catch (e) {
                console.error('Error loading campus data:', e);
            }
        });

        buildingSelect.addEventListener('change', function() {
            rankingsState.building = buildingSelect.value;
            loadBuildingRankings();
        });

        // Tab handlers
        var tabsContainer = document.getElementById('rankings-tabs');
        if (tabsContainer) {
            tabsContainer.querySelectorAll('.tab').forEach(function(tab) {
                tab.addEventListener('click', function(e) {
                    tabsContainer.querySelectorAll('.tab').forEach(function(t) {
                        t.classList.remove('active');
                    });
                    e.target.classList.add('active');
                    rankingsState.category = e.target.dataset.category;
                    loadBuildingRankings();
                });
            });
        }

    } catch (error) {
        console.error('Error loading rankings data:', error);
    }
}

async function loadBuildingRankings() {
    var campus = rankingsState.campus;
    var building = rankingsState.building;
    var category = rankingsState.category;

    if (!campus || !building) return;

    var listEl = document.getElementById('ranking-list');
    var chartContainer = document.getElementById('rankings-chart-container');
    var hintEl = document.getElementById('rankings-hint');

    if (!listEl) return;

    listEl.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载排名数据...</p></div>';

    // Update hint
    if (hintEl) {
        hintEl.textContent = getCategoryDescription(category);
    }

    try {
        var resp = await fetch('./database/summaries/campuses/' + campus + '/buildings/' + building + '/summary.json');
        var buildingData = await resp.json();

        var rankedRooms = calculateRankings(buildingData, category, 30);

        if (chartContainer) {
            chartContainer.style.display = 'block';
            chartContainer.innerHTML = '<canvas id="ranking-chart-canvas"></canvas>';

            var canvas = document.getElementById('ranking-chart-canvas');
            if (canvas) {
                var labels = rankedRooms.slice(0, 10).map(function(r) { return r.roomName; });
                var data = rankedRooms.slice(0, 10).map(function(r) { return r.currentBalance; });

                // 根据类别设置颜色
                var colors;
                if (category === 'low') {
                    // 余额不足：红色系
                    colors = data.map(function(_, i) {
                        if (i < 3) return '#e74c3c';
                        return '#f39c12';
                    });
                } else if (category === 'savers') {
                    // 节能模范：绿色系
                    colors = data.map(function(_, i) {
                        if (i < 3) return '#27ae60';
                        return '#2ecc71';
                    });
                } else {
                    // 高耗电：橙色系
                    colors = data.map(function(_, i) {
                        if (i < 3) return '#e67e22';
                        return '#f39c12';
                    });
                }

                new Chart(canvas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: '当前余额 (度)',
                            data: data,
                            backgroundColor: colors,
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true } }
                    }
                });
            }
        }

        listEl.innerHTML = '';
        rankedRooms.forEach(function(rank, index) {
            listEl.appendChild(createRankingCard(rank, index));
        });

    } catch (error) {
        console.error('Error loading building rankings:', error);
        listEl.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}
