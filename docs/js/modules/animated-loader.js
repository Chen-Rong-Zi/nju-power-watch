/**
 * Animated Loader Module
 *
 * Provides animated loading indicators for batch operations.
 * Includes skeleton screens, progress bars, and incremental list displays.
 */

// ============================================================================
// Skeleton Loader
// ============================================================================

/**
 * Create a skeleton loading placeholder.
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Skeleton options
 * @param {string} options.type - Type: 'card', 'table', 'list', 'chart'
 * @param {number} options.count - Number of skeleton items
 * @param {boolean} options.animated - Enable shimmer animation
 * @returns {Object} Controller with update() and complete() methods
 */
function createSkeleton(container, options = {}) {
    const {
        type = 'card',
        count = 5,
        animated = true
    } = options;

    const skeletonClass = animated ? 'skeleton skeleton-animated' : 'skeleton';

    let html = '';

    switch (type) {
        case 'card':
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-card">
                        <div class="${skeletonClass} skeleton-title"></div>
                        <div class="${skeletonClass} skeleton-text"></div>
                        <div class="${skeletonClass} skeleton-text short"></div>
                    </div>
                `;
            }
            break;

        case 'table':
            html = '<div class="skeleton-table">';
            html += `
                <div class="skeleton-table-header">
                    <div class="${skeletonClass} skeleton-cell"></div>
                    <div class="${skeletonClass} skeleton-cell"></div>
                    <div class="${skeletonClass} skeleton-cell"></div>
                    <div class="${skeletonClass} skeleton-cell"></div>
                </div>
            `;
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-table-row">
                        <div class="${skeletonClass} skeleton-cell"></div>
                        <div class="${skeletonClass} skeleton-cell"></div>
                        <div class="${skeletonClass} skeleton-cell"></div>
                        <div class="${skeletonClass} skeleton-cell"></div>
                    </div>
                `;
            }
            html += '</div>';
            break;

        case 'list':
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-list-item">
                        <div class="${skeletonClass} skeleton-avatar"></div>
                        <div class="skeleton-list-content">
                            <div class="${skeletonClass} skeleton-title"></div>
                            <div class="${skeletonClass} skeleton-text short"></div>
                        </div>
                    </div>
                `;
            }
            break;

        case 'chart':
            html = `
                <div class="skeleton-chart">
                    <div class="${skeletonClass} skeleton-chart-area"></div>
                    <div class="skeleton-chart-legend">
                        <div class="${skeletonClass} skeleton-legend-item"></div>
                        <div class="${skeletonClass} skeleton-legend-item"></div>
                        <div class="${skeletonClass} skeleton-legend-item"></div>
                    </div>
                </div>
            `;
            break;
    }

    container.innerHTML = html;

    return {
        update(newOptions) {
            // Recreate with new options
            Object.assign(options, newOptions);
            createSkeleton(container, options);
        },
        complete() {
            container.innerHTML = '';
        }
    };
}

// ============================================================================
// Progress Bar
// ============================================================================

/**
 * Create a progress bar for batch operations.
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Progress options
 * @param {string} options.label - Label text
 * @param {boolean} options.showPercentage - Show percentage
 * @param {boolean} options.showCount - Show current/total
 * @param {Function} options.onCancel - Cancel callback
 * @returns {Object} Controller with update(), complete(), setLabel() methods
 */
function createProgressBar(container, options = {}) {
    const {
        label = '正在计算...',
        showPercentage = true,
        showCount = false,
        onCancel = null
    } = options;

    let current = 0;
    let total = 0;

    const html = `
        <div class="progress-container">
            <div class="progress-header">
                <span class="progress-label">${label}</span>
                ${onCancel ? '<button class="progress-cancel">取消</button>' : ''}
            </div>
            <div class="progress-bar-wrapper">
                <div class="progress-bar" style="width: 0%"></div>
            </div>
            <div class="progress-info">
                ${showPercentage ? '<span class="progress-percentage">0%</span>' : ''}
                ${showCount ? '<span class="progress-count">0 / 0</span>' : ''}
            </div>
        </div>
    `;

    container.innerHTML = html;

    const progressBar = container.querySelector('.progress-bar');
    const labelEl = container.querySelector('.progress-label');
    const percentageEl = container.querySelector('.progress-percentage');
    const countEl = container.querySelector('.progress-count');
    const cancelBtn = container.querySelector('.progress-cancel');

    if (cancelBtn && onCancel) {
        cancelBtn.addEventListener('click', onCancel);
    }

    function updateUI() {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

        progressBar.style.width = `${percentage}%`;

        if (percentageEl) {
            percentageEl.textContent = `${percentage}%`;
        }

        if (countEl) {
            countEl.textContent = `${current} / ${total}`;
        }
    }

    return {
        update(newCurrent, newTotal) {
            current = newCurrent;
            total = newTotal;
            updateUI();
        },
        complete() {
            container.innerHTML = '';
        },
        setLabel(newLabel) {
            if (labelEl) {
                labelEl.textContent = newLabel;
            }
        }
    };
}

// ============================================================================
// Incremental List
// ============================================================================

/**
 * Create a list that updates incrementally as items are computed.
 * Optimized to only re-render items whose position changed.
 * @param {HTMLElement} container - Container element
 * @param {Object} options - List options
 * @param {number} options.maxVisible - Max items to show (default: 50)
 * @param {string} options.sortKey - Key to sort by
 * @param {boolean} options.sortDesc - Sort descending
 * @param {Function} options.renderItem - Custom render function
 * @param {number} options.animationDelay - Delay in ms between position updates (default: 50)
 * @returns {Object} Controller with addItem(), finalize(), clear(), getItems() methods
 */
function createIncrementalList(container, options = {}) {
    const {
        maxVisible = 50,
        sortKey = 'value',
        sortDesc = true,
        renderItem = null,
        animationDelay = 50
    } = options;

    let items = [];
    let previousPositions = new Map(); // Track previous positions by item ID
    let finalized = false;
    let renderQueued = false;

    function getItemId(item) {
        return item.id || item.roomId || item.room_id || item.name || JSON.stringify(item);
    }

    function defaultRenderItem(item, rank) {
        const el = document.createElement('div');
        el.className = 'incremental-list-item';
        el.innerHTML = `
            <span class="item-rank">#${rank}</span>
            <span class="item-name">${item.name || item.roomName || item.room_name || 'Unknown'}</span>
            <span class="item-value">${typeof item[sortKey] === 'number' ? item[sortKey].toFixed(2) : item[sortKey]}</span>
        `;
        return el;
    }

    function sortItems() {
        items.sort((a, b) => {
            const aVal = a[sortKey] || 0;
            const bVal = b[sortKey] || 0;
            return sortDesc ? bVal - aVal : aVal - bVal;
        });
    }

    function getCurrentPositions() {
        const positions = new Map();
        items.forEach((item, index) => {
            positions.set(getItemId(item), index);
        });
        return positions;
    }

    function hasPositionChanged(newPositions) {
        if (previousPositions.size !== newPositions.size) {
            return true;
        }
        for (const [id, position] of newPositions) {
            const prevPosition = previousPositions.get(id);
            if (prevPosition === undefined || prevPosition !== position) {
                return true;
            }
        }
        return false;
    }

    function render() {
        const newPositions = getCurrentPositions();

        // Only re-render if positions changed or this is the first render
        if (!hasPositionChanged(newPositions) && container.children.length > 0) {
            return;
        }

        // Update previous positions
        previousPositions = newPositions;

        // Get visible items (top 50)
        const visibleItems = items.slice(0, maxVisible);
        const renderFn = renderItem || defaultRenderItem;

        // Build a map of existing elements by item ID
        const existingElements = new Map();
        Array.from(container.children).forEach(child => {
            if (child.dataset && child.dataset.itemId) {
                existingElements.set(child.dataset.itemId, child);
            }
        });

        // Clear container
        container.innerHTML = '';

        // Render visible items
        visibleItems.forEach((item, index) => {
            const itemId = getItemId(item);
            const prevPosition = previousPositions.get(itemId);
            const newPosition = index;

            // Check if this item's position changed or it's new
            const isNewItem = !existingElements.has(itemId);
            const positionChanged = prevPosition !== newPosition;

            const el = renderFn(item, index + 1);
            if (el) {
                el.dataset.itemId = itemId;

                // Add animation class for new or moved items
                if (isNewItem || positionChanged) {
                    el.classList.add('incremental-list-item-entering');
                    el.classList.add('incremental-list-item-moved');
                }

                container.appendChild(el);
            }
        });

        // Show "more items" indicator if there are more items
        if (items.length > maxVisible) {
            const moreEl = document.createElement('div');
            moreEl.className = 'incremental-list-more';
            moreEl.textContent = `还有 ${items.length - maxVisible} 项...`;
            container.appendChild(moreEl);
        }
    }

    // Debounced render to avoid rapid re-renders
    function queueRender() {
        if (renderQueued) return;
        renderQueued = true;

        setTimeout(() => {
            renderQueued = false;
            render();
        }, animationDelay);
    }

    return {
        addItem(item) {
            if (finalized) return;

            items.push(item);
            sortItems();
            queueRender();
        },

        addItems(newItems) {
            if (finalized) return;

            items.push(...newItems);
            sortItems();
            queueRender();
        },

        removeItem(id) {
            items = items.filter(item => getItemId(item) !== id);
            previousPositions = getCurrentPositions();
            render();
        },

        finalize() {
            finalized = true;
            render();
        },

        clear() {
            items = [];
            previousPositions = new Map();
            finalized = false;
            renderQueued = false;
            container.innerHTML = '';
        },

        getItems() {
            return [...items];
        },

        forceRender() {
            previousPositions = new Map();
            render();
        }
    };
}

// ============================================================================
// Export
// ============================================================================

export {
    createSkeleton,
    createProgressBar,
    createIncrementalList
};

export default {
    createSkeleton,
    createProgressBar,
    createIncrementalList
};
