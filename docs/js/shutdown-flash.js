/* 断电瞬间动画 + 灰烬氛围（D14）
 * 进入页面时播放"断电瞬间"：flash 回光×3 → 纯黑 → 亮起黑白页面；随后常驻灰烬飘落。
 * session 内只播一次（sessionStorage 标记）；reduced-motion / JS 失败时兜底为静态黑白。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'shutdown_flash_played';

  // ---- 可测的纯逻辑 ----
  function shouldPlay(store) {
    return store.getItem(STORAGE_KEY) !== '1';
  }
  function markPlayed(store) {
    try { store.setItem(STORAGE_KEY, '1'); } catch (e) { /* 隐私模式等，忽略 */ }
  }
  // 动画后常驻灰度：html.grayscale
  function applyGrayscale() {
    document.documentElement.classList.add('grayscale');
  }

  // ---- DOM 注入 ----
  function createOverlay() {
    var el = document.createElement('div');
    el.id = 'shutdown-flash';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  }
  function removeOverlay(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ---- 灰烬氛围 ----
  var ASH_COUNT = 25; // 中等密度 20-30
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

    // 后台暂停
    document.addEventListener('visibilitychange', function () {
      if (!ashContainer) return;
      if (document.hidden) {
        ashContainer.classList.add('paused');
      } else {
        ashContainer.classList.remove('paused');
      }
    });
  }

  // ---- 时间轴 ----
  // flash 0.36s → black 0.22s → reveal 0.5s（CSS flash forwards 保持黑色 + JS wait(220) 构成 black 阶段）
  function runTimeline(overlay) {
    applyGrayscale();      // 提前施加灰度（动画窗口内页面被 overlay 遮住，不可见切换）
    overlay.className = 'flash';
    return wait(360)       // flash 回光×3（CSS keyframes，forwards 保持黑色）
      .then(function () {
        return wait(220);  // black 纯黑停留（overlay 保持 .flash，forwards 维持黑屏）
      })
      .then(function () {
        overlay.className = 'reveal';
        return wait(500);  // reveal 淡出
      })
      .then(function () {
        removeOverlay(overlay);
      });
  }

  function finalizeFlash(store) {
    applyGrayscale();
    var overlay = document.getElementById('shutdown-flash');
    if (overlay) removeOverlay(overlay);
    markPlayed(store);
  }

  // ---- 主入口 ----
  function initDeathEffect() {
    var prefersReduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var store;
    try { store = window.sessionStorage; } catch (e) { store = null; }

    // reduced-motion：完全跳过动画与灰烬（尊重系统设置）
    if (prefersReduced) {
      applyGrayscale();
      return;
    }

    // session 已有标记：跳过动画，但保留常驻灰烬
    if (store && !shouldPlay(store)) {
      applyGrayscale();
      startAsh();
      return;
    }

    try {
      var overlay = createOverlay();
      runTimeline(overlay)
        .then(function () {
          markPlayed(store);
          startAsh();
        })
        .catch(function () {
          finalizeFlash(store);
        });
    } catch (e) {
      finalizeFlash(store);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeathEffect);
  } else {
    initDeathEffect();
  }
})();
