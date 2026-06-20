---
name: User table field encryption
description: How (and why) the users table handles field-level encryption differently from reports — gotchas when encrypting a new user column.
---

# User table field encryption

The `users` table is NOT auto-encrypted the way reports are. Despite `'email'` being
listed in `FieldEncryption.ENCRYPTED_FIELDS`, user emails/names are stored **plaintext**
because `upsertUser` never ran `encryptFields` and `getUser`/`getUserByEmail` never ran
`decryptFields`. (Reports go through encrypt/decrypt in their storage methods; users did not.)
`getUserByEmail` also does `WHERE users.email = <plaintext>`, so email can't be encrypted
at rest without breaking login lookups.

**To encrypt a NEW user column (e.g. `phoneNumber`):**
- Add the field name to `ENCRYPTED_FIELDS` so the bulk readers (`getClinicStaff`,
  `getAllUsers`) that already call `decryptFields` will decrypt it.
- Manually encrypt on EVERY write path (`updateUserPhone`, `upsertUser`) with
  `MedicalDataEncryption.encryptMedicalData(value)`, guarded by `!FieldEncryption.isEncrypted(value)`.
- Manually add `decryptFields` to `getUser` and `getUserByEmail` (they don't decrypt otherwise),
  or callers (e.g. auth's SMS-send path) get ciphertext.
- Only encrypt fields that are NEVER used in a SQL `WHERE` by value (phone is looked up via
  user id/email, so it's safe; email is not).

**Gotcha:** never pass `FieldEncryption.encryptFields(obj)` output straight into a Drizzle
`.set()`/`.values()` — it adds a phantom `${field}_encrypted` property that maps to no column
and Drizzle throws. Encrypt the single value directly instead. Decryption still works because
`decryptFields` detects the `U2FsdGVk` ciphertext prefix even without the `_encrypted` flag.

**Why:** keeps the encrypt/decrypt round-trip consistent for auth-channel PII without
breaking the plaintext email lookup the whole login flow depends on.
