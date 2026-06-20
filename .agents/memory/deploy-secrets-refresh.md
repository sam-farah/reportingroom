---
name: New secrets require a republish to reach production
description: Why a running Replit deployment doesn't see secrets added after it was last published.
---

# Newly added secrets don't reach a live deployment until it's republished

A running Replit deployment captures its environment at publish time. Secrets/env vars added *after* the last publish are present in development immediately but are NOT visible to the already-running production deployment until it is republished.

**Why:** features that read creds fresh at runtime (e.g. `server/twilio.ts` `getCreds()` reading `process.env` every call) still return empty in production because the deployed process was started before the secret existed — so `isSmsConfigured()` is false and webhooks 403 / sends are disabled in prod even though dev works.

**How to apply:** whenever you add or change a secret that a deployed app depends on, tell the user to republish. Validating the secret in development is necessary but not sufficient for production.
