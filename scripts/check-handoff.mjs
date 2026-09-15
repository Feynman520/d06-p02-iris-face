// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 인수 문서(설치 패키지 v2, daemon/handoff.mjs) 무접촉 검사 — 임시 폴더에 가짜 영혼(handoff.json + 영수증)을 만들어
//   ① resolveState 4상태 + 영수증 어긋남 → setup-incomplete
//   ② markMessengerPrompted 가 그 한 필드만 바꾸는지
//   ③ resumeTarget 의 경로 규칙(영혼 밖·절대경로·이상한 인자 거부)
//   ④ HandoffFlow 첫 실행(가짜 SessionManager — 진짜 CLI·pty 접촉 0)
//   ⑤ 옛 보조 코드 가드: 1.x 영혼(handoff 없음)에서는 열려 있고 v2 영혼에서는 닫혀 있는지
// 실 데몬(3458)·실제 C:\IRIS\_agent\setup 은 건드리지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HANDOFF_SCHEMA, SETUP_STAGES, handoffFile, receiptFile, handoffExists, readHandoff,
  receiptSetupOk, receiptLoginOk, handoffLoginOk, resolveState, markMessengerPrompted, resumeTarget, HandoffFlow,
  CONTRACT_INSTALLER_PATH,
} from '../daemon/handoff.mjs';
import { SetupProgress, progressFile } from '../daemon/progress.mjs';
import { Finalizer } from '../daemon/finalize.mjs';
import { needsReinstall, REINSTALL_NOTE, REINSTALL_URL } from '../daemon/update.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-handoff-'));
const soul = (name) => { const r = path.join(tmp, name); fs.mkdirSync(path.join(r, '_agent', 'setup'), { recursive: true }); return r; };
const writeJson = (file, o) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(o, null, 2), 'utf8'); };

// 계약(P03 docs\인수문서-handoff-v2.md)의 예시 그대로
const handoffDoc = (over = {}) => ({
  schema: HANDOFF_SCHEMA, packageVersion: '2.0.0', writtenAt: '2026-09-15T12:00:00+09:00', state: 'ready',
  subscriptions: ['claude'], leadAgent: 'claude', login: { claude: 'done', chatgpt: 'not-needed' },
  relay: { state: 'done', accounts: 1 }, setup: { allDone: true, failed: null },
  folders: ['R01-교사(Teacher)'], nameEnMissing: ['R02-연구'], deferred: ['S', 'T', 'tags'],
  pendingCapabilities: [{ capability: '문서 자동화(한글)', reason: '한컴오피스가 설치되어 있지 않습니다', howToEnable: '한컴오피스를 설치하면 자동으로 켜집니다' }],
  checks: { pass: 8, pending: 1, fail: 0 }, reportPath: '_agent/setup/설치보고-2026-09-15.md', diagnosticsPath: '_agent/setup/diagnostics.json',
  firstMessage: '세팅이 끝났다. handoff.json을 읽고 세 줄로 인사해 줘.',
  messenger: { installed: true, prompted: false },
  resume: { installerPath: '_agent/setup/installer/IRIS-설치.cmd', args: ['--resume'] },
  ...over,
});
const receiptDoc = (over = {}) => ({
  schema: 2, package: { version: '2.0.0' },
  setup: Object.fromEntries(SETUP_STAGES.map((id) => [id, { status: 'done', finishedAt: 't' }])),
  online: { stage: 'done', net: { ok: true, blocked: [] }, logins: { claude: { state: 'done' }, chatgpt: { state: 'not-needed' } }, relay: { state: 'done', accounts: 1 } },
  ...over,
});
/** 인수 문서 + 영수증을 갖춘 가짜 영혼. 설치기 사본도 만들어 둔다(「설치 이어하기」 대상). */
function makeSoul(name, { handoff, receipt } = {}) {
  const root = soul(name);
  if (handoff !== null) writeJson(handoffFile(root), handoff || handoffDoc());
  if (receipt !== null) writeJson(receiptFile(root), receipt || receiptDoc());
  const cmd = path.join(root, '_agent', 'setup', 'installer', 'IRIS-설치.cmd');
  fs.mkdirSync(path.dirname(cmd), { recursive: true }); fs.writeFileSync(cmd, '@echo off\r\n', 'utf8');
  return root;
}

