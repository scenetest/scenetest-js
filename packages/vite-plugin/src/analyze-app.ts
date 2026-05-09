/**
 * Self-contained Preact app served at `/__scenetest/` (index) and
 * `/__scenetest/runner` (the analyze view). The middleware serves the
 * same HTML at both paths and the client routes on `location.pathname`.
 *
 * Uses Preact + htm via a `<script type="importmap">` that points each
 * bare specifier ("preact", "preact/hooks", "htm") at a middleware route
 * (see `middleware.ts`, VENDOR_MODULES) which serves the matching ESM
 * bundle out of the plugin's own node_modules. No build step, no CDN.
 *
 * Runner view has two tabs over the same RunReport shape:
 *   - "Log"       — filterable / groupable scene list with copy-failures
 *                   and a spec-snippet panel for reproducing manually.
 *   - "Waterfall" — links out to /__scenetest/dashboard (existing page).
 *
 * Data sources (chosen via the run-picker in the header):
 *   - "live"               — subscribes to /__scenetest/events (SSE) and folds
 *                            the DashboardEvent stream into a RunReport-shaped
 *                            in-memory model.
 *   - <timestamped run id> — fetched from /__scenetest/runs/<id> (a JSON
 *                            file written by the CLI runner).
 *
 * Spec snippet for a selected scene is fetched lazily from /__scenetest/source.
 */
export function generateAnalyzeAppHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scenetest</title>
  <style>${STYLES}</style>
  <script type="importmap">
  {
    "imports": {
      "preact": "/__scenetest/vendor/preact.js",
      "preact/hooks": "/__scenetest/vendor/preact-hooks.js",
      "htm": "/__scenetest/vendor/htm.js"
    }
  }
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module">${CLIENT_SCRIPT}</script>
</body>
</html>`
}

// ─── Styles ─────────────────────────────────────────────────────────

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
  html, body, #root { height: 100%; }
  body {
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', ui-monospace, monospace;
    background: var(--bg);
    color: var(--text);
  }
  .app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  header {
    display: flex; align-items: center; gap: 16px;
    padding: 10px 16px; background: var(--bg2);
    border-bottom: 1px solid var(--border); flex-shrink: 0;
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
    font: inherit; cursor: pointer; text-decoration: none; font-size: 12px;
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
  select.group-by {
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
    display: grid; grid-template-columns: 22px minmax(0, 1fr) auto auto;
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
  .row .file {
    color: var(--text3); font-size: 11px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; max-width: 240px;
  }

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
  .tree-scene.failed, .tree-scene.timeout { color: var(--red); }
  .tree-scene.running { color: var(--blue); }
  .tree-scene.selected { background: rgba(59, 130, 246, 0.08); }

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
  .detail h4 {
    font-size: 11px; text-transform: uppercase; color: var(--text2);
    margin: 14px 0 6px; letter-spacing: 0.04em;
  }
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
  pre.snippet .row-line { padding: 0 8px; white-space: pre; }
  pre.snippet .row-line.hl { background: rgba(239, 68, 68, 0.12); }

  .index { padding: 48px 32px; max-width: 720px; margin: 0 auto; }
  .index h1 {
    font-size: 22px; font-weight: 600;
    display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
  }
  .index .lede { color: var(--text2); font-size: 13px; margin-bottom: 32px; }
  .index .cards { display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
  .index .card {
    display: block; padding: 20px; border: 1px solid var(--border);
    border-radius: 8px; background: var(--bg2); text-decoration: none;
    color: var(--text); transition: border-color 0.15s, background 0.15s;
  }
  .index .card:hover { border-color: var(--text2); background: var(--bg3); }
  .index .card .name { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
  .index .card .desc { font-size: 12px; color: var(--text2); line-height: 1.5; }
`

// ─── Client (Preact + htm) ──────────────────────────────────────────
//
// Imports resolve via the importmap above. The whole app fits in a single
// module — store + components — but is broken into clearly scoped pieces.

