// 플래너 규칙 알림 검사(2026-11-22, 플래너 걸음 5) — daemon/planner-rules.mjs.
// 시계를 주입해 30초 점검을 손으로 돌린다(실제 시간 · 진짜 데몬 · 진짜 장부 · AI 접촉 0).
//   npm run verify:planner-rules
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Planner } from '../daemon/planner.mjs';
import { PlannerRules, DUE_DAYS } from '../daemon/planner-rules.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-pr-'));
let n = 0;
const U = { by: 'user', via: 'test' };
let clock = new Date(2026, 10, 23, 7, 30, 0); // 2026-11-23 월요일
const at = (d, h, m, s = 0) => { clock = new Date(2026, 10, d, h, m, s); };
const step = (sec) => { clock = new Date(clock.getTime() + sec * 1000); };
/** 새 세상: 임시 장부 + 창구 + 규칙. seed(pl) 로 일정을 넣는다. */
function world(seed, cfg = {}) {
  const dir = path.join(base, `w${++n}`); const sent = []; const logs = [];
  const pl = new Planner({ dir: path.join(dir, 'planner'), stateDir: dir, settings: { get: () => cfg }, broadcast: (o) => sent.push(o), log: (m) => logs.push(m), now: () => new Date(clock) });
  pl.start();
  const add = (item) => pl.store.apply([{ op: 'add', item }], U).items[0];
  const ids = seed ? seed(add, pl) || {} : {};
  const rules = new PlannerRules({ planner: pl, stateDir: dir, now: () => new Date(clock), log: (m) => logs.push(m) });
  const tick = () => rules.tick().map((s) => s.text);
  const again = () => new PlannerRules({ planner: pl, stateDir: dir, now: () => new Date(clock), log: (m) => logs.push(m) });
  return { pl, rules, tick, sent, logs, cfg, ids, dir, again, add };
}
const BOOK = (add) => ({
  late: add({ title: '수행평가 채점 기준 확인', start: '2026-11-20' }),
  news: add({ title: '가정통신문 회신 정리', start: '2026-11-22', end: '2026-11-27' }),
  meet: add({ title: '협의회', start: '2026-11-23', time: '15:00', folder: 'C:\\x\\전학공' }),
  big: add({ title: '결과 보고서 제출', start: '2026-11-20', end: '2026-11-25', steps: [{ title: '자료', day: '2026-11-20', done: true }, { title: '초안', day: '2026-11-23' }, { title: '제출', day: '2026-11-25' }] }),
  week: add({ title: '수업 나눔 주간', start: '2026-11-24', end: '2026-11-26' }),
});

