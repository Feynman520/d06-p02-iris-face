// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트·모델·사고깊이 목록과 실행 명령. 터미널에서 치던 것과 같은 명령을 그대로 만든다(설정 파일 무접촉).
//   Claude: claude --chrome --model <id> --effort <effort> [--settings state\fast-mode.json] --session-id <UUID>      (재개: --resume <UUID>)
//   Codex : codex -m <model> -c model_reasoning_effort=<effort> -c service_tier=fast [--sandbox read-only]   (재개: codex resume <id>)
// 에이전트마다 다른 것(목록 뼈대·권한 칸·실행 명령)은 daemon/agents/<id>.mjs 어댑터에 있고, 이 파일은 그것을 묶는 공개 창구다
// (2026-11-21 에이전트 장부 걸음 1 — 바깥에서 보는 함수 이름·돌려주는 모양·기본값·부르는 순서는 그대로).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADAPTERS, adapterOrDefault, hasAgent, DEFAULT_AGENT, isMissingAgent, unknownAgentError } from './agents/index.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export { CLAUDE_CONFIG_DIR, claudeProjectSlug } from './agents/claude.mjs';
export { CODEX_HOME } from './agents/codex.mjs';

// 에이전트 값: 없으면 기본(명부의 첫째), 명부에 있으면 그 에이전트, 그 밖은 거절(UNKNOWN_AGENT) — 다른 에이전트로 바꿔 열지 않는다(걸음 5).
// 재개가 지켜도 되는 "쓰던 정확한 모델 이름"의 모양(지금은 두 에이전트의 이름 모양을 한 식으로 본다 — 머리 글자는 어댑터의 actualPrefix)
// 2026-11-23: 안티그래비티 이름 꼴(gemini-…)을 더함 — 클로드 · 코덱스는 머리 글자(claude- · gpt-) 검사가 그대로라 받는 이름이 늘지 않는다.
const ACTUAL_NAME_RE = /^(claude-[a-z0-9-]+|gpt-[a-z0-9.-]+|gemini-[a-z0-9.-]+)$/;
// 재개 모델의 머리 글자: 명부에 없는 에이전트 값이면 어떤 이름도 받지 않는다(이름에 올 수 없는 글자로 견줌)
const actualPrefixOf = (agent) => adapterOrDefault(agent)?.actualPrefix ?? '\u0000';
// 두 에이전트 값이 같은 에이전트를 가리키는가를 볼 때의 이름: 값이 없으면 기본 에이전트, 명부에 없는 값은 그 값 그대로
const agentIdOf = (agent) => adapterOrDefault(agent)?.id ?? agent;

export const isFastModel = (agent, model, actual) => { const ad = adapterOrDefault(agent); return ad ? ad.isFast(model, actual) : false; };
// 세션을 만들기·바꾸기 직전 모델 목록을 그 PC CLI 와 맞춘다(daemon/models.mjs ModelCatalog.refresh — 평소엔 stat 한 번).
let refreshModels = () => {};
export function setModelRefresher(fn) { refreshModels = typeof fn === 'function' ? fn : () => {}; }

/** 에이전트 id → 목록 뼈대(모델·사고깊이·권한 목록·기본값). 화면이 GET /api/agents 로 그대로 받고, models 배열은 daemon/models.mjs 가 제자리에서 바꾼다. */
export const AGENTS = Object.fromEntries(Object.entries(ADAPTERS).map(([id, ad]) => [id, ad.table]));

