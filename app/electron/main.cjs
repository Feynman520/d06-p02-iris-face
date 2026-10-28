// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// IRIS-Face Electron 창(데몬 클라이언트). 데몬이 세션을 소유한다.
// v2.97(2026-10-28 사용자 결정): 창 ×·Alt+F4 = IRIS 전부 종료(모든 세션 + 그 세션의 로컬 MCP) → 결과 확인 → 창·트레이 종료.
//   최소화·Ctrl+W(내려놓기) = 세션 유지. 트레이: 창 열기 · 세션 N개 · 전부 종료(확인) · 화면 다시 띄우기(세션 유지, 창 코드만 새로 읽음).
//   ×·⏻·트레이 「전부 종료」는 모두 quitAll() 한 길 → 데몬 POST /api/shutdown?wait=1(정리·확인이 끝난 뒤 보고) 한 길.
//   (v2.96 까지: 창 × = 트레이로 숨김, 트레이 「창만 닫기 (세션 유지)」)
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
// 포트 단일 소스(launch.mjs 와 같은 순서): --port > IRIS_FACE_PORT > 3458. 예전엔 3458 고정이라 다른 포트에서 빈 창이 떴다(2026-09-19).
const PORT = Number((process.argv.find((a) => a.startsWith('--port=')) || '').slice(7)) || Number(process.env.IRIS_FACE_PORT) || 3458;
const URL_ = `http://127.0.0.1:${PORT}/`;
const STATE = path.join(ROOT, 'state');
const TIP = `IRIS · by ${String(PKG.author || '').replace(/\s*\(.*\)$/, '') || 'Sejun Ham'}`; // 트레이 툴팁의 각인(원천 = package.json author)
// IRIS 아이콘(2026-09-13, v2.57.1): app/iris.ico 한 파일이 창·작업표시줄·트레이·설치기 바탕화면 바로가기의 공통 원천.
// (별의 구 아이콘 — 이 PC의 바탕화면 바로가기가 쓰던 그 파일.) 없으면 예전처럼 그려 쓰는 마름모로 되돌아간다.
const ICON_PATH = path.join(ROOT, 'app', 'iris.ico');
const ICON = fs.existsSync(ICON_PATH) ? ICON_PATH : null;
let win = null, tray = null, quitting = false, lastHealth = null;
let quitFlow = null, closeAsking = false; // 전부 종료 진행 중(약속 하나) · 페이지에 "닫아도 되나" 묻는 중 — 연속 ×·되풀이 close 를 한 번으로 묶는다
const QUIT_TIMEOUT_MS = 35_000;           // 데몬 쪽 상한(모듈 2.5초 + 세션 20초)보다 넉넉히. 넘으면 거짓 완료 없이 사용자에게 알린다.

