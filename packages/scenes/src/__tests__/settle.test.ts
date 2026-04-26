import { describe, it, expect, vi } from 'vitest'
import { settle } from '../settle.js'

describe('settle', () => {
  it('calls page.evaluate to flush the render queue', async () => {
    const evaluate = vi.fn().mockResolvedValue(undefined)
    const page = { evaluate } as unknown as Parameters<typeof settle>[0]

    await settle(page)

    expect(evaluate).toHaveBeenCalledTimes(1)
    // The function passed in must reference requestAnimationFrame so that
    // pending React renders + TanStack DB derived queries get a chance to
    // commit before the next action runs.
    const fn = evaluate.mock.calls[0][0] as () => unknown
    expect(typeof fn).toBe('function')
    expect(fn.toString()).toContain('requestAnimationFrame')
  })

  it('swallows errors from page.evaluate (e.g. page closed mid-flush)', async () => {
    const page = {
      evaluate: vi.fn().mockRejectedValue(new Error('Target page, context or browser has been closed')),
    } as unknown as Parameters<typeof settle>[0]

    await expect(settle(page)).resolves.toBeUndefined()
  })
})
