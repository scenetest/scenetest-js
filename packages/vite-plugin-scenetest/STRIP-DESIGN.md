# AST-Based Code Stripping Design

## Goal

Remove all scenetest code from production builds:
1. Import statements from 'scenetest'
2. All `pass()` and `fail()` function calls

## Approach

Use `@babel/parser` + `@babel/traverse` + `magic-string`:
- Babel parser handles all JS/TS/JSX syntax correctly
- Babel traverse provides reliable AST walking
- magic-string enables surgical edits with source map support

## What To Strip

### 1. Import Statements

```javascript
// Remove entirely:
import { pass, fail } from 'scenetest'
import { pass } from 'scenetest'
import { fail } from 'scenetest'

// Remove only scenetest specifiers, keep others:
import { pass, fail, someOtherExport } from 'scenetest'  // → never happens, scenetest only exports pass/fail

// Handle aliases:
import { pass as p, fail as f } from 'scenetest'
```

### 2. Function Call Statements

```javascript
// Simple statement - remove entire line:
pass('description', condition)
fail('description', condition)

// With semicolon:
pass('description', condition);

// Multiple on same line (uncommon but valid):
pass('a', true); pass('b', false);
```

### 3. Complex Arguments (must preserve correctness)

```javascript
// Nested function calls in condition:
pass('test', foo() && bar.baz())

// Template literals:
pass(`test ${name}`, condition)

// Arrow functions:
pass('test', () => true)

// Object/array literals:
pass('test', { a: 1 }.hasOwnProperty('a'))
```

### 4. Expression Contexts (edge cases)

Since `pass()` and `fail()` return `void`, they shouldn't appear in expression contexts.
But if they do, we need to handle it safely:

```javascript
// Theoretically possible but bad code:
const x = pass('test', true)  // → const x = undefined  (or remove entirely?)

// In comma expressions:
(pass('test', true), doSomething())  // → (doSomething())

// In logical expressions (BAD - changes behavior):
condition && pass('test', true)  // → condition && undefined  ???

// In ternary:
x ? pass('a', true) : pass('b', false)  // Problematic
```

**Decision**: For expression contexts, replace with `undefined` or `void 0` to maintain expression validity.
For statement expressions, remove the entire statement.

## Implementation Steps

1. Parse with Babel parser (with JSX + TypeScript plugins)
2. Track scenetest imports to know which local names to strip
3. Traverse AST:
   - Remove ImportDeclaration nodes for 'scenetest'
   - Remove ExpressionStatement nodes containing pass/fail calls
   - Replace CallExpression in other contexts with `void 0`
4. Use magic-string to apply edits
5. Generate source map

## Test Cases

### Basic Cases
- [ ] Import removal (full import)
- [ ] Import removal (named imports)
- [ ] Import removal (aliased imports)
- [ ] Simple pass() statement
- [ ] Simple fail() statement
- [ ] Multiple statements

### Complex Arguments
- [ ] Nested function calls
- [ ] Template literals
- [ ] Object literals
- [ ] Array literals
- [ ] Arrow functions

### Edge Cases
- [ ] No scenetest imports (should not transform)
- [ ] Mixed imports (scenetest + other)
- [ ] pass/fail not from scenetest (should NOT strip)
- [ ] String containing "pass(" (should NOT strip)
- [ ] Comments containing pass() (should NOT strip)
- [ ] Inside JSX expressions
- [ ] TypeScript type annotations present

### Expression Contexts (defensive)
- [ ] In assignment RHS
- [ ] In comma expression
- [ ] In logical expression
- [ ] In ternary

## Dependencies

```json
{
  "@babel/parser": "^7.x",
  "@babel/traverse": "^7.x",
  "@babel/types": "^7.x",
  "magic-string": "^0.30.x"
}
```
