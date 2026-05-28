# 耗电量分布图表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive histogram chart to the building view page showing the distribution of daily electricity consumption across all rooms, with automatic distribution fitting (normal, bimodal, log-normal, gamma) and user room percentile marking. Histogram bars support hover tooltips with cumulative statistics and click-to-highlight with on-chart annotations.

**Architecture:** New `distribution-analyzer.js` module handles all statistical computation (histogram binning, distribution fitting, BIC model selection, percentile/cumulative calculation). The building view HTML gets a new chart card section. Chart.js renders the histogram with overlay fit curve, user marker line, and interactive bar hover/click behavior. Stats info displayed as chart annotations + detail cards below.

**Tech Stack:** Chart.js 4.4.0 (already loaded), chartjs-plugin-annotation 3.0.1 (CDN), vanilla JavaScript ES6+.

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Create** `docs/js/distribution-analyzer.js` | Core statistical engine: histogram binning, 4 distribution fits, BIC selection, percentile calculation |
| **Modify** `docs/building-view.html:1030` | Insert distribution chart card HTML after trend-card, add CSS styles, add JS to render chart after ranking loads |

---

### Task 1: Create distribution-analyzer.js — Histogram and Utility Functions

**Files:**
- Create: `docs/js/distribution-analyzer.js`

- [ ] **Step 1: Create the file with histogram binning and utility functions**

```javascript
/**
 * 耗电量分布分析器
 * 提供直方图分箱、分布拟合、BIC模型选择、百分位计算
 */
const DistributionAnalyzer = {

  /**
   * 将耗电量数据分箱为直方图（含累积统计信息）
   * @param {number[]} values - 耗电量数组
   * @param {number} [binCount] - 分箱数（默认使用 Sturges 公式）
   * @returns {{ bins: number[], edges: number[], counts: number[], densities: number[], cumulativeCounts: number[], cumulativePercent: number[] }}
   */
  buildHistogram(values, binCount) {
    if (!values || values.length === 0) {
      return { bins: [], edges: [], counts: [], densities: [], cumulativeCounts: [], cumulativePercent: [] };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    // Sturges 公式: k = ceil(1 + log2(n))
    if (!binCount) {
      binCount = Math.ceil(1 + Math.log2(values.length));
    }
    binCount = Math.max(binCount, 3);

    const range = max - min || 1;
    const binWidth = range / binCount;

    const edges = [];
    const counts = new Array(binCount).fill(0);
    const bins = []; // bin center values

    for (let i = 0; i <= binCount; i++) {
      edges.push(min + i * binWidth);
    }
    for (let i = 0; i < binCount; i++) {
      bins.push((edges[i] + edges[i + 1]) / 2);
    }

    for (const v of values) {
      let idx = Math.floor((v - min) / binWidth);
      if (idx >= binCount) idx = binCount - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    }

    const total = values.length;
    const densities = counts.map(c => c / (total * binWidth));

    // 累积统计：截至每个柱的累积房间数和累积百分比
    const cumulativeCounts = [];
    const cumulativePercent = [];
    let cumSum = 0;
    for (let i = 0; i < counts.length; i++) {
      cumSum += counts[i];
      cumulativeCounts.push(cumSum);
      cumulativePercent.push(Math.round(cumSum / total * 1000) / 10); // 保留1位小数
    }

    return { bins, edges, counts, densities, cumulativeCounts, cumulativePercent };
  },

  /**
   * 计算百分位排名
   * @param {number[]} values - 所有耗电量
   * @param {number} target - 目标值
   * @returns {{ percentile: number, rank: number, total: number }}
   */
  computePercentile(values, target) {
    if (!values || values.length === 0) return { percentile: 0, rank: 0, total: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const rank = sorted.filter(v => v <= target).length;
    const percentile = (rank / sorted.length) * 100;
    return { percentile: Math.round(percentile * 10) / 10, rank, total: sorted.length };
  },

  /**
   * 生成直方图柱顶点坐标（用于拟合曲线绘制）
   * @param {{ bins: number[], densities: number[] }} histogram
   * @returns {{ x: number[], y: number[] }}
   */
  getHistogramTopPoints(histogram) {
    return {
      x: [...histogram.bins],
      y: [...histogram.densities]
    };
  }
};
```

- [ ] **Step 2: Verify the file was created correctly**

Read the file back and confirm all functions are present.

- [ ] **Step 3: Commit**

```bash
git add docs/js/distribution-analyzer.js
git commit -m "feat: add DistributionAnalyzer with histogram and percentile utilities"
```

---

### Task 2: Add Distribution Fitting Functions

**Files:**
- Modify: `docs/js/distribution-analyzer.js`

- [ ] **Step 1: Add distribution fitting methods to DistributionAnalyzer**

