import { describe, expect, it, vi } from "vitest";
import { createTelemetry } from "../src/core/client.js";
import type { Platform, SentryAdapter } from "../src/core/types.js";

function setup() {
  const sentry: SentryAdapter = {
    init: vi.fn(),
    captureException: vi.fn(),
    setUser: vi.fn(),
    flush: vi.fn(async () => true),
  };
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ cache: "tok1" }), { status: 200 });
  }) as unknown as typeof fetch;
  const platform: Platform = {
    sentry,
    fetch: fakeFetch,
    context: { hostname: "h.test", userAgent: "ua/1", currentUrl: () => "/p", language: "en", referrer: () => "https://ref.test/" },
  };
  return { sentry, calls, t: createTelemetry(platform), fakeFetch };
}

const base = {
  app: "demo",
  environment: "test",
  glitchtip: { dsn: "https://k@gt.test/1" },
  umami: { host: "https://u.test/", websiteId: "w1" },
};

describe("telemetry client", () => {
  it("queues calls before init and replays them", async () => {
    const { t, calls, sentry } = setup();
    t.track("early", { a: 1 });
    t.captureError("boom");
    expect(calls).toHaveLength(0);
    t.init(base);
    await t.flush();
    expect(calls).toHaveLength(1);
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("sends the Umami payload with UA and cache token", async () => {
    const { t, calls } = setup();
    t.init(base);
    t.track("click", { password: "x", n: 1 });
    await t.flush();
    t.track("second");
    await t.flush();
    expect(calls[0]!.url).toBe("https://u.test/api/send");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toMatchObject({
      type: "event",
      payload: { website: "w1", hostname: "h.test", url: "/p", referrer: "https://ref.test/", name: "click", data: { password: "[redacted]", n: 1 } },
    });
    expect((calls[0]!.init.headers as Record<string, string>)["User-Agent"]).toBe("ua/1");
    expect((calls[1]!.init.headers as Record<string, string>)["x-umami-cache"]).toBe("tok1");
  });

  it("normalizes non-Error throwables and tags the app", () => {
    const { t, sentry } = setup();
    t.init(base);
    t.captureError({ code: 5 });
    const [err, ctx] = (sentry.captureException as any).mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(ctx.tags.app).toBe("demo");
  });

  it("honors enabled=false and hooks, and never throws", () => {
    const off = setup();
    off.t.init({ ...base, enabled: false });
    off.t.track("x");
    off.t.captureError("e");
    expect(off.fakeFetch).not.toHaveBeenCalled();
    expect(off.sentry.captureException).not.toHaveBeenCalled();

    const on = setup();
    (on.sentry.captureException as any).mockImplementation(() => {
      throw new Error("sdk down");
    });
    on.t.init({ ...base, beforeTrack: () => null });
    expect(() => on.t.captureError("e")).not.toThrow();
    on.t.track("dropped");
    expect(on.fakeFetch).not.toHaveBeenCalled();
  });

  it("retries transient failures and drops 4xx", async () => {
    const { sentry } = setup();
    let n = 0;
    const f = vi.fn(async () => (++n < 3 ? new Response("", { status: 503 }) : new Response("{}", { status: 200 })));
    const t = createTelemetry({ sentry, fetch: f as any, context: { hostname: "h", currentUrl: () => "/" } });
    t.init({ ...base, glitchtip: undefined });
    t.track("r");
    await t.flush(5000);
    expect(f).toHaveBeenCalledTimes(3);

    const f4 = vi.fn(async () => new Response("", { status: 400 }));
    const t2 = createTelemetry({ sentry, fetch: f4 as any, context: { hostname: "h", currentUrl: () => "/" } });
    t2.init({ ...base, glitchtip: undefined });
    t2.track("bad");
    await t2.flush();
    expect(f4).toHaveBeenCalledTimes(1);
  });
});

describe("sanitizeUrl", () => {
  const strip = (u: string) => u.split("?")[0]!.replace(/\/projects\/[^/]+/, "/projects/:id");

  it("rewrites the url on events and pageviews, default and explicit", async () => {
    const { t, calls } = setup();
    t.init({ ...base, sanitizeUrl: strip });
    t.track("a");
    t.page("/projects/hq-renovation?code=SECRET", "T");
    await t.flush();
    const bodies = calls.map((c) => JSON.parse(c.init.body as string).payload.url);
    expect(bodies).toEqual(["/p", "/projects/:id"]);
  });

  it("fails closed when the sanitizer throws", async () => {
    const { t, calls } = setup();
    t.init({
      ...base,
      sanitizeUrl: () => {
        throw new Error("bug");
      },
    });
    t.track("a");
    await t.flush();
    expect(JSON.parse(calls[0]!.init.body as string).payload.url).toBe("/");
  });

  it("hands the sanitizer to the Sentry adapter", () => {
    const { t, sentry } = setup();
    t.init({ ...base, sanitizeUrl: strip });
    expect((sentry.init as ReturnType<typeof vi.fn>).mock.calls[0]![0].sanitizeUrl).toBe(strip);
  });
});
