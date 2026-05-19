/**
 * Campus View Module
 *
 * Displays aggregate consumption and recharge statistics for a campus
 * with building rankings and consumption charts.
 *
 * User Story 1: Campus Administrator Overview
 */

import {
    createElement,
    clearElement,
    showLoading,
    showError,
    showEmpty,
    formatNumber,
    formatConsumption,
    formatLargeNumber,
    CACHE_TTL,
} from './utils.js';

import {
    loadCampusAggregate,
    computeOverview,
    calculateTotalConsumption,
    getTopBuildings,
    loadCampusBuildings,
    loadBuildingRooms,
    computeBuildingDailyRanking,
    getAvailableDatesForRanking,
    loadRankingFromLocalStorage,
} from './consumption.js';

import { getUserRoom } from './user-config.js';

import {
    createProgressBar,
    createIncrementalList,
} from './animated-loader.js';

// Alias for backward compatibility
const loadOverview = computeOverview;

/**
 * Generate summary text from statistics
 * @param {Object} stats - Statistics object
 * @returns {string} - Summary text
 */
function generateSummaryText(stats) {
    if (!stats) return '暂无数据';
    const total = formatLargeNumber(stats.total_consumption);
    const rooms = stats.room_count || 0;
    const avg = formatNumber(stats.avg_consumption_per_room || 0, 1);
    return `总消耗 ${total} kWh，共 ${rooms} 个房间，平均每间 ${avg} kWh/天`;
}

// ============================================================================
// State
// ============================================================================

let currentCampus = null;
let campusData = null;
let overviewData = null;

// Chart instances (lazy-loaded)
let consumptionChart = null;
let rankingChart = null;

// Rankings state
const rankingsState = {
    campus: '',
    building: '',
    selectedDate: '',
    availableDates: [],
    progressBarController: null,
    incrementalListController: null
};

// ============================================================================
// Navigation
// ============================================================================

/**
 * Handle campus selection.
 * @param {string} campusName - Selected campus name
 */
export async function selectCampus(campusName) {
    currentCampus = campusName;

    // Update URL hash
    window.location.hash = `/campus/${encodeURIComponent(campusName)}`;

    // Render view
    await renderCampusView(campusName);
}

/**
 * Navigate to building view.
 * @param {string} campusName - Campus name
 * @param {string} buildingName - Building name
 */
export function navigateToBuilding(campusName, buildingName) {
    window.location.hash = `/building/${encodeURIComponent(campusName)}/${encodeURIComponent(buildingName)}`;
}

// ============================================================================
// Main Render
// ============================================================================

/**
 * Render the campus perspective view.
 * @param {string} campusName - Campus to display
 * @param {HTMLElement} container - Container element
 */
export async function renderCampusView(campusName, container = null) {
    if (!container) {
        container = document.getElementById('main-content');
    }

    if (!container) {
        console.error('No container element found');
        return;
    }

    showLoading(container);
    currentCampus = campusName;

    try {
        // Load data
        campusData = await loadCampusAggregate(campusName);

        if (!campusData) {
            showError(container, `无法加载 ${campusName} 的数据`);
            return;
        }

        // Clear and render
        clearElement(container);
        container.appendChild(renderCampusLayout(campusData));

    } catch (error) {
        console.error('Failed to render campus view:', error);
        showError(container, `渲染失败: ${error.message}`);
    }
}

/**
 * Render overview across all campuses.
 * @param {HTMLElement} container - Container element
 */
export async function renderOverview(container = null) {
    if (!container) {
        container = document.getElementById('main-content');
    }

    showLoading(container);

    try {
        overviewData = await loadOverview();

        if (!overviewData) {
            showError(container, '无法加载总览数据');
            return;
        }

        clearElement(container);
        container.appendChild(renderOverviewLayout(overviewData));

    } catch (error) {
        console.error('Failed to render overview:', error);
        showError(container, `渲染失败: ${error.message}`);
    }
}

