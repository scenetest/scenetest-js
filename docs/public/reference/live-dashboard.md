# Live Dashboard

The live dashboard streams scene execution events in real-time to a browser-based timeline at `/__scenetest`. It shows swim lanes per actor with action bars, assertion markers, and timing data as scenes run.

## Quick Start

1. Start your dev server (`pnpm dev` or equivalent)
2. Open `http://localhost:5173/__scenetest` in your browser
3. Run scenes: `npx scenetest scenetest/scenes/my-scene.spec.md`
4. Watch the timeline populate in real-time

The dashboard URL is also printed to the terminal when scenes start:

```text
Running 2 scene file(s)...

Found 2 scene(s)

Dashboard: http://localhost:5173/__scenetest
```

You can also open it from the floating dev panel — click the **dashboard** button in the action bar.

## How It Works

The CLI runner and Vite dev server are separate processes. They communicate via HTTP:

```text
CLI Runner (Playwright)
    │
    POST /__scenetest/events     → pushes timeline events
    │
Vite Plugin (middleware)
    │
    GET /__scenetest/events      → SSE stream to browser
    │
Dashboard (browser)
    └── renders swim-lane timeline
```

1. **Runner emits events** — as scenes execute, the runner sends fire-and-forget POSTs to the Vite dev server with timeline data (scene start/end, action start/end, assertions)
2. **Vite plugin fans out** — the plugin's event hub broadcasts events to all connected dashboard clients via Server-Sent Events (SSE)
3. **Dashboard renders** — the browser page updates the swim-lane timeline in real-time

If the Vite dev server isn't running or doesn't have the scenetest plugin, events silently drop. There is zero impact on test execution — the reporter never blocks or slows down the runner.

## Dashboard UI

### Header

Shows run-level stats updated in real-time:

- **Scenes** — completed / total
- **Pass** — scenes that completed successfully
- **Fail** — scenes that failed or timed out
- **Time** — elapsed duration
- **Connection indicator** — green (connected), amber (connecting), red (disconnected)

### Swim Lanes

Each scene gets a section with one horizontal lane per actor. Actions appear as bars positioned by timestamp:

| Color | Meaning |
|-------|---------|
| Blue (pulsing) | Action currently running |
| Green | Action completed successfully |
| Amber | Action completed but was slow (>500ms) |
| Red | Action failed with an error |

Hover over any bar to see the full action name, target selector, duration, and error message (if any).

### Time Ruler

A ruler at the top of each scene's swim lanes shows tick marks at regular intervals relative to the scene start time.

### Assertion Markers

Small markers appear on the lane for the actor that triggered them:

- **Green checkmark** — assertion passed
- **Red cross** — assertion failed

Hover for the assertion description.

## Events

The runner emits these event types:

| Event | When | Data |
|-------|------|------|
| `run:start` | Run begins | scene count |
| `scene:start` | Scene begins | name, file, actor roles |
| `action:start` | Action begins executing | actor, action name, target selector |
| `action:end` | Action finishes | actor, action, duration, error (if any) |
| `assertion` | Inline check fires | actor, description, pass/fail |
| `scene:end` | Scene finishes | name, status, duration, error |
| `run:end` | Run finishes | duration, summary totals |

Events flow through both the sequential (`test()`) and concurrent (`scene()`) execution models. Both `ActionChainImpl` and `ConcurrentActorHandleImpl` emit action events.

## Late Joining

If you open the dashboard after a run has started, you'll still see all events from the current run. The event hub keeps a ring buffer of the last 2000 events and replays them to newly connected clients.

Opening a new run clears the buffer so the dashboard starts fresh.

## No Configuration Required

The dashboard works out of the box with the default Vite plugin setup:

```typescript
// vite.config.ts
import scenetest from '@scenetest/vite-plugin'

export default defineConfig({
  plugins: [react(), scenetest()],
})
```

The dashboard routes (`/__scenetest` and `/__scenetest/events`) are registered automatically in dev mode. They are not included in production builds.

## Relationship to Reports

The live dashboard and static HTML reports serve different purposes:

| | Live Dashboard | HTML Reports |
|---|---|---|
| **When** | During test execution | After run completes |
| **Where** | `/__scenetest` in browser | `scenetest/.reports/report-*.html` on disk |
| **Data** | Real-time event stream | Complete run summary |
| **Use case** | Watching test progress, debugging slow actions | Sharing results, CI artifacts, historical comparison |

Both are available simultaneously — the runner writes reports to disk regardless of whether the dashboard is open.
