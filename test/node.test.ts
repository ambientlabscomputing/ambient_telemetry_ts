import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(),
  setUser: vi.fn(),
  flush: vi.fn(async () => true),
}));
vi.mock("@sentry/node", () => sentry);

import { init, track, captureError, withClient } from "../src/node.js";

const bodies: Array<{ payload: Record<string, any> }> = [];
vi.stubGlobal(
  "fetch",
  vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    return new Response("{}", { status: 200 });
  }),
);

init({
  app: "agent",
  environment: "test",
  glitchtip: { dsn: "https://k@gt.test/1" },
  umami: { host: "https://u.test", websiteId: "w1" },
  captureIp: true,
});
const beforeSend = sentry.init.mock.calls[0]![0].beforeSend as (e: any) => any;

beforeEach(() => {
  bodies.length = 0;
  sentry.captureException.mockClear();
});

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const wait = async () => {
  for (let i = 0; i < 50 && bodies.length === 0; i++) await tick();
};

describe("node entry: withClient", () => {
  it("binds the caller for everything that runs inside, across awaits", async () => {
    await withClient({ ip: "8.8.8.8" }, async () => {
      await tick();
      track("inside");
    });
    await wait();
    expect(bodies[0]!.payload).toMatchObject({ ip: "8.8.8.8", data: { client_ip: "8.8.8.8" } });
  });

  it("keeps concurrent requests apart", async () => {
    const run = (ip: string, delay: number) =>
      withClient({ ip }, async () => {
        await tick(delay);
        captureError(new Error(ip));
      });
    await Promise.all([run("8.8.8.8", 20), run("1.1.1.1", 5), run("9.9.9.9", 10)]);
    const byMessage = Object.fromEntries(
      sentry.captureException.mock.calls.map(([e, ctx]) => [e.message, ctx.tags.client_ip]),
    );
    expect(byMessage).toEqual({ "8.8.8.8": "8.8.8.8", "1.1.1.1": "1.1.1.1", "9.9.9.9": "9.9.9.9" });
  });

  it("records nothing outside withClient, and never leaks a finished request into the next", async () => {
    await withClient({ ip: "8.8.8.8" }, async () => {});
    track("outside");
    await wait();
    expect(bodies[0]!.payload).not.toHaveProperty("ip");
  });

  it("ignores a non-public address", async () => {
    await withClient({ ip: "10.0.0.1" }, async () => track("lan"));
    await wait();
    expect(bodies[0]!.payload).not.toHaveProperty("ip");
  });

  it("tags errors Sentry captures on its own, without overriding the caller's tag", () => {
    expect(withClient({ ip: "8.8.8.8" }, () => beforeSend({ tags: { a: "1" } })).tags).toEqual({
      a: "1",
      client_ip: "8.8.8.8",
    });
    expect(withClient({ ip: "8.8.8.8" }, () => beforeSend({ tags: { client_ip: "mine" } })).tags.client_ip).toBe("mine");
    expect(beforeSend({}).tags).toBeUndefined(); // outside a request: untouched
  });

  it("returns the callback's value", () => {
    expect(withClient({ ip: "8.8.8.8" }, () => 42)).toBe(42);
  });
});
