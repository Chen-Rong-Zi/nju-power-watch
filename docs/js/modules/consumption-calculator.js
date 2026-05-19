/**
 * Consumption Calculator Module
 *
 * Core computation engine for calculating consumption, recharge, and predictions
 * from existing balance data. All calculations happen in the frontend.
 *
 * Architecture: Frontend computation from balance data (no backend scripts needed)
 */

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PREDICTION_WINDOW = 14;
const DEFAULT_ANOMALY_THRESHOLD = 2.0;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.70;

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Parse date string to Date object
 * @param {string} dateStr - Date string (YYYYMMDD or YYYY-MM-DD)
 * @returns {Date} - Parsed date
 */
function parseDate(dateStr) {
    if (!dateStr) return null;

    // Handle YYYYMMDD format
    if (/^\d{8}$/.test(dateStr)) {
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        return new Date(year, month, day);
    }

    // Handle ISO format
    return new Date(dateStr);
}

/**
 * Format date to YYYY-MM-DD
 * @param {Date} date - Date object
 * @returns {string} - Formatted date
 */
function formatDate(date) {
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Calculate days between two dates
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number} - Number of days
 */
function daysBetween(date1, date2) {
    const d1 = typeof date1 === 'string' ? parseDate(date1) : date1;
    const d2 = typeof date2 === 'string' ? parseDate(date2) : date2;
    if (!d1 || !d2) return 0;

    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Consumption Calculation
// ============================================================================

/**
 * Calculate consumption from balance history
 * @param {Array} balanceHistory - Array of balance records with date and balance
 * @returns {Array} - Array of consumption records
 */
function calculateConsumption(balanceHistory) {
    if (!balanceHistory || balanceHistory.length < 2) {
        return [];
    }

    // Sort by date ascending
    const sorted = [...balanceHistory].sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        return dateA - dateB;
    });

    const consumptionRecords = [];

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];

        const prevBalance = parseFloat(prev.balance) || 0;
        const currBalance = parseFloat(curr.balance) || 0;
        const delta = prevBalance - currBalance;
        const daysDiff = daysBetween(prev.date, curr.date);

        // Calculate confidence based on gap between readings
        let confidence = 0;
        let method = 'unknown';
        let consumption = 0;
        let recharge = 0;

        if (delta > 0) {
            // Balance decreased = consumption
            consumption = delta;
            confidence = daysDiff === 1 ? 0.9 : Math.max(0.5, 0.9 - (daysDiff - 1) * 0.1);
            method = 'delta';
        } else if (delta < 0) {
            // Balance increased = recharge
            recharge = Math.abs(delta);
            consumption = 0;
            confidence = daysDiff === 1 ? 0.9 : Math.max(0.5, 0.9 - (daysDiff - 1) * 0.1);
            method = 'recharge';
        } else {
            // No change
            consumption = 0;
            confidence = 0.5;
            method = 'none';
        }

        consumptionRecords.push({
            date: formatDate(parseDate(curr.date)),
            rawDate: curr.date,
            consumption,
            recharge,
            confidence,
            method,
            previous_balance: prevBalance,
            current_balance: currBalance,
            days_diff: daysDiff
        });
    }

    return consumptionRecords;
}

/**
 * Detect recharge events from consumption records
 * @param {Array} consumptionRecords - Array from calculateConsumption
 * @returns {Array} - Array of recharge events
 */
function detectRecharges(consumptionRecords) {
    if (!consumptionRecords || consumptionRecords.length === 0) {
        return [];
    }

    return consumptionRecords
        .filter(r => r.recharge > 0)
        .map(record => ({
            date: record.date,
            recharge_amount: record.recharge,
            confidence: record.confidence > 0.8 ? 'high' : record.confidence > 0.6 ? 'medium' : 'low',
            balance_before: record.previous_balance,
            balance_after: record.current_balance,
            days_gap: record.days_diff
        }));
}

// ============================================================================
// Statistics Calculation
// ============================================================================

/**
 * Calculate statistics from consumption values
 * @param {number[]} values - Array of consumption values
 * @returns {Object} - Statistics object
 */
