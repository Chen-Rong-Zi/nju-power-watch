/**
 * Building View Module
 *
 * Displays floor-level consumption breakdown with visual heat map
 * and anomaly detection for building managers.
 *
 * User Story 2: Building Manager Analysis
 * User Story 2 (Refactor): Consumption-based rankings with animated loading
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
    getConsumptionColor,
    getAnomalyColor,
} from './utils.js';

import {
    loadBuildingAggregate,
    getTopBuildings,
    computeBuildingDailyRanking,
    getAvailableDatesForRanking,
    loadRankingFromLocalStorage,
} from './consumption.js';

import {
    createSkeleton,
    createProgressBar,
    createIncrementalList,
} from './animated-loader.js';

// ============================================================================
// State
// ============================================================================

let currentBuilding = null;
let currentCampus = null;
let buildingData = null;
let heatmapChart = null;
let trendChart = null;
let selectedDate = null;
let incrementalListController = null;
let progressBarController = null;

// ============================================================================
// Navigation
// ============================================================================

/**
 * Navigate to room view.
 * @param {string} campusName - Campus name
 * @param {string} buildingName - Building name
 * @param {string} roomId - Room ID
 */
export function navigateToRoom(campusName, buildingName, roomId) {
    window.location.hash = `/room/${encodeURIComponent(campusName)}/${encodeURIComponent(buildingName)}/${roomId}`;
}

// ============================================================================
// Main Render
// ============================================================================

/**
 * Render the building perspective view.
 * @param {string} campusName - Campus name
 * @param {string} buildingName - Building name
 * @param {HTMLElement} container - Container element
 */
export async function renderBuildingView(campusName, buildingName, container = null) {
    if (!container) {
        container = document.getElementById('main-content');
    }

    if (!container) {
        console.error('No container element found');
        return;
    }

    // Show skeleton loading first
    showSkeletonLoading(container);
    currentBuilding = buildingName;
    currentCampus = campusName;

    try {
        // Load data
        buildingData = await loadBuildingAggregate(campusName, buildingName);

        if (!buildingData) {
            showError(container, `无法加载 ${buildingName} 的数据`);
            return;
        }

        // Get available dates for ranking
        const availableDates = await getAvailableDatesForRanking(campusName, buildingName);
        selectedDate = availableDates.length > 0 ? availableDates[0] : null;

        // Clear and render
        clearElement(container);
        container.appendChild(renderBuildingLayout(buildingData, availableDates));

    } catch (error) {
        console.error('Failed to render building view:', error);
        showError(container, `渲染失败: ${error.message}`);
    }
}

/**
 * Show skeleton loading for building view.
 * @param {HTMLElement} container - Container element
 */
function showSkeletonLoading(container) {
    container.innerHTML = `
        <div class="building-view">
            <div class="skeleton skeleton-title" style="width: 200px; height: 32px; margin-bottom: 10px;"></div>
            <div class="skeleton skeleton-text" style="width: 300px; height: 20px; margin-bottom: 20px;"></div>
            <div class="stats-grid">
                ${Array(4).fill().map(() => `
                    <div class="skeleton-card">
                        <div class="skeleton skeleton-text" style="width: 60%;"></div>
                        <div class="skeleton skeleton-title" style="width: 80%;"></div>
                    </div>
                `).join('')}
            </div>
            <div class="skeleton skeleton-chart" style="height: 300px; margin-top: 20px;"></div>
        </div>
    `;
}

// ============================================================================
// Layout Components
// ============================================================================

/**
 * Render main building layout.
 * @param {Object} data - Building aggregate data
 * @param {string[]} availableDates - Available dates for ranking
 * @returns {HTMLElement} - Layout element
 */
function renderBuildingLayout(data, availableDates = []) {
    const fragment = document.createDocumentFragment();

    // Header
    fragment.appendChild(renderBuildingHeader(data));

    // Statistics cards - use data directly if no nested statistics
    const stats = data.statistics || {
        total_consumption: data.total_consumption,
        total_recharge: data.total_recharge,
        room_count: data.room_count,
        avg_consumption_per_room: data.avg_consumption_per_room,
        anomaly_count: data.anomaly_count || 0
    };
    fragment.appendChild(renderBuildingStatistics(stats));

    // Daily consumption ranking section (User Story 2)
    fragment.appendChild(renderDailyRankingSection(availableDates));

    // Floor heatmap section
    fragment.appendChild(renderFloorHeatmapSection(data.floors));

    // Anomaly rooms section
    fragment.appendChild(renderAnomalySection(data.anomaly_rooms));

    return createElement('div', { className: 'building-view' }, Array.from(fragment.children));
}

