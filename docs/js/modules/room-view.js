/**
 * Room View Module
 *
 * Displays personalized consumption predictions and recharge recommendations
 * for individual rooms.
 *
 * User Story 3: Room Resident Prediction
 * User Story 3 (Refactor): Personalized room view with predictions and analogies
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
    formatConfidence,
    formatDaysUntilDepletion,
    CACHE_TTL,
    fetchWithCache,
} from './utils.js';

import {
    loadRoomPrediction,
    loadRoomConsumption,
} from './consumption.js';

import {
    shouldDisplayPrediction,
    createPredictionSummaryCard,
    createRechargeRecommendationCard,
    createDayOfWeekPatternCard,
    getPredictionStatus,
    getPredictionUrgency,
} from './prediction.js';

import {
    saveUserRoom,
    getUserRoom,
    clearUserRoom,
} from './user-config.js';

import {
    getConsumptionAnalogy,
    formatConsumptionWithAnalogy,
} from './consumption-analogy.js';

// ============================================================================
// State
// ============================================================================

let currentRoom = null;
let roomData = null;
let predictionData = null;
let patternChart = null;

// ============================================================================
// Main Render
// ============================================================================

/**
 * Render the room perspective view.
 * @param {string} campusName - Campus name
 * @param {string} buildingName - Building name
 * @param {string} roomId - Room ID
 * @param {HTMLElement} container - Container element
 */
export async function renderRoomView(campusName, buildingName, roomId, container = null) {
    if (!container) {
        container = document.getElementById('main-content');
    }

    if (!container) {
        console.error('No container element found');
        return;
    }

    showLoading(container);
    currentRoom = roomId;

    try {
        // Load prediction data and consumption data first
        predictionData = await loadRoomPrediction(roomId, campusName, buildingName);
        roomData = await loadRoomConsumption(roomId, campusName, buildingName);

        // T030: Save user room configuration for personalization (after getting room name)
        saveUserRoom({
            campus: campusName,
            building: buildingName,
            roomId: roomId,
            roomName: predictionData?.room_name || roomId
        });

        // Clear and render
        clearElement(container);
        container.appendChild(renderRoomLayout(campusName, buildingName, roomId, predictionData, roomData));

    } catch (error) {
        console.error('Failed to render room view:', error);
        showError(container, `渲染失败: ${error.message}`);
    }
}

// ============================================================================
// Layout Components
// ============================================================================

/**
 * Render main room layout.
 * T032: Updated with scroll sections
 * @param {string} campusName - Campus name
 * @param {string} buildingName - Building name
 * @param {string} roomId - Room ID
 * @param {Object} prediction - Prediction data
 * @param {Object} consumption - Consumption data
 * @returns {HTMLElement} - Layout element
 */
function renderRoomLayout(campusName, buildingName, roomId, prediction, consumption) {
    const fragment = document.createDocumentFragment();

    // Header with T037: "切换房间" button
    fragment.appendChild(renderRoomHeader(campusName, buildingName, roomId, prediction));

    // T033: Prominent consumption analogy display at top
    if (consumption && consumption.consumption_history) {
        fragment.appendChild(renderConsumptionAnalogyBanner(consumption));
    }

    // Scrollable content wrapper (T032)
    const scrollContent = createElement('div', { className: 'room-view-scroll' });

    // Prediction status banner
    if (prediction && shouldDisplayPrediction(prediction)) {
        scrollContent.appendChild(renderPredictionStatusBanner(prediction));
    }

    // Current balance card
    if (prediction) {
        scrollContent.appendChild(renderBalanceCard(prediction));
    }

    // T035: Recharge estimation display
    if (prediction && prediction.recharge_estimate) {
        scrollContent.appendChild(renderRechargeEstimateCard(prediction));
    }

    // Prediction cards
    if (prediction && shouldDisplayPrediction(prediction)) {
        scrollContent.appendChild(renderPredictionSection(prediction));
    } else {
        scrollContent.appendChild(renderInsufficientDataMessage());
    }

    // Consumption pattern section
    if (prediction && prediction.day_of_week_pattern) {
        scrollContent.appendChild(renderPatternSection(prediction));
    }

    // Recharge recommendation
    if (prediction && shouldDisplayPrediction(prediction)) {
        scrollContent.appendChild(renderRecommendationSection(prediction));
    }

    fragment.appendChild(scrollContent);

    return createElement('div', { className: 'room-view' }, Array.from(fragment.children));
}

