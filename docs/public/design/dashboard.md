# Scenecheck Dashboard & Reports

**STATUS: Design Stage**

---

## Vision

A local-first report viewer that scales from "drop a file" to "org-wide dashboard":

1. **Local files** - JSONL reports in your repo, viewable in browser
2. **Self-hosted** - Team server, shared history, PR integration
3. **Hosted** - Managed solution with live DSL editor, cross-org insights

## File Structure

```
scenecheck/
├── .reports/
│   ├── 2026-01-25T103000-a762c2b-main.jsonl
│   ├── 2026-01-25T104512-f69279b-feat-checkout.jsonl
│   └── ...
├── scenes/
└── scenecheck.config.ts
```

Report naming: `{timestamp}-{commit}-{branch}.jsonl`

## Format: JSONL

```jsonl
{"type":"meta","commit":"a762c2b","branch":"main","ts":"2026-01-25T10:30:00Z"}
{"type":"assertion","name":"cart.updates","status":"passed","ms":12,"actor":"alice","file":"src/Cart.tsx","line":42}
{"type":"assertion","name":"checkout.validates","status":"passed","ms":8,"actor":"bob","file":"src/Checkout.tsx","line":87}
{"type":"assertion","name":"payment.processes","status":"failed","ms":45,"actor":"alice","file":"src/Payment.tsx","line":23,"error":"timeout waiting for stripe"}
```

Reading:
```ts
const records = fs.readFileSync(file, 'utf8')
  .trim().split('\n')
  .map(line => JSON.parse(line))
```

Writing:
```ts
records.forEach(r => fs.appendFileSync(file, JSON.stringify(r) + '\n'))
```

For security, context objects are not saved to reports. Use the live dev panel to inspect context during development.

## Storage

JSONL files for now. Simple glob to find all reports, load into memory, filter/sort in JS.

A future server version might store these in a database, but the filesystem is good enough for now.

## Report Viewer

### Panel Architecture

The fullscreen viewer uses the small floating panel as a sidebar - like an email inbox view. List of assertions on the left, expanded detail view on the right.

```
┌──────────────────────┬─────────────────────────────────────────────┐
│ ✓ cart.updates    12 │                                             │
│ ✓ checkout.valid   8 │  checkout.validates                         │
│ ✗ payment.proc    45 │                                             │
│                      │  Status: passed                             │
│ ─────────────────    │  Duration: 8ms                              │
│ Run: main @ a762c2b  │  Actor: bob                                 │
│ 2026-01-25 10:30     │  Location: src/Checkout.tsx:87              │
│                      │                                             │
└──────────────────────┴─────────────────────────────────────────────┘
```

### Drop-in Mode

Drag a JSONL file onto the page, instantly explore. Works offline, zero setup.

### Connected Mode

Scans `scenecheck/.reports/` directory, lists all reports with metadata, click to explore.

## Comparison View

Side-by-side diff showing:
- **New** - Assertions that appeared
- **Removed** - Assertions that disappeared
- **Regression** - Pass → Fail
- **Fixed** - Fail → Pass
- **Timing** - Significant duration changes

```
┌─────────────────────────────────┬─────────────────────────────────┐
│ main @ a762c2b                  │ feat/checkout @ f69279b         │
├─────────────────────────────────┼─────────────────────────────────┤
│ ✓ cart.updates          12ms   │ ✓ cart.updates          14ms   │
│ ✓ checkout.validates     8ms   │ ✗ checkout.validates    92ms ← │
│                                 │ ✓ checkout.applyCoupon   5ms + │
│ ✓ payment.processes     45ms   │ ✓ payment.processes     43ms   │
└─────────────────────────────────┴─────────────────────────────────┘
```

## CI Integration

```yaml
# .github/workflows/test.yml
- name: Run scenecheck
  run: pnpm scenecheck run --report

- name: Upload report
  uses: scenecheck/upload-report@v1
  with:
    path: scenecheck/.reports/
```

PR comment:
> **Scenecheck Report** for `feat/checkout` @ f69279b
>
> 23 assertions (22 passed, 1 failed)
>
> | Change | Assertion | Details |
> |--------|-----------|---------|
> | Regression | checkout.validates | was 8ms/pass, now 92ms/fail |
> | New | checkout.applyCoupon | 5ms pass |
>
> [View full comparison →](https://scenecheck.dev/compare/...)

## Live DSL Playground (Future)

For the hosted solution:
- Write scenes in browser with autocomplete
- Run against local dev server or preview deploy
- Watch assertions populate in real-time
- Save → commits to repo via GitHub API

## MVP Scope

1. JSONL writer (in checks package)
2. Report viewer page (fullscreen panel with sidebar)
3. Directory scanner
4. Basic comparison view
