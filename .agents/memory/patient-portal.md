---
name: Patient portal
description: How the patient-facing portal (separate from staff app) authenticates and serves data, plus known multi-tenant and rebrand gaps.
---

# Patient portal

Patient-facing area for patients to view their own finalised reports + worksheets. Completely separate from the staff app and from the referrer portal. Pages live under `client/src/pages/patient-portal/` (invite, login, forgot-password, reset-password, dashboard) and are routed in `App.tsx` OUTSIDE the staff-auth gate (the gate explicitly bypasses paths starting `/patient-portal`).

## Auth model (the non-obvious part)
- Portal sessions use a SEPARATE session key: `req.session.portalUserId` — distinct from staff `req.session.userId`, but the SAME connect-pg-simple store. A single browser session could in principle hold both. Portal data routes gate on `portalUserId` and scope everything to `account.patientId`.
- Accounts: one `patient_portal_accounts` row per patient (unique patientId, unique email, bcrypt passwordHash cost 12). Invites: `patient_portal_invitations` (token, 7-day expiry, isActive, acceptedAt). Resets: `patient_portal_password_resets` (token, 1-hour expiry, single-use via usedAt).
- **Patients have NO 2FA** — staff 2FA is mandatory, but the portal is intentionally password-only (patients only ever see their own data).

## Known gaps (verify before relying; fix if asked)
- **Cross-tenant gap on the staff-side invite/status routes:** `POST /api/patients/:id/portal-invite` and `GET /api/patients/:id/portal-status` are only `isAuthenticated` — they do NOT check the patient's clinic == caller's clinic. Same bug class as `multi-tenant-route-scoping.md`. The portal's own data routes ARE patient-scoped, so this is a staff-side leak, not a patient-side one.
- **Hardcoded domain:** invite + reset emails in `server/email.ts` hardcode `https://reportingroom.net/patient-portal/...`. These links break under a different domain / product rebrand. (Owner has flagged a possible future rebrand.)
- `portal-invite` falls back to `clinicId: patient.clinicId || 1` — a hardcoded clinic-1 fallback.

**Why:** medical multi-tenant app where clinic isolation and rebrand-safety are first-order concerns.
**How to apply:** when touching the portal, reuse the `portalUserId` session (don't conflate with staff `userId`); add `clinicId` ownership checks to the staff invite/status routes; make portal email links derive from the request/deploy domain instead of a hardcoded host.
