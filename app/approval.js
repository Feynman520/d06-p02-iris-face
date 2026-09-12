// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 확인 카드(구현계획 v2.43 → v2.50, 2026-09-13): 세션이 노란불(확인 필요)이면 터미널이 묻는 것을 대화 화면 아래에 카드로 그린다.
   - 내용은 데몬이 화면 글자에서 뽑아 준 rec.prompt(daemon/approval.mjs):
     kind choice|yn|raw · dialog permission|ask|review|trust|plan|update|generic · title · body(명령·설명·계획) · question · tabs(AskUserQuestion 머리 칩)
     · multi(다중 선택) · options[{key,hotkey,label,desc,selected,checked}] · actions[{key,hotkey,label}](다중 선택의 "선택 완료 →" = Tab)
   - 버튼을 누르면 터미널 보기와 똑같은 웹소켓 `input`으로 그 키(숫자·y·n·화살표+Enter·Tab·ESC)를 보낸다. 새 API 없음.
   - 단축키(입력창이 비어 있을 때): 숫자 1~9·y·n·a = 그 선택지 · ↑/↓ = 터미널 커서 이동 · Enter = 표시된 선택 확정 · Esc = 취소(main.js onEscape).
   - raw(모르는 형식)일 때는 원문과 함께 글 입력칸을 붙인다 — 적은 글 + Enter 를 터미널에 그대로 보낸다("Type something" 같은 자유 입력 대응).
   - 누른 뒤에는 데몬의 다음 prompt 방송(내용이 바뀌거나 null)이 올 때까지 버튼을 잠근다(두 번 눌림 방지, 4초 안전 해제).
   - "터미널에서 보기"는 파싱이 이상할 때의 도망길. render()는 status === 'attention' 일 때만 보인다.
   사용: Approval.init({ send, current, onTerm }) · Approval.render(session|null) · Approval.isOpen() · Approval.choose(key) · Approval.handleKey(e) */