export function normalize(sel = {}) {
  // 명부에 없는 에이전트 값은 다른 일을 하기 전에(모델 목록을 새로 읽기 전에) 거절한다
  const agent = isMissingAgent(sel.agent) ? DEFAULT_AGENT : sel.agent;
  if (!hasAgent(agent)) throw unknownAgentError(agent);
  try { refreshModels(); } catch {}
  const a = AGENTS[agent];
  const ad = ADAPTERS[agent];
  // 어댑터가 옛 모양의 선택값을 지금 모양으로 옮긴다(안티그래비티: 모델 칸에 정확한 이름이 통째로 있던 카드 → 모델 + 사고 깊이). 없는 어댑터 = 받은 그대로.
  if (ad.mapSel) sel = ad.mapSel(sel, a) || sel;
  const modelInfo = a.models.find(m => m.id === sel.model) || a.models.find(m => m.id === a.default.model);
  const model = modelInfo.id;
  const efforts = modelInfo.efforts || a.efforts;
  // 모델 변경 시 지원되는 가장 가까운 이하 깊이로 조정(luna: ultra → max).
  // 3차 검토 6번: 그 PC 코덱스가 사고깊이 목록을 비워 두었으면(지원 안 함) 깊이를 넘기지 않는다(effort = '')
  let effort = efforts.length === 0 ? '' : (a.efforts.slice(0, a.efforts.indexOf(sel.effort) + 1).reverse().find(e => efforts.includes(e)) || a.default.effort);
  // 사고 깊이가 모델 이름에 드는 에이전트(안티그래비티): 맞춘 깊이는 반드시 그 모델이 가진 것이어야 한다 — 공통 기본 깊이도 그 모델에 없으면
  // 그 모델의 기본에 가장 가까운 것(기본 이하에서 가장 높은 것 → 가장 낮은 것)으로. 없는 조합으로 이름을 지어 넘기지 않는다(2026-11-23 코덱스 검토 1번).
  if (ad.actualOf && efforts.length && !efforts.includes(effort)) effort = a.efforts.slice(0, a.efforts.indexOf(a.default.effort) + 1).reverse().find(e => efforts.includes(e)) || efforts[0];
  // 권한 칸은 에이전트마다 다르다(클로드 = permission, 코덱스 = approval·sandbox + 예전 readOnly 호환) — 쓰지 않는 칸은 빈 값
  const { permission, approval, sandbox } = ad.permissionFields(sel, a);
  const readOnly = sandbox === 'read-only';
  // modelActual = CLI 에 실제로 넘기는 정확한 모델 이름(클로드 별칭이 풀린 값, 코덱스는 그대로). 모르면 null(판 번호 없는 이름일 때).
  // 사고 깊이가 모델 이름에 들어가는 에이전트(안티그래비티)는 어댑터가 「모델 + 사고 깊이」로 정확한 이름을 고른다(actualOf).
  const modelActual = ad.actualOf ? ad.actualOf(modelInfo, effort) : (modelInfo.actual !== undefined ? modelInfo.actual : ad.actualFallback(model));
  // 재개가 쓰던 정확한 클로드 모델을 지키는 경우(keepResumeModel) — 다시 정규화(buildCommand)해도 그 모델·이름 그대로
  if (sel.keepActual && typeof sel.modelActual === 'string' && ACTUAL_NAME_RE.test(sel.modelActual) && sel.modelActual.startsWith(ad.actualPrefix)) {
    // 사고 깊이가 이름에 든 에이전트: 지키는 이름의 꼬리가 그 깊이일 때만 깊이를 보인다(옛 카드 = 모델 칸이 정확한 이름 통째 → 깊이 칸은 비움, 이름에 이미 들어 있다)
    const tail = (ad.actualOf && typeof sel.model === 'string' && sel.model && sel.modelActual.startsWith(`${sel.model}-`)) ? sel.modelActual.slice(sel.model.length + 1) : '';
    const keptEffort = !ad.actualOf ? effort : (a.efforts.includes(tail) ? tail : '');
    return { agent, model: sel.model || model, modelLabel: sel.modelLabel || sel.modelActual, modelActual: sel.modelActual, keepActual: true, effort: keptEffort, permission, approval, sandbox, readOnly };
  }
  return { agent, model, modelLabel: modelInfo.label, modelActual, effort, permission, approval, sandbox, readOnly };
}
/**
 * 🔴 고른 순간 화면에 보이던 모델(expectModel = 그때 목록의 정확한 이름)과 지금 실제로 넘길 모델이 다르면 실행하지 않는다(v2.102 코덱스 검토 3번).
 * 고른 뒤 실행 직전에 자동 업데이트가 목록을 바꾸는 몇 초의 틈 — 조용히 다른 모델로 돌리지 않고 다시 고르게 한다. expectModel 이 없으면(옛 화면·API) 검사하지 않는다.
 */
