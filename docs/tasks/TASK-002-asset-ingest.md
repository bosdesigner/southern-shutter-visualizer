# TASK-002 — Product art into Cloudinary

**Status:** TODO — blocked on SSC permission + Cloudinary account.
**Outcome:** product art per variant/color in Cloudinary with `is_reference` flags; asset count per variant report.

1. Get written OK from SSC to use their product art (they own it; the visualizer is theirs, so this is a formality — but get it).
2. Hand-list the image URLs from southernshutter.com/datafiles in `data/catalog/asset-sources.json` (`variant`, `color`, `kind`, `url`).
3. `node scripts/scrape-ssc-assets.js --i-have-ssc-permission` → `data/catalog/assets.json` + local files.
4. `npm run seed:catalog` uploads via `services/cloudinary.js` and inserts `assets` rows.
5. Mark the cleanest straight-on product shot per style as `is_reference` (used as the Gemini reference image in call #2).

## Verification
`/admin/catalog` variant table shows non-zero "ref" counts for every renderable style; the seed script's table lists reference_assets per style.
