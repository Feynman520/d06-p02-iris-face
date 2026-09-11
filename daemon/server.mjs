// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// IRIS 세션 데몬 — 127.0.0.1:3458 (HTTP 정적+API, WebSocket /ws). 단일 실행, PID 파일.
// 조합(에이전트·모델·사고깊이)은 사용자가 고른 그대로 CLI에 넘긴다. 자동 판정 없음(2026-09-09 폐기).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { SessionManager } from './sessions.mjs';
import { titleFromPrompt } from './title.mjs';
import { AGENTS } from './agents.mjs';
import { TranscriptTail } from './transcript.mjs';
import { SubagentWatcher } from './subagents.mjs';
import { listFolders, checkFresh, RecentFolders } from './folders.mjs';
import { readLimits } from './limits.mjs';
import { findRoot, rootName, Settings } from './workspace.mjs';
import { dashDir, dashPort } from './paths.mjs';
import { toPdf, isConvertible } from './doc2pdf.mjs';
import { Voice } from './voice.mjs';
import { activeAgentsMap, wake, SleepWatcher, KNOWN_AGENTS } from './wake.mjs';

const PORT = Number(process.env.IRIS_FACE_PORT) || 3458;          // 시험용 두 번째 데몬: IRIS_FACE_PORT=3459 IRIS_FACE_STATE=<폴더>
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 버전·만든 사람·명함·허가서의 원천은 package.json 한 곳(2026-09-10 각인). 화면·창 제목·정보 대화상자는 전부 /api/health 로 이 값을 읽는다.
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
export const VERSION = PKG.version;
export const ABOUT = Object.freeze({ name: 'IRIS-Face', version: PKG.version, author: PKG.author, homepage: PKG.homepage, license: PKG.license, since: PKG.iris?.since, motto: PKG.iris?.motto });
const STATE = process.env.IRIS_FACE_STATE || path.join(ROOT, 'state');
const APP = path.join(ROOT, 'app');
const PID_FILE = path.join(STATE, 'daemon.pid');
const LOG_FILE = path.join(STATE, 'daemon.log');
fs.mkdirSync(STATE, { recursive: true });
const log = (msg) => fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`, 'utf8');

// ---- sessions + ws fan-out ----
const clients = new Set();
const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const broadcast = (obj) => { for (const c of clients) send(c, obj); };
const publicList = () => sm.list().map(r => ({ ...r }));
const sm = new SessionManager(STATE, {
  onOutput: (id, data) => { for (const c of clients) if (c.attached === id) send(c, { type: 'output', id, data }); },
  onStatus: (id, status, extra) => broadcast({ type: 'status', id, status, ...(extra || {}) }), // extra.done = 작업 완료 전환(화면 알림, 2026-09-11)
  onActivity: (id, text) => { for (const c of clients) if (c.attached === id) send(c, { type: 'activity', id, text }); },
  onPrompt: (id, prompt) => broadcast({ type: 'prompt', id, prompt }), // 확인 카드(v2.43): 노란불의 질문·선택지, null = 카드 내림. 세션 목록(publicList)에도 rec.prompt 로 실린다.
  onList: () => broadcast({ type: 'sessions', list: publicList() }),
  onLog: (msg) => log(msg),

});
const recent = new RecentFolders(STATE);
const WS_ROOT = findRoot(ROOT); const settings = new Settings(STATE);
const voice = new Voice(STATE, settings, log);   // 🎤 로컬 위스퍼 워커(자식 PID 하나) — 시작 때 모델 미리 올림
// 잠든 에이전트 깨우기(installer Task 17): 영수증이 있고 잠든 에이전트가 있을 때만 15초마다 TeamClaude 설정을
// 읽어 자동으로 깨운다. 영수증이 없는 PC(이 개발 PC 포함)에서는 sleepingAgents 가 항상 빈 배열이라 무동작.
const sleepWatcher = new SleepWatcher({
  log: (m) => log(`wake: ${m}`),
  onWake: () => broadcast({ type: 'agents', agents: activeAgentsMap(AGENTS) }),
});
sleepWatcher.start();

// ---- TeamClaude 대시보드 뷰어 서버(3457) 보장 — 한도 서랍을 열 때 화면이 부른다(POST /api/dash/ensure) ----
// 도구 폴더가 없는 PC(공개 배포본)면 alive:false 로 답하고 아무것도 띄우지 않는다. 브라우저는 열지 않는다.
// 폴더 탐색은 paths.mjs dashDir()(TEAMCLAUDE_DASH_DIR → 공유 도구 → 옛 자리) 한 곳.
const dashBase = dashDir();
const DASH_ENSURE = dashBase ? path.join(dashBase, 'ensure-dash.mjs') : null;
const DASH_AVAILABLE = !!(DASH_ENSURE && fs.existsSync(DASH_ENSURE));
async function ensureDash() {
  if (!DASH_AVAILABLE) return { alive: false, port: null, started: false, message: 'dashboard tool not installed' };
  try { const { ensureDash } = await import(pathToFileURL(DASH_ENSURE).href); return await ensureDash({ log: (m) => log(`dash: ${m}`) }); }
  catch (e) { return { alive: false, port: null, started: false, message: `dashboard ensure failed: ${e.message}` }; }
}
// 선택 기능 표 — 화면이 /api/health.features 로 읽어 없는 기능(배터리·Ctrl+D 서랍·🎤)을 숨기거나 안내만 한다(2026-09-11 매듭 풀기).
// voice 는 데몬 시작 뒤 probe 가 끝나기 전엔 null(확인 중) → 화면은 null 을 "있음"으로 보고, /api/voice/status 로 다시 확인한다.
const features = () => ({ dashboard: DASH_AVAILABLE, dashPort: dashPort(), voice: voice.status().available, python: !!voice.py });

// ---- transcript tails (기록파일 읽기 전용, 폴링) ----
// 폴링 간격은 두 단계(2026-09-10): 작업 중·확인 필요·요청을 보낸 직후 15초 = 0.3초(터미널처럼 바로 반영), 그 밖(대기·종료) = 1.5초.
// 읽기는 stat 한 번 + 새로 붙은 바이트만이라 빠른 간격도 비용이 거의 없다.
const POLL_FAST_MS = 300, POLL_SLOW_MS = 1500, HOT_AFTER_SEND_MS = 15000;
const tails = new Map();
const hotUntil = new Map(); // 세션 id → 이 시각까지는 빠르게 읽는다(요청 전송 직후)
const tailMeta = (tl) => ({ model: tl.model, usage: tl.lastUsage, unknown: tl.unknown, window: tl.contextWindow() });
function tailFor(rec) {
  if (!rec?.recordPath) return null;
  let tl = tails.get(rec.id);
  if (!tl || tl.file !== rec.recordPath) { tl = new TranscriptTail(rec.recordPath, rec.agent); tails.set(rec.id, tl); }
  return tl;
}
function pumpTail(rec) {
  const tl = tailFor(rec); if (!tl) return null;
  tl.polledAt = Date.now();
  let items; try { items = tl.poll(); } catch { return tl; }
  syncTitle(rec, tl);
  if (tl.reset) { tl.reset = false; broadcast({ type: 'transcript', id: rec.id, reset: true, items: tl.items, meta: tailMeta(tl) }); return tl; }
  if (items.length) for (const c of clients) if (c.attached === rec.id) send(c, { type: 'transcript', id: rec.id, items, meta: tailMeta(tl) });
  return tl;
}
// 작업목록 이름: 클로드 ai-title이 있으면 그것(ai), 없고 이름도 없으면 기록의 첫 요청문(first) — 이름이 바뀌면 sm.setTitle이 목록을 방송한다
function syncTitle(rec, tl) {
  if (tl.aiTitle) { if (sm.setTitle(rec.id, tl.aiTitle, 'ai')) log(`title ${rec.id} (ai) ${rec.title}`); return; }
  if (!rec.title && tl.firstUser) { const t = titleFromPrompt(tl.firstUser); if (t && sm.setTitle(rec.id, t, 'first')) log(`title ${rec.id} (first) ${rec.title}`); }
}
// ---- 보조 작업(서브에이전트) 감시 — 세션마다 SubagentWatcher 하나(읽기 전용, daemon/subagents.mjs, 2026-09-11) ----
// 목록·상태·횟수가 바뀌면 전체 방송(작업목록의 ⁺N 표시용). 기록 본문은 그 보조를 보고 있는(attachSub) 화면에만 보낸다.
const subs = new Map();      // 세션 id → SubagentWatcher
const subsSent = new Map();  // 세션 id → 마지막으로 방송한 version
function subsFor(rec) {
  if (!rec?.recordPath) return null;
  let w = subs.get(rec.id);
  if (!w || w.recordPath !== rec.recordPath) { w = new SubagentWatcher(rec, log); subs.set(rec.id, w); subsSent.delete(rec.id); }
  return w;
}
const subsList = (id) => subs.get(id)?.list() || [];
const allSubs = () => { const o = {}; for (const [id, w] of subs) if (w.subs.size) o[id] = w.list(); return o; };
function pumpSubs(rec, force = false) {
  const w = subsFor(rec); if (!w) return;
  const busy = rec.status === 'busy' || rec.status === 'attention';
  w.scan(busy, force);
  if (!w.subs.size) return;
  const { updates } = w.poll(tails.get(rec.id) || null, busy);
  if (subsSent.get(rec.id) !== w.version) { subsSent.set(rec.id, w.version); broadcast({ type: 'subagents', id: rec.id, list: w.list() }); }
  for (const u of updates) for (const c of clients) if (c.attached === rec.id && c.attachedSub === u.key) send(c, { type: 'subtranscript', id: rec.id, key: u.key, items: u.items });
}
setInterval(() => {
  const now = Date.now();
  for (const rec of sm.list()) {
    const fast = rec.status === 'busy' || rec.status === 'attention' || now < (hotUntil.get(rec.id) || 0);
    const tl = tails.get(rec.id);
    if (!fast && tl && now - (tl.polledAt || 0) < POLL_SLOW_MS) continue;
    pumpTail(rec);
    try { pumpSubs(rec); } catch (e) { log(`subs ${rec.id}: ${e.message}`); }
  }
  for (const id of [...tails.keys()]) if (!sm.get(id)) { tails.delete(id); hotUntil.delete(id); subs.delete(id); subsSent.delete(id); }
}, POLL_FAST_MS);

/** 이전 대화(요청·답만)를 새 에이전트에 넘길 글로 묶는다. 최근 것부터 8천 자 안쪽. */
function buildHandoff(items, rec) {
  const lines = [];
  for (const it of items) {
    if (it.kind === 'user') lines.push(`[사용자]\n${it.text}`);
    else if (it.kind === 'assistant') lines.push(`[이전 어시스턴트]\n${it.text}`);
    else if (it.kind === 'tool') lines.push(`(도구 ${it.name}: ${it.detail || ''})`);
  }
  let body = lines.join('\n\n');
  if (body.length > 8000) body = '…(앞부분 생략)…\n\n' + body.slice(-8000);
  const from = `${rec.agent === 'claude' ? 'Claude' : 'Codex'} ${rec.modelLabel || rec.model} · ${rec.effort}`;
  return `[이전 대화 이어받기 — ${from} 세션에서 옮겨 옴, 폴더 ${rec.cwd}]\n아래는 지금까지의 대화다. 이미 끝난 작업은 다시 하지 말고, 결정된 내용은 그대로 따른다.\n\n${body || '(이전 대화 없음)'}`;
}

// ---- http ----
const MIME = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const VENDOR = {
  '/vendor/xterm.js': path.join(ROOT, 'node_modules/@xterm/xterm/lib/xterm.js'),
  '/vendor/xterm.css': path.join(ROOT, 'node_modules/@xterm/xterm/css/xterm.css'),
  '/vendor/addon-fit.js': path.join(ROOT, 'node_modules/@xterm/addon-fit/lib/addon-fit.js'),
};
function serveFile(res, file) {
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { const s = Buffer.concat(chunks).toString('utf8'); if (!s) return resolve({}); try { resolve(JSON.parse(s)); } catch { reject(new Error('bad json')); } }); req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return serveFile(res, path.join(APP, 'index.html'));
    if (req.method === 'GET' && p.startsWith('/app/')) return serveFile(res, path.join(APP, path.normalize(p.slice(5)).replace(/^([.][.][\\/])+/, '')));
    if (req.method === 'GET' && VENDOR[p]) return serveFile(res, VENDOR[p]);
    if (req.method === 'GET' && p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && p === '/api/health') return json(res, 200, { ok: true, version: VERSION, about: ABOUT, pid: process.pid, uptime: process.uptime(), sessions: sm.list().length, root: WS_ROOT, rootName: rootName(WS_ROOT), features: features() });
    if (req.method === 'GET' && p === '/api/settings') return json(res, 200, settings.get());
    if (req.method === 'PUT' && p === '/api/settings') { const b = await readBody(req); return json(res, 200, settings.set(b)); }
    if (req.method === 'GET' && p === '/api/agents') return json(res, 200, activeAgentsMap(AGENTS));
    if (req.method === 'GET' && p === '/api/limits') return json(res, 200, await readLimits());
    if (req.method === 'POST' && p === '/api/dash/ensure') { const d = await ensureDash(); log(`dash ensure: ${d.message}`); return json(res, d.alive ? 200 : 503, d); }
    if (req.method === 'POST' && p === '/api/wake') {
      // 잠든 에이전트 수동으로 깨우기(installer Task 17) — 대시보드에서 relay 로그인 뒤 다시 시도할 때도 쓸 수 있는 멱등 경로.
      const b = await readBody(req);
      const agent = String(b.agent || '');
      if (!KNOWN_AGENTS.includes(agent)) return json(res, 400, { error: `알 수 없는 에이전트: ${agent}` });
      const { active } = wake(agent, { log: (m) => log(`wake: ${m}`) });
      broadcast({ type: 'agents', agents: activeAgentsMap(AGENTS) });
      return json(res, 200, { ok: true, active });
    }
    if (req.method === 'GET' && p === '/api/sessions') return json(res, 200, publicList());
    if (req.method === 'POST' && p === '/api/sessions') {
      const body = await readBody(req);
      const rec = sm.create(body);
      recent.touch(rec.cwd);
      log(`create ${rec.id} pid=${rec.pid} ${rec.cmdline} cwd=${rec.cwd}`);
      return json(res, 201, { ...rec });
    }
    if (req.method === 'GET' && p === '/api/folders') {
      const f = listFolders(); const fresh = await checkFresh();
      const live = {}; for (const s of sm.list()) (live[s.cwd.toLowerCase()] ||= []).push({ id: s.id, agent: s.agent, status: s.status });
      return json(res, 200, { ...f, recent: recent.get(), fresh, live });
    }
    if (req.method === 'POST' && p === '/api/upload') {
      // 사진·파일 첨부: state/uploads/<시각>-<이름> 에 저장하고 절대경로를 돌려준다(요청문에 경로로 삽입)
      const name = decodeURIComponent(req.headers['x-file-name'] || 'file.bin').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
      const dir = path.join(STATE, 'uploads'); fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${name}`);
      const chunks = []; let size = 0;
      await new Promise((resolve, reject) => { req.on('data', (c) => { size += c.length; if (size > 50 * 1024 * 1024) { reject(new Error('too large (50MB)')); req.destroy(); } else chunks.push(c); }); req.on('end', resolve); req.on('error', reject); });
      fs.writeFileSync(file, Buffer.concat(chunks)); log(`upload ${path.basename(file)} ${size}B`);
      return json(res, 201, { path: file, size });
    }
    if (req.method === 'GET' && p === '/api/voice/status') return json(res, 200, voice.status());
    if (req.method === 'POST' && p === '/api/transcribe') {
      // 🎤 음성 전사: 본문 = 오디오(webm/wav…), 헤더 x-audio-ext · x-folder-hint(현재 폴더 이름, 용어 힌트에 덧붙임) · x-retry-file(실패한 녹음 재시도)
      const retry = req.headers['x-retry-file'] ? decodeURIComponent(req.headers['x-retry-file']) : '';
      let file;
      if (retry) { if (path.dirname(path.resolve(retry)) !== path.resolve(voice.dir)) return json(res, 403, { error: '재시도는 state\\voice 안의 파일만' }); file = retry; }
      else {
        const chunks = []; let size = 0;
        await new Promise((resolve, reject) => { req.on('data', (c) => { size += c.length; if (size > 100 * 1024 * 1024) { reject(new Error('too large (100MB)')); req.destroy(); } else chunks.push(c); }); req.on('end', resolve); req.on('error', reject); });
        if (!size) return json(res, 400, { error: '오디오가 비어 있습니다' });
        file = voice.saveAudio(Buffer.concat(chunks), req.headers['x-audio-ext'] || 'webm');
      }
      const folderHint = req.headers['x-folder-hint'] ? decodeURIComponent(req.headers['x-folder-hint']) : '';
      try { const out = await voice.transcribe(file, { folderHint }); log(`transcribe ${path.basename(file)} ${out.audioSecs ?? '?'}s → ${out.text.length}c in ${out.wall}s (${out.device})`); return json(res, 200, out); }
      catch (e) { log(`502 transcribe ${path.basename(file)}: ${e.message}`); return json(res, 502, { error: e.message, file, status: voice.status() }); }
    }
    if (req.method === 'GET' && p === '/api/file') {
      // 대화 안 삽입용 로컬 파일(이미지·HTML·PDF 등). 이 PC 로컬 데몬 전용 — 시스템 폴더는 막는다.
      const raw = url.searchParams.get('path') || ''; const file = path.resolve(raw.replace(/^\/([A-Za-z]:)/, '$1'));
      const ext = path.extname(file).toLowerCase();
      const okExt = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.html', '.htm', '.pdf', '.txt', '.md', '.csv', '.json'];
      if (!okExt.includes(ext) || /^[A-Za-z]:\\(windows|program files|program files \(x86\)|programdata)\\/i.test(file)) { log(`403 file ${file}`); return json(res, 403, { error: `열 수 없는 파일 종류이거나 시스템 폴더입니다: ${file}` }); }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { log(`404 file ${file}`); return json(res, 404, { error: `파일이 없습니다: ${file}` }); }
      return serveFile(res, file);
    }
    if (req.method === 'GET' && p === '/api/doc') {
      // 문서(한/글·워드·엑셀·PPT)를 PDF로 변환해 삽입용으로 서빙. 원본은 읽기 전용, 결과는 state/doc-cache 캐시.
      const raw = url.searchParams.get('path') || ''; const file = path.resolve(raw.replace(/^\/([A-Za-z]:)/, '$1'));
      if (/^[A-Za-z]:\\(windows|program files|program files \(x86\)|programdata)\\/i.test(file)) { log(`403 doc ${file}`); return json(res, 403, { error: `시스템 폴더는 열 수 없습니다: ${file}` }); }
      if (!isConvertible(file)) { log(`403 doc ext ${file}`); return json(res, 403, { error: `변환할 수 없는 문서 형식입니다: ${file}` }); }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { log(`404 doc ${file}`); return json(res, 404, { error: `파일이 없습니다: ${file}` }); }
      try {
        const pdf = await toPdf(file, path.join(STATE, 'doc-cache'), log);
        return serveFile(res, pdf);
      } catch (e) { log(`502 doc ${file}: ${e.message}`); return json(res, 502, { error: e.message }); }
    }
    if (req.method === 'POST' && p === '/api/open') {
      // 원본 파일을 이 PC의 기본 앱(한/글·워드·엑셀 …)으로 연다. 브라우저가 못 여는 문서의 ⧉ 전용.
      // explorer.exe 에 경로 하나만 넘긴다(cmd.exe /c start 는 인용부호 재해석으로 한글·공백 경로가 깨질 수 있음).
      const b = await readBody(req); const file = path.resolve(String(b.path || '').replace(/^\/([A-Za-z]:)/, '$1'));
      if (!/^[A-Za-z]:\\/.test(file) || /^[A-Za-z]:\\(windows|program files|program files \(x86\)|programdata)\\/i.test(file)) { log(`403 open ${file}`); return json(res, 403, { error: `시스템 폴더는 열 수 없습니다: ${file}` }); }
      if (/\.(exe|bat|cmd|com|ps1|vbs|js|msi|scr|lnk)$/i.test(file)) { log(`403 open exec ${file}`); return json(res, 403, { error: `실행 파일은 열지 않습니다: ${file}` }); }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { log(`404 open ${file}`); return json(res, 404, { error: `파일이 없습니다: ${file}` }); }
      try { spawn('explorer.exe', [file], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); log(`open ${file}`); return json(res, 200, { ok: true }); }
      catch (e) { log(`500 open ${file}: ${e.message}`); return json(res, 500, { error: e.message }); }
    }
    if (req.method === 'GET' && p === '/api/transcript-preview') {
      const file = url.searchParams.get('path'); const agent = url.searchParams.get('agent') || 'claude';
      if (!file || !fs.existsSync(file)) return json(res, 404, { error: 'file not found' });
      const tl = new TranscriptTail(file, agent); tl.poll();
      return json(res, 200, { items: tl.items, meta: tailMeta(tl) });
    }
    // 보조 작업(서브에이전트): 목록 / 한 보조의 전체 기록(2026-09-11)
    const ms = p.match(/^\/api\/sessions\/([a-z0-9]+)\/subagents(?:\/([^/]+)\/transcript)?$/);
    if (ms && req.method === 'GET') {
      const rec = sm.get(ms[1]); if (!rec) return json(res, 404, { error: 'no session' });
      const w = subsFor(rec); if (w) { try { pumpSubs(rec, true); } catch {} }
      if (!ms[2]) return json(res, 200, { list: w?.list() || [], running: w?.running() || 0 });
      const tr = w?.transcript(decodeURIComponent(ms[2])); if (!tr) return json(res, 404, { error: 'no subagent' });
      return json(res, 200, tr);
    }
    const m = p.match(/^\/api\/sessions\/([a-z0-9]+)(?:\/(input|resize|buffer|forget|transcript|send|switch|resume))?$/);
    if (m) {
      const [, id, action] = m;
      if (!sm.get(id)) return json(res, 404, { error: 'no session' });
      if (req.method === 'GET' && !action) return json(res, 200, { ...sm.get(id) });
      if (req.method === 'GET' && action === 'transcript') { const tl = pumpTail(sm.get(id)); return json(res, 200, tl ? { items: tl.items, meta: tailMeta(tl) } : { items: [], meta: null, pending: true }); }
      if (req.method === 'GET' && action === 'buffer') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(sm.buffer(id)); }
      if (req.method === 'POST' && action === 'send') { const b = await readBody(req); const text = String(b.text || '').trim(); if (!text) return json(res, 400, { error: 'empty' }); sm.send(id, text); hotUntil.set(id, Date.now() + HOT_AFTER_SEND_MS); log(`send ${id} ${text.length}c status=${sm.get(id)?.status}`); return json(res, 200, { ok: true }); }
      if (req.method === 'POST' && action === 'input') { const b = await readBody(req); sm.write(id, String(b.data ?? '')); return json(res, 200, { ok: true }); }
      if (req.method === 'POST' && action === 'resize') { const b = await readBody(req); sm.resize(id, Number(b.cols), Number(b.rows)); return json(res, 200, { ok: true }); }
      if (req.method === 'POST' && action === 'switch') {
        const b = await readBody(req); const before = sm.get(id); const beforeCmd = before.cmdline;
        let rec;
        if (b.agent && b.agent !== before.agent) {
          // 다른 에이전트로: 이전 대화를 글로 묶어 새 CLI의 첫 요청으로 넘긴다(맥락 이어받기)
          const tl = tailFor(before); try { tl?.poll(); } catch {}
          const handoff = buildHandoff(tl?.items || [], before);
          const first = handoff + (b.text ? `\n\n[이어지는 요청]\n${b.text}` : '\n\n위 대화를 이어받았으면 한 줄로 확인만 하고, 다음 요청을 기다려라.');
          rec = sm.replaceAgent(id, { agent: b.agent, model: b.model, effort: b.effort, readOnly: b.readOnly, permission: b.permission, approval: b.approval, sandbox: b.sandbox, prompt: first });
          tails.delete(id);
          log(`handoff ${id} [${beforeCmd}] -> [${rec.cmdline}] pid=${rec.pid} items=${(tl?.items || []).length} chars=${first.length}`);
        } else {
          rec = sm.switchTo(id, { model: b.model, effort: b.effort, readOnly: b.readOnly, permission: b.permission, approval: b.approval, sandbox: b.sandbox, prompt: b.text || '' });
          log(`switch ${id} [${beforeCmd}] -> [${rec.cmdline}] pid=${rec.pid}`);
        }
        broadcast({ type: 'sessions', list: publicList() });
        return json(res, 200, { ...rec });
      }
      // 죽은 카드 그 자리에서 재개(화면 "여기서 재개" 버튼, 2026-09-11 v2.42). 살아 있는 세션이면 400.
      if (req.method === 'POST' && action === 'resume') { const b = await readBody(req); const rec = sm.resume(id, { prompt: String(b.text || '') }); log(`resume ${id} pid=${rec.pid} [${rec.cmdline}]`); broadcast({ type: 'sessions', list: publicList() }); return json(res, 200, { ...rec }); }
      if (req.method === 'POST' && action === 'forget') { sm.forget(id); log(`forget ${id}`); return json(res, 200, { ok: true }); }
      if (req.method === 'DELETE' && !action) { const rec = sm.close(id); log(`close ${id} pid=${rec.pid}`); return json(res, 200, { ok: true }); }
    }
    if (req.method === 'POST' && p === '/api/shutdown') { json(res, 200, { ok: true, closing: sm.list().length }); log('shutdown (all sessions by PID)'); setTimeout(shutdown, 100); return; }
    log(`404 ${req.method} ${p}${url.search}`);
    json(res, 404, { error: `not found: ${req.method} ${p}` });
  } catch (e) { log(`400 ${req.method} ${p}: ${e.message}`); json(res, 400, { error: e.message }); }
});