Append the following methods inside the `DistributionAnalyzer` object (before the closing `};`):

```javascript

  // ==================== 数学工具函数 ====================

  /** 标准正态 CDF 近似（Abramowitz & Stegun） */
  _normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  },

  /** Gamma 函数近似（Lanczos） */
  _gamma(z) {
    if (z < 0.5) {
      return Math.PI / (Math.sin(Math.PI * z) * this._gamma(1 - z));
    }
    z -= 1;
    const g = 7;
    const c = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
    ];
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  },

  /** 对数 Gamma 函数 */
  _lnGamma(z) {
    return Math.log(Math.abs(this._gamma(z)));
  },

  // ==================== 分布拟合 ====================

  /**
   * 拟合正态分布
   * @param {number[]} values
   * @returns {{ type: string, mu: number, sigma: number, pdf: Function, bic: number }}
   */
  fitNormal(values) {
    const n = values.length;
    const mu = values.reduce((s, v) => s + v, 0) / n;
    const sigma = Math.sqrt(values.reduce((s, v) => s + (v - mu) ** 2, 0) / n) || 0.01;

    const pdf = (x) => {
      const z = (x - mu) / sigma;
      return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
    };

    const logLik = values.reduce((s, v) => s + Math.log(Math.max(pdf(v), 1e-300)), 0);
    const bic = -2 * logLik + 2 * Math.log(n); // 2 params: mu, sigma

    return { type: 'normal', typeName: '正态分布', mu, sigma, pdf, bic, params: { mu: mu.toFixed(3), sigma: sigma.toFixed(3) } };
  },

  /**
   * 拟合对数正态分布
   * @param {number[]} values
   * @returns {{ type: string, mu: number, sigma: number, pdf: Function, bic: number }}
   */
  fitLogNormal(values) {
    // 只使用正值
    const positive = values.filter(v => v > 0);
    if (positive.length < 3) {
      return { type: 'lognormal', typeName: '对数正态分布', mu: 0, sigma: 0.01, pdf: () => 0, bic: Infinity, params: {} };
    }

    const logValues = positive.map(v => Math.log(v));
    const n = logValues.length;
    const mu = logValues.reduce((s, v) => s + v, 0) / n;
    const sigma = Math.sqrt(logValues.reduce((s, v) => s + (v - mu) ** 2, 0) / n) || 0.01;

    const pdf = (x) => {
      if (x <= 0) return 0;
      const z = (Math.log(x) - mu) / sigma;
      return (1 / (x * sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
    };

    const logLik = positive.reduce((s, v) => s + Math.log(Math.max(pdf(v), 1e-300)), 0);
    const bic = -2 * logLik + 2 * Math.log(n);

    return { type: 'lognormal', typeName: '对数正态分布', mu, sigma, pdf, bic, params: { mu: mu.toFixed(3), sigma: sigma.toFixed(3) } };
  },

  /**
   * 拟合 Gamma 分布（矩估计法）
   * @param {number[]} values
   * @returns {{ type: string, k: number, theta: number, pdf: Function, bic: number }}
   */
  fitGamma(values) {
    const positive = values.filter(v => v > 0);
    if (positive.length < 3) {
      return { type: 'gamma', typeName: 'Gamma分布', k: 1, theta: 0.01, pdf: () => 0, bic: Infinity, params: {} };
    }

    const n = positive.length;
    const mean = positive.reduce((s, v) => s + v, 0) / n;
    const logMean = Math.log(mean);
    const meanLog = positive.reduce((s, v) => s + Math.log(v), 0) / n;

    // 矩估计 / 最大似然近似
    const s = logMean - meanLog;
    let k = (3 - s + Math.sqrt((s - 3) ** 2 + 24 * s)) / (12 * s);
    k = Math.max(k, 0.1);
    const theta = mean / k;

    const pdf = (x) => {
      if (x <= 0) return 0;
      return (Math.pow(x, k - 1) * Math.exp(-x / theta)) /
             (Math.pow(theta, k) * this._gamma(k));
    };

    const logLik = positive.reduce((s, v) => {
      const p = pdf(v);
      return s + Math.log(Math.max(p, 1e-300));
    }, 0);
    const bic = -2 * logLik + 2 * Math.log(n);

    return { type: 'gamma', typeName: 'Gamma分布', k, theta, pdf, bic, params: { k: k.toFixed(3), theta: theta.toFixed(3) } };
  },

  /**
   * 拟合双峰分布（两个正态的混合，EM算法）
   * @param {number[]} values
   * @param {number} [maxIter=50] - EM 最大迭代次数
   * @returns {{ type: string, mu1: number, sigma1: number, mu2: number, sigma2: number, weight: number, pdf: Function, bic: number }}
   */
  fitBimodal(values, maxIter = 50) {
    const n = values.length;
    if (n < 6) {
      return { type: 'bimodal', typeName: '双峰分布', mu1: 0, sigma1: 0.01, mu2: 0, sigma2: 0.01, weight: 0.5, pdf: () => 0, bic: Infinity, params: {} };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];

    // 初始化：用四分位数分割
    let mu1 = q1, sigma1 = Math.max((q3 - q1) / 2, 0.01);
    let mu2 = q3, sigma2 = sigma1;
    let w = 0.5; // 混合权重

    for (let iter = 0; iter < maxIter; iter++) {
      // E 步：计算每个点属于两个成分的后验概率
      const resp1 = new Float64Array(n);
      const resp2 = new Float64Array(n);
      let sumR1 = 0, sumR2 = 0;

      for (let i = 0; i < n; i++) {
        const p1 = w * this._normalPDF(values[i], mu1, sigma1);
        const p2 = (1 - w) * this._normalPDF(values[i], mu2, sigma2);
        const total = p1 + p2 || 1e-300;
        resp1[i] = p1 / total;
        resp2[i] = p2 / total;
        sumR1 += resp1[i];
        sumR2 += resp2[i];
      }

      // M 步：更新参数
      let newMu1 = 0, newMu2 = 0;
      for (let i = 0; i < n; i++) {
        newMu1 += resp1[i] * values[i];
        newMu2 += resp2[i] * values[i];
      }
      newMu1 /= sumR1 || 1;
      newMu2 /= sumR2 || 1;

      let newSig1 = 0, newSig2 = 0;
      for (let i = 0; i < n; i++) {
        newSig1 += resp1[i] * (values[i] - newMu1) ** 2;
        newSig2 += resp2[i] * (values[i] - newMu2) ** 2;
      }
      newSig1 = Math.sqrt(newSig1 / (sumR1 || 1)) || 0.01;
      newSig2 = Math.sqrt(newSig2 / (sumR2 || 1)) || 0.01;

      const newW = sumR1 / n;

      // 检查收敛
      if (Math.abs(newMu1 - mu1) < 1e-6 && Math.abs(newMu2 - mu2) < 1e-6) break;

      mu1 = newMu1; sigma1 = newSig1;
      mu2 = newMu2; sigma2 = newSig2;
      w = newW;
    }

    // 确保 mu1 < mu2
    if (mu1 > mu2) {
      [mu1, mu2] = [mu2, mu1];
      [sigma1, sigma2] = [sigma2, sigma1];
      w = 1 - w;
    }

    const pdf = (x) => {
      return w * this._normalPDF(x, mu1, sigma1) + (1 - w) * this._normalPDF(x, mu2, sigma2);
    };

    const logLik = values.reduce((s, v) => s + Math.log(Math.max(pdf(v), 1e-300)), 0);
    const bic = -2 * logLik + 5 * Math.log(n); // 5 params: mu1, sigma1, mu2, sigma2, weight

    return {
      type: 'bimodal', typeName: '双峰分布',
      mu1, sigma1, mu2, sigma2, weight: w, pdf, bic,
      params: {
        mu1: mu1.toFixed(3), sigma1: sigma1.toFixed(3),
        mu2: mu2.toFixed(3), sigma2: sigma2.toFixed(3),
        weight: (w * 100).toFixed(1) + '%'
      }
    };
  },

  /** 正态分布 PDF 辅助函数 */
  _normalPDF(x, mu, sigma) {
    const z = (x - mu) / sigma;
    return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
  },

  // ==================== 模型选择 ====================

  /**
   * 对数据进行所有分布拟合，用BIC选择最优
   * @param {number[]} values - 耗电量数组（过滤掉0和null）
   * @returns {{ bestFit: object, allFits: object[], histogram: object }}
   */
  analyze(values) {
    // 过滤有效数据
    const valid = values.filter(v => v != null && v > 0);
    if (valid.length < 5) {
      return { bestFit: null, allFits: [], histogram: this.buildHistogram(valid) };
    }

    const histogram = this.buildHistogram(valid);

    const allFits = [
      this.fitNormal(valid),
      this.fitLogNormal(valid),
      this.fitGamma(valid),
      this.fitBimodal(valid)
    ];

    // BIC 最低为最优
    allFits.sort((a, b) => a.bic - b.bic);
    const bestFit = allFits[0];

    return { bestFit, allFits, histogram };
  },

  /**
   * 生成拟合曲线数据点，与直方图柱顶对齐
   * 拟合曲线的 y 值 = pdf(bin_center) * binWidth * totalCount，与柱高（counts）一致
   * @param {object} fit - 拟合结果（含 pdf 函数）
   * @param {{ bins: number[], edges: number[], counts: number[] }} histogram
   * @returns {number[]} 与 histogram.counts 对应的拟合值数组
   */
  fitCurveAtBinTops(fit, histogram) {
    if (!fit || !fit.pdf) return [];
    const binWidth = histogram.edges[1] - histogram.edges[0];
    const totalCount = histogram.counts.reduce((s, c) => s + c, 0);
    return histogram.bins.map(binCenter => {
      return fit.pdf(binCenter) * binWidth * totalCount;
    });
  }
};
```

