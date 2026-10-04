/* edms-design.js — EDMS 디자인 개편 V1 · 모든 화면 보정 (MST2-20261005-002)
 * ★겉모양만 · 값 · 칸 · id · 함수는 손대지 않습니다. 화면이 다시 그려지면(MutationObserver) 다시 맞춥니다.
 *  ① 글자 바닥값 — 표 안 16px · 그 밖 14px 아래로 내려가지 않게 (인라인 글자 크기까지)
 *  ② 개발용 글 — 작업 메모 상자(.mk-note · .prov-note)는 「ⓘ 작업 메모 보기」 접기 안으로,
 *     문장 끝 괄호 속 내부 근거 번호(지시 · 판정 · MST2- · C-○○ · M-○○○ …)는 화면에서 뺍니다.
 *     ★기록 · 문서 본문(열람 · 상세 · 이력 표 · 입력칸)은 건드리지 않습니다. */
(function () {
  'use strict';
  var SKIP = 'table.gantt th.d, table.gantt td.cell, #readBody, .dd-grid, .hist-table, #ddTl, textarea, input, select, script, style, svg, .eh-hero, .eh-kp, .edms-dev';
  var DEV = /\s*[(（](?=[^()（）]*(?:MST2-|판정\s*(?:20|§|MST)|지시\s*(?:20|§|MST)|\bC-\d{2}\b|\bM-0\d\d\b|RW-20\d|DEF-\d|EMK-20|규약\s*§|값\s*V\d))[^()（）]*[)）]/g;
  var DEV2 = /\s*[·•,]\s*(?:착수\s*)?(?:지시|판정|규약)\s*MST2-[\w-]+(?:\s*§[\d.\-]+)?/g;
  var DEVLINE = /^\s*(?:★?\s*)?(?:근거\s*[:：]|\(?(?:지시|판정)\s*MST2-|MST2-\d)/;
  function inSkip(el) { return el.closest && el.closest(SKIP); }
  /* ★2차(MST2-20261005-004) — 작업 메모는 화면 ★맨 아래 한 곳에 모읍니다(위에 여러 줄 겹치지 않게). */
function devBox() {
var d = document.getElementById('edmsDevBox'); if (d) return d;
d = document.createElement('details'); d.className = 'edms-dev edms-devbox'; d.id = 'edmsDevBox';
var s = document.createElement('summary'); d.appendChild(s);
var host = document.querySelector('main') || document.body, ft = host === document.body ? document.querySelector('body > footer') : null;
if (ft) document.body.insertBefore(d, ft); else host.appendChild(d);
return d;
}
function fold(el) {
if (!el || !el.parentNode || el.closest('.edms-dev') || el.closest('.approval-note, .keep') || el.dataset.edmsFold) return;
el.dataset.edmsFold = '1';
devBox().appendChild(el);
}
/* ★2차 — 프로젝트관리 · 프로젝트 화면은 본문도 16 아래로 내려가지 않게(보조 글만 14) */
var PMPAGE = !!(document.querySelector('header.mk') || document.querySelector('#edmsHeader[data-system=project]'));
var HINT = '.hint, small, .axis, .count-info, .lane-sub, .float, .crumbs, .sub, .muted, .note, footer, .edms-dev, .eg-tl div';
function fixFonts(root) {
    var els = root.querySelectorAll('body *');
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (e.dataset.edmsFs || inSkip(e)) continue;
      var own = false;
      for (var c = e.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.textContent.trim()) { own = true; break; }
      if (!own) continue;
      var fs = parseFloat(getComputedStyle(e).fontSize), floor = e.closest('td, th') ? 16 : (PMPAGE && e.closest('main') && !e.closest(HINT) ? 16 : 14);
      if (fs && fs < floor) { e.style.setProperty('font-size', floor + 'px', 'important'); e.dataset.edmsFs = '1'; }
    }
  }
  function fixDev(root) {
    if (!STATIC) STATIC = [].slice.call(root.querySelectorAll('.mk-note:not(.approval-note):not(.keep), .prov-note:not(.keep), .dev-detail'));
STATIC.forEach(fold);
root.querySelectorAll('.dev-detail').forEach(fold);
    var w = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT, null), n, hits = [];
    while ((n = w.nextNode())) { if (n.parentElement && !inSkip(n.parentElement) && (DEV.test(n.textContent) || DEV2.test(n.textContent) || DEVLINE.test(n.textContent))) hits.push(n); DEV.lastIndex = 0; DEV2.lastIndex = 0; }
    hits.forEach(function (t) {
      var p = t.parentElement; if (!p) return;
      if (DEVLINE.test(t.textContent) && p.textContent.trim().length < 300 && !p.querySelector('button, input, table')) { fold(p); return; }
      t.textContent = t.textContent.replace(DEV, '').replace(DEV2, '');
    });
  }
  var STATIC = null; /* ★처음 그려질 때 있던 메모 상자만 접습니다 — 나중에 생기는 알림(저장 됨 · 0건 등)은 그대로 보입니다 */
/* ★2차 — 사용자 눈에 보이는 개발 말 다듬기 (본문 · 기록 내용은 SKIP 으로 건드리지 않음) */
var CODEP = /\s*[(（]\s*(?:W-\d+|X\d|[LSHN]\d(?:\s*[·,]\s*[LSHN]?\d)*|S\d+\s*~\s*S\d+|M-0\d\d|C-\d+|INI|PRJ|\d\d-\d\d\s*판|V\d+\.\d+[^()（）]*|㉮|㉯|㉰|㉱|㉲)\s*[)）]/g;
var TERMS = [[/\bproject_code\b/g, '프로젝트 코드'], [/\bpm_gate_defs\b/g, '게이트 정의'], [/\bpm_approval_lines\b/g, '결재선 참조표'], [/^\s*(?:INI|PRJ)\s*—\s*/, ''], [/\s*—\s*실앱\s*v1/g, ''], [/실앱\s*v1\s*/g, ''], [/★\s*/g, ''],
[/\bpm_can_edit\(\)/g, '편집 권한 확인'], [/\bedms_profiles\.can_use_pm\b/g, '「프로젝트관리 사용 권한」'], [/\s*[(（]\s*can_use_pm\s*[)）]/g, ''], [/\bcan_use_pm\b/g, '프로젝트관리 사용 권한'],
[/\bplanned_start\b/g, '계획 시작일'], [/\bplanned_end\b/g, '계획 마감일'], [/\bsort_order\b/g, '순서'], [/\bpm_v_gate_d_pass\b/g, '게이트 통과 계산표'],
[/\bpm_approvals\b/g, '결재 표'], [/\bpm_form_axis\b/g, '양식–축 대응표'], [/\bpm_approval_guard\b/g, '직무분리 검사'],
[/\s*[(（][^()（）]*(?:NOT NULL|\bPK\b|실측\s*20\d\d)[^()（）]*[)）]/g, ''], [/\bL3\s+(?=결재함)/g, ''], [/\bS\d+에서 정(합니다|한 값)/g, '앞 단계에서 정$1'], [/(1층)\s+[NS]\d+\b/g, '$1'], [/원문 명칭\s*·\s*/g, ''], [/S\d+(?:\s*·\s*S\d+)*\s*(?:로|으로) 이어집니다/g, '다음 서류로 이어집니다'], [/상위 셀 안에 원문 명칭/g, '상위 칸 안에 원래 이름']];
function fixWords(root) {
var w = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT, null), n, list = [];
while ((n = w.nextNode())) { var pe = n.parentElement; if (pe && !inSkip(pe) && !pe.closest('#edmsDevBox')) list.push(n); }
list.forEach(function (t) {
var v = t.textContent, o = v; v = v.replace(CODEP, ''); CODEP.lastIndex = 0;
TERMS.forEach(function (r) { v = v.replace(r[0], r[1]); });
if (v !== o) t.textContent = v;
var pe = t.parentElement;
/* 화면 번호 딱지(S1 · L2 · X1 …)만 있는 작은 글은 숨김 */
if (/^\s*[LSXHN]\d\s*$/.test(v) && pe && pe.children.length === 0 && pe.textContent.trim() === v.trim() && pe.closest('a, button, td, small, .tag, .code')) pe.style.setProperty('display', 'none', 'important');
});
var ft = document.querySelector('footer.mk');
if (ft && !ft.dataset.edmsFt) { ft.dataset.edmsFt = '1'; var m = document.createElement('div'); m.className = 'dev-detail'; m.textContent = '바닥글 원문 : ' + ft.textContent.trim(); devBox().appendChild(m); ft.textContent = '뉴월드 EDMS · 프로젝트관리 시스템'; }
}
var busy = false;
  /* ★2차 — 프로젝트관리 머리줄 : 메일 · authenticated 대신 「이름 · 직함」(홈과 같은 꼴 · 읽기만) */
