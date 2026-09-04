// routes/api.js — JSON endpoints used by the funnel pages and the embed client.
const express = require('express');
const store = require('../store-pg');
const funnel = require('./funnel');
const leads = require('../services/leads');
const postmark = require('../services/postmark');
const streetview = require('../services/streetview');
const wrap = require('../lib/async-handler');
const { rateLimit } = require('../lib/rate-limit');
const token = require('../lib/session-token');
const { isEmail, baseUrl } = require('../lib/util');
const r = express.Router();

// Strip control characters and bound length on every user string.
const CONTROL_CHARS = new RegExp('[\\x00-\\x1f\\x7f]', 'g');
const clean = (s, max) => String(s == null ? '' : s).replace(CONTROL_CHARS, '').trim().slice(0, max);
const requireOwner = (req, res, next) => (token.owns(req, req.params.id) ? next() : res.status(403).json({ ok: false, error: 'not_session_owner' }));

r.get('/places', rateLimit({ max: 120 }), wrap(async (req, res) => {
  const input = clean(req.query.input, 120);
  if (input.length < 4 || !streetview.configured()) return res.json({ ok: true, suggestions: [] });
  res.json({ ok: true, suggestions: await streetview.placeAutocomplete(input, clean(req.query.session, 64)) });
}));

// Create a session and start the pipeline. The homeowner is redirected to /r/:id which polls status.
r.post('/session', rateLimit({ max: 20 }), wrap(async (req, res) => {
  const address = clean(req.body.address, 200);
  if (address.length < 6) return res.status(400).json({ ok: false, error: 'address_required' });
  const s = await funnel.createSession({ tenant: req.tenant, address, placeId: clean(req.body.placeId, 200) || null, embedOrigin: clean(req.body.embedOrigin, 200) || null });
  token.setCookie(res, s.id);
  funnel.kick(s.id, req.site);
  res.json({ ok: true, id: s.id, url: `${baseUrl(req)}/r/${s.id}${res.locals.embedMode || req.body.embed ? '?embed=1' : ''}` });
}));

