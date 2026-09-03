# TASK-011 — Admin

**Status:** BUILT (leads, session review with overlay/BOM/renders/QA/events, catalog, config, version, re-run assessment, force render).
**Outcome:** leads, session review, re-run assessment.

- HTTP Basic (`ADMIN_USER` / `ADMIN_PASS`), fail-closed 503 when unset.
- `/admin/leads` (quotes + recent sessions + funnel counts), `/admin/sessions/:id`, `/admin/catalog`, `/admin/config` (edit any `site_config` key as JSON; busts the cache), `/admin/version`.

## To finish
- Per-opening include/exclude toggle in admin (the `openings.include` column exists; needs a POST + re-BOM).
- CSV export of quotes if SSC wants it in their CRM.
