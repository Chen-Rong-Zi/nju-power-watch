/**
 * Achievement System Module
 * Badges and challenges for energy saving
 */

/**
 * T100-T110: Achievement system implementation
 */

// Achievement definitions
var ACHIEVEMENTS = {
    ENERGY_SAVER: {
        id: 'energy-saver',
        name: '节能模范',
        icon: '🌱',
        description: '连续30天日均用电低于2度',
        condition: function(stats) {
            return stats.avgDailyConsumption < 2 && stats.daysAnalyzed >= 30;
        }
    },
    WARNING_EXPERT: {
        id: 'warning-expert',
        name: '预警专家',
        icon: '⚠️',
        description: '成功预测低余额并及时充值',
        condition: function(stats) {
            return stats.rechargedBeforeEmpty;
        }
    },
    COMPARISON_CHAMPION: {
        id: 'comparison-champion',
        name: '对比冠军',
        icon: '🏆',
        description: '用电量低于楼栋平均水平',
        condition: function(stats) {
            return stats.buildingRank && stats.buildingRank > 0.7;
        }
    },
    STABLE_USER: {
        id: 'stable-user',
        name: '稳定用户',
        icon: '📊',
        description: '连续30天用电波动小于20%',
        condition: function(stats) {
            return stats.stabilityScore > 0.8 && stats.daysAnalyzed >= 30;
        }
    },
    EARLY_BIRD: {
        id: 'early-bird',
        name: '早鸟用户',
        icon: '🌅',
        description: '工作日用电量高于周末',
        condition: function(stats) {
            return stats.weekdayWeekendRatio > 1.2;
        }
    }
};

// Challenge definitions
var CHALLENGES = {
    TWENTY_PERCENT_LESS: {
        id: 'twenty-percent-less',
        name: '节能20%挑战',
        description: '本月用电量比上月减少20%',
        duration: 30,
        target: -0.2
    },
    FIVE_KWH_LIMIT: {
        id: 'five-kwh-limit',
        name: '日均5度挑战',
        description: '连续7天日均用电不超过5度',
        duration: 7,
        target: 5
    },
    NO_SPIKES: {
        id: 'no-spikes',
        name: '平稳用电挑战',
        description: '连续14天无异常用电高峰',
        duration: 14,
        target: 0
    }
};

/**
 * Get earned achievements for a room
 */
function getEarnedAchievements(roomData, buildingData) {
    var stats = calculateAchievementStats(roomData, buildingData);
    var earned = [];

    Object.values(ACHIEVEMENTS).forEach(function(achievement) {
        try {
            if (achievement.condition(stats)) {
                earned.push({
                    id: achievement.id,
                    name: achievement.name,
                    icon: achievement.icon,
                    description: achievement.description,
                    earnedAt: new Date().toISOString()
                });
            }
        } catch (e) {
            console.error('Error checking achievement:', achievement.id, e);
        }
    });

    return earned;
}

/**
 * Calculate stats for achievement checking
 */
