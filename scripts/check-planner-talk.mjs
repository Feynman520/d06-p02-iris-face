// 아이리스에게 말하기 검사(2026-11-22, 플래너 걸음 6) — daemon/planner-talk.mjs.
// 숨은 AI 는 가짜 실행기로 바꿔 끼운다(실제 AI · 계정 · 중계기 접촉 0). 시계 주입, 임시 장부.
// 실제 AI 로 재 보는 것은 손 실측 스크립트 scripts/try-planner-talk.mjs(검사에는 들어가지 않는다).
//   npm run verify:planner-talk
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Planner } from '../daemon/planner.mjs';
import { PlannerRules } from '../daemon/planner-rules.mjs';
import { PlannerTalk, SYSTEM, bookText, parseReply, readClaude, runAgent, TEXT_MAX } from '../daemon/planner-talk.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-pt-'));
let n = 0;
const U = { by: 'user', via: 'test' };
let clock = new Date(2026, 10, 23, 9, 0, 0); // 2026-11-23 월요일 09:00
const J = (say, ops = []) => JSON.stringify({ say, ops });

function world({ agents = ['claude', 'codex'], cfg = {} } = {}) {
  const dir = path.join(base, `w${++n}`); const sent = []; const logs = []; const calls = []; const script = [];
  const pl = new Planner({ dir: path.join(dir, 'planner'), stateDir: dir, settings: { get: () => cfg }, broadcast: (o) => sent.push(o), log: (m) => logs.push(m), now: () => new Date(clock) });
  pl.start();
  pl.rules = new PlannerRules({ planner: pl, stateDir: dir, now: () => new Date(clock), log: (m) => logs.push(m) });
  const run = async (a) => { calls.push(a); const next = script.shift(); if (!next) return { ok: false, reason: 'failed', ms: 1 }; return typeof next === 'string' ? { ok: true, text: next, model: 'claude-haiku-5-5', modelActual: true, tokens: 3200, ms: 5000 } : { ms: 1, ...next }; };
  const talk = new PlannerTalk({ planner: pl, stateDir: dir, agents: () => agents, run, now: () => new Date(clock), log: (m) => logs.push(m) });
  pl.talkSvc = talk;
  const add = (item, meta = U) => pl.store.apply([{ op: 'add', item }], meta).items[0];
  const reply = (...r) => script.push(...r);
  return { pl, talk, sent, logs, calls, cfg, dir, add, reply, script };
}
function seed(w) {
  return {
    late: w.add({ title: '수행평가 채점 기준 확인', start: '2026-11-20' }),
    news: w.add({ title: '가정통신문 회신 정리', start: '2026-11-22', end: '2026-11-27' }, { by: 'session', via: 'cli', asked: true, evidence: '마감은 금요일', session: { id: 's1', title: '가정통신문 정리', agent: 'claude' } }),
    meet: w.add({ title: '협의회', start: '2026-11-23', time: '15:00' }),
    big: w.add({ title: '결과 보고서 제출', start: '2026-11-20', end: '2026-11-25', steps: [{ title: '자료 모으기', day: '2026-11-20', done: true }, { title: '초안 검토', day: '2026-11-23' }, { title: '제출', day: '2026-11-25' }] }),
    rep: w.add({ title: '학년 협의회', start: '2026-11-24', time: '15:00', repeat: { freq: 'weekly', interval: 1, byDay: [2] } }),
    far: w.add({ title: '졸업식 준비', start: '2027-02-10' }),
    far2: w.add({ title: '먼 날의 다른 일', start: '2027-03-02' }),
  };
}

