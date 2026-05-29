---
name: Invitation acceptance security
description: The validity + identity checks acceptInvitation must enforce before assigning clinicId/role.
---

# Invitation acceptance must verify identity, not just token existence

`acceptInvitation(token, userId)` assigns `clinicId` + `role` straight from the
invitation row. Because invites bootstrap privileged roles (including
`clinic_owner`), the accept path MUST reject:
- already accepted (`acceptedAt` set)
- revoked (`isActive === false`)
- expired (`expiresAt < now`)
- email mismatch — the accepting user's email must equal the invitation's email
  (compare trimmed + lowercased)

**Why:** without the email check, any authenticated user who obtains a token can
join/take over a clinic with the invited role — a privilege-escalation /
clinic-reassignment hole. Found in a code review of the super-admin onboarding
feature. The `/invite/:token` page pre-fills the invited email into both login
and register forms, so the email check does NOT break the normal accept flow; it
only blocks accepts from a different account.

**How to apply:** keep these guards in `storage.acceptInvitation`. Any new
invite-driven flow inherits them. The GET `/invitations/:token/details` endpoint
also checks active+expiry, but the storage accept method is the real enforcement
point — don't rely on the read endpoint alone.
