import { describe, expect, it, vi } from "vitest";
import { createTelemetry } from "../src/core/client.js";
import type { SentryAdapter } from "../src/core/types.js";

function setup() {
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
  const t = createTelemetry({
    sentry,
    fetch: fakeFetch,
    sessionId: () => "sess-1",
    context: { hostname: "h.test", currentUrl: () => "/p" },
  });
  t.init({
    app: "demo",
    environment: "test",
    glitchtip: { dsn: "https://k@gt.test/1" },
    umami: { host: "https://u.test", websiteId: "w1" },
  });
  return { sentry, bodies, t };
}

describe("identity and sessions", () => {
  it("attaches the identified user's id to later events, and stops after reset", async () => {
    const { t, bodies, sentry } = setup();
    t.track("before");
    t.identify("user-1");
    t.track("after");
    await t.flush();
    expect(bodies.map((b) => [b.type, b.payload.id])).toEqual([
      ["event", undefined],
      ["identify", "user-1"],
      ["event", "user-1"],
    ]);
    expect(sentry.setUser).toHaveBeenCalledWith({ id: "user-1" });

    t.reset();
    t.track("signed-out");
    await t.flush();
    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
    expect(bodies[bodies.length - 1]!.payload.id).toBeUndefined();
  });

  it("adds the session id to event data and error tags", async () => {
    const { t, bodies, sentry } = setup();
    t.track("click", { a: 1 });
    t.captureError(new Error("x"));
    await t.flush();
    expect(bodies[0]!.payload.data).toEqual({ session_id: "sess-1", a: 1 });
    expect((sentry.captureException as any).mock.calls[0][1].tags).toMatchObject({ app: "demo", session_id: "sess-1" });
    expect(t.sessionId()).toBe("sess-1");
  });
});
