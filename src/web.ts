import * as Sentry from "@sentry/browser";
import { createTelemetry } from "./core/client.js";
import type { SentryAdapter } from "./core/types.js";
import { scrubBreadcrumb, scrubEvent } from "./core/urls.js";

const SESSION_KEY = "ambient.telemetry.sid";
let memorySid: string | undefined;

/** One random id per browser tab (survives reloads, not new tabs). No PII. */
function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return (memorySid ??= crypto.randomUUID());
  }
}

const sentry: SentryAdapter = {
  init(o) {
    Sentry.init({
      dsn: o.dsn,
      environment: o.environment,
      release: o.release,
      sampleRate: o.sampleRate,
      tracesSampleRate: o.tracesSampleRate,
      sendDefaultPii: false,
      beforeSend: (event) => scrubEvent(event, o.sanitizeUrl),
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb, o.sanitizeUrl),
      defaultIntegrations: o.autoCaptureUnhandled ? undefined : false,
    });
    Sentry.setTag("app", o.app);
    // Applies to unhandled errors Sentry captures on its own too, not just captureError().
    Sentry.setTag("session_id", getSessionId());
  },
  captureException(err, ctx) {
    Sentry.captureException(err, { tags: ctx.tags, extra: ctx.extra, level: ctx.level });
  },
  setUser: (u) => Sentry.setUser(u),
  flush: (t) => Sentry.flush(t),
};

const t = createTelemetry({
  sentry,
  sessionId: getSessionId,
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
    referrer: () => document.referrer || undefined,
  },
});

export const { init, track, page, captureError, identify, reset, sessionId, flush } = t;
export type { TelemetryConfig, ErrorContext } from "./core/types.js";
