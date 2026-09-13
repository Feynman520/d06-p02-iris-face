// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 꾸미기 후보 목록: 헤더 마크 · 글자체 · 테마 · 중앙 애니메이션. 설정 패널이 이 목록으로 미리보기를 그리고, 고른 것만 실제로 돈다. */
window.Registry = (() => {
  // 그라디언트도 테마 변수(--mk-1/--mk-2)를 따른다(밝은 테마에서 파랑이 남지 않게)
  const G = (id, a = 'var(--mk-1)', b = 'var(--mk-2)') => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
  // svg: 24×24 뷰박스 내용. css: 해당 마크에만 적용되는 애니메이션(.mark.mk-<id> 접두는 적용 시 자동으로 붙는다)
  // v2.54(2026-09-13, 사용자 결정): 헤더 마크·글자체는 고정(회전 육각 · Segoe Script). 후보 목록은 git 이력(v2.53 이전)에.
  const MARKS = [
    { id: 'cube', name: '회전 육각', svg: `<g class="a1"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9Z" fill="none" stroke="var(--mk-1)" stroke-width="1.3"/><path d="M12 3v9m0 0l7.8 4.5M12 12l-7.8 4.5" stroke="var(--mk-2)" stroke-width="1" opacity=".7"/></g>`, css: `.a1{animation:mk-spin 16s linear infinite}` },
  ];
  const MARK_KEYFRAMES = `
@keyframes mk-spin{to{transform:rotate(360deg)}}
@keyframes mk-core{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.35);opacity:1}}
@keyframes mk-blink{0%,88%,100%{transform:scaleY(1)}93%{transform:scaleY(.08)}}
@keyframes mk-pupil{0%,100%{r:2.2}50%{r:3.4}}
@keyframes mk-ripple{0%{r:3;opacity:.9}100%{r:11;opacity:0}}
@keyframes mk-breathe{0%,100%{transform:scale(.92);filter:brightness(.9)}50%{transform:scale(1.06);filter:brightness(1.25)}}
@keyframes mk-dash{to{stroke-dashoffset:-56}}
@keyframes mk-twinkle{0%,100%{transform:scale(1) rotate(0);opacity:.8}50%{transform:scale(1.25) rotate(45deg);opacity:1}}
@keyframes mk-aperture{0%,100%{transform:rotate(0) scale(1)}50%{transform:rotate(60deg) scale(.82)}}
@keyframes mk-blob{0%,100%{d:path("M12 3c4 0 7 3 7 7 0 5-3 11-7 11S5 15 5 10c0-4 3-7 7-7Z")}50%{d:path("M12 3c5 0 8 4 8 8 0 4-4 10-8 10S4 15 4 11c0-4 3-8 8-8Z")}}
@keyframes mk-fade{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes mk-hue{to{filter:hue-rotate(360deg)}}
@keyframes mk-swing{0%,100%{transform:rotate(-28deg)}50%{transform:rotate(28deg)}}
@keyframes mk-draw{0%{stroke-dashoffset:60;opacity:0}15%{opacity:1}80%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
@keyframes mk-flip{0%{transform:rotateY(0)}100%{transform:rotateY(360deg)}}
@keyframes mk-slide{to{transform:translateX(24px)}}
@keyframes mk-shine{0%,100%{filter:brightness(.85)}50%{filter:brightness(1.4)}}
.mark *{transform-origin:12px 12px;transform-box:view-box}
@media (prefers-reduced-motion: reduce){.mark *{animation:none!important}}`;

  const FONTS = [
    { id: 'segoe-script', name: 'Segoe Script', css: `font-family:"Segoe Script",cursive;font-weight:700;letter-spacing:.06em;font-size:17px` },
  ];

  // 테마 = CSS 변수 묶음(성능 비용 0). 마크 색(--mk-*)도 함께.
  const THEMES = [
    { id: 'indigo', name: '남색 밤(기본)', vars: { '--base': '#0a0c14', '--surface': '#10131d', '--raised': '#171b28', '--overlay': '#1d2233', '--ink': '#e9ecf5', '--ink-2': '#a6adbf', '--ink-3': '#6e7689', '--iris': '#8fa8ff', '--iris-2': '#c9b8ff', '--iris-soft': 'rgba(143,168,255,.16)', '--mk-1': '#8fa8ff', '--mk-2': '#c9b8ff', '--mk-core': '#e9ecf5', '--mk-dim': '#2a3260', '--star-a': '232,236,255', '--star-b': '160,178,255', '--star-c': '206,190,255', '--glow': '122,140,255' } },
    { id: 'black', name: '순검정', vars: { '--base': '#050506', '--surface': '#0c0c0e', '--raised': '#151518', '--overlay': '#1b1b20', '--ink': '#f2f2f4', '--ink-2': '#a9a9b3', '--ink-3': '#6b6b76', '--iris': '#a3b1ff', '--iris-2': '#d3c6ff', '--iris-soft': 'rgba(163,177,255,.16)', '--mk-1': '#a3b1ff', '--mk-2': '#d3c6ff', '--mk-core': '#ffffff', '--mk-dim': '#26262e', '--star-a': '255,255,255', '--star-b': '190,200,255', '--star-c': '220,210,255', '--glow': '150,160,255' } },
    { id: 'graphite', name: '그래파이트', vars: { '--base': '#121417', '--surface': '#191c21', '--raised': '#22262c', '--overlay': '#2a2f36', '--ink': '#eceff3', '--ink-2': '#aab1bb', '--ink-3': '#737b86', '--iris': '#9ecbff', '--iris-2': '#c7e3ff', '--iris-soft': 'rgba(158,203,255,.16)', '--mk-1': '#9ecbff', '--mk-2': '#c7e3ff', '--mk-core': '#eceff3', '--mk-dim': '#2f3a46', '--star-a': '236,239,243', '--star-b': '158,203,255', '--star-c': '199,227,255', '--glow': '120,170,230' } },
    { id: 'forest', name: '깊은 숲', vars: { '--base': '#0a1210', '--surface': '#0f1916', '--raised': '#15221e', '--overlay': '#1b2b26', '--ink': '#e8f0ec', '--ink-2': '#a3b8ae', '--ink-3': '#6b8078', '--iris': '#7fd8a8', '--iris-2': '#bfe9d0', '--iris-soft': 'rgba(127,216,168,.16)', '--mk-1': '#7fd8a8', '--mk-2': '#bfe9d0', '--mk-core': '#e8f0ec', '--mk-dim': '#234034', '--star-a': '232,240,236', '--star-b': '127,216,168', '--star-c': '191,233,208', '--glow': '100,190,140' } },
    { id: 'ember', name: '잿불', vars: { '--base': '#120d0b', '--surface': '#1a1311', '--raised': '#241a17', '--overlay': '#2e211d', '--ink': '#f3ece7', '--ink-2': '#c0aea3', '--ink-3': '#84736a', '--iris': '#ffb27a', '--iris-2': '#ffd8b3', '--iris-soft': 'rgba(255,178,122,.16)', '--mk-1': '#ffb27a', '--mk-2': '#ffd8b3', '--mk-core': '#f3ece7', '--mk-dim': '#4a3129', '--star-a': '243,236,231', '--star-b': '255,178,122', '--star-c': '255,216,179', '--glow': '230,150,100' } },
    { id: 'violet', name: '보랏빛', vars: { '--base': '#0e0a16', '--surface': '#150f20', '--raised': '#1d152c', '--overlay': '#251b38', '--ink': '#efe9f7', '--ink-2': '#b3a6c7', '--ink-3': '#7a6d8f', '--iris': '#c39bff', '--iris-2': '#e6d4ff', '--iris-soft': 'rgba(195,155,255,.16)', '--mk-1': '#c39bff', '--mk-2': '#e6d4ff', '--mk-core': '#efe9f7', '--mk-dim': '#3a2a55', '--star-a': '239,233,247', '--star-b': '195,155,255', '--star-c': '230,212,255', '--glow': '170,130,240' } },
    { id: 'ivory', name: '아이보리', vars: { '--base': '#faf6ee', '--surface': '#f2ecdf', '--raised': '#e9e1d0', '--overlay': '#e0d6c2', '--ink': '#2a241c', '--ink-2': '#655b4c', '--ink-3': '#978b78', '--iris': '#b0742e', '--iris-2': '#d9a75a', '--iris-soft': 'rgba(176,116,46,.14)', '--mk-1': '#b0742e', '--mk-2': '#d9a75a', '--mk-core': '#2a241c', '--mk-dim': '#d8ccb4', '--star-a': '70,55,35', '--star-b': '176,116,46', '--star-c': '217,167,90', '--glow': '200,150,80', '--line': 'rgba(60,40,10,.09)', '--line-2': 'rgba(60,40,10,.18)', '--ok': '#3f9a5c', '--warn': '#c9862b', '--bad': '#c4453f' } },
    { id: 'mist', name: '새벽 안개', vars: { '--base': '#eef2f6', '--surface': '#e3e9f0', '--raised': '#d8e0e9', '--overlay': '#cdd7e2', '--ink': '#1c2430', '--ink-2': '#4f5c6d', '--ink-3': '#8593a4', '--iris': '#3b74c9', '--iris-2': '#6f9be0', '--iris-soft': 'rgba(59,116,201,.13)', '--mk-1': '#3b74c9', '--mk-2': '#6f9be0', '--mk-core': '#1c2430', '--mk-dim': '#c0cbd8', '--star-a': '40,55,80', '--star-b': '59,116,201', '--star-c': '111,155,224', '--glow': '90,140,210', '--line': 'rgba(20,40,70,.09)', '--line-2': 'rgba(20,40,70,.18)', '--ok': '#2f9a5f', '--warn': '#c98a2b', '--bad': '#c8433f' } },
    { id: 'paper', name: '밝은 종이', vars: { '--base': '#f4f2ec', '--surface': '#ebe8e0', '--raised': '#e1ddd3', '--overlay': '#d8d3c7', '--ink': '#1d1b17', '--ink-2': '#5a5750', '--ink-3': '#8a867c', '--iris': '#3d5bd6', '--iris-2': '#7a5be0', '--iris-soft': 'rgba(61,91,214,.12)', '--mk-1': '#3d5bd6', '--mk-2': '#7a5be0', '--mk-core': '#1d1b17', '--mk-dim': '#c9c4b8', '--star-a': '40,40,60', '--star-b': '61,91,214', '--star-c': '122,91,224', '--glow': '61,91,214', '--line': 'rgba(0,0,0,.08)', '--line-2': 'rgba(0,0,0,.16)', '--ok': '#2f9a5f', '--warn': '#c98a2b', '--bad': '#c8433f' } },
  ];

  const STAGES = [
    { id: 'sphere', name: '별의 구', desc: '3천 별이 구를 이루어 회전(현재)' },
    { id: 'iris', name: '별의 홍채', desc: '별 고리가 차등 회전, 동공이 열림' },
    { id: 'nebula', name: '성운', desc: '느리게 흐르는 별 구름' },
    { id: 'constellation', name: '별자리', desc: '별 120개와 가까운 별을 잇는 선' },
    { id: 'drift', name: '잔잔한 별밭', desc: '깜박이며 아주 천천히 흐르는 별' },
    { id: 'galaxy', name: '은하', desc: '비스듬히 기운 나선 은하가 천천히 돈다' },
    { id: 'warp', name: '워프', desc: '별이 정면에서 흘러나온다 · 작업 중엔 초공간' },
    { id: 'aurora', name: '오로라', desc: '빛의 커튼이 하늘을 가로질러 물결친다' },
    { id: 'helix', name: '이중나선', desc: '두 가닥이 꼬여 회전하는 별의 나선' },
    { id: 'fireflies', name: '반딧불', desc: '배회하던 반딧불이 점점 함께 깜박인다' },
    { id: 'off', name: '없음', desc: '애니메이션 끔(성능 최소)' },
  ];
  return { MARKS, MARK_KEYFRAMES, FONTS, THEMES, STAGES };
})();
