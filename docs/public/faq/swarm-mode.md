## What is "swarm mode"?

Swarm mode is a diagnostic escalation that runs when failures persist beyond normal thresholds. Instead of running scenes with one team at a time, swarm mode runs **all teams concurrently** against the failing scenes — multiple times each — to classify what's actually wrong.

### When does it trigger?

**Automatically:** When a scene fails N consecutive times (default: 5), Scenetest detects that something is persistently broken and triggers swarm mode for that scene.

```
Run 1: checkout → FAIL
Run 2: checkout → FAIL
Run 3: checkout → FAIL
Run 4: checkout → FAIL
Run 5: checkout → FAIL  ← threshold reached, swarm triggers
```

The threshold and window are configurable:

```typescript
swarm: {
  failureThreshold: 5,  // consecutive failures before auto-trigger
  windowSize: 3,        // how many recent runs to consider
  auto: true,           // set to false to disable auto-triggering
}
```

**Manually:** Force swarm mode with the `--swarm` flag:

```bash
scenetest --swarm
```

This runs all scenes against all teams immediately, regardless of failure history.

### What does it do?

Swarm mode runs each failing scene against **every team** in your pool, **multiple times** (default: 3 repeats). With 10 teams and 3 repeats, that's 30 runs per scene.

After execution, each scene gets classified:

| Classification | Meaning |
|----------------|---------|
| **broken** | Fails 100% of the time across all teams and repeats |
| **flaky** | Fails intermittently — sometimes passes, sometimes fails |
| **seed-data-edge-case** | Some teams always fail, others always pass |
| **healthy** | Passes consistently — the original failures were transient |

### Why is "seed-data-edge-case" useful?

This is the hidden gem. If your test fails with Team A's data but passes with Team B's data, that's not a flaky test — it's an **edge case in your application** that only manifests with certain seed data.

For example:
- Team A has a user with a special character in their username
- Team B has a user with a normal username
- The search feature breaks on special characters

Without swarm mode, you might dismiss this as "flaky" and move on. With swarm mode, you see that Team A *always* fails and Team B *always* passes — revealing a real bug tied to specific data conditions.

### Will it overwhelm my machine?

**No — concurrency is throttled.** The `concurrency` setting limits how many teams run in parallel:

```typescript
swarm: {
  concurrency: 4,  // max 4 teams running at once
}
```

With `concurrency: 4`, you'll have at most 4 browser contexts active simultaneously. The work queue processes the remaining tasks as contexts free up.

There's still only **one browser process** — Playwright shares a single browser instance across all contexts. Each context is lightweight (~50-100MB), so 4 concurrent contexts use 200-400MB total.

**Recommendations:**

```typescript
// Local development (limited RAM)
swarm: { concurrency: Math.min(4, os.cpus().length) }

// CI (more resources)
swarm: { concurrency: 8 }
```

### What shows up in reports?

HTML and JSON reports include a swarm section when swarm mode runs:

```
══════════════════════════════════════════════════
  SWARM MODE
══════════════════════════════════════════════════
  Trigger:     auto
  Scenes:      2
  Teams:       10
  Repeats:     3
  Concurrency: 4
══════════════════════════════════════════════════

  Swarming: checkout
  ....F.F...F.....F....F.......
    FLAKY - intermittent failures (24/30 passed)

  Swarming: user profile
  FFFFFFFFFF....................
    SEED DATA EDGE CASE - team-specific failures (20/30 passed)
    Failing teams: 0, 1, 2, 3, 4

──────────────────────────────────────────────────
  Swarm Results
──────────────────────────────────────────────────
  BROKEN:          0 scene(s)
  FLAKY:           1 scene(s)
  SEED DATA EDGE:  1 scene(s)
  HEALTHY:         0 scene(s)
──────────────────────────────────────────────────
```

### Can I use swarm mode with device rotation?

Yes. When both are enabled, each actor in each swarm run gets a rotating device assignment. This means the same scene might run on iPhone in one iteration and Desktop in another — helping surface device-specific issues during the diagnostic pass.
