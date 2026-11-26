// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// verify:ontology-interview — 설정 → 온톨로지 「폴더 구조 인터뷰」(v2.102, 2026-11-10 사용자 요청 · 2026-11-26 "누르면 새 대화가 열리고 요청문이 들어가게").
//   1절 정적: 프롬프트에 루트 확인·대본(interview.md)·확정 뒤 생성·그래프 다시 만들기가 있고, 개인·학교 낱말이 없다(공개 저장소)
//             + 단추로 여는 대화(QuickChat)가 모델 대조 값(expectModel)을 보내고 고른 에이전트를 스스로 옮기지 않는다
//   2절(playwright 있을 때) 시험 데몬 3459 + 가짜 영혼(IRIS_ROOT 임시) + 헤드리스 크로미엄.
//       **새 대화 만들기(POST /api/sessions)는 화면에서 가로채 가짜 답을 준다 — 시험 데몬도 CLI 를 띄우지 않는다(실 계정 · 자동 제목 생성 접촉 0).**
//       ⓐ 역할 0개 → 큰 카드 「인터뷰 시작」 · 복사는 탭 아래 공통 「직접 붙여 넣기(복사)」 한 곳
//          누르면 = 만들기 1번(연타 · 다른 진입점 동시 호출에도) · 루트 폴더 · 프롬프트 전문 · 고른 값 그대로 · 설정 닫힘 · 대화 보기 · 쓰던 글 보관 → 홈에서 복귀
//       ⓑ 만들기 실패 → 알림 창 · 쓰던 글 그대로 · 잠금 풀림(다시 누르면 다시 만든다 = 살아 있는 대화로 보내지 않는다)
//       ⓒ 고른 에이전트를 쓸 수 없음(계정 전부 0 — 단추 판정의 "모두 꺼졌으면 막지 않는다" 예외와 무관하게) → 만들기 0번 + 안내 · 선택은 그대로
//       ⓓ 루트를 모름 → 만들기 0번 + 안내
//       ⓔ 역할 있음 → 큰 카드 없음, 머리줄 작은 「폴더 인터뷰」 · 공통 복사 영역은 그대로 · 「계획만」 권한 = 미리 안내 + 그 권한 그대로 보냄(높이지 않음)
// 실 데몬(3458)·실제 C:\IRIS 무접촉.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lf = (s) => String(s || '').replace(/\r\n/g, '\n');

