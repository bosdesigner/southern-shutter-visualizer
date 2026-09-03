# STANDARD-DIMENSIONS — the assumption table behind the scale solver

Used by `services/scale.js` (scale references) and `services/sizing.js` (window catalog, sizing rules).
All nominal US residential standards. **Flagged** rows need Southern Shutter Company confirmation (build map F3).

## Scale references (highest → lowest reliability)

| Component | Nominal size | Used axis | Notes |
|---|---|---|---|
| Front entry door (slab) | 36" × 80" | height 80" | 32" / 42" widths occur; height is the consistent dimension |
| Front door incl. casing | ~40" × 84" | height 84" | when the bbox includes the trim |
| Single garage door | 8' or 9' × 7' | height 84" | 16' × 7' double; 8' tall on newer homes (solver keeps 84") |
| Brick coursing | 3 courses = 8" (modular) | height, per course 2.667" | 2-5/8" brick + 3/8" joint; assessor counts courses in a clean patch |
| Lap siding reveal | 4" / 6" / 7" / 8" | height, per lap | 4" traditional wood; 6–7" fiber cement common; assessor estimates `reveal_in` |
| Standard double-hung | 36" × 60" (3060) | height 60" | least reliable — highly variable |
| Story height | ~10' floor-to-floor | — | story assignment only, never scale |
| Porch column | 8"–10" square | — | tie-breaker only (not implemented in v1) |

Solver behaviour: pick the highest `reliability × confidence` candidate, sanity-check it against the next
candidate (±25% agreement raises confidence; disagreement keeps the primary at reduced confidence). No
reference at all → assume the median detected window is 60" tall (confidence 0.2). Perspective is not
corrected in v1: expect ±10% near the reference and worse at the far edge of an oblique shot.

## Window catalog (defaults and snapping)

| Type | Common sizes (w × h) |
|---|---|
| Double-hung | 24×36, 28×46, 30×50, 32×54, 36×60, 36×72 |
| Picture / fixed | 48×48, 60×48, 72×60 |
| Casement (pair) | 48×48, 60×60 |
| Transom / arch top | flagged `arch_top`; rendered but excluded from the BOM in v1 |

A detected opening snaps to a catalog size when both dimensions are within ±12%; otherwise it keeps the
estimate rounded to ½".

## Shutter sizing rules (seed values — **replace with SSC's**)

- Pair panel width = ½ opening width, including casing (**flagged**: inside- vs outside-casing convention)
- Single when the opening is narrower than 18" (**flagged**)
- Height = opening height incl. casing; movable-louver / Bahama per SSC rules (**flagged**)
- Snap increment ¼" (**flagged**: custom shop)
- Sections by height: ≤ 48" = 1; 48–72" = 2; > 72" = 3 (**flagged**: check against the "2 Sections" product art)
- Bahama: one unit, width = opening width, projected 45°, max 84" (**flagged**)
- Board & Batten: minimum 3 boards → min panel width 10.5" (**flagged**)
- Default min/max panel: 8"–36" wide, 18"–108" tall (**flagged**)

Where the seed values live: `data/catalog/sizing_rules.json` → `sizing_rules` table (`confirmed_by_ssc`
false until SSC signs off; `/admin/catalog` shows the flag).
