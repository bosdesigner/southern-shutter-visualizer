// Runs INSIDE the iframe: posts its height to the parent and forwards funnel events (render_ready,
// lead_submitted) to the host page. Only talks to the parent origin captured from ?parent= on load.
(function () {
  var params = new URLSearchParams(location.search);
  var parent = params.get('parent') || sessionStorage.getItem('sv_parent');
  var embedded = window.parent !== window && !!parent;
  if (parent) try { sessionStorage.setItem('sv_parent', parent); } catch (_) {}
  function post(type, extra) {
    if (!embedded) return;
    var msg = Object.assign({ source: 'shutter-vis', type: type }, extra || {});
    try { window.parent.postMessage(msg, parent); } catch (_) {}
  }
  window.svEmit = function (type, extra) { post(type, extra); try { window.dispatchEvent(new CustomEvent('shutter-vis:' + type, { detail: extra })); } catch (_) {} };
  window.svEmbedded = embedded;
  var last = 0;
  function resize() { var h = document.documentElement.scrollHeight; if (Math.abs(h - last) > 4) { last = h; post('resize', { height: h }); } }
  if (embedded) { resize(); setInterval(resize, 500); window.addEventListener('load', resize); }
})();
