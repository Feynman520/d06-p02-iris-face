// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 어댑터 고르기 — 명부(index.mjs)와 기록 해석 명부(records.mjs)가 같은 규칙을 쓴다. 이 파일은 아무것도 불러오지 않는다.
//   값이 없음(undefined · null · '')  = 기본 에이전트(명부의 첫째) — 에이전트 칸이 없던 옛 저장 값과, 에이전트를 안 적은 요청
//   명부에 있는 글자                   = 그 어댑터(글자가 정확히 같을 때만 — 목록 `['claude']` 나 물려받은 이름 `constructor` 는 아니다)
//   그 밖                              = 없음(null). 다른 에이전트로 바꿔 다루지 않는다 — 부르는 쪽이 거절하거나(새 요청) 열지 않는다(저장된 카드).
export const isMissing = (agent) => agent === undefined || agent === null || agent === '';
export const strictIn = (map) => (agent) => { for (const id of Object.keys(map)) if (agent === id) return map[id]; return null; };
export const orDefaultIn = (map) => { const strict = strictIn(map); const first = map[Object.keys(map)[0]]; return (agent) => (isMissing(agent) ? first : strict(agent)); };
