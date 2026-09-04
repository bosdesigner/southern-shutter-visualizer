// scripts/send-pending-quotes.js — deliver quote requests that were saved while Postmark was not configured
// (status 'unsent') or whose send failed ('email_failed'). Safe to re-run: only rows still pending are sent,
// and each is stamped 'emailed' with its Postmark message id on success.
//   POSTMARK_SERVER_TOKEN=... POSTMARK_FROM=... BASE_URL=https://visualize.southernshutter.com node scripts/send-pending-quotes.js [--dry-run]
require('../lib/env');
const store = require('../store-pg');
const leads = require('../services/leads');
const postmark = require('../services/postmark');
const tenantLib = require('../lib/tenant');
const dry = process.argv.includes('--dry-run');

(async () => {
  if (!postmark.configured() && !dry) { console.error('POSTMARK_SERVER_TOKEN / POSTMARK_FROM not set — nothing can be sent (use --dry-run to list).'); process.exit(2); }
  const base = process.env.BASE_URL || 'https://visualize.southernshutter.com';
  const { all } = await tenantLib.load();
  let sent = 0, failed = 0, listed = 0;
  for (const tenant of all) {
    for (const quote of await leads.pending(tenant.id)) {
      const session = await store.one('SELECT * FROM sessions WHERE id = $1', [quote.session_id]);
      const render = quote.render_id ? await store.one('SELECT * FROM renders WHERE id = $1', [quote.render_id]) : null;
      const bom = quote.bom_id ? await store.one(`SELECT b.*, st.name AS style_name, m.name AS material_line_name, c.name AS color_name FROM boms b
        JOIN styles st ON st.id = b.style_id JOIN material_lines m ON m.id = b.material_line_id JOIN colors c ON c.id = b.color_id WHERE b.id = $1`, [quote.bom_id]) : null;
      const to = quote.routed_to || tenant.quote_to_email || process.env.QUOTE_TO_EMAIL;
      listed++;
      console.log(`${dry ? '[dry] ' : ''}${quote.id} ${quote.created_at.toISOString().slice(0, 16)} ${quote.name} <${quote.email}> — ${session.address} -> ${to} (${quote.status})`);
      if (dry) continue;
      const r = await postmark.send({ to, replyTo: quote.email, tag: 'quote-request', ...postmark.composeQuoteToSales({ tenant, quote, session, bom, render, adminUrl: `${base}/admin/sessions/${session.id}` }) });
      if (r.sent) { await leads.markEmailed(quote.id, r.messageId); sent++; await store.logEvent(session.id, 'quote_emails', { sales: 'sent (backlog)', messageId: r.messageId }); }
      else { await leads.markFailed(quote.id); failed++; console.error('  failed:', r.reason); }
      const c = await postmark.send({ to: quote.email, tag: 'quote-confirmation', ...postmark.composeQuoteConfirmation({ tenant, quote, session, render }) });
      if (!c.sent) console.warn('  confirmation to homeowner not sent:', c.reason);
    }
  }
  console.log(dry ? `${listed} pending` : `${sent} sent, ${failed} failed`);
  await store.pool.end();
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
