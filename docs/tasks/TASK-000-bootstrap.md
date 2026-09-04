# TASK-000 — Bootstrap

**Status:** BUILT in dev (2026-09-03). Awaiting the SSC-owned Replit account for the deployment.
**Outcome:** repo scaffold, Replit workspace + Postgres, tenant seed, `/api/health` returning the tenant slug.

## Done in this repo
- Express/EJS/pg scaffold with host-header tenant resolver (`lib/tenant.js`) and `site_config` loader.
- Additive schema for every table in the build map (`store-pg.js`, mirrored by `migrate.js`).
- `config/tenants.seed.json` seeds the single SSC tenant + copy/colors/defaults.
- `/api/health` → `{ ok, db, tenants, tenant: "southernshutter" }`.
- `.replit` (Node 20 + Postgres 16 modules, Autoscale deployment, port 3000 → 80).
- `scripts/verify-bootstrap.js` — the verification artifact (boots against `DATABASE_URL`, 13 checks).

## Remaining (needs the SSC-owned Replit account — Ben cannot do these)
1. GitHub repo under SSC's org (or transfer `bosdesigner/southern-shutter-visualizer`).
2. Replit → Import from GitHub → this repo. Add the built-in Postgres (DATABASE_URL appears automatically).
3. Secrets (workspace AND deployment): `SESSION_SECRET`, `ADMIN_USER`, `ADMIN_PASS`, then the API keys as they exist.
4. Run → `curl -s https://<repl>.replit.app/api/health` returns `"tenant":"southernshutter"`; Publish as Autoscale.

## Verification
```
DATABASE_URL=postgres://... npm run verify:bootstrap
curl -s http://localhost:3000/api/health
```
