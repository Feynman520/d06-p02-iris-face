// 도구 설치·제거 엔진 검사(판 B, 2026-11-10) — 가짜 CLI·가짜 내려받기·임시 영혼 폴더. 실제 claude·codex·네트워크 접촉 0.
//   npm run verify:toolinstall
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipWrite } from '../daemon/zip.mjs';
import { treeHash, extractSubtree, validateItem, loadToolCatalog } from '../daemon/toolcatalog.mjs';
import { spawn } from 'node:child_process';
import { ToolManager, MARKET, cmdLine, codexPlugins, lockPipeName } from '../daemon/toolinstall.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-tools-'));
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const COMMIT = 'a'.repeat(40);

// ── 가짜 저장소 zip: <repo>-<commit>/… ──
const SKILL_FILES = [{ path: 'SKILL.md', data: Buffer.from('---\nname: demo-skill\ndescription: demo\n---\n본문\n') }, { path: 'ref/a.txt', data: Buffer.from('a') }];
const PLUG_FILES = [{ path: '.claude-plugin/plugin.json', data: Buffer.from('{"name":"demo-plugin"}') }, { path: '.codex-plugin/plugin.json', data: Buffer.from('{"name":"demo-plugin"}') }, { path: '.mcp.json', data: Buffer.from('{"mcpServers":{"x":{"type":"http","url":"https://x.example/mcp"}}}') }];
const mkZip = (files, sub) => zipWrite(files.map((f) => ({ name: `repo-${COMMIT}/${sub}/${f.path}`, data: f.data })));
const ZIPS = {
  [`o/skills@${COMMIT}`]: mkZip(SKILL_FILES, 'skills/demo-skill'),
  [`o/plugs@${COMMIT}`]: mkZip(PLUG_FILES, 'plugins/demo-plugin'),
  [`o/evil@${COMMIT}`]: zipWrite([{ name: `repo-${COMMIT}/skills/evil/SKILL.md`, data: Buffer.from('x') }, { name: `repo-${COMMIT}/skills/evil/../../escape.txt`, data: Buffer.from('x') }]),
};
let fetches = 0;
const fakeFetch = async (url) => { fetches++; const m = /codeload\.github\.com\/([^/]+\/[^/]+)\/zip\/([0-9a-f]{40})$/.exec(url); const z = m && ZIPS[`${m[1]}@${m[2]}`]; return z ? { ok: true, status: 200, arrayBuffer: async () => z.buffer.slice(z.byteOffset, z.byteOffset + z.length) } : { ok: false, status: 404 }; };

const SKILL_TREE = treeHash(SKILL_FILES), PLUG_TREE = treeHash(PLUG_FILES);
const item = (o) => ({ name: '이름', desc: '설명', vendor: 'v', license: 'MIT', home: 'https://x', account: null, effects: [], icon: 'x.webp', tested: { at: '2026-11-10' }, ...o });
const CATALOG = { schema: 1, base: { mcp: ['playwright'], pluginMarket: 'iris-local' }, items: [
  item({ id: 'demo-skill', kind: 'skill', agents: ['claude', 'codex'], install: { repo: 'o/skills', commit: COMMIT, path: 'skills/demo-skill', treeSha256: SKILL_TREE } }),
  item({ id: 'bad-hash', kind: 'skill', agents: ['claude'], install: { repo: 'o/skills', commit: COMMIT, path: 'skills/demo-skill', treeSha256: 'b'.repeat(64) } }),
  item({ id: 'evil', kind: 'skill', agents: ['claude'], install: { repo: 'o/evil', commit: COMMIT, path: 'skills/evil', treeSha256: 'c'.repeat(64) } }),
  item({ id: 'demo-mcp', kind: 'mcp', agents: ['claude', 'codex'], install: { via: 'http', url: 'https://mcp.example.com/mcp' } }),
  item({ id: 'demo-plugin', kind: 'plugin', agents: ['claude', 'codex'], install: {
    claude: { repo: 'o/plugs', commit: COMMIT, path: 'plugins/demo-plugin', plugin: 'demo-plugin', treeSha256: PLUG_TREE },
    codex: { repo: 'o/plugs', commit: COMMIT, path: 'plugins/demo-plugin', plugin: 'demo-plugin', treeSha256: PLUG_TREE, entry: { policy: { installation: 'AVAILABLE' }, category: 'Productivity' } } } }),
] };

