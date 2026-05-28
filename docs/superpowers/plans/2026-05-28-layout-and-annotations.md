# 楼栋页面布局调整与分布图表标注 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adjust building view layout by removing user rank card, reordering charts above ranking list, and adding distribution-specific statistical annotations (μ/σ intervals, quartiles, peak markers) to the histogram chart.

**Architecture:** Modify `docs/building-view.html` to reorder DOM elements and remove user-rank-card. Extend `DistributionAnalyzer` in `distribution-analyzer.js` to compute annotation data for each distribution type. Update `renderDistributionChart` to render Chart.js box annotations based on fit type.

**Tech Stack:** Chart.js 4.4.0 with chartjs-plugin-annotation 3.0.1, vanilla JavaScript ES6+.

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Modify** `docs/js/distribution-analyzer.js` | Add `getDistributionAnnotations(fit, histogram)` method to compute annotation data per distribution type |
| **Modify** `docs/building-view.html` | Remove user-rank-card, reorder DOM elements, update renderDistributionChart to use annotations |

---

### Task 1: Remove User Rank Card HTML and CSS

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: Delete user-rank-card HTML block**

Find and delete the entire `<div class="user-rank-card" id="user-rank-card">...</div>` block (approximately lines 1039-1061 in the current worktree version).

The block to delete starts with:
```html
    <!-- 用户位次卡片 -->
    <div class="user-rank-card" id="user-rank-card">
```
And ends with:
```html
      </div>
    </div>
```
(before `<div class="stats-row"`)

- [ ] **Step 2: Delete user-rank-card CSS styles**

Find and delete the CSS block for `.user-rank-card` (approximately lines 164-172):
```css
    .user-rank-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px 24px;
      box-shadow: var(--shadow);
      margin-bottom: 20px;
      display: none;
    }
    .user-rank-card.show { display: block; }
```

Also delete related CSS for `.user-rank-header`, `.user-rank-badge`, `.user-rank-info`, `.user-rank-stats`, `.user-rank-stat`, `.user-rank-stat-value`, `.user-rank-stat-label` (approximately lines following the user-rank-card block until before `.stats-row`).

- [ ] **Step 3: Remove JavaScript references to user-rank-card**

Find and remove all JavaScript code that references `user-rank-card`:
1. Remove `const userRankCard = document.getElementById('user-rank-card');` declarations
2. Remove `userRankCard.classList.remove('show');` calls
3. Remove `userRankCard.classList.add('show');` calls
4. Remove the entire `showUserRankCard(rankings)` function (approximately lines 2124-2167)

Also remove the call to `showUserRankCard(rankings)` in `displayRanking` function (around line 1978):
```javascript
await showUserRankCard(rankings);  // DELETE THIS LINE
```

- [ ] **Step 4: Commit**

```bash
git add docs/building-view.html
git commit -m "refactor: remove user rank card from building view"
```

---

### Task 2: Reorder Components (Stats → Distribution → Trend → Ranking)

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: Move dist-card and trend-card before ranking-card**

Current order in HTML:
```
stats-row → ranking-card → trend-card → dist-card
```

Target order:
```
stats-row → dist-card → trend-card → ranking-card
```

Cut the entire `<div class="dist-card" id="dist-card">...</div>` block and move it to immediately after `</div>` of stats-row, before `<div class="ranking-card">`.

Cut the entire `<div class="chart-card" id="trend-card">...</div>` block and move it to immediately after `dist-card`, before `<div class="ranking-card">`.

- [ ] **Step 2: Verify the new HTML structure**

The structure should now be:
```html
    <!-- 统计摘要 -->
    <div class="stats-row" id="stats-row" style="display: none;">
      ...
    </div>

    <!-- 耗电分布图表 -->
    <div class="dist-card" id="dist-card" style="display: none;">
      ...
    </div>

    <!-- 楼栋耗电趋势 -->
    <div class="chart-card" id="trend-card" style="display: none;">
      ...
    </div>

    <!-- 排行榜 -->
    <div class="ranking-card">
      ...
    </div>
```

- [ ] **Step 3: Commit**

```bash
git add docs/building-view.html
git commit -m "refactor: reorder building view components - charts above ranking list"
```

---

### Task 3: Add Distribution Annotation Generator to DistributionAnalyzer

**Files:**
- Modify: `docs/js/distribution-analyzer.js`

- [ ] **Step 1: Add getDistributionAnnotations method**

Add the following method inside the `DistributionAnalyzer` object, before the closing `};`:

