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

// ⑤ macOS 창 꾸러미(2026-10-28 실설치 신고 "IRIS 가 아니라 Electron 아이콘") — 가짜 Electron.app 을 임시 폴더에 만들어 본다
ok(/macWindowExecutable\(ROOT/.test(launch) && /'electron\.exe'\);/.test(launch), 'launch.mjs: macOS 는 IRIS 창 꾸러미, Windows 는 electron.exe 그대로');
if (process.platform === 'darwin') {
  const { macWindowExecutable, WINDOW_BUNDLE_ID } = await import('../daemon/platform.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-winapp-'));
  const app = path.join(tmp, 'face', 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents');
  const plistXml = (ver) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleName</key><string>Electron</string><key>CFBundleIdentifier</key><string>com.github.Electron</string><key>CFBundleIconFile</key><string>electron.icns</string><key>CFBundleExecutable</key><string>Electron</string><key>CFBundleVersion</key><string>${ver}</string></dict></plist>\n`;
  fs.mkdirSync(path.join(app, 'MacOS'), { recursive: true }); fs.mkdirSync(path.join(app, 'Resources'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Info.plist'), plistXml('44.3.0'));
  fs.writeFileSync(path.join(app, 'MacOS', 'Electron'), '#!/bin/sh\n'); fs.chmodSync(path.join(app, 'MacOS', 'Electron'), 0o755);
  const face = path.join(tmp, 'face');
  fs.mkdirSync(path.join(face, 'app'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'app', 'iris.ico'), path.join(face, 'app', 'iris.ico'));
  const stateDir = path.join(face, 'state');
  const read = (bundle, key) => spawnSync('/usr/bin/plutil', ['-extract', key, 'raw', path.join(bundle, 'Contents', 'Info.plist')], { encoding: 'utf8' }).stdout.trim();
  const exe = macWindowExecutable(face, { stateDir });
  const bundle = path.join(stateDir, 'window.noindex', 'IRIS.app');
  ok(exe === path.join(bundle, 'Contents', 'MacOS', 'Electron') && fs.existsSync(exe), 'macOS 창: state/window.noindex/IRIS.app 의 실행 파일을 돌려준다');
  ok(read(bundle, 'CFBundleName') === 'IRIS' && read(bundle, 'CFBundleDisplayName') === 'IRIS' && read(bundle, 'CFBundleIdentifier') === WINDOW_BUNDLE_ID, 'macOS 창: Info.plist 이름·표시 이름 = IRIS, 번들 ID = ' + WINDOW_BUNDLE_ID);
  ok(read(bundle, 'CFBundleIconFile') === 'iris.icns' && fs.readFileSync(path.join(bundle, 'Contents', 'Resources', 'iris.icns')).subarray(0, 4).toString() === 'icns', 'macOS 창: 아이콘 = iris.ico 에서 만든 iris.icns');
  ok(read(bundle, 'CFBundleExecutable') === 'Electron' && read(app.replace(/\/Contents$/, ''), 'CFBundleName') === 'Electron', 'macOS 창: 실행 파일 이름은 그대로, 원본 Electron.app 은 손대지 않는다');
  const stamp = path.join(bundle, 'Contents', 'Resources', 'iris-window.json');
  const ino = fs.statSync(stamp).ino;
  macWindowExecutable(face, { stateDir });
  ok(fs.statSync(stamp).ino === ino, 'macOS 창: 표식이 같으면 다시 만들지 않는다');
  fs.writeFileSync(path.join(app, 'Info.plist'), plistXml('45.0.0'));
  macWindowExecutable(face, { stateDir });
  ok(fs.statSync(stamp).ino !== ino && read(bundle, 'CFBundleVersion') === '45.0.0' && read(bundle, 'CFBundleName') === 'IRIS', 'macOS 창: Electron 판이 바뀌면 새로 만든다');
  ok(!fs.readdirSync(path.dirname(bundle)).some((n) => n.includes('.tmp-')), 'macOS 창: 임시 사본이 남지 않는다');
  const blocked = path.join(tmp, 'blocked'); fs.writeFileSync(blocked, 'not a folder');
  const fallback = macWindowExecutable(face, { stateDir: blocked, log: () => {} });
  ok(fallback === path.join(app, 'MacOS', 'Electron'), 'macOS 창: 꾸러미를 못 만들면 원본 Electron.app 으로 띄운다');
  fs.rmSync(tmp, { recursive: true, force: true });
} else {
  console.log('SKIP macOS window bundle (not macOS)');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