function calculateStatistics(values) {
    if (!values || values.length === 0) {
        return {
            mean: 0,
            median: 0,
            stdDev: 0,
            min: 0,
            max: 0,
            sum: 0,
            count: 0
        };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;

    // Median
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;

    // Standard deviation
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    return {
        mean,
        median,
        stdDev,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        sum,
        count: values.length
    };
}

/**
 * Calculate z-score for a value
 * @param {number} value - Value to calculate z-score for
 * @param {number} mean - Mean of distribution
 * @param {number} stdDev - Standard deviation
 * @returns {number} - Z-score
 */
function calculateZScore(value, mean, stdDev) {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
}

// ============================================================================
// Anomaly Detection
// ============================================================================

/**
 * Detect anomalous rooms based on consumption
 * @param {Array} roomConsumptions - Array of {room_id, room_name, consumption}
 * @param {number} threshold - Z-score threshold (default 2.0)
 * @returns {Object} - {anomalies, stats}
 */
function detectAnomalies(roomConsumptions, threshold = DEFAULT_ANOMALY_THRESHOLD) {
    if (!roomConsumptions || roomConsumptions.length === 0) {
        return { anomalies: [], stats: null };
    }

    const consumptions = roomConsumptions
        .map(r => r.avgConsumption || r.consumption || 0)
        .filter(c => c > 0);

    const stats = calculateStatistics(consumptions);

    const anomalies = roomConsumptions
        .filter(room => {
            const consumption = room.avgConsumption || room.consumption || 0;
            if (consumption <= 0) return false;

            const zScore = calculateZScore(consumption, stats.mean, stats.stdDev);
            return Math.abs(zScore) > threshold;
        })
        .map(room => {
            const consumption = room.avgConsumption || room.consumption || 0;
            const zScore = calculateZScore(consumption, stats.mean, stats.stdDev);

            return {
                room_id: room.room_id,
                room_name: room.room_name,
                consumption,
                zScore,
                severity: Math.abs(zScore) >= 3 ? 'critical' : Math.abs(zScore) >= 2.5 ? 'high' : 'medium'
            };
        })
        .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

    return { anomalies, stats };
}

// ============================================================================
// Aggregate Calculation
// ============================================================================

/**
 * Calculate building aggregate from room consumption data
 * @param {Array} rooms - Array of room data with consumption history
 * @param {string} buildingName - Building name
 * @param {string} campusName - Campus name
 * @returns {Object} - Building aggregate statistics
 */
function calculateBuildingAggregate(rooms, buildingName, campusName) {
    if (!rooms || rooms.length === 0) {
        return null;
    }

    // Calculate per-room averages
    const roomConsumptions = rooms.map(room => {
        const history = room.consumptionHistory || [];
        const consumptions = history.map(h => h.consumption).filter(c => c > 0);
        const avgConsumption = consumptions.length > 0
            ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length
            : 0;

        return {
            room_id: room.room_id,
            room_name: room.room_name,
            floor: extractFloor(room.room_name),
            consumption: avgConsumption,
            avgConsumption,
            current_balance: room.current_balance || 0
        };
    });

    // Detect anomalies
    const { anomalies, stats } = detectAnomalies(roomConsumptions);

    // Calculate floor breakdown
    const floorData = {};
    roomConsumptions.forEach(room => {
        const floor = room.floor || 'unknown';
        if (!floorData[floor]) {
            floorData[floor] = {
                floor_number: floor,
                room_count: 0,
                total_consumption: 0,
                rooms: []
            };
        }
        floorData[floor].room_count++;
        floorData[floor].total_consumption += room.consumption;
        floorData[floor].rooms.push(room);
    });

    // Calculate per-floor averages
    Object.values(floorData).forEach(floor => {
        floor.avg_consumption = floor.room_count > 0
            ? floor.total_consumption / floor.room_count
            : 0;
    });

    // Total consumption and recharge
    const totalConsumption = roomConsumptions.reduce((sum, r) => sum + r.consumption, 0);
    const activeRoomCount = roomConsumptions.filter(r => r.consumption > 0).length;

    return {
        entity_type: 'building',
        entity_id: `${campusName}_${buildingName}`,
        entity_name: buildingName,
        campus_name: campusName,
        total_consumption: totalConsumption,
        total_recharge: 0, // Will be calculated separately if needed
        room_count: rooms.length,
        active_room_count: activeRoomCount,
        avg_consumption_per_room: activeRoomCount > 0 ? totalConsumption / activeRoomCount : 0,
        median_consumption: stats.median,
        std_dev_consumption: stats.stdDev,
        anomaly_count: anomalies.length,
        anomaly_rooms: anomalies,
        floors: Object.values(floorData).sort((a, b) => {
            if (a.floor_number === 'unknown') return 1;
            if (b.floor_number === 'unknown') return -1;
            return parseInt(a.floor_number) - parseInt(b.floor_number);
        }),
        last_updated: new Date().toISOString()
    };
}

/**
 * Calculate campus aggregate from building aggregates
 * @param {Array} buildingAggregates - Array of building aggregate objects
 * @param {string} campusName - Campus name
 * @returns {Object} - Campus aggregate statistics
 */
function calculateCampusAggregate(buildingAggregates, campusName) {
    if (!buildingAggregates || buildingAggregates.length === 0) {
        return null;
    }

    const totalConsumption = buildingAggregates.reduce((sum, b) => sum + (b.total_consumption || 0), 0);
    const totalRecharge = buildingAggregates.reduce((sum, b) => sum + (b.total_recharge || 0), 0);
    const totalRooms = buildingAggregates.reduce((sum, b) => sum + (b.room_count || 0), 0);
    const activeRooms = buildingAggregates.reduce((sum, b) => sum + (b.active_room_count || 0), 0);
    const totalAnomalies = buildingAggregates.reduce((sum, b) => sum + (b.anomaly_count || 0), 0);

    return {
        entity_type: 'campus',
        entity_id: campusName,
        entity_name: campusName,
        total_consumption: totalConsumption,
        total_recharge: totalRecharge,
        building_count: buildingAggregates.length,
        room_count: totalRooms,
        active_room_count: activeRooms,
        avg_consumption_per_room: activeRooms > 0 ? totalConsumption / activeRooms : 0,
        anomaly_count: totalAnomalies,
        buildings: buildingAggregates.map(b => ({
            building_name: b.entity_name,
            total_consumption: b.total_consumption,
            room_count: b.room_count,
            anomaly_count: b.anomaly_count
        })).sort((a, b) => b.total_consumption - a.total_consumption),
        last_updated: new Date().toISOString()
    };
}

// ============================================================================
// Prediction Calculation
// ============================================================================

/**
 * Calculate prediction confidence
 * @param {Array} consumptionHistory - Consumption records
 * @param {number} predictionWindow - Days of history used
 * @returns {number} - Confidence score (0-1)
 */
function calculatePredictionConfidence(consumptionHistory, predictionWindow = DEFAULT_PREDICTION_WINDOW) {
    if (!consumptionHistory || consumptionHistory.length === 0) {
        return 0;
    }

    // Data completeness (40% weight)
    const recentRecords = consumptionHistory.slice(-predictionWindow);
    const validRecords = recentRecords.filter(r => r.consumption > 0);
    const completeness = validRecords.length / predictionWindow;

    // Recency score (30% weight)
    const lastRecord = consumptionHistory[consumptionHistory.length - 1];
    const daysSinceLastReading = lastRecord
        ? daysBetween(lastRecord.date, new Date())
        : 999;
    const recencyScore = Math.max(0, 1 - daysSinceLastReading / 7);

    // Consistency score (30% weight)
    const consumptions = validRecords.map(r => r.consumption);
    const stats = calculateStatistics(consumptions);
    const consistencyScore = stats.mean > 0
        ? Math.max(0, 1 - stats.stdDev / stats.mean)
        : 0;

    return 0.4 * completeness + 0.3 * recencyScore + 0.3 * consistencyScore;
}

/**
 * Calculate consumption prediction for a room
 * @param {Array} consumptionHistory - Array of consumption records
 * @param {number} currentBalance - Current balance
 * @param {Object} config - Configuration options
 * @returns {Object} - Prediction object
 */
function calculatePrediction(consumptionHistory, currentBalance, config = {}) {
    const predictionWindow = config.prediction_window || DEFAULT_PREDICTION_WINDOW;

    if (!consumptionHistory || consumptionHistory.length < 3) {
        return {
            daily_rate: 0,
            days_until_depletion: 999,
            confidence: 0,
            confidence_interval: { low: 0, high: 0 },
            recommended_recharge: 0,
            data_points_used: 0,
            insufficient_data: true
        };
    }

    // Use recent history
    const recentHistory = consumptionHistory.slice(-predictionWindow);
    const validConsumptions = recentHistory.filter(r => r.consumption > 0).map(r => r.consumption);

    if (validConsumptions.length === 0) {
        return {
            daily_rate: 0,
            days_until_depletion: 999,
            confidence: 0,
            confidence_interval: { low: 0, high: 0 },
            recommended_recharge: 0,
            data_points_used: recentHistory.length,
            insufficient_data: true
        };
    }

    // Calculate daily rate
    const stats = calculateStatistics(validConsumptions);
    const dailyRate = stats.mean;

    // Calculate confidence
    const confidence = calculatePredictionConfidence(consumptionHistory, predictionWindow);

    // Days until depletion
    const daysUntilDepletion = dailyRate > 0
        ? Math.floor(currentBalance / dailyRate)
        : 999;

    // Confidence interval (80%)
    const ciLow = Math.max(0, dailyRate - 1.28 * stats.stdDev);
    const ciHigh = dailyRate + 1.28 * stats.stdDev;

    // Recommended recharge for 7 days
    const recommendedRecharge = dailyRate * 7;

    // Day of week pattern
    const dayOfWeekPattern = calculateDayOfWeekPattern(recentHistory);

    return {
        daily_rate: dailyRate,
        days_until_depletion: daysUntilDepletion,
        confidence,
        confidence_interval: {
            low: ciLow,
            high: ciHigh
        },
        recommended_recharge: recommendedRecharge,
        data_points_used: recentHistory.length,
        valid_data_points: validConsumptions.length,
        day_of_week_pattern: dayOfWeekPattern,
        generated_at: new Date().toISOString(),
        insufficient_data: false
    };
}

/**
 * Calculate day-of-week consumption pattern
 * @param {Array} consumptionHistory - Consumption records
 * @returns {Object} - Pattern by day of week
 */
function calculateDayOfWeekPattern(consumptionHistory) {
    if (!consumptionHistory || consumptionHistory.length === 0) {
        return null;
    }

    const dayTotals = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];

    consumptionHistory.forEach(record => {
        if (record.consumption > 0) {
            const date = parseDate(record.date);
            if (date) {
                const dayOfWeek = date.getDay();
                dayTotals[dayOfWeek] += record.consumption;
                dayCounts[dayOfWeek]++;
            }
        }
    });

    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    return dayNames.map((name, i) => ({
        day: name,
        day_index: i,
        avg_consumption: dayCounts[i] > 0 ? dayTotals[i] / dayCounts[i] : 0,
        sample_count: dayCounts[i]
    }));
}

