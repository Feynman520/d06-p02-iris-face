// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// verify:agy-lock — 안티그래비티 화면 잠금 검사(2026-11-27 사용자 결정, 판정 = daemon/agents/antigravity.lock.mjs).
//   지키는 것: 일반 PC(열쇠 없음)에서 Antigravity 는 "보이지만 쓸 수 없고 「곧 열립니다」" — 안쪽 코드는 실려 있되 잠든다. Claude · Codex 의 판정은 이 잠금과 무관하다.
//   1절 열쇠      정확히 "open" 만 연다(없음 · 깨짐 · 다른 값 · 머리표 둘 = 잠김 · UTF-8 머리표 하나는 벗기고 읽는다) · 한 번만 읽는다 · 시험 상태 폴더의 열쇠만 본다 · 환경 변수로 여는 길 없음
//   2절 잠든다    잠긴 기본값에서(모듈을 직접 불러) 상태가 처음부터 locked · agy 실행 0 · 중계기 조회 0 · ~/.gemini 쓰기 0 · 상태 파일 0 · 전용 타이머 0 ·
//                 새 세션 · 에이전트 바꾸기 · 모델 바꾸기 · 수동 재개 · 자동 재개가 모두 거절되고 기존 프로세스 · 카드는 그대로(Claude 카드는 평소대로 열린다)
//   3절 시험 데몬 잠긴 데몬(3459)에 직접 요청 — 세션 생성 · 재개 · 바꾸기 = 400 「곧 열립니다」, 카드 보존, 상태 · hello 가 처음부터 locked, 도구 목록 · 로그인 감시에서 구글만 빠짐,
//                 기록기(fixtures/agy-lock-trace.mjs)로 센 안티그래비티 전용 실행 · 조회 · 쓰기 · 타이머 = 0. 같은 기록기를 열쇠가 있는 데몬에 대어 실제로 잡히는지 대조한다.
//   4절 화면 판정 app/agent-gate.js(순수 함수) — locked 가 다른 판정보다 먼저 · 안티그래비티 상태 여섯 가지를 바꿔도 Claude · Codex 판정과 "둘 다 꺼졌으면 막지 않는다" 예외가 같음
//   5절 화면      (playwright 가 있을 때) 잠긴 데몬의 실제 화면 — 단추 · 저장된 선택 옮기기 · 재개 · 바꾸기 막기 · 설정 세 곳 · 튜토리얼 덱의 설치 명령
//   실제 중계기(3456) · 실제 데몬(3458) · 실제 agy · 진짜 ~/.gemini · 진짜 영혼의 열쇠에 닿지 않는다 — 임시 폴더, 가짜 중계기(이 검사가 띄운 127.0.0.1 서버), 가짜 실행 파일 자리만 쓴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import cp from 'node:child_process';
import { once } from 'node:events';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const arg = (k) => { const a = process.argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a == null ? undefined : a.slice(k.length + 3); };
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2), 'utf8'); };
const KEY = 'iris-keys.json';
const OPEN = JSON.stringify({ antigravity: 'open' });
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]); // UTF-8 머리표(바이트로 만든다 — 소스에 그 글자를 적지 않는다)
const LOCK_SAY = /곧 열립니다/;

if (arg('child') !== undefined) { await child(arg('child')); }
else { await parent(); }

// ═════════════════════════ 자식 ═════════════════════════
// 부모가 환경 변수를 정해 띄운다. 결과는 표준 출력의 마지막 줄(JSON 하나).
async function child(mode) {
  if (mode === 'key') return childKey();
  if (mode === 'sleep') return childSleep();
  console.log(JSON.stringify({ error: `모르는 자식: ${mode}` })); process.exit(2);
}

/** 열쇠 판정 하나: 어느 파일을 읽었는지도 함께 적는다. AGYLOCK_AFTER = 판정 뒤에 열쇠 파일을 바꾸고 다시 묻는다(한 번만 읽는가). */
async function childKey() {
  const reads = [];
  const realRead = fs.readFileSync;
  fs.readFileSync = function (f, ...a) { if (typeof f === 'string' && path.basename(f) === KEY) reads.push(f); return realRead.call(this, f, ...a); };
  syncBuiltinESMExports();
  const first = process.env.AGYLOCK_IMPORT_FIRST || 'daemon/agents/antigravity.lock.mjs';
  await imp(first); // 서로 불러오는 모듈 — 어느 것을 먼저 불러와도 같아야 한다
  const lock = await imp('daemon/agents/antigravity.lock.mjs');
  const readsAtImport = reads.length; // 불러오는 것만으로는 읽지 않는다
  const a = lock.lockInfo();
  const out = { state: a.state, source: a.source, locked: lock.isLocked(), keyFile: lock.keyFile(), reads: [...reads], readsAtImport };
  const after = process.env.AGYLOCK_AFTER;
  if (after) {
    const f = lock.keyFile();
    if (after === 'write-open') { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, OPEN, 'utf8'); }
    if (after === 'delete') fs.rmSync(f, { force: true });
    out.after = { state: lock.lockInfo().state, locked: lock.isLocked(), reads: reads.length, sameObject: lock.lockInfo() === a };
  }
  console.log(JSON.stringify(out));
  process.exit(0);
}

/**
 * 잠긴 기본값에서 모듈을 직접 불러 돌려 본다. 울타리: 바깥 요청 · 프로세스 실행은 그 자리에서 막고 센다(진짜로 나가지 않는다),
 * 타이머 등록 · 파일 쓰기는 적는다, node-pty 는 가짜, taskkill 은 적기만 한다.
 */