// ============================================================================
// Header Component
// ============================================================================

/**
 * Render building header.
 * @param {Object} data - Building data
 * @returns {HTMLElement} - Header element
 */
function renderBuildingHeader(data) {
    const roomCount = data.room_count || data.statistics?.room_count || 0;
    const anomalyCount = data.anomaly_count || data.statistics?.anomaly_count || 0;

    return createElement('div', { className: 'view-header' }, [
        createElement('h1', { className: 'view-title' }, [
            createElement('span', { className: 'building-icon' }, '🏢'),
            ` ${data.entity_name}`
        ]),
        createElement('p', { className: 'view-subtitle' },
            `${data.campus_name || data.campus} | ${roomCount} 间房间 | 异常 ${anomalyCount} 间`
        ),
        createElement('div', { className: 'view-meta' }, [
            createElement('span', { className: 'last-updated' },
                `更新时间: ${data.last_updated ? new Date(data.last_updated).toLocaleString('zh-CN') : '未知'}`
            ),
            createElement('a', {
                className: 'back-link',
                href: `#campus/${encodeURIComponent(data.campus_name || data.campus)}`,
                onclick: (e) => {
                    e.preventDefault();
                    window.location.hash = `/campus/${encodeURIComponent(data.campus_name || data.campus)}`;
                }
            }, '← 返回校区')
        ])
    ]);
}

// ============================================================================
// Statistics Cards
// ============================================================================

/**
 * Render building statistics cards.
 * @param {Object} stats - Statistics object
 * @returns {HTMLElement} - Cards container
 */
