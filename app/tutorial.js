// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 첫 실행 튜토리얼 — v2.90(2026-10-19) AI 첫 세션 대신 미리 써 둔 글·그림(AI 호출 0) → v2.94(밝은 판·역할 여러 개·폴더 나무·확인 창)
   → v2.95(2026-10-23 사용자 결정, 설계 6조각 확정):
   · 본문 = 연수 「교사를 위한 에이전트」 덱을 **거의 그대로**(app/tutorial/deck/ = scripts/build-tutorial-deck.py 결과, 40쪽 — 강사 소개 1쪽만 뺌).
     덱은 그림자 DOM(.tu-deck) 안에 원본 CSS 그대로 그리고 판 크기에 맞춰 줄인다. 덱 사이에 IRIS 장면 3개: 26쪽 뒤 「내 폴더 만들기」 · 38쪽 뒤 「IRIS 사용법」 · 맨 끝 「첫 대화 해 보기」.
   · 머리 = 장 7개 원(시작·에이전트·지도·소환·3가지·실습·마무리) + 쪽수 + 「처음부터」 + ×(닫기 = 옛 「나중에 하기」, 폴더를 쓰던 중이면 한 번 묻는다). Esc 는 닫지 않는다.
   · 다시 보기 = 보던 쪽에서 이어서(state\tutorial.json step). 역할 그림 = 같은 사람 20모습(app/persona.js, 성별 = state\tutorial.json gender).
   · 내 폴더: 역할이 이미 있으면(다시 보기) 실제 R/D/P 를 「이미 있음」으로 잠가 깔고 새 줄만 더한다. 「다음」 잠금은 역할 폴더가 하나도 없던 첫 실행에만.
   데몬: GET /api/tutorial · GET /api/tutorial/existing · POST /api/tutorial/{plan,structure,done,prefs} · POST /api/open-folder · GET /api/relay/ready. 설계 = docs\설계-튜토리얼-2026-10-19.md */
