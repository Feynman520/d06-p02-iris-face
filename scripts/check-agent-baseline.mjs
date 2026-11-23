// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 기준선 — 에이전트(Claude·Codex)에 따라 갈리는 동작을 "지금 그대로" 찍어 둔 고정 표본과 비교한다.
//   에이전트 장부(등록부)로 옮기는 동안, 옮기기 전과 글자 하나까지 같은 결과가 나오는지 보는 검사다(동작을 바꾸지 않는 옮기기의 증명).
//   찍는 것: ① 선택값 정리(normalize)·재개 모델·권한 표시 ② 실행 사양(실행 파일·인수 배열·세션 id·기록 경로·재개 명령)
//            ③ 세션을 띄울 때의 부작용 순서(끝내기 → 코덱스 호환 → fast 설정 → 폴더 신뢰 → 열쇠 → 실행 → 저장)와 자식 환경 변수
//            ④ 저장되는 카드 값(sessions.json) ⑤ 기록 파일 짝짓기(클로드 새 번호 따라가기 · 코덱스 rollout 찾기) ⑥ 명부에 없는 에이전트 값은 거절한다는 것(새 요청 = 오류 · 저장된 카드 = 열지 않고 보존)
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
//     (명부에 없는 에이전트 이름을 조용히 클로드·코덱스로 다루던 옛 폴백은 2026-11-21 걸음 5 에서 없앴다 — 지금 표본은 "거절"이 정답이다.
//      값이 없는 칸(undefined · null · '')만 기본 에이전트로 본다. 사례 이름에 남은 「지금 동작」 글자는 그때의 이름 그대로다.)
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
const MODES = ['env', 'receipt', 'importorder'];
const arg = (k) => { const a = process.argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a == null ? undefined : a.slice(k.length + 3); }; // 첫 '=' 뒤 전부(경로에 '=' 가 있어도)
const TMP_PREFIX = 'iris-ab-';

