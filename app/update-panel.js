// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 업데이트 칸(2026-11-26 사용자 선택 = 시안 「라」 대화 옆 칸 · 체크 단위 「나」). 설계 정본 = D09 「에이전트 업데이트·의사-설계」 조각 ⑤⑥⑦.
// 사용자가 정한 과정: 업데이트를 누르면 → 지금 아이리스를 점검하고 → 새 판과 견줘 → 바뀔 것(수정 · 추가)을 보여 주고 → 원하는 것만 체크해서 업데이트.
//  · 누르면 새 대화가 열리고(아이리스가 설명한다) 무대 오른쪽에 이 칸이 붙는다. 대화를 열지 못해도 칸은 그대로 쓴다.
//  · 고를 수 있는 것 셋 = 영역 상자 셋(같은 날 밤 사용자 선택 = 시안 「가-1」 · 이름도 사용자가 정함):
//      「수정 사항」 새 판으로 바꿀 것(체크) · 「신규 추가」 새로 생기는 기능(스위치) · 「나만의 IRIS」 내가 고친 파일(내 것 유지 / 새 판으로).
//    맨 아래 「이렇게 됩니다」가 고른 것을 문장으로 다시 말한다. 시안 = docs\시안-Doctor 창과 업데이트 칸 개선-v2-2026-11-26.html
//  · 글은 쓰는 사람의 말로(전체 묶음 = 설치 패키지). 영역은 고를 것이 없어도 사라지지 않는다 — "없습니다" · "알 수 없습니다"라고 적는다.
//  · 이 칸은 데몬에만 말한다: GET /api/update/review · POST /api/update/stage(새 판 받아 놓기 — 설치 아님) · POST /api/update/choose(고른 것 받기).
//    설치는 지금의 확인 카드(「지금 적용 / 나중에」)에서 사용자가 누른다. 「전부 업데이트」 = 지금까지의 길 그대로.
//  · 받은 글은 textContent 로만 넣는다(아이콘은 icons.js 의 고정 마크업). 클래스는 up- 접두로만 짓는다.
window.UpdatePanel = (() => {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let open = false, wired = false, rv = null, loadErr = false, staging = false, stageErr = '', busy = false, health = null, chatNote = '', token = 0;
  const sel = { parts: new Set(), features: {}, files: {} };
  const seen = { parts: new Set(), features: new Set(), files: new Map() }; // 처음 값을 이미 채운 항목 — 사용자가 고른 값은 다시 읽어도 되돌리지 않는다
  let backupNote = '';

  const covered = (p) => Object.entries(rv?.covers || {}).some(([big, list]) => sel.parts.has(big) && list.includes(p)); // 전체 묶음을 고르면 그 안의 IRIS 창은 함께 온다
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
  // 모양(2026-11-26 밤 다시 그림 — 사용자 선택 = 시안 「가-1」 상자 셋 · 영역 이름 = 수정 사항 · 신규 추가 · 나만의 IRIS):
  //   맨 위 알약(지금 상태 · 새 판을 받았는지) → 영역 상자 셋(머리줄 = 아이콘 · 이름 · 개수 · "여기서 무엇을 고르는지") → 맨 아래 「이렇게 됩니다」 요약 + 단추.
  const setIcon = (node, name, size) => { node.innerHTML = window.Icons ? Icons.svg(name, size) : ''; return node; }; // HTML 로 넣는 곳은 여기 하나(icons.js 의 고정 마크업만 — 받은 글은 넣지 않는다)
  const icon = (name, size, cls) => setIcon(el('span', cls), name, size);
  // 부품의 쉬운 이름 · 한 줄 설명 · "고르면 어떻게 되나"(아이콘 + 글)
  const PART = {
    face: { icon: 'window', name: 'IRIS 창', what: '지금 보고 있는 이 화면입니다.', how: ['clock', '잠깐 닫혔다 다시 켜집니다'] },
    messenger: { icon: 'chat', name: '메신저', what: '선택 모듈입니다.', how: ['check', '바로 바뀝니다 · 대화는 그대로'] },
    package: { icon: 'box', name: '전체 묶음', what: 'IRIS 창에 Claude · Codex 프로그램과 도구까지 한꺼번에 새 판으로.', how: ['clock', '잠깐 닫혔다 다시 켜집니다'] },
  };
  const partName = (p) => PART[p.part]?.name || p.name;
  const FEATURE_ICON = { plannerEnabled: 'calendar' };
  const pill = (cls, ic, text) => { const s = el('span', `up-ck ${cls}`); s.append(icon(ic, 13), text); return s; };
  function head() {
    $('#up-ver').textContent = rv && !loadErr && rv.parts.length ? `새 판 ${rv.parts.length}가지` : '';
    const h = $('#up-health'); h.textContent = '';
    // 지금 상태(IRIS Doctor 가 있는 PC 에서만 살펴본다)
    if (health?.state === 'done') {
      // 고장이 없다고 곧 "정상"은 아니다 — 확인할 것(확인 · 확인 못 함)이 남아 있으면 그렇다고 말한다
      const doctorBtn = () => { if (!window.DoctorView?.available()) return; const b = el('button', 'up-lnk', 'IRIS Doctor'); b.type = 'button'; b.dataset.doctor = 'update-panel'; h.append(b); };
      if (health.bad) { h.append(pill('bad', 'alert', `고장 ${health.bad}건 — 먼저 고치는 것이 좋습니다`)); doctorBtn(); }
      else if (health.other) { h.append(pill('', 'alert', `고장은 없음 · 확인할 것 ${health.other}가지`)); doctorBtn(); }
      else h.append(pill('ok', 'check', '지금 상태 정상'));
    } else if (health?.state === 'running') h.append(pill('', 'refresh', '지금 상태를 살펴보는 중'));
    else if (health?.state === 'failed') h.append(pill('', 'help', '지금 상태를 살펴보지 못했습니다'));
    // 새 판을 받았는가(받고 서명 검증까지 — 설치 아님)
    if (rv && !loadErr && rv.mode === 'package' && rv.parts.length) {
      const a = rv.applying;
      if (staging || a) h.append(pill('', 'refresh', a?.total ? `새 판 받는 중 ${Math.floor((a.received / a.total) * 100)}%` : '새 판 받는 중'));
      else if (stageErr) h.append(pill('bad', 'alert', '새 판을 받지 못했습니다'));
      else if (rv.staged) h.append(pill('ok', 'check', '새 판 받아 둠'));
    }
    h.hidden = !h.childNodes.length;
  }
  /** 영역 상자 하나: 머리줄(아이콘 · 이름 · 개수 · 안내) + 몸. → 몸(여기에 줄을 넣는다) */
  function group(box, id, ic, title, count, hint) {
    const g = el('section', 'up-grp'); g.dataset.area = id;
    const h = el('div', 'up-grp-h'); h.append(icon(ic, 16, 'up-gi'), el('b', '', title)); if (count != null) h.append(el('span', 'up-cnt', String(count))); h.append(el('small', '', hint));
    const b = el('div', 'up-grp-b'); g.append(h, b); box.append(g); return b;
  }
  const line = (body, text) => body.append(el('p', 'up-empty', text));
  function list() {
    const box = $('#up-list'); box.textContent = '';
    const say = (t) => box.append(el('p', 'up-empty', t));
    if (loadErr) return say('업데이트 정보를 읽지 못했습니다. 닫았다가 다시 열어 주세요.');
    if (!rv) { for (let i = 0; i < 3; i++) box.append(el('div', 'up-skel')); return; }
    if (rv.reinstall) say(rv.reinstall.note);
    if (rv.checkError) say(`새 판을 확인하지 못했습니다 — ${rv.checkError}`);
    if (!rv.parts.length) { if (!rv.reinstall && !rv.checkError) say('최신 판입니다.'); return; }
    const dev = rv.mode === 'dev';
    if (dev) say('개발 폴더에서 실행 중입니다 — 여기서는 확인만 됩니다.');

    // ① 수정 사항: 새 판으로 바꿀 것(부품)
    const a1 = group(box, 'parts', 'refresh', '수정 사항', rv.parts.length, dev ? '새 판이 있는 것' : '새 판으로 바꿀 것을 고르세요');
    for (const p of rv.parts) {
      const meta = PART[p.part] || { icon: 'box', what: '새 판', how: ['clock', ''] };
      const cov = covered(p.part), on = sel.parts.has(p.part) || cov;
      const row = el('label', `up-pick${on ? ' on' : ''}${cov ? ' cov' : ''}`);
      const cb = el('input'); cb.type = 'checkbox'; cb.className = 'up-cb'; cb.checked = on; cb.disabled = cov || dev || busy; cb.dataset.part = p.part;
      const t = el('div'), top = el('div', 'up-top'); top.append(el('b', '', partName(p)), el('span', 'up-v', `${p.from || '?'} → ${p.to || '?'}`));
      const how = cov ? ['box', '전체 묶음에 포함됩니다'] : p.part === 'package' && (rv.covers?.package || []).includes('face') ? ['window', '고르면 IRIS 창도 여기에 포함됩니다'] : meta.how;
      const howEl = el('span', 'up-how'); howEl.append(icon(how[0], 13), how[1]);
      t.append(top, el('small', '', p.part === 'package' ? meta.what : (p.lines[0] || meta.what)), howEl);
      row.append(icon(meta.icon, 17, 'up-pi'), t, cb); a1.append(row);
    }
    if (dev) return;

    // ② 신규 추가: 새 판에서 처음 생기는 기능(켤 것만)
    const fk = rv.features.known, fi = rv.features.items;
    const a2 = group(box, 'features', 'plus', '신규 추가', fk ? fi.length : null, '켤 기능을 고르세요');
    if (staging || rv.applying) line(a2, rv.applying?.total ? `새 판을 받는 중 ${Math.floor((rv.applying.received / rv.applying.total) * 100)}% — 받으면 보입니다` : '새 판을 받는 중 — 받으면 보입니다');
    else if (stageErr) line(a2, `새 판을 받지 못했습니다 — ${stageErr}`);
    else if (!fk) line(a2, '새로 생기는 기능이 있는지는 아직 알 수 없습니다.');
    else if (!fi.length) line(a2, '이번 판에 새로 생기는 기능은 없습니다.');
    else for (const f of fi) {
      const row = el('label', 'up-line'); const sw = el('input'); sw.type = 'checkbox'; sw.className = 'sw'; sw.checked = !!sel.features[f.key]; sw.disabled = busy; sw.dataset.feature = f.key;
      const t = el('div'); t.append(el('b', '', f.title), el('small', '', f.sub));
      row.append(icon(FEATURE_ICON[f.key] || 'plus', 16, 'up-li'), t, sw); a2.append(row);
    }

    // ③ 나만의 IRIS: 내가 고친 파일(내 것 유지 / 새 판으로) — 업데이트 전에 따로 보관한다
    const m = rv.mine;
    const a3 = group(box, 'mine', 'heart', '나만의 IRIS', m.known ? `${m.count}${m.partial ? '+' : ''}` : null, '내가 고친 파일 · 따로 보관합니다');
    // 고친 파일이 있는지 알 수 없는 설치본(파일 목록이 없거나 서명과 맞지 않음): "없음"으로 보이지 않게 그렇다고 알린다
    if (!m.known) line(a3, '이 PC 에서는 고친 파일이 있는지 확인할 수 없습니다. 남길 파일이 있으면 먼저 다른 곳에 복사해 두세요.');
    else if (!m.files.length) line(a3, m.partial ? '살펴본 범위에서는 고친 파일이 없습니다 — 다 살펴보지는 못했습니다.' : '고친 파일이 없습니다.');
    else {
      for (const f of m.files) {
        const row = el('div', 'up-line'); const t = el('div');
        t.append(el('b', '', f.file), el('small', '', f.kind === 'missing' ? '지워진 파일 — 새 판에서 다시 생깁니다' : f.clash ? '새 판에서도 바뀐 파일' : f.kind === 'added' ? '내가 더한 파일' : f.clash === false ? '새 판에서는 그대로인 파일' : '내가 고친 파일'));
        row.append(icon('file', 16, `up-li${f.clash ? ' warn' : ''}`), t);
        if (f.kind !== 'missing') {
          const seg = el('span', `up-seg${m.canKeep ? '' : ' lock'}`); if (!m.canKeep) seg.title = '지금은 새 판으로만 바뀝니다(고친 파일은 따로 보관합니다)';
          for (const [v, label] of [['keep', '내 것 유지'], ['replace', '새 판으로']]) { const b = el('button', sel.files[f.file] === v ? 'on' : '', label); b.type = 'button'; b.disabled = !m.canKeep || busy; b.dataset.file = f.file; b.dataset.pick = v; seg.append(b); }
          row.append(seg);
        }
        a3.append(row);
      }
      if (m.count > m.files.length) line(a3, `… 외 ${m.count - m.files.length}개${m.partial ? ' 이상' : ''}`);
    }
  }
  /** 맨 아래 「이렇게 됩니다」: 고른 것을 문장으로 다시 말한다(있는 것만) */
  function summary(heavy) {
    const out = []; const picked = rv.parts.filter((p) => sel.parts.has(p.part) && !covered(p.part));
    out.push(`${picked.map(partName).join(' · ')} — ${picked.length}가지가 새 판이 됩니다`);
    if (heavy && rv.features.known && rv.features.items.length) {
      const on = rv.features.items.filter((f) => sel.features[f.key]).map((f) => f.title), off = rv.features.items.filter((f) => !sel.features[f.key]).map((f) => f.title);
      if (on.length) out.push(`${on.join(' · ')} 기능을 켭니다`); if (off.length) out.push(`${off.join(' · ')} 기능은 꺼 둡니다`);
    }
    // 고친 파일: 개수는 살펴본 만큼만 말한다(다 살피지 못했으면 "N개 이상"). 내 것으로 두는 것은 칸에서 직접 고른 파일뿐이다 — 칸에 보이지 않는 파일은 새 판으로 바뀐다.
    if (heavy && rv.mine.known && rv.mine.count) {
      const many = `고친 파일 ${rv.mine.count}개${rv.mine.partial ? ' 이상' : ''}`;
      const keep = rv.mine.canKeep ? rv.mine.files.filter((f) => f.kind !== 'missing' && sel.files[f.file] === 'keep').length : 0;
      const all = keep && !rv.mine.partial && keep === rv.mine.count; // 전부 내 것으로 두는 경우: "나머지"가 없다
      out.push(all ? `${many}는 모두 내 것 그대로 둡니다(따로 보관도 합니다)` : keep ? `${many} 가운데 ${keep}개는 내 것 그대로 두고, 나머지는 새 판으로 바뀝니다(바꾸기 전에 따로 보관합니다)` : `${many}${rv.mine.partial ? '은' : '는'} 따로 보관한 뒤 새 판으로 바뀝니다`);
    }
    const s = rv.sessions;
    out.push(heavy ? `IRIS가 잠깐 닫혔다 켜집니다${s?.open ? ` · 열린 대화 ${s.open}개는 다시 이어갈 수 있습니다` : ''}` : '창은 닫히지 않습니다 · 대화는 그대로입니다');
    return out;
  }
  function foot() {
    const n = count(), can = !!rv && !loadErr && rv.mode === 'package' && rv.parts.length > 0 && !staging && !rv.applying; // 정보를 읽지 못한 동안에는 앞서 읽은 것으로 누르지 못하게 잠근다
    $('#up-go').textContent = busy ? '준비하는 중' : `선택한 ${n}개 업데이트`;
    $('#up-go').disabled = busy || !can || !n;
    $('#up-all').hidden = !can; $('#up-all').disabled = busy;
    const heavy = rv ? rv.parts.some((p) => sel.parts.has(p.part) && p.part !== 'messenger') : false;
    const sum = $('#up-sum'); sum.textContent = ''; sum.hidden = !can || !n;
    if (!sum.hidden) { const ul = el('ul'); for (const t of summary(heavy)) ul.append(el('li', '', t)); sum.append(el('b', '', '이렇게 됩니다'), ul); }
    $('#up-note').textContent = backupNote || chatNote;
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
    try { const res = await fetch('/api/doctor/checkup', { method: 'POST' }); const j = await res.json().catch(() => null); health = j?.ok && Array.isArray(j.findings) ? { state: 'done', bad: j.findings.filter((f) => f.state === 'bad').length, other: j.findings.filter((f) => f.state === 'warn' || f.state === 'unknown').length } : { state: 'failed' }; }
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
      else if (t.dataset.feature) { sel.features[t.dataset.feature] = !!t.checked; foot(); } // 바닥의 「이렇게 됩니다」만 다시 쓴다(스위치를 다시 그리지 않는다 — 초점을 지킨다)
    });
    $('#up-list').addEventListener('click', (e) => { const b = e.target.closest('button[data-file]'); if (!b || b.disabled) return; sel.files[b.dataset.file] = b.dataset.pick; render(); });
  }
  /** 데몬의 업데이트 방송(내려받기 진행 · 준비됨)을 받으면 다시 읽는다 */
  function onUpdate(m) { if (!open || !m) return; if (m.phase === 'download' && rv) { rv.applying = { received: m.received, total: m.total }; render(); } else if (m.phase === 'ready' || m.phase === 'error' || m.phase === 'checked') load({ autoStage: false }); }
  return { start, show, close, isOpen: () => open, onUpdate, _sel: sel };
})();
