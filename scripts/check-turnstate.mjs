// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 차례 열림 판정(transcript.mjs turnState, v2.73) 검사 — 임시 폴더에 가짜 기록을 써서 읽는다. 실제 기록·프로세스 접촉 0.
//   1) 클로드: 요청만 → open · 도구 호출 뒤 → open · 도구 결과 뒤 → open · 답 글로 끝 → null · 질문 카드 → closed
//   2) 클로드: 답 글 뒤 생각(thinking)만 더 있어도 null(생각은 건너뜀)
//   3) 코덱스: task_started → open · task_complete → closed · 아무것도 없음 → null
//   4) 화면 판정 교차 확인 계약: sessions.mjs 가 '대기' 를 바쁨으로 되돌리는 조건은 (이전 상태 busy) ∧ (turnOpen === true) 뿐
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TranscriptTail } from '../daemon/transcript.mjs';

let fail = 0, pass = 0;
const ok = (name, cond, note = '') => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${note ? ' -> ' + note : ''}`); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-turnstate-'));
const write = (name, lines) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8'); return f; };
const T = '2026-09-21T00:00:00.000Z';
const user = (text) => ({ type: 'user', timestamp: T, message: { role: 'user', content: text } });
const toolUse = (id, name = 'Bash') => ({ type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input: { command: 'dir' } }] } });
const toolResult = (id) => ({ type: 'user', timestamp: T, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
const text = (s) => ({ type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'text', text: s }] } });
const thinking = () => ({ type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'thinking', thinking: '…' }] } });
const ask = () => ({ type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [{ question: '어느 쪽?' }] } }] } });
const claude = (name, lines) => { const t = new TranscriptTail(write(name, lines), 'claude'); t.poll(); return t.turnState(); };

try {
  // 1) 클로드
  ok('claude: 요청만 → open', claude('c1.jsonl', [user('해줘')]) === 'open');
  ok('claude: 도구 호출 뒤(결과 대기) → open', claude('c2.jsonl', [user('해줘'), toolUse('t1')]) === 'open');
  ok('claude: 도구 결과 뒤(모델 차례) → open', claude('c3.jsonl', [user('해줘'), toolUse('t1'), toolResult('t1')]) === 'open');
  ok('claude: 답 글로 끝 → null(단정 안 함)', claude('c4.jsonl', [user('해줘'), text('했습니다')]) === null);
  ok('claude: 중간 답 글 뒤 도구 호출 → open', claude('c5.jsonl', [user('해줘'), text('먼저 봅니다'), toolUse('t2')]) === 'open');
  ok('claude: 질문 카드 → closed(사람 차례)', claude('c6.jsonl', [user('해줘'), ask()]) === 'closed');
  ok('claude: 빈 기록 → null', claude('c7.jsonl', []) === null);
  // 2) 생각은 건너뜀
  ok('claude: 답 글 뒤 생각만 → null', claude('c8.jsonl', [user('해줘'), text('했습니다'), thinking()]) === null);
  ok('claude: 도구 결과 뒤 생각 → open', claude('c9.jsonl', [user('해줘'), toolUse('t1'), toolResult('t1'), thinking()]) === 'open');
  // 3) 코덱스
  const codex = (name, lines) => { const t = new TranscriptTail(write(name, lines), 'codex'); t.poll(); return t.turnState(); };
  ok('codex: task_started → open', codex('x1.jsonl', [{ type: 'event_msg', timestamp: T, payload: { type: 'task_started' } }]) === 'open');
  ok('codex: task_complete → closed', codex('x2.jsonl', [{ type: 'event_msg', timestamp: T, payload: { type: 'task_started' } }, { type: 'event_msg', timestamp: T, payload: { type: 'task_complete' } }]) === 'closed');
  ok('codex: 아무 신호 없음 → null', codex('x3.jsonl', [{ type: 'session_meta', timestamp: T, payload: {} }]) === null);
  // 4) sessions.mjs 계약(원문 검사): 되돌림 조건과 전환 로그가 들어 있다
  const src = fs.readFileSync(new URL('../daemon/sessions.mjs', import.meta.url), 'utf8');
  ok('sessions: 되돌림 조건 = idle ∧ 이전 busy ∧ turnOpen===true', /status === 'idle' && rec\.status === 'busy' && this\.hooks\.turnOpen\?\.\(id\) === true/.test(src));
  ok('sessions: 상태 전환을 로그에 남긴다', /status \$\{rec\.status\}→\$\{status\}/.test(src));
  const srv = fs.readFileSync(new URL('../daemon/server.mjs', import.meta.url), 'utf8');
  ok('server: turnOpen 훅이 tails 의 turnState 를 읽는다', /turnOpen: \(id\) => [\s\S]*turnState\(\)/.test(srv));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
