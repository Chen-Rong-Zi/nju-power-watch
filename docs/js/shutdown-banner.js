/* 功能页常驻关闭横幅：服务已停止提示，常驻不可关闭（D9 / D15 改造）
 * 注入到 .topnav 内部顶部：随现有 sticky 导航一起常驻视口顶部。
 * 初始透明度 0，由 shutdown-flash.js 在色彩流失动画时置 1（淡入后常驻）。
 */
(function () {
  'use strict';

  function injectBanner() {
    const banner = document.createElement('div');
    banner.id = 'shutdown-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = '⚡ 电量耗尽 · 本服务已停止维护 · 数据截至 2026-08-08';
    Object.assign(banner.style, {
      background: '#1a1a1a',
      color: '#e5e5e5',
      textAlign: 'center',
      padding: '8px 16px',
      fontSize: '13px',
      fontWeight: '500',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      letterSpacing: '0.02em',
      opacity: '0',
      transition: 'opacity 0.4s ease-out'
    });

    // 注入到 sticky 导航内部顶部：随导航常驻视口顶部，避免滚动时被 nav 遮挡
    const nav = document.querySelector('nav.topnav');
    if (nav) {
      nav.insertBefore(banner, nav.firstChild);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }

    // 自愈兜底：若 shutdown-flash.js 未激活横幅（如 room-detail.html 无 flash.js、或脚本加载失败），
    // ~2s 后自动显示，保证横幅永不因脚本缺失而不可见。幂等：已显示时置 1 无副作用。
    setTimeout(function () {
      banner.style.opacity = '1';
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner);
  } else {
    injectBanner();
  }
})();