// ============================================================================
// Floor Extraction
// ============================================================================

/**
 * Extract floor number from room name
 * @param {string} roomName - Room name
 * @returns {number|string} - Floor number or 'unknown'
 */
function extractFloor(roomName) {
    if (!roomName) return 'unknown';

    // Pattern 1: "第X层" format (highest priority)
    const floorMatch = roomName.match(/第(\d+)层/);
    if (floorMatch) {
        return parseInt(floorMatch[1]);
    }

    // Pattern 2: "XAXXX" format (e.g., "4A101")
    const alphaFloorMatch = roomName.match(/^(\d)[A-Za-z]\d+/);
    if (alphaFloorMatch) {
        return parseInt(alphaFloorMatch[1]);
    }

    // Pattern 3: Hyphenated format (e.g., "诚园-丙-201")
    const hyphenMatch = roomName.match(/-([一二三四五六七八九十甲乙丙丁戊己庚辛壬癸\d]+)-\d+$/);
    if (hyphenMatch) {
        const floorStr = hyphenMatch[1];
        const chineseNums = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
        if (chineseNums[floorStr]) {
            return chineseNums[floorStr];
        }
        if (/^\d+$/.test(floorStr)) {
            return parseInt(floorStr);
        }
    }

    // Pattern 4: "XXX房间" format or pure room number
    const roomNumMatch = roomName.match(/(\d{2,4})/);
    if (roomNumMatch) {
        const roomNum = roomNumMatch[1];
        // Assume first 1-2 digits represent floor
        if (roomNum.length >= 3) {
            const floorPart = roomNum.substring(0, roomNum.length - 2);
            return parseInt(floorPart);
        }
    }

    return 'unknown';
}

