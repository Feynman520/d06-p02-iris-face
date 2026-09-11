// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 대화 화면 "확인 카드"(구현계획 v2.43) 무접촉 검사 — CLI·프로세스 접촉 0.
//   1) parseApproval(): 터미널 화면 글자에서 질문·선택지·누를 키를 뽑는다
//      클로드코드 3지선다 · 폴더 신뢰 물음 · 코덱스 승인(글자 키) · (y/n) · 해석 실패(원문+Enter/Esc) · 상자 테두리 제거 · 상태줄 제거
//   2) SessionManager.idleCheck(): 노란불이면 rec.prompt 를 채우고 onPrompt 훅으로 알리며, 노란불이 꺼지면 지운다. 같은 내용이면 다시 알리지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseApproval } from '../daemon/approval.mjs';
import { SessionManager } from '../daemon/sessions.mjs';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); } };
const keys = (p) => p.options.map(o => o.key).join(',');
const labels = (p) => p.options.map(o => o.label).join(' | ');

// ---- 1) 파서 ----
const CLAUDE_BASH = [
  '╭──────────────────────────────────────────────────────────────╮',
  '│ Bash command                                                 │',
  '│                                                              │',
  '│   npm install                                                │',
  '│   Install dependencies                                       │',
  '│                                                              │',
  '│ Do you want to proceed?                                      │',
  '│ ❯ 1. Yes                                                     │',
  '│   2. Yes, and don\'t ask again for npm install in this folder │',
  '│   3. No, and tell Claude what to do differently (esc)        │',
  '╰──────────────────────────────────────────────────────────────╯',
].join('\n');
{
  const p = parseApproval(CLAUDE_BASH);
  ok(p.kind === 'choice', '클로드 Bash 승인 = choice', p.kind);
  ok(keys(p) === '1,2,3', '클로드 Bash 승인 키 1,2,3', keys(p));
  ok(p.options[0].selected && !p.options[1].selected, '클로드 Bash 승인 ❯ 선택 = 1번');
  ok(p.options[2].label === 'No, and tell Claude what to do differently (esc)', '클로드 Bash 승인 3번 문구 보존', p.options[2].label);
  ok(/Bash command[\s\S]*npm install[\s\S]*Do you want to proceed\?/.test(p.question) && !/│|╭|╰/.test(p.question), '클로드 Bash 승인 질문 = 상자 안 글, 테두리 없음', JSON.stringify(p.question));
}
const TRUST = [
  ' Do you trust the files in this folder?',
  '',
  ' C:\\work\\proj',
  '',
  ' ❯ 1. Yes, proceed',
  '   2. No, exit',
  '',
  ' Enter to confirm · Esc to cancel',
].join('\n');
{
  const p = parseApproval(TRUST);
  ok(p.kind === 'choice' && keys(p) === '1,2', '폴더 신뢰 물음 키 1,2', keys(p));
  ok(/trust the files/.test(p.question) && /C:\\work\\proj/.test(p.question), '폴더 신뢰 물음 질문에 경로 포함', JSON.stringify(p.question));
  ok(!/Enter to confirm/.test(p.question), '선택지 아래 안내줄은 질문에 넣지 않음', JSON.stringify(p.question));
}
const CODEX = [
  'Would you like to run the following command?',
  '',
  '  $ git status',
  '',
  '› Yes (y)',
  '  Yes, and don\'t ask again for this session (a)',
  '  No, and tell Codex what to do differently (esc)',
].join('\n');
{
  const p = parseApproval(CODEX);
  ok(p.kind === 'choice', '코덱스 승인 = choice', p.kind);
  ok(keys(p) === 'y,a,\x1b', '코덱스 승인 키 y,a,ESC', JSON.stringify(keys(p)));
  ok(p.options[0].selected, '코덱스 승인 › 선택 = 첫째');
  ok(/git status/.test(p.question), '코덱스 승인 질문에 명령 포함', JSON.stringify(p.question));
}
const YN = 'Overwrite existing file config.json? (y/n)';
{
  const p = parseApproval(YN);
  ok(p.kind === 'yn' && keys(p) === 'y,n', '(y/n) 물음 = yn, 키 y,n', `${p.kind} ${keys(p)}`);
  ok(/Overwrite/.test(p.question), '(y/n) 질문 본문', JSON.stringify(p.question));
}
const RAW = [
  'Hooks need review',
  'Some hook definitions changed since you last reviewed them.',
  'Press enter to review hooks',
].join('\n');
{
  const p = parseApproval(RAW);
  ok(p.kind === 'raw', '알 수 없는 형식 = raw', p.kind);
  ok(keys(p) === '\r,\x1b', 'raw 키 = Enter, Esc', JSON.stringify(keys(p)));
  ok(/Press enter to review hooks/.test(p.question), 'raw 질문 = 원문', JSON.stringify(p.question));
}
{
  const withStatus = CLAUDE_BASH + '\n  ⏵⏵ bypass permissions on (shift+tab to cycle)';
  const p = parseApproval(withStatus);
  ok(keys(p) === '1,2,3' && !/bypass permissions/.test(p.question), '상태줄(⏵⏵ bypass…)은 선택지·질문 어디에도 없음', labels(p));
}
{
  // 답변 본문에 번호 목록이 있어도 선택지로 오인하지 않게: 노란불 판정(ATTENTION_RE)이 먼저이므로 파서는 "맨 아래 연속 블록"만 본다
  const p = parseApproval('1. 첫째 할 일\n2. 둘째 할 일\n\n작업을 마쳤습니다.\n❯ ');
  ok(p.kind === 'raw', '선택지 블록이 맨 아래에 없으면 raw', p.kind);
}
{
  const p = parseApproval('');
  ok(p.kind === 'raw' && p.question === '', '빈 화면 = raw, 빈 질문');
}

