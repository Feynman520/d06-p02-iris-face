// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 운영체제 차이를 이 파일 한 곳에 모은다(macOS 이식, 2026-10-27 — 설계 정본 = P03 docs/설계-macOS.md).
// 규칙: Windows 갈래는 이식 전 코드의 동작을 글자 그대로 옮긴 것이다(cmd.exe /c · taskkill · explorer.exe).
// 다른 OS 갈래만 새로 생긴다. 시험이 두 갈래를 다 보도록 모든 함수가 { platform } 을 받는다(기본 = 이 기계).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const isWin = (platform = process.platform) => platform === 'win32';
export const isMac = (platform = process.platform) => platform === 'darwin';

/** 심 파일 이름: Windows = claude.cmd, macOS = claude(실행 권한 0755 sh). */
export const shimFile = (name, { platform } = {}) => (isWin(platform) ? `${name}.cmd` : name);

/**
 * 에이전트 CLI 를 가상 터미널로 띄울 명령. Windows 는 PATH 의 claude.cmd/codex.cmd 를 cmd.exe /c 로(이식 전 그대로),
 * macOS 는 PATH 에서 찾은 심 파일을 직접 실행한다(sh 심이 설정 폴더·중계기 주소를 맞춘다).
 * @returns {{ file:string, args:string[] }}
 */
export function agentLaunch(argv, { platform } = {}) {
  if (isWin(platform)) return { file: 'cmd.exe', args: ['/c', ...argv] };
  return { file: argv[0], args: argv.slice(1) };
}

/** 명령 { file, args } 의 첫 낱말(에이전트 이름). cmd.exe /c 를 건너뛴다. */
export function launchedProgram(cmd) {
  const first = /^cmd(\.exe)?$/i.test(path.basename(String(cmd?.file || ''))) && /^\/c$/i.test(String(cmd?.args?.[0] || '')) ? cmd.args[1] : cmd?.file;
  return path.basename(String(first || '')).replace(/\.cmd$/i, '');
}

/**
 * 실행 파일 이름을 그 env 의 PATH 로 푼다(macOS — node-pty 의 execvp 가 데몬 자신의 PATH 를 보는 판이 있어 절대 경로로 넘긴다).
 * 못 찾으면 이름 그대로 돌려준다(그러면 pty 가 "command not found" 로 끝나고 카드가 exited 로 보인다).
 */
export function resolveOnPath(file, env = process.env, { platform } = {}) {
  if (isWin(platform) || !file || file.includes('/')) return file;
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  for (const dir of String(env[key] || '').split(':')) {
    if (!dir) continue;
    const p = path.join(dir, file);
    try { fs.accessSync(p, fs.constants.X_OK); if (fs.statSync(p).isFile()) return p; } catch {}
  }
  return file;
}

/**
 * 세션 프로세스 트리 하나를 끝낸다. Windows = taskkill /T /F(이식 전 그대로).
 * macOS = node-pty 의 자식은 setsid 로 새 세션·프로세스 그룹의 우두머리라 그룹 전체(-pid)에 SIGKILL — 데몬이 띄운 그 PID 의 그룹만.
 */
export function killTree(pid, { platform } = {}) {
  if (!pid) return;
  if (isWin(platform)) { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); return; }
  try { process.kill(-pid, 'SIGKILL'); return; } catch {}
  try { process.kill(pid, 'SIGKILL'); } catch {}
}

/** 데몬이 세션 PATH 맨 앞에 넣는 동봉 도구 폴더(심 다음). macOS 의 git 은 심만 거친다(dugite 환경변수, P03 D-M13). */
export function bundledBinDirs(toolPath, { platform } = {}) {
  if (isWin(platform)) return [toolPath('node'), toolPath('git', 'cmd'), toolPath('python')];
  return [toolPath('node', 'bin'), toolPath('python', 'bin')];
}

/** 동봉 node 실행 파일. */
export const bundledNode = (toolPath, { platform } = {}) => (isWin(platform) ? toolPath('node', 'node.exe') : toolPath('node', 'bin', 'node'));

/** 화면이 보낸 경로를 이 OS 의 경로로. 화면의 폴더 상대경로는 늘 `\` 로 잇는다(온톨로지·폴더 선택기 약속, Windows 그대로) —
 *  macOS 폴더 이름에는 `\` 를 쓰지 않으므로(튜토리얼 BAD_CHARS) `/` 로 바꿔도 뜻이 바뀌지 않는다. */
export const nativePath = (p, { platform } = {}) => (isWin(platform) ? String(p ?? '') : String(p ?? '').replace(/\\/g, '/'));

