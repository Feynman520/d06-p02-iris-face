// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 세팅 마무리 자동 실행(v2.60, finalize.mjs) 무접촉 검사 — 가짜 영혼 폴더·가짜 세션 관리자·가짜 파이프라인으로
// 조건 판정(pending·스크립트·busy·조용한 시간·재시도 간격), 세션 pause→resume, 결과 파싱·기록, 이어 열기 문장, 실패 처리를 본다.
// 실 데몬(3458)·PowerShell·실제 CLI 접촉 0. 사용: node scripts/check-finalize.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Finalizer, readPending, parseResult, resumeNote, pipelinePath, QUIET_MS, RETRY_MS } from '../daemon/finalize.mjs';
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-finalize-'));
const root = path.join(tmp, 'NOVA'); fs.mkdirSync(path.join(root, '_agent', 'setup'), { recursive: true });
const stateDir = path.join(tmp, 'state');
const writeSoul = (o) => fs.writeFileSync(path.join(root, 'soul-state.json'), JSON.stringify(o), 'utf8');

// ---- 1) 상태 읽기·결과 파싱·이어 열기 문장 ----
{
  writeSoul({ schemaVersion: 7, soulId: 's1', lifecycle: 'wizard-paused' });
  ok(readPending(root).pending === false, '상태: wizard-paused 는 대기 아님');
  writeSoul({ schemaVersion: 7, soulId: 's1', lifecycle: 'pending-finalize', bootstrap: { generationId: 'g1', stageStatus: 'pending-finalize' } });
  const p = readPending(root);
  ok(p.pending === true && p.generationId === 'g1', '상태: pending-finalize + 세대 id');
  writeSoul({ schemaVersion: 7, soulId: 's1', lifecycle: 'active', bootstrap: { generationId: 'g1', stageStatus: 'pending-finalize' } });
  ok(readPending(root).pending === true, '상태: bootstrap.stageStatus 만 pending 이어도 대기');
  fs.writeFileSync(path.join(root, 'soul-state.json'), '{ broken', 'utf8');
  ok(readPending(root).pending === false, '상태: 깨진 JSON 은 대기 아님(예외 없음)');
  ok(parseResult('junk\nFINALIZE-PIPELINE-RESULT: {"mode":"ready","machineReady":true}\n')?.mode === 'ready', '결과: 마지막 줄의 JSON 을 뽑음');
  ok(parseResult('no marker') === null && parseResult('FINALIZE-PIPELINE-RESULT: {bad') === null, '결과: 표식 없음·깨진 JSON → null');
  ok(/mode=ready/.test(resumeNote({ mode: 'ready' })) && /소환하기\.cmd를 열라고 하지/.test(resumeNote({ mode: 'ready' })), '문장: ready 는 이어가라 + 소환기 금지');
  ok(/mode=pending-secrets-vault/.test(resumeNote({ mode: 'pending-secrets-vault', explanation: 'x' })) && /10분/.test(resumeNote({ mode: 'pending-secrets-vault' })), '문장: 미완은 사유 + 10분 재시도');
}

