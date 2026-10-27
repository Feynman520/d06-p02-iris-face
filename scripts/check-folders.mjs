// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// v2.96.2 검사(2026-10-27 사용자 신고 3건) — 실 데몬(3458)·실 대시보드(3457)는 건드리지 않는다. 사용: node scripts/check-folders.mjs
//   1절 폴더 목록 = 그래프 + 디스크: 가짜 영혼(IRIS_ROOT)에서 그래프 없음 · 깨진 그래프 · 옛 이름이 남은 그래프 세 경우
//       (다른 PC에서 튜토리얼이 폴더를 만든 뒤 그래프 재생성이 실패하자 폴더 선택 창에 아무것도 안 떴다)
//   2절(playwright 있을 때) 시험 데몬 3459 + 헤드리스 크로미엄:
//       폴더 선택 창에 디스크의 새 폴더가 보임 · 계정 0개인 에이전트 버튼 = 비활성(누름 무시·말풍선) + 입력창 위 긴 안내 글 없음
//       · 서랍은 한 번에 하나(설정 ↔ 대시보드: 다른 서랍을 누르면 앞 서랍이 닫힘)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- 가짜 영혼 ----------
const soul = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-fp-soul-'));
const R = 'R01-교사(Teacher)', D = `${R}\\D01-수업(Class)`, G = `${R}\\〖교재〗D01-입문 물리학(Intro Physics)`, P = `${D}\\P01-물리(Physics) 〖2026년〗`;
for (const rel of [R, D, G, P, `${D}\\원문PDF`, '_util', `${R}\\_tools`]) fs.mkdirSync(path.join(soul, ...rel.split('\\')), { recursive: true });
fs.mkdirSync(path.join(soul, '_agent'), { recursive: true });
fs.mkdirSync(path.join(soul, '_ontology'), { recursive: true });
const GRAPH = path.join(soul, '_ontology', 'graph.json');
const rels = (r) => r.folders.map(f => f.rel).sort();
const WANT = [R, G, D, P].sort();

// ---------- 1) 폴더 목록 ----------
process.env.IRIS_ROOT = soul;
const { listFolders } = await import(pathToFileURL(path.join(ROOT, 'daemon', 'folders.mjs')).href);
let r = listFolders();
ok(JSON.stringify(rels(r)) === JSON.stringify(WANT), `1 그래프 없음 → 디스크의 R·D·〖그룹〗D·P 4개 (${rels(r).length}개)`);
ok(!rels(r).some(x => /원문PDF|_util|_tools/.test(x)), '1 서랍·_ 폴더는 목록에 없음');
ok(r.folders.find(f => f.rel === P)?.type === 'project' && r.folders.find(f => f.rel === G)?.type === 'domain', '1 종류(type) = 이름 규칙대로');
fs.writeFileSync(GRAPH, '{ 깨진', 'utf8'); await sleep(30);
let threw = false; try { r = listFolders(); } catch { threw = true; }
ok(!threw && rels(r).length === 4, '1 깨진 그래프 → 오류 없이 디스크 목록');
fs.writeFileSync(GRAPH, JSON.stringify({ generated: 'g1', nodes: [
  { path: R, type: 'role', code: 'R01', lifecycle: 'dormant' },
  { path: 'R09-옛이름(Old)', type: 'role', code: 'R09', lifecycle: 'active' },
] }), 'utf8'); await sleep(30);
r = listFolders();
ok(JSON.stringify(rels(r)) === JSON.stringify(WANT), '1 그래프에 일부만 → 디스크에만 있는 새 폴더도 더함');
ok(!rels(r).includes('R09-옛이름(Old)'), '1 그래프에만 있고 디스크에 없는 옛 이름은 뺌');
ok(r.folders.find(f => f.rel === R)?.lifecycle === 'dormant' && r.generated === 'g1', '1 그래프의 속성(휴면)·생성 시각은 유지');

