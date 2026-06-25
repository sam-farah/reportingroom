---
name: Patient portal
description: How the patient-facing portal (separate from staff app) authenticates and serves data, plus known multi-tenant and rebrand gaps.
---

# Patient portal

Patient-facing area for patients to view their own finalised reports + worksheets. Completely separate from the staff app and from the referrer portal. Pages live under `client/src/pages/patient-portal/` (invite, login, dashboard) and are routed in `App.tsx` OUTSIDE the staff-auth gate (the gate explicitly bypasses paths starting `/patient-portal`).

## Auth model (the non-obvious part)
- Portal sessions use a SEPARATE session key: `req.session.portalUserId` — distinct from staff `req.session.userId`, but the SAME connect-pg-simple store. A single browser session could in principle hold both. Portal data routes gate on `portalUserId` and scope everything to `account.patientId`.
- **Login is PASSWORDLESS SMS one-time-code (OTP)** — patients no longer have passwords. Two steps: submit email → a 6-digit code is texted to the mobile on the patient record → verify code. Mirrors staff 2FA params (5-min code TTL, 5-attempt ceiling, 30s resend cooldown) but uses its own session key `pendingPortalLogin = {portalAccountId, at, inviteToken?}` with a longer pending-window TTL. `patient_portal_accounts.passwordHash` is now nullable (legacy/unused); login-code state lives in `loginCode*` columns. Forgot/reset-password pages and routes were removed.

## Passwordless OTP invariants (don't regress)
- **Enumeration safety is the whole point.** `/api/portal/login` always returns the same `{success}` and ALWAYS sets a `pendingPortalLogin` — a *decoy* (portalAccountId=null) when the email is unknown or has no mobile — so step two looks identical. `/verify-code` and `/resend-code` must return identical messages for every failure mode (one generic "wrong/expired" 401, one generic lockout 429). Decoy pendings count attempts in the session so even the lockout matches; real accounts use the atomic DB counter (`incrementPatientPortalLoginAttempts`, counted BEFORE bcrypt compare to beat parallel guessing).
- **Always clear stale `pendingPortalLogin` at the start of login/invite-request**, else a prior account's pending could be verified with a different email.
- **Invite acceptance happens in `/verify-code`, NOT in `/invite/request-code`.** The token is stashed in `pendingPortalLogin.inviteToken` and `acceptPatientPortalInvitation` is called only after the code is proven — a failed/never-delivered SMS must never burn the one-time invite.
- **Resend refreshes `pending.at`** (and resets the decoy attempt counter) so a freshly issued code gets the full pending window; resend is also generic (no phoneHint, no cooldown 429) to stay enumeration-safe.
- Invite flow (`/invite/request-code`) is token-gated (token is the secret), so it MAY surface NO_PHONE / SMS-unconfigured directly — that's fine because possession of the invite link implies legitimacy.

## Known gaps (verify before relying; fix if asked)
- **Hardcoded domain:** invite emails in `server/email.ts` hardcode `https://reportingroom.net/patient-portal/...`. These links break under a different domain / product rebrand. (Owner has flagged a possible future rebrand.) The dead `sendPortalPasswordResetEmail` (and its reset URL) still sits in `email.ts` unused after the passwordless switch.
- `portal-invite` falls back to `clinicId: patient.clinicId || 1` — a hardcoded clinic-1 fallback.

**Why:** medical multi-tenant app where clinic isolation, brute-force resistance, and rebrand-safety are first-order concerns.
**How to apply:** when touching the portal, reuse the `portalUserId` session (don't conflate with staff `userId`); preserve the enumeration-safe symmetry above; the staff-side invite/status routes (`POST /api/patients/:id/portal-invite`, `GET /api/patients/:id/portal-status`) are now clinic-scoped (patient.clinicId == caller's clinicId, super-admin bypass) — keep them that way; make portal email links derive from the request/deploy domain instead of a hardcoded host.
