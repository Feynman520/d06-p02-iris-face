// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// Esc 중단 표시 + 배경 작업 표시(v2.80, 2026-10-07 사용자 신고 2건) 검사. 실제 기록·데몬·CLI 접촉 0(임시 폴더의 가짜 기록만).
//   1) Esc: 클로드 "[Request interrupted by user]"(글·도구 결과) → interrupt 항목 · turnState 'closed'(예전엔 'open' → 진행 중으로 굳음)
//      코덱스 turn_aborted → interrupt · turnState 'closed' · 글 속 인용은 중단으로 안 봄
//   2) 배경 작업: 배경 명령(run_in_background·자동 배경)·감시 시작 → 남은 일 · 같은 task-id 알림/TaskStop/감시 만료 → 끝
//      지금 CLI 프로세스보다 먼저 시작한 일은 셈하지 않음 · 감시 만료 시각·24시간 안전판 · 상태 없는 감시 이벤트는 끝이 아님
//      한 글에 알림 여러 개(상태 없는 감시 이벤트 + 상태 있는 알림)여도 짝이 섞이지 않음
//   3) 데몬·화면 연결(원문 검사): procAt · {type:'bg'} 방송·hello.bg · viewStatus 가 배경 작업이면 delegated · 알림 보류에 배경 작업 포함
//   4) 화면(playwright 있을 때): 중단 줄 1개(연달아 온 표식은 한 줄)·진행 중 차례가 접힘
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { TranscriptTail } from '../daemon/transcript.mjs';

