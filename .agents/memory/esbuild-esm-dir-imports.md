---
name: esbuild ESM external dir imports crash at deploy
description: Why a server build that passes `npm run build` locally still crash-loops the published autoscale deployment at startup.
---

# esbuild `--packages=external` + ESM: directory imports of external packages crash at runtime

The server is bundled with `esbuild --platform=node --packages=external --bundle --format=esm`.
With `--packages=external`, node_modules imports are NOT bundled — they stay as raw ESM
import specifiers in `dist/index.js` and are resolved by Node's ESM loader at runtime.

A **value import** of a package *subdirectory* (no file, no extension), e.g.
`import MailComposer from "nodemailer/lib/mail-composer"`, throws
`ERR_UNSUPPORTED_DIR_IMPORT` the moment Node loads the bundle. Node ESM does not
support directory imports the way CommonJS `require` does.

**Why it hides locally:** `npm run build` only *builds* the bundle; it never *runs* it,
so the build is green. The crash only appears when the artifact is started
(`node dist/index.js`). On autoscale this surfaces as the container crash-looping →
the startup probe gets HTTP 500 on `GET /` → promote step fails → "publish failed",
while the previous successful build keeps serving the live site.

**Fix:** point the value import at the explicit file with extension
(`nodemailer/lib/mail-composer/index.js`) or use the package's public exports.
`import type ...` deep imports are fine — esbuild erases them, so they never reach runtime.

**Why (validation gate):** the only reliable check for server dependency/import changes is a
production startup smoke test, not the build:
`npx esbuild ... && NODE_ENV=production node dist/index.js` — confirm it reaches
"serving on port" before suggesting republish. To diagnose a "build failed to publish"
where the build phase log shows success up to "Creating Autoscale service", pull the
*runtime* deployment logs (fetch_deployment_logs) in the failed build's time window — the
real stack trace is there, not in the build logs.
