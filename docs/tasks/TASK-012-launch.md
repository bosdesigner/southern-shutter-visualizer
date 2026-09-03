# TASK-012 — Launch

**Status:** TODO.
**Outcome:** DNS, DKIM, production seed, PRODUCTION-OPS sign-off.

## Checklist (SSC does the account steps; Ben verifies)
1. Replit deployment: custom domain `visualize.southernshutter.com` → the CNAME + TXT records Replit shows; TLS issued.
2. `APP_HOSTNAMES` + `tenants.hostnames` include the custom domain (already seeded); `BASE_URL` set.
3. Postmark DKIM + Return-Path records live; sender verified; test send passed (TASK-009).
4. Publish (approve the additive migrations Replit generates), then `npm run seed:catalog` from the Replit Shell against the production DB.
5. `curl -s https://visualize.southernshutter.com/healthz` → `"tenant":"southernshutter"`.
6. `curl -sI https://visualize.southernshutter.com/ | grep -i content-security-policy` shows the SSC origins.
7. `/admin/version` shows the intended prompt versions and commit.
8. One real address end-to-end; quote received at `sales@`.
9. SSC web vendor adds the embed tag (TASK-010); confirm on the live page.
10. PRODUCTION-OPS sign-off recorded here with date.
