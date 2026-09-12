// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 대화 화면 "확인 카드"(구현계획 v2.43 → v2.50) 무접촉 검사 — CLI·프로세스 접촉 0.
//   1) parseApproval(): 터미널 화면 글자에서 대화상자 종류·제목·본문·질문·선택지·누를 키를 뽑는다
//      고정 화면은 2026-09-13 실측(클로드코드 2.1.269 · 코덱스 0.154.0, 시험 데몬 3459 + 실제 CLI)에서 그대로 옮겼다:
//      폴더 신뢰(번호 없음) · AskUserQuestion 단일(설명 줄) · 다중 선택+탭 · 답 검토 · Bash 승인 · 계획 승인 · 코덱스 신뢰 · 코덱스 편집 승인
//      + 옛 형식(상자 테두리 · (y/n) · 해석 실패 · 상태줄 제거 · 답변 본문의 번호 목록은 대화상자가 아님)
//   2) ATTENTION_RE: 위 화면이 모두 노란불이 되는지
//   3) SessionManager.idleCheck(): 노란불이면 rec.prompt 를 채우고 onPrompt 훅으로 알리며, 노란불이 꺼지면 지운다. 같은 내용이면 다시 알리지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseApproval } from '../daemon/approval.mjs';
import { SessionManager } from '../daemon/sessions.mjs';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); } };
const keys = (p) => p.options.map(o => o.key).join(',');
const labels = (p) => p.options.map(o => o.label).join(' | ');
const D = '─'.repeat(120);

