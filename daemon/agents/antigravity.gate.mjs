// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 안티그래비티의 중계기 길(연결 방식 gate) 판정 — D09 안티그래비티-입점설계 4절 '중계 방식 설계'(2026-11-23, 코덱스 설계 비판 6번 반영).
//   agy 는 환경 변수 CLOUD_CODE_URL 로 서버 주소를 바꾼다. gate = 세션 · 한도 조회 · 모델 목록 셋 다 CLOUD_CODE_URL=<중계기>.
//   🔴 중계기를 못 쓰면 agy 를 이 PC 로그인(direct)으로 조용히 띄우지 않는다 — 막고 이유를 보인다(사용자 결정 = 중계기의 무료 계정만 쓴다).
//   직결은 antigravity.mjs 의 connection 한 줄을 'direct' 로 바꿀 때만이다.
// 통과 조건(셋 다): 중계기가 구글을 안다(status.google.supported) · 구글 멈춤이 아니다(status.google.halt 없음) · 켜져 있고 오류가 아닌 구글 계정이 1개 이상.
//   옛 중계기(구글을 모름)는 모르는 경로를 앤트로픽으로 넘기므로(11/23 실측) 'supported' 가 없으면 반드시 막는다.
export const GATE_URL = (process.env.IRIS_AGY_GATE_URL || 'http://127.0.0.1:3456').replace(/\/+$/, '');
const FRESH_MS = 60_000;
const TIMEOUT_MS = 3_000;
let last = null; // { ok, why, at, accounts: [{ name, status }] }

/**
 * 중계기 상태의 구글 계정 한도 → 창이 쓰는 모양. 구글이 준 묶음(googleBuckets)이 있으면 그대로, 없으면 주간 한 줄(unified7d = 쓴 비율)로.
 * @returns {{ seenAt: number|null, buckets: { group, id, window, remaining, reset }[] } | null} 아직 읽은 값이 없으면 null
 */
export function quotaOf(q) {
  if (!q || typeof q !== 'object') return null;
  const frac = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null);
  const iso = (ms) => (typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);
  const seenAt = typeof q.googleBucketsSeenAt === 'number' ? q.googleBucketsSeenAt : typeof q.unified7dSeenAt === 'number' ? q.unified7dSeenAt : null;
  let buckets = (Array.isArray(q.googleBuckets) ? q.googleBuckets : []).filter((b) => b && typeof b === 'object' && frac(b.remaining) !== null)
    .map((b) => ({ group: String(b.group || ''), id: String(b.id || ''), window: String(b.window || ''), remaining: frac(b.remaining), reset: iso(b.resetAt) }));
  if (!buckets.length && frac(q.unified7d) !== null) buckets = [{ group: 'Gemini Models', id: 'gemini-weekly', window: 'weekly', remaining: 1 - frac(q.unified7d), reset: iso(q.unified7dReset) }];
  return buckets.length ? { seenAt, buckets } : null;
}

/** /teamclaude/status JSON → 판정(순수 함수 — 시험이 직접 부른다) */
export function judge(status, at = Date.now()) {
  if (!status || typeof status !== 'object') return { ok: false, why: '중계기(IRIS Gate) 상태를 읽지 못했습니다', at, accounts: [] };
  if (status.google?.supported !== true) return { ok: false, why: '지금 켜져 있는 중계기(IRIS Gate)가 구글을 모르는 옛 판입니다 — 대시보드 「재시작」으로 새 판을 켜 주세요', at, accounts: [] };
  // quota = 중계기가 5분마다 구글에서 직접 읽어 둔 그 계정의 한도(2026-11-23 밤 — 창이 한도를 알려고 agy 를 따로 띄우지 않게). 이메일 · 열쇠는 싣지 않는다.
  const accounts = (Array.isArray(status.accounts) ? status.accounts : []).filter((a) => a?.provider === 'google')
    .map((a) => ({ name: String(a.name || ''), status: String(a.status || ''), disabled: !!a.disabled, quota: quotaOf(a.quota) }));
  const current = typeof status.currentAccounts?.google === 'string' ? status.currentAccounts.google : null;
  if (status.google.halt) return { ok: false, why: `중계기가 구글 계정 전체를 멈춰 두었습니다(${status.google.halt.account || '?'} 에서 정지 신호, ${status.google.halt.at || '?'}) — 그 계정을 확인한 뒤 대시보드에서 풀어 주세요`, at, accounts, halt: true };
  const usable = accounts.filter((a) => !a.disabled && a.status !== 'error');
  if (!usable.length) return { ok: false, why: accounts.length ? '중계기에 쓸 수 있는 구글 계정이 없습니다(모두 꺼짐 또는 로그인 오류)' : '중계기에 등록된 구글 계정이 없습니다 — 대시보드 「+ 구글 계정 추가」로 넣어 주세요', at, accounts };
  return { ok: true, why: '', at, accounts, current };
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

// 세션을 띄울 때는 기다리지 않는다(코덱스 코드 검토 F-1: 동기 확인이 데몬 전체를 몇 초 멈췄다) — 데몬이 15초마다 refresh() 로
// 미리 읽어 둔 값만 쓴다. 그 값이 1분보다 오래됐으면(데몬이 막 켜졌거나 확인이 멈춤) 모른다고 보고 막는다.
export const current = () => last;
export const fresh = (j = last, maxAgeMs = FRESH_MS) => !!j && Date.now() - j.at < maxAgeMs;

/**
 * agy 를 띄울 환경에 길을 입힌다. connection = 'gate' 면 판정이 통과할 때만 CLOUD_CODE_URL 을 넣고, 아니면 던진다(code AGY_GATE_DOWN).
 * connection = 'direct' 면 물려받은 CLOUD_CODE_URL 을 지운다(데몬 환경에 남은 값으로 엉뚱한 곳에 가지 않게).
 * @returns {{ route: 'gate'|'direct' }}
 */
export function applyRoute(env, connection) {
  if (env) for (const k of Object.keys(env)) if (/^cloud_code_url$/i.test(k)) delete env[k];
  if (connection !== 'gate') return { route: 'direct' };
  const j = last;
  if (!j?.ok || !fresh(j)) {
    const why = !j ? '중계기(IRIS Gate) 상태를 아직 확인하지 못했습니다 — 몇 초 뒤 다시 해 주세요' : !j.ok ? j.why : '중계기(IRIS Gate) 상태 확인이 1분 넘게 멈춰 있습니다 — 잠시 뒤 다시 해 주세요';
    const e = new Error(`안티그래비티 세션을 열지 않았습니다 — ${why}. (이 PC 의 구글 로그인으로 몰래 돌리지 않습니다.)`);
    e.code = 'AGY_GATE_DOWN';
    throw e;
  }
  if (env) env.CLOUD_CODE_URL = GATE_URL;
  return { route: 'gate' };
}

/** 시험용 */
export function _setLast(v) { last = v; }
