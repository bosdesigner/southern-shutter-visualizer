# TASK-005 — Scale solver + BOM

**Status:** BUILT and unit-verified on the synthetic fixture; real-house fixture table TODO.
**Outcome:** fixture table comparing estimated vs hand-measured opening sizes (target ±10%).

- `services/scale.js`: reference ladder (door → garage → brick → siding → std window → default), second-reference agreement check.
- `services/sizing.js`: window-catalog snapping, pair/single rule, ¼" snap, min/max clamp with flag, sections by height, arch/door exclusion, Bahama single-unit rule.
- `scripts/verify-bootstrap.js` asserts: door 45px = 80" → 1.778 in/px; 36×60 → 18×60 2-section pair; 48×48 → 24×48 1-section pair; Bahama → 7 singles.

## To finish
1. For 5 of the fixture houses, hand-measure (or get from the homeowner) two window openings.
2. Build the table: address, opening, estimated w×h, measured w×h, error %. Target ±10% near the reference.
3. If oblique shots miss the target, add a per-story or per-column scale (left/right reference pair) — the assessment already gives bboxes to support it.

## Verification
`docs/verification/scale/fixture-table.md` with the error column; the solver's `note` field explains each pick.
