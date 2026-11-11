// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 도구 설치·제거 엔진(판 B, 2026-11-10 — 설계 정본 = docs\설계-도구화면-2026-11-10.md, 6-2절 = 코덱스 설계 검토 반영이 우선,
// 6-3절 = 코덱스 코드 검토 반영).
//   · 엄선 카탈로그(daemon/tools-catalog.json)에 있는 것만 깐다. 스킬 = 고정 커밋 폴더 복사(트리 해시 확인),
//     플러그인 = 고정 커밋을 IRIS 로컬 마켓플레이스(iris-catalog)에 풀어 두고 공식 CLI 로 설치, MCP = 원격 주소 등록.
//   · 설정 파일을 통째로 되돌리지 않는다 — 실패 때는 "이번에 내가 더한 것"만, 지금 모습이 내가 더한 그대로일 때만 뺀다.
//   · 장부(_agent\setup\tools-installed.json)에 먼저 의도를 적고 단계마다 갱신 → 데몬이 다시 뜨면 실제 상태와 맞춘다.
//   · 지우기 전에는 언제나 "지금 모습 = 설치한 그대로"를 다시 확인한다(사용자가 고치거나 바꿔 놓았으면 남긴다).
//   · 세션이 하나라도 열려 있으면 제거 자체를 미룬다(「제거 대기」) — 열린 세션이 쓰던 파일을 빼앗지 않는다.
//   · 장부를 바꾸는 모든 일은 배타 잠금 하나(_agent\setup\tools.lock) 아래에서만.
//   · 키가 필요한 도구는 받지 않는다(첫 판). 로그에는 명령 출력의 끝 몇 줄만.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { loadToolCatalog, TOOL_CATALOG_FILE, extractSubtree, treeHash, treeHashDir, writeTreeAtomic, allowedMcpUrl } from './toolcatalog.mjs';
import { parse as parseToml } from './vendor/smol-toml/parse.js';

