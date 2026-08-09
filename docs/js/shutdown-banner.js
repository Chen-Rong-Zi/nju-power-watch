/* 功能页常驻关闭横幅：服务已停止提示，常驻不可关闭（D9）
 * 在 body 顶部（topnav 之前）注入一条横幅；不提供关闭按钮。
 */
(function () {
  'use strict';

  function injectBanner() {
    const banner = document.createElement('div');
    banner.id = 'shutdown-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = '⚠️ 本服务已停止维护 · 历史数据仅供查看 · 数据截至 2026-08-08';
    Object.assign(banner.style, {
      position: 'relative',
      zIndex: '99',
      background: '#1a1a1a',
      color: '#e5e5e5',
      textAlign: 'center',
      padding: '8px 16px',
      fontSize: '13px',
      fontWeight: '500',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      letterSpacing: '0.02em'
    });
    document.body.insertBefore(banner, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner);
  } else {
    injectBanner();
  }
})();
