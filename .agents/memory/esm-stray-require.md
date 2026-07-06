---
name: Stray require() in ESM server code
description: A CommonJS require() call inside a "type":"module" file throws ReferenceError at runtime, even though tsx/TS give no compile-time warning.
---

Because `package.json` has `"type": "module"`, every server `.ts` file (including `server/routes.ts`) runs as an ES module — `require` is not a global there, unlike a CommonJS file. Writing `require("crypto")` (or any other stray `require(...)`) inside real server logic throws `ReferenceError: require is not defined` the moment that code path executes, silently breaking just that one route/feature while the rest of the app looks fine.

**Why this is easy to miss:** `tsc --noEmit` does not catch it (call is dynamically valid JS syntax), and it only surfaces when the specific route is hit — a single admin action can be broken for a long time with the rest of the app healthy. Found via the DICOM API-key regeneration endpoint: `require("crypto").randomBytes(...)` was used even though `crypto` was already imported via `import crypto from "crypto"` at the top of the same file.

**How to apply:** never add `require(...)` to real (executed) server TS files — always add a proper `import`. The one legitimate exception in this codebase is inside `getDicomBridgeScript()` in `server/routes.ts`, where `require('net')` etc. appear only as *text inside a template-literal string* that's downloaded and run as a separate, plain-CommonJS Node script by the clinic's own PC — that text is never executed by our ESM server, so it's fine to leave as `require`. When auditing for this bug, check whether a `require(` match is inside such a returned-string generator function before treating it as broken.
