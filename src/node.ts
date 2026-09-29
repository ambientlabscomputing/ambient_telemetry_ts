import * as Sentry from "@sentry/node";
import { hostname } from "node:os";
import { createTelemetry } from "./core/client.js";
import type { SentryAdapter } from "./core/types.js";

const sentry: SentryAdapter = {
  init(o) {
    Sentry.init({
      dsn: o.dsn,
      environment: o.environment,
      release: o.release,
      sampleRate: o.sampleRate,
      tracesSampleRate: o.tracesSampleRate,
      sendDefaultPii: false,
    });
    Sentry.setTag("app", o.app);
  },
  captureException(err, ctx) {
    Sentry.captureException(err, { tags: ctx.tags, extra: ctx.extra, level: ctx.level });
  },
  setUser: (u) => Sentry.setUser(u),
  flush: (t) => Sentry.flush(t),
};

const t = createTelemetry({
  sentry,
  context: {
    hostname: hostname(),
    // Umami drops non-browser-looking User-Agents ({"beep":"boop"}), so keep the browser prefix.
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 ambient-telemetry-ts/${process.versions.node}`,
    currentUrl: () => "/",
  },
});

export const { init, track, page, captureError, identify, reset, sessionId, flush } = t;
export type { TelemetryConfig, ErrorContext } from "./core/types.js";
