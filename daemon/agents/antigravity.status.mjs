// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 안티그래비티 준비 상태 · 한도 — 중계기를 거치지 않으므로(direct) 대시보드 계정 수 대신 agy 에게 직접 묻는다.
//   agy --print /usage --output-format json  (약 5초 · 토큰 0, 1.5.14 실측) → command.data.groups[].buckets[] { id, name, window, remaining_fraction, reset_time }
// 로그인 판정은 세 갈래(코덱스 설계 검토): ok = 답을 받음 / auth = 로그인하라는 글 / unknown = 시간 초과 · 실행 실패 · 모르는 모양(로그아웃으로 보지 않는다).
// 한 번에 하나만 돈다(동시 요청은 같은 결과를 기다림) · 5분 캐시 · 세션을 띄울 때 기다리지 않는다(지난 값만 쓴다).
// 결과를 <상태 폴더>/antigravity-status.json 에 적는다 — 대시보드 화면의 보여 주기 전용 칸이 읽는다(이메일 · 열쇠 등 민감 정보는 적지 않는다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { agyExe } from './antigravity.mjs';

import { soulRoot } from '../paths.mjs';
import { cliHome } from './antigravity.setup.mjs';

const FACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = process.env.IRIS_FACE_STATE || path.join(FACE_ROOT, 'state');
// 대시보드(teamclaude-dash, _agent\claude\tools)가 읽는 자리 = _agent\claude\state(다른 도구의 상태 파일과 같은 곳). 시험은 IRIS_AGY_STATUS_FILE 로 바꾼다.
export const STATUS_FILE = process.env.IRIS_AGY_STATUS_FILE || path.join(soulRoot(), '_agent', 'claude', 'state', 'antigravity-status.json');

// ───────── 토큰 수(보여 주기 전용) — ~/.gemini 의 기록 전체(IRIS 창 + 직접 띄운 agy), 한도가 계정 전체 기준이라서 ─────────
// 파일마다 (크기 · 수정 시각)이 같으면 다시 읽지 않는다. 오늘(이 PC 시각) · 최근 7일 · 전체를 입력(캐시 포함) · 출력으로.
const tokCache = new Map();
export function tokenTotals(home = cliHome(), now = new Date()) {
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), week0 = now.getTime() - 7 * 86400000;
  const tot = { today: { input: 0, output: 0, cache: 0 }, week: { input: 0, output: 0, cache: 0 }, all: { input: 0, output: 0, cache: 0 }, files: 0 };
  let dirs = []; try { dirs = fs.readdirSync(path.join(home, 'brain')); } catch { return tot; }
  for (const d of dirs) {
    const f = path.join(home, 'brain', d, '.system_generated', 'logs', 'transcript.jsonl');
    let st; try { st = fs.statSync(f); } catch { continue; }
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
  return tot;
}
const MAX_AGE_MS = 5 * 60_000;
const TIMEOUT_MS = 25_000;

let last = null;      // { state, groups, at, detail }
let running = null;   // 도는 중인 Promise

/** /usage JSON 글 → 판정 결과(순수 함수 — 시험이 직접 부른다) */
export function parseUsage(stdout, { code = 0, stderr = '' } = {}) {
  const at = new Date().toISOString();
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

/** 헤더 배터리 하나에 보일 값: Gemini 4 Argon 주간(기본 모델) → 없으면 첫 묶음의 주간. 남은 비율(1 = 가득) */
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
    fs.writeFileSync(tmp, JSON.stringify({ schema: 1, agent: 'antigravity', connection: 'direct', writtenAt: new Date().toISOString(), ...r, tokens }, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, STATUS_FILE);
  } catch {}
}

function runOnce(exe) {
  return new Promise((resolve) => {
    const cwd = path.join(os.tmpdir(), 'iris-agy-usage'); try { fs.mkdirSync(cwd, { recursive: true }); } catch {}
    let out = '', err = '', done = false, p;
    const fin = (r) => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
    try { p = spawn(exe, ['--print', '/usage', '--output-format', 'json'], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return resolve({ state: 'unknown', groups: [], at: new Date().toISOString(), detail: `spawn failed: ${e.message}` }); }
    const timer = setTimeout(() => { try { p.kill(); } catch {} fin({ state: 'unknown', groups: [], at: new Date().toISOString(), detail: 'timeout' }); }, TIMEOUT_MS);
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => fin({ state: 'unknown', groups: [], at: new Date().toISOString(), detail: `error: ${e.message}` }));
    p.on('exit', (code) => fin(parseUsage(out, { code, stderr: err })));
  });
}

