/**
 * Alert Subscription Module
 * Subscribe to room alerts and manage notifications
 */

/**
 * T090-T099: Alert subscription implementation
 */

/**
 * Check if a room is subscribed
 */
function isRoomSubscribed(roomId) {
    var subscriptions = getAlertSubscriptions();
    return subscriptions.some(function(s) { return s.roomId === roomId && s.enabled; });
}

/**
 * Get all alert subscriptions
 */
function getAlertSubscriptions() {
    try {
        var stored = localStorage.getItem('nju_electric_subscriptions');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Save alert subscription
 */
function saveAlertSubscription(subscription) {
    var subscriptions = getAlertSubscriptions();

    var existing = subscriptions.findIndex(function(s) { return s.roomId === subscription.roomId; });

    if (existing !== -1) {
        subscriptions[existing] = subscription;
    } else {
        subscriptions.push(subscription);
    }

    localStorage.setItem('nju_electric_subscriptions', JSON.stringify(subscriptions));
    return subscription;
}

/**
 * Remove alert subscription
 */
function removeAlertSubscription(roomId) {
    var subscriptions = getAlertSubscriptions();
    subscriptions = subscriptions.filter(function(s) { return s.roomId !== roomId; });
    localStorage.setItem('nju_electric_subscriptions', JSON.stringify(subscriptions));
}

/**
 * Toggle room subscription
 */
function toggleRoomSubscription(campus, building, roomId, roomName) {
    if (isRoomSubscribed(roomId)) {
        removeAlertSubscription(roomId);
        return { subscribed: false };
    } else {
        var subscription = {
            roomId: roomId,
            roomName: roomName,
            campus: campus,
            building: building,
            createdAt: new Date().toISOString(),
            enabled: true,
            thresholds: {
                lowBalance: 10,
                warningDays: 3
            }
        };
        saveAlertSubscription(subscription);
        return { subscribed: true, subscription: subscription };
    }
}

/**
 * Update subscription thresholds
 */
function updateSubscriptionThresholds(roomId, thresholds) {
    var subscriptions = getAlertSubscriptions();
    var sub = subscriptions.find(function(s) { return s.roomId === roomId; });

    if (sub) {
        sub.thresholds = Object.assign({}, sub.thresholds, thresholds);
        localStorage.setItem('nju_electric_subscriptions', JSON.stringify(subscriptions));
    }

    return sub;
}

/**
 * Get alert history
 */
function getAlertHistory() {
    try {
        var stored = localStorage.getItem('nju_electric_alert_history');
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Log alert to history
 */
function logAlert(alert) {
    var history = getAlertHistory();

    history.unshift({
        roomId: alert.roomId,
        roomName: alert.roomName,
        type: alert.type,
        message: alert.message,
        timestamp: new Date().toISOString()
    });

    // Keep only last 100 alerts
    history = history.slice(0, 100);
    localStorage.setItem('nju_electric_alert_history', JSON.stringify(history));
}

/**
 * Clear alert history
 */
function clearAlertHistory() {
    localStorage.removeItem('nju_electric_alert_history');
}

/**
 * Create subscription button
 */
function createSubscriptionButton(campus, building, roomId, roomName) {
    var isSubscribed = isRoomSubscribed(roomId);

    var html =
        '<div class="subscription-section" style="margin-top: 20px;">' +
            '<button id="subscription-btn-' + roomId + '" class="subscription-btn ' +
            (isSubscribed ? 'unsubscribe' : 'subscribe') + '" ' +
            'onclick="handleSubscriptionClick(\'' + campus + '\', \'' + building + '\', \'' +
            roomId + '\', \'' + roomName.replace(/'/g, "\\'") + '\')">' +
            (isSubscribed ? '🔔 已订阅 - 点击取消' : '🔔 订阅预警') +
            '</button>' +
            (isSubscribed ?
                '<div style="margin-top: 10px; font-size: 0.85rem; color: #666;">' +
                    '当余额低于10度或预计3天内用尽时会收到提醒' +
                '</div>' : '') +
        '</div>';

    return html;
}

/**
 * Handle subscription button click
 */
function handleSubscriptionClick(campus, building, roomId, roomName) {
    var result = toggleRoomSubscription(campus, building, roomId, roomName);

    // Update button
    var btn = document.getElementById('subscription-btn-' + roomId);
    if (btn) {
        if (result.subscribed) {
            btn.className = 'subscription-btn unsubscribe';
            btn.textContent = '🔔 已订阅 - 点击取消';

            // Request notification permission if not granted
            if (typeof Notifications !== 'undefined') {
                Notifications.requestPermission();
            }
        } else {
            btn.className = 'subscription-btn subscribe';
            btn.textContent = '🔔 订阅预警';
        }
    }

    // Show confirmation
    if (result.subscribed) {
        if (typeof Notifications !== 'undefined' && Notifications.getPermissionStatus() === 'granted') {
            Notifications.show('订阅成功 ✅', {
                body: '已订阅 ' + roomName + ' 的电费预警',
                tag: 'subscription-' + roomId
            });
        }
    }
}

/**
 * Check subscribed rooms for alerts
 */
async function checkSubscriptionsForAlerts() {
    var subscriptions = getAlertSubscriptions();
    var alerts = [];

    for (var i = 0; i < subscriptions.length; i++) {
        var sub = subscriptions[i];
        if (!sub.enabled) continue;

        try {
            var resp = await fetch('./database/summaries/campuses/' + sub.campus +
                '/buildings/' + sub.building + '/rooms/' + sub.roomId + '.json');
            var roomData = await resp.json();

            var balance = roomData.current_balance ||
                Object.values(roomData.balance_history || {}).pop() || 0;

            // Check low balance
            if (balance < sub.thresholds.lowBalance) {
                var alert = {
                    roomId: sub.roomId,
                    roomName: sub.roomName,
                    type: 'low-balance',
                    message: '当前余额仅 ' + balance.toFixed(1) + ' 度，请及时充值',
                    balance: balance
                };
                alerts.push(alert);
                logAlert(alert);

                // Show notification
                if (typeof Notifications !== 'undefined') {
                    Notifications.showLowBalanceWarning(sub.roomName, balance, 0);
                }
            }
        } catch (e) {
            console.error('Error checking subscription:', sub.roomId, e);
        }
    }

    return alerts;
}

/**
 * Create alert history display
 */
function createAlertHistoryDisplay() {
    var history = getAlertHistory();

    if (history.length === 0) {
        return '<div class="empty-state"><div class="empty-icon">📭</div><p>暂无预警记录</p></div>';
    }

    var html = '<div class="alert-history-list">';

    history.slice(0, 20).forEach(function(alert) {
        var date = new Date(alert.timestamp);
        var timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

        var typeIcon = alert.type === 'low-balance' ? '🔴' :
                       alert.type === 'predicted-empty' ? '🟠' : '⚠️';

        html +=
            '<div class="warning-card ' + (alert.type === 'low-balance' ? 'red' : 'orange') + '">' +
                '<div class="warning-header">' +
                    '<span class="warning-badge">' + typeIcon + '</span>' +
                    '<span class="warning-room">' + alert.roomName + '</span>' +
                '</div>' +
                '<div class="warning-details">' + alert.message + '</div>' +
                '<div style="font-size: 0.8rem; color: #999; margin-top: 8px;">' + timeStr + '</div>' +
            '</div>';
    });

    html += '</div>';

    html += '<button class="btn" onclick="clearAlertHistoryUI()" style="margin-top: 15px;">清空历史</button>';

    return html;
}

/**
 * Clear alert history UI
 */
function clearAlertHistoryUI() {
    clearAlertHistory();
    var container = document.getElementById('alert-history-container');
    if (container) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>暂无预警记录</p></div>';
    }
}

// Make functions globally available
window.handleSubscriptionClick = handleSubscriptionClick;
window.clearAlertHistoryUI = clearAlertHistoryUI;
