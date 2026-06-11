# @scenetest/protocol

The typed event and command vocabulary shared by every part of scenetest:
the CLI runner, the injected client listener, the Vite plugin's dev
middleware, the dashboard, and the cloud service.

Everything else in the system is an implementation behind this vocabulary.
The dependency arrow always points here — the open-source tool works
without the cloud service existing, and the cloud service consumes the
same published package the CLI does. Producers and consumers routinely run
at different versions (last month's CLI against today's worker), so wire
changes route through a release of this package where the skew stays
visible.

## Events

`RunEvent` is the union of everything that crosses the wire:

| Type | Meaning |
|---|---|
| `run:start` | A run began (consumers reset live state) |
| `scene:start` / `scene:end` | Scene lifecycle, with team metadata |
| `action:start` / `action:end` | One actor DSL action (click, fill, …) |
| `assertion` | An inline `should()` / `failed()` resolved |
| `warning` | Unexpected path in the test script itself |
| `run:progress` | Throttled coarse rollup (`pct`, `failing`, `flaky`) for home-view tiles |
| `run:end` | Run finished, with the full `RunSummary` |

## Commands

`Command` flows the reverse path, viewer → runner: `run:replay` (optionally
scoped to a `file` and/or `team`), `run:stop`, `run:pause`, `run:resume`.

## Codec

```ts
import { decodeEvent, encodeEvent, isEventShaped } from '@scenetest/protocol'

const event = decodeEvent(wireMessage) // RunEvent | null — strict, never throws
```

Two levels of validation, for two jobs:

- `decodeEvent` / `decodeCommand` — strict: known type tag, required
  fields present. For consumers that act on contents (recorders, rollups,
  command queues).
- `isEventShaped` — minimal envelope check. For relays that fan events out
  without interpreting them (the dev SSE hub, a Durable Object fan-out): a
  relay validating strictly would drop event types newer than itself.

All validators tolerate unknown extra fields; additive changes are
non-breaking and do not bump `PROTOCOL_VERSION`.
