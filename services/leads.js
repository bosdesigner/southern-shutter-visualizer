// services/leads.js — quote persistence. One quote row per session (re-submits update, never duplicate);
// status: new -> emailed | email_failed. Dedupe key is the session, since a session is one address.
const store = require('../store-pg');
const { id } = require('../lib/util');

async function upsertQuote({ sessionId, renderId, bomId, name, email, phone, notes, routedTo }) {
  const existing = await store.one('SELECT * FROM quotes WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1', [sessionId]);
  if (existing) {
    return store.one(`UPDATE quotes SET render_id = COALESCE($2, render_id), bom_id = COALESCE($3, bom_id), name = $4, email = $5,
      phone = $6, notes = $7, routed_to = $8, status = 'new' WHERE id = $1 RETURNING *`, [existing.id, renderId, bomId, name, email, phone, notes, routedTo]);
  }
  return store.one(`INSERT INTO quotes (id, session_id, render_id, bom_id, name, email, phone, notes, routed_to)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [id('q'), sessionId, renderId, bomId, name, email, phone, notes, routedTo]);
}
async function markEmailed(quoteId, messageId) {
  return store.q(`UPDATE quotes SET status = 'emailed', postmark_message_id = $2 WHERE id = $1`, [quoteId, messageId || null]);
}
async function markFailed(quoteId) { return store.q(`UPDATE quotes SET status = 'email_failed' WHERE id = $1`, [quoteId]); }
async function list(tenantId, limit = 100) {
  return store.many(`SELECT q.*, s.address, s.status AS session_status FROM quotes q JOIN sessions s ON s.id = q.session_id
    WHERE s.tenant_id = $1 ORDER BY q.created_at DESC LIMIT $2`, [tenantId, limit]);
}
module.exports = { upsertQuote, markEmailed, markFailed, list };
