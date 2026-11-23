// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 안티그래비티 준비 상태 · 한도 · 모델 목록 — agy 에게 묻는다. 연결 방식이 gate(2026-11-23~)면 agy 를 중계기로 띄워 묻고(그 무료 계정의 한도 · 목록),
// 중계기를 못 쓰면 agy 를 띄우지 않고 state = gate + 이유를 낸다(이 PC 로그인으로 묻지 않음 — antigravity.gate.mjs).
//   agy --print /usage --output-format json  (약 5초 · 토큰 0, 1.5.14 실측) → command.data.groups[].buckets[] { id, name, window, remaining_fraction, reset_time }
// 로그인 판정은 세 갈래(코덱스 설계 검토): ok = 답을 받음 / auth = 로그인하라는 글 / unknown = 시간 초과 · 실행 실패 · 모르는 모양(로그아웃으로 보지 않는다).
// + missing = 실행 파일 없음. 한 번에 하나만 돈다 · 5분 캐시 · 세션을 띄울 때 기다리지 않는다.
// 🔴 이 결과는 클로드 · 코덱스의 상태 객체(wake.mjs agentStatus)에 섞지 않는다 — 화면에는 { type: 'agy' } 따로, GET /api/antigravity/status 따로(코덱스 코드 검토 1번).
// 결과를 _agent\claude\state\antigravity-status.json 에 적는다 — 대시보드의 보여 주기 전용 칸이 읽는다(이메일 · 열쇠 등 민감 정보는 적지 않는다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { agyExe, connection } from './antigravity.mjs';
import * as gate from './antigravity.gate.mjs';
import { soulRoot } from '../paths.mjs';
import { cliHome } from './antigravity.setup.mjs';
import { groupModels, fitDefault } from './antigravity.models.mjs';

const FACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = process.env.IRIS_FACE_STATE || path.join(FACE_ROOT, 'state');
// 대시보드(teamclaude-dash, _agent\claude\tools)가 읽는 자리 = _agent\claude\state(다른 도구의 상태 파일과 같은 곳). 시험은 IRIS_AGY_STATUS_FILE 로 바꾼다.
export const STATUS_FILE = process.env.IRIS_AGY_STATUS_FILE || path.join(soulRoot(), '_agent', 'claude', 'state', 'antigravity-status.json');
const MAX_AGE_MS = 5 * 60_000;
const TIMEOUT_MS = 25_000;
const now = () => new Date().toISOString();

// ───────── 자식 실행(공용) — 출력은 'close'(표준 출력 · 오류가 다 닫힌 뒤)에서 확정한다 ─────────
function run(exe, args, { cwd = os.tmpdir(), timeoutMs = TIMEOUT_MS, env = undefined } = {}) {
  return new Promise((resolve) => {
    let out = '', err = '', done = false, timer = null, p;
    const fin = (r) => { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(r); };
    try { p = spawn(exe, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return fin({ code: null, out, err, error: `spawn failed: ${e.message}` }); }
    timer = setTimeout(() => { try { p.kill(); } catch {} fin({ code: null, out, err, error: 'timeout' }); }, timeoutMs);
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => fin({ code: null, out, err, error: `error: ${e.message}` }));
    p.on('close', (code) => fin({ code, out, err, error: null }));
  });
}

// ───────── 로그인 · 한도 ─────────
let last = null;      // { state, groups, at, detail }
let running = null;

/** /usage JSON 글 → 판정 결과(순수 함수 — 시험이 직접 부른다) */
export function parseUsage(stdout, { code = 0, stderr = '' } = {}) {
  const at = now();
  const text = `${stdout || ''}\n${stderr || ''}`;
  if (/sign in|not signed in|log ?in to|please authenticate|unauthenticated/i.test(text) && !/"status"\s*:\s*"SUCCESS"/.test(stdout || '')) return { state: 'auth', groups: [], at, detail: 'sign-in required' };
  let j; try { j = JSON.parse(String(stdout || '').trim()); } catch { return { state: 'unknown', groups: [], at, detail: `unparsed (exit ${code})` }; }
  const groups = Array.isArray(j?.command?.data?.groups) ? j.command.data.groups : null;
  if (j?.status !== 'SUCCESS' || !groups) return { state: 'unknown', groups: [], at, detail: `status ${j?.status ?? '?'}` };
  const out = groups.map((g) => ({
    name: String(g?.name ?? ''),
    buckets: (Array.isArray(g?.buckets) ? g.buckets : []).map((b) => ({
      id: String(b?.id ?? ''), name: String(b?.name ?? ''), window: String(b?.window ?? ''),
      remaining: typeof b?.remaining_fraction === 'number' ? Math.max(0, Math.min(1, b.remaining_fraction)) : null,
      reset: typeof b?.reset_time === 'string' ? b.reset_time : null,
    })),
  }));
  return { state: 'ok', groups: out, at, detail: '' };
}

