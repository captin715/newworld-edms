/* ════════════════════════════════════════════════════════════════════
   프로젝트관리 실앱 v1 — 조회 계층
   · 화면은 이 파일의 함수만 부른다. 화면에서 직접 SQL/REST 를 부르지 않는다.
   · ★DB 쓰기 없음(SHALL NOT). SELECT 만.
   · ★접속 설정을 여기 적지 않는다 — 배포본 edms-config.js 의 edmsClient 를 그대로 쓴다.
     (URL·키는 이 파일에 없다. 화면이 edms-config.js 를 먼저 로드한다)
   · 반환 형태는 목업 assets/data.js 의 PM_* 상수와 같은 모양이다.
     화면 코드를 그대로 쓰기 위함.
   ════════════════════════════════════════════════════════════════════ */

/* ── 실패를 감추지 않는다 ──────────────────────────────────────────────
   RLS 는 권한이 없으면 「오류」가 아니라 「0행」으로 답할 수 있다.
   0행이 ①정말 없어서인지 ②권한이 없어서인지 구분하지 못하면 화면이 거짓말을 한다.
   그래서 오류 객체에 세션 상태를 실어 올린다.                              */
async function pmErr(where, error) {
  var authed = false, who = null, detail = null;
  try {
    var s = await edmsClient.auth.getSession();
    authed = !!(s && s.data && s.data.session);
    who = authed ? (s.data.session.user && s.data.session.user.email) || '(이메일 없음)' : null;
  } catch (e) { detail = String(e); }
  var err = new Error('[' + where + '] ' + (error ? (error.message || String(error)) : '조회 실패'));
  err.where = where;
  err.authed = authed;          // ★false = 로그인 세션 없음 → anon 역할
  err.who = who;
  err.pgCode = error && error.code ? error.code : null;
  err.detail = detail;
  return err;
}

/* ════════════════════════════════════════════════════════════════════
   ★§4 「비어 있음」 3구별 — A 권한없음 / B 데이터없음 / C 값미입력
   셋을 같은 빈 화면으로 그리면 거짓말이 된다.
   ════════════════════════════════════════════════════════════════════ */
var PM_MSG = {
  A_TITLE : '로그인이 필요합니다',
  A_BODY  : '조회 권한은 로그인한 사용자에게만 열립니다. '
          + '지금은 anon 역할이라 서버가 요청을 거부했습니다 — 데이터가 없는 것이 아닙니다.',
  B_EMPTY : '등재된 항목이 없습니다',
  C_NULL  : '미입력',
  C_DATE  : '미정'
};

/* 오류가 「권한(A)」인지 판정 — 401/403/42501 또는 세션 없음 */
function pmIsAuthProblem(e) {
  if (!e) return false;
  if (e.authed === false) return true;
  var c = String(e.pgCode || '');
  if (c === '42501' || c === 'PGRST301' || c === '401' || c === '403') return true;
  return /permission denied|JWT|not authenticated|401|403/i.test(String(e.message || ''));
}

/* A/B/C 를 한 곳에서 그린다. 화면마다 다르게 쓰면 어긋난다. */
function pmStateBox(kind, e, whatEmpty) {
  if (kind === 'A') {
    return '<div class="banner crit"><b>' + PM_MSG.A_TITLE + '</b><br>' + PM_MSG.A_BODY
         + (e && e.message ? '<br><code>' + pmEsc(e.message) + '</code>' : '')
         + (e && e.pgCode ? ' <code>' + pmEsc(e.pgCode) + '</code>' : '')
         + '<br>세션 : <b>' + (e && e.authed ? pmEsc(e.who) : '없음(anon)') + '</b></div>';
  }
  if (kind === 'B') {
    return '<div class="empty-state"><span class="ic">·</span>'
         + PM_MSG.B_EMPTY + (whatEmpty ? ' — ' + pmEsc(whatEmpty) : '') + '</div>';
  }
  return '';
}
function pmEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
/* C 값 미입력 — ★빈칸으로 두지 않는다. 날짜는 「미정」, 그 밖은 「미입력」 */
function pmVal(v)  { return (v === null || v === undefined || v === '') ? '<span class="masked">' + PM_MSG.C_NULL + '</span>' : pmEsc(v); }
function pmDate(v) { return (v === null || v === undefined || v === '') ? '<span class="masked">' + PM_MSG.C_DATE + '</span>' : pmEsc(v); }

