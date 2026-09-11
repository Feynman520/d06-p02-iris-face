// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 무대 애니메이션(캔버스 하나): 스타일 5종 + 없음. 설정에서 고른 하나만 돈다.
   - sphere: 별의 구(피보나치 구, 원근, 두 축 회전, 적도 띠)   - iris: 별의 홍채(차등 회전 고리, 동공 확장)
   - nebula: 성운(느린 흐름장)                                     - constellation: 별자리(가까운 별 잇기)
   - drift: 잔잔한 별밭(깜박임 + 아주 느린 흐름)                    - off: 끔
   공통: 처음 1.2초 모임 연출, 세션 작업 중 가속(energy), 대화 열리면 어두워짐(dim), 창 숨김 시 정지, 밀도 설정, reduced-motion 시 정지 화면. */
// makeEngine(): 캔버스 하나를 맡는 독립 엔진. 무대용 1개 + 설정 패널 미리보기용 여러 개.
function makeStarEngine() {
  let canvas, ctx, W, H, dpr = 1, raf = 0, pts = [], t0 = 0, mouse = { x: 0.5, y: 0.5 }, energy = 0, targetEnergy = 0, dim = 0, targetDim = 0, ro = null, interactive = true, onMove = null, onVis = null;
  let style = 'sphere', density = 1, pauseWhenDim = false, colors = { a: '232,236,255', b: '160,178,255', c: '206,190,255', glow: '122,140,255' };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  // 색 문자열은 캐시에서 꺼낸다(알파 1/100 단위 양자화, 색 3종 × 101 = 최대 303개). 매 프레임 별마다 새 `rgba(...)` 문자열을 만들면
  // 크로미엄이 fillStyle에 넣은 문자열을 외부 문자열로 등록해 표가 수만 개로 불고, 주요 GC마다 그 표를 비우느라 30~45ms씩 멈춘다(2026-09-10 실측 — 끊김의 원인).
  const colCache = new Map();
  const col = (p, al) => {
    const a = Math.round(Math.max(0, Math.min(1, al)) * 100), key = (p.hue < 0.7 ? 0 : p.hue < 0.9 ? 1 : 2) * 128 + a;
    let s = colCache.get(key);
    if (s === undefined) { s = `rgba(${p.hue < 0.7 ? colors.a : p.hue < 0.9 ? colors.b : colors.c},${a / 100})`; colCache.set(key, s); }
    return s;
  };

  // ---- 서명(2026-09-10 각인): 별들이 잠시 글자 모양으로 모였다가 제자리로. 별 개수·스타일은 손대지 않고 그리는 자리만 섞는다. ----
  const SIG = { in: 1.6, hold: 2.5, out: 1.2 }; // 초
  let sig = null, sigK = 0; const maskCache = new Map();
  // 별 글자의 치수 한 곳: 글자 크기·가운데(x는 자간 뒤 여백만큼 보정해 눈에 보이는 가운데가 W/2)·세로 중심·글자 아랫선(문장을 그 아래에 놓을 때 씀)
  function sigMetrics() {
    const size = Math.max(24, Math.min(W * 0.115, H * 0.28)), cy = H / 2 - Math.min(56, H * 0.08);
    return { size, cx: W / 2 + size * 0.09, cy, bottom: cy + size * 0.4 };
  }
  function maskPoints(text) {
    const key = `${text}|${W}|${H}`; if (maskCache.has(key)) return maskCache.get(key);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const { size, cx, cy } = sigMetrics();
    g.font = `600 ${size}px "Segoe UI Variable Display","Segoe UI","Malgun Gothic",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    try { g.letterSpacing = `${Math.round(size * 0.18)}px`; } catch {}
    g.fillStyle = '#fff'; g.fillText(text, cx, cy);
    const d = g.getImageData(0, 0, W, H).data, out = []; const step = Math.max(2, Math.round(size / 26));
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (d[(y * W + x) * 4 + 3] > 128) out.push([x, y]);
    maskCache.set(key, out); return out;
  }
  /** 글자 서명 시작. 별이 글자를 만들 수 없는 경우(끔·별자리·움직임 줄이기·별 없음)는 false — 호출한 쪽이 글자만 보여 준다. */
  function signature(text) {
    if (reduce || style === 'off' || style === 'constellation' || !pts.length || !W || !H) return false;
    const m = maskPoints(text); if (m.length < 40) return false;
    for (let i = m.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [m[i], m[j]] = [m[j], m[i]]; } // 섞어서 별↔글자점 짝을 고르게
    pts.forEach((p, i) => { const [x, y] = m[i % m.length]; p.tx = x + (Math.random() - 0.5) * 2.2; p.ty = y + (Math.random() - 0.5) * 2.2; });
    sig = { t: performance.now() }; kick();
    return { in: SIG.in * 1000, hold: SIG.hold * 1000, out: SIG.out * 1000, bottom: sigMetrics().bottom }; // bottom = 별 글자 아랫선(px, 캔버스 기준)
  }
  const bl = (p, x, y) => (sigK && p.tx != null) ? [x + (p.tx - x) * sigK, y + (p.ty - y) * sigK] : [x, y]; // 서명 중 창 크기가 바뀌어 별이 새로 생기면(tx 없음) 그냥 제자리

  function make() {
    pts = [];
    const base = Math.floor((W * H) / 380);
    const n = Math.round(Math.min(3200, Math.max(900, base)) * density);
    const golden = Math.PI * (3 - Math.sqrt(5));
    if (style === 'sphere') for (let i = 0; i < n; i++) {
      const k = Math.random(); const rr = k < 0.70 ? 0.96 + Math.random() * 0.06 : k < 0.95 ? 0.35 + Math.random() * 0.6 : 1.2 + Math.random() * 0.5;
      const y = 1 - (i / (n - 1)) * 2; const rad = Math.sqrt(1 - y * y); const th = golden * i + Math.random() * 0.3; const band = Math.abs(y) < 0.18 && Math.random() < 0.5;
      pts.push({ x: Math.cos(th) * rad * rr, y: y * rr, z: Math.sin(th) * rad * rr, size: band ? 1.4 + Math.random() * 1.2 : (Math.random() < 0.1 ? 1.6 + Math.random() : 0.5 + Math.random() * 0.9), ph: Math.random() * 6.283, tw: 0.5 + Math.random() * 1.5, hue: Math.random(), band, sx: (Math.random() - 0.5) * 2, sy: (Math.random() - 0.5) * 2 });
    }
    else if (style === 'iris') for (let i = 0; i < n; i++) {
      let r = 0.34 + Math.pow(Math.random(), 0.65) * 0.66; if (Math.random() < 0.06) r = 1.05 + Math.random() * 0.5;
      pts.push({ a: Math.random() * 6.283, r, size: Math.random() < 0.08 ? 1.6 + Math.random() * 1.2 : 0.5 + Math.random() * 0.9, ph: Math.random() * 6.283, tw: 0.4 + Math.random() * 1.2, hue: Math.random(), sx: (Math.random() - 0.5) * 2, sy: (Math.random() - 0.5) * 2 });
    }
    else if (style === 'nebula' || style === 'drift') for (let i = 0; i < (style === 'drift' ? Math.round(n * 0.5) : n); i++) {
      pts.push({ x: Math.random(), y: Math.random(), size: Math.random() < 0.06 ? 1.6 + Math.random() * 1.4 : 0.4 + Math.random() * 1.1, ph: Math.random() * 6.283, tw: 0.3 + Math.random() * 1.4, hue: Math.random(), sp: 0.4 + Math.random() * 0.8 });
    }
    else if (style === 'constellation') for (let i = 0; i < Math.round(120 * density); i++) {
      pts.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.012, vy: (Math.random() - 0.5) * 0.012, size: 1 + Math.random() * 1.6, ph: Math.random() * 6.283, tw: 0.5 + Math.random(), hue: Math.random() });
    }
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    make();
  }
  function glow(cx, cy, R, k) {
    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.3);
    g.addColorStop(0, `rgba(${colors.glow},${0.09 * k})`); g.addColorStop(0.6, `rgba(${colors.glow},${0.03 * k})`); g.addColorStop(1, `rgba(${colors.glow},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function frame(now) {
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;
    const gather = reduce ? 1 : ease(Math.min(1, t / 1.2));
    energy += (targetEnergy - energy) * 0.03; dim += (targetDim - dim) * 0.06;
    if (sig) { const e = (now - sig.t) / 1000; sigK = e < SIG.in ? ease(e / SIG.in) : e < SIG.in + SIG.hold ? 1 : e < SIG.in + SIG.hold + SIG.out ? 1 - ease((e - SIG.in - SIG.hold) / SIG.out) : 0; if (e >= SIG.in + SIG.hold + SIG.out) sig = null; } else sigK = 0;
    const cx = W / 2, cy = H / 2 - Math.min(56, H * 0.08), R = Math.min(W, H) * 0.30, k = 1 - dim * 0.8, alphaMul = 1 - dim * 0.72; // 작은 미리보기 캔버스에서도 중심이 보이게
    ctx.clearRect(0, 0, W, H);
    if (style === 'off') { raf = 0; return; }
    if (style === 'sphere') {
      glow(cx, cy, R, k);
      const speed = reduce ? 0 : 0.22 + energy * 0.35, ay = t * speed, ax = 0.42 + (mouse.y - 0.5) * 0.5 + Math.sin(t * 0.17) * 0.08, az = (mouse.x - 0.5) * 0.35;
      const cy1 = Math.cos(ay), sy1 = Math.sin(ay), cx1 = Math.cos(ax), sx1 = Math.sin(ax), cz1 = Math.cos(az), sz1 = Math.sin(az), fov = 2.6;
      const drawn = [];
      for (const p of pts) {
        const extra = p.band ? t * 0.35 : 0, c2 = Math.cos(extra), s2 = Math.sin(extra);
        const x = p.x * c2 - p.z * s2, z = p.x * s2 + p.z * c2, y = p.y;
        const x1 = x * cy1 - z * sy1, z1 = x * sy1 + z * cy1, y2 = y * cx1 - z1 * sx1, z2 = y * sx1 + z1 * cx1, x3 = x1 * cz1 - y2 * sz1, y3 = x1 * sz1 + y2 * cz1;
        const depth = fov / (fov - z2); drawn.push([p, cx + x3 * R * depth, cy + y3 * R * depth, depth, z2]);
      }
      drawn.sort((a, b) => a[4] - b[4]);
      for (const [p, ix, iy, depth, z2] of drawn) {
        const [x, y] = bl(p, gather === 1 ? ix : ix + p.sx * W * 0.5 * (1 - gather), gather === 1 ? iy : iy + p.sy * H * 0.5 * (1 - gather));
        const near = (z2 + 1.2) / 2.4, tw = reduce ? 0.85 : 0.65 + 0.35 * Math.sin(t * p.tw + p.ph);
        ctx.fillStyle = col(p, Math.max((0.12 + 0.75 * near) * tw, 0.8 * sigK) * alphaMul * (0.5 + 0.5 * gather));
        ctx.beginPath(); ctx.arc(x, y, p.size * (0.55 + 0.75 * depth), 0, 6.283); ctx.fill();
      }
    } else if (style === 'iris') {
      const Ri = Math.min(W, H) * 0.27; glow(cx, cy, Ri, k);
      const dx = mouse.x * W - cx, dy = mouse.y * H - cy, md = Math.hypot(dx, dy); const dilate = md < Ri * 1.3 ? 0.06 * (1 - md / (Ri * 1.3)) : 0;
      const speed = reduce ? 0 : 0.035 + energy * 0.09;
      for (const p of pts) {
        const rr = p.r < 1.02 ? p.r + dilate * (1 - p.r) : p.r, a = p.a + t * speed * (1.6 - Math.min(1, rr)) + Math.sin(t * 0.25 + p.ph) * 0.012;
        const ix = cx + Math.cos(a) * rr * Ri, iy = cy + Math.sin(a) * rr * Ri;
        const [x, y] = bl(p, gather === 1 ? ix : ix + p.sx * W * 0.5 * (1 - gather), gather === 1 ? iy : iy + p.sy * H * 0.5 * (1 - gather));
        const tw = reduce ? 0.8 : 0.62 + 0.38 * Math.sin(t * p.tw + p.ph);
        ctx.fillStyle = col(p, Math.max((0.32 + 0.55 * tw) * (rr < 1.02 ? 1 : 0.55), 0.85 * sigK) * alphaMul * (0.55 + 0.45 * gather));
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, 6.283); ctx.fill();
      }
    } else if (style === 'nebula' || style === 'drift') {
      glow(cx, cy, R, k * (style === 'nebula' ? 1.4 : 0.6));
      const flow = style === 'nebula' ? 0.06 + energy * 0.1 : 0.008 + energy * 0.02;
      for (const p of pts) {
        // 흐름장: 사인파 두 개를 합친 소용돌이
        const fx = Math.sin(p.y * 6.283 * 1.3 + t * 0.2) + Math.cos(p.x * 6.283 * 0.7 - t * 0.13), fy = Math.cos(p.x * 6.283 * 1.1 + t * 0.17) - Math.sin(p.y * 6.283 * 0.9 + t * 0.11);
        if (!reduce) { p.x = (p.x + fx * flow * p.sp * 0.0016 + 1) % 1; p.y = (p.y + fy * flow * p.sp * 0.0016 + 1) % 1; }
        const tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(t * p.tw + p.ph);
        const [x, y] = bl(p, p.x * W, p.y * H);
        ctx.fillStyle = col(p, Math.max((style === 'nebula' ? 0.5 : 0.7) * tw, 0.85 * sigK) * alphaMul * gather);
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, 6.283); ctx.fill();
      }
    } else if (style === 'constellation') {
      glow(cx, cy, R, k * 0.7);
      const sp = reduce ? 0 : (0.6 + energy * 1.2);
      for (const p of pts) { p.x += p.vx * sp * 0.016; p.y += p.vy * sp * 0.016; if (p.x < 0 || p.x > 1) p.vx *= -1; if (p.y < 0 || p.y > 1) p.vy *= -1; }
      const link = Math.max(40, Math.min(W, H) * 0.16);
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = (pts[i].x - pts[j].x) * W, dy = (pts[i].y - pts[j].y) * H; const d2 = dx * dx + dy * dy;
        if (d2 < link * link) { ctx.strokeStyle = `rgba(${colors.b},${(1 - Math.sqrt(d2) / link) * 0.35 * alphaMul})`; ctx.beginPath(); ctx.moveTo(pts[i].x * W, pts[i].y * H); ctx.lineTo(pts[j].x * W, pts[j].y * H); ctx.stroke(); }
      }
      for (const p of pts) { const tw = reduce ? 0.9 : 0.7 + 0.3 * Math.sin(t * p.tw + p.ph); ctx.fillStyle = col(p, 0.9 * tw * alphaMul * gather); ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.size, 0, 6.283); ctx.fill(); }
    }
    if (reduce || (pauseWhenDim && targetDim && dim > 0.98)) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };
  function mount(el, opts = {}) {
    canvas = el; ctx = canvas.getContext('2d', { alpha: true }); interactive = opts.interactive !== false;
    resize(); ro = new ResizeObserver(() => { resize(); kick(); }); ro.observe(canvas);
    if (interactive) { onMove = (e) => { const b = canvas.getBoundingClientRect(); mouse.x = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)); mouse.y = Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)); }; window.addEventListener('pointermove', onMove); }
    onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else kick(); }; document.addEventListener('visibilitychange', onVis);
    kick();
  }
  function destroy() { cancelAnimationFrame(raf); raf = 0; ro?.disconnect(); if (onMove) window.removeEventListener('pointermove', onMove); if (onVis) document.removeEventListener('visibilitychange', onVis); pts = []; }
  function configure(o = {}) {
    if (o.style && o.style !== style) { style = o.style; make(); t0 = 0; }
    if (o.density && o.density !== density) { density = o.density; make(); }
    if (typeof o.pauseWhenDim === 'boolean') pauseWhenDim = o.pauseWhenDim;
    if (o.colors) { colors = { ...colors, ...o.colors }; colCache.clear(); }
    kick();
  }
  return { mount, destroy, configure, signature, setEnergy: (v) => { targetEnergy = Math.max(0, Math.min(1, v)); kick(); }, setDim: (v) => { targetDim = v ? 1 : 0; kick(); } };
}
window.IrisStars = (() => {
  const main = makeStarEngine();
  return {
    mount: (el) => main.mount(el), configure: (o) => main.configure(o), setEnergy: (v) => main.setEnergy(v), setDim: (v) => main.setDim(v),
    /** 서명 이스터에그: 별들이 text 모양으로 모였다가 흩어진다. 못 하면 false(호출한 쪽이 글자로 대신). */
    signature: (text) => main.signature(text),
    /** 설정 패널 미리보기: 작은 캔버스에 스타일 하나를 가볍게(별 적게) 돌린다. 닫을 때 destroy() */
    preview(el, opts) { const e = makeStarEngine(); e.mount(el, { interactive: false }); e.configure({ density: 0.2, ...opts }); return e; },
  };
})();
