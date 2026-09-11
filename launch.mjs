// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// IRIS-Face 실행기: 데몬이 없으면 분리 실행 → 브라우저(4단계부터 Electron)로 연다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dashDir } from './daemon/paths.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const URL_ = 'http://127.0.0.1:3458/';
const STATE = path.join(ROOT, 'state');
fs.mkdirSync(STATE, { recursive: true });

async function health() {
  try { const r = await fetch(URL_ + 'api/health'); return r.ok ? await r.json() : null; } catch { return null; }
}

// TeamClaude 프록시(3456)가 꺼져 있으면 관리 스크립트로 백그라운드 기동.
// (세션들이 프록시 경유로 API를 쓰므로 Face보다 먼저 확인. 이미 떠 있으면 아무것도 건드리지 않는다.)
// 대시보드 뷰어 서버(3457)는 프록시 기동 여부와 상관없이 항상 보장한다 — Face 창의 한도 서랍(Ctrl+D)이
// 그 서버를 iframe으로 띄우므로. 브라우저 탭은 열지 않는다(서랍의 ⧉ 버튼으로 필요할 때만).
// 도구가 없는 PC(공개 배포본)나 대시보드 폴더를 못 찾은 경우는 한 줄 알리고 건너뛴다(TeamClaude 는 선택 기능 — 2026-09-11 매듭 풀기).
// 폴더 탐색 = daemon/paths.mjs dashDir()(TEAMCLAUDE_DASH_DIR → 공유 도구 → 옛 자리).
const DASH_DIR = dashDir();
const tcLog = (m) => { const line = `[iris-face] ${m}`; console.log(line); try { fs.appendFileSync(path.join(STATE, 'teamclaude-ensure.log'), `${new Date().toISOString()} ${line}\n`); } catch {} };
const teamclaude = (async () => {
  if (!DASH_DIR) { console.log('[iris-face] TeamClaude tools not found — proxy/dashboard skipped (optional; set TEAMCLAUDE_DASH_DIR to enable)'); return null; }
  const mod = path.join(DASH_DIR, 'ensure-proxy.mjs');
  if (!fs.existsSync(mod)) { tcLog(`ensure-proxy.mjs not in ${DASH_DIR} — proxy start skipped`); return null; }
  let r = null;
  try {
    const { ensureTeamClaude } = await import(pathToFileURL(mod).href);
    r = await ensureTeamClaude({ log: tcLog });
    tcLog(r.message.replace(/\r?\n/g, ' | '));
  } catch (e) { tcLog(`teamclaude check failed: ${e.message}`); }
  try {
    const dmod = path.join(DASH_DIR, 'ensure-dash.mjs');
    if (fs.existsSync(dmod)) {
      const { ensureDash } = await import(pathToFileURL(dmod).href);
      const d = await ensureDash({ log: tcLog });
      tcLog(`dashboard: ${d.message}`);
    }
  } catch (e) { tcLog(`dashboard check failed: ${e.message}`); }
  return r;
})();

let h = await health();
if (!h) {
  const out = fs.openSync(path.join(STATE, 'daemon.out.log'), 'a');
  const child = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], {
    cwd: ROOT, detached: true, stdio: ['ignore', out, out], windowsHide: true,
  });
  child.unref();
  for (let i = 0; i < 20 && !h; i++) { await new Promise(r => setTimeout(r, 400)); h = await health(); }
  if (!h) { console.error('[iris-face] daemon did not start — see state/daemon.out.log'); process.exit(1); }
  console.log(`[iris-face] daemon started pid=${h.pid}`);
} else {
  console.log(`[iris-face] daemon already running pid=${h.pid} sessions=${h.sessions}`);
}
// 기본 = Electron 창(설치돼 있으면), --browser = 기본 브라우저, --no-open = 데몬만
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
if (process.argv.includes('--no-open')) { /* 데몬만 */ }
else if (!process.argv.includes('--browser') && fs.existsSync(ELECTRON)) {
  const out = fs.openSync(path.join(STATE, 'app.out.log'), 'a');
  spawn(ELECTRON, [path.join(ROOT, 'app', 'electron', 'main.cjs')], { cwd: ROOT, detached: true, stdio: ['ignore', out, out], windowsHide: false }).unref();
  console.log('[iris-face] electron window launched');
} else {
  spawn('cmd.exe', ['/c', 'start', '', URL_], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
}
console.log(`[iris-face] ${URL_}`);
await teamclaude; // 프록시 기동(회귀 검사 포함, 최대 90초)이 끝날 때까지 실행기는 기다린다 — 창은 이미 떠 있다
