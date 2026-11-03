# Ambient Telemetry

This repository houses the ambient_telemetry TypeScript library. This library allows Ambient Labs client applications (Web UI, mobile app, agent processes, etc) to write sentry-style user events and errors to our self hosted telemetry server (Glitchtip + Umami) in a standardized manner.


## The Ambient Labs App Landscape

Ambient Labs writes a variety of differently shaped software that is deployed in an unusually large variety of hardware and platforms. It can vary from run of the mill SaaS applications with a Web UI or mobile app, to a custom server agent written in Golang, to mechatronic code running on a microcontroller written in Rust.

This library, as stated above, is a TypeScript library. Because of our standards at Ambient Labs, this covers web apps and mobile apps since we write mobile apps in React Native and only use TypeScript. Other libraries in other repositories will be responsible for providing this functionality to their respective language, but they will model their API after this implementation.

The specific telemetry env info should be configurable.

Assume there will be a public endpoint for glitchtip and a public endpoint for umami.

## Internals

Basically:

```
track()
   ↓
Umami

captureError()
   ↓
Sentry SDK
   ↓
GlitchTip
```

## Install

Internal, GitHub-only. It is not published to npm. Add it as a git dependency:

```bash
npm install github:ambientlabscomputing/ambient_telemetry_ts#v0.4.0
```

`prepare` builds `dist/` on install, so pin a tag or commit. The Sentry SDK for your platform (`@sentry/browser`, `@sentry/react-native` or `@sentry/node`) is a peer dependency you install in the app.

