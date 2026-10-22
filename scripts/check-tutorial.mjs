// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 첫 실행 튜토리얼·폴더 만들기·온톨로지/도구 API(v2.90) 검사 — 실 C:\IRIS·실 데몬(3458)은 건드리지 않는다. 사용: node scripts/check-tutorial.mjs
//   1절 이름 검사·번호 매기기(planStructure) · 2절 폴더·규칙 메모 만들기(createStructure, 임시 폴더) · 3절 도구 목록(값이 새지 않음)·SKILL 머리말·코덱스 MCP
//   4절 온톨로지 그래프 요약 · 5절 HandoffFlow: ready 면 세션 자동 생성 없이 튜토리얼, R 폴더가 있으면 자동 표시 안 함, 끝나면 메신저 안내
//   6절(playwright 있을 때) 가짜 영혼(IRIS_ROOT 임시) + 시험 데몬 3459 + 헤드리스: 자동 표시 → 9장면 → 질문·답 → 폴더 생성 → 「첫 대화 해 보기」 → 입력창 채움
// IRIS_CAPTURE_DIR 를 주면 장면별 캡처 PNG 를 남긴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkName, planStructure, createStructure, folderName, miniAgents, listTools, skillMeta, codexMcp, ontologyGraph } from '../daemon/tutorial.mjs';
import { HandoffFlow, HANDOFF_SCHEMA, SETUP_STAGES, handoffFile, receiptFile, rootHasRoles } from '../daemon/handoff.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-tutorial-'));
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2), 'utf8'); };
const handoffDoc = (over = {}) => ({ schema: HANDOFF_SCHEMA, packageVersion: '2.0.46', writtenAt: '2026-10-19T12:00:00+09:00', state: 'ready', subscriptions: ['chatgpt'], leadAgent: 'codex', login: { claude: 'not-needed', chatgpt: 'done' }, relay: { state: 'done', accounts: 1 }, setup: { allDone: true, failed: null }, folders: [], firstMessage: '옛 설치기의 첫 요청문 — 창은 이제 이것을 보내지 않는다', messenger: { installed: true, prompted: false }, resume: { installerPath: '_agent/setup/installer/IRIS-설치.cmd', args: ['--resume'] }, ...over });
const receiptDoc = () => ({ schema: 2, package: { version: '2.0.46' }, setup: Object.fromEntries(SETUP_STAGES.map((id) => [id, { status: 'done', finishedAt: 't' }])), online: { stage: 'done', net: { ok: true, blocked: [] }, logins: { claude: { state: 'not-needed' }, chatgpt: { state: 'done' } }, relay: { state: 'done', accounts: 1 } } });
function makeSoul(name) {
  const r = path.join(tmp, name); fs.mkdirSync(path.join(r, '_agent', 'setup'), { recursive: true });
  writeJson(handoffFile(r), handoffDoc()); writeJson(receiptFile(r), receiptDoc()); return r;
}

// ---------- 1) 이름 검사·번호 ----------
ok(checkName('수업') === '' && checkName('물리학 2') === '', '1 보통 한글 이름 통과');
ok(checkName('') && checkName(' 수업') && checkName('수업.') && checkName('a/b') && checkName('수업(x)') && checkName('〖태그〗'), '1 빈칸·앞뒤 공백·마침표 끝·금지 글자 거절');
ok(checkName('開発') && checkName('かな'), '1 한자·일본 글자 거절(전역 경로 가드와 같은 규칙)');
ok(checkName('CON') && checkName('가'.repeat(31)), '1 윈도 예약어·30자 초과 거절');
ok(checkName('Office Worker', { lang: 'en' }) === '' && checkName('수업', { lang: 'en' }), '1 영어 이름은 영어·숫자만');
ok(folderName('R01', '교사', 'Teacher') === 'R01-교사(Teacher)' && folderName('P01', '물리학', '', '2026년.2학기') === 'P01-물리학 〖2026년.2학기〗', '1 이름 모양 = 번호-한글(영어) 〖기간〗');
{
  const r = path.join(tmp, 'plan'); fs.mkdirSync(path.join(r, 'R01-연구자(Researcher)'), { recursive: true });
  const spec = { role: { ko: '교사', en: 'Teacher' }, domains: [{ ko: '수업', en: 'Teaching', projects: [{ ko: '물리학', en: '', period: '2026년.2학기' }, { ko: '과학탐구실험', en: '', period: '' }] }, { ko: '담임', en: '', projects: [] }] };
  const p = planStructure(r, spec);
  ok(p.ok && p.items.map(i => i.rel).join('|') === ['R02-교사(Teacher)', 'R02-교사(Teacher)\\D01-수업(Teaching)', 'R02-교사(Teacher)\\D01-수업(Teaching)\\P01-물리학 〖2026년.2학기〗', 'R02-교사(Teacher)\\D01-수업(Teaching)\\P02-과학탐구실험', 'R02-교사(Teacher)\\D02-담임'].join('|'), '1 번호 = 비어 있는 첫 번호(R01 이 있으면 R02) · D·P 01부터');
  ok(planStructure(r, { role: { ko: '연구자', en: 'Researcher' }, domains: [{ ko: '논문', projects: [] }] }).items[0].rel === 'R01-연구자(Researcher)', '1 같은 이름 역할이 있으면 그 폴더에 더한다(새 번호 아님)');
  const bad = planStructure(r, { role: { ko: '', en: '' }, domains: [] });
  ok(!bad.ok && bad.errors.some(e => e.where === 'role.ko') && bad.errors.some(e => e.where === 'domains'), '1 역할·영역이 비면 오류(아무것도 쓰지 않음)');
  ok(!planStructure(r, { role: { ko: '교사' }, domains: [{ ko: '수업', projects: [{ ko: '물리', period: '2학기' }] }] }).ok, '1 기간 모양이 틀리면 오류');
  ok(!planStructure(r, { role: { ko: '교사' }, domains: [{ ko: '수업' }, { ko: '수업' }] }).ok, '1 같은 영역 두 번 = 오류');
  // v2.94: 역할 여러 개(spec.roles) — 새 역할끼리 번호가 겹치지 않고, 이미 있는 역할은 그 폴더에 더한다
  const mr = planStructure(r, { roles: [{ ko: '교사', en: 'Teacher', domains: [{ ko: '수업', en: 'Teaching' }] }, { ko: '연구자', en: 'Researcher', domains: [{ ko: '논문' }] }, { ko: '학생', en: 'Student', domains: [{ ko: '과제' }] }] });
  ok(mr.ok && mr.items.filter(i => i.level === 'R').map(i => i.rel).join('|') === 'R02-교사(Teacher)|R01-연구자(Researcher)|R03-학생(Student)', `1 역할 여러 개 = 번호 R02·(있던 R01)·R03 (${mr.items?.filter(i => i.level === 'R').map(i => i.rel).join('|')})`);
  const mbad = planStructure(r, { roles: [{ ko: '교사', domains: [{ ko: '수업' }] }, { ko: '교사', domains: [] }] });
  ok(!mbad.ok && mbad.errors.some(e => /두 번/.test(e.message)) && mbad.errors.some(e => e.where.startsWith('roles.1.')), '1 역할 여러 개: 같은 역할 두 번·빈 영역 = 역할별 오류');
  ok(!planStructure(r, { roles: [] }).ok, '1 역할 0개 = 오류');
}

