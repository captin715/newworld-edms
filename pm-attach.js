/* ════════════════════════════════════════════════════════════════════
   프로젝트관리 실앱 v1 — ★붙임 파일 칸 부품 하나 (메모 MST2-20261027-509 · 의도 I139)
   · 1층 서류(S4 착수 승인서 · S5 결과 검증서 · S6 종료보고서) · 2층 게이트 승인 · 결재함이 ★같은 부품을 쓴다.
   · 저장소 = 버킷 documents(비공개) · 표 = pm_attachments.
       1층 : owner_kind 'ini_doc' · owner_ref = pm_initiative_docs.doc_id · initiative_code (project_code 비움)
             경로 pm/ini/<과제>/<서류>/<해시>.<확장자>
       2층 : owner_kind '결재' · owner_ref = approval_id · project_code
             경로 pm/<프로젝트>/<결재>/<해시>.<확장자> (pmUploadGateFile 과 같은 꼴)
   · ★지우지 않는다 — 「지움」 = 철회(status '철회' + 사유). 작성중일 때만 · 상신 뒤에는 DB 가드가 막는다.
   · ★보안 등급 기본 2 · 4등급(내부 단가 · 원가 P4)은 고르지 못한다(DB 가드도 막는다).
   · ★열기 = 서명된 짧은 주소(60초) · 주소를 저장하지 않는다.
   · ★해시는 브라우저가 파일에서 계산한다 — 사람이 적지 않는다.
   쓰는 법 :
     PmAttach.mount(el, { kind:'ini_doc', initiative_code, ownerRef, editable, canWrite, ensureOwner })
     PmAttach.mount(el, { kind:'결재', project_code, ownerRef, editable, canWrite, onChange })
   ════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var BUCKET = 'documents';
  var MAX_BYTES = 52428800;               /* 50MB — DB 가드와 같은 값 */
  var LEVELS = [1, 2, 3];                 /* 4(P4)는 없음 */
  var DEFAULT_LEVEL = 2;
  /* ★edms-config.js 의 const edmsClient 는 window 속성이 아님 — 맨 이름으로 찾는다 (10/27 운영 오류 「reading 'from'」 고침) */
  function cli() {
    if (typeof edmsClient !== 'undefined' && edmsClient) return edmsClient;
    if (root.edmsClient) return root.edmsClient;
    throw new Error('[붙임] EDMS 연결(edmsClient)을 찾지 못했습니다 — edms-config.js 를 먼저 불러야 합니다.');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function size(n) {
    if (n == null) return '크기 모름';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  async function err(where, e) {
    if (typeof root.pmErr === 'function') return root.pmErr(where, e);
    var x = new Error('[' + where + '] ' + (e && e.message ? e.message : String(e))); x.pgCode = e && e.code; return x;
  }
  async function sha256(file) {
    var buf = await file.arrayBuffer();
    var d = await root.crypto.subtle.digest('SHA-256', buf);
    return Array.prototype.map.call(new Uint8Array(d), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  async function userId() {
    var s = await cli().auth.getSession();
    var u = s && s.data && s.data.session && s.data.session.user;
    if (!u || !u.id) throw new Error('[붙임] 로그인 세션이 없습니다 — 파일을 붙일 수 없습니다.');
    return u.id;
  }
  function extOf(name) { var i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; }

  /* ── 자료 길 (화면 없이도 부를 수 있게 따로 둠 — 시험이 이 함수들을 직접 부른다) ── */
  async function list(o) {
    if (!o.ownerRef) return [];
    var q = cli().from('pm_attachments')
      .select('attachment_id,project_code,initiative_code,owner_kind,owner_ref,seq,file_name,storage_path,'
            + 'file_hash,file_size,file_ext,security_level,source,status,withdraw_reason,created_at')
      .eq('owner_kind', o.kind).eq('owner_ref', String(o.ownerRef));
    q = o.kind === 'ini_doc' ? q.eq('initiative_code', o.initiative_code) : q.eq('project_code', o.project_code);
    var r = await q.order('seq', { ascending: true });
    if (r.error) throw await err('pm_attachments(읽기)', r.error);
    return r.data || [];
  }
  function pathOf(o, hash, ext) {
    var tail = hash + (ext ? '.' + ext : '');
    return o.kind === 'ini_doc'
      ? 'pm/ini/' + o.initiative_code + '/' + o.ownerRef + '/' + tail
      : 'pm/' + o.project_code + '/' + o.ownerRef + '/' + tail;
  }
  async function upload(o, file, level, seq) {
    if (file.size > MAX_BYTES) throw new Error('[붙임] ' + file.name + ' 은 ' + size(file.size) + ' — 50MB 까지 붙일 수 있습니다.');
    var lv = Number(level || DEFAULT_LEVEL);
    if (LEVELS.indexOf(lv) < 0) throw new Error('[붙임] 보안 등급은 1 · 2 · 3 가운데 하나입니다 — 4등급(내부 단가 · 원가)은 붙이지 않습니다.');
    var hash = await sha256(file), ext = extOf(file.name), path = pathOf(o, hash, ext);
    var up = await cli().storage.from(BUCKET).upload(path, file,
      { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (up.error && !/exists|duplicate/i.test(String(up.error.message || ''))) throw await err('storage.documents(올리기)', up.error);
    var row = {
      owner_kind: o.kind, owner_ref: String(o.ownerRef), seq: seq, file_name: file.name, storage_path: path,
      file_hash: hash, file_size: file.size, file_ext: ext || null, security_level: lv, source: '내부제작',
      registered_by: await userId()
    };
    if (o.kind === 'ini_doc') { row.initiative_code = o.initiative_code; row.project_code = null; }
    else row.project_code = o.project_code;
    var r = await cli().from('pm_attachments').insert(row).select().single();
    if (r.error) throw await err('pm_attachments(넣기)', r.error);
    return r.data;
  }
  async function withdraw(id, reason) {
    var r = await cli().from('pm_attachments')
      .update({ status: '철회', withdraw_reason: reason || '작성 중 지움' })
      .eq('attachment_id', id).select().single();
    if (r.error) throw await err('pm_attachments(지움)', r.error);
    return r.data;
  }
  async function openUrl(path) {
    var r = await cli().storage.from(BUCKET).createSignedUrl(path, 60);
    if (r.error) throw await err('storage.documents(열기)', r.error);
    return r.data && r.data.signedUrl;
  }

  /* ── 모양 (본문 15~16px · 390 폭에서 줄바꿈 · 그림 글자 없음) ── */
  function css() {
    if (root.document.getElementById('pa-css')) return;
    var s = root.document.createElement('style'); s.id = 'pa-css';
    s.textContent = '.pa{margin:16px 0;padding:12px 14px;border:1px solid #d5dbe5;border-radius:8px;background:#fafbfd;font-size:15px}'
      + '.pa h3{margin:0 0 6px;font-size:16px}.pa .pa-hint{color:#555;margin:0 0 8px}'
      + '.pa-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px 0;border-top:1px solid #e5e9f0}'
      + '.pa-row .pa-n{min-width:2em;color:#666}.pa-row .pa-f{flex:1 1 200px;word-break:break-all;font-weight:600}'
      + '.pa-row .pa-m{color:#555}.pa-add{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}'
      + '.pa-add input[type=file]{max-width:100%;font-size:15px}.pa-add select{font-size:15px}'
      + '.pa-msg{margin-top:8px}.pa-ok{color:#1565c0}.pa-bad{color:#c62828}.pa-wait{color:#e65100}'
      + '.pa-empty{color:#666;padding:6px 0}';
    root.document.head.appendChild(s);
  }

  function mount(el, o) {
    css();
    var ST = { rows: [], busy: false };
    var writable = function () { return !!(o.editable && o.canWrite !== false); };
    function say(t, cls) {
      var m = el.querySelector('.pa-msg');
      if (m) m.innerHTML = t ? '<span class="' + (cls || 'pa-ok') + '">' + t + '</span>' : '';
    }
    function draw() {
      var live = ST.rows.filter(function (a) { return a.status === '유효'; });
      var gone = ST.rows.length - live.length;
      var h = '<h3>붙임 파일 <span class="pa-m">' + live.length + '건</span></h3>';
      h += '<p class="pa-hint">' + (writable()
          ? '기획서 · 근거 자료를 여기에 붙입니다. 여러 파일을 한꺼번에 고를 수 있고, 한 파일은 50MB 까지입니다.'
          : (o.editable ? '<span class="pa-wait">⏸ 붙일 권한이 없는 계정입니다 — 목록과 열기만 됩니다.</span>'
                        : '✔ 상신한 서류라 붙임은 읽기 전용입니다 — 열기만 됩니다.')) + '</p>';
      if (!live.length) h += '<div class="pa-empty">붙인 파일이 없습니다.</div>';
      live.forEach(function (a, i) {
        h += '<div class="pa-row" data-id="' + esc(a.attachment_id) + '">'
          + '<span class="pa-n">' + (i + 1) + '</span>'
          + '<span class="pa-f">' + esc(a.file_name) + '</span>'
          + '<span class="pa-m">' + size(a.file_size) + ' · 보안 ' + esc(a.security_level) + '등급</span>'
          + '<button type="button" class="btn" data-open="' + esc(a.storage_path) + '">열기</button>'
          + (writable() ? '<button type="button" class="btn ghost" data-del="' + esc(a.attachment_id) + '">지움</button>' : '')
          + '</div>';
      });
      if (gone) h += '<div class="pa-m">지운 파일 ' + gone + '건은 기록으로 남아 있습니다(목록에서만 뺌).</div>';
      if (writable()) {
        h += '<div class="pa-add"><input type="file" multiple aria-label="붙일 파일 고르기">'
          + '<label>보안 등급 <select aria-label="보안 등급">'
          + LEVELS.map(function (l) { return '<option value="' + l + '"' + (l === DEFAULT_LEVEL ? ' selected' : '') + '>' + l + '등급' + (l === DEFAULT_LEVEL ? ' (기본)' : '') + '</option>'; }).join('')
          + '</select></label>'
          + '<button type="button" class="btn primary" data-up="1">붙이기</button></div>';
      }
      h += '<div class="pa-msg"></div>';
      el.innerHTML = '<section class="pa">' + h + '</section>';
      bind();
    }
    async function refresh() {
      try { ST.rows = await list(o); draw(); }
      catch (e) { ST.rows = []; draw(); say('⚠ 붙임 목록을 읽지 못했습니다 — 「없음」이 아니라 「모름」입니다. ' + esc(e.message), 'pa-bad'); }
      if (o.onChange) o.onChange(ST.rows.filter(function (a) { return a.status === '유효'; }).length);
      return ST.rows;
    }
    function bind() {
      Array.prototype.forEach.call(el.querySelectorAll('button[data-open]'), function (b) {
        b.onclick = async function (ev) {
          ev.stopPropagation();
          try { var u = await openUrl(b.getAttribute('data-open')); root.open(u, '_blank'); }
          catch (e) { say('⚠ 파일을 열지 못했습니다. ' + esc(e.message), 'pa-bad'); }
        };
      });
      Array.prototype.forEach.call(el.querySelectorAll('button[data-del]'), function (b) {
        b.onclick = async function () {
          if (ST.busy) return;
          if (root.confirm && !root.confirm('이 파일을 붙임에서 뺄까요? (기록은 남습니다)')) return;
          ST.busy = true; say('▶ 빼는 중…', 'pa-wait');
          try { await withdraw(b.getAttribute('data-del')); ST.busy = false; await refresh(); say('✔ 뺐습니다.'); }
          catch (e) { ST.busy = false; say('⚠ 빼지 못했습니다 — DB 가 막은 글 그대로 : ' + esc(e.message), 'pa-bad'); }
        };
      });
      var up = el.querySelector('button[data-up]');
      if (up) up.onclick = async function () {
        if (ST.busy) return;
        var files = el.querySelector('input[type=file]').files, lv = el.querySelector('select').value;
        if (!files || !files.length) { say('⏸ 붙일 파일을 먼저 고르십시오.', 'pa-wait'); return; }
        ST.busy = true; up.disabled = true;
        try {
          if (!o.ownerRef) {
            if (!o.ensureOwner) throw new Error('[붙임] 붙일 자리(서류 · 결재)가 아직 없습니다 — 먼저 저장하십시오.');
            say('▶ 서류를 먼저 임시 저장하는 중…', 'pa-wait');
            o.ownerRef = String(await o.ensureOwner());
          }
          var seq = ST.rows.reduce(function (m, a) { return Math.max(m, a.seq || 0); }, 0), n = 0;
          for (var i = 0; i < files.length; i++) {
            say('▶ ' + (i + 1) + ' / ' + files.length + ' 올리는 중 — ' + esc(files[i].name), 'pa-wait');
            await upload(o, files[i], lv, ++seq); n++;
          }
          ST.busy = false; await refresh(); say('✔ ' + n + '건을 붙였습니다.');
        } catch (e) {
          ST.busy = false; await refresh();
          say('⚠ 붙이지 못했습니다 — 막은 글 그대로 : ' + esc(e.message), 'pa-bad');
        }
      };
    }
    draw();
    refresh();
    return { refresh: refresh, rows: function () { return ST.rows.slice(); }, opts: o };
  }

  root.PmAttach = { mount: mount, list: list, upload: upload, withdraw: withdraw, openUrl: openUrl, pathOf: pathOf,
                    MAX_BYTES: MAX_BYTES, LEVELS: LEVELS, DEFAULT_LEVEL: DEFAULT_LEVEL,
                    INI_DOC_TYPES: ['과제 착수 승인서', '결과 검증서', '종료보고서'] };
})(typeof window !== 'undefined' ? window : globalThis);
