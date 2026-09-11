// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 확인 카드(구현계획 v2.43, 2026-09-11): 세션이 노란불(확인 필요)이면 터미널이 묻는 질문과 선택지를 대화 화면 아래에 카드로 띄운다.
   - 내용은 데몬이 화면 글자에서 뽑아 준 rec.prompt(daemon/approval.mjs: kind choice|yn|raw · question · options[{key,label,selected}]).
   - 버튼을 누르면 터미널 보기와 똑같은 웹소켓 `input`으로 키 한 글자(숫자·y·n·ESC·Enter)를 보낸다. 새 API 없음.
   - 단축키: 입력창이 비어 있을 때 숫자 1~9·y·n·a = 그 버튼. Esc = 터미널과 같게 취소 키(ESC)를 보낸다(main.js onEscape).
   - 누른 뒤에는 데몬의 prompt 방송(null)이 올 때까지 버튼을 잠근다(두 번 눌림 방지, 4초 안전 해제).
   - "터미널에서 보기"는 파싱이 이상할 때의 도망길. 카드가 상태와 어긋나지 않게 render()는 status === 'attention' 일 때만 보인다.
   사용: Approval.init({ send, current, onTerm }) · Approval.render(session|null) · Approval.isOpen() · Approval.choose(key) · Approval.handleKey(e) */
window.Approval = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY_KO = { '\x1b': 'Esc', '\r': 'Enter' };
  const LOCK_MS = 4000;
  let opts = { send: () => {}, current: () => null, onTerm: () => {} };
  let shown = null;   // { id, prompt } 지금 그려진 카드
  let lockTimer = null;

  const el = () => $('#approval');
  const keyText = (k) => KEY_KO[k] || k.toUpperCase();

  function render(s) {
    const box = el(); if (!box) return;
    const p = s && s.status === 'attention' && s.prompt;
    if (!p) { box.hidden = true; shown = null; unlock(); return; }
    const same = shown && shown.id === s.id && JSON.stringify(shown.prompt) === JSON.stringify(p);
    if (same) { box.hidden = false; return; }
    shown = { id: s.id, prompt: p }; unlock();
    const title = p.kind === 'raw' ? '터미널이 입력을 기다립니다' : '확인이 필요합니다';
    const hint = p.kind === 'raw' ? '형식을 알아보지 못해 원문을 보여 줍니다. 아래 키를 보내거나 터미널에서 직접 답해 주세요.' : '입력창이 비어 있으면 숫자·y·n 키로도 고를 수 있습니다. Esc = 취소.';
    box.innerHTML = `
      <div class="ap-head"><span class="dot attention"></span><span class="ap-title">${esc(title)}</span><span class="ap-hint">${esc(hint)}</span>
        <button class="text-btn ap-term" type="button" title="터미널 보기로 전환 (Ctrl+T)">터미널에서 보기</button></div>
      ${p.question ? `<pre class="ap-q">${esc(p.question)}</pre>` : ''}
      <div class="ap-opts">${p.options.map(o => `<button class="ap-opt${o.selected ? ' sel' : ''}" type="button" data-key="${esc(o.key)}"><kbd>${esc(keyText(o.key))}</kbd><span>${esc(o.label)}</span></button>`).join('')}</div>`;
    box.querySelector('.ap-term').onclick = () => opts.onTerm();
    for (const b of box.querySelectorAll('.ap-opt')) b.onclick = () => choose(b.dataset.key);
    box.hidden = false;
    const q = box.querySelector('.ap-q'); if (q) q.scrollTop = q.scrollHeight;
  }

  function choose(key) {
    if (!shown || !key) return false;
    const box = el(); if (!box || box.classList.contains('sending')) return true; // 이미 보냄 — 방송이 올 때까지 잠금
    const id = shown.id;
    if (key !== '\x1b' && !shown.prompt.options.some(o => o.key === key)) return false; // ESC 는 터미널처럼 언제나 취소로 보낸다
    opts.send({ type: 'input', id, data: key });
    box.classList.add('sending');
    for (const b of box.querySelectorAll('.ap-opt')) { b.disabled = true; b.classList.toggle('picked', b.dataset.key === key); }
    clearTimeout(lockTimer); lockTimer = setTimeout(unlock, LOCK_MS);
    return true;
  }
  function unlock() {
    clearTimeout(lockTimer); lockTimer = null;
    const box = el(); if (!box) return;
    box.classList.remove('sending');
    for (const b of box.querySelectorAll('.ap-opt')) { b.disabled = false; b.classList.remove('picked'); }
  }
  const isOpen = () => !!shown && !!el() && !el().hidden;
  /** 문서 keydown 에서 부른다. 카드가 떠 있고 입력창이 비어 있을 때 숫자·y·n·a 한 글자 = 그 버튼. 처리했으면 true. */
  function handleKey(e) {
    if (!isOpen() || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return false;
    const ta = $('#composer-text'); if (ta && ta.value.trim()) return false;
    const k = String(e.key || '').toLowerCase();
    if (!/^[1-9yna]$/.test(k)) return false;
    if (!shown.prompt.options.some(o => o.key === k)) return false;
    e.preventDefault(); choose(k); return true;
  }
  return { init: (o) => { opts = { ...opts, ...o }; }, render, isOpen, choose, handleKey, current: () => shown?.id || null };
})();