- [ ] **Step 2: Verify all methods are added correctly**

Read the file and confirm all 4 fit methods + analyze method exist.

- [ ] **Step 3: Commit**

```bash
git add docs/js/distribution-analyzer.js
git commit -m "feat: add distribution fitting (normal, log-normal, gamma, bimodal EM) with BIC selection"
```

---

### Task 3: Add Distribution Chart Card HTML and CSS

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: Add distribution chart CSS styles**

Insert the following CSS block inside the `<style>` tag, right before the closing `</style>` (before line 878 `</style>`):

```css
    /* 分布图表 */
    .dist-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      box-shadow: var(--shadow);
      margin-bottom: 24px;
    }
    .dist-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .dist-title {
      font-family: var(--font-display);
      font-size: 18px;
      font-weight: 600;
      margin: 0;
    }
    .dist-subtitle {
      font-size: 13px;
      color: var(--muted);
      margin-top: 4px;
    }
    .dist-fit-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      background: color-mix(in oklch, var(--accent) 12%, transparent);
      color: var(--accent);
    }
    .dist-chart-container {
      position: relative;
      height: 320px;
    }
    .dist-stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .dist-stat {
      background: color-mix(in oklch, var(--bg) 60%, transparent);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 14px;
    }
    .dist-stat-label {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .dist-stat-value {
      font-size: 16px;
      font-weight: 600;
      font-family: var(--font-mono);
    }
    .dist-user-marker {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: var(--radius);
      background: color-mix(in oklch, var(--warning) 10%, transparent);
      border: 1px solid color-mix(in oklch, var(--warning) 30%, transparent);
      margin-top: 16px;
    }
    .dist-user-marker-icon {
      font-size: 20px;
    }
    .dist-user-marker-text {
      font-size: 14px;
    }
    .dist-user-marker-percentile {
      font-weight: 700;
      color: var(--warning);
    }
    .dist-click-info {
      margin-top: 12px;
      padding: 14px 16px;
      border-radius: var(--radius);
      background: color-mix(in oklch, var(--accent) 8%, transparent);
      border: 1px solid color-mix(in oklch, var(--accent) 20%, transparent);
      font-size: 14px;
      line-height: 1.7;
      display: none;
    }
    .dist-click-info-title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .dist-click-info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 6px 16px;
      margin-top: 8px;
    }
    .dist-click-info-item {
      display: flex;
      justify-content: space-between;
    }
    .dist-click-info-item .label {
      color: var(--muted);
    }
    .dist-click-info-item .value {
      font-family: var(--font-mono);
      font-weight: 600;
    }
```

