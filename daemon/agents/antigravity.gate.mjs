// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 안티그래비티의 중계기 길(연결 방식 gate) 판정 — D09 안티그래비티-입점설계 4절 '중계 방식 설계'(2026-11-23, 코덱스 설계 비판 6번 반영).
//   agy 는 환경 변수 CLOUD_CODE_URL 로 서버 주소를 바꾼다. gate = 세션 · 한도 조회 · 모델 목록 셋 다 CLOUD_CODE_URL=<중계기>.
//   🔴 중계기를 못 쓰면 agy 를 이 PC 로그인(direct)으로 조용히 띄우지 않는다 — 막고 이유를 보인다(사용자 결정 = 중계기의 무료 계정만 쓴다).
//   직결은 antigravity.mjs 의 connection 한 줄을 'direct' 로 바꿀 때만이다.
// 통과 조건(셋 다): 중계기가 구글을 안다(status.google.supported) · 구글 멈춤이 아니다(status.google.halt 없음) · 켜져 있고 오류가 아닌 구글 계정이 1개 이상.
//   옛 중계기(구글을 모름)는 모르는 경로를 앤트로픽으로 넘기므로(11/23 실측) 'supported' 가 없으면 반드시 막는다.
import { execFileSync } from 'node:child_process';

export const GATE_URL = (process.env.IRIS_AGY_GATE_URL || 'http://127.0.0.1:3456').replace(/\/+$/, '');
const FRESH_MS = 30_000;
const TIMEOUT_MS = 3_000;
let last = null; // { ok, why, at, accounts: [{ name, status }] }

/** /teamclaude/status JSON → 판정(순수 함수 — 시험이 직접 부른다) */
export function judge(status, at = Date.now()) {
  if (!status || typeof status !== 'object') return { ok: false, why: '중계기(IRIS Gate) 상태를 읽지 못했습니다', at, accounts: [] };
  if (status.google?.supported !== true) return { ok: false, why: '지금 켜져 있는 중계기(IRIS Gate)가 구글을 모르는 옛 판입니다 — 대시보드 「재시작」으로 새 판을 켜 주세요', at, accounts: [] };
  const accounts = (Array.isArray(status.accounts) ? status.accounts : []).filter((a) => a?.provider === 'google')
    .map((a) => ({ name: String(a.name || ''), status: String(a.status || ''), disabled: !!a.disabled }));
  if (status.google.halt) return { ok: false, why: `중계기가 구글 계정 전체를 멈춰 두었습니다(${status.google.halt.account || '?'} 에서 정지 신호, ${status.google.halt.at || '?'}) — 그 계정을 확인한 뒤 대시보드에서 풀어 주세요`, at, accounts, halt: true };
  const usable = accounts.filter((a) => !a.disabled && a.status !== 'error');
  if (!usable.length) return { ok: false, why: accounts.length ? '중계기에 쓸 수 있는 구글 계정이 없습니다(모두 꺼짐 또는 로그인 오류)' : '중계기에 등록된 구글 계정이 없습니다 — 대시보드 「+ 구글 계정 추가」로 넣어 주세요', at, accounts };
  return { ok: true, why: '', at, accounts };
}

/** 뒤에서 새로 읽는다(기다리지 않는 쪽 — 데몬 주기 갱신) */
export async function refresh() {
  try {
    const r = await fetch(`${GATE_URL}/teamclaude/status`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    last = judge(r.ok ? await r.json() : null);
    if (!r.ok) last.why = `중계기(IRIS Gate) 상태 응답 ${r.status}`;
  } catch (e) {
    last = { ok: false, why: `중계기(IRIS Gate, ${GATE_URL})에 닿지 않습니다(${e?.name === 'TimeoutError' ? '시간 초과' : e?.code || e?.message || e})`, at: Date.now(), accounts: [] };
  }
  return last;
}

/** 지금 판정 — 30초 안의 값이 있으면 그것, 없으면 그 자리에서 한 번 묻는다(동기, 최대 약 3초 — 세션을 띄우기 직전에만 부른다) */
export function checkSync({ maxAgeMs = FRESH_MS } = {}) {
  if (last && Date.now() - last.at < maxAgeMs) return last;
  const code = `fetch(${JSON.stringify(`${GATE_URL}/teamclaude/status`)},{signal:AbortSignal.timeout(${TIMEOUT_MS})}).then(r=>r.ok?r.text():Promise.reject(new Error('HTTP '+r.status))).then(t=>process.stdout.write(t),e=>{process.stdout.write('');process.exitCode=3})`;
  let out = '';
  try { out = execFileSync(process.execPath, ['-e', code], { timeout: TIMEOUT_MS + 2_000, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }); }
  catch { out = ''; }
  let j = null; try { j = out ? JSON.parse(out) : null; } catch { j = null; }
  last = j ? judge(j) : { ok: false, why: `중계기(IRIS Gate, ${GATE_URL})에 닿지 않습니다`, at: Date.now(), accounts: [] };
  return last;
}

export const current = () => last;

/**
 * agy 를 띄울 환경에 길을 입힌다. connection = 'gate' 면 판정이 통과할 때만 CLOUD_CODE_URL 을 넣고, 아니면 던진다(code AGY_GATE_DOWN).
 * connection = 'direct' 면 물려받은 CLOUD_CODE_URL 을 지운다(데몬 환경에 남은 값으로 엉뚱한 곳에 가지 않게).
 * @returns {{ route: 'gate'|'direct' }}
 */
export function applyRoute(env, connection, { sync = true } = {}) {
  if (env) for (const k of Object.keys(env)) if (/^cloud_code_url$/i.test(k)) delete env[k];
  if (connection !== 'gate') return { route: 'direct' };
  const j = sync ? checkSync() : last;
  if (!j?.ok) {
    const e = new Error(`안티그래비티 세션을 열지 않았습니다 — ${j?.why || '중계기 상태를 아직 모릅니다'}. (이 PC 의 구글 로그인으로 몰래 돌리지 않습니다.)`);
    e.code = 'AGY_GATE_DOWN';
    throw e;
  }
  if (env) env.CLOUD_CODE_URL = GATE_URL;
  return { route: 'gate' };
}

/** 시험용 */
export function _setLast(v) { last = v; }
