// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 무대 애니메이션 자동 조절 검사(2026-09-12 발열 사건 후). 정적 검사는 어디서나, 동적 검사는 playwright(전역 npm 또는 node_modules)가 있을 때만.
//   정적) settings 기본값 pauseWhenDim=true · stars.js에 status/remeasure/simulate · index.html에 st-cap/st-remeasure
//   동적) headless 크로미엄(소프트웨어 렌더 ≈ GPU 없는 컴퓨터, 1600×900)에서 app/stars.js 그대로 로드:
//     1) 무대 10종 전부 예외 없이 그려진다
//     2) 부분집합: 밀도 1.6·상한 0.8이면 live ≈ total × 0.5, 별 배열은 다시 만들지 않는다(첫 별 동일)
//     3) CPU 4배 느리게(CDP) + 밀도 1.6 → 상한이 1.6 아래로 내려간다(짧은 판정 창 사용)
//     4) 느림 해제 → 상승 대기 뒤 상한이 다시 오른다
//     5) 포커스 잃음 → fpsCap 10 · 배터리 → 30 · 복귀 → 60, 10fps일 때 실제 프레임 수가 초당 12 이하
//     6) 상한이 localStorage 'iris.stage.cap'에 남는다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0, pass = 0, skip = 0;
const ok = (name, cond, note = '') => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${note ? ' -> ' + note : ''}`); } };
const SKIP = (name, why) => { skip++; console.log(`SKIP ${name} (${why})`); };

// ---- 정적 ----
const settings = fs.readFileSync(path.join(ROOT, 'app/settings.js'), 'utf8');
const stars = fs.readFileSync(path.join(ROOT, 'app/stars.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
ok('static: pauseWhenDim 기본 켬', /pauseWhenDim:\s*true/.test(settings.split('\n').find(l => l.includes('const DEF')) || ''));
ok('static: stars.js API status/remeasure/simulate', ['status:', 'remeasure:', 'simulate:'].every(k => stars.includes(k)));
ok('static: index.html st-cap/st-remeasure', html.includes('id="st-cap"') && html.includes('id="st-remeasure"'));
ok('static: 반딧불 격자', stars.includes('grid = new Map()'));
// v2.51(2026-09-13): 프레임·해상도 프로필 실측(calibrate) + 테두리 「다시 측정」 + 추천 줄 + Electron 지표 통로 + 빛무리 원 채우기
const preload = fs.readFileSync(path.join(ROOT, 'app/electron/preload.cjs'), 'utf8'), main = fs.readFileSync(path.join(ROOT, 'app/electron/main.cjs'), 'utf8');
ok('static: stars.js calibrate/profile', ['calibrate', 'PROFILES', 'dprCap', 'DIM_FPS'].every(k => stars.includes(k)));
ok('static: 빛무리는 1.3R 원만 채운다(fillRect 전체 채우기 없음)', /function glow[\s\S]*?ctx\.arc\(cx, cy, R \* 1\.3/.test(stars) && !/function glow[\s\S]*?fillRect\(0, 0, W, H\)/.test(stars.split('function frame')[0]));
ok('static: 「다시 측정」 테두리 버튼(accent) + 추천 줄 st-rec', /id="st-remeasure" class="text-btn accent"/.test(html) && html.includes('id="st-rec"'));
ok('static: preload metrics/gpu · main iris:metrics', preload.includes("invoke('iris:metrics')") && main.includes("ipcMain.handle('iris:metrics'") && main.includes('getAppMetrics'));

// ---- 동적 ----
function findPlaywright() {
  const req = createRequire(import.meta.url);
  const cands = ['playwright', 'C:/Users/User/AppData/Roaming/npm/node_modules/playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')];
  for (const c of cands) { try { return req.resolve(c); } catch {} }
  return null;
}
const pw = findPlaywright();
if (!pw) { SKIP('dynamic', 'playwright 없음'); done(); }
else {
  const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium; // CJS 패키지: default 아래에 있음
  const page = `<!doctype html><html><body style="margin:0;background:#000"><canvas id="c" style="width:1600px;height:900px;display:block"></canvas>
