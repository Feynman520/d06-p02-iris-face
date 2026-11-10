// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// verify:ontology-interview — 설정 → 온톨로지 「폴더 구조 인터뷰」 프롬프트(v2.102, 2026-11-10 사용자 요청).
//   1절 정적: 프롬프트에 루트 확인·대본(interview.md)·확정 뒤 생성·그래프 다시 만들기가 있고, 개인·학교 낱말이 없다(공개 저장소)
//   2절(playwright 있을 때) 시험 데몬 3459 + 가짜 영혼(IRIS_ROOT 임시) + 헤드리스 크로미엄:
//       ⓐ 역할 0개·그래프 없음 → 큰 카드, 위 줄 단추 숨김 · 복사 = 화면의 글과 똑같음 · 「복사됨」 표시
//       ⓑ 역할 있음 → 큰 카드 없음, 위 줄 작은 단추 · 그 단추로도 같은 글 복사
// 실 데몬(3458)·실제 C:\IRIS 무접촉.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lf = (s) => String(s || '').replace(/\r\n/g, '\n');

// 1절
const src = fs.readFileSync(path.join(ROOT, 'app', 'ontology.js'), 'utf8');
const m = src.match(/const IV_PROMPT = \[([\s\S]*?)\]\.join\('\\n'\);/);
ok(!!m, '1 프롬프트 상수 있음');
const prompt = m ? new Function(`return [${m[1]}].join('\\n');`)() : ''; // 소스의 배열 글자를 그대로 계산(따옴표·이스케이프 안전)
ok(/IRIS 루트.*아니면.*멈춰/.test(prompt), '1 루트가 아니면 멈추는 줄(0번)');
ok(/_agent\/setup\/interview\.md/.test(prompt) && /없으면 아래/.test(prompt), '1 설치 PC 대본 먼저, 없으면 자체 규칙');
ok(/"네"라고 한 뒤에만 만들어/.test(prompt) && /AGENTS\.md/.test(prompt) && /CLAUDE\.md/.test(prompt), '1 확정 뒤에만 생성 + AGENTS.md·CLAUDE.md');
ok(/build_graph\.py --init --write/.test(prompt) && /render_view\.py/.test(prompt), '1 그래프 다시 만들기');
ok(/이름을 바꾸거나 지우지 마/.test(prompt) && /한 번에 한 질문/.test(prompt), '1 기존 폴더 보호 · 한 번에 한 질문');
const BANNED = /함세준|sejun|shinjang|신장|C:\\\\Users|@gmail|ai_00\d/i;
ok(!BANNED.test(prompt), '1 개인·학교 낱말 0건(공개 저장소)');

// 2절
const req = createRequire(import.meta.url);
let pw = null;
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
if (!pw) console.log('SKIP 2절: playwright 없음');
else {
  const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
  const PORT = 3459;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-iv-'));
  const soul = path.join(tmp, 'soul'); fs.mkdirSync(path.join(soul, '_agent'), { recursive: true });
  const state = path.join(tmp, 'state'); fs.mkdirSync(state);
  fs.writeFileSync(path.join(state, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8');
  fs.writeFileSync(path.join(state, 'sessions.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(state, 'tutorial.json'), JSON.stringify({ done: true }), 'utf8');
  const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, IRIS_ROOT: soul, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: path.join(tmp, 'mods'), IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' } });
  let browser;
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok; } catch {} }
    ok(up, `2 시험 데몬 ${PORT}`);
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORT}` });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const openOnto = async () => {
      await p.goto(`http://127.0.0.1:${PORT}/`); await sleep(1800);
      await p.keyboard.press('Escape'); await sleep(200);
      await p.locator('#btn-settings').click(); await sleep(800);
      await p.locator('#st-nav [data-pane="ontology"]').click(); await sleep(1200);
    };
    // ⓐ 역할 0개
    await openOnto();
    ok(await p.locator('#iv-card').isVisible(), '2ⓐ 역할 0개 → 큰 인터뷰 카드');
    ok(!(await p.locator('#on-iv').isVisible()), '2ⓐ 위 줄 작은 단추는 숨김');
    await p.locator('#iv-card .iv-copy').click(); await sleep(300);
    const clip = lf(await p.evaluate(() => navigator.clipboard.readText())); // 윈도 클립보드는 줄끝을 CRLF 로 돌려준다
    const shown = await p.locator('#iv-card .iv-pre').textContent();
    ok(clip === shown && clip === prompt, '2ⓐ 복사된 글 = 화면에 보이는 글 = 프롬프트');
    if (!(clip === shown && clip === prompt)) console.log('  clip', JSON.stringify(clip.slice(0, 60)), clip.length, '| shown', shown.length, '| prompt', prompt.length);
    ok(/복사됨/.test(await p.locator('#iv-card .iv-copy').textContent()), '2ⓐ 누르면 「복사됨」');
    await sleep(1700);
    ok(/프롬프트 복사/.test(await p.locator('#iv-card .iv-copy').textContent()), '2ⓐ 1.5초 뒤 원래 글로');
    if (process.env.IRIS_CAPTURE_DIR) await p.screenshot({ path: path.join(process.env.IRIS_CAPTURE_DIR, 'ontology-interview-empty.png') });
    // ⓑ 역할 있음
    fs.mkdirSync(path.join(soul, '_ontology'), { recursive: true });
    fs.writeFileSync(path.join(soul, '_ontology', 'graph.json'), JSON.stringify({ generated: '2026-11-10T00:00:00', nodes: { r1: { type: 'role', path: 'R01-교사(Teacher)', code: 'R01' }, d1: { type: 'domain', path: 'R01-교사(Teacher)\\D01-수업(Class)', code: 'D01' } }, edges: [] }));
    await openOnto();
    ok(!(await p.locator('#iv-card').count()), '2ⓑ 역할 있음 → 큰 카드 없음');
    ok(await p.locator('#on-iv').isVisible(), '2ⓑ 위 줄 작은 「인터뷰 프롬프트」 단추');
    await p.evaluate(() => navigator.clipboard.writeText(''));
    await p.locator('#on-iv .iv-copy').click(); await sleep(300);
    ok(lf(await p.evaluate(() => navigator.clipboard.readText())) === prompt, '2ⓑ 작은 단추도 같은 글 복사');
    if (process.env.IRIS_CAPTURE_DIR) await p.screenshot({ path: path.join(process.env.IRIS_CAPTURE_DIR, 'ontology-interview-roles.png') });
    ok(!errs.length, `2 페이지 오류 없음${errs.length ? ': ' + errs.join(' | ') : ''}`);
  } finally {
    try { await browser?.close(); } catch {}
    try { d.kill(); } catch {}
    await sleep(500);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
