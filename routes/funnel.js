// routes/funnel.js — the pipeline orchestrator: address -> streetview -> assess -> scale/size -> render.
// Not an Express router: routes/api.js and routes/admin.js call these functions. Each stage writes its
// artifact row and advances sessions.status so /api/session/:id/status can report honestly:
//   created -> streetview -> assessing -> sizing -> rendering -> ready
//   terminal alternatives: needs_photo (no Street View coverage), needs_config (a key is missing), failed
const fs = require('fs');
const path = require('path');
const store = require('../store-pg');
const streetview = require('../services/streetview');
const assessSvc = require('../services/assess');
const scaleSvc = require('../services/scale');
const sizing = require('../services/sizing');
const select = require('../services/select');
const assemble = require('../services/assemble');
const verify = require('../services/verify');
const cloudinary = require('../services/cloudinary');
const { id, uuid, isProd } = require('../lib/util');

const devFixtures = () => Boolean(process.env.DEV_FIXTURES) && !isProd();
const running = new Set(); // per-session lock: one pipeline run at a time per session

async function setStatus(sessionId, status, error) {
  await store.q('UPDATE sessions SET status = $2, error = $3, updated_at = now() WHERE id = $1', [sessionId, status, error || null]);
  await store.logEvent(sessionId, `status:${status}`, error ? { error } : null);
}

async function createSession({ tenant, address, placeId, embedOrigin, source }) {
  const sid = uuid();
  const d = (tenant.site && tenant.site.defaults) || {};
  const style = await store.one('SELECT id FROM styles WHERE slug = $1', [d.style || 'fixed-louver']);
  const mat = await store.one('SELECT id FROM material_lines WHERE tenant_id = $1 AND slug = $2', [tenant.id, d.materialLine || 'exterior-wood']);
  const color = await store.one('SELECT id FROM colors WHERE tenant_id = $1 AND slug = $2', [tenant.id, d.color || 'black']);
  const row = await store.one(`INSERT INTO sessions (id, tenant_id, address, place_id, source, embed_origin, style_id, material_line_id, color_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [sid, tenant.id, address, placeId || null, source || 'streetview', embedOrigin || null, style && style.id, mat && mat.id, color && color.id]);
  await store.logEvent(sid, 'session_created', { address, placeId: placeId || null, embedOrigin: embedOrigin || null });
  return row;
}

// ---- stage: street view ---------------------------------------------------------------------------
async function stageStreetView(session, site) {
  await setStatus(session.id, 'streetview');
  if (devFixtures()) {
    const svg = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'facade.svg'));
    const dataUri = `data:image/svg+xml;base64,${svg.toString('base64')}`;
    const shot = await store.one(`INSERT INTO streetview_shots (id, session_id, heading, pitch, fov, pano_id, secure_url, score, chosen)
      VALUES ($1,$2,0,0,70,'fixture',$3,1,true) RETURNING *`, [id('shot'), session.id, dataUri]);
    return { ok: true, chosen: shot, imageWH: [640, 480] };
  }
  if (!streetview.configured()) return { ok: false, status: 'needs_config', reason: 'no GOOGLE_MAPS_API_KEY / GOOGLE_STREETVIEW_API_KEY' };
  const geo = await streetview.geocode({ address: session.address, placeId: session.place_id });
  if (!geo) return { ok: false, status: 'failed', reason: 'geocode_failed' };
  await store.q('UPDATE sessions SET lat = $2, lng = $3, place_id = COALESCE(place_id, $4), address = COALESCE($5, address) WHERE id = $1',
    [session.id, geo.lat, geo.lng, geo.placeId, geo.formatted]);
  await store.logEvent(session.id, 'geocoded', geo);
  const cand = await streetview.candidateShots(geo, (site && site.streetview) || {});
  if (!cand.ok) return { ok: false, status: cand.reason === 'no_coverage' ? 'needs_photo' : 'failed', reason: cand.reason };
  let chosen = null;
  for (const s of cand.shots) {
    const up = await cloudinary.uploadImage(s.dataUri, `shutter-vis/${session.tenant_id}/${session.id}/shots`);
    const row = await store.one(`INSERT INTO streetview_shots (id, session_id, heading, pitch, fov, pano_id, cloudinary_public_id, secure_url, score, chosen)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [id('shot'), session.id, s.heading, s.pitch, s.fov, s.panoId, up.public_id, up.secure_url, s.score, s.chosen]);
    if (s.chosen) chosen = row;
  }
  await store.logEvent(session.id, 'streetview_shots', { count: cand.shots.length, bearing: cand.bearing, pano: cand.pano.panoId });
  const [w, h] = String((site && site.streetview && site.streetview.size) || '640x640').split('x').map(Number);
  return { ok: true, chosen, imageWH: [w, h] };
}

