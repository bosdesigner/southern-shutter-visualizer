# TASK-010 — Embed on southernshutter.com

**Status:** BUILT (`/embed.js`, iframe resize, allowed origins, postMessage events); staging page test TODO.
**Outcome:** works on a staging HTML page mimicking their site.

- `GET /embed.js` injects an iframe of `/embed?parent=<origin>`; `public/js/embed-client.js` posts `resize`, `session_started`, `render_ready`, `lead_submitted` to the parent; the loader re-dispatches them as `shutter-vis:*` DOM events and `dataLayer` pushes.
- Framing is allowed only from `site_config.embed.allowedOrigins` ∪ `EMBED_ALLOWED_ORIGINS` (CSP `frame-ancestors`).
- Session-owner cookie is `SameSite=None; Secure` so the iframe keeps it on the SSC domain (needs HTTPS, which the Replit deployment provides).

## To finish
1. Build `docs/verification/embed/staging.html` that copies SSC's page chrome and includes the one script tag; open it from a different origin (e.g. a local static server on another port) and walk the funnel.
2. Send SSC's web vendor the one-line snippet (F1) and the allowed-origin list.

## Verification
Screen recording or screenshots of the funnel completing inside the staging page, with the `shutter-vis:lead_submitted` event visible in the console.
