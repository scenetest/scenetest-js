import type { DashboardEvent } from './types.js'

/**
 * A single batched event on the wire. The protocol event is carried verbatim
 * as `payload`; `seq` is a monotonic counter assigned per run so the receiving
 * end can order (and de-duplicate) the stream regardless of HTTP arrival order.
 */
export interface ReportEnvelope {
  seq: number
  payload: DashboardEvent
}

export interface ReportUrlOptions {
  /** Caller-supplied HTTP endpoint. Opaque — the run id is baked into it. */
  url: string
  /** Optional bearer token, sent as `Authorization: Bearer <token>`. */
  token?: string
  /** Flush the queue at least this often (ms). Default 250. */
  flushIntervalMs?: number
  /** Flush eagerly once the queue reaches this many events. Default 50. */
  maxBatchSize?: number
  /** Per-request timeout (ms). Default 5000. */
  timeoutMs?: number
}

/**
 * Streams protocol events to a caller-supplied HTTP endpoint as the run
 * executes — the "speaking" half of the receiver/sink design.
 *
 * Contract:
 *   POST <url>  body: { "events": [{ "seq": n, "payload": <protocol event> }] }
 *
 * Events are batched (every `flushIntervalMs` or once `maxBatchSize` is
 * queued) and posted in order. `drain()` performs a final synchronous flush
 * before process exit so the tail of a run — including `run:end` — is never
 * lost.
 *
 * Fail soft: an unreachable or erroring endpoint logs a single warning and
 * never throws. Reporting is observability, not a gate on the run.
 */
export class ReportUrlReporter {
  private readonly url: string
  private readonly headers: Record<string, string>
  private readonly flushIntervalMs: number
  private readonly maxBatchSize: number
  private readonly timeoutMs: number

  private seq = 0
  private queue: ReportEnvelope[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  /** Serializes POSTs so batches arrive in seq order. */
  private chain: Promise<void> = Promise.resolve()
  private warned = false

  constructor(opts: ReportUrlOptions) {
    this.url = opts.url
    this.headers = { 'Content-Type': 'application/json' }
    if (opts.token) this.headers['Authorization'] = `Bearer ${opts.token}`
    this.flushIntervalMs = opts.flushIntervalMs ?? 250
    this.maxBatchSize = opts.maxBatchSize ?? 50
    this.timeoutMs = opts.timeoutMs ?? 5000
  }

  /** Enqueue an event. Non-blocking, never throws. */
  send(event: DashboardEvent): void {
    this.queue.push({ seq: this.seq++, payload: event })
    if (this.queue.length >= this.maxBatchSize) {
      void this.flush()
    } else {
      this.scheduleFlush()
    }
  }

  private scheduleFlush(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.flushIntervalMs)
    // Don't keep the process alive just for a pending flush.
    this.timer.unref?.()
  }

  /**
   * Hand the currently queued events to the POST chain. Returns once that
   * batch (and everything queued before it) has been delivered or failed.
   */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.queue.length === 0) return this.chain
    const batch = this.queue
    this.queue = []
    this.chain = this.chain.then(() => this.post(batch))
    return this.chain
  }

  /** Final flush — drains the queue and waits for all in-flight POSTs. */
  async drain(): Promise<void> {
    // flush() returns the tail of the POST chain, so awaiting it waits for
    // this batch and everything queued before it.
    await this.flush()
  }

  private async post(events: ReportEnvelope[]): Promise<void> {
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ events }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!res.ok) this.warn(`responded ${res.status}`)
    } catch (err) {
      this.warn(err instanceof Error ? err.message : String(err))
    }
  }

  /** Warn once — reporting failures shouldn't spam the run or fail it. */
  private warn(reason: string): void {
    if (this.warned) return
    this.warned = true
    console.warn(
      `[scenetest] report-url delivery to ${this.url} failed (${reason}); ` +
        `continuing without it. Reporting is observability, not a gate.`
    )
  }
}

// ─── Module-level singleton ─────────────────────────────────────────
// Set by the CLI before execution; fed by dashboardSend() alongside the
// dev-server dashboard reporter, so every emit site reaches both sinks.

let _reporter: ReportUrlReporter | null = null

export function setReportUrlReporter(reporter: ReportUrlReporter | null): void {
  _reporter = reporter
}

export function reportUrlSend(event: DashboardEvent): void {
  _reporter?.send(event)
}

/** Final flush before exit. No-op when no report URL was configured. */
export async function drainReportUrlReporter(): Promise<void> {
  await _reporter?.drain()
}