// ============================================================================
// Header Component
// ============================================================================

/**
 * Render room header.
 * T037: Added "切换房间" button
 * @param {string} campusName - Campus name
 * @param {string} buildingName - Building name
 * @param {string} roomId - Room ID
 * @param {Object} prediction - Prediction data
 * @returns {HTMLElement} - Header element
 */
function renderRoomHeader(campusName, buildingName, roomId, prediction) {
    const roomName = prediction?.room_name || roomId;

    return createElement('div', { className: 'view-header' }, [
        createElement('div', { className: 'view-header-row' }, [
            createElement('h1', { className: 'view-title' }, [
                createElement('span', { className: 'room-icon' }, '🏠'),
                ` ${roomName}`
            ]),
            // T037: 切换房间 button
            createElement('button', {
                className: 'switch-room-btn',
                onclick: () => {
                    clearUserRoom();
                    window.location.hash = '/';
                }
            }, '切换房间')
        ]),
        createElement('p', { className: 'view-subtitle' },
            `${campusName} → ${buildingName}`
        ),
        createElement('div', { className: 'view-meta' }, [
            createElement('span', { className: 'room-id' },
                `房间ID: ${roomId}`
            ),
            createElement('a', {
                className: 'back-link',
                href: `#building/${encodeURIComponent(campusName)}/${encodeURIComponent(buildingName)}`,
                onclick: (e) => {
                    e.preventDefault();
                    window.location.hash = `/building/${encodeURIComponent(campusName)}/${encodeURIComponent(buildingName)}`;
                }
            }, '← 返回楼栋')
        ])
    ]);
}

// ============================================================================
// Consumption Analogy Banner (T031, T033)
// ============================================================================

/**
 * Render prominent consumption analogy banner at top of room view.
 * T033: Prominent display at top of room view
 * @param {Object} consumption - Consumption data
 * @returns {HTMLElement} - Analogy banner element
 */
function renderConsumptionAnalogyBanner(consumption) {
    // Get the most recent daily consumption
    const history = consumption.consumption_history || [];
    if (history.length === 0) {
        return null;
    }

    // Get latest consumption (last entry)
    const latest = history[history.length - 1];
    const latestConsumption = latest.consumption || 0;

    // Get analogy for this consumption level
    const analogy = getConsumptionAnalogy(latestConsumption);
    const formattedAnalogy = formatConsumptionWithAnalogy(latestConsumption);

    return createElement('div', { className: 'consumption-analogy-banner' }, [
        createElement('div', { className: 'analogy-icon' }, analogy.icon),
        createElement('div', { className: 'analogy-content' }, [
            createElement('div', { className: 'analogy-label' }, '今日消耗'),
            createElement('div', { className: 'analogy-value' }, [
                createElement('span', { className: 'analogy-number' }, formatConsumption(latestConsumption)),
                createElement('span', { className: 'analogy-unit' }, 'kWh')
            ]),
            createElement('div', { className: 'analogy-description' }, analogy.text),
            createElement('div', { className: `analogy-context analogy-context--${analogy.level}` },
                `${analogy.context} | ${formattedAnalogy}`
            )
        ])
    ]);
}

// ============================================================================
// Recharge Estimate Card (T035)
// ============================================================================

/**
 * Render recharge estimation card.
 * T035: Recharge estimation display
 * @param {Object} prediction - Prediction data
 * @returns {HTMLElement} - Recharge estimate card
 */
