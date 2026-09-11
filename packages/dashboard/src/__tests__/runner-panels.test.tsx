// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { ListPane, Detail, rollupFile, type Selection } from '../runner.js'
import type { RunnerScene } from '../select-runner.js'
import type { Lane } from '../types.js'

/**
 * The Runner is two panes: the list pane selects a scene OR a file, and the
 * detail pane renders whichever kind is selected — a scene with its actor
 * lanes, or a file overview. Replay is reachable from both.
 */

function scene(
  name: string,
  file: string,
  status: string,
  checks: [boolean, string][] = [],
  lanes: Lane[] = []
): RunnerScene {
  return {
    id: `${file}:${name}`,
    name,
    file,
    status,
    duration: status === 'running' ? null : 5,
    error: status === 'failed' ? 'boom' : null,
    team: {},
    teamIndex: 0,
    actors: ['a'],
    assertions: checks.map(([result, description]) => ({ result, description, actor: 'a', timestamp: 0 })),
    timeline: [],
    lanes,
  }
}

const FILTERS = { text: '', statuses: new Set(['failed', 'timeout', 'running', 'completed']), groupBy: 'file' as const }

function mountList(scenes: RunnerScene[], onSelect = vi.fn(), onReplay = vi.fn()): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  act(() => {
    render(
      <ListPane
        scenes={scenes}
        filters={FILTERS}
        onFilters={() => {}}
        selected={null}
        onSelect={onSelect}
        onReplay={onReplay}
        runId="live"
      />,
      root
    )
  })
  return root
}

function mountDetail(selection: Selection, scenes: RunnerScene[], onSelect = vi.fn(), onReplay = vi.fn()): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  act(() => {
    render(
      <Detail selection={selection} scenes={scenes} base="/__scenetest" onSelect={onSelect} onReplay={onReplay} />,
      root
    )
  })
  return root
}

describe('Runner list pane: scene + file selection', () => {
  it('clicking a scene row selects that scene', () => {
    const onSelect = vi.fn()
    const root = mountList([scene('a', 'one.spec.md', 'completed')], onSelect)
    const row = root.querySelector('.row') as HTMLElement
    act(() => row.click())
    expect(onSelect).toHaveBeenCalledWith({ kind: 'scene', id: 'one.spec.md:a' })
  })

  it('clicking a file heading selects the file', () => {
    const onSelect = vi.fn()
    const root = mountList([scene('a', 'one.spec.md', 'completed')], onSelect)
    const header = root.querySelector('.group-header.file-header') as HTMLElement
    act(() => header.click())
    expect(onSelect).toHaveBeenCalledWith({ kind: 'file', file: 'one.spec.md' })
  })

  it('clicking a row file cell selects the file, not the scene', () => {
    const onSelect = vi.fn()
    const root = mountList([scene('a', 'one.spec.md', 'completed')], onSelect)
    const cell = root.querySelector('.row .file') as HTMLElement
    act(() => cell.click())
    expect(onSelect).toHaveBeenCalledWith({ kind: 'file', file: 'one.spec.md' })
  })

  it('the file heading replay button replays the file', () => {
    const onReplay = vi.fn()
    const root = mountList([scene('a', 'one.spec.md', 'completed')], vi.fn(), onReplay)
    const btn = root.querySelector('.group-header .gh-replay') as HTMLElement
    act(() => btn.click())
    expect(onReplay).toHaveBeenCalledWith('one.spec.md')
  })
})

describe('Runner detail pane', () => {
  it('renders scene detail with actor lanes and a replay button', () => {
    const lanes: Lane[] = [
      { actor: 'alice', items: [{ action: 'click', target: 'save', startTime: 0, endTime: 1, duration: 5, error: null, status: 'success' }] },
    ]
    const s = scene('a', 'one.spec.md', 'failed', [[false, 'must be visible']], lanes)
    const onReplay = vi.fn()
    const root = mountDetail({ kind: 'scene', id: s.id }, [s], vi.fn(), onReplay)
    expect(root.textContent).toContain('must be visible')
    // Lane pill rendered.
    expect(root.querySelector('.lanes .lane-actor')?.textContent).toBe('alice')
    expect(root.querySelector('.lanes .pill')?.textContent).toContain('click')
    const btn = root.querySelector('.btn.replay') as HTMLElement
    act(() => btn.click())
    expect(onReplay).toHaveBeenCalledWith('one.spec.md')
  })

  it('renders file overview with its scenes and replay', () => {
    const scenes = [
      scene('a', 'one.spec.md', 'completed', [[true, 'ok']]),
      scene('b', 'one.spec.md', 'failed', [[false, 'nope']]),
      scene('c', 'other.spec.md', 'completed'),
    ]
    const onSelect = vi.fn()
    const onReplay = vi.fn()
    const root = mountDetail({ kind: 'file', file: 'one.spec.md' }, scenes, onSelect, onReplay)
    expect(root.querySelectorAll('.file-scene').length).toBe(2)
    const first = root.querySelector('.file-scene') as HTMLElement
    act(() => first.click())
    expect(onSelect).toHaveBeenCalledWith({ kind: 'scene', id: 'one.spec.md:a' })
    const btn = root.querySelector('.btn.replay') as HTMLElement
    act(() => btn.click())
    expect(onReplay).toHaveBeenCalledWith('one.spec.md')
  })

  it('rollupFile aggregates only the file\'s scenes', () => {
    const scenes = [
      scene('a', 'one.spec.md', 'completed', [[true, 'ok']]),
      scene('b', 'one.spec.md', 'failed', [[false, 'nope']]),
      scene('c', 'other.spec.md', 'completed'),
    ]
    const roll = rollupFile('one.spec.md', scenes)
    expect(roll.scenes.length).toBe(2)
    expect(roll.passed).toBe(1)
    expect(roll.failed).toBe(1)
    expect(roll.checks).toEqual({ total: 2, failed: 1 })
  })
})