// ---- websocket ----
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  clients.add(ws); ws.attached = null; ws.attachedSub = null;
  send(ws, { type: 'hello', version: VERSION, sessions: publicList(), subs: allSubs() });
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
    try {
      if (msg.type === 'attach') { ws.attached = msg.id; ws.attachedSub = null; send(ws, { type: 'replay', id: msg.id, data: sm.buffer(msg.id), session: sm.get(msg.id) || null }); const rec = sm.get(msg.id); if (rec) { try { pumpSubs(rec, true); } catch {} send(ws, { type: 'subagents', id: msg.id, list: subsList(msg.id) }); } }
      else if (msg.type === 'detach') { ws.attached = null; ws.attachedSub = null; }
      // 보조 작업 서랍: 이 보조(key)의 기록을 실시간으로 받는다. key 없음 = 서랍 닫음. 첫 응답은 전체 기록(reset).
      else if (msg.type === 'attachSub') {
        ws.attachedSub = msg.key || null; if (!ws.attachedSub) return;
        const rec = sm.get(msg.id); const w = rec && subsFor(rec); const tr = w?.transcript(msg.key);
        send(ws, { type: 'subtranscript', id: msg.id, key: msg.key, reset: true, items: tr?.items || [], meta: tr?.meta || null, missing: !tr });
      }
      else if (msg.type === 'input') sm.write(msg.id, String(msg.data ?? ''));
      else if (msg.type === 'resize') sm.resize(msg.id, Number(msg.cols), Number(msg.rows));
    } catch (e) { send(ws, { type: 'error', id: msg.id, error: e.message }); }
  });
  ws.on('close', () => clients.delete(ws));
});

