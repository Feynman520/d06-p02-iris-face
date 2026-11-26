// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// IRIS Doctor 창(2026-11-26 사용자 선택: 자리 = 작업목록 바닥의 단추 + 곳곳의 단추 · 창 = 시안 「나」 검진표 창 · "텍스트는 최소한으로").
// 설계 정본 = D09 「에이전트 업데이트·의사-설계」 D3 · 코덱스 협의 14차.
//  · 어느 단추(data-doctor · #rail-doctor)를 눌러도 같은 창이 뜬다. 창이 뜨면 검진(읽기만)을 돌려 검진표를 그린다.
//  · 원인 찾기 · 치료 · 계정 연결은 창 밖의 Doctor 창에서 한다(「치료하기」 · 「연결 · 바꾸기」 = 그 창을 연다). 열쇠 · 계정 이름은 이 화면을 거치지 않는다.
//  · 화면은 데몬에만 말한다: POST /api/doctor/checkup · GET /api/doctor · GET /api/doctor/records · POST /api/doctor/open.
//  · 검진이나 계정 상태를 읽지 못해도 「치료하기」는 된다. 읽지 못한 것을 "정상" · "연결 안 됨"으로 적지 않는다.
//  · 받은 글은 textContent 로만 넣는다.
window.DoctorView = (() => {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const NAME = { claude: 'Claude', codex: 'Codex' };
  const ST_WORD = { bad: '고장', warn: '주의', ok: '정상', unknown: '모름', skipped: '건너뜀' };
  const ORDER = ['bad', 'warn', 'unknown', 'ok', 'skipped'];
  let avail = false, broken = false, wired = false, isOpen = false, view = 'report';
  let check = { state: 'idle', data: null, why: '' }, link = null, records = null, opening = false, lastFocus = null, token = 0;
  const openGroups = new Set(); // 사용자가 펼친 묶음(문제가 있는 묶음은 처음부터 펼쳐 둔다)

  const hm = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const md = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`; };
  const counts = (fs) => Object.fromEntries(ORDER.map((s) => [s, fs.filter((f) => f.state === s).length]));
  const worst = (fs) => ORDER.find((s) => s !== 'ok' && s !== 'skipped' && fs.some((f) => f.state === s)) || 'ok';

  // ---- 계정 ----
  function accountWord(a, kind) {
    switch (a?.state) {
      case 'ready': return [`준비됨 · ${md(a.okAt)}`, 'ok'];
      case 'failed': return ['확인 실패', 'warn'];
      case 'card': return ['확인 전', 'warn'];
      case 'expired': return ['열쇠 만료', 'bad'];
      case 'none': return ['연결 안 됨', 'off'];
      case 'unreadable': return ['읽지 못함', 'warn'];
      default: return ['확인 못함', 'off'];
    }
  }
  const linkKnown = () => link?.state === 'ok' && link.claude && link.codex && typeof link.claude.state === 'string' && typeof link.codex.state === 'string';
  const readyCount = () => (linkKnown() ? ['claude', 'codex'].filter((k) => link[k].state === 'ready').length : 0);

  // ---- 그리기 ----
  function renderHead() {
    const c = check, fs = c.data?.findings || [];
    $('#dr-when').textContent = c.state === 'done' && c.data.at ? `검진 ${hm(c.data.at)}` : '';
    $('#dr-again').hidden = view !== 'report' || c.state === 'running';
    const big = $('#dr-big'), chips = $('#dr-chips'); chips.textContent = '';
    big.className = 'dr-big';
    if (view === 'records') { big.textContent = '기록'; return; }
    if (c.state === 'running' || c.state === 'idle') { big.textContent = '검진 중'; big.classList.add('run'); return; }
    if (c.state === 'failed') { big.textContent = c.why === 'timeout' ? '검진이 끝나지 않았습니다' : '검진하지 못했습니다'; big.classList.add('warn'); return; }
    const n = counts(fs);
    big.textContent = n.bad ? `고장 ${n.bad}건` : n.warn || n.unknown ? '고장 없음 · 확인할 것 있음' : '모두 정상';
    big.classList.add(n.bad ? 'bad' : n.warn || n.unknown ? 'warn' : 'ok');
    for (const s of ORDER) if (n[s]) { const chip = el('span', 'dr-chip'); chip.append(el('i', `dr-dot ${s}`), `${ST_WORD[s]} ${n[s]}`); chips.append(chip); }
  }
  function renderList() {
    const box = $('#dr-list'); box.textContent = '';
    if (view === 'records') return renderRecords(box);
    const c = check;
    if (c.state === 'running' || c.state === 'idle') { for (let i = 0; i < 5; i++) box.append(el('div', 'dr-skel')); return; }
    if (c.state === 'failed') { box.append(el('p', 'dr-empty', '「다시 검진」을 누르거나, 바로 「치료하기」로 Doctor 창을 열 수 있습니다.')); return; }
    for (const g of c.data.groups) {
      const fs = c.data.findings.filter((f) => f.group === g.id); if (!fs.length) continue;
      const w = worst(fs), n = counts(fs), open = openGroups.has(g.id);
      const sec = el('section', 'dr-grp');
      const head = el('button', 'dr-gh'); head.type = 'button'; head.setAttribute('aria-expanded', String(open)); head.dataset.group = g.id;
      head.append(el('span', 'dr-car', open ? '▾' : '▸'), el('i', `dr-dot ${w}`), el('span', 'dr-gn', g.title), el('span', 'dr-gc', ORDER.filter((s) => n[s]).map((s) => `${ST_WORD[s]} ${n[s]}`).join(' · ')));
      sec.append(head);
      // 접힌 묶음도 문제 항목은 늘 보인다 — 펼치면 나머지(정상 · 건너뜀)까지
      for (const f of fs.filter((x) => open || x.state === 'bad' || x.state === 'warn' || x.state === 'unknown').sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state))) {
        const row = el('div', `dr-row ${f.state}`); const t = el('div');
        t.append(el('b', '', f.title), el('small', '', f.summary));
        row.append(el('i', `dr-dot ${f.state}`), t); sec.append(row);
      }
      box.append(sec);
    }
  }
  const REC_WORD = {
    checkup: (r) => `검진 — ${r.bad ? `고장 ${r.bad}` : r.warn ? `주의 ${r.warn}` : r.unknown ? `모름 ${r.unknown}` : '정상'}`, 'checkup-failed': () => '검진 실패', open: () => 'Doctor 창 열림', close: () => 'Doctor 창 닫힘',
    link: (r) => `${NAME[r.service] || '계정'} 연결 ${r.ok ? '성공' : '실패'}`, probe: (r) => `${NAME[r.service] || '계정'} 연결 확인 ${r.ok ? '성공' : '실패'}`,
    'treat-start': () => '치료 시작', 'treat-end': (r) => `치료 끝 — ${({ resolved: '해결', improved: '나아짐', unresolved: '미해결', interrupted: '끊김' })[r.outcome] || '끝'}`,
  };
  function renderRecords(box) {
    if (!records) { for (let i = 0; i < 5; i++) box.append(el('div', 'dr-skel')); return; }
    if (!records.ok) { box.append(el('p', 'dr-empty', '기록을 읽지 못했습니다.')); return; }
    if (!records.items.length) { box.append(el('p', 'dr-empty', '아직 기록이 없습니다.')); return; }
    for (const r of records.items) {
      const lv = r.kind === 'checkup' ? (r.bad ? 'bad' : r.warn ? 'warn' : r.unknown ? 'unknown' : 'ok') : r.ok === false || r.kind === 'checkup-failed' ? 'warn' : r.kind === 'treat-end' ? (r.outcome === 'resolved' ? 'ok' : 'warn') : 'off';
      const row = el('div', 'dr-rec'); row.append(el('i', `dr-dot ${lv}`), el('span', 'dr-rt', `${md(r.at)} ${hm(r.at)}`), el('span', '', (REC_WORD[r.kind] || (() => r.kind))(r))); box.append(row);
    }
  }
  function renderSide() {
    const box = $('#dr-accounts'); box.textContent = '';
    for (const kind of ['claude', 'codex']) {
      const [w, lv] = linkKnown() ? accountWord(link[kind], kind) : [link ? '확인 못함' : '…', 'off'];
      const row = el('div', `dr-acc ${lv}`); row.append(el('span', '', NAME[kind]), el('span', 'dr-as', w)); box.append(row);
    }
    const c = check, n = c.state === 'done' ? counts(c.data.findings) : null, cta = $('#dr-open');
    const quiet = !!n && !n.bad && !n.warn && !n.unknown; // 모두 정상이면 치료 단추를 내세우지 않는다
    cta.textContent = opening ? '여는 중' : quiet ? 'Doctor 창 열기' : '치료하기'; cta.disabled = opening; cta.classList.toggle('ghost', quiet);
    $('#dr-cta-note').textContent = linkKnown() && !readyCount() ? '먼저 「연결 · 바꾸기」로 계정을 연결해 두세요' : '창 밖의 Doctor 창에서 진행 · 시작 전 한 번 묻습니다';
  }
  function renderFoot() {
    $('#dr-rec').textContent = view === 'records' ? '검진표' : '기록';
    $('#dr-foot-t').textContent = view === 'records' ? '기록은 이 PC 에만 저장됩니다' : check.state === 'done' && check.data.recorded === false ? '검진은 읽기만 합니다 · 이번 검진은 기록하지 못했습니다' : '검진은 읽기만 합니다 · 기록은 이 PC 에만';
  }
  function render() { if (!isOpen) return; renderHead(); renderList(); renderSide(); renderFoot(); }
  /** 작업목록 단추의 꼬리표: 마지막 검진에서 고장이 나왔거나, 복구에 쓸 계정이 하나도 준비되지 않았을 때만 */
  function renderRail() {
    const b = $('#rail-doctor'); if (!b) return;
    b.hidden = !avail;
    const bad = check.state === 'done' && check.data.findings.some((f) => f.state === 'bad');
    const noAcc = linkKnown() && !readyCount() && ['claude', 'codex'].every((k) => ['failed', 'card', 'expired', 'none', 'unreadable'].includes(link[k].state));
    const word = broken ? '확인 필요' : bad ? '고장' : noAcc ? '계정 없음' : '';
    b.classList.toggle('warn', !!word); $('#rail-doctor-st').textContent = word;
  }

  // ---- 데몬에 묻기 ----
  async function runCheckup(fresh) {
    const mine = ++token; check = { state: 'running', data: null, why: '' }; openGroups.clear(); render();
    let r = null;
    try { const res = await fetch(`/api/doctor/checkup${fresh ? '?fresh=1' : ''}`, { method: 'POST' }); r = await res.json().catch(() => null); } catch {}
    if (mine !== token) return;
    if (r?.ok && Array.isArray(r.findings) && Array.isArray(r.groups) && r.findings.length) check = { state: 'done', data: r, why: '' };
    else check = { state: 'failed', data: null, why: r?.why === 'timeout' ? 'timeout' : 'failed' };
    render(); renderRail();
  }
  async function loadLink(force) {
    try { const res = await fetch(force ? '/api/doctor?fresh=1' : '/api/doctor'); const j = res.ok ? await res.json() : null; link = j && typeof j.link === 'object' && j.link ? j.link : { state: 'unknown' }; broken = !!j?.broken; }
    catch { link = { state: 'unknown' }; }
    render(); renderRail();
  }
  async function loadRecords() {
    records = null; render();
    try { const res = await fetch('/api/doctor/records'); const j = res.ok ? await res.json() : null; records = j && Array.isArray(j.items) ? { ok: j.ok !== false, items: j.items } : { ok: false, items: [] }; } catch { records = { ok: false, items: [] }; }
    render();
  }

  // 실패의 까닭: [본문, 접힌 「자세히」 한 줄] — 안쪽 낱말을 화면에 그대로 내지 않는다
  const WHY = {
    'start-file-missing': ['IRIS Doctor 의 시작 파일이 없습니다. IRIS 설치 프로그램을 다시 실행하면 다시 놓입니다.', '시작 파일을 찾지 못했습니다.'],
    spawn: ['윈도우가 IRIS Doctor 를 띄우지 못했습니다.', '윈도우가 실행을 받아들이지 않았습니다.'],
    failed: ['IRIS Doctor 가 답하지 않았습니다.', 'IRIS Doctor 프로그램이 답을 주지 않았습니다.'],
    none: ['IRIS 가 요청에 답하지 않았습니다.', 'IRIS 창 안쪽에서 답을 받지 못했습니다.'],
  };
  const ELSEWHERE = '바탕화면이나 시작 메뉴의 「IRIS Doctor」로도 열 수 있습니다.';
  /** 창 밖의 Doctor 창을 연다(치료 · 계정 연결은 거기서). 말은 확인된 만큼만 한다. */
  async function openOutside() {
    if (opening) return;
    opening = true; renderSide();
    let r = null;
    try { const res = await fetch('/api/doctor/open', { method: 'POST' }); r = await res.json().catch(() => null); } catch {}
    opening = false; renderSide();
    if (r?.ok && !r.direct) Dialog.notice('IRIS Doctor 창을 열었습니다', { sub: r.others > 0 ? `작업 표시줄을 확인하세요. 이미 열려 있던 창이 ${r.others}개 있습니다.` : '작업 표시줄의 새 창을 확인하세요.', tone: 'info' });
    else if (r?.ok || r?.why === 'unconfirmed') Dialog.notice('IRIS Doctor 창을 띄웠습니다 — 떴는지는 확인하지 못했습니다', { sub: `작업 표시줄에 새 창이 없으면 한 번 더 누르거나, ${ELSEWHERE}`, tone: 'warn' });
    else { const [msg, detail] = WHY[r ? r.why : 'none'] || WHY.failed; Dialog.error({ title: 'IRIS Doctor 창을 열지 못했습니다', message: `${msg} ${ELSEWHERE}`, detail }); }
    loadLink(true); // 열린 창에서 계정을 바꿨을 수 있다
  }

  // ---- 열고 닫기 ----
  function show() {
    if (!avail) return false;
    wire();
    if (!isOpen) { lastFocus = document.activeElement; isOpen = true; view = 'report'; $('#dr-modal').hidden = false; }
    render();
    // 1분 안에 한 검진이 있으면 안쪽이 그 검진표를 다시 준다(창을 여닫을 때마다 새로 돌지 않는다)
    if (check.state !== 'running') runCheckup(false);
    loadLink(false);
    setTimeout(() => $('#dr-close')?.focus(), 0);
    return true;
  }
  function close() { if (!isOpen) return; isOpen = false; $('#dr-modal').hidden = true; try { lastFocus?.focus?.(); } catch {} }
  /** 창이 떠 있는 동안 Tab 은 창 안에서만 돈다 */
  function keys(e) {
    if (!isOpen || e.key !== 'Tab') return;
    const dlg = document.getElementById('dlg'); if (dlg && !dlg.hidden) return; // 그 위에 안내 창이 떠 있으면 초점을 빼앗지 않는다(안내 창이 제 초점을 다룬다)
    const stops = [...$('#dr-modal').querySelectorAll('button:not([disabled]):not([hidden])')].filter((b) => b.offsetParent !== null);
    if (!stops.length) return;
    const first = stops[0], last = stops[stops.length - 1], at = document.activeElement;
    if (!stops.includes(at)) { e.preventDefault(); first.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
  }
  function wire() {
    if (wired) return; wired = true;
    $('#dr-close').addEventListener('click', close);
    $('#dr-modal').addEventListener('mousedown', (e) => { if (e.target === $('#dr-modal')) close(); });
    $('#dr-again').addEventListener('click', () => runCheckup(true));
    $('#dr-open').addEventListener('click', openOutside);
    $('#dr-link').addEventListener('click', openOutside);
    $('#dr-rec').addEventListener('click', () => { view = view === 'records' ? 'report' : 'records'; if (view === 'records') loadRecords(); else render(); });
    $('#dr-list').addEventListener('click', (e) => { const h = e.target.closest('.dr-gh'); if (!h) return; const g = h.dataset.group; if (openGroups.has(g)) openGroups.delete(g); else openGroups.add(g); renderList(); [...document.querySelectorAll('#dr-list .dr-gh')].find((b) => b.dataset.group === g)?.focus(); }); // 목록을 다시 그려도 누른 묶음에 초점을 돌려 둔다(키보드로 이어서 누를 수 있게)
    document.addEventListener('keydown', keys, true);
  }
  /** 화면이 뜰 때 한 번: IRIS Doctor 가 있는 PC 인지 보고 단추들을 살린다. 곳곳의 단추(data-doctor)는 눌리면 이 창을 연다. */
  async function init() {
    for (const s of document.querySelectorAll('[data-dr-icon]')) s.innerHTML = window.Icons ? Icons.svg('pulse', 16) : '';
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-doctor], #rail-doctor'); if (b && avail) { e.preventDefault(); show(); } });
    try { const h = await (await fetch('/api/health')).json(); avail = !!h?.features?.doctor?.available; broken = !!h?.features?.doctor?.broken; } catch {}
    document.documentElement.classList.toggle('has-doctor', avail); // 곳곳의 단추는 이 표시가 있을 때만 보인다(CSS)
    renderRail();
    if (avail) loadLink(false);
  }
  return { init, show, close, isOpen: () => isOpen, available: () => avail, _accountWord: accountWord };
})();
