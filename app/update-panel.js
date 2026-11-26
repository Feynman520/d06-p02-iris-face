// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 업데이트 칸(2026-11-26 사용자 선택 = 시안 「라」 대화 옆 칸 · 체크 단위 「나」). 설계 정본 = D09 「에이전트 업데이트·의사-설계」 조각 ⑤⑥⑦.
// 사용자가 정한 과정: 업데이트를 누르면 → 지금 아이리스를 점검하고 → 새 판과 견줘 → 바뀔 것(수정 · 추가)을 보여 주고 → 원하는 것만 체크해서 업데이트.
//  · 누르면 새 대화가 열리고(아이리스가 설명한다) 무대 오른쪽에 이 칸이 붙는다. 대화를 열지 못해도 칸은 그대로 쓴다.
//  · 고를 수 있는 것 셋: 부품(체크) · 새 기능(스위치) · 내가 고친 파일(내 것 유지 / 새 판으로).
//  · 이 칸은 데몬에만 말한다: GET /api/update/review · POST /api/update/stage(새 판 받아 놓기 — 설치 아님) · POST /api/update/choose(고른 것 받기).
//    설치는 지금의 확인 카드(「지금 적용 / 나중에」)에서 사용자가 누른다. 「전부 업데이트」 = 지금까지의 길 그대로.
//  · 받은 글은 textContent 로만 넣는다. 클래스는 up- 접두로만 짓는다.
window.UpdatePanel = (() => {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let open = false, wired = false, rv = null, loadErr = false, staging = false, stageErr = '', busy = false, health = null, chatNote = '', token = 0;
  const sel = { parts: new Set(), features: {}, files: {} };
  const seen = { parts: new Set(), features: new Set(), files: new Map() }; // 처음 값을 이미 채운 항목 — 사용자가 고른 값은 다시 읽어도 되돌리지 않는다
  let backupNote = '';

  const covered = (p) => Object.entries(rv?.covers || {}).some(([big, list]) => sel.parts.has(big) && list.includes(p)); // 설치 패키지를 고르면 그 안의 IRIS 창은 함께 온다
  const count = () => rv ? rv.parts.filter((p) => sel.parts.has(p.part) && !covered(p.part)).length : 0;
  /** 처음 값 채우기: **새로 나타난 항목에만** 넣는다. 사용자가 이미 고른 것은 다시 읽어도(새 판을 다 받아 새 기능 · 비교가 알려져도) 되돌리지 않는다.
   *  부품은 「부품@새 판」으로 본다(더 새 판이 나오면 새 항목). 파일은 "새 판에서도 바뀜"이 알려지기 전(모름)과 뒤의 처음 값이 달라, 그 판정이 바뀌면 한 번 다시 채운다. */
  function seed() {
    // 목록에서 사라진 항목은 고른 값도 "채운 적 있음" 표시도 함께 지운다(다시 나타나면 새 항목으로 처음 값을 받는다)
    const partKeys = new Set(rv.parts.map((p) => `${p.part}@${p.to}`));
    for (const k of [...seen.parts]) if (!partKeys.has(k)) seen.parts.delete(k);
    for (const p of [...sel.parts]) if (!rv.parts.some((x) => x.part === p)) sel.parts.delete(p);
    for (const p of rv.parts) { const k = `${p.part}@${p.to}`; if (!seen.parts.has(k)) { seen.parts.add(k); sel.parts.add(p.part); } }
    const featKeys = new Set(rv.features.items.map((f) => f.key));
    for (const k of [...seen.features]) if (!featKeys.has(k)) { seen.features.delete(k); delete sel.features[k]; }
    for (const f of rv.features.items) if (!seen.features.has(f.key)) { seen.features.add(f.key); sel.features[f.key] = f.on; }
    // 내 것 유지는 적용기가 할 줄 알 때만 · 새 판에서 바뀌지 않은 파일은 처음 값이 「내 것 유지」
    const live = new Set(rv.mine.files.filter((f) => f.kind !== 'missing').map((f) => f.file));
    for (const k of [...seen.files.keys()]) if (!live.has(k)) { seen.files.delete(k); delete sel.files[k]; }
    for (const f of rv.mine.files) { if (f.kind === 'missing') continue; const mark = `${rv.mine.canKeep}|${f.clash}`; if (seen.files.get(f.file) !== mark) { seen.files.set(f.file, mark); sel.files[f.file] = rv.mine.canKeep && f.clash === false ? 'keep' : 'replace'; } }
  }

  // ---- 그리기 ----
  function head() {
    const face = rv?.parts.find((p) => p.part === 'face') || rv?.parts[0];
    $('#up-ver').textContent = face ? `${face.from || '?'} → ${face.to || '?'}` : '';
    const h = $('#up-health'); h.textContent = '';
    const dot = el('i', 'up-dot'); let text = '';
    if (health?.state === 'done') { const bad = health.bad; dot.classList.add(bad ? 'bad' : 'ok'); text = bad ? `고장 ${bad}건 — 먼저 고치는 것이 좋습니다` : '지금 상태 정상'; }
    else if (health?.state === 'running') text = '점검 중';
    else if (health?.state === 'failed') text = '점검하지 못했습니다';
    if (rv?.mine.known && rv.mine.count) text += `${text ? ' · ' : ''}고친 파일 ${rv.mine.count}개${rv.mine.partial ? ' 이상' : ''}`;
    if (!text) { h.hidden = true; return; }
    h.hidden = false; h.append(dot, el('span', '', text));
    if (health?.state === 'done' && health.bad && window.DoctorView?.available()) { const b = el('button', 'up-lnk', 'IRIS Doctor'); b.type = 'button'; b.dataset.doctor = 'update-panel'; h.append(b); }
  }
  function list() {
    const box = $('#up-list'); box.textContent = '';
    const say = (t) => box.append(el('p', 'up-empty', t));
    if (loadErr) return say('업데이트 정보를 읽지 못했습니다. 닫았다가 다시 열어 주세요.');
    if (!rv) { for (let i = 0; i < 4; i++) box.append(el('div', 'up-skel')); return; }
    if (rv.reinstall) say(rv.reinstall.note);
    if (rv.checkError) say(`새 판을 확인하지 못했습니다 — ${rv.checkError}`);
    if (!rv.parts.length) { if (!rv.reinstall && !rv.checkError) say('최신 판입니다.'); return; }
    if (rv.mode === 'dev') say('개발 폴더에서 실행 중입니다 — 여기서는 확인만 됩니다.');
    // 부품
    box.append(el('div', 'up-gh', '부품'));
    for (const p of rv.parts) {
      const cov = covered(p.part), on = sel.parts.has(p.part) || cov;
      const row = el('label', `up-it${cov ? ' cov' : ''}`); const cb = el('input'); cb.type = 'checkbox'; cb.className = 'up-cb'; cb.checked = on; cb.disabled = cov || rv.mode === 'dev' || busy; cb.dataset.part = p.part;
      const t = el('div'); t.append(el('b', '', p.name), el('small', '', cov ? '설치 패키지에 함께 들어 있습니다' : (p.lines[0] || '새 판')));
      row.append(cb, t, el('span', 'up-v', `${p.from || '?'} → ${p.to || '?'}`)); box.append(row);
    }
    if (rv.mode === 'dev') return;
    if (staging || rv.applying) { box.append(el('div', 'up-gh', '새 판과 비교')); say(rv.applying?.total ? `새 판을 받는 중 ${Math.floor((rv.applying.received / rv.applying.total) * 100)}%` : '새 판을 받는 중'); return; }
    if (stageErr) say(`새 판을 받지 못했습니다 — ${stageErr}`);
    if (rv.compare.known) { const c = rv.compare; box.append(el('p', 'up-cmp', `IRIS 창 파일 — 새로 ${c.added} · 바뀜 ${c.changed} · 없어짐 ${c.removed}`)); }
    // 새 기능
    if (rv.features.known && rv.features.items.length) {
      const gh = el('div', 'up-gh', '새 기능'); gh.append(el('small', '', '켤 것만')); box.append(gh);
      for (const f of rv.features.items) {
        const row = el('label', 'up-it'); const sw = el('input'); sw.type = 'checkbox'; sw.className = 'sw'; sw.checked = !!sel.features[f.key]; sw.disabled = busy; sw.dataset.feature = f.key;
        const t = el('div'); t.append(el('b', '', f.title), el('small', '', f.sub));
        row.append(t, sw); row.classList.add('f'); box.append(row);
      }
    }
    // 내가 고친 파일
    if (rv.mine.known && rv.mine.files.length) {
      const gh = el('div', 'up-gh', '내가 고친 파일'); gh.append(el('small', '', `${rv.mine.count}개${rv.mine.partial ? ' 이상' : ''}`)); box.append(gh);
      if (!rv.mine.canKeep) say('이 판의 설치 프로그램은 「내 것 유지」를 아직 못 합니다. 새 판으로 바뀌고, 고친 파일은 따로 보관합니다.');
      for (const f of rv.mine.files) {
        const row = el('div', 'up-it m'); const t = el('div'); const name = el('b', '', f.file);
        if (f.clash) name.append(el('span', 'up-chip', '새 판에서도 바뀜'));
        t.append(name, el('small', '', f.kind === 'missing' ? '지워진 파일 — 새 판에서 다시 생깁니다' : f.kind === 'added' ? '내가 더한 파일' : f.clash ? '내 것을 유지하면 새 판과 안 맞을 수 있습니다' : f.clash === false ? '새 판에서는 그대로인 파일입니다' : '내가 고친 파일'));
        row.append(t);
        if (f.kind !== 'missing') {
          const seg = el('span', 'up-seg');
          for (const [v, label] of [['keep', '내 것 유지'], ['replace', '새 판으로']]) { const b = el('button', sel.files[f.file] === v ? 'on' : '', label); b.type = 'button'; b.disabled = !rv.mine.canKeep || busy; b.dataset.file = f.file; b.dataset.pick = v; seg.append(b); }
          row.append(seg);
        }
        box.append(row);
      }
    }
    // 고친 파일이 있는지 알 수 없는 설치본(파일 목록이 없거나 서명과 맞지 않음): "없음"으로 보이지 않게 한 줄로 알린다
    else if (!rv.mine.known) { box.append(el('div', 'up-gh', '내가 고친 파일')); say('이 PC 에서는 고친 파일이 있는지 확인할 수 없습니다. 남길 파일이 있으면 먼저 다른 곳에 복사해 두세요.'); }
  }
  function foot() {
    const n = count(), can = !!rv && !loadErr && rv.mode === 'package' && rv.parts.length > 0 && !staging && !rv.applying; // 정보를 읽지 못한 동안에는 앞서 읽은 것으로 누르지 못하게 잠근다
    $('#up-go').textContent = busy ? '준비하는 중' : `선택한 ${n}개 업데이트`;
    $('#up-go').disabled = busy || !can || !n;
    $('#up-all').hidden = !can; $('#up-all').disabled = busy;
    const s = rv?.sessions; const heavy = rv ? rv.parts.some((p) => sel.parts.has(p.part) && p.part !== 'messenger') : false;
    $('#up-note').textContent = backupNote || chatNote || (can && heavy ? `창이 잠시 닫혔다 켜집니다${s?.open ? ` · 대화 ${s.open}개가 닫힙니다` : ''}` : '');
  }
  function render() { if (!open) return; head(); list(); foot(); }

  // ---- 데몬에 묻기 ----
  async function load({ autoStage = true } = {}) {
    const mine = ++token;
    try { const r = await fetch('/api/update/review'); const j = r.ok ? await r.json() : null; if (mine !== token) return; if (!j || !Array.isArray(j.parts) || !j.features || !j.mine) throw new Error('shape'); rv = j; loadErr = false; seed(); }
    catch { if (mine !== token) return; loadErr = true; }
    render();
    // 견주려면 새 판이 있어야 한다 — 설치본이고 아직 받아 두지 않았으면 받아 놓는다(서명 검증까지 · 설치 아님 · 메신저는 받지 않는다)
    if (autoStage && rv && !loadErr && rv.mode === 'package' && !rv.staged && !rv.applying && rv.parts.some((p) => p.part !== 'messenger')) stage();
  }
  async function stage() {
    if (staging) return; staging = true; stageErr = ''; render();
    const mine = ++token; // 받는 사이에 더 새로 읽은 것이 있으면(닫았다 다시 열기 등) 이 답으로 화면을 덮지 않는다
    let r = null; try { const res = await fetch('/api/update/stage', { method: 'POST' }); r = await res.json().catch(() => null); } catch {}
    staging = false;
    if (mine !== token) { render(); return; }
    if (r?.review && Array.isArray(r.review.parts)) { rv = r.review; loadErr = false; seed(); }
    if (!r?.ok && r?.why !== 'busy') stageErr = r?.reason || '잠시 뒤 다시 열어 주세요';
    render();
  }
  async function checkHealth() {
    if (!window.DoctorView?.available()) { health = null; return; }
    health = { state: 'running' }; render();
    try { const res = await fetch('/api/doctor/checkup', { method: 'POST' }); const j = await res.json().catch(() => null); health = j?.ok && Array.isArray(j.findings) ? { state: 'done', bad: j.findings.filter((f) => f.state === 'bad').length } : { state: 'failed' }; }
    catch { health = { state: 'failed' }; }
    render();
  }
  /** 고른 것을 보낸다 → 창이 닫히는 부품이 있으면 지금의 확인 카드(누르는 것은 사용자) */
  async function go() {
    if (busy || !rv) return; busy = true; render();
    let r = null;
    try { const res = await fetch('/api/update/choose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parts: [...sel.parts], features: sel.features, files: sel.files }) }); r = await res.json().catch(() => null); } catch {}
    busy = false; render();
    // 준비하는 사이에 받아 둔 새 판이 바뀌었다(다른 화면에서 다시 받음 등): 고른 것을 그대로 쓰지 않고 다시 읽어 보여 준다
    if (r && !r.ok && r.why === 'changed') { await load({ autoStage: false }); return Dialog.error({ title: '받아 둔 새 판이 바뀌었습니다', message: '준비하는 사이에 다른 곳에서 새 판을 다시 받았습니다. 칸의 내용을 다시 확인한 뒤 눌러 주세요. 대화와 설치본은 그대로입니다.' }); }
    if (!r?.ok) {
      const why = { busy: '새 판을 받는 중입니다. 끝난 뒤 다시 눌러 주세요.', nothing: '고른 것이 없습니다.', 'not-staged': '고른 부품의 새 판을 받지 못했습니다. 대화와 설치본은 그대로입니다.', dev: '개발 폴더에서는 적용하지 않습니다.' }[r?.why] || '준비하지 못했습니다. 대화와 설치본은 그대로입니다.';
      return Dialog.error({ title: '업데이트를 준비하지 못했습니다', message: why, detail: r?.reason || '' });
    }
    if (r.info) window.Settings?.setUpdate?.(r.info);
    if (r.swapped?.length && !r.needsApply) { Dialog.notice('메신저를 새 판으로 바꿨습니다', { sub: '대화는 그대로입니다.', tone: 'info' }); return load({ autoStage: false }); }
    if (r.failed?.length) Dialog.notice('메신저는 바꾸지 못했습니다', { sub: r.failed[0].reason || '', tone: 'warn' });
    if (!r.needsApply) return;
    // 고친 파일의 보관: 어디에 몇 개를 보관했는지 바닥 글로 남기고, 보관하지 못한 것이 있으면 확인 카드 앞에서 먼저 묻는다(모르고 잃지 않게)
    const b = r.backup;
    if (b) {
      const where = String(b.dir || '').replace(/^.*[\\/](_agent[\\/])/, '$1');
      backupNote = b.copied ? `고친 파일 ${b.copied}개를 보관했습니다 — ${where}` : ''; render();
      if (b.skipped || b.partial || b.unread) {
        // 보관하지 못한 것(복사 실패 · 너무 큼) · 고쳤는지조차 확인하지 못한 것(읽을 수 없거나 너무 큼) · 다 살피지 못한 것 — 있는 것만 말한다
        const msg = [b.skipped ? `고친 파일 ${b.total}개 가운데 ${b.skipped}개는 보관하지 못했습니다.` : '', b.unread ? `읽을 수 없거나 너무 커서 고쳤는지 확인하지 못한 파일이 ${b.unread}개 있습니다.` : '', b.partial ? '파일을 다 살펴보지 못해, 보관하지 못한 파일이 더 있을 수 있습니다.' : ''].filter(Boolean).join(' ');
        const goOn = await Dialog.confirm(`${msg} 적용하면 그 파일은 새 판으로 바뀝니다. 남길 파일이 있으면 먼저 다른 곳에 복사해 두세요.`, { title: '보관하지 못한 파일이 있습니다', kind: 'warn', okLabel: '계속', cancelLabel: '멈추기' });
        if (!goOn) return;
      }
    }
    window.Settings?.confirmApply?.();
  }
  /** 「전부 업데이트」: 받아 둔 새 판이 있으면 다시 받지 않고 모든 부품을 골라 같은 길로 간다. 받아 둔 것이 없으면 지금까지의 기계식 길(전부 받아 확인 카드까지) 그대로. */
  function all() {
    if (busy || !rv) return;
    if (rv.staged) { sel.parts = new Set(rv.parts.map((p) => p.part)); render(); return go(); }
    window.Settings?.updateAll?.();
  }

  // ---- 열고 닫기 ----
  function show() {
    wire();
    if (!open) { open = true; $('#up-panel').hidden = false; const st = $('#stage'); st.classList.add('up-docked'); }
    chatNote = ''; backupNote = ''; render(); load(); checkHealth();
  }
  function close() { if (!open) return; open = false; $('#up-panel').hidden = true; $('#stage').classList.remove('up-docked'); }
  /** 업데이트 단추: 칸을 열고, 아이리스가 설명할 새 대화를 연다(대화를 못 열어도 칸은 쓴다) */
  async function start({ chat = true } = {}) {
    window.Settings?.hide?.();
    show();
    if (!chat) return; // 이미 받아 둔 것을 적용하러 다시 온 경우(설정의 「적용 (받아 둠)」) — 설명 대화를 또 열지 않는다
    const r = await (window.UpdateChatView?.startChat?.() || Promise.resolve({ ok: false, reason: 'none' }));
    if (!r.ok && r.reason !== 'busy') { chatNote = r.reason === 'agent-off' ? `지금 고른 ${r.agent}를 쓸 수 없어 설명 대화는 열지 못했습니다 — 체크는 그대로 됩니다` : '설명 대화는 열지 못했습니다 — 체크는 그대로 됩니다'; render(); }
  }
  function wire() {
    if (wired) return; wired = true;
    $('#up-close').addEventListener('click', close);
    $('#up-go').addEventListener('click', go);
    $('#up-all').addEventListener('click', all);
    $('#up-list').addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.part) { if (t.checked) sel.parts.add(t.dataset.part); else sel.parts.delete(t.dataset.part); render(); }
      else if (t.dataset.feature) { sel.features[t.dataset.feature] = !!t.checked; }
    });
    $('#up-list').addEventListener('click', (e) => { const b = e.target.closest('button[data-file]'); if (!b || b.disabled) return; sel.files[b.dataset.file] = b.dataset.pick; render(); });
  }
  /** 데몬의 업데이트 방송(내려받기 진행 · 준비됨)을 받으면 다시 읽는다 */
  function onUpdate(m) { if (!open || !m) return; if (m.phase === 'download' && rv) { rv.applying = { received: m.received, total: m.total }; render(); } else if (m.phase === 'ready' || m.phase === 'error' || m.phase === 'checked') load({ autoStage: false }); }
  return { start, show, close, isOpen: () => open, onUpdate, _sel: sel };
})();