- [ ] **Step 2: Add distribution chart card HTML**

Insert the following HTML right after the trend-card closing `</div>` (after line 1038 `</div>`) and before the `</main>` tag:

```html
    <!-- 耗电分布图表 -->
    <div class="dist-card" id="dist-card" style="display: none;">
      <div class="dist-header">
        <div>
          <h2 class="dist-title" id="dist-title">耗电量分布</h2>
          <div class="dist-subtitle" id="dist-subtitle">各房间耗电量分布情况</div>
        </div>
        <div class="dist-fit-badge" id="dist-fit-badge" style="display: none;">
          <span>📊</span>
          <span id="dist-fit-type"></span>
        </div>
      </div>
      <div class="dist-chart-container">
        <canvas id="dist-chart"></canvas>
      </div>
      <div class="dist-stats-row" id="dist-stats-row" style="display: none;"></div>
      <div class="dist-user-marker" id="dist-user-marker" style="display: none;">
        <span class="dist-user-marker-icon">📍</span>
        <span class="dist-user-marker-text">
          你的宿舍耗电 <strong id="dist-user-consumption"></strong> 度，
          超过 <span class="dist-user-marker-percentile" id="dist-user-percentile"></span> 的房间
        </span>
      </div>
      <div class="dist-click-info" id="dist-click-info"></div>
    </div>
```

- [ ] **Step 3: Add distribution-analyzer.js script tag**

Insert the following script tag after the existing `data-service.js` script tag (after line 1059):

```html
<script src="js/distribution-analyzer.js"></script>
```

- [ ] **Step 4: Verify HTML structure is correct**

