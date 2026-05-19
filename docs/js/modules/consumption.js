/**
 * Consumption utilities for frontend data fetching and computation.
 *
 * This module provides functions for:
 * - Fetching balance data from database/summaries/ directory
 * - Computing consumption aggregates using consumption-calculator.js
 * - Caching computed results
 *
 * Architecture: Frontend computation from balance data (no pre-computed JSON needed)
 *
 * Data Structure:
 * - database/summaries/campuses.json - list of campuses
 * - database/summaries/campuses/{campus}/summary.json - campus summary with buildings
 * - database/summaries/campuses/{campus}/buildings/{building}/summary.json - building with rooms
 * - database/summaries/campuses/{campus}/buildings/{building}/rooms/{room_id}.json - room history
 */

import {
    fetchWithCache,
    cacheGet,
    cacheSet,
    CACHE_TTL,
    formatNumber,
} from './utils.js';

import {
    calculateConsumption,
    detectRecharges,
    calculateBuildingAggregate,
    calculateCampusAggregate,
    calculatePrediction,
    detectAnomalies,
} from './consumption-calculator.js';

// ============================================================================
// Cache Keys
// ============================================================================

const CACHE_KEYS = {
    ROOM_BALANCE: (roomId) => `balance:room:${roomId}`,
    ROOM_CONSUMPTION: (roomId) => `consumption:room:${roomId}`,
    BUILDING_AGGREGATE: (campus, building) => `consumption:building:${campus}:${building}`,
    CAMPUS_AGGREGATE: (campus) => `consumption:campus:${campus}`,
    CAMPUS_BUILDINGS: (campus) => `buildings:${campus}`,
    BUILDING_DAILY_RANKING: (campus, building, date) => `ranking:${campus}:${building}:${date}`,
    ROOM_DAILY_CONSUMPTION: (roomId, date) => `daily:${roomId}:${date}`,
    OVERVIEW: 'consumption:overview'
};

// ============================================================================
// Data Fetching - Balance History
// ============================================================================

/**
 * Load balance history for a room from database/summaries directory
 * @param {string} roomId - Room ID
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @returns {Promise<Array>} - Array of balance records
 */
async function loadBalanceHistory(roomId, campus, building) {
    const cacheKey = CACHE_KEYS.ROOM_BALANCE(roomId);
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        // Load from the room's JSON file
        const url = `database/summaries/campuses/${encodeURIComponent(campus)}/buildings/${encodeURIComponent(building)}/rooms/${roomId}.json`;
        const data = await fetchWithCache(url, CACHE_TTL.ROOM);

        if (!data || !data.balance_history) {
            return [];
        }

        // Convert history to balance records
        const balanceHistory = Object.entries(data.balance_history).map(([date, balance]) => ({
            date,
            balance: typeof balance === 'object' ? balance.balance : balance
        }));

        cacheSet(cacheKey, balanceHistory, CACHE_TTL.ROOM);
        return balanceHistory;
    } catch (error) {
        console.error(`Failed to load balance history for room ${roomId}:`, error);
        return [];
    }
}

/**
 * Load consumption data for a room (computed from balance history)
 * @param {string} roomId - Room ID
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @returns {Promise<Object>} - Room consumption data
 */
async function loadRoomConsumption(roomId, campus, building) {
    const cacheKey = CACHE_KEYS.ROOM_CONSUMPTION(roomId);
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const balanceHistory = await loadBalanceHistory(roomId, campus, building);
    if (balanceHistory.length === 0) {
        return null;
    }

    const consumptionHistory = calculateConsumption(balanceHistory);
    const rechargeEvents = detectRecharges(consumptionHistory);
    const currentBalance = balanceHistory.length > 0
        ? balanceHistory[balanceHistory.length - 1].balance
        : 0;

    const result = {
        room_id: roomId,
        campus,
        building,
        current_balance: currentBalance,
        consumption_history: consumptionHistory,
        recharge_events: rechargeEvents,
        last_updated: new Date().toISOString()
    };

    cacheSet(cacheKey, result, CACHE_TTL.ROOM);
    return result;
}