```javascript

  /**
   * 生成分布类型特定的标注数据
   * @param {object} fit - 拟合结果（含 type, mu, sigma 等参数）
   * @param {object} histogram - 直方图数据（含 edges 用于确定范围）
   * @returns {object} Chart.js annotation 配置对象
   */
  getDistributionAnnotations(fit, histogram) {
    if (!fit) return {};

    const xMin = histogram.edges[0];
    const xMax = histogram.edges[histogram.edges.length - 1];

    switch (fit.type) {
      case 'normal':
        return this._normalAnnotations(fit, xMin, xMax);
      case 'lognormal':
        return this._lognormalAnnotations(fit, xMin, xMax);
      case 'gamma':
        return this._gammaAnnotations(fit, xMin, xMax);
      case 'bimodal':
        return this._bimodalAnnotations(fit, xMin, xMax);
      default:
        return {};
    }
  },

  /**
   * 正态分布标注：μ中轴线 + ±1σ/±2σ/±3σ 区间
   */
  _normalAnnotations(fit, xMin, xMax) {
    const { mu, sigma } = fit;
    const annotations = {
      // μ 中轴线
      muLine: {
        type: 'line',
        xMin: mu,
        xMax: mu,
        borderColor: 'oklch(55% 0.15 160)',
        borderWidth: 2,
        label: {
          display: true,
          content: 'μ',
          position: 'start',
          backgroundColor: 'oklch(55% 0.15 160)',
          color: '#fff',
          font: { size: 10, weight: 'bold' },
          padding: { top: 2, bottom: 2, left: 6, right: 6 },
          borderRadius: 3
        }
      }
    };

    // ±3σ 区间 (99.7%) - 最底层
    if (mu - 3 * sigma >= xMin && mu + 3 * sigma <= xMax) {
      annotations.sigma3 = {
        type: 'box',
        xMin: mu - 3 * sigma,
        xMax: mu + 3 * sigma,
        backgroundColor: 'rgba(99, 102, 241, 0.04)',
        borderWidth: 0
      };
    }

    // ±2σ 区间 (95.4%)
    if (mu - 2 * sigma >= xMin && mu + 2 * sigma <= xMax) {
      annotations.sigma2 = {
        type: 'box',
        xMin: mu - 2 * sigma,
        xMax: mu + 2 * sigma,
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
        borderWidth: 0,
        label: {
          display: true,
          content: '±2σ (95.4%)',
          position: 'top',
          color: 'oklch(55% 0.15 160)',
          font: { size: 9 },
          padding: 2
        }
      };
    }

    // ±1σ 区间 (68.3%)
    if (mu - sigma >= xMin && mu + sigma <= xMax) {
      annotations.sigma1 = {
        type: 'box',
        xMin: mu - sigma,
        xMax: mu + sigma,
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        borderWidth: 1,
        borderColor: 'oklch(55% 0.15 160)',
        borderDash: [4, 4],
        label: {
          display: true,
          content: '±1σ (68.3%)',
          position: 'top',
          color: 'oklch(55% 0.15 160)',
          font: { size: 10, weight: 'bold' },
          padding: { top: 4, bottom: 2, left: 6, right: 6 }
        }
      };
    }

    return annotations;
  },

  /**
   * 对数正态分布标注：中位数 + 四分位区间 + 众数
   */
  _lognormalAnnotations(fit, xMin, xMax) {
    const { mu, sigma } = fit;
    // 中位数 = e^μ
    const median = Math.exp(mu);
    // 众数 = e^(μ - σ²)
    const mode = Math.exp(mu - sigma * sigma);
    // Q1 ≈ e^(μ - 0.67σ), Q3 ≈ e^(μ + 0.67σ)
    const q1 = Math.exp(mu - 0.6745 * sigma);
    const q3 = Math.exp(mu + 0.6745 * sigma);

    const annotations = {
      // 中位数线
      medianLine: {
        type: 'line',
        xMin: median,
        xMax: median,
        borderColor: 'oklch(55% 0.15 160)',
        borderWidth: 2,
        label: {
          display: true,
          content: `中位数 ${median.toFixed(1)}`,
          position: 'start',
          backgroundColor: 'oklch(55% 0.15 160)',
          color: '#fff',
          font: { size: 10 },
          padding: { top: 2, bottom: 2, left: 6, right: 6 },
          borderRadius: 3
        }
      },
      // 众数线
      modeLine: {
        type: 'line',
        xMin: mode,
        xMax: mode,
        borderColor: 'oklch(65% 0.18 25)',
        borderWidth: 1.5,
        borderDash: [4, 3],
        label: {
          display: true,
          content: `众数 ${mode.toFixed(1)}`,
          position: 'end',
          backgroundColor: 'oklch(65% 0.18 25)',
          color: '#fff',
          font: { size: 9 },
          padding: { top: 2, bottom: 2, left: 5, right: 5 },
          borderRadius: 2
        }
      }
    };

    // Q1-Q3 四分位区间
    if (q1 >= xMin && q3 <= xMax) {
      annotations.iqr = {
        type: 'box',
        xMin: q1,
        xMax: q3,
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderWidth: 1,
        borderColor: 'oklch(55% 0.15 160)',
        borderDash: [3, 3],
        label: {
          display: true,
          content: 'IQR (Q1-Q3)',
          position: 'top',
          color: 'oklch(55% 0.15 160)',
          font: { size: 9 },
          padding: 2
        }
      };
    }

    return annotations;
  },

  /**
   * Gamma分布标注：均值 + 众数 + 中位数
   */
  _gammaAnnotations(fit, xMin, xMax) {
    const { k, theta } = fit;
    // 均值 = kθ
    const mean = k * theta;
    // 众数 = (k-1)θ (当 k >= 1)
    const mode = k >= 1 ? (k - 1) * theta : 0;
    // 中位数近似：对于 Gamma 分布没有简单解析式，用 kθ 近似
    // 使用 Wilson-Hilferty 近似
    const medianApprox = k * theta * Math.pow(1 - 1 / (9 * k), 3);

    const annotations = {
      // 均值线
      meanLine: {
        type: 'line',
        xMin: mean,
        xMax: mean,
        borderColor: 'oklch(55% 0.15 160)',
        borderWidth: 2,
        borderDash: [6, 3],
        label: {
          display: true,
          content: `均值 ${mean.toFixed(2)}`,
          position: 'start',
          backgroundColor: 'oklch(55% 0.15 160)',
          color: '#fff',
          font: { size: 10 },
          padding: { top: 2, bottom: 2, left: 6, right: 6 },
          borderRadius: 3
        }
      }
    };

    // 众数线 (仅当 k > 1 时有意义)
    if (k > 1 && mode >= xMin && mode <= xMax) {
      annotations.modeLine = {
        type: 'line',
        xMin: mode,
        xMax: mode,
        borderColor: 'oklch(65% 0.18 25)',
        borderWidth: 1.5,
        borderDash: [4, 3],
        label: {
          display: true,
          content: `众数 ${mode.toFixed(2)}`,
          position: 'end',
          backgroundColor: 'oklch(65% 0.18 25)',
          color: '#fff',
          font: { size: 9 },
          padding: { top: 2, bottom: 2, left: 5, right: 5 },
          borderRadius: 2
        }
      };
    }

    // 中位数近似线
    if (medianApprox >= xMin && medianApprox <= xMax && Math.abs(medianApprox - mean) > 0.1) {
      annotations.medianLine = {
        type: 'line',
        xMin: medianApprox,
        xMax: medianApprox,
        borderColor: 'oklch(50% 0.12 250)',
        borderWidth: 1,
        borderDash: [3, 3],
        label: {
          display: true,
          content: '中位数≈',
          position: 'end',
          color: 'oklch(50% 0.12 250)',
          font: { size: 8 },
          padding: 2
        }
      };
    }

    // 右偏态方向标注（浅色区域）
    if (mean < xMax * 0.7) {
      annotations.skewArea = {
        type: 'box',
        xMin: mean,
        xMax: Math.min(mean + 2 * Math.sqrt(k) * theta, xMax),
        backgroundColor: 'rgba(99, 102, 241, 0.03)',
        borderWidth: 0,
        label: {
          display: true,
          content: '右偏→',
          position: { x: 'end', y: 'end' },
          color: 'rgba(100, 100, 120, 0.5)',
          font: { size: 9 },
          padding: 4
        }
      };
    }

    return annotations;
  },

  /**
   * 双峰分布标注：两个峰的位置 + 各自σ区间
   */
  _bimodalAnnotations(fit, xMin, xMax) {
    const { mu1, sigma1, mu2, sigma2, weight } = fit;

    const annotations = {
      // 峰1位置线
      peak1Line: {
        type: 'line',
        xMin: mu1,
        xMax: mu1,
        borderColor: 'oklch(65% 0.18 25)',
        borderWidth: 2,
        label: {
          display: true,
          content: `μ₁=${mu1.toFixed(1)}`,
          position: 'start',
          backgroundColor: 'oklch(65% 0.18 25)',
          color: '#fff',
          font: { size: 10, weight: 'bold' },
          padding: { top: 2, bottom: 2, left: 6, right: 6 },
          borderRadius: 3
        }
      },
      // 峰2位置线
      peak2Line: {
        type: 'line',
        xMin: mu2,
        xMax: mu2,
        borderColor: 'oklch(55% 0.15 160)',
        borderWidth: 2,
        label: {
          display: true,
          content: `μ₂=${mu2.toFixed(1)}`,
          position: 'start',
          backgroundColor: 'oklch(55% 0.15 160)',
          color: '#fff',
          font: { size: 10, weight: 'bold' },
          padding: { top: 2, bottom: 2, left: 6, right: 6 },
          borderRadius: 3
        }
      }
    };

    // 峰1的 ±1σ 区间
    if (mu1 - sigma1 >= xMin && mu1 + sigma1 <= xMax) {
      annotations.peak1Sigma = {
        type: 'box',
        xMin: mu1 - sigma1,
        xMax: mu1 + sigma1,
        backgroundColor: 'rgba(220, 100, 80, 0.08)',
        borderWidth: 1,
        borderColor: 'oklch(65% 0.18 25)',
        borderDash: [3, 3]
      };
    }

    // 峰2的 ±1σ 区间
    if (mu2 - sigma2 >= xMin && mu2 + sigma2 <= xMax) {
      annotations.peak2Sigma = {
        type: 'box',
        xMin: mu2 - sigma2,
        xMax: mu2 + sigma2,
        backgroundColor: 'rgba(80, 100, 220, 0.08)',
        borderWidth: 1,
        borderColor: 'oklch(55% 0.15 160)',
        borderDash: [3, 3]
      };
    }

    return annotations;
  }
};```