Read the modified sections and confirm the HTML is well-formed.

- [ ] **Step 5: Commit**

```bash
git add docs/building-view.html
git commit -m "feat: add distribution chart card HTML, CSS, and script import to building view"
```

---

### Task 4: Add Distribution Chart Rendering Logic

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: Add the distribution chart rendering functions**

Insert the following JavaScript block inside the existing `<script>` tag (right before the closing `</script>` on line 2386), after the `sleep` function:

```javascript

    // ==================== 耗电分布图表 ====================
    let distChart = null;
    let distSelectedBin = -1; // 当前选中的柱索引
    let distHistogram = null; // 保存当前直方图数据供交互使用
    let distValues = null;    // 保存当前耗电量数据

    function renderDistributionChart(rankings) {
      const values = rankings.map(r => r.consumption).filter(v => v > 0);
      if (values.length < 5) {
        document.getElementById('dist-card').style.display = 'none';
        return;
      }

      // 运行分布分析
      const result = DistributionAnalyzer.analyze(values);
      if (!result.bestFit) {
        document.getElementById('dist-card').style.display = 'none';
        return;
      }

      const { bestFit, allFits, histogram } = result;
      distHistogram = histogram;
      distValues = values;
      distSelectedBin = -1;

      // 显示卡片
      document.getElementById('dist-card').style.display = 'block';
      document.getElementById('dist-title').textContent = `${state.building} · 耗电量分布`;
      document.getElementById('dist-subtitle').textContent = `基于 ${values.length} 个房间的${getDateDisplayText(state.date)}数据`;

      // 显示最优拟合类型标签
      document.getElementById('dist-fit-badge').style.display = 'inline-flex';
      document.getElementById('dist-fit-type').textContent = bestFit.typeName;

      // 渲染直方图
      const ctx = document.getElementById('dist-chart').getContext('2d');
      if (distChart) distChart.destroy();

      // Chart.js annotation plugin 用竖线标记用户宿舍
      const userConfig = state.userConfig;
      let userConsumption = null;
      let userAnnotation = {};
      if (userConfig && userConfig.campus === state.campus && userConfig.building === state.building) {
        const userItem = rankings.find(r => r.roomName === userConfig.roomName);
        if (userItem) {
          userConsumption = userItem.consumption;
          userAnnotation = {
            userLine: {
              type: 'line',
              xMin: userConsumption,
              xMax: userConsumption,
              borderColor: 'oklch(55% 0.20 25)',
              borderWidth: 2,
              borderDash: [6, 3],
              label: {
                display: true,
                content: `我的宿舍: ${userConsumption.toFixed(2)}度`,
                position: 'start',
                backgroundColor: 'oklch(55% 0.20 25)',
                color: '#fff',
                font: { size: 11, weight: 'bold' },
                padding: { top: 4, bottom: 4, left: 8, right: 8 },
                borderRadius: 4
              }
            }
          };
        }
      }

      // 均值标注线
      let meanAnnotation = {};
      if (bestFit.mu !== undefined) {
        const meanVal = bestFit.type === 'bimodal'
          ? bestFit.weight * bestFit.mu1 + (1 - bestFit.weight) * bestFit.mu2
          : bestFit.mu;
        meanAnnotation = {
          meanLine: {
            type: 'line',
            xMin: meanVal,
            xMax: meanVal,
            borderColor: 'oklch(55% 0.15 160)',
            borderWidth: 1.5,
            borderDash: [4, 4],
            label: {
              display: true,
              content: `均值: ${meanVal.toFixed(2)}度`,
              position: 'end',
              backgroundColor: 'oklch(55% 0.15 160)',
              color: '#fff',
              font: { size: 10 },
              padding: { top: 3, bottom: 3, left: 6, right: 6 },
              borderRadius: 3
            }
          }
        };
      }

      distChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: histogram.bins.map(b => b.toFixed(1)),
          datasets: [
            {
              label: '房间数',
              data: histogram.counts,
              backgroundColor: histogram.counts.map(() => 'rgba(99, 102, 241, 0.35)'),
              borderColor: histogram.counts.map(() => 'rgba(99, 102, 241, 0.7)'),
              borderWidth: 1,
              borderRadius: 3,
              barPercentage: 0.95,
              categoryPercentage: 1.0,
              order: 2
            },
            {
              label: bestFit.typeName + '拟合',
              type: 'line',
              data: DistributionAnalyzer.fitCurveAtBinTops(bestFit, histogram),
              borderColor: 'oklch(65% 0.18 25)',
              borderWidth: 2.5,
              pointRadius: 3,
              pointBackgroundColor: 'oklch(65% 0.18 25)',
              tension: 0.3,
              fill: false,
              order: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index'
          },
          onClick: (event, elements) => {
            if (elements.length === 0) {
              // 点击空白区域，取消选中
              clearDistBinSelection();
              return;
            }
            const idx = elements[0].index;
            if (distSelectedBin === idx) {
              // 再次点击同一柱，取消选中
              clearDistBinSelection();
            } else {
              selectDistBin(idx, histogram, values, bestFit);
            }
          },
          plugins: {
            legend: {
              labels: {
                color: '#94a3b8',
                font: { size: 12 },
                boxWidth: 12,
                padding: 12
              }
            },
            tooltip: {
              backgroundColor: '#1e293b',
              titleColor: '#f1f5f9',
              bodyColor: '#f1f5f9',
              borderColor: '#334155',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 8,
              callbacks: {
                title: function(items) {
                  const idx = items[0].dataIndex;
                  const low = histogram.edges[idx]?.toFixed(1);
                  const high = histogram.edges[idx + 1]?.toFixed(1);
                  return `${low} - ${high} 度`;
                },
                afterTitle: function(items) {
                  const idx = items[0].dataIndex;
                  const cumPct = histogram.cumulativePercent[idx];
                  return `累计: 前 ${cumPct}% 房间`;
                },
                label: function(context) {
                  if (context.datasetIndex === 0) {
                    const idx = context.dataIndex;
                    const count = histogram.counts[idx];
                    const pct = (count / values.length * 100).toFixed(1);
                    return `${count} 个房间 (${pct}%)`;
                  } else {
                    return bestFit.typeName + '拟合';
                  }
                },
                afterBody: function(items) {
                  const idx = items[0].dataIndex;
                  const cumPct = histogram.cumulativePercent[idx];
                  const prevCumPct = idx > 0 ? histogram.cumulativePercent[idx - 1] : 0;
                  const lines = [];
                  lines.push(`---`);
                  lines.push(`截至此区间: ${histogram.cumulativeCounts[idx]} / ${values.length} 间`);
                  lines.push(`超过前 ${prevCumPct}% 的房间`);
                  if (cumPct < 100) {
                    lines.push(`位于前 ${cumPct}% 以内`);
                  }
                  return lines;
                }
              }
            },
            annotation: {
              annotations: {
                ...meanAnnotation,
                ...userAnnotation
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: '#94a3b8',
                font: { size: 10 },
                maxRotation: 0
              },
              title: {
                display: true,
                text: '日耗电量 (度)',
                color: '#94a3b8',
                font: { size: 12 }
              }
            },
            y: {
              beginAtZero: true,
              grid: {
                color: '#334155',
                drawBorder: false
              },
              ticks: {
                color: '#94a3b8',
                font: { size: 11 },
                callback: function(value) { return Number.isInteger(value) ? value : ''; }
              },
              title: {
                display: true,
                text: '房间数',
                color: '#94a3b8',
                font: { size: 12 }
              }
            }
          }
        }
      });

      // 显示统计卡片
      renderDistStats(bestFit, values);

      // 显示用户标记
      if (userConsumption !== null) {
        const pResult = DistributionAnalyzer.computePercentile(values, userConsumption);
        document.getElementById('dist-user-marker').style.display = 'flex';
        document.getElementById('dist-user-consumption').textContent = userConsumption.toFixed(2);
        document.getElementById('dist-user-percentile').textContent = pResult.percentile.toFixed(1) + '%';
      } else {
        document.getElementById('dist-user-marker').style.display = 'none';
      }

      // 重置点击信息
      document.getElementById('dist-click-info').style.display = 'none';
    }

    /**
     * 选中某个直方图柱，高亮并在图表上显示统计信息
     */
    function selectDistBin(idx, histogram, values, bestFit) {
      distSelectedBin = idx;
      const ds = distChart.data.datasets[0];

      // 高亮选中的柱，其余变暗
      ds.backgroundColor = histogram.counts.map((_, i) =>
        i === idx ? 'rgba(99, 102, 241, 0.8)' : 'rgba(99, 102, 241, 0.15)');
      ds.borderColor = histogram.counts.map((_, i) =>
        i === idx ? 'rgba(99, 102, 241, 1)' : 'rgba(99, 102, 241, 0.3)');

      // 添加选中柱的标注线
      const low = histogram.edges[idx];
      const high = histogram.edges[idx + 1];
      const cumPct = histogram.cumulativePercent[idx];
      const prevCumPct = idx > 0 ? histogram.cumulativePercent[idx - 1] : 0;

      const currentAnnotations = distChart.options.plugins.annotation.annotations;
      distChart.options.plugins.annotation.annotations = {
        ...currentAnnotations,
        selectedBinLeft: {
          type: 'line',
          xMin: low,
          xMax: low,
          borderColor: 'rgba(99, 102, 241, 0.6)',
          borderWidth: 1.5,
          borderDash: [3, 3]
        },
        selectedBinRight: {
          type: 'line',
          xMin: high,
          xMax: high,
          borderColor: 'rgba(99, 102, 241, 0.6)',
          borderWidth: 1.5,
          borderDash: [3, 3]
        }
      };

      distChart.update();

      // 显示下方统计信息面板
      const count = histogram.counts[idx];
      const pct = (count / values.length * 100).toFixed(1);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const binMid = histogram.bins[idx];

      const clickInfo = document.getElementById('dist-click-info');
      clickInfo.style.display = 'block';
      clickInfo.innerHTML = `
        <div class="dist-click-info-title">📊 ${low.toFixed(1)} - ${high.toFixed(1)} 度 区间详情</div>
        <div class="dist-click-info-grid">
          <div class="dist-click-info-item">
            <span class="label">房间数</span>
            <span class="value">${count} 间 (${pct}%)</span>
          </div>
          <div class="dist-click-info-item">
            <span class="label">累计房间</span>
            <span class="value">${histogram.cumulativeCounts[idx]} / ${values.length}</span>
          </div>
          <div class="dist-click-info-item">
            <span class="label">累计百分比</span>
            <span class="value">前 ${cumPct}%</span>
          </div>
          <div class="dist-click-info-item">
            <span class="label">区间中位数</span>
            <span class="value">${binMid.toFixed(2)} 度</span>
          </div>
          <div class="dist-click-info-item">
            <span class="label">偏离均值</span>
            <span class="value">${(binMid - mean >= 0 ? '+' : '')}${(binMid - mean).toFixed(2)} 度</span>
          </div>
          <div class="dist-click-info-item">
            <span class="label">所在百分位</span>
            <span class="value">${prevCumPct}% - ${cumPct}%</span>
          </div>
        </div>
      `;
    }

    /**
     * 取消选中直方图柱
     */
    function clearDistBinSelection() {
      if (!distChart || !distHistogram) return;
      distSelectedBin = -1;
      const ds = distChart.data.datasets[0];

      // 恢复所有柱颜色
      ds.backgroundColor = distHistogram.counts.map(() => 'rgba(99, 102, 241, 0.35)');
      ds.borderColor = distHistogram.counts.map(() => 'rgba(99, 102, 241, 0.7)');

      // 移除选中标注线
      const annotations = { ...distChart.options.plugins.annotation.annotations };
      delete annotations.selectedBinLeft;
      delete annotations.selectedBinRight;
      distChart.options.plugins.annotation.annotations = annotations;

      distChart.update();

      // 隐藏统计信息
      document.getElementById('dist-click-info').style.display = 'none';
    }

    function renderDistStats(bestFit, values) {
      const statsRow = document.getElementById('dist-stats-row');
      statsRow.style.display = 'grid';

      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);

      let statsHtml = `
        <div class="dist-stat">
          <div class="dist-stat-label">均值</div>
          <div class="dist-stat-value">${mean.toFixed(2)} 度</div>
        </div>
        <div class="dist-stat">
          <div class="dist-stat-label">中位数</div>
          <div class="dist-stat-value">${median.toFixed(2)} 度</div>
        </div>
        <div class="dist-stat">
          <div class="dist-stat-label">标准差</div>
          <div class="dist-stat-value">${stdDev.toFixed(2)} 度</div>
        </div>
        <div class="dist-stat">
          <div class="dist-stat-label">拟合类型</div>
          <div class="dist-stat-value">${bestFit.typeName}</div>
        </div>
      `;

      // 根据分布类型展示特有参数
      if (bestFit.type === 'normal' || bestFit.type === 'lognormal') {
        statsHtml += `
          <div class="dist-stat">
            <div class="dist-stat-label">μ (位置)</div>
            <div class="dist-stat-value">${bestFit.params.mu}</div>
          </div>
          <div class="dist-stat">
            <div class="dist-stat-label">σ (尺度)</div>
            <div class="dist-stat-value">${bestFit.params.sigma}</div>
          </div>
        `;
      } else if (bestFit.type === 'gamma') {
        statsHtml += `
          <div class="dist-stat">
            <div class="dist-stat-label">k (形状)</div>
            <div class="dist-stat-value">${bestFit.params.k}</div>
          </div>
          <div class="dist-stat">
            <div class="dist-stat-label">θ (尺度)</div>
            <div class="dist-stat-value">${bestFit.params.theta}</div>
          </div>
        `;
      } else if (bestFit.type === 'bimodal') {
        statsHtml += `
          <div class="dist-stat">
            <div class="dist-stat-label">峰1 μ₁</div>
            <div class="dist-stat-value">${bestFit.params.mu1}</div>
          </div>
          <div class="dist-stat">
            <div class="dist-stat-label">峰2 μ₂</div>
            <div class="dist-stat-value">${bestFit.params.mu2}</div>
          </div>
          <div class="dist-stat">
            <div class="dist-stat-label">混合权重</div>
            <div class="dist-stat-value">${bestFit.params.weight}</div>
          </div>
        `;
      }

      statsRow.innerHTML = statsHtml;
    }

    function hideDistributionChart() {
      document.getElementById('dist-card').style.display = 'none';
    }
```

