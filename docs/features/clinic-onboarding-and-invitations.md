# Private Clinic Onboarding & Invitation Security

## Private Clinic Onboarding
Status: COMPLETE — super admin only. New clinics are created privately by a platform super admin — no public sign-up, no payment. A user flagged `isSuperAdmin` (boolean on `users`) sees a "Clinics" nav item (Building2 icon) that opens the Clinics admin page (`client/src/pages/clinics-admin.tsx`). There they can list every clinic (with owners, staff count, pending owner invites) and create a new clinic + invite its first owner in one step.

Backend: `isSuperAdmin` middleware; `GET /api/admin/clinics`; `POST /api/admin/clinics` (creates the clinic, then a `clinic_owner` invitation for the supplied owner email, emails the invite link, and rolls back the clinic if the invite fails). The new owner accepts via the normal `/invite/:token` flow.

Public self-registration (`POST /api/clinics/register`) is DISABLED (returns 403); the `/register-clinic` UI is hidden. To grant super admin: set `is_super_admin = true` on the user row.

## Invitation Acceptance Hardening
`acceptInvitation` rejects invitations that are revoked, expired, already accepted, or whose invited email does not match the accepting user's email (case-insensitive). Prevents token-based privilege escalation / clinic reassignment.
