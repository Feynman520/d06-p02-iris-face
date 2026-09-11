// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 꾸미기 후보 목록: 헤더 마크 · 글자체 · 테마 · 중앙 애니메이션. 설정 패널이 이 목록으로 미리보기를 그리고, 고른 것만 실제로 돈다. */
window.Registry = (() => {
  // 그라디언트도 테마 변수(--mk-1/--mk-2)를 따른다(밝은 테마에서 파랑이 남지 않게)
  const G = (id, a = 'var(--mk-1)', b = 'var(--mk-2)') => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
  // svg: 24×24 뷰박스 내용. css: 해당 마크에만 적용되는 애니메이션(.mark.mk-<id> 접두는 적용 시 자동으로 붙는다)
  const MARKS = [
    { id: 'orbit', name: '궤도', svg: `<circle cx="12" cy="12" r="2.4" fill="var(--mk-core)"/><g class="a1"><ellipse cx="12" cy="12" rx="9.5" ry="4" fill="none" stroke="var(--mk-1)" stroke-width="1" opacity=".55"/><circle cx="21.5" cy="12" r="1.5" fill="var(--mk-2)"/></g><g class="a2"><ellipse cx="12" cy="12" rx="9.5" ry="4" fill="none" stroke="var(--mk-2)" stroke-width="1" opacity=".4" transform="rotate(60 12 12)"/><circle cx="16.75" cy="3.77" r="1.2" fill="var(--mk-1)"/></g>`, css: `.a1{animation:mk-spin 4s linear infinite}.a2{animation:mk-spin 7s linear infinite reverse}` },
    { id: 'orbit3', name: '삼중 궤도', svg: `<circle cx="12" cy="12" r="2" fill="var(--mk-core)"/><g class="a1"><ellipse cx="12" cy="12" rx="9.5" ry="3.4" fill="none" stroke="var(--mk-1)" stroke-width=".9" opacity=".5"/><circle cx="21.5" cy="12" r="1.3" fill="var(--mk-2)"/></g><g class="a2"><ellipse cx="12" cy="12" rx="9.5" ry="3.4" fill="none" stroke="var(--mk-1)" stroke-width=".9" opacity=".5" transform="rotate(60 12 12)"/><circle cx="16.75" cy="3.77" r="1.1" fill="var(--mk-1)"/></g><g class="a3"><ellipse cx="12" cy="12" rx="9.5" ry="3.4" fill="none" stroke="var(--mk-2)" stroke-width=".9" opacity=".5" transform="rotate(120 12 12)"/><circle cx="7.25" cy="3.77" r="1.1" fill="var(--mk-2)"/></g>`, css: `.a1{animation:mk-spin 5s linear infinite}.a2{animation:mk-spin 8s linear infinite reverse}.a3{animation:mk-spin 11s linear infinite}` },
    { id: 'rings', name: '두 고리', svg: `${G('gr')}<circle class="a1" cx="12" cy="12" r="9" fill="none" stroke="url(#gr)" stroke-width="1.6" stroke-dasharray="40 16.5"/><circle class="a2" cx="12" cy="12" r="5.6" fill="none" stroke="url(#gr)" stroke-width="1.2" stroke-dasharray="9 26" opacity=".8"/><circle class="a3" cx="12" cy="12" r="2.2" fill="var(--mk-core)"/>`, css: `.a1{animation:mk-spin 14s linear infinite}.a2{animation:mk-spin 9s linear infinite reverse}.a3{animation:mk-core 3.2s ease-in-out infinite}` },
    { id: 'eye', name: '눈(깜박임)', svg: `<g class="a1"><path d="M2 12c3-5 6.5-7.5 10-7.5S19 7 22 12c-3 5-6.5 7.5-10 7.5S5 17 2 12Z" fill="none" stroke="var(--mk-1)" stroke-width="1.5"/><circle cx="12" cy="12" r="5" fill="none" stroke="var(--mk-2)" stroke-width="1.2"/><circle class="a2" cx="12" cy="12" r="2.2" fill="var(--mk-core)"/></g>`, css: `.a1{animation:mk-blink 5s ease-in-out infinite}.a2{animation:mk-pupil 3.6s ease-in-out infinite}` },
    { id: 'ripple', name: '파동', svg: `<circle cx="12" cy="12" r="2.4" fill="var(--mk-core)"/><circle class="a1" cx="12" cy="12" r="3" fill="none" stroke="var(--mk-1)" stroke-width="1.2"/><circle class="a2" cx="12" cy="12" r="3" fill="none" stroke="var(--mk-1)" stroke-width="1.1"/><circle class="a3" cx="12" cy="12" r="3" fill="none" stroke="var(--mk-2)" stroke-width="1"/>`, css: `.a1{animation:mk-ripple 2.6s ease-out infinite}.a2{animation:mk-ripple 2.6s ease-out .9s infinite}.a3{animation:mk-ripple 2.6s ease-out 1.8s infinite}` },
    { id: 'breath', name: '숨 쉬는 구', svg: `<defs><radialGradient id="gb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="var(--mk-core)"/><stop offset=".45" stop-color="var(--mk-1)"/><stop offset="1" stop-color="#2a3260"/></radialGradient></defs><circle class="a1" cx="12" cy="12" r="8.5" fill="url(#gb)"/>`, css: `.a1{animation:mk-breathe 3.4s ease-in-out infinite}` },
    { id: 'sphere', name: '별의 구', svg: `<circle cx="12" cy="12" r="9.5" fill="none" stroke="var(--mk-1)" stroke-width=".6" opacity=".35"/><g class="a1" fill="var(--mk-core)"><circle cx="12" cy="3" r="1.1"/><circle cx="19.8" cy="7.5" r=".9"/><circle cx="19.8" cy="16.5" r="1"/><circle cx="12" cy="21" r=".8"/><circle cx="4.2" cy="16.5" r="1.1"/><circle cx="4.2" cy="7.5" r=".9"/></g><g class="a2" fill="var(--mk-2)"><circle cx="12" cy="7" r=".9"/><circle cx="16.3" cy="14.5" r=".8"/><circle cx="7.7" cy="14.5" r="1"/></g><circle cx="12" cy="12" r="1.6" fill="var(--mk-core)"/>`, css: `.a1{animation:mk-spin 12s linear infinite}.a2{animation:mk-spin 20s linear infinite reverse}` },
    { id: 'scan', name: '스캔 아크', svg: `<circle cx="12" cy="12" r="9" fill="none" stroke="var(--mk-dim)" stroke-width="1.4"/><circle class="a1" cx="12" cy="12" r="9" fill="none" stroke="var(--mk-1)" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="14 42"/><circle cx="12" cy="12" r="2.2" fill="var(--mk-core)"/>`, css: `.a1{animation:mk-dash 2.4s linear infinite}` },
    { id: 'sparkle', name: '반짝이는 별', svg: `<path class="a1" d="M12 2.5c.9 5.2 4.3 8.6 9.5 9.5-5.2.9-8.6 4.3-9.5 9.5-.9-5.2-4.3-8.6-9.5-9.5 5.2-.9 8.6-4.3 9.5-9.5Z" fill="var(--mk-2)"/><circle cx="12" cy="12" r="1.4" fill="var(--mk-core)"/>`, css: `.a1{animation:mk-twinkle 2.8s ease-in-out infinite}` },
    { id: 'aperture', name: '렌즈 조리개', svg: `<circle cx="12" cy="12" r="9.5" fill="none" stroke="var(--mk-1)" stroke-width="1.3"/><g class="a1" fill="none" stroke="var(--mk-2)" stroke-width="1.2" stroke-linecap="round"><path d="M12 4.5v6M18.5 8.3l-5.2 3M18.5 15.7l-5.2-3M12 19.5v-6M5.5 15.7l5.2-3M5.5 8.3l5.2 3"/></g><circle cx="12" cy="12" r="1.5" fill="var(--mk-core)"/>`, css: `.a1{animation:mk-aperture 4s ease-in-out infinite}` },
    { id: 'blob', name: '유동 방울', svg: `${G('gbl')}<path class="a1" d="M12 3c4 0 7 3 7 7 0 5-3 11-7 11S5 15 5 10c0-4 3-7 7-7Z" fill="url(#gbl)"/>`, css: `.a1{animation:mk-blob 5s ease-in-out infinite}` },
    { id: 'constellation', name: '별자리', svg: `<g stroke="var(--mk-1)" stroke-width="1" fill="none"><path class="a1" d="M4 16 10 6"/><path class="a2" d="M10 6l8 3"/><path class="a3" d="M18 9l-4 10"/></g><g fill="var(--mk-core)"><circle cx="4" cy="16" r="1.4"/><circle cx="10" cy="6" r="1.6"/><circle cx="18" cy="9" r="1.3"/><circle cx="14" cy="19" r="1.5"/></g>`, css: `.a1{animation:mk-fade 3s ease-in-out infinite}.a2{animation:mk-fade 3s ease-in-out 1s infinite}.a3{animation:mk-fade 3s ease-in-out 2s infinite}` },
    { id: 'aurora', name: '오로라 링', svg: `<defs><linearGradient id="ga" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="var(--mk-1)"/><stop offset=".5" stop-color="var(--mk-2)"/><stop offset="1" stop-color="#6fd39a"/></linearGradient></defs><circle class="a1" cx="12" cy="12" r="8.5" fill="none" stroke="url(#ga)" stroke-width="2.4" stroke-dasharray="30 12"/><circle cx="12" cy="12" r="2" fill="var(--mk-core)"/>`, css: `.a1{animation:mk-spin 10s linear infinite,mk-hue 8s linear infinite}` },
    { id: 'comet', name: '혜성', svg: `<circle cx="12" cy="12" r="1.8" fill="var(--mk-core)" opacity=".7"/><g class="a1"><path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" fill="none" stroke="var(--mk-1)" stroke-width="2.2" stroke-linecap="round" opacity=".9"/><path d="M12 2.5a9.5 9.5 0 0 0-9.5 9.5" fill="none" stroke="var(--mk-1)" stroke-width="1.2" stroke-linecap="round" opacity=".25"/><circle cx="21.5" cy="12" r="1.9" fill="var(--mk-2)"/></g>`, css: `.a1{animation:mk-spin 2.8s cubic-bezier(.5,.1,.5,.9) infinite}` },
    { id: 'pendulum', name: '진자', svg: `<path d="M4 4h16" stroke="var(--mk-dim)" stroke-width="1.2" stroke-linecap="round"/><g class="a1"><path d="M12 4v11" stroke="var(--mk-1)" stroke-width="1.2"/><circle cx="12" cy="17.5" r="3" fill="var(--mk-2)"/></g>`, css: `.a1{transform-origin:12px 4px;animation:mk-swing 2.2s ease-in-out infinite}` },
    { id: 'pulse', name: '심장 박동', svg: `<path class="a1" d="M2 12h4l2-5 3 10 3-8 2 3h6" fill="none" stroke="var(--mk-1)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="60" />`, css: `.a1{animation:mk-draw 2.4s linear infinite}` },
    { id: 'dna', name: '이중 나선', svg: `<g class="a1"><path d="M6 3c0 6 12 6 12 12s-12 6-12 6" fill="none" stroke="var(--mk-1)" stroke-width="1.4"/><path d="M18 3c0 6-12 6-12 12s12 6 12 6" fill="none" stroke="var(--mk-2)" stroke-width="1.4"/><path d="M7.5 6.5h9M7.5 17.5h9M9 12h6" stroke="var(--mk-dim)" stroke-width="1"/></g>`, css: `.a1{animation:mk-flip 6s linear infinite}` },
    { id: 'cube', name: '회전 육각', svg: `<g class="a1"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9Z" fill="none" stroke="var(--mk-1)" stroke-width="1.3"/><path d="M12 3v9m0 0l7.8 4.5M12 12l-7.8 4.5" stroke="var(--mk-2)" stroke-width="1" opacity=".7"/></g>`, css: `.a1{animation:mk-spin 16s linear infinite}` },
    { id: 'wave', name: '물결', svg: `<g class="a1"><path d="M-12 12c3-4 6-4 9 0s6 4 9 0 6-4 9 0 6 4 9 0 6-4 9 0" fill="none" stroke="var(--mk-1)" stroke-width="1.5"/><path d="M-12 16c3-4 6-4 9 0s6 4 9 0 6-4 9 0 6 4 9 0 6-4 9 0" fill="none" stroke="var(--mk-2)" stroke-width="1.2" opacity=".6"/></g><circle cx="12" cy="8" r="1.6" fill="var(--mk-core)"/>`, css: `.a1{animation:mk-slide 3s linear infinite}` },
    { id: 'gem', name: '보석', svg: `${G('gg', '#c9b8ff', '#8fa8ff')}<path class="a1" d="M12 2.5 20 9l-8 12.5L4 9z" fill="url(#gg)" opacity=".9"/><path d="M4 9h16M12 2.5 8 9l4 12.5L16 9z" fill="none" stroke="#0a0c14" stroke-width=".8" opacity=".6"/>`, css: `.a1{animation:mk-shine 3.6s ease-in-out infinite}` },
    { id: 'still', name: '정지(움직임 없음)', svg: `<circle cx="12" cy="12" r="9" fill="none" stroke="var(--mk-1)" stroke-width="1.5"/><circle cx="12" cy="12" r="2.4" fill="var(--mk-core)"/>`, css: `` },
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
    { id: 'segoe-display', name: 'Segoe UI Variable Display', css: `font-family:"Segoe UI Variable Display","Segoe UI",sans-serif;font-weight:600;letter-spacing:.18em;font-size:15px` },
    { id: 'bodoni', name: 'Bodoni MT', css: `font-family:"Bodoni MT","Bodoni 72",Didot,serif;font-weight:600;letter-spacing:.2em;font-size:19px` },
    { id: 'bahnschrift', name: 'Bahnschrift', css: `font-family:Bahnschrift,sans-serif;font-weight:600;letter-spacing:.22em;font-size:15px` },
    { id: 'bahnschrift-light', name: 'Bahnschrift Light 넓게', css: `font-family:"Bahnschrift Light",Bahnschrift,sans-serif;font-weight:300;letter-spacing:.38em;font-size:16px` },
    { id: 'century', name: 'Century Gothic', css: `font-family:"Century Gothic",sans-serif;font-weight:700;letter-spacing:.2em;font-size:15px` },
    { id: 'sitka', name: 'Sitka Display', css: `font-family:"Sitka Display",serif;font-weight:600;letter-spacing:.14em;font-size:17px` },
    { id: 'georgia-i', name: 'Georgia 이탤릭', css: `font-family:Georgia,serif;font-style:italic;font-weight:500;letter-spacing:.12em;font-size:17px` },
    { id: 'cascadia', name: 'Cascadia Code', css: `font-family:"Cascadia Code",Consolas,monospace;font-weight:600;letter-spacing:.16em;font-size:15px` },
    { id: 'segoe-light', name: 'Segoe UI Light 넓게', css: `font-family:"Segoe UI Light","Segoe UI",sans-serif;font-weight:300;letter-spacing:.34em;font-size:16px` },
    { id: 'corbel', name: 'Corbel', css: `font-family:Corbel,sans-serif;font-weight:700;letter-spacing:.2em;font-size:15px` },
    { id: 'franklin', name: 'Franklin Gothic', css: `font-family:"Franklin Gothic Medium",sans-serif;letter-spacing:.24em;font-size:15px` },
    { id: 'garamond', name: 'Garamond', css: `font-family:Garamond,serif;font-weight:700;letter-spacing:.18em;font-size:18px` },
    { id: 'noto', name: 'Noto Sans KR 800', css: `font-family:"Noto Sans KR",sans-serif;font-weight:800;letter-spacing:.2em;font-size:15px` },
    { id: 'palatino-sc', name: 'Palatino 스몰캡', css: `font-family:"Palatino Linotype",serif;font-weight:600;letter-spacing:.16em;font-size:17px;font-variant:small-caps` },
    { id: 'trebuchet', name: 'Trebuchet MS', css: `font-family:"Trebuchet MS",sans-serif;font-weight:700;letter-spacing:.2em;font-size:15px` },
    { id: 'candara', name: 'Candara', css: `font-family:Candara,sans-serif;font-weight:700;letter-spacing:.22em;font-size:16px` },
    { id: 'bookantiqua', name: 'Book Antiqua', css: `font-family:"Book Antiqua",serif;font-weight:700;letter-spacing:.16em;font-size:17px` },
    { id: 'lucida', name: 'Lucida Sans', css: `font-family:"Lucida Sans","Lucida Sans Unicode",sans-serif;font-weight:600;letter-spacing:.24em;font-size:14px` },
    { id: 'verdana', name: 'Verdana', css: `font-family:Verdana,sans-serif;font-weight:700;letter-spacing:.2em;font-size:14px` },
    { id: 'impact', name: 'Impact', css: `font-family:Impact,sans-serif;letter-spacing:.14em;font-size:17px` },
    { id: 'segoe-script', name: 'Segoe Script', css: `font-family:"Segoe Script",cursive;font-weight:700;letter-spacing:.06em;font-size:17px` },
    { id: 'malgun', name: '맑은 고딕', css: `font-family:"Malgun Gothic","맑은 고딕",sans-serif;font-weight:700;letter-spacing:.2em;font-size:15px` },
    { id: 'consolas', name: 'Consolas', css: `font-family:Consolas,monospace;font-weight:700;letter-spacing:.2em;font-size:15px` },
    { id: 'tahoma', name: 'Tahoma', css: `font-family:Tahoma,sans-serif;font-weight:700;letter-spacing:.22em;font-size:14px` },
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
    { id: 'off', name: '없음', desc: '애니메이션 끔(성능 최소)' },
  ];
  return { MARKS, MARK_KEYFRAMES, FONTS, THEMES, STAGES };
})();