// ---- 1) 파서: 2026-09-13 실측 화면 ----
const TRUST_2026 = [
  D, ' Accessing workspace:', ' C:\\Users\\User\\AppData\\Local\\Temp\\work',
  ' Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source',
  ' project, or work from your team). If not, take a moment to review what\'s in this folder first.',
  ' Claude Code\'ll be able to read, edit, and execute files here.', ' Security guide',
  ' ❯ No, exit', '   Yes, I trust this folder', ' Enter to confirm · Esc to cancel'].join('\n');
{
  const p = parseApproval(TRUST_2026);
  ok(p.kind === 'choice' && p.dialog === 'trust', '폴더 신뢰(번호 없음) = choice/trust', `${p.kind}/${p.dialog}`);
  ok(labels(p) === 'No, exit | Yes, I trust this folder', '폴더 신뢰 선택지 2개', labels(p));
  ok(p.options[0].selected && p.options[0].key === '\r', '폴더 신뢰 기본 선택 = No, exit → Enter', JSON.stringify(p.options[0]));
  ok(p.options[1].key === '\x1b[B\r' && p.options[1].hotkey === '', '폴더 신뢰 "Yes" 키 = ↓ + Enter (숫자 없음)', JSON.stringify(p.options[1].key));
  ok(/Quick safety check/.test(p.body) && !/Security guide|Enter to confirm/.test(p.body), '폴더 신뢰 본문 = 안내 글, 상태줄 제외', JSON.stringify(p.body));
}
const ASK_SINGLE = ['  select). After I answer, reply with only the chosen color, then stop.', D, ' ☐ Color', 'Which color?', '❯ 1. Red', '     The color red', '  2. Blue', '     The color blue', '  3. Green', '     The color green', '  4. Type something.', D, '  5. Chat about this', 'Enter to select · ↑/↓ to navigate · Esc to cancel'].join('\n');
{
  const p = parseApproval(ASK_SINGLE);
  ok(p.kind === 'choice' && p.dialog === 'ask', 'AskUserQuestion 단일 = choice/ask', `${p.kind}/${p.dialog}`);
  ok(keys(p) === '1,2,3,4,5', 'AskUserQuestion 키 1~5 (가로줄 아래 "Chat about this" 포함)', keys(p));
  ok(p.question === 'Which color?', 'AskUserQuestion 질문 줄', p.question);
  ok(p.options[0].desc === 'The color red' && p.options[1].label === 'Blue', 'AskUserQuestion 설명 줄이 desc 로', JSON.stringify(p.options[0]));
  ok(p.tabs && p.tabs.length === 1 && p.tabs[0].label === 'Color' && !p.tabs[0].done, 'AskUserQuestion 머리 칩 ☐ Color', JSON.stringify(p.tabs));
  ok(!p.multi && p.actions.length === 0, 'AskUserQuestion 단일 = 다중 아님, 행동 없음');
  ok(!/select\)\. After I answer/.test(p.body + p.question), 'AskUserQuestion 가로줄 위 대화 기록은 제외', JSON.stringify(p.body));
}
const ASK_MULTI = [D, '←  ☒ Color  ☐ Fruit  ✔ Submit  →', 'Which fruits?', '❯ 1. [ ] Apple', '  Apple fruit', '  2. [✔] Pear', '  Pear fruit', '  3. [ ] Plum', '  Plum fruit', '  4. [ ] Type something', '     Submit', D, '  5. Chat about this', 'Enter to select · Tab/Arrow keys to navigate · Esc to cancel'].join('\n');
{
  const p = parseApproval(ASK_MULTI);
  ok(p.kind === 'choice' && p.dialog === 'ask' && p.multi, 'AskUserQuestion 다중 선택 = choice/ask/multi', `${p.kind}/${p.dialog}/${p.multi}`);
  ok(keys(p) === '1,2,3,4,5', '다중 선택 키 1~5', keys(p));
  ok(p.options[0].checked === false && p.options[1].checked === true && p.options[4].checked === null, '다중 선택 체크 상태 [ ]/[✔], "Chat about this"는 체크 없음', JSON.stringify(p.options.map(o => o.checked)));
  ok(p.tabs && p.tabs.map(t => `${t.label}:${t.done}`).join(',') === 'Color:true,Fruit:false', '머리 칩 ☒ Color ☐ Fruit', JSON.stringify(p.tabs));
  ok(p.actions.length === 1 && p.actions[0].key === '\t', '다중 선택 행동 = 선택 완료(Tab)', JSON.stringify(p.actions));
  ok(p.question === 'Which fruits?', '다중 선택 질문 줄', p.question);
}
const REVIEW = [D, '←  ☒ Color  ☒ Fruit  ✔ Submit  →', 'Review your answers', ' ● Which color?', '   → Blue', ' ● Which fruits?', '   → Apple', 'Ready to submit your answers?', '❯ 1. Submit answers', '  2. Cancel'].join('\n');
{
  const p = parseApproval(REVIEW);
  ok(p.kind === 'choice' && keys(p) === '1,2' && labels(p) === 'Submit answers | Cancel', '답 검토 화면 = 1 Submit / 2 Cancel', `${p.kind} ${labels(p)}`);
  ok(p.question === 'Ready to submit your answers?' && /→ Blue[\s\S]*→ Apple/.test(p.body), '답 검토 질문·본문(고른 답)', JSON.stringify([p.question, p.body]));
}
const BASH_2026 = ['  Running Node.js to output 41+1', '  ⎿  $ node -e "console.log(41+1)"', D, ' Bash command', '   node -e "console.log(41+1)"', '   Run Node.js to output 41+1', ' This command requires approval', ' Do you want to proceed?', ' ❯ 1. Yes', '   2. Yes, and don’t ask again for: node *', '   3. No', ' Esc to cancel · Tab to amend'].join('\n');
{
  const p = parseApproval(BASH_2026);
  ok(p.kind === 'choice' && p.dialog === 'permission', 'Bash 승인(2.1.269) = choice/permission', `${p.kind}/${p.dialog}`);
  ok(p.title === 'Bash command' && p.question === 'Do you want to proceed?', 'Bash 승인 제목·질문', JSON.stringify([p.title, p.question]));
  ok(/^node -e "console.log\(41\+1\)"/.test(p.body) && !/Running Node\.js|⎿/.test(p.body), 'Bash 승인 본문 = 명령·설명(가로줄 위 기록 제외)', JSON.stringify(p.body));
  ok(keys(p) === '1,2,3' && p.options[0].selected, 'Bash 승인 키 1,2,3 · ❯ = 1', keys(p));
}
const PLAN = ['● Updated plan', '  ⎿  /plan to preview', '▔'.repeat(120), '  ' + '─'.repeat(116), '   Ready to code?', '   Here is Claude\'s plan:', '  ' + '╌'.repeat(116), '   Context', '   User wants a simple test file created.', '   Plan', '   Create hello.txt in the working directory with the content hi.', '  ' + '╌'.repeat(116), '  ' + '─'.repeat(116),
  '   Claude has written up a plan and is ready to execute. Would you like to proceed?', '   ❯ 1. Yes, auto-accept edits', '     2. Yes, manually approve edits', '     3. Tell Claude what to change', '        shift+tab to approve with this feedback', '   ctrl+g to edit in Notepad · C:\\IRIS\\_agent\\claude\\plans\\iris-face-foamy-meadow.md'].join('\n');
{
  const p = parseApproval(PLAN);
  ok(p.kind === 'choice' && p.dialog === 'plan', '계획 승인 = choice/plan', `${p.kind}/${p.dialog}`);
  ok(keys(p) === '1,2,3' && labels(p).startsWith('Yes, auto-accept edits | Yes, manually approve edits | Tell Claude'), '계획 승인 키 1,2,3 (안내줄 shift+tab·ctrl+g 제외)', labels(p));
  ok(/Create hello\.txt/.test(p.body) && p.title === 'Here is Claude\'s plan:', '계획 승인 본문 = 계획 내용까지 위로 확장', JSON.stringify([p.title, p.body]));
}
const CODEX_TRUST = ['> You are in C:\\Users\\User\\AppData\\Local\\Temp\\work', '  Do you trust the contents of this directory? Working with untrusted contents comes with higher risk of prompt', '  injection. Trusting the directory allows project-local config, hooks, and exec policies to load.', '› 1. Yes, continue', '  2. No, quit', '  Press enter to continue'].join('\n');
{
  const p = parseApproval(CODEX_TRUST);
  ok(p.kind === 'choice' && p.dialog === 'trust' && keys(p) === '1,2', '코덱스 폴더 신뢰 = choice/trust 1,2 ("Press enter to continue" 제외)', `${p.kind}/${p.dialog} ${keys(p)}`);
  ok(/Do you trust the contents/.test(p.body) && !/You are in/.test(p.body), '코덱스 신뢰 본문 = 물음부터', JSON.stringify(p.body));
}
const CODEX_EDIT = ['• Added note2.txt (+1 -0)', '    1 +hi', '  Would you like to make the following edits?', '  Description: Apply proposed file edits', '  Destination:', '  C:\\work\\note2.txt', '› 1. Yes, proceed (y)', '  2. Yes, and don\'t ask again for these files (a)', '  3. No, and tell Codex what to do differently (esc)'].join('\n');
{
  const p = parseApproval(CODEX_EDIT);
  ok(p.kind === 'choice' && p.dialog === 'permission' && keys(p) === '1,2,3', '코덱스 편집 승인(0.154) = choice/permission 1,2,3 (숫자 키 실측 OK)', `${p.kind}/${p.dialog} ${keys(p)}`);
  ok(p.question === 'Would you like to make the following edits?' && /Description: Apply proposed file edits[\s\S]*note2\.txt/.test(p.body), '코덱스 편집 승인 질문·본문(Description·Destination 유지)', JSON.stringify([p.question, p.body]));
  ok(p.options[0].label === 'Yes, proceed (y)' && p.options[0].selected, '코덱스 편집 승인 1번 문구·› 선택', p.options[0].label);
}