// ============================================================================
// Layout Components
// ============================================================================

/**
 * Render main campus layout.
 * @param {Object} data - Campus aggregate data
 * @returns {HTMLElement} - Layout element
 */
function renderCampusLayout(data) {
    const fragment = document.createDocumentFragment();

    // Header
    fragment.appendChild(renderCampusHeader(data));

    // Statistics cards
    fragment.appendChild(renderStatisticsCards(data.statistics));

    // Building ranking section
    fragment.appendChild(renderBuildingRankingSection(data.buildings));

    return createElement('div', { className: 'campus-view' }, Array.from(fragment.children));
}

/**
 * Render overview layout.
 * @param {Object} data - Overview data
 * @returns {HTMLElement} - Layout element
 */
function renderOverviewLayout(data) {
    const fragment = document.createDocumentFragment();

    // Header
    fragment.appendChild(createElement('div', { className: 'view-header' }, [
        createElement('h1', { className: 'view-title' }, '电费消耗总览'),
        createElement('p', { className: 'view-subtitle' }, '所有校区消耗与充值统计')
    ]));

    // Global statistics
    fragment.appendChild(renderGlobalStatistics(data.statistics));

    // Set room CTA for users without saved room
    const userRoom = getUserRoom();
    if (!userRoom) {
        fragment.appendChild(createSetRoomCTA());
    }

    // Campus comparison
    fragment.appendChild(renderCampusComparison(data.campuses));

    // Rankings section
    fragment.appendChild(renderRankingsSection());

    return createElement('div', { className: 'overview-view' }, Array.from(fragment.children));
}

/**
 * Render dashboard statistics with modern card layout.
 * @param {Object} stats - Statistics object
 * @returns {HTMLElement} - Dashboard grid
 */
function renderDashboardStatistics(stats) {
    const cards = [
        { icon: '⚡', value: formatLargeNumber(stats.total_consumption), unit: 'kWh', label: '总消耗量' },
        { icon: '🔋', value: formatLargeNumber(stats.total_recharge), unit: 'kWh', label: '总充值量' },
        { icon: '🏠', value: stats.room_count?.toLocaleString('zh-CN') || '0', unit: '间', label: '房间数量' },
        { icon: '🏢', value: stats.building_count?.toLocaleString('zh-CN') || '0', unit: '栋', label: '楼栋数量' },
        { icon: '🏫', value: stats.total_campuses?.toLocaleString('zh-CN') || '4', unit: '个', label: '校区数量' },
        { icon: '⚠️', value: stats.anomaly_rooms?.toLocaleString('zh-CN') || '0', unit: '间', label: '异常房间' }
    ];

    const cardElements = cards.map(card =>
        createElement('div', { className: 'dashboard-card' }, [
            createElement('div', { className: 'dashboard-card-icon' }, card.icon),
            createElement('div', { className: 'dashboard-card-value' }, card.value),
            createElement('div', { className: 'dashboard-card-label' }, `${card.label} ${card.unit}`)
        ])
    );

    return createElement('div', { className: 'dashboard-grid' }, cardElements);
}

/**
 * Render campus overview with modern dashboard layout.
 * @param {Object} data - Campus aggregate data
 * @returns {HTMLElement} - Overview section
 */
function renderCampusOverview(data) {
    const stats = data.statistics || data;

    return createElement('div', { className: 'campus-overview' }, [
        createElement('h2', { className: 'section-title' }, '校区概览'),
        renderDashboardStatistics(stats)
    ]);
}

/**
 * Create "Set my room" call-to-action for users without saved room.
 * @returns {HTMLElement} - CTA element
 */
function createSetRoomCTA() {
    return createElement('div', { className: 'set-room-cta' }, [
        createElement('h3', {}, '🏠 设置您的房间'),
        createElement('p', {}, '设置您的房间后，下次访问将自动显示您房间的电费信息'),
        createElement('button', {
            className: 'set-room-btn',
            onclick: () => {
                window.location.hash = '/';
            }
        }, '选择我的房间')
    ]);
}