r.get('/session/:id/status', wrap(async (req, res) => {
  const s = await store.one('SELECT id, status, error, address, style_id, color_id, material_line_id, created_at FROM sessions WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id]);
  if (!s) return res.status(404).json({ ok: false, error: 'not_found' });
  const shots = await store.many('SELECT id, heading, secure_url AS url, chosen FROM streetview_shots WHERE session_id = $1 ORDER BY heading', [s.id]);
  const renders = await store.many(`SELECT r.id, r.status, r.secure_url AS url, r.qa_score, st.slug AS style, st.name AS style_name, c.slug AS color, c.name AS color_name,
      m.slug AS material, b.pair_count, b.single_count, b.sqft, b.lines
      FROM renders r JOIN styles st ON st.id = r.style_id JOIN colors c ON c.id = r.color_id JOIN boms b ON b.id = r.bom_id
      JOIN material_lines m ON m.id = b.material_line_id WHERE r.session_id = $1 ORDER BY r.created_at`, [s.id]);
  const a = await store.one('SELECT scale_in_per_px, scale_source, confidence, json FROM assessments WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1', [s.id]);
  res.json({ ok: true, session: s, shots, renders: renders.map((x) => ({ ...x, lines: undefined, panels: (x.lines || []).reduce((n, l) => n + l.qty, 0) })),
    assessment: a ? { scale_source: a.scale_source, confidence: Number(a.confidence), visibility: a.json.visibility, openings: (a.json.openings || []).length } : null,
    options: await funnel.options(req.tenant.id) });
}));

// "This isn't my house" — choose another Street View angle and re-run from the assessment.
r.post('/session/:id/shot', requireOwner, rateLimit({ max: 10 }), wrap(async (req, res) => {
  const shot = await store.one('SELECT * FROM streetview_shots WHERE id = $1 AND session_id = $2', [clean(req.body.shotId, 64), req.params.id]);
  if (!shot) return res.status(404).json({ ok: false, error: 'shot_not_found' });
  await store.q('UPDATE streetview_shots SET chosen = (id = $2) WHERE session_id = $1', [req.params.id, shot.id]);
  await store.logEvent(req.params.id, 'shot_changed', { shot: shot.id, heading: shot.heading });
  funnel.kick(req.params.id, req.site, { fromAssess: true });
  res.json({ ok: true });
}));

// Style / color / material change -> new render (cached when the same combination already rendered).
r.post('/session/:id/render', requireOwner, rateLimit({ max: 12 }), wrap(async (req, res) => {
  const s = await store.one('SELECT id, status FROM sessions WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id]);
  if (!s) return res.status(404).json({ ok: false, error: 'not_found' });
  if (!['ready', 'rendering'].includes(s.status)) return res.status(409).json({ ok: false, error: `session_${s.status}` });
  const d = req.site.defaults || {};
  const render = await funnel.renderStyle(s.id, { styleSlug: clean(req.body.style, 40) || d.style, materialSlug: clean(req.body.material, 40) || d.materialLine || 'exterior-wood', colorSlug: clean(req.body.color, 40) || d.color || 'black' });
  await store.logEvent(s.id, 'style_changed', { style: req.body.style, color: req.body.color, material: req.body.material, render: render.id });
  res.json({ ok: true, render: { id: render.id, status: render.status, url: render.secure_url, qa_score: render.qa_score, error: render.error } });
}));

// Lead gate -> quote email to the tenant's sales inbox + confirmation to the homeowner.
r.post('/session/:id/quote', requireOwner, rateLimit({ max: 5 }), wrap(async (req, res) => {
  const s = await store.one('SELECT * FROM sessions WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id]);
  if (!s) return res.status(404).json({ ok: false, error: 'not_found' });
  const name = clean(req.body.name, 120), email = clean(req.body.email, 200).toLowerCase(), phone = clean(req.body.phone, 40), notes = clean(req.body.notes, 1000);
  if (name.length < 2 || !isEmail(email)) return res.status(400).json({ ok: false, error: 'name_and_email_required' });
  const render = await store.one(`SELECT * FROM renders WHERE session_id = $1 AND ($2 = '' OR id = $2) AND status IN ('done','fixture') ORDER BY (id = $2) DESC, created_at DESC LIMIT 1`, [s.id, clean(req.body.renderId, 64)]);
  const bom = render ? await store.one(`SELECT b.*, st.name AS style_name, m.name AS material_line_name, c.name AS color_name FROM boms b
      JOIN styles st ON st.id = b.style_id JOIN material_lines m ON m.id = b.material_line_id JOIN colors c ON c.id = b.color_id WHERE b.id = $1`, [render.bom_id]) : null;
  const routedTo = req.tenant.quote_to_email || process.env.QUOTE_TO_EMAIL;
  const quote = await leads.upsertQuote({ sessionId: s.id, renderId: render && render.id, bomId: bom && bom.id, name, email, phone, notes, routedTo });
  await store.logEvent(s.id, 'quote_submitted', { quote: quote.id, render: render && render.id });
  const adminUrl = `${baseUrl(req)}/admin/sessions/${s.id}`;
  const sales = await postmark.send({ to: routedTo, replyTo: email, tag: 'quote-request', ...postmark.composeQuoteToSales({ tenant: req.tenant, quote, session: s, bom, render, adminUrl }) });
  if (sales.sent) await leads.markEmailed(quote.id, sales.messageId);
  else if (sales.reason === 'postmark_not_configured') { await leads.markUnsent(quote.id); console.warn('[quote] Postmark not configured — quote %s held as unsent (see /admin/leads)', quote.id); }
  else { await leads.markFailed(quote.id); console.error('[quote] sales email not sent:', sales.reason); }
  const conf = await postmark.send({ to: email, tag: 'quote-confirmation', ...postmark.composeQuoteConfirmation({ tenant: req.tenant, quote, session: s, render }) });
  await store.logEvent(s.id, 'quote_emails', { sales: sales.sent ? 'sent' : sales.reason, confirmation: conf.sent ? 'sent' : conf.reason });
  res.json({ ok: true, quoteId: quote.id, emailed: sales.sent, url: `${baseUrl(req)}/thanks/${s.id}${res.locals.embedMode ? '?embed=1' : ''}` });
}));

module.exports = r;