/** 상태를 새로 읽는다(5분 안이면 지난 값, 도는 중이면 그것을 기다림). 실행 파일이 없으면 state = missing. */
export function refresh({ force = false } = {}) {
  const exe = agyExe();
  if (!exe) { last = { state: 'missing', groups: [], at: new Date().toISOString(), detail: 'agy.exe not found' }; return Promise.resolve(last); }
  if (!force && last && last.state !== 'missing' && Date.now() - Date.parse(last.at) < MAX_AGE_MS) return Promise.resolve(last);
  if (running) return running;
  running = runOnce(exe).then((r) => { last = r; running = null; writeStatus(r); return r; });
  return running;
}
/** 지금 아는 값(기다리지 않음) */
export const current = () => last;

// ───────── 모델 목록(agy models) — 클로드 · 코덱스의 ModelCatalog(동기)와 따로, 기다리지 않고 뒤에서 ─────────
// 출력 한 줄 = "<정확한 이름>\t<보이는 이름>"(첫 줄 "Fetching available models..." 는 버림). 실행 파일이 같으면(크기 · 수정 시각) 6시간에 한 번만.
// 읽지 못하면 목록을 바꾸지 않는다(손 표 또는 마지막으로 읽은 목록 그대로 — 저장한 것을 쓴다).
const MODELS_FILE = path.join(STATE, 'agy-models.json');
export function parseModels(stdout) {
  const out = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const m = line.match(/^([a-z0-9][a-z0-9.-]*[a-z0-9])\t(.+)$/);
    if (m) out.push({ id: m[1], label: m[2].trim() });
  }
  return out;
}
function applyModels(table, list) {
  if (!list.length) return false;
  if (JSON.stringify(table.models) === JSON.stringify(list)) return false;
  table.models.splice(0, table.models.length, ...list);
  if (!list.some((m) => m.id === table.default.model)) table.default.model = (list.find((m) => /argon-high$/.test(m.id)) || list[0]).id;
  return true;
}
let modelsAt = 0, modelsKey = '', modelsRun = null;
/** @returns {Promise<boolean>} 목록이 바뀌었으면 true */
export function refreshModels(table, { log = () => {} } = {}) {
  const exe = agyExe(); if (!exe) return Promise.resolve(false);
  let key = ''; try { const st = fs.statSync(exe); key = `${st.size}|${Math.round(st.mtimeMs)}`; } catch {}
  if (!modelsKey) { try { const c = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8')); if (Array.isArray(c.models) && applyModels(table, c.models)) log(`models: antigravity 저장한 목록 ${c.models.length}개(${c.at})`); } catch {} }
  if (key === modelsKey && Date.now() - modelsAt < 6 * 3600_000) return Promise.resolve(false);
  if (modelsRun) return modelsRun;
  modelsRun = new Promise((resolve) => {
    let out = '', p, done = false;
    const fin = (v) => { if (done) return; done = true; clearTimeout(timer); modelsRun = null; resolve(v); };
    try { p = spawn(exe, ['models'], { cwd: os.tmpdir(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { log(`models: antigravity 읽기 실패 ${e.message}`); return fin(false); }
    const timer = setTimeout(() => { try { p.kill(); } catch {} log('models: antigravity 읽기 시간 초과 — 목록 그대로'); fin(false); }, TIMEOUT_MS);
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => fin(false));
    p.on('exit', (code) => {
      const list = parseModels(out);
      if (code !== 0 || !list.length) { log(`models: antigravity 목록 못 읽음(exit ${code}) — 목록 그대로`); return fin(false); }
      modelsKey = key; modelsAt = Date.now();
      try { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(MODELS_FILE, JSON.stringify({ at: new Date().toISOString(), key, models: list }, null, 2) + '\n', 'utf8'); } catch {}
      const changed = applyModels(table, list);
      if (changed) log(`models: antigravity ${list.length}개 ${list.map((m) => m.id).join(', ')}`);
      fin(changed);
    });
  });
  return modelsRun;
}

/**
 * 창의 에이전트 상태(wake.mjs agentStatus 결과)에 안티그래비티 몫을 덧붙인 새 객체. 원래 객체는 바꾸지 않는다.
 *   실행 파일 없음 → missing 에 넣음 / 로그인 안 됨(auth) → accounts.antigravity = 0 / 됨 → 1 / 모름 → 칸을 두지 않음(단추를 끄지 않는다)
 */
export function mergeStatus(status) {
  const s = { ...status, accounts: status?.accounts ? { ...status.accounts } : status?.accounts, missing: [...(status?.missing || [])] };
  const r = last;
  if (!agyExe()) { if (!s.missing.includes('antigravity')) s.missing.push('antigravity'); return s; }
  if (r && s.accounts && (r.state === 'ok' || r.state === 'auth')) s.accounts.antigravity = r.state === 'ok' ? 1 : 0;
  s.antigravity = r ? { state: r.state, at: r.at, headline: headline(r) } : { state: 'unknown', at: null, headline: null };
  return s;
}
