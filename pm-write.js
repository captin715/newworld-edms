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
  /* ══ 결함 6번 시정 (지시 MST2-20260830-014 §1) ═══════════════════════════
     ★종전에는 세 값을 || null 로 받아 ★알맹이 없는 결재행을 만들었습니다.
       pm_v_approval_detail 은 approver_id = auth.uid() 로 「내 차례」를 고르므로
       ★상신해도 승인하실 분 화면에 뜨지 않습니다.
       보낸 사람은 보냈다고 믿고, 받을 사람은 온 줄을 모릅니다 — 가장 나쁜 실패입니다.
     ★그래서 세 값을 ★DB 에서 읽어 싣고, ★못 읽으면 아예 만들지 않습니다.
     ★값을 화면이 짓지 않습니다 (W-17).
     ★서류는 이미 저장돼 있습니다 — 상신만 멈춥니다. 쓰신 것은 사라지지 않습니다.
     ══════════════════════════════════════════════════════════════════════ */
  var line = await pmDocApprovalLine(o.doc_type);
  if (!line.found) {
    var e0 = new Error('[상신] 결재선이 없어 상신하지 않았습니다 — ' + line.사유 + '.\n'
      + '★임의로 비워 두고 보내면 승인하실 분 화면에 뜨지 않습니다. 그래서 멈췄습니다.\n'
      + '★쓰신 내용은 저장돼 있습니다 — 결재선이 등재되면 그대로 상신하시면 됩니다.');
    e0.where = 'pm_approval_lines(결재선 없음)';
    e0.needsLine = o.doc_type;
    throw e0;
  }
  var drafterId = await pmCurrentUserId();
  if (drafterId === line.approver_id) {
    /* ★DB CHECK(drafter_ne_approver)가 어차피 막습니다. 막히기 전에 뜻을 적습니다. */
    var e1 = new Error('[상신] 작성자와 승인자가 같은 계정입니다 (' + (line.approver_name || '') + ').\n'
      + '★승인권자가 작성자가 되면 그 승인은 무효입니다. 작성은 실무 계정으로 하십시오.');
    e1.where = 'W-10/승인권자 자기결재';
    throw e1;
  }
  if (line.reviewer_id && drafterId === line.reviewer_id) {
    /* ★판정 MST2-20260901-010 §5-② 는 「작성자=검토자이면 ★사유(skip_reason)를 적어 검토를 건너뛴다」입니다.
       ★그러나 2026-09-01 실측 — pm_approvals 에 CHECK 둘이 그대로 있어 ★DB 가 두 길을 다 막습니다.
         pm_approvals_w10_drafter_ne_reviewer : (drafter_id IS NULL OR reviewer_id IS NULL OR drafter_id <> reviewer_id)
         pm_approvals_no_skip_for_now         : (skip_reason IS NULL)
       ★가드 함수(pm_approval_guard)는 §5 대로 이미 고쳐졌으나 CHECK 가 그 앞에서 잘라 냅니다.
       ★그래서 지금은 ★막습니다 — 「사유를 적으면 된다」고 적으면 ★거짓이 됩니다.
       ★CHECK 둘이 풀리면 이 자리를 사유 입력으로 바꿉니다. (신고 : PMD → 마스터 2026-09-01) */
    var e2 = new Error('[상신] 작성자와 검토자가 같은 계정입니다 (' + (line.reviewer_name || '') + ').\n'
      + '★자기가 쓴 것을 자기가 검토할 수 없습니다 (W-10).\n'
      + '★판정 MST2-20260901-010 §5-② 는 「사유를 적고 건너뛴다」이나, ★DB CHECK 둘'
      + '(pm_approvals_w10_drafter_ne_reviewer · pm_approvals_no_skip_for_now)이 아직 그대로여서\n'
      + '★지금은 사유를 적어도 들어가지 않습니다. ★다른 계정으로 작성하십시오.');
    e2.where = 'W-10/자기검토';
    throw e2;
  }
  /* ★직무분리 셋째 — 검토자 ≠ 승인자 (값 V4.2 · 판정 MST2-20260901-013 §1)
     ★한 사람이 두 자리를 잡으면 자기가 본 것을 자기가 다시 보는 것이라 결재가 아닙니다.
     ★가드(pm_approval_guard)가 2026-09-01 부터 막습니다 — 막히기 전에 뜻을 적습니다.
     ★이 검사는 결재선(pm_approval_lines) 자체가 잘못 세워졌을 때 걸립니다.
       사람이 고칠 수 있는 자리가 아니므로 ★어디를 고쳐야 하는지까지 적습니다. */
  if (line.reviewer_id && line.approver_id && line.reviewer_id === line.approver_id) {
    var e3 = new Error('[상신] 결재선의 검토자와 승인자가 같은 계정입니다 ('
      + (line.approver_name || '') + ').\n'
      + '★한 사람이 두 자리를 잡지 않습니다 — 그 결재는 결재가 아닙니다 (값 V4.2 · 직무분리).\n'
      + '★이것은 「' + o.doc_type + '」의 ★결재선이 잘못 세워진 것입니다 — 상신하는 분이 고칠 수 없습니다.\n'
      + '★pm_approval_lines 의 「' + o.doc_type + '」 검토·승인 두 줄을 마스터창_02 가 고쳐야 합니다.');
    e3.where = '직무분리/검토=승인';
    e3.needsLine = o.doc_type;
    throw e3;
  }

  var deptCode = o.owner_dept_code || await pmDeptLegacyOf(o.owner_dept_char);

  /* ★서류가 먼저입니다 — 서류가 CHECK 에 걸리면 결재를 만들지 않습니다(빈 결재 방지) */
  var saved = await pmSaveInitiativeDoc(Object.assign({}, o, { status: '상신' }));
  var a = await edmsClient.from('pm_approvals').insert({
    initiative_code : o.initiative_code,
    entity_type     : o.doc_type,
    entity_ref      : String(saved.doc_id),
    title           : o.doc_type + ' · ' + o.initiative_code,
    status          : '작성중',
    drafter_id      : drafterId,
    approver_id     : line.approver_id,
    reviewer_id     : line.reviewer_id || null,
    owner_dept_code : deptCode || null
  }).select().single();
  if (a.error) {
    var e = await pmErr('pm_approvals(1층 insert)', a.error);
    e.docSaved = saved.doc_id;   /* ★서류는 저장됐다는 사실을 숨기지 않는다 */
    throw e;
  }
  var link = await edmsClient.from('pm_initiative_docs')
    .update({ approval_id: a.data.approval_id }).eq('doc_id', saved.doc_id).select().single();
  if (link.error) throw await pmErr('pm_initiative_docs(approval 연결)', link.error);

  /* ══ 결함 12 시정 — ★상신은 「검토로 보내는 일」입니다 ════════════════════
     ★종전에는 '작성중' 으로 만들어 두고 끝냈습니다. 그래서 결재가 ★작성중에 갇혔고,
       그 자리에서 누를 수 있는 것은 「취소」 하나뿐이었습니다.
     ★사람이 상신을 눌렀는데 다시 한 번 눌러야 하면 그것은 상신이 아닙니다
       (지시 MST2-20260831-015 §1 ㉮ 채택).

     ★왜 INSERT 에서 곧바로 '검토중' 으로 넣지 않는가 — ★넣을 수 없습니다.
       실측 2026-08-31 · pm_approval_guard 전이표 :
           NULL → '작성중'            (INSERT 는 이것만)
           '작성중' → '검토중'·'취소'·'보류'
       INSERT 에 '검토중' 을 박으면 ★「허용되지 않은 전이: - → 검토중」 으로 막힙니다.
     ★그래서 두 걸음입니다. ★그리고 그 편이 옳습니다 —
       pm_status_transitions 에 ★두 줄이 남아 「만들었다」와 「보냈다」가 따로 보입니다(자취).
     ★검토중은 reviewer_id 를 요구합니다(가드) — 위에서 이미 실었습니다.
     ★submitted_at 은 DB 가 찍습니다. 화면이 시각을 적지 않습니다. */
  var mv = await edmsClient.from('pm_approvals')
    .update({ status: '검토중' })
    .eq('approval_id', a.data.approval_id)
    .select('approval_id,status,submitted_at').single();
  if (mv.error) {
    /* ★서류도 결재도 이미 만들어졌습니다. 그 사실을 숨기지 않습니다(M-49).
       ★사람이 다음에 무엇을 할 수 있는지까지 적습니다. */
    var e3 = await pmErr('pm_approvals(작성중→검토중)', mv.error);
    e3.message = '[상신] 결재는 만들어졌으나 ★검토로 보내지 못했습니다.\n'
      + e3.message + '\n'
      + '★쓰신 내용과 결재는 남아 있습니다 — 사라지지 않았습니다.\n'
      + '★지금 상태는 「작성중」입니다. 결재함에서 「검토 요청」으로 이어서 보내실 수 있습니다.';
    e3.docSaved = saved.doc_id;
    e3.approvalId = a.data.approval_id;
    throw e3;
  }
  return link.data;
}

