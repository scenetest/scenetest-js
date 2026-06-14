import { useState, useEffect, useMemo, useCallback, useRef } from 'preact/hooks'
import {
  selectSnapshot,
  mapReportToSnapshot,
  EMPTY_SNAPSHOT,
  type RunnerScene,
  type RunnerSnapshot,
} from './select-runner.js'
import { useRunSlice } from './use-run-slice.js'
import type { DashboardCollections } from './select-helpers.js'
import type { ConnectionStatus } from './types.js'

const STATUSES = ['failed', 'timeout', 'running', 'completed'] as const

interface RunInfo {
  id: string
  mtime: number
}
type GroupBy = 'none' | 'file' | 'status' | 'team'
interface Filters {
  text: string
  statuses: Set<string>
  groupBy: GroupBy
}

// ── Helpers ───────────────────────────────────────────────────────
function shortFile(f: string): string {
  if (!f) return ''
  const parts = f.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : f
}

function statusIcon(s: string): string {
  return s === 'completed' ? '✓' : s === 'running' ? '◐' : s === 'timeout' ? '⏱' : '✗'
}

function teamLabel(s: RunnerScene): string {
  return s.team?.name || 'team ' + s.teamIndex
}

// ── Data: live reads the shared read model; past fetches a report ──
function useRunner(
  collections: DashboardCollections,
  liveConnection: ConnectionStatus,
  runId: string,
  base: string
): { snap: RunnerSnapshot; connection: string } {
  // Read the store reactively (live mode): the latest-run slice is maintained
  // by live-query collections (`where runId = latest`, ordered); the selector
  // attributes assertions/actions to scenes and rolls up the summary.
  const slice = useRunSlice(collections)
  const live = useMemo(
    () => selectSnapshot(slice),
    [slice.runId, slice.run, slice.scenes, slice.assertions, slice.actions]
  )

  const [past, setPast] = useState<RunnerSnapshot>(EMPTY_SNAPSHOT)
  useEffect(() => {
    if (runId === 'live') return
    setPast(EMPTY_SNAPSHOT)
    let alive = true
    fetch(`${base}/runs/${encodeURIComponent(runId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data) setPast(mapReportToSnapshot(data))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [runId, base])

  if (runId === 'live') return { snap: live, connection: liveConnection }
  return { snap: past, connection: 'idle' }
}

// ── Runner view root ──────────────────────────────────────────────
export function RunnerView({
  collections,
  connection: liveConnection,
  base,
}: {
  collections: DashboardCollections
  connection: ConnectionStatus
  base: string
}) {
  const [runId, setRunId] = useState(() => new URLSearchParams(location.search).get('run') || 'live')
  const [runs, setRuns] = useState<RunInfo[]>([])
  const [filters, setFilters] = useState<Filters>({ text: '', statuses: new Set(STATUSES), groupBy: 'status' })
  const [selected, setSelected] = useState<string | null>(null)
  const { snap, connection } = useRunner(collections, liveConnection, runId, base)

  useEffect(() => {
    fetch(`${base}/runs`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setRuns(data.runs || [])
      })
      .catch(() => {})
  }, [base])

  // Reflect the chosen run in the URL, preserving the route path.
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    p.set('run', runId)
    history.replaceState(null, '', location.pathname + '?' + p.toString())
    setSelected(null)
  }, [runId])

  const scene = snap.scenes.find((s) => s.id === selected)

  return (
    <div class="runner">
      <RunnerHeader
        runs={runs}
        runId={runId}
        onRunChange={setRunId}
        connection={connection}
        summary={snap.summary}
        scenes={snap.scenes}
      />
      <main>
        <Tree scenes={snap.scenes} selected={selected} onSelect={setSelected} />
        <ListPane
          scenes={snap.scenes}
          filters={filters}
          onFilters={setFilters}
          selected={selected}
          onSelect={setSelected}
          runId={runId}
        />
        <Detail scene={scene} base={base} />
      </main>
    </div>
  )
}

// ── Header (run picker + status) ──────────────────────────────────
function RunnerHeader({
  runs,
  runId,
  onRunChange,
  connection,
  summary,
  scenes,
}: {
  runs: RunInfo[]
  runId: string
  onRunChange: (id: string) => void
  connection: string
  summary: RunnerSnapshot['summary']
  scenes: RunnerScene[]
}) {
  const completed = scenes.filter((s) => s.status === 'completed').length
  const a = summary.assertions
  return (
    <div class="runner-bar">
      <div class="run-picker">
        <label for="run-select">Run</label>
        <select id="run-select" value={runId} onChange={(e) => onRunChange((e.target as HTMLSelectElement).value)}>
          <option value="live">Live (current run)</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {new Date(r.mtime).toLocaleString()} — {r.id}
            </option>
          ))}
        </select>
        <span class={'conn ' + connection} title={connection}></span>
      </div>
      <div class="status-bar">
        <span>
          scenes {completed}/{summary.scenes || scenes.length}
        </span>
        <span class="ok">✓ {a.passed}</span>
        <span class="fail">✗ {a.failed}</span>
      </div>
    </div>
  )
}

// ── Tree (scenes grouped by file) ─────────────────────────────────
function Tree({
  scenes,
  selected,
  onSelect,
}: {
  scenes: RunnerScene[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  const byFile = useMemo(() => {
    const m = new Map<string, RunnerScene[]>()
    for (const s of scenes) {
      const f = s.file || '(no file)'
      if (!m.has(f)) m.set(f, [])
      m.get(f)!.push(s)
    }
    return m
  }, [scenes])

  return (
    <aside class="tree">
      {[...byFile.entries()].map(([file, group]) => {
        const fails = group.filter((s) => s.status !== 'completed' && s.status !== 'running').length
        return (
          <div key={file}>
            <div class="tree-file" title={file}>
              <span>{shortFile(file)}</span>
              {fails ? <span class="fail">{fails}</span> : null}
            </div>
            {group.map((s) => (
              <div
                key={s.id}
                class={'tree-scene ' + s.status + (s.id === selected ? ' selected' : '')}
                onClick={() => onSelect(s.id)}
              >
                {s.name}
              </div>
            ))}
          </div>
        )
      })}
    </aside>
  )
}

// ── List pane (filters + grouped list) ────────────────────────────
function ListPane({
  scenes,
  filters,
  onFilters,
  selected,
  onSelect,
  runId,
}: {
  scenes: RunnerScene[]
  filters: Filters
  onFilters: (f: Filters) => void
  selected: string | null
  onSelect: (id: string) => void
  runId: string
}) {
  const filtered = useMemo(() => {
    const text = filters.text.toLowerCase()
    return scenes.filter((s) => {
      if (!filters.statuses.has(s.status)) return false
      if (!text) return true
      const hay = [s.name, s.file, ...s.assertions.map((a) => a.description), s.error || ''].join(' ').toLowerCase()
      return hay.includes(text)
    })
  }, [scenes, filters])

  const groups = useMemo(() => groupScenes(filtered, filters.groupBy), [filtered, filters.groupBy])

  const toggleStatus = useCallback(
    (s: string) => {
      const next = new Set(filters.statuses)
      next.has(s) ? next.delete(s) : next.add(s)
      onFilters({ ...filters, statuses: next })
    },
    [filters, onFilters]
  )

  return (
    <section class="list-pane">
      <div class="filters">
        <input
          type="search"
          placeholder="Filter by scene, file, or assertion…"
          value={filters.text}
          onInput={(e) => onFilters({ ...filters, text: (e.target as HTMLInputElement).value })}
        />
        <div class="chips">
          {STATUSES.map((s) => (
            <button
              key={s}
              class={'chip' + (filters.statuses.has(s) ? ' on' : '')}
              data-status={s}
              onClick={() => toggleStatus(s)}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <select
          class="group-by"
          value={filters.groupBy}
          onChange={(e) => onFilters({ ...filters, groupBy: (e.target as HTMLSelectElement).value as GroupBy })}
        >
          <option value="none">No grouping</option>
          <option value="file">Group by file</option>
          <option value="status">Group by status</option>
          <option value="team">Group by team</option>
        </select>
        <CopyButton label="Copy all failures" getText={() => formatFailureReport(scenes, runId)} />
        <CopyButton label="Copy all" subtle getText={() => formatReport(scenes, runId)} />
      </div>
      <div class="list">
        {groups.length === 0 ? (
          <div class="group-header">No scenes match the current filters.</div>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              {filters.groupBy !== 'none' ? (
                <div class="group-header">
                  {g.key || ''} · {g.items.length}
                </div>
              ) : null}
              {g.items.map((s) => (
                <div key={s.id} class={'row' + (s.id === selected ? ' selected' : '')} onClick={() => onSelect(s.id)}>
                  <span class={'icon ' + s.status}>{statusIcon(s.status)}</span>
                  <span class="name">{s.name}</span>
                  <span class="row-team" title="Team running this scene">
                    {teamLabel(s)}
                  </span>
                  <span class="meta">
                    {s.assertions.filter((a) => !a.result).length > 0 ? <span class="icon failed">✗</span> : null}{' '}
                    {s.assertions.length} check{s.assertions.length === 1 ? '' : 's'}
                    {s.duration ? ' · ' + s.duration + 'ms' : ''}
                  </span>
                  <span class="file">{shortFile(s.file)}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function groupScenes(scenes: RunnerScene[], groupBy: GroupBy): { key: string; items: RunnerScene[] }[] {
  if (groupBy === 'none') return [{ key: '', items: scenes }]
  const m = new Map<string, RunnerScene[]>()
  for (const s of scenes) {
    let key = ''
    if (groupBy === 'file') key = s.file || '(no file)'
    else if (groupBy === 'status') key = s.status
    else if (groupBy === 'team') key = teamLabel(s)
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(s)
  }
  const keys = [...m.keys()]
  if (groupBy === 'status') {
    const order: Record<string, number> = { failed: 0, timeout: 1, running: 2, completed: 3 }
    keys.sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99))
  } else {
    keys.sort()
  }
  return keys.map((k) => ({ key: k, items: m.get(k)! }))
}

// ── Detail pane (scene + spec snippet) ────────────────────────────
function Detail({ scene, base }: { scene: RunnerScene | undefined; base: string }) {
  if (!scene) {
    return (
      <aside class="detail">
        <div class="empty">
          Select a scene on the left to see error details, timeline, and the spec snippet for reproducing it manually.
        </div>
      </aside>
    )
  }

  const failed = scene.status !== 'completed' && scene.status !== 'running'
  const pills = ['team ' + teamLabel(scene), scene.duration ? scene.duration + 'ms' : '', scene.status].filter(Boolean)
  const editorHref =
    `${base.replace(/__scenetest$/, '')}__open-in-editor?file=` +
    encodeURIComponent(scene.file) +
    (scene.line ? '&line=' + scene.line : '')

  return (
    <aside class="detail">
      <div class="actions">
        <CopyButton label="Copy" getText={() => formatScene(scene)} />
        {scene.file ? (
          <a class="btn subtle" href={editorHref}>
            Open in editor
          </a>
        ) : null}
      </div>
      <h3>
        {failed ? <span class="icon failed">✗</span> : null} {scene.name}
      </h3>
      <div class="meta-row">
        {pills.map((t, i) => (
          <span class="pill" key={i}>
            {t}
          </span>
        ))}
        {scene.file ? (
          <span class="pill" title={scene.file}>
            {shortFile(scene.file)}
            {scene.line ? ':' + scene.line : ''}
          </span>
        ) : null}
      </div>
      {scene.error ? <div class="err">{scene.error}</div> : null}
      <h4>Assertions</h4>
      <ul class="alist">
        {scene.assertions.length === 0 ? (
          <li>No assertions recorded.</li>
        ) : (
          scene.assertions.map((a, i) => (
            <li class={a.result ? 'pass' : 'fail'} key={i}>
              {a.result ? '✓' : '✗'} {a.description}
            </li>
          ))
        )}
      </ul>
      <h4>Timeline</h4>
      <ul class="timeline">
        {scene.timeline.length === 0 ? (
          <li>(no timeline)</li>
        ) : (
          scene.timeline.map((t, i) => (
            <li class={t.error ? 'err-step' : ''} key={i}>
              {t.actor}: {t.action}
              {t.target ? ' ' + t.target : ''}
              {t.duration != null ? ' (' + t.duration + 'ms)' : ''}
              {t.error ? ' — ' + t.error : ''}
            </li>
          ))
        )}
      </ul>
      <h4>Spec snippet</h4>
      <SpecSnippet file={scene.file} line={scene.line} base={base} />
    </aside>
  )
}

// ── Spec snippet (lazy fetch) ─────────────────────────────────────
type SnippetState =
  | { status: 'idle' | 'no-file' | 'loading' | 'error' }
  | { status: 'missing'; code: number }
  | { status: 'loaded'; data: { start: number; lines: string[] } }

function SpecSnippet({ file, line, base }: { file: string; line?: number; base: string }) {
  const [state, setState] = useState<SnippetState>({ status: 'idle' })
  useEffect(() => {
    if (!file) {
      setState({ status: 'no-file' })
      return
    }
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    const url = `${base}/source?file=` + encodeURIComponent(file) + '&line=' + (line || 1) + '&context=20'
    fetch(url, { signal: ctrl.signal })
      .then(async (r): Promise<SnippetState> => {
        if (r.ok) return { status: 'loaded', data: await r.json() }
        return { status: 'missing', code: r.status }
      })
      .then((next) => setState(next))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setState({ status: 'error' })
      })
    return () => ctrl.abort()
  }, [file, line, base])

  if (state.status === 'no-file') return <div class="empty">No source file recorded.</div>
  if (state.status === 'loading') return <div class="empty">Loading…</div>
  if (state.status === 'missing') return <div class="empty">Source not available ({state.code}).</div>
  if (state.status === 'error') return <div class="empty">Could not load source.</div>
  if (state.status !== 'loaded') return null

  const { start, lines } = state.data
  const target = line || start
  return (
    <pre class="snippet">
      {lines.map((ln, i) => {
        const n = start + i
        return (
          <div class={'row-line' + (n === target ? ' hl' : '')} key={n}>
            <span class="ln">{n}</span>
            {ln}
          </div>
        )
      })}
    </pre>
  )
}

// ── Copy button ───────────────────────────────────────────────────
function CopyButton({ label, getText, subtle }: { label: string; getText: () => string; subtle?: boolean }) {
  const [copied, setCopied] = useState(false)
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (tRef.current) clearTimeout(tRef.current)
    },
    []
  )
  const onClick = () => {
    navigator.clipboard.writeText(getText()).then(() => {
      setCopied(true)
      tRef.current = setTimeout(() => setCopied(false), 1500)
    })
  }
  const cls = 'btn' + (subtle ? ' subtle' : '') + (copied ? ' copied' : '')
  return (
    <button class={cls} onClick={onClick}>
      {copied ? 'Copied!' : label}
    </button>
  )
}

// ── Plain-text formatters (clipboard payload) ─────────────────────
function formatScene(s: RunnerScene): string {
  const status =
    s.status === 'completed' ? 'PASSED' : s.status === 'timeout' ? 'TIMEOUT' : s.status === 'running' ? 'RUNNING' : 'FAILED'
  const lines: string[] = []
  lines.push(statusIcon(s.status) + ' ' + s.name + ' — ' + status)
  lines.push('  File: ' + s.file + (s.line ? ':' + s.line : ''))
  lines.push('  Team: ' + teamLabel(s) + (s.duration ? ' · ' + s.duration + 'ms' : ''))
  if (s.error) lines.push('  Error: ' + s.error)
  if (s.assertions.length) {
    lines.push('  Assertions:')
    for (const a of s.assertions) lines.push('    ' + (a.result ? '✓' : '✗') + ' ' + a.description)
  }
  if (s.timeline.length) {
    lines.push('  Timeline:')
    for (const t of s.timeline) {
      lines.push(
        '    ' +
          t.actor +
          ': ' +
          t.action +
          (t.target ? ' ' + t.target : '') +
          (t.duration != null ? ' (' + t.duration + 'ms)' : '') +
          (t.error ? ' — ' + t.error : '')
      )
    }
  }
  return lines.join('\n')
}

function formatReport(scenes: RunnerScene[], runId: string): string {
  const failures = scenes.filter((s) => s.status !== 'completed' && s.status !== 'running')
  const header = ['Scenetest — ' + (runId || 'live'), failures.length + ' failing scene(s)', '']
  return header.join('\n') + '\n' + scenes.map((s) => formatScene(s)).join('\n\n')
}

function formatFailureReport(scenes: RunnerScene[], runId: string): string {
  const failures = scenes.filter((s) => s.status !== 'completed' && s.status !== 'running')
  return formatReport(failures.length ? failures : scenes, runId)
}
