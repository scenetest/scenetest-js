/**
 * Scenetest Interactive Demo
 * This script adds the dev panel and mouse event assertions to the docs site
 */

// ============================================================================
// DEV PANEL (simplified standalone version)
// ============================================================================

(function() {
  if (window.__scenetest_panel) return;

  // State
  let assertions = [];
  let groups = [];
  let passCount = 0;
  let failCount = 0;
  let panel = null;
  let listEl = null;
  let filter = 'all';
  let pendingGroup = null;
  let groupTimeout = null;
  const GROUP_THRESHOLD_MS = 50;

  // Utility functions
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' +
           String(d.getMilliseconds()).padStart(3, '0');
  }

  function getGroupStats(items) {
    let p = 0, f = 0;
    for (const item of items) {
      if (item.result) p++; else f++;
    }
    return { passCount: p, failCount: f };
  }

  function filterItems(items) {
    if (filter === 'all') return items;
    if (filter === 'fails') return items.filter(a => !a.result);
    if (filter === 'passes') return items.filter(a => a.result);
    return items;
  }

  // Styles
  const panelStyles = `
#scenetest-panel {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 380px;
  max-height: 420px;
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
  gap: 8px;
  padding: 6px 12px;
  background: #202038;
  border-bottom: 1px solid #3a3a5a;
  flex-wrap: wrap;
  align-items: center;
}
.scenetest-btn-group {
  display: flex;
  border: 1px solid #4a4a6a;
  border-radius: 4px;
  overflow: hidden;
}
.scenetest-btn-group .scenetest-btn {
  border: none;
  border-radius: 0;
  border-right: 1px solid #4a4a6a;
}
.scenetest-btn-group .scenetest-btn:last-child {
  border-right: none;
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
  max-height: 300px;
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
.scenetest-group-stat.zero {
  background: #2a2a3a;
  color: #6a6a8a;
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
.scenetest-content {
  flex: 1;
  min-width: 0;
}
.scenetest-desc {
  word-break: break-word;
}
.scenetest-item.fail .scenetest-desc {
  color: #f87171;
}
.scenetest-context {
  font-size: 10px;
  color: #8a8aaa;
  margin-top: 3px;
}
#scenetest-empty {
  padding: 20px;
  text-align: center;
  color: #6a6a8a;
}
`;

  // Render functions
  function renderPanelItem(a) {
    return `
    <div class="scenetest-item ${a.result ? 'pass' : 'fail'}">
      <span class="scenetest-icon">${a.result ? '\u2713' : '\u2717'}</span>
      <div class="scenetest-content">
        <div class="scenetest-desc">${escapeHtml(a.description)}</div>
        ${a.context ? `<div class="scenetest-context">${escapeHtml(a.context)}</div>` : ''}
      </div>
    </div>
  `;
  }

  function renderPanelGroup(g) {
    const stats = getGroupStats(g.items);
    return `
    <div class="scenetest-group${g.collapsed ? ' collapsed' : ''}" data-group-id="${g.id}">
      <div class="scenetest-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <div class="scenetest-group-summary">
          <span class="scenetest-group-time">${formatTime(g.timestamp)}</span>
          <div class="scenetest-group-stats">
            <span class="scenetest-group-stat pass">\u2713${stats.passCount}</span>
            <span class="scenetest-group-stat ${stats.failCount > 0 ? 'fail' : 'zero'}">\u2717${stats.failCount}</span>
          </div>
        </div>
        <span class="scenetest-group-toggle">\u25BC</span>
      </div>
      <div class="scenetest-group-items">
        ${g.items.map(a => renderPanelItem(a)).join('')}
      </div>
    </div>
  `;
  }

  function updatePanel() {
    if (!panel || !listEl) return;

    const passEl = panel.querySelector('#scenetest-pass');
    const failEl = panel.querySelector('#scenetest-fail');
    if (passEl) passEl.textContent = `\u2713 ${passCount}`;
    if (failEl) failEl.textContent = `\u2717 ${failCount}`;

    const filteredGroups = groups.map(g => ({
      ...g,
      items: filterItems(g.items)
    })).filter(g => g.items.length > 0);

    if (filteredGroups.length === 0) {
      const message = filter === 'fails'
        ? 'No errors! All assertions passed.'
        : 'Hover over elements to see assertions...';
      listEl.innerHTML = `<div id="scenetest-empty">${message}</div>`;
      return;
    }

    listEl.innerHTML = filteredGroups.map(g => renderPanelGroup(g)).reverse().join('');
  }

  function setFilter(newFilter) {
    filter = newFilter;
    panel?.querySelector('#scenetest-filter-all')?.classList.toggle('active', filter === 'all');
    panel?.querySelector('#scenetest-filter-fails')?.classList.toggle('active', filter === 'fails');
    panel?.querySelector('#scenetest-pass')?.classList.toggle('active', filter === 'passes');
    panel?.querySelector('#scenetest-fail')?.classList.toggle('active', filter === 'fails');
    updatePanel();
  }

  function clearAll() {
    assertions = [];
    groups = [];
    passCount = 0;
    failCount = 0;
    pendingGroup = null;
    if (groupTimeout) {
      clearTimeout(groupTimeout);
      groupTimeout = null;
    }
    updatePanel();
  }

  function createPanel() {
    const panelEl = document.createElement('div');
    panelEl.id = 'scenetest-panel';
    panelEl.innerHTML = `
    <style>${panelStyles}</style>
    <div id="scenetest-header">
      <span id="scenetest-title">scenetest</span>
      <span id="scenetest-counts">
        <span class="scenetest-count pass" id="scenetest-pass" title="Click to filter passes">\u2713 0</span>
        <span class="scenetest-count fail" id="scenetest-fail" title="Click to filter failures">\u2717 0</span>
      </span>
    </div>
    <div id="scenetest-actions">
      <div class="scenetest-btn-group">
        <button class="scenetest-btn active" id="scenetest-filter-all">all</button>
        <button class="scenetest-btn" id="scenetest-filter-fails">errors</button>
      </div>
      <button class="scenetest-btn" id="scenetest-clear">clear</button>
    </div>
    <div id="scenetest-list">
      <div id="scenetest-empty">Hover over elements to see assertions...</div>
    </div>
  `;
    document.body.appendChild(panelEl);
    panel = panelEl;
    listEl = panelEl.querySelector('#scenetest-list');

    // Event listeners
    panelEl.querySelector('#scenetest-header')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('scenetest-count')) return;
      panelEl.classList.toggle('collapsed');
    });

    panelEl.querySelector('#scenetest-pass')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setFilter(filter === 'passes' ? 'all' : 'passes');
    });

    panelEl.querySelector('#scenetest-fail')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setFilter(filter === 'fails' ? 'all' : 'fails');
    });

    panelEl.querySelector('#scenetest-filter-all')?.addEventListener('click', () => setFilter('all'));
    panelEl.querySelector('#scenetest-filter-fails')?.addEventListener('click', () => setFilter('fails'));
    panelEl.querySelector('#scenetest-clear')?.addEventListener('click', clearAll);
  }

  function addToGroup(result) {
    const now = Date.now();
    if (pendingGroup && now - pendingGroup.timestamp < GROUP_THRESHOLD_MS) {
      pendingGroup.items.push(result);
    } else {
      const newGroup = {
        id: groups.length,
        timestamp: now,
        items: [result],
        collapsed: true
      };
      pendingGroup = newGroup;
      groups.push(newGroup);
    }

    if (groupTimeout) clearTimeout(groupTimeout);
    groupTimeout = setTimeout(() => {
      pendingGroup = null;
      updatePanel();
    }, GROUP_THRESHOLD_MS);
  }

  // Main report function
  window.__scenetest_panel = true;
  window.__scenetest_report = function(result) {
    assertions.push(result);
    if (result.result) passCount++; else failCount++;
    addToGroup(result);

    if (!panel && document.body) {
      createPanel();
    }
    updatePanel();

    // Console log
    const icon = result.result ? '\u2713' : '\u2717';
    const style = result.result ? 'color: #4ade80' : 'color: #f87171';
    console.log(`%c${icon} [scenetest] ${result.description}`, style);
  };

  // Create panel on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPanel);
  } else {
    createPanel();
  }
})();

