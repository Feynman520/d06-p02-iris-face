// 안내 창 검사(2026-11-24 새 모양 = 시안 A 「가운데 카드」) — app/dialog.js 의 알림 · 확인 · 실패 · 말풍선 알림과 종료 흐름의 화면.
//   1부: 작은 시험 쪽에 dialog.js 만 띄워 구조 · 키(Enter · Esc · Tab) · 초점 되돌리기 · 차례 · 글자 그대로 넣기(HTML 아님)를 본다(데몬 접촉 0).
//   2부: 시험 데몬(3459 · 임시 상태 폴더)의 실제 화면에서 ⏻ 전부 종료 → 묻는 창 → 「종료하는 중」 → 결과까지 본다(실 데몬 3458 무접촉).
//   npm run verify:dialog      (playwright 가 없으면 SKIP)
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

// ---- 0. 소스: 화면에 개발자 말을 싣지 않는다 · 옛 창 + 새 화면 조합을 막는 표시 ----
{
  const main = read('main.js'), pre = read('electron/preload.cjs'), mainCjs = read('electron/main.cjs');
  const calls = ['main.js', 'settings.js', 'tools.js', 'ontology.js', 'voice.js', 'handoff.js'].map(read).join('\n');
  ok(!/PID \$\{s\.pid\} 트리/.test(main) && !/로컬 MCP 를 끝내고 IRIS 를 종료할까요/.test(main), '0 묻는 창에 PID · 「로컬 MCP」를 적지 않음');
  ok(!/Dialog\.alert\((e|err)\.message\)/.test(calls), '0 원래 오류 글만 던지는 알림(Dialog.alert(e.message))이 남아 있지 않음');
  ok(/closeMinimize: true/.test(pre) && /window\.irisHost\?\.closeMinimize \? '창만 내리기'/.test(main) && /a\.minimize/.test(mainCjs), '0 「창만 내리기」: 창(preload · main)이 그 답을 알아들을 때만 화면이 단추를 내놓음');
  ok(/renderQuitting\(\)/.test(main) && /id="quitting-steps"/.test(main), '0 「종료하는 중」은 세션 목록이 바뀔 때마다 단계를 다시 그림');
}

const req = createRequire(import.meta.url);
let pw = null;
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req(c); break; } catch {} }
if (!pw) { console.log('SKIP: playwright 없음'); console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0); }

