// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 작업 알림 = 차례 경계(v2.79, 2026-10-07 사용자 신고 "결과가 나오고 알람이 다시 오면 결과는 사라지고 알람만 보인다") 검사.
//   1) 데몬: 사용자 차례로 온 <task-notification> → notice 항목(종류 한국어 · 설명 한 줄, 한 메시지 여러 알림 = 여러 줄)
//      작업 도중 흡수된 알림(queue-operation·attachment)은 항목을 만들지 않는다 · 보조 완료 판정 재료(finished)는 그대로
//   2) 데몬: turnState 는 알림을 건너뛴다(예전 판정과 같음)
//   3) 화면(playwright 있을 때): 결과 A → 알림 → 답 B 에서 A·B 모두 '결과'로 보이고 A 가 과정 안으로 접히지 않는다
//      · 답 없이 연달아 온 알림은 「알림 N건」 한 줄 · 실시간 append 도 같다 · 알림은 첫 응답으로 치지 않는다
// 실제 기록·데몬·CLI 접촉 0 (임시 폴더의 가짜 기록만 읽는다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { TranscriptTail, noticeLines } from '../daemon/transcript.mjs';

let fail = 0, pass = 0;
const ok = (name, cond, note = '') => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${note ? ' -> ' + note : ''}`); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-notice-'));
const write = (name, lines) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8'); return f; };
const T = '2026-10-07T00:00:00.000Z';
const user = (content) => ({ type: 'user', timestamp: T, message: { role: 'user', content } });
const text = (s) => ({ type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'text', text: s }] } });
const agentCall = (id) => ({ type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Agent', input: { description: '조사' } }] } });
const tn = (summary, { status = 'completed', toolUseId = 'toolu_x', taskId = 'task1' } = {}) =>
  `<task-notification>\n<task-id>${taskId}</task-id>\n<tool-use-id>${toolUseId}</tool-use-id>\n<output-file>out</output-file>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`;
const tail = (name, lines) => { const t = new TranscriptTail(write(name, lines), 'claude'); t.poll(); return t; };

try {
  // 1) 데몬
  const a = tail('a.jsonl', [user('해줘'), text('결과 A'), user(tn('Background command "sleep 560 alarm" completed (exit code 0)')), text('알람 답 B')]);
  ok('daemon: 순서 = user · assistant · notice · assistant', a.items.map(i => i.kind).join(',') === 'user,assistant,notice,assistant', a.items.map(i => i.kind).join(','));
  const nt = a.items.find(i => i.kind === 'notice');
  ok('daemon: 배경 명령 알림 글', nt?.text === '배경 명령 끝남 · sleep 560 alarm', nt?.text);
  ok('daemon: 알림 수 n=1', nt?.n === 1);

  const b = tail('b.jsonl', [user('해줘'), agentCall('toolu_A'), user([{ type: 'tool_result', tool_use_id: 'toolu_A', content: 'Async agent launched successfully' }]), text('맡겼습니다'),
    { type: 'queue-operation', operation: 'enqueue', timestamp: T, content: tn('Agent "조사" finished', { toolUseId: 'toolu_A', taskId: 'agA' }) },
    user(tn('Agent "조사" finished', { toolUseId: 'toolu_A', taskId: 'agA' }) + '\n' + tn('Monitor event: "파일 생김"', { taskId: 'm1' })), text('보조 결과 정리')]);
  const bn = b.items.filter(i => i.kind === 'notice');
  ok('daemon: queue-operation 알림은 항목 없음 · 사용자 차례 알림만 1개', bn.length === 1, String(bn.length));
  ok('daemon: 한 메시지 여러 알림 = 여러 줄', bn[0]?.text === '보조 작업 끝남 · 조사\n감시 알림 · 파일 생김' && bn[0]?.n === 2, JSON.stringify(bn[0]?.text));
  ok('daemon: 보조 완료 판정 재료(finished·finishedByTask) 유지', b.finished.has('toolu_A') && b.finishedByTask.has('agA'));

  ok('daemon: 실패 상태', noticeLines(tn('Background command "빌드" failed with exit code 1', { status: 'failed' }))[0] === '배경 명령 실패 · 빌드');
  ok('daemon: 중단 상태', noticeLines(tn('Background command "서버" was stopped', { status: 'killed' }))[0] === '배경 명령 중단됨 · 서버');
  const long = noticeLines(tn(`Agent "${'가'.repeat(300)}" finished`));
  ok('daemon: 긴 설명은 한 줄로 자름', long.length === 1 && !long[0].includes('\n') && long[0].length === 200 && long[0].endsWith('…'), JSON.stringify(long[0]?.length));
  ok('daemon: 모르는 요약 = 원문', noticeLines(tn('Something new happened'))[0] === 'Something new happened');
  ok('daemon: 리마인더는 계속 숨김', tail('c.jsonl', [user('<system-reminder>x</system-reminder>')]).items.length === 0);

  // 2) turnState
  ok('turnState: 답 → 알림 이면 null(알림 건너뜀)', a.items.length && tail('d.jsonl', [user('해줘'), text('결과 A'), user(tn('Agent "x" finished'))]).turnState() === null);
  ok('turnState: 알림 → 답 이면 null', a.turnState() === null);

  // 3) 화면
  const req = createRequire(import.meta.url);
  let pw = null;
  for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
  if (!pw) console.log('SKIP renderer: playwright 없음');
  else {
    const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
    const src = (f) => fs.readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8').replace(/<\/script>/gi, '<\\/script>');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html><body><div id="r"></div><script>${src('icons.js')}</script><script>${src('transcript.js')}</script></body></html>`);
      const res = await page.evaluate(() => {
        const out = {};
        const T = '2026-10-07T00:00:00.000Z';
        const mk = () => { const el = document.createElement('div'); document.body.appendChild(el); const tr = window.Transcript.create(); tr.mount(el); return { el, tr }; };
        const answers = (el) => [...el.querySelectorAll('.turn > .msg.assistant')].map(x => x.dataset.text);
        // 기록 전체 그리기
        let { el, tr } = mk();
        tr.render([{ i: 1, t: T, kind: 'user', text: '해줘' }, { i: 2, t: T, kind: 'assistant', text: '결과 A' }, { i: 3, t: T, kind: 'notice', text: '배경 명령 끝남 · sleep', n: 1 }, { i: 4, t: T, kind: 'assistant', text: '알람 답 B' }]);
        out.renderAnswers = answers(el);
        out.renderStepsHasA = [...el.querySelectorAll('.steps-list .step.assistant')].length;
        out.renderNotice = el.querySelector('.msg.notice')?.textContent || '';
        out.renderOrder = [...el.children].map(c => c.className).join('|');
        // 실시간: 결과 → 알림 2건 연속 → 답
        ({ el, tr } = mk());
        tr.render([{ i: 1, t: T, kind: 'user', text: '해줘' }]);
        tr.append([{ i: 2, t: T, kind: 'assistant', text: '결과 A' }]);
        tr.append([{ i: 3, t: T, kind: 'notice', text: '보조 작업 끝남 · 조사', n: 1 }]);
        tr.append([{ i: 4, t: T, kind: 'notice', text: '배경 명령 끝남 · 알람', n: 1 }]);
        tr.append([{ i: 5, t: T, kind: 'assistant', text: '알람 답 B' }]);
        out.liveAnswers = answers(el);
        out.liveNotices = el.querySelectorAll('.msg.notice').length;
        out.liveGroup = el.querySelector('.msg.notice summary')?.textContent || '';
        out.liveItems = el.querySelectorAll('.msg.notice li').length;
        // 알림 사이에 답이 있으면 합치지 않는다
        ({ el, tr } = mk());
        tr.render([{ i: 1, t: T, kind: 'notice', text: 'a', n: 1 }, { i: 2, t: T, kind: 'assistant', text: 'x' }, { i: 3, t: T, kind: 'notice', text: 'b', n: 1 }]);
        out.sepNotices = el.querySelectorAll('.msg.notice').length;
        // 요청 전달 직후 알림이 먼저 와도 진행 표시는 유지(알림 ≠ 첫 응답)
        ({ el, tr } = mk());
        tr.render([{ i: 1, t: T, kind: 'user', text: '해줘' }, { i: 2, t: T, kind: 'assistant', text: '결과 A' }]);
        tr.pend('다음 요청'); tr.setBusy(true, '');
        tr.append([{ i: 3, t: T, kind: 'notice', text: '배경 명령 끝남 · 알람', n: 1 }]);
        tr.setBusy(false, '');
        const lastLive = [...el.querySelectorAll('.turn .steps')].pop();
        out.pendLive = !!lastLive && !lastLive.hidden && !lastLive.classList.contains('settled');
        return out;
      });
      ok('화면(전체): 결과 A·답 B 모두 결과로 보임', JSON.stringify(res.renderAnswers) === JSON.stringify(['결과 A', '알람 답 B']), JSON.stringify(res.renderAnswers));
      ok('화면(전체): A 가 과정 안으로 접히지 않음', res.renderStepsHasA === 0, String(res.renderStepsHasA));
      ok('화면(전체): 알림 줄 글', res.renderNotice.includes('배경 명령 끝남 · sleep'), res.renderNotice);
      ok('화면(전체): 순서 = 요청 · 차례 · 알림 · 차례', /^msg user\|turn\|msg notice\|turn$/.test(res.renderOrder), res.renderOrder);
      ok('화면(실시간): 결과 A·답 B 모두 결과로 보임', JSON.stringify(res.liveAnswers) === JSON.stringify(['결과 A', '알람 답 B']), JSON.stringify(res.liveAnswers));
      ok('화면(실시간): 연달아 온 알림 2건 → 한 줄', res.liveNotices === 1 && res.liveItems === 2 && res.liveGroup.includes('알림 2건'), `${res.liveNotices}/${res.liveItems}/${res.liveGroup}`);
      ok('화면: 사이에 답이 있으면 따로', res.sepNotices === 2, String(res.sepNotices));
      ok('화면: 요청 전달 직후 알림이 와도 진행 표시 유지', res.pendLive === true);
    } finally { await browser.close(); }
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
