// lib/rate-limit.js — fixed-window per-IP limiter for the paid entry points (session create, render, quote).
// In-process (Render single instance for v1). Denial-of-wallet is the threat: Street View + two Gemini calls
// per session cost real money and there is no login in front of them.
const buckets = new Map();
function rateLimit({ windowMs = 15 * 60 * 1000, max = 20, key = (req) => req.ip } = {}) {
  return (req, res, next) => {
    const k = key(req), now = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(k, b); }
    if (++b.n > max) return res.status(429).json({ ok: false, error: 'rate_limited', retryAfterMs: b.reset - now });
    if (buckets.size > 10000) for (const [kk, bb] of buckets) if (bb.reset < now) buckets.delete(kk);
    next();
  };
}
module.exports = { rateLimit };
