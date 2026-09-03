// services/cloudinary.js — server-side signed uploads (pattern from AnotherStoryBLDR lib/cloudinary.js).
// Config is the canonical CLOUDINARY_URL=cloudinary://key:secret@cloud. Image bytes never persist on our disk.
// Unconfigured (local dev): uploadImage() returns the input reference unchanged with public_id null, so a
// data URI simply rides along in secure_url columns until Cloudinary exists. Never do that in production.
const crypto = require('crypto');

function cfg() {
  const m = String(process.env.CLOUDINARY_URL || '').match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/?]+)/);
  return m ? { apiKey: m[1], apiSecret: m[2], cloudName: m[3] } : null;
}
const configured = () => Boolean(cfg());

function sign(params, secret) {
  const toSign = Object.keys(params).filter((k) => params[k] != null && params[k] !== '').sort().map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(toSign + secret).digest('hex');
}

// file: data URI or https URL (Cloudinary fetches remote URLs itself). Returns { public_id, secure_url, width, height }.
async function uploadImage(file, folder, opts = {}) {
  const c = cfg();
  if (!c) {
    if (require('../lib/util').isProd()) throw new Error('cloudinary_not_configured');
    return { public_id: null, secure_url: file, width: opts.width || null, height: opts.height || null, local: true };
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { timestamp, folder, public_id: opts.publicId || undefined, overwrite: opts.publicId ? 'true' : undefined };
  const signature = sign(params, c.apiSecret);
  const fd = new FormData();
  fd.append('file', file);
  fd.append('api_key', c.apiKey);
  fd.append('timestamp', String(timestamp));
  fd.append('signature', signature);
  fd.append('folder', folder);
  if (params.public_id) { fd.append('public_id', params.public_id); fd.append('overwrite', 'true'); }
  const r = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/image/upload`, { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  if (!j.secure_url) throw new Error('cloudinary_upload_failed: ' + JSON.stringify(j.error || j));
  return { public_id: j.public_id, secure_url: j.secure_url, width: j.width, height: j.height };
}

// Delivery URL with a transformation (e.g. 'w_800,c_limit,f_auto,q_auto'). Falls back to the stored URL.
function url(publicId, secureUrl, transform) {
  const c = cfg();
  if (!c || !publicId) return secureUrl;
  return `https://res.cloudinary.com/${c.cloudName}/image/upload/${transform ? transform + '/' : ''}${publicId}`;
}

module.exports = { configured, uploadImage, url, cfg };
