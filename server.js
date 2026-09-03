// server.js — Express bootstrap for the Southern Shutter visualizer.
// Express/EJS/Node 20 on Replit (Autoscale), Replit Postgres via pg. Host-header tenant resolution on every request.
require('./lib/env');
const path = require('path');
const express = require('express');
const store = require('./store-pg');
const tenant = require('./lib/tenant');
const { isProd } = require('./lib/util');

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // Replit's proxy terminates TLS; honor X-Forwarded-* so req.protocol/hostname are public.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Fail-closed secrets on a real deploy (same SEC-03 stance as AnotherStoryBLDR).
if (isProd() && !process.env.SESSION_SECRET) { console.error('[boot] SESSION_SECRET must be set in production.'); process.exit(1); }
if (!process.env.SESSION_SECRET) console.warn('[boot] SESSION_SECRET unset — using an insecure dev value.');

// Health first: no tenant lookup, so a deployment health check never depends on a hostname match.
app.get('/healthz', async (req, res) => {
  const out = { ok: true, service: 'shutter-vis', node: process.version, time: new Date().toISOString() };
  try {
    const t = await tenant.resolve(req.hostname);
    const { rows } = await store.q('SELECT count(*)::int AS n FROM tenants');
    out.db = 'ok'; out.tenants = rows[0].n; out.tenant = t ? t.slug : null;
  } catch (e) { out.ok = false; out.db = 'error'; out.error = e.message; }
  res.status(out.ok ? 200 : 503).json(out);
});

app.get('/favicon.ico', (req, res) => res.status(204).end());
// Static assets before the tenant resolver: css/js do not need a tenant.
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd() ? '1h' : 0 }));

// Embed bootstrap is tenant-scoped (allowed origins), so it mounts after the resolver.
app.use(tenant.middleware());
app.use((req, res, next) => {
  // Allow framing only from the tenant's embed origins (plus env fallback). Everything else denies.
  const origins = ((req.site.embed && req.site.embed.allowedOrigins) || [])
    .concat((process.env.EMBED_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean));
  res.locals.embedOrigins = [...new Set(origins)];
  res.set('Content-Security-Policy', `frame-ancestors 'self' ${res.locals.embedOrigins.join(' ')}`.trim());
  res.locals.embedMode = req.query.embed === '1' || req.path.startsWith('/embed');
  next();
});

app.use('/', require('./routes/public'));
app.use('/api', require('./routes/api'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).render('error', { code: 404, message: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.originalUrl, err.stack || err.message);
  if (req.path.startsWith('/api/')) return res.status(500).json({ ok: false, error: 'server_error' });
  res.status(500).render('error', { code: 500, message: 'Something went wrong' });
});

async function boot({ listen = true } = {}) {
  const n = await store.init();
  const t = await store.seedTenants(require('./config/tenants.seed.json'));
  await tenant.load();
  console.log(`[boot] schema ok (${n} statements), ${t} tenant(s) seeded`);
  for (const [k, label] of [['GOOGLE_MAPS_API_KEY', 'Street View / Places'], ['GEMINI_API_KEY', 'Gemini'], ['CLOUDINARY_URL', 'Cloudinary'], ['POSTMARK_SERVER_TOKEN', 'Postmark']])
    if (!process.env[k]) console.warn(`[boot] ${k} unset — ${label} disabled${process.env.DEV_FIXTURES && !isProd() ? ' (DEV_FIXTURES on)' : ''}`);
  if (listen) app.listen(PORT, () => console.log(`[boot] shutter-vis listening on :${PORT} (${process.env.NODE_ENV || 'development'})`));
}
if (require.main === module) boot().catch((e) => { console.error('[boot] failed:', e.stack || e.message); process.exit(1); });
module.exports = { app, boot };
