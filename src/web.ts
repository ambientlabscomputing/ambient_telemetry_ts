import * as Sentry from "@sentry/browser";
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
      defaultIntegrations: o.autoCaptureUnhandled ? undefined : false,
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
    get hostname() {
      return location.hostname;
    },
    get language() {
      return navigator.language;
    },
    get screen() {
      return `${screen.width}x${screen.height}`;
    },
    currentUrl: () => location.pathname + location.search,
    currentTitle: () => document.title,
  },
});

export const { init, track, page, captureError, identify, flush } = t;
export type { TelemetryConfig, ErrorContext } from "./core/types.js";
