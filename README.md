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
