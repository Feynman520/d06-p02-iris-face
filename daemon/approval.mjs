// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 확인 카드 파서(구현계획 v2.43, 2026-09-11): 노란불(확인 필요)일 때 터미널 화면 아래쪽 글자에서 "질문 본문 + 선택지 + 누를 키"를 뽑는다.
   대화 화면은 이 결과로 버튼을 그리고, 버튼은 터미널 보기와 같은 웹소켓 `input`으로 키 한 글자를 보낸다(새 통로 없음).
   - choice: 맨 아래 연속 선택지 블록. `1. Yes`(번호 → 키 = 숫자) · `Yes (y)`(코덱스, 괄호 속 글자 → 키; esc → ESC, enter → Enter)
   - yn: 선택지 블록이 없고 `(y/n)`·`[Y/n]`이 보이면 y·n 두 키
   - raw: 못 알아본 형식 — 원문(아래 12줄)과 Enter·Esc 두 키. 노란불 자체는 ATTENTION_RE(sessions.mjs)가 켜므로 여기서 판정하지 않는다.
   순수 함수(파일·프로세스 접촉 0). 검사 = scripts/check-approval.mjs (npm run verify:approval). */

const ESC = '\x1b', ENTER = '\r';
const MARK = '(?:❯|›|»|▶|▌|>)';
const NUMBERED_RE = new RegExp(`^\\s*(${MARK})?\\s*(\\d{1,2})[.)]\\s+(\\S.*?)\\s*$`);
const LETTERED_RE = new RegExp(`^\\s*(${MARK})?\\s*(\\S.*?)\\s*\\((y|n|a|s|esc|enter)\\)\\s*$`, 'i');
const YN_RE = /\((y\/n|Y\/n|y\/N)\)|\[(y\/n|Y\/n|y\/N)\]/;
const BORDER_ONLY_RE = /^[\s╭╮╰╯─━┌┐└┘├┤═│┃|]*$/;
const STATUS_LINE_RE = /⏵⏵|bypass permissions|shift\+tab to cycle|← for agents|esc to interrupt|ctrl\+c to interrupt|Enter to confirm|Esc to cancel|Enter to select|Tab to next/i;
const QUESTION_MAX_LINES = 14, QUESTION_MAX_CHARS = 1600;

/** 상자 테두리·좌우 세로줄을 걷어낸 한 줄. 상자만 있는 줄은 null. */
function cleanLine(raw) {
  const s = String(raw ?? '').replace(/\t/g, ' ').replace(/^\s*[│┃|]\s?/, '').replace(/\s?[│┃|]\s*$/, '').replace(/\s+$/, '');
  return BORDER_ONLY_RE.test(s) ? null : s;
}

function keyFor(tag) {
  const t = tag.toLowerCase();
  if (t === 'esc') return ESC; if (t === 'enter') return ENTER; return t;
}

/** @returns {{kind:'choice'|'yn'|'raw', question:string, options:{key:string,label:string,selected:boolean}[]}} */
export function parseApproval(text) {
  const lines = String(text ?? '').split('\n').map(cleanLine).filter(l => l !== null);
  // 상태줄(하네스 안내)은 선택지 판독에서 제외 — 맨 아래에 붙어 블록을 끊는 것을 막는다
  const body = lines.filter(l => !STATUS_LINE_RE.test(l));
  // 맨 아래에서 위로 올라가며 연속 선택지 블록을 찾는다(빈 줄은 건너뛰되 블록 안에서는 끊는다)
  let end = body.length - 1;
  while (end >= 0 && !body[end].trim()) end--;
  const parse = (l) => {
    let m = l.match(NUMBERED_RE);
    if (m) return { key: m[2], label: m[3], selected: !!m[1], numbered: true };
    m = l.match(LETTERED_RE);
    if (m) return { key: keyFor(m[3]), label: `${m[2]} (${m[3]})`, selected: !!m[1], numbered: false };
    return null;
  };
  const block = [];
  let i = end;
  for (; i >= 0; i--) { const o = parse(body[i]); if (!o) break; block.unshift(o); }
  // 번호 선택지는 1부터 오름차순이어야 진짜 대화상자(답변 본문의 목록·표는 보통 맨 아래가 아님)
  const numberedOk = block.length >= 2 && block.every(o => o.numbered) && block.every((o, k) => Number(o.key) === k + 1);
  const letteredOk = block.length >= 2 && block.every(o => !o.numbered);
  if (numberedOk || letteredOk) {
    const above = body.slice(Math.max(0, i + 1 - QUESTION_MAX_LINES), i + 1);
    const options = block.map(({ key, label, selected }) => ({ key, label, selected }));
    if (!options.some(o => o.selected)) options[0].selected = true;
    return { kind: 'choice', question: trimQuestion(above), options };
  }
  const yn = body.slice(-QUESTION_MAX_LINES).find(l => YN_RE.test(l));
  if (yn) return { kind: 'yn', question: trimQuestion(body.slice(-QUESTION_MAX_LINES)), options: [{ key: 'y', label: 'Yes (y)', selected: true }, { key: 'n', label: 'No (n)', selected: false }] };
  return { kind: 'raw', question: trimQuestion(lines.slice(-12)), options: [{ key: ENTER, label: 'Enter', selected: true }, { key: ESC, label: 'Esc', selected: false }] };
}

function trimQuestion(arr) {
  const q = arr.map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return q.length > QUESTION_MAX_CHARS ? '…' + q.slice(-QUESTION_MAX_CHARS) : q;
}