- [ ] **Step 2: Add chartjs-plugin-annotation script tag**

The chart needs the annotation plugin for drawing vertical lines (mean, user room). Insert this script tag right after the Chart.js CDN script tag (after line 879):

```html
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js"></script>
```

- [ ] **Step 3: Wire up renderDistributionChart into existing data flow**

In the `displayRanking` function (around line 1835), add a call at the end of the function body, right after `renderCurrentPage();` on line 1860:

```javascript
      // 渲染分布图表
      renderDistributionChart(rankings);
```

In the `hideBuildingTrend` function (around line 1274), add a call to also hide the distribution chart:

```javascript
    function hideBuildingTrend() {
      const trendCard = document.getElementById('trend-card');
      trendCard.style.display = 'none';
      hideDistributionChart();
    }
```

In the `onBuildingChange` function (around line 1288), after `hideBuildingTrend()` is called in the else branch, the `hideDistributionChart()` is already covered. No additional change needed.

In the `showNoDataState` function (around line 2357), add at the end:

```javascript
      hideDistributionChart();
```

In the `showEmptyState` function (around line 2346), add at the end:

```javascript
      hideDistributionChart();
```

- [ ] **Step 4: Verify all integration points are correct**

Read the modified sections and confirm:
1. `renderDistributionChart(rankings)` is called in `displayRanking`
2. `hideDistributionChart()` is called in `hideBuildingTrend`, `showNoDataState`, `showEmptyState`
3. Script tags for both `distribution-analyzer.js` and `chartjs-plugin-annotation` are present

