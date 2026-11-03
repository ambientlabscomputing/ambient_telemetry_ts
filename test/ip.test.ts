import { describe, expect, it } from "vitest";
import { publicIp, tagClientIp } from "../src/core/ip.js";

describe("publicIp", () => {
  // Mirrors the Python library's test table: the same input must give the same output.
  it.each([
    ["8.8.8.8", "8.8.8.8"],
    [" 8.8.8.8 ", "8.8.8.8"],
    ["8.8.8.8:51234", "8.8.8.8"],
    ["2001:4860:4860::8888", "2001:4860:4860::8888"],
    ["[2001:4860:4860::8888]:443", "2001:4860:4860::8888"],
    ["2001:4860:4860:0:0:0:0:8888", "2001:4860:4860::8888"], // normalized like Python
    ["2001:4860:4860:0000:0000:0000:0000:8888", "2001:4860:4860::8888"],
    ["2A00:1450:4001:81B::200E", "2a00:1450:4001:81b::200e"],
    ["2400:cb00:0:1:1:1:1:1", "2400:cb00:0:1:1:1:1:1"], // one zero group: not compressed
    ["2400:cb00:0:0:1:0:0:1", "2400:cb00::1:0:0:1"], // equal runs: the first is compressed
    ["2400:cb00:0:1:0:0:0:1", "2400:cb00:0:1::1"], // the longest run wins
    ["::ffff:8.8.8.8", "8.8.8.8"], // IPv4-mapped IPv6 is the v4 address
    ["::ffff:808:808", "8.8.8.8"],
  ])("accepts %s", (raw, expected) => {
    expect(publicIp(raw)).toBe(expected);
  });

  it.each([
    // Not public: never record a proxy's or a LAN's address as the user's.
    "10.0.0.5",
    "192.168.1.9",
    "172.16.4.2",
    "172.31.255.255",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "2001:db8::1", // documentation
    "169.254.1.1",
    "100.64.0.1", // carrier-grade NAT
    "100.127.255.255",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::ffff:10.0.0.5",
    "64:ff9b::808:808", // NAT64
    "1:2:3:4:5:6:7:8", // not global unicast
    "2002:808:808::1", // 6to4
    "2001::1", // Teredo / IETF protocol assignments
    "3fff::1", // documentation
    "3fff:fff:ffff::1",
    "01.2.3.4", // leading zeros are ambiguous (octal)
    "1.02.3.4",
    // Junk.
    "",
    "unknown",
    "8.8.8.8, 1.1.1.1",
    "256.1.1.1",
    "1.2.3",
    "1.2.3.4.5",
    "[2001:4860::1",
    "2001:4860::1::2",
    "2001:4860:4860:0:0:0:0:0:8888",
    "gggg::1",
    "x".repeat(100),
  ])("rejects %j", (raw) => {
    expect(publicIp(raw)).toBeUndefined();
  });

  it("rejects non-strings", () => {
    for (const v of [undefined, null, 42, {}, ["8.8.8.8"]]) expect(publicIp(v)).toBeUndefined();
  });

  it("keeps boundary addresses just outside the private ranges", () => {
    for (const ip of ["2001:200::1", "3fff:1000::1", "2003::1", "223.255.255.255", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1", "11.0.0.1", "223.255.255.255"]) {
      expect(publicIp(ip)).toBe(ip);
    }
  });
});

type Ev = { tags?: Record<string, unknown> };

describe("tagClientIp", () => {
  it("adds the tag, creating tags if needed", () => {
    expect(tagClientIp<Ev>({}, "8.8.8.8").tags).toEqual({ client_ip: "8.8.8.8" });
    expect(tagClientIp({ tags: { a: "1" } }, "8.8.8.8").tags).toEqual({ a: "1", client_ip: "8.8.8.8" });
  });
  it("never overwrites a caller's tag, and does nothing without an ip", () => {
    expect(tagClientIp({ tags: { client_ip: "custom" } }, "8.8.8.8").tags).toEqual({ client_ip: "custom" });
    const ev: Ev = {};
    expect(tagClientIp(ev, undefined)).toBe(ev);
    expect(ev).toEqual({});
  });
});
