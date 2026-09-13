// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 무접촉 증명(설계 조각 1·검증 V1): 모듈이 하나도 없는 Face 데몬은 127.0.0.1 밖으로 연결을 만들지 않는다.
//   시험 데몬을 3459 에 빈 modules 폴더로 띄우고 → features.modules 가 빈 배열 → 데몬 PID 의 바깥 TCP 연결 0(2초 간격 2회) → /api/shutdown.
//   실 데몬(3458)은 건드리지 않는다. 사용: node scripts/check-nomodule.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3459;
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-nomod-state-'));
const mods = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-nomod-mods-'));

const daemon = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore', // IRIS_FACE_UPDATE_CHECK=0: 업데이트 하루 1회 확인(v2.58)은 시작 30초 뒤라 이 검사 시간 안에 돌지 않지만, 무접촉 증명이 시간에 기대지 않게 아예 끈다.
env: { ...process.env, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' } });
const pid = daemon.pid;
const api = async (p, init) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };
let health = null;
for (let i = 0; i < 40 && !health; i++) { await sleep(250); try { const r = await api('/api/health'); if (r.status === 200) health = r.body; } catch {} }
ok(!!health && health.pid === pid, `daemon up on ${PORT} pid=${pid}`);
// v2.56: features.modules 는 카탈로그(저장소 안 정적 파일)와 합친 화면용 목록이라 미설치 행이 들어 있다 — 설치된(installed:true) 행·panel 은 하나도 없어야 한다.
const fm = health?.features?.modules;
ok(Array.isArray(fm) && fm.every(m => m.installed === false && m.catalog === true && !m.panel && m.status === undefined), `features.modules = 카탈로그 미설치 행만(${Array.isArray(fm) ? fm.length : '?'}개, installed:false·panel 없음)`);
ok(health?.features?.update?.mode === 'dev' && typeof health.features.update.enabled === 'boolean', `features.update = { mode, enabled } (v2.58, got ${health?.features?.update?.mode})`);
const mlist = await api('/api/modules').catch(() => null);
ok(mlist?.status === 200 && mlist.body.list.length === 0 && mlist.body.dir === mods, '/api/modules 빈 목록·폴더 = 시험 폴더');

// 바깥 연결: 데몬 PID 가 소유한 TCP 중 원격 주소가 루프백·미지정이 아닌 것
function outbound() {
  const ps = `Get-NetTCPConnection -OwningProcess ${pid} -ErrorAction SilentlyContinue | Where-Object { $_.RemoteAddress -notmatch '^(127\\.|::1$|0\\.0\\.0\\.0$|::$)' } | ForEach-Object { $_.RemoteAddress + ':' + $_.RemotePort + ' ' + $_.State }`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true });
  return (r.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
const o1 = outbound(); await sleep(2000); const o2 = outbound();
ok(o1.length === 0 && o2.length === 0, `daemon pid ${pid} outbound connections = 0 (2 samples)${o1.length || o2.length ? ' → ' + [...o1, ...o2].join(', ') : ''}`);

// 모듈 라우트 같은 출처 검사(F2) — restart/install 은 다른 Origin 을 403 으로 거부, install 은 x-file-name 없어도 403, Origin 없는 로컬 호출(curl 등)은 통과.
{
  const foreign = { Origin: 'http://evil.example.com' };
  const r1 = await api('/api/modules/testmod/restart', { method: 'POST', headers: foreign });
  ok(r1.status === 403, `origin: 다른 출처의 restart 거부(403) (got ${r1.status})`);
  const r2 = await api('/api/modules/install', { method: 'POST', headers: { ...foreign, 'x-file-name': 'x.zip' } });
  ok(r2.status === 403, `origin: 다른 출처의 install 거부(403) (got ${r2.status})`);
  const r3 = await api('/api/modules/install', { method: 'POST', headers: {} });
  ok(r3.status === 403, `origin: x-file-name 없는 install 거부(403) (got ${r3.status})`);
  const r4 = await api('/api/modules/testmod/restart', { method: 'POST' });
  ok(r4.status === 200, `origin: Origin 없는 로컬 restart 허용(200) (got ${r4.status})`);
}

// 정리: 데몬이 스스로 끝나게(shutdown). 3초 안에 안 끝나면 이 PID 만.
try { await api('/api/shutdown', { method: 'POST' }); } catch {}
let alive = true; for (let i = 0; i < 12 && alive; i++) { await sleep(250); try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; } }
if (alive) { try { process.kill(pid); } catch {} }
ok(!alive, 'daemon exited via /api/shutdown');
fs.rmSync(state, { recursive: true, force: true }); fs.rmSync(mods, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
