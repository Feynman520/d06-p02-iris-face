// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 첫 실행 튜토리얼(v2.90, 2026-10-19 사용자 결정): AI 첫 세션 자동 시작을 없애고, 미리 써 둔 글·그림으로만 진행한다(AI 호출 0).
   흐름 = 연수 「교사를 위한 에이전트」 1편: ⓪ 환영 → ① 에이전트란 → ② 일을 잘하게 하는 3가지 → ③ 온톨로지 R/D/P → ④ 내 폴더 만들기
   → ⑤ 레퍼런스 → ⑥ 도구 → ⑦ 사용법 → ⑧ 마무리(「첫 대화 해 보기」는 사용자가 누를 때만, 보내기도 사용자).
   관통 비유 = 두뇌+팔다리=몸(에이전트) · 전입 첫날(학교 지도와 내 책상 / 작년 서류철 / 팔다리). 그림은 테마 색을 따르는 선 그림(SVG).
   데몬: GET /api/tutorial · POST /api/tutorial/{plan,structure,done} · POST /api/open-folder · GET /api/tools · GET /api/relay/ready. 설계 = docs\설계-튜토리얼-2026-10-19.md */
window.Tutorial = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let opts = { onFirstChat: () => {}, onClose: () => {} };
  let step = 0, info = null, autoShown = false, created = [], tools = null, planTimer = 0, lastPlan = null;
  const form = { role: { ko: '', en: '' }, domains: [{ ko: '', en: '', projects: [] }] };
  const el = () => $('#tutorial');
  const isOpen = () => !!el() && !el().hidden;

  // ---------- 그림(선 그림 SVG — 색은 테마 변수: 선 = --ink-3, 강조 = --iris, 면 = --raised) ----------
  const S = (inner, vb = '0 0 440 300') => `<svg class="tu-art-svg" viewBox="${vb}" role="img" aria-hidden="true">${inner}</svg>`;
  const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" class="tu-t${o.c ? ' ' + o.c : ''}" text-anchor="${o.a || 'middle'}"${o.size ? ` font-size="${o.size}"` : ''}>${esc(s)}</text>`;
  // 두뇌 = 타원 + 가운데 홈 + 주름 두 줄(단순한 아이콘)
  const brain = (cx, cy, r = 26) => `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * .8}" class="tu-acc"/><path class="tu-acc thin" d="M${cx} ${cy - r * .8}v${r * 1.6}M${cx - r * .62} ${cy - r * .2}q${r * .3} ${r * .25} 0 ${r * .5}M${cx + r * .62} ${cy - r * .2}q-${r * .3} ${r * .25} 0 ${r * .5}"/>`;
  const fileIc = (x, y, label, acc) => `<g transform="translate(${x} ${y})"><path class="${acc ? 'tu-acc' : 'tu-ln'}" d="M0 0h34l12 12v46H0z"/><path class="tu-ln thin" d="M34 0v12h12M8 24h28M8 33h28M8 42h20"/>${T(23, 76, label, { size: 11 })}</g>`;
  const ART = {
    welcome: S(`<circle cx="220" cy="150" r="96" class="tu-ln thin dash"/><circle cx="220" cy="150" r="62" class="tu-ln thin"/>
      ${[[220, 54], [316, 150], [124, 150], [286, 82], [154, 218], [262, 236]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 2 ? 3 : 5}" class="tu-dot"/>`).join('')}
      <path class="tu-acc" d="M220 112l32 18v38l-32 18-32-18v-38z M188 130l32 18 32-18 M220 148v38"/>${T(220, 290, '설치 · 로그인 완료 → 이제 쓰는 법만 남았습니다', { size: 13, c: 'dim' })}`),
    agent: S(`<rect x="40" y="50" width="130" height="150" rx="40" class="tu-ln"/><path class="tu-ln thin" d="M58 50h94"/>${brain(105, 125, 28)}
      <path class="tu-ln" d="M150 70h70a10 10 0 0 1 10 10v24a10 10 0 0 1-10 10h-44l-12 12v-12h-14z"/>${T(193, 99, '이렇게 하세요', { size: 11 })}
      ${T(105, 232, '말해 주는 AI(챗봇)', { size: 13 })}
      ${brain(330, 74, 24)}<path class="tu-acc" d="M330 100v70M330 120l-36 26M330 120l40 18M330 170l-26 46M330 170l26 46"/>
      <g transform="translate(372 120)"><path class="tu-acc" d="M0 0h30l8 8v36H0z"/><path class="tu-acc thin" d="M7 20l7 7 14-14"/></g>
      ${T(330, 252, '해 주는 AI(에이전트)', { size: 13, c: 'acc' })}${T(330, 272, '두뇌 + 팔다리 = 몸', { size: 11, c: 'dim' })}`),
    three: S(`${[['학교 지도와 내 책상', '온톨로지', 'M-22 -14h44v28h-44z M-22 -4h44 M-6 -14v28'], ['작년 서류철', '레퍼런스', 'M-18 -20h30l8 8v32h-38z M-10 -4h22 M-10 4h22 M-10 12h14'], ['팔다리', '도구', 'M-8 -22v14 M8 -22v14 M-16 -8h32v10a16 16 0 0 1-32 0z M0 18v8']]
      .map(([sub, name, d], i) => { const x = 80 + i * 140; return `<rect x="${x - 58}" y="70" width="116" height="150" rx="16" class="tu-ln"/><g transform="translate(${x} 122)"><path class="tu-acc" d="${d}"/></g>${T(x, 180, name, { size: 15, c: 'acc' })}${T(x, 202, sub, { size: 11, c: 'dim' })}`; }).join('')}
      ${T(220, 40, '전입 첫날, 똑똑한 선생님도 헤맵니다', { size: 13 })}${T(220, 258, '이 세 가지를 갖추면 처음 온 곳에서도 일을 잘합니다', { size: 11, c: 'dim' })}`),
    rdp: S(`${[['IRIS', 24, 20, 'root'], ['R01-교사', 56, 70, 'R'], ['D01-수업', 96, 120, 'D'], ['P01-물리학 〖2026년.2학기〗', 136, 170, 'P'], ['D02-담임', 96, 220, 'D'], ['P01-담임 〖2026년 1학년 3반〗', 136, 270, 'P']]
      .map(([t, x, y, lv]) => `<g transform="translate(${x} ${y})"><path class="${lv === 'root' ? 'tu-ln' : 'tu-acc'}" d="M0 -9h10l4 4h18v18H0z"/>${T(40, 5, t, { a: 'start', size: 13 })}${lv !== 'root' ? `<g transform="translate(${t.length * 9 + 58} -10)"><path class="tu-ln thin" d="M0 0h16l5 5v15H0z M4 9h12 M4 14h8"/>${T(28, 14, 'AGENTS.md', { a: 'start', size: 10, c: 'dim' })}</g>` : ''}</g>`).join('')}
      <path class="tu-ln thin" d="M33 32v38h18M65 82v38h26M105 132v38h26M65 82v138h26M105 232v38h26"/>
      <path class="tu-acc thin" d="M408 50v200"/><path class="tu-acc" d="M400 240l8 12 8-12"/>${T(398, 150, '규칙이 아래로', { a: 'end', size: 11, c: 'acc' })}`),
    reference: S(`${fileIc(30, 60, '작년 계획서', 1)}${fileIc(90, 60, '양식')}${fileIc(150, 60, '좋은 예시')}
      <rect x="20" y="40" width="190" height="110" rx="12" class="tu-ln thin dash"/>${T(115, 172, '프로젝트 폴더에 넣어 두기', { size: 11, c: 'dim' })}
      <path class="tu-acc" d="M222 96h46M260 88l10 8-10 8"/>${brain(312, 88, 20)}<path class="tu-acc" d="M312 108v40M312 120l-22 16M312 120l22 16"/>
      <g transform="translate(360 64)"><path class="tu-acc" d="M0 0h34l12 12v46H0z"/><path class="tu-acc thin" d="M8 24h28M8 33h28M8 42h20"/></g>${T(383, 140, '같은 모양으로', { size: 11, c: 'acc' })}
      ${T(220, 230, '말로 100번 설명하는 것보다', { size: 14 })}${T(220, 254, '작년 파일 1개가 낫습니다', { size: 14, c: 'acc' })}`),
    tools: S(`${brain(220, 70, 22)}<path class="tu-acc" d="M220 92v60M220 110l-30 22M220 110l30 22M220 152l-20 36M220 152l20 36"/>
      ${[['한글(HWP)', 70, 80], ['엑셀·워드', 60, 170], ['PDF', 110, 250], ['구글 드라이브', 370, 80], ['인터넷 검색', 380, 170], ['메일', 330, 250]]
      .map(([t, x, y]) => `<rect x="${x - 46}" y="${y - 16}" width="92" height="32" rx="9" class="tu-ln"/>${T(x, y + 5, t, { size: 12 })}<path class="tu-ln thin dash" d="M${x < 220 ? x + 46 : x - 46} ${y}L${x < 220 ? 192 : 248} ${y < 120 ? 120 : 150}"/>`).join('')}
      <g transform="translate(211 242)"><path class="tu-acc" d="M4 0v8M14 0v8M0 8h18v6a9 9 0 0 1-18 0z"/></g>${T(220, 288, 'MCP = 에이전트용 콘센트', { size: 11, c: 'acc' })}`),
    usage: S(`<rect x="10" y="10" width="420" height="270" rx="12" class="tu-ln"/><path class="tu-ln thin" d="M10 40h420M120 40v240"/>
      ${[0, 1, 2].map(i => `<rect x="20" y="${52 + i * 34}" width="90" height="26" rx="6" class="${i === 0 ? 'tu-fill' : 'tu-ln thin'}"/>`).join('')}
      <rect x="140" y="56" width="270" height="60" rx="8" class="tu-ln thin"/><rect x="140" y="128" width="200" height="44" rx="8" class="tu-ln thin"/>
      <rect x="140" y="184" width="270" height="44" rx="8" class="tu-acc"/>${T(275, 211, '확인 카드: 1 허락 · 2 거절', { size: 11, c: 'acc' })}
      <rect x="140" y="240" width="270" height="28" rx="8" class="tu-ln"/>${T(150, 259, '폴더 · Claude/Codex · 요청…', { a: 'start', size: 11, c: 'dim' })}
      <path class="tu-ln thin" d="M340 25h40M392 25h26"/>
      ${[[24, 104, 1], [126, 254, 2], [134, 196, 3], [360, 48, 4], [404, 18, 5], [228, 144, 6]].map(([x, y, n]) => `<circle cx="${x}" cy="${y}" r="10" class="tu-num"/>${T(x, y + 4, String(n), { size: 11, c: 'num' })}`).join('')}`),
    finish: S(`${[['온톨로지', '내 폴더 구조를 만들었습니다'], ['레퍼런스', '자료를 폴더에 넣는 법을 알았습니다'], ['도구', '에이전트의 팔다리를 알았습니다']]
      .map(([a, b], i) => `<g transform="translate(70 ${70 + i * 66})"><circle cx="0" cy="0" r="16" class="tu-acc"/><path class="tu-acc" d="M-7 0l5 5 9-10"/>${T(32, -2, a, { a: 'start', size: 15, c: 'acc' })}${T(32, 18, b, { a: 'start', size: 12, c: 'dim' })}</g>`).join('')}`),
  };

  // ---------- 장면 글(본문 4줄 + 접는 「더 알아보기」) ----------
  const SCENES = [
    { id: 'welcome', label: '시작', title: 'IRIS에 오신 것을 환영합니다', art: 'welcome',
      body: ['설치와 로그인이 모두 끝났습니다.', '이제 5분 동안 <b>에이전트가 무엇인지</b>, 일을 잘 시키려면 <b>무엇이 필요한지</b> 알아보고 <b>내 폴더</b>를 만들어 보겠습니다.', '이 안내는 AI가 아니라 미리 준비된 화면이라, 인터넷 상태와 상관없이 그대로 진행됩니다.'],
      more: '언제든 「나중에 하기」로 닫을 수 있고, 설정 → 업데이트·정보 → 「튜토리얼 다시 보기」로 다시 열 수 있습니다.' },
    { id: 'agent', label: '에이전트', title: '말해 주는 AI와 해 주는 AI', art: 'agent',
      body: ['챗봇은 물으면 <b>답을 말해</b> 줍니다. 할 일은 여전히 내 몫입니다.', '에이전트는 목표를 주면 <b>스스로 계획하고, 도구로 직접 하고, 확인까지</b> 합니다.', '두뇌(AI 모델)에 팔다리(도구)를 붙인 <b>몸</b>이라고 생각하면 쉽습니다.'],
      more: '에이전트는 <b>생각 → 행동 → 확인</b>을 되풀이합니다. 파일을 지우거나 밖으로 보내는 것처럼 중요한 일은 먼저 <b>허락을 물어봅니다</b>(IRIS 화면의 확인 카드). IRIS에서는 Claude(클로드 코드)와 Codex(코덱스) 두 에이전트를 함께 쓸 수 있습니다.' },
    { id: 'three', label: '3가지', title: '일을 잘하게 하는 3가지', art: 'three',
      body: ['다른 학교로 옮긴 첫날을 떠올려 보세요. 아무리 똑똑해도 처음엔 헤맵니다.', '<b>온톨로지</b> = 학교 지도와 내 책상(폴더 구조와 규칙 메모)', '<b>레퍼런스</b> = 작년 서류철(참고할 파일)', '<b>도구</b> = 팔다리(한글·엑셀·구글 같은 프로그램을 다루는 능력)'],
      more: '에이전트도 똑같습니다. 이 세 가지를 갖춰 주면 처음 맡기는 일도 내가 원하는 모양으로 해냅니다. 다음 장면부터 하나씩 살펴봅니다.' },
    { id: 'rdp', label: '온톨로지', title: '온톨로지: 역할 → 영역 → 프로젝트', art: 'rdp',
      body: ['<b>R 역할</b>: 나는 누구로 일하나(예: 교사)', '<b>D 영역</b>: 계속 관리하는 분야(예: 수업, 담임)', '<b>P 프로젝트</b>: 끝이 있는 구체적인 일(예: 물리학 2026년 2학기)', '폴더마다 <b>규칙 메모(AGENTS.md)</b>가 있고, 위 폴더의 규칙은 아래 폴더로 물려 내려갑니다.'],
      more: '에이전트를 어떤 폴더에서 부르면, 그 폴더와 위 폴더들의 규칙 메모를 먼저 읽고 일합니다. 그래서 "담임 일은 이렇게", "이 과목 세특은 이런 문체로" 같은 규칙을 한 번만 적어 두면 계속 지켜집니다. 폴더 이름은 <code>R01-교사(Teacher)</code>처럼 <b>번호-한글(영어)</b> 모양으로 씁니다.' },
    { id: 'build', label: '내 폴더', title: '내 폴더 구조 만들기', custom: true },
    { id: 'reference', label: '레퍼런스', title: '레퍼런스: 작년 파일 1개의 힘', art: 'reference', custom: 'ref',
      body: ['방금 만든 프로젝트 폴더에 <b>작년 계획서, 양식, 좋은 예시</b>를 넣어 두세요.', '에이전트는 그 파일을 보고 <b>같은 모양</b>으로 새 문서를 만듭니다.', '학생 개인정보처럼 민감한 자료는 꼭 필요한 것만 넣으세요.'],
      more: '말로 길게 설명하는 것보다 실제 파일 하나가 훨씬 정확합니다. 한글(HWP)·엑셀·PDF·사진 모두 넣을 수 있습니다. 넣은 뒤 에이전트에게 "이 폴더의 작년 계획서를 참고해서 올해 것을 만들어 줘"처럼 부탁하면 됩니다.' },
    { id: 'tools', label: '도구', title: '도구: 에이전트의 팔다리', art: 'tools', custom: 'tools',
      body: ['파일 읽고 쓰기, 명령 실행, 인터넷 검색은 기본으로 할 수 있습니다.', '<b>MCP</b>는 에이전트용 콘센트입니다. 꽂으면 한글·엑셀·구글 드라이브 같은 프로그램을 직접 다룹니다.', '<b>스킬</b>은 정해진 일을 잘하는 요령을 묶어 둔 설명서입니다.'],
      more: '어떤 도구가 있는지는 설정 → 「도구」 탭에서 언제든 볼 수 있습니다. 민감한 자료는 인터넷으로 보내지 않고 이 컴퓨터 안에서만 처리하는 도구를 고를 수도 있습니다.' },
    { id: 'usage', label: '사용법', title: 'IRIS 화면 사용법', art: 'usage',
      body: ['<b>① 작업목록</b>: 열린 대화들. 이름에 마우스를 올리면 연필로 이름을 바꿀 수 있습니다.', '<b>② 새 요청</b>: 폴더를 고르고 → Claude/Codex와 모델을 고르고 → 요청을 적어 보냅니다.', '<b>③ 확인 카드</b>: 중요한 일 전에 허락을 묻습니다. 숫자(1, 2…)나 단추로 답합니다.', '<b>④ 대화/터미널</b> 전환 · <b>⑤ 설정(⚙)</b>과 사용량 · <b>⑥ Esc</b> = 하던 일 멈추기'],
      more: '요청은 길게 쓰지 않아도 됩니다. "무엇을, 어떤 모양으로" 두 가지만 분명하면 충분합니다. 작업이 끝나면 창 오른쪽 아래에 알림이 뜹니다. 설정에서 디자인·권한·알림·온톨로지(폴더 지도)·도구를 볼 수 있습니다.' },
    { id: 'finish', label: '마무리', title: '준비가 끝났습니다', art: 'finish', custom: 'finish',
      body: ['이제 폴더를 골라 첫 요청을 보내 보세요.', '「첫 대화 해 보기」를 누르면 방금 만든 폴더와 예시 요청이 채워집니다. <b>보내기는 직접</b> 누르면 됩니다.'],
      more: '튜토리얼은 설정 → 업데이트·정보 → 「튜토리얼 다시 보기」에서 언제든 다시 볼 수 있습니다.' },
  ];

  // ---------- 내 폴더 만들기(질문·답 — 기계가 번호를 매기고 이름 규칙을 지킨다) ----------
  const ROLES = [['교사', 'Teacher'], ['연구자', 'Researcher'], ['개발자', 'Developer'], ['직장인', 'Office Worker'], ['학생', 'Student']];
  const SUGGEST = {
    교사: [['수업', 'Teaching'], ['담임', 'Homeroom'], ['업무', 'School Affairs'], ['연수', 'Training']],
    연구자: [['연구', 'Research'], ['논문', 'Papers'], ['과제', 'Grants'], ['학회', 'Conferences']],
    개발자: [['제품', 'Products'], ['오픈소스', 'Open Source'], ['공부', 'Learning']],
    직장인: [['업무', 'Work'], ['보고서', 'Reports'], ['회의', 'Meetings'], ['자기계발', 'Self-Development']],
    학생: [['수업', 'Classes'], ['과제', 'Assignments'], ['진로', 'Career']],
  };
  const FOLDER = '<svg class="tu-fic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v10h-17z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'; // 이모지 대신 선 아이콘
  const periods = () => { const y = info?.year || new Date().getFullYear(); return ['', `${y}년`, `${y}년.1학기`, `${y}년.2학기`, `${y + 1}년`]; };
  const inp = (k, v, ph, cls = '') => `<input class="tu-in ${cls}" data-k="${k}" value="${esc(v)}" placeholder="${esc(ph)}" maxlength="${cls.includes('en') ? 40 : 30}" spellcheck="false" autocomplete="off">`;
  function buildHtml() {
    const sug = SUGGEST[form.role.ko] || [];
    const dRows = form.domains.map((d, i) => `<div class="tu-d"><div class="tu-row"><span class="tu-code">D${String(i + 1).padStart(2, '0')}</span>${inp(`d.${i}.ko`, d.ko, '영역 이름(예: 수업)')}${inp(`d.${i}.en`, d.en, 'English (선택)', 'en')}<button class="tu-x" data-act="rm-d" data-i="${i}" title="이 영역 빼기">×</button></div>
      ${d.projects.map((p, j) => `<div class="tu-row tu-p"><span class="tu-code">P${String(j + 1).padStart(2, '0')}</span>${inp(`p.${i}.${j}.ko`, p.ko, '프로젝트(예: 물리학)')}${inp(`p.${i}.${j}.en`, p.en, 'English (선택)', 'en')}<select class="tu-in tu-sel" data-k="p.${i}.${j}.period">${periods().map(o => `<option value="${esc(o)}"${o === (p.period || '') ? ' selected' : ''}>${o ? esc(o) : '기간 없음'}</option>`).join('')}</select><button class="tu-x" data-act="rm-p" data-i="${i}" data-j="${j}" title="이 프로젝트 빼기">×</button></div>`).join('')}
      ${d.projects.length < 5 ? `<button class="tu-add tu-add-p" data-act="add-p" data-i="${i}">+ 프로젝트</button>` : ''}</div>`).join('');
    return `<div class="tu-build"><div class="tu-q">
      <h4><span class="tu-qn">1</span><span>어떤 <b>역할</b>로 일하시나요?</span></h4>
      <div class="tu-chips">${ROLES.map(([k, e]) => `<button class="tu-chip${form.role.ko === k ? ' cur' : ''}" data-act="role" data-ko="${k}" data-en="${e}">${k}</button>`).join('')}</div>
      <div class="tu-row"><span class="tu-code">R</span>${inp('r.ko', form.role.ko, '역할 이름(직접 적어도 됩니다)')}${inp('r.en', form.role.en, 'English (선택)', 'en')}</div>
      <h4><span class="tu-qn">2</span><span>계속 관리하는 <b>영역</b>은 무엇인가요?</span> <small>최대 5개</small></h4>
      ${sug.length ? `<div class="tu-chips">${sug.map(([k, e]) => `<button class="tu-chip${form.domains.some(d => d.ko === k) ? ' cur' : ''}" data-act="sug" data-ko="${k}" data-en="${e}">+ ${k}</button>`).join('')}</div>` : ''}
      <h4 class="tu-h3"><span class="tu-qn">3</span><span>영역마다 지금 하는 <b>프로젝트</b>를 적어 주세요</span> <small>없으면 비워 두세요</small></h4>
      <div class="tu-ds">${dRows}</div>
      ${form.domains.length < 5 ? '<button class="tu-add" data-act="add-d">+ 영역 추가</button>' : ''}
    </div><div class="tu-prev"><h4>미리보기</h4><div class="tu-tree" id="tu-tree"></div><div class="tu-errs" id="tu-errs"></div>
      <button class="tu-btn accent" id="tu-make" data-act="make">폴더 만들기</button><div class="tu-made" id="tu-made"></div>
      <p class="tu-note">번호와 괄호는 IRIS가 규칙대로 붙입니다. 이미 있는 폴더는 건드리지 않고 그 안에 더합니다.</p></div></div>`;
  }
  const specOf = () => ({ role: { ko: form.role.ko.trim(), en: form.role.en.trim() }, domains: form.domains.filter(d => d.ko.trim() || d.projects.some(p => p.ko.trim())).map(d => ({ ko: d.ko.trim(), en: d.en.trim(), projects: d.projects.filter(p => p.ko.trim()).map(p => ({ ko: p.ko.trim(), en: p.en.trim(), period: p.period || '' })) })) });
  async function refreshPlan() {
    const tree = $('#tu-tree'), errs = $('#tu-errs'); if (!tree) return;
    const spec = specOf();
    if (!spec.role.ko && !spec.domains.length) { tree.innerHTML = '<div class="tu-dim">왼쪽 질문에 답하면 만들어질 폴더가 여기 보입니다.</div>'; errs.innerHTML = ''; lastPlan = null; return; }
    let r; try { r = await (await fetch('/api/tutorial/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec }) })).json(); } catch { r = null; }
    if (!r) { errs.textContent = '미리보기를 불러오지 못했습니다.'; return; }
    lastPlan = r;
    if (!r.ok) { errs.innerHTML = r.errors.map(e => `<div>· ${esc(e.message)}</div>`).join(''); tree.innerHTML = tree.innerHTML || ''; return; }
    errs.innerHTML = '';
    tree.innerHTML = `<div class="tu-node root">${FOLDER}${esc(info?.rootName || 'IRIS')}</div>` + r.items.map(it => `<div class="tu-node lv-${it.level}${it.exists ? ' ex' : ''}">${FOLDER}<span>${esc(it.name)}</span>${it.exists ? '<small>이미 있음</small>' : ''}</div>`).join('');
  }
  const schedulePlan = () => { clearTimeout(planTimer); planTimer = setTimeout(refreshPlan, 220); };
  async function make() {
    const btn = $('#tu-make'), out = $('#tu-made'); const spec = specOf();
    btn.disabled = true; btn.textContent = '만드는 중…'; out.textContent = '';
    let r; try { const res = await fetch('/api/tutorial/structure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec }) }); r = await res.json(); } catch (e) { r = { ok: false, errors: [{ message: e.message }] }; }
    btn.disabled = false; btn.textContent = '폴더 만들기';
    if (!r.ok) { $('#tu-errs').innerHTML = (r.errors || []).map(e => `<div>· ${esc(e.message)}</div>`).join(''); return; }
    created = r.items.filter(it => it.level !== 'R');
    const g = r.ontology; const gNote = !g || !g.ran ? '' : g.ok ? ' 폴더 지도(온톨로지)도 새로 그렸습니다.' : ' 폴더 지도는 다음 정리 때 갱신됩니다.';
    out.innerHTML = `<b>완료 — 새 폴더 ${r.created.length}개를 만들었습니다</b>${r.kept.length ? ` · 이미 있던 ${r.kept.length}개는 그대로` : ''}.${gNote}`;
    refreshPlan();
  }
  function bindBuild(root) {
    root.addEventListener('input', (e) => {
      const k = e.target.dataset?.k; if (!k) return; const v = e.target.value; const a = k.split('.');
      if (a[0] === 'r') form.role[a[1]] = v;
      else if (a[0] === 'd') form.domains[+a[1]][a[2]] = v;
      else if (a[0] === 'p') form.domains[+a[1]].projects[+a[2]][a[3]] = v;
      if (k === 'r.ko') { root.querySelectorAll('[data-act="role"]').forEach(b => b.classList.toggle('cur', b.dataset.ko === v)); }
      schedulePlan();
    });
    root.addEventListener('change', (e) => { if (e.target.dataset?.k) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act; const i = +b.dataset.i, j = +b.dataset.j;
      if (act === 'make') return make();
      if (act === 'role') { form.role = { ko: b.dataset.ko, en: b.dataset.en }; }
      else if (act === 'sug') { const ex = form.domains.findIndex(d => d.ko === b.dataset.ko); if (ex >= 0) form.domains.splice(ex, 1); else { const empty = form.domains.findIndex(d => !d.ko.trim() && !d.projects.length); if (empty >= 0) form.domains[empty] = { ko: b.dataset.ko, en: b.dataset.en, projects: [] }; else if (form.domains.length < 5) form.domains.push({ ko: b.dataset.ko, en: b.dataset.en, projects: [] }); } if (!form.domains.length) form.domains.push({ ko: '', en: '', projects: [] }); }
      else if (act === 'add-d') form.domains.push({ ko: '', en: '', projects: [] });
      else if (act === 'rm-d') { form.domains.splice(i, 1); if (!form.domains.length) form.domains.push({ ko: '', en: '', projects: [] }); }
      else if (act === 'add-p') form.domains[i].projects.push({ ko: '', en: '', period: '' });
      else if (act === 'rm-p') form.domains[i].projects.splice(j, 1);
      else return;
      const host = $('.tu-q-host', el()); if (host) { host.innerHTML = buildHtml(); } schedulePlan();
    });
  }

  // ---------- 그리기 ----------
  const folderBtns = () => {
    const list = created.filter(it => it.level === 'P').length ? created.filter(it => it.level === 'P') : created;
    if (!list.length) return `<div class="tu-dim">아직 만든 폴더가 없습니다. 앞 장면에서 만들거나, IRIS 폴더를 열어 직접 넣어도 됩니다.</div><button class="tu-btn" data-open="">IRIS 폴더 열기</button>`;
    return list.slice(0, 6).map(it => `<button class="tu-btn sm" data-open="${esc(it.rel)}" title="${esc(it.rel)}">${FOLDER}${esc(it.name)}</button>`).join('');
  };
  function sceneHtml(sc) {
    if (sc.id === 'build') return `<div class="tu-text wide"><div class="tu-kicker">온톨로지 — 직접 해 보기</div><h2>${sc.title}</h2><p>세 가지 질문에 답하면 IRIS가 규칙에 맞는 폴더와 규칙 메모를 만들어 줍니다. 나중에 얼마든지 더하거나 고칠 수 있습니다.</p></div><div class="tu-q-host">${buildHtml()}</div>`;
    const more = sc.more ? `<details class="tu-more"><summary>더 알아보기</summary><p>${sc.more}</p></details>` : '';
    let extra = '';
    if (sc.custom === 'ref') extra = `<div class="tu-extra"><div class="tu-extra-h">자료를 넣을 폴더 열기</div><div class="tu-btns">${folderBtns()}</div></div>`;
    if (sc.custom === 'tools') extra = `<div class="tu-extra" id="tu-tools">${tools ? toolsLine() : '<div class="tu-dim">이 컴퓨터의 도구를 세는 중…</div>'}</div>`;
    if (sc.custom === 'finish') extra = finishHtml();
    return `<div class="tu-text"><div class="tu-kicker">${step}/${SCENES.length - 1} · ${esc(sc.label)}</div><h2>${sc.title}</h2>${sc.body.map(l => `<p>${l}</p>`).join('')}${more}${extra}</div><div class="tu-art">${ART[sc.art] || ''}</div>`;
  }
  const toolsLine = () => `<div class="tu-extra-h">이 컴퓨터에 있는 도구</div><div class="tu-stat"><span><b>${tools.counts.skills}</b> 스킬</span><span><b>${tools.counts.mcp}</b> MCP</span><span><b>${tools.counts.plugins}</b> 플러그인</span></div>
    <div class="tu-chips small">${[...new Set(tools.mcp.map(m => m.name))].slice(0, 8).map(n => `<span class="tu-chip ro">${esc(n)}</span>`).join('')}</div><div class="tu-dim">전체 목록 = 설정 → 「도구」 탭</div>`;
  function finishHtml() {
    const list = created.filter(it => it.level === 'P').length ? created.filter(it => it.level === 'P') : created;
    const lead = info?.leadAgent === 'codex' ? 'codex' : 'claude';
    return `<div class="tu-extra"><div class="tu-extra-h">첫 대화 해 보기</div>
      <div class="tu-row"><select class="tu-in tu-sel wide" id="tu-fc-folder">${list.length ? list.map(it => `<option value="${esc(it.rel)}">${esc(it.rel)}</option>`).join('') : `<option value="">${esc(info?.rootName || 'IRIS')} (전체 폴더)</option>`}</select>
      <select class="tu-in tu-sel" id="tu-fc-agent"><option value="claude"${lead === 'claude' ? ' selected' : ''}>Claude</option><option value="codex"${lead === 'codex' ? ' selected' : ''}>Codex</option></select></div>
      <div class="tu-btns"><button class="tu-btn accent" data-act="first">첫 대화 해 보기</button><button class="tu-btn" data-act="home">홈으로</button></div><div class="tu-made" id="tu-fc-msg"></div></div>`;
  }
  function render() {
    const root = el(); if (!root) return;
    const sc = SCENES[step];
    root.querySelector('.tu-steps').innerHTML = SCENES.map((s, i) => `<li class="${i === step ? 'cur' : i < step ? 'done' : ''}" data-go="${i}" title="${esc(s.label)}"><span>${i}</span><em>${esc(s.label)}</em></li>`).join('');
    const body = root.querySelector('.tu-body'); body.className = `tu-body sc-${sc.id}`; body.innerHTML = sceneHtml(sc); body.scrollTop = 0;
    root.querySelector('[data-nav="prev"]').hidden = step === 0;
    root.querySelector('[data-nav="next"]').hidden = step === SCENES.length - 1;
    root.querySelector('[data-nav="next"]').textContent = step === 0 ? '시작하기' : '다음';
    if (sc.id === 'build') { schedulePlan(); setTimeout(() => body.querySelector('[data-k="r.ko"]')?.focus(), 60); }
    if (sc.custom === 'tools' && !tools) fetch('/api/tools').then(r => r.json()).then(t => { tools = t; const h = $('#tu-tools'); if (h && t?.ok) h.innerHTML = toolsLine(); }).catch(() => { const h = $('#tu-tools'); if (h) h.innerHTML = '<div class="tu-dim">도구 목록을 읽지 못했습니다 — 설정 → 「도구」 탭에서 볼 수 있습니다.</div>'; });
  }
  const go = (n) => { step = Math.max(0, Math.min(SCENES.length - 1, n)); render(); };

  async function done(skipped) { try { await fetch('/api/tutorial/done', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skipped }) }); } catch {} }
  async function firstChat() {
    const rel = $('#tu-fc-folder')?.value || '', agent = $('#tu-fc-agent')?.value || 'claude', msg = $('#tu-fc-msg');
    // 세션은 사용자가 보낼 때 열린다 — 그 전에 이 에이전트의 연결(중계기)이 준비됐는지 확인한다(2026-10-19 신고: 준비 전 첫 요청이 "Reconnecting 5/5").
    for (let i = 0; ; i++) {
      let ready = true; try { ready = !!(await (await fetch(`/api/relay/ready?agent=${agent}`)).json()).ready; } catch { ready = true; }
      if (ready) break;
      if (!isOpen()) return;
      msg.innerHTML = `${agent === 'codex' ? 'Codex' : 'Claude'} 연결을 준비하고 있습니다… <small>처음 실행이면 1~2분 걸릴 수 있습니다.</small> <button class="tu-link" data-act="first-anyway">그래도 열기</button>`;
      if (msg.dataset.anyway === '1') break;
      await new Promise(r => setTimeout(r, 1500));
    }
    const full = (info?.root || '') + (rel ? '\\' + rel : '');
    const text = rel ? '이 폴더에서 무엇을 하면 좋을지 같이 정리해 줘. 먼저 폴더 안에 무엇이 있는지 보고, 할 일 목록을 제안해 줘.' : 'IRIS 폴더 구조를 보고, 내가 무엇부터 하면 좋을지 제안해 줘.';
    await done(false); close();
    try { opts.onFirstChat({ path: full, rel, name: rel ? rel.split('\\').pop() : (info?.rootName || 'IRIS'), agent, text }); } catch {}
  }

  function ensureDom() {
    if (el()) return;
    const d = document.createElement('div'); d.id = 'tutorial'; d.className = 'tu'; d.hidden = true;
    d.innerHTML = `<div class="tu-panel" role="dialog" aria-label="IRIS 시작하기"><div class="tu-head"><span class="tu-brand">IRIS 시작하기</span><ol class="tu-steps"></ol></div><div class="tu-body"></div>
      <div class="tu-foot"><button class="tu-btn ghost" data-nav="later">나중에 하기</button><span class="tu-gap"></span><button class="tu-btn" data-nav="prev">이전</button><button class="tu-btn accent" data-nav="next">다음</button></div></div>`;
    document.body.appendChild(d);
    // 튜토리얼 안의 키는 문서로 올려 보내지 않는다 — 확인 카드 1~9·단축키·Esc(작업 중단)가 입력칸 글자에 반응하지 않게
    d.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.matches?.('input')) e.preventDefault(); });
    bindBuild(d);
    d.addEventListener('click', async (e) => {
      const nav = e.target.closest('[data-nav]')?.dataset.nav;
      if (nav === 'next') return go(step + 1);
      if (nav === 'prev') return go(step - 1);
      if (nav === 'later') { await done(true); close(); try { Notify.push({ title: '튜토리얼은 언제든 다시 볼 수 있습니다', sub: '설정 → 업데이트·정보 → 「튜토리얼 다시 보기」', status: 'idle', force: true }); } catch {} return; }
      const g = e.target.closest('[data-go]'); if (g) return go(+g.dataset.go);
      const o = e.target.closest('[data-open]'); if (o) { try { await fetch('/api/open-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel: o.dataset.open }) }); } catch {} return; }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'first') return firstChat();
      if (a === 'first-anyway') { const m = $('#tu-fc-msg'); if (m) m.dataset.anyway = '1'; return; }
      if (a === 'home') { await done(false); close(); }
    });
  }
  async function open({ replay = false } = {}) {
    ensureDom();
    try { info = await (await fetch('/api/tutorial')).json(); } catch { info = info || {}; }
    if (replay) step = 0;
    el().hidden = false; document.body.classList.add('tu-open'); render();
  }
  function close() { const d = el(); if (d) d.hidden = true; document.body.classList.remove('tu-open'); try { opts.onClose(); } catch {} }
  /** 데몬 인수 정보(hello·방송)를 받을 때마다 — 설치·로그인이 끝났고 아직 안 한 PC 면 한 번 연다. */
  function maybeOpen(h) { if (!autoShown && h?.tutorial?.due && !isOpen()) { autoShown = true; open(); } }
  function init(o) { opts = { ...opts, ...(o || {}) }; ensureDom(); }

  return { init, open, close, isOpen, maybeOpen };
})();
