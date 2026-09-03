# Southern Shutter Visualizer (`shutter-vis`)

Address → Street View → Gemini facade assessment → scale solver → bill of materials → Gemini render →
quote request routed to `sales@southernshutter.com`. Express / EJS / Node 20 on Replit (Autoscale deployment), Replit Postgres via `pg`,
Cloudinary, Postmark, Google Maps Platform. Single tenant seeded; multi-tenant by host header from day one.

Build map and topology: see the build map document (2026-09-03) and `docs/tasks/` for the task sequence.

## Run locally

```
cp .env.example .env            # set DATABASE_URL (a local Postgres is fine)
npm install
npm run migrate                 # schema + tenant seed (also runs at boot)
npm run seed:catalog            # 6 styles × 3 material lines × grades × sections, colors, sizing rules
DEV_FIXTURES=1 npm run dev      # no API keys needed: fixture facade + fixture assessment drive the whole funnel
open http://localhost:3000
```

`npm run verify:bootstrap` boots against `DATABASE_URL` and checks /healthz, the catalog, the scale solver and
BOM on the fixture, a full fixture session, the owner cookie, the quote path, admin auth and the embed headers.

## Layout

| Path | What |
|---|---|
| `server.js` / `.replit` | Express bootstrap, tenant resolver, CSP frame-ancestors, /healthz · Replit run + deployment config |
| `store-pg.js` / `migrate.js` | pool + additive boot-time schema |
| `lib/` | tenant resolver, admin auth, session-owner cookie, rate limit, helpers |
| `routes/funnel.js` | pipeline orchestrator (stages write artifacts + session status) |
| `routes/api.js` `public.js` `admin.js` | JSON API · homeowner pages + `/embed.js` · staff admin |
| `services/` | streetview, assess, scale, sizing, select, assemble, verify, cloudinary, postmark, leads, gemini |
| `prompts/` | `assess.v1.txt`, `assemble/_base.txt` + one frozen template per style, `verify.v1.txt` |
| `data/catalog/` | authored catalog JSON (seeded by `scripts/seed-catalog.js`) |
| `fixtures/` | synthetic facade + matching assessment with known geometry |
| `docs/` | PRODUCTION-OPS, STANDARD-DIMENSIONS, `tasks/TASK-0xx` |

## Embed

```html
<script src="https://visualize.southernshutter.com/embed.js" data-height="720"></script>
```
Host page receives `shutter-vis:render_ready` and `shutter-vis:lead_submitted` DOM events (and `dataLayer`
pushes when GTM is present). Allowed framing origins come from `site_config.embed.allowedOrigins` +
`EMBED_ALLOWED_ORIGINS`.