/* ── 유형 문자(D·G) → 이름(개발·일반) ─────────────────────────────── */
async function pmTypeMap() {
  var r = await edmsClient.from('pm_project_types').select('type_char,type_name');
  if (r.error) throw await pmErr('pm_project_types', r.error);
  var m = {};
  (r.data || []).forEach(function (t) { m[t.type_char] = t.type_name; });
  return m;
}

/* ── ① 프로젝트 대장 ─────────────────────────────────────────────────
   ★M-005: 성립요건은 2요건(부속서·PG0). 「코드 채번」은 열로 두지 않는다.
     미채번(KOLAS)은 대장 밖이다(마스터 판정 20260815_17 §1).                */
/* ★폐기보관(2026-08-24 부대표 승인) — archived_at 이 있는 행은 대장에서 뺀다.
   ★지운 것이 아니다. 폐기보관함(pmFetchArchivedProjects)에서 읽기 전용으로 본다. */
async function pmFetchProjects() {
  var r = await edmsClient
    .from('pm_projects')
    .select('project_code,project_name,type_char,status,lifecycle_phase,current_gate,'
          + 'planned_start,planned_end,actual_start,actual_end,baseline_fixed_at,'
          + 'owner,owner_dept,annex_doc_no,pg0_approved_at,critical_path,'
          + 'hold_reason,resume_condition,remark')
    .is('archived_at', null)
    .order('project_code', { ascending: true });
  if (r.error) throw await pmErr('pm_projects', r.error);

  var types = await pmTypeMap();
  var CLOSED = ['완료종료', '중도종결', '실패종료'];

  return (r.data || []).map(function (p) {
    return {
      project_code : p.project_code,
      project_name : p.project_name,
      type         : types[p.type_char] || p.type_char,
      dept         : p.owner_dept || null,
      lifecycle    : p.lifecycle_phase || null,
      status       : p.status,
      gate         : p.current_gate || null,
      start        : p.planned_start || null,     // ★C-44 : 확인 안 된 날짜는 빈 값 그대로
      end          : p.planned_end   || null,
      actual_start : p.actual_start || null,
      actual_end   : p.actual_end   || null,
      baseline_at  : p.baseline_fixed_at || null,
      owner        : p.owner || null,             // ★담당자 — 게이트 결재선의 「작성」
      req_annex    : p.annex_doc_no    !== null && p.annex_doc_no    !== undefined,
      req_pg0      : p.pg0_approved_at !== null && p.pg0_approved_at !== undefined,
      annex_no     : p.annex_doc_no || null,
      pg0_at       : p.pg0_approved_at || null,
      critical     : p.critical_path || null,
      hold_reason  : p.hold_reason || null,
      resume_cond  : p.resume_condition || null,
      closed       : CLOSED.indexOf(p.status) >= 0,
      note         : p.remark || ''
    };
  });
}

/* ── ①-2 ★폐기보관함 (읽기 전용) ─────────────────────────────────────
   ★대장에서 내려온 것만 본다. 되살리기는 이 파일에 두지 않는다(쓰기 아님). */
async function pmFetchArchivedProjects() {
  var r = await edmsClient
    .from('pm_projects')
    .select('project_code,project_name,status,current_gate,archived_at,archive_reason')
    .not('archived_at', 'is', null)
    .order('project_code', { ascending: true });
  if (r.error) throw await pmErr('pm_projects(폐기보관함)', r.error);
  return r.data || [];
}

