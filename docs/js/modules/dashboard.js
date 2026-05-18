/**
 * Dashboard Module
 * Campus/Building level statistics and drill-down navigation
 */

var dashboardState = {
    level: 'campus', // campus, building, floor
    campus: null,
    building: null,
    dateRange: 30
};

/**
 * T069-T078: Dashboard implementation
 */
function initCampusDashboardPageContent(container) {
    container.innerHTML =
        '<div class="page-container">' +
            '<div class="page-header">' +
                '<h2>🏢 校区仪表盘</h2>' +
                '<p>查看校区整体用电概况和统计</p>' +
            '</div>' +

            '<div class="dashboard-breadcrumb" id="dashboard-breadcrumb">' +
                '<a href="#/dashboard">全部校区</a>' +
            '</div>' +

            '<div class="control-group" style="margin-bottom: 20px;">' +
                '<label for="dashboard-date-range">时间范围:</label>' +
                '<select id="dashboard-date-range">' +
                    '<option value="7">最近7天</option>' +
                    '<option value="30" selected>最近30天</option>' +
                    '<option value="90">最近3个月</option>' +
                '</select>' +
            '</div>' +

            '<div id="dashboard-stats-container"></div>' +
            '<div id="dashboard-chart-container" style="height: 400px;"></div>' +
            '<div id="dashboard-drilldown-container"></div>' +
        '</div>';

    loadDashboardOverview();
}

/**
 * Load dashboard overview
 */
