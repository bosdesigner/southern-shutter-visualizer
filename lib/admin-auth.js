// lib/admin-auth.js — HTTP Basic gate for /admin. Fail-closed: both ADMIN_USER and ADMIN_PASS must be set or
// the surface answers 503, never open. Constant-time compare on both halves.
const crypto = require('crypto');
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function requireAdmin(req, res, next) {
  const user = process.env.ADMIN_USER, pass = process.env.ADMIN_PASS;
  if (!user || !pass) return res.status(503).type('text/plain').send('ADMIN_USER / ADMIN_PASS not set — admin is disabled.');
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString();
    const i = decoded.indexOf(':');
    if (i >= 0 && eq(decoded.slice(0, i), user) && eq(decoded.slice(i + 1), pass)) return next();
  }
  return res.set('WWW-Authenticate', 'Basic realm="Shutter Visualizer Admin"').status(401).type('text/plain').send('Authentication required.');
}
module.exports = { requireAdmin };