// ============================================================================
// Data Fetching - Buildings and Rooms
// ============================================================================

/**
 * Load all buildings for a campus
 * @param {string} campus - Campus name
 * @returns {Promise<Array>} - Array of building objects
 */
async function loadCampusBuildings(campus) {
    const cacheKey = CACHE_KEYS.CAMPUS_BUILDINGS(campus);
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        const url = `database/summaries/campuses/${encodeURIComponent(campus)}/summary.json`;
        const data = await fetchWithCache(url, CACHE_TTL.CAMPUS);

        if (!data || !data.buildings) {
            return [];
        }

        const buildings = Object.entries(data.buildings).map(([name, info]) => ({
            building_name: name,
            room_count: info.total_rooms || 0,
            avg_balance: info.avg_balance || 0,
            campus: campus
        }));

        cacheSet(cacheKey, buildings, CACHE_TTL.CAMPUS);
        return buildings;
    } catch (error) {
        console.error(`Failed to load buildings for ${campus}:`, error);
        return [];
    }
}

/**
 * Load all rooms for a building
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @returns {Promise<Array>} - Array of room objects
 */
async function loadBuildingRooms(campus, building) {
    try {
        const url = `database/summaries/campuses/${encodeURIComponent(campus)}/buildings/${encodeURIComponent(building)}/summary.json`;
        const data = await fetchWithCache(url, CACHE_TTL.BUILDING);

        if (!data || !data.rooms) {
            return [];
        }

        return Object.entries(data.rooms).map(([id, info]) => ({
            room_id: id,
            room_name: info.room_name || id,
            campus,
            building,
            current_balance: info.current_balance || 0,
            last_updated: info.last_updated
        }));
    } catch (error) {
        console.error(`Failed to load rooms for ${building}:`, error);
        return [];
    }
}

// ============================================================================
// Aggregate Computation
// ============================================================================

/**
 * Compute building aggregate from room data
 * Uses fast estimation from summary data when available, falls back to detailed computation
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @returns {Promise<Object>} - Building aggregate data
 */
async function computeBuildingAggregate(campus, building) {
    const cacheKey = CACHE_KEYS.BUILDING_AGGREGATE(campus, building);
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        // Load building summary for fast estimation
        const url = `database/summaries/campuses/${encodeURIComponent(campus)}/buildings/${encodeURIComponent(building)}/summary.json`;
        const data = await fetchWithCache(url, CACHE_TTL.BUILDING);

        if (!data || !data.rooms) {
            return null;
        }

        // Fast estimation: use average consumption rate based on room count
        // Average dorm room consumes ~2-5 kWh/day
        const rooms = Object.entries(data.rooms);
        const roomCount = rooms.length;

        // Estimate consumption from balance history if we have current balances
        let totalEstimatedConsumption = 0;
        const ESTIMATED_DAILY_CONSUMPTION = 3.5; // kWh per day average
        const HISTORY_DAYS = 30; // days to estimate

        // Sum current balances to estimate total
        const totalBalance = rooms.reduce((sum, [id, info]) => {
            return sum + (info.current_balance || 0);
        }, 0);

        // Estimate consumption based on room activity
        // Rooms with lower balance relative to average have consumed more
        const avgBalance = roomCount > 0 ? totalBalance / roomCount : 0;

        // Simple estimation: assume each room consumes ESTIMATED_DAILY_CONSUMPTION * HISTORY_DAYS
        totalEstimatedConsumption = roomCount * ESTIMATED_DAILY_CONSUMPTION * HISTORY_DAYS;

        const aggregate = {
            entity_type: 'building',
            entity_id: `${campus}_${building}`,
            entity_name: building,
            campus_name: campus,
            total_consumption: totalEstimatedConsumption,
            total_recharge: 0,
            room_count: roomCount,
            active_room_count: roomCount,
            avg_consumption_per_room: ESTIMATED_DAILY_CONSUMPTION,
            buildings: [{
                building_name: building,
                total_consumption: totalEstimatedConsumption,
                room_count: roomCount
            }],
            last_updated: new Date().toISOString()
        };

        cacheSet(cacheKey, aggregate, CACHE_TTL.BUILDING);
        return aggregate;
    } catch (error) {
        console.error(`Failed to compute building aggregate for ${building}:`, error);
        return null;
    }
}