async function childSleep() {
  const TMP = process.env.AGYLOCK_TMP, st = process.env.IRIS_FACE_STATE, gem = process.env.IRIS_GEMINI_DIR, soul = process.env.IRIS_ROOT;
  const work = path.join(TMP, 'work');
  const T = { fetch: 0, spawn: [], taskkill: [], timers: [], writes: [] };
  const out = {};
  globalThis.fetch = async () => { T.fetch++; throw new Error('울타리: 바깥 요청'); };
  cp.spawn = (file, args) => { T.spawn.push(`${path.basename(String(file))} ${(args || []).join(' ')}`.trim()); const e = new Error('울타리: 프로세스 실행'); e.code = 'EFENCE'; throw e; };
  cp.spawnSync = (file, args) => { const n = path.basename(String(file)); if (/^taskkill(\.exe)?$/i.test(n)) T.taskkill.push((args || []).join(' ')); else T.spawn.push(`sync ${n} ${(args || []).join(' ')}`.trim()); return { status: 0, stdout: '', stderr: '' }; };
  for (const fn of ['exec', 'execFile', 'execSync', 'execFileSync', 'fork']) cp[fn] = (file) => { T.spawn.push(`${fn} ${file}`); throw new Error('울타리: 프로세스 실행'); };
  for (const [fn, idx] of Object.entries({ writeFileSync: 0, appendFileSync: 0, mkdirSync: 0, renameSync: 1, copyFileSync: 1 })) { const orig = fs[fn]; fs[fn] = function (...a) { T.writes.push(String(a[idx])); return orig.apply(this, a); }; }
  for (const fn of ['setTimeout', 'setInterval']) { const orig = globalThis[fn]; globalThis[fn] = function (cb, ms, ...r) { T.timers.push((new Error().stack || '').split('\n').slice(2, 5).join(' | ')); return orig.call(this, cb, ms, ...r); }; }
  // 가짜 PID 만 살아 있는지 이 검사가 정한다(진짜 프로세스에 신호를 보내지 않는다)
  const FAKE0 = 2000000000; const alive = new Set(); const realKill = process.kill.bind(process);
  process.kill = (pid, sig) => { if (pid >= FAKE0) { if (!sig) { if (alive.has(pid)) return true; const e = new Error('kill ESRCH'); e.code = 'ESRCH'; throw e; } throw new Error('울타리: 가짜 PID 에 신호'); } if (sig === 0) return realKill(pid, sig); throw new Error('울타리: 진짜 PID 에 신호'); };
  syncBuiltinESMExports();
  const require = createRequire(import.meta.url);
  const pty = require('node-pty'); const ptySpawns = []; let nextPid = FAKE0 + 100;
  pty.spawn = (file, args, opts) => { nextPid += 4; alive.add(nextPid); ptySpawns.push({ file: `${path.basename(String(file))} ${(args || []).slice(0, 3).join(' ')}`, args: (args || []).map(String), cloud: opts?.env?.CLOUD_CODE_URL || null }); /* file = 실행 파일 + 앞 인수(공식 자리에 없으면 cmd.exe /c claude …) */ return { pid: nextPid, cols: opts.cols, rows: opts.rows, onData() {}, onExit() {}, write() {}, resize() {}, kill() {} }; };
  const code = (fn) => { try { fn(); return null; } catch (e) { return { code: e?.code || '', message: String(e?.message || e) }; } };

  const lock = await imp('daemon/agents/antigravity.lock.mjs');
  const ad = await imp('daemon/agents/antigravity.mjs');
  const stt = await imp('daemon/agents/antigravity.status.mjs');
  const gate = await imp('daemon/agents/antigravity.gate.mjs');
  const setup = await imp('daemon/agents/antigravity.setup.mjs');
  const agents = await imp('daemon/agents.mjs');
  let runs = 0; stt._setRunner(async () => { runs++; return { code: 0, out: '', err: '', error: null }; });
  out.lock = lock.lockInfo().state;
  out.first = { current: stt.current()?.state ?? null, brief: stt.brief().state, headline: stt.brief().headline };
  out.refresh = [(await stt.refresh()).state, (await stt.refresh({ force: true })).state, (await stt.refresh({ force: 'real' })).state];
  const tbl = JSON.stringify(agents.AGENTS.antigravity);
  out.models = { changed: await stt.refreshModels(agents.AGENTS.antigravity), same: JSON.stringify(agents.AGENTS.antigravity) === tbl };
  const g = await gate.refresh(); out.gate = { ok: g.ok, locked: !!g.locked, why: g.why };
  const pr = setup.prepare(work, soul); out.prepare = { ok: pr.ok, line: pr.line, why: pr.why };
  const env = { PATH: 'p' };
  out.preTrust = code(() => ad.preTrust(work, env)); out.preTrustEnv = Object.keys(env);
  out.readyCheck = code(() => ad.readyCheck(work));
  out.adapterLocked = ad.locked();

  // ── 세션 관리자: 미리 있던 카드 둘(끊긴 안티그래비티 카드 · 끊긴 클로드 카드) ──
  const { SessionManager } = await imp('daemon/sessions.mjs');
  const conv = 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb', cid = 'cccccccc-1111-4222-8333-dddddddddddd';
  const seed = [
    { id: 's1', cwd: work, agent: 'antigravity', model: 'gemini-4-argon', modelLabel: 'Gemini 4 Argon', modelActual: 'gemini-4-argon-high', effort: 'high', permission: '', approval: '', sandbox: '', status: 'idle', pid: FAKE0 + 4, sessionId: conv, recordPath: path.join(gem, 'antigravity-cli', 'brain', conv, 'transcript.jsonl'), resumeCmd: `agy --conversation ${conv}`, title: '옛 안티그래비티 대화', titleSource: 'user' },
    { id: 's2', cwd: work, agent: 'claude', model: 'opus', effort: 'high', status: 'busy', pid: FAKE0 + 8, sessionId: cid, title: '클로드 대화', titleSource: 'user' },
  ];
  fs.writeFileSync(path.join(st, 'sessions.json'), JSON.stringify(seed), 'utf8');
  const logs = [];
  const sm = new SessionManager(st, { onLog: (m) => logs.push(String(m)), codexHome: path.join(TMP, 'codex'), alignCodex: () => null });
  const card = () => JSON.stringify(sm.get('s1'));
  const card0 = card();
  out.loaded = sm.list().map((r) => `${r.id}:${r.agent}:${r.status}:${r.lost ? 'lost' : ''}`);
  // 새 세션(안티그래비티)
  out.create = code(() => sm.create({ cwd: work, agent: 'antigravity', model: 'gemini-4-argon', effort: 'high', prompt: '안녕' }));
  out.afterCreate = { cards: sm.list().length, pty: ptySpawns.length };
  // 수동 재개 · 모델 바꾸기(그 카드)
  out.resume = code(() => sm.resume('s1', { prompt: '' }));
  out.switchModel = code(() => sm.switchTo('s1', { model: 'gemini-4-neon', effort: 'high' }));
  out.cardSameAfterResume = card() === card0;
  // 살아 있는 클로드 세션 하나 → 안티그래비티로 에이전트 바꾸기(거절돼도 지금 프로세스 · 카드 그대로)
  const live = sm.create({ cwd: work, agent: 'claude', model: 'opus', effort: 'high', prompt: '' });
  const liveBefore = JSON.stringify({ agent: live.agent, pid: live.pid, cmdline: live.cmdline, status: live.status, sessionId: live.sessionId });
  out.liveCreated = { agent: live.agent, pty: ptySpawns.length, file: ptySpawns[ptySpawns.length - 1]?.file || '' };
  out.checkSwitch = code(() => { out.cross = sm.checkSwitch(live.id, 'antigravity'); });
  out.replace = code(() => sm.replaceAgent(live.id, { agent: 'antigravity', model: 'gemini-4-argon', effort: 'high', prompt: '이어받기' }));
  const liveNow = sm.get(live.id);
  out.afterReplace = { same: JSON.stringify({ agent: liveNow.agent, pid: liveNow.pid, cmdline: liveNow.cmdline, status: liveNow.status, sessionId: liveNow.sessionId }) === liveBefore, live: sm.live.has(live.id), taskkill: T.taskkill.length, pty: ptySpawns.length, previous: (liveNow.previous || []).length };
  // 자동 재개: 잠긴 안티그래비티 카드는 처음부터 빠지고, 클로드 카드는 평소대로 재개된다
  out.lostBefore = sm.lost().map((r) => r.id);
  out.resumeLost = sm.resumeLost({ enabled: true, gapMs: 0, note: '자동 재개' });
  await sleep(150);
  out.afterAuto = { cardSame: card() === card0, s2: sm.get('s2').status, pty: ptySpawns.length, lastFile: ptySpawns[ptySpawns.length - 1]?.file || '', agyLogs: logs.filter((m) => /^s1 /.test(m) || /antigravity/i.test(m)), failed: logs.filter((m) => /auto-resume failed/.test(m)) };
  sm.save();
  const saved = JSON.parse(fs.readFileSync(path.join(st, 'sessions.json'), 'utf8')).find((r) => r.id === 's1');
  out.saved = saved ? { agent: saved.agent, sessionId: saved.sessionId, recordPath: saved.recordPath === seed[0].recordPath, resumeCmd: saved.resumeCmd, title: saved.title } : null;
  // 도구 목록: 잠긴 동안에는 .gemini 를 읽지 않는다(antigravity: false)
  const { listTools } = await imp('daemon/tutorial.mjs');
  const home = path.join(TMP, 'home');
  const rest = (t) => JSON.stringify({ skills: t.skills.filter((x) => x.agent !== 'antigravity'), mcp: t.mcp.filter((x) => x.agent !== 'antigravity'), plugins: t.plugins.filter((x) => x.agent !== 'antigravity') });
  const withAgy = listTools(soul, { home }), without = listTools(soul, { home, antigravity: false });
  out.tools = { withAgy: withAgy.mcp.filter((x) => x.agent === 'antigravity').length, without: [...without.mcp, ...without.skills, ...without.plugins].filter((x) => x.agent === 'antigravity').length, othersSame: rest(withAgy) === rest(without) };

  // ── 끝: 남은 흔적 ──
  const exists = (p) => fs.existsSync(p);
  out.trace = {
    runs, fetch: T.fetch,
    agySpawns: T.spawn.filter((s) => /agy|antigravity/i.test(s)),
    agyPty: ptySpawns.filter((p) => /agy/i.test(p.file) || p.args.includes('agy') || p.cloud).length,
    agyTimers: T.timers.filter((s) => /antigravity\.[a-z]+\.mjs|antigravity\.mjs/.test(s)).length,
    timersTotal: T.timers.length,
    agyWrites: T.writes.filter((p) => { const l = p.toLowerCase(); return l.startsWith(gem.toLowerCase()) || /agy-logs|agy-models\.json|iris-agy-usage/.test(l) || l === String(process.env.IRIS_AGY_STATUS_FILE).toLowerCase(); }),
    gemini: exists(gem), agyLogs: exists(path.join(st, 'agy-logs')), models: exists(path.join(st, 'agy-models.json')), statusFile: exists(process.env.IRIS_AGY_STATUS_FILE), usageDir: exists(path.join(os.tmpdir(), 'iris-agy-usage')),
  };
  console.log(JSON.stringify(out));
  process.exit(0);
}

