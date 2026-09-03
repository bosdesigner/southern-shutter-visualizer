# TASK-006 — First frozen template (fixed-louver) + verify round-trip

**Status:** Template drafted; round-trip not yet run (needs Gemini key + a real shot).
**Outcome:** QA score ≥ threshold on fixtures.

- `prompts/assemble/_base.txt` carries the shared rules (change nothing but shutters; exact count; mounting geometry; color; existing-shutter replacement).
- `prompts/assemble/fixed-louver.txt` describes only the product.
- `services/verify.js` + `prompts/verify.v1.txt`: count panels, style/color match, house unchanged → `qa_score` in [0,1].

## Procedure
1. `node scripts/verify-template.js fixed-louver --image <fixture shot> --color black` → saves the render to `verify-output/` and prints the QA JSON + score.
2. Iterate on wording until 8 of 10 fixtures score ≥ 0.8 with `house_unchanged: true`. Record every attempt's score in `docs/verification/assemble/fixed-louver.md` (same working-record habit as AS's render-fidelity docs).
3. Freeze: bump `PROMPT_VERSION` to `assemble.v1` final; note the score table in the doc.

## Verification
The score table + the 10 renders committed as small JPEGs under `docs/verification/assemble/fixed-louver/`.
