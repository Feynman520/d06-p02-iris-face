// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 시스템이 다시 연 차례 = 차례 경계(v2.82, 2026-10-11 사용자 신고 "지금 출력이 2개가 나왔는데 마지막 출력만 대화에 표시되네") 검사.
//   클로드코드는 정지 훅 피드백·예약 깨우기·다른 세션 메시지·끊긴 답 이어쓰기를 isMeta 사용자 글로 남긴다. 예전 데몬은 isMeta 를 통째로
//   버려 화면이 차례 경계를 몰랐고, 그 뒤의 답이 앞 결과를 "과정"으로 밀어냈다(v2.79 는 <task-notification> 만 고쳤다).
//   1) 데몬: 네 종류 → notice 항목(src = stop-hook·scheduled·peer·resume, text = 한 줄, detail = 전체 글)
//      차례 중간의 isMeta(이미지 설명·스킬 본문·로컬 명령 머리말)는 계속 버린다 · turnState 는 notice 를 건너뛴다
//   2) 화면(playwright 있을 때): 긴 보고 A → 정지 훅 → 짧은 답 B 에서 A·B 모두 결과 · 줄을 누르면 전체 글 · 종류가 다르면 합치지 않음
//      · 실시간 append 와 다시 그리기(render)가 같다
// 기록 조각 = 2026-10-11 화학 교재 세션 271~275행의 모양(글 내용은 짧게 바꿈). 실제 기록·데몬·CLI 접촉 0.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { TranscriptTail } from '../daemon/transcript.mjs';