// ============================================================================
// Header Component
// ============================================================================

/**
 * Render campus header.
 * @param {Object} data - Campus data
 * @returns {HTMLElement} - Header element
 */
function renderCampusHeader(data) {
    return createElement('div', { className: 'view-header' }, [
        createElement('h1', { className: 'view-title' }, [
            createElement('span', { className: 'campus-icon' }, '🏫'),
            ` ${data.entity_name}`
        ]),
        createElement('p', { className: 'view-subtitle' }, generateSummaryText(data.statistics)),
        createElement('div', { className: 'view-meta' }, [
            createElement('span', { className: 'last-updated' },
                `更新时间: ${data.last_updated ? new Date(data.last_updated).toLocaleString('zh-CN') : '未知'}`
            )
        ])
    ]);
}

// ============================================================================
// Statistics Cards
// ============================================================================

/**
 * Render statistics cards.
 * @param {Object} stats - Statistics object
 * @returns {HTMLElement} - Cards container
 */
function renderStatisticsCards(stats) {
    const cards = [
        {
            label: '总消耗量',
            value: formatLargeNumber(stats.total_consumption),
            unit: 'kWh',
            icon: '⚡',
            color: 'blue'
        },
        {
            label: '总充值量',
            value: formatLargeNumber(stats.total_recharge),
            unit: 'kWh',
            icon: '🔋',
            color: 'green'
        },
        {
            label: '房间数量',
            value: stats.room_count.toLocaleString('zh-CN'),
            unit: '间',
            icon: '🏠',
            color: 'purple'
        },
        {
            label: '平均消耗',
            value: formatNumber(stats.avg_consumption_per_room, 2),
            unit: 'kWh/天',
            icon: '📊',
            color: 'orange'
        }
    ];

    const cardElements = cards.map(card =>
        createElement('div', { className: `stat-card stat-card--${card.color}` }, [
            createElement('div', { className: 'stat-card__icon' }, card.icon),
            createElement('div', { className: 'stat-card__content' }, [
                createElement('div', { className: 'stat-card__label' }, card.label),
                createElement('div', { className: 'stat-card__value' }, [
                    createElement('span', { className: 'stat-card__number' }, card.value),
                    createElement('span', { className: 'stat-card__unit' }, card.unit)
                ])
            ])
        ])
    );

    return createElement('div', { className: 'stats-grid' }, cardElements);
}

/**
 * Render global statistics for overview.
 * @param {Object} stats - Statistics object
 * @returns {HTMLElement} - Statistics section
 */
function renderGlobalStatistics(stats) {
    return createElement('div', { className: 'global-stats' }, [
        createElement('h2', { className: 'section-title' }, '全局统计'),
        createElement('div', { className: 'stats-grid stats-grid--large' }, [
            renderStatItem('总消耗量', formatLargeNumber(stats.total_consumption), 'kWh', '⚡'),
            renderStatItem('总充值量', formatLargeNumber(stats.total_recharge), 'kWh', '🔋'),
            renderStatItem('总房间数', stats.total_rooms.toLocaleString('zh-CN'), '间', '🏠'),
            renderStatItem('总楼栋数', stats.total_buildings.toLocaleString('zh-CN'), '栋', '🏢'),
            renderStatItem('校区数量', stats.total_campuses.toLocaleString('zh-CN'), '个', '🏫'),
            renderStatItem('异常房间', stats.anomaly_rooms.toLocaleString('zh-CN'), '间', '⚠️')
        ])
    ]);
}

/**
 * Render a single stat item.
 */
function renderStatItem(label, value, unit, icon) {
    return createElement('div', { className: 'stat-item' }, [
        createElement('span', { className: 'stat-item__icon' }, icon),
        createElement('div', { className: 'stat-item__content' }, [
            createElement('span', { className: 'stat-item__value' }, value),
            createElement('span', { className: 'stat-item__unit' }, unit),
            createElement('span', { className: 'stat-item__label' }, label)
        ])
    ]);
}

