// 플래너 창구 검사(2026-11-22, 플래너 걸음 2) — daemon/planner.mjs.
//   1절 Planner 를 직접(시계 주입): 보기 한 장 · 겹침/몰림 알려 주기 · 제안에 답하기 · 끄면 쓰기 거절 · 세션 열쇠 · 조사 · 날짜 말
//   2절 시험 데몬 3459 + 임시 상태 폴더: /api/planner/* · 같은 출처 · 판에서는 끝냄만 · 방송 · 진짜 장부 무접촉
//   npm run verify:planner-api      (진짜 데몬 3458 · 진짜 장부 · AI 접촉 0)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { Planner, PLANNER_DEFAULTS, josa, dayLabel, panelOpsOk } from '../daemon/planner.mjs';
import { PlannerStore, PlannerError } from '../daemon/planner-store.mjs';
import { plannerDir } from '../daemon/paths.mjs';
import { addDays, localDate, mondayOf } from '../daemon/planner-core.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3459;
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refuses = (fn, code) => { try { fn(); return false; } catch (e) { return e instanceof PlannerError && e.code === code; } };
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-pa-'));
const realDir = plannerDir({}); const realExisted = fs.existsSync(realDir);
const realStamp = realExisted ? fs.readdirSync(realDir).map((n) => `${n}:${fs.statSync(path.join(realDir, n)).mtimeMs}`).join('|') : '';
const U = { by: 'user', via: 'test' };

