# ARIA Tree: Persistent Canvas for Assertions, Snapshots, and Label Authoring

**STATUS: Design Only** — Nothing in this document is implemented. Supersedes [`cli-v2.md` §8 (Snapshots)](./cli-v2.md), which this proposal absorbs and extends.

---

## Vision

Scenetest already treats accessibility as a first-class concern: the ESLint plugin's `prefer-aria-label` rule pushes authors toward role+label selectors, and `resolveSelector()` in `packages/scenes/src/selectors.ts` makes those selectors primary. The missing piece is a **persistent, user-facing view of the app's accessibility tree** — the same tree Playwright's `toMatchAriaSnapshot()` (v1.60+) operates on.

Once that tree exists as a stored, comparable artifact, three things become possible at once:

1. **Snapshots** — assert "this region of the app still looks like this to a screen reader."
2. **Tree-anchored assertion display** — `should()` results light up nodes in the tree, giving the observer a stable spatial map of test coverage that persists across runs.
3. **Authoring feedback loop** — click a node in the tree; if it's addressable only by fragile selectors (role + visible text, nth-child, etc.), generate an agent-actionable instruction to add an `aria-label`.

The unifying claim: the ARIA tree is the right substrate. It's stable enough to anchor history across runs, semantic enough to make diffs meaningful, and already produced by a tool we ship on top of (Playwright).

---

## Layer 1: ARIA Snapshots

### API

Replace the design sketch in `cli-v2.md §8` with a thin wrapper over Playwright's built-in:

```typescript
// Inside an actor scope
await user.matchAriaSnapshot('profile-card', `
  - heading "Alice Smith" [level=2]
  - text "Software engineer"
  - button "Edit profile"
`)

// Or capture-and-compare for state restoration tests
const before = await user.captureAriaSnapshot('profile-card')
await user.click('edit')
await user.click('cancel')
await user.matchAriaSnapshot('profile-card', before)
```

`captureAriaSnapshot()` returns Playwright's YAML-shaped accessibility tree. `matchAriaSnapshot()` accepts either a literal template string (with Playwright's `[level=2]`, `/regex/`, etc.) or a captured value.

### Storage: in-repo vs. in-history

Two natural homes for snapshot artifacts, each with a real tradeoff:

| | In-repo files | History store |
|---|---|---|
| Source of truth | git | `.reports/` |
| Code review | Trivial — appears in PR diff | Needs separate review surface |
| Approval UX | `--update-snapshots` (CLI gesture) | Click-to-approve in dev panel |
| Drift across runs | Lost (each commit overwrites) | First-class (timestamped) |

**Proposal: both, with the in-repo file as authoritative.** Inline templates (the common case, shown above) live in the test source. For larger snapshots, write to `.scenetest/snapshots/<scene>.yaml`. The history store (Layer 2) records *every* observed snapshot from *every* run, so even when the authoritative file is overwritten by `--update-snapshots`, you can still see what changed when, and approve diffs from the panel as a developer-mode shortcut to running the CLI flag.

---

## Layer 2: History and Approval

Build on `packages/checks/src/history.ts`, which already stores per-assertion run history and detects flaky behavior. Extend the same store with snapshot observations:

```typescript
type SnapshotObservation = {
  scene: string
  selector: string
  ts: number
  tree: string              // YAML aria-snapshot
  expected: string | null   // null = capture-only (no assertion yet)
  status: 'matched' | 'drift' | 'captured'
  ranFromCommit?: string
}
```

The fullscreen viewer (`packages/checks/src/fullscreen.ts`) gains a **Snapshots** view alongside Grouped / Location / Sequence:

```text
┌─────────────────────────────┬─────────────────────────────────────────┐
│ profile-card                │ profile-card @ 2026-05-13 14:22         │
│   ✓ 2026-05-13 14:22        │                                         │
│   ⚠ 2026-05-13 11:08  diff  │ - heading "Alice Smith" [level=2]       │
│   ✓ 2026-05-12 17:44        │ + heading "Alice Smith" [level=3]   ←   │
│                             │   text "Software engineer"              │
│ checkout-summary            │   button "Edit profile"                 │
│   ✓ 2026-05-13 14:22        │                                         │
│                             │ [ Approve as new baseline ]             │
└─────────────────────────────┴─────────────────────────────────────────┘
```

"Approve as new baseline" rewrites the inline template in the test source (or the `.yaml` file) via the existing `/__open-in-editor` mechanism extended with a write capability — the same path used for click-to-editor.

---

## Layer 3: Tree-Anchored Assertion Display

This is the most interesting layer and the one that justifies the others.

### The link problem

`should(description, condition, context?)` is currently context-free — it has a source location but no DOM/ARIA anchor. To place an assertion result on a tree node we need *some* way to know which node it's "about." Three options:

