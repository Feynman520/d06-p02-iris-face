// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 이름 → 선 아이콘(SVG, currentColor, 선 1.7). 헤더 ⚙·＋ 와 같은 결.
   모듈 `module.json.icon` 은 여기 있는 이름 중 하나여야 한다(v2.52, 2026-09-13 — 이모지 표시 폐지).
   모르는 값(이모지 포함)은 `plug` 로 그린다. 본체는 모듈이 준 문자열을 절대 HTML 로 넣지 않는다. */
(function () {
  'use strict';
  const wrap = (d, size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const PATHS = {
    plug: '<path d="M9 3.5v3.5M15 3.5v3.5M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0zM12 16v4.5"/>',
    chat: '<path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 17 15h-6.5L6.5 18.5V15H7a2.5 2.5 0 0 1-2.5-2.5z"/>',
    bell: '<path d="M6.5 16v-5a5.5 5.5 0 0 1 11 0v5l1.5 2h-14zM10 20.5a2 2 0 0 0 4 0"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.8 2.8 2.8 14.2 0 17M12 3.5c-2.8 2.8-2.8 14.2 0 17"/>',
    book: '<path d="M5 4.5h5.5a2 2 0 0 1 1.5.7 2 2 0 0 1 1.5-.7H19v14h-5.5a1.5 1.5 0 0 0-1.5 1.2A1.5 1.5 0 0 0 10.5 18.5H5zM12 5.2v14"/>',
    wrench: '<path d="M14.5 4.5a4.5 4.5 0 0 0 4.9 6.1l-8.6 8.6a1.8 1.8 0 0 1-2.5-2.5l8.6-8.6a4.5 4.5 0 0 0-2.4-3.6z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2a1.5 1.5 0 0 1 1.06.44L11 6.7h8.5A1.5 1.5 0 0 1 21 8.2v9.3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
    bolt: '<path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12z"/>',
    people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17 13.7a5.5 5.5 0 0 1 3.5 5.3"/>',
  };
  const NAMES = Object.keys(PATHS);
  /** 이름이 목록에 있으면 그 이름, 아니면 'plug'. */
  const resolve = (name) => (typeof name === 'string' && Object.prototype.hasOwnProperty.call(PATHS, name)) ? name : 'plug';
  /** SVG 문자열. 이름은 resolve()를 거치므로 어떤 입력이든 안전한 고정 마크업만 나온다. */
  const svg = (name, size = 18) => wrap(PATHS[resolve(name)], Number(size) || 18);
  window.Icons = { svg, resolve, names: () => NAMES.slice() };
})();