/* ── ② 성립요건 뷰 (5열 · security_invoker = on) ────────────────────── */
async function pmFetchReadiness() {
  var r = await edmsClient
    .from('pm_v_project_readiness')
    .select('project_code,project_name,has_annex,has_pg0,requirement_unmet')
    .order('project_code', { ascending: true });
  if (r.error) throw await pmErr('pm_v_project_readiness', r.error);
  return r.data || [];
}

/* ── ③ 게이트 정의 ───────────────────────────────────────────────────
   ★reviewer 는 M-007 apply 후에 생긴다. 없으면 없이, 있으면 쓰도록 방어적으로.
     PostgREST 는 없는 열을 요청하면 42703 을 돌려준다 — 그때 한 번만 재시도한다. */
async function pmFetchGateDefs() {
  var COLS_NEW = 'gate_code,seq,gate_name,approver,reviewer,risk_level,is_ceo_authority';
  var COLS_OLD = 'gate_code,seq,gate_name,approver,risk_level,is_ceo_authority';
  var r = await edmsClient.from('pm_gate_defs').select(COLS_NEW).order('seq', { ascending: true });
  var hasReviewer = true;
  if (r.error && (String(r.error.code) === '42703' || /reviewer/.test(String(r.error.message || '')))) {
    hasReviewer = false;
    r = await edmsClient.from('pm_gate_defs').select(COLS_OLD).order('seq', { ascending: true });
  }
  if (r.error) throw await pmErr('pm_gate_defs', r.error);
  var out = (r.data || []).map(function (g) {
    return {
      gate_code : g.gate_code,
      seq       : g.seq,
      gate_name : g.gate_name,
      approver  : g.approver,
      reviewer  : hasReviewer ? (g.reviewer || null) : null,
      risk      : g.risk_level,
      ceo_only  : g.is_ceo_authority
    };
  });
  out.hasReviewer = hasReviewer;   /* 화면이 열을 넣을지 판단할 근거 */
  return out;
}

/* ── ④ 태스크(간트) ──────────────────────────────────────────────────
   ★정렬은 sort_order. wbs 문자열 정렬은 1.10 이 1.2 앞에 온다.                */
async function pmFetchTasks(projectCode) {
  var q = edmsClient.from('pm_tasks')
    .select('task_id,project_code,wbs,wbs_level,sort_order,task_name,lifecycle_phase,gate_code,'
          + 'is_critical,task_kind,wait_kind,waiting_on,planned_start,planned_end,'
          + 'actual_start,actual_end,planned_effort,actual_effort,owner,progress,remark');
  if (projectCode) q = q.eq('project_code', projectCode);
  var r = await q.order('sort_order', { ascending: true });
  if (r.error) throw await pmErr('pm_tasks', r.error);
  return r.data || [];
}

/* ── ⑤ 프로젝트별 게이트 인스턴스(보드 셀) ──────────────────────────── */
async function pmFetchProjectGates(projectCode) {
  var q = edmsClient.from('pm_project_gates')
    .select('gate_instance_id,project_code,gate_code,native_gate_name,is_subgate,parent_gate_code,'
          + 'approver_type,status,planned_date,passed_at,approver,approval_ref,evidence_ref,open_items');
  if (projectCode) q = q.eq('project_code', projectCode);
  var r = await q.order('project_code', { ascending: true });
  if (r.error) throw await pmErr('pm_project_gates', r.error);
  return r.data || [];
}

/* ── ⑤-1 산출물 ↔ 기록 (상세 화면) ───────────────────────────────────
   ★status 값역 = Draft · 승인 · 보관 · 발번불요
     Draft 를 정본처럼 보이게 하지 않는다(CES_수행창 요청 · 지시 §3-3).
   ★「미발번」(mgmt_no 없음)과 「원고」(status=Draft)는 다른 축이다 — 합치지 않는다. */
