// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 설정 → 의견 보내기(v2.105, 2026-11-13). 설계 = P07 docs/설계-의견함-2026-11-12.md ⑥ · 시안 = 같은 폴더 시안-의견-2026-11-12/site/app-rail.html.
// 화면은 데몬에만 말한다: GET /api/feedback(판 정보 한 줄, 바깥 연결 없음) · POST /api/feedback(누를 때만 바깥 연결).
// 실패하면 홈페이지 /feedback?info=… 로 이어 보낼 길을 보여 준다(쓴 글은 그대로 둔다).
window.FeedbackView = (() => {
  const $ = (s) => document.querySelector(s);
  const PH = {
    bug: '무엇을 하다가 무엇이 나왔나요? 첫 줄은 제목이 됩니다.', improve: '지금은 어떻고, 어떻게 바뀌면 좋을까요?',
    feature: '무엇을 하고 싶은데 무엇이 없나요?', other: '편하게 적어 주세요.',
  };
  const ERR = {
    empty: '내용을 적어 주세요.', too_long: '내용은 4,000자까지 보낼 수 있습니다.', email: '이메일 주소를 확인해 주세요.',
    rate: '잠시 뒤에 다시 보내 주세요. 같은 곳에서는 10분에 5통까지 받습니다.', full: '지금은 의견을 받을 수 없습니다.',
    offline: '보내지 못했습니다. 인터넷 연결을 확인해 주세요.', server: '보내지 못했습니다. 잠시 뒤 다시 보내 주세요.', bad: '보내지 못했습니다. 입력을 확인해 주세요.',
  };
  let kind = 'bug', info = '', fallback = 'https://iris-workspace.com/feedback', wired = false, busy = false;

  function ink() {
    const t = document.querySelector('.fb-tabs button[aria-pressed="true"]'), i = $('.fb-ink');
    if (!t || !i || !t.offsetWidth) return;
    i.style.width = `${t.offsetWidth}px`; i.style.transform = `translateX(${t.offsetLeft}px)`;
  }
  function grow() { const b = $('#fb-body'); b.style.height = 'auto'; b.style.height = `${Math.max(b.scrollHeight + 2, 168)}px`; }
  function sync() {
    for (const b of document.querySelectorAll('.fb-tabs button')) b.setAttribute('aria-pressed', String(b.dataset.k === kind));
    $('#fb-body').placeholder = PH[kind];
    $('#fb-tip').hidden = !(kind === 'bug' && $('#fb-where').value === 'install');
    $('#fb-send').disabled = busy || !$('#fb-body').value.trim();
    ink();
  }
  function showErr(code) {
    const e = $('#fb-err'); e.textContent = '';
    e.append(ERR[code] || ERR.server);
    if (['offline', 'server', 'full'].includes(code)) {
      const a = document.createElement('a');
      a.href = `${fallback}?info=${encodeURIComponent(info)}`; a.target = '_blank'; a.rel = 'noreferrer'; a.textContent = '홈페이지에서 보내기';
      e.append(' ', a, ' (쓴 글을 복사해 붙여 넣어 주세요)');
    }
    e.hidden = false;
  }
  async function send() {
    if (busy) return;
    if (!$('#fb-body').value.trim()) return showErr('empty');
    busy = true; $('#fb-err').hidden = true; $('#fb-send').textContent = '보내는 중'; sync();
    let r = null;
    try {
      const res = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, place: $('#fb-where').value, body: $('#fb-body').value, email: $('#fb-mail').value }) });
      r = await res.json().catch(() => null);
    } catch { r = { ok: false, error: 'offline' }; }
    busy = false; $('#fb-send').textContent = '보내기'; sync();
    if (!r?.ok) return showErr(r?.error || 'server');
    $('#fb-number').textContent = r.receipt;
    $('#fb-reply-note').hidden = !$('#fb-mail').value.trim();
    $('#fb-write').hidden = true; $('#fb-done').hidden = false; $('#fb-copy').textContent = '복사'; $('#fb-copy').focus();
  }
  function wire() {
    if (wired) return; wired = true;
    for (const b of document.querySelectorAll('.fb-tabs button')) b.addEventListener('click', () => { kind = b.dataset.k; sync(); $('#fb-body').focus(); });
    $('#fb-where').addEventListener('change', sync);
    $('#fb-body').addEventListener('input', () => { grow(); $('#fb-err').hidden = true; sync(); });
    $('#fb-send').addEventListener('click', send);
    $('#fb-more').addEventListener('click', () => { const d = $('#fb-detail'); d.hidden = !d.hidden; $('#fb-more').setAttribute('aria-expanded', String(!d.hidden)); $('#fb-more').textContent = d.hidden ? '자세히' : '접기'; });
    $('#fb-copy').addEventListener('click', () => { navigator.clipboard?.writeText($('#fb-number').textContent).then(() => { $('#fb-copy').textContent = '복사됨'; }, () => {}); });
    $('#fb-again').addEventListener('click', () => { $('#fb-body').value = ''; $('#fb-done').hidden = true; $('#fb-write').hidden = false; grow(); sync(); $('#fb-body').focus(); });
    window.addEventListener('resize', ink);
  }
  async function show() {
    wire(); grow(); sync();
    requestAnimationFrame(ink);
    try { const r = await (await fetch('/api/feedback')).json(); info = r.info || ''; fallback = r.fallback || fallback; $('#fb-info-v').textContent = info || '—'; } catch {}
  }
  return { show };
})();