// 시험용 두 번째 창(포트가 기본 3458 이 아님)은 사용자 데이터·단일 실행 잠금을 따로 쓴다 — 실제 창에 "두 번째 실행" 신호가 가지 않게(v2.97 검사)
if (PORT !== 3458) app.setPath('userData', path.join(app.getPath('userData'), `port-${PORT}`));
// 윈도 OS 알림(작업 완료, 2026-09-11)은 앱 사용자 모델 ID가 있어야 앱 이름으로 뜬다(없으면 'electron.app.Electron')
app.setAppUserModelId('IRIS-Face');
if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  // 두 번째 실행(바로가기 재클릭): 내려놓은 창을 다시 띄우고, 데몬이 새로 떴을 수 있으니 페이지를 다시 연다(종료 중이면 아무것도 안 함)
  app.on('second-instance', async () => { if (quitFlow) return; await ensureDaemon(); showWindow(); if (win) win.loadURL(URL_); });
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
  // app/iris.ico 가 있으면 그것(윈도가 트레이 크기에 맞는 판을 고른다), 없으면 아래 그려 쓰는 마름모(◈).
  if (ICON) { try { const img = nativeImage.createFromPath(ICON); if (!img.isEmpty()) return img; } catch {} }
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
    ...(ICON ? { icon: ICON } : {}),
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
  // 창 ×·Alt+F4·작업표시줄 「창 닫기」 = 전부 종료(v2.97). 종료가 끝날 때까지 창은 열어 둔 채 「종료하는 중」을 보인다.
  win.on('close', (e) => { if (quitting) return; e.preventDefault(); requestClose(); });
  // 윈도 로그오프·끄기: OS 가 어차피 모두 끝내므로 막지 않는다(세션은 다음 실행 때 '잃은 세션'으로 자동 재개 — 기존 동작)
  win.on('session-end', () => { quitting = true; });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // 끌어다 놓기 안전망(v2.85): 페이지가 놓기를 못 막은 경우에도 창·프레임이 놓은 파일(file://)로 넘어가지 않게(화면은 전부 http 데몬 주소라 file:// 이동은 쓸 일이 없다)
  win.webContents.on('will-frame-navigate', (e) => { if (/^file:/i.test(e.url || '')) { e.preventDefault(); } });
  const menu = Menu.buildFromTemplate([{ label: '보기', submenu: [{ role: 'reload', accelerator: 'F5' }, { role: 'toggleDevTools', accelerator: 'F12' }, { type: 'separator' }, { label: '창 내려놓기 (세션 유지)', accelerator: 'Ctrl+W', click: () => { if (win && !win.isDestroyed()) win.minimize(); } }] }]);
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
    { label: '전부 종료 (모든 세션과 MCP)', enabled: !quitFlow, click: async () => {
      const h = await health();
      const r = dialog.showMessageBoxSync({ type: 'warning', buttons: ['취소', '전부 종료'], defaultId: 0, cancelId: 0, title: 'IRIS', message: `세션 ${h ? h.sessions : '?'}개와 그 세션이 띄운 로컬 MCP 를 끝내고 IRIS 를 종료합니다. 대화 기록은 남습니다. 계속할까요?` });
      if (r !== 1) return;
      quitAll();
    } },
    // 화면만 다시 띄우기(옛 「창만 닫기」의 내부 용도): 창 프로그램만 새로 시작해 창·preload 코드 변경을 읽는다. 세션·데몬은 그대로 — 닫기가 아니다.
    { label: '화면 다시 띄우기 (세션 유지)', enabled: !quitFlow, click: () => { quitting = true; app.relaunch(); app.exit(0); } },
  ]);
}

