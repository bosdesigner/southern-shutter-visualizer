// lib/util.js — small shared helpers.
const crypto = require('crypto');
const id = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const uuid = () => crypto.randomUUID();
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label || 'op'}_timeout_${ms}ms`)), ms))]);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const isProd = () => process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';
const baseUrl = (req) => process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
// Models sometimes wrap JSON in a fence despite instructions; recover rather than fail a paid call.
function parseJson(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(text); } catch (_) {}
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (_) {} }
  return null;
}
module.exports = { id, uuid, esc, withTimeout, clamp, round, isProd, baseUrl, isEmail, parseJson };
