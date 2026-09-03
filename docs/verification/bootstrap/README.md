# TASK-000 / 001 / 005 / 008 / 011 verification — 2026-09-03

Environment: local Postgres 16, Node 22, `DEV_FIXTURES=1`, no API keys. `npm run verify:bootstrap` → 13/13 checks
passed (healthz tenant, catalog 6×3, scale solver 1.778 in/px from the fixture door with window agreement, BOM 7 pairs /
14 panels with the door excluded, Bahama 7 singles, fixture pipeline to `ready` with 4 gallery renders, render cache,
owner-cookie 403, quote routed to sales@ with honest `email_failed`, admin 401/200, every page renders, embed.js + CSP).

Screenshots (Chromium via Playwright, fixture facade):

| File | What |
|---|---|
| 01-start.png | address capture |
| 02-gallery.png | gallery after the pipeline: hero render, BOM summary (7 pairs · 14 panels), style/color/material, quote form |
| 03-gallery-bahama.png | after "Update render" with Bahama · White — a fifth thumbnail, cached combos not re-rendered |
| 04-thanks.png | quote submitted (row in `quotes`, `email_failed` because Postmark is unconfigured) |
| 05-admin-session-overlay.png | admin session: bbox overlay (blue references, green openings, grey door), scale note, per-render BOM tables, prompts, events |
| 06-admin-leads.png | quotes + sessions + funnel counts |
| 07-admin-catalog.png | 6 styles × 3 lines with variant counts, sizing rules flagged unconfirmed |

Not verified here (needs SSC-owned keys): Street View pull, Gemini assessment quality, Gemini render quality / QA score,
Cloudinary upload, Postmark delivery. Those are TASK-003/004/006/009 with their own artifacts.
