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

// ---------- 1b) 단위: 검진표 · 기록 ----------
const G = [{ id: 'relay', title: '중계기' }, { id: 'programs', title: '프로그램' }, { id: 'keys', title: '열쇠' }];
const CK = (findings, extra = {}) => ({ ok: true, at: '2026-11-26T07:24:13.057Z', recorded: true, id: '20261126-072413-9cb7eb', groups: G, findings, ...extra });
const CK_BAD = CK([
  { id: 'relay.accounts', group: 'relay', title: '쓸 수 있는 클로드 계정', state: 'bad', summary: '5개 가운데 4개를 쓸 수 있습니다.' },
  { id: 'relay.owner', group: 'relay', title: '포트 주인이 중계기인가', state: 'ok', summary: '중계기 프로그램입니다(PID 19112).' },
  { id: 'programs.codex', group: 'programs', title: '코덱스 프로그램', state: 'bad', summary: '실제 프로그램이 없습니다.' },
  { id: 'keys.claude-longkey', group: 'keys', title: '클로드 1년 열쇠', state: 'ok', summary: '만료까지 362일 남았습니다.' },
]);
const CK_OK = CK([{ id: 'relay.owner', group: 'relay', title: '포트 주인이 중계기인가', state: 'ok', summary: '중계기 프로그램입니다.' }, { id: 'keys.claude-longkey', group: 'keys', title: '클로드 1년 열쇠', state: 'ok', summary: '만료까지 362일 남았습니다.' }]);
const RECS = { v: 1, ok: true, items: [{ at: '2026-11-26T07:24:13.057Z', kind: 'checkup', from: 'window', okCount: 2, warn: 0, bad: 2, account: MAIL }, { at: '2026-11-26T06:03:45.000Z', kind: 'treat-end', outcome: 'resolved', case: 'x' }, { at: 'nope', kind: 'checkup' }, { at: '2026-11-26T05:43:33.058Z', kind: 'weird' }] };
{
  const dirty = CK([{ id: 'relay.owner', group: 'relay', title: 'T'.repeat(500), state: 'ok', summary: `중계기 프로그램입니다(PID 19112). ${'x'.repeat(900)}`, detail: SECRET, source: 'C:\\Users\\x' }, { id: 'BAD ID', group: 'relay', title: 'x', state: 'ok', summary: '' }, { id: 'keys.x', group: 'nogroup', title: 'x', state: 'ok', summary: '' }, { id: 'keys.y', group: 'keys', title: 'x', state: 'exploded', summary: '' }], { token: SECRET });
  const c = D.cleanCheckup(dirty), raw = JSON.stringify(c);
  ok(c.findings.length === 1 && c.findings[0].title.length === 120 && c.findings[0].summary.length === 300 && !raw.includes('PID') && !raw.includes(SECRET) && !raw.includes('detail') && !raw.includes('Users'), '1 검진표: 허용한 칸 · 길이만(번호 · 자세한 칸 · 경로 · 모르는 항목은 버림)');
  ok(D.cleanCheckup({ ok: false, why: 'timeout' }) === null && D.cleanCheckup(CK([])) === null && D.cleanCheckup({ ok: true, findings: 'x', groups: [] }) === null, '1 검진표: 실패 · 빈 표 · 틀린 모양은 없음');
  const rc = RECS.items.map(D.cleanRecord);
  ok(rc[0] && !('account' in rc[0]) && rc[0].bad === 2 && rc[1].outcome === 'resolved' && !('case' in rc[1]) && rc[2] === null && rc[3] === null, '1 기록: 허용한 칸만 · 시각 · 종류가 틀린 줄은 버림');

  const f = fakeDoctor(), logs = [];
  const gate = (extra = {}) => new D.DoctorGate({ log: (m) => logs.push(m), place: () => P.doctorPlace({ IRIS_DOCTOR_DIR: f.dir }), env: process.env, direct: false, ...extra });
  f.set({ checkup: { json: CK_BAD }, records: { json: RECS } });
  let g = gate();
  const three = await Promise.all([g.checkup(), g.checkup(), g.checkup()]);
  ok(three.every((r) => r.ok && r.findings.length === 4 && r.recorded === true) && f.calls().length === 1 && f.calls()[0].args.join(' ') === 'checkup --from window' && f.calls()[0].env.length === 0, '1 검진: 겹친 요청 셋 = Doctor 한 번(`checkup --from window`) · 자식에 열쇠 변수 없음');
  await g.checkup(); ok(f.calls().length === 1, '1 검진: 1분 안에는 같은 검진표를 다시 줌');
  await g.checkup({ fresh: true }); ok(f.calls().length === 2, '1 검진: 「다시 검진」 = 새로 돈다');
  // 코덱스 검토 지적(2바퀴): Doctor 가 "장부를 읽지 못했다"(ok:false)고 하면 "기록 없음"으로 바꾸지 않는다
  f.set({ checkup: { json: CK_BAD }, records: { json: { v: 1, ok: false, items: [] } } });
  ok((await g.records()).ok === false, '1 기록 읽기: 읽지 못함은 읽지 못함으로(빈 기록이 아님)');
  f.set({ checkup: { json: CK_BAD }, records: { json: { v: 1, ok: true, items: [] } } });
  const empty = await g.records(); ok(empty.ok === true && empty.items.length === 0, '1 기록 읽기: 아직 기록이 없음 = ok + 빈 목록');
  f.set({ checkup: { json: CK_BAD }, records: { json: RECS } });
  const r1 = await g.records();
  ok(r1.ok && r1.items.length === 2 && !JSON.stringify(r1).includes(MAIL), '1 기록 읽기: 장부의 줄(계정 이름 없음)');
  for (const [mode, name, why] of [['garbage', '깨진 글', 'failed'], ['exit', '답 없이 끝남', 'failed']]) { f.set({ checkup: { mode } }); const r = await gate().checkup(); ok(r.ok === false && r.why === why, `1 검진: ${name} = 실패(정상이라고 하지 않음)`); }
  f.set({ checkup: { json: { ok: false, why: 'timeout' } } }); ok((await gate().checkup()).why === 'timeout', '1 검진: Doctor 쪽 시간 초과를 그대로 알림');
  f.set({ checkup: { mode: 'slow', ms: 4000, json: CK_OK } });
  const t1 = Date.now(), slow = await gate({ checkMs: 600 }).checkup();
  ok(slow.ok === false && slow.why === 'timeout' && Date.now() - t1 < 3000, '1 검진: 느리면 상한에서 끊음');
  const g2 = gate(); f.set({ checkup: { mode: 'garbage' } }); await g2.checkup(); f.set({ checkup: { json: CK_OK } });
  ok((await g2.checkup()).ok === true, '1 검진: 실패한 검진표는 붙들어 두지 않음(다음에 새로 돈다)');
  ok(logs.some((l) => /^doctor checkup: ok findings=4 recorded=true$/.test(l)) && !logs.join('\n').includes(f.dir), '1 로그: 결과 낱말과 수만');
  f.rm();
}

