/**
 * Client-side script injected in dev mode to collect and display inline assertions.
 * This runs in the browser, not Node.js.
 */
export const devPanelScript = `
(function() {
  // Don't inject twice
  if (window.__scenetest_panel) return;
  window.__scenetest_panel = true;

  const assertions = [];
  let panel = null;
  let listEl = null;
  let passCount = 0;
  let failCount = 0;
  let fullscreenWindow = null;

  // Create the floating panel
  function createPanel() {
    panel = document.createElement('div');
    panel.id = 'scenetest-panel';
    panel.innerHTML = \`
      <style>
        #scenetest-panel {
          position: fixed;
          bottom: 16px;
          right: 16px;
          width: 380px;
          max-height: 400px;
          background: #1a1a2e;
          border: 1px solid #4a4a6a;
          border-radius: 8px;
          font-family: ui-monospace, monospace;
          font-size: 12px;
          color: #e0e0e0;
          z-index: 999999;
          box-shadow: 0 4px 24px rgba(0,0,0,0.4);
          display: flex;
          flex-direction: column;
        }
        #scenetest-panel.collapsed {
          max-height: none;
          width: auto;
        }
        #scenetest-panel.collapsed #scenetest-list,
        #scenetest-panel.collapsed #scenetest-actions {
          display: none;
        }
        #scenetest-header {
          padding: 10px 12px;
          background: #252542;
          border-radius: 8px 8px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          user-select: none;
          border-bottom: 1px solid #4a4a6a;
        }
        #scenetest-header:hover {
          background: #2a2a4a;
        }
        #scenetest-title {
          font-weight: 600;
          color: #a0a0ff;
        }
        #scenetest-counts {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .scenetest-count {
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 500;
        }
        .scenetest-count.pass {
          background: #1a3a1a;
          color: #4ade80;
        }
        .scenetest-count.fail {
          background: #3a1a1a;
          color: #f87171;
        }
        #scenetest-actions {
          display: flex;
          gap: 6px;
          padding: 6px 12px;
          background: #202038;
          border-bottom: 1px solid #3a3a5a;
        }
        .scenetest-btn {
          background: none;
          border: 1px solid #4a4a6a;
          color: #a0a0a0;
          padding: 4px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          font-family: inherit;
        }
        .scenetest-btn:hover {
          background: #3a3a5a;
          color: #e0e0e0;
        }
        #scenetest-list {
          overflow-y: auto;
          max-height: 320px;
          padding: 8px 0;
        }
        .scenetest-item {
          padding: 8px 12px;
          border-bottom: 1px solid #2a2a4a;
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }
        .scenetest-item:last-child {
          border-bottom: none;
        }
        .scenetest-item.pass .scenetest-icon {
          color: #4ade80;
        }
        .scenetest-item.fail .scenetest-icon {
          color: #f87171;
        }
        .scenetest-icon {
          flex-shrink: 0;
          width: 16px;
          text-align: center;
        }
        .scenetest-desc {
          flex: 1;
          word-break: break-word;
        }
        .scenetest-item.fail .scenetest-desc {
          color: #f87171;
        }
        .scenetest-time {
          color: #6a6a8a;
          flex-shrink: 0;
        }
        #scenetest-empty {
          padding: 20px;
          text-align: center;
          color: #6a6a8a;
        }
      </style>
      <div id="scenetest-header">
        <span id="scenetest-title">scenetest</span>
        <span id="scenetest-counts">
          <span class="scenetest-count pass" id="scenetest-pass">✓ 0</span>
          <span class="scenetest-count fail" id="scenetest-fail">✗ 0</span>
        </span>
      </div>
      <div id="scenetest-actions">
        <button class="scenetest-btn" id="scenetest-fullscreen">⛶ fullscreen</button>
        <button class="scenetest-btn" id="scenetest-clear">clear</button>
      </div>
      <div id="scenetest-list">
        <div id="scenetest-empty">Click around to see inline assertions...</div>
      </div>
    \`;
    document.body.appendChild(panel);

    listEl = panel.querySelector('#scenetest-list');

    // Toggle collapse
    panel.querySelector('#scenetest-header').addEventListener('click', (e) => {
      panel.classList.toggle('collapsed');
    });

    // Clear button
    panel.querySelector('#scenetest-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      assertions.length = 0;
      passCount = 0;
      failCount = 0;
      updatePanel();
      updateFullscreenWindow();
    });

    // Fullscreen button
    panel.querySelector('#scenetest-fullscreen').addEventListener('click', (e) => {
      e.stopPropagation();
      openFullscreen();
    });
  }

  function openFullscreen() {
    if (fullscreenWindow && !fullscreenWindow.closed) {
      fullscreenWindow.focus();
      return;
    }

    fullscreenWindow = window.open('', 'scenetest-fullscreen', 'width=800,height=600');
    if (!fullscreenWindow) {
      alert('Please allow popups for this site to use fullscreen mode.');
      return;
    }

    fullscreenWindow.document.write(getFullscreenHTML());
    fullscreenWindow.document.close();

    // Set up clear button in fullscreen
    fullscreenWindow.document.getElementById('scenetest-clear-full').addEventListener('click', () => {
      assertions.length = 0;
      passCount = 0;
      failCount = 0;
      updatePanel();
      updateFullscreenWindow();
    });

    // Update immediately
    updateFullscreenWindow();
  }

  function getFullscreenHTML() {
    return \`
      <!DOCTYPE html>
      <html>
      <head>
        <title>scenetest - Inline Assertions</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 0;
            background: #0f0f1a;
            color: #e0e0e0;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
            font-size: 13px;
          }
          #header {
            position: sticky;
            top: 0;
            background: #1a1a2e;
            border-bottom: 1px solid #4a4a6a;
            padding: 16px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 100;
          }
          #title {
            font-size: 18px;
            font-weight: 600;
            color: #a0a0ff;
          }
          #counts {
            display: flex;
            gap: 16px;
            align-items: center;
          }
          .count {
            padding: 4px 12px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 14px;
          }
          .count.pass {
            background: #1a3a1a;
            color: #4ade80;
          }
          .count.fail {
            background: #3a1a1a;
            color: #f87171;
          }
          #clear-btn {
            background: #252542;
            border: 1px solid #4a4a6a;
            color: #a0a0a0;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-family: inherit;
          }
          #clear-btn:hover {
            background: #3a3a5a;
            color: #e0e0e0;
          }
          #list {
            padding: 16px;
          }
          .item {
            padding: 12px 16px;
            margin-bottom: 8px;
            background: #1a1a2e;
            border-radius: 8px;
            display: flex;
            gap: 12px;
            align-items: flex-start;
            border-left: 3px solid transparent;
          }
          .item.pass {
            border-left-color: #4ade80;
          }
          .item.fail {
            border-left-color: #f87171;
            background: #1f1a1a;
          }
          .icon {
            font-size: 16px;
            width: 20px;
            text-align: center;
            flex-shrink: 0;
          }
          .item.pass .icon { color: #4ade80; }
          .item.fail .icon { color: #f87171; }
          .content {
            flex: 1;
          }
          .desc {
            margin-bottom: 4px;
            word-break: break-word;
          }
          .item.fail .desc {
            color: #f87171;
          }
          .meta {
            font-size: 11px;
            color: #6a6a8a;
          }
          .stack {
            margin-top: 8px;
            padding: 8px;
            background: #0f0f1a;
            border-radius: 4px;
            font-size: 11px;
            color: #8a8a9a;
            white-space: pre-wrap;
            word-break: break-all;
          }
          #empty {
            text-align: center;
            padding: 60px 20px;
            color: #6a6a8a;
          }
          #empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
          }
        </style>
      </head>
      <body>
        <div id="header">
          <span id="title">scenetest</span>
          <div id="counts">
            <span class="count pass" id="pass-count">✓ 0</span>
            <span class="count fail" id="fail-count">✗ 0</span>
            <button id="scenetest-clear-full" id="clear-btn">Clear All</button>
          </div>
        </div>
        <div id="list">
          <div id="empty">
            <div id="empty-icon">🎬</div>
            <div>Interact with your app to see inline assertions appear here...</div>
          </div>
        </div>
      </body>
      </html>
    \`;
  }

  function updateFullscreenWindow() {
    if (!fullscreenWindow || fullscreenWindow.closed) return;

    const doc = fullscreenWindow.document;
    doc.getElementById('pass-count').textContent = '✓ ' + passCount;
    doc.getElementById('fail-count').textContent = '✗ ' + failCount;

    const listEl = doc.getElementById('list');

    if (assertions.length === 0) {
      listEl.innerHTML = \`
        <div id="empty">
          <div id="empty-icon">🎬</div>
          <div>Interact with your app to see inline assertions appear here...</div>
        </div>
      \`;
      return;
    }

    listEl.innerHTML = assertions.map((a) => \`
      <div class="item \${a.result ? 'pass' : 'fail'}">
        <span class="icon">\${a.result ? '✓' : '✗'}</span>
        <div class="content">
          <div class="desc">\${escapeHtml(a.description)}</div>
          <div class="meta">\${formatTime(a.timestamp)}</div>
          \${a.stack ? '<div class="stack">' + escapeHtml(a.stack.split('\\n').slice(0, 3).join('\\n')) + '</div>' : ''}
        </div>
      </div>
    \`).reverse().join('');
  }

  function updatePanel() {
    if (!panel) return;

    panel.querySelector('#scenetest-pass').textContent = '✓ ' + passCount;
    panel.querySelector('#scenetest-fail').textContent = '✗ ' + failCount;

    if (assertions.length === 0) {
      listEl.innerHTML = '<div id="scenetest-empty">Click around to see inline assertions...</div>';
      return;
    }

    listEl.innerHTML = assertions.map((a, i) => \`
      <div class="scenetest-item \${a.result ? 'pass' : 'fail'}">
        <span class="scenetest-icon">\${a.result ? '✓' : '✗'}</span>
        <span class="scenetest-desc">\${escapeHtml(a.description)}</span>
        <span class="scenetest-time">\${formatTime(a.timestamp)}</span>
      </div>
    \`).reverse().join('');
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  // Set up the reporter
  window.__scenetest_report = function(result) {
    assertions.push(result);
    if (result.result) {
      passCount++;
    } else {
      failCount++;
    }

    // Create panel on first assertion if not exists
    if (!panel && document.body) {
      createPanel();
    }

    updatePanel();
    updateFullscreenWindow();

    // Also log to console
    const icon = result.result ? '✓' : '✗';
    const style = result.result ? 'color: #4ade80' : 'color: #f87171';
    console.log('%c' + icon + ' [scenetest] ' + result.description, style);
  };

  // Create panel when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPanel);
  } else {
    createPanel();
  }
})();
`;
