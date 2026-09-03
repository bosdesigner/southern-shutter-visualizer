// routes/public.js — homeowner pages + the embed bootstrap script.
const express = require('express');
const store = require('../store-pg');
const wrap = require('../lib/async-handler');
const { baseUrl } = require('../lib/util');
const r = express.Router();

const page = (view) => wrap(async (req, res) => res.render(view, { address: String(req.query.address || '').slice(0, 200), mapsConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY) }));
r.get('/', page('funnel/start'));
r.get('/start', page('funnel/start'));
r.get('/embed', page('funnel/start'));

r.get('/r/:id', wrap(async (req, res) => {
  const s = await store.one('SELECT id, address, status FROM sessions WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id]);
  if (!s) return res.status(404).render('error', { code: 404, message: 'Session not found' });
  res.render('funnel/session', { session: s });
}));

r.get('/thanks/:id', wrap(async (req, res) => {
  const s = await store.one('SELECT id, address FROM sessions WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id]);
  if (!s) return res.status(404).render('error', { code: 404, message: 'Session not found' });
  const render = await store.one(`SELECT secure_url FROM renders WHERE session_id = $1 AND status IN ('done','fixture') ORDER BY created_at DESC LIMIT 1`, [s.id]);
  res.render('funnel/thanks', { session: s, render });
}));

// One-line embed for southernshutter.com: <script src="https://visualize.southernshutter.com/embed.js" data-height="720"></script>
// Injects an iframe of /embed, resizes it from postMessage height events, and re-dispatches funnel events
// (render_ready, lead_submitted) as DOM CustomEvents on window for the host site's analytics.
r.get('/embed.js', (req, res) => {
  const origin = baseUrl(req);
  res.type('application/javascript').set('Cache-Control', 'public, max-age=300').send(`(function(){
  var ORIGIN=${JSON.stringify(origin)};
  var s=document.currentScript||(function(){var a=document.getElementsByTagName('script');return a[a.length-1];})();
  var mount=document.createElement('div');mount.className='shutter-vis-embed';mount.style.cssText='width:100%;max-width:100%';
  var f=document.createElement('iframe');
  f.src=ORIGIN+'/embed?parent='+encodeURIComponent(location.origin);
  f.title='Shutter Visualizer';f.loading='lazy';f.allow='clipboard-write';
  f.style.cssText='width:100%;border:0;display:block;height:'+((s&&s.getAttribute('data-height'))||'720')+'px';
  mount.appendChild(f);s.parentNode.insertBefore(mount,s);
  window.addEventListener('message',function(e){
    if(e.origin!==ORIGIN||!e.data||e.data.source!=='shutter-vis')return;
    if(e.data.type==='resize'&&e.data.height)f.style.height=Math.max(400,e.data.height)+'px';
    try{window.dispatchEvent(new CustomEvent('shutter-vis:'+e.data.type,{detail:e.data}));}catch(_){}
    if(window.dataLayer&&(e.data.type==='render_ready'||e.data.type==='lead_submitted'))window.dataLayer.push({event:'shutter_vis_'+e.data.type,sessionId:e.data.sessionId});
  });
})();`);
});

module.exports = r;
