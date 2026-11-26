// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 설정 → IRIS Doctor(창 안 입구) 검사. 실 데몬(3458) · 진짜 IRIS Doctor(연결 카드 · 열쇠) · 진짜 탐색기는 건드리지 않는다. 사용: node scripts/check-doctor.mjs
//   1절 단위: 자리 찾기(없음 / 상함 / 있음 · 시험 데몬은 진짜 자리를 보지 않음) · 요약 다듬기(허용한 칸만) · 열기(한 번만 부름 · 겹친 요청 합침 · 연타 · 시간 초과 = 확인 못함 ·
//            답이 깨지면 시작 파일을 곧바로 · 시험 데몬은 곧바로 띄우지 않음) · 자식에게 열쇠 변수를 넘기지 않음
//   2절 정적: 묶음 · 목차 · 아이콘 · 네이티브 알림 없음 · 화면 글에 안쪽 이름 · 이모지 없음 · 창구는 같은 출처만 · 데몬이 Doctor 코드를 불러오지 않음
//   3절 시험 데몬(3463 = 가짜 Doctor 있음 · 3464 = 없음): 기능 표 · 요약에 계정 이름 없음 · 다른 출처 403 · 열기 한 번 · 없으면 404 ·
//       (playwright 있으면) 목차 줄 · 계정 줄 · 「복구 준비 미완료」 꼬리표 · 상태를 못 읽어도 열기 단추가 됨 · 페이지 오류 0
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const D = await import(pathToFileURL(path.join(ROOT, 'daemon', 'doctor.mjs')).href);
const P = await import(pathToFileURL(path.join(ROOT, 'daemon', 'paths.mjs')).href);
const SECRET = 'sk-ant-oat01-' + 'Zz9'.repeat(20), MAIL = 'someone@example.com';

