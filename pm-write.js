/* ════════════════════════════════════════════════════════════════════
   프로젝트관리 실앱 v1 — ★쓰기 계층 (프로젝트 축 결재선)
   · ★pmdata.js 는 SELECT 전용이다(그 파일 머리 선언). ★쓰기는 이 파일에만 둔다.
   · 대상은 ★pm_approvals 한 표뿐이다. 다른 표는 여기서 쓰지 않는다.
   · ★결재자를 코드에 적지 않는다 — 화면이 edms_profiles 에서 골라 uuid 로 보낸다(W-17).
   · ★삭제 함수를 두지 않는다 — 취소는 ★상태 변경이다(판정 MST2-20260820_24 §5 ㉱).
   ════════════════════════════════════════════════════════════════════ */

/* 사람 목록 — 결재자 선택칸을 채운다 */
async function pmFetchPeople() {
  var r = await edmsClient.from('edms_profiles')
    .select('id,name,role,dept_code,is_exec,is_ceo')
    .order('name', { ascending: true });
  if (r.error) throw await pmErr('edms_profiles', r.error);
  return r.data || [];
}

/* 내 결재 대기함 (뷰가 my_turn 을 계산한다 — 화면이 다시 세지 않는다) */
async function pmFetchApprovals(projectCode) {
  var q = edmsClient.from('pm_v_my_approvals')
    .select('approval_id,project_code,entity_type,entity_ref,title,status,skip_reason,'
          + 'drafter_name,reviewer_name,approver_name,submitted_at,approved_at,my_turn,created_at');
  if (projectCode) q = q.eq('project_code', projectCode);
  var r = await q.order('created_at', { ascending: false });
  if (r.error) throw await pmErr('pm_v_my_approvals', r.error);
  return r.data || [];
}

/* ★기안 — 상태는 항상 '작성중' 으로 시작한다(전이표 진입점) */
async function pmCreateApproval(o) {
  var row = {
    project_code : o.project_code,
    entity_type  : o.entity_type,
    entity_ref   : o.entity_ref || null,
    title        : o.title,
    drafter_id   : o.drafter_id || null,
    reviewer_id  : o.reviewer_id || null,
    approver_id  : o.approver_id || null
  };
  var r = await edmsClient.from('pm_approvals').insert(row).select().single();
  if (r.error) throw await pmErr('pm_approvals(insert)', r.error);
  return r.data;
}

/* ★상태 전이 — 값역·순서·사유는 ★DB 트리거가 판정한다. 화면은 보내기만 한다.
   ★화면에서 전이표를 다시 쓰지 않는다(재서술 금지). 막히면 그 문면을 그대로 보여 준다. */
async function pmMoveApproval(id, toStatus, extra) {
  var patch = Object.assign({ status: toStatus }, extra || {});
  var r = await edmsClient.from('pm_approvals').update(patch).eq('approval_id', id).select().single();
  if (r.error) throw await pmErr('pm_approvals(update:' + toStatus + ')', r.error);
  return r.data;
}

/* ★첨부 등록 (㉯) — ★해시는 화면이 파일에서 직접 계산한다. 사람이 적지 않는다. */
async function pmAddAttachment(o) {
  var r = await edmsClient.from('pm_attachments').insert({
    project_code : o.project_code,
    owner_kind   : o.owner_kind,
    owner_ref    : o.owner_ref,
    seq          : o.seq || 1,
    file_name    : o.file_name,
    storage_path : o.storage_path,
    file_hash    : o.file_hash,
    file_size    : o.file_size || null,
    file_ext     : o.file_ext || null,
    security_level: o.security_level || 3,
    source       : o.source || '내부제작',
    external_from: o.external_from || null,
    registered_by: o.registered_by || null
  }).select().single();
  if (r.error) throw await pmErr('pm_attachments(insert)', r.error);
  return r.data;
}

/* ★철회 — ★삭제 함수를 두지 않는다(트리거가 DELETE 를 막는다) */
async function pmWithdrawAttachment(id, reason) {
  var r = await edmsClient.from('pm_attachments')
    .update({ status: '철회', withdraw_reason: reason })
    .eq('attachment_id', id).select().single();
  if (r.error) throw await pmErr('pm_attachments(withdraw)', r.error);
  return r.data;
}

/* ★파일 → sha256 — 브라우저가 계산한다. ★사람이 해시를 타이핑하지 않는다. */
async function pmSha256(file) {
  var buf = await file.arrayBuffer();
  var d   = await crypto.subtle.digest('SHA-256', buf);
  return Array.prototype.map.call(new Uint8Array(d), function (b) {
    return ('0' + b.toString(16)).slice(-2); }).join('');
}