// ============================================================================
// Building Ranking Section
// ============================================================================

/**
 * Render building ranking section.
 * @param {Object[]} buildings - Building array
 * @returns {HTMLElement} - Ranking section
 */
function renderBuildingRankingSection(buildings) {
    if (!buildings || buildings.length === 0) {
        return createElement('div', { className: 'section' }, [
            createElement('h2', { className: 'section-title' }, '楼栋排名'),
            createElement('p', { className: 'empty-message' }, '暂无楼栋数据')
        ]);
    }

    const section = createElement('div', { className: 'section' }, [
        createElement('h2', { className: 'section-title' }, [
            createElement('span', {}, '楼栋排名'),
            createElement('span', { className: 'section-subtitle' }, `共 ${buildings.length} 栋`)
        ])
    ]);

    // Chart container (for future chart implementation)
    const chartContainer = createElement('div', {
        className: 'chart-container',
        id: 'building-ranking-chart'
    });
    section.appendChild(chartContainer);

    // Ranking table
    section.appendChild(renderBuildingTable(buildings));

    return section;
}

/**
 * Render building ranking table.
 * @param {Object[]} buildings - Building array
 * @returns {HTMLElement} - Table element
 */
function renderBuildingTable(buildings) {
    const sortedBuildings = [...buildings].sort((a, b) =>
        (b.consumption || 0) - (a.consumption || 0)
    );

    const rows = sortedBuildings.map((building, index) => {
        const rank = index + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';

        return createElement('tr', {
            className: 'building-row',
            onclick: () => navigateToBuilding(currentCampus, building.building_name)
        }, [
            createElement('td', { className: `rank-cell ${rankClass}` }, rank),
            createElement('td', { className: 'name-cell' }, building.building_name),
            createElement('td', { className: 'consumption-cell' },
                formatConsumption(building.consumption)
            ),
            createElement('td', { className: 'recharge-cell' },
                formatConsumption(building.recharge)
            ),
            createElement('td', { className: 'rooms-cell' },
                `${building.room_count} 间`
            ),
            createElement('td', { className: 'percentile-cell' },
                building.consumption_percentile ? `${building.consumption_percentile}%` : '--'
            )
        ]);
    });

    return createElement('div', { className: 'table-container' }, [
        createElement('table', { className: 'ranking-table' }, [
            createElement('thead', {}, [
                createElement('tr', {}, [
                    createElement('th', {}, '排名'),
                    createElement('th', {}, '楼栋'),
                    createElement('th', {}, '消耗量'),
                    createElement('th', {}, '充值量'),
                    createElement('th', {}, '房间数'),
                    createElement('th', {}, '百分位')
                ])
            ]),
            createElement('tbody', {}, rows)
        ])
    ]);
}

// ============================================================================
// Campus Comparison Section
// ============================================================================

/**
 * Render campus comparison for overview.
 * @param {Object[]} campuses - Campus array
 * @returns {HTMLElement} - Comparison section
 */
