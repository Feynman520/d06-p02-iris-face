// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 프로세스 가계도(v2.97, 2026-10-28 "창 닫기 = 전부 종료"): 세션이 띄운 프로그램(로컬 MCP 포함)만 골라 끝내고, 정말 끝났는지 확인한다.
//   - 프로세스 표 = PID·부모 PID·이름·시작 시각(ms). 윈도는 PID 번호를 재사용하므로 "부모보다 먼저 시작한 자식"은 자식으로 보지 않는다.
//   - 이름으로 프로그램을 고르는 코드는 두지 않는다 — 항상 Face가 띄운 세션 PID에서 시작하는 가계도만 쓴다.
//   - 표를 못 읽으면(PowerShell 실패·시간 초과) null 을 돌려주고, 부르는 쪽은 "확인 불가"로 보고한다(거짓 완료 금지).
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const PS = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
// FileTime(1601년부터 100ns) → 유닉스 ms 로 바꾸는 것은 JS 에서 한다(PowerShell 쪽은 숫자만 낸다).
const SCRIPT = "$ErrorActionPreference='Stop';Get-CimInstance Win32_Process | ForEach-Object { '{0}|{1}|{2}|{3}' -f $_.ProcessId,$_.ParentProcessId,$(if($_.CreationDate){$_.CreationDate.ToFileTimeUtc()}else{0}),$_.Name }";
const ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT];
const FILETIME_EPOCH_MS = 11644473600000;

export const pidAlive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };

/** PowerShell 출력(줄마다 pid|ppid|filetime|name) → Map(pid → {pid, ppid, start, name}) */
export function parseTable(text) {
  const map = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^(\d+)\|(\d+)\|(\d+)\|(.*)$/); if (!m) continue;
    const ft = Number(m[3]);
    map.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), start: ft ? Math.round(ft / 10000 - FILETIME_EPOCH_MS) : 0, name: m[4].trim() });
  }
  return map.size ? map : null;
}

/** 프로세스 표(비동기). 실패·시간 초과면 null. */
export function readTable({ timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    let out = '', done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } };
    let child; try { child = spawn(PS, ARGS, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return resolve(null); }
    const t = setTimeout(() => { try { child.kill(); } catch {} finish(null); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.on('error', () => finish(null));
    child.on('close', () => finish(parseTable(out)));
  });
}
/** 프로세스 표(동기 — 개별 ✕의 "이전 실행이 남긴 카드" 확인에만 쓴다). 실패면 null. */
export function readTableSync({ timeoutMs = 8000 } = {}) {
  try { const r = spawnSync(PS, ARGS, { windowsHide: true, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'ignore'] }); return r.status === 0 ? parseTable(r.stdout) : null; } catch { return null; }
}

/** root 와 그 자손 전부(root 포함). 자식 판정 = 부모 PID 일치 + 부모보다 늦게(같거나) 시작. root 가 표에 없으면 빈 배열. */
export function descendants(table, rootPid) {
  const root = table?.get(Number(rootPid)); if (!root) return [];
  const kids = new Map();
  for (const p of table.values()) { if (p.pid === p.ppid) continue; if (!kids.has(p.ppid)) kids.set(p.ppid, []); kids.get(p.ppid).push(p); }
  const out = [root], seen = new Set([root.pid]);
  for (let i = 0; i < out.length; i++) {
    const parent = out[i];
    for (const c of kids.get(parent.pid) || []) { if (seen.has(c.pid) || c.start < parent.start) continue; seen.add(c.pid); out.push(c); }
  }
  return out;
}

/** 이 PID 가 우리가 띄운 그 프로그램인가: 카드가 PID 를 받은 시각(sinceMs) 이후 GRACE 안에 시작했어야 한다.
 *  더 늦게 시작했다면 원래 프로그램이 죽고 다른 프로그램이 번호를 이어받은 것이다. 표에 없으면 null(모름). */
export const OWN_GRACE_MS = 10_000;
export function isOwnProcess(table, pid, sinceMs) {
  const p = table?.get(Number(pid)); if (!p) return null;
  if (!sinceMs || !p.start) return null;
  return p.start <= sinceMs + OWN_GRACE_MS;
}

/** 목록의 프로세스 가운데 아직 같은 프로그램으로 살아 있는 것(PID 살아 있음 + 표의 시작 시각 같음). 표를 못 읽으면 PID 생존만 본다. */
export function stillRunning(list, table) {
  return list.filter((p) => {
    if (!pidAlive(p.pid)) return false;
    if (!table) return true;
    const now = table.get(p.pid); return !!now && (!p.start || !now.start || now.start === p.start);
  });
}

export function taskkillTree(pid) {
  try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10_000 }); } catch {}
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 목록이 전부 사라질 때까지 기다린다(최대 maxMs). 돌려주는 값 = 아직 PID 가 살아 있는 것. */
export async function waitGone(list, maxMs = 1500, stepMs = 150) {
  const t0 = Date.now();
  let alive = list.filter((p) => pidAlive(p.pid));
  while (alive.length && Date.now() - t0 < maxMs) { await sleep(stepMs); alive = alive.filter((p) => pidAlive(p.pid)); }
  return alive;
}
