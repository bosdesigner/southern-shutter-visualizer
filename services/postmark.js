// services/postmark.js — transactional email via Postmark's REST API. Best-effort contract: never throws;
// returns { sent, messageId?, reason? } and the caller decides what to record. No token -> skipped loudly.
const { esc } = require('../lib/util');
const configured = () => Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.POSTMARK_FROM);

async function send({ to, subject, html, text, replyTo, tag, stream }) {
  if (!configured()) return { sent: false, reason: 'postmark_not_configured' };
  try {
    const r = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN },
      body: JSON.stringify({ From: process.env.POSTMARK_FROM, To: to, Subject: subject, HtmlBody: html, TextBody: text, ReplyTo: replyTo, Tag: tag, MessageStream: stream || 'outbound' }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ErrorCode) return { sent: false, reason: `postmark ${r.status} ${j.Message || ''}`.trim() };
    return { sent: true, messageId: j.MessageID };
  } catch (e) { return { sent: false, reason: e.message }; }
}

// Quote request -> SSC sales inbox. BOM + render + assessment link, reply-to the homeowner.
function composeQuoteToSales({ tenant, quote, session, bom, render, adminUrl }) {
  const lines = (bom && bom.lines) || [];
  const rows = lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${l.kind}</td><td>${l.qty}</td><td>${l.panel_w}" × ${l.panel_h}"</td><td>${l.sections}</td></tr>`).join('');
  return {
    subject: `Visualizer quote request — ${session.address}`,
    html: `<p>A homeowner asked for a quote from the ${esc(tenant.name)} visualizer.</p>
<ul><li><strong>Name:</strong> ${esc(quote.name)}</li><li><strong>Email:</strong> ${esc(quote.email)}</li>
<li><strong>Phone:</strong> ${esc(quote.phone || '—')}</li><li><strong>Address:</strong> ${esc(session.address)}</li>
<li><strong>Style / line / color:</strong> ${esc(bom ? `${bom.style_name} / ${bom.material_line_name} / ${bom.color_name}` : '—')}</li>
<li><strong>Pairs / singles:</strong> ${bom ? `${bom.pair_count} / ${bom.single_count}` : '—'} · ${bom && bom.sqft ? bom.sqft + ' sq ft' : ''}</li></ul>
${quote.notes ? `<p><strong>Notes:</strong> ${esc(quote.notes)}</p>` : ''}
${rows ? `<table border="1" cellpadding="4" cellspacing="0"><tr><th>Opening</th><th>Type</th><th>Panels</th><th>Panel size</th><th>Sections</th></tr>${rows}</table>` : '<p>No bill of materials was produced for this session.</p>'}
${render && render.secure_url && !/^data:/.test(render.secure_url) ? `<p><a href="${esc(render.secure_url)}">Render</a></p><p><img src="${esc(render.secure_url)}" width="600" alt="render"></p>` : ''}
<p><a href="${esc(adminUrl)}">Open the session in admin</a> (assessment, overlay, BOM, all renders).</p>
<p><em>Estimated sizes come from a Street View photo and standard construction dimensions. Field-measure before manufacturing.</em></p>`,
  };
}

// Confirmation -> homeowner.
function composeQuoteConfirmation({ tenant, quote, session, render }) {
  return {
    subject: `Your ${tenant.name} shutter quote request`,
    html: `<p>Hi ${esc(quote.name.split(' ')[0])},</p>
<p>Thanks for trying the ${esc(tenant.name)} visualizer for <strong>${esc(session.address)}</strong>. Our team has your render and window count and will follow up within one business day.</p>
${render && render.secure_url && !/^data:/.test(render.secure_url) ? `<p><img src="${esc(render.secure_url)}" width="600" alt="Your home with shutters"></p>` : ''}
<p>— ${esc(tenant.name)}</p>`,
  };
}

module.exports = { configured, send, composeQuoteToSales, composeQuoteConfirmation };
