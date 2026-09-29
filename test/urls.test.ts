import { describe, expect, it } from "vitest";
import { safeUrl, scrubBreadcrumb, scrubEvent } from "../src/core/urls.js";

const fn = (u: string) => u.split("?")[0]!.replace(/\/projects\/[^/]+/, "/projects/:id");

describe("scrubEvent", () => {
  it("rewrites request url, referer, query string and breadcrumbs", () => {
    const event = {
      request: {
        url: "http://app.test/projects/hq?code=SECRET&state=x",
        query_string: "code=SECRET",
        headers: { Referer: "http://app.test/projects/hq?token=T", "User-Agent": "ua" },
      },
      breadcrumbs: [
        { data: { from: "/a?x=1", to: "/projects/hq?code=1" } },
        { data: { url: "http://api.test/projects/hq?q=1", method: "GET" } },
      ],
    };
    scrubEvent(event, fn);
    expect(event.request.url).toBe("http://app.test/projects/:id");
    expect("query_string" in event.request).toBe(false);
    expect(event.request.headers.Referer).toBe("http://app.test/projects/:id");
    expect(event.request.headers["User-Agent"]).toBe("ua");
    expect(event.breadcrumbs[0]!.data).toEqual({ from: "/a", to: "/projects/:id" });
    expect(event.breadcrumbs[1]!.data).toEqual({ url: "http://api.test/projects/:id", method: "GET" });
  });

  it("is a no-op without a sanitizer", () => {
    const event = { request: { url: "http://x/?a=1", query_string: "a=1" } };
    expect(scrubEvent(event, undefined)).toEqual({ request: { url: "http://x/?a=1", query_string: "a=1" } });
  });

  it("safeUrl fails closed", () => {
    expect(safeUrl(() => { throw new Error("x"); }, "/secret?t=1")).toBe("/");
    expect(scrubBreadcrumb({ data: { url: "/a?b" } }, () => { throw new Error("x"); }).data).toEqual({ url: "/" });
  });
});
