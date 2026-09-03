// Admin: draw detected openings (green = in BOM, grey = excluded, orange = flagged) and scale references
// (blue) over the chosen shot, scaled to the displayed image size.
(function () {
  var D = window.SV_OVERLAY, img = document.getElementById('ov-img'), c = document.getElementById('ov-canvas');
  if (!D || !img || !c) return;
  function draw() {
    var W = D.imageWH ? D.imageWH[0] : img.naturalWidth, H = D.imageWH ? D.imageWH[1] : img.naturalHeight;
    c.width = img.clientWidth; c.height = img.clientHeight;
    var sx = c.width / W, sy = c.height / H, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height); ctx.lineWidth = 2; ctx.font = '11px sans-serif';
    (D.references || []).forEach(function (r) { var b = r.bbox; ctx.strokeStyle = '#2f6fd8'; ctx.strokeRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy); ctx.fillStyle = '#2f6fd8'; ctx.fillText(r.type + (r.count ? ' ×' + r.count : ''), b.x * sx, b.y * sy - 3); });
    (D.openings || []).forEach(function (o) {
      var b = o.bbox; ctx.strokeStyle = o.include ? '#2a9d4b' : (o.flag === 'not_shuttered_kind' ? '#888' : '#e08a1e');
      ctx.strokeRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy); ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText((o.idx + 1) + (o.est_w_in ? ' ' + o.est_w_in + '×' + o.est_h_in : ''), b.x * sx + 2, b.y * sy + b.h * sy + 11);
    });
  }
  if (img.complete) draw(); img.addEventListener('load', draw); window.addEventListener('resize', draw);
})();
