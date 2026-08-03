---
name: Dev vs prod databases
description: Development and production use SEPARATE Postgres databases; scripts run in workspace only touch dev.
---
Development (workspace, `DATABASE_URL`) and the published deployment use **different** databases. Confirmed 2026-08-03: users created via workspace scripts existed only in dev; prod login_audit showed `unknown_email` for them, and dev login_audit had no rows after early July while prod was live daily.

**Why:** Earlier assumption that dev+prod shared NEON_DATABASE_URL was wrong and caused staff accounts to be created in the wrong DB.

**How to apply:**
- Any data created via one-off workspace scripts does NOT exist on the live app.
- Prod is read-only from the agent (executeSql environment:"production", SELECT only); to create prod data, use the app's own flows on the live site (e.g. staff invitations) or have the user do it in the UI.
- Real/current clinic data lives in PROD; the dev DB is stale. Verify which DB a symptom concerns before diagnosing.
