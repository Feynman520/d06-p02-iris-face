// 튜토리얼 ⑦ 사용법 그림: 시험 데몬(3459, 임시 영혼) + 웹소켓·기록 흉내(가짜 세션 3개, 실제 CLI·세션 접촉 0) → 번호 표 얹어 캡처
// 사용: node cap-usage.mjs <P02 폴더> <출력 png>
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawn } from 'node:child_process'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const [ROOT, OUT] = process.argv.slice(2);
const { parseApproval } = await import(pathToFileURL(path.join(ROOT, 'daemon', 'approval.mjs')).href);
const req = createRequire(import.meta.url);
const pw = req.resolve(path.join(process.env.APPDATA, 'npm/node_modules/playwright'));
const { chromium } = (await import(pathToFileURL(pw).href)).default;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tu-usage-'));
const soul = path.join(tmp, 'IRIS'); const state = path.join(tmp, 'st'); const mods = path.join(tmp, 'm');
for (const d of [soul, state, mods, path.join(soul, 'R01-교사(Teacher)', 'D01-수업(Teaching)', 'P01-물리학 〖2026년.2학기〗')]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(state, 'settings.json'), JSON.stringify({ voice: { preload: false } }));
fs.writeFileSync(path.join(state, 'sessions.json'), '[]');
fs.writeFileSync(path.join(state, 'tutorial.json'), JSON.stringify({ done: true }));
const PORT = 3459;
const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
  env: { ...process.env, IRIS_ROOT: soul, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0', IRIS_AGENTS_HOME: tmp, CLAUDE_CONFIG_DIR: path.join(soul, '_agent', 'claude'), CODEX_HOME: path.join(soul, '_agent', 'codex') } });
const cwdP = path.join(soul, 'R01-교사(Teacher)', 'D01-수업(Teaching)', 'P01-물리학 〖2026년.2학기〗');
const D = '─'.repeat(120);
const prompt = parseApproval([D, ' ☐ 분량', '세특 초안을 어떤 길이로 쓸까요?', '❯ 1. 500자 안팎', '     학교에서 정한 기본 분량', '  2. 300자 안팎', '     핵심만 짧게', '  3. Type something.', D, '  4. Chat about this', 'Enter to select · ↑/↓ to navigate · Esc to cancel'].join('\n'));
const now = Date.now();
const S = [
  { id: 'a1', cwd: cwdP, agent: 'claude', model: 'opus', effort: 'high', status: 'attention', title: '물리학 세특 초안 쓰기', titleSource: 'user', pid: 1, createdAt: now - 600000, prompt },
  { id: 'a2', cwd: cwdP, agent: 'codex', model: 'gpt-5.5', effort: 'medium', status: 'busy', title: '수행평가 채점 기준표 정리', titleSource: 'ai', pid: 2, createdAt: now - 1200000 },
  { id: 'a3', cwd: soul, agent: 'claude', model: 'sonnet', effort: 'medium', status: 'idle', title: '가정통신문 초안', titleSource: 'ai', pid: 3, createdAt: now - 3600000 },
];
const T = new Date(now - 300000).toISOString();
const items = [
  { i: 1, t: T, kind: 'user', text: '이 폴더의 작년 세특 예시를 참고해서 3반 학생들 물리학 세특 초안을 써 줘.' },
  { i: 2, t: T, kind: 'tool', name: 'Read', detail: '작년 세특 예시.hwpx' },
  { i: 3, t: T, kind: 'tool', name: 'Read', detail: '3반 수행평가 결과.xlsx' },
  { i: 4, t: T, kind: 'assistant', text: '작년 예시 12건과 3반 수행평가 결과 28명분을 읽었습니다. 예시는 **한 문장에 한 활동**, 500자 안팎으로 쓰여 있습니다.\n\n쓰기 전에 분량을 한 가지만 확인하겠습니다.' },
];
let browser;
try {
  for (let i = 0; i < 60; i++) { await sleep(250); try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break; } catch {} }
  browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await p.routeWebSocket('**/ws', (ws) => {
    const srv = ws.connectToServer();
    srv.onMessage((m) => { try { const o = JSON.parse(m); if (o.type === 'hello') { o.sessions = S; o.handoff = null; ws.send(JSON.stringify(o)); return; } if (o.type === 'sessions') return; } catch {} ws.send(m); });
    ws.onMessage((m) => { try { if (JSON.parse(m).type === 'attach') return; } catch {} srv.send(m); });
  });
  await p.route('**/api/sessions/a1/transcript', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items, meta: {} }) }));
  await p.goto(`http://127.0.0.1:${PORT}/`);
  await sleep(1500);
  await p.locator('#session-list').getByText('물리학 세특 초안 쓰기').first().click();
  await sleep(1200);
  await p.locator('#composer-text').fill('2반도 같은 방식으로 이어서 써 줘');
  await sleep(300);
  // 번호 표: 화면 요소 자리 위에 얹는다(그림 속에 박혀 실제 화면과 어긋나지 않음)
  const marks = await p.evaluate(() => {
    const at = (sel, dx, dy, corner = 'tl') => { const e = document.querySelector(sel); if (!e || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null; const r = e.getBoundingClientRect(); const x = corner.includes('r') ? r.right : r.left; const y = corner.includes('b') ? r.bottom : r.top; return [x + dx, y + dy]; };
    const sig = document.querySelector('#sig'); if (sig) sig.style.display = 'none';
    const pts = [at('#session-list', 14, 8), at('#btn-home', -4, 2), at('#approval', 8, 8), at('#btn-mode-chat', -4, -4), at('#btn-settings', 2, 22, 'tr'), at('#composer', 8, 6)];
    pts.forEach((pt, i) => { if (!pt) return; const b = document.createElement('div'); b.textContent = String(i + 1);
      b.style.cssText = `position:fixed;left:${pt[0] - 19}px;top:${pt[1] - 19}px;width:38px;height:38px;border-radius:50%;background:#f2b56b;color:#1a1408;font:800 21px/38px "Segoe UI",sans-serif;text-align:center;z-index:99999;box-shadow:0 0 0 3px rgba(0,0,0,.45),0 4px 14px rgba(0,0,0,.5)`; document.body.appendChild(b); });
    return pts;
  });
  console.log('marks', JSON.stringify(marks));
  await p.screenshot({ path: OUT });
  console.log('saved', OUT);
} finally { try { await browser?.close(); } catch {} try { process.kill(d.pid); } catch {} }
