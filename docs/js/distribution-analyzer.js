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
  },

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
   * @returns {{ type: string, typeName: string, mu: number, sigma: number, pdf: Function, bic: number, params: object }}
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
   * @returns {{ type: string, typeName: string, mu: number, sigma: number, pdf: Function, bic: number, params: object }}
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
   * @returns {{ type: string, typeName: string, k: number, theta: number, pdf: Function, bic: number, params: object }}
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
   * @returns {{ type: string, typeName: string, mu1: number, sigma1: number, mu2: number, sigma2: number, weight: number, pdf: Function, bic: number, params: object }}
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
   * @returns {{ bestFit: object|null, allFits: object[], histogram: object }}
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
