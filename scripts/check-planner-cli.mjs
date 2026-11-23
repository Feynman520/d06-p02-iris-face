// 세션용 플래너 명령 검사(2026-11-23, 플래너 걸음 7) — daemon/planner-cli.mjs + bin/iris-planner(.mjs · .cmd · sh) + 안내문 · 세션 환경.
// 진짜 창구를 임시 장부 · 임시 포트의 작은 서버로 돌리고, 명령은 실제로 자식 프로세스로 부른다(진짜 데몬 · 진짜 장부 · AI · CLI 세션 접촉 0).
//   npm run verify:planner-cli
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Planner } from '../daemon/planner.mjs';
import { PlannerCli, CLI_NOTE, BIN_DIR, WRITE_LIMIT, PROPOSE_MAX, READ_LIMIT, BAD_KEY_LIMIT } from '../daemon/planner-cli.mjs';
import { withFaceNote, stripFaceNote, FACE_NOTE } from '../daemon/facenote.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-pc-'));
const cfg = {}; const sent = []; const logs = [];
let clock = new Date(2026, 10, 23, 9, 0, 0);
const pl = new Planner({ dir: path.join(base, 'planner'), stateDir: base, settings: { get: () => cfg }, broadcast: (o) => sent.push(o), log: (m) => logs.push(m), now: () => new Date(clock) });
pl.start();
const sessions = { s1: { id: 's1', title: '가정통신문 정리', agent: 'claude', cwd: 'C:\\x\\가정통신문', status: 'idle' }, s2: { id: 's2', title: '', agent: 'codex', cwd: 'C:\\x\\이름이 아주 아주 아주 긴 폴더 이름입니다 정말로', status: 'busy' } };
const server = http.createServer(async (q, s) => {
  const url = new URL(q.url, 'http://x');
  const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  const readBody = (r) => new Promise((resolve, reject) => { const ch = []; r.on('data', (c) => ch.push(c)); r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(ch).toString('utf8') || '{}')); } catch { reject(new Error('bad')); } }); });
  return pl.route(q, s, { url, json, readBody, sameOrigin: () => true });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const cli = new PlannerCli({ planner: pl, port, session: (id) => sessions[id] || null, now: () => new Date(clock), log: (m) => logs.push(m) });
pl.cliSvc = cli;
// 이 검사를 IRIS 가 띄운 세션 안에서 돌리면 PATH 에 명령 폴더가 이미 들어 있다 — 깨끗한 환경에서 시작하도록 걷어 낸다
const cleanEnv = () => { const e = { ...process.env }; for (const k of Object.keys(e)) if (/^IRIS_PLANNER_/.test(k)) delete e[k];
  const pk = Object.keys(e).find((k) => k.toLowerCase() === 'path'); const mine = [BIN_DIR, path.join(BIN_DIR, 'sh')].map((d) => path.resolve(d).toLowerCase());
  if (pk) e[pk] = e[pk].split(path.delimiter).filter((d) => d && !mine.includes(path.resolve(d).toLowerCase())).join(path.delimiter);
  return e; };
const envOf = (id) => { const e = cleanEnv(); cli.applyEnv(e, id); return e; };
/** 명령을 실제로 부른다(node 로 직접). 서버가 같은 프로세스라 비동기 spawn 으로. */
const run = (args, env, input = null) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(BIN_DIR, 'iris-planner.mjs'), ...args], { env, windowsHide: true });
  let out = '', err = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
  p.on('exit', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  if (input != null) p.stdin.end(input); else p.stdin.end();
});
const post = async (headers, body) => { const r = await fetch(`http://127.0.0.1:${port}/api/planner/cli`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }); return { code: r.status, out: await r.json() }; };
const H = (id) => ({ 'x-iris-session': id, 'x-iris-key': pl.keyFor(id) });
const says = () => sent.filter((m) => m.say).map((m) => m.say);

