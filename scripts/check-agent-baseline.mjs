// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 기준선 — 에이전트(Claude·Codex)에 따라 갈리는 동작을 "지금 그대로" 찍어 둔 고정 표본과 비교한다.
//   에이전트 장부(등록부)로 옮기는 동안, 옮기기 전과 글자 하나까지 같은 결과가 나오는지 보는 검사다(동작을 바꾸지 않는 옮기기의 증명).
//   찍는 것: ① 선택값 정리(normalize)·재개 모델·권한 표시 ② 실행 사양(실행 파일·인수 배열·세션 id·기록 경로·재개 명령)
//            ③ 세션을 띄울 때의 부작용 순서(끝내기 → 코덱스 호환 → fast 설정 → 폴더 신뢰 → 열쇠 → 실행 → 저장)와 자식 환경 변수
//            ④ 저장되는 카드 값(sessions.json) ⑤ 기록 파일 짝짓기(클로드 새 번호 따라가기 · 코덱스 rollout 찾기) ⑥ 모르는 에이전트 이름의 지금 동작
//   두 환경에서 따로 돈다: env(설정 폴더가 환경 변수에 있음 — 실행기가 띄운 데몬) · receipt(환경 변수 없음 + 설치 영수증).
//   실제 CLI·실제 설정·실 데몬 접촉 0: 가짜 영혼 폴더(IRIS_ROOT 임시) · node-pty 의 spawn 을 가짜로 바꿈 · taskkill 은 기록만 하고 실행하지 않음.
//
//   울타리: 임시 폴더 밖 쓰기·진짜 프로세스 실행·진짜 PID 에 신호 보내기는 그 자리에서 막고 "위반"으로 적는다(위반 1건 = 실패).
//
//   표본을 다시 찍기: `node scripts/check-agent-baseline.mjs --write=구역[,구역]` — 동작을 "일부러" 바꾼 차례에만. 달라진 곳을 먼저 보여 주고,
//   적어 준 구역 밖이 달라졌으면 쓰지 않는다. (`--write=all` = 전부 · 표본이 아직 없을 때만 `--write`.)
//   손 표(모델·권한 목록)를 고친 차례 = `--write=agentsTable`. 옮기기만 한 차례에 표본이 달라졌다면 그것이 회귀다 — 다시 찍지 않는다.
//
//   🔴 "지금 동작"이지 "옳은 동작"이 아닌 것도 그대로 찍혀 있다(옮기는 동안은 지키고, 고칠지는 따로 정한다 — 고치는 차례에 그 구역을 다시 찍는다):
//     · 모르는 에이전트 이름(gemini 등) → 조용히 클로드로 연다 · `constructor`/`toString` 같은 이름 → TypeError
//     · 선택값 정리와 명령 만들기 사이에 모델 목록이 바뀌면 카드의 모델과 실제로 넘긴 모델이 달라진다(sessions「…사이에 목록이 바뀜」)
//     · 같은 폴더에서 기록을 기다리는 코덱스 카드 둘이 같은 rollout 하나에 함께 붙는다(pairing) · 에이전트를 바꾼 카드에 옛 `compat`·`keepActual` 이 남는다
//     · 기록 파일이 줄어들어 처음부터 다시 읽을 때 모델·사용량·배경 작업 표는 비우지 않는다(records …shrunk)
//     · 카드의 `titlePending: true` 는 이 검사가 제목 생성을 막아 둔 결과다(제목 생성의 기대값이 아니다)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const GOLDEN = path.join(ROOT, 'scripts', 'fixtures', 'agent-baseline.json');
const MODES = ['env', 'receipt'];
const arg = (k) => { const a = process.argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a == null ? undefined : a.slice(k.length + 3); }; // 첫 '=' 뒤 전부(경로에 '=' 가 있어도)
const TMP_PREFIX = 'iris-ab-';

if (arg('mode') !== undefined) {
  // 자식은 부모가 만든 임시 폴더에서만 돈다(아무 폴더나 시험 장소로 쓰지 않게)
  const tmp = path.resolve(arg('tmp') || '');
  if (!path.basename(tmp).startsWith(TMP_PREFIX) || path.dirname(tmp).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase() || !fs.existsSync(tmp) || fs.readdirSync(tmp).length) { console.log(`자식 실행 거절: 빈 임시 폴더(${TMP_PREFIX}…)가 아님 — ${tmp}`); process.exit(2); }
  await child(arg('mode'), tmp);
} else { parent(); }

// ───────────────────────── 부모: 환경마다 자식을 돌려 모으고 표본과 비교 ─────────────────────────
function parent() {
  const WRITE = arg('write'); // undefined = 비교만 · '' = 처음 찍기(표본이 없을 때만) · 'all' · '구역,구역'
  const got = {};
  // 자식에게는 바깥 환경에서 흘러든 에이전트·IRIS 값과 NODE_OPTIONS 를 넘기지 않는다(자식이 시작하기 전에 걸러야 한다)
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|CODEX|ANTHROPIC|OPENAI|IRIS|NODE_OPTIONS$)/i.test(k)));
  for (const mode of MODES) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
    const out = path.join(tmp, 'out.json');
    try {
      const r = cp.spawnSync(process.execPath, [SELF, `--mode=${mode}`, `--tmp=${tmp}`], { encoding: 'utf8', timeout: 120000, env });
      if (r.status !== 0 || !fs.existsSync(out)) { console.log(`FAIL ${mode}: 표본을 만들지 못함 (exit ${r.status})\n${r.stdout}\n${r.stderr}`); process.exit(1); }
      got[mode] = JSON.parse(fs.readFileSync(out, 'utf8'));
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 다음 임시 정리에 맡김 */ } }
  }
  // 두 환경에서 같은 구역은 한 번만 적고("=env"), 항목 하나를 한 줄에 적는다(달라진 곳이 줄 단위로 보이게)
  for (const sec of Object.keys(got.receipt)) if (JSON.stringify(got.receipt[sec]) === JSON.stringify(got.env[sec])) got.receipt[sec] = '=env';
  const fmt = (v) => Array.isArray(v) ? `[\n${v.map((x) => `   ${JSON.stringify(x)}`).join(',\n')}\n  ]`
    : (v && typeof v === 'object') ? `{\n${Object.entries(v).map(([k, x]) => `   ${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(',\n')}\n  }` : JSON.stringify(v);
  const text = `{\n${MODES.map((m) => ` ${JSON.stringify(m)}: {\n${Object.entries(got[m]).map(([sec, v]) => `  ${JSON.stringify(sec)}: ${fmt(v)}`).join(',\n')}\n }`).join(',\n')}\n}\n`;
  const have = fs.existsSync(GOLDEN);
  if (!have && WRITE === undefined) { console.log(`FAIL 고정 표본 없음: ${path.relative(ROOT, GOLDEN)} — 처음이면 --write 로 찍는다`); process.exit(1); }
  const want = have ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : {};
  let pass = 0, fail = 0;
  const diffs = [], changed = new Set();
  const walk = (a, b, at) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    const obj = (x) => x && typeof x === 'object';
    if (obj(a) && obj(b) && Array.isArray(a) === Array.isArray(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${at}/${k}`); return; }
    diffs.push({ at, want: a, got: b });
  };
  for (const mode of MODES) for (const sec of new Set([...Object.keys(want[mode] || {}), ...Object.keys(got[mode] || {})])) {
    const before = diffs.length;
    walk(want[mode]?.[sec], got[mode]?.[sec], `${mode}/${sec}`);
    if (diffs.length === before) { pass++; if (WRITE === undefined) console.log(`PASS ${mode}/${sec}`); } else { fail++; changed.add(sec); console.log(`${WRITE === undefined ? 'FAIL' : '달라짐'} ${mode}/${sec} — ${diffs.length - before}곳 다름`); }
  }
  const SHOW = WRITE === undefined ? 40 : 15;
  const cut = (v) => { const s = JSON.stringify(v); return s === undefined ? '(없음)' : (s.length > 600 ? `${s.slice(0, 600)}… (+${s.length - 600}자)` : s); };
  for (const d of diffs.slice(0, SHOW)) console.log(`  ≠ ${d.at}\n      표본: ${cut(d.want)}\n      지금: ${cut(d.got)}`);
  if (diffs.length > SHOW) console.log(`  … 그 밖 ${diffs.length - SHOW}곳`);
  if (WRITE === undefined) { console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0); }
  // 다시 찍기: 무엇이 달라지는지 위에 먼저 보이고, 허락한 구역만 바뀔 때에만 쓴다(옮기기만 한 차례의 회귀를 덮어 버리지 않게)
  const allow = WRITE === 'all' ? null : new Set(WRITE.split(',').filter(Boolean));
  if (have && allow && !allow.size) { console.log(`\n거절: 표본이 이미 있다. 바꿀 구역을 적는다 — --write=구역,구역 (달라진 구역: ${[...changed].join(', ') || '없음'}) 또는 --write=all`); process.exit(1); }
  const extra = allow ? [...changed].filter((s) => !allow.has(s)) : [];
  if (have && extra.length) { console.log(`\n거절: 허락하지 않은 구역이 달라졌다 — ${extra.join(', ')} (허락: ${[...allow].join(', ')})`); process.exit(1); }
  if (!diffs.length && have) { console.log('\n달라진 곳 없음 — 표본을 그대로 둔다'); process.exit(0); }
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  const part = `${GOLDEN}.${process.pid}.tmp`; fs.writeFileSync(part, text, 'utf8'); fs.renameSync(part, GOLDEN);
  console.log(`\n고정 표본을 ${have ? '다시 ' : ''}찍음: ${path.relative(ROOT, GOLDEN)} (${text.length} 바이트 · 달라진 구역 ${[...changed].join(', ') || '없음'} · ${diffs.length}곳)`);
  process.exit(0);
}