- [ ] **Step 2: Commit**

```bash
git add docs/js/distribution-analyzer.js
git commit -m "feat: add distribution-specific annotation generators for statistical intervals"
```

---

### Task 4: Update renderDistributionChart to Use Distribution Annotations

**Files:**
- Modify: `docs/building-view.html`

- [ ] **Step 1: Replace existing meanAnnotation with distribution-specific annotations**

Find the `renderDistributionChart` function. Locate the `meanAnnotation` and `userAnnotation` variable definitions (around lines 2590-2625). Replace the entire annotation setup with:

```javascript
      // 用户宿舍标注线
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

      // 分布类型特定的统计学标注
      const distAnnotations = DistributionAnalyzer.getDistributionAnnotations(bestFit, histogram);
```

- [ ] **Step 2: Update the annotation.plugins.annotation.annotations assignment**

In the Chart.js config, find the `annotation: { annotations: { ...meanAnnotation, ...userAnnotation } }` section. Replace it with:

```javascript
            annotation: {
              annotations: {
                ...distAnnotations,
                ...userAnnotation
              }
            }
```

This merges the distribution-specific annotations (σ intervals, peak markers, etc.) with the user room marker line.

- [ ] **Step 3: Remove the old meanAnnotation code block**

Delete the old `meanAnnotation` variable definition block (approximately lines 2605-2625) that was generating a simple mean line. The distribution-specific annotations now handle this.