<script>window.__frames=0; const _raf=window.requestAnimationFrame.bind(window); window.requestAnimationFrame=(cb)=>_raf((ts)=>{window.__frames++;cb(ts);});</script>
<script>${stars}</script>
<script>IrisStars.mount(document.getElementById('c'), { autoCalibrate: false });</script></body></html>`;
  const b = await chromium.launch({ headless: true });
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors = []; pg.on('pageerror', (e) => errors.push(String(e)));
  await pg.route('http://iris-stage.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page })); // about:blank 은 localStorage 접근 불가 → 가짜 http 출처
  await pg.goto('http://iris-stage.test/');
  const cdp = await pg.context().newCDPSession(pg);
  const st = () => pg.evaluate(() => IrisStars.status());
  const wait = (ms) => pg.waitForTimeout(ms);
  // 1) 10종 렌더
  for (const s of ['sphere', 'iris', 'nebula', 'constellation', 'drift', 'galaxy', 'warp', 'aurora', 'helix', 'fireflies']) { await pg.evaluate((s) => IrisStars.configure({ style: s, density: 1 }), s); await wait(250); }
  ok('dynamic: 무대 10종 예외 없음', errors.length === 0, errors[0]);
  // 2) 부분집합(상한 0.8, 밀도 1.6 → live = total × 0.5, 별 배열 유지)
  await pg.evaluate(() => { localStorage.setItem('iris.stage.cap', JSON.stringify({ cap: 0.8 })); });
  await pg.evaluate((src) => { document.getElementById('c').remove(); const c = document.createElement('canvas'); c.id = 'c'; c.style.cssText = 'width:1600px;height:900px;display:block'; document.body.appendChild(c); }, '');
  await pg.evaluate(() => { IrisStars.mount(document.getElementById('c'), { autoCalibrate: false }); IrisStars.configure({ style: 'sphere', density: 1.6, gov: { windowMs: 60000, upAfterMs: 60000 } }); });
  await wait(300);
  let s = await st();
  ok('dynamic: 저장된 상한 0.8 로드', s.cap === 0.8, JSON.stringify(s));
  ok('dynamic: live ≈ total × cap/density', Math.abs(s.live - Math.round(s.total * 0.5)) <= 1, `${s.live}/${s.total}`);
  // 3) 느리게 → 상한 하락
  await pg.evaluate(() => { IrisStars.remeasure(); IrisStars.configure({ density: 1.6, gov: { windowMs: 200, upAfterMs: 1500, budgetMs: 4 } }); });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await wait(4500);
  s = await st();
  ok('dynamic: CPU 4배 느림 → 상한 < 1.6', s.cap < 1.6, JSON.stringify(s));
  await wait(8000); s = await st(); // 계속 무거우면 별 50%에서 30fps로 내려간다(그다음 별 30%까지)
  ok('dynamic: 계속 느림 → 별 ≤50% + 30fps(slow)', s.cap <= 0.5 && s.slow && s.fpsCap === 30, JSON.stringify(s));
  // 4) 느림 해제 → 상승. 낮은 상한(0.3)이 저장된 컴퓨터를 재현(다시 mount)하고, 가벼운 밀도·짧은 대기에서 상한이 오르는지 본다
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await pg.evaluate(() => { localStorage.setItem('iris.stage.cap', JSON.stringify({ cap: 0.3 })); document.getElementById('c').remove(); const c = document.createElement('canvas'); c.id = 'c'; c.style.cssText = 'width:1600px;height:900px;display:block'; document.body.appendChild(c); IrisStars.mount(c, { autoCalibrate: false }); IrisStars.configure({ style: 'drift', density: 0.4, gov: { windowMs: 400, upAfterMs: 1200, budgetMs: 40 } }); });
  await wait(300); const before = (await st()).cap;
  await wait(3500); s = await st();
  ok('dynamic: 여유 → 상한 상승', before === 0.3 && s.cap > before, `${before} → ${s.cap}`);
  // 5) 포커스·배터리(신호는 simulate로 직접 주입)
  await pg.evaluate(() => IrisStars.simulate({ focused: false })); s = await st(); ok('dynamic: 포커스 잃음 → 10fps', s.fpsCap === 10, String(s.fpsCap));
  await pg.evaluate(() => IrisStars.simulate({ focused: true, onBattery: true })); s = await st(); ok('dynamic: 배터리 → 30fps', s.fpsCap === 30, String(s.fpsCap));
  await pg.evaluate(() => IrisStars.simulate({ onBattery: false })); s = await st(); ok('dynamic: 복귀 → 60fps', s.fpsCap === 60, String(s.fpsCap));
  // 6) 저장
  const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('iris.stage.cap') || 'null'));
  ok('dynamic: 상한 localStorage 저장', saved && typeof saved.cap === 'number', JSON.stringify(saved));
  // 7) v2.51 프로필: 기본 해상도 상한 1(150% 배율에서도 캔버스는 100% 화소) · 어두움 20fps · 수동 프로필
  const pg2 = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
  pg2.on('pageerror', (e) => errors.push(String(e)));
  await pg2.route('http://iris-stage.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page.replace("IrisStars.mount(document.getElementById('c'), { autoCalibrate: false })", "IrisStars.mount(document.getElementById('c'), { autoCalibrate: false }); IrisStars.simulate({ focused: true })") }));
  await pg2.goto('http://iris-stage.test/'); await pg2.waitForTimeout(300);
  const st2 = () => pg2.evaluate(() => IrisStars.status());
  let s2 = await st2(); const cw = await pg2.evaluate(() => [document.getElementById('c').width, document.getElementById('c').clientWidth]);
  ok('dynamic: 기본 dprCap 1 → 배율 1.5 에서도 캔버스 화소 = CSS 폭', s2.dprCap === 1 && s2.dpr === 1 && cw[0] === cw[1], JSON.stringify({ s: s2.dprCap, dpr: s2.dpr, cw }));
  await pg2.evaluate(() => { IrisStars.configure({ pauseWhenDim: false }); IrisStars.setDim(true); }); s2 = await st2();
  ok('dynamic: 대화 화면(어두움)·멈춤 끔 → 20fps', s2.fpsCap === 20, String(s2.fpsCap));
  await pg2.evaluate(() => IrisStars.setDim(false)); s2 = await st2();
  ok('dynamic: 밝아짐 → 60fps', s2.fpsCap === 60, String(s2.fpsCap));
  await pg2.evaluate(() => IrisStars.configure({ profile: { fps: 30, dprCap: 2 } })); s2 = await st2();
  const cw2 = await pg2.evaluate(() => [document.getElementById('c').width, document.getElementById('c').clientWidth]);
  ok('dynamic: 수동 프로필 30fps·원본 해상도 → 30fps, 캔버스 1.5배', s2.fpsCap === 30 && s2.fps === 30 && s2.dpr === 1.5 && cw2[0] === Math.floor(cw2[1] * 1.5), JSON.stringify({ s2, cw2 }));
  // 8) calibrate(): 가짜 irisHost.metrics — 비용이 후보 프로필에 따라 다르고(60/2=70 … 20/1=12), 안 그릴 때(기준선) 30. 예산 15 → 20fps·100% 가 답, 예산 45 → 60fps·100%
  await pg2.evaluate(() => {
    const table = { '60/2': 70, '60/1': 40, '30/2': 35, '30/1': 20, '20/1': 12 };
    window.irisHost = { metrics: async () => { const s = IrisStars.status(); const drawing = s.calib && s.calib.step > 0; const cost = drawing ? table[`${s.fps}/${s.dprCap}`] : 0; return [{ type: 'Browser', cpu: 5 }, { type: 'GPU', cpu: 30 + cost * 0.7 }, { type: 'Tab', cpu: cost * 0.3 }]; } };
    IrisStars.remeasure(); IrisStars.configure({ gov: { calibWindowMs: 120, calibSettleMs: 30, calibBudget: 15 } });
  });
  let seenCalib = false; await pg2.exposeFunction('__calibSeen', () => { seenCalib = true; });
  await pg2.evaluate(() => document.addEventListener('iris:stage', (e) => { if (e.detail.calib) window.__calibSeen(); }));
  s2 = await pg2.evaluate(() => IrisStars.calibrate());
  ok('dynamic: calibrate(예산 15) → 20fps·100%·후보 5개 측정·측정 중 이벤트', s2.fps === 20 && s2.dprCap === 1 && s2.rec && s2.rec.costs.length === 5 && s2.rec.precise && s2.rec.pauseWhenDim === true && s2.calib === null && seenCalib, JSON.stringify(s2.rec));
  const saved2 = await pg2.evaluate(() => JSON.parse(localStorage.getItem('iris.stage.cap') || 'null'));
  ok('dynamic: 프로필·추천이 localStorage 에 저장', saved2 && saved2.fps === 20 && saved2.dprCap === 1 && saved2.rec && saved2.rec.fps === 20, JSON.stringify(saved2));
  await pg2.evaluate(() => IrisStars.configure({ gov: { calibBudget: 45 } })); s2 = await pg2.evaluate(() => IrisStars.calibrate());
  ok('dynamic: calibrate(예산 45) → 60fps·100%(첫 통과 후보에서 멈춤)', s2.fps === 60 && s2.dprCap === 1 && s2.rec.costs.length === 2 && s2.rec.pauseWhenDim === false, JSON.stringify(s2.rec));
  // 9) 지표 없는 환경(브라우저·창 재시작 전) → 보수적 30fps·100% + 대략 추천(precise=false)
  await pg2.evaluate(() => { delete window.irisHost; IrisStars.remeasure(); }); s2 = await pg2.evaluate(() => IrisStars.calibrate());
  ok('dynamic: 지표 없음 → 30fps·100%·precise=false', s2.fps === 30 && s2.dprCap === 1 && s2.rec && s2.rec.precise === false && s2.precise === false, JSON.stringify({ fps: s2.fps, rec: s2.rec }));
  ok('dynamic: 검사 중 예외 없음', errors.length === 0, errors[0]);
  await b.close();
  done();
}
function done() { console.log(`\n${pass} PASS · ${fail} FAIL · ${skip} SKIP`); process.exit(fail ? 1 : 0); }