function renderCampusComparison(campuses) {
    if (!campuses || campuses.length === 0) {
        return createElement('div', { className: 'section' }, [
            createElement('p', { className: 'empty-message' }, '暂无校区数据')
        ]);
    }

    const section = createElement('div', { className: 'section' }, [
        createElement('h2', { className: 'section-title' }, '校区对比')
    ]);

    const campusCards = campuses.map(campus => {
        return createElement('div', {
            className: 'campus-card',
            onclick: () => selectCampus(campus.campus_name)
        }, [
            createElement('div', { className: 'campus-card__header' }, [
                createElement('h3', { className: 'campus-card__name' }, campus.campus_name),
                createElement('span', { className: 'campus-card__buildings' },
                    `${campus.building_count} 栋`
                )
            ]),
            createElement('div', { className: 'campus-card__stats' }, [
                createElement('div', { className: 'campus-card__stat' }, [
                    createElement('span', { className: 'campus-card__label' }, '消耗量'),
                    createElement('span', { className: 'campus-card__value' },
                        formatLargeNumber(campus.consumption)
                    )
                ]),
                createElement('div', { className: 'campus-card__stat' }, [
                    createElement('span', { className: 'campus-card__label' }, '充值量'),
                    createElement('span', { className: 'campus-card__value' },
                        formatLargeNumber(campus.recharge)
                    )
                ]),
                createElement('div', { className: 'campus-card__stat' }, [
                    createElement('span', { className: 'campus-card__label' }, '房间数'),
                    createElement('span', { className: 'campus-card__value' },
                        campus.room_count.toLocaleString('zh-CN')
                    )
                ])
            ])
        ]);
    });

    section.appendChild(createElement('div', { className: 'campus-grid' }, campusCards));

    return section;
}

// ============================================================================
// Chart Rendering (Lazy-loaded)
// ============================================================================

/**
 * Initialize charts when libraries are available.
 * @param {Object} data - Campus data
 */
async function initializeCharts(data) {
    // Check if Chart.js or ECharts is available
    if (typeof Chart !== 'undefined') {
        renderBuildingRankingChartChartJS(data);
    } else if (typeof echarts !== 'undefined') {
        renderBuildingRankingChartECharts(data);
    } else {
        console.log('Chart library not loaded, skipping chart rendering');
    }
}

/**
 * Render building ranking chart using Chart.js.
 */
function renderBuildingRankingChartChartJS(data) {
    const canvas = document.getElementById('building-ranking-chart');
    if (!canvas) return;

    const chartData = prepareBuildingRankingChart(data.buildings, 10);

    if (consumptionChart) {
        consumptionChart.destroy();
    }

    consumptionChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: '消耗量 (kWh)',
                data: chartData.consumption,
                backgroundColor: 'rgba(54, 162, 235, 0.8)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => formatLargeNumber(value)
                    }
                }
            }
        }
    });
}

/**
 * Render building ranking chart using ECharts.
 */
function renderBuildingRankingChartECharts(data) {
    const container = document.getElementById('building-ranking-chart');
    if (!container) return;

    const chartData = prepareBuildingRankingChart(data.buildings, 10);

    if (rankingChart) {
        rankingChart.dispose();
    }

    rankingChart = echarts.init(container);

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: chartData.labels,
            axisLabel: {
                rotate: 45
            }
        },
        yAxis: {
            type: 'value',
            axisLabel: {
                formatter: value => formatLargeNumber(value)
            }
        },
        series: [{
            name: '消耗量',
            type: 'bar',
            data: chartData.consumption,
            itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: '#83bff6' },
                    { offset: 1, color: '#188df0' }
                ])
            }
        }]
    };

    rankingChart.setOption(option);
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Cleanup when leaving view.
 */
export function cleanup() {
    if (consumptionChart) {
        consumptionChart.destroy();
        consumptionChart = null;
    }
    if (rankingChart) {
        rankingChart.dispose();
        rankingChart = null;
    }
    currentCampus = null;
    campusData = null;
}

// ============================================================================
// Rankings Section (Integrated from rankings.js)
// ============================================================================

/**
 * Render the rankings section for the overview page.
 * @returns {HTMLElement} - Rankings section element
 */
