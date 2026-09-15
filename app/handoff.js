// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 인수 안내 카드(설치 패키지 v2, P03 Task 21) — 데몬 daemon/handoff.mjs 가 정한 카드를 그대로 그린다.
   - 카드는 두 가지뿐이다:
       setup-status     세팅이 덜 끝났거나 로그인이 남음 → 「설치 이어하기」 + 「나중에」
       messenger-prompt 메신저 로그인 안내(딱 한 번, 데몬이 handoff.json 의 messenger.prompted 로 기억) → 「나중에」
   - 글은 데몬이 만든 한 문장씩을 그대로 쓴다(화면이 문장을 지어내지 않는다).
   - 모양은 확인 카드(app/approval.js)의 `.ap-*` 부품을 그대로 재사용하고, 자리만 무대 위 떠 있는 카드(#handoff)로 둔다.
   사용: Handoff.init({ onOpenModule }) · Handoff.apply(info) · Handoff.isOpen() · Handoff.close() */
window.Handoff = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KIND = {
    'setup-status': { icon: '!', name: '설치' },
    'messenger-prompt': { icon: '✉', name: '메신저' },
  };
  let opts = { onOpenModule: () => {} };
  let shown = null;   // 지금 그려진 카드(같은 카드면 다시 그리지 않는다)
  let busy = false;

  const el = () => $('#handoff');
  const isOpen = () => { const b = el(); return !!b && !b.hidden; };

  function close() { const b = el(); if (b) { b.hidden = true; b.innerHTML = ''; } shown = null; busy = false; }

  /** 데몬이 준 info({state, card, …}) 를 그대로 반영. card 가 null 이면 카드를 내린다. */
  function apply(info) {
    const box = el(); if (!box) return;
    const c = info && info.card;
    if (!c) { close(); return; }
    const key = JSON.stringify(c);
    if (shown === key && !box.hidden) return;
    shown = key; busy = false;
    const k = KIND[c.kind] || KIND['setup-status'];
    const lines = (Array.isArray(c.lines) ? c.lines : []).map(t => `<p>${esc(t)}</p>`).join('');
    const acts = [
      c.resume ? '<button class="ap-act accent" type="button" data-act="resume">설치 이어하기</button>' : '',
      c.later ? '<button class="ap-act" type="button" data-act="later">나중에</button>' : '',
    ].filter(Boolean).join('');
    box.innerHTML = `
      <div class="ap-head"><span class="ap-badge" data-kind="${esc(c.kind)}">${esc(k.icon)}</span><span class="ap-kind">${esc(k.name)}</span><span class="ap-title">${esc(c.title || '')}</span></div>
      <div class="hf-lines">${lines}</div>
      <div class="ap-actions">${acts}</div>`;
    for (const b of box.querySelectorAll('.ap-act')) b.onclick = () => act(b.dataset.act, c);
    box.hidden = false;
    // 메신저 안내는 서랍을 함께 펼친다(사용자가 바로 로그인 화면을 본다). 모듈이 아직 안 떴으면 조용히 넘어간다.
    if (c.openModule) { try { opts.onOpenModule(c.openModule); } catch {} }
  }

  async function act(what, card) {
    if (busy) return;
    if (what === 'later') { busy = true; close(); try { await fetch('/api/handoff/dismiss', { method: 'POST' }); } catch {} busy = false; return; }
    if (what !== 'resume') return;
    busy = true;
    const btn = el()?.querySelector('[data-act="resume"]');
    if (btn) { btn.disabled = true; btn.textContent = '설치 창을 여는 중…'; }
    try {
      const r = await fetch('/api/handoff/resume', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { Dialog.alert(`설치를 이어서 열지 못했습니다: ${d.reason || d.error || r.status}`); if (btn) { btn.disabled = false; btn.textContent = '설치 이어하기'; } busy = false; return; }
      Notify.push({ title: '설치 창을 열었습니다', sub: '새 창에서 남은 단계를 이어서 합니다 — 이 창은 그대로 둡니다', status: 'idle', force: true });
      close();
    } catch (e) {
      Dialog.alert(`설치를 이어서 열지 못했습니다: ${e.message}`);
      if (btn) { btn.disabled = false; btn.textContent = '설치 이어하기'; }
    }
    busy = false;
  }

  function init(o = {}) { opts = { ...opts, ...o }; }
  return { init, apply, close, isOpen };
})();
