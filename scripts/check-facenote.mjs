// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// stripFaceNote 회귀 시험: 클로드 원형 / 코덱스 붙여넣기 훼손형(――·⧉ 탈락) / 새 안내문 세 가지 모두 지워져야 한다.
import { FACE_NOTE, withFaceNote, stripFaceNote, stripPasteMarks } from '../daemon/facenote.mjs';

const REQ = '리플렛 한 페이지에 짧게 프로젝트 소개 글과 흐름도 이미지를 넣으려고 해.';
const OLD = '[IRIS-Face 안내] 이 세션은 IRIS-Face 대화 화면에서 실행 중이다. 사용자가 문서나 파일을 "보여줘"·"띄워줘"처럼 보기를 요청하면, 그 파일을 start·explorer·기본 앱 등으로 열지 말 것. 대신 답변 본문에 그 파일의 전체 경로를 적기만 하면 화면이 자동으로 대화 안에 미리보기(PDF·이미지 등)로 넣어 준다. 사용자가 원본 파일 자체를 열고 싶을 때는 미리보기 옆 원본 열기(⧉) 아이콘을 누르면 된다. 사용자가 "원본 파일을 열어라/실행해라"라고 분명히 지시할 때만 실제로 파일을 연다. 이 안내는 화면에 표시되지 않는다. ―― 아래가 실제 요청이다.';
const CODEX_DEGRADED = OLD.replace(/[·⧉―]/g, ''); // 2026-09-10 코덱스 rollout 실측: 세 문자 전부 탈락 → "…않는다.  아래가 실제 요청이다."

const cases = [
  ['claude-old', `${OLD}\n\n${REQ}`],
  ['codex-degraded-old', `${CODEX_DEGRADED}\n\n${REQ}`],
  ['new-note', withFaceNote(REQ)],
  ['new-note-degraded', withFaceNote(REQ).replace(/[·⧉―]/g, '')],
];
let fail = 0;
for (const [name, input] of cases) {
  const out = stripFaceNote(input).trim();
  const ok = out === REQ;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' -> ' + JSON.stringify(out.slice(0, 80))}`);
}
// 새 안내문 자체가 코덱스에서 떨어지는 문자를 쓰지 않아야 한다
const fragile = FACE_NOTE.match(/[·⧉―]/g);
console.log(`${fragile ? 'FAIL' : 'PASS'} note-has-no-fragile-chars${fragile ? ' -> ' + fragile.join('') : ''}`);
if (fragile) fail++;
// 안내가 없는 보통 요청은 그대로
if (stripFaceNote(REQ) !== REQ) { fail++; console.log('FAIL plain-request-untouched'); } else console.log('PASS plain-request-untouched');
// 괄호 붙여넣기 표식(v2.72): 클로드코드 2.1.27x 가 기록한 형태 그대로 — 닫는 표식에도 id 가 붙고, 앞뒤에 줄바꿈이 있다.
const PASTED = `<pasted_content id="b774">\n계속 작업할거임. 그냥 멈추지말고 계속 가자\n</pasted_content id="b774">`;
const pasteCases = [
  ['paste-plain', PASTED, '계속 작업할거임. 그냥 멈추지말고 계속 가자'],
  ['paste-with-note', `<pasted_content id="ccaa">\n${withFaceNote(REQ)}\n</pasted_content id="ccaa">`, REQ],
  ['paste-multiline', `<pasted_content id="1">\n첫 줄\n둘째 줄\n</pasted_content id="1">`, '첫 줄\n둘째 줄'],
  ['paste-none', REQ, REQ],
];
for (const [name, input, want] of pasteCases) {
  const out = stripFaceNote(stripPasteMarks(input)).trim();
  const ok = out === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' -> ' + JSON.stringify(out.slice(0, 80))}`);
}
process.exit(fail ? 1 : 0);