// ── 가짜 CLI: 진짜 CLI 가 쓰는 파일 모양을 흉내 낸다 ──
function makeWorld(name) {
  const root = path.join(tmp, name);
  const claudeDir = path.join(root, '_agent', 'claude'), codexDir = path.join(root, '_agent', 'codex');
  fs.mkdirSync(path.join(claudeDir, 'plugins'), { recursive: true }); fs.mkdirSync(codexDir, { recursive: true });
  const catalogFile = path.join(root, 'catalog.json'); fs.writeFileSync(catalogFile, JSON.stringify(CATALOG));
  const calls = [], failOn = new Set();
  const cj = () => path.join(claudeDir, '.claude.json'), ip = () => path.join(claudeDir, 'plugins', 'installed_plugins.json'), km = () => path.join(claudeDir, 'plugins', 'known_marketplaces.json'), ct = () => path.join(codexDir, 'config.toml');
  const toml = () => { try { return fs.readFileSync(ct(), 'utf8'); } catch { return ''; } };
  const dropTable = (hdr) => { const lines = toml().split(/\r?\n/); const out = []; let skip = false; for (const l of lines) { if (/^\s*\[/.test(l)) skip = l.trim().replace(/\s+#.*$/, '') === hdr; if (!skip) out.push(l); } fs.writeFileSync(ct(), out.join('\n')); }; // 진짜 CLI 처럼 머리 뒤 주석은 무시
  const run = async (exe, args) => {
    const key = `${exe} ${args.join(' ')}`; calls.push(key);
    for (const f of failOn) if (key.includes(f)) return { code: 1, out: '', err: `fake failure: ${f}` };
    const [a0, a1, a2, a3] = args;
    if (exe === 'claude' && a0 === 'mcp' && a1 === 'add') { const j = readJ(cj()) || {}; j.mcpServers = j.mcpServers || {}; j.mcpServers[args[6]] = { type: 'http', url: args[7] }; fs.writeFileSync(cj(), JSON.stringify(j)); return { code: 0, out: 'Added', err: '' }; }
    if (exe === 'claude' && a0 === 'mcp' && a1 === 'get') return { code: readJ(cj())?.mcpServers?.[a2] ? 0 : 1, out: '', err: '' };
    if (exe === 'claude' && a0 === 'mcp' && a1 === 'remove') { const j = readJ(cj()) || {}; if (j.mcpServers) delete j.mcpServers[a2]; fs.writeFileSync(cj(), JSON.stringify(j)); return { code: 0, out: '', err: '' }; }
    if (exe === 'codex' && a0 === 'mcp' && a1 === 'get') return { code: new RegExp(`^\\[mcp_servers\\.${a2}\\]`, 'm').test(toml()) ? 0 : 1, out: '', err: '' };
    if (exe === 'codex' && a0 === 'mcp' && a1 === 'remove') { dropTable(`[mcp_servers.${a2}]`); return { code: 0, out: '', err: '' }; }
    if (exe === 'claude' && a0 === 'plugin' && a1 === 'marketplace' && a2 === 'add') { const j = readJ(km()) || {}; j[MARKET] = { source: { source: 'directory', path: a3 } }; fs.writeFileSync(km(), JSON.stringify(j)); return { code: 0, out: '', err: '' }; }
    if (exe === 'claude' && a0 === 'plugin' && a1 === 'marketplace') return { code: 0, out: '', err: '' };
    if (exe === 'claude' && a0 === 'plugin' && a1 === 'install') { const j = readJ(ip()) || { plugins: {} }; j.plugins[a2] = [{ scope: 'user' }]; fs.writeFileSync(ip(), JSON.stringify(j)); return { code: 0, out: '', err: '' }; }
    if (exe === 'claude' && a0 === 'plugin' && a1 === 'uninstall') { const j = readJ(ip()) || { plugins: {} }; delete j.plugins[a2]; fs.writeFileSync(ip(), JSON.stringify(j)); return { code: 0, out: '', err: '' }; }
    if (exe === 'codex' && a0 === 'plugin' && a1 === 'marketplace' && a2 === 'add') { fs.writeFileSync(ct(), `${toml()}\n[marketplaces.${MARKET}]\nsource = "${a3.replace(/\\/g, '/')}"\n`); return { code: 0, out: '', err: '' }; }
    if (exe === 'codex' && a0 === 'plugin' && a1 === 'add') { fs.writeFileSync(ct(), `${toml()}\n[plugins."${a2}"]\nenabled = true\n`); return { code: 0, out: '', err: '' }; }
    if (exe === 'codex' && a0 === 'plugin' && a1 === 'remove') { dropTable(`[plugins."${a2}"]`); return { code: 0, out: '', err: '' }; }
    return { code: 9, out: '', err: `unexpected ${key}` };
  };
  let live = 0;
  const tm = new ToolManager({ root, claudeDir, codexDir, catalogFile, cacheDir: path.join(root, 'cache'), run, fetchImpl: fakeFetch, liveSessions: () => live, now: (() => { let t = 1e12; return () => ++t; })() });
  return { root, claudeDir, codexDir, tm, calls, failOn, setLive: (n) => { live = n; }, toml, ct };
}

// ── 1) 카탈로그 검사 ──
{
  ok(validateItem({ ...CATALOG.items[0] }).length === 0, '카탈로그: 올바른 스킬 항목 통과');
  ok(validateItem({ ...CATALOG.items[0], tested: null }).some((e) => /not tested/.test(e)), '카탈로그: 시험 기록 없으면 거절');
  ok(validateItem({ ...CATALOG.items[3], key: { env: 'X' } }).some((e) => /key/.test(e)), '카탈로그: 키 필요 도구 거절(첫 판)');
  ok(validateItem({ ...CATALOG.items[3], install: { via: 'http', url: 'http://plain.example/mcp' } }).length > 0, '카탈로그: https 아닌 MCP 주소 거절');
  const unp = JSON.parse(JSON.stringify(CATALOG.items[4])); unp.install.codex.unpinned = true;
  ok(validateItem(unp).some((e) => /unpinned/.test(e)), '카탈로그: 실행 때 판 고정 안 된 코드를 받는 플러그인 거절');
  const real = loadToolCatalog();
  ok(real.items.length >= 1 && real.errors.length === 0, `카탈로그: 저장소의 실제 목록 ${real.items.length}개가 오류 없이 읽힘`);
}

// ── 2) 압축·해시 ──
{
  ok(treeHash([{ path: 'b', data: Buffer.from('1') }, { path: 'a', data: Buffer.from('2') }]) === treeHash([{ path: 'a', data: Buffer.from('2') }, { path: 'b', data: Buffer.from('1') }]), '트리 해시: 순서와 무관');
  ok(treeHash([{ path: 'a\\b', data: Buffer.from('1') }]) === treeHash([{ path: 'a/b', data: Buffer.from('1') }]), '트리 해시: 경로 구분자 정규화');
  let thrown = ''; try { extractSubtree(ZIPS[`o/evil@${COMMIT}`], 'skills/evil'); } catch (e) { thrown = e.message; }
  ok(/unsafe path/.test(thrown), '압축: 경로 탈출 항목 거절');
  const clash = zipWrite([{ name: `r-${COMMIT}/s/a`, data: Buffer.from('1') }, { name: `r-${COMMIT}/s/a/b`, data: Buffer.from('2') }]);
  thrown = ''; try { extractSubtree(clash, 's'); } catch (e) { thrown = e.message; }
  ok(/clash|duplicate/.test(thrown), '압축: 파일·폴더 이름 충돌 거절');
  ok(/unsafe argument/.test((() => { try { cmdLine('claude', ['mcp', 'add', 'x&calc']); return ''; } catch (e) { return e.message; } })()), 'cmd: 위험 글자(&) 인자 거절');
  ok(cmdLine('codex', ['plugin', 'marketplace', 'add', 'C:\\IRIS tt\\m']) === 'codex plugin marketplace add "C:\\IRIS tt\\m"', 'cmd: 공백 경로는 따옴표');
  ok(codexPlugins('[plugins."a@m"]\nenabled = false\n[x]\n')[0].enabled === false, 'codexPlugins: 꺼짐 읽기');
}

// ── 3) 스킬 ──
{
  const w = makeWorld('skill');
  const r = await w.tm.install('demo-skill');
  ok(r.ok, '스킬: 설치 성공');
  ok(fs.existsSync(path.join(w.claudeDir, 'skills', 'demo-skill', 'SKILL.md')) && fs.existsSync(path.join(w.codexDir, 'skills', 'demo-skill', 'ref', 'a.txt')), '스킬: 클로드·코덱스 자리에 복사');
  const led = readJ(path.join(w.root, '_agent', 'setup', 'tools-installed.json'));
  ok(led.items['demo-skill'].state === 'installed' && led.items['demo-skill'].agents.claude.tree === SKILL_TREE, '스킬: 장부에 설치됨·지문');
  ok(w.tm.quickState(w.tm.item('demo-skill')).agents.codex === 'installed', '스킬: 상태 installed');
  ok((await w.tm.install('demo-skill')).ok === false, '스킬: 이미 있으면 다시 깔지 않음');
  const bad = await w.tm.install('bad-hash');
  ok(!bad.ok && /지문/.test(bad.error) && !fs.existsSync(path.join(w.claudeDir, 'skills', 'bad-hash')) && !readJ(path.join(w.root, '_agent', 'setup', 'tools-installed.json')).items['bad-hash'], '스킬: 지문 다르면 아무것도 안 만들고 장부에도 없음');
  const evil = await w.tm.install('evil');
  ok(!evil.ok && /unsafe/.test(evil.error), '스킬: 위험 경로 zip 거절');
  // 세션이 살아 있으면 제거 자체를 미룬다(코덱스 코드 검토 1·5 — 열린 세션이 쓰던 파일을 빼앗지 않음)
  w.setLive(1);
  const rm = await w.tm.remove('demo-skill');
  ok(rm.ok && rm.deferred && fs.existsSync(path.join(w.claudeDir, 'skills', 'demo-skill', 'SKILL.md')), '스킬 제거: 세션이 열려 있으면 「제거 대기」(폴더 그대로)');
  ok(w.tm.quickState(w.tm.item('demo-skill')).removeRequested === true, '스킬 제거: 상태에 removeRequested');
  ok((await w.tm.install('demo-skill')).ok === false, '제거 대기 중에는 다시 설치 안 됨(먼저 취소)');
  await w.tm.processPending();
  ok(fs.existsSync(path.join(w.claudeDir, 'skills', 'demo-skill')), '대기 처리: 세션이 남아 있으면 아무것도 안 함');
  ok((await w.tm.cancelRemove('demo-skill')).ok && !w.tm.quickState(w.tm.item('demo-skill')).removeRequested, '제거 취소');
  await w.tm.remove('demo-skill');
  w.setLive(0); await w.tm.processPending();
  ok(!fs.existsSync(path.join(w.claudeDir, 'skills', 'demo-skill')) && !fs.existsSync(path.join(w.codexDir, 'skills', 'demo-skill')), '대기 처리: 세션 0 이 되면 지문 확인 뒤 지움');
  ok(!readJ(path.join(w.root, '_agent', 'setup', 'tools-installed.json')).items['demo-skill'], '대기 처리: 장부에서 빠짐');
  ok(fs.readdirSync(path.join(w.root, '_agent', 'setup', 'tools-trash')).length === 0, '대기 처리: 휴지 자리도 비움(세션 0)');
  // 사용자가 고친 스킬은 지우지 않는다
  await w.tm.install('demo-skill');
  fs.appendFileSync(path.join(w.claudeDir, 'skills', 'demo-skill', 'SKILL.md'), '\n내가 고침\n');
  const rm2 = await w.tm.remove('demo-skill');
  ok(!rm2.ok && /바뀌어/.test(rm2.error) && fs.existsSync(path.join(w.claudeDir, 'skills', 'demo-skill', 'SKILL.md')), '스킬 제거: 사용자가 고친 것은 남김');
  ok(!fs.existsSync(path.join(w.codexDir, 'skills', 'demo-skill')), '스킬 제거: 고치지 않은 쪽(코덱스)은 지움');
  // 장부에 없는(직접 깐) 것은 지우지 않는다
  fs.mkdirSync(path.join(w.claudeDir, 'skills', 'mine'), { recursive: true });
  ok((await w.tm.remove('mine')).ok === false, '제거: 장부에 없는 도구는 서버가 거절');
}

// ── 4) 같은 이름이 따로 있으면 덮지 않음 ──
{
  const w = makeWorld('conflict');
  fs.mkdirSync(path.join(w.claudeDir, 'skills', 'demo-skill'), { recursive: true });
  fs.writeFileSync(path.join(w.claudeDir, 'skills', 'demo-skill', 'SKILL.md'), '내 것');
  const st = w.tm.quickState(w.tm.item('demo-skill'));
  ok(st.agents.claude === 'conflict' && st.agents.codex === 'absent', '충돌: 직접 깐 같은 이름 = conflict');
  const r = await w.tm.install('demo-skill');
  ok(r.ok && fs.readFileSync(path.join(w.claudeDir, 'skills', 'demo-skill', 'SKILL.md'), 'utf8') === '내 것', '충돌: 비어 있는 쪽(코덱스)만 깔고 직접 깐 것은 그대로');
}

// ── 5) 원격 MCP ──
{
  const w = makeWorld('mcp');
  fs.writeFileSync(w.ct(), 'model = "x"\r\n\r\n[mcp_servers.keep]\r\ncommand = "a"\r\n');
  const r = await w.tm.install('demo-mcp');
  ok(r.ok, 'MCP: 설치 성공');
  ok(readJ(path.join(w.claudeDir, '.claude.json')).mcpServers['demo-mcp'].url === 'https://mcp.example.com/mcp', 'MCP: 클로드 = 공식 mcp add --scope user --transport http');
  ok(w.calls.some((c) => c === 'claude mcp add --scope user --transport http demo-mcp https://mcp.example.com/mcp'), 'MCP: 클로드 명령 인자 정확');
  ok(!w.calls.some((c) => c.startsWith('codex mcp add')), 'MCP: 코덱스는 mcp add(즉시 로그인 대기)를 쓰지 않음');
  ok(/\r\n\[mcp_servers\.demo-mcp\]\r\nurl = "https:\/\/mcp\.example\.com\/mcp"\r\n$/.test(w.toml()) && /\[mcp_servers\.keep\]/.test(w.toml()), 'MCP: 코덱스 표 덧붙임(줄끝 CRLF 유지·기존 표 보존)');
  ok(fs.readdirSync(path.join(w.root, '_agent', 'setup', 'config-history')).some((n) => n.startsWith('config.toml.before-tools-demo-mcp')), 'MCP: 바꾸기 전 사본');
  const rm = await w.tm.remove('demo-mcp');
  ok(rm.ok && !readJ(path.join(w.claudeDir, '.claude.json')).mcpServers['demo-mcp'] && !/demo-mcp/.test(w.toml()) && /\[mcp_servers\.keep\]/.test(w.toml()), 'MCP: 제거 = 둘 다 빠지고 다른 MCP 는 그대로');
}

// ── 6) 플러그인 + 도중 실패 되돌리기 ──
{
  const w = makeWorld('plugin');
  const r = await w.tm.install('demo-plugin');
  ok(r.ok, '플러그인: 설치 성공');
  const cm = readJ(path.join(w.root, '_agent', 'shared', 'tools', 'markets', 'claude', '.claude-plugin', 'marketplace.json'));
  const om = readJ(path.join(w.root, '_agent', 'shared', 'tools', 'markets', 'codex', '.agents', 'plugins', 'marketplace.json'));
  ok(cm.name === MARKET && cm.plugins[0].source === './plugins/demo-plugin', '플러그인: 클로드 로컬 마켓 목록');
  ok(om.name === MARKET && om.plugins[0].source.path === './plugins/demo-plugin' && om.plugins[0].category === 'Productivity', '플러그인: 코덱스 로컬 마켓 목록(원본 항목 칸 유지)');
  ok(w.calls.includes('claude plugin install demo-plugin@iris-catalog --scope user') && w.calls.includes('codex plugin add demo-plugin@iris-catalog'), '플러그인: 공식 설치 명령');
  ok((await w.tm.remove('demo-plugin')).ok && !w.tm.claudePluginIds().has(`demo-plugin@${MARKET}`) && !w.tm.codexPluginIds().has(`demo-plugin@${MARKET}`), '플러그인: 제거');
  // 코덱스 설치가 실패하면 클로드에 깐 것도 되돌린다
  w.failOn.add('codex plugin add');
  const f = await w.tm.install('demo-plugin');
  ok(!f.ok && /codex 플러그인 설치 실패/.test(f.error), '실패: 원인 한 줄');
  ok(!w.tm.claudePluginIds().has(`demo-plugin@${MARKET}`), '실패: 먼저 깐 클로드 쪽을 되돌림');
  ok(!readJ(path.join(w.root, '_agent', 'setup', 'tools-installed.json')).items['demo-plugin'] && w.tm.status().items.find((i) => i.id === 'demo-plugin').state.error, '실패: 장부에 없음 · 상태에 오류 표시');
}

// ── 7) 중단 뒤 재개(reconcile) ──
{
  const w = makeWorld('reconcile');
  await w.tm.install('demo-skill');
  const lf = path.join(w.root, '_agent', 'setup', 'tools-installed.json');
  const l = readJ(lf);
  l.items['demo-skill'] = { kind: 'skill', state: 'installing', want: ['claude', 'codex'], agents: {} }; // 장부에 적기 직전에 끊긴 상황
  l.items['ghost'] = { kind: 'skill', state: 'installing', want: ['claude'], agents: {} };
  fs.writeFileSync(lf, JSON.stringify(l));
  const rc = await w.tm.reconcile();
  ok(rc.ok && rc.changed, '재개: 잠금 아래에서 장부 정리');
  const l2 = readJ(lf);
  ok(l2.items['demo-skill']?.state === 'installed' && Object.keys(l2.items['demo-skill'].agents).length === 2, '재개: 해시가 맞는 것은 우리 것으로 인정');
  ok(!l2.items['ghost'], '재개: 실제로 없는 것은 장부에서 지움');
  ok((await w.tm.remove('demo-skill')).ok, '재개: 인정한 것은 지울 수 있음(카탈로그 자리·지문으로)');
}

// ── 8) 동시 요청·잠금 ──
{
  const w = makeWorld('queue');
  const [a, b] = await Promise.all([w.tm.install('demo-skill'), w.tm.install('demo-mcp')]);
  ok(a.ok && b.ok, '큐: 동시에 두 개를 눌러도 차례로 둘 다 성공');
  const t0 = await w.tm.tryLock();
  ok(!!t0, '잠금: 끝나면 풀림(바로 다시 잡힘)'); await w.tm.unlock(t0);
  // 같은 영혼을 보는 두 번째 관리자(다른 데몬 흉내)가 잡고 있으면 거절 — 예외가 아니라 결과로
  const other = new ToolManager({ root: w.root, claudeDir: w.claudeDir, codexDir: w.codexDir, catalogFile: path.join(w.root, 'catalog.json'), cacheDir: path.join(w.root, 'cache'), run: async () => ({ code: 0, out: '', err: '' }), fetchImpl: fakeFetch });
  const tok = await other.tryLock();
  ok(!!tok, '잠금: 운영체제 파이프로 잡힘');
  ok((await w.tm.tryLock()) === null, '잠금: 이미 잡혀 있으면 두 번째는 못 잡음(같은 프로세스 안이라도)');
  const r = await w.tm.install('demo-plugin');
  ok(!r.ok && r.locked && /다른 IRIS/.test(r.error), '잠금: 잡혀 있으면 설치는 "다른 IRIS" 결과로 거절(예외 아님)');
  ok((await w.tm.reconcile()).locked === true && (await w.tm.processPending()).ok, '잠금: 재개·대기 처리도 같은 잠금을 기다림');
  await w.tm.unlock('not-mine'); ok((await w.tm.tryLock()) === null, '잠금: 남의 표식으로는 못 풂');
  await other.unlock(tok); const t1 = await w.tm.tryLock(); ok(!!t1, '잠금: 제 표식으로 풂'); await w.tm.unlock(t1);
  ok(lockPipeName(w.root) !== lockPipeName(path.join(tmp, 'another-soul')) && lockPipeName(w.root) === lockPipeName(w.root.toUpperCase()), '잠금 이름: 영혼 폴더마다 따로 · 대소문자 무관');
  // 다른 "프로세스"가 잠금을 쥔 채 죽으면 OS 가 바로 풀어 준다(낡은 잠금 개념 없음 — 코덱스 코드 검토 2~4차 잠금 경합의 근본 해결)
  const holder = spawn(process.execPath, ['-e', `require('net').createServer().listen(${JSON.stringify(lockPipeName(w.root))}, () => console.log('READY'))`], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((res) => { const t = setTimeout(res, 10_000); holder.stdout.on('data', (d) => { if (/READY/.test(d)) { clearTimeout(t); res(); } }); });
  const rr = await w.tm.install('demo-plugin');
  ok(!rr.ok && rr.locked, '잠금: 다른 프로세스가 쥐고 있으면 거절');
  holder.kill(); await new Promise((res) => holder.once('exit', res)); // 이 검사가 띄운 PID 하나만
  ok((await w.tm.install('demo-plugin')).ok, '잠금: 쥔 프로세스가 죽으면 곧바로 잡혀 진행');
}

// ── 9) 코덱스 config.toml 의 다른 모양 같은 이름 = 충돌(덮지 않음) ──
{
  for (const [label, text] of [
    ['머리 뒤 주석', '[mcp_servers.demo-mcp] # 내가 넣음\nurl = "https://mine.example/mcp"\n'],
    ['따옴표 머리', '[mcp_servers."demo-mcp"]\ncommand = "x"\n'],
    ['점 표기', 'mcp_servers.demo-mcp.url = "https://mine.example/mcp"\n'],
    ['[mcp_servers] 표 안', '[mcp_servers]\ndemo-mcp = { url = "https://mine.example/mcp" }\n'],
  ]) {
    const w = makeWorld(`toml-${label.length}-${Math.random().toString(36).slice(2, 6)}`);
    fs.writeFileSync(w.ct(), text);
    const st = w.tm.quickState(w.tm.item('demo-mcp'));
    const r = await w.tm.install('demo-mcp');
    ok(st.agents.codex === 'conflict' && w.toml() === text, `TOML ${label}: 충돌로 보고 코덱스 설정은 그대로`);
    ok(r.ok && !w.calls.some((c) => c.startsWith('codex mcp remove')), `TOML ${label}: 클로드 쪽만 깔고 사용자 것을 지우는 명령은 없음`);
  }
}

// ── 10) 설치 뒤 사용자가 바꾼 MCP 는 지우지 않음 ──
{
  const w = makeWorld('mcp-changed');
  await w.tm.install('demo-mcp');
  const j = readJ(path.join(w.claudeDir, '.claude.json')); j.mcpServers['demo-mcp'].url = 'https://mine.example/mcp'; fs.writeFileSync(path.join(w.claudeDir, '.claude.json'), JSON.stringify(j));
  const r = await w.tm.remove('demo-mcp');
  ok(!r.ok && /바뀌어/.test(r.error) && readJ(path.join(w.claudeDir, '.claude.json')).mcpServers['demo-mcp'].url === 'https://mine.example/mcp', 'MCP 제거: 사용자가 바꾼 클로드 설정은 남김');
  ok(!/demo-mcp/.test(w.toml()), 'MCP 제거: 그대로인 코덱스 쪽은 지움');
  ok(readJ(path.join(w.root, '_agent', 'setup', 'tools-installed.json')).items['demo-mcp']?.agents?.claude && readJ(path.join(w.root, '_agent', 'setup', 'tools-installed.json')).items['demo-mcp'].error, 'MCP 제거: 남긴 쪽은 장부에 사유와 함께');
}

// ── 11) 되돌리기도 실패하면 「정리 필요」로 장부에 남김 ──
{
  const w = makeWorld('undo-fail');
  w.failOn.add('codex plugin add'); w.failOn.add('claude plugin uninstall');
  const r = await w.tm.install('demo-plugin');
  const rec = readJ(path.join(w.root, '_agent', 'setup', 'tools-installed.json')).items['demo-plugin'];
  ok(!r.ok && /정리 필요/.test(r.error), '되돌리기 실패: 원인 + 정리 필요');
  ok(rec?.agents?.claude?.recovery === true && w.tm.claudePluginIds().has(`demo-plugin@${MARKET}`), '되돌리기 실패: 남은 클로드 쪽을 장부에 남김(「제거」로 정리 가능)');
  w.failOn.clear();
  ok((await w.tm.remove('demo-plugin')).ok && !w.tm.claudePluginIds().has(`demo-plugin@${MARKET}`), '되돌리기 실패 뒤: 「제거」로 정리됨');
}

// ── 12) 파일이 사용 중이면 지우지 않고 장부에 남김 ──
{
  const w = makeWorld('busy-file');
  await w.tm.install('demo-skill');
  const fd = fs.openSync(path.join(w.claudeDir, 'skills', 'demo-skill', 'SKILL.md'), 'r');
  let r;
  try { r = await w.tm.remove('demo-skill'); } finally { fs.closeSync(fd); }
  const rec = readJ(path.join(w.root, '_agent', 'setup', 'tools-installed.json')).items['demo-skill'];
  if (r.ok) ok(true, '사용 중 파일: 이 PC 에서는 열린 파일이 이름 바꾸기를 막지 않음(통과로 기록)');
  else ok(/사용 중/.test(r.error) && rec?.agents?.claude && fs.existsSync(path.join(w.claudeDir, 'skills', 'demo-skill')), '사용 중 파일: 지우지 않고 장부·폴더 그대로');
  if (!r.ok) ok((await w.tm.remove('demo-skill')).ok, '사용 중 파일: 닫은 뒤 다시 누르면 지워짐');
}

// ════ 코덱스 코드 검토 2차(2026-11-10 01:4x) 재현 시험 ════
const LEDGER = (w) => readJ(path.join(w.root, '_agent', 'setup', 'tools-installed.json'));

// B1) 「제거 취소」가 대기 처리보다 먼저 줄을 서면 취소가 이긴다
{
  const w = makeWorld('b1-cancel-race');
  await w.tm.install('demo-skill');
  w.setLive(1); await w.tm.remove('demo-skill'); w.setLive(0);
  const c = w.tm.cancelRemove('demo-skill'); // 줄만 서고 아직 안 돌았음
  const p = w.tm.processPending();          // 그 뒤에 대기 처리가 줄을 섬
  const [cr, pr] = await Promise.all([c, p]);
  ok(cr.ok && pr.ok && fs.existsSync(path.join(w.claudeDir, 'skills', 'demo-skill', 'SKILL.md')) && LEDGER(w).items['demo-skill'] && !LEDGER(w).items['demo-skill'].removeRequested, 'B1 취소가 먼저 줄 서면 대기 처리는 지우지 않음');
}

// B2·3차 1·4차) 잠금 경합: 여러 관리자가 한꺼번에 잡으려 해도 주인은 늘 하나(파이프), 잠금 파일은 만들지 않음
{
  const w = makeWorld('b2-lock');
  const mgrs = Array.from({ length: 6 }, () => new ToolManager({ root: w.root, claudeDir: w.claudeDir, codexDir: w.codexDir, catalogFile: path.join(w.root, 'catalog.json'), run: async () => ({ code: 0, out: '', err: '' }), fetchImpl: fakeFetch }));
  const toks = await Promise.all(mgrs.map((m) => m.tryLock()));
  ok(toks.filter(Boolean).length === 1, `잠금 경합: 6개가 동시에 잡아도 주인은 1개(${toks.filter(Boolean).length})`);
  await Promise.all(mgrs.map((m, i) => (toks[i] ? m.unlock(toks[i]) : null)));
  ok(!fs.existsSync(path.join(w.root, '_agent', 'setup', 'tools.lock')) && !fs.existsSync(path.join(w.root, '_agent', 'setup', 'tools.lock.reclaim')), '잠금 파일·되찾기 파일을 만들지 않음');
  // 오래된 판이 남긴 tools.lock 파일이 있어도 무시(새 잠금은 파일을 보지 않음)
  fs.mkdirSync(path.join(w.root, '_agent', 'setup'), { recursive: true });
  fs.writeFileSync(path.join(w.root, '_agent', 'setup', 'tools.lock'), JSON.stringify({ pid: process.ppid, token: 'old' }));
  const t = await w.tm.tryLock(); ok(!!t, '옛 잠금 파일이 남아 있어도 막히지 않음'); await w.tm.unlock(t);
}

// 4차) BOM 붙은 코덱스 설정도 읽고(바이트는 그대로), 해석 안 되는 설정은 이유를 그대로 보인다
{
  const w = makeWorld('bom');
  const orig = '﻿model = "x"\n';
  fs.writeFileSync(w.ct(), orig);
  ok((await w.tm.install('demo-mcp')).ok && w.toml().startsWith(orig), '4차 BOM 붙은 설정: 설치되고 앞부분 바이트 그대로');
  const w2 = makeWorld('unparsable-msg');
  fs.writeFileSync(w2.ct(), '[a]\nx = 1\n[a]\n');
  const st = w2.tm.quickState(w2.tm.item('demo-mcp'));
  ok(st.agents.codex === 'conflict' && /해석할 수 없어/.test(st.error || ''), '4차 해석 안 되는 설정 = 「충돌」 + 이유 글');
}

// 3차 4) 되돌리기에 실패해 남은 MCP 도 설치 때 정의를 기억 — 사용자가 머리글을 더했으면(주소는 그대로) 지우지 않음
{
  const w = makeWorld('r3-keep-def');
  w.failOn.add('codex mcp get'); w.failOn.add('claude mcp remove');
  const r = await w.tm.install('demo-mcp');
  const rec = LEDGER(w).items['demo-mcp'];
  ok(!r.ok && rec?.agents?.claude?.recovery && rec.agents.claude.def, '3차 되돌리기 실패로 남은 쪽도 설치 때 정의를 그대로 기록');
  w.failOn.clear();
  const j = readJ(path.join(w.claudeDir, '.claude.json')); j.mcpServers['demo-mcp'].headers = { X: '1' }; fs.writeFileSync(path.join(w.claudeDir, '.claude.json'), JSON.stringify(j));
  const rm = await w.tm.remove('demo-mcp');
  ok(!rm.ok && readJ(path.join(w.claudeDir, '.claude.json')).mcpServers['demo-mcp'].headers, '3차 주소가 같아도 정의가 다르면 복구 기록이라도 지우지 않음');
  // 정의 기록이 아예 없는 복구 기록(예: 끊긴 설치를 이어받음)은 IRIS 표준 정의와 똑같을 때만 지운다
  const w2 = makeWorld('r3-canonical');
  const cj = path.join(w2.claudeDir, '.claude.json');
  fs.writeFileSync(cj, JSON.stringify({ mcpServers: { 'demo-mcp': { type: 'http', url: 'https://mcp.example.com/mcp', headers: { A: 'b' } } } }));
  fs.mkdirSync(path.join(w2.root, '_agent', 'setup'), { recursive: true });
  fs.writeFileSync(path.join(w2.root, '_agent', 'setup', 'tools-installed.json'), JSON.stringify({ schema: 1, items: { 'demo-mcp': { kind: 'mcp', state: 'installed', agents: { claude: { adopted: true } } } } }));
  ok(!(await w2.tm.remove('demo-mcp')).ok && readJ(cj).mcpServers['demo-mcp'], '3차 정의 기록 없는 기록 + 표준과 다른 정의 → 지우지 않음');
  fs.writeFileSync(cj, JSON.stringify({ mcpServers: { 'demo-mcp': { url: 'https://mcp.example.com/mcp', type: 'http' } } }));
  ok((await w2.tm.remove('demo-mcp')).ok && !readJ(cj).mcpServers['demo-mcp'], '3차 표준 정의와 똑같으면(키 순서 무관) 지움');
}

// B3) TOML: 따옴표 붙은 mcp_servers · 뿌리 인라인 표 · 이스케이프 키 · 해석 불가 파일도 충돌 · 실패 되돌리기는 쓰기 전 바이트 그대로
{
  for (const [label, text] of [
    ['따옴표 mcp_servers', '["mcp_servers".demo-mcp]\nurl = "https://mine.example/mcp"\n'],
    ['뿌리 인라인 표', 'mcp_servers = { demo-mcp = { url = "https://mine.example/mcp" } }\n'],
    ['하위 표만', '[mcp_servers.demo-mcp.headers]\nX = "1"\n'],
    ['이스케이프 키', '[mcp_servers."demo-m\\u0063p"]\nurl = "https://mine.example/mcp"\n'],
    ['해석 불가 파일', '[a]\nx = 1\n[a]\ny = 2\n'],
  ]) {
    const w = makeWorld(`b3-${Math.random().toString(36).slice(2, 7)}`);
    fs.writeFileSync(w.ct(), text);
    const st = w.tm.quickState(w.tm.item('demo-mcp'));
    await w.tm.install('demo-mcp');
    ok(st.agents.codex === 'conflict' && w.toml() === text, `B3 ${label}: 충돌로 보고 코덱스 설정 그대로`);
  }
  // 관계없는 문장·주석 속 낱말은 충돌이 아니다(3차 2)
  for (const [label, text] of [
    ['문장 값 속 낱말', 'developer_instructions = "Use mcp_servers with demo-mcp"\n'],
    ['주석 속 낱말', 'model = "g" # mcp_servers demo-mcp\n'],
  ]) {
    const w = makeWorld(`b3n-${Math.random().toString(36).slice(2, 7)}`);
    fs.writeFileSync(w.ct(), text);
    const r = await w.tm.install('demo-mcp');
    ok(r.ok && w.tm.quickState(w.tm.item('demo-mcp')).agents.codex === 'installed' && w.toml().startsWith(text), `3차 ${label}: 충돌 아님 → 설치되고 기존 줄 그대로`);
  }
  // 따옴표 든 주석을 단 머리도 정의는 같다 → 제거됨(3차 3)
  {
    const w = makeWorld('b3-comment-quote');
    await w.tm.install('demo-mcp');
    fs.writeFileSync(w.ct(), w.toml().replace('[mcp_servers.demo-mcp]', "[mcp_servers.demo-mcp] # user's note"));
    const r = await w.tm.remove('demo-mcp');
    ok(r.ok && !/demo-mcp\]/.test(w.toml()), '3차 따옴표 든 주석만 단 것은 바뀐 것이 아님 → 제거됨');
  }
  const w = makeWorld('b3-undo-bytes');
  const orig = '# 내 설정\r\nmodel = "x"\r\n\r\n[mcp_servers.other]\r\nurl = "https://o.example/mcp"\r\n';
  fs.writeFileSync(w.ct(), orig);
  w.failOn.add('codex mcp get');
  const r = await w.tm.install('demo-mcp');
  ok(!r.ok && w.toml() === orig, 'B3 코덱스 확인 실패 → 설정 파일이 쓰기 전 바이트(CRLF·주석 포함) 그대로');
  ok(!w.calls.some((c) => c.startsWith('codex mcp remove')), 'B3 되돌리기에 코덱스 명령을 쓰지 않음(바이트 복원)');
}

// B4) 마켓 자리에 고친 내용이 있으면 휴지가 아니라 보관 자리로 — 휴지 비우기 뒤에도 남음
{
  const w = makeWorld('b4-kept');
  await w.tm.install('demo-plugin');
  await w.tm.remove('demo-plugin');
  const pdir = path.join(w.root, '_agent', 'shared', 'tools', 'markets', 'claude', 'plugins', 'demo-plugin');
  fs.writeFileSync(path.join(pdir, 'my-note.txt'), '내가 고친 것');
  ok((await w.tm.install('demo-plugin')).ok, 'B4 다시 설치는 됨');
  const keptDir = path.join(w.root, '_agent', 'setup', 'tools-kept');
  const kept = fs.existsSync(keptDir) ? fs.readdirSync(keptDir) : [];
  ok(kept.length === 1 && fs.readFileSync(path.join(keptDir, kept[0], 'my-note.txt'), 'utf8') === '내가 고친 것', 'B4 고친 내용은 보관 자리로 옮김');
  await w.tm.remove('demo-plugin'); await w.tm.purgeTrash();
  ok(fs.existsSync(path.join(keptDir, kept[0], 'my-note.txt')), 'B4 제거·휴지 비우기 뒤에도 보관본은 그대로');
}

// B6) 코덱스 설정을 못 읽으면(없음이 아닌 실패) 빈 것으로 보고 덮지 않는다
{
  const w = makeWorld('b6-unreadable');
  fs.mkdirSync(w.ct()); // config.toml 자리에 폴더 → 읽기 EISDIR
  const r = await w.tm.install('demo-mcp');
  ok(!r.ok && /읽지 못했습니다/.test(r.error) && fs.statSync(w.ct()).isDirectory(), 'B6 읽기 실패 = 설치 거절, 그 자리 그대로');
  ok(!readJ(path.join(w.claudeDir, '.claude.json'))?.mcpServers?.['demo-mcp'], 'B6 앞서 깐 클로드 쪽도 되돌림');
  const w2 = makeWorld('b6-concurrent');
  fs.writeFileSync(w2.ct(), 'model = "a"\n');
  const orig = w2.tm.codexTomlStrict.bind(w2.tm); let n = 0;
  w2.tm.codexTomlStrict = () => { n++; if (n === 2) fs.writeFileSync(w2.ct(), 'model = "changed-by-someone"\n'); return orig(); };
  const r2 = await w2.tm.install('demo-mcp');
  ok(!r2.ok && /다른 곳에서 바뀌어/.test(r2.error) && w2.toml() === 'model = "changed-by-someone"\n', 'B6 읽은 뒤 다른 프로그램이 고쳤으면 덮지 않음');
}

// B7) 끊긴 설치의 흔적이 카탈로그와 다르면 버리지도 지우지도 않고 「확인 필요」로 남김
{
  const w = makeWorld('b7-reconcile');
  const d = path.join(w.codexDir, 'skills', 'demo-skill'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'SKILL.md'), '반쯤 복사됨');
  fs.mkdirSync(path.join(w.root, '_agent', 'setup'), { recursive: true });
  fs.writeFileSync(path.join(w.root, '_agent', 'setup', 'tools-installed.json'), JSON.stringify({ schema: 1, items: { 'demo-skill': { kind: 'skill', state: 'installing', want: ['codex'], agents: {} } } }));
  await w.tm.reconcile();
  const rec = LEDGER(w).items['demo-skill'];
  ok(rec?.agents?.codex?.changed === true && /확인 필요/.test(rec.error || ''), 'B7 달라진 흔적은 기록으로 남김(확인 필요)');
  const rm = await w.tm.remove('demo-skill');
  ok(!rm.ok && fs.readFileSync(path.join(d, 'SKILL.md'), 'utf8') === '반쯤 복사됨', 'B7 그 흔적은 「제거」로도 지우지 않음(내용 다름)');
  const w2 = makeWorld('b7-removing');
  await w2.tm.install('demo-skill');
  const l = LEDGER(w2); l.items['demo-skill'].state = 'removing'; fs.writeFileSync(path.join(w2.root, '_agent', 'setup', 'tools-installed.json'), JSON.stringify(l));
  await w2.tm.reconcile();
  ok(LEDGER(w2).items['demo-skill']?.removeRequested === true, 'B7 끊긴 제거는 「제거 대기」로 이어 둠');
  await w2.tm.processPending();
  ok(!LEDGER(w2).items['demo-skill'] && !fs.existsSync(path.join(w2.claudeDir, 'skills', 'demo-skill')), 'B7 세션 0 이면 마저 지움');
}

// B8) 반쪽 zip 캐시는 지우고 다음에 새로 받음
{
  const w = makeWorld('b8-cache');
  const cf = w.tm.zipCacheFile('o/skills', COMMIT);
  fs.mkdirSync(path.dirname(cf), { recursive: true }); fs.writeFileSync(cf, Buffer.from('PK\x03\x04 truncated'));
  const r = await w.tm.install('demo-skill');
  ok(!r.ok && /풀지 못했습니다/.test(r.error) && !fs.existsSync(cf), 'B8 깨진 캐시 = 실패 + 캐시 지움');
  ok((await w.tm.install('demo-skill')).ok && fs.existsSync(cf), 'B8 다시 누르면 새로 받아 설치');
  ok(!fs.readdirSync(path.dirname(cf)).some((n) => /\.part-/.test(n)), 'B8 받는 중 임시 파일이 남지 않음');
}

// B9) 화면 목록 읽기도 주석 달린 머리를 본다
{
  const { codexPluginsIn, codexMcp } = await import('../daemon/tutorial.mjs');
  ok(codexPluginsIn('[plugins."github@iris-catalog"] # 내 메모\nenabled = true\n').length === 1, 'B9 화면 목록: 주석 달린 플러그인 머리');
  ok(codexMcp('[mcp_servers."context7"] # 메모\nurl = "https://x"\n')[0]?.name === 'context7', 'B9 화면 목록: 주석·따옴표 MCP 머리');
}

// 1차 4 보강) 주소는 같아도 정의에 무엇을 더했으면 지우지 않는다
{
  const w = makeWorld('def-changed');
  await w.tm.install('demo-mcp');
  const j = readJ(path.join(w.claudeDir, '.claude.json')); j.mcpServers['demo-mcp'].headers = { Authorization: 'Bearer ${MY}' }; fs.writeFileSync(path.join(w.claudeDir, '.claude.json'), JSON.stringify(j));
  fs.writeFileSync(w.ct(), w.toml().replace(/(url = "https:\/\/mcp\.example\.com\/mcp")/, '$1\nbearer_token_env_var = "MY"'));
  const r = await w.tm.remove('demo-mcp');
  ok(!r.ok && readJ(path.join(w.claudeDir, '.claude.json')).mcpServers['demo-mcp'].headers && /bearer_token_env_var/.test(w.toml()), '정의 비교: 주소가 같아도 더한 설정이 있으면 두 쪽 다 남김');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
