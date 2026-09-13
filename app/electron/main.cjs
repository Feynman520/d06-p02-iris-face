// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// IRIS-Face Electron 창(데몬 클라이언트). 데몬이 세션을 소유하므로 창은 언제든 닫아도 된다.
// 창 X = 트레이로 숨김. 트레이: 창 열기 · 세션 N개 · 전부 종료(확인) · 창만 닫기.
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const URL_ = 'http://127.0.0.1:3458/';
const STATE = path.join(ROOT, 'state');
const TIP = `IRIS · by ${String(PKG.author || '').replace(/\s*\(.*\)$/, '') || 'Sejun Ham'}`; // 트레이 툴팁의 각인(원천 = package.json author)
let win = null, tray = null, quitting = false, lastHealth = null;

// 윈도 OS 알림(작업 완료, 2026-09-11)은 앱 사용자 모델 ID가 있어야 앱 이름으로 뜬다(없으면 'electron.app.Electron')
app.setAppUserModelId('IRIS-Face');
if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  // 두 번째 실행(바로가기 재클릭): 숨어 있던 창을 다시 띄우고, 데몬이 새로 떴을 수 있으니 페이지를 다시 연다
  app.on('second-instance', async () => { await ensureDaemon(); showWindow(); if (win) win.loadURL(URL_); });
  app.whenReady().then(main);
}