// ---------- 2) 시험 데몬 + 화면 ----------
const req = createRequire(import.meta.url);
let pw = null;
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
if (!pw) console.log('SKIP 2절: playwright 없음');
else {
  const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
  const PORT = 3459, DASH_PORT = 3497;
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-fp-state-'));
  const mods = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-fp-mods-'));
  const dash = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-fp-dash-'));
  fs.writeFileSync(path.join(dash, 'ensure-dash.mjs'), '// 시험용 빈 자리 — 화면이 /api/dash/ensure 를 가로채므로 실행되지 않는다\n', 'utf8');
  fs.writeFileSync(path.join(state, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8');
  fs.writeFileSync(path.join(state, 'sessions.json'), '[]', 'utf8');
  fs.rmSync(GRAPH, { force: true }); // 그래프 없는 영혼 = 신고 상황
  const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, IRIS_ROOT: soul, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0',
      TEAMCLAUDE_DASH_DIR: dash, TEAMCLAUDE_DASH_PORT: String(DASH_PORT) } });
  let browser;
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok; } catch {} }
    ok(up, `2 시험 데몬 ${PORT} pid=${d.pid}`);
    browser = await chromium.launch();
    const p = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.route('**/api/agents/status', (rt) => rt.fulfill({ contentType: 'application/json', body: JSON.stringify({ accounts: { claude: 1, codex: 0 }, missing: [], sleeping: [] }) }));
    await p.route('**/api/dash/ensure', (rt) => rt.fulfill({ contentType: 'application/json', body: JSON.stringify({ alive: true, started: false, port: DASH_PORT }) }));
    await p.route(`http://127.0.0.1:${DASH_PORT}/**`, (rt) => rt.fulfill({ contentType: 'text/html', body: '<p>가짜 대시보드</p>' }));
    await p.addInitScript(() => { try { localStorage.setItem('iris.sel', JSON.stringify({ agent: 'codex', model: { claude: 'opus', codex: 'gpt-6.1-sol' }, effort: { claude: 'high', codex: 'medium' } })); } catch {} });
    await p.goto(`http://127.0.0.1:${PORT}/`); await sleep(2000);
    await p.keyboard.press('Escape'); await sleep(200);

    // 폴더 선택 창
    await p.locator('#btn-folder').click(); await sleep(800);
    const names = await p.locator('#fp-list .fp-name').allTextContents();
    ok(names.includes('R01-교사(Teacher)'), `2 폴더 선택 창에 디스크의 새 역할 폴더 (${names.join(', ')})`);
    await p.locator('#fp-search').fill('물리'); await sleep(300);
    ok((await p.locator('#fp-list .fp-row.hit .fp-name').allTextContents()).some(t => t.startsWith('P01-물리')), '2 검색으로 새 프로젝트 폴더도 찾음');
    await p.keyboard.press('Escape'); await sleep(200);

    // 에이전트 버튼
    const cx = p.locator('#ag-codex'), cl = p.locator('#ag-claude');
    ok(await p.locator('#agent-sleep').count() === 0, '2 입력창 위 긴 안내 글 요소 없음');
    ok(await cx.getAttribute('aria-disabled') === 'true' && /계정 연결 안 됨/.test(await cx.getAttribute('title') || ''), '2 Codex 계정 0개 → 비활성 + 말풍선');
    ok(await cl.getAttribute('aria-disabled') === 'false' && await cl.evaluate(e => e.classList.contains('active')), '2 골라 둔 Codex 가 꺼져 → Claude 로 자동 전환');
    await cx.click({ force: true }); await sleep(200);
    ok(await cl.evaluate(e => e.classList.contains('active')) && !(await cx.evaluate(e => e.classList.contains('active'))), '2 꺼진 Codex 를 눌러도 바뀌지 않음');

    // 서랍은 한 번에 하나
    const dashOpen = () => p.locator('#dash').evaluate(e => !e.hidden && e.classList.contains('open'));
    const stOpen = () => p.locator('#settings').evaluate(e => !e.hidden);
    await p.locator('#btn-settings').click(); await sleep(500);
    ok(await stOpen(), '2 설정 열림');
    await p.locator('#limits').click(); await sleep(700);
    ok(await dashOpen() && !(await stOpen()), '2 설정 → 대시보드: 설정이 닫히고 대시보드');
    await p.locator('#btn-settings').click(); await sleep(700);
    ok(await stOpen() && !(await dashOpen()), '2 대시보드 → 설정: 대시보드가 닫히고 설정');
    await p.locator('#btn-settings').click(); await sleep(300);
    ok(!(await stOpen()) && !(await dashOpen()), '2 설정 다시 누르면 둘 다 닫힘');
    ok(errs.length === 0, `2 페이지 오류 ${errs.length}건${errs.length ? ' ' + errs.join(' | ') : ''}`);
    await p.close();
  } catch (e) { ok(false, '2 예외 ' + e.message); }
  finally {
    try { await browser?.close(); } catch {}
    try { d.kill(); } catch {}
    await sleep(400);
    for (const x of [state, mods, dash]) try { fs.rmSync(x, { recursive: true, force: true }); } catch {}
  }
}
try { fs.rmSync(soul, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