async function loadDashboardOverview() {
    var statsContainer = document.getElementById('dashboard-stats-container');
    var chartContainer = document.getElementById('dashboard-chart-container');

    if (!statsContainer) return;

    statsContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载校区数据...</p></div>';

    try {
        var resp = await fetch('./database/summaries/overview.json');
        var overview = await resp.json();

        var campuses = Object.keys(overview.campuses);
        var totalRooms = 0;
        var campusStats = [];

        // Load each campus summary
        for (var i = 0; i < campuses.length; i++) {
            var campus = campuses[i];
            totalRooms += overview.campuses[campus].total_rooms || 0;

            try {
                var campusResp = await fetch('./database/summaries/campuses/' + campus + '/summary.json');
                var campusData = await campusResp.json();

                var buildingCount = Object.keys(campusData.buildings || {}).length;
                var campusRoomCount = overview.campuses[campus].total_rooms || 0;

                campusStats.push({
                    name: campus,
                    buildingCount: buildingCount,
                    roomCount: campusRoomCount,
                    onClick: function(c) {
                        return function() {
                            drillDownToCampus(c);
                        };
                    }(campus)
                });
            } catch (e) {
                console.error('Error loading campus:', campus, e);
            }
        }

        // Render stats
        statsContainer.innerHTML =
            '<div class="dashboard-stats">' +
                '<div class="dashboard-stat" style="cursor: pointer;" onclick="showCampusComparison()">' +
                    '<div class="stat-icon">🏫</div>' +
                    '<div class="stat-label">校区数</div>' +
                    '<div class="stat-value">' + campuses.length + '</div>' +
                '</div>' +
                '<div class="dashboard-stat">' +
                    '<div class="stat-icon">🏢</div>' +
                    '<div class="stat-label">总楼栋数</div>' +
                    '<div class="stat-value">' + campusStats.reduce(function(s, c) { return s + c.buildingCount; }, 0) + '</div>' +
                '</div>' +
                '<div class="dashboard-stat">' +
                    '<div class="stat-icon">🏠</div>' +
                    '<div class="stat-label">总房间数</div>' +
                    '<div class="stat-value">' + totalRooms.toLocaleString() + '</div>' +
                '</div>' +
            '</div>';

        // Render campus comparison chart
        if (typeof echarts !== 'undefined') {
            renderCampusComparisonChart(chartContainer, campusStats);
        }

    } catch (error) {
        console.error('Error loading dashboard:', error);
        statsContainer.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

/**
 * T072: Render campus comparison chart
 */
function renderCampusComparisonChart(container, campusStats) {
    if (!container || campusStats.length === 0) return;

    container.innerHTML = '';

    var chart = echarts.init(container);

    var option = {
        title: {
            text: '校区房间数对比',
            left: 'center'
        },
        tooltip: {
            trigger: 'item',
            formatter: '{b}: {c} 间 ({d}%)'
        },
        legend: {
            orient: 'vertical',
            left: 'left',
            top: 'middle'
        },
        series: [{
            name: '房间数',
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['60%', '50%'],
            avoidLabelOverlap: false,
            itemStyle: {
                borderRadius: 10,
                borderColor: '#fff',
                borderWidth: 2
            },
            label: {
                show: true,
                formatter: '{b}: {c}'
            },
            emphasis: {
                label: {
                    show: true,
                    fontSize: 16,
                    fontWeight: 'bold'
                }
            },
            data: campusStats.map(function(c, i) {
                var colors = ['#667eea', '#27ae60', '#f39c12', '#e74c3c', '#9b59b6'];
                return {
                    value: c.roomCount,
                    name: c.name,
                    itemStyle: { color: colors[i % colors.length] }
                };
            })
        }]
    };

    chart.setOption(option);

    // Click to drill down
    chart.on('click', function(params) {
        var campus = campusStats.find(function(c) { return c.name === params.name; });
        if (campus) {
            drillDownToCampus(campus.name);
        }
    });

    window.addEventListener('resize', function() {
        chart.resize();
    });
}

/**
 * T073: Drill down to campus level
 */
async function drillDownToCampus(campus) {
    dashboardState.level = 'campus';
    dashboardState.campus = campus;

    var breadcrumb = document.getElementById('dashboard-breadcrumb');
    if (breadcrumb) {
        breadcrumb.innerHTML =
            '<a href="#/dashboard" onclick="loadDashboardOverview()">全部校区</a>' +
            '<span class="separator">›</span>' +
            '<span>' + campus + '</span>';
    }

    var statsContainer = document.getElementById('dashboard-stats-container');
    var chartContainer = document.getElementById('dashboard-chart-container');

    if (statsContainer) {
        statsContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载楼栋数据...</p></div>';
    }

    try {
        var resp = await fetch('./database/summaries/campuses/' + campus + '/summary.json');
        var campusData = await resp.json();

        var buildings = Object.keys(campusData.buildings || {});
        var totalRooms = buildings.reduce(function(sum, b) {
            return sum + (campusData.buildings[b].total_rooms || 0);
        }, 0);

        if (statsContainer) {
            statsContainer.innerHTML =
                '<div class="dashboard-stats">' +
                    '<div class="dashboard-stat">' +
                        '<div class="stat-icon">🏢</div>' +
                        '<div class="stat-label">楼栋数</div>' +
                        '<div class="stat-value">' + buildings.length + '</div>' +
                    '</div>' +
                    '<div class="dashboard-stat">' +
                        '<div class="stat-icon">🏠</div>' +
                        '<div class="stat-label">房间数</div>' +
                        '<div class="stat-value">' + totalRooms.toLocaleString() + '</div>' +
                    '</div>' +
                '</div>';
        }

        // Building list for drill down
        var drilldownContainer = document.getElementById('dashboard-drilldown-container');
        if (drilldownContainer) {
            drilldownContainer.innerHTML = '<h3 style="margin-top: 20px;">楼栋列表</h3>';

            buildings.forEach(function(building) {
                var roomCount = campusData.buildings[building].total_rooms || 0;
                var item = document.createElement('div');
                item.className = 'leaderboard-item';
                item.style.cursor = 'pointer';
                item.innerHTML =
                    '<div class="position normal">' + building + '</div>' +
                    '<div style="flex: 1;">' +
                        '<div style="font-weight: 600;">' + building + '</div>' +
                        '<div style="font-size: 0.85rem; color: #666;">' + roomCount + ' 间房间</div>' +
                    '</div>';
                item.addEventListener('click', function() {
                    drillDownToBuilding(campus, building);
                });
                drilldownContainer.appendChild(item);
            });
        }

    } catch (error) {
        console.error('Error loading campus data:', error);
    }
}

/**
 * Drill down to building level
 */
async function drillDownToBuilding(campus, building) {
    dashboardState.level = 'building';
    dashboardState.building = building;

    var breadcrumb = document.getElementById('dashboard-breadcrumb');
    if (breadcrumb) {
        breadcrumb.innerHTML =
            '<a href="#/dashboard" onclick="loadDashboardOverview()">全部校区</a>' +
            '<span class="separator">›</span>' +
            '<a href="#" onclick="drillDownToCampus(\'' + campus + '\')">' + campus + '</a>' +
            '<span class="separator">›</span>' +
            '<span>' + building + '</span>';
    }

    // Use heatmap module for floor visualization
    if (typeof loadBuildingHeatmap === 'function') {
        var container = document.getElementById('dashboard-drilldown-container');
        if (container) {
            container.innerHTML = '<div id="dashboard-heatmap-container"></div>';
            loadBuildingHeatmap(campus, building);
        }
    }
}

/**
 * Show campus comparison
 */
function showCampusComparison() {
    loadDashboardOverview();
}

// Override dashboard page handler
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

    if (typeof initCampusDashboardPageContent === 'function') {
        initCampusDashboardPageContent(pageContainer);
    }
}