async function health() {
  try { const r = await fetch(URL_ + 'api/health'); return r.ok ? await r.json() : null; } catch { return null; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function spawnDaemon() {
  fs.mkdirSync(STATE, { recursive: true });
  const out = fs.openSync(path.join(STATE, 'daemon.out.log'), 'a');
  // Electron 안의 node가 아니라 시스템 node로 데몬을 띄운다(node-pty ABI = Node). node.exe라 shell 불필요.
  const child = spawn('node', [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.unref();
}
async function ensureDaemon() {
  let h = await health();
  if (!h) {
    // 최대 2번 시도(포트가 아직 안 풀렸으면 잠시 뒤 다시)
    for (let attempt = 0; attempt < 2 && !h; attempt++) {
      spawnDaemon();
      for (let i = 0; i < 25 && !h; i++) { await sleep(400); h = await health(); }
    }
    if (!h) { dialog.showErrorBox('IRIS', '데몬을 시작하지 못했습니다. state\\daemon.out.log 를 확인하세요.'); app.exit(1); return null; }
  } else if (h.version !== PKG.version) {
    // 버전 불일치: 세션이 없으면 조용히 재시작, 있으면 사용자에게 묻는다(재시작하면 세션이 끊긴다)
    const restart = h.sessions === 0 ? 1 : dialog.showMessageBoxSync({ type: 'question', buttons: ['그대로 사용', '재시작(세션 끊김)'], defaultId: 0, cancelId: 0, title: 'IRIS', message: `데몬 버전(${h.version})이 앱 버전(${PKG.version})과 다릅니다. 살아 있는 세션 ${h.sessions}개는 재시작하면 끊깁니다.` });
    if (restart === 1) {
      try { await fetch(URL_ + 'api/shutdown', { method: 'POST' }); } catch {}
      for (let i = 0; i < 20 && (await health()); i++) await sleep(300); // 포트가 풀릴 때까지 기다린 뒤 다시 띄운다
      await sleep(500);
      return ensureDaemon();
    }
  }
  return h;
}

function trayIcon() {
  // 32×32 BGRA 마름모(◈) — 외부 이미지 파일 없이 그린다
  const S = 32, buf = Buffer.alloc(S * S * 4, 0);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.abs(x - 15.5) + Math.abs(y - 15.5);
    const inner = d <= 6, ring = d <= 14 && d >= 9.5;
    if (inner || ring) { const o = (y * S + x) * 4; buf[o] = 247; buf[o + 1] = 162; buf[o + 2] = 122; buf[o + 3] = 255; } // #7aa2f7
  }
  return nativeImage.createFromBitmap(buf, { width: S, height: S });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, backgroundColor: '#0f1218', title: 'IRIS', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.loadURL(URL_);
  win.once('ready-to-show', () => win.show());
  // 키 입력 자가 복구(2026-09-10): 페이지가 "눌렀는데 초점이 없다"고 알리면 창을 blur→focus 해 OS 키보드 초점을 되찾는다.
  // (네이티브 alert/confirm 뒤 창이 초점을 잃어 입력이 죽던 버그의 안전망 — 원인 자체는 app/dialog.js 로 제거)
  win.on('focus', () => { try { win.webContents.focus(); } catch {} });
  // Esc 중계(2026-09-10): 초점이 대화 안 미리보기 iframe(PDF 뷰어 등)에 있으면 페이지 문서에 keydown이 오지 않아 Esc 중단이 죽는다.
  // before-input-event는 어느 프레임에 초점이 있든 창 단위로 먼저 받으므로, 여기서 잡아 페이지에 알린다(페이지가 중복은 300ms 가드로 걸러냄).
  win.webContents.on('before-input-event', (_e, input) => { if (input.type === 'keyDown' && input.key === 'Escape' && !input.isAutoRepeat) { try { win.webContents.send('iris:escape'); } catch {} } });
  // 데몬이 아직 안 떴거나 재시작 중이면 1.5초마다 다시 시도(빈 창·연결 거부 화면 방지)
  win.webContents.on('did-fail-load', (_e, _code, _desc, _url, isMainFrame) => { if (isMainFrame && win) setTimeout(() => { if (win) win.loadURL(URL_); }, 1500); });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  // 화면의 ⏻ 전부 종료(POST /api/shutdown 성공) → 데몬이 내려가므로 창·트레이도 즉시 끝낸다(5초 폴링 3회를 기다리지 않음)
  win.webContents.session.webRequest.onCompleted({ urls: [URL_ + 'api/shutdown'] }, (d) => {
    if (d.method === 'POST' && d.statusCode === 200 && !quitting) { quitting = true; setTimeout(() => app.quit(), 300); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  const menu = Menu.buildFromTemplate([{ label: '보기', submenu: [{ role: 'reload', accelerator: 'F5' }, { role: 'toggleDevTools', accelerator: 'F12' }, { type: 'separator' }, { label: '창 숨기기', accelerator: 'Ctrl+W', click: () => win.hide() }] }]);
  Menu.setApplicationMenu(menu);
}
function showWindow() { if (!win) createWindow(); win.show(); win.focus(); }
// 사용자가 방금 이 창을 눌렀을 때만 페이지가 부르므로, 앞창 자리를 되찾는(steal) 것이 곧 사용자의 뜻이다(윈도의 앞창 잠금 우회).
ipcMain.handle('iris:refocus', () => { if (!win || win.isDestroyed()) return false; try { win.show(); win.focus(); app.focus({ steal: true }); win.webContents.focus(); } catch {} return true; });
// 무대 실측(2026-09-13, v2.51): 프로세스별 CPU%(한 코어 = 100, 지난 호출 이후 평균; 첫 호출은 0) — 페이지의 stars.js calibrate() 가 GPU 프로세스+렌더러의 추가 부담을 잰다
ipcMain.handle('iris:metrics', () => { try { return app.getAppMetrics().map(m => ({ type: m.type, pid: m.pid, cpu: m.cpu?.percentCPUUsage ?? 0 })); } catch { return []; } });

function buildTrayMenu() {
  const n = lastHealth ? lastHealth.sessions : '?';
  return Menu.buildFromTemplate([
    { label: '창 열기', click: showWindow },
    { label: lastHealth ? `세션 ${n}개 · 데몬 pid ${lastHealth.pid}` : '데몬 끊김', enabled: false },
    { label: 'IRIS 정보…', click: () => { showWindow(); try { win.webContents.send('iris:about'); } catch {} } }, // 만든 사람·명함·버전(페이지 안 대화상자, 2026-09-10 각인)
    { type: 'separator' },
    { label: '전부 종료 (데몬 + 세션)', click: async () => {
      const h = await health();
      const r = dialog.showMessageBoxSync({ type: 'warning', buttons: ['취소', '전부 종료'], defaultId: 0, cancelId: 0, title: 'IRIS', message: `세션 ${h ? h.sessions : '?'}개를 각 PID 기준으로 끝내고 데몬을 종료합니다. 계속할까요?` });
      if (r !== 1) return;
      try { await fetch(URL_ + 'api/shutdown', { method: 'POST' }); } catch {}
      quitting = true; app.quit();
    } },
    { label: '창만 닫기 (세션 유지)', click: () => { quitting = true; app.quit(); } },
  ]);
}

async function main() {
  const h = await ensureDaemon(); if (!h) return;
  lastHealth = h;
  tray = new Tray(trayIcon());
  tray.setToolTip(TIP);
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showWindow);
  createWindow();
  let downTicks = 0;
  setInterval(async () => {
    lastHealth = await health();
    // 화면의 ⏻(전부 종료)로 데몬이 내려갔는데 창만 남으면 다음 실행이 막히므로(단일 실행 잠금) 앱도 함께 끝낸다
    if (!lastHealth) { if (++downTicks >= 3) { quitting = true; app.quit(); return; } } else downTicks = 0;
    tray.setContextMenu(buildTrayMenu());
    tray.setToolTip(lastHealth ? `${TIP} · 세션 ${lastHealth.sessions}개` : `${TIP} · 데몬 끊김`);
    if (win) win.setTitle(lastHealth ? `IRIS · 세션 ${lastHealth.sessions}개` : 'IRIS (데몬 끊김 — 세션이 죽었을 수 있습니다)');
  }, 5000);
}
app.on('window-all-closed', (e) => { /* 트레이 상주 */ });
app.on('before-quit', () => { quitting = true; });
