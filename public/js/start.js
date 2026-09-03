(function () {
  var form = document.getElementById('start'), input = document.getElementById('address'), placeId = document.getElementById('placeId');
  var list = document.getElementById('suggest'), err = document.getElementById('err'), token = Math.random().toString(36).slice(2), timer;
  var embed = document.body.classList.contains('embed') || new URLSearchParams(location.search).get('embed') === '1' || window.svEmbedded;
  input.addEventListener('input', function () {
    placeId.value = '';
    clearTimeout(timer);
    if (input.value.length < 4) { list.hidden = true; return; }
    timer = setTimeout(function () {
      fetch('/api/places?input=' + encodeURIComponent(input.value) + '&session=' + token).then(function (r) { return r.json(); }).then(function (j) {
        list.innerHTML = '';
        (j.suggestions || []).forEach(function (s) {
          var li = document.createElement('li'); li.textContent = s.description;
          li.addEventListener('click', function () { input.value = s.description; placeId.value = s.placeId; list.hidden = true; });
          list.appendChild(li);
        });
        list.hidden = !list.children.length;
      }).catch(function () { list.hidden = true; });
    }, 250);
  });
  document.addEventListener('click', function (e) { if (!list.contains(e.target)) list.hidden = true; });
  form.addEventListener('submit', function (e) {
    e.preventDefault(); err.hidden = true;
    var btn = form.querySelector('button'); btn.disabled = true;
    fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ address: input.value, placeId: placeId.value, embed: embed ? 1 : 0, embedOrigin: (function () { try { return sessionStorage.getItem('sv_parent'); } catch (_) { return null; } })() }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'failed'); if (window.svEmit) window.svEmit('session_started', { sessionId: j.id }); location.href = j.url; })
      .catch(function (e2) { err.textContent = e2.message === 'rate_limited' ? 'Too many requests — please try again in a few minutes.' : 'Sorry, something went wrong. Please check the address and try again.'; err.hidden = false; btn.disabled = false; });
  });
})();
