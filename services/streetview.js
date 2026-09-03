// services/streetview.js — Google Maps Geocoding + Street View metadata + Street View Static.
//
// Shot selection (v1): the pano nearest the address is found via the FREE metadata endpoint, the bearing
// from that pano to the house is computed, and 3–5 headings around that bearing are pulled. Offset 0 is
// chosen by default; the homeowner can pick another on the confirm step ("this isn't my house"). A
// vision-scored pick can replace the default later without changing the stored shape.
//
// Flag F4 from the build map: windows are small targets, so expect more "no usable view" outcomes than a
// second-story product sees. metadata status != OK -> { ok:false, reason:'no_coverage' } and the session
// is parked in needs_photo for the Phase 2 upload path.
const key = () => process.env.GOOGLE_MAPS_API_KEY;
const configured = () => Boolean(key());

async function geocode({ address, placeId }) {
  const p = new URLSearchParams({ key: key() });
  if (placeId) p.set('place_id', placeId); else { p.set('address', address); p.set('components', 'country:US'); }
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${p}`, { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  const best = j.results && j.results[0];
  const g = best && best.geometry && best.geometry.location;
  if (!g) return null;
  const lt = best.geometry.location_type;
  return { lat: g.lat, lng: g.lng, placeId: best.place_id, formatted: best.formatted_address, precise: lt === 'ROOFTOP' || lt === 'RANGE_INTERPOLATED' };
}

async function placeAutocomplete(input, sessionToken) {
  const p = new URLSearchParams({ input, key: key(), types: 'address', components: 'country:us', language: 'en' });
  if (sessionToken) p.set('sessiontoken', sessionToken);
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${p}`, { signal: AbortSignal.timeout(5000) });
  const j = await r.json();
  if (j.status && j.status !== 'OK' && j.status !== 'ZERO_RESULTS') throw new Error(`places ${j.status}`);
  return (j.predictions || []).slice(0, 5).map((x) => ({ description: x.description, placeId: x.place_id }));
}

async function metadata(lat, lng) {
  const r = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&source=outdoor&radius=60&key=${key()}`, { signal: AbortSignal.timeout(5000) });
  const j = await r.json();
  if (j.status !== 'OK' || !j.location) return null;
  return { panoId: j.pano_id, lat: j.location.lat, lng: j.location.lng, date: j.date || null };
}

// Initial bearing from point A to point B in degrees [0,360).
function bearing(aLat, aLng, bLat, bLng) {
  const toR = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toR(bLng - aLng)) * Math.cos(toR(bLat));
  const x = Math.cos(toR(aLat)) * Math.sin(toR(bLat)) - Math.sin(toR(aLat)) * Math.cos(toR(bLat)) * Math.cos(toR(bLng - aLng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

async function staticShot({ panoId, lat, lng, heading, pitch, fov, size }) {
  const p = new URLSearchParams({ size: size || '640x640', heading: String(heading), pitch: String(pitch), fov: String(fov), source: 'outdoor', key: key() });
  if (panoId) p.set('pano', panoId); else p.set('location', `${lat},${lng}`);
  const r = await fetch(`https://maps.googleapis.com/maps/api/streetview?${p}`, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`streetview ${r.status}`);
  return `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
}

// Pull the candidate shots for a geocoded house. settings = req.site.streetview.
async function candidateShots({ lat, lng }, settings = {}) {
  if (!configured()) return { ok: false, reason: 'no GOOGLE_MAPS_API_KEY' };
  const meta = await metadata(lat, lng);
  if (!meta) return { ok: false, reason: 'no_coverage' };
  const base = bearing(meta.lat, meta.lng, lat, lng);
  const offsets = settings.headings || [-30, -15, 0, 15, 30];
  const pitch = settings.pitch != null ? settings.pitch : 5, fov = settings.fov || 70, size = settings.size || '640x640';
  const shots = [];
  for (const off of offsets) {
    const heading = Math.round((base + off + 360) % 360);
    try {
      const dataUri = await staticShot({ panoId: meta.panoId, heading, pitch, fov, size });
      shots.push({ panoId: meta.panoId, heading, pitch, fov, dataUri, score: 1 - Math.abs(off) / 90, chosen: off === 0 });
    } catch (e) { console.error('[streetview] shot failed', heading, e.message); }
  }
  if (!shots.length) return { ok: false, reason: 'no_shots' };
  if (!shots.some((s) => s.chosen)) shots[0].chosen = true;
  return { ok: true, pano: meta, bearing: base, shots };
}

module.exports = { configured, geocode, placeAutocomplete, metadata, bearing, staticShot, candidateShots };