// ---- 1b) 옛 형식·경계 ----
const CLAUDE_BASH_BOX = [
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
  const p = parseApproval(CLAUDE_BASH_BOX);
  ok(p.kind === 'choice' && keys(p) === '1,2,3', '옛 상자형 Bash 승인 키 1,2,3', keys(p));
  ok(p.options[2].label === 'No, and tell Claude what to do differently (esc)', '옛 상자형 3번 문구 보존', p.options[2].label);
  ok(/npm install/.test(p.body) && !/│|╭|╰/.test(p.body + p.question), '옛 상자형 본문 = 상자 안 글, 테두리 없음', JSON.stringify(p.body));
}
const CODEX_OLD = ['Would you like to run the following command?', '', '  $ git status', '', '› Yes (y)', '  Yes, and don\'t ask again for this session (a)', '  No, and tell Codex what to do differently (esc)'].join('\n');
{
  const p = parseApproval(CODEX_OLD);
  ok(p.kind === 'choice' && keys(p) === 'y,a,\x1b', '옛 코덱스 글자 키 승인 y,a,ESC', JSON.stringify(keys(p)));
  ok(/git status/.test(p.body), '옛 코덱스 본문에 명령 포함', JSON.stringify(p.body));
}
{
  const p = parseApproval('Overwrite existing file config.json? (y/n)');
  ok(p.kind === 'yn' && keys(p) === 'y,n' && /Overwrite/.test(p.question), '(y/n) 물음 = yn, 키 y,n', `${p.kind} ${keys(p)}`);
}
{
  const p = parseApproval(['Hooks need review', 'Some hook definitions changed since you last reviewed them.', 'Press enter to review hooks'].join('\n'));
  ok(p.kind === 'raw' && keys(p) === '\r,\x1b' && /Press enter to review hooks/.test(p.question), '알 수 없는 형식 = raw, Enter/Esc, 원문', p.kind);
}
{
  const p = parseApproval(BASH_2026 + '\n  ⏵⏵ bypass permissions on (shift+tab to cycle)');
  ok(keys(p) === '1,2,3' && !/bypass permissions/.test(p.body + p.question), '상태줄(⏵⏵ bypass…)은 어디에도 없음', labels(p));
}
{
  const p = parseApproval('1. 첫째 할 일\n2. 둘째 할 일\n\n작업을 마쳤습니다.\n❯ ');
  ok(p.kind === 'raw', '답변 본문의 번호 목록 + 빈 프롬프트는 대화상자가 아님(raw)', p.kind);
}
{
  const p = parseApproval('');
  ok(p.kind === 'raw' && p.question === '', '빈 화면 = raw, 빈 질문');
}