// ───────────────────────── 자식: 한 환경에서 표본을 만든다 ─────────────────────────
async function child(mode, tmp) {
  const soul = path.join(tmp, 'soul'), state = path.join(tmp, 'state'), work = path.join(tmp, 'Work Dir');
  const envClaude = path.join(tmp, 'e-claude'), envCodex = path.join(tmp, 'e-codex');   // env 환경의 설정 폴더
  const rcClaude = path.join(tmp, 'r-claude'), rcCodex = path.join(tmp, 'r-codex');     // receipt 환경에서 영수증이 가리키는 폴더
  for (const d of [path.join(soul, '_agent', 'setup'), state, work]) fs.mkdirSync(d, { recursive: true });

  // 바깥 환경에서 흘러든 값이 표본에 섞이지 않게 지우고, 필요한 것만 놓는다
  for (const k of Object.keys(process.env)) if (/^(CLAUDE|CODEX|ANTHROPIC|OPENAI|IRIS)/i.test(k)) delete process.env[k];
  Object.assign(process.env, { IRIS_ROOT: soul, IRIS_FACE_STATE: state, CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_PID: '1', CLAUDE_EFFORT: 'high' });
  if (mode === 'env') Object.assign(process.env, { CLAUDE_CONFIG_DIR: envClaude, CODEX_HOME: envCodex });
  else fs.writeFileSync(path.join(soul, '_agent', 'setup', 'package-receipt.json'), JSON.stringify({ schema: 2, env: { CLAUDE_CONFIG_DIR: rcClaude, CODEX_HOME: rcCodex, ANTHROPIC_BASE_URL: 'http://127.0.0.1:9/gate' } }), 'utf8');
  const PATH_KEY = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const PATH0 = process.env[PATH_KEY] || '';
  // 자식에게 줄 설정 폴더(신뢰·열쇠가 실제로 가는 곳)
  const homeClaude = mode === 'env' ? envClaude : rcClaude, homeCodex = mode === 'env' ? envCodex : rcCodex;
  fs.mkdirSync(path.join(homeClaude, 'secrets'), { recursive: true });
  fs.writeFileSync(path.join(homeClaude, 'secrets', 'iris-cli-token.json'), JSON.stringify({ token: 'FAKE-LONG-KEY', expiresAt: Date.now() + 300 * 86400000 }), 'utf8');

  // 경로·시각·번호를 자리 이름으로 바꿔 어느 PC·어느 날에도 같은 글자가 되게 한다
  const tokens = [[work, '<CWD>'], [envClaude, '<ENV_CLAUDE>'], [envCodex, '<ENV_CODEX>'], [rcClaude, '<RC_CLAUDE>'], [rcCodex, '<RC_CODEX>'], [state, '<STATE>'], [soul, '<SOUL>'], [tmp, '<TMP>']];
  const slugOf = (p) => p.replace(/[^A-Za-z0-9]/g, '-');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forms = (p) => [p, p.replace(/\\/g, '/'), p.replace(/\\/g, '\\\\')];
  const variants = tokens.flatMap(([p, t]) => [...forms(p).map((f) => [f, t]), ...forms(p.toLowerCase()).map((f) => [f, `${t}(lower)`]), ...forms(p.toUpperCase()).map((f) => [f, `${t}(upper)`]), [slugOf(p), `${t}(slug)`]])
    .sort((a, b) => b[0].length - a[0].length);
  const tok = (s) => {
    let t = String(s);
    for (const [p, name] of variants) t = t.replace(new RegExp(esc(p), 'g'), name);
    // 임시 폴더 자리·임시 파일의 PID·지금 시각만 바꾼다. 그 밖의 글자(역슬래시·따옴표·이스케이프)는 제품이 낸 그대로 비교한다.
    return t.replace(/\.\d+\.tmp\b/g, '.<pid>.tmp').replace(/(?!2026-01-01T00:)\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<time>'); // 지어낸 기록의 시각(2026-01-01T00:…)은 그대로 둔다
  };
  // 값 하나하나를 돌며 글자에만 자리 이름을 입힌다(JSON 글자를 통째로 바꾸면 따옴표 이스케이프가 깨진다)
  const deep = (v) => {
    if (v === undefined) return '<undefined>';
    if (typeof v === 'string') return tok(v);
    if (Array.isArray(v)) return v.map(deep);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]));
    return typeof v === 'function' ? '<function>' : v;
  };

  // ── 관측 장치: 파일 쓰기·읽기 순서, UUID 발급 횟수, taskkill, pty 실행 ──
  let events = [];
  const ev = (...a) => events.push(tok(a.join(' ')));
  // 울타리: 임시 폴더 밖에 쓰려 하거나 진짜 프로세스를 띄우려 하면 그 자리에서 막고(예외) 위반으로 적는다 — 위반이 하나라도 있으면 검사 실패.
  const violations = [];
  const TMP_L = tmp.toLowerCase() + path.sep;
  const inTmp = (f) => (typeof f === 'string' || f instanceof URL) && `${path.resolve(f instanceof URL ? fileURLToPath(f) : f)}${path.sep}`.toLowerCase().startsWith(TMP_L);
  const block = (what) => { violations.push(tok(what)); const e = new Error(`기준선 검사 울타리: ${what}`); e.code = 'EBASELINE_FENCE'; throw e; };
  const quiet = (f) => /sessions\.json(\.tmp)?$/.test(f); // 카드 저장은 'save' 한 낱말로
  const WRITERS = { writeFileSync: [0], appendFileSync: [0], renameSync: [0, 1], mkdirSync: [0], rmSync: [0], unlinkSync: [0], rmdirSync: [0], copyFileSync: [1], cpSync: [1], truncateSync: [0], symlinkSync: [1], linkSync: [1], createWriteStream: [0] };
  const LOGGED = new Set(['readFileSync', 'writeFileSync', 'appendFileSync', 'renameSync']);
  for (const fn of new Set([...Object.keys(WRITERS), ...LOGGED])) {
    const orig = fs[fn];
    fs[fn] = function (...a) {
      for (const i of WRITERS[fn] || []) if (!inTmp(a[i])) block(`임시 폴더 밖 쓰기 ${fn}(${String(a[i])})`);
      const f = a[0];
      if (LOGGED.has(fn) && inTmp(f)) { if (quiet(String(f))) { if (fn === 'renameSync') ev('save'); } else ev(fn.replace('Sync', ''), f); }
      return orig.apply(this, a);
    };
  }
  for (const fn of ['writeFile', 'appendFile', 'rename', 'mkdir', 'rm', 'unlink', 'rmdir', 'copyFile', 'cp', 'truncate']) { fs[fn] = () => block(`비동기 파일 함수 fs.${fn}`); fs.promises[fn] = () => block(`비동기 파일 함수 fs.promises.${fn}`); }
  // 사례마다 UUID 를 처음부터 다시 센다(앞 사례를 더해도 뒤 사례의 번호가 밀리지 않게). 머리 여덟 자리 = 사례 번호.
  //   머리 여덟 자리·가짜 PID 의 자리는 사례 이름에서 나온다 → 사례를 더하거나 순서를 바꿔도 다른 사례의 표본은 그대로다.
  let uuidN = 0, uuidCase = '00000000', pidBase = 0, spawnTotal = 0;
  const sha = crypto.createHash.bind(crypto); const seenCases = new Set();
  const newCase = (label) => {
    if (seenCases.has(label)) throw new Error(`기준선 검사: 사례 이름이 겹침 — ${label}`); seenCases.add(label);
    uuidCase = sha('sha1').update(String(label)).digest('hex').slice(0, 8); pidBase = (parseInt(uuidCase, 16) % 100000) * 1000; uuidN = 0; spawnTotal = 0;
  };
  crypto.randomUUID = () => { uuidN++; return `${uuidCase}-0000-4000-8000-${String(uuidN).padStart(12, '0')}`; };
  // 진짜 프로세스는 하나도 띄우지 않는다: taskkill 은 기록만 하고, 그 밖의 실행은 전부 막는다
  cp.spawnSync = (file, args) => { if (/^taskkill(\.exe)?$/i.test(path.basename(String(file)))) { ev('taskkill', (args || []).join(' ')); return { status: 0, stdout: '', stderr: '' }; } return block(`프로세스 실행 spawnSync(${file} ${(args || []).join(' ')})`); };
  for (const fn of ['spawn', 'exec', 'execFile', 'execSync', 'execFileSync', 'fork']) cp[fn] = (file, args) => block(`프로세스 실행 ${fn}(${file} ${Array.isArray(args) ? args.join(' ') : ''})`);
  // PID 가 살아 있는지는 이 검사가 정한다(가짜 PID 만 — 진짜 프로세스에 신호를 보내지 않는다)
  const FAKE_PID0 = 2000000000; const alivePids = new Set();
  const realKill = process.kill.bind(process);
  process.kill = (pid, sig) => { if (pid >= FAKE_PID0) { if (sig === 0 || sig === undefined) { if (alivePids.has(pid)) return true; const e = new Error('kill ESRCH'); e.code = 'ESRCH'; throw e; } return block(`가짜 PID 에 신호 ${sig}`); } if (sig === 0) return realKill(pid, sig); return block(`진짜 PID ${pid} 에 신호 ${sig}`); };
  syncBuiltinESMExports();
  const require = createRequire(import.meta.url);
  const pty = require('node-pty');
  let spawns = [];
  let fakePidAlive = false; // 다음에 받는 가짜 PID 를 "살아 있음"으로 둘지("끝내고 다시 띄우기" 순서를 보려고)
  const SECRETISH = /TOKEN|KEY|SECRET|PASSWORD/i;
  pty.spawn = (file, args, opts) => {
    const env = opts.env || {};
    const keys = Object.keys(env).filter((k) => /^(CLAUDE|CODEX|ANTHROPIC|OPENAI)/i.test(k)).sort();
    const pathNow = env[PATH_KEY] || '';
    // 열쇠처럼 보이는 값은 이 검사가 만든 가짜일 때만 표본에 적는다(진짜 값이 섞여도 공개 파일에 들어가지 않게)
    const val = (k) => (SECRETISH.test(k) && env[k] !== 'FAKE-LONG-KEY' ? '<가림: 가짜가 아닌 값>' : env[k]);
    spawns.push(deep({ file, args, opts: { name: opts.name, cols: opts.cols, rows: opts.rows, cwd: opts.cwd, useConpty: opts.useConpty }, env: Object.fromEntries(keys.map((k) => [k, val(k)])), pathAdded: pathNow.endsWith(PATH0) ? pathNow.slice(0, pathNow.length - PATH0.length).split(path.delimiter).filter(Boolean) : '<PATH 가 통째로 바뀜>' }));
    ev('spawn', file, JSON.stringify(args));
    const pid = FAKE_PID0 + pidBase + (++spawnTotal) * 4; if (fakePidAlive) alivePids.add(pid);
    return { pid, cols: opts.cols, rows: opts.rows, onData() {}, onExit() {}, write() {}, resize() {}, kill() {} };
  };

  const A = await import(pathToFileURL(path.join(ROOT, 'daemon', 'agents.mjs')).href);
  const S = await import(pathToFileURL(path.join(ROOT, 'daemon', 'sessions.mjs')).href);
  const { AGENTS, normalize, buildCommand, assertExpected, modelForResume, keepResumeModel, permLabel, isFastModel, setModelRefresher } = A;

  // 모델 목록은 이 검사가 가진 표본으로 바꾼다(그 PC CLI 에서 읽어 온 목록처럼 제자리 교체) — 손 표가 바뀌어도 이 검사는 그대로
  const FIX = {
    claude: [
      { id: 'opus', label: 'Opus 5.5', actual: 'claude-opus-5-5' }, { id: 'claude-opus-5', label: 'Opus 5 (이전)', actual: 'claude-opus-5' },
      { id: 'sonnet', label: 'Sonnet 5.5', actual: 'claude-sonnet-5-5' }, { id: 'fable', label: 'Fable (이 PC 최신)', actual: null }, { id: 'haiku', label: 'Haiku 5.5' },
    ],
    codex: [
      { id: 'gpt-6.1-sol', label: 'gpt-6.1-sol' }, { id: 'gpt-6-luna', label: 'gpt-6-luna', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] }, { id: 'gpt-x-flat', label: 'gpt-x-flat', efforts: [] },
    ],
  };
  const setModels = (fix) => { for (const a of Object.keys(fix)) AGENTS[a].models.splice(0, AGENTS[a].models.length, ...fix[a].map((m) => ({ ...m }))); };
  for (const a of Object.keys(FIX)) if (!FIX[a].some((m) => m.id === AGENTS[a].default.model)) { console.log(`기본 모델(${a}: ${AGENTS[a].default.model})이 이 검사의 표본 목록에 없음 — FIX 를 고치고 표본을 다시 찍는다`); process.exit(1); }
  // 손 표 그대로(모델 목록·권한 목록·기본값·이름과 그 순서) — 표본 목록으로 바꾸기 전에 찍는다. 손 표를 고친 차례에는 이 구역만 다시 찍는다(--write=agentsTable).
  const agentsTable = JSON.parse(JSON.stringify(AGENTS));
  setModels(FIX);

  const tryIt = (fn) => { try { return deep(fn()); } catch (e) { return { throws: e?.constructor?.name || 'Error', code: e?.code || null, message: tok(e?.message || '') }; } };
  const out = { agentsTable };

  // ① 선택값 정리 ─────────────────────────────────────────────
  const nz = {};
  const put = (sel) => { nz[JSON.stringify(sel, (k, x) => (x === undefined ? '<undefined>' : x))] = tryIt(() => normalize(sel)); };
  put(undefined); put({});
  for (const agent of ['claude', 'codex', undefined, null, '', 'gemini', 'CLAUDE', 'Codex', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) put({ agent, model: 'opus', effort: 'high', permission: 'plan', approval: 'never', sandbox: 'read-only' });
  const EFF = [undefined, '', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'nope'];
  for (const agent of ['claude', 'codex']) for (const model of [undefined, 'nope', ...FIX[agent].map((m) => m.id)]) for (const effort of EFF) put({ agent, model, effort });
  for (const permission of [undefined, null, '', 'bypassPermissions', 'acceptEdits', 'auto', 'dontAsk', 'manual', 'plan', 'nope']) put({ agent: 'claude', permission, approval: 'never', sandbox: 'read-only', readOnly: true });
  for (const approval of [undefined, null, '', 'never', 'on-request', 'nope']) for (const sandbox of [undefined, null, '', 'read-only', 'workspace-write', 'danger-full-access', 'nope']) for (const readOnly of [undefined, null, '', false, true]) put({ agent: 'codex', approval, sandbox, readOnly, permission: 'plan' });
  for (const agent of ['claude', 'codex', 'gemini']) for (const modelActual of ['claude-opus-4-1', 'gpt-5.5', 'gemini-4-argon-high', 'claude-opus-5-5 --x', '', 5, null]) {
    put({ agent, model: 'gone', effort: 'high', keepActual: true, modelActual, modelLabel: '쓰던 이름' });
    put({ agent, effort: 'high', keepActual: true, modelActual });
    put({ agent, model: 'gone', effort: 'high', keepActual: false, modelActual });
  }
  out.normalize = nz;

  // 재개 모델·실행 직전 확인·권한 표시·fast 판정
  const recs = [
    { agent: 'claude', model: 'opus', modelActual: 'claude-opus-5-5', modelLabel: 'Opus 5.5' }, { agent: 'claude', model: 'opus', modelActual: 'claude-opus-5' },
    { agent: 'claude', model: 'fable', modelActual: 'claude-fable-5-1', modelLabel: 'Fable 5.1' }, { agent: 'claude', model: 'opus', modelActual: 'gpt-5.5' }, { agent: 'claude', model: 'opus' },
    { agent: 'codex', model: 'gpt-5.5', modelActual: 'gpt-5.5' }, { agent: 'codex', model: 'gpt-6-luna', modelActual: 'gpt-6-luna' }, { agent: 'codex', model: 'x', modelActual: 'claude-opus-5-5' },
    { agent: 'gemini', model: 'g', modelActual: 'gemini-4-argon-high' }, { model: 'opus', modelActual: 'claude-opus-5-5' }, null, undefined,
  ];
  out.resumeModel = recs.map((rec) => ({
    rec: deep(rec), modelForResume: tryIt(() => modelForResume(rec)),
    keep: ['claude', 'codex'].map((agent) => tryIt(() => keepResumeModel(normalize({ agent, model: rec?.model, effort: 'high' }), rec))),
  }));
  out.assertExpected = [[{ modelActual: 'a' }, 'a'], [{ modelActual: 'a' }, 'b'], [{ modelActual: null }, 'b'], [{ modelActual: 'a' }, ''], [{ modelActual: 'a' }, undefined], [null, 'b'], [undefined, undefined]].map(([sel, exp]) => tryIt(() => { assertExpected(sel, exp); return 'ok'; }));
  const labelSels = [{ agent: 'claude', model: 'opus', permission: 'plan' }, { agent: 'claude', model: 'sonnet', permission: 'bypassPermissions' }, { agent: 'claude', model: 'fable' }, { agent: 'claude', model: 'haiku', permission: 'nope' },
    { agent: 'codex', approval: 'never', sandbox: 'danger-full-access' }, { agent: 'codex' }, { agent: 'codex', sandbox: 'read-only' }, { agent: 'gemini', model: 'opus', permission: 'plan', approval: 'never' }];
  out.permLabel = labelSels.map((s) => ({ sel: s, normalized: tryIt(() => permLabel(normalize(s))), raw: tryIt(() => permLabel(s)) }));
  out.isFastModel = [['claude', 'opus'], ['claude', 'sonnet'], ['claude', 'x', 'claude-opus-9'], ['claude', 'fable', null], ['codex', 'anything'], ['gemini', 'opus'], [undefined, 'opus'], ['claude', undefined, undefined]].map((a) => ({ args: deep(a), fast: tryIt(() => isFastModel(...a)) }));

  // ② 실행 사양 ─────────────────────────────────────────────
  const buildSels = [
    { agent: 'claude', model: 'opus', effort: 'high' }, { agent: 'claude', model: 'opus', effort: 'max', permission: 'bypassPermissions' }, { agent: 'claude', model: 'sonnet', effort: 'low', permission: 'plan' },
    { agent: 'claude', model: 'fable', effort: 'xhigh' }, { agent: 'claude', model: 'haiku' }, { agent: 'claude', model: 'gone', effort: 'high', keepActual: true, modelActual: 'claude-opus-4-1', modelLabel: 'Opus 4.1' },
    { agent: 'codex', model: 'gpt-6.1-sol', effort: 'ultra', approval: 'never', sandbox: 'danger-full-access' }, { agent: 'codex', model: 'gpt-6-luna', effort: 'ultra' }, { agent: 'codex', model: 'gpt-x-flat', effort: 'high', sandbox: 'read-only' },
    { agent: 'codex', readOnly: true }, { agent: 'codex', model: 'gone', keepActual: true, modelActual: 'gpt-5.5' }, { agent: 'gemini', model: 'gemini-4-argon-high', effort: 'high' }, { agent: 'constructor' }, {},
  ];
  out.buildCommand = [];
  for (const sel of buildSels) for (const resumeId of [undefined, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']) {
    events = []; newCase(`build ${JSON.stringify(sel)} ${resumeId ? "resume" : "new"}`); const u0 = uuidN;
    const res = tryIt(() => buildCommand(sel, work, resumeId ? { resumeId } : undefined));
    out.buildCommand.push({ sel: deep(sel), resume: !!resumeId, result: res, uuidCalls: uuidN - u0, events });
  }
  newCase('buildCommandNoOpts');
  out.buildCommandNoOpts = tryIt(() => { const u0 = uuidN; const r = buildCommand({ agent: 'claude' }, work); return { ...r, uuidCalls: uuidN - u0 }; });

  // 권한·승인·샌드박스 값 전부(손 표에 있는 값 그대로) × 명령 줄과 표시 글
  out.permMatrix = [];
  const cmdOf = (sel) => tryIt(() => { newCase(`perm ${JSON.stringify(sel)}`); return buildCommand(sel, work).cmdline; });
  for (const model of ['opus', 'sonnet']) for (const p of agentsTable.claude.permissions) { const sel = { agent: 'claude', model, effort: 'high', permission: p.id }; out.permMatrix.push({ sel, cmdline: cmdOf(sel), label: tryIt(() => permLabel(normalize(sel))) }); }
  for (const ap of agentsTable.codex.approvals) for (const sb of agentsTable.codex.sandboxes) { const sel = { agent: 'codex', approval: ap.id, sandbox: sb.id }; out.permMatrix.push({ sel, cmdline: cmdOf(sel), label: tryIt(() => permLabel(normalize(sel))) }); }
  // 작업 폴더 글자 모양 → 클로드 기록 폴더 이름·기록 경로(파일을 만들지 않는 계산만)
  out.cwdShapes = ['C:\\가 나\\〖태그〗 (x)\\', 'C:/a/b', '\\\\server\\share\\dir', 'D:\\UPPER lower_1-2.3', 'relative\\dir', ''].map((cwd) => ({ cwd, slug: tryIt(() => A.claudeProjectSlug(cwd)), claude: tryIt(() => { newCase(`cwd ${cwd}`); const r = buildCommand({ agent: 'claude', model: 'sonnet' }, cwd); return { recordPath: r.recordPath, cmdline: r.cmdline }; }), codex: tryIt(() => buildCommand({ agent: 'codex' }, cwd, { resumeId: 'r1' })) }));
  // fast 설정 파일: 없음 → 만듦 · 맞음 → 그대로 · 망가짐 → 다시 씀
  const fastFile = path.join(state, 'fast-mode.json');
  const fastCase = (name, prep) => { prep(); events = []; newCase(`fast ${name}`); const r = tryIt(() => buildCommand({ agent: 'claude', model: 'opus' }, work).args.slice(-4, -2)); let after = null; try { after = fs.readFileSync(fastFile, 'utf8'); } catch { /* 없음 */ } return { args: r, events: events.slice(0, -1), after }; };
  out.fastFile = { missing: fastCase('missing', () => fs.rmSync(fastFile, { force: true })), ok: fastCase('ok', () => {}), corrupt: fastCase('corrupt', () => fs.writeFileSync(fastFile, '{ 망가진', 'utf8')), notFast: (() => { fs.rmSync(fastFile, { force: true }); events = []; newCase('fast notFast'); const r = tryIt(() => buildCommand({ agent: 'claude', model: 'sonnet' }, work).cmdline); return { cmdline: r, events: [...events], exists: fs.existsSync(fastFile) }; })() };

  // 모델 목록 갱신이 불리는 때와 횟수 — 고른 뒤 실행 직전에 목록이 바뀌는 틈도 지금 그대로 찍는다
  let refreshN = 0; setModelRefresher(() => { refreshN++; });
  const count = (fn) => { const n0 = refreshN; const r = tryIt(fn); return { refreshCalls: refreshN - n0, result: r }; };
  out.refresh = { normalize: count(() => normalize({ agent: 'claude' })).refreshCalls, buildCommand: count(() => buildCommand({ agent: 'codex' }, work).cmdline) };
  setModelRefresher(() => { throw new Error('목록 읽기 실패'); });
  out.refresh.throwingRefresher = tryIt(() => normalize({ agent: 'claude', model: 'opus' }));
  setModelRefresher(() => { refreshN++; }); setModelRefresher(null); // 함수가 아닌 값 = 갱신 끔(앞서 건 것이 더는 불리지 않는다)
  out.refresh.afterNull = count(() => normalize({ agent: 'claude' }).model);
  setModelRefresher(() => { refreshN++; });

  // ③④ 세션 띄우기 — 부작용 순서·자식 환경·저장되는 카드 ─────────────────────────────────────────────
  const logs = [];
  class TSM extends S.SessionManager {
    // 제목 생성은 진짜 CLI 를 띄우므로 여기서는 "누구 이름으로 짓는지"만 적는다
    nameSession(id, prompt) { const r = this.sessions.get(id); ev('nameSession', JSON.stringify({ agent: r?.agent, model: r?.model, prompt })); }
  }
  let alignReturn = { action: 'none' };
  const sm = new TSM(state, { onLog: (m) => logs.push(tok(m)), codexHome: homeCodex, alignCodex: (o) => { ev('alignCodex', JSON.stringify({ codexHome: o.codexHome, threadId: o.threadId })); return alignReturn; } });
  const card = (rec) => deep({ ...rec, pid: '<pid>', pidAt: '<n>', lastOutputAt: '<n>' });
  const op = (name, fn) => {
    events = []; spawns = []; logs.length = 0; newCase(`op ${name}`); const u0 = uuidN, n0 = refreshN;
    let rec = null, error = null;
    try { rec = fn(); } catch (e) { error = { throws: e?.constructor?.name || 'Error', message: tok(e?.message || '') }; }
    const id = rec?.id;
    const live = id ? sm.live.get(id) : null;
    return { name, error, events, spawns, logs: [...logs], uuidCalls: uuidN - u0, refreshCalls: refreshN - n0, card: rec ? card(rec) : null, pendingPrompt: live ? tok(live.pendingPrompt) : null };
  };
  const ops = [];
  let c1, x1, g1;
  ops.push(op('create claude (첫 요청 있음)', () => (c1 = sm.create({ cwd: work, agent: 'claude', model: 'opus', effort: 'high', permission: 'bypassPermissions', prompt: '안녕' }))));
  ops.push(op('create claude 같은 폴더 두 번째(신뢰는 이미 있음)', () => sm.create({ cwd: work, agent: 'claude', model: 'sonnet', effort: 'low', prompt: '' })));
  ops.push(op('create codex', () => (x1 = sm.create({ cwd: work, agent: 'codex', model: 'gpt-6.1-sol', effort: 'medium', approval: 'never', sandbox: 'danger-full-access', prompt: 'hi' }))));
  ops.push(op('create codex 같은 폴더 두 번째', () => sm.create({ cwd: work, agent: 'codex', readOnly: true })));
  ops.push(op('create 모르는 에이전트(gemini) — 지금 동작', () => (g1 = sm.create({ cwd: work, agent: 'gemini', model: 'gemini-4-argon-high', effort: 'high' }))));
  ops.push(op('create 에이전트 없음', () => sm.create({ cwd: work })));
  ops.push(op('create 없는 폴더', () => sm.create({ cwd: path.join(tmp, 'nope'), agent: 'claude' })));
  ops.push(op('create expectModel 불일치', () => sm.create({ cwd: work, agent: 'claude', model: 'opus', expectModel: 'claude-opus-9' })));
  ops.push(op('switchTo claude 세션 id 있음(죽은 PID)', () => sm.switchTo(c1.id, { effort: 'max' })));
  fakePidAlive = true;
  ops.push(op('switchTo claude 모델 바꿈(이번에 받는 PID 는 살아 있음)', () => sm.switchTo(c1.id, { model: 'sonnet', prompt: '이어서' })));
  ops.push(op('switchTo claude 살아 있는 PID → 끝내고 다시 띄움', () => sm.switchTo(c1.id, {})));
  fakePidAlive = false;
  ops.push(op('switchTo codex 세션 id 모름', () => sm.switchTo(x1.id, {})));
  x1.sessionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  ops.push(op('switchTo codex (호환 = none)', () => sm.switchTo(x1.id, {})));
  alignReturn = { action: 'aligned', from: 'openai', to: 'iris', backup: path.join(homeCodex, 'iris-backup', 'x') };
  ops.push(op('switchTo codex (호환 = aligned)', () => sm.switchTo(x1.id, { model: 'gpt-6-luna', effort: 'ultra' })));
  alignReturn = { action: 'blocked', reason: '연결이 중계기가 아님' };
  ops.push(op('switchTo codex (호환 = blocked)', () => sm.switchTo(x1.id, {})));
  alignReturn = { action: 'none' };
  x1.modelActual = 'gpt-5.5'; x1.model = 'gpt-5.5';
  ops.push(op('switchTo codex 목록에서 사라진 모델로 쓰던 세션', () => sm.switchTo(x1.id, {})));
  ops.push(op('replaceAgent claude → codex', () => sm.replaceAgent(c1.id, { agent: 'codex', model: 'gpt-6.1-sol', effort: 'high', prompt: '이전 대화 요약' })));
  ops.push(op('replaceAgent codex → claude', () => sm.replaceAgent(x1.id, { agent: 'claude', model: 'opus', effort: 'high', prompt: '' })));
  ops.push(op('replaceAgent → 모르는 에이전트(gemini) — 지금 동작', () => sm.replaceAgent(g1.id, { agent: 'gemini' })));
  ops.push(op('resume 살아 있는 카드', () => sm.resume(c1.id)));
  // 고른 뒤 실행 직전에 목록이 바뀜(자동 업데이트): 카드에 적히는 모델과 실제로 넘기는 모델
  let flip = 0;
  setModelRefresher(() => { refreshN++; if (++flip === 2) setModels({ claude: FIX.claude.map((m) => (m.id === 'opus' ? { ...m, label: 'Opus 6', actual: 'claude-opus-6' } : m)) }); });
  ops.push(op('create claude — 정리와 명령 만들기 사이에 목록이 바뀜', () => sm.create({ cwd: work, agent: 'claude', model: 'opus', effort: 'high' })));
  setModelRefresher(() => { refreshN++; }); setModels(FIX);
  out.sessions = ops;

  // 옛 저장 카드 읽기(load) → 자동 재개: 에이전트 이름이 없는 것·모르는 것도 지금 그대로
  const state2 = path.join(tmp, 'state2'); fs.mkdirSync(state2, { recursive: true });
  const DEAD = FAKE_PID0;
  fs.writeFileSync(path.join(state2, 'sessions.json'), JSON.stringify([
    { id: 's1', cwd: work, agent: 'claude', model: 'opus', modelActual: 'claude-opus-5', effort: 'high', permission: 'bypassPermissions', status: 'busy', pid: DEAD, sessionId: '11111111-1111-4111-8111-111111111111' },
    { id: 's2', cwd: work, agent: 'codex', model: 'gpt-5.6-terra', effort: 'medium', readOnly: true, status: 'idle', pid: DEAD, sessionId: '22222222-2222-4222-8222-222222222222' },
    { id: 's3', cwd: work, model: 'opus', effort: 'high', status: 'idle', pid: DEAD, sessionId: '33333333-3333-4333-8333-333333333333' },
    { id: 's4', cwd: work, agent: 'gemini', model: 'gemini-4-argon-high', modelActual: 'gemini-4-argon-high', effort: 'high', status: 'attention', pid: DEAD, sessionId: '44444444-4444-4444-8444-444444444444' },
  ]), 'utf8');
  const sm2 = new TSM(state2, { onLog: (m) => logs.push(tok(m)), codexHome: homeCodex, alignCodex: (o) => { ev('alignCodex', JSON.stringify({ threadId: o.threadId })); return { action: 'none' }; } });
  out.oldCards = ['s1', 's2', 's3', 's4'].map((id) => {
    events = []; spawns = []; logs.length = 0; newCase(`old ${id}`);
    let rec = null, error = null; try { rec = sm2.resume(id, { prompt: 'RESUME' }); } catch (e) { error = { throws: e?.constructor?.name || 'Error', message: tok(e?.message || '') }; }
    return { id, error, events, spawns, card: rec ? card(rec) : null };
  });

  // 설정 파일에 남은 것(폴더 신뢰·시작 안내·fast 설정)
  const read = (f) => { try { return tok(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const ls = (d) => { try { return fs.readdirSync(d, { recursive: true }).map((f) => tok(String(f))).sort(); } catch { return null; } };
  events = [];
  out.files = {
    'claude/.claude.json': read(path.join(homeClaude, '.claude.json')), 'codex/config.toml': read(path.join(homeCodex, 'config.toml')), 'state/fast-mode.json': read(path.join(state, 'fast-mode.json')),
    claudeHome: ls(homeClaude), codexHome: ls(homeCodex), state: ls(state), soul: ls(soul),
    otherClaudeHome: ls(mode === 'env' ? rcClaude : envClaude), otherCodexHome: ls(mode === 'env' ? rcCodex : envCodex),
  };

  // ⑤ 기록 파일 짝짓기 — 진짜 감시기(3초 간격)가 찾는 것을 본다
  const before = [...sm.sessions.values()].map((r) => ({ id: r.id, agent: r.agent, sessionId: r.sessionId, recordPath: r.recordPath }));
  // 살아 있는 카드 가운데 가장 나중 것 하나씩만 남긴다(같은 폴더에서 여럿이 기다리면 어느 카드가 잡을지는 순서 문제 — 그것도 그대로 찍는다)
  const now = new Date();
  const dayDir = path.join(A.CODEX_HOME, 'sessions', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'));
  fs.mkdirSync(dayDir, { recursive: true });
  const line = (o) => JSON.stringify(o) + '\n';
  fs.writeFileSync(path.join(dayDir, 'rollout-a-child.jsonl'), line({ type: 'session_meta', payload: { id: 'cccccccc-0000-4000-8000-000000000001', originator: 'codex-tui', cwd: work, parent_thread_id: 'p' } }));
  fs.writeFileSync(path.join(dayDir, 'rollout-b-exec.jsonl'), line({ type: 'session_meta', payload: { id: 'cccccccc-0000-4000-8000-000000000002', originator: 'codex-exec', cwd: work } }));
  fs.writeFileSync(path.join(dayDir, 'rollout-c-other.jsonl'), line({ type: 'session_meta', payload: { id: 'cccccccc-0000-4000-8000-000000000003', originator: 'codex-tui', cwd: path.join(tmp, 'elsewhere') } }));
  fs.writeFileSync(path.join(dayDir, 'rollout-d-match.jsonl'), line({ type: 'session_meta', payload: { id: 'cccccccc-0000-4000-8000-000000000004', originator: 'codex-tui', cwd: work.toUpperCase().replace(/\\/g, '/') } }));
  // 클로드: 기다리는 기록이 없는 카드가 여럿이면 새 기록 하나를 누가 따라가는지
  const waiting = [...sm.sessions.values()].filter((r) => r.agent === 'claude' && r.recordPath && sm.live.has(r.id));
  if (waiting.length) { const dir = path.dirname(waiting[0].recordPath); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'dddddddd-0000-4000-8000-000000000001.jsonl'), line({ type: 'user', cwd: work, sessionId: 'dddddddd-0000-4000-8000-000000000001' })); }
  await new Promise((r) => setTimeout(r, 3600));
  out.pairing = {
    codexSessionsDir: tok(dayDir).replace(/\/\d{4}\/\d\d\/\d\d$/, '/<yyyy>/<mm>/<dd>'),
    cards: [...sm.sessions.values()].map((r) => { const b = before.find((x) => x.id === r.id); return deep({ id: r.id, agent: r.agent, sessionId: r.sessionId, recordPath: r.recordPath ? r.recordPath.replace(dayDir, '<CODEX_DAY>') : r.recordPath, resumeCmd: r.resumeCmd, changed: b.sessionId !== r.sessionId || b.recordPath !== r.recordPath, previous: (r.previous || []).map((p) => ({ agent: p.agent, sessionId: p.sessionId, reason: p.reason || null })) }); }),
  };

  out.records = await recordBaseline(tmp, deep);

  out.exports = { agents: Object.keys(A).sort(), agentKeys: Object.keys(AGENTS), agentShape: Object.fromEntries(Object.keys(AGENTS).map((k) => [k, Object.keys(AGENTS[k]).sort()])), constants: deep({ CLAUDE_CONFIG_DIR: A.CLAUDE_CONFIG_DIR, CODEX_HOME: A.CODEX_HOME, ROOT: A.ROOT === ROOT ? '<FACE>' : A.ROOT }) };

  out.violations = violations;
  fs.writeFileSync(path.join(tmp, 'out.json'), JSON.stringify(out), 'utf8');
  if (violations.length) { console.log(`울타리 위반 ${violations.length}건:`); for (const v of violations) console.log(`  ${v}`); process.exit(3); }
  process.exit(0);
}

// ───────────────────────── ⑦ 기록 해석 — 지어낸 기록 줄을 조각조각 읽혀 항목과 속 상태를 찍는다 ─────────────────────────
//   기록 줄은 이 검사가 만든다(실제 대화 기록은 공개 저장소에 넣지 않는다). 해석기가 다루는 줄 종류를 종류마다 하나 이상.
async function recordBaseline(tmp, deep) {
  const { TranscriptTail } = await import(pathToFileURL(path.join(ROOT, 'daemon', 'transcript.mjs')).href);
  const { withFaceNote } = await import(pathToFileURL(path.join(ROOT, 'daemon', 'facenote.mjs')).href);
  let n = 0;
  const T = () => `2026-01-01T00:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n++ % 60).padStart(2, '0')}.000Z`;
  const u = (content, extra = {}) => ({ type: 'user', timestamp: T(), message: { role: 'user', content }, ...extra });
  const a = (content, extra = {}, msg = {}) => ({ type: 'assistant', timestamp: T(), message: { role: 'assistant', content, ...msg }, ...extra });
  const use = (id, name, input) => ({ type: 'tool_use', id, name, input });
  const res = (id, content, extra = {}) => ({ type: 'tool_result', tool_use_id: id, content, ...extra });
  const note = (body) => `<task-notification>${body}</task-notification>`;
  const claude = [
    { type: 'mode', timestamp: T() }, { type: 'weird-new-kind', timestamp: T() }, { type: 'file-history-snapshot' },
    u(withFaceNote('첫 요청입니다')), u('<pasted_content id="1">붙여넣은 글</pasted_content id="1">'),
    u('<command-name>/compact</command-name><command-args>지금</command-args>'), u('<command-name>/clear</command-name>'),
    u('<system-reminder>숨김</system-reminder>'), u('본문입니다\n<system-reminder>꼬리</system-reminder>'), u('<local-command-stdout>x</local-command-stdout>'),
    u('[IRIS-Face 위임 정책] 규칙들. 아래가 실제 요청이다. 진짜 요청'), u(''), u(null),
    a([{ type: 'thinking', thinking: '생각 중' }, { type: 'thinking' }, { type: 'text', text: '답 글' }, use('tu1', 'Bash', { command: 'npm run build', description: '빌드', run_in_background: true })], {}, { model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: 7 } }),
    u([res('tu1', 'Command running in background with ID: bg1. Output is being written to: x')]),
    a([use('tu2', 'Monitor', { description: '감시', command: 'tail' })]), u([res('tu2', [{ type: 'text', text: 'Monitor started (task mon1, expires in 5m)' }])]),
    a([use('tu3', 'Bash', { command: 'sleep 200', description: '오래 걸림' })]), u([res('tu3', 'Command did not complete within 120s and was moved to the background (ID: bg2)')]),
    a([use('ag1', 'Agent', { description: '배경 보조', prompt: 'p' })]), u([res('ag1', 'Async agent launched successfully. agentId: agentA')]),
    a([use('ag2', 'Task', { description: '동기 보조 '.repeat(30) })]), u([res('ag2', '보조의 최종 보고')]),
    a([use('q1', 'AskUserQuestion', { questions: [{ question: '어느 쪽?' }, { question: '정말?' }] })]),
    u([{ type: 'text', text: '사진과 함께' }, { type: 'image', source: {} }, { type: 'text', text: '' }]),
    { type: 'queue-operation', operation: 'enqueue', timestamp: T(), content: note('<task-id>agentA</task-id><tool-use-id>ag1</tool-use-id><status>completed</status><summary>Agent "배경 보조" completed</summary>') },
    { type: 'queue-operation', operation: 'dequeue', timestamp: T() },
    { type: 'attachment', timestamp: T(), attachment: { prompt: note('<task-id>bg1</task-id><status>failed</status><summary>Background command "빌드" failed</summary>') } },
    { type: 'attachment', timestamp: T(), attachment: {} },
    u(note('<task-id>bg2</task-id><status>completed</status><summary>Background command "오래 걸림" completed with exit code 0</summary>') + '\n' + note('<task-id>mon1</task-id><summary>Monitor event: "줄 하나"</summary>') + note('<task-id>w1</task-id><status>killed</status><summary>Dynamic workflow "묶음" was stopped</summary>') + note('<summary>모르는 요약</summary>')),
    u(note('<task-id>mon1</task-id><summary>[Monitor expired after 5m] Monitor "감시" ended</summary>')),
    u('[Request interrupted by user]'), u([res('tu9', '[Request interrupted by user for tool use]')]), u('말 속의 [Request interrupted by user] 인용'),
    u('Stop hook feedback:\n[bg-leftover-guard] 배경 명령 1개가 남았습니다\n둘째 줄', { isMeta: true }), u('Stop hook feedback: 한 줄', { isMeta: true }),
    u('예약된 일\n둘째', { isMeta: true, turnOrigin: 'scheduled' }), u('<agent-message from="다른 세션">\n안녕\n</agent-message>', { isMeta: true, turnOrigin: 'peer' }),
    u('x', { isMeta: true, origin: { kind: 'peer', name: '이름', body: '몸통\n둘째' } }),
    u('Your response was cut off mid-stream', { isMeta: true, turnCompanion: true }), u('safety classifier', { isMeta: true, turnCompanion: true }), u('그 밖', { isMeta: true, turnCompanion: true }),
    u('버려지는 isMeta', { isMeta: true }),
    { type: 'summary', summary: '요약 글', timestamp: T() }, u('압축 요약 본문', { isCompactSummary: true }),
    { type: 'ai-title', aiTitle: '  세션 제목  ' }, { type: 'ai-title', aiTitle: '' },
    u('보조의 첫 글', { isSidechain: true, parentUuid: null, uuid: 'side1' }), a([{ type: 'text', text: '보조의 답' }], { isSidechain: true, parentUuid: 'side1', uuid: 'side2' }),
    a([use('tu4', 'TaskStop', { task_id: 'bg9' })]), u([res('tu4', 'stopped')]), a([use('tu5', 'KillShell', { shell_id: 'sh1' })]), u([res('tu5', 'killed', { is_error: true })]),
    a([use('r1', 'Read', { file_path: 'C:/x/y.md' }), use('r2', 'Grep', { pattern: 'abc' }), use('r3', 'Custom', { a: 1, b: 'x', c: { d: 2 } }), use('r4', 'Empty', {}), use('r5', 'NoInput'), use('r6', 'Arr', { command: ['git', 'status'] }), use('r7', 'Long', { query: 'q'.repeat(400) })]),
    u([res('r1', [{ type: 'text', text: '가' }, '나', { type: 'image' }]), res('r2', 'z'.repeat(6100)), res('r3', null)]),
    a([use('tu6', 'Bash', { command: 'node server.js', description: '끝나지 않는 배경 명령' }), use('tu7', 'Monitor', { description: '곧 만료되는 감시' })]),
    u([res('tu6', 'Command running in background with ID: bg3'), res('tu7', 'Monitor started (task mon2, expires in 30s)'), res('tu8', '문서 속 예시: Command running in background with ID: fake')]),
    a([{ type: 'text', text: '마지막 답' }], {}, { model: 'claude-haiku-4-5-20251001', usage: { output_tokens: 1 } }),
  ];
  const ev = (type, extra = {}) => ({ type: 'event_msg', timestamp: T(), payload: { type, ...extra } });
  const ri = (payload) => ({ type: 'response_item', timestamp: T(), payload });
  const msg = (role, text, extra = {}) => ri({ type: 'message', role, content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }], ...extra });
  const codex = [
    { type: 'session_meta', timestamp: T(), payload: { id: 'x', originator: 'codex-tui', cwd: 'C:/w' } }, { type: 'turn_context', timestamp: T(), payload: { model: 'gpt-6.1-sol' } }, { type: 'turn_context', timestamp: T(), payload: {} },
    ev('task_started', { model_context_window: 258400 }), msg('developer', '개발자 글'), msg('system', '시스템 글'),
    msg('user', '<environment_context>cwd</environment_context>'), msg('user', '# AGENTS.md instructions'), msg('user', '진짜처럼 보이지만 지침', { internal_chat_message_metadata_passthrough: { content_item_kinds: ['user_instructions'] } }),
    msg('user', withFaceNote('코덱스 첫 요청')), msg('user', '<pasted_content id="2">붙임</pasted_content id="2">'), msg('user', '   '), msg('tool', '모르는 역할'),
    msg('assistant', '중간 말', { phase: 'commentary' }), msg('assistant', ''), ri({ type: 'reasoning', summary: [{ type: 'summary_text', text: '추론 요약' }] }), ri({ type: 'reasoning' }),
    ri({ type: 'function_call', name: 'shell', call_id: 'c1', arguments: JSON.stringify({ command: ['bash', '-lc', 'ls'] }) }), ri({ type: 'function_call_output', call_id: 'c1', output: 'file-a\nfile-b' }),
    ri({ type: 'function_call', name: 'exec_command', call_id: 'c2', arguments: '{"cmd":"git status"}' }), ri({ type: 'function_call_output', call_id: 'c2', output: '[{"type":"text","text":"배열 글"}]' }),
    ri({ type: 'function_call', call_id: 'c3', arguments: '깨진 JSON {' }), ri({ type: 'function_call_output', call_id: 'c3', output: { content: [{ type: 'text', text: '객체 글' }] } }),
    ri({ type: 'custom_tool_call', name: 'apply_patch', call_id: 'c4', input: '*** Begin Patch' }), ri({ type: 'custom_tool_call_output', call_id: 'c4', output: { ok: true } }), ri({ type: 'function_call_output', call_id: 'c5' }),
    ri({ type: 'function_call', name: 'spawn_agent', call_id: 'sp1', arguments: '{}' }), ri({ type: 'function_call', name: 'spawn_agent', arguments: '{}' }), ri({ type: 'function_call', name: 'request_user_input', arguments: '{}' }),
    ev('token_count', { info: { last_token_usage: { input_tokens: 100, output_tokens: 5, total_tokens: 105 }, model_context_window: 300000 } }), ev('token_count', { info: { total_token_usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } } }), ev('token_count', {}),
    ev('exec_approval_request', { command: ['rm', '-rf', 'x'] }), ev('apply_patch_approval_request', { reason: '이유 있음' }), ev('request_user_input'), ev('agent_message', { message: 'x' }),
    msg('assistant', '최종 답', { phase: 'final_answer' }), ev('task_complete'), ev('task_started'), ev('turn_aborted'), { type: 'compacted', timestamp: T(), payload: {} }, ev('context_compacted'), ev('compacted'),
    ri({ type: 'web_search_call' }), ri({ type: 'brand_new_item' }), { type: 'brand_new_line', timestamp: T() }, { type: 'token_usage_record', timestamp: T() }, { type: 'world_state', timestamp: T() }, { type: 'response_item', timestamp: T() },
  ];
  const dir = path.join(tmp, 'records'); fs.mkdirSync(dir, { recursive: true });
  const NOW = Date.parse('2026-01-01T00:10:00.000Z');
  const snap = (tail) => deep({
    turnState: tail.turnState(), contextWindow: tail.contextWindow(), model: tail.model, lastUsage: tail.lastUsage, window: tail.window, aiTitle: tail.aiTitle, firstUser: tail.firstUser,
    tools: tail.tools, firstT: tail.firstT, lastT: tail.lastT, turnOpen: tail.turnOpen, turnDoneAt: tail.turnDoneAt, unknown: tail.unknown, seq: tail.seq, items: tail.items.length, reset: tail.reset ?? null,
    sidechain: [...tail.sidechain], calls: [...tail.calls], finished: [...tail.finished], finishedByTask: [...tail.finishedByTask], bg: [...tail.bg], toolIn: [...tail.toolIn],
    pendingAll: tail.backgroundPending(0, NOW), pendingSince: tail.backgroundPending(Date.parse('2026-01-01T00:00:17.000Z'), NOW), pendingLate: tail.backgroundPending(0, NOW + 30 * 3600000),
  });
  const run = (name, lines, agent, opts) => {
    const file = path.join(dir, `${name}.jsonl`);
    try { fs.rmSync(file, { force: true }); } catch { /* 없음 */ }
    const tail = new TranscriptTail(file, agent, opts);
    const polls = [deep(tail.poll())]; // 파일 없음
    const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
    // 조각: 일곱 줄씩, 세 번째 조각은 줄 한가운데서 끊는다(반 줄 처리)
    const cuts = []; let k = 0;
    const lineEnds = [...text.matchAll(/\n/g)].map((m) => m.index + 1);
    for (let i = 6; i < lineEnds.length; i += 7) cuts.push(++k === 3 ? lineEnds[i] - 25 : lineEnds[i]);
    cuts.push(text.length);
    const states = [];
    for (const c of cuts) { fs.writeFileSync(file, Buffer.from(text, 'utf8').subarray(0, Buffer.byteLength(text.slice(0, c), 'utf8'))); polls.push(deep(tail.poll())); states.push(tail.turnState()); }
    polls.push(deep(tail.poll())); // 바뀐 것 없음
    const full = snap(tail);
    fs.writeFileSync(file, lines.slice(0, 5).map((l) => JSON.stringify(l)).join('\n') + '\n'); // 파일이 줄어듦 → 처음부터 다시
    const after = deep(tail.poll());
    return { polls, turnStates: states, full, afterShrink: after, shrunk: snap(tail) };
  };
  return {
    claude: run('claude', claude, 'claude'), codex: run('codex', codex, 'codex'),
    claudeSub: run('claude-sub', claude, 'claude', { sub: true }), codexSub: run('codex-sub', codex, 'codex', { sub: true }),
    // 모르는·빠진 에이전트 이름으로 읽을 때의 지금 동작
    claudeFileAsGemini: run('c-gemini', claude, 'gemini'), codexFileAsGemini: run('x-gemini', codex, 'gemini'), codexFileNoAgent: run('x-none', codex, undefined), claudeFileAsCodex: run('c-codex', claude, 'codex'),
    // 줄 하나를 읽을 때마다의 속 상태(뒤 줄이 덮어써서 마지막 모습만으로는 안 보이는 변화를 잡는다)
    perLine: { claude: lineStates('claude-lines', claude, 'claude'), codex: lineStates('codex-lines', codex, 'codex') },
    contextWindows: [null, '', 'claude-haiku-4-5-20251001', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-3-haiku', 'gpt-6.1-sol'].flatMap((model) => ['claude', 'codex', 'gemini', undefined].flatMap((agent) => [null, 123456].map((window) => deep({ model, agent, window, result: Object.assign(Object.create(TranscriptTail.prototype), { agent, model, window }).contextWindow() })))),
    lineCounts: { claude: claude.length, codex: codex.length },
  };
  function lineStates(name, lines, agent) {
    const file = path.join(dir, `${name}.jsonl`);
    fs.writeFileSync(file, '');
    const tail = new TranscriptTail(file, agent);
    return lines.map((l) => {
      fs.appendFileSync(file, JSON.stringify(l) + '\n');
      const items = tail.poll();
      return deep({ kinds: items.map((it) => it.kind).join(','), turnState: tail.turnState(), ctx: tail.contextWindow(), model: tail.model, usage: tail.lastUsage, window: tail.window, turnOpen: tail.turnOpen, turnDoneAt: tail.turnDoneAt, tools: tail.tools, aiTitle: tail.aiTitle, firstUser: tail.firstUser, unknown: tail.unknown, firstT: tail.firstT, lastT: tail.lastT, sizes: [tail.sidechain.size, tail.calls.size, tail.finished.size, tail.finishedByTask.size, tail.bg.size, tail.toolIn.size].join('/') });
    });
  }
}
