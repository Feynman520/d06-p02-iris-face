// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 설정 → 「도구」(v2.90, 설계 = docs\설계-튜토리얼-2026-10-19.md 조각 ⑥): 이 IRIS 의 스킬·MCP·플러그인을 한눈에.
   자료 = 데몬 GET /api/tools(읽기만 — MCP 는 이름·종류·실행 파일 이름만, env·인자·주소 값은 오지 않는다).
   같은 이름이 Claude·Codex 양쪽에 있으면 한 줄에 칩 두 개. */
window.ToolsView = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let host = null, data = null, loaded = false, q = '';
  const chip = (a) => `<span class="chip ${a === 'codex' ? 'codex' : 'claude'}">${a === 'codex' ? 'Codex' : 'Claude'}</span>`;
  /** 같은 이름끼리 묶어 agents 를 모은다(첫 항목의 설명을 쓴다). */
  const merge = (list) => {
    const m = new Map();
    for (const it of list || []) { const k = it.name.toLowerCase(); const cur = m.get(k); if (cur) { if (!cur.agents.includes(it.agent)) cur.agents.push(it.agent); if (it.enabled === false) cur.off.push(it.agent); } else m.set(k, { ...it, agents: [it.agent], off: it.enabled === false ? [it.agent] : [] }); }
    return [...m.values()];
  };
  const CARDS = [
    { key: 'skills', title: '스킬', desc: '정해진 일을 잘하는 요령을 묶어 둔 설명서 — 에이전트가 필요할 때 펼쳐 봅니다', icon: 'book', line: (it) => it.description || '설명 없음' },
    { key: 'mcp', title: 'MCP', desc: '에이전트용 콘센트 — 꽂으면 다른 프로그램·서비스를 직접 다룹니다', icon: 'plug', line: (it) => [it.kind === 'http' ? '인터넷 주소로 연결' : '이 컴퓨터에서 실행', it.program].filter(Boolean).join(' · ') },
    { key: 'plugins', title: '플러그인', desc: '스킬·MCP·명령을 한 묶음으로 설치한 것', icon: 'bolt', line: (it) => [it.market && `출처 ${it.market}`, it.version && `판 ${it.version}`, it.description].filter(Boolean).join(' · ') || '설명 없음' },
  ];
  function render() {
    if (!host) return;
    const body = $('#tl-body', host), sum = $('#tl-sum', host);
    if (!data) { body.innerHTML = '<div class="on-empty">불러오는 중…</div>'; return; }
    if (!data.ok) { body.innerHTML = '<div class="on-empty">도구 목록을 읽지 못했습니다.</div>'; sum.innerHTML = ''; return; }
    const c = data.counts || {};
    sum.innerHTML = CARDS.map(k => `<span class="tl-pill">${Icons.svg(k.icon, 14)}${k.title} <b>${c[k.key] ?? 0}</b></span>`).join('');
    const words = q.trim().toLowerCase();
    body.innerHTML = CARDS.map((k) => {
      const all = merge(data[k.key]);
      const list = words ? all.filter(it => `${it.name} ${k.line(it)}`.toLowerCase().includes(words)) : all;
      const rows = list.map(it => `<div class="st-opt tl-row${it.off.length === it.agents.length ? ' off' : ''}"><span class="st-opt-text">${esc(it.name)}<small>${esc(k.line(it))}</small></span>`
        + `<span class="tl-ag">${it.agents.map(chip).join('')}${it.off.length ? '<span class="tl-off">꺼짐</span>' : ''}</span></div>`).join('');
      const empty = words ? '찾는 이름이 없습니다' : `설치된 ${k.title} 없음`;
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
      host.innerHTML = `<div class="on-bar"><label class="on-search">${Icons.svg('search', 14)}<input id="tl-q" type="search" placeholder="도구 이름·설명 찾기" spellcheck="false" autocomplete="off"></label></div>
        <div class="tl-sum" id="tl-sum"></div><div id="tl-body"></div>`;
      const input = $('#tl-q', host);
      input.addEventListener('input', () => { q = input.value; render(); });
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { input.value = ''; q = ''; render(); } });
    }
    load(true);
  }
  return { show };
})();
