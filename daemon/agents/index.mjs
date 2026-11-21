// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 명부 — 에이전트 id → 어댑터(그 CLI 에만 해당하는 자료와 함수). 새 에이전트 = 이 폴더에 파일 하나 + 아래 한 줄.
// 이 파일을 불러오는 것만으로는 아무 파일도 쓰지 않고 아무 프로세스도 띄우지 않는다.
// 어댑터가 내놓는 것(걸음 1, 명령·선택값):
//   id · table(목록 뼈대) · permissionFields(sel, table) · actualFallback(model) · actualPrefix · isFast(model, actual) · permLabel(s, tables) · buildCommand(s, cwd, { resumeId })
// (걸음 3, 세션을 띄우기 직전 · 재개 전 · 확인 카드): preTrust(cwd, env) · sessionKey(env)(있는 에이전트만) · beforeResume(sm, id, rec, faceVersion)(있는 에이전트만) · promptKeys(prompt)(있는 에이전트만)
//   보조 작업: subagentDirs(w) · subagentFilePrefix · addSubagent(w, file, makeTail) · subagentDone(w, s, parentTail) · subagentEndedAt(w, s, parentTail) · subagentDetail(s)(있는 에이전트만)
//   제목 생성: titleCommand({ system, request, exe, findExe, model, titleModel, codexTitleModel }) · titleFromOutput(out, { lastAnswer })
// (걸음 2, 기록 파일 찾기): watchRecord(sm, id, rec). 기록 해석(parseRecord · turnState · contextWindowGuess)은 <id>.records.mjs 와 records.mjs 명부에 따로 있다.
import * as claude from './claude.mjs';
import * as codex from './codex.mjs';
import { strictIn, orDefaultIn, isMissing } from './select.mjs';

/** 순서 = 화면·목록에 보이는 순서(AGENTS 표의 키 순서) */
export const ADAPTERS = Object.freeze({ claude, codex });

// 어댑터 고르기(규칙 = select.mjs). 명부에 없는 이름을 다른 에이전트로 바꿔 다루지 않는다(에이전트 장부 걸음 5, 2026-11-21 사용자 결정 "보이는 오류").
/** 글자가 정확히 같을 때만 그 어댑터, 아니면 null */
export const strictAdapter = strictIn(ADAPTERS);
/** 값이 없을 때(undefined · null · '')의 기본 에이전트 = 명부의 첫째 */
export const DEFAULT_AGENT = Object.keys(ADAPTERS)[0];
/** 값이 없으면 기본 어댑터, 명부에 있으면 그 어댑터, 명부에 없는 값이면 null */
export const adapterOrDefault = orDefaultIn(ADAPTERS);
export { isMissing as isMissingAgent };
/** 명부에 없는 에이전트 값을 받았을 때 던질 오류(code = UNKNOWN_AGENT) */
export function unknownAgentError(agent) {
  let shown; try { shown = typeof agent === 'string' ? agent : JSON.stringify(agent) ?? String(agent); } catch { shown = Object.prototype.toString.call(agent); }
  const e = new Error(`알 수 없는 에이전트: ${String(shown).slice(0, 60)}`); e.code = 'UNKNOWN_AGENT'; return e;
}

/** 명부에 있는 에이전트인가(객체가 물려받은 이름 `constructor` 등은 아니다) */
export const hasAgent = (agentId) => typeof agentId === 'string' && Object.hasOwn(ADAPTERS, agentId);
