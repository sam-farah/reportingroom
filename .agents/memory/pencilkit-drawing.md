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

# Native zoom/pan + auto-open (2026-07-26)

- Pinch-zoom/pan inside the native canvas: an OUTER UIScrollView (2-finger pan,
  viewForZooming → contentContainer holding bg image + PKCanvasView with
  isScrollEnabled=false) owns all zoom. Never zoom the PKCanvasView itself — the
  sibling background image wouldn't follow and strokes would desync. Export math
  (canvasView.bounds) is zoom-independent by design.
- draw.tsx auto-opens the native pencil canvas once per worksheet session via a
  templateReadyKey signal. This MUST be debounced with "opened" marked at timer
  FIRE time: the fullscreen transition + resize listener redraw the template and
  bump the key again within ~400ms, and a naive schedule-then-guard cancels the
  timer while burning the one-shot flag → pencil never opens.

## Autosave & resume (added 2026-07-26)
- Native sheet emits debounced (3s) JPEG "autosave" snapshots + immediate flush on app-switch; a `sessionEnded` flag in the Swift controller blocks any emit after Done/Cancel.
- INVARIANT: every worksheet PUT from draw.tsx must go through the single serialized save chain (`queueWorksheetSave`) — direct `apiRequest` PUTs reintroduce stale-overwrite races.
- While the native sheet is open the web canvas is stale: visibility/unmount flush must stay suppressed (`nativeSessionActiveRef`) or it clobbers richer native snapshots.
- Resume: pending restore snapshot is painted over the template on load and is SPENT the moment the native sheet consumes it as background — clearing later risks repainting stale strokes; clearing earlier loses the restore on the fullscreen resize re-render.
- Server side: digital-worksheet mutation routes all authorize via canAccessDigitalWorksheet; PUT accepts only drawingData/drawingHistory/annotations (lifecycle/linkage fields are server-managed).

## Done/Cancel lifecycle (BUILD #7 hardening)
- `pendingRestoreRef` is the "canvas state to overlay after any template reload" — loadTemplate repaints it when `restore.worksheetId === currentWorksheet.id`. It is cleared at native-sheet OPEN (session owns truth), then REPOPULATED at close: Done → the imported composite; Cancel/native-failure → the pre-open snapshot. Without this, the resize fired by the sheet dismissing reloads the template and blanks the drawing, and the next flush/pre-save persists the blank.
- Done import uses onload/onerror (NOT img.decode() — flaky on WebKit with multi-MB data URLs). If the preview import fails, the raw native PNG is still queued to the server (losing pixels is worse than losing the preview) — so drawingData may be PNG, not JPEG; downstream consumers must not assume jpeg.
- Swift cancelTapped confirms via UIAlertController when strokes exist ("Discard this drawing?"); silent Cancel-discard was indistinguishable from "drawings not saved" in the field.
- Field signature of a lost drawing: exactly ONE worksheet PUT (the pre-draft save) and no composite save between Done and Create Draft in server logs.