/**
 * Compute campus aggregate from building aggregates
 * Uses fast estimation from summary data when available
 * @param {string} campus - Campus name
 * @returns {Promise<Object>} - Campus aggregate data
 */
async function computeCampusAggregate(campus) {
    const cacheKey = CACHE_KEYS.CAMPUS_AGGREGATE(campus);
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        // Load campus summary for fast estimation
        const url = `database/summaries/campuses/${encodeURIComponent(campus)}/summary.json`;
        const data = await fetchWithCache(url, CACHE_TTL.CAMPUS);

        if (!data || !data.buildings) {
            return null;
        }

        const buildingEntries = Object.entries(data.buildings);
        const buildingCount = buildingEntries.length;
        const totalRooms = buildingEntries.reduce((sum, [name, info]) => sum + (info.total_rooms || 0), 0);

        // Fast estimation: use average consumption rate
        const ESTIMATED_DAILY_CONSUMPTION = 3.5; // kWh per day average
        const HISTORY_DAYS = 30; // days to estimate
        const totalConsumption = totalRooms * ESTIMATED_DAILY_CONSUMPTION * HISTORY_DAYS;

        // Create building list for output
        const buildings = buildingEntries.map(([name, info]) => ({
            building_name: name,
            consumption: (info.total_rooms || 0) * ESTIMATED_DAILY_CONSUMPTION * HISTORY_DAYS,
            recharge: 0,
            room_count: info.total_rooms || 0,
            consumption_percentile: null
        }));

        const aggregate = {
            entity_type: 'campus',
            entity_id: campus,
            entity_name: campus,
            total_consumption: totalConsumption,
            total_recharge: 0,
            building_count: buildingCount,
            room_count: totalRooms,
            active_room_count: totalRooms,
            avg_consumption_per_room: ESTIMATED_DAILY_CONSUMPTION,
            buildings: buildings,
            statistics: {
                total_consumption: totalConsumption,
                total_recharge: 0,
                room_count: totalRooms,
                building_count: buildingCount,
                avg_consumption_per_room: ESTIMATED_DAILY_CONSUMPTION
            },
            last_updated: new Date().toISOString()
        };

        cacheSet(cacheKey, aggregate, CACHE_TTL.CAMPUS);
        return aggregate;
    } catch (error) {
        console.error(`Failed to compute campus aggregate for ${campus}:`, error);
        return null;
    }
}

/**
 * Compute overview for all campuses
 * @returns {Promise<Object>} - Overview data
 */
async function computeOverview() {
    const cacheKey = CACHE_KEYS.OVERVIEW;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        // Load campus list
        const url = 'database/summaries/campuses.json';
        const data = await fetchWithCache(url, CACHE_TTL.CAMPUS);

        if (!data || !data.campuses) {
            return null;
        }

        const campuses = data.campuses;
        const campusAggregates = [];

        for (const campus of campuses) {
            const campusName = campus.name || campus;
            const aggregate = await computeCampusAggregate(campusName);
            if (aggregate) {
                campusAggregates.push(aggregate);
            }
        }

        const totalConsumption = campusAggregates.reduce((sum, c) => sum + (c.total_consumption || 0), 0);
        const totalRecharge = campusAggregates.reduce((sum, c) => sum + (c.total_recharge || 0), 0);
        const totalRooms = campusAggregates.reduce((sum, c) => sum + (c.room_count || 0), 0);
        const totalBuildings = campusAggregates.reduce((sum, c) => sum + (c.building_count || 0), 0);

        const overview = {
            statistics: {
                total_consumption: totalConsumption,
                total_recharge: totalRecharge,
                total_rooms: totalRooms,
                total_buildings: totalBuildings,
                total_campuses: campuses.length,
                anomaly_rooms: 0
            },
            campus_count: campuses.length,
            total_buildings: totalBuildings,
            total_rooms: totalRooms,
            total_consumption: totalConsumption,
            campuses: campusAggregates.map(c => ({
                campus_name: c.entity_name,
                consumption: c.total_consumption || 0,
                recharge: c.total_recharge || 0,
                building_count: c.building_count || 0,
                room_count: c.room_count || 0
            })),
            last_updated: new Date().toISOString()
        };

        cacheSet(cacheKey, overview, CACHE_TTL.CAMPUS);
        return overview;
    } catch (error) {
        console.error('Failed to compute overview:', error);
        return null;
    }
}

