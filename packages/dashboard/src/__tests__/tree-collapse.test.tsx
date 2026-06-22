// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { Tree } from '../runner.js'
import type { RunnerScene } from '../select-runner.js'

/**
 * The Runner sidebar tree folds a file's scenes once the file finishes (none of
 * its scenes still running), and a click on the file header overrides that.
 */

function scene(name: string, file: string, status: string): RunnerScene {
  return {
    id: `${file}:${name}`,
    name,
    file,
    status,
    duration: status === 'running' ? null : 5,
    error: null,
    team: {},
    teamIndex: 0,
    actors: ['a'],
    assertions: [],
    timeline: [],
  }
}

function mount(scenes: RunnerScene[]): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  act(() => {
    render(<Tree scenes={scenes} selected={null} onSelect={() => {}} />, root)
  })
  return root
}

function group(root: HTMLElement, file: string): Element {
  const el = [...root.querySelectorAll('.tree-file')].find((f) => f.getAttribute('title') === file)
  if (!el) throw new Error(`no tree-file for ${file}`)
  return el.closest('.tree-group')!
}

describe('Runner sidebar: files fold when they finish', () => {
  it('keeps a file with a running scene expanded', () => {
    const root = mount([scene('a', 'one.spec.md', 'completed'), scene('b', 'one.spec.md', 'running')])
    const g = group(root, 'one.spec.md')
    expect(g.classList.contains('collapsed')).toBe(false)
    expect(g.querySelectorAll('.tree-scene').length).toBe(2)
  })

  it('auto-folds a file once all its scenes have settled', () => {
    const root = mount([scene('a', 'done.spec.md', 'completed'), scene('b', 'done.spec.md', 'failed')])
    const g = group(root, 'done.spec.md')
    expect(g.classList.contains('collapsed')).toBe(true)
    expect(g.querySelectorAll('.tree-scene').length).toBe(0)
  })

  it('folds each file independently', () => {
    const root = mount([scene('a', 'done.spec.md', 'completed'), scene('b', 'live.spec.md', 'running')])
    expect(group(root, 'done.spec.md').classList.contains('collapsed')).toBe(true)
    expect(group(root, 'live.spec.md').classList.contains('collapsed')).toBe(false)
  })

  it('clicking a finished file header expands it (manual override)', () => {
    const root = mount([scene('a', 'done.spec.md', 'completed')])
    const header = group(root, 'done.spec.md').querySelector('.tree-file') as HTMLElement
    act(() => header.click())
    const g = group(root, 'done.spec.md')
    expect(g.classList.contains('collapsed')).toBe(false)
    expect(g.querySelectorAll('.tree-scene').length).toBe(1)
  })

  it('clicking a running file header collapses it (manual override)', () => {
    const root = mount([scene('a', 'live.spec.md', 'running')])
    const header = group(root, 'live.spec.md').querySelector('.tree-file') as HTMLElement
    act(() => header.click())
    expect(group(root, 'live.spec.md').classList.contains('collapsed')).toBe(true)
  })
})
