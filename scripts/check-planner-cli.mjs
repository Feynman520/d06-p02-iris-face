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
import { PlannerCli, CLI_NOTE, BIN_DIR, WRITE_LIMIT, PROPOSE_MAX } from '../daemon/planner-cli.mjs';
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
const envOf = (id) => { const e = { ...process.env }; for (const k of Object.keys(e)) if (/^IRIS_PLANNER_/.test(k)) delete e[k]; cli.applyEnv(e, id); return e; };
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
  ok(cli.note() === CLI_NOTE && !/[\u00B7\u29C9\u2015]/.test(CLI_NOTE) && CLI_NOTE.includes('iris-planner') && CLI_NOTE.includes('--asked') && CLI_NOTE.includes('지우지는 않는다'), '안내문: 명령 이름 · --asked · 지우지 않기(코덱스가 떨어뜨리는 글자 없음)');
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
  const noEnv = { ...process.env }; for (const k of Object.keys(noEnv)) if (/^IRIS_PLANNER_/.test(k)) delete noEnv[k];
  const n1 = await run(['add', '--title', 'x', '--start', '2026-11-26', '--asked'], noEnv);
  ok(n1.code === 3 && n1.err.includes('IRIS 창이 띄운 세션이 아니어서'), 'IRIS 가 띄운 세션이 아니면(환경 없음) 넣지 않고 그렇게 말함');
  ok((await run(['add', '--title', 'x', '--start', '2026-11-26', '--asked'], { ...e1, IRIS_PLANNER_URL: 'http://example.com:80' })).code === 3, '주소가 이 PC(127.0.0.1)가 아니면 보내지 않음');
  ok((await run(['add', '--title', 'x', '--start', '2026-11-26', '--asked'], { ...e1, IRIS_PLANNER_URL: 'http://127.0.0.1:1' })).code === 4, '창이 꺼져 있으면 넣지 않았다고 말함');
  ok((await post({ 'x-iris-session': 's1', 'x-iris-key': pl.keyFor('s2') }, { cmd: 'list' })).code === 401 && (await post({ 'x-iris-session': 's1', 'x-iris-key': 'x'.repeat(40) }, { cmd: 'list' })).code === 401 && (await post({}, { cmd: 'list' })).code === 401, '열쇠가 없거나 남의 것이면 401(보기도 안 됨)');
  ok((await post(H('s9'), { cmd: 'list' })).code === 401, '없는 세션 번호는 401');
  ok((await post({ ...H('s1'), origin: `http://127.0.0.1:${port}` }, { cmd: 'list' })).code === 403 && (await post({ ...H('s1'), origin: 'https://evil.example' }, { cmd: 'list' })).code === 403, '출처가 붙어 온 요청(웹 쪽)은 열쇠가 맞아도 403');
  ok((await post(H('s1'), { cmd: 'remove', no: it2.no, asked: true })).code === 400 && (await post(H('s1'), { cmd: 'purge' })).code === 400 && pl.store.get(it2.id).state === 'active', '지우기 명령은 없음');
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

  // ---- 9. 로그 ----
  ok(!logs.some((m) => /출장|보고서|참관록|밀린 일|따옴표/.test(m)) && !logs.some((m) => m.includes(e1.IRIS_PLANNER_KEY)) && logs.some((m) => /planner-cli: 401 bad-key/.test(m)), '로그에 일정 내용 · 열쇠 값 없음(거절 사유 낱말만)');
} catch (e) { fail++; console.log(`FAIL 예외: ${e?.stack || e}`); }
finally { server.close(); try { fs.rmSync(base, { recursive: true, force: true }); } catch {} }
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
