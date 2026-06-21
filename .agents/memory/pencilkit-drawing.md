---
name: PencilKit / worksheet drawing
description: Two separate drawing implementations exist; native PencilKit export and re-import gotchas.
---

# Worksheet drawing — two separate implementations

There are **two independent drawing UIs** in this app. A feature added to one is NOT
automatically in the other:
- `client/src/components/drawing-canvas.tsx` — the `DrawingCanvas` component, used in the
  upload panel and templates. Saves the PencilKit result directly as the worksheet image.
- `client/src/pages/draw.tsx` — the standalone page that is the **primary** worksheet →
  Create Draft Report flow (the one users actually use day-to-day). Draws a template onto
  an HTML canvas and saves `canvas.toDataURL()`.

**Why it matters:** native PencilKit (Apple Pencil) was first wired only into `DrawingCanvas`,
so it never appeared on the page users actually draw worksheets on. When asked "is X working
for worksheets", check `draw.tsx`, not just the component.

# Native PencilKit (iOS) export + re-import gotchas

`ios/App/App/PencilKitPlugin.swift` shows a full-screen native canvas whose aspect ratio
differs from the (often portrait) worksheet template.

- **Crop the export to the template's aspect-fit rect** when a background is supplied, or the
  returned PNG carries letterbox margins. Those margins double up if you then aspect-fit the
  result back onto a fixed-aspect web canvas, shrinking the diagram. With no background
  (signatures) export full bounds.
- **When importing the native PNG back into an existing HTML canvas that web tools rely on**
  (Clear/Undo/Eraser redraw `templateImage` at the *current* canvas dims), keep the canvas
  geometry stable and draw the image aspect-fit/centred. Do NOT resize the canvas to the
  PNG's native size — that desyncs `templateImage`/history geometry and distorts later edits.
- `await img.decode()` before drawing so the "pending" button state isn't cleared early
  (the old `img.onload` + `finally` pattern re-enabled the button before import finished).

**How to apply:** any change to the PencilKit plugin contract or to either drawing UI should
be checked against all three consumers: `draw.tsx`, `drawing-canvas.tsx`, and the
`physicians.tsx` signature flow (which calls `presentPencilCanvas({})` with no background).

Native-app changes only reach the iPad after the user runs `npm run build` + `npx cap sync ios`
and rebuilds in Xcode — the iPad app bundles a static web build.