/* ════════════════════════════════════════════════════════════════════════
   ★2층 프로젝트를 1층 과제에 붙이기 / 떼기 — S3 「연결」 자리 (임시)
   ★판정 MST2-20260830-008 §4-② · ★정본 길은 S14 내려보내기(묶음 B)입니다.
     이 자리는 ★S14 가 열릴 때까지의 임시 우회입니다 — 화면에도 그렇게 적혀 있습니다.
   ★손으로 붙인 것은 ★손으로 뗄 수 있어야 합니다. 그래서 둘을 함께 냅니다
     — 되돌릴 수 없는 걸음을 만들지 않습니다.
   ★권한은 DB 가 정합니다 — pm_projects UPDATE 정책 = pm_can_edit() (실측 2026-08-30).
     화면이 기준을 다시 쓰지 않습니다(W-17).
   ★쓰는 칸은 initiative_code ★하나뿐입니다. 다른 칸은 건드리지 않습니다.
   ════════════════════════════════════════════════════════════════════════ */
async function pmLinkProjectToInitiative(projectCode, initiativeCode) {
  if (!projectCode || !initiativeCode) throw new Error('[연결] 프로젝트와 과제를 모두 골라 주십시오');
  var r = await edmsClient.from('pm_projects')
    .update({ initiative_code: initiativeCode })
    .eq('project_code', projectCode)
    .is('initiative_code', null)            /* ★이미 붙은 것을 말없이 옮기지 않습니다 */
    .select('project_code,initiative_code');
  if (r.error) throw await pmErr('pm_projects(연결)', r.error);
  /* ★0행이 돌아오는 두 경우를 가릅니다 — 권한 없음 / 그 사이 누가 먼저 붙임 */
  if (!r.data || !r.data.length) {
    var e = new Error('[연결] 붙이지 못했습니다 — 권한이 없거나, 그 사이 다른 사람이 먼저 붙였습니다. '
                    + '화면을 새로 고쳐 지금 상태를 보십시오.');
    e.where = 'pm_projects(연결)';
    throw e;
  }
  return r.data[0];
}

async function pmUnlinkProject(projectCode) {
  if (!projectCode) throw new Error('[연결 해제] 프로젝트를 고르지 못했습니다');
  var r = await edmsClient.from('pm_projects')
    .update({ initiative_code: null })
    .eq('project_code', projectCode)
    .select('project_code,initiative_code');
  if (r.error) throw await pmErr('pm_projects(연결 해제)', r.error);
  if (!r.data || !r.data.length) {
    var e = new Error('[연결 해제] 떼지 못했습니다 — 권한이 없을 수 있습니다.');
    e.where = 'pm_projects(연결 해제)';
    throw e;
  }
  return r.data[0];
}
