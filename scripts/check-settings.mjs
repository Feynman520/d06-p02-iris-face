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
const PANES = ['design', 'session', 'notify', 'mods', 'account', 'about'];

// ---------- 1) 정적 ----------
const html = src('app/index.html'), js = src('app/settings.js'), icons = src('app/icons.js'), main = src('app/main.js');
const aside = html.slice(html.indexOf('<aside id="settings"'), html.indexOf('</aside>', html.indexOf('<aside id="settings"')));
const order = [...aside.matchAll(/class="st-pane" data-pane="([a-z]+)"/g)].map(m => m[1]);
ok(JSON.stringify(order) === JSON.stringify(PANES), `1 묶음 6개 순서 (${order.join(',')})`);
ok(/data-pane="design">\s*<div class="st-pane-h"><h2>디자인<\/h2>/.test(aside) && !/<h2>모양<\/h2>/.test(aside), '1 첫 묶음 이름 = 디자인(옛 "모양" 없음)');
const navOrder = [...aside.matchAll(/class="st-nav-i" data-pane="([a-z]+)"/g)].map(m => m[1]);
ok(JSON.stringify(navOrder) === JSON.stringify(PANES), '1 목차 6줄 = 묶음과 같은 순서');
ok(aside.indexOf('id="st-nav"') > aside.lastIndexOf('class="st-pane"'), '1 목차가 묶음 뒤 = 오른쪽');
ok(PANES.slice(1).every(p => new RegExp(`data-pane="${p}" hidden`).test(aside)), '1 처음엔 디자인만 보이고 나머지는 숨김');
const IDS = ['st-themes', 'st-stages', 'st-density', 'st-density-v', 'st-fps', 'st-remeasure', 'st-pause', 'st-perm', 'st-approval', 'st-sandbox', 'st-notify', 'st-notify-os', 'st-notify-test', 'st-mods', 'st-auth-sec', 'st-auth', 'st-auth-act', 'st-update', 'st-update-act', 'st-update-auto', 'st-recovery', 'st-root', 'btn-shutdown', 'maker', 'st-close'];
const missing = IDS.filter(id => (aside.match(new RegExp(`id="${id}"`, 'g')) || []).length !== 1);
ok(!missing.length, `1 기존 요소 id ${IDS.length}개 보존(각 1번)${missing.length ? ' — 빠짐: ' + missing.join(',') : ''}`);
ok(!/class="st-foot"/.test(aside), '1 옛 바닥줄(st-foot) 없음 — 전부 종료는 목차 아래');
const navIcons = [...aside.matchAll(/data-icon="([a-z]+)"/g)].map(m => m[1]);
ok(navIcons.length === 6 && navIcons.every(n => new RegExp(`\\b${n}: '`).test(icons)), `1 목차 아이콘 = icons.js 이름 (${navIcons.join(',')})`);
ok(/function startPreviews\(\) \{\s*destroyPreviews\(\); if \(!open \|\| pane !== 'design'\) return;/.test(js), '1 애니메이션 미리보기는 「디자인」 묶음이 보일 때만');
ok(/if \(p === 'design'\) startPreviews\(\); else destroyPreviews\(\);/.test(js), '1 다른 묶음으로 가면 미리보기 정리');
ok(/Settings\.show\('mods'\)/.test(main) && /Settings\.showPane\('mods'\)/.test(main), '1 헤더 모듈 버튼 → 「확장 모듈」 묶음');
ok(/localStorage\.setItem\('iris\.settings\.pane'/.test(js), '1 마지막으로 본 묶음 기억');

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
  const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' } });
  let browser;
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok; } catch {} }
    ok(up, `2 시험 데몬 ${PORT} pid=${d.pid}`);
    browser = await chromium.launch();
    for (const W of [1280, 900]) {
      const p = await browser.newPage({ viewport: { width: W, height: 860 } });
      const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
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