async function pmFetchRecords(projectCode) {
  var q = edmsClient.from('pm_records')
    .select('record_id,project_code,fr_type,title,doc_no,mgmt_no,status,'
          + 'gate_instance_id,file_path,file_format,authoring_mode,approved_at,archived_at');
  if (projectCode) q = q.eq('project_code', projectCode);
  var r = await q.order('fr_type', { ascending: true });
  if (r.error) throw await pmErr('pm_records', r.error);
  return r.data || [];
}

/* pm_records.status → 화면 표기 (지시 §3-3 문면 그대로) */
/* ★2026-08-20 시정 — A3 apply 로 값역이 ★기록 축으로 바뀌었다(M-011).
   구판 'Draft'·'발번불요' 는 ★DB 에 더 이상 들어올 수 없다.
   구판 키를 지우지 않고 남겨 둔다 — ★남아 있으면 화면이 알려 주기 위해서다. */
var PM_REC_STATUS = {
  '작성중'  : { label:'원고 · 검토 전', cls:'req-no'   },   /* ★정본 아님 */
  '검토중'  : { label:'검토 중',        cls:'req-part' },
  '승인'    : { label:'정본',           cls:'req-ok'   },
  '반려'    : { label:'반려',           cls:'req-no'   },
  '보관'    : { label:'보관',           cls:'plv-1'    },
  /* ↓ ★구판(M-011 이전). DB 값역에서 사라졌으므로 보이면 ★이상 신호다 */
  'Draft'   : { label:'★구판 Draft — 값역 이탈', cls:'req-no' },
  '발번불요': { label:'★구판 발번불요 — 값역 이탈', cls:'req-no' }
};
function pmRecStatus(s) {
  var m = PM_REC_STATUS[s];
  if (!m) return '<span class="req-ic req-part">' + pmVal(s) + '</span>';
  return '<span class="req-ic ' + m.cls + '">' + m.label + '</span>';
}
/* 관리번호 — ★「미발번」은 원고 여부와 별개 축 */
function pmMgmtNo(v) {
  return (v === null || v === undefined || v === '')
    ? '<span class="rec-lock">미발번</span>' : pmEsc(v);
}

/* ── ⑥ 개발형 게이트 판정 뷰 — ★표시 전용 ───────────────────────────
   화면은 통과 여부를 계산하지 않는다(SHALL NOT). 이 뷰가 준 값만 보인다.       */
async function pmFetchGateDPass() {
  var r = await edmsClient.from('pm_v_gate_d_pass')
    .select('project_code,gate_code,seq,passed,reason')
    .order('project_code', { ascending: true })
    .order('gate_code',    { ascending: true })
    .order('seq',          { ascending: true });
  if (r.error) throw await pmErr('pm_v_gate_d_pass', r.error);
  return r.data || [];
}

/* ── ⑦ 연결 (N:N 1급 개념 — 방향을 반드시 드러낸다) ─────────────────── */
async function pmFetchLinks() {
  var r = await edmsClient.from('pm_project_links')
    .select('link_id,from_project,to_project,link_type,note');
  if (r.error) throw await pmErr('pm_project_links', r.error);
  return (r.data || []).map(function (l) {
    return { link_id:l.link_id, from:l.from_project, to:l.to_project,
             link_type:l.link_type, note:l.note || '' };
  });
}

/* ── ⑧ 마일스톤 ──────────────────────────────────────────────────────
   ★현재 0행. 없으면 화면이 마일스톤 축을 그리지 않는다(축을 만들어 내지 않는다). */
async function pmFetchMilestones(projectCode) {
  var q = edmsClient.from('pm_milestones')
    .select('milestone_id,project_code,name,kind,due_date,gate_instance_id,status,source_ref');
  if (projectCode) q = q.eq('project_code', projectCode);
  var r = await q.order('due_date', { ascending: true });
  if (r.error) throw await pmErr('pm_milestones', r.error);
  return r.data || [];
}

/* ── ⑨ ★D-7 게이트 정합 검사 (뷰가 정본 · 판정 MST2-20260818_15 §5) ──
   ★화면은 verdict 를 ★그대로 표시한다. 손으로 다시 세지 않는다. */
