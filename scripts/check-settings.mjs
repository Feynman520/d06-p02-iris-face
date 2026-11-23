// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 설정 서랍 v2.87(사용자 선택 = 시안 A′: 6묶음 + 오른쪽 목차) 검사 — 실 데몬(3458)은 건드리지 않는다. 사용: node scripts/check-settings.mjs
//   1절 정적: 6묶음 순서·이름(첫 묶음 = 「디자인」) · 목차가 묶음 뒤(오른쪽) · 기존 요소 id 보존 · 미리보기는 「디자인」에서만 · 아이콘은 icons.js 이름
//   2절(playwright 있을 때) 시험 데몬 3459(임시 state·자동 재개·업데이트·음성 미리 올림 끔) + 헤드리스 크로미엄:
//       넓은 창(1280) — 한 번에 한 묶음 · 목차가 서랍 오른쪽 끝 · 6묶음 전환 · 목차 요약 갱신 · 마지막 묶음 기억 · 전부 종료 늘 보임 · 오류 0
//       좁은 창(900) — 목차 = 아이콘만(이름은 title), 묶음 전환은 그대로
// IRIS_CAPTURE_DIR 를 주면 묶음별 캡처 PNG 를 남긴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PANES = ['design', 'session', 'ontology', 'tools', 'notify', 'planner', 'mods', 'account', 'about', 'feedback']; // v2.90: 온톨로지·도구 묶음 추가 · v2.105: 의견 보내기 · 플래너(설계 조각 ⑧)

