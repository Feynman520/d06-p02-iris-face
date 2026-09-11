---
id: iris:tp592swb
type: project
code: P02
status_scheme: task5
lifecycle: active
tags:
- {kind: 소프트웨어/산출물 종류, value: Local App}
relations:
  canonical: ['iris:t1qy9qdb/AGENTS.md']
created: '2026-09-08'
---
# P02-IRIS 페이스(IRIS-Face) 〖Local App〗

IRIS의 얼굴 — 클로드코드·코덱스 세션 여러 개를 한 창에 모아 지휘하는 데스크톱 앱(베타·선택 수단). 사용자가 폴더를 고르고 **에이전트(Claude/Codex)·모델·사고깊이를 터미널에서처럼 직접 고른 뒤** 요청하면 그 폴더에서 **기존 CLI를 그대로** 가상 터미널로 띄우고, 세션 기록파일을 읽어 깔끔한 대화 화면으로 그린다. 폴더 자동 선택(2026-09-08 스파이크 40%)과 규칙표+Haiku 자동 조합 판정(2026-09-09 사용자 결정)은 폐기 — 코드는 `_archive\`.

- 불변 원칙: 현재 시스템(CLI·프록시·구독·AGENTS.md 상속) 무접촉. 세션은 창을 닫아도 유지되며 사용자가 직접 닫을 때만 종료. 앱 삭제 = 이 폴더 삭제.
- 구조: 세션 데몬(가상 터미널 소유, PID 파일 관리) + Electron 창(데몬 클라이언트) + 루트 바로가기 `IRIS-Face.cmd`.
- 실행 별칭 정본 = 영혼 폴더 루트 `_agent\launchers\`, 조합 규칙표·조사 근거 = 이 폴더 `docs\`(내부 기록, 공개 저장소 제외).
- 구현(2026-09-09 1~4단계 완료): `daemon\`(데몬) · `router\`(판정) · `agents\face-plugin\`(위임 도구 세트) · `app\`(화면·`electron\`) · `scripts\`(무접촉 검증) · `state\`(런타임, git 제외). 단계별 결과 = `docs\구현계획.md`, 실측 = `docs\실측-2026-09-08.md`. 실행 = 루트 `IRIS-Face.cmd` 또는 여기서 `node launch.mjs`. 실행기는 TeamClaude 프록시(3456)가 꺼져 있으면 `teamclaude-dash\ensure-proxy.mjs`로 백그라운드 기동하고, 대시보드 뷰어 서버(3457)는 `ensure-dash.mjs`로 항상 보장하되 **브라우저 탭은 열지 않는다**(대시보드는 Face 창 안 한도 서랍 iframe으로만 봄; 서랍을 열 때마다 데몬 `POST /api/dash/ensure`가 죽은 뷰어를 조용히 되살림, 2026-09-10; 이미 떠 있으면 무접촉). 화면 ⏻ 전부 종료는 Electron 창·트레이까지 즉시 끝낸다.
- **공개 저장소**(2026-09-11): `https://github.com/Feynman520/d06-p02-iris-face` public·MIT·`.stack=A`·remote `git@gh-A:`·태그 `iris-face--vX.Y.Z`. 이 폴더는 독립 git 저장소(브랜치 `main`). 공개 범위 = `.gitignore` 허용목록(README 한/영·코드·`docs/`는 설계·디자인·캡처만). 푸시 전 R07 가드레일(`.stack` 확인)과 개인·기기 식별자 스캔(계정 id·이메일·`C:\Users`·학교 낱말)을 거친다. 배포스택 지도에 행 있음.
- **TeamClaude·파이썬은 선택 기능 — 경로는 `daemon/paths.mjs` 한 곳**(2026-09-11 매듭 풀기, v2.39): `dashDir()`(`TEAMCLAUDE_DASH_DIR` → `_agent\shared\tools` → `_agent\claude\tools`) · `dashPort()` · `pythonExe()`(`IRIS_FACE_PYTHON` → `%LOCALAPPDATA%\Programs\Python` → PATH). 소스에 사람 PC 경로를 굳히지 않는다. 데몬 `/api/health.features`(`dashboard`·`voice`·`python`)가 false 면 화면은 배터리·Ctrl+D 서랍을 숨기고 🎤는 설치 안내만 띄운다. 공개 저장소 제외 목록 = `.gitignore`(docs 는 설계·디자인·각인 캡처만 공개).
- **화면의 알림·확인은 `app/dialog.js`(페이지 안 `Dialog.alert/confirm`)로만 띄운다 — 네이티브 `alert()/confirm()` 금지.** Electron(윈도) 창에서 네이티브 대화상자를 닫으면 창이 OS 키보드 초점을 잃어 입력창에 아무것도 쳐지지 않는다(2026-09-10 실증·"요청 입력 불가" 버그의 원인). 안전망: 창을 눌렀는데 초점이 없으면 페이지가 `irisHost.refocus()`(preload) → 메인이 초점을 되찾는다.
- **Esc 중단은 두 길**(2026-09-10): 페이지 keydown + Electron 메인 `before-input-event` 중계(`irisHost.onEscape`) → 모두 `main.js` `onEscape()` 한 곳으로(300ms 중복 가드). 초점이 대화 안 미리보기 iframe에 있으면 페이지엔 keydown이 오지 않으므로 중계를 없애면 안 된다. 대화 삽입 규칙은 **앱 자기 주소(127.0.0.1:데몬 포트)를 iframe으로 넣지 않는다**(재귀 화면·초점 뺏김).
- **🎤 음성 입력 = 로컬 위스퍼**(2026-09-10 사용자 결정, OpenAI와 직접 비교 시험 뒤): `daemon/voice.mjs` + `daemon/whisper_worker.py`(faster-whisper `large-v3-turbo`, CUDA, 데몬 시작 때 상주) → `POST /api/transcribe` → 글은 **입력창 커서 자리에 삽입만**(자동 전송 없음). 용어 힌트 = `state\voice-hints.txt`. 기존 `openai-whisper`(torch)는 Smart App Control에 막혀 못 쓴다 — 로컬 엔진을 바꿀 때 이 점 먼저 확인. 상세 = `docs\구현계획.md` v2.21.
- **CLI에 글을 넣는 길은 `sessions.mjs send()` 하나뿐**(붙여넣기 뒤 Enter 규칙 = 아래 R-018). 요청이 "생각중"으로 굳으면 먼저 `state\daemon.log`의 `send` / `enter ok` / `enter retry` / `enter FAILED` 줄로 전송 여부를 본다(2026-09-10 사건, `docs\구현계획.md` v2.23).
- **각인·허가서·버전 원천**(2026-09-10 사용자 결정): 허가서 **MIT**(LICENSE), 패키지 이름 **IRIS**, 만든 사람 표기는 `package.json`(author·homepage=디지털 명함·license·iris.since/motto) **한 곳**이 원천 — 데몬이 읽어 `/api/health.about`으로 주고 화면·트레이·정보창이 그것을 쓴다. **버전도 `package.json`만 올린다**(데몬에 손으로 적지 않음; 구현계획의 vN.NN과 맞춤). 각인 = 설정 바닥 정보창 · 첫 실행 `by SEJUN HAM` · 워드마크 두 번 클릭/Ctrl+Alt+I 별 서명(`stars.js signature()`) · 소스 첫 줄 © 주석 · 트레이 툴팁. 상세 = `docs\구현계획.md` v2.27.
- **작업 완료 알림**(2026-09-11): 데몬이 status 방송에 `done`(요청을 받은 뒤의 busy→끝 전환에만)을 실어 주면 `app/notify.js`가 창 오른쪽 아래 작은 알림을 띄운다(보고 있는 세션+창이 앞이면 생략, 누르면 그 세션으로). 창이 뒤면 윈도 OS 알림도. 설정 ⚙ → 알림(`notifyDone`·`notifyOs`, 미리보기 버튼). 세션 시작 직후 첫 프롬프트의 busy→idle은 `worked` 미표시라 알리지 않는다. `docs\구현계획.md` v2.31.
- **화면 친구 보류**(2026-09-11, v2.38): 사용자 요청으로 현재 Face의 화면·설정·실행 연결에서 제외했다. v2.37의 2.5D 코드·그림·검사·제작 기록·비교 시안은 `_archive/screen-companion-2.5d-v2.37.0/`에 보존한다. 다시 요청받으면 같은 폴더의 `RESTORE.md`를 따라 복구한다.
- **보조 작업(서브에이전트) 표시**(2026-09-11): 데몬 `daemon/subagents.mjs`가 세션마다 서브 기록파일(클로드 `<세션id>\subagents\agent-*.jsonl`+`.meta.json`, 코덱스 `parent_thread_id`가 부모인 rollout)을 읽기 전용으로 꼬리 읽기해 `subagents`(목록)·`subtranscript`(서랍이 보는 보조의 기록) 웹소켓 말과 `GET /api/sessions/:id/subagents[/:key/transcript]`로 준다. 완료 판정 = 클로드 부모의 tool_result(동기형)/`<task-notification>`(배경형) · 코덱스 자식의 `task_complete`; 신호 없이 부모가 대기·종료 상태로 60초 조용하면 `quiet`(완료로 단정하지 않음). **재개(v2.40.2, 2026-09-11 실측):** 배경 보조는 멈췄다 이어 일하며 그때마다 부모에 `<task-notification>`이 찍히므로, 완료·소진된 보조도 기록 파일이 다시 자라면 `resume()`으로 running에 되돌리고, 그 뒤 완료는 **재개 시각보다 나중에 온 알림**만 인정한다(`resumedAt`). 첫 알림=완료로 굳히던 v2.34 규칙의 구멍. 화면은 `app/subagents.js`+`subagents.css`: 그 차례의 과정 영역에 칩(상태·모델·도구 횟수·경과), 작업목록 ⁺N, 칩 클릭 = 대화 영역 안 오른쪽 서랍(반폭·끌어 조절·탭·두 번째 `Transcript.create()` 인스턴스·읽기 전용), Esc는 서랍만 닫음. 팝업·완료 알림은 만들지 않는다(사용자 결정). 데몬 변경이라 ⏻ 후 재실행해야 적용. 검사 = `npm run verify:subagents`. 상세 = `docs\구현계획.md` v2.34. **보조가 살아 있으면 완료가 아니다**(v2.40, 2026-09-11): 화면의 겉보기 상태 `viewStatus()`(`main.js`) = 데몬 `idle` + 살아 있는 보조(`SubPanel.alive` = running + quiet) 있음 → running이 있으면 `delegated`(보라 도는 고리 · `보조 작업 중 ⁺N`), quiet만 남으면 `waiting`(노란 고리 · `보조 응답 대기 ⁺N`, v2.40.1 — 조용함≠완료), 완료 알림은 `notify.js`가 보류했다가 메인이 깨어나면 지우고 살아 있는 보조가 0이 된 뒤 3초 조용하면 "보조 N개 포함"으로 띄운다. 데몬 상태 값은 그대로(터미널 판정·Esc에 묶임).
- **코덱스 시작 대화상자 2종**(2026-09-10): "Update available" 3지선다는 데몬이 2(Skip)로 자동 응답(설치는 코덱스 SessionStart 훅 `codex-autoupdate.ps1`이 배경에서 — 정본 = 루트 `IRIS-도구조사.md` 2026-09-10 항목). "Hooks need review"(0.154.0+, hooks.json 변경 시)는 **자동 응답 금지** — 노란불로 두고 사용자가 터미널 보기에서 2를 누른다. `docs\구현계획.md` v2.24.

<!-- 상위(루트/R07/D06) AGENTS.md 규칙 재서술 금지 -->

<!-- self-improve:begin — 자기개선 플러그인이 자동으로 관리하는 구역입니다. 손으로 고치지 마세요. 규칙을 빼려면 에이전트에게 "규칙 R-001 빼"라고 말하세요. -->
## 자기개선 규칙 (자동 적용)

- [R-018] CLI 입력창에 node-pty로 글을 붙여넣은 뒤 Enter는 고정 지연으로 치지 말고, 화면 출력이 잠잠해진 뒤 치고 1.2초 뒤 글이 입력창에 남아 있으면 Enter를 재시도한다(코덱스는 마지막 글자 뒤 120ms 안의 Enter를 줄바꿈으로 삼킴) — 구현·로그 확인법은 sessions.mjs send()와 docs/구현계획.md v2.23. (근거 기록: 2026-09-09-004, 2026-09-10-012)
<!-- self-improve:end -->
