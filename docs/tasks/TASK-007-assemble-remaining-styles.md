# TASK-007 — The other five templates

**Status:** Drafted (`paneled`, `combination`, `movable-louver`, `board-batten`, `bahama`); each needs its own round-trip before it is offered in the gallery.
**Outcome:** each template round-trip verified before seeding.

- Same procedure as TASK-006 per style. Bahama is the risk: the top-hinged, projected geometry is unlike the others, and `verify.v1` may need a Bahama-specific check ("panel projects from the wall").
- Gallery order/inclusion is `site_config.defaults.galleryStyles` — remove a style there until its template passes; no code change needed.

## Verification
One `docs/verification/assemble/<style>.md` per style with its score table; `galleryStyles` lists only verified styles.
