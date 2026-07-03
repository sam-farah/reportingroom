---
name: Assessment of Benefit (AoB) document decisions
description: Non-obvious data-sourcing and content decisions for the Medicare Assessment of Benefit document generator.
---

- Referring-doctor details (name, provider number, address, referral date) shown on the AoB come from the **scan request** linked to the appointment (`getScanRequestByAppointmentId`), not the appointment's own referring-doctor fields — the appointment fields can be stale/free-text while the request is the authoritative referral record. If the request is linked to a saved Referring Doctor, that record's address/provider number take precedence.
  **Why:** explicit clinic instruction — the appointment-level referring doctor fields aren't reliably kept in sync with the actual referral.

- The form's "Practitioner Who Rendered the Service" field intentionally reuses the referring doctor's name/provider number. The app has no separate concept of a "rendering practitioner" distinct from the referrer.
  **Why:** explicit clinic instruction, not a bug — don't try to introduce a new rendering-practitioner field to "fix" this without checking with the user first.

- Equipment Number and SCP fields from the real Medicare form are deliberately omitted (not tracked anywhere in the app) rather than shown blank.

- Two document copies are generated and stored per signature: Practitioner/clinic copy and Patient copy (patient copy gets a short retain-this-copy footer, no other content difference). Both get attached to the patient file as separate documents.

- Fields that are always the same for this practice's workflow are hardcoded rather than sourced from data: "In-hospital referral: No", "Number of patients attended: 1", "Is the assignor the patient? Yes", "Agreement Type: Post-assignment".

- Layout deliberately does **not** attempt to be a pixel-accurate replica of the government form — only the field groups/labels/order match. Location Specific Practice Number (LSPN) is an optional per-clinic setting (Admin → Clinic Settings), shown only if set.
