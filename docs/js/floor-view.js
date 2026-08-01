/**
 * 楼层指示器 UI 组件
 * 渲染左侧楼层指示器、处理多选交互、联动内容刷新
 */

const FloorView = {
  _chartInstance: null,
  _onToggle: null,

  renderIndicator(floorStats, container, onToggle) {
    this._onToggle = onToggle;
    const { floors, sortedFloors } = floorStats;

    const hasMultipleFloors = sortedFloors.filter(f => f !== 'unknown').length > 1;
    if (!hasMultipleFloors) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    container.innerHTML = '';

    // 竖线
    const line = document.createElement('div');
    line.className = 'floor-line';
    container.appendChild(line);

    // 高亮线
    const highlight = document.createElement('div');
    highlight.className = 'floor-line-highlight';
    highlight.id = 'floor-highlight';
    container.appendChild(highlight);

    // 全部楼层节点
    const allNode = this._createNode('all', '全部楼层', true, f => {
      this._toggleAll(f);
    });
    container.appendChild(allNode);

    // 各楼层节点
    sortedFloors.forEach(floor => {
      const stats = floors[floor];
      const label = floor === 'unknown'
        ? `未识别 · ${stats.roomCount}间`
        : `${floor}层 · ${stats.roomCount}间`;
      const node = this._createNode(floor, label, false, f => {
        this._toggleFloor(f);
      });
      node.dataset.floor = String(floor);
      container.appendChild(node);
    });

    this._updateHighlight();
  },

  _createNode(floor, label, isAll, onClick) {
    const node = document.createElement('div');
    node.className = 'floor-node' + (isAll ? ' all' : '') + ' active';
    node.onclick = () => onClick(floor);

    const dot = document.createElement('div');
    dot.className = 'floor-dot';
    node.appendChild(dot);

    const labelEl = document.createElement('span');
    labelEl.className = 'floor-label';
    labelEl.textContent = label;
    node.appendChild(labelEl);

    return node;
  },

  _toggleAll(floor) {
    const nodes = document.querySelectorAll('.floor-node');
    const allActive = Array.from(nodes).every(n => n.classList.contains('active'));

    if (allActive) {
      nodes.forEach(n => n.classList.remove('active'));
      this._onToggle(new Set());
    } else {
      nodes.forEach(n => n.classList.add('active'));
      this._onToggle(null);
    }
    this._updateHighlight();
  },

  _toggleFloor(floor) {
    const node = document.querySelector(`.floor-node[data-floor="${floor}"]`);
    if (!node) return;

    node.classList.toggle('active');

    // 收集当前选中的楼层
    const activeNodes = document.querySelectorAll('.floor-node.active:not(.all)');
    const selected = new Set();
    activeNodes.forEach(n => {
      const val = n.dataset.floor === 'unknown' ? 'unknown' : parseInt(n.dataset.floor);
      selected.add(val);
    });

    // 更新全部楼层节点状态
    const allNode = document.querySelector('.floor-node.all');
    const allFloorNodes = document.querySelectorAll('.floor-node:not(.all)');
    const allSelected = Array.from(allFloorNodes).every(n => n.classList.contains('active'));
    allNode.classList.toggle('active', allSelected);

    this._onToggle(selected.size > 0 ? selected : null);
    this._updateHighlight();
  },

  _updateHighlight() {
    const highlight = document.getElementById('floor-highlight');
    if (!highlight) return;

    const activeNodes = document.querySelectorAll('.floor-node.active');
    if (activeNodes.length === 0) {
      highlight.style.opacity = '0';
      return;
    }

    const first = activeNodes[0];
    const last = activeNodes[activeNodes.length - 1];
    const top = first.offsetTop + 4;
    const bottom = last.offsetTop + last.offsetHeight - 4;
    highlight.style.top = top + 'px';
    highlight.style.height = (bottom - top) + 'px';
    highlight.style.opacity = '1';
  },

  renderFloorChart(floorStats, container, selectedFloors, onChartClick) {
    if (this._chartInstance) {
      this._chartInstance.destroy();
      this._chartInstance = null;
    }

    const { floors, sortedFloors } = floorStats;
    const numericFloors = sortedFloors.filter(f => f !== 'unknown');

    if (numericFloors.length < 2) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    const isAllSelected = selectedFloors === null;
    const labels = numericFloors.map(f => `${f}层`);
    const avgs = numericFloors.map(f => floors[f].avgConsumption);
    const totals = numericFloors.map(f => floors[f].totalConsumption);
    const roomCounts = numericFloors.map(f => floors[f].roomCount);

    const ctx = container.querySelector('canvas').getContext('2d');
    this._chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '均耗 (度/间)',
          data: avgs,
          backgroundColor: numericFloors.map(f => {
            const isActive = isAllSelected || selectedFloors.has(f);
            return isActive ? 'rgba(16, 185, 129, 0.8)' : 'rgba(200, 200, 200, 0.3)';
          }),
          borderColor: numericFloors.map(f => {
            const isActive = isAllSelected || selectedFloors.has(f);
            return isActive ? 'rgba(16, 185, 129, 1)' : 'rgba(200, 200, 200, 0.5)';
          }),
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const i = ctx.dataIndex;
                const f = numericFloors[i];
                return [
                  `均耗: ${avgs[i].toFixed(2)} 度/间`,
                  `总耗: ${totals[i].toFixed(1)} 度`,
                  `房间: ${roomCounts[i]} 间`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { font: { size: 11 } }
          }
        },
        onClick: function(e, elements) {
          if (elements.length > 0) {
            var idx = elements[0].index;
            var floor = numericFloors[idx];
            if (onChartClick) onChartClick(floor);
          }
        }
      }
    });
  },

  updateChart(floorStats, selectedFloors) {
    if (!this._chartInstance) return;
    const { floors, sortedFloors } = floorStats;
    const numericFloors = sortedFloors.filter(f => f !== 'unknown');
    const isAllSelected = selectedFloors === null;

    this._chartInstance.data.datasets[0].backgroundColor = numericFloors.map(f => {
      const isActive = isAllSelected || selectedFloors.has(f);
      return isActive ? 'rgba(16, 185, 129, 0.8)' : 'rgba(200, 200, 200, 0.3)';
    });
    this._chartInstance.data.datasets[0].borderColor = numericFloors.map(f => {
      const isActive = isAllSelected || selectedFloors.has(f);
      return isActive ? 'rgba(16, 185, 129, 1)' : 'rgba(200, 200, 200, 0.5)';
    });
    this._chartInstance.update();
  },

  // ============ FAB + 抽屉 ============

  renderDrawer(floorStats, onToggle) {
    this._drawerOnToggle = onToggle;
    var self = this;

    if (!this._fabEl) {
      this._fabEl = document.createElement('button');
      this._fabEl.className = 'floor-fab';
      this._fabEl.innerHTML = '<span>\u{1F3E2}</span><span class="floor-fab-badge" id="fab-badge"></span>';
      this._fabEl.onclick = function() { self._toggleDrawer(true); };
      document.body.appendChild(this._fabEl);
    }
    this._fabEl.style.display = 'flex';

    if (!this._overlayEl) {
      this._overlayEl = document.createElement('div');
      this._overlayEl.className = 'floor-drawer-overlay';
      this._overlayEl.onclick = function() { self._toggleDrawer(false); };
      document.body.appendChild(this._overlayEl);
    }

    if (!this._drawerEl) {
      this._drawerEl = document.createElement('div');
      this._drawerEl.className = 'floor-drawer-panel';
      this._drawerEl.innerHTML = [
        '<div class="floor-drawer-handle"></div>',
        '<div class="floor-drawer-header">',
        '  <span class="floor-drawer-title">选择楼层</span>',
        '  <button class="floor-drawer-close">✕</button>',
        '</div>',
        '<div class="floor-drawer-list" id="drawer-list"></div>'
      ].join('');
      this._drawerEl.querySelector('.floor-drawer-close').onclick = function() { self._toggleDrawer(false); };
      document.body.appendChild(this._drawerEl);
    }

    this._renderDrawerList(floorStats);
    this.updateFabBadge(null, floorStats);
  },

  _renderDrawerList(floorStats) {
    const { floors, sortedFloors } = floorStats;
    const listEl = document.getElementById('drawer-list');
    listEl.innerHTML = '';

    const self = this;

    function createItem(floor, label, stats) {
      const item = document.createElement('div');
      item.className = 'floor-drawer-item' + (floor === 'all' ? ' all' : '');
      item.dataset.floor = String(floor);
      const count = floor === 'all'
        ? sortedFloors.filter(function(f) { return f !== 'unknown'; }).length
        : stats.roomCount;
      var avg = null;
      if (floor !== 'all') avg = stats.avgConsumption;
      var html = [
        '<div class="floor-drawer-dot active"></div>',
        '<span class="floor-drawer-item-label">' + label + '</span>',
        '<span class="floor-drawer-item-count">' + count + '间</span>'
      ];
      if (avg !== null) {
        html.push('<span class="floor-drawer-item-sub">均耗 ' + avg.toFixed(1) + '</span>');
      }
      item.innerHTML = html.join('');
      item.onclick = function(e) {
        e.stopPropagation();
        if (floor === 'all') {
          self._toggleAllFromDrawer();
        } else {
          var f = floor === 'unknown' ? 'unknown' : parseInt(floor);
          self._toggleFloorFromDrawer(f);
        }
      };
      return item;
    }

    listEl.appendChild(createItem('all', '全部楼层', null));

    for (var i = 0; i < sortedFloors.length; i++) {
      var floor = sortedFloors[i];
      if (floor === 'unknown') continue;
      listEl.appendChild(createItem(floor, floor + '层', floors[floor]));
    }

    if (floors.unknown) {
      listEl.appendChild(createItem('unknown', '未识别', floors.unknown));
    }
  },

  _toggleAllFromDrawer() {
    var allDot = this._drawerEl && this._drawerEl.querySelector('.floor-drawer-item.all .floor-drawer-dot');
    var allActive = allDot && allDot.classList.contains('active');
    if (this._drawerOnToggle) {
      this._drawerOnToggle(allActive ? new Set() : null);
    }
  },

  _toggleFloorFromDrawer(floor) {
    var items = this._drawerEl && this._drawerEl.querySelectorAll('.floor-drawer-item:not(.all)');
    if (!items) return;

    var activeSet = new Set();
    for (var i = 0; i < items.length; i++) {
      var dot = items[i].querySelector('.floor-drawer-dot');
      var f = items[i].dataset.floor;
      if (f === 'unknown') f = 'unknown';
      else f = parseInt(f);
      if (dot && dot.classList.contains('active')) {
        activeSet.add(f);
      }
    }

    if (activeSet.has(floor)) {
      activeSet.delete(floor);
    } else {
      activeSet.add(floor);
    }

    if (this._drawerOnToggle) {
      this._drawerOnToggle(activeSet.size > 0 ? activeSet : null);
    }
  },

  _toggleDrawer(open) {
    this._drawerOpen = open;
    if (this._overlayEl) this._overlayEl.classList.toggle('open', open);
    if (this._drawerEl) this._drawerEl.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  },

  updateDrawer(selectedFloors) {
    if (!this._drawerEl) return;
    var items = this._drawerEl.querySelectorAll('.floor-drawer-item');
    if (!items.length) return;
    var isAll = selectedFloors === null;

    var allDot = this._drawerEl.querySelector('.floor-drawer-item.all .floor-drawer-dot');
    if (allDot) {
      var allSelected = true;
      for (var i = 1; i < items.length; i++) {
        var dot = items[i].querySelector('.floor-drawer-dot');
        if (dot) {
          var floor = items[i].dataset.floor;
          if (floor === 'unknown') floor = 'unknown';
          else floor = parseInt(floor);
          var isActive = isAll || (selectedFloors && selectedFloors.has(floor));
          dot.classList.toggle('active', !!isActive);
          if (!isActive) allSelected = false;
        }
      }
      allDot.classList.toggle('active', allSelected);
    }
  },

  updateFabBadge(selectedFloors, floorStats) {
    var badge = document.getElementById('fab-badge');
    if (!badge) return;
    var totalFloors = 0;
    var floors = floorStats.sortedFloors;
    for (var i = 0; i < floors.length; i++) {
      if (floors[i] !== 'unknown') totalFloors++;
    }
    badge.textContent = selectedFloors === null ? totalFloors : selectedFloors.size;
  },

  hideDrawer() {
    this._toggleDrawer(false);
    if (this._fabEl) this._fabEl.style.display = 'none';
    this._drawerOnToggle = null;
  }
};