const CLIENT_SCRIPT = `
import { h, render } from 'preact'
import { useState, useEffect, useMemo, useCallback, useRef } from 'preact/hooks'
import htm from 'htm'

const html = htm.bind(h)

// ── Helpers ───────────────────────────────────────────────────────
const STATUSES = ['failed', 'timeout', 'running', 'completed']

function emptySummary() {
  return {
    scenes: 0, completed: 0, failed: 0,
    assertions: { total: 0, passed: 0, failed: 0 },
    warnings: 0, consoleErrors: 0,
  }
}

function shortFile(f) {
  if (!f) return ''
  const parts = f.replace(/\\\\/g, '/').split('/')
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : f
}

function statusIcon(s) {
  return s === 'completed' ? '✓' : s === 'running' ? '◐' : s === 'timeout' ? '⏱' : '✗'
}

// ── Live SSE store ────────────────────────────────────────────────
//
// Folds DashboardEvent stream into a RunReport-shaped value. Mutations
// happen through dispatch so React re-renders are predictable. Each
// dispatch returns a *new* state object — Preact diffs from there.

function applyEvent(state, ev) {
  switch (ev.type) {
    case 'run:start':
      return {
        ...state,
        scenes: [],
        sceneActions: new Map(),
        summary: { ...emptySummary(), scenes: ev.sceneCount || 0 },
      }
    case 'scene:start': {
      const scene = {
        name: ev.name, file: ev.file || '',
        line: ev.line, status: 'running',
        assertions: [], warnings: [], consoleErrors: [], timeline: [],
        actors: Object.fromEntries((ev.actors || []).map(r => [r, { key: r }])),
        team: {}, teamIndex: 0, duration: 0, error: undefined,
      }
      const sceneActions = new Map(state.sceneActions)
      sceneActions.set(ev.name, [])
      return { ...state, scenes: [...state.scenes, scene], sceneActions }
    }
    case 'action:start':
    case 'action:end': {
      // Append to the most recent running scene's action log
      const last = lastRunningSceneIndex(state.scenes)
      if (last < 0) return state
      const sceneName = state.scenes[last].name
      const sceneActions = new Map(state.sceneActions)
      const arr = sceneActions.get(sceneName) || []
      sceneActions.set(sceneName, [...arr, ev])
      return { ...state, sceneActions }
    }
    case 'assertion': {
      const last = lastRunningSceneIndex(state.scenes)
      if (last < 0) return state
      const scenes = state.scenes.slice()
      const sc = { ...scenes[last] }
      sc.assertions = [...sc.assertions, {
        type: ev.result ? 'pass' : 'fail',
        description: ev.description, result: ev.result, timestamp: ev.timestamp,
      }]
      scenes[last] = sc
      const summary = {
        ...state.summary,
        assertions: {
          total: state.summary.assertions.total + 1,
          passed: state.summary.assertions.passed + (ev.result ? 1 : 0),
          failed: state.summary.assertions.failed + (ev.result ? 0 : 1),
        },
      }
      return { ...state, scenes, summary }
    }
    case 'warning': {
      const last = lastRunningSceneIndex(state.scenes)
      if (last < 0) return state
      const scenes = state.scenes.slice()
      const sc = { ...scenes[last] }
      sc.warnings = [...sc.warnings, {
        actor: ev.actor, selector: ev.selector,
        message: ev.message, timestamp: ev.timestamp,
      }]
      scenes[last] = sc
      return { ...state, scenes, summary: { ...state.summary, warnings: state.summary.warnings + 1 } }
    }
    case 'scene:end': {
      const idx = state.scenes.findIndex(s => s.name === ev.name && s.status === 'running')
      if (idx < 0) return state
      const scenes = state.scenes.slice()
      scenes[idx] = { ...scenes[idx], status: ev.status, duration: ev.duration, error: ev.error }
      const summary = { ...state.summary }
      if (ev.status === 'completed') summary.completed = (summary.completed || 0) + 1
      else summary.failed = (summary.failed || 0) + 1
      return { ...state, scenes, summary }
    }
    case 'run:end':
      return ev.summary ? { ...state, summary: ev.summary } : state
    default:
      return state
  }
}

function lastRunningSceneIndex(scenes) {
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (scenes[i].status === 'running') return i
  }
  return -1
}

// ── App root ──────────────────────────────────────────────────────
function App() {
  const [runs, setRuns] = useState([])
  const [runId, setRunId] = useState(() =>
    new URLSearchParams(location.search).get('run') || 'live'
  )
  const [report, setReport] = useState({
    scenes: [], summary: emptySummary(), sceneActions: new Map(),
  })
  const [connection, setConnection] = useState('idle')
  const [filters, setFilters] = useState({
    text: '', statuses: new Set(STATUSES), groupBy: 'status',
  })
  const [selected, setSelected] = useState(null)

  // Fetch list of past runs once on mount
  useEffect(() => {
    fetch('/__scenetest/runs')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setRuns(data.runs || []) })
      .catch(() => {})
  }, [])

  // Sync URL when run changes
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    p.set('run', runId)
    history.replaceState(null, '', '?' + p.toString())
  }, [runId])

  // Load past run / connect to live SSE depending on selected run id
  useEffect(() => {
    setReport({ scenes: [], summary: emptySummary(), sceneActions: new Map() })
    setSelected(null)

    if (runId === 'live') {
      const es = new EventSource('/__scenetest/events')
      es.onopen = () => setConnection('connected')
      es.onerror = () => setConnection('disconnected')
      es.onmessage = e => {
        try {
          const ev = JSON.parse(e.data)
          setReport(prev => applyEvent(prev, ev))
        } catch {}
      }
      return () => { es.close(); setConnection('idle') }
    } else {
      setConnection('idle')
      fetch('/__scenetest/runs/' + encodeURIComponent(runId))
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return
          setReport({
            scenes: data.scenes || [],
            summary: data.summary || emptySummary(),
            sceneActions: new Map(),
          })
        })
        .catch(() => {})
    }
  }, [runId])

  return html\`
    <div class="app">
      <\${Header}
        runs=\${runs} runId=\${runId} onRunChange=\${setRunId}
        connection=\${connection} summary=\${report.summary}
        scenes=\${report.scenes}
      />
      <main>
        <\${Tree} scenes=\${report.scenes} selected=\${selected} onSelect=\${setSelected} />
        <\${ListPane}
          scenes=\${report.scenes} filters=\${filters} onFilters=\${setFilters}
          selected=\${selected} onSelect=\${setSelected}
          sceneActions=\${report.sceneActions} runId=\${runId}
        />
        <\${Detail}
          scene=\${report.scenes.find(s => s.name === selected)}
          sceneActions=\${report.sceneActions}
        />
      </main>
    </div>
  \`
}

// ── Header ────────────────────────────────────────────────────────
function Header({ runs, runId, onRunChange, connection, summary, scenes }) {
  const completed = scenes.filter(s => s.status === 'completed').length
  const a = summary.assertions || { total: 0, passed: 0, failed: 0 }
  return html\`
    <header>
      <h1><span class="logo">🎬</span> Scenetest</h1>
      <nav class="tabs">
        <span class="tab active">Log</span>
        <a class="tab" href="/__scenetest/dashboard">Waterfall</a>
      </nav>
      <div class="run-picker">
        <label for="run-select">Run</label>
        <select id="run-select" value=\${runId} onChange=\${e => onRunChange(e.target.value)}>
          <option value="live">Live (current run)</option>
          \${runs.map(r => html\`
            <option value=\${r.id}>\${new Date(r.mtime).toLocaleString()}  —  \${r.id}</option>
          \`)}
        </select>
        <span class=\${'conn ' + connection} title=\${connection}></span>
      </div>
      <div class="status-bar">
        <span>scenes \${completed}/\${summary.scenes || scenes.length}</span>
        <span class="ok">✓ \${a.passed}</span>
        <span class="fail">✗ \${a.failed}</span>
        \${summary.warnings ? html\`<span>⚡ \${summary.warnings}</span>\` : null}
      </div>
    </header>
  \`
}

// ── Tree ──────────────────────────────────────────────────────────
function Tree({ scenes, selected, onSelect }) {
  const byFile = useMemo(() => {
    const m = new Map()
    for (const s of scenes) {
      const f = s.file || '(no file)'
      if (!m.has(f)) m.set(f, [])
      m.get(f).push(s)
    }
    return m
  }, [scenes])

  return html\`
    <aside class="tree">
      \${[...byFile.entries()].map(([file, group]) => {
        const fails = group.filter(s => s.status !== 'completed' && s.status !== 'running').length
        return html\`
          <div class="tree-file" title=\${file}>
            <span>\${shortFile(file)}</span>
            \${fails ? html\`<span class="fail">\${fails}</span>\` : null}
          </div>
          \${group.map(s => html\`
            <div
              class=\${'tree-scene ' + s.status + (s.name === selected ? ' selected' : '')}
              onClick=\${() => onSelect(s.name)}
            >\${s.name}</div>
          \`)}
        \`
      })}
    </aside>
  \`
}

// ── List pane (filters + grouped list) ───────────────────────────
function ListPane({ scenes, filters, onFilters, selected, onSelect, sceneActions, runId }) {
  const filtered = useMemo(() => {
    const text = filters.text.toLowerCase()
    return scenes.filter(s => {
      if (!filters.statuses.has(s.status)) return false
      if (!text) return true
      const hay = [
        s.name, s.file,
        ...(s.assertions || []).map(a => a.description),
        s.error || '',
      ].join(' ').toLowerCase()
      return hay.includes(text)
    })
  }, [scenes, filters])

  const groups = useMemo(() => groupScenes(filtered, filters.groupBy), [filtered, filters.groupBy])

  const toggleStatus = useCallback(s => {
    const next = new Set(filters.statuses)
    next.has(s) ? next.delete(s) : next.add(s)
    onFilters({ ...filters, statuses: next })
  }, [filters, onFilters])

  return html\`
    <section class="list-pane">
      <div class="filters">
        <input type="search" placeholder="Filter by scene, file, or assertion…"
          value=\${filters.text}
          onInput=\${e => onFilters({ ...filters, text: e.target.value })}
        />
        <div class="chips">
          \${STATUSES.map(s => html\`
            <button
              class=\${'chip' + (filters.statuses.has(s) ? ' on' : '')}
              data-status=\${s} onClick=\${() => toggleStatus(s)}
            >\${s[0].toUpperCase() + s.slice(1)}</button>
          \`)}
        </div>
        <select class="group-by" value=\${filters.groupBy}
          onChange=\${e => onFilters({ ...filters, groupBy: e.target.value })}>
          <option value="none">No grouping</option>
          <option value="file">Group by file</option>
          <option value="status">Group by status</option>
          <option value="team">Group by team</option>
        </select>
        <\${CopyButton}
          label="Copy all failures"
          getText=\${() => formatFailureReport(scenes.filter(s => s.status !== 'completed'), runId, sceneActions)}
        />
        <\${CopyButton}
          label="Copy all" subtle
          getText=\${() => formatFailureReport(scenes, runId, sceneActions)}
        />
      </div>
      <div class="list">
        \${groups.length === 0
          ? html\`<div class="group-header">No scenes match the current filters.</div>\`
          : groups.map(g => html\`
            \${filters.groupBy !== 'none' ? html\`
              <div class="group-header">\${g.key || ''}  ·  \${g.items.length}</div>
            \` : null}
            \${g.items.map(s => html\`
              <div
                class=\${'row' + (s.name === selected ? ' selected' : '')}
                onClick=\${() => onSelect(s.name)}
              >
                <span class=\${'icon ' + s.status}>\${statusIcon(s.status)}</span>
                <span class="name">\${s.name}</span>
                <span class="meta">
                  \${(s.assertions || []).filter(a => !a.result).length > 0
                    ? html\`<span class="icon failed">✗</span> \`
                    : null}
                  \${(s.assertions || []).length} check\${(s.assertions || []).length === 1 ? '' : 's'}
                  \${s.duration ? '  ·  ' + s.duration + 'ms' : ''}
                </span>
                <span class="file">\${shortFile(s.file)}</span>
              </div>
            \`)}
          \`)}
      </div>
    </section>
  \`
}

function groupScenes(scenes, groupBy) {
  if (groupBy === 'none') return [{ key: '', items: scenes }]
  const m = new Map()
  for (const s of scenes) {
    let key = ''
    if (groupBy === 'file') key = s.file || '(no file)'
    else if (groupBy === 'status') key = s.status
    else if (groupBy === 'team') key = (s.team && s.team.name) || ('team#' + s.teamIndex)
    if (!m.has(key)) m.set(key, [])
    m.get(key).push(s)
  }
  const keys = [...m.keys()]
  if (groupBy === 'status') {
    const order = { failed: 0, timeout: 1, running: 2, completed: 3 }
    keys.sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99))
  } else {
    keys.sort()
  }
  return keys.map(k => ({ key: k, items: m.get(k) }))
}

// ── Detail pane (scene + spec snippet) ───────────────────────────
function Detail({ scene, sceneActions }) {
  if (!scene) {
    return html\`
      <aside class="detail">
        <div class="empty">
          Select a scene on the left to see error details, timeline,
          and the spec snippet for reproducing it manually.
        </div>
      </aside>
    \`
  }

  const failed = scene.status !== 'completed' && scene.status !== 'running'
  const liveActions = sceneActions.get(scene.name) || []
  const timeline = (scene.timeline && scene.timeline.length)
    ? scene.timeline
    : liveActionsToTimeline(liveActions)

  const pills = [
    'team ' + ((scene.team && scene.team.name) || scene.teamIndex),
    scene.duration ? scene.duration + 'ms' : '',
    scene.status,
  ].filter(Boolean)

  return html\`
    <aside class="detail">
      <div class="actions">
        <\${CopyButton} label="Copy" getText=\${() => formatScene(scene, sceneActions)} />
        \${scene.file ? html\`
          <a class="btn subtle"
             href=\${'/__open-in-editor?file=' + encodeURIComponent(scene.file) +
                    (scene.line ? '&line=' + scene.line : '')}
          >Open in editor</a>
        \` : null}
      </div>
      <h3>
        \${failed ? html\`<span class="icon failed">✗</span> \` : null}
        \${scene.name}
      </h3>
      <div class="meta-row">
        \${pills.map(t => html\`<span class="pill">\${t}</span>\`)}
        \${scene.file ? html\`
          <span class="pill" title=\${scene.file}>
            \${shortFile(scene.file)}\${scene.line ? ':' + scene.line : ''}
          </span>
        \` : null}
      </div>
      \${scene.error ? html\`<div class="err">\${scene.error}</div>\` : null}
      <h4>Assertions</h4>
      <ul class="alist">
        \${(scene.assertions || []).length === 0
          ? html\`<li>No assertions recorded.</li>\`
          : scene.assertions.map(a => html\`
            <li class=\${a.result ? 'pass' : 'fail'}>
              \${a.result ? '✓' : '✗'} \${a.description}
            </li>
          \`)}
      </ul>
      <h4>Timeline</h4>
      <ul class="timeline">
        \${timeline.length === 0
          ? html\`<li>(no timeline)</li>\`
          : timeline.map(t => html\`
            <li class=\${t.error ? 'err-step' : ''}>
              \${t.actor}: \${t.action}\${t.target ? ' ' + t.target : ''}
              \${t.duration != null ? ' (' + t.duration + 'ms)' : ''}
              \${t.error ? '  — ' + t.error : ''}
            </li>
          \`)}
      </ul>
      <h4>Spec snippet</h4>
      <\${SpecSnippet} file=\${scene.file} line=\${scene.line} />
    </aside>
  \`
}

function liveActionsToTimeline(events) {
  const open = new Map()
  const out = []
  for (const ev of events) {
    const key = ev.actor + ':' + ev.action
    if (ev.type === 'action:start') open.set(key, ev)
    else if (ev.type === 'action:end') {
      out.push({
        actor: ev.actor, action: ev.action, target: ev.target,
        timestamp: ev.timestamp, duration: ev.duration, error: ev.error,
      })
      open.delete(key)
    }
  }
  for (const ev of open.values()) {
    out.push({
      actor: ev.actor, action: ev.action + ' (in flight)',
      target: ev.target, timestamp: ev.timestamp,
    })
  }
  return out
}

// ── Spec snippet (lazy fetch) ─────────────────────────────────────
function SpecSnippet({ file, line }) {
  const [state, setState] = useState({ status: 'idle' })
  // Re-fetch when file or line changes; aborts on unmount
  useEffect(() => {
    if (!file) { setState({ status: 'no-file' }); return }
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    const url = '/__scenetest/source?file=' + encodeURIComponent(file) +
      '&line=' + (line || 1) + '&context=20'
    fetch(url, { signal: ctrl.signal })
      .then(r => r.ok ? r.json().then(d => ({ ok: true, d })) : { ok: false, status: r.status })
      .then(res => {
        if (res.ok) setState({ status: 'loaded', data: res.d })
        else setState({ status: 'missing', code: res.status })
      })
      .catch(err => {
        if (err.name !== 'AbortError') setState({ status: 'error' })
      })
    return () => ctrl.abort()
  }, [file, line])

  if (state.status === 'no-file') return html\`<div class="empty">No source file recorded.</div>\`
  if (state.status === 'loading') return html\`<div class="empty">Loading…</div>\`
  if (state.status === 'missing') return html\`<div class="empty">Source not available (\${state.code}).</div>\`
  if (state.status === 'error') return html\`<div class="empty">Could not load source.</div>\`
  if (state.status !== 'loaded') return null

  const { start, lines } = state.data
  const target = line || start
  return html\`
    <pre class="snippet">\${lines.map((ln, i) => {
      const n = start + i
      const cls = 'row-line' + (n === target ? ' hl' : '')
      return html\`<div class=\${cls}><span class="ln">\${n}</span>\${ln}</div>\`
    })}</pre>
  \`
}

// ── Copy button (shared) ──────────────────────────────────────────
function CopyButton({ label, getText, subtle }) {
  const [copied, setCopied] = useState(false)
  const tRef = useRef(null)
  useEffect(() => () => { if (tRef.current) clearTimeout(tRef.current) }, [])
  const onClick = () => {
    navigator.clipboard.writeText(getText()).then(() => {
      setCopied(true)
      tRef.current = setTimeout(() => setCopied(false), 1500)
    })
  }
  const cls = 'btn' + (subtle ? ' subtle' : '') + (copied ? ' copied' : '')
  return html\`<button class=\${cls} onClick=\${onClick}>\${copied ? 'Copied!' : label}</button>\`
}

// ── Plain-text formatters (clipboard payload) ────────────────────
function formatScene(s, sceneActions) {
  const status = s.status === 'completed' ? 'PASSED'
    : s.status === 'timeout' ? 'TIMEOUT'
    : s.status === 'running' ? 'RUNNING' : 'FAILED'
  const lines = []
  lines.push(statusIcon(s.status) + ' ' + s.name + ' — ' + status)
  lines.push('  File: ' + s.file + (s.line ? ':' + s.line : ''))
  lines.push('  Team: ' + ((s.team && s.team.name) || ('team#' + s.teamIndex)) +
    (s.duration ? '  ·  ' + s.duration + 'ms' : ''))
  if (s.error) lines.push('  Error: ' + s.error)
  if ((s.assertions || []).length) {
    lines.push('  Assertions:')
    for (const a of s.assertions) {
      lines.push('    ' + (a.result ? '✓' : '✗') + ' ' + a.description)
    }
  }
  const tl = (s.timeline && s.timeline.length)
    ? s.timeline
    : liveActionsToTimeline(sceneActions.get(s.name) || [])
  if (tl.length) {
    lines.push('  Timeline:')
    for (const t of tl) {
      lines.push('    ' + t.actor + ': ' + t.action + (t.target ? ' ' + t.target : '') +
        (t.duration != null ? ' (' + t.duration + 'ms)' : '') + (t.error ? ' — ' + t.error : ''))
    }
  }
  return lines.join('\\n')
}

function formatFailureReport(scenes, runId, sceneActions) {
  const failures = scenes.filter(s => s.status !== 'completed' && s.status !== 'running')
  const target = failures.length ? failures : scenes
  const header = ['Scenetest — ' + (runId || 'live'), failures.length + ' failing scene(s)', '']
  return header.join('\\n') + '\\n' + target.map(s => formatScene(s, sceneActions)).join('\\n\\n')
}

// ── Index page ────────────────────────────────────────────────────
function Index() {
  return html\`
    <div class="index">
      <h1><span class="logo">🎬</span> Scenetest</h1>
      <p class="lede">Pick a view.</p>
      <div class="cards">
        <a class="card" href="/__scenetest/runner" onClick=\${navigate}>
          <div class="name">Scene runner →</div>
          <div class="desc">Live and past runs: scene tree, status, failure log, spec snippets.</div>
        </a>
        <a class="card" href="/__scenetest/dashboard">
          <div class="name">Assertions dashboard →</div>
          <div class="desc">Waterfall view of inline check() / should() assertions across actors.</div>
        </a>
      </div>
    </div>
  \`
}

// ── Router ────────────────────────────────────────────────────────
// Same HTML at /__scenetest and /__scenetest/runner; switch by pathname.
function navigate(e) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return
  const href = e.currentTarget.getAttribute('href')
  if (!href || !href.startsWith('/__scenetest')) return
  if (href === '/__scenetest/dashboard') return
  e.preventDefault()
  history.pushState(null, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function Root() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const onPop = () => setPath(location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  if (path === '/__scenetest/runner' || path === '/__scenetest/runner/') {
    return html\`<\${App} />\`
  }
  return html\`<\${Index} />\`
}

// ── Bootstrap ─────────────────────────────────────────────────────
render(h(Root, {}), document.getElementById('root'))
`
