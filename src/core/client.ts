import { normalizeError, scrub } from "./errors.js";
import type { Data, ErrorContext, Platform, TelemetryConfig } from "./types.js";
import { UmamiTransport } from "./umami.js";

const MAX_PENDING = 50;

export interface Telemetry {
  init(config: TelemetryConfig): void;
  track(name: string, data?: Data): void;
  page(url?: string, title?: string): void;
  captureError(err: unknown, ctx?: ErrorContext): void;
  identify(userId: string, traits?: Data): void;
  /** Sign-out: forget the identified user in both backends. */
  reset(): void;
  /** Per-tab id also attached to events/errors; send it to your API (e.g. `X-Ambient-Session`). */
  sessionId(): string | undefined;
  flush(timeoutMs?: number): Promise<boolean>;
}

/** Builds a telemetry instance bound to a platform. Platform entry points call this. */
export function createTelemetry(platform: Platform): Telemetry {
  let cfg: TelemetryConfig | undefined;
  let umami: UmamiTransport | undefined;
  let pending: Array<() => void> = [];

  const log = (...a: unknown[]) => cfg?.debug && console.debug("[ambient-telemetry]", ...a);

  // Never throw into the host app. Before init, buffer; after init with enabled=false, no-op.
  const call = (fn: () => void) => {
    if (!cfg) {
      if (pending.length >= MAX_PENDING) pending.shift();
      pending.push(fn);
      return;
    }
    if (cfg.enabled === false) return;
    try {
      fn();
    } catch (e) {
      log("swallowed error", e);
    }
  };

  const validate = (c: TelemetryConfig) => {
    if (!c.app || !c.environment) throw new Error("telemetry: `app` and `environment` are required");
    if (c.umami && (!c.umami.host || !c.umami.websiteId)) throw new Error("telemetry: umami needs host and websiteId");
    if (c.glitchtip && !c.glitchtip.dsn) throw new Error("telemetry: glitchtip needs dsn");
  };

  return {
    init(config) {
      try {
        validate(config);
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        return; // misconfiguration must not crash the app
      }
      cfg = config;
      if (config.enabled !== false) {
        try {
          if (config.glitchtip) {
            platform.sentry.init({
              dsn: config.glitchtip.dsn,
              environment: config.environment,
              release: config.release,
              sampleRate: config.glitchtip.sampleRate,
              tracesSampleRate: config.glitchtip.tracesSampleRate ?? 0,
              autoCaptureUnhandled: config.autoCaptureUnhandled ?? true,
              app: config.app,
            });
          }
          if (config.umami) {
            umami = new UmamiTransport(config.umami, platform.context, platform.fetch ?? fetch, {
              debug: config.debug,
            });
          }
        } catch (e) {
          log("init failed", e);
        }
      }
      const queued = pending;
      pending = [];
      queued.forEach(call);
    },

    track(name, data) {
      call(() => {
        let ev: { name: string; data?: Data } | null = { name, data: data && scrub(data) };
        if (cfg?.beforeTrack) ev = cfg.beforeTrack(ev.name, ev.data);
        const sid = platform.sessionId?.();
        if (ev) umami?.event(ev.name, sid ? { session_id: sid, ...ev.data } : ev.data);
      });
    },

    page(url, title) {
      call(() => umami?.pageview(url, title));
    },

    captureError(err, ctx = {}) {
      call(() => {
        const sid = platform.sessionId?.();
        let out: { err: Error; ctx: ErrorContext } | null = {
          err: normalizeError(err),
          ctx: {
            ...ctx,
            tags: { app: cfg!.app, ...(sid ? { session_id: sid } : {}), ...ctx.tags },
            extra: ctx.extra && scrub(ctx.extra),
          },
        };
        if (cfg?.beforeSend) out = cfg.beforeSend(out.err, out.ctx);
        if (out && cfg?.glitchtip) platform.sentry.captureException(out.err, out.ctx);
      });
    },

    identify(userId, traits) {
      call(() => {
        platform.sentry.setUser({ id: userId });
        umami?.identify(userId, traits && scrub(traits));
      });
    },

    reset() {
      call(() => {
        platform.sentry.setUser(null);
        umami?.reset();
      });
    },

    sessionId: () => platform.sessionId?.(),

    async flush(timeoutMs = 2000) {
      try {
        // Sentry.flush() reports false when no client exists (glitchtip not configured); that's not a failure.
        const r = await Promise.all([
          cfg?.glitchtip ? platform.sentry.flush(timeoutMs) : true,
          umami?.flush(timeoutMs) ?? true,
        ]);
        return r.every(Boolean);
      } catch {
        return false;
      }
    },
  };
}
