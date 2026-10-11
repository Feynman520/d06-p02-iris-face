// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 차례 안의 중간 보고는 접지 않는다(v2.83, 2026-10-11 사용자 신고 "출력이 여러번일때 이전 출력이 안보이는 문제가 또 발생함") 검사.
//   예전 화면은 "한 차례의 마지막 글만 답, 앞의 글은 전부 과정"이었다. v2.79·v2.82 는 차례를 나누는 경우(작업 알림·정지 훅…)만 늘렸는데,
//   요청 한 번에 에이전트가 중간 답(질문에 대한 긴 답·진행 막대 보고)을 쓰고 같은 차례에서 계속 일하면 나눌 경계가 아예 없어 그 글이 과정에 묻혔다.
//   → 중간 글이 "보고"(300자 이상 · 제목·목록·표·코드·진행 막대)면 그 자리에 결과로 남기고, 뒤따르는 과정은 그 아래 새 묶음으로 간다.
//     짧은 진행 한 줄은 예전처럼 과정에 접힌다.
//   1) 데몬이 실제로 만드는 항목(TranscriptTail)으로 다시 그리기 · 실시간 append 가 같다
//   2) 보고 판정 경계(299/300자, 구조 표식) · 연달아 온 보고 · 진행 표시가 새 묶음으로 옮겨 감
// 기록 조각 = 2026-10-11 「지도 완성 현황」 세션(105~426행)의 모양(글 내용은 짧게 바꿈). 실제 기록·데몬·CLI 접촉 0.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { TranscriptTail } from '../daemon/transcript.mjs';