function renderRankingsSection() {
    const section = createElement('div', { className: 'section rankings-section' }, [
        createElement('h2', { className: 'section-title' }, [
            createElement('span', {}, '📊 消耗量排行榜'),
            createElement('span', { className: 'section-subtitle' }, '查看宿舍每日用电消耗排名')
        ])
    ]);

    // Controls container
    const controlsContainer = createElement('div', { className: 'rankings-controls' }, [
        // Campus selector
        createElement('div', { className: 'control-group' }, [
            createElement('label', { for: 'rankings-campus-select' }, '选择校区:'),
            createElement('select', { id: 'rankings-campus-select' }, [
                createElement('option', { value: '' }, '-- 请选择校区 --')
            ])
        ]),
        // Building selector
        createElement('div', { className: 'control-group' }, [
            createElement('label', { for: 'rankings-building-select' }, '选择楼栋:'),
            createElement('select', { id: 'rankings-building-select', disabled: true }, [
                createElement('option', { value: '' }, '-- 请先选择校区 --')
            ])
        ]),
        // Date selector
        createElement('div', { className: 'control-group', id: 'date-selector-group' }, [
            createElement('label', { for: 'rankings-date-select' }, '选择日期:'),
            createElement('select', { id: 'rankings-date-select', disabled: true }, [
                createElement('option', { value: '' }, '-- 请先选择楼栋 --')
            ])
        ])
    ]);
    section.appendChild(controlsContainer);

    // Hint text
    section.appendChild(createElement('p', {
        id: 'rankings-hint',
        className: 'rankings-hint'
    }, '请选择校区、楼栋和日期查看消耗量排名'));

    // Progress bar container
    section.appendChild(createElement('div', {
        id: 'ranking-progress',
        className: 'ranking-progress'
    }));

    // Rankings list container
    section.appendChild(createElement('div', {
        id: 'ranking-list',
        className: 'ranking-list'
    }, [
        createElement('div', { className: 'empty-state' }, [
            createElement('div', { className: 'empty-icon' }, '📊'),
            createElement('p', {}, '请选择校区、楼栋和日期查看消耗量排名')
        ])
    ]));

    // Initialize rankings after the section is added to DOM
    setTimeout(() => initRankingsControls(), 0);

    return section;
}

/**
 * Initialize rankings controls and event listeners.
 */
async function initRankingsControls() {
    const campusSelect = document.getElementById('rankings-campus-select');
    const buildingSelect = document.getElementById('rankings-building-select');
    const dateSelect = document.getElementById('rankings-date-select');

    if (!campusSelect) return;

    try {
        // Load campuses
        const resp = await fetch('./database/summaries/overview.json');
        const overview = await resp.json();

        Object.keys(overview.campuses).forEach(campus => {
            const opt = document.createElement('option');
            opt.value = campus;
            opt.textContent = campus;
            campusSelect.appendChild(opt);
        });

        // Campus change handler
        campusSelect.addEventListener('change', async function() {
            const campus = campusSelect.value;
            buildingSelect.innerHTML = '<option value="">-- 请选择楼栋 --</option>';
            buildingSelect.disabled = true;
            dateSelect.innerHTML = '<option value="">-- 请先选择楼栋 --</option>';
            dateSelect.disabled = true;
            rankingsState.campus = campus;
            rankingsState.building = '';
            rankingsState.selectedDate = '';
            rankingsState.availableDates = [];
            clearRankingsList();

            if (!campus) return;

            try {
                const campusResp = await fetch('./database/summaries/campuses/' + campus + '/summary.json');
                const campusData = await campusResp.json();

                Object.keys(campusData.buildings).forEach(building => {
                    const opt = document.createElement('option');
                    opt.value = building;
                    opt.textContent = building + ' (' + campusData.buildings[building].total_rooms + '间)';
                    buildingSelect.appendChild(opt);
                });

                buildingSelect.disabled = false;
            } catch (e) {
                console.error('Error loading campus data:', e);
            }
        });

        // Building change handler
        buildingSelect.addEventListener('change', async function() {
            rankingsState.building = buildingSelect.value;
            dateSelect.innerHTML = '<option value="">-- 加载日期中 --</option>';
            dateSelect.disabled = true;
            rankingsState.selectedDate = '';
            clearRankingsList();

            if (!rankingsState.building) {
                dateSelect.innerHTML = '<option value="">-- 请选择楼栋 --</option>';
                return;
            }

            try {
                const dates = await getAvailableDatesForRanking(rankingsState.campus, rankingsState.building);
                rankingsState.availableDates = dates;

                dateSelect.innerHTML = '<option value="">-- 请选择日期 --</option>';

                if (dates.length === 0) {
                    dateSelect.innerHTML = '<option value="">-- 无可用日期 --</option>';
                    updateRankingsHint('该楼栋暂无足够的历史数据');
                } else {
                    dates.forEach(date => {
                        const opt = document.createElement('option');
                        opt.value = date;
                        opt.textContent = formatDateForDisplay(date);
                        dateSelect.appendChild(opt);
                    });
                    dateSelect.disabled = false;
                    updateRankingsHint('请选择日期查看消耗量排名');
                }
            } catch (e) {
                console.error('Error loading available dates:', e);
                dateSelect.innerHTML = '<option value="">-- 加载失败 --</option>';
            }
        });

        // Date change handler
        dateSelect.addEventListener('change', function() {
            rankingsState.selectedDate = dateSelect.value;
            if (rankingsState.selectedDate) {
                loadAndDisplayConsumptionRankings();
            }
        });

    } catch (error) {
        console.error('Error loading rankings data:', error);
    }
}