1. **Component-scoped inference (framework bindings).** `useCheck()` in `checks-react` already runs inside a component's render scope. The hook can capture a ref to the component's root DOM element and tag any `should()` called during the effect with that element. Equivalent hooks exist for Vue / Solid / Svelte.
2. **Explicit anchoring.** `should('cart total visible', total > 0, { anchor: cartRef })` — escape hatch for cases where component scope is too coarse.
3. **Stack-trace mapping.** Use the source location we already capture to find the JSX file/line, then map (via vite-plugin) to the rendered DOM element. Brittle; only as a fallback.

**Proposal: (1) by default, (2) as escape hatch.** Drop (3) — too magical for too little gain.

### Display

The fullscreen viewer gains a **Tree** view: the most recent ARIA snapshot of the whole page, with assertion results overlaid as colored dots on the nodes they anchor to.

```text
- main
  - heading "Cart"
  - list                                        ● ● ●  (3 passed)
    - listitem "Notebook ×2"                    ●
    - listitem "Pen"                            ●
  - text "Total: $24"                           ● ✗ (1 failed: "total formatted")
  - button "Checkout"                           ●
```

Click a node → see the assertions anchored there, their pass/fail history, the source files they came from. Over many runs, the *tree stays stable* (or its drift is itself surfaced via Layer 1 snapshots), so the developer builds a durable mental map: "the checkout subtree is well-covered; the settings subtree has a flaky assertion at the notifications toggle."

This is what "lighting up a tree" means concretely: the persistent ARIA structure is the canvas; assertion outcomes are time-varying decoration on top.

---

## Layer 4: Element-Picker → Agent Instruction

Closes the loop with `prefer-aria-label`.

In the Tree view, hover any node. The panel surfaces:

- **Current addressability** — what selectors would resolve to this node today (`getByRole('button', { name: 'Edit' })`, `getByText('Edit')`, `nth-child` fallback).
- **Selector quality score** — green if there's a stable aria-label or role+unique-name; yellow if reliant on visible text (i18n risk); red if only positional.

When yellow/red, expose a **"Generate label instruction"** button. It produces a structured prompt:

```text
File: src/Checkout.tsx
Line: 87 (approx.)
Element: <button> with visible text "Edit"
Current accessibility name: "Edit"
Problem: ambiguous (3 buttons with same name on this page)
Suggested label: "Edit shipping address"
Action: Add aria-label="Edit shipping address" to the button at this location.
```

This output is designed to be pasted into an AI coding agent (or executed directly via an MCP-style integration). It pairs perfectly with the existing ESLint rule: the linter flags "you used `data-testid` instead of `aria-label`"; the tree view flags "your `aria-label` is ambiguous on this page" — same direction, complementary trigger points.

---

## Open Questions

1. **Snapshot scope granularity.** Playwright's `toMatchAriaSnapshot` defaults to the whole page; ours should default to the selector the actor is scoped to. Confirm this maps cleanly to `resolveSelector()` results.
2. **Tree view performance.** Real apps have thousands of nodes. The viewer probably needs collapse-by-default at depth N with assertion-anchored nodes auto-expanded.
3. **What anchors to "page" vs. "subtree"?** `should()` calls from a top-level page test (no component) need *some* anchor; the page root is the natural fallback but may be uselessly broad. Maybe surface those in a "page-level" lane in the tree view instead of attaching to a node.
4. **Approval workflow when in-repo and history-store baselines disagree.** If a developer approved a drift in the panel but didn't run `--update-snapshots`, the next CI run will fail against the still-old file. Either (a) approval *must* rewrite the file (simpler, what the proposal assumes), or (b) we track a "pending approval" state that surfaces in the dashboard. (a) seems right; flag if there's a reason to prefer (b).
5. **Cross-framework parity.** All four framework bindings (`checks-react`, `checks-vue`, `checks-solid`, `checks-svelte`) need component-scope capture for Layer 3. The React hook is a fine prototype; the others need design passes.

---

## Phasing

| Phase | Deliverable | Depends on |
|---|---|---|
| 1 | `matchAriaSnapshot()` / `captureAriaSnapshot()` actor methods, inline templates only | — |
| 2 | History store records snapshot observations; Snapshots view in fullscreen viewer | Phase 1; existing `history.ts` |
| 3 | In-panel "approve as new baseline" writes back to source | Phase 2; write extension of `/__open-in-editor` |
| 4 | Component-scoped anchor capture in `checks-react`; Tree view in fullscreen viewer | Phase 1 |
| 5 | Anchor capture in remaining framework bindings | Phase 4 |
| 6 | Element-picker selector-quality analysis and label instruction generation | Phase 4 |

Phases 1–3 ship a snapshot system. Phases 4–6 layer the durable spatial canvas on top. Each phase is useful standalone, which is the point of separating them.