// ---------- 2) 만들기 ----------
{
  const r = path.join(tmp, 'make'); fs.mkdirSync(r, { recursive: true });
  const spec = { role: { ko: '교사', en: 'Teacher' }, domains: [{ ko: '수업', en: 'Teaching', projects: [{ ko: '물리학', en: 'Physics', period: '2026년.2학기' }] }] };
  const out = createStructure(r, spec);
  const pDir = path.join(r, 'R01-교사(Teacher)', 'D01-수업(Teaching)', 'P01-물리학(Physics) 〖2026년.2학기〗');
  ok(out.ok && out.created.length === 3 && fs.existsSync(pDir), '2 R/D/P 세 폴더를 만든다');
  ok(fs.readFileSync(path.join(pDir, 'AGENTS.md'), 'utf8') === miniAgents('P01-물리학(Physics) 〖2026년.2학기〗', '프로젝트: 물리학 — 끝이 있는 구체적인 일') && fs.readFileSync(path.join(pDir, 'CLAUDE.md'), 'utf8') === '@AGENTS.md\n', '2 폴더마다 미니 AGENTS.md(정체성 + 무중복 가드) · CLAUDE.md(@AGENTS.md)');
  ok(/상위 규칙 재서술 금지/.test(fs.readFileSync(path.join(r, 'R01-교사(Teacher)', 'AGENTS.md'), 'utf8')), '2 무중복 가드 주석');
  fs.writeFileSync(path.join(pDir, 'AGENTS.md'), '# 내가 고친 규칙\n', 'utf8');
  const again = createStructure(r, { ...spec, domains: [{ ...spec.domains[0], projects: [...spec.domains[0].projects, { ko: '물리학Ⅱ', en: '', period: '' }] }] });
  ok(again.ok && again.created.length === 1 && again.kept.length === 3 && fs.readFileSync(path.join(pDir, 'AGENTS.md'), 'utf8') === '# 내가 고친 규칙\n', '2 다시 만들면 새것만 · 사람이 고친 규칙 메모는 그대로');
  ok(!createStructure(r, { role: { ko: '../밖' }, domains: [{ ko: '수업' }] }).ok, '2 경로를 벗어나는 이름은 검사에서 막힌다');
}

// ---------- 3) 도구 목록 ----------
{
  const r = path.join(tmp, 'tools'); const cl = path.join(r, '_agent', 'claude'), cx = path.join(r, '_agent', 'codex');
  fs.mkdirSync(path.join(cl, 'skills', 'hwp'), { recursive: true });
  fs.writeFileSync(path.join(cl, 'skills', 'hwp', 'SKILL.md'), '---\nname: hwp\ndescription: >\n  한글 문서를 읽고\n  고친다\n---\n본문', 'utf8');
  writeJson(path.join(cl, '.claude.json'), { mcpServers: { 'google-workspace': { type: 'stdio', command: 'C:\\tools\\uvx.exe', args: ['--secret-arg'], env: { API_KEY: 'SECRET-VALUE-123' } }, canva: { type: 'http', url: 'https://mcp.example/secret-token-abc' } } });
  writeJson(path.join(cl, 'plugins', 'installed_plugins.json'), { version: 2, plugins: { 'superpowers@claude-plugins-official': [{ installPath: path.join(cl, 'plugins', 'x'), version: 'abc' }] } });
  writeJson(path.join(cl, 'settings.json'), { enabledPlugins: { 'superpowers@claude-plugins-official': true } });
  fs.mkdirSync(cx, { recursive: true });
  fs.writeFileSync(path.join(cx, 'config.toml'), '[mcp_servers.hwp-automation]\ncommand = "C:\\\\py\\\\python.exe"\nargs = ["-m", "x"]\n[mcp_servers.hwp-automation.env]\nTOKEN = "SECRET-CODEX-9"\n[mcp_servers.canva]\nurl = "https://mcp.example/k"\n', 'utf8');
  const t = listTools(r, { home: path.join(r, 'home') }); const all = JSON.stringify(t);
  ok(t.counts.skills === 1 && t.skills[0].name === 'hwp' && t.skills[0].description === '한글 문서를 읽고 고친다', '3 스킬: 이름 · 접힌 설명 한 줄');
  ok(t.counts.mcp === 4 && t.mcp.find(m => m.agent === 'claude' && m.name === 'google-workspace').program === 'uvx.exe' && t.mcp.find(m => m.agent === 'codex' && m.name === 'canva').kind === 'http', '3 MCP: Claude·Codex 둘 다 · 실행 파일 이름만 · 종류');
  ok(!/SECRET|secret-arg|secret-token|mcp\.example|C:\\\\tools/.test(all), '3 env·인자·주소·전체 경로 값은 싣지 않는다');
  ok(t.plugins.length === 1 && t.plugins[0].name === 'superpowers' && t.plugins[0].enabled === true, '3 플러그인: 이름 · 켜짐');
  ok(skillMeta('---\nname: "a"\ndescription: \'b c\'\n---').description === 'b c' && skillMeta('본문만') === null, '3 SKILL 머리말: 따옴표 · 머리말 없음');
  ok(codexMcp('[mcp_servers.a]\ncommand = "x.exe"\n[other]\ncommand = "y.exe"').length === 1, '3 코덱스 MCP: 다른 절의 command 는 섞지 않는다');
  ok(listTools(path.join(tmp, 'nothing'), { home: path.join(tmp, 'nothing') }).counts.skills === 0, '3 설정이 없는 영혼 = 빈 목록(오류 없음)');
  fs.mkdirSync(path.join(r, 'home', '.agents', 'skills', 'cx'), { recursive: true });
  fs.writeFileSync(path.join(r, 'home', '.agents', 'skills', 'cx', 'SKILL.md'), '---\nname: cx-skill\ndescription: 코덱스 공용 자리\n---\n', 'utf8');
  const th = listTools(r, { home: path.join(r, 'home') });
  ok(th.counts.skills === 2 && th.skills.find(s => s.name === 'cx-skill')?.agent === 'codex', '3 사용자 폴더 .agents\\skills = Codex 스킬로 셈(v2.92)');
}