// ---------- 1) resolveState 4상태 ----------
{
  const r = makeSoul('READY');
  ok(resolveState(r).state === 'ready', 'ready: 인수 문서 ready + 영수증 9단계 done + 로그인 done');
  ok(handoffExists(r) === true, 'handoffExists: v2 영혼 = true');
}
{
  const r = makeSoul('NONE', { handoff: null });
  ok(resolveState(r).state === 'none', 'none: handoff.json 없음(1.x 영혼 또는 손 설치)');
  ok(handoffExists(r) === false, 'handoffExists: 1.x 영혼 = false');
}
{
  const r = makeSoul('LOGIN', {
    handoff: handoffDoc({ state: 'login-pending', login: { claude: 'waiting', chatgpt: 'not-needed' } }),
    receipt: receiptDoc({ online: { stage: 'login', logins: { claude: { state: 'waiting' }, chatgpt: { state: 'not-needed' } } } }),
  });
  ok(resolveState(r).state === 'login-pending', 'login-pending: 구독 로그인이 남음');
}
{
  const r = makeSoul('INCOMPLETE', {
    handoff: handoffDoc({ state: 'setup-incomplete', setup: { allDone: false, failed: 'venv' } }),
    receipt: receiptDoc({ setup: Object.fromEntries(SETUP_STAGES.map((id, i) => [id, { status: i < 4 ? 'done' : 'pending' }])) }),
  });
  ok(resolveState(r).state === 'setup-incomplete', 'setup-incomplete: 세팅 단계가 덜 끝남');
}

// ---------- 2) 교차 확인 — 인수 문서가 ready 라고 해도 영수증이 어긋나면 setup-incomplete ----------
{
  const r = makeSoul('MISMATCH', { receipt: receiptDoc({ setup: { ...Object.fromEntries(SETUP_STAGES.map((id) => [id, { status: 'done' }])), checks: { status: 'failed', code: 'E-CHECKS' } } }) });
  const s = resolveState(r);
  ok(s.state === 'setup-incomplete', '교차 확인: handoff=ready 이어도 영수증 9단계가 덜 done 이면 setup-incomplete');
  ok(s.reasons.some((x) => x.includes('9단계')), '교차 확인: 왜 그랬는지 사유가 남는다');
}
{
  const r = makeSoul('NO-RECEIPT', { receipt: null });
  ok(resolveState(r).state === 'setup-incomplete', '교차 확인: 영수증이 아예 없으면 setup-incomplete');
}
{
  const r = makeSoul('OLD-RECEIPT', { receipt: receiptDoc({ schema: 1 }) });
  ok(resolveState(r).state === 'setup-incomplete', '교차 확인: 영수증 schema<2 면 확인 불가 → setup-incomplete');
}
{
  const r = makeSoul('LOGIN-MISMATCH', { receipt: receiptDoc({ online: { stage: 'login', logins: { claude: { state: 'cli-done' } } } }) });
  ok(resolveState(r).state === 'login-pending', '교차 확인: 영수증 로그인이 cli-done(아직 안 끝남)이면 login-pending');
}
{
  const r = makeSoul('BAD-SCHEMA', { handoff: { ...handoffDoc(), schema: 9 } });
  ok(readHandoff(r) === null && resolveState(r).state === 'none', '모르는 handoff schema 는 따르지 않는다(none)');
  fs.writeFileSync(handoffFile(r), '{ broken', 'utf8');
  ok(readHandoff(r) === null && resolveState(r).state === 'none', '깨진 JSON 도 none(예외 없음)');
}
{
  const r = makeSoul('WEIRD-STATE', { handoff: handoffDoc({ state: 'whatever' }) });
  ok(resolveState(r).state === 'setup-incomplete', '모르는 state 값은 안전한 쪽(setup-incomplete)으로');
}
// 작은 조각들
ok(receiptSetupOk(receiptDoc()) === true && receiptSetupOk(null) === false, 'receiptSetupOk: 9단계 done / 영수증 없음');
ok(receiptLoginOk(receiptDoc()) === true && receiptLoginOk({ online: {} }) === false, 'receiptLoginOk: logins 없으면 false');
ok(handoffLoginOk({ login: { claude: 'failed' } }) === false && handoffLoginOk({}) === true, 'handoffLoginOk: failed=false · 표 없음=true');

