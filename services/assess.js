// services/assess.js — Gemini call #1: strict-JSON facade assessment (prompts/assess.v1.txt). The output
// is a checkable artifact: stored in assessments.json, drawn as an overlay in admin, re-runnable.
const fs = require('fs');
const path = require('path');
const gemini = require('./gemini');
const PROMPT_VERSION = 'assess.v1';
const PROMPT = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'assess.v1.txt'), 'utf8');
const KINDS = new Set(['window', 'door', 'garage']);
const REF_TYPES = new Set(['front_door', 'front_door_with_trim', 'garage_door', 'brick_course', 'siding_lap', 'window_standard']);

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const bbox = (b) => (b && typeof b === 'object' ? { x: num(b.x), y: num(b.y), w: num(b.w), h: num(b.h) } : null);

// Normalise whatever the model returned into the documented shape; drop entries that cannot be used.
function normalize(j, imageWH) {
  const out = {
    image_wh: Array.isArray(j.image_wh) && j.image_wh.length === 2 ? j.image_wh.map((n) => num(n)) : imageWH,
    stories: num(j.stories, 1), facade_material: String(j.facade_material || ''), roof_type: String(j.roof_type || ''),
    visibility: ['clear', 'partial', 'obscured'].includes(String(j.visibility || '').toLowerCase()) ? String(j.visibility).toLowerCase() : 'clear',
    occlusions: Array.isArray(j.occlusions) ? j.occlusions.map(String) : [],
    existing_shutter_style_guess: j.existing_shutter_style_guess ? String(j.existing_shutter_style_guess) : null,
    reference_objects: [], openings: [],
  };
  for (const r of j.reference_objects || []) {
    const b = bbox(r.bbox);
    if (!b || !REF_TYPES.has(r.type)) continue;
    out.reference_objects.push({ type: r.type, bbox: b, confidence: Math.min(1, Math.max(0, num(r.confidence, 0.5))), count: r.count != null ? num(r.count) : undefined, reveal_in: r.reveal_in != null ? num(r.reveal_in) : undefined });
  }
  for (const o of j.openings || []) {
    const b = bbox(o.bbox);
    if (!b || !KINDS.has(o.kind)) continue;
    out.openings.push({ kind: o.kind, bbox: b, story: num(o.story, 1), existing_shutters: Boolean(o.existing_shutters),
      shape: o.shape === 'arch' ? 'arch' : 'rect', grouped_with: o.grouped_with != null ? num(o.grouped_with) : null, label: o.label ? String(o.label) : null });
  }
  return out;
}

async function assess({ image, imageWH }) {
  const r = await gemini.generateJson({ prompt: PROMPT, images: [image] });
  if (!r.ok) return r;
  const json = normalize(r.json, imageWH);
  if (!json.openings.length) return { ok: false, reason: 'no_openings_detected', json, model: r.model };
  return { ok: true, json, model: r.model, promptVersion: PROMPT_VERSION, usage: r.usage };
}

module.exports = { assess, normalize, PROMPT_VERSION, PROMPT };
