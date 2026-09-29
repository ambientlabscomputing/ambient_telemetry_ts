import type { Data, UmamiContext } from "./types.js";
import { safeUrl } from "./urls.js";

const MAX_QUEUE = 100;
const MAX_ATTEMPTS = 4;

interface Job {
  body: string;
  attempts: number;
}

export class UmamiTransport {
  private cacheToken?: string;
  private distinctId?: string;
  private queue: Job[] = [];
  private draining = false;
  private inflight = new Set<Promise<void>>();

  constructor(
    private cfg: { host: string; websiteId: string },
    private ctx: UmamiContext,
    private doFetch: typeof fetch,
    private opts: {
      timeoutMs?: number;
      baseDelayMs?: number;
      debug?: boolean;
      sanitizeUrl?: (url: string) => string;
    } = {},
  ) {}

  event(name: string | undefined, data: Data | undefined, url?: string): void {
    this.enqueue("event", { name, data, url });
  }

  pageview(url?: string, title?: string): void {
    this.enqueue("event", { url, title });
  }

  identify(id: string, data?: Data): void {
    this.distinctId = id;
    this.enqueue("identify", { id, data });
  }

  /** Sign-out: later events stop carrying the previous user's id. */
  reset(): void {
    this.distinctId = undefined;
  }

  async flush(timeoutMs = 2000): Promise<boolean> {
    const start = Date.now();
    while ((this.queue.length || this.inflight.size) && Date.now() - start < timeoutMs) {
      // Always yield to a real timer; awaiting only settled promises would starve retry timeouts.
      await new Promise((r) => setTimeout(r, 25));
    }
    return this.queue.length === 0 && this.inflight.size === 0;
  }

  private enqueue(type: "event" | "identify", extra: Record<string, unknown>): void {
    const c = this.ctx;
    const payload: Record<string, unknown> = {
      website: this.cfg.websiteId,
      hostname: c.hostname,
      language: c.language,
      screen: c.screen,
      url: safeUrl(this.opts.sanitizeUrl, String(extra.url ?? c.currentUrl())),
      title: extra.title ?? c.currentTitle?.(),
      referrer: c.referrer?.(),
      name: extra.name,
      data: extra.data,
      // Like Umami's own tracker: once identified, every later event carries the distinct id.
      id: extra.id ?? this.distinctId,
    };
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push({ body: JSON.stringify({ type, payload }), attempts: 0 });
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const job = this.queue[0]!;
        const p = this.send(job);
        this.inflight.add(p);
        const ok = await p.then(() => true, () => false);
        this.inflight.delete(p);
        if (ok) {
          this.queue.shift();
        } else if (++job.attempts >= MAX_ATTEMPTS) {
          this.queue.shift();
        } else {
          const base = this.opts.baseDelayMs ?? 500;
          await new Promise((r) => setTimeout(r, base * 2 ** (job.attempts - 1)));
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async send(job: Job): Promise<void> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.ctx.userAgent) headers["User-Agent"] = this.ctx.userAgent;
    if (this.cacheToken) headers["x-umami-cache"] = this.cacheToken;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timer = ctrl && setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 5000);
    try {
      const res = await this.doFetch(`${this.cfg.host.replace(/\/+$/, "")}/api/send`, {
        method: "POST",
        headers,
        body: job.body,
        keepalive: true,
        signal: ctrl?.signal,
      });
      if (!res.ok) {
        // 4xx (other than 429) will never succeed on retry; drop rather than loop.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) return;
        throw new Error(`umami ${res.status}`);
      }
      const json = (await res.json().catch(() => undefined)) as { cache?: string } | undefined;
      if (json?.cache) this.cacheToken = json.cache;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