async function pmFetchGateConsistency() {
  var r = await edmsClient.from('pm_v_gate_consistency')
    .select('project_code,project_status,current_gate,gate_rows,subgate_rows,'
          + 'issue_count,verdict,issues')
    .order('project_code', { ascending: true });
  if (r.error) throw await pmErr('pm_v_gate_consistency', r.error);
  return r.data || [];
}

/* ── ⑩ ★결재 상세 (㉰ 열람) — 본문 경로·첨부 수·보안등급·내 차례 ──── */
async function pmFetchApprovalDetail(projectCode) {
  var q = edmsClient.from('pm_v_approval_detail')
    .select('approval_id,project_code,project_name,entity_type,entity_ref,title,status,'
          + 'drafter_name,reviewer_name,approver_name,review_comment,approve_comment,reject_reason,'
          + 'drafted_at,submitted_at,reviewed_at,approved_at,body_path,n_attach,max_security,my_turn,'
          /* ★2026-08-31 결함 시정 — ★없는 열 셋을 달라고 해서 이 조회가 ★언제나 실패했습니다.
             실측 : pm_v_approval_detail 에 axis_code · axis_source · unchecked_notes 가 ★없습니다.
                    (information_schema 전수 조회 · 0건)
             ★뜻   결재 목록이 뜬 적이 없습니다. 화면은 목록 대신 오류를 보였습니다.
                    ★결함 13 「결재함이 빈 채로 선다」의 남은 원인이 이것입니다.
             ★그 셋은 판정 MST2-20260822_92 §1 이 「뷰에 담자」 한 것인데 ★아직 안 담겼습니다.
                    담기면 다시 넣습니다 — ★지금은 없는 것을 달라고 하지 않습니다.
             ★대신 뷰에 ★있는 것을 가져옵니다 — initiative_code · tier · owner_code · owner_name.
                    이것이 있어야 ★1층 과제 건도 한 자리에서 보입니다. */
          + 'initiative_code,initiative_name,tier,owner_code,owner_name');
  if (projectCode) q = q.eq('project_code', projectCode);
  var r = await q.order('drafted_at', { ascending: false });
  if (r.error) throw await pmErr('pm_v_approval_detail', r.error);
  return r.data || [];
}

/* ── ⑪ ★첨부 (㉯) — ★철회분도 함께 읽는다. 숨기면 왜 빠졌는지 알 수 없다 ── */
async function pmFetchAttachments(projectCode, ownerKind, ownerRef) {
  var q = edmsClient.from('pm_v_attachments')
    .select('attachment_id,project_code,owner_kind,owner_ref,owner_title,seq,file_name,'
          + 'storage_path,file_hash,file_size,security_level,source,external_from,'
          + 'status,withdraw_reason,registered_by,created_at');
  if (projectCode) q = q.eq('project_code', projectCode);
  if (ownerKind)   q = q.eq('owner_kind', ownerKind);
  if (ownerRef)    q = q.eq('owner_ref', ownerRef);
  var r = await q.order('seq', { ascending: true });
  if (r.error) throw await pmErr('pm_v_attachments', r.error);
  return r.data || [];
}

/* ★미리보기 — private 버킷이므로 ★서명 URL 을 그때그때 받는다. 주소를 저장하지 않는다. */
async function pmSignedUrl(storagePath, sec) {
  var r = await edmsClient.storage.from('documents').createSignedUrl(storagePath, sec || 60);
  if (r.error) throw await pmErr('storage.documents', r.error);
  return r.data && r.data.signedUrl;
}

