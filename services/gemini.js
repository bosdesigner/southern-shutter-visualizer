// services/gemini.js — thin REST client for the two Gemini calls (no SDK dependency).
//   generateJson(): call #1 facade assessment + the verify round-trip (vision -> strict JSON).
//   generateImage(): call #2 assembly (text + base photo + optional reference art -> image).
// Keys are server-side only. Both return { ok:false, reason } rather than throwing when unconfigured, so the
// pipeline can record an honest status instead of crashing a session.
const { parseJson } = require('../lib/util');
const ASSESS_MODEL = process.env.GEMINI_ASSESS_MODEL || 'gemini-2.5-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const configured = () => Boolean(process.env.GEMINI_API_KEY);

// Accept a data URI or an https URL; Gemini inline_data needs raw base64 + mime.
async function toInline(ref) {
  const s = String(ref || '');
  const m = s.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (m) return { mime_type: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], data: m[2] };
  const r = await fetch(s, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`fetch_image ${r.status}`);
  const type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
  return { mime_type: /^image\//.test(type) ? type : 'image/jpeg', data: Buffer.from(await r.arrayBuffer()).toString('base64') };
}

async function call(model, body, timeoutMs) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs || 90000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(j.error && j.error.message) || 'error'}`);
  const cand = j.candidates && j.candidates[0];
  const parts = (cand && cand.content && cand.content.parts) || [];
  return { parts, finishReason: cand && cand.finishReason, usage: j.usageMetadata || null };
}

async function generateJson({ prompt, images = [], model, maxTokens = 8000 }) {
  if (!configured()) return { ok: false, reason: 'no GEMINI_API_KEY' };
  try {
    const parts = [];
    for (const img of images) parts.push({ inline_data: await toInline(img) });
    parts.push({ text: prompt });
    const out = await call(model || ASSESS_MODEL, {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: maxTokens },
    }, 120000);
    if (out.finishReason === 'MAX_TOKENS') return { ok: false, reason: 'truncated_at_max_tokens' };
    const raw = out.parts.filter((p) => p.text).map((p) => p.text).join('\n');
    const json = parseJson(raw);
    if (!json) return { ok: false, reason: 'unparseable_json', raw: raw.slice(0, 500) };
    return { ok: true, json, model: model || ASSESS_MODEL, usage: out.usage };
  } catch (e) { return { ok: false, reason: e.message }; }
}

async function generateImage({ prompt, baseImage, referenceImages = [], model }) {
  if (!configured()) return { ok: false, reason: 'no GEMINI_API_KEY' };
  try {
    const parts = [{ text: prompt }, { inline_data: await toInline(baseImage) }];
    for (const ref of referenceImages.slice(0, 3)) parts.push({ inline_data: await toInline(ref) });
    const out = await call(model || IMAGE_MODEL, { contents: [{ role: 'user', parts }] }, 120000);
    const img = out.parts.find((p) => p.inlineData || p.inline_data);
    const d = img && (img.inlineData || img.inline_data);
    if (!d || !d.data) return { ok: false, reason: 'no_image_returned' };
    const mime = d.mimeType || d.mime_type || 'image/jpeg';
    return { ok: true, dataUri: `data:${mime};base64,${d.data}`, model: model || IMAGE_MODEL, usage: out.usage };
  } catch (e) { return { ok: false, reason: e.message }; }
}

module.exports = { configured, generateJson, generateImage, ASSESS_MODEL, IMAGE_MODEL };