let fail = 0, pass = 0;
const ok = (name, cond, note = '') => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${note ? ' -> ' + note : ''}`); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-midreport-'));
const write = (name, lines) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8'); return f; };
const T = '2026-10-11T11:20:00.000Z';
const user = (content) => ({ type: 'user', timestamp: T, message: { role: 'user', content } });
const text = (s) => ({ type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'text', text: s }] } });
const think = () => ({ type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'thinking', thinking: '' }] } });
let n = 0;
const tool = (cmd) => { const id = `toolu_${++n}`; return [
  { type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: cmd, description: cmd } }] } },
  { type: 'user', timestamp: T, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } },
]; };

const LONG = '지도의 구역별 규모를 세어 7차 계획을 짜는 중입니다. 질문 2·3의 답을 먼저 드립니다.\n\n## 질문 2 — 상세지도 작성은 어디에 두나\n\n' + '상세지도는 내비 모델과 무관한 공통 단계입니다. '.repeat(12);
const BAR = '진행 보고\n```text\n전체  [████████░░░░░░░░░░░░]  40%  (2/5)\n```';
const map = [
  user('1.얇은 구역을 처음부터 다 깊게 파는 일까지 하자. 2.상세지도 작성은 어디에 두지?'),
  think(), ...tool('count zones'),
  text(LONG),                                              // 긴 중간 답 → 결과로 남아야 함
  ...tool('collect candidates'),
  text('후보 수집은 과제 하나에 약 4초씩 걸리고 있습니다.'),     // 짧은 진행 한 줄 → 과정
  ...tool('build judge input'),
  text(BAR),                                               // 진행 막대 보고(짧지만 구조) → 결과
  ...tool('count pairs'),
  text('지금은 판정자 5명이 백그라운드에서 돌고 있습니다. 약 20:59 알람에 맞춰 보고하겠습니다.'), // 마지막 답
];

try {
  // 1) 데몬 항목
  const a = new TranscriptTail(write('map.jsonl', map), 'claude'); a.poll();
  const kinds = a.items.map(i => i.kind);
  ok('daemon: 글 4개가 모두 assistant 항목', kinds.filter(k => k === 'assistant').length === 4, kinds.join(','));

  // 2) 화면
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
      const res = await page.evaluate(({ items, LONG, BAR }) => {
        const out = {};
        const T = '2026-10-11T11:20:00.000Z';
        const mk = () => { const el = document.createElement('div'); document.body.appendChild(el); const tr = window.Transcript.create(); tr.mount(el); return { el, tr }; };
        const answers = (el) => [...el.querySelectorAll('.turn > .msg.assistant')].map(x => x.dataset.text);
        const steps = (el) => [...el.querySelectorAll('.steps-list .step.assistant')].map(x => x.textContent.trim());
        const order = (el) => [...el.children].map(c => c.className).join('|');
        // 다시 그리기(옛 대화 · F5)
        let { el, tr } = mk();
        tr.render(items);
        out.renderAnswers = answers(el);
        out.renderSteps = steps(el);
        out.renderOrder = order(el);
        // 보고 아래로 이어진 과정은 보고 "다음" 묶음에 있다(보고 위로 끌려 올라가지 않음)
        const turns = [...el.querySelectorAll('.turn')];
        out.firstTurnSteps = turns[0]?.querySelectorAll('.steps-list .step').length ?? -1;
        out.firstSettled = !!turns[0]?.querySelector('.steps.settled');
        // 실시간: 하나씩, 작업 중 상태로
        ({ el, tr } = mk());
        tr.render(items.slice(0, 1)); tr.setBusy(true);
        let liveOk = true;
        for (const it of items.slice(1)) {
          tr.append([it]);
          // 진행 표시(살아 있는 단계 줄)는 언제나 많아야 하나 — 옛 묶음에 남으면 안 된다
          const live = [...el.querySelectorAll('.steps:not(.settled):not([hidden]) .steps-live')];
          if (live.length > 1) liveOk = false;
        }
        out.liveOne = liveOk;
        out.liveAnswers = answers(el);
        out.liveOrder = order(el);
        tr.setBusy(false);
        out.afterIdleAnswers = answers(el);
        // 경계: 299자 평문은 과정, 300자 평문은 결과 · 표·목록·제목 한 줄도 결과
        const run = (mid) => { const r = mk(); r.tr.render([{ i: 1, t: T, kind: 'user', text: '해줘' }, { i: 2, t: T, kind: 'assistant', text: mid },
          { i: 3, t: T, kind: 'tool', name: 'Bash', detail: 'x' }, { i: 4, t: T, kind: 'assistant', text: '끝' }]); return answers(r.el).length; };
        out.b299 = run('가'.repeat(299));
        out.b300 = run('가'.repeat(300));
        out.table = run('결과\n| a | b |\n|---|---|\n| 1 | 2 |');
        out.list = run('남은 일\n- 하나\n- 둘');
        out.head = run('## 중간 정리\n짧음');
        out.numbered = run('순서\n1. 하나\n2. 둘');
        out.plainShort = run('판정자를 띄웁니다.');
        // 글 두 개가 연달아(사이에 도구 없음): 앞 글이 보고면 둘 다 결과, 짧으면 예전처럼 과정
        const two = (first) => { const r = mk(); r.tr.render([{ i: 1, t: T, kind: 'user', text: '해줘' }, { i: 2, t: T, kind: 'assistant', text: first },
          { i: 3, t: T, kind: 'assistant', text: '끝' }]); return answers(r.el); };
        out.twoReport = two(LONG);
        out.twoShort = two('잠깐만요.');
        out.LONG = LONG; out.BAR = BAR;
        return out;
      }, { items: a.items, LONG, BAR });
      const last = '지금은 판정자 5명이 백그라운드에서 돌고 있습니다. 약 20:59 알람에 맞춰 보고하겠습니다.';
      ok('화면(다시 그리기): 긴 중간 답·진행 막대 보고·마지막 답 = 결과 3개(순서대로)', JSON.stringify(res.renderAnswers) === JSON.stringify([LONG, BAR, last]), JSON.stringify(res.renderAnswers.map(s => s.slice(0, 20))));
      ok('화면(다시 그리기): 짧은 진행 한 줄만 과정에 접힘', res.renderSteps.length === 1 && res.renderSteps[0].includes('후보 수집은'), JSON.stringify(res.renderSteps));
      ok('화면(다시 그리기): 순서 = 요청 · 차례 3묶음', res.renderOrder === 'msg user|turn|turn|turn', res.renderOrder);
      ok('화면: 첫 묶음 = 긴 답 앞의 과정(생각·도구·결과)만', res.firstTurnSteps === 3, String(res.firstTurnSteps));
      ok('화면: 보고 앞 과정은 접힘(settled)', res.firstSettled);
      ok('화면(실시간): 결과 = 다시 그리기와 같음', JSON.stringify(res.liveAnswers) === JSON.stringify(res.renderAnswers), JSON.stringify(res.liveAnswers.map(s => s.slice(0, 20))));
      ok('화면(실시간): 순서 = 다시 그리기와 같음', res.liveOrder === res.renderOrder, `${res.liveOrder} vs ${res.renderOrder}`);
      ok('화면(실시간): 진행 표시는 언제나 한 곳(새 묶음)에만', res.liveOne);
      ok('화면(실시간): 대기로 돌아와도 결과 유지', JSON.stringify(res.afterIdleAnswers) === JSON.stringify(res.renderAnswers));
      ok('경계: 299자 평문 = 과정', res.b299 === 1, String(res.b299));
      ok('경계: 300자 평문 = 결과', res.b300 === 2, String(res.b300));
      ok('경계: 표 = 결과', res.table === 2, String(res.table));
      ok('경계: 목록 = 결과', res.list === 2, String(res.list));
      ok('경계: 제목 = 결과', res.head === 2, String(res.head));
      ok('경계: 번호 목록 = 결과', res.numbered === 2, String(res.numbered));
      ok('경계: 짧은 평문 한 줄 = 과정', res.plainShort === 1, String(res.plainShort));
      ok('연달아 온 글: 앞이 보고면 둘 다 결과', JSON.stringify(res.twoReport) === JSON.stringify([LONG, '끝']), JSON.stringify(res.twoReport.map(s => s.slice(0, 10))));
      ok('연달아 온 글: 앞이 짧으면 마지막만 결과(예전과 같음)', JSON.stringify(res.twoShort) === JSON.stringify(['끝']), JSON.stringify(res.twoShort));
    } finally { await browser.close(); }
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
