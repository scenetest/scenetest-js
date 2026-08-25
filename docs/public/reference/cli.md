# CLI Reference

The `scenetest` CLI discovers and runs scene specs, manages browser lifecycle, coordinates teams, and generates reports.

## Basic Usage

```bash
scenetest                      # Run all scenes in ./scenes
scenetest scenes/auth.spec.ts  # Run a specific file
scenetest --headed             # Run with visible browser
scenetest --swarm              # Run swarm mode (all teams, all scenes)
```

## Subcommands

| Command | Description |
|---------|-------------|
| `scenetest install [args...]` | Install the browser builds scenes run in (see [Browsers](#browsers)) |
| `scenetest init` | Create the `scenetest/` folder structure (`--force` overwrites) |
| `scenetest prompt <type>` | Generate an LLM prompt for teams or seed data (`teams`, `seeds`, `both`) |
| `scenetest teams` | List the configured actor teams (`--json` for machine output) |

## Browsers

Scenetest drives the browser through playwright, and declares it as a **peer
dependency**:

```bash
pnpm add -D playwright
```

Your project supplies playwright, so its `playwright` bin is linked and one copy
backs both the browser download and the run. Two copies — one nested under
scenetest, one your own — download browsers for one version and launch scenes
with the other.

Download the browser builds with:

```bash
scenetest install                 # Every browser playwright supports
scenetest install chromium        # One browser
scenetest install --with-deps     # Also the OS packages the browsers need (CI)
```

`scenetest install` forwards its arguments to the playwright that scenetest
itself resolves, so the builds it downloads are the ones your scenes launch.
`pnpm exec playwright install` does the same job through your own copy.

## Command-Line Options

| Flag | Description |
|------|-------------|
| `--headed` | Run with visible browser (default: headless) |
| `--ui` | Interactive UI mode — keeps browser open after run |
| `--config <path>` | Path to config file (default: auto-discovered) |
| `--report <dir>` | Report output directory (default: `./scenetest-reports`) |
| `--format <fmt>` | Report format: `html`, `json`, or `both` (default: `html`) |
| `--report-url <url>` | POST batched protocol events to an HTTP endpoint as the run executes (see [Live report URL](#live-report-url)) |
| `--command-file <path>` | Tail a JSONL file for inbound protocol commands acting on the active run (see [Inbound command channel](#inbound-command-channel)) |
| `--devices` | Enable device rotation (assign rotating mobile/tablet/desktop devices to actors) |
| `--no-keyboard-actor` | Disable keyboard-only actor rotation (keyboard navigation is ON by default) |
| `--fuzzy-fingers` | Enable fuzzy-finger touch simulation (imprecise human touch, ~1 in 5 clicks miss) |
| `--swarm` | Force swarm mode — run all teams against all scenes to classify failures |

## Configuration File

Scenetest looks for config at:

1. `scenetest/config.ts`
2. `scenetest/config.js`
3. `scenetest/config.mjs`

```typescript
// scenetest/config.ts
import { defineConfig } from '@scenetest/scenes'

export default defineConfig({
  // Required
  baseUrl: 'http://localhost:5173',

  // Scene discovery (scenes live in scenetest/scenes/)
  ignore: ['**/helpers/**'],    // Patterns to skip

  // Browser
  browser: 'chromium',          // 'chromium' | 'firefox' | 'webkit'
  headed: false,                // Show browser window
  slowMo: 0,                    // Slow down actions (ms)

  // Timeouts
  timeout: 30000,               // Scene timeout (ms)
  actionTimeout: 5000,          // Per-action timeout (ms)
  warnAfter: 500,               // Log warning if action exceeds (ms)

  // Selectors
  aliases: {
    modal: '[role=dialog]',
    nav: '[role=navigation]',
  },

  // Reports
  reportDir: './scenetest-reports',
  reportFormat: 'html',         // 'html' | 'json' | 'both'

  // Playwright browser-context options, applied to every actor context.
  // A passthrough for settings scenetest has no option of its own for.
  // baseUrl, the active device profile, and warmup storage state all
  // override a key they set.
  contextOptions: {
    permissions: ['clipboard-read', 'clipboard-write'],
    // locale: 'fr-FR',
    // timezoneId: 'Europe/Paris',
    // colorScheme: 'dark',
    // offline: true,
  },

  // Device rotation
  devices: true,                // Use built-in device pool
  // Or provide custom devices:
  // devices: [
  //   { name: 'iPhone 14', category: 'mobile', contextOptions: { ... } },
  // ],

  // Keyboard navigation (ON by default)
  // Actors rotate between pointer and keyboard modes.
  // Keyboard actors navigate via Tab and activate via Enter/Space.
  noKeyboardActor: false,       // Set true to disable keyboard actor rotation

  // Fuzzy-finger touch simulation (OFF by default)
  // When enabled, pointer-mode actors occasionally mis-click (~1 in 5),
  // pause 100ms, then click correctly — simulating imprecise human touch.
  fuzzyFingers: false,          // Set true to enable

  // Swarm mode
  swarm: {
    failureThreshold: 5,        // Consecutive failures before auto-trigger
    windowSize: 3,              // Recent runs to consider
    concurrency: 4,             // Max parallel teams (throttle)
    repeats: 3,                 // Runs per scene per team
    auto: true,                 // Enable auto-triggering
  },

  // Lifecycle hooks
  beforeAll: async () => { /* seed database */ },
  afterAll: async () => { /* cleanup */ },
  beforeEach: async (scene) => { /* per-scene setup */ },
  afterEach: async (scene, report) => { /* per-scene teardown */ },
})
```

## Team Discovery

Teams are auto-discovered from actor files relative to your config:

**Single file** — `actors.ts` exports an array of teams:

```typescript
// actors.ts
import type { TeamConfig } from '@scenetest/scenes'

const teams: TeamConfig[] = [
  {
    admin: { key: 'admin-1', username: 'admin', email: 'admin@example.com', password: 'secret' },
    user: { key: 'user-1', username: 'alice', email: 'alice@example.com', password: 'secret' },
  },
  {
    admin: { key: 'admin-2', username: 'admin2', email: 'admin2@example.com', password: 'secret' },
    user: { key: 'user-2', username: 'bob', email: 'bob@example.com', password: 'secret' },
  },
]

export default teams
```

**Directory** — `actors/*.ts` with one team per file (sorted alphabetically):

```text
actors/
├── team-alpha.ts   → team 0
├── team-beta.ts    → team 1
└── team-gamma.ts   → team 2
```

Each file exports a single `TeamConfig`:

```typescript
// actors/team-alpha.ts
export default {
  admin: { key: 'admin-alpha', username: 'admin', ... },
  user: { key: 'user-alpha', username: 'alice', ... },
}
```

## Device Rotation

When `--devices` is passed or `devices: true` is set in config, each actor gets assigned a device from a rotating pool. The pool includes mobile phones, tablets, and desktops with various viewports.

**Built-in devices:**

| Device | Category | Viewport |
|--------|----------|----------|
| iPhone 14 | mobile | 390×844 |
| iPhone 12 | mobile | 390×844 |
| Pixel 7 | mobile | 412×915 |
| Galaxy S9+ | mobile | 320×658 |
| iPad Pro 11 | tablet | 834×1194 |
| iPad Mini | tablet | 768×1024 |
| Desktop 1920×1080 | desktop | 1920×1080 |
| Desktop 1366×768 | desktop | 1366×768 |
| Desktop 1440×900 | desktop | 1440×900 |
| Desktop 2560×1440 | desktop | 2560×1440 |

Actors don't choose their device — it rotates globally across the run. This surfaces responsive layout issues naturally without explicit configuration.

Device assignments appear in reports:

```text
✓ user logs in (1523ms)
    [user] assigned device: iPhone 14 (mobile)
    [admin] assigned device: Desktop 1920x1080 (desktop)
```

## Keyboard Navigation Mode

By default, scenetest rotates actors between two navigation modes:

- **`pointer`** — standard mouse/touch interaction (Playwright's normal `.click()`, `.fill()`, etc.)
- **`keyboard`** — navigate via Tab key and activate via Enter/Space

This rotation is **ON by default**. In the default pool `['pointer', 'keyboard']`, half your actors use keyboard navigation. This surfaces keyboard-accessibility issues (missing `tabindex`, non-focusable elements, broken tab order) without any extra test configuration.

**How it works:** When an actor is in keyboard mode, every `click()` call becomes a series of Tab presses to reach the target element, followed by Enter. Every `typeInto()` tabs to the input, then types. Every `check()` tabs to the checkbox, then presses Space. The same spec works in both modes — test authors don't need to think about it.

**Disabling:** Pass `--no-keyboard-actor` on the CLI or set `noKeyboardActor: true` in config.

**What shows in reports:**

```text
✓ user logs in (1523ms)
    [user] navigationMode: keyboard
    [admin] (pointer, default)
```

Only non-default modes (keyboard) are shown in reports. Pointer mode is the default and is omitted.

**Keyboard actions used internally:**

| Actor DSL method | Keyboard-mode implementation |
|------------------|------------------------------|
| `click(selector)` | Tab to element → Enter |
| `typeInto(selector, value)` | Tab to element → Ctrl+A → Backspace → type characters |
| `check(selector)` | Tab to element → Space |
| `select(selector, value)` | Tab to element → `selectOption()` (native browser API) |

## Fuzzy-Finger Touch Simulation

When enabled, pointer-mode actors simulate imprecise human touch input. Approximately 1 in 5 clicks (~20%) intentionally miss the target, pause 100ms (human noticing the miss), then click correctly.

**This is OFF by default.** Enable with `--fuzzy-fingers` on the CLI or `fuzzyFingers: true` in config.

**Purpose:** Surface touch-target problems in your UI:

- **Undersized targets** — WCAG 2.5.8 requires a minimum 24×24 CSS-px touch target. The `miss-center` strategy clicks 15px from the element's center. If that misses, the target is too small.
- **Crowded targets** — The `miss-edge` strategy clicks 3px outside the element's bounding box. If that activates a neighbor, targets are packed too tightly.

**How it works:**

1. ~80% of clicks go through normally (no mis-click)
2. ~20% of clicks: pick a strategy (alternating `miss-center` / `miss-edge`), click the wrong spot, pause 100ms, then click the correct element
3. If the correct click succeeds → move on silently (humans miss all the time)
4. If the correct click fails because the element vanished (the mis-click activated a neighbor) → throw `FuzzyFingerError`

**`FuzzyFingerError` details:**

```text
FuzzyFingerError: Fuzzy-finger failure on "close-btn":
  target too close to neighbor (mis-click 3px outside edge activated adjacent element)
```

The error includes the strategy (`miss-center` or `miss-edge`), the selector, and the original error. Only thrown when the UI has a real touch-target problem — not on normal failures.

**Applies to:** `click()`, `typeInto()`, `check()` — only for pointer-mode actors. Keyboard-mode actors are unaffected.

## Swarm Mode

See [What is "swarm mode"?](/faq/swarm-mode) for a detailed explanation.

**Manual trigger:**

```bash
scenetest --swarm
```

**Auto-trigger:** When a scene fails N consecutive times (default: 5), swarm mode activates automatically to diagnose whether failures are broken, flaky, or seed-data edge cases.

## Reports

Reports are written to `./scenetest-reports/` by default with timestamped filenames:

```text
scenetest-reports/
├── report-2024-01-15T10-30-45-123Z.html
└── report-2024-01-15T10-30-45-123Z.json
```

**HTML reports** include:
- Summary cards (scenes completed, assertions passed, duration)
- Per-scene details with assertion results
- Device assignments when rotation is enabled
- Swarm classification results when applicable

**JSON reports** include the full `RunReport` object for programmatic analysis.

## Live Dashboard

When running against a Vite dev server with the scenetest plugin, a live dashboard is available at `/__scenetest`. It shows a real-time swim-lane timeline with per-actor action bars, assertion markers, and timing data as scenes execute.

The URL is printed when the runner starts. You can also open it from the floating dev panel's **dashboard** button.

See [Live Dashboard](/reference/live-dashboard) for full details.

## Live report URL

`--report-url <url>` streams protocol events to a caller-supplied HTTP endpoint
as the run executes — in addition to the dev middleware / `.jsonl`, not instead
of them. This is the "speaking" half of the receiver/sink design, useful for
relaying a run to a remote dashboard (e.g. a cloud runner box) or reporting
directly from CI.

```sh
scenetest --report-url http://127.0.0.1:4999/events/$RUN_ID
# or via env var:
SCENETEST_REPORT_URL=http://127.0.0.1:4999/events/$RUN_ID scenetest
```

The flag takes precedence over `SCENETEST_REPORT_URL`, which takes precedence
over `reportUrl` in the config file.

**Wire contract.** The CLI `POST`s to `<url>` with the body:

```json
{ "events": [{ "seq": 0, "payload": { "type": "run:start", "timestamp": 1, "sceneCount": 3 } }] }
```

- `payload` is a protocol event, carried verbatim (no new wire format).
- `seq` is a monotonic counter assigned per run, so the receiver can order and
  de-duplicate the stream regardless of HTTP arrival order.
- The URL is opaque — bake the run id into it.

**Behavior.**

- **Batched** — events flush every ~250ms or once 50 are queued, with a final
  synchronous flush before exit so the tail of the run (including `run:end`) is
  never lost.
- **Fail soft** — an unreachable or erroring endpoint logs a single warning and
  never fails the run. Reporting is observability, not a gate.
- **Auth** — set `SCENETEST_REPORT_TOKEN` (or `reportToken` in config) to send
  an `Authorization: Bearer <token>` header, for the direct-to-cloud case.

## Inbound command channel

`--command-file <path>` is the **inbound mirror of `--report-url`**: where the
run *speaks* protocol events out as JSON lines, it *listens* for protocol
commands as JSON lines here. A driver (a cloud runner box agent, a script)
appends one encoded [`Command`](/reference/protocol) per line; the CLI tails the
file and applies each to the **active run**.

```sh
scenetest --command-file /tmp/run.commands.jsonl
# or via env var:
SCENETEST_COMMAND_FILE=/tmp/run.commands.jsonl scenetest
```

```jsonl
{"type":"run:pause"}
{"type":"run:resume"}
{"type":"run:stop"}
```

**Commands target the active run.** There is no run id in the address — a
run-agnostic `run:stop` just stops whatever is running. A `runId` may ride
along as metadata (e.g. on the HTTP `/commands` route) but is never required.

**Behavior.**

- **Cooperative, at scene boundaries** — the watcher is live for the duration of
  the run. `run:pause` parks the runner before its next scene; `run:resume`
  releases it; `run:stop` ends the run gracefully after the in-flight scene and
  emits `run:end` with whatever completed (and `cancelled: true`), so the run
  summary is preserved rather than lost to a kill.
- **Observable** — `run:pause` / `run:resume` emit `run:paused` / `run:resumed`
  events (past-tense facts) so a dashboard reflects the paused state and the log
  records it.
- **`run:replay` relaunches** — a one-shot CLI can't re-register its
  module-cached scene files, so replay starts a *fresh* run by launching
  `scenetest` again. This is the driver's job, exactly the way the Vite dev
  middleware spawns a new process for replay. (`RunController` from
  `@scenetest/scenes` still parses `run:replay` via `waitForReplay()` for a
  long-lived embedder that runs its own loop.)
- **Robust tail** — the file need not exist yet; appended lines are tailed by
  byte offset, a partial trailing line is buffered until its newline, and
  malformed/unknown lines are skipped.

The same intake is also exposed over HTTP by `@scenetest/receiver`'s
`POST /commands` route (body `{ command, runId? }`), which the Vite dev server
mounts at `POST /__scenetest/commands`. File and HTTP are parallel transports
over one command vocabulary — the mirror of the event path's report-url + JSONL
sinks.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All scenes completed, all assertions passed |
| 1 | One or more scenes failed or timed out |
| 1 | Configuration error or missing teams |
