// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 의견 보내기(v2.105, 2026-11-13) — 설정 → 의견 보내기. 설계 정본 = P05 홈페이지 docs/설계-의견함-2026-11-12.md 조각 ⑥.
// 사용자가 「보내기」를 누를 때만 바깥에 연결한다(모듈 없는 창의 무접촉 약속은 "누르기 전 연결 0" 으로 지킨다 —
// 이 파일은 불러올 때 아무 연결도 만들지 않는다. 시험 = scripts/check-feedback.mjs · check-nomodule.mjs).
// 받는 곳 = IRIS 공용 DB(P04 메신저 허브 Supabase)의 넣기 전용 함수 submit_feedback(P04 hub/server/migrations/0005_feedback.sql).
// 아래 anon 키는 공개해도 안전하다(표는 직접 읽기·쓰기 전부 막혀 있고, 함수 안에서 길이·횟수·크기 상한을 건다).
// 함께 보내는 정보 = 창·설치 패키지·윈도 판 한 줄뿐. 대화·폴더 이름·계정·경로는 보내지 않는다.
import os from 'node:os';

export const HUB = Object.freeze({ url: 'https://bgintjgktcajltvmtpia.supabase.co', anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnaW50amdrdGNhamx0dm10cGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMTc0NTQsImV4cCI6MjEwNDc5MzQ1NH0.X-b7j6cYkgG0rr_K5eOkT_Sxyzw3foYDnxbdMIi2AUo' });
export const KINDS = ['bug', 'improve', 'feature', 'other'];
export const PLACES = ['install', 'face', 'messenger', 'site', 'unknown'];
export const MAX_BODY = 4000;
export const FALLBACK_URL = 'https://iris-workspace.com/feedback';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** 윈도 판 이름: 빌드 22000 이상 = Windows 11. */
export function osLabel({ platform = process.platform, release = os.release() } = {}) {
  if (platform !== 'win32') return `${platform} ${release}`;
  const build = Number(String(release).split('.')[2] || 0);
  return `Windows ${build >= 22000 ? 11 : 10}${build ? ` (${build})` : ''}`;
}

/** 함께 보내는 정보 한 줄. installed = Updater.installed() 결과({ face, package }). 300자 안. */
export function appInfo(installed = {}, opts = {}) {
  return [installed.face ? `IRIS 창 ${installed.face}` : null, installed.package ? `설치 패키지 ${installed.package}` : null, osLabel(opts)]
    .filter(Boolean).join(' · ').slice(0, 300);
}

/** 화면에서 온 값 검사. { ok, error } | { ok, payload } — 서버 함수와 같은 규칙(서버가 최종 판정). */
export function validate(b = {}) {
  const kind = String(b.kind || ''), place = String(b.place || 'unknown') || 'unknown';
  const body = String(b.body || '').trim(), email = String(b.email || '').trim();
  if (!KINDS.includes(kind)) return { ok: false, error: 'bad' };
  if (!PLACES.includes(place)) return { ok: false, error: 'bad' };
  if (!body) return { ok: false, error: 'empty' };
  if (body.length > MAX_BODY) return { ok: false, error: 'too_long' };
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) return { ok: false, error: 'email' };
  return { ok: true, payload: { kind, place, body, email: email || null } };
}

/** 보내기. 실패해도 던지지 않고 { ok:false, error } — error ∈ bad·empty·too_long·email·rate·full·offline·server. */
export async function sendFeedback(b, { info = '', url = process.env.IRIS_FACE_FEEDBACK_URL || HUB.url, key = HUB.anonKey, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const v = validate(b);
  if (!v.ok) return v;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`${url}/rest/v1/rpc/submit_feedback`, {
      method: 'POST', signal: ctl.signal,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'iris-face' },
      body: JSON.stringify({ p_kind: v.payload.kind, p_place: v.payload.place, p_body: v.payload.body, p_email: v.payload.email, p_source: 'app', p_app_info: info || null }),
    });
    const text = await r.text();
    if (r.ok) { let rc = null; try { rc = JSON.parse(text); } catch {} return /^F-\d{8}-[0-9a-f]{4,6}$/.test(String(rc)) ? { ok: true, receipt: rc } : { ok: false, error: 'server' }; }
    if (/rate_limited/.test(text)) return { ok: false, error: 'rate' };
    if (/"full"|\bfull\b/.test(text)) return { ok: false, error: 'full' };
    return { ok: false, error: r.status === 400 ? 'bad' : 'server' };
  } catch {
    return { ok: false, error: 'offline' };
  } finally { clearTimeout(t); }
}
