// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 시작 메뉴 「IRIS.lnk」 관리(v2.103, 2026-11-11 사용자 요청 "작업표시줄 아이콘도 아이리스 아이콘으로").
//
// 윈도 작업표시줄은 창의 앱 ID(AUMID)와 같은 ID 를 단 시작 메뉴 바로가기에서 단추 아이콘·이름을 가져온다. Electron 은 알림을
// 처음 쓸 때 시작 메뉴에 「<앱 이름>.lnk」를 검사해 대상 실행 파일·작업 폴더·앱 ID·알림 CLSID 네 가지가 맞으면 그대로 두고,
// 아니면 아이콘 없이 새로 쓴다(Electron shell/browser/notifications/win/windows_toast_activator.cc EnsureShortcut — 아이콘·인자는
// 보지 않고, 이미 있는 바로가기의 CLSID 를 넘겨받는다). 앱 이름이 기본값 'Electron' 이던 옛 창은 아이콘 없는 「Electron.lnk」가
// 생겨 작업표시줄에 Electron 아이콘이 떴다(2026-09-13 부터).
// 그래서 네 가지를 Electron 과 똑같이 맞춰 쓰고 CLSID 를 반드시 채워 두면, 아이콘과 인자(--launch)가 지워지지 않는다.
// 옛 「Electron.lnk」는 우리 앱 ID 이고 우리 electron.exe 를 가리킬 때만 CLSID 를 넘겨받고 지운다(다른 Electron 앱 것은 무접촉).
// 검사 = npm run verify:shortcut(임시 폴더에서 실제 Electron shell API 로).
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const OLD_NAME = 'Electron.lnk';

function samePath(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a !== '' && b !== ''
    && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** 바로가기 두 개(지금 IRIS.lnk · 옛 Electron.lnk 를 읽은 값, 없으면 null)를 보고 무엇을 할지 정한다. 파일은 건드리지 않는다. */
function shortcutPlan({ exe, mainScript, icon, aumid, current, old, newClsid = () => `{${crypto.randomUUID().toUpperCase()}}` }) {
  const ours = (s) => !!s && s.appUserModelId === aumid && samePath(s.target, exe);
  const clsid = (ours(current) && current.toastActivatorClsid) || (ours(old) && old.toastActivatorClsid) || newClsid();
  const want = {
    target: exe, args: `"${mainScript}" --launch`, cwd: path.dirname(exe), description: 'IRIS',
    icon, iconIndex: 0, appUserModelId: aumid, toastActivatorClsid: clsid,
  };
  const fine = ours(current) && samePath(current.cwd, want.cwd) && samePath(current.icon, icon) && current.args === want.args
    && String(current.toastActivatorClsid || '').toUpperCase() === clsid.toUpperCase();
  return { write: fine ? null : want, removeOld: ours(old) };
}

/**
 * dir(시작 메뉴 Programs) 안의 `<name>.lnk` 를 맞추고 옛 Electron.lnk 를 넘겨받는다.
 * shell = Electron shell(readShortcutLink·writeShortcutLink). 돌려주는 값 = { written, removedOld } — 실패는 던진다.
 */
function ensureShortcut({ shell, dir, name, exe, mainScript, icon, aumid }) {
  const lnk = path.join(dir, `${name}.lnk`), oldLnk = path.join(dir, OLD_NAME);
  if (!fs.existsSync(dir)) return { written: false, removedOld: false, skipped: 'no-dir' };
  if (samePath(lnk, oldLnk)) return { written: false, removedOld: false, skipped: 'same-name' };
  const read = (p) => { try { return fs.existsSync(p) ? shell.readShortcutLink(p) : null; } catch { return null; } };
  const plan = shortcutPlan({ exe, mainScript, icon, aumid, current: read(lnk), old: read(oldLnk) });
  if (plan.write && !shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? 'replace' : 'create', plan.write)) throw new Error('writeShortcutLink failed');
  if (plan.removeOld) fs.rmSync(oldLnk, { force: true });
  return { written: !!plan.write, removedOld: plan.removeOld };
}

module.exports = { shortcutPlan, ensureShortcut, OLD_NAME };
