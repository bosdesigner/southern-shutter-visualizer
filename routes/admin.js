// routes/admin.js — SSC staff surface (HTTP Basic, fail-closed). Leads, session review with the opening
// overlay + BOM + renders + QA, catalog listing, site_config editing, prompt-version stamp.
const express = require('express');
const store = require('../store-pg');
const funnel = require('./funnel');
const leads = require('../services/leads');
const postmark = require('../services/postmark');
const tenant = require('../lib/tenant');
const assessSvc = require('../services/assess');
const assemble = require('../services/assemble');
const verify = require('../services/verify');
const cloudinary = require('../services/cloudinary');
const gemini = require('../services/gemini');
const streetview = require('../services/streetview');
const wrap = require('../lib/async-handler');
const { requireAdmin } = require('../lib/admin-auth');
const r = express.Router();
r.use(requireAdmin);

r.get('/', (req, res) => res.redirect('/admin/leads'));

r.get('/leads', wrap(async (req, res) => {
  const quotes = await leads.list(req.tenant.id, 200);
  const sessions = await store.many(`SELECT s.id, s.address, s.status, s.error, s.created_at, (SELECT count(*)::int FROM renders x WHERE x.session_id = s.id AND x.status IN ('done','fixture')) AS renders
    FROM sessions s WHERE s.tenant_id = $1 ORDER BY s.created_at DESC LIMIT 100`, [req.tenant.id]);
  const funnelCounts = await store.many(`SELECT type, count(*)::int AS n FROM events e JOIN sessions s ON s.id = e.session_id WHERE s.tenant_id = $1
    AND type IN ('session_created','status:ready','status:needs_photo','status:failed','status:needs_config','quote_submitted','style_changed','shot_changed') GROUP BY type ORDER BY type`, [req.tenant.id]);
  res.render('admin/leads', { quotes, sessions, funnelCounts, postmarkConfigured: postmark.configured(), unsent: quotes.filter((q) => q.status === 'unsent' || q.status === 'email_failed').length });
}));

r.get('/sessions/:id', wrap(async (req, res) => {
  const ctx = await funnel.loadContext(req.params.id).catch(() => null);
  if (!ctx || ctx.session.tenant_id !== req.tenant.id) return res.status(404).render('error', { code: 404, message: 'Session not found' });
  const shots = await store.many('SELECT * FROM streetview_shots WHERE session_id = $1 ORDER BY heading', [ctx.session.id]);
  const renders = await store.many(`SELECT r.*, st.name AS style_name, c.name AS color_name, b.pair_count, b.single_count, b.sqft, b.lines, m.name AS material_name
    FROM renders r JOIN styles st ON st.id = r.style_id JOIN colors c ON c.id = r.color_id JOIN boms b ON b.id = r.bom_id JOIN material_lines m ON m.id = b.material_line_id
    WHERE r.session_id = $1 ORDER BY r.created_at DESC`, [ctx.session.id]);
  const events = await store.many('SELECT * FROM events WHERE session_id = $1 ORDER BY created_at', [ctx.session.id]);
  const quote = await store.one('SELECT * FROM quotes WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1', [ctx.session.id]);
  res.render('admin/session', { ...ctx, shots, renders, events, quote, options: await funnel.options(req.tenant.id) });
}));

r.post('/sessions/:id/reassess', wrap(async (req, res) => {
  await store.logEvent(req.params.id, 'admin_reassess', null);
  funnel.kick(req.params.id, req.site, { fromAssess: true });
  res.redirect(`/admin/sessions/${req.params.id}`);
}));
r.post('/sessions/:id/render', wrap(async (req, res) => {
  await funnel.renderStyle(req.params.id, { styleSlug: req.body.style, materialSlug: req.body.material, colorSlug: req.body.color, force: req.body.force === '1' });
  res.redirect(`/admin/sessions/${req.params.id}`);
}));

r.get('/catalog', wrap(async (req, res) => {
  const styles = await store.many('SELECT * FROM styles ORDER BY sort');
  const lines = await store.many('SELECT * FROM material_lines WHERE tenant_id = $1 ORDER BY sort', [req.tenant.id]);
  const variants = await store.many(`SELECT v.*, g.slug AS grade, g.style_id, (SELECT count(*)::int FROM assets a WHERE a.variant_id = v.id) AS assets,
    (SELECT count(*)::int FROM assets a WHERE a.variant_id = v.id AND a.is_reference) AS reference_assets FROM variants v JOIN grades g ON g.id = v.grade_id ORDER BY v.slug`);
  const colors = await store.many('SELECT * FROM colors WHERE tenant_id = $1 ORDER BY name', [req.tenant.id]);
  const rules = await store.many('SELECT r.*, s.slug AS style_slug FROM sizing_rules r LEFT JOIN styles s ON s.id = r.style_id WHERE r.tenant_id = $1 ORDER BY s.slug NULLS FIRST', [req.tenant.id]);
  res.render('admin/catalog', { styles, lines, variants, colors, rules });
}));

r.get('/config', wrap(async (req, res) => {
  const rows = await store.many('SELECT key, value, updated_at FROM site_config WHERE tenant_id = $1 ORDER BY key', [req.tenant.id]);
  res.render('admin/config', { rows, saved: req.query.saved, err: req.query.err });
}));
r.post('/config', wrap(async (req, res) => {
  const key = String(req.body.key || '').trim().slice(0, 60);
  let value;
  try { value = JSON.parse(req.body.value); } catch (e) { return res.redirect(`/admin/config?err=${encodeURIComponent('invalid JSON: ' + e.message)}`); }
  if (!/^[a-z][a-zA-Z0-9_]*$/.test(key)) return res.redirect('/admin/config?err=bad_key');
  await store.q(`INSERT INTO site_config (tenant_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [req.tenant.id, key, JSON.stringify(value)]);
  tenant.bust();
  res.redirect(`/admin/config?saved=${encodeURIComponent(key)}`);
}));

// "Is the fix live?" — answers without spending a render.
r.get('/version', (req, res) => res.json({ ok: true, prompts: { assess: assessSvc.PROMPT_VERSION, assemble: assemble.PROMPT_VERSION, verify: verify.PROMPT_VERSION },
  configured: { streetview: streetview.configured(), gemini: gemini.configured(), cloudinary: cloudinary.configured(), postmark: postmark.configured() },
  devFixtures: funnel.devFixtures(), node: process.version, commit: process.env.RENDER_GIT_COMMIT || null, replDeployment: process.env.REPLIT_DEPLOYMENT === '1' }));

module.exports = r;