/** 헤더 배터리 하나에 보일 값: Gemini 4 Argon 주간(기본 모델) → 없으면 첫 주간. 남은 비율(1 = 가득) */
export function headline(r) {
  if (!r || r.state !== 'ok') return null;
  const all = r.groups.flatMap((g) => g.buckets.map((b) => ({ ...b, group: g.name })));
  const pick = all.find((b) => /argon/i.test(b.group) && b.window === 'weekly') || all.find((b) => b.window === 'weekly') || all[0];
  return pick ? { group: pick.group, window: pick.window, remaining: pick.remaining, reset: pick.reset } : null;
}

function writeStatus(r) {
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    const tmp = `${STATUS_FILE}.${process.pid}.tmp`;
    let tokens = null; try { tokens = tokenTotals(); } catch {}
    fs.writeFileSync(tmp, JSON.stringify({ schema: 1, agent: 'antigravity', connection, writtenAt: now(), ...r, tokens }, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, STATUS_FILE);
  } catch {}
}

/** 상태를 새로 읽는다(5분 안이면 지난 값, 도는 중이면 그것을 기다림). 실행 파일이 없으면 state = missing(파일에도 적어 대시보드가 옛 '로그인됨'을 붙들지 않게). */
export function refresh({ force = false } = {}) {
  const exe = agyExe();
  if (!exe) { const was = last?.state; last = { state: 'missing', groups: [], at: now(), detail: 'agy.exe not found' }; if (was !== 'missing') writeStatus(last); return Promise.resolve(last); }
  // 중계기를 못 쓰는 판정(state = gate)은 50초만 믿는다 — 사용자가 중계기를 다시 켜면 1분 안에 단추가 살아나게(데몬이 1분마다 부른다).
  const maxAge = last?.state === 'gate' ? 50_000 : MAX_AGE_MS;
  if (!force && last && last.state !== 'missing' && Date.now() - Date.parse(last.at) < maxAge) return Promise.resolve(last);
  if (running) return running;
  const cwd = path.join(os.tmpdir(), 'iris-agy-usage'); try { fs.mkdirSync(cwd, { recursive: true }); } catch {}
  running = (async () => {
    await null; // running 이 먼저 정해지도록(아래에서 running = null 로 비우는 것이 그 뒤가 되게)
    // 길(2026-11-23): gate 면 중계기 판정이 통과할 때만 agy 를 중계기로 띄워 묻는다(그 무료 계정의 한도가 온다).
    // 통과 못 하면 agy 를 이 PC 로그인으로 띄우지 않는다 — state = gate + 이유(화면이 단추를 끄고 이유를 보인다).
    const env = { ...process.env };
    if (connection === 'gate') {
      const j = await gate.refresh();
      if (!j.ok) { const r = { state: 'gate', groups: [], at: now(), detail: j.why }; last = r; running = null; writeStatus(r); return r; }
    }
    try { gate.applyRoute(env, connection); }
    catch (e) { const r = { state: 'gate', groups: [], at: now(), detail: String(e?.message || e) }; last = r; running = null; writeStatus(r); return r; }
    const x = await run(exe, ['--print', '/usage', '--output-format', 'json'], { cwd, env });
    const r = x.error ? { state: 'unknown', groups: [], at: now(), detail: x.error } : parseUsage(x.out, { code: x.code, stderr: x.err });
    last = r; running = null; writeStatus(r); return r;
  })();
  return running;
}
/** 지금 아는 값(기다리지 않음) */
export const current = () => last;
/** 화면에 보낼 짧은 값 */
export const brief = () => (last ? { state: last.state, at: last.at, headline: headline(last), connection, ...(last.state === 'gate' ? { detail: last.detail } : {}) } : { state: 'unknown', at: null, headline: null, connection });

// ───────── 토큰 수(보여 주기 전용) — ~/.gemini 의 기록 전체(IRIS 창 + 직접 띄운 agy), 한도가 계정 전체 기준이라서 ─────────
// 파일마다 (크기 · 수정 시각)이 같으면 다시 읽지 않는다 · 없어진 파일은 캐시에서 뺀다. 5분에 한 번(상태를 적을 때)만 돈다.
const tokCache = new Map();
export function tokenTotals(home = cliHome(), at = new Date()) {
  const day0 = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime(), week0 = at.getTime() - 7 * 86400000;
  const tot = { today: { input: 0, output: 0, cache: 0 }, week: { input: 0, output: 0, cache: 0 }, all: { input: 0, output: 0, cache: 0 }, files: 0 };
  let dirs = []; try { dirs = fs.readdirSync(path.join(home, 'brain')); } catch { tokCache.clear(); return tot; }
  const seen = new Set();
  for (const d of dirs) {
    const f = path.join(home, 'brain', d, '.system_generated', 'logs', 'transcript.jsonl');
    let st; try { st = fs.statSync(f); } catch { continue; }
    seen.add(f);
    const key = `${st.size}|${Math.round(st.mtimeMs)}`;
    let rows = tokCache.get(f);
    if (!rows || rows.key !== key) {
      const list = [];
      try {
        for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
          if (!line.includes('_tokens')) continue;
          let r; try { r = JSON.parse(line); } catch { continue; }
          const t = Date.parse(r.created_at || ''); if (!Number.isFinite(t)) continue;
          list.push([t, Number(r.input_tokens) || 0, Number(r.output_tokens) || 0, Number(r.cache_read_tokens) || 0]);
        }
      } catch {}
      rows = { key, list }; tokCache.set(f, rows);
    }
    tot.files++;
    for (const [t, i, o, c] of rows.list) {
      for (const [k, ok] of [['all', true], ['week', t >= week0], ['today', t >= day0]]) if (ok) { tot[k].input += i; tot[k].output += o; tot[k].cache += c; }
    }
  }
  for (const k of tokCache.keys()) if (!seen.has(k)) tokCache.delete(k);
  return tot;
}

