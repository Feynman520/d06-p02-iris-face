// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 어댑터 고르기 — 옮기기 전 코드의 글자 비교(`=== 'claude'` · `=== 'codex'`)와 똑같은 판정을 지킨다(동작을 바꾸지 않는 옮기기).
// 명부(index.mjs)와 기록 해석 명부(records.mjs)가 같은 규칙을 쓴다. 이 파일은 아무것도 불러오지 않는다.
//   strictIn      = 글자가 정확히 같을 때만 그 어댑터. 표 찾기(map[x])와 달리 목록 `['claude']` 같은 값은 어느 쪽도 아니다(null).
//   elseCodexIn   = 옛 폴백: 클로드가 아니면 모두 코덱스 규칙(옮기기 전에 `=== 'claude' ? 클로드 : 코덱스` 로 갈리던 자리 — 명령·권한 표시·재개 모델).
//   elseClaudeIn  = 옛 폴백: 코덱스가 아니면 모두 클로드 규칙(옮기기 전에 `=== 'codex' ? 코덱스 : 클로드` 로 갈리던 자리 — 기록 감시·기록 해석·차례 판정).
// 두 폴백의 방향이 서로 다른 것도 지금 동작 그대로다. 모르는 이름을 거절하는 걸음(에이전트 장부 걸음 5)에서 없앤다 — 새 코드에서 else* 를 쓰지 않는다.
export const strictIn = (map) => (agent) => { for (const id of Object.keys(map)) if (agent === id) return map[id]; return null; };
export const elseCodexIn = (map) => (agent) => (agent === 'claude' ? map.claude : map.codex);
export const elseClaudeIn = (map) => (agent) => (agent === 'codex' ? map.codex : map.claude);
