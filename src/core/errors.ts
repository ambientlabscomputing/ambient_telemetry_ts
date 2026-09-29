export function normalizeError(input: unknown): Error {
  if (input instanceof Error) return input;
  if (typeof input === "string") return new Error(input);
  let msg: string;
  try {
    msg = JSON.stringify(input) ?? String(input);
  } catch {
    msg = String(input);
  }
  const e = new Error(`Non-Error thrown: ${msg}`);
  e.name = "NonErrorThrown";
  return e;
}

const SENSITIVE = /pass(word)?|secret|token|authorization|api[-_]?key|cookie/i;

/** Shallow-recursive scrub of obviously sensitive keys. */
export function scrub<T>(value: T, depth = 0): T {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : scrub(v, depth + 1);
  }
  return out as T;
}
