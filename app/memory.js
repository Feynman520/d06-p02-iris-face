/* IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home */
/* 메모리 계기판(v2.78, 2026-10-04): 헤더의 두 겹 링 — 바깥 = 실제 RAM, 안 = 커밋(프로그램들이 잡아 둔 양). 차지한 만큼 시계 방향으로 찬다.
   누르면 펼침: 지금 숫자 두 줄 · 최근 30분 그래프(경고선 포함) · 많이 차지하는 것(펼쳤을 때만 10초마다) · 잔여물 미리보기(청소기가 있는 PC 만, 종료 없음).
   숫자와 전체 위험도(s.lvl)는 데몬 daemon/memory.mjs 가 정한다 — 화면은 그리기만 한다.
   사용: MemGauge.init({ notify, pick }) · MemGauge.setFeatures(features.memory) · MemGauge.onSample(s) · MemGauge.isOpen() · MemGauge.close() */
const MemGauge = (() => {
  const $ = (q, el = document) => el.querySelector(q);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WINDOW_MS = 30 * 60 * 1000;
  let feat = null, samples = [], open = false, pop = null, topTimer = 0, topAt = 0, alarmed = false, opts = {};
  const warnGb = () => feat?.warnFreeGb ?? 6;
  const free = (s) => (s?.cl != null && s?.cu != null ? s.cl - s.cu : null);
  const unk = (s) => (s.cw ? '측정 준비 중' : '측정 불가');   // 커밋 첫 숫자를 기다리는 동안(약 4초) = 준비 중
  const pct = (s) => (s?.rt > 0 ? Math.round((s.ru / s.rt) * 100) : 0);
  const gb = (v) => (v == null ? '—' : v >= 10 ? v.toFixed(1) : v.toFixed(2));
  // 링마다 색: RAM 은 찬 비율, 커밋은 남은 여유로 판단(전체 위험도 lvl 과 같은 기준 — memory.mjs levelOf)
  const ramLvl = (s) => { const p = s.rt > 0 ? s.ru / s.rt : 0; return p >= 0.95 ? 'bad' : p >= 0.85 ? 'warn' : 'ok'; };
  const comLvl = (s) => { const f = free(s); return f == null ? 'na' : f < warnGb() ? 'bad' : f < warnGb() * 2 ? 'warn' : 'ok'; };

  function init(o = {}) {
    opts = o;
    const b = $('#mem'); if (!b) return;
    b.onclick = () => (open ? close() : show());
    document.addEventListener('mousedown', (e) => { if (open && pop && !pop.contains(e.target) && !b.contains(e.target)) close(); });
    window.addEventListener('resize', () => { if (open) place(); });
  }
  /** features.memory 가 없으면(옛 데몬) 링을 숨긴다. */
  function setFeatures(f) { feat = f || null; if (!f) $('#mem').hidden = true; }

  // ---- 헤더 링 ----
  // 링은 처음 한 번만 만들고 그 뒤로는 제자리에서 값만 바꾼다 — 2초마다 통째로 갈면 누르는 사이 요소가 사라져 클릭이 버려질 수 있고, 차오르는 전환도 안 보인다(2026-10-04 검토).
  const R1 = 9.5, R2 = 5, C1 = 2 * Math.PI * R1, C2 = 2 * Math.PI * R2;
  function buildButton(b) {
    b.innerHTML = `<svg class="mem-ring" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">`
      + `<circle class="trk" cx="12" cy="12" r="${R1}" stroke-width="3"/><circle class="arc ram" cx="12" cy="12" r="${R1}" stroke-width="3" stroke-dasharray="0 ${C1.toFixed(2)}"/>`
      + `<circle class="trk" cx="12" cy="12" r="${R2}" stroke-width="2.5"/><circle class="arc in com" cx="12" cy="12" r="${R2}" stroke-width="2.5" stroke-dasharray="0 ${C2.toFixed(2)}"/></svg><span class="mem-pct"></span>`;
    b.dataset.built = '1';
  }
  function renderButton(s) {
    const b = $('#mem'); if (!b || !feat) return;
    const f = free(s);
    if (!b.dataset.built) buildButton(b);
    b.hidden = false; b.className = `mem ${s.lvl || 'ok'}${open ? ' active' : ''}`;
    const p1 = s.rt > 0 ? Math.min(1, s.ru / s.rt) : 0, p2 = s.cl > 0 && s.cu != null ? Math.min(1, s.cu / s.cl) : 0;
    const a1 = $('.arc.ram', b), a2 = $('.arc.com', b);
    a1.setAttribute('class', `arc ram ${ramLvl(s)}`); a1.setAttribute('stroke-dasharray', `${(C1 * p1).toFixed(2)} ${C1.toFixed(2)}`);
    a2.setAttribute('class', `arc in com ${comLvl(s)}`); a2.setAttribute('stroke-dasharray', `${(C2 * p2).toFixed(2)} ${C2.toFixed(2)}`);
    $('.mem-pct', b).textContent = `${pct(s)}%`;
    b.title = `메모리 — 바깥 링: 실제 RAM ${gb(s.ru)}/${gb(s.rt)}GB (${pct(s)}%) · 안 링: 커밋 ${s.cu == null ? unk(s) : `${gb(s.cu)}/${gb(s.cl)}GB, 여유 ${gb(f)}GB`}  (누르면 30분 그래프)`;
  }

  // ---- 새 숫자(2초마다) ----
  function onSample(s) {
    if (!s) return;
    const last = samples[samples.length - 1]; if (!last || s.t > last.t) samples.push(s);
    const cut = s.t - WINDOW_MS; while (samples.length && samples[0].t < cut) samples.shift();
    renderButton(s);
    if (open) { renderStats(s); renderChart(); }
    // 경고는 커밋 여유로만(RAM 이 꽉 차도 윈도는 디스크로 밀어내며 버티지만, 커밋 한도는 넘을 수 없다). 한 번 울리면 여유가 2GB 더 생길 때까지 다시 울리지 않는다.
    const f = free(s);
    if (f != null && f < warnGb() && !alarmed) {
      alarmed = true;
      opts.notify?.({ id: 'mem-low', title: '메모리 여유가 부족합니다', sub: `커밋 여유 ${gb(f)}GB — 새 프로그램이나 세션이 켜지지 않을 수 있습니다. 위쪽 메모리 링을 눌러 많이 차지하는 것을 확인하세요.`, status: 'attention', force: true });
    } else if (f != null && f > warnGb() + 2) alarmed = false;
  }

  // ---- 펼침 ----
  function show() {
    if (!pop) {
      pop = document.createElement('div'); pop.id = 'mem-pop'; pop.className = 'mem-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '메모리');
      pop.innerHTML = `<div class="mp-head"><span class="mp-title">메모리</span><span class="mp-sub">최근 30분 · 2초마다</span><button class="mp-x icon-btn" title="닫기 (Esc)">✕</button></div>`
        + `<div class="mp-stats"></div><svg class="mp-chart" viewBox="0 0 360 140"></svg><div class="mp-legend"></div>`
        + `<div class="mp-sec"><span>많이 차지하는 것</span><small class="mp-top-at"></small></div><div class="mp-top"><div class="mp-empty">불러오는 중…</div></div>`
        + `<div class="mp-sweep" hidden><button class="mp-sweep-btn">잔여물 미리보기</button><small>닫힌 세션이 남긴 프로그램을 찾아 보여 주기만 합니다(종료 없음)</small><pre hidden></pre></div>`;
      document.body.appendChild(pop);
      $('.mp-x', pop).onclick = () => close();
      $('.mp-sweep-btn', pop).onclick = sweep;
    }
    open = true; pop.hidden = false; $('#mem')?.classList.add('active');
    $('.mp-sweep', pop).hidden = !feat?.sweep;
    place();
    const s = samples[samples.length - 1]; if (s) { renderStats(s); renderChart(); }
    // 펼칠 때 데몬이 기억하는 30분을 받아 빈 앞부분을 채운다(창을 늦게 열었어도 그래프가 처음부터 보이게)
    fetch('/api/memory').then(r => r.json()).then((d) => { if (Array.isArray(d.samples) && d.samples.length) { feat = { ...feat, ...d, samples: undefined }; samples = d.samples.slice(); if (open) { renderStats(samples[samples.length - 1]); renderChart(); } } }).catch(() => {});
    loadTop(); clearInterval(topTimer); topTimer = setInterval(loadTop, 10000);
  }
  function close() { if (!open) return; open = false; if (pop) pop.hidden = true; clearInterval(topTimer); $('#mem')?.classList.remove('active'); }
  function place() {
    const b = $('#mem'); if (!b || !pop) return;
    const r = b.getBoundingClientRect(); const w = Math.min(392, window.innerWidth - 16);
    pop.style.width = `${w}px`; pop.style.top = `${Math.round(r.bottom + 6)}px`;
    pop.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)))}px`;
  }

  function renderStats(s) {
    if (!pop || !s) return; const f = free(s);
    $('.mp-stats', pop).innerHTML =
      `<div class="mp-stat ${ramLvl(s)}"><i class="mk ram"></i><b>실제 RAM</b><span class="v">${gb(s.ru)} / ${gb(s.rt)}GB</span><span class="p">${pct(s)}%</span><small>지금 메모리 칩에 올라가 있는 양</small></div>`
      + `<div class="mp-stat ${comLvl(s)}"><i class="mk com"></i><b>커밋</b><span class="v">${s.cu == null ? unk(s) : `${gb(s.cu)} / ${gb(s.cl)}GB`}</span><span class="p">${f == null ? '' : `여유 ${gb(f)}GB`}</span><small>프로그램들이 잡아 둔 양 · 한도에 닿으면 새 프로그램이 켜지지 않습니다</small></div>`;
  }

  // 30분 선 그래프 — 가로 = 30분 전→지금, 세로 = 0→(커밋 한도·RAM 중 큰 값). 6초 넘게 끊긴 구간(데몬 재시작 등)은 선을 잇지 않는다.
  function renderChart() {
    if (!pop) return; const svg = $('.mp-chart', pop); const W = 360, H = 140, L = 30, Rt = 6, T = 8, B = 20;
    const last = samples[samples.length - 1]; if (!last) { svg.innerHTML = ''; return; }
    const t1 = last.t, t0 = t1 - WINDOW_MS;
    const maxGb = Math.max(...samples.map(s => Math.max(s.rt || 0, s.cl || 0)), 1);
    const top = Math.ceil((maxGb * 1.05) / 8) * 8;
    const x = (t) => L + ((t - t0) / WINDOW_MS) * (W - L - Rt), y = (v) => T + (1 - v / top) * (H - T - B);
    const path = (key) => { let d = '', prev = null; for (const s of samples) { const v = s[key]; if (v == null) { prev = null; continue; } d += `${prev && s.t - prev.t <= 6000 ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(v).toFixed(1)}`; prev = s; } return d; };
    // 이름표: 한도 두 줄은 선 위 오른쪽, 경고선은 선 아래 왼쪽(커밋 한도와 6GB 차이라 붙어 있어도 겹치지 않게)
    const hline = (v, cls, label, below = false) => (v == null || v <= 0 || v > top ? '' : `<line class="${cls}" x1="${L}" x2="${W - Rt}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`
      + (label ? `<text class="hl ${cls}" x="${below ? L + 3 : W - Rt - 2}" y="${(below ? y(v) + 11 : y(v) - 3).toFixed(1)}" text-anchor="${below ? 'start' : 'end'}">${esc(label)}</text>` : ''));
    const grid = [0, top / 2, top].map(v => `<line class="grid" x1="${L}" x2="${W - Rt}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 4}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`).join('');
    const xl = [[t0, '30분 전', 'start'], [t0 + WINDOW_MS / 2, '15분 전', 'middle'], [t1, '지금', 'end']].map(([t, s, a]) => `<text class="ax" x="${x(t)}" y="${H - 5}" text-anchor="${a}">${s}</text>`).join('');
    svg.innerHTML = grid + xl
      + hline(last.rt, 'cap ram', 'RAM 전체') + hline(last.cl, 'cap com', '커밋 한도') + hline(last.cl != null ? last.cl - warnGb() : null, 'danger', `경고선(여유 ${warnGb()}GB)`, true)
      + `<path class="ln com" d="${path('cu')}"/><path class="ln ram" d="${path('ru')}"/>`;
    $('.mp-legend', pop).innerHTML = `<span><i class="mk ram"></i>실제 RAM</span><span><i class="mk com"></i>커밋</span><span><i class="mk danger"></i>커밋 선이 경고선을 넘으면 위험</span><span>단위 GB</span>`;
  }

  // ---- 많이 차지하는 것 ----
  async function loadTop() {
    if (!feat?.top) { if (pop) $('.mp-top', pop).innerHTML = '<div class="mp-empty">이 컴퓨터에서는 볼 수 없습니다</div>'; return; }
    try {
      const d = await (await fetch('/api/memory/top')).json(); if (!open) return;
      topAt = d.at || Date.now();
      const g = Array.isArray(d.groups) ? d.groups : [];
      if (!g.length) { $('.mp-top', pop).innerHTML = `<div class="mp-empty">${d.error ? '목록을 읽지 못했습니다' : '없음'}</div>`; return; }
      const max = Math.max(...g.map(x => x.priv), 0.01);
      $('.mp-top', pop).innerHTML = g.map((x, i) => {
        const name = x.kind === 'session' ? `세션 · ${x.label}` : x.label;
        return `<div class="mt-row ${x.kind}${x.kind === 'session' ? ' pick' : ''}" data-i="${i}" title="잡아 둔 양 ${gb(x.priv)}GB · 실제 올라간 양 ${gb(x.ws)}GB · 프로세스 ${x.count}개">`
          + `<span class="mt-dot"></span><span class="mt-name">${esc(name)}</span><span class="mt-cnt">${x.count > 1 ? `×${x.count}` : ''}</span>`
          + `<span class="mt-bar"><i style="width:${Math.max(2, Math.round((x.priv / max) * 100))}%"></i></span><span class="mt-gb">${gb(x.priv)}GB</span></div>`;
      }).join('');
      for (const row of pop.querySelectorAll('.mt-row.pick')) row.onclick = () => { const x = g[Number(row.dataset.i)]; if (x?.id) { close(); opts.pick?.(x.id); } };
      $('.mp-top-at', pop).textContent = '기준 = 잡아 둔 양 · 10초마다';
    } catch { if (open) $('.mp-top', pop).innerHTML = '<div class="mp-empty">목록을 읽지 못했습니다</div>'; }
  }

  // ---- 잔여물 미리보기(종료 없음) ----
  async function sweep() {
    const btn = $('.mp-sweep-btn', pop), pre = $('.mp-sweep pre', pop);
    btn.disabled = true; btn.textContent = '찾는 중…'; pre.hidden = false; pre.textContent = '';
    try {
      const d = await (await fetch('/api/memory/sweep-preview', { method: 'POST' })).json();
      pre.textContent = d.ok ? (d.text.trim() || '대상 없음') : `실행하지 못했습니다: ${d.error || ''}`;
    } catch (e) { pre.textContent = `실행하지 못했습니다: ${e.message}`; }
    btn.disabled = false; btn.textContent = '잔여물 미리보기';
  }

  return { init, setFeatures, onSample, isOpen: () => open, close };
})();
