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

## Edit / delete messages
- Edit + delete are author-only AND require current channel membership (not just author + clinic). A user removed from a channel must not be able to mutate their old messages there.
- Delete is soft (`deletedAt`); history fetch already excludes `deletedAt` rows, so a deleted message simply disappears (no tombstone). Live removal via WS `message:deleted` (clients filter it out of cache).
- Edit re-derives @mentions **server-side** from the edited body against current channel members (token = member firstName, whitespace-stripped, case-insensitive). Do NOT trust client-supplied mention IDs on edit — the composer's mention map isn't available for an arbitrary historical message, so client-side matching silently dropped mentions.

## In-list array queries (Neon pitfall)
Never write `sql\`${col} = ANY(${jsArray})\`` for chat lookups — the Neon serverless driver can't serialise a JS array there and throws `malformed array literal`. Use drizzle's `inArray(col, arr)` instead.

## apiRequest returns a Response, not JSON (blank-page footgun)
`apiRequest` (client/src/lib/queryClient.ts) resolves to a raw `Response`. Any useMutation whose `onSuccess` consumes the body MUST do `(await apiRequest(...)).json()` in its mutationFn. A chat mutationFn that returned the Response directly got appended to the messages cache; the render hit `m.patientTags.length` on a Response → threw → Chat is a dashboard panel with NO ErrorBoundary → the whole page blanked.
**Why:** server returned 201 with correct JSON, so it looked like a server-shape problem; the real bug was client-side type confusion (Response vs message).
**How to apply:** when a mutation's result feeds setQueryData/append/replace, confirm the mutationFn calls `.json()`. Consider guarding array access (`m.patientTags?.length`) since there is no top-level ErrorBoundary.