function renderRechargeEstimateCard(prediction) {
    const estimate = prediction.recharge_estimate || {};
    const suggestedAmount = estimate.suggested_amount || 0;
    const daysCoverage = estimate.days_coverage || 30;
    const currentBalance = prediction.current_balance || 0;

    // Calculate recommended recharge amounts
    const recommendations = [
        { days: 7, amount: Math.ceil(suggestedAmount * 7 / 30) },
        { days: 14, amount: Math.ceil(suggestedAmount * 14 / 30) },
        { days: 30, amount: Math.ceil(suggestedAmount) }
    ].filter(r => r.amount > 0);

    return createElement('div', { className: 'recharge-estimate-card' }, [
        createElement('h3', { className: 'estimate-title' }, '💡 充值预估'),
        createElement('p', { className: 'estimate-desc' },
            `基于您近期的用电习惯，建议充值以下金额：`
        ),
        createElement('div', { className: 'estimate-options' },
            recommendations.map(rec =>
                createElement('div', { className: 'estimate-option' }, [
                    createElement('div', { className: 'estimate-days' }, `覆盖 ${rec.days} 天`),
                    createElement('div', { className: 'estimate-amount' }, [
                        createElement('span', { className: 'amount-value' }, rec.amount),
                        createElement('span', { className: 'amount-unit' }, 'kWh')
                    ])
                ])
            )
        ),
        createElement('p', { className: 'estimate-note' },
            `当前余额可维持约 ${prediction.days_until_depletion?.toFixed(0) || '?'} 天`
        )
    ]);
}

// ============================================================================
// Balance Card
// ============================================================================

/**
 * Render current balance card.
 * @param {Object} prediction - Prediction data
 * @returns {HTMLElement} - Balance card element
 */
function renderBalanceCard(prediction) {
    const balance = prediction.current_balance || 0;
    let balanceClass = 'balance--good';

    if (balance < 10) {
        balanceClass = 'balance--critical';
    } else if (balance < 30) {
        balanceClass = 'balance--warning';
    } else if (balance < 50) {
        balanceClass = 'balance--low';
    }

    return createElement('div', { className: `balance-card ${balanceClass}` }, [
        createElement('div', { className: 'balance-content' }, [
            createElement('div', { className: 'balance-label' }, '当前余额'),
            createElement('div', { className: 'balance-value' }, [
                createElement('span', { className: 'balance-number' }, formatNumber(balance, 1)),
                createElement('span', { className: 'balance-unit' }, 'kWh')
            ])
        ]),
        createElement('div', { className: 'balance-indicator' }, getBalanceIndicator(balance))
    ]);
}

/**
 * Get balance indicator emoji.
 * @param {number} balance - Current balance
 * @returns {string} - Indicator string
 */
function getBalanceIndicator(balance) {
    if (balance >= 100) return '🟢 电量充足';
    if (balance >= 50) return '🟢 电量正常';
    if (balance >= 30) return '🟡 电量偏低';
    if (balance >= 10) return '🟠 需要关注';
    return '🔴 电量不足';
}

// ============================================================================
// Prediction Status Banner
// ============================================================================

/**
 * Render prediction status banner.
 * @param {Object} prediction - Prediction data
 * @returns {HTMLElement} - Banner element
 */
function renderPredictionStatusBanner(prediction) {
    const status = getPredictionStatus(prediction);
    const urgency = getPredictionUrgency(prediction.days_until_depletion);

    return createElement('div', { className: `status-banner status-banner--${urgency}` }, [
        createElement('span', { className: 'status-icon' },
            urgency === 'critical' || urgency === 'high' ? '⚠️' :
            urgency === 'medium' ? '📊' : '✅'
        ),
        createElement('span', { className: 'status-message' }, status)
    ]);
}

// ============================================================================
// Prediction Section
// ============================================================================

/**
 * Render prediction details section.
 * @param {Object} prediction - Prediction data
 * @returns {HTMLElement} - Section element
 */
function renderPredictionSection(prediction) {
    const section = createElement('div', { className: 'section prediction-section' }, [
        createElement('h2', { className: 'section-title' }, '消耗预测')
    ]);

    // Create prediction summary card using module
    const summaryHTML = createPredictionSummaryCard(prediction);
    const summaryDiv = createElement('div');
    summaryDiv.innerHTML = summaryHTML;
    section.appendChild(summaryDiv.firstElementChild);

    // Confidence indicator
    section.appendChild(renderConfidenceIndicator(prediction));

    return section;
}

/**
 * Render confidence indicator.
 * @param {Object} prediction - Prediction data
 * @returns {HTMLElement} - Confidence element
 */
