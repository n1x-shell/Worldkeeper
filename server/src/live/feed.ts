/**
 * The change feed (v0.9.7, docs/BETA_PLAN.md B4): tells open pages that something in the library changed, so they
 * look again at once instead of asking every few seconds. It says only "changed": each page then fetches what it
 * shows through its usual routes, so nothing travels here that those routes wouldn't give.
 *
 * It works the same whether the table runs inside the GM's app (one database connection, whose own writes count up
 * `total_changes()`) or as its own process (`PRAGMA data_version` moves when another connection commits).
 */
import type { Request, Response } from 'express';
import type { AppContext } from '../context.js';

type Sink = (chunk: string) => void;

export class ChangeFeed {
  private sinks = new Set<Sink>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = '';

  constructor(
    private ctx: AppContext,
    private everyMs = 400,
  ) {}

  /** A value that differs whenever the open library's data does (or the open library itself). */
  stamp(): string {
    try {
      const db = this.ctx.db;
      const version = db.pragma('data_version', { simple: true }) as number;
      const own = (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
      return `${db.name}|${version}|${own}`;
    } catch {
      return 'closed'; // between libraries; the next look sees the new one
    }
  }

  /** Look once; tell every listener if something changed since the last look. True when it did. */
  check(): boolean {
    const now = this.stamp();
    if (now === this.last) return false;
    this.last = now;
    for (const send of this.sinks) send('event: change\ndata: {}\n\n');
    return true;
  }

  /** Listen. Returns how to stop. The feed only looks while someone listens. */
  listen(send: Sink): () => void {
    if (!this.sinks.size) {
      this.last = this.stamp();
      this.timer = setInterval(() => this.check(), this.everyMs);
      this.timer.unref();
    }
    this.sinks.add(send);
    return () => {
      this.sinks.delete(send);
      if (!this.sinks.size && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  get listeners() {
    return this.sinks.size;
  }
}

const feeds = new WeakMap<AppContext, ChangeFeed>();
export function feedFor(ctx: AppContext): ChangeFeed {
  let f = feeds.get(ctx);
  if (!f) feeds.set(ctx, (f = new ChangeFeed(ctx)));
  return f;
}

/** An event stream of the context's changes (Server-Sent Events), kept open until the page goes. */
export function streamChanges(ctx: AppContext) {
  return (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    // Reconnect after 3 seconds if the connection drops; the first comment opens the stream for the browser.
    res.write('retry: 3000\n: connected\n\n');
    const stop = feedFor(ctx).listen((chunk) => res.write(chunk));
    // A comment now and then keeps the connection from being closed as idle.
    const beat = setInterval(() => res.write(': still here\n\n'), 25000);
    beat.unref();
    req.on('close', () => {
      clearInterval(beat);
      stop();
    });
  };
}
