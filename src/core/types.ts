export type Data = Record<string, unknown>;
export type Level = "fatal" | "error" | "warning" | "info" | "debug";

export interface ErrorContext {
  tags?: Record<string, string>;
  extra?: Data;
  level?: Level;
}

export interface TelemetryConfig {
  app: string;
  environment: string;
  release?: string;
  glitchtip?: { dsn: string; sampleRate?: number; tracesSampleRate?: number };
  umami?: { host: string; websiteId: string };
  /** Kill switch. Defaults to true. */
  enabled?: boolean;
  /** Return null to drop the error. */
  beforeSend?: (err: Error, ctx: ErrorContext) => { err: Error; ctx: ErrorContext } | null;
  /** Return null to drop the event. */
  beforeTrack?: (name: string, data?: Data) => { name: string; data?: Data } | null;
  autoCaptureUnhandled?: boolean;
  debug?: boolean;
  /**
   * Rewrites every page URL before it leaves the app: the `url` sent to Umami (pageviews and
   * events) and the URLs Sentry attaches to errors (`request.url`, the Referer header,
   * navigation/fetch breadcrumbs, and the query string). Use it to drop query strings that
   * carry one-time secrets and to collapse ids in paths. Receives a path (`/a?b=1`) or an
   * absolute URL; return the same shape. If it throws, the URL is replaced by `/`.
   */
  sanitizeUrl?: (url: string) => string;
}

/** Page/device context Umami needs; supplied per platform. */
export interface UmamiContext {
  hostname: string;
  language?: string;
  screen?: string;
  userAgent?: string;
  /** Default url for page()/track() when none is given. */
  currentUrl(): string;
  currentTitle?(): string | undefined;
  /** Where the visitor came from; lets Umami attribute traffic sources. */
  referrer?(): string | undefined;
}

export interface SentryAdapter {
  init(opts: {
    dsn: string;
    environment: string;
    release?: string;
    sampleRate?: number;
    tracesSampleRate: number;
    autoCaptureUnhandled: boolean;
    app: string;
    sanitizeUrl?: (url: string) => string;
  }): void;
  captureException(err: Error, ctx: ErrorContext): void;
  setUser(user: { id: string } | null): void;
  flush(timeoutMs?: number): Promise<boolean>;
}

export interface Platform {
  sentry: SentryAdapter;
  context: UmamiContext;
  fetch?: typeof fetch;
  /** Stable id for this app instance/tab. Attached to every event and error, and sent to the
   * backend (see `sessionId()`), so client events and server errors can be joined. */
  sessionId?: () => string | undefined;
}
