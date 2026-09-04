// scripts/smoke-funnel.js — end-to-end funnel test against a RUNNING deployment, no browser needed.
//   node scripts/smoke-funnel.js https://southern-shutter-visualizer.replit.app "712 Saulter Rd, Homewood, AL 35209"
//   env: ADMIN_USER/ADMIN_PASS (optional — adds the admin checks), SMOKE_EMAIL (default smoke@example.com)
// Prints one PASS/FAIL line per step with timings and, on a pipeline failure, the session's error so the cause
// is visible without opening admin. Exit code 1 on any failure. Costs one real session (Street View + Gemini).
const base = (process.argv[2] || process.env.BASE_URL || '').replace(/\/$/, '');
const address = process.argv[3] || '712 Saulter Rd, Homewood, AL 35209';
if (!base) { console.error('usage: node scripts/smoke-funnel.js <base-url> ["address"]'); process.exit(2); }
const jar = new Map(); // cookie jar: Replit's edge sets its own cookies, so never overwrite ours with the last Set-Cookie
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const results = [];
const step = async (name, fn) => {
  try { const note = await fn(); results.push(['PASS', name, note || '']); console.log(`PASS ${since().padStart(7)}  ${name}${note ? ' — ' + note : ''}`); }
  catch (e) { results.push(['FAIL', name, e.message]); console.log(`FAIL ${since().padStart(7)}  ${name} — ${e.message}`); return false; }
  return true;
};
async function j(path, body, headers = {}) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', cookie: cookieHeader(), ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  for (const sc of (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean))) { const [kv] = sc.split(';'); const i = kv.indexOf('='); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
  const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch (_) {}
  return { status: r.status, data, text };
}
const ok = (c, m) => { if (!c) throw new Error(m); };

(async () => {
  let sid, status, readyRenders = [];
  await step('GET /api/health reports the tenant', async () => { const r = await j('/api/health'); ok(r.status === 200 && r.data && r.data.tenant === 'southernshutter', `status ${r.status}: ${r.text.slice(0, 120)}`); return `db ${r.data.db}`; });
  await step('GET / renders the start page', async () => { const r = await j('/'); ok(r.status === 200 && /id="address"/.test(r.text), `status ${r.status}`); });
  await step('GET /embed.js serves the loader', async () => { const r = await j('/embed.js'); ok(r.status === 200 && /iframe/.test(r.text), `status ${r.status}`); });
  if (!await step('POST /api/session creates a session', async () => { const r = await j('/api/session', { address }); ok(r.status === 200 && r.data && r.data.id, `status ${r.status}: ${r.text.slice(0, 160)}`); sid = r.data.id; ok([...jar.keys()].some((k) => k.startsWith('sv_')), 'owner cookie not set'); return sid; })) return finish();
  const ready = await step('pipeline reaches ready (up to 4 min)', async () => {
    const seen = new Set();
    for (let i = 0; i < 160; i++) {
      const r = await j(`/api/session/${sid}/status`); ok(r.status === 200, `status ${r.status}`);
      status = r.data; const st = status.session.status;
      if (!seen.has(st)) { seen.add(st); console.log(`       ${since().padStart(7)}  … ${st}${status.assessment ? ` (openings ${status.assessment.openings}, scale ${status.assessment.scale_source} @${status.assessment.confidence})` : ''}`); }
      readyRenders = status.renders.filter((x) => x.url && (x.status === 'done' || x.status === 'fixture'));
      if (st === 'ready' && readyRenders.length && !status.renders.some((x) => x.status === 'rendering')) break;
      if (['needs_photo', 'needs_config', 'failed'].includes(st)) throw new Error(`session ${st}: ${status.session.error || '(no error text)'}`);
      await new Promise((res) => setTimeout(res, 1500));
    }
    ok(status.session.status === 'ready', `timed out in status ${status.session.status}`);
    const failed = status.renders.filter((x) => x.status === 'failed');
    return `${readyRenders.length} render(s): ${readyRenders.map((x) => `${x.style}${x.qa_score != null ? ' qa ' + Number(x.qa_score).toFixed(2) : ''} ${x.panels}p`).join(', ')}${failed.length ? `; FAILED: ${failed.map((x) => x.style).join(', ')}` : ''}`;
  });
  if (!ready) { console.log('       (pipeline did not reach ready — skipping render, quote and admin steps; fix the cause above and re-run)'); return finish(); }
  await step('a render image URL is fetchable', async () => { ok(readyRenders.length, 'no renders'); const u = readyRenders[0].url; if (/^data:/.test(u)) return 'inline data URI (Cloudinary not configured)'; const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); ok(r.ok, `render fetch ${r.status}`); return u.split('/').slice(2, 3)[0]; });
  await step('style change renders (bahama · white) and repeats from cache', async () => {
    const a = await j(`/api/session/${sid}/render`, { style: 'bahama', color: 'white', material: 'exterior-wood' }); ok(a.status === 200 && a.data.ok, `status ${a.status}: ${a.text.slice(0, 160)}`);
    ok(a.data.render.status !== 'failed', `render failed: ${a.data.render.error}`);
    const b = await j(`/api/session/${sid}/render`, { style: 'bahama', color: 'white', material: 'exterior-wood' }); ok(b.data && b.data.render.id === a.data.render.id, 'second call was not served from cache');
    return `${a.data.render.status}${a.data.render.qa_score != null ? ', qa ' + Number(a.data.render.qa_score).toFixed(2) : ''}`;
  });
  await step('render without the owner cookie is refused', async () => { const saved = new Map(jar); jar.clear(); const r = await j(`/api/session/${sid}/render`, {}); for (const [k, v] of saved) jar.set(k, v); ok(r.status === 403, `status ${r.status}`); });
  await step('quote submits and is routed', async () => {
    const r = await j(`/api/session/${sid}/quote`, { name: 'Smoke Test', email: process.env.SMOKE_EMAIL || 'smoke@example.com', phone: '205-555-0100', notes: 'smoke-funnel.js — safe to ignore' });
    ok(r.status === 200 && r.data.ok, `status ${r.status}: ${r.text.slice(0, 160)}`);
    return r.data.emailed ? 'emailed via Postmark' : 'held as unsent (Postmark not configured) — see /admin/leads';
  });
  await step('thanks page renders', async () => { const r = await j(`/thanks/${sid}`); ok(r.status === 200, `status ${r.status}`); });
  if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
    const auth = { Authorization: 'Basic ' + Buffer.from(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASS}`).toString('base64') };
    await step('admin session page shows the overlay + BOM', async () => { const r = await j(`/admin/sessions/${sid}`, null, auth); ok(r.status === 200, `status ${r.status}`); ok(/SV_OVERLAY/.test(r.text) && /Renders/.test(r.text), 'overlay or renders missing'); });
    await step('admin leads lists the smoke quote', async () => { const r = await j('/admin/leads', null, auth); ok(r.status === 200 && /Smoke Test/.test(r.text), `status ${r.status}`); });
  } else console.log('       (set ADMIN_USER/ADMIN_PASS to include the admin checks)');
  return finish();
  function finish() {
    const failed = results.filter((r) => r[0] === 'FAIL').length;
    console.log(`\n${results.length - failed}/${results.length} passed in ${since()}${sid ? `\nsession: ${base}/r/${sid}\nadmin:   ${base}/admin/sessions/${sid}` : ''}`);
    process.exit(failed ? 1 : 0);
  }
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