try {
  // ---- 1. 수첩이 비어 있으면 먼저 말하지 않는다 ----
  at(23, 7, 30);
  { const w = world();
    ok(w.tick().length === 0 && w.sent.length === 0, '빈 수첩: 아침에도 아무 말 없음');
    at(23, 16, 40); ok(w.tick().length === 0, '빈 수첩: 하루 끝에도 아무 말 없음');
    ok(!fs.existsSync(w.pl.store.dir), '규칙 점검만으로 장부 폴더를 만들지 않음'); }

  // ---- 2. 그날의 첫 인사 ----
  at(23, 7, 30);
  { const w = world(BOOK);
    const said = w.rules.tick();
    ok(said.length === 1 && said[0].text === '좋은 아침이에요. 오늘 할 것이 3개, 밀린 일이 1개 있어요.' && said[0].group === 'greet' && said[0].actions[0].kind === 'open', `그날 처음 켰을 때의 인사 — ${said[0]?.text}`);
    ok(said[0].tip === '첫 약속 15:00 협의회' && w.sent.length === 1 && w.sent[0].type === 'planner' && w.sent[0].say.text === said[0].text, '첫 약속은 올렸을 때 · 말풍선 방송으로 나감');
    step(30); ok(w.tick().length === 0, '같은 날 두 번 인사하지 않음');
    at(23, 9, 0); ok(w.again().tick().length === 0, '데몬을 다시 켜도 같은 날은 다시 인사하지 않음(상태 파일)');
    // 밤새 켜 둔 채 다음 날
    for (let h = 9; h <= 23; h++) { at(23, h, 59); w.rules.tick(); }
    w.sent.length = 0;
    at(24, 0, 0, 20); ok(w.tick().length === 0, '자정을 넘겨도 바로 인사하지 않음');
    at(24, 0, 2); w.tick(); at(24, 0, 4); w.tick(); at(24, 7, 59, 30); w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick().length === 0, '밤새 켜 둔 날: 아침 시각 전에는 인사하지 않음');
    at(24, 8, 0, 0);
    const t = w.tick();
    ok(t.length === 1 && t[0].startsWith('좋은 아침이에요. 오늘 할 것이 3개') && t[0].includes('마감이 가까운 일이 2개 있어요.'), `밤새 켜 둔 날: 아침 8시에 인사 + 가까운 마감 — ${t[0]}`); }
  ok(DUE_DAYS.join() === '3,1,0', '마감은 3일 전 · 하루 전 · 당일에 말함');
  at(24, 7, 30);
  { const w = world((add) => { add({ title: '출장', start: '2026-11-23', end: '2026-11-25' }); });
    ok(w.tick()[0] === '좋은 아침이에요. 오늘 할 것이 1개 있어요. 「출장」이 내일까지예요.', '가까운 마감이 하나면 이름으로 · 조사'); }
  at(25, 7, 30);
  { const w = world((add) => { add({ title: '참관록 제출', start: '2026-11-23', end: '2026-11-25' }); });
    ok(w.tick()[0].endsWith('「참관록 제출」이 오늘까지예요.'), '당일'); }
  at(23, 7, 30);
  { const w = world((add) => { add({ title: '긴 일', start: '2026-11-20', end: '2026-11-26' }); add({ title: '아직 시작 안 한 기간', start: '2026-11-24', end: '2026-11-26' }); });
    ok(w.tick()[0] === '좋은 아침이에요. 오늘 할 것이 1개 있어요. 「긴 일」이 목요일까지예요.', '사흘 뒤 마감은 요일로 · 아직 시작하지 않은 기간의 마감은 말하지 않음'); }
  at(23, 7, 30);
  { const w = world((add) => { for (let i = 0; i < 4; i++) add({ title: `마감 ${i}`, start: '2026-11-23', end: `2026-11-2${6 + (i % 3)}` }); });
    const t = w.tick()[0];
    ok(t.includes('이번 주에 마감이 4개 몰려 있어요.'), `월요일 아침: 몰린 주 — ${t}`);
    at(24, 7, 30); const w2 = world((add) => { for (let i = 0; i < 4; i++) add({ title: `마감 ${i}`, start: '2026-11-23', end: '2026-11-28' }); });
    ok(!w2.tick()[0].includes('몰려'), '몰림은 월요일에만'); }
  at(23, 3, 10);
  { const w = world(BOOK);
    ok(w.tick().length === 0, '새벽(05시 전)에 켜면 인사하지 않음');
    at(23, 6, 0); ok(w.tick().length === 1, '아침에 다시 켜면(점검이 비었다 이어지면) 인사'); }
  at(23, 13, 0);
  { const w = world(BOOK);
    ok(w.tick()[0].startsWith('안녕하세요. 오늘 할 것이'), '낮에 처음 켠 날은 "안녕하세요"'); }
  at(23, 7, 30);
  { const w = world((add) => { const a = add({ title: '끝낸 일', start: '2026-11-23' }); return { a }; });
    w.pl.store.apply([{ op: 'check', id: w.ids.a.id, done: true }], U);
    w.pl.store.apply([{ op: 'propose', item: { title: '제안', start: '2026-11-23' } }], { by: 'iris' });
    ok(w.tick().length === 0, '끝낸 일 · 제안뿐이면 인사할 것이 없음'); }

  // ---- 3. 시작 전 알림 ----
  at(23, 14, 49, 40);
  { const w = world(BOOK);
    w.rules.state.morning = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick().length === 0, '10분보다 멀면 조용');
    at(23, 14, 50, 10);
    const said = w.rules.tick();
    ok(said.length === 1 && said[0].text === '오후 3시 「협의회」가 10분 남았어요.' && said[0].group === 'sched' && said[0].tip === '15:00 협의회' && JSON.stringify(said[0].actions.map((a) => a.kind)) === '["folder","chat"]', `시작 10분 전 — ${said[0]?.text}`);
    ok(w.pl.store.get(w.ids.meet.id).alerted['start:2026-11-23'], '알렸다는 기록을 장부에(되돌리기 대상 아님)');
    step(30); ok(w.tick().length === 0, '같은 약속을 두 번 알리지 않음');
    at(23, 15, 0, 5); ok(w.tick().length === 0, '시작 시각이 지나도 다시 말하지 않음'); }
  at(23, 14, 30, 0);
  { const w = world(BOOK, { plannerStartMin: 30 });
    w.rules.state.morning = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick()[0] === '오후 3시 「협의회」가 30분 남았어요.', '몇 분 전인지는 설정대로(30분)');
    const w2 = world(BOOK, { plannerStartAlert: false }); w2.rules.state.morning = '2026-11-23';
    at(23, 14, 55); ok(w2.tick().length === 0, '시작 전 알림을 끄면 조용'); }
  at(23, 9, 25, 0);
  { const w = world((add) => ({ a: add({ title: '아침 회의', start: '2026-11-23', time: '09:30', timeEnd: '10:00' }), b: add({ title: '끝낸 약속', start: '2026-11-23', time: '09:30' }), c: add({ title: '매일 조회', start: '2026-11-20', time: '09:30', repeat: { freq: 'daily' } }) }));
    w.pl.store.apply([{ op: 'check', id: w.ids.b.id, done: true }], U);
    w.rules.state.morning = '2026-11-23';
    const said = w.rules.tick();
    ok(said.length === 2 && said[0].text === '오전 9시 30분 「아침 회의」가 5분 남았어요.' && said[0].tip === '09:30~10:00 아침 회의' && said[0].actions[0].kind === 'open' && said[1].text.includes('「매일 조회」'), '끝낸 약속은 알리지 않음 · 반복하는 약속은 그날 것 · 폴더가 없으면 「오늘 보기」');
    at(24, 9, 25); w.rules.state.morning = '2026-11-24';
    ok(w.tick().join() === '오전 9시 30분 「매일 조회」가 5분 남았어요.', '반복하는 약속은 다음 날에도 다시 알림'); }
  at(23, 15, 0, 10);
  { const w = world((add) => ({ a: add({ title: '곧 시작', start: '2026-11-23', time: '15:00' }) })); w.rules.state.morning = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick()[0] === '「곧 시작」이 지금 시작해요.', '시작하는 분에는 "지금 시작해요"'); }

  // ---- 4. 꺼져 있던 동안 지나간 약속 ----
  at(23, 15, 20, 0);
  { const w = world(BOOK); w.rules.state.morning = '2026-11-23';
    const said = w.rules.tick();
    ok(said.length === 1 && said[0].text === '오후 3시 「협의회」 시간이 지났어요.' && said[0].actions[0].kind === 'open', `막 켰을 때: 지나간 약속 하나 — ${said[0]?.text}`);
    step(30); ok(w.tick().length === 0, '한 번만'); }
  at(23, 15, 20, 0);
  { const w = world((add) => { add({ title: '하나', start: '2026-11-23', time: '13:00' }); add({ title: '둘', start: '2026-11-23', time: '15:00' }); add({ title: '어제 것', start: '2026-11-22', time: '15:00' }); add({ title: '너무 오래 전', start: '2026-11-23', time: '02:00' }); }); w.rules.state.morning = '2026-11-23';
    const said = w.rules.tick();
    ok(said.length === 1 && said[0].text === '지나간 약속이 2개 있어요.' && said[0].tip === '13:00 하나 · 15:00 둘', '여럿이면 모아서 한 번 · 어제 것과 12시간 넘은 것은 말하지 않음'); }
  at(23, 15, 20, 0);
  { const w = world(BOOK); w.rules.state.morning = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    w.pl.store.apply([{ op: 'add', item: { title: '이미 지난 시각으로 넣은 약속', start: '2026-11-23', time: '15:10' } }], U);
    const meetAlerted = w.pl.store.markAlerted([{ id: w.ids.meet.id, key: 'start:2026-11-23' }]);
    ok(meetAlerted === 1 && w.tick().length === 0 && w.pl.store.list('active').find((it) => it.title.startsWith('이미 지난')).alerted['start:2026-11-23'], '켜져 있는 동안 지난 시각으로 넣은 약속은 말없이 적어 두기만');
    at(23, 15, 40); w.rules.state.seenAt = new Date(clock.getTime() - 20 * 60000).toISOString();
    ok(w.tick().length === 0, '잠들었다 깨어나도 이미 알린 것은 다시 말하지 않음'); }
  at(23, 14, 40, 0);
  { const w = world(BOOK); w.rules.state.morning = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    w.tick(); at(23, 15, 30); // 14:40 부터 15:30 까지 노트북이 잠들었다
    ok(w.tick().join() === '오후 3시 「협의회」 시간이 지났어요.', '잠자기에서 깨어나면 시계를 다시 견줘 지나간 약속을 말함'); }

  // ---- 5. 잠시 조용히 ----
  at(23, 14, 40, 0);
  { const w = world(BOOK, { plannerQuietUntil: new Date(2026, 10, 23, 15, 30).toISOString() }); w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick().length === 0, '조용히: 인사도 안 함');
    at(23, 14, 50, 10); ok(w.tick().length === 0 && !w.pl.store.get(w.ids.meet.id).alerted, '조용히: 시작 전 알림도 안 함(적어 두지도 않음)');
    for (let m = 51; m < 60; m++) { at(23, 14, m); w.tick(); } for (let m = 0; m <= 29; m++) { at(23, 15, m); w.tick(); }
    ok(w.sent.length === 0, '조용히 하는 동안 아무 방송 없음');
    at(23, 15, 30, 10);
    const said = w.tick();
    ok(said.includes('오후 3시 「협의회」 시간이 지났어요.') && said.some((t) => t.startsWith('안녕하세요.')), `조용히가 끝나면 그사이 지나간 약속을 말하고 미뤄 둔 인사도 — ${said.join(' / ')}`); }

  // ---- 6. 하루 끝 정리 ----
  at(23, 16, 29, 30);
  { const w = world((add) => ({ a: add({ title: '끝낼 일', start: '2026-11-23' }), b: add({ title: '남을 일', start: '2026-11-23' }), c: add({ title: '남을 일 2', start: '2026-11-23' }), p: add({ title: '기간', start: '2026-11-22', end: '2026-11-24' }), t: add({ title: '약속', start: '2026-11-23', time: '10:00' }) }));
    w.pl.store.apply([{ op: 'check', id: w.ids.a.id, done: true }], U);
    w.pl.store.markAlerted([{ id: w.ids.t.id, key: 'start:2026-11-23' }]);
    w.rules.state.morning = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick().length === 0, '정리 시각 전에는 조용');
    at(23, 16, 30, 0);
    const said = w.rules.tick();
    ok(said.length === 1 && said[0].text === '오늘 끝낸 일 1개, 남은 일 4개예요.' && JSON.stringify(said[0].actions.map((a) => a.kind)) === '["move","open"]' && said[0].actions[0].count === 2, `하루 끝 정리 — ${said[0]?.text}`);
    step(30); ok(w.tick().length === 0, '하루에 한 번');
    const mv = w.rules.moveRestToTomorrow();
    const book = w.pl.store.list('active');
    ok(mv.moved === 2 && mv.say === '남은 일 2개를 내일로 옮겼어요.' && mv.goto === '2026-11-24' && book.find((it) => it.title === '남을 일').start === '2026-11-24' && book.find((it) => it.title === '기간').start === '2026-11-22' && book.find((it) => it.title === '약속').start === '2026-11-23' && book.find((it) => it.title === '끝낼 일').start === '2026-11-23', '「내일로 옮기기」: 시각 없는 하루짜리 남은 일만(기간 · 약속 · 끝낸 일은 그대로)');
    w.pl.undo(mv.changeId);
    ok(w.pl.store.list('active').filter((it) => it.start === '2026-11-24').length === 0, '한 번에 되돌릴 수 있음');
    w.rules.moveRestToTomorrow();
    ok(w.rules.moveRestToTomorrow().moved === 0, '옮길 것이 없으면 그렇게 말함'); }
  at(23, 16, 40, 0);
  { const w = world((add) => { const a = add({ title: '하나', start: '2026-11-23' }); return { a }; });
    w.pl.store.apply([{ op: 'check', id: w.ids.a.id, done: true }], U);
    w.rules.state.morning = '2026-11-23';
    const said = w.rules.tick();
    ok(said[0].text === '오늘 할 일 1개를 다 끝냈어요.' && said[0].actions.length === 1, '다 끝낸 날'); }
  at(23, 20, 0, 0);
  { const w = world(BOOK);
    const t = w.tick();
    ok(t.length === 2 && t[0] === '오후 3시 「협의회」 시간이 지났어요.' && t[1].startsWith('오늘 끝낸 일') && w.rules.state.morning === '2026-11-23', `정리 시각이 지난 뒤 처음 켠 날은 인사 없이 지나간 약속과 정리만 — ${t.join(' / ')}`); }
  at(23, 17, 0, 0);
  { const w = world(BOOK, { plannerEvening: false, plannerEveningAt: '16:30' });
    ok(w.tick().every((t) => !t.startsWith('오늘 끝낸')), '하루 끝 정리를 끄면 말하지 않음');
    const w2 = world(BOOK, { plannerEveningAt: '18:00' }); w2.rules.state.morning = '2026-11-23';
    ok(w2.tick().every((t) => !t.startsWith('오늘 끝낸')), '정리 시각은 설정대로(18시 전에는 조용)'); }

  // ---- 7. 꺼짐 · 쉬는 중 ----
  at(23, 7, 30);
  { const w = world(BOOK, { plannerEnabled: false });
    ok(w.tick().length === 0 && !fs.existsSync(path.join(w.dir, 'planner-rules.json')), '플래너를 끄면 점검도 하지 않음');
    const w2 = world(BOOK, { plannerMorning: false });
    ok(w2.tick().length === 0 && w2.rules.state.morning === '2026-11-23', '아침 인사를 끄면 말하지 않음');
    const w3 = world(BOOK); w3.pl.failed = true;
    ok(w3.tick().length === 0, '장부를 못 연 상태면 조용'); }

  // ---- 8. 말 · 로그 ----
  at(23, 11, 50, 0);
  { const w = world((add) => { add({ title: '점심 약속', start: '2026-11-23', time: '12:00' }); add({ title: '자정 넘어', start: '2026-11-24', time: '00:05' }); }); w.rules.state.morning = '2026-11-23';
    ok(w.tick()[0] === '오후 12시 「점심 약속」이 10분 남았어요.', '낮 12시 = 오후 12시');
    at(23, 23, 58, 0); w.rules.state.evening = '2026-11-23'; ok(w.tick().length === 0, '내일 0시 5분 약속은 오늘 밤에 알리지 않음(그날의 것만)');
    at(24, 0, 0, 10); w.rules.state.morning = '2026-11-24';
    ok(w.tick()[0] === '오전 12시 5분 「자정 넘어」가 5분 남았어요.', '자정 직후의 약속');
    ok(!w.logs.some((m) => /점심 약속|자정 넘어/.test(m)), '로그에 일정 내용 없음'); }
} catch (e) { fail++; console.log(`FAIL 예외: ${e?.stack || e}`); }
finally { try { fs.rmSync(base, { recursive: true, force: true }); } catch {} }
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
