// migrate.js — apply the boot-time schema from the shell (dev, or the Replit Shell against prod), then seed tenants.
// Same statements store-pg.js init() runs, so the two can never disagree. Additive only.
//   DATABASE_URL=... node migrate.js
require('./lib/env');
const store = require('./store-pg');
(async () => {
  const n = await store.init();
  const t = await store.seedTenants(require('./config/tenants.seed.json'));
  console.log(`[migrate] ${n} statements applied, ${t} tenant(s) seeded`);
  await store.pool.end();
})().catch((e) => { console.error('[migrate] failed:', e.message); process.exit(1); });