if (arg('mode') !== undefined) {
  // 자식은 부모가 만든 임시 폴더에서만 돈다(아무 폴더나 시험 장소로 쓰지 않게)
  const tmp = path.resolve(arg('tmp') || '');
  if (!path.basename(tmp).startsWith(TMP_PREFIX) || path.dirname(tmp).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase() || !fs.existsSync(tmp) || fs.readdirSync(tmp).length) { console.log(`자식 실행 거절: 빈 임시 폴더(${TMP_PREFIX}…)가 아님 — ${tmp}`); process.exit(2); }
  if (arg('mode') === 'importorder') await importOrderChild(tmp); else await child(arg('mode'), tmp);
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
    if (obj(a) && obj(b) && Array.isArray(a) === Array.isArray(b)) {
      const n0 = diffs.length;
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${at}/${k}`);
      // 값은 다 같은데 글자가 다르다 = 키 순서가 바뀜(돌려주는 객체의 키 순서도 지키는 계약이다)
      if (diffs.length === n0) diffs.push({ at: `${at} (키 순서)`, want: Object.keys(a), got: Object.keys(b) });
      return;
    }
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
// ───────────────────────── 자식(불러오기 순서): 기록 읽기 모듈을 먼저 불러온 뒤에 환경 변수를 정하고 에이전트 창구를 불러온다 ─────────────────────────
//   기록 읽기(transcript.mjs)를 불러오는 것만으로 에이전트의 설정 폴더·상태 폴더 자리가 굳으면 안 된다(그 자리는 agents.mjs 를 처음 불러올 때 정해진다).
async function importOrderChild(tmp) {
  const soul = path.join(tmp, 'soul'), late = path.join(tmp, 'late');
  fs.mkdirSync(path.join(soul, '_agent'), { recursive: true });
  for (const k of Object.keys(process.env)) if (/^(CLAUDE|CODEX|ANTHROPIC|OPENAI|IRIS)/i.test(k)) delete process.env[k];
  process.env.IRIS_ROOT = soul;
  const tok = (v) => String(v).split(late).join('<LATE>').split(soul).join('<SOUL>').split(tmp).join('<TMP>');
  // 울타리(이 자식에도): 임시 폴더 밖 쓰기·프로세스 실행은 그 자리에서 막는다 — 모듈을 불러오기 전에 단다
  const violations = [];
  const TMP_L = tmp.toLowerCase() + path.sep;
  const inTmp = (f) => (typeof f === 'string' || f instanceof URL) && `${path.resolve(f instanceof URL ? fileURLToPath(f) : f)}${path.sep}`.toLowerCase().startsWith(TMP_L);
  const block = (what) => { violations.push(tok(what)); const e = new Error(`기준선 검사 울타리: ${what}`); e.code = 'EBASELINE_FENCE'; throw e; };
  for (const [fn, idx] of Object.entries({ writeFileSync: [0], appendFileSync: [0], renameSync: [0, 1], mkdirSync: [0], rmSync: [0], unlinkSync: [0], rmdirSync: [0], copyFileSync: [1], cpSync: [1], truncateSync: [0], symlinkSync: [1], linkSync: [1], createWriteStream: [0] })) {
    const orig = fs[fn]; fs[fn] = function (...a) { for (const i of idx) if (!inTmp(a[i])) block(`임시 폴더 밖 쓰기 ${fn}(${String(a[i])})`); return orig.apply(this, a); };
  }
  for (const fn of ['writeFile', 'appendFile', 'rename', 'mkdir', 'rm', 'unlink', 'rmdir', 'copyFile', 'cp', 'truncate']) { fs[fn] = () => block(`비동기 파일 함수 fs.${fn}`); fs.promises[fn] = () => block(`비동기 파일 함수 fs.promises.${fn}`); }
  for (const fn of ['spawn', 'spawnSync', 'exec', 'execFile', 'execSync', 'execFileSync', 'fork']) cp[fn] = (file) => block(`프로세스 실행 ${fn}(${file})`);
  syncBuiltinESMExports();
  const T = await import(pathToFileURL(path.join(ROOT, 'daemon', 'transcript.mjs')).href);
  const tailFirst = { exports: Object.keys(T).sort() };
  // 이제서야 환경 변수를 정한다
  Object.assign(process.env, { CLAUDE_CONFIG_DIR: path.join(late, 'claude'), CODEX_HOME: path.join(late, 'codex'), IRIS_FACE_STATE: path.join(late, 'state') });
  const A = await import(pathToFileURL(path.join(ROOT, 'daemon', 'agents.mjs')).href);
  const cmd = A.buildCommand({ agent: 'claude', model: 'opus', effort: 'high' }, 'C:/ab-work', { resumeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  const out = { importOrder: { transcript: tailFirst, CLAUDE_CONFIG_DIR: tok(A.CLAUDE_CONFIG_DIR), CODEX_HOME: tok(A.CODEX_HOME), recordPath: tok(cmd.recordPath), fastSettings: tok(cmd.args[cmd.args.indexOf('--settings') + 1]), wroteUnderLate: fs.existsSync(path.join(late, 'state', 'fast-mode.json')) }, violations };
  fs.writeFileSync(path.join(tmp, 'out.json'), JSON.stringify(out), 'utf8');
  if (violations.length) { console.log(`울타리 위반 ${violations.length}건:`); for (const v of violations) console.log(`  ${v}`); process.exit(3); }
  process.exit(0);
}

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
  // 코덱스 기록의 날짜 폴더(sessions\YYYY\MM\DD)는 돌린 날에 따라 바뀌므로 오늘 · 어제를 자리 이름으로 바꾼다(11/23 — 날짜가 박힌 표본이 다음 날 깨짐)
  const ymd = (d) => [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')];
  const dayNames = [[ymd(new Date()), '<TODAY>'], [ymd(new Date(Date.now() - 86400000)), '<YESTERDAY>']];
  const tok = (s) => {
    let t = String(s);
    for (const [p, name] of variants) t = t.replace(new RegExp(esc(p), 'g'), name);
    for (const [[y, m, d], name] of dayNames) t = t.replace(new RegExp(`sessions(?<s>\\\\{1,2}|/)${y}\\k<s>${m}\\k<s>${d}`, 'g'), `sessions$<s>${name}`); // \1 뒤에 숫자가 붙으면 \111 로 읽히므로 이름 붙인 짝을 쓴다
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
    // 화면 글자·종료를 이 검사가 흘려 넣을 수 있게 받는 쪽(콜백)을 쥐고, CLI 로 가는 키 입력을 적어 둔다
    const proc = { pid, cols: opts.cols, rows: opts.rows, writes: [], onData(cb) { proc.dataCb = cb; }, onExit(cb) { proc.exitCb = cb; }, write(d) { proc.writes.push(d); }, resize() {}, kill() {} };
    return proc;
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

  // 글자가 아닌 에이전트 값(목록·객체·숫자 — 화면은 보내지 않지만 API 의 JSON 본문으로는 올 수 있다): 지금 동작 그대로.
  //   `['claude']` 는 표 찾기에서는 'claude' 로 읽히고 글자 비교(===)에서는 클로드가 아니다 — 그 어긋남까지 찍는다.
  //   읽기 순서·횟수도 찍는다(값을 읽을 때마다 적는 객체): 같은 값을 몇 번, 어떤 순서로 읽는지가 달라지면 여기서 드러난다.
  const ODD = [['claude'], ['codex'], ['gemini'], [], {}, { toString: 'x' }, 5, 0, true, false];
  const oddName = (v) => JSON.stringify(v);
  const spy = (obj, log, name) => new Proxy(obj, { get(t, k) { if (typeof k === 'string') log.push(`${name}.${k}`); return t[k]; } });
  out.oddAgents = ODD.map((agent) => {
    const base = { agent, model: 'opus', effort: 'high', permission: 'plan', approval: 'never', sandbox: 'workspace-write', readOnly: true };
    const row = { agent: oddName(agent) };
    row.normalize = tryIt(() => normalize(base));
    row.normalizeCodexModel = tryIt(() => normalize({ ...base, model: 'gpt-6-luna', sandbox: '' }));
    row.keepActual = ['claude-opus-4-1', 'gpt-5.5'].map((modelActual) => tryIt(() => normalize({ ...base, model: 'gone', keepActual: true, modelActual })));
    for (const resumeId of [undefined, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']) {
      events = []; newCase(`odd ${oddName(agent)} ${resumeId ? 'resume' : 'new'}`); const u0 = uuidN;
      row[resumeId ? 'buildResume' : 'buildNew'] = { result: tryIt(() => buildCommand(base, work, resumeId ? { resumeId } : undefined)), uuidCalls: uuidN - u0, events: [...events] };
    }
    row.isFast = [tryIt(() => isFastModel(agent, 'opus')), tryIt(() => isFastModel(agent, 'sonnet', 'claude-opus-9')), tryIt(() => isFastModel(agent))];
    row.permLabel = [tryIt(() => permLabel({ ...base })), tryIt(() => permLabel(normalize(base)))];
    row.keepResume = [{ agent, model: 'm', modelActual: 'claude-opus-4-1' }, { agent, model: 'm', modelActual: 'gpt-5.5' }, { agent: 'claude', model: 'm', modelActual: 'claude-opus-4-1' }].map((rec) => tryIt(() => keepResumeModel({ ...base, modelActual: 'other' }, rec)));
    row.modelForResume = tryIt(() => modelForResume({ agent, model: 'm', modelActual: 'claude-opus-5-5' }));
    return row;
  });
  // 읽기 순서(정상 글자 이름일 때): 선택값·카드의 칸을 어떤 순서로 몇 번 읽는가
  out.readOrder = ['claude', 'codex', 'gemini'].map((agent) => {
    const one = (fn) => { // 읽기 기록은 함수가 돌려준 순간까지만(결과를 표본으로 옮기며 읽는 것은 세지 않는다)
      const log = []; let reads, result;
      try { const v = fn(log); reads = log.join(' '); result = deep(v); } catch (e) { reads = log.join(' '); result = { throws: e?.constructor?.name || 'Error', message: tok(e?.message || '') }; }
      return { reads, result };
    };
    const sel = { agent, model: 'gone', effort: 'high', permission: 'plan', approval: 'never', sandbox: 'read-only', readOnly: true, keepActual: true, modelActual: agent === 'codex' ? 'gpt-5.5' : 'claude-opus-4-1', modelLabel: '' };
    return {
      agent,
      normalize: one((log) => normalize(spy(sel, log, 'sel'))),
      normalizeBadActual: one((log) => normalize(spy({ ...sel, modelActual: 'nope' }, log, 'sel'))),
      keepResume: one((log) => keepResumeModel(spy({ agent, modelActual: 'x', model: 'm' }, log, 'sel'), spy({ agent, model: 'old', modelActual: agent === 'codex' ? 'gpt-5.5' : 'claude-opus-4-1' }, log, 'rec'))),
      keepResumeBad: one((log) => keepResumeModel(spy({ agent, modelActual: 'x', model: 'm' }, log, 'sel'), spy({ agent, model: 'old', modelActual: 'invalid name' }, log, 'rec'))),
      keepResumeNonString: one((log) => keepResumeModel(spy({ agent, modelActual: 'x' }, log, 'sel'), spy({ agent, model: 'old', modelActual: { toString: () => 'claude-x' } }, log, 'rec'))),
      permLabel: one((log) => permLabel(spy({ agent, model: 'opus', modelActual: 'claude-opus-5-5', permission: 'plan', approval: 'never', sandbox: 'read-only' }, log, 's'))),
      // 권한 이름표를 찾는 표(AGENTS.<id>)를 선택값의 칸보다 먼저 읽는지 뒤에 읽는지도 본다 — 표를 읽기 기록 객체로 잠깐 바꿔 끼운다
      permLabelTables: one((log) => {
        const keep = { claude: AGENTS.claude, codex: AGENTS.codex };
        try { AGENTS.claude = spy(keep.claude, log, 'T.claude'); AGENTS.codex = spy(keep.codex, log, 'T.codex'); return permLabel(spy({ agent, model: 'opus', modelActual: 'claude-opus-5-5', permission: 'plan', approval: 'never', sandbox: 'read-only' }, log, 's')); }
        finally { AGENTS.claude = keep.claude; AGENTS.codex = keep.codex; }
      }),
      // 칸을 읽는 도중에 표가 통째로 바뀌면 어느 표의 이름표를 쓰는가(= 표를 부르는 그 순간에 찾는가)
      permLabelSwap: one(() => {
        const keep = { claude: AGENTS.claude, codex: AGENTS.codex };
        const s = { agent, model: 'opus', sandbox: '',
          get permission() { AGENTS.claude = { ...keep.claude, permissions: [{ id: 'plan', label: '바뀐 표' }] }; return 'plan'; },
          get approval() { AGENTS.codex = { ...keep.codex, approvals: [{ id: 'never', label: '바뀐 표' }] }; return 'never'; } };
        try { return permLabel(s); } finally { AGENTS.claude = keep.claude; AGENTS.codex = keep.codex; }
      }),
      normalizeTables: one((log) => {
        const keep = { claude: AGENTS.claude, codex: AGENTS.codex };
        try { AGENTS.claude = spy(keep.claude, log, 'T.claude'); AGENTS.codex = spy(keep.codex, log, 'T.codex'); return normalize(spy({ agent, model: 'nope', effort: 'max', permission: 'plan', approval: 'never', sandbox: 'read-only' }, log, 'sel')); }
        finally { AGENTS.claude = keep.claude; AGENTS.codex = keep.codex; }
      }),
    };
  });

  fs.rmSync(fastFile, { force: true }); // 위 사례들이 만든 fast 설정 파일을 치운다(뒤 구역은 "파일 없음"에서 시작 — 구역끼리 서로 물들지 않게)

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
  ops.push(op('replaceAgent → 모르는 에이전트(gemini) — 지금 동작', () => sm.replaceAgent((g1 || x1).id, { agent: 'gemini' })));
  ops.push(op('resume 살아 있는 카드', () => sm.resume(c1.id)));
  // 고른 뒤 실행 직전에 목록이 바뀜(자동 업데이트): 카드에 적히는 모델과 실제로 넘기는 모델
  let flip = 0;
  setModelRefresher(() => { refreshN++; if (++flip === 2) setModels({ claude: FIX.claude.map((m) => (m.id === 'opus' ? { ...m, label: 'Opus 6', actual: 'claude-opus-6' } : m)) }); });
  ops.push(op('create claude — 정리와 명령 만들기 사이에 목록이 바뀜', () => sm.create({ cwd: work, agent: 'claude', model: 'opus', effort: 'high' })));
  setModelRefresher(() => { refreshN++; }); setModels(FIX);
  out.sessions = ops;

  // ③-2 세션이 살아 있는 동안의 갈림(따로 꾸린 세션 관리자 — 위 표본과 섞이지 않게): 글자가 아닌 에이전트 값 · 코덱스 호환의 오류 · 확인 카드의 키 · 업데이트 물음 자동 응답 · 종료 원인
  const state3 = path.join(tmp, 'state3'); fs.mkdirSync(state3, { recursive: true });
  let align3 = () => ({ action: 'none' });
  const sm3 = new TSM(state3, { onLog: (m) => logs.push(tok(m)), codexHome: homeCodex, alignCodex: (o) => { ev('alignCodex', JSON.stringify({ threadId: o.threadId, faceVersion: typeof o.faceVersion, log: typeof o.log })); return align3(); } });
  const op3 = (name, fn) => {
    events = []; spawns = []; logs.length = 0; newCase(`op3 ${name}`);
    let rec = null, error = null;
    try { rec = fn(); } catch (e) { error = { throws: e?.constructor?.name || 'Error', message: tok(e?.message || '') }; }
    return { name, error, events: [...events], spawns: [...spawns], logs: [...logs], card: rec ? card(rec) : null }; // 사본 — 뒤에 일어나는 일이 이 사례에 섞여 들지 않게
  };
  const odd = [];
  let lc, lx, la;
  odd.push(op3("create 목록 ['codex']", () => (la = sm3.create({ cwd: work, agent: ['codex'], model: 'gpt-6-luna', effort: 'high', approval: 'never', sandbox: 'read-only', permission: 'plan', prompt: '' }))));
  odd.push(op3("create 목록 ['claude']", () => sm3.create({ cwd: work, agent: ['claude'], model: 'opus', permission: 'plan', prompt: '' })));
  odd.push(op3('create 숫자 5', () => sm3.create({ cwd: work, agent: 5, prompt: '' })));
  odd.push(op3('create claude(살아 있는 동안 볼 카드)', () => (lc = sm3.create({ cwd: work, agent: 'claude', model: 'sonnet', prompt: '' }))));
  odd.push(op3('create codex(살아 있는 동안 볼 카드)', () => (lx = sm3.create({ cwd: work, agent: 'codex', prompt: '' }))));
  lx.sessionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  align3 = () => ({ action: 'error', reason: '기록을 읽지 못함' });
  odd.push(op3('switchTo codex (호환 = error)', () => sm3.switchTo(lx.id, {})));
  align3 = () => { throw new Error('호환 처리 중 예외'); };
  odd.push(op3('switchTo codex (호환이 예외를 던짐)', () => sm3.switchTo(lx.id, {})));
  align3 = () => ({ action: 'blocked', reason: '연결이 중계기가 아님' });
  odd.push(op3('switchTo codex (호환 = blocked → 곧 종료)', () => sm3.switchTo(lx.id, {})));
  // 목록 값 카드는 만들 수 없으므로(거절) 저장돼 있던 카드처럼 직접 넣어 switchTo 의 확인에 닿게 한다
  sm3.sessions.set('odd-list', { id: 'odd-list', cwd: work, agent: ['codex'], model: 'gpt-6.1-sol', effort: 'medium', status: 'exited', pid: null, sessionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });
  odd.push(op3("switchTo 목록 ['codex'] 카드", () => sm3.switchTo('odd-list', {})));
  sm3.sessions.delete('odd-list');
  // 세션 띄우기 함수를 바깥에서 직접 부름(buildCommand 가 만들지 않은 명령 · 인자 넷): 명령 글자로 에이전트를 가려 그 에이전트의 폴더 신뢰 · 열쇠를 한다
  const work3 = path.join(tmp, 'Work Three'); fs.mkdirSync(work3, { recursive: true });
  for (const [label, cmd] of [['codex 로 시작', { file: 'cmd.exe', args: ['/c', 'codex', '--x'] }], ['CODEX-cli 대문자', { file: 'cmd.exe', args: ['/c', 'CODEX', '-m'] }], ['claude 로 시작', { file: 'cmd.exe', args: ['/c', 'claude', '--y'] }], ['다른 실행 파일', { file: 'cmd.exe', args: ['/c', 'antigravity', '--z'] }], ['인수 없음', { file: 'x.exe' }], ['codexx(낱말 경계 아님)', { file: 'cmd.exe', args: ['/c', 'codexx'] }]]) {
    odd.push(op3(`spawn 직접 — ${label}`, () => { const proc = sm3.spawn(cmd, path.join(work3, label.replace(/[^a-z]/gi, '_')), 80, 24); return { id: `direct-${label}`, pidKind: typeof proc.pid }; }));
  }
  odd.push(op3('spawn 직접 — buildCommand 가 만든 명령을 그대로', () => { const cmd = buildCommand({ agent: 'codex' }, work3); sm3.spawn(cmd, path.join(work3, 'built'), 80, 24); return { id: 'direct-built' }; }));
  odd.push(op3('spawn 직접 — 만든 명령의 사본(펼쳐 복사)', () => { const cmd = { ...buildCommand({ agent: 'claude', model: 'sonnet' }, work3) }; sm3.spawn(cmd, path.join(work3, 'copy'), 80, 24); return { id: 'direct-copy' }; }));
  // 설정 폴더가 환경 변수에 없을 때(영수증도 없으면) 폴더 신뢰는 모듈이 처음 정한 폴더(대체 폴더)에 적는다 — 처음 보는 작업 폴더로
  const work2 = path.join(tmp, 'Work Two'); fs.mkdirSync(work2, { recursive: true });
  const noHomeEnv = (fn) => { const keep = { c: process.env.CLAUDE_CONFIG_DIR, x: process.env.CODEX_HOME }; delete process.env.CLAUDE_CONFIG_DIR; delete process.env.CODEX_HOME; try { return fn(); } finally { if (keep.c !== undefined) process.env.CLAUDE_CONFIG_DIR = keep.c; if (keep.x !== undefined) process.env.CODEX_HOME = keep.x; } };
  odd.push(op3('create claude — 환경 변수에 설정 폴더 없음', () => noHomeEnv(() => sm3.create({ cwd: work2, agent: 'claude', model: 'sonnet', prompt: '' }))));
  odd.push(op3('create codex — 환경 변수에 설정 폴더 없음', () => noHomeEnv(() => sm3.create({ cwd: work2, agent: 'codex', prompt: '' }))));
  odd.push({ name: '위 두 사례 뒤 대체 폴더의 설정', claude: (() => { try { return tok(fs.readFileSync(path.join(A.CLAUDE_CONFIG_DIR, '.claude.json'), 'utf8')).includes('Work Two'); } catch { return null; } })(), codex: (() => { try { return tok(fs.readFileSync(path.join(A.CODEX_HOME, 'config.toml'), 'utf8')).includes('work two'); } catch { return null; } })() });
  // 화면에 확인 물음이 뜸 → 0.7초 뒤 상태 판정 → 확인 카드(누를 키). 코덱스 업데이트 물음은 자동 응답(2 → Enter).
  const ASK = '\r\n Do you want to proceed?\r\n \u276f 1. Yes\r\n   2. Yes, and don\u2019t ask again\r\n   3. No\r\n\r\n Esc to cancel\r\n';
  const UPDATE = '\r\n Update available! 0.170.0 -> 0.171.0\r\n\r\n \u203a 1. Update now\r\n   2. Skip\r\n   3. Skip until next version\r\n\r\n enter continue \u00b7 esc skip\r\n';
  const p3 = (r) => sm3.live.get(r.id)?.pty;
  const cards3 = () => [lc, lx, la].filter(Boolean); // 만들기가 거절된 카드는 빠진다
  for (const r of cards3()) p3(r).dataCb(ASK);
  newCase('op3 업데이트 물음을 볼 카드');
  const updCard = sm3.create({ cwd: work, agent: 'claude', model: 'sonnet', prompt: '' }); p3(updCard).dataCb(UPDATE);
  await new Promise((r) => setTimeout(r, 1300));
  const liveView = (r) => deep({ agent: r.agent, status: r.status, prompt: r.prompt ? { kind: r.prompt.kind, question: r.prompt.question, options: (r.prompt.options || []).map((o) => ({ label: o.label, key: o.key })) } : null, writes: [...(p3(r)?.writes || [])] });
  const live = { ask: cards3().map(liveView), update: liveView(updCard) };
  // 종료: 곧바로 끝난 CLI 는 화면 마지막 줄에서 원인을 골라 카드에 남긴다(코덱스 호환이 남긴 이유와 합쳐서)
  logs.length = 0;
  p3(lx).dataCb('\r\nError: thread was created with a different model provider\r\n'); p3(lc).dataCb('\r\nclaude: command not found\r\n');
  await new Promise((r) => setTimeout(r, 300));
  p3(lx).exitCb({ exitCode: 1 }); p3(lc).exitCb({ exitCode: 0 }); if (la) p3(la).exitCb({ exitCode: 3 });
  // 호환 처리가 오류(error)로 끝난 재개가 곧 종료: 그 이유가 카드에 남는다
  newCase('op3 호환 오류 뒤 곧 종료');
  const le = sm3.create({ cwd: work, agent: 'codex', prompt: '' }); le.sessionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  align3 = () => ({ action: 'error', reason: '기록을 읽지 못함' }); sm3.switchTo(le.id, {}); align3 = () => ({ action: 'none' });
  p3(le).exitCb({ exitCode: 2 });
  live.exitAfterCompatError = deep({ status: le.status, exitCode: le.exitCode, exitReason: le.exitReason, compat: le.compat });
  live.exit = cards3().map((r) => deep({ agent: r.agent, status: r.status, exitCode: r.exitCode, exitReason: r.exitReason, live: sm3.live.has(r.id) }));
  live.exitLogs = [...logs];
  live.saved = (() => { try { return JSON.parse(fs.readFileSync(path.join(state3, 'sessions.json'), 'utf8')).map((r) => card(r)); } catch (e) { return String(e?.message); } })();
  out.sessionsLive = { ops: odd, live };

  // ③-3 폴더 신뢰 미리 답하기: 에이전트 값의 종류 × 설정 폴더가 어디서 오는가 × 이미 있는 설정(있는 값은 바꾸지 않는다)
  const { preTrust } = await import(pathToFileURL(path.join(ROOT, 'daemon', 'trust.mjs')).href);
  const tdir = path.join(tmp, 'trust'); let tn = 0;
  const trustCase = (name, agent, { claudeFile, codexFile, env = 'both', fallback = 'both', cwd = 'C:\\Work Dir\\Sub\\' } = {}) => {
    const home = path.join(tdir, String(++tn)); const c = path.join(home, 'c'), x = path.join(home, 'x'), fc = path.join(home, 'fc'), fx = path.join(home, 'fx');
    for (const d of [c, x, fc, fx]) fs.mkdirSync(d, { recursive: true });
    if (claudeFile !== undefined) { fs.writeFileSync(path.join(c, '.claude.json'), claudeFile); fs.writeFileSync(path.join(fc, '.claude.json'), claudeFile); }
    if (codexFile !== undefined) { fs.writeFileSync(path.join(x, 'config.toml'), codexFile); fs.writeFileSync(path.join(fx, 'config.toml'), codexFile); }
    const envObj = env === 'both' ? { CLAUDE_CONFIG_DIR: c, CODEX_HOME: x } : env === 'none' ? {} : undefined;
    const fb = fallback === 'both' ? { claudeConfigDir: fc, codexHome: fx } : fallback === 'none' ? {} : undefined;
    let result; try { result = preTrust({ agent, cwd, env: envObj, fallback: fb }); } catch (e) { result = { throws: e?.constructor?.name, message: e?.message }; }
    const rd = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
    return { name, agent: JSON.stringify(agent) ?? '<undefined>', result: deep(result), files: { 'env/.claude.json': rd(path.join(c, '.claude.json')), 'env/config.toml': rd(path.join(x, 'config.toml')), 'fallback/.claude.json': rd(path.join(fc, '.claude.json')), 'fallback/config.toml': rd(path.join(fx, 'config.toml')) } };
  };
  out.trust = [
    ...['claude', 'codex', 'gemini', undefined, null, ['codex'], ['claude'], 5].map((a) => trustCase('새 설정(환경 변수의 폴더)', a)),
    ...['claude', 'codex', 'gemini'].flatMap((a) => [trustCase('환경 변수 없음 → 대체 폴더', a, { env: 'none' }), trustCase('둘 다 없음', a, { env: 'none', fallback: 'none' }), trustCase('env·fallback 인자 자체가 없음', a, { env: 'missing', fallback: 'missing' })]),
    trustCase('클로드: 이미 거절로 적힌 폴더·본 횟수 1·다른 키 보존', 'claude', { claudeFile: JSON.stringify({ hasCompletedOnboarding: false, fullscreenUpsellSeenCount: 1, keep: { a: 1 }, projects: { 'C:/Work Dir/Sub': { hasTrustDialogAccepted: false, x: 1 }, 'C:/other': {} } }) }),
    trustCase('클로드: 다 있음(바꿀 것 없음)', 'claude', { claudeFile: JSON.stringify({ hasCompletedOnboarding: true, hasCompletedClaudeInChromeOnboarding: true, fullscreenUpsellSeenCount: 9, hasSeenAutoDefaultNudge: true, projects: { 'C:/Work Dir/Sub': { hasTrustDialogAccepted: true } } }) }),
    trustCase('클로드: 깨진 JSON', 'claude', { claudeFile: '{ 깨짐' }), trustCase('클로드: 최상위가 배열', 'claude', { claudeFile: '[]' }), trustCase('클로드: projects 가 글자', 'claude', { claudeFile: '{"projects":"x"}' }), trustCase('클로드: projects 가 null', 'claude', { claudeFile: '{"projects":null}' }),
    trustCase('클로드: 그 폴더 값이 객체가 아님', 'claude', { claudeFile: '{"projects":{"C:/Work Dir/Sub":5}}' }),
    trustCase('코덱스: 다른 표가 있는 설정(줄바꿈 없이 끝남)', 'codex', { codexFile: 'model = "x"\n[projects.\'c:\\other\']\ntrust_level = "trusted"' }),
    trustCase('코덱스: 같은 폴더가 작은따옴표 표로 이미 있음', 'codex', { codexFile: '[projects.\'c:\\work dir\\sub\']\ntrust_level = "untrusted"\n' }),
    trustCase('코덱스: 같은 폴더가 큰따옴표 표로 이미 있음', 'codex', { codexFile: '[projects."c:\\\\work dir\\\\sub"]\ntrust_level = "untrusted"\n' }),
    trustCase('코덱스: 빈 설정 파일', 'codex', { codexFile: '' }),
    trustCase('작업 폴더 없음', 'claude', { cwd: '' }), trustCase('작업 폴더 없음', 'codex', { cwd: '' }),
  ];

  // 옛 저장 카드 읽기(load) → 자동 재개: 에이전트 이름이 없는 것·모르는 것도 지금 그대로
  const state2 = path.join(tmp, 'state2'); fs.mkdirSync(state2, { recursive: true });
  const DEAD = FAKE_PID0; const ALIVE = FAKE_PID0 + 999000; alivePids.add(ALIVE);
  fs.writeFileSync(path.join(state2, 'sessions.json'), JSON.stringify([
    { id: 's1', cwd: work, agent: 'claude', model: 'opus', modelActual: 'claude-opus-5', effort: 'high', permission: 'bypassPermissions', status: 'busy', pid: DEAD, sessionId: '11111111-1111-4111-8111-111111111111' },
    { id: 's2', cwd: work, agent: 'codex', model: 'gpt-5.6-terra', effort: 'medium', readOnly: true, status: 'idle', pid: DEAD, sessionId: '22222222-2222-4222-8222-222222222222' },
    { id: 's3', cwd: work, model: 'opus', effort: 'high', status: 'idle', pid: DEAD, sessionId: '33333333-3333-4333-8333-333333333333' },
    { id: 's4', cwd: work, agent: 'gemini', model: 'gemini-4-argon-high', modelActual: 'gemini-4-argon-high', effort: 'high', status: 'attention', pid: DEAD, sessionId: '44444444-4444-4444-8444-444444444444' },
    // 글자가 아닌 값 · 세션 id 가 없는 열 수 없는 카드(원래 이유가 있음) · PID 가 살아 있는 열 수 없는 카드 · 전에 표식이 붙었다가 이제 열 수 있게 된 카드 · 이유가 있는 정상 카드 · 에이전트 칸이 없고 쓰던 정확한 모델이 있는 옛 카드
    { id: 's5', cwd: work, agent: ['codex'], model: 'gpt-6.1-sol', effort: 'medium', status: 'idle', pid: DEAD, sessionId: '55555555-5555-4555-8555-555555555555' },
    { id: 's6', cwd: work, agent: 'gemini', model: 'g', effort: 'high', status: 'busy', pid: DEAD, sessionId: null, exitReason: '원래 있던 종료 이유' },
    { id: 's7', cwd: work, agent: 'gemini', model: 'g', effort: 'high', status: 'busy', pid: ALIVE, sessionId: '77777777-7777-4777-8777-777777777777', previous: [{ agent: 'antigravity', sessionId: 'p1' }] },
    { id: 's8', cwd: work, agent: 'codex', model: 'gpt-6.1-sol', effort: 'medium', status: 'exited', pid: DEAD, sessionId: '88888888-8888-4888-8888-888888888888', unsupported: true, exitReason: '이 판에서 열 수 없는 에이전트의 세션입니다(codex)', exitReasonSaved: '그 전에 있던 이유' },
    { id: 's9', cwd: work, agent: 'claude', model: 'opus', effort: 'high', status: 'exited', pid: DEAD, sessionId: '99999999-9999-4999-8999-999999999999', exitReason: '정상 카드의 종료 이유' },
    { id: 's10', cwd: work, model: 'gone', modelActual: 'claude-opus-4-1', modelLabel: 'Opus 4.1', effort: 'high', status: 'idle', pid: DEAD, sessionId: 'aaaaaaaa-0000-4000-8000-00000000000a' },
  ]), 'utf8');
  const sm2 = new TSM(state2, { onLog: (m) => logs.push(tok(m)), codexHome: homeCodex, alignCodex: (o) => { ev('alignCodex', JSON.stringify({ threadId: o.threadId })); return { action: 'none' }; } });
  // 읽어 들인 직후의 카드(상태 · 잃은 세션 표식 · 열 수 없는 카드 표식과 이유)와 자동 재개 대상
  out.oldCardsLoaded = { cards: sm2.list().map((r) => card(r)), autoResume: sm2.lost().map((r) => r.id) };
  // 에이전트 칸이 없는 옛 카드(재개 전 — 재개하면 칸이 채워진다)에 대한 요청 확인: 기본 에이전트를 적어 보내면 같은 에이전트(false), 다른 에이전트면 true
  out.switchGuardNoAgent = ['s3', 's10'].flatMap((id) => [undefined, null, '', 'claude', 'codex', 'gemini', 0, false].map((agent) => {
    let r; try { r = sm2.checkSwitch(id, agent); } catch (e) { r = { throws: e?.constructor?.name || 'Error', code: e?.code || null }; }
    return { id, cardAgent: JSON.stringify(sm2.get(id).agent) ?? '<undefined>', agent: JSON.stringify(agent) ?? '<undefined>', result: r };
  }));
  out.oldCards = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'].map((id) => {
    events = []; spawns = []; logs.length = 0; newCase(`old ${id}`);
    let rec = null, error = null; try { rec = sm2.resume(id, { prompt: 'RESUME' }); } catch (e) { error = { throws: e?.constructor?.name || 'Error', message: tok(e?.message || '') }; }
    return { id, error, events: [...events], spawns: [...spawns], card: rec ? card(rec) : null }; // 사본 — 뒤 구역에서 일어나는 일이 섞여 들지 않게
  });

  // ③-4 보조 작업(서브에이전트) 감시: 부모 세션의 에이전트에 따라 어느 폴더에서 어떤 파일을 보조 기록으로 보고, 언제 끝났다고 보는가
  {
    const { SubagentWatcher } = await import(pathToFileURL(path.join(ROOT, 'daemon', 'subagents.mjs')).href);
    const { TranscriptTail } = await import(pathToFileURL(path.join(ROOT, 'daemon', 'transcript.mjs')).href);
    const sdir = path.join(tmp, 'sub'); const J = (o) => JSON.stringify(o) + '\n'; const T0 = '2026-01-01T00:20:';
    const SID = '99999999-0000-4000-8000-000000000001';
    // 클로드 꼴: <기록 폴더>\<세션 id>\subagents\agent-*.jsonl (+ .meta.json)
    const cdir = path.join(sdir, 'c'), csub = path.join(cdir, SID, 'subagents'); fs.mkdirSync(csub, { recursive: true });
    const cParent = path.join(cdir, `${SID}.jsonl`);
    fs.writeFileSync(cParent, J({ type: 'assistant', timestamp: `${T0}01.000Z`, message: { content: [{ type: 'tool_use', id: 'ag1', name: 'Agent', input: { description: '동기 보조' } }, { type: 'tool_use', id: 'ag2', name: 'Agent', input: { description: '배경 보조' } }] } })
      + J({ type: 'user', timestamp: `${T0}09.000Z`, message: { content: [{ type: 'tool_result', tool_use_id: 'ag1', content: '끝' }] } })
      + J({ type: 'user', timestamp: `${T0}12.000Z`, message: { content: '<task-notification><task-id>b2</task-id><tool-use-id>zz</tool-use-id><status>completed</status><summary>Agent "배경 보조" completed</summary></task-notification>' } }));
    fs.writeFileSync(path.join(csub, 'agent-a1.jsonl'), J({ type: 'user', isSidechain: true, timestamp: `${T0}02.000Z`, message: { content: '보조에게 준 일\n둘째 줄' } }) + J({ type: 'assistant', isSidechain: true, timestamp: `${T0}03.000Z`, message: { model: 'claude-sonnet-5-5', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'x' } }] } }));
    fs.writeFileSync(path.join(csub, 'agent-a1.meta.json'), JSON.stringify({ description: '코드 찾기', agentType: 'Explore', toolUseId: 'ag1' }));
    fs.writeFileSync(path.join(csub, 'agent-b2.jsonl'), J({ type: 'user', isSidechain: true, timestamp: `${T0}04.000Z`, message: { content: '배경 일' } }));
    fs.writeFileSync(path.join(csub, 'agent-b2.meta.json'), JSON.stringify({ agentType: 'general-purpose', requestShape: 'background', model: 'haiku', toolUseId: 'ag2' }));
    fs.writeFileSync(path.join(csub, 'agent-c3.jsonl'), J({ type: 'user', isSidechain: true, timestamp: `${T0}05.000Z`, message: { content: '끝 신호가 없는 보조' } }));
    fs.writeFileSync(path.join(csub, 'other.jsonl'), J({ type: 'user', message: { content: '이름이 agent- 가 아님' } })); fs.writeFileSync(path.join(csub, 'agent-d4.txt'), 'x');
    fs.writeFileSync(path.join(csub, 'agenda-e5.jsonl'), J({ type: 'user', isSidechain: true, timestamp: `${T0}06.000Z`, message: { content: '이름 머리가 agent- 가 아님(age… 로 시작)' } }));
    fs.writeFileSync(path.join(csub, 'rollout-in-claude-dir.jsonl'), J({ type: 'session_meta', payload: { id: 'kz', parent_thread_id: SID } }));
    // 코덱스 꼴: 부모 rollout 과 같은 폴더(와 오늘·어제 폴더)의 rollout-*.jsonl 가운데 parent_thread_id 가 부모인 것
    const xdir = path.join(sdir, 'x'); fs.mkdirSync(xdir, { recursive: true });
    const xParent = path.join(xdir, 'rollout-parent.jsonl');
    fs.writeFileSync(xParent, J({ type: 'session_meta', timestamp: `${T0}01.000Z`, payload: { id: SID, originator: 'codex-tui' } }) + J({ type: 'response_item', timestamp: `${T0}02.000Z`, payload: { type: 'function_call', name: 'spawn_agent', call_id: 'sp1', arguments: '{}' } }));
    const kid = (name, id, parent, extra, lines) => fs.writeFileSync(path.join(xdir, name), J({ type: 'session_meta', timestamp: `${T0}03.000Z`, payload: { id, parent_thread_id: parent, timestamp: `${T0}03.500Z`, ...extra } }) + lines.map(J).join(''));
    kid('rollout-k1.jsonl', 'k1', SID, { source: { subagent: { thread_spawn: { agent_nickname: '탐색', agent_path: 'team/explorer' } } } }, [{ type: 'event_msg', timestamp: `${T0}04.000Z`, payload: { type: 'task_started' } }, { type: 'response_item', timestamp: `${T0}05.000Z`, payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '찾아 줘\n자세히' }] } }, { type: 'response_item', timestamp: `${T0}06.000Z`, payload: { type: 'function_call', name: 'shell', call_id: 'c', arguments: '{"command":["ls"]}' } }, { type: 'event_msg', timestamp: `${T0}07.000Z`, payload: { type: 'task_complete' } }]);
    kid('rollout-k2.jsonl', 'k2', 'someone-else', {}, [{ type: 'event_msg', timestamp: `${T0}04.000Z`, payload: { type: 'task_started' } }]);
    kid('rollout-k3.jsonl', 'k3', SID, {}, [{ type: 'event_msg', timestamp: `${T0}04.000Z`, payload: { type: 'task_started' } }, { type: 'response_item', timestamp: `${T0}05.000Z`, payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '아직 도는 보조' }] } }]);
    kid('notes-k9.jsonl', 'k9', SID, {}, [{ type: 'event_msg', timestamp: `${T0}04.000Z`, payload: { type: 'task_started' } }]); // 속은 맞지만 이름이 rollout- 이 아님
    kid('rollout-k5.jsonl', 'k5', SID, {}, [{ type: 'response_item', timestamp: `${T0}05.000Z`, payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '차례 신호가 없는 보조' }] } }]);
    fs.writeFileSync(path.join(xdir, 'rollout-k4.jsonl'), '{ 깨진 첫 줄\n'); fs.writeFileSync(path.join(xdir, 'agent-in-codex-dir.jsonl'), J({ type: 'user', isSidechain: true, message: { content: 'x' } }));
    const strip = (l) => deep(l.map((s) => ({ ...s, file: path.relative(sdir, s.file) })));
    const watch = (agent, recordPath, parentAgent = agent) => {
      const lg = []; let out2;
      try {
        const w = new SubagentWatcher({ agent, recordPath, sessionId: SID }, (m) => lg.push(tok(m)));
        const parent = new TranscriptTail(recordPath, parentAgent); parent.poll();
        const dirs = w.dirs().map((d) => (inTmp(d) ? tok(path.relative(sdir, d)) : '<날짜 폴더>'));
        const r = { dirs, scan1: w.scan(true, true), version1: w.version, afterScan: strip(w.list()) };
        const p1 = w.poll(parent, true); r.poll1 = { changed: p1.changed, updates: p1.updates.map((u) => `${u.key}:${u.items.map((i) => i.kind).join(',')}`), list: strip(w.list()), running: w.running() };
        const p2 = w.poll(parent, false); r.poll2 = { changed: p2.changed, updates: p2.updates.length, list: strip(w.list()), running: w.running() };
        r.scan2 = w.scan(false, true); r.scanThrottled = w.scan(true); r.version = w.version;
        r.transcripts = Object.fromEntries([...w.subs.keys()].map((k) => { const t = w.transcript(k); return [k, deep({ kinds: t.items.map((i) => i.kind).join(','), meta: t.meta })]; }));
        r.missing = w.transcript('없는 키'); r.get = w.get('없는 키');
        out2 = r;
      } catch (e) { out2 = { throws: e?.constructor?.name || 'Error', message: tok(e?.message || '') }; }
      return { agent: JSON.stringify(agent) ?? '<undefined>', parentReadAs: JSON.stringify(parentAgent) ?? '<undefined>', result: out2, logs: lg };
    };
    out.subagents = [watch('claude', cParent), watch('codex', xParent), watch('gemini', cParent), watch('gemini', xParent), watch(['claude'], cParent), watch(['codex'], xParent), watch(undefined, cParent), watch('claude', xParent), watch('codex', cParent),
      (() => { try { return deep(new SubagentWatcher({ agent: 'claude', recordPath: cParent, sessionId: null }).dirs()); } catch (e) { return { throws: e?.message }; } })()];
  }

  // ③-5 제목 생성: 세션의 에이전트에 따라 어떤 헤드리스 명령을 어떤 입력·환경으로 부르고, 그 출력에서 제목을 어떻게 뽑는가(진짜 프로세스는 띄우지 않는다 — 가짜 spawn)
  {
    const Tt = await import(pathToFileURL(path.join(ROOT, 'daemon', 'titler.mjs')).href);
    const blocked = cp.spawn; const calls = [];
    const fakeProc = (plan) => { const h = { stdout: {}, stderr: {}, exit: null, error: null }; const proc = { stdin: { end(t) { plan.stdin = t; } }, stdout: { on(_, cb) { h.stdout = cb; } }, stderr: { on(_, cb) { h.stderr = cb; } }, on(evn, cb) { h[evn] = cb; }, kill() { plan.killed = true; } }; setTimeout(() => { if (plan.out) h.stdout(plan.out); if (plan.err) h.stderr(plan.err); if (plan.error) h.error(new Error(plan.error)); else h.exit(plan.code ?? 0); }, 5); return proc; };
    const title = async (name, prompt, opt, plan = {}) => {
      const lg = []; let call = null;
      cp.spawn = (file, args, o) => { if (plan.throwOnSpawn) throw new Error('spawn 실패'); call = { file, args, cwdIsTmp: o.cwd === os.tmpdir(), windowsHide: o.windowsHide, stdio: o.stdio, env: Object.fromEntries(Object.keys(o.env).filter((k) => /^(CLAUDE|CODEX|ANTHROPIC|OPENAI|MAX_THINKING)/i.test(k)).sort().map((k) => [k, o.env[k]])) }; return fakeProc(plan); };
      syncBuiltinESMExports();
      let result; try { result = await Tt.generateTitle(prompt, { ...opt, log: (m) => lg.push(tok(m).replace(/\d+\.\ds/g, '<초>')) }); } catch (e) { result = { throws: e?.message }; }
      cp.spawn = blocked; syncBuiltinESMExports();
      return deep({ name, agent: JSON.stringify(opt.agent) ?? '<undefined>', result, call, stdin: plan.stdin ?? null, logs: lg });
    };
    const EXE = 'X:\\bin\\claude.exe'; const REQ = withNote('수행평가 채점 기준을 고쳐 줘');
    function withNote(p) { return `${p}\n\n[첨부 파일]\n- C:\\x\\a.png`; }
    out.titler = [];
    for (const agent of ['claude', 'codex', 'gemini', undefined, ['codex'], ['claude']]) {
      out.titler.push(await title('보통', REQ, { agent, exe: EXE, model: null }, { out: '채점 기준 수정\n', code: 0 }));
      out.titler.push(await title('모델 지정', REQ, { agent, exe: EXE, model: 'gpt-x-mini' }, { out: 'tokens used\n1,234\n"채점 기준 고치기."\n', code: 0 }));
    }
    out.titler.push(await title('클로드: 실행 파일 없음(null)', REQ, { agent: 'claude', exe: null }, {}));
    out.titler.push(await title('코덱스: 실행 파일 인자는 쓰지 않음', REQ, { agent: 'codex', exe: null }, { out: '진행 줄\n제목 줄\n', code: 0 }));
    out.titler.push(await title('문장으로 답함 → 버림', REQ, { agent: 'claude', exe: EXE }, { out: '채점 기준을 수정합니다\n', code: 0 }));
    out.titler.push(await title('종료 코드 1', REQ, { agent: 'codex' }, { out: '제목\n', err: '오류 글', code: 1 }));
    out.titler.push(await title('프로세스 오류', REQ, { agent: 'claude', exe: EXE }, { error: 'ENOENT' }));
    out.titler.push(await title('spawn 이 던짐', REQ, { agent: 'codex' }, { throwOnSpawn: true }));
    out.titler.push(await title('빈 요청', '   ', { agent: 'codex' }, {}));
    for (const agent of [null, '']) out.titler.push(await title('에이전트 값이 빔 → 기본 에이전트', REQ, { agent, exe: EXE, model: null }, { out: '채점 기준 수정\n', code: 0 }));
    out.titlerHelpers = deep({ lastAnswer: ['a\nb\n', 'x\ntokens used\n12,345\n', '', null, '한 줄'].map((s) => Tt.lastAnswer(s)), constants: { TITLE_MODEL: Tt.TITLE_MODEL, CODEX_TITLE_MODEL: Tt.CODEX_TITLE_MODEL }, exports: Object.keys(Tt).sort() });
  }

  // 모델·에이전트 바꾸기 요청의 맨 앞 확인(checkSwitch): 카드 × 요청의 에이전트 값 — 거절은 아무 일도 일어나기 전이어야 한다(events 가 비어 있음)
  out.switchGuard = ['s1', 's2', 's10', 's4', 's5', 'none'].flatMap((id) => [undefined, null, '', 'claude', 'codex', 'gemini', 'CLAUDE', 0, false, true, [], ['codex'], {}, 'constructor'].map((agent) => {
    events = []; let r; try { r = sm2.checkSwitch(id, agent); } catch (e) { r = { throws: e?.constructor?.name || 'Error', code: e?.code || null, message: tok(e?.message || '') }; }
    return { id, agent: JSON.stringify(agent) ?? '<undefined>', result: r, events: [...events] };
  }));
  out.unsupportedCard = ['s4', 's6', 's7'].map((id) => {
    events = []; spawns = []; const before = JSON.stringify(sm2.get(id));
    const tryOp = (fn) => { try { fn(); return 'ok'; } catch (e) { return { throws: e?.constructor?.name || 'Error', message: tok(e?.message || '') }; } };
    return { id, replaceAgent: tryOp(() => sm2.replaceAgent(id, { agent: 'claude', model: 'opus' })), switchTo: tryOp(() => sm2.switchTo(id, {})), resume: tryOp(() => sm2.resume(id)), events: [...events], spawns: spawns.length, cardUnchanged: JSON.stringify(sm2.get(id)) === before };
  });
  // 전부 종료(창 닫기) 뒤: 열 수 없는 카드는 세션 id 가 없어도 남는다. 다시 읽어도 그대로.
  {
    const blocked = cp.spawn; cp.spawn = () => { throw new Error('프로세스 표를 읽지 않음'); }; syncBuiltinESMExports(); // 이 검사에서는 표 없이(확인 못 함) 끝내기
    events = []; let rep2; try { rep2 = await sm2.endAll({ settleMs: 0 }); } catch (e) { rep2 = { throws: e?.message }; }
    cp.spawn = blocked; syncBuiltinESMExports();
    const view = (r) => deep({ id: r.id, agent: r.agent, status: r.status, lost: r.lost ?? null, unsupported: r.unsupported ?? null, exitReason: r.exitReason ?? null, exitReasonSaved: r.exitReasonSaved ?? null, sessionId: r.sessionId ?? null, closedBy: r.closedBy ?? null, previous: r.previous ?? null });
    const sm2b = new TSM(state2, { onLog: () => {}, codexHome: homeCodex, alignCodex: () => ({ action: 'none' }) });
    alivePids.delete(ALIVE);
    const sm2c = new TSM(state2, { onLog: () => {}, codexHome: homeCodex, alignCodex: () => ({ action: 'none' }) });
    // 사용자가 직접 지우기(forget) · 닫기(close)를 누르면 열 수 없는 카드도 지워진다(프로그램이 스스로 지우지 않는다는 약속과 별개). 저장 파일은 되돌려 둔다.
    const endEvents = [...events]; const pidGoneView = sm2c.list().map(view);
    const keepFile = fs.readFileSync(path.join(state2, 'sessions.json'));
    events = []; const del = (fn) => { try { fn(); return 'ok'; } catch (e) { return { throws: tok(e?.message || '') }; } };
    const userDelete = { forget: del(() => sm2c.forget('s6')), close: del(() => sm2c.close('s4')), left: sm2c.list().map((r) => r.id), events: [...events] };
    fs.writeFileSync(path.join(state2, 'sessions.json'), keepFile);
    out.endAll = { userDelete, report: rep2?.throws ? rep2 : deep({ verified: rep2.verified, sessions: rep2.sessions.map((x) => ({ id: x.id, result: x.result, note: x.note ?? null })), survivors: rep2.survivors.map((x) => x.session) }), events: endEvents, after: sm2.list().map(view), reloaded: sm2b.list().map(view), reloadedAutoResume: sm2b.lost().map((r) => r.id), reloadedPidGone: pidGoneView };
  }

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
  // 고르면 안 되는 것들(이름순으로 맞는 기록보다 앞에 온다): 오래된 파일 · 첫 줄이 깨진 파일 · 빈 파일 · 이름이 rollout- 이 아닌 파일 · 어제 폴더의 맞는 기록(오늘 폴더가 먼저)
  const match = (id) => line({ type: 'session_meta', payload: { id, originator: 'codex-tui', cwd: work } });
  const old = path.join(dayDir, 'rollout-0-old.jsonl'); fs.writeFileSync(old, match('cccccccc-0000-4000-8000-00000000000a')); fs.utimesSync(old, new Date(Date.now() - 3600000), new Date(Date.now() - 3600000));
  fs.writeFileSync(path.join(dayDir, 'rollout-1-bad.jsonl'), '{ 깨진 첫 줄\n');
  fs.writeFileSync(path.join(dayDir, 'rollout-2-empty.jsonl'), '');
  fs.writeFileSync(path.join(dayDir, 'notes-3.jsonl'), match('cccccccc-0000-4000-8000-00000000000b'));
  fs.writeFileSync(path.join(dayDir, 'rollout-4.txt'), match('cccccccc-0000-4000-8000-00000000000c'));
  const yest = new Date(Date.now() - 86400000);
  const yDir = path.join(A.CODEX_HOME, 'sessions', String(yest.getFullYear()), String(yest.getMonth() + 1).padStart(2, '0'), String(yest.getDate()).padStart(2, '0'));
  fs.mkdirSync(yDir, { recursive: true }); fs.writeFileSync(path.join(yDir, 'rollout-a-yesterday.jsonl'), match('cccccccc-0000-4000-8000-00000000000d'));
  // 클로드: 기다리는 기록이 없는 카드가 여럿이면 새 기록 하나를 누가 따라가는지
  const waiting = [...sm.sessions.values()].filter((r) => r.agent === 'claude' && r.recordPath && sm.live.has(r.id));
  if (waiting.length) { const dir = path.dirname(waiting[0].recordPath); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'dddddddd-0000-4000-8000-000000000001.jsonl'), line({ type: 'user', cwd: work, sessionId: 'dddddddd-0000-4000-8000-000000000001' })); }
  await new Promise((r) => setTimeout(r, 3600));
  out.pairing = {
    codexSessionsDir: tok(dayDir).replace(/\/\d{4}\/\d\d\/\d\d$/, '/<yyyy>/<mm>/<dd>'),
    cards: [...sm.sessions.values()].map((r) => { const b = before.find((x) => x.id === r.id); return deep({ id: r.id, agent: r.agent, sessionId: r.sessionId, recordPath: r.recordPath ? r.recordPath.replace(dayDir, '<CODEX_DAY>') : r.recordPath, resumeCmd: r.resumeCmd, changed: b.sessionId !== r.sessionId || b.recordPath !== r.recordPath, previous: (r.previous || []).map((p) => ({ agent: p.agent, sessionId: p.sessionId, reason: p.reason || null })) }); }),
  };

  out.records = await recordBaseline(tmp, deep);

  // 모델·에이전트 바꾸기 요청(server.mjs 의 switch): 본문을 읽은 바로 다음에 checkSwitch 를 부르고, 그 뒤에야 기록 읽기·바꾸기를 한다(소스 순서 확인)
  {
    const src = fs.readFileSync(path.join(ROOT, 'daemon', 'server.mjs'), 'utf8');
    const from = src.indexOf("action === 'switch'"); const to = src.indexOf("action === 'resume'", from);
    const blk = from >= 0 && to > from ? src.slice(from, to) : '';
    const at = (t) => blk.indexOf(t);
    const guard = at('sm.checkSwitch(id, b.agent)');
    out.switchRoute = { found: !!blk, guardCalled: guard >= 0, guardBeforeGet: guard >= 0 && guard < at('sm.get(id)'), guardBeforeTail: guard >= 0 && guard < at('tailFor('), guardBeforeReplace: guard >= 0 && guard < at('sm.replaceAgent('), guardBeforeSwitch: guard >= 0 && guard < at('sm.switchTo('), branchByGuard: /if \(toOtherAgent\)/.test(blk), noTruthyBranch: !/if \(b\.agent &&/.test(blk) };
  }
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
    u(note('<task-id>bg7</task-id><status>failed</status><summary>Background command "실패한 명령" failed with exit code 1</summary>') + note('<task-id>ag9</task-id><status>completed</status><summary>Agent "보조" completed</summary>') + note('<task-id>mon9</task-id><status>killed</status><summary>Monitor "멈춘 감시" was stopped</summary>') + note('<task-id>long</task-id><status>completed</status><summary>' + '긴 요약 '.repeat(60) + '</summary>')),
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
    // 가장자리: 한글 한 글자의 바이트 한가운데서 끊긴 조각 · 줄끝이 CRLF 인 기록 · 보관 한도(5,000개)를 넘는 기록
    edges: Object.fromEntries([['claude', [u('가나다라마바사 첫 요청'), a([{ type: 'text', text: '한글로 쓴 답' }]), u('둘째 요청')]], ['codex', [msg('user', '가나다라마바사 첫 요청'), msg('assistant', '한글로 쓴 답'), ev('task_started')]]].map(([agent, lines]) => {
      const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
      const bytes = Buffer.from(text, 'utf8');
      const at = bytes.indexOf(Buffer.from('나', 'utf8')) + 1; // '나'(3바이트)의 첫 바이트 뒤
      const f1 = path.join(dir, `${agent}-bytesplit.jsonl`); const t1 = new TranscriptTail(f1, agent);
      fs.writeFileSync(f1, bytes.subarray(0, at)); const p1 = deep(t1.poll());
      fs.writeFileSync(f1, bytes); const p2 = deep(t1.poll());
      const f2 = path.join(dir, `${agent}-crlf.jsonl`); fs.writeFileSync(f2, text.replace(/\n/g, '\r\n')); const t2 = new TranscriptTail(f2, agent);
      const f3 = path.join(dir, `${agent}-big.jsonl`);
      fs.writeFileSync(f3, Array.from({ length: 5005 }, (_, i) => JSON.stringify(agent === 'claude' ? { type: 'user', timestamp: '2026-01-01T00:00:00.000Z', message: { role: 'user', content: `n${i}` } } : { type: 'response_item', timestamp: '2026-01-01T00:00:00.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `n${i}` }] } })).join('\n') + '\n');
      const t3 = new TranscriptTail(f3, agent); const got = t3.poll();
      return [agent, { byteSplit: [p1, p2], crlf: deep(t2.poll()), big: deep({ returned: got.length, kept: t3.items.length, firstKept: t3.items[0]?.text, lastKept: t3.items.at(-1)?.text, firstI: t3.items[0]?.i, seq: t3.seq, firstUser: t3.firstUser }) }];
    })),
    contextWindows: [null, '', 'claude-haiku-4-5-20251001', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-3-haiku', 'gpt-6.1-sol'].flatMap((model) => ['claude', 'codex', 'gemini', undefined].flatMap((agent) => [null, 123456].map((window) => deep({ model, agent, window, result: Object.assign(Object.create(TranscriptTail.prototype), { agent, model, window }).contextWindow() })))),
    // 모양이 이상한 줄(값이 없거나 종류가 다른 칸): 무엇을 돌려주고 어디서 예외가 나는지, 예외 뒤 읽기 자리·누적 상태가 어떻게 남는지
    presetState: [undefined, null, '', 'claude', 'codex', 'gemini', 'CLAUDE', ['claude'], 0].map((agent) => {
      const tail = new TranscriptTail(path.join(dir, 'no-such-file.jsonl'), agent);
      tail.items = [{ kind: 'user', text: 'x' }, { kind: 'tool', name: 'Bash' }]; tail.turnOpen = true; tail.model = 'claude-haiku-3';
      const tryIt2 = (fn) => { try { return fn(); } catch (e) { return `throws ${e?.message}`; } };
      return { agent: JSON.stringify(agent) ?? '<undefined>', turnState: tryIt2(() => tail.turnState()), contextWindow: tryIt2(() => tail.contextWindow()) };
    }),
    weird: Object.fromEntries(['claude', 'codex', 'gemini'].map((agent) => [agent, [
      null, 5, 'text', [], {}, { type: 'user' }, { type: 'user', message: null }, { type: 'user', message: { content: 5 } }, { type: 'user', message: { content: [null] } }, { type: 'user', message: { content: [{ type: 'tool_result', content: { x: 1 } }] } },
      { type: 'assistant', message: { content: 'plain string' } }, { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', input: { questions: 'not a list' } }] } }, { type: 'assistant', message: { content: [{ type: 'tool_use' }], usage: 'x' } },
      { type: 'response_item' }, { type: 'response_item', payload: null }, { type: 'response_item', payload: { type: 'message', role: 'user', content: null, internal_chat_message_metadata_passthrough: { content_item_kinds: 'not a list' } } },
      { type: 'response_item', payload: { type: 'function_call_output', output: '[not json' } }, { type: 'event_msg', payload: { type: 'token_count', info: 'x' } }, { type: 'event_msg', payload: { type: 'exec_approval_request', command: 'not a list' } }, { isSidechain: true, type: 'user', parentUuid: null },
    ].map((rec, i) => {
      const file = path.join(dir, `weird-${agent}-${i}.jsonl`); fs.writeFileSync(file, JSON.stringify(rec) + '\n' + JSON.stringify(agent === 'codex' ? { type: 'event_msg', timestamp: '2026-01-01T00:00:00.000Z', payload: { type: 'task_started' } } : { type: 'user', timestamp: '2026-01-01T00:00:00.000Z', message: { content: '뒤 줄' } }) + '\n');
      const tail = new TranscriptTail(file, agent); let first, again;
      try { first = deep(tail.poll()); } catch (e) { first = { throws: e?.constructor?.name || 'Error', message: e?.message || '' }; }
      try { again = deep(tail.poll()); } catch (e) { again = { throws: e?.constructor?.name || 'Error', message: e?.message || '' }; }
      return deep({ rec: JSON.stringify(rec), first, again, offset: tail.offset, partial: tail.partial, seq: tail.seq, items: tail.items.length, unknown: tail.unknown, turnState: (() => { try { return tail.turnState(); } catch (e) { return `throws ${e?.message}`; } })() });
    })])),
    // 문맥 창을 볼 때 어느 칸을 읽는가(읽기 기록)
    contextReads: ['claude', 'codex', 'gemini', undefined].flatMap((agent) => [null, 0, 99].map((window) => { const log = []; const t = new Proxy(Object.assign(Object.create(TranscriptTail.prototype), { agent, model: 'claude-opus-5-5', window }), { get(o, k, r) { if (typeof k === 'string' && k !== 'contextWindow') log.push(k); return Reflect.get(o, k, r); } }); const result = t.contextWindow(); return deep({ agent, window, result, reads: log.join(' ') }); })),
    lineCounts: { claude: claude.length, codex: codex.length },
  };
  function lineStates(name, lines, agent) {
    const file = path.join(dir, `${name}.jsonl`);
    fs.writeFileSync(file, '');
    const tail = new TranscriptTail(file, agent);
    return lines.map((l) => {
      fs.appendFileSync(file, JSON.stringify(l) + '\n');
      const items = tail.poll();
      return deep({ kinds: items.map((it) => it.kind).join(','), turnState: tail.turnState(), ctx: tail.contextWindow(), model: tail.model, usage: tail.lastUsage, window: tail.window, turnOpen: tail.turnOpen, turnDoneAt: tail.turnDoneAt, tools: tail.tools, aiTitle: tail.aiTitle, firstUser: tail.firstUser, unknown: tail.unknown, firstT: tail.firstT, lastT: tail.lastT, maps: crypto.createHash('sha1').update(JSON.stringify([[...tail.sidechain], [...tail.calls], [...tail.finished], [...tail.finishedByTask], [...tail.bg], [...tail.toolIn], tail.backgroundPending(0, NOW)])).digest('hex').slice(0, 12), sizes: [tail.sidechain.size, tail.calls.size, tail.finished.size, tail.finishedByTask.size, tail.bg.size, tail.toolIn.size].join('/') });
    });
  }
}
