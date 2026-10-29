/* wms.js — WMS 12장 (묶음11 · w15-111 ~ w15-122) 움직임 · 업무설계창 세션1 · MST2-20261003-005   (01_app\wms\wms.html 이 부름 · 공통 부품은 ../ 를 불러 쓰기만)
 * 정의에서 읽음 : 화면 이름 · 권한(data-can) · 다음 화면 = 화면정의_묶음11_WMS.csv · 표 · 열 · 출처(어느 표 · 뷰 · 열) · 고르기 · 칸 · 단추 · 상태 낱말 · 규칙 숫자 = 앱칸_wms.csv
 *   (짓기 도구가 #wms-def 에 넣음 — 이 파일은 표 이름 · 열 이름을 박지 않고 DEF.src 의 열쇠로만 부름)
 * DB 에서 읽음 : materials · equipment_master(WMS 가 주인) · wms 새 표(stock_lots · stock_moves · equipment_bookings · calibrations · consumable_wear · stock_alerts — public 연결 뷰)
 *   + 바깥 창구는 뷰 이름으로만 : v_ces_material_plan · v_ces_material_usage · v_ces_equipment_demand (CES) · v_scm_receipt (SCM)
 *   ★단가 열은 읽지 않음(정렬표 §3 — 단가 = ERP E1)
 * 쓰기 = CES.save(덧붙이기 : insert · 고치기 : update) — 끊겨도 기기에 남고 연결되면 올라감. 출고 · 배정 · 반납 확정 · 발주 청구는 연결된 때만(data-online)
 *   지우기 없음 — 품목 · 장비는 「쓸 수 없음」 · 고칠 땐 반대 줄 · 작성자는 DB(written_by DEFAULT auth.uid())
 * 박힌 것(보고 ④) : 화면 말(안내 · 까닭 문면) · 셈 꼴(보유 = 움직임 합 · 가용 = 보유 − 배정 · 먼저 만료 먼저 나감 · 겹침 = 그날 수요 합 > 보유) */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var C = function () { return window.CES || {}; };
  var can = function (p) { return !!(C().can && C().can(p)); };
  var me = function () { try { return localStorage.getItem('ces_user_id') || ''; } catch (e) { return ''; } };   // 같은 계정 승인 막기(견적 · SCM 과 같은 꼴 · DB 가 다시 봄)
  var myTitle = function () { return C().title ? C().title() : ''; };
  var toast = function (m) { if (C().ui && C().ui.toast) C().ui.toast(m); else console.log('[wms]', m); };
  var DEF = null, MY = [], S = { data: {}, err: {}, missing: {}, stale: false, sel: {}, cur: null };
  var URLSITE = (function () { try { return new URLSearchParams(location.search).get('site') || ''; } catch (e) { return ''; } })();   // C505-F07 G35 : 현장 화면에서 ?site= 로 들어오면 W-⑫ 현장을 그 현장으로 먼저 고름(한 번만 · 사람이 바꿀 수 있음)

  /* 화면마다 읽는 것 (출처 열쇠) */
  var NEED = {
    'w15-111': ['mats'], 'w15-112': ['mats', 'lots', 'moves', 'plan'], 'w15-113': ['mats', 'lots', 'receipt'],
    'w15-114': ['mats', 'lots', 'moves', 'plan'], 'w15-115': ['mats', 'lots', 'moves', 'usage', 'plan'], 'w15-116': ['eq'],
    'w15-117': ['eq', 'demand', 'book'], 'w15-118': ['eq', 'cal'], 'w15-119': ['mats', 'lots', 'moves', 'plan', 'eq'],
    'w15-120': ['mats', 'lots', 'moves', 'plan', 'eq', 'demand', 'alerts'], 'w15-121': ['mats', 'moves', 'plan'],
    'w15-122': ['mats', 'lots', 'moves', 'usage', 'plan', 'eq', 'book']
  };

  /* ── 읽기 (출처 = 정의 「출처」 줄) ── */
  function get(key) {
    var s = DEF.src[key]; if (!s) return Promise.resolve([]);
    var ck = 'wms:' + key, cols = s.select.split(',').filter(function (c) { return (S.missing[key] || []).indexOf(c) < 0; }), q = 'select=' + cols.join(',') + (s.q ? '&' + s.q : '');
    var ok = function (r) { r = norm(key, r || []); S.data[key] = r; delete S.err[key]; try { localStorage.setItem(ck, JSON.stringify(r)); } catch (e) { } return r; };
    return Promise.resolve(C().dbSelect(s.view, q)).then(ok).catch(function (e) {
      var m = String(e && e.message || e), c = null, mc = /column ["\w]*\.?"?(\w+)"? does not exist/.exec(m);
      if (mc && cols.indexOf(mc[1]) >= 0 && (S.missing[key] = S.missing[key] || []).length < 12) { S.missing[key].push(mc[1]); return get(key); }   // DB 에 아직 없는 칸 — 빼고 다시 · 화면에 알림
      try { c = JSON.parse(localStorage.getItem(ck)); } catch (x) { }
      if (c && !/DB 4\d\d/.test(m)) { S.stale = true; S.data[key] = c; return c; }
      S.err[key] = (s.view + ' — ' + m.replace(/^DB \d+: /, '')).slice(0, 160); S.data[key] = []; return [];
    });
  }
  function load(sec) { S.stale = false; return Promise.all((NEED[sec.id] || []).map(get)).then(function () { draw(sec); }); }
  var D = function (k) { return k === 'moves' ? (S.data.moves || []).filter(function (m) { return !!m.confirmed_at; }) : S.data[k] || []; };   // 입출고는 확정된 줄만 셈(DB lot_on_hand 와 같음)
  var localDay = function (ts) { if (!ts) return ''; var d = new Date(ts); return isNaN(d) ? String(ts).slice(0, 10) : new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  function norm(key, rows) {                               // DB 이름(세션7 문안 14) → 앱 안 이름 — 한 곳에서만
    rows.forEach(function (r) {
      if (key === 'moves') { r.move_kind = r.kind; r.moved_on = localDay(r.confirmed_at || r.created_at); }
      else if (key === 'lots') { r.quarantined = !!r.quarantined_at; r.received_on = r.received_at; }
      else if (key === 'book') { r.date_from = r.from_date; r.date_to = r.to_date; }
      else if (key === 'alerts') { r.sent_on = localDay(r.sent_at); }
    }); return rows;
  }
  var nowTs = function () { return new Date().toISOString(); };

  /* ── 셈 ── */
  var today = function () { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  var addDays = function (s, n) { var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  var dayDiff = function (a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); };
  var W = function (k) { return (DEF.words || {})[k] || {}; };
  var SIGN = function (k) { var s = W('움직임')[k]; return s === '+' ? 1 : s === '-' ? -1 : 0; };
  function sg(m) { if (m.move_kind !== '되돌림') return SIGN(m.move_kind); var o = (S.data.moves || []).filter(function (x) { return x.id === m.reverses_id; })[0]; return o ? -sg(o) : 0; }
  var num = function (v) { var x = Number(v); return isNaN(x) ? 0 : x; };
  var byId = function (k, id) { return D(k).filter(function (r) { return r.id === id; })[0] || null; };
  var mat = function (id) { return byId('mats', id); };
  var matName = function (id) { var m = mat(id); return m ? m.name : '[품목 없음 ' + String(id).slice(0, 8) + ']'; };
  function siteName(id) {
    var r = D('plan').concat(D('demand'), D('usage')).filter(function (x) { return x.site_id === id && x.site_name; })[0];
    return r ? r.site_name : (id ? '현장 ' + String(id).slice(0, 8) : '—');
  }
  function lotBad(l) { return !!l.quarantined || (l.expiry_date && l.expiry_date < today()); }
  function lotLeft(id) { return D('moves').filter(function (m) { return m.lot_id === id; }).reduce(function (a, m) { return a + sg(m) * num(m.qty); }, 0); }
  function stockOf(mid) {                                   // 창고 보유(몸) · 쓸 수 있는 몫(격리 · 만료 Lot 뺌)
    var all = 0, use = 0;
    D('moves').filter(function (m) { return m.material_id === mid && sg(m); }).forEach(function (m) {
      var q = sg(m) * num(m.qty), l = m.lot_id ? byId('lots', m.lot_id) : null; all += q; if (!l || !lotBad(l)) use += q; });
    return { all: all, use: use };
  }
  function issued(site, mid) { return D('moves').filter(function (m) { return m.site_id === site && m.material_id === mid && m.move_kind === '출고'; }).reduce(function (a, m) { return a + num(m.qty); }, 0); }
  function planBy(site, mid, upto) { return D('plan').filter(function (p) { return (!site || p.site_id === site) && p.material_id === mid && (!upto || !p.need_on || p.need_on <= upto); }).reduce(function (a, p) { return a + num(p.qty); }, 0); }
  function sites(k) { var o = []; D(k).forEach(function (r) { if (r.site_id && o.indexOf(r.site_id) < 0) o.push(r.site_id); }); return o; }
  function everHad(mid) { return D('lots').some(function (l) { return l.material_id === mid; }) || D('moves').some(function (m) { return m.material_id === mid; }); }
  function assigned(mid) { return sites('plan').reduce(function (a, s) { return a + Math.max(0, planBy(s, mid) - issued(s, mid)); }, 0); }
  function stockRows() {
    var ids = []; D('plan').concat(D('moves')).forEach(function (r) { var m = mat(r.material_id); if (r.material_id && ids.indexOf(r.material_id) < 0 && (!m || m.category !== '공구')) ids.push(r.material_id); });
    return ids.map(function (id) {
      var m = mat(id) || {}, st = stockOf(id), as = assigned(id), had = everHad(id);
      return { id: id, name: m.name || matName(id), unit: m.unit || '', wh: had ? st.all : null, assigned: as, avail: had ? st.use - as : null, lots: D('lots').filter(function (l) { return l.material_id === id && lotLeft(l.id) > 0; }).length, _bad: had && st.use - as < 0 };
    });
  }
  function fefo(mid, need) {                                // 먼저 만료되는 Lot 부터 · 격리 · 만료 빼고
    var out = [], left = need;
    D('lots').filter(function (l) { return l.material_id === mid && !lotBad(l); }).map(function (l) { return { l: l, n: lotLeft(l.id) }; }).filter(function (x) { return x.n > 0; })
      .sort(function (a, b) { return String(a.l.expiry_date || '9999').localeCompare(String(b.l.expiry_date || '9999')); })
      .forEach(function (x) { if (left <= 0) return; var q = Math.min(left, x.n); out.push({ lot: x.l, qty: q }); left -= q; });
    return { take: out, short: Math.max(0, left) };
  }
  function sealBad(m, stage) {                              // 밀봉 1차용 품목이 밀봉 2차 공정에 (또는 반대로) — 섞임
    if (!m || !m.seal_stage || !stage) return false; var want = W('밀봉')[m.seal_stage]; if (!want) return false;
    var other = Object.keys(W('밀봉')).map(function (k) { return W('밀봉')[k]; }).filter(function (v) { return v !== want; });
    return other.some(function (o) { return String(stage).indexOf(o) >= 0; });
  }
  function issueRows() {
    var site = S.sel.site; if (!site) return [];
    var rows = D('plan').filter(function (p) { return p.site_id === site; }), first = rows.map(function (p) { return p.need_on; }).filter(Boolean).sort()[0];
    var upto = S.sel.span === '주마다 나눠서' && first ? addDays(first, num(W('규칙')['주마다'] || 7) - 1) : null, ids = [];
    rows.forEach(function (p) { if (ids.indexOf(p.material_id) < 0) ids.push(p.material_id); });
    return ids.map(function (mid) {
      var m = mat(mid), need = Math.max(0, planBy(site, mid, upto) - issued(site, mid)), st = stockOf(mid), lotm = !m || m.lot_managed !== false;
      var stages = rows.filter(function (p) { return p.material_id === mid; }).map(function (p) { return p.process_stage; });
      var f = lotm ? fefo(mid, need) : { take: need ? [{ lot: null, qty: Math.min(need, Math.max(0, st.use)) }] : [], short: Math.max(0, need - Math.max(0, st.use)) };
      var mix = stages.some(function (s) { return sealBad(m, s); });
      return { id: mid, code: m && m.erp_price_code, name: m ? m.name : matName(mid), need: need, wh: everHad(mid) ? st.use : null, take: f.take, short: f.short, had: everHad(mid), mix: mix, msds: m && m.msds_required,
               lots: f.take.map(function (t) { return t.lot ? t.lot.lot_no + ' × ' + t.qty + (t.lot.expiry_date ? ' (~' + t.lot.expiry_date + ')' : '') : 'Lot 없음 × ' + t.qty; }).join(' · ') || '—' };
    }).filter(function (r) { return r.need > 0; });
  }
  function eqTypes() { var o = []; D('eq').forEach(function (e) { if (e.type && o.indexOf(e.type) < 0) o.push(e.type); }); return o; }
  var okEq = function (e) { return e.status === '정상'; };
  function own(type) { return D('eq').filter(function (e) { return e.type === type && okEq(e); }).length; }
  function overDays(type) { var by = {}; D('demand').filter(function (d) { return d.equipment_type === type; }).forEach(function (d) { by[d.day] = (by[d.day] || 0) + num(d.units); }); var o = own(type); return Object.keys(by).sort().filter(function (d) { return by[d] > o; }).map(function (d) { return { day: d, need: by[d], own: o }; }); }
  function calSt(e) { if (!e.calibration_required) return null; var v = e.next_calibration; if (!v) return { c: 'wait', t: '[미정] 유효일 없음' }; var k = dayDiff(today(), v); return k < 0 ? { c: 'bad', t: '만료 ' + v, k: k } : k <= num(W('규칙')['가까움'] || 60) ? { c: 'run', t: 'D-' + k + ' · ' + v, k: k } : { c: 'ok', t: '유효 ~' + v, k: k }; }
  function bookOverlap(eqId, a, b) {                        // 겹침 = 잡음 · 확정만(회수 · 취소는 빈 장비 — DB booking_guard 와 같음)
 return D('book').some(function (x) { return x.equipment_id === eqId && (x.status === '잡음' || x.status === '확정') && !(x.date_to < a || x.date_from > b); }); }
  function siteDemand(type, site) { var r = D('demand').filter(function (d) { return d.equipment_type === type && d.site_id === site; }); if (!r.length) return null; var ds = r.map(function (d) { return d.day; }).sort(); return { from: ds[0], to: ds[ds.length - 1], units: Math.max.apply(null, r.map(function (d) { return num(d.units); })) }; }
  function bookPlan() {
    var type = S.sel.eqtype, site = S.sel.booksite; if (!type || !site) return null; var d = siteDemand(type, site); if (!d) return null;
    var mine = D('book').filter(function (x) { var e = byId('eq', x.equipment_id); return x.site_id === site && x.status !== '취소' && e && e.type === type; }).length;
    var free = D('eq').filter(function (e) { return e.type === type && okEq(e) && !bookOverlap(e.id, d.from, d.to); });
    var want = Math.max(0, d.units - mine); return { d: d, mine: mine, want: want, free: free.slice(0, want), short: Math.max(0, want - free.length) };
  }
  function bookHold() {                                     // 올라온 배정(잡음) — 고른 종류 × 현장 · 공사본부장 승인 기다림(답 6c8ffce810)
    var type = S.sel.eqtype, site = S.sel.booksite; if (!type || !site) return [];
    return D('book').filter(function (x) { var e = byId('eq', x.equipment_id); return x.site_id === site && x.status === '잡음' && e && e.type === type; });
  }
  function alertRows() {
    var out = [], t = today();
    stockRows().filter(function (r) { return r._bad; }).forEach(function (r) {
      var ps = D('plan').filter(function (p) { return p.material_id === r.id && p.need_on; }).sort(function (a, b) { return a.need_on.localeCompare(b.need_on); })[0];
      out.push({ kind: '부족', what: r.name + ' — ' + Math.abs(r.avail) + ' ' + r.unit, due: ps ? ps.need_on + ' (' + [ps.site_name, ps.zone_name, ps.process_stage].filter(Boolean).join(' ') + ' 시작)' : '—', todo: 'SCM 발주', material_id: r.id, site_id: ps && ps.site_id, due_on: ps && ps.need_on });
    });
    D('lots').filter(function (l) { return lotBad(l) && lotLeft(l.id) > 0; }).forEach(function (l) { out.push({ kind: l.quarantined ? '격리' : '만료', what: matName(l.material_id) + ' ' + l.lot_no + ' · ' + lotLeft(l.id) + ' — ' + (l.expiry_date || ''), due: '지금', todo: '격리 · 반품', material_id: l.material_id }); });
    eqTypes().forEach(function (ty) { var o = overDays(ty); if (o.length) out.push({ kind: '겹침', what: ty + ' ' + Math.max.apply(null, o.map(function (x) { return x.need - x.own; })) + '대 — ' + o[0].day + (o.length > 1 ? ' ~ ' + o[o.length - 1].day : ''), due: o[0].day + ' 전', todo: 'SCM 대여 또는 일정 미룸' }); });
    D('eq').forEach(function (e) { var c = calSt(e); if (c && c.c === 'bad') out.push({ kind: '교정', what: e.eq_code + ' ' + e.name + ' — 만료', due: '지금', todo: '교정 맡김', equipment_id: e.id }); });
    var unk = []; D('plan').forEach(function (p) { if (!everHad(p.material_id) && unk.indexOf(p.material_id) < 0) unk.push(p.material_id); });
    if (unk.length) { var nd = D('plan').filter(function (p) { return unk.indexOf(p.material_id) >= 0 && p.need_on; }).map(function (p) { return p.need_on; }).sort()[0]; out.push({ kind: '모름', what: '보유 [미정] 품목 ' + unk.length + ' (' + unk.map(matName).join(' · ') + ')', due: nd || '—', todo: '창고 실사 (수집표 10)' }); }
    out.forEach(function (r) { var s = D('alerts').filter(function (a) { return a.alert_kind === r.kind && (a.material_id || null) === (r.material_id || null) && (a.equipment_id || null) === (r.equipment_id || null); }).map(function (a) { return a.sent_on || ''; }); r.sent = s.length ? '보냄 ' + s.sort().pop() : '—'; });
    return out;
  }
  function traceRows() {
    var l = S.sel.lot && D('lots').filter(function (x) { return x.lot_no === S.sel.lot; })[0]; if (!l) return [];
    var o = [], u = (mat(l.material_id) || {}).unit || '';
    D('moves').filter(function (m) { return m.lot_id === l.id; }).forEach(function (m) {
      o.push({ d: m.moved_on || '', when: (m.moved_on || '') + ' ' + m.move_kind, where: m.site_id ? siteName(m.site_id) : '본사 창고', qty: (sg(m) > 0 ? '+' : sg(m) < 0 ? '−' : '') + num(m.qty) + ' ' + u, who: 'WMS ' + ({ 입고: 'W-③', 출고: 'W-④', 반납: 'W-⑫', 잃음: 'W-⑫', 반출: 'W-⑪' }[m.move_kind] || '') });
    });
    D('usage').filter(function (x) { return x.lot_number === l.lot_no; }).forEach(function (x) { o.push({ d: x.used_at || '', when: (x.used_at || '') + ' 사용', where: [x.site_name, x.zone_name, x.process_stage].filter(Boolean).join(' · '), qty: num(x.quantity_used) + ' ' + (x.unit || ''), who: 'CES 8-5 (material_usage)' }); });
    return o.sort(function (a, b) { return a.d.localeCompare(b.d); });
  }
  function wearPlans() { var o = [], k = {}; D('plan').forEach(function (p) { var m = mat(p.material_id); if (!m || !/소모품/.test(m.category || '')) return; var key = [p.site_id, p.zone_id, p.process_stage].join('|'); if (k[key]) return; k[key] = 1; o.push({ v: key, t: [p.site_name, p.zone_name, p.process_stage].filter(Boolean).join(' · '), p: p }); }); return o; }
  function wearLots() { var site = (S.sel.wplan || '').split('|')[0]; if (!site) return []; var o = []; D('moves').filter(function (m) { return m.site_id === site && m.move_kind === '출고' && m.lot_id; }).forEach(function (m) { var l = byId('lots', m.lot_id); if (l && !o.some(function (x) { return x.v === l.id; })) o.push({ v: l.id, t: matName(l.material_id) + ' · ' + l.lot_no }); }); return o; }
  function wearCmp(sec) {
    var k = (S.sel.wplan || '').split('|'), l = S.sel.wlot && byId('lots', S.sel.wlot); if (!k[0] || !l) return [];
    var ps = D('plan').filter(function (p) { return p.site_id === k[0] && String(p.zone_id) === k[1] && String(p.process_stage) === k[2] && p.material_id === l.material_id; });
    var v = C().ui.values(sec), q = num(v.qty), a = num(v.area_m2), pq = ps.reduce(function (s, p) { return s + num(p.qty); }, 0), pa = ps.reduce(function (s, p) { return s + num(p.area_m2); }, 0);
    var plan = pa && a ? pq * a / pa : pq;
    return [{ what: matName(l.material_id) + ' · ' + [k[1] && ps[0] && ps[0].zone_name, k[2]].filter(Boolean).join(' '), plan: Math.round(plan * 10) / 10, real: v.qty === '' ? null : q, diff: plan && v.qty !== '' ? (q - plan) / plan : null }];
  }
  function toolRows() {
    return D('mats').filter(function (m) { return m.category === '공구'; }).map(function (m) {
      var out = {}, due = {}; D('moves').filter(function (x) { return x.material_id === m.id && (x.move_kind === '반출' || x.move_kind === '반납' || x.move_kind === '잃음'); }).forEach(function (x) { out[x.site_id] = (out[x.site_id] || 0) + (x.move_kind === '반출' ? 1 : -1) * num(x.qty); if (x.due_back) due[x.site_id] = x.due_back; });
      var ss = Object.keys(out).filter(function (s) { return out[s] > 0; });
      return { id: m.id, name: m.name + (m.mat_code ? ' (' + m.mat_code + ')' : ''), wh: stockOf(m.id).all, out: ss.reduce(function (a, s) { return a + out[s]; }, 0), where: ss.map(siteName).join(' · ') || '—', due: ss.map(function (s) { return due[s]; }).filter(Boolean).sort().pop() || '—' };
    });
  }
  function retRows() {
    var site = S.sel.rsite; if (!site) return [];
    var g = {}, ord = [];
    D('moves').filter(function (m) { return m.site_id === site; }).forEach(function (m) {
      var key = m.material_id + '|' + (m.lot_id || ''); if (!g[key]) { g[key] = { key: key, mid: m.material_id, lot: m.lot_id || null, out: 0, back: 0, lost: 0 }; ord.push(key); }
      var x = g[key]; if (m.move_kind === '출고' || m.move_kind === '반출') x.out += num(m.qty); else if (m.move_kind === '반납') x.back += num(m.qty); else if (m.move_kind === '잃음') x.lost += num(m.qty);
    });
    var rows = ord.map(function (k) {
      var x = g[k], m = mat(x.mid) || {}, l = x.lot && byId('lots', x.lot), used = 0, unitOff = false;
      if (l) D('usage').filter(function (u) { return u.site_id === site && u.lot_number === l.lot_no; }).forEach(function (u) { if (!u.unit || u.unit === m.unit) used += num(u.quantity_used); else unitOff = true; });
      return { id: k, kind: 'm', name: (m.name || matName(x.mid)) + (l ? ' Lot ' + l.lot_no : ''), out: x.out, used: m.category === '공구' ? null : used, unitOff: unitOff, done: x.back + x.lost, mid: x.mid, lot: x.lot };
    });
    var bt = {}; D('book').filter(function (b) { return b.site_id === site; }).forEach(function (b) { var e = byId('eq', b.equipment_id); var t = e ? e.type : '장비'; (bt[t] = bt[t] || []).push(b); });
    Object.keys(bt).forEach(function (t) { var bs = bt[t]; var live = bs.filter(function (b) { return b.status !== '취소'; }); if (live.length) rows.push({ id: 'eq|' + t, kind: 'e', name: t, out: live.length, used: null, books: live,      // 회수 = 확정된 배정만(DB 문안 14 V0.3 · 잡음은 DB 가 막음)
      done: live.filter(function (b) { return b.status === '회수'; }).length, pend: live.filter(function (b) { return b.status === '확정'; }).length, hold: live.filter(function (b) { return b.status === '잡음'; }).length,
      backAt: live.map(function (b) { return b.returned_at || ''; }).filter(Boolean).sort().pop() || '' }); });
    var inp = S.sel.ret || {};
    rows.forEach(function (r) { var v = inp[r.id] || {}; r.backIn = v.back == null || v.back === '' ? null : num(v.back); r.why = v.why || ''; r.left = r.kind === 'e' ? 0 : r.out - (r.used || 0) - r.done - (r.backIn || 0); });
    return rows;
  }

  /* ── 그리기 ── */
  var fmtN = function (v, d) { if (v == null || v === '') return '—'; var x = Number(v); if (isNaN(x)) return esc(v); return x.toLocaleString('ko-KR', { maximumFractionDigits: d == null ? 3 : d }); };
  function stCls(t) { t = String(t == null ? '' : t); if (!t) return ''; for (var i = DEF.st.length - 1; i >= 0; i--) { var r = DEF.st[i]; if (r.words.some(function (w) { return w && t.indexOf(w) >= 0; })) return r.cls; } return 'ok'; }
  var chip = function (t, c) { if (t == null || t === '') return '—'; return '<span class="stw ' + (c || stCls(t)) + '">' + esc(t) + '</span>'; };
  function cell(c, r) {
    var v = r[c.k];
    switch (c.f) {
      case 'code': return v == null || v === '' ? '<span class="stw wait">[미정]</span>' : '<code>' + esc(v) + '</code>';
      case 'n': return fmtN(v);
      case 'yn': return v === true ? '예' : v === false ? '아니오' : '—';
      case 'msds': return v ? '붙임 필수' : '—';
      case 'st': return chip(v);
      case 'avail': return v == null ? chip('[미정] 보유 없음') : v < 0 ? chip(fmtN(v) + ' 부족', 'bad') : '<b>' + fmtN(v) + '</b>';
      case 'short': return r.mix ? chip('섞임 — 밀봉 갈래 다름', 'bad') : !r.had ? chip('[미정] 보유 없음') : r.short > 0 ? chip('부족 ' + fmtN(r.short), 'bad') : chip('넉넉');
      case 'cal': var s = calSt(r); return s ? chip(s.t, s.c) : '교정 대상 아님';
      case 'pct': return v == null ? '—' : '<b>' + (v > 0 ? '+' : '') + Math.round(v * 100) + '%</b>';
      case 'in': if (r.kind === 'e') return '—'; return r.left === 0 && r.backIn == null && r.done ? fmtN(r.done) : '<input class="in" type="number" min="0" step="any" inputmode="decimal" data-ret="' + esc(r.id) + '" data-k="back" value="' + esc(r.backIn == null ? '' : r.backIn) + '" aria-label="돌아옴">';
      case 'why': return r.left > 0 ? '<input class="in why" type="text" data-ret="' + esc(r.id) + '" data-k="why" value="' + esc(r.why) + '" placeholder="잃음 · 망가짐" aria-label="안 온 까닭">' : '—';
    }
    return v == null || v === '' ? '—' : esc(typeof v === 'object' ? JSON.stringify(v) : v);
  }
  function rowsFor(src, sec) {
    switch (src) {
      case '@mats': return D('mats').filter(function (m) { var c = S.sel.cat; return !c || c === '전체' || m.category === c; });
      case '@stock': return stockRows();
      case '@issue': return issueRows();
      case '@trace': return traceRows();
      case '@eqlist': return D('eq').filter(function (e) { var c = S.sel.eqcat; return !c || c === '전체' || e.category === c; });
      case '@callist': return D('eq').filter(function (e) { return e.calibration_required; }).map(function (e) { var s = calSt(e) || {}; return Object.assign({}, e, { use: s.c === 'bad' ? '못 씀' : s.c === 'wait' ? '[미정]' : '씀', todo: s.c === 'bad' ? '교정 맡김' : s.c === 'run' ? '교정 예약' : '—' }); }).sort(function (a, b) { return String(a.next_calibration || '').localeCompare(String(b.next_calibration || '')); });
      case '@wearcmp': return wearCmp(sec);
      case '@alerts': return alertRows();
      case '@tools': return toolRows();
      case '@bookq': return D('book').filter(function (x) { var e = byId('eq', x.equipment_id); return (x.status === '잡음' || x.status === '확정') && e && (!S.sel.eqtype || e.type === S.sel.eqtype); }).map(function (x) {
        var e = byId('eq', x.equipment_id); return { id: x.id, eq: e.eq_code + ' ' + e.name, site: siteName(x.site_id), from: x.date_from, to: x.date_to, by: !x.written_by ? '—' : x.written_by === me() ? '이 계정' : '다른 계정', st: x.status === '잡음' ? '잡음 — 승인 기다림' : '확정' }; });
      case '@ret': return retRows().map(function (r) { return Object.assign({}, r, { back: null, ok: r.kind === 'e' ? eqRetText(r) : r.left === 0 ? '맞음' : r.left > 0 ? fmtN(r.left) + ' 안 옴' : fmtN(-r.left) + ' 더 옴' }); });
    }
    return [];
  }
  function eqRetText(r) {                                   // 장비 줄 — 회수 n(시각 = DB) · 회수 전 n(닫으면 회수) · 잡음 n(확정 전 · 회수 못 함)
    var t = [];
    if (r.done) t.push('회수 ' + r.done + (r.backAt ? ' · ' + localDay(r.backAt) : ''));
    if (r.pend) t.push('회수 전 ' + r.pend + ' — 닫으면 회수');
    if (r.hold) t.push('잡음 ' + r.hold + ' — 확정 전 · 회수 못 함');
    return t.join(' · ');
  }
  var ERRK = { '@mats': ['mats'], '@stock': ['mats', 'lots', 'moves', 'plan'], '@issue': ['plan', 'lots', 'moves'], '@trace': ['lots', 'moves', 'usage'], '@eqlist': ['eq'], '@callist': ['eq'], '@wearcmp': ['plan'], '@alerts': ['alerts', 'demand'], '@tools': ['mats', 'moves'], '@ret': ['moves', 'usage', 'book'], '@gantt': ['demand', 'eq', 'book'], '@bookq': ['book', 'eq'] };
  var EMPTY = { '@issue': '현장을 고르십시오 — 공정계획 v2 확정분이 없으면 0줄', '@trace': 'Lot 번호를 넣으십시오', '@wearcmp': '현장 · 구역 · 공정과 갈아 끼운 Lot 을 고르십시오', '@ret': '현장을 고르십시오', '@alerts': '알림 0 — 모자람 · 만료 · 겹침 · 교정 만료 없음', '@bookq': '올라온 배정 0 — 잡음 · 확정 배정이 없습니다' };
  function table(host, sec) {
    var src = host.getAttribute('data-src'), cols = JSON.parse(host.getAttribute('data-cols') || '[]');
    var es = (ERRK[src] || []).filter(function (k) { return S.err[k]; }).map(function (k) { return S.err[k]; });
    var h = es.length ? '<div class="al stop"><span class="lv">차단</span>못 읽음 — ' + esc(es.join(' / ')) + '</div>' : '';
    if (src === '@gantt') { host.innerHTML = h + gantt(); return; }
    var rows = rowsFor(src, sec); host._rows = rows;
    if (!rows.length) { host.innerHTML = h + '<div class="emptyw"><span class="stw wait">0줄</span> ' + esc(EMPTY[src] || '아직 DB 에 줄이 없습니다') + '</div>'; return; }
    var selk = { '@mats': 'mat', '@callist': 'cal', '@eqlist': 'eqrow' }[src];
    h += '<div class="tbw"><table class="tb"><tr>' + cols.map(function (c) { return '<th>' + esc(c.h) + '</th>'; }).join('') + '</tr>';
    rows.forEach(function (r) { h += '<tr' + (r.id ? ' data-id="' + esc(r.id) + '"' : '') + (selk && S.sel[selk] === r.id ? ' class="onw"' : '') + '>' + cols.map(function (c) { return '<td>' + cell(c, r) + '</td>'; }).join('') + '</tr>'; });
    host.innerHTML = h + '</table></div>';
  }
  function gantt() {
    var ty = S.sel.eqtype; if (!ty) return '<div class="emptyw"><span class="stw wait">0줄</span> 장비 종류를 고르십시오</div>';
    var dm = D('demand').filter(function (d) { return d.equipment_type === ty; }), o = own(ty);
    if (!dm.length) return '<div class="emptyw"><span class="stw wait">0줄</span> ' + esc(ty) + ' — 공정계획 수요(v_ces_equipment_demand) 0줄</div>';
    var days = []; dm.forEach(function (d) { if (days.indexOf(d.day) < 0) days.push(d.day); }); days.sort();
    var ss = []; dm.forEach(function (d) { if (ss.indexOf(d.site_id) < 0) ss.push(d.site_id); });
    var h = '<div class="g11"><div class="tbw"><table class="tb"><tr><th>현장 \\ 날</th>' + days.map(function (d) { return '<th>' + esc(d.slice(5).replace('-', '/')) + '</th>'; }).join('') + '</tr>', tot = days.map(function () { return 0; });
    ss.forEach(function (s) { h += '<tr><td>' + esc(siteName(s)) + '</td>' + days.map(function (d, i) { var n = dm.filter(function (x) { return x.site_id === s && x.day === d; }).reduce(function (a, x) { return a + num(x.units); }, 0); tot[i] += n; return '<td class="' + (n ? 'on' : '') + '">' + (n || '') + '</td>'; }).join('') + '</tr>'; });
    h += '<tr class="sum"><td>합계 / 보유 ' + o + '</td>' + tot.map(function (t) { return '<td class="' + (t > o ? 'over' : t === o ? 'full' : '') + '">' + t + (t > o ? ' ⚠' : '') + '</td>'; }).join('') + '</tr></table></div></div>';
    var ov = overDays(ty);
    h += ov.length ? '<div class="al stop" data-overlap><span class="lv">차단</span><b>' + esc(ov[0].day + (ov.length > 1 ? ' ~ ' + ov[ov.length - 1].day : '')) + ' 겹침 ' + Math.max.apply(null, ov.map(function (x) { return x.need - x.own; })) + '대</b> — 보유 ' + o + '대에 ' + Math.max.apply(null, ov.map(function (x) { return x.need; })) + '대가 걸렸습니다</div>'
      : '<div class="al info" data-overlap><span class="lv">알림</span>겹침 없음 — 그날 수요 합이 보유 ' + o + '대 안</div>';
    return h;
  }
  function pickFill(p, items, key) {
    if (!items.length) { p.innerHTML = '<span class="stw wait">고를 줄 0</span>'; return; }
    if (S.sel[key] && !items.some(function (i) { return i.v === S.sel[key]; })) S.sel[key] = null;
    p.innerHTML = items.map(function (i) { return '<button type="button" data-v="' + esc(i.v) + '"' + (S.sel[key] === i.v ? ' class="on"' : '') + '>' + esc(i.t) + '</button>'; }).join('');
  }
  function picks(sec) {
    $$('.pick[data-wpick]', sec).forEach(function (p) {
      var k = p.getAttribute('data-wpick'), it = [];
      if (k === 'receipt') it = D('receipt').filter(function (r) { return !D('moves').some(function (m) { return m.receipt_id === r.receipt_id && m.move_kind === '입고'; }); }).map(function (r) { return { v: r.receipt_id, t: [r.po_no, r.item_name + ' × ' + fmtN(r.qty), r.vendor_name].filter(Boolean).join(' · ') }; });
      else if (k === 'site' || k === 'tsite') it = sites('plan').map(function (s) { return { v: s, t: siteName(s) }; });
      else if (k === 'eqtype') it = eqTypes().map(function (t) { return { v: t, t: t + ' (보유 ' + own(t) + ')' }; });
      else if (k === 'booksite') it = D('demand').filter(function (d) { return d.equipment_type === S.sel.eqtype; }).map(function (d) { return d.site_id; }).filter(function (s, i, a) { return a.indexOf(s) === i; }).map(function (s) { return { v: s, t: siteName(s) }; });
      else if (k === 'wplan') it = wearPlans();
      else if (k === 'weq') it = D('eq').filter(function (e) { return okEq(e) && !e.calibration_required; }).map(function (e) { return { v: e.id, t: e.eq_code + ' ' + e.name }; });
      else if (k === 'wlot') it = wearLots();
      else if (k === 'tool') it = D('mats').filter(function (m) { return m.category === '공구' && m.status !== '쓸 수 없음'; }).map(function (m) { return { v: m.id, t: m.name }; });
      else if (k === 'rsite') it = sites('moves').concat(sites('book')).filter(function (s, i, a) { return a.indexOf(s) === i; }).map(function (s) { return { v: s, t: siteName(s) }; });
      if (k === 'rsite' && URLSITE && !S.urlRsite && S.sel.rsite == null && it.some(function (i) { return i.v === URLSITE; })) { S.sel.rsite = URLSITE; S.urlRsite = true; }
      pickFill(p, it, k);
    });
    $$('.pick[data-name]:not([data-wpick])', sec).forEach(function (p) { var k = p.getAttribute('data-name'), on = $('button.on', p); if (on && ['cat', 'eqcat', 'span'].indexOf(k) >= 0) S.sel[k] = on.getAttribute('data-v'); });
  }
  function kpis(sec) {
    $$('[data-k]', sec).forEach(function (t) {
      var k = t.getAttribute('data-k'), b = $('b', t), v = '—', c = '';
      if (k === 'k_items') v = stockRows().length;
      else if (k === 'k_short') { v = stockRows().filter(function (r) { return r._bad; }).length; c = v ? 'bad' : 'ok'; }
      else if (k === 'k_expired') { v = D('lots').filter(function (l) { return lotBad(l) && lotLeft(l.id) > 0; }).length; c = v ? 'bad' : 'ok'; }
      else if (k === 'k_unknown') { v = stockRows().filter(function (r) { return r.wh == null; }).length; c = v ? 'wait' : 'ok'; }
      else if (k === 'k_calbad') { v = D('eq').filter(function (e) { var s = calSt(e); return s && s.c === 'bad'; }).length; c = v ? 'bad' : 'ok'; }
      else if (k === 'k_cal60') { v = D('eq').filter(function (e) { var s = calSt(e); return s && s.c === 'run'; }).length; c = v ? 'wait' : 'ok'; }
      else if (k === 'k_eqtypes') { var ts = eqTypes(); t.outerHTML = ts.map(function (x) { return '<div data-kt><small>' + esc(x) + '</small><b>보유 ' + own(x) + '</b></div>'; }).join('') + '<div data-k="k_eqtypes" hidden></div>'; return; }
      if (b) b.textContent = v; t.className = c;
    });
  }
  function draw(sec) {
    if (!sec || !applyAccess(sec).see) return;
    var st = $('[data-stalew]', sec); if (st) st.hidden = !S.stale;
    var mk = Object.keys(S.missing).filter(function (k) { return (NEED[sec.id] || []).indexOf(k) >= 0 && S.missing[k].length; }), mb = $('[data-missw]', sec);
    if (mk.length && !mb) { $('.scr', sec).insertAdjacentHTML('afterbegin', '<div class="al warn" data-missw><span class="lv">경고</span></div>'); mb = $('[data-missw]', sec); }
    if (mb) { mb.hidden = !mk.length; mb.innerHTML = '<span class="lv">경고</span>DB 에 아직 없는 칸(문안 14 V0.3 보다 앞 판) — ' + mk.map(function (k) { return esc(DEF.src[k].view) + ' : ' + S.missing[k].map(esc).join(' · '); }).join(' / ') + ' — 그 칸이 맡는 규칙(밀봉 섞임 · MSDS · Lot 관리)은 지금 보지 못합니다'; }
    $$('[data-kt]', sec).forEach(function (x) { x.remove(); }); $$('[data-k="k_eqtypes"]', sec).forEach(function (x) { x.hidden = false; });
    picks(sec); kpis(sec);
    $$('.livew', sec).forEach(function (h) { table(h, sec); });
    $$('[data-cnt]', sec).forEach(function (e) { var s = e.getAttribute('data-cnt'); if (s === '@gantt') return; var n = rowsFor(s, sec).length; e.textContent = e.getAttribute('data-tpl').replace('{n}', n); });
    $$('[data-wshow]', sec).forEach(function (e) { var c = S.sel.cal && byId('eq', S.sel.cal); e.textContent = c ? c.eq_code + ' ' + c.name : '— 표에서 줄을 누르십시오'; });
    if (sec.id === 'w15-115') { var l = S.sel.lot && D('lots').filter(function (x) { return x.lot_no === S.sel.lot; })[0], hd = $('[data-cnt="@trace"]', sec); if (hd && l) hd.insertAdjacentHTML('beforeend', ' ' + chip(l.quarantined ? '격리' : lotBad(l) ? '만료' : '유효', l.quarantined || lotBad(l) ? 'bad' : 'ok')); }
    gates(sec);
  }

  /* ── 단추 막기 (까닭은 공통 상자 하나 — CES.ui.block) ── */
  function vals(sec) { return C().ui && C().ui.values ? C().ui.values(sec) : {}; }
  function why(a, sec) {
    var v = vals(sec);
    switch (a) {
      case 'retire_mat': var m = S.sel.mat && mat(S.sel.mat); return !m ? '표에서 품목 줄을 누르십시오' : m.status === '쓸 수 없음' ? '이미 「쓸 수 없음」' : '';
      case 'add_mat': return v.mat_code && D('mats').some(function (m) { return m.mat_code === v.mat_code.trim(); }) ? '같은 품목 코드가 있습니다 — ' + v.mat_code : '';
      case 'add_eq': return v.eq_code && D('eq').some(function (e) { return e.eq_code === v.eq_code.trim(); }) ? '같은 관리번호가 있습니다 — ' + v.eq_code : '';
      case 'receive':
        var r = D('receipt').filter(function (x) { return x.receipt_id === v.receipt; })[0]; if (!r) return '발주 줄을 고르십시오';
        var mm = mat(r.material_id);
        if (v.storage === '아님') return '보관 조건이 맞지 않습니다 — 온도 · 습도 · 직사광선 차단 자리에(공사시방서 6.4 c))';
        if (mm && mm.msds_required && v.msds !== '받음') return 'MSDS 사본을 받아야 입고합니다(공사시방서 6.4 d) · 7.3 #3)';
        if (v.lot_no && D('lots').some(function (l) { return l.material_id === r.material_id && l.lot_no === v.lot_no.trim(); })) return '같은 품목 · 같은 Lot 번호가 이미 있습니다';
        return '';
      case 'issue':
        var rs = issueRows(); if (!S.sel.site) return '현장을 고르십시오'; if (!rs.length) return '보낼 것 0 — 공정계획 소요가 이미 다 나갔습니다';
        var mx = rs.filter(function (x) { return x.mix; })[0]; if (mx) return mx.name + ' — 밀봉 갈래가 공정과 다릅니다(섞어 내보내지 않음 · 6.4 a))';
        var no = rs.filter(function (x) { return !x.had; }); if (no.length) return no.map(function (x) { return x.name; }).join(' · ') + ' — 보유 [미정] · 창고 실사(수집표 10) 먼저';
        var sh = rs.filter(function (x) { return x.short > 0; }); if (sh.length) return sh.map(function (x) { return x.name + ' ' + fmtN(x.short) + ' 모자람'; }).join(' · ') + ' — 입고(W-③) 또는 SCM 발주를 먼저';
        return '';
      case 'quarantine': var l = S.sel.lot && D('lots').filter(function (x) { return x.lot_no === S.sel.lot; })[0]; return !l ? 'Lot 번호를 넣으십시오 — 있는 Lot 이어야 합니다' : l.quarantined ? '이미 격리된 Lot' : '';
      case 'book': var b = bookPlan(); if (!S.sel.eqtype || !S.sel.booksite) return '장비 종류 · 배정할 현장을 고르십시오'; if (!b) return '이 현장의 수요 0줄'; if (!b.want) { var hd = bookHold().length; return '이미 배정했습니다 — ' + b.mine + '대' + (hd ? ' (잡음 ' + hd + ' · 공사본부장 승인 기다림)' : ''); } if (b.short) return '겹침 — 그때 빈 ' + S.sel.eqtype + ' ' + b.free.length + '대 · ' + b.short + '대 모자람 → 대여 청구 (SCM) · 다른 현장 미룸 · 공정계획 다시 셈'; return '';
      case 'book_ok': if (!S.sel.eqtype || !S.sel.booksite) return '장비 종류 · 배정할 현장을 고르십시오'; var hb = bookHold(); if (!hb.length) return '올라온 배정(잡음)이 없습니다 — 배정 올림 먼저';   // 직함(공사본부장)은 공통 ces-ui 가 data-title 로 막음
        if (hb.some(function (x) { return x.written_by && x.written_by === me(); })) return '배정을 올린 계정은 승인하지 않습니다 — 다른 계정으로(정렬표 §2 겸직 결재 = 계정 기준)'; return '';
      case 'book_no': if (!S.sel.eqtype || !S.sel.booksite) return '장비 종류 · 배정할 현장을 고르십시오'; if (!bookHold().length) return '올라온 배정(잡음)이 없습니다 — 반려할 줄이 없음'; return '';   // 반려 = 「취소」로 닫음(답 7fa3f87c68) · 직함은 공통 ces-ui 가 data-title 로 막음
      case 'calibrate': if (!S.sel.cal) return '표에서 계측기 줄을 누르십시오'; if (v.calibrated_on && v.valid_until && v.valid_until <= v.calibrated_on) return '다음 유효일이 교정한 날보다 뒤여야 합니다'; return '';
      case 'wear': if (!S.sel.wplan) return '현장 · 구역 · 공정을 고르십시오'; if (!S.sel.weq) return '장비를 고르십시오'; if (!S.sel.wlot) return '갈아 끼운 Lot 을 고르십시오 — 이 현장으로 나간 Lot 이 없으면 출고(W-④) 먼저'; return '';
      case 'alert_po': var p = alertRows().filter(function (x) { return x.kind === '부족'; }); if (!p.length) return '부족 0 — 청구할 것 없음'; if (p.every(function (x) { return sentToday(x); })) return '오늘 이미 적었습니다'; return '';
      case 'lend': var t = S.sel.tool && mat(S.sel.tool); if (!t) return '공구를 고르십시오'; if (!S.sel.tsite) return '현장을 고르십시오'; if (v.qty && num(v.qty) > stockOf(t.id).all) return '창고에 ' + stockOf(t.id).all + ' 뿐입니다'; return '';
      case 'close_ret': var rr = retRows(); if (!S.sel.rsite) return '현장을 고르십시오'; var open = rr.filter(function (x) { return x.left !== 0 || x.backIn || x.pend; }); if (!open.length) return '닫을 것 없음 — 다 맞음';
        var bad = rr.filter(function (x) { return x.left > 0 && !x.why.trim(); }); if (bad.length) return bad.map(function (x) { return x.name + ' ' + fmtN(x.left) + ' 안 옴'; }).join(' · ') + ' — 까닭을 적으십시오';
        var over = rr.filter(function (x) { return x.left < 0; }); if (over.length) return over.map(function (x) { return x.name; }).join(' · ') + ' — 나간 것보다 많이 돌아옴 · 수를 다시 보십시오'; return '';
    }
    return '';
  }
  function sentToday(r) { return D('alerts').some(function (a) { return a.alert_kind === r.kind && a.material_id === r.material_id && a.sent_on === today(); }); }
  function gates(sec) {
    var U = C().ui || {}, bl = U.block || function () { }, ub = U.unblock || function () { };
    $$('button[data-actw]', sec).forEach(function (b) { var a = b.getAttribute('data-actw'), w = a === 'draft' ? '' : why(a, sec); if (w) bl(b, 'wms', w); else ub(b, 'wms'); });
  }

  /* ── 쓰기 ── */
  function ins(key, row) { (S.missing[key] || []).forEach(function (c) { delete row[c]; });
    return C().save(DEF.src[key].view, row, { op: 'insert' }).then(function (id) { row.id = id; (S.data[key] = S.data[key] || []).push(norm(key, [row])[0]); return id; }); }
  function upd(key, id, ch) { (S.data[key] || []).forEach(function (r) { if (r.id === id) { Object.assign(r, ch); norm(key, [r]); } }); return C().save(DEF.src[key].view, Object.assign({ id: id }, ch), { op: 'update' }); }
  function after(sec, msg) { toast(msg); draw(sec); setTimeout(function () { if (C().online && C().online() !== false) load(sec); }, 900); }
  var fail = function (e) { toast('실패 — ' + (e && e.message || e)); };
  function need(sec) { var c = C().ui.check(sec); if (!c.ok) { toast('꼭 넣을 칸 — ' + c.missing.join(' · ')); return false; } return true; }
  function clearForm(sec) { $$('.fs input[name]', sec).forEach(function (x) { x.value = ''; }); try { localStorage.removeItem('wms:draft:' + sec.id); } catch (e) { } }
  function chain(jobs) { return jobs.reduce(function (p, f) { return p.then(f); }, Promise.resolve()); }
  function act(b) {
    var sec = b.closest('section.sc'), a = b.getAttribute('data-actw'), v = vals(sec), t = today();
    if (a === 'draft') { try { localStorage.setItem('wms:draft:' + sec.id, JSON.stringify({ v: v, sel: S.sel })); } catch (e) { } toast('임시저장 — 이 기기에만 남았습니다 · 다시 열면 이어 씀'); return; }
    if (a === 'add_mat') { if (!need(sec)) return;
      ins('mats', { mat_code: v.mat_code.trim(), erp_price_code: (v.erp_price_code || '').trim() || null, name: v.name.trim(), unit: v.unit.trim(), category: v.category, lot_managed: v.lot_managed === '예', seal_stage: v.seal_stage && v.seal_stage !== '—' ? v.seal_stage : null, status: '쓸 수 있음' })
        .then(function () { clearForm(sec); after(sec, '품목 더함 — ' + v.name); }, fail); return; }
    if (a === 'retire_mat') { upd('mats', S.sel.mat, { status: '쓸 수 없음' }).then(function () { after(sec, '「쓸 수 없음」 — 지우지 않았습니다'); }, fail); return; }
    if (a === 'add_eq') { if (!need(sec)) return;
      ins('eq', { eq_code: v.eq_code.trim(), name: v.name.trim(), type: v.type.trim(), category: v.category, model_number: (v.model_number || '').trim() || null, status: v.status, calibration_required: v.category === '품질팀 계측기' })
        .then(function () { clearForm(sec); after(sec, '장비 더함 — ' + v.eq_code); }, fail); return; }
    if (a === 'receive') {
      var r = D('receipt').filter(function (x) { return x.receipt_id === v.receipt; })[0], m = mat(r.material_id), lotm = !m || m.lot_managed !== false;
      if (!need(sec)) return;
      if (lotm && (!String(v.lot_no || '').trim() || !v.expiry_date)) { toast('Lot 관리 품목 — Lot 번호 · 유통기한을 꼭 넣으십시오'); return; }
      var on = v.received_on || t, exp = v.expiry_date || null, bad = !!(exp && exp < on), qty = num(v.qty);
      var jobs = [];
      if (lotm || v.lot_no) jobs.push(function () { return ins('lots', { material_id: r.material_id, lot_no: String(v.lot_no || '').trim(), expiry_date: exp, received_at: on, quarantined_at: bad ? nowTs() : null, quarantine_reason: bad ? '유통기한 지남 — 입고 때 격리' : null }); });
      jobs.push(function (lotId) { return ins('moves', { kind: '입고', material_id: r.material_id, lot_id: lotm || v.lot_no ? lotId : null, site_id: null, qty: qty, receipt_id: r.receipt_id, confirmed_at: nowTs() }); });   // 지난 Lot 도 격리로 받음(QEMS W-P-C020000 Annex B) — 쓸 수 있는 재고 · 출고에서 빠짐
      chain(jobs).then(function () { clearForm(sec); S.sel.receipt = null; after(sec, bad ? '유통기한이 지나 「격리」로 받았습니다 — 쓸 수 있는 재고 · 출고에서 빠짐 · 반품' : '입고 확정 — Lot 한 줄 · 입고 한 줄 (고칠 땐 반대 줄)'); }, fail); return; }
    if (a === 'issue') {
      var rs = issueRows(), site = S.sel.site, js = [], n = 0, ms = rs.some(function (x) { return x.msds; });
      rs.forEach(function (x) { x.take.forEach(function (tk) { n++; js.push(function () { return ins('moves', { kind: '출고', material_id: x.id, lot_id: tk.lot ? tk.lot.id : null, site_id: site, qty: tk.qty, confirmed_at: nowTs() }); }); }); });
      chain(js).then(function () { after(sec, '출고 확정 — ' + siteName(site) + ' · ' + n + '줄' + (ms ? ' · MSDS 사본 함께' : '') + ' → CES 6-4 「보유」'); }, fail); return; }
    if (a === 'quarantine') { var l = D('lots').filter(function (x) { return x.lot_no === S.sel.lot; })[0], used = D('usage').filter(function (u) { return u.lot_number === l.lot_no; }).map(function (u) { return u.site_name; }).filter(function (s, i, z) { return s && z.indexOf(s) === i; });
      upd('lots', l.id, { quarantined_at: nowTs(), quarantine_reason: 'W-⑤ 격리 ' + t }).then(function () { after(sec, '격리 — 새로 나가지 못함' + (used.length ? ' · 이미 쓴 현장 ' + used.join(' · ') + ' ([미정] 판정 알림)' : '')); }, fail); return; }
    if (a === 'book') { var bp = bookPlan(), site2 = S.sel.booksite;          // 올림 = 잡음(장비는 잡아 둠 · DB 겹침 막음) — 확정은 공사본부장 승인(답 6c8ffce810 · 결재 칸 이름은 보내지 않음)
      chain(bp.free.map(function (e) { return function () { return ins('book', { equipment_id: e.id, site_id: site2, from_date: bp.d.from, to_date: bp.d.to, status: '잡음' }); }; }))
        .then(function () { after(sec, '배정 올림 — ' + S.sel.eqtype + ' ' + bp.free.length + '대 「잡음」 · ' + bp.d.from + ' ~ ' + bp.d.to + ' · 공사본부장 승인 기다림'); }, fail); return; }
    if (a === 'book_ok') { var tt = b.getAttribute('data-title') || '', hb = bookHold();
      if (tt.split('|').indexOf(myTitle()) < 0) { toast('결재 직함 「' + tt + '」 계정에서만'); return; }
      chain(hb.map(function (x) { return function () { return upd('book', x.id, { status: '확정', confirmed_at: nowTs() }); }; }))      // 시각 · 승인자(confirmed_by)는 DB 가 찍음(stamp_confirm)
        .then(function () { after(sec, '배정 확정(승인) — ' + S.sel.eqtype + ' ' + hb.length + '대 · ' + siteName(S.sel.booksite)); }, fail); return; }
    if (a === 'book_no') { var tn = b.getAttribute('data-title') || '', hn = bookHold();
      if (tn.split('|').indexOf(myTitle()) < 0) { toast('결재 직함 「' + tn + '」 계정에서만'); return; }
      chain(hn.map(function (x) { return function () { return upd('book', x.id, { status: '취소' }); }; }))      // 반려 = 취소로 닫음 · 닫힌 줄은 DB 가 다시 열지 못하게 막음(booking_guard) · 새로 올림
        .then(function () { after(sec, '배정 반려 — ' + S.sel.eqtype + ' ' + hn.length + '대 「취소」로 닫음 · 장비는 풀림 · 새로 올림'); }, fail); return; }
    if (a === 'calibrate') { if (!need(sec)) return; var f = $('input[name=cert_file]', sec), fn = f && f.files && f.files[0] ? f.files[0].name : null, eqId = S.sel.cal;
      ins('cal', { equipment_id: eqId, calibrated_on: v.calibrated_on, valid_until: v.valid_until, agency: (v.agency || '').trim() || null, cert_file: fn })
        .then(function () { (S.data.eq || []).forEach(function (e) { if (e.id === eqId) { e.last_calibration = v.calibrated_on; e.next_calibration = v.valid_until; } }); clearForm(sec); if (f) f.value = ''; after(sec, '교정 결과 넣음 — 새 줄 · 유효일은 DB 가 장비 대장에 옮김'); }, fail); return; }
    if (a === 'wear') { if (!need(sec)) return; var k = S.sel.wplan.split('|'), lt = byId('lots', S.sel.wlot);
      ins('wear', { site_id: k[0], zone_id: k[1] || null, process_stage: k[2] || null, equipment_id: S.sel.weq, lot_id: lt.id, material_id: lt.material_id, pads_replaced: Math.round(num(v.qty)), area_m2: v.area_m2 === '' ? null : num(v.area_m2), wear_state: v.wear_state })
        .then(function () { clearForm(sec); after(sec, '교체 기록 — 재고에서 빠지지 않음(출고 때 이미 빠짐)'); }, fail); return; }
    if (a === 'alert_po') { var ps = alertRows().filter(function (x) { return x.kind === '부족' && !sentToday(x); });
      chain(ps.map(function (x) { return function () { return ins('alerts', { alert_kind: '부족', material_id: x.material_id, site_id: x.site_id || null, due_date: x.due_on || null, message: x.what + ' → SCM 발주 청구', sent_to: '관리팀장 · 공사본부장' }); }; }))
        .then(function () { after(sec, '발주 청구 ' + ps.length + '줄 적음 — SCM-⑦ 구매 요청이 읽음'); }, fail); return; }
    if (a === 'lend') { if (!need(sec)) return;
      ins('moves', { kind: '반출', material_id: S.sel.tool, lot_id: null, site_id: S.sel.tsite, qty: num(v.qty), due_back: v.due_back, confirmed_at: nowTs() }).then(function () { clearForm(sec); after(sec, '반출 — ' + matName(S.sel.tool) + ' × ' + v.qty + ' → ' + siteName(S.sel.tsite)); }, fail); return; }
    if (a === 'close_ret') { var rr = retRows(), site3 = S.sel.rsite, jb = [];
      rr.forEach(function (x) {
        var back = x.backIn || 0, lost = Math.max(0, x.left);
        if (x.kind === 'm') {
          if (back) jb.push(function () { return ins('moves', { kind: '반납', material_id: x.mid, lot_id: x.lot, site_id: site3, qty: back, confirmed_at: nowTs() }); });
          if (lost) jb.push(function () { return ins('moves', { kind: '잃음', material_id: x.mid, lot_id: x.lot, site_id: site3, qty: lost, reason: x.why.trim(), confirmed_at: nowTs() }); });
        } else {                                            // 장비 회수(W-⑫ · QEMS W-FR-L-C013000-01 A06-01) — 확정된 배정만 · 상태 한 칸만 보냄(returned_at · returned_by = DB 가 찍음)
          x.books.filter(function (b) { return b.status === '확정'; }).forEach(function (b) { jb.push(function () { return upd('book', b.id, { status: '회수' }); }); });
        }
      });
      chain(jb).then(function () { S.sel.ret = {}; after(sec, '반납 닫음 — ' + siteName(site3) + ' · ' + jb.length + '줄'); }, fail); return; }
  }

  /* ── 묶기 ── */
  function restore(sec) {                                   // 임시저장 = 넣은 칸 + 고른 것(이 기기에만) — 다시 열면 이어 씀
    var d = null; try { d = JSON.parse(localStorage.getItem('wms:draft:' + sec.id)); } catch (e) { } if (!d) return;
    var v = d.v || d; if (d.sel) Object.keys(d.sel).forEach(function (k) { if (S.sel[k] == null) S.sel[k] = d.sel[k]; });
    $$('.fs input[name]', sec).forEach(function (x) { if (x.type !== 'file' && v[x.name] != null && !x.value) x.value = v[x.name]; });
    $$('.pick[data-name]:not([data-wpick])', sec).forEach(function (p) { var w = v[p.getAttribute('data-name')]; if (w == null) return; $$('button', p).forEach(function (b) { b.classList.toggle('on', (b.getAttribute('data-v') || b.textContent.trim()) === w); }); });
  }
  /* ── 볼 권한 · 쓸 권한 (시험기준 「쓰기 단추가 보이지 않음 · 그 밖 계정은 줄 없음」 — 보는 권한 = 정의 「보기」 줄) ── */
  function access(sec) { var p = sec.getAttribute('data-can') || '', v = (DEF.view || {})[sec.id] || [], ts = (sec.getAttribute('data-titles') || '').split('|').filter(Boolean);   // 결재 직함(검토 · 승인)도 그 화면을 봄
    return { p: p, v: v, ts: ts, write: can(p), see: can(p) || v.some(can) || (!!myTitle() && ts.indexOf(myTitle()) >= 0) }; }
  function applyAccess(sec) {
    var a = access(sec), scr = $('.scr', sec); if (!scr) return a;
    Array.prototype.slice.call(scr.children).forEach(function (c) {
      if (c.classList.contains('wlock')) return;
      if (!a.see) { if (!c.hasAttribute('data-lockh')) { c.setAttribute('data-lockh', c.hidden ? '1' : '0'); c.hidden = true; } }
      else if (c.hasAttribute('data-lockh')) { c.hidden = c.getAttribute('data-lockh') === '1'; c.removeAttribute('data-lockh'); }
    });
    var lk = $('.wlock', scr);
    if (!a.see && !lk) scr.insertAdjacentHTML('afterbegin', '<div class="al stop wlock"><span class="lv">차단</span>이 화면을 볼 권한이 없습니다 — 쓰기 <code>' + esc(a.p) + '</code>' + (a.v.length ? ' · 보기 <code>' + a.v.map(esc).join('</code> · <code>') + '</code>' : ' (보기만 하는 권한 없음)') + '</div>');
    if (a.see && lk) lk.parentNode.removeChild(lk);
    $$('[data-wform]', sec).forEach(function (f) { f.hidden = !a.write; });
    $$('button[data-actw]', sec).forEach(function (b) { var t = b.getAttribute('data-title');   // 결재 단추 = 그 직함 계정 · 쓰는 계정(까닭과 함께 죽어 보임)에게만 보임
      b.hidden = t ? !(can(a.p) || t.split('|').indexOf(myTitle()) >= 0) : !can(b.getAttribute('data-can') || a.p); });
    return a;
  }
  function onShow(id) { if (MY.indexOf(id) < 0) return; S.cur = id; var sec = document.getElementById(id); if (!applyAccess(sec).see) return; restore(sec); load(sec); }
  function start() {
    document.addEventListener('ces:show', function (e) { onShow(e.detail && e.detail.id || (e.target && e.target.id)); });
    document.addEventListener('ces:pick', function (e) {
      var p = e.target, sec = p.closest && p.closest('section.sc'); if (!sec || MY.indexOf(sec.id) < 0) return;
      var k = p.getAttribute('data-name'), on = $('button.on', p); S.sel[k] = on ? on.getAttribute('data-v') : null;
      if (k === 'eqtype') S.sel.booksite = null; if (k === 'wplan') { S.sel.wlot = null; var w = wearPlans().filter(function (x) { return x.v === S.sel.wplan; })[0], ar = $('input[name=area_m2]', sec); if (w && ar && !ar.value && w.p.area_m2 != null) ar.value = w.p.area_m2; }
      if (k === 'rsite') S.sel.ret = {}; if (k === 'receipt') { var r = D('receipt').filter(function (x) { return x.receipt_id === S.sel.receipt; })[0], q = $('input[name=qty]', sec); if (r && q && !q.value) q.value = r.qty; }
      draw(sec);
    });
    document.addEventListener('click', function (e) {
      var t = e.target; if (!t.closest) return; var sec = t.closest('section.sc'); if (!sec || MY.indexOf(sec.id) < 0) return;
      var b = t.closest('button[data-actw]'); if (b) { if (!b.disabled) act(b); return; }
      var tr = t.closest('.livew tr[data-id]'); if (tr && !t.closest('input')) { var src = tr.closest('.livew').getAttribute('data-src'), k = { '@mats': 'mat', '@callist': 'cal', '@eqlist': 'eqrow' }[src]; if (k) { S.sel[k] = tr.getAttribute('data-id'); draw(sec); } }
    });
    document.addEventListener('input', function (e) {
      var t = e.target, sec = t.closest && t.closest('section.sc'); if (!sec || MY.indexOf(sec.id) < 0) return;
      if (t.hasAttribute('data-ret')) { var id = t.getAttribute('data-ret'); S.sel.ret = S.sel.ret || {}; (S.sel.ret[id] = S.sel.ret[id] || {})[t.getAttribute('data-k')] = t.value;
        if (t.getAttribute('data-k') === 'back') { clearTimeout(S.rt); S.rt = setTimeout(function () { var f = document.activeElement && document.activeElement.getAttribute('data-ret'); draw(sec); if (f) { var x = $('input[data-ret="' + f + '"][data-k="back"]', sec); if (x) { x.focus(); x.setSelectionRange && x.type === 'text' && x.setSelectionRange(x.value.length, x.value.length); } } }, 350); } else gates(sec); return; }
      if (t.name === 'lot_no' && sec.id === 'w15-115') { S.sel.lot = t.value.trim(); draw(sec); return; }
      if (sec.id === 'w15-119' && (t.name === 'qty' || t.name === 'area_m2')) { $$('.livew', sec).forEach(function (h) { table(h, sec); }); }
      gates(sec);
    });
    window.addEventListener('ces:pending', function () { var s = S.cur && document.getElementById(S.cur); if (s) gates(s); });
    var cur = $('section.sc.on'); if (cur) onShow(cur.id); else { var h = location.hash.replace('#', ''); if (MY.indexOf(h) >= 0) onShow(h); }
  }
  function boot() {
    var d = $('#wms-def'); if (!d) return; try { DEF = JSON.parse(d.textContent); MY = DEF.screens; } catch (e) { document.body.insertAdjacentHTML('afterbegin', '<div class="lock">정의(#wms-def)를 못 읽었습니다 — ' + esc(e.message) + '</div>'); return; }
    var n = 0, t = setInterval(function () { if ((C().ui && C().save) || ++n > 100) { clearInterval(t); start(); } }, 50);
  }
  window.CES_WMS = { state: S, rowsFor: rowsFor, stockRows: stockRows, issueRows: issueRows, alertRows: alertRows, retRows: retRows };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