// ---- stage: assess + scale + size ---------------------------------------------------------------
async function stageAssess(session, shot, imageWH) {
  await setStatus(session.id, 'assessing');
  let res;
  if (devFixtures()) {
    const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'assessment.sample.json'), 'utf8'));
    delete json._notes;
    res = { ok: true, json: assessSvc.normalize(json, imageWH), model: 'fixture', promptVersion: assessSvc.PROMPT_VERSION };
  } else {
    res = await assessSvc.assess({ image: shot.secure_url, imageWH });
  }
  if (!res.ok) return { ok: false, status: /GEMINI_API_KEY/.test(res.reason || '') ? 'needs_config' : 'failed', reason: res.reason };
  await setStatus(session.id, 'sizing');
  const scale = scaleSvc.solve(res.json);
  const assessment = await store.one(`INSERT INTO assessments (id, session_id, shot_id, model, prompt_version, json, scale_in_per_px, scale_source, confidence)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id('asm'), session.id, shot.id, res.model, res.promptVersion, JSON.stringify({ ...res.json, scale }), scale.inPerPx, scale.source, scale.confidence]);
  const measured = sizing.measureOpenings(res.json.openings, scale.inPerPx);
  for (const o of measured) {
    o.id = id('op');
    await store.q(`INSERT INTO openings (id, assessment_id, kind, bbox, est_w_in, est_h_in, story, shape, has_existing_shutters, include, flag)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [o.id, assessment.id, o.kind, JSON.stringify(o.bbox), o.est_w_in, o.est_h_in, o.story, o.shape, o.existing_shutters, o.include, o.flag]);
  }
  await store.logEvent(session.id, 'assessed', { openings: measured.length, included: measured.filter((o) => o.include).length, scale });
  if (!(scale.inPerPx > 0)) return { ok: false, status: 'failed', reason: 'no_scale' };
  return { ok: true, assessment, openings: measured };
}

// ---- stage: render one style ----------------------------------------------------------------------
async function loadContext(sessionId) {
  const session = await store.one('SELECT * FROM sessions WHERE id = $1', [sessionId]);
  if (!session) throw new Error('session_not_found');
  const assessment = await store.one('SELECT * FROM assessments WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1', [sessionId]);
  const shot = assessment ? await store.one('SELECT * FROM streetview_shots WHERE id = $1', [assessment.shot_id]) : null;
  const openings = assessment ? (await store.many('SELECT * FROM openings WHERE assessment_id = $1 ORDER BY id', [assessment.id])).map((o, i) => {
    // Recover the idx/label ordering from the assessment JSON (the openings table has no idx column on purpose).
    const j = (assessment.json.openings || [])[i] || {};
    return { ...o, idx: i, label: j.label || null, bbox: o.bbox, est_w_in: Number(o.est_w_in), est_h_in: Number(o.est_h_in), existing_shutters: o.has_existing_shutters };
  }) : [];
  return { session, assessment, shot, openings };
}

