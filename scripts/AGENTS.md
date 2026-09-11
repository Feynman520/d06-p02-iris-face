# scripts — 검증 도구

`hash-config.mjs` = 무접촉 검증(전역 설정 파일 해시 전후 비교, 설계 7절 5번). 산출물은 `state/hashes/`.
`check-facenote.mjs` = Face 안내문 지우기 회귀 시험(클로드 원형·코덱스 훼손형 모두, 구현계획 v2.25). `npm run verify:facenote`.
화면 친구 검사 3종은 기능과 함께 `_archive/screen-companion-2.5d-v2.37.0/scripts/`에 보관한다. 보관본 검사: `npm --prefix _archive/screen-companion-2.5d-v2.37.0 run verify`.
`check-subagents.mjs` = 보조 작업(서브에이전트) 감시자 무접촉 검사 — 실제 과거 기록(클로드 배경형·동기형, 코덱스)으로 발견·부모 연결·완료 판정·정규화·도구 횟수·quiet 판정(구현계획 v2.34). `npm run verify:subagents`.

<!-- 상위 AGENTS.md 규칙 재서술 금지 -->
