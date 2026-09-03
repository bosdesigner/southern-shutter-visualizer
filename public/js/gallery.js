// Progress -> gallery -> quote, driven by /api/session/:id/status polling.
(function () {
  var S = window.SV_SESSION, $ = function (id) { return document.getElementById(id); };
  var state = { status: null, renders: [], current: null, options: null, shots: [] };
  var LABELS = { created: 'Starting…', streetview: 'Finding your home on Street View…', assessing: 'Finding your windows…', sizing: 'Sizing your shutters…', rendering: 'Rendering your home…', ready: 'Ready' };
  var ORDER = ['streetview', 'assessing', 'sizing', 'rendering'];
  function api(path, body) {
    return fetch('/api/session/' + S.id + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) } : { credentials: 'include' })
      .then(function (r) { return r.json(); });
  }
  function fill(sel, items, val, label) {
    sel.innerHTML = '';
    items.forEach(function (it) { var o = document.createElement('option'); o.value = it.slug; o.textContent = label ? label(it) : it.name; if (it.slug === val) o.selected = true; sel.appendChild(o); });
  }
  function show(id) { ['progress', 'needs', 'gallery'].forEach(function (x) { $(x).hidden = x !== id; }); }
  function setCurrent(r) {
    state.current = r;
    $('g-img').src = r.url || ''; $('g-style').textContent = r.style_name + ' · ' + r.color_name;
    $('g-cap').textContent = r.status === 'fixture' ? 'Fixture render (dev)' : (r.qa_score != null ? 'Render check ' + Math.round(r.qa_score * 100) + '%' : '');
    $('g-bom').textContent = r.pair_count + ' pair' + (r.pair_count === 1 ? '' : 's') + (r.single_count ? ', ' + r.single_count + ' single' + (r.single_count === 1 ? '' : 's') : '') + ' · ' + r.panels + ' panels';
    $('q-render').value = r.id;
    $('c-style').value = r.style; $('c-color').value = r.color; $('c-material').value = r.material;
    Array.prototype.forEach.call($('thumbs').children, function (f) { f.classList.toggle('active', f.dataset.id === r.id); });
  }
  function renderThumbs() {
    var t = $('thumbs'); t.innerHTML = '';
    state.renders.filter(function (r) { return r.url && (r.status === 'done' || r.status === 'fixture'); }).forEach(function (r) {
      var f = document.createElement('figure'); f.dataset.id = r.id; f.innerHTML = '<img alt=""><figcaption></figcaption>';
      f.querySelector('img').src = r.url; f.querySelector('figcaption').textContent = r.style_name + ' · ' + r.color_name;
      f.addEventListener('click', function () { setCurrent(r); }); t.appendChild(f);
    });
  }
  function renderShots() {
    var el = $('shots'); el.innerHTML = '';
    state.shots.forEach(function (s) {
      var f = document.createElement('figure'); f.className = s.chosen ? 'chosen' : ''; f.innerHTML = '<img alt=""><figcaption></figcaption>';
      f.querySelector('img').src = s.url; f.querySelector('figcaption').textContent = 'Angle ' + s.heading + '°';
      f.addEventListener('click', function () { if (s.chosen) return; $('c-status').textContent = 'Re-running on the new angle…'; api('/shot', { shotId: s.id }).then(function () { show('progress'); poll(); }); });
      el.appendChild(f);
    });
  }
  function apply(j) {
    var st = j.session.status; state.status = st; state.renders = j.renders; state.shots = j.shots; state.options = j.options;
    $('p-title').textContent = LABELS[st] || st;
    var idx = ORDER.indexOf(st);
    Array.prototype.forEach.call(document.querySelectorAll('.steps li'), function (li, i) { li.classList.toggle('done', i < idx || st === 'ready'); li.classList.toggle('active', i === idx); });
    if (j.assessment && (st === 'sizing' || st === 'rendering')) $('p-note').textContent = j.assessment.openings + ' openings found';
    if (st === 'needs_photo' || st === 'needs_config' || st === 'failed') {
      $('n-title').textContent = st === 'needs_photo' ? "We couldn't find a clear Street View of this home" : 'We hit a snag';
      $('n-body').textContent = st === 'needs_photo' ? 'Street View does not have a usable front view of this address yet. Photo upload is coming soon — for now, try a nearby address or contact us directly.' : 'Our rendering service is unavailable right now. Please try again shortly.';
      show('needs'); return;
    }
    var ready = j.renders.filter(function (r) { return r.url && (r.status === 'done' || r.status === 'fixture'); });
    if (ready.length) {
      if (!state.options_filled) {
        fill($('c-style'), j.options.styles); fill($('c-color'), j.options.colors); fill($('c-material'), j.options.materials); state.options_filled = true;
        if (window.svEmit) window.svEmit('render_ready', { sessionId: S.id });
      }
      renderThumbs(); renderShots();
      if (!state.current || !ready.some(function (r) { return r.id === state.current.id; })) setCurrent(ready[0]);
      else setCurrent(ready.filter(function (r) { return r.id === state.current.id; })[0]);
      $('c-status').textContent = st === 'rendering' ? 'More styles rendering…' : '';
      show('gallery');
    } else show('progress');
    return st;
  }
  var timer;
  function poll() {
    api('/status').then(function (j) {
      if (!j.ok) return;
      var st = apply(j);
      if (['ready', 'needs_photo', 'needs_config', 'failed'].indexOf(st) === -1 || j.renders.some(function (r) { return r.status === 'rendering' || r.status === 'queued'; })) timer = setTimeout(poll, 2500);
    }).catch(function () { timer = setTimeout(poll, 4000); });
  }
  $('c-render').addEventListener('click', function () {
    var btn = $('c-render'); btn.disabled = true; $('c-status').textContent = 'Rendering…';
    api('/render', { style: $('c-style').value, color: $('c-color').value, material: $('c-material').value }).then(function (j) {
      btn.disabled = false;
      if (!j.ok) { $('c-status').textContent = j.error === 'rate_limited' ? 'Please wait a moment before rendering again.' : 'Could not render: ' + (j.error || 'error'); return; }
      if (j.render.status === 'failed') { $('c-status').textContent = 'That render failed — try another combination.'; return; }
      $('c-status').textContent = ''; poll();
    });
  });
  $('quote-form').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target, btn = f.querySelector('button'); btn.disabled = true; $('q-err').hidden = true;
    var body = {}; new FormData(f).forEach(function (v, k) { body[k] = v; });
    api('/quote', body).then(function (j) {
      if (!j.ok) throw new Error(j.error || 'failed');
      if (window.svEmit) window.svEmit('lead_submitted', { sessionId: S.id, quoteId: j.quoteId });
      location.href = j.url;
    }).catch(function (e2) { $('q-err').textContent = e2.message === 'name_and_email_required' ? 'Please give us your name and a valid email.' : 'Sorry, that did not go through. Please try again.'; $('q-err').hidden = false; btn.disabled = false; });
  });
  poll();
})();
