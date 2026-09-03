# TASK-008 — Funnel UI

**Status:** BUILT (start → progress → gallery → quote → thanks, with event logging).
**Outcome:** start → progress → gallery → quote; events in `events`.

- `/` address capture (Places autocomplete via `/api/places`, server-proxied key) → `POST /api/session` → `/r/:id` polls `/api/session/:id/status`.
- Gallery: hero render, thumbnails per rendered style, style/color/material selects → `POST /api/session/:id/render` (cached per combination), "This isn't my house" shot picker → `POST /api/session/:id/shot`.
- Quote form → `POST /api/session/:id/quote` → `/thanks/:id`.
- Events logged: session_created, geocoded, streetview_shots, assessed, render_started/done/failed, style_changed, shot_changed, quote_submitted, quote_emails, status:*.

## To finish
- Copy pass with SSC (`site_config.copy` — editable in `/admin/config` without a deploy).
- Real-key run-through on mobile; check the iframe height handshake on the SSC page (TASK-010).

## Verification
`DEV_FIXTURES=1 npm run dev` → complete the funnel; `/admin/leads` funnel counts show every event type; `verify-bootstrap` covers the API path.