async function renderStyle(sessionId, { styleSlug, materialSlug, colorSlug, force = false }) {
  const { session, assessment, shot, openings } = await loadContext(sessionId);
  if (!assessment) throw new Error('no_assessment');
  const style = await store.one('SELECT * FROM styles WHERE slug = $1', [styleSlug]);
  const material = await store.one('SELECT * FROM material_lines WHERE tenant_id = $1 AND slug = $2', [session.tenant_id, materialSlug]);
  const color = await store.one('SELECT * FROM colors WHERE tenant_id = $1 AND slug = $2', [session.tenant_id, colorSlug]);
  if (!style || !material || !color) throw new Error('unknown_style_material_or_color');
  if (!force) {
    const cached = await store.one(`SELECT r.* FROM renders r JOIN boms b ON b.id = r.bom_id WHERE r.session_id = $1 AND r.style_id = $2 AND r.color_id = $3
      AND b.material_line_id = $4 AND b.assessment_id = $5 AND r.status IN ('done','fixture') ORDER BY r.created_at DESC LIMIT 1`,
      [sessionId, style.id, color.id, material.id, assessment.id]);
    if (cached) return cached; // one paid render per (style, color, line) per assessment — never re-charge
  }
  const rule = await store.one(`SELECT * FROM sizing_rules WHERE tenant_id = $1 AND (style_id = $2 OR style_id IS NULL) ORDER BY (style_id = $2) DESC NULLS LAST LIMIT 1`, [session.tenant_id, style.id]);
  const bom = sizing.buildBom(openings, rule, style);
  const bomRow = await store.one(`INSERT INTO boms (id, assessment_id, style_id, material_line_id, color_id, lines, pair_count, single_count, sqft)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id('bom'), assessment.id, style.id, material.id, color.id, JSON.stringify(bom.lines), bom.pair_count, bom.single_count, bom.sqft]);
  const variant = await select.pickVariant({ styleSlug, materialSlug, sections: select.dominantSections(bom), tenantId: session.tenant_id });
  const refs = variant ? await select.referenceAssets(variant.id, color.id) : [];
  const prompt = assemble.buildPrompt({ template: style.assemble_template, styleName: style.name, colorName: color.name, colorHex: color.hex,
    materialName: material.name, bom, openings, imageWH: assessment.json.image_wh, existingShutters: openings.some((o) => o.existing_shutters) });
  const render = await store.one(`INSERT INTO renders (id, session_id, bom_id, variant_id, color_id, style_id, prompt_version, prompt, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'rendering') RETURNING *`, [id('rnd'), sessionId, bomRow.id, variant && variant.id, color.id, style.id, assemble.PROMPT_VERSION, prompt]);
  await store.logEvent(sessionId, 'render_started', { render: render.id, style: styleSlug, color: colorSlug, material: materialSlug, panels: bom.lines.length });
  if (devFixtures()) {
    return store.one(`UPDATE renders SET status = 'fixture', model = 'fixture', secure_url = $2 WHERE id = $1 RETURNING *`, [render.id, shot.secure_url]);
  }
  const out = await assemble.render({ prompt, baseImage: shot.secure_url, referenceImages: refs.map((a) => a.secure_url || cloudinary.url(a.cloudinary_public_id)) });
  if (!out.ok) {
    await store.logEvent(sessionId, 'render_failed', { render: render.id, reason: out.reason });
    return store.one(`UPDATE renders SET status = 'failed', error = $2 WHERE id = $1 RETURNING *`, [render.id, out.reason]);
  }
  const up = await cloudinary.uploadImage(out.dataUri, `shutter-vis/${session.tenant_id}/${sessionId}/renders`);
  let qa = null;
  try { qa = await verify.verifyRender({ renderImage: up.secure_url, bom, styleName: style.name, colorName: color.name }); } catch (e) { qa = { ok: false, reason: e.message }; }
  const done = await store.one(`UPDATE renders SET status = 'done', model = $2, cloudinary_public_id = $3, secure_url = $4, qa_score = $5, qa_json = $6 WHERE id = $1 RETURNING *`,
    [render.id, out.model, up.public_id, up.secure_url, qa && qa.ok ? qa.score : null, JSON.stringify(qa)]);
  await store.logEvent(sessionId, 'render_done', { render: render.id, qa: qa && qa.ok ? qa.score : null });
  return done;
}

// ---- the run --------------------------------------------------------------------------------------
async function runPipeline(sessionId, site, { fromAssess = false } = {}) {
  if (running.has(sessionId)) return;
  running.add(sessionId);
  try {
    const session = await store.one('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    let chosen, imageWH;
    if (fromAssess) {
      chosen = await store.one('SELECT * FROM streetview_shots WHERE session_id = $1 AND chosen ORDER BY created_at DESC LIMIT 1', [sessionId]);
      imageWH = String((site && site.streetview && site.streetview.size) || '640x640').split('x').map(Number);
      if (devFixtures()) imageWH = [640, 480];
    } else {
      const sv = await stageStreetView(session, site);
      if (!sv.ok) return setStatus(sessionId, sv.status, sv.reason);
      chosen = sv.chosen; imageWH = sv.imageWH;
    }
    const as = await stageAssess(session, chosen, imageWH);
    if (!as.ok) return setStatus(sessionId, as.status, as.reason);
    await setStatus(sessionId, 'rendering');
    const d = (site && site.defaults) || {};
    const gallery = [d.style || 'fixed-louver'].concat((d.galleryStyles || []).filter((s) => s !== (d.style || 'fixed-louver')));
    let first = true;
    for (const styleSlug of gallery) {
      try {
        const r = await renderStyle(sessionId, { styleSlug, materialSlug: d.materialLine || 'exterior-wood', colorSlug: d.color || 'black' });
        if (first && ['done', 'fixture'].includes(r.status)) { await setStatus(sessionId, 'ready'); first = false; }
      } catch (e) { await store.logEvent(sessionId, 'render_error', { style: styleSlug, error: e.message }); }
    }
    if (first) {
      const last = await store.one('SELECT error FROM renders WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1', [sessionId]);
      await setStatus(sessionId, /GEMINI_API_KEY/.test((last && last.error) || '') ? 'needs_config' : 'failed', (last && last.error) || 'no_render');
    }
  } catch (e) {
    console.error('[pipeline]', sessionId, e.stack || e.message);
    await setStatus(sessionId, 'failed', e.message).catch(() => {});
  } finally { running.delete(sessionId); }
}

function kick(sessionId, site, opts) { setImmediate(() => runPipeline(sessionId, site, opts)); }

// Options the gallery can offer: styles ∪ colors ∪ renderable material lines for this tenant.
async function options(tenantId) {
  const [styles, colors, materials] = await Promise.all([
    store.many('SELECT slug, name FROM styles ORDER BY sort'),
    store.many('SELECT slug, name, hex FROM colors WHERE tenant_id = $1 ORDER BY name', [tenantId]),
    store.many(`SELECT DISTINCT m.slug, m.name, m.sort FROM material_lines m JOIN variants v ON v.material_line_id = m.id WHERE m.tenant_id = $1 AND v.renderable ORDER BY m.sort`, [tenantId]),
  ]);
  return { styles, colors, materials };
}

module.exports = { createSession, runPipeline, kick, renderStyle, loadContext, options, setStatus, devFixtures };
