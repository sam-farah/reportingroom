---
name: Autosave concurrency
description: Patterns for safe draft autosave that won't silently overwrite newer content with stale PATCHes.
---

**Rule:** Any autosaving draft editor (consultations, reports, templates, etc.) must do BOTH of these, not just one:

1. **Serialize PATCHes client-side** — at most one save in flight. While one is running, mark `pendingSave = true`; flush again on completion with the latest state. Don't fire-and-forget multiple `useMutation.mutate()` calls back-to-back.
2. **Send `expectedUpdatedAt`** — the client sends the `updatedAt` it last received; the server rejects with 409 if the row was updated by someone (or another tab) in the meantime, returning `{ error: "stale_update", current: row }`.

**Why:** A code review found the first version of the consultations dialog used three separate triggers (debounce, 30s heartbeat, manual save, finalise pre-save) all calling the same PATCH endpoint with full document fields and no version guard. Out-of-order HTTP responses would replay an older payload over a newer one — silent data loss on a clinical record. Particularly bad for medical content where the user thinks "I just typed that, why is it gone?"

**How to apply:** Use a `flushSave()` callback that owns `saveInFlightRef` + `pendingSaveRef` + `expectedUpdatedAtRef`. Don't mix `useMutation` for autosave — its concurrency model isn't the right shape. See `client/src/components/consultation-dialog.tsx` for the canonical pattern. The 1.5s debounce and 30s heartbeat both feed `flushSave()` rather than dispatching their own mutations.