// 1절
const src = fs.readFileSync(path.join(ROOT, 'app', 'ontology.js'), 'utf8');
const m = src.match(/const IV_PROMPT = \[([\s\S]*?)\]\.join\('\\n'\);/);
ok(!!m, '1 프롬프트 상수 있음');
const prompt = m ? new Function(`return [${m[1]}].join('\\n');`)() : ''; // 소스의 배열 글자를 그대로 계산(따옴표·이스케이프 안전)
ok(/IRIS 루트.*아니면.*멈춰/.test(prompt), '1 루트가 아니면 멈추는 줄(0번)');
ok(/_agent\/setup\/interview\.md/.test(prompt) && /없으면 아래/.test(prompt), '1 설치 PC 대본 먼저, 없으면 자체 규칙');
ok(/"네"라고 한 뒤에만 만들어/.test(prompt) && /AGENTS\.md/.test(prompt) && /CLAUDE\.md/.test(prompt), '1 확정 뒤에만 생성 + AGENTS.md·CLAUDE.md');
ok(/build_graph\.py --init --write/.test(prompt) && /render_view\.py/.test(prompt), '1 그래프 다시 만들기');
ok(/이름을 바꾸거나 지우지 마/.test(prompt) && /한 번에 한 질문/.test(prompt), '1 기존 폴더 보호 · 한 번에 한 질문');
const BANNED = /함세준|sejun|shinjang|신장|C:\\\\Users|@gmail|ai_00\d/i;
ok(!BANNED.test(prompt), '1 개인·학교 낱말 0건(공개 저장소)');
const mainSrc = fs.readFileSync(path.join(ROOT, 'app', 'main.js'), 'utf8');
const quick = (mainSrc.match(/async function quickStart\([\s\S]*?window\.QuickChat = /) || [''])[0];
ok(!!quick, '1 본체에 단추로 여는 대화(quickStart · QuickChat) 있음');
ok(/expectModel: expectOf\(c\)/.test(quick), '1 quickStart 가 모델 대조 값(expectModel)을 보냄');
ok(!/renderSetup\(\)/.test(quick.replace(/\/\/.*$/gm, '')), '1 quickStart 가 고른 에이전트를 스스로 옮기지 않음(renderSetup 호출 없음)');
ok(/QuickChat\.start\(\{ prompt: IV_PROMPT \}\)/.test(src), '1 인터뷰 단추 = QuickChat.start(프롬프트)');
// 홈으로 온 바로 뒤 입력창을 다른 글로 채우는 두 길(플래너 「대화 이어가기」 · 튜토리얼 「첫 대화」)은 보관한 글을 꺼내지 않는다 — 꺼냈다가 덮어쓰면 사라진다
ok((mainSrc.match(/if \(current\) goHome\(\{ keepStash: true \}\);/g) || []).length === 2, '1 플래너 · 튜토리얼의 홈 전환은 보관한 글을 꺼내지 않음(keepStash 두 곳)');
ok(!/localStorage/.test((src.match(/const IV_PROMPT[\s\S]*?function gridHtml/) || [''])[0]), '1 인터뷰 단추는 살아 있는 대화를 기억하지 않음(localStorage 없음)');
// 보내기(submit)와 단추로 여는 대화는 서로 겹치지 않는다 — 보내기는 답이 오면 입력창을 통째로 비우므로, 겹치면 그사이 돌아온 글이 지워진다
const submitSrc = (mainSrc.match(/async function submit\(\) \{[\s\S]*?\$\('#btn-send'\)\.onclick = submit;/) || [''])[0];
ok(/if \(quickBusy\) return;/.test(submitSrc) && /sending = true;/.test(submitSrc) && /finally \{ sending = false;/.test(submitSrc), '1 보내기는 단추로 여는 중이면 쉬고, 자기가 기다리는 동안을 표시함(sending)');
ok(/if \(sending\) return \{ ok: false, reason: 'sending' \};/.test(quick), '1 단추로 여는 대화는 보내기가 기다리는 동안 시작하지 않음');

// 2절
const req = createRequire(import.meta.url);
let pw = null;
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
if (!pw) console.log('SKIP 2절: playwright 없음');
else {
  const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
  const PORT = 3459;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-iv-'));
  const soul = path.join(tmp, 'soul'); fs.mkdirSync(path.join(soul, '_agent'), { recursive: true });
  const state = path.join(tmp, 'state'); fs.mkdirSync(state);
  fs.writeFileSync(path.join(state, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8');
  fs.writeFileSync(path.join(state, 'sessions.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(state, 'tutorial.json'), JSON.stringify({ done: true }), 'utf8');
  const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, IRIS_ROOT: soul, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: path.join(tmp, 'mods'), IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' } });
  let browser;
  try {
    let up = false, health = null;
    for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); up = r.ok; if (up) health = await r.json(); } catch {} }
    ok(up && health?.pid === d.pid, `2 시험 데몬 ${PORT}(방금 띄운 것)`);
    if (!(up && health?.pid === d.pid)) throw new Error(`포트 ${PORT} 의 데몬이 방금 띄운 것이 아니다 — 다른 검사가 쓰는 중일 수 있어 여기서 멈춘다`);
    const agentsMap = await (await fetch(`http://127.0.0.1:${PORT}/api/agents`)).json();
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORT}` });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));

    // 가로채기: 새 대화 만들기는 데몬에 닿지 않는다(가짜 답) · 계정 상태와 루트는 필요할 때만 바꿔 준다
    // 작업목록 방송도 흉내 낸다: 화면의 웹소켓은 시험 데몬에 그대로 잇고, 가짜 대화가 든 목록만 끼워 보낸다
    //   listOrder 'before' = 보통의 순서(목록 방송 → 만들기 답) / 'after' = 만들기 답이 먼저 오고 목록이 늦게 옴
    const calls = []; let postMode = 'ok', acctMock = null, noRoot = false, listOrder = 'before', lateMs = 400, pageWs = null;
    const fakeList = [];
    const pushList = () => { try { pageWs?.send(JSON.stringify({ type: 'sessions', list: fakeList })); } catch {} };
    await p.routeWebSocket(/\/ws$/, (ws) => { pageWs = ws; ws.connectToServer(); });
    await p.route('**/api/sessions', async (route) => {
      const rq = route.request();
      if (rq.method() !== 'POST') return route.continue();
      const body = JSON.parse(rq.postData() || '{}'); calls.push(body);
      await sleep(600); // 연타 · 「여는 중…」을 볼 틈
      if (postMode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
      const id = `iv-fake-${calls.length}`;
      fakeList.push({ id, cwd: body.cwd, agent: body.agent, model: body.model, effort: body.effort || '', status: 'busy', startedAt: new Date().toISOString(), title: '' });
      if (listOrder === 'before') { pushList(); await sleep(80); }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id }) });
      if (listOrder === 'after') setTimeout(pushList, lateMs); // 'never' = 목록을 보내지 않는다
    });
    // 열린 대화에 글 보내기도 가로챈다(가짜 대화라 데몬은 모른다) — 답을 0.9초 늦춘다
    let sends = 0;
    await p.route('**/api/sessions/*/send', async (route) => { sends++; await sleep(900); return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
    const activeId = () => p.evaluate(() => document.querySelector('#session-list .srow.active')?.dataset.id || '');
    await p.route('**/api/agents/status', (route) => (acctMock ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(acctMock) }) : route.continue()));
    await p.route('**/api/health', async (route) => {
      if (!noRoot) return route.continue();
      const r = await route.fetch(); const j = await r.json(); delete j.root;
      return route.fulfill({ response: r, body: JSON.stringify(j) });
    });

    const openOnto = async (draft = '', agent = 'claude') => {
      await p.goto(`http://127.0.0.1:${PORT}/`); await sleep(1800);
      await p.keyboard.press('Escape'); await sleep(200);
      const ab = p.locator(`.seg-agent .seg-btn[data-agent="${agent}"]`); // 이 PC 에 마지막으로 골라 둔 에이전트에 기대지 않는다
      if (await ab.count() && await ab.isVisible() && (await ab.getAttribute('aria-disabled')) !== 'true') { await ab.click(); await sleep(150); }
      if (draft) { await p.locator('#composer-text').fill(draft); await sleep(100); }
      await p.locator('#btn-settings').click(); await sleep(800);
      await p.locator('#st-nav [data-pane="ontology"]').click(); await sleep(1200);
    };
    const selNow = () => p.evaluate(() => ({ agent: document.querySelector('.seg-agent .seg-btn.active')?.dataset.agent, model: document.querySelector('#sel-model')?.value }));
    const draftNow = () => p.locator('#composer-text').inputValue();
    const samePath = (a, b) => String(a || '').replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase() === String(b || '').replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
    const copyVia = async () => { // 공통 접힘 영역으로 복사
      await p.evaluate(() => navigator.clipboard.writeText(''));
      await p.evaluate(() => { document.querySelector('#on-manual').open = true; }); await sleep(100);
      await p.locator('#on-manual .iv-copy').click(); await sleep(300);
      return lf(await p.evaluate(() => navigator.clipboard.readText())); // 윈도 클립보드는 줄끝을 CRLF 로 돌려준다
    };

    // ⓐ 역할 0개
    await openOnto('쓰던 글 123');
    ok(await p.locator('#iv-card').isVisible(), '2ⓐ 역할 0개 → 큰 인터뷰 카드');
    ok(/인터뷰 시작/.test(await p.locator('#iv-card .iv-go').textContent()), '2ⓐ 카드 단추 = 「인터뷰 시작」');
    ok(!(await p.locator('#on-iv').isVisible()), '2ⓐ 위 줄 작은 단추는 숨김');
    ok(!(await p.locator('#iv-card .iv-copy').count()) && (await p.locator('#on-manual').count()) === 1, '2ⓐ 복사 길은 탭 아래 공통 영역 한 곳(카드 안에는 없음)');
    ok(!(await p.locator('#on-manual').evaluate((el) => el.open)), '2ⓐ 공통 복사 영역은 접힌 채로 시작');
    ok(!(await p.locator('#iv-hint').isVisible()) && !(await p.locator('#iv-msg').isVisible()), '2ⓐ 평소에는 안내 줄 없음(권한 미리 알림 · 못 연 사유)');
    const clip = await copyVia();
    const shown = await p.locator('#on-manual .iv-pre').textContent();
    ok(clip === shown && clip === prompt, '2ⓐ 복사된 글 = 화면에 보이는 글 = 프롬프트');
    if (!(clip === shown && clip === prompt)) console.log('  clip', JSON.stringify(clip.slice(0, 60)), clip.length, '| shown', shown.length, '| prompt', prompt.length);
    ok(/복사됨/.test(await p.locator('#on-manual .iv-copy').textContent()), '2ⓐ 누르면 「복사됨」');
    await sleep(1700);
    ok(/프롬프트 복사/.test(await p.locator('#on-manual .iv-copy').textContent()), '2ⓐ 1.5초 뒤 원래 글로');
    if (process.env.IRIS_CAPTURE_DIR) await p.screenshot({ path: path.join(process.env.IRIS_CAPTURE_DIR, 'ontology-interview-empty.png') });
    const exp = await selNow();
    // 설정의 권한 기본값(클로드 = 권한 모드 / 코덱스 = 승인 · 샌드박스) — 단추가 이 값을 그대로 보내는지 본다
    const perm = await p.evaluate(() => ({ permission: document.querySelector('#st-perm')?.value || '', approval: document.querySelector('#st-approval')?.value || '', sandbox: document.querySelector('#st-sandbox')?.value || '' }));
    const wantPerm = exp.agent === 'claude' ? { permission: perm.permission, approval: '', sandbox: '' } : exp.agent === 'codex' ? { permission: '', approval: perm.approval, sandbox: perm.sandbox } : null;
    // 연타 + 다른 진입점의 동시 호출
    const second = await p.evaluate(async () => { const b = document.querySelector('#iv-card .iv-go'); b.click(); b.click(); b.click(); return window.QuickChat.start({ prompt: 'x' }); });
    ok(second?.ok === false && second.reason === 'busy', '2ⓐ 여는 중의 다른 호출은 busy 로 돌아옴(잠금은 본체 한 곳)');
    ok(/여는 중/.test(await p.locator('#iv-card .iv-go').textContent()) && await p.locator('#iv-card .iv-go').isDisabled(), '2ⓐ 여는 동안 단추 = 「여는 중…」 · 잠김');
    await sleep(1500);
    ok(calls.length === 1, `2ⓐ 연타 3번 + 동시 호출에도 새 대화 만들기 1번(실제 ${calls.length})`);
    const b1 = calls[0] || {};
    ok(samePath(b1.cwd, health.root), '2ⓐ 폴더 = IRIS 루트');
    ok(b1.prompt === prompt, '2ⓐ 요청문 = 프롬프트 전문(쓰던 글 · 첨부가 섞이지 않음)');
    ok(b1.agent === exp.agent && b1.model === exp.model, `2ⓐ 에이전트 · 모델 = 입력창에 골라 둔 값(${exp.agent} · ${exp.model})`);
    const mm = agentsMap?.[b1.agent]?.models?.find((x) => x.id === b1.model);
    const wantModel = (mm?.actuals ? mm.actuals[b1.effort] : mm?.actual) ?? null;
    ok('expectModel' in b1 && (b1.expectModel ?? null) === wantModel, `2ⓐ 모델 대조 값(expectModel) = 목록의 정확한 이름(${wantModel})`);
    if (wantPerm) ok((b1.permission || '') === wantPerm.permission && (b1.approval || '') === wantPerm.approval && (b1.sandbox || '') === wantPerm.sandbox, `2ⓐ 권한 = 설정의 값 그대로(${wantPerm.permission || wantPerm.approval + ' · ' + wantPerm.sandbox} — 높이지도 낮추지도 않음)`);
    else console.log('SKIP 2ⓐ 권한 대조: 고른 에이전트의 권한 칸을 이 검사가 모름');
    ok(await p.locator('#settings').isHidden(), '2ⓐ 설정 서랍 닫힘');
    ok((await p.locator('#view').getAttribute('data-mode')) !== 'term', '2ⓐ 대화 보기');
    ok(await p.locator('#view').isVisible() && (await activeId()) === 'iv-fake-1', '2ⓐ 방금 만든 대화가 열려 있음(대화 영역 보임 · 작업목록에서 고른 줄)');
    ok(lf(await p.locator('#chat').textContent()).includes('IRIS 폴더 구조 인터뷰를 시작해 줘'), '2ⓐ 대화 화면에 보낸 요청문이 바로 보임');
    ok((await draftNow()) === '', '2ⓐ 쓰던 글은 인터뷰 대화의 입력창에 남지 않음(보관)');
    // 보관한 글이 있는 채로 새 글을 쓰고 또 연다 → 둘 다 보관, 나중 것부터 복귀
    await p.locator('#composer-text').fill('둘째 글'); await sleep(100);
    const again = await p.evaluate(() => window.QuickChat.start({ prompt: '두 번째 요청' })); await sleep(300);
    ok(again?.ok === true && calls.length === 2 && (await activeId()) === 'iv-fake-2', '2ⓐ 끝난 뒤 다시 부르면 새 대화(살아 있는 대화로 보내지 않음)');
    ok((await draftNow()) === '', '2ⓐ 둘째 글도 새 대화의 입력창에 남지 않음');
    await p.locator('#btn-home').click(); await sleep(300);
    ok((await draftNow()) === '둘째 글', '2ⓐ 홈으로 돌아오면 나중에 쓰던 글부터 복귀');
    await p.locator('#btn-home').click(); await sleep(200);
    ok((await draftNow()) === '둘째 글', '2ⓐ 입력창에 글이 있으면 덮지 않음(다시 홈을 눌러도 그대로)');
    await p.locator('#composer-text').fill(''); await sleep(100);
    await p.locator('#btn-home').click(); await sleep(300);
    ok((await draftNow()) === '쓰던 글 123', '2ⓐ 입력창이 비면 먼저 보관한 글도 복귀');
    await p.locator('#composer-text').fill(''); await sleep(100);
    await p.locator('#btn-home').click(); await sleep(200);
    ok((await draftNow()) === '', '2ⓐ 보관한 글은 한 번씩만 돌아옴');

    // ⓑ 만들기 실패
    postMode = 'fail';
    await openOnto('남길 글');
    await p.locator('#iv-card .iv-go').click(); await sleep(1500);
    ok(calls.length === 3, '2ⓑ 실패하는 만들기 1번');
    ok(await p.locator('#dlg').isVisible() && /인터뷰 대화를 열지 못했습니다/.test(await p.locator('#dlg-title').textContent()), '2ⓑ 알림 창 「인터뷰 대화를 열지 못했습니다」');
    await p.locator('#dlg-ok').click(); await sleep(300);
    ok((await draftNow()) === '남길 글', '2ⓑ 실패하면 쓰던 글 그대로');
    ok(!(await p.locator('#settings').isHidden()), '2ⓑ 설정 서랍은 그대로');
    ok(/인터뷰 시작/.test(await p.locator('#iv-card .iv-go').textContent()) && !(await p.locator('#iv-card .iv-go').isDisabled()), '2ⓑ 단추 원래대로(잠금 풀림)');
    ok(await p.locator('#on-manual').evaluate((el) => el.open), '2ⓑ 공통 복사 영역이 펼쳐짐');
    postMode = 'ok'; listOrder = 'after'; // 이번에는 만들기 답이 먼저 오고 작업목록이 0.4초 늦게 온다
    await p.locator('#iv-card .iv-go').click(); await sleep(800);
    ok(calls.length === 4 && await p.locator('#settings').isHidden(), '2ⓑ 다시 누르면 새로 만든다(잠금 풀림)');
    ok((await draftNow()) === '', '2ⓑ 목록을 기다리는 틈에도 보관한 글을 꺼내지 않음');
    await sleep(900);
    ok(await p.locator('#view').isVisible() && (await activeId()) === 'iv-fake-4', '2ⓑ 목록이 늦게 와도 방금 만든 대화가 열림');
    ok(lf(await p.locator('#chat').textContent()).includes('IRIS 폴더 구조 인터뷰를 시작해 줘') && (await draftNow()) === '', '2ⓑ 그 대화에 요청문이 보이고 입력창은 비어 있음');
    await p.locator('#btn-home').click(); await sleep(300);
    ok((await draftNow()) === '남길 글', '2ⓑ 홈으로 돌아오면 쓰던 글 복귀');

    // ⓑ′ 목록을 기다리는 동안 사용자가 스스로 홈으로 감 → 늦게 온 목록이 인터뷰 대화로 끌고 가지 않는다
    listOrder = 'after'; lateMs = 1600;
    await openOnto('홈으로 간 글');
    await p.locator('#iv-card .iv-go').click(); await sleep(900); // 만들기 답은 왔고(0.6초) 목록은 아직
    await p.locator('#btn-home').click(); await sleep(200);
    ok((await draftNow()) === '홈으로 간 글', '2ⓑ′ 기다리는 중 홈을 누르면 쓰던 글 복귀');
    await sleep(1800); // 그사이 목록 도착
    ok(calls.length === 5 && !(await p.locator('#view').isVisible()) && (await activeId()) === '' && (await draftNow()) === '홈으로 간 글', '2ⓑ′ 늦게 온 목록이 인터뷰 대화로 끌고 가지 않음(홈 · 글 그대로)');
    lateMs = 400;

    // ⓑ″ 목록 방송이 끝내 오지 않음 → 8초 뒤 기다림을 접고 쓰던 글을 돌려준다(방송에 기대지 않는다)
    listOrder = 'never';
    await openOnto('방송 없는 글');
    await p.locator('#iv-card .iv-go').click(); await sleep(1500);
    ok(calls.length === 6 && (await draftNow()) === '', '2ⓑ″ 목록을 기다리는 동안은 보관한 채');
    await sleep(8000);
    ok((await draftNow()) === '방송 없는 글' && !(await p.locator('#view').isVisible()), '2ⓑ″ 목록이 끝내 안 와도 8초 뒤 쓰던 글 복귀(홈)');
    listOrder = 'before';

    // ⓑ‴ 입력창의 보내기가 답을 기다리는 동안에는 단추로 여는 대화를 시작하지 않는다(보내기는 답이 오면 입력창을 통째로 비운다)
    await openOnto();
    await p.locator('#iv-card .iv-go').click(); await sleep(1500); // 가짜 대화 하나를 열어 둔다
    ok(calls.length === 7 && (await activeId()) === 'iv-fake-7', '2ⓑ‴ 준비: 대화 하나 열림');
    await p.locator('#composer-text').fill('보내는 글'); await sleep(100);
    await p.locator('#btn-send').click(); await sleep(200); // 가로챈 보내기(0.9초 뒤 답)
    const during = await p.evaluate(() => window.QuickChat.start({ prompt: '겹친 요청' }));
    ok(during?.ok === false && during.reason === 'sending' && calls.length === 7, '2ⓑ‴ 보내는 중의 단추 = 시작하지 않음(sending)');
    await sleep(1200);
    ok(sends === 1 && (await draftNow()) === '', '2ⓑ‴ 보내기는 평소대로 끝남(1번 · 입력창 비움)');

    // ⓒ 고른 에이전트를 쓸 수 없음 — 계정이 전부 0(단추 쪽은 "모두 꺼졌으면 막지 않는다"라 켜져 보인다)
    acctMock = { accounts: { claude: 0, codex: 0 }, missing: [], sleeping: [] };
    await openOnto();
    const before = await selNow();
    if (before.agent === 'claude' || before.agent === 'codex') {
      await p.locator('#iv-card .iv-go').click(); await sleep(900);
      ok(calls.length === 7, '2ⓒ 쓸 수 없는 에이전트 = 새 대화 만들기 0번');
      ok(await p.locator('#iv-msg').isVisible() && /쓸 수 없습니다/.test(await p.locator('#iv-msg').textContent()), '2ⓒ 단추 아래 안내 한 줄');
      ok((await selNow()).agent === before.agent, '2ⓒ 다른 에이전트로 바꾸지 않음');
      ok(!(await p.locator('#settings').isHidden()) && await p.locator('#on-manual').evaluate((el) => el.open), '2ⓒ 설정 그대로 · 복사 영역 펼쳐짐');
    } else console.log('SKIP 2ⓒ: 고른 에이전트가 중계기 계정을 쓰지 않음');
    acctMock = null;

    // ⓓ 루트를 모름
    noRoot = true;
    await openOnto();
    await p.locator('#iv-card .iv-go').click(); await sleep(900);
    ok(calls.length === 7, '2ⓓ 루트를 모르면 새 대화 만들기 0번');
    ok(await p.locator('#iv-msg').isVisible() && /맨 위 폴더/.test(await p.locator('#iv-msg').textContent()), '2ⓓ 단추 아래 안내 한 줄');
    noRoot = false;

    // ⓔ 역할 있음
    fs.mkdirSync(path.join(soul, '_ontology'), { recursive: true });
    fs.writeFileSync(path.join(soul, '_ontology', 'graph.json'), JSON.stringify({ generated: '2026-11-10T00:00:00', nodes: { r1: { type: 'role', path: 'R01-교사(Teacher)', code: 'R01' }, d1: { type: 'domain', path: 'R01-교사(Teacher)\\D01-수업(Class)', code: 'D01' } }, edges: [] }));
    await openOnto();
    ok(!(await p.locator('#iv-card').count()), '2ⓔ 역할 있음 → 큰 카드 없음');
    ok(await p.locator('#on-iv').isVisible() && /폴더 인터뷰/.test(await p.locator('#on-iv .iv-go').textContent()), '2ⓔ 위 줄 작은 「폴더 인터뷰」 단추');
    ok((await copyVia()) === prompt, '2ⓔ 역할이 있어도 공통 복사 영역으로 같은 글 복사');
    if (process.env.IRIS_CAPTURE_DIR) await p.screenshot({ path: path.join(process.env.IRIS_CAPTURE_DIR, 'ontology-interview-roles.png') });
    const canPlan = (await selNow()).agent === 'claude' && await p.locator('#st-perm option[value="plan"]').count();
    if (canPlan) {
      await p.locator('#st-nav [data-pane="session"]').click(); await sleep(400);
      await p.locator('#st-perm').selectOption('plan'); await sleep(600);
      await p.locator('#st-nav [data-pane="ontology"]').click(); await sleep(800);
      ok(/계획만/.test(await p.locator('#on-iv .iv-go').getAttribute('title')), '2ⓔ 「계획만」 권한 = 작은 단추 설명에 미리 안내');
      await p.locator('#on-iv .iv-go').click(); await sleep(1500);
      ok(calls.length === 8 && calls[7].permission === 'plan' && samePath(calls[7].cwd, health.root) && calls[7].prompt === prompt, '2ⓔ 작은 단추도 루트 · 프롬프트 전문 · 고른 권한(계획만) 그대로');
      ok(await p.locator('#settings').isHidden(), '2ⓔ 설정 서랍 닫힘');
      fs.rmSync(path.join(soul, '_ontology', 'graph.json'));
      await openOnto();
      ok(await p.locator('#iv-hint').isVisible() && /계획만/.test(await p.locator('#iv-hint').textContent()), '2ⓔ 큰 카드에도 「계획만」 미리 안내 한 줄');
    } else console.log('SKIP 2ⓔ 계획만: 고른 에이전트가 클로드가 아니거나 권한 목록에 없음');
    // 코덱스의 「계획만」 = 샌드박스 「읽기 전용」
    try { fs.rmSync(path.join(soul, '_ontology', 'graph.json')); } catch {}
    await openOnto('', 'codex');
    if ((await selNow()).agent === 'codex' && await p.locator('#st-sandbox option[value="read-only"]').count()) {
      ok(!(await p.locator('#iv-hint').isVisible()), '2ⓔ 코덱스 · 평소 샌드박스 = 미리 안내 없음(클로드의 「계획만」 설정과 무관)');
      await p.locator('#st-nav [data-pane="session"]').click(); await sleep(400);
      if (await p.locator('#st-sandbox').isVisible()) {
        await p.locator('#st-sandbox').selectOption('read-only'); await sleep(600);
        await p.locator('#st-nav [data-pane="ontology"]').click(); await sleep(800);
        ok(await p.locator('#iv-hint').isVisible() && /읽기 전용/.test(await p.locator('#iv-hint').textContent()), '2ⓔ 코덱스 · 「읽기 전용」 = 미리 안내 한 줄');
      } else console.log('SKIP 2ⓔ 코덱스 읽기 전용: 샌드박스 칸이 보이지 않음');
    } else console.log('SKIP 2ⓔ 코덱스: 코덱스 단추를 쓸 수 없음');
    ok(!errs.length, `2 페이지 오류 없음${errs.length ? ': ' + errs.join(' | ') : ''}`);
  } finally {
    try { await browser?.close(); } catch {}
    try { d.kill(); } catch {}
    await sleep(500);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
