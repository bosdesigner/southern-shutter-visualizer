# TASK-000 — Bootstrap

**Status:** BUILT in dev (2026-09-03). Awaiting SSC accounts for the Render deploy.
**Outcome:** repo scaffold, Render service + Postgres, tenant seed, `/healthz` returning the tenant slug.

## Done in this repo
- Express/EJS/pg scaffold with host-header tenant resolver (`lib/tenant.js`) and `site_config` loader.
- Additive schema for every table in the build map (`store-pg.js`, mirrored by `migrate.js`).
- `config/tenants.seed.json` seeds the single SSC tenant + copy/colors/defaults.
- `/healthz` → `{ ok, db, tenants, tenant: "southernshutter" }`.
- `render.yaml` blueprint (web service + Postgres; secrets `sync:false`).
- `scripts/verify-bootstrap.js` — the verification artifact (boots against `DATABASE_URL`, 11 checks).

## Remaining (needs SSC-owned accounts — Ben cannot do these)
1. GitHub repo under SSC's org (or transfer `bosdesigner/southern-shutter-visualizer`).
2. Render team under SSC → New → Blueprint → this repo. Enter `ADMIN_USER`, `ADMIN_PASS`, keys as they exist.
3. Confirm `curl https://<service>.onrender.com/healthz` returns `"tenant":"southernshutter"`.

## Verification
```
DATABASE_URL=postgres://... npm run verify:bootstrap
curl -s http://localhost:3000/healthz
```
