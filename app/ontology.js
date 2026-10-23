// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 설정 → 「온톨로지」(v2.91 → v2.92, 설계 = docs\설계-온톨로지분신-2026-10-20.md): 위 `구조 | 관계` 전환.
   구조 = 역할(R)마다 「별빛의 분신」 캐릭터(app/persona.js, 명찰 = 역할) 격자 → 고르면 왼쪽으로 걸어가고 오른쪽에 영역(D) → 프로젝트(P) 트리.
   관계 = 나무 밖 관계(기준·맡김·형제·확장·승격)를 **한 장에 한 문장** 카드로 — 「A」 ──기준으로 따름──▶ 「B」 + "A는 B를 기준으로 따릅니다."
   (v2.91 의 원형 점·선 그래프는 "무슨 말인지 눈에 안 들어옴"(사용자, 2026-10-21)이라 v2.92 에서 문장 카드로 바꿨다.)
   자료 = 데몬 GET /api/ontology/graph(경로·종류만, 내용 없음) · 「다시 그리기」 POST /api/ontology/rebuild · 「폴더 열기」 POST /api/open-folder(영혼 안만). */
window.OntologyView = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KIND = { role: '역할(R)', domain: '영역(D)', project: '프로젝트(P)' };
  const LIFE = { active: '진행 중', dormant: '쉬는 중', paused: '멈춤', archived: '보관', done: '끝남', deprecated: '퇴역' };
  // 나무 밖 관계 5종(정본 = 루트 IRIS-온톨로지.md 관계 도장 표). 링크 방향 = from → to.
  // name = 짧은 이름, arrow = 화살표 위 말, help = 이 종류가 무슨 뜻인지 한 줄, say(A, B) = 카드 아래 한 문장.
  const REL = {
    canonical: { name: '기준', color: 'var(--iris)', arrow: '기준으로 따름', help: '왼쪽 폴더는 일하는 방법·표준을 오른쪽 폴더에서 가져와 따릅니다.', say: (a, b) => `${a}${jo(a, '은', '는')} ${b}${jo(b, '을', '를')} 기준으로 따릅니다.` },
    owner: { name: '맡김', color: 'var(--warn)', arrow: '내용은 여기에', help: '왼쪽 폴더에는 링크만 있고, 실제 내용은 오른쪽 폴더가 맡아 관리합니다.', say: (a, b) => `${a}의 실제 내용은 ${b}에 있습니다.` },
    sibling_group: { name: '형제', color: 'var(--ok)', arrow: '', help: '같은 분야를 세부 주제로 나눈 형제 폴더들입니다.', say: null },
    extends: { name: '확장', color: 'var(--iris-2)', arrow: '이어받아 넓힘', help: '왼쪽 폴더는 오른쪽 폴더를 바탕으로 한 가지를 더해 이어 갑니다.', say: (a, b) => `${a}${jo(a, '은', '는')} ${b}${jo(b, '을', '를')} 이어받아 넓힌 것입니다.` },
    promoted_to: { name: '승격', color: 'var(--bad)', arrow: '자라서 됨', help: '왼쪽 폴더(작은 씨앗)가 자라서 오른쪽 폴더가 되었습니다.', say: (a, b) => `${a}${jo(a, '이', '가')} 자라서 ${b}${jo(b, '이', '가')} 되었습니다.` },
  };
  /** 한국어 조사: 마지막 글자에 받침이 있으면 a, 없으면 b. 한글이 아니면 "a(b)". */
  function jo(word, a, b) {
    const s = String(word).replace(/[」』\s]+$/, '').replace(/\s*〖[^〗]*〗$/, '').replace(/\s*\([^)]*\)$/, ''); const c = s.charCodeAt(s.length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 ? a : b;
    return `${a}(${b})`;
  }
  let host = null, data = null, loaded = false, busy = false, mode = 'structure', q = '';
  let byId = new Map(), kids = new Map(), linksOf = new Map();
  let role = null, open = new Set(), selRow = null;   // 구조 화면 상태: 고른 역할 · 펼친 영역 · 고른 줄
  let relKind = 'all', relFocus = null;                // 관계 화면 상태: 종류 거르기 · 한 폴더만 보기

  /** 'R07-개발자(Developer)' → '개발자', 접두 태그·번호·영문 괄호 뺀 짧은 이름. */
  const short = (n, max = 16) => {
    let s = String(n.name || '').replace(/^〖[^〗]*〗/, '').replace(/^[RDPST]\d{2}(\.\d{2})?-/, '');
    s = s.replace(/\([^)]*\)/g, '').replace(/\s*〖[^〗]*〗/g, '').trim();
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  };
  const tagsOf = (n) => { const m = String(n.name || '').match(/〖[^〗]*〗/g) || []; return m.map(t => t.slice(1, -1)); };
  const codeOf = (n) => n.code || (String(n.name || '').replace(/^〖[^〗]*〗/, '').match(/^[RDPST]\d{2}(\.\d{2})?/) || [''])[0];
  const lifeTag = (n) => n.lifecycle && n.lifecycle !== 'active' ? `<span class="ot-life">${esc(LIFE[n.lifecycle] || n.lifecycle)}</span>` : '';
  const countUnder = (id, type) => { let c = 0; const walk = (x) => { for (const k of kids.get(x) || []) { if (k.type === type) c++; walk(k.id); } }; walk(id); return c; };
  /** 관계 카드에 쓰는 이름 = 짧은 이름 + 끝 태그(같은 이름이 여럿인 「인지–행동 시스템 〖화재〗」 같은 경우 구별). */
  const label = (n) => { const t = String(n.name || '').match(/\s〖([^〗]*)〗\s*$/); return `${short(n, 22)}${t ? ` 〖${t[1]}〗` : ''}`; };
  /** 위치 = 조상들의 짧은 이름(역할 › 영역). */
  const crumbs = (n) => { const out = []; for (let p = n.parent && byId.get(n.parent); p; p = p.parent && byId.get(p.parent)) out.unshift(short(p, 12)); return out.join(' › '); };

  function index() {
    byId = new Map(data.nodes.map(n => [n.id, n])); kids = new Map(); linksOf = new Map();
    for (const n of data.nodes) if (n.parent && byId.has(n.parent)) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); }
    for (const l of kids.values()) l.sort((a, b) => a.path.localeCompare(b.path, 'ko'));
    for (const l of data.links) for (const id of [l.from, l.to]) { if (!linksOf.has(id)) linksOf.set(id, []); linksOf.get(id).push(l); }
  }
  const roles = () => data.nodes.filter(n => n.type === 'role' || (!n.parent && n.type !== 'role')).sort((a, b) => a.path.localeCompare(b.path, 'ko'));

  // ---------- 구조: 캐릭터 격자 ----------
  // v2.95: 캐릭터 = 같은 사람의 8가지 모습(app/persona.js) — 역할 순서대로 1·2·3… 번 모습, 성별은 튜토리얼과 공용(state\tutorial.json)
  function figHtml(n, i) {
    const d = countUnder(n.id, 'domain'), p = countUnder(n.id, 'project');
    return `<button class="ps-fig${n.lifecycle && n.lifecycle !== 'active' ? ' dim' : ''}" type="button" data-role="${esc(n.id)}" title="${esc(n.name)}">${Persona.pic(short(n, 10), { index: i, sub: `영역 ${d} · 프로젝트 ${p}`, label: `${short(n)} — 영역 ${d}, 프로젝트 ${p}` })}<span class="ps-tag">${esc(codeOf(n))}${n.lifecycle && n.lifecycle !== 'active' ? ` · ${esc(LIFE[n.lifecycle] || n.lifecycle)}` : ''}</span></button>`;
  }
  const genderSw = () => `<span class="on-gsw">모습 ${[['m', '남성'], ['f', '여성']].map(([k, t]) => `<button type="button" class="text-btn${(Persona.gender() || 'm') === k ? ' accent' : ' outline'}" data-gender="${k}" aria-pressed="${(Persona.gender() || 'm') === k}">${t}</button>`).join('')}</span>`;
  function gridHtml() {
    const list = roles();
    if (!list.length) return `<div class="ot-none">${Persona.pic('', { empty: true, placeholder: '나의 첫 역할' })}<p>아직 역할 폴더가 없습니다 — 설정 → 업데이트·정보 → 「튜토리얼 다시 보기」의 「내 폴더 만들기」로 첫 역할을 만들어 보세요.</p></div>`;
    return `<div class="ps-pick ot-grid" id="ot-grid">${list.map(figHtml).join('')}</div><p class="on-help">같은 사람의 여러 모습 — 가슴의 명찰이 역할입니다. 누르면 그 역할 아래 영역·프로젝트가 나무로 펼쳐집니다. ${genderSw()}</p>`;
  }
  // ---------- 구조: 고른 역할의 트리 ----------
  const ICON_OPEN = () => Icons.svg('folder', 13);
  const ring = (n) => linksOf.has(n.id) ? `<button class="ot-ring" type="button" data-ring="${esc(n.id)}" title="다른 폴더와의 관계 ${linksOf.get(n.id).length}개 — 관계 화면에서 보기" aria-label="관계 ${linksOf.get(n.id).length}개 보기"></button>` : '';
  function rowHtml(n, depth) {
    const list = kids.get(n.id) || [], isOpen = open.has(n.id), canFold = list.length > 0;
    const tags = tagsOf(n).map(t => `<span class="ot-tag">${esc(t)}</span>`).join('');
    const head = `<div class="ot-row t-${n.type}${n.lifecycle && n.lifecycle !== 'active' ? ' dim' : ''}${selRow === n.id ? ' sel' : ''}" data-row="${esc(n.id)}" style="--d:${depth}" title="${esc(n.path)}" role="treeitem" tabindex="0"${canFold ? ` aria-expanded="${isOpen}"` : ''}>`
      + `<span class="ot-caret${canFold ? (isOpen ? ' open' : '') : ' none'}" aria-hidden="true"></span><span class="ot-code">${esc(codeOf(n))}</span><span class="ot-name">${esc(short(n, 40))}</span>${tags}${lifeTag(n)}${ring(n)}`
      + `${canFold ? `<span class="ot-count">${n.type === 'domain' ? `프로젝트 ${countUnder(n.id, 'project')}` : `${list.length}`}</span>` : ''}<button class="ot-open" type="button" data-open="${esc(n.id)}" title="폴더 열기" aria-label="${esc(short(n))} 폴더 열기">${ICON_OPEN()}</button></div>`;
    return head + (canFold && isOpen ? `<div role="group">${list.map(k => rowHtml(k, depth + 1)).join('')}</div>` : '');
  }
  function treeHtml() {
    const r = byId.get(role); if (!r) return '';
    const list = kids.get(r.id) || [];
    return `<div class="ot-stage"><div class="ot-side"><button class="text-btn outline ot-back" type="button" data-on="back" title="Esc">← 모든 역할</button>
        <div class="ps-fig chosen ot-me" id="ot-me">${Persona.pic(short(r, 10), { index: Math.max(0, roles().findIndex(x => x.id === r.id)), sub: `영역 ${countUnder(r.id, 'domain')} · 프로젝트 ${countUnder(r.id, 'project')}` })}</div></div>
      <div class="ot-main"><div class="ot-head"><div><div class="on-i-kind">${KIND.role}${r.lifecycle && r.lifecycle !== 'active' ? ` · ${esc(LIFE[r.lifecycle] || r.lifecycle)}` : ''}</div><div class="ot-title">${esc(r.name)}</div></div>
        <div class="ot-head-act">${ring(r)}<button class="text-btn accent" type="button" data-open="${esc(r.id)}">${ICON_OPEN()}폴더 열기</button></div></div>
        <div class="ot-tree" id="ot-tree" role="tree" aria-label="${esc(short(r))} 아래 폴더">${list.length ? list.map(k => rowHtml(k, 0)).join('') : '<div class="on-empty">아직 이 역할 아래 영역이 없습니다.</div>'}</div></div></div>`;
  }
  function pickRole(id, { from = null, focus = null } = {}) {
    role = id; selRow = focus; open = new Set();
    const list = kids.get(id) || [];
    if (list.length <= 3) list.forEach(k => open.add(k.id));     // 영역이 3개 이하면 펼쳐서 시작(많으면 접어서)
    if (focus) for (let p = byId.get(focus)?.parent; p && p !== id; p = byId.get(p)?.parent) open.add(p);
    paintStructure();
    const me = $('#ot-me', host); if (from && me) Persona.walkFrom(me, from); else me?.classList.add('ps-turned');
    if (focus) { const row = host.querySelector(`.ot-row[data-row="${CSS.escape(focus)}"]`); if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1600); } }
  }
  function paintStructure() {
    const body = $('#on-body', host); if (!body) return;
    body.className = 'on-body ot-body';
    body.innerHTML = role && byId.has(role) ? treeHtml() : gridHtml();
    Persona.watch(body); Persona.fit(body);
  }
  function paintTree() {
    const t = $('#ot-tree', host); if (!t) return; const sc = t.scrollTop, hadFocus = t.contains(document.activeElement);
    t.innerHTML = (kids.get(role) || []).map(k => rowHtml(k, 0)).join(''); t.scrollTop = sc;
    if (hadFocus && selRow) t.querySelector(`.ot-row[data-row="${CSS.escape(selRow)}"]`)?.focus({ preventScroll: true });
  }

  // ---------- 관계: 문장 카드 ----------
  /** 형제 링크는 서로 이어진 것끼리 한 묶음으로(같은 쌍이 양쪽 방향으로 적혀 있다). */
  function siblingGroups(links) {
    const up = new Map(); const find = (x) => { while (up.get(x) !== x) { up.set(x, up.get(up.get(x))); x = up.get(x); } return x; };
    for (const l of links) for (const id of [l.from, l.to]) if (!up.has(id)) up.set(id, id);
    for (const l of links) up.set(find(l.from), find(l.to));
    const g = new Map(); for (const id of up.keys()) { const r = find(id); if (!g.has(r)) g.set(r, []); g.get(r).push(byId.get(id)); }
    return [...g.values()].map(ns => ns.filter(Boolean).sort((a, b) => a.path.localeCompare(b.path, 'ko'))).filter(ns => ns.length > 1);
  }
  /** 지금 거르기(종류·한 폴더·검색)에 맞는 카드 목록 = [{kind, nodes:[a,b] | [..형제], link}] */
  function relCards() {
    const words = q.trim().toLowerCase();
    const hit = (ns) => (!relFocus || ns.some(n => n.id === relFocus)) && (!words || ns.some(n => n.path.toLowerCase().includes(words)));
    const out = [];
    for (const k of Object.keys(REL)) {
      const ls = data.links.filter(l => l.rel === k && byId.has(l.from) && byId.has(l.to));
      if (k === 'sibling_group') { for (const ns of siblingGroups(ls)) if (hit(ns)) out.push({ kind: k, nodes: ns }); continue; }
      for (const l of ls) { const ns = [byId.get(l.from), byId.get(l.to)]; if (hit(ns)) out.push({ kind: k, nodes: ns }); }
    }
    return out;
  }
  const chipHtml = (n) => `<button class="rl-f${n.id === relFocus ? ' me' : ''}${n.lifecycle && n.lifecycle !== 'active' ? ' dim' : ''}" type="button" data-go="${esc(n.id)}" title="${esc(n.path)}\n누르면 구조 화면의 그 줄로"><span class="rl-k">${esc(codeOf(n))}</span><span class="rl-n">${esc(label(n))}</span><span class="rl-p">${esc(crumbs(n))}</span></button>`;
  function cardHtml(c) {
    const s = REL[c.kind];
    if (c.kind === 'sibling_group') return `<div class="rl-card" style="--rc:${s.color}"><div class="rl-sib">${c.nodes.map(chipHtml).join('')}</div><p class="rl-say">같은 분야를 나눈 형제 폴더 ${c.nodes.length}개입니다.</p></div>`;
    const [a, b] = c.nodes;
    return `<div class="rl-card" style="--rc:${s.color}"><div class="rl-row">${chipHtml(a)}<span class="rl-arrow" aria-hidden="true"><i>${esc(s.arrow)}</i></span>${chipHtml(b)}</div>`
      + `<p class="rl-say">${esc(s.say(`「${label(a)}」`, `「${label(b)}」`))}</p></div>`;
  }
  function relHtml() {
    if (!data.links.length) return '<div class="on-empty">폴더 사이의 관계(기준·맡김·형제·확장·승격)가 아직 없습니다. 폴더 머리말에 관계를 적으면 여기 나타납니다.</div>';
    const all = relCards(), kinds = Object.keys(REL).filter(k => data.links.some(l => l.rel === k));
    const tabs = `<div class="rl-tabs" role="group" aria-label="관계 종류"><button type="button" data-kind="all" aria-pressed="${relKind === 'all'}">모두 <b>${all.length}</b></button>${kinds.map(k => `<button type="button" data-kind="${k}" aria-pressed="${relKind === k}" style="--rc:${REL[k].color}"><i></i>${REL[k].name} <b>${all.filter(c => c.kind === k).length}</b></button>`).join('')}</div>`;
    const focusBar = relFocus && byId.has(relFocus) ? `<div class="rl-focus">「${esc(label(byId.get(relFocus)))}」의 관계만 보는 중 <button class="ot-link" type="button" data-on="rel-all">모두 보기</button></div>` : '';
    const groups = (relKind === 'all' ? kinds : [relKind]).map(k => {
      const cs = all.filter(c => c.kind === k); if (!cs.length) return '';
      return `<section class="rl-grp" style="--rc:${REL[k].color}"><h4><i></i>${REL[k].name} <small>${cs.length}</small></h4><p class="rl-help">${esc(REL[k].help)}</p>${cs.map(cardHtml).join('')}</section>`;
    }).join('');
    return `${tabs}${focusBar}<div class="rl-list">${groups || '<div class="on-empty">맞는 관계가 없습니다.</div>'}</div>`;
  }
  function paintRelation() {
    const body = $('#on-body', host); if (!body) return;
    const sc = body.querySelector('.rl-list')?.scrollTop || 0;
    body.className = 'on-body rl-body'; body.innerHTML = relHtml();
    const list = body.querySelector('.rl-list'); if (list) list.scrollTop = sc;
    const cnt = $('#on-hits', host); if (cnt) cnt.textContent = q.trim() ? `${relCards().length}장` : '';
  }

  // ---------- 공통 ----------
  const roleOf = (id) => { let n = byId.get(id); while (n && n.parent && byId.has(n.parent)) n = byId.get(n.parent); return n; };
  function setMode(m, { focus = null } = {}) {
    mode = m;
    host.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    $('#on-q', host).placeholder = m === 'relation' ? '폴더 이름으로 관계 거르기' : '폴더 이름 찾기 (Enter = 그 자리로)';
    hideResults();
    if (!data?.ok || !data.nodes.length) return render();
    if (m === 'relation') { relFocus = focus; if (focus) relKind = 'all'; paintRelation(); }
    else if (focus) { const r = roleOf(focus); pickRole(r.id, { focus: focus === r.id ? null : focus }); }
    else paintStructure();
    search();
  }
  function render() {
    if (!host) return;
    const body = $('#on-body', host), info = $('#on-sum', host);
    if (!data) { body.className = 'on-body'; body.innerHTML = '<div class="on-empty">불러오는 중…</div>'; return; }
    if (!data.ok) {
      info.textContent = ''; body.className = 'on-body';
      body.innerHTML = `<div class="on-empty">${data.reason === 'missing' ? '아직 그래프 파일이 없습니다 — 폴더를 만든 뒤 「다시 그리기」를 누르면 만들어집니다.' : '그래프 파일을 읽지 못했습니다 — 「다시 그리기」를 눌러 보세요.'}</div>`;
      return;
    }
    const c = data.counts;
    info.innerHTML = `<b>${c.role}</b> 역할 · <b>${c.domain}</b> 영역 · <b>${c.project}</b> 프로젝트 · 관계 <b>${c.links}</b>${data.generated ? ` <span class="on-dim">· ${esc(String(data.generated).slice(0, 16).replace('T', ' '))} 기준</span>` : ''}`;
    index();
    if (role && !byId.has(role)) role = null;
    if (relFocus && !byId.has(relFocus)) relFocus = null;
    if (mode === 'relation' && data.nodes.length) paintRelation(); else paintStructure();
  }

  // 검색: 구조 화면 = 일치 목록(최대 30줄) → 누르거나 Enter = 그 자리로 · 관계 화면 = 카드 거르기
  function hideResults() { const r = $('#on-res', host); if (r) { r.hidden = true; r.innerHTML = ''; } }
  function search() {
    const words = q.trim().toLowerCase();
    if (mode === 'relation') { hideResults(); if (data?.ok) paintRelation(); return; }
    const box = $('#on-res', host), cnt = $('#on-hits', host);
    if (!words || !data?.ok) { hideResults(); if (cnt) cnt.textContent = ''; return; }
    const hits = data.nodes.filter(n => n.path.toLowerCase().includes(words));
    cnt.textContent = `${hits.length}개`;
    box.hidden = false;
    box.innerHTML = hits.length ? hits.slice(0, 30).map((n, i) => { const parts = n.path.split('\\'); return `<button class="on-r${i === 0 ? ' cur' : ''}" type="button" data-go="${esc(n.id)}"><span class="on-r-k">${esc(codeOf(n) || n.type[0].toUpperCase())}</span><span class="on-r-n">${esc(short(n, 40))}</span><span class="on-r-p">${esc(parts.slice(0, -1).map(s => short({ name: s }, 12)).join(' › '))}</span></button>`; }).join('') + (hits.length > 30 ? `<div class="on-r-more">… ${hits.length - 30}개 더 — 더 자세히 적어 보세요</div>` : '') : '<div class="on-r-more">찾는 이름이 없습니다</div>';
  }
  function goTo(id) {
    const n = byId.get(id); if (!n) return; hideResults();
    if (mode !== 'structure') return setMode('structure', { focus: id });
    const r = roleOf(id); pickRole(r.id, { focus: id === r.id ? null : id });
  }

  async function load(force = false) {
    if (busy) return; if (loaded && !force) { render(); return; }
    busy = true; data = null; render();
    try { data = await (await fetch('/api/ontology/graph')).json(); } catch { data = { ok: false, reason: 'unreadable' }; }
    try { await Persona.ready; } catch {} // 그림의 명찰 자리·성별을 먼저 안다
    loaded = true; busy = false; render();
  }
  async function rebuild() {
    const btn = $('#on-rebuild', host), st = $('#on-status', host); if (busy) return;
    busy = true; btn.disabled = true; st.textContent = '폴더를 다시 읽어 그래프를 만드는 중…';
    try {
      const r = await fetch('/api/ontology/rebuild', { method: 'POST' }); const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      const o = j.ontology || {}; data = j.graph || data;
      const bad = (o.steps || []).find(s => s.code !== 0);
      st.textContent = o.ok ? '다시 그렸습니다.' : o.ran === false ? '이 IRIS 폴더에는 그래프 도구(_ontology)가 없어 다시 만들지 못했습니다 — 지금 있는 그래프를 보여 줍니다.' : `다시 만들지 못했습니다${bad ? ` — ${bad.args} 단계 실패(코드 ${bad.code})` : ''}`;
    } catch (e) { st.textContent = `다시 그리기 실패 — ${e.message}`; }
    busy = false; btn.disabled = false; loaded = true; render();
  }
  async function openFolder(id) {
    const n = byId.get(id); if (!n) return;
    try { const r = await fetch('/api/open-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel: n.path }) }); if (!r.ok) Dialog.alert(`폴더를 열지 못했습니다: ${(await r.json().catch(() => ({}))).error || r.status}`); }
    catch (err) { Dialog.alert(`폴더를 열지 못했습니다: ${err.message}`); }
  }
  /** Esc 한 번 = 한 단계 뒤로(검색 지우기 → 관계 화면의 한 폴더 보기 풀기 → 고른 역할에서 격자로). main.js onEscape 가 서랍을 닫기 전에 부른다.
      처리했으면 true. 페이지 keydown 과 Electron 중계가 같은 Esc 로 두 번 부를 수 있어 300ms 안의 두 번째는 처리한 것으로만 답한다. */
  let lastBack = 0;
  function back() {
    if (!host || !host.offsetParent) return false; // 서랍이 닫혔거나 다른 묶음
    if (Date.now() - lastBack < 300) return true;
    const input = $('#on-q', host);
    let did = true;
    if (q) { q = ''; input.value = ''; search(); }
    else if (!$('#on-res', host)?.hidden) hideResults();
    else if (mode === 'relation' && relFocus) { relFocus = null; paintRelation(); }
    else if (mode === 'structure' && role) {
      const was = role; role = null; selRow = null; paintStructure();
      host.querySelector(`.ps-fig[data-role="${CSS.escape(was)}"]`)?.focus();
    } else did = false;
    if (did) lastBack = Date.now();
    return did;
  }

  function bind() {
    host.addEventListener('click', (e) => {
      const t = e.target;
      const m = t.closest('[data-mode]'); if (m) return setMode(m.dataset.mode);
      const op = t.closest('[data-open]'); if (op) { e.stopPropagation(); return openFolder(op.dataset.open); }
      const rg = t.closest('[data-ring]'); if (rg) { e.stopPropagation(); return setMode('relation', { focus: rg.dataset.ring }); }
      const go = t.closest('[data-go]'); if (go) return goTo(go.dataset.go);
      const kd = t.closest('[data-kind]'); if (kd) { relKind = kd.dataset.kind; return paintRelation(); }
      const b = t.closest('[data-on]')?.dataset.on;
      if (b === 'back') return back();
      if (b === 'rel-all') { relFocus = null; return paintRelation(); }
      if (t.closest('#on-rebuild')) return rebuild();
      const gs = t.closest('[data-gender]'); if (gs) { Persona.setGender(gs.dataset.gender).then(() => paintStructure()); return; }
      const fig = t.closest('.ps-fig[data-role]');
      if (fig) {
        const grid = $('#ot-grid', host), from = fig.getBoundingClientRect();
        fig.classList.add('chosen'); grid?.classList.add('picking');
        setTimeout(() => pickRole(fig.dataset.role, { from }), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
        return;
      }
      const row = t.closest('.ot-row');
      if (row) {
        const id = row.dataset.row, has = (kids.get(id) || []).length;
        if (has) { open.has(id) ? open.delete(id) : open.add(id); } selRow = id;
        return paintTree();
      }
    });
    const input = $('#on-q', host);
    input.addEventListener('input', () => { q = input.value; search(); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 숫자·Esc 가 확인 카드·작업 중단으로 새지 않게
      if (e.key === 'Enter' && mode === 'structure') { const w = q.trim().toLowerCase(); const n = w && data?.nodes?.find(x => x.path.toLowerCase().includes(w)); if (n) goTo(n.id); }
      if (e.key === 'Escape') { e.preventDefault(); back(); } // 입력칸의 키는 문서로 안 올라가므로 여기서 직접(중계 Esc 는 back() 의 300ms 가드가 막음)
    });
    // 트리 안 키보드: 위·아래 = 줄 이동, Enter·Space = 펼치기/고르기(Esc 는 문서 → main.js onEscape → back())
    host.addEventListener('keydown', (e) => {
      const row = e.target.closest?.('.ot-row'); if (!row) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); row.click(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        const rows = [...host.querySelectorAll('.ot-row')], i = rows.indexOf(row);
        rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
      }
    });
  }

  /** 설정 서랍이 「온톨로지」 묶음을 보일 때 부른다(처음 한 번만 읽음). */
  function show() {
    if (!host) {
      host = $('#st-onto'); if (!host) return;
      host.innerHTML = `<div class="on-bar"><div class="on-seg" role="group" aria-label="보기"><button type="button" data-mode="structure" aria-pressed="true">구조</button><button type="button" data-mode="relation" aria-pressed="false">관계</button></div>
        <label class="on-search">${Icons.svg('search', 14)}<input id="on-q" type="search" placeholder="폴더 이름 찾기 (Enter = 그 자리로)" spellcheck="false" autocomplete="off"><span id="on-hits" class="on-dim"></span></label>
        <button id="on-rebuild" class="text-btn outline" type="button" title="폴더를 다시 읽어 그래프를 새로 만듭니다">다시 그리기</button>
        <div class="on-res" id="on-res" hidden></div></div>
        <div class="on-sum"><span id="on-sum"></span><span id="on-status" class="on-dim"></span></div>
        <div id="on-body" class="on-body"></div>`;
      bind();
      window.addEventListener('iris:persona-gender', () => { if (loaded && data?.ok && mode === 'structure') paintStructure(); }); // 튜토리얼에서 바꿔도 같은 그림
    }
    load();
  }
  return { show, back, reload: () => load(true), _short: short, _jo: jo };
})();
