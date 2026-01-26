import type { Rule } from 'eslint'

/**
 * Interactive HTML elements where data-testid could be replaced with aria-label.
 */
const INTERACTIVE_ELEMENTS = new Set([
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'summary',
  'option',
])

/**
 * Interactive ARIA roles.
 */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'textbox',
  'combobox',
  'listbox',
  'searchbox',
  'option',
  'treeitem',
])

/**
 * Event handler props that indicate an element is interactive.
 */
const INTERACTIVE_HANDLERS = new Set([
  'onClick',
  'onChange',
  'onSubmit',
  'onInput',
  'onKeyDown',
  'onKeyUp',
  'onKeyPress',
])

function getJSXAttributeValue(attr: { value: unknown }): string | null {
  const value = attr.value as { type: string; value?: string; expression?: { type: string; value?: string } } | null
  if (!value) return null
  if (value.type === 'Literal' && typeof value.value === 'string') {
    return value.value
  }
  if (
    value.type === 'JSXExpressionContainer' &&
    value.expression &&
    value.expression.type === 'Literal' &&
    typeof value.expression.value === 'string'
  ) {
    return value.expression.value
  }
  return null
}

interface JSXAttribute {
  type: string
  name: { type: string; name?: string }
  value: unknown
}

interface JSXOpeningElement {
  type: string
  name: { type: string; name?: string }
  attributes: JSXAttribute[]
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Suggest using aria-label instead of data-testid on interactive elements for better accessibility',
      recommended: true,
    },
    hasSuggestions: true,
    messages: {
      preferAriaLabel:
        'Psst — this {{ element }} has a data-testid but no aria-label. An aria-label is accessible to all users AND works as a test selector.',
      addAriaLabel: 'Add aria-label="{{ value }}" (keeps data-testid)',
      replaceWithAriaLabel: 'Replace data-testid with aria-label="{{ value }}"',
    },
    schema: [],
  },

  create(context) {
    return {
      JSXOpeningElement(node: unknown) {
        const el = node as unknown as JSXOpeningElement

        // Only handle simple element names (not member expressions like Foo.Bar)
        if (el.name.type !== 'JSXIdentifier') return

        const tagName = el.name.name ?? ''
        const attributes = el.attributes.filter(
          (attr): attr is JSXAttribute => attr.type === 'JSXAttribute'
        )

        // Find data-testid attribute
        const testIdAttr = attributes.find(
          (attr) => attr.name.type === 'JSXIdentifier' && attr.name.name === 'data-testid'
        )
        if (!testIdAttr) return

        // Check if already has aria-label or aria-labelledby
        const hasAriaLabel = attributes.some(
          (attr) =>
            attr.name.type === 'JSXIdentifier' &&
            (attr.name.name === 'aria-label' || attr.name.name === 'aria-labelledby')
        )
        if (hasAriaLabel) return

        // Determine if element is interactive
        const isInteractiveTag = INTERACTIVE_ELEMENTS.has(tagName)

        const roleAttr = attributes.find(
          (attr) => attr.name.type === 'JSXIdentifier' && attr.name.name === 'role'
        )
        const roleValue = roleAttr ? getJSXAttributeValue(roleAttr) : null
        const hasInteractiveRole = roleValue !== null && INTERACTIVE_ROLES.has(roleValue)

        const hasEventHandler = attributes.some(
          (attr) =>
            attr.name.type === 'JSXIdentifier' &&
            typeof attr.name.name === 'string' &&
            INTERACTIVE_HANDLERS.has(attr.name.name)
        )

        if (!isInteractiveTag && !hasInteractiveRole && !hasEventHandler) return

        // Get the data-testid value for the suggestion
        const testIdValue = getJSXAttributeValue(testIdAttr)

        const suggestions: Rule.SuggestionReportDescriptor[] = []

        if (testIdValue) {
          suggestions.push(
            {
              messageId: 'addAriaLabel',
              data: { value: testIdValue },
              fix(fixer) {
                // Insert aria-label right after data-testid
                return fixer.insertTextAfter(
                  testIdAttr as unknown as Rule.Node,
                  ` aria-label="${testIdValue}"`
                )
              },
            },
            {
              messageId: 'replaceWithAriaLabel',
              data: { value: testIdValue },
              fix(fixer) {
                return fixer.replaceText(
                  testIdAttr as unknown as Rule.Node,
                  `aria-label="${testIdValue}"`
                )
              },
            }
          )
        }

        context.report({
          node: testIdAttr as unknown as Rule.Node,
          messageId: 'preferAriaLabel',
          data: { element: `<${tagName}>` },
          suggest: suggestions,
        })
      },
    }
  },
}

export default rule
