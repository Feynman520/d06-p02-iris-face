# daemon/agents — 에이전트 어댑터

에이전트마다 그 CLI 에만 해당하는 자료와 함수를 두 파일에 둔다: `<id>.mjs`(실행 — 목록 뼈대·권한 칸·명령·기록 파일 찾기, 명부 = `index.mjs`) · `<id>.records.mjs`(기록 해석, 명부 = `records.mjs`). 기록 해석 쪽은 실행 쪽을 불러오지 않는다(기록을 읽는 것만으로 설정 폴더 자리가 굳지 않게). 바깥 코드는 `daemon/agents.mjs` · `transcript.mjs` · `sessions.mjs` 의 공개 함수로만 쓴다. 어댑터를 고치면 `npm run verify:agent-baseline` 이 옮기기 전과 같은 결과인지 본다(일부러 바꾼 동작만 그 구역을 다시 찍는다).

<!-- 상위 AGENTS.md(전역·R07·D09·P01·daemon) 규칙 재서술 금지 -->