// ---------- 3) markMessengerPrompted — 그 한 필드만 ----------
{
  const r = makeSoul('PROMPT');
  const before = JSON.parse(fs.readFileSync(handoffFile(r), 'utf8'));
  const w = markMessengerPrompted(r);
  const after = JSON.parse(fs.readFileSync(handoffFile(r), 'utf8'));
  ok(w.ok && w.changed && after.messenger.prompted === true, 'markMessengerPrompted: prompted=true 로 갱신');
  ok(after.messenger.installed === true, 'markMessengerPrompted: 형제 필드(installed) 그대로');
  const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.messenger; return JSON.stringify(c); };
  ok(strip(before) === strip(after), 'markMessengerPrompted: messenger 밖의 어떤 필드도 바뀌지 않음');
  ok(JSON.stringify(Object.keys(before)) === JSON.stringify(Object.keys(after)), '키 차례도 그대로(필드가 사라지거나 늘지 않음)');
  const again = markMessengerPrompted(r);
  ok(again.ok && again.changed === false, '이미 true 면 다시 쓰지 않는다');
  ok(!fs.existsSync(`${handoffFile(r)}.tmp`), '원자 쓰기 임시 파일이 남지 않는다');
}

// ---------- 4) resumeTarget — 영혼 밖으로도, 셸 재해석으로도 새지 않는다 ----------
{
  const r = makeSoul('RESUME');
  const t = resumeTarget(r, handoffDoc());
  ok(t.ok && t.file === path.join(r, '_agent', 'setup', 'installer', 'IRIS-설치.cmd') && t.args.join(' ') === '--resume', 'resumeTarget: 영혼 상대경로 → 절대경로 + --resume');
  ok(resumeTarget(r, handoffDoc({ resume: { installerPath: '_agent\\setup\\installer\\IRIS-설치.cmd' } })).ok === true, 'resumeTarget: 슬래시 방향은 너그럽게(역슬래시도 같은 경로)');
  ok(resumeTarget(r, handoffDoc({ resume: { installerPath: '../밖/IRIS-설치.cmd' } })).ok === false, 'resumeTarget: 영혼 밖 경로 거부');
  ok(resumeTarget(r, handoffDoc({ resume: { installerPath: 'C:/Windows/system32/cmd.exe' } })).ok === false, 'resumeTarget: 절대경로 거부');
  ok(resumeTarget(r, handoffDoc({ resume: { installerPath: '_agent/setup/없는파일.cmd' } })).ok === false, 'resumeTarget: 사본이 없으면 거부');
  const bad = resumeTarget(r, handoffDoc({ resume: { installerPath: '_agent/setup/installer/IRIS-설치.cmd', args: ['& del /q *', '--resume'] } }));
  ok(bad.ok && bad.args.length === 1 && bad.args[0] === '--resume', 'resumeTarget: 이상한 인자는 걸러낸다');

  // ⓐ 계약이 정한 그 경로 하나만 — 영혼 안에 실제로 있는 다른 파일도 받지 않는다(검토 1회차 Important).
  //    이것이 없으면 인수 문서가 "이름에 셸 글자가 든 영혼 안 파일"을 가리켜 cmd 재해석을 노릴 수 있다.
  const other = path.join(r, '_agent', 'setup', 'installer', '다른것.cmd');
  fs.writeFileSync(other, '@echo off\r\n', 'utf8');
  const nonContract = resumeTarget(r, handoffDoc({ resume: { installerPath: '_agent/setup/installer/다른것.cmd' } }));
  ok(nonContract.ok === false && /계약과 다릅니다/.test(nonContract.reason), 'resumeTarget: 영혼 안에 실제로 있어도 계약 밖 경로면 거부');
  ok(CONTRACT_INSTALLER_PATH === '_agent/setup/installer/IRIS-설치.cmd', '계약이 정한 설치기 사본 자리는 하나뿐');
  // 셸 글자가 든 이름은 계약 검사에서 이미 걸린다(같은 폴더에 실제로 만들어 두고 확인)
  const meta = path.join(r, '_agent', 'setup', 'installer', 'IRIS-설치.cmd&calc.cmd');
  fs.writeFileSync(meta, '@echo off\r\n', 'utf8');
  const metaRel = resumeTarget(r, handoffDoc({ resume: { installerPath: '_agent/setup/installer/IRIS-설치.cmd&calc.cmd' } }));
  ok(metaRel.ok === false, 'resumeTarget: 이름에 셸 글자(&)가 든 실제 파일도 거부');
}
{
  // ⓑ 영혼 루트 자체에 셸 글자가 있으면(계약 경로라도) 실행하지 않는다 — 풀어 본 절대경로를 다시 본다.
  const r = makeSoul('META(&)WRAP');
  const t = resumeTarget(r, handoffDoc());
  ok(t.ok === false && /셸이 다르게 읽는 글자/.test(t.reason), 'resumeTarget: 풀어 본 절대경로에 & ( ) 가 있으면 거부');
  const f = flowOfLate(r);
  const rr = f.resume();
  ok(rr.ok === false && f.spawns.length === 0, 'resume(): 거부되면 cmd.exe 를 아예 띄우지 않는다');
}
/** 위 한 곳에서만 쓰는 작은 흐름(아래 flowOf 와 같은 모양, spawn 호출을 들여다볼 수 있게) */
function flowOfLate(root) {
  const spawns = [];
  const f = new HandoffFlow({
    root, stateDir: path.join(root, '_state'), sm: null, log: () => {}, broadcast: () => {},
    spawnImpl: (cmd, args, o) => { spawns.push({ cmd, args, o }); return { pid: 4242, unref() {} }; },
  });
  f.spawns = spawns; return f;
}
{
  // ⓒ 실제로 넘기는 명령줄: 경로를 따옴표로 감싸고 verbatim 으로 그대로 보낸다(Node 의 배열 조립에 맡기지 않는다).
  const r = makeSoul('RESUME-LINE');
  const f = flowOfLate(r);
  const rr = f.resume();
  ok(rr.ok && f.spawns.length === 1 && f.spawns[0].cmd === 'cmd.exe', 'resume(): cmd.exe 하나만 띄운다');
  const args = f.spawns[0].args;
  ok(args.length === 2 && args[0] === '/c' && args[1] === `start "" "${path.join(r, '_agent', 'setup', 'installer', 'IRIS-설치.cmd')}" --resume`, 'resume(): 경로를 따옴표로 감싼 명령줄 한 덩어리');
  ok(f.spawns[0].o.windowsVerbatimArguments === true, 'resume(): windowsVerbatimArguments — Node 가 다시 조립하지 않는다');
  ok(f.spawns[0].o.detached === true && f.spawns[0].o.cwd === r, 'resume(): 분리 실행 · cwd = 영혼 루트(창은 그대로 산다)');
}