function renderBuildingStatistics(stats) {
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
            label: '平均消耗',
            value: formatNumber(stats.avg_consumption_per_room, 2),
            unit: 'kWh/间',
            icon: '📊',
            color: 'purple'
        },
        {
            label: '异常房间',
            value: stats.anomaly_count,
            unit: '间',
            icon: '⚠️',
            color: stats.anomaly_count > 0 ? 'red' : 'green'
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

// ============================================================================
// Daily Consumption Ranking Section (User Story 2)
// ============================================================================

/**
 * Render daily consumption ranking section.
 * @param {string[]} availableDates - Available dates for selection
 * @returns {HTMLElement} - Ranking section
 */
function renderDailyRankingSection(availableDates) {
    const section = createElement('div', { className: 'section ranking-section' }, [
        createElement('h2', { className: 'section-title' }, '📊 每日消耗量排行榜')
    ]);

    // Date selector
    const dateSelectorContainer = createElement('div', { className: 'date-selector-container' }, [
        createElement('label', { for: 'ranking-date-select' }, '选择日期:'),
        createElement('select', {
            id: 'ranking-date-select',
            className: 'date-selector',
            onchange: (e) => handleDateChange(e.target.value)
        }, availableDates.map(date =>
            createElement('option', {
                value: date,
                selected: date === selectedDate
            }, formatDateForDisplay(date))
        ))
    ]);
    section.appendChild(dateSelectorContainer);

    // Progress bar container (for animated loading)
    const progressContainer = createElement('div', {
        id: 'ranking-progress',
        className: 'ranking-progress'
    });
    section.appendChild(progressContainer);

    // Ranking list container
    const rankingContainer = createElement('div', {
        id: 'ranking-list',
        className: 'ranking-list'
    });
    section.appendChild(rankingContainer);

    // Load ranking if date is selected
    if (selectedDate) {
        loadAndDisplayRanking(selectedDate, rankingContainer, progressContainer);
    }

    return section;
}

/**
 * Format date for display (YYYY-MM-DD -> MM月DD日).
 * @param {string} dateStr - Date string
 * @returns {string} - Formatted date
 */
function formatDateForDisplay(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parseInt(parts[1])}月${parseInt(parts[2])}日`;
    }
    return dateStr;
}

/**
 * Handle date change event.
 * @param {string} newDate - New selected date
 */
function handleDateChange(newDate) {
    selectedDate = newDate;

    const rankingContainer = document.getElementById('ranking-list');
    const progressContainer = document.getElementById('ranking-progress');

    if (rankingContainer && progressContainer) {
        loadAndDisplayRanking(newDate, rankingContainer, progressContainer);
    }
}

/**
 * Load and display ranking with animated loading.
 * @param {string} date - Target date
 * @param {HTMLElement} listContainer - Ranking list container
 * @param {HTMLElement} progressContainer - Progress bar container
 */
async function loadAndDisplayRanking(date, listContainer, progressContainer) {
    // Clear previous content
    listContainer.innerHTML = '';
    progressContainer.innerHTML = '';

    // Check localStorage cache first
    const cached = loadRankingFromLocalStorage(currentCampus, currentBuilding, date);
    if (cached && cached.rankings) {
        renderRankingTable(cached.rankings, listContainer);
        return;
    }

    // Show progress bar
    progressBarController = createProgressBar(progressContainer, {
        label: '正在计算消耗量...',
        showPercentage: true,
        showCount: true
    });

    // Initialize incremental list
    incrementalListController = createIncrementalList(listContainer, {
        maxVisible: 50,
        sortKey: 'consumption',
        sortDesc: true,
        renderItem: renderRankingItem,
        animationDelay: 100 // Slower animation for better visibility
    });

    try {
        // Compute ranking with progress callbacks
        const result = await computeBuildingDailyRanking(
            currentCampus,
            currentBuilding,
            date,
            {
                onProgress: (current, total, room) => {
                    if (progressBarController) {
                        progressBarController.update(current, total);
                    }
                },
                onRoomComputed: (roomData) => {
                    if (incrementalListController) {
                        incrementalListController.addItem(roomData);
                    }
                }
            }
        );

        // Complete progress bar
        if (progressBarController) {
            progressBarController.complete();
            progressBarController = null;
        }

        // Finalize incremental list
        if (incrementalListController) {
            incrementalListController.finalize();
            incrementalListController = null;
        }

        if (!result || !result.rankings) {
            listContainer.innerHTML = '<p class="empty-message">暂无该日期的排名数据</p>';
        }

    } catch (error) {
        console.error('Failed to load ranking:', error);
        if (progressBarController) {
            progressBarController.complete();
        }
        listContainer.innerHTML = `<p class="error-message">加载失败: ${error.message}</p>`;
    }
}

/**
 * Custom render function for ranking item.
 * @param {Object} item - Ranking item
 * @param {number} rank - Rank position
 * @returns {HTMLElement} - Item element
 */
function renderRankingItem(item, rank) {
    const medal = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`;
    const consumptionColor = item.consumption > 5 ? '#ff6b6b' :
                            item.consumption > 2 ? '#feca57' : '#1dd1a1';

    return createElement('div', {
        className: 'ranking-item',
        onclick: () => navigateToRoom(item.campus, item.building, item.room_id)
    }, [
        createElement('span', { className: 'ranking-medal' }, medal),
        createElement('span', { className: 'ranking-room-name' }, item.room_name),
        createElement('div', { className: 'ranking-consumption' }, [
            createElement('span', {
                className: 'ranking-consumption-value',
                style: { color: consumptionColor }
            }, formatConsumption(item.consumption)),
            createElement('span', { className: 'ranking-unit' }, 'kWh')
        ]),
        createElement('div', { className: 'ranking-bar-container' }, [
            createElement('div', {
                className: 'ranking-bar',
                style: {
                    width: `${Math.min(100, item.consumption * 10)}%`,
                    backgroundColor: consumptionColor
                }
            })
        ])
    ]);
}

/**
 * Render ranking table (for cached data).
 * @param {Object[]} rankings - Ranking data array
 * @param {HTMLElement} container - Container element
 */
