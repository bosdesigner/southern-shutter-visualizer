// services/sizing.js — openings + scale -> estimated opening inches -> shutter panel dims -> snap to
// sizing_rules -> bill of materials. Pure functions; the DB row shapes are passed in.
//
// Rules (seed values in data/catalog/sizing_rules.json, replace once SSC confirms — flag F3):
//   pairs by default; single when the opening is narrower than width_rule.single_below_w (18")
//   pair panel width = ½ opening width (width_rule.pair = 'half_opening'); single = full opening width
//   height = opening height incl. casing; bahama = single unit, full opening width
//   snap to w/h increment (¼"), clamp to min/max and flag when clamped
//   sections by height: ≤48" = 1, 48–72" = 2, > 72" = 3 (width_rule.sections overrides)
//   doors and garage doors are never shuttered; arch tops are flagged and excluded from the BOM in v1
const WINDOW_CATALOG = [
  [24, 36], [28, 46], [30, 50], [32, 54], [36, 60], [36, 72], // double-hung
  [48, 48], [60, 48], [72, 60],                               // picture / fixed
  [48, 48], [60, 60],                                         // casement pairs
];
const SNAP_TOLERANCE = 0.12; // snap to a catalog window when both dims are within ±12%
const DEFAULT_SECTIONS = [[48, 1], [72, 2], [Infinity, 3]];

const snapTo = (n, inc) => Math.round(n / inc) * inc;
const r1 = (n) => Math.round(n * 100) / 100;

function snapWindow(w, h) {
  let best = null;
  for (const [cw, ch] of WINDOW_CATALOG) {
    const dw = Math.abs(cw - w) / cw, dh = Math.abs(ch - h) / ch;
    if (dw <= SNAP_TOLERANCE && dh <= SNAP_TOLERANCE) {
      const d = dw + dh;
      if (!best || d < best.d) best = { w: cw, h: ch, d };
    }
  }
  return best ? { w: best.w, h: best.h, snapped: true } : { w: Math.round(w * 2) / 2, h: Math.round(h * 2) / 2, snapped: false };
}

function sectionsFor(h, rule) {
  const table = Array.isArray(rule && rule.sections) ? rule.sections : DEFAULT_SECTIONS;
  for (const [maxH, n] of table) if (h <= maxH) return n;
  return table[table.length - 1][1];
}

/**
 * Estimate opening dimensions from bboxes and a scale.
 * @returns openings with est_w_in / est_h_in / include / flag filled in
 */
function measureOpenings(openings, inPerPx) {
  return (openings || []).map((o, i) => {
    const out = { ...o, idx: i, include: true, flag: null, est_w_in: null, est_h_in: null, snapped: false };
    if (!o.bbox || !(inPerPx > 0)) { out.include = false; out.flag = 'no_scale'; return out; }
    const w = Number(o.bbox.w) * inPerPx, h = Number(o.bbox.h) * inPerPx;
    if (o.kind === 'door' || o.kind === 'garage') { out.include = false; out.flag = 'not_shuttered_kind'; out.est_w_in = r1(w); out.est_h_in = r1(h); return out; }
    if (o.shape === 'arch') { out.include = false; out.flag = 'arch_top'; out.est_w_in = r1(w); out.est_h_in = r1(h); return out; }
    const s = snapWindow(w, h);
    out.est_w_in = s.w; out.est_h_in = s.h; out.snapped = s.snapped;
    if (o.include === false) { out.include = false; out.flag = 'excluded_by_user'; }
    return out;
  });
}

/**
 * Build the BOM for one style.
 * @param {Array} openings  from measureOpenings
 * @param {object} rule     sizing_rules row: {min_w,max_w,min_h,max_h,w_increment,h_increment,width_rule}
 * @param {object} style    styles row (slug decides bahama/board-batten behaviour via width_rule.mode)
 */
function buildBom(openings, rule, style) {
  const wr = (rule && rule.width_rule) || {};
  const mode = wr.mode || 'pair'; // 'pair' | 'single'
  const singleBelow = Number(wr.single_below_w != null ? wr.single_below_w : 18);
  const wInc = Number(rule && rule.w_increment) || 0.25, hInc = Number(rule && rule.h_increment) || 0.25;
  const lines = [];
  let pairs = 0, singles = 0, sqft = 0;
  for (const o of openings) {
    if (!o.include) continue;
    const isSingle = mode === 'single' || o.est_w_in < singleBelow;
    const rawW = isSingle ? o.est_w_in : o.est_w_in / 2;
    let panelW = snapTo(rawW, wInc), panelH = snapTo(o.est_h_in, hInc), flag = null;
    if (rule) {
      const cw = Math.min(Number(rule.max_w), Math.max(Number(rule.min_w), panelW));
      const ch = Math.min(Number(rule.max_h), Math.max(Number(rule.min_h), panelH));
      if (cw !== panelW || ch !== panelH) flag = 'clamped_to_rule';
      panelW = cw; panelH = ch;
    }
    const qty = isSingle ? 1 : 2;
    const sections = sectionsFor(panelH, wr);
    const line = { opening_idx: o.idx, opening_id: o.id || null, label: o.label || `Opening ${o.idx + 1}${o.story ? ` (story ${o.story})` : ''}`,
      kind: isSingle ? 'single' : 'pair', qty, panel_w: r1(panelW), panel_h: r1(panelH), sections, story: o.story || null,
      opening_w: o.est_w_in, opening_h: o.est_h_in, flag };
    lines.push(line);
    if (isSingle) singles++; else pairs++;
    sqft += (panelW * panelH * qty) / 144;
  }
  return { style_slug: style ? style.slug : null, lines, pair_count: pairs, single_count: singles, sqft: r1(sqft),
    excluded: openings.filter((o) => !o.include).map((o) => ({ opening_idx: o.idx, kind: o.kind, flag: o.flag })) };
}

module.exports = { measureOpenings, buildBom, snapWindow, sectionsFor, WINDOW_CATALOG, DEFAULT_SECTIONS };
