// services/assemble.js — Gemini call #2: image generation from FROZEN per-style templates.
//
// Assembly is code, not a second LLM call (the AnotherStoryBLDR lesson: an LLM paraphrase is a lossy,
// unverifiable step). prompts/assemble/_base.txt carries the shared camera lock + "do not alter the house"
// exclusions; prompts/assemble/<style>.txt describes only the shutter product. The per-opening bbox + inches
// from the BOM are written into the prompt so the picture and the quote agree.
const fs = require('fs');
const path = require('path');
const gemini = require('./gemini');
const PROMPT_DIR = path.join(__dirname, '..', 'prompts', 'assemble');
const PROMPT_VERSION = 'assemble.v1';
const cache = new Map();
function readTemplate(name) {
  if (!cache.has(name)) cache.set(name, fs.readFileSync(path.join(PROMPT_DIR, `${name}.txt`), 'utf8').trim());
  return cache.get(name);
}
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));

// Openings as a countable, positioned list. Positions are given as fractions of the image so the model can
// find them regardless of resolution; sizes in inches so the proportions match the BOM.
function openingsClause(bom, openings, imageWH) {
  const [W, H] = imageWH || [640, 640];
  const byIdx = new Map(openings.map((o) => [o.idx, o]));
  return (bom.lines || []).map((l) => {
    const o = byIdx.get(l.opening_idx) || {};
    const b = o.bbox || {};
    const cx = ((Number(b.x) + Number(b.w) / 2) / W * 100).toFixed(0), cy = ((Number(b.y) + Number(b.h) / 2) / H * 100).toFixed(0);
    const unit = l.kind === 'pair' ? `a PAIR of shutters, one each side, each ${l.panel_w}" wide × ${l.panel_h}" tall` : `ONE shutter ${l.panel_w}" wide × ${l.panel_h}" tall`;
    return `${l.label}: window centred at ${cx}% across, ${cy}% down, opening about ${l.opening_w}" × ${l.opening_h}" — ${unit}, ${l.sections} section${l.sections > 1 ? 's' : ''}.`;
  }).join('\n');
}

function buildPrompt({ template, styleName, colorName, colorHex, materialName, bom, openings, imageWH, existingShutters }) {
  const base = readTemplate('_base');
  const style = readTemplate(template);
  const count = (bom.lines || []).reduce((n, l) => n + l.qty, 0);
  return fill(`${base}\n\n${style}`, {
    style_name: styleName, color_name: colorName, color_hex: colorHex, material_name: materialName,
    shutter_count: count, pair_count: bom.pair_count, single_count: bom.single_count,
    openings: openingsClause(bom, openings, imageWH),
    existing_shutters: existingShutters ? 'The house currently has shutters on some windows: REPLACE them with the shutters described here, at the same openings; do not leave two sets.' : 'The house currently has no shutters.',
  });
}

async function render({ prompt, baseImage, referenceImages }) {
  const out = await gemini.generateImage({ prompt, baseImage, referenceImages });
  return { ...out, promptVersion: PROMPT_VERSION };
}

module.exports = { buildPrompt, render, readTemplate, PROMPT_VERSION };