// ---- 1부: dialog.js 만 ----
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body>
<textarea id="composer-text"></textarea><script src="/dialog.js"></script></body></html>`;
const server = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x').pathname;
  if (u === '/') { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return s.end(HARNESS); }
  const f = path.join(APP, decodeURIComponent(u));
  if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await pw.chromium.launch();
try {
  const p = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/`);
  const ev = (f, a) => p.evaluate(f, a);
  /** 창을 띄우고(기다리지 않음) 답은 window.__r 에 받는다 */
  const open = (code) => ev((c) => { window.__r = '(대기)'; (0, eval)(c).then((v) => { window.__r = v; }); }, code);
  const snap = () => ev(() => {
    const d = document.querySelector('#dlg'); if (!d || d.hidden) return null;
    const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
    const box = d.querySelector('.dlg-box'), r = box.getBoundingClientRect();
    const q = (s) => d.querySelector(s);
    return { kind: box.dataset.kind, role: box.getAttribute('role'), head: vis(q('.dlg-head')), title: q('#dlg-title').textContent, msg: vis(q('#dlg-msg')) ? q('#dlg-msg').textContent : null,
      tag: vis(q('#dlg-tag')) ? q('#dlg-tag').textContent : null, ledger: vis(q('#dlg-ledger')) ? [...q('#dlg-ledger').children].map((x) => `${x.className}:${x.querySelector('dt').textContent}=${x.querySelector('dd').textContent}`) : null,
      detail: vis(q('#dlg-detail')) ? { open: q('#dlg-detail').open, text: q('#dlg-detail pre').textContent } : null,
      btns: ['#dlg-extra', '#dlg-cancel', '#dlg-ok'].filter((s) => vis(q(s))).map((s) => q(s).textContent), okDanger: q('#dlg-ok').classList.contains('danger'), keys: q('#dlg-keys').textContent.replace(/\s+/g, ' ').trim(),
      focus: document.activeElement && document.activeElement.id, icon: !!q('#dlg-ico svg'), w: r.width, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, imgs: d.querySelectorAll('img').length };
  });
  const result = async () => { await sleep(40); return ev(() => window.__r); };
  const closed = () => ev(() => document.querySelector('#dlg').hidden);

  // 1. 알림: 한 줄 글 = 제목, 단추 하나(닫기)
  await ev(() => document.querySelector('#composer-text').focus());
  await open(`Dialog.alert('첫 메시지를 보낸 뒤에 바꿀 수 있습니다.')`);
  let s = await snap();
  ok(s && s.head && s.title === '첫 메시지를 보낸 뒤에 바꿀 수 있습니다.' && s.msg === null && s.btns.join('|') === '닫기' && s.kind === 'info' && s.icon && s.focus === 'dlg-ok', `1 알림: 한 줄 글이 제목 · 단추는 「닫기」 하나 · 초점은 그 단추 — ${JSON.stringify(s && { t: s.title, b: s.btns, f: s.focus })}`);
  ok(s.keys === 'Enter 닫기' && s.w >= 380 && s.w <= 460 && s.inView, `1 키 안내 「Enter 닫기」 · 폭 380~460(${Math.round(s.w)}) · 화면 안`);
  await p.keyboard.press('Enter');
  ok((await result()) === true && (await closed()) && (await ev(() => document.activeElement.id)) === 'composer-text', '1 Enter = 닫힘 · 초점이 입력창으로 돌아옴');

  // 2. 여러 줄 글: 첫 줄이 제목, 나머지가 설명 · 첫 줄이 길면 제목 없이 글만
  await open(`Dialog.alert('음성 입력을 쓸 수 없습니다\\n파이썬이 없습니다.\\n설치 뒤 다시 켜 주세요.')`);
  s = await snap();
  ok(s.title === '음성 입력을 쓸 수 없습니다' && s.msg === '파이썬이 없습니다.\n설치 뒤 다시 켜 주세요.', '2 여러 줄 글: 첫 줄 = 제목 · 나머지 = 설명');
  await p.keyboard.press('Escape'); ok((await result()) === true, '2 알림의 Esc = 닫힘(true)');
  const LONG = '가'.repeat(70);
  await open(`Dialog.alert(${JSON.stringify(LONG)})`);
  s = await snap();
  ok(!s.head && s.msg === LONG && s.inView, '2 첫 줄이 60자를 넘으면 제목 없이 글만(화면 안)');
  await p.keyboard.press('Enter'); await result();

  // 3. 묻는 창: 제목 · 이름표 · 닫히는 것 / 남는 것 · 붉은 단추
  const ASK = `Dialog.confirm('열려 있는 대화 3개가 함께 닫힙니다.', { title: 'IRIS를 종료할까요?', icon: 'power', danger: true, okLabel: '전부 종료', tag: '연구회 보고서', ledger: [['end', '닫히는 것', '대화 3개, 대화가 쓰던 도구'], ['keep', '남는 것', '대화 기록']] })`;
  await open(ASK);
  s = await snap();
  ok(s.title === 'IRIS를 종료할까요?' && s.msg === '열려 있는 대화 3개가 함께 닫힙니다.' && s.tag === '연구회 보고서' && s.kind === 'danger' && s.role === 'dialog' && s.okDanger, '3 묻는 창: 제목 · 설명 · 이름표 · 위험 종류 + 붉은 단추');
  ok(JSON.stringify(s.ledger) === JSON.stringify(['end:닫히는 것=대화 3개, 대화가 쓰던 도구', 'keep:남는 것=대화 기록']), `3 「닫히는 것 / 남는 것」 두 줄 — ${JSON.stringify(s.ledger)}`);
  ok(s.btns.join('|') === '취소|전부 종료' && s.keys === 'Enter 전부 종료 Esc 취소' && s.focus === 'dlg-ok', `3 단추 = 취소 · 전부 종료 · 키 안내 — ${s.keys}`);
  const colors = await ev(() => { const probe = (v) => { const i = document.createElement('i'); i.style.color = v; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; }; const cs = getComputedStyle(document.documentElement); const okb = document.querySelector('#dlg-ok'); return { bg: getComputedStyle(okb).backgroundColor, bad: probe(cs.getPropertyValue('--bad')), dt: getComputedStyle(document.querySelector('#dlg-ledger .end dt')).color, keep: getComputedStyle(document.querySelector('#dlg-ledger .keep dt')).color, okc: probe(cs.getPropertyValue('--ok')) }; });
  ok(colors.bg === colors.bad && colors.dt === colors.bad && colors.keep === colors.okc, `3 붉은 단추 바탕 = 위험 색 · 「닫히는 것」 = 위험 색 · 「남는 것」 = 초록 — ${JSON.stringify(colors)}`);
  await p.keyboard.press('Escape'); ok((await result()) === false && (await closed()), '3 Esc = 취소(false)');
  await open(ASK); await p.keyboard.press('Enter'); ok((await result()) === true, '3 Enter = 주 단추(true)');
  await open(ASK); await p.keyboard.press('Tab');
  ok((await ev(() => document.activeElement.id)) === 'dlg-cancel', '3 Tab = 취소 단추로');
  await p.keyboard.press('Enter'); ok((await result()) === false, '3 취소에 초점을 두고 Enter = 취소(false) — 옛 창은 이때도 실행했다');
  await open(ASK); await p.mouse.click(8, 8); ok((await result()) === false, '3 창 바깥을 누르면 취소');
  await open(ASK); await p.click('#dlg-ok'); ok((await result()) === true, '3 주 단추를 누르면 true');

  // 4. 세 번째 단추(창만 내리기)
  const EXTRA = `Dialog.confirm('설명', { title: 'IRIS를 종료할까요?', okLabel: '전부 종료', extra: '창만 내리기' })`;
  await open(EXTRA);
  s = await snap();
  ok(s.btns.join('|') === '창만 내리기|취소|전부 종료' && s.keys === '' && s.kind === 'ask' && !s.okDanger, `4 세 번째 단추: 창만 내리기 · 취소 · 전부 종료(키 안내는 비움) — ${s.btns.join('|')}`);
  const ring = []; for (let i = 0; i < 3; i++) { await p.keyboard.press('Tab'); ring.push(await ev(() => document.activeElement.id)); }
  ok(ring.join('>') === 'dlg-extra>dlg-cancel>dlg-ok', `4 Tab 은 세 단추를 돈다 — ${ring.join('>')}`);
  await p.click('#dlg-extra'); ok((await result()) === 'extra', "4 세 번째 단추 = 'extra'");
  await open(EXTRA); await p.keyboard.press('Tab'); await p.keyboard.press('Enter'); ok((await result()) === 'extra', "4 세 번째 단추에 초점을 두고 Enter = 'extra'");

  // 5. 실패 알림: 제목 + 설명 + 접힌 「자세히」 · 다시 시도
  await open(`Dialog.error({ title: '모듈을 설치하지 못했습니다', message: '인터넷 연결을 확인해 주세요.', detail: 'HTTP 502' })`);
  s = await snap();
  ok(s.kind === 'error' && s.role === 'alertdialog' && s.title === '모듈을 설치하지 못했습니다' && s.msg === '인터넷 연결을 확인해 주세요.' && s.detail && s.detail.open === false && s.detail.text === 'HTTP 502' && s.btns.join('|') === '닫기', `5 실패 알림: 제목 · 설명 · 접힌 「자세히」(원래 오류 글) · 「닫기」 — ${JSON.stringify(s && s.detail)}`);
  await p.keyboard.press('Enter'); ok((await result()) === false, '5 다시 시도가 없는 실패 알림은 false 로 닫힘');
  const RETRY = `Dialog.error({ title: '새 판을 확인하지 못했습니다', detail: 'x', retryLabel: '다시 시도' })`;
  await open(RETRY); s = await snap();
  ok(s.btns.join('|') === '닫기|다시 시도' && s.msg === null, '5 다시 시도가 있으면 단추 둘(닫기 · 다시 시도) · 설명이 없으면 그 자리를 비움');
  await p.keyboard.press('Enter'); ok((await result()) === true, '5 다시 시도 = true');
  await open(RETRY); await p.keyboard.press('Escape'); ok((await result()) === false, '5 닫기(Esc) = false');

  // 6. 글은 글자 그대로(HTML 로 읽지 않는다) · html 은 우리 코드가 만든 것만
  const EVIL = '<img src=x onerror="window.__xss=1">';
  await open(`Dialog.confirm(${JSON.stringify(EVIL + '\n' + EVIL)}, { tag: ${JSON.stringify(EVIL)}, ledger: [['end', ${JSON.stringify(EVIL)}, ${JSON.stringify(EVIL)}]], detail: ${JSON.stringify(EVIL)} })`);
  s = await snap(); await sleep(60);
  ok(s.imgs === 0 && s.title === EVIL && s.tag === EVIL && (await ev(() => window.__xss)) === undefined, '6 제목 · 설명 · 이름표 · 표 · 자세히 모두 글자 그대로(그림 0 · 스크립트 실행 0)');
  await p.keyboard.press('Escape'); await result();
  await open(`Dialog.info({ title: '정보', html: '<b id="bb">굵게</b>' })`);
  ok((await ev(() => !!document.querySelector('#dlg-msg #bb'))) && (await snap()).btns.join('|') === '닫기', '6 정보 창의 html 은 그대로 그림 · 「닫기」');
  await p.keyboard.press('Enter'); await result();

  // 7. 여러 개가 겹치면 차례로
  await ev(() => { window.__seq = []; Dialog.alert('하나').then(() => window.__seq.push(1)); Dialog.alert('둘').then(() => window.__seq.push(2)); });
  await sleep(40); ok((await snap()).title === '하나', '7 겹치면 먼저 부른 것부터');
  await p.keyboard.press('Enter'); await sleep(60); ok((await snap()).title === '둘', '7 닫으면 다음 것이 뜸');
  await p.keyboard.press('Enter'); await sleep(60); ok(JSON.stringify(await ev(() => window.__seq)) === '[1,2]' && (await closed()), '7 차례대로 끝남');

  // 8. 막지 않는 알림: 말풍선이 있으면 말풍선으로(창 0) · 없으면 알림 창으로
  await open(`Dialog.notice('50MB를 넘는 파일은 첨부할 수 없습니다.', { sub: '수업영상.mp4' })`);
  s = await snap();
  ok(s && s.title === '50MB를 넘는 파일은 첨부할 수 없습니다.' && s.msg === '수업영상.mp4', '8 말풍선을 쓸 수 없으면 알림 창으로(글 + 덧붙임)');
  await p.keyboard.press('Enter'); await result();
  await ev(() => { window.__said = []; window.Planner = { say: (b) => { window.__said.push(b); return { close() {} }; } }; });
  await open(`Dialog.notice('50MB를 넘는 파일은 첨부할 수 없습니다.', { sub: '수업영상.mp4' })`);
  const said = await ev(() => window.__said);
  ok((await result()) === true && (await closed()) && said.length === 1 && said[0].text === '50MB를 넘는 파일은 첨부할 수 없습니다.' && said[0].sub === '수업영상.mp4' && said[0].tone === 'warn' && said[0].group === 'info' && !said[0].force, `8 말풍선이 있으면 창을 띄우지 않고 말풍선으로(주의 색 · 떠 있는 말을 밀어내지 않음) — ${JSON.stringify(said[0])}`);
  await ev(() => { delete window.Planner; });

  // 9. window.alert 봉인 · 밝은 테마의 붉은 단추 글자 · 좁은 창
  await ev(() => { window.alert('옛 알림'); }); await sleep(40);
  ok((await snap()).title === '옛 알림', '9 window.alert 도 이 창으로 뜸(창 초점을 잃지 않게)');
  await p.keyboard.press('Enter'); await sleep(40);
  await ev(() => { const r = document.documentElement; r.dataset.irisTheme = 'mist'; for (const [k, v] of Object.entries({ '--base': '#eef2f6', '--overlay': '#cdd7e2', '--raised': '#d8e0e9', '--ink': '#1c2430', '--ink-2': '#4f5c6d', '--iris': '#3b74c9', '--bad': '#c8433f', '--line-2': 'rgba(20,40,70,.18)' })) r.style.setProperty(k, v); });
  await open(ASK);
  const light = await ev(() => { const b = document.querySelector('#dlg-ok'), box = document.querySelector('.dlg-box'); const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const k = c.startsWith('color(') ? 1 : 255; /* color-mix 의 결과는 color(srgb 0~1 …) 꼴로 나온다 */ return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / k; }; return { btn: getComputedStyle(b).color, boxLum: lum(getComputedStyle(box).backgroundColor), inkLum: lum(getComputedStyle(document.querySelector('#dlg-title')).color) }; });
  ok(light.btn === 'rgb(255, 255, 255)' && light.boxLum > 0.9 && light.inkLum < 0.2, `9 밝은 테마: 붉은 단추의 글자는 흰색 · 창 바탕은 밝고 제목은 어두움 — ${JSON.stringify(light)}`);
  await p.keyboard.press('Escape'); await result();
  await p.setViewportSize({ width: 360, height: 640 });
  await open(ASK); s = await snap();
  ok(s.inView && s.w <= 360 - 48 + 1, `9 좁은 창(360)에서도 화면 안(폭 ${Math.round(s.w)})`);
  await p.keyboard.press('Escape'); await result();
  ok(errs.length === 0, `1부 화면 오류 0${errs.length ? ' — ' + errs.join(' | ') : ''}`);
  await p.close();

  // ---- 2부: 시험 데몬의 실제 화면에서 ⏻ 전부 종료 ----
  const PORT = 3459, BASE = `http://127.0.0.1:${PORT}`;
  const health = async () => { try { return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
  if (await health()) { ok(false, `2부 시험 포트 ${PORT} 를 다른 검사가 쓰는 중 — 그 검사가 끝난 뒤 다시 돌린다`); }
  else {
    const state = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-dialog-'));
    const mods = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-dialog-mods-'));
    const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
      env: { ...process.env, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' } });
    try {
      let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); up = await health(); }
      ok(up, `2부 시험 데몬 ${PORT} 기동(pid ${d.pid})`);
      if (up) {
        const q = await browser.newPage({ viewport: { width: 1280, height: 860 } });
        const qerrs = []; q.on('pageerror', (e) => qerrs.push(e.message));
        await q.goto(`${BASE}/`); await sleep(2000);
        const dlg = () => q.evaluate(() => { const e = document.querySelector('#dlg'); if (!e || e.hidden) return null; const v = (x) => !!x && !x.hidden; return { title: e.querySelector('#dlg-title').textContent, msg: e.querySelector('#dlg-msg').textContent, ledger: v(e.querySelector('#dlg-ledger')), btns: ['#dlg-extra', '#dlg-cancel', '#dlg-ok'].filter((s) => v(e.querySelector(s))).map((s) => e.querySelector(s).textContent), danger: e.querySelector('#dlg-ok').classList.contains('danger') }; });
        await q.evaluate(() => document.querySelector('#btn-shutdown').click()); await sleep(200);
        let a = await dlg();
        ok(a && a.title === 'IRIS를 종료할까요?' && a.msg === '열려 있는 대화가 없습니다.' && !a.ledger && a.btns.join('|') === '취소|전부 종료' && !a.danger, `2부 ⏻: 묻는 말이 제목 · 대화가 없으면 표 없이 · 붉은 단추 아님 · 브라우저에서는 「창만 내리기」 없음 — ${JSON.stringify(a)}`);
        await q.keyboard.press('Escape'); await sleep(300);
        ok((await dlg()) === null && (await health()) && (await q.evaluate(() => !document.querySelector('#quitting'))), '2부 취소(Esc): 창이 닫히고 데몬은 그대로 · 「종료하는 중」 안 뜸');
        await q.evaluate(() => {
          window.__q = [];
          new MutationObserver(() => { const t = document.querySelector('#quitting-title'); if (!t) return; const st = document.querySelector('#quitting-steps');
            const row = `${t.textContent}|${[...st.children].map((l) => l.className || '-').join(',')}|${st.hidden ? '글' : '단계'}|${document.querySelector('#quitting-msg').textContent}`;
            if (window.__q.at(-1) !== row) window.__q.push(row); }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
          document.querySelector('#btn-shutdown').click();
        });
        await sleep(200); await q.keyboard.press('Enter');
        let gone = false; for (let i = 0; i < 100 && !gone; i++) { await sleep(250); gone = !(await health()); }
        await sleep(600);
        const seen = await q.evaluate(() => window.__q);
        ok(gone, '2부 전부 종료(Enter): 시험 데몬이 내려감');
        ok(seen.length >= 2 && seen[0] === '종료하는 중입니다|done,now|단계|끝나면 창이 저절로 닫힙니다.', `2부 「종료하는 중」: 제목 · 두 단계(대화가 없으면 첫 단계는 끝남 · 둘째가 도는 중) — ${seen[0]}`);
        ok(seen.at(-1) === 'IRIS 종료|done,now|글|IRIS를 종료했습니다. 이 탭을 닫아도 됩니다.', `2부 끝나면 결과 글로 바뀜(브라우저 모드) — ${seen.at(-1)}`);
        ok(await q.evaluate(() => { const e = document.querySelector('#quitting'); return !e.hidden && getComputedStyle(e).zIndex === '60' && !!e.querySelector('#quitting-ico svg'); }), '2부 「종료하는 중」은 확인 창보다 위(60) · 아이콘 있음');
        ok(qerrs.length === 0, `2부 화면 오류 0${qerrs.length ? ' — ' + qerrs.join(' | ') : ''}`);
        await q.close();
      }
    } finally {
      try { if (d.exitCode === null) d.kill(); } catch {}   // 이 검사가 띄운 시험 데몬 하나만(PID)
      for (const dir of [state, mods]) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
    }
  }
} finally {
  await browser.close(); server.close();
}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
