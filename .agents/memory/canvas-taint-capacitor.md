---
name: Canvas taint in the Capacitor iPad build
description: Why images drawn to a <canvas> must be loaded as data URLs (not raw cross-origin <img>) in the native app
---

# Canvas taint → "The operation is insecure"

In the native iPad (Capacitor) build the web layer runs from `capacitor://localhost`
but assets/templates are served from the deployed backend (a different origin). A raw
cross-origin `<img>` (e.g. `img.src = resolveUrl('/uploads/x.png')`) **taints** any
canvas it is drawn onto, so a later `canvas.toDataURL()` throws a `SecurityError`
("The operation is insecure"). This silently breaks anything that reads the canvas:
PNG export, drawing-history snapshots, and the PencilKit background.

**Rule:** Any image that will be drawn to a canvas that is later read via `toDataURL()`
must be loaded as a **same-origin data URL** — fetch the bytes
(`fetch(url, {credentials:'include'})` → `blob()` → `FileReader.readAsDataURL`) then
set that data URL as the `Image.src`. Use the shared `loadImageElement()` helper in
`client/src/lib/api.ts`.

**Why not `crossOrigin="anonymous"`?** It is unreliable: the same template URL is also
rendered as a plain (non-CORS) `<img>` thumbnail, so a cached non-CORS copy (no
`Access-Control-Allow-Origin`) can be reused for the canvas request and still taint it.
The fetch→dataURL route bypasses both the CORS check and the HTTP image cache.

**How to apply:** Reach for `loadImageElement()` whenever drawing a backend-served
image onto a canvas in code that runs in the native app. Canvases drawn purely from
vector code (e.g. `drawing-canvas.tsx` `paintTemplate`) are never tainted and need no
change. The proven reference implementation is `generateLabelledCanvas` in
`reporting-room.tsx`.
