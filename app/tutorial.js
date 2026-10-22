// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 첫 실행 튜토리얼 — v2.90(2026-10-19) AI 첫 세션 대신 미리 써 둔 글·그림(AI 호출 0) → v2.94(2026-10-22 사용자 확정 시안 `docs\시안-튜토리얼v2-2026-10-22.html`):
   · 밝은 판(연수 슬라이드 색, IRIS 테마와 무관) · 글 = 연수 「교사를 위한 에이전트」 문법(머리글 → 두 색 제목 → 막대 → 번호 3줄 → 아래 요점 띠)
   · 그림 = 연수 그림 `app/tutorial/*.webp`(표지·유리병 두뇌·몸 있는 두뇌·전입 첫날·폴더 나무·연장 벽·아이콘 3) + ⑧ 실제 IRIS 캡처 · 도구 비유 = 좋은 펜·망치·톱(연장)
   · ⑤ 내 폴더 = 역할 카드(× 빼기 · + 추가, 여러 역할) → 폴더 나무 편집기(이름 그 자리 고침 · + · ×, 영어 = 내장 사전·없으면 생략)
     → 「폴더 만들기」 확인 창 → 만들어야(승인) 「다음」이 열린다. 폴더를 원치 않으면 「나중에 하기」로만 닫는다.
   데몬: GET /api/tutorial · POST /api/tutorial/{plan,structure,done} · POST /api/open-folder · GET /api/tools · GET /api/relay/ready. 설계 = docs\설계-튜토리얼-2026-10-19.md */
