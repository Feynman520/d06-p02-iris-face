// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 설정 → 「온톨로지」(v2.90, 설계 = docs\설계-튜토리얼-2026-10-19.md 조각 ⑤): 내 폴더 구조(R → D → P)를 방사형 나무 그래프로.
   자료 = 데몬 GET /api/ontology/graph(영혼의 _ontology\graph.json 요약 — 경로·종류만, 내용 없음). 라이브러리 없이 SVG.
   끌어서 이동 · 휠 확대 · 노드 누르면 오른쪽 정보 + 「폴더 열기」(POST /api/open-folder) · 검색칸 · 「다시 그리기」(POST /api/ontology/rebuild). */
window.OntologyView = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KIND = { role: '역할(R)', domain: '영역(D)', project: '프로젝트(P)' };
  const LIFE = { active: '진행 중', archived: '보관', paused: '멈춤', done: '끝남', deprecated: '퇴역' };
  const RING = { role: 200, domain: 380, project: 570 }; // 가운데 IRIS 에서의 거리. 이름은 모두 바깥 방향으로 돌려 쓴다(역할끼리도 안 겹치게)
  let host = null, data = null, loaded = false, busy = false, view = { x: 0, y: 0, k: 1 }, sel = null, q = '';
  let byId = new Map(), kids = new Map(), drag = null;

  /** 'R07-개발자(Developer)' → '개발자', 접두 태그·영문 괄호 뺀 짧은 이름. */
  const short = (n) => {
    let s = String(n.name || '').replace(/^〖[^〗]*〗/, '').replace(/^[RDPST]\d{2}(\.\d{2})?-/, '');
    s = s.replace(/\([^)]*\)/g, '').replace(/\s*〖[^〗]*〗/g, '').trim();
    return s.length > 16 ? `${s.slice(0, 15)}…` : s;
  };

  // ---------- 배치: 잎 수에 비례해 각도를 나눠 주는 방사형 나무 ----------
  function layout() {
    byId = new Map(data.nodes.map(n => [n.id, n])); kids = new Map();
    const tops = [];
    for (const n of data.nodes) { if (n.parent && byId.has(n.parent)) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); } else tops.push(n); }
    const byPath = (a, b) => a.path.localeCompare(b.path, 'ko');
    tops.sort(byPath); for (const l of kids.values()) l.sort(byPath);
    const leaves = (n) => (n._lv ??= (kids.get(n.id) || []).reduce((s, c) => s + leaves(c), 0) || 1);
    const wt = (n) => Math.pow(leaves(n), .7); // 각도 몫 = 잎 수^0.7 — 큰 역할 하나가 원을 거의 다 차지하지 않게
    const topW = (n) => 1 + .15 * Math.sqrt(leaves(n)); // 역할 단계는 거의 고르게 — 작은 역할 이름끼리 겹치지 않게(이 PC: 잎 300개 역할 3.6 : 잎 1개 역할 1.15)
    const total = tops.reduce((s, n) => s + topW(n), 0) || 1;
    const place = (n, a0, a1, depth) => {
      const a = (a0 + a1) / 2, r = RING[n.type] || (depth + 1) * 190;
      n._a = a; n._x = Math.cos(a) * r; n._y = Math.sin(a) * r;
      let s = a0; const span = a1 - a0; const list = kids.get(n.id) || []; const sum = list.reduce((t, c) => t + wt(c), 0) || 1;
      for (const c of list) { const w = span * wt(c) / sum; place(c, s, s + w, depth + 1); s += w; }
    };
    let s = -Math.PI / 2; for (const n of tops) { const w = 2 * Math.PI * topW(n) / total; place(n, s, s + w, 0); s += w; }
    return tops;
  }

  // ---------- 그리기 ----------
  function svgHtml(tops) {
    const parts = [];
    // 나무 선(부모 → 자식, 가운데 IRIS → R)
    const line = (x1, y1, x2, y2, cls) => `<path class="${cls}" d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
    for (const n of tops) parts.push(line(0, 0, n._x, n._y, 'on-e lv-role'));
    for (const n of data.nodes) { const p = n.parent && byId.get(n.parent); if (p) parts.push(line(p._x, p._y, n._x, n._y, `on-e lv-${n.type}`)); }
    // 나무 밖 관계(owner·canonical·extends …) = 가운데로 휘는 옅은 곡선
    for (const l of data.links) {
      const a = byId.get(l.from), b = byId.get(l.to); if (!a || !b) continue;
      parts.push(`<path class="on-link" data-rel="${esc(l.rel)}" d="M${a._x.toFixed(1)} ${a._y.toFixed(1)}Q${((a._x + b._x) * .2).toFixed(1)} ${((a._y + b._y) * .2).toFixed(1)} ${b._x.toFixed(1)} ${b._y.toFixed(1)}"><title>${esc(l.rel)}</title></path>`);
    }
    for (const n of data.nodes) {
      const deg = n._a * 180 / Math.PI, flip = Math.cos(n._a) < 0, x = n._x.toFixed(1), y = n._y.toFixed(1);
      const lab = `<text x="${x}" y="${y}" dx="${flip ? '-.8em' : '.8em'}" dy=".35em" text-anchor="${flip ? 'end' : 'start'}" transform="rotate(${(flip ? deg + 180 : deg).toFixed(1)} ${x} ${y})">${esc(short(n))}</text>`;
      parts.push(`<g class="on-n t-${n.type}${n.lifecycle && n.lifecycle !== 'active' ? ' dim' : ''}" data-id="${esc(n.id)}"><circle cx="${x}" cy="${y}" r="3"/>${lab}</g>`);
    }
    return `${parts.join('')}<g class="on-root"><circle class="on-core" r="22"/><text class="on-core-t" dy=".35em" text-anchor="middle">IRIS</text></g>`;
  }
  function applyView() {
    const g = $('#on-g', host); if (!g) return;
    g.setAttribute('transform', `translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`);
    host.querySelector('.on-svg').style.setProperty('--k', view.k.toFixed(4)); // 점·글자는 화면 크기 고정(CSS 가 1/k 로 역보정)
    // 확대에 따라 이름 보이기: R 항상 · D 0.9배부터 · P 2.2배부터(검색·선택된 것은 항상)
    host.querySelector('.on-svg').dataset.zoom = view.k >= 2.2 ? '3' : view.k >= .9 ? '2' : '1';
  }
  function fit() {
    const svg = $('.on-svg', host); if (!svg) return; const w = svg.clientWidth || 700, h = svg.clientHeight || 520;
    view.k = Math.min(w, h) / (2 * (RING.project + 90)); view.x = w / 2; view.y = h / 2; applyView();
  }
  function render() {
    if (!host) return;
    const body = $('#on-body', host), info = $('#on-sum', host);
    if (!data) { body.innerHTML = '<div class="on-empty">불러오는 중…</div>'; return; }
    if (!data.ok) {
      info.textContent = '';
      body.innerHTML = `<div class="on-empty">${data.reason === 'missing' ? '아직 그래프 파일이 없습니다 — 폴더를 만든 뒤 「다시 그리기」를 누르면 만들어집니다.' : '그래프 파일을 읽지 못했습니다 — 「다시 그리기」를 눌러 보세요.'}</div>`;
      return;
    }
    const c = data.counts;
    info.innerHTML = `<b>${c.role}</b> 역할 · <b>${c.domain}</b> 영역 · <b>${c.project}</b> 프로젝트 · 관계 <b>${c.links}</b>${data.generated ? ` <span class="on-dim">· ${esc(String(data.generated).slice(0, 16).replace('T', ' '))} 기준</span>` : ''}`;
    if (!data.nodes.length) { body.innerHTML = '<div class="on-empty">아직 R·D·P 폴더가 없습니다 — 「튜토리얼 다시 보기」의 「내 폴더 만들기」로 시작해 보세요.</div>'; return; }
    const tops = layout();
    body.innerHTML = `<svg class="on-svg" role="img" aria-label="폴더 구조 그래프"><g id="on-g">${svgHtml(tops)}</g></svg><aside class="on-info" id="on-info" hidden></aside>`;
    fit(); mark(); showInfo();
  }
  /** 검색 일치·선택 강조. 검색어가 있으면 나머지는 흐리게. */
  function mark() {
    const svg = $('.on-svg', host); if (!svg) return;
    const words = q.trim().toLowerCase();
    let hits = 0;
    for (const g of svg.querySelectorAll('.on-n')) {
      const n = byId.get(g.dataset.id); const hit = !!words && n && n.path.toLowerCase().includes(words);
      g.classList.toggle('hit', hit); g.classList.toggle('sel', n?.id === sel); if (hit) hits++;
    }
    svg.classList.toggle('searching', !!words);
    const cnt = $('#on-hits', host); if (cnt) cnt.textContent = words ? `${hits}개` : '';
  }
  function showInfo() {
    const box = $('#on-info', host); if (!box) return;
    const n = sel && byId.get(sel); if (!n) { box.hidden = true; return; }
    const rels = data.links.filter(l => l.from === n.id || l.to === n.id);
    const parentNames = []; for (let p = n.parent && byId.get(n.parent); p; p = p.parent && byId.get(p.parent)) parentNames.unshift(short(p));
    box.hidden = false;
    box.innerHTML = `<div class="on-i-kind">${esc(KIND[n.type] || n.type)}${n.lifecycle && n.lifecycle !== 'active' ? ` · ${esc(LIFE[n.lifecycle] || n.lifecycle)}` : ''}</div>
      <div class="on-i-name">${esc(n.name)}</div>
      ${parentNames.length ? `<div class="on-i-row">위치 <span>${esc(parentNames.join(' › '))}</span></div>` : ''}
      <div class="on-i-row">아래 <span>${(kids.get(n.id) || []).length}개</span></div>
      <div class="on-i-row">관계 <span>${rels.length ? rels.map(l => esc(l.rel)).join(', ') : '없음'}</span></div>
      <code class="on-i-path" title="${esc(n.path)}">${esc(n.path)}</code>
      <div class="on-i-act"><button class="text-btn accent" data-on="open">${Icons.svg('folder', 14)}폴더 열기</button><button class="text-btn outline" data-on="close">닫기</button></div>`;
  }
  function select(id) { sel = id; mark(); showInfo(); }
  function centerOn(n) { const svg = $('.on-svg', host); if (!svg || !n) return; view.k = Math.max(view.k, 2.4); view.x = svg.clientWidth / 2 - n._x * view.k; view.y = svg.clientHeight / 2 - n._y * view.k; applyView(); }

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

  function bind() {
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-on]');
      if (b?.dataset.on === 'close') return select(null);
      if (b?.dataset.on === 'open') {
        const n = sel && byId.get(sel); if (!n) return;
        try { const r = await fetch('/api/open-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel: n.path }) }); if (!r.ok) Dialog.alert(`폴더를 열지 못했습니다: ${(await r.json().catch(() => ({}))).error || r.status}`); }
        catch (err) { Dialog.alert(`폴더를 열지 못했습니다: ${err.message}`); }
        return;
      }
      if (e.target.closest('#on-rebuild')) return rebuild();
      if (e.target.closest('#on-fit')) return fit();
    });
    const input = $('#on-q', host);
    input.addEventListener('input', () => { q = input.value; mark(); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 숫자·Esc 가 확인 카드·작업 중단으로 새지 않게
      if (e.key === 'Enter') { const w = q.trim().toLowerCase(); const n = w && data?.nodes?.find(x => x.path.toLowerCase().includes(w)); if (n) { select(n.id); centerOn(n); } }
      if (e.key === 'Escape') { input.value = ''; q = ''; mark(); }
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
    body.addEventListener('pointerup', () => { if (drag && !drag.moved) select(drag.node); drag = null; });
    body.addEventListener('wheel', (e) => {
      const svg = e.target.closest('.on-svg'); if (!svg) return; e.preventDefault();
      const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const k = Math.min(12, Math.max(.2, view.k * Math.exp(-e.deltaY * .0015)));
      view.x = mx - (mx - view.x) * k / view.k; view.y = my - (my - view.y) * k / view.k; view.k = k; applyView();
    }, { passive: false });
  }

  /** 설정 서랍이 「온톨로지」 묶음을 보일 때 부른다(처음 한 번만 읽음). */
  function show() {
    if (!host) {
      host = $('#st-onto'); if (!host) return;
      host.innerHTML = `<div class="on-bar"><label class="on-search">${Icons.svg('search', 14)}<input id="on-q" type="search" placeholder="폴더 이름 찾기 (Enter = 그 자리로)" spellcheck="false" autocomplete="off"><span id="on-hits" class="on-dim"></span></label>
        <button id="on-fit" class="text-btn outline" type="button" title="전체가 보이게">전체 보기</button><button id="on-rebuild" class="text-btn outline" type="button" title="폴더를 다시 읽어 그래프를 새로 만듭니다">다시 그리기</button></div>
        <div class="on-sum"><span id="on-sum"></span><span id="on-status" class="on-dim"></span></div>
        <div id="on-body" class="on-body"></div>
        <p class="on-help">끌어서 이동 · 휠로 확대 · 점을 누르면 그 폴더 정보. 가운데부터 역할 → 영역 → 프로젝트, 옅은 곡선 = 나무 밖 관계(정본·확장 등).</p>`;
      bind();
    }
    load();
  }
  return { show, reload: () => load(true), _short: short };
})();
