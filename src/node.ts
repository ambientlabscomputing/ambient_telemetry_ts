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
    userAgent: `ambient-telemetry-node/${process.version}`,
    currentUrl: () => "/",
  },
});

export const { init, track, page, captureError, identify, flush } = t;
export type { TelemetryConfig, ErrorContext } from "./core/types.js";
