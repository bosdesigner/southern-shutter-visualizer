// scripts/seed-catalog.js — load data/catalog/*.json into Postgres (idempotent upserts) and, when
// data/catalog/assets.json exists, upload each listed product image to Cloudinary and register it.
//   DATABASE_URL=... node scripts/seed-catalog.js [--tenant ssc]
require('../lib/env');
const fs = require('fs');
const path = require('path');
const store = require('../store-pg');
const cloudinary = require('../services/cloudinary');
const DIR = path.join(__dirname, '..', 'data', 'catalog');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const tenantId = (process.argv.indexOf('--tenant') > -1 ? process.argv[process.argv.indexOf('--tenant') + 1] : 'ssc');

async function main() {
  await store.init();
  await store.seedTenants(require('../config/tenants.seed.json'));
  const counts = { material_lines: 0, styles: 0, grades: 0, variants: 0, colors: 0, sizing_rules: 0, assets: 0 };

  for (const m of read('material_lines.json')) {
    await store.q(`INSERT INTO material_lines (id, tenant_id, slug, name, sort) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name, sort = EXCLUDED.sort`, [`ml_${tenantId}_${m.slug}`, tenantId, m.slug, m.name, m.sort]);
    counts.material_lines++;
  }
  for (const s of read('styles.json')) {
    await store.q(`INSERT INTO styles (id, slug, name, assemble_template, sort) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, assemble_template = EXCLUDED.assemble_template, sort = EXCLUDED.sort`, [`st_${s.slug}`, s.slug, s.name, s.assemble_template, s.sort]);
    counts.styles++;
  }
  const gradesCfg = read('grades.json'), vCfg = read('variants.json');
  const styles = await store.many('SELECT * FROM styles');
  const lines = await store.many('SELECT * FROM material_lines WHERE tenant_id = $1', [tenantId]);
  for (const s of styles) {
    for (const g of gradesCfg.byStyle[s.slug] || gradesCfg.default) {
      const gid = `gr_${s.slug}_${g}`;
      await store.q(`INSERT INTO grades (id, style_id, slug, name) VALUES ($1,$2,$3,$4) ON CONFLICT (style_id, slug) DO UPDATE SET name = EXCLUDED.name`, [gid, s.id, g, gradesCfg.names[g] || g]);
      counts.grades++;
      for (const m of lines) {
        const sections = vCfg.singleSectionOnly.includes(s.slug) ? [1] : vCfg.sections;
        for (const n of sections) {
          const slug = `${s.slug}-${g}-${m.slug}-${n}s`;
          await store.q(`INSERT INTO variants (id, grade_id, material_line_id, slug, name, sections, center_rail, control_rods, louver_size, renderable, attrs)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (grade_id, material_line_id, slug) DO UPDATE SET name = EXCLUDED.name, sections = EXCLUDED.sections, center_rail = EXCLUDED.center_rail,
              control_rods = EXCLUDED.control_rods, louver_size = EXCLUDED.louver_size, renderable = EXCLUDED.renderable, attrs = EXCLUDED.attrs`,
            [`v_${tenantId}_${slug}`, gid, m.id, slug, `${s.name} · ${gradesCfg.names[g] || g} · ${m.name} · ${n} section${n > 1 ? 's' : ''}`, n,
              n > 1 ? (vCfg.center_rail[s.slug] || null) : null, vCfg.control_rods.includes(s.slug), vCfg.louver_size[s.slug] || null,
              !vCfg.nonRenderableMaterials.includes(m.slug), JSON.stringify({ style: s.slug, grade: g, material: m.slug })]);
          counts.variants++;
        }
      }
    }
  }
  for (const c of read('colors.json')) {
    await store.q(`INSERT INTO colors (id, tenant_id, slug, name, hex, finish) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name, hex = EXCLUDED.hex, finish = EXCLUDED.finish`, [`c_${tenantId}_${c.slug}`, tenantId, c.slug, c.name, c.hex, c.finish]);
    counts.colors++;
  }
  for (const r of read('sizing_rules.json').rules) {
    const st = r.style ? styles.find((s) => s.slug === r.style) : null;
    if (r.style && !st) throw new Error(`sizing rule for unknown style ${r.style}`);
    const id = `sr_${tenantId}_${r.style || 'default'}`;
    await store.q(`INSERT INTO sizing_rules (id, tenant_id, style_id, min_w, max_w, min_h, max_h, w_increment, h_increment, width_rule, confirmed_by_ssc)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO UPDATE SET min_w = EXCLUDED.min_w, max_w = EXCLUDED.max_w, min_h = EXCLUDED.min_h,
      max_h = EXCLUDED.max_h, w_increment = EXCLUDED.w_increment, h_increment = EXCLUDED.h_increment, width_rule = EXCLUDED.width_rule, confirmed_by_ssc = EXCLUDED.confirmed_by_ssc`,
      [id, tenantId, st && st.id, r.min_w, r.max_w, r.min_h, r.max_h, r.w_increment, r.h_increment, JSON.stringify(r.width_rule), Boolean(r.confirmed_by_ssc)]);
    counts.sizing_rules++;
  }
  // Optional assets manifest (TASK-002): [{ variant: slug, color: slug|null, kind, file|url, is_reference }]
  const manifest = path.join(DIR, 'assets.json');
  if (fs.existsSync(manifest)) {
    const items = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    for (const a of items) {
      const v = await store.one('SELECT id FROM variants WHERE slug = $1', [a.variant]);
      if (!v) { console.warn('[seed] asset for unknown variant', a.variant); continue; }
      const c = a.color ? await store.one('SELECT id FROM colors WHERE tenant_id = $1 AND slug = $2', [tenantId, a.color]) : null;
      const src = a.url || `data:image/${path.extname(a.file).slice(1) || 'png'};base64,${fs.readFileSync(path.join(DIR, a.file)).toString('base64')}`;
      const up = await cloudinary.uploadImage(src, `shutter-vis/${tenantId}/catalog`, { publicId: `${a.variant}${a.color ? '-' + a.color : ''}-${a.kind}` });
      await store.q(`INSERT INTO assets (id, variant_id, color_id, kind, cloudinary_public_id, secure_url, width, height, is_reference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO UPDATE SET cloudinary_public_id = EXCLUDED.cloudinary_public_id, secure_url = EXCLUDED.secure_url, is_reference = EXCLUDED.is_reference`,
        [`as_${a.variant}_${a.color || 'any'}_${a.kind}`, v.id, c && c.id, a.kind, up.public_id || `local:${a.variant}`, up.secure_url, up.width, up.height, a.is_reference !== false]);
      counts.assets++;
    }
  }
  console.log('[seed-catalog]', JSON.stringify(counts));
  const report = await store.many(`SELECT s.name AS style, count(DISTINCT v.material_line_id)::int AS lines, count(v.id)::int AS variants,
    (SELECT count(*)::int FROM assets a JOIN variants vv ON vv.id = a.variant_id JOIN grades gg ON gg.id = vv.grade_id WHERE gg.style_id = s.id AND a.is_reference) AS reference_assets
    FROM styles s JOIN grades g ON g.style_id = s.id JOIN variants v ON v.grade_id = g.id GROUP BY s.id, s.name, s.sort ORDER BY s.sort`);
  console.table(report);
  await store.pool.end();
}
main().catch((e) => { console.error('[seed-catalog] failed:', e.stack || e.message); process.exit(1); });
