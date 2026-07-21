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
  function ico(name, cls) { return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>'; }

  // ── 시스템 메타 (명칭 확정 · 이동 버튼 문구 "~으로" 생략) ──
  var SYS = {
    docs: { name: '문서관리 시스템', file: 'docs.html', cls: 'docs', icon: 'doc' },
    records: { name: '기록관리 시스템', file: 'records.html', cls: 'recs', icon: 'archive' },
    establish: { name: '문서양식 제정시스템', file: 'establish.html', cls: 'est', icon: 'stamp' }
  };
  // 역할 라벨/배지 — 원문 보존(회귀 방지). 임원=approver, 작성 권한자=reviewer 로 매핑.
  var ROLE_LABEL = { admin: '관리자', approver: '승인자', reviewer: '검토자', general: '일반' };

  var escHtml = function (s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var esc = function (s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };

  // ── 공유 모달 주입(뷰어 · 사유 입력 · 비밀번호) ── docs/records 공용
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
      var others = Object.keys(SYS).filter(function (k) { return k !== sysKey; });
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
          cx.save(); cx.globalAlpha = 0.14; cx.fillStyle = '#1F3864'; cx.font = '13px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
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
    var closePw = function () { pwModal.classList.remove('open'); };
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
    Object.assign(window.EDMS, ctx);
    return ctx;
  }

  window.EDMS = { mountHeaderOnly: mountHeader, ico: ico, esc: esc, escHtml: escHtml, SYS: SYS, ROLE_LABEL: ROLE_LABEL };
  window.EDMS.ready = boot();
})();
