---
name: Capacitor iPad shell & CORS
description: Rules for maintaining the Capacitor iOS shell, the VITE_API_BASE_URL pattern, and the CORS allowlist.
---

# Capacitor iPad shell & CORS

## URL resolution — two-layer approach
1. **`installApiBaseInterceptor()`** (called in `client/src/main.tsx`) patches
   `window.fetch` globally: any `fetch('/...')` call is rewritten to the base URL.
   This covers ALL raw `fetch()` call sites without editing them individually.
   No-op when `VITE_API_BASE_URL` is not set (web build).

2. **`resolveUrl(path)`** is used explicitly for non-fetch URLs: `<img src>`,
   `img.src`, and any URL string passed to third-party libs.

**Why both layers:** The interceptor covers dynamic fetch calls that can't easily
be enumerated; resolveUrl covers static JSX attributes that bypass window.fetch.

**Why safe for web:** Both are no-ops when `VITE_API_BASE_URL` is empty.

When `VITE_API_BASE_URL` is not set (web build) `resolveUrl` is a no-op, so
adding it everywhere is safe and backward-compatible.

---

## CORS allowlist shape
The CORS middleware in `server/index.ts` (runs before all other Express middleware)
must always include **all** of these patterns or Replit's own origins break:

| Origin type | Pattern |
|---|---|
| Native Capacitor (iOS) | `capacitor://localhost`, `https://localhost` |
| Internal server requests | `^https?://localhost(:\d+)?$`, `^https?://127\.0\.0\.1(:\d+)?$` |
| Replit dev previews | `^https?://[^.]+\.replit\.dev(:\d+)?$` |
| Replit spock previews | `^https?://[^.]+-\d{2}-[^.]+\.spock\.replit\.dev(:\d+)?$` |
| Replit deployments | `^https://[^.]+\.replit\.app(:\d+)?$` |
| Custom origins | `CORS_ORIGIN` env var (comma-separated) |

**Why:** Replit uses multiple distinct domains for the same app (dev preview,
spock variant, deployment). Any CORS middleware must trust all of them or the
web app breaks in the Replit editor. The `http://localhost:5000` form appears
when some internal scheduled task makes a server-to-server HTTP call with an
Origin header — it must also be in the allowlist.

**credentials:true is required** — session cookies must flow with cross-origin
requests from the native shell.

---

## Building the native app
1. Set `VITE_API_BASE_URL` to the deployed backend URL at build time.
2. Run `npm run build` then `npx cap sync ios`.
3. Open `ios/App/App.xcworkspace` in Xcode, set signing team, archive.
4. Refer to `IPAD_HANDOFF.md` for the full step-by-step checklist.

## Capacitor config file
`capacitor.config.ts` at the project root. `webDir` = `dist/public`.