// ═════════════════════════ 부모 ═════════════════════════
async function parent() {
  let pass = 0, fail = 0;
  const ok = (c, n, extra = '') => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}${extra ? ` — ${extra}` : ''}`); } };
  const J = (v) => JSON.stringify(v);
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-lockchk-'));
  // 자식 · 시험 데몬에게는 바깥에서 흘러든 에이전트 · IRIS 값을 넘기지 않는다(이 검사가 정한 것만 준다)
  const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|CODEX|ANTHROPIC|OPENAI|IRIS|TEAMCLAUDE|AGYLOCK|NODE_OPTIONS$)/i.test(k)));
  const runChild = (mode, env) => {
    const r = cp.spawnSync(process.execPath, [SELF, `--child=${mode}`], { encoding: 'utf8', timeout: 120000, env: { ...cleanEnv(), ...env } });
    try { return JSON.parse(String(r.stdout).trim().split(/\r?\n/).pop()); } catch { return { error: `exit ${r.status}: ${String(r.stderr || r.stdout).slice(-700)}` }; }
  };
  const cleanups = [];
  // 이 검사는 "잠긴 기본값"의 검사다. 기본값을 'open' 으로 바꾼 판(잠금을 푸는 판)에서는 아래 항목 대부분이 뜻을 잃으므로 먼저 한 줄로 알리고 멈춘다 —
  // 실수로 열린 채 나가는 것을 막는 문턱이기도 하다. 사용자 결정으로 푸는 판이라면 이 검사를 그 판에서 함께 내린다(열쇠 · 화면 판정처럼 남길 것은 옮겨 남긴다).
  if (!/^export const lockDefault = 'locked';$/m.test(src('daemon/agents/antigravity.mjs'))) {
    console.log("FAIL 기본값이 'locked' 가 아니다(daemon/agents/antigravity.mjs 의 lockDefault) — 잠금을 푸는 판이면 사용자 결정을 확인한 뒤 이 검사(verify:agy-lock)를 함께 내리고, 아니면 그 한 줄을 'locked' 로 되돌린다");
    console.log('0 PASS / 1 FAIL'); process.exit(1);
  }
  try {
    await part1(); await part2(); await part4(); await part3and5();
  } catch (e) { fail++; console.log(`FAIL 검사가 중간에 멈춤 — ${e?.stack || e}`); }
  for (const f of cleanups.reverse()) { try { await f(); } catch {} }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  console.log(`${pass} PASS / ${fail} FAIL`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(fail ? 1 : 0), 300);

  // ───────────────────────── 1절 열쇠 ─────────────────────────
  async function part1() {
    // 부모에서는 순수 함수만 쓴다(lockInfo 를 부르지 않는다 = 이 PC 의 어떤 열쇠도 읽지 않는다)
    const lock = await imp('daemon/agents/antigravity.lock.mjs');
    const U = (s) => String.fromCharCode(0xFEFF) + s;
    ok(lock.keyOpens(OPEN) && lock.keyOpens('{ "antigravity" : "open", "other": 1 }\n'), '1 열쇠 글: 정확히 "open" = 열림(다른 키가 함께 있어도)');
    ok(lock.keyOpens(U(OPEN)) === true, '1 열쇠 글: 맨 앞 머리표(BOM) 하나는 벗기고 읽는다 — BOM 이 붙은 open 열쇠 = 열림');
    const bad = [U(U(OPEN)), '', ' ', '{', 'open', '"open"', '[]', '["antigravity","open"]', 'null', 'true', '{"antigravity":"OPEN"}', '{"antigravity":"Open"}', '{"antigravity":"open "}', '{"antigravity":" open"}', '{"antigravity":true}', '{"antigravity":1}', '{"antigravity":"locked"}', '{"antigravity":"yes"}', '{"antigravity":{"state":"open"}}', '{"antigravity":["open"]}', '{"Antigravity":"open"}', '{"agy":"open"}', '{"__proto__":{"antigravity":"open"}}', OPEN + OPEN, `${OPEN} x`];
    const badHit = bad.filter((t) => lock.keyOpens(t) !== false);
    ok(!badHit.length && [null, undefined, 1, {}, [], Buffer.from(OPEN)].every((t) => lock.keyOpens(t) === false), '1 열쇠 글: 그 밖은 전부 잠김(깨진 글 · 다른 값 · 대소문자 · 빈칸 · 머리표 둘 · 글이 아닌 값)', J(badHit));
    ok(J(lock.judgeLock('locked', OPEN)) === J({ state: 'open', source: 'key' }) && J(lock.judgeLock('locked', null)) === J({ state: 'locked', source: 'default' }) && J(lock.judgeLock('locked', '{')) === J({ state: 'locked', source: 'default' }), '1 판정: 기본값 locked + 여는 열쇠 = 열림 · 열쇠 없음 · 깨짐 = 잠김');
    ok(J(lock.judgeLock('open', null)) === J({ state: 'open', source: 'default' }) && ['OPEN', 'Open', '', undefined, true, 1, 'unlock'].every((d) => lock.judgeLock(d, null).state === 'locked'), "1 판정: 기본값이 정확히 'open' 이면 모든 PC 에서 열림 · 그 밖의 기본값 = 잠김");
    ok(lock.LOCKED_MESSAGE === 'Antigravity 는 아직 열리지 않았습니다. 곧 열립니다.' && lock.lockedError().code === 'AGY_LOCKED' && lock.lockedError().message === lock.LOCKED_MESSAGE && lock.KEY_FILE_NAME === KEY, '1 거절 글 · 오류 코드 · 열쇠 파일 이름');
    // 소스: 기본값 한 줄 · 판정 한 곳 · 환경 변수로 여는 길 없음
    const adSrc = src('daemon/agents/antigravity.mjs'), lockSrc = src('daemon/agents/antigravity.lock.mjs');
    ok((adSrc.match(/^export const lockDefault = /gm) || []).length === 1 && /^export const lockDefault = 'locked';$/m.test(adSrc), "1 기본값 한 줄: antigravity.mjs 의 lockDefault = 'locked'(푸는 값은 이 하나)");
    const code = lockSrc.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const envs = [...new Set([...code.matchAll(/env\.([A-Za-z_]+)/g)].map((m) => m[1]))];
    ok(J(envs) === J(['IRIS_FACE_STATE']) && !/process\.env\[/.test(code) && !/process\.argv/.test(code), '1 판정 모듈이 보는 환경 변수 = IRIS_FACE_STATE 하나(시험 격리) — 환경 변수 · 실행 인수로 여는 길 없음', J(envs));
    const walk = (dir, out = []) => { for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) { if (e.name === 'vendor' || e.name === 'tutorial' || e.name === 'fonts' || e.name === 'tool-icons') continue; const rel = `${dir}/${e.name}`; if (e.isDirectory()) walk(rel, out); else if (/\.(mjs|js|cjs|html)$/.test(e.name)) out.push(rel); } return out; };
    const files = [...walk('daemon'), ...walk('app'), 'launch.mjs'];
    const bare = (f) => src(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'); // 설명 줄은 빼고 본다
    const knowKey = files.filter((f) => /iris-keys/.test(bare(f)));
    const knowDefault = files.filter((f) => /lockDefault/.test(bare(f)));
    ok(J(knowKey) === J(['daemon/agents/antigravity.lock.mjs']) && J(knowDefault.sort()) === J(['daemon/agents/antigravity.lock.mjs', 'daemon/agents/antigravity.mjs']), '1 열쇠 파일 이름 · 기본값을 아는 곳 = 판정 모듈(과 기본값 한 줄)뿐 — 다른 자리는 판정 함수만 부른다', J({ knowKey, knowDefault }));

    // 실제로 읽어 본다(자식 프로세스 — 프로세스마다 한 번 정해지므로)
    let n = 0;
    const keyRun = ({ stateKey, soulKey, useState = true, after, first, extraEnv } = {}) => {
      const d = path.join(TMP, `k${++n}`), st = path.join(d, 'state'), soul = path.join(d, 'soul');
      const stKey = path.join(st, KEY), slKey = path.join(soul, '_agent', 'setup', KEY);
      fs.mkdirSync(st, { recursive: true }); fs.mkdirSync(path.dirname(slKey), { recursive: true });
      const put = (f, v) => { if (v === undefined) return; if (v === 'DIR') fs.mkdirSync(f); else fs.writeFileSync(f, v); };
      put(stKey, stateKey); put(slKey, soulKey);
      const r = runChild('key', { IRIS_ROOT: soul, ...(useState ? { IRIS_FACE_STATE: st } : {}), ...(after ? { AGYLOCK_AFTER: after } : {}), ...(first ? { AGYLOCK_IMPORT_FIRST: first } : {}), ...(extraEnv || {}) });
      return { ...r, stKey, slKey };
    };
    const same = (a, b) => path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
    let r = keyRun();
    ok(r.state === 'locked' && r.source === 'default' && r.locked === true && r.readsAtImport === 0 && r.reads?.length === 1 && same(r.reads[0], r.stKey), '1 열쇠 없음 = 잠김(기본값) · 불러오는 것만으로는 읽지 않음 · 읽는 자리 = 시험 상태 폴더', J(r));
    r = keyRun({ stateKey: OPEN });
    ok(r.state === 'open' && r.source === 'key' && r.locked === false, '1 시험 상태 폴더의 열쇠가 "open" = 열림', J(r));
    r = keyRun({ stateKey: Buffer.concat([BOM, Buffer.from(OPEN, 'utf8')]) });
    ok(r.state === 'open' && r.source === 'key', '1 BOM 이 붙은 open 열쇠 파일 = 열림(메모장 · 옛 PowerShell 로 만든 열쇠)', J(r));
    const lockedFiles = { '깨진 JSON': '{ "antigravity": "open"', '다른 값': '{"antigravity":"on"}', '잠금 값': '{"antigravity":"locked"}', '빈 파일': '', '대문자': '{"antigravity":"OPEN"}', '머리표 둘': Buffer.concat([BOM, BOM, Buffer.from(OPEN, 'utf8')]), 'UTF-16 글': Buffer.from(OPEN, 'utf16le'), '파일이 아니라 폴더': 'DIR' };
    const notLocked = Object.entries(lockedFiles).filter(([, v]) => keyRun({ stateKey: v }).state !== 'locked').map(([k]) => k);
    ok(!notLocked.length, `1 열쇠 파일이 ${Object.keys(lockedFiles).join(' · ')} = 전부 잠김`, J(notLocked));
    r = keyRun({ soulKey: OPEN });
    ok(r.state === 'locked' && r.reads.every((f) => same(f, r.stKey)) && !r.reads.some((f) => same(f, r.slKey)), '1 시험 격리: IRIS_FACE_STATE 가 있으면 영혼 폴더의 열쇠("open")를 읽지 않는다 = 잠김', J(r));
    r = keyRun({ soulKey: OPEN, useState: false });
    ok(r.state === 'open' && r.source === 'key' && same(r.keyFile, r.slKey) && /[\\/]_agent[\\/]setup[\\/]iris-keys\.json$/.test(r.keyFile), '1 실제 자리: <영혼>\\_agent\\setup\\iris-keys.json 의 "open" = 열림(IRIS_FACE_STATE 없음)', J(r));
    r = keyRun({ useState: false });
    ok(r.state === 'locked' && same(r.keyFile, r.slKey), '1 실제 자리에 열쇠가 없으면 잠김', J(r));
    r = keyRun({ after: 'write-open' });
    ok(r.state === 'locked' && r.after?.state === 'locked' && r.after.locked === true && r.after.reads === 1 && r.after.sameObject === true, '1 한 번만 읽는다: 도는 중에 열쇠가 생겨도 잠긴 채(반영 = 다시 켤 때)', J(r));
    r = keyRun({ stateKey: OPEN, after: 'delete' });
    ok(r.state === 'open' && r.after?.state === 'open' && r.after.reads === 1, '1 한 번만 읽는다: 도는 중에 열쇠가 없어져도 열린 채', J(r));
    r = keyRun({ extraEnv: { IRIS_AGY_LOCK: 'open', IRIS_AGY_OPEN: '1', IRIS_ANTIGRAVITY: 'open', IRIS_ANTIGRAVITY_LOCK: 'open', IRIS_FACE_AGY: 'open', IRIS_KEYS: OPEN, IRIS_AGY_KEY: 'open', ANTIGRAVITY: 'open', AGY_LOCK: 'open', IRIS_UNLOCK: 'antigravity' } });
    ok(r.state === 'locked', '1 환경 변수로는 열리지 않는다(그럴듯한 이름 열 개를 줘도 잠김)', J(r));
    const orders = ['daemon/agents/antigravity.mjs', 'daemon/agents/antigravity.gate.mjs', 'daemon/agents/antigravity.setup.mjs', 'daemon/agents/antigravity.status.mjs', 'daemon/agents.mjs', 'daemon/sessions.mjs', 'daemon/transcript.mjs'];
    const badOrder = orders.filter((f) => { const x = keyRun({ first: f }); return x.state !== 'locked' || x.readsAtImport !== 0; });
    ok(!badOrder.length, `1 어느 모듈을 먼저 불러와도 같은 판정 · 불러오기만으로는 열쇠를 읽지 않음(${orders.length}가지 순서)`, J(badOrder));
  }

  // ───────────────────────── 2절 잠든다(모듈을 직접 불러) ─────────────────────────
  async function part2() {
    const d = path.join(TMP, 'sleep'), st = path.join(d, 'state'), soul = path.join(d, 'soul'), gem = path.join(d, 'gemini'), ostmp = path.join(d, 'ostmp'), home = path.join(d, 'home');
    for (const x of [st, path.join(d, 'work'), ostmp, path.join(d, 'claude'), path.join(d, 'codex')]) fs.mkdirSync(x, { recursive: true });
    // 영혼 폴더의 진짜 자리에 "open" 을 놓아 둔다 — 시험 상태 폴더에는 없으므로 잠겨 있어야 한다
    wj(path.join(soul, '_agent', 'setup', KEY), { antigravity: 'open' });
    wj(path.join(home, '.gemini', 'config', 'mcp_config.json'), { mcpServers: { demo: { command: 'node' } } });
    const exe = path.join(d, 'fake-agy.exe'); fs.writeFileSync(exe, 'x'); // 실행 파일은 "있다" — 프로그램 없음(missing)이 아니라 잠금 때문에 안 도는 것을 본다
    const s = runChild('sleep', { AGYLOCK_TMP: d, IRIS_ROOT: soul, IRIS_FACE_STATE: st, IRIS_GEMINI_DIR: gem, IRIS_AGY_STATUS_FILE: path.join(d, 'agy-status.json'), IRIS_AGY_GATE_URL: 'http://127.0.0.1:9', IRIS_AGY_EXE: exe, CLAUDE_CONFIG_DIR: path.join(d, 'claude'), CODEX_HOME: path.join(d, 'codex'), TEMP: ostmp, TMP: ostmp });
    if (s.error) { ok(false, '2 잠긴 기본값에서 모듈을 돌려 봄', s.error); return; }
    const locked = (x) => x?.code === 'AGY_LOCKED' && LOCK_SAY.test(x.message);
    ok(s.lock === 'locked', '2 잠긴 기본값(영혼 폴더의 열쇠는 보지 않음)', J(s.lock));
    ok(s.first.current === 'locked' && s.first.brief === 'locked' && s.first.headline === null, '2 상태가 처음부터 locked — 아직 묻기 전의 current() · brief() 도(unknown 이 보이지 않음)', J(s.first));
    ok(J(s.refresh) === J(['locked', 'locked', 'locked']), '2 새로 읽기(보통 · 강제 · agy 를 실제로 띄워 보기)도 전부 locked', J(s.refresh));
    ok(s.models.changed === false && s.models.same, '2 모델 목록 갱신(refreshModels) = 하지 않음 · 목록 그대로', J(s.models));
    ok(s.gate.ok === false && s.gate.locked && LOCK_SAY.test(s.gate.why), '2 중계기 판정 새로 읽기 = 묻지 않고 막힘', J(s.gate));
    ok(s.prepare.ok === false && s.prepare.line === 'locked', '2 띄우기 직전 준비(prepare) = 하지 않음(~/.gemini 에 쓰지 않는다)', J(s.prepare));
    ok(locked(s.preTrust) && J(s.preTrustEnv) === J(['PATH']) && locked(s.readyCheck) && s.adapterLocked === true, '2 문턱 preTrust · readyCheck = 거절(AGY_LOCKED 「곧 열립니다」) · 환경에 길을 입히지 않음', J([s.preTrust, s.preTrustEnv, s.readyCheck]));
    ok(J(s.loaded) === J(['s1:antigravity:dead:lost', 's2:claude:dead:lost']), '2 (준비) 끊긴 카드 둘: 안티그래비티 · 클로드', J(s.loaded));
    ok(locked(s.create) && s.afterCreate.cards === 2 && s.afterCreate.pty === 0, '2 새 세션(안티그래비티) = 거절 · 카드가 생기지 않음 · 아무것도 띄우지 않음', J([s.create, s.afterCreate]));
    ok(locked(s.resume) && locked(s.switchModel) && s.cardSameAfterResume, '2 수동 재개 · 모델 바꾸기 = 거절 · 그 카드는 글자 하나 그대로', J([s.resume, s.switchModel]));
    ok(s.liveCreated.agent === 'claude' && s.liveCreated.pty === 1 && /claude/i.test(s.liveCreated.file), '2 잠긴 동안에도 Claude 세션은 평소대로 열린다', J(s.liveCreated));
    ok(s.checkSwitch === null && s.cross === true && locked(s.replace) && s.afterReplace.same && s.afterReplace.live && s.afterReplace.taskkill === 0 && s.afterReplace.pty === 1 && s.afterReplace.previous === 0, '2 에이전트 바꾸기(Claude → 안티그래비티) = 거절 · 지금 프로세스를 끄지 않음 · 카드 그대로', J([s.replace, s.afterReplace]));
    ok(J(s.lostBefore) === J(['s1', 's2']) && J(s.resumeLost) === J(['s2']), '2 자동 재개: 잠긴 안티그래비티 카드는 처음부터 빠지고 Claude 카드만 대상', J([s.lostBefore, s.resumeLost]));
    ok(s.afterAuto.cardSame && s.afterAuto.pty === 2 && /claude/i.test(s.afterAuto.lastFile) && !s.afterAuto.agyLogs.length && !s.afterAuto.failed.length, '2 자동 재개 뒤: Claude 카드는 다시 열림 · 안티그래비티 카드는 그대로 · 실패 기록 없음', J(s.afterAuto));
    ok(s.saved && s.saved.agent === 'antigravity' && s.saved.sessionId === 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb' && s.saved.recordPath && /^agy --conversation /.test(s.saved.resumeCmd) && s.saved.title === '옛 안티그래비티 대화', '2 카드와 기록 자리는 지우지 않는다(저장 파일에 그대로)', J(s.saved));
    ok(s.tools.withAgy === 1 && s.tools.without === 0 && s.tools.othersSame, '2 도구 목록: 잠긴 동안에는 안티그래비티 줄을 읽지 않음 · 다른 에이전트 줄은 같음', J(s.tools));
    const t = s.trace;
    ok(t.runs === 0 && !t.agySpawns.length && t.agyPty === 0, '2 agy 실행 0', J([t.runs, t.agySpawns, t.agyPty]));
    ok(t.fetch === 0, '2 중계기 조회 0(바깥 요청 0)', String(t.fetch));
    ok(!t.agyWrites.length && !t.gemini && !t.agyLogs && !t.models && !t.statusFile && !t.usageDir, '2 ~/.gemini 쓰기 0 · 상태 파일 0 · 기록 폴더 · 모델 저장 · 임시 폴더 만들지 않음', J(t));
    ok(t.agyTimers === 0 && t.timersTotal > 0, `2 안티그래비티 전용 타이머 0(이 프로세스가 건 타이머 ${t.timersTotal}개 가운데)`, J(t.agyTimers));
    // 로그인 감시 결과에서 구글 항목만 빼기(순수 함수)
    {
      const { withoutHidden } = await imp('daemon/auth.mjs');
      const it = (id, provider, level, expiresAt, more) => ({ id, provider, level, expiresAt, label: id, ...(more || {}) });
      const info = { items: [it('iris', 'anthropic', 'ok', 30), it('c', 'codex', 'soon', 20), it('g', 'google', 'expired', 10), it('o', 'anthropic', 'expired', 5, { optional: true })], worst: 'expired', due: ['c', 'g'], nextExpiry: { id: 'g', label: 'g', expiresAt: 10 }, extra: 'x' };
      const isG = (i) => i?.provider === 'google';
      const cut = withoutHidden(info, isG);
      ok(J(cut.items.map((i) => i.id)) === J(['iris', 'c', 'o']) && cut.worst === 'soon' && J(cut.due) === J(['c']) && cut.nextExpiry.id === 'c' && cut.extra === 'x' && info.items.length === 4, '2 로그인 감시 결과: 구글 항목만 빠지고 급한 정도 · 급한 항목 · 가장 먼저 끝나는 열쇠를 다시 셈(선택 항목은 세지 않음 · 받은 자료는 그대로)', J(cut));
      ok(withoutHidden(info, null) === info && withoutHidden(info, () => false) === info && withoutHidden(null, isG) === null && J(withoutHidden({ items: [it('g', 'google', 'expired', 1)] }, isG)) === J({ items: [], worst: 'ok', due: [], nextExpiry: null }), '2 로그인 감시 결과: 뺄 것이 없으면(열린 PC · 구글 계정 없음) 도구가 준 그대로');
    }
    // 소스: 문턱의 자리
    const ad = src('daemon/agents/antigravity.mjs');
    const pre = ad.slice(ad.indexOf('export function preTrust(cwd, env)'), ad.indexOf('export const readyCheck'));
    ok(pre.indexOf('assertOpen();') > 0 && pre.indexOf('assertOpen();') < pre.indexOf('fs.mkdirSync(logDir()') && pre.indexOf('assertOpen();') < pre.indexOf('prepare(cwd)'), '2 소스: preTrust 맨 앞이 잠금 문턱(기록 폴더 · 준비보다 먼저)');
    const stSrc = src('daemon/agents/antigravity.status.mjs');
    const refreshBody = stSrc.slice(stSrc.indexOf('export function refresh('), stSrc.indexOf('/** 시험용: agy 를 띄우는 함수'));
    ok(refreshBody.indexOf('if (isLocked()) return') > 0 && refreshBody.indexOf('if (isLocked()) return') < refreshBody.indexOf('agyExe()'), '2 소스: 상태 새로 읽기는 다른 판정(실행 파일 유무 · 중계기)보다 잠금이 먼저');
  }

  // ───────────────────────── 4절 화면 판정(순수 함수) ─────────────────────────
  async function part4() {
    const ctx = { window: {} }; vm.runInNewContext(src('app/agent-gate.js'), ctx); const G = ctx.window.AgentGate;
    // 옛 판정(2026-11-27 이전 main.js 의 agentOff · agentBlock 그대로) — 잠금이 아닌 상태에서는 지금 판정이 이것과 같아야 한다
    const oldOff = (AGENTS, ACCT, AGY) => {
      const off = {};
      for (const k of ACCT?.missing || []) if (AGENTS[k]) off[k] = 'missing';
      const acc = ACCT?.accounts;
      const relayKeys = Object.keys(AGENTS).filter((k) => k !== 'antigravity');
      if (acc) for (const k of relayKeys) if (!off[k] && acc[k] === 0) off[k] = 'account';
      const base = Object.keys(off).length >= relayKeys.length ? {} : off;
      if (AGENTS.antigravity) { if (AGY?.state === 'missing') return { ...base, antigravity: 'missing' }; if (AGY?.state === 'auth') return { ...base, antigravity: 'account' }; if (AGY?.state === 'gate') return { ...base, antigravity: 'gate' }; }
      return base;
    };
    const oldBlock = (k, AGENTS, ACCT, AGY) => {
      if (!AGENTS?.[k]) return 'missing';
      if ((ACCT?.missing || []).includes(k)) return 'missing';
      if (k === 'antigravity') return AGY?.state === 'missing' ? 'missing' : AGY?.state === 'auth' ? 'account' : AGY?.state === 'gate' ? 'gate' : '';
      return ACCT?.accounts && ACCT.accounts[k] === 0 ? 'account' : '';
    };
    const AG3 = { claude: {}, codex: {}, antigravity: {} }, AG2 = { claude: {}, codex: {} };
    const A = (c, x) => ({ claude: c, codex: x });
    const ACCTS = [null, { missing: [], accounts: null }, { missing: [], accounts: A(1, 1) }, { missing: [], accounts: A(0, 2) }, { missing: [], accounts: A(2, 0) }, { missing: [], accounts: A(0, 0) },
      { missing: ['claude'], accounts: A(0, 1) }, { missing: ['codex'], accounts: A(1, 0) }, { missing: ['claude', 'codex'], accounts: A(0, 0) }, { missing: ['claude'], accounts: null }, { missing: ['claude', 'codex'], accounts: null },
      { missing: ['antigravity'], accounts: A(1, 1) }, { missing: ['claude', 'antigravity'], accounts: A(0, 1) }, { missing: ['antigravity'], accounts: A(0, 0) }];
    const STATES = ['locked', 'missing', 'auth', 'gate', 'ok', 'unknown'];
    const AGYS = [...STATES.map((state) => ({ state })), null];
    const two = (o) => J({ claude: o.claude ?? null, codex: o.codex ?? null });
    const sorted = (o) => J(Object.entries(o).sort());
    const bad = { vary: [], old: [], open: [], block: [], lock: [] };
    for (const AG of [AG3, AG2]) for (const acct of ACCTS) {
      const ref = two(oldOff(AG, acct, null));
      for (const agy of AGYS) {
        const now = G.off(AG, acct, agy);
        if (two(now) !== ref) bad.vary.push([Object.keys(AG).length, acct, agy, now]);                                   // 안티그래비티 상태가 Claude · Codex 판정을 바꾸면 안 된다
        if (agy?.state !== 'locked' && sorted(now) !== sorted(oldOff(AG, acct, agy))) bad.open.push([acct, agy, now]);     // 잠금이 아닌 상태 = 예전과 글자까지 같다
        if (agy?.state === 'locked' && (AG.antigravity ? now.antigravity !== 'locked' : 'antigravity' in now)) bad.lock.push([acct, now]); // 잠금은 언제나(예외 밖) · 단추가 없는 PC 에는 만들지 않는다
        for (const k of ['claude', 'codex']) if (G.block(k, AG, acct, agy) !== oldBlock(k, AG, acct, null)) bad.block.push([k, acct, agy]);
        const want = !AG.antigravity ? 'missing' : agy?.state === 'locked' ? 'locked' : oldBlock('antigravity', AG, acct, agy);
        if (G.block('antigravity', AG, acct, agy) !== want) bad.block.push(['antigravity', acct, agy, G.block('antigravity', AG, acct, agy)]);
      }
    }
    ok(!bad.vary.length, `4 안티그래비티 상태 ${STATES.length}가지(+ 아직 모름)를 바꿔도 Claude · Codex 단추 판정이 같다(계정 · 프로그램 조합 ${ACCTS.length}가지 × 단추 2 · 3개)`, J(bad.vary.slice(0, 3)));
    ok(!bad.open.length, '4 잠금이 아닌 상태(missing · auth · gate · ok · unknown)의 판정은 예전과 글자까지 같다', J(bad.open.slice(0, 3)));
    ok(!bad.lock.length, '4 잠금은 다른 판정보다 먼저 · 언제나 건다(프로그램 없음으로 적힌 PC 에서도) · 안티그래비티 단추가 없는 PC 에는 만들지 않는다', J(bad.lock.slice(0, 3)));
    ok(!bad.block.length, '4 단추로 여는 대화의 판정(block): Claude · Codex 는 안티그래비티 상태와 무관 · 안티그래비티는 잠금이 먼저', J(bad.block.slice(0, 3)));
    const both = { missing: [], accounts: A(0, 0) };
    ok(AGYS.every((agy) => { const o = G.off(AG3, both, agy); return !o.claude && !o.codex; }) && G.off(AG3, both, { state: 'locked' }).antigravity === 'locked' && J(G.off(AG3, both, { state: 'ok' })) === '{}', '4 "둘 다 꺼졌으면 막지 않는다" 예외는 그대로 — 잠금은 그 예외 밖(둘이 풀려도 안티그래비티는 잠긴 채)');
    ok(G.block('antigravity', AG3, both, { state: 'locked' }) === 'locked' && G.block('claude', AG3, both, { state: 'locked' }) === 'account', '4 block 에는 그 예외가 없다(예전 그대로) · 잠긴 안티그래비티 = locked');
    ok(G.tip('antigravity', 'locked') === 'Antigravity 는 준비 중입니다. 곧 열립니다.' && G.LOCK_TAG === '곧 열립니다' && G.word('locked') === '곧 열립니다' && G.locked({ state: 'locked' }) && !G.locked({ state: 'ok' }) && !G.locked(null), '4 잠금 글: 말풍선 · 꼬리표 「곧 열립니다」');
    ok(!/설치|antigravity\.google|agy|로그인|대시보드/.test(G.tip('antigravity', 'locked')) && /공식 설치/.test(G.tip('antigravity', 'missing')), '4 잠긴 말풍선에는 설치 · 로그인 안내가 없다(열린 PC 의 안내 글은 그대로)');
    ok(G.tip('claude', 'missing') === 'Claude · 프로그램 없음 — IRIS 설치 파일을 다시 실행하면 받습니다' && G.tip('codex', 'account') === 'Codex · 계정 연결 안 됨 — 대시보드에서 계정을 추가하면 켜집니다' && J(['missing', 'gate', 'account'].map(G.word)) === J(['프로그램 없음', '중계기를 쓸 수 없음', '계정 연결 안 됨']), '4 Claude · Codex 의 말풍선 · 까닭 낱말은 예전 그대로');
    // 화면 코드(소스): 판정을 쓰는 자리 · 막는 자리
    const main = src('app/main.js'), html = src('app/index.html'), st = src('app/settings.js'), tl = src('app/tools.js'), tu = src('app/tutorial.js'), srv = src('daemon/server.mjs');
    ok(html.indexOf('<script src="/app/agent-gate.js"></script>') > 0 && html.indexOf('/app/agent-gate.js') < html.indexOf('/app/main.js') && /const agentOff = \(\) => AgentGate\.off\(AGENTS, ACCT, AGY\);/.test(main) && /const agentBlock = \(k\) => AgentGate\.block\(k, AGENTS, ACCT, AGY\);/.test(main), '4 화면: 판정 파일을 main.js 보다 먼저 불러오고 단추 · 단추로 여는 대화가 그 판정을 쓴다');
    ok(/if \(b\.classList\.contains\('locked'\)\) \{ lockedNotice\(\); return; \}[^\n]*\n\s*if \(!window\.DoctorView\?\.available\?\.\(\)\) return;/.test(main), '4 화면: 잠긴 단추를 누르면 안내만 — IRIS Doctor 권유보다 먼저 돌아간다');
    ok(/if \(agentBlock\(c\.agent\) === 'locked'\) \{ lockedNotice\('대화는 그대로입니다\.'\); return; \}/.test(main) && main.indexOf("if (agentBlock(c.agent) === 'locked') { lockedNotice('대화는 그대로입니다.')") < main.indexOf("await api('POST', `/api/sessions/${s.id}/switch`"), '4 화면: 바꾸기 화면에서 잠긴 Antigravity 로의 제출을 데몬에 보내기 전에 막는다');
    ok(/if \(s\.agent === 'antigravity' && AgentGate\.locked\(AGY\)\) \{ lockedNotice\(/.test(main) && /if \(agentBlock\(c\.agent\) === 'locked'\) \{ lockedNotice\('입력창의 글은 그대로입니다/.test(main), '4 화면: 잠긴 카드의 「여기서 재개」 · 잠긴 선택으로 새 대화 만들기를 막는다');
    ok(/if \(m\.agy\) AGY = m\.agy;/.test(main) && /b\.hidden = !AGENTS\[k\] \|\| \(k === 'antigravity' && !AGY\);/.test(main) && /agy: agyStatus\.brief\(\)/.test(srv), '4 화면: 판정은 hello 로 함께 오고, 안티그래비티 단추는 판정을 받은 뒤에 보인다(잠깐 켜졌다 꺼지지 않게)');
    ok(/why: AgentGate\.word\(why\)/.test(main), '4 화면: 단추로 여는 대화가 막힌 까닭에 잠금 낱말이 실린다');
    ok(/const agyLocked = \(\) => agyInfo\?\.state === 'locked';/.test(st) && /sel\.disabled = lock;/.test(st) && /if \(agyLocked\(\)\) return `<section class="st-grp auth-card" data-kind="antigravity" data-locked="1">/.test(st) && /!\(i\.provider === 'google' && agyInfo\?\.state === 'locked'\)/.test(st), '4 설정: 권한 모드 고르기 잠금 · 계정 묶음은 한 줄 · 구글 항목은 경고 대상에서 뺀다');
    ok(/const agyLocked = \(\) => Array\.isArray\(data\?\.locked\) && data\.locked\.includes\('antigravity'\);/.test(tl) && /aria-disabled="true"/.test(tl) && /if \(a\.getAttribute\('aria-disabled'\) === 'true'\) return;/.test(tl), '4 도구: 잠긴 탭은 보이되 누름을 받지 않는다');
    ok(/if \(agy\?\.state === 'locked'\) lockDeck\(sr\);/.test(tu) && /function lockDeck\(root\)/.test(tu), '4 튜토리얼: 잠겨 있으면 덱의 안티그래비티 CLI 설치 명령을 바꿔 그린다');
    const deck = src('app/tutorial/deck/slides.html');
    ok((deck.match(/<code>[^<]*antigravity\.google\/cli[^<]*<\/code>/g) || []).length === 1, '4 (전제) 덱에 안티그래비티 CLI 설치 명령은 한 곳 — 늘거나 모양이 바뀌면 lockDeck 을 함께 고친다');
    const words = [st, tl, main].every((s) => !/곧 열림|coming soon/i.test(s)) && [/'곧 열립니다'/.test(st), /'곧 열립니다'/.test(tl), /곧 열립니다/.test(html)].every(Boolean);
    ok(words, '4 꼬리표 글은 어디서나 「곧 열립니다」 하나');
    // 데몬(소스): 둘째 문턱 · 타이머 묶음 · 자동 재개
    const gateReady = srv.slice(srv.indexOf('const agyGateReady = async (agent) => {'), srv.indexOf('if (!AGY_LOCKED) {'));
    ok(/const agyGateReady = async \(agent\) => \{\n\s*if \(agent === 'antigravity'\) agyLock\.assertOpen\(\);/.test(srv) && gateReady.indexOf('agyLock.assertOpen()') < gateReady.indexOf('agyGate.refresh()'), '4 데몬: agyGateReady 맨 앞에서 거절(중계기에 묻기 전)');
    const block = srv.slice(srv.indexOf('if (!AGY_LOCKED) {'), srv.indexOf('const sleepWatcher = new SleepWatcher'));
    ok(/^const AGY_LOCKED = agyLock\.isLocked\(\);$/m.test(srv) && ['setTimeout(tickAgy, 3000)', 'setInterval(tickAgy, 60_000)', 'agyGateFirst = agyGate.refresh()', 'const loop = () => setTimeout('].every((x) => block.includes(x)) && (srv.match(/tickAgy/g) || []).length === (block.match(/tickAgy/g) || []).length && (srv.match(/agyGate\.refresh\(\)/g) || []).length - (block.match(/agyGate\.refresh\(\)/g) || []).length === 1, '4 데몬: 잠금은 켜질 때 한 번 정하고, 안티그래비티 타이머 넷(3초 뒤 · 매분 · 중계기 첫 판정 · 5초/15초)은 잠금이 아닐 때만 건다 — 그 묶음 밖의 중계기 조회는 문턱 뒤의 한 곳뿐');
    ok(/hide: AGY_LOCKED \? \(i\) => i\?\.provider === 'google' : null/.test(srv) && /locked: AGY_LOCKED \? \['antigravity'\] : \[\]/.test(srv) && /sm\.lost\(\)\.some\(\(r\) => r\.agent === 'antigravity'\) && !AGY_LOCKED;/.test(srv), '4 데몬: 로그인 감시에서 구글만 뺌 · 도구 목록에 잠금 표시 · 자동 재개에서 잠긴 카드를 기다리지 않음');
  }

  // ───────────────────────── 3절 시험 데몬 · 5절 화면 ─────────────────────────
  async function part3and5() {
    const PORT = 3459, BASE = `http://127.0.0.1:${PORT}`;
    // 가짜 중계기(이 검사가 띄운다): 구글 계정 하나가 있는 새 중계기처럼 답하고, 물어 온 횟수를 센다
    let gateHits = 0;
    const fakeGate = http.createServer((q, r) => { gateHits++; r.writeHead(200, { 'content-type': 'application/json' }); r.end(J({ google: { supported: true, halt: null }, accounts: [{ name: 'google-1', provider: 'google', status: 'active' }], currentAccounts: { google: 'google-1' } })); });
    fakeGate.listen(0, '127.0.0.1'); await once(fakeGate, 'listening');
    cleanups.push(() => { fakeGate.closeAllConnections?.(); fakeGate.close(); });
    const GATE = `http://127.0.0.1:${fakeGate.address().port}`;
    // 가짜 로그인 감시 도구: 구글 계정 하나가 「만료」인 결과를 낸다(불린 인수를 적어 둔다 — 감시 자체는 그대로 도는지 보려고)
    const FAKE_AUTH = [
      "import fs from 'node:fs';",
      "fs.appendFileSync(new URL('./calls.log', import.meta.url), process.argv.slice(2).join(' ') + '\\n');",
      'const item = (id, group, provider, level, expiresAt, more) => ({ id, group, provider, name: id.split(":").pop(), label: id.split(":").pop(), level, daysLeft: level === "expired" ? 0 : 30, expiresAt, ...(more || {}) });',
      'console.log(JSON.stringify({ items: [item("iris:longkey", "iris", "anthropic", "ok", 1900000000000, { longKey: true }), item("tc:anthropic:a", "teamclaude", "anthropic", "ok", 1800000000000), item("tc:codex:c", "teamclaude", "codex", "ok", 1790000000000), item("tc:google:google-1", "teamclaude", "google", "expired", 1780000000000, { health: "needs-login" })],',
      '  worst: "expired", due: ["tc:google:google-1"], nextExpiry: { id: "tc:google:google-1", label: "google-1", expiresAt: 1780000000000 } }));',
      '',
    ].join('\n');
    const deadPid = () => { for (let p = 4194300; p > 4190000; p -= 4) { try { process.kill(p, 0); } catch (e) { if (e.code === 'ESRCH') return p; } } return 4194300; };
    const setup = (name, { key = false, sessions = () => [], autoResume = true } = {}) => {
      const d = path.join(TMP, name), st = path.join(d, 'state'), soul = path.join(d, 'soul'), home = path.join(d, 'home'), gem = path.join(d, 'gemini'), ostmp = path.join(d, 'ostmp'), work = path.join(d, 'work'), authDir = path.join(d, 'auth');
      for (const x of [st, ostmp, work, authDir, path.join(d, 'claude'), path.join(d, 'codex'), path.join(d, 'mods')]) fs.mkdirSync(x, { recursive: true });
      wj(path.join(st, 'settings.json'), { voice: { preload: false } });
      wj(path.join(st, 'planner-rules.json'), { intro: 'seen' });
      wj(path.join(st, 'sessions.json'), sessions(work));
      wj(path.join(soul, '_agent', 'setup', KEY), { antigravity: 'open' }); // 영혼 폴더의 진짜 자리에 놓은 열쇠 — 시험 데몬은 이것을 보지 않아야 한다
      if (key) fs.writeFileSync(path.join(st, KEY), OPEN, 'utf8');
      wj(path.join(home, '.gemini', 'config', 'mcp_config.json'), { mcpServers: { demo: { command: 'node' } } });
      wj(path.join(d, 'teamclaude.json'), {});
      fs.writeFileSync(path.join(authDir, 'status.mjs'), FAKE_AUTH, 'utf8');
      const fakeExe = path.join(d, 'no-such-agy.exe'), trace = path.join(d, 'trace.jsonl'), statusFile = path.join(d, 'agy-status.json');
      const env = { ...cleanEnv(), IRIS_ROOT: soul, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: st, IRIS_FACE_MODULES: path.join(d, 'mods'), IRIS_FACE_UPDATE_CHECK: '0', IRIS_AGENTS_HOME: home, IRIS_GEMINI_DIR: gem,
        IRIS_AGY_STATUS_FILE: statusFile, IRIS_AGY_GATE_URL: GATE, IRIS_AGY_EXE: fakeExe, IRIS_AUTH_DIR: authDir, TEAMCLAUDE_CONFIG: path.join(d, 'teamclaude.json'), CLAUDE_CONFIG_DIR: path.join(d, 'claude'), CODEX_HOME: path.join(d, 'codex'),
        TEMP: ostmp, TMP: ostmp, AGYLOCK_TRACE: trace, ...(autoResume ? {} : { IRIS_FACE_AUTO_RESUME: '0' }) };
      return { d, st, soul, home, gem, ostmp, work, fakeExe, trace, statusFile, env, authDir };
    };
    const api = async (method, p, body) => { const r = await fetch(BASE + p, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? J(body) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
    const start = async (s) => {
      const proc = cp.spawn(process.execPath, ['--import', pathToFileURL(path.join(ROOT, 'scripts', 'fixtures', 'agy-lock-trace.mjs')).href, path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: process.env.AGYLOCK_DEBUG ? 'inherit' : 'ignore', env: s.env }); // AGYLOCK_DEBUG=1 = 시험 데몬의 출력을 그대로 본다(검사를 고칠 때)
      const t0 = Date.now(); let first = null;
      // 자기가 띄운 PID 만 끝낸다: 먼저 데몬의 전부 종료 창구로, 안 되면 그 PID 에 신호
      const stop = async () => { if (proc.exitCode != null) return; try { await fetch(`${BASE}/api/shutdown?wait=1`, { method: 'POST', signal: AbortSignal.timeout(25000) }); } catch {} for (let i = 0; i < 60 && proc.exitCode == null; i++) await sleep(100); if (proc.exitCode == null) { try { proc.kill(); } catch {} } };
      cleanups.push(stop);
      for (let i = 0; i < 150 && !first && proc.exitCode == null; i++) { await sleep(100); try { const r = await fetch(`${BASE}/api/antigravity/status`); if (r.ok) first = await r.json(); } catch {} } // 켜지자마자의 첫 답
      let mine = false; try { mine = (await api('GET', '/api/health')).json?.pid === proc.pid; } catch {}
      return { proc, t0, first, stop, mine };
    };
    // 화면처럼 붙어 hello 를 받는다. 그 뒤 0.7초 동안 온 { type: 'agy' } 방송도 함께 돌려준다(hello.agyCast = 그 방송들의 state)
    const hello = async () => { const { WebSocket } = await import('ws'); return new Promise((resolve) => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); let h = null; const casts = []; const done = () => { try { ws.close(); } catch {} resolve(h ? { ...h, agyCast: casts } : null); }; const t = setTimeout(done, 5000); ws.on('message', (raw) => { try { const m = JSON.parse(String(raw)); if (m.type === 'agy') casts.push(m.status?.state); if (m.type === 'hello' && !h) { h = m; clearTimeout(t); setTimeout(done, 700); } } catch {} }); ws.on('error', () => { clearTimeout(t); resolve(null); }); }); };
    const readTrace = (s) => { try { return fs.readFileSync(s.trace, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
    const low = (p) => String(p).toLowerCase();
    /** 기록에서 안티그래비티 전용인 것만 센다: 가짜 중계기로 간 요청 · agy 실행 · 전용 타이머 · 전용 자리에 쓴 것 */
    const agyOf = (s, rows) => ({
      gate: rows.filter((r) => r.t === 'fetch' && r.url.startsWith(GATE)).length,
      proc: rows.filter((r) => r.t === 'proc' && (low(r.file) === low(s.fakeExe) || /(^|[\\/])agy(\.exe)?$/i.test(r.file) || (r.args || []).includes('agy'))).length,
      timers: rows.filter((r) => r.t === 'timer' && (r.name === 'tickAgy' || /agyGate|agyStatus|tickAgy/.test(r.src) || /antigravity\.[a-z.]*mjs/.test(r.at))).length,
      writes: rows.filter((r) => r.t === 'write' && (low(r.path).startsWith(low(s.gem)) || low(r.path).startsWith(low(path.join(s.home, '.gemini'))) || low(r.path).startsWith(low(s.statusFile)) || /(^|[\\/])(agy-logs|agy-models\.json|iris-agy-usage)([\\/]|$)/i.test(r.path))).map((r) => r.path),
      total: rows.length, timersAll: rows.filter((r) => r.t === 'timer').length,
    });
    const exists = (p) => fs.existsSync(p);
    const logOf = (s) => { try { return fs.readFileSync(path.join(s.st, 'daemon.log'), 'utf8'); } catch { return ''; } };

    // ── 잠긴 데몬: 끊긴 안티그래비티 카드 하나(자동 재개 대상이었을 것) + 끝난 클로드 카드 하나 ──
    const conv = 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb', cid = 'cccccccc-1111-4222-8333-dddddddddddd', dead = deadPid();
    const seed = (work) => [
      { id: 's1', cwd: work, agent: 'antigravity', model: 'gemini-4-argon', modelLabel: 'Gemini 4 Argon', modelActual: 'gemini-4-argon-high', effort: 'high', permission: '', approval: '', sandbox: '', status: 'idle', pid: dead, sessionId: conv, recordPath: null, resumeCmd: `agy --conversation ${conv}`, title: '옛 안티그래비티 대화', titleSource: 'user', startedAt: '2026-11-20T00:00:00.000Z' },
      { id: 's2', cwd: work, agent: 'claude', model: 'opus', modelLabel: 'Opus', effort: 'high', permission: '', approval: '', sandbox: '', status: 'dead', pid: dead, sessionId: cid, recordPath: null, resumeCmd: `claude --resume ${cid}`, title: '클로드 대화', titleSource: 'user', startedAt: '2026-11-20T00:00:00.000Z' },
    ];
    const L = setup('locked', { sessions: seed });
    const hits0 = gateHits;
    const dl = await start(L);
    ok(!!dl.first && dl.mine, `3 잠긴 시험 데몬 ${PORT} pid=${dl.proc.pid}`, J({ first: dl.first, exit: dl.proc.exitCode }));
    if (!dl.first || !dl.mine) return;
    ok(dl.first.state === 'locked' && Array.isArray(dl.first.groups) && !dl.first.groups.length, '3 켜지자마자 받은 첫 상태 답이 locked(unknown 을 거치지 않는다)', J(dl.first));
    const h = await hello();
    ok(h?.agy?.state === 'locked' && h.agy.headline === null, '3 화면에 처음 가는 hello 의 agy = locked', J(h?.agy));
    ok(h?.agyCast?.length >= 1 && h.agyCast.every((s) => s === 'locked'), "3 화면이 받는 첫 { type: 'agy' } 방송부터 locked(붙자마자 한 번 — 다른 상태가 섞이지 않는다)", J(h?.agyCast));
    const before = (await api('GET', '/api/sessions')).json;
    ok(Array.isArray(before) && before.length === 2 && before[0].agent === 'antigravity' && before[0].status === 'dead' && before[0].lost === true, '3 (준비) 끊긴 안티그래비티 카드가 자동 재개되지 않고 그대로 있다', J(before?.map?.((r) => [r.id, r.agent, r.status, r.lost])));
    const rej = (z) => z.status === 400 && LOCK_SAY.test(z.json?.error || '');
    const c1 = await api('POST', '/api/sessions', { cwd: L.work, agent: 'antigravity', model: 'gemini-4-argon', effort: 'high', prompt: '안녕' });
    const c2 = await api('POST', '/api/sessions/s1/resume', { text: '' });
    const c3 = await api('POST', '/api/sessions/s1/switch', { model: 'gemini-4-neon', effort: 'high' });
    const c4 = await api('POST', '/api/sessions/s2/switch', { agent: 'antigravity', model: 'gemini-4-argon', effort: 'high' });
    ok(rej(c1), '3 직접 요청: 새 세션(POST /api/sessions, antigravity) = 400 「곧 열립니다」', J(c1));
    ok(rej(c2), '3 직접 요청: 수동 재개 = 400 「곧 열립니다」', J(c2));
    ok(rej(c3), '3 직접 요청: 모델 바꾸기 = 400 「곧 열립니다」', J(c3));
    ok(rej(c4), '3 직접 요청: Claude 카드를 안티그래비티로 바꾸기 = 400 「곧 열립니다」', J(c4));
    const after = (await api('GET', '/api/sessions')).json;
    ok(J(after) === J(before), '3 거절 뒤에도 카드 둘이 글자 하나 그대로(안티그래비티 카드 · Claude 카드)', J(after));
    await sleep(Math.max(0, 4800 - (Date.now() - dl.t0))); // 시작 3초 뒤의 갱신이 돌았을 때까지 기다린다(잠겨 있으면 그 타이머가 없다)
    const tools = (await api('GET', '/api/tools')).json;
    ok(J(tools?.locked) === J(['antigravity']) && tools.agents.includes('antigravity') && ![...tools.mcp, ...tools.skills, ...tools.plugins].some((t) => t.agent === 'antigravity'), '3 도구 목록: 탭은 남고(agents) 잠금 표시 · 안티그래비티 줄은 내놓지 않는다', J({ locked: tools?.locked, agents: tools?.agents }));
    const auth = (await api('GET', '/api/auth')).json;
    ok(auth?.available && J(auth.info?.items?.map((i) => i.id)) === J(['iris:longkey', 'tc:anthropic:a', 'tc:codex:c']) && auth.info.worst === 'ok' && J(auth.info.due) === '[]' && auth.info.nextExpiry?.id === 'tc:codex:c' && exists(path.join(L.authDir, 'calls.log')), '3 로그인 감시: 도구는 그대로 돌고 결과에서 구글 항목만 빠진다(급한 정도 · 급한 항목도 다시 셈)', J(auth?.info));
    const lg = logOf(L);
    ok(/antigravity: locked/.test(lg) && /auto-resume: antigravity locked — 1 card\(s\) kept as they are, not resumed \(s1\)/.test(lg) && !/antigravity status:/.test(lg) && !/auto-resume failed/.test(lg) && !/auto-resume: \d+ lost session/.test(lg), '3 데몬 기록: 잠김 · 잠긴 카드 1장을 그대로 둠 · 상태 갱신 · 재개 시도 · 실패 기록 없음');
    const a = agyOf(L, readTrace(L));
    ok(a.total > 20 && a.timersAll > 5, `3 (기록기가 붙었다: 기록 ${a.total}줄 · 타이머 ${a.timersAll}개)`);
    ok(a.gate === 0 && gateHits === hits0, '3 중계기 조회 0(시작 즉시 · 반복 · 세션 요청 때 모두)', J({ fetch: a.gate, hits: gateHits - hits0 }));
    ok(a.proc === 0, '3 agy 실행 0', String(a.proc));
    ok(a.timers === 0, '3 안티그래비티 전용 타이머 0(상태 · 모델 갱신 · 중계기 판정)', String(a.timers));
    ok(!a.writes.length && !exists(L.gem) && !exists(L.statusFile) && !exists(path.join(L.st, 'agy-logs')) && !exists(path.join(L.st, 'agy-models.json')) && !exists(path.join(L.ostmp, 'iris-agy-usage')), '3 ~/.gemini 쓰기 0 · 상태 파일 쓰기 0 · 기록 폴더 · 모델 저장 · 임시 폴더 없음', J(a.writes));

    await part5(L, BASE);
    await dl.stop();
    const kept = JSON.parse(fs.readFileSync(path.join(L.st, 'sessions.json'), 'utf8')).find((r) => r.id === 's1');
    ok(kept?.agent === 'antigravity' && kept.sessionId === conv && kept.title === '옛 안티그래비티 대화' && kept.resumeCmd === `agy --conversation ${conv}`, '3 데몬을 끈 뒤에도 안티그래비티 카드와 그 기록 자리가 저장 파일에 남아 있다', J(kept));

    // ── 대조: 같은 기록기를 열쇠가 있는 데몬에 댄다 — 위의 0 이 "기록기가 못 잡아서"가 아님을 본다 ──
    const O = setup('open', { key: true, autoResume: false });
    const hits1 = gateHits;
    const dop = await start(O);
    ok(!!dop.first && dop.mine, `3(대조) 열쇠가 있는 시험 데몬 ${PORT} pid=${dop.proc.pid}`, J({ first: dop.first, exit: dop.proc.exitCode }));
    if (!dop.first || !dop.mine) return;
    ok(dop.first.state !== 'locked', '3(대조) 시험 상태 폴더에 열쇠가 있으면 열린다(첫 답이 locked 가 아님)', J(dop.first));
    await sleep(Math.max(0, 5500 - (Date.now() - dop.t0)));
    const ao = agyOf(O, readTrace(O));
    ok(ao.gate >= 1 && gateHits > hits1 && ao.proc >= 1 && ao.timers >= 3 && ao.writes.some((p) => low(p).startsWith(low(O.statusFile))) && exists(O.statusFile), '3(대조) 열린 데몬에서는 같은 기록기가 중계기 조회 · agy 실행 시도 · 전용 타이머 · 상태 파일 쓰기를 잡는다', J({ gate: ao.gate, proc: ao.proc, timers: ao.timers, writes: ao.writes.length }));
    const ho = await hello(); const to = (await api('GET', '/api/tools')).json; const auo = (await api('GET', '/api/auth')).json;
    ok(ho?.agy && ho.agy.state !== 'locked' && !ho.agyCast.includes('locked') && J(to?.locked) === '[]' && to.mcp.some((t) => t.agent === 'antigravity' && t.name === 'demo') && auo.info.items.some((i) => i.provider === 'google') && auo.info.worst === 'expired', '3(대조) 열린 데몬: hello · 도구 줄 · 로그인 감시의 구글 항목이 지금까지와 같다', J({ agy: ho?.agy?.state, locked: to?.locked, worst: auo?.info?.worst }));
    ok(/antigravity: open \(key\)/.test(logOf(O)), '3(대조) 데몬 기록: 열쇠로 열림');
    await dop.stop();
  }

  // ───────────────────────── 5절 화면(잠긴 데몬의 실제 화면) ─────────────────────────
  async function part5(L, BASE) {
    const req = createRequire(import.meta.url);
    let pw = null;
    for (const c of ['playwright', path.join(process.env.APPDATA || '', 'npm/node_modules/playwright')]) { try { pw = req.resolve(c); break; } catch {} }
    if (!pw) { console.log('SKIP 5절: playwright 없음(화면은 4절의 판정 · 소스 검사까지만 봄)'); return; }
    const mod = await import(pathToFileURL(pw).href); const chromium = (mod.default || mod).chromium;
    const browser = await chromium.launch();
    cleanups.push(() => browser.close());
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      const errs = []; page.on('pageerror', (e) => errs.push(e.message));
      const posts = []; page.on('request', (q) => { if (q.method() === 'POST') posts.push(new URL(q.url()).pathname); });
      // 잠기기 전에 Antigravity 를 골라 둔 PC(저장된 선택 iris.sel)로 시작한다 — 첫 화면에서 한 번만 심는다
      await page.addInitScript(() => { try { if (!sessionStorage.getItem('agylock.seeded')) { sessionStorage.setItem('agylock.seeded', '1'); localStorage.setItem('iris.sel', JSON.stringify({ agent: 'antigravity', model: { claude: 'opus', codex: 'gpt-6.1-sol', antigravity: 'gemini-4-argon' }, effort: { claude: 'high', codex: 'medium', antigravity: 'high' }, permission: '', approval: '', sandbox: '' })); } } catch {} });
      await page.goto(`${BASE}/`); await sleep(2500);
      const said = () => page.evaluate(() => [...document.querySelectorAll('.pl-say'), ...[document.querySelector('#dlg')].filter((d) => d && !d.hidden)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
      const closeDlg = () => page.evaluate(() => { const d = document.querySelector('#dlg'); if (d && !d.hidden) d.querySelector('button')?.click(); });
      const btn = () => page.evaluate(() => {
        const q = (id) => document.getElementById(id); const a = q('ag-antigravity');
        return { hidden: a.hidden, shown: a.offsetParent !== null, dis: a.getAttribute('aria-disabled'), locked: a.classList.contains('locked'), dim: a.classList.contains('no-account'), tag: a.dataset.tag || '', title: a.title, after: getComputedStyle(a, '::after').content, text: a.textContent.trim(),
          active: document.querySelector('.seg-agent .seg-btn.active')?.dataset.agent || '', claude: `${q('ag-claude').hidden}:${q('ag-claude').getAttribute('aria-disabled')}`, codex: `${q('ag-codex').hidden}:${q('ag-codex').getAttribute('aria-disabled')}`,
          saved: (() => { try { return JSON.parse(localStorage.getItem('iris.sel')).agent; } catch { return ''; } })(), models: [...document.querySelectorAll('#sel-model option')].map((o) => o.value).join(',') };
      });
      let b = await btn();
      const cap = async (name) => { if (process.env.IRIS_CAPTURE_DIR) { try { await page.screenshot({ path: path.join(process.env.IRIS_CAPTURE_DIR, name) }); } catch {} } }; // IRIS_CAPTURE_DIR 를 주면 장면 캡처를 남긴다
      await cap('agy-lock-1-home.png');
      ok(!b.hidden && b.shown && b.text === 'Antigravity' && b.dis === 'true' && b.locked && !b.dim, '5 에이전트 단추: 보임 · 눌리지 않음(aria-disabled) · 흐리게 만들지 않음', J(b));
      ok(b.tag === '곧 열립니다' && /곧 열립니다/.test(b.after) && b.title === 'Antigravity 는 준비 중입니다. 곧 열립니다.', '5 에이전트 단추: 꼬리표 「곧 열립니다」 · 말풍선', J([b.tag, b.after, b.title]));
      ok(b.claude === 'false:false' && b.codex === 'false:false', '5 Claude · Codex 단추는 켜진 그대로', J([b.claude, b.codex]));
      ok(['claude', 'codex'].includes(b.active) && b.saved === b.active && !/gemini/.test(b.models), '5 저장된 선택이 Antigravity 였으면 켜진 에이전트로 옮기고 저장한다(모델 칸도 그 에이전트 것)', J([b.active, b.saved, b.models]));
      await page.locator('#ag-antigravity').click({ force: true }); await sleep(500); // aria-disabled 단추 — 사람이 누르듯 그대로 누른다
      const s1 = await said(); const b2 = await btn();
      ok(b2.active === b.active && /준비 중입니다\. 곧 열립니다/.test(s1) && !/Doctor/.test(s1), '5 잠긴 단추를 눌러도 고른 에이전트는 그대로 · 안내 한마디뿐(IRIS Doctor 권유 없음)', J([b2.active, s1]));
      await closeDlg();
      // 잠긴 옛 카드: 「여기서 재개」 · 바꾸기 화면의 제출을 데몬에 보내지 않는다
      await page.locator('#session-list .srow[data-id="s1"]').click(); await sleep(700);
      const dead = await page.evaluate(() => ({ bar: !document.getElementById('dead-bar').hidden, title: document.getElementById('vh-title')?.textContent || '' }));
      posts.length = 0;
      await page.locator('#btn-resume').click(); await sleep(500);
      const s2 = await said();
      ok(dead.bar && !posts.some((p) => /\/resume$/.test(p)) && /곧 열립니다/.test(s2), '5 잠긴 카드의 「여기서 재개」: 데몬에 보내지 않고 안내만 · 카드는 그대로', J([dead, posts, s2]));
      await closeDlg();
      await page.locator('#btn-tune').click(); await sleep(400);
      const tune = await btn();
      posts.length = 0;
      await page.locator('#setup-apply').click(); await sleep(500);
      const dlgOpen = await page.evaluate(() => { const d = document.querySelector('#dlg'); return !!d && !d.hidden && /바꿀까요/.test(d.textContent); });
      ok(tune.active === 'antigravity' && tune.locked && !posts.some((p) => /\/switch$/.test(p)) && !dlgOpen, '5 바꾸기 화면: 잠긴 Antigravity 로의 제출을 막는다(확인 창도 데몬 요청도 없음)', J([tune.active, posts, dlgOpen]));
      await closeDlg();
      await page.locator('#setup-cancel').click(); await sleep(300);
      const cards = (await (await fetch(`${BASE}/api/sessions`)).json()).map((r) => `${r.id}:${r.agent}:${r.status}`);
      ok(J(cards) === J(['s1:antigravity:dead', 's2:claude:dead']), '5 화면에서 눌러 본 뒤에도 카드 둘 그대로', J(cards));
      // 설정 세 곳
      await page.evaluate(() => { Settings.show('session'); }); await sleep(900);
      const ses = await page.evaluate(() => { const g = document.getElementById('st-agy-grp'), s = document.getElementById('st-agy-perm'), t = document.getElementById('st-agy-soon'); return { shown: !g.hidden && g.offsetParent !== null, disabled: s.disabled, opts: s.options.length, tag: !t.hidden && t.textContent, sum: document.getElementById('st-sum-session')?.textContent || '', claudePerm: document.getElementById('st-perm').disabled, codexAppr: document.getElementById('st-approval').disabled }; });
      await cap('agy-lock-2-settings-session.png');
      ok(ses.shown && ses.disabled && ses.opts >= 1 && ses.tag === '곧 열립니다' && /Antigravity 곧 열립니다/.test(ses.sum) && !ses.claudePerm && !ses.codexAppr, '5 설정 → 세션 기본값: Antigravity 권한 모드는 보이되 고를 수 없음 · 「곧 열립니다」 · Claude · Codex 칸은 그대로', J(ses));
      await page.evaluate(() => { Settings.showPane('account'); }); await sleep(1200); // 묶음을 열 때 데몬에서 다시 읽는 것이 끝난 뒤에 넣는다(아래 자료가 덮이지 않게)
      await page.evaluate(() => { Settings.setAuth({ available: true, info: { checkedAt: new Date().toISOString(), items: [
        { id: 'iris:longkey', group: 'iris', label: 'IRIS 1년 열쇠', name: 'iris', provider: 'anthropic', level: 'ok', daysLeft: 300, longKey: true },
        { id: 'tc:anthropic:a', group: 'teamclaude', label: 'a', name: 'a', provider: 'anthropic', level: 'ok', daysLeft: 20 },
        { id: 'tc:google:google-1', group: 'teamclaude', label: 'google-1', name: 'google-1', provider: 'google', level: 'expired', daysLeft: 0, health: 'needs-login' }] } }); });
      await sleep(600);
      const acc = await page.evaluate(() => { const c = document.querySelector('#st-auth .auth-card[data-kind="antigravity"]'); const gear = document.getElementById('btn-settings'); return { card: !!c, locked: c?.dataset.locked, rows: c?.querySelectorAll('.auth-row').length, buttons: c?.querySelectorAll('button').length, text: c?.textContent.replace(/\s+/g, ' ').trim() || '', google: /google-1/.test(document.getElementById('st-auth').textContent), gearBad: gear.classList.contains('auth-bad') || gear.classList.contains('auth-warn'), gearTitle: gear.title, kinds: [...document.querySelectorAll('#st-auth .auth-card')].map((x) => x.dataset.kind).join(',') }; });
      await cap('agy-lock-3-settings-account.png');
      ok(acc.card && acc.locked === '1' && acc.rows === 0 && acc.buttons === 0 && /곧 열립니다/.test(acc.text) && !acc.google && acc.kinds === 'iris,claude,codex,antigravity', '5 설정 → 계정 · 보안: Antigravity 묶음은 보이되 「곧 열립니다」 한 줄 — 계정 줄 · 재로그인 단추 없음(구글 계정이 와도 그리지 않음)', J(acc));
      ok(!acc.gearBad && !/갱신 필요/.test(acc.gearTitle) && !/로그인 갱신 필요/.test(await said()), '5 구글 인증 경고(톱니 점) · 알림 없음', J([acc.gearBad, acc.gearTitle]));
      await page.evaluate(() => { Settings.showPane('tools'); }); await sleep(1500);
      const tabs0 = await page.evaluate(() => [...document.querySelectorAll('#tl-agents button')].map((x) => ({ a: x.dataset.agent, pressed: x.getAttribute('aria-pressed'), dis: x.getAttribute('aria-disabled') || '', tag: x.querySelector('.soon-tag')?.textContent || '', title: x.title })));
      await page.locator('#tl-agents button[data-agent="antigravity"]').click({ force: true }); await sleep(300);
      const pressed = await page.evaluate(() => [...document.querySelectorAll('#tl-agents button[aria-pressed="true"]')].map((x) => x.dataset.agent).join(','));
      await cap('agy-lock-4-settings-tools.png');
      const agyTab = tabs0.find((t) => t.a === 'antigravity');
      ok(!!agyTab && agyTab.dis === 'true' && agyTab.tag === '곧 열립니다' && /준비 중/.test(agyTab.title) && pressed === 'all', '5 설정 → 도구: Antigravity 탭은 보이되 고를 수 없음 · 「곧 열립니다」', J([tabs0, pressed]));
      await page.evaluate(() => { Settings.hide(); }); await sleep(300);
      // 튜토리얼 덱: 안티그래비티 CLI 설치 명령은 보이지 않고 그 자리에 「곧 열립니다」 — 다른 회사의 줄은 그대로
      await page.evaluate(() => { Tutorial.open(); });
      let deck = null;
      for (let i = 0; i < 40 && !deck; i++) { await sleep(250); deck = await page.evaluate(() => { const sr = document.querySelector('.tu-deck')?.shadowRoot; const codes = sr ? [...sr.querySelectorAll('.drow code')] : []; return codes.length ? { codes: codes.map((c) => ({ t: c.textContent, soon: c.classList.contains('soon') })), all: sr.getElementById('stage').textContent.includes('antigravity.google/cli') } : null; }); }
      ok(!!deck && !deck.all && !deck.codes.some((c) => /antigravity\.google\/cli/.test(c.t)) && deck.codes.filter((c) => c.soon).length === 1 && /곧 열립니다/.test(deck.codes.find((c) => c.soon).t), '5 튜토리얼 덱: 안티그래비티 CLI 설치 명령은 보이지 않고 「곧 열립니다」', J(deck));
      ok(!!deck && deck.codes.some((c) => /claude\.ai\/install\.ps1/.test(c.t)) && deck.codes.some((c) => /chatgpt\.com\/codex\/install\.ps1/.test(c.t)) && deck.codes.filter((c) => !c.soon).length === deck.codes.length - 1, '5 튜토리얼 덱: Claude · Codex 등 다른 줄의 설치 명령은 그대로');
      ok(!errs.length, '5 화면 오류 0', J(errs.slice(0, 3)));
    } finally { try { await browser.close(); } catch {} }
  }
}
