// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// verify:antigravity — 셋째 에이전트(Google Antigravity CLI) 어댑터 검사. 네트워크 · 실제 agy · 진짜 ~/.gemini 를 쓰지 않는다(임시 폴더만).
// 설계 = D09 안티그래비티-입점설계 4절 '노트북 단계 구현 기록' 조각 ⑨. 클로드 · 코덱스 무회귀는 verify:agent-baseline 이 본다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-agy-check-'));
const GEM = path.join(TMP, 'gemini');
const STATE = path.join(TMP, 'state');
const FAKE_LA = path.join(TMP, 'localappdata');
fs.mkdirSync(path.join(TMP, 'emptyroot'), { recursive: true });
Object.assign(process.env, { IRIS_ROOT: path.join(TMP, 'emptyroot'), IRIS_GEMINI_DIR: GEM, IRIS_FACE_STATE: STATE, IRIS_AGY_STATUS_FILE: path.join(TMP, 'agy-status.json'), LOCALAPPDATA: FAKE_LA });
delete process.env.IRIS_AGY_EXE;
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; } else { fail++; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`); } };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name, `받음 ${JSON.stringify(a)} / 원함 ${JSON.stringify(b)}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const agents = await imp('daemon/agents.mjs');
const ad = await imp('daemon/agents/antigravity.mjs');
const rec = await imp('daemon/agents/antigravity.records.mjs');
const setup = await imp('daemon/agents/antigravity.setup.mjs');
const st = await imp('daemon/agents/antigravity.status.mjs');
const { TranscriptTail } = await imp('daemon/transcript.mjs');

// ── 1. 명부 · 선택값 · 명령 ──
eq(Object.keys(agents.AGENTS), ['claude', 'codex', 'antigravity'], '명부 순서(기본 = 클로드 그대로)');
const n = agents.normalize({ agent: 'antigravity', model: 'gemini-3.8-flash-low', effort: 'high', permission: 'plan', approval: 'never', sandbox: 'read-only' });
eq([n.agent, n.model, n.modelActual, n.effort, n.permission, n.approval, n.sandbox, n.readOnly], ['antigravity', 'gemini-3.8-flash-low', 'gemini-3.8-flash-low', '', '', '', '', false], '정리: 깊이 · 권한 칸은 비움, 실제 이름 = 목록 이름');
eq(agents.normalize({ agent: 'antigravity' }).model, 'gemini-4-argon-high', '기본 모델');
// 실행 파일 없음 → cmd.exe /c agy
let c = agents.buildCommand({ agent: 'antigravity', model: 'gemini-4-neon-high' }, TMP);
eq([c.file, c.args.slice(0, 5)], ['cmd.exe', ['/c', 'agy', '--model', 'gemini-4-neon-high', '--dangerously-skip-permissions']], '실행 파일 없으면 PATH 의 agy');
ok(c.args.includes('--log-file') && c.args[c.args.indexOf('--log-file') + 1].startsWith(path.join(STATE, 'agy-logs')), '카드마다 기록 파일(--log-file, 상태 폴더 안)');
ok(!c.args.includes('--conversation') && !c.sessionId && !c.recordPath && c.resumeCmd === '', '새 대화 = 재개 id 없음');
ok(agents.adapterOfCommand(c)?.id === 'antigravity', '명령 ↔ 어댑터 짝');
// 공식 설치 자리에 실행 파일이 있으면 그것을 직접
fs.mkdirSync(path.join(FAKE_LA, 'agy', 'bin'), { recursive: true }); fs.writeFileSync(path.join(FAKE_LA, 'agy', 'bin', 'agy.exe'), '');
const conv = '11111111-2222-4333-8444-555555555555';
c = agents.buildCommand({ agent: 'antigravity', model: 'gemini-4-neon-high' }, TMP, { resumeId: conv });
eq([c.file, c.args.slice(-2), c.sessionId, c.resumeCmd], [path.join(FAKE_LA, 'agy', 'bin', 'agy.exe'), ['--conversation', conv], conv, `agy --conversation ${conv}`], '공식 자리 exe 직접 · 재개');
eq(c.recordPath, path.join(GEM, 'antigravity-cli', 'brain', conv, '.system_generated', 'logs', 'transcript.jsonl'), '재개 기록 경로');
const l1 = agents.buildCommand({ agent: 'antigravity' }, TMP), l2 = agents.buildCommand({ agent: 'antigravity' }, TMP);
ok(l1.cmdline !== l2.cmdline, '같은 선택이라도 카드마다 다른 기록 파일');
eq(agents.isFastModel('antigravity', 'gemini-4-argon-high'), false, 'fast 없음');
eq(agents.permLabel({ agent: 'antigravity' }), '권한 자동 승인', '권한 표시');
// 재개 모델 지키기: 안티그래비티 이름은 지키고, 클로드 · 코덱스는 gemini 이름을 받지 않는다(머리 글자 검사 그대로)
eq(agents.keepResumeModel({ agent: 'antigravity', model: 'gemini-4-argon-high', modelActual: 'gemini-4-argon-high' }, { agent: 'antigravity', model: 'gemini-9-old', modelActual: 'gemini-9-old' }).modelActual, 'gemini-9-old', '재개: 목록에서 빠진 안티그래비티 모델도 그대로');
eq(agents.keepResumeModel({ agent: 'claude', model: 'opus', modelActual: 'claude-opus-5-5' }, { agent: 'claude', modelActual: 'gemini-4-argon-high' }).modelActual, 'claude-opus-5-5', '재개: 클로드는 gemini 이름을 받지 않음');
eq(agents.keepResumeModel({ agent: 'codex', model: 'gpt-6.1-sol', modelActual: 'gpt-6.1-sol' }, { agent: 'codex', modelActual: 'gemini-4-argon-high' }).modelActual, 'gpt-6.1-sol', '재개: 코덱스는 gemini 이름을 받지 않음');
let threw = null; try { agents.normalize({ agent: 'Antigravity' }); } catch (e) { threw = e.code; }
eq(threw, 'UNKNOWN_AGENT', '대소문자 다른 이름 = 거절(걸음 5 그대로)');

// ── 2. 기록 해석 ──
const recordFile = path.join(TMP, 'transcript.jsonl');
const L = (o) => JSON.stringify(o);
const lines = [
  L({ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-11-23T01:00:00Z', content: '<USER_REQUEST>\n안녕 <b>\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: x\n</ADDITIONAL_METADATA>' }),
  L({ step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-11-23T01:00:01Z', model: 'gemini-4-argon-high', input_tokens: 100, cache_read_tokens: 20, output_tokens: 7, tool_calls: [{ name: 'run_command', args: { CommandLine: '"git status"', WaitMsBeforeAsync: '5000' } }, { name: 'view_file', args: { AbsolutePath: '"C:\\\\x\\\\a.md"' } }] }),
  L({ step_index: 2, source: 'MODEL', type: 'GENERIC', status: 'DONE', created_at: '2026-11-23T01:00:02Z', content: 'Command exited with code 0.' }),
  L({ step_index: 3, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-11-23T01:00:03Z', content: '끝났습니다.' }),
  L({ step_index: 4, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', status: 'DONE', created_at: '2026-11-23T01:00:04Z', content: '<SYSTEM_MESSAGE>x</SYSTEM_MESSAGE>' }),
  L({ step_index: 5, source: 'MODEL', type: 'SOMETHING_NEW', status: 'DONE', created_at: '2026-11-23T01:00:05Z' }),
  '{ 깨진 줄',
];
fs.writeFileSync(recordFile, lines.join('\n') + '\n', 'utf8');
const tail = new TranscriptTail(recordFile, 'antigravity');
const items = tail.poll();
eq(items.map((i) => i.kind), ['user', 'tool', 'tool', 'tool_result', 'assistant', 'unknown'], '항목 종류(모르는 종류 = unknown 하나 · 시스템 글 · 깨진 줄은 없음)');
eq(items[0].text, '안녕 <b>', '사용자 글 = USER_REQUEST 안만');
eq([items[1].name, items[1].detail, items[2].name, items[2].detail], ['Bash', 'git status', 'Read', 'C:\\x\\a.md'], '도구 이름 · 인수(한 겹 벗김)');
eq([tail.model, tail.lastUsage], ['gemini-4-argon-high', { in: 120, out: 7, total: 127 }], '모델 · 사용량(입력 = 입력 + 캐시)');
eq(tail.turnState(), null, '차례 판정 = 모름(기록에 중단 표식 없음)');
eq(tail.contextWindow(), 1048576, '맥락 창(Gemini)');
eq(rec.userRequest('<USER_REQUEST>\na\n</USER_REQUEST>\n<USER_REQUEST>b</USER_REQUEST>'), 'a\n</USER_REQUEST>\n<USER_REQUEST>b', '본문에 같은 표가 또 있어도 첫 여는 표 ~ 마지막 닫는 표');
eq(rec.userRequest('그냥 글\n<ADDITIONAL_METADATA>\nx'), '그냥 글', '표가 없으면 뒤붙임만 뗌');
// 이 PC 의 실제 기록(있으면) — 예외 없이 읽히는가
{
  const real = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
  let n = 0, bad = 0;
  try {
    for (const d of fs.readdirSync(real)) {
      const f = path.join(real, d, '.system_generated', 'logs', 'transcript.jsonl'); if (!fs.existsSync(f)) continue;
      try { new TranscriptTail(f, 'antigravity').poll(); n++; } catch { bad++; }
    }
  } catch {}
  ok(bad === 0, `이 PC 실제 기록 ${n}개를 예외 없이 읽음`);
}

// ── 3. 화면 신호 ──
const busy = 'header\n> Reply with exactly: PONG\n⡿  Generating...\n────\n>\n────\nesc to cancel                     auto · Gemini 3.8 Flash · low';
const idle = 'header\n> Reply\n  PONG\n────\n>\n────\n? for shortcuts                   auto · Gemini 3.8 Flash · low';
const quoted = 'Claude 의 확인 창에는 "Esc to cancel · Enter to confirm" 이 뜹니다\n────\n>\n────\n? for shortcuts';
const trust = 'Do you trust the contents of this project?\n> Yes\n  No\nEnter to select';
const S = (s) => ad.screen.status(s, s.split('\n'));
eq([S(busy), S(idle), S(quoted), S(trust), S('Antigravity CLI 1.5.14\n')], ['busy', 'idle', 'idle', 'attention', 'busy'], '화면 판정(일함 · 기다림 · 본문 인용 · 신뢰 물음 · 준비 전)');
eq([ad.screen.working.test(busy), ad.screen.working.test(idle), ad.screen.attention.test(quoted), ad.screen.attention.test(trust)], [true, false, false, true], 'Enter 확인용 식');
eq(ad.screen.activity(busy.split('\n')), 'Generating…', '진행 문구');
ok(ad.screen.interrupted('  ⎿  Interrupted · What should Antigravity CLI do instead?') && !ad.screen.interrupted('중단(Interrupted)이라는 낱말'), '중단 표식');

// ── 4. 띄우기 직전 준비(~/.gemini) ──
const cwdA = path.join(TMP, 'work A');
fs.mkdirSync(cwdA, { recursive: true });
eq(setup.trustFolder(cwdA), 'created', '신뢰: 파일 없음 → 만듦');
eq(setup.trustFolder(cwdA.toUpperCase()), 'unchanged', '신뢰: 대소문자만 다른 같은 폴더 = 그대로');
const sfile = path.join(GEM, 'antigravity-cli', 'settings.json');
fs.writeFileSync(sfile, JSON.stringify({ theme: 'x', trustedWorkspaces: ['C:\\other'] }), 'utf8');
eq(setup.trustFolder(cwdA), 'appended', '신뢰: 덧붙임');
const sj = JSON.parse(fs.readFileSync(sfile, 'utf8'));
eq([sj.theme, sj.trustedWorkspaces[0], sj.trustedWorkspaces.length], ['x', 'C:\\other', 2], '신뢰: 다른 키 · 다른 폴더 보존');
ok(fs.readdirSync(path.dirname(sfile)).some((f) => f.startsWith('settings.json.iris-bak-')), '신뢰: 바꾸기 전 사본');
fs.writeFileSync(sfile, '{ 깨짐', 'utf8');
eq(setup.trustFolder(cwdA), 'skipped:unreadable', '신뢰: 깨진 파일은 건드리지 않음');
eq(fs.readFileSync(sfile, 'utf8'), '{ 깨짐', '신뢰: 깨진 파일 그대로');
// 전역 지침
const fakeRoot = path.join(TMP, 'iris'); fs.mkdirSync(fakeRoot, { recursive: true });
fs.writeFileSync(path.join(fakeRoot, 'AGENTS.md'), '# x\n## 🔴 프록시 우회 금지\n- 직결 금지\n## 보통 절\n## 🔴 프로세스 종료 규칙 — 이름 기반 일괄 킬 금지 (2026-09-11 사용자 결정)\n', 'utf8');
eq(setup.ensureRules(fakeRoot), 'created', '지침: 없음 → 만듦');
const rtext = fs.readFileSync(path.join(GEM, 'AGENTS.md'), 'utf8');
ok(rtext.startsWith(setup.RULES_MARK) && rtext.includes('- **🔴 프록시 우회 금지**') && rtext.includes('  - 직결 금지') && rtext.includes('- **🔴 프로세스 종료 규칙 — 이름 기반 일괄 킬 금지**') && !rtext.includes('보통 절'), '지침: 표식 · 🔴 제목과 본문 앞줄 · 날짜 꼬리 뗌 · 다른 절 없음');
eq(setup.ensureRules(path.join(TMP, 'no-such-root')), 'skipped:no-root', '지침: 루트를 못 읽으면 빈 안내를 만들지 않음');
ok(Buffer.byteLength(rtext, 'utf8') <= setup.RULES_MAX_BYTES, '지침: 8KB 이하');
eq(setup.ensureRules(fakeRoot), 'unchanged', '지침: 같으면 그대로');
fs.writeFileSync(path.join(GEM, 'AGENTS.md'), '# 사용자가 쓴 지침\n', 'utf8');
eq(setup.ensureRules(fakeRoot), 'skipped:user-file', '지침: 표식 없는 파일은 건드리지 않음');
eq(fs.readFileSync(path.join(GEM, 'AGENTS.md'), 'utf8'), '# 사용자가 쓴 지침\n', '지침: 사용자 파일 그대로');
{ // 실제 루트 지침으로 만들면 크기 안에 들어가는가
  const realRoot = [path.resolve(ROOT, '..', '..', '..'), 'C:\\IRIS'].find((r) => fs.existsSync(path.join(r, 'AGENTS.md')) && /## 🔴/.test(fs.readFileSync(path.join(r, 'AGENTS.md'), 'utf8'))) || '';
  if (fs.existsSync(path.join(realRoot, 'AGENTS.md'))) ok(Buffer.byteLength(setup.rulesText(realRoot), 'utf8') <= setup.RULES_MAX_BYTES, '지침: 실제 루트로 만들어도 8KB 이하');
}
// 안전 훅
eq(setup.ensureHooks(fakeRoot, 'py'), 'skipped:no-bridge', '훅: 다리 스크립트 없으면 안 씀');
fs.mkdirSync(path.join(fakeRoot, '_agent', 'claude', 'scripts'), { recursive: true }); fs.writeFileSync(setup.bridgeScript(fakeRoot), '', 'utf8');
eq(setup.ensureHooks(fakeRoot, 'py'), 'created', '훅: 없음 → 만듦');
const hfile = path.join(GEM, 'config', 'hooks.json');
let hj = JSON.parse(fs.readFileSync(hfile, 'utf8'));
eq([Object.keys(hj), hj['iris-safety'].PreToolUse[0].matcher], [['iris-safety'], '.*'], '훅: 이름 붙인 항목 하나 · 도구 넷');
eq(setup.ensureHooks(fakeRoot, 'py'), 'unchanged', '훅: 같으면 그대로');
fs.writeFileSync(hfile, JSON.stringify({ mine: { Stop: [{ type: 'command', command: 'x' }] } }), 'utf8');
eq(setup.ensureHooks(fakeRoot, 'py'), 'set', '훅: 남의 항목이 있으면 우리 항목만 더함');
hj = JSON.parse(fs.readFileSync(hfile, 'utf8'));
eq(Object.keys(hj), ['mine', 'iris-safety'], '훅: 남의 항목 보존');
fs.writeFileSync(hfile, '[1,2]', 'utf8');
eq(setup.ensureHooks(fakeRoot, 'py'), 'skipped:not-object', '훅: 모양이 다르면 안 씀');
// 준비가 안 되면 세션을 띄우지 않는다
let p = setup.prepare(cwdA, fakeRoot);
ok(!p.ok && /가드 파일 없음/.test(p.why) && /안전 훅을 넣지 못함/.test(p.why), `준비: 가드 없음 · 훅 실패 = 막음 (${p.why})`);
for (const f of ['guard-iris-path.py', 'block-blanket-kill.ps1']) fs.writeFileSync(path.join(fakeRoot, '_agent', 'claude', 'scripts', f), '', 'utf8');
fs.writeFileSync(hfile, '{}', 'utf8');
fs.writeFileSync(path.join(GEM, 'AGENTS.md'), '# 사용자가 쓴 지침\n', 'utf8');
p = setup.prepare(cwdA, fakeRoot, { selfTest: () => '' });
ok(p.ok, `준비: 가드 · 훅 · 시험 호출 통과 · (사용자 지침 존중) = 띄움 (${p.why || p.line})`);
p = setup.prepare(cwdA, fakeRoot, { selfTest: () => '안전 다리 시험 호출이 막지 않음(allow)' });
ok(!p.ok && /시험 호출/.test(p.why), '준비: 다리가 실제로 막지 않으면 막음');
p = setup.prepare(cwdA, fakeRoot); // 진짜 시험 호출 — 빈 가짜 다리는 아무것도 출력하지 않으므로 막혀야 한다
ok(!p.ok && /시험 호출/.test(p.why), `준비: 빈 다리 = 시험 호출 실패로 막음 (${p.why})`);
if (fs.existsSync('C:\\IRIS\\_agent\\claude\\scripts\\agy-hook-bridge.py')) eq(setup.bridgeWorks('C:\\IRIS'), '', '이 PC 의 진짜 다리 = 시험 호출에서 막음(통과)');
fs.rmSync(path.join(GEM, 'AGENTS.md'));
p = setup.prepare(cwdA, path.join(TMP, 'no-such-root'));
ok(!p.ok, '준비: 루트 지침을 못 읽으면 막음');
let thrown = null; try { ad.preTrust(cwdA); } catch (e) { thrown = e.code; }
eq(thrown, 'AGY_NOT_READY', '띄우기 직전: 실제 루트에 가드가 없으면(시험 환경) 던져서 막음');

// ── 5. 대화 짝짓기(이 카드의 --log-file 만 근거) ──
{
  const sessions = new Map(), live = new Map(); let saved = 0; const logs = [];
  const sm = { sessions, live, save: () => { saved++; }, hooks: { onList: () => {}, onLog: (m) => logs.push(m) } };
  const mk = (id) => { const cmd = agents.buildCommand({ agent: 'antigravity' }, cwdA); const r = { id, agent: 'antigravity', cwd: cwdA, cmdline: cmd.cmdline, sessionId: null, recordPath: null }; sessions.set(id, r); live.set(id, {}); return [r, cmd.args[cmd.args.indexOf('--log-file') + 1]]; };
  const [a, logA] = mk('s1'), [b, logB] = mk('s2'), [d] = mk('s3');
  ad.watchRecord(sm, 's1', a); ad.watchRecord(sm, 's2', b); ad.watchRecord(sm, 's3', d);
  fs.mkdirSync(path.dirname(logA), { recursive: true });
  fs.writeFileSync(logA, 'I1123 x server.go:1] Created conversation ' + conv + ' (backend=X)\n', 'utf8');
  fs.writeFileSync(logB, 'I1123 x server.go:1] Created conversation ' + conv + ' (backend=X)\n', 'utf8');
  await wait(2600);
  eq([a.sessionId, a.recordPath === ad.transcriptOf(conv), a.resumeCmd], [conv, true, `agy --conversation ${conv}`], '짝짓기: 자기 기록 파일의 대화 id');
  eq(b.sessionId, null, '짝짓기: 다른 카드가 가진 id 는 받지 않음');
  eq(d.sessionId, null, '짝짓기: 기록 파일에 아직 없으면 잇지 않음');
  live.delete('s3'); live.delete('s2');
  const orphan = { id: 's9', agent: 'antigravity', cwd: cwdA, cmdline: 'agy --model x', sessionId: null };
  ad.watchRecord(sm, 's9', orphan);
  ok(orphan.sessionId === null && logs.some((m) => m.includes('기록 파일을 모름')), '짝짓기: 기록 파일을 모르면 잇지 않고 알림');
  const resumed = { id: 's8', agent: 'antigravity', sessionId: conv, recordPath: null };
  ad.watchRecord(sm, 's8', resumed);
  eq(resumed.recordPath, ad.transcriptOf(conv), '재개: id 로 기록 경로');
}

// ── 6. 로그인 · 한도 · 모델 목록 ──
const usageOk = JSON.stringify({ status: 'SUCCESS', command: { data: { groups: [{ name: 'Gemini Models', buckets: [{ id: 'gemini-weekly', name: 'W', window: 'weekly', remaining_fraction: 0.25, reset_time: '2026-11-30T02:00:00Z' }] }, { name: 'Gemini 4 Argon', buckets: [{ id: 'argon-weekly', window: 'weekly', remaining_fraction: 1.7, reset_time: 'x' }] }] } } });
const u = st.parseUsage(usageOk);
eq([u.state, u.groups.length, u.groups[1].buckets[0].remaining], ['ok', 2, 1], '한도: 해석 · 비율은 0~1 로 자름');
eq(st.headline(u).group, 'Gemini 4 Argon', '한도: 배터리 = Argon 주간 먼저');
eq(st.parseUsage('', { code: 1, stderr: 'Please sign in to view available models' }).state, 'auth', '로그인 안 됨');
eq(st.parseUsage('', { code: 1, stderr: 'timed out waiting for available models' }).state, 'unknown', '시간 초과 = 모름(로그아웃 아님)');
eq(st.parseUsage('{"status":"ERROR"}').state, 'unknown', '모르는 답 = 모름');
eq(st.brief().state, 'unknown', '상태: 아직 안 물었으면 모름');
fs.rmSync(path.join(FAKE_LA, 'agy'), { recursive: true, force: true });
eq((await st.refresh()).state, 'missing', '상태: 실행 파일 없음 = 프로그램 없음');
eq(JSON.parse(fs.readFileSync(process.env.IRIS_AGY_STATUS_FILE, 'utf8')).state, 'missing', '상태: 없음도 파일에 적음(대시보드가 옛 로그인됨을 붙들지 않게)');
ok(!('mergeStatus' in st), '상태: 클로드 · 코덱스 상태 객체에 섞는 함수가 없음(따로 보냄)');
{ // 서버가 /api/agents/status 와 agents 방송에 원래 agentStatus() 를 그대로 쓰는가(소스 확인)
  const src = fs.readFileSync(path.join(ROOT, 'daemon', 'server.mjs'), 'utf8');
  ok(/p === '\/api\/agents\/status'\) return json\(res, 200, agentStatus\(\)\)/.test(src) && /const agentsMsg = \(status = agentStatus\(\)\) => \(\{ type: 'agents', agents: activeAgentsMap\(AGENTS\), sleeping: status\.sleeping, status \}\);/.test(src), '서버: 클로드 · 코덱스 상태 계약 그대로');
}
fs.mkdirSync(path.join(FAKE_LA, 'agy', 'bin'), { recursive: true }); fs.writeFileSync(path.join(FAKE_LA, 'agy', 'bin', 'agy.exe'), '');
eq(st.parseModels('Fetching available models...\ngemini-4-argon-high\tGemini 4 Argon (High)\n\nbad line\ngpt-oss-120b-medium\tGPT-OSS 120B (Medium)\r\n'), [{ id: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High)' }, { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' }], '모델 목록 해석');
eq(ad.titleCommand({}).skip ? 'skip' : 'run', 'skip', '제목 생성 = 하지 않음(첫 요청 제목)');
eq([ad.subagentDirs(), ad.addSubagent(), ad.subagentDone(), ad.subagentEndedAt()], [[], false, false, null], '보조 작업 = 미지원(계약만)');

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
console.log(`${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