// ---- 1. Planner 직접 ----
{
  let clock = new Date(2026, 10, 23, 9, 0, 0); // 2026-11-23 월요일
  const cfg = {}; const sent = []; const logs = [];
  const pl = new Planner({ dir: path.join(base, 'unit', 'planner'), stateDir: path.join(base, 'unit'), settings: { get: () => cfg }, broadcast: (o) => { if (cfg.__castThrows) throw new Error('ws down'); sent.push(o); }, log: (m) => logs.push(m), now: () => new Date(clock) });
  ok(refuses(() => pl.apply([{ op: 'add', item: { title: 'x', start: '2026-11-23' } }], U), 'unavailable') && pl.view().rows.length === 0, '장부를 열기(start) 전에는 쓰기를 받지 않음');
  ok(pl.start() === true, '장부 열기');
  let v = pl.view();
  ok(v.ok && v.enabled && v.empty && v.today === '2026-11-23' && v.day === '2026-11-23' && v.month === '2026-11' && v.rows.length === 0 && v.undo === null && !fs.existsSync(pl.store.dir), '빈 장부: 보기만 해서는 폴더를 만들지 않음');
  ok(Object.keys(PLANNER_DEFAULTS).every((k) => k in pl.cfg()) && pl.cfg().plannerCheck === false && pl.cfg().plannerStartMin === 10, '설정의 처음 값(준비 점검만 끔)');
  const r1 = pl.apply([{ op: 'add', item: { title: '협의회', start: '2026-11-23', time: '15:00' } }], U);
  ok(r1.ok && r1.warnings.length === 0 && sent.length === 1 && sent[0].type === 'planner' && sent[0].rev === 1 && sent[0].proposals === 0 && !('say' in sent[0]), '넣기 → 화면에 방송(판 번호 · 제안 수)');
  const r2 = pl.apply([{ op: 'add', item: { title: '학부모 상담', start: '2026-11-23', time: '15:30' } }], U);
  ok(r2.warnings.length === 1 && r2.warnings[0] === '23일 월요일 15:00 「협의회」와 시간이 겹쳐요.', `겹침은 막지 않고 알려 줌 — ${r2.warnings[0]}`);
  ok(pl.store.list('active').length === 2, '겹쳐도 넣기는 됨');
  ok(pl.apply([{ op: 'check', id: r2.items[0].id, done: true }], U).warnings.length === 0, '끝냄 체크에는 겹침을 말하지 않음');
  ok(pl.apply([{ op: 'add', item: { title: '끝낸 것과 겹침', start: '2026-11-23', time: '15:40' } }], U).warnings[0] === '23일 월요일 15:00 「협의회」와 시간이 겹쳐요.', '끝낸 약속은 겹침 상대로 세지 않음(안 끝낸 것만)');
  pl.store.apply([{ op: 'remove', id: pl.store.list('active').find((it) => it.title === '끝낸 것과 겹침').id }], U);
  cfg.__castThrows = true;
  const rc = pl.apply([{ op: 'check', id: r2.items[0].id, done: false }], U);
  cfg.__castThrows = false;
  ok(rc.ok && pl.store.get(r2.items[0].id).done === false, '화면에 알리다 실패해도 저장된 변경은 성공으로 답함');
  ok(refuses(() => pl.decide(r1.items[0].id, 'false'), 'bad-request') && refuses(() => pl.decide(r1.items[0].id), 'bad-request') && refuses(() => pl.decide('', true), 'bad-request'), '제안에 대한 답은 예 · 아니오가 분명해야 함');
  cfg.plannerOverlap = false;
  ok(pl.apply([{ op: 'add', item: { title: '또 겹침', start: '2026-11-23', time: '15:10' } }], U).warnings.length === 0, '겹침 알림을 끄면 말하지 않음');
  cfg.plannerOverlap = true;
  for (let i = 0; i < 3; i++) pl.apply([{ op: 'add', item: { title: `마감 ${i}`, start: '2026-11-24', end: addDays('2026-11-25', i) } }], U);
  const r3 = pl.apply([{ op: 'add', item: { title: '넷째 마감', start: '2026-11-23', end: '2026-11-27' } }], U);
  ok(r3.warnings.length === 1 && r3.warnings[0] === '27일이 든 주에 마감이 4개 몰려 있어요.', `몰림 — ${r3.warnings[0]}`);
  v = pl.view({ day: '2026-11-27', month: '2026-12' });
  ok(v.day === '2026-11-27' && v.month === '2026-12' && v.rows.some((r) => r.title === '넷째 마감' && r.red) && Object.keys(v.dots).length === 0 && v.undo === r3.changeId, '고른 날 · 고른 달을 따로 볼 수 있음 · 방금 것 되돌리기 번호');
  ok(pl.view({ day: 'nope', month: '2026-13' }).day === '2026-11-23' && pl.view({ month: '2026-13' }).month === '2026-11', '이상한 날짜 · 달은 오늘로');
  const u = pl.undo();
  ok(u.ok && !pl.store.list().some((it) => it.title === '넷째 마감') && pl.view().undo === null, '되돌리기');
  const pr = pl.store.apply([{ op: 'propose', item: { title: '참관록 양식 확인', start: '2026-11-26' } }], { by: 'iris', via: 'check', evidence: '근거' }).items[0];
  ok(pl.proposals().length === 1 && pl.proposals()[0].evidence === '근거' && pl.proposals()[0].by === 'iris' && pl.hello().proposals === 1 && !pl.view({ day: '2026-11-26' }).rows.some((r) => r.title === '참관록 양식 확인'), '제안: 띠에는 보이고 달력에는 없음');
  const d1 = pl.decide(pr.id, true, { start: '2026-11-27' });
  ok(d1.ok && pl.proposals().length === 0 && pl.view({ day: '2026-11-27' }).rows.some((r) => r.title === '참관록 양식 확인') && sent[sent.length - 1].proposals === 0, '제안 승인(고쳐서) → 달력에');
  const pr2 = pl.store.apply([{ op: 'propose', item: { title: '안 넣을 것', start: '2026-11-26' } }], { by: 'iris' }).items[0];
  pl.decide(pr2.id, false);
  ok(pl.store.get(pr2.id) === null && refuses(() => pl.decide(pr2.id, true), 'not-found'), '제안 추가 안 함');
  cfg.plannerEnabled = false;
  ok(!pl.enabled && pl.view().enabled === false && pl.view().rows.length > 0 && refuses(() => pl.apply([{ op: 'add', item: { title: 'x', start: '2026-11-23' } }], U), 'disabled') && refuses(() => pl.undo(), 'disabled'), '플래너를 끄면 쓰기는 거절, 보기는 됨');
  cfg.plannerEnabled = true;
  const k = pl.keyFor('sess-a');
  ok(/^[0-9a-f]{40}$/.test(k) && pl.keyOk('sess-a', k) && !pl.keyOk('sess-b', k) && !pl.keyOk('sess-a', k.slice(0, 39) + (k[39] === '0' ? '1' : '0')) && !pl.keyOk('', k) && !pl.keyOk('sess-a', null), '세션 열쇠: 그 세션의 것만 맞음');
  const pl2 = new Planner({ dir: pl.store.dir, stateDir: path.join(base, 'unit'), settings: { get: () => cfg }, now: () => new Date(clock) }); pl2.start();
  ok(pl2.keyFor('sess-a') === k && fs.readFileSync(path.join(base, 'unit', 'planner-key'), 'utf8').length === 64, '열쇠는 데몬을 다시 켜도 같음(상태 폴더에 보관)');
  ok(!logs.some((m) => m.includes(k) || /협의회|학부모|참관록/.test(m)), '로그에 열쇠 값 · 일정 내용 없음');
  ok(josa('출장', '을', '를') === '을' && josa('협의회', '을', '를') === '를' && josa('회의', '과', '와') === '와' && josa('PPT', '을', '를') === '을(를)', '조사 고르기');
  ok(dayLabel('2026-11-26', '2026-11-23') === '26일 목요일' && dayLabel('2026-12-01', '2026-11-23') === '12월 1일 화요일', '날짜 말(다른 달이면 달도)');
  clock = new Date(2026, 11, 30, 9, 0, 0);
  pl.store.apply([{ op: 'remove', id: pl.store.list('active')[0].id }], U);
  clock = new Date(2027, 1, 5, 9, 0, 0);
  const n0 = sent.length; const sw = pl.sweep();
  ok(sw.purged === 2 && sent.length === n0 + 1, '하루 정리: 휴지통을 비우면 화면에 알림');
  cfg.plannerEnabled = false;
  ok(pl.sweep() === null, '플래너가 꺼져 있으면 자동 정리도 하지 않음');
  cfg.plannerEnabled = true;
  class Boom extends Planner { }
  const bp = new Boom({ dir: path.join(base, 'boom'), stateDir: path.join(base, 'unit'), settings: { get: () => cfg }, log: (m) => logs.push(m) });
  bp.store.load = () => { throw Object.assign(new Error('비밀 경로'), { code: 'EACCES' }); };
  ok(bp.start() === false && bp.failed && bp.view().ok === false && bp.hello().ok === false && refuses(() => bp.apply([{ op: 'add', item: { title: 'x', start: '2026-11-23' } }], U), 'unavailable') && bp.sweep() === null && !logs.some((m) => m.includes('비밀 경로')), '장부를 여는 데 실패해도 던지지 않고 플래너만 쉼 · 사유는 낱말로만 기록');
}