// ---------- 1) 정적 ----------
const html = src('app/index.html'), js = src('app/settings.js'), icons = src('app/icons.js'), main = src('app/main.js');
const aside = html.slice(html.indexOf('<aside id="settings"'), html.indexOf('</aside>', html.indexOf('<aside id="settings"')));
const order = [...aside.matchAll(/class="st-pane(?: wide)?" data-pane="([a-z]+)"/g)].map(m => m[1]);
ok(JSON.stringify(order) === JSON.stringify(PANES), `1 묶음 ${PANES.length}개 순서 (${order.join(',')})`);
ok(/data-pane="design">\s*<div class="st-pane-h"><h2>디자인<\/h2>/.test(aside) && !/<h2>모양<\/h2>/.test(aside), '1 첫 묶음 이름 = 디자인(옛 "모양" 없음)');
const navOrder = [...aside.matchAll(/class="st-nav-i" data-pane="([a-z]+)"/g)].map(m => m[1]);
ok(JSON.stringify(navOrder) === JSON.stringify(PANES), `1 목차 ${PANES.length}줄 = 묶음과 같은 순서`);
ok(aside.indexOf('id="st-nav"') > aside.lastIndexOf('class="st-pane'), '1 목차가 묶음 뒤 = 오른쪽');
ok(PANES.slice(1).every(p => new RegExp(`data-pane="${p}" hidden`).test(aside)), '1 처음엔 디자인만 보이고 나머지는 숨김');
const IDS = ['st-themes', 'st-stages', 'st-density', 'st-density-v', 'st-fps', 'st-remeasure', 'st-pause', 'st-perm', 'st-approval', 'st-sandbox', 'st-notify', 'st-notify-os', 'st-notify-test', 'st-mods', 'st-auth-sec', 'st-auth', 'st-auth-act', 'st-update', 'st-update-act', 'st-update-auto', 'st-recovery', 'st-root', 'st-onto', 'st-tools', 'st-tutorial', 'btn-shutdown', 'maker', 'st-close'];
const missing = IDS.filter(id => (aside.match(new RegExp(`id="${id}"`, 'g')) || []).length !== 1);
ok(!missing.length, `1 기존 요소 id ${IDS.length}개 보존(각 1번)${missing.length ? ' — 빠짐: ' + missing.join(',') : ''}`);
ok(!/class="st-foot"/.test(aside), '1 옛 바닥줄(st-foot) 없음 — 전부 종료는 목차 아래');
const navIcons = [...aside.matchAll(/data-icon="([a-z]+)"/g)].map(m => m[1]);
ok(navIcons.length === PANES.length && navIcons.every(n => new RegExp(`\\b${n}: '`).test(icons)), `1 목차 아이콘 = icons.js 이름 (${navIcons.join(',')})`);
ok(/function startPreviews\(\) \{\s*destroyPreviews\(\); if \(!open \|\| pane !== 'design'\) return;/.test(js), '1 애니메이션 미리보기는 「디자인」 묶음이 보일 때만');
ok(/if \(p === 'design'\) startPreviews\(\); else destroyPreviews\(\);/.test(js), '1 다른 묶음으로 가면 미리보기 정리');
ok(/Settings\.show\('mods'\)/.test(main) && /Settings\.showPane\('mods'\)/.test(main), '1 헤더 모듈 버튼 → 「확장 모듈」 묶음');
ok(/localStorage\.setItem\('iris\.settings\.pane'/.test(js), '1 마지막으로 본 묶음 기억');
// 플래너 묶음(설계 조각 ⑧): 스위치 여덟 줄 · 처음 값 = 데몬과 같음 · 사용자에게 보이는 글
const { PLANNER_DEFAULTS } = await import(pathToFileURL(path.join(ROOT, 'daemon', 'planner.mjs')).href);
const plPane = aside.slice(aside.indexOf('data-pane="planner"'), aside.indexOf('data-pane="mods"'));
const PL_IDS = ['st-pl-on', 'st-pl-morning', 'st-pl-morning-at', 'st-pl-start', 'st-pl-lead', 'st-pl-evening', 'st-pl-evening-at', 'st-pl-overlap', 'st-pl-talk', 'st-pl-sessions', 'st-pl-check', 'st-pl-quiet', 'st-pl-quiet-note', 'st-pl-usage', 'st-pl-folder'];
ok(PL_IDS.every((id) => (plPane.match(new RegExp(`id="${id}"`, 'g')) || []).length === 1), `1 플래너 묶음의 요소 ${PL_IDS.length}개(각 1번)`);
ok((plPane.match(/class="sw"/g) || []).length === 8 && (plPane.match(/class="st-opt(?: child)?"/g) || []).length === 12, '1 플래너: 스위치 여덟 줄 + 딸린 값 셋 + 잠시 조용히 한 줄(모두 .st-opt 모양)');
const plDefSrc = (js.match(/const PL_DEF = (\{[^}]*\});/) || [])[1];
let plDef = null; try { plDef = new Function(`return ${plDefSrc}`)(); } catch { /* 형식이 바뀜 */ }
ok(plDef && JSON.stringify(Object.entries(plDef).sort()) === JSON.stringify(Object.entries(PLANNER_DEFAULTS).sort()), '1 플래너: 화면의 처음 값 = 데몬의 처음 값(PLANNER_DEFAULTS)과 같음');
ok(plDef && plDef.plannerCheck === false && Object.entries(plDef).filter(([k, v]) => typeof v === 'boolean' && k !== 'plannerCheck').every(([, v]) => v === true), '1 플래너: 처음 값은 준비 점검만 끔');
ok(!/const DEF = \{[^}]*planner/.test(js), '1 플래너 키는 공용 처음 값(DEF)에 넣지 않음 — 손대지 않은 키는 저장되지 않는다');
ok(!/Face|TeamClaude|데몬/.test(plPane.replace(/<!--[\s\S]*?-->/g, '')) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(plPane), '1 플래너: 사용자에게 보이는 글에 안쪽 이름 · 이모지 없음');
ok(/onChange: \(c\) => window\.Planner\?\.applySettings\(c\)/.test(main) && /onCfg: \(patch\) => \{ Settings\.applyRemote\(patch\); \}/.test(main), '1 설정이 바뀌면 플래너 화면이 바로 따라감 · 데몬이 바꾼 설정은 화면의 사본에 맞춤');

// ---------- 2) 시험 데몬 + 화면 ----------
const req = createRequire(import.meta.url);
let pw = null;
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
if (!pw) console.log('SKIP 2절: playwright 없음');
else {
  const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
  const PORT = 3459, capDir = process.env.IRIS_CAPTURE_DIR || '';
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-settings-'));
  const mods = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-settings-mods-'));
  fs.writeFileSync(path.join(state, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8');
  fs.writeFileSync(path.join(state, 'sessions.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(state, 'planner-rules.json'), JSON.stringify({ intro: 'seen' }), 'utf8'); // 처음 한 번 소개 말풍선은 이미 본 사람으로(이 검사는 설정 화면을 본다)
  const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' } });
  let browser;
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok; } catch {} }
    ok(up, `2 시험 데몬 ${PORT} pid=${d.pid}`);
    browser = await chromium.launch();
    for (const W of [1280, 900]) {
      const p = await browser.newPage({ viewport: { width: W, height: 860 } });
      const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text()) && !/^Failed to load resource/.test(m.text())) errs.push(m.text()); });
      // 404 는 콘솔 글에 주소가 없어 원인을 못 찾으므로 응답에서 주소와 함께 잡는다
      // (수첩 폴더 열기의 404 = "아직 적은 것이 없음"은 일부러 내는 답이라 오류로 세지 않는다)
      p.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url()) && !(r.status() === 404 && /\/api\/planner\/open-folder$/.test(r.url()))) errs.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
      await p.goto(`http://127.0.0.1:${PORT}/`); await sleep(2000);
      await p.evaluate(() => { try { localStorage.removeItem('iris.settings.pane'); } catch {} });
      await p.keyboard.press('Escape'); await sleep(200);
      await p.locator('#btn-settings').click(); await sleep(1200);
      const vis = async () => (await p.locator('#settings .st-pane:visible').count());
      ok(await p.locator('.st-pane[data-pane="design"]').isVisible() && (await vis()) === 1, `2 ${W}px 처음 = 디자인 하나만`);
      if (W > 980) {
        const nb = await p.locator('#st-nav').boundingBox(), sb = await p.locator('#settings').boundingBox();
        ok(Math.abs(nb.x + nb.width - (sb.x + sb.width)) < 2 && nb.width > 180, `2 ${W}px 목차가 서랍 오른쪽 끝 · 이름 보임`);
        ok((await p.locator('#st-sum-design').textContent()).includes('·'), `2 ${W}px 디자인 요약 "${await p.locator('#st-sum-design').textContent()}"`);
      } else {
        const nb = await p.locator('#st-nav').boundingBox();
        ok(nb.width < 80 && !(await p.locator('#st-nav .st-nav-t').first().isVisible()) && (await p.locator('#st-nav .st-nav-i').first().getAttribute('title')) === '디자인', `2 ${W}px 목차 = 아이콘만(이름은 title)`);
      }
      ok((await p.locator('.st-pane[data-pane="design"] canvas.stage-pv').count()) >= 5, `2 ${W}px 애니메이션 띠`);
      if (capDir) { fs.mkdirSync(capDir, { recursive: true }); await p.screenshot({ path: path.join(capDir, `설정-${W}-design.png`) }); }
      for (const k of PANES.slice(1)) {
        await p.locator(`#st-nav .st-nav-i[data-pane="${k}"]`).click(); await sleep(400);
        ok(await p.locator(`.st-pane[data-pane="${k}"]`).isVisible() && (await vis()) === 1 && await p.locator(`#st-nav .st-nav-i[data-pane="${k}"]`).evaluate(e => e.classList.contains('cur')), `2 ${W}px ${k} 묶음만 · 목차 강조`);
        if (capDir) await p.screenshot({ path: path.join(capDir, `설정-${W}-${k}.png`) });
      }
      if (W > 980) {
        await p.locator('#st-nav .st-nav-i[data-pane="design"]').click(); await sleep(200);
        ok((await p.locator('.st-pane[data-pane="design"] canvas.stage-pv').count()) >= 5, '2 디자인으로 돌아오면 미리보기 다시');
        const before = await p.locator('#st-sum-design').textContent();
        await p.locator('#st-themes .st-theme').nth(3).click(); await sleep(300);
        const after = await p.locator('#st-sum-design').textContent();
        ok(after !== before && after.startsWith(await p.locator('#st-themes .st-theme').nth(3).textContent()), `2 테마 바꾸면 목차 요약도 (${after})`);
        await p.locator('#st-themes .st-theme').first().click(); await sleep(200);
        await p.locator('#st-nav .st-nav-i[data-pane="notify"]').click(); await p.locator('#st-close').click(); await sleep(200);
        await p.locator('#btn-settings').click(); await sleep(500);
        ok(await p.locator('.st-pane[data-pane="notify"]').isVisible(), '2 다시 열면 마지막으로 본 묶음');
        ok(await p.locator('#btn-shutdown').isVisible() && await p.locator('#maker').isVisible(), '2 전부 종료·버전이 목차 아래에 늘 보임');
        // ---- 플래너 묶음(설계 조각 ⑧): 스위치 · 딸린 값 · 잠시 조용히 · 사용량 · 끔일 때 실제로 멈추는지 ----
        const B = `http://127.0.0.1:${PORT}`;
        const saved = async () => (await (await fetch(`${B}/api/settings`)).json());
        const plKeys = async () => Object.keys(await saved()).filter((k) => k.startsWith('planner')).sort().join();
        const tap = async (sel) => { await p.locator(sel).evaluate((e) => e.click()); await sleep(350); };
        await p.locator('#st-nav .st-nav-i[data-pane="planner"]').click(); await sleep(500);
        const sw = async () => p.evaluate(() => Object.fromEntries(['st-pl-on', 'st-pl-morning', 'st-pl-start', 'st-pl-evening', 'st-pl-overlap', 'st-pl-talk', 'st-pl-sessions', 'st-pl-check'].map((id) => [id.slice(6), [document.getElementById(id).checked, document.getElementById(id).disabled]])));
        const s0 = await sw();
        ok(Object.entries(s0).every(([k, [on, dis]]) => on === (k !== 'check') && !dis), `2 플래너: 처음 값 = 준비 점검만 끔, 나머지 켬 — ${JSON.stringify(s0)}`);
        ok((await p.locator('#st-pl-lead .st-chip.cur').textContent()) === '10분' && (await p.locator('#st-pl-morning-at').inputValue()) === '08:00' && (await p.locator('#st-pl-evening-at').inputValue()) === '16:30', '2 플래너: 딸린 값의 처음 값(10분 전 · 08:00 · 16:30)');
        ok((await plKeys()) === '' && (await p.locator('#st-sum-planner').textContent()) === '켜짐', '2 플래너: 손대기 전에는 저장된 플래너 키 없음(없는 키 = 처음 값) · 목차 요약 "켜짐"');
        const usage = await p.locator('#st-pl-usage').textContent();
        ok(usage.startsWith('오늘 아이리스를 부른 횟수 0번') && usage.includes('최근 7일 0번'), `2 플래너: 사용량 한 줄(실제로 부른 것만) — ${usage.replace(/\n/g, ' / ')}`);
        await tap('#st-pl-check');
        ok((await plKeys()) === 'plannerCheck' && (await saved()).plannerCheck === true && (await p.locator('#st-sum-planner').textContent()) === '켜짐 · 준비 점검', '2 플래너: 준비 점검을 켜면 그 키만 저장 · 목차 요약에 보임');
        await tap('#st-pl-lead [data-lead="30"]');
        ok((await saved()).plannerStartMin === 30 && (await p.locator('#st-pl-lead .st-chip.cur').textContent()) === '30분', '2 플래너: 몇 분 전 = 칩으로 고름');
        await p.locator('#st-pl-evening-at').fill('17:10'); await p.locator('#st-pl-evening-at').dispatchEvent('change'); await sleep(350);
        ok((await saved()).plannerEveningAt === '17:10', '2 플래너: 하루 끝 정리 시각');
        await tap('#st-pl-start');
        ok((await saved()).plannerStartAlert === false && await p.locator('#st-pl-lead .st-chip').first().isDisabled(), '2 플래너: 시작 전 알림을 끄면 딸린 값이 잠김');
        await tap('#st-pl-start');
        // 잠시 조용히
        await tap('#st-pl-quiet [data-quiet="60"]');
        const q1 = Date.parse((await saved()).plannerQuietUntil) - Date.now();
        ok(q1 > 58 * 60000 && q1 <= 60 * 60000 && (await p.locator('#st-pl-quiet .st-chip').textContent()) === '다시 알리기' && (await p.locator('#st-sum-planner').textContent()).startsWith('조용히 · ') && (await p.locator('#st-pl-quiet-note').textContent()).includes('까지 조용히 하는 중'), '2 플래너: 「1시간」 = 지금부터 1시간 조용히 · 목차 요약 · 「다시 알리기」');
        await tap('#st-pl-quiet [data-quiet="off"]');
        ok((await saved()).plannerQuietUntil === null && (await p.locator('#st-pl-quiet .st-chip').count()) === 2, '2 플래너: 「다시 알리기」 = 조용히 풂');
        await tap('#st-pl-quiet [data-quiet="today"]');
        const q2 = new Date((await saved()).plannerQuietUntil);
        ok(q2.getHours() === 0 && q2.getMinutes() === 0 && q2.getTime() > Date.now() && q2.getTime() - Date.now() <= 24 * 3600000, '2 플래너: 「오늘 하루」 = 내일 0시까지');
        // 데몬이 바꾼 설정(말로 한 조용히)을 화면의 사본에 맞춤
        await p.evaluate(() => window.Planner.onMessage({ type: 'planner', rev: 0, proposals: 0, cfg: { plannerQuietUntil: null } })); await sleep(300);
        ok((await p.evaluate(() => window.Settings.get().plannerQuietUntil)) === null && (await p.locator('#st-pl-quiet .st-chip').count()) === 2, '2 플래너: 데몬이 보낸 설정 변화(cfg)가 설정 화면에 바로 반영됨');
        // 끔일 때 실제로 멈추는지: 창구 거절 · 숨은 호출 0 · 세션 명령 거절
        await tap('#st-pl-talk');
        const t0 = await (await fetch(`${B}/api/planner/talk`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '내일 3시 회의' }) })).json();
        ok(t0.ok === false && t0.say.includes('말하기가 꺼져') && (await (await fetch(`${B}/api/planner/usage`)).json()).today.calls === 0, '2 플래너: 말하기를 끄면 받지 않고 아이리스를 부르지도 않음(부른 횟수 0)');
        await tap('#st-pl-talk');
        await tap('#st-pl-on');
        const s1 = await sw();
        ok(s1.on[0] === false && Object.entries(s1).filter(([k]) => k !== 'on').every(([, [, dis]]) => dis) && (await p.locator('#st-sum-planner').textContent()) === '꺼짐' && await p.locator('#st-pl-quiet .st-chip').first().isDisabled(), '2 플래너를 끄면 아래 스위치 · 값이 모두 잠김 · 목차 요약 "꺼짐"');
        const post = async (u, body, headers = {}) => { const r = await fetch(`${B}${u}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { code: r.status, out: await r.json().catch(() => ({})) }; };
        const o1 = await post('/api/planner/ops', { ops: [{ op: 'check', id: 'x', done: true }] });
        const o2 = await post('/api/planner/talk', { text: '내일 3시 회의' });
        const o3 = await post('/api/planner/cli', { cmd: 'list' }, { 'x-iris-session': 's1', 'x-iris-key': 'k'.repeat(40) });
        const o4 = await post('/api/planner/decide', { id: 'x', yes: true });
        ok(o1.code === 409 && o1.out.code === 'disabled' && o2.out.ok === false && o2.out.say.includes('플래너가 꺼져') && o3.code === 409 && o3.out.text.includes('플래너를 꺼 두었습니다') && o4.code === 409 && (await (await fetch(`${B}/api/planner/usage`)).json()).today.calls === 0, `2 플래너를 끄면 창구가 거절함(끝냄 · 말하기 · 세션 명령 · 제안 답) · 숨은 호출 0 — ${o1.code}/${o3.code}/${o4.code}`);
        ok((await (await fetch(`${B}/api/planner/view`)).json()).enabled === false, '2 플래너를 꺼도 보기는 됨(enabled=false 로 알려 줌)');
        await p.locator('#st-close').click(); await sleep(400);
        ok(await p.locator('#pl-hex').isVisible(), '2 플래너를 꺼도 육각 단추는 남음(작업 알림을 말함)');
        await p.locator('#pl-hex').click(); await sleep(600);
        ok((await p.locator('.pl-note').textContent()).includes('플래너가 꺼져 있어요'), '2 꺼진 단추를 누르면 꺼져 있다고 알려 줌');
        await p.locator('.pl-note [data-settings]').click(); await sleep(500);
        ok(await p.locator('.st-pane[data-pane="planner"]').isVisible(), '2 「설정 열기」 = 설정의 플래너 묶음으로');
        await tap('#st-pl-on');
        ok((await saved()).plannerEnabled === true && (await sw()).morning[1] === false, '2 다시 켜면 풀림');
        ok((await plKeys()) === 'plannerCheck,plannerEnabled,plannerEveningAt,plannerQuietUntil,plannerStartAlert,plannerStartMin,plannerTalk', `2 플래너: 손댄 키만 저장됨(나머지는 처음 값을 따라감) — ${await plKeys()}`);
        // 수첩 폴더 열기: 쓰기 전에는 폴더가 없다(만들지 않음) · 다른 출처는 거절
        const f1 = await post('/api/planner/open-folder', {});
        const f2 = await post('/api/planner/open-folder', {}, { origin: 'https://evil.example' });
        ok(f1.code === 404 && f1.out.code === 'empty' && f2.code === 403 && !fs.existsSync(path.join(state, 'planner')), '2 수첩 폴더 열기: 아직 적은 것이 없으면 폴더를 만들지 않고 그렇게 말함 · 다른 출처 403');
        await p.locator('#st-pl-folder').click(); await sleep(500);
        ok((await p.locator('.dlg, .dialog, [role="dialog"], [role="alertdialog"]').filter({ hasText: '아직 수첩에 적은 것이 없어' }).count()) >= 1 || (await p.getByText('아직 수첩에 적은 것이 없어').count()) >= 1, '2 「수첩 폴더 열기」: 빈 수첩이면 화면 안 알림으로 알려 줌(네이티브 창 아님)');
        await p.keyboard.press('Escape'); await sleep(300);
        if (capDir) { await p.locator('#btn-settings').click().catch(() => {}); }
      }
      ok(errs.length === 0, `2 ${W}px 페이지 오류 ${errs.length}건${errs.length ? ' ' + errs.join(' | ') : ''}`);
      await p.close();
    }
  } catch (e) { ok(false, '2 예외 ' + e.message); }
  finally {
    try { await browser?.close(); } catch {}
    try { d.kill(); } catch {}
    await sleep(400);
    try { fs.rmSync(state, { recursive: true, force: true }); fs.rmSync(mods, { recursive: true, force: true }); } catch {}
  }
}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
