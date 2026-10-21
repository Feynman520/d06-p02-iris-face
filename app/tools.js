// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 설정 → 「도구」(v2.90 → v2.92): 이 IRIS 의 Skill·MCP·Plugin 을 한눈에.
   자료 = 데몬 GET /api/tools(읽기만 — MCP 는 이름·종류·실행 파일 이름만, env·인자·주소 값은 오지 않는다).
   같은 이름이 Claude·Codex 양쪽에 있으면 한 줄에 칩 두 개.
   v2.92(사용자 요청 2026-10-21): 위 뱃지(모두·Skill·MCP·Plugin)를 누르면 그 종류만 · 에이전트 탭(전체·Claude 전용·Codex 전용·둘 다) · 뱃지 이름은 영어. */
window.ToolsView = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let host = null, data = null, loaded = false, q = '', kind = 'all', agent = 'all';
  const chip = (a) => `<span class="chip ${a === 'codex' ? 'codex' : 'claude'}">${a === 'codex' ? 'Codex' : 'Claude'}</span>`;
  /** 같은 이름끼리 묶어 agents 를 모은다(첫 항목의 설명을 쓴다). */
  const merge = (list) => {
    const m = new Map();
    for (const it of list || []) { const k = it.name.toLowerCase(); const cur = m.get(k); if (cur) { if (!cur.agents.includes(it.agent)) cur.agents.push(it.agent); if (it.enabled === false) cur.off.push(it.agent); } else m.set(k, { ...it, agents: [it.agent], off: it.enabled === false ? [it.agent] : [] }); }
    return [...m.values()];
  };
  const CARDS = [
    { key: 'skills', title: 'Skill', desc: '정해진 일을 잘하는 요령을 묶어 둔 설명서 — 에이전트가 필요할 때 펼쳐 봅니다', icon: 'book', line: (it) => it.description || '설명 없음' },
    { key: 'mcp', title: 'MCP', desc: '에이전트용 콘센트 — 꽂으면 다른 프로그램·서비스를 직접 다룹니다', icon: 'plug', line: (it) => [it.kind === 'http' ? '인터넷 주소로 연결' : '이 컴퓨터에서 실행', it.program].filter(Boolean).join(' · ') },
    { key: 'plugins', title: 'Plugin', desc: 'Skill·MCP·명령을 한 묶음으로 설치한 것', icon: 'bolt', line: (it) => [it.market && `출처 ${it.market}`, it.version && `판 ${it.version}`, it.description].filter(Boolean).join(' · ') || '설명 없음' },
  ];
  const AGENTS = [['all', '전체'], ['claude', 'Claude 전용'], ['codex', 'Codex 전용'], ['both', '둘 다']];
  /** 에이전트 탭: Claude 전용 = Claude 에만 있음 · Codex 전용 = Codex 에만 · 둘 다 = 양쪽 모두. */
  const whose = (it) => it.agents.length > 1 ? 'both' : it.agents[0] === 'codex' ? 'codex' : 'claude';
  const byAgent = (list, a) => a === 'all' ? list : list.filter(it => whose(it) === a);
  function render() {
    if (!host) return;
    const body = $('#tl-body', host), sum = $('#tl-sum', host), tabs = $('#tl-agents', host);
    if (!data) { body.innerHTML = '<div class="on-empty">불러오는 중…</div>'; return; }
    if (!data.ok) { body.innerHTML = '<div class="on-empty">도구 목록을 읽지 못했습니다.</div>'; sum.innerHTML = ''; tabs.innerHTML = ''; return; }
    const merged = Object.fromEntries(CARDS.map(k => [k.key, merge(data[k.key])]));
    const kinds = kind === 'all' ? CARDS : CARDS.filter(k => k.key === kind);
    // 에이전트 탭의 수 = 지금 고른 종류 안에서 · 종류 뱃지의 수 = 지금 고른 에이전트 탭 안에서
    tabs.innerHTML = AGENTS.map(([k, t]) => `<button type="button" data-agent="${k}" aria-pressed="${agent === k}">${t} <b>${kinds.reduce((s, c) => s + byAgent(merged[c.key], k).length, 0)}</b></button>`).join('');
    sum.innerHTML = `<button type="button" class="tl-pill" data-kind="all" aria-pressed="${kind === 'all'}">All <b>${CARDS.reduce((s, c) => s + byAgent(merged[c.key], agent).length, 0)}</b></button>`
      + CARDS.map(k => `<button type="button" class="tl-pill" data-kind="${k.key}" aria-pressed="${kind === k.key}">${Icons.svg(k.icon, 14)}${k.title} <b>${byAgent(merged[k.key], agent).length}</b></button>`).join('');
    const words = q.trim().toLowerCase();
    body.innerHTML = kinds.map((k) => {
      const all = byAgent(merged[k.key], agent);
      const list = words ? all.filter(it => `${it.name} ${k.line(it)}`.toLowerCase().includes(words)) : all;
      const rows = list.map(it => `<div class="st-opt tl-row${it.off.length === it.agents.length ? ' off' : ''}"><span class="st-opt-text">${esc(it.name)}<small>${esc(k.line(it))}</small></span>`
        + `<span class="tl-ag">${it.agents.map(chip).join('')}${it.off.length ? '<span class="tl-off">꺼짐</span>' : ''}</span></div>`).join('');
      const empty = words ? '찾는 이름이 없습니다' : agent === 'all' ? `설치된 ${k.title} 없음` : `${AGENTS.find(a => a[0] === agent)[1]} ${k.title} 없음`;
      return `<section class="st-grp tl-card" data-kind="${k.key}"><h3 class="tl-h">${Icons.svg(k.icon, 14)}<span class="tl-t">${k.title}</span><small>${esc(k.desc)}</small><span class="auth-n">${words ? `${list.length} / ` : ''}${all.length}개</span></h3>`
        + (rows || `<div class="upd-line st-sub auth-empty">${empty}</div>`) + '</section>';
    }).join('');
  }
  async function load(force = false) {
    if (loaded && !force) return render();
    data = null; render();
    try { data = await (await fetch('/api/tools')).json(); } catch { data = { ok: false }; }
    loaded = true; render();
  }
  /** 설정 서랍이 「도구」 묶음을 보일 때 부른다. 열 때마다 다시 읽는다(설치·제거가 바로 보이게 — 파일 몇 개 읽기라 가볍다). */
  function show() {
    if (!host) {
      host = $('#st-tools'); if (!host) return;
      host.innerHTML = `<div class="tl-agents" id="tl-agents" role="group" aria-label="어느 에이전트의 도구"></div>
        <div class="on-bar"><label class="on-search">${Icons.svg('search', 14)}<input id="tl-q" type="search" placeholder="도구 이름·설명 찾기" spellcheck="false" autocomplete="off"></label></div>
        <div class="tl-sum" id="tl-sum" role="group" aria-label="종류"></div><div id="tl-body"></div>`;
      const input = $('#tl-q', host);
      input.addEventListener('input', () => { q = input.value; render(); });
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { input.value = ''; q = ''; render(); } });
      host.addEventListener('click', (e) => {
        const k = e.target.closest('[data-kind]:not(section)'); if (k) { kind = kind === k.dataset.kind && k.dataset.kind !== 'all' ? 'all' : k.dataset.kind; return render(); } // 고른 뱃지를 다시 누르면 모두
        const a = e.target.closest('[data-agent]'); if (a) { agent = a.dataset.agent; return render(); }
      });
    }
    load(true);
  }
  return { show };
})();