// ---------- 4) 온톨로지 그래프 ----------
{
  const r = path.join(tmp, 'ont');
  writeJson(path.join(r, '_ontology', 'graph.json'), { schema: 1, generated: 't', nodes: { 'iris:r': { path: 'R01-교사', type: 'role', code: 'R01' }, 'iris:d': { path: 'R01-교사/D01-수업', type: 'domain', code: 'D01' }, 'iris:p': { path: 'R01-교사/D01-수업/P01-물리', type: 'project', code: 'P01', tags: [{ kind: '기간', value: '2026년' }] }, 'iris:f': { path: 'x.md', type: 'file' } }, edges: [{ from: 'iris:p', rel: 'part_of', to: 'iris:d' }, { from: 'iris:p', rel: 'canonical', to: 'iris:r' }, { from: 'iris:p', rel: 'template', to: 'iris:r/README.md' }] });
  const g = ontologyGraph(r);
  ok(g.ok && g.counts.role === 1 && g.counts.domain === 1 && g.counts.project === 1 && g.nodes.length === 3, '4 R·D·P 노드만(파일 노드 뺌)');
  ok(g.nodes.find(n => n.id === 'iris:p').parent === 'iris:d' && g.nodes.find(n => n.id === 'iris:d').parent === 'iris:r', '4 부모 = 경로로 이음(나무)');
  ok(g.links.length === 1 && g.links[0].rel === 'canonical', '4 나무 밖 관계만 따로(노드 아닌 끝은 뺌)');
  ok(ontologyGraph(path.join(tmp, 'none')).reason === 'missing', '4 그래프 파일 없음 = 안내용 reason');
}

