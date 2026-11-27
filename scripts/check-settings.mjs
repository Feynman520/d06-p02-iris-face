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
const PANES = ['design', 'session', 'ontology', 'tools', 'planner', 'mods', 'account', 'about', 'feedback']; // 2026-11-25: 「알림」(notify)은 「알림 · 플래너」(planner)에 합침 // v2.90: 온톨로지·도구 묶음 추가 · v2.105: 의견 보내기 · 플래너(설계 조각 ⑧)

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
const IDS = ['st-themes', 'st-stages', 'st-density', 'st-density-v', 'st-fps', 'st-remeasure', 'st-pause', 'st-perm', 'st-approval', 'st-sandbox', 'st-agy-grp', 'st-agy-perm', 'st-notify', 'st-notify-os', 'st-notify-test', 'st-mods', 'st-auth-sec', 'st-auth', 'st-auth-act', 'st-update', 'st-update-act', 'st-update-auto', 'st-recovery', 'st-root', 'st-onto', 'st-tools', 'st-tutorial', 'btn-shutdown', 'maker', 'st-close'];
const missing = IDS.filter(id => (aside.match(new RegExp(`id="${id}"`, 'g')) || []).length !== 1);
ok(!missing.length, `1 기존 요소 id ${IDS.length}개 보존(각 1번)${missing.length ? ' — 빠짐: ' + missing.join(',') : ''}`);
ok(!/class="st-foot"/.test(aside), '1 옛 바닥줄(st-foot) 없음 — 전부 종료는 목차 아래');
// 2026-11-25: Antigravity 권한 칸은 처음엔 숨김(데몬이 목록을 줄 때만) · 새 대화의 선택값에는 안티그래비티일 때만 그 값이 실린다
ok(/id="st-agy-grp" hidden/.test(aside) && /sel\.agent === 'antigravity' \? \(st\.agyPermission \|\| ''\)/.test(fs.readFileSync(path.join(ROOT, 'app', 'main.js'), 'utf8')), '1 Antigravity 권한 칸: 처음엔 숨김 · 선택값은 안티그래비티 세션에만');
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
// 2026-11-25 「알림 · 플래너」로 합침(사용자 요청 — 시안 docs\시안-설정개선-2026-11-24.html ④): 작업 알림 스위치 둘 + 플래너 스위치 여덟 = 열, 줄(.st-opt)도 열.
// 딸린 값(시각 둘 · 몇 분 전)은 따로 줄을 차지하지 않고 같은 줄 오른쪽(.st-opt-r)에, 「잠시 조용히」는 카드 머리에 있다.
ok((plPane.match(/class="sw"/g) || []).length === 10 && (plPane.match(/class="st-opt(?: child)?"/g) || []).length === 10 && (plPane.match(/class="st-opt-r"/g) || []).length === 3, '1 알림 · 플래너: 스위치 열 개 = 줄 열 개(.st-opt) · 딸린 값 셋은 같은 줄 오른쪽');
ok(/id="st-notify"/.test(plPane) && /id="st-notify-os"/.test(plPane) && /id="st-notify-test"/.test(plPane) && !/data-pane="notify"/.test(aside) && /<h2>알림 · 플래너<\/h2>/.test(plPane), '1 알림 · 플래너: 작업 알림 카드가 이 묶음 안에 · 옛 「알림」 묶음 없음');
ok(plPane.indexOf('id="st-notify"') > 0 && plPane.indexOf('id="st-notify-os"') < plPane.indexOf('id="st-pl-on"') && plPane.indexOf('id="st-pl-on"') < plPane.indexOf('id="st-pl-rules"'), '1 알림 · 플래너: 카드 순서 = 작업 알림 → 플래너 → 일정 알림(작업 알림은 플래너 카드 밖 — 플래너를 꺼도 잠기지 않는다)');
ok(/const paneOf = \(p\) => \(p === 'notify' \? 'planner' : p\)/.test(js), '1 옛 묶음 이름 notify(기억해 둔 마지막 묶음 · 다른 코드의 부름)는 planner 로 읽음');
const plDefSrc = (js.match(/const PL_DEF = (\{[^}]*\});/) || [])[1];
let plDef = null; try { plDef = new Function(`return ${plDefSrc}`)(); } catch { /* 형식이 바뀜 */ }
ok(plDef && JSON.stringify(Object.entries(plDef).sort()) === JSON.stringify(Object.entries(PLANNER_DEFAULTS).sort()), '1 플래너: 화면의 처음 값 = 데몬의 처음 값(PLANNER_DEFAULTS)과 같음');
ok(plDef && plDef.plannerCheck === false && Object.entries(plDef).filter(([k, v]) => typeof v === 'boolean' && k !== 'plannerCheck').every(([, v]) => v === true), '1 플래너: 처음 값은 준비 점검만 끔');
ok(!/const DEF = \{[^}]*planner/.test(js), '1 플래너 키는 공용 처음 값(DEF)에 넣지 않음 — 손대지 않은 키는 저장되지 않는다');
ok(!/Face|TeamClaude|데몬/.test(plPane.replace(/<!--[\s\S]*?-->/g, '')) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(plPane), '1 플래너: 사용자에게 보이는 글에 안쪽 이름 · 이모지 없음');
ok(/onChange: \(c\) => window\.Planner\?\.applySettings\(c\)/.test(main) && /onCfg: \(patch, at\) => \{ Settings\.applyRemote\(patch, at\); \}/.test(main), '1 설정이 바뀌면 플래너 화면이 바로 따라감 · 데몬이 바꾼 설정은 화면의 사본에 맞춤');
const serverSrc = src('daemon/server.mjs');
ok(/broadcast\(\{ type: 'settings', patch, updatedAt: saved\.updatedAt, from:/.test(serverSrc) && /m\.type === 'settings'\) Settings\.applyRemote\(m\.patch, m\.updatedAt, m\.from\)/.test(main) && /if \(from && from === CLIENT\) return;/.test(js) && /'x-iris-client': CLIENT/.test(js), '1 설정 저장은 붙어 있는 화면 모두에 방송 · 자기 저장의 메아리는 무시(그 뒤에 바꾼 값을 되돌리지 않게)');
ok(/if \(typeof at === 'string' && at\) cfg\.updatedAt = at;/.test(js) && !/applyRemote[\s\S]{0,400}cfg\.updatedAt = new Date\(\)/.test(js), '1 받은 설정의 시각은 데몬이 적은 시각으로(화면의 지금 시각을 쓰지 않음)');

// ---------- 2) 시험 데몬 + 화면 ----------
const req = createRequire(import.meta.url);
let pw = null;
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
if (!pw) console.log('SKIP 2절: playwright 없음');
else {
  const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
  const PORT = 3459, capDir = process.env.IRIS_CAPTURE_DIR || '';
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-settings-'));
  // 안티그래비티 화면 잠금(2026-11-27): 이 절은 열린 화면(구글 계정 줄 · 「대시보드에서 다시 로그인」 · Antigravity 권한 고르기)을 본다 — 시험 상태 폴더에 열쇠를 놓아 연다.
  // 열린 시험 데몬이 진짜 중계기 · agy · ~/.gemini 에 닿지 않게 자리를 가짜로 준다(중계기에 닿지 않음 = 판정 gate → 권한 카드는 보인다). 잠긴 화면은 verify:agy-lock 이 본다.
  fs.writeFileSync(path.join(state, 'iris-keys.json'), JSON.stringify({ antigravity: 'open' }), 'utf8');
  const AGY_OPEN = { IRIS_AGY_GATE_URL: 'http://127.0.0.1:9', IRIS_AGY_EXE: path.join(state, 'no-agy.exe'), IRIS_GEMINI_DIR: path.join(state, 'gemini'), IRIS_AGY_STATUS_FILE: path.join(state, 'agy-status.json') };
  const mods = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-settings-mods-'));
  fs.writeFileSync(path.join(state, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8');
  fs.writeFileSync(path.join(state, 'sessions.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(state, 'planner-rules.json'), JSON.stringify({ intro: 'seen' }), 'utf8'); // 처음 한 번 소개 말풍선은 이미 본 사람으로(이 검사는 설정 화면을 본다)
  const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, ...AGY_OPEN, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' } });
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
        await p.locator('#st-nav .st-nav-i[data-pane="tools"]').click(); await p.locator('#st-close').click(); await sleep(200);
        await p.locator('#btn-settings').click(); await sleep(500);
        ok(await p.locator('.st-pane[data-pane="tools"]').isVisible(), '2 다시 열면 마지막으로 본 묶음');
        // 2026-11-25 묶음을 합침: 옛 이름 notify 로 기억해 둔 사람 · 옛 이름으로 여는 코드는 「알림 · 플래너」로 온다
        await p.locator('#st-close').click(); await sleep(200);
        await p.evaluate(() => window.Settings.show('notify')); await sleep(400);
        ok(await p.locator('.st-pane[data-pane="planner"]').isVisible() && (await vis()) === 1 && await p.locator('#st-notify').isVisible() && await p.locator('#st-pl-on').isVisible(), '2 옛 묶음 이름(notify)으로 열어도 「알림 · 플래너」 — 작업 알림과 플래너가 한 묶음에');
        ok((await p.locator('#st-nav .st-nav-i[data-pane="planner"] .st-nav-t').textContent()).replace(/\s+/g, ' ').trim() === '알림 · 플래너알림 켜짐 · 플래너 켜짐', `2 목차 한 줄 = 알림 켜짐 · 플래너 켜짐 (${(await p.locator('#st-nav .st-nav-i[data-pane="planner"] .st-nav-t').textContent()).replace(/\s+/g, ' ').trim()})`);
        // 작업 알림 스위치: 저장 값 · 딸린 스위치 잠금은 예전 그대로(자리만 옮김)
        await p.locator('#st-notify').evaluate((e) => e.click()); await sleep(500);
        const nf1 = await (await fetch(`http://127.0.0.1:${PORT}/api/settings`)).json();
        ok(nf1.notifyDone === false && await p.locator('#st-notify-os').isDisabled() && (await p.locator('#st-sum-notify').textContent()) === '알림 꺼짐' && await p.locator('#st-pl-on').isEnabled() && await p.locator('#st-pl-morning').isEnabled(), '2 작업 알림을 끄면 「윈도 알림도」만 잠기고 플래너 스위치는 그대로');
        await p.locator('#st-notify').evaluate((e) => e.click()); await sleep(500);
        ok((await (await fetch(`http://127.0.0.1:${PORT}/api/settings`)).json()).notifyDone === true && await p.locator('#st-notify-os').isEnabled(), '2 작업 알림 다시 켬');
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
        // 2026-11-24: 고를 것이 없는 알림은 창으로 막지 않고 말풍선으로(Dialog.notice) — 설정 서랍이 덮고 있으면 구석의 말풍선 자리(#pl-over)에 뜬다. 닫을 창이 없으므로 Esc 를 누르지 않는다(누르면 서랍이 닫힌다).
        const said = await p.evaluate(() => ({ bubble: [...document.querySelectorAll('.pl-say')].some((e) => e.textContent.includes('아직 수첩에 적은 것이 없어') && e.getBoundingClientRect().width > 0), dialog: !!document.querySelector('#dlg') && !document.querySelector('#dlg').hidden }));
        ok(said.bubble && !said.dialog, `2 「수첩 폴더 열기」: 빈 수첩이면 말풍선으로 알려 줌(막는 창 0 · 네이티브 창 아님) — ${JSON.stringify(said)}`);
        // 설정의 사본 맞추기: 어느 창에서 저장하든 붙어 있는 다른 창의 사본이 따라온다(옛 사본을 통째로 저장해 되돌리는 일을 막는다)
        const p2 = await browser.newPage({ viewport: { width: 1000, height: 700 } });
        const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
        await p2.goto(`http://127.0.0.1:${PORT}/`); await sleep(2000);
        const theme0 = await p2.evaluate(() => window.Settings.get().theme);
        await p.locator('#st-nav .st-nav-i[data-pane="design"]').click(); await sleep(300);
        await p.locator('#st-themes .st-theme').nth(2).click(); await sleep(600);
        const themeA = await p.evaluate(() => window.Settings.get().theme);
        const theme2 = await p2.evaluate(() => window.Settings.get().theme);
        ok(themeA !== theme0 && theme2 === themeA && (await p2.evaluate(() => document.documentElement.dataset.irisTheme)) === themeA, `2 한 창에서 바꾼 설정이 다른 창의 사본 · 화면에도 바로 반영됨 — ${theme0} → ${theme2}`);
        const at2 = await p2.evaluate(() => window.Settings.get().updatedAt);
        ok(at2 === (await saved()).updatedAt, '2 받은 쪽 사본의 시각 = 데몬이 적은 시각(화면의 지금 시각으로 "최신"을 만들지 않음)');
        // 받은 쪽(p2)이 그 뒤에 다른 것을 저장해도 첫 창의 변경을 되돌리지 않는다
        await p2.evaluate(() => { document.getElementById('btn-settings').click(); }); await sleep(500);
        await p2.locator('#st-nav .st-nav-i[data-pane="planner"]').click(); await sleep(300);
        await p2.locator('#st-pl-overlap').evaluate((e) => e.click()); await sleep(600);
        const fin = await saved();
        ok(fin.theme === themeA && fin.plannerOverlap === false && (await p.evaluate(() => window.Settings.get().plannerOverlap)) === false, '2 다른 창이 나중에 저장해도 앞선 변경이 되돌아가지 않고, 그 변경은 첫 창에도 옴');
        await p2.locator('#st-pl-overlap').evaluate((e) => e.click()); await sleep(400);
        await p.locator('#st-themes .st-theme').first().click(); await sleep(400);
        ok(errs2.length === 0, `2 둘째 창 페이지 오류 ${errs2.length}건${errs2.length ? ' ' + errs2.join(' | ') : ''}`);
        await p2.close();
        // 데몬이 (다시) 붙었을 때: 그사이 데몬에서 바뀐 값을 다시 읽는다
        await fetch(`${B}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plannerStartMin: 15 }) }); await sleep(400);
        ok((await p.evaluate(() => window.Settings.get().plannerStartMin)) === 15, '2 화면 밖에서 저장한 값(방송)도 사본에 반영됨');
        await p.evaluate(async () => { const c = JSON.parse(localStorage.getItem('iris.settings')); c.plannerStartMin = 5; c.updatedAt = '2020-01-01T00:00:00.000Z'; localStorage.setItem('iris.settings', JSON.stringify(c)); await window.Settings.resync(); }); await sleep(300);
        ok((await p.evaluate(() => window.Settings.get().plannerStartMin)) === 15, '2 다시 붙을 때(resync): 데몬의 값이 더 새것이면 그것으로 맞춤');
        // 계정 · 보안: 계정은 공급자 이름으로 가른다(2026-11-25 사용자 신고 — 구글(Antigravity) 계정 2개가 Claude 칸에 들어가 「갱신」이 Claude 로그인을 열었다)
        await p.locator('#st-nav .st-nav-i[data-pane="account"]').click(); await sleep(300);
        let renewCalls = 0; p.on('request', (r) => { if (/\/api\/auth\/renew/.test(r.url())) renewCalls++; });
        const accRows = async () => p.evaluate(() => {
          const it = (id, provider, label, level) => ({ id, group: 'teamclaude', provider, name: label, label, longKey: false, expiresAt: null, daysLeft: null, level, renew: 'teamclaude-login', optional: false });
          window.Settings.setAuth({ available: true, job: null, info: { worst: 'ok', due: [], checkedAt: '2026-11-25T00:00:00.000Z', items: [
            it('tc:anthropic:a@example.com', 'anthropic', 'a', 'ok'), it('tc:codex:codex-1', 'codex', 'codex-1', 'ok'),
            it('tc:google:google-1', 'google', 'google-1', 'ok'), it('tc:google:google-2', 'google', 'google-2', 'expired'), it('tc:newco:n-1', 'newco', 'n-1', 'ok')] } });
          const rows = (k) => [...document.querySelectorAll(`#st-auth [data-kind="${k}"] [data-auth]`)].map((e) => `${e.dataset.auth}${e.querySelector('[data-renew]') ? '+renew' : ''}${e.querySelector('[data-dash]') ? '+dash' : ''}`).join(' ');
          return { claude: rows('claude'), codex: rows('codex'), agy: rows('antigravity'), other: rows('other'), n: document.querySelector('#st-auth [data-kind="antigravity"] .auth-n')?.textContent || '' };
        });
        const ac = await accRows();
        ok(ac.claude === 'tc:anthropic:a@example.com+renew' && ac.codex === 'tc:codex:codex-1+renew', `2 계정: Claude 칸에는 Claude 계정만 · Codex 칸에는 Codex 계정만 — ${JSON.stringify(ac)}`);
        ok(ac.agy === 'tc:google:google-2+dash tc:google:google-1' && ac.n === '2개', '2 계정: 구글 계정은 Antigravity 칸(급한 줄이 위) · 정상인 줄에는 단추 없음 · 끊긴 줄만 「대시보드에서 다시 로그인」');
        ok(ac.other === 'tc:newco:n-1', '2 계정: 모르는 공급자는 Claude 칸이 아니라 단추 없는 「다른 계정」 칸');
        // IRIS 열쇠 칸: 쓰지 않는 예비 열쇠(optional = 1년 열쇠가 살아 있을 때의 터미널 로그인)는 줄을 내놓지 않는다 · 1년 열쇠가 없으면(optional 아님) 로그인 줄이 그대로 보인다(2026-11-25 사용자 요청)
        const irisRows = async (withLong) => p.evaluate((withLong) => {
          const longKey = { id: 'iris:longkey', group: 'iris', provider: 'anthropic', name: 'me', label: 'IRIS 1년 열쇠', longKey: true, expiresAt: Date.now() + 300 * 86400e3, daysLeft: 300, level: 'ok', renew: 'iris-longkey', optional: false };
          const login = { id: 'iris:login', group: 'iris', provider: 'anthropic', name: 'me', label: withLong ? 'IRIS 터미널 로그인' : 'IRIS 로그인', longKey: false, expiresAt: null, daysLeft: null, level: 'expired', renew: 'claude-login', optional: withLong };
          if (!withLong) delete login.optional; // 옛 도구는 optional 칸을 주지 않는다 — 칸이 없다고 숨기면 안 된다(코덱스 검토)
          window.Settings.setAuth({ available: true, job: null, info: { worst: withLong ? 'ok' : 'expired', due: withLong ? [] : ['iris:login'], checkedAt: '2026-11-25T00:00:00.000Z', items: withLong ? [longKey, login] : [login] } });
          const card = document.querySelector('#st-auth [data-kind="iris"]');
          return { ids: [...card.querySelectorAll('[data-auth]')].map((e) => e.dataset.auth).join(' '), n: card.querySelector('.auth-n')?.textContent || '', text: card.textContent };
        }, withLong);
        const ir1 = await irisRows(true);
        ok(ir1.ids === 'iris:longkey' && ir1.n === '1개' && !/터미널 로그인/.test(ir1.text), `2 계정: 1년 열쇠가 살아 있으면 쓰지 않는 터미널 로그인 줄은 보이지 않음 — ${JSON.stringify({ ids: ir1.ids, n: ir1.n })}`);
        const ir2 = await irisRows(false);
        ok(ir2.ids === 'iris:login' && ir2.n === '1개' && /IRIS 로그인/.test(ir2.text), `2 계정: 1년 열쇠가 없으면 「IRIS 로그인」 줄은 그대로 보임 — ${JSON.stringify({ ids: ir2.ids, n: ir2.n })}`);
        // 낱말은 대시보드와 같게(2026-11-25): 중계기 판정(health)이 있으면 「확인 중」 · 「재로그인 필요」. 확인 중인 구글 줄에는 단추가 없다(스스로 돌아올 수 있다).
        const words = await p.evaluate(() => {
          const it = (id, provider, label, level, health) => ({ id, group: 'teamclaude', provider, name: label, label, longKey: false, expiresAt: null, daysLeft: null, level, renew: 'teamclaude-login', optional: false, health });
          window.Settings.setAuth({ available: true, job: null, info: { worst: 'expired', due: ['tc:anthropic:a@example.com'], checkedAt: '2026-11-25T00:00:00.000Z', items: [
            it('tc:anthropic:a@example.com', 'anthropic', 'a', 'expired', 'needs-login'), it('tc:codex:codex-1', 'codex', 'codex-1', 'ok', 'checking'),
            it('tc:google:google-1', 'google', 'google-1', 'ok', 'checking'), it('tc:google:google-2', 'google', 'google-2', 'expired', 'needs-login'), it('tc:google:google-3', 'google', 'google-3', 'ok', 'ok')] } });
          const word = (id) => { const e = document.querySelector(`#st-auth [data-auth="${id}"]`); return `${e?.querySelector('.auth-d')?.textContent || ''}${e?.querySelector('[data-dash]') ? '+dash' : ''}`; };
          return { a: word('tc:anthropic:a@example.com'), c: word('tc:codex:codex-1'), g1: word('tc:google:google-1'), g2: word('tc:google:google-2'), g3: word('tc:google:google-3'), all: document.querySelector('#st-auth').textContent };
        });
        ok(words.a === '재로그인 필요' && words.c === '확인 중', `2 계정: 클로드 · 코덱스 줄의 낱말 = 중계기 판정 그대로 — ${JSON.stringify({ a: words.a, c: words.c })}`);
        ok(words.g1 === '확인 중' && words.g2 === '재로그인 필요+dash' && words.g3 === '정상', `2 계정: 구글 줄 = 확인 중(단추 없음) · 재로그인 필요(대시보드 단추) · 정상 — ${JSON.stringify({ g1: words.g1, g2: words.g2, g3: words.g3 })}`);
        ok(!/끊김/.test(words.all), '2 계정: 옛 낱말 「끊김」이 남지 않음');
        // 계정 · 보안을 열 때 데몬에 "오래됐으면 다시 읽어" 표시(fresh=1)를 붙여 묻는다
        const freshCalls = []; const onReq = (r) => { if (/\/api\/auth\?fresh=1/.test(r.url())) freshCalls.push(1); }; p.on('request', onReq);
        await p.locator('#st-nav .st-nav-i[data-pane="session"]').click(); await sleep(200);
        await p.locator('#st-nav .st-nav-i[data-pane="account"]').click(); await sleep(500);
        p.off('request', onReq);
        ok(freshCalls.length === 1, `2 계정: 묶음을 열 때 /api/auth?fresh=1 한 번 (${freshCalls.length}회)`);
        await accRows();
        await p.locator('#st-auth [data-kind="antigravity"] [data-dash]').click(); await sleep(400);
        ok(renewCalls === 0 && await p.evaluate(() => !document.querySelector('#dlg') || document.querySelector('#dlg').hidden), '2 계정: 구글 계정의 단추는 갱신(로그인) 요청을 보내지 않음 · 확인 창도 뜨지 않음');
        // 세션 기본값: Antigravity 권한 모드(2026-11-25) — 데몬이 목록을 줄 때만 카드가 보인다. 처음 값 = 전부 허용(저장된 키 없음)
        if (!(await p.locator('#settings').isVisible())) { await p.locator('#btn-settings').click(); await sleep(400); }
        await p.locator('#st-nav .st-nav-i[data-pane="session"]').click(); await sleep(300);
        if (await p.locator('#st-agy-grp').isVisible()) {
          ok((await saved()).agyPermission === undefined && (await p.inputValue('#st-agy-perm')) === '' && /Antigravity 전부 허용/.test(await p.locator('#st-sum-session').textContent()), '2 세션 기본값: Antigravity 카드 · 처음 값 = 전부 허용(저장된 키 없음)');
          await p.selectOption('#st-agy-perm', 'plan'); await sleep(600);
          ok((await saved()).agyPermission === 'plan' && /Antigravity 계획만/.test(await p.locator('#st-sum-session').textContent()), '2 세션 기본값: Antigravity 권한을 고르면 저장되고 목차 요약에 보임');
          ok((await saved()).permission === undefined || (await saved()).permission === (await p.inputValue('#st-perm')), '2 세션 기본값: Antigravity 칸을 바꿔도 Claude 권한 값은 그대로');
          await fetch(`${B}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agyPermission: 'manual' }) }); await sleep(500);
          ok((await p.inputValue('#st-agy-perm')) === '', '2 세션 기본값: 목록에 없는 저장 값(옛 값 · 손으로 적은 값) = 전부 허용으로 보임');
          await p.selectOption('#st-agy-perm', 'auto'); await sleep(400); await p.selectOption('#st-agy-perm', ''); await sleep(500);
          ok((await saved()).agyPermission === '', '2 세션 기본값: 전부 허용으로 되돌리기');
        } else console.log('SKIP 2 세션 기본값 Antigravity 카드: 이 데몬에는 안티그래비티 권한 목록이 없음');
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
