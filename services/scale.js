// services/scale.js — scale solver: reference construction components in the assessment -> inches per
// pixel -> opening dimensions. No homeowner measurement in v1.
//
// Ladder (highest -> lowest reliability), nominal sizes in docs/STANDARD-DIMENSIONS.md:
//   front_door (80" slab height) -> garage_door (84" height) -> brick_course (3 courses = 8") ->
//   siding_lap (reveal, default 6") -> window_standard (60" height) -> default: assume the median
//   window is a 36×60 double-hung.
// Height is the primary axis everywhere: door widths vary (32/36/42) but slab height is 80" almost
// without exception; garage heights are 84" (7') far more consistently than widths (8/9/16').
//
// A Street View shot is oblique, so a single in/px is an approximation that is best near the reference and
// drifts across the facade. v1 accepts that (target ±10% on the fixture table, TASK-005). The sanity check
// against a second reference exists to catch the gross failures (a bbox drawn on the wrong object), not
// perspective.
const REFERENCES = {
  front_door: { inches: 80, axis: 'h', reliability: 1.0 },
  front_door_with_trim: { inches: 84, axis: 'h', reliability: 0.9 },
  garage_door: { inches: 84, axis: 'h', reliability: 0.85 },
  brick_course: { inchesPerUnit: 8 / 3, axis: 'h', reliability: 0.8, needsCount: true },
  siding_lap: { inchesPerUnit: 6, axis: 'h', reliability: 0.6, needsCount: true, unitFromField: 'reveal_in' },
  window_standard: { inches: 60, axis: 'h', reliability: 0.4 },
};
const DEFAULT_WINDOW = { w: 36, h: 60 };
const AGREEMENT_TOLERANCE = 0.25; // second reference within ±25% of the first counts as agreement

function candidateScale(ref) {
  const spec = REFERENCES[ref.type];
  if (!spec || !ref.bbox) return null;
  const px = Number(ref.bbox[spec.axis]);
  if (!(px > 0)) return null;
  let inches;
  if (spec.needsCount) {
    const count = Number(ref.count);
    if (!(count > 0)) return null;
    const unit = spec.unitFromField && Number(ref[spec.unitFromField]) > 0 ? Number(ref[spec.unitFromField]) : spec.inchesPerUnit;
    inches = count * unit;
  } else inches = spec.inches;
  const confidence = Math.max(0, Math.min(1, Number(ref.confidence == null ? 0.7 : ref.confidence)));
  return { type: ref.type, inPerPx: inches / px, weight: spec.reliability * confidence, confidence, reliability: spec.reliability };
}

/**
 * @param {object} assessment  parsed assess.v1 JSON
 * @returns {{inPerPx:number|null, source:string, confidence:number, candidates:Array, note?:string}}
 */
function solve(assessment) {
  const refs = Array.isArray(assessment && assessment.reference_objects) ? assessment.reference_objects : [];
  const candidates = refs.map(candidateScale).filter((c) => c && c.confidence >= 0.3).sort((a, b) => b.weight - a.weight);
  if (candidates.length) {
    const primary = candidates[0];
    let confidence = primary.weight, note = null;
    const second = candidates[1];
    if (second) {
      const ratio = second.inPerPx / primary.inPerPx;
      if (Math.abs(ratio - 1) <= AGREEMENT_TOLERANCE) {
        confidence = Math.min(1, primary.weight + 0.1); // corroborated: a small boost, never below the primary alone
        note = `agrees with ${second.type} (ratio ${ratio.toFixed(2)})`;
      } else {
        confidence = primary.weight * 0.6;
        note = `disagrees with ${second.type} (ratio ${ratio.toFixed(2)}) — kept ${primary.type}`;
      }
    }
    return { inPerPx: primary.inPerPx, source: primary.type, confidence: round3(confidence), candidates, note };
  }
  // Fallback: assume the median window height is a 60" double-hung.
  const windows = (assessment && assessment.openings || []).filter((o) => o.kind === 'window' && o.bbox && Number(o.bbox.h) > 0);
  if (windows.length) {
    const hs = windows.map((o) => Number(o.bbox.h)).sort((a, b) => a - b);
    const median = hs[Math.floor(hs.length / 2)];
    return { inPerPx: DEFAULT_WINDOW.h / median, source: 'default_window_36x60', confidence: 0.2, candidates, note: `assumed median window (${median}px tall) is ${DEFAULT_WINDOW.h}"` };
  }
  return { inPerPx: null, source: 'none', confidence: 0, candidates, note: 'no reference objects and no windows' };
}

const round3 = (n) => Math.round(n * 1000) / 1000;
module.exports = { solve, REFERENCES, DEFAULT_WINDOW, AGREEMENT_TOLERANCE };
