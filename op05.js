/* op05.js — 본공사(8-x) 화면 움직임 · 업무설계창 세션3 · MST2-20261002-011
 * 화면 이름 · 칸 · 단추 · 다음 화면 · 권한 · 점검 목록은 op05.html(정의에서 지음)에서 읽습니다 — 여기 박지 않습니다.
 *   칸 ↔ DB : data-bind="표.열[#키]" (정의\앱칸_op05.csv) · 보이는 값 : data-out · 목록 : .cklist[data-list] → CES.list
 *   공종 → 화면 · 화면 → 기록 표 : <script id="op05-def"> (짓기 도구가 화면정의.csv 에서 뽑음)
 * TABLES (저장되는 표 · 읽는 표)
 *   8-1  읽기 zones · construction_plans · construction_plan_items · process_standards · process_gates · quality_maps · diagnostic_evaluations · (DONE 표 : benchmarks · product_inspections)
 *   8-2 · 8-5~8-8  쓰기 process_gates · construction_processes · runtime_measurements(gate_id) · material_usage · site_photos(공통) · 읽기 위 + equipment_master · erp.check_items(CES.list)
 *   8-9  쓰기 operation_states(decision · decision_rationale · decision_criteria · decision_node_id) · process_gates.decision_ref
 *   8-3 · 8-10  함수율 Hold — moisture_holds(묶음 62 · 넣기 = hold · 고치기 = released / escalated / closed) · measurement_points · measurement_sub_points (자리만) — MSA-034 B91
 * 공통 V1(세션4 · WSD-20261002-세션4-019)에 맡김 : 화면 보임(ces:show) · 고르기 · Pass/Fail · 탭 · 넘김(data-go) · 사진 · 권한 가림 · data-online 막기
 *   쓰는 이름 : CES.dbSelect · CES.save · CES.list · CES.can · CES.site · CES.zone · CES.ui.{block, unblock, values, renderLists, go, toast}
 * 작성자 · 확인자 · 판단자 칸(checked_by · decided_by · created_by)은 보내지 않습니다 — DB 가 넣음(정렬표 §7 ③) */