/* ── 공통 : 세션 배지 채우기 (화면 3본이 같은 방식을 쓴다) ───────────── */
async function pmFillSession() {
  var authed = false, who = '로그인 세션 없음';
  try {
    var s = await edmsClient.auth.getSession();
    authed = !!(s && s.data && s.data.session);
    if (authed) who = s.data.session.user.email || '로그인됨';
  } catch (e) { /* 표시만 */ }
  var w = document.getElementById('who');
  var b = document.getElementById('roleBadge');
  if (w) w.textContent = who;
  if (b) { b.textContent = authed ? 'authenticated' : 'anon';
           b.className = 'role-badge ' + (authed ? 'admin' : 'general'); }
  return authed;
}

/* ════════════════════════════════════════════════════════════════════
   ★1층 과제(INI) 조회 — 화면정의서 V3.2 S1·S2·S3
   · 여기도 SELECT 전용이다. 쓰기는 pm-write.js.
   ════════════════════════════════════════════════════════════════════ */

/* 부서 기준표 4값 — S1 ③ 주관 부서 선택칸 */
async function pmFetchDeptCodes() {
  var r = await edmsClient.from('pm_dept_codes')
    .select('dept_char,dept_name,legacy_code,active')
    .eq('active', true)
    .order('dept_char', { ascending: true });
  if (r.error) throw await pmErr('pm_dept_codes', r.error);
  return r.data || [];
}

/* S1 ④ 담당자 — ★이 부서 사람만.
   ★두 표기가 다르다 : pm_dept_codes.dept_char 는 1글자(Q), edms_profiles.dept_code 는 2글자(QT).
     legacy_code 가 그 다리다. 화면이 임의로 「Q + T」를 만들지 않는다.
   ★0명일 수 있다(개발팀 D). 그때 「없음」과 「권한없음」을 섞지 않는다 — 호출한 쪽이 구별한다. */
async function pmFetchPeopleOfDept(legacyCode) {
  var q = edmsClient.from('edms_profiles').select('id,name,role,dept_code,is_exec,is_ceo');
  if (legacyCode) q = q.eq('dept_code', legacyCode);
  var r = await q.order('name', { ascending: true });
  if (r.error) throw await pmErr('edms_profiles(dept)', r.error);
  return r.data || [];
}

/* S1 ⑩ 번호 미리보기 — ★시퀀스를 소비하지 않는 전용 함수를 부른다.
   ★pm_next_initiative_code 를 부르면 미리보기만 해도 번호가 탄다(실측 확인). */
async function pmPeekInitiativeCode(deptChar) {
  var r = await edmsClient.rpc('pm_peek_initiative_code', { p_dept: deptChar });
  if (r.error) throw await pmErr('pm_peek_initiative_code', r.error);
  return r.data;
}

/* S2 과제 대장 · S3 과제 상세 */
async function pmFetchInitiatives() {
  var r = await edmsClient.from('pm_initiatives')
    .select('initiative_code,initiative_name,owner_dept_char,owner,origin,'
          + 'req_over_1month,req_separate_budget,req_multi_dept,req_met,'
          + 'decision,decision_basis,decision_at,decision_by,output_handling,'
          + 'repeat_group_key,repeat_count,status,ceo_start_approved_at,ceo_end_approved_at,'
          + 'remark,created_by,created_at')
    .order('initiative_code', { ascending: false });
  if (r.error) throw await pmErr('pm_initiatives', r.error);
  return r.data || [];
}

async function pmFetchInitiative(code) {
  var r = await edmsClient.from('pm_initiatives')
    .select('initiative_code,initiative_name,owner_dept_char,owner,origin,'
          + 'req_over_1month,req_separate_budget,req_multi_dept,req_met,'
          + 'decision,decision_basis,decision_at,decision_by,output_handling,'
          + 'repeat_group_key,repeat_count,status,ceo_start_approved_at,ceo_end_approved_at,'
          + 'remark,created_by,created_at')
    .eq('initiative_code', code).maybeSingle();
  if (r.error) throw await pmErr('pm_initiatives(one)', r.error);
  return r.data;           /* ★없으면 null — 화면이 「없음」과 「권한없음」을 구별한다 */
}

