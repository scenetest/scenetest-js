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
  const groups = []; // Groups of assertions that fired together
  let panel = null;
  let listEl = null;
  let passCount = 0;
  let failCount = 0;
  let fullscreenWindow = null;
  let filter = 'all'; // 'all', 'fails', 'passes'
  let groupingEnabled = true;

  // Grouping: batch assertions that arrive within this window (ms)
  const GROUP_THRESHOLD_MS = 50;
  let pendingGroup = null;
  let groupTimeout = null;

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
          width: 400px;
          max-height: 450px;
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
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .scenetest-count:hover {
          opacity: 0.8;
        }
        .scenetest-count.pass {
          background: #1a3a1a;
          color: #4ade80;
        }
        .scenetest-count.fail {
          background: #3a1a1a;
          color: #f87171;
        }
        .scenetest-count.active {
          outline: 2px solid currentColor;
          outline-offset: 1px;
        }
        #scenetest-actions {
          display: flex;
          gap: 6px;
          padding: 6px 12px;
          background: #202038;
          border-bottom: 1px solid #3a3a5a;
          flex-wrap: wrap;
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
          transition: all 0.15s;
        }
        .scenetest-btn:hover {
          background: #3a3a5a;
          color: #e0e0e0;
        }
        .scenetest-btn.active {
          background: #4a4a6a;
          color: #fff;
        }
        #scenetest-list {
          overflow-y: auto;
          max-height: 340px;
          padding: 8px 0;
        }
        .scenetest-group {
          margin: 4px 8px;
          border: 1px solid #3a3a5a;
          border-radius: 6px;
          overflow: hidden;
        }
        .scenetest-group-header {
          padding: 6px 10px;
          background: #252542;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          font-size: 11px;
        }
        .scenetest-group-header:hover {
          background: #2a2a4a;
        }
        .scenetest-group-summary {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .scenetest-group-time {
          color: #6a6a8a;
        }
        .scenetest-group-stats {
          display: flex;
          gap: 6px;
        }
        .scenetest-group-stat {
          font-size: 10px;
          padding: 1px 5px;
          border-radius: 3px;
        }
        .scenetest-group-stat.pass {
          background: #1a3a1a;
          color: #4ade80;
        }
        .scenetest-group-stat.fail {
          background: #3a1a1a;
          color: #f87171;
        }
        .scenetest-group-items {
          border-top: 1px solid #3a3a5a;
        }
        .scenetest-group.collapsed .scenetest-group-items {
          display: none;
        }
        .scenetest-group-toggle {
          color: #6a6a8a;
          font-size: 10px;
        }
        .scenetest-item {
          padding: 6px 10px;
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
          width: 14px;
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
          font-size: 10px;
        }
        #scenetest-empty {
          padding: 20px;
          text-align: center;
          color: #6a6a8a;
        }
        .scenetest-ungrouped {
          padding: 4px 8px;
        }
      </style>
      <div id="scenetest-header">
        <span id="scenetest-title">scenetest</span>
        <span id="scenetest-counts">
          <span class="scenetest-count pass" id="scenetest-pass" title="Click to filter passes">✓ 0</span>
          <span class="scenetest-count fail" id="scenetest-fail" title="Click to filter failures">✗ 0</span>
        </span>
      </div>
      <div id="scenetest-actions">
        <button class="scenetest-btn" id="scenetest-fullscreen">fullscreen</button>
        <button class="scenetest-btn active" id="scenetest-group-toggle">grouped</button>
        <button class="scenetest-btn" id="scenetest-filter-all">all</button>
        <button class="scenetest-btn" id="scenetest-filter-fails">errors</button>
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
      if (e.target.classList.contains('scenetest-count')) return;
      panel.classList.toggle('collapsed');
    });

    // Filter by clicking counts
    panel.querySelector('#scenetest-pass').addEventListener('click', (e) => {
      e.stopPropagation();
      setFilter(filter === 'passes' ? 'all' : 'passes');
    });
    panel.querySelector('#scenetest-fail').addEventListener('click', (e) => {
      e.stopPropagation();
      setFilter(filter === 'fails' ? 'all' : 'fails');
    });

    // Filter buttons
    panel.querySelector('#scenetest-filter-all').addEventListener('click', (e) => {
      e.stopPropagation();
      setFilter('all');
    });
    panel.querySelector('#scenetest-filter-fails').addEventListener('click', (e) => {
      e.stopPropagation();
      setFilter('fails');
    });

    // Grouping toggle
    panel.querySelector('#scenetest-group-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      groupingEnabled = !groupingEnabled;
      e.target.classList.toggle('active', groupingEnabled);
      e.target.textContent = groupingEnabled ? 'grouped' : 'ungrouped';
      updatePanel();
      updateFullscreenWindow();
    });

    // Clear button
    panel.querySelector('#scenetest-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      assertions.length = 0;
      groups.length = 0;
      passCount = 0;
      failCount = 0;
      pendingGroup = null;
      if (groupTimeout) clearTimeout(groupTimeout);
      updatePanel();
      updateFullscreenWindow();
    });

    // Fullscreen button
    panel.querySelector('#scenetest-fullscreen').addEventListener('click', (e) => {
      e.stopPropagation();
      openFullscreen();
    });
  }

  function setFilter(newFilter) {
    filter = newFilter;
    // Update button states
    panel.querySelector('#scenetest-filter-all').classList.toggle('active', filter === 'all');
    panel.querySelector('#scenetest-filter-fails').classList.toggle('active', filter === 'fails');
    panel.querySelector('#scenetest-pass').classList.toggle('active', filter === 'passes');
    panel.querySelector('#scenetest-fail').classList.toggle('active', filter === 'fails');
    updatePanel();
    updateFullscreenWindow();
  }

  function addToGroup(result) {
    const now = Date.now();

    if (pendingGroup && (now - pendingGroup.timestamp) < GROUP_THRESHOLD_MS) {
      // Add to existing group
      pendingGroup.items.push(result);
    } else {
      // Start a new group
      pendingGroup = {
        id: groups.length,
        timestamp: now,
        items: [result],
        collapsed: false
      };
      groups.push(pendingGroup);
    }

    // Debounce the finalization
    if (groupTimeout) clearTimeout(groupTimeout);
    groupTimeout = setTimeout(() => {
      pendingGroup = null;
      updatePanel();
      updateFullscreenWindow();
    }, GROUP_THRESHOLD_MS);
  }

  // Compute pass/fail counts from items (avoids sync issues)
  function getGroupStats(items) {
    let passCount = 0;
    let failCount = 0;
    for (const item of items) {
      if (item.result) passCount++;
      else failCount++;
    }
    return { passCount, failCount };
  }

  function openFullscreen() {
    if (fullscreenWindow && !fullscreenWindow.closed) {
      fullscreenWindow.focus();
      return;
    }

    fullscreenWindow = window.open('', 'scenetest-fullscreen', 'width=900,height=700');
    if (!fullscreenWindow) {
      alert('Please allow popups for this site to use fullscreen mode.');
      return;
    }

    fullscreenWindow.document.write(getFullscreenHTML());
    fullscreenWindow.document.close();

    // Set up event handlers
    const doc = fullscreenWindow.document;
    doc.getElementById('scenetest-clear-full').addEventListener('click', () => {
      assertions.length = 0;
      groups.length = 0;
      passCount = 0;
      failCount = 0;
      pendingGroup = null;
      if (groupTimeout) clearTimeout(groupTimeout);
      updatePanel();
      updateFullscreenWindow();
    });

    doc.getElementById('filter-all').addEventListener('click', () => {
      setFullscreenFilter('all');
    });
    doc.getElementById('filter-fails').addEventListener('click', () => {
      setFullscreenFilter('fails');
    });
    doc.getElementById('filter-passes').addEventListener('click', () => {
      setFullscreenFilter('passes');
    });

    updateFullscreenWindow();
  }

  function setFullscreenFilter(newFilter) {
    filter = newFilter;
    if (panel) {
      panel.querySelector('#scenetest-filter-all').classList.toggle('active', filter === 'all');
      panel.querySelector('#scenetest-filter-fails').classList.toggle('active', filter === 'fails');
      panel.querySelector('#scenetest-pass').classList.toggle('active', filter === 'passes');
      panel.querySelector('#scenetest-fail').classList.toggle('active', filter === 'fails');
    }
    updatePanel();
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
            flex-wrap: wrap;
            gap: 12px;
          }
          #title {
            font-size: 18px;
            font-weight: 600;
            color: #a0a0ff;
          }
          #controls {
            display: flex;
            gap: 12px;
            align-items: center;
            flex-wrap: wrap;
          }
          #counts {
            display: flex;
            gap: 12px;
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
          .btn {
            background: #252542;
            border: 1px solid #4a4a6a;
            color: #a0a0a0;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-family: inherit;
            transition: all 0.15s;
          }
          .btn:hover {
            background: #3a3a5a;
            color: #e0e0e0;
          }
          .btn.active {
            background: #4a4a6a;
            color: #fff;
          }
          #filters {
            display: flex;
            gap: 8px;
          }
          #list {
            padding: 16px;
          }
          .group {
            margin-bottom: 16px;
            border: 1px solid #3a3a5a;
            border-radius: 8px;
            overflow: hidden;
          }
          .group-header {
            padding: 12px 16px;
            background: #1a1a2e;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
          }
          .group-header:hover {
            background: #252542;
          }
          .group-info {
            display: flex;
            gap: 16px;
            align-items: center;
          }
          .group-time {
            color: #a0a0ff;
            font-weight: 500;
          }
          .group-stats {
            display: flex;
            gap: 8px;
          }
          .group-stat {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
          }
          .group-stat.pass {
            background: #1a3a1a;
            color: #4ade80;
          }
          .group-stat.fail {
            background: #3a1a1a;
            color: #f87171;
          }
          .group-toggle {
            color: #6a6a8a;
            font-size: 12px;
          }
          .group-items {
            border-top: 1px solid #3a3a5a;
          }
          .group.collapsed .group-items {
            display: none;
          }
          .item {
            padding: 10px 16px;
            background: #12121f;
            display: flex;
            gap: 12px;
            align-items: flex-start;
            border-bottom: 1px solid #2a2a4a;
          }
          .item:last-child {
            border-bottom: none;
          }
          .item.fail {
            background: #1a1212;
          }
          .icon {
            font-size: 14px;
            width: 18px;
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
            background: #0a0a12;
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
          <div id="controls">
            <div id="counts">
              <span class="count pass" id="pass-count">✓ 0</span>
              <span class="count fail" id="fail-count">✗ 0</span>
            </div>
            <div id="filters">
              <button class="btn active" id="filter-all">All</button>
              <button class="btn" id="filter-fails">Errors Only</button>
              <button class="btn" id="filter-passes">Passes Only</button>
            </div>
            <button class="btn" id="scenetest-clear-full">Clear All</button>
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

    // Update filter button states
    doc.getElementById('filter-all').classList.toggle('active', filter === 'all');
    doc.getElementById('filter-fails').classList.toggle('active', filter === 'fails');
    doc.getElementById('filter-passes').classList.toggle('active', filter === 'passes');

    const listEl = doc.getElementById('list');
    const filteredGroups = groups.map(g => ({
      ...g,
      items: filterItems(g.items)
    })).filter(g => g.items.length > 0);

    if (filteredGroups.length === 0) {
      listEl.innerHTML = \`
        <div id="empty">
          <div id="empty-icon">\${filter === 'fails' ? '✓' : '🎬'}</div>
          <div>\${filter === 'fails' ? 'No errors! All assertions passed.' : 'Interact with your app to see inline assertions appear here...'}</div>
        </div>
      \`;
      return;
    }

    listEl.innerHTML = filteredGroups.map((g) => {
      const stats = getGroupStats(g.items);
      return \`
      <div class="group" data-group-id="\${g.id}">
        <div class="group-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="group-info">
            <span class="group-time">\${formatTime(g.timestamp)}</span>
            <div class="group-stats">
              \${stats.passCount > 0 ? '<span class="group-stat pass">✓ ' + stats.passCount + '</span>' : ''}
              \${stats.failCount > 0 ? '<span class="group-stat fail">✗ ' + stats.failCount + '</span>' : ''}
            </div>
            <span style="color: #6a6a8a">\${g.items.length} assertion\${g.items.length === 1 ? '' : 's'}</span>
          </div>
          <span class="group-toggle">▼</span>
        </div>
        <div class="group-items">
          \${g.items.map((a) => \`
            <div class="item \${a.result ? 'pass' : 'fail'}">
              <span class="icon">\${a.result ? '✓' : '✗'}</span>
              <div class="content">
                <div class="desc">\${escapeHtml(a.description)}</div>
                \${a.stack ? '<div class="stack">' + escapeHtml(a.stack.split('\\n').slice(0, 3).join('\\n')) + '</div>' : ''}
              </div>
            </div>
          \`).join('')}
        </div>
      </div>
    \`}).reverse().join('');
  }

  function filterItems(items) {
    if (filter === 'all') return items;
    if (filter === 'fails') return items.filter(a => !a.result);
    if (filter === 'passes') return items.filter(a => a.result);
    return items;
  }

  function updatePanel() {
    if (!panel) return;

    panel.querySelector('#scenetest-pass').textContent = '✓ ' + passCount;
    panel.querySelector('#scenetest-fail').textContent = '✗ ' + failCount;

    const filteredGroups = groups.map(g => ({
      ...g,
      items: filterItems(g.items)
    })).filter(g => g.items.length > 0);

    if (filteredGroups.length === 0) {
      listEl.innerHTML = '<div id="scenetest-empty">' +
        (filter === 'fails' ? 'No errors! All assertions passed.' : 'Click around to see inline assertions...') +
        '</div>';
      return;
    }

    if (groupingEnabled) {
      listEl.innerHTML = filteredGroups.map((g) => {
        const stats = getGroupStats(g.items);
        return \`
        <div class="scenetest-group\${g.collapsed ? ' collapsed' : ''}" data-group-id="\${g.id}">
          <div class="scenetest-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <div class="scenetest-group-summary">
              <span class="scenetest-group-time">\${formatTime(g.timestamp)}</span>
              <div class="scenetest-group-stats">
                \${stats.passCount > 0 ? '<span class="scenetest-group-stat pass">✓' + stats.passCount + '</span>' : ''}
                \${stats.failCount > 0 ? '<span class="scenetest-group-stat fail">✗' + stats.failCount + '</span>' : ''}
              </div>
            </div>
            <span class="scenetest-group-toggle">▼</span>
          </div>
          <div class="scenetest-group-items">
            \${g.items.map((a) => \`
              <div class="scenetest-item \${a.result ? 'pass' : 'fail'}">
                <span class="scenetest-icon">\${a.result ? '✓' : '✗'}</span>
                <span class="scenetest-desc">\${escapeHtml(a.description)}</span>
              </div>
            \`).join('')}
          </div>
        </div>
      \`}).reverse().join('');
    } else {
      // Flat list (ungrouped)
      const allFiltered = filterItems(assertions);
      listEl.innerHTML = '<div class="scenetest-ungrouped">' + allFiltered.map((a) => \`
        <div class="scenetest-item \${a.result ? 'pass' : 'fail'}">
          <span class="scenetest-icon">\${a.result ? '✓' : '✗'}</span>
          <span class="scenetest-desc">\${escapeHtml(a.description)}</span>
          <span class="scenetest-time">\${formatTime(a.timestamp)}</span>
        </div>
      \`).reverse().join('') + '</div>';
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  // Set up the reporter - chain with existing function if present (e.g., Playwright's exposeFunction)
  const existingReport = window.__scenetest_report;

  window.__scenetest_report = function(result) {
    // Forward to existing reporter first (e.g., Playwright test collector)
    if (existingReport) {
      try {
        existingReport(result);
      } catch (e) {
        // Ignore errors from existing reporter
      }
    }

    assertions.push(result);
    if (result.result) {
      passCount++;
    } else {
      failCount++;
    }

    // Add to group
    addToGroup(result);

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