// ---- 전부 종료(v2.97) ----
// 창 × 를 누르면 먼저 페이지에 묻는다: 작업 중인 세션이 있으면 페이지 안 확인 창(app/dialog.js — 네이티브 확인창은 키 입력 초점을 잃게 함),
// 없으면 바로 진행. 페이지가 받았다는 신호(ack)를 1.5초 안에 못 주면(불러오는 중·멈춤) 사용자가 × 를 누른 뜻대로 진행하고,
// 받았다면 사용자가 확인 창에서 고를 때까지 기다린다.
let askSeq = 0;
function askPage(channel, ackMs = 1500) {
  if (!win || win.isDestroyed() || win.webContents.isLoading() || win.webContents.isCrashed()) return Promise.resolve(true);
  const id = ++askSeq;
  return new Promise((resolve) => {
    let t = setTimeout(() => done(true), ackMs);
    function done(go) { clearTimeout(t); ipcMain.removeListener('iris:close-ack', onAck); ipcMain.removeListener('iris:close-answer', onAnswer); resolve(go); }
    function onAck(_e, a) { if (a && a.id === id) clearTimeout(t); }
    function onAnswer(_e, a) { if (a && a.id === id) done(a.go !== false); }
    ipcMain.on('iris:close-ack', onAck); ipcMain.on('iris:close-answer', onAnswer);
    try { win.webContents.send(channel, id); } catch { done(true); }
  });
}
async function requestClose() {
  if (quitFlow || closeAsking) return;  // 이미 묻는 중·종료 중이면 연속 × 는 무시
  closeAsking = true;
  let go = true;
  try { if (win && !win.isDestroyed() && win.isMinimized()) win.restore(); go = await askPage('iris:close-request'); } finally { closeAsking = false; }
  if (go) quitAll();
}
function sendPage(channel, payload) { try { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); } catch {} }
function finishQuit() { quitting = true; try { tray?.destroy(); } catch {} tray = null; app.quit(); }
function reportDetail(report, error) {
  const lines = [];
  for (const p of (report?.survivors || []).slice(0, 12)) lines.push(`· PID ${p.pid} ${p.name || '(이름 모름)'}${p.session ? ` — 세션 ${p.session}` : ''}`);
  if ((report?.survivors || []).length > 12) lines.push(`· 그 밖에 ${report.survivors.length - 12}개`);
  if (report && !report.verified) lines.push('· 프로세스 목록을 읽지 못해 세션 아래 프로그램(MCP)까지 끝났는지 확인하지 못했습니다.');
  if (report?.timeout) lines.push('· 세션 정리가 제한 시간(20초) 안에 끝나지 않았습니다.');
  if (!report) lines.push(`· 종료 결과 보고를 받지 못했습니다${error ? ` (${error})` : ''}.`);
  lines.push('', '자세한 기록: IRIS-Face 폴더 state\\shutdown-report.json · state\\daemon.log');
  return lines.join('\n');
}
// ① 종료 요청 → ② 데몬이 세션·로컬 MCP 정리 → ③ 보고·데몬 종료 확인 → ④ 창·트레이 종료. 여러 번 불려도 한 번만 돈다.
function quitAll() {
  if (quitFlow) { showWindow(); return quitFlow; }
  quitFlow = (async () => {
    const before = await health();
    if (!before) return finishQuit(); // 데몬이 이미 없다 = 끝낼 세션이 없다
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); }
    sendPage('iris:quitting', { sessions: before.sessions });
    try { tray?.setContextMenu(buildTrayMenu()); tray?.setToolTip(`${TIP} · 종료하는 중`); } catch {}
    let report = null, error = '';
    try {
      const r = await fetch(URL_ + 'api/shutdown?wait=1', { method: 'POST', signal: AbortSignal.timeout(QUIT_TIMEOUT_MS) });
      const j = await r.json().catch(() => ({})); report = j.report || null; if (!r.ok) error = j.error || `HTTP ${r.status}`;
    } catch (e) { error = e?.name === 'TimeoutError' ? `${QUIT_TIMEOUT_MS / 1000}초 동안 응답 없음` : (e?.message || String(e)); }
    let gone = false;
    for (let i = 0; i < 24 && !gone; i++) { gone = !(await health()); if (!gone) await sleep(250); }
    if (gone && report?.ok) return finishQuit();
    if (gone) { // 데몬은 내려갔지만 남은 것이 있거나 확인 못 함 — 무엇이 남았는지 알리고 닫는다(되돌릴 데몬이 없다)
      await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, { type: 'warning', buttons: ['닫기'], defaultId: 0, title: 'IRIS', message: 'IRIS 를 종료했지만 일부를 확인하지 못했습니다.', detail: reportDetail(report, error) });
      return finishQuit();
    }
    // 데몬이 아직 살아 있다 — "종료됨"으로 꾸미지 않고 창을 남긴 채 묻는다
    const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, { type: 'error', buttons: ['다시 시도', '창 유지'], defaultId: 0, cancelId: 1, title: 'IRIS', message: 'IRIS 종료가 끝나지 않았습니다. 세션이 아직 실행 중일 수 있습니다.', detail: reportDetail(report, error) });
    quitFlow = null;
    sendPage('iris:quit-cancel');
    try { tray?.setContextMenu(buildTrayMenu()); tray?.setToolTip(TIP); } catch {}
    try { win.show(); win.focus(); app.focus({ steal: true }); win.webContents.focus(); } catch {} // 네이티브 대화상자 뒤 키보드 초점 되찾기
    if (response === 0) return quitAll();
  })();
  return quitFlow;
}
ipcMain.handle('iris:quit-all', () => { quitAll(); return true; }); // 화면 ⏻(페이지가 이미 확인을 받음)

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
    if (quitFlow) return; // 전부 종료 중에는 quitAll() 이 결과를 판정한다
    lastHealth = await health();
    // 데몬이 다른 길(업데이트 적용 등)로 내려갔는데 창만 남으면 다음 실행이 막히므로(단일 실행 잠금) 앱도 함께 끝낸다
    if (quitFlow) return;
    if (!lastHealth) { if (++downTicks >= 3) { quitting = true; app.quit(); return; } } else downTicks = 0;
    tray.setContextMenu(buildTrayMenu());
    tray.setToolTip(lastHealth ? `${TIP} · 세션 ${lastHealth.sessions}개` : `${TIP} · 데몬 끊김`);
    if (win) win.setTitle(lastHealth ? `IRIS · 세션 ${lastHealth.sessions}개` : 'IRIS (데몬 끊김 — 세션이 죽었을 수 있습니다)');
  }, 5000);
}
app.on('window-all-closed', (e) => { /* 트레이 상주 */ });
app.on('before-quit', () => { quitting = true; });
