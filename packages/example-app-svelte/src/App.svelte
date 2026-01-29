<script lang="ts">
  import { should, failed } from '@scenecheck/checks-svelte'

  // Reactive state using Svelte 5 runes
  let name = $state('')
  let email = $state('')
  let submitted = $state(false)
  let error = $state<string | null>(null)

  // Derived validation
  let isValidEmail = $derived(email.includes('@') && email.includes('.'))
  let isValidName = $derived(name.trim().length >= 2)

  // Inline assertion - runs on mount
  should('App component should render', true)

  // Reactive assertions using $effect
  $effect(() => {
    if (name.length > 0) {
      should('name validation should run when name changes', true, { name, isValid: isValidName })
    }
  })

  $effect(() => {
    if (email.length > 0) {
      should('email validation should run when email changes', true, { email, isValid: isValidEmail })
    }
  })

  function handleSubmit(e: Event) {
    e.preventDefault()
    error = null

    // Validate
    if (!isValidName) {
      error = 'Name must be at least 2 characters'
      failed('form submitted with invalid name', { name })
      return
    }

    if (!isValidEmail) {
      error = 'Please enter a valid email'
      failed('form submitted with invalid email', { email })
      return
    }

    // Success
    submitted = true
    should('form should submit successfully', true, { name, email })
  }

  function reset() {
    name = ''
    email = ''
    submitted = false
    error = null
    should('form should reset', true)
  }
</script>

<div class="container">
  <h1>Svelte + Scenecheck Example</h1>

  {#if submitted}
    <div class="success">
      <p>Thanks, {name}! We'll contact you at {email}.</p>
      <button onclick={reset}>Start Over</button>
    </div>
  {:else}
    <form onsubmit={handleSubmit}>
      <div class="field">
        <label for="name">Name</label>
        <input
          id="name"
          type="text"
          bind:value={name}
          placeholder="Enter your name"
          data-testid="name-input"
        />
        {#if name && !isValidName}
          <span class="hint">Name must be at least 2 characters</span>
        {/if}
      </div>

      <div class="field">
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="Enter your email"
          data-testid="email-input"
        />
        {#if email && !isValidEmail}
          <span class="hint">Please enter a valid email</span>
        {/if}
      </div>

      {#if error}
        <div class="error" data-testid="error">
          {error}
        </div>
      {/if}

      <button
        type="submit"
        disabled={!isValidName || !isValidEmail}
        data-testid="submit-button"
      >
        Submit
      </button>
    </form>
  {/if}

  <div class="debug">
    <details>
      <summary>Debug State</summary>
      <pre>{JSON.stringify({ name, email, isValidName, isValidEmail, submitted, error }, null, 2)}</pre>
    </details>
  </div>
</div>

<style>
  .container {
    max-width: 400px;
    margin: 40px auto;
    padding: 20px;
    font-family: system-ui, -apple-system, sans-serif;
  }

  h1 {
    margin-bottom: 24px;
    color: #ff3e00;
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
    border-color: #ff3e00;
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
    background: #ff3e00;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  button:disabled {
    background: #a0aec0;
    cursor: not-allowed;
  }

  button:hover:not(:disabled) {
    background: #d63600;
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
</style>
