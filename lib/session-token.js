// lib/session-token.js — proves a browser started a session before it may change or quote it. Cookie
// sv_<sessionId> = HMAC(SESSION_SECRET, sessionId). Session ids are UUIDs (unguessable) so GET is open; the
// cookie only gates the POSTs that spend money or send email.
const crypto = require('crypto');
const secret = () => process.env.SESSION_SECRET || 'dev-insecure-secret';
const sign = (sid) => crypto.createHmac('sha256', secret()).update(String(sid)).digest('hex').slice(0, 32);
// Production runs inside an iframe on southernshutter.com, so the cookie must be SameSite=None + Secure.
// Chromium DROPS a SameSite=None cookie that is not Secure, so plain-http dev uses Lax instead.
function setCookie(res, sid) {
  const prod = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';
  res.cookie(`sv_${sid}`, sign(sid), { httpOnly: true, sameSite: prod ? 'none' : 'lax', secure: prod, maxAge: 7 * 86400 * 1000, path: '/' });
}
function owns(req, sid) {
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)sv_${sid.replace(/-/g, '\\-')}=([a-f0-9]+)`));
  if (!m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(sign(sid));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { setCookie, owns, sign };
