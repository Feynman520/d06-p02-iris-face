// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 보조 작업(서브에이전트) 서랍 + 세션별 보조 목록 보관 (2026-09-11, 구현계획 v2.33).
   데몬이 보내는 { type:'subagents', id, list } 를 세션별로 기억하고, 보고 있는 세션이면 대화 안 칩(Transcript.setSubagents)을 갱신한다.
   칩을 누르면 오른쪽 서랍이 열리고 { type:'attachSub', id, key } 로 그 보조의 기록을 받아 두 번째 Transcript 인스턴스로 그린다. 읽기 전용.
   Esc = 서랍만 닫힘(main.js onEscape가 먼저 묻는다). 세션을 바꾸면 닫힌다. */
window.SubPanel = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lists = new Map(); // 세션 id → 보조 목록
  let cur = null;          // 열린 서랍 { id, key }
  let view = null;         // 서랍 안 Transcript 인스턴스
  let opts = { send: () => {}, current: () => null, onChange: () => {} };
  let closeTimer = null, ticker = null;
  const SUB_W_KEY = 'iris.subW';

  function init(o) {
    opts = { ...opts, ...o };
    view = Transcript.create(); view.mount($('#sub-chat'));
    $('#sub-close').onclick = () => close();
    $('#sub-copy').onclick = async () => { const s = find(); if (!s) return; try { await navigator.clipboard.writeText(s.file || ''); $('#sub-copy').title = '복사됨'; setTimeout(() => { $('#sub-copy').title = '이 보조의 기록파일 경로 복사'; }, 1500); } catch {} };
    $('#sub-tabs').onclick = (e) => { const t = e.target.closest('.sub-tab'); if (t && cur) open(cur.id, t.dataset.key); };
    resizeGrip();
    try { const w = localStorage.getItem(SUB_W_KEY); if (w) $('#chat-wrap').style.setProperty('--sub-w', w); } catch {}
    // 경과 시간은 1초마다(작업 중인 칩·서랍 머리만 값이 바뀐다)
    ticker = setInterval(() => { Transcript.tick(); if (cur) renderMeta(); }, 1000);
  }
  const listOf = (id) => lists.get(id) || [];
  const find = () => cur ? listOf(cur.id).find(s => s.key === cur.key) || null : null;
  const running = (id) => listOf(id).filter(s => s.status === 'running').length;

  /** 데몬의 보조 목록 도착(세션 어느 것이든). 보고 있는 세션이면 칩 갱신, 서랍이 그 세션이면 탭·머리 갱신. */
  function setList(id, list) {
    lists.set(id, Array.isArray(list) ? list : []);
    if (id === opts.current()) Transcript.setSubagents(listOf(id), (key) => open(id, key));
    if (cur && cur.id === id) { const s = find(); if (!s) { close(); } else { renderTabs(); renderMeta(); view.setBusy(s.status === 'running'); } }
    opts.onChange(id);
  }
  /** 세션을 바꿨을 때(main.js select/goHome): 서랍은 닫고, 새 세션의 칩을 건다 */
  function onSession(id) {
    if (cur && cur.id !== id) close(true);
    Transcript.setSubagents(id ? listOf(id) : [], (key) => open(id, key));
  }
  function open(id, key) {
    if (!id || !key) return;
    const same = cur && cur.id === id && cur.key === key;
    cur = { id, key }; clearTimeout(closeTimer);
    const a = $('#sub'); const wrap = $('#chat-wrap');
    if (a.hidden) { a.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => { a.classList.add('open'); wrap.classList.add('sub-open'); })); }
    renderTabs(); renderMeta();
    if (!same) { view.clear(); $('#sub-chat').innerHTML = '<div class="empty">기록을 불러옵니다…</div>'; opts.send({ type: 'attachSub', id, key }); }
    Transcript.markSub(key);
  }
  function close(silent = false) {
    if (!cur) return;
    const id = cur.id; cur = null;
    const a = $('#sub'); a.classList.remove('open'); $('#chat-wrap').classList.remove('sub-open');
    closeTimer = setTimeout(() => { if (!cur) { a.hidden = true; view.clear(); } }, 320);
    Transcript.markSub(null);
    if (!silent) opts.send({ type: 'attachSub', id, key: null });
  }
  const isOpen = () => !!cur;
  /** 데몬의 { type:'subtranscript', id, key, reset?, items, meta, missing? } */
  function onTranscript(m) {
    if (!cur || m.id !== cur.id || m.key !== cur.key) return;
    if (m.missing) { $('#sub-chat').innerHTML = '<div class="empty">이 보조의 기록파일을 아직 찾지 못했습니다.</div>'; return; }
    if (m.reset) { view.render(m.items || [], m.meta); if (!(m.items || []).length) $('#sub-chat').innerHTML = '<div class="empty">아직 기록이 없습니다 — 보조가 첫 줄을 쓰면 여기에 나타납니다.</div>'; }
    else view.append(m.items || [], m.meta);
    view.setBusy(find()?.status === 'running');
  }

  function renderTabs() {
    if (!cur) return;
    const el = $('#sub-tabs');
    el.innerHTML = listOf(cur.id).map(s => `<button class="sub-tab ${s.status}${s.key === cur.key ? ' active' : ''}" data-key="${esc(s.key)}" role="tab" title="${esc(s.detail || s.name)}"><i class="sc-dot"></i><span class="sc-name">${esc(s.name)}</span></button>`).join('');
    el.querySelector('.sub-tab.active')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }
  function renderMeta() {
    const s = find(); const el = $('#sub-meta'); if (!s) { el.innerHTML = ''; return; }
    const d = Transcript.subMeta(s);
    el.innerHTML = `<span>${esc(s.model || '모델 ?')}</span><span class="st ${s.status}">${esc(d.status)}</span><span>도구 <b>${s.tools}</b>회</span><span>${esc(d.elapsed)}</span>${s.detail ? `<span title="${esc(s.detail)}">${esc(s.detail.length > 60 ? s.detail.slice(0, 60) + '…' : s.detail)}</span>` : ''}<span class="sub-file" title="${esc(s.file || '')}">${esc(s.file || '')}</span>`;
  }
  // 왼쪽 가장자리를 끌어 너비 조절(대화 폭 기준 %로 저장). 두 번 클릭 = 기본 50%.
  function resizeGrip() {
    const grip = $('#sub-resize'); const wrap = $('#chat-wrap');
    grip.ondblclick = () => { wrap.style.removeProperty('--sub-w'); try { localStorage.removeItem(SUB_W_KEY); } catch {} };
    grip.onpointerdown = (e) => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId); wrap.classList.add('sub-resizing');
      const total = wrap.getBoundingClientRect(); let pct = 50;
      const move = (ev) => { const w = total.right - ev.clientX; pct = Math.max(25, Math.min(80, Math.round(w / total.width * 100))); wrap.style.setProperty('--sub-w', pct + '%'); };
      const up = () => { grip.onpointermove = null; grip.onpointerup = grip.onpointercancel = null; wrap.classList.remove('sub-resizing'); try { localStorage.setItem(SUB_W_KEY, pct + '%'); } catch {} };
      grip.onpointermove = move; grip.onpointerup = grip.onpointercancel = up;
    };
  }
  return { init, setList, onSession, onTranscript, open, close, isOpen, running, list: listOf };
})();
