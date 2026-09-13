// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 무대 애니메이션(캔버스 하나): 스타일 5종 + 없음. 설정에서 고른 하나만 돈다.
   - sphere: 별의 구(피보나치 구, 원근, 두 축 회전, 적도 띠)   - iris: 별의 홍채(차등 회전 고리, 동공 확장)
   - nebula: 성운(느린 흐름장)                                     - constellation: 별자리(가까운 별 잇기)
   - drift: 잔잔한 별밭(깜박임 + 아주 느린 흐름)                    - off: 끔
   2026-09-11 추가 5종(사용자 요청 "창의적인 것"): galaxy 은하(기울어진 나선팔 회전) · warp 워프(정면에서 흘러나오는 별, 작업 중엔 줄무늬 초공간)
   · aurora 오로라(물결치는 빛의 커튼) · helix 이중나선(두 가닥 + 가로대 회전) · fireflies 반딧불(배회 + 쿠라모토 동기화로 점점 함께 깜박임).
   고른 한 종만 돌고 나머지는 코드 갈래일 뿐이라 종 수가 늘어도 성능 부담은 없다.
   공통: 처음 1.2초 모임 연출, 세션 작업 중 가속(energy), 대화 열리면 어두워짐(dim), 창 숨김 시 정지, 밀도 설정, reduced-motion 시 정지 화면.
   자동 조절(2026-09-12, 발열 사건 후): 별 수가 곧 비용이다(밀도 160% = 비용 2배, 무대 종류는 무관 — headless 실측). 그래서
   - 컴퓨터별 상한 밀도(cap): 매 프레임 그리기에 걸린 시간을 재서 예산(60fps 기준 4ms)을 넘으면 0.1씩 내리고, 20초 넉넉하면 0.1씩 올린다. 실제 별 수 = min(사용자 밀도, cap).
     별 배열은 사용자 밀도로 만들어 섞어 두고 앞에서 live개만 그린다 → cap이 바뀌어도 별 자리가 통째로 다시 뽑히지 않는다. cap은 localStorage에 기억(컴퓨터마다 다름).
   - 프레임 상한(fpsCap): 창이 포커스를 잃으면 10fps, 배터리로 돌면 30fps, 평소 60fps. 상한 아래 프레임은 그리지 않고 건너뛴다.
   - 안 보이면 쉬기: 창 숨김(기존) + 대화 화면이 열려 어두워진 뒤(pauseWhenDim, 기본 켬) 정지. 미리보기 엔진(interactive=false)은 조절하지 않는다.
   프레임·해상도 프로필(2026-09-13, v2.51 — 실측: 비용의 대부분은 JS 그리기 시간이 아니라 GPU 합성 = 캔버스 화소 수 × 초당 프레임):
   - profile.fps(60·30·20) = 이 컴퓨터의 평소 프레임 상한, profile.dprCap = 캔버스 해상도 상한(1 = 화면 배율이 150%여도 캔버스는 100% 화소, 기본값).
   - calibrate(): Electron 메인의 프로세스 지표(irisHost.metrics → app.getAppMetrics: GPU 프로세스·렌더러 CPU%)로 "안 그릴 때" 기준선을 재고
     후보 프로필(좋은 순)을 2초씩 돌려 추가 부담이 예산(한 코어의 15%) 안에 드는 첫 프로필을 고른다. 결과·추천(별 양·대화 중 멈춤)은 cap 기록에 함께 저장.
   - 대화 화면(어두움)에서 멈추지 않기로 했으면 20fps(알파 28%의 별은 20fps 로도 매끈). 중심 빛무리(glow)는 1.3R 원만 채운다(밖은 알파 0 — 그림 같고 화소 1/8). */
