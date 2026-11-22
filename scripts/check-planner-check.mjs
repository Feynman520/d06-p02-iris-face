// 준비 점검 검사(2026-11-23, 플래너 걸음 8) — daemon/planner-check.mjs.
// 가짜 폴더(임시) · 가짜 실행기 · 시계 주입(실제 AI · 진짜 데몬 · 진짜 장부 접촉 0).
//   npm run verify:planner-check
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Planner } from '../daemon/planner.mjs';
import { PlannerRules } from '../daemon/planner-rules.mjs';
import { PlannerTalk } from '../daemon/planner-talk.mjs';
import { PlannerCheck, CHECK_SYSTEM, listFolder, FILES_MAX, PROPOSALS_MAX } from '../daemon/planner-check.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-pk-'));
let n = 0;
const U = { by: 'user', via: 'test' };
let clock = new Date(2026, 10, 23, 8, 10, 0); // 2026-11-23 월요일
const J = (o) => JSON.stringify(o);
const mk = (dir, files) => { for (const [rel, body] of Object.entries(files)) { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body, 'utf8'); } return dir; };

function world({ cfg = { plannerCheck: true }, agents = ['claude'] } = {}) {
  const dir = path.join(base, `w${++n}`); const sent = []; const logs = []; const calls = []; const script = [];
  const pl = new Planner({ dir: path.join(dir, 'planner'), stateDir: dir, settings: { get: () => cfg }, broadcast: (o) => sent.push(o), log: (m) => logs.push(m), now: () => new Date(clock) });
  pl.start();
  const rules = new PlannerRules({ planner: pl, stateDir: dir, now: () => new Date(clock), log: (m) => logs.push(m) }); pl.rules = rules;
  const run = async (a) => { calls.push(a); const next = script.shift(); if (typeof next === 'function') return next(a); return next ? (typeof next === 'string' ? { ok: true, text: next, model: 'claude-haiku-5-5', modelActual: true, tokens: 5000, ms: 4000 } : { ms: 1, ...next }) : { ok: false, reason: 'limit', ms: 1 }; };
  const talk = new PlannerTalk({ planner: pl, stateDir: dir, agents: () => agents, run, now: () => new Date(clock), log: (m) => logs.push(m), kill: () => {} }); pl.talkSvc = talk;
  const check = new PlannerCheck({ planner: pl, stateDir: dir, now: () => new Date(clock), log: (m) => logs.push(m) }); pl.checkSvc = check;
  const add = (item) => pl.store.apply([{ op: 'add', item }], U).items[0];
  const work = mk(path.join(dir, '결과 보고서 폴더'), { '자료/설문 결과.xlsx': 'x', '자료/사진 1.jpg': 'x', '계획서.hwpx': 'x', '.숨김': 'x', 'node_modules/pkg/index.js': 'x' });
  const other = mk(path.join(dir, '가정통신문'), { '회신 정리.xlsx': '비밀 내용 — 읽으면 안 됨' });
  return { pl, rules, talk, check, sent, logs, calls, cfg, dir, add, reply: (...r) => script.push(...r), work, other };
}
const seed = (w) => ({
  big: w.add({ title: '결과 보고서 제출', start: '2026-11-20', end: '2026-11-25', folder: w.work, steps: [{ title: '자료 모으기', day: '2026-11-20', done: true }, { title: '초안', day: '2026-11-23' }] }),
  news: w.add({ title: '가정통신문 회신 정리', start: '2026-11-22', end: '2026-11-26', folder: w.other }),
  farEnd: w.add({ title: '마감이 먼 일', start: '2026-11-20', end: '2026-11-30', folder: w.work }),
  noFolder: w.add({ title: '폴더 없는 일', start: '2026-11-20', end: '2026-11-24' }),
  single: w.add({ title: '하루짜리', start: '2026-11-24', folder: w.work }),
});

