// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// v2.49 — 창 없는 실행기 검사. 실 데몬(3458)·프록시(3456)·대시보드(3457)는 절대 건드리지 않는다.
//   ① 정적: launch-hidden.vbs(ASCII·숨김 창 0·launch.mjs 호출) · launch.mjs(launch.log·--console·fatal 알림창)
//   ② 정적(있을 때만): TeamClaude ensure-proxy.mjs 가 'close'가 아니라 'exit'를 기다리는지(무한 대기 원인)
//   ③ 동작: IRIS_FACE_NODE 를 가짜 node(인수를 파일에 적는 .cmd)로 바꿔 wscript 로 vbs 를 실제 실행 →
//      launch.mjs 경로와 인수(--no-open, 공백 든 인수)가 그대로 전달되는지. Face 는 뜨지 않는다.
//   ④ 이 PC 전용(있을 때만): 루트 IRIS-Face.cmd 가 launch-hidden.vbs 를 부르고 --console 길을 남겼는지.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dashDir } from '../daemon/paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

// ① 정적
const vbsPath = path.join(ROOT, 'launch-hidden.vbs');
ok(fs.existsSync(vbsPath), 'launch-hidden.vbs exists');
const vbs = fs.existsSync(vbsPath) ? fs.readFileSync(vbsPath, 'latin1') : '';
ok(/^[\x00-\x7F]*$/.test(vbs), 'launch-hidden.vbs is ASCII only (wscript reads ANSI)');
ok(/sh\.Run cmd, 0, False/.test(vbs), 'launch-hidden.vbs runs node with window style 0 (hidden) and does not wait');
ok(/launch\.mjs/.test(vbs) && /IRIS_FACE_NODE/.test(vbs), 'launch-hidden.vbs targets launch.mjs and honours IRIS_FACE_NODE');
const launch = fs.readFileSync(path.join(ROOT, 'launch.mjs'), 'utf8');
ok(/launch\.log/.test(launch), 'launch.mjs writes state/launch.log');
ok(/--console/.test(launch) && /function msgbox/.test(launch) && /function fatal/.test(launch), 'launch.mjs has --console flag, msgbox and fatal');
ok(!/console\.(log|error)\(`\[iris-face\] daemon/.test(launch), 'launch.mjs daemon messages go through say() (not bare console)');

// ② ensure-proxy.mjs (선택 기능 — 없으면 건너뜀)
const dash = dashDir();
const ensure = dash ? path.join(dash, 'ensure-proxy.mjs') : null;
if (ensure && fs.existsSync(ensure)) {
  const src = fs.readFileSync(ensure, 'utf8');
  ok(/child\.on\('exit'/.test(src), "ensure-proxy.mjs waits for 'exit'");
  ok(!/child\.on\('close'/.test(src), "ensure-proxy.mjs does not wait for 'close' (inherited pipe hang)");
  ok(!/stdio:\s*\[\s*'ignore',\s*'pipe'/.test(src), 'ensure-proxy.mjs does not read the manage script through pipes');
} else {
  console.log('SKIP ensure-proxy.mjs not found (TeamClaude optional)');
}

// ③ 동작: 가짜 node 로 vbs 실행
if (process.platform === 'win32') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-launcher-'));
  const outFile = path.join(tmp, 'args.txt');
  const fakeNode = path.join(tmp, 'fake-node.cmd');
  fs.writeFileSync(fakeNode, `@echo off\r\necho %*> "${outFile}"\r\n`, 'ascii');
  const r = spawnSync('wscript.exe', ['//nologo', vbsPath, '--no-open', '--port', '3499', 'has space arg'],
    { env: { ...process.env, IRIS_FACE_NODE: fakeNode }, timeout: 20000, windowsHide: true });
  ok(r.status === 0, `wscript ran launch-hidden.vbs (exit ${r.status})`);
  let got = '';
  for (let i = 0; i < 40 && !got; i++) { try { got = fs.readFileSync(outFile, 'utf8').trim(); } catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); } }
  ok(got.includes('\\launch.mjs"'), `fake node received launch.mjs path (${got.slice(0, 80)}…)`);
  ok(got.includes('--no-open') && got.includes('--port 3499') && got.includes('"has space arg"'), 'arguments pass through (flags + quoted arg with spaces)');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
} else {
  console.log('SKIP wscript run (not win32)');
}

// ④ 이 PC 의 루트 소환기(공개 저장소 밖) — 있을 때만
const rootCmd = path.resolve(ROOT, '..', '..', '..', 'IRIS-Face.cmd');
if (fs.existsSync(rootCmd)) {
  const cmd = fs.readFileSync(rootCmd, 'utf8');
  ok(/launch-hidden\.vbs/.test(cmd) && /wscript\.exe/.test(cmd), 'root IRIS-Face.cmd launches through wscript launch-hidden.vbs');
  ok(/--console/.test(cmd) && /node "%FACE%\\launch\.mjs"/.test(cmd), 'root IRIS-Face.cmd keeps the --console fallback');
  ok(/\r\n/.test(cmd), 'root IRIS-Face.cmd uses CRLF');
} else {
  console.log('SKIP root IRIS-Face.cmd not found (not this PC)');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