let fail = 0, pass = 0;
const ok = (name, cond, note = '') => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${note ? ' -> ' + note : ''}`); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-stophook-'));
const write = (name, lines) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8'); return f; };
const T = '2026-10-11T02:31:00.000Z';
const user = (content, extra = {}) => ({ type: 'user', timestamp: T, ...extra, message: { role: 'user', content } });
const meta = (content, extra = {}) => user(content, { isMeta: true, ...extra });
const text = (s) => ({ type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'text', text: s }] } });
const think = () => ({ type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'thinking', thinking: '' }] } });
const tail = (name, lines) => { const t = new TranscriptTail(write(name, lines), 'claude'); t.poll(); return t; };

const HOOK = '[bg-leftover-guard] 답을 끝내기 전에 확인: 이번 차례에 띄운 배경 명령 1개가 아직 돌고 있습니다.\n  - bq2r9bcp9 · Run codex chapter-wide critique with slot wait · 1분째\n더 필요 없으면 TaskStop(task_id)으로 끈 뒤 마치세요.';
// 271~275행 모양: 긴 보고 → isMeta 정지 훅 피드백 → hook_blocking_error 첨부 → stop_hook_summary → 생각 → 짧은 답
const chem = [
  user('이어서 집필하자'),
  text('**1.5 장 마무리를 시작했지만, 첫 단계에서 코덱스 사용 한도가 다 차서 멈췄습니다.**\n\n## 1. 무슨 일이 있었나'),
  meta(`Stop hook feedback:\n${HOOK}`),
  { type: 'attachment', timestamp: T, attachment: { type: 'hook_blocking_error', hookName: 'Stop', hookEvent: 'Stop', blockingError: { blockingError: HOOK } } },
  { type: 'system', subtype: 'stop_hook_summary', timestamp: T, hookCount: 1, hookErrors: [HOOK] },
  think(),
  text('남은 배경 작업을 확인했습니다. 훅이 가리킨 `bq2r9bcp9`는 이미 끝났습니다.'),
];

try {
  // 1) 데몬
  const a = tail('chem.jsonl', chem);
  ok('daemon: 순서 = user · assistant · notice · thinking · assistant', a.items.map(i => i.kind).join(',') === 'user,assistant,notice,thinking,assistant', a.items.map(i => i.kind).join(','));
  const n = a.items.find(i => i.kind === 'notice');
  ok('daemon: 정지 훅 notice src', n?.src === 'stop-hook', n?.src);
  ok('daemon: 정지 훅 한 줄 = 훅 이름 + 첫 줄', n?.text === '정지 훅 · bg-leftover-guard — 답을 끝내기 전에 확인: 이번 차례에 띄운 배경 명령 1개가 아직 돌고 있습니다.', n?.text);
  ok('daemon: 정지 훅 전체 글 = detail', n?.detail === HOOK, JSON.stringify(n?.detail));
  ok('daemon: 첨부·요약 레코드는 unknown 없음', a.unknown === 0, String(a.unknown));
  ok('turnState: 훅 뒤 답 = null', a.turnState() === null, String(a.turnState()));
  ok('turnState: 답 → 훅 피드백(아직 답 없음) = null', tail('chem2.jsonl', chem.slice(0, 3)).turnState() === null);

  const noName = tail('noname.jsonl', [user('해줘'), text('A'), meta('Stop hook feedback:\n아직 시험이 남았습니다. 끝까지 돌리세요.'), text('B')]).items.find(i => i.kind === 'notice');
  ok('daemon: 이름 없는 훅 = "정지 훅 — 첫 줄"', noName?.text === '정지 훅 — 아직 시험이 남았습니다. 끝까지 돌리세요.', noName?.text);

  const sch = tail('sched.jsonl', [user('업로드 감시해'), text('걸어 두었습니다'),
    meta('[10분 정기 보고] z01 드라이브 업로드 진행상황을 한국어로 보고해.\n로그 = rclone.log', { promptSource: 'system', turnOrigin: 'scheduled', scheduledTaskId: 'c8613eb0' }), text('보고: 40%')]);
  const sn = sch.items.find(i => i.kind === 'notice');
  ok('daemon: 예약 깨우기 → notice(scheduled, 첫 줄)', sn?.src === 'scheduled' && sn?.text === '예약 깨우기 · [10분 정기 보고] z01 드라이브 업로드 진행상황을 한국어로 보고해.', `${sn?.src} ${sn?.text}`);
  ok('daemon: 예약 깨우기 detail = 전체 글', sn?.detail === '[10분 정기 보고] z01 드라이브 업로드 진행상황을 한국어로 보고해.\n로그 = rclone.log', JSON.stringify(sn?.detail));
  ok('daemon: 예약 깨우기는 첫 사용자 요청(제목 재료)이 아님', sch.firstUser === '업로드 감시해', sch.firstUser);

  const peer = tail('peer.jsonl', [user('맡길게'), text('맡겼습니다'),
    meta('Another Claude session sent a message:\n<agent-message from="adb1">\nV19 쓰는 중입니다.\n둘째 줄\n</agent-message>', { promptSource: 'system', turnOrigin: 'peer', origin: { kind: 'peer', from: 'adb1', name: 'general-purpose', body: 'V19 쓰는 중입니다.\n둘째 줄' } }), text('확인')]);
  const pn = peer.items.find(i => i.kind === 'notice');
  ok('daemon: 다른 세션 메시지 → notice(peer)', pn?.src === 'peer' && pn?.text === '다른 세션 메시지 · general-purpose — V19 쓰는 중입니다.', `${pn?.src} ${pn?.text}`);
  ok('daemon: 다른 세션 메시지 detail = 본문', pn?.detail === 'V19 쓰는 중입니다.\n둘째 줄', JSON.stringify(pn?.detail));

  const cut = tail('cut.jsonl', [user('써줘'), text('앞부분…'), meta('Your response above was cut off mid-stream. Resume directly from where it stops — no apology, no recap.', { turnCompanion: true }), text('…뒷부분')]);
  const cn = cut.items.find(i => i.kind === 'notice');
  ok('daemon: 끊긴 답 이어쓰기 → notice(resume)', cn?.src === 'resume' && cn?.text === '답이 중간에 끊겨 이어 씀', `${cn?.src} ${cn?.text}`);
  const cls = tail('cls.jsonl', [user('써줘'), text('앞'), meta('Your response above was stopped by a safety classifier — this is not a tool or API error.', { turnCompanion: true }), text('뒤')]).items.find(i => i.kind === 'notice');
  ok('daemon: 안전 분류기 이어쓰기', cls?.src === 'resume' && cls?.text === '안전 분류기가 답을 멈춰 이어 씀', cls?.text);
  const nov = tail('nov.jsonl', [user('써줘'), think(), meta('[Your previous response had no visible output. Please continue and produce a user-visible response.]', { turnCompanion: true }), text('답')]).items.find(i => i.kind === 'notice');
  ok('daemon: 빈 답 이어쓰기', nov?.src === 'resume' && nov?.text === '보이는 답이 없어 이어 씀', nov?.text);

  const mid = tail('mid.jsonl', [user('봐줘'),
    { type: 'assistant', timestamp: T, message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_r', name: 'Read', input: { file_path: 'C:\\a.png' } }] } },
    user([{ type: 'tool_result', tool_use_id: 'toolu_r', content: [{ type: 'image' }] }]),
    meta([{ type: 'text', text: '[Image: original 2560x1600, displayed at 2000x1250. Multiply coordinates by 1.28 to map to original image.]' }]),
    meta([{ type: 'text', text: 'Base directory for this skill: C:\\x\\skills\\y\n\n# 스킬' }]),
    meta('<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>'),
    text('봤습니다')]);
  ok('daemon: 차례 중간 isMeta(이미지 설명·스킬 본문·caveat)는 버림', !mid.items.some(i => i.kind === 'notice') && mid.items.filter(i => i.kind === 'user').length === 1, mid.items.map(i => i.kind).join(','));

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
      const res = await page.evaluate(({ items, hook }) => {
        const out = {};
        const T = '2026-10-11T02:31:00.000Z';
        const mk = () => { const el = document.createElement('div'); document.body.appendChild(el); const tr = window.Transcript.create(); tr.mount(el); return { el, tr }; };
        const answers = (el) => [...el.querySelectorAll('.turn > .msg.assistant')].map(x => x.dataset.text);
        const order = (el) => [...el.children].map(c => c.className).join('|');
        // 다시 그리기(옛 대화 · F5): 데몬이 실제로 만든 항목 그대로
        let { el, tr } = mk();
        tr.render(items);
        out.renderAnswers = answers(el).length;
        out.renderSteps = el.querySelectorAll('.steps-list .step.assistant').length;
        out.renderOrder = order(el);
        const nt = el.querySelector('.msg.notice');
        out.src = nt?.dataset.src || '';
        out.summary = nt?.querySelector('summary')?.textContent || '';
        out.body = nt?.querySelector('.notice-body')?.textContent || '';
        out.hasIcon = !!nt?.querySelector('svg');
        // 실시간: 같은 항목을 하나씩
        ({ el, tr } = mk());
        tr.render(items.slice(0, 1));
        for (const it of items.slice(1)) tr.append([it]);
        out.liveAnswers = answers(el).length;
        out.liveSteps = el.querySelectorAll('.steps-list .step.assistant').length;
        out.liveOrder = order(el);
        // 종류가 다른 알림은 합치지 않는다 · 같은 작업 알림끼리는 예전처럼 합친다
        ({ el, tr } = mk());
        tr.render([{ i: 1, t: T, kind: 'user', text: '해줘' }, { i: 2, t: T, kind: 'assistant', text: 'A' },
          { i: 3, t: T, kind: 'notice', src: 'task', text: '배경 명령 끝남 · x', n: 1 },
          { i: 4, t: T, kind: 'notice', src: 'stop-hook', text: '정지 훅 · g — 확인', detail: hook, n: 1 },
          { i: 5, t: T, kind: 'notice', src: 'stop-hook', text: '정지 훅 · g — 또', detail: 'two', n: 1 },
          { i: 6, t: T, kind: 'notice', text: '감시 알림', n: 1 }, { i: 7, t: T, kind: 'notice', text: '배경 명령 끝남 · y', n: 1 },
          { i: 8, t: T, kind: 'assistant', text: 'B' }]);
        out.mixed = el.querySelectorAll('.msg.notice').length;
        out.mixedAnswers = answers(el);
        return out;
      }, { items: a.items, hook: HOOK });
      ok('화면(다시 그리기): 긴 보고·짧은 답 모두 결과', res.renderAnswers === 2, String(res.renderAnswers));
      ok('화면(다시 그리기): 긴 보고가 과정 안으로 접히지 않음', res.renderSteps === 0, String(res.renderSteps));
      ok('화면(다시 그리기): 순서 = 요청 · 차례 · 훅 줄 · 차례', /^msg user\|turn\|msg notice[^|]*\|turn$/.test(res.renderOrder), res.renderOrder);
      ok('화면: 훅 줄 data-src = stop-hook', res.src === 'stop-hook', res.src);
      ok('화면: 훅 줄 요약 글', res.summary.includes('정지 훅 · bg-leftover-guard — 답을 끝내기 전에 확인'), res.summary);
      ok('화면: 누르면 전체 글(detail)', res.body.includes('bq2r9bcp9') && res.body.includes('TaskStop(task_id)'), res.body);
      ok('화면: 훅 줄 아이콘', res.hasIcon);
      ok('화면(실시간): 두 답 모두 결과 · 과정 0', res.liveAnswers === 2 && res.liveSteps === 0, `${res.liveAnswers}/${res.liveSteps}`);
      ok('화면: 실시간 = 다시 그리기(같은 순서)', res.liveOrder === res.renderOrder, `${res.liveOrder} vs ${res.renderOrder}`);
      ok('화면: 작업 알림 · 훅 2건 · 작업 알림 2건 → 줄 4개(작업 알림 연속만 합침)', res.mixed === 4, String(res.mixed));
      ok('화면: 섞인 알림 앞뒤 답 모두 결과', JSON.stringify(res.mixedAnswers) === '["A","B"]', JSON.stringify(res.mixedAnswers));
    } finally { await browser.close(); }
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