/* ════════════════════════════════════════════════════════════════════
   ★1층 과제(INI) 쓰기 — 화면정의서 V3.2 S1 ⑪ [저장]
   · ★판정(decision)을 화면이 정하지 않는다. '미판정'으로 보내면 ★DB 트리거가 정한다.
     화면은 3요건 체크를 그대로 올릴 뿐이다(요소 ⑧「자동 계산」).
   · ★번호도 화면이 만들지 않는다. pm_next_initiative_code(부서) 가 발급한다.
   · ★삭제 함수를 두지 않는다.
   ════════════════════════════════════════════════════════════════════ */
async function pmCreateInitiative(o) {
  /* ① 번호 발급 — ★여기서 처음 시퀀스를 소비한다(미리보기는 소비하지 않는다) */
  var c = await edmsClient.rpc('pm_next_initiative_code', { p_dept: o.owner_dept_char });
  if (c.error) throw await pmErr('pm_next_initiative_code', c.error);

  var row = {
    initiative_code     : c.data,
    initiative_name     : o.initiative_name,
    owner_dept_char     : o.owner_dept_char,
    owner               : o.owner || null,
    owner_uid           : o.owner_uid || null,
    origin              : o.origin || '내부',
    req_over_1month     : !!o.req_over_1month,
    req_separate_budget : !!o.req_separate_budget,
    req_multi_dept      : !!o.req_multi_dept,
    decision            : '미판정',       /* ★DB 가 정한다 */
    decision_basis      : (o.decision_basis && o.decision_basis.trim()) ? o.decision_basis.trim() : null,
    remark              : o.remark || null
  };
  var r = await edmsClient.from('pm_initiatives').insert(row).select().single();
  if (r.error) {
    var e = await pmErr('pm_initiatives(insert)', r.error);
    e.attemptedCode = c.data;   /* ★탄 번호를 숨기지 않는다 — 실패해도 그 번호는 다시 안 나온다 */
    throw e;
  }
  return r.data;
}

/* ════════════════════════════════════════════════════════════════════
   ★1층 서류 쓰기 — S4 착수 승인서 · S5 결과 검증서 · S6 종료보고서
   · 서류는 pm_initiative_docs, 결재는 pm_approvals. ★상태를 두 곳에 적지 않는다.
   · 필수 칸은 ★DB CHECK 가 판정한다. 화면은 미리 알려 줄 뿐 최종 판정자가 아니다.
   ════════════════════════════════════════════════════════════════════ */

/* 서류 저장 (없으면 만들고 있으면 고친다) */
async function pmSaveInitiativeDoc(o) {
  var row = Object.assign({}, o.fields, {
    initiative_code: o.initiative_code,
    doc_type       : o.doc_type,
    seq            : o.seq || 1,
    status         : o.status || '작성중',
    updated_at     : new Date().toISOString()
  });
  var r;
  if (o.doc_id) {
    r = await edmsClient.from('pm_initiative_docs').update(row).eq('doc_id', o.doc_id).select().single();
  } else {
    r = await edmsClient.from('pm_initiative_docs').insert(row).select().single();
  }
  if (r.error) throw await pmErr('pm_initiative_docs(' + (o.doc_id ? 'update' : 'insert') + ')', r.error);
  return r.data;
}

/* ★상신 — 서류를 「상신」으로 굳히고 결재를 만든다.
   ★서류가 먼저다. 서류가 CHECK 에 걸리면 결재를 만들지 않는다(빈 결재 방지). */
async function pmSubmitInitiativeDoc(o) {
  var saved = await pmSaveInitiativeDoc(Object.assign({}, o, { status: '상신' }));
  var a = await edmsClient.from('pm_approvals').insert({
    initiative_code : o.initiative_code,
    entity_type     : o.doc_type,
    entity_ref      : String(saved.doc_id),
    title           : o.doc_type + ' · ' + o.initiative_code,
    status          : '작성중',
    drafter_id      : o.drafter_id || null,
    approver_id     : o.approver_id || null,
    owner_dept_code : o.owner_dept_code || null
  }).select().single();
  if (a.error) {
    var e = await pmErr('pm_approvals(1층 insert)', a.error);
    e.docSaved = saved.doc_id;   /* ★서류는 저장됐다는 사실을 숨기지 않는다 */
    throw e;
  }
  var link = await edmsClient.from('pm_initiative_docs')
    .update({ approval_id: a.data.approval_id }).eq('doc_id', saved.doc_id).select().single();
  if (link.error) throw await pmErr('pm_initiative_docs(approval 연결)', link.error);
  return link.data;
}
