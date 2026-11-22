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
  Planner.init({ openFolder: (p) => __calls.push(['folder', p]), chatIn: (p, t) => __calls.push(['chat', p, t]), openSession: (id) => __calls.push(['session', id]), openSettings: (p) => __calls.push(['settings', p]), drawerOpen: () => window.__drawer });
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
  ok((await text('.pl-r.step .no')).join('') === '123' && (await text('.pl-r.step.cur .tx'))[0] === '초안 검토' && (await text('.pl-r.step .dd')).join('|') === '20일|오늘|25일', '단계: 순서 번호 · 고른 날의 단계 · 하는 날');
  ok((await text('.pl-pill.span')).join('|') === '4일차20~25일|2일차22~27일' && (await text('.pl-pill.fold'))[0] === '1/3', '기간 뱃지: 며칠째 + 기간 · 단계 진행');
  ok((await text('.pl-list > .pl-r:first-child .pl-pill'))[0] === '20일' && (await ev(`document.querySelectorAll('.pl-r.end').length`)) === 0, '밀린 일은 하려던 날 · 오늘은 빨간 줄 없음');
  ok((await ev(`document.querySelectorAll('.pl-cal button').length`)) === 30 && (await ev(`document.querySelectorAll('.pl-cal i.blank').length`)) === 0, '달력: 11월 30일(1일 = 일요일)');
  const dots = await ev(`Object.fromEntries([...document.querySelectorAll('.pl-cal button')].map((b) => [b.dataset.day.slice(8), b.querySelectorAll('.pl-dots b').length + (b.querySelector('.pl-dots b.d') ? 'y' : '')]))`);
  ok(dots['23'] === '1' && dots['25'] === '2y' && dots['26'] === '2y' && dots['27'] === '2y' && dots['12'] === '0' && dots['30'] === '1', '달력 표시는 점뿐: 파란 점 · 그 옆 노란 점(기간의 마지막 날)');
  ok((await ev(`document.querySelector('.pl').innerHTML.includes('까지<')`)) === false && (await ev(`!!document.querySelector('.pl-talk')`)) === false, '「~까지」 표시 없음 · 대화는 닫혀 있음');
  ok((await ev(`document.querySelector('#pl-in').placeholder`)) === '아이리스에게 말하기', '입력칸: 아이리스에게 말하기');
  const panelBox = await ev(`(() => { const r = document.querySelector('.pl-panel').getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top }; })()`);
  ok(panelBox.w === 384 && panelBox.h <= 580 && panelBox.top >= 0, `판 크기(${panelBox.w}×${Math.round(panelBox.h)}) · 화면 밖으로 안 나감`);
  await shot('2-open');

  // ---- 3. 날짜 고르기 · 마감일 빨강 ----
  await page.click('.pl-cal button[data-day="2026-11-26"]'); await settle();
  ok((await text('.pl-head strong'))[0] === '11월 26일 목요일' && (await ev(`!document.querySelector('.pl-pill.now')`)), '날짜를 누르면 맨 위 날짜가 바뀜');
  const red = await ev(`(() => { const r = document.querySelector('.pl-r.end'); return r ? { title: r.querySelector('.tx').textContent, badge: r.querySelector('.pl-pill.span.end').textContent, color: getComputedStyle(r.querySelector('.tx')).color, bad: getComputedStyle(document.documentElement).getPropertyValue('--bad').trim() } : null; })()`);
  ok(red && red.title === '수업 나눔 주간' && red.badge === '3일차24~26일' && red.color === 'rgb(240, 120, 139)', '마감일(기간의 마지막 날): 이름과 뱃지가 빨간 글자');
  await shot('3-lastday');
  await page.click('.pl-cal button[data-day="2026-11-12"]'); await settle();
  ok((await text('.pl-empty'))[0] === '할 것이 없어요', '빈 날');
  await page.click('[data-today]'); await settle();

  // ---- 4. 끝냄 체크 · 접기 ----
  await page.click(`.pl-ck[data-step="${big.steps[1].id}"]`); await settle();
  ok((await text('.pl-pill.fold'))[0] === '2/3' && pl.store.get(big.id).steps[1].done === true, '단계 체크 → 진행 숫자 · 장부에 적힘');
  await page.click(`.pl-ck[data-step="${big.steps[2].id}"]`); await settle();
  ok((await ev(`document.querySelector('.pl-ck[data-ck="${big.id}"]:not([data-step])').classList.contains('on')`)) && pl.store.get(big.id).done === true, '단계를 다 끝내면 큰 일도 체크');
  await page.click(`.pl-ck[data-ck="${big.id}"]:not([data-step])`); await settle();
  ok((await text('.pl-pill.fold'))[0] === '0/3', '큰 일 체크를 풀면 단계도 풀림');
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
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '「가정통신문 정리」 작업이 끝났어요.', id: 's2', pick: (id) => __calls.push(['pick', id]) })`);
  await ev(`Planner.say({ group: 'attention', tone: 'warn', text: '「수행평가 채점 기준」이 확인을 기다려요.', id: 's3' })`);
  await ev(`Planner.say({ group: 'sched', tone: 'iris', text: '3시 협의회가 10분 남았어요.' })`); await settle();
  ok((await text('.pl-say .pl-line p')).length === 2 && JSON.stringify((await ev('Planner.bubbles()')).map((b) => `${b.group}${b.shown ? '*' : ''}`)) === '["done*","done*","sched","attention"]', '같은 종류는 줄로 쌓고, 다른 종류는 차례로(약속 직전 → 세션 확인)');
  for (let i = 0; i < 4; i++) await ev(`Planner.say({ group: 'done', tone: 'ok', text: '작업 ${i} 끝' })`);
  await settle();
  ok((await text('.pl-say .pl-line p')).length === 4 && (await text('.pl-say .pl-line p'))[3] === '작업 3 끝', '한 말풍선에 최대 4줄(오래된 것부터 빠짐)');
  const pd = await ev(`(() => { const e = new PointerEvent('pointerdown', { bubbles: true, cancelable: true }); document.querySelector('.pl-say .pl-line').dispatchEvent(e); return e.defaultPrevented; })()`);
  ok(pd && (await ev(`document.activeElement.id`)) === 'typing', '말풍선을 눌러도 초점을 뺏지 않음');
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '고를 것', id: 'sX', pick: (id) => __calls.push(['pick', id]) })`); await settle();
  await page.click('.pl-say .pl-line.pick'); await settle();
  ok(JSON.stringify((await ev('window.__calls')).filter((c) => c[0] === 'pick')) === '[["pick","sX"]]' && (await text('.pl-say .pl-line p')).length === 3, '줄을 누르면 그 세션으로 + 그 줄만 닫힘');
  await page.hover('.pl-say'); await page.click('.pl-say [data-line-x="0"]'); await settle();
  ok((await text('.pl-say .pl-line p')).length === 2 && (await ev('window.__calls')).filter((c) => c[0] === 'pick').length === 1, '× 는 그 줄만 닫음(세션으로 가지 않음)');
  // 줄을 하나 닫을 때마다 화면을 다시 그리므로, 매번 새로 찾아 누른다(초록 말풍선의 줄이 다 닫힐 때까지)
  await ev(`for (let i = 0; i < 9 && document.querySelector('.pl-say[data-tone="ok"] [data-line-x]'); i++) document.querySelector('.pl-say [data-line-x]').click()`); await settle();
  ok((await text('.pl-say .pl-line p'))[0] === '3시 협의회가 10분 남았어요.' && (await ev(`document.querySelector('.pl-say').dataset.tone`)) === 'iris', '앞의 말풍선이 닫히면 다음 차례(약속 직전이 먼저)');
  await ev(`document.querySelector('.pl-say [data-line-x]').click()`); await settle();
  ok((await text('.pl-say .pl-line p'))[0].includes('확인을 기다려요') && (await ev(`document.querySelector('.pl-say').dataset.tone`)) === 'warn', '그다음 세션 확인(노랑)');
  await ev(`document.querySelector('.pl-say [data-line-x]').click()`); await settle();
  ok((await ev(`!document.querySelector('.pl-say') && !document.querySelector('#pl-hex').classList.contains('speak')`)), '다 닫히면 단추만');
  await ev(`Planner.say({ group: 'done', tone: 'ok', text: '금방 사라질 말', ttl: 1500 })`); await settle();
  await page.hover('.pl-say'); await page.waitForTimeout(2200);
  ok((await ev(`!!document.querySelector('.pl-say')`)), '마우스를 올리면 사라지지 않음');
  await page.mouse.move(10, 10); await page.waitForTimeout(2200);
  ok((await ev(`!document.querySelector('.pl-say')`)), '마우스를 떼면 시간이 지나 사라짐');

  // 말풍선 폭 = 가장 긴 줄
  await ev(`Planner.say({ group: 'greet', tone: 'iris', text: '좋은 아침이에요. 오늘 할 것이 3개 있고, 결과 보고서 제출이 모레까지예요.', actions: [{ label: '오늘 보기', icon: 'today', main: true, run: () => __calls.push(['act']) }], ttl: 0 })`); await settle();
  const w = await ev(`(() => { const p = document.querySelector('.pl-say p'); const r = document.createRange(); r.selectNodeContents(p); let hi = 0, lo = 1e9, rows = new Set(); for (const c of r.getClientRects()) { if (!c.width) continue; hi = Math.max(hi, c.right); lo = Math.min(lo, c.left); rows.add(Math.round(c.top)); } const b = p.getBoundingClientRect(); return { rows: rows.size, slack: b.right - hi, say: document.querySelector('.pl-say').getBoundingClientRect().width, cut: p.scrollWidth > p.clientWidth + 1 }; })()`);
  ok(w.rows >= 2 && w.slack >= 0 && w.slack < 4 && w.say < 330 && !w.cut, `줄이 바뀌는 말풍선: 폭이 가장 긴 줄에 맞음(오른쪽 빈자리 ${w.slack.toFixed(1)}px · 폭 ${Math.round(w.say)}px · ${w.rows}줄) · 잘리지 않음`);
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
  await ev(`Planner.say({ group: 'greet', tone: 'iris', text: '계속 떠 있는 말', ttl: 0 }); for (let i = 0; i < 6; i++) Planner.say({ group: 'done', tone: 'ok', text: '끝남 ' + i });`); await settle();
  const qd = (await ev('Planner.bubbles()')).filter((b) => b.group === 'done');
  ok(qd.length === 4 && qd[0].text === '끝남 2' && qd.every((b) => !b.shown), '기다리는 같은 종류는 한 말풍선으로(최대 4줄, 오래된 것부터 빠짐)');
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
  ok((await text('.pl-say .pl-line p'))[0] === '오후 3시 「협의회」가 10분 남았어요.' && (await ev('Planner.bubbles()')).some((b) => b.text === '뒤에 있는 동안 끝난 작업'), '창이 뒤에 있는 동안에는 말풍선이 사라지지 않고 기다림');
  await ev(`document.querySelector('.pl-say [data-line-x]').click()`); await settle();
  ok((await text('.pl-say .pl-line p'))[0] === '뒤에 있는 동안 끝난 작업', '다음 차례의 말풍선도 뒤에 있는 동안 남아 있음');
  await ev(`document.hasFocus = window.__realFocus; window.dispatchEvent(new Event('focus'));`); await page.waitForTimeout(700);
  ok((await ev(`!document.querySelector('.pl-say')`)), '창으로 돌아오면 그때부터 시간을 세어 사라짐');
  await ev(`Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'sched', tone: 'iris', os: true, text: '보고 있을 때의 알림' } })`); await settle();
  ok((await ev('window.__osCalls.length')) === 1, '보고 있을 때는 윈도우 알림을 띄우지 않음');
  await ev(`document.querySelectorAll('.pl-say [data-line-x]').forEach((b) => b.click())`); await settle();
  await ev(`Planner.say({ group: 'attention', tone: 'warn', text: '남아 있는 말풍선', ttl: 0 }); Planner.say({ group: 'done', tone: 'ok', text: '예시 알림', force: true })`); await settle();
  ok((await text('.pl-say .pl-line p'))[0] === '예시 알림' && JSON.stringify((await ev('Planner.bubbles()')).map((b) => b.text)) === '["예시 알림","남아 있는 말풍선"]', '설정의 미리보기는 떠 있는 말풍선 뒤에서 기다리지 않음(떠 있던 것은 다음 차례로)');
  await ev(`document.querySelectorAll('.pl-say [data-line-x]').forEach((b) => b.click())`); await settle(); await ev(`document.querySelectorAll('.pl-say [data-line-x]').forEach((b) => b.click())`); await settle();
  pl.rules = new PlannerRules({ planner: pl, stateDir: base, now: () => new Date(2026, 10, 23, 9, 0, 0) });
  await ev(`Planner.onMessage({ type: 'planner', rev: 1, proposals: 0, say: { group: 'greet', tone: 'iris', text: '오늘 끝낸 일 1개, 남은 일 2개예요.', actions: [{ kind: 'move', count: 2, day: '2026-11-22' }, { kind: 'open', day: '2026-11-22', label: '오늘 보기' }] } })`); await settle();
  await page.click('.pl-say [data-act="0"]'); await page.waitForTimeout(400);
  ok((await text('.pl-thread .pl-bub.ai > p:not(.warn)')).pop() === '날짜가 바뀌어서 옮기지 않았어요. 달력에서 다시 확인해 주세요.', '어제 뜬 「내일로 옮기기」를 오늘 누르면 옮기지 않음(말풍선이 말하던 그날 것만)');
  await ev(`Planner.close()`); await settle();
  // 준비(init) 전에 온 말: 버리지 않고 모아 두었다가 준비되면 말한다 — 새 인스턴스로 확인(끝에서, 화면에 판이 하나 더 생긴다)
  const early = await ev(`(async () => { const src = await (await fetch('/planner.js')).text(); const keep = window.Planner; new Function(src)(); const P2 = window.Planner; window.Planner = keep; const h = P2.say({ group: 'done', tone: 'ok', text: '준비 전에 온 말' }); const before = P2.bubbles().length; P2.init({}); return { handle: !!h && typeof h.close === 'function', before, after: P2.bubbles().map((b) => b.text) }; })()`);
  ok(early.handle && early.before === 0 && early.after.join() === '준비 전에 온 말', '준비 전에 온 말은 버리지 않고 준비되면 말함');

  ok(errors.length === 0, `화면 오류 없음${errors.length ? ' — ' + errors[0] : ''}`);
} catch (e) { fail++; console.log(`FAIL 예외: ${e?.stack || e}`); }
finally { await browser.close(); server.close(); try { fs.rmSync(base, { recursive: true, force: true }); } catch {} }
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
