// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 명부 — 에이전트 id → 어댑터(그 CLI 에만 해당하는 자료와 함수). 새 에이전트 = 이 폴더에 파일 하나 + 아래 한 줄.
// 이 파일을 불러오는 것만으로는 아무 파일도 쓰지 않고 아무 프로세스도 띄우지 않는다.
// 어댑터가 내놓는 것(걸음 1, 명령·선택값):
//   id · table(목록 뼈대) · permissionFields(sel, table) · actualFallback(model) · actualPrefix · isFast(model, actual) · permLabel(s, tables) · buildCommand(s, cwd, { resumeId })
// (걸음 2, 기록 파일 찾기): watchRecord(sm, id, rec). 기록 해석(parseRecord · turnState · contextWindowGuess)은 <id>.records.mjs 와 records.mjs 명부에 따로 있다.
import * as claude from './claude.mjs';
import * as codex from './codex.mjs';
import { strictIn, elseCodexIn, elseClaudeIn } from './select.mjs';

/** 순서 = 화면·목록에 보이는 순서(AGENTS 표의 키 순서) */
export const ADAPTERS = Object.freeze({ claude, codex });

// 어댑터 고르기 — 옮기기 전 코드의 글자 비교(`=== 'claude'` · `=== 'codex'`)와 똑같은 판정을 지킨다(동작을 바꾸지 않는 옮기기).
//   strictAdapter    = 글자가 정확히 같을 때만 그 어댑터. 표 찾기(AGENTS[x])와 달리 목록 `['claude']` 같은 값은 어느 쪽도 아니다(null).
//   legacyElseCodex  = 옛 폴백: 클로드가 아니면 모두 코덱스 규칙(옮기기 전에 `=== 'claude' ? 클로드 : 코덱스` 로 갈리던 자리 — 명령·권한 표시·재개 모델).
//   legacyElseClaude = 옛 폴백: 코덱스가 아니면 모두 클로드 규칙(옮기기 전에 `=== 'codex' ? 코덱스 : 클로드` 로 갈리던 자리 — 기록 감시·기록 해석·차례 판정).
// 두 폴백의 방향이 서로 다른 것도 지금 동작 그대로다. 모르는 이름을 거절하는 걸음(에이전트 장부 걸음 5)에서 없앤다 — 새 코드에서 legacy* 를 쓰지 않는다.
export const strictAdapter = strictIn(ADAPTERS);
export const legacyElseCodex = elseCodexIn(ADAPTERS);
export const legacyElseClaude = elseClaudeIn(ADAPTERS);

/** 명부에 있는 에이전트인가(객체가 물려받은 이름 `constructor` 등은 아니다) */
export const hasAgent = (agentId) => typeof agentId === 'string' && Object.hasOwn(ADAPTERS, agentId);
