---
title: CLI Reference
description: Command-line options, configuration file format, team discovery, device rotation, swarm mode, and report output.
---

# CLI Reference

The `scenetest` CLI discovers and runs scene specs, manages browser lifecycle, coordinates teams, and generates reports.

## Basic Usage

```bash
scenetest                      # Run all scenes in ./scenes
scenetest scenes/auth.spec.ts  # Run a specific file
scenetest --headed             # Run with visible browser
scenetest --swarm              # Run swarm mode (all teams, all scenes)
```

## Command-Line Options

| Flag | Description |
|------|-------------|
| `--headed` | Run with visible browser (default: headless) |
| `--ui` | Interactive UI mode — keeps browser open after run |
| `--config <path>` | Path to config file (default: auto-discovered) |
| `--report <dir>` | Report output directory (default: `./scenetest-reports`) |
| `--format <fmt>` | Report format: `html`, `json`, or `both` (default: `html`) |
| `--devices` | Enable device rotation (assign rotating mobile/tablet/desktop devices to actors) |
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

  // Device rotation
  devices: true,                // Use built-in device pool
  // Or provide custom devices:
  // devices: [
  //   { name: 'iPhone 14', category: 'mobile', contextOptions: { ... } },
  // ],

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

```
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
| iPhone 14 | mobile | 390x844 |
| iPhone 12 | mobile | 390x844 |
| Pixel 7 | mobile | 412x915 |
| Galaxy S9+ | mobile | 320x658 |
| iPad Pro 11 | tablet | 834x1194 |
| iPad Mini | tablet | 768x1024 |
| Desktop 1920x1080 | desktop | 1920x1080 |
| Desktop 1366x768 | desktop | 1366x768 |
| Desktop 1440x900 | desktop | 1440x900 |
| Desktop 2560x1440 | desktop | 2560x1440 |

Actors don't choose their device — it rotates globally across the run. This surfaces responsive layout issues naturally without explicit configuration.

Device assignments appear in reports:

```
✓ user logs in (1523ms)
    [user] assigned device: iPhone 14 (mobile)
    [admin] assigned device: Desktop 1920x1080 (desktop)
```

## Swarm Mode

See [What is "swarm mode"?](/faq/swarm-mode/) for a detailed explanation.

**Manual trigger:**

```bash
scenetest --swarm
```

**Auto-trigger:** When a scene fails N consecutive times (default: 5), swarm mode activates automatically to diagnose whether failures are broken, flaky, or seed-data edge cases.

## Reports

Reports are written to `./scenetest-reports/` by default with timestamped filenames:

```
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

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All scenes completed, all assertions passed |
| 1 | One or more scenes failed or timed out |
| 1 | Configuration error or missing teams |
