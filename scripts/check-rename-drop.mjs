// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 세션 이름 바꾸기 · 끌어다 놓기 첨부(v2.85, 2026-10-19 사용자 요청) 무접촉 검사.
//   1) 데몬 renameByUser(): 임시 state 폴더 + 가짜 pty(실제 CLI·프로세스 접촉 0)
//      - 사용자 이름(source=user)은 자동 이름(ai·gen·first)이 덮지 못한다 · 48자 자름 · 공백 정리 · 저장 파일에 남는다
//      - 빈 글 = 처음 고칠 때 맡겨 둔 자동 이름으로 되돌림 → 그 뒤 다시 자동 갱신을 받는다
//      - 에이전트 바꾸기(replaceAgent) 뒤에도 사용자 이름은 user 로 남고, 되돌릴 자동 이름은 fixed 로 굳는다
//   2) 데몬 라우트·화면 코드 정적 검사: 같은 출처 검사 · 목록/머리 다시 그리기 보호 · Esc 두 길 · 키 차단 · 끌기 구분 · 폴더 거름 · Electron 안전망
//   3) 화면(playwright 있을 때): 실제 index.html·style.css 로 안내 막이 기본 숨김·창 전체를 덮고 맨 위인지, 이름 입력칸이 사이드바 줄을 넘치지 않는지
// playwright 없으면 3) SKIP. IRIS_CAPTURE_DIR 를 주면 캡처 PNG 를 남긴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { SessionManager } from '../daemon/sessions.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const src = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// ---------- 1) 데몬 ----------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-rename-'));
const DEAD = 999999, cwd = process.cwd();
fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify([
  { id: 's1', cwd, agent: 'claude', model: 'opus', effort: 'high', status: 'exited', pid: DEAD, sessionId: null, title: '자동으로 지은 이름', titleSource: 'gen' },
  { id: 's2', cwd, agent: 'claude', model: 'opus', effort: 'high', status: 'exited', pid: DEAD, sessionId: null, title: '', titleSource: '' },
  { id: 's3', cwd, agent: 'claude', model: 'opus', effort: 'high', status: 'exited', pid: DEAD, sessionId: null, title: '바꾸기 전 이름', titleSource: 'ai' },
], null, 2), 'utf8');
class FakePty { constructor(cols, rows) { this.pid = 41000 + FakePty.n++; this.cols = cols; this.rows = rows; } onData() {} onExit() {} write() {} resize() {} kill() {} }
FakePty.n = 1;
class TestSM extends SessionManager { spawn() { return new FakePty(120, 36); } }
let lists = 0;
const sm = new TestSM(dir, { onList: () => { lists++; } });
const g = (id) => sm.get(id);
const saved = (id) => JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8')).find(r => r.id === id);

let r = sm.renameByUser('s1', '  내   이름  ');
ok(r && g('s1').title === '내 이름' && g('s1').titleSource === 'user', 'rename: 공백 정리 · source=user');
ok(g('s1').autoTitle?.title === '자동으로 지은 이름' && g('s1').autoTitle?.source === 'gen', 'rename: 자동 이름을 맡겨 둔다');
ok(saved('s1').title === '내 이름' && saved('s1').titleSource === 'user', 'rename: sessions.json 에 저장');
ok(lists >= 1, 'rename: 목록 방송(onList)');
ok(sm.setTitle('s1', '클로드가 적은 이름', 'ai') === false && g('s1').title === '내 이름', '자동 이름(ai)이 사용자 이름을 덮지 못함');
ok(sm.setTitle('s1', '첫 요청문', 'first') === false && sm.setTitle('s1', '생성 이름', 'gen') === false, '자동 이름(first·gen)도 덮지 못함');
sm.renameByUser('s1', '두 번째 이름');
ok(g('s1').title === '두 번째 이름' && g('s1').autoTitle?.title === '자동으로 지은 이름', '다시 고쳐도 맡겨 둔 자동 이름은 그대로');
sm.renameByUser('s1', '가'.repeat(60));
ok(g('s1').title.length === 48, '48자에서 자른다');
sm.renameByUser('s1', '   ');
ok(g('s1').title === '자동으로 지은 이름' && g('s1').titleSource === 'gen' && !('autoTitle' in g('s1')), '빈칸 = 자동 이름으로 되돌림');
ok(sm.setTitle('s1', '클로드가 적은 이름', 'ai') === true && g('s1').title === '클로드가 적은 이름', '되돌린 뒤엔 다시 자동 갱신을 받는다');