function calculateAchievementStats(roomData, buildingData) {
    var history = roomData.balance_history || {};
    var dates = Object.keys(history).sort();

    // Basic stats
    var totalConsumption = dates.length > 1 ? history[dates[0]] - history[dates[dates.length - 1]] : 0;
    var avgDailyConsumption = dates.length > 1 ? totalConsumption / (dates.length - 1) : 0;

    // Stability score
    var consumptions = [];
    for (var i = 1; i < dates.length; i++) {
        consumptions.push(history[dates[i - 1]] - history[dates[i]]);
    }

    var avg = consumptions.length > 0 ? consumptions.reduce(function(a, b) { return a + b; }, 0) / consumptions.length : 0;
    var variance = consumptions.length > 0 ? consumptions.reduce(function(sum, c) {
        return sum + Math.pow(c - avg, 2);
    }, 0) / consumptions.length : 0;
    var stdDev = Math.sqrt(variance);
    var stabilityScore = avg > 0 ? Math.max(0, 1 - (stdDev / avg)) : 1;

    // Building rank
    var buildingRank = null;
    if (buildingData && buildingData.rooms) {
        var roomBalances = Object.values(buildingData.rooms).map(function(r) {
            return r.current_balance || 0;
        });
        var currentBalance = roomData.current_balance || Object.values(history).pop() || 0;
        var sortedBalances = roomBalances.sort(function(a, b) { return b - a; });
        var rank = sortedBalances.indexOf(currentBalance) + 1;
        buildingRank = 1 - (rank / sortedBalances.length);
    }

    // Weekday vs weekend
    var weekdayTotal = 0, weekdayCount = 0;
    var weekendTotal = 0, weekendCount = 0;

    for (var i = 1; i < dates.length; i++) {
        var dateStr = dates[i];
        var year = parseInt(dateStr.slice(0, 4));
        var month = parseInt(dateStr.slice(4, 6)) - 1;
        var day = parseInt(dateStr.slice(6, 8));
        var date = new Date(year, month, day);
        var dayOfWeek = date.getDay();
        var consumption = history[dates[i - 1]] - history[dates[i]];

        if (dayOfWeek === 0 || dayOfWeek === 6) {
            weekendTotal += consumption;
            weekendCount++;
        } else {
            weekdayTotal += consumption;
            weekdayCount++;
        }
    }

    var weekdayAvg = weekdayCount > 0 ? weekdayTotal / weekdayCount : 0;
    var weekendAvg = weekendCount > 0 ? weekendTotal / weekendCount : 0;
    var weekdayWeekendRatio = weekendAvg > 0 ? weekdayAvg / weekendAvg : 1;

    return {
        daysAnalyzed: dates.length,
        avgDailyConsumption: avgDailyConsumption,
        stabilityScore: stabilityScore,
        buildingRank: buildingRank,
        weekdayWeekendRatio: weekdayWeekendRatio,
        rechargedBeforeEmpty: false // Would need to track from history
    };
}

/**
 * Get active challenges for user
 */
