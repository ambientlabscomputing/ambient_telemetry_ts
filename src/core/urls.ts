/** Fail closed: a sanitizer that throws must never let the raw URL through. */
export function safeUrl(fn: ((url: string) => string) | undefined, url: string): string {
  if (!fn) return url;
  try {
    const out = fn(url);
    return typeof out === "string" ? out : "/";
  } catch {
    return "/";
  }
}

interface EventLike {
  request?: { url?: string; query_string?: unknown; headers?: Record<string, string> };
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
}

const BREADCRUMB_URL_KEYS = ["url", "from", "to"] as const;

/** Scrubs a Sentry breadcrumb's URL fields in place. */
export function scrubBreadcrumb<T extends { data?: Record<string, unknown> }>(
  crumb: T,
  fn: ((url: string) => string) | undefined,
): T {
  if (!fn || !crumb.data) return crumb;
  for (const key of BREADCRUMB_URL_KEYS) {
    const value = crumb.data[key];
    if (typeof value === "string") crumb.data[key] = safeUrl(fn, value);
  }
  return crumb;
}

/** Scrubs the URLs on a Sentry event in place (structural type: works for every SDK). */
export function scrubEvent<T extends EventLike>(event: T, fn: ((url: string) => string) | undefined): T {
  if (!fn) return event;
  const req = event.request;
  if (req) {
    if (typeof req.url === "string") req.url = safeUrl(fn, req.url);
    // The sanitizer owns the URL; a separately stored query string would undo it.
    delete req.query_string;
    if (req.headers) {
      for (const name of Object.keys(req.headers)) {
        if (name.toLowerCase() === "referer") req.headers[name] = safeUrl(fn, req.headers[name]!);
      }
    }
  }
  event.breadcrumbs?.forEach((crumb) => scrubBreadcrumb(crumb, fn));
  return event;
}