- [ ] **Step 4: Commit**

```bash
git add docs/building-view.html
git commit -m "feat: integrate distribution-specific annotations into histogram chart"
```

---

### Task 5: Manual Testing

**Files:**
- Test in browser

- [ ] **Step 1: Start local server and test**

```bash
cd docs && python3 -m http.server 8000
```

Open http://localhost:8000/building-view.html and verify:
1. User rank card is removed
2. Components are in correct order: stats → distribution → trend → ranking
3. Distribution chart shows correct annotations based on fit type:
   - **Normal**: μ line + ±1σ/±2σ/±3σ shaded boxes
   - **Log-normal**: median line + mode line + IQR box
   - **Gamma**: mean line + mode line + median line + right-skew area
   - **Bimodal**: two peak lines + each peak's σ box
4. User room marker still works when user config is set

- [ ] **Step 2: Test different buildings to trigger different fit types**

Buildings with varied consumption patterns may trigger different distribution fits. Check that annotations render correctly for each type.

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -u
git commit -m "fix: polish distribution annotations and layout"
```

---

## Self-Review

**1. Spec coverage:**
- Remove user-rank-card: Task 1
- Reorder components (stats → dist → trend → ranking): Task 2
- Normal distribution annotations (μ, ±1σ/±2σ/±3σ): Task 3 `_normalAnnotations`
- Log-normal annotations (median, mode, IQR): Task 3 `_lognormalAnnotations`
- Gamma annotations (mean, mode, median, skew): Task 3 `_gammaAnnotations`
- Bimodal annotations (μ₁, μ₂, σ intervals): Task 3 `_bimodalAnnotations`
- Integrate annotations into chart: Task 4

**2. Placeholder scan:** No TBD/TODO found. All code is complete.

**3. Type consistency:**
- `getDistributionAnnotations(fit, histogram)` returns object with annotation keys
- Each `_xxxAnnotations` method returns `{ [key]: { type, xMin, xMax, ... } }` format
- Compatible with Chart.js annotation plugin format used in existing code