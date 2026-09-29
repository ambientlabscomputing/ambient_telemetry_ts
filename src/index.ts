export { createTelemetry } from "./core/client.js";
export type { Telemetry } from "./core/client.js";
export { normalizeError, scrub } from "./core/errors.js";
export { UmamiTransport } from "./core/umami.js";
export type {
  Data,
  ErrorContext,
  Level,
  Platform,
  SentryAdapter,
  TelemetryConfig,
  UmamiContext,
} from "./core/types.js";
