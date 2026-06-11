# @scenetest/dashboard

The scenetest dashboard as a mountable widget. The same Preact UI renders the
live run in dev (inside the Vite plugin's `/__scenetest` page) and in
scenetest-cloud (a Worker-served page) — the host supplies a DOM element and a
transport adapter, nothing else.

```ts
import { mountDashboard, createDevTransport } from '@scenetest/dashboard'

const handle = mountDashboard(document.getElementById('root'), {
  transport: createDevTransport(),
})
// later: handle.unmount()
```

The widget renders into a **shadow root** with its own styles and fonts, so it
drops into any host without leaking styles in either direction and without the
host using Preact.

## Transport adapter

The only thing that differs between dev and cloud. The widget calls the
adapter to fetch a snapshot and subscribe to live events, and pushes user
actions back as protocol commands:

```ts
interface Transport {
  fetchState(): Promise<RunEvent[]>
  subscribe(onEvent: (e: RunEvent) => void, onStatus?: (s: ConnectionStatus) => void): () => void
  sendCommand(command: Command): Promise<void>
}
```

Events and commands are the `@scenetest/protocol` vocabulary. `createDevTransport()`
speaks to the Vite middleware (fetch + SSE); a cloud adapter speaks to the
worker (fetch + WebSocket). History may arrive through either `fetchState`
(snapshot) or the initial `subscribe` burst — the store folds both the same
way, so a transport picks whichever its backend makes natural (SSE replays the
buffer through `subscribe`, so the dev adapter's `fetchState` returns empty).

## Theming

The widget's only theming surface is a small set of CSS custom properties,
passed as `theme` and applied to the shadow host:

```ts
mountDashboard(el, {
  transport,
  theme: { bg: '#0b0d12', accent: '#7c93ff', font: 'IBM Plex Mono, monospace', fontSize: '12px' },
})
```

These map to `--st-bg`, `--st-accent`, `--st-font`, `--st-font-size`. Nothing
else is reachable; they are versioned with the widget, like the wire protocol.

## Store

`mountDashboard` is the entry point, but the event-folding logic is exported
separately and is DOM-free — useful for tests, SSR, or computing a rollup:

- `foldEvents(events)` / `applyEvent(state, event)` — reduce protocol events into `DashboardState`
- `initialState()`, `completedSceneCount(state)`, `withConnection(state, status)`
- `sceneSummary(scene)` — the plain-text "copy failures" summary
