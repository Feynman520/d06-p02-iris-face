// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 설정 → 의견 보내기(v2.105) 검사. 실 데몬(3458)·실제 의견함(Supabase)·알림 메일은 건드리지 않는다. 사용: node scripts/check-feedback.mjs
//   1절 단위: validate·osLabel·appInfo·sendFeedback(가짜 fetch — 보내는 값·오류 갈래·던지지 않음)
//   2절 정적: 불러올 때 연결 없음 · 받는 곳 = IRIS 공용 DB · 보내기 라우트는 같은 출처만 · 내용·이메일은 로그에 안 실음
//   3절 시험 데몬 3459 + 가짜 의견함(127.0.0.1, IRIS_FACE_FEEDBACK_URL): 누르기 전 바깥 연결 0 · 정보 줄 · 다른 출처 403 ·
//       보낸 값(p_source=app·판 정보) · 횟수 제한 갈래 · (playwright 있으면) 화면에서 탭·안내·보내기·접수 화면·실패 시 홈페이지 길
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const F = await import(pathToFileURL(path.join(ROOT, 'daemon', 'feedback.mjs')).href);

// ---------- 1) 단위 ----------
ok(F.validate({ kind: 'bug', place: 'face', body: '  a  ' }).payload?.body === 'a', '1 내용 앞뒤 빈칸 정리');
ok(F.validate({ kind: 'bug', body: '   ' }).error === 'empty', '1 빈 내용 = empty');
ok(F.validate({ kind: 'spam', body: 'x' }).error === 'bad', '1 없는 종류 = bad');
ok(F.validate({ kind: 'bug', place: 'mars', body: 'x' }).error === 'bad', '1 없는 어디서 = bad');
ok(F.validate({ kind: 'bug', body: 'x'.repeat(4001) }).error === 'too_long', '1 4,001자 = too_long');
ok(F.validate({ kind: 'bug', body: 'x', email: 'nope' }).error === 'email', '1 이메일 형식 = email');
ok(F.validate({ kind: 'bug', body: 'x' }).payload?.place === 'unknown' && F.validate({ kind: 'bug', body: 'x' }).payload?.email === null, '1 어디서 비면 잘 모름 · 이메일 비면 null');
ok(F.osLabel({ platform: 'win32', release: '10.0.26200' }) === 'Windows 11 (26200)' && F.osLabel({ platform: 'win32', release: '10.0.19045' }) === 'Windows 10 (19045)', '1 윈도 판 이름(22000 기준)');
const info = F.appInfo({ face: '2.105.0', package: '2.0.63' }, { platform: 'win32', release: '10.0.26200' });
ok(info === 'IRIS 창 2.105.0 · 설치 패키지 2.0.63 · Windows 11 (26200)', `1 판 정보 한 줄 (${info})`);
ok(F.appInfo({ face: '2.105.0' }, { platform: 'win32', release: '10.0.26200' }) === 'IRIS 창 2.105.0 · Windows 11 (26200)', '1 설치 패키지 없으면(개발 폴더) 빼고');
const fake = (status, body, seen) => async (url, init) => { if (seen) seen.push({ url, init }); return { ok: status < 300, status, text: async () => body }; };
{
  const seen = [];
  const r = await F.sendFeedback({ kind: 'feature', place: 'site', body: '제목\n둘째', email: 'a@b.co' }, { info: 'I', url: 'https://hub.test', key: 'K', fetchImpl: fake(200, '"F-20261113-abcdef"', seen) });
  const sent = JSON.parse(seen[0].init.body);
  ok(r.ok && r.receipt === 'F-20261113-abcdef', '1 성공 → 접수 번호');
  ok(seen[0].url === 'https://hub.test/rest/v1/rpc/submit_feedback' && seen[0].init.headers.apikey === 'K', '1 넣기 함수 하나로만 보냄');
  ok(sent.p_source === 'app' && sent.p_app_info === 'I' && sent.p_kind === 'feature' && sent.p_place === 'site' && sent.p_email === 'a@b.co' && !('p_trap' in sent), `1 보낸 값 (${Object.keys(sent).join(',')})`);
  ok(Object.keys(sent).sort().join(',') === 'p_app_info,p_body,p_email,p_kind,p_place,p_source', '1 다른 값(경로·계정 등)은 싣지 않음');
}
ok((await F.sendFeedback({ kind: 'bug', body: 'x' }, { fetchImpl: fake(400, '{"message":"rate_limited"}') })).error === 'rate', '1 횟수 제한 → rate');
ok((await F.sendFeedback({ kind: 'bug', body: 'x' }, { fetchImpl: fake(400, '{"message":"full"}') })).error === 'full', '1 가득 참 → full');
ok((await F.sendFeedback({ kind: 'bug', body: 'x' }, { fetchImpl: fake(500, 'oops') })).error === 'server', '1 서버 오류 → server');
ok((await F.sendFeedback({ kind: 'bug', body: 'x' }, { fetchImpl: fake(200, '"not-a-receipt"') })).error === 'server', '1 이상한 응답 → server');
ok((await F.sendFeedback({ kind: 'bug', body: 'x' }, { fetchImpl: async () => { throw new Error('ECONNREFUSED'); } })).error === 'offline', '1 연결 실패 → offline(던지지 않음)');
{ let called = false; const r = await F.sendFeedback({ kind: 'bug', body: '' }, { fetchImpl: async () => { called = true; } }); ok(r.error === 'empty' && !called, '1 빈 내용은 바깥에 보내지 않음'); }