// ───────── 모델 목록(agy models) — 클로드 · 코덱스의 ModelCatalog(동기)와 따로, 기다리지 않고 뒤에서 ─────────
// 출력 한 줄 = "<정확한 이름>\t<보이는 이름>". 실행 파일이 같으면(크기 · 수정 시각) 6시간에 한 번만.
// 저장한 목록은 **같은 실행 파일에서 읽은 것일 때만** 쓴다. 읽지 못하면 목록을 바꾸지 않는다(손 표 = 1.5.14 실측 그대로 — agy 가 모르는 이름이면 세션 화면에 오류가 보인다).
// 저장 파일 · parseModels 는 agy 가 준 줄 그대로(정확한 이름)이고, 화면 목록(모델 + 사고 깊이)으로 묶는 것은 applyModels 가 한다.
const MODELS_FILE = path.join(STATE, 'agy-models.json');
export function parseModels(stdout) {
  const out = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const m = line.match(/^([a-z0-9][a-z0-9.-]*[a-z0-9])\t(.+)$/);
    if (m) out.push({ id: m[1], label: m[2].trim() });
  }
  return out;
}
/**
 * agy models 의 줄들(정확한 이름 그대로)을 화면 목록(모델 + 사고 깊이, 다른 회사 모델 제외 — antigravity.models.mjs)으로 묶어 입힌다.
 * 묶고 나서 남는 줄이 없으면(구글 모델이 하나도 없는 목록) 목록을 바꾸지 않는다. 기본값이 목록에 없으면 목록 안에서 다시 고른다.
 */
export function applyModels(table, list) {
  const rows = groupModels(list);
  if (!rows.length) return false;
  const def = fitDefault(table.default, rows);
  if (JSON.stringify(table.models) === JSON.stringify(rows) && def.model === table.default.model && def.effort === table.default.effort) return false;
  table.models.splice(0, table.models.length, ...rows);
  table.default.model = def.model; table.default.effort = def.effort;
  return true;
}
let modelsAt = 0, modelsKey = '', modelsRun = null, cacheTried = false;
/** @returns {Promise<boolean>} 목록이 바뀌었으면 true(저장한 목록을 처음 입힌 것도 포함) */
export function refreshModels(table, { log = () => {} } = {}) {
  const exe = agyExe(); if (!exe) return Promise.resolve(false);
  // 저장 열쇠에 길을 넣는다(2026-11-23) — 중계기 길의 목록(무료 계정 = Flash 뿐)과 직결 목록(이 PC 계정)은 다르다.
  let key = ''; try { const st = fs.statSync(exe); key = `${st.size}|${Math.round(st.mtimeMs)}|${connection}`; } catch {}
  let fromCache = false;
  if (!cacheTried) {
    cacheTried = true;
    try { const c = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8')); if (c.key === key && Array.isArray(c.models) && applyModels(table, c.models)) { fromCache = true; log(`models: antigravity 저장한 목록 ${c.models.length}개(${c.at})`); } } catch {}
  }
  if (key === modelsKey && Date.now() - modelsAt < 6 * 3600_000) return Promise.resolve(fromCache);
  if (modelsRun) return modelsRun.then((ch) => ch || fromCache);
  // gate 면 중계기를 쓸 수 있을 때만 묻는다(못 쓰면 목록을 바꾸지 않는다 — 이 PC 로그인으로 묻지 않는다)
  const env = { ...process.env };
  try { gate.applyRoute(env, connection); } catch { return Promise.resolve(fromCache); }
  modelsRun = run(exe, ['models'], { env }).then((x) => {
    modelsRun = null;
    const list = parseModels(x.out);
    if (x.error || x.code !== 0 || !list.length) { log(`models: antigravity 목록 못 읽음(${x.error || `exit ${x.code}`}) — 목록 그대로`); return fromCache; }
    modelsKey = key; modelsAt = Date.now();
    try { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(MODELS_FILE, JSON.stringify({ at: now(), key, models: list }, null, 2) + '\n', 'utf8'); } catch {}
    const changed = applyModels(table, list);
    if (changed) log(`models: antigravity ${list.length}개 읽음 → 화면 ${table.models.length}줄 ${table.models.map((m) => `${m.id}[${m.efforts.join('/')}]`).join(', ')}`);
    return changed || fromCache;
  });
  return modelsRun;
}
