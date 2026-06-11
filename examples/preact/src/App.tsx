import { useState } from 'preact/hooks'
import { should, failed, useCheck } from '@scenetest/checks/preact'

export default function App() {
  // Local state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Derived validation
  const isValidName = name.trim().length >= 2
  const isValidEmail = email.includes('@') && email.includes('.')

  // Inline assertion - runs on every render
  should('App component should render', true)

  // Reactive assertions wrapped in useCheck (stripped in production)
  useCheck(() => {
    if (name.length > 0) {
      should('name validation should run when name changes', true, { name, isValidName })
    }
  }, [name])

  useCheck(() => {
    if (email.length > 0) {
      should('email validation should run when email changes', true, { email, isValidEmail })
    }
  }, [email])

  function handleSubmit(e: Event) {
    e.preventDefault()
    setError(null)

    if (!isValidName) {
      setError('Name must be at least 2 characters')
      failed('form submitted with invalid name', { name })
      return
    }

    if (!isValidEmail) {
      setError('Please enter a valid email')
      failed('form submitted with invalid email', { email })
      return
    }

    setSubmitted(true)
    should('form should submit successfully', true, { name, email })
  }

  function reset() {
    setName('')
    setEmail('')
    setSubmitted(false)
    setError(null)
    should('form should reset', true)
  }

  return (
    <div class="container">
      <h1>Preact + Scenetest Example</h1>

      {submitted ? (
        <div class="success">
          <p>
            Thanks, {name}! We'll contact you at {email}.
          </p>
          <button onClick={reset}>Start Over</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div class="field">
            <label for="name">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              placeholder="Enter your name"
              data-testid="name-input"
            />
            {name && !isValidName && (
              <span class="hint">Name must be at least 2 characters</span>
            )}
          </div>

          <div class="field">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder="Enter your email"
              data-testid="email-input"
            />
            {email && !isValidEmail && (
              <span class="hint">Please enter a valid email</span>
            )}
          </div>

          {error && (
            <div class="error" data-testid="error">
              {error}
            </div>
          )}

          <button type="submit" disabled={!isValidName || !isValidEmail} data-testid="submit-button">
            Submit
          </button>
        </form>
      )}

      <div class="debug">
        <details>
          <summary>Debug State</summary>
          <pre>
            {JSON.stringify({ name, email, isValidName, isValidEmail, submitted, error }, null, 2)}
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
          color: #673ab8;
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
          border-color: #673ab8;
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
          background: #673ab8;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }

        button:disabled {
          background: #a0aec0;
          cursor: not-allowed;
        }

        button:hover:not(:disabled) {
          background: #563098;
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
