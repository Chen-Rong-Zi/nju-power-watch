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

  renderFloorChart(floorStats, container, selectedFloors) {
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
  }
};