// ---------- 2) 정적 ----------
{
  const html = src('app/index.html'), js = src('app/doctor.js'), st = src('app/settings.js'), dm = src('daemon/doctor.mjs'), sv = src('daemon/server.mjs'), icons = src('app/icons.js'), main = src('app/main.js'), css = src('app/style.css');
  const win = (html.match(/<div id="dr-modal"[\s\S]*?<\/div>\s*\n<\/div>/) || [''])[0];
  ok(/<button id="rail-doctor" class="rail-doctor" type="button"[^>]*hidden>/.test(html) && html.indexOf('id="rail-doctor"') > html.indexOf('id="session-list"') && html.indexOf('id="rail-doctor"') < html.indexOf('id="rail-resize"'), '2 작업목록 바닥의 단추(처음엔 숨김 — Doctor 가 있을 때만 보임)');
  ok(win.includes('id="dr-big"') && win.includes('id="dr-list"') && win.includes('id="dr-accounts"') && win.includes('id="dr-open"') && win.includes('id="dr-rec"') && /role="dialog" aria-modal="true"/.test(win), '2 검진표 창: 결론 · 묶음 목록 · 계정 · 치료 단추 · 기록');
  ok(!/data-pane="doctor"/.test(html) && !/doctor/.test(st.match(/const PANES = \[[^\]]*\]/)[0]), '2 설정의 IRIS Doctor 탭은 없음(목차는 아홉 줄 그대로)');
  const spots = [...html.matchAll(/data-doctor="([a-z]+)"/g)].map((m) => m[1]).sort().join(',');
  ok(spots === 'account,dead,update', `2 곳곳의 단추: 계정·보안 · 끝난 대화 띠 · 업데이트 (${spots})`);
  ok(/agentOffHelp\(b\)/.test(main) && /retryLabel: 'IRIS Doctor'/.test(main) && /sendFails >= 2 && window\.DoctorView\?\.available\?\.\(\)/.test(main), '2 곳곳의 단추: 꺼진 에이전트 단추 · 잇달아 실패한 보내기');
  ok(/:root:not\(\.has-doctor\) \[data-doctor\], :root:not\(\.has-doctor\) \.dr-hint \{ display: none !important; \}/.test(css) && /if \(!window\.DoctorView\?\.available\?\.\(\)\) return;/.test(main), '2 Doctor 가 없는 PC: 곳곳의 단추가 보이지 않고 꺼진 에이전트 단추는 지금까지처럼 아무 일 없음');
  ok(/if \(window\.DoctorView\?\.isOpen\?\.\(\)\) \{ window\.DoctorView\.close\(\); return; \}/.test(main), '2 Esc = Doctor 창만 닫는다(작업 중단으로 새지 않음)');
  const shown = win.replace(/<!--[\s\S]*?-->/g, '') + js.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*\*[\s\S]*?\*\//g, '');
  ok(!/TeamClaude|데몬|PID/.test(shown) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(shown), '2 화면 글: 안쪽 이름 · 번호 · 이모지 없음');
  ok(!/\b(alert|confirm|prompt)\s*\(/.test(js.replace(/Dialog\.\w+\(/g, '')) && /Dialog\.error\(\{ title:/.test(js), '2 알림은 Dialog 로만');
  ok((js.match(/innerHTML/g) || []).length === 1 && /s\.innerHTML = window\.Icons \? Icons\.svg\('pulse', 16\) : ''/.test(js), '2 받은 값은 글로만 넣는다(innerHTML 은 우리 아이콘 한 군데)');
  ok(/pulse: '/.test(icons) && html.includes('<script src="/app/doctor.js"></script>'), '2 아이콘 pulse · 스크립트');
  ok(/if \(!sameOrigin\(req\)\) \{ log\(`403 doctor open/.test(sv) && /if \(!sameOrigin\(req\)\) \{ log\(`403 doctor checkup/.test(sv) && /if \(!d\.available\) return json\(res, 404/.test(sv), '2 창구: 열기 · 검진은 같은 출처만 · Doctor 가 없으면 404');
  ok(!/import\([^)]*iris-doctor|from '[^']*iris-doctor/.test(dm) && !/\bexec(Sync)?\(|shell: true/.test(dm), '2 데몬은 Doctor 코드를 불러오지 않고(자식으로만) · 명령 글을 만들지 않음');
  const num = (name) => Number((dm.match(new RegExp(`const ${name} = ([\\d_]+)`)) || [])[1]?.replace(/_/g, ''));
  ok(num('OPEN_MS') > 20_000 && num('CHECK_MS') > 90_000, `2 바깥 상한이 Doctor 쪽 기다림보다 김(열기 ${num('OPEN_MS')} > 20초 · 검진 ${num('CHECK_MS')} > 90초)`);
}

// ---------- 3) 시험 데몬 ----------
const PORT = 3463, P2 = 3464;
const fake = fakeDoctor();
fake.set({ summary: { json: SUM_OK }, open: { json: { ok: true, others: 0 } }, checkup: { json: CK_BAD }, records: { json: RECS } });
const mk = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `iris-face-dr-${name}-`));
const state = mk('st'), mods = mk('mods'), st2 = mk('st2');
for (const s of [state, st2]) { fs.writeFileSync(path.join(s, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8'); fs.writeFileSync(path.join(s, 'sessions.json'), '[]', 'utf8'); fs.writeFileSync(path.join(s, 'planner-rules.json'), JSON.stringify({ intro: 'seen' }), 'utf8'); }
const baseEnv = { ...process.env, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' };
const env2 = { ...baseEnv, IRIS_FACE_PORT: String(P2), IRIS_FACE_STATE: st2 }; delete env2.IRIS_DOCTOR_DIR;
const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore', env: { ...baseEnv, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_DOCTOR_DIR: fake.dir } });
const d2 = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore', env: env2 });
let browser = null;
const up = async (port, pid) => { for (let i = 0; i < 80; i++) { await sleep(250); try { if ((await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).pid === pid) return true; } catch {} } return false; };
const called = (what) => fake.calls().filter((c) => c.args[0] === what).length;
try {
  const A = `http://127.0.0.1:${PORT}`, B = `http://127.0.0.1:${P2}`;
  const [u1, u2] = await Promise.all([up(PORT, d.pid), up(P2, d2.pid)]);
  ok(u1 && u2, `3 시험 데몬 ${PORT}(가짜 Doctor) · ${P2}(Doctor 없음)`);
  if (u1 && u2) {
    const h = await (await fetch(`${A}/api/health`)).json(), h2 = await (await fetch(`${B}/api/health`)).json();
    ok(h.features?.doctor?.available === true && h2.features?.doctor?.available === false, '3 기능 표: Doctor 있음 / 없음');
    ok((await fetch(`${B}/api/doctor`)).status === 404 && (await fetch(`${B}/api/doctor/open`, { method: 'POST' })).status === 404 && (await fetch(`${B}/api/doctor/checkup`, { method: 'POST' })).status === 404 && (await fetch(`${B}/api/doctor/records`)).status === 404, '3 Doctor 가 없으면 창구 넷 모두 404');
    const gt = await (await fetch(`${A}/api/doctor`)).text();
    ok(JSON.parse(gt).link?.claude?.state === 'ready' && !/account|token|@/.test(gt), '3 GET /api/doctor: 계정 요약(계정 이름 · 열쇠 없음)');
    for (const p of ['open', 'checkup']) { const bad = await fetch(`${A}/api/doctor/${p}`, { method: 'POST', headers: { Origin: 'http://evil.example' } }); ok(bad.status === 403 && called(p) === 0, `3 ${p}: 다른 출처 = 403 · Doctor 를 부르지 않음`); }
    const ck = await (await fetch(`${A}/api/doctor/checkup`, { method: 'POST', headers: { Origin: A } })).json();
    ok(ck.ok === true && ck.findings.length === 4 && !JSON.stringify(ck).includes('PID') && called('checkup') === 1, '3 검진: 검진표(번호 없음) · Doctor 한 번');
    const rj = await (await fetch(`${A}/api/doctor/records`)).json();
    ok(rj.ok === true && rj.items.length === 2 && rj.items[0].kind === 'checkup', '3 기록 읽기');
    const log = fs.readFileSync(path.join(state, 'daemon.log'), 'utf8');
    ok(/doctor checkup: ok findings=4/.test(log) && !log.includes(fake.dir), '3 로그: 결과 낱말만');

    const req = createRequire(import.meta.url); let pw = null;
    for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
    if (!pw) console.log('SKIP 3절 화면: playwright 없음');
    else {
      const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
      browser = await chromium.launch();
      const p = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text()) && !/^Failed to load resource/.test(m.text())) errs.push(m.text()); });
      const body = () => p.evaluate(() => document.body.innerText);
      const T = (sel) => p.locator(sel).textContent();
      await p.goto(`${A}/`); await sleep(2200);
      await p.keyboard.press('Escape'); await sleep(200);
      ok(await p.locator('#rail-doctor').isVisible() && !(await p.locator('#dr-modal').isVisible()), '3 화면: 작업목록 바닥에 IRIS Doctor 단추 · 창은 닫혀 있음');
      const n0 = called('checkup');
      await p.locator('#rail-doctor').click(); await sleep(1300);
      ok(await p.locator('#dr-modal').isVisible() && (await T('#dr-big')) === '고장 2건' && called('checkup') <= n0 + 1, `3 화면: 누르면 검진표 창 · 결론 한 줄(${await T('#dr-big')})`);
      const chips = (await p.locator('#dr-chips .dr-chip').allTextContents()).join(' | ');
      ok(chips === '고장 2 | 정상 2', `3 화면: 숫자 칩(${chips})`);
      const rows0 = await p.locator('#dr-list .dr-row').allTextContents();
      ok(rows0.length === 2 && rows0.every((t) => /클로드 계정|코덱스 프로그램/.test(t)) && (await p.locator('#dr-list .dr-grp').count()) === 3, '3 화면: 묶음 셋 · 처음엔 문제 항목만 보임(정상 항목은 접힘)');
      await p.locator('#dr-list .dr-gh').first().click(); await sleep(200);
      const rows1 = await p.locator('#dr-list .dr-row').allTextContents();
      ok(rows1.length === 3 && rows1.some((t) => /포트 주인/.test(t)) && !rows1.join(' ').includes('PID'), '3 화면: 묶음을 누르면 정상 항목까지 펼쳐짐(번호는 보이지 않음)');
      // 코덱스 검토 지적: 묶음을 눌러 목록이 다시 그려져도 초점이 그 묶음에 남는다 · 그 위에 안내 창이 뜨면 Tab 초점을 빼앗지 않는다
      ok(await p.evaluate(() => document.activeElement?.classList.contains('dr-gh') && document.activeElement.dataset.group === 'relay'), '3 화면: 묶음을 누른 뒤에도 초점이 그 묶음에');
      await p.evaluate(() => { Dialog.error({ title: '시험', message: '시험' }); }); await sleep(400);
      await p.keyboard.press('Tab'); await sleep(150);
      ok(await p.evaluate(() => !!document.activeElement?.closest('#dlg')), '3 화면: 안내 창이 떠 있으면 Tab 초점이 안내 창 안에 머문다');
      await p.evaluate(() => document.querySelector('#dlg button')?.click()); await sleep(300);
      const acc = (await p.locator('#dr-accounts .dr-acc').allTextContents()).join(' | ');
      ok(/Claude준비됨 · 11\/26/.test(acc) && /Codex연결 안 됨/.test(acc) && (await T('#dr-open')) === '치료하기', `3 화면: 계정 두 줄(${acc}) · 치료 단추`);
      ok((await p.evaluate(() => document.querySelector('.dr-win').innerText.length)) < 420, `3 화면: 창의 글이 짧다(${await p.evaluate(() => document.querySelector('.dr-win').innerText.length)}자)`);
      if (process.env.IRIS_CAPTURE_DIR) { fs.mkdirSync(process.env.IRIS_CAPTURE_DIR, { recursive: true }); await p.screenshot({ path: path.join(process.env.IRIS_CAPTURE_DIR, 'doctor-window.png') }); }
      // 기록
      await p.locator('#dr-rec').click(); await sleep(700);
      const recs = await p.locator('#dr-list .dr-rec').allTextContents();
      ok(recs.length === 2 && /검진 — 고장 2/.test(recs[0]) && /치료 끝 — 해결/.test(recs[1]) && /이 PC 에만/.test(await T('#dr-foot-t')), `3 화면: 기록(${recs.join(' | ')}) · "이 PC 에만"`);
      await p.locator('#dr-rec').click(); await sleep(300);
      // 치료하기 = 바깥 Doctor 창
      const o0 = called('open');
      await p.locator('#dr-open').click(); await sleep(1500);
      ok(called('open') === o0 + 1 && /IRIS Doctor 창을 열었습니다/.test(await body()), '3 화면: 「치료하기」 = 바깥 Doctor 창을 한 번 연다');
      // 모두 정상
      fake.set({ summary: { json: SUM_OK }, open: { json: { ok: true, others: 0 } }, checkup: { json: CK_OK }, records: { json: RECS } });
      await p.locator('#dr-again').click(); await sleep(1300);
      ok((await T('#dr-big')) === '모두 정상' && (await T('#dr-open')) === 'Doctor 창 열기' && !(await p.locator('#rail-doctor').evaluate((b) => b.classList.contains('warn'))), '3 화면: 모두 정상 = 치료 단추를 내세우지 않음 · 작업목록 단추도 평소 모양');
      // 검진 실패 = 정상이라고 하지 않고, 치료 단추는 그대로
      fake.set({ summary: { mode: 'garbage' }, open: { json: { ok: true, others: 0 } }, checkup: { mode: 'garbage' }, records: { json: RECS } });
      await p.locator('#dr-again').click(); await sleep(1300);
      ok((await T('#dr-big')) === '검진하지 못했습니다' && await p.locator('#dr-open').isEnabled() && (await T('#dr-open')) === '치료하기', '3 화면: 검진 실패 = "검진하지 못했습니다" · 치료 단추는 됨');
      await p.evaluate(() => fetch('/api/doctor?fresh=1')); await p.locator('#dr-close').click(); await sleep(200); await p.locator('#rail-doctor').click(); await sleep(1300);
      ok((await p.locator('#dr-accounts .dr-acc').allTextContents()).every((t) => /확인 못함/.test(t)), '3 화면: 계정 상태를 못 읽으면 "확인 못함"(연결 안 됨이 아님)');
      // 고장이 나온 뒤 작업목록 단추의 꼬리표
      fake.set({ summary: { json: SUM_OK }, open: { json: { ok: true, others: 0 } }, checkup: { json: CK_BAD }, records: { json: RECS } });
      await p.locator('#dr-again').click(); await sleep(1300);
      await p.keyboard.press('Escape'); await sleep(400);
      ok(!(await p.locator('#dr-modal').isVisible()) && (await T('#rail-doctor-st')) === '고장' && await p.locator('#rail-doctor').evaluate((b) => b.classList.contains('warn')), '3 화면: Esc = 창 닫기 · 고장이 나온 뒤 작업목록 단추에 「고장」');
      // 설정: 목차는 아홉 줄 그대로
      await p.locator('#btn-settings').click(); await sleep(900);
      ok((await p.locator('#st-nav .st-nav-i').count()) === 9, '3 화면: 설정 목차 아홉 줄(IRIS Doctor 탭 없음)');
      ok(errs.length === 0, `3 화면: 페이지 오류 0${errs.length ? ' — ' + errs.join(' | ') : ''}`);
      // Doctor 가 없는 데몬: 단추가 하나도 보이지 않는다
      const q = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      await q.goto(`${B}/`); await sleep(2200);
      ok(!(await q.locator('#rail-doctor').isVisible()) && (await q.evaluate(() => [...document.querySelectorAll('[data-doctor]')].every((b) => getComputedStyle(b).display === 'none'))) && !(await q.evaluate(() => DoctorView.show())), '3 화면(Doctor 없음): 작업목록 단추 · 곳곳의 단추가 보이지 않고 창도 뜨지 않음');
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