(function () {
  'use strict';
  let DEF = null;                                   // op05-def — 화면을 보일 때 읽음(ces-ui 가 DOM 뒤에 부름)
  const P = new URLSearchParams(location.search);
  const C = () => window.CES || {};
  const SITE = () => (C().site && C().site()) || P.get('site');
  const ZONE = () => (C().zone && C().zone()) || P.get('zone');
  const can = n => !!(C().can && C().can(n));          // 권한 목록을 못 받으면 아무 권한도 없음(앱뼈대 §7)
  const canIn = sec => can(sec.dataset.can) || ((sec.dataset.intitle || '').split('|').filter(Boolean).indexOf(C().title ? C().title() : '') >= 0);   // 입력 칸만 — 결재 줄 작성 직함에도 엶(부대표 ㉯ · 판정 칸은 can 그대로)
  const toast = m => (C().ui && C().ui.toast ? C().ui.toast(m) : C().toast ? C().toast(m) : console.log('[toast]', m));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const link = (sid, zone, extra = '') => `?site=${encodeURIComponent(SITE() || '')}${zone ? '&zone=' + encodeURIComponent(zone) : ''}${extra}#${sid}`;
  let STALE = false;
  const GO = () => ((DEF && DEF.gatewords) || ['진행', '재작업'])[0], REDO = () => ((DEF && DEF.gatewords) || ['진행', '재작업'])[1];   // 게이트 말 = 정의(M1002-03)

  // ── 읽기 — 끊기면 마지막으로 받은 값 + 「최신 아님」 ──
  async function q(t, query) {
    const key = 'op05:' + t + '?' + query;
    if (!C().dbSelect) throw new Error('공통 파일(ces-shared.js)이 없습니다');
    try {
      const r = await C().dbSelect(t, query);
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), r })); } catch (e) { /* 꽉 참 */ }
      return r || [];
    } catch (e) {
      const c = localStorage.getItem(key);
      if (c) { STALE = true; return JSON.parse(c).r; }
      throw e;
    }
  }
  async function save(t, row, opts) {   // opts 를 넘김 — { op: 'insert' } 꼴(op08:134 · 세션4-062)
    if (!C().save) throw new Error('보내기 부품(CES.save · 공통 V1)이 아직 없습니다 — 저장하지 않았습니다');
    return C().save(t, row, opts);
  }
  function out(sec, key, v, html) { $$(`[data-out="${key}"]`, sec).forEach(el => { if (html) el.innerHTML = v; else el.textContent = (v == null || v === '') ? '—' : v; }); }
  function slot(sec, key, v) { $$(`[data-slot="${key}"]`, sec).forEach(el => { el.hidden = !v; const o = $(`[data-out="${key}"]`, el); if (o && v) o.innerHTML = v; }); }
  const NOZONE = '구역이 없습니다 — 진단평가 5-5 에서 구역을 확정하십시오';   // 빈 구역 막음(MSA-012)
  function block(btn, why) {            // 까닭은 공통 상자 하나에 모음(CES.ui.block) — 내 까닭 키 'op05'
    if (!btn) return;
    btn.dataset.why = why || '';
    if (why) C().ui.block(btn, 'op05', why); else C().ui.unblock(btn, 'op05');
  }
  const zlabel = z => z ? ('Z' + z.zone_number + (z.zone_name ? ' ' + z.zone_name : '')) : '';

  // ── 공통 자료 (현장 하나) ──
  const DATA = {};
  async function loadSite() {
    const S = SITE();
    if (DATA.site === S) return DATA;
    DATA.site = S;
    DATA.zones = await q('zones', `site_id=eq.${S}&select=id,zone_number,zone_name,area_m2&order=zone_number`);
    const plans = await q('construction_plans', `site_id=eq.${S}&select=id,version,plan_kind,confirmed_at,superseded_by&order=version.desc`);
    DATA.plan = plans.find(p => p.plan_kind === 'v2' && p.confirmed_at && !p.superseded_by) || plans.find(p => !p.superseded_by) || null;
    DATA.items = DATA.plan ? await q('construction_plan_items', `plan_id=eq.${DATA.plan.id}&select=id,sequence_no,std_id,std_code,quantity,unit,start_day,estimated_days,zone_id&order=sequence_no`) : [];
    const ids = [...new Set(DATA.items.map(i => i.std_id).filter(Boolean))];
    DATA.stds = ids.length ? await q('process_standards', `id=in.(${ids.join(',')})&select=id,std_code,process_stage,std_name,gate_number,pad_grade,pad_category,chemical_type`) : [];
    DATA.gates = await q('process_gates', `site_id=eq.${S}&select=id,site_id,zone_id,gate_number,process_stage,execution_no,execution_cause,result,candidate_decision,checklist_items,checked_at,decision_ref&order=gate_number,execution_no`);
    DATA.diag = (await q('diagnostic_evaluations', `site_id=eq.${S}&select=id,case_type,measurement_data,diagnosed_at,trigger_kind&order=diagnosed_at.asc`))
      .find(d => !d.trigger_kind || d.trigger_kind === 'initial') || null;   // 확정 처음 진단평가 — 추가 진단평가는 목표를 바꾸지 않음(세션2-012 1-1)
    DATA.oos = await q('quality_maps', `site_id=eq.${S}&out_of_scope=is.true&select=zone_id,defect_type`);
    DATA.done = {};
    for (const [sid, s] of Object.entries(DEF.screens)) {      // 게이트 아닌 공종 화면(사전검사 · 제품검사)은 그 화면 기록 표에 구역 줄이 있나
      if (s.std && s.store && s.store !== 'process_gates' && DEF.std_screen[s.std] === sid) {
        try { DATA.done[s.std] = new Set((await q(s.store.replace(/^ces\./, ''), `site_id=eq.${S}&select=zone_id`)).map(r => r.zone_id)); }
        catch (e) { DATA.done[s.std] = null; }                  // 못 읽음 = 「?」
      }
    }
    return DATA;
  }
  // 공종 줄 — 공정계획서 v2 차례(같은 공종은 한 번) · 이름은 공종 사전
  function stdLines() {
    const seen = new Set(), rows = [];
    for (const it of DATA.items) {
      const st = DATA.stds.find(s => s.id === it.std_id) || { std_code: it.std_code };
      if (seen.has(st.std_code)) continue; seen.add(st.std_code); rows.push({ ...st, item: it });
    }
    return rows;
  }
  function zoneRep(z, key) {
    // 구역 줄 찾기 : 5-9·5-10(s5-screens) 배열 {zone_id, zone_no} → 5-7·5-8(op02-z) 구역 id 키 객체 → 옛 자료 zone_number (B281)
    const zs = DATA.diag && DATA.diag.measurement_data && DATA.diag.measurement_data.zones;
    const r = !zs ? null : Array.isArray(zs)
      ? (zs.find(x => x && x.zone_id === z.id) || zs.find(x => x && x.zone_id == null && Number(x.zone_no ?? x.zone_number) === Number(z.zone_number)))
      : zs[z.id];
    let v = r && r.rep ? r.rep[key] : null;
    if (v && typeof v === 'object') v = v.value;               // op02-z 꼴 {mode,value,reason}
    return v == null || v === '' ? null : Number(v);
  }
  const gatesOf = (zid, g) => DATA.gates.filter(r => r.zone_id === zid && Number(r.gate_number) === Number(g));
  function cellState(z, st) {
    if (st.gate_number) {
      const rs = gatesOf(z.id, st.gate_number); const last = rs[rs.length - 1];
      if (!last) return { sym: '—', done: false };
      return { sym: last.result === GO() ? '○' : last.result === REDO() ? '✕' : '◑', done: last.result === GO(), loop: last.execution_no > 1 ? last.execution_no : 0 };
    }
    const d = DATA.done[st.std_code];
    if (d === undefined) return { sym: '—', done: false, nos: true };
    if (d === null) return { sym: '?', done: false };
    return d.has(z.id) ? { sym: '★', done: true } : { sym: '—', done: false };
  }

  // ── 8-1 본공사 진행판 (보기만) ──
  async function show81(sec) {
    await loadSite();
    out(sec, 'construction_plans.version', DATA.plan ? `공정계획서 ${DATA.plan.plan_kind || ''} · Rev ${DATA.plan.version}${DATA.plan.confirmed_at ? ' · 확정' : ' · 확정 전'}` : '');
    out(sec, 'today', new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }) + (STALE ? ' · ⚠ 최신 아님(끊김 — 마지막으로 받은 진행판)' : ''));
    const lines = stdLines(); const grid = $('[data-grid="zone-gates"]', sec); const next = $('[data-grid="zone-next"]', sec);
    if (!lines.length) {
      grid.innerHTML = '<div class="al stop"><span class="lv">차단</span>공정계획서 v2 의 공종 줄이 없습니다 — 공정계획 6-⑦ 확정 뒤에 진행판이 그려집니다.</div>';
      next.innerHTML = ''; $('[data-grid="std-lines"]', sec).innerHTML = ''; return;
    }
    let cards = '';                                                    // 휴대폰(≤600px) 구역 카드 — 같은 칸을 구역마다 한 장 (표는 그대로 두고 CSS 로 바꿔 보임)
    let h = '<table class="tb"><tr><th>구역</th><th>지금</th><th>Case</th><th>제거 깊이 목표</th>' + lines.map(l => `<th>${esc(l.std_name || l.process_stage || l.std_code)}</th>`).join('') + '</tr>';
    const nexts = [];
    for (const z of DATA.zones) {
      const states = lines.map(l => ({ l, s: cellState(z, l) }));
      const now = states.find(x => !x.s.done);
      const dep = zoneRep(z, 'weak_layer_depth');
      cards += `<div class="zc"><div class="zh"><b>${esc(zlabel(z))}</b> · ${esc(z.area_m2 == null ? '' : Number(z.area_m2).toLocaleString())}㎡</div>`
        + `<div class="zn">지금 <b>${now ? esc(now.l.std_name || now.l.std_code) : '끝'}</b></div>`
        + `<div class="zm">Case ${esc(DATA.diag && DATA.diag.case_type || '—')} · 제거 깊이 목표 ${dep == null ? '—' : dep + ' mm'}</div><ul class="zs">`
        + states.map(({ l, s }) => {
          const sid = DEF.std_screen[l.std_code]; const nm = esc(l.std_name || l.process_stage || l.std_code);
          const inner = `<span class="zy">${esc(s.sym)}</span> ${nm}` + (s.loop ? ` <span class="loop">${s.loop}회째</span>` : '');
          return `<li class="${s.done ? 'dn' : now && now.l === l ? 'nw' : ''}">${sid ? `<a class="lk" href="${link(sid, z.id)}">${inner}</a>` : inner}</li>`;
        }).join('') + '</ul></div>';
      h += `<tr><td>${esc(zlabel(z))} · ${esc(z.area_m2 == null ? '' : Number(z.area_m2).toLocaleString())}㎡</td><td><b>${now ? esc(now.l.std_name || now.l.std_code) : '끝'}</b></td>`
        + `<td>${esc(DATA.diag && DATA.diag.case_type || '—')}</td><td>${dep == null ? '—' : dep + ' mm'}</td>`
        + states.map(({ l, s }) => {
          const sid = DEF.std_screen[l.std_code];
          const inner = esc(s.sym) + (s.loop ? ` <span class="loop">${s.loop}회째</span>` : '');
          return `<td>${sid ? `<a class="lk" href="${link(sid, z.id)}">${inner}</a>` : inner}</td>`;
        }).join('') + '</tr>';
      if (now && DEF.std_screen[now.l.std_code]) nexts.push({ z, l: now.l });
    }
    grid.innerHTML = h + '</table>' + `<div class="zcs">${cards}</div>`;
    next.innerHTML = nexts.map((n, i) => `<button type="button" class="b${i ? ' s' : ' p'}" data-href="${esc(link(DEF.std_screen[n.l.std_code], n.z.id))}">${esc(zlabel(n.z))} 이어서 — ${esc(n.l.std_name || n.l.std_code)}</button>`).join('');
    $('[data-grid="std-lines"]', sec).innerHTML = '<table class="tb"><tr><th>코드</th><th>이름</th><th>게이트</th><th>공정계획서 수량</th><th>계획 일정</th></tr>'
      + lines.map(l => `<tr><td>${esc(l.std_code)}</td><td>${esc(l.std_name || l.process_stage || '')}</td><td>${l.gate_number ? 'Gate ' + l.gate_number : '—'}</td>`
        + `<td>${l.item.quantity == null ? '—' : esc(l.item.quantity + ' ' + (l.item.unit || ''))}</td><td>${l.item.start_day == null ? '—' : esc(l.item.start_day + '일째부터 · ' + (l.item.estimated_days || '?') + '일')}</td></tr>`).join('') + '</table>';
    const oz = [...new Set(DATA.oos.map(o => o.zone_id))].map(id => DATA.zones.find(z => z.id === id)).filter(Boolean);
    slot(sec, 'oos.warn', oz.length ? `${oz.map(zlabel).join(' · ')} — <b>범위 밖 결함 ${DATA.oos.length}건</b>. <b>본공사는 막지 않습니다.</b> → <a href="${link('w08-4', oz[0].id)}">범위 밖 결함 화면</a>` : '');
  }

  // ── 8-2 · 8-5~8-8 게이트 화면 (공종 코드가 붙은 화면 — 같은 움직임) ──
  const LISTS = new Map();        // 목록 코드 → CES.list 결과 { list, items } — 맞는 답 = rule.ok 또는 첫 고르기
  async function lists(sec) {
    await C().ui.renderLists(sec);
    for (const el of $$('.cklist[data-list]', sec)) {
      const code = el.dataset.list;
      if (!LISTS.has(code)) { try { LISTS.set(code, await C().list(code)); } catch (e) { LISTS.set(code, { list: null, items: [] }); } }
    }
  }
  function okVal(it) {
    if (it.rule && it.rule.ok != null) return String(it.rule.ok);
    if (it.input_kind === '예아니오') return '예';
    const o = Array.isArray(it.options) ? it.options : (it.options && it.options.values) || [];
    return o.length ? String(typeof o[0] === 'string' ? o[0] : (o[0].v || o[0].value || o[0].label)) : null;   // 숫자 · 글 = 채우면 맞음
  }
  function listState(sec) {         // [{code, safety, list, vals:[{item_code, label, value, ok}]}] — 그린 목록만
    const got = (C().ui.values(sec)._checks || []);
    return $$('.cklist[data-list]', sec).map(el => {
      const r = LISTS.get(el.dataset.list) || {}; if (!r.list) return null;
      const vals = (r.items || []).map(it => { const g = got.find(x => x.item_code === it.item_code && String(x.list_id) === String(r.list.id)) || {};
        const v = g.value == null ? '' : String(g.value); const w = okVal(it);
        return { item_code: it.item_code, label: it.label, value: v || null, photos: g.photos || [], ok: v !== '' && (w == null || v === w) }; });
      return { code: el.dataset.list, safety: el.hasAttribute('data-safety'), list: r.list, vals };
    }).filter(Boolean);
  }
  const G = {};   // 지금 화면의 게이트 줄 상태 { sid, zone, std, gate, id, exec, cause, last, readonly, target, before }
  async function showGate(sec) {
    await loadSite();
    const sid = sec.id, code = sec.dataset.std, zid = ZONE();
    const z = DATA.zones.find(x => x.id === zid);
    const st = DATA.stds.find(s => s.std_code === code) || (await q('process_standards', `std_code=eq.${code}&select=id,std_code,process_stage,std_name,gate_number,pad_grade,pad_category,chemical_type&order=rev_no.desc&limit=1`))[0];
    const submit = $$('button[data-online][data-go]', sec)[0];
    Object.keys(G).forEach(k => delete G[k]);
    Object.assign(G, { sid, zone: z, std: st, submit });
    if (!z) { block(submit, '구역이 정해지지 않았습니다 — 진행판(8-1)에서 구역 칸을 누르십시오'); slot(sec, 'gate.loopnote', ''); return; }
    if (!st || !st.gate_number) { block(submit, `공종 사전에 ${code} 의 게이트 번호가 없습니다 (15-17)`); return; }
    const rs = gatesOf(z.id, st.gate_number), last = rs[rs.length - 1];
    if (last && last.result == null) Object.assign(G, { id: last.id, exec: last.execution_no, cause: last.execution_cause, readonly: false });
    else if (last && last.result === GO()) Object.assign(G, { id: last.id, exec: last.execution_no, cause: last.execution_cause, readonly: true });
    else Object.assign(G, { id: uuid(), exec: (last ? last.execution_no : 0) + 1, cause: last ? 'Rework' : null, readonly: false });
    G.prev = rs.filter(r => r.id !== G.id);
    G.lots = $('[data-bind="material_usage.lot_number"]', sec) ? await q('material_usage', `site_id=eq.${SITE()}&zone_id=eq.${z.id}&select=lot_number,process_stage`).catch(() => []) : [];   // LOT 섞임 견줌(lotMix)
    out(sec, 'zone.label', zlabel(z));
    out(sec, 'std.label', `${st.std_code} · ${st.std_name || st.process_stage || ''}`);
    out(sec, 'gate.zone_loop', `${zlabel(z)} · ${G.exec}회째`); out(sec, 'gate.loop', `${G.exec}회째`);
    out(sec, 'process_standards.pad_grade', st.pad_grade); out(sec, 'process_standards.pad_category', st.pad_category); out(sec, 'process_standards.chemical_type', st.chemical_type);
    out(sec, 'gate.prev', G.prev.length ? G.prev.map(r => `${r.execution_no}회째 · ${r.checked_at ? new Date(r.checked_at).toLocaleString('ko-KR') : ''} · ${r.result || '진행 중'}`).join(' / ') : '없음 (1회째)');
    slot(sec, 'gate.loopnote', G.exec > 1 ? `${esc(zlabel(z))} · <b>${G.exec}회째</b>입니다. 앞 회차 : ${esc(G.prev.map(r => r.execution_no + '회째 ' + (r.result || '')).join(' · '))}` : '');
    G.target = zoneRep(z, 'weak_layer_depth');
    out(sec, 'diagnostic_evaluations.measurement_data#weak_layer_depth', G.target == null ? '' : G.target + ' mm');
    const mort = zoneRep(z, 'mortar_depth'); out(sec, 'diagnostic_evaluations.measurement_data#mortar_depth', mort == null ? '' : mort + ' mm');
    // 앞 게이트 Pass (3.3.7) · 앞서야 할 기록(정의 BEFORE)
    let why = ''; G.gateWhy = '';
    if (st.gate_number > 1) {
      const pr = gatesOf(z.id, st.gate_number - 1), pl = pr[pr.length - 1];
      out(sec, 'gate.before', pl ? `Gate ${st.gate_number - 1} · ${pl.execution_no}회째 · ${pl.result || '진행 중'}` : `Gate ${st.gate_number - 1} 기록 없음`);
      if (!pl || pl.result !== GO()) {
        why = `앞 게이트(Gate ${st.gate_number - 1}) 판단이 「${GO()}」이 아닙니다 — 이 공정을 시작할 수 없습니다`;
        G.gateWhy = `앞 Gate ${st.gate_number - 1} 「진행」 뒤에 넣을 수 있습니다 — 지금 Gate ${st.gate_number - 1} 은 「${pl ? (pl.result || '진행 중') : '기록 없음'}」입니다`;   // 임시저장도 막음(CFSPS 011000 13장 선행 Gate 합격 후 착수 SHALL · MSA-030 B71)
      }
    }
    if (!why && sec.dataset.before) {
      const have = await q(sec.dataset.before, `site_id=eq.${SITE()}&zone_id=eq.${z.id}&select=id&limit=1`).catch(() => null);
      if (have && !have.length) why = sec.dataset.beforeWhy || '앞서야 할 기록이 없습니다';
      if (have === null) why = '앞서야 할 기록을 못 읽었습니다 — 연결된 뒤에 다시';
    }
    if (!why && points(sec).length && G.target == null) why = '제거 깊이 목표가 없습니다 — 진단평가 확정 값이 먼저입니다';
    G.why = why;
    await fillOpts(sec);
    await lists(sec);
    restoreDraft(sec);
    if (G.readonly) { $$('input,textarea,select,.pick button,.acts.gate button,[data-timer]', sec).forEach(e => e.disabled = true); block(submit, `이미 「${GO()}」 판단한 게이트입니다 (${G.exec}회째) — 보기만`); }
    else if (!can(sec.dataset.can)) { $$('input,textarea,select,.pick button,.acts.gate button,[data-timer]', sec).forEach(e => e.disabled = true); block(submit, '쓰기 권한이 없습니다 — 보기만'); }
    { const ag = $('.acts.gate', sec), ro = G.readonly || !can(sec.dataset.can); let w = ag && ag.nextElementSibling; if (!(w && w.hasAttribute('data-gwhy'))) w = null;   // 팀원시험 U1 — 「진행 / 재작업」 회색 까닭
      if (ag && ro && !w) ag.insertAdjacentHTML('afterend', `<div class="why" data-gwhy>못 고르는 까닭 — ${G.readonly ? `이미 「${GO()}」 판단한 게이트입니다 · 보기만` : '쓰기 권한이 없습니다 · 보기만'}</div>`); else if (w && !ro) w.remove(); }
    recalc(sec);
  }
  function points(sec) { return $$('[data-bind="runtime_measurements.removal_depth"]', sec); }
  function recalc(sec) {
    if (!G.sid || G.sid !== sec.id) return;
    const pts = points(sec).map(i => i.value === '' ? null : Number(i.value));
    let depthOk = true, msg = '';
    if (pts.length) {
      const lim = 10;   // ★박은 값 — 제거 깊이 한계 10mm(CFSPS 3.3.5.1 3) SHALL NOT). 기준정보 상수 LIMIT 를 읽는 뷰가 서면 그것으로(보고 ④)
      const filled = pts.filter(v => v != null);
      points(sec).forEach(i => { const v = i.value === '' ? null : Number(i.value); i.closest('.f').classList.toggle('bad', v != null && (G.target != null && v < G.target || v > lim)); });
      depthOk = filled.length >= 3 && G.target != null && filled.every(v => v >= G.target && v <= lim);
      msg = filled.length < 3 ? `점 ${filled.length} / 3 — 무작위 3점 이상 (3.3.5.1 6)c))` : (depthOk ? `모두 목표 ${G.target} 이상 ✔ · 한계 ${lim} mm 이하 ✔` : `목표 ${G.target ?? '?'} 미달 또는 한계 ${lim} mm 넘는 점이 있습니다`);
      out(sec, 'gate.depth_compare', msg);
    }
    const hs = listState(sec);
    const listOk = hs.some(h => !h.safety) ? hs.every(h => h.vals.every(x => x.ok)) : null;
    const failed = hs.flatMap(h => h.vals.filter(x => !x.ok).map(x => x.label));
    let cand = null, txt = '점검 목록을 받지 못했습니다 — 후보를 셀 수 없음 (15-23 목록 · 연결)';
    if (listOk !== null) { cand = listOk && depthOk ? GO() : REDO(); txt = cand === GO() ? `${GO()} 후보 — 체크 모두 맞음` : `${REDO()} 후보 — 미충족 : ${[...failed, ...(depthOk ? [] : ['제거 깊이'])].join(' · ') || '빈 칸 있음'}`; }
    G.cand = cand; out(sec, 'process_gates.candidate_decision', txt + ' · 판단은 공사팀원 · 공사팀장이 합니다');
    const res = $('.acts.gate button.on', sec);
    if (!G.readonly && can(sec.dataset.can)) block(G.submit, lotMix(sec) || G.why || (!res ? `${GO()} / ${REDO()} 을 고르십시오` : '') || missing(sec));
  }
  function lotMix(sec) {          // 1차 · 2차 밀봉제 섞어 쓰기 막음 — 같은 구역 다른 공정에 이미 쓴 LOT (시방서 6.4 a) · 8.5.4 SHALL NOT)
    const el = $('[data-bind="material_usage.lot_number"]', sec), n = el ? String(el.value).trim() : ''; if (!n) return '';
    const me = G.std && (G.std.process_stage || G.std.std_code), hit = (G.lots || []).find(r => r.lot_number === n && r.process_stage !== me);
    return hit ? `다른 LOT 이 섞였습니다 — 이 LOT(${n})은 ${hit.process_stage} 에 쓴 밀봉제입니다. 1차 · 2차 밀봉제는 섞어 쓰지 않습니다 (시방서 6.4 · 8.5.4)` : '';
  }
  function missing(sec) {
    const bad = $$('[required]', sec).filter(i => !i.disabled && !String(i.value).trim());
    return bad.length ? `필수 칸 ${bad.length}개가 비었습니다` : '';
  }
  // 임시저장 값 (기기) — 같은 게이트 줄 id 로 묶음
  const DKEY = () => `op05:draft:${G.id}`;
  function collect(sec) {
    const v = {};
    $$('[data-bind]', sec).forEach(el => {
      const k = el.dataset.bind;
      if (el.matches('input,textarea,select')) { if (el.type === 'checkbox') v[k] = el.checked; else if (k === 'runtime_measurements.removal_depth') (v[k] = v[k] || []).push(el.value); else v[k] = el.value; }
      else if (el.classList.contains('pick') || el.classList.contains('gate')) { const on = $$('button.on', el).map(b => b.dataset.v); v[k] = el.classList.contains('multi') ? on : (on[0] || ''); }
      else if (el.classList.contains('timer')) v[k] = el.dataset.start || '';
    });
    return v;
  }
  function restoreDraft(sec) {
    let d = null; try { d = JSON.parse(localStorage.getItem(DKEY()) || 'null'); } catch (e) { }
    if (!d) return; G.ids = d.ids || {};
    const pts = d.v['runtime_measurements.removal_depth'] || [];
    while (points(sec).length < pts.length) addPoint(sec);
    $$('[data-bind]', sec).forEach(el => {
      const k = el.dataset.bind, x = d.v[k]; if (x == null) return;
      if (k === 'runtime_measurements.removal_depth') return;
      if (el.matches('input,textarea,select')) { if (el.type === 'checkbox') el.checked = !!x; else el.value = x; }
      else if (el.classList.contains('pick') || el.classList.contains('gate')) $$('button', el).forEach(b => b.classList.toggle('on', [].concat(x).includes(b.dataset.v)));
      else if (el.classList.contains('timer') && x) { el.dataset.start = x; tick(el); }
    });
    points(sec).forEach((i, n) => { if (pts[n] != null) i.value = pts[n]; });
  }
  function addPoint(sec) {
    const all = points(sec); const last = all[all.length - 1]; if (!last) return;
    const f = last.closest('.f').cloneNode(true); const inp = $('input', f); inp.value = ''; inp.required = false;
    $('label', f).firstChild.textContent = '점 ' + (all.length + 1) + ' '; const rq = $('label .rq', f); if (rq) rq.remove();   // 4번째부터는 필수 아님
    last.closest('.f').after(f);
  }
  function tick(el) { const s = el.dataset.start; if (!s) return; const m = Math.floor((Date.now() - Date.parse(s)) / 60000); const o = $('[data-out]', el); if (o) o.textContent = String(m); }
  async function writeGate(sec, final) {
    if (!G.zone) throw new Error(NOZONE);
    const mix = lotMix(sec); if (mix) throw new Error(mix);   // LOT 섞임은 임시저장도 막음 — material_usage 에 남기지 않음(CFSPS 011000 6.1 · 6.4 a) · 8.5.4 SHALL NOT · MSA-019)
    if (G.gateWhy) throw new Error(G.gateWhy);   // 앞 Gate 미합격이면 임시저장도 막음 — 기기 · 서버 어디에도 남기지 않음(MSA-030 B71)
    const S = SITE(), z = G.zone, st = G.std, v = collect(sec); G.ids = G.ids || {};
    const id = k => (G.ids[k] = G.ids[k] || uuid());
    const now = new Date().toISOString();
    try { localStorage.setItem(DKEY(), JSON.stringify({ v, ids: G.ids, at: now })); } catch (e) { }
    const hs = listState(sec);
    const main = hs.find(x => !x.safety);
    const gate = {
      id: G.id, site_id: S, zone_id: z.id, gate_number: st.gate_number, process_stage: st.process_stage || st.std_code, execution_no: G.exec, execution_cause: G.exec > 1 ? (G.cause || 'Rework') : null,
      checklist_items: { lists: hs.map(x => ({ code: x.code, safety: x.safety, list_id: x.list.id, rev_no: x.list.rev_no, values: x.vals })), ppe: v['process_gates.checklist_items#ppe'] || null },
      list_id: main ? main.list.id : null, candidate_decision: G.cand, result: final ? (v['process_gates.result'] || null) : null,
      checked_at: final ? now : null
    };
    // 새 회차 줄은 decision_ref 를 비워 올림 — 앞 회차 값을 물려 쓰면 올리자마자 「판단됨」(B296 · 세션5-119 ④ 가)
    await save('process_gates', gate);
    const cpOn = $('[data-bind^="construction_processes."]', sec);
    if (cpOn) await save('construction_processes', { id: id('cp'), site_id: S, zone_id: z.id, process_stage: gate.process_stage, std_code: st.std_code,
      started_at: v['construction_processes.started_at'] ? new Date(v['construction_processes.started_at']).toISOString() : null, completed_at: final ? now : null,
      area_processed_m2: v['construction_processes.area_processed_m2'] === undefined || v['construction_processes.area_processed_m2'] === '' ? null : Number(v['construction_processes.area_processed_m2']),
      equipment_used: v['construction_processes.equipment_used'] ? { equipment_id: v['construction_processes.equipment_used'] } : null });
    const pts = (v['runtime_measurements.removal_depth'] || []);
    for (let n = 0; n < pts.length; n++) if (pts[n] !== '') await save('runtime_measurements', { id: id('rm' + n), site_id: S, zone_id: z.id, gate_id: G.id, item: 'removal_depth', measurement_value: Number(pts[n]), unit: 'mm', measured_at: now });
    if (v['runtime_measurements.wet_minutes']) await save('runtime_measurements', { id: id('wet'), site_id: S, zone_id: z.id, gate_id: G.id, item: 'wet_minutes',
      measurement_value: Math.floor((Date.now() - Date.parse(v['runtime_measurements.wet_minutes'])) / 60000), unit: 'min', measured_at: now });
    const mid = v['material_usage.material_id'], lot = String(v['material_usage.lot_number'] || '').trim();   // C505-F03 G28 : 품목 · Lot 둘 다 NOT NULL — 하나라도 없으면 남기지 않고 알림(op04 자재 사용과 같은 꼴)
    if ((lot || v['material_usage.quantity_used']) && !(mid && lot)) toast('자재 사용은 품목과 Lot 이 둘 다 있어야 남습니다 — 게이트는 저장했습니다');
    if (mid && lot) await save('material_usage', { id: id('mu'), site_id: S, zone_id: z.id, material_id: mid, process_stage: gate.process_stage,
      lot_number: lot, lot_expiry: v['material_usage.lot_expiry'] ? v['material_usage.lot_expiry'] + '-01' : null,
      quantity_used: v['material_usage.quantity_used'] === '' || v['material_usage.quantity_used'] == null ? null : Number(v['material_usage.quantity_used']), unit: 'L', used_at: now });
    return gate;
  }

  // 고를 것이 DB 에서 — 장비(WMS 원본) · 구역(이 현장)
  async function fillOpts(sec) {
    for (const pk of $$('.pick[data-opts]', sec)) {
      if (pk.dataset.loaded) continue; pk.dataset.loaded = '1';
      if (pk.dataset.opts === 'zones') {
        pk.innerHTML = DATA.zones.map(z => `<button type="button" data-v="${esc(z.id)}"${z.id === ZONE() ? ' class="on"' : ''}>${esc(zlabel(z))} · ${esc(z.area_m2)}㎡</button>`).join('') || '<span class="why">구역이 없습니다 — 진단평가 5-5</span>';
        continue;
      }
      const rows = await q(pk.dataset.opts, 'select=id,eq_code,name,status&order=name').catch(() => []);
      pk.innerHTML = rows.filter(r => !r.status || r.status === 'active' || r.status === '사용').map(r => `<button type="button" data-v="${esc(r.id)}">${esc(r.name)}${r.eq_code ? ' <small>' + esc(r.eq_code) + '</small>' : ''}</button>`).join('')
        || '<span class="why">장비 목록이 비었습니다 — 15-3 장비 관리</span>';
    }
    for (const s of $$('select[data-opts="materials"]', sec)) {   // C505-F03 G28 : 밀봉제 품목 — material_usage.material_id NOT NULL(품목 없이 Lot 만 적으면 23502 로 거절되고 LOT 섞임 견줌이 늘 빔)
      if (s.dataset.loaded) continue; s.dataset.loaded = '1';
      const rows = await q('materials', 'select=id,name,unit&order=name.asc').catch(() => []);
      s.insertAdjacentHTML('beforeend', rows.map(r => `<option value="${esc(r.id)}">${esc(r.name)}${r.unit ? ' (' + esc(r.unit) + ')' : ''}</option>`).join(''));
    }
  }

  // ── 8-3 사전검사 · 8-10 제품검사 — 계측 (판정 아님 · 기준값 등록 · 작업반 막지 않음) ──
  const MS = {};   // { sid, kind, zone, n, mp, vals: {mp: {item: {pn: {v, out}}}}, ids, bench, locked }
  const ITEMS = sec => $$('.pgrid[data-item]', sec).map(g => ({ item: g.dataset.item, n: +g.dataset.n || 1, unit: g.dataset.unit, label: g.dataset.label, el: g }));
  const MKEY = () => `op05:measure:${MS.sid}:${MS.zone && MS.zone.id}`;
  function mpCount(area) {                       // 정의 MPRULE 「상한:MP수|…」 — 넘으면 마지막 수 + 잠정
    const rule = String(DEF.mprule || '').split('|').map(x => x.split(':').map(Number)).filter(x => x.length === 2 && !isNaN(x[0]));
    const hit = rule.find(([lim]) => Number(area) <= lim);
    return hit ? { n: hit[1], ok: true } : { n: rule.length ? rule[rule.length - 1][1] : 1, ok: false };
  }
  async function showMeasure(sec) {
    await loadSite();
    Object.keys(MS).forEach(k => delete MS[k]);
    const z = DATA.zones.find(x => x.id === ZONE());
    Object.assign(MS, { sid: sec.id, kind: sec.id === 'w08-3' ? 'pre' : 'prd', zone: z, mp: 1, vals: {}, ids: {} });
    await fillOpts(sec);
    const acts = $$('button[data-act]', sec);
    if (!z) { acts.forEach(b => block(b, '구역을 고르십시오 (위 「구역」)')); out(sec, 'mp.count', ''); return; }
    out(sec, 'zone.label', zlabel(z));
    const caseC = !!(DATA.diag && DATA.diag.case_type === 'C'), day0 = DEF.casec === '사전공사전';   // 정의 CASEC 줄(M1003-01) — 두 안 모두 담음
    if (MS.kind === 'pre' && caseC)
      slot(sec, 'pre.casec', day0 ? `${esc(zlabel(z))} · <b>Case C</b> — 사전검사는 <b>사전공사 착수 전</b>에 합니다(판정 #5). 그때 등록한 기준선이 있으면 황삭 뒤 다시 하지 않습니다.`
        : `${esc(zlabel(z))} · <b>Case C</b> — 사전검사도 <b>황삭 뒤</b>에 합니다(CFSPS-3.2 3.2.7 · 부대표 M1003-01). 사전공사 전에 잰 값은 진단평가 「초기 바닥 상태값」(보수 범위 근거)일 뿐 기준선이 아닙니다.`);
    MS.pregateWhy = '';
    const pg = Number(DEF.pregate || 0);                                  // 정의 PREGATE — 사전검사는 그 구역 Gate①(황삭) 「진행」 뒤(CFSPS-3.2 3.2.7 3))
    if (MS.kind === 'pre' && pg && !(caseC && day0)) {
      const gs = gatesOf(z.id, pg); const lg = gs[gs.length - 1];
      if (!lg || lg.result !== GO()) MS.pregateWhy = `이 구역 Gate${'①②③④⑤'[pg - 1] || pg}(황삭) 「${GO()}」 전입니다 — 사전검사는 황삭 면에서 잽니다(CFSPS-3.2 3.2.7)`;
    }
    const mc = mpCount(z.area_m2); MS.n = mc.n;
    out(sec, 'mp.count', mc.ok ? `${mc.n} MP (면적 ${z.area_m2}㎡)` : `${mc.n} MP ★잠정 — ${z.area_m2}㎡ 는 규칙 밖 · 품질팀장이 정함`);
    slot(sec, 'mp.norule', mc.ok ? '' : `${esc(zlabel(z))} ${esc(z.area_m2)}㎡ — 600㎡ 넘는 구역의 MP 수가 규칙(W-GL-Q075000 §B.3)에 없습니다. 품질팀장이 정해야 합니다 (지금 ${mc.n} MP 잠정).`);
    // 이 구역 기준선(사전검사 등록분) — 사전검사는 「이미 등록 = 잠김」 · 제품검사는 견줄 값
    MS.bench = await q('benchmarks', `site_id=eq.${SITE()}&zone_id=eq.${z.id}&select=id,item,benchmark_value,unit,derived_from,created_at`).catch(() => []);
    const node = MS.kind === 'pre' ? 'OP05-PRE' : 'OP05-PRD';
    MS.os = (await q('operation_states', `site_id=eq.${SITE()}&zone_id=eq.${z.id}&decision_node_id=eq.${node}&select=id,status,created_at,reviewed_at,approved_at,approver_person_name&order=created_at.desc&limit=1`).catch(() => []))[0] || null;
    { const l5 = MS.kind === 'prd' && MS.os && MS.os.status !== 'draft' ? gatesOf(z.id, 5).filter(g => g.result === GO() && g.checked_at).pop() : null;   // 재제품검사 — 앞 제품검사 뒤 Gate⑤ 를 다시 「진행」(판정 불합격 → 재작업) = 새 결재 줄 · 앞 줄(검토 · 승인 끝)은 다시 쓰지 않음(재검사 결과는 기존 검사 결과와 구분되어 기록 SHALL : CFSPS 9.8.3 · 제품검사 재수행 : OP07-J08-CAPA · B214)
      MS.prev = l5 && new Date(l5.checked_at) > new Date(MS.os.created_at) ? MS.os : null; MS.since = MS.prev ? l5.checked_at : null; if (MS.prev) MS.os = null; }
    MS.done = !!(MS.os && ['recorded', 'reviewed', 'approved'].includes(MS.os.status));
    MS.locked = MS.done || (MS.kind === 'pre' && MS.bench.length > 0);
    try { const d = JSON.parse(localStorage.getItem(MKEY()) || 'null'); if (d && !MS.locked && !(MS.prev && d.ids && d.ids.os === MS.prev.id)) { MS.vals = d.vals || {}; MS.ids = d.ids || {}; } } catch (e) { }
    await loadHolds(z);                                                   // B91 — 이 구역 함수율 Hold 줄(묶음 62)
    mpPicker(sec); grids(sec);
    await lists(sec);
    if (MS.kind === 'prd') {
      const g5 = gatesOf(z.id, 5); const l5 = g5[g5.length - 1];
      MS.gate5 = !!(l5 && l5.result === GO());
    }
    if (MS.locked) { $$('input,textarea,.pgrid button', sec).forEach(e => e.disabled = true); }
    else if (!canIn(sec)) $$('input,textarea,.pgrid button', sec).forEach(e => e.disabled = true);
    renderHold(sec); await holdList(sec);                                // B91 — Hold 줄 · 8-3 Hold 목록
    recalcM(sec);
  }
  function mpPicker(sec) {
    let box = $('[data-mp-pick]', sec);
    const host = ($('[data-out="mp.count"]', sec) || {}).closest ? $('[data-out="mp.count"]', sec).closest('.f') : $('.pgrid', sec);
    if (!box) { box = document.createElement('div'); box.className = 'f'; box.setAttribute('data-mp-pick', ''); host.after(box); }
    box.innerHTML = '<label>측정 지점 MP — 고르고 아래 탭에 적기</label><div class="mps">' +
      Array.from({ length: MS.n }, (_, i) => `<button type="button" class="b s${MS.mp === i + 1 ? ' on' : ''}" data-mp="${i + 1}">MP${i + 1}</button>`).join(' ') + '</div>';
  }
  function cell(it, pn) { const m = MS.vals[MS.mp] = MS.vals[MS.mp] || {}; const a = m[it] = m[it] || {}; return a[pn] = a[pn] || { v: '', out: false }; }
  function grids(sec) {
    for (const g of ITEMS(sec)) {
      g.el.innerHTML = `<div class="sod">MP${MS.mp} · ${esc(g.label)} — P1~P${g.n} · 단위 <b>${esc(g.unit)}</b> · 「이상」 = 대표값에서 뺌 (빼는 기준은 지침서 — 사람이 표시)</div><div class="pgw">` +
        Array.from({ length: g.n }, (_, i) => { const c = cell(g.item, i + 1);
          return `<div class="pg${c.out ? ' out' : ''}"><label>P${i + 1}</label><input class="v" type="number" inputmode="decimal" step="any" data-pg="${esc(g.item)}" data-pn="${i + 1}" value="${esc(c.v)}">`
            + `<button type="button" class="b s${c.out ? ' on' : ''}" data-outtg="${esc(g.item)}" data-pn="${i + 1}">이상</button></div>`; }).join('') + '</div>';
    }
  }
  function repOf(item) {                          // 모든 MP · 이상값 뺀 평균
    const xs = [], outs = [];
    for (const m of Object.values(MS.vals)) for (const c of Object.values((m || {})[item] || {})) if (c.v !== '' && !isNaN(+c.v)) (c.out ? outs : xs).push(+c.v);
    return { n: xs.length, out: outs.length, v: xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) / 100 : null };
  }
  // ── 함수율 Hold (B84 막음 · B91 기록) — 정의 HOLD 줄 「항목|한계|막는 항목|기록 표」 · 묶음 62 moisture_holds (QEMS W-GL-Q075000 6.6 · 6.7 · Annex F F-4) ──
  const HCFG = () => { const [it, lim, dep, tbl] = String(DEF.hold || '').split('|'); return { it, lim: +lim, dep, tbl: tbl || '', ok: !!it && lim != null && lim !== '' && !isNaN(+lim) }; };
  const STG = () => (MS.kind === 'pre' ? 'pre_inspection' : 'product');   // 62 mh_stage_chk 값 = measurement_points.stage 값
  const leadT = () => '품질팀장';   // 재초과 처리(보정계수 · Pn 제외) = 품질팀장 고정 — 결재 줄 검토가 부대표로 바뀌어도(10/8 MSA-022-1) 이 업무는 W-GL-Q075000 Annex F 대로 품질팀장
  const isLead = () => !!leadT() && !!C().title && C().title() === leadT();
  const hKey = (mp, pn) => `${mp}.${pn}`;
  const hWhere = x => `MP${x.mp_no || '?'}${x.pn_no ? ' · P' + x.pn_no : ''}`;
  const cellAt = (mp, it, pn) => { const m = MS.vals[mp] = MS.vals[mp] || {}; const a = m[it] = m[it] || {}; return a[pn] = a[pn] || { v: '', out: false }; };
  const HST = { hold: ['wait', '⏸ Hold — 건조 뒤 재계측'], escalated: ['bad', '⚠ 재계측도 넘음 — 품질팀장 보고'], released: ['ok', '✔ 재계측 — 진행'], closed: ['ok', '✔ 품질팀장 처리 끝'] };
  function repOfH(item) {                         // Hold 셈 — 이상 표시 · 품질팀장 처리 끝난 Pn 은 뺌
    const sk = MS.holdSkip || new Set(), xs = [];
    for (const [mp, m] of Object.entries(MS.vals)) for (const [pn, c] of Object.entries((m || {})[item] || {})) if (c.v !== '' && !isNaN(+c.v) && !c.out && !sk.has(hKey(mp, pn))) xs.push(+c.v);
    return { v: xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) / 100 : null };
  }
  function holdOver() {                           // 아직 기록하지 않은 「한계 넘은 Pn」 (넘은 Pn 마다 한 줄 — F-4 e 「해당 Pn 제외」 와 같은 낱)
    const h = HCFG(); if (!h.ok) return [];
    const sk = MS.holdSkip || new Set(), had = new Set((MS.holds || []).filter(x => x.status === 'hold' || x.status === 'escalated').map(x => hKey(x.mp_no, x.pn_no)));
    const rows = [];
    for (const [mp, m] of Object.entries(MS.vals)) for (const [pn, c] of Object.entries((m || {})[h.it] || {}))
      if (c.v !== '' && !isNaN(+c.v) && !c.out && +c.v > h.lim && !sk.has(hKey(mp, pn)) && !had.has(hKey(mp, pn))) rows.push({ mp: +mp, pn: +pn, v: +c.v });
    return rows;
  }
  function holdWhy() {                             // ★B84 · B91 — 사전검사 · 제품검사 둘 다
    const h = HCFG(); if (!h.ok) return '';
    const hs = MS.holds || [], open = hs.filter(x => x.status === 'hold'), up = hs.filter(x => x.status === 'escalated');
    if (open.length) return `함수율 Hold 중 — ${hWhere(open[0])} ${open[0].moisture_value} %${open.length > 1 ? ' 외 ' + (open.length - 1) + ' 점' : ''} · 건조 뒤 재계측 값을 「함수율 Hold 기록」에 넣으십시오 (W-GL-Q075000 Annex F F-4 c)`;
    if (up.length) return `재계측도 ${h.lim} % 를 넘어 품질팀장에게 보고했습니다 — 품질팀장이 「보정계수 · Pn 제외」를 정한 뒤 표면강도를 잽니다 (W-GL-Q075000 Annex F F-4 e)`;
    const m = repOfH(h.it), d = h.dep ? repOf(h.dep) : { n: 0, out: 0 };
    if (m.v == null) return d.n + d.out ? `함수율을 먼저 재십시오 — 표면강도는 함수율이 ${h.lim} % 이하인 것을 본 뒤에 잽니다 (W-GL-Q075000 6.6)` : '';
    if (m.v > h.lim) return `함수율 ${m.v} % — ${h.lim} % 를 넘어 표면강도 계측을 보류(Hold)합니다 · 건조 뒤 함수율부터 다시 재십시오 (W-GL-Q075000 Annex F)`;
    return '';
  }
  async function holdNos(rs) {                     // Hold 줄 → MP · Pn 번호 (기기가 바뀌어도 같은 자리를 찾음)
    if (!rs.length) return [];
    const mps = [...new Set(rs.map(x => x.mp_id).filter(Boolean))], sps = [...new Set(rs.map(x => x.sub_point_id).filter(Boolean))];
    const pm = mps.length ? await q('measurement_points', `id=in.(${mps.join(',')})&select=id,mp_number`).catch(() => []) : [];
    const ps = sps.length ? await q('measurement_sub_points', `id=in.(${sps.join(',')})&select=id,pn_number`).catch(() => []) : [];
    return rs.map(x => ({ ...x, mp_no: (pm.find(p => p.id === x.mp_id) || {}).mp_number || null, pn_no: (ps.find(p => p.id === x.sub_point_id) || {}).pn_number || null }));
  }
  async function loadHolds(z) {                    // 이 구역 · 이 검사의 Hold 줄 — 열린 것(hold · escalated)은 표면강도를 막음 · 끝난 것은 칸에 되비춤
    const h = HCFG(); MS.holds = []; MS.holdSkip = new Set(); if (!h.ok || !h.tbl) return;
    MS.holds = await holdNos((await q(h.tbl, `site_id=eq.${SITE()}&zone_id=eq.${z.id}&stage=eq.${STG()}&select=id,mp_id,sub_point_id,moisture_value,reason,status,remeasure_value,resolution,resolution_note,held_at&order=held_at`).catch(() => []))
      .filter(x => !MS.since || !x.held_at || new Date(x.held_at) > new Date(MS.since)));   // B223 — 재제품검사는 Gate⑤ 다시 「진행」 뒤 Hold 줄만(앞 차수 MP · Pn 줄 id · 「Pn 제외」를 새 차수에 다시 쓰지 않음 — 재검사 결과는 기존 검사 결과와 구분 기록 SHALL : CFSPS 9.8.3)
    for (const x of MS.holds) {
      if (!x.mp_no) continue;
      if (!MS.ids['mp' + x.mp_no]) MS.ids['mp' + x.mp_no] = x.mp_id;                                   // 같은 MP 줄을 다시 씀 — MP 를 새로 뽑지 않음
      if (x.pn_no && x.sub_point_id && !MS.ids[`sp${x.mp_no}.${h.it}.${x.pn_no}`]) MS.ids[`sp${x.mp_no}.${h.it}.${x.pn_no}`] = x.sub_point_id;
      const c = x.pn_no ? (((MS.vals[x.mp_no] || {})[h.it]) || {})[x.pn_no] : null;
      if (x.status === 'released' && c && +c.v === +x.moisture_value && x.remeasure_value != null) c.v = String(x.remeasure_value);   // 재계측 값으로 바꿈
      if (x.status === 'closed') { MS.holdSkip.add(hKey(x.mp_no, x.pn_no)); if (x.resolution === 'Pn 제외' && c) c.out = true; }
    }
  }
  function holdLine(x, ctl) {
    const [k, t] = HST[x.status] || ['wait', x.status];
    const tail = x.remeasure_value != null ? ` · 재계측 <b>${esc(x.remeasure_value)} %</b>` : '';
    return `<div class="hrow st-${k}" data-hid="${esc(x.id)}"><div class="hl"><b>${esc(hWhere(x))}</b> · 함수율 <b>${esc(x.moisture_value)} %</b>${tail} · <span class="hs">${t}</span>${x.resolution ? ' · ' + esc(x.resolution) : ''}</div>`
      + `<div class="hr">사유 — ${esc(x.reason || '')}</div>${ctl || ''}</div>`;
  }
  function renderHold(sec) {                       // 이 구역 Hold 줄 — 막힘 ⚠ · 기다림 ⏸ 를 위로 · 줄마다 재계측 칸 · 품질팀장 처리 고르기
    const box = $('[data-hold]', sec), g = box && $('[data-grid="hold-open"]', box); if (!g) return;
    const ord = { escalated: 0, hold: 1, released: 2, closed: 3 }, resol = (box.dataset.resol || '').split('|').filter(Boolean);
    g.innerHTML = (MS.holds || []).slice().sort((a, b) => ord[a.status] - ord[b.status]).map(x => holdLine(x,
      x.status === 'hold' ? `<div class="hc"><input class="v" type="number" inputmode="decimal" step="any" min="0" max="100" data-hold-re="${esc(x.id)}" placeholder="건조 뒤 재계측 함수율 %">`
        + `<button type="button" class="b s" data-act="hold-re" data-hid="${esc(x.id)}" data-online="재계측 값은 올라가야 남습니다.">재계측 올림</button></div>`
      : x.status === 'escalated' ? `<div class="hc"><div class="pick" data-name="hold.res.${esc(x.id)}">${resol.map(r => `<button type="button" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>`
        + `<input class="v" type="text" data-hold-note="${esc(x.id)}" maxlength="1000" placeholder="처리 메모 — 있으면"><button type="button" class="b s" data-act="hold-close" data-hid="${esc(x.id)}" data-online="처리는 올라가야 남습니다.">처리 — ${esc(leadT() || '품질팀장')}</button></div>` : '')).join('');
  }
  function holdShow(sec, hold) {                   // 카드 보이기 · 지금 줄 · 표면강도 칸 막기(Hold 중일 때만 — 함수율이 비었을 때는 막지 않고 단추만 막음)
    const h = HCFG(), box = $('[data-hold]', sec); if (!h.ok) return;
    const over = holdOver(), hs = MS.holds || [];
    if (box) {
      box.hidden = !(over.length || hs.length);
      out(sec, 'hold.now', over.length ? `⏸ 기록할 Hold ${over.length} 점 — ${over.slice(0, 4).map(o => `MP${o.mp} · P${o.pn} ${o.v} %`).join(' / ')} · 사유를 고르고 「Hold 기록」을 누르십시오 (F-4 b)`
        : hs.some(x => x.status === 'hold' || x.status === 'escalated') ? hold : '✔ 열린 Hold 없음 — 표면강도를 잽니다');
    }
    const dep = h.dep && $(`.pgrid[data-item="${h.dep}"]`, sec); if (!dep) return;
    const stop = !!hold && !/^함수율을 먼저/.test(hold);
    $$('input,button', dep).forEach(i => { if (stop) { if (!i.disabled) { i.disabled = true; i.dataset.hstop = '1'; } } else if (i.dataset.hstop) { i.disabled = false; delete i.dataset.hstop; } });
    const n = $(':scope>.hstop', dep);
    if (stop && !n) dep.insertAdjacentHTML('afterbegin', '<div class="hstop">⏸ 표면강도 계측 보류(Hold) — 함수율이 기준을 넘었습니다 · 「함수율」 탭에서 Hold 를 기록하고 건조 뒤 재계측하십시오</div>');
    else if (!stop && n) n.remove();
  }
  function holdBtnWhy(sec, b, writer) {
    const a = b.dataset.act;
    if (a === 'hold-close') return isLead() ? '' : `재초과 처리(보정계수 · Pn 제외)는 ${leadT() || '품질팀장'}(결재 줄 검토)이 합니다 — 지금 계정 「${(C().title && C().title()) || '직함 없음'}」`;
    if (!writer && !isLead()) return `쓰기 권한(${sec.dataset.can})이 없습니다 — 보기만`;
    if (a === 'hold-rec') return MS.locked ? '이 구역 기록은 이미 잠겼습니다 — 고치지 않습니다' : holdOver().length ? '' : `함수율이 ${HCFG().lim} % 를 넘는 점이 없습니다 — Hold 기록할 것 없음`;
    return '';
  }
  async function recordHold(sec) {                 // 넘은 Pn 마다 hold 한 줄 — MP · Pn 자리를 먼저(62 외래 키) · 계측값은 보내지 않음 · 넣은 사람 · 때 · 상태는 DB 가 넣음
    const h = HCFG(); if (!h.tbl) throw new Error('Hold 기록 표가 정의에 없습니다 (HOLD 줄 넷째 칸)');
    const box = $('[data-hold]', sec), pk = $('.pick[data-name="hold.reason"] button.on', box), note = (($('[data-hold-in="note"]', box) || {}).value || '').trim();
    const reason = [pk ? (pk.dataset.v || pk.textContent.trim()) : '', note].filter(Boolean).join(' — ').slice(0, 500);
    if (!reason) throw new Error('사유를 고르거나 적으십시오 — Hold · 함수율 값 · 사유는 꼭 남깁니다 (W-GL-Q075000 Annex F F-4 b)');
    const over = holdOver(); if (!over.length) throw new Error(`함수율이 ${h.lim} % 를 넘는 점이 없습니다 — Hold 기록할 것 없음`);
    const S = SITE(), z = MS.zone, now = new Date().toISOString(), id = k => (MS.ids[k] = MS.ids[k] || uuid()), sent = new Set();
    for (const o of over) {                        // ① 자리 먼저 — MP(한 번만) · Pn
      const mpId = id('mp' + o.mp), sp = id(`sp${o.mp}.${h.it}.${o.pn}`);
      if (!sent.has(mpId)) { sent.add(mpId); await save('measurement_points', { id: mpId, site_id: S, zone_id: z.id, mp_number: o.mp, stage: STG() }); }
      await save('measurement_sub_points', { id: sp, mp_id: mpId, pn_number: o.pn, measurement_type: h.it });
    }
    await new Promise(r => setTimeout(r, 5));      // ★올리기 차례 = made_at(ms) — 같은 ms 면 뒤섞여 Hold 가 Pn 보다 먼저 닿음(62 s62_mh_pn) · 자리 줄보다 늦게 쌓이게
    for (const o of over) {                        // ② Hold 줄
      const mpId = MS.ids['mp' + o.mp], sp = MS.ids[`sp${o.mp}.${h.it}.${o.pn}`], hid = uuid();
      await save(h.tbl, { id: hid, site_id: S, zone_id: z.id, stage: STG(), mp_id: mpId, sub_point_id: sp, moisture_value: o.v, reason }, { op: 'insert' });
      MS.holds.push({ id: hid, mp_id: mpId, sub_point_id: sp, moisture_value: o.v, reason, status: 'hold', held_at: now, mp_no: o.mp, pn_no: o.pn });
    }
    try { localStorage.setItem(MKEY(), JSON.stringify({ vals: MS.vals, ids: MS.ids, at: now })); } catch (e) { }
    return over.length;
  }
  async function remeasureHold(sec, hid) {         // 재계측 — ≤ 한계 released · > 한계 escalated(품질팀장 보고) · 재계측한 사람 · 때는 DB 가 넣음
    const h = HCFG(), x = (MS.holds || []).find(r => r.id === hid); if (!x) throw new Error('Hold 줄을 찾지 못했습니다 — 화면을 다시 여십시오');
    const raw = (($(`[data-hold-re="${hid}"]`, sec) || {}).value || '').trim(), v = +raw;
    if (raw === '' || isNaN(v) || v < 0 || v > 100) throw new Error('재계측 함수율을 0 ~ 100 % 숫자로 넣으십시오');
    const st = v <= h.lim ? 'released' : 'escalated';
    await save(h.tbl, { id: hid, status: st, remeasure_value: v }, { op: 'update' });
    Object.assign(x, { status: st, remeasure_value: v });
    if (st === 'released' && x.mp_no && x.pn_no) cellAt(x.mp_no, h.it, x.pn_no).v = String(v);
    return st;
  }
  async function closeHold(sec, hid) {             // 재초과 처리 — 결재 줄 검토 직함(품질팀장)만 · 보정계수(KS F 2730 · MAY) 또는 Pn 제외
    const h = HCFG(), x = (MS.holds || []).find(r => r.id === hid); if (!x) throw new Error('Hold 줄을 찾지 못했습니다 — 화면을 다시 여십시오');
    if (!isLead()) throw new Error(holdBtnWhy(sec, { dataset: { act: 'hold-close' } }, false));
    const pk = $(`.pick[data-name="hold.res.${hid}"] button.on`, sec); if (!pk) throw new Error('처리를 고르십시오 — 보정계수 · Pn 제외 (W-GL-Q075000 Annex F F-4 e)');
    const res = pk.dataset.v, note = (($(`[data-hold-note="${hid}"]`, sec) || {}).value || '').trim() || null;
    await save(h.tbl, { id: hid, status: 'closed', resolution: res, resolution_note: note }, { op: 'update' });
    Object.assign(x, { status: 'closed', resolution: res, resolution_note: note });
    MS.holdSkip.add(hKey(x.mp_no, x.pn_no)); if (res === 'Pn 제외' && x.mp_no && x.pn_no) cellAt(x.mp_no, h.it, x.pn_no).out = true;
    return res;
  }
  async function holdList(sec) {                   // 8-3 Hold 목록 — 이 현장 열린 것(정의 HOLDLIST 상태 값) · 사전검사 · 제품검사 둘 다 · 보기만
    const g = $('[data-grid="hold-list"]', sec), h = HCFG(); if (!g || !h.tbl) return;
    const st = (g.dataset.st || 'hold|escalated').split('|').filter(Boolean), ord = { escalated: 0, hold: 1, released: 2, closed: 3 };
    const db = await holdNos(await q(h.tbl, `site_id=eq.${SITE()}&status=in.(${st.join(',')})&select=id,zone_id,stage,mp_id,sub_point_id,moisture_value,reason,status,remeasure_value,held_at&order=held_at`).catch(() => []));
    const mine = MS.sid === sec.id && MS.zone ? (MS.holds || []).map(x => ({ ...x, zone_id: MS.zone.id, stage: STG() })) : [];   // 이 기기에서 방금 바꾼 줄이 먼저(올리기 전 다시 읽어도 옛 상태가 안 보이게)
    const rs = [...mine, ...db.filter(x => !mine.some(m => m.id === x.id))].filter(x => st.includes(x.status)).sort((a, b) => ord[a.status] - ord[b.status]);
    g.innerHTML = rs.length ? '<div class="tbw"><table class="tb"><tr><th>구역</th><th>검사</th><th>자리</th><th class="n">함수율 %</th><th>상태</th><th>넣은 때</th></tr>' + rs.map(x => { const [k, t] = HST[x.status] || ['wait', x.status];
      return `<tr class="st-${k}"><td>${esc(zlabel(DATA.zones.find(z => z.id === x.zone_id)))}</td><td>${x.stage === 'product' ? '제품검사' : '사전검사'}</td><td>${esc(hWhere(x))}</td>`
        + `<td class="n">${esc(x.moisture_value)}${x.remeasure_value != null ? ' → ' + esc(x.remeasure_value) : ''}</td><td>${t}</td><td>${x.held_at ? esc(new Date(x.held_at).toLocaleString('ko-KR')) : ''}</td></tr>`; }).join('') + '</table></div>'   // 표 가로 밀림(공통 .tbw — 동적 표는 직접 감쌈 · 390 넘침 0)
      : '<div class="hnone">✔ 이 현장에 열린 함수율 Hold 가 없습니다</div>';
  }
  function recalcM(sec) {
    if (!MS.zone || MS.sid !== sec.id) return;
    const its = ITEMS(sec); const reps = {};
    for (const g of its) { const r = repOf(g.item); reps[g.item] = r;
      out(sec, 'rep.' + g.item, r.v == null ? '' : `${r.v} ${g.unit} — ${r.n}점${r.out ? ' · 이상값 ' + r.out + ' 뺌' : ''}${MS.kind === 'prd' ? cmpTxt(g.item, r.v, g.unit) : ''} · 자동 확정 아님`); }
    out(sec, 'when', `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${zlabel(MS.zone)} · MP1~${MS.n}`);
    const tb = $('[data-grid="rep-table"]', sec);
    if (tb) tb.innerHTML = '<table class="tb"><tr><th>구역</th>' + its.map(g => `<th class="n">${esc(g.label)} (${esc(g.unit)})</th>`).join('') + '<th>상태</th></tr>'
      + `<tr><td>${esc(zlabel(MS.zone))}</td>` + its.map(g => `<td class="n">${reps[g.item].v == null ? '—' : reps[g.item].v}</td>`).join('')
      + `<td>${MS.locked ? '✓ 기준선 등록됨 (잠김)' : '후보 — 품질팀장 등록 전'}</td></tr></table>`;
    appr(sec);
    const empty = its.filter(g => reps[g.item].v == null).map(g => g.label);
    const ckMiss = listState(sec).flatMap(h => h.vals.filter(x => x.value == null).map(x => x.label));
    const writer = canIn(sec), hold = holdWhy();                       // 작성 단추도 결재 줄 작성 직함(품질팀원)에 엶 — 새 권한 이름 없음(부대표 ㉮ 50fef24cbb · 세션7-063) · 검토 · 승인은 apprWhy + DB
    for (const b of $$('button[data-act]', sec)) {
      const a = b.dataset.act; let why = '';
      if (a === 'hold-rec' || a === 'hold-re' || a === 'hold-close') { block(b, holdBtnWhy(sec, b, writer)); continue; }   // B91 — Hold 단추는 Hold 를 풀려고 있음(막는 까닭 따로)
      if (a === 'appr') { block(b, apprWhy(+b.dataset.step)); continue; }
      if (MS.locked) why = lockWhy();
      else if (!writer && a !== 'register') why = `쓰기 권한(${sec.dataset.can})이 없습니다 — 보기만`;
      else if (hold) why = hold;                     // B84 — 계측이 빈 것보다 먼저(Hold 면 강도는 비워 두는 게 맞음)
      else if (empty.length) why = `계측이 비었습니다 — ${empty.join(' · ')}`;
      else if (ckMiss.length) why = `착수 조건을 채우십시오 — ${ckMiss.slice(0, 3).join(' · ')}`;
      else if (a === 'pre-done' && MS.pregateWhy) why = MS.pregateWhy;
      else if (a === 'prd-done' && !MS.gate5) why = `Gate⑤(중삭 2차) 「${GO()}」 판단 전입니다 — 제품검사 착수 조건`;
      else if (a === 'prd-done' && !MS.bench.length) why = '이 구역 기준선(사전검사 등록분)이 없습니다 — 견줄 값이 없음';
      block(b, why);
    }
    block($('button[data-save]', sec), MS.locked ? lockWhy() : '');   // 잠긴 화면 임시저장도 막음(B214 — 잠긴 결재 줄을 다시 보내면 42501)
    holdShow(sec, hold);
  }
  const lockWhy = () => MS.kind === 'pre' ? '이 구역 기준값은 이미 등록되어 잠겼습니다 — 고치지 않습니다' : '이 구역 제품검사는 이미 올라가 잠겼습니다 — 고치지 않습니다';
  function cmpTxt(item, v, unit) { const b = (MS.bench || []).find(x => x.item === item); return b ? ` · 기준선 ${b.benchmark_value} ${b.unit || unit}` : ' · 기준선 없음'; }
  const STEPS = ['recorded', 'reviewed', 'approved'];   // 결재 차례 = 정의 APPRLINE (작성 → 검토 → 승인) · 누가 = DB 가 넣음(§7 ③)
  const stepNo = () => (MS.os ? STEPS.indexOf(MS.os.status) : -1);
  const me = () => { try { return localStorage.getItem('ces_user_id') || ''; } catch (e) { return ''; } };
  function apprWhy(i) {
    const k = stepNo();
    if (k < 0) return '작성이 아직 올라가지 않았습니다';
    if (k >= i) return '이미 ' + (i === 1 ? '검토' : '승인') + '했습니다';
    if (k < i - 1) return '앞 결재(검토)가 먼저입니다 — 차례를 건너뛰지 않습니다';
    if (MS.os && me() && MS.os.created_by === me()) return '작성한 계정은 같은 건을 ' + (i === 1 ? '검토' : '승인') + '할 수 없습니다(계정 기준)';   // 화면 몫 — DB 가드(묶음 56)가 다시 봄
    return '';
  }
  function appr(sec) {
    const cells = $$('[data-appr] [data-step]', sec).filter(c => c.hasAttribute('data-role')); if (!cells.length) return;
    const k = stepNo(), t = x => x ? new Date(x).toLocaleString('ko-KR') : '';
    cells.forEach((c, i) => {
      const st = i <= k ? '✓ ' + (i === 0 ? '작성' : i === 1 ? '검토' : '승인') : (i === k + 1 ? '⏳ 차례' : '—');
      out(sec, `appr.${i}.s`, st);
      out(sec, `appr.${i}.nm`, i === 0 ? (MS.os ? t(MS.os.created_at) : (localStorage.getItem('ces_user_name') || '')) : i === 1 ? t(MS.os && MS.os.reviewed_at) : t(MS.os && MS.os.approved_at) + (MS.os && MS.os.approver_person_name ? ' · ' + MS.os.approver_person_name : ''));
    });
  }
  async function apprStep(sec, i) {                 // 결재 한 걸음 — 상태만 보냄 · 결재한 분 · 때 · 직함 · 같은 사람 막기는 DB(세션7 묶음 erp.approval_guard)
    const r = await C().save('operation_states', { id: MS.os.id, status: STEPS[i] }, { op: 'update' });
    if (r === 0 || r == null || r === '' || (Array.isArray(r) && !r.length)) { toast((i === 1 ? '검토' : '승인') + ' 올리지 못했습니다 — 바뀐 줄이 0 줄입니다(결재 권한 · 같은 계정 · 이미 처리됨을 확인)'); return; }   // 0 줄을 성공으로 보지 않음
    MS.os.status = STEPS[i]; MS.os[i === 1 ? 'reviewed_at' : 'approved_at'] = new Date().toISOString(); recalcM(sec);
    toast((i === 1 ? '검토' : '승인') + ' 올림 — 작업반 · 다음 공정은 결재를 기다리지 않습니다');
  }
  async function writeMeasure(sec, mode) {         // mode : draft · done · register
    if (!MS.zone) throw new Error(NOZONE);
    if (MS.locked) throw new Error(lockWhy());   // B214 — 잠긴 건은 임시저장도 보내지 않음(머리 · MP 줄이 먼저 들어가고 결재 줄만 42501 로 떨어지던 것)
    { const hw = holdWhy(); if (hw) throw new Error(hw); }   // B84 — 함수율 Hold · 차례 어김은 임시저장도 막음 — 서버 · 기기 어디에도 남기지 않음(B71 과 같은 꼴)
    const S = SITE(), z = MS.zone, now = new Date().toISOString(), id = k => (MS.ids[k] = MS.ids[k] || uuid());
    const v = collect(sec); const hs = listState(sec); const main = hs.find(h => !h.safety);
    const head = id('head');
    if (MS.kind === 'pre') await save('pre_inspections', { id: head, site_id: S, zone_code: 'Z' + z.zone_number, inspection_date: now.slice(0, 10), inspector_name: localStorage.getItem('ces_user_name') || null,
      defect_detected: !!String(v['pre_inspections.defect_desc'] || '').trim(), defect_desc: v['pre_inspections.defect_desc'] || null });
    else await save('product_inspections', { id: head, site_id: S, zone_id: z.id, inspection_date: now.slice(0, 10), inspector_name: localStorage.getItem('ces_user_name') || null, gate4_passed: !!MS.gate5 });   // gate4_passed = Gate⑤ (이름이 틀림 — 대조표 고칠 것)
    if (MS.os && MS.os.id) MS.ids.os = MS.ids.os || MS.os.id;
    await save('operation_states', { id: id('os'), site_id: S, zone_id: z.id, op_code: 'OP05', decision_node_id: MS.kind === 'pre' ? 'OP05-PRE' : 'OP05-PRD', status: mode === 'draft' ? 'draft' : 'recorded',
      list_id: main ? main.list.id : null, payload: { record_id: head, checks: hs.map(h => ({ code: h.code, list_id: h.list.id, rev_no: h.list.rev_no, values: h.vals })) } });
    for (let mp = 1; mp <= MS.n; mp++) {
      const m = MS.vals[mp]; if (!m) continue;
      const mpId = id('mp' + mp);
      await save('measurement_points', { id: mpId, site_id: S, zone_id: z.id, mp_number: mp, stage: MS.kind === 'pre' ? 'pre_inspection' : 'product' });   // 표 검사 mp_stage_chk 값(세션7-063)
      for (const [item, pns] of Object.entries(m)) for (const [pn, c] of Object.entries(pns)) {
        if (c.v === '' || isNaN(+c.v)) continue;
        const sp = id(`sp${mp}.${item}.${pn}`);
        await save('measurement_sub_points', { id: sp, mp_id: mpId, pn_number: +pn, measurement_type: item });
        if (MS.kind === 'pre') await save('benchmark_values', { id: id(`bv${mp}.${item}.${pn}`), pre_inspection_id: head, sub_point_id: sp, [item]: +c.v, is_outlier: !!c.out, registered_at: now });
        else await save('product_inspection_measurements', { id: id(`pm${mp}.${item}.${pn}`), product_inspection_id: head, sub_point_id: sp, measurement_type: item, measured_value: +c.v, measured_at: now });
      }
    }
    const its = ITEMS(sec);
    if (MS.kind === 'prd' && mode === 'done') for (const g of its) { const r = repOf(g.item); const b = MS.bench.find(x => x.item === g.item);
      await save('asbuilt_records', { id: id('ab.' + g.item), site_id: S, zone_id: z.id, item: g.item, asbuilt_value: r.v, unit: g.unit, benchmark_ref: b ? b.id : null }); }
    if (MS.kind === 'pre' && mode === 'done') for (const g of its) { const r = repOf(g.item);   // ★기준값 등록 = 작성(품질팀원) 때 — 결재를 기다리지 않음(007 · 014)
      await save('benchmarks', { id: id('bm.' + g.item), site_id: S, zone_id: z.id, item: g.item, benchmark_value: r.v, unit: g.unit, measurement_method: '사전검사 ' + g.label + ' · 이상값 뺀 평균', derived_from: head }); }
    try { localStorage.setItem(MKEY(), JSON.stringify({ vals: MS.vals, ids: MS.ids, at: now })); } catch (e) { }
    if (mode === 'done') MS.os = { id: MS.ids.os, status: 'recorded', created_at: now };
  }

  // ── 8-4 범위 밖 결함 — 막지 않음 · 기록은 넣기만(quality_maps 고치기 권한 없음 — 저장 = 새 줄 · 맨 뒤 줄이 지금) ──
  const OO = {};
  async function showOOS(sec) {
    await loadSite(); Object.keys(OO).forEach(k => delete OO[k]);
    const z = DATA.zones.find(x => x.id === ZONE()); OO.zone = z; OO.sid = sec.id;
    await fillOpts(sec);
    if (!z) { $$('button[data-act]', sec).forEach(b => block(b, '구역이 정해지지 않았습니다 — 진행판(8-1)의 범위 밖 띠에서 들어오십시오')); return; }
    out(sec, 'zone.label', zlabel(z));
    const rs = await q('quality_maps', `site_id=eq.${SITE()}&zone_id=eq.${z.id}&out_of_scope=is.true&select=*&order=created_at.desc`).catch(() => []);
    OO.last = rs[0] || null;
    const L = OO.last || {};
    out(sec, 'oos.where', OO.last ? `${zlabel(z)} · ${L.map_type || '결함 기록'} · 발견 ${L.detected_at ? new Date(L.detected_at).toLocaleString('ko-KR') : '—'}` : `${zlabel(z)} · 이 구역 범위 밖 기록이 아직 없습니다 — 새로 적습니다`);
    const setPick = (bind, v) => $$(`.pick[data-bind="${bind}"] button`, sec).forEach(b => b.classList.toggle('on', b.dataset.v === v));
    setPick('quality_maps.defect_type', L.defect_type); setPick('quality_maps.scope_route', L.scope_route);
    for (const [k, v] of [['quality_maps.length_mm', L.length_mm], ['quality_maps.crack_width_mm', L.crack_width_mm], ['quality_maps.spatial_ref', L.spatial_ref], ['quality_maps.scope_rationale', L.scope_rationale]]) {
      const el = $(`[data-bind="${k}"]`, sec); if (el && v != null) el.value = typeof v === 'object' ? JSON.stringify(v) : v; }
    out(sec, 'quality_maps.customer_notified_at', L.customer_notified_at ? new Date(L.customer_notified_at).toLocaleString('ko-KR') : '아직 알리지 않음');
    out(sec, 'quality_maps.customer_ack_at', L.customer_ack_at ? new Date(L.customer_ack_at).toLocaleString('ko-KR') : '⏳ 아직 — 고객은 계정이 없습니다(받은 때만 남김)');
    if (!can(sec.dataset.can)) $$('input,textarea,.pick button', sec).forEach(e => e.disabled = true);
    recalcO(sec);
  }
  function recalcO(sec) {
    if (OO.sid !== sec.id || !OO.zone) return;
    const v = collect(sec), w = !can(sec.dataset.can) ? `쓰기 권한(${sec.dataset.can})이 없습니다 — 보기만` : '';
    for (const b of $$('button[data-act]', sec)) {
      if (b.dataset.act === 'oos-save') block(b, '');                // ★본공사 진행판으로 가는 길은 막지 않음
      if (b.dataset.act === 'oos-notify') block(b, w || (!v['quality_maps.defect_type'] ? '네 가지 중 무엇인지 고르십시오' : !String(v['quality_maps.scope_rationale'] || '').trim() ? '왜 우리 범위 밖인지 적으십시오' : !v['quality_maps.scope_route'] ? '다음 갈래를 고르십시오 — 고르기 전엔 고객에게 알리지 않습니다' : ''));
    }
  }
  async function writeOOS(sec, notify) {
    const v = collect(sec), L = OO.last || {}, now = new Date().toISOString(), num = x => x === '' || x == null ? null : Number(x);
    // C505-F03 G29 : spatial_ref 는 uuid 칸(→ spatial_refs.id) — 적은 자리 글({text}) 을 넣으면 22P02 로 거절됨. uuid 꼴만 그 칸에, 글은 범위 밖 까닭 끝에 「자리 :」 로 남김(DB 문안에 글 칸이 서면 그리로)
    const isU = x => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || '').trim());
    const sp = String(v['quality_maps.spatial_ref'] || '').trim(), why = String(v['quality_maps.scope_rationale'] || '').trim(), spTxt = sp && !isU(sp) ? `자리 : ${sp}` : '';
    const notice = notify ? `범위 밖 결함 알림(고객판) — ${v['quality_maps.defect_type'] || L.defect_type || ''} · 다음 갈래 ${v['quality_maps.scope_route'] || ''}` : (L.customer_notice || null);   // customer_notified_at 이 있으면 customer_notice 가 비면 안 됨(CHECK)
    const row = { id: uuid(), site_id: SITE(), zone_id: OO.zone.id, map_type: L.map_type || 'out_of_scope', out_of_scope: true, detected_at: L.detected_at || now,
      defect_type: v['quality_maps.defect_type'] || L.defect_type || null, length_mm: num(v['quality_maps.length_mm']), crack_width_mm: num(v['quality_maps.crack_width_mm']),
      spatial_ref: isU(sp) ? sp : (isU(L.spatial_ref) ? L.spatial_ref : null), scope_rationale: (spTxt && !why.includes(spTxt) ? (why ? why + '\n' : '') + spTxt : why) || null,
      scope_route: v['quality_maps.scope_route'] || null, scope_decided_at: now, customer_notified_at: notify ? now : (L.customer_notified_at || null), customer_notice: notice, customer_ack_at: L.customer_ack_at || null };
    if (!can(sec.dataset.can)) return null;          // 보기만 — 적지 않고 지나감
    await C().save('quality_maps', row, { op: 'insert' }); OO.last = row; return row;
  }

  // ── 8-11 공사일지 — 같은 현장 같은 날 하나 · 올리면 잠김 · 구역마다 한 일은 공정 기록에서 끌려옴 ──
  const DL = {};
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  async function showLog(sec) {
    await loadSite(); Object.keys(DL).forEach(k => delete DL[k]); DL.sid = sec.id; DL.day = today();
    const rs = await q('daily_logs', `site_id=eq.${SITE()}&log_date=eq.${DL.day}&select=*&limit=1`).catch(() => []);
    DL.row = rs[0] || null; DL.id = DL.row ? DL.row.id : uuid(); DL.locked = !!(DL.row && DL.row.submitted_at);
    out(sec, 'daily_logs.log_date', `${DL.day} · 날씨 · 기온은 직접 적습니다`);
    const R = DL.row || {};
    for (const [k, v] of [['daily_logs.crew_vendor', R.crew_vendor], ['daily_logs.crew_internal', R.crew_internal], ['daily_logs.equipment', R.equipment && R.equipment.text], ['daily_logs.notes', R.notes]]) {
      const el = $(`[data-bind="${k}"]`, sec); if (el && v != null) el.value = v; }
    const tb = $('[data-bind="daily_logs.tbm_done"]', sec); if (tb) tb.checked = !!R.tbm_done;
    const mats = await q('material_usage', `site_id=eq.${SITE()}&select=zone_id,lot_number,quantity_used,unit,used_at`).catch(() => []);
    const isDay = x => { if (!x) return false; const d = new Date(x); if (isNaN(d)) return String(x).slice(0, 10) === DL.day;   // 때는 UTC 로 옴 — 현장 날짜(기기 시각)로 견줌 · 00~09 시 KST 건이 빠지던 것
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === DL.day; };
    const g = $('[data-grid="daylog-zones"]', sec);
    if (g) g.innerHTML = '<table class="tb"><tr><th>구역</th><th>한 일 (그날 공정검사 · 회차 · 판단)</th><th>자재</th></tr>' + DATA.zones.map(z => {
      const gs = DATA.gates.filter(x => x.zone_id === z.id && isDay(x.checked_at));
      const ms = mats.filter(m => m.zone_id === z.id && isDay(m.used_at));
      return `<tr><td>${esc(zlabel(z))}</td><td>${gs.length ? gs.map(x => `Gate ${x.gate_number} · ${x.execution_no}회째 · ${esc(x.result || '진행 중')}`).join('<br>') : '—'}</td>`
        + `<td>${ms.length ? ms.map(m => `${esc(m.lot_number || '')} ${esc(m.quantity_used ?? '')} ${esc(m.unit || '')}`).join('<br>') : '—'}</td></tr>`; }).join('') + '</table>'
      + '<div class="sod">공정 화면에서 끌려옵니다 — 여기서 다시 치지 않습니다</div>';
    if (DL.locked || !can(sec.dataset.can)) $$('input,textarea', sec).filter(e => !e.closest('[data-crep]')).forEach(e => e.disabled = true);   // 고객 보고 칸은 올린 뒤에 씀(아래 crep)
    recalcL(sec);
    await showCrep(sec);
  }
  function recalcL(sec) {
    if (DL.sid !== sec.id) return;
    const b = $('button[data-act="log-done"]', sec), sv = $('button[data-save]', sec);
    const why = DL.locked ? '오늘 일지는 이미 올라가 잠겼습니다' : !can(sec.dataset.can) ? `쓰기 권한(${sec.dataset.can})이 없습니다 — 보기만` : '';
    block(b, why); if (sv) block(sv, why);
    recalcCrep(sec);
  }
  async function writeLog(sec, done) {
    const v = collect(sec), num = x => x === '' || x == null ? null : Number(x);
    const row = { id: DL.id, site_id: SITE(), log_date: DL.day, crew_vendor: num(v['daily_logs.crew_vendor']), crew_internal: num(v['daily_logs.crew_internal']),
      tbm_done: !!v['daily_logs.tbm_done'], equipment: v['daily_logs.equipment'] ? { text: v['daily_logs.equipment'] } : null, notes: v['daily_logs.notes'] || null };
    if (done) row.submitted_at = new Date().toISOString();   // 올림 = 잠금 — 때는 DB 트리거가 다시 넣음(세션3 014 문안)
    await save('daily_logs', row); DL.row = row; if (done) DL.locked = true;
  }

  // ── 8-11 아래 고객 일일 보고 — 초안 → 다듬기 → 보내기 · 발행 뒤 고치기 (B99 · 사내고침안_고객일일보고_V1 ① · DB 묶음 96 · 97) ──
  //   표 = cust.daily_reports(머리 Accept-/Content-Profile: cust) · 초안 = rpc cust.draft_from_log(두 번 눌러도 한 줄) · 발행 시각 · 발행자 · 판 번호는 DB 가(앱 값 안 보냄)
  //   연결된 때만(data-online) — 기기 대기열(CES.save)은 cust 스키마를 모름 · 공사일지 글(notes)은 옮기지 않음(분리 운영 · W-FR-P-C010000-03 93줄) · 사진 고르기는 [미정]
  const CR = {};
  const CRF = ['done_summary', 'quality_note', 'issue_note', 'risk_note', 'next_plan'];
  async function cust(pathq, method, body) {
    const c = C(); if (!c.authFetch || !c.SB_URL || !c.SB_URL()) throw new Error('연결 정보가 없습니다 — 고객 보고는 연결된 때만 씁니다');
    const h = method === 'GET' ? { 'Accept-Profile': 'cust' } : { 'Content-Profile': 'cust', 'Accept-Profile': 'cust', 'Content-Type': 'application/json', Prefer: 'return=representation' };
    const res = await c.authFetch(c.SB_URL() + '/rest/v1/' + pathq, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const t = await res.text();
    if (!res.ok) { let m = t; try { m = JSON.parse(t).message || t; } catch (e) { /* 글 그대로 */ } throw new Error(m); }
    return t ? JSON.parse(t) : null;
  }
  const hm = x => { if (!x) return ''; const d = new Date(x); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const crStep = (k, on) => $$(`[data-crep-step="${k}"]`, CR.box).forEach(e => { e.hidden = !on; });
  async function showCrep(sec) {
    CR.box = $('[data-crep]', sec); if (!CR.box) return;
    CR.sid = sec.id; CR.row = null; CR.err = ''; CR.msg = ''; CR.mine = can('ces.construct');
    if (DL.locked) {
      try { CR.row = ((await cust(`daily_reports?site_id=eq.${SITE()}&report_date=eq.${DL.day}&select=*&limit=1`, 'GET')) || [])[0] || null; }
      catch (e) { CR.err = e.message; }
    }
    fillCrep(); paintCrep(sec);
  }
  function fillCrep() {
    const R = CR.row || {};
    $$('[data-crep-f]', CR.box).forEach(e => { e.value = e.dataset.crepF === 'revise_reason' ? '' : (R[e.dataset.crepF] == null ? '' : R[e.dataset.crepF]); });
  }
  function paintCrep(sec) {
    if (!CR.box || CR.sid !== sec.id) return;
    const R = CR.row, issued = !!(R && R.status === 'issued');
    const st = !DL.locked ? ['warn', '⏸ 기다림', '공사일지를 먼저 올려 주십시오 — 올린 뒤 고객 보고 초안을 만듭니다']
      : CR.err ? ['stop', '⚠ 막힘', '고객 보고를 읽지 못했습니다 — ' + CR.err]
      : !R ? ['warn', '⏸ 기다림', '고객 보고 안 보냄 — 초안을 만드십시오']
      : !issued ? ['info', '▶ 하는 중', '초안 — 고객 말로 다듬어 보내십시오']
      : ['ok', '✔ 끝', `고객에게 보냄 ${hm(R.issued_at)}` + (R.rev_no > 0 ? ` · ✏ 고침 ${hm(R.revised_at)} · ${R.revise_reason || ''}` : '')];
    out(CR.box, 'crep.state', `<div class="al ${st[0]}"><span class="lv">${st[1]}</span>${esc(st[2])}</div>`, true);
    const m = $('[data-out="crep.msg"]', CR.box); m.hidden = !CR.msg; m.innerHTML = CR.msg ? `<div class="al stop"><span class="lv">⚠ 막힘</span>${esc(CR.msg)}</div>` : '';
    out(CR.box, 'crep.nums', R ? `투입 ${R.manpower_count ?? '—'} 명 · 장비 ${R.equipment_count ?? '—'} 대 · 날씨 ${R.weather || '—'}${R.temp_c != null ? ' ' + R.temp_c + '℃' : ''} · 진도 ${R.progress_pct ?? '—'} %${R.plan_pct != null ? ' (계획 ' + R.plan_pct + ' %)' : ''}` : '');
    const ro = $('[data-out="crep.ro"]', CR.box); ro.hidden = CR.mine; ro.innerHTML = CR.mine ? '' : '<div class="al info"><span class="lv">ⓘ 보기만</span>고객 보고는 공사팀장 · 공사본부장이 씁니다</div>';
    crStep('draft', CR.mine && !R && !CR.err); crStep('edit', !!R); crStep('rev', issued && CR.mine);
    $$('[data-crep-step="edit"] .acts', CR.box).forEach(e => { e.hidden = !CR.mine; });
    const send = $('button[data-act="crep-send"]', CR.box); if (send) send.hidden = issued;
    if (!CR.mine || !R) crStep('ask', false);
    $$('[data-crep-f]', CR.box).forEach(e => { e.disabled = !CR.mine; });
    recalcCrep(sec);
  }
  function recalcCrep(sec) {
    if (!CR.box || CR.sid !== sec.id) return;
    const R = CR.row, issued = !!(R && R.status === 'issued');
    block($('button[data-act="crep-draft"]', CR.box), !DL.locked ? '공사일지를 먼저 올려 주십시오' : '');
    const rr = String(($('[data-crep-f="revise_reason"]', CR.box) || {}).value || '').trim();
    const why = !issued ? '' : !rr ? '발행한 보고를 고치려면 고친 까닭 한 줄을 적어 주십시오' : R.revise_reason && rr === String(R.revise_reason).trim() ? '앞 까닭과 같습니다 — 이번에 고치는 까닭을 새로 적어 주십시오' : '';
    block($('button[data-act="crep-save"]', CR.box), why);
  }
  async function crepAct(sec, act) {
    const R = CR.row, body = {};
    CRF.forEach(k => { const e = $(`[data-crep-f="${k}"]`, CR.box); const v = e ? e.value.trim() : ''; body[k] = v || null; });
    if (act === 'crep-draft') {
      const id = await cust('rpc/draft_from_log', 'POST', { p_site: SITE(), p_date: DL.day });
      CR.row = ((await cust(`daily_reports?id=eq.${id}&select=*&limit=1`, 'GET')) || [])[0] || null; CR.msg = ''; fillCrep();
      toast('초안을 만들었습니다 — 특이사항 · 리스크 · 내일 계획은 고객 말로 써 주십시오');
    } else if (act === 'crep-send') { crStep('ask', true); return; }
    else if (act === 'crep-send-no') { crStep('ask', false); return; }
    else if (act === 'crep-save' || act === 'crep-send-ok') {
      if (act === 'crep-send-ok') body.status = 'issued';
      if (R.status === 'issued') body.revise_reason = String($('[data-crep-f="revise_reason"]', CR.box).value || '').trim();
      const rs = await cust(`daily_reports?id=eq.${R.id}`, 'PATCH', body);
      if (!rs || !rs.length) throw new Error('저장되지 않았습니다 — 바뀐 줄이 없습니다(권한 ces.construct · 그 보고가 있는지 보십시오)');
      const was = R.status; CR.row = rs[0]; CR.msg = ''; fillCrep(); crStep('ask', false);
      toast(act === 'crep-send-ok' ? '고객에게 보냈습니다 — 고객 화면에 바로 보입니다' : was === 'issued' ? '고친 판을 올렸습니다 — 고객 화면에 「✏ 고침 · 까닭」 · 받음은 다시 ⏸' : '다듬은 글을 저장했습니다 — 아직 고객에게 안 보냄');
    }
    paintCrep(sec);
  }

  // ── 8-9 판단 ──
  const D9 = {};
  // 판단 확정 = 이 줄 제 decision_ref — 2회째 줄은 앞 회차 Rework 판단을 물려받으므로(writeGate) 그 값은 이 줄의 판단이 아님 (B203)
  const ownDecision = g => !!g.decision_ref && !DATA.gates.some(x => x.id !== g.id && x.zone_id === g.zone_id && Number(x.gate_number) === Number(g.gate_number) && x.execution_no < g.execution_no && x.decision_ref === g.decision_ref);
  const posted = g => !!g.checked_at && g.result != null;   // 올린 게이트(결과 있음) — 임시저장 줄은 결과 · 때가 비어 있음(writeGate final=false)
  async function show89(sec) {
    await loadSite();
    const gid = P.get('gate'); const confirm = $$('button[data-online]', sec)[0];
    const gate = DATA.gates.find(g => g.id === gid) || (gid ? (await q('process_gates', `id=eq.${gid}&select=*`))[0] : null);
    Object.assign(D9, { gate, confirm });
    if (!gate) { out(sec, 'gate.label', '어느 게이트인지 없습니다 — 공정 화면(Gate ①~⑤)에서 「게이트 올리고 판단으로」를 누르면 그 게이트로 이 화면이 열립니다'); block(confirm, '판단할 게이트가 없습니다'); return; }
    const z = DATA.zones.find(x => x.id === gate.zone_id); const st = DATA.stds.find(s => Number(s.gate_number) === Number(gate.gate_number)) || {};
    D9.zone = z; D9.std = st;
    out(sec, 'gate.label', `${zlabel(z)} · Gate ${gate.gate_number} ${st.std_name || st.process_stage || ''} · ${gate.execution_no}회째${gate.checked_at ? ' · ' + new Date(gate.checked_at).toLocaleString('ko-KR') : ''} · ${gate.result || '결과 없음'}`);
    const vals = ((gate.checklist_items && gate.checklist_items.lists) || []).flatMap(l => l.values || []);
    const bad = vals.filter(x => x && x.ok === false).map(x => x.label || x.item_code);
    out(sec, 'gate.summary', vals.length ? `체크 ${vals.length} 중 ${vals.length - bad.length} 맞음${bad.length ? ' · 미충족 : ' + bad.join(' · ') : ''}` : '체크 값 없음');
    out(sec, 'process_gates.candidate_decision', gate.candidate_decision ? (gate.candidate_decision + ' 후보') + ' — 기계가 고르지 않습니다' : '후보 없음');
    const ta = $('[data-bind="operation_states.decision_rationale"]', sec); if (ta && !ta.value && bad.length) ta.value = '[저절로] ' + bad.join(' · ') + '\n';
    await showCapa(sec);
    if (!posted(gate)) { block(confirm, '아직 올리지 않은 게이트입니다(임시저장) — 공정 화면에서 「게이트 올리고 판단으로」를 누른 뒤에 판단합니다'); $$('input,textarea,.pick button', sec).forEach(e => e.disabled = true); return; }   // 현장 책임자가 결과를 올린 뒤 공사팀장이 판단(W-SOP-Q072100 Annex B · B203)
    if (ownDecision(gate)) { block(confirm, '이미 판단이 확정된 게이트입니다'); $$('input,textarea,.pick button', sec).forEach(e => e.disabled = true); return; }
    if (!can(sec.dataset.can)) { block(confirm, `판단 확정은 ${sec.dataset.can} 만 합니다 — 보기만`); $$('textarea,.pick button', sec).forEach(e => e.disabled = true); return; }
    const goB = $('.pick[data-bind="operation_states.decision"] button[data-v="Go"]', sec); if (goB) { goB.disabled = gate.result === REDO(); const pk = goB.parentElement, w0 = pk.nextElementSibling && pk.nextElementSibling.hasAttribute('data-gowhy') ? pk.nextElementSibling : null;   // 팀원시험 U2 — 회색 「진행 (Go)」 까닭
      if (goB.disabled && !w0) pk.insertAdjacentHTML('afterend', `<div class="why" data-gowhy>「진행 (Go)」를 못 고르는 까닭 — 현장 결과가 「${REDO()}」입니다 · 재검사에서 「${GO()}」이 나온 뒤 다음 공정</div>`); else if (!goB.disabled && w0) w0.remove(); }   // 현장 결과 「재작업」 = Go 못 고름(재검사 Pass 전 다음 공정 착수 금지 : W-GL-Q072000 6.8 b · Fail 이면 재작업 지시 SHALL : W-P-C010000 6.5.2 d · B207)
    recalc89(sec);
  }
  function recalc89(sec) {
    if (!D9.gate || !posted(D9.gate) || ownDecision(D9.gate) || !can(sec.dataset.can)) return;
    const v = collect(sec);
    block(D9.confirm, !v['operation_states.decision'] ? '넷 중 하나를 고르십시오'
      : v['operation_states.decision'] === 'Go' && D9.gate.result === REDO() ? `현장 결과가 「${REDO()}」입니다 — 진행(Go)은 재작업 뒤 재검사에서 「${GO()}」이 나와야 고릅니다` : !String(v['operation_states.decision_rationale'] || '').trim() ? '고른 까닭을 적으십시오'
      : !v['operation_states.decision_criteria'] ? '무엇을 보고 골랐는지 고르십시오' : '');
  }
  // ── 8-9 CAPA 열기 — 품질팀장만 · Gate 불합격(재작업)은 NCR 을 내지 않고 CAPA 줄만(object_type=process_gates · object_id=게이트 줄) (B193 · 부대표 MSA1005-04 ㉯)
  //   근거 W-GL-C015000 6.7 c) · Annex D 166줄 「같은 Gate 2회 이상 Fail = CAPA 개시(SHALL)」 · W-GL-Q074000 6.7 201줄 「품질팀장 — CAPA 개시」 · W-P-G080000 7장 142줄 「Gate 불합격 = NCR 미발행」
  const CAPA_WHO = '품질팀장', CAPA_N = 2;
  async function showCapa(sec) {
    let box = $('[data-capa]', sec); const g = D9.gate;
    if (!g || !C().title || C().title() !== CAPA_WHO) { if (box) box.hidden = true; return; }   // 품질팀장만 보임
    if (!box) { const a = D9.confirm && D9.confirm.closest('.acts'); if (!a) return;
      a.insertAdjacentHTML('afterend', `<div class="gq" data-capa><h4>CAPA — 시정조치 열기 <small>${esc(CAPA_WHO)}</small></h4><div class="al info" data-capa-al><span class="lv">알림</span><span data-out="capa.note">—</span></div>`
        + '<div class="acts"><button type="button" class="b s" data-act="capa-open" data-online="CAPA 는 올라가야 남습니다.">CAPA 열기</button></div>'
        + '<div class="src">근거 — W-GL-C015000 6.7 c) · Annex D 「같은 Gate 2회 이상 Fail = CAPA 개시(SHALL)」 · W-GL-Q074000 6.7 「품질팀장 — CAPA 개시」 · Gate 「재작업」은 부적합보고서를 내지 않습니다(W-P-G080000 7장)</div></div>');
      box = $('[data-capa]', sec); }
    box.hidden = false; const btn = $('button[data-act="capa-open"]', box);
    const same = DATA.gates.filter(x => x.zone_id === g.zone_id && Number(x.gate_number) === Number(g.gate_number));
    const n = same.filter(x => x.result === REDO()).length;
    const rs = await q('capa', `site_id=eq.${SITE()}&object_type=eq.process_gates&capa_stage=eq.open&select=id,object_id,closed_at`).catch(() => null);
    const op = (rs || []).filter(r => !r.closed_at && same.some(x => x.id === r.object_id));
    const head = `${zlabel(D9.zone)} · Gate ${g.gate_number} — ${REDO()} ${n}회`;
    if (rs === null) { out(sec, 'capa.note', head); return block(btn, 'CAPA 를 못 읽었습니다 — 다시 여십시오'); }
    if (op.length || D9.capaDone === g.id) { out(sec, 'capa.note', `⏸ ${head} · CAPA 열림 — 닫기는 CAPA 화면에서`); return block(btn, '이 구역 · 이 Gate CAPA 가 이미 열려 있습니다'); }
    if (g.result !== REDO()) { out(sec, 'capa.note', head); return block(btn, `이 게이트는 「${REDO()}」가 아닙니다 — CAPA 는 Gate 「${REDO()}」에서 엽니다`); }
    $('[data-capa-al]', box).className = n >= CAPA_N ? 'al warn' : 'al info';   // 열어야 함(SHALL) = 경고 · 그 밖 = 알림
    out(sec, 'capa.note', n >= CAPA_N ?`⚠ ${head} — CAPA 를 꼭 열어야 합니다` : `${head} — ${CAPA_N}회째부터는 꼭 엽니다 · 지금 열 수도 있습니다`);
    block(btn, '');
  }
  async function openCapa(sec) {
    const g = D9.gate;
    await save('capa', { id: uuid(), site_id: SITE(), zone_id: g.zone_id, object_type: 'process_gates', object_id: g.id, capa_stage: 'open', security_level: sec.getAttribute('data-p') || 'P3' }, { op: 'insert' });   // NCR 없음(nc_report_id 비움) · 연 사람 · 때는 DB 가 넣음
    D9.capaDone = g.id;
  }
  async function decide(sec) {
    const v = collect(sec), g = D9.gate, opId = uuid();
    const d = v['operation_states.decision'], redo = (d === 'Rework' || d === 'No-Go') && g.result !== REDO();   // 판단 Rework · No-Go = 게이트도 「재작업」 — 다음 Gate 가 안 열림(재검사 Pass 전 다음 공정 착수 금지 SHALL NOT : W-GL-Q072000 6.8 b) · 공사팀장 최종 Pass/No-Go · 재작업 지시 SHALL : W-SOP-Q072100 · W-SOP-C015100 Annex B · B203 · B207)
    await save('operation_states', { id: opId, site_id: SITE(), zone_id: g.zone_id, op_code: 'OP05', status: 'decided', decision: v['operation_states.decision'],
      decision_rationale: v['operation_states.decision_rationale'], decision_criteria: v['operation_states.decision_criteria'],
      decision_node_id: 'OP05-G' + String(g.gate_number).padStart(2, '0'), payload: { gate_id: g.id, execution_no: g.execution_no, ...(redo ? { field_result: g.result } : {}) } });   // 바꾸기 전 현장 결과는 판단 줄에 남김
    await C().save('process_gates', { id: g.id, decision_ref: opId, ...(redo ? { result: REDO() } : {}) }, { op: 'update' });   // 바뀐 칸만(PATCH · 공통 V1.1)
    if (redo) g.result = REDO();
    const nts = String(((DEF.notify || {})[DEF.std_screen[(D9.std || {}).std_code] || '']) || '').split(';').map(x => x.split('|')).filter(x => x[0]);   // 정의 NOTIFY — Gate⑤ Go 뒤 ① 품질팀장 제품검사(MSA1004-02 ㉮) ② 관리팀장 공사 완료 통보(시방서 8.6.4 · 11.2)
    if (d === 'Go') for (const nt of nts) await save('ces_operation_log', { id: uuid(), site_id: SITE(), event_type: 'notice',
      event_data: { to_title: nt[0], kind: nt[1] || '', zone_id: g.zone_id, gate_id: g.id, gate_number: g.gate_number, decision_ref: opId }, occurred_at: new Date().toISOString() }, { op: 'insert' });   // 알림은 새 줄만(op08:134 꼴 · 세션4-062)
    if (d === 'Go') {                                // 다음 공종 = 공정계획서 차례에서 이 게이트 다음 줄
      const lines = stdLines(); const i = lines.findIndex(l => Number(l.gate_number) === Number(g.gate_number));
      const nx = lines.slice(i + 1).find(l => DEF.std_screen[l.std_code]);
      location.href = nx ? link(DEF.std_screen[nx.std_code], g.zone_id) : link('w08-1');
    } else if (d === 'Rework') location.href = link(DEF.std_screen[(D9.std || {}).std_code] || 'w08-1', g.zone_id);
    else if (d === 'Additional Work') C().ui.go('w13-1');   // 추가공사(묶음4 +1) — 공통 넘김 : 그 파일이 없으면 「아직 짓지 않은 화면」
    else location.href = link('w08-1');
  }

  // ── 8-출력 1 · 2 · 3 인쇄판 — 기록에서 찍음 · 보기만 (MSA-20261004-061) ──
  //   머리 칸 = 정의(화면정의 8-출력) · 줄 = DB · 담는 자리가 없는 칸은 「기록 없음」 (앱칸_op05.csv 비고 ★)
  const NA = '기록 없음';
  const dt = x => x ? new Date(x).toLocaleString('ko-KR') : '';
  const itemOf = h => (DEF.items || []).find(it => it.label === h || it.label.endsWith(h)) || null;   // 머리 칸 → 계측 항목(정의 ITEM 줄)
  function body(sec, key, cols) {                 // cols = 줄마다 [칸 값…] — 머리 칸 차례 그대로
    const tb = $(`table[data-body="${key}"]`, sec); if (!tb) return null;
    $$('tr.dbr', tb).forEach(r => r.remove());
    const heads = $$('th', tb).map(th => th.textContent.trim());
    const rows = cols(heads);
    tb.insertAdjacentHTML('beforeend', rows.length ? rows.map(r => '<tr class="dbr">' + r.map((v, j) => `<td${$$('th', tb)[j] && $$('th', tb)[j].classList.contains('n') ? ' class="n"' : ''}>${esc(v == null || v === '' ? '—' : v)}</td>`).join('') + '</tr>').join('')
      : `<tr class="dbr"><td colspan="${heads.length}">[아직 기록 없음]</td></tr>`);
    return heads;
  }
  function apprCount(sec, done) {                 // 결재란 — 칸마다 「✓ n/N」 (구역마다 결재 · 결재는 기록 화면에서)
    $$('[data-appr] [data-role]', sec).forEach(c => { const i = +c.getAttribute('data-step'); const d = done[i];
      out(c, `appr.${i}.s`, d == null ? '—' : d.n ? `✓ ${d.n}/${d.of}` : '—'); out(c, `appr.${i}.nm`, d && d.at ? d.at : ''); });
  }
  async function showPrint(sec) {
    await loadSite();
    const S = SITE(), site = (await q('sites', `id=eq.${S}&select=id,site_name,client_name&limit=1`).catch(() => []))[0] || {};
    const zl = id => zlabel(DATA.zones.find(z => z.id === id));
    if (sec.id === 'w08-p1') {
      const tb = $('table[data-body^="gates:"]', sec), gn = tb ? Number(tb.dataset.body.split(':')[1]) : 1;
      const gs = DATA.gates.filter(g => Number(g.gate_number) === gn).sort((a, b) => (DATA.zones.findIndex(z => z.id === a.zone_id) - DATA.zones.findIndex(z => z.id === b.zone_id)) || a.execution_no - b.execution_no);
      const rma = gs.length ? await q('runtime_measurements', `site_id=eq.${S}&item=in.(removal_depth,temp,rh)&gate_id=in.(${gs.map(g => g.id).join(',')})&select=gate_id,item,measurement_value`).catch(() => []) : [];
      const rm = rma.filter(r => !r.item || r.item === 'removal_depth'), env = (gid, k) => (rma.find(r => r.gate_id === gid && r.item === k) || {}).measurement_value;   // 환경 = 온 · 습도(op07-s3 env 와 같은 자리)
      out(sec, 'p1.head', `현장 ${site.site_name || S} · 뽑은 때 ${dt(Date.now())}`);
      body(sec, tb ? tb.dataset.body : '', heads => gs.map(g => heads.map(h => {
        const z = DATA.zones.find(x => x.id === g.zone_id);
        if (h === '구역') return zlabel(z);
        if (h === '회차') return g.execution_no;
        if (h === '환경') { const t = env(g.id, 'temp'), rh = env(g.id, 'rh'); return t == null && rh == null ? '없음' : `${t == null ? '?' : t}℃·${rh == null ? '?' : rh}%`; }
        if (h.startsWith('제거 깊이')) { const t = z ? zoneRep(z, 'weak_layer_depth') : null; const v = rm.filter(r => r.gate_id === g.id).map(r => r.measurement_value);
          return `목표 ${t == null ? '?' : t} · 실측 ${v.length ? v.join('·') : '없음'}`; }
        if (h === '결과') return g.result === GO() ? '✔ ' + g.result : g.result === REDO() ? '⚠ ' + g.result : g.result || '⏸ 판단 전';
        if (h.startsWith('서명')) return dt(g.checked_at);
        const w = h.replace(/\s*없음$/, ''), vs = ((g.checklist_items || {}).lists || []).flatMap(l => l.values || []), x = vs.find(v => String(v.label || '').includes(w));   // 체크 칸 = 그 게이트 체크 값
        return x ? (x.ok ? '✔' : '✕') : NA;
      })));
      apprCount(sec, { 0: { n: gs.filter(g => g.checked_at).length, of: gs.length }, 2: { n: gs.filter(g => g.result).length, of: gs.length } });
      return;
    }
    const bench = await q('benchmarks', `site_id=eq.${S}&select=zone_id,item,benchmark_value,unit`).catch(() => []);
    const bOf = (zid, it) => { const b = bench.find(x => x.zone_id === zid && x.item === it); return b ? Number(b.benchmark_value) : null; };
    const zs = list => DATA.zones.filter(z => list.some(x => x.zone_id === z.id));
    const node = sec.id === 'w08-p2' ? 'OP05-PRE' : 'OP05-PRD';
    const os = await q('operation_states', `site_id=eq.${S}&decision_node_id=eq.${node}&select=zone_id,status,created_at&order=created_at`).catch(() => []);
    const lastOs = {}; os.forEach(o => { lastOs[o.zone_id] = o; });
    const done = {}; [0, 1, 2].forEach(i => { done[i] = { n: Object.values(lastOs).filter(o => STEPS.indexOf(o.status) >= i).length, of: DATA.zones.length }; });
    if (sec.id === 'w08-p2') {
      const pre = await q('pre_inspections', `site_id=eq.${S}&select=zone_code,inspection_date`).catch(() => []);
      out(sec, 'p2.head', `현장 ${site.site_name || S}${site.client_name ? ' · 발주처 ' + site.client_name : ''} · 사전검사일 ${[...new Set(pre.map(p => p.inspection_date))].join(' · ') || '없음'} · 설계기준강도 ${NA}`);
      body(sec, 'bench', heads => zs(bench).map(z => heads.map(h => { if (h === '구역') return zlabel(z); const it = itemOf(h); if (!it) return NA; const v = bOf(z.id, it.item); return v == null ? '' : `${v} ${it.unit}`; })));
    } else {
      const asb = await q('asbuilt_records', `site_id=eq.${S}&select=zone_id,item,asbuilt_value,unit`).catch(() => []);
      const prd = await q('product_inspections', `site_id=eq.${S}&select=zone_id,inspection_date,inspector_name`).catch(() => []);
      const aOf = (zid, it) => { const a = asb.find(x => x.zone_id === zid && x.item === it); return a && a.asbuilt_value != null ? Number(a.asbuilt_value) : null; };
      const g5 = DATA.zones.filter(z => { const r = gatesOf(z.id, 5); return r.length && r[r.length - 1].result === GO(); }).length;
      out(sec, 'p3.head', `현장 ${site.site_name || S} · Gate⑤ ${GO()} ${g5}/${DATA.zones.length} 구역 · 기준선 등록 ${zs(bench).length}/${DATA.zones.length} 구역 · 검사일자 ${[...new Set(prd.map(p => p.inspection_date))].join(' · ') || '없음'} · 검사자 ${[...new Set(prd.map(p => p.inspector_name).filter(Boolean))].join(' · ') || '—'}`);
      body(sec, 'prd', heads => zs(asb).map(z => heads.map(h => { if (h === '구역') return zlabel(z); const it = itemOf(h); if (!it) return NA; const v = aOf(z.id, it.item); return v == null ? '' : `${v} ${it.unit}`; })));
      const duals = (DEF.items || []).filter(it => it.dual);
      body(sec, 'dual', heads => { const lim = Number(((heads.find(h => /≥/.test(h)) || '').match(/≥\s*(\d+(?:\.\d+)?)/) || [])[1]);
        return zs(asb).flatMap(z => duals.map(it => { const A = bOf(z.id, it.item), B = aOf(z.id, it.item);
          const r = A && B != null ? Math.round((it.down ? (A - B) : (B - A)) / A * 1000) / 10 : null;   // 개선율 — 감소지표는 (A−B)/A
          return heads.map(h => h === '구역' ? zlabel(z) : h === '항목' ? it.label : h.startsWith('기준선') ? A : h.startsWith('제품') ? B : h === '개선율' ? (r == null ? '' : r + ' %')
            : /≥/.test(h) ? (r == null || isNaN(lim) ? '' : r < 0 ? '음수' : r >= lim ? '충족' : '미달') : NA); })); });
    }
    await holdHistory(sec, S, node === 'OP05-PRE' ? 'pre_inspection' : 'product');
    apprCount(sec, done);
  }
  // 특이사항 「함수율 Hold 발생 및 처리 이력」 — 검사성적서 W-FR-L-Q073000-02 특이사항 목록 · W-GL-Q075000 Annex F F-5 (B103) · 줄 = Hold 기록(묶음 62) 그대로 · 없으면 「없음」
  async function holdHistory(sec, S, stage) {
    const tbl = HCFG().tbl || 'moisture_holds';
    const rs = await holdNos(await q(tbl, `site_id=eq.${S}&stage=eq.${stage}&select=id,zone_id,mp_id,sub_point_id,moisture_value,reason,status,remeasure_value,resolution,resolution_note,held_at&order=held_at`).catch(() => []));
    let box = $('[data-hold-hist]', sec);
    if (!box) { const ap = $('[data-appr]', sec); if (!ap) return; ap.insertAdjacentHTML('beforebegin', '<div data-hold-hist style="margin-top:8px;font-size:13px"></div>'); box = $('[data-hold-hist]', sec); }
    const ln = x => { const z = DATA.zones.find(t => t.id === x.zone_id), tail = x.remeasure_value != null ? ` → 재계측 ${esc(x.remeasure_value)} %` : '';
      return `<li>${esc(zlabel(z))} · ${esc(hWhere(x))} · 함수율 ${esc(x.moisture_value)} %${tail} · ${esc((HST[x.status] || ['', x.status])[1])}${x.resolution ? ' · ' + esc(x.resolution) : ''}${x.resolution_note ? ' (' + esc(x.resolution_note) + ')' : ''} · ${esc(dt(x.held_at))}<br>사유 — ${esc(x.reason || '')}</li>`; };
    box.innerHTML = '<b>■ 특이사항 — 함수율 Hold 발생 및 처리 이력</b> <small>(W-FR-L-Q073000-02 · W-GL-Q075000 Annex F F-5)</small>'
      + (rs.length ? `<ul data-hold-hist-rows style="margin:4px 0 0 18px">${rs.map(ln).join('')}</ul>` : '<div data-hold-hist-none>없음</div>');
  }


  // ── 차례 — 공통 ces-ui 가 화면을 보이면(ces:show) 그 화면 자료를 채움 ──
  async function onShow(sec) {
    DEF = DEF || JSON.parse(document.getElementById('op05-def').textContent);
    if (!sec || !sec.classList.contains('sc') || $('.scr.denied', sec)) return;   // 볼 권한 없음 = 공통이 가림
    try {
      if (sec.id === 'w08-1') await show81(sec);
      else if (sec.id === 'w08-9') await show89(sec);
      else if ($('.pgrid', sec)) await showMeasure(sec);      // 8-3 · 8-10 (공종 코드도 있지만 게이트가 아님)
      else if (sec.id === 'w08-4') await showOOS(sec);
      else if (sec.id === 'w08-11') await showLog(sec);
      else if (DEF.prints && DEF.prints[sec.id]) await showPrint(sec);
      else if (sec.dataset.std) await showGate(sec);
    } catch (e) { toast('읽기 실패 — ' + e.message); sec.querySelector('.scr').insertAdjacentHTML('afterbegin', `<div class="al stop"><span class="lv">차단</span>${esc(e.message)}</div>`); }
  }
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const sec = b.closest('section.sc'); if (!sec) return;
    if (b.dataset.href) { location.href = b.dataset.href; return; }
    if (b.dataset.timer === 'start') { const t = b.closest('.timer'); t.dataset.start = new Date().toISOString(); tick(t); return; }
    if (b.dataset.act === 'add-point') { addPoint(sec); recalc(sec); return; }
    if (b.dataset.act === 'print') { window.print(); return; }                // 인쇄판 「PDF 로 뽑기」 = 기기 인쇄(PDF 로 저장)
    if (b.closest('.pick[data-opts="zones"]')) { setTimeout(() => { location.href = link(sec.id, b.dataset.v); }, 0); return; }   // 구역 고르기 = 그 구역으로 다시 엶
    if (b.dataset.mp) { MS.mp = +b.dataset.mp; mpPicker(sec); grids(sec); recalcM(sec); return; }
    if (b.dataset.outtg) { const c = cell(b.dataset.outtg, b.dataset.pn); c.out = !c.out; grids(sec); recalcM(sec); return; }
    if (OO.sid === sec.id && (b.dataset.act === 'oos-save' || b.dataset.act === 'oos-notify')) {
      ev.preventDefault(); ev.stopImmediatePropagation(); if (b.disabled) return;
      try { await writeOOS(sec, b.dataset.act === 'oos-notify'); if (b.dataset.act === 'oos-save') location.href = link('w08-1'); else { toast('고객판(공개 등급)으로 알림을 남겼습니다 — 원가 · 단가 없음'); await showOOS(sec); } } catch (e) { toast(e.message); } return;
    }
    if (CR.sid === sec.id && /^crep-/.test(b.dataset.act || '')) {
      ev.preventDefault(); ev.stopImmediatePropagation(); if (b.disabled) return;
      try { await crepAct(sec, b.dataset.act); } catch (e) { CR.msg = e.message; toast(e.message); paintCrep(sec); } return;   // DB 글 그대로 보임(고침안 시험 4)
    }
    if (DL.sid === sec.id && (b.dataset.act === 'log-done' || b.hasAttribute('data-save'))) {
      ev.preventDefault(); ev.stopImmediatePropagation(); if (b.disabled) return;
      try { await writeLog(sec, b.dataset.act === 'log-done'); if (b.dataset.act === 'log-done') location.href = link('w08-1'); else { toast('임시저장 — 기기에 남고 연결되면 올라갑니다'); } } catch (e) { toast(e.message); } return;
    }
    if (MS.sid === sec.id && b.dataset.act === 'appr') {
      ev.preventDefault(); ev.stopImmediatePropagation(); if (b.disabled) return;
      try { await apprStep(sec, +b.dataset.step); } catch (e) { toast(e.message); } return;
    }
    if (MS.sid === sec.id && /^hold-(rec|re|close)$/.test(b.dataset.act || '')) {   // B91 — 함수율 Hold 기록 · 재계측 · 품질팀장 처리
      ev.preventDefault(); ev.stopImmediatePropagation(); if (b.disabled) return;
      try {
        const a = b.dataset.act, lim = HCFG().lim;
        if (a === 'hold-rec') toast(`Hold ${await recordHold(sec)} 점 기록 — 표면강도 계측을 멈춥니다 · 건조 뒤 재계측 값을 넣으십시오`);
        else if (a === 'hold-re') toast((await remeasureHold(sec, b.dataset.hid)) === 'released' ? `재계측 ${lim} % 이하 — Hold 풂 · 표면강도를 잽니다` : `재계측도 ${lim} % 를 넘었습니다 — 품질팀장에게 보고(⚠ 로 남음) · 처리 전까지 표면강도 보류`);
        else toast(`품질팀장 처리 「${await closeHold(sec, b.dataset.hid)}」 기록 — 표면강도를 잽니다`);
        grids(sec); renderHold(sec); await holdList(sec); recalcM(sec);   // 8-3 Hold 목록도 다시
      } catch (e) { toast(e.message); }
      return;
    }
    if (MS.sid === sec.id && (b.hasAttribute('data-save') || b.dataset.act === 'pre-done' || b.dataset.act === 'prd-done')) {
      ev.preventDefault(); ev.stopImmediatePropagation(); if (b.disabled) return;
      const mode = b.hasAttribute('data-save') ? 'draft' : 'done';
      try {
        await writeMeasure(sec, mode);
        if (mode === 'draft') toast('임시저장 — 기기에 남고 연결되면 올라갑니다');
        else if (b.dataset.act === 'pre-done') {
          const bad = !!String(collect(sec)['pre_inspections.defect_desc'] || '').trim();
          for (const nt of String((DEF.notify || {})['w08-3'] || '').split(';').map(x => x.split('|')).filter(x => x[0])) await save('ces_operation_log', { id: uuid(), site_id: SITE(), event_type: 'notice',
            event_data: { to_title: nt[0], kind: nt[1] || '', zone_id: MS.zone.id, defect: bad }, occurred_at: new Date().toISOString() }, { op: 'insert' });   // 사전검사 결과 통보(결함 있음 표시 · 보수 결정은 공사팀장) — 알림은 새 줄만(decide 와 같은 꼴)
          location.href = link('w08-1');
        }
        else C().ui.go('w10-1');
      } catch (e) { toast(e.message); }
      return;
    }
    if (b.hasAttribute('data-save') && sec.dataset.std) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      try { await writeGate(sec, false); toast('임시저장 — 기기에 남고 연결되면 올라갑니다'); } catch (e) { toast(e.message, 'error'); } return;
    }
    if (b.hasAttribute('data-online') && sec.dataset.std && b === G.submit) {
      ev.preventDefault(); ev.stopImmediatePropagation(); if (b.disabled) return;
      try { const g = await writeGate(sec, true); location.href = link('w08-9', g.zone_id, '&gate=' + g.id); } catch (e) { toast(e.message, 'error'); } return;
    }
    if (sec.id === 'w08-9' && b.dataset.act === 'capa-open') {   // B193 — 품질팀장 CAPA 열기
      ev.preventDefault(); ev.stopImmediatePropagation(); if (b.disabled) return;
      try { await openCapa(sec); toast('CAPA 를 열었습니다 — 부적합보고서 없이 이 게이트에 묶음'); await showCapa(sec); } catch (e) { toast(e.message, 'error'); } return;
    }
    if (b.hasAttribute('data-online') && sec.id === 'w08-9' && b === D9.confirm) {
      ev.preventDefault(); ev.stopImmediatePropagation(); if (b.disabled) return;
      try { await decide(sec); } catch (e) { toast(e.message, 'error'); } return;
    }
  }, true);
  const re = ev => { const sec = ev.target.closest && ev.target.closest('section.sc'); if (!sec) return;
    if (ev.target.dataset && ev.target.dataset.pg) cell(ev.target.dataset.pg, ev.target.dataset.pn).v = ev.target.value;
    if (MS.sid === sec.id) return recalcM(sec);
    if (OO.sid === sec.id) return recalcO(sec);
    if (DL.sid === sec.id) return recalcL(sec);
    sec.id === 'w08-9' ? recalc89(sec) : recalc(sec); };
  document.addEventListener('input', re); document.addEventListener('ces:pick', re);   // 고르기 · Pass/Fail 은 공통이 누른 뒤 ces:pick
  setInterval(() => $$('.timer[data-start]').forEach(tick), 30000);
  document.addEventListener('ces:show', ev => onShow(ev.target));
  const refresh = () => { DATA.site = null; STALE = false; const c = C().ui && C().ui.current && C().ui.current(); return c ? onShow(c) : null; };   // 다시 읽고 다시 그림
  window.addEventListener('online', () => { if (STALE) refresh(); });                     // 끊겼다 돌아오면 「최신 아님」을 걷음
  window.OP05 = { onShow, refresh, _G: G, _D9: D9 };     // 시험이 들여다봄
})();
