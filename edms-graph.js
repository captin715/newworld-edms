/* edms-graph.js — EDMS 그래픽 부품 V1 (MST2-20261004-017)
 * 정본 = 06_설계결정\_설계\07_EDMS\목업\EDMS_디자인시안_V1.html 의 SVG 함수(donut · stack) 그대로 + 타임라인 · 결재 흐름
 * 바깥 라이브러리 없음 · 글만 돌려줌(html 문자열) · 들어온 글은 모두 esc 를 거침 · 값은 부르는 화면이 진짜 표에서 읽어 넘김 */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(x) { x = +x; return isFinite(x) ? x : 0; }
  /* 도넛 — parts [{c:색, v:값}] · 합이 0 이면 빈 고리만 */
  function donut(parts, size, center, sub, th) {
    th = th || 26; var r = size / 2 - th / 2 - 4, cx = size / 2, L = 2 * Math.PI * r, t = 0, off = 0;
    parts.forEach(function (p) { t += num(p.v); });
    var s = '<svg width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(center + ' ' + (sub || '')) + '"><circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="#edf1f7" stroke-width="' + th + '"/>';
    if (t > 0) parts.forEach(function (p) {
      var d = num(p.v) / t * L; if (d <= 0) return;
      s += '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="' + esc(p.c) + '" stroke-width="' + th + '" stroke-dasharray="' + Math.max(d - 3, 1) + ' ' + L + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 ' + cx + ' ' + cx + ')"/>';
      off += d;
    });
    return s + '<text x="' + cx + '" y="' + (cx + 6) + '" text-anchor="middle" font-size="' + (size / 4.6) + '" font-weight="900" fill="#152033">' + esc(center) + '</text>'
      + '<text x="' + cx + '" y="' + (cx + size / 6.5 + 6) + '" text-anchor="middle" font-size="14" fill="#5d6b80">' + esc(sub || '') + '</text></svg>';
  }
  /* 쌓은 막대 — data [[a,b],…] · labels · cols 두 색 */
  function stack(data, labels, w, h, cols) {
    cols = cols || ['#2e7d32', '#1565c0']; var mx = 1;
    data.forEach(function (d) { mx = Math.max(mx, num(d[0]) + num(d[1])); });
    var bw = (w - 40) / Math.max(data.length, 1), s = '<svg width="100%" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="달마다 제정 개정">';
    data.forEach(function (d, i) {
      var y = h - 28, x = 30 + i * bw + bw * .2;
      [0, 1].forEach(function (k) { var bh = num(d[k]) / mx * (h - 50); y -= bh; if (bh > 0) s += '<rect x="' + x + '" y="' + y + '" width="' + (bw * .6) + '" height="' + bh + '" fill="' + cols[k] + '" rx="4"/>'; });
      s += '<text x="' + (x + bw * .3) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#152033">' + (num(d[0]) + num(d[1])) + '</text>'
        + '<text x="' + (x + bw * .3) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="13" fill="#5d6b80">' + esc(labels[i]) + '</text>';
    });
    return s + '</svg>';
  }
  /* 타임라인 — items [{c:색, t:제목, d:설명}] 위가 최근 */
  function timeline(items) {
    return '<div class="eg-tl">' + items.map(function (e) {
      return '<div class="e" style="--c:' + esc(e.c || '#1565c0') + '"><b>' + esc(e.t) + '</b><div>' + esc(e.d || '') + '</div></div>';
    }).join('') + '</div>';
  }
  /* 결재 흐름 — steps [[이름, 'ok'|'wait'|'blk'|'none']] */
  function chain(steps) {
    var mk = { ok: '✔ ', wait: '⏸ ', blk: '⚠ ', run: '▶ ', none: '' };
    return '<div class="eg-chain">' + steps.map(function (s, i) {
      var k = mk.hasOwnProperty(s[1]) ? s[1] : 'none';
      return (i ? '<em>➜</em>' : '') + '<span class="eg-' + k + '">' + mk[k] + esc(s[0]) + '</span>';
    }).join('') + '</div>';
  }
  window.EDMSG = { esc: esc, donut: donut, stack: stack, timeline: timeline, chain: chain };
})();
