# TASK-001 — Catalog schema + seed

**Status:** BUILT in dev. Grades/variants are a generated cross-product until SSC's real SKU list replaces them.
**Outcome:** catalog tables + `scripts/seed-catalog.js` from authored JSON; `/admin/catalog` renders all 6 styles × 3 lines.

- Hierarchy mirrors SSC: material line → style → grade → variant (`sections`, `center_rail`, `control_rods`, `louver_size`, `renderable`).
- Authored JSON in `data/catalog/`; seed is idempotent (upsert by slug) — safe to re-run after edits.
- Interior line is seeded `renderable=false` (quotable later, never rendered).
- Sizing rules carry `confirmed_by_ssc=false`; `/admin/catalog` shows the flag (F3).

## To finish
- Replace the generated grade list with SSC's actual offering per style (some styles may not have DesignLine).
- Get SSC's color chart (names + hex + finish) and replace `colors.json`.

## Verification
`npm run seed:catalog` prints a per-style table (lines, variants, reference assets); `/admin/catalog` shows 6 × 3 cells with variant counts.
