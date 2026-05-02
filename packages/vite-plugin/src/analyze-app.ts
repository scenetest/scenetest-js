/**
 * Self-contained interactive analyze app served at `/__scenetest/`.
 *
 * Two views over the same RunReport shape:
 *   - "Log"       — filterable / groupable list with copy-failure helpers and a
 *                   spec-snippet side panel for reproducing failures manually.
 *   - "Waterfall" — links out to the existing /__scenetest/dashboard page.
 *
 * Data sources (chosen via the run-picker in the header):
 *   - "live"               — subscribes to /__scenetest/events (SSE) and folds
 *                            DashboardEvent stream into a RunReport-shaped
 *                            in-memory model.
 *   - <timestamped run id> — fetched from /__scenetest/runs/<id> (JSON file
 *                            on disk written by the CLI runner).
 *
 * Spec snippet for a failing scene is fetched lazily from /__scenetest/source.
 */
export function generateAnalyzeAppHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scenetest</title>
  <style>${STYLES}</style>
</head>
<body>
  <header>
    <h1><span class="logo">🎬</span> Scenetest</h1>
    <nav class="tabs">
      <button class="tab active" data-view="log">Log</button>
      <a class="tab" href="/__scenetest/dashboard">Waterfall</a>
    </nav>
    <div class="run-picker">
      <label for="run-select">Run</label>
      <select id="run-select"></select>
      <span id="conn" class="conn" title="connection"></span>
    </div>
    <div class="status-bar" id="status-bar"></div>
  </header>

  <main>
    <aside id="tree" class="tree" aria-label="Scene tree"></aside>

    <section class="list-pane">
      <div class="filters">
        <input id="filter-text" type="search" placeholder="Filter by scene, file, or assertion…" />
        <div class="chips" id="status-chips">
          <button class="chip on" data-status="failed">Failed</button>
          <button class="chip on" data-status="completed">Passed</button>
          <button class="chip on" data-status="running">Running</button>
          <button class="chip on" data-status="timeout">Timeout</button>
        </div>
        <select id="group-by" title="Group by">
          <option value="none">No grouping</option>
          <option value="file">Group by file</option>
          <option value="status" selected>Group by status</option>
          <option value="team">Group by team</option>
        </select>
        <button id="copy-failures" class="btn">Copy all failures</button>
        <button id="copy-all" class="btn subtle">Copy all</button>
      </div>
      <div id="list" class="list" aria-live="polite"></div>
    </section>

    <aside id="detail" class="detail" aria-label="Scene detail">
      <div class="empty">Select a scene on the left to see error details, timeline, and the spec snippet for reproducing it manually.</div>
    </aside>
  </main>

  <script>${CLIENT_SCRIPT}</script>
