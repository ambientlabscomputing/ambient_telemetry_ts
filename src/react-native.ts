import * as Sentry from "@sentry/react-native";
import { Dimensions, Platform } from "react-native";
import { createTelemetry } from "./core/client.js";
import type { SentryAdapter } from "./core/types.js";
import { scrubBreadcrumb, scrubEvent } from "./core/urls.js";

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
      enableNative: true,
    });
    Sentry.setTag("app", o.app);
  },
  captureException(err, ctx) {
    Sentry.captureException(err, { tags: ctx.tags, extra: ctx.extra, level: ctx.level });
  },
  setUser: (u) => Sentry.setUser(u),
  flush: () => Sentry.flush(),
};

let currentScreen = "/";

const t = createTelemetry({
  sentry,
  context: {
    hostname: "app.mobile", // Umami requires a hostname; override via a real domain if you filter on it
    get screen() {
      const { width, height } = Dimensions.get("window");
      return `${Math.round(width)}x${Math.round(height)}`;
    },
    // Umami drops non-browser-looking User-Agents ({"beep":"boop"}), so keep the browser prefix.
    userAgent: `Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 ambient-telemetry-rn/${Platform.OS}/${String(Platform.Version)}`,
    currentUrl: () => currentScreen,
  },
});

/** RN has no URLs: pass a screen name like "/screens/Home". */
export const page = (screenName?: string, title?: string) => {
  if (screenName) currentScreen = screenName;
  t.page(screenName, title);
};
export const { init, track, captureError, identify, reset, sessionId, flush } = t;
export type { TelemetryConfig, ErrorContext } from "./core/types.js";
