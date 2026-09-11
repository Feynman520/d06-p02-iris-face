// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 설정(⚙): 헤더 이름·마크·글자체·테마·중앙 애니메이션·성능. 고른 것만 실제로 적용되고, 나머지 후보는 패널을 열 때만 미리보기로 돈다.
   저장: localStorage(즉시) + 데몬 state/settings.json(브라우저·Electron 공유). 사용량 배터리도 여기서 그린다. */
window.Settings = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const R = window.Registry;
  const DEF = { name: '', mark: 'cube', font: 'bodoni', theme: 'indigo', stage: 'sphere', density: 1, pauseWhenDim: false, markSpeed: 1, permission: '', approval: '', sandbox: '', notifyDone: true, notifyOs: true };
  let cfg = { ...DEF }, health = null, open = false, themeKeys = new Set(), agents = null, previews = [];
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
    const m = R.MARKS.find(x => x.id === cfg.mark) || R.MARKS[0];
    $('#mark-slot').innerHTML = markSvg(m);
    let st = $('#mark-style'); if (!st) { st = document.createElement('style'); st.id = 'mark-style'; document.head.appendChild(st); }
    st.textContent = R.MARK_KEYFRAMES + '\n' + markCss(m, '.mark') + `\n.mark.mk-${m.id} *{animation-duration:calc(var(--mk-dur,1s) / ${cfg.markSpeed})}`;
    // animation-duration 은 개별 keyframe 정의가 우선하므로, 속도는 애니메이션 전체에 playbackRate로 적용
    $('#mark-slot').querySelectorAll('*').forEach(el => { for (const a of el.getAnimations?.() || []) a.playbackRate = cfg.markSpeed; });
  }
  function applyFont() { const f = R.FONTS.find(x => x.id === cfg.font) || R.FONTS[0]; $('#wordmark').style.cssText = f.css; }
  function applyName() { const n = (cfg.name || health?.rootName || 'IRIS').trim(); $('#wordmark').textContent = n; document.title = n; }
  function applyStage() { IrisStars.configure({ style: cfg.stage, density: cfg.density, pauseWhenDim: cfg.pauseWhenDim }); }
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
    const pv = $('#st-marks'); pv.innerHTML = R.MARKS.map(m => `<button class="st-card${m.id === cfg.mark ? ' cur' : ''}" data-mark="${m.id}" title="${esc(m.name)}">${markSvg(m, 'mark pv')}<span>${esc(m.name)}</span></button>`).join('');
    let st = $('#mark-style-pv'); if (!st) { st = document.createElement('style'); st.id = 'mark-style-pv'; document.head.appendChild(st); }
    st.textContent = R.MARKS.map(m => markCss(m, '.pv')).join('\n');
    $('#st-fonts').innerHTML = R.FONTS.map(f => `<button class="st-card font${f.id === cfg.font ? ' cur' : ''}" data-font="${f.id}" title="${esc(f.name)}"><span class="pv-word" style="${esc(f.css)}">${esc((cfg.name || health?.rootName || 'IRIS').trim())}</span><span>${esc(f.name)}</span></button>`).join('');
    $('#st-themes').innerHTML = R.THEMES.map(t => `<button class="st-card theme${t.id === cfg.theme ? ' cur' : ''}" data-theme="${t.id}"><span class="sw" style="background:${t.vars['--base']};border-color:${t.vars['--iris']}"><i style="background:${t.vars['--surface']}"></i><i style="background:${t.vars['--iris']}"></i><i style="background:${t.vars['--iris-2']}"></i></span><span>${esc(t.name)}</span></button>`).join('');
    // 중앙 애니메이션: 카드마다 작은 캔버스에서 실제로 돌려 보여 준다(패널을 닫으면 정리)
    destroyPreviews();
    $('#st-stages').innerHTML = R.STAGES.map(s => `<button class="st-card stage${s.id === cfg.stage ? ' cur' : ''}" data-stage="${s.id}" title="${esc(s.desc)}"><canvas class="stage-pv" data-pv="${s.id}"></canvas><span>${esc(s.name)}</span></button>`).join('');
    const th = R.THEMES.find(t => t.id === cfg.theme) || R.THEMES[0]; const colors = { a: th.vars['--star-a'], b: th.vars['--star-b'], c: th.vars['--star-c'], glow: th.vars['--glow'] };
    for (const c of $('#st-stages').querySelectorAll('canvas.stage-pv')) previews.push(IrisStars.preview(c, { style: c.dataset.pv, colors }));
    $('#st-name').value = cfg.name || ''; $('#st-name').placeholder = health?.rootName || 'IRIS';
    $('#st-density').value = cfg.density; $('#st-density-v').textContent = Math.round(cfg.density * 100) + '%';
    $('#st-pause').checked = !!cfg.pauseWhenDim;
    $('#st-speed').value = cfg.markSpeed; $('#st-speed-v').textContent = cfg.markSpeed + '×';
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
    $('#st-marks').querySelectorAll('.pv').forEach(svg => svg.querySelectorAll('*').forEach(el => { for (const a of el.getAnimations?.() || []) a.playbackRate = cfg.markSpeed; }));
    renderMods();
  }
  // ---- 모듈(콘센트, 2026-09-11): 목록은 데몬 /api/modules. 이름·아이콘·설명은 전부 module.json 에서 온다(본체는 어떤 모듈인지 모른다). ----
  const MOD_STATUS = { running: '실행 중', stopped: '멈춤', failed: '실패', incompatible: '맞지 않음', 'grade-unsupported': '동의 필요(2차)' };
  async function renderMods() {
    const host = $('#st-mods'); if (!host) return;
    let list = [];
    try { const r = await fetch('/api/modules'); list = (await r.json()).list || []; } catch { host.innerHTML = '<div class="st-hint">데몬에 연결되지 않아 목록을 읽지 못했습니다.</div>'; return; }
    if (!list.length) { host.innerHTML = '<div class="st-hint">설치된 모듈 없음</div>'; return; }
    host.innerHTML = list.map(m => `<div class="st-row" data-mod="${esc(m.name)}"><span class="st-row-main">${esc(m.icon)} <b>${esc(m.label)}</b> <span class="st-sub">v${esc(m.version)} · ${m.official ? '공식 ✓' : '비공식 ⚠'} · ${esc(MOD_STATUS[m.status] || m.status)}${m.reason ? ' — ' + esc(m.reason) : ''}</span></span><span class="dash-actions"><button class="text-btn" data-act="restart" title="모듈 프로세스를 다시 띄웁니다">재시작</button><button class="text-btn" data-act="remove" title="모듈 폴더를 지웁니다(그 모듈의 데이터 포함)">제거</button></span></div>`).join('');
  }
  async function modAct(name, act) {
    if (act === 'remove' && !(await Dialog.confirm(`모듈 "${name}"을 제거할까요?\n그 모듈의 폴더와 안에 저장된 데이터(로그인·설정·기록)가 함께 지워집니다. 모듈이 백업 문구를 줬다면 적어 두셨는지 확인하세요.`))) return;
    try {
      const r = await fetch(`/api/modules/${encodeURIComponent(name)}/${act}`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) Dialog.alert(`${act === 'remove' ? '제거' : '재시작'} 실패: ${d.error || r.status}`);
    } catch (e) { Dialog.alert(`${act === 'remove' ? '제거' : '재시작'} 실패: ${e.message}`); }
    renderMods();
  }
  async function installModule(file) {
    const btn = $('#st-mod-install'); if (btn.disabled) return; btn.disabled = true;
    const buf = await file.arrayBuffer();
    const post = (allow) => fetch(`/api/modules/install${allow ? '?allowUnofficial=1' : ''}`, { method: 'POST', headers: { 'x-file-name': encodeURIComponent(file.name) }, body: buf });
    try {
      let r = await post(false); let d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.error === 'unofficial') {
        const go = await Dialog.confirm(`"${d.name || file.name}" v${d.version || '?'}은(는) ${d.revoked ? '폐기된 열쇠로 서명된' : '서명이 없거나 확인되지 않는'} 비공식 모듈입니다.\n출처를 믿을 수 있을 때만 설치하세요. 설치할까요?`);
        if (!go) return;
        r = await post(true); d = await r.json().catch(() => ({}));
      }
      if (!r.ok) { Dialog.alert(`설치 실패: ${d.error || r.status}`); return; }
      Dialog.alert(`설치됨: ${d.name} v${d.version} (${d.official ? '공식' : '비공식'})`);
    } catch (e) { Dialog.alert(`설치 실패: ${e.message}`); }
    finally { btn.disabled = false; renderMods(); }
  }
  // ---- 정보(만든 사람) 대화상자 — 값은 전부 데몬 /api/health 의 about(원천 = package.json). 데몬이 아직 없으면 화면 쪽 기본값. ----
  const ABOUT_DEF = { name: 'IRIS-Face', version: '—', author: 'Sejun Ham (함세준)', homepage: 'https://feynman520.github.io/card/#home', license: 'MIT', since: '2026-09-08', motto: '해결은 에이전트가, 정의는 우리가.' };
  function about() {
    const a = { ...ABOUT_DEF, ...(health?.about || {}) };
    const card = a.homepage.replace(/^https?:\/\//, '').replace(/\/?#.*$/, '');
    const html = `<div class="about">
      <div class="about-head"><span class="about-mark" aria-hidden="true">${$('#mark-slot').innerHTML}</span><span class="about-name">${esc(a.name)}</span></div>
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
  function hide() { open = false; $('#settings').hidden = true; $('#btn-settings').classList.remove('active'); $('#mark-style-pv')?.remove(); destroyPreviews(); }
  function pick(patch) { Object.assign(cfg, patch); applyAll(); save(); renderPanel(); }

  function init(opts) {
    load(); applyAll();
    $('#btn-settings').onclick = () => (open ? hide() : show());
    $('#st-close').onclick = hide;
    $('#settings').addEventListener('click', (e) => {
      const m = e.target.closest('#st-marks [data-mark]'); if (m) return pick({ mark: m.dataset.mark });
      const f = e.target.closest('#st-fonts [data-font]'); if (f) return pick({ font: f.dataset.font });
      const t = e.target.closest('#st-themes [data-theme]'); if (t) return pick({ theme: t.dataset.theme });
      const s = e.target.closest('#st-stages [data-stage]'); if (s) return pick({ stage: s.dataset.stage });
    });
    $('#st-name').addEventListener('change', (e) => pick({ name: e.target.value.trim() }));
    $('#st-name-reset').onclick = () => pick({ name: '' });
    $('#st-density').addEventListener('input', (e) => { cfg.density = Number(e.target.value); $('#st-density-v').textContent = Math.round(cfg.density * 100) + '%'; applyStage(); });
    $('#st-density').addEventListener('change', save);
    $('#st-pause').addEventListener('change', (e) => pick({ pauseWhenDim: e.target.checked }));
    $('#st-speed').addEventListener('input', (e) => { cfg.markSpeed = Number(e.target.value); $('#st-speed-v').textContent = cfg.markSpeed + '×'; applyMark(); });
    $('#st-speed').addEventListener('change', save);
    $('#st-perm').addEventListener('change', (e) => pick({ permission: e.target.value }));
    $('#st-approval').addEventListener('change', (e) => pick({ approval: e.target.value }));
    $('#st-sandbox').addEventListener('change', (e) => pick({ sandbox: e.target.value }));
    $('#st-notify').addEventListener('change', (e) => pick({ notifyDone: e.target.checked }));
    $('#st-notify-os').addEventListener('change', (e) => { if (e.target.checked) Notify.requestOs(); pick({ notifyOs: e.target.checked }); });
    $('#st-notify-test').onclick = () => Notify.preview();
    fetch('/api/agents').then(r => r.json()).then((a) => { agents = a; if (open) renderPanel(); }).catch(() => {});
    $('#st-reset').onclick = async () => { if (await Dialog.confirm('꾸미기·권한 설정을 기본값으로 되돌릴까요?')) { cfg = { ...DEF }; applyAll(); save(); renderPanel(); } };
    $('#st-mods').addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (!b) return; modAct(b.closest('[data-mod]').dataset.mod, b.dataset.act); });
    $('#st-mod-install').onclick = () => $('#st-mod-file').click();
    $('#st-mod-file').addEventListener('change', (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) installModule(f); });
    $('#maker').onclick = about;
    applyMaker();
    fetch('/api/health').then(r => r.json()).then(async (h) => { health = h; applyMaker(); loadLimits(); await pullServer(); applyAll(); }).catch(() => {});
    loadLimits(); setInterval(loadLimits, 60000);
  }
  return { init, show, hide, about, isOpen: () => open, get: () => cfg, health: () => health, refreshModules: () => { if (open) renderMods(); } };
})();
