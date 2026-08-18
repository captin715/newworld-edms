/* ═══════════════════════════════════════════════════════════════════════
   common.js — 3타일 분리 공통 shell (범위 한정: 세션·헤더(상호 이동 바)·기본 공유 인프라)
   · 시스템 고유 로직(문서/기록/제정) 미포함(SHALL NOT)
   · 세션은 Supabase 인증 토큰으로 전 시스템 공유 → 전환 시 재로그인 없음
   · window.EDMS.ready(프로미스) 완료 후 시스템 스크립트가 실행
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── 인라인 SVG 아이콘(이모지 금지) ──
  var ICONS = {
    doc: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',
    stamp: '<circle cx="12" cy="8.5" r="4.5"/><path d="M4 20h16M6.5 20l1-3.5h9l1 3.5"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/>',
    logout: '<path d="M14 4h-8a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8"/><path d="M20 12H9M16 8l4 4-4 4"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15 12v2"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    switch: '<path d="M4 9h13l-3-3M20 15H7l3 3"/>'
  };
  /* ── 단계 표시기(stepper) — ★공통 승격 (판정 20260816_15 §1) ─────────────
     establish.html 에만 있던 것을 옮겨 왔다. ★단계 배열을 인자로 받는다.
       steps  단계 문자열 배열 — ★축마다 값역이 다르므로 호출부가 넘긴다
              문서 제·개정 = ['초안','검토중','승인대기','등록완료']
              기록        = M-009 값역 ['작성중','검토중','승인','반려','보관'] 에서 구성
              ★두 값역을 섞지 않는다(SHALL NOT) — 별개 표의 값이다
       cur    현재 단계 문자열
       cls    축 클래스 'est' | 'docs' | 'recs' — .stepper 축 분기가 색을 정한다
              ★생략하면 색이 중성으로 나온다. 축을 넘기는 것이 정상이다 */
  function stepper(steps, cur, cls) {
    steps = steps || [];
    var idx = steps.indexOf(cur);
    // ★단계에 없는 값이면 ★아무것도 그리지 않는다(판정 20260816_17 §1 · 제작창 확정 20260816_11 §2-3).
    //   전부 회색으로 띄우면 「진행이 멈춤」으로 읽힌다 — 「아직 시작 전」과 다르다.
    //   상신 후 단계가 ★나타나는 것 자체가 「진행 시작」 신호가 된다.
    if (idx < 0) return '';
    return '<div class="stepper ' + (cls || '') + '">' + steps.map(function (s, i) {
      var st = i < idx ? 'done' : (i === idx ? 'on' : '');
      var ar = i < steps.length - 1 ? '<span class="step-arrow">' + ico('arrowR') + '</span>' : '';
      return '<span class="step ' + st + '"><span class="dot">' + (i + 1) + '</span><span class="lbl">'
           + escHtml(s) + '</span></span>' + ar;
    }).join('') + '</div>';
  }

  function ico(name, cls) { return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>'; }

  // ── 시스템 메타 (명칭 확정 · 이동 버튼 문구 "~으로" 생략) ──
  var SYS = {
    docs: { name: '문서관리 시스템', file: 'docs.html', cls: 'docs', icon: 'doc' },
    records: { name: '기록관리 시스템', file: 'records.html', cls: 'recs', icon: 'archive' },
    establish: { name: '문서 제·개정 시스템', file: 'establish.html', cls: 'est', icon: 'stamp' },
    // ★기록작성 시스템 등재(지시 20260816_08 §4-① · 판정 20260816_07 §2-4·§3-④)
    //   cls·icon 은 ★기록 계열 재사용 — 새로 만들면 common.css 에 대응 규칙이 없어 색이 빠진다(C-51).
    //   등재하면 others 로 docs·records·establish 3화면 이동 바에도 들어간다(6→9).
    //   그 3개는 결함이 아니라 ★완료 정의 ④(헤더 상호 이동)의 요건이다.
    write:     { name: '기록작성 시스템',     file: 'record-write.html', cls: 'recs', icon: 'archive' },
    // ★프로젝트관리 등재 — 판정 20260817_06 §1·§2 · ★통지 20260817_04 로 cls·icon 확정
    //   nav:false = 등재는 지금, 노출은 배포 후. 화면이 없는 동안 죽은 버튼을 만들지 않는다.
    //   ★cls 는 기존 계열 재사용(새 색·새 토큰 신설 금지 · C-51 · 판정 08 §2) → 'est'
    //   ★icon 도 기존 10종에서 차용 → 'stamp'. 노출 전까지 새 SVG 불요
    project:   { name: '프로젝트관리 시스템', file: 'project.html',      cls: 'est',  icon: 'stamp', nav: false }
  };
  // 역할 라벨/배지 — 원문 보존(회귀 방지). 임원=approver, 작성 권한자=reviewer 로 매핑.
  var ROLE_LABEL = { admin: '관리자', approver: '승인자', reviewer: '검토자', general: '일반' };

  var escHtml = function (s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var esc = function (s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };

  // ── 공유 모달 주입(뷰어 · 사유 입력 · 비밀번호) ── docs/records 공용

  /* ═══════════════════════════════════════════════════════════════════════
     M-017 보안·데이터 보호 기전 — 통지 20260818_05 순서대로
       ★B-② 자동 임시저장이 ★먼저이고, A-2 의 30분 타이머는 ★그 뒤입니다.
         「보호 없이 문을 닫으면 안에 있던 것이 사라집니다」(판정 20260818_07 §1)
       ★이 파일에는 ★기전만 둡니다. 화면 연결(saveFn 전달)은 ★다음 회차입니다 —
         record-write.html 이 다른 창 소관이고 지금 갱신 중이기 때문입니다.
       ★그래서 이번 회차 결과는 「기전 있음 · 부르는 곳 0」이고, 그것이 맞습니다.
     ═══════════════════════════════════════════════════════════════════════ */

  /* ── B-① 변경 감지 ── ★_dirty 는 ★한 곳에만 둡니다(B-② 의 isDirtyFn 과 같은 값) */
  var _dirty = false;
  function markDirty()  { _dirty = true;  }
  function clearDirty() { _dirty = false; }
  function isDirty()    { return _dirty;  }
  window.addEventListener('beforeunload', function (e) {
    if (!_dirty) return;
    e.preventDefault(); e.returnValue = '';        /* 문구는 브라우저가 정합니다 */
  });

  /* ── B-② 자동 임시저장 (조건 ㉮~㉲ · 판정 20260818_07 §1) ──
       ㉮ staging 임시저장만 — ★정본 스키마 쓰기 금지는 saveFn 을 넘기는 화면이 지킵니다
       ㉯ 상태값 변경 0 — 상태 전이는 사람만
       ㉰ 60초 · ★바뀐 경우에만 (빈 쓰기 금지)
       ㉱ 「자동 저장됨 hh:mm」 표시
       ㉲ ★실패를 삼키지 않습니다 — 조용히 넘기면 사람은 저장된 줄 알고 창을 닫습니다 */
  var AUTOSAVE_MS = 60 * 1000, _autoT = null, _lastSaved = null;
  function hhmm(d) {
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function showAutoMsg(text, kind) {
    var el = document.getElementById('autoSaveMsg');
    if (!el) return;                               /* 표시 자리는 화면이 둡니다(다음 회차) */
    el.textContent = text;
    el.className = 'pw-msg ' + (kind === 'err' ? 'err' : 'ok');   /* ★기존 계열 재사용 */
  }
  function startAutoSave(saveFn, isDirtyFn) {
    if (typeof saveFn !== 'function') return false;
    stopAutoSave();
    var dirtyOf = (typeof isDirtyFn === 'function') ? isDirtyFn : isDirty;
    _autoT = setInterval(async function () {
      if (!dirtyOf()) return;                      /* ㉰ */
      try {
        await saveFn();                            /* ㉮㉯ 화면이 staging 만 · status 무변경 */
        _lastSaved = new Date();
        showAutoMsg('자동 저장됨 ' + hhmm(_lastSaved), 'ok');      /* ㉱ */
        clearDirty();
      } catch (e) {
        showAutoMsg('★자동 저장 실패 — 직접 저장해 주십시오', 'err');  /* ㉲ */
      }
    }, AUTOSAVE_MS);
    return true;
  }
  function stopAutoSave() { if (_autoT) { clearInterval(_autoT); _autoT = null; } }
  function lastAutoSavedAt() { return _lastSaved; }

  /* ── A-1 hardLogout — ★선별 삭제 (판정 20260818_05 §2-②)
       ★전체 삭제 금지: edms_seen_rejected · edms_notif_read · edms_notif_read_est
         3키가 함께 날아가면 ★읽은 공지가 「안 읽음」으로 돌아옵니다.
       ★edms_last_act 는 sb- 가 아니므로 여기서 ★따로 지웁니다(A-2 가 쓰는 키). */
  async function hardLogout(why) {
    try { await edmsClient.auth.signOut({ scope: 'local' }); } catch (e) {}
    try {
      Object.keys(localStorage)
        .filter(function (k) { return /^sb-/.test(k); })
        .forEach(function (k) { localStorage.removeItem(k); });
      localStorage.removeItem('edms_last_act');
    } catch (e) {}
    location.replace('login.html' + (why ? '?bye=' + encodeURIComponent(why) : ''));
  }

  /* ── A-3 reauth — ★있는 것을 승격 (C-51)
       ★bindPw 의 signInWithPassword 패턴을 그대로 씁니다.
       ★_reauthAt 은 ★메모리에만 둡니다 — 저장소에 넣으면 다음 사람이 물려받습니다.
       ★실패 횟수 제한은 서버가 합니다 — 화면에서 세지 않습니다. */
  var _reauthAt = 0, REAUTH_MS = 15 * 60 * 1000;
  function askPassword(reasonText) {
    return new Promise(function (resolve) {
      var m = document.getElementById('reauthModal');
      if (!m) { resolve(null); return; }
      var who = document.getElementById('reauthWho'), why = document.getElementById('reauthWhy');
      var inp = document.getElementById('reauthPw'), msg = document.getElementById('reauthMsg');
      var ok = document.getElementById('reauthOk'), no = document.getElementById('reauthCancel');
      /* E-2 「<이름> 으로 처리합니다」 — EDMS.myName 재사용(C-51) */
      who.innerHTML = '<b>' + escHtml(window.EDMS.myName || '') + '</b> 으로 처리합니다.';
      why.textContent = reasonText || '';
      inp.value = ''; inp.type = 'password'; msg.textContent = '';
      m.classList.add('open'); inp.focus();
      function done(v) {
        inp.value = ''; inp.type = 'password'; m.classList.remove('open');
        ok.removeEventListener('click', onOk); no.removeEventListener('click', onNo);
        resolve(v);
      }
      function onOk() { var v = inp.value; if (!v) { msg.textContent = '비밀번호를 입력해야 합니다.'; inp.focus(); return; } done(v); }
      function onNo() { done(null); }
      ok.addEventListener('click', onOk); no.addEventListener('click', onNo);
    });
  }
  async function reauth(reasonText) {
    if (Date.now() - _reauthAt < REAUTH_MS) return true;
    var pw = await askPassword(reasonText);
    if (pw === null) return false;
    var v = await edmsClient.auth.signInWithPassword({
      email: (window.EDMS.session && window.EDMS.session.user.email) || '', password: pw });
    pw = null;                                     /* ★즉시 버립니다 */
    if (!v || v.error) return false;
    _reauthAt = Date.now(); return true;
  }

  /* ── A-2 resetIdle — 30분 · 1분 전 경고
       ★★IDLE 등록은 ★아직 켜지 않았습니다 — B-② 가 화면에 붙어 확인된 뒤에 켭니다
         (통지 20260818_05 §1 · 판정 20260818_07 §1). enableIdle() 을 부르면 켜집니다. */
  var IDLE_MS = 30 * 60 * 1000, WARN_MS = 60 * 1000, idleT = null, warnT = null;
  var IDLE_EVENTS = ['click', 'keydown', 'scroll', 'touchstart', 'visibilitychange'];
  function hideIdleWarn() { var m = document.getElementById('idleModal'); if (m) m.classList.remove('open'); }
  function showIdleWarn() { var m = document.getElementById('idleModal'); if (m) m.classList.add('open'); }
  function onIdleExpire() { hardLogout('idle'); }
  function resetIdle() {
    clearTimeout(idleT); clearTimeout(warnT); hideIdleWarn();
    try { localStorage.setItem('edms_last_act', String(Date.now())); } catch (e) {}
    warnT = setTimeout(showIdleWarn, IDLE_MS - WARN_MS);
    idleT = setTimeout(function () { onIdleExpire(); }, IDLE_MS);
  }
  var _idleOn = false;
  function enableIdle() {
    if (_idleOn) return false;
    _idleOn = true;
    IDLE_EVENTS.forEach(function (e) { window.addEventListener(e, resetIdle, { passive: true }); });
    /* 탭 여러 개 — 다른 탭의 활동을 받아 함께 움직입니다 */
    window.addEventListener('storage', function (e) { if (e.key === 'edms_last_act') resetIdle(); });
    var c = document.getElementById('idleStay');
    if (c) c.addEventListener('click', resetIdle);
    resetIdle();
    return true;
  }
  /* ★enableIdle();   ← ★B-② 확인 후 이 줄의 주석을 해제하십시오 (지금은 꺼짐) */

  /* ── C절 비밀번호 보기 토글 — ★기존 계열 재사용 · 새 CSS 클래스 0 · 새 SVG 0(key 차용) */
  function pwToggle(id) {
    var i = document.getElementById(id); if (!i) return;
    if (i.getAttribute('data-eye') === '1') return;      /* 두 번 붙지 않게 */
    i.setAttribute('data-eye', '1');
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'nav-btn pw-eye';
    b.setAttribute('aria-label', '비밀번호 보기');
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = ico('key');                            /* ★ICONS 에 eye 가 없어 key 를 차용 */
    b.addEventListener('click', function () {
      var show = i.type === 'password';
      i.type = show ? 'text' : 'password';
      b.setAttribute('aria-pressed', show ? 'true' : 'false');
      b.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기');
    });
    i.insertAdjacentElement('afterend', b);
  }
  function pwHideAll() {   /* ★모달을 닫을 때 password 로 되돌립니다 */
    ['pwCur', 'pwNew', 'pwNew2'].forEach(function (id) {
      var i = document.getElementById(id); if (!i) return;
      i.type = 'password';
      var b = i.nextElementSibling;
      if (b && b.classList && b.classList.contains('pw-eye')) {
        b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', '비밀번호 보기');
      }
    });
  }

  function injectSharedModals() {
    if (document.getElementById('viewModal')) return;
    var html =
      '<div id="viewModal"><div class="modal-box"><div class="modal-head"><div class="t" id="modalTitle"></div><button id="modalClose">닫기</button></div>'
      + '<iframe id="modalFrame" title="문서 미리보기"></iframe><div id="pdfCanvasWrap" style="display:none;flex:1;overflow:auto;width:100%;background:#525659"></div></div></div>'
      + '<div id="reasonModal"><div class="pw-box"><div class="pw-head"><h3 id="reasonTitle">사유 입력</h3><button id="reasonCancel">닫기</button></div>'
      + '<div class="pw-body"><div class="pw-note" id="reasonGuide" style="margin-top:0"></div><label>사유 <b style="color:#c0392b">(필수)</b></label>'
      + '<textarea id="reasonText" style="width:100%;min-height:70px;padding:10px 12px;border:1.5px solid #d5dbe7;border-radius:7px;font-size:14px;font-family:inherit" placeholder="사유를 입력하세요"></textarea>'
      + '<button class="pw-submit" id="reasonOk">확인</button><div class="pw-msg" id="reasonMsg" style="color:#c0392b"></div></div></div></div>'
      + '<div id="pwModal"><div class="pw-box"><div class="pw-head"><h3>비밀번호 변경</h3><button id="pwClose">닫기</button></div>'
      + '<div class="pw-body"><label>현재 비밀번호</label><input type="password" id="pwCur" autocomplete="current-password">'
      + '<label>새 비밀번호</label><input type="password" id="pwNew" autocomplete="new-password">'
      + '<label>새 비밀번호 확인</label><input type="password" id="pwNew2" autocomplete="new-password">'
      + '<div class="pw-note">8자 이상, 영문과 숫자를 섞어 쓰시길 권장합니다. 변경 후 새 비밀번호로 다시 로그인하세요.</div>'
      + '<button class="pw-submit" id="pwSubmit">변경하기</button><div class="pw-msg" id="pwMsg"></div></div></div></div>';
    /* ★재인증·유휴 경고 모달 — ★기존 pw-box 계열을 그대로 씁니다(새 CSS 클래스 0) */
    html += '<div id="reauthModal"><div class="pw-box"><div class="pw-head"><h3>본인 확인</h3><button id="reauthCancel">닫기</button></div>'
      + '<div class="pw-body"><div class="pw-note" id="reauthWho" style="margin-top:0"></div>'
      + '<div class="pw-note" id="reauthWhy"></div>'
      + '<label>비밀번호</label><input type="password" id="reauthPw" name="reauth_pw" autocomplete="current-password">'
      + '<button class="pw-submit" id="reauthOk">확인</button><div class="pw-msg" id="reauthMsg"></div></div></div></div>'
      + '<div id="idleModal"><div class="pw-box"><div class="pw-head"><h3>자동 로그아웃</h3></div>'
      + '<div class="pw-body"><div class="pw-note" style="margin-top:0">1분 뒤 자동으로 로그아웃됩니다.</div>'
      + '<button class="pw-submit" id="idleStay">계속하기</button></div></div></div>';
    var d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d);
  }

  // ── 헤더(상호 이동 바) 렌더 ──  <header id="edmsHeader" data-system="docs|records|establish|gate">
  function mountHeader(ctx) {
    var el = document.getElementById('edmsHeader'); if (!el) return;
    var sysKey = el.getAttribute('data-system') || 'gate';
    if (sysKey === 'gate') {
      el.className = 'edms-nav gate';
      el.innerHTML = '<div class="nav-left"><h1>' + ico('home') + '뉴월드 EDMS</h1></div>'
        + '<div class="nav-right"><span>' + ico('user') + ' ' + esc(ctx.myName) + '</span>'
        + '<span class="role-badge ' + ctx.myRole + '">' + (ROLE_LABEL[ctx.myRole] || '일반') + '</span>'
        + '<button class="nav-btn" id="pwBtn">' + ico('key') + '비밀번호</button>'
        + '<button class="nav-btn" id="logoutBtn">' + ico('logout') + '로그아웃</button></div>';
    } else {
      var me = SYS[sysKey];
      // ★nav:false 인 키는 이동 바에서 뺀다(지시 20260817_03 §2-1) — 등재는 지금, 노출은 배포 후.
      //   화면이 없는 동안 버튼을 만들지 않기 위한 것이다(죽은 버튼 0).
      var others = Object.keys(SYS).filter(function (k) { return k !== sysKey && SYS[k].nav !== false; });
      var sw = others.map(function (k) { var o = SYS[k]; return '<a class="nav-btn sw-' + o.cls + '" href="' + o.file + '">' + ico('switch') + o.name + '</a>'; }).join('');
      el.className = 'edms-nav ' + me.cls;
      el.innerHTML = '<div class="nav-left"><div><div class="brand">뉴월드 EDMS</div><h1>' + ico(me.icon) + me.name + '</h1></div></div>'
        + '<div class="nav-right"><span>' + ico('user') + ' ' + esc(ctx.myName) + '</span>'
        + '<span class="role-badge ' + ctx.myRole + '">' + (ROLE_LABEL[ctx.myRole] || '일반') + '</span>'
        + sw
        + '<a class="nav-btn" href="index.html">' + ico('home') + '대문</a>'
        + '<button class="nav-btn" id="pwBtn">' + ico('key') + '비밀번호</button>'
        + '<button class="nav-btn" id="logoutBtn">' + ico('logout') + '로그아웃</button></div>';
    }
  }

  // ── 뷰어(PDF.js · 워터마크) — 공유 인프라 ──
  var _viewerBound = false;
  function bindViewer(ctx) {
    if (_viewerBound) return; _viewerBound = true;
    var modal = document.getElementById('viewModal'), frame = document.getElementById('modalFrame');
    if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';  // 로컬 vendor
    function closeModal() { modal.classList.remove('open'); frame.src = 'about:blank'; var w = document.getElementById('pdfCanvasWrap'); if (w) w.innerHTML = ''; }
    async function renderPdfJs(signedUrl) {
      var wrap = document.getElementById('pdfCanvasWrap');
      wrap.innerHTML = '<div style="color:#fff;padding:24px;text-align:center">불러오는 중...</div>';
      var sid6 = (ctx.session.user.id || '').slice(-6);
      var line1 = ctx.myName + ' · ' + ctx.session.user.email;
      var line2 = new Date().toLocaleString('ko-KR') + ' · ' + sid6;
      try {
        var pdf = await pdfjsLib.getDocument(signedUrl).promise; wrap.innerHTML = '';
        for (var p = 1; p <= pdf.numPages; p++) {
          var page = await pdf.getPage(p); var vp = page.getViewport({ scale: 1.3 });
          var canvas = document.createElement('canvas'); canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.cssText = 'display:block;margin:10px auto;max-width:100%;box-shadow:0 2px 10px rgba(0,0,0,.4)';
          var cx = canvas.getContext('2d');
          await page.render({ canvasContext: cx, viewport: vp }).promise;
          cx.save(); cx.globalAlpha = 0.14; cx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(); cx.font = '13px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
          cx.translate(canvas.width / 2, canvas.height / 2); cx.rotate(-Math.PI / 6);
          var tw = Math.max(cx.measureText(line1).width, cx.measureText(line2).width), xStep = tw + 120, yStep = 160, ext = Math.max(canvas.width, canvas.height);
          for (var y = -ext; y <= ext; y += yStep) for (var x = -ext; x <= ext; x += xStep) { cx.fillText(line1, x, y - 9); cx.fillText(line2, x, y + 9); }
          cx.restore(); wrap.appendChild(canvas);
        }
      } catch (e) { wrap.innerHTML = '<div style="color:#fff;padding:24px;text-align:center">미리보기를 불러오지 못했습니다.<br>' + escHtml(String(e && e.message || e)) + '</div>'; }
    }
    async function openViewer(num, title, docType, btn) {
      if (btn) btn.disabled = true;
      try {
        var r = await edmsClient.storage.from('documents').createSignedUrl('view/' + num + '.pdf', 300);
        if (r.error) { alert('열람본을 불러올 수 없습니다: ' + r.error.message); return; }
        document.getElementById('modalTitle').innerHTML = '<small>' + escHtml(num) + '</small> ' + escHtml(title || '');
        var wrap = document.getElementById('pdfCanvasWrap');
        if ((docType || '').startsWith('W-FR')) { wrap.style.display = 'none'; wrap.innerHTML = ''; frame.style.display = ''; frame.src = r.data.signedUrl; modal.classList.add('open'); }
        else { frame.style.display = 'none'; frame.src = 'about:blank'; wrap.style.display = ''; modal.classList.add('open'); await renderPdfJs(r.data.signedUrl); }
      } finally { if (btn) btn.disabled = false; }
    }
    function openPdfModal(num, title, signedUrl) {
      document.getElementById('modalTitle').innerHTML = '<small>' + escHtml(num) + '</small> ' + escHtml(title || '');
      frame.style.display = 'none'; frame.src = 'about:blank'; document.getElementById('pdfCanvasWrap').style.display = ''; modal.classList.add('open'); renderPdfJs(signedUrl);
    }
    document.getElementById('modalClose').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
    window.openViewer = openViewer; window.openPdfModal = openPdfModal; window.renderPdfJs = renderPdfJs;
  }

  // ── 공용 사유 입력(필수) ──
  function askReason(title, guide) {
    return new Promise(function (resolve) {
      var m = document.getElementById('reasonModal');
      document.getElementById('reasonTitle').textContent = title;
      document.getElementById('reasonGuide').textContent = guide;
      var ta = document.getElementById('reasonText'), msg = document.getElementById('reasonMsg'), ok = document.getElementById('reasonOk'), no = document.getElementById('reasonCancel');
      ta.value = ''; msg.textContent = ''; m.classList.add('open'); ta.focus();
      function done(v) { m.classList.remove('open'); ok.removeEventListener('click', onOk); no.removeEventListener('click', onNo); resolve(v); }
      function onOk() { var v = ta.value.trim(); if (!v) { msg.textContent = '사유를 입력해야 합니다(필수).'; ta.focus(); return; } done(v); }
      function onNo() { done(null); }
      ok.addEventListener('click', onOk); no.addEventListener('click', onNo);
    });
  }

  // ── 비밀번호 변경(헤더 유틸) ──
  function bindPw(ctx) {
    var pwBtn = document.getElementById('pwBtn'); if (!pwBtn) return;
    var pwModal = document.getElementById('pwModal');
    var closePw = function () { pwModal.classList.remove('open'); pwHideAll(); };   /* ★C절: 닫으면 숨김 복귀 */
    ['pwCur', 'pwNew', 'pwNew2'].forEach(pwToggle);                                  /* ★C절: 보기 토글 3칸 */
    pwBtn.addEventListener('click', function () { ['pwCur', 'pwNew', 'pwNew2'].forEach(function (id) { document.getElementById(id).value = ''; }); document.getElementById('pwMsg').textContent = ''; pwModal.classList.add('open'); });
    document.getElementById('pwClose').addEventListener('click', closePw);
    pwModal.addEventListener('click', function (e) { if (e.target === pwModal) closePw(); });
    document.getElementById('pwSubmit').addEventListener('click', async function () {
      var cur = document.getElementById('pwCur').value, n1 = document.getElementById('pwNew').value, n2 = document.getElementById('pwNew2').value, msg = document.getElementById('pwMsg');
      msg.className = 'pw-msg';
      if (!cur || !n1) { msg.className = 'pw-msg err'; msg.textContent = '현재 비밀번호와 새 비밀번호를 입력하세요.'; return; }
      if (n1.length < 8) { msg.className = 'pw-msg err'; msg.textContent = '새 비밀번호는 8자 이상이어야 합니다.'; return; }
      if (n1 !== n2) { msg.className = 'pw-msg err'; msg.textContent = '새 비밀번호 확인이 일치하지 않습니다.'; return; }
      var btn = document.getElementById('pwSubmit'); btn.disabled = true; msg.textContent = '처리 중...';
      var v = await edmsClient.auth.signInWithPassword({ email: ctx.session.user.email, password: cur });
      if (v.error) { msg.className = 'pw-msg err'; msg.textContent = '현재 비밀번호가 올바르지 않습니다.'; btn.disabled = false; return; }
      var u = await edmsClient.auth.updateUser({ password: n1 }); btn.disabled = false;
      if (u.error) { msg.className = 'pw-msg err'; msg.textContent = '변경 실패: ' + u.error.message; return; }
      msg.className = 'pw-msg ok'; msg.textContent = '변경되었습니다. 잠시 후 다시 로그인해 주세요.';
      setTimeout(async function () { await edmsClient.auth.signOut(); location.replace('login.html'); }, 1800);
    });
  }

  // ── 부트: 세션 → 프로필 → 헤더/모달/뷰어 → EDMS 노출 ──
  async function boot() {
    if (typeof edmsClient === 'undefined') { console.error('edms-config.js(edmsClient) 미로드'); return null; }
    var sess = await edmsClient.auth.getSession();
    var session = sess && sess.data && sess.data.session;
    if (!session) { location.replace('login.html'); return null; }
    var profile = null;
    try { var pr = await edmsClient.from('edms_profiles').select('name, role, dept').eq('id', session.user.id).maybeSingle(); profile = pr.data; } catch (e) { }
    var myRole = (profile && profile.role) || 'general';
    var myName = (profile && profile.name) || session.user.email;
    var myDept = (profile && profile.dept) || null;
    var isAdmin = myRole === 'admin';
    var isSuperOrig = false;
    try { var tr = await edmsClient.from('edms_transition').select('enabled, super_originator_id').maybeSingle(); isSuperOrig = !!(tr.data && tr.data.enabled && tr.data.super_originator_id === session.user.id); } catch (e) { }
    var ctx = { session: session, profile: profile, myRole: myRole, myName: myName, myDept: myDept, isAdmin: isAdmin, isSuperOrig: isSuperOrig, ROLE_LABEL: ROLE_LABEL, escHtml: escHtml, esc: esc, askReason: askReason, ico: ico, ICONS: ICONS, SYS: SYS };
    injectSharedModals();
    mountHeader(ctx);
    bindViewer(ctx);
    bindPw(ctx);
    var lg = document.getElementById('logoutBtn'); if (lg) lg.addEventListener('click', async function () { await edmsClient.auth.signOut(); location.replace('login.html'); });
    // 시스템 스크립트가 쓰는 전역 노출(포팅 코드가 bare 이름 사용)
    window.session = session; window.myRole = myRole; window.myName = myName; window.myDept = myDept;
    window.isAdmin = isAdmin; window.isSuperOrig = isSuperOrig; window.ROLE_LABEL = ROLE_LABEL;
    window.escHtml = escHtml; window.esc = esc; window.askReason = askReason;
    window.stepper = stepper;                    // ★공통 승격분(판정 20260816_15 §1)
    // ★M-017 기전 노출 — ★부르는 곳은 이번 회차에 0입니다(화면 연결은 다음 회차)
    window.reauth = reauth; window.hardLogout = hardLogout;
    Object.assign(window.EDMS, ctx);
    return ctx;
  }

  window.EDMS = { mountHeaderOnly: mountHeader, ico: ico, esc: esc, escHtml: escHtml, SYS: SYS, ROLE_LABEL: ROLE_LABEL, stepper: stepper,
    // ★M-017 — B-①/B-② 기전 · A-1/A-2/A-3
    markDirty: markDirty, clearDirty: clearDirty, isDirty: isDirty,
    startAutoSave: startAutoSave, stopAutoSave: stopAutoSave, lastAutoSavedAt: lastAutoSavedAt,
    reauth: reauth, hardLogout: hardLogout, enableIdle: enableIdle };
  window.EDMS.ready = boot();
})();
