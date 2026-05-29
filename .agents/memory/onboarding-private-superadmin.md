---
name: Private clinic onboarding (super admin)
description: How new clinics are created; public self-registration is intentionally disabled.
---

# Clinic onboarding is private, super-admin-only

The platform owner decided: NO public clinic sign-up, NO payment. New clinics are
created by a user with `users.isSuperAdmin = true` via the Clinics admin page.

- `POST /api/clinics/register` is intentionally DISABLED (returns 403). Do not
  re-enable it without an explicit decision — it previously let any authenticated
  user with no clinic self-create a clinic and become `clinic_owner`.
- Creation flow: `POST /api/admin/clinics` creates the clinic, then a
  `clinic_owner` invitation for the owner email, emails the link, and rolls back
  (deletes) the clinic if the invite insert fails so no ownerless orphan remains.

**Why:** aligns with the owner's chosen onboarding model and avoids an
unauthorized clinic-creation path.

**How to apply:** grant access by setting `is_super_admin = true` on the user row.
Frontend gates the Clinics nav/page on `user.isSuperAdmin`; backend gates the
endpoints with `isAuthenticated + isSuperAdmin`.
