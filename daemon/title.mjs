// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// title.mjs — 작업목록(레일)에 보일 세션 이름.
// 1순위: 클로드코드가 기록파일에 스스로 적는 `ai-title`(첫 답변 뒤 몇 초 안에 생김, 짧고 명확한 한 줄).
// 2순위: 첫 요청문에서 뽑은 한 줄(세션을 만드는 순간 바로 보임 · 코덱스처럼 ai-title이 없는 쪽의 최종값).
// 둘 다 없으면 화면이 폴더 이름을 대신 보인다(app/main.js).
import { stripFaceNote } from './facenote.mjs';

export const TITLE_MAX = 24;

const POLICY_RE = /^\[IRIS-Face 위임 정책[\s\S]*?아래가 실제 요청이다\.\s*/;
const ATTACH_RE = /\n\s*\[첨부 파일\][\s\S]*$/;
// 문장 끝의 부탁·존대 꼬리표(뜻은 그대로, 글자만 줄인다)
const TAIL_RE = /\s*((해\s*)?주(세요|십시오|시겠어요|시겠습니까|실래요|라)|해\s*줘(요)?|해\s*줄래(요)?|줘(요)?|해\s*봐(요)?|해\s*보자|하자|해라|하세요|해요|합시다|해\s*주면\s*좋겠(어|다|습니다)|부탁(해|합니다|드립니다|드려요))\s*[.!?~…]*$/;
const LEAD_RE = /^(#{1,6}\s*|[-*•>]\s+|\d+[.)]\s+|(?:안녕(하세요)?|저기|음|자|그럼|이제|일단|우선|먼저)[,\s]+)/;

export function titleFromPrompt(raw) {
  let s = stripFaceNote(String(raw || '')).replace(POLICY_RE, '');
  s = s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(ATTACH_RE, '');
  s = s.replace(/```[\s\S]*?(```|$)/g, ' '); // 코드 블록은 통째로 뺀다
  // 첫 뜻있는 줄(구분선·태그 줄은 건너뜀, 제목줄(#)은 다른 줄이 없을 때만)
  const lines = s.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^(---+|<[a-z-]+)/i.test(l));
  let line = lines.find(l => !/^#/.test(l)) || lines[0] || '';
  line = line.replace(/`[^`]*`/g, m => m.slice(1, -1)).replace(LEAD_RE, '').replace(/\*\*|__/g, '').trim();
  // 첫 문장만(마침표·물음표·느낌표·세미콜론에서 자름; 소수점·파일 확장자는 지킴)
  const cut = line.search(/[.!?;。！？](?=\s|$)/);
  if (cut > 3) line = line.slice(0, cut + 1);
  line = line.replace(/[.!?;。！？\s]+$/, '').replace(TAIL_RE, '').replace(/[,，\s]+$/, '').replace(/\s{2,}/g, ' ').trim();
  if (!line) return '';
  return clipTitle(line);
}

export function clipTitle(s, max = TITLE_MAX) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  // 낱말 경계에서 자르되, 너무 짧아지면 글자 수로 자른다
  const head = t.slice(0, max);
  const sp = head.lastIndexOf(' ');
  return (sp >= max * 0.6 ? head.slice(0, sp) : head).replace(/[,，·\s]+$/, '') + '…';
}