- [ ] **Step 5: Commit**

```bash
git add docs/building-view.html
git commit -m "feat: add distribution chart rendering with histogram, fit curve, user marker, and stats"
```

---

### Task 5: Manual Testing and Polish

**Files:**
- Potentially modify: `docs/js/distribution-analyzer.js`, `docs/building-view.html`

- [ ] **Step 1: Start local server and test**

```bash
cd docs && python3 -m http.server 8000
```

Open http://localhost:8000/building-view.html and test:
1. Select a campus and building → distribution chart should appear
2. Switch dates (today/yesterday/custom) → chart updates
3. If user room is configured and in same building → user marker line appears
4. Fit curve passes through histogram bar tops
5. Stats cards show correct parameters for detected distribution
6. Try buildings with very few rooms (< 5) → chart should be hidden

- [ ] **Step 2: Fix any issues found during testing**

Fix any rendering bugs, layout issues, or calculation errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: polish distribution chart rendering and edge cases"
```

---

## Self-Review

**1. Spec coverage:**
- Histogram chart with distribution data: Task 3, 4
- Automatic distribution detection (normal, bimodal, log-normal, gamma): Task 2
- BIC model selection: Task 2 (analyze method)
- Fit curve through bar tops: Task 4 (fitCurveAtBinTops in renderDistributionChart)
- User room marker (vertical line + percentile): Task 4 (userAnnotation)
- Mean line annotation: Task 4 (meanAnnotation)
- Stats info cards below chart: Task 4 (renderDistStats)
- Date switching integration: Task 4 (wired into displayRanking)
- localStorage user config: Task 4 (reads state.userConfig)
- **Hover tooltip with cumulative stats:** Task 4 (tooltip callbacks with cumulativePercent)
- **Click to highlight bar + on-chart annotations:** Task 4 (selectDistBin, clearDistBinSelection)
- **Click info panel below chart:** Task 3 (dist-click-info HTML) + Task 4 (selectDistBin)

**2. Placeholder scan:** No TBD/TODO found. All code is complete.

**3. Type consistency:** 
- `DistributionAnalyzer.analyze()` returns `{ bestFit, allFits, histogram }` — used consistently in Task 4
- `bestFit.pdf` is a Function — used in Task 4's fitCurveAtBinTops call
- `histogram` structure `{ bins, edges, counts, densities, cumulativeCounts, cumulativePercent }` — used consistently across Tasks 1, 4
- `rankings` array with `{ roomName, consumption }` — used in Task 4
- `distSelectedBin` and `distHistogram` module-level vars — used in selectDistBin, clearDistBinSelection, and onClick handler
