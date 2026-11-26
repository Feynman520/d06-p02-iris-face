// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 설정(⚙): 테마·중앙 애니메이션·성능·권한·알림·확장 모듈. 헤더 이름·마크·글자체는 BRAND 로 고정(v2.54, 2026-09-13 사용자 결정). 고른 것만 실제로 적용되고, 나머지 후보는 패널을 열 때만 미리보기로 돈다.
   저장: localStorage(즉시) + 데몬 state/settings.json(브라우저·Electron 공유). 사용량 배터리도 여기서 그린다. */
window.Settings = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const R = window.Registry;
  const BRAND = { name: 'IRIS', mark: 'cube', font: 'segoe-script', markSpeed: 2 }; // 고정 정체성 — 설정에서 바꿀 수 없다
  // 권한 기본값(2026-09-14 사용자 결정): 새 설치는 처음부터 최대 권한 — Claude 「전부 허용」, Codex 「묻지 않음」+「전체 접근」. 저장된 설정이 있으면 그 값이 우선.
  const DEF = { theme: 'indigo', stage: 'sphere', density: 1, pauseWhenDim: true, permission: 'bypassPermissions', approval: 'never', sandbox: 'danger-full-access', notifyDone: true, notifyOs: true }; // pauseWhenDim 기본 켬(2026-09-12 발열 사건): 저장된 설정이 있으면 그 값이 우선
  let cfg = { ...DEF }, health = null, open = false, themeKeys = new Set(), agents = null, previews = [], opts = {};
  const destroyPreviews = () => { for (const p of previews) { try { p.destroy(); } catch {} } previews = []; };

  // ---- 저장/불러오기 ----
  function load() { try { const s = JSON.parse(localStorage.getItem('iris.settings') || 'null'); if (s) cfg = { ...DEF, ...s }; } catch {} }
  async function pullServer() { try { const r = await fetch('/api/settings'); const s = await r.json(); if (s && s.updatedAt) { const local = JSON.parse(localStorage.getItem('iris.settings') || '{}'); if (!local.updatedAt || s.updatedAt > local.updatedAt) cfg = { ...DEF, ...s }; } } catch {} }
  const CLIENT = Math.random().toString(36).slice(2, 12); // 이 화면이 보낸 저장인지 가리는 표(데몬이 방송에 그대로 실어 준다 — 자기 저장의 메아리로 값을 되돌리지 않게)
  function save() { cfg.updatedAt = new Date().toISOString(); try { localStorage.setItem('iris.settings', JSON.stringify(cfg)); } catch {} return fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-iris-client': CLIENT }, body: JSON.stringify(cfg) }).catch(() => {}); }

  // ---- 적용 ----
  function applyTheme() {
    const th = R.THEMES.find(t => t.id === cfg.theme) || R.THEMES[0]; const root = document.documentElement.style;
    for (const k of themeKeys) root.removeProperty(k); themeKeys = new Set();
    for (const [k, v] of Object.entries(th.vars)) { root.setProperty(k, v); themeKeys.add(k); }
    document.documentElement.dataset.irisTheme = th.id; // data-theme 는 패널의 클릭 위임 선택자와 겹치므로 쓰지 않는다
    IrisStars.configure({ colors: { a: th.vars['--star-a'], b: th.vars['--star-b'], c: th.vars['--star-c'], glow: th.vars['--glow'] } });
  }
  function markSvg(m, cls = 'mark') { return `<svg class="${cls} mk-${m.id}" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${m.svg}</svg>`; }
  function markCss(m, scope) { return m.css.replace(/\.a(\d)/g, `${scope}.mk-${m.id} .a$1`); }
  function applyMark() {
    const m = R.MARKS.find(x => x.id === BRAND.mark) || R.MARKS[0];
    $('#mark-slot').innerHTML = markSvg(m);
    let st = $('#mark-style'); if (!st) { st = document.createElement('style'); st.id = 'mark-style'; document.head.appendChild(st); }
    st.textContent = R.MARK_KEYFRAMES + '\n' + markCss(m, '.mark') + `\n.mark.mk-${m.id} *{animation-duration:calc(var(--mk-dur,1s) / ${BRAND.markSpeed})}`;
    // animation-duration 은 개별 keyframe 정의가 우선하므로, 속도는 애니메이션 전체에 playbackRate로 적용
    $('#mark-slot').querySelectorAll('*').forEach(el => { for (const a of el.getAnimations?.() || []) a.playbackRate = BRAND.markSpeed; });
  }
  function applyFont() { const f = R.FONTS.find(x => x.id === BRAND.font) || R.FONTS[0]; $('#wordmark').style.cssText = f.css; }
  function applyName() { const n = BRAND.name; $('#wordmark').textContent = n; document.title = n; }
  function applyStage() { IrisStars.configure({ style: cfg.stage, density: cfg.density, pauseWhenDim: cfg.pauseWhenDim }); }
  // 자동 조절 표시(2026-09-12): 이 컴퓨터의 상한 밀도·지금 그리는 별 수·프레임 상한. 엔진이 'iris:stage' 이벤트로 바뀔 때마다 알린다.
  // v2.51.2(2026-09-13, 사용자 결정 "fps만 보여주자"): 부드러움 = fps 가 결정하고 부담 = fps × 화소인데 화소는 100%로 고정하므로, 사용자에겐 fps 칩만 보인다.
  // 칩 = 60·30·20fps, ★ = 이 컴퓨터 실측 추천(예산 안 첫 후보), 강조 = 지금 값, 실측 뒤엔 칩마다 "+n%"(추가 CPU 부담, 한 코어=100). 측정 중엔 진행만.
  function renderStage(s) {
    const el = $('#st-fps'), btn = $('#st-remeasure'); if (!el || !s) return;
    if (s.calib) { el.innerHTML = `<span class="st-sub">이 컴퓨터에 맞춰 측정 중… ${s.calib.step}/${s.calib.total}</span>`; btn.disabled = true; return; }
    btn.disabled = false;
    const r = s.rec, measured = !!(r && r.precise && r.costs && r.costs.length);
    const list = measured ? r.costs : [{ fps: 60 }, { fps: 30 }, { fps: 20 }];
    const chips = list.map(c => {
      const cur = c.fps === s.fps, isRec = measured && c.fps === r.fps, heavy = c.cost != null && c.cost > r.budget;
      const tip = c.cost != null ? `이 컴퓨터에서 추가 CPU 부담 ${c.cost}% (한 코어=100, 예산 ${r.budget}%)${isRec ? ' — 추천' : ''}` : '아직 실측 전 — 「다시 측정」을 누르면 부담이 표시돼요';
      return `<button class="st-chip${cur ? ' cur' : ''}${heavy ? ' heavy' : ''}" type="button" data-fps="${c.fps}" title="${esc(tip)}">${isRec ? '★ ' : ''}${c.fps}fps${c.cost != null ? `<small>+${c.cost}%</small>` : ''}</button>`;
    }).join('');
    const note = measured ? '' : r && r.failed ? `<span class="st-sub">측정이 끊겨 이전 값 유지</span>` : s.precise ? '' : `<span class="st-sub" title="트레이 → 화면 다시 띄우기(세션 유지)">실측은 창을 다시 연 뒤</span>`;
    el.innerHTML = chips + note;
  }
  document.addEventListener('iris:stage', (e) => { if (open) renderStage(e.detail); });
  function applyAll() { applyTheme(); applyMark(); applyFont(); applyName(); applyStage(); }

  // ---- 배터리 = 현재 우선(왕관) 계정의 **남은 주간 잔량**(100 − 사용률) ----
  const left = (v) => v == null ? null : Math.max(0, Math.min(100, Math.round((1 - v) * 100)));
  const shortAcc = (a) => (a || '?').replace(/@.*/, '');
  function battery(label, acc, v, title) {
    const p = left(v); const lvl = p == null ? 'na' : p <= 15 ? 'bad' : p <= 40 ? 'warn' : 'ok';
    return `<span class="batt ${lvl}" title="${esc(title)}"><span class="batt-label">${label}</span><span class="batt-body"><span class="batt-fill" style="width:${p ?? 0}%"></span></span><span class="batt-pct">${p == null ? '—' : p + '%'}</span></span>`;
  }
  async function loadLimits() {
    // TeamClaude 도구가 없는 PC(데몬 features.dashboard === false)면 배터리 자리를 통째로 숨긴다 — main.js 가 같은 신호로 Ctrl+D 서랍도 끈다.
    if (health?.features?.dashboard === false) { $('#limits').hidden = true; $('#limits').innerHTML = ''; return; }
    try {
      const r = await fetch('/api/limits'); const l = await r.json(); const a = l?.anthropic, c = l?.codex; const L = (v) => v == null ? '?' : left(v) + '%';
      $('#limits').innerHTML = l
        ? battery('Claude', a?.account, a?.d7, `왕관 계정 ${a?.account || '?'} — 남은 잔량: 주간 ${L(a?.d7)} · Fable 주간 ${L(a?.d7Fable)} · 5시간 ${L(a?.h5)}  (누르면 사용량 대시보드)`) + battery('Codex', c?.account, c?.d7, `왕관 계정 ${c?.account || '?'} — 남은 잔량: 주간 ${L(c?.d7)} · 5시간 ${L(c?.h5)}  (누르면 사용량 대시보드)`)
        : '<span class="batt-off">대시보드</span>';
    } catch { $('#limits').innerHTML = '<span class="batt-off">대시보드</span>'; }
    // 셋째 배터리 = 안티그래비티(데몬이 agy 에게 물은 남은 한도, 2026-11-23). 중계기 길(gate)이면 agy 가 중계기를 거쳐 물으므로 지금 그 구글 계정의 한도다.
    // 못 읽었으면 그리지 않는다(클로드 · 코덱스 배터리는 위 그대로).
    try {
      const g = await (await fetch('/api/antigravity/status')).json();
      if (g?.state === 'ok' && Array.isArray(g.groups)) {
        const all = g.groups.flatMap((x) => (x.buckets || []).map((b) => ({ ...b, group: x.name })));
        const h = all.find((b) => /argon/i.test(b.group) && b.window === 'weekly') || all.find((b) => b.window === 'weekly') || all[0];
        const R = (b) => (b?.remaining == null ? '?' : Math.round(b.remaining * 100) + '%');
        const when = (t) => { const d = t ? new Date(t) : null; return d && !isNaN(d) ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '?'; };
        const tip = `Antigravity 남은 한도 — ${all.map((b) => `${b.group} ${b.window === '5h' ? '5시간' : b.window === 'weekly' ? '주간' : b.window} ${R(b)}(다시 참 ${when(b.reset)})`).join(' · ')}`;
        $('#limits').querySelectorAll('.batt-agy').forEach((e) => e.remove()); // 두 번 불려도 하나만
        if (h) $('#limits').insertAdjacentHTML('beforeend', battery('Antigravity', null, h.remaining == null ? null : 1 - h.remaining, tip).replace('class="batt ', 'class="batt batt-agy '));
      }
    } catch {}
  }

  // ---- 패널 ----
  function renderPanel() {
    // 테마 = 작은 견본(바탕 | 면 대각선 + 강조색 점, v2.87)
    $('#st-themes').innerHTML = R.THEMES.map(t => `<button class="st-theme${t.id === cfg.theme ? ' cur' : ''}" data-theme="${t.id}" title="${esc(t.name)}"><i style="--th-b:${t.vars['--base']};--th-s:${t.vars['--surface']};--th-a:${t.vars['--iris']}"></i><span>${esc(t.name)}</span></button>`).join('');
    // 중앙 애니메이션: 카드마다 작은 캔버스에서 실제로 돌려 보여 준다(패널을 닫거나 다른 묶음으로 가면 정리)
    destroyPreviews();
    $('#st-stages').innerHTML = R.STAGES.map(s => `<button class="st-card stage${s.id === cfg.stage ? ' cur' : ''}" data-stage="${s.id}" title="${esc(s.desc)}"><canvas class="stage-pv" data-pv="${s.id}"></canvas><span>${esc(s.name)}</span></button>`).join('');
    startPreviews();
    $('#st-density').value = cfg.density; $('#st-density-v').textContent = Math.round(cfg.density * 100) + '%';
    renderStage(IrisStars.status());
    $('#st-pause').checked = !!cfg.pauseWhenDim;
    $('#st-root').textContent = health?.root || '';
    // 알림(2026-09-11): 작업 완료 알림 켬/끔 · 창이 뒤에 있을 때 OS 알림
    $('#st-notify').checked = cfg.notifyDone !== false; $('#st-notify-os').checked = cfg.notifyOs !== false; $('#st-notify-os').disabled = cfg.notifyDone === false;
    // 끊긴 세션 이어 열기(autoResume, 기본 켬): 데몬 환경 변수 IRIS_FACE_AUTO_RESUME 가 있으면 그 값이 이기므로 스위치를 잠그고 까닭을 보인다
    const arEnv = health?.autoResume?.source === 'env';
    $('#st-autoresume').checked = arEnv ? !!health.autoResume.enabled : cfg.autoResume !== false;
    $('#st-autoresume').disabled = arEnv; $('#st-autoresume-env').hidden = !arEnv;
    // 권한 기본값(Claude --permission-mode / Codex -a · --sandbox). 목록은 데몬 /api/agents 에서.
    // 목록은 데몬(/api/agents)이 주지만, 데몬이 재시작 전이라 목록이 없으면 같은 내용을 화면 쪽 사본으로 보여 준다
    const FALLBACK = {
      permissions: [{ id: '', label: '설정 파일대로' }, { id: 'bypassPermissions', label: '전부 허용' }, { id: 'acceptEdits', label: '편집 자동 허용' }, { id: 'auto', label: '자동' }, { id: 'dontAsk', label: '묻지 않음' }, { id: 'manual', label: '매번 묻기' }, { id: 'plan', label: '계획만' }],
      approvals: [{ id: '', label: '설정 파일대로' }, { id: 'never', label: '묻지 않음' }, { id: 'on-request', label: '모델이 필요할 때 묻기' }],
      sandboxes: [{ id: '', label: '설정 파일대로' }, { id: 'read-only', label: '읽기 전용' }, { id: 'workspace-write', label: '작업 폴더 쓰기' }, { id: 'danger-full-access', label: '전체 접근' }],
    };
    const fill = (el, list, val) => { el.innerHTML = list.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join(''); el.value = val ?? ''; };
    fill($('#st-perm'), agents?.claude?.permissions || FALLBACK.permissions, cfg.permission);
    fill($('#st-approval'), agents?.codex?.approvals || FALLBACK.approvals, cfg.approval);
    fill($('#st-sandbox'), agents?.codex?.sandboxes || FALLBACK.sandboxes, cfg.sandbox);
    // Antigravity 권한 모드(2026-11-25): 목록은 데몬만 준다(화면 쪽 사본 없음 — 데몬이 모르는 값을 고르게 하지 않는다). 저장된 값이 목록에 없으면 처음 값(전부 허용).
    syncAgyPerm();
    renderMods();
    renderAuth();
    renderUpdate();
    renderPlanner();
    renderNav();
  }
  // ---- 묶음과 오른쪽 목차(v2.87, 사용자 선택 = 시안 A′): 한 번에 한 묶음만. 마지막으로 본 묶음을 기억한다. ----
  const PANES = ['design', 'session', 'ontology', 'tools', 'planner', 'mods', 'account', 'about', 'feedback']; // v2.90: 온톨로지·도구 묶음(app/ontology.js·tools.js — 보일 때 읽음) · v2.105: 의견 보내기(app/feedback.js) · 플래너(설계 조각 ⑧)
  // 2026-11-25: 옛 「알림」 묶음(notify)은 「알림 · 플래너」(planner)에 합쳤다 — 기억해 둔 마지막 묶음 · 다른 코드가 부르는 옛 이름은 새 묶음으로 읽는다.
  const paneOf = (p) => (p === 'notify' ? 'planner' : p);
  let pane = (() => { try { const p = paneOf(localStorage.getItem('iris.settings.pane')); return PANES.includes(p) ? p : 'design'; } catch { return 'design'; } })();
  let modsSum = '';
  // 미리보기 캔버스는 「디자인」 묶음이 보일 때만 돌린다(다른 묶음에서 숨은 캔버스 11개가 GPU 를 쓰지 않게)
  function startPreviews() {
    destroyPreviews(); if (!open || pane !== 'design') return;
    const th = R.THEMES.find(t => t.id === cfg.theme) || R.THEMES[0]; const colors = { a: th.vars['--star-a'], b: th.vars['--star-b'], c: th.vars['--star-c'], glow: th.vars['--glow'] };
    for (const c of $('#st-stages').querySelectorAll('canvas.stage-pv')) previews.push(IrisStars.preview(c, { style: c.dataset.pv, colors }));
  }
  function showPane(p) {
    p = paneOf(p);
    if (!PANES.includes(p)) return;
    pane = p; try { localStorage.setItem('iris.settings.pane', p); } catch {}
    for (const el of document.querySelectorAll('#settings .st-pane')) el.hidden = el.dataset.pane !== p;
    for (const el of document.querySelectorAll('#st-nav .st-nav-i')) el.classList.toggle('cur', el.dataset.pane === p);
    const body = document.querySelector('#settings .st-body'); if (body) body.scrollTop = 0;
    if (p === 'design') startPreviews(); else destroyPreviews();
    if (open && p === 'ontology') window.OntologyView?.show();
    if (open && p === 'tools') window.ToolsView?.show();
    if (open && p === 'feedback') window.FeedbackView?.show();
    if (open && p === 'planner') loadPlannerUsage();
    // 계정 · 보안을 열 때마다 사본이 1분보다 오래됐으면 데몬이 다시 읽는다(2026-11-25 신고: 재로그인 · 재시작 뒤에도 30분 가까이 「끊김」이 남았다).
    if (open && p === 'account') loadAuth(false, true);
  }
  // ---- 플래너(설계 조각 ⑧, 2026-11-23): 스위치 여덟 줄 + 딸린 값 · 잠시 조용히 · 사용량 한 줄 · 수첩 폴더 ----
  // 처음 값은 데몬 daemon/planner.mjs PLANNER_DEFAULTS 와 같아야 한다(verify:settings 가 대조). DEF 에 넣지 않는다 —
  // 사용자가 바꾼 키만 저장되어야 "없는 키 = 처음 값"이 지켜진다(나중에 처음 값을 바꿔도 손대지 않은 사람은 따라온다).
  const PL_DEF = { plannerEnabled: true, plannerMorning: true, plannerMorningAt: '08:00', plannerStartAlert: true, plannerStartMin: 10, plannerEvening: true, plannerEveningAt: '16:30', plannerOverlap: true, plannerTalk: true, plannerFromSessions: true, plannerCheck: false, plannerQuietUntil: null };
  const PL_SW = { 'st-pl-on': 'plannerEnabled', 'st-pl-morning': 'plannerMorning', 'st-pl-start': 'plannerStartAlert', 'st-pl-evening': 'plannerEvening', 'st-pl-overlap': 'plannerOverlap', 'st-pl-talk': 'plannerTalk', 'st-pl-sessions': 'plannerFromSessions', 'st-pl-check': 'plannerCheck' };
  const PL_LEADS = [5, 10, 15, 30];
  const plv = (k) => (cfg[k] === undefined || cfg[k] === null ? PL_DEF[k] : cfg[k]);
  const plTime = (k) => (/^\d\d:\d\d$/.test(cfg[k] || '') ? cfg[k] : PL_DEF[k]);
  /** 조용히가 끝나는 때(ms). 지났거나 없으면 0. */
  const plQuietMs = () => { const t = cfg.plannerQuietUntil ? Date.parse(cfg.plannerQuietUntil) : NaN; return Number.isFinite(t) && t > Date.now() ? t : 0; };
  const clockWord = (ms) => { const d = new Date(ms), h = d.getHours(), m = d.getMinutes(); const day = new Date(); const tomorrow = d.getDate() !== day.getDate(); return h === 0 && m === 0 && tomorrow ? '오늘 밤 12시' : `${tomorrow ? '내일 ' : ''}${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시${m ? ` ${m}분` : ''}`; };
  let plQuietTimer = 0;
  function renderPlanner() {
    if (!$('#st-pl-on')) return;
    const on = plv('plannerEnabled') !== false;
    for (const [id, k] of Object.entries(PL_SW)) { const el = $('#' + id); el.checked = plv(k) !== false && plv(k) !== 0; if (id !== 'st-pl-on') el.disabled = !on; }
    $('#st-pl-check').checked = plv('plannerCheck') === true;
    const lead = PL_LEADS.includes(Number(plv('plannerStartMin'))) ? Number(plv('plannerStartMin')) : PL_DEF.plannerStartMin;
    const leadOff = !on || plv('plannerStartAlert') === false;
    $('#st-pl-lead').innerHTML = PL_LEADS.map(n => `<button class="st-chip${n === lead ? ' cur' : ''}" type="button" data-lead="${n}"${leadOff ? ' disabled' : ''}>${n}분</button>`).join('');
    $('#st-pl-morning-at').value = plTime('plannerMorningAt'); $('#st-pl-morning-at').disabled = !on || plv('plannerMorning') === false;
    $('#st-pl-evening-at').value = plTime('plannerEveningAt'); $('#st-pl-evening-at').disabled = !on || plv('plannerEvening') === false;
    // 잠시 조용히: 끝나는 시각 하나(plannerQuietUntil). 끝나면 데몬이 그사이 지나간 약속을 모아 말한다.
    const q = plQuietMs();
    $('#st-pl-quiet').innerHTML = q
      ? `<button class="st-chip cur" type="button" data-quiet="off"${on ? '' : ' disabled'}>다시 알리기</button>`
      : `<button class="st-chip" type="button" data-quiet="60"${on ? '' : ' disabled'}>1시간</button><button class="st-chip" type="button" data-quiet="today"${on ? '' : ' disabled'}>오늘 하루</button>`;
    // 조용히 하는 동안에만 한 줄로 알린다(평소 설명은 「잠시 조용히」에 마우스를 올리면 나오는 글 — 2026-11-25 묶음을 합치며 줄을 줄임)
    $('#st-pl-quiet-note').hidden = !q;
    $('#st-pl-quiet-note').textContent = q ? `${clockWord(q)}까지 조용히 하는 중입니다(플래너의 말풍선만 — 작업 알림은 그대로). 끝나면 그사이 지나간 약속을 모아서 말합니다` : '';
    clearTimeout(plQuietTimer); if (q && open) plQuietTimer = setTimeout(() => { if (open) { renderPlanner(); renderNav(); } }, Math.min(q - Date.now() + 500, 2 ** 31 - 1));
  }
  /** 사용량 한 줄 — 실제 응답에 실린 값만 더한 것(어림을 지어내지 않는다). 토큰 수를 알려 주지 않은 호출은 "모름"으로 따로 센다. */
  let plUsageSeq = 0;
  async function loadPlannerUsage() {
    const el = $('#st-pl-usage'); if (!el) return; const seq = ++plUsageSeq;
    let u = null; try { const r = await fetch('/api/planner/usage'); if (r.ok) u = await r.json(); } catch {}
    if (seq !== plUsageSeq) return;
    if (!u || u.ok === false) { el.textContent = '사용량을 읽지 못했습니다.'; return; }
    const n = (v) => Number(v || 0).toLocaleString('ko-KR');
    const part = (p) => { const bits = [`${n(p.calls)}번`]; if (p.tokens) bits.push(`약 ${n(p.tokens)}토큰`); if (p.unknown) bits.push(`토큰 모름 ${n(p.unknown)}번`); if (p.fails) bits.push(`답을 못 받음 ${n(p.fails)}번`); return bits.join(' · '); };
    const lines = [`오늘 아이리스를 부른 횟수 ${part(u.today || {})}`, `최근 7일 ${part(u.week || {})}`];
    if (u.model) lines.push(u.modelActual ? `마지막으로 쓴 모델: ${u.model}` : `마지막으로 부른 모델: ${u.model}(응답에서 실제 이름을 확인하지 못함)`);
    if (u.inbox) lines.push(`받아 둔 말 ${n(u.inbox)}개 — 아이리스와 연결되면 정리합니다`);
    el.textContent = lines.join('\n'); // 줄바꿈은 CSS(white-space: pre-line)로 — 데몬이 준 글을 HTML 로 넣지 않는다
  }
  async function openPlannerFolder() {
    try { const r = await fetch('/api/planner/open-folder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); const d = await r.json().catch(() => ({})); if (!r.ok) Dialog.notice(d.error || `폴더를 열지 못했습니다(${r.status}).`); }
    catch (e) { Dialog.notice('폴더를 열지 못했습니다.', { sub: e.message }); }
  }
  function setQuiet(v) {
    const now = new Date();
    const until = v === 'off' ? null : v === 'today' ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : new Date(now.getTime() + Number(v) * 60000);
    pick({ plannerQuietUntil: until ? until.toISOString() : null });
  }
  /**
   * 데몬이 알려 온 설정 변화를 화면의 사본에 맞춘다 — 말로 한 「잠시 조용히」(데몬이 바꿈)와, 어느 창에서든 저장한 설정(PUT 뒤의 방송).
   * 데몬에는 이미 적혀 있으므로 다시 보내지 않는다. 사본의 시각(updatedAt)은 화면의 지금 시각이 아니라 데몬이 적은 시각(at)으로 맞춘다 —
   * 일부 키만 받은 사본이 "가장 새것"인 척해서 나중에 데몬의 값을 밀어내지 않게.
   */
  function applyRemote(patch, at, from) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;
    if (from && from === CLIENT) return;   // 이 화면이 방금 보낸 저장의 메아리 — 그 뒤에 또 바꾼 값을 옛 값으로 되돌리지 않는다
    let changed = false;
    for (const [k, v] of Object.entries(patch)) { if (k === 'updatedAt') continue; if (JSON.stringify(cfg[k]) !== JSON.stringify(v)) { cfg[k] = v; changed = true; } }
    if (typeof at === 'string' && at) cfg.updatedAt = at;
    try { localStorage.setItem('iris.settings', JSON.stringify(cfg)); } catch {}
    if (!changed) return;
    applyAll(); if (open) renderPanel();
    opts.onChange?.(cfg);
  }
  /** 데몬과 다시 붙었을 때(웹소켓 hello): 그사이 놓친 설정 변화를 데몬에서 다시 읽는다. */
  async function resync() { const before = JSON.stringify(cfg); await pullServer(); if (JSON.stringify(cfg) === before) return; applyAll(); if (open) renderPanel(); opts.onChange?.(cfg); }
  const optText = (id) => $(id)?.selectedOptions?.[0]?.textContent || '';
  /** 목차 아래 작은 글씨 = 지금 값 한 줄, 노란·빨간 숫자 = 갱신이 필요한 로그인 열쇠, 청보라 = 새 판. */
  function renderNav() {
    const set = (id, t) => { const el = $(id); if (el) { el.textContent = t; el.title = t; } };
    const th = R.THEMES.find(t => t.id === cfg.theme) || R.THEMES[0], st = R.STAGES.find(s => s.id === cfg.stage) || R.STAGES[0];
    set('#st-sum-design', `${th.name} · ${st.name}`);
    set('#st-sum-session', `Claude ${optText('#st-perm')} · Codex ${optText('#st-approval')}${$('#st-agy-grp').hidden ? '' : ` · Antigravity ${optText('#st-agy-perm')}`}`);
    set('#st-sum-ontology', '역할 캐릭터 · 폴더 나무');
    set('#st-sum-tools', 'Skill · MCP · Plugin');
    set('#st-sum-feedback', '개발자에게 바로');
    set('#st-sum-notify', cfg.notifyDone === false ? '알림 꺼짐' : '알림 켜짐'); // 목차 한 줄 = "알림 켜짐 · 플래너 켜짐"(2026-11-25 묶음을 합침)
    const plQ = plQuietMs();
    set('#st-sum-planner', plv('plannerEnabled') === false ? '꺼짐' : plQ ? `조용히 · ${clockWord(plQ)}까지` : `켜짐${plv('plannerCheck') === true ? ' · 준비 점검' : ''}`);
    set('#st-sum-mods', modsSum);
    const items = auth?.info?.items || [], due = authDue(), hasAuth = !!(auth?.available || health?.features?.auth);
    const nCl = items.filter(i => i.group !== 'iris' && i.provider !== 'codex').length, nCx = items.filter(i => i.group !== 'iris' && i.provider === 'codex').length;
    set('#st-sum-account', !hasAuth ? '열쇠 감시 도구 없음 · 비밀 금고' : !items.length ? '열쇠 상태 확인 전' : due.length ? `갱신 필요 ${due.length}개` : `Claude ${nCl} · Codex ${nCx} · 모두 정상`);
    const ba = $('#st-badge-account'); if (ba) { ba.hidden = !due.length; ba.textContent = String(due.length); ba.classList.toggle('bad', due.some(i => i.level === 'expired')); }
    // IRIS Doctor 로 가는 안내 줄(누르면 검진표 창 — app/doctor.js): 재로그인이 필요한 계정이 있을 때 · 업데이트가 실패했을 때만. Doctor 가 없는 PC 에서는 CSS 가 숨긴다.
    const dh = $('#st-doctor-hint'); if (dh) dh.hidden = !items.some(i => i.health === 'needs-login' || i.level === 'expired');
    const du = $('#st-doctor-upd'); if (du) du.hidden = !(upd && (upd.checkError || upd.lastResult?.ok === false));
    const dev = upd?.mode === 'dev', newV = !dev && upd?.headline?.version;
    set('#st-sum-about', newV ? `새 판 v${newV}` : `v${health?.version || '—'}${dev ? ' · 개발 폴더' : ''}`);
    const bu = $('#st-badge-about'); if (bu) { bu.hidden = !newV; bu.textContent = '새'; }
  }
  // ---- 모듈(콘센트, 2026-09-11): 목록은 데몬 /api/modules. 이름·아이콘·설명은 전부 module.json 에서 온다(본체는 어떤 모듈인지 모른다). ----
  // 목록 = 데몬 /api/catalog(공식 IRIS 모듈 카탈로그 + 설치 여부, v2.53). 행마다 설치됨/미설치 표와 그에 맞는 버튼(설치 / 재시작·제거).
  // 상태 → 낱말 + 점 색(ok 초록 · warn 노랑 · bad 빨강). 아이콘은 app/icons.js 이름(모르면 plug) — 모듈이 준 문자열을 HTML 에 넣지 않는다(v2.52).
  const MOD_STATUS = { running: ['실행 중', 'ok'], stopped: ['멈춤', 'warn'], failed: ['실패', 'bad'], incompatible: ['맞지 않음', 'bad'], 'grade-unsupported': ['동의 필요', 'warn'] };
  const installing = new Set();
  async function renderMods() {
    const host = $('#st-mods'); if (!host) return;
    let list = [];
    try {
      const r = await fetch('/api/catalog');
      if (r.ok) list = (await r.json()).list || [];
      else { const r2 = await fetch('/api/modules'); list = ((await r2.json()).list || []).map(m => ({ ...m, installed: true, catalog: false })); } // 카탈로그 라우트가 없는 옛 데몬(⏻ 재실행 전): 설치된 것만
    } catch { host.innerHTML = '<div class="mods-empty">데몬에 연결되지 않아 목록을 읽지 못했습니다.</div>'; modsSum = '목록을 읽지 못함'; renderNav(); return; }
    const nIn = list.filter(m => m.installed).length;
    modsSum = !list.length ? '없음' : nIn ? `설치 ${nIn}개${list.length > nIn ? ` · 미설치 ${list.length - nIn}개` : ''}` : list.length === 1 ? `${list[0].label} 미설치` : `미설치 ${list.length}개`;
    renderNav();
    if (!list.length) { host.innerHTML = '<div class="mods-empty">모듈이 없습니다.</div>'; return; }
    host.innerHTML = list.map(m => {
      let meta, actions;
      if (m.installed) {
        const [word, tone] = MOD_STATUS[m.status] || [m.status, 'warn'];
        meta = `<span class="mod-tag on">설치됨</span>v${esc(m.version)} · <span class="${m.official ? '' : 'mod-unofficial'}">${m.official ? '공식' : '비공식'}</span> · <i class="mod-dot ${tone}"></i>${esc(word)}${m.reason ? ' — ' + esc(m.reason) : ''}`;
        actions = `<button class="text-btn outline" data-act="restart" title="모듈 프로세스를 다시 띄웁니다">재시작</button><button class="text-btn outline danger" data-act="remove" title="모듈 폴더를 지웁니다(그 모듈의 데이터 포함)">제거</button>`;
      } else {
        const busy = installing.has(m.name);
        // v2.106: 선택 모듈은 처음에 깔리지 않는다 — 카탈로그가 추천으로 표시한 것은 미설치 줄에 '추천' 꼬리표(깔지는 않되 눈에 띄게).
        meta = `<span class="mod-tag">미설치</span>${m.recommended ? '<span class="mod-tag rec">추천</span>' : ''}${esc(m.desc)}`;
        actions = `<button class="text-btn accent" data-act="install" ${busy ? 'disabled' : ''} title="최신 릴리스를 내려받아 서명을 확인한 뒤 설치합니다">${busy ? '설치 중…' : '설치'}</button>`;
      }
      return `<div class="mod-row" data-mod="${esc(m.name)}"><span class="mod-ic">${Icons.svg(m.icon, 18)}</span><span class="mod-text"><b>${esc(m.label)}</b><small>${meta}</small></span><span class="dash-actions">${actions}</span></div>`;
    }).join('');
  }
  const ACT_WORD = { remove: '제거', restart: '재시작', install: '설치' };
  // 설치 중 상태는 여기 한 곳(installing)이 원천 — 헤더 버튼(main.js)은 isInstalling() 으로 읽고, 바뀔 때마다 'iris:mod-installing' 사건으로 다시 그린다(v2.56).
  const bumpInstalling = () => { try { window.dispatchEvent(new CustomEvent('iris:mod-installing')); } catch {} };
  /** 성공 여부(boolean)를 돌려준다 — 헤더 설치 흐름이 실패 때 자동 열기 예약을 거두려고 본다. */
  async function modAct(name, act) {
    if (act === 'remove' && !(await Dialog.confirm('모듈이 백업 문구를 줬다면 적어 두셨는지 먼저 확인하세요.', { title: '이 모듈을 제거할까요?', tag: name, icon: 'trash', okLabel: '제거', danger: true,
      ledger: [['end', '지워지는 것', '모듈 폴더와 그 안의 데이터(로그인 · 설정 · 기록) — 되돌릴 수 없습니다'], ['keep', '그대로인 것', 'IRIS 의 대화와 다른 모듈']] }))) return false;
    if (act === 'install') { if (installing.has(name)) return false; installing.add(name); bumpInstalling(); if (open) renderMods(); }
    let okay = false;
    try {
      const r = await fetch(act === 'install' ? `/api/catalog/${encodeURIComponent(name)}/install` : `/api/modules/${encodeURIComponent(name)}/${act}`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) Dialog.error({ title: `모듈 ${ACT_WORD[act]}에 실패했습니다`, message: act === 'install' ? '인터넷 연결을 확인한 뒤 다시 설치해 주세요.' : '', detail: String(d.error || r.status) }); else okay = true;
    } catch (e) { Dialog.error({ title: `모듈 ${ACT_WORD[act]}에 실패했습니다`, message: act === 'install' ? '인터넷 연결을 확인한 뒤 다시 설치해 주세요.' : '', detail: e.message }); }
    if (installing.delete(name)) bumpInstalling();
    if (open) renderMods();
    return okay;
  }
  // ---- 업데이트(v2.58, 2026-09-14): 절 머리의 유일한 행동 단추 하나로 확인 → 내려받기 → 적용까지. ----
  // 상태는 데몬 GET /api/update 가 원천(mode·enabled·installed·latest·available·applying·plan). 화면은 그대로 그리기만 한다.
  // 부품 행은 스위치 없는 .st-opt(제목 + 한 줄 설명 | 오른쪽 값), 새 판이 있는 행의 오른쪽 값만 청보라.
  const UPD_PART = {
    face: ['IRIS 창', '세션을 지휘하는 창과 데몬'],
    messenger: ['메신저', '확장 모듈 — 설치돼 있을 때만'],
    package: ['패키지', '동봉 런타임·도구를 담은 구조판'],
  };
  let upd = null, updBusy = false;
  const fmtWhen = (iso) => { const t = Date.parse(iso || ''); if (!t) return ''; const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  function renderUpdate() {
    const host = $('#st-update'), btn = $('#st-update-act'), auto = $('#st-update-auto'), head = $('#st-update-h');
    if (!host) return;
    renderNav();
    if (head && !head.dataset.iced) { head.innerHTML = Icons.svg('bolt', 15) + '<span>업데이트</span>'; head.dataset.iced = '1'; } // 아이콘은 icons.js 이름만(이모지 0)
    const dev = upd?.mode === 'dev';
    auto.checked = upd ? upd.enabled !== false : true; auto.disabled = !upd;
    // 단추 4종: 적용 중(비활성·진행) · 받아 둠 · 새 판 있음 · 그 밖(지금 확인)
    const a = upd?.applying;
    if (updBusy || a) {
      const pct = a && a.total ? Math.floor((a.received / a.total) * 100) : 0;
      btn.textContent = a ? `내려받는 중 ${a.index}/${a.count} · ${pct}%` : '내려받는 중…';
      btn.className = 'text-btn outline'; btn.disabled = true; btn.dataset.act = '';
    } else if (!dev && upd?.plan) { btn.textContent = '적용 (받아 둠)'; btn.className = 'text-btn accent'; btn.disabled = false; btn.dataset.act = 'apply-now'; }
    else if (!dev && upd?.headline?.version) { const h = upd.headline; btn.textContent = `업데이트 v${h.version}${h.more > 0 ? ` 외 ${h.more}개` : ''}`; btn.className = 'text-btn accent'; btn.disabled = false; btn.dataset.act = 'apply'; }
    else { btn.textContent = '지금 확인'; btn.className = 'text-btn outline'; btn.disabled = false; btn.dataset.act = 'check'; }
    if (!upd) { host.innerHTML = '<div class="upd-line st-sub">데몬에 연결되지 않아 판을 읽지 못했습니다.</div>'; return; }
    // 부품별 실패 사유(데몬 lastResult.items — 한 부품이 걸려도 나머지는 계속 간다, v2.58.0 검토 2회차).
    // 사유는 그 부품 행에만 붙인다. 릴리스가 준 글이라 HTML 로 넣지 않고 아래에서 textContent 로 채운다.
    const failedBy = {};
    for (const it of (upd.lastResult?.items || [])) if (it && it.ok === false && it.part) failedBy[it.part] = it.reason || '실패';
    const rows = Object.keys(UPD_PART).map((k) => {
      const [name, desc] = UPD_PART[k], ins = upd.installed?.[k], lat = upd.latest?.[k]?.version;
      // 1.x → 2.0 은 자동으로 갈아 끼우지 않는다(Task 21) — 구조판 행은 "→ v2.x" 대신 아래 안내만 보인다.
      const isNew = upd.available?.includes(k) && !(k === 'package' && upd.reinstall);
      const val = ins ? `v${esc(ins)}` : '미설치';
      const bad = failedBy[k] ? `<small class="upd-bad" data-part="${esc(k)}"></small>` : '';
      return `<div class="st-opt upd-row"><span class="st-opt-text">${esc(name)}<small>${esc(desc)}</small>${bad}</span><span class="upd-ver">${val}${isNew ? ` <span class="upd-new">→ v${esc(lat)}</span>` : ''}</span></div>`;
    }).join('');
    const when = fmtWhen(upd.lastCheck);
    // 1.x 영혼인데 구조판 최신 판이 2.x — 받지 않고 글과 홈페이지 링크만(Task 21). 링크는 Electron 이 기본 브라우저로 넘긴다.
    const re = upd.reinstall;
    const reinstall = re ? `<div class="upd-reinstall">${esc(re.note)}<br><a href="${esc(re.url)}" target="_blank" rel="noreferrer">${esc(re.url)}</a>${re.version ? ` <span class="st-sub">(새 판 v${esc(re.version)})</span>` : ''}</div>` : '';
    const lines = [
      dev ? `<div class="upd-line st-sub">${esc(DEV_NOTE)}</div>` : '',
      upd.checkError ? `<div class="upd-line st-sub bad">확인 실패: ${esc(upd.checkError)}</div>` : '',
      !upd.checkError && upd.lastResult && upd.lastResult.ok === false ? `<div class="upd-line st-sub bad">지난 내려받기 실패: ${esc(upd.lastResult.reason)}</div>` : '',
      `<div class="upd-line st-sub">${when ? `마지막 확인 ${esc(when)}` : '아직 확인하지 않았습니다'}</div>`,
    ].join('');
    host.innerHTML = rows + reinstall + lines;
    for (const el of host.querySelectorAll('.upd-bad')) el.textContent = failedBy[el.dataset.part] || '';
    // 릴리스 노트 첫 5줄 — 텍스트만 넣는다(HTML 로 해석하지 않음)
    const h = upd.headline, notes = h && upd.latest?.[h.part]?.notes;
    if (notes) {
      const el = document.createElement('div'); el.className = 'upd-notes';
      el.textContent = String(notes).split(/\r?\n/).slice(0, 5).join('\n').trim();
      if (el.textContent) host.appendChild(el);
    }
  }
  const DEV_NOTE = '개발 폴더에서 실행 중 — git pull로 갱신';
  async function loadUpdate() {
    try { const r = await fetch('/api/update'); upd = r.ok ? await r.json() : null; } catch { upd = null; }
    notice(); if (open) renderUpdate();
  }
  /** 첫 실행 한 줄 고지(1회) — 하루 한 번 확인한다는 사실과 끄는 곳.
   *  dev 모드(개발 폴더 실행)에서는 고지도 하지 않고 1회 표시도 쓰지 않는다 — 설치본에서 처음 볼 때 나와야 한다. */
  function notice() {
    if (!upd || upd.enabled === false || upd.mode === 'dev') return;
    try { if (localStorage.getItem('iris.update.noticed')) return; localStorage.setItem('iris.update.noticed', '1'); } catch { return; }
    Notify.push({ title: '업데이트 확인', sub: '하루 한 번 새 판을 확인합니다 — 설정에서 끌 수 있습니다', status: 'idle', force: true });
  }
  /** 데몬의 {type:'update', …} 방송. info 가 실려 오면 그대로 갈아 끼우고, 내려받기 진행은 단추 글만 바꾼다. */
  let offering = false; // 대화가 띄운 적용 확인이 떠 있는 동안
  function onUpdate(m) {
    if (m.info) { upd = m.info; updBusy = false; }
    else if (m.phase === 'download' && upd) upd.applying = { part: m.part, index: m.index || 1, count: m.count || 1, received: m.received, total: m.total };
    if (m.phase === 'error' || m.phase === 'ready' || m.phase === 'checked') updBusy = false;
    if (open) renderUpdate();
    window.UpdatePanel?.onUpdate(m); // 업데이트 칸이 열려 있으면 진행 · 준비됨을 따라간다
    // 대화형 업데이트(update-chat): 대화가 "적용 확인을 띄워 달라"고 하면 받아 둔 계획이 있을 때 같은 확인 카드를 띄운다 — 누르는 것은 사용자다. 이미 떠 있으면 또 띄우지 않는다.
    if (m.phase === 'offer' && upd?.plan && upd.mode !== 'dev' && !offering) { offering = true; updAct('confirm-apply').finally(() => { offering = false; }); }
  }
  const setUpdate = (info) => { if (info) { upd = info; notice(); if (open) renderUpdate(); } };
  /** 적용기가 남긴 결과(데몬 hello 의 updateResult) → 토스트 한 개. */
  function showUpdateResult(r) {
    const items = Array.isArray(r?.items) ? r.items : [];
    const okList = items.filter(i => i.ok).map(i => `${(UPD_PART[i.kind] || [i.kind])[0]} v${i.version}`);
    const bad = items.find(i => !i.ok);
    Notify.push({ title: r?.ok && !bad ? '업데이트 완료' : '업데이트 일부 실패', sub: [okList.join(' · '), bad ? `실패: ${(UPD_PART[bad.kind] || [bad.kind])[0]} — ${bad.reason || ''}` : ''].filter(Boolean).join(' / ') || '적용을 마쳤습니다', status: bad ? 'attention' : 'idle', force: true });
  }
  async function updAct(act) {
    if (act === 'check') { updBusy = true; renderUpdate(); try { const r = await fetch('/api/update/check', { method: 'POST' }); upd = r.ok ? await r.json() : upd; if (!r.ok) Dialog.error({ title: '새 판이 있는지 확인하지 못했습니다', message: '새 판 목록을 읽지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.' }); } catch (e) { Dialog.error({ title: '새 판이 있는지 확인하지 못했습니다', message: '인터넷 연결을 확인한 뒤 다시 눌러 주세요.', detail: e.message }); } finally { updBusy = false; renderUpdate(); } return; }
    // 업데이트 단추(2026-11-26 사용자 결정): 누르면 곧바로 받지 않고 **업데이트 칸 + 설명 대화**가 열린다 — 거기서 원하는 것만 체크해 업데이트한다.
    // 지금까지의 길(전부 받아 확인 카드까지)은 칸의 「전부 업데이트」가 그대로 부른다(act 'apply-all'). 칸을 쓸 수 없으면(스크립트 없음) 옛 길로 간다.
    if (act === 'apply' && window.UpdatePanel) { window.UpdatePanel.start(); return; }
    if (act === 'apply' || act === 'apply-all') {
      updBusy = true; renderUpdate();
      let r;
      try { const res = await fetch('/api/update/apply', { method: 'POST' }); r = await res.json().catch(() => ({})); } catch (e) { r = { ok: false, reason: e.message }; }
      updBusy = false; if (r.info) upd = r.info; renderUpdate();
      // 1.x → 2.0 은 실패가 아니라 "새로 설치하세요" 안내다 — 실패 문구를 붙이지 않는다(Task 21).
      if (!r.ok && r.reinstall) { Dialog.alert(`${r.reinstall.note}\n\n${r.reinstall.url}`, { title: '새로 설치해야 하는 판입니다' }); return; }
      if (!r.ok) { Dialog.error({ title: '업데이트하지 못했습니다', message: '대화는 그대로입니다.', detail: r.reason || r.error || '알 수 없는 오류' }); return; }
      // 부품 하나가 걸려도 나머지는 끝까지 간다 — 성공했다고만 말하지 않고 실패한 부품의 사유를 함께 알린다.
      if (!upd?.plan) { if (r.reason) Dialog.alert('바꾸지 못한 부품이 있습니다. 대화는 그대로입니다.', { title: '일부만 바꿨습니다', kind: 'warn', detail: r.reason }); else Dialog.notice('최신 판으로 바꿨습니다.', { sub: '대화는 그대로입니다.', tone: 'ok' }); return; }
      act = 'confirm-apply';
    }
    if (act === 'apply-now' || act === 'confirm-apply') {
      const n = opts.sessionCount?.() ?? 0;
      const kinds = (upd?.plan?.items || []).map(i => `${(UPD_PART[i.kind] || [i.kind])[0]} v${i.version}`).join(' · ');
      // 사실대로(2026-11-26): 전부 종료로 닫힌 대화는 자동으로 다시 열리지 않는다(v2.97 — 「종료됨」 카드의 「여기서 재개」로 잇는다). 옛 문구 "자동으로 다시 열립니다"는 그 전의 동작이었다.
      const msg = `${n ? `대화 ${n}개가 닫힙니다 — 적용 뒤 「여기서 재개」로 이어 갈 수 있습니다. ` : ''}IRIS 창이 잠시 닫혔다 스스로 다시 켜집니다.`;
      if (!(await Dialog.confirm(msg, { title: '받아 둔 새 판을 지금 적용할까요?', tag: kinds, icon: 'download', okLabel: '지금 적용', cancelLabel: '나중에' }))) { renderUpdate(); return; }
      try {
        const res = await fetch('/api/update/apply-now', { method: 'POST' }); const d = await res.json().catch(() => ({}));
        if (!res.ok) { Dialog.error({ title: '새 판을 적용하지 못했습니다', message: '대화는 그대로입니다.', detail: String(d.reason || d.error || res.status) }); return; }
        Notify.push({ title: '업데이트 적용 중', sub: '창이 잠시 닫혔다 다시 열립니다', status: 'idle', force: true });
      } catch (e) { Dialog.error({ title: '새 판을 적용하지 못했습니다', detail: e.message }); }
    }
  }

  // ---- 인증(v2.84, 2026-10-15 "Login expired" 사고): 로그인 열쇠별 만료일과 갱신 단추. 상태 원천 = 데몬 GET /api/auth · ws {type:'auth'}. ----
  // 열쇠 값은 화면에 오지 않는다(데몬 auth.mjs). 곧 만료·만료가 있으면 설정(톱니) 단추에 점 + 하루 한 번 창 알림.
  let auth = null, authBusy = false;
  const AUTH_WORD = { ok: '정상', soon: '곧 만료', expired: '만료', unknown: '모름' };
  const authDue = () => (auth?.info?.items || []).filter(i => !i.optional && (i.level === 'soon' || i.level === 'expired'));
  function authBadge() {
    const b = $('#btn-settings'); if (!b) return;
    const due = authDue(); const bad = due.some(i => i.level === 'expired');
    b.classList.toggle('auth-bad', bad); b.classList.toggle('auth-warn', !bad && due.length > 0);
    b.title = due.length ? `설정 (Ctrl+,) — 로그인 갱신 필요 ${due.length}개` : '설정 (Ctrl+,)';
  }
  function authNotice() {
    const due = authDue(); if (!due.length) return;
    const key = `${new Date().toISOString().slice(0, 10)}|${due.map(i => `${i.id}=${i.level}`).join(',')}`;
    try { if (localStorage.getItem('iris.auth.noticed') === key) return; localStorage.setItem('iris.auth.noticed', key); } catch {}
    const sub = due.map(i => i.level === 'expired' ? `${i.label} 만료` : `${i.label} D-${i.daysLeft}`).join(' · ');
    Notify.push({ title: '로그인 갱신 필요', sub: `${sub} — 설정 → 인증에서 갱신`, status: 'attention', force: true });
  }
  // 넷째 카드 = 안티그래비티(2026-11-23 · 2026-11-25 계정 줄을 이 카드로 옮김). 중계기가 돌려 쓰는 구글 계정(목록의 provider 'google')을 줄로 보이고,
  // 데몬이 agy 에게 물은 판정 줄은 정상이 아닐 때(또는 계정 줄이 없을 때)만 보인다. 구글 계정은 중계기가 스스로 갱신하므로 정상인 줄에는 단추가 없다 —
  // 끊긴 줄만 「대시보드에서 다시 로그인」(코드를 붙여 넣는 걸음이 있어 대시보드의 「＋ Antigravity 계정」 길을 그대로 쓴다).
  let agyInfo = null;
  /** 세션 기본값의 Antigravity 권한 카드(2026-11-25): 목록은 데몬만 준다(화면 쪽 사본 없음 — 데몬이 모르는 값을 고르게 하지 않는다).
   *  목록이 없거나(다시 켜기 전의 옛 데몬) 프로그램이 없는 PC(상태 missing)면 숨긴다. 저장된 값이 목록에 없으면 처음 값(전부 허용)으로 보인다.
   *  상태를 늦게 읽어도(loadAgy) 다시 불러 보이기 · 숨기기를 맞춘다. */
  function syncAgyPerm() {
    const grp = $('#st-agy-grp'), sel = $('#st-agy-perm'); if (!grp || !sel) return;
    const list = agents?.antigravity?.permissions;
    grp.hidden = !Array.isArray(list) || !list.length || agyInfo?.state === 'missing';
    if (grp.hidden) return;
    sel.innerHTML = list.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('');
    sel.value = list.some(o => o.id === cfg.agyPermission) ? cfg.agyPermission : '';
  }
  function agyRow(i) {
    const cur = agyInfo?.state === 'ok' && agyInfo.account && agyInfo.account === i.label;
    // 낱말은 대시보드와 같게(2026-11-25): 정상 / 확인 중 / 재로그인 필요. 확인 중 = 갱신이 한 번 실패해 중계기가 다시 확인하는 동안 — 단추 없음(스스로 돌아올 수 있다).
    const checking = i.health === 'checking';
    const bad = !checking && (i.level === 'expired' || i.level === 'soon');
    const desc = [checking ? '갱신이 실패해 다시 확인하는 중 — 스스로 돌아올 수 있습니다' : bad ? '다시 로그인해야 합니다' : '중계기가 스스로 갱신', cur ? '지금 쓰는 계정' : ''].filter(Boolean).join(' · ');
    return `<div class="st-opt auth-row ${esc(checking ? 'soon' : i.level)}" data-auth="${esc(i.id)}"><span class="st-opt-text">${esc(i.label)}<small><span class="auth-kind">구글 로그인</span>${esc(desc)}</small></span>`
      + `<span class="auth-right"><span class="auth-d">${esc(checking ? '확인 중' : bad ? '재로그인 필요' : (AUTH_WORD[i.level] || '모름'))}</span>${bad ? '<button class="text-btn accent" type="button" data-dash="1" title="사용량 대시보드를 엽니다 — 거기서 Antigravity 계정으로 다시 로그인합니다">대시보드에서 다시 로그인</button>' : ''}</span></div>`;
  }
  function agyCard(list = []) {
    const known = agyInfo && agyInfo.state !== 'missing';
    if (!known && !list.length) return '';
    const viaGate = agyInfo?.connection === 'gate' || list.length > 0; // 2026-11-23: 중계기(IRIS Gate)의 구글 계정을 돌려 쓴다
    let stateRow = '';
    if (known && (agyInfo.state !== 'ok' || !list.length)) {
      const W = { ok: [viaGate ? '중계기로 연결됨' : '로그인됨', 'ok'], auth: ['로그인 안 됨', 'expired'], gate: ['중계기 못 씀', 'expired'], unknown: ['확인 못 함', 'unknown'] }[agyInfo.state] || ['확인 못 함', 'unknown'];
      const how = agyInfo.state === 'gate' ? `${agyInfo.detail || '중계기 상태를 읽지 못했습니다.'} — 이 PC 의 구글 로그인으로 몰래 돌리지 않습니다.`
        : agyInfo.state === 'auth' ? '터미널에서 agy 를 한 번 실행해 구글 계정으로 로그인하세요(앱 · 확장과 함께 쓰는 로그인).'
        : agyInfo.state === 'ok' ? (viaGate ? '중계기(IRIS Gate)에 등록한 구글 계정으로 돌려 씁니다. 계정 추가 · 한도는 사용량 대시보드에서 봅니다.' : '이 PC 의 구글 계정 하나로 씁니다(돌려 쓰기 없음). 로그아웃은 agy 화면의 /logout — Antigravity 앱 로그인도 함께 풀립니다.')
        : '데몬이 아직 확인하지 못했습니다(네트워크 · 시간 초과). 로그아웃으로 보지 않습니다.';
      stateRow = `<div class="st-opt auth-row ${W[1]}"><span class="st-opt-text">${esc(W[0])}<small>${esc(how)}${agyInfo.at ? ` · 확인 ${esc(fmtWhen(agyInfo.at))}` : ''}</small></span></div>`;
    }
    return `<section class="st-grp auth-card" data-kind="antigravity"><h3 class="auth-sec-h"><span class="chip antigravity">Antigravity</span><span class="auth-sec-t">${list.length ? '계정 열쇠' : '로그인'}</span><small>${viaGate ? '중계기가 번갈아 쓰는 구글(Antigravity) 계정' : '중계기를 거치지 않는 구글 로그인'}</small>${list.length ? `<span class="auth-n">${list.length}개</span>` : ''}</h3>`
      + stateRow + list.map(agyRow).join('') + '</section>';
  }
  let agyAt = 0;
  async function loadAgy() { agyAt = Date.now(); try { const r = await fetch('/api/antigravity/status'); agyInfo = r.ok ? await r.json() : null; } catch { agyInfo = null; } }
  function renderAuth() {
    // 패널을 그릴 때마다 30초가 지났으면 다시 묻는다(로그인 · 로그아웃 뒤에도 따라오게 — 코덱스 코드 검토 B)
    if (Date.now() - agyAt > 30000) { const was = JSON.stringify(agyInfo); loadAgy().then(() => { if (open && JSON.stringify(agyInfo) !== was) { renderAuth(); syncAgyPerm(); renderNav(); } }); }
    const sec = $('#st-auth-sec'), host = $('#st-auth'), head = $('#st-auth-h'), btn = $('#st-auth-act'); if (!sec) return;
    renderNav();
    // v2.97.2(2026-11-02 사용자 신고 "복구 문구만 있고 로그인 열쇠가 없다"): 도구(iris-auth)가 없는 PC 도 절을 숨기지 않고 이유를 한 줄 보인다.
    // 데몬 상태를 아직 못 읽었으면(health·auth 둘 다 없음) 잠깐 숨긴다 — "없음"이 깜빡이지 않게.
    sec.hidden = !(auth || health);
    if (sec.hidden) return;
    if (head && !head.dataset.iced) { head.innerHTML = Icons.svg('shield', 15) + '<span>로그인 열쇠</span>'; head.dataset.iced = '1'; }
    const hasTool = !!(auth?.available || health?.features?.auth);
    btn.hidden = !hasTool;
    if (!hasTool) { host.innerHTML = '<section class="st-grp"><div class="upd-line st-sub auth-missing">이 컴퓨터에는 열쇠 만료를 살피는 도구가 아직 없습니다. 만료일·미리 알림·「1년 열쇠 받기」는 IRIS 업데이트(설정 → 업데이트·정보)를 받으면 생깁니다. 그 전에 「Login expired」가 뜨면 다시 로그인하면 그대로 이어서 쓸 수 있습니다.</div></section>' + agyCard(); return; }
    btn.disabled = authBusy;
    // 급한 열쇠가 맨 위(v2.87): 만료 → 곧 만료 → 모름 → 정상, 같은 단계면 남은 날 적은 순, 선택 항목(optional)은 맨 아래
    const RANK = { expired: 0, soon: 1, unknown: 2, ok: 3 };
    const items = (auth?.info?.items || []).slice().sort((a, b) => (!!a.optional - !!b.optional) || ((RANK[a.level] ?? 2) - (RANK[b.level] ?? 2)) || ((a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)));
    const job = auth?.job;
    if (!items.length) { host.innerHTML = '<section class="st-grp"><div class="upd-line st-sub">열쇠 상태를 아직 읽지 못했습니다 — 「다시 확인」을 눌러 보세요.</div></section>' + agyCard(); return; }
    const row = (i) => {
      const when = i.expiresAt ? fmtWhen(new Date(i.expiresAt).toISOString()) : '';
      const [kind, kcls] = i.longKey ? ['1년 열쇠', 'long'] : i.provider === 'codex' ? ['ChatGPT 로그인', ''] : ['30일 로그인', 'short'];
      const desc = [when ? `만료 ${when}` : '만료일 모름', i.optional ? 'IRIS 창은 1년 열쇠 사용 중' : ''].filter(Boolean).join(' · ');
      // 중계기 판정(health)이 있으면 그 낱말이 먼저다(대시보드와 같은 말): 재로그인 필요 / 확인 중. 없으면(옛 도구 · IRIS 열쇠) 지금까지처럼 만료일로.
      const d = i.health === 'needs-login' ? '재로그인 필요' : i.health === 'checking' ? '확인 중' : i.level === 'expired' ? '만료' : i.daysLeft != null ? `D-${i.daysLeft}` : AUTH_WORD[i.level];
      const label = !i.longKey && !i.optional && (i.group === 'iris' || i.renew === 'teamclaude-longkey') ? '1년 열쇠 받기' : '갱신';
      const running = job?.running && job.id === i.id;
      return `<div class="st-opt auth-row ${esc(i.level)}${i.optional ? ' optional' : ''}" data-auth="${esc(i.id)}"><span class="st-opt-text">${esc(i.label)}<small><span class="auth-kind ${kcls}">${esc(kind)}</span>${esc(desc)}</small></span>`
        + `<span class="auth-right"><span class="auth-d">${esc(d)}</span><button class="text-btn ${i.level === 'ok' ? 'outline' : 'accent'}" data-renew="1" ${job?.running ? 'disabled' : ''} title="브라우저에서 승인 한 번으로 새 열쇠를 받습니다">${running ? '승인 대기…' : esc(label)}</button></span></div>`;
    };
    // 열쇠 = 카드 세 장(v2.90, 사용자 요청 "영역을 명확히 구분"): IRIS 열쇠(창이 클로드 세션을 열 때 쓰는 것) | Claude 계정 열쇠 | Codex 계정 열쇠(중계기가 돌려 쓰는 계정).
    // 빈 카드도 그린다 — 0개면 어디서 더하는지 한 줄.
    const card = (kind, head, list, empty) => `<section class="st-grp auth-card" data-kind="${kind}"><h3 class="auth-sec-h">${head}<span class="auth-n">${list.length}개</span></h3>`
      + (list.length ? list.map(row).join('') : `<div class="upd-line st-sub auth-empty">${empty}</div>`) + '</section>';
    // 계정은 공급자 이름으로 가른다 — "코덱스가 아니면 클로드"로 나누지 않는다(2026-11-25 사용자 신고: 구글 계정 2개가 Claude 칸에 들어가 「갱신」이 Claude 로그인을 열었다).
    // 모르는 공급자는 어느 칸에도 넣지 않고 단추 없는 「다른 계정」 칸에 둔다.
    // 쓰지 않는 예비 열쇠(optional — 1년 열쇠가 살아 있을 때의 「IRIS 터미널 로그인」)는 줄을 내놓지 않는다(2026-11-25 사용자 요청 "필요없으면 설정에서 지우자":
    // IRIS 창은 1년 열쇠로 도는데 이 줄의 「만료」가 고장처럼 읽혔다). 1년 열쇠가 없거나 죽은 PC 에서는 도구가 optional 을 주지 않으므로 「IRIS 로그인」 줄이 그대로 보인다.
    const iris = items.filter(i => i.group === 'iris' && !i.optional), acc = items.filter(i => i.group !== 'iris');
    // Claude = 'anthropic'(지금 도구가 적는 값) · 값이 없거나 'claude'(옛 도구 · 옛 자료)도 Claude 로 본다 — 구글 계정이 생기기 전의 자료는 지금까지처럼.
    const isClaude = (i) => !i.provider || i.provider === 'anthropic' || i.provider === 'claude';
    const cl = acc.filter(isClaude), cx = acc.filter(i => i.provider === 'codex'), gg = acc.filter(i => i.provider === 'google');
    const etc = acc.filter(i => !cl.includes(i) && !cx.includes(i) && !gg.includes(i));
    const plain = (i) => `<div class="st-opt auth-row ${esc(i.level)}" data-auth="${esc(i.id)}"><span class="st-opt-text">${esc(i.label)}<small>IRIS 가 아직 모르는 종류의 계정입니다 — 사용량 대시보드에서 관리하세요</small></span><span class="auth-right"><span class="auth-d">${esc(AUTH_WORD[i.level] || '모름')}</span></span></div>`;
    host.innerHTML = card('iris', `<span class="auth-sec-t">${Icons.svg('key', 14)}IRIS 열쇠</span><small>IRIS 창이 Claude 세션을 열 때 쓰는 열쇠</small>`, iris, '열쇠 없음 — Claude 세션은 각 계정 로그인으로 열립니다')
      + card('claude', `<span class="chip claude">Claude</span><span class="auth-sec-t">계정 열쇠</span><small>중계기가 번갈아 쓰는 Claude 계정</small>`, cl, '계정 없음 — 대시보드에서 추가')
      + card('codex', `<span class="chip codex">Codex</span><span class="auth-sec-t">계정 열쇠</span><small>중계기가 번갈아 쓰는 ChatGPT(Codex) 계정</small>`, cx, '계정 없음 — 대시보드에서 추가')
      + agyCard(gg)
      + (etc.length ? `<section class="st-grp auth-card" data-kind="other"><h3 class="auth-sec-h"><span class="auth-sec-t">다른 계정</span><span class="auth-n">${etc.length}개</span></h3>${etc.map(plain).join('')}</section>` : '')
      + (auth?.info?.checkedAt ? `<div class="upd-line st-sub auth-checked">마지막 확인 ${esc(fmtWhen(auth.info.checkedAt))} · 3일 전부터 알림</div>` : '');
    if (job && (job.running || job.result)) {
      const el = document.createElement('div');
      const r = job.result; el.className = 'auth-job' + (r && r.ok === false ? ' bad' : '');
      el.textContent = [...(job.lines || []), r ? (r.ok ? `완료${r.email ? ` — ${r.email}` : ''}${r.message ? ` — ${r.message}` : ''}` : `실패 — ${r.error || r.message || ''}`) : ''].filter(Boolean).join('\n');
      host.appendChild(el);
    }
  }
  function setAuth(a) { if (!a) return; auth = a; authBadge(); authNotice(); if (open) renderAuth(); }
  function onAuth(m) {
    setAuth(m.info);
    if (m.done && m.info?.job?.result) { const r = m.info.job.result; Notify.push({ title: r.ok ? '로그인 갱신 완료' : '로그인 갱신 실패', sub: r.ok ? (r.email ? `${r.email} — 새 세션부터 적용` : (r.message || '')) : (r.error || r.message || ''), status: r.ok ? 'idle' : 'attention', force: true }); }
  }
  /** refresh = 「다시 확인」 단추(무조건 다시 읽음) · fresh = 화면을 열 때(사본이 1분보다 오래됐을 때만 다시 읽음, 옛 데몬은 이 표시를 모르고 사본을 그대로 준다) */
  async function loadAuth(refresh = false, fresh = false) {
    try { const r = await fetch(refresh ? '/api/auth/refresh' : fresh ? '/api/auth?fresh=1' : '/api/auth', refresh ? { method: 'POST' } : undefined); if (r.ok) setAuth(await r.json()); } catch {}
  }
  async function renewAuth(id) {
    const it = (auth?.info?.items || []).find(i => i.id === id); if (!it) return;
    // 중계기 계정의 갱신은 Claude · Codex 만 여기서 한다 — 그 밖의 공급자는 대시보드로(데몬 auth.mjs 도 같은 거절을 한다)
    if (it.group !== 'iris' && it.provider && !['anthropic', 'claude', 'codex'].includes(it.provider)) return opts.openDashboard?.();
    const how = it.group === 'iris'
      ? `브라우저에 claude.ai 승인 화면이 열립니다.\n${/@/.test(it.name) ? `${it.name} 계정인지 확인하고 ` : ''}「승인」을 누르면 IRIS 창용 1년 열쇠가 저장됩니다(열쇠는 화면에 보이지 않습니다).\n새로 여는 세션부터 적용됩니다.`
      : it.renew === 'teamclaude-longkey' ? `Edge 시크릿(InPrivate) 창에 claude.ai 승인 화면이 열립니다.\n그 창에서 ${it.name} 계정으로 로그인한 뒤 「승인」을 누르면 이 계정이 1년 열쇠로 바뀝니다(평소 브라우저 로그인은 그대로).\n다른 계정으로 승인하면 아무것도 바꾸지 않습니다.`
      : `브라우저에 로그인 승인 화면이 열립니다.\n브라우저가 ${it.label} 계정으로 로그인돼 있는지 확인한 뒤 「승인」을 누르세요.\n다른 계정으로 승인하면 그 계정이 갱신·추가됩니다.`;
    if (!(await Dialog.confirm(how, { title: '로그인 열쇠를 갱신할까요?', icon: 'refresh', okLabel: '시작', cancelLabel: '취소' }))) return;
    try {
      const r = await fetch('/api/auth/renew', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
      const d = await r.json().catch(() => ({}));
      if (d.auth) setAuth(d.auth);
      if (!r.ok) Dialog.error({ title: '갱신을 시작하지 못했습니다', detail: String(d.error || r.status) });
    } catch (e) { Dialog.error({ title: '갱신을 시작하지 못했습니다', detail: e.message }); }
    if (open) renderAuth();
  }

  // ---- 정보(만든 사람) 대화상자 — 값은 전부 데몬 /api/health 의 about(원천 = package.json). 데몬이 아직 없으면 화면 쪽 기본값. ----
  const ABOUT_DEF = { name: 'IRIS', version: '—', author: 'Sejun Ham (함세준)', homepage: 'https://feynman520.github.io/card/#home', license: 'MIT', since: '2026-09-08', motto: '해결은 에이전트가, 정의는 우리가.' };
  function about() {
    const a = { ...ABOUT_DEF, ...(health?.about || {}) };
    const card = a.homepage.replace(/^https?:\/\//, '').replace(/\/?#.*$/, '');
    const html = `<div class="about">
      <div class="about-head"><span class="about-mark" aria-hidden="true">${$('#mark-slot').innerHTML}</span><span class="about-name">${esc(BRAND.name)}</span></div>
      <p class="about-motto">“${esc(a.motto)}”</p>
      <dl class="about-grid">
        <dt>만든 사람</dt><dd>${esc(a.author)}</dd>
        <dt>처음 만든 날</dt><dd>${esc(a.since)}</dd>
        <dt>명함</dt><dd><a href="${esc(a.homepage)}" target="_blank" rel="noreferrer">${esc(card)}</a></dd>
        <dt>버전</dt><dd>${esc(a.version)}${health?.pid ? ` <span class="about-dim">· 데몬 pid ${esc(health.pid)}</span>` : ''}</dd>
        <dt>영혼 폴더</dt><dd><code>${esc(health?.root || '')}</code></dd>
        <dt>허가서</dt><dd>${esc(a.license)} <span class="about-dim">· © ${esc(String(a.since).slice(0, 4))} ${esc(a.author.replace(/\s*\(.*\)$/, ''))}</span></dd>
      </dl></div>`;
    return Dialog.info({ title: '정보', html, wide: true });
  }
  const koName = (s) => (String(s || '').match(/\(([^)]+)\)\s*$/) || [])[1] || s; // 'Sejun Ham (함세준)' → '함세준'
  function applyMaker() { $('#maker').textContent = `v${health?.version || '—'} · ${koName(health?.about?.author || ABOUT_DEF.author)}`; }
  /** p = 열 묶음(없으면 마지막으로 본 묶음). 예: 헤더 모듈 버튼이 멈춘 모듈을 보여 줄 때 show('mods'). */
  function show(p) { if (!open) opts.onShow?.(); open = true; $('#settings').hidden = false; $('#btn-settings').classList.add('active'); if (PANES.includes(paneOf(p))) pane = paneOf(p); showPane(pane); renderPanel(); }
  function hide() { open = false; $('#settings').hidden = true; $('#btn-settings').classList.remove('active'); destroyPreviews(); }
  function pick(patch) { Object.assign(cfg, patch); applyAll(); const sent = save(); renderPanel(); opts.onChange?.(cfg); sent.then(() => opts.onChange?.(cfg)); } // onChange 두 번: 화면은 바로, 데몬에 적힌 뒤 한 번 더(데몬이 준 한 장을 다시 읽는 쪽을 위해)

  function init(o) {
    opts = o || {};
    load(); applyAll();
    $('#btn-settings').onclick = () => (open ? hide() : show());
    $('#st-close').onclick = hide;
    // 오른쪽 목차(v2.87): 아이콘은 icons.js 이름만(이모지 0)
    for (const el of document.querySelectorAll('#st-nav [data-icon]')) el.innerHTML = Icons.svg(el.dataset.icon, 17);
    for (const el of document.querySelectorAll('#st-nav .st-nav-i')) el.title = el.querySelector('.st-nav-t').firstChild.textContent.trim(); // 좁은 창(아이콘만)에서도 이름이 보이게
    $('#st-nav').addEventListener('click', (e) => { const b = e.target.closest('.st-nav-i[data-pane]'); if (b) showPane(b.dataset.pane); });
    $('#settings').addEventListener('click', (e) => {
      const t = e.target.closest('#st-themes [data-theme]'); if (t) return pick({ theme: t.dataset.theme });
      const s = e.target.closest('#st-stages [data-stage]'); if (s) return pick({ stage: s.dataset.stage });
    });
    $('#st-density').addEventListener('input', (e) => { cfg.density = Number(e.target.value); $('#st-density-v').textContent = Math.round(cfg.density * 100) + '%'; applyStage(); });
    $('#st-density').addEventListener('change', save);
    $('#st-remeasure').addEventListener('click', () => { IrisStars.calibrate().then((st) => { if (open) renderStage(st); }); renderStage(IrisStars.status()); });
    $('#st-fps').addEventListener('click', (e) => { const chip = e.target.closest('.st-chip[data-fps]'); if (!chip) return; IrisStars.configure({ profile: { fps: Number(chip.dataset.fps), dprCap: 1 } }); renderStage(IrisStars.status()); });
    $('#st-pause').addEventListener('change', (e) => pick({ pauseWhenDim: e.target.checked }));
    $('#st-perm').addEventListener('change', (e) => pick({ permission: e.target.value }));
    $('#st-approval').addEventListener('change', (e) => pick({ approval: e.target.value }));
    $('#st-sandbox').addEventListener('change', (e) => pick({ sandbox: e.target.value }));
    $('#st-agy-perm').addEventListener('change', (e) => pick({ agyPermission: e.target.value }));
    $('#st-autoresume').addEventListener('change', (e) => pick({ autoResume: e.target.checked }));
    $('#st-notify').addEventListener('change', (e) => pick({ notifyDone: e.target.checked }));
    $('#st-notify-os').addEventListener('change', (e) => { if (e.target.checked) Notify.requestOs(); pick({ notifyOs: e.target.checked }); });
    $('#st-notify-test').onclick = () => Notify.preview();
    // 플래너(설계 조각 ⑧): 스위치 여덟 줄 · 몇 분 전 · 시각 둘 · 잠시 조용히 · 수첩 폴더
    for (const [id, k] of Object.entries(PL_SW)) $('#' + id)?.addEventListener('change', (e) => pick({ [k]: e.target.checked }));
    $('#st-pl-lead')?.addEventListener('click', (e) => { const b = e.target.closest('[data-lead]'); if (b && !b.disabled) pick({ plannerStartMin: Number(b.dataset.lead) }); });
    for (const [id, k] of [['st-pl-morning-at', 'plannerMorningAt'], ['st-pl-evening-at', 'plannerEveningAt']]) $('#' + id)?.addEventListener('change', (e) => { if (/^\d\d:\d\d$/.test(e.target.value)) pick({ [k]: e.target.value }); else renderPlanner(); });
    $('#st-pl-quiet')?.addEventListener('click', (e) => { const b = e.target.closest('[data-quiet]'); if (b && !b.disabled) setQuiet(b.dataset.quiet); });
    $('#st-pl-folder')?.addEventListener('click', openPlannerFolder);
    fetch('/api/agents').then(r => r.json()).then((a) => { agents = a; if (open) renderPanel(); }).catch(() => {});
    $('#st-mods').addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (!b) return; modAct(b.closest('[data-mod]').dataset.mod, b.dataset.act); });
    // 업데이트(v2.58): 절 머리 단추 하나 + 하루 1회 스위치. 상태는 데몬이 준다(웹소켓 방송은 main.js 가 onUpdate 로 넘긴다).
    window.UpdateChatView?.init(); // 「대화로 업데이트」 단추(app/update-chat.js)
    // 「적용 (받아 둠)」도 업데이트 칸을 연다(단추는 하나의 흐름으로 — 칸에서 고른 것만 적용한다). 받아 둔 것이니 설명 대화는 또 열지 않는다. 칸이 없으면 지금까지처럼 확인 카드로.
    $('#st-update-act').addEventListener('click', (e) => { const act = e.currentTarget.dataset.act; if (!act) return; if (act === 'apply-now' && window.UpdatePanel) return window.UpdatePanel.start({ chat: false }); updAct(act); });
    // 비밀 금고(v2.62): 보관된 복구 문구를 화면 창으로 보여 준다(데몬이 secrets-vault.ps1 -Action ShowRecovery 실행, 문구는 이 화면·로그에 오지 않음)
    $('#st-recovery')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try { const r = await fetch('/api/vault/reveal', { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) Dialog.error({ title: '복구 문구를 열지 못했습니다', detail: String(j.error || r.status) }); }
      catch (err) { Dialog.error({ title: '복구 문구를 열지 못했습니다', detail: err.message }); }
      finally { btn.disabled = false; }
    });
    $('#st-update-auto').addEventListener('change', async (e) => {
      const on = e.target.checked;
      try { const r = await fetch('/api/update/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: on }) }); if (r.ok) upd = await r.json(); }
      catch (err) { Dialog.notice('설정을 바꾸지 못했습니다.', { sub: err.message }); }
      renderUpdate();
    });
    loadUpdate();
    // 인증(v2.84): 절 머리 「다시 확인」 + 행마다 갱신 단추
    $('#st-auth-act')?.addEventListener('click', async () => { authBusy = true; renderAuth(); await loadAuth(true); authBusy = false; renderAuth(); });
    $('#st-auth')?.addEventListener('click', (e) => {
      if (e.target.closest('button[data-dash]')) return opts.openDashboard?.(); // 구글(Antigravity) 계정의 다시 로그인 = 대시보드에서(2026-11-25)
      const b = e.target.closest('button[data-renew]'); if (b) renewAuth(b.closest('[data-auth]').dataset.auth);
    });
    loadAuth();
    $('#st-tutorial')?.addEventListener('click', () => { hide(); window.Tutorial?.open({ replay: true }); }); // v2.90
    $('#maker').onclick = about;
    applyMaker();
    fetch('/api/health').then(r => r.json()).then(async (h) => { health = h; applyMaker(); loadLimits(); await pullServer(); applyAll(); opts.onChange?.(cfg); }).catch(() => {});
    loadLimits(); setInterval(loadLimits, 60000);
  }
  return { init, show, hide, about, showPane, setUpdate, confirmApply: () => updAct('confirm-apply'), updateAll: () => updAct('apply-all'), /* 업데이트 칸이 쓴다: 받아 둔 것의 확인 카드 · 지금까지의 "전부" 길 */ pane: () => pane, isOpen: () => open, get: () => cfg, health: () => health, refreshModules: () => { if (open) renderMods(); }, installModule: (name) => modAct(name, 'install'), isInstalling: (name) => installing.has(name), onUpdate, setUpdate, showUpdateResult, setAuth, onAuth, applyRemote, resync };
})();
