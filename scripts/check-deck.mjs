// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 튜토리얼 덱 ↔ 연수 원본 덱 글자 대조(v2.95.1) — 쪽마다 글자의 색·실제 배경·투명도·굵기·보임 + 명암비(대비).
// 원본 = 연수 폴더의 조립된 발표 HTML(IRIS_DECK_SOURCE, 없으면 저장소 위쪽에서 R01-*/D06-*/P03-*/발표자료(Slides)/*-발표.html). 없는 PC 는 건너뛴다.
// 시험 데몬 3459 + 가짜 영혼(임시) — 실 C:\IRIS·실 데몬(3458)은 건드리지 않는다. 사용: node scripts/check-deck.mjs
// 생긴 이유: 변환기가 원본 CSS 의 글꼴 선언을 잘못 잘라 색 변수 줄이 무효 → 파란 장 바탕이 사라져 흰 글자가 안 보였다(2026-10-23 사용자 신고).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawn } from 'node:child_process';
import { createRequire } from 'node:module'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { HANDOFF_SCHEMA, SETUP_STAGES, handoffFile, receiptFile } from '../daemon/handoff.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function findSource() {
  if (process.env.IRIS_DECK_SOURCE) return process.env.IRIS_DECK_SOURCE;
  for (let d = path.dirname(ROOT); d !== path.dirname(d); d = path.dirname(d)) {
    try {
      for (const r of fs.readdirSync(d).filter(n => /^R01-/.test(n))) for (const dd of fs.readdirSync(path.join(d, r)).filter(n => /^D06-/.test(n))) for (const p of fs.readdirSync(path.join(d, r, dd)).filter(n => /^P03-/.test(n))) {
        const s = path.join(d, r, dd, p, '발표자료(Slides)'); const f = fs.existsSync(s) && fs.readdirSync(s).find(n => /^교사를 위한 에이전트-발표\.html$/.test(n));
        if (f) return path.join(s, f);
      }
    } catch {}
  }
  return '';
}
const SRC = findSource();
if (!SRC || !fs.existsSync(SRC)) { console.log('SKIP: 연수 원본 덱이 없는 PC'); process.exit(0); }
let pw = null; const req = createRequire(import.meta.url);
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
if (!pw) { console.log('SKIP: playwright 없음'); process.exit(0); }
const { chromium } = (await import(pathToFileURL(pw).href)).default || await import(pathToFileURL(pw).href);
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'tutorial', 'deck', 'manifest.json'), 'utf8'));
const EDITED = new Set([1, 2, 18, 38, 41]); // 변환기가 일부러 고친 쪽(글 차이는 여기서만 허용)
// 원본에서도 흐린 두 곳만 튜토리얼에서 진하게 바꿨다(변환기 덧붙임 CSS) — 이 짝만 다름으로 치지 않는다
const READABLE = [['color', 'rgb(154, 163, 184)', 'rgb(122, 131, 153)'], ['bg', 'rgb(143, 166, 247)', 'rgb(106, 134, 240)']];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-deck-')); const soul = path.join(tmp, 'IRIS');
const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
wj(handoffFile(soul), { schema: HANDOFF_SCHEMA, packageVersion: '2.0.46', writtenAt: '2026-10-19T12:00:00+09:00', state: 'ready', subscriptions: ['chatgpt'], leadAgent: 'codex', login: { claude: 'not-needed', chatgpt: 'done' }, relay: { state: 'done', accounts: 1 }, setup: { allDone: true, failed: null }, folders: [], firstMessage: 'x', messenger: { installed: false, prompted: false }, resume: { installerPath: '_agent/setup/installer/IRIS-설치.cmd', args: ['--resume'] } });
wj(receiptFile(soul), { schema: 2, package: { version: '2.0.46' }, setup: Object.fromEntries(SETUP_STAGES.map((id) => [id, { status: 'done', finishedAt: 't' }])), online: { stage: 'done', net: { ok: true, blocked: [] }, logins: { claude: { state: 'not-needed' }, chatgpt: { state: 'done' } }, relay: { state: 'done', accounts: 1 } } });
fs.mkdirSync(path.join(soul, 'R01-교사(Teacher)'), { recursive: true }); // 역할 폴더가 있으면 「다음」 잠금이 없어 끝까지 넘길 수 있다
const state = path.join(tmp, 'st'); fs.mkdirSync(state); wj(path.join(state, 'settings.json'), { voice: { preload: false } }); fs.writeFileSync(path.join(state, 'sessions.json'), '[]');
const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, stdio: 'ignore', windowsHide: true, env: { ...process.env, IRIS_ROOT: soul, IRIS_FACE_PORT: '3459', IRIS_FACE_STATE: state, IRIS_FACE_MODULES: path.join(tmp, 'mods'), IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0', IRIS_AGENTS_HOME: path.join(tmp, 'home') } });

// 페이지 안 수집기: 섹션 안 글자마다 {글, 색, 실제 배경, 투명도, 굵기, 보임}
const COLLECT = (sec) => {
  const solid = (c) => c && !/^rgba\(\d+, \d+, \d+, 0\)$/.test(c) && c !== 'transparent';
  const effBg = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none') return 'image'; if (solid(cs.backgroundColor)) return cs.backgroundColor; } return 'none'; };
  const effOp = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) { o *= +getComputedStyle(e).opacity; if (e.tagName === 'SECTION') break; } return Math.round(o * 100) / 100; };
  const out = []; const w = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t) continue;
    const el = n.parentElement; if (el.closest('.head, video, style, script')) continue;
    const cs = getComputedStyle(el); if (!el.getBoundingClientRect().width) continue;
    out.push({ t: t.slice(0, 28), color: cs.color, bg: effBg(el), op: effOp(el), fw: cs.fontWeight, vis: cs.visibility });
  }
  return out;
};
const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
const contrast = (a, c) => { if (c === 'image' || c === 'none') return null; const x = rgb(a), y = rgb(c); if (x.length < 3 || y.length < 3 || (y.length > 3 && y[3] < 1)) return null; const L1 = lum(x), L2 = lum(y); return ((Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05)); };
let b;
try {
  b = await chromium.launch();
  const po = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await po.goto(pathToFileURL(SRC).href + '#1'); await sleep(1500);
  const N = await po.evaluate(() => document.querySelectorAll('section.slide').length);
  const orig = {};
  for (let i = 1; i <= N; i++) { await sleep(2400); orig[i] = await po.evaluate((fn) => (0, eval)(fn)(document.querySelector('section.slide.on')), COLLECT.toString()); await po.keyboard.press('ArrowRight'); }
  let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch('http://127.0.0.1:3459/api/health')).ok; } catch {} }
  const pt = await b.newPage({ viewport: { width: 1360, height: 860 } });
  await pt.goto('http://127.0.0.1:3459/'); await sleep(2500); await pt.evaluate(() => Tutorial.open()); await sleep(1500);
  const tut = {};
  for (let i = 0; i < 60; i++) {
    await sleep(2400);
    const no = await pt.evaluate(() => { const h = document.querySelector('.tu-deck'); return h.hidden ? 0 : +h.shadowRoot.querySelector('section.slide.on').dataset.no; });
    if (no) tut[no] = await pt.evaluate((fn) => (0, eval)(fn)(document.querySelector('.tu-deck').shadowRoot.querySelector('section.slide.on')), COLLECT.toString());
    if (await pt.locator('[data-nav="next"]').isHidden()) break;
    await pt.keyboard.press('ArrowRight');
  }
  ok(Object.keys(tut).length === man.slides.length, `튜토리얼 덱 ${Object.keys(tut).length}쪽 모두 읽음(manifest ${man.slides.length})`);
  const styleBad = [], textBad = [], lowBad = [];
  for (const no of Object.keys(tut).map(Number)) {
    const o = orig[no] || [], t = tut[no], used = new Set();
    for (const a of o) {
      const j = t.findIndex((x, k) => !used.has(k) && x.t === a.t); if (j < 0) { if (!EDITED.has(no)) textBad.push(`${no}쪽 원본에만 「${a.t}」`); continue; } used.add(j);
      for (const k of ['color', 'bg', 'op', 'fw', 'vis']) if (String(a[k]) !== String(t[j][k]) && !READABLE.some(([rk, from, to]) => rk === k && a[k] === from && t[j][k] === to)) styleBad.push(`${no}쪽 「${a.t}」 ${k} 원본 ${a[k]} ≠ ${t[j][k]}`);
    }
    t.forEach((x, k) => { if (!used.has(k) && !EDITED.has(no)) textBad.push(`${no}쪽 튜토리얼에만 「${x.t}」`); });
    // 대비: 튜토리얼에서 흐린 글자(명암비 < 3)인데 원본은 같은 글자가 그렇지 않을 때만 결함
    for (const x of t) { const c = contrast(x.color, x.bg); if (c != null && c < 3) { const a = o.find(y => y.t === x.t); const ca = a ? contrast(a.color, a.bg) : null; if (!(ca != null && ca < 3)) lowBad.push(`${no}쪽 「${x.t}」 명암비 ${c.toFixed(1)} (${x.color} / ${x.bg})`); } }
  }
  ok(!styleBad.length, `글자 색·배경·투명도·굵기·보임 = 원본과 같음${styleBad.length ? ` — 다름 ${styleBad.length}건: ${styleBad.slice(0, 6).join(' | ')}` : ''}`);
  ok(!lowBad.length, `흐린 글자(명암비 3 미만) 없음${lowBad.length ? ` — ${lowBad.length}건: ${lowBad.slice(0, 6).join(' | ')}` : ''}`);
  ok(!textBad.length, `글 차이는 일부러 고친 쪽(${[...EDITED].join('·')})에만${textBad.length ? ` — ${textBad.slice(0, 6).join(' | ')}` : ''}`);
} catch (e) { ok(false, '예외 ' + e.message); }
finally { try { await b?.close(); } catch {} try { d.kill(); } catch {} await sleep(500); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} }
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