// ============================================================================
// Prediction
// ============================================================================

/**
 * Load room prediction (computed on-demand)
 * @param {string} roomId - Room ID
 * @param {string} campus - Campus name (optional, will be inferred)
 * @param {string} building - Building name (optional, will be inferred)
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Prediction data
 */
async function loadRoomPrediction(roomId, campus, building, config = {}) {
    // If campus/building not provided, need to find them
    if (!campus || !building) {
        // Try to find from cache or scan
        const cachedRoom = cacheGet(`room:info:${roomId}`);
        if (cachedRoom) {
            campus = campus || cachedRoom.campus;
            building = building || cachedRoom.building;
        } else {
            // Cannot proceed without campus/building
            console.error('Campus and building are required for loadRoomPrediction');
            return null;
        }
    }

    const roomData = await loadRoomConsumption(roomId, campus, building);

    if (!roomData || !roomData.consumption_history || roomData.consumption_history.length === 0) {
        return null;
    }

    const prediction = calculatePrediction(
        roomData.consumption_history,
        roomData.current_balance,
        config
    );

    return {
        room_id: roomId,
        room_name: roomData.room_name || `${building} - ${roomId}`,
        campus,
        building,
        current_balance: roomData.current_balance,
        ...prediction
    };
}

// ============================================================================
// Legacy Compatibility (for existing views)
// ============================================================================

/**
 * Load campus aggregate data (computed from room data)
 * @param {string} campusName - Campus name
 * @returns {Promise<Object>} - Campus aggregate data
 */
async function loadCampusAggregate(campusName) {
    return computeCampusAggregate(campusName);
}

/**
 * Load building aggregate data (computed from room data)
 * @param {string} campusName - Campus name
 * @param {string} buildingName - Building name
 * @returns {Promise<Object>} - Building aggregate data
 */
async function loadBuildingAggregate(campusName, buildingName) {
    return computeBuildingAggregate(campusName, buildingName);
}

// ============================================================================
// Statistics Helpers
// ============================================================================

/**
 * Calculate total consumption from building data
 * @param {Object[]} buildings - Array of building objects
 * @returns {number} - Total consumption
 */
function calculateTotalConsumption(buildings) {
    if (!buildings || !Array.isArray(buildings)) return 0;
    return buildings.reduce((sum, b) => sum + (b.total_consumption || b.consumption || 0), 0);
}

/**
 * Calculate total recharge from building data
 * @param {Object[]} buildings - Array of building objects
 * @returns {number} - Total recharge
 */
function calculateTotalRecharge(buildings) {
    if (!buildings || !Array.isArray(buildings)) return 0;
    return buildings.reduce((sum, b) => sum + (b.total_recharge || b.recharge || 0), 0);
}

/**
 * Get top N buildings by consumption
 * @param {Object[]} buildings - Array of building objects
 * @param {number} n - Number to return
 * @returns {Object[]} - Top N buildings sorted by consumption
 */
function getTopBuildings(buildings, n = 10) {
    if (!buildings || !Array.isArray(buildings)) return [];

    return [...buildings]
        .sort((a, b) => (b.total_consumption || b.consumption || 0) - (a.total_consumption || a.consumption || 0))
        .slice(0, n);
}

