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

  // ---- 时间轴 ----
  // flash 0.36s（CSS keyframes）→ black 0.22s → reveal 0.5s（CSS transition）
  function runTimeline(overlay) {
    applyGrayscale();      // 提前施加灰度（动画窗口内页面被 overlay 遮住，不可见切换）
    overlay.className = 'flash';
    return wait(360)
      .then(function () {
        overlay.className = 'reveal';
        return wait(500);
      })
      .then(function () {
        removeOverlay(overlay);
      });
  }

  function finalizeFlash() {
    applyGrayscale();
    var overlay = document.getElementById('shutdown-flash');
    if (overlay) removeOverlay(overlay);
    markPlayed(window.sessionStorage);
  }

  // ---- 主入口 ----
  function initDeathEffect() {
    var prefersReduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var store;
    try { store = window.sessionStorage; } catch (e) { store = null; }

    // session 已有标记 或 reduced-motion：跳过动画，直接灰度常驻
    if ((store && !shouldPlay(store)) || prefersReduced) {
      applyGrayscale();
      return;
    }

    try {
      var overlay = createOverlay();
      runTimeline(overlay)
        .then(function () {
          markPlayed(store || window.sessionStorage);
        })
        .catch(finalizeFlash);
    } catch (e) {
      finalizeFlash();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeathEffect);
  } else {
    initDeathEffect();
  }
})();
