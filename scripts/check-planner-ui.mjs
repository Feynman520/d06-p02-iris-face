// 플래너 화면 검사(2026-11-22, 플래너 걸음 3) — app/planner.js + planner.css 를 작은 시험 쪽에 띄운다.
// /api/planner/* 는 진짜 창구(daemon/planner.mjs)를 임시 폴더 · 고정 시계로 이 검사 안에서 돌린다(진짜 데몬 · 진짜 장부 · AI 접촉 0).
//   npm run verify:planner-ui      (playwright 가 없으면 SKIP · IRIS_CAPTURE_DIR 을 주면 장면을 PNG 로 남긴다)
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Planner } from '../daemon/planner.mjs';
import { PlannerTalk } from '../daemon/planner-talk.mjs';
import { PlannerRules } from '../daemon/planner-rules.mjs';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const req = createRequire(import.meta.url);
let pw = null;
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req(c); break; } catch {} }
if (!pw) { console.log('SKIP: playwright 없음'); process.exit(0); }
const CAP = process.env.IRIS_CAPTURE_DIR || '';

// ---- 진짜 창구(임시 장부 · 2026-11-23 월요일 09:00 고정) ----
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-pu-'));
const cfg = {};
const sent = [];
const pl = new Planner({ dir: path.join(base, 'planner'), stateDir: base, settings: { get: () => cfg }, broadcast: (o) => sent.push(o), now: () => new Date(2026, 10, 23, 9, 0, 0) });
pl.start();
const U = { by: 'user', via: 'test' };
const add = (item) => pl.store.apply([{ op: 'add', item }], U).items[0];
const late = add({ title: '수행평가 채점 기준 확인', start: '2026-11-20' });
const news = add({ title: '가정통신문 회신 정리', start: '2026-11-22', end: '2026-11-27' });
const meet = add({ title: '협의회', start: '2026-11-23', time: '15:00', folder: 'C:\\IRIS\\R01\\전문적 학습공동체' });
const big = add({ title: '결과 보고서 제출', start: '2026-11-20', end: '2026-11-25', steps: [{ title: '자료 모으기', day: '2026-11-20', done: true }, { title: '초안 검토', day: '2026-11-23' }, { title: '제출', day: '2026-11-25' }] });
const week = add({ title: '수업 나눔 주간', start: '2026-11-24', end: '2026-11-26' });
add({ title: '공개수업 참관', start: '2026-11-27', time: '10:00' });
add({ title: '<img src=x onerror="window.__xss=1">꺾쇠 이름', start: '2026-11-30' });
add({ title: '해를 넘는 일', start: '2026-12-30', end: '2027-01-02' });
const rep = add({ title: '학년 협의회', start: '2026-12-01', time: '15:00', repeat: { freq: 'weekly' } });
// 2026-11-23 사용자 신고("등록된 내용이 길면 잘려서 안 보임"): 긴 이름 · 메모가 붙은 일 · 짧은 이름(28일 — 다른 날의 검사에 끼지 않는 날)
// 같은 날 뒤이은 결정: 이름은 두 줄까지 보인다 — MID(전에 한 줄에서 잘리던 길이)는 두 줄에 다 보이고, LONG(두 줄도 넘는 길이)만 … 로 잘린다
const MID = '교무부장님께 2학기 교과 연구회 결과 보고서를 작성해서 전달하고 예산 집행 내역 붙이기';
const LONG = '교무부장님께 2학기 교과 연구회 결과 보고서를 작성해서 전달하고 예산 집행 내역을 붙인 다음 연구회 선생님들께 회람을 돌려 의견을 모아 다시 정리해서 교감 선생님께 보고드리기';
add({ title: LONG, start: '2026-11-28' });
add({ title: '연구회 결과 보고서 전달', start: '2026-11-28', note: '교무부장님께 2학기 교과 연구회 결과 보고서를 작성해서 전달', place: '교무실' });
add({ title: '짧은 일', start: '2026-11-28' });
add({ title: '메모가 아주 긴 일', start: '2026-11-28', note: Array.from({ length: 50 }, (_, i) => `${i + 1}번째 줄의 메모입니다. 준비물과 순서를 길게 적었습니다.`).join('\n') }); // 약 1,700자 · 50줄(장부의 메모 상한 2,000자 안)
add({ title: MID, start: '2026-11-28' });
const p1 = pl.store.apply([{ op: 'propose', item: { title: '참관록 양식 확인', start: '2026-11-26' } }], { by: 'iris', via: 'check', evidence: '참관록 양식은 지난번 것을 그대로 쓰기로 함' }).items[0];
const p2 = pl.store.apply([{ op: 'propose', item: { title: '협의회 안건 정리', start: '2026-11-23' } }], { by: 'session', via: 'cli', session: { id: 's1', title: '결과 보고서 초안', agent: 'claude' } }).items[0];

const HARNESS = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/planner.css">
<style>html,body{margin:0;height:100%;background:var(--base);color:var(--ink)} #app{display:block;height:100vh} #stage{position:relative;height:100vh;display:flex;flex-direction:column}
#dock{margin-top:auto;height:76px;padding:0;flex:none} #sub{position:absolute;right:0;top:0;bottom:76px;width:300px;background:var(--surface)} #settings,#dash{position:fixed;inset:0;background:var(--surface);z-index:20;transform:none;opacity:1}</style></head><body>
<div id="app"><aside id="settings" hidden></aside><aside id="dash" hidden></aside>
<main id="stage"><input id="typing" value="쓰던 글" style="margin:20px;width:300px"><aside id="sub" hidden></aside><div style="margin-top:auto"></div><div id="approval" hidden style="height:120px;flex:none"></div><div id="dead-bar" hidden style="height:40px;flex:none"></div><footer id="dock" style="margin-top:0"></footer></main></div>
<script src="/icons.js"></script><script src="/planner.js"></script>
<script>
  window.__calls = []; window.__drawer = false; window.__keys = [];
  document.addEventListener('keydown', (e) => window.__keys.push(e.key)); // 본체의 단축키 자리(여기까지 올라온 키만 센다)
  Planner.init({ openFolder: (p) => __calls.push(['folder', p]), chatIn: (p, t) => __calls.push(['chat', p, t]), openSession: (id) => __calls.push(['session', id]), hasSession: (id) => (window.__live || []).includes(id), openSettings: (p) => __calls.push(['settings', p]), drawerOpen: () => window.__drawer });