function renderRankingTable(rankings, container) {
    if (!rankings || rankings.length === 0) {
        container.innerHTML = '<p class="empty-message">暂无排名数据</p>';
        return;
    }

    // Sort by consumption (descending)
    const sorted = [...rankings].sort((a, b) => b.consumption - a.consumption);

    // Take top 20
    const top20 = sorted.slice(0, 20);

    const items = top20.map((item, index) => renderRankingItem(item, index + 1));
    container.innerHTML = '';
    items.forEach(item => container.appendChild(item));

    // Add "show more" if there are more
    if (sorted.length > 20) {
        const moreBtn = createElement('button', {
            className: 'show-more-btn',
            onclick: () => {
                // Show all rankings
                container.innerHTML = '';
                sorted.forEach((item, index) => {
                    container.appendChild(renderRankingItem(item, index + 1));
                });
            }
        }, `显示全部 ${sorted.length} 间房间`);
        container.appendChild(moreBtn);
    }
}

// ============================================================================
// Floor Heatmap Section
// ============================================================================

/**
 * Render floor heatmap section.
 * @param {Object[]} floors - Floor data array
 * @returns {HTMLElement} - Heatmap section
 */
function renderFloorHeatmapSection(floors) {
    if (!floors || floors.length === 0) {
        return createElement('div', { className: 'section' }, [
            createElement('h2', { className: 'section-title' }, '楼层消耗分布'),
            createElement('p', { className: 'empty-message' }, '暂无楼层数据')
        ]);
    }

    const section = createElement('div', { className: 'section' }, [
        createElement('h2', { className: 'section-title' }, '楼层消耗分布')
    ]);

    // Chart container
    section.appendChild(createElement('div', {
        className: 'chart-container heatmap-container',
        id: 'floor-heatmap-chart'
    }));

    // Floor details table
    section.appendChild(renderFloorTable(floors));

    // Initialize chart after DOM is ready
    setTimeout(() => initFloorHeatmap(floors), 100);

    return section;
}

/**
 * Render floor details table.
 * @param {Object[]} floors - Floor data
 * @returns {HTMLElement} - Table element
 */
function renderFloorTable(floors) {
    const sortedFloors = [...floors].sort((a, b) => a.floor_number - b.floor_number);

    // Calculate min/max for color scaling
    const consumptions = sortedFloors.map(f => f.total_consumption);
    const minC = Math.min(...consumptions);
    const maxC = Math.max(...consumptions);

    const rows = sortedFloors.map(floor => {
        const color = getConsumptionColor(floor.total_consumption, minC, maxC);
        const anomalyCount = floor.anomaly_rooms ? floor.anomaly_rooms.length : 0;

        return createElement('tr', { className: 'floor-row' }, [
            createElement('td', { className: 'floor-cell' }, `${floor.floor_number} 层`),
            createElement('td', { className: 'rooms-cell' }, `${floor.room_count} 间`),
            createElement('td', {
                className: 'consumption-cell',
                style: { backgroundColor: color }
            }, formatConsumption(floor.total_consumption)),
            createElement('td', { className: 'avg-cell' },
                formatConsumption(floor.avg_consumption)
            ),
            createElement('td', {
                className: `anomaly-cell ${anomalyCount > 0 ? 'has-anomaly' : ''}`
            }, anomalyCount > 0 ? `${anomalyCount} 间异常` : '正常')
        ]);
    });

    return createElement('div', { className: 'table-container' }, [
        createElement('table', { className: 'floor-table' }, [
            createElement('thead', {}, [
                createElement('tr', {}, [
                    createElement('th', {}, '楼层'),
                    createElement('th', {}, '房间数'),
                    createElement('th', {}, '总消耗'),
                    createElement('th', {}, '平均消耗'),
                    createElement('th', {}, '状态')
                ])
            ]),
            createElement('tbody', {}, rows)
        ])
    ]);
}

/**
 * Initialize floor heatmap chart.
 * @param {Object[]} floors - Floor data
 */
