# Changelog

## 0.4.0
- `captureIp` (off by default) and, in the Node entry, `withClient({ ip }, fn)`: record the end user's public IP when this library runs on a server handling other people's requests. Until now such events and errors carried the server's own IP (Umami reads it from the connection; GlitchTip overwrites `user.ip_address` with the sender's IP).
- With `captureIp`, inside `withClient`: Umami events/pageviews/identify carry the IP (geo and the visitor hash describe the user) plus a `client_ip` event property; every GlitchTip error, including ones Sentry captures on its own, gets a `client_ip` tag. Context follows `await`s via `AsyncLocalStorage` and never leaks between concurrent requests.
- Only public addresses are kept. Private, loopback, CGNAT, multicast, documentation, 6to4 and malformed values are ignored; `::ffff:1.2.3.4` becomes `1.2.3.4`. Normalization is identical to the Python library's, so one user's address is the same string in both. `publicIp` is exported from the root entry.
- No change for web and React Native: GlitchTip and Umami already see the real connecting IP of browsers and phones.

## 0.3.2
- Docs only: Python now has `sanitize_url`, so the README no longer calls it TypeScript-only.

## 0.3.1
- Docs only: config reference, identity/session guide, gotchas, release steps; install line pinned to the current tag.

## 0.3.0
- `sanitizeUrl`: scrub page URLs sent to Umami and attached to Sentry events (request URL, Referer, query string, breadcrumbs).

## 0.2.0
- `reset()` (sign-out) and `sessionId()` (per-tab id, added to events and errors).
- After `identify`, every later Umami event carries the user id as the distinct id.
- Umami User-Agent for the Node and React Native entries is browser-shaped (Umami drops bot-looking UAs).
- `flush()` no longer reports failure when GlitchTip isn't configured.

## 0.1.1
- Web entry sends the referrer to Umami.

## 0.1.0
- First release: core, Umami transport, web / React Native / Node entries.