window.Tutorial = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let opts = { onFirstChat: () => {}, onClose: () => {} };
  let step = 0, info = null, autoShown = false, created = [], planTimer = 0, lastPlan = null, saveTimer = 0, firstRun = true;
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

  // ---------- 장(chapter)·장면 ----------
  const DECK = '/app/tutorial/deck';
  const CHAPTERS = [['start', '시작', 1, 2], ['agent', '에이전트', 3, 8], ['map', '지도', 9, 12], ['doors', '소환', 13, 22], ['three', '3가지', 23, 30], ['lab', '실습', 31, 37], ['end', '마무리', 38, 99]];
  const chapOf = (no) => (CHAPTERS.find(([, , a, b]) => no >= a && no <= b) || CHAPTERS.at(-1))[0];
  let SCENES = [{ id: 'build', kind: 'build', chap: 'three' }, { id: 'usage', kind: 'usage', chap: 'end' }, { id: 'finish', kind: 'finish', chap: 'end' }];
  const buildIdx = () => SCENES.findIndex(s => s.kind === 'build');
  /** 덱 쪽 목록(manifest) → 장면 줄. 덱을 못 읽으면 IRIS 장면 3개만(튜토리얼 자체는 돈다). */
  function makeScenes(man) {
    if (!man?.slides?.length) return;
    const out = [];
    for (const s of man.slides) {
      out.push({ id: `d${s.no}`, kind: 'deck', no: s.no, chap: chapOf(s.no), title: s.title });
      if (s.no === 26) out.push({ id: 'build', kind: 'build', chap: 'three' });
      if (s.no === 38) out.push({ id: 'usage', kind: 'usage', chap: 'end' });
    }
    if (!out.some(s => s.kind === 'build')) out.push({ id: 'build', kind: 'build', chap: 'three' });
    if (!out.some(s => s.kind === 'usage')) out.push({ id: 'usage', kind: 'usage', chap: 'end' });
    out.push({ id: 'finish', kind: 'finish', chap: 'end' });
    SCENES = out;
  }

  // ---------- 덱(그림자 DOM) ----------
  let deckP = null;
  function loadDeck() {
    if (deckP) return deckP;
    deckP = (async () => {
      const get = async (f, kind) => { const r = await fetch(`${DECK}/${f}`); if (!r.ok) throw new Error(f); return kind === 'json' ? r.json() : r.text(); };
      const [css, html, man] = await Promise.all([get('deck.css'), get('slides.html'), get('manifest.json', 'json')]);
      const host = $('.tu-deck', el()); const sr = host.shadowRoot || host.attachShadow({ mode: 'open' });
      sr.innerHTML = `<style>${css}</style><div id="stage">${html}</div>`;
      sr.addEventListener('click', (e) => { if (e.target.closest?.('a')) e.preventDefault(); }); // 덱 안 링크로 창이 다른 곳으로 가지 않게
      if (typeof ResizeObserver === 'function') new ResizeObserver(fitDeck).observe(host);
      makeScenes(man); return man;
    })().catch(() => null);
    return deckP;
  }
  /** 1920×1080 무대를 판에 맞춰 줄이고 가운데에 놓는다. */
  function fitDeck() {
    const host = $('.tu-deck', el()), st = host?.shadowRoot?.getElementById('stage'); if (!st || !host.clientWidth) return;
    const w = host.clientWidth, h = host.clientHeight, s = Math.min(w / 1920, h / 1080);
    st.style.transform = `translate(${((w - 1920 * s) / 2).toFixed(1)}px, ${((h - 1080 * s) / 2).toFixed(1)}px) scale(${s.toFixed(4)})`;
  }
  const slides = () => [...($('.tu-deck', el())?.shadowRoot?.querySelectorAll('section.slide') || [])];
  function pauseVideos() { for (const v of $('.tu-deck', el())?.shadowRoot?.querySelectorAll('video') || []) try { v.pause(); } catch {} }
  function showSlide(no) {
    let blue = false;
    for (const s of slides()) { const on = +s.dataset.no === no; if (!on && s.classList.contains('on')) s.querySelectorAll('video').forEach(v => { try { v.pause(); } catch {} }); s.classList.toggle('on', on); if (on) blue = s.classList.contains('cobalt'); }
    $('.tu-deck', el())?.classList.toggle('blue', blue); // 원본 발표의 body.blue 와 같이 파란 장이면 무대 밖 여백도 파랗게
    fitDeck();
  }

  // ---------- IRIS 장면(사용법·마무리) 글·그림 ----------
  const IMG = (n) => `/app/tutorial/${n}.webp`;
  const pts = (a, cls = '') => `<ol class="tu-pts ${cls}">${a.map(([k, s], i) => `<li><b>${i + 1}</b><span><strong>${k}</strong>${s ? `<small>${s}</small>` : ''}</span></li>`).join('')}</ol>`;
  const head = (k, h, extra = '') => `<div class="tu-k">${k}</div><h2>${h}</h2><div class="tu-rule"></div>${extra}`;
  const ICONS = () => `<div class="tu-icons done">${[['map', '온톨로지', '내 폴더를 만들었어요'], ['binder', '레퍼런스', '자료 넣는 곳을 알아요'], ['toolbox', '도구', '연장을 확인했어요']].map(([n, a, b]) => `<div><img src="${IMG(n)}" alt=""><b>${a}</b><small>${b}</small></div>`).join('')}</div>`;
  const NATIVE = {
    usage: { pill: '하던 일 멈추기 = <b>Esc</b>',
      text: () => head('IRIS 화면', '한 화면에서<br><span>여러 에이전트를</span>', pts([['작업목록', '열린 대화들'], ['새 요청 +', '폴더 · 에이전트 · 요청'], ['확인 카드', '숫자나 단추로 허락'], ['대화 / 터미널', '보기 바꾸기'], ['설정 ⚙', '디자인·도구·업데이트'], ['입력창', '이어서 시키기 · 파일 끌어 놓기']], 'six')),
      art: () => `<figure class="tu-pic shot" data-act="zoom" title="크게 보기"><img src="${IMG('usage')}" alt="IRIS 화면 캡처: ① 작업목록 ② 새 요청(+) ③ 확인 카드 ④ 대화/터미널 전환 ⑤ 설정 ⑥ 입력창에 번호가 붙어 있다" decoding="async" draggable="false"></figure>` },
    finish: { pill: '예시 요청이 채워지고, <b>보내기는 직접</b> 누릅니다',
      text: () => head('준비 끝', '좋은 몸을 고르고,<br><span>자리와 연장</span>을 마련하기') + finishHtml(),
      art: () => ICONS() },
  };
  const FOLDER = '<svg class="tu-fic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v10h-17z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const X = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  const createdP = () => created.filter(it => it.level === 'P').length ? created.filter(it => it.level === 'P') : created;
  function finishHtml() {
    const list = createdP();
    const lead = info?.leadAgent === 'codex' ? 'codex' : 'claude';
    return `<div class="tu-first"><b>첫 대화 해 보기</b><div class="tu-row"><select class="tu-in tu-sel wide" id="tu-fc-folder">${list.length ? list.map(it => `<option value="${esc(it.rel)}">${esc(it.rel)}</option>`).join('') : `<option value="">${esc(info?.rootName || 'IRIS')} (전체 폴더)</option>`}</select>
      <select class="tu-in tu-sel" id="tu-fc-agent"><option value="claude"${lead === 'claude' ? ' selected' : ''}>Claude</option><option value="codex"${lead === 'codex' ? ' selected' : ''}>Codex</option></select></div>
      <div class="tu-btns"><button class="tu-btn accent" data-act="first">첫 대화 해 보기</button><button class="tu-btn" data-act="home">홈으로</button></div><div class="tu-made" id="tu-fc-msg"></div></div>`;
  }
  // ---------- 내 폴더 만들기: 성별 → 역할 카드(여러 개 · × 빼기 · + 추가) → 폴더 나무 편집기 → 확인 창 ----------
  const ROLES = ['교사', '연구자', '개발자', '직장인', '학생'];
  const SUGGEST = { 교사: ['수업', '담임', '업무', '연수'], 연구자: ['연구', '논문', '과제', '학회'], 개발자: ['제품', '오픈소스', '공부'], 직장인: ['업무', '보고서', '회의', '자기계발'], 학생: ['수업', '과제', '진로'] };
  const PERIOD_OPTS = () => { const y = info?.year || new Date().getFullYear(); return ['', `${y}년`, `${y}년.1학기`, `${y}년.2학기`, `${y + 1}년`]; };
  const LV = ['', '역할', '영역', '프로젝트'];
  // 역할 = { ko, existing?(실제 폴더 이름), code?, domains:[{ ko, existing?, code?, group?, tags?, projects:[{ ko, period, existing?, code?, tags? }] }] }
  let roles = [], view = 'grid', active = 0, adding = false, made = '', madeN = 0, undo = null, modal = false, codeMap = new Map();
  const newP = (d) => d.projects.filter(p => !p.existing);
  const sentP = (d) => newP(d).filter(p => p.ko.trim());
  const sentD = (r) => r.domains.filter(d => d.existing ? sentP(d).length > 0 : d.ko.trim());
  const hasNew = (r) => (!!r.existing || !!r.ko.trim()) && sentD(r).length > 0;
  const nD = (r) => r.domains.filter(d => d.existing || d.ko.trim()).length;
  const nPr = (r) => r.domains.reduce((s, d) => s + d.projects.filter(p => p.existing || p.ko.trim()).length, 0);
  const counts = (r) => `영역 ${nD(r)} · 프로젝트 ${nPr(r)}`;
  const newCounts = (r) => { const d = r.domains.filter(x => !x.existing && x.ko.trim()).length, p = r.domains.reduce((s, x) => s + sentP(x).length, 0); return `새 영역 ${d} · 새 프로젝트 ${p}`; };
  /** 데몬에 보낼 모양 — 새것이 있는 역할만, 이미 있는 폴더는 이름(existing)으로 가리킨다. 영어는 사전에서. */
  const specOf = () => ({ roles: roles.filter(hasNew).map(r => ({ ...(r.existing ? { existing: r.existing } : { ko: r.ko.trim(), en: enOf(r.ko) }),
    domains: sentD(r).map(d => ({ ...(d.existing ? { existing: d.existing } : { ko: d.ko.trim(), en: enOf(d.ko) }), projects: sentP(d).map(p => ({ ko: p.ko.trim(), en: enOf(p.ko), period: p.period || '' })) })) })) });
  /** 만든 뒤 고치면 다시 승인해야 한다. */
  const touched = () => { if (made === 'made') made = 'changed'; };
  /** 지금 화면의 폴더 계획이 만들어지지 않은 채 남아 있나(× 닫기 전 확인). */
  const dirty = () => made !== 'made' && roles.some(hasNew);
  async function initRoles() {
    if (!info?.hasRoles) return ROLES.map(ko => ({ ko, domains: [] }));
    let ex = null; try { ex = await (await fetch('/api/tutorial/existing')).json(); } catch {}
    if (!ex?.roles?.length) return ROLES.map(ko => ({ ko, domains: [] }));
    return ex.roles.map(r => ({ ko: r.ko, existing: r.name, code: r.code, domains: r.domains.map(d => ({ ko: d.ko, existing: d.name, code: d.code, group: d.group, tags: d.tags || [], projects: d.projects.map(p => ({ ko: p.ko, existing: p.name, code: p.code, tags: p.tags || [], period: '' })) })) }));
  }

  function genderHtml() {
    return `<div class="tu-bt"><div class="tu-k">내 폴더 만들기</div><h2 class="sm">먼저 <span>내 모습</span>을 골라 주세요</h2>
        <p class="tu-lead">역할마다 이 사람의 <b>다른 모습</b>이 하나씩 붙습니다. 나중에 바꿀 수 있어요.</p></div>
      <div class="tu-gpick">${[['m', '남성'], ['f', '여성']].map(([g, t]) => `<button class="tu-gcard" type="button" data-gender="${g}" aria-label="${t} 모습으로 하기"><span class="tu-gstrip">${[0, 1, 2].map(i => `<span class="ps-fig">${Persona.pic('', { index: i, gender: g })}</span>`).join('')}</span><b>${t}</b></button>`).join('')}</div>`;
  }
  function gridHtml() {
    const any = roles.some(hasNew), g = Persona.gender(), nNew = roles.filter(r => !r.existing).length;
    return `<div class="tu-bt"><div class="tu-k">내 폴더 만들기 <span class="tu-gsw">모습 ${[['m', '남성'], ['f', '여성']].map(([k, t]) => `<button type="button" data-gender="${k}" aria-pressed="${g === k}">${t}</button>`).join('')}</span></div><h2 class="sm">어떤 <span>역할</span>로 일하시나요?</h2>
        <p class="tu-lead">${firstRun ? '캐릭터를 누르면 그 역할의 영역·프로젝트를 적습니다. 필요 없는 역할은 <b>×</b>, 없는 역할은 <b>+</b>로.' : '지금 있는 역할입니다. 누르면 그 아래에 <b>새 영역·프로젝트</b>를 더할 수 있어요. 이미 있는 폴더는 바뀌지 않습니다.'}</p></div>
      <div class="tu-rg">${roles.map((r, i) => `<div class="tu-rc${hasNew(r) ? ' filled' : ''}${r.existing ? ' exist' : ''}" data-role="${i}" role="button" tabindex="0" aria-label="${esc(r.ko)} 역할 ${r.existing ? '보기·더하기' : '채우기'}">${r.existing ? '<span class="tu-rex">이미 있음</span>' : `<button class="tu-rx" type="button" data-rx="${i}" title="${esc(r.ko)} 빼기" aria-label="${esc(r.ko)} 역할 빼기">${X}</button>`}
          <div class="ps-fig ps-turned">${Persona.pic(r.ko, { index: i, sub: hasNew(r) ? newCounts(r) : r.existing ? counts(r) : '눌러서 채우기' })}</div>${hasNew(r) ? `<span class="tu-rok">${CHECK}</span>` : ''}</div>`).join('')}
        ${adding ? `<div class="tu-rc tu-radd on"><span class="tu-plus">+</span><input class="tu-in" id="tu-newrole" maxlength="30" placeholder="역할 이름(예: 교무부장)" spellcheck="false" autocomplete="off"><div class="tu-btns"><button class="tu-btn sm" data-act="add-cancel" type="button">취소</button><button class="tu-btn sm accent" data-act="add-ok" type="button">추가</button></div></div>`
          : nNew < 20 ? `<button class="tu-rc tu-radd" type="button" data-act="add-role"><span class="tu-plus">+</span><b>역할 추가</b><small>직접 이름 짓기</small></button>` : ''}</div>
      ${makeBar(any ? `<b>${roles.filter(hasNew).map(r => esc(r.ko)).join(' · ')}</b> ${roles.filter(hasNew).length}개 역할 · 확인한 뒤 만들${firstRun ? '어야 다음으로 넘어갑니다' : '면 됩니다'}` : firstRun ? '역할 캐릭터를 눌러 영역·프로젝트를 적어 주세요' : '새로 더할 것이 없으면 그냥 「다음」으로 넘어가세요', !any)}
      ${undo ? `<div class="tu-toast">「${esc(undo.role.ko)}」 역할을 뺐습니다 <button type="button" data-act="undo">되돌리기</button></div>` : ''}`;
  }
  function makeBar(msg, disabled) {
    if (made === 'made') return `<div class="tu-bbar ok" id="tu-made"><span class="tu-okc">${CHECK}</span><span><b>${madeN ? `새 폴더 ${madeN}개를 만들었습니다.` : '폴더가 모두 이미 있습니다.'}</b> 이제 「다음」으로 넘어갈 수 있어요.</span></div>`;
    const err = lastPlan && !lastPlan.ok && roles.some(hasNew) ? `<div class="tu-errs">${lastPlan.errors.slice(0, 3).map(e => `<div>· ${esc(e.message)}</div>`).join('')}</div>` : '';
    return `<div class="tu-bbar${made === 'changed' ? ' warn' : ''}"><span>${made === 'changed' ? '<b>바뀐 내용이 있어요.</b> 다시 승인해야 다음으로 넘어갑니다' : msg}${err}</span><span class="tu-gap"></span><button class="tu-btn accent" type="button" id="tu-make" data-act="make"${disabled || err ? ' disabled' : ''}>${made === 'changed' ? '바뀐 대로 다시 만들기' : '폴더 만들기'}</button></div>`;
  }

  /** 계획(데몬) 결과를 화면의 줄에 잇는다 — 보낸 순서(역할 → 영역 → 프로젝트)와 계획의 순서가 같다. */
  function assignCodes() {
    codeMap = new Map(); if (!lastPlan?.ok) return;
    const it = lastPlan.items; let i = 0;
    for (const r of roles.filter(hasNew)) { codeMap.set(r, it[i++]); for (const d of sentD(r)) { codeMap.set(d, it[i++]); for (const p of sentP(d)) codeMap.set(p, it[i++]); } }
  }
  const codeFor = (obj, letter) => { const it = codeMap.get(obj); return it ? it.name.replace(/^〖[^〗]*〗/, '').split('-')[0] : `${letter}··`; };
  const FOLD = (lv) => `<svg class="tu-tfic l${lv}" viewBox="0 0 32 26" aria-hidden="true"><path d="M2 4a2 2 0 0 1 2-2h8l3 3h13a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="currentColor" opacity=".18"/><path d="M2 9h28v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="currentColor"/></svg>`;
  /** 새로 적는 줄(이름 칸). obj = 화면의 역할·영역·프로젝트 객체(계획 번호를 찾는 열쇠). */
  function trow(lv, obj, letter, key, { extra = '', del = '', ph = '이름' } = {}) {
    const en = enOf(obj.ko), it = codeMap.get(obj);
    const into = it?.exists ? `<span class="tu-exist" title="같은 이름의 폴더가 이미 있어 그 안에 더합니다">이미 있음 · ${esc(it.name)}</span>` : '';
    return `<div class="tu-tr lv${lv}">${FOLD(lv)}<span class="tu-cd">${esc(codeFor(obj, letter))}-</span><input class="tu-tn" data-k="${key}" value="${esc(obj.ko)}" placeholder="${ph}" maxlength="30" spellcheck="false" autocomplete="off" aria-label="${LV[lv]} 이름"><span class="tu-ten">${en ? `(${esc(en)})` : ''}</span>${extra}${into}<span class="tu-tlv">${LV[lv]}</span>${del}</div>`;
  }
  /** 이미 있는 폴더 줄 — 잠김(이름 고치기·빼기 없음). */
  const rorow = (lv, obj) => `<div class="tu-tr lv${lv} ro" title="${esc(obj.existing)}">${FOLD(lv)}<span class="tu-cd">${obj.group ? `〖${esc(obj.group)}〗` : ''}${esc(obj.code)}-</span><span class="tu-tn ro">${esc(obj.ko)}</span>${(obj.tags || []).map(t => `<span class="tu-ttag">〖${esc(t)}〗</span>`).join('')}<span class="tu-exist">이미 있음</span><span class="tu-tlv">${LV[lv]}</span></div>`;
  function treeHtml() {
    const r = roles[active];
    const rows = [`<div class="tu-tr lv0">${FOLD(0)}<b>${esc(info?.rootName || 'IRIS')}</b><span class="tu-tlv">내 폴더</span></div>`, r.existing ? rorow(1, r) : trow(1, r, 'R', 'r', { ph: '역할 이름' })];
    r.domains.forEach((d, i) => {
      if (d.existing) rows.push(rorow(2, d));
      else rows.push(trow(2, d, 'D', `d.${i}`, { ph: '영역 이름(예: 수업)', del: `<button class="tu-tx" type="button" data-rm="d.${i}" title="영역 빼기(안의 프로젝트도)" aria-label="영역 빼기">${X}</button>` }));
      const old = d.projects.filter(p => p.existing);
      old.slice(0, 6).forEach(p => rows.push(rorow(3, p)));
      if (old.length > 6) rows.push(`<div class="tu-tr lv3 ro more"><span class="tu-more">… 이미 있는 프로젝트 ${old.length - 6}개 더</span></div>`);
      d.projects.forEach((p, j) => { if (p.existing) return; rows.push(trow(3, p, 'P', `p.${i}.${j}`, { ph: '프로젝트 이름(예: 물리학)',
        extra: `<select class="tu-tper" data-k="per.${i}.${j}" aria-label="기간">${PERIOD_OPTS().map(o => `<option value="${esc(o)}"${o === (p.period || '') ? ' selected' : ''}>${o ? `〖${esc(o)}〗` : '기간 없음'}</option>`).join('')}</select>`,
        del: `<button class="tu-tx" type="button" data-rm="p.${i}.${j}" title="프로젝트 빼기" aria-label="프로젝트 빼기">${X}</button>` })); });
      if (newP(d).length < 5) rows.push(`<div class="tu-tr lv3 add"><button class="tu-tadd" type="button" data-add="p.${i}">+ 프로젝트</button></div>`);
    });
    const sug = (SUGGEST[r.ko.trim()] || []).filter(k => !r.domains.some(d => d.ko.trim() === k));
    if (r.domains.filter(d => !d.existing).length < 5) rows.push(`<div class="tu-tr lv2 add"><button class="tu-tadd" type="button" data-add="d">+ 영역</button>${sug.length ? `<span class="tu-qa">빠른 추가 ${sug.map(k => `<button class="tu-sg" type="button" data-q="${esc(k)}">+ ${esc(k)}</button>`).join('')}</span>` : ''}</div>`);
    return `<div class="tu-dl"><button class="tu-back" type="button" data-act="grid" title="Esc">← 역할 목록</button><div class="ps-fig ps-turned chosen tu-me" id="tu-me">${Persona.pic(r.ko, { index: active, sub: counts(r), empty: !r.ko.trim(), placeholder: '이름 짓기' })}</div>
        ${r.existing ? '' : '<button class="tu-btn sm tu-rmrole" type="button" data-act="rm-role">이 역할 빼기</button>'}</div>
      <div class="tu-dr"><div class="tu-k">${esc(r.ko || '새 역할')} · 내 폴더</div><h3>이렇게 <span>폴더</span>가 만들어집니다</h3>
        <div class="tu-howto"><span><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg> 이름을 <b>눌러서 고치기</b></span><span><i>+</i> 눌러서 <b>더하기</b></span><span><i class="x">×</i> 눌러서 <b>빼기</b></span><small>번호·영어·기간 표시는 IRIS가 붙입니다${r.existing || r.domains.some(d => d.existing) ? ' · 회색 「이미 있음」 줄은 그대로 둡니다' : ''}</small></div>
        <div class="tu-tree" id="tu-tree">${rows.join('')}</div>${makeBar(roles.some(hasNew) ? `새 폴더를 확인한 뒤 만들${firstRun ? '어야 다음으로 넘어갑니다' : '면 됩니다'}` : r.existing ? '새 영역·프로젝트를 더하면 「폴더 만들기」가 켜집니다' : '영역을 하나 이상 적어 주세요', !roles.some(hasNew))}</div>`;
  }
  const buildHtml = () => !Persona.gender() ? genderHtml() : view === 'tree' && roles[active] ? treeHtml() : gridHtml();

  async function refreshPlan() {
    const spec = specOf();
    if (!spec.roles.length) { lastPlan = null; codeMap = new Map(); if (SCENES[step]?.kind === 'build' && isOpen()) repaint(true); return; }
    try { lastPlan = await (await fetch('/api/tutorial/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec }) })).json(); } catch { lastPlan = { ok: false, errors: [{ message: '계획을 불러오지 못했습니다.' }] }; }
    assignCodes();
    if (SCENES[step]?.kind === 'build' && isOpen()) repaint(true);
  }
  const schedulePlan = () => { clearTimeout(planTimer); planTimer = setTimeout(refreshPlan, 220); };
  /** 내 폴더 장면 다시 그리기. soft = 입력 중(초점·글자 위치를 지킨다). */
  function repaint(soft) {
    const host = $('.tu-q-host', el()); if (!host) return;
    const f = soft ? document.activeElement : null, key = f?.dataset?.k, pos = f?.selectionStart, sc = $('#tu-tree', host)?.scrollTop;
    host.className = `tu-q-host v-${!Persona.gender() ? 'gender' : view}`; host.innerHTML = buildHtml(); Persona.watch(host); Persona.fit(host); gate();
    if (sc != null && $('#tu-tree', host)) $('#tu-tree', host).scrollTop = sc;
    if (key) { const n = host.querySelector(`[data-k="${CSS.escape(key)}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }
  }

  // ---------- 확인 창(폴더 만들기 · 닫기) ----------
  function modalBox(html) {
    const m = document.createElement('div'); m.className = 'tu-modal'; modal = true;
    m.innerHTML = `<div class="tu-mbox" role="dialog" aria-modal="true">${html}</div>`;
    $('.tu-panel', el()).appendChild(m); return m;
  }
  function confirmMake() {
    if (!lastPlan?.ok) return;
    const items = lastPlan.items, fresh = items.filter(it => !it.exists).length;
    const m = modalBox(`<h4>이대로 폴더를 만들까요?</h4><p>아래 <b>${fresh}개 폴더</b>가 ${esc(info?.rootName || 'IRIS')} 폴더 안에 만들어집니다. 이미 있는 폴더는 건드리지 않습니다.</p>
      <div class="tu-mlist">${items.map(it => `<div style="padding-left:${({ R: 0, D: 1, P: 2 }[it.level]) * 20}px">${FOLD(({ R: 1, D: 2, P: 3 }[it.level]))}<span>${esc(it.name)}</span>${it.exists ? '<small>이미 있음</small>' : ''}</div>`).join('')}</div>
      <div class="tu-btns end"><button class="tu-btn" type="button" data-m="no">다시 고칠래요</button><button class="tu-btn accent" type="button" data-m="yes">이대로 만들기</button></div><div class="tu-errs" id="tu-merr"></div>`);
    m.querySelector('.tu-mbox').setAttribute('aria-label', '폴더 만들기 확인'); $('[data-m="yes"]', m).focus();
    m.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-m]')?.dataset.m; if (!a && e.target !== m) return;
      if (a !== 'yes') return closeModal();
      const b = $('[data-m="yes"]', m); b.disabled = true; b.textContent = '만드는 중…';
      const r = await make();
      if (r.ok) closeModal(); else { b.disabled = false; b.textContent = '이대로 만들기'; $('#tu-merr', m).innerHTML = (r.errors || []).map(x => `<div>· ${esc(x.message)}</div>`).join(''); }
    });
  }
  /** × 닫기 — 적던 폴더 계획이 있으면 한 번 묻는다(페이지 안 확인 창: 앱 Dialog 는 튜토리얼 판 아래에 깔린다). */
  function requestClose() {
    if (!dirty()) return closeLater();
    const m = modalBox(`<h4>튜토리얼을 닫을까요?</h4><p>적던 폴더 계획은 <b>만들어지지 않고 사라집니다.</b> 튜토리얼은 설정 → 업데이트·정보에서 다시 볼 수 있어요.</p>
      <div class="tu-btns end"><button class="tu-btn" type="button" data-m="no">계속 보기</button><button class="tu-btn accent" type="button" data-m="yes">닫기</button></div>`);
    m.querySelector('.tu-mbox').setAttribute('aria-label', '튜토리얼 닫기 확인'); $('[data-m="no"]', m).focus();
    m.addEventListener('click', (e) => { const a = e.target.closest('[data-m]')?.dataset.m; if (!a && e.target !== m) return; closeModal(); if (a === 'yes') closeLater(); });
  }
  async function closeLater() {
    await done(true); close();
    try { Notify.push({ title: '튜토리얼은 언제든 다시 볼 수 있습니다', sub: '설정 → 업데이트·정보 → 「튜토리얼 다시 보기」', status: 'idle', force: true }); } catch {}
  }
  function closeModal() { const m = $('.tu-modal', el()); if (!m) return false; m.remove(); modal = false; ($('#tu-make', el()) || $('.tu-x', el()))?.focus(); return true; }
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
      if (a[0] === 'r') { const me = $('#tu-me', root); if (me) { me.innerHTML = Persona.pic(v, { index: active, sub: counts(r), empty: !v.trim(), placeholder: '이름 짓기' }); Persona.fit(me); } }
      schedulePlan();
    });
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'tu-newrole') { e.preventDefault(); addRole(); } });
    root.addEventListener('click', async (e) => {
      if (!e.target.closest('.tu-q-host')) return;
      const b = e.target.closest('button'), card = e.target.closest('[data-role]');
      if (b?.dataset.gender) { await Persona.setGender(b.dataset.gender); repaint(); return; }
      if (b?.dataset.rx != null) { const i = +b.dataset.rx; if (roles[i]?.existing) return; undo = { role: roles[i], at: i }; roles.splice(i, 1); touched(); repaint(); schedulePlan(); return; }
      if (b?.dataset.act === 'rm-role') { const r = roles[active]; if (!r || r.existing) return; undo = { role: r, at: active }; roles.splice(active, 1); view = 'grid'; touched(); repaint(); schedulePlan(); return; }
      if (b?.dataset.act === 'undo') { if (undo) roles.splice(Math.min(undo.at, roles.length), 0, undo.role); undo = null; touched(); repaint(); schedulePlan(); return; }
      if (b?.dataset.act === 'add-role') { adding = true; repaint(); $('#tu-newrole', root)?.focus(); return; }
      if (b?.dataset.act === 'add-cancel') { adding = false; repaint(); return; }
      if (b?.dataset.act === 'add-ok') return addRole();
      if (b?.dataset.act === 'grid') { view = 'grid'; repaint(); return; }
      if (b?.dataset.act === 'make') return confirmMake();
      if (!b && card) { openRole(+card.dataset.role, card); return; }
      if (!b) return;
      const r = roles[active];
      if (b.dataset.rm) { const a = b.dataset.rm.split('.'); if (a[0] === 'd') { if (r.domains[+a[1]]?.existing) return; r.domains.splice(+a[1], 1); } else { if (r.domains[+a[1]].projects[+a[2]]?.existing) return; r.domains[+a[1]].projects.splice(+a[2], 1); } }
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
    const from = card?.querySelector('.ps-pp')?.getBoundingClientRect(); active = i; view = 'tree'; undo = null; repaint();
    if (from) Persona.walkFrom($('#tu-me', el()), from);
    const r = roles[i]; if (!r.domains.length) $('.tu-tadd[data-add="d"]', el())?.focus(); schedulePlan();
  }
  function addRole() {
    const v = ($('#tu-newrole', el())?.value || '').trim(); if (!v) return;
    roles.push({ ko: v, domains: [] }); adding = false; touched(); openRole(roles.length - 1, null);
  }

  // ---------- 장면 그리기 · 이동 ----------
  /** 「다음」·장 머리는 내 폴더에서 폴더를 만들어야(승인) 열린다 — 역할 폴더가 하나도 없던 첫 실행에만. */
  const locked = () => firstRun && made !== 'made';
  function gate() {
    const root = el(); if (!root) return; const nx = $('[data-nav="next"]', root), on = SCENES[step]?.kind === 'build' && locked();
    nx.disabled = on; nx.title = on ? '폴더 구조를 확인하고 「폴더 만들기」를 눌러야 넘어갈 수 있어요' : '';
    $('.tu-gate', root).hidden = !on;
    const bi = buildIdx();
    root.querySelectorAll('.tu-steps li').forEach((li) => { const first = SCENES.findIndex(s => s.chap === li.dataset.chap); li.classList.toggle('lock', locked() && first > bi); });
  }
  function render() {
    const root = el(); if (!root) return;
    const sc = SCENES[step], ci = CHAPTERS.findIndex(c => c[0] === sc.chap);
    root.querySelector('.tu-steps').innerHTML = CHAPTERS.map(([id, label], i) => `<li class="${i === ci ? 'cur' : i < ci ? 'done' : ''}" data-chap="${id}" title="${esc(label)}"${i === ci ? ' aria-current="step"' : ''}><span class="tu-dotn">${i < ci ? CHECK : i + 1}</span><em>${esc(label)}</em></li>`).join('');
    $('.tu-pno', root).textContent = `${step + 1} / ${SCENES.length}`;
    $('[data-nav="restart"]', root).hidden = step === 0;
    const deck = $('.tu-deck', root), body = $('.tu-body', root);
    if (sc.kind === 'deck') { body.hidden = true; body.innerHTML = ''; deck.hidden = false; showSlide(sc.no); }
    else {
      deck.hidden = true; pauseVideos(); body.hidden = false;
      body.className = `tu-body sc-${sc.kind}`; body.scrollTop = 0;
      if (sc.kind === 'build') { if (!Persona.gender()) view = 'grid'; body.innerHTML = `<div class="tu-q-host v-${!Persona.gender() ? 'gender' : view}">${buildHtml()}</div>`; const h = $('.tu-q-host', body); Persona.watch(h); Persona.fit(h); schedulePlan(); }
      else { const n = NATIVE[sc.kind]; body.innerHTML = `<div class="tu-text">${n.text()}</div><div class="tu-art">${n.art()}</div>${n.pill ? `<div class="tu-pill">${n.pill}</div>` : ''}`; }
    }
    root.querySelector('[data-nav="prev"]').hidden = step === 0;
    root.querySelector('[data-nav="next"]').hidden = step === SCENES.length - 1;
    root.querySelector('[data-nav="next"]').textContent = step === 0 ? '시작하기' : '다음';
    gate(); saveStep();
  }
  const go = (n) => { n = Math.max(0, Math.min(SCENES.length - 1, n)); const bi = buildIdx(); if (n > bi && step <= bi && locked()) n = bi; if (n === step) return; step = n; render(); };
  /** 보던 쪽 기억(다시 보기 = 이어서). 잦은 저장을 막으려 잠깐 모아서. */
  let pendingStep = null;
  const postStep = (id) => fetch('/api/tutorial/prefs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: id }), keepalive: true }).catch(() => {});
  function saveStep() { clearTimeout(saveTimer); pendingStep = SCENES[step]?.id; saveTimer = setTimeout(() => { const id = pendingStep; pendingStep = null; if (id) postStep(id); }, 600); }
  /** 모아 둔 저장을 지금 보낸다 — 닫기·첫 대화 직전(0.6초 안에 닫으면 바로 앞 쪽이 남던 결함, v2.95 검사에서 발견). */
  async function flushStep() { clearTimeout(saveTimer); const id = pendingStep; pendingStep = null; if (id) await postStep(id); }

  async function done(skipped) { await flushStep(); try { await fetch('/api/tutorial/done', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skipped }) }); } catch {} }
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
    d.innerHTML = `<div class="tu-panel" role="dialog" aria-label="IRIS 시작하기" tabindex="-1"><div class="tu-head"><span class="tu-brand"><span class="tu-mark" aria-hidden="true"></span><span class="tu-word">IRIS</span><span class="tu-brand-sub">시작하기</span></span><ol class="tu-steps"></ol>
        <span class="tu-head-end"><span class="tu-pno"></span><button class="tu-btn sm ghost" type="button" data-nav="restart" hidden>처음부터</button><button class="tu-x" type="button" data-nav="close" title="닫기 — 설정 → 업데이트·정보에서 다시 볼 수 있어요" aria-label="튜토리얼 닫기">${X.replace(/width="12" height="12"/, 'width="16" height="16"')}</button></span></div>
      <div class="tu-stage"><div class="tu-deck" hidden></div><div class="tu-body"></div></div>
      <div class="tu-foot"><span class="tu-gap"></span><span class="tu-gate" hidden>폴더를 만들면 다음으로 넘어갑니다</span><button class="tu-btn" data-nav="prev">이전</button><button class="tu-btn accent" data-nav="next">다음</button></div>
      <div class="tu-zoom" hidden data-act="unzoom"><img alt="" src=""></div></div>`;
    document.body.appendChild(d);
    // 튜토리얼 안의 키는 문서로 올려 보내지 않는다 — 확인 카드 1~9·단축키·Esc(작업 중단)가 입력칸 글자에 반응하지 않게
    d.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && e.target.matches?.('input') && e.target.id !== 'tu-newrole') e.preventDefault();
      if (e.key === 'Escape' && back()) { e.preventDefault(); return; }
      arrows(e);
    });
    // 초점이 판 밖(문서 몸통 등)에 있어도 ← → 는 쪽 넘기기 — 판 안의 키는 위에서 처리하고 올려 보내지 않는다
    document.addEventListener('keydown', (e) => { if (isOpen() && !d.contains(e.target)) arrows(e); });
    bindBuild(d);
    d.addEventListener('click', async (e) => {
      const nav = e.target.closest('[data-nav]')?.dataset.nav;
      if (nav === 'next') return go(step + 1);
      if (nav === 'prev') return go(step - 1);
      if (nav === 'restart') return go(0);
      if (nav === 'close') return requestClose();
      const g = e.target.closest('[data-chap]'); if (g && !g.classList.contains('lock')) return go(SCENES.findIndex(s => s.chap === g.dataset.chap));
      const o = e.target.closest('[data-open]'); if (o) { try { await fetch('/api/open-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rel: o.dataset.open }) }); } catch {} return; }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'zoom') { const z = $('.tu-zoom', d), img = e.target.closest('.tu-pic')?.querySelector('img'); if (z && img) { z.querySelector('img').src = img.src; z.querySelector('img').alt = img.alt; z.hidden = false; } return; }
      if (a === 'unzoom') return unzoom();
      if (a === 'first') return firstChat();
      if (a === 'first-anyway') { const m = $('#tu-fc-msg'); if (m) m.dataset.anyway = '1'; return; }
      if (a === 'home') { await done(false); close(); }
    });
  }
  /** ← → = 쪽 넘기기(입력칸·고르기·영상 위에서는 그 칸의 키로 둔다 · 확인 창·크게 보기 중에는 넘기지 않는다). */
  function arrows(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const t = e.composedPath?.()[0] || e.target;
    if (modal || /^(INPUT|SELECT|TEXTAREA|VIDEO)$/.test(t?.tagName || '') || !$('.tu-zoom', el()).hidden) return;
    e.preventDefault();
    if (e.key === 'ArrowLeft') go(step - 1); else if (!$('[data-nav="next"]', el()).disabled) go(step + 1);
  }
  /** 크게 보기(사용법 캡처)를 닫는다. 닫았으면 true. */
  function unzoom() { const z = el() && $('.tu-zoom', el()); if (!z || z.hidden) return false; z.hidden = true; return true; }
  /** 머리 「IRIS」 = 앱 헤더와 같은 마크·글자체(settings.js BRAND 가 #mark-slot·#wordmark 에 적용한 것을 그대로 빌린다 — 원천은 BRAND 하나). */
  function paintBrand() {
    const mark = $('.tu-mark', el()), word = $('.tu-word', el()), wm = $('#wordmark'), slot = $('#mark-slot');
    if (mark && slot) mark.innerHTML = slot.innerHTML;
    if (word && wm) word.style.cssText = wm.style.cssText;
  }
  /** 연다. 다시 볼 때도 보던 쪽에서 이어서(맨 끝까지 봤으면 처음부터) — 머리 「처음부터」로 언제든 처음으로. */
  async function open() {
    ensureDom(); paintBrand(); unzoom(); closeModal();
    try { info = await (await fetch('/api/tutorial')).json(); } catch { info = info || {}; }
    Persona._set(info?.gender);
    await loadDeck();
    firstRun = !info?.hasRoles;
    roles = await initRoles(); view = 'grid'; active = 0; adding = false; made = ''; madeN = 0; undo = null; created = []; lastPlan = null; codeMap = new Map();
    const i = SCENES.findIndex(s => s.id === info?.step); step = i >= 0 && i < SCENES.length - 1 ? i : 0;
    el().hidden = false; document.body.classList.add('tu-open'); render(); fitDeck();
    try { $('.tu-panel', el()).focus({ preventScroll: true }); } catch {} // 키(← → · Esc)가 처음부터 판에 오게
  }
  function close() { flushStep(); const d = el(); if (d) d.hidden = true; pauseVideos(); document.body.classList.remove('tu-open'); try { opts.onClose(); } catch {} }
  /** 데몬 인수 정보(hello·방송)를 받을 때마다 — 설치·로그인이 끝났고 아직 안 한 PC 면 한 번 연다. */
  function maybeOpen(h) { if (!autoShown && h?.tutorial?.due && !isOpen()) { autoShown = true; open(); } }
  function init(o) { opts = { ...opts, ...(o || {}) }; ensureDom(); }
  /** Esc(판 keydown·문서·Electron 중계 길): 확인 창 → 크게 보기 → 역할 추가 칸 → 나무 → 역할 목록. 튜토리얼 자체는 닫지 않는다. 처리했으면 true. */
  function back() {
    if (closeModal()) return true;
    if (unzoom()) return true;
    if (SCENES[step]?.kind === 'build' && adding) { adding = false; repaint(); return true; }
    if (SCENES[step]?.kind === 'build' && view === 'tree') { view = 'grid'; repaint(); $(`[data-role="${active}"]`, el())?.focus(); return true; }
    return false;
  }

  return { init, open, close, isOpen, maybeOpen, back };
})();