sm.renameByUser('s2', '처음부터 내가 지음');
sm.renameByUser('s2', '');
ok(g('s2').title === '' && g('s2').titleSource === '', '자동 이름이 없던 세션을 되돌리면 빈 이름(화면은 폴더 이름) · 다음 기록 읽기에서 채워짐');
ok(sm.setTitle('s2', '첫 요청문 한 줄', 'first') === true, '빈 이름으로 되돌린 세션은 first 를 받는다');
const before = JSON.stringify(g('s2'));
sm.renameByUser('s2', '');
ok(JSON.stringify(g('s2')) === before, '사용자 이름이 아닐 때 빈 글 = 아무 변화 없음');
ok(sm.renameByUser('nope', 'x') === null, '없는 세션 = null');

sm.renameByUser('s3', '에이전트 바꿔도 유지');
sm.replaceAgent('s3', { agent: 'claude', model: 'opus', effort: 'high', prompt: '이전 대화 이어받기' });
ok(g('s3').title === '에이전트 바꿔도 유지' && g('s3').titleSource === 'user', '에이전트 바꾸기 뒤에도 사용자 이름 유지');
ok(g('s3').autoTitle?.source === 'fixed', '에이전트 바꾸기 뒤 되돌릴 자동 이름은 fixed 로 굳음');
sm.renameByUser('s3', '');
ok(g('s3').title === '바꾸기 전 이름' && sm.setTitle('s3', '이어받기 요청문', 'ai') === false, '되돌리면 바꾸기 전 이름 · 이어받기 요청문이 끼어들지 않음');

