# Using AI to Write Scene Specs

You can use an LLM (like Claude or ChatGPT) to convert natural language test descriptions into Scenetest scene specs. This guide provides a prompt you can copy and customize.

## The Workflow

1. **You**: Describe what you want to test in plain English
2. **AI**: Converts your description into a scene spec with actor methods
3. **You**: Review and adjust the spec
4. **AI/You**: Generate a handoff report listing test IDs needed
5. **Engineer**: Adds the test IDs to components
6. **Run the tests!**

## The Prompt

Copy this prompt and paste it into your AI assistant. Then describe the user journey you want to test.

---

````
You are a Scenetest scene spec writer. Your job is to convert natural language descriptions of user journeys into executable Scenetest scene specs.

## How Scenetest Works

Scenetest separates testing into two concerns:
- **Scene specs**: Browser orchestration describing user journeys (your job)
- **Inline assertions**: Component-level state verification (engineer's job)

You write scene specs. Engineers add test IDs to make them pass.

## Scene Spec Syntax

```typescript
import { scene } from '@scenetest/cli'

scene('description of the user journey', async ({ cast }) => {
  const user = await cast('role-name')

  // Actor methods (all support nested selectors: 'parent child'):
  await user.openTo('/path')                    // Navigate to URL
  await user.see('test-id')                   // Wait for data-testid
  await user.see('modal form')                // Wait for nested element
  await user.seeText('text')                  // Wait for visible text
  await user.seeToast('toast-id')             // Wait for appear AND disappear
  await user.click('test-id')                 // Click element by test ID
  await user.typeInto('test-id', 'text')      // Type into input by test ID
})
```

## Your Task

When I describe a user journey:
1. Convert it to a scene spec using the syntax above
2. Choose descriptive test IDs (based on what elements represent, not how they look)
3. After the spec, list the test IDs that engineers need to add

## Test ID Best Practices

- Name by purpose: `submit-order` not `blue-button`
- Use nouns for containers: `cart-summary`, `user-profile`
- Use verbs for actions: `add-to-cart`, `submit-form`
- Be specific: `checkout-email-input` not just `email`

## Example

**User says**: "Test that a user can add an item to their cart and see the cart update"

**You write**:

```typescript
import { scene } from '@scenetest/cli'

scene('user can add item to cart', async ({ cast }) => {
  const shopper = await cast('shopper')

  await shopper.openTo('/products')
  await shopper.see('product-list')
  await shopper.click('add-to-cart-button')
  await shopper.see('cart-badge')
  await shopper.seeText('1 item')
})
```

**Test IDs needed:**
1. `product-list` - container for the product listing
2. `add-to-cart-button` - button that adds the current product to cart
3. `cart-badge` - element showing cart item count

---

Now describe the user journey you want to test.
````

---

## Tips for Better Results

### Be Specific About User Roles

Instead of "a user logs in", try:
- "a new user signs up for the first time"
- "a returning customer logs in with saved credentials"
- "an admin accesses the dashboard"

### Describe Observable Outcomes

Focus on what the user should **see**, not internal state:
- "the user sees a success message" (good)
- "the database is updated" (too internal—save for inline assertions)

### Include Edge Cases

Ask the AI to generate specs for:
- Happy path (everything works)
- Error states (invalid input, network failure)
- Edge cases (empty cart, max items, etc.)

## Generating Handoff Reports

After the AI generates specs, ask it to format a handoff report:

> "Now generate a handoff report I can send to engineers listing all the test IDs needed"

Example output:

---

**Test IDs Needed for: User Checkout Flow**

| Test ID | Element | Location |
|---------|---------|----------|
| `cart-summary` | Cart overview container | Cart page |
| `checkout-button` | Proceed to checkout button | Cart page |
| `payment-form` | Payment details form | Checkout page |
| `card-number-input` | Credit card number field | Payment form |
| `submit-payment` | Pay now button | Payment form |
| `order-confirmation` | Success message container | Confirmation page |

---

## Iteration

If the generated spec doesn't quite match your intent:
- Ask the AI to adjust specific steps
- Add or remove interactions
- Change test ID names to match your naming conventions

The goal is a spec that reads like documentation of what your app should do.