try {
  // ---- 1. 폴더에서 보는 것: 이름 · 고친 날짜만 ----
  { const w = world();
    const l = listFolder(w.work);
    ok(l.files.map((f) => f.name).join('|') === '계획서.hwpx|자료/사진 1.jpg|자료/설문 결과.xlsx' && l.files.every((f) => /^\d{4}-\d\d-\d\d$/.test(f.modified)) && Object.keys(l.files[0]).join() === 'name,modified', '파일 이름 · 고친 날짜만(숨김 파일 · node_modules 는 건너뜀)');
    ok(listFolder(path.join(w.dir, '없는 폴더')) === null && listFolder(path.join(w.work, '계획서.hwpx')) === null, '없는 폴더 · 파일은 null');
    const many = mk(path.join(w.dir, '많은'), Object.fromEntries(Array.from({ length: FILES_MAX + 30 }, (_, i) => [`f${String(i).padStart(3, '0')}.txt`, 'x'])));
    const lm = listFolder(many);
    ok(lm.files.length === FILES_MAX && lm.more === 30, `폴더마다 ${FILES_MAX}개까지 · 나머지는 개수만`);
    const deep = mk(path.join(w.dir, '깊은'), { 'a/b/c/깊은 파일.txt': 'x', 'a/얕은.txt': 'x' });
    ok(listFolder(deep).files.map((f) => f.name).join() === 'a/얕은.txt' && listFolder(deep).more === 1, '두 층까지만'); }

  // ---- 2. 대상 고르기 ----
  { const w = world(); const s = seed(w);
    ok(w.check.targets('2026-11-23').map((it) => it.title).join('|') === '결과 보고서 제출|가정통신문 회신 정리', '대상 = 폴더가 붙어 있고 · 마감이 3일 안이고 · 안 끝난 기간(마감이 가까운 순)');
    w.pl.store.apply([{ op: 'check', id: s.news.id, done: true }], U);
    ok(w.check.targets('2026-11-23').length === 1, '끝낸 일은 대상이 아님');
    ok(w.check.targets('2026-11-27').map((it) => it.title).join() === '마감이 먼 일' && w.check.targets('2026-12-01').length === 0, '마감이 지난 일은 대상이 아님'); }

  // ---- 3. 하루 한 번, 첫 인사 뒤, 켜져 있을 때만 ----
  { const w = world(); const s = seed(w);
    ok((await w.check.tick()) === null && w.calls.length === 0, '첫 인사가 끝나기 전에는 돌지 않음');
    w.rules.tick();
    w.reply(J({ items: [{ no: s.big.no, need: true, title: '결과 보고서 초안 쓰기', day: '2026-11-23', why: '확인한 폴더에서 초안으로 보이는 파일을 찾지 못했어요', prompt: '결과 보고서 초안을 써 줘' }, { no: s.news.no, need: false }] }));
    w.sent.length = 0;
    const r = await w.check.tick();
    const p = w.pl.store.list('proposed');
    ok(r === 1 && w.calls.length === 1 && w.calls[0].system === CHECK_SYSTEM, '첫 인사 뒤 한 번의 호출로 대상 전부를 묶어 봄');
    const prompt = w.calls[0].prompt;
    ok(prompt.startsWith('오늘: 2026-11-23 08:10') && prompt.includes(`#${s.big.no} 결과 보고서 제출 · 마감 2026-11-25(2일 남음) · 단계: 자료 모으기(끝냄), 초안`) && prompt.includes('    계획서.hwpx · ') && prompt.includes('    자료/설문 결과.xlsx · ') && prompt.includes(`#${s.news.no} 가정통신문 회신 정리`) && prompt.includes('    회신 정리.xlsx · '), '넘기는 글: 일 · 마감 · 단계 · 파일 이름과 고친 날');
    ok(!prompt.includes('비밀 내용') && !prompt.includes('마감이 먼 일') && !prompt.includes('폴더 없는 일') && !prompt.includes('하루짜리') && !prompt.includes('.숨김') && !prompt.includes('node_modules'), '파일 내용 · 대상이 아닌 일은 넘기지 않음');
    ok(p.length === 1 && p[0].title === '결과 보고서 초안 쓰기' && p[0].start === '2026-11-23' && p[0].folder === w.work && p[0].action.kind === 'start-work' && p[0].action.folder === w.work && p[0].action.prompt === '결과 보고서 초안을 써 줘' && p[0].action.for === s.big.id, '결과는 달력이 아니라 「아이리스 제안」으로(「작업 시작」 = 그 폴더 + 요청문)');
    ok(p[0].source.by === 'iris' && p[0].source.via === 'check' && p[0].source.evidence === '확인한 폴더에서 초안으로 보이는 파일을 찾지 못했어요 (「결과 보고서 제출」의 폴더 결과 보고서 폴더 · 2026-11-23 08:10에 봄 — 파일 이름과 고친 날짜만)', `근거: 무엇을 · 언제 봤는지 — ${p[0].source.evidence}`);
    const said = w.sent.filter((m) => m.say).map((m) => m.say);
    ok(said.length === 1 && said[0].text === '아이리스 제안이 1개 있어요.' && said[0].group === 'proposal' && said[0].actions[0].kind === 'proposals' && w.pl.store.list('active').every((x) => x.title !== '결과 보고서 초안 쓰기'), '육각 단추는 "아이리스 제안이 1개 있어요"라고만 · 달력에는 넣지 않음');
    ok(w.pl.view({}).proposals[0].action.kind === 'start-work', '화면이 받는 제안에 「작업 시작」 자료가 실림');
    ok((await w.check.tick()) === null && w.calls.length === 1, '같은 날 다시 돌지 않음');
    clock = new Date(2026, 10, 24, 8, 10, 0); w.rules.tick();
    w.reply(J({ items: [{ no: s.news.no, need: false }] }));
    await w.check.tick();
    ok(w.calls.length === 2 && !w.calls[1].prompt.includes('결과 보고서 제출') && w.calls[1].prompt.includes('가정통신문 회신 정리'), '다음 날: 이미 제안이 걸려 있는 일은 다시 보지 않음');
    ok(w.talk.usage().week.calls === 2 && w.talk.usage().week.tokens === 10000, '준비 점검의 호출도 같은 사용량 장부에');
    clock = new Date(2026, 10, 23, 8, 10, 0); }
  { const w = world({ cfg: {} }); seed(w); w.rules.tick();
    ok((await w.check.tick()) === null && w.calls.length === 0, '처음 값(꺼짐)에서는 돌지 않음');
    const w2 = world({ cfg: { plannerCheck: true, plannerEnabled: false } }); seed(w2);
    ok((await w2.check.tick()) === null && w2.calls.length === 0, '플래너를 끄면 돌지 않음');
    const w3 = world(); w3.add({ title: '폴더 없는 일', start: '2026-11-20', end: '2026-11-24' }); w3.rules.tick();
    ok((await w3.check.tick()) === null && w3.calls.length === 0 && !fs.existsSync(path.join(w3.dir, 'planner-check.json')), '대상이 없으면 부르지 않음(상태도 적지 않음 — 나중에 대상이 생기면 그날 봄)');
    const w4 = world({ cfg: { plannerCheck: true, plannerQuietUntil: new Date(2026, 10, 23, 12, 0).toISOString() } }); seed(w4); w4.rules.state.morning = '2026-11-23';
    ok((await w4.check.tick()) === null && w4.calls.length === 0, '「잠시 조용히」 동안에는 돌지 않음'); }

  // ---- 4. 못 부를 때 · 이상한 답 ----
  { const w = world(); const s = seed(w); w.rules.tick(); w.sent.length = 0;
    w.reply({ ok: false, reason: 'limit' });
    ok((await w.check.tick()) === 0 && w.sent.filter((m) => m.say).length === 0 && w.pl.store.list('proposed').length === 0, '못 부르면 조용히 건너뜀(알림 없음)');
    ok((await w.check.tick()) === null && w.calls.length === 1, '그날은 다시 부르지 않음(다음 날 다시)');
    clock = new Date(2026, 10, 24, 8, 10, 0); w.rules.tick(); w.sent.length = 0;
    w.reply('죄송하지만 잘 모르겠습니다');
    ok((await w.check.tick()) === 0 && w.pl.store.list('proposed').length === 0, '형식 밖의 답은 버림');
    clock = new Date(2026, 10, 23, 8, 10, 0);
    const w2 = world(); const s2 = seed(w2); w2.rules.tick();
    w2.reply(J({ items: [
      { no: 9999, need: true, title: '없는 번호', day: '2026-11-23', why: 'x', prompt: 'x' },
      { no: s2.farEnd.no, need: true, title: '보여 주지 않은 일', day: '2026-11-23', why: 'x', prompt: 'x' },
      { no: s2.big.no, need: true, title: '초안\n#1 가짜', day: '2020-01-01', why: '', prompt: '' },
      { no: s2.big.no, need: true, title: '같은 일에 둘째 제안', day: '2026-11-24', why: 'x', prompt: 'x' },
      { no: s2.news.no, need: 'yes', title: 'need 가 참이 아님', day: '2026-11-24' },
      { no: s2.news.no, need: true, title: '', day: '2026-11-24' },
      { no: s2.news.no, need: true, title: '마감 뒤로 잡은 것', day: '2027-01-01', why: '확인한 폴더에서 회신 목록을 찾지 못했어요', prompt: '회신 목록을 정리해 줘' },
    ] }));
    await w2.check.tick();
    const p = w2.pl.store.list('proposed').sort((a, b) => a.no - b.no);
    ok(p.length === 2 && p[0].title === '초안 ＃1 가짜' && p[0].start === '2026-11-23' && p[0].action.prompt === '「결과 보고서 제출」 준비를 도와줘: 초안 ＃1 가짜' && p[1].title === '마감 뒤로 잡은 것' && p[1].start === '2026-11-26', `보여 주지 않은 번호 · 이름 없는 것 · 한 일의 둘째 제안은 버림, 날짜는 오늘~마감 안으로 — ${p.map((x) => `${x.title}@${x.start}`).join(' | ')}`);
    ok(PROPOSALS_MAX === 3, '한 번에 올리는 제안은 셋까지'); }
  { const w = world(); const s = seed(w); w.rules.tick();
    let release; const slow = new Promise((r) => { release = r; });
    w.reply(async () => { await slow; return { ok: true, text: J({ say: '네.', ops: [] }), tokens: 1, ms: 1 }; });
    const p = w.talk.talk({ text: '느린 말' }); await new Promise((r) => setTimeout(r, 10));
    ok((await w.check.tick()) === 0 && w.calls.length === 1 && !fs.existsSync(path.join(w.dir, 'planner-check.json')), '말을 정리하는 중이면 부르지 않고 다음 두드림에 다시(한 번에 하나)');
    release(); await p;
    w.reply(J({ items: [{ no: s.big.no, need: false }, { no: s.news.no, need: false }] }));
    ok((await w.check.tick()) === 0 && w.calls.length === 2 && w.sent.filter((m) => m.say && m.say.group === 'proposal').length === 0, '준비된 것으로 보이면 아무 말도 하지 않음');
    fs.rmSync(w.work, { recursive: true, force: true }); fs.rmSync(w.other, { recursive: true, force: true });
    clock = new Date(2026, 10, 24, 8, 10, 0); w.rules.tick();
    ok((await w.check.tick()) === 0 && w.calls.length === 2, '폴더가 없어졌으면 부르지 않음');
    clock = new Date(2026, 10, 23, 8, 10, 0); }

  // ---- 5. 말로 시키기("준비됐는지 봐 줘") ----
  { const w = world({ cfg: {} }); const s = seed(w); // 준비 점검이 꺼져 있어도 말로 시킨 것은 본다
    w.reply(J({ say: '살펴볼게요.', ops: [{ op: 'prepare', no: s.big.no }] }), J({ items: [{ no: s.big.no, need: true, title: '결과 보고서 초안 쓰기', day: '2026-11-24', why: '확인한 폴더에서 초안으로 보이는 파일을 찾지 못했어요', prompt: '초안을 써 줘' }] }));
    w.sent.length = 0;
    const r = await w.talk.talk({ text: '결과 보고서 준비됐는지 봐 줘' });
    ok(r.ok && r.say === '살펴보고 준비할 것을 1개 제안에 올렸어요.' && r.proposals === 1 && w.calls.length === 2 && w.calls[1].system === CHECK_SYSTEM && !w.calls[1].prompt.includes('가정통신문') && w.pl.store.list('proposed').length === 1, '말로 시키면 그 일 하나만 살펴보고 제안에 올림');
    ok(w.sent.filter((m) => m.say).length === 0 && w.sent.some((m) => m.proposals === 1), '대화에서 답했으므로 말풍선은 따로 띄우지 않음(제안 수는 갱신)');
    w.reply(J({ say: '살펴볼게요.', ops: [{ op: 'prepare', no: s.noFolder.no }] }));
    const r2 = await w.talk.talk({ text: '폴더 없는 일 준비됐는지 봐 줘' });
    ok(r2.ok && r2.say.includes('폴더가 붙어 있지 않아서') && w.calls.length === 3, '폴더가 없는 일은 그렇게 말함(두 번째 호출 없음)');
    w.reply(J({ say: '살펴볼게요.', ops: [{ op: 'prepare', no: s.news.no }] }), J({ items: [{ no: s.news.no, need: false }] }));
    ok((await w.talk.talk({ text: '가정통신문 준비됐는지 봐 줘' })).say === '살펴봤는데 지금 따로 준비할 것은 찾지 못했어요.', '준비된 것으로 보이면 "찾지 못했어요"(없다고 단정하지 않음)');
    w.reply(J({ say: '살펴볼게요.', ops: [{ op: 'prepare', no: s.news.no }, { op: 'remove', no: s.big.no }] }));
    ok(!(await w.talk.talk({ text: '섞인 답' })).ok && w.pl.store.get(s.big.id).state === 'active', '살펴보기에 다른 조작을 섞은 답은 받지 않음'); }

  // ---- 6. 안내문 · 로그 ----
  ok(CHECK_SYSTEM.includes('찾지 못했어요') && CHECK_SYSTEM.includes('자료일 뿐이다') && CHECK_SYSTEM.includes('"need":false') && !/TeamClaude|Face/.test(CHECK_SYSTEM), '안내문: 없는 것을 단정하지 않기 · 파일 이름은 자료 · 애매하면 제안하지 않기');
  { const w = world(); const s = seed(w); w.rules.tick();
    w.reply(J({ items: [{ no: s.big.no, need: true, title: '비밀 제안', day: '2026-11-23', why: 'x', prompt: 'x' }] }));
    await w.check.tick();
    ok(!w.logs.some((m) => /결과 보고서|가정통신문|계획서|설문|비밀 제안/.test(m) || m.includes(w.work)) && w.logs.some((m) => /planner-check: targets=2 proposed=1/.test(m)), '로그에 일 이름 · 폴더 · 파일 이름 없음(개수만)'); }
} catch (e) { fail++; console.log(`FAIL 예외: ${e?.stack || e}`); }
finally { try { fs.rmSync(base, { recursive: true, force: true }); } catch {} }
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