window.Tutorial = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let opts = { onFirstChat: () => {}, onClose: () => {} };
  let step = 0, info = null, autoShown = false, created = [], tools = null, planTimer = 0, lastPlan = null;
  const el = () => $('#tutorial');
  const isOpen = () => !!el() && !el().hidden;

  // ---------- 영어 이름 = 내장 사전(학교·업무 낱말). 사전에 없는 말은 영어를 붙이지 않는다(사용자에게 묻지 않음). ----------
  const EN = {
    교사: 'Teacher', 연구자: 'Researcher', 개발자: 'Developer', 직장인: 'Office Worker', 학생: 'Student', 교감: 'Vice Principal', 교장: 'Principal', 부장: 'Department Head', 교무부장: 'Academic Affairs Head', 강사: 'Instructor', 대학원생: 'Graduate Student', 저자: 'Author', 부모: 'Parent', 가족: 'Family', 개인: 'Personal', 사업: 'Business', 창업: 'Startup',
    수업: 'Teaching', 담임: 'Homeroom', 부담임: 'Assistant Homeroom', 업무: 'School Affairs', 연수: 'Training', 평가: 'Assessment', 상담: 'Counseling', 진로: 'Career', 생활지도: 'Student Guidance', 행정: 'Administration', 동아리: 'Club', 방과후: 'After School', 행사: 'Events', 연구: 'Research', 논문: 'Papers', 과제: 'Assignments', 학회: 'Conferences', 연구회: 'Research Group', 전학공: 'Teacher Learning Community', 제품: 'Products', 오픈소스: 'Open Source', 공부: 'Learning', 보고서: 'Reports', 회의: 'Meetings', 자기계발: 'Self-Development', 재무: 'Finance', 건강: 'Health', 여행: 'Travel', 집: 'Home', 독서: 'Reading', 글쓰기: 'Writing', 출판: 'Publishing', 홍보: 'Promotion', 예산: 'Budget', 계약: 'Contracts', 민원: 'Civil Affairs', 공문: 'Official Letters', 기획: 'Planning', 운영: 'Operations',
    물리: 'Physics', 물리학: 'Physics', 화학: 'Chemistry', 생명과학: 'Life Science', 생물: 'Biology', 지구과학: 'Earth Science', 과학: 'Science', 통합과학: 'Integrated Science', 수학: 'Mathematics', 국어: 'Korean', 영어: 'English', 사회: 'Social Studies', 역사: 'History', 한국사: 'Korean History', 지리: 'Geography', 윤리: 'Ethics', 정보: 'Informatics', 기술: 'Technology', 가정: 'Home Economics', 기술가정: 'Technology and Home Economics', 음악: 'Music', 미술: 'Art', 체육: 'Physical Education', 보건: 'Health Education', 도덕: 'Moral Education', 일본어: 'Japanese', 중국어: 'Chinese', 인공지능: 'Artificial Intelligence', 코딩: 'Coding', 프로그래밍: 'Programming', 천문학: 'Astronomy', 로봇: 'Robotics', 환경: 'Environment', 경제: 'Economics', 법: 'Law',
    세특: 'Student Records', 생기부: 'Student Records', 수행평가: 'Performance Assessment', 지필평가: 'Written Exams', 시험: 'Exams', 출제: 'Exam Writing', 채점: 'Grading', 성적: 'Grades', 학급: 'Class', 학급운영: 'Class Management', 학부모: 'Parents', 가정통신문: 'Parent Letters', 계획서: 'Plans', 결과보고: 'Result Report', 공개수업: 'Open Class', 수업나눔: 'Lesson Sharing', 교육과정: 'Curriculum', 교재: 'Textbook', 학습지: 'Worksheets', 실험: 'Experiments', 탐구: 'Inquiry', 프로젝트: 'Project', 캠프: 'Camp', 축제: 'Festival', 체험학습: 'Field Trip', 수학여행: 'School Trip', 입시: 'Admissions', 대입: 'College Admissions', 면접: 'Interview', 자소서: 'Personal Statement', 졸업: 'Graduation', 입학: 'Admission', 학기: 'Semester', 방학: 'Vacation', 상담기록: 'Counseling Records', 출결: 'Attendance', 시간표: 'Timetable', 발표: 'Presentation', 강의: 'Lectures', 수업자료: 'Class Materials', 홈페이지: 'Homepage', 앱: 'App', 블로그: 'Blog', 유튜브: 'YouTube', 마케팅: 'Marketing', 영업: 'Sales', 인사: 'HR', 회계: 'Accounting', 세금: 'Taxes', 보험: 'Insurance', 투자: 'Investment',
  };
  const enOf = (ko) => EN[String(ko || '').trim().replace(/\s+/g, '')] || '';

  // ---------- 장면 글·그림 ----------
  const IMG = (n) => `/app/tutorial/${n}.webp`;
  const pts = (a, cls = '') => `<ol class="tu-pts ${cls}">${a.map(([k, s], i) => `<li><b${k.startsWith('?') ? ' class="o"' : ''}>${k.startsWith('?') ? '?' : i + 1}</b><span><strong>${k.replace(/^\?/, '')}</strong>${s ? `<small>${s}</small>` : ''}</span></li>`).join('')}</ol>`;
  const pic = (n, alt, cls = '') => `<figure class="tu-pic ${cls}"><img src="${IMG(n)}" alt="${esc(alt)}" decoding="async" draggable="false"></figure>`;
  const head = (k, h, extra = '') => `<div class="tu-k">${k}</div><h2>${h}</h2><div class="tu-rule"></div>${extra}`;
  const FILE = '<svg viewBox="0 0 48 60" fill="none" aria-hidden="true"><path d="M4 4h28l12 12v40H4z" fill="currentColor" opacity=".14" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M32 4v12h12M12 28h24M12 36h24M12 44h16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  const ICONS = (done) => `<div class="tu-icons${done ? ' done' : ''}">${[['map', '온톨로지', done ? '내 폴더를 만들었어요' : '지도'], ['binder', '레퍼런스', done ? '자료 넣는 곳을 알아요' : '서류철'], ['toolbox', '도구', done ? '연장을 확인했어요' : '연장']].map(([n, a, b]) => `<div><img src="${IMG(n)}" alt=""><b>${a}</b><small>${b}</small></div>`).join('')}</div>`;
  const SCENES = [
    { id: 'welcome', label: '시작', pill: '미리 준비된 안내라 <b>AI 요금이 들지 않습니다</b>',
      text: () => head('IRIS 시작하기 · 5분', '말해 주는 AI에서<br><span>해 주는 AI로</span>', pts([['에이전트란', '두뇌에 몸이 생기면 무엇이 달라지나'], ['일을 잘하게 하는 3가지', '지도 · 서류철 · 연장'], ['내 폴더 만들기', '질문에 답하면 폴더가 생깁니다']])),
      art: () => pic('cover', '노트북 화면에서 도우미가 손을 뻗어 서류를 건네는 그림') },
    { id: 'agent', label: '에이전트', pill: '두뇌(모델) + 움직이는 몸 = <b>에이전트</b>',
      text: () => head('에이전트란', '같은 두뇌,<br><span>몸의 차이</span>', pts([['챗봇 = <em>유리병 속 두뇌</em>', '방법을 말해 주고, 일은 내가 합니다'], ['에이전트 = <em>몸이 있는 두뇌</em>', '파일을 직접 만들어 줍니다'], ['생각 → 작업 → 확인', '끝날 때까지 스스로 여러 번 돕니다']]) + '<span class="tu-chip-warn">중요한 일은 허락받고 행동</span>'),
      art: () => `<div class="tu-cmp"><figure class="tu-pic"><img src="${IMG('jar')}" alt="유리병 속에 두뇌만 있는 그림"><span class="tu-tag">챗봇</span><figcaption><b>유리병 속 두뇌</b><small>말해 주는 AI</small></figcaption></figure><figure class="tu-pic"><img src="${IMG('body')}" alt="두뇌를 머리에 넣은 로봇이 서류를 직접 처리하는 그림"><span class="tu-tag">에이전트</span><figcaption><b>몸이 있는 두뇌</b><small>해 주는 AI</small></figcaption></figure></div>` },
    { id: 'three', label: '3가지', pill: '세 가지를 갖춰 주면 <b>첫날부터</b> 일을 잘합니다',
      text: () => head('전입 첫날', '똑똑해도 처음 온 학교에서는<br><span>헤맵니다</span>', pts([['온톨로지 = <em>학교 지도와 내 책상</em>', '폴더 구조 + 폴더마다 붙인 규칙 메모'], ['레퍼런스 = <em>작년 서류철</em>', '작년 계획서, 양식, 좋은 예시'], ['도구 = <em>좋은 펜·망치·톱</em>', '한글 문서, 손글씨 읽기, 음성 받아쓰기']])),
      art: () => pic('firstday', '새 학교 복도에 선 선생님과 두뇌가 둘 다 어리둥절한 그림', 'crop') + ICONS(false) },
    { id: 'rdp', label: '온톨로지', pill: '에이전트는 <b>그 폴더에서 부르면</b> 그 일의 맥락을 압니다',
      text: () => head('<i>1</i> 온톨로지', '폴더는<br><span>일의 자리</span>', pts([['일마다 자리를 정해 둡니다', '역할 → 영역 → 일(연도·학기)'], ['폴더마다 <em>규칙 메모</em>', 'AGENTS.md — 이 폴더에서 지킬 것'], ['위 폴더 메모는 <em>아래로</em>', '"교사" 메모는 모든 하위 폴더에 적용']])),
      art: () => pic('tree', 'IRIS 아래 역할·영역·프로젝트 폴더가 나무처럼 이어지고 폴더마다 메모가 붙은 그림') },
    { id: 'build', label: '내 폴더', build: true },
    { id: 'reference', label: '레퍼런스', pill: '좋은 예시 하나가 <b>가장 정확한 지시</b>입니다',
      text: () => head('<i>2</i> 레퍼런스', '말로 100번 설명<br><span>&lt; 작년 파일 1개</span>', pts([['프로젝트 폴더에 넣어 두기', '작년 계획서, 양식, 좋은 예시'], ['"<em>이것처럼</em> 해 줘"', '양식·말투·분량이 한 번에 전달됩니다'], ['민감한 자료는 꼭 필요한 것만', '학생 개인정보는 빼고 넣으세요']])),
      art: () => `<div class="tu-vs"><div><div class="tu-box"><div class="tu-dots">${'<i></i>'.repeat(54)}</div></div><p>"양식은 이렇고, 말투는 저렇고…"<small>설명할수록 길어지고 빠뜨립니다</small></p></div><div class="tu-lt">&lt;</div><div><div class="tu-box file"><div>${FILE}<b>작년 계획서.hwpx</b></div></div><p>"이것처럼 해 줘"<small>한 번에 전달됩니다</small></p></div></div>
        <div class="tu-mini"><span>자료를 넣을 폴더</span><span class="tu-sp"></span>${folderBtns()}</div>` },
    { id: 'tools', label: '도구', pill: '민감한 자료는 <b>내 컴퓨터 안에서만</b> 처리할 수도 있습니다',
      text: () => head('<i>3</i> 도구', '일에 맞는<br><span>좋은 연장</span> 쥐여 주기', pts([['좋은 펜 = <em>한글 문서</em>', '한글 MCP — 한/글 파일을 읽고 씀'], ['돋보기 = <em>손글씨 읽기</em>', '구글 클라우드 비전 OCR'], ['녹음기 = <em>음성 받아쓰기</em>', '말한 내용을 글로'], ['?MCP란?', '연장을 꽂는 콘센트 — 꽂으면 새 연장을 씁니다']])),
      art: () => pic('tools', '두뇌 로봇이 벽에 걸린 펜·망치·톱·돋보기·녹음기 같은 연장을 고르는 그림') + `<div class="tu-mini" id="tu-tools">${tools ? toolsLine() : '<span>이 컴퓨터의 연장을 세는 중…</span>'}</div>` },
    { id: 'usage', label: '사용법', pill: '하던 일 멈추기 = <b>Esc</b>',
      text: () => head('IRIS 화면', '한 화면에서<br><span>여러 에이전트를</span>', pts([['작업목록', '열린 대화들'], ['새 요청 +', '폴더 · 에이전트 · 요청'], ['확인 카드', '숫자나 단추로 허락'], ['대화 / 터미널', '보기 바꾸기'], ['설정 ⚙', '디자인·도구·업데이트'], ['입력창', '이어서 시키기 · 파일 끌어 놓기']], 'six')),
      art: () => `<figure class="tu-pic shot" data-act="zoom" title="크게 보기"><img src="${IMG('usage')}" alt="IRIS 화면 캡처: ① 작업목록 ② 새 요청(+) ③ 확인 카드 ④ 대화/터미널 전환 ⑤ 설정 ⑥ 입력창에 번호가 붙어 있다" decoding="async" draggable="false"></figure>` },
    { id: 'finish', label: '마무리', pill: '예시 요청이 채워지고, <b>보내기는 직접</b> 누릅니다',
      text: () => head('준비 끝', '좋은 몸을 고르고,<br><span>자리와 연장</span>을 마련하기') + finishHtml(),
      art: () => ICONS(true) },
  ];
  const BUILD_STEP = SCENES.findIndex(s => s.build);

  // ---------- 장면 그리기 도우미 ----------
  const FOLDER = '<svg class="tu-fic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v10h-17z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const X = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  const createdP = () => created.filter(it => it.level === 'P').length ? created.filter(it => it.level === 'P') : created;
  function folderBtns() {
    const list = createdP();
    if (!list.length) return '<button class="tu-fbtn" data-open="">IRIS 폴더 열기</button>';
    return list.slice(0, 3).map(it => `<button class="tu-fbtn" data-open="${esc(it.rel)}" title="${esc(it.rel)}">${FOLDER}${esc(it.name)}</button>`).join('');
  }
  const toolsLine = () => `<span>이 컴퓨터에 있는 연장</span><span class="tu-sp"></span><span class="tu-stat"><b>${tools.counts.skills}</b>스킬</span><span class="tu-stat"><b>${tools.counts.mcp}</b>MCP</span><span class="tu-stat"><b>${tools.counts.plugins}</b>플러그인</span>`;
  function finishHtml() {
    const list = createdP();
    const lead = info?.leadAgent === 'codex' ? 'codex' : 'claude';
    return `<div class="tu-first"><b>첫 대화 해 보기</b><div class="tu-row"><select class="tu-in tu-sel wide" id="tu-fc-folder">${list.length ? list.map(it => `<option value="${esc(it.rel)}">${esc(it.rel)}</option>`).join('') : `<option value="">${esc(info?.rootName || 'IRIS')} (전체 폴더)</option>`}</select>
      <select class="tu-in tu-sel" id="tu-fc-agent"><option value="claude"${lead === 'claude' ? ' selected' : ''}>Claude</option><option value="codex"${lead === 'codex' ? ' selected' : ''}>Codex</option></select></div>
      <div class="tu-btns"><button class="tu-btn accent" data-act="first">첫 대화 해 보기</button><button class="tu-btn" data-act="home">홈으로</button></div><div class="tu-made" id="tu-fc-msg"></div></div>`;
  }
  // ---------- ⑤ 내 폴더 만들기: 역할 카드(여러 개 · × 빼기 · + 추가) → 폴더 나무 편집기 ----------
  const ROLES = ['교사', '연구자', '개발자', '직장인', '학생'];
  const SUGGEST = { 교사: ['수업', '담임', '업무', '연수'], 연구자: ['연구', '논문', '과제', '학회'], 개발자: ['제품', '오픈소스', '공부'], 직장인: ['업무', '보고서', '회의', '자기계발'], 학생: ['수업', '과제', '진로'] };
  const PERIOD_OPTS = () => { const y = info?.year || new Date().getFullYear(); return ['', `${y}년`, `${y}년.1학기`, `${y}년.2학기`, `${y + 1}년`]; };
  let roles = ROLES.map(ko => ({ ko, domains: [] })), view = 'grid', active = 0, adding = false, made = '', madeN = 0, undo = null, modal = false;
  const filled = (r) => r.domains.some(d => d.ko.trim());
  const nP = (r) => r.domains.reduce((s, d) => s + d.projects.filter(p => p.ko.trim()).length, 0);
  const counts = (r) => `영역 ${r.domains.filter(d => d.ko.trim()).length} · 프로젝트 ${nP(r)}`;
  /** 데몬에 보낼 모양 — 채운 역할만, 빈 이름 줄은 뺀다. 영어는 사전에서. */
  const specOf = () => ({ roles: roles.filter(filled).map(r => ({ ko: r.ko.trim(), en: enOf(r.ko), domains: r.domains.filter(d => d.ko.trim()).map(d => ({ ko: d.ko.trim(), en: enOf(d.ko), projects: d.projects.filter(p => p.ko.trim()).map(p => ({ ko: p.ko.trim(), en: enOf(p.ko), period: p.period || '' })) })) })) });
  /** 만든 뒤 고치면 다시 승인해야 한다. */
  const touched = () => { if (made === 'made') made = 'changed'; };

  function gridHtml() {
    const any = roles.some(filled);
    return `<div class="tu-bt"><div class="tu-k">내 폴더 만들기</div><h2 class="sm">어떤 <span>역할</span>로 일하시나요?</h2>
        <p class="tu-lead">캐릭터를 누르면 그 역할의 영역·프로젝트를 적습니다. 필요 없는 역할은 <b>×</b>, 없는 역할은 <b>+</b>로.</p></div>
      <div class="tu-rg">${roles.map((r, i) => `<div class="tu-rc${filled(r) ? ' filled' : ''}" data-role="${i}" role="button" tabindex="0" aria-label="${esc(r.ko)} 역할 채우기"><button class="tu-rx" type="button" data-rx="${i}" title="${esc(r.ko)} 빼기" aria-label="${esc(r.ko)} 역할 빼기">${X}</button>
          <div class="ps-fig ps-turned">${Persona.svg(r.ko, { sub: filled(r) ? counts(r) : '눌러서 채우기' })}</div>${filled(r) ? `<span class="tu-rok">${CHECK}</span>` : ''}</div>`).join('')}
        ${adding ? `<div class="tu-rc tu-radd on"><span class="tu-plus">+</span><input class="tu-in" id="tu-newrole" maxlength="30" placeholder="역할 이름(예: 교무부장)" spellcheck="false" autocomplete="off"><div class="tu-btns"><button class="tu-btn sm" data-act="add-cancel" type="button">취소</button><button class="tu-btn sm accent" data-act="add-ok" type="button">추가</button></div></div>`
          : roles.length < 8 ? `<button class="tu-rc tu-radd" type="button" data-act="add-role"><span class="tu-plus">+</span><b>역할 추가</b><small>직접 이름 짓기</small></button>` : ''}</div>
      ${makeBar(any ? `<b>${roles.filter(filled).map(r => esc(r.ko)).join(' · ')}</b> ${roles.filter(filled).length}개 역할 · 확인한 뒤 만들어야 다음으로 넘어갑니다` : '역할 캐릭터를 눌러 영역·프로젝트를 적어 주세요', !any)}
      ${undo ? `<div class="tu-toast">「${esc(undo.role.ko)}」 역할을 뺐습니다 <button type="button" data-act="undo">되돌리기</button></div>` : ''}`;
  }
  function makeBar(msg, disabled) {
    if (made === 'made') return `<div class="tu-bbar ok" id="tu-made"><span class="tu-okc">${CHECK}</span><span><b>${madeN ? `새 폴더 ${madeN}개를 만들었습니다.` : '폴더가 모두 이미 있습니다.'}</b> 이제 「다음」으로 넘어갈 수 있어요.</span></div>`;
    const err = lastPlan && !lastPlan.ok && roles.some(filled) ? `<div class="tu-errs">${lastPlan.errors.slice(0, 3).map(e => `<div>· ${esc(e.message)}</div>`).join('')}</div>` : '';
    return `<div class="tu-bbar${made === 'changed' ? ' warn' : ''}"><span>${made === 'changed' ? '<b>바뀐 내용이 있어요.</b> 다시 승인해야 다음으로 넘어갑니다' : msg}${err}</span><span class="tu-gap"></span><button class="tu-btn accent" type="button" id="tu-make" data-act="make"${disabled || err ? ' disabled' : ''}>${made === 'changed' ? '바뀐 대로 다시 만들기' : '폴더 만들기'}</button></div>`;
  }

  /** 계획(데몬) 결과로 나무의 번호를 붙인다 — 이미 있는 R 폴더가 있으면 R02… 처럼 실제 번호가 보인다. */
  function codesFor(k) {
    const out = { r: 'R··', d: [], p: [], ex: {} };
    if (!lastPlan?.ok) return out;
    const sent = roles.filter(filled); const idx = sent.indexOf(roles[k]); if (idx < 0) return out;
    let g = -1, di = -1; const real = roles[k].domains.map((d, i) => d.ko.trim() ? i : -1).filter(i => i >= 0);
    for (const it of lastPlan.items) {
      if (it.level === 'R') { g++; di = -1; if (g === idx) { out.r = it.name.split('-')[0]; out.ex.r = it.exists; } continue; }
      if (g !== idx) continue;
      if (it.level === 'D') { di++; const i = real[di]; out.d[i] = it.name.split('-')[0]; out.ex['d' + i] = it.exists; out.p[i] = []; out.pj = 0; continue; }
      if (it.level === 'P') { const i = real[di]; const pr = roles[k].domains[i].projects.map((p, j) => p.ko.trim() ? j : -1).filter(j => j >= 0); const j = pr[out.p[i].filter(Boolean).length]; out.p[i][j] = it.name.split('-')[0]; out.ex[`p${i}.${j}`] = it.exists; }
    }
    return out;
  }
  const FOLD = (lv) => `<svg class="tu-tfic l${lv}" viewBox="0 0 32 26" aria-hidden="true"><path d="M2 4a2 2 0 0 1 2-2h8l3 3h13a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="currentColor" opacity=".18"/><path d="M2 9h28v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="currentColor"/></svg>`;
  function trow(lv, code, ko, key, { extra = '', del = '', exists = false, ph = '이름' } = {}) {
    const en = enOf(ko);
    return `<div class="tu-tr lv${lv}">${FOLD(lv)}<span class="tu-cd">${esc(code)}-</span><input class="tu-tn" data-k="${key}" value="${esc(ko)}" placeholder="${ph}" maxlength="30" spellcheck="false" autocomplete="off" aria-label="${['', '역할', '영역', '프로젝트'][lv]} 이름"><span class="tu-ten">${en ? `(${esc(en)})` : ''}</span>${extra}${exists ? '<span class="tu-exist">이미 있음</span>' : ''}<span class="tu-tlv">${['', '역할', '영역', '프로젝트'][lv]}</span>${del}</div>`;
  }
  function treeHtml() {
    const r = roles[active]; const c = codesFor(active);
    const rows = [`<div class="tu-tr lv0">${FOLD(0)}<b>${esc(info?.rootName || 'IRIS')}</b><span class="tu-tlv">내 폴더</span></div>`, trow(1, c.r, r.ko, 'r', { exists: c.ex.r, ph: '역할 이름' })];
    r.domains.forEach((d, i) => {
      rows.push(trow(2, c.d[i] || 'D··', d.ko, `d.${i}`, { exists: c.ex['d' + i], ph: '영역 이름(예: 수업)', del: `<button class="tu-tx" type="button" data-rm="d.${i}" title="영역 빼기(안의 프로젝트도)" aria-label="영역 빼기">${X}</button>` }));
      d.projects.forEach((p, j) => rows.push(trow(3, (c.p[i] || [])[j] || 'P··', p.ko, `p.${i}.${j}`, { exists: c.ex[`p${i}.${j}`], ph: '프로젝트 이름(예: 물리학)',
        extra: `<select class="tu-tper" data-k="per.${i}.${j}" aria-label="기간">${PERIOD_OPTS().map(o => `<option value="${esc(o)}"${o === (p.period || '') ? ' selected' : ''}>${o ? `〖${esc(o)}〗` : '기간 없음'}</option>`).join('')}</select>`,
        del: `<button class="tu-tx" type="button" data-rm="p.${i}.${j}" title="프로젝트 빼기" aria-label="프로젝트 빼기">${X}</button>` })));
      if (d.projects.length < 5) rows.push(`<div class="tu-tr lv3 add"><button class="tu-tadd" type="button" data-add="p.${i}">+ 프로젝트</button></div>`);
    });
    const sug = (SUGGEST[r.ko.trim()] || []).filter(k => !r.domains.some(d => d.ko.trim() === k));
    if (r.domains.length < 5) rows.push(`<div class="tu-tr lv2 add"><button class="tu-tadd" type="button" data-add="d">+ 영역</button>${sug.length ? `<span class="tu-qa">빠른 추가 ${sug.map(k => `<button class="tu-sg" type="button" data-q="${esc(k)}">+ ${esc(k)}</button>`).join('')}</span>` : ''}</div>`);
    return `<div class="tu-dl"><button class="tu-back" type="button" data-act="grid" title="Esc">← 역할 목록</button><div class="ps-fig ps-turned chosen tu-me" id="tu-me">${Persona.svg(r.ko, { sub: counts(r), empty: !r.ko.trim(), placeholder: '이름 짓기' })}</div></div>
      <div class="tu-dr"><div class="tu-k">${esc(r.ko || '새 역할')} · 내 폴더</div><h3>이렇게 <span>폴더</span>가 만들어집니다</h3>
        <div class="tu-howto"><span><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg> 이름을 <b>눌러서 고치기</b></span><span><i>+</i> 눌러서 <b>더하기</b></span><span><i class="x">×</i> 눌러서 <b>빼기</b></span><small>번호·영어·기간 표시는 IRIS가 붙입니다</small></div>
        <div class="tu-tree" id="tu-tree">${rows.join('')}</div>${makeBar(roles.some(filled) ? `새 폴더를 확인한 뒤 만들어야 다음으로 넘어갑니다` : '영역을 하나 이상 적어 주세요', !roles.some(filled))}</div>`;
  }
  const buildHtml = () => view === 'tree' ? treeHtml() : gridHtml();

  async function refreshPlan() {
    const spec = specOf();
    if (!spec.roles.length) { lastPlan = null; return; }
    try { lastPlan = await (await fetch('/api/tutorial/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec }) })).json(); } catch { lastPlan = { ok: false, errors: [{ message: '계획을 불러오지 못했습니다.' }] }; }
    if (SCENES[step]?.build && isOpen()) repaint(true);
  }
  const schedulePlan = () => { clearTimeout(planTimer); planTimer = setTimeout(refreshPlan, 220); };
  /** ⑤ 다시 그리기. soft = 입력 중(초점·글자 위치를 지킨다). */
  function repaint(soft) {
    const host = $('.tu-q-host', el()); if (!host) return;
    const f = soft ? document.activeElement : null, key = f?.dataset?.k, pos = f?.selectionStart;
    host.className = `tu-q-host v-${view}`; host.innerHTML = buildHtml(); Persona.watch(host); Persona.fit(host); gate();
    if (key) { const n = host.querySelector(`[data-k="${CSS.escape(key)}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }
  }

  function confirmMake() {
    if (!lastPlan?.ok) return;
    const items = lastPlan.items, fresh = items.filter(it => !it.exists).length;
    const m = document.createElement('div'); m.className = 'tu-modal'; modal = true;
    m.innerHTML = `<div class="tu-mbox" role="dialog" aria-modal="true" aria-label="폴더 만들기 확인"><h4>이대로 폴더를 만들까요?</h4><p>아래 <b>${fresh}개 폴더</b>가 ${esc(info?.rootName || 'IRIS')} 폴더 안에 만들어집니다. 이미 있는 폴더는 건드리지 않습니다.</p>
      <div class="tu-mlist">${items.map(it => `<div style="padding-left:${({ R: 0, D: 1, P: 2 }[it.level]) * 20}px">${FOLD(({ R: 1, D: 2, P: 3 }[it.level]))}<span>${esc(it.name)}</span>${it.exists ? '<small>이미 있음</small>' : ''}</div>`).join('')}</div>
      <div class="tu-btns end"><button class="tu-btn" type="button" data-m="no">다시 고칠래요</button><button class="tu-btn accent" type="button" data-m="yes">이대로 만들기</button></div><div class="tu-errs" id="tu-merr"></div></div>`;
    $('.tu-panel', el()).appendChild(m); $('[data-m="yes"]', m).focus();
    m.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-m]')?.dataset.m; if (!a && e.target !== m) return;
      if (a !== 'yes') return closeModal();
      const b = $('[data-m="yes"]', m); b.disabled = true; b.textContent = '만드는 중…';
      const r = await make();
      if (r.ok) closeModal(); else { b.disabled = false; b.textContent = '이대로 만들기'; $('#tu-merr', m).innerHTML = (r.errors || []).map(x => `<div>· ${esc(x.message)}</div>`).join(''); }
    });
  }
  function closeModal() { const m = $('.tu-modal', el()); if (!m) return false; m.remove(); modal = false; $('#tu-make', el())?.focus(); return true; }
  async function make() {
    let r; try { const res = await fetch('/api/tutorial/structure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec: specOf() }) }); r = await res.json(); } catch (e) { r = { ok: false, errors: [{ message: e.message }] }; }
    if (!r.ok) return r;
    created = r.items; madeN = r.created.length; made = 'made'; repaint(); refreshPlan();
    return r;
  }

  function bindBuild(root) {
    root.addEventListener('input', (e) => {
      const k = e.target.dataset?.k; if (!k || !e.target.closest('.tu-q-host')) return; const a = k.split('.'), v = e.target.value, r = roles[active];
      if (a[0] === 'r') r.ko = v; else if (a[0] === 'd') r.domains[+a[1]].ko = v; else if (a[0] === 'p') r.domains[+a[1]].projects[+a[2]].ko = v; else if (a[0] === 'per') r.domains[+a[1]].projects[+a[2]].period = v; else return;
      if (made === 'made') { made = 'changed'; repaint(true); }
      const t = e.target.nextElementSibling; if (t?.classList.contains('tu-ten')) { const en = enOf(v); t.textContent = en ? `(${en})` : ''; }
      if (a[0] === 'r') { const me = $('#tu-me', root); if (me) { me.innerHTML = Persona.svg(v, { sub: counts(r), empty: !v.trim(), placeholder: '이름 짓기' }); Persona.fit(me); } }
      schedulePlan();
    });
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'tu-newrole') { e.preventDefault(); addRole(); } });
    root.addEventListener('click', (e) => {
      if (!e.target.closest('.tu-q-host')) return;
      const b = e.target.closest('button'), card = e.target.closest('[data-role]');
      if (b?.dataset.rx != null) { const i = +b.dataset.rx; undo = { role: roles[i], at: i }; roles.splice(i, 1); touched(); repaint(); schedulePlan(); return; }
      if (b?.dataset.act === 'undo') { if (undo) roles.splice(Math.min(undo.at, roles.length), 0, undo.role); undo = null; touched(); repaint(); schedulePlan(); return; }
      if (b?.dataset.act === 'add-role') { adding = true; repaint(); $('#tu-newrole', root)?.focus(); return; }
      if (b?.dataset.act === 'add-cancel') { adding = false; repaint(); return; }
      if (b?.dataset.act === 'add-ok') return addRole();
      if (b?.dataset.act === 'grid') { view = 'grid'; repaint(); return; }
      if (b?.dataset.act === 'make') return confirmMake();
      if (!b && card) { openRole(+card.dataset.role, card); return; }
      if (!b) return;
      const r = roles[active];
      if (b.dataset.rm) { const a = b.dataset.rm.split('.'); if (a[0] === 'd') r.domains.splice(+a[1], 1); else r.domains[+a[1]].projects.splice(+a[2], 1); }
      else if (b.dataset.add === 'd') { r.domains.push({ ko: '', projects: [] }); }
      else if (b.dataset.add) { const i = +b.dataset.add.split('.')[1]; r.domains[i].projects.push({ ko: '', period: '' }); }
      else if (b.dataset.q) { r.domains.push({ ko: b.dataset.q, projects: [] }); }
      else return;
      touched(); repaint(); schedulePlan();
      if (b.dataset.add === 'd') $(`[data-k="d.${r.domains.length - 1}"]`, root)?.focus();
      else if (b.dataset.add) { const i = +b.dataset.add.split('.')[1]; $(`[data-k="p.${i}.${r.domains[i].projects.length - 1}"]`, root)?.focus(); }
    });
    root.addEventListener('keydown', (e) => { const card = e.target.closest?.('[data-role]'); if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openRole(+card.dataset.role, card); } });
  }
  function openRole(i, card) {
    const from = card?.getBoundingClientRect(); active = i; view = 'tree'; undo = null; repaint();
    if (from) Persona.walkFrom($('#tu-me', el()), from);
    const r = roles[i]; if (!r.domains.length) $('.tu-tadd[data-add="d"]', el())?.focus(); schedulePlan();
  }
  function addRole() {
    const v = ($('#tu-newrole', el())?.value || '').trim(); if (!v) return;
    roles.push({ ko: v, domains: [] }); adding = false; touched(); openRole(roles.length - 1, null);
  }
  // ---------- 장면 그리기 · 이동 ----------
  /** 「다음」·단계 머리는 ⑤에서 폴더를 만들어야(승인) 열린다. */
  const locked = () => made !== 'made';
  function gate() {
    const root = el(); if (!root) return; const nx = $('[data-nav="next"]', root), on = !!SCENES[step]?.build && locked();
    nx.disabled = on; nx.title = on ? '폴더 구조를 확인하고 「폴더 만들기」를 눌러야 넘어갈 수 있어요' : '';
    $('.tu-gate', root).hidden = !on;
    root.querySelectorAll('.tu-steps li').forEach((li, i) => li.classList.toggle('lock', i > BUILD_STEP && locked()));
  }
  function render() {
    const root = el(); if (!root) return;
    const sc = SCENES[step];
    root.querySelector('.tu-steps').innerHTML = SCENES.map((s, i) => `<li class="${i === step ? 'cur' : i < step ? 'done' : ''}" data-go="${i}" title="${esc(s.label)}"${i === step ? ' aria-current="step"' : ''}><span class="tu-dotn">${i < step ? CHECK : i + 1}</span><em>${esc(s.label)}</em></li>`).join('');
    const body = root.querySelector('.tu-body'); body.className = `tu-body sc-${sc.id}`; body.scrollTop = 0;
    body.innerHTML = sc.build ? `<div class="tu-q-host v-${view}">${buildHtml()}</div>` : `<div class="tu-text">${sc.text()}</div><div class="tu-art">${sc.art()}</div>${sc.pill ? `<div class="tu-pill">${sc.pill}</div>` : ''}`;
    root.querySelector('[data-nav="prev"]').hidden = step === 0;
    root.querySelector('[data-nav="next"]').hidden = step === SCENES.length - 1;
    root.querySelector('[data-nav="next"]').textContent = step === 0 ? '시작하기' : '다음';
    if (sc.build) { const h = $('.tu-q-host', body); Persona.watch(h); Persona.fit(h); schedulePlan(); }
    if (sc.id === 'tools' && !tools) fetch('/api/tools').then(r => r.json()).then(t => { tools = t; const h = $('#tu-tools'); if (h && t?.ok) h.innerHTML = toolsLine(); }).catch(() => { const h = $('#tu-tools'); if (h) h.innerHTML = '<span>연장 목록을 읽지 못했습니다 — 설정 → 「도구」 탭에서 볼 수 있습니다.</span>'; });
    gate();
  }
  const go = (n) => { n = Math.max(0, Math.min(SCENES.length - 1, n)); if (n > BUILD_STEP && step <= BUILD_STEP && locked()) n = BUILD_STEP; step = n; render(); };

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
    d.innerHTML = `<div class="tu-panel" role="dialog" aria-label="IRIS 시작하기"><div class="tu-head"><span class="tu-brand"><span class="tu-mark" aria-hidden="true"></span><span class="tu-word">IRIS</span><span class="tu-brand-sub">시작하기</span></span><ol class="tu-steps"></ol><span class="tu-head-end"></span></div><div class="tu-body"></div>
      <div class="tu-foot"><button class="tu-btn ghost" data-nav="later">나중에 하기</button><span class="tu-later-note">닫아도 설정 → 업데이트·정보에서 다시 볼 수 있어요</span><span class="tu-gap"></span><span class="tu-gate" hidden>폴더를 만들면 다음으로 넘어갑니다</span><button class="tu-btn" data-nav="prev">이전</button><button class="tu-btn accent" data-nav="next">다음</button></div>
      <div class="tu-zoom" hidden data-act="unzoom"><img alt="" src=""></div></div>`;
    document.body.appendChild(d);
    // 튜토리얼 안의 키는 문서로 올려 보내지 않는다 — 확인 카드 1~9·단축키·Esc(작업 중단)가 입력칸 글자에 반응하지 않게
    d.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.matches?.('input') && e.target.id !== 'tu-newrole') e.preventDefault(); if (e.key === 'Escape' && back()) e.preventDefault(); });
    bindBuild(d);
    d.addEventListener('click', async (e) => {
      const nav = e.target.closest('[data-nav]')?.dataset.nav;
      if (nav === 'next') return go(step + 1);
      if (nav === 'prev') return go(step - 1);
      if (nav === 'later') { await done(true); close(); try { Notify.push({ title: '튜토리얼은 언제든 다시 볼 수 있습니다', sub: '설정 → 업데이트·정보 → 「튜토리얼 다시 보기」', status: 'idle', force: true }); } catch {} return; }
      const g = e.target.closest('[data-go]'); if (g) return go(+g.dataset.go);
      const o = e.target.closest('[data-open]'); if (o) { try { await fetch('/api/open-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel: o.dataset.open }) }); } catch {} return; }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'zoom') { const z = $('.tu-zoom', d), img = e.target.closest('.tu-pic')?.querySelector('img'); if (z && img) { z.querySelector('img').src = img.src; z.querySelector('img').alt = img.alt; z.hidden = false; } return; }
      if (a === 'unzoom') return unzoom();
      if (a === 'first') return firstChat();
      if (a === 'first-anyway') { const m = $('#tu-fc-msg'); if (m) m.dataset.anyway = '1'; return; }
      if (a === 'home') { await done(false); close(); }
    });
  }
  /** 크게 보기(⑧ 사용법 캡처)를 닫는다. 닫았으면 true. */
  function unzoom() { const z = el() && $('.tu-zoom', el()); if (!z || z.hidden) return false; z.hidden = true; return true; }
  /** 머리 「IRIS」 = 앱 헤더와 같은 마크·글자체(settings.js BRAND 가 #mark-slot·#wordmark 에 적용한 것을 그대로 빌린다 — 원천은 BRAND 하나). */
  function paintBrand() {
    const mark = $('.tu-mark', el()), word = $('.tu-word', el()), wm = $('#wordmark'), slot = $('#mark-slot');
    if (mark && slot) mark.innerHTML = slot.innerHTML;
    if (word && wm) word.style.cssText = wm.style.cssText;
  }
  async function open({ replay = false } = {}) {
    ensureDom(); paintBrand(); unzoom(); closeModal();
    try { info = await (await fetch('/api/tutorial')).json(); } catch { info = info || {}; }
    if (replay) { step = 0; view = 'grid'; }
    el().hidden = false; document.body.classList.add('tu-open'); render();
  }
  function close() { const d = el(); if (d) d.hidden = true; document.body.classList.remove('tu-open'); try { opts.onClose(); } catch {} }
  /** 데몬 인수 정보(hello·방송)를 받을 때마다 — 설치·로그인이 끝났고 아직 안 한 PC 면 한 번 연다. */
  function maybeOpen(h) { if (!autoShown && h?.tutorial?.due && !isOpen()) { autoShown = true; open(); } }
  function init(o) { opts = { ...opts, ...(o || {}) }; ensureDom(); }
  /** Esc(판 keydown·문서·Electron 중계 길): 확인 창 → 크게 보기 → 역할 추가 칸 → 나무 → 역할 목록. 튜토리얼 자체는 닫지 않는다. 처리했으면 true. */
  function back() {
    if (closeModal()) return true;
    if (unzoom()) return true;
    if (SCENES[step]?.build && adding) { adding = false; repaint(); return true; }
    if (SCENES[step]?.build && view === 'tree') { view = 'grid'; repaint(); $(`[data-role="${active}"]`, el())?.focus(); return true; }
    return false;
  }

  return { init, open, close, isOpen, maybeOpen, back };
})();
