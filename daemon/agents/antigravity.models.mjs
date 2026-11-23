// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 안티그래비티 모델 목록 묶기 — agy models 의 정확한 이름(꼬리 = 사고 깊이)을 「모델 + 사고 깊이」 두 칸으로 나눈다(2026-11-23 사용자 요청).
//   agy models 한 줄      gemini-4-argon-high    Gemini 4 Argon (High)
//   화면의 모델 한 줄     { id: 'gemini-4-argon', label: 'Gemini 4 Argon', efforts: ['low','medium','high'], actuals: { high: 'gemini-4-argon-high', … } }
//   꼬리가 없는 이름      { id: 'gemini-pro-orchestrator-neon', label: 'Orchestrator (Neon)', efforts: [], actual: 그 이름 } — 사고 깊이 칸 없음
// 🔴 모델 이름 = 실제 모델: CLI 에 넘기는 이름은 언제나 agy models 에 있던 정확한 이름 하나(actuals · actual)다 — 이름을 지어 붙이지 않고, --effort 도 쓰지 않는다
//    (이름 꼬리와 --effort 가 겹칠 때 어느 쪽이 이기는지 실측한 적이 없다).
// 다른 회사 모델(claude- · gpt-)은 새로 고르는 목록에서 뺀다(사용자 결정). 이미 그 모델로 연 대화의 재개는 쓰던 이름 그대로(agents.mjs keepResumeModel).
// 순수 함수만 둔다(파일 · 네트워크 · 프로세스 접촉 0) — 어댑터(antigravity.mjs)와 상태(antigravity.status.mjs)가 함께 쓴다.

/** 사고 깊이의 순서(낮음 → 높음). agy --help 의 (low|medium|high|xhigh|max) 와 같다. */
export const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max'];
const TAIL_RE = new RegExp(`^(.+)-(${EFFORT_ORDER.join('|')})$`);
const LABEL_TAIL_RE = new RegExp(`\\s*\\((?:${EFFORT_ORDER.join('|')})\\)\\s*$`, 'i');
/** 새로 고르는 목록에서 빼는 이름(다른 회사 모델) */
export const isForeign = (id) => /^(claude|gpt)-/i.test(String(id || ''));

/**
 * agy models 의 줄들([{ id, label }]) → 화면 목록. 순서 = 처음 나온 순서(agy 가 준 순서).
 * 같은 머리의 이름들은 한 줄로 묶이고, 사고 깊이는 EFFORT_ORDER 순서로 선다.
 */
export function groupModels(list) {
  const out = [], byId = new Map();
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || typeof m.id !== 'string' || !m.id || isForeign(m.id)) continue;
    const t = m.id.match(TAIL_RE);
    if (!t) { if (!byId.has(m.id)) { const row = { id: m.id, label: String(m.label || m.id), efforts: [], actual: m.id }; byId.set(m.id, row); out.push(row); } continue; }
    const [, head, effort] = t;
    let row = byId.get(head);
    if (!row) { row = { id: head, label: String(m.label || head).replace(LABEL_TAIL_RE, '') || head, efforts: [], actuals: {} }; byId.set(head, row); out.push(row); }
    if (!row.actuals) continue; // 꼬리 없는 같은 이름이 먼저 나온 드문 경우 — 그 줄을 그대로 둔다
    row.actuals[effort] = m.id;
  }
  for (const row of out) if (row.actuals) row.efforts = EFFORT_ORDER.filter((e) => row.actuals[e]);
  return out;
}

/** 목록의 한 줄 + 사고 깊이 → CLI 에 넘길 정확한 이름(없으면 null) */
export const actualOf = (row, effort) => (row?.actuals ? (row.actuals[effort] || null) : (row?.actual ?? row?.id ?? null));

/**
 * 옛 선택값(모델 칸에 정확한 이름이 통째로 들어 있던 때 — 저장된 카드 · 화면에 남은 값)을 지금 모양으로.
 * 목록에 그 이름이 있으면 { model: 머리, effort: 꼬리 }, 아니면 받은 그대로.
 */
export function mapLegacySel(sel, models) {
  const id = sel?.model;
  if (typeof id !== 'string' || !id || (models || []).some((m) => m.id === id)) return sel;
  for (const row of models || []) {
    if (!row.actuals) continue;
    const effort = row.efforts.find((e) => row.actuals[e] === id);
    if (effort) return { ...sel, model: row.id, effort };
  }
  return sel;
}

/** 기본값이 목록에 없으면(다른 요금제 · 새 판) 목록 안에서 다시 고른다: Argon → 첫 줄, 깊이 = high 이하에서 가장 높은 것 → 가장 낮은 것 */
export function fitDefault(def, models) {
  if (!models?.length) return def;
  const row = models.find((m) => m.id === def.model) || models.find((m) => /argon/i.test(m.id) && m.efforts.length) || models[0];
  const upTo = EFFORT_ORDER.slice(0, EFFORT_ORDER.indexOf('high') + 1).reverse();
  const effort = row.efforts.length === 0 ? '' : (row.efforts.includes(def.effort) ? def.effort : (upTo.find((e) => row.efforts.includes(e)) || row.efforts[0]));
  return { model: row.id, effort };
}

/** 1.5.14 손 표(2026-11-23 이 PC agy models 실측, 순서도 그대로) — 그 PC 의 agy 에서 읽지 못했을 때만 쓰인다 */
export const HAND_LIST = [
  ['gemini-4-neon-high', 'Gemini 4 Neon (High)'], ['gemini-4-neon-xhigh', 'Gemini 4 Neon (XHigh)'], ['gemini-4-neon-medium', 'Gemini 4 Neon (Medium)'], ['gemini-4-neon-low', 'Gemini 4 Neon (Low)'],
  ['gemini-4-argon-medium', 'Gemini 4 Argon (Medium)'], ['gemini-4-argon-high', 'Gemini 4 Argon (High)'], ['gemini-4-argon-low', 'Gemini 4 Argon (Low)'],
  ['gemini-4-hydrogen-high', 'Gemini 4 Hydrogen (High)'], ['gemini-4-hydrogen-xhigh', 'Gemini 4 Hydrogen (XHigh)'], ['gemini-4-hydrogen-medium', 'Gemini 4 Hydrogen (Medium)'], ['gemini-4-hydrogen-low', 'Gemini 4 Hydrogen (Low)'],
  ['gemini-pro-orchestrator-neon', 'Orchestrator (Neon)'], ['gemini-pro-orchestrator-g1-pro', 'Orchestrator (Argon)'],
  ['gemini-3.8-flash-high', 'Gemini 3.8 Flash (High)'], ['gemini-3.8-flash-medium', 'Gemini 3.8 Flash (Medium)'], ['gemini-3.8-flash-low', 'Gemini 3.8 Flash (Low)'],
].map(([id, label]) => ({ id, label }));
