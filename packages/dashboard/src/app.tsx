import { useEffect, useState } from 'preact/hooks'
import type { Command } from '@scenetest/protocol'
import { completedSceneCount } from './select-waterfall.js'
import type { DashboardState, Scene } from './types.js'

/**
 * The Waterfall view — the live timeline of actors and inline assertions. It's
 * a pure view: the Dashboard root computes `state` from the shared read model
 * (`selectWaterfall` over the collections) and passes it in, along with `send`
 * for header controls. Same component renders in dev and cloud.
 */
export function Waterfall({ state, send }: { state: DashboardState; send: (c: Command) => void }) {
  return (
    <div class="root">
      <Header state={state} send={send} />
      <main>
        {state.scenes.length === 0 ? (
          <div class="waiting">
            <h2>Waiting for scene run…</h2>
            <p>
              Run <code>scenetest</code> to see the live timeline here.
            </p>
          </div>
        ) : (
          state.scenes.map((scene) => <SceneCard key={scene.name} scene={scene} send={send} />)
        )}
      </main>
    </div>
  )
}

function Header({ state, send }: { state: DashboardState; send: (c: Command) => void }) {
  const [team, setTeam] = useState('')
  const [, force] = useState(0)
  const running = state.running

  // Tick the elapsed clock while a run is in progress.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => force((n) => n + 1), 200)
    return () => clearInterval(id)
  }, [running])

  const completed = completedSceneCount(state)
  const elapsed =
    state.endDurationMs != null
      ? `${state.endDurationMs}ms`
      : state.runStartTime
        ? `${Date.now() - state.runStartTime}ms`
        : '—'

  const pct = state.sceneCount > 0 ? Math.round((completed / state.sceneCount) * 100) : 0
  const progressClass =
    state.failCount > 0
      ? 'progress has-failures'
      : completed === state.sceneCount && state.sceneCount > 0
        ? 'progress done'
        : 'progress'

  const replay = () => send({ type: 'run:replay', ...(team ? { team } : {}) })

  return (
    <header class={running ? 'running' : ''}>
      <h1>
        <span class="logo">S</span> Scenetest Dashboard
      </h1>
      <button class="replay-all-btn" disabled={running} onClick={replay}>
        ▶ Replay All
      </button>
      <label class="team-select-wrap">
        Team:
        <select value={team} onChange={(e) => setTeam((e.target as HTMLSelectElement).value)}>
          <option value="">all teams</option>
          {state.teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <button onClick={() => send({ type: state.paused ? 'run:resume' : 'run:pause' })}>
        {state.paused ? '▶ Resume' : '❚❚ Pause'}
      </button>
      <button class="stop-btn" onClick={() => send({ type: 'run:stop' })}>
        ■ Stop
      </button>
      <div class="spacer"></div>
      <div class="stats">
        <div class="stat">
          <span class="label">Scenes:</span>
          <span class="value">
            {completed}/{state.sceneCount}
          </span>
        </div>
        <div class="stat pass">
          <span class="label">Pass:</span>
          <span class="value">{state.passCount}</span>
        </div>
        <div class="stat fail">
          <span class="label">Fail:</span>
          <span class="value">{state.failCount}</span>
        </div>
        <div class="stat">
          <span class="label">Time:</span>
          <span class="value">{elapsed}</span>
        </div>
        {state.cancelled ? (
          <div class="stat stopped" title="Run stopped before completing">
            <span class="value">■ stopped</span>
          </div>
        ) : null}
        <div class={'conn ' + state.connection} title={'SSE ' + state.connection}></div>
      </div>
      {state.sceneCount > 0 ? (
        <div class={progressClass}>
          <div class="progress-fill" style={`width:${pct}%`}></div>
        </div>
      ) : null}
    </header>
  )
}

function SceneCard({ scene, send }: { scene: Scene; send: (c: Command) => void }) {
  const [copied, setCopied] = useState(false)
  const statusMark = scene.status === 'completed' ? '✓' : scene.status === 'running' ? '◷' : '✗'

  const copy = () => {
    copyToClipboard(sceneSummary(scene))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div class={'scene ' + (scene.status === 'failed' || scene.status === 'timeout' ? 'failed' : '')}>
      <div class="scene-head">
        <span class={'scene-status ' + scene.status}>{statusMark}</span>
        <span class="scene-name">{scene.name}</span>
        {scene.file ? <span class="scene-file">{scene.file}</span> : null}
        {scene.team?.name ? <span class="scene-team">{scene.team.name}</span> : null}
        {scene.duration != null ? <span class="scene-dur">{scene.duration}ms</span> : null}
        <button class={'copy-btn' + (copied ? ' copied' : '')} title="Copy scene summary" onClick={copy}>
          {copied ? '✓ Copied' : '⧉ Copy'}
        </button>
        {scene.file ? (
          <button class="copy-btn" onClick={() => send({ type: 'run:replay', file: scene.file })}>
            ▶ Replay
          </button>
        ) : null}
      </div>
      <div class="lanes">
        {scene.lanes.map((lane) => (
          <div class="lane" key={lane.actor}>
            <span class="lane-actor">{lane.actor}</span>
            <div class="lane-items">
              {lane.items.map((item, i) => (
                <span class={'pill ' + item.status} title={item.error ?? ''} key={i}>
                  {item.action}
                  {item.target ? <span class="tgt"> {item.target}</span> : null}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {scene.assertions.length > 0 ? (
        <div class="assertions">
          {scene.assertions.map((a, i) => (
            <div class={'assert ' + (a.result ? 'ok' : 'bad')} key={i}>
              <span class="mark">{a.result ? '✓' : '✗'}</span>
              {a.actor ? <span class="who">[{a.actor}]</span> : null}
              <span>{a.description}</span>
            </div>
          ))}
        </div>
      ) : null}
      {scene.error ? <div class="scene-error">{scene.error}</div> : null}
    </div>
  )
}

/** Build the plain-text "copy failures" summary, matching the original dashboard. */
export function sceneSummary(scene: Scene): string {
  const lines: string[] = [`Scene: ${scene.name}`]
  if (scene.file) lines.push(`File: ${scene.file}`)
  if (scene.status) lines.push(`Status: ${scene.status}`)
  if (scene.duration != null) lines.push(`Duration: ${scene.duration}ms`)

  const errs: string[] = []
  for (const lane of scene.lanes) {
    for (const item of lane.items) {
      if (item.error) {
        errs.push(`  ✗ ${item.action}${item.target ? `(${item.target})` : ''} — ${item.error}`)
      }
    }
  }
  if (scene.error && !errs.some((l) => l.includes(scene.error as string))) {
    errs.push(`  ✗ ${scene.error}`)
  }
  if (errs.length > 0) {
    lines.push('', 'Errors:', ...errs)
  }

  const failed = scene.assertions.filter((a) => !a.result)
  if (failed.length > 0) {
    lines.push('', 'Failed assertions:', ...failed.map((a) => `  ✗ [${a.actor ?? ''}] ${a.description}`))
  }
  return lines.join('\n')
}

function copyToClipboard(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
  } else {
    fallbackCopy(text)
  }
}

function fallbackCopy(text: string): void {
  if (typeof document === 'undefined') return
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
  } catch {
    /* ignore */
  }
  document.body.removeChild(ta)
}
