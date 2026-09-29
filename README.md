# Ambient Telemetry

This repository houses the ambient_telemetry typescript library. This library allows Ambient Labs client applications (Web UI, mobile app, agent processes, etc) to write sentry-style user events and errors to our self hosted telemtry server (Glitchtip + Umami) in a standardized manner.


## The Ambient Labs App Landscape

Ambient Labs writes a variety differently shaped software that is depoyed in an unusually large variety of hardware and platforms. It can vary from run of the mill SaaS applications with a Web UI or mobile app, to a custom server agent written in Golang, to mechatronic code running on a microcontroller written in Rust.

This library, as stated above, is a typescript library. Because of our standards at Ambient Labs, this covers web apps and mobile apps since we write mobile apps in React Native and only use typescript. Other libraries in other repositories will be responsible for providing this functionality to their respective language, but they will model their API after this implementation.

The specific telemetry env info should be configurable.

Assume there will be a public nedpoint for glitchtip and a public endpoint for umami.

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
npm install github:ambientlabscomputing/ambient_telemetry_ts#v0.1.0
```

`prepare` builds `dist/` on install, so pin a tag or commit. The Sentry SDK for your platform (`@sentry/browser`, `@sentry/react-native` or `@sentry/node`) is a peer dependency you install in the app.

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

## API contract (for ports to other languages)

| Call | Backend | Notes |
|------|---------|-------|
| `init(config)` | both | `app` + `environment` required; either backend optional |
| `track(name, data?)` | Umami | `POST {host}/api/send`, `type: "event"` |
| `page(url?, title?)` | Umami | pageview; RN passes a screen name as `url` |
| `captureError(err, ctx?)` | GlitchTip | normalizes non-Error values; tags every event with `app` |
| `identify(id, traits?)` | both | only the id goes to GlitchTip |
| `flush(timeoutMs?)` | both | resolves `true` when drained |

Rules: never throw into the host app; calls before `init` are buffered (max 50) and replayed; `enabled: false` is a full no-op; sensitive keys (`password`, `token`, ...) are redacted; non-browser runtimes send an explicit `User-Agent` so Umami doesn't drop them as bots.