var ROLE = { admin: '관리자', approver: '승인자', reviewer: '검토자', general: '일반' }, ME = null, meAsked = false;
function fixWho() {
var w = document.getElementById('who'), b = document.getElementById('roleBadge');
if (!w || !document.querySelector('header.mk')) return;
if (ME) {
if (w.textContent !== ME.name) w.textContent = ME.name;
if (b && b.textContent !== ME.role) { b.textContent = ME.role; b.className = 'role-badge ' + ME.cls; }
return;
}
if (meAsked || typeof edmsClient === 'undefined' || w.textContent.indexOf('@') < 0) return;
meAsked = true;
edmsClient.auth.getSession().then(function (s) {
var u = s && s.data && s.data.session && s.data.session.user; if (!u) return null;
return edmsClient.from('edms_profiles').select('name, role').eq('id', u.id).maybeSingle().then(function (r) {
var p = r && r.data; ME = { name: (p && p.name) || u.email, role: ROLE[(p && p.role) || 'general'] || '일반', cls: (p && p.role) || 'general' };
fixWho();
});
}).catch(function () { meAsked = false; });
}
/* ★2차 — 글자만 있던 상태 딱지(.dstat 등)에 색 + 아이콘 */
var SOK = /^(승인완료|승인|완료|통과|등록완료|보관|발급|정본|유효|종결)$/, SRUN = /^(검토중|임시저장|검토 중|작성중|진행|초안|진행중|내 검토 차례|내 승인 차례|내가 작성 중)$/, SWAIT = /^(승인대기|보류|대기|예정|미착수|신청|요청)$/, SBLK = /^(반려|취소|폐기|부결|회수)$/;
function fixStatus(root) {
root.querySelectorAll('.dstat, .tier, span.st-tag, table.ap .st').forEach(function (e) {
if (e.classList.contains('st-tag') && e.classList.length > 1 && !e.classList.contains('edms-s-ok') && !e.classList.contains('edms-s-run') && !e.classList.contains('edms-s-wait') && !e.classList.contains('edms-s-blk')) return;
var t = e.textContent.trim().replace(/\s*\(.*\)\s*$/, ''), c = SOK.test(t) ? 'ok' : SRUN.test(t) ? 'run' : SWAIT.test(t) ? 'wait' : SBLK.test(t) ? 'blk' : '';
if (e.classList.contains('tier')) return;
if (c && e.dataset.edmsSt !== c) { e.classList.remove('edms-s-ok', 'edms-s-run', 'edms-s-wait', 'edms-s-blk'); e.classList.add('edms-s-' + c); e.dataset.edmsSt = c; }
});
var b = document.getElementById('roleBadge');
if (b && ROLE[b.textContent.trim()]) b.textContent = ROLE[b.textContent.trim()];
}
/* ★2차 — 간트 날짜 머리 : 칸마다 작은 글자 대신 7일마다 한 번 읽히는 크기로 */
function fixGantt(root) {
root.querySelectorAll('table.gantt').forEach(function (t) {
var ds = t.querySelectorAll('th.d'); if (!ds.length || t.dataset.edmsG === String(ds.length)) return;
t.dataset.edmsG = String(ds.length);
ds.forEach(function (h, i) { h.classList.toggle('edms-tick', i % 7 === 0); });
});
}
function run() { if (busy) return; busy = true; try { fixDev(document); fixWords(document); fixFonts(document); fixWho(); fixStatus(document); fixGantt(document); } catch (e) { console.warn('[edms-design]', e); } busy = false; }
  var timer = null;
  function later() { if (timer) return; timer = setTimeout(function () { timer = null; run(); }, 250); }
  function start() {
    run();
    new MutationObserver(function (m) { if (!busy) later(); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
