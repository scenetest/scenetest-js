import { Component, createSignal, onMount } from 'solid-js'
import { should, failed } from '@scenetest/core'

const Demo: Component = () => {
  const [count, setCount] = createSignal(0)
  const [inputValue, setInputValue] = createSignal('')
  const [isValid, setIsValid] = createSignal(true)

  // Run some assertions when the component mounts
  onMount(() => {
    should('demo page loaded successfully', true)
    should('initial count is zero', count() === 0)
  })

  const handleIncrement = () => {
    const newCount = count() + 1
    setCount(newCount)
    should('count incremented', newCount > 0, { previousCount: newCount - 1, newCount })
  }

  const handleDecrement = () => {
    const newCount = count() - 1
    setCount(newCount)

    if (newCount < 0) {
      failed('count should not go negative', { count: newCount })
    } else {
      should('count decremented safely', newCount >= 0, { count: newCount })
    }
  }

  const handleInputChange = (e: Event) => {
    const value = (e.target as HTMLInputElement).value
    setInputValue(value)

    const valid = value.length >= 3 || value.length === 0
    setIsValid(valid)

    if (value.length > 0) {
      should('input has content', value.length > 0, { value })

      if (!valid) {
        failed('input should be at least 3 characters', { value, length: value.length })
      } else {
        should('input meets minimum length', valid, { value, length: value.length })
      }
    }
  }

  const runBatchAssertions = () => {
    should('batch test 1: true is true', true)
    should('batch test 2: 1 + 1 = 2', 1 + 1 === 2)
    should('batch test 3: string contains', 'hello world'.includes('world'))
    failed('batch test 4: intentional failure example', { reason: 'demonstrating failed()' })
    should('batch test 5: array has length', [1, 2, 3].length === 3)
  }

  return (
    <article class="page demo">
      <h1>Live Demo</h1>
      <p class="lead">
        This page demonstrates the real Scenetest observer panel. Interact with the
        components below to see assertions appear in the panel.
      </p>

      <div class="demo-grid">
        <section class="demo-section">
          <h2>Counter</h2>
          <p>Click the buttons to see assertions triggered on state changes.</p>
          <div class="demo-controls">
            <button onClick={handleDecrement}>-</button>
            <span class="demo-count">{count()}</span>
            <button onClick={handleIncrement}>+</button>
          </div>
          <p class="demo-hint">
            Try clicking "-" when count is 0 to see a <code>failed()</code> assertion.
          </p>
        </section>

        <section class="demo-section">
          <h2>Input Validation</h2>
          <p>Type in the input to see validation assertions.</p>
          <input
            type="text"
            value={inputValue()}
            onInput={handleInputChange}
            placeholder="Type at least 3 characters..."
            class={isValid() ? '' : 'invalid'}
          />
          <p class="demo-hint">
            Input must be at least 3 characters to pass validation.
          </p>
        </section>

        <section class="demo-section full-width">
          <h2>Batch Assertions</h2>
          <p>Click to run multiple assertions at once (they'll be grouped in the panel).</p>
          <button onClick={runBatchAssertions}>Run 5 Assertions</button>
        </section>
      </div>

      <section class="demo-explanation">
        <h2>What You're Seeing</h2>
        <p>
          The floating panel in the bottom-right corner is the <strong>Scenetest Observer</strong>.
          It displays all assertions from <code>should()</code> and <code>failed()</code> calls
          in real-time.
        </p>
        <ul>
          <li>Assertions are grouped by timing (within 50ms)</li>
          <li>Click a group to expand and see individual assertions</li>
          <li>Click an assertion to open the fullscreen view</li>
          <li>Use the filter buttons to show only passes or failures</li>
        </ul>
        <p>
          This is the exact same panel you'll see during development when using the
          <code>@scenetest/vite-plugin</code>. No mock, no recreation — it's the real thing.
        </p>
      </section>
    </article>
  )
}

export default Demo
