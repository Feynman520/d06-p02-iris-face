// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 명부 — 에이전트 id → 어댑터(그 CLI 에만 해당하는 자료와 함수). 새 에이전트 = 이 폴더에 파일 하나 + 아래 한 줄.
// 이 파일을 불러오는 것만으로는 아무 파일도 쓰지 않고 아무 프로세스도 띄우지 않는다.
// 어댑터가 내놓는 것(걸음 1, 명령·선택값):
//   id · table(목록 뼈대) · permissionFields(sel, table) · actualFallback(model) · actualPrefix · isFast(model, actual) · permLabel(s, tables) · buildCommand(s, cwd, { resumeId })
import * as claude from './claude.mjs';
import * as codex from './codex.mjs';

/** 순서 = 화면·목록에 보이는 순서(AGENTS 표의 키 순서) */
export const ADAPTERS = Object.freeze({ claude, codex });

/** 명부에 있는 에이전트인가(객체가 물려받은 이름 `constructor` 등은 아니다) */
export const hasAgent = (agentId) => typeof agentId === 'string' && Object.hasOwn(ADAPTERS, agentId);
