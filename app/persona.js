// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 역할 캐릭터(v2.95, 2026-10-23 사용자 결정 — v2.91 「별빛의 분신」 SVG 를 대체): **같은 사람 한 명의 20가지 모습** 그림(v2.95.1 에 8 → 20).
   남성·여성 중 하나만 고르면(state\tutorial.json gender, 튜토리얼 ⑤·설정 온톨로지 공용) 역할 순서대로 1·2·3… 번 모습을 쓴다(21번째부터 다시 1번).
   그림 = app/tutorial/people/{m,f}{1..20}.webp(직업 소품 없음 · 명찰은 비어 있음) · 명찰 자리 = people.json(비율 좌표) — 그 자리에 역할 이름표를 얹는다.
   그림 원본·자르기 = docs\튜토리얼그림-원본\역할시안-2026-10-23 · tool_cut_people.py. 움직임(숨쉬기·걷기)은 persona.css, 담는 상자에 .ps-live 가 있을 때만. */
window.Persona = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const N = 20, BASE = '/app/tutorial/people'; // v2.95.1: 8 → 20모습(역할이 많은 사람도 겹치지 않게)
  let gender = null, badges = {};
  // 명찰 자리(비율) — people.json 이 오기 전·없을 때의 기본값(16장 모두 가슴 오른쪽 이 근처)
  const DEF = [0.655, 0.662];
  const ready = (async () => {
    try { const j = await (await fetch(`${BASE}/people.json`)).json(); for (const [k, v] of Object.entries(j.people || {})) if (Array.isArray(v?.badge)) badges[k] = v.badge; } catch {}
    try { const t = await (await fetch('/api/tutorial')).json(); if (t?.gender === 'm' || t?.gender === 'f') gender = t.gender; } catch {}
  })();

  /** 역할 자리(0부터) → 그림 이름(m1…f8). */
  const key = (index, g = gender || 'm') => `${g === 'f' ? 'f' : 'm'}${(Math.max(0, index | 0) % N) + 1}`;

  /**
   * 역할 카드 그림 HTML.
   * @param {string} name 이름표 글(역할 이름). 빈 값이면 opts.placeholder.
   * @param {{index?: number, sub?: string, empty?: boolean, placeholder?: string, label?: string, gender?: 'm'|'f'}} opts
   *   index = 역할 자리(순서) · sub = 아래 작은 글(영역·프로젝트 수) · empty = 아직 이름 없는 역할(흐리게)
   */
  function pic(name, opts = {}) {
    const shown = String(name || '').trim(), ph = !shown, k = key(opts.index || 0, opts.gender), b = badges[k] || DEF;
    return `<span class="ps-pp${opts.empty ? ' empty' : ''}" role="img" aria-label="${esc(opts.label || shown || opts.placeholder || '')}" style="--bx:${b[0]};--by:${b[1]}">`
      + `<img class="ps-img" src="${BASE}/${k}.webp" alt="" draggable="false" decoding="async">`
      + `<span class="ps-name${ph ? ' ph' : ''}">${esc(shown || opts.placeholder || '')}</span></span>`
      + (opts.sub ? `<span class="ps-sub">${esc(opts.sub)}</span>` : '');
  }

  /** 이름표 글이 넘치면 줄인다 — 그려진 뒤에만 잴 수 있다. */
  function fit(root = document) {
    for (const t of root.querySelectorAll('.ps-pp .ps-name')) {
      t.style.fontSize = '';
      const max = t.parentElement.clientWidth * 0.52; let f = parseFloat(getComputedStyle(t).fontSize) || 12;
      for (let i = 0; i < 8 && t.scrollWidth > max && f > 8; i++) { f -= 1; t.style.fontSize = `${f}px`; }
    }
  }

  /** 상자가 화면에 보일 때만 .ps-live(움직임) — 서랍이 닫히거나 장면이 바뀌면 멈춘다. */
  const watched = new WeakSet();
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => es.forEach(e => e.target.classList.toggle('ps-live', e.isIntersecting)), { rootMargin: '60px' }) : null;
  function watch(box) { if (!box || watched.has(box)) return; watched.add(box); if (io) io.observe(box); else box.classList.add('ps-live'); }

  /** 격자에서 고른 캐릭터를 새 자리로 걸어가게(FLIP) — from = 바뀌기 전 화면 위치(getBoundingClientRect). */
  function walkFrom(el, from) {
    if (!el || !from || typeof el.animate !== 'function') return;
    const to = el.getBoundingClientRect(); if (!to.width) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.bottom - to.bottom, k = from.width / to.width;
    if (Math.hypot(dx, dy) < 4 && Math.abs(k - 1) < .05) return;
    if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.add('ps-walking'); el.classList.remove('ps-turned');
    const a = el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${k})`, transformOrigin: '50% 100%' }, { transform: 'none', transformOrigin: '50% 100%' }], { duration: Math.min(1100, 420 + Math.hypot(dx, dy) * .9), easing: 'cubic-bezier(.45,.05,.3,1)' });
    a.onfinish = a.oncancel = () => { el.classList.remove('ps-walking'); el.classList.add('ps-turned'); };
  }

  /** 성별 고르기 — 데몬에 저장(튜토리얼·온톨로지 공용). 'm' | 'f'. */
  async function setGender(g) {
    if (g !== 'm' && g !== 'f') return;
    gender = g;
    try { await fetch('/api/tutorial/prefs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gender: g }) }); } catch {}
    try { window.dispatchEvent(new CustomEvent('iris:persona-gender', { detail: g })); } catch {}
  }

  return { pic, fit, watch, walkFrom, ready, setGender, key, gender: () => gender, _set: (g) => { if (g === 'm' || g === 'f') gender = g; } };
})();
