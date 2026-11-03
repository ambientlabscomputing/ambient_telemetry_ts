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
  /**
   * Record the end user's public IP so events and errors can be filtered by it. Off by default:
   * an IP is personal data. Only has an effect where the platform can say who the caller is
   * (the Node entry's `withClient`); browser and mobile clients are already seen with their real
   * IP by Umami and GlitchTip, which read it from the connection.
   *
   * When on, the IP goes to Umami as the event's IP (so geo and the visitor hash describe the
   * user, not this server) and as a `client_ip` event property, and to GlitchTip as a
   * `client_ip` tag. A tag, because GlitchTip overwrites `user.ip_address` with the sender's IP.
   */
  captureIp?: boolean;
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
    /** The current caller's public IP (only when `captureIp` is on); lets an adapter tag the
     * errors Sentry captures on its own, which never pass through `captureError()`. */
    clientIp?: () => string | undefined;
  }): void;
  captureException(err: Error, ctx: ErrorContext): void;
  setUser(user: { id: string } | null): void;
  flush(timeoutMs?: number): Promise<boolean>;
}

/** Who the current request/task is being done for. */
export interface ClientInfo {
  /** The end user's address. Non-public addresses are ignored. */
  ip?: string;
}

export interface Platform {
  sentry: SentryAdapter;
  context: UmamiContext;
  fetch?: typeof fetch;
  /** Stable id for this app instance/tab. Attached to every event and error, and sent to the
   * backend (see `sessionId()`), so client events and server errors can be joined. */
  sessionId?: () => string | undefined;
  /** The end user the current call is made for. Only server platforms provide it. */
  client?: () => ClientInfo | undefined;
}
