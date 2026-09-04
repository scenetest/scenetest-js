import { useState, useEffect, useMemo, useCallback, useRef } from 'preact/hooks'
import {
  selectSnapshot,
  mapReportToSnapshot,
  EMPTY_SNAPSHOT,
  type RunnerScene,
  type RunnerSnapshot,
  type RunnerRunState,
} from './select-runner.js'
import { useRunSlice } from './use-run-slice.js'
import type { DashboardCollections } from './select-helpers.js'
import type { Command } from '@scenetest/protocol'
import type { ConnectionStatus, Lane } from './types.js'

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

/**
 * The left pane selects either a single scene or a whole file; the detail pane
 * on the right renders whichever kind is selected. (There is no separate tree
 * sidebar — the list pane does both jobs.)
 */
export type Selection = { kind: 'scene'; id: string } | { kind: 'file'; file: string } | null

const isSceneSel = (sel: Selection, id: string): boolean => sel?.kind === 'scene' && sel.id === id
const isFileSel = (sel: Selection, file: string): boolean => sel?.kind === 'file' && sel.file === file

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

/** Fetch configured team names from `<base>/teams` once. Empty on failure. */
function useConfiguredTeams(base: string): string[] {
  const [teams, setTeams] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    fetch(`${base}/teams`)
      .then((r) => r.json())
      .then((data: { teams?: Array<{ name?: string }> }) => {
        if (cancelled || !Array.isArray(data?.teams)) return
        setTeams(data.teams.map((t) => t.name).filter((n): n is string => !!n))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [base])
  return teams
}

// ── Runner view root ──────────────────────────────────────────────
export function RunnerView({
  collections,
  connection: liveConnection,
  base,
  send,
}: {
  collections: DashboardCollections
  connection: ConnectionStatus
  base: string
  /** Push a protocol command toward the runner (replay / pause / resume / stop). */
  send?: (command: Command) => void
}) {
  const [runId, setRunId] = useState(() => new URLSearchParams(location.search).get('run') || 'live')
  const [runs, setRuns] = useState<RunInfo[]>([])
  const [filters, setFilters] = useState<Filters>({ text: '', statuses: new Set(STATUSES), groupBy: 'file' })
  const [selected, setSelected] = useState<Selection>(null)
  const { snap, connection } = useRunner(collections, liveConnection, runId, base)
  const isLive = runId === 'live'

  const replay = useCallback((file?: string) => send?.({ type: 'run:replay', ...(file ? { file } : {}) }), [send])

  // Teams for the replay picker — configured teams (so it lists teams that
  // haven't run yet), falling back to those seen in the current run's scenes.
  const configuredTeams = useConfiguredTeams(base)
  const seenTeams = useMemo(
    () => [...new Set(snap.scenes.map((s) => s.team?.name).filter((n): n is string => !!n))],
    [snap.scenes]
  )
  const teams = configuredTeams.length ? configuredTeams : seenTeams

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

  return (
    <div class="runner">
      <RunnerHeader
        runs={runs}
        runId={runId}
        onRunChange={setRunId}
        connection={connection}
        summary={snap.summary}
        run={snap.run}
        scenes={snap.scenes}
        teams={teams}
        isLive={isLive}
        send={send}
      />
      <main class="two-pane">
        <ListPane
          scenes={snap.scenes}
          filters={filters}
          onFilters={setFilters}
          selected={selected}
          onSelect={setSelected}
          onReplay={send ? replay : undefined}
          runId={runId}
        />
        <Detail
          selection={selected}
          scenes={snap.scenes}
          base={base}
          onSelect={setSelected}
          onReplay={send ? replay : undefined}
        />
      </main>
    </div>
  )
}

// ── Header (run picker + run controls + status) ───────────────────
function RunnerHeader({
  runs,
  runId,
  onRunChange,
  connection,
  summary,
  run,
  scenes,
  teams,
  isLive,
  send,
}: {
  runs: RunInfo[]
  runId: string
  onRunChange: (id: string) => void
  connection: string
  summary: RunnerSnapshot['summary']
  run: RunnerRunState
  scenes: RunnerScene[]
  teams: string[]
  isLive: boolean
  send?: (command: Command) => void
}) {
  const completed = scenes.filter((s) => s.status === 'completed').length
  const a = summary.assertions
  const sceneCount = summary.scenes || scenes.length
  const pct = sceneCount > 0 ? Math.round((completed / sceneCount) * 100) : 0
  const progressClass =
    summary.failed > 0
      ? 'runner-progress has-failures'
      : completed === sceneCount && sceneCount > 0
        ? 'runner-progress done'
        : 'runner-progress'

  return (
    <>
      <div class="runner-bar">
        <span class="brand" title="Scenetest">
          <span class="logo">🎬</span> Scenetest
        </span>
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
        {isLive && send ? (
          <RunControls run={run} teams={teams} send={send} />
        ) : null}
        <div class="status-bar">
          <span>
            scenes {completed}/{sceneCount}
          </span>
          <span class="ok">✓ {a.passed}</span>
          <span class="fail">✗ {a.failed}</span>
          {run.cancelled ? (
            <span class="stopped" title="Run stopped before completing">
              ■ stopped
            </span>
          ) : null}
        </div>
      </div>
      {isLive && sceneCount > 0 ? (
        <div class={progressClass}>
          <div class="runner-progress-fill" style={`width:${pct}%`}></div>
        </div>
      ) : null}
    </>
  )
}

// ── Run controls (replay-all + team, pause/resume, stop, clock) ───
function RunControls({
  run,
  teams,
  send,
}: {
  run: RunnerRunState
  teams: string[]
  send: (command: Command) => void
}) {
  const [team, setTeam] = useState('')
  const [, force] = useState(0)

  // Tick the elapsed clock while a run is in progress.
  useEffect(() => {
    if (!run.running) return
    const id = setInterval(() => force((n) => n + 1), 200)
    return () => clearInterval(id)
  }, [run.running])

  const elapsed =
    run.endDurationMs != null ? `${run.endDurationMs}ms` : run.startTime ? `${Date.now() - run.startTime}ms` : '—'

  return (
    <div class="run-controls">
      <button
        class="btn"
        disabled={run.running}
        title="Replay the selected team (or all teams)"
        onClick={() => send({ type: 'run:replay', ...(team ? { team } : {}) })}
      >
        ▶ Replay all
      </button>
      <select
        class="team-select"
        value={team}
        title="Restrict replay to one team"
        onChange={(e) => setTeam((e.target as HTMLSelectElement).value)}
      >
        <option value="">all teams</option>
        {teams.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button class="btn" onClick={() => send({ type: run.paused ? 'run:resume' : 'run:pause' })}>
        {run.paused ? '▶ Resume' : '❚❚ Pause'}
      </button>
      <button class="btn stop" onClick={() => send({ type: 'run:stop' })}>
        ■ Stop
      </button>
      <span class="elapsed" title="Elapsed time">
        {elapsed}
      </span>
    </div>
  )
}

// ── List pane (filters + grouped list) ────────────────────────────
export function ListPane({
  scenes,
  filters,
  onFilters,
  selected,
  onSelect,
  onReplay,
  runId,
}: {
  scenes: RunnerScene[]
  filters: Filters
  onFilters: (f: Filters) => void
  selected: Selection
  onSelect: (sel: Selection) => void
  onReplay?: (file: string) => void
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
          groups.map((g) => {
            // When grouped by file, the header names a real file — make it a
            // first-class selectable row (click → file detail on the right),
            // with an inline replay for the whole file.
            const isFileGroup = filters.groupBy === 'file'
            const file = g.key
            return (
              <div key={g.key}>
                {filters.groupBy !== 'none' ? (
                  isFileGroup ? (
                    <div
                      class={'group-header file-header' + (isFileSel(selected, file) ? ' selected' : '')}
                      title={file}
                      onClick={() => onSelect({ kind: 'file', file })}
                    >
                      <span class="gh-name">
                        {shortFile(file) || '(no file)'} · {g.items.length}
                      </span>
                      {onReplay ? (
                        <button
                          class="gh-replay"
                          title="Replay this file"
                          onClick={(e) => {
                            e.stopPropagation()
                            onReplay(file)
                          }}
                        >
                          ▶
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div class="group-header">
                      {g.key || ''} · {g.items.length}
                    </div>
                  )
                ) : null}
                {g.items.map((s) => (
                  <div
                    key={s.id}
                    class={'row' + (isSceneSel(selected, s.id) ? ' selected' : '')}
                    onClick={() => onSelect({ kind: 'scene', id: s.id })}
                  >
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
                    <span
                      class={'file' + (isFileSel(selected, s.file) ? ' selected' : '')}
                      title={'Open file overview: ' + s.file}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect({ kind: 'file', file: s.file })
                      }}
                    >
                      {shortFile(s.file)}
                    </span>
                  </div>
                ))}
              </div>
            )
          })
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

// ── Actor lanes (the concurrent-actor timeline, in the scene detail) ─
function Lanes({ lanes }: { lanes: Lane[] }) {
  if (lanes.length === 0) return <div class="empty">(no actions recorded)</div>
  return (
    <div class="lanes">
      {lanes.map((lane) => (
        <div class="lane" key={lane.actor}>
          <span class="lane-actor">{lane.actor}</span>
          <div class="lane-items">
            {lane.items.length === 0 ? (
              <span class="lane-empty">—</span>
            ) : (
              lane.items.map((item, i) => (
                <span class={'pill ' + item.status} title={item.error ?? ''} key={i}>
                  {item.action}
                  {item.target ? <span class="tgt"> {item.target}</span> : null}
                </span>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Detail pane (renders whichever kind is selected on the left) ───
export function Detail({
  selection,
  scenes,
  base,
  onSelect,
  onReplay,
}: {
  selection: Selection
  scenes: RunnerScene[]
  base: string
  onSelect: (sel: Selection) => void
  onReplay?: (file: string) => void
}) {
  if (selection?.kind === 'file') {
    return <FileDetail file={selection.file} scenes={scenes} base={base} onSelect={onSelect} onReplay={onReplay} />
  }
  const scene = selection?.kind === 'scene' ? scenes.find((s) => s.id === selection.id) : undefined
  if (!scene) {
    return (
      <aside class="detail">
        <div class="empty">
          Select a scene or a file heading on the left. A scene shows its error, actor lanes, and spec snippet; a file
          shows its scenes and roll-up.
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
        {onReplay && scene.file ? (
          <button class="btn replay" title="Replay this scene's file" onClick={() => onReplay(scene.file)}>
            ▶ Replay
          </button>
        ) : null}
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
          <span
            class="pill file-link"
            title={'Open file overview: ' + scene.file}
            onClick={() => onSelect({ kind: 'file', file: scene.file })}
          >
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
      <h4>Actor timeline</h4>
      <Lanes lanes={scene.lanes} />
      <h4>Spec snippet</h4>
      <SpecSnippet file={scene.file} line={scene.line} base={base} />
    </aside>
  )
}

// ── File detail (roll-up + scene list for the selected file) ──────
interface FileRollup {
  scenes: RunnerScene[]
  passed: number
  failed: number
  running: number
  checks: { total: number; failed: number }
  team: string | null
}

export function rollupFile(file: string, scenes: RunnerScene[]): FileRollup {
  const group = scenes.filter((s) => (s.file || '(no file)') === file)
  let passed = 0
  let failed = 0
  let running = 0
  let checksTotal = 0
  let checksFailed = 0
  const teams = new Set<string>()
  for (const s of group) {
    if (s.status === 'completed') passed++
    else if (s.status === 'running') running++
    else failed++
    checksTotal += s.assertions.length
    checksFailed += s.assertions.filter((a) => !a.result).length
    teams.add(teamLabel(s))
  }
  return {
    scenes: group,
    passed,
    failed,
    running,
    checks: { total: checksTotal, failed: checksFailed },
    team: teams.size === 1 ? [...teams][0] : null,
  }
}

function FileDetail({
  file,
  scenes,
  base,
  onSelect,
  onReplay,
}: {
  file: string
  scenes: RunnerScene[]
  base: string
  onSelect: (sel: Selection) => void
  onReplay?: (file: string) => void
}) {
  const roll = useMemo(() => rollupFile(file, scenes), [file, scenes])
  const hasFile = !!file && file !== '(no file)'
  const editorHref = `${base.replace(/__scenetest$/, '')}__open-in-editor?file=` + encodeURIComponent(file)
  const pills = [
    `${roll.scenes.length} scene${roll.scenes.length === 1 ? '' : 's'}`,
    roll.team ? 'team ' + roll.team : '',
    `${roll.checks.total} check${roll.checks.total === 1 ? '' : 's'}`,
  ].filter(Boolean)

  return (
    <aside class="detail">
      <div class="actions">
        {onReplay && hasFile ? (
          <button class="btn replay" title="Replay this file" onClick={() => onReplay(file)}>
            ▶ Replay file
          </button>
        ) : null}
        <CopyButton label="Copy" getText={() => formatFile(file, roll.scenes)} />
        {hasFile ? (
          <a class="btn subtle" href={editorHref}>
            Open in editor
          </a>
        ) : null}
      </div>
      <h3>
        {roll.failed > 0 ? <span class="icon failed">✗</span> : null} {shortFile(file) || '(no file)'}
      </h3>
      <div class="meta-row">
        {pills.map((t, i) => (
          <span class="pill" key={i}>
            {t}
          </span>
        ))}
      </div>
      <div class="file-stats">
        <span class="ok">✓ {roll.passed} passed</span>
        <span class="fail">✗ {roll.failed} failed</span>
        {roll.running ? <span class="run">◐ {roll.running} running</span> : null}
        {roll.checks.failed ? (
          <span class="fail">
            {roll.checks.failed} failing check{roll.checks.failed === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
      <h4>Scenes</h4>
      <ul class="file-scenes">
        {roll.scenes.length === 0 ? (
          <li class="empty">No scenes recorded for this file.</li>
        ) : (
          roll.scenes.map((s) => (
            <li
              key={s.id}
              class={'file-scene ' + s.status}
              onClick={() => onSelect({ kind: 'scene', id: s.id })}
              title="Open scene detail"
            >
              <span class={'icon ' + s.status}>{statusIcon(s.status)}</span>
              <span class="fs-name">{s.name}</span>
              <span class="fs-meta">
                {s.assertions.length} check{s.assertions.length === 1 ? '' : 's'}
                {s.duration ? ' · ' + s.duration + 'ms' : ''}
              </span>
            </li>
          ))
        )}
      </ul>
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

function formatFile(file: string, scenes: RunnerScene[]): string {
  const failing = scenes.filter((s) => s.status !== 'completed' && s.status !== 'running').length
  const header = ['File: ' + (file || '(no file)'), `${scenes.length} scene(s), ${failing} failing`, '']
  return header.join('\n') + scenes.map((s) => formatScene(s)).join('\n\n')
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