function getActiveChallenges() {
    try {
        var stored = localStorage.getItem('nju_electric_challenges');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Start a challenge
 */
function startChallenge(challengeId, roomData) {
    var challenge = CHALLENGES[challengeId];
    if (!challenge) return null;

    var activeChallenges = getActiveChallenges();

    var activeChallenge = {
        id: challengeId,
        name: challenge.name,
        description: challenge.description,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + challenge.duration * 24 * 60 * 60 * 1000).toISOString(),
        target: challenge.target,
        startBalance: roomData.current_balance || Object.values(roomData.balance_history || {}).pop() || 0,
        progress: 0
    };

    activeChallenges.push(activeChallenge);
    localStorage.setItem('nju_electric_challenges', JSON.stringify(activeChallenges));

    return activeChallenge;
}

/**
 * Update challenge progress
 */
function updateChallengeProgress(roomData) {
    var activeChallenges = getActiveChallenges();
    var completed = [];

    activeChallenges.forEach(function(challenge) {
        var daysPassed = Math.floor((Date.now() - new Date(challenge.startDate).getTime()) / (24 * 60 * 60 * 1000));
        var currentBalance = roomData.current_balance || Object.values(roomData.balance_history || {}).pop() || 0;

        // Update progress based on challenge type
        if (challenge.id === 'twenty-percent-less') {
            var consumption = challenge.startBalance - currentBalance;
            challenge.progress = daysPassed / 30; // Simple day-based progress
        } else if (challenge.id === 'five-kwh-limit') {
            var history = roomData.balance_history || {};
            var dates = Object.keys(history).sort().slice(-7);
            var total = dates.length > 1 ? history[dates[0]] - history[dates[dates.length - 1]] : 0;
            var dailyAvg = dates.length > 1 ? total / (dates.length - 1) : 0;
            challenge.progress = dailyAvg <= 5 ? daysPassed / 7 : 0;
        }

        // Check if completed
        if (challenge.progress >= 1) {
            completed.push(challenge);
        }
    });

    localStorage.setItem('nju_electric_challenges', JSON.stringify(activeChallenges));

    return { active: activeChallenges, completed: completed };
}

/**
 * Create achievements display
 */
function createAchievementsDisplay(roomData, buildingData) {
    var earned = getEarnedAchievements(roomData, buildingData);

    var html = '<div class="analytics-card" style="margin-top: 20px;">' +
        '<h3>🏅 成就徽章</h3>';

    if (earned.length === 0) {
        html += '<p style="color: #666;">暂未获得成就，继续加油！</p>';
    } else {
        earned.forEach(function(achievement) {
            html += '<span class="achievement-badge">' +
                '<span class="badge-icon">' + achievement.icon + '</span>' +
                '<span>' + achievement.name + '</span>' +
            '</span>';
        });
    }

    // Show available achievements
    html += '<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee;">' +
        '<h4 style="margin-bottom: 12px;">可解锁成就</h4>';

    Object.values(ACHIEVEMENTS).forEach(function(achievement) {
        var isEarned = earned.some(function(e) { return e.id === achievement.id; });
        if (!isEarned) {
            html += '<div style="display: flex; align-items: center; margin-bottom: 8px; opacity: 0.6;">' +
                '<span style="font-size: 1.5rem; margin-right: 10px;">' + achievement.icon + '</span>' +
                '<div>' +
                    '<div style="font-weight: 600;">' + achievement.name + '</div>' +
                    '<div style="font-size: 0.85rem; color: #666;">' + achievement.description + '</div>' +
                '</div>' +
            '</div>';
        }
    });

    html += '</div></div>';

    return html;
}

/**
 * Create challenges display
 */
function createChallengesDisplay(roomData) {
    var activeChallenges = getActiveChallenges();

    var html = '<div class="analytics-card" style="margin-top: 20px;">' +
        '<h3>🎯 节能挑战</h3>';

    if (activeChallenges.length === 0) {
        html += '<p style="color: #666; margin-bottom: 16px;">暂无进行中的挑战</p>';

        // Show available challenges
        Object.values(CHALLENGES).forEach(function(challenge) {
            html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 12px; background: #f8f9fa; border-radius: 8px;">' +
                '<div>' +
                    '<div style="font-weight: 600;">' + challenge.name + '</div>' +
                    '<div style="font-size: 0.85rem; color: #666;">' + challenge.description + '</div>' +
                '</div>' +
                '<button class="btn" onclick="startChallengeUI(\'' + challenge.id + '\')">参与</button>' +
            '</div>';
        });
    } else {
        activeChallenges.forEach(function(challenge) {
            var progressPercent = Math.min(100, Math.round(challenge.progress * 100));

            html += '<div style="margin-bottom: 16px;">' +
                '<div style="display: flex; justify-content: space-between; margin-bottom: 8px;">' +
                    '<span style="font-weight: 600;">' + challenge.name + '</span>' +
                    '<span>' + progressPercent + '%</span>' +
                '</div>' +
                '<div style="background: #e0e0e0; border-radius: 10px; height: 10px; overflow: hidden;">' +
                    '<div style="background: linear-gradient(135deg, #667eea, #764ba2); height: 100%; width: ' + progressPercent + '%;"></div>' +
                '</div>' +
                '<div style="font-size: 0.85rem; color: #666; margin-top: 4px;">' + challenge.description + '</div>' +
            '</div>';
        });
    }

    html += '</div>';

    return html;
}

/**
 * Start challenge UI handler
 */
function startChallengeUI(challengeId) {
    if (typeof state !== 'undefined' && state.roomData) {
        var challenge = startChallenge(challengeId, state.roomData);
        if (challenge) {
            alert('已开始挑战: ' + challenge.name);
        }
    }
}

// Make function globally available
window.startChallengeUI = startChallengeUI;
