// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// verify:shortcut — 시작 메뉴 「IRIS.lnk」(작업표시줄 아이콘의 원천, v2.103) 시험.
// 실제 Electron(node_modules 의 electron.exe)을 시험용 작은 주 파일로 띄워 진짜 shell.readShortcutLink/writeShortcutLink 로
// **임시 폴더 안에서만** 바로가기를 만들고 읽는다 — 진짜 시작 메뉴·실행 중인 IRIS 창(3458)은 건드리지 않는다.
// 보는 것: ① 새로 만들 때 아이콘·인자·앱 ID·CLSID·작업 폴더 ② 다시 불러도 안 씀 ③ 옛 Electron.lnk(우리 것) CLSID 넘겨받고 지움
// ④ 남의 Electron.lnk 는 무접촉 ⑤ Electron 이 아이콘 없이 다시 쓴 IRIS.lnk 를 아이콘째 되돌림(CLSID 유지)
// ⑥ Electron 의 검사 네 가지(대상·작업 폴더·앱 ID·CLSID)가 맞음 ⑦ main.cjs 가 이름 IRIS·사용자 데이터 고정·--launch 를 지킴.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const SHORTCUT = path.join(ROOT, 'app', 'electron', 'shortcut.cjs');
const ICON = path.join(ROOT, 'app', 'iris.ico');
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`); } };

// ⑦ main.cjs 정적 검사(윈도가 아니어도)
const mainSrc = fs.readFileSync(path.join(ROOT, 'app', 'electron', 'main.cjs'), 'utf8');
const iName = mainSrc.indexOf("app.setName('IRIS')"), iKeep = mainSrc.indexOf("app.setPath('userData', USER_DATA)"), iGet = mainSrc.indexOf("const USER_DATA = app.getPath('userData')");
ok(iGet >= 0 && iName > iGet && iKeep > iName, '⑦ 앱 이름 IRIS 로 바꾸기 전에 사용자 데이터 폴더를 잡고 되돌림(화면 설정 보존)');
ok(/process\.argv\.includes\('--launch'\)[\s\S]{0,200}launch-hidden\.vbs|LAUNCHER_VBS[\s\S]{0,300}--launch/.test(mainSrc), '⑦ --launch 로 켜지면 실행기(launch-hidden.vbs)에 넘김');
ok(/ensureStartMenuShortcut\(\);[^\n]*\n\s*const h = await ensureDaemon\(\)/.test(mainSrc), '⑦ 바로가기는 창을 만들기 전에 맞춤');
ok(/PORT !== 3458/.test(mainSrc.slice(mainSrc.indexOf('function ensureStartMenuShortcut'), mainSrc.indexOf('function ensureStartMenuShortcut') + 300)), '⑦ 시험 창(포트 ≠ 3458)은 진짜 시작 메뉴를 건드리지 않음');

if (process.platform !== 'win32' || !fs.existsSync(ELECTRON)) {
  console.log('SKIP 윈도·electron.exe 가 아니라 실제 바로가기 시험은 건너뜀');
  console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-lnk-'));
const menu = path.join(tmp, 'Programs');
fs.mkdirSync(menu);
const harness = path.join(tmp, 'harness.cjs');
const out = path.join(tmp, 'out.json');
// 시험용 주 파일: 시나리오를 차례로 돌려 결과를 JSON 으로 남기고 끝난다(창 없음).
fs.writeFileSync(harness, `
const { app, shell } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const { ensureShortcut } = require(${JSON.stringify(SHORTCUT)});
const menu = ${JSON.stringify(menu)}, icon = ${JSON.stringify(ICON)}, exe = process.execPath, main = ${JSON.stringify(path.join(ROOT, 'app', 'electron', 'main.cjs'))};
const AUMID = 'IRIS-Face';
const run = () => ensureShortcut({ shell, dir: menu, name: 'IRIS', exe, mainScript: main, icon, aumid: AUMID });
const read = (n) => { const p = path.join(menu, n); return fs.existsSync(p) ? shell.readShortcutLink(p) : null; };
const res = {};
app.whenReady().then(() => {
  try {
    res.exe = exe;
    res.s1 = run(); res.l1 = read('IRIS.lnk');
    res.s2 = run();
    // ③ 우리 옛 Electron.lnk(아이콘 없음, CLSID 있음) — 9/13 이 PC 와 같은 모양
    fs.rmSync(path.join(menu, 'IRIS.lnk'));
    const OLD = '{AC04A2E2-9FDC-46AB-906E-883EEDE56F71}';
    shell.writeShortcutLink(path.join(menu, 'Electron.lnk'), 'create', { target: exe, cwd: path.dirname(exe), appUserModelId: AUMID, toastActivatorClsid: OLD });
    res.s3 = run(); res.l3 = read('IRIS.lnk'); res.old3 = read('Electron.lnk'); res.oldClsid = OLD;
    // ④ 남의 Electron.lnk(다른 앱 ID) — 무접촉
    shell.writeShortcutLink(path.join(menu, 'Electron.lnk'), 'create', { target: exe, cwd: path.dirname(exe), appUserModelId: 'Someone.Else', toastActivatorClsid: '{11111111-2222-3333-4444-555555555555}' });
    res.s4 = run(); res.old4 = read('Electron.lnk');
    // ⑤ Electron 이 아이콘·인자 없이 다시 쓴 IRIS.lnk(CLSID 만 같음) — 아이콘째 되돌림, CLSID 유지
    const keep = read('IRIS.lnk').toastActivatorClsid;
    shell.writeShortcutLink(path.join(menu, 'IRIS.lnk'), 'replace', { target: exe, args: '', cwd: path.dirname(exe), appUserModelId: AUMID, toastActivatorClsid: keep, description: 'IRIS' });
    res.l5before = read('IRIS.lnk'); res.s5 = run(); res.l5 = read('IRIS.lnk'); res.keep5 = keep;
  } catch (e) { res.error = String(e && e.stack || e); }
  fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify(res));
  app.exit(0);
});
`);
const r = spawnSync(ELECTRON, [harness], { cwd: tmp, encoding: 'utf8', timeout: 60000, env: { ...process.env, ELECTRON_ENABLE_LOGGING: '' } });
let res = null;
try { res = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { /* 아래에서 FAIL */ }
ok(!!res && !res.error, '시험용 Electron 실행', res?.error || r.stderr?.slice(0, 400) || `code ${r.status}`);
if (res && !res.error) {
  const same = (a, b) => typeof a === 'string' && typeof b === 'string' && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  const GUID = /^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/i;
  const l1 = res.l1 || {};
  ok(res.s1.written && same(l1.icon, ICON), '① 새로 만든 IRIS.lnk 에 IRIS 아이콘', JSON.stringify(l1.icon));
  ok(l1.args === `"${path.join(ROOT, 'app', 'electron', 'main.cjs')}" --launch`, '① 인자 = main.cjs --launch(시작 메뉴·고정에서 실행기로)', l1.args);
  ok(l1.appUserModelId === 'IRIS-Face' && GUID.test(l1.toastActivatorClsid || ''), '① 앱 ID = IRIS-Face · 알림 CLSID 채움', `${l1.appUserModelId} ${l1.toastActivatorClsid}`);
  ok(same(l1.target, res.exe) && same(l1.cwd, path.dirname(res.exe)), '⑥ Electron 검사 네 가지 중 대상·작업 폴더가 Electron 이 기대하는 값(실행 파일·그 폴더)', `${l1.target} | ${l1.cwd}`);
  ok(!res.s2.written && !res.s2.removedOld, '② 다시 불러도 쓰지 않음(맞으면 무접촉)');
  ok(res.s3.removedOld && !res.old3, '③ 우리 옛 Electron.lnk 는 지움');
  ok((res.l3?.toastActivatorClsid || '').toUpperCase() === res.oldClsid, '③ 옛 바로가기의 알림 CLSID 를 넘겨받음(Electron 이 다시 쓰지 않게)', res.l3?.toastActivatorClsid);
  ok(same(res.l3?.icon, ICON), '③ 넘겨받은 IRIS.lnk 에도 아이콘');
  ok(!res.s4.removedOld && res.old4?.appUserModelId === 'Someone.Else', '④ 남의 Electron.lnk 는 무접촉');
  ok(!res.l5before?.icon && res.s5.written && same(res.l5?.icon, ICON) && res.l5?.args?.endsWith('--launch'), '⑤ 아이콘 없이 다시 쓰인 IRIS.lnk 를 아이콘·인자째 되돌림');
  ok((res.l5?.toastActivatorClsid || '').toUpperCase() === String(res.keep5).toUpperCase(), '⑤ 되돌릴 때 CLSID 유지');
}
// 뒷정리는 판정이 아니다(2026-11-13): 방금 만든 .lnk 를 탐색기·백신이 잠깐 쥐고 있으면 rmSync 가 EPERM 으로 던져,
// 판정 16개가 전부 통과하고도 검사가 "실패"로 끝났다(6번 중 4번). 잠시 기다리며 다시 지워 보고, 그래도 남으면 알리기만 한다.
try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 }); }
catch (e) { console.log(`(뒷정리: 임시 폴더를 지우지 못했습니다 — ${e.code || e.message}. 판정과는 무관하며 %TEMP% 의 ${path.basename(tmp)} 가 남았습니다)`); }
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