// ---- 2) idleCheck → rec.prompt · onPrompt ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-approval-'));
class FakePty { constructor() { this.pid = 41000; this.cols = 100; this.rows = 30; this.written = ''; } onData(f) { this.emit = f; } onExit() {} write(d) { this.written += d; } resize() {} kill() {} }
const prompts = [];
const sm = new SessionManager(dir, { onPrompt: (id, p) => prompts.push({ id, p }), onLog: () => {} });
const rec = { id: 'a1', cwd: process.cwd(), agent: 'claude', model: 'fable', effort: 'high', status: 'busy', pid: 41000 };
sm.sessions.set('a1', rec);
const pty = new FakePty();
sm.wire('a1', rec, pty, 100, 30, '');
const st = sm.live.get('a1');
const show = (text) => { st.screen.reset(); st.screen.write('\x1b[2J\x1b[H' + text.replace(/\n/g, '\r\n')); };
show(CLAUDE_BASH.replace(/[│╭╮╰╯─]/g, ' ')); // 헤드리스 화면에 상자 없이 그린다(글자 배치만 확인)
await new Promise(r => setTimeout(r, 30));
sm.idleCheck('a1');
ok(rec.status === 'attention', 'idleCheck: 승인 화면이면 노란불', rec.status);
ok(rec.prompt && rec.prompt.kind === 'choice' && keys(rec.prompt) === '1,2,3', 'idleCheck: rec.prompt 채움(1,2,3)', JSON.stringify(rec.prompt));
ok(prompts.length === 1 && prompts[0].id === 'a1' && prompts[0].p?.kind === 'choice', 'idleCheck: onPrompt 1회 방송', String(prompts.length));
sm.idleCheck('a1');
ok(prompts.length === 1, 'idleCheck: 같은 화면이면 다시 방송하지 않음', String(prompts.length));
show('❯ ');
await new Promise(r => setTimeout(r, 30));
sm.idleCheck('a1');
ok(rec.status === 'idle' && rec.prompt == null, 'idleCheck: 빈 프롬프트로 돌아오면 대기 + prompt 비움', `${rec.status} ${JSON.stringify(rec.prompt)}`);
ok(prompts.length === 2 && prompts[1].p === null, 'idleCheck: prompt 비움도 방송(null)', String(prompts.length));
sm.live.delete('a1');
try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

console.log(`\n${fail === 0 ? 'OK' : 'FAILED'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
