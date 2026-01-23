import { createSignal, createMemo, createEffect, Show } from 'solid-js'
import { pass, fail } from '@mhsnook/scenetest-solid'

function App() {
  // Reactive state
  const [name, setName] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [submitted, setSubmitted] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  // Computed validation
  const isValidEmail = createMemo(() => {
    return email().includes('@') && email().includes('.')
  })

  const isValidName = createMemo(() => {
    return name().trim().length >= 2
  })

  // Inline assertions - these run on every render
  pass('App component rendered', true)

  // Reactive assertions using createEffect
  createEffect(() => {
    if (name().length > 0) {
      pass('Name validation runs when name changes', true, { name: name(), isValid: isValidName() })
    }
  })

  createEffect(() => {
    if (email().length > 0) {
      pass('Email validation runs when email changes', true, { email: email(), isValid: isValidEmail() })
    }
  })

  function handleSubmit(e: Event) {
    e.preventDefault()
    setError(null)

    // Validate
    if (!isValidName()) {
      setError('Name must be at least 2 characters')
      fail('Form submitted with invalid name', true, { name: name() })
      return
    }

    if (!isValidEmail()) {
      setError('Please enter a valid email')
      fail('Form submitted with invalid email', true, { email: email() })
      return
    }

    // Success
    setSubmitted(true)
    pass('Form submitted successfully', true, {
      name: name(),
      email: email(),
    })
  }

  function reset() {
    setName('')
    setEmail('')
    setSubmitted(false)
    setError(null)
    pass('Form reset', true)
  }

  return (
    <div class="container">
      <h1>Solid + Scenetest Example</h1>

      <Show
        when={!submitted()}
        fallback={
          <div class="success">
            <p>Thanks, {name()}! We'll contact you at {email()}.</p>
            <button onClick={reset}>Start Over</button>
          </div>
        }
      >
        <form onSubmit={handleSubmit}>
          <div class="field">
            <label for="name">Name</label>
            <input
              id="name"
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Enter your name"
              data-testid="name-input"
            />
            <Show when={name() && !isValidName()}>
              <span class="hint">Name must be at least 2 characters</span>
            </Show>
          </div>

          <div class="field">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              placeholder="Enter your email"
              data-testid="email-input"
            />
            <Show when={email() && !isValidEmail()}>
              <span class="hint">Please enter a valid email</span>
            </Show>
          </div>

          <Show when={error()}>
            <div class="error" data-testid="error">
              {error()}
            </div>
          </Show>

          <button
            type="submit"
            disabled={!isValidName() || !isValidEmail()}
            data-testid="submit-button"
          >
            Submit
          </button>
        </form>
      </Show>

      <div class="debug">
        <details>
          <summary>Debug State</summary>
          <pre>
            {JSON.stringify(
              {
                name: name(),
                email: email(),
                isValidName: isValidName(),
                isValidEmail: isValidEmail(),
                submitted: submitted(),
                error: error(),
              },
              null,
              2
            )}
          </pre>
        </details>
      </div>

      <style>{`
        .container {
          max-width: 400px;
          margin: 40px auto;
          padding: 20px;
          font-family: system-ui, -apple-system, sans-serif;
        }

        h1 {
          margin-bottom: 24px;
          color: #2c4f7c;
        }

        .field {
          margin-bottom: 16px;
        }

        label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
        }

        input {
          width: 100%;
          padding: 8px 12px;
          font-size: 16px;
          border: 1px solid #ccc;
          border-radius: 4px;
          box-sizing: border-box;
        }

        input:focus {
          outline: none;
          border-color: #2c4f7c;
        }

        .hint {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #e53e3e;
        }

        .error {
          padding: 8px 12px;
          margin-bottom: 16px;
          background: #fed7d7;
          color: #c53030;
          border-radius: 4px;
        }

        .success {
          padding: 16px;
          background: #c6f6d5;
          color: #276749;
          border-radius: 8px;
          text-align: center;
        }

        .success button {
          margin-top: 12px;
        }

        button {
          padding: 10px 20px;
          font-size: 16px;
          color: white;
          background: #2c4f7c;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }

        button:disabled {
          background: #a0aec0;
          cursor: not-allowed;
        }

        button:hover:not(:disabled) {
          background: #1e3a5f;
        }

        .debug {
          margin-top: 24px;
        }

        .debug summary {
          cursor: pointer;
          color: #718096;
        }

        .debug pre {
          margin-top: 8px;
          padding: 12px;
          background: #1a202c;
          color: #e2e8f0;
          border-radius: 8px;
          font-size: 12px;
          overflow: auto;
        }
      `}</style>
    </div>
  )
}

export default App
