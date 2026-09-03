# shutter-vis — working notes for Claude

- **Owner:** Southern Shutter Company owns the product and every account (Render, Cloudinary, Postmark,
  Gemini, Google Maps, GitHub). Ben builds. Never enter credentials; never change DNS.
- **Rules:** `docs/PRODUCTION-OPS.md` binds every change. Dev-verify with real output before anything
  touches the Render service; explicit OK before a production deploy.
- **Postgres is the only store.** `DATABASE_URL` required; schema is additive boot-time DDL in `store-pg.js`
  mirrored by `migrate.js`. No Airtable, no JSON store.
- **Two-call pipeline, assembly is code.** Call #1 (`services/assess.js`) emits strict JSON that is stored
  and re-runnable. Call #2 (`services/assemble.js`) is deterministic string assembly from frozen
  `prompts/assemble/*.txt`; a template edit bumps `PROMPT_VERSION` and is round-tripped with
  `scripts/verify-template.js` before it ships.
- **Seed values are flagged, not facts.** `data/catalog/sizing_rules.json` and `docs/STANDARD-DIMENSIONS.md`
  carry placeholders until SSC confirms (`confirmed_by_ssc`). Do not present BOM sizes as final.
- **`DEV_FIXTURES=1`** runs the whole funnel with no keys (fixture facade + assessment). Ignored in production.
- **Task sequence:** `docs/tasks/TASK-000` … `TASK-012`. Each task doc lists its verification artifact;
  a task is done when that artifact exists, not when the code compiles.
