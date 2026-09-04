// scripts/verify-bootstrap.js — TASK-000/001/005 verification against a real Postgres (DATABASE_URL).
// Boots the app on an ephemeral port with DEV_FIXTURES=1, then checks with real HTTP + SQL:
//   /healthz reports the tenant · catalog seeded (6 styles × 3 lines) · scale solver + BOM on the fixture ·
//   a fixture session runs to 'ready' with 4 gallery renders · admin fails closed · quote lands in quotes.
require('../lib/env');
process.env.DEV_FIXTURES = '1'; process.env.NODE_ENV = 'development';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'verify'; process.env.ADMIN_PASS = process.env.ADMIN_PASS || 'verify-pass';
const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const store = require('../store-pg');
const { app, boot } = require('../server');
const scale = require('../services/scale');
const sizing = require('../services/sizing');
const assessSvc = require('../services/assess');
const fs = require('fs');
const results = [];
const check = (name, fn) => Promise.resolve().then(fn).then(() => results.push(['PASS', name])).catch((e) => results.push(['FAIL', name + ' — ' + e.message]));

(async () => {
  execFileSync('node', [path.join(__dirname, 'seed-catalog.js')], { stdio: 'inherit' });
  await boot({ listen: false });
  const server = app.listen(0);
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  let cookie = '';
  const j = async (p, opts = {}) => { const r = await fetch(base + p, { ...opts, headers: { 'Content-Type': 'application/json', cookie, ...(opts.headers || {}) } }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, body: await r.json().catch(() => null) }; };

  await check('/healthz reports tenant slug', async () => { const r = await j('/healthz'); assert.equal(r.status, 200); assert.equal(r.body.tenant, 'southernshutter'); assert.equal(r.body.db, 'ok'); });
  await check('catalog: 6 styles × 3 lines, rules seeded', async () => {
    const s = await store.many('SELECT count(*)::int n FROM styles'); assert.equal(s[0].n, 6);
    const v = await store.one(`SELECT count(DISTINCT (g.style_id, v.material_line_id))::int n FROM variants v JOIN grades g ON g.id = v.grade_id`); assert.equal(v.n, 18);
    const r = await store.one('SELECT count(*)::int n FROM sizing_rules'); assert.equal(r.n, 3);
  });
  await check('scale solver: door 45px = 80in -> 1.778 in/px, agrees with window ref', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'assessment.sample.json'), 'utf8'));
    const a = assessSvc.normalize(raw, raw.image_wh); const sc = scale.solve(a);
    assert.equal(sc.source, 'front_door'); assert.ok(Math.abs(sc.inPerPx - 80 / 45) < 1e-9); assert.ok(sc.confidence > 0.9, 'confidence ' + sc.confidence); assert.ok(/agrees/.test(sc.note));
  });
  await check('sizing: 7 pairs (14 panels), door excluded, 36x60 -> 18x60 2-section, 48x48 -> 24x48 1-section', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'assessment.sample.json'), 'utf8'));
    const a = assessSvc.normalize(raw, raw.image_wh); const sc = scale.solve(a);
    const ops = sizing.measureOpenings(a.openings, sc.inPerPx);
    const rule = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'catalog', 'sizing_rules.json'))).rules[0];
    const bom = sizing.buildBom(ops, rule, { slug: 'fixed-louver' });
    assert.equal(bom.pair_count, 7); assert.equal(bom.single_count, 0); assert.equal(bom.lines.reduce((n, l) => n + l.qty, 0), 14);
    assert.deepEqual(bom.excluded, [{ opening_idx: 2, kind: 'door', flag: 'not_shuttered_kind' }]);
    const dh = bom.lines[0], sq = bom.lines.find((l) => l.opening_w === 48);
    assert.equal(dh.panel_w, 18); assert.equal(dh.panel_h, 60); assert.equal(dh.sections, 2);
    assert.equal(sq.panel_w, 24); assert.equal(sq.panel_h, 48); assert.equal(sq.sections, 1);
    const bahama = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'catalog', 'sizing_rules.json'))).rules.find((r) => r.style === 'bahama');
    const bb = sizing.buildBom(ops, bahama, { slug: 'bahama' }); assert.equal(bb.single_count, 7); assert.equal(bb.lines[0].panel_w, 36);
  });
  await check('scale fallback: no references -> default window, low confidence', async () => {
    const sc = scale.solve({ reference_objects: [], openings: [{ kind: 'window', bbox: { x: 0, y: 0, w: 20, h: 30 } }] });
    assert.equal(sc.source, 'default_window_36x60'); assert.equal(sc.inPerPx, 2); assert.equal(sc.confidence, 0.2);
  });
  let sid;
  await check('POST /api/session creates a session and sets the owner cookie', async () => {
    const r = await j('/api/session', { method: 'POST', body: JSON.stringify({ address: '123 Fixture Lane, Birmingham, AL 35223' }) });
    assert.equal(r.status, 200); assert.ok(r.body.id); sid = r.body.id; assert.ok(cookie.startsWith('sv_'));
  });
  await check('fixture pipeline reaches ready with 4 gallery renders', async () => {
    let st;
    for (let i = 0; i < 40; i++) { st = (await j(`/api/session/${sid}/status`)).body; if (st.session.status === 'ready' && st.renders.length >= 4) break; await new Promise((r) => setTimeout(r, 250)); }
    assert.equal(st.session.status, 'ready', 'status ' + st.session.status + ' ' + st.session.error);
    assert.equal(st.renders.length, 4); assert.ok(st.renders.every((r) => r.status === 'fixture' && r.panels === (r.style === 'bahama' ? 7 : 14)), JSON.stringify(st.renders.map((r) => [r.style, r.status, r.panels])));
    assert.equal(st.assessment.scale_source, 'front_door'); assert.equal(st.options.styles.length, 6); assert.equal(st.options.materials.length, 2);
  });
  await check('style change renders (bahama -> 7 singles) and is cached on repeat', async () => {
    const a = await j(`/api/session/${sid}/render`, { method: 'POST', body: JSON.stringify({ style: 'bahama', color: 'white', material: 'exterior-composite' }) });
    assert.equal(a.status, 200, JSON.stringify(a.body)); const b = await j(`/api/session/${sid}/render`, { method: 'POST', body: JSON.stringify({ style: 'bahama', color: 'white', material: 'exterior-composite' }) });
    assert.equal(a.body.render.id, b.body.render.id);
    const bom = await store.one('SELECT b.* FROM boms b JOIN renders r ON r.bom_id = b.id WHERE r.id = $1', [a.body.render.id]); assert.equal(bom.single_count, 7);
  });
  await check('render POST without the owner cookie is refused', async () => { const saved = cookie; cookie = ''; const r = await j(`/api/session/${sid}/render`, { method: 'POST', body: '{}' }); cookie = saved; assert.equal(r.status, 403); });
  await check('quote is stored as unsent, routed to sales@, when Postmark is unconfigured', async () => {
    const r = await j(`/api/session/${sid}/quote`, { method: 'POST', body: JSON.stringify({ name: 'Verify Bot', email: 'verify@example.com', phone: '205-555-0100', notes: 'test' }) });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.emailed, false);
    const q = await store.one('SELECT * FROM quotes WHERE session_id = $1', [sid]); assert.equal(q.routed_to, 'sales@southernshutter.com'); assert.equal(q.status, 'unsent');
  });
  await check('admin: 401 without creds, 200 with, session page renders overlay', async () => {
    assert.equal((await fetch(`${base}/admin/leads`)).status, 401);
    const auth = 'Basic ' + Buffer.from(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASS}`).toString('base64');
    const r = await fetch(`${base}/admin/sessions/${sid}`, { headers: { Authorization: auth } }); assert.equal(r.status, 200);
    const html = await r.text(); assert.ok(html.includes('SV_OVERLAY') && html.includes('front_door'));
    assert.equal((await fetch(`${base}/admin/catalog`, { headers: { Authorization: auth } })).status, 200);
  });
  await check('homeowner + admin pages render (EJS compiles)', async () => {
    const auth = 'Basic ' + Buffer.from(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASS}`).toString('base64');
    for (const [p, h] of [['/', null], ['/embed', null], [`/r/${sid}`, null], [`/thanks/${sid}`, null], ['/admin/leads', auth], ['/admin/config', auth], ['/admin/version', auth], ['/nope', null]]) {
      const r = await fetch(base + p, { headers: h ? { Authorization: h } : {} });
      assert.equal(r.status, p === '/nope' ? 404 : 200, `${p} -> ${r.status}`);
      const t = await r.text(); assert.ok(!/<%/.test(t), `${p} has unrendered EJS`);
    }
  });
  await check('embed.js serves and frame-ancestors carries the SSC origin', async () => {
    const r = await fetch(`${base}/embed.js`); assert.equal(r.status, 200); assert.ok(/iframe/.test(await r.text()));
    const p = await fetch(`${base}/`); assert.ok(p.headers.get('content-security-policy').includes('https://www.southernshutter.com'));
  });
  // cleanup the verification session
  await store.q('DELETE FROM events WHERE session_id = $1', [sid]); await store.q('DELETE FROM quotes WHERE session_id = $1', [sid]);
  await store.q('DELETE FROM renders WHERE session_id = $1', [sid]);
  await store.q('DELETE FROM boms WHERE assessment_id IN (SELECT id FROM assessments WHERE session_id = $1)', [sid]);
  await store.q('DELETE FROM openings WHERE assessment_id IN (SELECT id FROM assessments WHERE session_id = $1)', [sid]);
  await store.q('DELETE FROM assessments WHERE session_id = $1', [sid]); await store.q('DELETE FROM streetview_shots WHERE session_id = $1', [sid]); await store.q('DELETE FROM sessions WHERE id = $1', [sid]);
  server.close(); await store.pool.end();
  for (const [s, n] of results) console.log(s, n);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
