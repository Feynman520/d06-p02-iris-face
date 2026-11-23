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
function world(seed, cfg = {}, { intro = false } = {}) {
  const dir = path.join(base, `w${++n}`); const sent = []; const logs = [];
  const pl = new Planner({ dir: path.join(dir, 'planner'), stateDir: dir, settings: { get: () => cfg }, broadcast: (o) => sent.push(o), log: (m) => logs.push(m), now: () => new Date(clock) });
  pl.start();
  const add = (item) => pl.store.apply([{ op: 'add', item }], U).items[0];
  const ids = seed ? seed(add, pl) || {} : {};
  const gate = { ready: true };
  const rules = new PlannerRules({ planner: pl, stateDir: dir, now: () => new Date(clock), log: (m) => logs.push(m), ready: () => gate.ready });
  if (!intro) rules.state.intro = 'seen'; // 처음 한 번 소개는 10절에서만 본다 — 다른 절은 이미 소개를 받은 사람으로
  const tick = () => rules.tick().map((s) => s.text);
  const again = () => { const r = new PlannerRules({ planner: pl, stateDir: dir, now: () => new Date(clock), log: (m) => logs.push(m) }); if (!intro) r.state.intro = 'seen'; return r; };
  return { pl, rules, tick, sent, logs, cfg, ids, dir, again, add, gate };
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
    ok(w.pl.store.get(w.ids.meet.id).alerted['start:2026-11-23T15:00'] && said[0].os === true, '알렸다는 기록을 장부에(날짜 + 시각, 되돌리기 대상 아님) · 창이 뒤에 있으면 윈도우 알림으로도');
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
    ok(said.length === 1 && said[0].text === '곧 시작하는 약속이 2개 있어요.' && said[0].tip === '09:30 아침 회의 · 09:30 매일 조회' && said[0].actions.length === 1 && said[0].actions[0].kind === 'open', `같은 때에 여럿이면 말풍선 하나로 · 끝낸 약속은 세지 않음 — ${said.map((x) => x.text).join(' / ')}`);
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
    const meetAlerted = w.pl.store.markAlerted([{ id: w.ids.meet.id, key: 'start:2026-11-23T15:00' }]);
    ok(meetAlerted === 1 && w.tick().length === 0 && w.pl.store.list('active').find((it) => it.title.startsWith('이미 지난')).alerted['start:2026-11-23T15:10'], '켜져 있는 동안 지난 시각으로 넣은 약속은 말없이 적어 두기만');
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
    w.pl.store.markAlerted([{ id: w.ids.t.id, key: 'start:2026-11-23T10:00' }]);
    w.rules.state.morning = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick().length === 0, '정리 시각 전에는 조용');
    at(23, 16, 30, 0);
    const said = w.rules.tick();
    ok(said.length === 1 && said[0].text === '오늘 끝낸 일 1개, 남은 일 4개예요.' && JSON.stringify(said[0].actions.map((a) => a.kind)) === '["move","open"]' && said[0].actions[0].count === 2 && said[0].actions[0].day === '2026-11-23', `하루 끝 정리 — ${said[0]?.text}`);
    step(30); ok(w.tick().length === 0, '하루에 한 번');
    const stale = w.rules.moveRestToTomorrow('2026-11-22');
    ok(stale.ok === false && stale.moved === 0 && stale.say.startsWith('날짜가 바뀌어서') && !w.pl.store.list('active').some((it) => it.start === '2026-11-24' && it.title.startsWith('남을')), '「내일로 옮기기」: 말풍선이 자정을 넘겨 남아 있다 눌리면(그날이 아니면) 옮기지 않음');
    const mv = w.rules.moveRestToTomorrow('2026-11-23');
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
    at(23, 23, 54, 0); w.rules.state.evening = '2026-11-23'; ok(w.tick().length === 0, '내일 0시 5분 약속: 11분 전에는 조용');
    at(23, 23, 55, 10); ok(w.tick()[0] === '오전 12시 5분 「자정 넘어」가 10분 남았어요.', '내일 0시 5분 약속의 10분 전은 오늘 밤 — 자정 전에 알림');
    at(24, 0, 0, 10); w.rules.state.morning = '2026-11-24';
    ok(w.tick().length === 0, '자정을 넘겨도 같은 약속을 다시 알리지 않음');
    ok(!w.logs.some((m) => /점심 약속|자정 넘어/.test(m)), '로그에 일정 내용 없음'); }

  // ---- 9. 받는 창 · 자정 · 시계 · 적기 실패 · 시각 변경 · 항목마다 다른 알림(2026-11-23 검토 반영) ----
  at(23, 15, 20, 0);
  { const w = world(BOOK); w.gate.ready = false;
    ok(w.tick().length === 0 && w.sent.length === 0 && !fs.existsSync(path.join(w.dir, 'planner-rules.json')) && !w.pl.store.get(w.ids.meet.id).alerted, '받을 창이 없으면(데몬이 창보다 먼저 뜸) 말하지 않고 아무것도 소비하지 않음');
    step(30); w.tick(); step(30); w.tick(); at(23, 15, 22, 0); w.gate.ready = true;
    const t = w.tick();
    ok(t.length === 2 && t[0] === '오후 3시 「협의회」 시간이 지났어요.' && t[1].startsWith('안녕하세요. 오늘 할 것이') && w.sent.length === 2, `창이 붙으면 그때 지나간 약속과 첫 인사를 말함 — ${t.join(' / ')}`); }
  at(23, 23, 39, 0);
  { const w = world((add) => ({ a: add({ title: '밤 회의', start: '2026-11-23', time: '23:50' }) })); w.rules.state.morning = '2026-11-23'; w.rules.state.evening = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick().length === 0, '10분보다 멀면 조용');
    at(24, 0, 10, 0); w.rules.state.morning = '2026-11-24'; // 23:40 에 잠들어 자정 넘어 깨어남
    const t = w.rules.tick();
    ok(t.length === 1 && t[0].text === '오후 11시 50분 「밤 회의」 시간이 지났어요.' && w.pl.store.get(w.ids.a.id).alerted['start:2026-11-23T23:50'], '자정을 넘겨 깨어나도 어젯밤 지나간 약속을 말함');
    step(30); ok(w.tick().length === 0, '한 번만'); }
  at(23, 14, 58, 50);
  { const w = world((add) => ({ a: add({ title: '바로 전 알림', start: '2026-11-23', time: '15:00', alerts: { leadMin: 1 } }) })); w.rules.state.morning = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick().length === 0, '이 일만 1분 전에 알리게 해 두면 2분 전에는 조용');
    at(23, 15, 1, 10); // 시계가 2분 남짓 건너뜀(3분 안 — "잠들었다 깨어남"으로 보지 않는 틈)
    ok(w.tick()[0] === '오후 3시 「바로 전 알림」 시간이 지났어요.', '시계가 조금 건너뛰어 시작 시각을 지나쳐도 말없이 넘기지 않음'); }
  at(23, 14, 30, 0);
  { const w = world((add) => ({ a: add({ title: '멀리서 오는 손님', start: '2026-11-23', time: '15:00', alerts: { leadMin: 30 } }), b: add({ title: '보통 약속', start: '2026-11-23', time: '15:00' }) })); w.rules.state.morning = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick().join() === '오후 3시 「멀리서 오는 손님」이 30분 남았어요.', '항목마다 다른 알림: 이 일만 30분 전(다른 약속은 기본 10분 전)');
    at(23, 14, 50, 0); w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick().join() === '오후 3시 「보통 약속」이 10분 남았어요.', '다른 약속은 기본값대로 따로'); }
  at(23, 8, 50, 0);
  { const w = world((add) => ({ a: add({ title: '옮길 약속', start: '2026-11-23', time: '09:00' }) })); w.rules.state.morning = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick().length === 1, '9시 약속의 10분 전 알림');
    w.pl.store.apply([{ op: 'update', id: w.ids.a.id, patch: { time: '15:00' } }], U);
    at(23, 14, 50, 0); w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    ok(w.tick().join() === '오후 3시 「옮길 약속」이 10분 남았어요.', '알린 뒤 시각을 바꾸면 새 시각에 다시 알림'); }
  at(23, 14, 50, 0);
  { const w = world(BOOK); w.rules.state.morning = '2026-11-23'; w.rules.first = false; w.rules.state.seenAt = new Date(clock.getTime() - 30000).toISOString();
    w.pl.store.markAlerted = () => 0; // 장부에 적지 못하는 상황(읽기 전용 · 디스크 오류)
    ok(w.tick().length === 1, '적지 못해도 한 번은 말함');
    step(30); const again1 = w.tick().length; step(30);
    ok(again1 === 0 && w.tick().length === 0, '장부에 적지 못해도 30초마다 되풀이하지 않음(이번 실행의 기억)'); }
  at(23, 7, 30);
  { const w = world((add) => { add({ title: '멀리 보는 일', start: '2026-11-20', end: '2026-11-30', alerts: { dueDays: [7, 1, 0] } }); add({ title: '보통 기간', start: '2026-11-20', end: '2026-11-30' }); });
    ok(w.tick()[0] === '좋은 아침이에요. 오늘 할 것이 2개 있어요. 「멀리 보는 일」이 11월 30일까지예요.', '항목마다 다른 마감 알림("이건 일주일 전에도 알려 줘") — 다른 일은 기본(3일 전 · 하루 전 · 당일)'); }

  // ---- 10. 처음 한 번 소개 · 잠시 조용히의 공통 출구(설계 조각 ⑧, 2026-11-23) ----
  at(23, 9, 0);
  { const w = world(null, {}, { intro: true });
    const t = w.tick();
    ok(t.length === 1 && t[0].startsWith('일정은 저한테 말해 주세요') && w.sent[0].say.intro === true && w.sent[0].say.actions[0].label === '열어 보기', `수첩이 비어 있어도 처음 한 번은 소개함 — ${t.join(' / ')}`);
    step(30); ok(w.tick().length === 0, '곧바로 되풀이하지 않음');
    // 방송했다고 "소개했다"고 적지 않는다 — 화면이 실제로 보여 줬다고 알려 와야(introSeen) 적는다
    const st0 = JSON.parse(fs.readFileSync(path.join(w.dir, 'planner-rules.json'), 'utf8'));
    ok(!st0.intro && w.rules.state.intro === null, '방송만으로는 "소개했다"고 적지 않음(아무도 못 본 채 지나가지 않게)');
    step(11 * 60); const again = w.tick();
    ok(again.length === 1 && again[0].startsWith('일정은 저한테'), '화면이 보여 줬다고 알려 오지 않으면 10분 뒤 다시 보냄');
    ok(w.rules.introSeen() === true && w.rules.introSeen() === false, '화면이 보여 줬다고 알려 오면 그때 적음(한 번)');
    const st = JSON.parse(fs.readFileSync(path.join(w.dir, 'planner-rules.json'), 'utf8'));
    ok(st.intro === '2026-11-23', '소개한 날을 적어 둠(다시 켜도 또 하지 않게)');
    step(11 * 60); ok(w.tick().length === 0, '적은 뒤로는 다시 보내지 않음');
    const r2 = new PlannerRules({ planner: w.pl, stateDir: w.dir, now: () => new Date(clock), log: () => {} });
    ok(r2.tick().length === 0, '다시 켜도 소개하지 않음');
    const w0 = world(null, {}, { intro: true }); w0.tick();
    const r3 = new PlannerRules({ planner: w0.pl, stateDir: w0.dir, now: () => new Date(clock), log: () => {} });
    ok(r3.tick().length === 1, '못 본 채 꺼졌으면(알림이 오지 않았으면) 다음에 켤 때 다시 소개'); at(23, 9, 0); }
  { const w = world(null, {}, { intro: true }); w.gate.ready = false;
    ok(w.tick().length === 0 && w.rules.state.intro === null, '받을 창이 없으면 소개도 하지 않고 남겨 둠');
    w.gate.ready = true; ok(w.tick().length === 1, '창이 붙으면 그때 소개'); }
  { const w = world(null, { plannerEnabled: false }, { intro: true });
    ok(w.tick().length === 0 && w.rules.state.intro === null, '플래너를 꺼 둔 사람에게는 소개하지 않음'); }
  { const cfg = { plannerQuietUntil: new Date(2026, 10, 23, 10, 0, 0).toISOString() };
    const w = world(null, cfg, { intro: true });
    ok(w.tick().length === 0 && w.rules.state.intro === null, '조용히 하는 동안에는 소개도 미룸');
    // 조용히 하는 동안 세션이 넣은 것 · 제안의 말풍선은 하지 않고 세기만 한다(달력 · 제안 숫자는 방송으로 그대로 바뀐다)
    const before = w.sent.length;
    w.pl.say({ group: 'info', tone: 'iris', text: '세션에서 추가했어요.', actions: [{ kind: 'undo', changeId: 'c1' }] }); w.pl.say({ group: 'proposal', tone: 'iris', text: '제안했어요.' });
    ok(w.sent.length === before + 2 && w.sent.slice(before).every((m) => m.type === 'planner' && !m.say) && w.pl.muted === 2, '조용히 하는 동안: 말풍선 없이 방송만 · 하지 않은 말의 수를 셈');
    ok(w.pl.quietNow() === true && w.rules.quiet(clock.getTime()) === true, '조용히 판정은 창구 한 곳(quietNow)');
    // 미뤄 둔 말은 파일에도 남는다 — 조용히 하는 동안 꺼졌다 켜져도 되돌리기 단추까지 그대로 돌아오게
    const keptFile = path.join(w.dir, 'planner-muted.json');
    const pl2 = new Planner({ dir: path.join(w.dir, 'planner'), stateDir: w.dir, settings: { get: () => cfg }, now: () => new Date(clock) }); pl2.start();
    ok(fs.existsSync(keptFile) && pl2.takeMuted().length === 2, '미뤄 둔 말은 꺼졌다 켜져도 남음(파일)');
    fs.writeFileSync(keptFile, JSON.stringify(w.pl.mutedSays), 'utf8'); // (위에서 다른 창구가 비운 것을 되돌려 놓는다)
    at(23, 10, 0, 30);
    w.sent.length = 0;
    const t = w.tick();
    ok(JSON.stringify(t.slice(0, 2)) === '["세션에서 추가했어요.","제안했어요."]' && w.sent[0].say.actions[0].changeId === 'c1' && t.some((x) => x.startsWith('일정은 저한테')) && w.pl.muted === 0 && !fs.existsSync(keptFile), `조용히가 끝나면 미뤄 둔 말을 그대로 다시 말함(되돌리기 단추 포함) + 미룬 소개 — ${t.join(' / ')}`);
    step(30); ok(w.tick().length === 0, '그 뒤로는 되풀이하지 않음'); }
  { const cfg = { plannerQuietUntil: new Date(2026, 10, 23, 10, 0, 0).toISOString() };
    at(23, 9, 0); const w = world(null, cfg); w.tick();
    for (let i = 1; i <= 5; i++) w.pl.say({ group: 'info', tone: 'iris', text: `소식 ${i}` });
    at(23, 10, 0, 30);
    const t = w.tick();
    ok(JSON.stringify(t) === '["조용히 하는 동안 플래너 소식이 5개 있었어요. 최근 것부터 알려 드릴게요.","소식 3","소식 4","소식 5"]', `미뤄 둔 말이 많으면 개수를 먼저 말하고 최근 것 셋만 — ${t.join(' / ')}`); }
  { const cfg = { plannerQuietUntil: new Date(2026, 10, 23, 10, 0, 0).toISOString() };
    at(23, 9, 0); const w = world(null, cfg); w.tick();
    // 답을 기다리는 물음(세션이 지우려는 것의 확인)은 뒤에 다른 소식이 많이 와도 빠뜨리지 않는다 — 빠지면 답할 길이 없어진다
    w.pl.say({ group: 'attention', tone: 'warn', sticky: true, text: '지우려고 해요', actions: [{ kind: 'confirm', token: 'a'.repeat(24), yes: true }, { kind: 'confirm', token: 'a'.repeat(24), yes: false }] });
    for (let i = 1; i <= 4; i++) w.pl.say({ group: 'info', tone: 'iris', text: `뒤에 온 소식 ${i}` });
    at(23, 10, 0, 30);
    const t = w.tick();
    ok(JSON.stringify(t) === '["조용히 하는 동안 플래너 소식이 4개 있었어요. 최근 것부터 알려 드릴게요.","지우려고 해요","뒤에 온 소식 2","뒤에 온 소식 3","뒤에 온 소식 4"]', `답을 기다리는 물음은 개수와 상관없이 모두 다시 말함 — ${t.join(' / ')}`); }
  { // 「오늘 하루」 조용히: 아침에 지나간 약속도 조용히가 끝난 자정에 모아 말한다(평소의 12시간보다 오래됐어도)
    at(23, 8, 0);
    const cfg = { plannerQuietUntil: new Date(2026, 10, 24, 0, 0, 0).toISOString() };
    const w = world((add) => { add({ title: '아침 협의회', start: '2026-11-23', time: '09:00' }); }, cfg);
    w.rules.state.morning = '2026-11-23'; w.rules.state.evening = '2026-11-23';
    ok(w.tick().length === 0, '(준비) 조용히 시작');
    at(23, 9, 30); ok(w.tick().length === 0, '조용히 하는 동안 지나간 약속은 말하지 않음');
    at(23, 23, 59, 30); w.tick();
    at(24, 0, 0, 30); w.rules.state.evening = '2026-11-24';
    const t = w.tick();
    ok(t.length === 1 && t[0] === '오전 9시 「아침 협의회」 시간이 지났어요.', `하루 내내 조용히 한 뒤: 아침에 지나간 약속을 자정에 말함 — ${t.join(' / ')}`);
    step(30); ok(w.tick().length === 0, '한 번만'); }
  { // 걸 수 있는 가장 긴 조용히는 하루 — 훨씬 먼 값(설정 파일을 손으로 고친 경우)은 조용히로 보지 않는다
    at(23, 9, 0);
    const w = world(null, { plannerQuietUntil: new Date(2027, 5, 1).toISOString() });
    ok(w.pl.quietNow() === false, '아주 먼 「잠시 조용히」는 믿지 않음(영영 말하지 않게 되지 않게)');
    const w2 = world(null, { plannerQuietUntil: '엉뚱한 글' }); const w3 = world(null, { plannerQuietUntil: new Date(2026, 10, 23, 8, 0).toISOString() });
    ok(w2.pl.quietNow() === false && w3.pl.quietNow() === false, '형식 밖 · 이미 지난 값도 조용히가 아님'); }
  // 말로 시킨 조용히(setQuiet): 설정에 적고 화면의 설정 사본을 맞추는 방송(cfg)을 보낸다
  at(23, 13, 20);
  { const store = { v: {} }; const sent = [];
    const pl = new Planner({ dir: path.join(base, 'q1', 'planner'), stateDir: path.join(base, 'q1'), settings: { get: () => store.v, set: (p) => { store.v = { ...store.v, ...p }; return store.v; } }, broadcast: (o) => sent.push(o), now: () => new Date(clock) });
    pl.start();
    const r = pl.setQuiet({ minutes: 60 });
    ok(r.ok && r.say.startsWith('오후 2시 20분까지 조용히') && store.v.plannerQuietUntil === new Date(2026, 10, 23, 14, 20, 0).toISOString() && sent.at(-1).cfg.plannerQuietUntil === store.v.plannerQuietUntil && pl.quietNow(), `말로 1시간 조용히 — ${r.say}`);
    const r2 = pl.setQuiet({ until: 'today' });
    ok(r2.ok && r2.say.startsWith('오늘은 조용히') && store.v.plannerQuietUntil === new Date(2026, 10, 24, 0, 0, 0).toISOString(), '오늘 하루 = 내일 0시까지');
    const r3 = pl.setQuiet({ off: true });
    ok(r3.ok && store.v.plannerQuietUntil === null && sent.at(-1).cfg.plannerQuietUntil === null && !pl.quietNow(), '다시 알리기 = 조용히 풂');
    ok(!pl.setQuiet({ minutes: 0 }).ok && !pl.setQuiet({ minutes: 5000 }).ok && !pl.setQuiet({}).ok && store.v.plannerQuietUntil === null, '말이 안 되는 길이(0분 · 하루 넘게 · 없음)는 받지 않음');
    const ro = new Planner({ dir: path.join(base, 'q2', 'planner'), stateDir: path.join(base, 'q2'), settings: { get: () => ({}) }, now: () => new Date(clock) }); ro.start();
    ok(ro.setQuiet({ minutes: 30 }).ok === false, '설정을 적을 길이 없으면 했다고 하지 않음'); }
} catch (e) { fail++; console.log(`FAIL 예외: ${e?.stack || e}`); }
finally { try { fs.rmSync(base, { recursive: true, force: true }); } catch {} }
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