// ---- 가짜 Doctor: 받은 인자를 calls.jsonl 에 적고, behavior.json 이 시키는 대로 답한다 ----
const FAKE = [
  "import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';",
  "const here = path.dirname(fileURLToPath(import.meta.url)); const args = process.argv.slice(2);",
  "fs.appendFileSync(path.join(here, 'calls.jsonl'), JSON.stringify({ args, env: Object.keys(process.env).filter((k) => /ANTHROPIC|OPENAI|CLAUDE|CODEX|TOKEN/i.test(k)), temp: process.env.TEMP || null }) + '\\n');",
  "let b = {}; try { b = JSON.parse(fs.readFileSync(path.join(here, 'behavior.json'), 'utf8')); } catch {}",
  "const m = b[args[0] === 'link' ? 'summary' : args[0]] || {};",
  "const out = (t) => process.stdout.write(t);",
  "if (m.stderr) process.stderr.write(m.stderr);",
  "if (m.mode === 'slow') await new Promise((r) => setTimeout(r, m.ms || 5000));",
  "if (m.mode === 'garbage') out('IRIS Doctor 가 깨졌습니다\\n');",
  "else if (m.mode === 'multi') out(JSON.stringify(m.json) + '\\n' + JSON.stringify(m.json) + '\\n');",
  "else if (m.mode === 'big') out('x'.repeat(20000) + '\\n');",
  "else if (m.mode === 'exit') process.exit(3);",
  "else out(JSON.stringify(m.json ?? {}) + '\\n');",
  '',
].join('\n');
function fakeDoctor({ start = true, program = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-dr-'));
  if (start) fs.writeFileSync(path.join(dir, 'IRIS Doctor.cmd'), '@echo off\r\n');
  if (program) fs.writeFileSync(path.join(dir, 'iris-doctor.mjs'), FAKE);
  const set = (b) => fs.writeFileSync(path.join(dir, 'behavior.json'), JSON.stringify(b));
  const calls = () => { try { return fs.readFileSync(path.join(dir, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  return { dir, set, calls, rm: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } };
}
const SUM_OK = { v: 1, protected: true, claude: { state: 'ready', okAt: '2026-11-26T05:43:33.058Z', failAt: null, daysLeft: 362 }, codex: { state: 'none', okAt: null, failAt: null } };
const SUM_NONE = { v: 1, protected: true, claude: { state: 'none', okAt: null, failAt: null, daysLeft: null }, codex: { state: 'none', okAt: null, failAt: null } };
/** 탐색기를 부르는 것은 가로채 적기만 하고, 나머지(node 자식)는 진짜로 띄운다 */
const spy = (seen, how = 'ok') => (exe, args, opt) => {
  if (!/explorer\.exe$/i.test(exe)) return spawn(exe, args, opt);
  seen.push({ exe, args, opt });
  const c = new EventEmitter(); c.unref = () => {};
  if (how === 'ok') { c.pid = 4242; setImmediate(() => c.emit('spawn')); } else setImmediate(() => c.emit('error', new Error('ENOENT'))); // 뜨지 못함은 나중에(비동기로) 알려 온다
  return c;
};

// ---------- 1) 단위 ----------
{
  const none = path.join(os.tmpdir(), 'iris-face-dr-none-' + process.pid);
  ok(P.doctorPlace({ IRIS_DOCTOR_DIR: none }) === null, '1 자리: 적어 준 폴더가 없으면 없음(진짜 자리로 넘어가지 않음)');
  ok(P.doctorPlace({ IRIS_FACE_STATE: os.tmpdir() }) === null, '1 자리: 시험 데몬은 따로 적어 주지 않으면 Doctor 없음');
  const a = fakeDoctor(), b = fakeDoctor({ program: false }), c = fakeDoctor({ start: false });
  ok(P.doctorPlace({ IRIS_DOCTOR_DIR: a.dir })?.broken === false, '1 자리: 시작 파일 + 프로그램 = 있음');
  ok(P.doctorPlace({ IRIS_DOCTOR_DIR: b.dir })?.broken === true && P.doctorPlace({ IRIS_DOCTOR_DIR: c.dir })?.broken === true, '1 자리: 둘 가운데 하나만 있으면 "없음"이 아니라 "상함"(입구를 숨기지 않는다)');

  const env = { ...process.env, ANTHROPIC_API_KEY: SECRET, OPENAI_API_KEY: SECRET, CLAUDE_CODE_OAUTH_TOKEN: SECRET, ANTHROPIC_BASE_URL: 'http://x' };
  const ce = D.childEnvFor(env);
  ok(!Object.keys(ce).some((k) => /ANTHROPIC|OPENAI|CLAUDE|TOKEN/i.test(k)) && ce.TEMP === process.env.TEMP && !!ce.SystemRoot, '1 자식 환경: 열쇠 · 연결 주소 변수는 넘기지 않고, 임시 폴더는 같게');

  // 요약 다듬기
  const dirty = { v: 1, protected: true, claude: { state: 'ready', okAt: '2026-11-26T05:43:33.058Z', failAt: `x ${MAIL}`, daysLeft: 362, account: MAIL, token: SECRET }, codex: { state: 'weird', okAt: '<script>', failAt: null, credit: 'x' }, extra: SECRET };
  const cl = D.cleanSummary(dirty), raw = JSON.stringify(cl);
  ok(cl.state === 'ok' && cl.claude.state === 'ready' && cl.claude.failAt === null && cl.codex.state === 'unknown' && cl.codex.okAt === null && !raw.includes(MAIL) && !raw.includes(SECRET) && !raw.includes('script') && !raw.includes('account'), '1 요약: 허용한 낱말 · 모양이 맞는 시각만(계정 · 열쇠 · 엉뚱한 글은 버림)');
  ok(D.cleanSummary({ v: 1, busy: true }).state === 'busy' && D.cleanSummary(null) === null && D.cleanSummary([1]) === null && D.cleanSummary({ v: 1 }) === null, '1 요약: 바쁨 · 모양이 틀리면 없음');
  // 코덱스 검토 지적(2바퀴): 문법은 맞지만 계정 칸이 비었거나 글자인 답을 "정상으로 읽었다"고 하지 않는다
  ok([{ v: 1, claude: {}, codex: {} }, { v: 1, claude: 'ready', codex: 'none' }, { v: 1, claude: { state: 'ready' }, codex: {} }, { v: 1, claude: { state: 1 }, codex: { state: 'none' } }, { v: 1, claude: [], codex: { state: 'none' } }].every((j) => D.cleanSummary(j) === null), '1 요약: 계정 칸이 제 모양(객체 + 상태 낱말)이 아니면 없음(= 확인 못함)');

  const logs = [], seen = [];
  const gate = (f, extra = {}) => new D.DoctorGate({ log: (m) => logs.push(m), place: () => P.doctorPlace({ IRIS_DOCTOR_DIR: f.dir }), spawnFn: spy(seen), env, ...extra });

  // 상태
  a.set({ summary: { json: { ...SUM_OK, claude: { ...SUM_OK.claude, account: MAIL } }, stderr: `오류 ${SECRET}` } });
  let g = gate(a);
  let s = await g.status();
  ok(s.state === 'ok' && s.claude.state === 'ready' && s.claude.daysLeft === 362 && !JSON.stringify(s).includes(MAIL), '1 상태: 요약을 읽음(계정 이름 없음)');
  ok(a.calls().length === 1 && a.calls()[0].args.join(' ') === 'link summary' && a.calls()[0].env.length === 0, '1 상태: `link summary` 로 한 번 · 자식에 열쇠 변수 없음');
  await g.status(); ok(a.calls().length === 1, '1 상태: 30초 안에는 다시 부르지 않음');
  await g.status({ fresh: true }); ok(a.calls().length === 2, '1 상태: fresh 면 다시 읽음');
  for (const [mode, name] of [['garbage', '깨진 글'], ['multi', '여러 줄'], ['big', '너무 긴 글'], ['exit', '답 없이 끝남']]) {
    a.set({ summary: { mode, json: SUM_OK } });
    ok((await gate(a).status()).state === 'unknown', `1 상태: ${name} = "확인 못함"("연결 안 됨"이 아님)`);
  }
  a.set({ summary: { mode: 'slow', ms: 4000, json: SUM_OK } });
  let t0 = Date.now(); s = await gate(a, { statusMs: 600 }).status();
  ok(s.state === 'unknown' && Date.now() - t0 < 3000, '1 상태: 느리면 상한에서 끊고 "확인 못함"');
  a.set({ summary: { json: { v: 1, busy: true } } });
  ok((await gate(a).status()).state === 'busy', '1 상태: 연결 작업 중이면 "바쁨"');

  // 열기
  fs.rmSync(path.join(a.dir, 'calls.jsonl'), { force: true });
  a.set({ open: { json: { ok: true, others: 2, pid: 4321, path: 'C:\\x' } } });
  g = gate(a);
  const three = await Promise.all([g.open(), g.open(), g.open()]);
  ok(three.every((r) => r.ok === true && r.others === 2) && JSON.stringify(three[0]) === '{"ok":true,"others":2}', '1 열기: 성공 — 허용한 칸만(번호 · 경로 없음)');
  ok(a.calls().length === 1 && a.calls()[0].args.join(' ') === 'open', '1 열기: 겹친 요청 셋 = 자식 한 번(`open`)');
  const again = await g.open();
  ok(again.repeated === true && a.calls().length === 1, '1 열기: 끝난 뒤 5초 안의 연타는 부르지 않고 같은 답');
  ok(seen.length === 0, '1 열기: Doctor 가 답하면 데몬이 탐색기를 직접 부르지 않음');
  a.set({ open: { json: { ok: false, why: 'no-response', others: 0 } } });
  ok((await gate(a).open()).why === 'unconfirmed', '1 열기: 띄웠는데 표시가 없음 = "확인 못함"(열렸을 수 있다)');
  a.set({ open: { mode: 'slow', ms: 5000, json: { ok: true, others: 0 } } });
  t0 = Date.now(); let r = await gate(a, { openMs: 700 }).open();
  ok(r.ok === false && r.why === 'unconfirmed' && Date.now() - t0 < 3000 && seen.length === 0, '1 열기: 느리면 상한에서 자식만 끊고 "확인 못함"(곧바로 다시 띄우지 않음 — 창이 둘 뜨지 않게)');
  a.set({ open: { json: { ok: false, why: 'start-file-missing' } } });
  ok((await gate(a).open()).why === 'start-file-missing', '1 열기: 시작 파일 없음을 그대로 알림');
  // Doctor 프로그램이 깨져 답하지 못함 → 시작 파일을 탐색기에 곧바로(인자 하나 · shell 없음)
  a.set({ open: { mode: 'garbage' } });
  r = await gate(a, { direct: true }).open();
  ok(r.ok === true && r.direct === true && seen.length === 1 && seen[0].args.length === 1 && seen[0].args[0] === path.join(a.dir, 'IRIS Doctor.cmd') && seen[0].opt.shell === false, '1 열기: 답이 깨지면 시작 파일을 탐색기에 곧바로(인자 하나)');
  ok((await gate(a, { direct: false }).open()).why === 'failed' && seen.length === 1, '1 열기: 시험 데몬은 탐색기를 부르지 않음');
  r = await gate(b, { direct: true }).open();
  ok(r.ok === true && r.direct === true && seen.length === 2, '1 열기: 프로그램 파일이 없어도 시작 파일이 있으면 연다(시작 파일이 안내를 띄운다)');
  ok((await gate(c, { direct: true }).open()).ok === false, '1 열기: 시작 파일이 없으면 열지 못함을 알림');
  ok((await gate(b).status()).state === 'unknown' && gate(b).public().broken === true, '1 상함: 상태는 "확인 못함" · 기능 표에 broken');
  // 코덱스 검토 지적: 탐색기가 뜨지 못한 것(나중에 오는 오류)을 "띄웠다"고 하지 않는다
  const seenBad = [];
  r = await new D.DoctorGate({ log: (m) => logs.push(m), place: () => P.doctorPlace({ IRIS_DOCTOR_DIR: b.dir }), spawnFn: spy(seenBad, 'error'), env, direct: true }).open();
  ok(r.ok === false && r.why === 'spawn' && seenBad.length === 1, '1 열기: 탐색기가 뜨지 못하면(비동기 오류) 성공이 아님');
  // 코덱스 검토 지적: 프로그램 파일이 없을 때 읽은 "확인 못함"에 붙박이지 않는다 — 파일이 돌아오면 다시 읽는다
  const gb = gate(b);
  ok((await gb.status()).state === 'unknown' && (await gb.status({ fresh: true })).state === 'unknown', '1 상태: 프로그램 파일이 없으면 "확인 못함"');
  fs.writeFileSync(path.join(b.dir, 'iris-doctor.mjs'), FAKE); b.set({ summary: { json: SUM_OK } });
  ok((await gb.status({ fresh: true })).state === 'ok' && b.calls().length === 1, '1 상태: 프로그램 파일이 돌아온 뒤 다시 읽으면 새 상태');
  const allLogs = logs.join('\n');
  ok(logs.length > 0 && !allLogs.includes(a.dir) && !allLogs.includes(SECRET) && !/[A-Za-z]:\\/.test(allLogs), `1 로그: 결과 낱말만(경로 · 열쇠 없음) — ${logs.slice(0, 3).join(' / ')}`);
  a.rm(); b.rm(); c.rm();
}

// ---------- 2) 정적 ----------
{
  const html = src('app/index.html'), js = src('app/doctor.js'), st = src('app/settings.js'), dm = src('daemon/doctor.mjs'), sv = src('daemon/server.mjs'), icons = src('app/icons.js');
  const pane = (html.match(/<div class="st-pane" data-pane="doctor" hidden>[\s\S]*?<\/div>\s*\n\s*<div class="st-pane"/) || [''])[0];
  ok(pane.includes('id="dr-open"') && pane.includes('id="dr-accounts"') && pane.includes('id="dr-tag"') && pane.includes('복구 준비 미완료'), '2 묶음: 열기 단추 · 계정 줄 자리 · 「복구 준비 미완료」 꼬리표');
  ok(/<button class="st-nav-i" data-pane="doctor" id="st-nav-doctor" hidden>/.test(html) && /pulse: '/.test(icons) && html.includes('<script src="/app/doctor.js"></script>'), '2 목차 줄은 처음에 숨김 · 아이콘 pulse · 스크립트');
  const shown = pane.replace(/<!--[\s\S]*?-->/g, '') + js.replace(/^\s*\/\/.*$/gm, '');
  ok(!/TeamClaude|데몬|중계기|PID/.test(shown) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(shown), '2 화면 글: 안쪽 이름 · 이모지 없음');
  ok(!/\b(alert|confirm|prompt)\s*\(/.test(js.replace(/Dialog\.\w+\(/g, '')) && /Dialog\.error\(\{ title:/.test(js) && /Dialog\.notice\(/.test(js), '2 알림은 Dialog 로만(실패는 Dialog.error — 제목 · 할 일 · 자세히)');
  ok(!/innerHTML/.test(js), '2 화면: 받은 값을 HTML 로 넣지 않음');
  ok(/상태를 확인하지 못함/.test(js) && /known\(\)/.test(js) && !/disabled = !known/.test(js), '2 상태를 읽지 못한 것을 "연결 안 됨"으로 적지 않음 · 열기 단추를 막지 않음');
  ok(/const doctorOn = \(\) => !!health\?\.features\?\.doctor\?\.available;/.test(st) && /p === 'doctor' && !doctorOn\(\) \? 'design'/.test(st) && /dn\.hidden = !dOn/.test(st), '2 Doctor 가 없으면 목차 줄 숨김 · 그 묶음으로 가려 하면 디자인으로');
  ok(/id="st-doctor-hint"[^>]*hidden/.test(html) && /\$\('#st-doctor-go'\)\?\.addEventListener\('click', \(\) => window\.DoctorView\?\.open\(\)\)/.test(st), '2 끊김 안내의 바로가기 줄: 누르면 바깥 Doctor 를 바로 연다(묶음으로 보내지 않음)');
  ok(/if \(!sameOrigin\(req\)\) \{ log\(`403 doctor open/.test(sv) && /if \(!d\.available\) return json\(res, 404/.test(sv), '2 창구: 열기는 같은 출처만 · Doctor 가 없으면 404');
  ok(!/import\([^)]*iris-doctor|from '[^']*iris-doctor/.test(dm) && !/\bexec(Sync)?\(|shell: true/.test(dm), '2 데몬은 Doctor 코드를 불러오지 않고(자식으로만) · 명령 글을 만들지 않음');
  const openMs = Number((dm.match(/const OPEN_MS = ([\d_]+)/) || [])[1]?.replace(/_/g, ''));
  ok(openMs > 20_000, `2 바깥 상한(${openMs}ms)이 Doctor 쪽 기다림(20초)보다 김`);
}

// ---------- 3) 시험 데몬 ----------
const PORT = 3463, P2 = 3464;
const fake = fakeDoctor();
fake.set({ summary: { json: SUM_OK }, open: { json: { ok: true, others: 0 } } });
const mk = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `iris-face-dr-${name}-`));
const state = mk('st'), mods = mk('mods'), st2 = mk('st2');
for (const s of [state, st2]) { fs.writeFileSync(path.join(s, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8'); fs.writeFileSync(path.join(s, 'sessions.json'), '[]', 'utf8'); fs.writeFileSync(path.join(s, 'planner-rules.json'), JSON.stringify({ intro: 'seen' }), 'utf8'); }
const baseEnv = { ...process.env, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' };
const env2 = { ...baseEnv, IRIS_FACE_PORT: String(P2), IRIS_FACE_STATE: st2 }; delete env2.IRIS_DOCTOR_DIR;
const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore', env: { ...baseEnv, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_DOCTOR_DIR: fake.dir } });
const d2 = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore', env: env2 });
let browser = null;
const up = async (port, pid) => { for (let i = 0; i < 80; i++) { await sleep(250); try { if ((await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).pid === pid) return true; } catch {} } return false; };
try {
  const A = `http://127.0.0.1:${PORT}`, B = `http://127.0.0.1:${P2}`;
  const [u1, u2] = await Promise.all([up(PORT, d.pid), up(P2, d2.pid)]);
  ok(u1 && u2, `3 시험 데몬 ${PORT}(가짜 Doctor) · ${P2}(Doctor 없음)`);
  if (u1 && u2) {
    const h = await (await fetch(`${A}/api/health`)).json(), h2 = await (await fetch(`${B}/api/health`)).json();
    ok(h.features?.doctor?.available === true && h.features.doctor.broken === false && !JSON.stringify(h.features.doctor).includes(fake.dir.slice(3, 20)), '3 기능 표: doctor 있음(경로는 싣지 않음)');
    ok(h2.features?.doctor?.available === false, '3 Doctor 가 없는 데몬: 기능 표에 없음');
    ok((await fetch(`${B}/api/doctor`)).status === 404 && (await fetch(`${B}/api/doctor/open`, { method: 'POST' })).status === 404, '3 Doctor 가 없으면 창구는 404');
    const g = await fetch(`${A}/api/doctor`), gt = await g.text(), gj = JSON.parse(gt);
    ok(g.status === 200 && gj.link?.state === 'ok' && gj.link.claude.state === 'ready' && !/account|token|@/.test(gt), '3 GET /api/doctor: 요약(계정 이름 · 열쇠 없음)');
    const bad = await fetch(`${A}/api/doctor/open`, { method: 'POST', headers: { Origin: 'http://evil.example' } });
    ok(bad.status === 403 && !fake.calls().some((c) => c.args[0] === 'open'), '3 열기: 다른 출처 = 403 · Doctor 를 부르지 않음');
    const o = await (await fetch(`${A}/api/doctor/open`, { method: 'POST', headers: { Origin: A } })).json();
    ok(o.ok === true && fake.calls().filter((c) => c.args[0] === 'open').length === 1, '3 열기: 같은 출처 = Doctor 를 `open` 으로 한 번');
    const log = fs.readFileSync(path.join(state, 'daemon.log'), 'utf8');
    ok(/doctor open: ok/.test(log) && !log.includes(fake.dir), '3 로그: 결과 낱말만');

    // 화면(playwright 있을 때)
    const req = createRequire(import.meta.url); let pw = null;
    for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
    if (!pw) console.log('SKIP 3절 화면: playwright 없음');
    else {
      const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
      browser = await chromium.launch();
      const p = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text()) && !/^Failed to load resource/.test(m.text())) errs.push(m.text()); });
      await p.goto(`${A}/`); await sleep(2000);
      await p.keyboard.press('Escape'); await sleep(200);
      await p.locator('#btn-settings').click(); await sleep(1500);
      ok(await p.locator('#st-nav-doctor').isVisible() && !(await p.locator('#st-badge-doctor').isVisible()), '3 화면: 목차에 IRIS Doctor 줄 · 준비된 계정이 있으면 꼬리표 없음');
      ok(/복구 계정 1개 준비됨/.test(await p.locator('#st-sum-doctor').textContent()), '3 화면: 목차 한 줄 = 복구 계정 1개 준비됨');
      await p.locator('#st-nav-doctor').click(); await sleep(600);
      const rows = await p.locator('#dr-accounts .dr-row').allTextContents();
      ok(await p.locator('.st-pane[data-pane="doctor"]').isVisible() && rows.length === 2 && /Claude.*준비됨 · 마지막 확인 성공 11\/26 · 열쇠 362일 남음/.test(rows[0]) && /Codex.*연결 안 됨/.test(rows[1]) && !(await p.locator('#dr-tag').isVisible()), `3 화면: 계정 줄 둘(${rows.join(' | ')})`);
      const n0 = fake.calls().filter((c) => c.args[0] === 'open').length;
      await sleep(5200); // 앞의 열기에서 5초가 지나야 새로 부른다
      await p.locator('#dr-open').click(); await sleep(1500);
      ok(fake.calls().filter((c) => c.args[0] === 'open').length === n0 + 1, '3 화면: 「IRIS Doctor 열기」 = Doctor 를 한 번 부름');
      // 준비된 계정이 없음 → 꼬리표 · 목차 !
      fake.set({ summary: { json: SUM_NONE }, open: { json: { ok: true, others: 0 } } });
      await p.evaluate(() => DoctorView.load(true)); await sleep(900);
      ok(await p.locator('#dr-tag').isVisible() && await p.locator('#st-badge-doctor').isVisible() && /문제가 생기기 전에 복구에 쓸 계정을 연결해 두세요/.test(await p.locator('#dr-note').textContent()), '3 화면: 준비된 계정이 없으면 「복구 준비 미완료」 꼬리표 · 목차 ! · 안내');
      // 상태를 읽지 못함 → "확인 못함"(경고 아님) · 열기 단추는 그대로
      fake.set({ summary: { mode: 'garbage' }, open: { json: { ok: true, others: 0 } } });
      await p.evaluate(() => DoctorView.load(true)); await sleep(900);
      const rows2 = await p.locator('#dr-accounts .dr-row').allTextContents();
      ok(rows2.every((t) => /상태를 확인하지 못함/.test(t)) && !(await p.locator('#dr-tag').isVisible()) && !(await p.locator('#st-badge-doctor').isVisible()) && await p.locator('#dr-open').isEnabled(), '3 화면: 상태를 못 읽으면 "확인 못함"(연결 안 됨 · 경고가 아님) · 열기 단추는 됨');
      // 코덱스 검토 지적: 정상 · 경고를 본 뒤 통신이 끊기거나 답이 깨지면 옛 상태를 남기지 않고 "확인 못함"으로 바꾼다
      const body = () => p.evaluate(() => document.body.innerText);
      for (const [name, sum, handler] of [['통신 실패', SUM_OK, (route) => route.abort()], ['깨진 답', SUM_NONE, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'not json' })]]) {
        fake.set({ summary: { json: sum }, open: { json: { ok: true, others: 0 } } });
        await p.evaluate(() => DoctorView.load(true)); await sleep(900);
        const before = (await p.locator('#dr-accounts .dr-row').allTextContents()).join(' | ');
        await p.route('**/api/doctor*', handler);
        await p.evaluate(() => DoctorView.load(true)); await sleep(700);
        const after = await p.locator('#dr-accounts .dr-row').allTextContents();
        ok(!/확인하지 못함/.test(before) && after.every((t) => /상태를 확인하지 못함/.test(t)) && !(await p.locator('#dr-tag').isVisible()) && !(await p.locator('#st-badge-doctor').isVisible()), `3 화면: ${name} = 앞서 본 상태를 지우고 "확인 못함"(꼬리표도 내림)`);
        await p.unroute('**/api/doctor*');
      }
      // 코덱스 검토 지적(2바퀴): 문법은 맞는데 계정 칸이 빠졌거나 · 비었거나 · 모르는 낱말인 답 = "확인 못함"이지 "복구 준비 미완료" 경고가 아니다
      for (const [name, link] of [['계정 칸 없음', { state: 'ok' }], ['빈 계정 칸', { state: 'ok', claude: {}, codex: {} }], ['모르는 상태 낱말', { state: 'ok', claude: { state: 'unknown', okAt: null, failAt: null }, codex: { state: 'none', okAt: null, failAt: null } }]]) {
        await p.route('**/api/doctor*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, broken: false, link }) }));
        await p.evaluate(() => DoctorView.load(true)); await sleep(700);
        ok(!(await p.locator('#dr-tag').isVisible()) && !(await p.locator('#st-badge-doctor').isVisible()) && /확인 못함/.test(await p.locator('#st-sum-doctor').textContent()) && await p.locator('#dr-open').isEnabled(), `3 화면: ${name} = 경고하지 않고 "확인 못함" · 열기 단추는 됨`);
        await p.unroute('**/api/doctor*');
      }
      // 코덱스 검토 지적: 말은 확인된 만큼만 — 곧바로 띄움 · 시간 초과는 제목부터 "확인하지 못했습니다", 안쪽 낱말은 화면에 내지 않는다
      const answer = async (json) => { await p.route('**/api/doctor/open', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) })); await p.locator('#dr-open').click(); await sleep(900); const t = await body(); await p.unroute('**/api/doctor/open'); return t; };
      let txt = await answer({ ok: true, others: 0, direct: true });
      ok(/IRIS Doctor 를 띄웠습니다 — 떴는지는 확인하지 못했습니다/.test(txt) && !/IRIS Doctor 를 열었습니다/.test(txt), '3 화면: 곧바로 띄운 것은 "열었습니다"라고 하지 않음');
      txt = await answer({ ok: false, why: 'unconfirmed' });
      ok(/떴는지는 확인하지 못했습니다/.test(txt) && !/열지 못했습니다/.test(txt), '3 화면: 시간 초과는 "열지 못했습니다"라고 단정하지 않음');
      txt = await answer({ ok: false, why: 'start-file-missing' });
      ok(/IRIS Doctor 를 열지 못했습니다/.test(txt) && /시작 파일이 없습니다/.test(txt) && !/start-file-missing|unconfirmed|no-answer|spawn/.test(txt), '3 화면: 실패 안내에 안쪽 낱말이 없음');
      await p.keyboard.press('Escape'); await sleep(300);
      // 기억해 둔 마지막 묶음이 doctor 여도 다시 열면 그 묶음
      await p.reload(); await sleep(2000); await p.keyboard.press('Escape'); await p.locator('#btn-settings').click(); await sleep(1200);
      ok(await p.locator('.st-pane[data-pane="doctor"]').isVisible(), '3 화면: 마지막으로 본 묶음(IRIS Doctor)을 기억');
      ok(errs.length === 0, `3 화면: 페이지 오류 0${errs.length ? ' — ' + errs.join(' | ') : ''}`);
      if (process.env.IRIS_CAPTURE_DIR) { fake.set({ summary: { json: SUM_OK } }); await p.evaluate(() => DoctorView.load(true)); await sleep(900); fs.mkdirSync(process.env.IRIS_CAPTURE_DIR, { recursive: true }); await p.screenshot({ path: path.join(process.env.IRIS_CAPTURE_DIR, 'doctor-pane.png') }); }
    }
  }
} catch (x) { fail++; console.log(`FAIL unexpected — ${x.message}`); }
finally {
  try { await browser?.close(); } catch {}
  for (const c of [d, d2]) { try { process.kill(c.pid); } catch {} } // 이 검사가 띄운 두 시험 데몬만(번호로)
  await sleep(600);
  fake.rm(); for (const s of [state, mods, st2]) { try { fs.rmSync(s, { recursive: true, force: true }); } catch {} }
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
