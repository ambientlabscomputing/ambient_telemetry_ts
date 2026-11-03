import * as Sentry from "@sentry/node";
import { AsyncLocalStorage } from "node:async_hooks";
import { hostname } from "node:os";
import { createTelemetry } from "./core/client.js";
import { tagClientIp } from "./core/ip.js";
import type { ClientInfo, SentryAdapter } from "./core/types.js";
import { scrubBreadcrumb, scrubEvent } from "./core/urls.js";

const clientStore = new AsyncLocalStorage<ClientInfo>();

/**
 * Runs `fn` on behalf of one end user: every `track`, `page`, `identify` and error inside it
 * (including after `await`s) carries `info.ip` when `captureIp` is on. Wrap each request:
 *
 *     app.use((req, _res, next) => withClient({ ip: req.ip }, next)); // Express
 *
 * Only pass an address you trust. Behind a proxy that means configuring your framework's
 * trusted-proxy setting (Express `trust proxy`, Fastify `trustProxy`) so `req.ip` is derived
 * safely, not reading a client-supplied `X-Forwarded-For` yourself.
 */
export const withClient = <T>(info: ClientInfo, fn: () => T): T => clientStore.run(info, fn);

const sentry: SentryAdapter = {
  init(o) {
    Sentry.init({
      dsn: o.dsn,
      environment: o.environment,
      release: o.release,
      sampleRate: o.sampleRate,
      tracesSampleRate: o.tracesSampleRate,
      sendDefaultPii: false,
      // Errors Sentry captures on its own (unhandled) never pass through captureError().
      beforeSend: (event) => tagClientIp(scrubEvent(event, o.sanitizeUrl), o.clientIp?.()),
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb, o.sanitizeUrl),
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
  client: () => clientStore.getStore(),
  context: {
    hostname: hostname(),
    // Umami drops non-browser-looking User-Agents ({"beep":"boop"}), so keep the browser prefix.
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 ambient-telemetry-ts/${process.versions.node}`,
    currentUrl: () => "/",
  },
});

export const { init, track, page, captureError, identify, reset, sessionId, flush } = t;
export type { TelemetryConfig, ErrorContext, ClientInfo } from "./core/types.js";
