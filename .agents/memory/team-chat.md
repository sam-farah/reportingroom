---
name: Team Chat (staff-to-staff)
description: Real-time staff chat — WebSocket layer, clinic-scoping rules, and the patient-tag PHI pitfall.
---

# Team Chat

Slack-style staff chat: channels + DMs, file sharing, patient tagging (clickable chip → patient file), @mention, unread badges, real-time (typing + presence). Staff can create channels and invite members.

## Real-time transport
- WebSocket hub mounted at path `/ws/chat` (deliberately distinct from Vite's HMR socket so the two never collide).
- Auth on upgrade reuses the express-session cookie via a shared `sessionMiddleware` singleton exported from auth setup — there is no separate token. Reject the upgrade if no `session.userId` or the user is inactive.
- Presence and typing are ephemeral (in-memory), scoped per-clinic; everything durable goes through the REST routes, which then call the hub to fan events out to channel members only.

## Clinic-scoping rule (every chat route)
Each chat route must: load the channel, verify `channel.clinicId === currentUser.clinicId`, THEN verify channel membership. Skipping the clinic check on any route (even a trivial one like mark-read) is an isolation hole.

## Patient-tag PHI pitfall (caused a real cross-tenant leak)
`patientIds` arrive from the client on message send. They MUST be filtered to the sender's clinic before insert — never trust them. Belt-and-braces: the hydration join that renders tags also constrains `patients.clinicId = message.clinicId`, so a stray cross-clinic tag can never be displayed even if one slipped into the table.
**Why:** first cut passed client `patientIds` straight through; a user could tag/expose another clinic's patient name + UR by guessing an ID.
**How to apply:** any feature that accepts client-supplied record IDs referencing PHI (patients, reports) must re-validate clinic ownership server-side, not just at render.

## Author message dedup
The author receives their own new message via BOTH the POST response AND the WS broadcast (author is a channel member). The client dedupes by message id when appending to the react-query cache — keep that dedup or messages double up.
