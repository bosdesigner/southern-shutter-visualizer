# TASK-009 — Quote email (Postmark)

**Status:** BUILT (compose + send + status tracking); no live send yet.
**Outcome:** Postmark templates; test send to Ben, then to `sales@`.

- `services/postmark.js`: sales email (lead details, BOM table, render, admin link, reply-to homeowner) + homeowner confirmation.
- Quote row is written BEFORE sending; `status` = emailed | email_failed; `postmark_message_id` stored.

## To finish
1. SSC creates the Postmark server; adds DKIM + Return-Path for `southernshutter.com`; sender signature for `POSTMARK_FROM`.
2. Temporarily set the tenant's `quote_to_email` to Ben (via `/admin/config`? no — it is on the `tenants` row: `UPDATE tenants SET quote_to_email='ben@...'`), send one test quote, check rendering in Gmail/Outlook, then set it back to `sales@southernshutter.com`.
3. Confirm the reply-to lands on the homeowner.

## Verification
Two Postmark message IDs (Ben test, sales@ test) recorded in this doc with screenshots of the received emails.
