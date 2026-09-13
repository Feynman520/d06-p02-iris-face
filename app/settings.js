// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 설정(⚙): 테마·중앙 애니메이션·성능·권한·알림·확장 모듈. 헤더 이름·마크·글자체는 BRAND 로 고정(v2.54, 2026-09-13 사용자 결정). 고른 것만 실제로 적용되고, 나머지 후보는 패널을 열 때만 미리보기로 돈다.
   저장: localStorage(즉시) + 데몬 state/settings.json(브라우저·Electron 공유). 사용량 배터리도 여기서 그린다. */
window.Settings = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const R = window.Registry;
  const BRAND = { name: 'IRIS', mark: 'cube', font: 'segoe-script', markSpeed: 2 }; // 고정 정체성 — 설정에서 바꿀 수 없다
  const DEF = { theme: 'indigo', stage: 'sphere', density: 1, pauseWhenDim: true, permission: '', approval: '', sandbox: '', notifyDone: true, notifyOs: true }; // pauseWhenDim 기본 켬(2026-09-12 발열 사건): 저장된 설정이 있으면 그 값이 우선
  let cfg = { ...DEF }, health = null, open = false, themeKeys = new Set(), agents = null, previews = [], opts = {};
  const destroyPreviews = () => { for (const p of previews) { try { p.destroy(); } catch {} } previews = []; };

  // ---- 저장/불러오기 ----
  function load() { try { const s = JSON.parse(localStorage.getItem('iris.settings') || 'null'); if (s) cfg = { ...DEF, ...s }; } catch {} }
  async function pullServer() { try { const r = await fetch('/api/settings'); const s = await r.json(); if (s && s.updatedAt) { const local = JSON.parse(localStorage.getItem('iris.settings') || '{}'); if (!local.updatedAt || s.updatedAt > local.updatedAt) cfg = { ...DEF, ...s }; } } catch {} }
  function save() { cfg.updatedAt = new Date().toISOString(); try { localStorage.setItem('iris.settings', JSON.stringify(cfg)); } catch {} fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg) }).catch(() => {}); }

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
    const note = measured ? '' : r && r.failed ? `<span class="st-sub">측정이 끊겨 이전 값 유지</span>` : s.precise ? '' : `<span class="st-sub" title="트레이 → 창만 닫기 → IRIS-Face 다시 실행">실측은 창을 다시 연 뒤</span>`;
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
        ? battery('Claude', a?.account, a?.d7, `왕관 계정 ${a?.account || '?'} — 남은 잔량: 주간 ${L(a?.d7)} · Fable 주간 ${L(a?.d7Fable)} · 5시간 ${L(a?.h5)}  (누르면 TeamClaude 대시보드)`) + battery('Codex', c?.account, c?.d7, `왕관 계정 ${c?.account || '?'} — 남은 잔량: 주간 ${L(c?.d7)} · 5시간 ${L(c?.h5)}  (누르면 TeamClaude 대시보드)`)
        : '<span class="batt-off">대시보드</span>';
    } catch { $('#limits').innerHTML = '<span class="batt-off">대시보드</span>'; }
  }

  // ---- 패널 ----
  function renderPanel() {
    $('#st-themes').innerHTML = R.THEMES.map(t => `<button class="st-card theme${t.id === cfg.theme ? ' cur' : ''}" data-theme="${t.id}"><span class="sw" style="background:${t.vars['--base']};border-color:${t.vars['--iris']}"><i style="background:${t.vars['--surface']}"></i><i style="background:${t.vars['--iris']}"></i><i style="background:${t.vars['--iris-2']}"></i></span><span>${esc(t.name)}</span></button>`).join('');
    // 중앙 애니메이션: 카드마다 작은 캔버스에서 실제로 돌려 보여 준다(패널을 닫으면 정리)
    destroyPreviews();
    $('#st-stages').innerHTML = R.STAGES.map(s => `<button class="st-card stage${s.id === cfg.stage ? ' cur' : ''}" data-stage="${s.id}" title="${esc(s.desc)}"><canvas class="stage-pv" data-pv="${s.id}"></canvas><span>${esc(s.name)}</span></button>`).join('');
    const th = R.THEMES.find(t => t.id === cfg.theme) || R.THEMES[0]; const colors = { a: th.vars['--star-a'], b: th.vars['--star-b'], c: th.vars['--star-c'], glow: th.vars['--glow'] };
    for (const c of $('#st-stages').querySelectorAll('canvas.stage-pv')) previews.push(IrisStars.preview(c, { style: c.dataset.pv, colors }));
    $('#st-density').value = cfg.density; $('#st-density-v').textContent = Math.round(cfg.density * 100) + '%';
    renderStage(IrisStars.status());
    $('#st-pause').checked = !!cfg.pauseWhenDim;
    $('#st-root').textContent = health?.root || '';
    // 알림(2026-09-11): 작업 완료 알림 켬/끔 · 창이 뒤에 있을 때 OS 알림
    $('#st-notify').checked = cfg.notifyDone !== false; $('#st-notify-os').checked = cfg.notifyOs !== false; $('#st-notify-os').disabled = cfg.notifyDone === false;
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
    renderMods();
    renderUpdate();
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
    } catch { host.innerHTML = '<div class="mods-empty">데몬에 연결되지 않아 목록을 읽지 못했습니다.</div>'; return; }
    if (!list.length) { host.innerHTML = '<div class="mods-empty">모듈이 없습니다.</div>'; return; }
    host.innerHTML = list.map(m => {
      let meta, actions;
      if (m.installed) {
        const [word, tone] = MOD_STATUS[m.status] || [m.status, 'warn'];
        meta = `<span class="mod-tag on">설치됨</span>v${esc(m.version)} · <span class="${m.official ? '' : 'mod-unofficial'}">${m.official ? '공식' : '비공식'}</span> · <i class="mod-dot ${tone}"></i>${esc(word)}${m.reason ? ' — ' + esc(m.reason) : ''}`;
        actions = `<button class="text-btn outline" data-act="restart" title="모듈 프로세스를 다시 띄웁니다">재시작</button><button class="text-btn outline danger" data-act="remove" title="모듈 폴더를 지웁니다(그 모듈의 데이터 포함)">제거</button>`;
      } else {
        const busy = installing.has(m.name);
        meta = `<span class="mod-tag">미설치</span>${esc(m.desc)}`;
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
    if (act === 'remove' && !(await Dialog.confirm(`모듈 "${name}"을 제거할까요?\n그 모듈의 폴더와 안에 저장된 데이터(로그인·설정·기록)가 함께 지워집니다. 모듈이 백업 문구를 줬다면 적어 두셨는지 확인하세요.`))) return false;
    if (act === 'install') { if (installing.has(name)) return false; installing.add(name); bumpInstalling(); if (open) renderMods(); }
    let okay = false;
    try {
      const r = await fetch(act === 'install' ? `/api/catalog/${encodeURIComponent(name)}/install` : `/api/modules/${encodeURIComponent(name)}/${act}`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) Dialog.alert(`${ACT_WORD[act]} 실패: ${d.error || r.status}`); else okay = true;
    } catch (e) { Dialog.alert(`${ACT_WORD[act]} 실패: ${e.message}`); }
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
    const rows = Object.keys(UPD_PART).map((k) => {
      const [name, desc] = UPD_PART[k], ins = upd.installed?.[k], lat = upd.latest?.[k]?.version;
      const isNew = upd.available?.includes(k);
      const val = ins ? `v${esc(ins)}` : '미설치';
      return `<div class="st-opt upd-row"><span class="st-opt-text">${esc(name)}<small>${esc(desc)}</small></span><span class="upd-ver">${val}${isNew ? ` <span class="upd-new">→ v${esc(lat)}</span>` : ''}</span></div>`;
    }).join('');
    const when = fmtWhen(upd.lastCheck);
    const lines = [
      dev ? `<div class="upd-line st-sub">${esc(DEV_NOTE)}</div>` : '',
      upd.checkError ? `<div class="upd-line st-sub bad">확인 실패: ${esc(upd.checkError)}</div>` : '',
      !upd.checkError && upd.lastResult && upd.lastResult.ok === false ? `<div class="upd-line st-sub bad">지난 내려받기 실패: ${esc(upd.lastResult.reason)}</div>` : '',
      `<div class="upd-line st-sub">${when ? `마지막 확인 ${esc(when)}` : '아직 확인하지 않았습니다'}</div>`,
    ].join('');
    host.innerHTML = rows + lines;
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
  function onUpdate(m) {
    if (m.info) { upd = m.info; updBusy = false; }
    else if (m.phase === 'download' && upd) upd.applying = { part: m.part, index: m.index || 1, count: m.count || 1, received: m.received, total: m.total };
    if (m.phase === 'error' || m.phase === 'ready' || m.phase === 'checked') updBusy = false;
    if (open) renderUpdate();
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
    if (act === 'check') { updBusy = true; renderUpdate(); try { const r = await fetch('/api/update/check', { method: 'POST' }); upd = r.ok ? await r.json() : upd; if (!r.ok) Dialog.alert('확인 실패: 릴리스를 읽지 못했습니다.'); } catch (e) { Dialog.alert(`확인 실패: ${e.message}`); } finally { updBusy = false; renderUpdate(); } return; }
    if (act === 'apply') {
      updBusy = true; renderUpdate();
      let r;
      try { const res = await fetch('/api/update/apply', { method: 'POST' }); r = await res.json().catch(() => ({})); } catch (e) { r = { ok: false, reason: e.message }; }
      updBusy = false; if (r.info) upd = r.info; renderUpdate();
      if (!r.ok) { Dialog.alert(`업데이트 실패: ${r.reason || r.error || '알 수 없는 오류'}`); return; }
      if (!upd?.plan) { Dialog.alert('최신 판으로 바꿨습니다. 세션은 그대로입니다.'); return; }
      act = 'confirm-apply';
    }
    if (act === 'apply-now' || act === 'confirm-apply') {
      const n = opts.sessionCount?.() ?? 0;
      const kinds = (upd?.plan?.items || []).map(i => `${(UPD_PART[i.kind] || [i.kind])[0]} v${i.version}`).join(' · ');
      const msg = `받아 둔 새 판을 지금 적용할까요?\n\n${kinds}\n\n세션 ${n}개가 끝나고 적용 뒤 자동으로 다시 열립니다. IRIS 창도 잠시 닫혔다 스스로 다시 켜집니다.`;
      if (!(await Dialog.confirm(msg, { okLabel: '지금 적용', cancelLabel: '나중에' }))) { renderUpdate(); return; }
      try {
        const res = await fetch('/api/update/apply-now', { method: 'POST' }); const d = await res.json().catch(() => ({}));
        if (!res.ok) { Dialog.alert(`적용 실패: ${d.reason || d.error || res.status}`); return; }
        Notify.push({ title: '업데이트 적용 중', sub: '창이 잠시 닫혔다 다시 열립니다', status: 'idle', force: true });
      } catch (e) { Dialog.alert(`적용 실패: ${e.message}`); }
    }
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
  function show() { open = true; $('#settings').hidden = false; $('#btn-settings').classList.add('active'); renderPanel(); }
  function hide() { open = false; $('#settings').hidden = true; $('#btn-settings').classList.remove('active'); destroyPreviews(); }
  function pick(patch) { Object.assign(cfg, patch); applyAll(); save(); renderPanel(); }

  function init(o) {
    opts = o || {};
    load(); applyAll();
    $('#btn-settings').onclick = () => (open ? hide() : show());
    $('#st-close').onclick = hide;
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
    $('#st-notify').addEventListener('change', (e) => pick({ notifyDone: e.target.checked }));
    $('#st-notify-os').addEventListener('change', (e) => { if (e.target.checked) Notify.requestOs(); pick({ notifyOs: e.target.checked }); });
    $('#st-notify-test').onclick = () => Notify.preview();
    fetch('/api/agents').then(r => r.json()).then((a) => { agents = a; if (open) renderPanel(); }).catch(() => {});
    $('#st-mods').addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (!b) return; modAct(b.closest('[data-mod]').dataset.mod, b.dataset.act); });
    // 업데이트(v2.58): 절 머리 단추 하나 + 하루 1회 스위치. 상태는 데몬이 준다(웹소켓 방송은 main.js 가 onUpdate 로 넘긴다).
    $('#st-update-act').addEventListener('click', (e) => { const act = e.currentTarget.dataset.act; if (act) updAct(act); });
    $('#st-update-auto').addEventListener('change', async (e) => {
      const on = e.target.checked;
      try { const r = await fetch('/api/update/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: on }) }); if (r.ok) upd = await r.json(); }
      catch (err) { Dialog.alert(`설정을 바꾸지 못했습니다: ${err.message}`); }
      renderUpdate();
    });
    loadUpdate();
    $('#maker').onclick = about;
    applyMaker();
    fetch('/api/health').then(r => r.json()).then(async (h) => { health = h; applyMaker(); loadLimits(); await pullServer(); applyAll(); }).catch(() => {});
    loadLimits(); setInterval(loadLimits, 60000);
  }
  return { init, show, hide, about, isOpen: () => open, get: () => cfg, health: () => health, refreshModules: () => { if (open) renderMods(); }, installModule: (name) => modAct(name, 'install'), isInstalling: (name) => installing.has(name), onUpdate, setUpdate, showUpdateResult };
})();