// ---------- 2) 정적 ----------
const fm = src('daemon/feedback.mjs'), sv = src('daemon/server.mjs');
ok(!/^\s*(await\s+)?fetch\(/m.test(fm) && !/^await /m.test(fm), '2 feedback.mjs 는 불러올 때 아무것도 하지 않음');
ok(F.HUB.url === 'https://bgintjgktcajltvmtpia.supabase.co' && /^eyJ/.test(F.HUB.anonKey) && !/__ANON__/.test(fm), '2 받는 곳 = IRIS 공용 DB · anon 키 채워짐');
ok(!/service_role/.test(fm), '2 관리자 열쇠 없음');
const route = sv.slice(sv.indexOf("p === '/api/feedback') {"), sv.indexOf("p === '/api/feedback') {") + 700);
ok(/if \(!sameOrigin\(req\)\)/.test(route), '2 보내기 라우트 = 같은 출처만');
ok(!/b\.body|b\.email/.test(route.match(/log\([^\n]*/)?.[0] || ''), '2 로그에 내용·이메일 안 실음');

// ---------- 3) 시험 데몬 ----------
const PORT = 3459;
const hits = []; let mode = 'ok';
const mock = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  hits.push({ url: q.url, key: q.headers.apikey, body: b ? JSON.parse(b) : null });
  if (mode === 'rate') { s.writeHead(400, { 'content-type': 'application/json' }); return s.end('{"code":"22023","message":"rate_limited"}'); }
  if (mode === 'down') { s.destroy(); return; }
  s.writeHead(200, { 'content-type': 'application/json' }); s.end('"F-20261113-0000aa"');
}); });
await new Promise(r => mock.listen(0, '127.0.0.1', r));
const mockUrl = `http://127.0.0.1:${mock.address().port}`;
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-fb-'));
const mods = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-fb-mods-'));
fs.writeFileSync(path.join(state, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8');
fs.writeFileSync(path.join(state, 'sessions.json'), '[]', 'utf8');
const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
  env: { ...process.env, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0', IRIS_FACE_FEEDBACK_URL: mockUrl } });
const api = async (p, init) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };
function outbound() {
  const ps = `Get-NetTCPConnection -OwningProcess ${d.pid} -ErrorAction SilentlyContinue | Where-Object { $_.RemoteAddress -notmatch '^(127\\.|::1$|0\\.0\\.0\\.0$|::$)' } | ForEach-Object { $_.RemoteAddress + ':' + $_.RemotePort }`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true });
  return (r.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
let browser;
try {
  let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok; } catch {} }
  ok(up, `3 시험 데몬 ${PORT} pid=${d.pid}`);
  const g = await api('/api/feedback');
  ok(g.status === 200 && /^IRIS 창 \d+\.\d+\.\d+/.test(g.body.info) && /Windows|win32|linux|darwin/.test(g.body.info) && g.body.fallback === 'https://iris-workspace.com/feedback', `3 정보 줄 (${g.body.info})`);
  const o = outbound(); ok(o.length === 0 && hits.length === 0, `3 누르기 전 바깥 연결 0 · 의견함 호출 0${o.length ? ' → ' + o.join(', ') : ''}`);
  const bad = await api('/api/feedback', { method: 'POST', headers: { Origin: 'http://evil.example.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'bug', body: 'x' }) });
  ok(bad.status === 403 && hits.length === 0, `3 다른 출처 보내기 거부(403) (got ${bad.status})`);
  const e = await api('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'bug', body: ' ' }) });
  ok(e.status === 400 && e.body.error === 'empty' && hits.length === 0, '3 빈 내용 400 · 바깥 호출 없음');
  const s = await api('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'improve', place: 'install', body: '시험 한 줄', email: '' }) });
  const h = hits.at(-1);
  ok(s.status === 200 && s.body.receipt === 'F-20261113-0000aa', '3 보내기 → 접수 번호');
  ok(h?.url === '/rest/v1/rpc/submit_feedback' && h.body.p_source === 'app' && h.body.p_kind === 'improve' && h.body.p_place === 'install' && h.body.p_email === null && h.body.p_app_info === g.body.info, '3 의견함이 받은 값 = app · 고른 값 · 판 정보');
  mode = 'rate'; const rl = await api('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'bug', body: 'x' }) });
  ok(rl.status === 400 && rl.body.error === 'rate', '3 횟수 제한 → rate');
  mode = 'ok';
  const log = fs.existsSync(path.join(state, 'daemon.log')) ? fs.readFileSync(path.join(state, 'daemon.log'), 'utf8') : '';
  ok(/feedback: sent F-20261113-0000aa/.test(log) && !/시험 한 줄/.test(log), '3 로그 = 접수 번호만(내용 없음)');

  // 화면(playwright 있을 때)
  const req = createRequire(import.meta.url); let pw = null;
  for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
  if (!pw) console.log('SKIP 3 화면: playwright 없음');
  else {
    const mod = await import(pathToFileURL(pw).href); browser = await (mod.default || mod).chromium.launch();
    const p = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errs = []; p.on('pageerror', x => errs.push(x.message));
    await p.goto(`http://127.0.0.1:${PORT}/`); await sleep(1800);
    await p.keyboard.press('Escape'); await sleep(200);
    await p.locator('#btn-settings').click(); await sleep(800);
    await p.locator('#st-nav .st-nav-i[data-pane="feedback"]').click(); await sleep(700);
    ok(await p.locator('.st-pane[data-pane="feedback"]').isVisible(), '3 화면: 목차 → 의견 보내기 묶음');
    ok(((await p.textContent('#fb-info-v')) || '').startsWith('IRIS 창'), '3 화면: 함께 보내는 정보 줄');
    ok(await p.locator('#fb-send').isDisabled(), '3 화면: 빈 글이면 보내기 꺼짐');
    await p.selectOption('#fb-where', 'install'); ok(await p.locator('#fb-tip').isVisible(), '3 화면: 고장+설치 → 설치기 안내');
    await p.locator('.fb-tabs button[data-k="feature"]').click(); await sleep(350);
    ok(await p.locator('#fb-tip').isHidden() && /없나요/.test(await p.getAttribute('#fb-body', 'placeholder')), '3 화면: 탭 바꾸면 안내 숨김 · 입력 안내 바뀜');
    const inkX = await p.$eval('.fb-ink', el => el.style.transform); ok(/translateX\([1-9]/.test(inkX), `3 화면: 밑줄이 세 번째 탭으로 (${inkX})`);
    await p.locator('#fb-more').click(); ok(await p.locator('#fb-detail').isVisible(), '3 화면: 자세히 → 보내는 것/안 보내는 것');
    await p.fill('#fb-body', '화면 시험\n둘째 줄'); await p.fill('#fb-mail', 'me@example.com');
    const n0 = hits.length; await p.locator('#fb-send').click(); await sleep(800);
    ok(hits.length === n0 + 1 && hits.at(-1).body.p_kind === 'feature' && hits.at(-1).body.p_email === 'me@example.com', '3 화면: 보내기 → 의견함 1통');
    ok(await p.locator('#fb-done').isVisible() && (await p.textContent('#fb-number')) === 'F-20261113-0000aa' && await p.locator('#fb-reply-note').isVisible(), '3 화면: 접수 화면 · 답장 안내');
    if (process.env.IRIS_CAPTURE_DIR) await p.screenshot({ path: path.join(process.env.IRIS_CAPTURE_DIR, 'feedback-done.png') });
    await p.locator('#fb-again').click(); await sleep(200);
    ok(await p.locator('#fb-write').isVisible() && (await p.inputValue('#fb-body')) === '', '3 화면: 하나 더 보내기 → 빈 글');
    mode = 'down'; await p.fill('#fb-body', '실패 시험'); await p.locator('#fb-send').click(); await sleep(1200);
    const href = await p.getAttribute('#fb-err a', 'href').catch(() => null);
    ok(await p.locator('#fb-err').isVisible() && /^https:\/\/iris-workspace\.com\/feedback\?info=IRIS/.test(href || '') && (await p.inputValue('#fb-body')) === '실패 시험', '3 화면: 실패 → 홈페이지 길 + 쓴 글 그대로');
    mode = 'ok';
    if (process.env.IRIS_CAPTURE_DIR) await p.screenshot({ path: path.join(process.env.IRIS_CAPTURE_DIR, 'feedback-fail.png') });
    ok(errs.length === 0, `3 화면: 페이지 오류 0${errs.length ? ' — ' + errs.join(' | ') : ''}`);
  }
} catch (x) { fail++; console.log(`FAIL unexpected — ${x.message}`); }
finally {
  try { await browser?.close(); } catch {}
  try { await fetch(`http://127.0.0.1:${PORT}/api/shutdown`, { method: 'POST' }); } catch {}
  let alive = true; for (let i = 0; i < 16 && alive; i++) { await sleep(250); try { process.kill(d.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; } }
  if (alive) { try { process.kill(d.pid); } catch {} }
  mock.close();
  fs.rmSync(state, { recursive: true, force: true }); fs.rmSync(mods, { recursive: true, force: true });
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