// ---- single instance / pid / shutdown ----
function shutdown() { try { sm.closeAll(); } catch {} try { voice.stop(); } catch {} try { sleepWatcher.stop(); } catch {} try { fs.unlinkSync(PID_FILE); } catch {} log('daemon exit'); setTimeout(() => process.exit(0), 200); }
server.on('error', (e) => { if (e.code === 'EADDRINUSE') { console.error(`[iris-face] port ${PORT} in use — daemon already running`); process.exit(2); } console.error(e); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => { fs.writeFileSync(PID_FILE, String(process.pid), 'utf8'); log(`daemon start v${VERSION} pid=${process.pid} sessions=${sm.list().length}`); console.log(`[iris-face] daemon v${VERSION} http://127.0.0.1:${PORT}/ pid=${process.pid}`); log(`features: dashboard=${DASH_AVAILABLE ? dashBase : 'off'} python=${voice.py || 'off'}`); voice.sweep();
  // 데몬과 함께 죽은 세션 자동 재개(v2.42): 살아 있던 카드를 같은 자리에서 --resume. 사용자가 닫은 세션은 기록에 없으므로 되살아나지 않는다.
  try { const ids = sm.resumeLost(); if (ids.length) log(`auto-resume: ${ids.length} lost session(s) → ${ids.join(', ')}`); } catch (e) { log(`auto-resume error: ${e?.message || e}`); } try { Promise.resolve(voice.preload()).catch((e) => log(`voice: preload skipped ${e.message}`)); } catch (e) { log(`voice: preload skipped ${e.message}`); } });
// 데몬이 죽으면 ConPTY 세션도 죽으므로 예외로는 절대 죽지 않게 한다(기록만).
process.on('uncaughtException', (e) => { log(`uncaughtException: ${e?.stack || e}`); });
process.on('unhandledRejection', (e) => { log(`unhandledRejection: ${e?.stack || e}`); });
process.on('SIGINT', () => { try { fs.unlinkSync(PID_FILE); } catch {} log('daemon interrupted (sessions left as-is)'); process.exit(0); });
