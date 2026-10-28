// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 창의 우클릭 메뉴(2026-10-28 macOS 실설치 신고 "우클릭이 먹히지 않는다"). Electron 은 기본 우클릭 메뉴가 없다.
// 이 파일은 electron 을 부르지 않는 순수 함수라 검사(scripts/check-launcher.mjs ⑥)가 그대로 읽는다 —
// main.cjs 가 webContents 'context-menu' 의 params 를 넘기면 메뉴 항목 배열을 돌려준다.
// 항목은 Electron 메뉴 role(잘라내기·복사·붙여넣기 등, 초점이 있는 프레임에 적용) 또는 action(main.cjs 가 처리)을 갖는다.
//   action: replace(맞춤법 제안으로 바꾸기, word) · openLink · copyLink(url) · copyImage(x, y)
// 빈 곳을 누르면 빈 배열(메뉴 없음 — macOS 앱의 보통 동작).
'use strict';

const SEP = { type: 'separator' };
const MAX_SUGGESTIONS = 5;

function contextMenuTemplate(p = {}) {
  const groups = [];
  const flags = p.editFlags || {};
  const suggestions = Array.isArray(p.dictionarySuggestions) ? p.dictionarySuggestions.slice(0, MAX_SUGGESTIONS) : [];
  if (p.isEditable && p.misspelledWord && suggestions.length) {
    groups.push(suggestions.map((word) => ({ label: word, action: 'replace', word })));
  }
  const link = String(p.linkURL || '');
  if (/^https?:\/\//i.test(link)) { // 앱 안 주소(127.0.0.1 데몬)도 기본 브라우저로 — 창 안으로 이동하지 않는다(setWindowOpenHandler 와 같은 규칙)
    groups.push([{ label: '링크 열기', action: 'openLink', url: link }, { label: '링크 주소 복사', action: 'copyLink', url: link }]);
  }
  if (p.mediaType === 'image' && p.hasImageContents !== false) {
    groups.push([{ label: '이미지 복사', action: 'copyImage', x: p.x, y: p.y }]);
  }
  if (p.isEditable) {
    groups.push([{ label: '실행 취소', role: 'undo', enabled: flags.canUndo !== false }, { label: '다시 실행', role: 'redo', enabled: flags.canRedo !== false }]);
    groups.push([
      { label: '잘라내기', role: 'cut', enabled: flags.canCut !== false },
      { label: '복사', role: 'copy', enabled: flags.canCopy !== false },
      { label: '붙여넣기', role: 'paste', enabled: flags.canPaste !== false },
      { label: '모두 선택', role: 'selectAll', enabled: flags.canSelectAll !== false },
    ]);
  } else if (String(p.selectionText || '').trim()) {
    groups.push([{ label: '복사', role: 'copy' }]);
  }
  const out = [];
  for (const g of groups) { if (out.length) out.push(SEP); out.push(...g); }
  return out;
}

module.exports = { contextMenuTemplate };