// makeEngine(): 캔버스 하나를 맡는 독립 엔진. 무대용 1개 + 설정 패널 미리보기용 여러 개.
function makeStarEngine() {
  let canvas, ctx, W, H, dpr = 1, raf = 0, pts = [], all = [], t0 = 0, mouse = { x: 0.5, y: 0.5 }, energy = 0, targetEnergy = 0, dim = 0, targetDim = 0, ro = null, interactive = true, onMove = null, onVis = null, onFocus = null, onBlur = null, battery = null, onCharge = null;
  let style = 'sphere', density = 1, pauseWhenDim = false, colors = { a: '232,236,255', b: '160,178,255', c: '206,190,255', glow: '122,140,255' };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ---- 자동 조절 상태 ----
  const CAP_KEY = 'iris.stage.cap', CAP_MIN = 0.3, CAP_MAX = 1.6;
  let gov = { budgetMs: 4, windowMs: 2000, upAfterMs: 20000, dropRatio: 0.15, calibBudget: 15, calibWindowMs: 2000, calibSettleMs: 400 }, govern = false, cap = CAP_MAX, slow = false, fpsCap = 60, focused = true, onBattery = false;
  let acc = { t: 0, n: 0, drops: 0, at: 0 }, lastNow = 0, lastDraw = 0, goodSince = 0, lastCost = 0, lastFps = 0;
  const r1 = (v) => Math.round(v * 10) / 10;
  const SLOW_AT = 0.5; // 별을 이만큼까지 줄여도 무거우면 그다음 수단은 30fps(slow), 그래도 무거우면 별을 더 줄인다(CAP_MIN까지). 올라갈 땐 반대 순서.
  // ---- 프레임·해상도 프로필(v2.51) ----
  const DIM_FPS = 20, PROFILES = [{ fps: 60, dprCap: 1 }, { fps: 30, dprCap: 1 }, { fps: 20, dprCap: 1 }]; // 좋은 순. 해상도는 100%(dprCap 1) 고정 — 부드러움은 fps 만이 정하고, 원본 해상도는 화소 2.25배에 눈에 띄는 차이가 없다(2026-09-13 사용자 결정 "fps만 보여주자"). dprCap 2 는 검사·수동용으로만 남김
  let profile = { fps: 60, dprCap: 1 }, rec = null, calib = null; // calib = 측정 중 {step,total,hold,fps}
  const nativeDpr = () => Math.min(2, window.devicePixelRatio || 1);
  // 지표 통로는 "함수가 있다"만으로 믿지 않는다 — F5 만 하면 새 preload(metrics 있음)가 옛 메인(핸들러 없음) 위에서 돌아 invoke 가 거부된다(2026-09-13 실증). mount 때 한 번 실제로 불러 본다.
  let metricsOk = null; // null = 아직 모름
  const metricsApi = () => (metricsOk !== false && typeof window.irisHost?.metrics === 'function' ? window.irisHost.metrics : null);
  async function probeMetrics() {
    const f = typeof window.irisHost?.metrics === 'function' ? window.irisHost.metrics : null;
    if (!f) { metricsOk = false; return false; }
    try { const r = await f(); metricsOk = Array.isArray(r) && r.length > 0; } catch { metricsOk = false; }
    emit(); return metricsOk;
  }
  function loadCap() {
    try {
      const s = JSON.parse(localStorage.getItem(CAP_KEY) || 'null'); if (!s) return;
      if (s.cap >= CAP_MIN && s.cap <= CAP_MAX) { cap = s.cap; slow = !!s.slow; }
      if ([60, 30, 20].includes(s.fps)) profile = { fps: s.fps, dprCap: s.dprCap === 2 ? 2 : 1 };
      if (s.rec && typeof s.rec === 'object') rec = s.rec;
    } catch {}
  }
  function saveCap() { try { localStorage.setItem(CAP_KEY, JSON.stringify({ cap, slow, fps: profile.fps, dprCap: profile.dprCap, rec, at: new Date().toISOString() })); } catch {} }
  const liveCount = () => govern ? Math.round(all.length * Math.min(1, cap / density)) : all.length;
  function applyLive() { const n = liveCount(); if (pts.length !== n || pts[0] !== all[0]) pts = all.slice(0, n); }
  function status() {
    return { cap, slow, density, live: pts.length, total: all.length, fpsCap, focused, onBattery, lastCost: r1(lastCost), lastFps: Math.round(lastFps), govern,
      fps: profile.fps, dprCap: profile.dprCap, dpr, nativeDpr: nativeDpr(), rec, calib: calib ? { step: calib.step, total: calib.total } : null, precise: !!metricsApi(), pauseWhenDim, dim: !!targetDim };
  }
  function emit() { if (govern) try { document.dispatchEvent(new CustomEvent('iris:stage', { detail: status() })); } catch {} }
  function updateFps() {
    let v = !focused ? 10 : Math.min(profile.fps, (onBattery || slow) ? 30 : 60);
    if (calib) v = calib.fps; // 측정 중엔 후보 프로필의 프레임을 그대로(포커스·어두움 무시)
    else if (focused && targetDim && !pauseWhenDim) v = Math.min(v, DIM_FPS); // 대화 화면에서 계속 돌리기로 했으면 느리게
    if (v !== fpsCap) { fpsCap = v; acc = { t: 0, n: 0, drops: 0, at: 0 }; goodSince = 0; emit(); }
  }
  // 한 단계 내림: cap을 0.1씩(사용자 밀도 아래부터) → SLOW_AT에 닿으면 30fps → 그다음 CAP_MIN까지. 바뀐 게 있으면 true.
  function stepDown() {
    const eff = Math.min(cap, density);
    if (eff > SLOW_AT || slow) { const next = Math.max(CAP_MIN, r1(eff - 0.1)); if (next === cap) return false; cap = next; }
    else slow = true;
    saveCap(); applyLive(); updateFps(); return true;
  }
  // 한 단계 올림(내림의 역순): CAP_MIN~SLOW_AT 사이면 cap 먼저 → SLOW_AT에서 slow 해제 → 사용자 밀도까지 cap. 바뀐 게 있으면 true.
  function stepUp() {
    if (cap >= density && !slow) return false;
    if (slow && cap >= SLOW_AT) slow = false;
    else cap = Math.min(CAP_MAX, r1(cap + 0.1));
    saveCap(); applyLive(); updateFps(); return true;
  }
  // 한 프레임의 비용(ms)과 시각을 받아 2초 창마다 판정. fpsCap<30(포커스 잃음)일 때는 표본이 대표성이 없어 재지 않는다.
  function govSample(cost, now) {
    lastCost = cost;
    if (!govern || fpsCap < 30 || reduce) return;
    if (!acc.at) acc.at = now;
    acc.t += cost; acc.n++;
    if (lastNow && now - lastNow > 2.5 * (1000 / fpsCap)) acc.drops++;
    lastNow = now;
    if (now - acc.at < gov.windowMs || acc.n < 10) return; // 창이 차고 표본이 10개는 돼야 판정(아주 느린 컴퓨터는 창이 길어질 뿐 판정은 한다)
    const avg = acc.t / acc.n, drops = acc.drops / acc.n, budget = gov.budgetMs * 60 / fpsCap; lastFps = acc.n / ((now - acc.at) / 1000);
    acc = { t: 0, n: 0, drops: 0, at: now };
    if (avg > budget || drops > gov.dropRatio) { stepDown(); goodSince = 0; emit(); } // 무겁다: 한 단계 내림
    else if (avg < budget * 0.6 && drops < 0.03) { // 넉넉하다: 20초 이어지면 한 단계 올림
      if (!goodSince) goodSince = now;
      else if (now - goodSince >= gov.upAfterMs) { goodSince = now; stepUp(); }
      emit();
    } else { goodSince = 0; emit(); }
  }
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
    if (reduce || style === 'off' || style === 'constellation' || style === 'fireflies' || !pts.length || !W || !H) return false; // 별이 적은 종(별자리·반딧불)은 글자를 못 만든다
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
    else if (style === 'galaxy') for (let i = 0; i < n; i++) {
      // 나선팔 3개: 반지름 r(중심 쪽이 빽빽) + 로그 나선 각 + 팔에서 벗어나는 흩어짐(바깥일수록 큼). 핵(r<0.14)은 팔 없이 둥글게.
      const core = Math.random() < 0.18; const r = core ? Math.pow(Math.random(), 1.6) * 0.16 : 0.12 + Math.pow(Math.random(), 0.8) * 0.95;
      const arm = (i % 3) * 2.0944, th = core ? Math.random() * 6.283 : arm + Math.log(1 + r * 6) * 2.4 + (Math.random() - 0.5) * (0.25 + r * 0.9);
      pts.push({ x: Math.cos(th) * r, z: Math.sin(th) * r, y: (Math.random() - 0.5) * (core ? 0.12 : 0.05) * (1 - r * 0.5), r, core, size: core ? 0.6 + Math.random() * 1.2 : (Math.random() < 0.08 ? 1.5 + Math.random() : 0.45 + Math.random() * 0.9), ph: Math.random() * 6.283, tw: 0.4 + Math.random() * 1.3, hue: Math.random(), sx: (Math.random() - 0.5) * 2, sy: (Math.random() - 0.5) * 2 });
    }
    else if (style === 'warp') for (let i = 0; i < Math.round(n * 0.6); i++) {
      pts.push({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: 0.05 + Math.random() * 0.95, size: 0.5 + Math.random() * 1.2, hue: Math.random(), ph: Math.random() * 6.283, tw: 1 });
    }
    else if (style === 'aurora') for (let i = 0; i < n; i++) {
      // 커튼 3장: u = 가로 위치, v = 커튼 안 세로 위치(0 위쪽 밝음 → 1 아래 흐림), c = 몇 번째 커튼
      pts.push({ u: Math.random(), v: Math.pow(Math.random(), 0.7), c: i % 3, size: 0.4 + Math.random() * 1.1, ph: Math.random() * 6.283, tw: 0.3 + Math.random() * 1.2, hue: Math.random(), sp: 0.5 + Math.random() });
    }
    else if (style === 'helix') for (let i = 0; i < Math.round(n * 0.55); i++) {
      // s = 축을 따라 0~1, kind 0·1 = 두 가닥, 2 = 가로대(f = 가닥 사이 위치)
      const kind = Math.random() < 0.72 ? (i % 2) : 2;
      pts.push({ s: Math.random(), kind, f: Math.random(), size: kind === 2 ? 0.4 + Math.random() * 0.7 : 0.7 + Math.random() * 1.2, ph: Math.random() * 6.283, tw: 0.4 + Math.random() * 1.2, hue: Math.random(), sx: (Math.random() - 0.5) * 2, sy: (Math.random() - 0.5) * 2 });
    }
    else if (style === 'fireflies') for (let i = 0; i < Math.round(160 * density); i++) {
      // 저마다 고유 박자(w)로 깜박이다가 쿠라모토 결합(frame)으로 점점 함께 깜박인다. 배회는 느린 방향 잡음.
      pts.push({ x: Math.random(), y: Math.random(), h: Math.random() * 6.283, phi: Math.random() * 6.283, w: 1.6 + Math.random() * 0.8, size: 1.2 + Math.random() * 1.3, hue: Math.random(), ph: Math.random() * 6.283, tw: 1 });
    }
    // 섞어 두면 앞에서 live개만 그려도 고른 부분집합이 된다(구는 i 순서가 위→아래라 섞지 않으면 윗부분만 남는다). 종별 배정(i%3 등)은 생성 때 끝났다.
    all = pts; for (let i = all.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [all[i], all[j]] = [all[j], all[i]]; }
    pts = []; applyLive();
  }
  function resize() {
    dpr = govern ? Math.min(nativeDpr(), profile.dprCap) : nativeDpr(); // 무대 캔버스는 프로필의 해상도 상한을 따른다(미리보기는 원본)
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    make();
  }
  function glow(cx, cy, R, k) {
    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.3);
    g.addColorStop(0, `rgba(${colors.glow},${0.09 * k})`); g.addColorStop(0.6, `rgba(${colors.glow},${0.03 * k})`); g.addColorStop(1, `rgba(${colors.glow},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.3, 0, 6.283); ctx.fill(); // 1.3R 밖은 알파 0 — 전체 fillRect 와 같은 그림을 화소 1/8로(2026-09-13)
  }
  function frame(now) {
    if (fpsCap < 60 && now - lastDraw < 1000 / fpsCap - 2) { raf = requestAnimationFrame(frame); return; } // 프레임 상한: 아직 차례가 아니면 건너뜀(그리기 0)
    lastDraw = now; const t1 = performance.now();
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
    } else if (style === 'galaxy') {
      // 은하: 원반을 y축으로 회전(작업 중 가속) → x축으로 기울임(마우스 세로로 살짝 조절) → 원근. 핵은 항상 밝고 팔은 바깥일수록 흐리다.
      glow(cx, cy, R * 0.55, k * 1.3);
      const speed = reduce ? 0 : 0.12 + energy * 0.28, ay = t * speed, ax = 1.05 + (mouse.y - 0.5) * 0.35, az = (mouse.x - 0.5) * 0.2;
      const cy1 = Math.cos(ay), sy1 = Math.sin(ay), cx1 = Math.cos(ax), sx1 = Math.sin(ax), cz1 = Math.cos(az), sz1 = Math.sin(az), fov = 3.2, Rg = R * 1.35;
      for (const p of pts) {
        const x1 = p.x * cy1 - p.z * sy1, z1 = p.x * sy1 + p.z * cy1, y2 = p.y * cx1 - z1 * sx1, z2 = p.y * sx1 + z1 * cx1, x3 = x1 * cz1 - y2 * sz1, y3 = x1 * sz1 + y2 * cz1;
        const depth = fov / (fov - z2), ix = cx + x3 * Rg * depth, iy = cy + y3 * Rg * depth;
        const [x, y] = bl(p, gather === 1 ? ix : ix + p.sx * W * 0.5 * (1 - gather), gather === 1 ? iy : iy + p.sy * H * 0.5 * (1 - gather));
        const tw = reduce ? 0.85 : 0.65 + 0.35 * Math.sin(t * p.tw + p.ph), base = p.core ? 0.9 : 0.75 - p.r * 0.45;
        ctx.fillStyle = col(p, Math.max(base * tw, 0.8 * sigK) * alphaMul * (0.5 + 0.5 * gather));
        ctx.beginPath(); ctx.arc(x, y, p.size * (0.6 + 0.6 * depth), 0, 6.283); ctx.fill();
      }
    } else if (style === 'warp') {
      // 워프: z가 줄며 다가오는 별을 원근 투영. energy 가 오르면 속도가 붙고 별이 줄(이전 위치→지금 위치)이 되어 초공간처럼 쏟아진다.
      glow(cx, cy, R * 0.8, k * 0.7);
      const vx = (mouse.x - 0.5) * 0.25, vy = (mouse.y - 0.5) * 0.25, speed = reduce ? 0 : 0.0035 + energy * 0.022, streak = Math.max(0, energy - 0.12) / 0.88, F = Math.min(W, H) * 0.5;
      ctx.lineCap = 'round';
      for (const p of pts) {
        const zPrev = p.z; if (!reduce) { p.z -= speed * (0.7 + 0.6 * ((p.ph / 6.283) % 1)); if (p.z <= 0.04) { p.z = 1; p.x = (Math.random() - 0.5) * 2; p.y = (Math.random() - 0.5) * 2; } }
        const px = p.x - vx, py = p.y - vy, ix = cx + px / p.z * F, iy = cy + py / p.z * F;
        if (ix < -20 || ix > W + 20 || iy < -20 || iy > H + 20) continue;
        const near = 1 - p.z, tw = reduce ? 0.85 : 0.75 + 0.25 * Math.sin(t * 2 + p.ph);
        const [x, y] = bl(p, ix, iy), a = Math.max((0.15 + 0.85 * near) * tw, 0.8 * sigK) * alphaMul * gather, sz = p.size * (0.4 + 1.6 * near);
        if (streak > 0.02 && p.z < zPrev && !sigK) { // 줄: 이전 z 자리에서 지금까지, 길이는 속도·가까움에 비례
          const zb = Math.min(1, p.z + (zPrev - p.z) * (1 + 18 * streak)), bx = cx + px / zb * F, by = cy + py / zb * F;
          ctx.strokeStyle = col(p, a * 0.7); ctx.lineWidth = sz; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke();
        }
        ctx.fillStyle = col(p, a); ctx.beginPath(); ctx.arc(x, y, sz, 0, 6.283); ctx.fill();
      }
    } else if (style === 'aurora') {
      // 오로라: 커튼 3장. 윗선은 느린 파도, 커튼 길이는 다른 파도로 숨쉬듯 늘고 줄며, 별은 커튼 안에서 위(밝음)→아래(흐림)로 결을 이룬다. 가로로 천천히 흐른다.
      glow(cx, cy, R, k * 0.5);
      const flow = reduce ? 0 : 0.004 + energy * 0.012, amp = 1 + energy * 0.8;
      for (const p of pts) {
        if (!reduce) p.u = (p.u + flow * p.sp * 0.016 * (p.c === 1 ? -1 : 1) + 1) % 1;
        const u = p.u * 6.283, top = H * (0.22 + 0.16 * p.c) + Math.sin(u * 1.4 + t * 0.25 + p.c * 2.1) * H * 0.07 * amp + Math.sin(u * 3.1 - t * 0.4) * H * 0.02 * amp;
        const len = H * 0.26 * (0.55 + 0.45 * Math.sin(u * 2.3 + t * 0.55 * amp + p.c * 1.7 + p.ph * 0.15));
        const ix = p.u * W, iy = top + p.v * len;
        const [x, y] = bl(p, ix, gather === 1 ? iy : iy + (1 - gather) * H * 0.6);
        const tw = reduce ? 0.85 : 0.6 + 0.4 * Math.sin(t * p.tw + p.ph);
        ctx.fillStyle = col(p, Math.max((0.28 + 0.7 * (1 - p.v)) * tw, 0.85 * sigK) * alphaMul * gather);
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, 6.283); ctx.fill();
      }
    } else if (style === 'helix') {
      // 이중나선: 세로 축을 따라 두 가닥이 반 바퀴 어긋나 감기고, 가로대는 두 가닥 사이를 잇는다. 앞쪽(깊이 sin>0)이 크고 밝다. 마우스 가로로 살짝 기울임.
      glow(cx, cy, R * 0.9, k * 0.8);
      const speed = reduce ? 0 : 0.5 + energy * 1.4, turns = 2.2, A = Math.min(W, H) * 0.16, L = H * 0.82, tilt = (mouse.x - 0.5) * 0.25;
      for (const p of pts) {
        const ang = p.s * turns * 6.283 + t * speed, a2 = p.kind === 1 ? ang + Math.PI : ang, side = p.kind === 2 ? (p.f * 2 - 1) : 1;
        const ox = Math.cos(a2) * A * side, dz = Math.sin(a2) * side, oy = (p.s - 0.5) * L;
        const ix = cx + ox + oy * tilt, iy = cy + oy - ox * tilt * 0.3;
        const [x, y] = bl(p, gather === 1 ? ix : ix + p.sx * W * 0.5 * (1 - gather), gather === 1 ? iy : iy + p.sy * H * 0.5 * (1 - gather));
        const near = (dz + 1) / 2, tw = reduce ? 0.85 : 0.65 + 0.35 * Math.sin(t * p.tw + p.ph), base = p.kind === 2 ? 0.3 + 0.35 * near : 0.35 + 0.6 * near;
        ctx.fillStyle = col(p, Math.max(base * tw, 0.8 * sigK) * alphaMul * (0.5 + 0.5 * gather));
        ctx.beginPath(); ctx.arc(x, y, p.size * (0.6 + 0.7 * near), 0, 6.283); ctx.fill();
      }
    } else if (style === 'fireflies') {
      // 반딧불: 느린 배회(방향 잡음) + 쿠라모토 동기화 — 이웃(가까울수록 강하게)의 위상에 끌려 점점 같은 박자로 깜박인다. energy 가 오르면 결합·속도가 커진다.
      glow(cx, cy, R, k * 0.35);
      const dt = reduce ? 0 : 0.016, K = (0.9 + energy * 2.2) * dt, wander = 0.012 + energy * 0.02, link2 = Math.pow(Math.min(W, H) * 0.32, 2);
      if (dt) {
        // 이웃 찾기를 격자로: 결합 반경 크기의 칸에 별을 넣고 자기 칸+주변 8칸만 본다(전체 쌍 n² → 대략 n×이웃 수). 결과는 전체 쌍 계산과 같다.
        const cell = Math.sqrt(link2), cols = Math.max(1, Math.ceil(W / cell)), grid = new Map();
        for (const p of pts) { const key = ((p.y * H / cell) | 0) * cols + ((p.x * W / cell) | 0); let b = grid.get(key); if (!b) grid.set(key, b = []); b.push(p); }
        for (const p of pts) {
          let pull = 0; const gx = (p.x * W / cell) | 0, gy = (p.y * H / cell) | 0;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const b = grid.get((gy + oy) * cols + gx + ox); if (!b) continue; for (const q of b) { if (q === p) continue; const dx = (q.x - p.x) * W, dy = (q.y - p.y) * H; const d2 = dx * dx + dy * dy; if (d2 < link2) pull += Math.sin(q.phi - p.phi) * (1 - d2 / link2); } }
          p.dphi = p.w * dt + K * pull / Math.max(8, pts.length * 0.25);
        }
        for (const p of pts) { p.phi = (p.phi + p.dphi) % 6.283; p.h += (Math.sin(t * 0.7 + p.ph) + Math.random() - 0.5) * 0.08; p.x = (p.x + Math.cos(p.h) * wander * 0.016 + 1) % 1; p.y = (p.y + Math.sin(p.h) * wander * 0.016 * (W / H) + 1) % 1; }
      }
      for (const p of pts) {
        const pulse = Math.pow(Math.max(0, Math.cos(p.phi)), 6), x = p.x * W, y = p.y * H, a = (0.08 + 0.92 * pulse) * alphaMul * gather;
        if (pulse > 0.05) { const g = ctx.createRadialGradient(x, y, 0, x, y, p.size * 7); g.addColorStop(0, col(p, 0.35 * pulse * alphaMul)); g.addColorStop(1, col(p, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, p.size * 7, 0, 6.283); ctx.fill(); }
        ctx.fillStyle = col(p, a); ctx.beginPath(); ctx.arc(x, y, p.size * (0.7 + 0.6 * pulse), 0, 6.283); ctx.fill();
      }
    }
    govSample(performance.now() - t1, now);
    if (reduce || (pauseWhenDim && targetDim && dim > 0.98 && !calib)) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && !document.hidden && !calib?.hold) raf = requestAnimationFrame(frame); };
  function applyProfile(p) { profile = { fps: p.fps, dprCap: p.dprCap }; resize(); updateFps(); kick(); }
  /** 이 컴퓨터에 맞는 프레임·해상도 프로필을 실측으로 고른다(설정 「다시 측정」·첫 실행). 약 3~15초. 지표가 없으면(브라우저·창 재시작 전) 보수적 기본값. */
  async function calibrate() {
    if (calib || !govern || reduce || document.hidden) return status();
    await probeMetrics(); // 매번 실제로 불러 본다(창 재시작으로 통로가 생겼거나, 반대로 죽었을 수 있다)
    const m = metricsApi(), nat = nativeDpr();
    const cands = PROFILES.map(p => ({ ...p }));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const at = new Date().toISOString();
    if (!m) { // 정밀 지표 없음 → 보수적 프로필(30fps·100%)과 대략 추천
      applyProfile({ fps: 30, dprCap: 1 }); cap = CAP_MAX; slow = false;
      rec = { fps: 30, dprCap: 1, density: Math.min(density, 0.5), pauseWhenDim: true, costs: [], baseline: null, budget: gov.calibBudget, precise: false, at };
      saveCap(); emit(); return status();
    }
    const read = async () => { let s = 0; for (const x of await m()) if (x.type === 'GPU' || x.type === 'Tab') s += Number(x.cpu) || 0; return s; };
    const prev = { ...profile }, costs = []; let baseline = 0, failed = false;
    calib = { step: 0, total: cands.length + 1, hold: true, fps: fpsCap }; cancelAnimationFrame(raf); raf = 0; emit();
    try {
      await m(); await sleep(gov.calibWindowMs); baseline = await read(); // 첫 호출은 0 → 한 번 비우고 "안 그릴 때"를 잰다
      calib.hold = false;
      for (const p of cands) { // 후보 전부를 잰다 — 사용자가 "부드럽게 하면 얼마나 부담인가"를 표로 보고 직접 고를 수 있게(2026-09-13)
        calib.step++; calib.fps = p.fps; profile = { ...p }; resize(); updateFps(); emit(); kick();
        await sleep(gov.calibSettleMs); await m(); await sleep(gov.calibWindowMs);
        costs.push({ ...p, cost: Math.round(Math.max(0, (await read()) - baseline)) });
      }
    } catch { failed = true; } finally { calib = null; }
    if (failed || costs.length !== cands.length) { // 지표가 도중에 죽음(핸들러 없음 등) → 이전 프로필로 되돌리고 "정밀 측정 못 함"으로 남긴다. 가장 가벼운 후보로 굳히지 않는다.
      metricsOk = false; applyProfile(prev);
      rec = { fps: prev.fps, dprCap: prev.dprCap, density: r1(Math.min(density, cap)), pauseWhenDim, costs: [], baseline: null, budget: gov.calibBudget, precise: false, failed: true, at };
      saveCap(); emit(); return status();
    }
    const chosen = costs.find(c => c.cost <= gov.calibBudget) || costs[costs.length - 1], over = chosen.cost > gov.calibBudget; // 좋은 순이라 예산 안의 첫 후보가 추천
    rec = { fps: chosen.fps, dprCap: chosen.dprCap, density: r1(Math.min(density, cap, over ? CAP_MIN : 1.6)), pauseWhenDim: chosen.fps < 60 || over, costs, baseline: Math.round(baseline), budget: gov.calibBudget, precise: true, at, chosenCost: chosen.cost };
    applyProfile(chosen); saveCap(); emit();
    return status();
  }
  function mount(el, opts = {}) {
    canvas = el; ctx = canvas.getContext('2d', { alpha: true }); interactive = opts.interactive !== false; govern = opts.govern ?? interactive;
    if (govern) loadCap();
    resize(); ro = new ResizeObserver(() => { resize(); kick(); }); ro.observe(canvas);
    if (interactive) { onMove = (e) => { const b = canvas.getBoundingClientRect(); mouse.x = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)); mouse.y = Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)); }; window.addEventListener('pointermove', onMove); }
    onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else kick(); }; document.addEventListener('visibilitychange', onVis);
    if (govern) { // 창 포커스(잃으면 10fps)·배터리(30fps) 신호
      focused = document.hasFocus ? document.hasFocus() : true;
      onFocus = () => { focused = true; updateFps(); kick(); }; onBlur = () => { focused = false; updateFps(); }; window.addEventListener('focus', onFocus); window.addEventListener('blur', onBlur);
      try { navigator.getBattery?.().then((b) => { battery = b; onCharge = () => { onBattery = !b.charging; updateFps(); }; b.addEventListener('chargingchange', onCharge); onCharge(); }).catch(() => {}); } catch {}
      updateFps();
      // 첫 실행(저장된 프로필 없음): 창이 보이고 앞에 있으면 3초 뒤 한 번 실측해 이 컴퓨터의 프로필을 정한다(지표 없으면 보수적 기본값)
      // 대략 추천만 있는 상태(precise=false)에서 지표가 생기면(창 재시작 뒤) 한 번 정밀하게 다시 잰다.
      const needs = () => !rec || (!rec.precise && !!metricsApi());
      if (opts.autoCalibrate !== false) probeMetrics().then(() => { if (needs()) setTimeout(() => { if (needs() && focused && !document.hidden) calibrate(); }, 3000); });
    }
    kick();
  }
  function destroy() {
    cancelAnimationFrame(raf); raf = 0; ro?.disconnect(); if (onMove) window.removeEventListener('pointermove', onMove); if (onVis) document.removeEventListener('visibilitychange', onVis);
    if (onFocus) window.removeEventListener('focus', onFocus); if (onBlur) window.removeEventListener('blur', onBlur); if (battery && onCharge) battery.removeEventListener('chargingchange', onCharge);
    pts = []; all = [];
  }
  function configure(o = {}) {
    if (o.style && o.style !== style) { style = o.style; make(); t0 = 0; }
    if (o.density && o.density !== density) { density = o.density; make(); }
    if (typeof o.pauseWhenDim === 'boolean') { pauseWhenDim = o.pauseWhenDim; updateFps(); }
    if (o.colors) { colors = { ...colors, ...o.colors }; colCache.clear(); }
    if (o.gov) gov = { ...gov, ...o.gov }; // 검사용 조절 상수 덮어쓰기(창 길이·상승 대기 등)
    if (o.profile && govern && !calib) { applyProfile({ fps: [60, 30, 20].includes(o.profile.fps) ? o.profile.fps : profile.fps, dprCap: o.profile.dprCap === 2 ? 2 : 1 }); saveCap(); emit(); } // 수동 지정(설정의 프로필 칩)·검사 — 저장돼 다음 실행에도 유지
    if (o.style || o.density) { acc = { t: 0, n: 0, drops: 0, at: 0 }; goodSince = 0; emit(); }
    kick();
  }
  /** 상한·프로필 기록을 지우고 처음부터 다시 잰다(검사용 — 설정의 「다시 측정」은 calibrate()). */
  function remeasure() { cap = CAP_MAX; slow = false; rec = null; try { localStorage.removeItem(CAP_KEY); } catch {} acc = { t: 0, n: 0, drops: 0, at: 0 }; goodSince = 0; applyLive(); applyProfile({ fps: 60, dprCap: 1 }); emit(); }
  /** 검사·시뮬레이션용: 포커스·배터리 신호를 직접 넣는다. */
  function simulate(o = {}) { if (typeof o.focused === 'boolean') focused = o.focused; if (typeof o.onBattery === 'boolean') onBattery = o.onBattery; updateFps(); kick(); }
  return { mount, destroy, configure, signature, status, remeasure, calibrate, simulate, setEnergy: (v) => { targetEnergy = Math.max(0, Math.min(1, v)); kick(); }, setDim: (v) => { targetDim = v ? 1 : 0; updateFps(); kick(); } };
}
window.IrisStars = (() => {
  const main = makeStarEngine();
  return {
    mount: (el, opts) => main.mount(el, opts), configure: (o) => main.configure(o), setEnergy: (v) => main.setEnergy(v), setDim: (v) => main.setDim(v),
    /** 이 컴퓨터에 맞는 프레임·해상도 프로필 실측(설정 「다시 측정」). 진행은 'iris:stage' 이벤트의 calib 로, 결과는 status().rec 로. */
    calibrate: () => main.calibrate(),
    /** 서명 이스터에그: 별들이 text 모양으로 모였다가 흩어진다. 못 하면 false(호출한 쪽이 글자로 대신). */
    signature: (text) => main.signature(text),
    /** 자동 조절 상태(상한 밀도·지금 별 수·프레임 상한·마지막 프레임 비용). 바뀔 때마다 document 'iris:stage' 이벤트로도 알린다. */
    status: () => main.status(), remeasure: () => main.remeasure(), simulate: (o) => main.simulate(o),
    /** 설정 패널 미리보기: 작은 캔버스에 스타일 하나를 가볍게(별 적게) 돌린다. 닫을 때 destroy() */
    preview(el, opts) { const e = makeStarEngine(); e.mount(el, { interactive: false }); e.configure({ density: 0.2, ...opts }); return e; },
  };
})();
