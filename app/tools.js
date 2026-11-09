// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 설정 → 「도구」(판 B, 2026-11-10 — 설계 = docs\설계-도구화면-2026-11-10.md; 옛 v2.90~v2.92 읽기 전용 화면을 대체).
   탭 셋 Skill · MCP · Plugin. 탭마다 「설치됨」 / 「설치할 수 있음」 두 묶음, 위에 에이전트 탭(전체·Claude 전용·Codex 전용·둘 다)과 찾기.
   한 줄 = 아이콘 · 이름 · 한 줄 설명 · 에이전트 칩 · 상태/버튼:
     IRIS 가 깐 것(장부) → 「제거」 · 엄선 목록의 안 깐 것 → 「설치」 · 기본 도구 → 「기본」 표시만 · 손으로 깐 것 → 「직접 설치함」 표시만.
   설치·제거는 데몬 POST /api/tools/{install,remove}(같은 출처·한 번에 하나), 진행은 ws {type:'tools'} 로 받는다.
   자료 = GET /api/tools(설치된 목록 + origin + catalog). MCP 는 이름·종류·실행 파일 이름만 온다(env·인자 값 없음). */
window.ToolsView = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY_TAB = 'iris.tools.kind';
  let host = null, data = null, loaded = false, q = '', agent = 'all', busy = null, acting = null;
  let kind = (() => { try { return localStorage.getItem(KEY_TAB) || 'skills'; } catch { return 'skills'; } })();
  const KINDS = [
    { key: 'skills', cat: 'skill', title: 'Skill', icon: 'book', desc: '정해진 일을 잘하는 요령을 묶어 둔 설명서 — 에이전트가 필요할 때 펼쳐 봅니다' },
    { key: 'mcp', cat: 'mcp', title: 'MCP', icon: 'plug', desc: '에이전트용 콘센트 — 꽂으면 다른 프로그램·서비스를 직접 다룹니다' },
    { key: 'plugins', cat: 'plugin', title: 'Plugin', icon: 'bolt', desc: 'Skill·MCP·명령을 한 묶음으로 설치하는 것' },
  ];
  if (!KINDS.some(k => k.key === kind)) kind = 'skills';
  const AGENTS = [['all', '전체'], ['claude', 'Claude 전용'], ['codex', 'Codex 전용'], ['both', '둘 다']];
  const chip = (a) => `<span class="chip ${a === 'codex' ? 'codex' : 'claude'}">${a === 'codex' ? 'Codex' : 'Claude'}</span>`;
  const whose = (agents) => agents.length > 1 ? 'both' : agents[0] === 'codex' ? 'codex' : 'claude';
  const byAgent = (rows) => agent === 'all' ? rows : rows.filter(r => whose(r.agents) === agent);
  const K = () => KINDS.find(k => k.key === kind);

  /** 설치된 줄: 같은 이름·같은 출처끼리 묶어 에이전트를 모은다. */
  function installedRows(k) {
    const m = new Map();
    for (const it of (data?.[k.key] || [])) {
      const key = `${String(it.catalogId || it.dir || it.name).toLowerCase()}|${it.origin || 'manual'}|${it.market || ''}`;
      const cur = m.get(key);
      if (cur) { if (!cur.agents.includes(it.agent)) cur.agents.push(it.agent); if (it.enabled === false) cur.off.push(it.agent); }
      else m.set(key, { ...it, agents: [it.agent], off: it.enabled === false ? [it.agent] : [] });
    }
    return [...m.values()];
  }
  const catItems = (k) => (data?.catalog?.items || []).filter(i => i.kind === k.cat);
  const catById = (id) => (data?.catalog?.items || []).find(i => i.id === id) || null;
  const iconOf = (it, k) => it?.icon ? `<img class="tl-ic" src="/app/tool-icons/${esc(it.icon)}" alt="" draggable="false">` : `<span class="tl-ic tl-ic-k">${Icons.svg(k.icon, 15)}</span>`;
  const line = (row, k) => {
    if (k.key === 'mcp') return [row.kind === 'http' ? '인터넷 주소로 연결' : '이 컴퓨터에서 실행', row.program].filter(Boolean).join(' · ');
    if (k.key === 'plugins') return [row.market && `출처 ${row.market}`, row.version && `판 ${row.version}`, row.description].filter(Boolean).join(' · ');
    return row.description || '설명 없음';
  };

  function rowHtml({ id, icon, name, sub, agents, off = [], right, err, state }) {
    return `<div class="st-opt tl-row${off.length && off.length === agents.length ? ' off' : ''}${state ? ` ${state}` : ''}"${id ? ` data-id="${esc(id)}"` : ''}>${icon}`
      + `<span class="st-opt-text">${esc(name)}<small>${sub}</small>${err ? `<small class="tl-err">${esc(err)}</small>` : ''}</span>`
      + `<span class="tl-ag">${agents.map(chip).join('')}${off.length ? '<span class="tl-off">꺼짐</span>' : ''}</span>${right}</div>`;
  }
  const btn = (act, id, label, { danger } = {}) => `<button type="button" class="tl-btn${danger ? ' danger' : ''}" data-act="${act}" data-id="${esc(id)}"${busy || acting ? ' disabled' : ''}>${label}</button>`;
  const spinner = (txt) => `<span class="tl-busy"><span class="tl-spin"></span>${esc(txt)}</span>`;
  const badge = (txt, cls = '') => `<span class="tl-badge ${cls}">${txt}</span>`;

  function render() {
    if (!host) return;
    const body = $('#tl-body', host), tabs = $('#tl-kinds', host), ags = $('#tl-agents', host);
    if (!data) { body.innerHTML = '<div class="on-empty">불러오는 중…</div>'; return; }
    if (!data.ok) { body.innerHTML = '<div class="on-empty">도구 목록을 읽지 못했습니다.</div>'; return; }
    const k = K();
    tabs.innerHTML = KINDS.map(x => `<button type="button" data-kind="${x.key}" aria-pressed="${kind === x.key}">${Icons.svg(x.icon, 14)}${x.title} <b>${installedRows(x).length}</b></button>`).join('');
    const inst = installedRows(k);
    const cats = catItems(k);
    // 엄선 목록 항목: IRIS 가 한 에이전트라도 깔았으면 「설치됨」 묶음(장부 줄과 합침), 아니면 「설치할 수 있음」
    const irisIds = new Set(inst.filter(r => r.origin === 'iris' && r.catalogId).map(r => r.catalogId));
    // 장부에 있는데 설치 목록 읽기에서 빠진 것(설정 파일 모양이 달라 못 읽음 등)도 「설치됨」에 보인다 — 어느 묶음에서도 사라지지 않게(코덱스 코드 검토 2차 B9)
    for (const c of cats) {
      if (irisIds.has(c.id) || !c.state?.ledger) continue;
      const ag = c.agents.filter(a => c.state.agents?.[a] === 'installed');
      inst.push({ name: c.name, origin: 'iris', catalogId: c.id, agents: ag.length ? ag : c.agents, off: [] });
      irisIds.add(c.id);
    }
    const avail = cats.filter(c => !irisIds.has(c.id) && !Object.values(c.state?.agents || {}).includes('installed'));
    const allRows = [...inst.map(r => ({ t: 'inst', agents: r.agents, r })), ...avail.map(c => ({ t: 'cat', agents: c.agents, c }))];
    ags.innerHTML = AGENTS.map(([a, t]) => `<button type="button" data-agent="${a}" aria-pressed="${agent === a}">${t} <b>${a === 'all' ? allRows.length : allRows.filter(x => whose(x.agents) === a).length}</b></button>`).join('');
    const words = q.trim().toLowerCase();
    const match = (s) => !words || s.toLowerCase().includes(words);

    const instHtml = byAgent(inst).filter(r => match(`${r.name} ${r.dir || ''} ${line(r, k)} ${catById(r.catalogId)?.name || ''}`)).map(r => {
      const c = r.origin === 'iris' ? catById(r.catalogId) : null;
      let right = '';
      if (r.origin === 'base') right = badge('기본', 'base');
      else if (r.origin === 'manual') right = badge('직접 설치함', 'manual');
      else if (busy?.id === r.catalogId || acting === r.catalogId) right = spinner(busy?.step || '진행 중…');
      else if (c?.state?.removeRequested) right = badge('제거 대기', 'manual') + btn('cancel', c.id, '제거 취소');
      else if (c) {
        const missing = c.agents.filter(a => c.state?.agents?.[a] === 'absent');
        right = (missing.length ? btn('install', c.id, `${missing.map(a => a === 'codex' ? 'Codex' : 'Claude').join('·')}에도 설치`) : '') + btn('remove', c.id, '제거', { danger: true });
      } else right = badge('IRIS 설치', 'iris');
      const name = c ? c.name : r.name;
      const sub = c ? `${esc(c.desc)}${c.account ? ` · <b>${esc(c.account)}</b>` : ''}${c.state?.removeRequested ? ' · 열린 세션이 모두 끝나면 지웁니다' : ''}` : esc(line(r, k));
      return rowHtml({ id: c?.id, icon: iconOf(c, k), name, sub, agents: r.agents, off: r.off, right, err: c?.state?.error });
    }).join('');

    const availHtml = byAgent(avail.map(c => ({ ...c }))).filter(c => match(`${c.name} ${c.id} ${c.desc}`)).map(c => {
      const conflict = c.agents.filter(a => c.state?.agents?.[a] === 'conflict');
      let right;
      if (busy?.id === c.id || acting === c.id) right = spinner(busy?.step || '진행 중…');
      else if (conflict.length === c.agents.length) right = badge('같은 이름이 이미 있음', 'manual');
      else right = btn('install', c.id, c.state?.error ? '다시 시도' : '설치');
      const sub = `${esc(c.desc)}${c.account ? ` · <b>${esc(c.account)}</b>` : ''}${conflict.length && conflict.length < c.agents.length ? ` · ${conflict.map(a => a === 'codex' ? 'Codex' : 'Claude').join('·')}에는 같은 이름이 따로 있어 건너뜀` : ''}`;
      return rowHtml({ id: c.id, icon: iconOf(c, k), name: c.name, sub, agents: c.agents, right, err: c.state?.error });
    }).join('');

    const empty = (t) => `<div class="upd-line st-sub auth-empty">${t}</div>`;
    body.innerHTML = `<p class="tl-kdesc">${Icons.svg(k.icon, 14)}<span>${esc(k.desc)}</span></p>`
      + `<section class="st-grp tl-card" data-sec="installed"><h3 class="tl-h"><span class="tl-t">설치됨</span><span class="auth-n">${byAgent(inst).length}개</span></h3>${instHtml || empty(words ? '찾는 이름이 없습니다' : `설치된 ${k.title} 없음`)}</section>`
      + `<section class="st-grp tl-card" data-sec="available"><h3 class="tl-h"><span class="tl-t">설치할 수 있음</span><small>IRIS 가 골라 시험한 목록 · 설치·제거는 새로 여는 세션부터 적용</small><span class="auth-n">${byAgent(avail).length}개</span></h3>${availHtml || empty(words ? '찾는 이름이 없습니다' : '지금은 더 설치할 것이 없습니다')}</section>`;
  }

  let loadSeq = 0;
  async function load(force = false) {
    if (loaded && !force) return render();
    if (!data) render();
    const my = ++loadSeq; let d;
    try { d = await (await fetch('/api/tools')).json(); } catch { d = { ok: false }; }
    if (my !== loadSeq) return; // 나중에 시작한 읽기가 이미 있으면 이 결과는 버린다(오래된 응답이 새 상태를 덮지 않게)
    // 데몬 응답의 busy 를 그대로 믿는다(null 포함) — 완료 방송을 놓쳐도 다시 열면 단추가 풀린다(코덱스 코드 검토 8)
    data = d; loaded = true; busy = data?.catalog?.busy ?? null; render();
  }

  function confirmHtml(c, op) {
    const ag = c.agents.map(a => a === 'codex' ? 'Codex' : 'Claude').join(' · ');
    if (op === 'remove') {
      return `<p><b>${esc(c.name)}</b> 을(를) IRIS 에서 지웁니다(${ag}).</p>`
        + '<p>열려 있는 세션이 있으면 그 세션이 쓰던 것을 빼앗지 않도록 「제거 대기」로 두었다가, 세션이 모두 끝나면 지웁니다. 직접 고친 것은 지우지 않습니다.</p>'
        + (c.account ? `<p class="tl-warn">${esc(c.account)}으로 준 권한은 그 서비스에서 따로 해제해야 합니다 — 여기서 지워도 서비스 쪽 로그인 권한은 남습니다.</p>` : '');
    }
    return `<p><b>${esc(c.name)}</b> — ${esc(c.desc)}</p>`
      + `<table class="tl-facts"><tr><th>쓰는 곳</th><td>${ag}</td></tr><tr><th>만든 곳</th><td>${esc(c.vendor)} · ${esc(c.license)}</td></tr>`
      + `<tr><th>필요한 것</th><td>${c.account ? esc(c.account) + ' (처음 쓸 때 연결)' : '없음'}</td></tr>`
      + (c.effects?.length ? `<tr><th>주의</th><td>${c.effects.map(esc).join('<br>')}</td></tr>` : '')
      + `<tr><th>출처</th><td>${esc(c.home)}</td></tr></table>`
      + '<p>새로 여는 세션부터 쓸 수 있습니다. 이미 열린 세션은 그대로입니다.</p>';
  }

  async function act(op, id) {
    const c = catById(id); if (!c || busy || acting) return;
    if (op !== 'cancel') {
      const yes = await Dialog.confirm('', { title: op === 'install' ? '도구 설치' : '도구 제거', html: confirmHtml(c, op), okLabel: op === 'install' ? '설치' : '제거', danger: op === 'remove' });
      if (!yes) return;
    }
    acting = id; render();
    let r;
    try { r = await (await fetch(`/api/tools/${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })).json(); }
    catch (err) { r = { ok: false, error: err.message }; }
    acting = null;
    await load(true);
    if (!r.ok) Dialog.alert(`${op === 'install' ? '설치' : op === 'remove' ? '제거' : '제거 취소'}하지 못했습니다: ${r.error || '알 수 없는 오류'}`);
    else if (r.deferred) Dialog.alert(`열려 있는 세션이 있어 지금은 「제거 대기」로 두었습니다. 세션을 모두 닫으면(⏻ 전부 종료 포함) 그때 지웁니다. 그 전에는 「제거 취소」로 되돌릴 수 있습니다.`);
  }

  /** ws {type:'tools'} — 진행 단계 표시 · 끝나면 다시 읽기 */
  function onTools(m) {
    busy = m.busy || null;
    if (m.changed && host && !acting) load(true); else render();
  }

  /** 설정 서랍이 「도구」 묶음을 보일 때 부른다. 열 때마다 다시 읽는다(설치·제거가 바로 보이게). */
  function show() {
    if (!host) {
      host = $('#st-tools'); if (!host) return;
      host.innerHTML = `<div class="tl-kinds" id="tl-kinds" role="tablist" aria-label="도구 종류"></div>
        <div class="tl-agents" id="tl-agents" role="group" aria-label="어느 에이전트의 도구"></div>
        <div class="on-bar"><label class="on-search">${Icons.svg('search', 14)}<input id="tl-q" type="search" placeholder="도구 이름·설명 찾기" spellcheck="false" autocomplete="off"></label></div>
        <div id="tl-body"></div>`;
      // 아이콘 파일이 없거나 깨지면 종류 기본 선 아이콘으로 바꾼다(빈 네모·깨진 그림 안 보이게). error 는 거품이 없어 잡기 단계에서 받는다.
      host.addEventListener('error', (e) => {
        const img = e.target; if (!(img instanceof HTMLImageElement) || !img.classList.contains('tl-ic')) return;
        const s = document.createElement('span'); s.className = 'tl-ic tl-ic-k'; s.innerHTML = Icons.svg(K().icon, 15); img.replaceWith(s);
      }, true);
      const input = $('#tl-q', host);
      input.addEventListener('input', () => { q = input.value; render(); });
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { input.value = ''; q = ''; render(); } });
      host.addEventListener('click', (e) => {
        const t = e.target.closest('[data-kind]'); if (t && t.closest('#tl-kinds')) { kind = t.dataset.kind; try { localStorage.setItem(KEY_TAB, kind); } catch {} return render(); }
        const a = e.target.closest('[data-agent]'); if (a) { agent = a.dataset.agent; return render(); }
        const b = e.target.closest('[data-act]'); if (b && !b.disabled) act(b.dataset.act, b.dataset.id);
      });
    }
    load(true);
  }
  return { show, onTools };
})();