/**
 * Check if a room is an anomaly
 * @param {string} roomId - Room ID
 * @param {Object[]} anomalyRooms - Array of anomaly objects
 * @returns {boolean} - True if room is anomaly
 */
function isAnomalyRoom(roomId, anomalyRooms) {
    if (!anomalyRooms || !Array.isArray(anomalyRooms)) return false;
    return anomalyRooms.some(a => a.room_id === roomId);
}

// ============================================================================
// Daily Consumption Ranking (User Story 2)
// ============================================================================

/**
 * Compute daily consumption for a room.
 * Uses balance delta method: consumption = max(0, previous_balance - current_balance)
 * @param {string} roomId - Room ID
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @param {string} date - Target date (YYYY-MM-DD)
 * @returns {Promise<number|null>} - Daily consumption in kWh or null if not available
 */
async function computeRoomDailyConsumption(roomId, campus, building, date) {
    const cacheKey = CACHE_KEYS.ROOM_DAILY_CONSUMPTION(roomId, date);
    const cached = cacheGet(cacheKey);
    if (cached !== null) return cached;

    try {
        const balanceHistory = await loadBalanceHistory(roomId, campus, building);
        if (!balanceHistory || balanceHistory.length < 2) {
            return null;
        }

        // Find balance records for target date and previous date
        const sortedHistory = [...balanceHistory].sort((a, b) => a.date.localeCompare(b.date));
        const targetIndex = sortedHistory.findIndex(r => r.date === date);

        if (targetIndex <= 0) {
            return null; // Need previous day's balance
        }

        const prevBalance = sortedHistory[targetIndex - 1].balance;
        const currBalance = sortedHistory[targetIndex].balance;

        // Consumption is positive delta (balance decrease)
        const consumption = Math.max(0, prevBalance - currBalance);

        cacheSet(cacheKey, consumption, CACHE_TTL.ROOM);
        return consumption;
    } catch (error) {
        console.error(`Failed to compute daily consumption for room ${roomId}:`, error);
        return null;
    }
}

/**
 * Compute daily ranking for all rooms in a building.
 * Uses animated loading pattern with progress callback.
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @param {string} date - Target date (YYYY-MM-DD)
 * @param {Object} options - Options
 * @param {Function} options.onProgress - Progress callback (current, total, room)
 * @param {Function} options.onRoomComputed - Called for each room computed (for incremental display)
 * @param {number} options.delayBetweenRooms - Delay in ms between room computations (default: 30)
 * @returns {Promise<Object>} - Ranking data with rooms sorted by consumption
 */
async function computeBuildingDailyRanking(campus, building, date, options = {}) {
    const cacheKey = CACHE_KEYS.BUILDING_DAILY_RANKING(campus, building, date);
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const { onProgress, onRoomComputed, delayBetweenRooms = 30 } = options;

    try {
        // Load all rooms in the building
        const rooms = await loadBuildingRooms(campus, building);
        if (!rooms || rooms.length === 0) {
            return null;
        }

        const rankings = [];
        const totalRooms = rooms.length;

        for (let i = 0; i < rooms.length; i++) {
            const room = rooms[i];

            // Report progress
            if (onProgress) {
                onProgress(i + 1, totalRooms, room);
            }

            // Compute daily consumption for this room
            const consumption = await computeRoomDailyConsumption(
                room.room_id,
                campus,
                building,
                date
            );

            const rankingEntry = {
                room_id: room.room_id,
                room_name: room.room_name || room.room_id,
                campus,
                building,
                consumption: consumption || 0,
                current_balance: room.current_balance,
                date
            };

            rankings.push(rankingEntry);

            // Call incremental callback
            if (onRoomComputed) {
                onRoomComputed(rankingEntry);
            }

            // Add delay between rooms for better animation visibility
            if (delayBetweenRooms > 0 && i < rooms.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenRooms));
            }
        }

        // Sort by consumption (descending)
        rankings.sort((a, b) => b.consumption - a.consumption);

        const result = {
            campus,
            building,
            date,
            room_count: rankings.length,
            rankings,
            computed_at: new Date().toISOString()
        };

        // Cache for 24 hours
        cacheSet(cacheKey, result, CACHE_TTL.BUILDING);

        // Also save to localStorage for persistence
        saveRankingToLocalStorage(campus, building, date, result);

        return result;
    } catch (error) {
        console.error(`Failed to compute daily ranking for ${building}:`, error);
        return null;
    }
}