Other languages have their own repos that follow the same API contract (see the table below):
[`ambient_telemetry_py`](https://github.com/ambientlabscomputing/ambient_telemetry_py) for Python. Go and Rust do not have a library yet.

## Usage

```ts
import { init, track, page, captureError, identify } from "ambient-telemetry/web"; // or /react-native, /node

init({
  app: "ambient-web",
  environment: "production",
  release: "1.4.0",
  glitchtip: { dsn: "https://<key>@glitchtip.example.com/1" },
  umami: { host: "https://umami.example.com", websiteId: "<website-uuid>" },
});

track("checkout_started", { plan: "pro" });
captureError(new Error("payment failed"), { tags: { area: "billing" } });
```

## Config reference

| Field | Meaning |
|-------|---------|
| `app` (required) | Who is sending, e.g. `myproduct-web`. Becomes the GlitchTip `app` tag. |
| `environment` (required) | e.g. `production`. |
| `release` | Version or git tag; shown on GlitchTip errors. |
| `umami` | `{ host, websiteId }`. Omit to disable events. |
| `glitchtip` | `{ dsn, sampleRate?, tracesSampleRate? }`. Omit to disable errors. The DSN key has **no dashes**; the dashed uuid form fails with "Invalid Sentry Dsn". |
| `enabled` | Kill switch. `false` makes every call a no-op. Use it to keep dev/test/preview silent. |
| `sanitizeUrl` | Scrubs page URLs, see below. |
| `captureIp` | Default `false`. Record the end user's public IP; only has an effect in the Node entry, see below. |
| `beforeTrack`, `beforeSend` | Inspect or drop events / errors (return `null` to drop). |
| `autoCaptureUnhandled` | Default `true`: Sentry captures uncaught errors and unhandled rejections. |
| `debug` | Logs swallowed errors to the console. |

## Identity and sessions

- `identify(userId, traits?)` once the user is signed in; `reset()` on sign-out. Use your **internal user id, never an email or name**. After `identify`, every later Umami event carries the id as Umami's *distinct id*, and Sentry errors carry it as `user.id`. Events from your backend that send the same id land in the same Umami session.
- `sessionId()` is a random per-tab id (web entry). It is added to Umami event data as `session_id` and to errors as a `session_id` tag. Send it to your API in an `X-Ambient-Session` header (and allow that header in CORS) so a backend error shares the id with the browser events that led to it. The Python library's Starlette middleware reads that header.

## Knowing where users come from (`captureIp`)

**Web and React Native need nothing.** A browser or phone connects to Umami and GlitchTip directly, and both read the real public IP off that connection: Umami turns it into country / region / city and the anonymous visitor hash, GlitchTip stores it as `user.ip_address` on every error. A browser cannot learn its own public IP without asking a third party, so this library does not try.

**On a server it is different.** If the Node entry runs inside an API that handles other people's requests, the connection Umami and GlitchTip see is your server's, so every event and error would look like it came from you. Turn on `captureIp` and tell the library who the caller is:

```ts
import { init, track, captureError, withClient } from "ambient-telemetry/node";

init({ ..., captureIp: true });

app.set("trust proxy", 1);                                       // so req.ip is derived safely
app.use((req, _res, next) => withClient({ ip: req.ip }, next));  // Express; Fastify: req.ip too

track("report_exported");   // carries the caller's IP, also after any await
```

What it does (nothing at all while `captureIp` is `false` or outside `withClient`):

- **Umami**: sends the IP with every event, pageview and `identify`, so geo and the visitor hash describe the user, not your server. Umami never stores raw IPs, so the address is also added to event data as `client_ip`, which is what you filter on.
- **GlitchTip**: every error gets a `client_ip` tag (search `client_ip:1.2.3.4`), including errors Sentry captures on its own. A tag is used because GlitchTip overwrites `user.ip_address` with the IP of whoever delivered the event.
- Only **public** addresses are recorded (private, loopback, CGNAT, multicast, documentation, 6to4 and malformed values are ignored), and `::ffff:1.2.3.4` is stored as `1.2.3.4`. This is the same rule as the Python library, so one user's address is the same string in both.
- `withClient` uses `AsyncLocalStorage`: it follows `await`s and keeps concurrent requests apart.

Only pass an address you trust. Use your framework's trusted-proxy setting (Express `trust proxy`, Fastify `trustProxy`) rather than reading a client-supplied `X-Forwarded-For` yourself, or anyone can choose the IP you record.

An IP is personal data. It is opt-in per app for that reason: enable it only where you have a reason to and say so in your privacy policy. GlitchTip's project-level "scrub IP addresses" setting only anonymizes `user.ip_address`; it does not touch the `client_ip` tag. If you scrub IPs on purpose, leave `captureIp` off.

## Keeping URLs safe (`sanitizeUrl`)

Umami events carry the page URL, and Sentry attaches it to errors. If your URLs hold ids, names or one-time
tokens, pass `sanitizeUrl` to `init`. It is applied to the Umami `url` (pageviews and events), to Sentry's
`request.url`, Referer header, stored query string, and navigation/fetch breadcrumbs. If it throws, the URL becomes `/`.

```ts
init({ ..., sanitizeUrl: (url) => url.split("?")[0].replace(/\/projects\/[^/]+/, "/projects/:id") });
```

## Gotchas

- **Umami drops anything that looks like a bot**: HTTP 200 with `{"beep":"boop"}`, no error. The web entry uses the real browser User-Agent, and the Node/React Native entries send browser-shaped ones (the words `node` and `server` are flagged). Never override the User-Agent.
- Calls made before `init` are buffered (50 max) and replayed, so it is safe to call `track` early.
- `@sentry/browser` is a peer dependency of `/web`; the entries for other platforms need their own Sentry SDK. Bundlers only pull in the entry you import.

## Releasing

Tags are the release. Bump `version` in `package.json`, update `CHANGELOG.md`, run `npx tsc --noEmit && npx vitest run`, commit, then:

```bash
git tag vX.Y.Z && git push origin main vX.Y.Z
```

Consumers pin the tag (`#vX.Y.Z`) and `prepare` builds `dist/` on install.

## API contract (for ports to other languages)

| Call | Backend | Notes |
|------|---------|-------|
| `init(config)` | both | `app` + `environment` required; either backend optional |
| `track(name, data?)` | Umami | `POST {host}/api/send`, `type: "event"` |
| `page(url?, title?)` | Umami | pageview; RN passes a screen name as `url` |
| `captureError(err, ctx?)` | GlitchTip | normalizes non-Error values; tags every event with `app` |
| `identify(id, traits?)` | both | only the id goes to GlitchTip; every later Umami event carries it as the distinct id |
| `reset()` | both | sign-out: forget the identified user |
| `sessionId()` | - | per-tab random id, also added to event data (`session_id`) and error tags; send it to your API as `X-Ambient-Session` |
| `flush(timeoutMs?)` | both | resolves `true` when drained |
| `captureIp` option | both | server platforms only: with the caller's address bound (`withClient` in Node, `bind(ip=)` / the middleware in Python), the public IP is sent to Umami as the payload `ip` plus a `client_ip` event property, and added to errors as a `client_ip` tag. Same normalization in every port (`publicIp`) |

The Python port implements the same calls (`capture_error` instead of `captureError`), plus `bind()` for per-request identity. `sanitizeUrl` exists in both (`sanitize_url` in Python).

Rules: never throw into the host app; calls before `init` are buffered (max 50) and replayed; `enabled: false` is a full no-op; sensitive keys (`password`, `token`, ...) are redacted; non-browser runtimes send a browser-shaped `User-Agent` (Umami answers `{"beep":"boop"}` with HTTP 200 and drops anything that looks like a bot, including UAs containing `node` or `server`).