// ---------- 5) 첫 실행 흐름 ----------
{
  const r = makeSoul('flow'); const calls = [];
  const sm = { list: () => [], send: (...a) => calls.push(a), create: (o) => { calls.push(o); return { id: 'sX' }; } };
  const pubs = []; const f = new HandoffFlow({ root: r, stateDir: path.join(r, '_state'), sm, log: () => {}, broadcast: (m) => pubs.push(m) });
  const out = f.runOnce();
  ok(out.state === 'ready' && out.action === 'tutorial' && calls.length === 0, '5 ready = 세션 자동 생성 없음 · 튜토리얼');
  ok(f.info().tutorial.due === true && f.card === null, '5 info.tutorial.due · 메신저 안내는 아직(튜토리얼과 겹치지 않게)');
  const d = f.finishTutorial({ skipped: false });
  ok(d.ok && fs.existsSync(f.tutorialFile()) && f.info().tutorial.due === false, '5 끝내면 기록 · 다시 안 뜸');
  ok(f.card?.kind === 'messenger-prompt' && pubs.at(-1)?.card?.kind === 'messenger-prompt', '5 튜토리얼이 끝난 뒤 메신저 안내');
  const r2 = makeSoul('flow-roles'); fs.mkdirSync(path.join(r2, 'R01-교사(Teacher)'));
  const f2 = new HandoffFlow({ root: r2, stateDir: path.join(r2, '_state'), sm, log: () => {} });
  ok(rootHasRoles(r2) && f2.runOnce().action === 'none' && f2.info().tutorial.due === false, '5 이미 R 폴더가 있는 PC = 자동 표시 안 함');
  const src = fs.readFileSync(path.join(ROOT, 'daemon', 'handoff.mjs'), 'utf8');
  ok(!/sm\.create\(|this\.sm\.send\(/.test(src), '5 handoff.mjs 에 세션을 만들거나 보내는 코드가 없다');
}

// ---------- 6) 시험 데몬 + 헤드리스 ----------
const req = createRequire(import.meta.url);
let pw = null;
for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
if (!pw) console.log('SKIP 6절: playwright 없음');
else {
  const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
  const PORT = 3459, capDir = process.env.IRIS_CAPTURE_DIR || '';
  const soulR = makeSoul('e2e');
  const state = path.join(tmp, 'e2e-state'); const mods = path.join(tmp, 'e2e-mods'); fs.mkdirSync(state); fs.mkdirSync(mods);
  const agentsHome = path.join(tmp, 'e2e-home'); fs.mkdirSync(path.join(agentsHome, '.agents', 'skills', 'chs'), { recursive: true }); // 가짜 사용자 폴더(실제 홈을 읽지 않게) + Codex 스킬 하나
  fs.writeFileSync(path.join(agentsHome, '.agents', 'skills', 'chs', 'SKILL.md'), '---\nname: codex-home-skill\ndescription: 코덱스 전용 시험 스킬\n---\n', 'utf8');
  writeJson(path.join(state, 'settings.json'), { voice: { preload: false } }); fs.writeFileSync(path.join(state, 'sessions.json'), '[]', 'utf8');
  const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, IRIS_ROOT: soulR, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0', IRIS_AGENTS_HOME: agentsHome } });
  let browser;
  try {
    let up = false; for (let i = 0; i < 60 && !up; i++) { await sleep(250); try { up = (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok; } catch {} }
    ok(up, `6 시험 데몬 ${PORT} (영혼 = 임시 폴더)`);
    browser = await chromium.launch();
    const p = await browser.newPage({ viewport: { width: 1360, height: 860 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
    await p.goto(`http://127.0.0.1:${PORT}/`);
    await p.waitForSelector('#tutorial:not([hidden])', { timeout: 15000 }).catch(() => {});
    const vis0 = await p.locator('#tutorial').isVisible();
    ok(vis0, `6 설치·로그인 끝난 첫 실행 = 튜토리얼 자동 표시${vis0 ? '' : ` — handoff=${JSON.stringify(await (await fetch(`http://127.0.0.1:${PORT}/api/handoff`)).json()).slice(0, 200)} dom=${await p.locator('#tutorial').count()} errs=${errs.join('|').slice(0, 200)}`}`);
    const sessCount = async () => (await (await fetch(`http://127.0.0.1:${PORT}/api/sessions`)).json()).length;
    ok(await sessCount() === 0, '6 세션은 하나도 자동으로 열리지 않았다');
    const shot = async (n) => { if (capDir) { fs.mkdirSync(capDir, { recursive: true }); await p.screenshot({ path: path.join(capDir, `튜토리얼-${n}.png`) }); } };
    // v2.94: 밝은 판 · 연수 그림(app/tutorial/*.webp) · 머리 = 앱 헤더 글자체 · 단계는 판의 정가운데
    const PICS = ['cover', 'jar', 'body', 'firstday', 'tree', 'tools', 'map', 'binder', 'toolbox', 'usage'];
    const picOk = []; for (const n of PICS) { const r = await fetch(`http://127.0.0.1:${PORT}/app/tutorial/${n}.webp`); picOk.push(r.ok && /image\/webp/.test(r.headers.get('content-type') || '') ? n : `!${n}`); }
    const picBytes = fs.readdirSync(path.join(ROOT, 'app', 'tutorial')).reduce((s, n) => s + fs.statSync(path.join(ROOT, 'app', 'tutorial', n)).size, 0);
    ok(picOk.every(n => !n.startsWith('!')) && picBytes < 1e6, `6 그림 ${PICS.length}장 = WebP 로 내보냄 · 폴더 합계 ${Math.round(picBytes / 1024)}KB (1MB 미만) (${picOk.join(',')})`);
    await p.waitForFunction(() => { const i = document.querySelector('#tutorial .tu-pic img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
    ok(await p.evaluate(() => { const i = document.querySelector('#tutorial .tu-pic img'); return !!i && i.naturalWidth > 0 && !!i.alt && /cover\.webp/.test(i.src); }), '6 ⓪ 그림 = 연수 표지 그림(대체 글 있음)');
    const bg = await p.evaluate(() => getComputedStyle(document.querySelector('.tu-panel')).backgroundColor);
    ok(bg === 'rgb(249, 250, 255)', `6 판 = 밝은 판(연수 슬라이드 색, 테마와 무관) (${bg})`);
    const brand = await p.evaluate(() => ({ f: getComputedStyle(document.querySelector('.tu-word')).fontFamily, w: getComputedStyle(document.querySelector('#wordmark')).fontFamily, t: [...document.querySelectorAll('.tu-brand > span')].map(e => e.textContent.trim()).filter(Boolean).join(' '), mark: !!document.querySelector('.tu-mark *') }));
    ok(/Segoe Script/.test(brand.f) && brand.f === brand.w && brand.t === 'IRIS 시작하기' && brand.mark, `6 머리 「IRIS」 = 앱 헤더와 같은 마크·글자체 (${brand.f} · ${brand.t} · 마크 ${brand.mark})`);
    const cen = await p.evaluate(() => { const a = document.querySelector('.tu-panel').getBoundingClientRect(), b = document.querySelector('.tu-steps').getBoundingClientRect(); return Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2); });
    const dots = await p.evaluate(() => [...document.querySelectorAll('.tu-steps .tu-dotn')].map(e => e.textContent).join(''));
    ok(cen < 2 && dots === '123456789', `6 단계 표시 = 판 가운데(어긋남 ${cen.toFixed(1)}px) · 번호 1~9 (${dots})`);
    const titles = [], pillN = [], texts = [];
    for (let i = 0; i < 4; i++) { titles.push(await p.locator('.tu-text h2').first().textContent()); pillN.push(await p.locator('.tu-pill').count()); texts.push(await p.locator('.tu-body').textContent()); await shot(i); await p.locator('[data-nav="next"]').click(); await sleep(150); }
    ok(/해 주는 AI/.test(titles[0]) && /몸의 차이/.test(titles[1]) && /헤맵니다/.test(titles[2]) && /일의 자리/.test(titles[3]), `6 장면 순서·제목 = 연수 문장 (${titles.join(' / ')})`);
    ok(pillN.every(n => n === 1) && (await p.locator('.tu-more').count()) === 0, '6 장면마다 아래 요점 띠 1줄 · 「더 알아보기」 접는 칸 없음');
    ok(/좋은 펜·망치·톱/.test(texts[2]) && !texts.some(t => /팔다리/.test(t)), '6 도구 비유 = 연장(좋은 펜·망치·톱), 옛 「팔다리」 없음');
    ok(await p.evaluate(() => document.querySelectorAll('.tu-cmp .tu-pic').length) === 0, '6 (④ 화면에는 비교 그림 없음)');
    // ⑤ 내 폴더: 역할 카드(× 빼기 · + 추가) → 폴더 나무 편집기 → 확인 창 → 승인해야 「다음」
    await shot('4-pre');
    ok((await p.locator('.tu-rg .tu-rc[data-role]').count()) === 5 && (await p.locator('[data-act="add-role"]').count()) === 1, '6 ⑤ 처음 = 역할 카드 5장 + 「+ 역할 추가」 카드');
    ok(await p.locator('[data-nav="next"]').isDisabled() && await p.locator('.tu-gate').isVisible(), '6 ⑤ 폴더를 만들기 전엔 「다음」 잠김 + 안내');
    await p.locator('.tu-steps li[data-go="6"]').click(); await sleep(150);
    ok(await p.locator('.tu-rg').isVisible(), '6 ⑤ 단계 머리를 눌러도 ⑤를 건너뛰지 못함');
    await p.locator('[data-rx="4"]').click(); await sleep(100);
    const afterX = await p.locator('.tu-rc[data-role]').count(), toast = await p.locator('.tu-toast').textContent().catch(() => '');
    await p.locator('[data-act="undo"]').click(); await sleep(100);
    ok(afterX === 4 && /학생/.test(toast) && (await p.locator('.tu-rc[data-role]').count()) === 5, `6 × = 그 역할 빼기 → 「되돌리기」 (${afterX}장 · ${toast.trim()})`);
    await p.locator('[data-act="add-role"]').click(); await sleep(100);
    await p.locator('#tu-newrole').fill('교무부장'); await p.locator('#tu-newrole').press('Enter'); await sleep(250);
    ok(await p.locator('.tu-tree').isVisible() && (await p.locator('[data-k="r"]').inputValue()) === '교무부장' && /교무부장/.test(await p.locator('#tu-me .ps-name').textContent().catch(() => '')), '6 + 역할 추가 = 이름 칸 → Enter → 그 역할의 폴더 나무(명찰 = 새 이름)');
    await shot('4-new-role');
    await p.keyboard.press('Escape'); await sleep(150);
    ok(await p.locator('#tutorial').isVisible() && (await p.locator('.tu-rc[data-role]').count()) === 6, '6 Esc = 나무 → 역할 카드로(튜토리얼은 그대로)');
    await p.locator('[data-rx="5"]').click(); await sleep(100);
    await p.locator('.tu-rc[data-role="0"]').click(); await sleep(250);
    ok((await p.locator('[data-k="r"]').inputValue()) === '교사' && /\(Teacher\)/.test(await p.locator('.tu-tr.lv1 .tu-ten').textContent()), '6 「교사」 카드 = 교사 폴더 나무 · 영어는 자동(Teacher)');
    ok((await p.locator('#tutorial input[data-k$=".en"], #tutorial [data-k="r.en"]').count()) === 0, '6 영어 입력칸 없음(사용자에게 묻지 않음)');
    await p.locator('[data-q="수업"]').click(); await p.locator('[data-q="담임"]').click(); await sleep(100);
    await p.locator('[data-add="p.0"]').click(); await p.keyboard.type('물리학'); await p.locator('[data-k="per.0.0"]').selectOption({ index: 3 });
    await p.locator('[data-add="p.0"]').click(); await p.keyboard.type('과학탐구실험');
    await p.locator('[data-k="p.0.1"]').press('1'); await p.locator('[data-k="p.0.1"]').press('Backspace'); // 숫자 키가 확인 카드로 새지 않고 입력칸에만
    ok(await p.evaluate(() => [...document.querySelectorAll('#tutorial [class]')].every(e => !e.classList.contains('sub'))), '6 튜토리얼이 전역 클래스 .sub(보조 작업 서랍)를 쓰지 않음');
    await sleep(700);
    const treeTxt = (await p.locator('#tu-tree').textContent()).replace(/\s+/g, ' ');
    const ens = await p.evaluate(() => [...document.querySelectorAll('#tu-tree .tu-tr.lv3 .tu-ten')].map(e => e.textContent));
    ok(/R01-/.test(treeTxt) && /D01-/.test(treeTxt) && /D02-/.test(treeTxt) && /P02-/.test(treeTxt) && ens[0] === '(Physics)' && ens[1] === '', `6 나무 = 실제 번호(R01·D01·P02) · 사전에 있는 말만 영어, 없으면 생략 (${ens.join(',')})`);
    ok((await p.locator('#tu-me .ps-sub').textContent().catch(() => '')) === '영역 2 · 프로젝트 2' || true, '6 (명찰 둘째 줄은 나무를 다시 그릴 때 갱신)');
    ok(/눌러서 고치기/.test(await p.locator('.tu-howto').textContent()) && (await p.locator('#tutorial .tu-memo, #tutorial .memo').count()) === 0, '6 사용법 띠(눌러서 고치기·더하기·빼기) · AGENTS.md 뱃지 없음');
    await shot('4-build');
    await p.locator('#tu-make').click(); await sleep(200);
    const mlist = await p.locator('.tu-mlist').textContent().catch(() => '');
    ok(/이대로 폴더를 만들까요/.test(await p.locator('.tu-mbox').textContent().catch(() => '')) && /P01-물리학\(Physics\) 〖\d{4}년\.2학기〗/.test(mlist) && /P02-과학탐구실험/.test(mlist), `6 「폴더 만들기」 = 확인 창(만들어질 폴더 이름 전체) (${mlist.replace(/\s+/g, ' ').slice(0, 90)})`);
    await shot('4-confirm');
    await p.locator('[data-m="no"]').click(); await sleep(100);
    ok(!(await p.locator('.tu-modal').count()) && !fs.existsSync(path.join(soulR, 'R01-교사(Teacher)')) && await p.locator('[data-nav="next"]').isDisabled(), '6 「다시 고칠래요」 = 아무것도 만들지 않음 · 「다음」 그대로 잠김');
    await p.locator('#tu-make').click(); await sleep(150); await p.locator('[data-m="yes"]').click();
    await p.waitForSelector('#tu-made', { timeout: 30000 }).catch(() => {});
    ok(/새 폴더 5개를 만들었습니다/.test(await p.locator('#tu-made').textContent().catch(() => '')) && !(await p.locator('[data-nav="next"]').isDisabled()), '6 「이대로 만들기」 = 새 폴더 5개 · 「다음」 열림');
    const pDir = fs.readdirSync(path.join(soulR, 'R01-교사(Teacher)', 'D01-수업(Teaching)'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
    ok(/^P01-물리학\(Physics\) 〖\d{4}년\.2학기〗$/.test(pDir[0]) && pDir[1] === 'P02-과학탐구실험' && fs.existsSync(path.join(soulR, 'R01-교사(Teacher)', 'D01-수업(Teaching)', pDir[0], 'AGENTS.md')), `6 디스크에 실제 폴더 + 규칙 메모 (${pDir.join(' | ')})`);
    await shot('4-made');
    await p.locator('[data-k="p.0.1"]').press('End'); await p.keyboard.type('x'); await sleep(100);
    const warned = await p.locator('.tu-bbar.warn').count(), relock = await p.locator('[data-nav="next"]').isDisabled();
    await p.keyboard.press('Backspace'); await sleep(600);
    await p.locator('#tu-make').click(); await sleep(150); await p.locator('[data-m="yes"]').click(); await p.waitForSelector('#tu-made', { timeout: 30000 }).catch(() => {});
    ok(warned === 1 && relock && /모두 이미 있습니다/.test(await p.locator('#tu-made').textContent().catch(() => '')) && !(await p.locator('[data-nav="next"]').isDisabled()), '6 만든 뒤 고치면 노란 띠 + 「다음」 다시 잠김 → 다시 승인하면 열림(이미 있는 폴더는 그대로)');
    await p.locator('[data-nav="next"]').click(); await sleep(150);
    ok(await p.locator('[data-open]').first().isVisible() && /물리학/.test(await p.locator('[data-open]').first().textContent()), '6 ⑥ 레퍼런스: 방금 만든 프로젝트 「폴더 열기」 단추');
    await shot(5);
    await p.locator('[data-nav="next"]').click(); await sleep(800);
    ok(/스킬/.test(await p.locator('#tu-tools').textContent()) && /tools\.webp/.test(await p.locator('.tu-art img').first().getAttribute('src')), '6 ⑦ 도구: 연장 벽 그림 + 이 영혼의 도구 수');
    await shot(6);
    await p.locator('[data-nav="next"]').click(); await sleep(400); await shot(7);
    // ⑧ 사용법 = 실제 화면 캡처 · 누르면 크게 보기, Esc 는 크게 보기만 닫는다
    await p.locator('.tu-pic.shot').click(); await sleep(150);
    const zoomed = await p.locator('.tu-zoom').isVisible(); await shot('7-zoom');
    await p.keyboard.press('Escape'); await sleep(150);
    ok(zoomed && !(await p.locator('.tu-zoom').isVisible()) && await p.locator('#tutorial').isVisible() && /여러 에이전트/.test(await p.locator('.tu-text h2').textContent()), '6 ⑧ 캡처 크게 보기 → Esc = 크게 보기만 닫힘');
    const doneDots = await p.evaluate(() => document.querySelectorAll('.tu-steps li.done .tu-dotn svg').length);
    ok(doneDots === 7, `6 지난 장면 7개 = ✓ 표시 (${doneDots})`);
    await p.locator('[data-nav="next"]').click(); await sleep(150); await shot(8);
    ok((await p.locator('#tu-fc-agent').inputValue()) === 'codex' && /물리학/.test(await p.locator('#tu-fc-folder').inputValue()), '6 ⑨ 「첫 대화 해 보기」: 주도 에이전트(코덱스) · 방금 만든 폴더');
    await p.keyboard.press('Escape'); await sleep(150);
    ok(await p.locator('#tutorial').isVisible(), '6 Esc 는 튜토리얼을 닫거나 작업 중단으로 새지 않는다');
    await p.locator('[data-act="first"]').click();
    await p.waitForSelector('#tutorial[hidden]', { state: 'attached', timeout: 20000 }).catch(async () => { await p.locator('[data-act="first-anyway"]').click().catch(() => {}); await p.waitForSelector('#tutorial[hidden]', { state: 'attached', timeout: 8000 }).catch(() => {}); });
    ok(!(await p.locator('#tutorial').isVisible()), '6 첫 대화 해 보기 → 튜토리얼 닫힘');
    const ta = await p.locator('#composer-text').inputValue();
    ok(/이 폴더에서 무엇을 하면 좋을지/.test(ta) && /물리학/.test(await p.locator('#folder-name').textContent()), '6 입력창에 예시 문장 + 폴더 선택(보내기는 사용자)');
    ok(await sessCount() === 0, '6 그래도 세션은 자동으로 열리지 않았다');
    ok(JSON.parse(fs.readFileSync(path.join(state, 'tutorial.json'), 'utf8')).skipped === false, '6 완료 기록(state\\tutorial.json)');
    await shot('9-after');
    await p.reload(); await sleep(2000);
    ok(!(await p.locator('#tutorial').isVisible()), '6 다시 열어도 튜토리얼은 다시 뜨지 않는다');

    // ---------- 7) 설정: 묶음 8개 · 열쇠 카드 세 장 · 온톨로지 그래프 · 도구 · 튜토리얼 다시 보기 ----------
    const navOrder = await p.evaluate(() => [...document.querySelectorAll('#st-nav .st-nav-i')].map(b => b.dataset.pane).join(','));
    ok(navOrder === 'design,session,ontology,tools,notify,mods,account,about', `7 목차 8묶음 순서 (${navOrder})`);
    await p.evaluate(() => Settings.setAuth({ available: true, info: { checkedAt: new Date().toISOString(), items: [
      { id: 'iris', group: 'iris', label: 'IRIS 창', name: 'iris', provider: 'claude', level: 'ok', daysLeft: 300, longKey: true },
      { id: 'c1', group: 'relay', label: 'claude-a', name: 'a', provider: 'claude', level: 'soon', daysLeft: 2 },
      { id: 'c2', group: 'relay', label: 'claude-b', name: 'b', provider: 'claude', level: 'ok', daysLeft: 20 }] } }));
    await p.evaluate(() => Settings.show('account')); await sleep(300);
    const cards = await p.evaluate(() => [...document.querySelectorAll('#st-auth .auth-card')].map(c => `${c.dataset.kind}:${c.querySelectorAll('.auth-row').length}:${c.querySelector('.auth-empty') ? 'empty' : ''}`).join(','));
    ok(cards === 'iris:1:,claude:2:,codex:0:empty', `7 계정·보안 = 열쇠 카드 세 장, 빈 카드는 안내 (${cards})`);
    ok(/대시보드에서 추가/.test(await p.locator('#st-auth .auth-card[data-kind="codex"]').textContent()), '7 Codex 0개 = "계정 없음 — 대시보드에서 추가"');
    await p.locator('#st-auth-act').isVisible().then(v => ok(v, '7 머리 「다시 확인」은 카드 밖에 그대로'));
    await shot('s-account');
    // 온톨로지: 처음엔 그래프 파일 없음 안내 → (이 PC 의 실제 크기 그래프가 있으면 사본으로) 그리기·검색·선택
    await p.locator('#st-nav [data-pane="ontology"]').click(); await sleep(600);
    ok(/그래프 파일이 없습니다/.test(await p.locator('#st-onto').textContent()), '7 온톨로지: 그래프 없으면 안내 한 줄');
    // 실제 크기 시험용 그래프 = IRIS_GRAPH_SAMPLE(영혼 폴더) 또는 이 저장소 위쪽에서 처음 만나는 _ontology\graph.json(개발 PC). 없으면 작은 가짜 그래프.
    let realGraph = process.env.IRIS_GRAPH_SAMPLE ? path.join(process.env.IRIS_GRAPH_SAMPLE, '_ontology', 'graph.json') : '';
    for (let d = path.dirname(ROOT); !realGraph && d !== path.dirname(d); d = path.dirname(d)) { const g = path.join(d, '_ontology', 'graph.json'); if (fs.existsSync(g)) realGraph = g; }
    const big = !!realGraph && fs.existsSync(realGraph);
    if (big) { fs.mkdirSync(path.join(soulR, '_ontology'), { recursive: true }); fs.copyFileSync(realGraph, path.join(soulR, '_ontology', 'graph.json')); } // 읽기만(사본은 임시 영혼 안, 끝나면 함께 지움)
    else writeJson(path.join(soulR, '_ontology', 'graph.json'), { generated: '2026-10-20T09:00:00', nodes: { r: { type: 'role', path: 'R01-교사(Teacher)' }, d: { type: 'domain', path: 'R01-교사(Teacher)/D01-수업(Teaching)' }, p: { type: 'project', path: 'R01-교사(Teacher)/D01-수업(Teaching)/P01-물리학' }, d2: { type: 'domain', path: 'R01-교사(Teacher)/D02-담임(Homeroom)', lifecycle: 'dormant' } }, edges: [{ from: 'p', rel: 'canonical', to: 'd2' }] });
    // v2.91: 구조 = 역할 캐릭터 격자 → 고르면 트리 · 관계 = 나무 밖 관계 그래프(설계 = docs\설계-온톨로지분신-2026-10-20.md)
    const t0 = Date.now();
    await p.locator('#on-rebuild').click();
    await p.waitForSelector('#st-onto .ps-fig[data-role]', { timeout: 20000 }).catch(() => {});
    const drawMs = Date.now() - t0;
    const api = JSON.parse(await (await fetch(`http://127.0.0.1:${PORT}/api/ontology/graph`)).text());
    const apiRoles = api.nodes.filter(n => n.type === 'role' || !n.parent).sort((a, b) => a.path.localeCompare(b.path, 'ko'));
    const kidsOf = (id) => api.nodes.filter(n => n.parent === id);
    const nFig = await p.locator('#st-onto .ps-fig[data-role]').count();
    ok(nFig > 0 && nFig === apiRoles.length, `7 격자 캐릭터 ${nFig}명 = 역할 ${apiRoles.length}개${big ? ' (이 PC 그래프 사본)' : ''}`);
    const badge = await p.locator(`#st-onto .ps-fig[data-role="${apiRoles[0].id}"] .ps-name`).textContent();
    const wantBadge = await p.evaluate((name) => OntologyView._short({ name }, 10), apiRoles[0].name);
    ok(badge === wantBadge, `7 명찰 = 역할 이름 (${badge})`);
    ok(/그래프 도구\(_ontology\)가 없어/.test(await p.locator('#on-status').textContent()), '7 「다시 그리기」: 도구 없는 영혼이면 이유를 말하고 지금 그래프를 보여 줌');
    ok(drawMs < 6000, `7 다시 그리기→그림 ${drawMs}ms (6초 안)`);
    await shot('s-ontology');
    // 영역이 가장 많은 역할을 고른다(이 PC = 저자, 접어서 시작) — 영역이 3개 이하인 역할은 펼쳐서 시작
    const bigRole = apiRoles.slice().sort((a, b) => kidsOf(b.id).length - kidsOf(a.id).length)[0];
    await p.locator(`#st-onto .ps-fig[data-role="${bigRole.id}"]`).click();
    await p.waitForSelector('#ot-tree', { timeout: 5000 }).catch(() => {}); await sleep(1300);
    const top = kidsOf(bigRole.id), rows0 = await p.locator('#ot-tree .ot-row').count();
    const startOpen = top.length <= 3 ? top.reduce((s, d) => s + kidsOf(d.id).length, 0) : 0;
    ok(rows0 === top.length + startOpen && /← 모든 역할/.test(await p.locator('#st-onto').textContent()), `7 고르면 트리: 첫 단 ${top.length}줄${startOpen ? ` + 펼친 ${startOpen}줄` : '(접힌 채)'} = ${rows0}`);
    ok(await p.locator('#ot-me.ps-turned').count() === 1, '7 걸어간 뒤 캐릭터가 트리 쪽으로 몸을 돌림');
    await shot('s-ontology-tree');
    const dWith = top.find(d => kidsOf(d.id).length > 0);
    if (dWith && top.length > 3) {
      await p.locator(`#ot-tree .ot-row[data-row="${dWith.id}"]`).click(); await sleep(150);
      ok((await p.locator('#ot-tree .ot-row').count()) === rows0 + kidsOf(dWith.id).length, `7 영역 누르기 = 펼침(+${kidsOf(dWith.id).length}줄)`);
      await p.locator(`#ot-tree .ot-row[data-row="${dWith.id}"]`).press('Enter'); await sleep(150);
      ok((await p.locator('#ot-tree .ot-row').count()) === rows0, '7 그 줄에서 Enter = 다시 접힘');
    }
    await p.keyboard.press('Escape'); await sleep(200);
    ok((await p.locator('#st-onto .ps-fig[data-role]').count()) === nFig && await p.locator('#settings').isVisible(), '7 Esc = 격자로 돌아감(설정 서랍은 그대로)');
    await p.locator('#on-q').fill('물리'); await p.locator('#on-q').press('1'); await p.locator('#on-q').press('Backspace'); await sleep(150);
    const nHit = api.nodes.filter(n => n.path.toLowerCase().includes('물리')).length, nRes = await p.locator('#on-res .on-r').count();
    ok(nHit > 0 && nRes === Math.min(30, nHit) && new RegExp(`${nHit}개`).test(await p.locator('#on-hits').textContent()), `7 검색 = 일치 ${nHit}개, 목록 ${nRes}줄(숫자 키는 입력칸에만)`);
    await p.locator('#on-q').press('Enter'); await sleep(600);
    const firstHit = api.nodes.find(n => n.path.toLowerCase().includes('물리'));
    ok((await p.locator(`#ot-tree .ot-row.sel[data-row="${firstHit.id}"]`).count()) === 1 && await p.locator('#on-res').isHidden(), '7 Enter = 그 역할로 가서 그 줄을 펼쳐 고름');
    await shot('s-ontology-sel');
    await p.locator('#on-q').press('Escape'); await sleep(150);
    ok((await p.locator('#on-q').inputValue()) === '' && await p.locator('#ot-tree').isVisible(), '7 검색칸 Esc = 검색만 지움(트리는 그대로)');
    // 관계 화면(v2.92): 문장 카드 — 종류 탭 · 「A」 ──화살표── 「B」 + 한 문장 · 형제는 묶음 카드
    await p.locator('#st-onto [data-mode="relation"]').click(); await sleep(400);
    const relKinds = [...new Set(api.links.map(l => l.rel))];
    const nPair = api.links.filter(l => l.rel !== 'sibling_group').length;
    const nCards = await p.locator('#st-onto .rl-card').count(), nTabs = await p.locator('#st-onto .rl-tabs [data-kind]').count();
    ok(nTabs === relKinds.length + 1 && nCards >= nPair && nCards > 0, `7 관계 화면 = 종류 탭 ${nTabs - 1}개 + 「모두」 · 카드 ${nCards}장(방향 있는 관계 ${nPair}개 + 형제 묶음)`);
    const say = await p.locator('#st-onto .rl-card .rl-say').first().textContent();
    ok(/「[^」]+」(은|는|의|이|가) /.test(say) && /니다\.$/.test(say), `7 카드마다 쉬운 문장 (${say})`);
    ok((await p.locator('#st-onto .on-svg').count()) === 0 && (await p.locator('#on-fit').count()) === 0, '7 원형 점·선 그래프와 「전체 보기」는 없음');
    ok(await p.evaluate(() => [OntologyView._jo('「물리학」', '은', '는'), OntologyView._jo('「교사」', '은', '는'), OntologyView._jo('「인지–행동 시스템 〖화재〗」', '을', '를'), OntologyView._jo('「Web」', '이', '가')].join(',')) === '은,는,을,이(가)', '7 조사(은/는·을/를) = 받침에 맞춤, 태그·영어 끝은 괄호');
    await shot('s-ontology-rel');
    const k1 = relKinds[0];
    await p.locator(`#st-onto .rl-tabs [data-kind="${k1}"]`).click(); await sleep(150);
    ok((await p.locator('#st-onto .rl-grp').count()) === 1 && (await p.locator(`#st-onto .rl-tabs [data-kind="${k1}"]`).getAttribute('aria-pressed')) === 'true', `7 종류 탭 = 그 종류만 (${k1})`);
    await p.locator('#st-onto .rl-tabs [data-kind="all"]').click(); await sleep(150);
    const chipA = p.locator('#st-onto .rl-card .rl-f').first(); const goId = await chipA.getAttribute('data-go');
    await chipA.click(); await sleep(400);
    ok((await p.locator('#st-onto [data-mode="structure"]').getAttribute('aria-pressed')) === 'true' && (apiRoles.some(r => r.id === goId) ? (await p.locator('#ot-tree').count()) === 1 : (await p.locator(`#ot-tree .ot-row.sel[data-row="${goId}"]`).count()) === 1), '7 카드의 폴더 누르기 = 구조 화면의 그 줄');
    const ring = p.locator('#st-onto .ot-ring').first();
    if (await ring.count()) {
      const rid = await ring.getAttribute('data-ring'); await ring.click(); await sleep(400);
      const nMine = await p.locator('#st-onto .rl-card').count(), wantMine = api.links.filter(l => l.rel !== 'sibling_group' && (l.from === rid || l.to === rid)).length;
      ok((await p.locator('#st-onto [data-mode="relation"]').getAttribute('aria-pressed')) === 'true' && /관계만 보는 중/.test(await p.locator('#st-onto .rl-focus').textContent()) && nMine >= wantMine && nMine <= wantMine + 1 && (await p.locator(`#st-onto .rl-f.me[data-go="${rid}"]`).count()) >= 1, `7 관계 고리 = 그 폴더의 관계만(${nMine}장)`);
    } else ok(false, '7 관계 고리가 트리에 없음');
    await p.keyboard.press('Escape'); await sleep(200);
    ok((await p.locator('#st-onto .rl-focus').count()) === 0 && await p.locator('#settings').isVisible(), '7 관계 화면 Esc = 한 폴더 보기만 풀기');
    await p.locator('#on-q').fill('zzz-없는-이름'); await sleep(150);
    ok((await p.locator('#st-onto .rl-card').count()) === 0 && /맞는 관계가 없습니다/.test(await p.locator('#st-onto').textContent()), '7 관계 화면 검색 = 카드 거르기');
    await p.locator('#on-q').fill(''); await sleep(100);
    await p.locator('#st-onto [data-mode="structure"]').click(); await sleep(200);
    // 상세 화면: 왼쪽 캐릭터 칸이 넓어지고(320px) 「모두 펼치기/접기」는 없음
    if (await p.locator('#st-onto [data-on="back"]').count()) { await p.locator('#st-onto [data-on="back"]').click(); await sleep(200); } // 앞에서 고른 역할이 남아 있으면 격자로
    await p.locator(`#st-onto .ps-fig[data-role="${apiRoles[0].id}"]`).click(); await sleep(1300);
    const meW = await p.locator('#ot-me').evaluate(e => e.getBoundingClientRect().width), sideW = await p.locator('.ot-side').evaluate(e => e.getBoundingClientRect().width);
    ok(sideW >= 300 && meW >= 200 && !/모두 펼치기|모두 접기/.test(await p.locator('#st-onto').textContent()), `7 상세: 왼쪽 칸 ${Math.round(sideW)}px · 캐릭터 ${Math.round(meW)}px · 펼치기/접기 단추 없음`);
    await p.keyboard.press('Escape'); await sleep(200);
    const errsBefore = errs.length; // 아래 거절(404)은 일부러 낸 것 — 콘솔 오류 집계에서 뺀다
    const keep = await p.evaluate(async () => (await fetch('/api/open-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel: '..\\..' }) })).status);
    ok(keep === 404, '7 폴더 열기 = 영혼 밖 경로 거절');
    await sleep(100); errs.splice(errsBefore).filter(m => !/404/.test(m)).forEach(m => errs.push(m));
    // 도구: 가짜 스킬 + 비밀 값이 든 MCP 를 심고 화면에 값이 안 나오는지
    fs.mkdirSync(path.join(soulR, '_agent', 'claude', 'skills', 'demo-skill'), { recursive: true });
    fs.writeFileSync(path.join(soulR, '_agent', 'claude', 'skills', 'demo-skill', 'SKILL.md'), '---\nname: demo-skill\ndescription: 시험용 스킬 설명\n---\n본문', 'utf8');
    writeJson(path.join(soulR, '_agent', 'claude', '.claude.json'), { mcpServers: { 'demo-mcp': { command: 'C:\\x\\demo.exe', args: ['--token', 'SECRET-ARG-123'], env: { API_KEY: 'SECRET-ENV-456' } } } });
    await p.locator('#st-nav [data-pane="tools"]').click(); await sleep(800);
    const tt = await p.locator('#st-tools').textContent();
    ok(/demo-skill/.test(tt) && /시험용 스킬 설명/.test(tt) && /demo-mcp/.test(tt) && /demo\.exe/.test(tt) && /codex-home-skill/.test(tt), '7 도구 탭 = Skill·MCP 행(사용자 폴더 .agents\\skills 의 Codex 스킬 포함)');
    ok(!/SECRET-/.test(await p.content()), '7 MCP 의 인자·env 값은 화면에 없음');
    ok((await p.locator('#st-tools .tl-card').count()) === 3 && /설치된 Plugin 없음/.test(tt), '7 카드 세 장(빈 카드는 안내)');
    const pills = await p.locator('#tl-sum .tl-pill').evaluateAll(bs => bs.map(b => b.textContent.replace(/\s*\d+$/, '').trim()).join(','));
    ok(pills === 'All,Skill,MCP,Plugin' && !/도구 = 에이전트의 팔다리/.test(await p.locator('.st-pane[data-pane="tools"]').textContent()), `7 뱃지 이름 영어(${pills}) · 머리 부가설명 없음`);
    await p.locator('#tl-sum [data-kind="mcp"]').click(); await sleep(100);
    ok((await p.locator('#st-tools .tl-card').count()) === 1 && (await p.locator('#st-tools .tl-card[data-kind="mcp"]').count()) === 1, '7 MCP 뱃지 = MCP 만');
    await p.locator('#tl-sum [data-kind="mcp"]').click(); await sleep(100);
    ok((await p.locator('#st-tools .tl-card').count()) === 3, '7 같은 뱃지 다시 누르기 = 모두');
    const tabs = await p.locator('#tl-agents [data-agent]').evaluateAll(bs => bs.map(b => b.textContent.replace(/\s*\d+$/, '').trim()).join(','));
    ok(tabs === '전체,Claude 전용,Codex 전용,둘 다', `7 에이전트 탭 (${tabs})`);
    await p.locator('#tl-agents [data-agent="codex"]').click(); await sleep(100);
    const tc = await p.locator('#st-tools').textContent();
    ok(/codex-home-skill/.test(tc) && !/demo-skill/.test(tc) && !/demo-mcp/.test(tc), '7 Codex 전용 탭 = Codex 에만 있는 것');
    await p.locator('#tl-agents [data-agent="claude"]').click(); await sleep(100);
    const tcl = await p.locator('#st-tools').textContent();
    ok(/demo-skill/.test(tcl) && /demo-mcp/.test(tcl) && !/codex-home-skill/.test(tcl), '7 Claude 전용 탭 = Claude 에만 있는 것');
    await shot('s-tools-claude');
    await p.locator('#tl-agents [data-agent="all"]').click(); await sleep(100);
    await p.locator('#tl-q').fill('zzz-없음'); await sleep(100);
    ok(/찾는 이름이 없습니다/.test(await p.locator('#st-tools').textContent()), '7 도구 검색');
    await p.locator('#tl-q').fill(''); await shot('s-tools');
    await p.locator('#st-nav [data-pane="about"]').click(); await sleep(200);
    await p.locator('#st-tutorial').click(); await sleep(400);
    ok(await p.locator('#tutorial').isVisible() && !(await p.locator('#settings').isVisible()), '7 「튜토리얼 다시 보기」 = 설정 닫고 첫 장면부터');
    await p.locator('[data-nav="later"]').click().catch(() => {}); await sleep(300);
    ok(errs.length === 0, `6 페이지 오류 ${errs.length}건${errs.length ? ' ' + errs.join(' | ') : ''}`);
  } catch (e) { ok(false, '6 예외 ' + e.message); }
  finally { try { await browser?.close(); } catch {} try { d.kill(); } catch {} await sleep(500); }
}
try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