// ---- 2) 가짜 세션 관리자 + 가짜 파이프라인으로 상태 기계 ----
function fakeSm(list) {
  const calls = { pause: [], resume: [] };
  return {
    calls,
    list: () => list,
    pause: (id) => { const r = list.find((x) => x.id === id); calls.pause.push(id); r.status = 'exited'; r.pid = null; },
    resume: (id, { prompt }) => { const r = list.find((x) => x.id === id); calls.resume.push({ id, prompt }); r.status = 'busy'; r.pid = 999; },
  };
}
const mk = (opts = {}) => {
  let now = 1_000_000;
  const events = [];
  const runs = [];
  const f = new Finalizer({
    root, sm: opts.sm, stateDir, log: () => {}, broadcast: (e) => events.push(e), now: () => now,
    envBuilder: (env) => ({ ...env, PATH: 'C:\\NOVA\\_agent\\shared\\shims;' + (env.PATH || '') }), // 영수증 env 흉내

    run: async (script, env) => { runs.push({ script, env }); return opts.run ? opts.run() : { code: 0, text: 'x\nFINALIZE-PIPELINE-RESULT: {"mode":"ready","machineReady":true,"explanation":"ok"}\n' }; },
  });
  return { f, events, runs, advance: (ms) => { now += ms; } };
};
{
  writeSoul({ schemaVersion: 7, soulId: 's1', lifecycle: 'pending-finalize', bootstrap: { generationId: 'g1' } });
  const sm = fakeSm([{ id: 's1', status: 'idle', pid: 111, sessionId: 'abc' }]);
  const t = mk({ sm });
  ok(t.f.eligible().why === 'no-pipeline-script', '조건: 스크립트가 없으면 돌지 않음(1.3.x 가이드 호환)');
  fs.writeFileSync(pipelinePath(root), '# stub', 'utf8');
  ok(t.f.eligible().why === 'not-quiet', '조건: 상태 변화 직후는 조용하지 않음');
  t.advance(QUIET_MS + 1);
  sm.list()[0].status = 'busy';
  ok(t.f.eligible().why === 'busy', '조건: busy 세션이 있으면 기다림');
  sm.list()[0].status = 'idle';
  ok(t.f.eligible().ok === true, '조건: pending + 스크립트 + 한가 + 조용 → 실행');
  const mode = await t.f.tick();
  ok(mode === 'ready', '실행: 파이프라인 ready');
  ok(sm.calls.pause.length === 1 && sm.calls.pause[0] === 's1', '실행: 살아 있던 세션을 pause(카드 유지)');
  ok(sm.calls.resume.length === 1 && /mode=ready/.test(sm.calls.resume[0].prompt), '실행: 같은 카드를 resume 하며 결과 문장을 첫 메시지로');
  ok(t.runs.length === 1 && t.runs[0].env.CLAUDE_CONFIG_DIR === path.join(root, '_agent', 'claude') && t.runs[0].env.CODEX_HOME === path.join(root, '_agent', 'codex'), '실행: 에이전트 홈 환경변수를 영혼 안으로 명시');
  ok(t.runs[0].env.PATH.startsWith('C:\\NOVA\\_agent\\shared\\shims;'), '실행: 영수증 env(PATH 앞 동봉 도구)를 거쳐 파이프라인에 넘김 — 검사기가 동봉 Git/Node/Python 을 먼저 본다');
  ok(/Still live/.test(resumeNote({ mode: 'failed', explanation: 'Finalize requires zero live Claude/Codex processes. Still live: claude:123' })) && /터미널만 닫아/.test(resumeNote({ mode: 'failed', explanation: 'Still live: x' })), '문장: 바깥 터미널이 살아 있으면 그것만 닫으라고 안내');
  ok(t.events.some((e) => e.type === 'finalize' && e.phase === 'start') && t.events.some((e) => e.type === 'finalize' && e.phase === 'ready'), '방송: start → ready');
  const rec = JSON.parse(fs.readFileSync(path.join(stateDir, 'finalize.json'), 'utf8'));
  ok(rec.result.mode === 'ready' && rec.generationId === 'g1' && rec.resumed.includes('s1'), '기록: state\\finalize.json 에 결과·세대·재개 목록');
  // 같은 세대는 재시도 간격 전에 다시 돌지 않는다(파이프라인이 실제로 상태를 바꾸지 않았다고 가정)
  t.advance(QUIET_MS + 1);
  ok(t.f.eligible().why === 'retry-wait', '재시도: 같은 세대는 10분 안에 다시 돌지 않음');
  t.advance(RETRY_MS);
  sm.list()[0].status = 'idle'; // 가짜 resume 이 busy 로 두었으므로 한가한 상태로 되돌린다
  ok(t.f.eligible().ok === true, '재시도: 간격이 지나면 다시 가능');
}
{
  // 미완(금고 등) → pending 방송 + 사유가 담긴 문장으로 resume
  writeSoul({ schemaVersion: 7, soulId: 's1', lifecycle: 'pending-finalize', bootstrap: { generationId: 'g2' } });
  const sm = fakeSm([{ id: 's1', status: 'idle', pid: 111, sessionId: 'abc' }, { id: 's2', status: 'exited', pid: null }]);
  const t = mk({ sm, run: () => ({ code: 2, text: 'FINALIZE-PIPELINE-RESULT: {"mode":"pending-secrets-vault","machineReady":false,"explanation":"vault"}' }) });
  t.advance(QUIET_MS + 1);
  const mode = await t.f.tick();
  ok(mode === 'pending-secrets-vault', '미완: 파이프라인의 mode 를 그대로 돌려줌');
  ok(sm.calls.pause.length === 1 && sm.calls.resume.length === 1 && /pending-secrets-vault/.test(sm.calls.resume[0].prompt) && /vault/.test(sm.calls.resume[0].prompt), '미완: 살아 있던 세션만 pause/resume, 문장에 mode·사유');
  ok(t.events.some((e) => e.phase === 'pending' && e.result.mode === 'pending-secrets-vault'), '미완: pending 방송');
}
{
  // 결과 줄이 없으면 failed 로 기록하고 세션은 되살린다
  writeSoul({ schemaVersion: 7, soulId: 's1', lifecycle: 'pending-finalize', bootstrap: { generationId: 'g3' } });
  const sm = fakeSm([{ id: 's1', status: 'attention', pid: 5, sessionId: 'abc' }]);
  const t = mk({ sm, run: () => ({ code: 1, text: 'boom' }) });
  t.advance(QUIET_MS + 1);
  const mode = await t.f.tick();
  ok(mode === 'failed' && sm.calls.resume.length === 1, '실패: 결과 줄 없음 → failed, 세션은 이어 열림');
}
{
  // 끄기 플래그·pending 아님
  writeSoul({ schemaVersion: 7, soulId: 's1', lifecycle: 'active' });
  const sm = fakeSm([]);
  const t = mk({ sm });
  t.advance(QUIET_MS + 1);
  ok(t.f.eligible().why === 'not-pending', '조건: pending 이 아니면 아무것도 하지 않음');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