// ---------- 2) 정적 검사 ----------
const server = src('daemon/server.mjs'), main = src('app/main.js'), html = src('app/index.html'), elec = src('app/electron/main.cjs');
const route = server.slice(server.indexOf("\\/title$/"), server.indexOf("\\/title$/") + 700);
ok(/sameOrigin\(req\)/.test(route) && /renameByUser/.test(route), '라우트 POST /api/sessions/:id/title = 같은 출처만 · renameByUser');
ok(/if \(!renaming\) \{ list\.innerHTML = ''/.test(main), '화면: 고치는 동안 목록을 다시 그리지 않음');
ok(/if \(!renaming\) \{ \$\('#vh-title'\)\.textContent/.test(main), '화면: 고치는 동안 머리 제목을 다시 그리지 않음');
const esc = main.slice(main.indexOf('function onEscape()'), main.indexOf('function onEscape()') + 400);
ok(/lastEscAt = now;\s*\n\s*if \(renaming\) \{ renaming\.cancel\(\); return; \}/.test(esc), '화면: onEscape() 맨 앞 = 이름 고치기 취소(작업 중단으로 새지 않음)');
const sr = main.slice(main.indexOf('function startRename('), main.indexOf('// ---------- 세션 선택'));
ok(/e\.stopPropagation\(\);/.test(sr) && /isComposing/.test(sr) && /lastEscAt = Date\.now\(\)/.test(sr), '화면: 입력칸 키 차단 · 한글 조합 Enter 무시 · Esc 중계 가드');
ok(/maxLength = 48/.test(sr) && /'blur', \(\) => finish\(false\)/.test(sr) && /draggable = false/.test(sr), '화면: 48자 · 바깥 클릭 취소 · 끌기 끔');
ok(/li\.onclick = \(\) => \{ if \(s\.id === current && setupMode === 'new'\) return;/.test(main), '화면: 보던 줄 클릭은 다시 그리지 않음(두 번 클릭 보존)');
ok(/includes\('Files'\)/.test(main) && /'dragenter', 'dragover'/.test(main) && /document\.addEventListener\('drop'/.test(main), '화면: Files 끌기만 받음(사이드바 순서 바꾸기와 구분)');
ok(/isDirectory/.test(main) && /uploadAll\(picked\.filter\(x => !x\.dir\)/.test(main), '화면: 폴더는 거르고 파일만 같은 업로드 길로');
ok(/f\.size > UPLOAD_MAX/.test(main) && /50 \* 1024 \* 1024/.test(server), '화면: 50MB 초과는 보내기 전에 거름(데몬 한도와 같음)');
ok(/id="drop-hint" class="drop-hint" hidden/.test(html), 'index.html: 안내 막 기본 숨김');
// v2.86: 말 안 해도 보이는 길(사용자 선택 ①+④+F2)
ok(/<button class="srename"[^>]*>\$\{Icons\.svg\('pencil'/.test(main) && /\.srename'\)\.onclick = \(e\) => \{ e\.stopPropagation\(\); startRename\(s\.id/.test(main), '화면(v2.86): 사이드바 연필 = 줄 선택으로 번지지 않고 그 자리에서 고침');
ok(/id="vh-name" class="vh-name"><span id="vh-title"[^>]*><\/span><button id="vh-rename"/.test(html), 'index.html(v2.86): 머리 제목 + 연필 묶음');
ok(/\$\('#vh-title'\)\.addEventListener\('click', renameHead\)/.test(main) && /\$\('#vh-rename'\)\.addEventListener\('click', renameHead\)/.test(main), '화면(v2.86): 머리 제목 한 번 클릭·연필로 고침');
const f2 = main.slice(main.indexOf('function renameCurrentByKey()'), main.indexOf('function renameCurrentByKey()') + 400);
ok(/renaming \|\| mode !== 'chat'\) return false/.test(f2) && /t && t\.offsetParent \? t : \$\('#vh-title'\)/.test(f2), '화면(v2.86): F2 = 대화 보기에서만 · 사이드바 접혔으면(이름 칸이 안 보이면) 머리 제목');
ok(/#app\.rail-hidden[^{]*\.srow \.sside \{ display: none; \}/.test(src('app/style.css')), 'style.css(v2.86): 접힌 사이드바엔 번호·연필 칸 모두 숨김');
ok(/e\.key === 'F2'[^\n]*!Settings\.isOpen\(\) && !FolderPicker\.isOpen\(\) && renameCurrentByKey\(\)/.test(main), '화면(v2.86): F2 는 설정·폴더 고르기가 열려 있으면 무시');
ok(/pencil: '/.test(src('app/icons.js')), 'icons.js(v2.86): pencil 선 아이콘');
ok(/will-frame-navigate[\s\S]{0,80}\^file:/.test(elec), 'Electron: file:// 이동 안전망');

// ---------- 3) 화면 ----------
const req = createRequire(import.meta.url);
let pw = null;
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
if (!pw) console.log('SKIP renderer: playwright 없음');
else {
  const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/gi, '');
  const css = src('app/style.css'); const capDir = process.env.IRIS_CAPTURE_DIR || '';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
    const hiddenFirst = await page.evaluate(() => getComputedStyle(document.getElementById('drop-hint')).display === 'none');
    ok(hiddenFirst, '화면: 안내 막 기본 숨김');
    const cover = await page.evaluate(() => {
      const h = document.getElementById('drop-hint'); h.hidden = false;
      const b = h.getBoundingClientRect(); const pts = [[5, 5], [550, 350], [1090, 690], [200, 600]];
      return { full: b.width >= innerWidth && b.height >= innerHeight, top: pts.every(([x, y]) => h.contains(document.elementFromPoint(x, y))) };
    });
    ok(cover.full && cover.top, '화면: 안내 막이 창 전체를 덮고 맨 위(미리보기 iframe 이 놓기를 가로채지 못함)');
    if (capDir) { fs.mkdirSync(capDir, { recursive: true }); await page.screenshot({ path: path.join(capDir, '끌어다놓기-안내막.png') }); }
    const fit = await page.evaluate(() => {
      document.getElementById('drop-hint').hidden = true;
      const list = document.getElementById('session-list');
      list.innerHTML = `<li class="srow active"><span class="dot idle"></span><span class="sname"><span class="stitle"><input class="rename-in" maxlength="48" value="${'아주 긴 세션 이름 '.repeat(5)}"></span></span><span class="sidx">1</span><span class="smeta">클로드 · opus · 대기</span></li>`;
      const row = list.querySelector('.srow').getBoundingClientRect(), inp = list.querySelector('.rename-in').getBoundingClientRect(), rail = document.getElementById('rail').getBoundingClientRect();
      return { inside: inp.left >= row.left && inp.right <= row.right + 0.5 && inp.right <= rail.right, wide: inp.width > row.width * 0.5, h: inp.height };
    });
    ok(fit.inside && fit.wide && fit.h < 30, `화면: 이름 입력칸이 사이드바 줄 안에 넉넉히 들어감(높이 ${Math.round(fit.h)}px)`);
    if (capDir) await page.locator('#rail').screenshot({ path: path.join(capDir, '이름바꾸기-입력칸.png') });
    // v2.86: 평소엔 번호, 마우스를 올리면 그 자리에 연필 — 줄 높이는 그대로
    const PEN = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 20h4L19 9"/></svg>';
    await page.evaluate((PEN) => {
      document.getElementById('session-list').innerHTML = [1, 2].map(n => `<li class="srow${n === 1 ? ' active' : ''}"><span class="dot idle"></span><span class="sname"><span class="stitle">세션 ${n}</span></span><span class="sside"><span class="sidx">${n}</span><button class="srename">${PEN}</button></span><span class="smeta">클로드 · opus · 대기</span></li>`).join('');
    }, PEN);
    const vis = (sel, i) => page.evaluate(([sel, i]) => getComputedStyle(document.querySelectorAll(sel)[i]).display !== 'none', [sel, i]);
    const rowH = (i) => page.evaluate((i) => document.querySelectorAll('#session-list .srow')[i].getBoundingClientRect().height, i);
    await page.mouse.move(1000, 650);
    const h0 = await rowH(1), idle = [await vis('.srow .sidx', 1), await vis('.srow .srename', 1)];
    await page.hover('#session-list .srow:nth-child(2)');
    const h1 = await rowH(1), hov = [await vis('.srow .sidx', 1), await vis('.srow .srename', 1), await vis('.srow .srename', 0)];
    ok(idle[0] && !idle[1], '화면(v2.86): 평소엔 번호만(연필 숨김)');
    ok(!hov[0] && hov[1] && !hov[2], '화면(v2.86): 마우스 올린 줄만 번호 자리에 연필');
    ok(Math.abs(h1 - h0) < 0.5, `화면(v2.86): 연필이 나와도 줄 높이 그대로(${h0}→${h1}px)`);
    if (capDir) await page.locator('#rail').screenshot({ path: path.join(capDir, '이름바꾸기-사이드바연필.png') });
    // 머리: 평소엔 연필 투명, 제목에 올리면 보임 · 긴 제목은 말줄임이고 연필은 머리 안
    const head = await page.evaluate(() => {
      document.getElementById('view').hidden = false;
      document.getElementById('vh-title').textContent = '아주 긴 세션 이름 '.repeat(8);
      document.getElementById('vh-combo').textContent = 'P02 · Claude Opus 5.5 · high · 대기';
      const t = document.getElementById('vh-title'), p = document.getElementById('vh-rename'), h = document.getElementById('view-head').getBoundingClientRect();
      const pb = p.getBoundingClientRect();
      return { clipped: t.scrollWidth > t.clientWidth + 1, penIn: pb.right <= h.right && pb.width >= 20, op: getComputedStyle(p).opacity };
    });
    await page.hover('#vh-title'); await page.waitForTimeout(250);
    const op1 = await page.evaluate(() => getComputedStyle(document.getElementById('vh-rename')).opacity);
    ok(head.clipped && head.penIn, '화면(v2.86): 긴 머리 제목은 말줄임 · 연필은 머리 안에 자리');
    ok(head.op === '0' && op1 === '1', `화면(v2.86): 머리 연필은 제목에 마우스를 올렸을 때만(${head.op}→${op1})`);
    if (capDir) await page.locator('#view-head').screenshot({ path: path.join(capDir, '이름바꾸기-머리연필.png') });
    await page.close();
  } finally { await browser.close(); }
}

try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
