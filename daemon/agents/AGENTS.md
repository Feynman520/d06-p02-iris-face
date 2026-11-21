# daemon/agents — 에이전트 어댑터

에이전트마다 파일 하나(`<id>.mjs`)에 그 CLI 에만 해당하는 자료와 함수를 두고, `index.mjs` 가 명부로 묶는다. 바깥 코드는 `daemon/agents.mjs` 의 공개 함수로만 쓴다. 어댑터를 고치면 `npm run verify:agent-baseline` 이 옮기기 전과 같은 결과인지 본다(일부러 바꾼 동작만 그 구역을 다시 찍는다).

<!-- 상위 AGENTS.md(전역·R07·D09·P01·daemon) 규칙 재서술 금지 -->
