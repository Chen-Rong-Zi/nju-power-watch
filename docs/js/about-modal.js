(function () {
  'use strict';

  let modalEl = null;
  let initialized = false;

  // Minimal Markdown renderer
  function renderMarkdown(text) {
    const lines = text.split('\n');
    let html = '';
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Inline: bold, italic, link
      line = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');

      // Headings
      if (line.startsWith('## ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<h2>' + line.slice(3) + '</h2>';
      } else if (line.startsWith('### ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<h3>' + line.slice(4) + '</h3>';
      } else if (line.startsWith('# ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<h1>' + line.slice(2) + '</h1>';
      } else if (line.startsWith('- ')) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + line.slice(2) + '</li>';
      } else if (line.startsWith('---')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<hr>';
      } else if (line.trim() === '') {
        if (inList) { html += '</ul>'; inList = false; }
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<p>' + line + '</p>';
      }
    }
    if (inList) html += '</ul>';

    return html;
  }

  // Create modal DOM
  function createModal() {
    const overlay = document.createElement('div');
    overlay.id = 'about-modal-overlay';
    overlay.style.cssText = `
      display: none; position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,0.5);
      align-items: center; justify-content: center;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background: var(--surface, #fff);
      border-radius: var(--radius-lg, 20px);
      max-width: 640px; width: 90%; max-height: 80vh;
      overflow-y: auto; padding: 40px 32px;
      position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      position: sticky; top: 0; float: right;
      background: none; border: none; font-size: 28px;
      cursor: pointer; color: var(--muted, #888);
      line-height: 1; padding: 0; margin: -8px -8px 0 0;
      z-index: 1;
    `;
    closeBtn.onmouseover = () => { closeBtn.style.color = 'var(--fg, #333)'; };
    closeBtn.onmouseout = () => { closeBtn.style.color = 'var(--muted, #888)'; };
    closeBtn.onclick = closeAboutModal;

    const content = document.createElement('div');
    content.id = 'about-modal-content';
    content.style.cssText = 'clear: both;';

    card.appendChild(closeBtn);
    card.appendChild(content);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Click backdrop to close
    overlay.onclick = function (e) {
      if (e.target === overlay) closeAboutModal();
    };

    // ESC key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.style.display !== 'none') {
        closeAboutModal();
      }
    });

    modalEl = overlay;
    initialized = true;
  }

  // Open modal
  window.openAboutModal = function () {
    if (!initialized) createModal();

    const content = document.getElementById('about-modal-content');
    content.innerHTML = '<p style="text-align:center;color:var(--muted,#888);padding:40px 0;">加载中...</p>';
    modalEl.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    fetch('about.md')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (md) {
        content.innerHTML = renderMarkdown(md);
      })
      .catch(function () {
        content.innerHTML = '<p style="text-align:center;color:var(--danger,#e44);padding:40px 0;">加载失败，请刷新重试</p>';
      });
  };

  // Close modal
  window.closeAboutModal = function () {
    if (modalEl) {
      modalEl.style.display = 'none';
      document.body.style.overflow = '';
    }
  };
})();