// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// IRIS-Face 실행기: 데몬이 없으면 분리 실행 → 브라우저(4단계부터 Electron)로 연다.
// 2026-09-12(v2.49): 기본 실행은 창 없이(launch-hidden.vbs → wscript) — 그래서 콘솔 출력은 state\launch.log 에도 남기고,
// 치명 실패(데몬이 안 뜸 등)는 알림창으로 알린다. `--console`(IRIS-Face.cmd --console)이면 옛날처럼 보이는 창.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dashDir, soulRoot } from './daemon/paths.mjs';
import { handoffExists } from './daemon/handoff.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ARGV = process.argv.slice(2);
const argVal = (flag) => { const i = ARGV.indexOf(flag); return i >= 0 ? ARGV[i + 1] : null; };
// 포트 단일 소스: --port > IRIS_FACE_PORT > 기본 3458 (데몬도 같은 순서를 daemon/server.mjs 에서 본다).
const PORT = Number(argVal('--port')) || Number(process.env.IRIS_FACE_PORT) || 3458;
const URL_ = `http://127.0.0.1:${PORT}/`;
const STATE = path.join(ROOT, 'state');
fs.mkdirSync(STATE, { recursive: true });

// 실행기 로그: 콘솔이 숨겨져 있어도 무슨 일이 있었는지 state\launch.log 로 본다(1MB 넘으면 새로 시작).
const LAUNCH_LOG = path.join(STATE, 'launch.log');
try { if (fs.existsSync(LAUNCH_LOG) && fs.statSync(LAUNCH_LOG).size > 1_000_000) fs.unlinkSync(LAUNCH_LOG); } catch {}
const say = (m, isErr = false) => {
  (isErr ? console.error : console.log)(m);
  try { fs.appendFileSync(LAUNCH_LOG, `${new Date().toISOString()} ${m}\n`); } catch {}
};
const HIDDEN = !ARGV.includes('--console'); // 창 없이 돌 때만 알림창을 띄운다(보이는 창이면 글로 충분)
// 알림창: 콘솔이 없을 때 치명 실패를 사람에게 알리는 유일한 길. 한글이 코드페이지에 깨지지 않도록 -EncodedCommand(UTF-16LE base64).
function msgbox(text) {
  if (process.platform !== 'win32') return;
  // 본문은 환경변수로 넘긴다(따옴표·줄바꿈·한글을 명령줄에 싣지 않음).
  const ps = "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:IRIS_FACE_MSG, 'IRIS-Face', 'OK', 'Error')";
  const enc = Buffer.from(ps, 'utf16le').toString('base64');
  try {
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', enc],
      { windowsHide: true, timeout: 60000, env: { ...process.env, IRIS_FACE_MSG: text } });
  } catch {}
}
function fatal(text) {
  say(text, true);
  if (HIDDEN) msgbox(`${text}\n\n로그: ${LAUNCH_LOG}`);
  process.exit(1);
}
process.on('uncaughtException', (e) => fatal(`[iris-face] launcher crashed: ${e?.stack || e}`));
process.on('unhandledRejection', (e) => fatal(`[iris-face] launcher crashed: ${e?.stack || e}`));
say(`[iris-face] launch ${HIDDEN ? '(hidden)' : '(console)'} pid=${process.pid} args=${ARGV.join(' ') || '-'}`);

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
const tcLog = (m) => { const line = `[iris-face] ${m}`; say(line); try { fs.appendFileSync(path.join(STATE, 'teamclaude-ensure.log'), `${new Date().toISOString()} ${line}\n`); } catch {} };
const teamclaude = (async () => {
  if (!DASH_DIR) { say('[iris-face] TeamClaude tools not found — proxy/dashboard skipped (optional; set TEAMCLAUDE_DASH_DIR to enable)'); return null; }
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
    env: { ...process.env, IRIS_FACE_PORT: String(PORT) },
  });
  child.unref();
  for (let i = 0; i < 20 && !h; i++) { await new Promise(r => setTimeout(r, 400)); h = await health(); }
  if (!h) fatal(`[iris-face] daemon did not start — see ${path.join(STATE, 'daemon.out.log')}`);
  say(`[iris-face] daemon started pid=${h.pid}`);
} else {
  say(`[iris-face] daemon already running pid=${h.pid} sessions=${h.sessions}`);
}
// --first-session <spec.json> (installer Task 16): 설치기가 첫 세션을 대신 만들어 주는 자리.
// spec = { cwd, agent:'claude'|'codex', model, effort, promptFile }. 같은 cwd에 살아 있는 세션이 있으면 새로 만들지 않는다(중복 방지).
// v2 영혼(`_agent\setup\handoff.json` 있음)에서는 이 자리를 잠재운다(P03 Task 21): 첫 인사는 데몬이 인수 문서의
// firstMessage 로 하고, 세팅이 덜 끝났으면 안내 카드를 띄운다. 1.x 영혼에서는 지금까지와 똑같이 동작한다.
const firstSessionSpec = handoffExists(soulRoot()) ? null : argVal('--first-session');
if (!firstSessionSpec && argVal('--first-session')) say('[iris-face] --first-session: 건너뜀 (v2 영혼 — 창이 인수 문서로 첫 인사를 합니다)');
if (firstSessionSpec) {
  const normCwd = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  try {
    const spec = JSON.parse(fs.readFileSync(firstSessionSpec, 'utf8'));
    const list = await (await fetch(`${URL_}api/sessions`)).json();
    const dup = (Array.isArray(list) ? list : []).find(
      (r) => normCwd(r.cwd) === normCwd(spec.cwd) && r.status !== 'exited'
    );
    if (dup) {
      // 이미 살아 있는 세션이 있으면 새로 만들지 않되, 요청문은 버리지 않는다(2026-09-14 재실행 검수): 설치 패키지를 다시 돌려
      // 새 안내서가 들어왔을 때 그 세션이 옛 안내서로 계속 가면 안 되므로, 한가한 세션에는 새 요청문을 그대로 보낸다. 바쁜 세션이면 기록만.
      if (dup.status === 'busy') say(`[iris-face] --first-session: ${spec.cwd} 의 세션(${dup.id})이 바쁘므로 요청문을 보내지 않음`);
      else {
        const prompt = fs.readFileSync(spec.promptFile, 'utf8');
        const r = await fetch(`${URL_}api/sessions/${encodeURIComponent(dup.id)}/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: prompt }) });
        say(r.ok ? `[iris-face] --first-session: 살아 있는 세션(${dup.id})에 요청문을 보냄` : `[iris-face] --first-session: 세션(${dup.id})에 보내기 실패 (${r.status})`, !r.ok);
      }
    } else {
      const prompt = fs.readFileSync(spec.promptFile, 'utf8');
      const r = await fetch(`${URL_}api/sessions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        // permission/approval/sandbox: 설치기가 첫 세팅 세션에 최대 권한을 명시한다(2026-09-14). 없으면 데몬이 설정 파일대로.
        body: JSON.stringify({ cwd: spec.cwd, agent: spec.agent, model: spec.model, effort: spec.effort, permission: spec.permission || '', approval: spec.approval || '', sandbox: spec.sandbox || '', prompt }),
      });
      if (!r.ok) say(`[iris-face] --first-session: 세션 생성 실패 (${r.status})`, true);
      else { const rec = await r.json(); say(`[iris-face] --first-session: 세션 생성됨 id=${rec.id}`); }
    }
  } catch (e) {
    say(`[iris-face] --first-session 처리 실패: ${e.message}`, true);
  }
}
// 기본 = Electron 창(설치돼 있으면), --browser = 기본 브라우저, --no-open = 데몬만
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
if (process.argv.includes('--no-open')) { /* 데몬만 */ }
else if (!process.argv.includes('--browser') && fs.existsSync(ELECTRON)) {
  const out = fs.openSync(path.join(STATE, 'app.out.log'), 'a');
  spawn(ELECTRON, [path.join(ROOT, 'app', 'electron', 'main.cjs')], { cwd: ROOT, detached: true, stdio: ['ignore', out, out], windowsHide: false }).unref();
  say('[iris-face] electron window launched');
} else {
  spawn('cmd.exe', ['/c', 'start', '', URL_], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
}
say(`[iris-face] ${URL_}`);
await teamclaude; // 프록시 기동(회귀 검사 포함, 최대 90초)이 끝날 때까지 실행기는 기다린다 — 창은 이미 떠 있다
say('[iris-face] launcher done');