function initFloorHeatmap(floors) {
    const container = document.getElementById('floor-heatmap-chart');
    if (!container) return;

    // Check for ECharts
    if (typeof echarts === 'undefined') {
        container.innerHTML = '<p class="error">图表库未加载</p>';
        return;
    }

    if (heatmapChart) {
        heatmapChart.dispose();
    }

    heatmapChart = echarts.init(container);

    const sortedFloors = [...floors].sort((a, b) => a.floor_number - b.floor_number);

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function(params) {
                const floor = params[0];
                return `${floor.name}<br/>消耗量: ${floor.value.toFixed(1)} kWh`;
            }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: sortedFloors.map(f => `${f.floor_number}层`),
            axisLabel: {
                rotate: 45
            }
        },
        yAxis: {
            type: 'value',
            name: '消耗量 (kWh)'
        },
        series: [{
            name: '消耗量',
            type: 'bar',
            data: sortedFloors.map(f => f.total_consumption),
            itemStyle: {
                color: function(params) {
                    const values = sortedFloors.map(f => f.total_consumption);
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    return getConsumptionColor(params.value, min, max);
                }
            },
            label: {
                show: true,
                position: 'top',
                formatter: function(params) {
                    return params.value.toFixed(0);
                }
            }
        }]
    };

    heatmapChart.setOption(option);
}

// ============================================================================
// Anomaly Section
// ============================================================================

/**
 * Render anomaly rooms section.
 * @param {Object[]} anomalies - Anomaly rooms array
 * @returns {HTMLElement} - Anomaly section
 */
function renderAnomalySection(anomalies) {
    const section = createElement('div', { className: 'section anomaly-section' }, [
        createElement('h2', { className: 'section-title' }, [
            createElement('span', {}, '异常房间检测'),
            createElement('span', { className: 'section-subtitle' },
                anomalies && anomalies.length > 0 ? `发现 ${anomalies.length} 间异常` : '无异常'
            )
        ])
    ]);

    if (!anomalies || anomalies.length === 0) {
        section.appendChild(createElement('div', { className: 'anomaly-empty' }, [
            createElement('span', { className: 'anomaly-icon' }, '✓'),
            createElement('p', { className: 'anomaly-message' }, '所有房间消耗正常')
        ]));
        return section;
    }

    // Anomaly list
    const anomalyItems = anomalies.map(anomaly => {
        const severityClass = getAnomalySeverity(anomaly.z_score);
        const color = getAnomalyColor(anomaly.z_score);

        return createElement('div', {
            className: `anomaly-item anomaly--${severityClass}`,
            style: { borderLeftColor: color },
            onclick: () => {
                // Navigate to room detail if we have room_id
                if (anomaly.room_id && buildingData) {
                    navigateToRoom(buildingData.campus, buildingData.entity_name, anomaly.room_id);
                }
            }
        }, [
            createElement('div', { className: 'anomaly-header' }, [
                createElement('span', { className: 'anomaly-room' }, anomaly.room_name || anomaly.room_id),
                createElement('span', {
                    className: `anomaly-badge anomaly-badge--${severityClass}`
                }, `Z = ${anomaly.z_score.toFixed(2)}`)
            ]),
            createElement('div', { className: 'anomaly-details' }, [
                createElement('span', { className: 'anomaly-consumption' },
                    `消耗: ${formatConsumption(anomaly.consumption)}`
                ),
                createElement('span', { className: 'anomaly-note' },
                    anomaly.z_score > 0 ? '高于平均值' : '低于平均值'
                )
            ])
        ]);
    });

    section.appendChild(createElement('div', { className: 'anomaly-list' }, anomalyItems));

    // Add explanation
    section.appendChild(createElement('p', { className: 'anomaly-explanation' },
        '异常检测基于统计方法，Z值表示偏离平均值的标准差倍数。|Z| > 2 表示异常。'
    ));

    return section;
}

/**
 * Get anomaly severity from z-score.
 * @param {number} zScore - Z-score value
 * @returns {string} - Severity level
 */
function getAnomalySeverity(zScore) {
    const absZ = Math.abs(zScore);
    if (absZ >= 3) return 'critical';
    if (absZ >= 2.5) return 'high';
    if (absZ >= 2) return 'medium';
    return 'low';
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Cleanup when leaving view.
 */
export function cleanup() {
    if (heatmapChart) {
        heatmapChart.dispose();
        heatmapChart = null;
    }
    if (trendChart) {
        trendChart.dispose();
        trendChart = null;
    }
    currentBuilding = null;
    buildingData = null;
}

// ============================================================================
// Export
// ============================================================================

export default {
    renderBuildingView,
    navigateToRoom,
    cleanup
};