</script></body></html>`;
const server = http.createServer(async (q, s) => {
  const url = new URL(q.url, 'http://x'); const u = url.pathname;
  if (u === '/') { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return s.end(HARNESS); }
  if (u.startsWith('/api/planner/')) {
    const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
    const readBody = (r) => new Promise((resolve, reject) => { const ch = []; r.on('data', (c) => ch.push(c)); r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(ch).toString('utf8') || '{}')); } catch { reject(new Error('bad')); } }); });
    return pl.route(q, s, { url, json, readBody, sameOrigin: () => true });
  }
  const f = path.join(APP, decodeURIComponent(u.replace(/^\/app\//, '/')));
  if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await pw.chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1100, height: 860 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
const ev = (code) => page.evaluate(code);
const settle = async () => { await page.waitForTimeout(120); };
const text = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => e.textContent.trim())`);
const shot = async (name) => { if (CAP) { fs.mkdirSync(CAP, { recursive: true }); await page.screenshot({ path: path.join(CAP, `planner-${name}.png`) }); } };

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await ev(`Planner.onHello(${JSON.stringify(pl.hello())})`);
  await settle();
  // ---- 1. 평소: 육각 단추 ----
  ok((await ev(`!!document.querySelector('#pl #pl-hex') && !document.querySelector('.pl-panel')`)), '평소: 육각 단추만');
  ok((await text('.pl-cnt'))[0] === '2', '단추의 숫자 = 제안 개수');
  const pos0 = await ev(`(() => { const r = document.querySelector('#pl-hex').getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom }; })()`);
  ok(Math.abs(pos0.right - 22) < 2 && Math.abs(pos0.bottom - 84) < 2, `자리: 입력창 바로 위 오른쪽(오른쪽 ${pos0.right} · 아래 ${pos0.bottom})`);
  await shot('1-quiet');

  // ---- 2. 펼침 ----
  await page.click('#pl-hex'); await settle();
  ok((await text('.pl-head strong'))[0] === '11월 23일 월요일' && (await text('.pl-pill.now'))[0] === '오늘', '날짜는 한자리에(월 · 일 · 요일) + 오늘');
  const titles = await text('.pl-list > .pl-r .tx');
  ok(titles.join('|') === '수행평가 채점 기준 확인|협의회|결과 보고서 제출|가정통신문 회신 정리', `오늘 목록의 순서 — ${titles.join('|')}`);
  ok((await ev(`document.querySelectorAll('.pl-list .pl-ck').length`)) === 7, '전부 체크 상자(줄 4 + 단계 3)');
  ok((await text('.pl-r.step .no')).join('') === '123' && (await text('.pl-r.step.cur .tx'))[0] === '초안 검토' && (await text('.pl-r.step .dd')).join('|') === '11/20|11/23|11/25', '단계: 순서 번호 · 고른 날의 단계 · 하는 날(언제나 월/일)');
  ok((await text('.pl-pill.span')).join('|') === '4일차11/20~11/25|2일차11/22~11/27' && (await text('.pl-pill.fold'))[0] === '1/3', '기간 뱃지: 며칠째 + 기간(같은 달이어도 언제나 월/일~월/일) · 단계 진행');
  ok((await text('.pl-list > .pl-r:first-child .pl-pill'))[0] === '11/20' && (await ev(`document.querySelectorAll('.pl-r.end, .pl-pill.due').length`)) === 0, '밀린 일은 하려던 날(월/일) · 오늘은 마감 표시 없음');
  ok((await ev(`document.querySelectorAll('.pl-cal button').length`)) === 30 && (await ev(`document.querySelectorAll('.pl-cal i.blank').length`)) === 0, '달력: 11월 30일(1일 = 일요일)');
  const dots = await ev(`Object.fromEntries([...document.querySelectorAll('.pl-cal button')].map((b) => [b.dataset.day.slice(8), b.querySelectorAll('.pl-dots b').length + (b.querySelector('.pl-dots b.d') ? 'y' : '')]))`);
  ok(dots['23'] === '1' && dots['25'] === '2y' && dots['26'] === '2y' && dots['27'] === '2y' && dots['12'] === '0' && dots['30'] === '1', '달력 표시는 점뿐: 파란 점 · 그 옆 노란 점(기간의 마지막 날)');
  ok((await ev(`document.querySelector('.pl').innerHTML.includes('까지<')`)) === false && (await ev(`!!document.querySelector('.pl-talk')`)) === false, '「~까지」 표시 없음 · 대화는 닫혀 있음');
  ok((await ev(`document.querySelector('#pl-in').placeholder`)) === '아이리스에게 말하기', '입력칸: 아이리스에게 말하기');
  const panelBox = await ev(`(() => { const r = document.querySelector('.pl-panel').getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top }; })()`);
  ok(panelBox.w === 440 && panelBox.h <= 580 && panelBox.top >= 0, `판 크기(${panelBox.w}×${Math.round(panelBox.h)}) · 화면 밖으로 안 나감`);
  await shot('2-open');

  // ---- 3. 날짜 고르기 · 마감일 빨강 ----
  await page.click('.pl-cal button[data-day="2026-11-26"]'); await settle();
  ok((await text('.pl-head strong'))[0] === '11월 26일 목요일' && (await ev(`!document.querySelector('.pl-pill.now')`)), '날짜를 누르면 맨 위 날짜가 바뀜');
  // 마감일(기간의 마지막 날): 빨간 글자가 아니라 뱃지의 「마감」 글자 + 달력의 마감 점과 같은 노란색(2026-11-23 사용자 신고 "빨간색은 오류 같아 보임") — 이름은 평소 색
  const due = await ev(`(() => { const b = document.querySelector('.pl-list .pl-pill.span.due'); if (!b) return null; const r = b.closest('.pl-r'); const cs = getComputedStyle(document.documentElement);
    const probe = (v) => { const i = document.createElement('i'); i.style.color = v; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; };
    return { title: r.querySelector('.tx').textContent, badge: b.textContent, n: document.querySelectorAll('.pl-list .pl-pill.span.due').length, badgeColor: getComputedStyle(b).color, titleColor: getComputedStyle(r.querySelector('.tx')).color,
      warn: probe(cs.getPropertyValue('--warn')), bad: probe(cs.getPropertyValue('--bad')), ink: probe(cs.getPropertyValue('--ink')), redRows: document.querySelectorAll('.pl-r.end').length }; })()`);
  ok(due && due.n === 1 && due.title === '수업 나눔 주간' && due.badge === '마감11/24~11/26', `마감일: 뱃지에 「마감」 + 기간(마감일에는 「N일차」를 적지 않는다 — 2026-11-24 사용자 지정) — ${due && due.badge}`);
  ok(due && due.badgeColor === due.warn && due.titleColor === due.ink && due.titleColor !== due.bad && due.badgeColor !== due.bad && due.redRows === 0, `마감일은 빨간색이 아님: 뱃지 = 노란색(달력의 마감 점과 같은 색) · 이름 = 평소 색 — 뱃지 ${due && due.badgeColor} · 이름 ${due && due.titleColor}`);
  await shot('3-lastday');
  await page.click('.pl-cal button[data-day="2026-11-12"]'); await settle();
  ok((await text('.pl-empty'))[0] === '할 것이 없어요', '빈 날');
  await page.click('[data-today]'); await settle();

  // ---- 4. 끝냄 체크 · 접기 ----
  await page.click(`.pl-ck[data-step="${big.steps[1].id}"]`); await settle();
  ok((await text('.pl-pill.fold'))[0] === '2/3' && pl.store.get(big.id).steps[1].done === true, '단계 체크 → 진행 숫자 · 장부에 적힘');
  await page.click(`.pl-ck[data-step="${big.steps[2].id}"]`); await settle();
  ok((await ev(`document.querySelector('.pl-ck[data-ck="${big.id}"]:not([data-step])').classList.contains('on')`)) && pl.store.get(big.id).done === true, '단계를 다 끝내면 큰 일도 체크');
  // 다 끝낸 일(큰 일 + 단계 전부 체크)은 접힌 채로 시작한다(2026-11-25 사용자 요청) — 단, 보는 동안 방금 다 끝낸 일은 그 자리에서 접지 않는다(잘못 누른 체크를 바로 풀 수 있게)
  const foldOf = () => ev(`(() => { const b = document.querySelector('.pl-pill.fold[data-fold="${big.id}"]'); return b ? b.getAttribute('aria-expanded') + ':' + b.textContent + ':' + document.querySelectorAll('.pl-steps .pl-r.step').length : 'none'; })()`);
  ok((await foldOf()) === 'true:3/3:3', `보는 동안 마지막 단계를 체크해 다 끝난 일은 펴진 채로 남음 — ${await foldOf()}`);
  await ev(`Planner.close()`); await settle(); await ev(`Planner.open('2026-11-23')`); await settle();
  ok((await foldOf()) === 'false:3/3:0' && (await ev(`document.querySelector('.pl-ck[data-ck="${big.id}"]:not([data-step])').classList.contains('on')`)), `판을 닫았다 열면 다 끝낸 일은 접혀 있음(큰 일 줄 · 3/3 은 보임) — ${await foldOf()}`);
  await page.click(`.pl-pill.fold[data-fold="${big.id}"]`); await settle();
  ok((await foldOf()) === 'true:3/3:3', '접힌 다 끝낸 일도 접기 단추로 펼 수 있음');
  await ev(`Planner.close()`); await settle(); await ev(`Planner.open('2026-11-23')`); await settle();
  ok((await foldOf()) === 'true:3/3:3', '손으로 편 것은 판을 닫았다 열어도 펴져 있음(고른 값이 처음 값보다 먼저)');
  await page.click(`.pl-pill.fold[data-fold="${big.id}"]`); await settle();
  ok((await foldOf()) === 'false:3/3:0', '다시 접기');
  await page.click(`.pl-ck[data-ck="${big.id}"]:not([data-step])`); await settle();
  ok((await text('.pl-pill.fold'))[0] === '0/3', '큰 일 체크를 풀면 단계도 풀림');
  await page.click('.pl-pill.fold'); await settle();
  ok((await foldOf()) === 'true:0/3:3', '덜 끝난 일은 펴서 볼 수 있음(체크를 푼 뒤)');
  await page.click('.pl-pill.fold'); await settle();
  ok((await ev(`!document.querySelector('.pl-steps')`)), '단계 접기');
  await page.click('.pl-pill.fold'); await settle();

  // ---- 5. 달 넘기기 · 반복 · 해를 넘는 기간 ----
  await page.click('[data-month="1"]'); await settle();
  ok((await text('.pl-head strong'))[0] === '12월 1일 화요일' && (await ev(`document.querySelectorAll('.pl-cal i.blank').length`)) === 2 && (await ev(`document.querySelectorAll('.pl-cal button').length`)) === 31, '다음 달: 12월(1일 = 화요일)');
  ok((await text('.pl-list > .pl-r .tx'))[0] === '학년 협의회', '반복하는 일이 그 날에 나옴');
  await page.click(`.pl-ck[data-ck="${rep.id}"]`); await settle();
  ok(!!pl.store.get(rep.id).repeat.done['2026-12-01'], '반복하는 일은 그날 것만 끝냄');
  await page.click('.pl-cal button[data-day="2026-12-31"]'); await settle();
  ok((await text('.pl-pill.span'))[0] === '2일차12/30~1/2', '달을 넘는 기간은 월/일로');
  await page.click('[data-month="-1"]'); await settle();
  ok((await text('.pl-head strong'))[0] === '11월 23일 월요일', '이번 달로 돌아오면 오늘');

  // ---- 6. 아이리스 제안 띠 ----
  ok((await text('.pl-strip-h b'))[0] === '아이리스 제안' && (await text('.pl-strip-h em'))[0] === '2' && (await ev(`!document.querySelector('.pl-strip-b')`)), '위 띠 = 아이리스 제안(접힘)');
  ok((await ev(`document.querySelector('.pl').textContent.includes('확인 대기') || document.querySelector('.pl').textContent.includes('세션 열기')`)) === false, '판 안에 세션 대기 없음');
  await page.click('[data-strip]'); await settle();
  const st = await text('.pl-strip-b .pl-r');
  ok(st.length === 2 && st[0].startsWith('참관록 양식 확인') && st[0].includes('26일 목') && st[1].includes('오늘') && (await ev(`!!document.querySelector('.pl-cal')`)), '띠가 같은 화면에서 펴짐(달력은 그대로)');
  ok((await ev(`document.querySelector('.pl-strip-b .tx').dataset.tip`)).includes('근거: 참관록 양식은') && (await ev(`document.querySelectorAll('.pl-strip-b .tx')[1].dataset.tip`)).includes('「결과 보고서 초안」에서 올린 제안'), '제안의 근거 · 올린 세션은 올렸을 때 설명으로');
  await shot('4-proposals');
  await page.click(`[data-acc="${p1.id}"]`); await settle();
  ok(pl.store.get(p1.id).state === 'active' && (await text('.pl-head strong'))[0] === '11월 26일 목요일' && (await text('.pl-list > .pl-r .tx')).includes('참관록 양식 확인') && (await text('.pl-cnt'))[0] === '1', '추가 → 그 날로 가서 보임 · 숫자 줄어듦');
  await page.click(`[data-dec="${p2.id}"]`); await settle();
  ok(pl.store.get(p2.id) === null && (await ev(`!document.querySelector('.pl-strip') && !document.querySelector('.pl-cnt')`)), '추가 안 함 → 제안이 없으면 띠도 숫자도 없음');
  await page.click('[data-today]'); await settle();

  // ---- 7. 아이리스에게 말하기(대화 자리) ----
  await page.click('#pl-in'); await settle();
  ok((await ev(`!!document.querySelector('.pl-talk') && !!document.querySelector('.pl-list') && document.querySelectorAll('.pl-cal button').length === 7`)), '입력칸을 누르면 같은 화면 아래에 대화(목록은 남고 달력은 그 주만)');
  ok((await ev(`!!document.querySelector('.pl-talk-x') && !document.querySelector('.pl-talk-h') && !document.querySelector('.pl-chips') && !document.querySelector('.pl-talk svg[viewBox="0 0 24 24"] path[d^="M12 3l7.8"]') && document.querySelectorAll('.pl-talk .pl-tb').length === 0`)), '대화 머리(큐브 · 이름) · 추천 문구 없음 — 접는 손잡이만');
  ok((await text('.pl-thread .pl-bub.ai p'))[0] === '넣을 것이나 바꿀 것을 말해 주세요. 제가 달력에 정리할게요.', '대화의 첫마디');
  ok((await ev(`document.querySelector('.pl').textContent.includes('말하는 중')`)) === false, '「이 일에 대해 말하는 중」 표시 없음');
  ok((await ev(`document.activeElement.id`)) === 'pl-in', '입력칸에 초점');
  await shot('5-talk');
  ok((await ev(`Planner.onEscape()`)) === true && (await ev(`!document.querySelector('.pl-talk') && !!document.querySelector('.pl-panel')`)), 'Esc: 대화만 접힘');
  ok((await ev(`Planner.onEscape()`)) === true && (await ev(`!document.querySelector('.pl-panel')`)) && (await ev(`Planner.onEscape()`)) === false, 'Esc 한 번 더: 판 닫힘 · 닫을 것이 없으면 본체에 넘김');

  // ---- 8. 말풍선 ----
  await ev(`document.getElementById('typing').focus()`);
  await ev(`window.__h1 = Planner.say({ group: 'done', tone: 'ok', text: '「결과 보고서 초안」 작업이 끝났어요.', tip: 'Claude · 4분 12초 걸림', id: 's1', pick: (id) => __calls.push(['pick', id]) })`); await settle();
  ok((await text('.pl-say .pl-line p'))[0] === '「결과 보고서 초안」 작업이 끝났어요.' && (await ev(`document.querySelector('.pl-say').dataset.tone`)) === 'ok' && (await ev(`document.querySelector('#pl-hex').classList.contains('speak')`)), '말풍선이 단추 옆에 뜸(초록 = 완료)');
  const geo = await ev(`(() => { const s = document.querySelector('.pl-say').getBoundingClientRect(), h = document.querySelector('#pl-hex').getBoundingClientRect(); return { left: s.right <= h.left, gap: h.left - s.right, w: s.width }; })()`);
  ok(geo.left && geo.gap > 6 && geo.gap < 24, `말풍선은 단추 왼쪽(간격 ${Math.round(geo.gap)})`);
  ok((await ev(`document.activeElement.id`)) === 'typing', '말풍선이 떠도 입력 중인 글의 초점 그대로');
  await shot('6-say');
  // 2026-11-23 사용자 신고("말풍선 안에 내용이 한 번 더 감싸져 있음"): 누를 수 있는 말풍선의 안쪽에 본체의 다른 모양(.pick = 선택 상자)이 묻어 테두리 · 바탕이 생겼다 — 말풍선 안의 글 자리에는 상자가 없어야 한다
  const inner = await ev(`[...document.querySelectorAll('.pl-say *')].filter((e) => !e.closest('button') && !e.closest('.pl-acts')).map((e) => { const c = getComputedStyle(e); return { cls: e.className, bw: c.borderTopWidth, bg: c.backgroundColor }; }).filter((x) => x.bw !== '0px' || !/^(rgba\\(0, 0, 0, 0\\)|transparent)$/.test(x.bg))`);
  ok(inner.length === 0, `말풍선 안에 또 다른 상자(테두리 · 바탕)가 없음${inner.length ? ' — ' + JSON.stringify(inner[0]) : ''}`);
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '「가정통신문 정리」 작업이 끝났어요.', id: 's2', pick: (id) => __calls.push(['pick', id]) })`);
  await ev(`Planner.say({ group: 'attention', tone: 'warn', text: '「수행평가 채점 기준」이 확인을 기다려요.', id: 's3' })`);
  await ev(`Planner.say({ group: 'sched', tone: 'iris', text: '3시 협의회가 10분 남았어요.' })`); await settle();
  // 2026-11-23 사용자 결정(머무는 시간): 중요한 말(세션 확인 · 약속 직전)은 누를 때까지 남고 단추 쪽(아래)에 함께 뜬다 — 사라지는 말(작업 끝남)은 그 위에 떴다가 간다. 전에는 다른 종류가 차례를 기다렸다.
  ok((await text('.pl-say .pl-line p')).length === 4 && JSON.stringify((await ev('Planner.bubbles()')).map((b) => `${b.group}${b.shown ? '*' : ''}${b.keep ? '!' : ''}`)) === '["done*","done*","attention*!","sched*!"]', '같은 종류는 위로 쌓이고, 남는 말(세션 확인 · 약속 직전)은 단추 쪽에 함께 뜸(약속 직전이 맨 아래)');
  await page.mouse.move(10, 10); await settle();
  const stack = await ev(`(() => { const s = [...document.querySelectorAll('.pl-says > .pl-say')]; const r = s.map((e) => e.getBoundingClientRect()); return { n: s.length, ps: s.map((e) => e.querySelectorAll('p').length).join(), tails: s.map((e) => e.classList.contains('tail')).join(), keeps: s.map((e) => e.classList.contains('keep')).join(), xs: s.map((e) => +getComputedStyle(e.querySelector('.pl-x')).opacity > 0.5).join(), above: r[0].bottom <= r[1].top, gap: r[1].top - r[0].bottom, right: Math.abs(r[0].right - r[1].right), tailShown: s.map((e) => getComputedStyle(e, '::after').content !== 'none').join() }; })()`);
  ok(stack.n === 4 && stack.ps === '1,1,1,1' && stack.tails === 'false,false,false,true' && stack.tailShown === 'false,false,false,true' && stack.above && stack.gap > 2 && stack.gap < 16 && stack.right < 1, `내용 하나에 말풍선 하나: 위로 쌓이고(틈 ${Math.round(stack.gap)}) 꼬리는 맨 아래 것에만`);
  ok(stack.keeps === 'false,false,true,true' && stack.xs === 'false,false,true,true', '남는 말은 닫기 × 가 늘 보임(눌러야 사라진다는 표시) · 사라지는 말은 올렸을 때만');
  const ttls = await ev(`(() => { const t = (b) => { const h = Planner.say(b); const v = Planner.bubbles().find((x) => x.text === b.text).ttl; h.close(); return v; }; return [t({ group: 'done', tone: 'ok', text: 't1' }), t({ group: 'exited', tone: 'dim', text: 't2' }), t({ group: 'greet', tone: 'iris', text: 't3' }), t({ group: 'info', tone: 'iris', text: 't4', actions: [{ label: '되돌리기', run: () => {} }] }), t({ group: 'info', tone: 'warn', text: 't5' }), t({ group: 'sched', tone: 'iris', text: 't6' }), t({ group: 'attention', tone: 'warn', text: 't7' }), t({ group: 'done', tone: 'ok', text: 't8', ttl: 1234 })].join(); })()`);
  ok(ttls === '6000,6000,6000,10000,10000,0,0,1234', `머무는 시간: 글만 6초 · 단추나 실패 알림 10초 · 약속 직전과 세션 확인은 누를 때까지 · 부르는 쪽이 준 값이 먼저 — ${ttls}`);
  await shot('6b-say-stack');
  for (let i = 0; i < 4; i++) await ev(`Planner.say({ group: 'done', tone: 'ok', text: '작업 ${i} 끝' })`);
  await settle();
  ok((await text('.pl-say:not(.keep) .pl-line p')).length === 4 && (await ev(`document.querySelectorAll('.pl-says > .pl-say:not(.keep)').length`)) === 4 && (await text('.pl-say:not(.keep) .pl-line p'))[3] === '작업 3 끝' && (await ev(`document.querySelectorAll('.pl-says > .pl-say.keep').length`)) === 2, '사라지는 말풍선은 최대 4개(오래된 것부터 빠짐) · 남는 말은 그대로');
  const pd = await ev(`(() => { const e = new PointerEvent('pointerdown', { bubbles: true, cancelable: true }); document.querySelector('.pl-say .pl-line').dispatchEvent(e); return e.defaultPrevented; })()`);
  ok(pd && (await ev(`document.activeElement.id`)) === 'typing', '말풍선을 눌러도 초점을 뺏지 않음');
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '고를 것', id: 'sX', pick: (id) => __calls.push(['pick', id]) })`); await settle();
  await page.click('.pl-say.pl-pick'); await settle();
  ok(JSON.stringify((await ev('window.__calls')).filter((c) => c[0] === 'pick')) === '[["pick","sX"]]' && (await text('.pl-say:not(.keep) .pl-line p')).length === 3, '말풍선을 누르면 그 세션으로 + 그 말풍선만 닫힘');
  await page.hover('.pl-say'); await page.click('.pl-say [data-line-x="0"]'); await settle();
  ok((await text('.pl-say:not(.keep) .pl-line p')).length === 2 &&(await ev('window.__calls')).filter((c) => c[0] === 'pick').length === 1, '× 는 그 말풍선만 닫음(세션으로 가지 않음)');
  // 줄을 하나 닫을 때마다 화면을 다시 그리므로, 매번 새로 찾아 누른다(초록 말풍선의 줄이 다 닫힐 때까지)
  await ev(`for (let i = 0; i < 9 && document.querySelector('.pl-say[data-tone="ok"] [data-line-x]'); i++) document.querySelector('.pl-say [data-line-x]').click()`); await settle();
  ok((await text('.pl-say .pl-line p')).join('|') === '「수행평가 채점 기준」이 확인을 기다려요.|3시 협의회가 10분 남았어요.' && (await ev(`document.querySelector('#pl-hex').dataset.tone`)) === 'iris', '사라지는 말이 다 닫혀도 남는 말은 그대로(세션 확인이 위 · 약속 직전이 단추 쪽 · 단추의 색 = 맨 아래 것)');
  await ev(`document.querySelector('.pl-say [data-line-x]').click()`); await settle();
  ok((await text('.pl-say .pl-line p')).join('|') === '3시 협의회가 10분 남았어요.' && (await ev(`document.querySelector('.pl-say').dataset.tone`)) === 'iris' && (await ev(`document.querySelector('.pl-say').classList.contains('tail')`)), '남는 말은 누른 것만 닫힘(세션 확인을 닫아도 약속 직전은 남음)');
  await ev(`document.querySelector('.pl-say [data-line-x]').click()`); await settle();
  ok((await ev(`!document.querySelector('.pl-say') && !document.querySelector('#pl-hex').classList.contains('speak')`)), '다 닫히면 단추만');
  // 2026-11-23 사용자 신고("말풍선이 전부 남아 있음")의 재현: 여럿 가운데 하나를 닫으면 화면을 다시 그리며 "마우스가 떠났다"는 신호가 오지 않아, 나머지와 그 뒤에 오는 것이 영영 남았다
  await ev(`for (const t of ['남는 고장 1', '남는 고장 2', '남는 고장 3']) Planner.say({ group: 'done', tone: 'ok', text: t, ttl: 1500 })`); await settle();
  { const top = await ev(`(() => { const r = document.querySelector('.pl-say .pl-x').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await page.mouse.move(top.x, top.y); await settle(); await page.mouse.down(); await page.mouse.up(); await settle(); }
  ok((await text('.pl-say .pl-line p')).length === 2, '(준비) 셋 가운데 맨 위 것을 닫음 — 마우스는 그 자리 그대로');
  await page.waitForTimeout(2600);
  ok((await ev(`!document.querySelector('.pl-say')`)), '하나를 닫은 뒤에도 나머지는 제시간에 사라짐(멈춤이 굳지 않음)');
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '그 뒤에 온 말', ttl: 600 })`); await page.waitForTimeout(1300);
  ok((await ev(`!document.querySelector('.pl-say')`)), '그 뒤에 새로 온 말도 제시간에 사라짐');
  // 남는 말이 떠 있어도 사라지는 말은 그 위에 함께 떴다가 간다(남는 말이 자리를 막지 않음)
  await page.mouse.move(10, 10);
  await ev(`Planner.say({ group: 'sched', tone: 'iris', text: '남는 약속 알림' }); Planner.say({ group: 'done', tone: 'ok', text: '잠깐 뜨는 말', ttl: 600 })`); await settle();
  ok((await text('.pl-say .pl-line p')).join('|') === '잠깐 뜨는 말|남는 약속 알림', '남는 말이 떠 있어도 사라지는 말이 그 위에 함께 뜸');
  await page.waitForTimeout(1300);
  ok((await text('.pl-say .pl-line p')).join('|') === '남는 약속 알림', '사라지는 말만 가고 남는 말은 시간이 지나도 남음');
  await ev(`document.querySelector('.pl-say [data-line-x]').click()`); await settle();
  // 남는 묶음은 3개까지 함께 뜨고, 넘친 것은 자리가 나면 올라온다
  await ev(`for (let i = 1; i <= 4; i++) Planner.say({ group: 'attention', tone: 'warn', text: '물음 ' + i, actions: [{ label: '예', run: () => {} }] })`); await settle();
  ok((await text('.pl-say .pl-line p')).join('|') === '물음 1|물음 2|물음 3' && (await ev('Planner.bubbles().length')) === 4, '단추가 붙은 남는 말은 3개까지 함께 뜨고 넷째는 기다림');
  await ev(`document.querySelector('.pl-say [data-line-x]').click()`); await settle();
  ok((await text('.pl-say .pl-line p')).join('|') === '물음 2|물음 3|물음 4', '하나를 닫으면 기다리던 것이 올라옴');
  await page.click('.pl-say[data-b="1"] [data-act="0"]'); await settle();
  ok((await text('.pl-say .pl-line p')).join('|') === '물음 2|물음 4', '단추는 그 말풍선의 것만 실행 · 닫힘(다른 묶음은 그대로)');
  for (let i = 0; i < 3; i++) { await ev(`document.querySelector('.pl-say [data-line-x]')?.click()`); await settle(); }
  ok((await ev(`!document.querySelector('.pl-say')`)), '(정리) 다 닫힘');
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '금방 사라질 말', ttl: 1500 })`); await settle();
  await page.hover('.pl-say'); await page.waitForTimeout(2200);
  ok((await ev(`!!document.querySelector('.pl-say')`)), '마우스를 올리면 사라지지 않음');
  await page.mouse.move(10, 10); await page.waitForTimeout(2200);
  ok((await ev(`!document.querySelector('.pl-say')`)), '마우스를 떼면 시간이 지나 사라짐');

  // 말풍선 폭(2026-11-23 사용자 신고 "가로 길이가 고정이라 글자가 이상하게 줄바뀜"): 글 길이만큼 늘어난다 — 전에 330px 에서 두 줄로 나뉘던 글이 한 줄로
  await ev(`window.__w1 = Planner.say({ group: 'done', tone: 'ok', text: '「플래너 개선」 작업이 끝났어요.', ttl: 600000 }); window.__w2 = Planner.say({ group: 'done', tone: 'ok', text: '「2학기 교과 연구회 결과 보고서 작성과 예산 집행 내역 정리」 작업이 끝났어요.', ttl: 600000 })`); await settle();
  const ww = await ev(`[...document.querySelectorAll('.pl-say')].map((e) => { const p = e.querySelector('p'); const r = document.createRange(); r.selectNodeContents(p); const rows = new Set(); for (const c of r.getClientRects()) if (c.width) rows.add(Math.round(c.top)); return { w: e.getBoundingClientRect().width, rows: rows.size, left: e.getBoundingClientRect().left }; })`);
  ok(ww.length === 2 && ww[0].rows === 1 && ww[1].rows === 1 && ww[1].w > ww[0].w + 150 && ww[1].w > 330 && ww[1].w <= 560 && ww[1].left >= 0, `말풍선 폭은 글 길이만큼(짧은 글 ${Math.round(ww[0].w)}px · 긴 글 ${Math.round(ww[1].w)}px, 둘 다 한 줄)`);
  await ev(`window.__w1.close(); window.__w2.close()`); await settle();
  // 최대 폭(560px)을 넘는 글만 줄이 바뀌고, 그때 폭 = 가장 긴 줄
  await ev(`Planner.say({ group: 'greet', tone: 'iris', text: '좋은 아침이에요. 오늘 할 것이 3개 있고, 결과 보고서 제출이 모레까지예요. 오후에는 협의회와 공개수업 참관이 이어지니 자료를 미리 준비해 주세요.', actions: [{ label: '오늘 보기', icon: 'today', main: true, run: () => __calls.push(['act']) }], ttl: 0 })`); await settle();
  const w = await ev(`(() => { const p = document.querySelector('.pl-say p'); const r = document.createRange(); r.selectNodeContents(p); let hi = 0, lo = 1e9, rows = new Set(); for (const c of r.getClientRects()) { if (!c.width) continue; hi = Math.max(hi, c.right); lo = Math.min(lo, c.left); rows.add(Math.round(c.top)); } const b = p.getBoundingClientRect(); return { rows: rows.size, slack: b.right - hi, say: document.querySelector('.pl-say').getBoundingClientRect().width, cut: p.scrollWidth > p.clientWidth + 1 }; })()`);
  ok(w.rows >= 2 && w.slack >= 0 && w.slack < 4 && w.say > 330 && w.say <= 560 && !w.cut, `줄이 바뀌는 말풍선: 폭이 가장 긴 줄에 맞음(오른쪽 빈자리 ${w.slack.toFixed(1)}px · 폭 ${Math.round(w.say)}px · ${w.rows}줄) · 잘리지 않음`);
  await shot('7-say-long');
  await page.click('.pl-say [data-act="0"]'); await settle();
  ok((await ev('window.__calls')).some((c) => c[0] === 'act') && (await ev(`!document.querySelector('.pl-say')`)), '말풍선의 단추를 누르면 그 일을 하고 닫힘');

  // ---- 9. 데몬이 시킨 한마디 · 장부가 바뀌었을 때 ----
  await ev(`Planner.onMessage({ type: 'planner', rev: 99, proposals: 3, say: { group: 'sched', tone: 'iris', text: '3시 협의회가 10분 남았어요.', tip: '15:00 협의회', actions: [{ kind: 'folder', path: 'C:\\\\x' }, { kind: 'chat', path: 'C:\\\\x' }] } })`); await settle();
  ok((await text('.pl-say .pl-line p'))[0] === '3시 협의회가 10분 남았어요.' && (await text('.pl-say .pl-tb'))[0] === '폴더 열기' && (await text('.pl-cnt'))[0] === '3', '데몬의 한마디: 말풍선 + 단추 · 숫자 갱신');
  await page.click('.pl-say .pl-tb'); await settle();
  ok(JSON.stringify((await ev('window.__calls')).filter((c) => c[0] === 'folder')) === '[["folder","C:\\\\x"]]', '「폴더 열기」');
  await ev(`Planner.onHello(${JSON.stringify(pl.hello())})`);

  // ---- 10. 서랍 · 자리 ----
  await ev(`document.getElementById('sub').hidden = false`); await page.waitForTimeout(350);
  const pos1 = await ev(`innerWidth - document.querySelector('#pl-hex').getBoundingClientRect().right`);
  ok(Math.abs(pos1 - 322) < 3, `보조 작업 서랍이 열리면 왼쪽으로 비켜남(오른쪽 ${Math.round(pos1)})`);
  await ev(`document.getElementById('sub').hidden = true`); await page.waitForTimeout(350);
  await ev(`window.__drawer = true; document.getElementById('settings').hidden = false`); await settle();
  ok((await ev(`document.getElementById('pl').hidden`)) === true, '설정 서랍이 무대를 덮으면 단추는 숨음');
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '서랍 위의 알림' })`); await settle();
  ok((await ev(`!document.getElementById('pl-over').hidden && document.querySelector('#pl-over .pl-say p').textContent`)) === '서랍 위의 알림' && (await ev(`getComputedStyle(document.getElementById('pl-over')).zIndex`)) === '30', '그때의 말풍선은 서랍 위 구석에(지금의 알림 자리)');
  await ev(`window.__drawer = false; document.getElementById('settings').hidden = true; document.querySelector('#pl-over [data-line-x]')?.click()`); await settle();
  ok((await ev(`document.getElementById('pl').hidden`)) === false && (await ev(`document.getElementById('pl-over').hidden`)) === true, '서랍을 닫으면 단추가 돌아옴');

  // ---- 11. 꺾쇠 · 꺼짐 · 못 고칠 때 ----
  await ev(`Planner.open('2026-11-30')`); await settle();
  ok((await text('.pl-list > .pl-r .tx'))[0] === '<img src=x onerror="window.__xss=1">꺾쇠 이름' && (await ev('window.__xss')) === undefined && (await ev(`document.querySelector('.pl-list img')`)) === null, '이름의 꺾쇠는 글자 그대로(태그로 그리지 않음)');
  cfg.plannerEnabled = false;
  await ev(`Planner.applySettings({ plannerEnabled: false })`); await settle();
  ok((await ev(`document.querySelector('#pl-in').disabled && document.querySelector('#pl-in').placeholder`)) === '플래너가 꺼져 있어요' && (await ev(`[...document.querySelectorAll('.pl-list .pl-ck')].every((b) => b.disabled)`)), '플래너를 끄면 보기만(입력 · 체크 잠김)');
  ok((await ev(`document.getElementById('pl').hidden`)) === false, '플래너를 꺼도 단추는 남음(작업 알림을 말해야 하므로)');
  await ev(`Planner.applySettings({ notifyDone: false })`); await settle();
  ok((await ev(`document.getElementById('pl').hidden`)) === true, '플래너도 작업 알림도 끄면 단추를 숨김');
  cfg.plannerEnabled = true;
  await ev(`Planner.applySettings({ plannerEnabled: true, notifyDone: true })`); await settle();
  ok((await ev(`document.querySelector('#pl-in').disabled`)) === false, '다시 켜면 입력 가능');

  // ---- 12. 설명은 올렸을 때 ----
  await ev(`Planner.open('2026-11-23')`); await settle();
  await page.hover('.pl-pill.span'); await settle();
  ok((await ev(`!document.getElementById('pl-tip').hidden && document.getElementById('pl-tip').textContent`)).startsWith('11월 20일 금요일부터 11월 25일 수요일까지'), '뱃지에 올리면 설명 풍선');
  await page.mouse.move(10, 10); await settle();
  ok((await ev(`document.getElementById('pl-tip').hidden`)), '떼면 사라짐');
  // 이름 자리에 올리면 전체 내용(2026-11-23): 잘린 이름은 이름 전체가, 메모가 있으면 이름 + 메모 · 장소가 뜬다. 짧고 메모도 없으면 뜨지 않는다
  await ev(`Planner.open('2026-11-28')`); await settle();
  const tx = (i) => `.pl-list > .pl-r:nth-child(${i}) .tx`;
  const tipOf = () => ev(`(() => { const t = document.getElementById('pl-tip'); return t.hidden ? null : { head: t.querySelector('b')?.textContent ?? null, body: t.querySelector('span')?.textContent ?? null, w: t.getBoundingClientRect().width, in: t.getBoundingClientRect().left >= 0 && t.getBoundingClientRect().right <= innerWidth }; })()`);
  ok((await ev(`(() => { const e = document.querySelector(${JSON.stringify(tx(1))}); return e.textContent === ${JSON.stringify(LONG)} && e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 30 && e.clientHeight < 44; })()`)), '아주 긴 이름은 목록에서 두 줄까지 보이고 잘림(전제)');
  // 2026-11-23 사용자 신고("뱃지 · 아이콘 때문에 이름이 잘림"): 전에 한 줄에서 잘리던 길이의 이름은 두 줄에 다 보인다 · 줄 끝의 숨은 단추는 올리기 전에는 자리를 차지하지 않는다
  const mid = await ev(`(() => { const e = document.querySelector(${JSON.stringify(tx(5))}); const r = e.closest('.pl-r'); return { same: e.textContent === ${JSON.stringify(MID)}, cut: e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1, h: e.clientHeight, btns: r.querySelectorAll('button:not(.pl-ck):not(.fold)').length, gapRight: r.getBoundingClientRect().right - e.getBoundingClientRect().right }; })()`);
  ok(mid.same && !mid.cut && mid.h > 30, `전에 잘리던 길이의 이름은 두 줄에 다 보임(높이 ${mid.h})`);
  ok(mid.btns === 0 && mid.gapRight < 12, `줄에는 체크 · 접기 말고 단추가 없어 이름이 줄 끝까지 씀(이름 오른쪽 빈자리 ${Math.round(mid.gapRight)}px)`);
  await page.hover(tx(5)); await page.waitForTimeout(300);
  const midHover = await ev(`(() => { const e = document.querySelector(${JSON.stringify(tx(5))}); const r = e.closest('.pl-r'); return { btns: r.querySelectorAll('button:not(.pl-ck):not(.fold)').length, cur: getComputedStyle(r).cursor, cut: e.scrollHeight > e.clientHeight + 1, tip: !document.getElementById('pl-tip').hidden }; })()`);
  ok(midHover.btns === 0 && midHover.cur === 'pointer' && midHover.tip === false, `줄에 올려도 단추가 생기지 않음 · 누를 수 있는 손 모양 · 풍선 없음(풍선 ${midHover.tip})`);
  await page.mouse.move(10, 10); await settle();
  // 2026-11-24 사용자 지정("등록된 일정 호버시 자세한 텍스트 … 이제 필요없음. 삭제"): 이름에 올려도 풍선이 뜨지 않는다 — 자세한 내용은 줄을 눌러 뜨는 일정 창에서 본다
  const hovers = [];
  for (const i of [1, 2, 3, 4]) { await page.hover(tx(i)); await settle(); hovers.push((await tipOf()) === null); }
  await shot('12b-no-full-tip');
  ok(hovers.every(Boolean), `이름에 올려도 풍선이 뜨지 않음(잘린 이름 · 메모 있는 일 · 짧은 이름 · 아주 긴 메모) — ${hovers.join(',')}`);
  ok((await ev(`document.querySelectorAll('.pl [data-full]').length`)) === 0, '이름 자리에 풍선용 표시(data-full)가 남아 있지 않음');
  // 메모는 화면 낭독기가 읽을 수 있게 이름에 달려 있다(풍선과 무관 — 코덱스 검토 2026-11-23 3번)
  ok((await ev(`document.querySelector(${JSON.stringify(tx(2))}).getAttribute('aria-description')`)) === '교무부장님께 2학기 교과 연구회 결과 보고서를 작성해서 전달\n장소: 교무실' && (await ev(`document.querySelector(${JSON.stringify(tx(3))}).hasAttribute('aria-description')`)) === false, '메모는 이름의 설명(aria-description)으로도 달림 · 메모가 없으면 달지 않음');
  await page.mouse.move(10, 10); await settle();
  await ev(`Planner.open('2026-11-23')`); await settle();
  ok((await ev(`[...document.querySelectorAll('.pl button')].every((b) => b.getAttribute('aria-label') || b.textContent.trim())`)), '단추마다 이름(aria-label 또는 글자)');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(await ev(`document.querySelector('.pl').textContent`)), '화면에 이모지 없음');

  // ---- 13. 코덱스 검토(걸음 3)에서 나온 것 ----
  // 13-1 적던 글 · 커서 · 초점은 다시 그려도 남는다. 말풍선은 판을 다시 그리지 않는다.
  await page.click('#pl-in'); await page.keyboard.type('적던 말입니다'); await ev(`document.querySelector('#pl-in').setSelectionRange(2, 4); document.querySelector('#pl-in').__mark = 1`);
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '적는 사이에 온 알림' })`); await settle();
  ok((await ev(`document.querySelector('#pl-in').__mark`)) === 1 && (await ev(`document.querySelector('#pl-in').value`)) === '적던 말입니다', '말풍선이 떠도 판(입력칸)은 다시 그리지 않음');
  await ev(`Planner.onMessage({ type: 'planner', rev: 1, proposals: 0 })`); await settle();
  const kept = await ev(`(() => { const i = document.querySelector('#pl-in'); return { v: i.value, a: i.selectionStart, b: i.selectionEnd, f: document.activeElement === i, mark: i.__mark }; })()`);
  ok(kept.v === '적던 말입니다' && kept.a === 2 && kept.b === 4 && kept.f && kept.mark === undefined, '수첩이 바뀌어 판을 다시 그려도 적던 글 · 커서 · 초점이 남음');
  await ev(`(() => { const i = document.querySelector('#pl-in'); i.__mark = 2; i.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); })()`);
  await ev(`Planner.onMessage({ type: 'planner', rev: 2, proposals: 0 })`); await settle();
  ok((await ev(`document.querySelector('#pl-in').__mark`)) === 2, '한글을 조합하는 동안에는 판을 다시 그리지 않음');
  await ev(`document.querySelector('#pl-in').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))`); await settle();
  ok((await ev(`document.querySelector('#pl-in').__mark`)) === undefined && (await ev(`document.querySelector('#pl-in').value`)) === '적던 말입니다', '조합이 끝나면 미뤄 둔 것을 그림(글은 그대로)');
  const sc = await ev(`(() => { const l = document.querySelector('.pl-list'); l.scrollTop = 30; return l.scrollTop; })()`);
  await ev(`Planner.onMessage({ type: 'planner', rev: 3, proposals: 0 })`); await settle();
  ok(sc > 0 ? (await ev(`document.querySelector('.pl-list').scrollTop`)) === sc : true, '목록의 스크롤 자리도 남음');
  await ev(`document.querySelector('#pl-in').value = ''; document.querySelector('.pl-say [data-line-x]')?.click()`);
  // 13-2 플래너 안에서 누른 키는 본체로 올라가지 않는다(Esc 만)
  await ev(`window.__keys.length = 0; (() => { const b = document.querySelector('.pl-list .pl-ck'); b.focus(); for (const k of ['Enter', '1', 'y', 'Escape']) b.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true })); })()`);
  ok(JSON.stringify(await ev('window.__keys')) === '["Escape"]', '플래너 단추에서 누른 Enter · 숫자 · y 는 본체로 새지 않음(Esc 만 올라감)');
  await ev(`window.__keys.length = 0; (() => { const i = document.querySelector('#pl-in'); i.focus(); for (const k of ['1', 'n', 'F2']) i.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); })()`);
  ok((await ev('window.__keys.length')) === 0, '입력칸에서 친 글자도 본체 단축키로 새지 않음');
  // 13-3 응답이 오는 사이 초점을 옮겼으면 다시 가져오지 않는다
  await page.click('#pl-in'); await page.keyboard.type('아이리스에게');
  await ev(`document.querySelector('#pl-send').click(); document.getElementById('typing').focus()`); await page.waitForTimeout(400);
  ok((await ev(`document.activeElement.id`)) === 'typing' && (await ev(`document.querySelectorAll('.pl-thread .pl-bub.me').length`)) >= 1, '답이 오는 사이 다른 곳으로 옮긴 초점을 다시 가져오지 않음');
  // 13-4 차례를 기다리는 것끼리도 같은 종류는 합친다
  await ev(`Planner.say({ group: 'greet', tone: 'iris', text: '계속 떠 있는 말', ttl: 600000 }); for (let i = 0; i < 6; i++) Planner.say({ group: 'done', tone: 'ok', text: '끝남 ' + i });`); await settle();
  const qd = (await ev('Planner.bubbles()')).filter((b) => b.group === 'done');
  ok(qd.length === 4 && qd[0].text === '끝남 2' && qd.every((b) => !b.shown), '기다리는 같은 종류는 한 묶음으로(최대 4개, 오래된 것부터 빠짐)');
  await ev(`for (let i = 0; i < 9 && document.querySelector('.pl-say [data-line-x]'); i++) document.querySelector('.pl-say [data-line-x]').click()`); await settle();
  // 13-5 달을 빨리 두 번 넘겨도 두 달
  await ev(`Planner.close(); Planner.open('2026-11-23')`); await settle();
  await ev(`document.querySelector('[data-month="1"]').click(); document.querySelector('[data-month="1"]').click()`); await page.waitForTimeout(300);
  ok((await text('.pl-head strong'))[0] === '1월 1일 금요일', '응답 전에 「다음 달」을 두 번 눌러도 두 달 넘어감');
  await ev(`Planner.open('2026-11-23')`); await settle();
  // 13-6 꺼져 있을 때의 안내 + 설정 열기 · 닫으면 「말로 고치기」의 대상도 잊는다
  cfg.plannerEnabled = false; await ev(`Planner.applySettings({ plannerEnabled: false })`); await settle();
  ok((await text('.pl-note'))[0].startsWith('플래너가 꺼져 있어요'), '꺼져 있으면 판에 안내');
  await page.click('[data-settings]'); await settle();
  ok(JSON.stringify((await ev('window.__calls')).filter((c) => c[0] === 'settings')) === '[["settings","planner"]]', '「설정 열기」');
  cfg.plannerEnabled = true; await ev(`Planner.applySettings({ plannerEnabled: true })`); await settle();
  // 13-7 본체의 확인 카드가 뜨면 그 위로 · 좁고 낮은 창
  const b0 = await ev(`innerHeight - document.querySelector('#pl-hex').getBoundingClientRect().bottom`);
  await ev(`document.getElementById('approval').hidden = false`); await page.waitForTimeout(300);
  const b1 = await ev(`innerHeight - document.querySelector('#pl-hex').getBoundingClientRect().bottom`);
  const clear = await ev(`document.querySelector('#pl-hex').getBoundingClientRect().bottom <= document.getElementById('approval').getBoundingClientRect().top`);
  ok(Math.abs(b1 - b0 - 120) < 2 && clear, `본체의 확인 카드가 뜨면 단추가 그 위로 올라감(${Math.round(b0)} → ${Math.round(b1)})`);
  await ev(`document.getElementById('approval').hidden = true`); await page.waitForTimeout(300);
  await page.setViewportSize({ width: 560, height: 520 }); await ev(`document.getElementById('sub').hidden = false`); await page.waitForTimeout(400);
  const small = await ev(`(() => { const p = document.querySelector('.pl-panel').getBoundingClientRect(), f = document.querySelector('.pl-foot').getBoundingClientRect(), x = document.querySelector('[data-close]').getBoundingClientRect(); return { left: p.left, top: p.top, right: innerWidth - p.right, footBottom: innerHeight - f.bottom, xTop: x.top, days: document.querySelectorAll('.pl-cal button').length, w: p.width }; })()`);
  ok(small.left >= 0 && small.top >= 0 && small.footBottom >= 0 && small.xTop >= 0 && small.days === 7, `좁고 낮은 창: 판 · 닫기 · 입력칸이 화면 안에 들어오고 달 대신 그 주(폭 ${Math.round(small.w)} · 위 ${Math.round(small.top)})`);
  await shot('8-small');
  await ev(`document.getElementById('sub').hidden = true`); await page.setViewportSize({ width: 1100, height: 860 }); await page.waitForTimeout(400);
  ok((await ev(`document.querySelectorAll('.pl-cal button').length`)) === 30, '창을 다시 키우면 달 전체');
  // 13-8 꺾쇠 · 따옴표가 들어가는 다른 자리
  const evil = `"><img src=x onerror="window.__xss2=1">'`;
  pl.store.apply([{ op: 'add', item: { title: '폴더와 단계', start: '2026-11-23', folder: `C:\\\\x\\\\${evil}`, time: '18:00' } }], U);
  pl.store.apply([{ op: 'add', item: { title: '단계 있는 일', start: '2026-11-23', end: '2026-11-24', steps: [{ title: evil, day: '2026-11-23' }] } }], U);
  pl.store.apply([{ op: 'propose', item: { title: evil, start: '2026-11-23' } }], { by: 'session', via: 'cli', evidence: evil, session: { id: 'x', title: evil, agent: 'claude' } });
  await ev(`Planner.onMessage({ type: 'planner', rev: 9, proposals: 1 })`); await settle();
  await page.click('[data-strip]'); await settle();
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: ${JSON.stringify(evil)}, sub: ${JSON.stringify(evil)}, tip: ${JSON.stringify(evil)} })`); await settle();
  ok((await ev('window.__xss2')) === undefined && (await ev(`document.querySelectorAll('.pl img, #pl-over img').length`)) === 0 && (await text('.pl-r.step .tx')).includes(evil) && (await text('.pl-strip-b .tx'))[0] === evil && (await ev(`document.querySelector('.pl-strip-b .tx').dataset.tip`)).includes(evil) && (await text('.pl-say .pl-line p'))[0].startsWith(evil), '꺾쇠 · 따옴표는 폴더 · 단계 · 제안 · 근거 · 말풍선 어디서나 글자 그대로');
  await ev(`document.querySelector('.pl-say [data-line-x]')?.click(); Planner.close()`);

  // ---- 14. 아이리스에게 말하기(숨은 AI 는 가짜 실행기 — 실제 AI 접촉 0) ----
  const script = []; const asked = [];
  const J = (say, ops = []) => JSON.stringify({ say, ops });
  pl.talkSvc = new PlannerTalk({ planner: pl, stateDir: base, agents: () => ['claude'], now: () => new Date(2026, 10, 23, 9, 0, 0),
    run: async (a) => { asked.push(a); await new Promise((r) => setTimeout(r, 250)); const next = script.shift(); return next ? { ok: true, text: next, model: 'claude-haiku-5-5', modelActual: true, tokens: 3200, ms: 250 } : { ok: false, reason: 'limit', ms: 1 }; } });
  await page.click('#pl-hex'); await settle(); await page.click('#pl-in'); await settle();
  script.push(J('26일 목요일부터 27일 금요일까지로 넣었어요.', [{ op: 'add', title: '출장', start: '2026-11-26', end: '2026-11-27' }]));
  await page.fill('#pl-in', '26일부터 27일까지 출장'); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  ok((await text('.pl-thread .pl-bub.me')).pop() === '26일부터 27일까지 출장' && (await ev(`!!document.querySelector('.pl-thread .pl-wait')`)) && (await ev(`document.getElementById('pl-in').value`)) === '', '말을 보내면: 내 말이 대화에 · 생각하는 점 · 입력칸은 비움');
  await page.waitForTimeout(600);
  ok((await text('.pl-thread .pl-bub.ai > p:not(.warn)')).pop() === '26일 목요일부터 27일 금요일까지로 넣었어요.' && (await text('.pl-thread .pl-card .tx')).pop() === '출장' && (await ev(`document.querySelectorAll('.pl-thread [data-undo]').length`)) === 1 && !(await ev(`!!document.querySelector('.pl-thread .pl-wait')`)), '아이리스의 답 + 넣은 일 카드 + 되돌리기');
  ok((await ev(`document.querySelector('.pl-list').textContent.includes('출장')`)) && (await ev(`document.activeElement.id`)) === 'pl-in', '달력이 넣은 날로 가서 그 일이 보임 · 입력칸 초점 그대로(이어서 말할 수 있음)');
  ok(asked.length === 1 && asked[0].prompt.includes('사용자의 말: 26일부터 27일까지 출장') && asked[0].prompt.startsWith('오늘: 2026-11-23 월요일 09:00'), '숨은 AI 는 한 번만 부름(오늘 · 수첩 · 말)');
  await shot('9-talk-add');
  await page.click('.pl-thread [data-undo]'); await page.waitForTimeout(300);
  ok((await text('.pl-thread .pl-bub.ai > p:not(.warn)')).pop() === '방금 바꾼 것을 되돌렸어요.' && !pl.store.list('active').some((it) => it.title === '출장') && (await ev(`document.querySelectorAll('.pl-thread [data-undo]').length`)) === 0, '되돌리기: 넣은 것이 사라지고 단추도 사라짐');
  script.push(J('지웠어요.', [{ op: 'remove', no: late.no }]));
  await page.fill('#pl-in', '채점 기준 확인 지워 줘'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  ok((await text('.pl-thread .pl-bub.ai > p:not(.warn)')).pop() === '「수행평가 채점 기준 확인」 지우기 — 이렇게 할까요?' && (await ev(`document.querySelectorAll('.pl-thread [data-yes]').length`)) === 1 && pl.store.get(late.id).state === 'active', '지우기는 먼저 묻는다(「그렇게 해 주세요」 · 「아니요」)');
  await shot('10-talk-confirm');
  await page.click('.pl-thread [data-yes]'); await page.waitForTimeout(400);
  ok((await text('.pl-thread .pl-bub.ai > p:not(.warn)')).pop() === '그렇게 했어요.' && pl.store.get(late.id).state === 'trash' && (await ev(`document.querySelectorAll('.pl-thread [data-yes]').length`)) === 0 && asked.length === 2 && (await ev(`document.querySelectorAll('.pl-thread [data-undo]').length`)) === 1, '그렇게 해 주세요 → 그때 지움(휴지통) · AI 를 다시 부르지 않음 · 되돌리기');
  script.push(J('수요일(25일) 몇 시인가요?', [{ op: 'ask' }]));
  await page.fill('#pl-in', '수요일에 학부모 상담'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  ok((await text('.pl-thread .pl-bub.ai > p:not(.warn)')).pop() === '수요일(25일) 몇 시인가요?' && (await ev(`document.querySelectorAll('.pl-thread .pl-bub.ai:last-child .pl-res').length`)) === 0, '되묻기: 말만');
  script.push(J('넣었어요.', [{ op: 'add', title: '학부모 상담', start: '2026-11-23', time: '15:30' }]));
  await page.fill('#pl-in', '오늘 3시 반'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  ok((await text('.pl-thread .pl-bub.ai:last-child p.warn'))[0].includes('「협의회」와 시간이 겹쳐요') && asked[3].prompt.includes('아이리스: 수요일(25일) 몇 시인가요?') && asked[3].prompt.includes('사용자: 수요일에 학부모 상담'), '겹침 알림은 답 아래에 · 이어지는 말에는 앞의 대화가 함께 감');
  await page.fill('#pl-in', '금요일 2시 연수'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  ok((await text('.pl-thread .pl-bub.ai > p:not(.warn)')).pop() === '지금은 아이리스를 부를 수 없어요(사용 한도가 찼어요). 말은 적어 두었어요 — 연결되면 정리할게요.' && pl.talkSvc.inbox().length === 1, '부를 수 없을 때: 말을 받아 두었다고 알림');
  await shot('11-talk-held');
  cfg.plannerTalk = false;
  await page.fill('#pl-in', '내일 회의'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok((await text('.pl-thread .pl-bub.ai > p:not(.warn)')).pop().includes('말하기가 꺼져 있어요') && asked.length === 5, '말하기를 끄면 부르지 않고 그렇게 답함');
  cfg.plannerTalk = true;
  await ev(`Planner.close()`); await settle();

  // ---- 15. 창이 뒤에 있을 때 · 미리보기 · 「내일로 옮기기」의 날짜 · 준비 전에 온 말(2026-11-23 검토 반영) ----
  await ev(`document.querySelectorAll('.pl-say [data-line-x]').forEach((b) => b.click())`); await settle();
  await ev(`window.__osCalls = []; window.Notify = { os: (o) => { window.__osCalls.push({ title: o.title, sub: o.sub }); return true; } }; window.__realFocus = document.hasFocus; document.hasFocus = () => false;`);
  await ev(`Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'sched', tone: 'iris', os: true, text: '오후 3시 「협의회」가 10분 남았어요.', tip: '15:00 협의회', actions: [{ kind: 'open', day: '2026-11-23' }] } })`); await settle();
  ok(JSON.stringify(await ev('window.__osCalls')) === '[{"title":"오후 3시 「협의회」가 10분 남았어요.","sub":"15:00 협의회"}]', '창이 뒤에 있으면 약속 알림을 윈도우 알림 길로도 넘김');
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '뒤에 있는 동안 끝난 작업', ttl: 300 })`);
  await page.waitForTimeout(700);
  ok((await text('.pl-say .pl-line p')).join('|') === '뒤에 있는 동안 끝난 작업|오후 3시 「협의회」가 10분 남았어요.', '창이 뒤에 있는 동안에는 말풍선이 사라지지 않고 기다림(약속 알림은 단추 쪽에 남고, 끝난 작업은 그 위에)');
  await ev(`document.querySelector('.pl-say.keep [data-line-x]').click()`); await settle();
  ok((await text('.pl-say .pl-line p')).join('|') === '뒤에 있는 동안 끝난 작업', '남는 말을 닫아도 사라지는 말은 뒤에 있는 동안 남아 있음');
  await ev(`document.hasFocus = window.__realFocus; window.dispatchEvent(new Event('focus'));`); await page.waitForTimeout(700);
  ok((await ev(`!document.querySelector('.pl-say')`)), '창으로 돌아오면 그때부터 시간을 세어 사라짐');
  await ev(`Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'sched', tone: 'iris', os: true, text: '보고 있을 때의 알림' } })`); await settle();
  ok((await ev('window.__osCalls.length')) === 1, '보고 있을 때는 윈도우 알림을 띄우지 않음');
  await ev(`document.querySelectorAll('.pl-say [data-line-x]').forEach((b) => b.click())`); await settle();
  await ev(`Planner.say({ group: 'greet', tone: 'iris', text: '남아 있는 말풍선', ttl: 600000 }); Planner.say({ group: 'done', tone: 'ok', text: '예시 알림', force: true })`); await settle();
  ok((await text('.pl-say .pl-line p')).join('|') === '예시 알림' && JSON.stringify((await ev('Planner.bubbles()')).map((b) => b.text)) === '["예시 알림","남아 있는 말풍선"]', '설정의 미리보기는 떠 있는 말풍선 뒤에서 기다리지 않음(떠 있던 것은 다음 차례로)');
  await ev(`document.querySelectorAll('.pl-say [data-line-x]').forEach((b) => b.click())`); await settle(); await ev(`document.querySelectorAll('.pl-say [data-line-x]').forEach((b) => b.click())`); await settle();
  pl.rules = new PlannerRules({ planner: pl, stateDir: base, now: () => new Date(2026, 10, 23, 9, 0, 0) });
  await ev(`Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'greet', tone: 'iris', text: '오늘 끝낸 일 1개, 남은 일 2개예요.', actions: [{ kind: 'move', count: 2, day: '2026-11-22' }, { kind: 'open', day: '2026-11-22', label: '오늘 보기' }] } })`); await settle();
  await page.click('.pl-say [data-act="0"]'); await page.waitForTimeout(400);
  ok((await text('.pl-thread .pl-bub.ai > p:not(.warn)')).pop() === '날짜가 바뀌어서 옮기지 않았어요. 달력에서 다시 확인해 주세요.', '어제 뜬 「내일로 옮기기」를 오늘 누르면 옮기지 않음(말풍선이 말하던 그날 것만)');
  await ev(`Planner.close()`); await settle();
  // ---- 「작업 시작」 · 처음 한 번 소개 · 끌 때 말풍선 거두기 · 안 보는 사이의 차례(2026-11-23, 걸음 9 + 걸음 7~8 검토 반영) ----
  const clearSays = async () => { for (let i = 0; i < 6; i++) { await ev(`document.querySelectorAll('.pl-say [data-line-x]').forEach((b) => b.click())`); await settle(); } };
  await clearSays();
  const prep = pl.store.apply([{ op: 'propose', item: { title: '결과 보고서 초안 쓰기', start: '2026-11-23', folder: 'C:\\IRIS\\R01\\결과 보고서', action: { kind: 'start-work', for: big.id, folder: 'C:\\IRIS\\R01\\결과 보고서', prompt: '「결과 보고서 제출」을 준비하려고 해요. 계획부터 말해 주세요.' } } }], { by: 'iris', via: 'check', evidence: '폴더에서 파일 이름 3개를 살펴봤어요' }).items[0];
  await ev(`window.__calls.length = 0; Planner.onMessage({ type: 'planner', rev: ${pl.store.rev}, proposals: ${pl.store.list('proposed').length}, say: { group: 'proposal', tone: 'iris', text: '아이리스 제안이 1개 있어요.', actions: [{ kind: 'proposals' }] } })`); await settle();
  await page.click('.pl-say [data-act="0"]'); await page.waitForTimeout(500);
  ok((await ev(`!!document.querySelector('[data-work="${prep.id}"]')`)), '준비 점검이 올린 제안에는 「작업 시작」 단추가 있음');
  await page.click(`[data-work="${prep.id}"]`); await settle();
  const work = await ev('window.__calls');
  ok(work.length === 1 && work[0][0] === 'chat' && work[0][1] === 'C:\\IRIS\\R01\\결과 보고서' && work[0][2].startsWith('「결과 보고서 제출」을 준비하려고 해요') && pl.store.get(prep.id).state === 'proposed', '「작업 시작」 = 그 폴더 + 요청문을 본체에 넘기기만 함(보내기는 사용자 · 제안은 그대로 남음)');
  await ev(`Planner.close()`); await settle(); await clearSays();
  // 처음 한 번 소개: 첫 실행 튜토리얼이 덮고 있는 동안에는 띄우지 않고, 닫히면 띄운다
  const introAcks = []; page.on('request', (rq) => { if (rq.method() === 'POST' && rq.url().endsWith('/api/planner/intro-seen')) introAcks.push(rq.url()); });
  await ev(`window.__tut = true; window.Tutorial = { isOpen: () => window.__tut }; Planner.onMessage({ type: 'planner', rev: ${pl.store.rev}, proposals: 0, say: { group: 'greet', tone: 'iris', intro: true, text: '일정은 저한테 말해 주세요. 달력에 넣고 때맞춰 알려 드릴게요.', actions: [{ kind: 'open', day: '2026-11-23', label: '열어 보기' }] } })`); await settle();
  ok((await ev('Planner.bubbles().length')) === 0, '소개 말풍선: 튜토리얼이 덮고 있는 동안에는 띄우지 않음');
  await ev(`window.__tut = false`); await page.waitForTimeout(2600);
  ok((await text('.pl-say .pl-line p'))[0] === '일정은 저한테 말해 주세요. 달력에 넣고 때맞춰 알려 드릴게요.' && (await text('.pl-say [data-act="0"]'))[0].includes('열어 보기'), '튜토리얼이 닫히면 소개 말풍선 + 「열어 보기」');
  // 실제로 보인 뒤에야 데몬에 "소개했다"고 알린다(POST /api/planner/intro-seen) · 이미 들고 있으면 같은 소개를 겹쳐 띄우지 않는다
  ok(introAcks.length === 1, `소개가 실제로 보였을 때 한 번 알림(튜토리얼에 가려 있던 동안에는 알리지 않음) — ${introAcks.length}`);
  await ev(`Planner.onMessage({ type: 'planner', rev: ${pl.store.rev}, proposals: 0, say: { group: 'greet', tone: 'iris', intro: true, text: '일정은 저한테 말해 주세요. 달력에 넣고 때맞춰 알려 드릴게요.' } })`); await settle();
  ok((await ev(`Planner.bubbles().filter((b) => b.meta && b.meta.intro).length`)) === 1 && introAcks.length === 1, '데몬이 다시 보낸 소개는 겹쳐 띄우지 않음');
  await page.click('.pl-say [data-act="0"]'); await page.waitForTimeout(400);
  ok((await ev('Planner.isOpen()')) === true, '「열어 보기」 = 달력 판이 펴짐');
  await ev(`Planner.close(); delete window.Tutorial`); await settle(); await clearSays();
  // 창이 뒤에 있을 때 온 소개: 돌아와서 보일 때 알린다
  await ev(`window.__rf3 = document.hasFocus; document.hasFocus = () => false; Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'greet', tone: 'iris', intro: true, text: '뒤에 있을 때 온 소개' } })`); await settle();
  ok(introAcks.length === 1, '창이 뒤에 있는 동안에는 "보여 줬다"고 알리지 않음');
  await ev(`document.hasFocus = window.__rf3; window.dispatchEvent(new Event('focus'))`); await page.waitForTimeout(300);
  ok(introAcks.length === 2, '창으로 돌아와 보이면 그때 알림');
  await clearSays();
  // 「잠시 조용히」를 켜면: 화면에 이미 와 있던 플래너의 말도 멈춘다. 답을 기다리는 물음(세션이 지우려는 것)과 세션의 작업 알림은 남긴다
  const soon = new Date(Date.now() + 3600_000).toISOString();
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '세션 작업 알림 2', ttl: 0 });
    Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'greet', tone: 'iris', text: '조용히 전에 온 인사' } });
    Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'attention', tone: 'warn', sticky: true, text: '「가정통신문 정리」 세션이 「협의회」를 지우려고 해요.', actions: [{ kind: 'confirm', token: 'tok-1', yes: true, label: '지우기' }, { kind: 'confirm', token: 'tok-1', yes: false, label: '그대로 두기' }] } })`); await settle();
  await ev(`Planner.applySettings({ plannerQuietUntil: ${JSON.stringify(soon)} })`); await settle();
  ok(JSON.stringify((await ev('Planner.bubbles()')).map((b) => b.text).sort()) === JSON.stringify(['「가정통신문 정리」 세션이 「협의회」를 지우려고 해요.', '세션 작업 알림 2'].sort()), '「잠시 조용히」를 켜면 와 있던 플래너의 인사는 거두고, 지우기 확인과 세션 알림은 남김');
  await ev(`Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'greet', tone: 'iris', intro: true, text: '조용히 중에 온 소개' } })`); await settle();
  ok(!(await ev('Planner.bubbles()')).some((b) => b.text === '조용히 중에 온 소개'), '조용히 하는 동안 온 소개는 받지 않음(데몬이 끝난 뒤 다시 보낸다)');
  await ev(`Planner.applySettings({ plannerQuietUntil: null })`); await settle();
  // 세션이 지우려는 것의 확인: 「지우기」를 누르면 데몬에 답을 보내고(POST /api/planner/confirm) 결과를 되돌리기와 함께 말한다
  const confirms = []; pl.cliSvc = { confirm: (token, yes) => { confirms.push([token, yes]); return yes ? { ok: true, say: '「협의회」를 지웠어요. 휴지통에 30일 남아요.', changeId: 'chg-1' } : { ok: true, say: '「협의회」는 그대로 두었어요.' }; } };
  await ev(`document.querySelector('.pl-say [data-line-x]').click()`); await settle(); // 떠 있던 세션 알림을 닫으면 다음 차례 = 지우기 확인
  ok((await text('.pl-say .pl-line p'))[0] === '「가정통신문 정리」 세션이 「협의회」를 지우려고 해요.' && (await text('.pl-say [data-act]')).join('|').replace(/\s+/g, '') === '지우기|그대로두기', '지우기 확인 말풍선: 누가 · 무엇을 + 단추 둘(스스로 사라지지 않음)');
  await page.click('.pl-say [data-act="0"]'); await page.waitForTimeout(500);
  ok(JSON.stringify(confirms) === '[["tok-1",true]]' && (await text('.pl-say .pl-line p'))[0] === '「협의회」를 지웠어요. 휴지통에 30일 남아요.' && (await text('.pl-say [data-act="0"]'))[0].includes('되돌리기'), '「지우기」 = 데몬에 답을 보내고 결과 + 「되돌리기」를 말함');
  await clearSays();
  // 답을 기다리는 물음은 사라지지 않는다: 플래너를 껐다 켜도 · 화면이 다시 붙어도 되살아나고, 같은 물음을 겹쳐 띄우지 않는다
  const askSay = { group: 'attention', tone: 'warn', sticky: true, text: '「결과 보고서 초안」 세션이 「출장」을 지우려고 해요.', actions: [{ kind: 'confirm', token: 'tok-2', yes: true, label: '지우기' }, { kind: 'confirm', token: 'tok-2', yes: false, label: '그대로 두기' }] };
  pl.cliSvc.asks = () => [askSay];
  await ev(`Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: ${JSON.stringify(askSay)} }); Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: ${JSON.stringify(askSay)} })`); await settle();
  ok((await ev(`Planner.bubbles().filter((b) => b.meta && b.meta.token === 'tok-2').length`)) === 1, '같은 물음이 다시 와도 겹쳐 띄우지 않음');
  await ev(`Planner.applySettings({ plannerEnabled: false })`); await settle();
  const offN = await ev(`Planner.bubbles().length`);
  await ev(`Planner.applySettings({ plannerEnabled: true })`); await page.waitForTimeout(500);
  ok(offN === 0 && (await text('.pl-say .pl-line p'))[0] === askSay.text, '플래너를 껐다 켜면 거뒀던 물음이 되살아남(답할 길이 없어지지 않음)');
  await ev(`document.querySelectorAll('.pl-say [data-line-x]').forEach((b) => b.click())`); await settle();
  await ev(`Planner.onHello({ ok: true, enabled: true, rev: 1, proposals: 0, asks: [${JSON.stringify(askSay)}] })`); await settle();
  ok((await text('.pl-say .pl-line p'))[0] === askSay.text, '화면이 다시 붙을 때(hello)도 답을 기다리는 물음을 되살림');
  pl.cliSvc.asks = () => []; await clearSays();
  // 플래너를 끄면: 플래너가 하던 말 · 차례를 기다리던 말만 거둔다(세션의 작업 알림은 그대로)
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '세션 작업 알림', ttl: 600000 }); Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'greet', tone: 'iris', text: '플래너가 한 말(차례 대기)' } })`); await settle();
  ok(JSON.stringify((await ev('Planner.bubbles()')).map((b) => b.text)) === '["세션 작업 알림","플래너가 한 말(차례 대기)"]', '(준비) 세션 알림이 떠 있고 플래너의 말이 차례를 기다림');
  await ev(`Planner.applySettings({ plannerEnabled: false })`); await settle();
  ok(JSON.stringify((await ev('Planner.bubbles()')).map((b) => b.text)) === '["세션 작업 알림"]' && (await ev(`!document.getElementById('pl-hex').closest('[hidden]')`)), '플래너를 끄면 기다리던 플래너의 말만 거둠 · 세션 알림과 육각 단추는 남음');
  await clearSays(); await ev(`Planner.applySettings({ plannerEnabled: true })`); await settle();
  await ev(`Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'sched', tone: 'iris', text: '플래너가 하던 말(떠 있음)', sticky: true } }); Planner.say({ group: 'done', tone: 'ok', text: '뒤에 선 세션 알림', ttl: 0 })`); await settle();
  await ev(`Planner.applySettings({ plannerEnabled: false })`); await settle();
  ok((await text('.pl-say .pl-line p'))[0] === '뒤에 선 세션 알림' && (await ev('Planner.bubbles().length')) === 1, '떠 있던 플래너의 말도 거두고 뒤에 선 세션 알림이 바로 나옴');
  await clearSays(); await ev(`Planner.applySettings({ plannerEnabled: true })`); await settle();
  // 안 보는 사이에 더 급한 말이 오면: 떠 있던 덜 급한 말(인사)을 차례로 돌려보내고 급한 것을 앞에 세운다
  await ev(`window.__realFocus2 = document.hasFocus; document.hasFocus = () => false; Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'greet', tone: 'iris', text: '뒤에 있을 때 뜬 인사' } }); Planner.say({ group: 'done', tone: 'ok', text: '뒤에 있을 때 끝난 작업' })`); await settle();
  ok(JSON.stringify((await ev('Planner.bubbles()')).map((b) => `${b.text}${b.shown ? '*' : ''}`)) === '["뒤에 있을 때 끝난 작업*","뒤에 있을 때 뜬 인사"]', '안 보는 사이: 작업 완료가 인사보다 앞에 섬(돌아왔을 때 급한 것부터)');
  await ev(`document.hasFocus = window.__realFocus2; window.dispatchEvent(new Event('focus'))`); await settle();
  await ev(`Planner.say({ group: 'greet', tone: 'iris', text: '보고 있을 때 뜬 인사', ttl: 0 })`); await clearSays();
  await ev(`Planner.say({ group: 'greet', tone: 'iris', text: '보고 있을 때 뜬 인사', ttl: 600000 }); Planner.say({ group: 'done', tone: 'ok', text: '보고 있을 때 끝난 작업', ttl: 600000 })`); await settle();
  ok(JSON.stringify((await ev('Planner.bubbles()')).map((b) => `${b.text}${b.shown ? '*' : ''}`)) === '["보고 있을 때 뜬 인사*","보고 있을 때 끝난 작업"]', '보고 있을 때는 읽던 말풍선을 바꿔치지 않음(전과 같음)');
  await clearSays();
  ok((await ev(`(() => { try { Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, cfg: { plannerQuietUntil: null } }); return true; } catch { return false; } })()`)), '설정을 맞추라는 방송(cfg)은 받는 쪽이 없어도 오류 없이 넘어감');
  // ---- 일정 창(2026-11-23 사용자 요청): 줄에서 바로 눌리는 것은 체크 · 단계 접기뿐, 줄을 누르면 창이 떠서 보기 · 끝냄 · 대화 이어가기 · 고치기 · 삭제를 모두 거기서 ----
  {
    const D = '2026-11-29'; // 다른 검사에 끼지 않는 날
    const A = pl.store.apply([{ op: 'add', item: { title: '세션이 넣은 일', start: D, time: '14:00', timeEnd: '15:30', place: '본관 3층', who: '운영진', note: '첫 줄\n둘째 줄', folder: 'C:\\w\\a' } }], { by: 'session', via: 'cli', session: { id: 's-live', title: '살아 있는 대화', agent: 'claude' } }).items[0];
    const C = pl.store.apply([{ op: 'add', item: { title: '폴더 없는 일', start: D } }], U).items[0];
    const S = pl.store.apply([{ op: 'add', item: { title: '단계 있는 줄', start: D, end: '2026-11-30', steps: [{ title: '하나', day: D }] } }], U).items[0];
    const reload = async () => { await ev(`Planner.onMessage({ type: 'planner', rev: ${pl.store.rev}, proposals: ${pl.store.list('proposed').length} })`); await settle(); await page.waitForTimeout(150); };
    const stateOf = (id) => pl.store.list().find((x) => x.id === id);
    const rowOf = (id) => `.pl-list > .pl-r[data-open="${id}"]`;
    const openRow = async (id) => { await page.click(`${rowOf(id)} .tx`); await settle(); };
    const modal = () => ev(`(() => { const box = document.getElementById('pl-modal'); const d = box.querySelector('.pl-m'); if (box.hidden || !d) return null; const r = d.getBoundingClientRect();
      return { title: d.querySelector('.pl-m-ti')?.textContent ?? null, rows: [...d.querySelectorAll('.pl-m-row')].map((e) => e.textContent.trim()), tags: [...d.querySelectorAll('.pl-m-tags .pl-pill')].map((e) => e.textContent.trim()),
        btn: [...d.querySelectorAll('.pl-m-ft .pl-tb')].map((e) => e.textContent.trim() + (e.disabled ? '(잠김)' : '')), edit: !!d.querySelector('#pl-m-title'),
        center: Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 2 && r.top >= 0 && r.bottom <= innerHeight, err: (() => { const e = d.querySelector('#pl-m-err'); return e && !e.hidden ? e.textContent : null; })() }; })()`);
    await clearSays();
    await ev(`window.__live = ['s-live']; window.__calls.length = 0; Planner.open(${JSON.stringify(D)})`); await settle(); await page.waitForTimeout(200);
    ok((await ev(`document.querySelectorAll('.pl-list .hid, .pl-list [data-del], .pl-list [data-chat], .pl-list [data-session], .pl-list [data-edit], .pl-panel [data-folder]').length`)) === 0 && (await ev(`document.querySelectorAll('.pl-list > .pl-r[data-open]').length`)) === 3, '줄: 올리면 나오던 단추(대화 · 삭제) · 이름 두 번 클릭 고치기 · 연결 폴더 열기 없음 — 줄마다 누르면 창');
    await page.dblclick(`${rowOf(C.id)} .tx`); await settle();
    ok(!(await ev(`!!document.querySelector('.pl-list input')`)) && (await modal())?.title === '폴더 없는 일', '이름을 두 번 클릭해도 그 자리 입력칸이 생기지 않음(창이 뜰 뿐)');
    await ev('Planner.onEscape()'); await page.waitForTimeout(450);
    ok((await modal()) === null && !(await ev('Planner.editing()')), '평소에는 창이 없음');

    // 줄을 누르면 창: 그 일정의 설명
    await openRow(A.id);
    const m1 = await modal();
    ok(m1 && m1.title === '세션이 넣은 일' && m1.rows.join('|') === '11월 29일 일요일|14:00 ~ 15:30|본관 3층|운영진|첫 줄\n둘째 줄' && m1.center && !m1.edit && (await ev('Planner.editing()')), `줄을 누르면 일정 창: 이름 · 날짜 · 시각 · 장소 · 상대 · 메모, 화면 가운데 — ${JSON.stringify(m1 && m1.rows)}`);
    ok(m1.btn.join() === '대화 이어가기,고치기,삭제', `창의 단추: 대화 이어가기 · 고치기 · 삭제 — ${m1.btn.join()}`);
    await shot('12-item-modal');
    await page.click('#pl-modal .pl-m-hd .pl-ck'); await page.waitForTimeout(250);
    ok(stateOf(A.id).done === true && (await ev(`document.querySelector('#pl-modal .pl-m-ti').classList.contains('done')`)) && (await modal()).tags.includes('끝냄'), '창의 체크 = 끝냄(창은 그대로 · 「끝냄」 꼬리표)');
    await page.click('#pl-modal .pl-m-hd .pl-ck'); await page.waitForTimeout(250);
    ok(stateOf(A.id).done === false, '다시 누르면 끝냄 취소');
    await page.click('#pl-modal [data-m-chat]'); await settle();
    ok(JSON.stringify(await ev('window.__calls')) === '[["session","s-live"]]' && (await modal()) === null, '대화 이어가기: 이 일정을 넣은 대화로 가고 창은 닫힘');
    await ev(`window.__live = []; window.__calls.length = 0`); await reload();
    await openRow(A.id);
    ok((await modal()).btn[0] === '새 대화 열기', '넣은 대화가 없어졌으면 「새 대화 열기」');
    await page.click('#pl-modal [data-m-chat]'); await settle();
    ok(JSON.stringify(await ev('window.__calls')) === '[["chat","C:\\\\w\\\\a",""]]', '새 대화 열기: 연결 폴더에서(요청문은 비움 — 보내기는 직접)');

    // 닫기: Esc(한 단계만) · 바깥 누르기 · × / 열기: 이름에 초점 + Enter
    await openRow(C.id);
    ok((await modal()).btn.join() === '고치기,삭제' && (await modal()).rows.join('|') === '11월 29일 일요일', '대화도 폴더도 없으면 대화 단추 없음 · 없는 칸(시각 · 장소 · 메모)은 줄이 없음');
    const e1 = await ev('Planner.onEscape()'), e2 = await ev('Planner.onEscape()');
    ok(e1 === true && e2 === true && (await modal()) === null && (await ev(`!!document.querySelector('.pl-panel')`)) && !(await ev('Planner.editing()')), 'Esc = 창만 닫음(바로 뒤의 Esc 한 번도 삼킴 — 판은 그대로)');
    await page.waitForTimeout(450);
    await openRow(C.id); await page.waitForTimeout(450); await page.mouse.click(8, 8); await settle();
    ok((await modal()) === null && (await ev(`!!document.querySelector('.pl-panel')`)), '창 바깥(어두운 자리)을 누르면 닫힘 · 판은 그대로');
    await openRow(C.id); await page.click('#pl-modal [data-m-close]'); await settle();
    ok((await modal()) === null, '× 로 닫힘');
    await ev(`document.querySelector(${JSON.stringify(`${rowOf(C.id)} .tx`)}).focus()`); await page.keyboard.press('Enter'); await settle();
    ok((await modal())?.title === '폴더 없는 일' && (await ev('window.__keys.length')) === 0, '이름에 초점을 두고 Enter = 창 열기(본체로 키가 새지 않음)');

    // 고치기: 칸에서 바로(이름 · 기간 · 시각 · 장소 · 메모) → Enter 저장
    const rev0 = pl.store.rev;
    await page.click('#pl-modal [data-m-edit]'); await settle();
    ok((await ev(`(() => { const t = document.getElementById('pl-m-title'); return document.activeElement === t && t.value === '폴더 없는 일' && document.getElementById('pl-m-start').value === ${JSON.stringify(D)} && document.getElementById('pl-m-end').value === '' && document.getElementById('pl-m-time').value === ''; })()`)) && (await modal()).btn.join() === '저장,취소,말로 고치기', '고치기: 이름 칸에 초점 · 칸마다 지금 값 · 단추는 저장 · 취소 · 말로 고치기');
    await page.click('#pl-modal [data-m-save]'); await settle();
    ok(pl.store.rev === rev0 && (await modal()) && !(await modal()).edit, '바꾼 것이 없으면 보내지 않고 보기로 돌아감');
    await page.click('#pl-modal [data-m-edit]'); await settle();
    await page.fill('#pl-m-title', '  새   이름  '); await page.fill('#pl-m-end', '2026-11-30'); await page.fill('#pl-m-time', '09:30'); await page.fill('#pl-m-place', '과학실'); await page.fill('#pl-m-note', '준비물\n둘째 줄');
    await reload();
    ok((await ev(`document.getElementById('pl-m-title').value`)) === '  새   이름  ' && (await ev(`document.getElementById('pl-m-note').value`)) === '준비물\n둘째 줄', '고치는 중 달력이 다시 그려져도 적던 글은 그대로');
    await shot('12-item-edit');
    await page.press('#pl-m-title', 'Enter'); await page.waitForTimeout(350);
    const c1 = stateOf(C.id);
    ok(c1.title === '새 이름' && c1.start === D && c1.end === '2026-11-30' && c1.time === '09:30' && c1.place === '과학실' && c1.note === '준비물\n둘째 줄', `Enter = 저장: 이름(빈칸 정리) · 기간 · 시각 · 장소 · 메모 — ${JSON.stringify({ t: c1.title, e: c1.end, tm: c1.time })}`);
    ok((await modal()) === null && (await text(`${rowOf(C.id)} .pl-pill.span`))[0] === '1일차11/29~11/30' && (await text('.pl-say .pl-line p'))[0].startsWith('「새 이름」 일정을 고쳤어요.'), '저장하면 창이 닫히고 줄이 바뀜 · 말풍선');
    await page.click('.pl-say [data-act="0"]'); await page.waitForTimeout(300);
    ok(stateOf(C.id).title === '폴더 없는 일' && !stateOf(C.id).end && !stateOf(C.id).time && !stateOf(C.id).place, '말풍선의 「되돌리기」로 고치기 전으로');
    await clearSays();

    // 틀린 값: 창을 그대로 두고 사유를 적는다(적던 글을 지우지 않는다)
    await openRow(C.id); await page.click('#pl-modal [data-m-edit]'); await settle();
    const rev1 = pl.store.rev;
    await page.fill('#pl-m-end', '2026-11-20'); await page.fill('#pl-m-place', '적던 장소'); await page.click('#pl-modal [data-m-save]'); await settle();
    ok((await modal()).err === '끝나는 날이 시작하는 날보다 앞이에요.' && pl.store.rev === rev1 && (await ev(`document.getElementById('pl-m-place').value`)) === '적던 장소', '끝나는 날이 앞이면 보내지 않고 사유를 적음 · 적던 글 그대로');
    await page.fill('#pl-m-end', ''); await page.fill('#pl-m-title', '   '); await page.click('#pl-modal [data-m-save]'); await settle();
    ok((await modal()).err === '이름이 비어 있어요.' && pl.store.rev === rev1, '이름을 비우면 저장하지 않음');
    await page.fill('#pl-m-title', '폴더 없는 일'); await page.fill('#pl-m-time-end', '10:00'); await page.click('#pl-modal [data-m-save]'); await settle();
    ok((await modal()).err === '끝 시각만 있어요. 시작 시각도 적어 주세요.' && pl.store.rev === rev1, '끝 시각만 적으면 저장하지 않음');
    // 옛 데몬(이름만 받음)이 거절하면: 다시 켜라는 안내
    await page.fill('#pl-m-time-end', '');
    await ev(`window.__f = window.fetch; window.fetch = (u, o) => (String(u).includes('/api/planner/ops') ? Promise.resolve(new Response(JSON.stringify({ ok: false, code: 'panel-check-only', error: '옛 안내' }), { status: 400, headers: { 'content-type': 'application/json' } })) : window.__f(u, o))`);
    await page.click('#pl-modal [data-m-save]'); await page.waitForTimeout(250);
    ok(/IRIS 를 다시 켜면/.test((await modal()).err || '') && (await modal()).edit, '옛 IRIS(이름만 받음)가 거절하면 다시 켜라고 안내 · 창은 그대로');
    await ev(`window.fetch = window.__f`);
    // 고치는 중 Esc = 고치기 취소만(보기로), 한 번 더 = 창 닫기
    const x1 = await ev('Planner.onEscape()'); await page.waitForTimeout(450);
    ok(x1 === true && (await modal()) && !(await modal()).edit && pl.store.rev === rev1, '고치는 중 Esc = 고치기 취소만(저장 안 함 · 창은 보기로)');
    const x2 = await ev('Planner.onEscape()'); await page.waitForTimeout(450);
    ok(x2 === true && (await modal()) === null, '한 번 더 Esc = 창 닫기');

    // 꺾쇠가 든 이름 · 메모도 글자로만
    const evilName = '<img src=x onerror="window.__xss3=1">이름';
    await openRow(C.id); await page.click('#pl-modal [data-m-edit]'); await settle();
    await page.fill('#pl-m-title', evilName); await page.fill('#pl-m-note', '<b onmouseover="window.__xss3=1">메모</b>'); await page.click('#pl-modal [data-m-save]'); await page.waitForTimeout(350);
    await clearSays(); await openRow(C.id);
    ok(stateOf(C.id).title === evilName && (await modal()).title === evilName && (await ev(`document.querySelectorAll('#pl-modal img, #pl-modal b[onmouseover]').length`)) === 0 && !(await ev('window.__xss3')), '꺾쇠가 든 이름 · 메모는 창에서도 글자로만 보임');
    await page.click('#pl-modal [data-m-edit]'); await settle();
    ok((await ev(`document.getElementById('pl-m-title').value`)) === evilName && !(await ev('window.__xss3')), '그 이름을 다시 고칠 때 입력칸에도 글자 그대로');
    // 고치는 사이 플래너가 꺼지면 고치기를 접는다(저장 안 함) · 볼 수만 있을 때는 단추가 잠긴다
    await page.fill('#pl-m-title', '꺼지는 사이 적던 글'); cfg.plannerEnabled = false; await reload();
    const mOff = await modal();
    ok(mOff && !mOff.edit && stateOf(C.id).title === evilName && mOff.btn.join() === '고치기(잠김),삭제(잠김)' && (await ev(`document.querySelector('#pl-modal .pl-m-hd .pl-ck').disabled`)), `고치는 사이 플래너가 꺼지면 보기로 돌아감(저장 안 함) · 고치기 · 삭제 · 체크 잠김 — ${mOff && mOff.btn.join()}`);
    cfg.plannerEnabled = true; await reload();
    ok((await modal()).btn.join() === '고치기,삭제', '다시 켜면 단추가 풀림');

    // 삭제 → 휴지통 + 되돌리기
    await clearSays();
    await page.click('#pl-modal [data-m-del]'); await page.waitForTimeout(300);
    ok(stateOf(C.id).state === 'trash' && (await modal()) === null && !(await ev(`!!document.querySelector(${JSON.stringify(rowOf(C.id))})`)) && /일정을 지웠어요\.$/.test((await text('.pl-say .pl-line p'))[0].split('휴지통')[0].trim()), '삭제: 휴지통으로 · 창 닫힘 · 줄에서 사라짐 · 말풍선');
    await page.click('.pl-say [data-act="0"]'); await page.waitForTimeout(300);
    ok(stateOf(C.id).state === 'active' && (await ev(`!!document.querySelector(${JSON.stringify(rowOf(C.id))})`)), '말풍선의 「되돌리기」로 되살아남');
    await clearSays();

    // 단계 있는 일: 단계 줄을 눌러도 그 일정의 창 · 창에서 단계 체크 · 말로 고치기
    await page.click(`.pl-steps[data-open="${S.id}"] .pl-r.step .tx`); await settle();
    const mS = await modal();
    ok(mS && mS.title === '단계 있는 줄' && mS.rows[0] === '11월 29일 일요일 ~ 11월 30일 월요일2일 동안' && mS.tags.join('|') === '1일차11/29~11/30|마감까지 7일' && (await text('#pl-modal .pl-m-steps .pl-r.step .dd'))[0] === '11/29', `단계 줄을 눌러도 그 일정의 창: 기간 · 뱃지 · 남은 날 · 단계 — ${JSON.stringify(mS && [mS.rows[0], mS.tags])}`);
    await page.click('#pl-modal .pl-m-steps .pl-ck'); await page.waitForTimeout(250);
    ok(stateOf(S.id).steps[0].done === true && (await modal()) !== null, '창에서 단계 체크');
    await page.click('#pl-modal .pl-m-steps .pl-ck'); await page.waitForTimeout(250);
    await page.click('#pl-modal [data-m-edit]'); await settle(); await page.click('#pl-modal [data-m-talk]'); await settle();
    ok((await modal()) === null && (await ev(`!!document.querySelector('.pl-talk')`)) && (await ev(`document.getElementById('pl-in').value`)) === '「단계 있는 줄」 일정 ' && (await text('.pl-bub.ai')).pop() === '「단계 있는 줄」 일정을 어떻게 바꿀까요?', '말로 고치기: 창을 닫고 아이리스 대화를 엶 · 입력칸에 그 일정의 이름(보내기는 직접)');
    await ev(`document.getElementById('pl-in').value = ''`); await ev('Planner.onEscape()'); await page.waitForTimeout(450);

    // 반복하는 일: 날짜 칸 없음(말로) · 삭제는 먼저 묻는다
    await ev(`Planner.open('2026-12-01')`); await settle(); await page.waitForTimeout(200);
    await openRow(rep.id);
    ok((await modal()).rows[0] === '12월 1일 화요일반복하는 일', '반복하는 일의 창: 그날 + 「반복하는 일」');
    await page.click('#pl-modal [data-m-edit]'); await settle();
    ok(!(await ev(`!!document.getElementById('pl-m-start')`)) && /말로 고치기/.test((await text('#pl-modal .pl-m-hint'))[0] || '') && (await ev(`document.getElementById('pl-m-time').value`)) === '15:00', '반복하는 일의 고치기: 날짜 칸 없음(말로) · 시각 등은 칸에서');
    await ev('Planner.onEscape()'); await page.waitForTimeout(450);
    await page.click('#pl-modal [data-m-del]'); await page.waitForTimeout(250);
    ok(stateOf(rep.id).state === 'active' && (await modal()) === null && /반복하는 일이에요\. 전체를 지울까요\?/.test((await text('.pl-say .pl-line p'))[0] || '') && (await text('.pl-say .pl-tb')).join() === '전체 지우기,그대로 두기', '반복하는 일의 삭제: 바로 지우지 않고 먼저 물음');
    await page.click('.pl-say [data-act="1"]'); await page.waitForTimeout(200);
    ok(stateOf(rep.id).state === 'active' && !(await text('.pl-say')).length, '「그대로 두기」 = 아무 일도 없음');
    await openRow(rep.id); await page.click('#pl-modal [data-m-del]'); await page.waitForTimeout(200); await page.click('.pl-say [data-act="0"]'); await page.waitForTimeout(300);
    ok(stateOf(rep.id).state === 'trash', '「전체 지우기」 = 휴지통으로');
    await clearSays(); pl.store.apply([{ op: 'restore', id: rep.id }], U);
    // ---- 코덱스 독립 검토(2026-11-23 20:12)에서 나온 네 가지 — 고친 뒤 영구 검사 ----
    await ev(`Planner.open(${JSON.stringify(D)})`); await reload(); await clearSays();
    // (검토 1) 저장의 답을 기다리는 사이 그 창을 닫고 다른 일정의 창을 열었으면, 늦게 온 답이 새 창을 닫거나 그 창에 적지 않는다
    await openRow(C.id); await page.click('#pl-modal [data-m-edit]'); await settle(); await page.fill('#pl-m-place', '늦게 도착');
    await ev(`window.__f = window.fetch; window.fetch = (u, o) => (String(u).includes('/api/planner/ops') ? new Promise((res) => setTimeout(() => res(window.__f(u, o)), 600)) : window.__f(u, o))`);
    await page.click('#pl-modal [data-m-save]'); await page.waitForTimeout(80);
    await page.click('#pl-modal [data-m-close]'); await settle();
    await openRow(A.id); await page.click('#pl-modal [data-m-edit]'); await settle(); await page.fill('#pl-m-note', '다른 창에서 적던 글');
    await page.waitForTimeout(900); await ev(`window.fetch = window.__f`);
    const late1 = await modal();
    ok(stateOf(C.id).place === '늦게 도착' && late1 && late1.edit && late1.err === null && (await ev(`document.getElementById('pl-m-note').value`)) === '다른 창에서 적던 글' && (await text('.pl-say .pl-line p')).some((t) => t.includes('일정을 고쳤어요')), '늦게 온 저장의 답은 그사이 연 다른 일정의 창을 닫지도 고치지도 않음(결과는 말풍선으로)');
    await ev('Planner.onEscape()'); await page.waitForTimeout(450); await ev('Planner.onEscape()'); await page.waitForTimeout(450); await clearSays();
    // (검토 3) 고치는 사이 다른 세션이 바꾼 칸은 덮지 않는다 — 고치기를 시작한 때의 값과 견줘 내가 바꾼 칸만 보낸다
    await openRow(A.id); await page.click('#pl-modal [data-m-edit]'); await settle(); await page.fill('#pl-m-note', '내가 고친 메모');
    pl.store.apply([{ op: 'update', id: A.id, patch: { place: '다른 세션이 바꾼 장소' } }], { by: 'session', via: 'cli', session: { id: 's-other', title: '다른 대화', agent: 'claude' } }); await reload();
    await page.click('#pl-modal [data-m-save]'); await page.waitForTimeout(350);
    ok(stateOf(A.id).place === '다른 세션이 바꾼 장소' && stateOf(A.id).note === '내가 고친 메모' && (await modal()) === null, `고치는 사이 다른 세션이 바꾼 칸(장소)은 그대로 · 내가 바꾼 칸(메모)만 저장 — ${stateOf(A.id).place}`);
    await clearSays();
    // (검토 2) 단계가 새 기간 밖에 있으면 저장하지 않고 알린다(장부가 기간을 단계까지 다시 늘려 "고쳤어요"가 거짓말이 되지 않게)
    await openRow(S.id); await page.click('#pl-modal [data-m-edit]'); await settle();
    const revS = pl.store.rev;
    await page.fill('#pl-m-start', '2026-11-30'); await page.fill('#pl-m-end', ''); await page.click('#pl-modal [data-m-save]'); await settle();
    ok(/단계 「하나」\(11\/29\)가 그 기간 밖에 있어요/.test((await modal()).err || '') && pl.store.rev === revS && stateOf(S.id).start === D, `단계가 새 기간 밖이면 저장하지 않고 사유를 적음 — ${(await modal()).err}`);
    await ev('Planner.onEscape()'); await page.waitForTimeout(450);
    // (검토 4) 창이 떠 있는 동안 Tab 은 창 안에서만 돌고, 창 밖에 초점이 있을 때 난 키는 본체로 가지 않는다
    const stops = await ev(`(() => { const st = [...document.querySelectorAll('#pl-modal button:not([disabled]), #pl-modal input, #pl-modal textarea')]; st[st.length - 1].focus(); return st.length; })()`);
    await page.keyboard.press('Tab');
    const t1in = await ev(`document.getElementById('pl-modal').contains(document.activeElement) && document.activeElement === document.querySelector('#pl-modal button:not([disabled])')`);
    await page.keyboard.press('Shift+Tab');
    const t2in = await ev(`(() => { const st = [...document.querySelectorAll('#pl-modal button:not([disabled]), #pl-modal input, #pl-modal textarea')]; return document.activeElement === st[st.length - 1]; })()`);
    ok(stops >= 3 && t1in && t2in, `Tab 은 창 안에서만 돎(마지막 → 처음 · 처음 → 마지막, 멈출 곳 ${stops}개)`);
    await ev(`window.__keys.length = 0; document.getElementById('typing').focus()`);
    for (const k of ['1', 'y', 'Enter']) await page.keyboard.press(k);
    ok(JSON.stringify(await ev('window.__keys')) === '[]' && (await ev(`document.getElementById('typing').value`)) === '쓰던 글' && (await ev(`document.getElementById('pl-modal').contains(document.activeElement)`)) && (await modal()) !== null, '창 밖에 초점이 있어도 숫자 · y · Enter 가 본체로 새지 않고 초점이 창으로 돌아옴');
    await page.keyboard.press('Tab');
    ok((await ev(`document.getElementById('pl-modal').contains(document.activeElement)`)), '그 뒤의 Tab 도 창 안에 머묾');
    await ev('Planner.onEscape()'); await page.waitForTimeout(450);
    // ---- 코덱스 재검토(20:16)에서 남은 두 가지 ----
    // (재검토 1) 시작 날만 고치면 끝 날은 보내지 않는다 — 그사이 다른 세션이 바꾼 끝 날을 옛 값으로 되돌리지 않음
    const P = pl.store.apply([{ op: 'add', item: { title: '기간 있는 일', start: D, end: '2026-12-05' } }], U).items[0]; await reload();
    await openRow(P.id); await page.click('#pl-modal [data-m-edit]'); await settle(); await page.fill('#pl-m-start', '2026-11-28');
    pl.store.apply([{ op: 'update', id: P.id, patch: { end: '2026-12-20' } }], { by: 'session', via: 'cli', session: { id: 's-other', title: '다른 대화', agent: 'claude' } }); await reload();
    await page.click('#pl-modal [data-m-save]'); await page.waitForTimeout(350);
    ok(stateOf(P.id).start === '2026-11-28' && stateOf(P.id).end === '2026-12-20', `시작 날만 고치면 그사이 다른 세션이 바꾼 끝 날은 그대로 — ${stateOf(P.id).start}~${stateOf(P.id).end}`);
    await clearSays();
    // 하루짜리의 시작 날만 옮기면 하루짜리로 따라간다(끝 날이 생기지 않는다) · 달력은 그 날로 따라간다
    const Q = pl.store.apply([{ op: 'add', item: { title: '하루짜리', start: D } }], U).items[0]; await reload();
    await openRow(Q.id); await page.click('#pl-modal [data-m-edit]'); await settle(); await page.fill('#pl-m-start', '2026-11-30'); await page.click('#pl-modal [data-m-save]'); await page.waitForTimeout(350);
    ok(stateOf(Q.id).start === '2026-11-30' && !stateOf(Q.id).end && (await text('.pl-head strong'))[0] === '11월 30일 월요일' && (await ev(`!!document.querySelector(${JSON.stringify(rowOf(Q.id))})`)), '하루짜리의 날짜를 옮기면 하루짜리 그대로 · 달력이 그 날로 따라감');
    await clearSays(); await ev(`Planner.open(${JSON.stringify(D)})`); await reload();
    // (재검토 2) 초점: 줄을 눌러도 쓰던 입력칸의 초점을 뺏지 않고, 창을 닫으면(× · Esc · 저장) 거기로 돌아간다. 키보드로 열었으면 그 일정의 줄로
    await ev(`document.getElementById('typing').focus()`);
    await page.click(`${rowOf(A.id)} .tx`); await settle();
    const fIn = await ev(`document.getElementById('pl-modal').contains(document.activeElement)`);
    await ev('Planner.onEscape()'); await page.waitForTimeout(450);
    ok(fIn && (await ev(`document.activeElement === document.getElementById('typing')`)) && (await ev(`document.getElementById('typing').value`)) === '쓰던 글', '창이 뜨면 초점은 창 안 · Esc 로 닫으면 쓰던 입력칸으로 돌아감(쓰던 글 그대로)');
    await ev(`document.getElementById('typing').focus()`); await page.click(`${rowOf(A.id)} .tx`); await settle();
    await page.click('#pl-modal [data-m-edit]'); await settle(); await page.fill('#pl-m-who', '새 상대'); await page.press('#pl-m-who', 'Enter'); await page.waitForTimeout(400);
    ok(stateOf(A.id).who === '새 상대' && (await modal()) === null && (await ev(`document.activeElement === document.getElementById('typing')`)), '저장으로 닫혀도 쓰던 입력칸으로 돌아감');
    await clearSays();
    await ev(`document.querySelector(${JSON.stringify(`${rowOf(A.id)} .tx`)}).focus()`); await page.keyboard.press('Enter'); await settle();
    await reload();   // 창이 떠 있는 사이 달력이 다시 그려져 열 때의 줄 요소가 사라진다
    await ev('Planner.onEscape()'); await page.waitForTimeout(450);
    ok((await ev(`(() => { const a = document.activeElement; return !!a && a.matches('.pl-list .tx') && a.closest('[data-open]').dataset.open === ${JSON.stringify(A.id)}; })()`)), '키보드로 연 창을 닫으면 그 일정의 줄로 초점이 돌아감(달력이 다시 그려졌어도)');
    await ev(`document.activeElement.blur()`);
    // (마지막 확인 1) 키보드로 열어 저장으로 닫으면 줄로 돌아간 초점이, 곧이어 다시 그려진 달력에서도 그 일정의 줄에 남는다
    await ev(`document.querySelector(${JSON.stringify(`${rowOf(A.id)} .tx`)}).focus()`); await page.keyboard.press('Enter'); await settle();
    await page.click('#pl-modal [data-m-edit]'); await settle(); await page.fill('#pl-m-who', '또 다른 상대'); await page.press('#pl-m-who', 'Enter'); await page.waitForTimeout(500);
    ok(stateOf(A.id).who === '또 다른 상대' && (await ev(`(() => { const a = document.activeElement; return !!a && a.isConnected && a.matches('.pl-list .tx') && a.closest('[data-open]').dataset.open === ${JSON.stringify(A.id)}; })()`)), '키보드로 열어 저장하면 달력이 다시 그려진 뒤에도 그 일정의 줄에 초점이 남음');
    await clearSays();
    // (마지막 확인 2) 닫은 뒤 사용자가 다른 줄로 초점을 옮겼으면, 그 뒤 달력이 다시 그려져도 처음 일정으로 초점을 끌어오지 않는다
    await ev(`document.querySelector(${JSON.stringify(`${rowOf(A.id)} .tx`)}).focus()`); await page.keyboard.press('Enter'); await settle();
    await reload(); await ev('Planner.onEscape()'); await settle();
    await ev(`document.querySelector(${JSON.stringify(`${rowOf(S.id)} .tx`)}).focus()`); await reload(); await page.waitForTimeout(200);
    ok(!(await ev(`(() => { const a = document.activeElement; const row = a && a.closest ? a.closest('[data-open]') : null; return !!row && row.dataset.open === ${JSON.stringify(A.id)}; })()`)), '닫은 뒤 다른 줄로 초점을 옮겼으면 달력이 다시 그려져도 처음 일정으로 초점을 끌어오지 않음');
    await page.waitForTimeout(450);
    // 판을 닫으면 창도 닫힌다
    await ev(`Planner.open(${JSON.stringify(D)})`); await reload(); await openRow(A.id);
    await ev(`Planner.close()`); await settle();
    ok((await ev(`document.getElementById('pl-modal').hidden`)) && !(await ev('Planner.editing()')), '판을 닫으면 일정 창도 닫힘');
    await clearSays();
  }

  // ---- 오른쪽 칸으로 붙이기(2026-11-23 사용자 요청: "닫기 옆에 아이콘을 추가해서 누르면 오른쪽 패널로") ----
  {
    const box = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
    await ev(`localStorage.removeItem('iris.planner.dock'); localStorage.removeItem('iris.planner.dockW'); Planner.open('2026-11-23')`); await settle();
    const headBtns = await ev(`[...document.querySelectorAll('.pl-head button')].map((b) => b.getAttribute('aria-label'))`);
    ok(headBtns.join() === '이전 달,오늘로,다음 달,오른쪽 칸으로 붙이기,닫기' && !(await ev(`document.getElementById('pl').classList.contains('docked')`)), '판의 머리: 닫기 바로 앞에 「오른쪽 칸으로 붙이기」 단추 · 처음에는 작게 뜬 모양');
    const dock0 = await box('#dock');
    await page.click('[data-dock]'); await page.waitForTimeout(350);
    const pn = await box('.pl-panel'), dk = await box('#dock'), hx = await box('#pl-hex');
    const st = await ev(`({ docked: document.getElementById('pl').classList.contains('docked'), stage: document.getElementById('stage').classList.contains('pl-docked'), pad: getComputedStyle(document.getElementById('stage')).paddingRight, mem: localStorage.getItem('iris.planner.dock'), vw: innerWidth, vh: innerHeight })`);
    ok(st.docked && st.stage && pn.w === 420 && pn.r === st.vw && pn.t === 0 && pn.b === st.vh, `누르면 판이 무대 오른쪽에 위아래로 꽉 차게 붙음(${pn.w}×${pn.h})`);
    ok(st.pad === '420px' && dk.r <= pn.l && dk.w === dock0.w - 420, `대화 · 입력창은 칸 너비만큼 줄어듦(가려지지 않음 — 입력창 오른쪽 ${dk.r} ≤ 칸 왼쪽 ${pn.l})`);
    ok(hx.r < pn.l && pn.l - hx.r > 10 && pn.l - hx.r < 40, `육각 단추는 칸의 왼쪽으로 비켜남(틈 ${pn.l - hx.r})`);
    ok(st.mem === '1' && (await ev(`[...document.querySelectorAll('.pl-head button')].map((b) => b.getAttribute('aria-label')).join()`)) === '이전 달,오늘로,다음 달,작게 띄우기,닫기', '고른 모양을 이 컴퓨터에 기억 · 단추는 「작게 띄우기」로 바뀜');
    ok((await ev(`document.querySelectorAll('.pl-cal button').length`)) > 7 && (await text('.pl-list > .pl-r .tx')).length >= 1, '붙은 칸: 달 전체 + 그 날의 목록');
    await shot('14-docked');
    await ev(`Planner.say({ group: 'done', tone: 'ok', text: '「결과 보고서 초안」 작업이 끝났어요.', ttl: 600000 })`); await settle();
    const sb = await box('.pl-say');
    ok(sb.r < hx.l && sb.l >= 0, '붙은 칸에서도 말풍선은 육각 단추 왼쪽에(칸을 가리지 않음)');
    await clearSays();
    await page.click('#pl-in'); await settle();
    ok((await ev(`!!document.querySelector('.pl-talk')`)) && (await ev(`document.querySelectorAll('.pl-cal button').length`)) > 7, '길게 붙은 칸에서는 대화를 열어도 달 전체가 보임(작게 뜬 판은 그 주만)');
    await shot('15-docked-talk');
    await ev(`Planner.onEscape()`); await settle();
    // 왼쪽 가장자리를 끌어 너비 조절 · 두 번 클릭 = 기본 너비
    const gp = await box('#pl-grip');
    await page.mouse.move(gp.l + 4, 300); await page.mouse.down(); await page.mouse.move(gp.l + 4 - 60, 300, { steps: 3 }); await page.mouse.move(gp.l + 4 - 100, 300, { steps: 3 }); await page.mouse.up(); await settle();
    const pn2 = await box('.pl-panel');
    ok(pn2.w === 520 && (await ev(`localStorage.getItem('iris.planner.dockW')`)) === '520' && (await ev(`getComputedStyle(document.getElementById('stage')).paddingRight`)) === '520px', `칸의 왼쪽 가장자리를 끌면 너비가 바뀌고 기억됨(${pn2.w})`);
    await page.mouse.move(gp.l + 4 - 100, 300); await page.mouse.down(); await page.mouse.move(100, 300, { steps: 4 }); await page.mouse.up(); await settle();
    const pn3 = await box('.pl-panel'), dk3 = await box('#dock');
    ok(pn3.w === 720 && dk3.w >= 360, `너무 넓히지 못함(최대 ${pn3.w} · 대화 자리 ${dk3.w} 남김)`);
    await page.dblclick('#pl-grip'); await settle();
    ok((await box('.pl-panel')).w === 420, '가장자리를 두 번 클릭 = 기본 너비');
    // 닫았다 열어도 붙은 모양 그대로 · 닫으면 무대가 제 너비로
    await ev(`Planner.close()`); await settle();
    ok(!(await ev(`document.getElementById('stage').classList.contains('pl-docked')`)) && (await ev(`getComputedStyle(document.getElementById('stage')).paddingRight`)) === '0px' && (await box('#dock')).w === dock0.w, '칸을 닫으면 무대가 제 너비로 돌아옴');
    await page.click('#pl-hex'); await settle();
    ok((await ev(`document.getElementById('pl').classList.contains('docked')`)) && (await box('.pl-panel')).w === 420, '다시 열면 지난번 모양(오른쪽 칸) 그대로');
    ok((await ev(`Planner.onEscape()`)) === true && !(await ev(`document.querySelector('.pl-panel')`)) && !(await ev(`document.getElementById('stage').classList.contains('pl-docked')`)), 'Esc 로도 칸이 닫힘');
    // 좁은 창: 붙일 자리가 없으면 작게 띄우고 단추도 두지 않는다 — 넓어지면 다시 붙는다
    await ev(`Planner.open('2026-11-23')`); await settle();
    await page.setViewportSize({ width: 640, height: 860 }); await page.waitForTimeout(300);
    ok(!(await ev(`document.getElementById('pl').classList.contains('docked')`)) && !(await ev(`document.getElementById('stage').classList.contains('pl-docked')`)) && !(await ev(`document.querySelector('[data-dock]')`)) && (await box('.pl-panel')).r <= 640, '좁은 창에서는 붙이지 않고 작게 띄움(단추도 없음)');
    await page.setViewportSize({ width: 1100, height: 860 }); await page.waitForTimeout(300);
    ok((await ev(`document.getElementById('pl').classList.contains('docked')`)) && (await box('.pl-panel')).w === 420, '창이 넓어지면 다시 오른쪽 칸으로');
    await page.click('[data-dock]'); await settle();
    const pn4 = await box('.pl-panel');
    ok(!(await ev(`document.getElementById('pl').classList.contains('docked')`)) && pn4.w === 440 && pn4.h <= 580 && (await ev(`localStorage.getItem('iris.planner.dock')`)) === '0' && (await ev(`getComputedStyle(document.getElementById('stage')).paddingRight`)) === '0px', '「작게 띄우기」 = 전의 떠 있는 판으로 · 기억도 바뀜');
    await ev(`Planner.close()`); await settle();
  }

  // 준비(init) 전에 온 말: 버리지 않고 모아 두었다가 준비되면 말한다 — 새 인스턴스로 확인(끝에서, 화면에 판이 하나 더 생긴다)
  const early = await ev(`(async () => { const src = await (await fetch('/planner.js')).text(); const keep = window.Planner; new Function(src)(); const P2 = window.Planner; window.Planner = keep; const h = P2.say({ group: 'done', tone: 'ok', text: '준비 전에 온 말' }); const before = P2.bubbles().length; P2.init({}); return { handle: !!h && typeof h.close === 'function', before, after: P2.bubbles().map((b) => b.text) }; })()`);
  ok(early.handle && early.before === 0 && early.after.join() === '준비 전에 온 말', '준비 전에 온 말은 버리지 않고 준비되면 말함');

  ok(errors.length === 0, `화면 오류 없음${errors.length ? ' — ' + errors[0] : ''}`);
} catch (e) { fail++; console.log(`FAIL 예외: ${e?.stack || e}`); }
finally { await browser.close(); server.close(); try { fs.rmSync(base, { recursive: true, force: true }); } catch {} }
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
