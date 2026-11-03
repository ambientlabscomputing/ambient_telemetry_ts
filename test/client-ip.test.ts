import { describe, expect, it, vi } from "vitest";
import { createTelemetry } from "../src/core/client.js";
import type { ClientInfo, SentryAdapter, TelemetryConfig } from "../src/core/types.js";

// `null` = the platform has no caller for this call; omitted = a caller at 8.8.8.8.
function setup(config: Partial<TelemetryConfig> = {}, client: ClientInfo | null = { ip: "8.8.8.8" }) {
  const sentry: SentryAdapter = {
    init: vi.fn(),
    captureException: vi.fn(),
    setUser: vi.fn(),
    flush: vi.fn(async () => true),
  };
  const bodies: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const fakeFetch = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  let current: ClientInfo | undefined = client ?? undefined;
  const t = createTelemetry({
    sentry,
    fetch: fakeFetch,
    client: () => current,
    context: { hostname: "h.test", currentUrl: () => "/p" },
  });
  t.init({
    app: "demo",
    environment: "test",
    glitchtip: { dsn: "https://k@gt.test/1" },
    umami: { host: "https://u.test", websiteId: "w1" },
    ...config,
  });
  return { sentry, bodies, t, setClient: (c: ClientInfo | undefined) => (current = c) };
}

describe("captureIp", () => {
  it("sends the user's IP to Umami on events, pageviews and identify, plus a client_ip property", async () => {
    const { t, bodies } = setup({ captureIp: true });
    t.track("clicked", { n: 1 });
    t.page("/y", "Y");
    t.identify("u-1", { plan: "pro" });
    await t.flush();
    const [track, page, identify] = bodies.map((b) => b.payload);
    expect(track).toMatchObject({ ip: "8.8.8.8", data: { n: 1, client_ip: "8.8.8.8" } });
    expect(page).toMatchObject({ ip: "8.8.8.8", url: "/y" });
    expect(identify).toMatchObject({ ip: "8.8.8.8", id: "u-1" });
  });

  it("tags errors with the user's IP, and lets an explicit tag win", () => {
    const { t, sentry } = setup({ captureIp: true });
    t.captureError(new Error("boom"));
    t.captureError(new Error("boom"), { tags: { client_ip: "custom" } });
    const calls = (sentry.captureException as any).mock.calls;
    expect(calls[0][1].tags).toEqual({ app: "demo", client_ip: "8.8.8.8" });
    expect(calls[1][1].tags.client_ip).toBe("custom");
  });

  it("hands the adapter a clientIp reader for errors Sentry captures on its own", () => {
    const { sentry, setClient } = setup({ captureIp: true });
    const { clientIp } = (sentry.init as any).mock.calls[0][0];
    expect(clientIp()).toBe("8.8.8.8");
    setClient({ ip: "1.1.1.1" }); // follows the current caller
    expect(clientIp()).toBe("1.1.1.1");
    setClient(undefined);
    expect(clientIp()).toBeUndefined();
  });

  it("records nothing unless captureIp is on", async () => {
    const { t, bodies, sentry } = setup(); // default: off
    t.track("clicked");
    t.page("/y");
    t.identify("u-1");
    t.captureError(new Error("boom"));
    await t.flush();
    for (const b of bodies) expect(JSON.stringify(b)).not.toMatch(/"ip"|client_ip/);
    expect((sentry.captureException as any).mock.calls[0][1].tags).toEqual({ app: "demo" });
    expect(((sentry.init as any).mock.calls[0][0].clientIp as () => unknown)()).toBeUndefined();
  });

  it("ignores private, junk and missing addresses, and leaves event data untouched", async () => {
    for (const client of [{ ip: "10.0.0.5" }, { ip: "nope" }, {}, null]) {
      const { t, bodies } = setup({ captureIp: true }, client);
      t.track("clicked");
      await t.flush();
      expect(bodies[0]!.payload).not.toHaveProperty("ip");
      expect(bodies[0]!.payload).not.toHaveProperty("data"); // no stray `data: {}`
    }
  });

  it("normalizes the address before sending", async () => {
    const { t, bodies } = setup({ captureIp: true }, { ip: "::ffff:8.8.8.8" });
    t.track("clicked");
    await t.flush();
    expect(bodies[0]!.payload.ip).toBe("8.8.8.8");
  });

  it("keeps the app's own data keys and still honours beforeTrack", async () => {
    const dropped = setup({ captureIp: true, beforeTrack: () => null });
    dropped.t.track("clicked");
    await dropped.t.flush();
    expect(dropped.bodies).toEqual([]);

    const { t, bodies } = setup({ captureIp: true });
    t.track("clicked", { client_ip: "app-set" });
    await t.flush();
    expect(bodies[0]!.payload.data).toEqual({ client_ip: "app-set" });
  });

  it("works for platforms that cannot say who the caller is (web, React Native)", async () => {
    const sentry: SentryAdapter = { init: vi.fn(), captureException: vi.fn(), setUser: vi.fn(), flush: vi.fn(async () => true) };
    const bodies: Array<{ payload: Record<string, unknown> }> = [];
    const t = createTelemetry({
      sentry,
      fetch: (async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return new Response("{}");
      }) as unknown as typeof fetch,
      context: { hostname: "h.test", currentUrl: () => "/p" },
    });
    t.init({ app: "a", environment: "e", umami: { host: "https://u.test", websiteId: "w" }, captureIp: true });
    t.track("x");
    await t.flush();
    expect(bodies[0]!.payload).not.toHaveProperty("ip");
  });
});