/**
 * Load and display consumption rankings with animated loading.
 */
async function loadAndDisplayConsumptionRankings() {
    const listEl = document.getElementById('ranking-list');
    const progressEl = document.getElementById('ranking-progress');

    if (!listEl) return;

    // Clear previous content
    listEl.innerHTML = '';
    progressEl.innerHTML = '';

    const campus = rankingsState.campus;
    const building = rankingsState.building;
    const date = rankingsState.selectedDate;

    if (!campus || !building || !date) {
        listEl.innerHTML = '<div class="empty-state"><p>请选择校区、楼栋和日期</p></div>';
        return;
    }

    updateRankingsHint('正在计算消耗量排名...');

    // Check localStorage cache first
    const cached = loadRankingFromLocalStorage(campus, building, date);
    if (cached && cached.rankings) {
        renderRankingTable(cached.rankings, listEl);
        updateRankingsHint(formatDateForDisplay(date) + ' 消耗量排名 (已缓存)');
        return;
    }

    // Show progress bar
    rankingsState.progressBarController = createProgressBar(progressEl, {
        label: '正在计算消耗量...',
        showPercentage: true,
        showCount: true
    });

    // Initialize incremental list
    rankingsState.incrementalListController = createIncrementalList(listEl, {
        maxVisible: 20,
        sortKey: 'consumption',
        sortDesc: true,
        renderItem: renderRankingItem
    });

    try {
        // Compute ranking with progress callbacks
        const result = await computeBuildingDailyRanking(
            campus,
            building,
            date,
            {
                onProgress: function(current, total, room) {
                    if (rankingsState.progressBarController) {
                        rankingsState.progressBarController.update(current, total);
                    }
                },
                onRoomComputed: function(roomData) {
                    if (rankingsState.incrementalListController) {
                        rankingsState.incrementalListController.addItem(roomData);
                    }
                }
            }
        );

        // Complete progress bar
        if (rankingsState.progressBarController) {
            rankingsState.progressBarController.complete();
            rankingsState.progressBarController = null;
        }

        // Finalize incremental list
        if (rankingsState.incrementalListController) {
            rankingsState.incrementalListController.finalize();
            rankingsState.incrementalListController = null;
        }

        if (!result || !result.rankings || result.rankings.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><p>暂无该日期的排名数据</p></div>';
            updateRankingsHint('暂无数据');
        } else {
            updateRankingsHint(formatDateForDisplay(date) + ' 消耗量排名 - 共 ' + result.rankings.length + ' 间房间');
        }

    } catch (error) {
        console.error('Failed to load ranking:', error);
        if (rankingsState.progressBarController) {
            rankingsState.progressBarController.complete();
            rankingsState.progressBarController = null;
        }
        listEl.innerHTML = '<div class="empty-state"><p>加载失败: ' + error.message + '</p></div>';
        updateRankingsHint('加载失败');
    }
}

