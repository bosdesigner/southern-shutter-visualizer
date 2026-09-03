// scripts/verify-template.js — round-trip check for one assemble template (TASK-006/007).
//   node scripts/verify-template.js <style-slug> [--image path.jpg] [--color black] [--material exterior-wood] [--assessment fixtures/assessment.sample.json]
// Without keys: prints the BOM and the assembled prompt (deterministic — diffable between edits).
// With GEMINI_API_KEY (+ an image): renders, saves verify-output/<style>-<ts>.jpg, runs verify.v1 and prints the score.
require('../lib/env');
const fs = require('fs');
const path = require('path');
const assessSvc = require('../services/assess');
const scale = require('../services/scale');
const sizing = require('../services/sizing');
const assemble = require('../services/assemble');
const verify = require('../services/verify');
const gemini = require('../services/gemini');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const styleSlug = process.argv[2];
if (!styleSlug || styleSlug.startsWith('--')) { console.error('usage: node scripts/verify-template.js <style-slug> [--image f.jpg] [--color black] [--material exterior-wood]'); process.exit(2); }
const catalog = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'catalog', f), 'utf8'));
const style = catalog('styles.json').find((s) => s.slug === styleSlug);
if (!style) { console.error('unknown style', styleSlug); process.exit(2); }
const color = catalog('colors.json').find((c) => c.slug === arg('--color', 'black'));
const material = catalog('material_lines.json').find((m) => m.slug === arg('--material', 'exterior-wood'));
const rules = catalog('sizing_rules.json').rules;
const rule = rules.find((r) => r.style === styleSlug) || rules.find((r) => r.style === null);

(async () => {
  const raw = JSON.parse(fs.readFileSync(arg('--assessment', path.join(__dirname, '..', 'fixtures', 'assessment.sample.json')), 'utf8'));
  delete raw._notes;
  const a = assessSvc.normalize(raw, raw.image_wh);
  const sc = scale.solve(a);
  const openings = sizing.measureOpenings(a.openings, sc.inPerPx);
  const bom = sizing.buildBom(openings, rule, style);
  console.log(`scale: ${sc.inPerPx && sc.inPerPx.toFixed(4)} in/px from ${sc.source} (confidence ${sc.confidence})${sc.note ? ' — ' + sc.note : ''}`);
  console.table(bom.lines.map((l) => ({ opening: l.label, kind: l.kind, qty: l.qty, panel: `${l.panel_w}×${l.panel_h}`, sections: l.sections, flag: l.flag || '' })));
  console.log(`BOM: ${bom.pair_count} pairs, ${bom.single_count} singles, ${bom.sqft} sq ft; excluded: ${JSON.stringify(bom.excluded)}`);
  const prompt = assemble.buildPrompt({ template: style.assemble_template, styleName: style.name, colorName: color.name, colorHex: color.hex, materialName: material.name, bom, openings, imageWH: a.image_wh, existingShutters: openings.some((o) => o.existing_shutters) });
  console.log('\n--- PROMPT (' + assemble.PROMPT_VERSION + ') ---\n' + prompt + '\n--- END ---\n');
  const image = arg('--image');
  if (!image) return console.log('No --image given: prompt-only run. Pass --image to render (needs GEMINI_API_KEY).');
  if (!gemini.configured()) return console.log('GEMINI_API_KEY unset: skipping render.');
  const base = `data:image/${path.extname(image).slice(1) === 'png' ? 'png' : 'jpeg'};base64,${fs.readFileSync(image).toString('base64')}`;
  const out = await assemble.render({ prompt, baseImage: base, referenceImages: [] });
  if (!out.ok) return console.error('render failed:', out.reason);
  const dir = path.join(__dirname, '..', 'verify-output'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${styleSlug}-${Date.now()}.jpg`);
  fs.writeFileSync(file, Buffer.from(out.dataUri.split(',')[1], 'base64'));
  console.log('render saved:', file);
  const v = await verify.verifyRender({ renderImage: out.dataUri, bom, styleName: style.name, colorName: color.name });
  console.log(v.ok ? `QA score ${v.score}\n${JSON.stringify(v.observed, null, 2)}` : `verify failed: ${v.reason}`);
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
