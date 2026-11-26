// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// IRIS Doctor 창(2026-11-26 사용자 선택: 자리 = 작업목록 바닥의 단추 + 곳곳의 단추 · "텍스트는 최소한으로").
// 설계 정본 = D09 「에이전트 업데이트·의사-설계」 D3 · 코덱스 협의 14차.
// 모양(같은 날 밤 다시 그림 — 사용자 선택 = 시안 「다」 문제만 크게 + 바닥 「다-1」 뱃지 줄, docs\시안-Doctor 창과 업데이트 칸 개선-v2-2026-11-26.html):
//   결론 한 문장(도장 + 큰 글) → 확인할 것만 카드로 → "나머지 N가지는 정상입니다" 한 줄 → 단추 하나(치료하기) → 바닥의 뱃지(왼쪽 Doctor 계정 · 오른쪽 지난 기록).
//   글은 쓰는 사람의 말로: Doctor 가 항목마다 주는 name · say · more 를 쓰고(Doctor 의 lib/plain.mjs), 없으면 title · summary 로 물러난다.
//  · 어느 단추(data-doctor · #rail-doctor)를 눌러도 같은 창이 뜬다. 창이 뜨면 살펴보기(읽기만)를 돌려 결과를 그린다.
//  · 원인 찾기 · 치료 · 계정 연결은 창 밖의 Doctor 창에서 한다(「치료하기」 · 계정 뱃지 = 그 창을 연다). 열쇠 · 계정 이름은 이 화면을 거치지 않는다.
//  · 화면은 데몬에만 말한다: POST /api/doctor/checkup · GET /api/doctor · GET /api/doctor/records · POST /api/doctor/open.
//  · 살펴보기나 계정 상태를 읽지 못해도 「치료하기」는 된다. 읽지 못한 것을 "정상" · "연결 안 됨"으로 적지 않는다.
//  · 받은 글은 textContent 로만 넣는다(아이콘은 icons.js 의 고정 마크업).
window.DoctorView = (() => {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const setIcon = (node, name, size) => { node.innerHTML = window.Icons ? Icons.svg(name, size) : ''; return node; }; // HTML 로 넣는 곳은 여기 하나(icons.js 의 고정 마크업만 — 받은 글은 넣지 않는다)
  const icon = (name, size = 16, cls = '') => setIcon(el('span', cls), name, size);
  const NAME = { claude: 'Claude', codex: 'Codex' };
  const ST_WORD = { bad: '고장', warn: '확인', ok: '정상', unknown: '확인 못 함', skipped: '보지 않음' };
  const ORDER = ['bad', 'warn', 'unknown', 'ok', 'skipped'];
  const PILL = { bad: ['치료 대상', 'fix'], warn: ['직접 확인', ''], unknown: ['확인 못 함', ''] }; // 고쳐진다고 장담하지 않는다(치료 대상일 뿐)
  const GROUP_ICON = { relay: 'gate', keys: 'key', window: 'window', programs: 'box', wiring: 'coin', resume: 'chat', network: 'globe', resources: 'pc', update: 'refresh', doctor: 'pulse' };
  const REC_CAP = 40; // 안쪽이 주는 기록의 상한 — 이만큼이면 "40+"
  let avail = false, broken = false, wired = false, isOpen = false, view = 'report'; // view: report(결론) · all(살펴본 것 모두) · records(지난 기록)
  let check = { state: 'idle', data: null, why: '' }, link = null, records = null, opening = false, lastFocus = null, token = 0;

  const hm = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const md = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`; };
  const counts = (fs) => Object.fromEntries(ORDER.map((s) => [s, fs.filter((f) => f.state === s).length]));
  const problems = (fs) => fs.filter((f) => f.state === 'bad' || f.state === 'warn' || f.state === 'unknown').sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
  /** 항목의 말: Doctor 가 준 쉬운 말이 먼저, 없으면 원래 글 */
  const sayOf = (f) => f.say || f.title || '';
  const moreOf = (f) => (f.say ? f.more || '' : f.summary || '');

  // ---- 계정 뱃지 ----
  /** → [상태 글, 뱃지 모양]. 모양: ok(연결됨) · add(연결하기) · warn(다시 연결 · 확인 필요) · off(확인 못 함) */
  function accountWord(a) {
    switch (a?.state) {
      case 'ready': return ['연결됨', 'ok'];
      case 'none': return ['연결하기', 'add'];
      case 'expired': return ['다시 연결', 'warn'];
      case 'failed': case 'card': case 'unreadable': return ['확인 필요', 'warn'];
      default: return ['확인 못 함', 'off'];
    }
  }
  const BADGE_ICON = { ok: 'check', add: 'plus', warn: 'alert', off: 'help' };
  const linkKnown = () => link?.state === 'ok' && link.claude && link.codex && typeof link.claude.state === 'string' && typeof link.codex.state === 'string';
  const readyCount = () => (linkKnown() ? ['claude', 'codex'].filter((k) => link[k].state === 'ready').length : 0);

  // ---- 그리기 ----
  function renderHead() {
    const c = check;
    $('#dr-when').textContent = view === 'report' && c.state === 'done' && c.data.at ? `살펴봄 ${hm(c.data.at)}` : '';
    $('#dr-again').hidden = view !== 'report' || c.state === 'running';
  }
  function renderHero() {
    const hero = $('#dr-hero'), seal = $('#dr-seal'), big = $('#dr-big'), sub = $('#dr-sub');
    hero.hidden = view !== 'report'; if (hero.hidden) return;
    const set = (lv, ic, title, text) => { seal.className = `dr-seal ${lv}`; setIcon(seal, ic, 31); big.textContent = title; sub.textContent = text; };
    const c = check;
    if (c.state === 'running' || c.state === 'idle') return set('run', 'refresh', '살펴보는 중', '');
    if (c.state === 'failed') return set('warn', 'alert', c.why === 'timeout' ? '살펴보기가 끝나지 않았습니다' : '살펴보지 못했습니다', '「다시 살펴보기」를 누르거나, 바로 「치료하기」를 누를 수 있습니다.');
    const fs = c.data.findings, n = counts(fs), ps = problems(fs);
    const lead = (k) => `${sayOf(ps[0])}${k > 1 ? ` 외 ${k - 1}가지` : ''}`;
    if (n.bad) return set('bad', 'close', `고칠 것이 ${n.bad}가지 있습니다`, lead(n.bad));
    if (ps.length) return set('warn', 'alert', `확인할 것이 ${ps.length}가지 있습니다`, lead(ps.length));
    set('ok', 'check', '모두 정상입니다', `${fs.length - n.skipped}가지를 살펴봤습니다`);
  }
  function renderList() {
    const box = $('#dr-list'); box.textContent = '';
    if (view === 'records') return renderRecords(box);
    const c = check;
    if (view === 'all') return renderAll(box);
    if (c.state === 'running' || c.state === 'idle') { for (let i = 0; i < 2; i++) box.append(el('div', 'dr-skel')); return; }
    if (c.state !== 'done') return;
    // 확인할 것만 카드로(고장 → 확인 → 확인 못 함 차례)
    for (const f of problems(c.data.findings)) {
      const row = el('div', `dr-item ${f.state}`); const t = el('div'); const more = moreOf(f);
      t.append(el('b', '', sayOf(f))); if (more) t.append(el('small', '', more));
      const [word, cls] = PILL[f.state];
      row.append(icon(GROUP_ICON[f.group] || 'pulse', 17, 'dr-ib'), t, el('span', `dr-pill ${cls}`, word)); box.append(row);
    }
  }
  /** 살펴본 것 모두: 묶음마다 쉬운 이름 — 상태 한 문장 */
  function renderAll(box) {
    const c = check; const back = el('div', 'dr-back'); const b = el('button', 'dr-lnk', '← 돌아가기'); b.type = 'button'; b.dataset.back = '1';
    back.append(el('b', '', '살펴본 것'), el('span', 'dr-sp'), b); box.append(back);
    if (c.state !== 'done') { box.append(el('p', 'dr-empty', '아직 살펴본 결과가 없습니다.')); return; }
    for (const g of c.data.groups) {
      const fs = c.data.findings.filter((f) => f.group === g.id); if (!fs.length) continue;
      const sec = el('section', 'dr-grp'); const head = el('div', 'dr-gh'); head.append(icon(GROUP_ICON[g.id] || 'pulse', 15, 'dr-ib'), el('span', '', g.title)); sec.append(head);
      for (const f of fs.slice().sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state))) {
        const row = el('div', `dr-row ${f.state}`);
        if (f.say && f.title) row.title = `${f.title} — ${f.summary || ''}`; // 쉬운 말 뒤의 원래 글(정밀한 글)은 올렸을 때 풍선으로
        row.append(el('i', `dr-dot ${f.state}`), el('b', '', f.name || f.title), el('span', '', f.say || f.summary)); sec.append(row);
      }
      box.append(sec);
    }
  }
  const REC_WORD = {
    checkup: (r) => `살펴봄 — ${r.bad ? `고장 ${r.bad}` : r.warn ? `확인 ${r.warn}` : r.unknown ? `확인 못 함 ${r.unknown}` : '정상'}`, 'checkup-failed': () => '살펴보지 못함', open: () => 'Doctor 창 열림', close: () => 'Doctor 창 닫힘',
    link: (r) => `${NAME[r.service] || '계정'} 연결 ${r.ok ? '성공' : '실패'}`, probe: (r) => `${NAME[r.service] || '계정'} 연결 확인 ${r.ok ? '성공' : '실패'}`,
    'treat-start': () => '치료 시작', 'treat-end': (r) => `치료 끝 — ${({ resolved: '해결', improved: '나아짐', unresolved: '미해결', interrupted: '끊김' })[r.outcome] || '끝'}`,
  };
  function renderRecords(box) {
    const back = el('div', 'dr-back'); const b = el('button', 'dr-lnk', '← 돌아가기'); b.type = 'button'; b.dataset.back = '1';
    back.append(el('b', '', '지난 기록'), el('span', 'dr-when', '이 PC 에만 저장됩니다'), el('span', 'dr-sp'), b); box.append(back);
    if (!records) { for (let i = 0; i < 3; i++) box.append(el('div', 'dr-skel')); return; }
    if (!records.ok) { box.append(el('p', 'dr-empty', '기록을 읽지 못했습니다.')); return; }
    if (!records.items.length) { box.append(el('p', 'dr-empty', '아직 기록이 없습니다.')); return; }
    for (const r of records.items) {
      const lv = r.kind === 'checkup' ? (r.bad ? 'bad' : r.warn ? 'warn' : r.unknown ? 'unknown' : 'ok') : r.ok === false || r.kind === 'checkup-failed' ? 'warn' : r.kind === 'treat-end' ? (r.outcome === 'resolved' ? 'ok' : 'warn') : 'off';
      const row = el('div', 'dr-rec'); row.append(el('i', `dr-dot ${lv}`), el('span', 'dr-rt', `${md(r.at)} ${hm(r.at)}`), el('span', '', (REC_WORD[r.kind] || (() => r.kind))(r))); box.append(row);
    }
  }
  /** "나머지 N가지는 정상입니다 · 모두 보기" 한 줄(모두 정상이면 「살펴본 것 보기」만) */
  function renderRest() {
    const box = $('#dr-rest'); box.textContent = ''; box.className = 'dr-rest';
    const c = check; box.hidden = view !== 'report' || c.state !== 'done'; if (box.hidden) return;
    const n = counts(c.data.findings), ps = problems(c.data.findings);
    const all = el('button', 'dr-lnk', ps.length ? '모두 보기' : '살펴본 것 보기'); all.type = 'button'; all.dataset.all = '1';
    if (!ps.length) { box.classList.add('mid'); box.append(all); return; }
    if (n.ok) { const dots = el('span', 'dr-dots'); for (let i = 0; i < Math.min(8, n.ok); i++) dots.append(el('i')); box.append(dots, el('span', '', `나머지 ${n.ok}가지는 정상입니다`)); }
    box.append(el('span', 'dr-sp'), all);
  }
  function renderAct() {
    $('#dr-act').hidden = view !== 'report';
    const c = check, n = c.state === 'done' ? counts(c.data.findings) : null, cta = $('#dr-open');
    const quiet = !!n && !n.bad && !n.warn && !n.unknown; // 모두 정상이면 치료 단추를 내세우지 않는다
    cta.textContent = opening ? '여는 중' : quiet ? '그래도 이상하면 Doctor 열기' : '치료하기'; cta.disabled = opening; cta.classList.toggle('ghost', quiet);
    $('#dr-cta-note').textContent = quiet ? '' : linkKnown() && !readyCount() ? '원인을 찾아 고치려면 아래 뱃지로 계정을 연결해 주세요 · 정해진 처방은 계정 없이도 됩니다' : 'Doctor가 원인을 찾아 고칩니다 · 시작하기 전에 한 번 묻습니다';
  }
  /** 바닥: 왼쪽 = Doctor 계정 뱃지 둘(누르면 Doctor 창에서 연결 · 바꾸기) · 오른쪽 = 지난 기록 뱃지(건수) */
  function renderFoot() {
    const box = $('#dr-accounts'); box.textContent = '';
    for (const kind of ['claude', 'codex']) {
      const [w, lv] = linkKnown() ? accountWord(link[kind]) : [link ? '확인 못 함' : '…', 'off'];
      const b = el('button', `dr-bdg dr-acc ${lv}`); b.type = 'button'; b.dataset.acc = kind; if (opening) b.setAttribute('aria-busy', 'true'); // 여는 동안에도 끄지 않는다(초점을 잃지 않게 — 겹친 누름은 openOutside 가 막는다)
      b.title = lv === 'ok' ? '누르면 Doctor 창에서 바꿀 수 있습니다' : 'IRIS 가 먹통일 때도 Doctor 가 움직이도록 계정을 연결해 둡니다';
      b.append(icon(BADGE_ICON[lv], 14));
      if (lv === 'add') b.append(`${NAME[kind]} 연결하기`); else b.append(`${NAME[kind]} `, el('span', 'dr-as', w));
      box.append(b);
    }
    $('#dr-rec-t').textContent = view === 'records' ? '살펴본 결과' : '지난 기록';
    const n = $('#dr-rec-n'), k = records?.ok ? records.items.length : 0;
    n.hidden = view === 'records' || !k; n.textContent = k >= REC_CAP ? `${REC_CAP}+` : String(k);
    // 살펴보기는 됐지만 그 결과를 기록하지 못했으면 그렇다고 알린다(살펴보기 · 치료 단추는 그대로 쓴다)
    $('#dr-rec-warn').hidden = !(view === 'report' && check.state === 'done' && check.data.recorded === false);
  }
  /** 다시 그리면 뱃지 · 「모두 보기」 · 「돌아가기」 단추가 새로 만들어진다 — 키보드 초점이 그 위에 있었으면 같은 단추로 되돌린다 */
  const focusKey = () => { const a = document.activeElement; if (!a || a === document.body || !$('#dr-modal').contains(a)) return null; return a.dataset.acc ? `button[data-acc="${a.dataset.acc === 'codex' ? 'codex' : 'claude'}"]` : a.dataset.back ? 'button[data-back]' : a.dataset.all ? 'button[data-all]' : a.id ? `#${a.id}` : null; };
  function render() {
    if (!isOpen) return;
    const keep = focusKey();
    renderHead(); renderHero(); renderList(); renderRest(); renderAct(); renderFoot();
    if (keep) { const n = $('#dr-modal').querySelector(keep); if (n && n !== document.activeElement && !n.disabled && n.offsetParent !== null) n.focus(); }
  }
  /** 작업목록 단추의 꼬리표: 마지막으로 살펴봤을 때 고장이 나왔거나, Doctor 계정이 하나도 준비되지 않았을 때만 */
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
    const mine = ++token; check = { state: 'running', data: null, why: '' }; if (view === 'all') view = 'report'; render();
    let r = null;
    try { const res = await fetch(`/api/doctor/checkup${fresh ? '?fresh=1' : ''}`, { method: 'POST' }); r = await res.json().catch(() => null); } catch {}
    if (mine !== token) return;
    if (r?.ok && Array.isArray(r.findings) && Array.isArray(r.groups) && r.findings.length) check = { state: 'done', data: r, why: '' };
    else check = { state: 'failed', data: null, why: r?.why === 'timeout' ? 'timeout' : 'failed' };
    render(); renderRail();
    loadRecords(true); // 방금 살펴본 것이 기록에 더해졌다 — 건수를 맞춘다
  }
  async function loadLink(force) {
    try { const res = await fetch(force ? '/api/doctor?fresh=1' : '/api/doctor'); const j = res.ok ? await res.json() : null; link = j && typeof j.link === 'object' && j.link ? j.link : { state: 'unknown' }; broken = !!j?.broken; }
    catch { link = { state: 'unknown' }; }
    render(); renderRail();
  }
  /** quiet = 건수만 맞추려는 읽기(화면을 비우지 않는다) */
  let recToken = 0;
  async function loadRecords(quiet = false) {
    const mine = ++recToken; // 늦게 온 옛 답이 새 목록을 덮지 않게
    if (!quiet) { records = null; render(); }
    let next;
    try { const res = await fetch('/api/doctor/records'); const j = res.ok ? await res.json() : null; next = j && Array.isArray(j.items) ? { ok: j.ok !== false, items: j.items } : { ok: false, items: [] }; } catch { next = { ok: false, items: [] }; }
    if (mine !== recToken) return;
    records = next; render();
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
    opening = true; render();
    let r = null;
    try { const res = await fetch('/api/doctor/open', { method: 'POST' }); r = await res.json().catch(() => null); } catch {}
    opening = false; render();
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
    // 1분 안에 살펴본 것이 있으면 안쪽이 그 결과를 다시 준다(창을 여닫을 때마다 새로 돌지 않는다)
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
    for (const s of document.querySelectorAll('#dr-modal [data-dr-i]')) setIcon(s, s.dataset.drI, 14);
    $('#dr-close').addEventListener('click', close);
    $('#dr-modal').addEventListener('mousedown', (e) => { if (e.target === $('#dr-modal')) close(); });
    $('#dr-again').addEventListener('click', () => runCheckup(true));
    $('#dr-open').addEventListener('click', openOutside);
    $('#dr-accounts').addEventListener('click', (e) => { if (e.target.closest('button[data-acc]')) openOutside(); });
    $('#dr-rec').addEventListener('click', () => { view = view === 'records' ? 'report' : 'records'; if (view === 'records') loadRecords(); else render(); });
    $('#dr-rest').addEventListener('click', (e) => { if (e.target.closest('button[data-all]')) { view = 'all'; render(); $('#dr-list button[data-back]')?.focus(); } });
    $('#dr-list').addEventListener('click', (e) => { if (e.target.closest('button[data-back]')) { view = 'report'; render(); $('#dr-close')?.focus(); } });
    document.addEventListener('keydown', keys, true);
  }
  /** 화면이 뜰 때 한 번: IRIS Doctor 가 있는 PC 인지 보고 단추들을 살린다. 곳곳의 단추(data-doctor)는 눌리면 이 창을 연다. */
  async function init() {
    for (const s of document.querySelectorAll('[data-dr-icon]')) setIcon(s, 'pulse', 16);
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-doctor], #rail-doctor'); if (b && avail) { e.preventDefault(); show(); } });
    try { const h = await (await fetch('/api/health')).json(); avail = !!h?.features?.doctor?.available; broken = !!h?.features?.doctor?.broken; } catch {}
    document.documentElement.classList.toggle('has-doctor', avail); // 곳곳의 단추는 이 표시가 있을 때만 보인다(CSS)
    renderRail();
    if (avail) loadLink(false);
  }
  return { init, show, close, isOpen: () => isOpen, available: () => avail, _accountWord: accountWord };
})();