/* 이 과제에 딸린 2층 프로젝트 (S3 허브에서 보여 준다) */
async function pmFetchProjectsOfInitiative(code) {
  var r = await edmsClient.from('pm_projects')
    .select('project_code,project_name,status,lifecycle_phase,current_gate,owner,owner_dept')
    .eq('initiative_code', code).is('archived_at', null)
    .order('project_code', { ascending: true });
  if (r.error) throw await pmErr('pm_projects(of initiative)', r.error);
  return r.data || [];
}

/* ★아직 1층 과제에 안 붙은 2층 프로젝트 — S3 「연결」 자리가 고를 목록.
   ★근거 : 판정 MST2-20260830-008 §4-② 「묶음 B 를 기다리지 말고 S3 에 연결 한 자리를 임시로 연다」
   ★실측 2026-08-30 : pm_projects 7행 ★전건 initiative_code IS NULL — 003 만의 일이 아닙니다.
   ★보관된 것(archived_at)은 뺍니다 — 끝난 것을 새로 붙일 일은 없습니다. */
async function pmFetchUnlinkedProjects() {
  var r = await edmsClient.from('pm_projects')
    .select('project_code,project_name,status,type_char')
    .is('initiative_code', null).is('archived_at', null)
    .order('project_code', { ascending: true });
  if (r.error) throw await pmErr('pm_projects(unlinked)', r.error);
  return r.data || [];
}

/* ════════════════════════════════════════════════════════════════════════
   결재선 세 값을 ★DB 에서 읽어 옵니다 — 결함 6번 (지시 MST2-20260830-014 §1)
   ★화면이 결재자를 적지 않습니다 (W-17 · 결재자 하드코딩 금지).
   ★없으면 null 로 넘기지 않고 ★왜 없는지 말합니다 (M-49 · 조용한 실패 0건).
     null 결재행이 생기면 pm_v_approval_detail 의 my_turn 이 영영 안 뜹니다 —
     상신한 사람은 보냈다고 믿고, 승인할 사람은 온 줄을 모릅니다.
   ★실측 2026-08-31 : pm_approval_lines 는 entity_type='계획서' ★3행뿐입니다.
     과제서류 3종(착수 승인서·결과 검증서·종료보고서) 줄은 ★아직 없습니다.
   ════════════════════════════════════════════════════════════════════════ */

/* 지금 로그인한 사람의 id — drafter_id 로 씁니다 */
async function pmCurrentUserId() {
  var sres = await edmsClient.auth.getSession();
  var sess = sres && sres.data && sres.data.session;
  if (!sess || !sess.user || !sess.user.id) {
    var e = new Error('[작성자] 로그인 세션이 없습니다 — 작성자를 적을 수 없습니다.');
    e.where = 'auth.getSession'; e.authed = false;
    throw e;
  }
  return sess.user.id;
}

/* 직위 문면(person_name) → 계정 id.
   ★edms_profiles.name 에 직위가 앉아 있는 것이 현 단계 정본입니다(부대표 확정 2026-08-27). */
async function pmProfileIdByName(personName) {
  if (!personName) return null;
  var r = await edmsClient.from('edms_profiles').select('id,name').eq('name', personName);
  if (r.error) throw await pmErr('edms_profiles(이름으로 계정 찾기)', r.error);
  if (!r.data || !r.data.length) return null;
  if (r.data.length > 1) {
    /* ★한 직위에 사람이 둘 이상이면 이름 체계로 옮겨야 합니다(값 V3.0 직위정본.전환조건).
       ★그때까지는 ★고르지 않고 멈춥니다 — 둘 중 하나를 화면이 고르면 그것이 거짓이 됩니다. */
    var e = new Error('[결재선] 「' + personName + '」 계정이 ' + r.data.length + '개입니다 — '
                    + '화면이 고르지 않습니다. 직위+이름 체계로 옮길 때입니다.');
    e.where = 'edms_profiles(중복)';
    throw e;
  }
  return r.data[0].id;
}