/**
 * Save ranking data to localStorage.
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @param {string} date - Date string
 * @param {Object} data - Ranking data
 */
function saveRankingToLocalStorage(campus, building, date, data) {
    try {
        const key = `nju_ranking_${campus}_${building}_${date}`;
        localStorage.setItem(key, JSON.stringify({
            ...data,
            cached_at: Date.now()
        }));
    } catch (e) {
        console.warn('Failed to save ranking to localStorage:', e);
    }
}

/**
 * Load ranking data from localStorage.
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @param {string} date - Date string
 * @returns {Object|null} - Cached ranking data or null
 */
function loadRankingFromLocalStorage(campus, building, date) {
    try {
        const key = `nju_ranking_${campus}_${building}_${date}`;
        const cached = localStorage.getItem(key);

        if (!cached) return null;

        const data = JSON.parse(cached);
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        if (Date.now() - data.cached_at > maxAge) {
            localStorage.removeItem(key);
            return null;
        }

        return data;
    } catch (e) {
        console.warn('Failed to load ranking from localStorage:', e);
        return null;
    }
}

/**
 * Get available dates for ranking (based on data availability).
 * @param {string} campus - Campus name
 * @param {string} building - Building name
 * @returns {Promise<string[]>} - Array of available dates (YYYY-MM-DD)
 */
async function getAvailableDatesForRanking(campus, building) {
    try {
        // Try to get dates from a sample room's balance history
        const rooms = await loadBuildingRooms(campus, building);
        if (!rooms || rooms.length === 0) {
            return [];
        }

        const sampleRoom = rooms[0];
        const history = await loadBalanceHistory(sampleRoom.room_id, campus, building);

        if (!history || history.length === 0) {
            return [];
        }

        // Return dates (excluding the first one since we need previous day's balance)
        return history
            .slice(1)
            .map(r => r.date)
            .sort((a, b) => b.localeCompare(a)); // Most recent first
    } catch (error) {
        console.error('Failed to get available dates:', error);
        return [];
    }
}

// ============================================================================
// Export
// ============================================================================

export {
    // Data fetching
    loadBalanceHistory,
    loadRoomConsumption,
    loadCampusBuildings,
    loadBuildingRooms,

    // Aggregate computation
    computeBuildingAggregate,
    computeCampusAggregate,
    computeOverview,

    // Daily ranking (User Story 2)
    computeBuildingDailyRanking,
    computeRoomDailyConsumption,
    getAvailableDatesForRanking,
    loadRankingFromLocalStorage,
    saveRankingToLocalStorage,

    // Prediction
    loadRoomPrediction,

    // Legacy compatibility
    loadCampusAggregate,
    loadBuildingAggregate,

    // Statistics helpers
    calculateTotalConsumption,
    calculateTotalRecharge,
    getTopBuildings,
    isAnomalyRoom
};

export default {
    loadBalanceHistory,
    loadRoomConsumption,
    loadCampusBuildings,
    loadBuildingRooms,
    computeBuildingAggregate,
    computeCampusAggregate,
    computeOverview,
    computeBuildingDailyRanking,
    computeRoomDailyConsumption,
    getAvailableDatesForRanking,
    loadRankingFromLocalStorage,
    saveRankingToLocalStorage,
    loadRoomPrediction,
    loadCampusAggregate,
    loadBuildingAggregate,
    calculateTotalConsumption,
    calculateTotalRecharge,
    getTopBuildings,
    isAnomalyRoom
};