/**
 * Format date for display (YYYY-MM-DD -> MM月DD日).
 */
function formatDateForDisplay(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
    }
    return dateStr;
}

/**
 * Render a single ranking item.
 */
function renderRankingItem(item, rank) {
    const el = document.createElement('div');
    el.className = 'ranking-item consumption-ranking-item';
    el.dataset.roomId = item.room_id;

    const medal = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : '#' + rank;
    const consumptionColor = item.consumption > 5 ? '#ff6b6b' :
                          item.consumption > 2 ? '#feca57' : '#1dd1a1';

    const consumptionText = item.consumption.toFixed(1);

    el.innerHTML =
        '<div class="ranking-medal">' + medal + '</div>' +
        '<div class="ranking-room-info">' +
            '<div class="ranking-room-name">' + (item.room_name || item.room_id) + '</div>' +
            '<div class="ranking-room-balance">余额: ' + (item.current_balance || 0).toFixed(1) + ' kWh</div>' +
        '</div>' +
        '<div class="ranking-consumption">' +
            '<span class="ranking-consumption-value" style="color: ' + consumptionColor + '">' + consumptionText + '</span>' +
            '<span class="ranking-unit">kWh</span>' +
        '</div>' +
        '<div class="ranking-bar-container">' +
            '<div class="ranking-bar" style="width: ' + Math.min(100, item.consumption * 10) + '%; background-color: ' + consumptionColor + ';"></div>' +
        '</div>';

    // Add click handler to navigate to room detail
    el.addEventListener('click', function() {
        navigateToRoomFromRankings(item.room_id);
    });
    el.style.cursor = 'pointer';

    return el;
}

/**
 * Render ranking table (for cached data).
 */
function renderRankingTable(rankings, container) {
    if (!rankings || rankings.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>暂无排名数据</p></div>';
        return;
    }

    // Sort by consumption (descending)
    const sorted = rankings.slice().sort(function(a, b) {
        return (b.consumption || 0) - (a.consumption || 0);
    });

    // Take top 20
    const top20 = sorted.slice(0, 20);

    container.innerHTML = '';
    top20.forEach(function(item, index) {
        container.appendChild(renderRankingItem(item, index + 1));
    });

    // Add "show more" if there are more
    if (sorted.length > 20) {
        const moreBtn = document.createElement('button');
        moreBtn.className = 'show-more-btn';
        moreBtn.textContent = '显示全部 ' + sorted.length + ' 间房间';
        moreBtn.addEventListener('click', function() {
            container.innerHTML = '';
            sorted.forEach(function(item, index) {
                container.appendChild(renderRankingItem(item, index + 1));
            });
        });
        container.appendChild(moreBtn);
    }
}

/**
 * Update rankings hint text.
 */
function updateRankingsHint(text) {
    const hintEl = document.getElementById('rankings-hint');
    if (hintEl) {
        hintEl.textContent = text;
    }
}

/**
 * Clear the rankings list.
 */
function clearRankingsList() {
    const listEl = document.getElementById('ranking-list');
    const progressEl = document.getElementById('ranking-progress');
    if (listEl) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>请选择校区、楼栋和日期查看消耗量排名</p></div>';
    }
    if (progressEl) {
        progressEl.innerHTML = '';
    }
    updateRankingsHint('请选择校区、楼栋和日期查看消耗量排名');
}

/**
 * Navigate to room detail from rankings.
 */
function navigateToRoomFromRankings(roomId) {
    const campus = rankingsState.campus;
    const building = rankingsState.building;

    if (!campus || !building) return;

    // Navigate to room view
    window.location.hash = '/room/' + encodeURIComponent(campus) + '/' + encodeURIComponent(building) + '/' + roomId;
}

// ============================================================================
// Export
// ============================================================================

export default {
    renderCampusView,
    renderOverview,
    selectCampus,
    navigateToBuilding,
    cleanup
};