/* 서류 종류의 결재선 — pm_approval_lines 가 정본입니다.
   반환 {found:bool, approver_name, approver_id, reviewer_name, reviewer_id, 사유} */
async function pmDocApprovalLine(docType) {
  var r = await edmsClient.from('pm_approval_lines')
    .select('entity_type,step,person_name,source_ref').eq('entity_type', docType);
  if (r.error) throw await pmErr('pm_approval_lines', r.error);
  var rows = r.data || [];
  if (!rows.length) {
    return { found:false, 사유:'대장(pm_approval_lines)에 「' + docType + '」 결재선이 없습니다' };
  }
  function nameOf(step) {
    var hit = rows.filter(function (x) { return x.step === step; })[0];
    return hit ? hit.person_name : null;
  }
  var apName = nameOf('승인'), rvName = nameOf('검토');
  if (!apName) {
    return { found:false, 사유:'「' + docType + '」 결재선에 ★승인 단이 없습니다' };
  }
  var apId = await pmProfileIdByName(apName);
  if (!apId) {
    return { found:false, 사유:'승인자 「' + apName + '」 의 계정이 edms_profiles 에 없습니다' };
  }
  return { found:true, approver_name:apName, approver_id:apId,
           reviewer_name:rvName, reviewer_id: rvName ? await pmProfileIdByName(rvName) : null,
           source_ref: rows[0].source_ref || null };
}

/* 과제의 주관 부서 → pm_approvals.owner_dept_code 가 받는 꼴(두 글자)로.
   ★실측 CHECK : owner_dept_code IN ('QT','CT','MT','DT')
   ★과제는 한 글자(Q·M·C·D)로 들고 있어 pm_dept_codes 로 옮깁니다 — 화면이 표를 다시 쓰지 않습니다. */
async function pmDeptLegacyOf(deptChar) {
  if (!deptChar) return null;
  var r = await edmsClient.from('pm_dept_codes')
    .select('dept_char,legacy_code').eq('dept_char', deptChar);
  if (r.error) throw await pmErr('pm_dept_codes', r.error);
  return (r.data && r.data.length) ? r.data[0].legacy_code : null;
}

/* ★내가 쓸 수 있는가 — pm_can_edit() 과 같은 기준(admin 또는 임원).
   ★화면이 기준을 다시 쓰지 않는다. DB 함수를 그대로 부른다. */
async function pmCanEdit() {
  var r = await edmsClient.rpc('pm_can_edit');
  if (r.error) throw await pmErr('pm_can_edit', r.error);
  return r.data === true;
}

/* ── 1층 서류 (S4·S5·S6) 조회 ───────────────────────────────────────── */
async function pmFetchInitiativeDocs(code) {
  var r = await edmsClient.from('pm_initiative_docs')
    .select('doc_id,initiative_code,doc_type,seq,status,output_handling,submit_to,submit_target_date,'
          + 'planned_start,planned_end,separate_budget,verify_result,verify_reason,'
          + 'redesignated_handling,redesignate_reason,'
          + 'close_c1,close_c2,close_c3,close_c4,close_c5,close_c6,close_c7,close_c8,'
          + 'close_na_reason,result_summary,followup_item,approval_id,created_by,created_at')
    .eq('initiative_code', code)
    .order('doc_id', { ascending: true });
  if (r.error) throw await pmErr('pm_initiative_docs', r.error);
  return r.data || [];
}

/* 이 과제에 걸린 결재 (1층) — 서류함의 「상태」는 여기서 온다. 서류 표에 다시 적지 않는다. */
async function pmFetchInitiativeApprovals(code) {
  var r = await edmsClient.from('pm_v_my_approvals')
    .select('approval_id,initiative_code,entity_type,title,status,drafter_name,approver_name,'
          + 'submitted_at,approved_at,my_turn,created_at')
    .eq('initiative_code', code)
    .order('created_at', { ascending: false });
  if (r.error) throw await pmErr('pm_v_my_approvals(1층)', r.error);
  return r.data || [];
}