try {
  // ---- 1. 세션에 주는 것(환경 · 안내문) ----
  const e1 = envOf('s1'); const pathKey = Object.keys(e1).find((k) => k.toLowerCase() === 'path');
  ok(e1.IRIS_PLANNER_URL === `http://127.0.0.1:${port}` && e1.IRIS_PLANNER_SESSION === 's1' && /^[0-9a-f]{40}$/.test(e1.IRIS_PLANNER_KEY) && e1.IRIS_PLANNER_NODE === process.execPath, '세션 환경: 주소(이 PC 만) · 세션 번호 · 열쇠 · node 자리');
  const parts = e1[pathKey].split(path.delimiter);
  ok(parts[parts.length - 2] === BIN_DIR && parts[parts.length - 1] === path.join(BIN_DIR, 'sh') && parts[0] !== BIN_DIR, '명령 폴더 둘은 PATH 맨 뒤에(다른 도구를 가리지 않음)');
  const again = { ...e1 }; cli.applyEnv(again, 's1');
  ok(again[pathKey] === e1[pathKey], '두 번 더해도 PATH 가 늘지 않음');
  ok(envOf('s2').IRIS_PLANNER_KEY !== e1.IRIS_PLANNER_KEY, '열쇠는 세션마다 다름');
  cfg.plannerFromSessions = false;
  const off = { PATH: 'C:\\a' };
  ok(cli.applyEnv(off, 's1') === false && Object.keys(off).length === 1 && cli.note() === '', '「다른 세션에서 넣기」를 끄면 환경 · 안내문에 아무것도 더하지 않음');
  cfg.plannerFromSessions = true; cfg.plannerEnabled = false;
  ok(cli.applyEnv({ PATH: 'C:\\a' }, 's1') === false && cli.note() === '', '플래너를 끄면 아무것도 더하지 않음');
  cfg.plannerEnabled = true;
  ok(cli.note() === CLI_NOTE && !/[\u00B7\u29C9\u2015]/.test(CLI_NOTE) && CLI_NOTE.includes('iris-planner') && CLI_NOTE.includes('--asked') && CLI_NOTE.includes('고치기, 끝냄 표시, 지우기는 사용자가 직접 시켰을 때만 한다'), '안내문: 명령 이름 · --asked · 고치기와 지우기는 시킨 것만(코덱스가 떨어뜨리는 글자 없음)');
  const noted = withFaceNote('안녕', cli.note());
  ok(noted.includes(CLI_NOTE) && noted.endsWith('\n\n안녕') && stripFaceNote(noted) === '안녕' && withFaceNote('안녕') === `${FACE_NOTE}\n\n안녕` && withFaceNote('  ', cli.note()) === '', '안내문은 첫 요청 앞에만 · 대화 화면에서는 통째로 지워짐 · 덧붙임이 없으면 전과 같음');
  ok(stripFaceNote(noted.replace(/--/g, ' ')) === '안녕', '끝 표식의 장식이 떨어져도 지워짐');
  const src = fs.readFileSync(path.join(ROOT, 'daemon', 'sessions.mjs'), 'utf8');
  ok((src.match(/this\.spawn\(cmd, (rec\.)?cwd, cols, rows, id\)/g) || []).length === 3 && src.includes('this.hooks.sessionEnv?.(env, { id, cwd })') && (src.match(/withFaceNote\(prompt, this\.hooks\.noteExtra\?\.\(\) \|\| ''\)/g) || []).length === 2, '세션을 띄우는 세 길 모두 환경을 주고, 새 세션 · 에이전트 바꾸기에 안내문을 붙임');

  // ---- 2. 명령: 사용자가 시킨 것은 바로 ----
  const a1 = await run(['add', '--title', '출장', '--start', '2026-11-26', '--end', '2026-11-27', '--why', '사용자가 출장 일정을 넣어 달라고 함', '--asked'], e1);
  const it1 = pl.store.list('active').find((x) => x.title === '출장');
  ok(a1.code === 0 && a1.out.startsWith(`넣었습니다: #${it1?.no} 출장 2026-11-26~2026-11-27`) && a1.out.includes('되돌리기 단추를 띄웠습니다'), `add --asked: 달력에 바로 — ${a1.out.split('\n')[0]} ${a1.err}`);
  ok(it1 && it1.source.by === 'session' && it1.source.via === 'cli' && it1.source.asked === true && it1.source.session.id === 's1' && it1.source.session.title === '가정통신문 정리' && it1.source.evidence === '사용자가 출장 일정을 넣어 달라고 함' && it1.folder === 'C:\\x\\가정통신문', '출처(어느 세션 · 시킨 것 · 근거)와 그 세션의 폴더가 붙음');
  const s1 = says().pop();
  ok(s1.text === '「가정통신문 정리」 세션에서 「출장」을 추가했어요.' && s1.actions[0].kind === 'undo' && typeof s1.actions[0].changeId === 'string' && s1.actions[1].kind === 'open' && s1.actions[1].day === '2026-11-26', `화면에 "○○ 세션에서 추가했어요" + 되돌리기 — ${s1.text}`);
  pl.undo(s1.actions[0].changeId);
  ok(!pl.store.list('active').some((x) => x.title === '출장'), '그 되돌리기로 사라짐');
  const a2 = await run(['add', '--title', '결과 보고서', '--start', '2026-11-23', '--end', '2026-11-27', '--step', '자료 모으기@2026-11-23', '--step', '초안@쓰기@2026-11-25', '--step', '제출', '--time', '15:00', '--time-end', '16:00', '--note', '교무실', '--asked'], e1);
  const it2 = pl.store.list('active').find((x) => x.title === '결과 보고서');
  ok(a2.code === 0 && it2.steps.length === 3 && it2.steps[1].title === '초안@쓰기' && it2.steps[1].day === '2026-11-25' && it2.steps[2].day === '2026-11-23' && it2.time === '15:00' && it2.timeEnd === '16:00' && it2.note === '교무실', '단계(이름@날짜, 날짜가 없으면 시작하는 날) · 시각 · 메모');
  const a3 = await run(['add', '--title', '동아리', '--start', '2026-11-24', '--time', '16:00', '--repeat', 'weekly', '--by-day', '2', '--until', '2026-12-31', '--asked'], e1);
  const it3 = pl.store.list('active').find((x) => x.title === '동아리');
  ok(a3.code === 0 && it3.repeat.freq === 'weekly' && it3.repeat.byDay.join() === '2' && it3.repeat.until === '2026-12-31', '반복하는 일');
  const a4 = await run(['add', '--title', '겹치는 회의', '--start', '2026-11-23', '--time', '15:30', '--asked'], e1);
  ok(a4.code === 0 && a4.out.includes('알림: ') && a4.out.includes('시간이 겹쳐요'), '겹침은 명령의 답에도 알림으로');

  // ---- 3. 세션이 판단한 것은 제안으로 ----
  sent.length = 0;
  const p1 = await run(['add', '--title', '참관록 양식 확인', '--start', '2026-11-26', '--why', '참관록 양식은 지난번 것을 그대로 쓰기로 함'], envOf('s2'));
  const prop = pl.store.list('proposed').find((x) => x.title === '참관록 양식 확인');
  ok(p1.code === 0 && p1.out.startsWith('제안으로 올렸습니다(달력에는 아직 없습니다') && p1.out.endsWith('참관록 양식 확인 2026-11-26') && prop && !pl.store.list('active').some((x) => x.title === '참관록 양식 확인'), `--asked 가 없으면 달력이 아니라 제안으로 — ${p1.out}`);
  ok(prop.source.asked === false && prop.source.session.agent === 'codex' && prop.source.evidence.startsWith('참관록 양식은') && prop.source.session.title === '이름이 아주 아주 아주 긴 폴더 이름입니다 …', '제안의 출처 · 근거(세션 이름이 없으면 폴더 이름, 길면 줄임)');
  const s2 = says().pop();
  ok(s2.group === 'proposal' && s2.text === '「이름이 아주 아주 아주 긴 폴더 이름입니다 …」 세션이 「참관록 양식 확인」을 제안했어요.' && s2.actions[0].kind === 'proposals' && sent.some((m) => m.proposals === 1), '화면에 제안 말풍선 + 제안 수');
  const u0 = await run(['update', '--no', String(it2.no), '--end', '2026-11-28'], e1);
  const d0 = await run(['done', '--no', String(it2.no), '--step', '1'], e1);
  ok(u0.code === 1 && u0.err.includes('사용자가 직접 시킨 것만') && d0.code === 1 && pl.store.get(it2.id).end === '2026-11-27' && !pl.store.get(it2.id).steps[0].done, '고치기 · 끝냄은 --asked 없이는 안 됨');

  // ---- 4. 보기 · 고치기 · 끝냄 ----
  const late = pl.store.apply([{ op: 'add', item: { title: '밀린 일', start: '2026-11-20' } }], { by: 'user', via: 'test' }).items[0];
  pl.store.apply([{ op: 'add', item: { title: '먼 날', start: '2027-03-02' } }], { by: 'user', via: 'test' });
  const l1 = await run(['list'], e1);
  ok(l1.code === 0 && l1.out.startsWith('플래너 2026-11-23 ~ 2026-12-07 (오늘 2026-11-23)') && l1.out.includes(`#${it2.no} 결과 보고서 2026-11-23~2026-11-27 15:00~16:00 단계[1 자료 모으기 2026-11-23 / 2 초안@쓰기 2026-11-25 / 3 제출 2026-11-23]`) && l1.out.includes(`#${it3.no} 동아리`) && l1.out.includes(`#${late.no} 밀린 일 2026-11-20`) && !l1.out.includes('먼 날') && !l1.out.includes('참관록'), '보기: 오늘부터 14일 + 밀린 일(제안 · 먼 날은 없음)');
  const l2 = await run(['list', '--from', '2027-03-01', '--to', '2027-03-05'], e1);
  ok(l2.out.includes('먼 날 2027-03-02') && !l2.out.includes('밀린 일') && (await run(['list', '--from', '2028-01-01'], e1)).out.endsWith('(비어 있음)'), '보기: 날짜 범위');
  sent.length = 0;
  const u1 = await run(['update', '--no', String(it2.no), '--end', '2026-11-28', '--title', '결과 보고서 제출', '--asked'], e1);
  ok(u1.code === 0 && u1.out.startsWith(`고쳤습니다: #${it2.no} 결과 보고서 제출 2026-11-23~2026-11-28`) && pl.store.get(it2.id).steps.length === 3 && says().pop().text === '「가정통신문 정리」 세션에서 「결과 보고서」를 고쳤어요.' && says().pop().actions[0].changeId, '고치기: 준 칸만 바뀌고(단계는 그대로) 화면에 알림 + 되돌리기');
  const d1 = await run(['done', '--no', String(it2.no), '--step', '1', '--asked'], e1);
  ok(d1.code === 0 && d1.out.startsWith('끝냄으로 표시했습니다') && pl.store.get(it2.id).steps[0].done === true, '단계 끝냄');
  const d2 = await run(['done', '--no', String(it2.no), '--step', '1', '--undone', '--asked'], e1);
  ok(d2.code === 0 && d2.out.startsWith('끝냄 표시를 풀었습니다') && pl.store.get(it2.id).steps[0].done === false, '끝냄 풀기');
  const d3 = await run(['done', '--no', String(it3.no), '--asked'], e1);
  const d4 = await run(['done', '--no', String(it3.no), '--date', '2026-11-24', '--asked'], e1);
  ok(d3.code === 1 && d3.err.includes('--date') && d4.code === 0 && !!pl.store.get(it3.id).repeat.done['2026-11-24'], '반복하는 일은 어느 날 것인지 적어야 함');
  ok((await run(['done', '--no', '9999', '--asked'], e1)).err.includes('찾을 수 없습니다') && (await run(['done', '--no', String(it2.no), '--step', '9', '--asked'], e1)).err.includes('단계가 없습니다') && (await run(['update', '--no', String(it2.no), '--asked'], e1)).err.includes('바꿀 것이 없습니다'), '없는 번호 · 없는 단계 · 빈 고치기');
  const bad = await run(['add', '--title', '거꾸로', '--start', '2026-11-27', '--end', '2026-11-25', '--asked'], e1);
  ok(bad.code === 1 && bad.err === '넣지 못했습니다: 끝나는 날이 시작하는 날보다 앞입니다.' && !pl.store.list().some((x) => x.title === '거꾸로'), '검사에 걸리면 사유를 말하고 넣지 않음');

  // ---- 5. 특수 문자 · JSON 입력 ----
  const evil = `따옴표 "와" & | % ^ ! <b> '작은' 100% 일`;
  const j1 = await run(['--stdin'], e1, JSON.stringify({ cmd: 'add', asked: true, why: 'JSON 으로', item: { title: evil, start: '2026-11-30', bogus: 1, folder: 'C:\\Windows', source: { by: 'user' } } }));
  const itE = pl.store.list('active').find((x) => x.title === evil);
  ok(j1.code === 0 && itE && itE.folder === 'C:\\x\\가정통신문' && !('bogus' in itE) && itE.source.by === 'session', '--stdin JSON: 특수 문자 그대로 · 모르는 칸 · 폴더 · 출처는 세션이 정할 수 없음');
  const j2 = await run(['--stdin'], e1, '\uFEFF' + JSON.stringify({ cmd: 'list' }));
  ok(j2.code === 0 && j2.out.includes(evil) && (await run(['--stdin'], e1, '{깨짐')).code === 2, 'BOM 이 붙은 JSON 도 읽음 · 깨진 JSON 은 보내지 않음');
  const viaArg = await run(['add', '--title', evil, '--start', '2026-12-01', '--asked'], e1);
  ok(viaArg.code === 0 && pl.store.list('active').filter((x) => x.title === evil).length === 2, '인자로도 한글 · 특수 문자가 깨지지 않음(node 직접)');

  // ---- 6. 껍데기 두 개(실제 셸로) ----
  const cmdBytes = fs.readFileSync(path.join(BIN_DIR, 'iris-planner.cmd')); const shBytes = fs.readFileSync(path.join(BIN_DIR, 'sh', 'iris-planner'));
  ok(cmdBytes.every((c) => c < 128) && cmdBytes.includes(Buffer.from('\r\n')) && shBytes.every((c) => c < 128) && !shBytes.includes(13) && shBytes.subarray(0, 10).toString() === '#!/bin/sh\n', '껍데기: .cmd = ASCII · CRLF / sh = ASCII · LF');
  ok(!fs.existsSync(path.join(BIN_DIR, 'iris-planner')), 'bin 에는 확장자 없는 파일을 두지 않음(PowerShell 이 그것을 "열기"로 띄우지 않게 — sh 것은 bin\\sh 에만)');
  const ga = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
  ok(ga.includes('bin/sh/iris-planner text eol=lf') && ga.includes('bin/iris-planner.cmd text eol=crlf'), '.gitattributes: 줄끝 고정');
  const viaCmd = spawnSync('cmd.exe', ['/d', '/s', '/c', 'iris-planner help'], { env: e1, encoding: 'utf8', windowsHide: true });
  ok(viaCmd.status === 0 && viaCmd.stdout.includes('iris-planner list'), `cmd 에서 이름만으로 찾아 실행됨(PATH) — ${String(viaCmd.stderr || '').slice(0, 80)}`);
  const cmdList = await new Promise((resolve) => { const p = spawn('cmd.exe', ['/d', '/s', '/c', 'iris-planner list --from 2027-03-01 --to 2027-03-05'], { env: e1, windowsHide: true }); let o = ''; p.stdout.on('data', (d) => { o += d; }); p.on('exit', (code) => resolve({ code, o })); });
  ok(cmdList.code === 0 && cmdList.o.includes('먼 날 2027-03-02'), 'cmd 껍데기로 실제 보기(한글 출력 UTF-8)');
  const pwsh = spawnSync('where.exe', ['pwsh.exe'], { encoding: 'utf8', windowsHide: true }).stdout.split(/\r?\n/)[0].trim() || 'powershell.exe';
  const psList = await new Promise((resolve) => { const p = spawn(pwsh, ['-NoProfile', '-NonInteractive', '-Command', '(Get-Command iris-planner).Source; iris-planner list --from 2027-03-01 --to 2027-03-05; exit $LASTEXITCODE'], { env: e1, windowsHide: true }); let o = ''; p.stdout.on('data', (d) => { o += d; }); p.on('exit', (code) => resolve({ code, o })); });
  ok(psList.code === 0 && /iris-planner\.cmd/i.test(psList.o.split(/\r?\n/)[0]) && psList.o.includes('2027-03-02'), `PowerShell: iris-planner 가 .cmd 로 풀리고 실행됨 — ${psList.o.split(/\r?\n/)[0].slice(-40)}`);
  const bash = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'].find((f) => fs.existsSync(f));
  if (bash) {
    const shList = await new Promise((resolve) => { const p = spawn(bash, ['-c', 'command -v iris-planner && iris-planner list --from 2027-03-01 --to 2027-03-05'], { env: e1, windowsHide: true }); let o = ''; p.stdout.on('data', (d) => { o += d; }); p.on('exit', (code) => resolve({ code, o })); });
    ok(shList.code === 0 && /bin\/sh\/iris-planner/.test(shList.o.split(/\r?\n/)[0]) && shList.o.includes('먼 날 2027-03-02'), `Git Bash: 확장자 없는 iris-planner 로 실행됨 — ${shList.o.split(/\r?\n/)[0].slice(-30)}`);
  } else console.log('SKIP Git Bash 없음');

  // ---- 7. 받지 않는 것 ----
  const rev = pl.store.rev;
  const noEnv = cleanEnv();
  const n1 = await run(['add', '--title', 'x', '--start', '2026-11-26', '--asked'], noEnv);
  ok(n1.code === 3 && n1.err.includes('IRIS 창이 띄운 세션이 아니어서'), 'IRIS 가 띄운 세션이 아니면(환경 없음) 넣지 않고 그렇게 말함');
  ok((await run(['add', '--title', 'x', '--start', '2026-11-26', '--asked'], { ...e1, IRIS_PLANNER_URL: 'http://example.com:80' })).code === 3, '주소가 이 PC(127.0.0.1)가 아니면 보내지 않음');
  ok((await run(['add', '--title', 'x', '--start', '2026-11-26', '--asked'], { ...e1, IRIS_PLANNER_URL: 'http://127.0.0.1:1' })).code === 4, '창이 꺼져 있으면 넣지 않았다고 말함');
  ok((await post({ 'x-iris-session': 's1', 'x-iris-key': pl.keyFor('s2') }, { cmd: 'list' })).code === 401 && (await post({ 'x-iris-session': 's1', 'x-iris-key': 'x'.repeat(40) }, { cmd: 'list' })).code === 401 && (await post({}, { cmd: 'list' })).code === 401, '열쇠가 없거나 남의 것이면 401(보기도 안 됨)');
  ok((await post(H('s9'), { cmd: 'list' })).code === 401, '없는 세션 번호는 401');
  ok((await post({ ...H('s1'), origin: `http://127.0.0.1:${port}` }, { cmd: 'list' })).code === 403 && (await post({ ...H('s1'), origin: 'https://evil.example' }, { cmd: 'list' })).code === 403, '출처가 붙어 온 요청(웹 쪽)은 열쇠가 맞아도 403');
  ok((await post(H('s1'), { cmd: 'remove', no: it2.no })).code === 403 && (await post(H('s1'), { cmd: 'purge' })).code === 400 && pl.store.get(it2.id).state === 'active', '지우기는 --asked 없이는 안 됨 · 모르는 명령 400');
  const gone4 = await run(['add', '--title', 'x', '--start', '2026-11-26', '--asked'], { ...e1, IRIS_PLANNER_URL: 'http://127.0.0.1:1' });
  ok(gone4.err.includes('들어갔는지 알 수 없습니다') && gone4.err.includes('iris-planner list') && !gone4.err.includes('넣지 않았습니다') && (await run(['list'], { ...e1, IRIS_PLANNER_URL: 'http://127.0.0.1:1' })).err.includes('닿지 못했습니다'), '닿지 못했을 때: "넣지 않았다"고 단정하지 않고 확인하라고 말함(보기는 그냥 닿지 못했다고)');
  sessions.s3 = { id: 's3', title: '끝난 세션', agent: 'claude', cwd: 'C:\\x', status: 'exited' }; sessions.s4 = { id: 's4', title: '끊긴 세션', agent: 'claude', cwd: 'C:\\x', status: 'dead' };
  ok((await post(H('s3'), { cmd: 'list' })).code === 401 && (await post(H('s4'), { cmd: 'add', asked: true, item: { title: 'x', start: '2026-11-26' } })).code === 401, '끝난 세션(종료됨 · 끊김)의 열쇠는 받지 않음');
  ok((await post(H('s2'), { cmd: 'add', item: { title: '근거 없는 제안', start: '2026-11-26' } })).code === 400 && !pl.store.list('proposed').some((x) => x.title === '근거 없는 제안'), '세션이 판단한 제안에는 근거(--why)가 있어야 함');
  ok((await post(H('s1'), '[1]')).code === 400 && (await post(H('s1'), '{깨짐')).code === 400, '깨진 요청 400');
  cfg.plannerFromSessions = false;
  const offR = await run(['add', '--title', 'x', '--start', '2026-11-26', '--asked'], e1);
  ok(offR.code === 1 && offR.err.includes('「다른 세션에서 넣기」를 꺼 두었습니다') && (await run(['list'], e1)).code === 1, '세션이 떠 있는 동안 사용자가 끄면 그때부터 받지 않음');
  cfg.plannerFromSessions = true; cfg.plannerEnabled = false;
  ok((await run(['list'], e1)).err.includes('플래너를 꺼 두었습니다'), '플래너를 끄면 받지 않음');
  cfg.plannerEnabled = true;
  ok(pl.store.rev === rev, '받지 않은 요청은 장부를 바꾸지 않음');

  // ---- 8. 되풀이 막기 ----
  for (let i = 0; i < PROPOSE_MAX + 2; i++) await post(H('s2'), { cmd: 'add', item: { title: `제안 ${i}`, start: '2026-11-26' }, why: '근거' });
  const mine = pl.store.list('proposed').filter((x) => x.source?.session?.id === 's2').length;
  ok(mine === PROPOSE_MAX, `한 세션의 제안은 ${PROPOSE_MAX}개까지만 쌓임`);
  clock = new Date(2026, 10, 23, 10, 0, 0); // 앞의 기록이 10분 창 밖으로
  let last = null; for (let i = 0; i < WRITE_LIMIT + 1; i++) last = await post(H('s1'), { cmd: 'done', asked: true, no: late.no, undone: i % 2 === 1 });
  ok(last.code === 429 && last.out.text.includes('너무 자주') && (await post(H('s1'), { cmd: 'list' })).code === 200, `10분에 ${WRITE_LIMIT}번까지만 적음(보기는 그대로)`);
  clock = new Date(2026, 10, 23, 10, 11, 0);
  ok((await post(H('s1'), { cmd: 'done', asked: true, no: late.no })).code === 200, '10분이 지나면 다시 됨');

  // ---- 8b. 단계 잇기 · 끝냄 알림 · 지우기 · 두 번 넣기 막기 · 셸마다 값이 그대로 가는지(2026-11-23 걸음 7~8 검토 반영) ----
  clock = new Date(2026, 10, 23, 11, 0, 0);
  const st = pl.store.apply([{ op: 'add', item: { title: '단계 있는 일', start: '2026-11-23', end: '2026-11-27', steps: [{ title: '자료 수집', day: '2026-11-23', done: true }, { title: '초안', day: '2026-11-25' }] } }], { by: 'user', via: 'test' }).items[0];
  const re = await post(H('s1'), { cmd: 'update', asked: true, no: st.no, item: { steps: [{ title: '초안', day: '2026-11-24' }, { title: '자료 수집', day: '2026-11-23' }] } });
  const st2 = pl.store.get(st.id);
  ok(re.code === 200 && st2.steps[0].title === '초안' && !st2.steps[0].done && st2.steps[0].id === st.steps[1].id && st2.steps[1].title === '자료 수집' && st2.steps[1].done === true && st2.steps[1].id === st.steps[0].id, '단계 순서를 바꿔도 끝냄 표시는 그 이름의 단계에 남음(자리로 잇지 않음)');
  const ins = await post(H('s1'), { cmd: 'update', asked: true, no: st.no, item: { steps: [{ title: '계획', day: '2026-11-23' }, { title: '초안', day: '2026-11-24' }, { title: '자료 수집', day: '2026-11-23' }] } });
  const st3 = pl.store.get(st.id);
  ok(ins.code === 200 && st3.steps.length === 3 && !st3.steps[0].done && st3.steps[2].done === true, '앞에 단계를 끼워 넣어도 끝냄 표시가 옮겨 가지 않음');
  const lose = await post(H('s1'), { cmd: 'update', asked: true, no: st.no, item: { steps: [{ title: '초안', day: '2026-11-24' }] } });
  ok(lose.code === 409 && lose.out.text.includes('「계획」') && lose.out.text.includes('--drop-steps') && pl.store.get(st.id).steps.length === 3, `옛 단계가 사라지는 고치기는 하지 않고 알려 줌 — ${lose.out.text.slice(0, 50)}`);
  const drop = await run(['update', '--no', String(st.no), '--step', '초안@2026-11-24', '--drop-steps', '--asked'], e1);
  ok(drop.code === 0 && pl.store.get(st.id).steps.length === 1, '--drop-steps 를 밝히면 뺌');
  sent.length = 0;
  const dn = await post(H('s1'), { cmd: 'done', asked: true, no: st.no, step: 1 });
  const dSay = says().pop();
  ok(dn.code === 200 && dn.out.text.includes('되돌리기 단추를 띄웠습니다') && dSay && dSay.text === '「가정통신문 정리」 세션에서 「단계 있는 일」을 한 단계 끝냈다고 표시했어요.' && dSay.actions[0].kind === 'undo' && typeof dSay.actions[0].changeId === 'string', `끝냄 표시도 화면에 알림 + 되돌리기 — ${dSay && dSay.text}`);
  pl.undo(dSay.actions[0].changeId);
  ok(pl.store.get(st.id).steps[0].done !== true, '그 되돌리기로 끝냄이 풀림');
  // 지우기: 시킨 것만 · 하나씩 · 휴지통으로 · 알림 + 되돌리기
  sent.length = 0;
  const rmv = await run(['remove', '--no', String(st.no), '--asked'], e1);
  const rSay = says().pop();
  ok(rmv.code === 0 && rmv.out.startsWith('지웠습니다(휴지통에 30일 남습니다)') && pl.store.get(st.id).state === 'trash' && rSay.text === '「가정통신문 정리」 세션에서 「단계 있는 일」을 지웠어요.' && rSay.actions[0].kind === 'undo', `지우기 --asked: 휴지통으로 + 알림 + 되돌리기 — ${rmv.out.split('\n')[0]} ${rmv.err}`);
  pl.undo(rSay.actions[0].changeId);
  ok(pl.store.get(st.id).state === 'active', '그 되돌리기로 되살아남');
  const rp0 = await post(H('s1'), { cmd: 'remove', asked: true, no: it3.no });
  ok(rp0.code === 400 && rp0.out.text.includes('--date') && rp0.out.text.includes('--all') && pl.store.get(it3.id).state === 'active', '반복하는 일은 그날 것만인지 전부인지 밝혀야 지움');
  const rp1 = await post(H('s1'), { cmd: 'remove', asked: true, no: it3.no, date: '2026-12-01' });
  ok(rp1.code === 200 && pl.store.get(it3.id).state === 'active' && pl.store.get(it3.id).repeat.skip.includes('2026-12-01') && says().pop().text.includes('12월 1일 것만 뺐어요'), '반복하는 일의 그날 것만 빼기');
  ok((await post(H('s1'), { cmd: 'remove', asked: true, no: it3.no, date: '2026-12-02' })).code === 400, '그날에 없는 반복 일은 빼지 않음');
  const rp2 = await post(H('s1'), { cmd: 'remove', asked: true, no: it3.no, all: true });
  ok(rp2.code === 200 && pl.store.get(it3.id).state === 'trash', '--all 이면 반복 전체를 지움(휴지통)');
  // 응답을 못 받고 같은 것을 다시 넣는 경우: 2분 안의 똑같은 넣기는 두 번 들어가지 않는다
  const dup1 = await post(H('s1'), { cmd: 'add', asked: true, item: { title: '두 번 보낸 일', start: '2026-11-30' } });
  const dup2 = await post(H('s1'), { cmd: 'add', asked: true, item: { title: '두 번 보낸 일', start: '2026-11-30' } });
  ok(dup1.code === 200 && dup2.code === 200 && dup2.out.text.startsWith('방금 같은 것을 이미 넣었습니다') && pl.store.list('active').filter((x) => x.title === '두 번 보낸 일').length === 1, '같은 세션이 방금 넣은 것과 똑같은 넣기는 두 번 넣지 않음');
  clock = new Date(2026, 10, 23, 11, 3, 0);
  await post(H('s1'), { cmd: 'add', asked: true, item: { title: '두 번 보낸 일', start: '2026-11-30' } });
  ok(pl.store.list('active').filter((x) => x.title === '두 번 보낸 일').length === 2, '2분이 지난 뒤의 같은 넣기는 따로 넣음(사용자가 정말 두 번 시켰을 수 있다)');
  // 셸마다: 한글 · 공백 · 따옴표 · 줄바꿈 · %이름% 이 든 값은 JSON 파일(--file)로 — 셸이 다시 풀지 않는다
  clock = new Date(2026, 10, 23, 11, 20, 0);
  const hard = '한글 "큰따옴표" \'작은\' 100% %PATH% & | ^ <b>\n둘째 줄';
  const jf = path.join(base, '넣을 것 한글.json'); const jfBom = path.join(base, 'bom.json');
  fs.writeFileSync(jf, JSON.stringify({ cmd: 'add', asked: true, item: { title: hard, start: '2026-12-03' } }), 'utf8');
  fs.writeFileSync(jfBom, '﻿' + JSON.stringify({ cmd: 'add', asked: true, item: { title: `${hard} 2`, start: '2026-12-03' } }), 'utf8');
  const titles = () => pl.store.list('active').filter((x) => x.start === '2026-12-03').map((x) => x.title);
  // cmd.exe 에는 명령줄을 손으로 만들어 그대로 넘긴다(Node 가 안쪽 따옴표에 \ 를 붙이면 cmd 가 다르게 읽는다 — 사람이 cmd 창에 치는 모양과 같게)
  const same = (t) => t.replace(/\s+/g, ' ') === hard.replace(/\s+/g, ' ');
  // (창구가 이 프로세스 안에 있으므로 기다리는 동안 멈추는 spawnSync 는 쓰지 않는다)
  const f1 = await new Promise((resolve) => { const p = spawn('cmd.exe', ['/d', '/s', '/c', `"iris-planner --file "${jf}""`], { env: e1, windowsHide: true, windowsVerbatimArguments: true }); let o = ''; p.stderr.on('data', (d) => { o += d; }); p.on('exit', (code) => resolve({ code, o })); });
  ok(f1.code === 0 && titles().some(same), `cmd: --file 로 넘긴 값이 그대로 들어감 — ${f1.o.slice(0, 80)}`);
  const f2 = await new Promise((resolve) => { const p = spawn(pwsh, ['-NoProfile', '-NonInteractive', '-Command', `iris-planner --file '${jfBom}'; exit $LASTEXITCODE`], { env: e1, windowsHide: true }); let o = ''; p.stderr.on('data', (d) => { o += d; }); p.on('exit', (code) => resolve({ code, o })); });
  ok(f2.code === 0 && titles().some((t) => t.endsWith(' 2') && t.startsWith('한글 "큰따옴표"')), `PowerShell: --file(BOM 붙은 파일도) — ${f2.o.slice(0, 80)}`);
  ok((await run(['--file', path.join(base, '없는 파일.json')], e1)).code === 2 && (await run(['--file', jf.replace('넣을 것 한글', '넣을 것 한글')], { ...e1, IRIS_PLANNER_URL: 'http://127.0.0.1:1' })).code === 4, '--file: 없는 파일은 보내지 않음');
  // 인자로: 한글 · 공백은 세 셸 모두 그대로(따옴표 · 줄바꿈이 든 값은 --file 을 쓰라고 도움말이 안내)
  const viaShell = async (file, args, title, verbatim = false) => { const r = await new Promise((resolve) => { const p = spawn(file, args, { env: e1, windowsHide: true, windowsVerbatimArguments: verbatim }); let o = ''; p.stderr.on('data', (d) => { o += d; }); p.on('exit', (code) => resolve({ code, o })); }); return r.code === 0 && pl.store.list('active').some((x) => x.title === title); };
  ok(await viaShell('cmd.exe', ['/d', '/s', '/c', '"iris-planner add --title "학부모 상담 주간 cmd" --start 2026-12-04 --asked"'], '학부모 상담 주간 cmd', true), 'cmd: 인자의 한글 · 공백이 그대로');
  ok(await viaShell(pwsh, ['-NoProfile', '-NonInteractive', '-Command', "iris-planner add --title '학부모 상담 주간 ps' --start 2026-12-04 --asked; exit $LASTEXITCODE"], '학부모 상담 주간 ps'), 'PowerShell: 인자의 한글 · 공백이 그대로');
  if (bash) ok(await viaShell(bash, ['-c', "iris-planner add --title '학부모 상담 주간 sh' --start 2026-12-04 --asked"], '학부모 상담 주간 sh'), 'Git Bash: 인자의 한글 · 공백이 그대로');
  // 보기 · 틀린 열쇠에도 상한
  clock = new Date(2026, 10, 23, 12, 0, 0);
  let lastRead = null; for (let i = 0; i < READ_LIMIT + 1; i++) lastRead = cli.handle(H('s2'), { cmd: 'list' });
  ok(lastRead.code === 429 && cli.handle(H('s1'), { cmd: 'list' }).code === 200, `보기도 10분에 ${READ_LIMIT}번까지(세션마다)`);
  let lastBad = null; for (let i = 0; i < BAD_KEY_LIMIT + 1; i++) lastBad = cli.handle({ 'x-iris-session': 's1', 'x-iris-key': 'y'.repeat(40) }, { cmd: 'list' });
  ok(lastBad.code === 429 && cli.handle(H('s1'), { cmd: 'list' }).code === 200, '틀린 열쇠가 잇따르면 잠시 받지 않음(맞는 열쇠의 요청은 그대로)');
  const help = await run(['help'], e1);
  ok(help.out.includes('iris-planner remove') && help.out.includes('--drop-steps') && help.out.includes('--file') && help.out.includes('list 로 확인'), '도움말: 지우기 · 단계 빼기 · 파일 입력 · 닿지 못했을 때');

  // ---- 9. 로그 ----
  ok(!logs.some((m) => /출장|보고서|참관록|밀린 일|따옴표/.test(m)) && !logs.some((m) => m.includes(e1.IRIS_PLANNER_KEY)) && logs.some((m) => /planner-cli: 401 bad-key/.test(m)), '로그에 일정 내용 · 열쇠 값 없음(거절 사유 낱말만)');
} catch (e) { fail++; console.log(`FAIL 예외: ${e?.stack || e}`); }
finally { server.close(); try { fs.rmSync(base, { recursive: true, force: true }); } catch {} }
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
