/* 色彩流失动画 + 灰烬氛围 + 常驻顶部横幅（D15）
 * 进入页面时：彩色 → ~1.5s 连续渐变到黑白（色彩流失，无闪白无黑屏），
 * 顶部横幅同步淡入并常驻；随后灰烬飘落。
 * session 内只播一次（sessionStorage 标记）；JS 失败时兜底为静态黑白 + 横幅。
 * 不做 reduced-motion / 后台性能限制：效果对所有人统一显示。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'shutdown_flash_played';
  var DRAIN_MS = 1500;    // 与 shutdown.css 中 html.draining 的 transition 时长一致
  var BANNER_DELAY = 300; // 流失开始后横幅淡入的延迟

  // ---- 可测的纯逻辑 ----
  function shouldPlay(store) {
    return store.getItem(STORAGE_KEY) !== '1';
  }
  function markPlayed(store) {
    if (!store) return;
    try { store.setItem(STORAGE_KEY, '1'); } catch (e) { /* 隐私模式等，忽略 */ }
  }
  // 常驻灰度：html.grayscale（流失终点与静态兜底共用）
  function applyGrayscale() {
    document.documentElement.classList.add('grayscale');
  }

  // ---- 顶部横幅（由 shutdown-banner.js 注入）----
  function showBanner() {
    var banner = document.getElementById('shutdown-banner');
    if (banner) banner.style.opacity = '1';
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ---- 灰烬氛围 ----
  var ASH_COUNT = 180; // 高密度（2026-08-10 依用户反馈 25→60→90→180）
  var ashContainer = null;

  function createAshParticle() {
    var p = document.createElement('div');
    p.className = 'ash-particle';
    var size = 2 + Math.random() * 4;          // 2-6px
    var duration = 8 + Math.random() * 12;     // 8-20s
    var delay = -(Math.random() * 20);         // 负延迟：立即处于动画中途，避免同帧齐下
    var drift = (Math.random() * 60 - 30);     // -30 ~ 30px 水平漂移
    var opacity = 0.3 + Math.random() * 0.2;   // 0.3-0.5
    p.style.left = (Math.random() * 100) + '%';
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.animationDuration = duration + 's';
    p.style.animationDelay = delay + 's';
    p.style.setProperty('--ash-drift', drift.toFixed(1) + 'px');
    p.style.setProperty('--ash-opacity', opacity.toFixed(2));
    return p;
  }

  function startAsh() {
    if (ashContainer || document.getElementById('ash-container')) return;
    ashContainer = document.createElement('div');
    ashContainer.id = 'ash-container';
    ashContainer.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < ASH_COUNT; i++) {
      ashContainer.appendChild(createAshParticle());
    }
    document.body.appendChild(ashContainer);
  }

  // ---- 色彩流失时间轴 ----
  // html.draining 设显式起始态 + transition；异步间隔后再加 html.grayscale 触发渐变。
  // 结束移除 .draining：去掉 transition，保证 reload/再次访问瞬间切换、不重播动画。
  function runDrain() {
    var root = document.documentElement;
    root.classList.add('draining');
    return wait(BANNER_DELAY)
      .then(function () {
        showBanner();                    // 横幅淡入（CSS transition 0.4s）
        root.classList.add('grayscale'); // 触发 filter 1.5s 渐变
        return wait(DRAIN_MS + 100);     // 等动画结束（+余量）
      })
      .then(function () {
        root.classList.remove('draining');
      });
  }

  // ---- 兜底：瞬间黑白 + 横幅 + 灰烬 ----
  function finalizeStatic() {
    applyGrayscale();
    showBanner();
    startAsh();
  }

  // ---- 主入口 ----
  function initDeathEffect() {
    var store;
    try { store = window.sessionStorage; } catch (e) { store = null; }

    // session 已有标记：跳过动画，保留横幅与灰烬
    if (store && !shouldPlay(store)) {
      finalizeStatic();
      return;
    }

    try {
      runDrain()
        .then(function () {
          markPlayed(store);
          startAsh();
        })
        .catch(function () {
          finalizeStatic();
          markPlayed(store);
        });
    } catch (e) {
      finalizeStatic();
      markPlayed(store);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeathEffect);
  } else {
    initDeathEffect();
  }
})();
