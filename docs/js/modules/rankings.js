/**
 * Rankings Module
 * Building electricity consumption rankings with animated loading
 *
 * Refactored to use consumption-based rankings (not balance-based).
 * Features:
 * - Daily consumption ranking per building
 * - Animated loading with progress bar
 * - Date selection
 */

import {
    computeBuildingDailyRanking,
    getAvailableDatesForRanking,
    loadRankingFromLocalStorage,
    loadBuildingRooms,
} from './consumption.js';

import {
    createProgressBar,
    createIncrementalList,
} from './animated-loader.js';

// ============================================================================
// State
// ============================================================================

const rankingsState = {
    campus: '',
    building: '',
    selectedDate: '',
    availableDates: [],
    progressBarController: null,
    incrementalListController: null
};

// ============================================================================
// Main Page Initialization
// ============================================================================

function initRankingsPageContent(container) {
    container.innerHTML =
        '<div class="page-container">' +
            '<div class="page-header">' +
                '<h2>📊 消耗量排行榜</h2>' +
                '<p>查看宿舍每日用电消耗排名</p>' +
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

            '<div class="control-group" style="margin-bottom: 20px;" id="date-selector-group" style="display: none;">' +
                '<label for="rankings-date-select">选择日期:</label>' +
                '<select id="rankings-date-select" disabled>' +
                    '<option value="">-- 请先选择楼栋 --</option>' +
                '</select>' +
            '</div>' +

            '<p id="rankings-hint" style="color: #666; margin-bottom: 15px; font-size: 0.9rem;"></p>' +

            '<div id="ranking-progress" class="ranking-progress" style="margin-bottom: 15px;"></div>' +

            '<div class="ranking-list" id="ranking-list">' +
                '<div class="empty-state">' +
                    '<div class="empty-icon">📊</div>' +
                    '<p>请选择校区、楼栋和日期查看消耗量排名</p>' +
                '</div>' +
            '</div>' +
        '</div>';

    loadRankingsData(container);
}

async function loadRankingsData(container) {
    var campusSelect = document.getElementById('rankings-campus-select');
    var buildingSelect = document.getElementById('rankings-building-select');
    var dateSelect = document.getElementById('rankings-date-select');
    var dateGroup = document.getElementById('date-selector-group');

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
            dateSelect.innerHTML = '<option value="">-- 请先选择楼栋 --</option>';
            dateSelect.disabled = true;
            rankingsState.campus = campus;
            rankingsState.building = '';
            rankingsState.selectedDate = '';
            rankingsState.availableDates = [];

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

        buildingSelect.addEventListener('change', async function() {
            rankingsState.building = buildingSelect.value;
            dateSelect.innerHTML = '<option value="">-- 加载日期中 --</option>';
            dateSelect.disabled = true;
            rankingsState.selectedDate = '';

            if (!rankingsState.building) {
                dateSelect.innerHTML = '<option value="">-- 请选择楼栋 --</option>';
                return;
            }

            // Load available dates for this building
            try {
                const dates = await getAvailableDatesForRanking(rankingsState.campus, rankingsState.building);
                rankingsState.availableDates = dates;

                dateSelect.innerHTML = '<option value="">-- 请选择日期 --</option>';

                if (dates.length === 0) {
                    dateSelect.innerHTML = '<option value="">-- 无可用日期 --</option>';
                    updateHint('该楼栋暂无足够的历史数据');
                } else {
                    dates.forEach(function(date) {
                        var opt = document.createElement('option');
                        opt.value = date;
                        opt.textContent = formatDateForDisplay(date);
                        dateSelect.appendChild(opt);
                    });
                    dateSelect.disabled = false;
                    updateHint('请选择日期查看消耗量排名');
                }
            } catch (e) {
                console.error('Error loading available dates:', e);
                dateSelect.innerHTML = '<option value="">-- 加载失败 --</option>';
            }
        });

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

// ============================================================================
// Consumption Ranking Loading
// ============================================================================

/**
 * Load and display consumption rankings with animated loading.
 */
async function loadAndDisplayConsumptionRankings() {
    var listEl = document.getElementById('ranking-list');
    var progressEl = document.getElementById('ranking-progress');
    var hintEl = document.getElementById('rankings-hint');

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

    updateHint('正在计算消耗量排名...');

    // Check localStorage cache first
    const cached = loadRankingFromLocalStorage(campus, building, date);
    if (cached && cached.rankings) {
        renderRankingTable(cached.rankings, listEl);
        updateHint(`${formatDateForDisplay(date)} 消耗量排名 (已缓存)`);
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
            updateHint('暂无数据');
        } else {
            updateHint(`${formatDateForDisplay(date)} 消耗量排名 - 共 ${result.rankings.length} 间房间`);
        }

    } catch (error) {
        console.error('Failed to load ranking:', error);
        if (rankingsState.progressBarController) {
            rankingsState.progressBarController.complete();
            rankingsState.progressBarController = null;
        }
        listEl.innerHTML = '<div class="empty-state"><p>加载失败: ' + error.message + '</p></div>';
        updateHint('加载失败');
    }
}