// ---------- 5) HandoffFlow 첫 실행(가짜 SessionManager — CLI·pty 접촉 0) ----------
function fakeSm(list = []) {
  const calls = [];
  return {
    calls,
    list: () => list,
    send: (id, text) => { calls.push({ op: 'send', id, text }); },
    create: (o) => { calls.push({ op: 'create', ...o }); const rec = { id: 'sX', cwd: o.cwd, agent: o.agent, status: 'busy' }; list.push(rec); return rec; },
  };
}
const flowOf = (root, sm, over = {}) => new HandoffFlow({ root, stateDir: path.join(root, '_state'), sm, log: () => {}, broadcast: () => {}, spawnImpl: () => ({ pid: 4242, unref() {} }), ...over });
{
  const r = makeSoul('FLOW-READY');
  const sm = fakeSm();
  const f = flowOf(r, sm);
  const out = f.runOnce();
  ok(out.state === 'ready' && out.action === 'created', 'ready: 세션을 새로 열었다');
  ok(sm.calls[0].cwd === r && sm.calls[0].agent === 'claude', 'ready: 영혼 루트 + 주도 에이전트(claude)');
  ok(sm.calls[0].prompt === handoffDoc().firstMessage, 'ready: firstMessage 를 그대로 보낸다(창이 문장을 만들지 않음)');
  ok(f.card?.kind === 'messenger-prompt' && f.card.openModule === 'messenger', 'ready: 메신저 안내 카드 1회');
  ok(JSON.parse(fs.readFileSync(handoffFile(r), 'utf8')).messenger.prompted === true, 'ready: 표시하자마자 prompted=true 기록');
  ok(f.card.later === true && f.card.resume === false, '메신저 카드에는 「나중에」만');
  ok(!/TeamClaude/i.test([f.card.title, ...f.card.lines].join(' ')), '메신저 안내 카드 글에도 "TeamClaude" 0회');
  // 두 번째 데몬 시작 — 새 흐름 객체로 다시 불러도 인사·안내를 되풀이하지 않는다
  const f2 = flowOf(r, fakeSm());
  const out2 = f2.runOnce();
  ok(out2.action === 'already-greeted' && f2.card === null, '다시 시작해도 첫 인사·메신저 안내를 되풀이하지 않는다');
}
{
  // 같은 폴더에 살아 있는 세션이 있으면 새로 열지 않고 요청문만 보낸다(launch.mjs --first-session 과 같은 규칙)
  const r = makeSoul('FLOW-DUP');
  const sm = fakeSm([{ id: 's1', cwd: r, status: 'idle' }]);
  const out = flowOf(r, sm).runOnce();
  ok(out.action === 'sent' && sm.calls[0].op === 'send' && sm.calls[0].id === 's1', 'ready: 살아 있는 세션에는 보내기만(중복 세션 없음)');
}
{
  const r = makeSoul('FLOW-BUSY');
  const sm = fakeSm([{ id: 's1', cwd: r, status: 'busy' }]);
  const f = flowOf(r, sm);
  ok(f.runOnce().action === 'busy-skip' && sm.calls.length === 0, 'ready: 바쁜 세션은 건드리지 않는다');
  ok(!fs.existsSync(f.seenFile()) || !JSON.parse(fs.readFileSync(f.seenFile(), 'utf8')).greetedFor, '미룬 인사는 "했다"고 적지 않는다(다음에 다시 시도)');
}
{
  const r = makeSoul('FLOW-CARD', {
    handoff: handoffDoc({ state: 'login-pending', login: { claude: 'waiting' } }),
    receipt: receiptDoc({ online: { logins: { claude: { state: 'waiting' } } } }),
  });
  const sm = fakeSm();
  const f = flowOf(r, sm);
  const out = f.runOnce();
  ok(out.action === 'card' && sm.calls.length === 0, 'login-pending: 대화를 시작하지 않고 카드만');
  ok(f.card.kind === 'setup-status' && f.card.title === '로그인이 남았습니다' && f.card.resume === true && f.card.later === true, 'login-pending 카드: 제목 + 「설치 이어하기」 + 「나중에」');
  const text = [f.card.title, ...f.card.lines].join(' ');
  ok(!/TeamClaude/i.test(text), '카드 글에 "TeamClaude" 가 한 번도 없다');
  ok(f.card.lines.length >= 2 && f.card.lines.every((l) => l.length <= 60 && /[.。]$/.test(l.trim())), '카드 글은 짧은 한 문장씩');
  const rr = f.resume();
  ok(rr.ok && rr.pid === 4242 && rr.args.join(' ') === '--resume', '「설치 이어하기」: 영혼 안 설치기 사본을 새 창으로');
  f.dismiss();
  ok(f.card === null, '「나중에」: 카드만 내린다');
}
{
  const r = makeSoul('FLOW-INCOMPLETE', { receipt: receiptDoc({ setup: Object.fromEntries(SETUP_STAGES.map((id, i) => [id, { status: i ? 'pending' : 'done' }])) }) });
  const f = flowOf(r, fakeSm());
  f.runOnce();
  ok(f.card.title === '세팅이 끝나지 않았습니다', 'setup-incomplete 카드 제목');
  ok(!/TeamClaude/i.test([f.card.title, ...f.card.lines].join(' ')), 'setup-incomplete 카드에도 "TeamClaude" 0회');
  ok(f.info().state === 'setup-incomplete' && f.info().card === f.card, 'info(): 화면에 줄 상태와 카드');
}
{
  const r = makeSoul('FLOW-NONE', { handoff: null });
  const sm = fakeSm();
  const f = flowOf(r, sm);
  ok(f.runOnce().state === 'none' && sm.calls.length === 0 && f.card === null, '1.x 영혼: 아무 일도 하지 않는다');
}

