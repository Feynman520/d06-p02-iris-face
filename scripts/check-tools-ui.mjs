// 도구 화면 검사(판 B, 2026-11-10) — app/tools.js 를 작은 시험 쪽에 띄우고 /api/tools* 는 가짜 응답(진짜 데몬·CLI 접촉 0).
// 세 탭 · 설치됨/설치할 수 있음 · 버튼 상태(설치·제거·기본·직접 설치함·같은 이름 있음) · 확인 창 · 진행 · 오류 · 아이콘 대체 · 에이전트 탭.
//   npm run verify:tools-ui      (playwright 가 없으면 SKIP)
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

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body>
<div id="st-tools"></div>
<script src="/icons.js"></script>
<script>
  window.__dialogs = []; window.__answer = true;
  window.Dialog = { confirm: async (m, o) => { window.__dialogs.push({ kind: 'confirm', ...o }); return window.__answer; }, alert: async (m) => { window.__dialogs.push({ kind: 'alert', message: m }); } };
</script>
<script src="/tools.js"></script></body></html>`;
const server = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x').pathname;
  if (u === '/') { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return s.end(HARNESS); }
  const f = path.join(APP, decodeURIComponent(u.replace(/^\/app\//, '/'))); // 데몬처럼 /app/… 도 받음(아이콘 주소)
  if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const type = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
  s.writeHead(200, { 'content-type': type }); fs.createReadStream(f).pipe(s);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const cat = (o) => ({ name: '이름', desc: '설명', vendor: 'V', license: 'MIT', home: 'https://x', account: null, effects: [], icon: 'none.webp', tested: { at: 'x' }, state: { agents: {}, error: null }, ...o });
function world() {
  return {
    ok: true,
    skills: [
      { agent: 'claude', name: 'brainstorming', dir: 'brainstorming', description: '기본 스킬', origin: 'base' },
      { agent: 'codex', name: 'brainstorming', dir: 'brainstorming', description: '기본 스킬', origin: 'base' },
      { agent: 'claude', name: 'my-own', dir: 'my-own', description: '손으로 깐 것', origin: 'manual' },
      { agent: 'claude', name: 'theme-factory', dir: 'theme-factory', description: 'x', origin: 'iris', catalogId: 'theme-factory' },
    ],
    mcp: [{ agent: 'claude', name: 'playwright', kind: 'stdio', program: 'node.exe', origin: 'base' }, { agent: 'codex', name: 'Canva', kind: 'http', origin: 'manual' }],
    plugins: [],
    catalog: { busy: null, errors: [], items: [
      cat({ id: 'canvas-design', kind: 'skill', agents: ['claude', 'codex'], name: '포스터 디자인', icon: 'no-such-icon.webp', state: { agents: { claude: 'absent', codex: 'absent' } } }),
      cat({ id: 'theme-factory', kind: 'skill', agents: ['claude', 'codex'], name: '테마', state: { agents: { claude: 'installed', codex: 'absent' } } }),
      cat({ id: 'skill-x', kind: 'skill', agents: ['claude'], name: '이름 겹침', state: { agents: { claude: 'conflict' } } }),
      cat({ id: 'skill-err', kind: 'skill', agents: ['codex'], name: '실패한 것', state: { agents: { codex: 'absent' }, error: '지문이 맞지 않습니다' } }),
      cat({ id: 'context7', kind: 'mcp', agents: ['claude', 'codex'], name: 'Context7', effects: ['라이브러리 이름 전송'], state: { agents: { claude: 'absent', codex: 'absent' } } }),
      cat({ id: 'notion', kind: 'plugin', agents: ['claude', 'codex'], name: '노션', account: 'Notion 계정 로그인', state: { agents: { claude: 'absent', codex: 'absent' } } }),
      // 장부에는 있는데 목록 읽기(listTools)에서 빠진 것 — 「설치됨」에 그대로 보여야 함(코덱스 코드 검토 2차 B9)
      cat({ id: 'ghost-plug', kind: 'plugin', agents: ['codex'], name: '목록에서 빠진 것', state: { agents: { codex: 'installed' }, ledger: 'installed' } }),
      cat({ id: 'mail-x', kind: 'plugin', agents: ['codex'], name: '메일', agentNote: { claude: '공식 플러그인이 없습니다' }, state: { agents: { codex: 'absent' } } }),
    ], baseIcons: { playwright: { icon: 'playwright.svg' } }, knownIcons: { canva: { icon: 'canva.png' } } },
  };
}

const browser = await pw.chromium.launch();
try {
  const p = await browser.newPage();
  let W = world(), posts = [];
  await p.route('**/api/tools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(W) }));
  await p.route('**/api/tools/*', async (r) => {
    const op = r.request().url().split('/').pop(); const body = JSON.parse(r.request().postData() || '{}'); posts.push(`${op}:${body.id}`);
    if (body.id === 'skill-err') return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: '지문이 맞지 않습니다' }) });
    await new Promise((res) => setTimeout(res, 300));
    // 세션이 열려 있는 셈 치고 제거는 「제거 대기」로(데몬 doRemove 와 같은 모양), 취소는 그 표시를 걷음
    const it = W.catalog.items.find((i) => i.id === body.id);
    if (op === 'remove' && it) { it.state.removeRequested = true; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, deferred: true }) }); }
    if (op === 'cancel' && it) it.state.removeRequested = false;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base);
  await p.evaluate(() => { try { localStorage.removeItem('iris.tools.kind'); } catch {} ; window.ToolsView.show(); });
  await p.waitForTimeout(400);
  const kinds = await p.locator('#tl-kinds [data-kind]').evaluateAll((bs) => bs.map((b) => b.textContent.replace(/\s*\d+$/, '').trim()).join(','));
  ok(kinds === 'Skill,MCP,Plugin', `탭 = ${kinds}`);
  ok(await p.locator('#tl-kinds [data-kind="skills"]').getAttribute('aria-pressed') === 'true', '첫 탭 = Skill');
  // v2.104: 설치된 것 = 세 묶음(기본 · IRIS 로 설치함 · 직접 설치함), 순서 고정
  const secs = await p.locator('#tl-body section[data-sec]').evaluateAll((ss) => ss.map((x) => x.dataset.sec).join(','));
  ok(secs === 'base,iris,manual,available', `묶음 순서 = ${secs}`);
  ok(/기본 도구/.test(await p.locator('[data-sec="base"] .tl-h').textContent()) && /설치 패키지/.test(await p.locator('[data-sec="base"] .tl-h').textContent()) && /brainstorming/.test(await p.locator('[data-sec="base"]').textContent()), '기본 도구 묶음 = 설치 패키지에 들어 있는 것');
  ok(/my-own/.test(await p.locator('[data-sec="manual"]').textContent()) && !/my-own/.test(await p.locator('[data-sec="base"]').textContent()), '직접 설치한 것은 「직접 설치함」 묶음');
  ok(await p.locator('[data-sec="base"] .tl-row:has-text("brainstorming") button').count() === 0 && await p.locator('[data-sec="manual"] .tl-row:has-text("my-own") button').count() === 0, '기본·직접 설치함 = 버튼 없음');
  // 그림 없는 설치 도구 = 머리글자 색 타일(콘센트 선 아이콘이 남지 않음), 같은 이름은 같은 색
  ok(await p.locator('[data-sec="manual"] .tl-row:has-text("my-own") .tl-ic-m').count() === 1 && /^MO$/.test((await p.locator('[data-sec="manual"] .tl-row:has-text("my-own") .tl-ic-m').textContent()).trim()), '그림 없는 도구 = 머리글자 타일(MO)');
  ok(await p.locator('[data-sec="base"] .tl-row:has-text("brainstorming") .tl-ic-k').count() === 0, '기본 스킬에도 선 아이콘 대신 타일');
  ok(await p.locator('[data-sec="iris"] .tl-row[data-id="theme-factory"] [data-act="remove"]').count() === 1, 'IRIS 가 깐 것 = 「제거」');
  ok(/Codex에도 설치/.test(await p.locator('[data-sec="iris"] .tl-row[data-id="theme-factory"]').textContent()), '한쪽만 깐 것 = 「Codex에도 설치」');
  ok(await p.locator('[data-sec="base"] .tl-row:has-text("brainstorming") .chip').count() === 2, '같은 이름 두 에이전트 = 한 줄에 칩 두 개');
  const avail = p.locator('[data-sec="available"]');
  ok(await avail.locator('.tl-row[data-id="canvas-design"] [data-act="install"]').count() === 1, '안 깐 것 = 「설치」');
  ok(/같은 이름이 이미 있음/.test(await avail.locator('.tl-row[data-id="skill-x"]').textContent()) && await avail.locator('.tl-row[data-id="skill-x"] button').count() === 0, '같은 이름이 따로 있음 = 버튼 없음');
  ok(/지문이 맞지 않습니다/.test(await avail.locator('.tl-row[data-id="skill-err"]').textContent()) && /다시 시도/.test(await avail.locator('.tl-row[data-id="skill-err"] button').textContent()), '실패한 것 = 원인 + 「다시 시도」');
  await p.waitForTimeout(300);
  ok(await p.locator('.tl-row[data-id="canvas-design"] img.tl-ic').count() === 0 && await p.locator('.tl-row[data-id="canvas-design"] .tl-ic-k').count() === 1, '아이콘 파일이 없으면 기본 선 아이콘으로 대체');
  // 실제 카탈로그 아이콘은 데몬 주소 규칙(/app/…)으로 실제로 읽힌다 — 2026-11-10 'tool-icons/…' 상대 주소가 데몬에서 404 였던 것의 재발 방지
  // v2.103: 기본 도구 아이콘(base.icons)도 실제 파일로 읽혀야 한다
  const catJson = JSON.parse(fs.readFileSync(path.join(APP, '..', 'daemon', 'tools-catalog.json'), 'utf8'));
  const real = [...catJson.items.map((i) => i.icon), ...Object.values(catJson.base?.icons || {}).map((v) => v.icon), ...Object.values(catJson.known || {}).map((v) => v.icon)];
  // 배지 정확성(v2.104 사용자 "클로드·코덱스 모두 정확하게"): 한 에이전트만 되는 항목은 다른 쪽이 왜 없는지 반드시 적는다
  const oneSided = catJson.items.filter((i) => i.agents.length === 1);
  ok(oneSided.every((i) => ['claude', 'codex'].filter((a) => !i.agents.includes(a)).every((a) => (i.agentNote?.[a] || '').length >= 8)), `한쪽 전용 ${oneSided.length}개 모두 다른 쪽 사유 있음(${oneSided.map((i) => i.id).join(',')})`);
  ok(Object.keys(catJson.base?.icons || {}).sort().join() === [...(catJson.base?.mcp || [])].sort().join(), '기본 MCP 마다 아이콘이 있음(base.icons = base.mcp)');
  ok(real.every((n) => /^[a-z0-9][a-z0-9-]*\.(webp|png|svg)$/.test(n)), '아이콘 파일 이름 꼴(영문 소문자·숫자·하이픈 + webp/png/svg)');
  ok([...catJson.items, ...Object.values(catJson.base?.icons || {}), ...Object.values(catJson.known || {})].every((v) => /^(official|codex):/.test(v.iconSource || '') && v.iconChecked), '아이콘마다 출처(official|codex)·확인일');
  const loaded = await p.evaluate(async (icons) => Promise.all(icons.map((n) => new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.src = `/app/tool-icons/${n}`; }))), real);
  ok(real.length >= 21 && loaded.every(Boolean), `카탈로그 아이콘 ${loaded.filter(Boolean).length}/${real.length} 실제로 읽힘`);
  // 기본 도구 줄(origin base)은 base.icons 의 그림을 쓴다 — 예전엔 늘 콘센트 선 아이콘이었다(2026-11-11 사용자 요청)
  await p.locator('#tl-kinds [data-kind="mcp"]').click(); await p.waitForTimeout(200);
  ok(await p.evaluate(() => [...document.querySelectorAll('#tl-body .tl-row img.tl-ic')].some((im) => im.getAttribute('src') === '/app/tool-icons/playwright.svg')), '기본 도구(playwright) 줄에 그 회사 아이콘');
  ok(await p.evaluate(() => [...document.querySelectorAll('[data-sec="manual"] .tl-row img.tl-ic')].some((im) => im.getAttribute('src') === '/app/tool-icons/canva.png')), '직접 설치한 널리 쓰는 도구(Canva, 대소문자 무관) = 회사 아이콘');
  await p.locator('#tl-kinds [data-kind="plugins"]').click(); await p.waitForTimeout(200);
  const mailRow = await p.locator('.tl-row[data-id="mail-x"]').textContent();
  ok(await p.locator('.tl-row[data-id="mail-x"] .chip').count() === 1 && /Claude: 공식 플러그인이 없습니다/.test(mailRow), '한쪽만 되는 도구 = 배지는 되는 쪽만 + 다른 쪽이 없는 이유');
  await p.locator('#tl-kinds [data-kind="skills"]').click(); await p.waitForTimeout(200);
  ok(await p.evaluate(() => [...document.querySelectorAll('img.tl-ic')].every((im) => im.getAttribute('src').startsWith('/app/tool-icons/'))), '아이콘 주소 = /app/tool-icons/…(데몬이 내주는 자리)');
  // v2.102(2026-11-10 사용자 "아이콘 그림을 최대한 크게"): 칸 36px · 그림 파일 128px(코덱스 그림) — 작게 되돌아가면 실패
  const box = await p.evaluate(() => [...document.querySelectorAll('.tl-ic')].map((e) => Math.round(e.getBoundingClientRect().width)));
  ok(box.length > 0 && box.every((w) => w === 36), `아이콘 칸 36px(${[...new Set(box)].join(',')})`);
  // v2.103: 그림 파일(png·webp — 공식 아이콘 포함) 전부 128px 이상, 그중 코덱스 그림은 6장 이상
  const raster = real.filter((n) => /\.(webp|png)$/.test(n));
  const sizes = await p.evaluate(async (icons) => Promise.all(icons.map((n) => new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth); im.onerror = () => res(0); im.src = `/app/tool-icons/${n}`; }))), raster);
  const codexN = [...catJson.items, ...Object.values(catJson.base?.icons || {})].filter((v) => /^codex:/.test(v.iconSource || '')).length;
  ok(codexN >= 6 && sizes.length >= 14 && sizes.every((w) => w >= 128), `그림 아이콘 128px 이상(${sizes.join(',')}) · 코덱스 그림 ${codexN}장`);
  // 에이전트 탭
  const tabs = await p.locator('#tl-agents [data-agent]').evaluateAll((bs) => bs.map((b) => b.textContent.trim()).join(' | '));
  ok(/전체 \d+/.test(tabs) && /Claude 전용 \d+/.test(tabs), `에이전트 탭 숫자(${tabs})`);
  await p.locator('#tl-agents [data-agent="codex"]').click();
  const cx = await p.locator('#tl-body').textContent();
  ok(/실패한 것/.test(cx) && !/my-own/.test(cx) && !/포스터 디자인/.test(cx), 'Codex 전용 = Codex 에만 있는 것');
  await p.locator('#tl-agents [data-agent="all"]').click();
  // 설치: 확인 창 → 진행 표시 → 다시 읽기
  await p.locator('.tl-row[data-id="canvas-design"] [data-act="install"]').click();
  await p.waitForTimeout(80);
  const dlg = await p.evaluate(() => window.__dialogs.at(-1));
  ok(dlg?.kind === 'confirm' && /포스터 디자인/.test(dlg.html) && /새로 여는 세션부터/.test(dlg.html) && dlg.okLabel === '설치', '설치 = 확인 창(이름·적용 시점)');
  ok(/tl-spin/.test(await p.locator('.tl-row[data-id="canvas-design"]').innerHTML()), '설치 중 = 그 줄에 도는 표시');
  ok(await p.locator('[data-act]:not([disabled])').count() === 0, '설치 중 = 다른 단추 잠김');
  await p.waitForTimeout(600);
  ok(posts.includes('install:canvas-design'), '설치 요청 = POST /api/tools/install');
  // 확인 창에서 취소하면 아무것도 안 함
  await p.evaluate(() => { window.__answer = false; });
  const before = posts.length;
  await p.locator('[data-sec="iris"] .tl-row[data-id="theme-factory"] [data-act="remove"]').click(); await p.waitForTimeout(200);
  ok(posts.length === before, '확인 창 취소 = 요청 없음');
  await p.evaluate(() => { window.__answer = true; });
  await p.locator('[data-sec="iris"] .tl-row[data-id="theme-factory"] [data-act="remove"]').click(); await p.waitForTimeout(80);
  const d2 = await p.evaluate(() => window.__dialogs.at(-1));
  ok(d2.okLabel === '제거' && d2.danger === true && /제거 대기/.test(d2.html) && /세션이 모두 끝나면/.test(d2.html), '제거 = 위험 표시 확인 창(열린 세션이면 대기한다는 안내)');
  await p.waitForTimeout(600);
  ok(posts.includes('remove:theme-factory'), '제거 요청');
  ok(/「제거 대기」/.test((await p.evaluate(() => window.__dialogs.at(-1))).message || ''), '미뤄진 제거 = 「제거 대기」 안내 알림');
  const pend = p.locator('[data-sec="iris"] .tl-row[data-id="theme-factory"]');
  ok(/제거 대기/.test(await pend.textContent()) && /세션이 모두 끝나면 지웁니다/.test(await pend.textContent()) && await pend.locator('[data-act="remove"]').count() === 0, '제거 대기 줄 = 표시 + 설명, 「제거」 단추 없음');
  const nd = await p.evaluate(() => window.__dialogs.length);
  await pend.locator('[data-act="cancel"]').click(); await p.waitForTimeout(500);
  ok(posts.includes('cancel:theme-factory') && await p.evaluate(() => window.__dialogs.length) === nd, '「제거 취소」 = 확인 창 없이 바로 요청');
  ok(!/제거 대기/.test(await pend.textContent()) && await pend.locator('[data-act="remove"]').count() === 1, '취소 뒤 = 다시 「제거」');
  // 완료 방송을 놓쳐도 다시 열면 데몬의 busy(null) 를 믿고 단추가 풀린다(코덱스 코드 검토 8)
  W.catalog.busy = { id: 'canvas-design', op: 'install', step: '내려받는 중' };
  await p.evaluate(() => window.ToolsView.show()); await p.waitForTimeout(300);
  ok(await p.locator('[data-act]:not([disabled])').count() === 0 && /내려받는 중/.test(await p.locator('#tl-body').textContent()), '다시 열기 = 데몬이 바쁘면 단추 잠김');
  W.catalog.busy = null;
  await p.evaluate(() => window.ToolsView.show()); await p.waitForTimeout(300);
  ok(await p.locator('[data-act]:not([disabled])').count() > 0, '다시 열기 = 데몬 busy 가 null 이면 잠김 풀림');
  // 실패 응답 = 알림
  await avail.locator('.tl-row[data-id="skill-err"] [data-act="install"]').click(); await p.waitForTimeout(500);
  ok((await p.evaluate(() => window.__dialogs.filter((d) => d.kind === 'alert').map((d) => d.message).join('|'))).includes('지문이 맞지 않습니다'), '실패 = 원인 알림');
  // MCP·Plugin 탭과 계정 안내
  await p.locator('#tl-kinds [data-kind="plugins"]').click();
  const pl = await p.locator('#tl-body').textContent();
  ok(/노션/.test(pl) && /Notion 계정 로그인/.test(pl), 'Plugin 탭 = 계정 필요 안내');
  ok(await p.locator('[data-sec="iris"] .tl-row[data-id="ghost-plug"] [data-act="remove"]').count() === 1 && await p.locator('[data-sec="available"] .tl-row[data-id="ghost-plug"]').count() === 0, '장부에 있는데 목록에서 빠진 것 = 「설치됨」에 「제거」와 함께(사라지지 않음)');
  await p.locator('.tl-row[data-id="notion"] [data-act="install"]').click(); await p.waitForTimeout(80);
  ok(/Notion 계정 로그인/.test((await p.evaluate(() => window.__dialogs.at(-1))).html), '확인 창에 필요한 계정');
  await p.waitForTimeout(500);
  await p.locator('#tl-kinds [data-kind="mcp"]').click();
  ok(/Context7/.test(await p.locator('#tl-body').textContent()) && /playwright/.test(await p.locator('#tl-body').textContent()), 'MCP 탭 = 기본 MCP + 설치할 수 있는 것');
  ok(await p.evaluate(() => localStorage.getItem('iris.tools.kind')) === 'mcp', '고른 탭 기억');
  // 진행 방송(ws) 반영
  await p.evaluate(() => window.ToolsView.onTools({ type: 'tools', busy: { id: 'context7', op: 'install', step: 'codex MCP 등록' } }));
  ok(/codex MCP 등록/.test(await p.locator('.tl-row[data-id="context7"]').textContent()), '진행 방송 = 단계 글자');
  await p.evaluate(() => window.ToolsView.onTools({ type: 'tools', busy: null }));
  // 찾기
  await p.fill('#tl-q', 'zzz'); await p.waitForTimeout(100);
  ok(/찾는 이름이 없습니다/.test(await p.locator('#tl-body').textContent()), '찾기');
  ok(errs.length === 0, `페이지 오류 없음${errs.length ? ' — ' + errs.join(' | ') : ''}`);
} finally {
  await browser.close(); server.close();
}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
