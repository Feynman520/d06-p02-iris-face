// 플래너 장부 검사(2026-11-22, 플래너 걸음 1) — daemon/planner-core.mjs(셈) + planner-store.mjs(파일).
// 임시 폴더의 가짜 장부만 쓴다(진짜 장부 · 데몬 · AI 접촉 0). 시계는 주입한다(실제 시간에 기대지 않음).
//   npm run verify:planner-store
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as C from '../daemon/planner-core.mjs';
import { PlannerStore, PlannerError, SCHEMA } from '../daemon/planner-store.mjs';
import { plannerDir } from '../daemon/paths.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-pl-'));
let dirN = 0;
const logs = [];
let clock = new Date(2026, 10, 23, 9, 0, 0); // 2026-11-23 월요일 09:00 (이 PC 시간)
const mk = (dir = path.join(base, `d${++dirN}`)) => new PlannerStore({ dir, now: () => new Date(clock), log: (m) => logs.push(m) });
const refuses = (fn, code) => { try { fn(); return false; } catch (e) { return e instanceof PlannerError && e.code === code; } };
const U = { by: 'user', via: 'test' };

try {
  // ---- 1. 셈 ----
  ok(C.isDate('2026-11-23') && !C.isDate('2026-02-30') && !C.isDate('2026-1-3') && !C.isDate(20261123), '날짜 판별');
  ok(C.isTime('09:05') && C.isTime('23:59') && !C.isTime('24:00') && !C.isTime('9:5'), '시각 판별');
  ok(C.addDays('2026-11-30', 1) === '2026-12-01' && C.addDays('2026-03-01', -1) === '2026-02-28' && C.diffDays('2026-11-20', '2026-11-25') === 5, '날짜 더하기 · 빼기');
  ok(C.weekday('2026-11-22') === 0 && C.weekday('2026-11-23') === 1 && C.mondayOf('2026-11-22') === '2026-11-16' && C.mondayOf('2026-11-23') === '2026-11-23', '요일 · 그 주의 월요일');
  const A = (o) => ({ id: o.id || `i${o.no}`, state: 'active', end: null, time: null, ...o });
  const single = A({ no: 1, title: '하루', start: '2026-11-23' });
  const period = A({ no: 2, title: '기간', start: '2026-11-24', end: '2026-11-26' });
  ok(C.occursOn(single, '2026-11-23') && !C.occursOn(single, '2026-11-24') && C.occursOn(period, '2026-11-25') && !C.occursOn(period, '2026-11-27'), '하루 · 기간이 있는 날');
  const daily2 = A({ no: 3, title: '이틀마다', start: '2026-11-23', repeat: { freq: 'daily', interval: 2 } });
  ok(C.occursOn(daily2, '2026-11-25') && !C.occursOn(daily2, '2026-11-24') && !C.occursOn(daily2, '2026-11-21'), '반복: 이틀마다');
  const weekly = A({ no: 4, title: '화·목', start: '2026-11-24', repeat: { freq: 'weekly', interval: 1, byDay: [2, 4], until: '2026-12-10', skip: ['2026-12-01'] } });
  ok(C.occursOn(weekly, '2026-11-26') && C.occursOn(weekly, '2026-12-03') && !C.occursOn(weekly, '2026-11-25') && !C.occursOn(weekly, '2026-12-01') && !C.occursOn(weekly, '2026-12-15'), '반복: 요일 · 끝나는 날 · 건너뛰는 날');
  const biweekly = A({ no: 5, title: '격주 화', start: '2026-11-24', repeat: { freq: 'weekly', interval: 2 } });
  ok(C.occursOn(biweekly, '2026-12-08') && !C.occursOn(biweekly, '2026-12-01'), '반복: 격주');
  const monthly = A({ no: 6, title: '매달 31일', start: '2026-10-31', repeat: { freq: 'monthly', interval: 1 } });
  ok(C.occursOn(monthly, '2026-12-31') && !C.occursOn(monthly, '2026-11-30'), '반복: 매달(그 날이 없는 달은 건너뜀)');
  ok(C.doneOn({ ...daily2, repeat: { ...daily2.repeat, done: { '2026-11-25': 'x' } } }, '2026-11-25') && !C.doneOn(daily2, '2026-11-23'), '반복: 날마다 따로 끝냄');

  const book = [
    A({ no: 1, title: '밀린 하루', start: '2026-11-20' }),
    A({ no: 2, title: '가정통신문', start: '2026-11-22', end: '2026-11-27' }),
    A({ no: 3, title: '협의회', start: '2026-11-23', time: '15:00' }),
    A({ no: 4, title: '결과 보고서', start: '2026-11-20', end: '2026-11-25', steps: [{ id: 's1', title: '자료', day: '2026-11-20', done: true }, { id: 's2', title: '초안', day: '2026-11-23' }, { id: 's3', title: '제출', day: '2026-11-25' }] }),
    A({ no: 5, title: '아침 회의', start: '2026-11-23', time: '08:30' }),
    A({ no: 6, title: '그냥 할 일', start: '2026-11-23' }),
    A({ no: 7, title: '끝난 밀린 일', start: '2026-11-19', done: true }),
    A({ no: 8, title: '지난 기간', start: '2026-11-16', end: '2026-11-18' }),
    { ...A({ no: 9, title: '제안', start: '2026-11-23' }), state: 'proposed' },
    { ...A({ no: 10, title: '휴지통', start: '2026-11-23' }), state: 'trash' },
  ];
  const rows = C.dayRows(book, '2026-11-23', '2026-11-23');
  ok(rows.map((r) => r.no).join(',') === '8,1,5,3,4,2,6', '오늘 순서: 밀린 일 → 약속(시각순) → 마감이 가까운 순 → 나머지 (제안 · 휴지통 · 끝낸 밀린 일 제외)');
  ok(rows[0].late && rows[0].red && rows[0].period.index === 0 && rows[1].late && rows[1].lateFrom === '2026-11-20' && !rows[1].red, '밀린 일 표시(기간은 빨강, 하루짜리는 하려던 날)');
  const r4 = rows.find((r) => r.no === 4), r2 = rows.find((r) => r.no === 2);
  ok(r4.period.index === 4 && r4.period.total === 6 && !r4.period.last && !r4.red && r2.period.index === 2, '기간: 며칠째');
  ok(r4.steps.map((s) => `${s.n}${s.cur ? 'c' : ''}${s.done ? 'd' : ''}${s.over ? 'o' : ''}`).join(' ') === '1d 2c 3', '단계: 순서 · 고른 날 · 끝냄');
  const rows25 = C.dayRows(book, '2026-11-25', '2026-11-23');
  ok(rows25.map((r) => r.no).join(',') === '4,2' && rows25[0].red && rows25[0].period.last && !rows25[1].red, '다른 날: 밀린 일 없음 · 마감일은 빨강');
  ok(C.dayRows(book, '2026-11-24', '2026-11-25').find((r) => r.no === 4).steps[1].over, '단계: 날이 지났는데 안 끝낸 것');
  const dots = C.monthDots(book, '2026-11');
  ok(dots['2026-11-23'].n === 5 && dots['2026-11-23'].due === 0 && dots['2026-11-25'].due === 1 && dots['2026-11-27'].due === 1 && dots['2026-11-18'].due === 1 && !dots['2026-11-28'] && !dots['2026-12-01'], '달력 점: 할 것 · 마감');
  const doneBook = book.map((it) => (it.no === 2 ? { ...it, done: true } : it));
  ok(C.monthDots(doneBook, '2026-11')['2026-11-27'].due === 0 && C.monthDots(doneBook, '2026-11')['2026-11-27'].n === 1, '끝낸 기간은 노란 점 없음(파란 점은 남음)');
  ok(C.overlapsWith(book, { id: 'x', start: '2026-11-23', time: '15:30' }).map((o) => o.no).join() === '3', '겹침: 끝 시각이 없으면 1시간으로 봄');
  ok(C.overlapsWith(book, { id: 'x', start: '2026-11-23', time: '16:00' }).length === 0 && C.overlapsWith(book, { id: 'x', start: '2026-11-23', time: '14:00', timeEnd: '15:00' }).length === 0, '겹침: 맞닿는 것은 겹침이 아님');
  ok(C.overlapsWith(book, { id: 'i3', start: '2026-11-23', time: '15:00' }).length === 0 && C.overlapsWith(book, { id: 'x', start: '2026-11-23' }).length === 0, '겹침: 자기 자신 · 시각 없는 일은 보지 않음');
  ok(C.dueInWeek(book, '2026-11-23') === 2 && C.dueInWeek(book, '2026-11-18') === 1, '그 주의 마감 수');

  // ---- 1b. 장부의 자리 ----
  ok(plannerDir({ IRIS_PLANNER_DIR: 'X:\\p' }) === 'X:\\p' && plannerDir({ IRIS_FACE_STATE: 'X:\\st' }) === path.join('X:\\st', 'planner'), '자리: 지정한 폴더 · 시험 데몬은 그 상태 폴더 아래');
  ok(plannerDir({}).endsWith(path.join('_agent', 'planner')) && !plannerDir({}).includes(`${path.sep}state${path.sep}`), '자리: 보통은 영혼 폴더의 _agent\\planner(앱 폴더 밖)');

  // ---- 2. 넣기 · 거절 ----
  const s = mk();
  ok(!fs.existsSync(s.file) && s.list().length === 0 && s.rev === 0, '처음에는 파일을 만들지 않음');
  const r1 = s.apply([{ op: 'add', item: { title: '  협의회  ', start: '2026-11-23', time: '15:00' } }], { by: 'user', via: 'panel', evidence: '내일 3시' });
  const a1 = r1.items[0];
  ok(a1.no === 1 && a1.title === '협의회' && a1.state === 'active' && a1.end === null && a1.source.by === 'user' && a1.source.via === 'panel' && a1.source.evidence === '내일 3시' && s.rev === 1, '넣기: 번호 · 다듬기 · 출처');
  ok(JSON.parse(fs.readFileSync(s.file, 'utf8')).schema === SCHEMA && !fs.readdirSync(s.dir).some((n) => n.includes('.tmp')), '파일로 적힘 · 임시 파일 안 남음');
  for (const [name, item, code] of [['이름 없음', { start: '2026-11-23' }, 'no-title'], ['빈 이름', { title: '   ', start: '2026-11-23' }, 'no-title'], ['날짜 없음', { title: 'x' }, 'no-date'], ['없는 날짜', { title: 'x', start: '2026-02-30' }, 'bad-date'], ['끝이 앞', { title: 'x', start: '2026-11-23', end: '2026-11-20' }, 'end-before-start'], ['이상한 시각', { title: 'x', start: '2026-11-23', time: '25:00' }, 'bad-time'], ['끝 시각만', { title: 'x', start: '2026-11-23', timeEnd: '10:00' }, 'bad-time'], ['기간에 반복', { title: 'x', start: '2026-11-23', end: '2026-11-24', repeat: { freq: 'daily' } }, 'bad-repeat'], ['이상한 반복', { title: 'x', start: '2026-11-23', repeat: { freq: 'yearly' } }, 'bad-repeat'], ['너무 긴 이름', { title: 'x'.repeat(201), start: '2026-11-23' }, 'too-long']]) ok(refuses(() => s.apply([{ op: 'add', item }], U), code), `거절: ${name}`);
  ok(s.rev === 1 && s.list().length === 1, '거절하면 아무것도 적지 않음');
  ok(refuses(() => s.apply([{ op: 'add', item: { title: '됨', start: '2026-11-24' } }, { op: 'update', id: 'nope', patch: { title: 'x' } }], U), 'not-found') && s.list().length === 1 && s.rev === 1, '묶음 가운데 하나라도 안 되면 전부 안 함');
  ok(refuses(() => s.apply([], U), 'no-ops') && refuses(() => s.apply([{ op: 'fly', id: a1.id }], U), 'bad-op'), '거절: 빈 묶음 · 모르는 조작');

  // ---- 3. 기간 · 단계 · 끝냄 ----
  const rBig = s.apply([{ op: 'add', item: { title: '결과 보고서', start: '2026-11-23', end: '2026-11-25', steps: [{ title: '자료', day: '2026-11-20' }, { title: '초안', day: '2026-11-23' }, { title: '제출', day: '2026-11-26' }] } }], { by: 'session', via: 'cli', asked: true, session: { id: 'sess1', title: '보고서 세션', agent: 'claude' } });
  let big = rBig.items[0];
  ok(big.start === '2026-11-20' && big.end === '2026-11-26' && big.steps.every((x) => x.id) && big.source.session.title === '보고서 세션' && big.source.asked, '단계가 기간 밖이면 기간을 넓힘 · 단계 번호 · 세션 출처');
  s.apply([{ op: 'check', id: big.id, stepId: big.steps[0].id, done: true }], U);
  big = s.get(big.id);
  ok(big.steps[0].done && big.steps[0].doneAt && !big.done, '단계 하나 끝냄 → 큰 일은 아직');
  s.apply([{ op: 'check', id: big.id, stepId: big.steps[1].id, done: true }, { op: 'check', id: big.id, stepId: big.steps[2].id, done: true }], U);
  ok(s.get(big.id).done === true && !!s.get(big.id).doneAt, '단계를 다 끝내면 큰 일도 끝냄');
  s.apply([{ op: 'check', id: big.id, done: false }], U);
  ok(s.get(big.id).steps.every((x) => !x.done) && s.get(big.id).done === false && !s.get(big.id).doneAt, '큰 일 체크를 풀면 단계도 모두 풀림');
  const keepId = s.get(big.id).steps[1].id;
  s.apply([{ op: 'check', id: big.id, stepId: keepId, done: true }], U);
  s.apply([{ op: 'update', id: big.id, patch: { steps: [{ id: keepId, title: '초안 쓰기', day: '2026-11-24' }, { title: '새 단계', day: '2026-11-25' }] } }], U);
  big = s.get(big.id);
  ok(big.steps.length === 2 && big.steps[0].id === keepId && big.steps[0].done && big.steps[0].title === '초안 쓰기' && big.steps[1].id && big.start === '2026-11-20', '단계 고치기: 번호 · 끝냄은 유지');
  s.apply([{ op: 'update', id: a1.id, patch: { end: '2026-11-23' } }], U);
  ok(s.get(a1.id).end === null, '끝 날 = 첫날이면 하루짜리');
  s.apply([{ op: 'update', id: a1.id, patch: { time: null } }], U);
  ok(s.get(a1.id).time === null && s.get(a1.id).timeEnd === null, '시각을 지우면 끝 시각도');
  const rep = s.apply([{ op: 'add', item: { title: '학년 협의회', start: '2026-11-24', time: '15:00', repeat: { freq: 'weekly' } } }], U).items[0];
  s.apply([{ op: 'check', id: rep.id, date: '2026-12-01', done: true }], U);
  ok(s.get(rep.id).repeat.done['2026-12-01'] && !s.get(rep.id).done && refuses(() => s.apply([{ op: 'check', id: rep.id, done: true }], U), 'bad-date'), '반복하는 일은 날짜별로 끝냄');
  s.apply([{ op: 'update', id: rep.id, patch: { repeat: { freq: 'weekly', interval: 2, skip: ['2026-12-08'] } } }], U);
  ok(s.get(rep.id).repeat.done['2026-12-01'] && s.get(rep.id).repeat.interval === 2 && s.get(rep.id).repeat.skip[0] === '2026-12-08', '반복 규칙을 고쳐도 끝낸 기록은 남음');
  s.apply([{ op: 'update', id: rep.id, patch: { repeat: null } }], U);
  ok(!('repeat' in s.get(rep.id)), '반복 끄기');

  // ---- 4. 제안 · 휴지통 ----
  const p = s.apply([{ op: 'propose', item: { title: '참관록 양식 확인', start: '2026-11-26' } }], { by: 'iris', via: 'check', evidence: '근거 글' }).items[0];
  ok(p.state === 'proposed' && s.list('active').every((x) => x.id !== p.id) && s.list('proposed').length === 1, '제안은 달력에 올라가지 않음');
  ok(refuses(() => s.apply([{ op: 'check', id: p.id, done: true }], U), 'not-active'), '제안은 끝냄으로 못 바꿈');
  s.apply([{ op: 'accept', id: p.id, patch: { start: '2026-11-27' } }], U);
  ok(s.get(p.id).state === 'active' && s.get(p.id).start === '2026-11-27' && s.get(p.id).source.by === 'iris' && refuses(() => s.apply([{ op: 'accept', id: p.id }], U), 'not-proposed'), '승인(고쳐서) · 출처는 그대로 · 두 번은 안 됨');
  const p2 = s.apply([{ op: 'propose', item: { title: '안 쓸 제안', start: '2026-11-26' } }], { by: 'iris' }).items[0];
  s.apply([{ op: 'decline', id: p2.id }], U);
  ok(s.get(p2.id) === null && refuses(() => s.apply([{ op: 'decline', id: p.id }], U), 'not-proposed'), '추가 안 함 = 없어짐');
  s.apply([{ op: 'remove', id: a1.id }], U);
  ok(s.get(a1.id).state === 'trash' && s.get(a1.id).trashedAt && refuses(() => s.apply([{ op: 'update', id: a1.id, patch: { title: 'x' } }], U), 'in-trash') && refuses(() => s.apply([{ op: 'remove', id: a1.id }], U), 'in-trash'), '지우기 = 휴지통');
  s.apply([{ op: 'restore', id: a1.id }], U);
  ok(s.get(a1.id).state === 'active' && !s.get(a1.id).trashedAt && refuses(() => s.apply([{ op: 'purge', id: a1.id }], U), 'not-in-trash'), '되살리기 · 휴지통 밖은 완전 삭제 못 함');

  // ---- 5. 되돌리기 · 변경 기록 ----
  const u = mk();
  const x1 = u.apply([{ op: 'add', item: { title: '하나', start: '2026-11-23' } }], U).items[0];
  u.apply([{ op: 'update', id: x1.id, patch: { title: '하나 고침', start: '2026-11-24' } }], U);
  u.undo();
  ok(u.get(x1.id).title === '하나' && u.get(x1.id).start === '2026-11-23' && u.rev === 3, '되돌리기: 고치기 전으로');
  ok(refuses(() => u.undo(), 'nothing-to-undo'), '되돌리기를 다시 되돌릴 수는 없음');
  const many = u.apply([{ op: 'add', item: { title: '둘', start: '2026-11-25' } }, { op: 'add', item: { title: '셋', start: '2026-11-26' } }, { op: 'remove', id: x1.id }], U);
  u.undo();
  ok(u.list().length === 1 && u.get(x1.id).state === 'active' && many.ids.length === 3, '한 말에서 나온 여러 조작은 되돌리기 한 번');
  const c1 = u.apply([{ op: 'update', id: x1.id, patch: { title: '첫 변경' } }], U).changeId;
  u.apply([{ op: 'update', id: x1.id, patch: { title: '둘째 변경' } }], U);
  ok(refuses(() => u.undo(c1), 'changed-since') && u.get(x1.id).title === '둘째 변경', '그 뒤에 또 바뀐 일은 되돌리기 거절');
  const ch = u.changes(50);
  ok(ch.length === 7 && ch[0].rev === 7 && ch[ch.length - 1].rev === 1 && ch.filter((c) => c.undone).length === 2 && ch.filter((c) => c.undoOf).length === 2, '변경 기록: 새것부터 · 되돌린 것 표시');
  ok(ch.every((c) => c.at && c.by && Array.isArray(c.ops)) && ch[ch.length - 1].ops[0].before === null && ch[ch.length - 1].ops[0].after.title === '하나', '변경 기록: 언제 · 누가 · 바꾸기 전과 뒤');
  const u2 = mk(u.dir);
  u2.undo();
  ok(u2.get(x1.id).title === '첫 변경', '다시 켠 뒤에도 방금 것 되돌리기(기록 파일에서)');

  // ---- 6. 사본 · 휴지통 비우기 ----
  const b = mk();
  b.apply([{ op: 'add', item: { title: '첫날', start: '2026-11-23' } }], U);
  ok(b.backups().length === 0, '첫 쓰기 전에는 사본으로 둘 장부가 없음');
  b.apply([{ op: 'add', item: { title: '첫날 둘째', start: '2026-11-23' } }], U);
  b.apply([{ op: 'add', item: { title: '첫날 셋째', start: '2026-11-23' } }], U);
  ok(b.backups().join() === 'items-2026-11-23.json' && JSON.parse(fs.readFileSync(path.join(b.backupDir, 'items-2026-11-23.json'), 'utf8')).items.length === 1, '하루에 사본 한 장(그날 사본이 없을 때의 직전 장부)');
  clock = new Date(2026, 10, 24, 8, 0, 0);
  const gone = b.apply([{ op: 'add', item: { title: '지울 것', start: '2026-11-24' } }], U).items[0];
  ok(b.backups()[0] === 'items-2026-11-24.json' && JSON.parse(fs.readFileSync(path.join(b.backupDir, 'items-2026-11-24.json'), 'utf8')).items.length === 3, '다음 날 첫 쓰기 직전 = 전날 마지막 장부');
  b.apply([{ op: 'remove', id: gone.id }], U);
  for (let i = 1; i <= 34; i++) fs.writeFileSync(path.join(b.backupDir, `items-2025-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}.json`), '{}');
  clock = new Date(2026, 11, 23, 8, 0, 0);
  ok(b.sweep().purged === 0 && b.get(gone.id) !== null, '휴지통: 29일째는 그대로');
  clock = new Date(2026, 11, 25, 8, 0, 0);
  const sw = b.sweep();
  ok(sw.purged === 1 && b.get(gone.id) === null && b.backups().length === 30 && b.backups()[0] === 'items-2026-12-25.json', '휴지통 30일 넘으면 지움 · 사본은 새것 30장만');
  clock = new Date(2026, 10, 23, 9, 0, 0);

  // ---- 7. 모르는 칸 · 새 형식 · 깨진 장부 ----
  const k = mk();
  const k1 = k.apply([{ op: 'add', item: { title: '칸 보존', start: '2026-11-23', note: '메모', tags: ['a'], place: '교무실', who: '김', followUp: '2026-11-27', estimate: 30 } }], U).items[0];
  ok(k1.note === '메모' && k1.tags[0] === 'a' && k1.place === '교무실' && k1.followUp === '2026-11-27' && k1.estimate === 30, '나중을 위한 칸도 받아 적음');
  const rawK = JSON.parse(fs.readFileSync(k.file, 'utf8'));
  rawK.futureHead = { a: 1 }; rawK.items[0].futureField = { deep: [1, 2] };
  fs.writeFileSync(k.file, String.fromCharCode(0xFEFF) + JSON.stringify(rawK), 'utf8');
  const k2 = mk(k.dir);
  k2.apply([{ op: 'update', id: k1.id, patch: { title: '고침' } }], U);
  const after = JSON.parse(fs.readFileSync(k2.file, 'utf8'));
  ok(after.futureHead.a === 1 && after.items[0].futureField.deep[1] === 2 && after.items[0].title === '고침' && after.items[0].note === '메모', '모르는 칸(파일 머리 · 항목)을 지우지 않음 · BOM 이 붙어 있어도 읽음');

  const nw = mk();
  nw.apply([{ op: 'add', item: { title: '옛 판이 쓴 것', start: '2026-11-23' } }], U);
  const rawN = JSON.parse(fs.readFileSync(nw.file, 'utf8')); rawN.schema = SCHEMA + 1;
  fs.writeFileSync(nw.file, JSON.stringify(rawN), 'utf8');
  const bytes = fs.readFileSync(nw.file);
  const nw2 = mk(nw.dir);
  ok(nw2.readOnly && nw2.list().length === 1 && refuses(() => nw2.apply([{ op: 'add', item: { title: 'x', start: '2026-11-23' } }], U), 'read-only') && refuses(() => nw2.undo(), 'read-only'), '더 새로운 형식의 장부는 읽기만');
  nw2.markAlerted([{ id: nw2.list()[0].id, key: 'k' }]); nw2.sweep();
  ok(Buffer.compare(bytes, fs.readFileSync(nw.file)) === 0, '읽기만일 때 파일을 한 글자도 바꾸지 않음');

  const br = mk();
  br.apply([{ op: 'add', item: { title: '사본에 든 것', start: '2026-11-23' } }], U);
  br.apply([{ op: 'add', item: { title: '사본 뒤에 넣은 것', start: '2026-11-23' } }], U);
  fs.writeFileSync(br.file, '{ "schema": 1, "items": [ 깨짐', 'utf8');
  const br2 = mk(br.dir);
  const brokenName = fs.readdirSync(br.dir).find((n) => n.startsWith('items.broken-'));
  ok(br2.recovered && br2.recovered.from === 'items-2026-11-23.json' && br2.list().length === 1 && br2.list()[0].title === '사본에 든 것', '깨진 장부 → 가장 새 사본으로 엶');
  ok(brokenName && fs.readFileSync(path.join(br.dir, brokenName), 'utf8').includes('깨짐') && JSON.parse(fs.readFileSync(br.file, 'utf8')).items.length === 1, '깨진 파일은 따로 남김(덮어쓰지 않음)');
  const nb = mk();
  fs.mkdirSync(nb.dir, { recursive: true }); fs.writeFileSync(nb.file, '[]', 'utf8');
  const nb2 = mk(nb.dir);
  ok(nb2.recovered && nb2.recovered.from === null && nb2.list().length === 0 && !fs.existsSync(nb.file) && fs.readdirSync(nb.dir).some((n) => n.startsWith('items.broken-')), '사본도 없으면 빈 장부로 열되 깨진 파일은 남김');
  nb2.apply([{ op: 'add', item: { title: '새로', start: '2026-11-23' } }], U);
  ok(nb2.list().length === 1 && fs.readdirSync(nb.dir).filter((n) => n.startsWith('items.broken-')).length === 1, '그 뒤 쓰기는 새 장부에');

  // ---- 8. 알린 기록 · 로그 ----
  const al = mk();
  const al1 = al.apply([{ op: 'add', item: { title: '비밀 회의 안건', start: '2026-11-23', time: '10:00' } }], U).items[0];
  const revBefore = al.rev;
  al.markAlerted([{ id: al1.id, key: 'start:2026-11-23' }, { id: 'none', key: 'x' }]);
  ok(mk(al.dir).get(al1.id).alerted['start:2026-11-23'] && al.rev === revBefore && al.changes(10).length === 1, '알린 기록은 저장되지만 변경 기록 · 판 번호에는 안 남음');
  ok(logs.length > 10 && !logs.some((m) => /비밀 회의|협의회|결과 보고서|사본에 든|하나 고침/.test(m)), '로그에 일정 내용을 싣지 않음');
  ok(al.byNo(1).id === al1.id && al.byNo(99) === null && al.get('nope') === null, '번호로 찾기');
  const got = al.list(); got[0].title = '밖에서 고침';
  ok(al.get(al1.id).title === '비밀 회의 안건', '돌려준 것은 사본(밖에서 고쳐도 장부는 그대로)');
} catch (e) { fail++; console.log(`FAIL 예외: ${e?.stack || e}`); }
finally { try { fs.rmSync(base, { recursive: true, force: true }); } catch {} }
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
