// services/verify.js — reference round-trip (prompts/verify.v1.txt): ask the vision model to count and
// describe the shutters in a RENDER, compare with the BOM, produce renders.qa_score in [0,1]. Same method
// used to freeze the AnotherStoryBLDR Craftsman template — a render is only as good as its checkable score.
const fs = require('fs');
const path = require('path');
const gemini = require('./gemini');
const PROMPT_VERSION = 'verify.v1';
const PROMPT = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'verify.v1.txt'), 'utf8');

function score(expected, observed) {
  const exp = Number(expected.shutter_count) || 0, obs = Number(observed.shutter_count) || 0;
  const countScore = exp ? Math.max(0, 1 - Math.abs(exp - obs) / exp) : (obs === 0 ? 1 : 0);
  const styleScore = observed.style_match === true ? 1 : observed.style_match === false ? 0.5 : 0.75;
  const houseScore = observed.house_unchanged === false ? 0.4 : 1;
  const colorScore = observed.color_match === false ? 0.8 : 1;
  return Math.round(countScore * styleScore * houseScore * colorScore * 1000) / 1000;
}

async function verifyRender({ renderImage, bom, styleName, colorName }) {
  const expected = { shutter_count: (bom.lines || []).reduce((n, l) => n + l.qty, 0), pair_count: bom.pair_count, single_count: bom.single_count };
  const prompt = PROMPT.replace('{{style_name}}', styleName).replace('{{color_name}}', colorName);
  const r = await gemini.generateJson({ prompt, images: [renderImage], maxTokens: 2000 });
  if (!r.ok) return { ok: false, reason: r.reason, expected };
  return { ok: true, expected, observed: r.json, score: score(expected, r.json), promptVersion: PROMPT_VERSION };
}

module.exports = { verifyRender, score, PROMPT_VERSION };
