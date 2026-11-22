// 작업 완료 알림 검사(2026-11-22, 플래너 걸음 0) — app/notify.js 의 "언제 알리는가"를 시험으로 굳힌다.
// 플래너가 알림을 그리는 곳을 네모 알림에서 육각 단추의 말풍선으로 옮겨도(설계 조각 ⑦) 이 규칙은 하나도 바뀌면 안 된다.
// 겉모습에 기대는 곳은 아래 VIEW 한 군데뿐 — 그리는 곳을 바꾸면 VIEW 만 새 모양에 맞춘다(무엇이 왜 달라졌는지 함께 적는다).
//   npm run verify:notify      (playwright 가 없으면 SKIP · 진짜 데몬·세션 접촉 0 · 시계는 가짜)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const req = createRequire(import.meta.url);
let pw = null;
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req(c); break; } catch {} }
if (!pw) { console.log('SKIP: playwright 없음'); process.exit(0); }

// 알림이 그려지는 곳(겉모습) — 이 객체만 화면 구조를 안다.
const VIEW = {
  extraScripts: [],                 // 알림이 기대는 다른 화면 코드(없음)
  extraHtml: '',
  // 화면에 떠 있는 알림들: [{ title, sub, status }]
  list: `[...document.querySelectorAll('#toasts .toast:not(.out)')].map((el) => ({ title: el.querySelector('.toast-title').textContent, sub: el.querySelector('.toast-sub').textContent, status: [...el.classList].find((c) => c !== 'toast' && c !== 'in') || '' }))`,
  item: (i) => `document.querySelectorAll('#toasts .toast:not(.out)')[${i}]`,
  closeBtn: (i) => `document.querySelectorAll('#toasts .toast:not(.out)')[${i}].querySelector('.toast-x')`,
};

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body>
<input id="typing" value="쓰던 글">
${VIEW.extraHtml}
<script>
(() => { // 가짜 시계: 8초 뒤 사라짐 · 보조 3초 여유를 기다리지 않고 시험한다
  let now = 1700000000000, seq = 1; const timers = new Map();
  Date.now = () => now;
  window.setTimeout = (fn, ms = 0) => { const id = seq++; timers.set(id, { at: now + ms, fn }); return id; };
  window.clearTimeout = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { fn(); return 0; };
  window.__advance = (ms) => { const end = now + ms; for (;;) { let nx = null; for (const [id, t] of timers) if (t.at <= end && (!nx || t.at < nx.t.at)) nx = { id, t }; if (!nx) break; timers.delete(nx.id); now = nx.t.at; nx.t.fn(); } now = end; };
  window.__os = []; window.__picked = []; window.__cur = null; window.__on = true; window.__osOn = true; window.__focus = true; window.__hidden = false;
  window.Notification = function (title, o) { window.__os.push({ title, body: (o && o.body) || '', tag: (o && o.tag) || '' }); this.close = () => {}; };
  window.Notification.permission = 'granted';
  document.hasFocus = () => window.__focus;
  Object.defineProperty(document, 'hidden', { get: () => window.__hidden, configurable: true });
  Object.defineProperty(document, 'visibilityState', { get: () => (window.__hidden ? 'hidden' : 'visible'), configurable: true });
})();
</script>
${VIEW.extraScripts.map((s) => `<script src="/${s}"></script>`).join('\n')}
<script src="/notify.js"></script>
<script>Notify.init({ onPick: (id) => window.__picked.push(id), current: () => window.__cur, enabled: () => window.__on, osEnabled: () => window.__osOn });</script>
</body></html>`;
const server = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x').pathname;
  if (u === '/') { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return s.end(HARNESS); }
  const f = path.join(APP, decodeURIComponent(u.replace(/^\/app\//, '/')));
  if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await pw.chromium.launch();
const errors = [];
const SES = { a: { id: 'a', title: '결과 보고서 초안', cwd: 'C:\\x\\보고서', agent: 'claude', modelLabel: 'Opus' }, b: { id: 'b', title: '', cwd: 'C:\\x\\채점', agent: 'codex', model: 'gpt' }, c: { id: 'c', title: '가정통신문' } };

async function fresh() {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const ev = (code) => page.evaluate(code);
  return {
    page, ev,
    list: () => ev(VIEW.list),
    os: () => ev('window.__os'),
    set: (o) => ev(`Object.assign(window, ${JSON.stringify(o)})`),
    adv: (ms) => ev(`window.__advance(${ms})`),
    status: (id, status, done, subs = 0) => ev(`Notify.onStatus(${JSON.stringify({ id, status, ...(done ? { done: true } : {}) })}, ${JSON.stringify(SES[id])}, ${subs})`),
    subs: (id, alive, total) => ev(`Notify.onSubs(${JSON.stringify(id)}, ${alive}, ${total}, ${JSON.stringify(SES[id])})`),
  };
}

try {
  // 1. 요청을 끝냈을 때만 알린다
  { const t = await fresh();
    await t.status('a', 'busy'); await t.adv(134000); await t.status('a', 'idle', true);
    const l = await t.list();
    ok(l.length === 1 && l[0].title === '결과 보고서 초안', '끝나면 알림 한 개, 제목 = 세션 이름');
    ok(l[0].sub.includes('작업이 끝났습니다') && l[0].sub.includes('2분 14초 걸림') && l[0].sub.includes('Claude Opus') && l[0].status === 'idle', '아랫줄 = 상태 · 걸린 시간 · 조합');
    ok((await t.os()).length === 0, '창이 앞이면 윈도 알림 없음');
    await t.page.close(); }
  { const t = await fresh();
    await t.status('a', 'busy'); await t.status('a', 'idle', false);
    ok((await t.list()).length === 0, 'done 표시가 없으면(세션 시작 직후 첫 프롬프트) 알리지 않음');
    await t.status('b', 'busy'); await t.status('b', 'attention', true);
    const l = await t.list();
    ok(l.length === 1 && l[0].title === '채점' && l[0].sub.includes('확인이 필요합니다') && l[0].status === 'attention', '확인 필요도 알림 · 이름이 없으면 폴더 이름');
    await t.status('c', 'busy'); await t.status('c', 'exited', true);
    ok((await t.list())[1].sub.includes('세션이 종료됐습니다'), '종료도 알림');
    await t.page.close(); }

  // 2. 보고 있는 세션 · 창이 뒤일 때 · 설정
  { const t = await fresh();
    await t.set({ __cur: 'a' });
    await t.status('a', 'busy'); await t.status('a', 'idle', true);
    ok((await t.list()).length === 0, '보고 있는 세션이고 창이 앞이면 생략');
    await t.set({ __focus: false });
    await t.status('a', 'busy'); await t.status('a', 'idle', true);
    const os = await t.os();
    ok((await t.list()).length === 1 && os.length === 1 && os[0].title === '결과 보고서 초안' && os[0].tag === 'iris-a', '창이 뒤면 보고 있던 세션도 알림 + 윈도 알림');
    await t.set({ __osOn: false });
    await t.status('c', 'busy'); await t.status('c', 'idle', true);
    ok((await t.list()).length === 2 && (await t.os()).length === 1, '윈도 알림 설정을 끄면 화면 알림만');
    await t.set({ __focus: true, __hidden: true, __osOn: true });
    await t.status('b', 'busy'); await t.status('b', 'idle', true);
    ok((await t.os()).length === 2, '창이 숨어 있어도 윈도 알림');
    await t.page.close(); }
  { const t = await fresh();
    await t.set({ __on: false, __focus: false });
    await t.status('a', 'busy'); await t.status('a', 'idle', true);
    ok((await t.list()).length === 0 && (await t.os()).length === 0, '알림 설정을 끄면 화면도 윈도 알림도 없음');
    await t.ev('Notify.preview()');
    const l = await t.list();
    ok(l.length === 1 && l[0].title.includes('예시') && (await t.os()).length === 1, '미리보기는 설정이 꺼져 있어도 뜸(+ 윈도 알림)');
    await t.ev(`Notify.push({ title: '강제', sub: '', status: 'attention', force: true })`);
    ok((await t.list()).length === 2, 'force 알림은 설정과 무관');
    ok((await t.ev(`Notify.push({ title: '보통', sub: '' })`)) === null && (await t.list()).length === 2, '보통 push 는 설정이 꺼져 있으면 null');
    await t.page.close(); }

  // 3. 보조 작업이 살아 있으면 보류
  { const t = await fresh();
    await t.status('a', 'busy'); await t.adv(60000); await t.status('a', 'idle', true, 2);
    ok((await t.list()).length === 0, '살아 있는 보조가 있으면 보류');
    await t.subs('a', 1, 2); await t.adv(5000);
    ok((await t.list()).length === 0, '보조가 하나라도 살아 있으면 계속 보류');
    await t.subs('a', 0, 2); await t.adv(2900);
    ok((await t.list()).length === 0, '마지막 보조가 끝난 뒤 3초는 기다림');
    await t.adv(200);
    const l = await t.list();
    ok(l.length === 1 && l[0].sub.includes('보조 2개 포함') && l[0].sub.includes('1분 8초 걸림'), '3초 뒤에도 조용하면 "보조 N개 포함"으로 알림(걸린 시간은 처음부터)');
    await t.page.close(); }
  { const t = await fresh();
    await t.status('a', 'busy'); await t.adv(10000); await t.status('a', 'idle', true, 1);
    await t.subs('a', 0, 1); await t.adv(1000);
    await t.status('a', 'busy'); await t.adv(5000);
    ok((await t.list()).length === 0, '메인이 다시 일하면 보류를 지움');
    await t.adv(20000); await t.status('a', 'idle', true, 0);
    const l = await t.list();
    ok(l.length === 1 && !l[0].sub.includes('보조') && l[0].sub.includes('36초 걸림'), '진짜 끝날 때 원래 방식으로 한 번만(시작 시각은 이어 감)');
    await t.subs('a', 0, 1); await t.adv(5000);
    ok((await t.list()).length === 1, '보류가 없는 세션의 보조 변화는 알림을 만들지 않음');
    await t.page.close(); }

  // 4. 쌓임 · 사라짐 · 누르기 · 초점
  { const t = await fresh();
    for (let i = 0; i < 5; i++) await t.ev(`Notify.push({ id: 's${i}', title: '알림 ${i}', sub: '' })`);
    const l = await t.list();
    ok(l.length === 4 && l[0].title === '알림 1' && l[3].title === '알림 4', '최대 4개(가장 오래된 것부터 빠짐)');
    await t.adv(7900); ok((await t.list()).length === 4, '8초 전에는 그대로');
    await t.adv(200); ok((await t.list()).length === 0, '8초 뒤 사라짐');
    await t.page.close(); }
  { const t = await fresh();
    await t.ev(`Notify.push({ id: 'a', title: '하나', sub: '' })`);
    await t.ev(`${VIEW.item(0)}.dispatchEvent(new MouseEvent('mouseenter'))`);
    await t.adv(20000); ok((await t.list()).length === 1, '마우스를 올리면 사라지지 않음');
    await t.ev(`${VIEW.item(0)}.dispatchEvent(new MouseEvent('mouseleave'))`);
    await t.adv(7900); ok((await t.list()).length === 1, '마우스를 떼면 다시 8초');
    await t.adv(200); ok((await t.list()).length === 0, '뗀 뒤 8초에 사라짐');
    await t.page.close(); }
  { const t = await fresh();
    await t.ev(`document.getElementById('typing').focus()`);
    await t.ev(`Notify.push({ id: 'a', title: '하나', sub: '' }); Notify.push({ id: 'b', title: '둘', sub: '' })`);
    const prevented = await t.ev(`(() => { const e = new PointerEvent('pointerdown', { bubbles: true, cancelable: true }); ${VIEW.item(0)}.dispatchEvent(e); return e.defaultPrevented; })()`);
    ok(prevented && (await t.ev(`document.activeElement.id`)) === 'typing', '누르는 순간 초점을 뺏지 않음(입력 중인 글 유지)');
    await t.ev(`${VIEW.item(0)}.click()`);
    ok(JSON.stringify(await t.ev('window.__picked')) === '["a"]' && (await t.list()).length === 1, '누르면 그 세션으로 + 그 알림 닫힘');
    await t.ev(`${VIEW.closeBtn(0)}.click()`);
    ok(JSON.stringify(await t.ev('window.__picked')) === '["a"]' && (await t.list()).length === 0, '× 는 닫기만(세션으로 가지 않음)');
    await t.page.close(); }

  // 5. 모듈이 부탁한 알림
  { const t = await fresh();
    await t.ev(`Notify.external({ id: 'mod:x:1', title: '모듈 알림', sub: '아랫줄' })`);
    ok((await t.list())[0].title === '모듈 알림' && (await t.os()).length === 0, '모듈 알림: 화면에 뜸');
    await t.set({ __focus: false });
    await t.ev(`Notify.external({ id: 'mod:x:2', title: '둘째', sub: '' })`);
    ok((await t.os()).length === 1, '모듈 알림: 창이 뒤면 윈도 알림도');
    await t.page.close(); }

  // 6. 코덱스 검토(걸음 1)에서 나온 빠진 규칙
  { const t = await fresh(); // 보조가 끝났다가 다시 살아나면 3초를 처음부터 다시 센다
    await t.status('a', 'busy'); await t.status('a', 'idle', true, 1);
    await t.subs('a', 0, 1); await t.adv(1000);
    await t.subs('a', 1, 2); await t.adv(5000);
    ok((await t.list()).length === 0, '보조가 다시 살아나면 기다리던 3초를 취소');
    await t.subs('a', 0, 2); await t.adv(2900);
    ok((await t.list()).length === 0, '다시 끝난 뒤 새로 3초');
    await t.adv(200);
    ok((await t.list()).length === 1 && (await t.list())[0].sub.includes('보조 2개 포함'), '새 3초 뒤 알림');
    await t.page.close(); }
  { const t = await fresh(); // 보류하는 사이 보고 있던 세션이 되면(창이 앞) 알리지 않는다 — 띄우는 그때의 상태로 판단
    await t.status('a', 'busy'); await t.status('a', 'idle', true, 1);
    await t.set({ __cur: 'a' });
    await t.subs('a', 0, 1); await t.adv(3100);
    ok((await t.list()).length === 0, '보류가 풀릴 때 보고 있는 세션이면 생략');
    await t.page.close(); }
  { const t = await fresh(); // 윈도 알림: 권한 · 누르기
    await t.ev(`window.__made = []; window.__refocus = 0; window.irisHost = { refocus: () => { window.__refocus++; return Promise.resolve(); } };
      window.Notification = function (title, o) { window.__os.push({ title, body: (o && o.body) || '', tag: (o && o.tag) || '' }); window.__made.push(this); this.close = () => { this.closed = true; }; };
      window.Notification.permission = 'default'; window.__ask = 0;
      window.Notification.requestPermission = () => { window.__ask++; window.Notification.permission = window.__grant; return Promise.resolve(window.__grant); };`);
    await t.set({ __focus: false, __grant: 'denied' });
    await t.status('a', 'busy'); await t.status('a', 'idle', true);
    await t.page.waitForTimeout(50);
    ok((await t.ev('window.__ask')) === 1 && (await t.os()).length === 0 && (await t.list()).length === 1, '윈도 알림 권한을 거절하면 화면 알림만');
    await t.ev(`window.Notification.permission = 'default'`); await t.set({ __grant: 'granted' });
    await t.status('b', 'busy'); await t.status('b', 'idle', true);
    await t.page.waitForTimeout(50);
    ok((await t.os()).length === 1, '권한을 받으면 그때 윈도 알림');
    await t.ev(`window.__made[0].onclick()`);
    ok((await t.ev('window.__made[0].closed')) === true && (await t.ev('window.__refocus')) === 1 && JSON.stringify(await t.ev('window.__picked')) === '["b"]', '윈도 알림을 누르면 창을 앞으로 + 그 세션');
    await t.ev(`delete window.Notification`);
    await t.status('c', 'busy'); await t.status('c', 'dead', true);
    const l = await t.list();
    ok(l.length === 3 && l[2].sub.includes('세션이 종료됐습니다'), '윈도 알림을 못 쓰는 환경에서도 화면 알림은 뜸 · dead 도 종료로 알림');
    await t.page.close(); }
  { const t = await fresh(); // 글자는 글자로만
    await t.ev(`Notify.push({ id: 'x', title: '<img src=x onerror="window.__xss=1">제목', sub: '<b>굵게</b>' })`);
    const l = await t.list();
    ok(l[0].title === '<img src=x onerror="window.__xss=1">제목' && l[0].sub === '<b>굵게</b>' && (await t.ev('window.__xss')) === undefined && (await t.ev(`${VIEW.item(0)}.querySelector('img,b')`)) === null, '제목 · 아랫줄의 꺾쇠는 글자 그대로(태그로 그리지 않음)');
    await t.ev(`Notify.onStatus({ id: 'zz', status: 'idle', done: true }, null, 0)`);
    ok((await t.list())[1].title === 'zz', '세션 정보가 없으면 번호를 제목으로');
    await t.set({ __focus: true, __hidden: false });
    await t.ev(`Object.defineProperty(document, 'visibilityState', { get: () => 'prerender', configurable: true })`);
    await t.set({ __cur: 'a' });
    await t.status('a', 'busy'); await t.status('a', 'idle', true);
    ok((await t.list()).length === 3, '창이 보이지 않는 상태(visibilityState)면 보고 있던 세션도 알림');
    await t.page.close(); }

  ok(errors.length === 0, `화면 오류 없음${errors.length ? ' — ' + errors[0] : ''}`);
} finally { await browser.close(); server.close(); }
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
