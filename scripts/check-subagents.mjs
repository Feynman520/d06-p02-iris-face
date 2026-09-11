// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 보조 작업(서브에이전트) 감시자 무접촉 검사(구현계획 v2.33). 실제 과거 기록파일만 읽는다 — 쓰기·프로세스 접촉 0.
//   1) 클로드 배경형(2389e82c…): 발견·이름·모델·toolUseId 연결·완료 판정(<task-notification>)
//   2) 클로드 동기형(a47b7be8…): tool_result 로 완료, 끝 시각 = tool_result 시각
//   3) 코덱스(01a05783… 8/31): parent_thread_id 로 자식 발견·별명·task_complete 로 완료
//   4) 기록 정규화: user(지시문)·tool·assistant 항목 존재, 도구 횟수 = tool_use 수
//   5) 무접촉: 검사 전후 파일 mtime·크기 동일
// 기록이 없는 PC(공개 배포본)에서는 해당 검사를 SKIP 으로 표시한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TranscriptTail } from '../daemon/transcript.mjs';
import { SubagentWatcher } from '../daemon/subagents.mjs';
import { CODEX_HOME } from '../daemon/agents.mjs';

const CFG = process.env.CLAUDE_CONFIG_DIR || 'C:\\IRIS\\_agent\\claude';
const PROJ = path.join(CFG, 'projects', 'C--IRIS');
let fail = 0, pass = 0, skip = 0;
const ok = (name, cond, note = '') => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${note ? ' -> ' + note : ''}`); } };
const SKIP = (name, why) => { skip++; console.log(`SKIP ${name} (${why})`); };
const snap = (files) => files.filter(f => fs.existsSync(f)).map(f => { const s = fs.statSync(f); return `${f}|${s.size}|${s.mtimeMs}`; }).join('\n');

function claudeCase(sessionId, label, expect) {
  const rec = { agent: 'claude', recordPath: path.join(PROJ, `${sessionId}.jsonl`), sessionId };
  if (!fs.existsSync(rec.recordPath)) return SKIP(label, '기록 없음');
  const parent = new TranscriptTail(rec.recordPath, 'claude'); parent.poll();
  const w = new SubagentWatcher(rec);
  w.scan(false, true);
  const before = snap([rec.recordPath, ...[...w.subs.values()].map(s => s.file)]);
  w.poll(parent, false);
  const list = w.list();
  ok(`${label}: 발견 ≥ ${expect.count}개 (${list.length})`, list.length >= expect.count);
  const s = expect.toolUseId ? list.find(x => x.toolUseId === expect.toolUseId) : list[0];
  ok(`${label}: 대상 보조 있음`, !!s, expect.toolUseId || ''); if (!s) return;
  if (expect.name) ok(`${label}: 이름`, s.name === expect.name, s.name);
  if (expect.model) ok(`${label}: 모델`, s.model === expect.model, s.model);
  ok(`${label}: toolUseId가 부모 Agent 호출과 일치`, !!s.toolUseId && parent.calls.has(s.toolUseId), `${s.toolUseId} calls=${[...parent.calls.keys()].join(',')}`);
  ok(`${label}: 상태 ${expect.status}`, s.status === expect.status, `${s.status} finished=${parent.finished.has(s.toolUseId)}`);
  if (expect.status === 'done') ok(`${label}: 끝 시각 = 부모 완료 신호 시각`, s.endedAt === parent.finished.get(s.toolUseId), `${s.endedAt} vs ${parent.finished.get(s.toolUseId)}`);
  const tr = w.transcript(s.key);
  const kinds = new Set(tr.items.map(i => i.kind));
  ok(`${label}: 정규화 항목 > 0 (${tr.items.length})`, tr.items.length > 0);
  ok(`${label}: user·tool·assistant 모두 있음`, kinds.has('user') && kinds.has('tool') && kinds.has('assistant'), [...kinds].join(','));
  const raw = fs.readFileSync(w.get(s.key).file, 'utf8'); const toolUses = (raw.match(/"type":"tool_use"/g) || []).length;
  ok(`${label}: 도구 횟수 = 기록의 tool_use 수 (${s.tools}/${toolUses})`, s.tools === toolUses);
  ok(`${label}: 무접촉(파일 크기·mtime 동일)`, snap([rec.recordPath, ...[...w.subs.values()].map(s => s.file)]) === before);
  return { w, parent, list };
}

// 1) 배경형 — 완료 신호는 <task-notification>. 없으면 running 으로 정직하게(이 검사는 둘 다 허용하되 근거를 찍는다)
{
  const sid = '2389e82c-ca46-4a88-8931-30e2630c8804'; const label = '클로드 배경형';
  const rec = { agent: 'claude', recordPath: path.join(PROJ, `${sid}.jsonl`), sessionId: sid };
  if (!fs.existsSync(rec.recordPath)) SKIP(label, '기록 없음');
  else {
    const raw = fs.readFileSync(rec.recordPath, 'utf8');
    const notified = /<task-notification>[\s\S]*?<tool-use-id>toolu_01NeJ6ge54VG9PuhQmgegfiK/.test(raw);
    const r = claudeCase(sid, label, { count: 1, toolUseId: 'toolu_01NeJ6ge54VG9PuhQmgegfiK', name: '실측 3건(Task 1~3) 수행', model: 'sonnet', status: notified ? 'done' : 'running' });
    if (r) ok(`${label}: 배경 실행 표식`, r.list.find(x => x.toolUseId === 'toolu_01NeJ6ge54VG9PuhQmgegfiK')?.background === true);
    console.log(`     (task-notification ${notified ? '있음 → done' : '없음 → running'})`);
  }
}
// 2) 동기형 — tool_result 가 완료
claudeCase('a47b7be8-fe5e-4e6f-b6be-a501206bdaab', '클로드 동기형', { count: 1, status: 'done' });

// 3) 코덱스 — parent_thread_id 로 자식 발견, task_complete 로 완료
{
  const label = '코덱스'; const dir = path.join(CODEX_HOME, 'sessions', '2026', '08', '31');
  const parentFile = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => path.join(dir, f)).find(f => f.endsWith('01a05783-c156-7ae1-95ed-a043773a6dff.jsonl')) : null;
  if (!parentFile) SKIP(label, '기록 없음');
  else {
    const rec = { agent: 'codex', recordPath: parentFile, sessionId: '01a05783-c156-7ae1-95ed-a043773a6dff' };
    const parent = new TranscriptTail(parentFile, 'codex'); parent.poll();
    const w = new SubagentWatcher(rec); w.scan(false, true);
    const before = snap([parentFile, ...[...w.subs.values()].map(s => s.file)]);
    w.poll(parent, false);
    const list = w.list();
    ok(`${label}: 자식 rollout 발견 ≥ 1 (${list.length})`, list.length >= 1);
    const s = list.find(x => /Pascal/.test(x.name)) || list[0]; if (s) {
      ok(`${label}: 별명 포함 이름`, /Pascal/.test(s.name), s.name);
      ok(`${label}: 모델(turn_context)`, !!s.model, s.model);
      ok(`${label}: 지시문 첫 줄 detail`, !!s.detail, s.detail);
      ok(`${label}: task_complete → done`, s.status === 'done', `${s.status} turnOpen=${w.get(s.key).tail.turnOpen}`);
      ok(`${label}: 끝 시각 = task_complete 시각`, !!s.endedAt && s.endedAt === w.get(s.key).tail.turnDoneAt);
      const tr = w.transcript(s.key); const kinds = new Set(tr.items.map(i => i.kind));
      ok(`${label}: 정규화 user·tool·assistant`, kinds.has('user') && kinds.has('tool') && kinds.has('assistant'), [...kinds].join(','));
    }
    ok(`${label}: 부모 spawn_agent 호출 기록됨 (${parent.calls.size})`, parent.calls.size >= 1);
    ok(`${label}: 무접촉`, snap([parentFile, ...[...w.subs.values()].map(s => s.file)]) === before);
  }
}
// 4) quiet 판정 — 완료 신호 없는 running 보조 + 부모 대기 + 60초 넘게 조용 → quiet (가짜 항목으로 판정 함수만)
{
  const w = new SubagentWatcher({ agent: 'claude', recordPath: 'x\\y.jsonl', sessionId: 'z' });
  const fake = { toolUseId: 'nope', lastAt: new Date(Date.now() - 120000).toISOString(), tail: { turnOpen: null } };
  ok('quiet: 부모 대기 + 조용 120초', w.judge(fake, { finished: new Map() }, false, Date.now()) === 'quiet');
  ok('running: 부모 작업 중이면 조용해도 running', w.judge(fake, { finished: new Map() }, true, Date.now()) === 'running');
}
// 5) 재개 판정(v2.40.2) — 배경 보조가 멈췄다(알림 1) 다시 일하면: 옛 알림으로는 완료가 아니고, 재개 뒤에 온 알림으로만 완료. 기록 파일이 자라면 poll()이 running으로 되돌린다.
{
  const w = new SubagentWatcher({ agent: 'claude', recordPath: 'x\\y.jsonl', sessionId: 'z' });
  const t0 = Date.now() - 30000, t1 = Date.now() - 10000;
  const fin = new Map([['tu1', new Date(t0).toISOString()]]);
  const sub = { key: 'k', toolUseId: 'tu1', lastAt: new Date().toISOString(), tail: { turnOpen: null } };
  ok('재개 전: 알림 있으면 done', w.judge(sub, { finished: fin }, false, Date.now()) === 'done');
  w.resume(sub, t1);
  ok('재개 뒤: 옛 알림(재개 전)으로는 done 아님', w.judge(sub, { finished: fin }, true, Date.now()) === 'running' && sub.status === 'running' && sub.endedAt === null && sub.resumes === 1);
  fin.set('tu1', new Date().toISOString());
  ok('재개 뒤: 새 알림(재개 후)으로 done', w.judge(sub, { finished: fin }, false, Date.now()) === 'done');
  // poll()의 재개 감지: 완료·소진 상태에서 파일이 자라면 running으로
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-sub-'));
  const f = path.join(dir, 'agent-r.jsonl'); fs.writeFileSync(f, '');
  const w2 = new SubagentWatcher({ agent: 'claude', recordPath: 'x\\y.jsonl', sessionId: 'z' });
  const s2 = { key: 'r', file: f, toolUseId: null, status: 'done', drained: true, doneSize: 0, endedAt: 'x', lastAt: null, tools: 0, items: 0, tail: { poll: () => [], items: [], tools: 0, lastT: null, firstT: null, turnOpen: null } };
  w2.subs.set('r', s2);
  w2.poll({ finished: new Map() }, true);
  ok('poll: 완료·소진 상태에서 파일이 그대로면 그대로 done', s2.status === 'done');
  fs.appendFileSync(f, '{"type":"assistant"}\n');
  w2.poll({ finished: new Map() }, true);
  ok('poll: 파일이 자라면 running으로 재개', s2.status === 'running' && s2.resumes === 1 && s2.drained === false);
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${fail ? 'FAIL' : 'OK'} — pass ${pass} · fail ${fail} · skip ${skip}`);
process.exit(fail ? 1 : 0);