// ---------- 6) 옛 보조 코드 가드 — 1.x 는 열려 있고 v2 는 닫혀 있다 ----------
{
  const one = makeSoul('GUARD-1X', { handoff: null });
  const two = makeSoul('GUARD-V2');
  // 진행 막대: 두 영혼 모두 setup-progress.json 은 있다 — 차이를 내는 것은 오직 handoff.json 이다.
  for (const r of [one, two]) fs.writeFileSync(progressFile(r), JSON.stringify({ schema: 1, updatedAt: 't', stages: [{ id: 'a', label: '단계', status: 'running' }] }), 'utf8');
  const p1 = new SetupProgress({ root: one, broadcast: () => {}, log: () => {} });
  const p2 = new SetupProgress({ root: two, broadcast: () => {}, log: () => {} });
  ok(p1.start() === true, '진행 막대: 1.x 영혼에서는 그대로 돈다');
  p1.stop();
  ok(p2.start() === false && p2.timer === null, '진행 막대: v2 영혼에서는 잠든다');
  ok(p1.info() !== null && p2.info() === null, 'info(): 1.x 는 값, v2 는 null(막대를 그리지 않음)');

  // finalize 감시: 두 영혼 모두 pending-finalize + 파이프라인이 있어도 v2 면 시작하지 않는다.
  for (const r of [one, two]) {
    fs.writeFileSync(path.join(r, 'soul-state.json'), JSON.stringify({ lifecycle: 'pending-finalize', bootstrap: { generationId: 'g1' } }), 'utf8');
    fs.writeFileSync(path.join(r, '_agent', 'setup', 'finalize-pipeline.ps1'), '# test', 'utf8');
  }
  const sm0 = { list: () => [] };
  const f1 = new Finalizer({ root: one, sm: sm0, stateDir: path.join(one, '_state'), log: () => {}, broadcast: () => {} });
  const f2 = new Finalizer({ root: two, sm: sm0, stateDir: path.join(two, '_state'), log: () => {}, broadcast: () => {} });
  ok(f1.start() === true, 'finalize 감시: 1.x 영혼에서는 그대로 켜진다');
  f1.stop();
  ok(f2.start() === false && f2.timer === null, 'finalize 감시: v2 영혼에서는 잠든다');

  // launch.mjs --first-session 가드는 같은 handoffExists() 한 곳을 본다.
  ok(handoffExists(one) === false && handoffExists(two) === true, '--first-session 가드의 근거도 같은 handoffExists() 한 곳');
}

// ---------- 7) 설정 → 업데이트: 1.x → 2.0 은 자동 적용 대신 안내 ----------
{
  ok(needsReinstall({ latestPackageVersion: '2.0.0', receipt: { schema: 1 } }) === true, 'reinstall: 구조판 2.0 + 영수증 schema 1 → 새로 설치');
  ok(needsReinstall({ latestPackageVersion: '2.0.0', receipt: null }) === true, 'reinstall: 영수증 없음도 새로 설치');
  ok(needsReinstall({ latestPackageVersion: '2.0.0', receipt: { schema: 2 } }) === false, 'reinstall: 영수증 schema 2 면 평소대로 업데이트');
  ok(needsReinstall({ latestPackageVersion: '1.4.5', receipt: { schema: 1 } }) === false, 'reinstall: 구조판이 아직 1.x 면 해당 없음');
  ok(REINSTALL_NOTE === '2.0은 설치 방식이 바뀌어 새로 설치합니다. 기존 자료는 그대로 두고 설치기를 실행하면 됩니다.', '안내 문구가 계약 그대로');
  ok(REINSTALL_URL === 'https://iris-workspace.com/install.html', '홈페이지 링크가 계약 그대로');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