// ---- 2. 시험 데몬 ----
const state = path.join(base, 'state'); const mods = path.join(base, 'mods');
fs.mkdirSync(state, { recursive: true }); fs.mkdirSync(mods, { recursive: true });
fs.writeFileSync(path.join(state, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8');
fs.writeFileSync(path.join(state, 'sessions.json'), '[]', 'utf8');
const today = localDate(new Date());
// 데몬은 실제 시계를 쓰므로 날짜는 모두 "오늘"에서 셈한다(고정 날짜에 기대지 않음)
const seed = new PlannerStore({ dir: path.join(state, 'planner') });
const sTimed = seed.apply([{ op: 'add', item: { title: '약속', start: today, time: '23:58' } }], U).items[0];
const sBig = seed.apply([{ op: 'add', item: { title: '큰 일', start: addDays(today, -1), end: addDays(today, 2), steps: [{ title: '하나', day: addDays(today, -1) }, { title: '둘', day: today }, { title: '셋', day: addDays(today, 2) }] } }], U).items[0];
const sProp = seed.apply([{ op: 'propose', item: { title: '제안', start: addDays(today, 1) } }], { by: 'iris', evidence: '근거' }).items[0];
const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
  env: { ...process.env, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0', IRIS_PLANNER_DIR: '' } });
const api = async (p, init) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const post = (p, body, headers = {}) => api(p, { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${PORT}`, ...headers }, body: JSON.stringify(body) });
let ws; let mine = false;
try {
  // 이 포트에서 답하는 것이 내가 띄운 데몬인지 PID 로 확인한다 — 다른 프로그램이 3459 를 쓰고 있으면 건드리지 않고 멈춘다
  let up = false; for (let i = 0; i < 80 && !up && d.exitCode === null; i++) { await sleep(250); try { const h = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json(); up = h.ok && h.pid === d.pid; } catch {} }
  mine = up;
  ok(up, `시험 데몬 ${PORT} pid=${d.pid}${up ? '' : ' — 내가 띄운 데몬이 아니거나 뜨지 않음(이 포트의 다른 프로그램은 건드리지 않고 멈춤)'}`);
  if (!up) throw new Error('test daemon not mine');
  const got = [];
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  ws.on('message', (raw) => { try { got.push(JSON.parse(raw.toString('utf8'))); } catch {} });
  for (let i = 0; i < 40 && !got.some((m) => m.type === 'hello'); i++) await sleep(100);
  const hello = got.find((m) => m.type === 'hello');
  ok(hello?.planner?.enabled === true && hello.planner.proposals === 1 && hello.planner.rev === 3, '첫 인사에 플래너 상태(켜짐 · 제안 수 · 판 번호)');

  let v = (await api('/api/planner/view')).body;
  ok(v.ok && v.today === today && v.rows.length === 2 && v.rows[0].title === '약속' && v.rows[1].title === '큰 일' && v.rows[1].period.index === 2 && v.rows[1].steps.length === 3 && v.rows[1].steps[1].cur && v.rows[1].steps[0].over, '보기: 오늘의 줄(약속 → 기간 · 단계)');
  ok(v.proposals.length === 1 && v.proposals[0].title === '제안' && v.proposals[0].evidence === '근거' && v.empty === false && typeof v.undo === 'string', '보기: 제안 · 방금 한 변경은 데몬을 다시 켜도 되돌릴 수 있음(장부 파일에 함께 적힘)');
  const dots = v.dots; const dueDay = addDays(today, 2);
  ok(dots[today]?.n === 2 && (dueDay.slice(0, 7) !== v.month || dots[dueDay]?.due === 1) && !Object.values(dots).some((x) => x.n === 0 && x.due === 0), '보기: 달력 점');
  const v2 = (await api(`/api/planner/view?day=${addDays(today, 2)}&month=${addDays(today, 2).slice(0, 7)}`)).body;
  ok(v2.day === addDays(today, 2) && v2.rows.length === 1 && v2.rows[0].red && v2.rows[0].period.last, '보기: 마감일은 빨강');

  const n0 = got.length;
  const c1 = await post('/api/planner/ops', { ops: [{ op: 'check', id: sBig.id, stepId: sBig.steps[1].id, done: true }] });
  for (let i = 0; i < 20 && !got.slice(n0).some((m) => m.type === 'planner'); i++) await sleep(50);
  const cast = got.slice(n0).find((m) => m.type === 'planner');
  ok(c1.status === 200 && c1.body.ok && c1.body.rev === 4 && cast?.rev === 4 && cast.proposals === 1, '끝냄 체크 → 적힘 + 방송');
  v = (await api('/api/planner/view')).body;
  ok(v.rows[1].steps[1].done && !v.rows[1].done && v.undo === c1.body.changeId, '체크가 보기에 반영 · 되돌리기 번호');
  const c2 = await post('/api/planner/ops', { ops: [{ op: 'add', item: { title: '몰래 넣기', start: today } }] });
  const c3 = await post('/api/planner/ops', { ops: [{ op: 'check', id: sTimed.id, done: true }, { op: 'remove', id: sTimed.id }] });
  ok(c2.status === 400 && c2.body.code === 'panel-check-only' && c3.status === 400 && (await api('/api/planner/view')).body.rev === 4, '판에서는 넣기를 안 받음 · 지우기를 다른 조작과 묶어 보내도 안 받음');
  // 2026-11-23: 달력에서 손으로 하는 것 = 끝냄 + 일정 삭제(하나) + 일정 창의 고치기 하나(이름 · 기간 · 시각 · 장소 · 상대 · 메모). 그 밖은 여전히 거절(실제로 되는 것은 verify:planner-ui 가 끝까지 본다).
  {
    const tries = [
      [{ op: 'update', id: sTimed.id, patch: { title: '새 이름', steps: [] } }],                    // 창에 없는 칸(단계)이 섞임
      [{ op: 'update', id: sTimed.id, patch: { steps: [{ title: '몰래 단계', day: today }] } }], [{ op: 'update', id: sTimed.id, patch: { repeat: { freq: 'daily' } } }],
      [{ op: 'update', id: sTimed.id, patch: { folder: 'C:\\x' } }], [{ op: 'update', id: sTimed.id, patch: { alerts: { off: true } } }], [{ op: 'update', id: sTimed.id, patch: { state: 'trash' } }],
      [{ op: 'update', id: sTimed.id, patch: { title: 7 } }], [{ op: 'update', id: sTimed.id, patch: { title: null } }], [{ op: 'update', id: sTimed.id, patch: { start: null } }],
      [{ op: 'update', id: sTimed.id, patch: { time: 930 } }], [{ op: 'update', id: sTimed.id, patch: { note: { a: 1 } } }], [{ op: 'update', id: sTimed.id, patch: ['title'] }],
      [{ op: 'update', id: sTimed.id }], [{ op: 'update', id: sTimed.id, patch: {} }], [{ op: 'update', patch: { title: '주인 없음' } }],
      [{ op: 'remove', id: sTimed.id }, { op: 'remove', id: sBig.id }],                             // 한 번에 둘
      [{ op: 'update', id: sTimed.id, patch: { title: 'a' } }, { op: 'update', id: sBig.id, patch: { title: 'b' } }],
      [{ op: 'purge', id: sTimed.id }], [{ op: 'restore', id: sTimed.id }], [{ op: 'remove' }], [], [null], ['remove'],
    ];
    const got2 = []; for (const ops of tries) got2.push(await post('/api/planner/ops', { ops }));
    ok(got2.every((r) => r.status === 400 && r.body.code === 'panel-check-only') && (await api('/api/planner/view')).body.rev === 4, `달력에서 안 받는 조작 ${tries.length}가지(단계 · 반복 · 폴더 · 알림 고치기 · 값의 모양이 틀린 것 · 둘 이상 · 완전히 지우기 · 되살리기) — 장부 그대로`);
    ok(panelOpsOk([{ op: 'check', id: 'a', done: true }, { op: 'check', id: 'b', done: false }]) && panelOpsOk([{ op: 'remove', id: 'a' }]) && panelOpsOk([{ op: 'update', id: 'a', patch: { title: '새 이름' } }])
      && panelOpsOk([{ op: 'update', id: 'a', patch: { title: '새 이름', start: '2026-11-24', end: '2026-12-11', time: '15:00', timeEnd: '16:30', note: '메모', place: '장소', who: '상대' } }])
      && panelOpsOk([{ op: 'update', id: 'a', patch: { end: null, time: null, timeEnd: null, note: null, place: null, who: null } }]), '달력에서 받는 조작: 끝냄(여럿) · 지우기 하나 · 일정 창의 고치기 하나(여덟 칸 — 비우기는 null)');
  }
  const c4 = await post('/api/planner/ops', { ops: [{ op: 'check', id: sTimed.id, done: true }] }, { origin: 'http://evil.example' });
  const c5 = await api('/api/planner/ops', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body: JSON.stringify({ ops: [{ op: 'check', id: sTimed.id, done: true }] }) });
  ok(c4.status === 403 && c5.status === 403 && (await api('/api/planner/view')).body.rev === 4, '다른 출처의 쓰기는 403');
  const c6 = await post('/api/planner/ops', { ops: [{ op: 'check', id: 'nope', done: true }] });
  const c7 = await api('/api/planner/ops', { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${PORT}` }, body: '{깨짐' });
  ok(c6.status === 404 && c6.body.code === 'not-found' && typeof c6.body.error === 'string' && c7.status === 400, '없는 일 404 · 깨진 요청 400');

  const u1 = await post('/api/planner/undo', {});
  v = (await api('/api/planner/view')).body;
  ok(u1.status === 200 && !v.rows[1].steps[1].done && v.undo === null, '되돌리기');
  {
    // 일정 창의 고치기가 창구를 실제로 지나 장부에 닿는다 · 값이 틀리면 장부가 사유와 함께 거절한다(창구는 모양만 본다)
    const before = (await api('/api/planner/view')).body.rev;
    const e1 = await post('/api/planner/ops', { ops: [{ op: 'update', id: sTimed.id, patch: { start: '2026-13-45' } }] });
    const e2 = await post('/api/planner/ops', { ops: [{ op: 'update', id: sTimed.id, patch: { time: '25:00' } }] });
    const e3 = await post('/api/planner/ops', { ops: [{ op: 'update', id: sTimed.id, patch: { end: addDays(today, -30) } }] });
    ok(e1.status === 400 && e1.body.code === 'bad-date' && e2.body.code === 'bad-time' && e3.body.code === 'end-before-start' && (await api('/api/planner/view')).body.rev === before, `틀린 날짜 · 시각 · 앞뒤가 바뀐 기간은 장부가 거절 — ${e1.body.code} · ${e2.body.code} · ${e3.body.code}`);
    const w1 = await post('/api/planner/ops', { ops: [{ op: 'update', id: sTimed.id, patch: { note: '창에서 적은 메모', place: '과학실' } }] });
    const row1 = (await api('/api/planner/view')).body.rows.find((r) => r.id === sTimed.id);
    ok(w1.status === 200 && w1.body.ok && !!w1.body.changeId && row1.note === '창에서 적은 메모' && row1.place === '과학실' && row1.start === today && row1.end === today, `일정 창의 고치기가 장부에 닿음 · 줄 자료에 처음 · 마지막 날(start · end)이 실림 — ${JSON.stringify({ s: row1.start, e: row1.end })}`);
    const w2 = await post('/api/planner/undo', { changeId: w1.body.changeId });
    ok(w2.status === 200 && (await api('/api/planner/view')).body.rows.find((r) => r.id === sTimed.id).note === null, '그 고치기도 「되돌리기」로 돌아감');
  }
  ok((await post('/api/planner/undo', {})).status === 400, '되돌릴 것이 없으면 400');
  const dd = await post('/api/planner/decide', { id: sProp.id, yes: true, patch: { start: today } });
  v = (await api('/api/planner/view')).body;
  ok(dd.status === 200 && v.proposals.length === 0 && v.rows.some((r) => r.title === '제안'), '제안 승인(오늘로 고쳐서)');
  ok((await post('/api/planner/decide', { id: sProp.id, yes: true })).body.code === 'not-proposed', '같은 제안에 두 번 답할 수 없음');
  const revD = (await api('/api/planner/view')).body.rev;
  const bad1 = await post('/api/planner/decide', { id: sProp.id, yes: 'false' }); const bad2 = await post('/api/planner/decide', { id: sProp.id });
  const bad3 = await api('/api/planner/decide', { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${PORT}` }, body: 'null' });
  const bad4 = await api('/api/planner/ops', { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${PORT}` }, body: '[1]' });
  ok(bad1.status === 400 && bad1.body.code === 'bad-request' && bad2.status === 400 && bad3.status === 400 && bad4.status === 400 && (await api('/api/planner/view')).body.rev === revD, '분명하지 않은 답 · null · 배열 본문은 400(바뀌는 것 없음)');
  await post('/api/planner/ops', { ops: [{ op: 'check', id: sTimed.id, done: true }] }, { origin: 'http://secret-origin-xyz.example' });
  ok((await api('/api/planner/changes?limit=3')).body.changes.length === 3 && (await api('/api/planner/nope')).status === 404, '변경 기록 읽기 · 없는 길 404');

  await api('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plannerEnabled: false }) });
  const off = await post('/api/planner/ops', { ops: [{ op: 'check', id: sTimed.id, done: true }] });
  v = (await api('/api/planner/view')).body;
  ok(off.status === 409 && off.body.code === 'disabled' && v.enabled === false && v.rows.length === 3, '플래너를 끄면 쓰기 409, 보기는 됨');
  await api('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plannerEnabled: true }) });
  ok((await post('/api/planner/ops', { ops: [{ op: 'check', id: sTimed.id, done: true }] })).status === 200, '다시 켜면 됨');

  const onDisk = JSON.parse(fs.readFileSync(path.join(state, 'planner', 'items.json'), 'utf8'));
  ok(onDisk.items.find((it) => it.id === sTimed.id).done === true && !fs.existsSync(path.join(state, 'planner-key')), '시험 데몬의 장부 = 상태 폴더 아래 · 쓰지 않은 열쇠 파일은 만들지 않음');
  const nowStamp = fs.existsSync(realDir) ? fs.readdirSync(realDir).map((n) => `${n}:${fs.statSync(path.join(realDir, n)).mtimeMs}`).join('|') : '';
  ok(fs.existsSync(realDir) === realExisted && nowStamp === realStamp, '진짜 장부 폴더 무접촉');
  const log = fs.readFileSync(path.join(state, 'daemon.log'), 'utf8');
  ok(/planner: on rev=3/.test(log) && !/약속|큰 일|제안|몰래/.test(log) && !/secret-origin|evil\.example/.test(log) && /403 POST \/api\/planner\/ops \(다른 출처\)/.test(log), '데몬 로그: 플래너 시작 줄 · 일정 내용도 요청이 준 글자(출처)도 없음');
} catch (x) { fail++; console.log(`FAIL unexpected — ${x?.stack || x}`); }
finally {
  try { ws?.close(); } catch {}
  // 끄기 직전에 한 번 더: 이 포트에서 답하는 것이 아직 내가 띄운 데몬일 때만 종료를 보낸다
  if (mine) { try { const h = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json(); if (h.pid === d.pid) await fetch(`http://127.0.0.1:${PORT}/api/shutdown`, { method: 'POST' }); } catch {} }
  let alive = true; for (let i = 0; i < 16 && alive; i++) { await sleep(250); try { process.kill(d.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; } }
  if (alive) { try { process.kill(d.pid); } catch {} }
  try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
}
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
