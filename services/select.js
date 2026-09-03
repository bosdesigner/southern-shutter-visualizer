// services/select.js — BOM + style/material/color -> catalog variant (by grade + sections) + reference assets.
const store = require('../store-pg');

async function pickVariant({ styleSlug, materialSlug, gradeSlug = 'standard', sections = 1, tenantId }) {
  const rows = await store.many(
    `SELECT v.*, g.slug AS grade_slug, s.slug AS style_slug, s.name AS style_name, s.assemble_template,
            m.slug AS material_slug, m.name AS material_name
       FROM variants v JOIN grades g ON g.id = v.grade_id JOIN styles s ON s.id = g.style_id
       JOIN material_lines m ON m.id = v.material_line_id
      WHERE s.slug = $1 AND m.slug = $2 AND m.tenant_id = $3 AND v.renderable
      ORDER BY (g.slug = $4) DESC, abs(v.sections - $5), v.sections`,
    [styleSlug, materialSlug, tenantId, gradeSlug, sections]);
  return rows[0] || null;
}

async function referenceAssets(variantId, colorId) {
  return store.many(
    `SELECT * FROM assets WHERE variant_id = $1 AND is_reference AND (color_id = $2 OR color_id IS NULL)
      ORDER BY (color_id = $2) DESC, (kind = 'product_front') DESC LIMIT 3`, [variantId, colorId || null]);
}

// The dominant sections count in a BOM decides which product art to reference (most panels win).
function dominantSections(bom) {
  const tally = {};
  for (const l of bom.lines || []) tally[l.sections] = (tally[l.sections] || 0) + l.qty;
  return Number(Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || 1);
}

module.exports = { pickVariant, referenceAssets, dominantSections };