export const MARKET = 'iris-catalog';
const CMD_TIMEOUT_MS = 180_000;
const ZIP_TIMEOUT_MS = 120_000, ZIP_MAX_BYTES = 200 * 1024 * 1024;
const META_RE = /["%!^&|<>()\r\n]/; // cmd.exe 가 다시 해석하는 글자 — 인자에 있으면 실행하지 않는다

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function writeJsonAtomic(f, data) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.tmp-${process.pid}`; fs.writeFileSync(t, JSON.stringify(data, null, 2), 'utf8'); fs.renameSync(t, f); }
const tail = (s, n = 6) => String(s || '').trim().split(/\r?\n/).slice(-n).join(' | ').slice(0, 600);

/** 도구 잠금의 이름(영혼 폴더마다 하나): 윈도 = 이름 있는 파이프, 그 밖 = 임시 폴더의 유닉스 소켓. */
export function lockPipeName(root) {
  // 같은 폴더를 짧은 이름(8.3)·연결 폴더·끝 \ 로 다르게 적어도 같은 이름이 되게 실제 경로로 바꾼 뒤 지문을 만든다
  // 있는 폴더인데 실제 경로를 못 구하면 null — 다른 철자로 다른 잠금이 생기지 않게 잠금을 거절한다(코덱스 코드 검토 5차 권고).
  // ⚠ 윈도가 아닌 곳(유닉스 소켓)의 "죽은 소켓 치우기"는 경합이 남아 있다 — 맥 판을 낼 때 OS 잠금으로 바꿀 것(5차).
  let p = path.resolve(root); try { p = fs.realpathSync.native(p); } catch { if (fs.existsSync(p)) return null; }
  const h = crypto.createHash('sha256').update(p.replace(/[\\/]+$/, '').toLowerCase()).digest('hex').slice(0, 24);
  return process.platform === 'win32' ? `\\\\.\\pipe\\iris-tools-${h}` : path.join(os.tmpdir(), `iris-tools-${h}.sock`);
}

/** cmd.exe /d /s /c "<exe> <args…>" 한 줄. 인자에 cmd 메타 글자가 있으면 거절(경로·이름은 우리가 만든 값뿐이다). */
export function cmdLine(exe, args) {
  for (const a of [exe, ...args]) if (META_RE.test(String(a))) throw new Error(`unsafe argument for cmd.exe: ${a}`);
  const q = (a) => (/[\s]/.test(a) || a === '' ? `"${a}"` : a);
  return [exe, ...args].map((a) => q(String(a))).join(' ');
}

/** 실제 실행기: 세션과 같은 환경(env)으로 claude/codex 를 cmd.exe 로 띄우고 끝까지 기다린다. 시간 초과 = 그 PID 가계도만 종료. */
export function makeRunner({ env = process.env, killTree = null } = {}) {
  return (exe, args, { timeoutMs = CMD_TIMEOUT_MS } = {}) => new Promise((resolve) => {
    let line; try { line = cmdLine(exe, args); } catch (err) { resolve({ code: -2, out: '', err: err.message }); return; }
    const child = spawn('cmd.exe', ['/d', '/s', '/c', `"${line}"`], { env, windowsVerbatimArguments: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    child.stdout.on('data', (d) => { out += d; if (out.length > 2e6) out = out.slice(-1e6); });
    child.stderr.on('data', (d) => { err += d; if (err.length > 2e6) err = err.slice(-1e6); });
    const timer = setTimeout(() => { if (done) return; err += `\n[timeout ${timeoutMs}ms]`; try { killTree ? killTree(child.pid) : child.kill(); } catch {} }, timeoutMs);
    child.on('error', (e) => { if (done) return; done = true; clearTimeout(timer); resolve({ code: -1, out, err: `${err}\n${e.message}` }); });
    child.on('close', (code) => { if (done) return; done = true; clearTimeout(timer); resolve({ code: code ?? -1, out, err }); });
  });
}

/** config.toml 의 [plugins."이름@마켓"] 머리(코덱스 플러그인 목록 — 화면·확인용). 머리 뒤 주석·공백·작은따옴표도 받는다. */
export function codexPlugins(toml) {
  const out = []; let cur = null;
  for (const line of String(toml || '').split(/\r?\n/)) {
    const h = /^\s*\[\s*plugins\s*\.\s*(["'])([^"']+)\1\s*\]\s*(#.*)?$/.exec(line);
    if (h) { const [name, market] = h[2].split('@'); cur = { agent: 'codex', name, market: market || '', enabled: true }; out.push(cur); continue; }
    if (/^\s*\[/.test(line)) { cur = null; continue; }
    if (!cur) continue;
    const en = /^\s*enabled\s*=\s*(true|false)/.exec(line); if (en) cur.enabled = en[1] === 'true';
  }
  return out;
}

/** config.toml 을 진짜 TOML 규칙으로 읽는다(smol-toml 1.5.2 동봉본, BSD-3 — daemon/vendor/smol-toml/LICENSE).
 *  글자 찾기로는 따옴표·이스케이프 키(context7)·인라인 표·주석·관계없는 문장을 다 가릴 수 없다(코덱스 코드 검토 3차 2·3). */
function tomlTry(text) {
  let t = String(text || '');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1); // 메모장 등이 붙이는 BOM 은 해석할 때만 뗀다(파일 바이트는 그대로 — 코덱스 코드 검토 4차)
  try { return { ok: true, data: parseToml(t) }; } catch (e) { return { ok: false, error: e.message }; }
}
const sortDeep = (o) => (Array.isArray(o) ? o.map(sortDeep) : o && typeof o === 'object' && !(o instanceof Date) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortDeep(o[k])])) : o);
const UNPARSABLE = '\u0001unparsable'; // 해석 못 한 설정의 정의 표식 — 어떤 기록과도 같지 않다(그래서 지우지도 덮지도 않는다)

/** 코덱스 config.toml 에 그 이름의 MCP 가 정의돼 있나. 해석이 안 되는 파일이면 "있다"(손대지 않음). */
export function codexMcpMentioned(toml, name) {
  const p = tomlTry(toml);
  if (!p.ok) return true;
  const ms = p.data.mcp_servers;
  return !!(ms && typeof ms === 'object' && Object.prototype.hasOwnProperty.call(ms, name));
}

/** 그 이름 MCP 의 코덱스 쪽 정의(비교용 = 키 정렬 JSON). 없으면 null, 해석 불가면 UNPARSABLE. 주석·줄끝·띄어쓰기에 흔들리지 않는다. */
export function codexMcpDef(toml, name) {
  const p = tomlTry(toml);
  if (!p.ok) return UNPARSABLE;
  const v = p.data.mcp_servers?.[name];
  return v === undefined || !Object.prototype.hasOwnProperty.call(p.data.mcp_servers || {}, name) ? null : JSON.stringify(sortDeep(v));
}
/** IRIS 가 직접 넣는 정의(장부에 정의가 없는 복구 기록의 비교 기준) — 이것과 똑같을 때만 지운다. */
export function canonicalMcpDef(agent, url) { return JSON.stringify(sortDeep(agent === 'claude' ? { type: 'http', url } : { url })); }

export class ToolManager {
  /**
   * root 영혼 폴더 · claudeDir CLAUDE_CONFIG_DIR · codexDir CODEX_HOME
   * run (exe, args, {timeoutMs}) => {code,out,err}(시험은 가짜) · fetchImpl codeload zip 받기 · cacheDir zip 보관
   * liveSessions () => 살아 있는 세션 수(이 수가 0 일 때만 실제 제거·휴지 비우기)
   */
  constructor({ root, claudeDir, codexDir, catalogFile = TOOL_CATALOG_FILE, cacheDir, run, fetchImpl = globalThis.fetch, log = () => {}, broadcast = () => {}, liveSessions = () => 0, now = () => Date.now() }) {
    Object.assign(this, { root, claudeDir, codexDir, catalogFile, run, fetchImpl, log, broadcast, liveSessions, now });
    this.cacheDir = cacheDir || path.join(root, '_agent', 'setup', 'tools-cache');
    this.ledgerFile = path.join(root, '_agent', 'setup', 'tools-installed.json');
    this.lockName = lockPipeName(root); this.locks = new Map(); // 잠금(파이프) — 표식 → 열린 서버
    this.trashDir = path.join(root, '_agent', 'setup', 'tools-trash');
    this.keptDir = path.join(root, '_agent', 'setup', 'tools-kept'); // 지우지 않고 남겨 두는 자리(자동으로 비우지 않음)
    this.marketDir = (agent) => path.join(root, '_agent', 'shared', 'tools', 'markets', agent);
    this.busy = null; // { id, op, step }
    this.chain = Promise.resolve();
    this.lastError = {}; // id → 마지막 실패 한 줄(데몬 메모리, 장부의 error 와 함께 보인다)
  }

  catalog() { return loadToolCatalog(this.catalogFile); }
  item(id) { return this.catalog().items.find((x) => x.id === id) || null; }
  ledger() { const j = readJson(this.ledgerFile); return j && j.schema === 1 && j.items && typeof j.items === 'object' ? j : { schema: 1, items: {} }; }
  saveLedger(l) { writeJsonAtomic(this.ledgerFile, l); }
  setStep(id, op, step) { this.busy = { id, op, step }; this.broadcast({ type: 'tools', busy: this.busy }); this.log(`tools: ${op} ${id} — ${step}`); }

  // ── 잠금: 배타 생성(wx) + 소유 표식. 같은 데몬 안은 큐, 데몬 사이는 이 파일 하나(코덱스 코드 검토 2) ──
  enqueue(fn) { const p = this.chain.then(fn, fn); this.chain = p.catch(() => {}); return p; }
  /** 잠금 = 운영체제의 이름 있는 파이프(윈도 \\.\pipe\iris-tools-<영혼 경로 지문>)를 여는 것.
   *  같은 이름은 한 번에 하나만 열리고(같은 프로세스 안에서도), 연 프로세스가 죽으면 OS 가 바로 풀어 준다 —
   *  파일 잠금처럼 "주인이 죽었나"를 시간·내용으로 짐작해 지우는 일이 없어 두 주인이 생길 틈이 없다
   *  (코덱스 코드 검토 2차 B2 · 3차 1·5 · 4차: 파일 기반 되찾기는 몇 겹을 쌓아도 경합이 남았다. 2026-11-10 실측: 같은/다른
   *  프로세스 모두 EADDRINUSE, 닫거나 프로세스가 죽으면 즉시 풀림). 윈도가 아니면 유닉스 소켓 파일(죽은 소켓만 치움). */
  async tryLock() {
    if (!this.lockName) throw new Error('IRIS 폴더의 실제 경로를 확인하지 못했습니다');
    const attempt = () => new Promise((resolve) => {
      const srv = net.createServer((c) => c.destroy());
      srv.once('error', (e) => resolve({ ok: false, code: e.code, err: e }));
      srv.listen(this.lockName, () => resolve({ ok: true, srv }));
    });
    let r = await attempt();
    if (!r.ok && r.code === 'EADDRINUSE' && process.platform !== 'win32') {
      const alive = await new Promise((res) => { const s = net.connect(this.lockName); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
      if (!alive) { try { fs.unlinkSync(this.lockName); } catch {} r = await attempt(); }
    }
    if (!r.ok) { if (r.code === 'EADDRINUSE') return null; throw r.err; }
    r.srv.unref(); // 잠금이 데몬 종료를 붙잡지 않게
    const token = crypto.randomBytes(8).toString('hex');
    this.locks.set(token, r.srv);
    return token;
  }
  /** 제 표식으로만 푼다(닫힐 때까지 기다림 — 바로 다음 잠금이 같은 이름을 다시 열 수 있게). */
  unlock(token) {
    const s = this.locks.get(token);
    if (!s) return Promise.resolve();
    this.locks.delete(token);
    return new Promise((res) => { try { s.close(() => res()); } catch { res(); } });
  }
  /** 잠금을 잡고 fn 을 돌린다. 못 잡으면 { ok:false, error } — 예외로 새지 않는다. 잡은 직후부터 try/finally(코덱스 코드 검토 7). */
  async withLock(fn, { quiet = false } = {}) {
    let token; try { token = await this.tryLock(); } catch (err) { return { ok: false, error: `잠금 파일을 만들지 못했습니다: ${err.message}` }; }
    if (!token) return { ok: false, error: quiet ? 'locked' : '다른 IRIS 가 도구를 설치·제거하는 중입니다 — 잠시 뒤 다시 누르세요', locked: true };
    try { return await fn(); } finally { await this.unlock(token); }
  }

  zipCacheFile(repo, commit) { return path.join(this.cacheDir, `${repo.replace('/', '__')}-${commit}.zip`); }
  /** 고정 커밋 zip(캐시 우선). 받을 때는 시간·크기 상한을 두고 임시 이름에 다 쓴 뒤에만 캐시 이름으로 옮긴다
   *  — 받다 끊긴 반쪽 파일이 캐시로 남아 계속 실패하는 일을 막는다(코덱스 코드 검토 2차 B8). */
  async zip(repo, commit) {
    const f = this.zipCacheFile(repo, commit);
    if (fs.existsSync(f)) return fs.readFileSync(f);
    let r;
    try { r = await this.fetchImpl(`https://codeload.github.com/${repo}/zip/${commit}`, { signal: AbortSignal.timeout(ZIP_TIMEOUT_MS) }); }
    catch (err) { throw new Error(`내려받기 실패(${repo}@${commit.slice(0, 7)}): ${err.name === 'TimeoutError' ? '시간 초과' : err.message}`); }
    if (!r.ok) throw new Error(`내려받기 실패(${repo}@${commit.slice(0, 7)}): HTTP ${r.status}`);
    if (Number(r.headers?.get?.('content-length') || 0) > ZIP_MAX_BYTES) throw new Error('내려받을 파일이 너무 큽니다');
    let buf;
    try { buf = Buffer.from(await r.arrayBuffer()); } catch (err) { throw new Error(`내려받기 실패(${repo}@${commit.slice(0, 7)}): ${err.name === 'TimeoutError' ? '시간 초과' : err.message}`); }
    if (buf.length > ZIP_MAX_BYTES) throw new Error('내려받은 파일이 너무 큽니다');
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const tmp = `${f}.part-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmp, buf); fs.renameSync(tmp, f);
    return buf;
  }
  /** 고정 커밋의 하위 폴더를 꺼내 트리 해시를 확인한다. 풀 수 없거나 다르면 throw + 그 zip 캐시를 지운다(다음엔 새로 받음). */
  async verifiedTree(spec) {
    const buf = await this.zip(spec.repo, spec.commit);
    const evict = () => { try { fs.rmSync(this.zipCacheFile(spec.repo, spec.commit), { force: true }); } catch {} };
    let files;
    try { files = extractSubtree(buf, spec.path === '.' ? '' : spec.path); }
    catch (err) { evict(); throw new Error(`받은 파일을 풀지 못했습니다(${err.message}) — 다시 누르면 새로 받습니다`); }
    const h = treeHash(files);
    if (h !== spec.treeSha256) { evict(); throw new Error(`지문이 맞지 않습니다(${h.slice(0, 12)} ≠ ${spec.treeSha256.slice(0, 12)}) — 설치하지 않았습니다`); }
    return files;
  }
  agentExe(agent) { return agent === 'claude' ? 'claude' : 'codex'; }
  async cli(agent, args, opts) {
    const r = await this.run(this.agentExe(agent), args, opts);
    this.log(`tools: ${agent} ${args.slice(0, 4).join(' ')} → ${r.code}${r.code ? ` ${tail(r.err || r.out, 3)}` : ''}`);
    return r;
  }

  // ── 지금 상태(파일만 보고 빠르게, CLI 안 부름) ──
  skillDir(agent, id) { return path.join(agent === 'claude' ? this.claudeDir : this.codexDir, 'skills', id); }
  claudePluginIds() { return new Set(Object.keys(readJson(path.join(this.claudeDir, 'plugins', 'installed_plugins.json'))?.plugins || {})); }
  codexToml() { try { return fs.readFileSync(path.join(this.codexDir, 'config.toml'), 'utf8'); } catch { return ''; } } // 화면·상태용(못 읽으면 빈 것)
  /** 바꾸기 전 읽기: 파일이 없을 때만 빈 것, 다른 실패(권한·공유 위반)는 throw — 못 읽은 것을 빈 설정으로 보고 덮지 않는다(코덱스 코드 검토 2차 B6). */
  codexTomlStrict() {
    try { return fs.readFileSync(path.join(this.codexDir, 'config.toml'), 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return ''; throw new Error(`코덱스 설정 파일을 읽지 못했습니다(${e.code || e.message}) — 바꾸지 않았습니다`); }
  }
  /** MCP 정의 전체(비교용 글): 클로드 = .claude.json 항목의 키 정렬 JSON, 코덱스 = codexMcpDef. 없으면 null. */
  mcpDef(agent, name) {
    if (agent === 'claude') {
      const v = readJson(path.join(this.claudeDir, '.claude.json'))?.mcpServers?.[name];
      if (!v) return null;
      const sort = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sort(o[k])])) : o);
      return JSON.stringify(sort(v));
    }
    return codexMcpDef(this.codexToml(), name);
  }
  codexPluginIds() { return new Set(codexPlugins(this.codexToml()).map((p) => `${p.name}@${p.market}`)); }
  async mcpExists(agent, name) { const r = await this.cli(agent, ['mcp', 'get', name], { timeoutMs: 60_000 }); return r.code === 0; }
  /** 그 이름의 MCP 주소: 없으면 null · 주소 없는 꼴(stdio·다른 모양)이면 '' · 코덱스는 [mcp_servers.x] 의 url 줄만 읽는다. */
  mcpUrl(agent, name) {
    if (agent === 'claude') { const v = readJson(path.join(this.claudeDir, '.claude.json'))?.mcpServers?.[name]; return v ? String(v.url || '') : null; }
    const p = tomlTry(this.codexToml());
    if (!p.ok) return ''; // 해석 불가 = "무언가 있음, 주소 모름" → 설치는 충돌, 제거는 거절
    const ms = p.data.mcp_servers;
    if (!ms || typeof ms !== 'object' || !Object.prototype.hasOwnProperty.call(ms, name)) return null;
    const v = ms[name];
    return v && typeof v === 'object' && typeof v.url === 'string' ? v.url : '';
  }

  /** 이 에이전트에 카탈로그 그대로의 것이 실제로 있나(해시·주소·IRIS 마켓) — 장부 없이도 "우리 것"이라고 말할 근거. */
  presentAsCatalog(it, a) {
    if (it.kind === 'skill') { const d = this.skillDir(a, it.id); try { return fs.existsSync(d) && treeHashDir(d) === it.install.treeSha256; } catch { return false; } }
    if (it.kind === 'mcp') return this.mcpUrl(a, it.id) === it.install.url;
    return (a === 'claude' ? this.claudePluginIds() : this.codexPluginIds()).has(`${it.install[a].plugin}@${MARKET}`);
  }
  /** 같은 이름이 무엇이든 있나. */
  presentAny(it, a) {
    if (it.kind === 'skill') return fs.existsSync(this.skillDir(a, it.id));
    if (it.kind === 'mcp') return this.mcpUrl(a, it.id) !== null;
    const name = it.install[a].plugin;
    return [...(a === 'claude' ? this.claudePluginIds() : this.codexPluginIds())].some((x) => x.split('@')[0] === name);
  }
  /** installed(장부에 있고 실재) · absent · conflict(같은 이름이 있는데 IRIS 가 깐 것이 아님 — 덮지 않음). */
  quickState(it) {
    const rec = this.ledger().items[it.id];
    const per = {};
    for (const a of it.agents) per[a] = rec?.agents?.[a] ? (this.presentAny(it, a) ? 'installed' : 'absent') : (this.presentAny(it, a) ? 'conflict' : 'absent');
    let error = rec?.error || this.lastError[it.id] || null;
    // 해석이 안 되는 코덱스 설정 때문에 「같은 이름 있음」으로 보이는 것이면 그 사실을 그대로 알린다(코덱스 코드 검토 4차)
    if (!error && it.kind === 'mcp' && per.codex === 'conflict' && !tomlTry(this.codexToml()).ok) error = 'Codex 설정 파일(config.toml)을 해석할 수 없어 IRIS 가 건드리지 않습니다 — 파일을 바로잡은 뒤 다시 여세요';
    return { agents: per, ledger: rec?.state || null, removeRequested: !!rec?.removeRequested, error };
  }

  /** 기본(설치 패키지가 넣은) 스킬 이름: 동봉 superpowers 의 skills 하위 폴더 + ui-ux-pro-max(설치기가 생성). */
  baseSkillNames() {
    const names = new Set(['ui-ux-pro-max']);
    const sp = path.join(this.root, '_agent', 'shared', 'skills', 'superpowers');
    try { for (const v of fs.readdirSync(sp)) { try { for (const s of fs.readdirSync(path.join(sp, v, 'skills'))) names.add(s); } catch {} } } catch {}
    return names;
  }
  /** listTools() 의 각 줄에 출처: base(기본 — 버튼 없음) · iris(IRIS 가 깐 것, catalogId) · manual(직접 설치함 — 버튼 없음). */
  annotate(list) {
    const cat = this.catalog();
    const led = this.ledger().items;
    const baseMcp = new Set(cat.base?.mcp || []), baseMarket = cat.base?.pluginMarket || 'iris-local', baseSkills = this.baseSkillNames();
    const mine = (kind, agent, key) => {
      for (const [id, rec] of Object.entries(led)) {
        if (rec.kind !== kind || !rec.agents?.[agent]) continue;
        const it = cat.items.find((x) => x.id === id);
        if (kind === 'plugin' && key === `${it?.install?.[agent]?.plugin}@${MARKET}`) return id;
        if (kind !== 'plugin' && key === id) return id;
      }
      return null;
    };
    const tag = (row, kind) => {
      if (kind === 'skills') { const id = mine('skill', row.agent, row.dir); return id ? { ...row, origin: 'iris', catalogId: id } : { ...row, origin: baseSkills.has(row.dir) ? 'base' : 'manual' }; }
      if (kind === 'mcp') { const id = mine('mcp', row.agent, row.name); return id ? { ...row, origin: 'iris', catalogId: id } : { ...row, origin: baseMcp.has(row.name) ? 'base' : 'manual' }; }
      const id = mine('plugin', row.agent, `${row.name}@${row.market}`);
      return id ? { ...row, origin: 'iris', catalogId: id } : { ...row, origin: row.market === baseMarket ? 'base' : 'manual' };
    };
    return { ...list, skills: (list.skills || []).map((r) => tag(r, 'skills')), mcp: (list.mcp || []).map((r) => tag(r, 'mcp')), plugins: (list.plugins || []).map((r) => tag(r, 'plugins')) };
  }
  status() {
    const cat = this.catalog();
    // baseIcons(v2.103): 기본 도구(설치 패키지가 깐 MCP)의 아이콘 — 카탈로그 base.icons, 화면 표시용 이름·파일만
    const baseIcons = {};
    for (const [n, v] of Object.entries(cat.base?.icons || {})) if (v && typeof v.icon === 'string') baseIcons[n] = { icon: v.icon };
    // knownIcons(v2.104): 직접 설치한 것 가운데 널리 쓰는 도구 — 이름과 별칭(aliases) 모두 소문자 열쇠로 펼친다
    const knownIcons = {};
    for (const [n, v] of Object.entries(cat.known || {})) {
      if (!v || typeof v.icon !== 'string') continue;
      for (const key of [n, ...(Array.isArray(v.aliases) ? v.aliases : [])]) if (typeof key === 'string') knownIcons[key.toLowerCase()] = { icon: v.icon };
    }
    return { busy: this.busy, errors: cat.errors, items: cat.items.map((it) => ({ ...it, state: this.quickState(it) })), baseIcons, knownIcons };
  }

  // ── 설치 ──
  install(id) { return this.enqueue(() => this.withLock(() => this.doInstall(id))); }
  async doInstall(id) {
    const it = this.item(id);
    if (!it) return { ok: false, error: '목록에 없는 도구입니다' };
    const st = this.quickState(it);
    if (st.removeRequested) return { ok: false, error: '제거 대기 중입니다 — 먼저 「제거 취소」를 누르세요' };
    const want = it.agents.filter((a) => st.agents[a] === 'absent');
    const clash = it.agents.filter((a) => st.agents[a] === 'conflict');
    if (!want.length) return { ok: false, error: clash.length ? `같은 이름의 도구가 이미 따로 설치돼 있습니다(${clash.join(', ')}) — IRIS 는 덮지 않습니다` : '이미 설치돼 있습니다' };
    const led = this.ledger();
    led.items[id] = { kind: it.kind, state: 'installing', want, startedAt: new Date(this.now()).toISOString(), agents: { ...(led.items[id]?.agents || {}) } };
    this.saveLedger(led);
    const added = []; // 되돌릴 것: { agent, undo } — undo 는 "지금 모습이 내가 더한 그대로일 때만" 지우고, 뺀 뒤 사라졌는지 확인한다
    try {
      for (const a of want) {
        this.setStep(id, 'install', `${a} 준비`);
        const rec = await this.installOne(it, a, added);
        const l2 = this.ledger(); l2.items[id].agents[a] = rec; this.saveLedger(l2);
      }
      const l3 = this.ledger(); Object.assign(l3.items[id], { state: 'installed', at: new Date(this.now()).toISOString() }); delete l3.items[id].error; this.saveLedger(l3);
      delete this.lastError[id];
      return { ok: true, agents: want, skipped: clash };
    } catch (err) {
      this.log(`tools: install ${id} failed — ${err.message}; rolling back ${added.length} step(s)`);
      const undoErrors = [];
      for (const u of added.reverse()) { try { await u.undo(); } catch (e) { undoErrors.push(`${u.agent}: ${e.message}`); } }
      // 되돌린 뒤에도 카탈로그 그대로 남아 있는 쪽은 장부에 남겨 「제거」로 정리할 수 있게(코덱스 코드 검토 6)
      const l4 = this.ledger();
      const keep = {};
      for (const [a, info] of Object.entries(l4.items[id]?.agents || {})) if (!want.includes(a)) keep[a] = info;
      // 설치 전에는 그 이름이 없던(absent) 쪽만 건드렸으므로, 되돌린 뒤 남은 것은 이 차례의 흔적이다 — 카탈로그와 같든 다르든 기록을 남긴다
      // (다르면 「제거」 가 지우지 않고 "바뀌어 지우지 않았습니다" 로 알린다 — 코덱스 코드 검토 2차 B7)
      let changed = false;
      // 이미 장부에 적은 그 에이전트의 기록(경로·지문·설치 때 정의)은 지우지 않고 그대로 둔 채 표시만 더한다(코덱스 코드 검토 3차 4)
      const prev = (a) => l4.items[id]?.agents?.[a] || {};
      for (const a of want) {
        if (this.presentAsCatalog(it, a)) keep[a] = { ...prev(a), recovery: true };
        else if (this.presentAny(it, a)) { keep[a] = { ...prev(a), recovery: true, changed: true }; changed = true; }
      }
      const msg = [err.message, undoErrors.length ? `정리 필요(${undoErrors.join('; ')})` : '', changed ? '남은 흔적은 내용이 달라 손대지 않았습니다 — 확인 필요' : ''].filter(Boolean).join(' · ');
      if (Object.keys(keep).length) l4.items[id] = { ...l4.items[id], state: 'installed', agents: keep, error: msg }; else delete l4.items[id];
      this.saveLedger(l4);
      this.lastError[id] = msg;
      return { ok: false, error: msg };
    } finally { this.busy = null; this.broadcast({ type: 'tools', busy: null, changed: id }); }
  }

  async installOne(it, a, added) {
    if (it.kind === 'skill') {
      const files = await this.verifiedTree(it.install);
      const dest = this.skillDir(a, it.id);
      this.setStep(it.id, 'install', `${a} 스킬 복사`);
      writeTreeAtomic(files, dest); // dest 가 이미 있으면 거절(덮지 않음)
      added.push({ agent: a, undo: async () => { if (fs.existsSync(dest) && treeHashDir(dest) === it.install.treeSha256) fs.rmSync(dest, { recursive: true, force: true }); if (fs.existsSync(dest)) throw new Error('복사한 스킬 폴더를 지우지 못했습니다'); } });
      const h = treeHashDir(dest);
      if (h !== it.install.treeSha256) throw new Error('복사한 스킬의 지문이 다릅니다');
      return { path: dest, tree: h, commit: it.install.commit };
    }
    if (it.kind === 'mcp') {
      const url = it.install.url;
      this.setStep(it.id, 'install', `${a} MCP 등록`);
      if (!allowedMcpUrl(it)) throw new Error('원격 주소(https) 또는 이 PC 안 프로그램 주소(127.0.0.1, 필요한 것 적힘)만 받습니다');
      if (this.mcpUrl(a, it.id) !== null || this.mcpDef(a, it.id) !== null) throw new Error(`${a} 에 같은 이름의 MCP 가 이미 있습니다`);
      let touched = false, wrote = null, addedDef = null;
      // 되돌리기는 실행 "전에" 등록하되, 내가 건드렸고 지금 정의가 "내가 막 넣은 정의(없으면 IRIS 표준 정의)"와 똑같을 때만 뺀다
      // (주소만 같다고 지우지 않는다 — 코덱스 코드 검토 1차 3·3차 4). 코덱스는 파일이 내가 쓴 바이트 그대로면 쓰기 전 바이트로 되돌린다(2차 B3).
      added.push({ agent: a, undo: async () => {
        if (!touched) return;
        if (a === 'codex' && wrote && this.codexTomlStrict() === wrote.after) { this.writeCodexToml(wrote.before, wrote.after); return; }
        const cur = this.mcpDef(a, it.id);
        if (cur === null) return;
        if (cur !== (addedDef || canonicalMcpDef(a, url))) throw new Error('등록한 MCP 가 그 사이 바뀌어 빼지 않았습니다');
        await this.cli(a, a === 'claude' ? ['mcp', 'remove', it.id, '--scope', 'user'] : ['mcp', 'remove', it.id]);
        if (this.mcpDef(a, it.id) !== null) throw new Error('등록한 MCP 를 빼지 못했습니다');
      } });
      if (a === 'claude') {
        touched = true;
        const r = await this.cli(a, ['mcp', 'add', '--scope', 'user', '--transport', 'http', it.id, url]);
        addedDef = this.mcpDef(a, it.id); // 명령이 실패했다고 해도 무엇이 남았는지 그대로 적어 둔다
        if (r.code !== 0) throw new Error(`claude MCP 등록 실패: ${tail(r.err || r.out, 2)}`);
      } else {
        // 코덱스 `mcp add --url` 은 등록 직후 OAuth 로그인을 시작해 브라우저 응답을 기다린다(도움말 "for the immediate login",
        // 2026-11-10 실측 3분 멈춤). 설치기(adapters.mcpTomlBlock)처럼 표 한 덩어리만 덧붙인다(바꾸기 전 사본).
        touched = true;
        wrote = this.appendCodexMcp(it.id, url);
        addedDef = this.mcpDef(a, it.id);
      }
      if (this.mcpUrl(a, it.id) !== url || !(await this.mcpExists(a, it.id))) throw new Error(`${a} 에 MCP 가 보이지 않습니다`);
      return { name: it.id, url, def: this.mcpDef(a, it.id) };
    }
    // plugin
    const spec = it.install[a];
    const files = await this.verifiedTree(spec);
    this.setStep(it.id, 'install', `${a} 마켓플레이스 준비`);
    const pdir = path.join(this.marketDir(a), 'plugins', it.id);
    // 마켓 자리에 다른 내용(이전 판이거나 사용자가 고친 것)이 있으면 지우지 않고 「보관」 자리로 옮긴다 — 휴지 비우기 대상이 아니다(코덱스 코드 검토 2차 B4)
    if (fs.existsSync(pdir) && treeHashDir(pdir) !== spec.treeSha256) {
      const kept = path.join(this.keptDir, `market-${a}-${it.id}-${this.now()}`);
      fs.mkdirSync(this.keptDir, { recursive: true }); fs.renameSync(pdir, kept);
      this.log(`tools: ${it.id} ${a} 마켓 자리의 다른 내용을 보관함 → ${kept}`);
    }
    if (!fs.existsSync(pdir)) writeTreeAtomic(files, pdir);
    this.writeMarketplace(a, it, spec);
    await this.ensureMarket(a);
    this.setStep(it.id, 'install', `${a} 플러그인 설치`);
    const sel = `${spec.plugin}@${MARKET}`;
    const has = () => (a === 'claude' ? this.claudePluginIds() : this.codexPluginIds()).has(sel);
    if (has()) throw new Error(`${a} 에 이미 설치돼 있습니다(장부 밖)`);
    added.push({ agent: a, undo: async () => { if (!has()) return; await this.cli(a, a === 'claude' ? ['plugin', 'uninstall', sel, '--scope', 'user'] : ['plugin', 'remove', sel]); if (has()) throw new Error('설치한 플러그인을 빼지 못했습니다'); } });
    const r = await this.cli(a, a === 'claude' ? ['plugin', 'install', sel, '--scope', 'user'] : ['plugin', 'add', sel]);
    if (r.code !== 0) throw new Error(`${a} 플러그인 설치 실패: ${tail(r.err || r.out, 2)}`);
    if (!has()) throw new Error(`${a} 에 플러그인이 보이지 않습니다`);
    return { plugin: sel, commit: spec.commit, tree: spec.treeSha256 };
  }

  /** 코덱스 config.toml 끝에 [mcp_servers.<id>] 표 한 덩어리를 덧붙인다(어떤 모양으로든 같은 이름이 있으면 거절). 바꾸기 전 사본 = _agent\setup\config-history. */
  appendCodexMcp(id, url) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || /["\\\r\n]/.test(url)) throw new Error('잘못된 MCP 이름·주소');
    const before = this.codexTomlStrict(); // 못 읽으면 throw — 빈 것으로 보고 덮지 않는다(2차 B6)
    if (codexMcpMentioned(before, id)) throw new Error('같은 이름의 코덱스 MCP 가 이미 있습니다');
    const hist = path.join(this.root, '_agent', 'setup', 'config-history');
    fs.mkdirSync(hist, { recursive: true });
    fs.writeFileSync(path.join(hist, `config.toml.before-tools-${id}-${this.now()}`), before, 'utf8');
    const eol = /\r\n/.test(before) ? '\r\n' : '\n';
    const sep = before === '' ? '' : before.endsWith('\n') ? eol : eol + eol;
    const block = [`[mcp_servers.${id}]`, `url = "${url}"`, ''].join(eol);
    const after = before + sep + block;
    this.writeCodexToml(after, before);
    return { before, after };
  }
  /** config.toml 을 원자적으로 바꾼다. expect 를 주면 옮기기 직전에 다시 읽어 그대로일 때만(그 사이 다른 프로그램이 고쳤으면 멈춤). */
  writeCodexToml(text, expect = null) {
    const file = path.join(this.codexDir, 'config.toml');
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    fs.mkdirSync(this.codexDir, { recursive: true });
    fs.writeFileSync(tmp, text, 'utf8');
    try {
      if (expect !== null && this.codexTomlStrict() !== expect) throw new Error('코덱스 설정 파일이 방금 다른 곳에서 바뀌어 손대지 않았습니다 — 다시 누르세요');
      fs.renameSync(tmp, file);
    } catch (err) { try { fs.rmSync(tmp, { force: true }); } catch {} throw err; }
  }

  /** IRIS 로컬 마켓플레이스 목록 파일에 이 플러그인 한 줄(없으면 만들고, 있으면 그 줄만 갈아 끼움). */
  writeMarketplace(agent, it, spec) {
    const mdir = this.marketDir(agent);
    const file = agent === 'claude' ? path.join(mdir, '.claude-plugin', 'marketplace.json') : path.join(mdir, '.agents', 'plugins', 'marketplace.json');
    const data = readJson(file) || (agent === 'claude' ? { name: MARKET, owner: { name: 'IRIS' }, plugins: [] } : { name: MARKET, interface: { displayName: 'IRIS' }, plugins: [] });
    data.plugins = (data.plugins || []).filter((p) => p?.name !== spec.plugin);
    data.plugins.push(agent === 'claude'
      ? { name: spec.plugin, source: `./plugins/${it.id}`, description: it.desc }
      : { ...(spec.entry || {}), name: spec.plugin, source: { source: 'local', path: `./plugins/${it.id}` } });
    writeJsonAtomic(file, data);
  }
  async ensureMarket(agent) {
    const mdir = this.marketDir(agent);
    const listed = agent === 'claude'
      ? !!readJson(path.join(this.claudeDir, 'plugins', 'known_marketplaces.json'))?.[MARKET]
      : new RegExp(`^\\s*\\[\\s*marketplaces\\s*\\.\\s*(["']?)${MARKET}\\1\\s*\\]`, 'm').test(this.codexToml());
    // 이미 등록됨: 코덱스는 로컬 폴더 마켓을 매번 새로 읽는다(`upgrade` 는 Git 마켓 전용 — 2026-11-10 실측 오류), 클로드만 목록을 다시 읽힌다.
    if (listed) { if (agent === 'claude') await this.cli(agent, ['plugin', 'marketplace', 'update', MARKET]); return; }
    const r = await this.cli(agent, agent === 'claude' ? ['plugin', 'marketplace', 'add', mdir, '--scope', 'user'] : ['plugin', 'marketplace', 'add', mdir]);
    if (r.code !== 0) throw new Error(`${agent} 마켓플레이스 등록 실패: ${tail(r.err || r.out, 2)}`);
  }

  // ── 제거: 세션이 열려 있으면 「제거 대기」로만 적고, 세션이 0 일 때 실제로 지운다(코덱스 코드 검토 1·5) ──
  remove(id) { return this.enqueue(() => this.withLock(() => this.doRemove(id))); }
  async doRemove(id) {
    const l = this.ledger();
    const rec = l.items[id];
    if (!rec) return { ok: false, error: 'IRIS 가 설치한 도구가 아니라 지울 수 없습니다' };
    if (this.liveSessions() > 0) {
      rec.removeRequested = true; this.saveLedger(l);
      this.broadcast({ type: 'tools', busy: null, changed: id });
      return { ok: true, deferred: true };
    }
    return this.executeRemove(id);
  }
  cancelRemove(id) {
    return this.enqueue(() => this.withLock(async () => {
      const l = this.ledger(); const rec = l.items[id];
      if (!rec?.removeRequested) return { ok: false, error: '제거 대기 중이 아닙니다' };
      delete rec.removeRequested; this.saveLedger(l);
      this.broadcast({ type: 'tools', busy: null, changed: id });
      return { ok: true };
    }));
  }
  /** 세션이 0 일 때 「제거 대기」 를 실제로 처리한다(데몬이 주기적으로 부른다). 잠금을 못 잡으면 다음 차례에. */
  processPending() {
    if (this.liveSessions() > 0) return Promise.resolve({ ok: true, waiting: true });
    if (!Object.values(this.ledger().items).some((r) => r.removeRequested)) return Promise.resolve({ ok: true, done: 0 }); // 빠른 길(잠금 없이 "할 일 없음"만 판단)
    return this.enqueue(() => this.withLock(async () => {
      // 대상은 잠금 "안에서" 다시 읽고, 하나씩 지우기 직전에 대기 표시가 그대로인지 또 본다 — 그 사이 「제거 취소」가 이긴다(코덱스 코드 검토 2차 B1)
      const ids = Object.entries(this.ledger().items).filter(([, r]) => r.removeRequested).map(([id]) => id);
      let done = 0;
      for (const id of ids) {
        if (this.liveSessions() > 0) break;
        const r = await this.executeRemove(id, { onlyIfRequested: true });
        if (r.ok && !r.skipped) done++;
      }
      return { ok: true, done };
    }, { quiet: true }));
  }

  async executeRemove(id, { onlyIfRequested = false } = {}) {
    const l0 = this.ledger(); const rec = l0.items[id];
    if (!rec) return { ok: true };
    if (onlyIfRequested && !rec.removeRequested) return { ok: true, skipped: true };
    const it = this.item(id);
    rec.state = 'removing'; this.saveLedger(l0);
    const errors = [];
    try {
      for (const [a, info] of Object.entries(rec.agents || {})) {
        this.setStep(id, 'remove', a);
        try { await this.removeOne(rec.kind, a, id, info, it); const l = this.ledger(); delete l.items[id].agents[a]; this.saveLedger(l); }
        catch (err) { errors.push(`${a}: ${err.message}`); }
      }
      const l2 = this.ledger();
      if (!Object.keys(l2.items[id]?.agents || {}).length) delete l2.items[id];
      else { l2.items[id].state = 'installed'; l2.items[id].error = errors.join(' · '); delete l2.items[id].removeRequested; }
      this.saveLedger(l2);
      this.purgeTrashUnlocked();
      if (errors.length) { this.lastError[id] = errors.join(' · '); return { ok: false, error: this.lastError[id] }; }
      delete this.lastError[id];
      return { ok: true };
    } finally { this.busy = null; this.broadcast({ type: 'tools', busy: null, changed: id }); }
  }

  /** 지우기 직전에 "지금 모습 = 설치한 그대로"를 다시 확인한다 — 다르면 남기고 이유를 돌려준다(코덱스 코드 검토 1·4). */
  async removeOne(kind, a, id, info, it) {
    if (kind === 'skill') {
      const p = info?.path || this.skillDir(a, id);
      const tree = info?.tree || it?.install?.treeSha256;
      if (!fs.existsSync(p)) return;
      if (!tree || treeHashDir(p) !== tree) throw new Error('설치 뒤 내용이 바뀌어 지우지 않았습니다(직접 고친 것으로 봄)');
      fs.mkdirSync(this.trashDir, { recursive: true });
      try { fs.renameSync(p, path.join(this.trashDir, `${a}-${id}-${this.now()}`)); }
      catch (err) { throw new Error(`파일이 사용 중이라 지우지 못했습니다(${err.code || err.message}) — 잠시 뒤 다시 시도하세요`); }
      return;
    }
    if (kind === 'mcp') {
      const want = info?.url || it?.install?.url;
      await this.restoreRelayed(a, id);
      const cur = this.mcpDef(a, id);
      if (cur === null) return;
      // 정의 전체(머리글·환경 변수·시간 제한 등)가 설치 때 적은 정의와 같을 때만. 정의를 적지 못한 복구 기록은
      // IRIS 표준 정의(클로드 {type:http,url} · 코덱스 {url})와 똑같을 때만 — 주소만 같다고 지우지 않는다(코덱스 코드 검토 1차 4·3차 4).
      if (cur !== (info?.def || canonicalMcpDef(a, want))) throw new Error('설치 뒤 MCP 설정이 바뀌어 지우지 않았습니다(직접 바꾼 것으로 봄)');
      const r = await this.cli(a, a === 'claude' ? ['mcp', 'remove', id, '--scope', 'user'] : ['mcp', 'remove', id]);
      if (this.mcpDef(a, id) !== null) throw new Error(`MCP 제거 실패: ${tail(r.err || r.out, 2)}`);
      return;
    }
    const sel = info?.plugin || `${it?.install?.[a]?.plugin || id}@${MARKET}`;
    const has = () => (a === 'claude' ? this.claudePluginIds() : this.codexPluginIds()).has(sel);
    if (!has()) return;
    const r = await this.cli(a, a === 'claude' ? ['plugin', 'uninstall', sel, '--scope', 'user'] : ['plugin', 'remove', sel]);
    if (has()) throw new Error(`플러그인 제거 실패: ${tail(r.err || r.out, 2)}`);
  }

  /** 설치기 업데이트가 이 MCP 를 중계기로 옮겨 놓았으면 그 하나만 되돌린다(전체 sync 를 부르지 않는다). */
  async restoreRelayed(agent, id) {
    const relayId = `${agent}.global.${id}`;
    const reg = path.join(this.root, '_agent', 'shared', 'mcp-relay', 'registry', `${relayId}.json`);
    if (!fs.existsSync(reg)) return;
    if (readJson(reg)?.state === 'released') return;
    const py = path.join(this.root, '_agent', 'shared', 'tools', 'python', 'python.exe');
    const relay = path.join(this.root, '_agent', 'shared', 'tools', 'mcp-relay', 'relay.py');
    if (!fs.existsSync(py) || !fs.existsSync(relay)) return;
    const r = await this.run(py, ['-I', relay, 'restore', '--id', relayId], { timeoutMs: 60_000 });
    if (r.code !== 0) throw new Error(`중계기 되돌리기 실패: ${tail(r.err || r.out, 2)}`);
  }

  /** 휴지 자리(IRIS 가 옮겨 놓은 것만 있는 곳)를 세션이 0 일 때만 비운다. 경로만 적어 두고 나중에 통째 지우는 일은 하지 않는다. */
  purgeTrashUnlocked() {
    if (this.liveSessions() > 0) return { purged: 0, waiting: true };
    let n = 0;
    try { for (const e of fs.readdirSync(this.trashDir)) { try { fs.rmSync(path.join(this.trashDir, e), { recursive: true, force: true }); n++; } catch {} } } catch {}
    return { purged: n, waiting: false };
  }
  purgeTrash() { return this.withLock(async () => this.purgeTrashUnlocked(), { quiet: true }); }

  /** 데몬 시작 때: 중간에 끊긴 설치·제거(installing/removing)를 실제 상태와 맞춘다(같은 잠금 아래 — 다른 데몬이 설치 중이면 건너뜀). */
  reconcile() {
    return this.withLock(async () => {
      const l = this.ledger();
      let changed = false;
      for (const [id, rec] of Object.entries(l.items)) {
        if (rec.state !== 'installing' && rec.state !== 'removing') continue;
        const it = this.item(id);
        const agents = {};
        // 끊긴 설치는 그 이름이 없던(absent) 쪽만 건드렸으므로 남은 것은 이 설치의 흔적이다 — 카탈로그와 같으면 이어받고,
        // 다르면 지우지도 버리지도 않고 「확인 필요」 기록으로 남긴다(제거는 내용이 다르면 거절, 코덱스 코드 검토 2차 B7)
        let changedAny = false;
        for (const a of new Set([...(rec.want || []), ...Object.keys(rec.agents || {})])) {
          if (!it || !it.agents.includes(a)) continue;
          if (this.presentAsCatalog(it, a)) agents[a] = rec.agents?.[a] || { adopted: true };
          else if (this.presentAny(it, a)) { agents[a] = { ...(rec.agents?.[a] || {}), recovery: true, changed: true }; changedAny = true; }
        }
        if (Object.keys(agents).length) {
          l.items[id] = { ...rec, state: 'installed', agents, reconciled: true };
          if (changedAny) l.items[id].error = '중간에 끊긴 작업의 흔적이 설치본과 달라 손대지 않았습니다 — 확인 필요';
          // 끊긴 제거 = 사용자가 지우기를 원했던 것 → 「제거 대기」로 두어 세션이 0 일 때 마저 처리(내용 확인은 그때 다시). 끊긴 설치는 대기 아님.
          if (rec.state === 'removing' && !changedAny) l.items[id].removeRequested = true; else delete l.items[id].removeRequested;
        } else delete l.items[id];
        changed = true;
        this.log(`tools: reconcile ${id} (${rec.state}) → ${Object.keys(agents).length ? 'installed ' + Object.keys(agents).join(',') : 'dropped'}`);
      }
      if (changed) this.saveLedger(l);
      this.purgeTrashUnlocked();
      return { ok: true, changed };
    }, { quiet: true });
  }
}