// ---- 2) 노란불 판정: 실측 화면이 모두 attention 인지 (ATTENTION_RE 는 sessions.mjs 내부 → idleCheck 로 확인) ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-approval-'));
class FakePty { constructor() { this.pid = 41000; this.cols = 120; this.rows = 40; this.written = ''; } onData(f) { this.emit = f; } onExit() {} write(d) { this.written += d; } resize() {} kill() {} }
const prompts = [];
const sm = new SessionManager(dir, { onPrompt: (id, p) => prompts.push({ id, p }), onLog: () => {} });
const rec = { id: 'a1', cwd: process.cwd(), agent: 'claude', model: 'fable', effort: 'high', status: 'busy', pid: 41000 };
sm.sessions.set('a1', rec);
const pty = new FakePty();
sm.wire('a1', rec, pty, 120, 40, '');
const st = sm.live.get('a1');
const show = async (text) => { st.screen.reset(); st.screen.write('\x1b[2J\x1b[H' + text.replace(/\n/g, '\r\n')); await new Promise(r => setTimeout(r, 30)); sm.idleCheck('a1'); };
for (const [name, text, want] of [
  ['폴더 신뢰(번호 없음)', TRUST_2026, 'trust'], ['AskUserQuestion 단일', ASK_SINGLE, 'ask'], ['AskUserQuestion 다중', ASK_MULTI, 'ask'], ['답 검토(❯ 1. Submit answers)', REVIEW, 'review'],
  ['Bash 승인', BASH_2026, 'permission'], ['계획 승인', PLAN, 'plan'], ['코덱스 신뢰', CODEX_TRUST, 'trust'], ['코덱스 편집 승인', CODEX_EDIT, 'permission'],
]) {
  await show(text);
  ok(rec.status === 'attention' && rec.prompt?.dialog === want, `idleCheck: ${name} → 노란불 + prompt.dialog=${want}`, `${rec.status} ${rec.prompt?.dialog}`);
}
// ---- 3) idleCheck → rec.prompt · onPrompt 방송 규칙 ----
prompts.length = 0;
await show(BASH_2026);
ok(rec.status === 'attention' && rec.prompt && keys(rec.prompt) === '1,2,3', 'idleCheck: rec.prompt 채움(1,2,3)', JSON.stringify(rec.prompt?.options));
ok(prompts.length === 1 && prompts[0].id === 'a1' && prompts[0].p?.kind === 'choice', 'idleCheck: onPrompt 1회 방송', String(prompts.length));
sm.idleCheck('a1');
ok(prompts.length === 1, 'idleCheck: 같은 화면이면 다시 방송하지 않음', String(prompts.length));
await show('❯ ');
ok(rec.status === 'idle' && rec.prompt == null, 'idleCheck: 빈 프롬프트로 돌아오면 대기 + prompt 비움', `${rec.status} ${JSON.stringify(rec.prompt)}`);
ok(prompts.length === 2 && prompts[1].p === null, 'idleCheck: prompt 비움도 방송(null)', String(prompts.length));
// 40줄 창: 대화상자보다 위의 긴 기록이 있어도 선택지·질문을 찾는다
await show(Array.from({ length: 20 }, (_, i) => `● 기록 줄 ${i + 1}`).join('\n') + '\n' + ASK_SINGLE);
ok(rec.status === 'attention' && rec.prompt?.dialog === 'ask' && keys(rec.prompt) === '1,2,3,4,5', 'idleCheck: 긴 기록 아래 AskUserQuestion 도 파싱(40줄 창)', `${rec.status} ${rec.prompt?.dialog} ${rec.prompt && keys(rec.prompt)}`);
sm.live.delete('a1');
try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

console.log(`\n${fail === 0 ? 'OK' : 'FAILED'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
