// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 실제 Electron 창으로 "창 닫기 = 전부 종료"(v2.97)를 확인한다 — 격리된 시험 창만 쓴다(실 창·실 데몬 3458 무접촉).
//   시험 데몬 = 3459 + 임시 state, 시험 창 = 같은 main.cjs 를 --port=3459 로(포트가 다르면 사용자 데이터·단일 실행 잠금도 따로 — main.cjs).
//   창 조작은 키 입력이 아니라 **이 검사가 띄운 창의 핸들에만** 윈도 메시지를 보낸다(다른 창이 앞에 있어도 사용자의 창을 건드릴 수 없게).
//   1회차: 최소화(SC_MINIMIZE) → 데몬·가짜 세션 가계도 유지 → × 와 같은 SC_CLOSE 를 연달아 2번 → 정리는 1번 · 가짜 MCP 종료 · 무관한 프로세스 유지 · 창·데몬 종료 · 카드 '종료됨'
//   2회차: WM_CLOSE(Alt+F4 가 결국 보내는 메시지) → 같은 결과
//   데몬 쪽 세부(PID 재사용·실패 보고 등)는 check-shutdown.mjs 가 맡는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readTable, descendants, pidAlive, taskkillTree } from '../daemon/proctree.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const PORT = 3459, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const mine = new Set();
process.on('exit', () => { for (const pid of mine) if (pidAlive(pid)) taskkillTree(pid); });
if (!fs.existsSync(ELECTRON)) { console.log('SKIP electron.exe 없음'); process.exit(0); }
const health = async (base) => { try { const r = await fetch(base + '/api/health', { signal: AbortSignal.timeout(2000) }); return r.ok ? await r.json() : null; } catch { return null; } };
const realBefore = await health('http://127.0.0.1:3458');
if ((await health(BASE))) { console.log(`FAIL 포트 ${PORT} 가 이미 쓰이는 중 — 시험 중단`); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-close-'));
const FAKE = path.join(tmp, 'fake-tree.cjs');
fs.writeFileSync(FAKE, "const { spawn } = require('child_process'); const d = Number(process.argv[2] || 0);\nif (d > 0) spawn(process.execPath, [__filename, String(d - 1)], { stdio: 'ignore', windowsHide: true });\nsetInterval(() => {}, 1e6);\n", 'utf8');
const spawnTree = (depth) => { const c = spawn(process.execPath, [FAKE, String(depth)], { stdio: 'ignore', windowsHide: true, detached: true }); c.unref(); mine.add(c.pid); return c.pid; };
async function treeOf(pid, want) { for (let i = 0; i < 40; i++) { const d = descendants(await readTable(), pid).filter(p => /^node/i.test(p.name)); if (d.length >= want) return d; await sleep(250); } return []; }
// 창 핸들 찾기·메시지 보내기(ASCII 전용 PowerShell — 이 검사가 띄운 PID 의 보이는 창만)
const PS1 = path.join(tmp, 'win.ps1');
fs.writeFileSync(PS1, `param([int]$ProcId, [string]$Act)
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
"@
$found = [IntPtr]::Zero
[W]::EnumWindows({ param($h, $l) $p = 0; [void][W]::GetWindowThreadProcessId($h, [ref]$p); if ($p -eq $ProcId -and [W]::IsWindowVisible($h) -and [W]::GetWindowTextLength($h) -gt 0) { $script:found = $h; return $false }; return $true }, [IntPtr]::Zero) | Out-Null
if ($found -eq [IntPtr]::Zero) { 'none'; exit 0 }
switch ($Act) {
  'min'      { [void][W]::PostMessage($found, 0x0112, [IntPtr]0xF020, [IntPtr]::Zero) }
  'sysclose' { [void][W]::PostMessage($found, 0x0112, [IntPtr]0xF060, [IntPtr]::Zero) }
  'close'    { [void][W]::PostMessage($found, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }
}
'hwnd=' + $found + ' iconic=' + [W]::IsIconic($found)
`, 'ascii');
const win = (pid, act) => (spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-ProcId', String(pid), '-Act', act], { encoding: 'utf8', windowsHide: true }).stdout || '').trim();

async function round(label, closeAct, times, withMinimize) {
  const st = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-close-s-'));
  const mods = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-close-m-'));
  fs.writeFileSync(path.join(st, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8');
  const root = spawnTree(2), stranger = spawnTree(0);
  const tree = await treeOf(root, 3); await sleep(300);
  fs.writeFileSync(path.join(st, 'sessions.json'), JSON.stringify([{ id: 's1', cwd: tmp, agent: 'claude', model: 'opus', effort: 'high', status: 'idle', pid: root, pidAt: Date.now(), startedAt: new Date().toISOString(), sessionId: 'dddddddd-4444-4444-8444-444444444444', title: 'close test' }]), 'utf8');
  const env = { ...process.env, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: st, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' };
  const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore', env }); mine.add(d.pid);
  let h = null; for (let i = 0; i < 60 && !h; i++) { await sleep(250); h = await health(BASE); }
  ok(!!h && h.pid === d.pid, `${label}: 시험 데몬 ${PORT} pid=${d.pid}`);
  if (!h || h.pid !== d.pid) return;
  const e = spawn(ELECTRON, [path.join(ROOT, 'app', 'electron', 'main.cjs'), `--port=${PORT}`], { cwd: ROOT, stdio: 'ignore', env }); mine.add(e.pid);
  let shown = ''; for (let i = 0; i < 60 && !/hwnd=/.test(shown); i++) { await sleep(500); shown = win(e.pid, 'find'); }
  ok(/hwnd=/.test(shown), `${label}: 시험 창 표시(${shown})`);
  await sleep(2500); // 페이지·preload 준비
  if (withMinimize) {
    const m = win(e.pid, 'min'); await sleep(3000);
    ok(/iconic=True/.test(win(e.pid, 'find')) && pidAlive(e.pid) && !!(await health(BASE)) && tree.every(p => pidAlive(p.pid)), `${label}: 최소화 → 창 내려감, 데몬·가짜 세션·가짜 MCP 유지 (${m})`);
  }
  for (let i = 0; i < times; i++) { win(e.pid, closeAct); await sleep(120); }
  // 정리(프로세스 표 읽기·종료·확인)에 1초 넘게 걸리는 동안 창이 먼저 사라지면 "닫혔다"고 오해한다 — 창이 보이는 채로 남아 있어야 한다
  const during = win(e.pid, 'find');
  ok(/hwnd=/.test(during) && /iconic=False/.test(during), `${label}: 정리하는 동안 창이 보이는 채로 남음(${during})`);
  let eGone = false; for (let i = 0; i < 160 && !eGone; i++) { await sleep(250); eGone = !pidAlive(e.pid); }
  ok(eGone, `${label}: 창·트레이(Electron) 종료`);
  ok(!pidAlive(d.pid), `${label}: 데몬 종료`);
  ok(tree.every(p => !pidAlive(p.pid)), `${label}: 세션 가계도(가짜 세션→MCP→MCP 자식 ${tree.length}개) 종료`);
  ok(pidAlive(stranger), `${label}: Face 와 무관한 프로세스 유지`);
  const rep = (() => { try { return JSON.parse(fs.readFileSync(path.join(st, 'shutdown-report.json'), 'utf8')); } catch { return null; } })();
  ok(rep?.ok === true && rep.verified === true && rep.survivors.length === 0, `${label}: 종료 보고 ok·확인됨·남은 것 0`);
  const starts = (fs.readFileSync(path.join(st, 'daemon.log'), 'utf8').match(/shutdown: start/g) || []).length;
  ok(starts === 1, `${label}: 닫기 ${times}번 → 종료 절차 1번 (${starts})`);
  const saved = JSON.parse(fs.readFileSync(path.join(st, 'sessions.json'), 'utf8'));
  ok(saved[0]?.status === 'exited' && !saved[0].lost, `${label}: 카드 = 종료됨(다음 실행 자동 재개 없음)`);
  taskkillTree(stranger);
}

await round('1회차 ×(SC_CLOSE)', 'sysclose', 2, true);
await round('2회차 Alt+F4(WM_CLOSE)', 'close', 1, false);
const realAfter = await health('http://127.0.0.1:3458');
ok(!realBefore || (realAfter && realAfter.pid === realBefore.pid), `실제 IRIS(3458) 무접촉 — 데몬 pid ${realBefore?.pid ?? '없음'} 그대로`);
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
