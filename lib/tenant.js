// lib/tenant.js — host-header tenant resolver + site_config loader (pattern carried from AnotherStoryBLDR's
// getSiteConfig). Attaches req.tenant (tenants row) and req.site (site_config keys folded into one object).
//
// Resolution order: exact hostname match in tenants.hostnames -> if exactly ONE tenant exists, use it
// (so localhost / a Render *.onrender.com preview works with no config) -> 404 "unknown host".
// Cached in-process with a TTL; a config edit in admin busts the cache on this instance and the TTL heals
// any sibling instance. Do not add Redis for this.
const store = require('../store-pg');
const TTL_MS = parseInt(process.env.TENANT_CACHE_TTL_MS || '60000', 10);
let cache = { exp: 0, byHost: new Map(), all: [] };

async function load() {
  const tenants = await store.many('SELECT * FROM tenants ORDER BY created_at');
  const cfg = await store.many('SELECT tenant_id, key, value FROM site_config');
  const byHost = new Map();
  for (const t of tenants) {
    t.site = {};
    for (const c of cfg) if (c.tenant_id === t.id) t.site[c.key] = c.value;
    for (const h of t.hostnames || []) byHost.set(String(h).toLowerCase(), t);
  }
  cache = { exp: Date.now() + TTL_MS, byHost, all: tenants };
  return cache;
}
async function tenants() { if (cache.exp < Date.now()) await load(); return cache; }
function bust() { cache.exp = 0; }

async function resolve(hostname) {
  const c = await tenants();
  const h = String(hostname || '').toLowerCase().replace(/:\d+$/, '');
  return c.byHost.get(h) || (c.all.length === 1 ? c.all[0] : null);
}
async function byId(id) { const c = await tenants(); return c.all.find((t) => t.id === id) || null; }

function middleware() {
  return async (req, res, next) => {
    try {
      const t = await resolve(req.hostname);
      if (!t) return res.status(404).type('text/plain').send(`No tenant configured for host ${req.hostname}`);
      req.tenant = t; req.site = t.site; res.locals.tenant = t; res.locals.site = t.site;
      next();
    } catch (e) { next(e); }
  };
}
module.exports = { middleware, resolve, byId, bust, load };