try {
  // ---- 1. 넘기는 수첩 글 ----
  { const w = world(); const s = seed(w);
    const gone = w.add({ title: '지운 일', start: '2026-11-23' }); w.pl.store.apply([{ op: 'remove', id: gone.id }], U);
    const prop = w.pl.store.apply([{ op: 'propose', item: { title: '참관록 양식 확인', start: '2026-11-26' } }], { by: 'iris', via: 'check' }).items[0];
    const b = bookText(w.pl.store, '가정통신문은 30일까지로', new Date(clock), prop.id);
    ok(b.startsWith('오늘: 2026-11-23 월요일 09:00\n수첩(2026-11-09 ~ 2027-01-22):'), '수첩 글: 오늘(요일 · 시각)과 범위');
    ok(b.includes(`#${s.meet.no} 협의회 2026-11-23 15:00`) && b.includes(`#${s.big.no} 결과 보고서 제출 2026-11-20~2026-11-25 단계[1 자료 모으기 2026-11-20 끝냄 / 2 초안 검토 2026-11-23 / 3 제출 2026-11-25]`) && b.includes(`#${s.rep.no} 학년 협의회 2026-11-24 15:00 반복(weekly 요일2)`), '수첩 글: 번호 · 기간 · 시각 · 단계 · 반복');
    ok(b.includes(`#${s.news.no} 가정통신문 회신 정리 2026-11-22~2026-11-27 (2026-11-23 「가정통신문 정리」에서 넣음 · 근거: 마감은 금요일)`) && !b.includes('협의회 2026-11-23 15:00 ('), '말에 나온 일에만 누가 · 왜 넣었는지');
    ok(!b.includes('졸업식') && b.includes('(그 밖에 2건이 더 있다'), '먼 날의 일은 넘기지 않고 개수만');
    ok(bookText(w.pl.store, '졸업식 언제였지', new Date(clock)).includes(`그 밖의 날(말에 나온 것만):\n#${s.far.no} 졸업식 준비 2027-02-10 (2026-11-23 직접 말함)`), '먼 날의 일도 말에 나오면 넘김');
    ok(b.includes(`휴지통:\n#${gone.no} 지운 일 2026-11-23`) && b.includes(`제안(아직 달력에 없음):\n#${prop.no} 참관록 양식 확인 2026-11-26  ← 지금 이야기하는 제안`), '휴지통 · 제안은 따로');
    ok(bookText(new Planner({ dir: path.join(base, 'empty'), stateDir: base, settings: { get: () => ({}) } }).store, 'x', new Date(clock)).includes('(비어 있음)'), '빈 수첩'); }

  // ---- 2. 답 읽기 ----
  ok(parseReply('```json\n{"say":"넣었어요","ops":[{"op":"add"}]}\n```').ops.length === 1 && parseReply('말 {"say":"a"} 끝').say === 'a' && parseReply('{"say":"a"}').ops.length === 0, '답 읽기: 앞뒤에 말 · 울타리가 붙어 있어도');
  ok(parseReply('그냥 말') === null && parseReply('{"say":"a","ops":{}}') === null && parseReply('[1]') === null && parseReply('{깨짐}') === null && parseReply(null) === null, '답 읽기: 형식 밖은 null');
  const good = JSON.stringify({ type: 'result', is_error: false, result: '{"say":"a","ops":[]}', usage: { input_tokens: 2, cache_creation_input_tokens: 2919, cache_read_input_tokens: 0, output_tokens: 353 }, modelUsage: { 'claude-haiku-5-5': {} } });
  const rc = readClaude(good, 0);
  ok(rc.ok && rc.tokens === 3274 && rc.model === 'claude-haiku-5-5' && rc.modelActual === true, '실행 결과 읽기: 답 · 쓴 토큰 · 실제 응답 모델');
  ok(readClaude(JSON.stringify({ result: 'Failed to authenticate: this login reached its time limit', usage: {} }), 0).reason === 'auth' && readClaude(JSON.stringify({ is_error: true, result: 'API Error: 429 rate limit' }), 1).reason === 'limit' && readClaude('', 1).reason === 'exit' && readClaude('', 0).reason === 'empty' && readClaude(JSON.stringify({ result: '   ' }), 0).reason === 'empty', '실행 결과 읽기: 로그인 풀림 · 한도 · 빈 답 · 비정상 종료');
  ok(readClaude(JSON.stringify({ result: 'x', usage: {} }), 0).modelActual === false, '실제 모델을 못 받았으면 그렇게 표시');
  const bad = await runAgent({ agent: 'claude', system: 's', prompt: 'p', exe: null });
  ok(bad.ok === false && bad.reason === 'no-program', '프로그램이 없으면 부르지 않고 사유만');

  // ---- 3. 넣기 · 고치기 ----
  { const w = world(); const s = seed(w);
    w.reply(J('26일 목요일부터 27일 금요일까지로 넣었어요.', [{ op: 'add', title: '출장', start: '2026-11-26', end: '2026-11-27', bogus: 1 }]));
    const r = await w.talk.talk({ text: '  26일부터   27일까지 출장 ', recent: [{ who: 'ai', text: '넣을 것이나 바꿀 것을 말해 주세요.' }, { who: 'me', text: '안녕' }] });
    const it = w.pl.store.list('active').find((x) => x.title === '출장');
    ok(r.ok && r.say === '26일 목요일부터 27일 금요일까지로 넣었어요.' && r.changeId && r.goto === '2026-11-26' && JSON.stringify(r.cards) === '[{"title":"출장","start":"2026-11-26","end":"2026-11-27","time":null}]', '넣기: 답 · 카드 · 되돌리기 번호 · 그 날로');
    ok(it && it.source.by === 'user' && it.source.via === 'talk' && it.source.evidence === '26일부터 27일까지 출장' && !('bogus' in it), '넣기: 출처 = 말(근거로 그 말) · 모르는 칸은 받지 않음');
    ok(w.calls.length === 1 && w.calls[0].agent === 'claude' && w.calls[0].system === SYSTEM && w.calls[0].prompt.includes('사용자의 말: 26일부터 27일까지 출장') && w.calls[0].prompt.includes('지금까지의 대화:\n아이리스: 넣을 것이나') && w.calls[0].prompt.includes('사용자: 안녕'), '부르는 말: 안내문 · 수첩 · 지금까지의 대화 · 사용자의 말');
    w.pl.undo(r.changeId);
    ok(!w.pl.store.list('active').some((x) => x.title === '출장'), '한 말에서 나온 것은 되돌리기 한 번');
    w.reply(J('30일까지로 늘렸어요.', [{ op: 'update', no: s.news.no, end: '2026-11-30' }]));
    const r2 = await w.talk.talk({ text: '가정통신문은 30일까지로' });
    ok(r2.ok && w.pl.store.get(s.news.id).end === '2026-11-30' && r2.cards[0].end === '2026-11-30', '고치기: 번호로 그 일만');
    w.reply(J('넣었어요.', [{ op: 'add', title: '학부모 상담', start: '2026-11-23', time: '15:30' }]));
    const r3 = await w.talk.talk({ text: '오늘 3시 반 학부모 상담' });
    ok(r3.ok && r3.warnings.length === 1 && r3.warnings[0].includes('「협의회」와 시간이 겹쳐요'), '겹침은 창구가 알려 준 것을 함께 돌려줌'); }

  // ---- 4. 되묻기 · 물음 · 못 알아들음 · 검사에 걸림 ----
  { const w = world(); const s = seed(w); const rev = w.pl.store.rev;
    w.reply(J('수요일(25일) 몇 시인가요?', [{ op: 'ask' }]));
    const a = await w.talk.talk({ text: '수요일에 학부모 상담' });
    ok(a.ok && a.ask === true && a.say === '수요일(25일) 몇 시인가요?' && !a.changeId && w.pl.store.rev === rev, '되묻기: 말만 하고 아무것도 적지 않음');
    w.reply(J('협의회는 오늘 오후 3시예요.'));
    const q = await w.talk.talk({ text: '협의회 언제였지' });
    ok(q.ok && q.say === '협의회는 오늘 오후 3시예요.' && !q.changeId, '물음: 답만');
    w.reply('죄송하지만 이해하지 못했습니다');
    const b1 = await w.talk.talk({ text: '어쩌고' });
    ok(!b1.ok && b1.say.includes('잘 못 알아들었어요') && w.pl.store.rev === rev, '형식 밖의 답: 적지 않고 다시 말해 달라고');
    w.reply(J('고쳤어요.', [{ op: 'update', no: 9999, title: 'x' }]));
    const b2 = await w.talk.talk({ text: '없는 것 고쳐' });
    ok(!b2.ok && b2.say.includes('수첩에 없는 일을 가리켰어요') && w.pl.store.rev === rev, '없는 번호를 가리킨 답: 적지 않음');
    w.reply(J('넣었어요.', [{ op: 'add', title: '거꾸로', start: '2026-11-27', end: '2026-11-25' }]));
    const b3 = await w.talk.talk({ text: '거꾸로' });
    ok(!b3.ok && b3.say === '넣지 못했어요. 끝나는 날이 시작하는 날보다 앞입니다.' && w.pl.store.rev === rev, '검사에 걸린 답: 사유를 말하고 적지 않음');
    w.reply(J('했어요.', [{ op: 'add', title: '하나', start: '2026-11-24' }, { op: 'update', no: s.meet.no, time: '25:00' }]));
    const b4 = await w.talk.talk({ text: '둘 다' });
    ok(!b4.ok && w.pl.store.rev === rev && !w.pl.store.list().some((x) => x.title === '하나'), '여러 조작 가운데 하나라도 안 되면 전부 안 함');
    w.reply(J('했어요.', [{ op: 'fly', no: 1 }]));
    ok(!(await w.talk.talk({ text: '날아' })).ok && w.pl.store.rev === rev, '모르는 조작은 받지 않음'); }

  // ---- 5. 큰 변경은 먼저 묻는다 ----
  { const w = world(); const s = seed(w); const rev = w.pl.store.rev;
    w.reply(J('지웠어요.', [{ op: 'remove', no: s.late.no }]));
    const c = await w.talk.talk({ text: '채점 기준 확인 지워 줘' });
    ok(c.ok && typeof c.confirm === 'string' && c.say === '「수행평가 채점 기준 확인」을(를) 지우기 — 이렇게 할까요?' && !c.changeId && w.pl.store.rev === rev && w.pl.store.get(s.late.id).state === 'active', `지우기는 먼저 묻는다(아이리스가 "지웠어요"라고 해도 아직 안 지움) — ${c.say}`);
    const y = await w.talk.talk({ confirm: c.confirm, yes: true });
    ok(y.ok && y.say === '그렇게 했어요.' && y.changeId && w.pl.store.get(s.late.id).state === 'trash', '그렇게 해 주세요 → 그때 적용(휴지통)');
    ok(!(await w.talk.talk({ confirm: c.confirm, yes: true })).ok && w.calls.length === 1, '같은 물음에 두 번 답할 수 없음 · 확인에는 AI 를 부르지 않음');
    w.reply(J('옮겼어요.', [{ op: 'update', no: s.news.no, end: '2026-11-28' }, { op: 'update', no: s.meet.no, time: '16:00' }, { op: 'check', no: s.big.no, step: 2, done: true }]));
    const c2 = await w.talk.talk({ text: '셋 다 바꿔' });
    ok(c2.confirm && c2.say === '3건 고치기 — 이렇게 할까요?', '세 건 이상 한꺼번에 바꾸기도 먼저 묻는다');
    const no = await w.talk.talk({ confirm: c2.confirm, yes: false });
    ok(no.ok && no.say === '알겠어요. 그대로 둘게요.' && w.pl.store.get(s.meet.id).time === '15:00', '아니요 → 그대로');
    w.reply(J('지웠어요.', [{ op: 'remove', no: s.meet.no }]));
    const c3 = await w.talk.talk({ text: '협의회 지워' });
    clock = new Date(2026, 10, 23, 9, 11, 0);
    ok(!(await w.talk.talk({ confirm: c3.confirm, yes: true })).ok && w.pl.store.get(s.meet.id).state === 'active', '물어본 지 10분이 넘으면 하지 않음');
    clock = new Date(2026, 10, 23, 9, 0, 0);
    w.reply(J('고쳤어요.', [{ op: 'update', no: s.news.no, end: '2026-11-28' }, { op: 'add', title: '새 일', start: '2026-11-24' }]));
    const small = await w.talk.talk({ text: '하나 고치고 하나 넣어' });
    ok(small.ok && small.changeId && !small.confirm, '하나 고치고 하나 넣는 것은 바로'); }

  // ---- 6. 단계 · 끝냄 · 반복 · 제안 · 되살리기 ----
  { const w = world(); const s = seed(w);
    w.reply(J('네 단계로 다시 나눴어요.', [{ op: 'update', no: s.big.no, steps: [{ title: '자료 모으기', day: '2026-11-20' }, { title: '초안 쓰기', day: '2026-11-23' }, { title: '검토', day: '2026-11-24' }, { title: '제출', day: '2026-11-25' }] }]));
    await w.talk.talk({ text: '결과 보고서 단계 다시 나눠 줘' });
    const big = w.pl.store.get(s.big.id);
    ok(big.steps.length === 4 && big.steps[0].id === s.big.steps[0].id && big.steps[0].done === true && big.steps[1].title === '초안 쓰기' && big.steps[1].id === s.big.steps[1].id && big.steps[3].id !== s.big.steps[2].id, '단계를 다시 적어도 같은 순서의 단계는 번호 · 끝냄을 이음');
    w.reply(J('끝냄으로 표시했어요.', [{ op: 'check', no: s.big.no, step: 2, done: true }]));
    await w.talk.talk({ text: '초안 쓰기 끝냈어' });
    ok(w.pl.store.get(s.big.id).steps[1].done === true, '단계 끝냄(순서 번호로)');
    w.reply(J('없는 단계', [{ op: 'check', no: s.big.no, step: 9, done: true }]));
    ok(!(await w.talk.talk({ text: '9단계 끝' })).ok, '없는 단계는 받지 않음');
    w.reply(J('이번 주 것을 끝냄으로 했어요.', [{ op: 'check', no: s.rep.no, done: true, date: '2026-11-24' }]));
    await w.talk.talk({ text: '내일 학년 협의회는 끝난 걸로' });
    ok(!!w.pl.store.get(s.rep.id).repeat.done['2026-11-24'], '반복하는 일은 그날 것만');
    w.reply(J('매주 화요일 오후 3시로 넣었어요.', [{ op: 'add', title: '동아리', start: '2026-11-24', time: '15:00', repeat: { freq: 'weekly', byDay: [2] } }]));
    const rr = await w.talk.talk({ text: '매주 화요일 3시 동아리' });
    ok(rr.ok && w.pl.store.list('active').find((x) => x.title === '동아리').repeat.freq === 'weekly', '반복하는 일 넣기');
    const prop = w.pl.store.apply([{ op: 'propose', item: { title: '참관록 양식 확인', start: '2026-11-26' } }], { by: 'iris', via: 'check' }).items[0];
    w.reply(J('금요일로 바꿔서 넣었어요.', [{ op: 'accept', no: prop.no, start: '2026-11-27' }]));
    const ra = await w.talk.talk({ text: '금요일로 바꿔서 넣어 줘', proposal: prop.id });
    ok(ra.ok && w.pl.store.get(prop.id).state === 'active' && w.pl.store.get(prop.id).start === '2026-11-27' && w.calls[w.calls.length - 1].prompt.includes('← 지금 이야기하는 제안'), '「말로 고치기」: 그 제안을 고쳐서 달력에');
    const gone = w.add({ title: '지웠던 출장', start: '2026-11-26' }); w.pl.store.apply([{ op: 'remove', id: gone.id }], U);
    w.reply(J('되살렸어요.', [{ op: 'restore', no: gone.no }]));
    const rs = await w.talk.talk({ text: '아까 지운 출장 되살려 줘' });
    ok(rs.ok && w.pl.store.get(gone.id).state === 'active', '휴지통에서 되살리기(말로)'); }

  // ---- 7. 받지 않는 때 ----
  { const w = world(); seed(w);
    ok((await w.talk.talk({ text: '   ' })).say.includes('무엇을') && (await w.talk.talk({ text: 'x'.repeat(TEXT_MAX + 1) })).say.includes('너무 길어요') && w.calls.length === 0, '빈 말 · 너무 긴 말은 AI 를 부르지 않음');
    w.cfg.plannerTalk = false;
    ok((await w.talk.talk({ text: '출장' })).say.includes('말하기가 꺼져 있어요') && w.calls.length === 0, '말하기를 끄면 부르지 않음');
    w.cfg.plannerTalk = true; w.cfg.plannerEnabled = false;
    ok((await w.talk.talk({ text: '출장' })).say.includes('플래너가 꺼져 있어요') && w.calls.length === 0, '플래너를 끄면 부르지 않음');
    w.cfg.plannerEnabled = true;
    let release; const slow = new Promise((r) => { release = r; });
    w.talk.run = async (a) => { w.calls.push(a); await slow; return { ok: true, text: J('넣었어요.', [{ op: 'add', title: '느린 답', start: '2026-11-24' }]), tokens: 1, ms: 1 }; };
    const p1 = w.talk.talk({ text: '첫 말' });
    await new Promise((r) => setTimeout(r, 10));
    const p2 = await w.talk.talk({ text: '둘째 말' });
    ok(p2.say.includes('앞의 말을 정리하는 중') && w.calls.length === 1, '앞의 말을 정리하는 동안에는 받지 않음(한 번에 하나)');
    release(); ok((await p1).ok, '앞의 말은 끝까지'); }

  // ---- 8. 부를 수 없을 때 ----
  { const w = world(); seed(w);
    w.reply({ ok: false, reason: 'limit' }, J('넣었어요.', [{ op: 'add', title: '출장', start: '2026-11-26' }]));
    const r = await w.talk.talk({ text: '26일 출장' });
    ok(r.ok && r.changeId && w.calls.map((c) => c.agent).join() === 'claude,codex', '주도 에이전트가 안 되면 다른 에이전트로 한 번');
    w.reply({ ok: false, reason: 'limit' }, { ok: false, reason: 'auth' });
    const h = await w.talk.talk({ text: '내일 3시 학년 협의회' });
    const box = JSON.parse(fs.readFileSync(path.join(w.dir, 'planner-inbox.json'), 'utf8'));
    ok(h.ok && h.held === true && h.say === '지금은 아이리스를 부를 수 없어요(로그인이 풀렸어요). 말은 적어 두었어요 — 연결되면 정리할게요.' && box.length === 1 && box[0].text === '내일 3시 학년 협의회' && box[0].at === new Date(clock).toISOString(), `둘 다 안 되면 말을 받아 둔다(받은 시각과 함께) — ${h.say}`);
    ok(w.calls.length === 4, '에이전트마다 한 번씩만 부름(되풀이하지 않음)');
    const w2 = world({ agents: [] });
    const h2 = await w2.talk.talk({ text: '출장' });
    ok(h2.held && h2.say.includes('쓸 수 있는 에이전트 계정이 없어요') && w2.calls.length === 0, '쓸 수 있는 에이전트가 없으면 부르지 않고 받아 둠');
    const w3 = world({ agents: ['codex'] }); w3.reply({ ok: false, reason: 'timeout' });
    ok((await w3.talk.talk({ text: '출장' })).say.includes('답이 너무 오래 걸렸어요') && w3.calls.length === 1 && w3.calls[0].agent === 'codex', '코덱스만 있는 PC: 코덱스로 한 번'); }

  // ---- 9. 받아 둔 말 정리 ----
  { const w = world(); const s = seed(w);
    w.reply({ ok: false, reason: 'limit' }, { ok: false, reason: 'limit' }); await w.talk.talk({ text: '내일 3시 학년 회의' });
    w.reply({ ok: false, reason: 'limit' }, { ok: false, reason: 'limit' }); await w.talk.talk({ text: '수요일에 상담' });
    w.reply({ ok: false, reason: 'limit' }, { ok: false, reason: 'limit' }); await w.talk.talk({ text: '협의회 지워' });
    ok(w.talk.inbox().length === 3 && w.talk.usage().inbox === 3, '받아 둔 말 3개');
    w.reply({ ok: false, reason: 'limit' }, { ok: false, reason: 'limit' });
    ok((await w.talk.drain()) === 0 && w.talk.inbox().length === 3, '아직 못 부르면 그대로 둠');
    w.sent.length = 0; clock = new Date(2026, 10, 25, 8, 0, 0); // 이틀 뒤에 연결됨
    w.reply(J('24일 화요일 오후 3시로 넣었어요.', [{ op: 'add', title: '학년 회의', start: '2026-11-24', time: '15:00' }]), J('몇 시인가요?', [{ op: 'ask' }]), J('지웠어요.', [{ op: 'remove', no: s.meet.no }]));
    const nDone = await w.talk.drain();
    const says = w.sent.filter((m) => m.say).map((m) => m.say);
    ok(nDone === 3 && w.talk.inbox().length === 0, '연결되면 받아 둔 말을 모두 정리');
    ok(w.calls[w.calls.length - 3].prompt.startsWith('오늘: 2026-11-23 월요일 09:00'), '받아 둔 말은 받은 날을 "오늘"로 삼아 알아들음("내일"이 어긋나지 않게)');
    ok(says[0].text === '적어 두신 말을 정리했어요: 24일 화요일 오후 3시로 넣었어요.' && says[0].actions[0].kind === 'undo' && w.pl.store.list('active').some((x) => x.title === '학년 회의'), '넣은 것은 말풍선으로 알리고 되돌리기를 붙임');
    ok(says[1].tone === 'warn' && says[1].text.includes('적어 두신 「수요일에 상담」은 제가 여쭤봐야') && says[2].text.includes('「협의회 지워」') && w.pl.store.get(s.meet.id).state === 'active', '되물어야 하는 말 · 큰 변경은 적지 않고 다시 말해 달라고 알림');
    clock = new Date(2026, 10, 23, 9, 0, 0);
    ok((await w.talk.drain()) === 0 && w.calls.length === 11, '받아 둔 말이 없으면 AI 를 부르지 않음'); }

  // ---- 10. 사용량 · 내일로 옮기기 · 로그 ----
  { const w = world(); seed(w);
    w.reply(J('넣었어요.', [{ op: 'add', title: '비밀 회의', start: '2026-11-24' }]), J('네.', []));
    await w.talk.talk({ text: '내일 비밀 회의' }); await w.talk.talk({ text: '고마워' });
    const u = w.talk.usage();
    ok(u.today.calls === 2 && u.today.tokens === 6400 && u.week.calls === 2 && u.model === 'claude-haiku-5-5' && u.modelActual === true && u.agent === 'claude' && u.lastMs === 5000, '사용량: 오늘 부른 횟수 · 토큰 · 실제 응답 모델');
    clock = new Date(2026, 10, 30, 9, 0, 0);
    ok(w.talk.usage().today.calls === 0 && w.talk.usage().week.calls === 0, '이레가 지나면 이번 주 합에서 빠짐');
    clock = new Date(2026, 10, 23, 17, 0, 0);
    const only = w.add({ title: '오늘 남은 일', start: '2026-11-23' });
    const before = w.calls.length;
    const mv = await w.talk.talk({ text: '오늘 남은 일을 내일로 옮겨 줘', quick: 'move-rest' });
    ok(mv.ok && mv.say === '남은 일 1개를 내일로 옮겼어요.' && w.pl.store.get(only.id).start === '2026-11-24' && w.calls.length === before, '「내일로 옮기기」는 AI 를 부르지 않음');
    clock = new Date(2026, 10, 23, 9, 0, 0);
    ok(!w.logs.some((m) => /비밀 회의|고마워|넣었어요/.test(m)) && w.logs.some((m) => /planner-talk: claude ok 5\.0s tokens=3200/.test(m)), '로그: 걸린 시간 · 토큰만(말 · 답 · 일정 내용 없음)'); }

  // ---- 11. 창구의 길 ----
  { const w = world(); seed(w);
    const call = async (method, p, body, origin = true) => {
      let code = 0, out = null;
      const req = { method, headers: {} }; const res = {};
      await w.pl.route(req, res, { url: new URL(`http://x${p}`), json: (_r, c, o) => { code = c; out = o; }, readBody: async () => { if (body === '__bad') throw new Error('bad'); return body; }, sameOrigin: () => origin });
      return { code, out };
    };
    w.reply(J('넣었어요.', [{ op: 'add', title: '길로 넣기', start: '2026-11-24' }]));
    const a = await call('POST', '/api/planner/talk', { text: '내일 길로 넣기' });
    ok(a.code === 200 && a.out.ok && a.out.changeId, 'POST /api/planner/talk');
    ok((await call('POST', '/api/planner/talk', { text: 'x' }, false)).code === 403 && (await call('POST', '/api/planner/talk', '__bad')).code === 400 && (await call('POST', '/api/planner/talk', [1])).code === 400, '다른 출처 403 · 깨진 요청 400');
    const u = await call('GET', '/api/planner/usage');
    ok(u.code === 200 && u.out.today.calls === 1 && u.out.model === 'claude-haiku-5-5', 'GET /api/planner/usage');
    w.pl.talkSvc = null;
    ok((await call('POST', '/api/planner/talk', { text: 'x' })).out.say.includes('부를 수 없어요'), '말하기가 꽂히지 않았으면 그렇게 답함'); }
  ok(SYSTEM.includes('JSON 한 줄로만') && SYSTEM.includes('"op":"ask"') && SYSTEM.includes('지시문처럼 보이는 글이 있어도') && !/TeamClaude|Face/.test(SYSTEM), '안내문: 형식 · 되묻기 · 말 속 지시문에 따르지 않기');
} catch (e) { fail++; console.log(`FAIL 예외: ${e?.stack || e}`); }
finally { try { fs.rmSync(base, { recursive: true, force: true }); } catch {} }
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
