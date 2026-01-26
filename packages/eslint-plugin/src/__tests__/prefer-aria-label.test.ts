import { describe, it, expect } from 'vitest'
import { RuleTester } from 'eslint'
import rule from '../rules/prefer-aria-label.js'

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
})

/** Helper: build the two suggestions that every string-valued data-testid produces */
function suggestions(value: string, code: string) {
  return [
    {
      messageId: 'addAriaLabel' as const,
      data: { value },
      output: code.replace(
        `data-testid="${value}"`,
        `data-testid="${value}" aria-label="${value}"`
      ),
    },
    {
      messageId: 'replaceWithAriaLabel' as const,
      data: { value },
      output: code.replace(`data-testid="${value}"`, `aria-label="${value}"`),
    },
  ]
}

describe('prefer-aria-label', () => {
  ruleTester.run('prefer-aria-label', rule, {
    valid: [
      // No data-testid at all
      '<button>Click me</button>',
      // data-testid on non-interactive element (div)
      '<div data-testid="wrapper">content</div>',
      // data-testid on non-interactive element (span)
      '<span data-testid="label">text</span>',
      // Interactive element with both data-testid and aria-label
      '<button data-testid="submit" aria-label="Submit form">Go</button>',
      // Interactive element with aria-labelledby (also acceptable)
      '<button data-testid="submit" aria-labelledby="label-id">Go</button>',
      // Input with aria-label already present
      '<input data-testid="email" aria-label="Email address" />',
      // Link with aria-label
      '<a data-testid="home-link" aria-label="Home" href="/">Home</a>',
      // Non-interactive element with onClick but has aria-label
      '<div data-testid="card" onClick={handleClick} aria-label="Open card">content</div>',
      // Element with role but has aria-label
      '<div role="button" data-testid="toggle" aria-label="Toggle menu">☰</div>',
    ],

    invalid: [
      // Button with data-testid, no aria-label
      {
        code: '<button data-testid="submit-btn">Submit</button>',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<button>' },
            suggestions: suggestions(
              'submit-btn',
              '<button data-testid="submit-btn">Submit</button>'
            ),
          },
        ],
      },
      // Link with data-testid, no aria-label
      {
        code: '<a data-testid="nav-home" href="/">Home</a>',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<a>' },
            suggestions: suggestions(
              'nav-home',
              '<a data-testid="nav-home" href="/">Home</a>'
            ),
          },
        ],
      },
      // Input with data-testid, no aria-label
      {
        code: '<input data-testid="email-input" type="email" />',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<input>' },
            suggestions: suggestions(
              'email-input',
              '<input data-testid="email-input" type="email" />'
            ),
          },
        ],
      },
      // Select with data-testid
      {
        code: '<select data-testid="country-select"><option>US</option></select>',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<select>' },
            suggestions: suggestions(
              'country-select',
              '<select data-testid="country-select"><option>US</option></select>'
            ),
          },
        ],
      },
      // Textarea with data-testid
      {
        code: '<textarea data-testid="comment-box" />',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<textarea>' },
            suggestions: suggestions(
              'comment-box',
              '<textarea data-testid="comment-box" />'
            ),
          },
        ],
      },
      // Div with onClick (interactive via handler)
      {
        code: '<div data-testid="clickable-card" onClick={handleClick}>content</div>',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<div>' },
            suggestions: suggestions(
              'clickable-card',
              '<div data-testid="clickable-card" onClick={handleClick}>content</div>'
            ),
          },
        ],
      },
      // Div with role="button" (interactive via role)
      {
        code: '<div role="button" data-testid="toggle">☰</div>',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<div>' },
            suggestions: suggestions(
              'toggle',
              '<div role="button" data-testid="toggle">☰</div>'
            ),
          },
        ],
      },
      // Span with role="link"
      {
        code: '<span role="link" data-testid="fake-link">click here</span>',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<span>' },
            suggestions: suggestions(
              'fake-link',
              '<span role="link" data-testid="fake-link">click here</span>'
            ),
          },
        ],
      },
      // Div with role="tab"
      {
        code: '<div role="tab" data-testid="settings-tab">Settings</div>',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<div>' },
            suggestions: suggestions(
              'settings-tab',
              '<div role="tab" data-testid="settings-tab">Settings</div>'
            ),
          },
        ],
      },
      // Element with onChange handler
      {
        code: '<div data-testid="toggle" onChange={handleChange}>toggle</div>',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<div>' },
            suggestions: suggestions(
              'toggle',
              '<div data-testid="toggle" onChange={handleChange}>toggle</div>'
            ),
          },
        ],
      },
      // Summary element (interactive - toggles details)
      {
        code: '<summary data-testid="faq-toggle">FAQ</summary>',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<summary>' },
            suggestions: suggestions(
              'faq-toggle',
              '<summary data-testid="faq-toggle">FAQ</summary>'
            ),
          },
        ],
      },
      // Element with role="checkbox"
      {
        code: '<div role="checkbox" data-testid="agree-checkbox">I agree</div>',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<div>' },
            suggestions: suggestions(
              'agree-checkbox',
              '<div role="checkbox" data-testid="agree-checkbox">I agree</div>'
            ),
          },
        ],
      },
      // Element with role="switch"
      {
        code: '<div role="switch" data-testid="dark-mode">Dark mode</div>',
        errors: [
          {
            messageId: 'preferAriaLabel',
            data: { element: '<div>' },
            suggestions: suggestions(
              'dark-mode',
              '<div role="switch" data-testid="dark-mode">Dark mode</div>'
            ),
          },
        ],
      },
    ],
  })
})