/** 이 OS 의 상대경로를 화면 약속(`\` 구분)으로. Windows 경로는 그대로다. */
export const appRel = (p) => String(p ?? '').replace(/\//g, '\\');

/** 이 PC 의 시스템 폴더(파일 삽입·열기 거부). */
export function isSystemPath(file, { platform } = {}) {
  if (isWin(platform)) return /^[A-Za-z]:\\(windows|program files|program files \(x86\)|programdata)\\/i.test(file);
  return /^\/(System|Library|usr|bin|sbin|etc|var|private|cores|dev|opt|Applications)(\/|$)/.test(file);
}

/** 이 PC 의 로컬 절대 경로인가(열기 API). */
export const isLocalAbsolute = (file, { platform } = {}) => (isWin(platform) ? /^[A-Za-z]:\\/.test(file) : path.posix.isAbsolute(file));

/** 기본 앱으로 열면 무언가를 **실행**하게 되는 파일인가. macOS 의 `open` 은 .command·.sh·실행 권한 파일을 터미널에서 돌린다. */
export function isExecutableFile(file, { platform } = {}) {
  if (isWin(platform)) return /\.(exe|bat|cmd|com|ps1|vbs|js|msi|scr|lnk)$/i.test(file);
  if (/\.(command|tool|sh|bash|zsh|csh|app|pkg|mpkg|dmg|scpt|scptd|applescript|workflow|terminal|jar|js|mjs|cjs|py|pl|rb|webloc|inetloc|fileloc)$/i.test(file)) return true;
  try { return (fs.statSync(file).mode & 0o111) !== 0; } catch { return false; }
}

/**
 * 파일·폴더를 이 PC 의 기본 앱(탐색기·Finder)으로 연다. 경로는 인수 하나로만 넘긴다(셸 재해석 없음).
 * Windows 폴더 창에는 windowsHide 를 주지 않는다(v2.92 — SW_HIDE 가 새 창에 그대로 쓰임), 파일은 이식 전처럼 준다.
 */
export function openInDesktop(target, { folder = false, platform } = {}) {
  if (isWin(platform)) {
    spawn('explorer.exe', [target], folder ? { detached: true, stdio: 'ignore' } : { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  spawn('/usr/bin/open', [target], { detached: true, stdio: 'ignore' }).unref();
}

/** 주소를 기본 브라우저로 연다. */
export function openUrl(url, { platform } = {}) {
  if (isWin(platform)) { spawn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true, detached: true, stdio: 'ignore' }).unref(); return; }
  spawn('/usr/bin/open', [url], { detached: true, stdio: 'ignore' }).unref();
}

// ---- macOS 창 꾸러미 -------------------------------------------------------------------------
// Electron.app 을 그대로 띄우면 Dock·앱 전환기·메뉴 막대·알림에 「Electron」 이름과 아이콘이 뜬다(2026-10-28 macOS 실설치 신고).
// 그래서 state/ 에 Info.plist 의 이름·번들 ID·아이콘만 바꾼 복제본 IRIS.app 을 만들어 그것을 띄운다 — APFS 복제(cp -c)라
// 공간·시간이 거의 들지 않는다. 실행 파일·도우미 앱 이름은 그대로다(Electron 은 도우미를 컴파일된 이름 「Electron Helper」로
// 먼저 찾는다). 앱 이름(app.getName)·userData 도 그대로라 창의 설정(localStorage)·단일 실행 잠금이 옮겨 가지 않는다.
// 동봉 Electron 은 Info.plist 가 서명에 묶이지 않은 링커 서명이라 고쳐도 서명 상태가 원본과 같다(codesign --verify 결과 동일).
// 폴더 이름 끝의 `.noindex` 는 Spotlight 가 이 사본을 「IRIS」 앱으로 내놓지 않게 한다(인수 없이 띄우면 Electron 기본 창이 뜬다 —
// 사람이 여는 입구는 설치기가 만든 ~/Applications/IRIS.app 하나).
// Electron 판(원본 Info.plist)·아이콘이 바뀌면 표식으로 알아채 다시 만들고, 못 만들면 원본 Electron.app 실행 파일을 돌려준다.
export const WINDOW_APP_NAME = 'IRIS';
export const WINDOW_BUNDLE_ID = 'com.iris-workspace.face';
const ICNS_1X = { 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };
const ICNS_2X = { 32: 'ic11', 64: 'ic12', 256: 'ic13', 512: 'ic14' };

/** .ico 안의 PNG 판(16~256px)을 그대로 .icns 로 묶는다(P03 installer/lib/handoff.mjs icoToIcns 와 같은 규칙). PNG 판이 없으면 null. */
export function icoToIcns(ico) {
  const entries = [];
  try {
    for (let i = 0, n = ico.readUInt16LE(4); i < n; i++) {
      const e = 6 + 16 * i, w = ico[e] || 256, len = ico.readUInt32LE(e + 8), off = ico.readUInt32LE(e + 12);
      if (ico.readUInt32BE(off) !== 0x89504e47) continue; // BMP 판은 건너뛴다
      for (const type of [ICNS_1X[w], ICNS_2X[w]]) if (type && !entries.some((x) => x.type === type)) entries.push({ type, data: ico.subarray(off, off + len) });
    }
  } catch { return null; }
  if (!entries.length) return null;
  const total = 8 + entries.reduce((sum, x) => sum + 8 + x.data.length, 0);
  const out = Buffer.alloc(total);
  out.write('icns', 0, 'ascii'); out.writeUInt32BE(total, 4);
  let at = 8;
  for (const x of entries) { out.write(x.type, at, 'ascii'); out.writeUInt32BE(8 + x.data.length, at + 4); x.data.copy(out, at + 8); at += 8 + x.data.length; }
  return out;
}

/**
 * macOS 창 실행 파일 경로: `<stateDir>/window.noindex/IRIS.app/Contents/MacOS/Electron`(없거나 낡았으면 지금 만든다).
 * 만들지 못하면 원본 `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`.
 */
export function macWindowExecutable(root, { stateDir = path.join(root, 'state'), iconIco = path.join(root, 'app', 'iris.ico'), log = () => {} } = {}) {
  const src = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app');
  const exe = (app) => path.join(app, 'Contents', 'MacOS', 'Electron');
  const dst = path.join(stateDir, 'window.noindex', `${WINDOW_APP_NAME}.app`);
  const stampOf = (app) => path.join(app, 'Contents', 'Resources', 'iris-window.json');
  let icon = null;
  try { icon = fs.readFileSync(iconIco); } catch { /* 아이콘 없음 → Electron 아이콘 그대로, 이름만 바꾼다 */ }
  let want;
  try {
    const sha = (b) => createHash('sha256').update(b).digest('hex');
    want = JSON.stringify({ v: 1, name: WINDOW_APP_NAME, id: WINDOW_BUNDLE_ID, plist: sha(fs.readFileSync(path.join(src, 'Contents', 'Info.plist'))), icon: icon ? sha(icon) : null });
  } catch { return exe(src); } // 원본이 없다 — 부르는 쪽의 「electron 없음」 처리에 맡긴다
  const fresh = (app) => { try { return fs.readFileSync(stampOf(app), 'utf8') === want && fs.existsSync(exe(app)); } catch { return false; } };
  if (fresh(dst)) return exe(dst);
  const tmp = `${dst}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    const cp = spawnSync('/bin/cp', ['-cR', src, tmp], { stdio: 'ignore' }); // APFS 복제(clonefile) — 다른 파일 시스템이면 실패 → 원본으로
    if (cp.status !== 0) throw new Error(`cp -c 실패(${cp.status})`);
    const icns = icon ? icoToIcns(icon) : null;
    if (icns) fs.writeFileSync(path.join(tmp, 'Contents', 'Resources', 'iris.icns'), icns);
    const plist = path.join(tmp, 'Contents', 'Info.plist');
    const keys = [['CFBundleName', WINDOW_APP_NAME], ['CFBundleDisplayName', WINDOW_APP_NAME], ['CFBundleIdentifier', WINDOW_BUNDLE_ID], ...(icns ? [['CFBundleIconFile', 'iris.icns']] : [])];
    for (const [k, v] of keys) {
      const r = spawnSync('/usr/bin/plutil', ['-replace', k, '-string', v, plist], { stdio: 'ignore' });
      if (r.status !== 0) throw new Error(`plutil ${k} 실패(${r.status})`);
    }
    fs.writeFileSync(stampOf(tmp), want);
    if (fresh(dst)) { fs.rmSync(tmp, { recursive: true, force: true }); return exe(dst); } // 동시에 뜬 다른 실행기가 먼저 만들었다
    fs.rmSync(dst, { recursive: true, force: true });
    fs.renameSync(tmp, dst);
    log(`[iris-face] window bundle ready: ${dst}`);
    return exe(dst);
  } catch (e) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    log(`[iris-face] window bundle failed (${e?.message || e}) — using Electron.app as is`, true);
    return exe(src);
  }
}
