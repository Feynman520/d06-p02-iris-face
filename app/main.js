// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* IRIS 클라이언트: 레일(작업목록) · 무대(별의 구 / 대화 / 터미널) · 도크(폴더 → 에이전트·모델·사고깊이 → 요청).
   터미널 방식 그대로: 사용자가 조합을 고르고 세션을 열면 그 세션에서 쭉 쓴다. 자동 판정 없음. */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STATUS_KO = { busy: '작업 중', idle: '대기', attention: '확인 필요', exited: '종료됨', dead: '재개 가능', orphan: '외부 소유', delegated: '보조 작업 중', waiting: '보조 응답 대기' };
  /** 겉보기 상태(v2.40, 2026-09-11): 데몬 상태가 '대기'인데 살아 있는 보조(서브에이전트)가 있으면 초록으로 그리지 않는다.
   *  running이 하나라도 있으면 'delegated'(보라 고리), running은 없고 quiet(60초 조용, 완료 미확정)만 남았으면 'waiting'(노란 고리, v2.40.1 — 조용하다고 끝난 게 아니다).
   *  데몬 상태(rec.status)는 터미널 화면 판정·Esc 중단에 묶여 있어 손대지 않고, 점·글자만 이 값으로 그린다. */
  const viewStatus = (s) => (s.status !== 'idle' ? s.status : SubPanel.running(s.id) ? 'delegated' : SubPanel.alive(s.id) ? 'waiting' : 'idle');
  const statusText = (s) => { const v = viewStatus(s); return (v === 'delegated' || v === 'waiting') ? `${STATUS_KO[v]} ⁺${SubPanel.alive(s.id)}` : (STATUS_KO[v] || v); };
  const AGENT_KO = { claude: 'Claude', codex: 'Codex' };
  let sessions = [], current = null, ws = null, term = null, fit = null, mode = 'chat', AGENTS = null;
  let folder = null;                 // 새 요청 모드에서 고른 폴더
  let setupMode = 'new';             // 'new' = 새 세션 조합 / 'switch' = 열린 세션의 조합 바꾸기
  const sel = loadSel();             // { agent, model:{claude,codex}, effort:{claude,codex}, readOnly }
  const api = async (method, path, body) => { const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j; };
  const shortPath = (p) => p.split(/[\\/]/).filter(Boolean).slice(-1)[0] || p;
  const cur = () => sessions.find(s => s.id === current) || null;
  const PERM_KO = { bypassPermissions: '전부 허용', acceptEdits: '편집 자동 허용', auto: '자동', dontAsk: '묻지 않음', manual: '매번 묻기', plan: '계획만', never: '승인 없음', 'on-request': '필요 시 승인', 'read-only': '읽기 전용', 'workspace-write': '작업 폴더 쓰기', 'danger-full-access': '전체 접근' };
  const permText = (r) => [r.permission, r.approval, r.sandbox].filter(Boolean).map(k => PERM_KO[k] || k).join(' · ');
  const label = (r) => r ? `${AGENT_KO[r.agent] || r.agent} ${r.modelLabel || r.model} · ${r.effort}${permText(r) ? ' · ' + permText(r) : ''}` : '';

  IrisStars.mount($('#iris'));
  Transcript.mount($('#chat'));

  // ---------- 조합 선택 상태(마지막 선택 기억) ----------
  function loadSel() { try { const s = JSON.parse(localStorage.getItem('iris.sel') || 'null'); if (s && s.model && s.effort) return { permission: '', approval: '', sandbox: '', ...s }; } catch {} return { agent: 'claude', model: { claude: 'opus', codex: 'gpt-5.6-terra' }, effort: { claude: 'high', codex: 'medium' }, permission: '', approval: '', sandbox: '' }; }
  function saveSel() { try { localStorage.setItem('iris.sel', JSON.stringify(sel)); } catch {} }
  // 권한 기본값은 설정(⚙ → 권한 기본값)에서 온다
  function currentSel() { const st = Settings.get(); return { agent: sel.agent, model: sel.model[sel.agent], effort: sel.effort[sel.agent], permission: sel.agent === 'claude' ? (st.permission || '') : '', approval: sel.agent === 'codex' ? (st.approval || '') : '', sandbox: sel.agent === 'codex' ? (st.sandbox || '') : '' }; }
  const fill = (el, list, val) => { el.innerHTML = list.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join(''); el.value = val ?? ''; };
  function renderSetup() {
    if (!AGENTS) return;
    // 잠든 에이전트 깨우기(installer Task 17): AGENTS 는 영수증이 있으면 활성 에이전트만 담겨 온다.
    // 그 목록에 없는 버튼은 숨기고, 지금 고른 에이전트가 잠들었으면 남아 있는 첫 에이전트로 넘어간다.
    for (const b of document.querySelectorAll('.seg-agent .seg-btn')) b.hidden = !AGENTS[b.dataset.agent];
    if (!AGENTS[sel.agent]) { sel.agent = Object.keys(AGENTS)[0]; saveSel(); }
    const a = AGENTS[sel.agent];
    const model = a.models.find(m => m.id === sel.model[sel.agent]) || a.models.find(m => m.id === a.default.model);
    const efforts = model.efforts || a.efforts;
    const effort = a.efforts.slice(0, a.efforts.indexOf(sel.effort[sel.agent]) + 1).reverse().find(e => efforts.includes(e)) || a.default.effort;
    if (sel.model[sel.agent] !== model.id || sel.effort[sel.agent] !== effort) {
      sel.model[sel.agent] = model.id; sel.effort[sel.agent] = effort; saveSel();
    }
    for (const b of document.querySelectorAll('.seg-agent .seg-btn')) b.classList.toggle('active', b.dataset.agent === sel.agent);
    const sm = $('#sel-model'); sm.innerHTML = a.models.map(m => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join(''); sm.value = sel.model[sel.agent];
    const se = $('#sel-effort'); se.innerHTML = efforts.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join(''); se.value = sel.effort[sel.agent];
    const s = cur();
    // 세션 모드에서는 조합 줄을 감춘다. 입력창의 조합 아이콘을 누르면 '이어가기' 모드로 나타난다.
    $('#setup').hidden = !!s && setupMode !== 'switch';
    $('#setup').classList.toggle('switching', setupMode === 'switch');
    $('#btn-folder').hidden = setupMode === 'switch';
    $('#setup-apply').hidden = setupMode !== 'switch'; $('#setup-cancel').hidden = setupMode !== 'switch';
    $('#btn-tune').hidden = !s; $('#btn-tune').classList.toggle('active', setupMode === 'switch');
  }
  document.querySelectorAll('.seg-agent .seg-btn').forEach(b => b.onclick = () => { sel.agent = b.dataset.agent; saveSel(); renderSetup(); });
  $('#sel-model').onchange = (e) => { sel.model[sel.agent] = e.target.value; saveSel(); renderSetup(); };
  $('#sel-effort').onchange = (e) => { sel.effort[sel.agent] = e.target.value; saveSel(); };
  $('#btn-tune').onclick = () => {
    const s = cur(); if (!s) return;
    if (setupMode === 'switch') { setupMode = 'new'; renderSetup(); return; }
    setupMode = 'switch'; sel.agent = s.agent; sel.model[s.agent] = s.model; sel.effort[s.agent] = s.effort; renderSetup(); $('#sel-model').focus();
  };
  $('#setup-cancel').onclick = () => { setupMode = 'new'; renderSetup(); };
  $('#setup-apply').onclick = async () => {
    const s = cur(); if (!s) return; const c = currentSel();
    const to = `${AGENT_KO[c.agent]} ${$('#sel-model').selectedOptions[0]?.textContent} · ${c.effort}`;
    const cross = c.agent !== s.agent;
    if (!cross && !s.sessionId) { await Dialog.alert('첫 메시지를 보낸 뒤에 바꿀 수 있습니다.'); return; }
    const msg = cross
      ? `${AGENT_KO[s.agent]} → ${to}\n\n다른 에이전트라 같은 세션을 그대로 잇지는 못하고, 지금까지의 대화를 글로 묶어 새 ${AGENT_KO[c.agent]} 세션의 첫 요청으로 넘깁니다(최근 8천 자). 계속할까요?`
      : `${to}으로 같은 대화를 다시 엽니다(현재 프로세스 종료). 계속할까요?`;
    if (!(await Dialog.confirm(msg, { okLabel: '계속' }))) return;
    try {
      await api('POST', `/api/sessions/${s.id}/switch`, { agent: c.agent, model: c.model, effort: c.effort, permission: c.permission, approval: c.approval, sandbox: c.sandbox });
      setupMode = 'new'; renderSetup(); if (cross) { Transcript.clear(); setTimeout(() => loadTranscript(s.id), 1500); }
    } catch (e) { Dialog.alert(e.message); }
  };

  // ---------- 연결 ----------
  function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => { $('#link-dot').className = 'link-dot ok'; if (current && current !== 'preview') attach(current); };
    ws.onclose = () => { $('#link-dot').className = 'link-dot bad'; setTimeout(connect, 1500); };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'hello') { sessions = m.sessions; if (m.subs) for (const [id, l] of Object.entries(m.subs)) SubPanel.setList(id, l); if (Array.isArray(m.modules)) setModules(m.modules); render(); }
      else if (m.type === 'modules') setModules(m.list);                                                   // 모듈 콘센트: 상태·panel·배지
      else if (m.type === 'module-notify') Notify.external({ id: `mod:${m.module}:${m.target || ''}`, title: m.title, sub: m.sub });
      else if (m.type === 'subagents') SubPanel.setList(m.id, m.list);        // 보조 작업 목록(칩·⁺N·서랍 탭, 2026-09-11)
      else if (m.type === 'subtranscript') SubPanel.onTranscript(m);          // 서랍이 보고 있는 보조의 기록
      else if (m.type === 'sessions') { sessions = m.list; render(); }
      else if (m.type === 'status') { const s = sessions.find(x => x.id === m.id); if (s) { s.status = m.status; render(); if (m.id === current) Transcript.setBusy(m.status === 'busy'); Notify.onStatus(m, s, SubPanel.alive(m.id)); } }
      else if (m.type === 'replay') { if (m.id === current && term) { term.reset(); term.write(m.data); } }
      else if (m.type === 'output') { if (m.id === current && term) term.write(m.data); }
      else if (m.type === 'transcript') { if (m.id === current) { if (m.reset) Transcript.render(m.items, m.meta); else Transcript.append(m.items, m.meta); afterTranscript(m.meta); } }
      else if (m.type === 'activity') { if (m.id === current) { const s = cur(); if (s?.status === 'busy') Transcript.setBusy(true, m.text); } }
      else if (m.type === 'prompt') { const s = sessions.find(x => x.id === m.id); if (s) { s.prompt = m.prompt; if (m.id === current) Approval.render(s); } } // 확인 카드(v2.43): 노란불의 질문·선택지
      else if (m.type === 'agents') { AGENTS = m.agents; renderSetup(); } // 잠든 에이전트 깨우기(installer Task 17): 활성 목록이 바뀜 → 조합 선택 다시 그림
    };
  }
  const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

  // ---------- 그리기 ----------
  // 작업목록 순서: 사용자가 끌어서 정한 순서(localStorage 'iris.order' = id 배열). 모르는 세션(새 세션)은 데몬 순서대로 뒤에 붙는다.
  // sessions 배열 자체를 정렬해 두므로 Ctrl+1~9 번호와 화면 순서가 같다.
  const ORDER_KEY = 'iris.order';
  const loadOrder = () => { try { const a = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  const saveOrder = () => { try { localStorage.setItem(ORDER_KEY, JSON.stringify(sessions.map(s => s.id))); } catch {} };
  function sortSessions() {
    const order = loadOrder(); if (!order.length) return;
    const rank = new Map(order.map((id, i) => [id, i]));
    sessions = sessions.map((s, i) => ({ s, k: rank.has(s.id) ? rank.get(s.id) : order.length + i })).sort((a, b) => a.k - b.k).map(x => x.s);
  }
  let dragId = null;
  function moveSession(fromId, toId, after) {
    if (!fromId || !toId || fromId === toId) return;
    const from = sessions.findIndex(s => s.id === fromId); if (from < 0) return;
    const [rec] = sessions.splice(from, 1);
    let to = sessions.findIndex(s => s.id === toId); if (to < 0) { sessions.splice(from, 0, rec); return; }
    if (after) to += 1;
    sessions.splice(to, 0, rec); saveOrder(); render();
  }
  function render() {
    sortSessions();
    const list = $('#session-list'); list.innerHTML = '';
    sessions.forEach((s, i) => {
      const li = document.createElement('li'); li.className = 'srow' + (s.id === current ? ' active' : ''); li.dataset.id = s.id; li.draggable = true;
      li.innerHTML = `<span class="dot ${viewStatus(s)}" title="${statusText(s)}"></span>
        <span class="sname" title="${esc(s.title || '')}"><span class="stitle">${esc(s.title || shortPath(s.cwd))}</span>${SubPanel.alive(s.id) ? `<span class="subn${SubPanel.running(s.id) ? '' : ' quiet'}" title="살아 있는 보조 작업 ${SubPanel.alive(s.id)}개(실행 중 ${SubPanel.running(s.id)})">⁺${SubPanel.alive(s.id)}</span>` : ''}</span><span class="sidx">${i + 1}</span>
        <span class="smeta"><span class="chip ${s.agent}">${AGENT_KO[s.agent]}</span> ${s.title ? `<span class="sfold" title="${esc(s.cwd)}">${esc(shortPath(s.cwd))}</span> · ` : ''}${esc(s.modelLabel || s.model)} · ${esc(s.effort)}${permText(s) ? ' · ' + esc(permText(s)) : ''} · ${statusText(s)}</span>`;
      li.onclick = () => select(s.id);
      // 끌어서 순서 바꾸기(HTML5 DnD): 놓는 위치는 대상 행의 위/아래 절반으로 판단
      li.ondragstart = (e) => { dragId = s.id; li.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', s.id); e.dataTransfer.effectAllowed = 'move'; } catch {} };
      li.ondragend = () => { dragId = null; list.querySelectorAll('.srow').forEach(r => r.classList.remove('dragging', 'drop-before', 'drop-after')); };
      li.ondragover = (e) => { if (!dragId || dragId === s.id) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const r = li.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2; li.classList.toggle('drop-before', !after); li.classList.toggle('drop-after', after); };
      li.ondragleave = () => li.classList.remove('drop-before', 'drop-after');
      li.ondrop = (e) => { if (!dragId) return; e.preventDefault(); const r = li.getBoundingClientRect(); moveSession(dragId, s.id, e.clientY > r.top + r.height / 2); dragId = null; };
      list.appendChild(li);
    });
    $('#rail-count').textContent = sessions.length ? `${sessions.length}` : '';
    if (current && current !== 'preview' && !cur()) current = null;
    $('#view').hidden = !current;
    IrisStars.setDim(!!current);
    IrisStars.setEnergy(sessions.some(s => s.status === 'busy' || viewStatus(s) === 'delegated') ? 0.7 : 0);
    renderComposer(); renderSetup();
    if (current && current !== 'preview') renderHead();
  }
  function renderHead() {
    const s = cur(); if (!s) return;
    $('#vh-dot').className = 'dot ' + viewStatus(s);
    $('#vh-title').textContent = s.title || shortPath(s.cwd); $('#vh-title').title = s.title ? `${s.title}\n${s.cwd}` : s.cwd;
    $('#vh-combo').textContent = `${s.title ? shortPath(s.cwd) + ' · ' : ''}${label(s)} · ${statusText(s)}`; $('#vh-combo').title = `${s.cwd}\n${s.cmdline || ''}`;
    if (s.status !== 'busy') $('#activity').hidden = true;
    const dead = s.status === 'dead' || s.status === 'exited' || s.status === 'orphan';
    $('#dead-bar').hidden = !dead; $('#dead-resume').textContent = s.resumeCmd || '(재개 명령 없음)';
    $('#btn-close').title = dead ? '기록 지우기' : '이 세션 종료(PID 기준)';
    Approval.render(s); // 노란불 + prompt 있을 때만 카드가 보인다(상태가 바뀌면 함께 내려감)
  }
  function renderComposer() {
    const s = cur(); const fb = $('#btn-folder'); const fn = $('#folder-name'); const ta = $('#composer-text');
    if (s) { fb.className = 'folder-btn locked'; fn.textContent = shortPath(s.cwd); fb.title = `이 세션의 폴더: ${s.cwd} — 누르면 다른 폴더에서 새 요청`; ta.placeholder = ''; }
    else if (folder) { fb.className = 'folder-btn picked'; fn.textContent = folder.name; fb.title = folder.path; ta.placeholder = ''; }
    else { fb.className = 'folder-btn'; fn.textContent = '폴더'; fb.title = '폴더 고르기 (Ctrl+O)'; ta.placeholder = '폴더를 고르고 요청을 적어 주세요'; }
  }

  // ---------- 세션 선택 / 새 요청 모드 ----------
  function select(id) { current = id; setupMode = 'new'; ensureTerm(); render(); attach(id); SubPanel.onSession(id); if (mode === 'term') term.focus(); else $('#composer-text').focus(); }
  function goHome() { current = null; setupMode = 'new'; send({ type: 'detach' }); SubPanel.onSession(null); Transcript.clear(); Approval.render(null); render(); $('#composer-text').focus(); }
  function attach(id) { send({ type: 'attach', id }); setTimeout(doFit, 50); loadTranscript(id); }
  async function loadTranscript(id) {
    Transcript.clear(); $('#vh-usage').textContent = ''; $('#activity').hidden = true;
    try { const j = await api('GET', `/api/sessions/${id}/transcript`); if (id !== current) return; Transcript.render(j.items || [], j.meta); Transcript.setBusy(cur()?.status === 'busy'); afterTranscript(j.meta); } catch (e) { console.warn('transcript', e); }
  }
  // 컨텍스트 사용률 = 마지막 요청의 입력 토큰 ÷ 컨텍스트 창(코덱스는 기록값, 클로드는 모델 추정)
  function afterTranscript(meta) {
    const u = meta?.usage, w = meta?.window; const el = $('#vh-usage');
    if (!u) { el.textContent = ''; return; }
    const pct = w ? Math.min(100, Math.round(u.in / w * 100)) : null;
    el.textContent = pct == null ? `입력 ${fmtK(u.in)}` : `컨텍스트 ${pct}%`;
    el.title = `${meta.model || ''} · 마지막 입력 ${fmtK(u.in)} 토큰 / 창 ${w ? fmtK(w) : '?'} · 출력 ${fmtK(u.out)}`;
    el.classList.toggle('warn', pct != null && pct >= 70); el.classList.toggle('bad', pct != null && pct >= 90);
  }
  const fmtK = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n || 0);

  // ---------- 터미널 ----------
  function ensureTerm() {
    if (term) return;
    term = new Terminal({ fontFamily: '"Cascadia Code", "Cascadia Mono", "D2Coding", Consolas, monospace', fontSize: 13, theme: { background: '#070910' }, cursorBlink: true, allowProposedApi: true, scrollback: 5000 });
    fit = new FitAddon.FitAddon(); term.loadAddon(fit); term.open($('#term'));
    term.onData((d) => { if (current) send({ type: 'input', id: current, data: d }); });
    new ResizeObserver(() => doFit()).observe($('#term-wrap'));
  }
  function doFit() { if (!term || !current || mode !== 'term') return; try { fit.fit(); send({ type: 'resize', id: current, cols: term.cols, rows: term.rows }); } catch {} }
  function setMode(m) {
    mode = m; $('#view').dataset.mode = m; $('#term-wrap').hidden = m !== 'term';
    $('#btn-mode-chat').classList.toggle('active', m === 'chat'); $('#btn-mode-term').classList.toggle('active', m === 'term');
    if (m === 'term') setTimeout(() => { doFit(); term?.focus(); }, 30); else $('#composer-text').focus();
  }
  $('#btn-mode-chat').onclick = () => setMode('chat'); $('#btn-mode-term').onclick = () => setMode('term');

  // ---------- 폴더 ----------
  FolderPicker.init({ onPick: (f) => { folder = { path: f.path, rel: f.rel, name: f.name }; if (current) { current = null; setupMode = 'new'; send({ type: 'detach' }); Transcript.clear(); } render(); $('#composer-text').focus(); } });
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const relOf = (p) => {
    const root = Settings.health()?.root;
    if (!root) return p;
    const pattern = '^' + root.split(/[\\/]/).filter(Boolean).map(escRe).join('[\\\\/]') + '[\\\\/]?';
    return p.replace(new RegExp(pattern, 'i'), '');
  };
  $('#btn-folder').onclick = () => FolderPicker.toggle(cur() ? relOf(cur().cwd) : folder?.rel);

  // ---------- 첨부: 사진·파일(업로드 → 경로 삽입) · 카메라 · 음성(준비 중) ----------
  const attachments = [];
  function renderAttach() { $('#attach-list').innerHTML = attachments.map((a, i) => `<span class="attach"><code title="${esc(a.path)}">${esc(a.name)}</code><button data-i="${i}" title="빼기">✕</button></span>`).join(''); }
  $('#attach-list').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { attachments.splice(Number(b.dataset.i), 1); renderAttach(); } });
  async function upload(file, name) {
    const r = await fetch('/api/upload', { method: 'POST', headers: { 'x-file-name': encodeURIComponent(name || file.name) }, body: file });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText);
    attachments.push({ name: name || file.name, path: j.path }); renderAttach();
  }
  $('#btn-photo').onclick = () => $('#file-in').click();
  $('#btn-file').onclick = () => $('#file-any').click();
  for (const id of ['#file-in', '#file-any']) $(id).addEventListener('change', async (e) => { for (const f of e.target.files) { try { await upload(f); } catch (err) { await Dialog.alert(err.message); } } e.target.value = ''; });
  let camStream = null;
  $('#btn-cam').onclick = async () => { try { camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false }); $('#cam-video').srcObject = camStream; $('#cam').hidden = false; } catch (err) { Dialog.alert('카메라를 열 수 없습니다: ' + err.message); } };
  function camStop() { camStream?.getTracks().forEach(t => t.stop()); camStream = null; $('#cam').hidden = true; }
  $('#cam-cancel').onclick = camStop;
  $('#cam-shot').onclick = async () => {
    const v = $('#cam-video'); const c = document.createElement('canvas'); c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720; c.getContext('2d').drawImage(v, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); camStop();
    try { await upload(blob, `camera-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`); } catch (err) { Dialog.alert(err.message); }
  };
  // 🎤 음성 입력(app/voice.js): 녹음 → 데몬 로컬 위스퍼 → 글이 입력창에 들어옴(자동 전송 없음). 녹음·전사 중엔 보내기 잠금.
  Voice.init({ textarea: $('#composer-text'), button: $('#btn-mic'), strip: $('#voice-strip'), folderHint: () => shortPath(cur()?.cwd || folder?.path || ''), onBusy: (b) => { $('#btn-send').disabled = b; } });
  const withAttachments = (text) => attachments.length ? `${text}\n\n[첨부 파일]\n${attachments.map(a => a.path).join('\n')}` : text;

  // ---------- 오른쪽 서랍(대시보드·모듈 화면 공용) ----------
  // 서랍은 하나, 안에 무엇을 보일지는 key 로 구분: 'dash' = TeamClaude 대시보드(선택 기능), 'mod:<이름>' = 모듈 화면(계약 v1 panel 주소).
  // 대시보드는 도구가 있는 PC에서만(features.dashboard). 모듈 버튼은 데몬이 준 목록(features.modules / ws modules)에서만 생긴다.
  let DASH_URL = 'http://127.0.0.1:3457/';
  let dashEnabled = true;
  let modules = [];                 // ModuleInfo[] — 데몬이 준 그대로
  let drawerKey = null;             // 지금 서랍이 보여 주는 것
  const PANEL_RE = /^http:\/\/127\.0\.0\.1:\d+\//;  // 모듈이 준 panel 주소는 로컬 127.0.0.1 뿐이어야 신뢰(콘센트가 신뢰 못 할 값을 줄 수 있음)
  const fr = $('#dash-frame');
  fetch('/api/health').then(r => r.json()).then((h) => {
    const f = h?.features; if (!f) return;
    if (f.dashPort) DASH_URL = `http://127.0.0.1:${f.dashPort}/`;
    if (f.dashboard === false) { dashEnabled = false; $('#limits').hidden = true; if (drawerKey === 'dash') closeDrawer(); }
    if (Array.isArray(f.modules)) setModules(f.modules);
  }).catch(() => {});
  async function ensureDash() {
    try { const r = await fetch('/api/dash/ensure', { method: 'POST' }); const d = await r.json().catch(() => ({})); return { alive: r.ok, started: !!d.started, port: d.port }; }
    catch { return { alive: null, started: false }; }
  }
  const dashUrl = (port) => port ? `http://127.0.0.1:${port}/` : DASH_URL;
  async function loadDash(force) { const d = await ensureDash(); if (force || d.started || !fr.src || fr.src === 'about:blank') fr.src = dashUrl(d.port); }
  let drawerCloseTimer = 0;
  function openDrawer(key, { title, url, ext = true }) {
    const d = $('#dash'); clearTimeout(drawerCloseTimer);
    const switched = drawerKey !== key;
    if (switched) { fr.src = 'about:blank'; }
    drawerKey = key; $('#dash-title').textContent = title; $('#dash-ext').hidden = !ext;
    $('#limits').classList.toggle('active', key === 'dash');
    for (const b of $('#mod-btns').querySelectorAll('.mod-btn')) b.classList.toggle('active', key === `mod:${b.dataset.mod}`);
    d.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('open')));
    if (key === 'dash') loadDash(switched); else if (url && (switched || fr.src !== url)) fr.src = url;
  }
  function closeDrawer() {
    const d = $('#dash'); if (d.hidden) return;
    d.classList.remove('open'); $('#limits').classList.remove('active');
    for (const b of $('#mod-btns').querySelectorAll('.mod-btn')) b.classList.remove('active');
    drawerCloseTimer = setTimeout(() => { if (!d.classList.contains('open')) d.hidden = true; }, 360);
    drawerKey = null; ta.focus();   // 서랍을 닫으면 초점은 반드시 입력창으로(iframe 초점 잔류 → "입력 불가" 재발 방지)
  }
  const drawerOpenFor = (key) => !$('#dash').hidden && drawerKey === key;
  function toggleDash(force) {
    const open = force ?? !drawerOpenFor('dash');
    if (open && !dashEnabled) return;   // 도구 없는 PC: Ctrl+D 도 조용히 무시
    open ? openDrawer('dash', { title: 'TeamClaude 대시보드', url: DASH_URL }) : closeDrawer();
  }
  function openModule(name) {
    const m = modules.find(x => x.name === name); if (!m || !m.panel || !PANEL_RE.test(m.panel)) return false;
    drawerOpenFor(`mod:${name}`) ? closeDrawer() : openDrawer(`mod:${name}`, { title: `${m.icon} ${m.label}`, url: m.panel, ext: false });
    return true;
  }
  // 모듈 목록 → 헤더 버튼(아이콘 + 배지). 실행 중이 아니면(또는 panel 주소가 127.0.0.1 이 아니면) 눌리지 않고 이유를 툴팁으로. 목록이 비면 버튼 자체가 없다.
  function setModules(list) {
    modules = Array.isArray(list) ? list : [];
    const host = $('#mod-btns');
    host.innerHTML = modules.map(m => {
      const rejected = !!m.panel && !PANEL_RE.test(m.panel);
      const panelOk = !!m.panel && !rejected;
      const n = Number(m.badge) || 0;
      return `<button class="mod-btn${drawerOpenFor(`mod:${m.name}`) ? ' active' : ''}" data-mod="${esc(m.name)}" ${panelOk ? '' : 'disabled'} title="${esc(m.label)} v${esc(m.version)}${m.official ? ' · 공식' : ' · 비공식'}${panelOk ? '' : ` · ${rejected ? 'panel address rejected' : `${esc(m.status)}${m.reason ? ': ' + esc(m.reason) : ''}`}`}">${esc(m.icon)}${n > 0 ? `<span class="mod-badge">${n > 99 ? '99+' : n}</span>` : ''}</button>`;
    }).join('');
    for (const b of host.querySelectorAll('.mod-btn')) b.onclick = () => openModule(b.dataset.mod);
    if (drawerKey?.startsWith('mod:') && !modules.some(m => `mod:${m.name}` === drawerKey && m.panel && PANEL_RE.test(m.panel))) closeDrawer(); // 보던 모듈이 죽거나 panel 이 거부되면 서랍도 닫힘
    try { window.Settings?.refreshModules?.(); } catch {}
  }
  $('#limits').onclick = () => toggleDash(); $('#dash-close').onclick = () => closeDrawer();
  $('#dash-reload').onclick = () => { if (drawerKey === 'dash') loadDash(true); else if (drawerKey) { const u = fr.src; fr.src = 'about:blank'; requestAnimationFrame(() => { fr.src = u; }); } };
  $('#dash-ext').onclick = () => { if (drawerKey === 'dash') window.open(fr.src || DASH_URL, '_blank'); };

  // ---------- 보내기: 세션이 있으면 그 세션으로, 없으면 고른 폴더·조합으로 새 세션 ----------
  const ta = $('#composer-text');
  ta.addEventListener('input', autoGrow);
  function autoGrow() { ta.style.height = 'auto'; ta.style.height = Math.min(190, ta.scrollHeight) + 'px'; }
  async function submit() {
    const typed = ta.value.replace(/\r\n/g, '\n').trim();
    const text = withAttachments(typed); if (!text.trim()) return;
    const btn = $('#btn-send'); if (btn.disabled) return;
    const s = cur();
    try {
      btn.disabled = true; btn.classList.add('busy');
      History.push(typed);
      if (s) {
        await api('POST', `/api/sessions/${s.id}/send`, { text });
        if (cur()?.id === s.id) Transcript.pend(text); // 터미널처럼 보낸 즉시 요청문 + "요청 전달 중"을 그린다(기록파일을 기다리지 않음)
      } else {
        if (!folder) { FolderPicker.show(); return; }
        const c = currentSel();
        const rec = await api('POST', '/api/sessions', { cwd: folder.path, agent: c.agent, model: c.model, effort: c.effort, permission: c.permission, approval: c.approval, sandbox: c.sandbox, prompt: text });
        select(rec.id);
        Transcript.prime(text); // 기록파일이 생기기 전에도 요청문 + "세션 여는 중"을 바로 보여 준다(멈춘 것처럼 보이지 않게)
      }
      ta.value = ''; autoGrow(); attachments.length = 0; renderAttach();
    } catch (e) { Dialog.alert(e.message); }
    finally { btn.disabled = false; btn.classList.remove('busy'); }
  }
  $('#btn-send').onclick = submit;
  function interrupt() { const s = cur(); if (!s || s.status !== 'busy') return; send({ type: 'input', id: s.id, data: '\x1b' }); }
  document.addEventListener('click', (e) => { if (e.target.closest('.stop-btn')) interrupt(); });

  // ---------- 입력 이력(터미널의 ↑/↓처럼) — 보낸 요청문을 기억해 ↑로 되부른다(2026-09-10) ----------
  // 저장: localStorage 'iris.history' 최근 200개(연속 중복 제외). ↑ = 캐럿이 첫 줄에 있을 때 이전 요청문, ↓ = 마지막 줄에서 다음(끝까지 가면 쓰던 글 복원).
  const History = (() => {
    const KEY = 'iris.history', MAX = 200; let list = []; let idx = -1, draft = '';
    try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(list)) list = []; } catch { list = []; }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };
    const put = (v) => { ta.value = v; ta.selectionStart = ta.selectionEnd = v.length; autoGrow(); };
    return {
      push(text) { if (!text) return; if (list[list.length - 1] !== text) { list.push(text); if (list.length > MAX) list = list.slice(-MAX); save(); } idx = -1; },
      reset() { idx = -1; },
      up() { if (!list.length) return false; if (idx === -1) { draft = ta.value; idx = list.length; } if (idx === 0) return true; idx -= 1; put(list[idx]); return true; },
      down() { if (idx === -1) return false; idx += 1; if (idx >= list.length) { idx = -1; put(draft); } else put(list[idx]); return true; },
      list: () => list.slice(),
    };
  })();
  ta.addEventListener('input', () => History.reset());
  // Enter = 보내기 · Ctrl+Enter / Shift+Enter = 줄바꿈 · ↑/↓ = 이력 · 한글 조합 중 키는 무시
  ta.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowUp' && !e.altKey && !e.ctrlKey && !e.shiftKey) { if (ta.value.slice(0, ta.selectionStart).includes('\n')) return; if (History.up()) e.preventDefault(); return; }
    if (e.key === 'ArrowDown' && !e.altKey && !e.ctrlKey && !e.shiftKey) { if (ta.value.slice(ta.selectionEnd).includes('\n')) return; if (History.down()) e.preventDefault(); return; }
    if (e.key !== 'Enter') return;
    if (e.ctrlKey || e.shiftKey) { e.preventDefault(); const p = ta.selectionStart, q = ta.selectionEnd; ta.value = ta.value.slice(0, p) + '\n' + ta.value.slice(q); ta.selectionStart = ta.selectionEnd = p + 1; autoGrow(); return; }
    e.preventDefault(); submit();
  });

  // ---------- 세션 닫기 · 전부 종료 · 레일 · 단축키 ----------
  $('#btn-close').onclick = async () => {
    const s = cur(); if (!s) return;
    const alive = !(s.status === 'dead' || s.status === 'exited');
    if (alive && !(await Dialog.confirm(`${shortPath(s.cwd)} 세션(${label(s)})을 종료할까요? PID ${s.pid} 트리만 종료됩니다.`, { okLabel: '종료', danger: true }))) return;
    try { if (alive) await api('DELETE', `/api/sessions/${s.id}`); else await api('POST', `/api/sessions/${s.id}/forget`); goHome(); } catch (e) { Dialog.alert(e.message); }
  };
  $('#btn-forget').onclick = () => $('#btn-close').click();
  // 죽은 카드 그 자리에서 재개(v2.42): 데몬이 같은 세션 id로 --resume / codex resume 을 띄운다. 세션 id를 모르는 카드(첫 메시지 전)는 데몬이 400으로 거절.
  $('#btn-resume').onclick = async () => {
    const s = cur(); if (!s) return; const btn = $('#btn-resume'); btn.disabled = true;
    try { await api('POST', `/api/sessions/${s.id}/resume`, {}); } catch (e) { Dialog.alert(e.message); } finally { btn.disabled = false; }
  };
  $('#btn-copy-resume').onclick = () => { const t = cur()?.resumeCmd; if (t) navigator.clipboard?.writeText(t); };
  $('#btn-home').onclick = goHome;
  $('#btn-shutdown').onclick = async () => { if (!(await Dialog.confirm(`데몬과 세션 ${sessions.length}개를 전부 종료할까요? (각 세션 PID 기준)`, { okLabel: '전부 종료', danger: true }))) return; await api('POST', '/api/shutdown').catch(() => {}); };
  $('#btn-rail').onclick = () => $('#app').classList.toggle('rail-hidden');
  // 작업목록 너비: 오른쪽 가장자리를 끌어 조절(180~560px), localStorage 'iris.railW'. 두 번 클릭 = 기본값(248). 접힌 상태에서는 끌지 않는다.
  (() => {
    const app = $('#app'), grip = $('#rail-resize'); if (!grip) return;
    const RAIL_MIN = 180, RAIL_MAX = 560, RAIL_DEF = 248;
    const apply = (w) => { app.style.setProperty('--rail-w', `${w}px`); };
    try { const w = Number(localStorage.getItem('iris.railW')); if (w >= RAIL_MIN && w <= RAIL_MAX) apply(w); } catch {}
    grip.onpointerdown = (e) => {
      if (app.classList.contains('rail-hidden') || e.button !== 0) return;
      e.preventDefault(); grip.setPointerCapture(e.pointerId); app.classList.add('resizing');
      const startX = e.clientX, startW = $('#rail').getBoundingClientRect().width; let w = startW;
      const move = (ev) => { w = Math.max(RAIL_MIN, Math.min(RAIL_MAX, Math.round(startW + ev.clientX - startX))); apply(w); };
      const up = () => { grip.onpointermove = null; grip.onpointerup = grip.onpointercancel = null; app.classList.remove('resizing'); try { localStorage.setItem('iris.railW', String(w)); } catch {} }; // 터미널 크기는 #term-wrap의 ResizeObserver가 맞춘다
      grip.onpointermove = move; grip.onpointerup = grip.onpointercancel = up;
    };
    grip.ondblclick = () => { apply(RAIL_DEF); try { localStorage.setItem('iris.railW', String(RAIL_DEF)); } catch {} };
  })();
  document.addEventListener('keydown', (e) => {
    // 확인 카드(v2.43): 대화 보기에서 카드가 떠 있고 입력창이 비어 있으면 숫자·y·n 한 글자 = 그 선택지(터미널과 같은 키)
    if (mode === 'chat' && !Settings.isOpen() && !FolderPicker.isOpen() && Approval.handleKey(e)) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); goHome(); FolderPicker.show(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#btn-folder').click(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'b') { e.preventDefault(); $('#btn-rail').click(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); toggleDash(); }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); const first = modules.find(x => x.panel); if (first) openModule(first.name); }
    if (e.ctrlKey && e.key === ',') { e.preventDefault(); Settings.isOpen() ? Settings.hide() : Settings.show(); }
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'm' && mode !== 'term') { e.preventDefault(); Voice.toggle(); }
    // Esc: 페이지 keydown(초점이 페이지 안일 때)과 Electron 메인의 before-input-event 중계(초점이 미리보기 iframe 안이라
    // keydown이 이 문서에 오지 않을 때) 두 길로 들어온다 → 한 함수(onEscape)로 처리, 같은 키를 두 번 처리하지 않게 300ms 가드.
    // e.code 도 보는 이유: 한글 IME가 키를 가로채면 e.key가 'Process'로 올 수 있다.
    if (e.key === 'Escape' || e.code === 'Escape') { e.preventDefault(); onEscape(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 't' && current) { e.preventDefault(); setMode(mode === 'term' ? 'chat' : 'term'); }
    if (e.ctrlKey && /^[1-9]$/.test(e.key)) { const s = sessions[Number(e.key) - 1]; if (s) { e.preventDefault(); select(s.id); } }
  });
  let lastEscAt = 0;
  function onEscape() {
    const now = Date.now(); if (now - lastEscAt < 300) return; lastEscAt = now;
    if (Voice.cancel()) return;                       // 🎤 녹음 중 Esc = 녹음 버림
    if (Settings.isOpen()) { Settings.hide(); return; }
    if (!$('#dash').hidden) { closeDrawer(); return; }
    if (SubPanel.isOpen()) { SubPanel.close(); ta.focus(); return; } // 보조 작업 서랍이 열려 있으면 Esc = 서랍만 닫힘(중단 아님)
    if (!$('#cam').hidden) { camStop(); return; }
    if (FolderPicker.isOpen()) { FolderPicker.hide(); return; }
    if (setupMode === 'switch') { setupMode = 'new'; renderSetup(); return; }
    // 확인 카드가 떠 있으면 Esc = 터미널과 같게 취소 키(ESC)를 그 세션에 보낸다(v2.43)
    if (mode === 'chat' && Approval.isOpen() && Approval.choose('\x1b')) { ta.focus(); return; }
    // 대화 화면에서도 터미널처럼 Esc = 진행 중인 작업 중단(작업 중인 세션에만 ESC 키를 보낸다). 터미널 화면은 xterm이 직접 보낸다.
    if (mode === 'chat' && cur()?.status === 'busy') { interrupt(); ta.focus(); return; }
    ta.focus();
  }
  // Electron 창: 메인이 잡은 Esc(초점이 어느 프레임에 있든)를 받는다. 브라우저 모드(irisHost 없음)면 keydown 한 길만.
  window.irisHost?.onEscape?.(() => { if (mode === 'term') return; onEscape(); });
  // 미리보기 iframe(PDF 뷰어 등)이 막 삽입되며 초점을 가져가면 입력창으로 되돌린다(삽입 4초 안에만 — 사용자가 직접 누른 미리보기는 그대로).
  window.addEventListener('blur', () => setTimeout(() => {
    const a = document.activeElement; if (!a || a.tagName !== 'IFRAME' || !a.closest('#chat')) return;
    const born = Number(a.dataset.born || 0); if (born && Date.now() - born < 4000) ta.focus();
  }, 0));

  // ---------- 꾸미기 설정 + 사용량 배터리 (app/settings.js) ----------
  Settings.init();
  // ---------- 작업 완료 알림(app/notify.js, 2026-09-11): 데몬 status(done) → 오른쪽 아래 작은 알림(+창이 뒤면 OS 알림). 누르면 그 세션으로. ----------
  Notify.init({ onPick: (id) => { if (String(id).startsWith('mod:')) { openModule(String(id).split(':')[1]); return; } if (sessions.some(s => s.id === id)) select(id); }, current: () => current, enabled: () => Settings.get().notifyDone !== false, osEnabled: () => Settings.get().notifyOs !== false });
  // ---------- 보조 작업(서브에이전트) 칩·서랍(app/subagents.js, 2026-09-11): 목록이 바뀌면 작업목록의 ⁺N을 다시 그린다 ----------
  // v2.40: 실행 중인 보조 수가 바뀌면 겉보기 상태(보조 작업 중)도 바뀌고, 보류해 둔 완료 알림의 해소 여부를 Notify가 판단한다.
  Approval.init({ send, current: () => current, onTerm: () => setMode('term') }); // 확인 카드(v2.43)
  SubPanel.init({ send, current: () => current, onChange: (id) => { render(); if (id) Notify.onSubs(id, SubPanel.alive(id), SubPanel.list(id).length, sessions.find(x => x.id === id)); } });

  // ---------- 각인(2026-09-10): 첫 실행 1회 `by SEJUN HAM` + 워드마크 두 번 클릭(Ctrl+Alt+I) = 별이 SEJUN HAM 으로 모임 ----------
  const SIG_NAME = 'SEJUN HAM';
  let sigTimer = 0;
  function sigShow({ name, motto, by, dur, delay, top }) {
    const el = $('#sig'); clearTimeout(sigTimer);
    el.classList.remove('run'); void el.offsetWidth; // 애니메이션 재시작
    $('#sig-name').textContent = name || ''; $('#sig-name').hidden = !name;
    $('#sig-motto').textContent = motto || '';
    el.classList.toggle('sig-by', !!by);
    el.classList.toggle('placed', top != null); el.style.top = top != null ? `${Math.round(top)}px` : ''; // placed = 별 글자 아래 정확한 자리(px), 아니면 세로 가운데
    el.style.setProperty('--sig-dur', dur + 'ms'); el.style.setProperty('--sig-delay', delay + 'ms');
    el.hidden = false; el.classList.add('run');
    sigTimer = setTimeout(() => { el.classList.remove('run'); el.hidden = true; }, dur + delay + 80);
  }
  function signature() {
    if (current) return; // 홈 화면(별이 보일 때)에서만
    const motto = Settings.health()?.about?.motto || '해결은 에이전트가, 정의는 우리가.';
    const r = IrisStars.signature(SIG_NAME);
    if (r) sigShow({ motto, dur: r.in + r.hold + r.out - 1400, delay: 1400, top: r.bottom + 44 }); // 별이 글자를 만들면 문장만 별 글자 아랫선에서 44px 아래, 가로 가운데(2026-09-11)
    else sigShow({ name: SIG_NAME, motto, dur: 4300, delay: 600 });                       // 끔·별자리·움직임 줄이기: 이름도 글자로
  }
  $('#wordmark').addEventListener('dblclick', (e) => { e.preventDefault(); signature(); });
  document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); signature(); } });
  setTimeout(() => { if (!current) sigShow({ motto: `by ${SIG_NAME}`, by: true, dur: 2800, delay: 0 }); }, 1300); // 별이 모이는 1.2초 연출이 끝난 뒤 한 번
  window.irisHost?.onAbout?.(() => Settings.about()); // 트레이 메뉴 "IRIS-Face 정보…"

  // ---------- 검증용 미리보기 ?preview=<기록파일>&agent= ----------
  const qs = new URLSearchParams(location.search);
  if (qs.get('preview')) fetch(`/api/transcript-preview?path=${encodeURIComponent(qs.get('preview'))}&agent=${qs.get('agent') || 'claude'}`).then(r => r.json()).then((j) => { current = 'preview'; $('#view').hidden = false; IrisStars.setDim(true); $('#vh-title').textContent = '미리보기'; Transcript.render(j.items || [], j.meta); afterTranscript(j.meta); });

  fetch('/api/agents').then(r => r.json()).then((a) => { AGENTS = a; renderSetup(); });
  connect(); autoGrow();

  // ---------- 키 입력 자가 복구(2026-09-10) ----------
  // 사용자가 창 안을 눌렀는데도 문서에 초점이 없으면(네이티브 대화상자·다른 창 간섭 뒤 OS 초점이 창 밖에 남은 상태)
  // 메인 프로세스에 blur→focus 를 부탁해 키보드 입력을 되살린다. 브라우저 모드(irisHost 없음)에서는 조용히 넘어간다.
  let refocusAt = 0;
  document.addEventListener('pointerdown', () => {
    setTimeout(() => {
      if (document.hasFocus() || !window.irisHost?.refocus || Date.now() - refocusAt < 1500) return;
      refocusAt = Date.now(); window.irisHost.refocus().catch(() => {});
      setTimeout(() => { if (mode === 'term' && term) term.focus(); else ta.focus(); }, 120);
    }, 60);
  }, true);
})();