// ============================================================================
// Export
// ============================================================================

export {
    // Date utilities
    parseDate,
    formatDate,
    daysBetween,

    // Consumption calculation
    calculateConsumption,
    detectRecharges,

    // Statistics
    calculateStatistics,
    calculateZScore,

    // Anomaly detection
    detectAnomalies,

    // Aggregate calculation
    calculateBuildingAggregate,
    calculateCampusAggregate,

    // Prediction
    calculatePrediction,
    calculatePredictionConfidence,
    calculateDayOfWeekPattern,

    // Utilities
    extractFloor,

    // Constants
    DEFAULT_PREDICTION_WINDOW,
    DEFAULT_ANOMALY_THRESHOLD,
    DEFAULT_CONFIDENCE_THRESHOLD
};

export default {
    parseDate,
    formatDate,
    daysBetween,
    calculateConsumption,
    detectRecharges,
    calculateStatistics,
    calculateZScore,
    detectAnomalies,
    calculateBuildingAggregate,
    calculateCampusAggregate,
    calculatePrediction,
    calculatePredictionConfidence,
    calculateDayOfWeekPattern,
    extractFloor,
    DEFAULT_PREDICTION_WINDOW,
    DEFAULT_ANOMALY_THRESHOLD,
    DEFAULT_CONFIDENCE_THRESHOLD
};