let fail = 0, pass = 0;
const ok = (name, cond, note = '') => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${note ? ' -> ' + note : ''}`); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-bgwork-'));
const write = (name, lines) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8'); return f; };
const at = (min) => new Date(Date.UTC(2026, 9, 7, 3, min)).toISOString();
const T0 = Date.UTC(2026, 9, 7, 3, 0);
const user = (content, t = at(0)) => ({ type: 'user', timestamp: t, message: { role: 'user', content } });
const text = (s, t = at(0)) => ({ type: 'assistant', timestamp: t, message: { role: 'assistant', content: [{ type: 'text', text: s }] } });
const use = (id, name, input, t = at(0)) => ({ type: 'assistant', timestamp: t, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, content, t = at(0), extra = {}) => ({ type: 'user', timestamp: t, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, ...extra }] } });
const tn = (taskId, summary, status = 'completed') => `<task-notification>\n<task-id>${taskId}</task-id>\n<tool-use-id>toolu_z</tool-use-id>\n${status ? `<status>${status}</status>\n` : ''}<summary>${summary}</summary>\n</task-notification>`;
const claude = (name, lines) => { const t = new TranscriptTail(write(name, lines), 'claude'); t.poll(); return t; };
const ids = (l) => l.map(b => b.id).sort().join(',');

try {
  // 1) Esc
  let t = claude('e1.jsonl', [user('해줘'), text('보는 중'), user([{ type: 'text', text: '[Request interrupted by user]' }])]);
  ok('esc(클로드 글): interrupt 항목', t.items.at(-1)?.kind === 'interrupt', t.items.map(i => i.kind).join(','));
  ok('esc(클로드 글): turnState closed', t.turnState() === 'closed', String(t.turnState()));
  ok('esc(클로드 글): 사용자 말풍선으로 안 보임', !t.items.some(i => i.kind === 'user' && /interrupted/.test(i.text)));
  t = claude('e2.jsonl', [user('해줘'), use('b1', 'Bash', { command: 'sleep 99' }), result('b1', '[Request interrupted by user for tool use]', at(0), { is_error: true }), user([{ type: 'text', text: '[Request interrupted by user for tool use]' }])]);
  ok('esc(도구 실행 중): interrupt 항목·turnState closed', t.items.filter(i => i.kind === 'interrupt').length === 2 && t.turnState() === 'closed', t.items.map(i => i.kind).join(','));
  t = claude('e3.jsonl', [user('이 문구 "[Request interrupted by user]" 가 뭐야?')]);
  ok('esc: 글 속 인용은 요청 그대로', t.items[0]?.kind === 'user' && t.turnState() === 'open');
  t = claude('e4.jsonl', [user('해줘'), text('중단'), user('[Request interrupted by user]'), user('다시 해줘')]);
  ok('esc 뒤 새 요청 → open', t.turnState() === 'open');
  const cx = new TranscriptTail(write('x1.jsonl', [{ type: 'event_msg', timestamp: at(0), payload: { type: 'task_started' } }, { type: 'event_msg', timestamp: at(1), payload: { type: 'turn_aborted', reason: 'interrupted' } }]), 'codex'); cx.poll();
  ok('esc(코덱스 turn_aborted): interrupt · closed', cx.items.at(-1)?.kind === 'interrupt' && cx.turnState() === 'closed', String(cx.turnState()));

  // 2) 배경 작업
  const base = [user('해줘', at(0)),
    use('b1', 'Bash', { command: 'sleep 560', description: '10분 알람', run_in_background: true }, at(1)),
    result('b1', 'Command running in background with ID: bg111. Output is being written to: x', at(1)),
    use('b2', 'Bash', { command: 'codex exec ...', description: '코덱스에 원고 비판 맡김' }, at(2)),
    result('b2', 'Command did not complete within its 120s timeout and was moved to the background (ID: bg222). Output is being written to: y', at(4)),
    use('m1', 'Monitor', { command: 'tail -f log', description: '결과 도착 감시', timeout_ms: 600000 }, at(5)),
    result('m1', 'Monitor started (task mon333, expires in 10m unless the source ends first; you get one notification per event)', at(5)),
    text('맡겨 두고 기다립니다', at(6))];
  t = claude('b1.jsonl', base);
  let now = T0 + 7 * 60000;
  let pend = t.backgroundPending(0, now);
  ok('배경: 시작 3개(배경 명령·자동 배경·감시)', ids(pend) === 'bg111,bg222,mon333', ids(pend));
  ok('배경: 설명을 도구 입력에서 가져옴', pend.find(b => b.id === 'bg222')?.desc === '코덱스에 원고 비판 맡김' && pend.find(b => b.id === 'mon333')?.kind === 'monitor');
  ok('배경: 답 글로 끝나도 turnState 는 null(메인은 대기 가능)', t.turnState() === null);
  ok('배경: 이 프로세스 시작(4분) 전 일은 셈 안 함', ids(t.backgroundPending(T0 + 4 * 60000 + 1, now)) === 'mon333', ids(t.backgroundPending(T0 + 4 * 60000 + 1, now)));
  ok('배경: 감시는 만료(5+10분)+1분 뒤 끝', ids(t.backgroundPending(0, T0 + 16 * 60000 + 1)) === 'bg111,bg222');
  ok('배경: 배경 명령은 24시간 안전판', ids(t.backgroundPending(0, T0 + 25 * 3600000)) === '');

  t = claude('b2.jsonl', [...base,
    user(tn('mon333', 'Monitor event: "결과 도착 감시"', null), at(7)),        // 상태 없는 감시 이벤트 = 끝 아님
    user(tn('bg111', 'Background command "10분 알람" completed (exit code 0)'), at(8)),
    use('k1', 'TaskStop', { task_id: 'bg222' }, at(9)), result('k1', 'Stopped task bg222', at(9))]);
  pend = t.backgroundPending(0, T0 + 9 * 60000);
  ok('배경: 알림(완료)·TaskStop 은 끝, 감시 이벤트는 끝 아님', ids(pend) === 'mon333', ids(pend));
  t = claude('b3.jsonl', [...base, user(tn('mon333', 'Monitor event: "결과 도착 감시"', null).replace('</summary>', '</summary>\n<event>[Monitor expired after 10m with 1 event delivered. Re-arm it if you still need the watch.]</event>'), at(8))]);
  ok('배경: 감시 만료 이벤트 = 끝', !t.backgroundPending(0, T0 + 9 * 60000).some(b => b.id === 'mon333'));
  // 한 글에 상태 없는 감시 이벤트 + 상태 있는 알림: 옛 정규식은 mon333 을 끝낸 것으로 잘못 짝지었다
  t = claude('b4.jsonl', [...base, user(tn('mon333', 'Monitor event: "결과"', null) + '\n' + tn('bg111', 'Background command "알람" completed'), at(8))]);
  pend = t.backgroundPending(0, T0 + 9 * 60000);
  ok('배경: 여러 알림이 한 글이어도 짝이 섞이지 않음', ids(pend) === 'bg222,mon333', ids(pend));
  // 작업 도중 흡수된 알림(queue-operation)도 끝 신호로 읽는다
  t = claude('b5.jsonl', [...base, { type: 'queue-operation', operation: 'enqueue', timestamp: at(8), content: tn('bg222', 'Background command "코덱스" completed') }]);
  ok('배경: 흡수된 알림(queue-operation)도 끝', !t.backgroundPending(0, T0 + 9 * 60000).some(b => b.id === 'bg222'));
  ok('배경: 결과가 온 도구 입력은 지움(쌓이지 않음)', t.toolIn.size === 0, String(t.toolIn.size));

  // 3) 연결(원문 검사)
  const src = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const ses = src('daemon/sessions.mjs'), srv = src('daemon/server.mjs'), main = src('app/main.js');
  ok('sessions: CLI 프로세스 시작 시각 procAt', /procAt: Date\.now\(\)/.test(ses));
  ok('server: bgFor 가 procAt 이후만 센다', /backgroundPending\(st\.procAt \|\| 0\)/.test(srv));
  ok("server: {type:'bg'} 방송 + hello.bg", /broadcast\(\{ type: 'bg', id: rec\.id, list \}\)/.test(srv) && /bg: allBg\(\)/.test(srv));
  ok('화면: 배경 작업이면 delegated(파란 도는 고리)', /\(SubPanel\.running\(s\.id\) \|\| bgN\(s\.id\)\) \? 'delegated'/.test(main));
  ok('화면: 완료 알림 보류에 배경 작업 포함', /Notify\.onStatus\(m, s, liveN\(m\.id\)\)/.test(main) && /m\.type === 'bg'[\s\S]{0,200}Notify\.onSubs\(m\.id, liveN\(m\.id\)/.test(main));
  ok('화면: hello 에서 배경 목록을 받는다', /bgMap\.clear\(\); if \(m\.bg\)/.test(main));
  // v2.81: 무엇이 몇 분째 도는지 — 툴팁·대화 아래 띠(메인 idle 일 때만), 버튼 없음
  const html = src('app/index.html'), css = src('app/style.css');
  const bar = (main.match(/function renderBgBar[\s\S]*?\n  \}/) || [''])[0];
  ok('v2.81: bgLines = 종류 · 설명(없으면 id) · N분째', /const bgLines = [\s\S]{0,300}'감시' : '배경 명령'[\s\S]{0,40}b\.desc \|\| b\.id[\s\S]{0,20}분째/.test(main));
  ok('v2.81: 띠는 메인 idle 일 때만', /s && s\.status === 'idle' \? bgLines\(s\.id\) : \[\]/.test(bar));
  ok('v2.81: 띠에 버튼·종료 호출 없음', bar && !/<button|TaskStop|kill|api\(/i.test(bar), bar.slice(0, 80));
  ok('v2.81: 띠 글은 esc 를 거친다', /esc\(l\)/.test(bar));
  ok('v2.81: renderHead·render 가 띠를 갱신(미리보기면 숨김)', /renderBgBar\(s\);/.test(main) && /else renderBgBar\(null\)/.test(main));
  ok('v2.81: 30초마다 N분째 갱신', /setInterval\(\(\) => \{ const s = cur\(\); if \(s && bgN\(s\.id\)\)/.test(main));
  ok('v2.81: 툴팁에 배경 줄', /\.\.\.bgLines\(s\.id\)\]\.join\('\\n'\)\)/.test(main) && /\.\.\.bgLines\(s\.id\)\]\.join\('\\n'\);/.test(main));
  ok('v2.81: index #bg-bar · 터미널 모드에서 숨김', /id="bg-bar" class="bg-bar" hidden/.test(html) && /#view\[data-mode="term"\] \.bg-bar \{ display: none; \}/.test(css));

  // 4) 화면
  const req = createRequire(import.meta.url);
  let pw = null;
  for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
  if (!pw) console.log('SKIP renderer: playwright 없음');
  else {
    const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
    const file = (f) => fs.readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8').replace(/<\/script>/gi, '<\\/script>');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html><body><script>${file('icons.js')}</script><script>${file('transcript.js')}</script></body></html>`);
      const r = await page.evaluate(() => {
        const T = '2026-10-07T03:00:00.000Z';
        const el = document.createElement('div'); document.body.appendChild(el); const tr = window.Transcript.create(); tr.mount(el);
        tr.render([{ i: 1, t: T, kind: 'user', text: '해줘' }]);
        tr.setBusy(true, '');
        tr.append([{ i: 2, t: T, kind: 'tool', name: 'Bash', detail: 'sleep' }, { i: 3, t: T, kind: 'interrupt' }, { i: 4, t: T, kind: 'interrupt' }]);
        tr.setBusy(false, '');
        const live = [...el.querySelectorAll('.turn .steps')].filter(s => !s.hidden && !s.classList.contains('settled')).length;
        return { lines: el.querySelectorAll('.msg.interrupt').length, txt: el.querySelector('.msg.interrupt')?.textContent || '', live, icon: !!el.querySelector('.msg.interrupt svg rect') };
      });
      ok('화면: 중단 줄 1개(연달아 온 표식은 한 줄)', r.lines === 1, String(r.lines));
      ok('화면: 중단 글·아이콘', r.txt.includes('중단됨') && r.icon, r.txt);
      ok('화면: 진행 중 표시가 남지 않음', r.live === 0, String(r.live));
    } finally { await browser.close(); }
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