window.Approval = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LOCK_MS = 4000;
  const KIND = {
    permission: { icon: '⚙', name: '실행 허가', hint: '에이전트가 이 작업을 해도 되는지 묻습니다.' },
    ask:        { icon: '?', name: '질문', hint: '에이전트가 답을 기다립니다.' },
    review:     { icon: '✔', name: '답 검토', hint: '고른 답을 확인하고 제출합니다.' },
    trust:      { icon: '⌂', name: '폴더 신뢰', hint: '이 폴더의 파일을 믿고 열지 묻습니다.' },
    plan:       { icon: '☰', name: '계획 승인', hint: '계획을 읽고 실행 여부를 정합니다.' },
    update:     { icon: '↑', name: '업데이트', hint: '' },
    generic:    { icon: '!', name: '확인 필요', hint: '' },
  };
  let opts = { send: () => {}, current: () => null, onTerm: () => {} };
  let shown = null;   // { id, prompt } 지금 그려진 카드
  let lockTimer = null;

  const el = () => $('#approval');
  const hot = (o) => o.hotkey ? o.hotkey.replace(/^esc$/i, 'Esc').replace(/^enter$/i, 'Enter') : (o.selected ? 'Enter' : '↓ Enter');
  const isNo = (label) => /^(no|cancel|취소|아니|exit|quit)/i.test(label);
  const isFree = (label) => /^(type something|chat about this)/i.test(label);

  function render(s) {
    const box = el(); if (!box) return;
    const p = s && s.status === 'attention' && s.prompt;
    if (!p) { box.hidden = true; shown = null; unlock(); return; }
    const same = shown && shown.id === s.id && JSON.stringify(shown.prompt) === JSON.stringify(p);
    if (same) { box.hidden = false; return; }
    const draft = box.querySelector('.ap-free input')?.value || '';
    shown = { id: s.id, prompt: p }; unlock();
    const k = KIND[p.dialog] || KIND.generic;
    const raw = p.kind === 'raw';
    const title = raw ? '터미널이 입력을 기다립니다' : (p.title || p.question || k.name);
    const noHot = !raw && !p.options.some(o => o.hotkey);
    const hint = raw ? '형식을 알아보지 못해 원문을 보여 줍니다. 키를 보내거나 아래에 글을 적어 보내세요.' : (p.multi ? '숫자 = 켜고 끄기 · 다 골랐으면 「선택 완료」' : (noHot ? '↑↓ 로 고르고 Enter = 확정 · Esc = 취소' : '숫자·y·n 키로도 고를 수 있습니다 · Esc = 취소'));
    const tabs = p.tabs ? `<div class="ap-tabs">${p.tabs.map(t => `<span class="ap-tab${t.done ? ' done' : ''}">${t.done ? '☒' : '☐'} ${esc(t.label)}</span>`).join('')}</div>` : '';
    const body = p.body ? `<pre class="ap-body${p.dialog === 'permission' ? ' cmd' : ''}">${esc(p.body)}</pre>` : '';
    const question = raw ? `<pre class="ap-q">${esc(p.question)}</pre>` : (p.question && p.question !== title ? `<div class="ap-question">${esc(p.question)}</div>` : '');
    // 키는 HTML 속성에 넣지 않는다 — 속성 안의 CR(Enter 키)을 브라우저가 LF로 바꿔 "선택지에 없는 키"가 되어 전송이 막혔다(v2.43 버그, 2026-09-13 실측).
    // 버튼은 번호(data-i / data-a)만 갖고, 누를 때 shown.prompt 에서 키를 찾는다.
    const optRows = p.options.map((o, i) => {
      const cls = ['ap-opt', o.selected ? 'sel' : '', o.checked === true ? 'on' : '', isNo(o.label) ? 'no' : '', isFree(o.label) ? 'free' : ''].filter(Boolean).join(' ');
      const box_ = o.checked === null ? '' : `<span class="ap-check">${o.checked ? '✔' : ''}</span>`;
      return `<button class="${cls}" type="button" data-i="${i}"><kbd>${esc(hot(o))}</kbd>${box_}<span class="ap-label">${esc(o.label)}${o.desc ? `<small>${esc(o.desc)}</small>` : ''}</span></button>`;
    }).join('');
    const actions = (p.actions || []).map((a, i) => `<button class="ap-act" type="button" data-a="${i}"><kbd>${esc(a.hotkey)}</kbd>${esc(a.label)}</button>`).join('');
    const free = raw ? `<form class="ap-free"><input type="text" placeholder="터미널에 보낼 글 (Enter로 전송)" value="${esc(draft)}" autocomplete="off"><button type="submit" class="ap-act">보내기</button></form>` : '';
    box.innerHTML = `
      <div class="ap-head"><span class="ap-badge" data-kind="${esc(p.dialog || 'generic')}">${esc(k.icon)}</span><span class="ap-kind">${esc(k.name)}</span><span class="ap-title">${esc(title)}</span>
        <span class="ap-hint">${esc(hint)}</span><button class="text-btn ap-term" type="button" title="터미널 보기로 전환 (Ctrl+T)">터미널에서 보기</button></div>
      ${tabs}${body}${question}
      <div class="ap-opts${raw || p.kind === 'yn' ? ' row' : ''}">${optRows}</div>
      ${actions || free ? `<div class="ap-actions">${actions}${free}</div>` : ''}`;
    box.dataset.dialog = p.dialog || 'generic';
    box.querySelector('.ap-term').onclick = () => opts.onTerm();
    for (const b of box.querySelectorAll('.ap-opt')) b.onclick = () => choose(p.options[Number(b.dataset.i)]?.key);
    for (const b of box.querySelectorAll('.ap-act[data-a]')) b.onclick = () => choose((p.actions || [])[Number(b.dataset.a)]?.key);
    const form = box.querySelector('.ap-free');
    if (form) form.onsubmit = (e) => { e.preventDefault(); const inp = form.querySelector('input'); const t = inp.value; if (!t.trim()) return; inp.value = ''; choose(t + '\r', { any: true }); };
    box.hidden = false;
    const b = box.querySelector('.ap-body'); if (b) b.scrollTop = 0;
    const q = box.querySelector('.ap-q'); if (q) q.scrollTop = q.scrollHeight;
  }

  /** 키를 그 세션의 터미널에 보낸다. any=true 면 선택지에 없는 키(자유 입력·화살표)도 허용. */
  function choose(key, { any = false } = {}) {
    if (!shown || !key) return false;
    const box = el(); if (!box || box.classList.contains('sending')) return true; // 이미 보냄 — 방송이 올 때까지 잠금
    const id = shown.id;
    const known = key === '\x1b' || shown.prompt.options.some(o => o.key === key) || (shown.prompt.actions || []).some(a => a.key === key);
    if (!known && !any) return false; // ESC 는 터미널처럼 언제나 취소로 보낸다
    opts.send({ type: 'input', id, data: key });
    box.classList.add('sending');
    const keyOf = (b) => b.dataset.i != null ? shown.prompt.options[Number(b.dataset.i)]?.key : (shown.prompt.actions || [])[Number(b.dataset.a)]?.key;
    for (const b of box.querySelectorAll('.ap-opt, .ap-act')) { b.disabled = true; b.classList.toggle('picked', keyOf(b) === key); }
    clearTimeout(lockTimer); lockTimer = setTimeout(unlock, LOCK_MS);
    return true;
  }
  function unlock() {
    clearTimeout(lockTimer); lockTimer = null;
    const box = el(); if (!box) return;
    box.classList.remove('sending');
    for (const b of box.querySelectorAll('.ap-opt, .ap-act')) { b.disabled = false; b.classList.remove('picked'); }
  }
  const isOpen = () => !!shown && !!el() && !el().hidden;
  /** 문서 keydown 에서 부른다. 카드가 떠 있고 입력창이 비어 있을 때: 숫자·y·n·a = 그 선택지, ↑/↓ = 커서 이동, Enter = 표시된 선택 확정. 처리했으면 true. */
  function handleKey(e) {
    if (!isOpen() || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return false;
    if (e.target && e.target.closest && e.target.closest('.ap-free')) return false; // 자유 입력칸에 치는 글은 그대로
    const ta = $('#composer-text'); if (ta && ta.value.trim()) return false;
    const k = String(e.key || '');
    const p = shown.prompt;
    if (k === 'ArrowUp' || k === 'ArrowDown') { if (p.kind === 'raw') return false; e.preventDefault(); choose(k === 'ArrowUp' ? '\x1b[A' : '\x1b[B', { any: true }); return true; }
    if (k === 'Enter') { const sel = p.options.find(o => o.selected); if (!sel) return false; e.preventDefault(); choose(sel.hotkey ? sel.key : '\r', { any: true }); return true; }
    const low = k.toLowerCase();
    if (!/^[1-9yna]$/.test(low)) return false;
    const o = p.options.find(x => x.hotkey === low) || (p.actions || []).find(x => x.hotkey === low);
    if (!o) return false;
    e.preventDefault(); choose(o.key); return true;
  }
  return { init: (o) => { opts = { ...opts, ...o }; }, render, isOpen, choose, handleKey, current: () => shown?.id || null };
})();
