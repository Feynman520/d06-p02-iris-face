// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 한도 인지 — TeamClaude 대시보드(127.0.0.1:<dashPort>, 기본 3457)의 /api/status 를 읽는다. 프록시·뷰어가 꺼져 있으면 null(판정에서 생략).
// TeamClaude 도구 자체가 없는 PC(공개 배포본)면 네트워크를 건드리지 않고 바로 null — 배터리·서랍은 화면이 features.dashboard 로 숨긴다(2026-09-11 매듭 풀기).
import { dashDir, dashPort } from './paths.mjs';
const URL_ = `http://127.0.0.1:${dashPort()}/api/status`;
const ENABLED = !!dashDir();
let cache = { at: 0, value: null };

export async function readLimits({ maxAgeMs = 30000 } = {}) {
  if (!ENABLED) return null;
  if (Date.now() - cache.at < maxAgeMs) return cache.value;
  let value = null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(URL_, { signal: ctl.signal }); clearTimeout(t);
    if (r.ok) {
      const d = await r.json();
      const cur = d.currentAccounts || {};
      const acc = (name) => (d.accounts || []).find(a => a.name === name) || null;
      const a = acc(cur.anthropic), c = acc(cur.codex);
      const pick = (x) => x ? { account: x.name, h5: num(x.quota?.unified5h), d7: num(x.quota?.unified7d), d7Fable: num(x.quota?.unified7dFable), d7Sonnet: num(x.quota?.unified7dSonnet), d7Reset: x.quota?.unified7dReset || null } : null;
      value = { anthropic: pick(a), codex: pick(c), at: new Date().toISOString() };
    }
  } catch { value = null; }
  cache = { at: Date.now(), value };
  return value;
}
const num = (v) => (typeof v === 'number' ? v : null);

/**
 * 한도에 따라 조합을 한 단계 내리거나 코덱스로 기울인다. 규칙(조합-규칙표 서두):
 *  - Fable 주간 ≥ 50% → cl-max 금지(cl-deep으로)
 *  - 클로드 주간 ≥ 80% 또는 5시간 ≥ 90% → 한 단계 내리고, 구현류면 코덱스 후보를 앞세운다
 *  - 코덱스 5시간 ≥ 90% → 코덱스 한 단계 내림
 */
export function applyLimits(alias, limits, step) {
  if (!limits) return { alias, notes: [] };
  const notes = []; let a = alias;
  const an = limits.anthropic, cx = limits.codex;
  if (an) {
    if (a === 'cl-max' && an.d7Fable != null && an.d7Fable >= 0.5) { a = 'cl-deep'; notes.push(`Fable 주간 ${pct(an.d7Fable)} → cl-deep`); }
    if ((an.d7 != null && an.d7 >= 0.8) || (an.h5 != null && an.h5 >= 0.9)) { const b = step(a, -1); if (b !== a) { notes.push(`클로드 한도 주간 ${pct(an.d7)}·5시간 ${pct(an.h5)} → ${b}`); a = b; } }
  }
  if (cx && (cx.h5 != null && cx.h5 >= 0.9) && /^c(odex|x-)/.test(a)) { const b = step(a, -1); if (b !== a) { notes.push(`코덱스 5시간 ${pct(cx.h5)} → ${b}`); a = b; } }
  return { alias: a, notes };
}
const pct = (v) => v == null ? '?' : Math.round(v * 100) + '%';