// ============================================================================
// Rendering Functions
// ============================================================================

/**
 * Format date for display (YYYY-MM-DD -> MM月DD日).
 */
function formatDateForDisplay(dateStr) {
    var parts = dateStr.split('-');
    if (parts.length === 3) {
        return parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
    }
    return dateStr;
}

/**
 * Render a single ranking item.
 */
function renderRankingItem(item, rank) {
    var el = document.createElement('div');
    el.className = 'ranking-item consumption-ranking-item';
    el.dataset.roomId = item.room_id;

    var medal = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : '#' + rank;
    var consumptionColor = item.consumption > 5 ? '#ff6b6b' :
                          item.consumption > 2 ? '#feca57' : '#1dd1a1';

    var consumptionText = item.consumption.toFixed(1);

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
        navigateToRoomDetail(item.room_id, item.room_name);
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
    var sorted = rankings.slice().sort(function(a, b) {
        return (b.consumption || 0) - (a.consumption || 0);
    });

    // Take top 20
    var top20 = sorted.slice(0, 20);

    container.innerHTML = '';
    top20.forEach(function(item, index) {
        container.appendChild(renderRankingItem(item, index + 1));
    });

    // Add "show more" if there are more
    if (sorted.length > 20) {
        var moreBtn = document.createElement('button');
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
 * Update hint text.
 */
function updateHint(text) {
    var hintEl = document.getElementById('rankings-hint');
    if (hintEl) {
        hintEl.textContent = text;
    }
}

/**
 * Navigate to room detail page.
 */
function navigateToRoomDetail(roomId, roomName) {
    var campus = rankingsState.campus;
    var building = rankingsState.building;

    if (!campus || !building) return;

    // Navigate to room view
    window.location.hash = '/room/' + encodeURIComponent(campus) + '/' + encodeURIComponent(building) + '/' + roomId;
}

// ============================================================================
// Legacy Balance-Based Rankings (Fallback)
// ============================================================================

/**
 * Legacy function for balance-based rankings (used as fallback when no consumption data).
 */
function calculateBalanceRankings(buildingData, category, days) {
    category = category || 'low';
    days = days || 30;

    var rooms = buildingData.rooms || {};
    var rankedRooms = [];

    Object.keys(rooms).forEach(function(roomId) {
        var roomInfo = rooms[roomId];
        var balance = roomInfo.current_balance || 0;

        rankedRooms.push({
            roomId: roomId,
            roomName: roomInfo.room_name,
            currentBalance: balance,
            rankValue: balance,
            label: '当前余额 ' + balance.toFixed(1) + ' 度'
        });
    });

    // Sort: low balance first for 'low', high balance first for others
    var sortOrder = category === 'low' ? 'asc' : 'desc';
    rankedRooms.sort(function(a, b) {
        if (sortOrder === 'desc') return b.rankValue - a.rankValue;
        return a.rankValue - b.rankValue;
    });

    return rankedRooms.slice(0, 20);
}

// ============================================================================
// Export
// ============================================================================

// Make initRankingsPageContent available globally for app.js
window.initRankingsPageContent = initRankingsPageContent;

export {
    initRankingsPageContent,
    loadAndDisplayConsumptionRankings
};

export default {
    initRankingsPageContent,
    loadAndDisplayConsumptionRankings
};
