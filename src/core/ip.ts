// No leading zeros: "01.2.3.4" is ambiguous (octal) and Python rejects it too.
const V4 = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;

function parseV4(s: string): [number, number, number, number] | undefined {
  const m = V4.exec(s);
  if (!m) return undefined;
  const o = m.slice(1).map(Number) as [number, number, number, number];
  return o.every((n) => n <= 255) ? o : undefined;
}

/** Same ranges Python's `ipaddress.is_global` rejects, plus multicast. */
function isPublicV4([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return false; // "this" network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol / documentation
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  return a < 224; // multicast and reserved (incl. broadcast)
}

function parseV6(input: string): number[] | undefined {
  let s = input.toLowerCase();
  const tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s); // ::ffff:1.2.3.4
  if (tail) {
    const v4 = parseV4(tail[2]!);
    if (!v4) return undefined;
    s = `${tail[1]}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return undefined;
  const groups = (h: string) => (h === "" ? [] : h.split(":"));
  const head = groups(halves[0]!);
  const rest = halves.length === 2 ? groups(halves[1]!) : [];
  const all = [...head, ...rest];
  if (!all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return undefined;
  if (halves.length === 1 ? all.length !== 8 : all.length > 7) return undefined;
  const fill = new Array<string>(8 - all.length).fill("0");
  return [...head, ...fill, ...rest].map((g) => parseInt(g, 16));
}

function formatV6(g: number[]): string {
  // Compress the longest run (>= 2) of zero groups, like Python's ipaddress does.
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (g[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bestLen) [bestStart, bestLen] = [i, j - i];
    i = j;
  }
  const hex = (xs: number[]) => xs.map((n) => n.toString(16)).join(":");
  if (bestLen < 2) return hex(g);
  return `${hex(g.slice(0, bestStart))}::${hex(g.slice(bestStart + bestLen))}`;
}

/**
 * Normalizes `value` to a public IP address, or `undefined`.
 *
 * Accepts what proxies and servers hand over: `1.2.3.4`, `1.2.3.4:5678`, `[2001:db8::1]:443`
 * and IPv4-mapped IPv6 (`::ffff:1.2.3.4`). Anything that is not a valid, globally routable
 * address (private, loopback, link-local, CGNAT, junk) is `undefined`, so a load balancer's
 * internal address is never recorded as the user's. Same rules as the Python library.
 */
export function publicIp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let s = value.trim();
  if (!s || s.length > 64) return undefined;
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    if (end === -1) return undefined;
    s = s.slice(1, end);
  } else if (s.split(":").length === 2) {
    s = s.split(":")[0]!; // v4:port (a bare v6 has several colons)
  }

  const v4 = parseV4(s);
  if (v4) return isPublicV4(v4) ? v4.join(".") : undefined;

  const g = parseV6(s);
  if (!g) return undefined;
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) {
    const mapped: [number, number, number, number] = [g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255];
    return isPublicV4(mapped) ? mapped.join(".") : undefined;
  }
  // Global unicast is 2000::/3, minus ranges that are never a client: IETF protocol/Teredo
  // (2001::/23), documentation (2001:db8::/32, 3fff::/20) and 6to4 (2002::/16). Python's
  // library applies the same rule.
  const [g0, g1] = [g[0]!, g[1]!];
  if ((g0 & 0xe000) !== 0x2000) return undefined;
  if (g0 === 0x2001 && (g1 < 0x0200 || g1 === 0x0db8)) return undefined;
  if (g0 === 0x2002 || (g0 === 0x3fff && g1 < 0x1000)) return undefined;
  return formatV6(g);
}

/** Adds a `client_ip` tag to a Sentry event in place, unless the caller already set one. */
export function tagClientIp<T extends { tags?: Record<string, unknown> | undefined }>(
  event: T,
  ip: string | undefined,
): T {
  if (!ip) return event;
  const tags = (event.tags ??= {});
  if (tags.client_ip === undefined) tags.client_ip = ip;
  return event;
}
