import type { ServerResponse } from 'http'

/**
 * Simple SSE fan-out hub for dashboard events.
 *
 * - POST handler pushes events to all connected SSE clients
 * - GET handler registers an SSE connection
 * - Keeps a ring buffer of recent events so late-joining clients catch up
 */

interface DashboardEvent {
  type: string
  timestamp: number
  [key: string]: unknown
}

const MAX_BUFFER_SIZE = 2000

export class EventHub {
  private clients = new Set<ServerResponse>()
  private buffer: DashboardEvent[] = []

  /** Register an SSE client connection. */
  addClient(res: ServerResponse): void {
    // Set up SSE headers. Deliberately no Access-Control-Allow-Origin:
    // the only browser consumers are the dashboard pages this same
    // middleware serves (same-origin), and the buffered events may
    // reference test activity that shouldn't be readable cross-origin.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    // Send buffered events so late joiners catch up
    for (const event of this.buffer) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    this.clients.add(res)

    // Clean up on disconnect
    res.on('close', () => {
      this.clients.delete(res)
    })
  }

  /** Broadcast an event to all connected clients and buffer it. */
  push(event: DashboardEvent): void {
    // Buffer for late joiners
    this.buffer.push(event)
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE)
    }

    // Fan out to all connected SSE clients
    const data = `data: ${JSON.stringify(event)}\n\n`
    for (const client of this.clients) {
      client.write(data)
    }
  }

  /** Clear the buffer (e.g., on new run). */
  clear(): void {
    this.buffer = []
  }

  get clientCount(): number {
    return this.clients.size
  }
}
