---
name: Capacitor plugin call retention
description: Long-lived native UI (PencilKit sheet) must retain its CAPPluginCall or the resolve is silently dropped
---
A `CAPPluginCall` resolved AFTER the plugin method returns (e.g. when a full-screen native sheet resolves on Done/Cancel minutes later) must be kept alive: set `call.keepAlive = true` and capture the call STRONGLY in the completion closure.
**Why:** the PencilKit plugin weak-captured the call; iOS deallocated it mid-session, so `resolve()` hit a nil guard and the JS promise hung forever — no error, no import, "drawing vanished" reports. Meanwhile `notifyListeners` autosave events kept working (they don't need the call), which made the bridge look healthy and misdirected two debugging rounds toward the web import path.
**How to apply:** any plugin method whose result arrives via a later callback: keepAlive + strong capture; keep payloads compact (JPEG not PNG for images) since events and resolves both cross evaluateJavaScript. Log signature of a dropped resolve: autosave PUTs present, zero post-Done PUTs, worksheet still listed as resumable, no error toast on the web side.
