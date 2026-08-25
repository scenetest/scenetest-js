import { describe, it, expect } from 'vitest'
import type { Locator } from 'playwright'
import { waitForNewToast } from '../toast.js'

// ---------------------------------------------------------------------------
// Helpers — a fake DOM just rich enough for the in-page claim function
// ---------------------------------------------------------------------------

interface FakeElement {
  visible: boolean
  getClientRects(): unknown[]
  ownerDocument: { defaultView: { getComputedStyle(el: FakeElement): { visibility: string } } }
}

function element(visible = true): FakeElement {
  const el: FakeElement = {
    visible,
    getClientRects: () => (el.visible ? [{}] : []),
    ownerDocument: {
      defaultView: {
        getComputedStyle: (target: FakeElement) => ({ visibility: target.visible ? 'visible' : 'hidden' }),
      },
    },
  }
  return el
}

/**
 * A Locator stub whose `evaluateAll` runs the page function in Node against
 * `elements`. Returns the locator plus the live array, so a test can mount
 * and unmount toasts between polls.
 */
function fakeLocator(elements: FakeElement[] = []) {
  let calls = 0
  const locator = {
    evaluateAll: async (fn: (els: unknown[], arg: string) => unknown, arg: string) => {
      calls++
      return fn(elements, arg)
    },
    get calls() {
      return calls
    },
  }
  return { locator: locator as unknown as Locator, elements, stub: locator }
}

const CLAIMED = '__scenetestToastClaimed'

describe('waitForNewToast', () => {
  it('resolves on a visible toast, without waiting for it to dismiss', async () => {
    const toast = element()
    const { locator } = fakeLocator([toast])

    await waitForNewToast(locator, 'toast-success', 500)

    // Still on screen — the assertion did not depend on dismissal
    expect(toast.visible).toBe(true)
    expect((toast as unknown as Record<string, unknown>)[CLAIMED]).toBe(true)
  })

  it('claims each toast once, so a second step needs a second toast', async () => {
    const first = element()
    const { locator, elements } = fakeLocator([first])

    await waitForNewToast(locator, 'toast-success', 500)

    // The same toast, still visible, must not satisfy the next step
    await expect(waitForNewToast(locator, 'toast-success', 100)).rejects.toThrow(
      /no new toast appeared.*already claimed it/s
    )

    // A fresh element — what a toast library mounts for the next toast — does
    elements.push(element())
    await waitForNewToast(locator, 'toast-success', 500)
  })

  it('claims a toast that appears after the first poll', async () => {
    const { locator, elements } = fakeLocator([])
    setTimeout(() => elements.push(element()), 60)

    await waitForNewToast(locator, 'toast-success', 2000)

    expect((elements[0] as unknown as Record<string, unknown>)[CLAIMED]).toBe(true)
  })

  it('reports that no toast appeared when nothing matches', async () => {
    const { locator } = fakeLocator([])

    await expect(waitForNewToast(locator, 'toast-success', 100)).rejects.toThrow(
      "seeToast 'toast-success': no toast appeared within 100ms."
    )
  })

  it('ignores elements that are mounted but not visible', async () => {
    const { locator } = fakeLocator([element(false)])

    await expect(waitForNewToast(locator, 'toast-success', 100)).rejects.toThrow(/no toast appeared/)
  })

  it('polls until the timeout, then throws', async () => {
    const { locator, stub } = fakeLocator([])

    await expect(waitForNewToast(locator, 'toast-success', 150)).rejects.toThrow()

    expect(stub.calls).toBeGreaterThan(1)
  })
})
