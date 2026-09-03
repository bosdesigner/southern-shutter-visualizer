// scripts/scrape-ssc-assets.js — ONE-TIME, manifest-driven pull of product art from southernshutter.com
// into data/catalog/assets.json + local files, for seed-catalog.js to upload. Runs ONLY with SSC's written
// permission (they own the product and the art), which is asserted with --i-have-ssc-permission.
//
// Input: data/catalog/asset-sources.json — [{ "variant": "fixed-louver-standard-exterior-wood-2s",
//   "color": null, "kind": "product_front", "url": "https://www.southernshutter.com/datafiles/...png", "is_reference": true }]
// The script never crawls: every URL is listed by hand after reviewing the site, so nothing is pulled that
// SSC did not point us at.
require('../lib/env');
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'data', 'catalog');
const OUT = path.join(DIR, 'assets');

async function main() {
  if (!process.argv.includes('--i-have-ssc-permission')) {
    console.error('Refusing to run without --i-have-ssc-permission (SSC owns the product art; get written OK first).');
    process.exit(2);
  }
  const src = path.join(DIR, 'asset-sources.json');
  if (!fs.existsSync(src)) { console.error('data/catalog/asset-sources.json not found — list the URLs to pull first.'); process.exit(2); }
  const items = JSON.parse(fs.readFileSync(src, 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  for (const it of items) {
    const u = new URL(it.url);
    if (!/(^|\.)southernshutter\.com$/.test(u.hostname)) { console.warn('[skip] not an SSC host:', it.url); continue; }
    const r = await fetch(it.url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) { console.warn('[skip]', r.status, it.url); continue; }
    const ext = (r.headers.get('content-type') || '').includes('png') ? 'png' : 'jpg';
    const file = `assets/${it.variant}${it.color ? '-' + it.color : ''}-${it.kind}.${ext}`;
    fs.writeFileSync(path.join(DIR, file), Buffer.from(await r.arrayBuffer()));
    manifest.push({ variant: it.variant, color: it.color || null, kind: it.kind, file, is_reference: it.is_reference !== false, source: it.url });
    console.log('[ok]', file);
  }
  fs.writeFileSync(path.join(DIR, 'assets.json'), JSON.stringify(manifest, null, 2));
  console.log(`[scrape-ssc-assets] wrote ${manifest.length} entries to data/catalog/assets.json — run scripts/seed-catalog.js to upload.`);
}
main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