</body>
</html>`
}

const STYLES = `
  :root {
    --bg: #0f1117;
    --bg2: #1a1d27;
    --bg3: #252833;
    --border: #2e3140;
    --text: #e1e4ed;
    --text2: #8b8fa3;
    --text3: #5a5e72;
    --green: #22c55e;
    --red: #ef4444;
    --amber: #f59e0b;
    --blue: #3b82f6;
    --purple: #8b5cf6;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', ui-monospace, monospace;
    background: var(--bg);
    color: var(--text);
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  header h1 { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .logo {
    width: 26px; height: 26px; border-radius: 6px;
    background: rgba(80, 70, 229, 0.15);
    box-shadow: inset 0 1px 4px rgba(80, 70, 229, 0.3);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 13px;
  }
  .tabs { display: flex; gap: 4px; }
  .tab {
    padding: 5px 12px; background: transparent; color: var(--text2);
    border: 1px solid var(--border); border-radius: 4px;
    font: inherit; cursor: pointer; text-decoration: none;
    font-size: 12px;
  }
  .tab:hover { color: var(--text); border-color: var(--text2); }
  .tab.active { background: var(--bg3); color: var(--text); border-color: var(--text2); }
  .run-picker { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text2); }
  .run-picker select {
    background: var(--bg3); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 4px 8px; font: inherit; font-size: 12px; min-width: 200px;
  }
  .conn { width: 8px; height: 8px; border-radius: 50%; background: var(--text3); }
  .conn.connected { background: var(--green); }
  .conn.disconnected { background: var(--red); }
  .conn.idle { background: var(--text3); }
  .status-bar { margin-left: auto; font-size: 12px; color: var(--text2); display: flex; gap: 14px; }
  .status-bar .ok { color: var(--green); }
  .status-bar .fail { color: var(--red); }
  main {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr) minmax(320px, 420px);
    flex: 1; min-height: 0;
  }
  aside.tree, aside.detail {
    background: var(--bg2);
    border-right: 1px solid var(--border);
    overflow: auto;
  }
  aside.detail { border-right: none; border-left: 1px solid var(--border); padding: 14px; }
  .list-pane { display: flex; flex-direction: column; min-width: 0; }
  .filters {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--bg2);
  }
  .filters input[type=search] {
    flex: 1; min-width: 180px;
    background: var(--bg3); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 5px 10px; font: inherit; font-size: 12px;
  }
  .chips { display: flex; gap: 4px; }
  .chip {
    border: 1px solid var(--border); background: transparent;
    color: var(--text3); padding: 4px 10px; border-radius: 12px;
    font: inherit; font-size: 11px; cursor: pointer;
  }
  .chip.on { color: var(--text); border-color: var(--text2); background: var(--bg3); }
  .chip[data-status=failed].on { color: var(--red); border-color: var(--red); }
  .chip[data-status=completed].on { color: var(--green); border-color: var(--green); }
  .chip[data-status=running].on { color: var(--blue); border-color: var(--blue); }
  .chip[data-status=timeout].on { color: var(--amber); border-color: var(--amber); }
  #group-by {
    background: var(--bg3); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 4px 8px; font: inherit; font-size: 12px;
  }
  .btn {
    background: var(--bg3); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer;
  }
  .btn:hover { border-color: var(--blue); color: var(--blue); }
  .btn.subtle { color: var(--text2); }
  .btn.copied { color: var(--green); border-color: var(--green); }
  .list { flex: 1; overflow: auto; }
  .group-header {
    padding: 8px 14px; font-size: 11px; text-transform: uppercase;
    color: var(--text2); background: var(--bg);
    border-bottom: 1px solid var(--border); position: sticky; top: 0;
    letter-spacing: 0.04em;
  }
  .row {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto auto;
    gap: 10px; align-items: center;
    padding: 6px 14px; border-bottom: 1px solid rgba(46, 49, 64, 0.4);
    cursor: pointer;
  }
  .row:hover { background: rgba(255, 255, 255, 0.02); }
  .row.selected { background: rgba(59, 130, 246, 0.08); }
  .row .icon { font-weight: 700; }
  .row .icon.completed { color: var(--green); }
  .row .icon.failed { color: var(--red); }
  .row .icon.timeout { color: var(--amber); }
  .row .icon.running { color: var(--blue); }
  .row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .row .meta { color: var(--text2); font-size: 11px; white-space: nowrap; }
  .row .file { color: var(--text3); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
  .tree { padding: 10px 0; font-size: 12px; }
  .tree-file {
    padding: 4px 14px; color: var(--text2);
    display: flex; justify-content: space-between; gap: 8px;
  }
  .tree-file .fail { color: var(--red); }
  .tree-scene {
    padding: 3px 14px 3px 28px; color: var(--text);
    display: flex; justify-content: space-between; gap: 8px; cursor: pointer;
  }
  .tree-scene:hover { background: rgba(255, 255, 255, 0.03); }
  .tree-scene.failed { color: var(--red); }
  .tree-scene.running { color: var(--blue); }
  .detail h3 { font-size: 13px; margin-bottom: 8px; word-break: break-word; }
  .detail .meta-row {
    color: var(--text2); font-size: 11px; margin-bottom: 12px;
    display: flex; flex-wrap: wrap; gap: 8px;
  }
  .detail .meta-row .pill {
    border: 1px solid var(--border); border-radius: 10px; padding: 1px 8px;
  }
  .detail .err {
    background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.4);
    color: var(--red); padding: 8px 10px; border-radius: 4px;
    font-size: 12px; white-space: pre-wrap; word-break: break-word;
    margin-bottom: 12px;
  }
  .detail h4 { font-size: 11px; text-transform: uppercase; color: var(--text2); margin: 14px 0 6px; letter-spacing: 0.04em; }
  .detail ul { list-style: none; }
  .detail .alist li { font-size: 12px; padding: 2px 0; }
  .detail .alist .pass { color: var(--green); }
  .detail .alist .fail { color: var(--red); }
  .detail .timeline li { font-size: 11px; color: var(--text2); padding: 2px 0; }
  .detail .timeline .err-step { color: var(--red); }
  .detail .actions { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
  .detail .empty { color: var(--text2); font-size: 12px; }
  pre.snippet {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 4px; padding: 8px 0; font-size: 11px;
    overflow: auto; max-height: 240px; line-height: 1.45;
  }
  pre.snippet .ln {
    display: inline-block; width: 38px; text-align: right;
    color: var(--text3); padding-right: 10px; user-select: none;
  }
  pre.snippet .row-line { padding: 0 8px; }
  pre.snippet .row-line.hl { background: rgba(239, 68, 68, 0.12); }
`

// ─── Client script ──────────────────────────────────────────────────
//
// Plain ES2017 — no transpile, no framework. Organized into small modules
// (state store, fetchers, renderers, event handlers) defined in a single
// IIFE to keep the global namespace clean.
const CLIENT_SCRIPT = `(() => {
  // ── State ────────────────────────────────────────────────────────
  /** @type {{ scenes: any[], summary: any, source: 'live' | 'file', runId: string | null, connected: boolean | null }} */
  const state = {
    scenes: [],
    summary: emptySummary(),
    source: 'live',
    runId: null,
    connected: null,
    selected: null,
    sceneActions: new Map(), // sceneName -> array of action events for live mode
  };

  function emptySummary() {
    return {
      scenes: 0, completed: 0, failed: 0,
      assertions: { total: 0, passed: 0, failed: 0 },
      warnings: 0, consoleErrors: 0,
    };
  }

  const filters = {
    text: '',
    statuses: new Set(['failed', 'completed', 'running', 'timeout']),
    groupBy: 'status',
  };

  // ── Bootstrap ────────────────────────────────────────────────────
  init();

  async function init() {
    bindFilterEvents();
    await refreshRunList();
    const initialRun = readRunFromUrl() || 'live';
    await loadRun(initialRun);
  }

  function readRunFromUrl() {
    const params = new URLSearchParams(location.search);
    return params.get('run');
  }

  function setUrlRun(run) {
    const params = new URLSearchParams(location.search);
    params.set('run', run);
    history.replaceState(null, '', '?' + params.toString());
  }

  // ── Run picker / loading ────────────────────────────────────────
  async function refreshRunList() {
    const select = document.getElementById('run-select');
    select.innerHTML = '';
    const liveOpt = document.createElement('option');
    liveOpt.value = 'live';
    liveOpt.textContent = 'Live (current run)';
    select.appendChild(liveOpt);
    try {
      const res = await fetch('/__scenetest/runs');
      if (res.ok) {
        const data = await res.json();
        for (const run of data.runs || []) {
          const opt = document.createElement('option');
          opt.value = run.id;
          opt.textContent = formatRunLabel(run);
          select.appendChild(opt);
        }
      }
    } catch {}
    select.addEventListener('change', () => loadRun(select.value));
  }

  function formatRunLabel(run) {
    const d = new Date(run.mtime);
    return d.toLocaleString() + '  —  ' + run.id;
  }

  async function loadRun(runId) {
    closeLiveStream();
    state.scenes = [];
    state.summary = emptySummary();
    state.sceneActions = new Map();
    state.runId = runId;
    state.selected = null;
    setUrlRun(runId);

    const select = document.getElementById('run-select');
    if (select.value !== runId) select.value = runId;

    if (runId === 'live') {
      state.source = 'live';
      openLiveStream();
    } else {
      state.source = 'file';
      try {
        const res = await fetch('/__scenetest/runs/' + encodeURIComponent(runId));
        if (res.ok) {
          const report = await res.json();
          state.scenes = (report.scenes || []).map(s => ({ ...s, status: s.status || 'failed' }));
          state.summary = report.summary || emptySummary();
        }
      } catch {}
      setConnection('idle');
    }
    renderAll();
  }

  // ── SSE live stream ─────────────────────────────────────────────
  let eventSource = null;

  function openLiveStream() {
    eventSource = new EventSource('/__scenetest/events');
    eventSource.onopen = () => setConnection('connected');
    eventSource.onerror = () => setConnection('disconnected');
    eventSource.onmessage = ev => {
      try { handleLiveEvent(JSON.parse(ev.data)); } catch {}
    };
  }
  function closeLiveStream() {
    if (eventSource) { eventSource.close(); eventSource = null; }
  }
  function setConnection(kind) {
    const el = document.getElementById('conn');
    el.className = 'conn ' + kind;
    el.title = kind;
  }

  function handleLiveEvent(ev) {
    switch (ev.type) {
      case 'run:start':
        state.scenes = [];
        state.summary = emptySummary();
        state.sceneActions = new Map();
        state.summary.scenes = ev.sceneCount || 0;
        renderAll();
        return;

      case 'scene:start': {
        const s = {
          name: ev.name, file: ev.file || '', status: 'running',
          assertions: [], warnings: [], consoleErrors: [], timeline: [],
          actors: {}, team: {}, teamIndex: 0, duration: 0, error: undefined,
          _startedAt: ev.timestamp,
        };
        for (const role of ev.actors || []) s.actors[role] = { key: role };
        upsertScene(s);
        state.sceneActions.set(ev.name, []);
        renderListAndTree();
        return;
      }

      case 'action:start':
      case 'action:end': {
        const list = state.sceneActions.get(currentRunningSceneName()) || [];
        list.push(ev);
        renderDetailIfSelected();
        return;
      }

      case 'assertion': {
        const scene = lastRunningScene();
        if (!scene) return;
        scene.assertions.push({
          type: ev.result ? 'pass' : 'fail',
          description: ev.description,
          result: ev.result,
          timestamp: ev.timestamp,
        });
        state.summary.assertions.total++;
        if (ev.result) state.summary.assertions.passed++;
        else state.summary.assertions.failed++;
        renderListAndTree();
        renderStatusBar();
        renderDetailIfSelected();
        return;
      }

      case 'warning': {
        const scene = lastRunningScene();
        if (!scene) return;
        scene.warnings.push({
          actor: ev.actor, selector: ev.selector,
          message: ev.message, timestamp: ev.timestamp,
        });
        state.summary.warnings++;
        renderDetailIfSelected();
        return;
      }

      case 'scene:end': {
        const scene = state.scenes.find(s => s.name === ev.name && s.status === 'running');
        if (!scene) return;
        scene.status = ev.status;
        scene.duration = ev.duration;
        if (ev.error) scene.error = ev.error;
        if (ev.status === 'completed') state.summary.completed++;
        else state.summary.failed++;
        renderAll();
        return;
      }

      case 'run:end':
        if (ev.summary) state.summary = ev.summary;
        renderAll();
        return;
    }
  }

  function currentRunningSceneName() {
    const s = lastRunningScene();
    return s ? s.name : null;
  }
  function lastRunningScene() {
    for (let i = state.scenes.length - 1; i >= 0; i--) {
      if (state.scenes[i].status === 'running') return state.scenes[i];
    }
    return null;
  }
  function upsertScene(s) {
    const existing = state.scenes.findIndex(x => x.name === s.name && x.status === 'running');
    if (existing >= 0) state.scenes[existing] = s;
    else state.scenes.push(s);
  }

  // ── Filter / group ──────────────────────────────────────────────
  function bindFilterEvents() {
    document.getElementById('filter-text').addEventListener('input', e => {
      filters.text = e.target.value.toLowerCase();
      renderListAndTree();
    });
    document.querySelectorAll('#status-chips .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const s = chip.dataset.status;
        if (filters.statuses.has(s)) { filters.statuses.delete(s); chip.classList.remove('on'); }
        else { filters.statuses.add(s); chip.classList.add('on'); }
        renderListAndTree();
      });
    });
    document.getElementById('group-by').addEventListener('change', e => {
      filters.groupBy = e.target.value;
      renderListAndTree();
    });
    document.getElementById('copy-failures').addEventListener('click', e => {
      copyText(formatFailureReport(state.scenes.filter(s => s.status !== 'completed')), e.currentTarget);
    });
    document.getElementById('copy-all').addEventListener('click', e => {
      copyText(formatFailureReport(state.scenes), e.currentTarget);
    });
  }

  function visibleScenes() {
    return state.scenes.filter(s => {
      if (!filters.statuses.has(s.status)) return false;
      if (!filters.text) return true;
      const haystack = [
        s.name, s.file,
        ...(s.assertions || []).map(a => a.description),
        s.error || '',
      ].join(' ').toLowerCase();
      return haystack.includes(filters.text);
    });
  }

  function groupScenes(scenes) {
    if (filters.groupBy === 'none') return [{ key: '', items: scenes }];
    const map = new Map();
    for (const s of scenes) {
      let key = '';
      if (filters.groupBy === 'file') key = s.file || '(no file)';
      else if (filters.groupBy === 'status') key = s.status;
      else if (filters.groupBy === 'team') key = (s.team && s.team.name) || ('team#' + s.teamIndex);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    // Stable order: failed first when grouped by status
    const keys = [...map.keys()];
    if (filters.groupBy === 'status') {
      const order = { failed: 0, timeout: 1, running: 2, completed: 3 };
      keys.sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99));
    } else {
      keys.sort();
    }
    return keys.map(k => ({ key: k, items: map.get(k) }));
  }

  // ── Rendering ───────────────────────────────────────────────────
  function renderAll() {
    renderStatusBar();
    renderTree();
    renderList();
    renderDetailIfSelected();
  }
  function renderListAndTree() {
    renderTree();
    renderList();
    renderStatusBar();
  }
  function renderDetailIfSelected() {
    if (!state.selected) return;
    const s = state.scenes.find(x => x.name === state.selected);
    if (s) renderDetail(s);
  }

  function renderStatusBar() {
    const sb = document.getElementById('status-bar');
    const a = state.summary.assertions || { passed: 0, total: 0, failed: 0 };
    sb.innerHTML =
      '<span>scenes ' + state.scenes.filter(s => s.status === 'completed').length +
      '/' + (state.summary.scenes || state.scenes.length) + '</span>' +
      '<span class="ok">✓ ' + a.passed + '</span>' +
      '<span class="fail">✗ ' + a.failed + '</span>' +
      (state.summary.warnings ? ('<span>⚡ ' + state.summary.warnings + '</span>') : '');
  }

  function renderTree() {
    const tree = document.getElementById('tree');
    const byFile = new Map();
    for (const s of state.scenes) {
      const f = s.file || '(no file)';
      if (!byFile.has(f)) byFile.set(f, []);
      byFile.get(f).push(s);
    }
    let html = '';
    for (const [file, scenes] of byFile) {
      const fails = scenes.filter(s => s.status !== 'completed' && s.status !== 'running').length;
      html += '<div class="tree-file"><span title="' + esc(file) + '">' + esc(shortFile(file)) +
        '</span>' + (fails > 0 ? '<span class="fail">' + fails + '</span>' : '') + '</div>';
      for (const sc of scenes) {
        const cls = sc.status === 'completed' ? '' : sc.status;
        html += '<div class="tree-scene ' + cls + '" data-scene="' + esc(sc.name) +
          '">' + esc(sc.name) + '</div>';
      }
    }
    tree.innerHTML = html;
    tree.querySelectorAll('.tree-scene').forEach(el => {
      el.addEventListener('click', () => selectScene(el.dataset.scene));
    });
  }

  function renderList() {
    const list = document.getElementById('list');
    const groups = groupScenes(visibleScenes());
    let html = '';
    for (const g of groups) {
      if (filters.groupBy !== 'none') {
        html += '<div class="group-header">' + esc(String(g.key || '')) +
          '  ·  ' + g.items.length + '</div>';
      }
      for (const s of g.items) {
        const failed = s.status !== 'completed' && s.status !== 'running';
        const icon = s.status === 'completed' ? '✓' :
          s.status === 'running' ? '◐' :
          s.status === 'timeout' ? '⏱' : '✗';
        const aTotal = (s.assertions || []).length;
        const aFail = (s.assertions || []).filter(a => !a.result).length;
        const sel = s.name === state.selected ? ' selected' : '';
        html += '<div class="row' + sel + '" data-scene="' + esc(s.name) + '">' +
          '<span class="icon ' + s.status + '">' + icon + '</span>' +
          '<span class="name">' + esc(s.name) + '</span>' +
          '<span class="meta">' + (aFail > 0 ? '<span class="icon failed">✗</span> ' : '') +
            aTotal + ' check' + (aTotal === 1 ? '' : 's') +
            (s.duration ? '  ·  ' + s.duration + 'ms' : '') + '</span>' +
          '<span class="file">' + esc(shortFile(s.file)) + '</span>' +
          '</div>';
        // best-effort highlight of failed-state class
        if (failed) {} // kept for clarity
      }
    }
    if (!html) html = '<div class="group-header">No scenes match the current filters.</div>';
    list.innerHTML = html;
    list.querySelectorAll('.row').forEach(el => {
      el.addEventListener('click', () => selectScene(el.dataset.scene));
    });
  }

  // ── Detail panel ────────────────────────────────────────────────
  function selectScene(name) {
    state.selected = name;
    document.querySelectorAll('.row').forEach(r => {
      r.classList.toggle('selected', r.dataset.scene === name);
    });
    const s = state.scenes.find(x => x.name === name);
    if (s) renderDetail(s);
  }

  async function renderDetail(s) {
    const detail = document.getElementById('detail');
    const failed = s.status !== 'completed' && s.status !== 'running';
    const metaPills = [
      'team ' + ((s.team && s.team.name) || s.teamIndex),
      s.duration ? s.duration + 'ms' : '',
      s.status,
    ].filter(Boolean).map(t => '<span class="pill">' + esc(t) + '</span>').join('');

    const assertions = (s.assertions || []).map(a => {
      const cls = a.result ? 'pass' : 'fail';
      const icon = a.result ? '✓' : '✗';
      return '<li class="' + cls + '">' + icon + ' ' + esc(a.description) + '</li>';
    }).join('') || '<li class="' + (failed ? 'fail' : '') + '">No assertions recorded.</li>';

    const liveActions = state.sceneActions.get(s.name) || [];
    const timeline = (s.timeline && s.timeline.length ? s.timeline : liveActionsToTimeline(liveActions))
      .map(t => {
        const cls = t.error ? 'err-step' : '';
        const target = t.target ? ' ' + t.target : '';
        const dur = t.duration != null ? ' (' + t.duration + 'ms)' : '';
        return '<li class="' + cls + '">' + esc(t.actor) + ': ' + esc(t.action) +
          esc(target) + dur + (t.error ? '  — ' + esc(t.error) : '') + '</li>';
      }).join('') || '<li>(no timeline)</li>';

    const fileLink = s.file
      ? '<a href="/__open-in-editor?file=' + encodeURIComponent(s.file) +
        (s.line ? '&line=' + s.line : '') + '" class="btn subtle">Open in editor</a>'
      : '';

    detail.innerHTML =
      '<div class="actions">' +
        '<button class="btn" data-copy-scene="' + esc(s.name) + '">Copy</button>' +
        fileLink +
      '</div>' +
      '<h3>' + (failed ? '<span class="icon failed">✗</span> ' : '') + esc(s.name) + '</h3>' +
      '<div class="meta-row">' + metaPills +
        (s.file ? '<span class="pill" title="' + esc(s.file) + '">' + esc(shortFile(s.file)) +
          (s.line ? ':' + s.line : '') + '</span>' : '') +
      '</div>' +
      (s.error ? '<div class="err">' + esc(s.error) + '</div>' : '') +
      '<h4>Assertions</h4><ul class="alist">' + assertions + '</ul>' +
      '<h4>Timeline</h4><ul class="timeline">' + timeline + '</ul>' +
      '<h4>Spec snippet</h4>' +
      '<div id="snippet-host"><div class="empty">Loading…</div></div>';

    detail.querySelector('[data-copy-scene]').addEventListener('click', e => {
      copyText(formatScene(s), e.currentTarget);
    });

    if (s.file) await loadSnippet(s);
    else document.getElementById('snippet-host').innerHTML = '<div class="empty">No source file recorded.</div>';
  }

  async function loadSnippet(scene) {
    const host = document.getElementById('snippet-host');
    if (!host) return;
    const url = '/__scenetest/source?file=' + encodeURIComponent(scene.file) +
      '&line=' + (scene.line || 1) + '&context=20';
    try {
      const res = await fetch(url);
      if (!res.ok) {
        host.innerHTML = '<div class="empty">Source not available (' + res.status + ').</div>';
        return;
      }
      const data = await res.json();
      const start = data.start, target = scene.line || start;
      const html = data.lines.map((line, i) => {
        const ln = start + i;
        const hl = ln === target ? ' hl' : '';
        return '<div class="row-line' + hl + '"><span class="ln">' + ln + '</span>' + esc(line) + '</div>';
      }).join('');
      host.innerHTML = '<pre class="snippet">' + html + '</pre>';
    } catch {
      host.innerHTML = '<div class="empty">Could not load source.</div>';
    }
  }

  function liveActionsToTimeline(events) {
    const open = new Map();
    const out = [];
    for (const ev of events) {
      const key = ev.actor + ':' + ev.action;
      if (ev.type === 'action:start') open.set(key, ev);
      else if (ev.type === 'action:end') {
        out.push({
          actor: ev.actor, action: ev.action, target: ev.target,
          timestamp: ev.timestamp, duration: ev.duration, error: ev.error,
        });
        open.delete(key);
      }
    }
    for (const ev of open.values()) {
      out.push({ actor: ev.actor, action: ev.action + ' (in flight)', target: ev.target, timestamp: ev.timestamp });
    }
    return out;
  }

  // ── Copy helpers ────────────────────────────────────────────────
  function formatScene(s) {
    const status = s.status === 'completed' ? 'PASSED' :
      s.status === 'timeout' ? 'TIMEOUT' :
      s.status === 'running' ? 'RUNNING' : 'FAILED';
    const icon = s.status === 'completed' ? '✓' : s.status === 'timeout' ? '⏱' : '✗';
    const lines = [];
    lines.push(icon + ' ' + s.name + ' — ' + status);
    lines.push('  File: ' + s.file + (s.line ? ':' + s.line : ''));
    lines.push('  Team: ' + ((s.team && s.team.name) || ('team#' + s.teamIndex)) +
      (s.duration ? '  ·  ' + s.duration + 'ms' : ''));
    if (s.error) lines.push('  Error: ' + s.error);
    if (s.assertions && s.assertions.length) {
      lines.push('  Assertions:');
      for (const a of s.assertions) {
        lines.push('    ' + (a.result ? '✓' : '✗') + ' ' + a.description);
      }
    }
    const tl = s.timeline && s.timeline.length ? s.timeline : liveActionsToTimeline(state.sceneActions.get(s.name) || []);
    if (tl.length) {
      lines.push('  Timeline:');
      for (const t of tl) {
        lines.push('    ' + t.actor + ': ' + t.action + (t.target ? ' ' + t.target : '') +
          (t.duration != null ? ' (' + t.duration + 'ms)' : '') + (t.error ? ' — ' + t.error : ''));
      }
    }
    return lines.join('\\n');
  }

  function formatFailureReport(scenes) {
    const failures = scenes.filter(s => s.status !== 'completed' && s.status !== 'running');
    if (!failures.length && scenes.length) {
      return scenes.map(formatScene).join('\\n\\n');
    }
    const lines = ['Scenetest — ' + (state.runId || 'live')];
    lines.push(failures.length + ' failing scene(s)');
    lines.push('');
    return lines.join('\\n') + '\\n' + failures.map(formatScene).join('\\n\\n');
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
    });
  }

  // ── Utils ────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function shortFile(f) {
    if (!f) return '';
    const parts = f.replace(/\\\\/g, '/').split('/');
    return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : f;
  }
})();
`
