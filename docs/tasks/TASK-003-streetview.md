# TASK-003 — Street View best-shot selection

**Status:** BUILT (candidate pull + bearing-based default); fixture list TODO.
**Outcome:** address → candidate shots → chosen shot; test fixture of 10 Birmingham/Montgomery addresses with chosen headings saved.

- `services/streetview.js`: geocode → pano metadata → bearing from pano to house → 5 headings (±30°) → Street View Static.
- Default choice is the on-bearing shot; the homeowner can switch under "This isn't my house" (re-runs assessment).
- No coverage → session `needs_photo` (F4: expect this more often than the second-story product does).

## To finish
1. Enable Geocoding, Places, Street View Static + metadata on the SSC Maps project; set `GOOGLE_MAPS_API_KEY` (or `GOOGLE_STREETVIEW_API_KEY`, the AnotherStoryBLDR name — both are read).
2. Fill `fixtures/addresses.json` with 10 addresses; run each through `/api/session`; review shots in `/admin/sessions/:id`; record `chosen_heading`.
3. Consider a vision-scored pick (ask Gemini which shot shows the most windows) if the on-bearing default is wrong on > 2 of 10.

## Verification
The 10 fixture sessions in admin each have a chosen shot that shows the facade; `fixtures/addresses.json` records the headings.
