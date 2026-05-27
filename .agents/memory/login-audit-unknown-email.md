---
name: Login audit — unknown-email entries
description: How unattributed failed login attempts are surfaced in clinic-scoped audit views.
---

Failed login attempts where the typed email matches no user are written to `login_audit` with `clinicId = null` and `failureReason = "unknown_email"` — there's no clinic to attribute them to.

**Rule:** clinic-scoped audit queries MUST include `clinicId IS NULL AND failureReason = 'unknown_email'` in addition to `clinicId = <currentClinic>`. Otherwise these brute-force-probe entries are written but invisible to every clinic admin.

**Why:** the audit feature exists partly to spot brute-force probing. A strict `clinicId = ?` filter silently hides exactly the events that matter most.

**How to apply:** in `getLoginAuditForClinic` (server/storage.ts) the `where` clause is `or(eq(clinicId, x), and(isNull(clinicId), eq(failureReason, 'unknown_email')))`. Don't tighten it to a plain equality without re-thinking how unattributed events get surfaced. Showing the typed email to other-clinic admins is acceptable — it's just whatever a visitor typed at the public login form, not anyone's private data.
