/* edms-design.js — EDMS 디자인 개편 V1 · 모든 화면 보정 (MST2-20261005-002)
 * ★겉모양만 · 값 · 칸 · id · 함수는 손대지 않습니다. 화면이 다시 그려지면(MutationObserver) 다시 맞춥니다.
 *  ① 글자 바닥값 — 표 안 16px · 그 밖 14px 아래로 내려가지 않게 (인라인 글자 크기까지)
 *  ② 개발용 글 — 작업 메모 상자(.mk-note · .prov-note)는 「ⓘ 작업 메모 보기」 접기 안으로,
 *     문장 끝 괄호 속 내부 근거 번호(지시 · 판정 · MST2- · C-○○ · M-○○○ …)는 화면에서 뺍니다.
 *     ★기록 · 문서 본문(열람 · 상세 · 이력 표 · 입력칸)은 건드리지 않습니다. */
(function () {
  'use strict';
  var SKIP = '#readBody, .dd-grid, .hist-table, #ddTl, textarea, input, select, script, style, svg, .eh-hero, .eh-kp, .edms-dev';
  var DEV = /\s*[(（](?=[^()（）]*(?:MST2-|판정\s*(?:20|§|MST)|지시\s*(?:20|§|MST)|\bC-\d{2}\b|\bM-0\d\d\b|RW-20\d|DEF-\d|EMK-20|규약\s*§|값\s*V\d))[^()（）]*[)）]/g;
  var DEV2 = /\s*[·•,]\s*(?:착수\s*)?(?:지시|판정|규약)\s*MST2-[\w-]+(?:\s*§[\d.\-]+)?/g;
  var DEVLINE = /^\s*(?:★?\s*)?(?:근거\s*[:：]|\(?(?:지시|판정)\s*MST2-|MST2-\d)/;
  function inSkip(el) { return el.closest && el.closest(SKIP); }
  function fold(el) {
    if (el.closest('.edms-dev') || el.dataset.edmsFold) return;
    el.dataset.edmsFold = '1';
    var d = document.createElement('details'); d.className = 'edms-dev';
    var s = document.createElement('summary'); d.appendChild(s);
    el.parentNode.insertBefore(d, el); d.appendChild(el);
  }
  function fixFonts(root) {
    var els = root.querySelectorAll('body *');
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (e.dataset.edmsFs || inSkip(e)) continue;
      var own = false;
      for (var c = e.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.textContent.trim()) { own = true; break; }
      if (!own) continue;
      var fs = parseFloat(getComputedStyle(e).fontSize), floor = e.closest('td, th') ? 16 : 14;
      if (fs && fs < floor) { e.style.setProperty('font-size', floor + 'px', 'important'); e.dataset.edmsFs = '1'; }
    }
  }
  function fixDev(root) {
    root.querySelectorAll('.mk-note, .prov-note').forEach(fold);
    var w = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT, null), n, hits = [];
    while ((n = w.nextNode())) { if (n.parentElement && !inSkip(n.parentElement) && (DEV.test(n.textContent) || DEV2.test(n.textContent) || DEVLINE.test(n.textContent))) hits.push(n); DEV.lastIndex = 0; DEV2.lastIndex = 0; }
    hits.forEach(function (t) {
      var p = t.parentElement; if (!p) return;
      if (DEVLINE.test(t.textContent) && p.textContent.trim().length < 300 && !p.querySelector('button, input, table')) { fold(p); return; }
      t.textContent = t.textContent.replace(DEV, '').replace(DEV2, '');
    });
  }
  var busy = false;
  function run() { if (busy) return; busy = true; try { fixDev(document); fixFonts(document); } catch (e) { console.warn('[edms-design]', e); } busy = false; }
  var timer = null;
  function later() { if (timer) return; timer = setTimeout(function () { timer = null; run(); }, 250); }
  function start() {
    run();
    new MutationObserver(function (m) { if (!busy) later(); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
