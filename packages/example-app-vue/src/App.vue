<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { should, failed } from '@scenetest/checks-vue'

// Reactive state
const name = ref('')
const email = ref('')
const submitted = ref(false)
const error = ref<string | null>(null)

// Computed validation
const isValidEmail = computed(() => {
  return email.value.includes('@') && email.value.includes('.')
})

const isValidName = computed(() => {
  return name.value.trim().length >= 2
})

// Inline assertions - these run on every render
should('App component should render', true)

// Watch for validation state changes
watch([name, email], () => {
  // Assert validation logic is working
  if (name.value.length > 0) {
    should('name validation should run when name changes', true, { name: name.value, isValid: isValidName.value })
  }
  if (email.value.length > 0) {
    should('email validation should run when email changes', true, { email: email.value, isValid: isValidEmail.value })
  }
})

function handleSubmit() {
  error.value = null

  // Validate
  if (!isValidName.value) {
    error.value = 'Name must be at least 2 characters'
    failed('form submitted with invalid name', { name: name.value })
    return
  }

  if (!isValidEmail.value) {
    error.value = 'Please enter a valid email'
    failed('form submitted with invalid email', { email: email.value })
    return
  }

  // Success
  submitted.value = true
  should('form should submit successfully', true, {
    name: name.value,
    email: email.value,
  })
}

function reset() {
  name.value = ''
  email.value = ''
  submitted.value = false
  error.value = null
  should('form should reset', true)
}
</script>

<template>
  <div class="container">
    <h1>Vue + Scenetest Example</h1>

    <div v-if="submitted" class="success">
      <p>Thanks, {{ name }}! We'll contact you at {{ email }}.</p>
      <button @click="reset">Start Over</button>
    </div>

    <form v-else @submit.prevent="handleSubmit">
      <div class="field">
        <label for="name">Name</label>
        <input
          id="name"
          v-model="name"
          type="text"
          placeholder="Enter your name"
          data-testid="name-input"
        />
        <span v-if="name && !isValidName" class="hint">
          Name must be at least 2 characters
        </span>
      </div>

      <div class="field">
        <label for="email">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          placeholder="Enter your email"
          data-testid="email-input"
        />
        <span v-if="email && !isValidEmail" class="hint">
          Please enter a valid email
        </span>
      </div>

      <div v-if="error" class="error" data-testid="error">
        {{ error }}
      </div>

      <button
        type="submit"
        :disabled="!isValidName || !isValidEmail"
        data-testid="submit-button"
      >
        Submit
      </button>
    </form>

    <div class="debug">
      <details>
        <summary>Debug State</summary>
        <pre>{{ JSON.stringify({ name, email, isValidName, isValidEmail, submitted, error }, null, 2) }}</pre>
      </details>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 400px;
  margin: 40px auto;
  padding: 20px;
  font-family: system-ui, -apple-system, sans-serif;
}

h1 {
  margin-bottom: 24px;
  color: #42b883;
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
  border-color: #42b883;
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
  background: #42b883;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

button:disabled {
  background: #a0aec0;
  cursor: not-allowed;
}

button:hover:not(:disabled) {
  background: #38a169;
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
