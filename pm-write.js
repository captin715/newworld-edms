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
