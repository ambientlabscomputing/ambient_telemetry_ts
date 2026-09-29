# Changelog

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
