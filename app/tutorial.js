// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 첫 실행 튜토리얼(v2.90, 2026-10-19 사용자 결정): AI 첫 세션 자동 시작을 없애고, 미리 써 둔 글·그림으로만 진행한다(AI 호출 0).
   흐름 = 연수 「교사를 위한 에이전트」 1편: ⓪ 환영 → ① 에이전트란 → ② 일을 잘하게 하는 3가지 → ③ 온톨로지 R/D/P → ④ 내 폴더 만들기
   → ⑤ 레퍼런스 → ⑥ 도구 → ⑦ 사용법 → ⑧ 마무리(「첫 대화 해 보기」는 사용자가 누를 때만, 보내기도 사용자).
   관통 비유 = 두뇌+팔다리=몸(에이전트) · 전입 첫날(학교 지도와 내 책상 / 작년 서류철 / 팔다리).
   그림(v2.93, 2026-10-22 사용자 "선 그림이 매우 구림") = 코덱스 일러스트(따뜻한 평면 화풍, 그림 속 글자 없음) WebP `app/tutorial/*.webp`(합계 약 0.6MB),
   ⑦ 사용법만 실제 화면 캡처 + 번호 표. 원본 PNG·프롬프트 = docs\튜토리얼그림-원본\(패키지·공개 저장소 제외). 그림은 자기 배경을 가진 둥근 카드라 밝은 테마에서도 액자처럼 보인다.
   데몬: GET /api/tutorial · POST /api/tutorial/{plan,structure,done} · POST /api/open-folder · GET /api/tools · GET /api/relay/ready. 설계 = docs\설계-튜토리얼-2026-10-19.md */
