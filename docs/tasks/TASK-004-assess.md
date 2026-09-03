# TASK-004 — Gemini call #1: facade assessment

**Status:** BUILT (prompt + JSON normalisation + overlay); untested against real Street View until keys exist.
**Outcome:** call #1 + schema validation; overlay page showing bboxes on each fixture.

- `prompts/assess.v1.txt` asks for pixel bboxes for reference objects and openings, story, existing shutters, arch shape, visibility.
- `services/assess.js` normalises the JSON (drops unknown kinds/types, clamps confidence) and stores it with the scale result.
- `/admin/sessions/:id` draws the overlay (`public/js/opening-overlay.js`): green = in BOM, grey = door/garage, orange = flagged, blue = references.

## To finish
1. Run the 10 fixture addresses; compare overlay boxes to the photo. Track: missed windows, boxes that include shutters, door slab vs casing confusion.
2. Tune the prompt; bump `PROMPT_VERSION` to `assess.v2` when wording changes.
3. Decide the `needs_photo` threshold for `visibility: obscured`.

## Verification
Overlay screenshots for all 10 fixtures saved under `docs/verification/assess/` with a miss/false-positive tally.
