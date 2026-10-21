// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 「별빛의 분신」 캐릭터(v2.91, 설계 = docs\설계-온톨로지분신-2026-10-20.md 조각 ②): 얼굴 없는 사람 형태 한 명 + 가슴의 명찰 = 역할.
   캐릭터는 하나뿐이고 명찰만 바뀐다. 이름마다 조금씩 다른 무늬 = 역할 이름 → FNV-1a 32비트 → 시드 난수 → 별 좌표·밝기·색(청록–남빛–보라).
   같은 이름 = 늘 같은 모습. 코드로 그린 SVG(이미지 파일·인터넷 없음). 쓰는 곳 = 설정 → 온톨로지(app/ontology.js) · 튜토리얼 ④(app/tutorial.js).
   움직임(숨쉬기·걷기)은 persona.css — 담는 상자에 .ps-live 가 있을 때만 돈다(watch() 가 화면에 보일 때만 붙임). */
window.Persona = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 몸 = 윗몸 + 두 다리(다리는 따로 잘라 걷기 때 엇갈려 흔든다). 좌표계 200×360, 발바닥 y≈323.
  const UPPER = 'M100 28 C87 28 79 39 80 53 C80 67 86 77 92 80 L92 91 C77 93 64 98 60 113 L48 180 Q46 191 53 193 Q60 195 63 184 L76 137 L74 205 Q100 218 126 205 L124 137 L137 184 Q140 195 147 193 Q154 191 152 180 L140 113 C136 98 123 93 108 91 L108 80 C114 77 120 67 120 53 C121 39 113 28 100 28 Z';
  const LEFT = 'M74 200 L101 204 L94 253 L88 313 L89 323 L65 323 Q61 319 67 315 L72 310 L75 252 Z';
  const RIGHT = 'M99 204 L126 200 L125 252 L128 310 L133 315 Q139 319 135 323 L111 323 L112 313 L106 253 Z';
  const ALL = `${UPPER} ${LEFT} ${RIGHT}`;
  // 별자리 꼭짓점(머리 7점 + 몸 18점) — 몸 쪽 점만 이름 시드로 조금씩 흔든다
  const POINTS = [[100, 28], [83, 39], [80, 57], [89, 76], [108, 79], [120, 56], [116, 36], [100, 28], [100, 93], [68, 108], [53, 185], [76, 148], [78, 199], [86, 248], [75, 319], [88, 311], [100, 209], [116, 250], [124, 319], [112, 309], [123, 200], [124, 148], [146, 185], [133, 108], [100, 93]];
  let seq = 0;

  /** FNV-1a 32비트 — 글자(코드포인트) 단위. */
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  /** 시드 난수(mulberry32) — 같은 시드 = 같은 수열. */
  function rand(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  /** 이름 → 색·박자(화면 밖에서도 같은 값이 필요할 때). */
  function look(name) { const seed = hash(name || ''); const h = 195 + seed % 65; return { seed, hue: h, color: `hsl(${h} 78% 75%)`, deep: `hsl(${h + 12} 48% 40%)`, phase: (seed % 4800) / 1000, dur: 4.4 + (seed >>> 8) % 10 / 10 }; }

  /**
   * 캐릭터 SVG 문자열.
   * @param {string} name 명찰 1줄(역할 이름). 빈 값이면 opts.placeholder.
   * @param {{sub?: string, empty?: boolean, placeholder?: string, label?: string}} opts sub = 명찰 2줄, empty = 「새 역할」(테두리만·점선)
   */
  function svg(name, opts = {}) {
    const shown = String(name || '').trim() || opts.placeholder || '';
    const L = look(opts.empty && !String(name || '').trim() ? '' : shown), r = rand(L.seed), c = L.color, id = `ps${++seq}`;
    const url = (n) => `url(#${id}-${n})`;
    const pts = POINTS.map(([x, y], i) => [x + (i > 7 ? (r() - .5) * 5 : 0), y + (i > 7 ? (r() - .5) * 5 : 0)].map(v => +v.toFixed(1)));
    let dust = ''; for (let n = 0; n < 34; n++) dust += `<circle cx="${(48 + r() * 104).toFixed(1)}" cy="${(96 + r() * 220).toFixed(1)}" r="${(.4 + r() * 1).toFixed(1)}" opacity="${(.25 + r() * .6).toFixed(2)}"/>`;
    const constellation = `<g stroke="${c}" fill="none" stroke-width=".8"><polyline points="${pts.map(p => p.join(',')).join(' ')}"/><path d="M68 108L123 200 78 199 133 108M78 199L116 250M123 200L86 248" opacity=".5"/></g><g fill="#e5f5ff" class="ps-amb">${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5"/>`).join('')}${dust}</g>`;
    const defs = `<linearGradient id="${id}-glass" x2="1" y2=".4"><stop stop-color="${c}" stop-opacity=".65"/><stop offset=".25" stop-color="${c}" stop-opacity=".07"/><stop offset=".7" stop-color="${L.deep}" stop-opacity=".18"/><stop offset="1" stop-color="${c}" stop-opacity=".65"/></linearGradient>`
      + `<pattern id="${id}-scan" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0H5" stroke="${c}" opacity=".35" stroke-width=".7"/></pattern>`
      + `<clipPath id="${id}-u"><path d="${UPPER}"/></clipPath><clipPath id="${id}-l"><path d="${LEFT}"/></clipPath><clipPath id="${id}-r"><path d="${RIGHT}"/></clipPath>`
      + `<g id="${id}-m">${opts.empty ? `<rect width="200" height="350" fill="${c}" opacity=".05"/>` : `<rect width="200" height="350" fill="${url('glass')}"/>${constellation}<rect width="200" height="350" fill="${url('scan')}"/>`}</g>`;
    const len = Array.from(shown).length || 1;
    const badge = `<g class="ps-badge"><path d="M90 96L95 126M110 96L105 126" fill="none" stroke="${c}" stroke-width="1.1" opacity=".7"/><rect x="59" y="127" width="84" height="37" rx="4" fill="#000" opacity=".25"/>`
      + `<rect class="ps-badge-bg" x="58" y="125" width="84" height="37" rx="3" stroke="${c}" stroke-width=".8"${opts.empty ? ' stroke-dasharray="3 2"' : ''}/><rect x="95" y="122" width="10" height="5" rx="1.3" fill="${c}"/>`
      + `<text class="ps-name${opts.empty && !String(name || '').trim() ? ' ph' : ''}" x="100" y="${opts.sub ? 141 : 147}" text-anchor="middle" font-size="${Math.min(12, 70 / len).toFixed(1)}">${esc(shown)}</text>`
      + (opts.sub ? `<path d="M66 146H134" class="ps-rule"/><text class="ps-sub" x="100" y="156" text-anchor="middle" font-size="6.2">${esc(opts.sub)}</text>` : '') + '</g>';
    const body = `<g class="ps-leg l" clip-path="${url('l')}"><use href="#${id}-m"/></g><g class="ps-leg r" clip-path="${url('r')}"><use href="#${id}-m"/></g><g clip-path="${url('u')}"><use href="#${id}-m"/></g>`
      + `<path class="ps-edge" d="${ALL}" stroke="${c}"${opts.empty ? ' stroke-dasharray="4 3"' : ''}/>`;
    return `<svg class="ps-svg" viewBox="0 0 200 360" role="img" aria-label="${esc(opts.label || shown)}" data-seed="${L.seed}" style="--ps-phase:-${L.phase.toFixed(2)}s;--ps-dur:${L.dur.toFixed(1)}s;--ps-c:${c}"><defs>${defs}</defs>`
      + `<ellipse cx="100" cy="332" rx="44" ry="5" fill="#000" opacity=".4"/>${opts.empty ? '' : `<ellipse class="ps-orbit" cx="100" cy="333" rx="65" ry="11" fill="none" stroke="${c}" opacity=".45"/><ellipse cx="100" cy="333" rx="48" ry="6" fill="${c}" opacity=".05"/>`}`
      + `<g class="ps-fwd"><g class="ps-turn"><g class="ps-breath">${body}${badge}</g></g></g></svg>`;
  }

  /** 명찰 글자가 넘치면 폭(72)에 맞춘다 — 그려진 뒤(글꼴 적용 뒤)에만 잴 수 있다. */
  function fit(root = document) {
    for (const t of root.querySelectorAll('.ps-name, .ps-sub')) {
      t.removeAttribute('textLength'); t.removeAttribute('lengthAdjust');
      let w = 0; try { w = t.getComputedTextLength(); } catch {}
      if (w > 72) { t.setAttribute('textLength', '72'); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
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

  return { svg, fit, watch, walkFrom, hash, look };
})();