function renderConfidenceIndicator(prediction) {
    const confidence = prediction.confidence || 0;
    const confidencePercent = Math.round(confidence * 100);

    let confidenceClass = 'confidence--low';
    let confidenceLabel = '低';

    if (confidence >= 0.9) {
        confidenceClass = 'confidence--high';
        confidenceLabel = '高';
    } else if (confidence >= 0.7) {
        confidenceClass = 'confidence--medium';
        confidenceLabel = '中';
    }

    return createElement('div', { className: 'confidence-indicator' }, [
        createElement('div', { className: 'confidence-header' }, [
            createElement('span', { className: 'confidence-label' }, '预测置信度'),
            createElement('span', { className: `confidence-value ${confidenceClass}` },
                `${confidencePercent}% (${confidenceLabel})`
            )
        ]),
        createElement('div', { className: 'confidence-bar-container' }, [
            createElement('div', {
                className: `confidence-bar ${confidenceClass}`,
                style: { width: `${confidencePercent}%` }
            })
        ]),
        createElement('p', { className: 'confidence-note' },
            confidence >= 0.7
                ? '基于充足的历史数据，预测较为可靠'
                : '历史数据不足，预测仅供参考'
        )
    ]);
}

// ============================================================================
// Pattern Section
// ============================================================================

/**
 * Render consumption pattern section.
 * @param {Object} prediction - Prediction data
 * @returns {HTMLElement} - Section element
 */
function renderPatternSection(prediction) {
    const section = createElement('div', { className: 'section pattern-section' }, [
        createElement('h2', { className: 'section-title' }, '消耗模式')
    ]);

    // Create pattern card
    const patternHTML = createDayOfWeekPatternCard(prediction.day_of_week_pattern);
    const patternDiv = createElement('div');
    patternDiv.innerHTML = patternHTML;
    section.appendChild(patternDiv.firstElementChild);

    // Initialize ECharts if available
    setTimeout(() => initPatternChart(prediction.day_of_week_pattern), 100);

    return section;
}

/**
 * Initialize pattern chart with ECharts.
 * @param {Object} pattern - Day pattern object
 */
function initPatternChart(pattern) {
    const container = document.getElementById('pattern-chart');
    if (!container || typeof echarts === 'undefined') return;

    if (patternChart) {
        patternChart.dispose();
    }

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const values = days.map(d => pattern[d] || 0);

    patternChart = echarts.init(container);

    const option = {
        tooltip: {
            trigger: 'axis',
            formatter: '{b}: {c} kWh'
        },
        xAxis: {
            type: 'category',
            data: dayLabels
        },
        yAxis: {
            type: 'value',
            name: '消耗量 (kWh)'
        },
        series: [{
            type: 'bar',
            data: values.map((v, i) => ({
                value: v,
                itemStyle: {
                    color: i >= 5 ? '#ff9800' : '#667eea'
                }
            }))
        }]
    };

    patternChart.setOption(option);
}

// ============================================================================
// Recommendation Section
// ============================================================================

/**
 * Render recharge recommendation section.
 * @param {Object} prediction - Prediction data
 * @returns {HTMLElement} - Section element
 */
function renderRecommendationSection(prediction) {
    const section = createElement('div', { className: 'section recommendation-section' }, [
        createElement('h2', { className: 'section-title' }, '充值建议')
    ]);

    // Create recommendation card
    const recHTML = createRechargeRecommendationCard(prediction);
    const recDiv = createElement('div');
    recDiv.innerHTML = recHTML;
    section.appendChild(recDiv.firstElementChild);

    return section;
}

// ============================================================================
// Insufficient Data Message
// ============================================================================

/**
 * Render insufficient data message.
 * @returns {HTMLElement} - Message element
 */
function renderInsufficientDataMessage() {
    return createElement('div', { className: 'section insufficient-data-section' }, [
        createElement('div', { className: 'insufficient-data-card' }, [
            createElement('div', { className: 'insufficient-icon' }, '📊'),
            createElement('h3', {}, '数据不足'),
            createElement('p', {}, '需要至少14天的用电数据才能生成可靠预测。'),
            createElement('p', { className: 'insufficient-note' },
                '请继续收集数据，系统将在数据充足后自动生成预测。'
            )
        ])
    ]);
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Cleanup when leaving view.
 */
export function cleanup() {
    if (patternChart) {
        patternChart.dispose();
        patternChart = null;
    }
    currentRoom = null;
    roomData = null;
    predictionData = null;
}

// ============================================================================
// Export
// ============================================================================

export default {
    renderRoomView,
    cleanup
};