window.Tutorial = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let opts = { onFirstChat: () => {}, onClose: () => {} };
  let step = 0, info = null, autoShown = false, created = [], tools = null, planTimer = 0, lastPlan = null, picked = false;
  const form = { role: { ko: '', en: '' }, domains: [{ ko: '', en: '', projects: [] }] };
  const el = () => $('#tutorial');
  const isOpen = () => !!el() && !el().hidden;

  // ---------- 그림(코덱스 일러스트 · 사용법은 실제 화면 캡처) — 대체 글은 화면 읽기 프로그램용 ----------
  const ART = {
    welcome: '밤의 책상에서 선생님이 노트북의 IRIS 큐브를 바라보고, 작은 도우미 로봇이 노트북 뒤에서 웃고 있는 그림',
    agent: '왼쪽은 말풍선 속 두뇌만 있어 선생님이 서류를 혼자 떠안은 모습, 오른쪽은 같은 두뇌를 머리에 넣은 로봇이 직접 서류를 처리하고 선생님은 차를 마시는 모습',
    three: '새 학교 복도에 선 선생님 위로 학교 지도, 작년 서류철, 도구를 든 로봇 팔이 세 개의 빛나는 원 안에 떠 있는 그림',
    rdp: '맨 위 큰 폴더에서 아래 폴더들로 가지가 뻗고, 폴더마다 붙은 메모를 따라 빛이 아래로 흘러가는 폴더 나무 그림',
    reference: '선생님이 작년 계획서·양식·좋은 예시를 프로젝트 상자에 넣고, 로봇이 예시를 보고 같은 모양의 새 문서를 만드는 그림',
    tools: '로봇이 멀티탭에 케이블을 꽂아 문서, 표, PDF, 클라우드, 검색, 메일을 직접 다루는 그림',
    usage: 'IRIS 화면 캡처: ① 작업목록 ② 새 요청(+) ③ 확인 카드 ④ 대화/터미널 전환 ⑤ 설정 ⑥ 입력창에 번호가 붙어 있다',
    finish: '새벽빛 속에서 선생님과 로봇이 기뻐하고, 지도·서류철·도구 세 개에 체크 표시가 떠 있는 그림',
  };
  const pic = (id) => `<figure class="tu-pic${id === 'usage' ? ' shot' : ''}"${id === 'usage' ? ' data-act="zoom" title="크게 보기"' : ''}><img src="/app/tutorial/${id}.webp" alt="${esc(ART[id])}" decoding="async" draggable="false"></figure>`;
  // ③ 온톨로지: 일러스트 아래에 실제 폴더 이름 모양(그림 속 글자는 틀릴 수 있어 글은 HTML 로)
  const MINI_TREE = [['IRIS', 0], ['R01-교사(Teacher)', 1], ['D01-수업(Teaching)', 2], ['P01-물리학 〖2026년.2학기〗', 3], ['D02-담임(Homeroom)', 2], ['P01-담임 〖2026년 1학년 3반〗', 3]];
  const miniTree = () => `<div class="tu-mini" aria-label="폴더 이름 예시">${MINI_TREE.map(([t, lv]) => `<div class="tu-mini-row lv${lv}">${lv ? FOLDER : ''}<span>${esc(t)}</span>${lv ? '<small>AGENTS.md</small>' : ''}</div>`).join('')}<div class="tu-mini-flow">규칙 메모는 위에서 아래로 물려 내려갑니다</div></div>`;
  // v2.90 의 선 그림(SVG)은 v2.93 에서 일러스트로 바꾸며 지웠다 — 옛 코드는 git v2.92.1

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
      body: ['<b>① 작업목록</b>: 열린 대화들. 이름에 마우스를 올리면 연필로 이름을 바꿀 수 있습니다.', '<b>② 새 요청(+)</b>: 폴더를 고르고 → Claude/Codex와 모델을 고르고 → 요청을 적어 보냅니다.', '<b>③ 확인 카드</b>: 중요한 일 전에 허락을 묻습니다. 숫자(1, 2…)나 단추로 답합니다.', '<b>④ 대화/터미널</b> 전환 · <b>⑤ 설정(⚙)</b> · <b>⑥ 입력창</b>(이어서 시킬 일, 파일 끌어다 놓기) · <b>Esc</b> = 하던 일 멈추기'],
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
  const CHECK = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const periods = () => { const y = info?.year || new Date().getFullYear(); return ['', `${y}년`, `${y}년.1학기`, `${y}년.2학기`, `${y + 1}년`]; };
  const inp = (k, v, ph, cls = '') => `<input class="tu-in ${cls}" data-k="${k}" value="${esc(v)}" placeholder="${esc(ph)}" maxlength="${cls.includes('en') ? 40 : 30}" spellcheck="false" autocomplete="off">`;
  // v2.91: 역할 = 「별빛의 분신」 캐릭터(app/persona.js) — 고르기 격자 → 고르면 왼쪽으로 걸어가 이름 칸 위에 서고, 오른쪽에 영역·프로젝트 트리 편집.
  const counts = () => { const ds = form.domains.filter(d => d.ko.trim()); return `영역 ${ds.length} · 프로젝트 ${ds.reduce((s, d) => s + d.projects.filter(p => p.ko.trim()).length, 0)}`; };
  const meSvg = () => Persona.svg(form.role.ko, { sub: counts(), empty: !form.role.ko.trim(), placeholder: '이름 짓기' });
  function pickHtml() {
    return `<div class="tu-build tu-pick"><div class="tu-q"><h4><span class="tu-qn">1</span><span>어떤 <b>역할</b>로 일하시나요?</span> <small>캐릭터를 누르세요 — 가슴의 명찰이 역할입니다</small></h4>
      <div class="ps-pick tu-grid">${ROLES.map(([k, e]) => `<button class="ps-fig ps-turned${form.role.ko === k ? ' cur' : ''}" type="button" data-act="role" data-ko="${k}" data-en="${e}" aria-label="${k} 역할 고르기">${Persona.svg(k, { sub: e })}</button>`).join('')}
        <button class="ps-fig ps-turned tu-new" type="button" data-act="role-new" aria-label="새 역할 만들기">${Persona.svg('', { empty: true, placeholder: '새 역할' })}<span class="ps-tag">직접 이름 짓기</span></button></div>
      <p class="tu-note">캐릭터는 하나, 명찰만 바뀝니다. 이름마다 몸의 별자리 무늬가 조금씩 달라요. 고른 뒤에도 이름은 마음대로 고칠 수 있습니다.</p></div></div>`;
  }
  function buildHtml() {
    if (!picked) return pickHtml();
    const sug = SUGGEST[form.role.ko] || [];
    const dRows = form.domains.map((d, i) => `<div class="tu-d"><div class="tu-row"><span class="tu-code">D${String(i + 1).padStart(2, '0')}</span>${inp(`d.${i}.ko`, d.ko, '영역 이름(예: 수업)')}${inp(`d.${i}.en`, d.en, 'English (선택)', 'en')}<button class="tu-x" data-act="rm-d" data-i="${i}" title="이 영역 빼기">×</button></div>
      ${d.projects.map((p, j) => `<div class="tu-row tu-p"><span class="tu-code">P${String(j + 1).padStart(2, '0')}</span>${inp(`p.${i}.${j}.ko`, p.ko, '프로젝트(예: 물리학)')}${inp(`p.${i}.${j}.en`, p.en, 'English (선택)', 'en')}<select class="tu-in tu-sel" data-k="p.${i}.${j}.period">${periods().map(o => `<option value="${esc(o)}"${o === (p.period || '') ? ' selected' : ''}>${o ? esc(o) : '기간 없음'}</option>`).join('')}</select><button class="tu-x" data-act="rm-p" data-i="${i}" data-j="${j}" title="이 프로젝트 빼기">×</button></div>`).join('')}
      ${d.projects.length < 5 ? `<button class="tu-add tu-add-p" data-act="add-p" data-i="${i}">+ 프로젝트</button>` : ''}</div>`).join('');
    return `<div class="tu-build tu-picked"><div class="tu-me-col">
        <button class="tu-link" type="button" data-act="unpick" title="Esc">← 다른 역할</button>
        <div class="ps-fig chosen ps-turned tu-me" id="tu-me">${meSvg()}</div>
        <label class="tu-lab"><span>역할 이름</span>${inp('r.ko', form.role.ko, '예: 교사')}</label><label class="tu-lab"><span>English <small>(선택)</small></span>${inp('r.en', form.role.en, 'Teacher', 'en')}</label>
      </div><div class="tu-q">
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
      if (a[0] !== 'r' || a[1] === 'ko') paintMe(); // 이름·영역 수가 바뀌면 명찰(과 이름 무늬)을 바로 다시 그린다
      schedulePlan();
    });
    root.addEventListener('change', (e) => { if (e.target.dataset?.k) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act; const i = +b.dataset.i, j = +b.dataset.j;
      if (act === 'make') return make();
      if (act === 'role' || act === 'role-new') {
        if (act === 'role') form.role = { ko: b.dataset.ko, en: b.dataset.en }; else if (ROLES.some(([k]) => k === form.role.ko)) form.role = { ko: '', en: '' };
        const from = b.getBoundingClientRect(); b.classList.add('chosen'); b.closest('.ps-pick')?.classList.add('picking');
        const go = () => { picked = true; repaint(); Persona.walkFrom($('#tu-me', root), from); if (act === 'role-new') $('[data-k="r.ko"]', root)?.focus(); schedulePlan(); };
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) go(); else setTimeout(go, 200);
        return;
      }
      if (act === 'unpick') return unpick();
      if (act === 'sug') { const ex = form.domains.findIndex(d => d.ko === b.dataset.ko); if (ex >= 0) form.domains.splice(ex, 1); else { const empty = form.domains.findIndex(d => !d.ko.trim() && !d.projects.length); if (empty >= 0) form.domains[empty] = { ko: b.dataset.ko, en: b.dataset.en, projects: [] }; else if (form.domains.length < 5) form.domains.push({ ko: b.dataset.ko, en: b.dataset.en, projects: [] }); } if (!form.domains.length) form.domains.push({ ko: '', en: '', projects: [] }); }
      else if (act === 'add-d') form.domains.push({ ko: '', en: '', projects: [] });
      else if (act === 'rm-d') { form.domains.splice(i, 1); if (!form.domains.length) form.domains.push({ ko: '', en: '', projects: [] }); }
      else if (act === 'add-p') form.domains[i].projects.push({ ko: '', en: '', period: '' });
      else if (act === 'rm-p') form.domains[i].projects.splice(j, 1);
      else return;
      repaint(); schedulePlan();
    });
  }
  /** ④ 장면 다시 그리기 — 캐릭터는 숨쉬기만(걷기는 고를 때 한 번). */
  function repaint() { const host = $('.tu-q-host', el()); if (!host) return; host.innerHTML = buildHtml(); Persona.watch(host); Persona.fit(host); }
  function paintMe() { const me = $('#tu-me', el()); if (!me) return; me.innerHTML = meSvg(); Persona.fit(me); }
  /** 다른 역할 고르기(격자로) — 적은 영역·프로젝트는 그대로 둔다. Esc 도 같다. 처리했으면 true. */
  function unpick() {
    if (!picked || SCENES[step]?.id !== 'build') return false;
    picked = false; repaint(); $(`.tu-q-host [data-act="role"][data-ko="${CSS.escape(form.role.ko)}"]`, el())?.focus();
    return true;
  }

  // ---------- 그리기 ----------
  const folderBtns = () => {
    const list = created.filter(it => it.level === 'P').length ? created.filter(it => it.level === 'P') : created;
    if (!list.length) return `<div class="tu-dim">아직 만든 폴더가 없습니다. 앞 장면에서 만들거나, IRIS 폴더를 열어 직접 넣어도 됩니다.</div><button class="tu-btn" data-open="">IRIS 폴더 열기</button>`;
    return list.slice(0, 6).map(it => `<button class="tu-btn sm" data-open="${esc(it.rel)}" title="${esc(it.rel)}">${FOLDER}${esc(it.name)}</button>`).join('');
  };
  function sceneHtml(sc) {
    if (sc.id === 'build') return `<div class="tu-text wide"><div class="tu-kicker">온톨로지 — 직접 해 보기</div><h2>${sc.title}</h2><p>역할 캐릭터를 고르고 영역·프로젝트를 적으면 IRIS가 규칙에 맞는 폴더와 규칙 메모를 만들어 줍니다. 나중에 얼마든지 더하거나 고칠 수 있습니다.</p></div><div class="tu-q-host">${buildHtml()}</div>`;
    const more = sc.more ? `<details class="tu-more"><summary>더 알아보기</summary><p>${sc.more}</p></details>` : '';
    let extra = '';
    if (sc.custom === 'ref') extra = `<div class="tu-extra"><div class="tu-extra-h">자료를 넣을 폴더 열기</div><div class="tu-btns">${folderBtns()}</div></div>`;
    if (sc.custom === 'tools') extra = `<div class="tu-extra" id="tu-tools">${tools ? toolsLine() : '<div class="tu-dim">이 컴퓨터의 도구를 세는 중…</div>'}</div>`;
    if (sc.custom === 'finish') extra = finishHtml();
    return `<div class="tu-text"><div class="tu-kicker">${step + 1}/${SCENES.length} · ${esc(sc.label)}</div><h2>${sc.title}</h2>${sc.body.map(l => `<p>${l}</p>`).join('')}${more}${extra}</div><div class="tu-art">${ART[sc.art] ? pic(sc.art) : ''}${sc.id === 'rdp' ? miniTree() : ''}</div>`;
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
    // v2.93: 번호 원 + 잇는 선 + 이름(가운데 정렬) — 지난 장면 = ✓, 지금 = 채운 원
    root.querySelector('.tu-steps').innerHTML = SCENES.map((s, i) => `<li class="${i === step ? 'cur' : i < step ? 'done' : ''}" data-go="${i}" title="${esc(s.label)}"${i === step ? ' aria-current="step"' : ''}><span class="tu-dotn">${i < step ? CHECK : i + 1}</span><em>${esc(s.label)}</em></li>`).join('');
    const body = root.querySelector('.tu-body'); body.className = `tu-body sc-${sc.id}`; body.innerHTML = sceneHtml(sc); body.scrollTop = 0;
    root.querySelector('[data-nav="prev"]').hidden = step === 0;
    root.querySelector('[data-nav="next"]').hidden = step === SCENES.length - 1;
    root.querySelector('[data-nav="next"]').textContent = step === 0 ? '시작하기' : '다음';
    if (sc.id === 'build') { const h = $('.tu-q-host', body); Persona.watch(h); Persona.fit(h); schedulePlan(); setTimeout(() => (body.querySelector('[data-k="r.ko"]') || body.querySelector('.ps-fig'))?.focus(), 60); }
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
    d.innerHTML = `<div class="tu-panel" role="dialog" aria-label="IRIS 시작하기"><div class="tu-head"><span class="tu-brand"><span class="tu-mark" aria-hidden="true"></span><span class="tu-word">IRIS</span><span class="tu-brand-sub">시작하기</span></span><ol class="tu-steps"></ol><span class="tu-head-end"></span></div><div class="tu-body"></div>
      <div class="tu-zoom" hidden data-act="unzoom"><img alt="" src=""></div>
      <div class="tu-foot"><button class="tu-btn ghost" data-nav="later">나중에 하기</button><span class="tu-gap"></span><button class="tu-btn" data-nav="prev">이전</button><button class="tu-btn accent" data-nav="next">다음</button></div></div>`;
    document.body.appendChild(d);
    // 튜토리얼 안의 키는 문서로 올려 보내지 않는다 — 확인 카드 1~9·단축키·Esc(작업 중단)가 입력칸 글자에 반응하지 않게
    d.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.matches?.('input')) e.preventDefault(); if (e.key === 'Escape' && (unzoom() || unpick())) e.preventDefault(); }); // Esc = 크게 보기 닫기 / ④에서 고른 역할 → 격자로만(튜토리얼은 닫지 않음)
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
  /** 크게 보기(⑦ 사용법 캡처)를 닫는다. 닫았으면 true. */
  function unzoom() { const z = el() && $('.tu-zoom', el()); if (!z || z.hidden) return false; z.hidden = true; return true; }
  /** 머리 「IRIS」 = 앱 헤더와 같은 마크·글자체(settings.js BRAND 가 #mark-slot·#wordmark 에 적용한 것을 그대로 빌린다 — 원천은 BRAND 하나). */
  function paintBrand() {
    const mark = $('.tu-mark', el()), word = $('.tu-word', el()), wm = $('#wordmark'), slot = $('#mark-slot');
    if (mark && slot) mark.innerHTML = slot.innerHTML;
    if (word && wm) word.style.cssText = wm.style.cssText;
  }
  async function open({ replay = false } = {}) {
    ensureDom(); paintBrand(); unzoom();
    try { info = await (await fetch('/api/tutorial')).json(); } catch { info = info || {}; }
    if (replay) step = 0;
    el().hidden = false; document.body.classList.add('tu-open'); render();
  }
  function close() { const d = el(); if (d) d.hidden = true; document.body.classList.remove('tu-open'); try { opts.onClose(); } catch {} }
  /** 데몬 인수 정보(hello·방송)를 받을 때마다 — 설치·로그인이 끝났고 아직 안 한 PC 면 한 번 연다. */
  function maybeOpen(h) { if (!autoShown && h?.tutorial?.due && !isOpen()) { autoShown = true; open(); } }
  function init(o) { opts = { ...opts, ...(o || {}) }; ensureDom(); }

  /** Esc(문서·Electron 중계 길): 크게 보기 닫기 → 역할 다시 고르기. 튜토리얼 자체는 닫지 않는다. */
  const back = () => unzoom() || unpick();
  return { init, open, close, isOpen, maybeOpen, back };
})();