// ============================================================================
// PASS FUNCTION
// ============================================================================

function pass(description, condition, context) {
  if (window.__scenetest_report) {
    window.__scenetest_report({
      type: 'pass',
      description: description,
      result: Boolean(condition),
      context: context || null,
      timestamp: Date.now()
    });
  }
}

// ============================================================================
// INTERACTIVE DEMO SETUP
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
  // Helper to add hover assertions to elements
  function addHoverAssertions(selector, options) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el, index) => {
      el.addEventListener('mouseenter', function() {
        if (options.onEnter) {
          options.onEnter(el, index);
        }
      });

      el.addEventListener('mouseleave', function() {
        if (options.onLeave) {
          options.onLeave(el, index);
        }
      });

      if (options.onClick) {
        el.addEventListener('click', function(e) {
          options.onClick(el, index, e);
        });
      }
    });
  }

  // Code blocks - demonstrate assertions about rendered content
  // This mirrors how we think about cache states, loading states, optimistic updates, rollbacks
  const codeBlockRenderCounts = new WeakMap();
  addHoverAssertions('pre code', {
    onEnter: (el) => {
      // Track render count for this element
      const count = (codeBlockRenderCounts.get(el) || 0) + 1;
      codeBlockRenderCounts.set(el, count);

      pass('Code block should be visible', el.offsetHeight > 0);
      // This assertion runs every time the element is observed - like checking
      // that content is present after cache updates, loading states resolve, etc.
      pass('Code block should have text content every time it renders', el.textContent.length > 0,
        `render #${count}`);
      // Flaky assertion demo - fails ~25% of the time
      pass('Syntax highlighting should not throw errors', Math.random() > 0.25);
    }
  });

  // Section headers
  addHoverAssertions('h2', {
    onEnter: (el) => {
      const text = el.textContent.trim();
      pass('Section header should have text content', text.length > 0);
      pass('Header element should be in the document', document.contains(el));
    }
  });

  // Main title
  addHoverAssertions('h1', {
    onEnter: (el) => {
      pass('Page title should be rendered', el.textContent.includes('scenetest'));
    },
    onClick: (el) => {
      pass('Click handler should not throw', true);
      pass('Document should remain interactive after click', document.body !== null);
    }
  });

  // Subtitle
  addHoverAssertions('.subtitle', {
    onEnter: (el) => {
      pass('Subtitle should be visible', el.offsetHeight > 0);
    }
  });

  // External links
  addHoverAssertions('a[href^="http"]', {
    onEnter: (el) => {
      pass('Link href should be valid URL', el.href.startsWith('http'));
      pass('Link should have accessible text', el.textContent.trim().length > 0);
    },
    onClick: (el) => {
      pass('Navigation should not be blocked', true);
    }
  });

  // Screenshot/figure elements
  addHoverAssertions('figure.screenshot', {
    onEnter: (el) => {
      const img = el.querySelector('img');
      pass('Figure should contain an image', img !== null);
      if (img) {
        pass('Image should have alt text', img.alt && img.alt.length > 0);
        pass('Image should have loaded', img.complete);
      }
    },
    onClick: () => {
      // Flaky assertion demo
      pass('Image interaction should not cause errors', Math.random() > 0.2);
    }
  });

  // Content paragraphs
  let interactionCount = 0;
  addHoverAssertions('article > p, section > p', {
    onEnter: (el) => {
      interactionCount++;
      pass('Paragraph should have readable content', el.textContent.length > 20);

      if (interactionCount === 5) {
        pass('Multiple elements should be interactive', interactionCount >= 5);
      }
      if (interactionCount === 10) {
        pass('State should remain consistent across interactions', true);
      }
    }
  });

  // Footer
  addHoverAssertions('footer', {
    onEnter: (el) => {
      pass('Footer should be at end of document', true);
      pass('Page layout should be complete', document.readyState === 'complete');
    }
  });

  // Section dividers
  addHoverAssertions('.divider', {
    onEnter: () => {
      pass('Visual separator should render correctly', true);
    }
  });

  // The panel itself - meta!
  setTimeout(() => {
    const panel = document.getElementById('scenetest-panel');
    if (panel) {
      panel.addEventListener('mouseenter', () => {
        pass('Assertion panel should be interactive', true);
        pass('Panel state should be consistent', panel.querySelector('#scenetest-list') !== null);
      });
    }
  }, 100);

  // Triple-click detection - users shouldn't click so much!
  let clickTimes = [];
  const TRIPLE_CLICK_THRESHOLD = 500; // ms between clicks to count as rapid
  document.addEventListener('click', (e) => {
    const now = Date.now();
    // Keep only recent clicks
    clickTimes = clickTimes.filter(t => now - t < TRIPLE_CLICK_THRESHOLD);
    clickTimes.push(now);

    if (clickTimes.length >= 3) {
      pass('User should not click so much!!!', false,
        `${clickTimes.length} clicks in ${now - clickTimes[0]}ms`);
      // Reset after triggering so it can trigger again
      clickTimes = [];
    }
  });

  // Initial assertions on page load
  setTimeout(() => {
    pass('Document should be fully loaded', document.readyState === 'complete');
    pass('DOM should be ready for interaction', document.body !== null);
    // Flaky demo - occasionally fails
    pass('Async initialization should complete without race conditions', Math.random() > 0.15);
  }, 200);
});
