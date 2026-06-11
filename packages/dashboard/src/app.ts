import { h } from 'preact'
import { useEffect, useReducer, useState } from 'preact/hooks'
import htm from 'htm'
import type { Command, RunEvent } from '@scenetest/protocol'
import { applyEvent, completedSceneCount, initialState, withConnection } from './store.js'
import type { ConnectionStatus, DashboardState, Scene, Transport } from './types.js'

const html = htm.bind(h)

type Action = { kind: 'event'; event: RunEvent } | { kind: 'status'; status: ConnectionStatus }

function reducer(state: DashboardState, action: Action): DashboardState {
  return action.kind === 'event'
    ? applyEvent(state, action.event)
    : withConnection(state, action.status)
}

/**
 * The dashboard root. Owns the folded state, drives it from the transport,
 * and turns header controls into protocol commands. The same component
 * renders in dev and cloud — only the injected `transport` differs.
 */
export function Dashboard({ transport }: { transport: Transport }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  useEffect(() => {
    let alive = true
    transport.fetchState().then((events) => {
      if (!alive) return
      for (const event of events) dispatch({ kind: 'event', event })
    })
    const unsubscribe = transport.subscribe(
      (event) => dispatch({ kind: 'event', event }),
      (status) => dispatch({ kind: 'status', status })
    )
    return () => {
      alive = false
      unsubscribe()
    }
  }, [transport])

  const send = (command: Command) => {
    void transport.sendCommand(command)
  }

  return html`
    <div class="root">
      ${Header({ state, send })}
      <main>
        ${state.scenes.length === 0
          ? html`<div class="waiting">
              <h2>Waiting for scene run…</h2>
              <p>Run <code>scenetest</code> to see the live timeline here.</p>
            </div>`
          : state.scenes.map((scene, i) => SceneCard({ scene, index: i, send }))}
      </main>
    </div>
  `
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

  return html`
    <header class=${running ? 'running' : ''}>
      <h1><span class="logo">S</span> Scenetest Dashboard</h1>
      <button class="replay-all-btn" disabled=${running} onClick=${replay}>▶ Replay All</button>
      <label class="team-select-wrap">
        Team:
        <select
          value=${team}
          onChange=${(e: Event) => setTeam((e.target as HTMLSelectElement).value)}
        >
          <option value="">all teams</option>
          ${state.teams.map((t) => html`<option value=${t}>${t}</option>`)}
        </select>
      </label>
      <button onClick=${() => send({ type: 'run:pause' })}>❚❚ Pause</button>
      <button class="stop-btn" onClick=${() => send({ type: 'run:stop' })}>■ Stop</button>
      <div class="spacer"></div>
      <div class="stats">
        <div class="stat"><span class="label">Scenes:</span><span class="value">${completed}/${state.sceneCount}</span></div>
        <div class="stat pass"><span class="label">Pass:</span><span class="value">${state.passCount}</span></div>
        <div class="stat fail"><span class="label">Fail:</span><span class="value">${state.failCount}</span></div>
        <div class="stat"><span class="label">Time:</span><span class="value">${elapsed}</span></div>
        <div
          class=${'conn ' + state.connection}
          title=${'SSE ' + state.connection}
        ></div>
      </div>
      ${state.sceneCount > 0
        ? html`<div class=${progressClass}><div class="progress-fill" style=${`width:${pct}%`}></div></div>`
        : null}
    </header>
  `
}

function SceneCard({
  scene,
  index,
  send,
}: {
  scene: Scene
  index: number
  send: (c: Command) => void
}) {
  const [copied, setCopied] = useState(false)
  const statusMark =
    scene.status === 'completed' ? '✓' : scene.status === 'running' ? '◷' : '✗'

  const copy = () => {
    copyToClipboard(sceneSummary(scene))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return html`
    <div class=${'scene ' + (scene.status === 'failed' || scene.status === 'timeout' ? 'failed' : '')}>
      <div class="scene-head">
        <span class=${'scene-status ' + scene.status}>${statusMark}</span>
        <span class="scene-name">${scene.name}</span>
        ${scene.file ? html`<span class="scene-file">${scene.file}</span>` : null}
        ${scene.team?.name ? html`<span class="scene-team">${scene.team.name}</span>` : null}
        ${scene.duration != null ? html`<span class="scene-dur">${scene.duration}ms</span>` : null}
        <button
          class=${'copy-btn' + (copied ? ' copied' : '')}
          title="Copy scene summary"
          onClick=${copy}
        >
          ${copied ? '✓ Copied' : '⧉ Copy'}
        </button>
        ${scene.file
          ? html`<button
              class="copy-btn"
              onClick=${() => send({ type: 'run:replay', file: scene.file })}
            >▶ Replay</button>`
          : null}
      </div>
      <div class="lanes">
        ${scene.lanes.map(
          (lane) => html`
            <div class="lane">
              <span class="lane-actor">${lane.actor}</span>
              <div class="lane-items">
                ${lane.items.map(
                  (item) => html`
                    <span class=${'pill ' + item.status} title=${item.error ?? ''}>
                      ${item.action}${item.target
                        ? html`<span class="tgt"> ${item.target}</span>`
                        : null}
                    </span>
                  `
                )}
              </div>
            </div>
          `
        )}
      </div>
      ${scene.assertions.length > 0
        ? html`<div class="assertions">
            ${scene.assertions.map(
              (a) => html`
                <div class=${'assert ' + (a.result ? 'ok' : 'bad')}>
                  <span class="mark">${a.result ? '✓' : '✗'}</span>
                  ${a.actor ? html`<span class="who">[${a.actor}]</span>` : null}
                  <span>${a.description}</span>
                </div>
              `
            )}
          </div>`
        : null}
      ${scene.error ? html`<div class="scene-error">${scene.error}</div>` : null}
    </div>
  `
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