export function assertExpected(sel, expectModel) {
  // 고른 때는 정확한 이름이 보였는데 지금은 확인할 수 없음(읽기 실패 → 별칭) 도 거절 — 2차 검토 3번
  if (!expectModel || expectModel === sel?.modelActual) return;
  const e = new Error(`모델 목록이 방금 바뀌었습니다(고른 것: ${expectModel} → 지금: ${sel?.modelActual || '확인 못 함'}). 모델을 다시 확인하고 골라 주세요.`);
  e.code = 'MODEL_CHANGED'; throw e;
}
/** 재개 때 쓸 모델: 이 세션이 실제로 쓰던 정확한 이름이 지금 목록에 있으면 그 줄(예: 업데이트 뒤 「Fable 5.1 (이전)」) — 재개가 몰래 새 모델로 바뀌지 않게. */
export function modelForResume(rec) {
  const list = adapterOrDefault(rec?.agent)?.table.models || [];
  if (rec?.modelActual) { const hit = list.find((m) => m.actual === rec.modelActual); if (hit) return hit.id; }
  return rec?.model;
}
/**
 * 2차 검토 3번: 쓰던 정확한 클로드 모델이 목록에서 사라졌어도(새 CLI 가 「이전」 줄로 안 보여 줌) 재개는 그 모델 그대로 —
 * 클로드 CLI 는 정확한 모델 이름을 그대로 받는다(2.1.272 에 claude-opus-5-5 를 넘겨도 동작, 2026-11-10 실측). 이름도 쓰던 이름 그대로.
 * 3차 검토 3번: 코덱스도 같다 — 목록에서 빠진 모델로 시작한 세션의 재개를 기본 모델로 몰래 바꾸지 않고 그 모델을 그대로 넘긴다(v2.101 까지의 재개와 같은 동작).
 * 그 모델을 코덱스가 더는 받지 않으면 곧 끝나고 카드 띠에 원인이 보인다(조용한 대체보다 정직).
 */
export function keepResumeModel(sel, rec) {
  if (!rec?.modelActual || sel.modelActual === rec.modelActual || agentIdOf(rec.agent) !== agentIdOf(sel.agent)) return sel;
  if (!ACTUAL_NAME_RE.test(rec.modelActual) || !rec.modelActual.startsWith(actualPrefixOf(sel.agent))) return sel;
  return { ...sel, model: rec.model, modelActual: rec.modelActual, modelLabel: rec.modelLabel || rec.modelActual, keepActual: true };
}
/** 권한 표시용 짧은 말 */
export function permLabel(s) {
  const ad = adapterOrDefault(s.agent);
  return ad ? ad.permLabel(s, AGENTS) : ''; // 명부에 없는 에이전트 = 표시할 것 없음(값이 없으면 기본 에이전트의 표시)
}

/** @returns {{ file:string, args:string[], sessionId?:string, recordPath?:string, resumeCmd:string, cmdline:string }} */
export function buildCommand(sel, cwd, { resumeId } = {}) {
  const s = normalize(sel);
  const ad = ADAPTERS[s.agent];
  const cmd = ad.buildCommand(s, cwd, { resumeId });
  BUILT_BY.set(cmd, ad);
  return cmd;
}
// 명령 객체 → 그것을 만든 어댑터. 세션을 띄울 때 "그 명령의 에이전트"가 할 일(폴더 신뢰 · 열쇠)을 다시 고르지 않고 이 짝으로 찾는다.
const BUILT_BY = new WeakMap();
/** buildCommand 가 만든 명령이면 그것을 만든 어댑터, 아니면 null */
export const adapterOfCommand = (cmd) => ((cmd && typeof cmd === 'object') ? BUILT_BY.get(cmd) || null : null);
