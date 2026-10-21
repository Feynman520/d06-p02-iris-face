// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 설정 → 「온톨로지」(v2.91, 설계 = docs\설계-온톨로지분신-2026-10-20.md): 위 `구조 | 관계` 전환.
   구조 = 역할(R)마다 「별빛의 분신」 캐릭터(app/persona.js, 명찰 = 역할) 격자 → 고르면 왼쪽으로 걸어가고 오른쪽에 영역(D) → 프로젝트(P) 트리.
   관계 = 나무 밖 관계(정본·확장·주인·형제 묶음·승격)에 걸린 폴더만 원 위의 점으로, 관계 종류는 선 색·모양 + 범례(끌기·휠 확대).
   자료 = 데몬 GET /api/ontology/graph(경로·종류만, 내용 없음) · 「다시 그리기」 POST /api/ontology/rebuild · 「폴더 열기」 POST /api/open-folder(영혼 안만). */
window.OntologyView = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KIND = { role: '역할(R)', domain: '영역(D)', project: '프로젝트(P)' };
  const LIFE = { active: '진행 중', dormant: '쉬는 중', paused: '멈춤', archived: '보관', done: '끝남', deprecated: '퇴역' };
  // 나무 밖 관계 5종 — 색은 테마 변수, 모양은 선 무늬(색만으로 구별하지 않게)
  const REL = {
    canonical: { ko: '정본', desc: '이 폴더의 기준 문서가 저기 있음', color: 'var(--iris)', dash: '' },
    extends: { ko: '확장', desc: '저 폴더를 이어받아 넓힘', color: 'var(--ok)', dash: '8 4' },
    owner: { ko: '주인', desc: '저 폴더가 이것을 맡음', color: 'var(--warn)', dash: '2 3' },
    sibling_group: { ko: '형제 묶음', desc: '같은 묶음의 형제', color: 'var(--ink-3)', dash: '', thin: true },
    promoted_to: { ko: '승격', desc: '저 폴더로 올라감', color: 'var(--iris-2)', dash: '', arrow: true },
  };
  const RING = 300; // 관계 화면 원 반지름(그래프 좌표)
  let host = null, data = null, loaded = false, busy = false, mode = 'structure', q = '';
  let byId = new Map(), kids = new Map(), linksOf = new Map();
  let role = null, open = new Set(), selRow = null;            // 구조 화면 상태: 고른 역할 · 펼친 영역 · 고른 줄
  let view = { x: 0, y: 0, k: 1 }, sel = null, drag = null;   // 관계 화면 상태

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

  function index() {
    byId = new Map(data.nodes.map(n => [n.id, n])); kids = new Map(); linksOf = new Map();
    for (const n of data.nodes) if (n.parent && byId.has(n.parent)) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); }
    for (const l of kids.values()) l.sort((a, b) => a.path.localeCompare(b.path, 'ko'));
    for (const l of data.links) for (const id of [l.from, l.to]) { if (!linksOf.has(id)) linksOf.set(id, []); linksOf.get(id).push(l); }
  }
  const roles = () => data.nodes.filter(n => n.type === 'role' || (!n.parent && n.type !== 'role')).sort((a, b) => a.path.localeCompare(b.path, 'ko'));

  // ---------- 구조: 캐릭터 격자 ----------
  function figHtml(n) {
    const d = countUnder(n.id, 'domain'), p = countUnder(n.id, 'project');
    return `<button class="ps-fig${n.lifecycle && n.lifecycle !== 'active' ? ' dim' : ''}" type="button" data-role="${esc(n.id)}" title="${esc(n.name)}">${Persona.svg(short(n, 10), { sub: `영역 ${d} · 프로젝트 ${p}`, label: `${short(n)} — 영역 ${d}, 프로젝트 ${p}` })}<span class="ps-tag">${esc(codeOf(n))}${n.lifecycle && n.lifecycle !== 'active' ? ` · ${esc(LIFE[n.lifecycle] || n.lifecycle)}` : ''}</span></button>`;
  }
  function gridHtml() {
    const list = roles();
    if (!list.length) return `<div class="ot-none">${Persona.svg('', { empty: true, placeholder: '나의 첫 역할' })}<p>아직 역할 폴더가 없습니다 — 설정 → 업데이트·정보 → 「튜토리얼 다시 보기」의 「내 폴더 만들기」로 첫 역할을 만들어 보세요.</p></div>`;
    return `<div class="ps-pick ot-grid" id="ot-grid">${list.map(figHtml).join('')}</div><p class="on-help">캐릭터는 하나, 가슴의 명찰이 역할입니다. 누르면 그 역할 아래 영역·프로젝트가 나무로 펼쳐집니다.</p>`;
  }
  // ---------- 구조: 고른 역할의 트리 ----------
  const ICON_OPEN = () => Icons.svg('folder', 13);
  const ring = (n) => linksOf.has(n.id) ? `<button class="ot-ring" type="button" data-ring="${esc(n.id)}" title="나무 밖 관계 ${linksOf.get(n.id).length}개 — 관계 화면에서 보기" aria-label="관계 ${linksOf.get(n.id).length}개 보기"></button>` : '';
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
        <div class="ps-fig chosen ot-me" id="ot-me">${Persona.svg(short(r, 10), { sub: `영역 ${countUnder(r.id, 'domain')} · 프로젝트 ${countUnder(r.id, 'project')}` })}</div></div>
      <div class="ot-main"><div class="ot-head"><div><div class="on-i-kind">${KIND.role}${r.lifecycle && r.lifecycle !== 'active' ? ` · ${esc(LIFE[r.lifecycle] || r.lifecycle)}` : ''}</div><div class="ot-title">${esc(r.name)}</div></div>
        <div class="ot-head-act">${ring(r)}<button class="text-btn accent" type="button" data-open="${esc(r.id)}">${ICON_OPEN()}폴더 열기</button></div></div>
        <div class="ot-tools"><button class="ot-link" type="button" data-on="expand">모두 펼치기</button><button class="ot-link" type="button" data-on="collapse">모두 접기</button></div>
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

  // ---------- 관계 화면 ----------
  function relNodes() { const ids = new Set(); for (const l of data.links) { ids.add(l.from); ids.add(l.to); } return [...ids].map(id => byId.get(id)).filter(Boolean).sort((a, b) => a.path.localeCompare(b.path, 'ko')); }
  function relHtml() {
    const ns = relNodes();
    if (!ns.length) return '<div class="on-empty">나무 밖 관계(정본·확장·주인·형제 묶음·승격)가 아직 없습니다. 폴더 머리말에 관계를 적으면 여기 나타납니다.</div>';
    ns.forEach((n, i) => { const a = -Math.PI / 2 + 2 * Math.PI * i / ns.length; n._a = a; n._x = Math.cos(a) * RING; n._y = Math.sin(a) * RING; });
    const marker = `<defs><marker id="on-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="${REL.promoted_to.color}"/></marker></defs>`;
    const edges = data.links.map(l => {
      const a = byId.get(l.from), b = byId.get(l.to); if (!a || !b) return ''; const s = REL[l.rel] || REL.sibling_group;
      return `<path class="on-link r-${esc(l.rel)}" data-from="${esc(l.from)}" data-to="${esc(l.to)}" d="M${a._x.toFixed(1)} ${a._y.toFixed(1)}Q${((a._x + b._x) * .25).toFixed(1)} ${((a._y + b._y) * .25).toFixed(1)} ${b._x.toFixed(1)} ${b._y.toFixed(1)}" style="stroke:${s.color}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}${s.arrow ? ' marker-end="url(#on-arrow)"' : ''}><title>${esc(`${short(a)} → ${s.ko} → ${short(b)}`)}</title></path>`;
    }).join('');
    const dots = ns.map(n => {
      const deg = n._a * 180 / Math.PI, flip = Math.cos(n._a) < 0, x = n._x.toFixed(1), y = n._y.toFixed(1);
      const lab = `<text x="${x}" y="${y}" dx="${flip ? '-.9em' : '.9em'}" dy=".35em" text-anchor="${flip ? 'end' : 'start'}" transform="rotate(${(flip ? deg + 180 : deg).toFixed(1)} ${x} ${y})">${esc(short(n, 18))}</text>`;
      return `<g class="on-n t-${n.type}${n.lifecycle && n.lifecycle !== 'active' ? ' dim' : ''}" data-id="${esc(n.id)}"><circle cx="${x}" cy="${y}" r="4"/>${lab}</g>`;
    }).join('');
    const used = [...new Set(data.links.map(l => l.rel))];
    const legend = `<div class="on-legend">${Object.entries(REL).filter(([k]) => used.includes(k)).map(([k, s]) => `<span class="on-lg" data-rel="${k}" title="${esc(s.desc)}"><svg width="28" height="10" aria-hidden="true"><path d="M2 5H26" style="stroke:${s.color}" stroke-width="${s.thin ? 1 : 1.8}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}${s.arrow ? ' marker-end="url(#on-arrow)"' : ''}/></svg>${esc(s.ko)} <b>${data.links.filter(l => l.rel === k).length}</b></span>`).join('')}</div>`;
    return `<svg class="on-svg" role="img" aria-label="나무 밖 관계 그래프">${marker}<g id="on-g">${edges}${dots}</g></svg>${legend}<aside class="on-info" id="on-info" hidden></aside>`;
  }
  function applyView() {
    const g = $('#on-g', host); if (!g) return;
    g.setAttribute('transform', `translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`);
    $('.on-svg', host).style.setProperty('--k', view.k.toFixed(4)); // 점·글자는 화면 크기 고정(CSS 가 1/k 로 역보정)
  }
  function fit() { const svg = $('.on-svg', host); if (!svg) return; const w = svg.clientWidth || 700, h = svg.clientHeight || 520; view.k = Math.min(w, h) / (2 * (RING + 150)); view.x = w / 2; view.y = h / 2; applyView(); }
  function paintRelation() {
    const body = $('#on-body', host); if (!body) return;
    body.className = 'on-body'; body.innerHTML = relHtml(); fit(); markRel(); showInfo();
  }
  function markRel() {
    const svg = $('.on-svg', host); if (!svg) return; const words = q.trim().toLowerCase(); let hits = 0;
    for (const g of svg.querySelectorAll('.on-n')) { const n = byId.get(g.dataset.id); const hit = !!words && !!n && n.path.toLowerCase().includes(words); g.classList.toggle('hit', hit); g.classList.toggle('sel', g.dataset.id === sel); if (hit) hits++; }
    for (const p of svg.querySelectorAll('.on-link')) p.classList.toggle('on', !!sel && (p.dataset.from === sel || p.dataset.to === sel));
    svg.classList.toggle('searching', !!words); svg.classList.toggle('picked', !!sel);
    const cnt = $('#on-hits', host); if (cnt) cnt.textContent = words ? `${hits}개` : '';
  }
  function showInfo() {
    const box = $('#on-info', host); if (!box) return;
    const n = sel && byId.get(sel); if (!n) { box.hidden = true; return; }
    const parents = []; for (let p = n.parent && byId.get(n.parent); p; p = p.parent && byId.get(p.parent)) parents.unshift(short(p));
    const rels = (linksOf.get(n.id) || []).map(l => { const out = l.from === n.id, o = byId.get(out ? l.to : l.from); const s = REL[l.rel] || { ko: l.rel }; return `<li><i style="background:${s.color || 'var(--ink-3)'}"></i>${out ? '' : '← '}${esc(s.ko)}${out ? ' →' : ''} <span>${esc(o ? short(o, 24) : '?')}</span></li>`; }).join('');
    box.hidden = false;
    box.innerHTML = `<div class="on-i-kind">${esc(KIND[n.type] || n.type)}${n.lifecycle && n.lifecycle !== 'active' ? ` · ${esc(LIFE[n.lifecycle] || n.lifecycle)}` : ''}</div>
      <div class="on-i-name">${esc(n.name)}</div>${parents.length ? `<div class="on-i-row">위치 <span>${esc(parents.join(' › '))}</span></div>` : ''}
      <ul class="on-i-rels">${rels}</ul><code class="on-i-path" title="${esc(n.path)}">${esc(n.path)}</code>
      <div class="on-i-act"><button class="text-btn accent" data-open="${esc(n.id)}">${ICON_OPEN()}폴더 열기</button><button class="text-btn outline" data-on="to-tree">구조에서 보기</button><button class="text-btn outline" data-on="close">닫기</button></div>`;
  }
  function centerOn(n) { const svg = $('.on-svg', host); if (!svg || !n || n._x == null) return; view.k = Math.max(view.k, 1.4); view.x = svg.clientWidth / 2 - n._x * view.k; view.y = svg.clientHeight / 2 - n._y * view.k; applyView(); }

  // ---------- 공통 ----------
  const roleOf = (id) => { let n = byId.get(id); while (n && n.parent && byId.has(n.parent)) n = byId.get(n.parent); return n; };
  function setMode(m, { focus = null } = {}) {
    mode = m;
    host.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    $('#on-fit', host).hidden = m !== 'relation';
    $('#on-q', host).placeholder = m === 'relation' ? '폴더 이름 찾기 (점 강조)' : '폴더 이름 찾기 (Enter = 그 자리로)';
    hideResults();
    if (!data?.ok || !data.nodes.length) return render();
    if (m === 'relation') { sel = focus; paintRelation(); if (focus) centerOn(byId.get(focus)); }
    else if (focus) { const r = roleOf(focus); pickRole(r.id, { focus: focus === r.id ? null : focus }); }
    else paintStructure();
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
    if (mode === 'relation' && data.nodes.length) { if (sel && !byId.has(sel)) sel = null; paintRelation(); } else paintStructure();
  }

  // 검색: 구조 화면 = 일치 목록(최대 30줄) → 누르거나 Enter = 그 자리로 · 관계 화면 = 점 강조
  function hideResults() { const r = $('#on-res', host); if (r) { r.hidden = true; r.innerHTML = ''; } }
  function search() {
    const words = q.trim().toLowerCase();
    if (mode === 'relation') { markRel(); return; }
    const box = $('#on-res', host), cnt = $('#on-hits', host);
    if (!words || !data?.ok) { hideResults(); if (cnt) cnt.textContent = ''; return; }
    const hits = data.nodes.filter(n => n.path.toLowerCase().includes(words));
    cnt.textContent = `${hits.length}개`;
    box.hidden = false;
    box.innerHTML = hits.length ? hits.slice(0, 30).map((n, i) => { const parts = n.path.split('\\'); return `<button class="on-r${i === 0 ? ' cur' : ''}" type="button" data-go="${esc(n.id)}"><span class="on-r-k">${esc(codeOf(n) || n.type[0].toUpperCase())}</span><span class="on-r-n">${esc(short(n, 40))}</span><span class="on-r-p">${esc(parts.slice(0, -1).map(s => short({ name: s }, 12)).join(' › '))}</span></button>`; }).join('') + (hits.length > 30 ? `<div class="on-r-more">… ${hits.length - 30}개 더 — 더 자세히 적어 보세요</div>` : '') : '<div class="on-r-more">찾는 이름이 없습니다</div>';
  }
  function goTo(id) { const n = byId.get(id); if (!n) return; hideResults(); const r = roleOf(id); pickRole(r.id, { focus: id === r.id ? null : id }); }

  async function load(force = false) {
    if (busy) return; if (loaded && !force) { render(); return; }
    busy = true; data = null; render();
    try { data = await (await fetch('/api/ontology/graph')).json(); } catch { data = { ok: false, reason: 'unreadable' }; }
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
    busy = false; btn.disabled = false; loaded = true; sel = null; render();
  }
  async function openFolder(id) {
    const n = byId.get(id); if (!n) return;
    try { const r = await fetch('/api/open-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel: n.path }) }); if (!r.ok) Dialog.alert(`폴더를 열지 못했습니다: ${(await r.json().catch(() => ({}))).error || r.status}`); }
    catch (err) { Dialog.alert(`폴더를 열지 못했습니다: ${err.message}`); }
  }
  /** Esc 한 번 = 한 단계 뒤로(검색 지우기 → 관계 화면 선택 풀기 → 고른 역할에서 격자로). main.js onEscape 가 서랍을 닫기 전에 부른다.
      처리했으면 true. 페이지 keydown 과 Electron 중계가 같은 Esc 로 두 번 부를 수 있어 300ms 안의 두 번째는 처리한 것으로만 답한다. */
  let lastBack = 0;
  function back() {
    if (!host || !host.offsetParent) return false; // 서랍이 닫혔거나 다른 묶음
    if (Date.now() - lastBack < 300) return true;
    const input = $('#on-q', host);
    let did = true;
    if (q) { q = ''; input.value = ''; search(); }
    else if (!$('#on-res', host)?.hidden) hideResults();
    else if (mode === 'relation' && sel) { sel = null; markRel(); showInfo(); }
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
      const b = t.closest('[data-on]')?.dataset.on;
      if (b === 'back') return back();
      if (b === 'close') { sel = null; markRel(); return showInfo(); }
      if (b === 'to-tree') return setMode('structure', { focus: sel });
      if (b === 'expand' || b === 'collapse') { const all = []; const walk = (id) => { for (const k of kids.get(id) || []) { if ((kids.get(k.id) || []).length) all.push(k.id); walk(k.id); } }; walk(role); open = b === 'expand' ? new Set(all) : new Set(); return paintTree(); }
      if (t.closest('#on-rebuild')) return rebuild();
      if (t.closest('#on-fit')) return fit();
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
      if (e.key === 'Enter') {
        const w = q.trim().toLowerCase(); const n = w && data?.nodes?.find(x => x.path.toLowerCase().includes(w)); if (!n) return;
        if (mode === 'relation') { const hit = byId.get(n.id)?._x != null ? n : relNodes().find(x => x.path.toLowerCase().includes(w)); if (hit) { sel = hit.id; markRel(); showInfo(); centerOn(hit); } }
        else goTo(n.id);
      }
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
    const body = $('#on-body', host);
    body.addEventListener('pointerdown', (e) => {
      const svg = e.target.closest('.on-svg'); if (!svg || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, node: e.target.closest('.on-n')?.dataset.id || null };
      svg.setPointerCapture(e.pointerId);
    });
    body.addEventListener('pointermove', (e) => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true; view.x = drag.vx + dx; view.y = drag.vy + dy; applyView();
    });
    body.addEventListener('pointerup', () => { if (drag && !drag.moved) { sel = drag.node; markRel(); showInfo(); } drag = null; });
    body.addEventListener('wheel', (e) => {
      const svg = e.target.closest('.on-svg'); if (!svg) return; e.preventDefault();
      const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const k = Math.min(8, Math.max(.3, view.k * Math.exp(-e.deltaY * .0015)));
      view.x = mx - (mx - view.x) * k / view.k; view.y = my - (my - view.y) * k / view.k; view.k = k; applyView();
    }, { passive: false });
  }

  /** 설정 서랍이 「온톨로지」 묶음을 보일 때 부른다(처음 한 번만 읽음). */
  function show() {
    if (!host) {
      host = $('#st-onto'); if (!host) return;
      host.innerHTML = `<div class="on-bar"><div class="on-seg" role="group" aria-label="보기"><button type="button" data-mode="structure" aria-pressed="true">구조</button><button type="button" data-mode="relation" aria-pressed="false">관계</button></div>
        <label class="on-search">${Icons.svg('search', 14)}<input id="on-q" type="search" placeholder="폴더 이름 찾기 (Enter = 그 자리로)" spellcheck="false" autocomplete="off"><span id="on-hits" class="on-dim"></span></label>
        <button id="on-fit" class="text-btn outline" type="button" title="전체가 보이게" hidden>전체 보기</button><button id="on-rebuild" class="text-btn outline" type="button" title="폴더를 다시 읽어 그래프를 새로 만듭니다">다시 그리기</button>
        <div class="on-res" id="on-res" hidden></div></div>
        <div class="on-sum"><span id="on-sum"></span><span id="on-status" class="on-dim"></span></div>
        <div id="on-body" class="on-body"></div>`;
      bind();
    }
    load();
  }
  return { show, back, reload: () => load(true), _short: short };
})();
