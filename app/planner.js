// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 플래너 화면(설계 docs\설계-플래너-2026-11-13.md 조각 ② — 시안 8판, 2026-11-22).
   육각 단추 하나가 말풍선으로 말하고, 누르면 달력 한 화면이 펴진다. 다른 화면으로 넘어가지 않는다.
   · 셈은 하지 않는다 — 데몬이 준 한 장(GET /api/planner/view)을 그대로 그린다.
   · 손으로 하는 것은 「끝냄」 체크와 제안에 대한 답뿐. 넣기 · 고치기 · 지우기는 아래 칸에서 아이리스에게 말로(POST /api/planner/talk).
   · 말풍선은 한 번에 하나. 같은 종류는 줄로 쌓고(최대 4줄), 다른 종류는 차례로(약속 직전 → 세션 확인 → 작업 완료 → 제안 → 인사).
   · 말풍선은 초점을 뺏지 않는다(입력 중인 글 유지). 폭은 가장 긴 줄에 맞춘다.
   · 화면에 이모지를 쓰지 않는다. 아이콘은 app/icons.js 이름으로만. 모든 글자는 esc() 를 거친다.
   사용: Planner.init({ openFolder, chatIn, openSession, drawerOpen }) · Planner.onHello(p) · Planner.onMessage(m) · Planner.onEscape() → bool
         Planner.say({ group, tone, text, sub?, tip?, id?, pick?, actions?, ttl?, force? }) · Planner.applySettings(cfg) */
window.Planner = (() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = (name) => window.Icons.svg(name, 16);
  const HEX = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9Z" style="stroke:var(--iris)" stroke-width="1.3"/><path d="M12 3v9m0 0l7.8 4.5M12 12l-7.8 4.5" style="stroke:var(--iris-2)" stroke-width="1" opacity=".7"/></svg>';
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const TTL = 8000, MAX_LINES = 4;
  const early = [];   // init 앞에 온 말(준비되면 차례로 말한다)
  const PRI = { sched: 0, attention: 1, done: 2, exited: 2, info: 2, proposal: 3, greet: 4 }; // 겹칠 때의 차례(작을수록 먼저)

  // ---- 날짜(그리는 데 필요한 만큼만) ----
  const pad = (n) => String(n).padStart(2, '0');
  const parts = (d) => ({ y: +d.slice(0, 4), m: +d.slice(5, 7), d: +d.slice(8, 10) });
  const utc = (d) => { const p = parts(d); return new Date(Date.UTC(p.y, p.m - 1, p.d)); };
  const fmt = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  const addDays = (d, n) => { const t = utc(d); t.setUTCDate(t.getUTCDate() + n); return fmt(t); };
  const wdOf = (d) => utc(d).getUTCDay();
  const monthAdd = (ym, n) => { const t = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`; };
  const daysIn = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const longDay = (d) => { const p = parts(d); return `${p.m}월 ${p.d}일 ${WD[wdOf(d)]}요일`; };
  /** 다른 날을 짧게: 같은 달이면 '26일', 아니면 '12/1' */
  const shortDay = (d, ref) => (d.slice(0, 7) === ref.slice(0, 7) ? `${parts(d).d}일` : `${parts(d).m}/${parts(d).d}`);
  const rangeText = (a, b) => (a.slice(0, 7) === b.slice(0, 7) ? `${parts(a).d}~${parts(b).d}일` : `${parts(a).m}/${parts(a).d}~${parts(b).m}/${parts(b).d}`);

  // ---- 상태 ----
  let opts = { openFolder: () => {}, chatIn: () => {}, openSession: () => {}, openSettings: () => {}, drawerOpen: () => false, onCfg: () => {} };
  let cfg = { plannerEnabled: true, plannerTalk: true, notifyDone: true };
  let host = null, over = null, tipEl = null, panelEl = null, rowEl = null;
  let open = false, talk = false, strip = false, fresh = false, talkFresh = false, focusIn = false;
  let composing = false, panelDirty = false, compact = false, threadLen = 0;
  let sel = null, month = null, view = null, count = 0, busy = false, loadSeq = 0;
  const folded = new Set();
  let thread = [];            // { who:'me'|'ai', text, cards?, undo?, warn?, confirm?, wait? }
  let talkCtx = null;         // 「말로 고치기」로 연 대화의 대상(제안) — 판이나 대화를 닫으면 지운다
  let cur = null;             // 떠 있는 말풍선 { group, tone, lines:[…], actions, where }
  const queue = [];

  // ---- 데몬과 ----
  async function api(path, body) {
    const init = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
    try { const r = await fetch(path, init); const j = await r.json().catch(() => ({})); return { status: r.status, ...j }; }
    catch { return { status: 0, ok: false, code: 'offline', error: 'IRIS 와 연결이 끊겼습니다.' }; }
  }
  async function load() {
    const seq = ++loadSeq;
    const q = new URLSearchParams(); if (sel) q.set('day', sel); if (month) q.set('month', month);
    const v = await api(`/api/planner/view?${q}`);
    if (seq !== loadSeq) return;               // 더 새로운 요청이 나갔다
    if (v.status !== 200) { view = null; render(); return; }
    view = v; sel = v.day; month = v.month; count = v.proposals.length;
    if (!count) strip = false;
    render();
  }

  // ---- 그리기 ----
  const ib = (icon, tip, cls = '', attr = '') => `<button type="button" class="pl-ib${cls ? ' ' + cls : ''}" data-tip="${esc(tip)}" aria-label="${esc(tip)}" ${attr}>${I(icon)}</button>`;
  const ck = (on, attr, off) => `<button type="button" class="pl-ck${on ? ' on' : ''}" ${attr} data-tip="${on ? '끝냄' : '끝냄으로 표시'}" aria-label="${on ? '끝냄' : '끝냄으로 표시'}" aria-pressed="${on}"${off ? ' disabled' : ''}></button>`;
  const lock = () => !view || !view.enabled || !!view.readOnly || view.ok === false;

  function badge(r) {
    if (!r.period) return '';
    const p = r.period;
    const tip = `${longDay(p.start)}부터 ${longDay(p.end)}까지${p.last ? ' · 마감일' : ''}`;
    return `<span class="pl-pill span${r.red ? ' end' : ''}" data-tip="${esc(tip)}">${p.index ? `<b>${p.index}일차</b>` : ''}${esc(rangeText(p.start, p.end))}</span>`;
  }
  function rowHtml(r) {
    const off = lock();
    const dateAttr = r.repeat ? ` data-date="${esc(r.date)}"` : '';
    const late = r.late && r.lateFrom ? `<span class="pl-pill" data-tip="${esc(longDay(r.lateFrom))}에 하려던 일">${r.lateFrom === addDays(view.today, -1) ? '어제' : esc(shortDay(r.lateFrom, view.today))}</span>` : '';
    const title = `<span class="tx${r.done ? ' done' : ''}">${esc(r.title)}</span>`;
    if (r.steps) {
      const isOpen = !folded.has(r.id), dn = r.steps.filter((s) => s.done).length;
      const steps = isOpen ? `<div class="pl-steps">${r.steps.map((s) => `<div class="pl-r step${s.cur ? ' cur' : ''}${s.over ? ' over' : ''}"><span class="no" data-tip="${s.n}번째 단계">${s.n}</span>${ck(s.done, `data-ck="${esc(r.id)}" data-step="${esc(s.id)}"`, off)}<span class="tx${s.done ? ' done' : ''}">${esc(s.title)}</span><span class="dd" data-tip="하는 날 ${esc(longDay(s.day))}">${s.day === view.today ? '오늘' : esc(shortDay(s.day, view.day))}</span></div>`).join('')}</div>` : '';
      return `<div class="pl-r${r.red ? ' end' : ''}">${ck(r.done, `data-ck="${esc(r.id)}"`, off)}${title}<button type="button" class="pl-pill fold" data-fold="${esc(r.id)}" aria-expanded="${isOpen}" data-tip="단계 ${r.steps.length}개 가운데 ${dn}개 끝남 · 눌러서 ${isOpen ? '접기' : '펴기'}">${I(isOpen ? 'chev-up' : 'chev-down')}${dn}/${r.steps.length}</button>${badge(r)}</div>${steps}`;
    }
    const folder = r.folder ? `<span class="hid">${ib('folder', '연결 폴더 열기', '', `data-folder="${esc(r.folder)}"`)}${ib('chat', '이 폴더에서 대화 시작', '', `data-chat="${esc(r.folder)}"`)}</span>` : '';
    return `<div class="pl-r${r.red ? ' end' : ''}">${ck(r.done, `data-ck="${esc(r.id)}"${dateAttr}`, off)}${r.time ? `<span class="tm"${r.timeEnd ? ` data-tip="${esc(r.time)}부터 ${esc(r.timeEnd)}까지"` : ''}>${esc(r.time)}</span>` : ''}${title}${late}${badge(r)}${folder}</div>`;
  }
  function cell(d, out) {
    const dot = view.dots[d]; const n = dot ? dot.n : 0, due = dot ? dot.due : 0;
    const tip = [n ? `할 것 ${n}` : '', due ? `마감 ${due}` : ''].filter(Boolean).join(' · ');
    const dots = n || due ? `<i class="pl-dots">${n ? '<b></b>' : ''}${due ? '<b class="d"></b>' : ''}</i>` : '';
    return `<button type="button" data-day="${d}"${tip ? ` data-tip="${tip}"` : ''} aria-label="${esc(longDay(d))}${tip ? ` · ${tip}` : ''}" class="${d === view.today ? 'today ' : ''}${d === view.day ? 'sel ' : ''}${out ? 'out' : ''}">${parts(d).d}${dots}</button>`;
  }
  const heads = WD.map((d) => `<span>${d}</span>`).join('');
  function grid() {
    const first = `${view.month}-01`; let h = '';
    for (let i = 0; i < wdOf(first); i++) h += '<i class="blank"></i>';
    for (let d = 1; d <= daysIn(view.month); d++) h += cell(`${view.month}-${pad(d)}`, false);
    return `<div class="pl-cal">${heads}${h}</div>`;
  }
  /** 대화가 열렸을 때: 고른 날이 든 한 주만(일~토). 다른 달의 날은 흐리게, 점은 그 달을 볼 때 나온다. */
  function week() {
    const start = addDays(view.day, -wdOf(view.day)); let h = '';
    for (let i = 0; i < 7; i++) { const d = addDays(start, i); h += cell(d, d.slice(0, 7) !== view.month); }
    return `<div class="pl-cal">${heads}${h}</div>`;
  }
  function stripHtml() {
    if (!view.proposals.length) return '';
    const off = lock();
    const rows = strip ? `<div class="pl-strip-b">${view.proposals.map((p) => {
      const when = p.start === view.today ? '오늘' : `${shortDay(p.start, view.today)} ${WD[wdOf(p.start)]}`;
      const tip = [p.session ? `「${p.session}」에서 올린 제안` : '아이리스의 제안', p.evidence ? `근거: ${p.evidence}` : ''].filter(Boolean).join(' · ');
      const act = p.action && p.action.kind === 'start-work' ? `<button type="button" class="pl-tb" data-work="${esc(p.id)}" data-tip="그 폴더에서 새 작업을 열고 요청문을 채워 둡니다(보내기는 직접)"${off ? ' disabled' : ''}>${I('arrow-right')}작업 시작</button>` : '';
      return `<div class="pl-r"><span class="tx" data-tip="${esc(tip)}">${esc(p.title)}</span><span class="pl-pill">${esc(p.end ? rangeText(p.start, p.end) : when)}${p.time ? ` ${esc(p.time)}` : ''}</span>${act}${ib('check', '달력에 추가', 'main', `data-acc="${esc(p.id)}"${off ? ' disabled' : ''}`)}${ib('chat', '말로 고치기', 'line', `data-fix="${esc(p.id)}"${off ? ' disabled' : ''}`)}${ib('close', '추가 안 함', 'line', `data-dec="${esc(p.id)}"${off ? ' disabled' : ''}`)}</div>`;
    }).join('')}</div>` : '';
    return `<section class="pl-strip"><button type="button" class="pl-strip-h" data-strip aria-expanded="${strip}" data-tip="${strip ? '접기' : '눌러서 펴기'}">${I('bulb')}<b>아이리스 제안</b><em>${view.proposals.length}</em><span class="pl-sp"></span>${I(strip ? 'chev-up' : 'chev-down')}</button>${rows}</section>`;
  }
  function card(c) {
    const when = c.end ? rangeText(c.start, c.end) : `${shortDay(c.start, view ? view.today : c.start)} ${WD[wdOf(c.start)]}`;
    return `<div class="pl-card"><span class="pl-pill${c.end ? ' span' : ''}">${esc(when)}</span>${c.time ? `<span class="tm">${esc(c.time)}</span>` : ''}<span class="tx">${esc(c.title)}</span></div>`;
  }
  function threadHtml() {
    return thread.map((m, i) => {
      if (m.who === 'me') return `<div class="pl-bub me">${esc(m.text)}</div>`;
      if (m.wait) return `<div class="pl-bub ai"><span class="pl-wait" aria-label="생각하는 중"><i></i><i></i><i></i></span></div>`;
      const cards = (m.cards || []).map(card).join('');
      const undo = m.undo ? `<button type="button" class="pl-tb" data-undo="${i}">${I('undo')}되돌리기</button>` : '';
      const confirm = m.confirm ? `<button type="button" class="pl-tb main" data-yes="${i}">${I('check')}그렇게 해 주세요</button><button type="button" class="pl-tb" data-no="${i}">아니요</button>` : '';
      const warn = (m.warn || []).map((w) => `<p class="warn">${esc(w)}</p>`).join('');
      return `<div class="pl-bub ai"><p>${esc(m.text)}</p>${warn}${cards || undo || confirm ? `<div class="pl-res">${cards}${undo}${confirm}</div>` : ''}</div>`;
    }).join('');
  }
  function footHtml() {
    const off = lock() || cfg.plannerTalk === false;
    const ph = !view ? '플래너를 불러오지 못했어요' : !view.enabled ? '플래너가 꺼져 있어요' : view.readOnly ? '지금은 볼 수만 있어요' : cfg.plannerTalk === false ? '말하기가 꺼져 있어요(설정 → 플래너)' : '아이리스에게 말하기';
    return `<div class="pl-foot"><input type="text" id="pl-in" placeholder="${esc(ph)}" aria-label="아이리스에게 말하기" autocomplete="off" maxlength="500"${off ? ' disabled' : ''}><button type="button" class="pl-send" id="pl-send" data-tip="보내기" aria-label="보내기"${off || busy ? ' disabled' : ''}>${I('send')}</button></div>`;
  }
  function noteHtml() {
    if (!view) return '<div class="pl-note">플래너를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</div>';
    if (view.ok === false) return '<div class="pl-note">수첩을 열지 못했어요. IRIS 를 다시 켜 주세요.</div>';
    if (!view.enabled) return `<div class="pl-note">플래너가 꺼져 있어요. 지금은 보기만 됩니다. <button type="button" class="pl-tb" data-settings>설정 열기</button></div>`;
    if (view.readOnly === 'newer-schema') return '<div class="pl-note">이 수첩은 더 새로운 IRIS 가 쓰던 것이라 지금은 고칠 수 없어요. IRIS 를 업데이트해 주세요.</div>';
    if (view.readOnly) return '<div class="pl-note">수첩 파일을 읽지 못해, 덮어쓰지 않으려고 고치기를 막아 두었어요.</div>';
    if (view.recovered) return `<div class="pl-note">수첩 파일을 읽지 못해 ${view.recovered.from ? '가장 새 사본으로 열었어요' : '빈 수첩으로 열었어요'}. 읽지 못한 파일은 따로 남겨 두었습니다.</div>`;
    return '';
  }
  function panelHtml() {
    if (!view) return `<div class="pl-panel${fresh ? ' in' : ''}" role="dialog" aria-label="플래너"><div class="pl-head"><strong>플래너</strong><span class="pl-sp"></span>${ib('close', '닫기', '', 'data-close')}</div>${noteHtml()}<div class="pl-list"></div></div>`;
    const rows = view.rows.map(rowHtml).join('') || '<div class="pl-empty">할 것이 없어요</div>';
    const head = `<div class="pl-head"><strong>${esc(longDay(view.day))}</strong>${view.day === view.today ? '<span class="pl-pill now">오늘</span>' : ''}<span class="pl-sp"></span>${ib('chev-left', '이전 달', '', 'data-month="-1"')}${ib('target', '오늘로', '', 'data-today')}${ib('chev-right', '다음 달', '', 'data-month="1"')}${ib('close', '닫기', '', 'data-close')}</div>`;
    const talkPart = talk ? `<div class="pl-talk${talkFresh ? ' in' : ''}"><button type="button" class="pl-talk-x" data-talk-x data-tip="대화 접기" aria-label="대화 접기">${I('chev-down')}</button><div class="pl-thread" id="pl-thread" aria-live="polite">${threadHtml()}</div></div>` : '';
    return `<div class="pl-panel${fresh ? ' in' : ''}" role="dialog" aria-label="플래너">${head}${noteHtml()}${stripHtml()}${talk || compact ? week() : grid()}<div class="pl-list">${rows}</div>${talkPart}${footHtml()}</div>`;
  }
  function sayHtml(b, isNew) {
    const lines = b.lines.map((l, i) => `<div class="pl-line${l.pick ? ' pick' : ''}" data-line="${i}"${l.tip ? ` data-tip="${esc(l.tip)}"` : ''}><p>${esc(l.text)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</p><button type="button" class="pl-x" data-line-x="${i}" tabindex="-1" aria-label="닫기">${I('close')}</button></div>`).join('');
    const acts = (b.actions || []).map((a, i) => (a.label ? `<button type="button" class="pl-tb${a.main ? ' main' : ''}" data-act="${i}"${a.tip ? ` data-tip="${esc(a.tip)}"` : ''}>${a.icon ? I(a.icon) : ''}${esc(a.label)}</button>` : `<button type="button" class="pl-ib line" data-act="${i}" data-tip="${esc(a.tip || '')}" aria-label="${esc(a.tip || '')}">${I(a.icon)}</button>`)).join('');
    return `<div class="pl-say${isNew ? ' in' : ''}" data-tone="${esc(b.tone)}" role="status">${lines}${acts ? `<div class="pl-acts">${acts}</div>` : ''}</div>`;
  }
  let sayNew = false;
  /** 단추 줄(말풍선 + 육각 단추)만 다시 그린다 — 판은 건드리지 않는다. */
  function renderRow() {
    if (!host) return;
    hideTip();
    const hidden = cfg.plannerEnabled === false && cfg.notifyDone === false; // 플래너도 작업 알림도 끈 사람에게는 단추를 두지 않는다
    const covered = !!opts.drawerOpen();                                    // 설정·대시보드 서랍이 무대를 덮고 있다
    host.hidden = (hidden && !cur) || covered;                              // 다만 말하는 동안(설정의 알림 미리보기 등)은 보인다
    const say = cur ? sayHtml(cur, sayNew) : '';
    sayNew = false;
    const tone = cur ? cur.tone : 'rest';
    rowEl.innerHTML = `${covered ? '' : say}<button type="button" class="pl-hex${cur ? ' speak' : ''}" id="pl-hex" data-tone="${esc(tone)}"${open ? '' : ' data-tip="플래너 열기"'} aria-label="플래너" aria-expanded="${open}">${HEX}${count ? `<span class="pl-cnt">${count}</span>` : ''}</button>`;
    over.hidden = !(covered && cur);          // 서랍이 덮고 있으면 말풍선만 구석에(지금의 알림과 같은 자리)
    over.innerHTML = covered && cur ? say : '';
    fit(over.hidden ? rowEl : over);
  }
  /** 판을 다시 그린다. 입력칸에 적던 글 · 커서 · 초점, 목록 · 대화의 스크롤을 지킨다. 한글을 조합하는 중이면 조합이 끝난 뒤에 그린다. */
  function renderPanel() {
    if (!host) return;
    if (composing) { panelDirty = true; return; }
    panelDirty = false;
    if (!open) { panelEl.innerHTML = ''; fresh = false; talkFresh = false; threadLen = 0; return; }
    const inp0 = $('#pl-in', panelEl); const list0 = $('.pl-list', panelEl); const strip0 = $('.pl-strip-b', panelEl); const th0 = $('#pl-thread', panelEl);
    const keep = {
      value: inp0 ? inp0.value : '', a: inp0 ? inp0.selectionStart : 0, b: inp0 ? inp0.selectionEnd : 0, focused: !!inp0 && document.activeElement === inp0,
      list: list0 ? list0.scrollTop : 0, strip: strip0 ? strip0.scrollTop : 0, th: th0 ? th0.scrollTop : 0, thBottom: !th0 || th0.scrollTop + th0.clientHeight >= th0.scrollHeight - 4,
    };
    hideTip();
    panelEl.innerHTML = panelHtml();
    fresh = false; talkFresh = false;
    const inp = $('#pl-in', panelEl);
    if (inp) {
      if (keep.value) { inp.value = keep.value; try { inp.setSelectionRange(keep.a, keep.b); } catch { /* 잠긴 칸 */ } }
      if ((keep.focused || focusIn) && !inp.disabled) inp.focus();
    }
    focusIn = false;
    const list = $('.pl-list', panelEl); if (list) list.scrollTop = keep.list;
    const st = $('.pl-strip-b', panelEl); if (st) st.scrollTop = keep.strip;
    const th = $('#pl-thread', panelEl);
    if (th) { th.scrollTop = keep.thBottom || thread.length !== threadLen ? th.scrollHeight : keep.th; }
    threadLen = thread.length;
    fit(panelEl);
  }
  function render() { renderPanel(); renderRow(); }
  /** 말풍선 폭 = 가장 긴 줄. 줄이 바뀐 글은 CSS 만으로 상자가 줄지 않아 직접 잰다(나타나는 확대 중이면 배율을 되돌린다). */
  function fit(root) {
    try {
      for (const el of (root || document).querySelectorAll('.pl-say p, .pl-bub.ai p, .pl-bub.me')) {
        el.style.width = '';
        const box = el.getBoundingClientRect();
        const k = el.offsetWidth && box.width ? box.width / el.offsetWidth : 1;
        const rg = document.createRange(); rg.selectNodeContents(el);
        let lo = Infinity, hi = -Infinity;
        for (const rc of rg.getClientRects()) { if (!rc.width) continue; lo = Math.min(lo, rc.left); hi = Math.max(hi, rc.right); }
        if (!(hi > lo)) continue;
        const cs = getComputedStyle(el);
        const extra = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
        el.style.width = `${Math.ceil((hi - lo) / k + extra) + 1}px`;
      }
    } catch { /* 재지 못하면 CSS 폭 그대로 */ }
  }
  /** 입력창 높이 · 보조 작업 서랍 너비 · 무대 높이에 맞춰 자리를 잡는다. */
  function place() {
    if (!host) return;
    const stage = $('#stage'), dock = $('#dock'), sub = $('#sub');
    const tall = (id) => { const el = $(id); return el && !el.hidden ? el.offsetHeight : 0; };
    // 본체의 확인 카드 · 끝난 세션 띠가 떠 있으면 그 위로 올라간다(그 단추를 가리지 않게)
    const bottom = (dock ? dock.offsetHeight : 76) + tall('#approval') + tall('#dead-bar') + 8;
    host.style.setProperty('--pl-bottom', `${bottom}px`);
    const sw = stage ? stage.clientWidth : 1000, sh = stage ? stage.clientHeight : 800;
    let shift = sub && !sub.hidden ? sub.offsetWidth : 0;
    if (sw - 44 - shift < 300) shift = 0;                     // 서랍 옆에 판이 설 자리가 없으면 비켜나지 않는다
    host.style.setProperty('--pl-shift', `${shift}px`);
    host.style.setProperty('--pl-w', `${Math.max(260, Math.min(384, sw - 44 - shift))}px`);
    let avail = sh - bottom - 76;
    if (avail < 240) {                                         // 확인 카드가 커서 그 위에 판이 설 자리가 없다 — 판은 입력창 위(카드를 덮는 자리)로 내려오고 화면 높이 안에 맞춘다
      const base = (dock ? dock.offsetHeight : 76) + 8;
      if (open) host.style.setProperty('--pl-bottom', `${base}px`);
      avail = sh - (open ? base : bottom) - 76;
    }
    host.style.setProperty('--pl-h', `${Math.max(160, Math.min(avail, sh - 24))}px`);
    const was = compact; compact = avail < 440;               // 낮은 창에서는 달 대신 그 주만 보인다(입력칸이 잘리지 않게)
    if (was !== compact && open) renderPanel();
  }

  // ---- 설명 풍선 ----
  function hideTip() { if (tipEl) tipEl.hidden = true; }
  function showTip(el) {
    if (!el.dataset.tip) return hideTip();
    tipEl.textContent = el.dataset.tip; tipEl.hidden = false;
    const r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - 8));
    const y = r.top - t.height - 8 < 8 ? r.bottom + 8 : r.top - t.height - 8;
    tipEl.style.left = `${x}px`; tipEl.style.top = `${y}px`;
  }
  const overTip = (e) => { const el = e.target.closest && e.target.closest('.pl [data-tip]'); if (el) showTip(el); else hideTip(); };

  // ---- 말풍선(한 번에 하나) ----
  /**
   * 한마디. 같은 종류(group)가 떠 있으면 줄로 쌓고, 아니면 차례를 기다린다.
   * @param {{ group?: string, tone?: string, text: string, sub?: string, tip?: string, id?: any, pick?: (id) => void, actions?: {label?, icon?, tip?, main?, run: () => void}[], ttl?: number, force?: boolean }} b
   * @returns {object|null} 닫을 수 있는 손잡이({ close() }) — 꺼져 있어 안 띄웠으면 null
   */
  function say(b) {
    if (!b || !b.text) return null;
    if (!host) { if (early.length < 20) early.push(b); return { close() {} }; }   // 아직 준비 전(init 앞) — 모아 두었다가 준비되면 말한다
    if (b.force && cur) {                                                        // 설정의 미리보기: 떠 있는 말풍선 뒤에서 기다리지 않는다(떠 있던 것은 차례의 맨 앞으로)
      const old = cur; for (const l of old.lines) clearTimeout(l.timer); cur = null; queue.unshift(old);
    }
    const group = b.group || 'info';
    const line = { text: String(b.text), sub: b.sub ? String(b.sub) : '', tip: b.tip ? String(b.tip) : '', id: b.id ?? null, pick: typeof b.pick === 'function' ? b.pick : null, meta: b.meta || null, ttl: b.ttl === 0 ? 0 : (b.ttl || TTL), timer: 0, closed: false };
    line.close = () => closeLine(line);
    const one = { group, tone: b.tone || 'iris', lines: [line], actions: b.actions || null };
    if (cur && cur.group === group && !cur.actions && !one.actions) {            // 같은 종류: 줄로 쌓는다(최대 4줄, 오래된 것부터 빠짐)
      while (cur.lines.length >= MAX_LINES) dropLine(cur.lines[0]);
      cur.lines.push(line); cur.tone = one.tone; if (!hovering) arm(line); renderRow();
      return line;
    }
    if (cur && away() && !hovering && (PRI[group] ?? 2) < (PRI[cur.group] ?? 2)) {
      // 안 보는 사이에 더 급한 말이 왔다(인사가 떠 있는데 작업 완료 · 약속 직전): 떠 있던 것은 차례로 돌려보내고 급한 것을 앞에 세운다 — 돌아왔을 때 급한 것부터 본다
      const old = cur; for (const l of old.lines) { clearTimeout(l.timer); l.waiting = false; } cur = null; queue.unshift(old); queue.sort((x, y) => (PRI[x.group] ?? 2) - (PRI[y.group] ?? 2));
      show(one);
      return line;
    }
    if (cur) {
      const same = one.actions ? null : queue.find((q) => q.group === group && !q.actions); // 차례를 기다리는 것끼리도 같은 종류는 한 말풍선으로(최대 4줄)
      if (same) { while (same.lines.length >= MAX_LINES) dropLine(same.lines[0]); same.lines.push(line); same.tone = one.tone; return line; }
      queue.push(one); queue.sort((x, y) => (PRI[x.group] ?? 2) - (PRI[y.group] ?? 2));
      return line;
    }
    show(one);
    return line;
  }
  function show(b) { cur = b; sayNew = true; hovering = false; for (const l of b.lines) arm(l); renderRow(); }
  // 창이 뒤에 있거나 가려진 동안에는 사라지지 않는다 — 돌아왔을 때 그때부터 시간을 센다(안 보는 사이 지나간 알림을 놓치지 않게)
  const away = () => document.hidden || document.visibilityState !== 'visible' || !document.hasFocus();
  function arm(l) {
    clearTimeout(l.timer); l.waiting = false;
    if (away()) { if (l.ttl || (l.meta && l.meta.intro)) l.waiting = true; return; }
    seen(l);
    if (!l.ttl) return;
    l.timer = setTimeout(() => (away() ? (l.waiting = true) : closeLine(l)), l.ttl);
  }
  /** 처음 한 번 소개가 실제로 화면에 보였다(창이 앞에 있고 말풍선이 떴다) — 데몬에 알려 "소개했다"고 적게 한다. 알리지 못하면 데몬이 나중에 다시 보낸다. */
  function seen(l) {
    if (!(l.meta && l.meta.intro) || l.acked) return;
    l.acked = true;
    try { fetch('/api/planner/intro-seen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => { l.acked = false; }); } catch { l.acked = false; }
  }
  function back() { if (cur && !hovering && !away()) for (const l of cur.lines) if (l.waiting) arm(l); }
  function dropLine(l) { clearTimeout(l.timer); l.closed = true; if (cur) cur.lines = cur.lines.filter((x) => x !== l); for (const q of queue) q.lines = q.lines.filter((x) => x !== l); }
  function closeLine(l) {
    if (l.closed) return;
    dropLine(l);
    for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].lines.length) queue.splice(i, 1);
    if (cur && !cur.lines.length) { cur = null; const next = queue.shift(); if (next) return show(next); }
    renderRow();
  }
  let hovering = false; // 말풍선 위에 마우스가 있는 동안은 사라지지 않는다(그사이 쌓인 줄도)
  const pause = () => { hovering = true; if (cur) for (const l of cur.lines) clearTimeout(l.timer); };
  const resume = () => { hovering = false; if (cur) for (const l of cur.lines) arm(l); };
  /** 떠 있는 것 + 차례를 기다리는 것(검사 · 설정 미리보기용) */
  const bubbles = () => [...(cur ? [cur] : []), ...queue].flatMap((b, bi) => b.lines.map((l) => ({ group: b.group, tone: b.tone, text: l.text, sub: l.sub, tip: l.tip, id: l.id, meta: l.meta, shown: bi === 0 && !!cur })));

  // ---- 데몬이 시킨 한마디(planner 방송의 say) ----
  /** 지금 「잠시 조용히」인가(설정의 끝나는 시각이 아직 안 지났다) */
  const quietOn = (c) => { const t = c && c.plannerQuietUntil ? Date.parse(c.plannerQuietUntil) : NaN; return Number.isFinite(t) && t > Date.now(); };
  /** 세션이 지우려는 것에 대한 답을 데몬에 보낸다. 결과는 말풍선으로(지웠으면 되돌리기와 함께). */
  async function answerConfirm(token, yes) {
    let r = null;
    try { const res = await fetch('/api/planner/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, yes }) }); r = await res.json(); } catch { /* 닿지 못함 */ }
    if (!r || typeof r.say !== 'string') { say({ group: 'info', tone: 'warn', text: '답을 전하지 못했어요. 달력에서 확인해 주세요.' }); return; }
    say({ group: 'info', tone: r.ok ? 'iris' : 'warn', text: r.say, actions: r.changeId ? [{ label: '되돌리기', icon: 'undo', run: () => undoChange(r.changeId) }] : null });
    if (open) load();
  }
  let introWait = 0;
  const tutorialOpen = () => { try { return !!window.Tutorial?.isOpen?.(); } catch { return false; } };
  /**
   * 플래너가 한 말(데몬이 시킨 것)만 거둔다 — 세션의 작업 알림은 그대로 둔다. 플래너를 껐을 때 · 「잠시 조용히」를 켰을 때 부른다.
   * keepAsk = 사용자의 답을 기다리는 말(세션이 지우려는 것의 확인)은 남긴다 — 조용히는 알림을 멈추는 것이지 물음을 버리는 것이 아니다.
   */
  function dropPlannerSays({ keepAsk = false } = {}) {
    clearInterval(introWait); introWait = 0;
    const mine = (b) => b.lines.length > 0 && b.lines.every((l) => l.meta && l.meta.src === 'planner' && !(keepAsk && l.meta.ask));
    for (let i = queue.length - 1; i >= 0; i--) if (mine(queue[i])) queue.splice(i, 1);
    if (cur && mine(cur)) for (const l of [...cur.lines]) closeLine(l);
  }
  function sayFromDaemon(s) {
    if (!s || typeof s.text !== 'string') return;
    const actions = (Array.isArray(s.actions) ? s.actions : []).map((a) => {
      if (a.kind === 'undo') return { label: '되돌리기', icon: 'undo', run: () => undoChange(a.changeId) };
      if (a.kind === 'open') return { label: a.label || '오늘 보기', icon: 'today', main: true, run: () => openPanel(a.day || null) };
      if (a.kind === 'folder') return { label: '폴더 열기', icon: 'folder', main: true, run: () => opts.openFolder(a.path) };
      if (a.kind === 'chat') return { icon: 'chat', tip: '이 폴더에서 대화 시작', run: () => opts.chatIn(a.path, a.prompt || '') };
      if (a.kind === 'move') return { label: '내일로 옮기기', icon: 'arrow-right', main: true, run: () => talkSend('오늘 남은 일을 내일로 옮겨 줘', { quick: 'move-rest', day: a.day || null }) };
      if (a.kind === 'proposals') return { label: '제안 보기', icon: 'bulb', main: true, run: () => { strip = true; openPanel(null); } };
      if (a.kind === 'confirm' && typeof a.token === 'string') return { label: a.label || (a.yes ? '지우기' : '그대로 두기'), icon: a.yes ? 'check' : 'close', main: !!a.yes, run: () => answerConfirm(a.token, !!a.yes) }; // 세션이 지우려는 것에 대한 답
      return null;
    }).filter(Boolean);
    const ask = (Array.isArray(s.actions) ? s.actions : []).some((a) => a && a.kind === 'confirm');
    if (s.intro) {
      // 처음 한 번 소개: 이미 들고 있으면(기다리는 중 · 떠 있음) 겹쳐 띄우지 않는다 — 데몬은 화면이 "보여 줬다"고 알릴 때까지 다시 보낸다
      if (introWait || bubbles().some((b) => b.meta && b.meta.intro)) return;
      // 「잠시 조용히」 중이면 받지 않는다(데몬이 조용히가 끝난 뒤 다시 보낸다)
      if (quietOn(cfg)) return;
      // 첫 실행 튜토리얼이 덮고 있는 동안 띄우지 않는다(뒤에서 떴다 사라지면 아무도 못 본다) — 닫힐 때까지 기다렸다가, 조금 더 오래 보인다
      if (tutorialOpen()) { introWait = setInterval(() => { if (!tutorialOpen()) { clearInterval(introWait); introWait = 0; sayFromDaemon(s); } }, 2000); return; }
    }
    say({ group: s.group || 'info', tone: s.tone || 'iris', text: s.text, sub: s.sub || '', tip: s.tip || '', actions: actions.length ? actions : null, ttl: s.sticky ? 0 : s.intro ? TTL * 2.5 : undefined, meta: { src: 'planner', intro: !!s.intro, ask } });
    // 약속 알림(os 표시가 붙은 것)은 창이 뒤에 있으면 윈도우 알림으로도 — 설정의 「윈도우 알림」을 따른다(app/notify.js 의 같은 길)
    if (s.os && away()) { try { window.Notify?.os?.({ title: s.text, sub: s.tip || '', onClick: () => openPanel(null) }); } catch { /* 알림 실패는 넘어간다 */ } }
  }

  // ---- 하는 일 ----
  function openPanel(day) { open = true; fresh = true; if (day) { sel = day; month = day.slice(0, 7); } else if (!sel && view) sel = view.today; render(); load(); }
  function closePanel() { open = false; talk = false; talkCtx = null; render(); }
  /** 대화를 접는다. 입력칸의 초점을 먼저 놓는다 — 다시 그리며 초점을 돌려주면 그 초점이 대화를 다시 열기 때문이다. */
  function foldTalk() { const inp = $('#pl-in', panelEl); if (inp) inp.blur(); talk = false; talkCtx = null; renderPanel(); }
  function openTalk() {
    if (!talk) talkFresh = true; talk = true; strip = false; focusIn = true;
    if (!thread.length) thread.push({ who: 'ai', text: '넣을 것이나 바꿀 것을 말해 주세요. 제가 달력에 정리할게요.' });
  }
  async function check(id, stepId, date, done) {
    const r = await api('/api/planner/ops', { ops: [{ op: 'check', id, done, ...(stepId ? { stepId } : {}), ...(date ? { date } : {}) }] });
    if (!r.ok) say({ group: 'info', tone: 'warn', text: r.error || '끝냄 표시를 바꾸지 못했어요.' });
    load();
  }
  async function decide(id, yes) {
    const r = await api('/api/planner/decide', { id, yes });
    if (!r.ok) say({ group: 'info', tone: 'warn', text: r.error || '제안을 처리하지 못했어요.' });
    else if (yes && r.items && r.items[0]) { sel = r.items[0].start; month = sel.slice(0, 7); for (const w of r.warnings || []) say({ group: 'info', tone: 'warn', text: w }); }
    load();
  }
  async function undoChange(changeId) {
    const r = await api('/api/planner/undo', { changeId });
    if (talk) thread.push({ who: 'ai', text: r.ok ? '방금 바꾼 것을 되돌렸어요.' : (r.error || '되돌리지 못했어요.') });
    else say({ group: 'info', tone: r.ok ? 'iris' : 'warn', text: r.ok ? '되돌렸어요.' : (r.error || '되돌리지 못했어요.') });
    for (const m of thread) if (m.undo === changeId) m.undo = null;
    load();
  }
  /** 아이리스에게 말하기. extra = { proposal?, confirm?, yes?, quick? } */
  async function talkSend(text, extra = {}) {
    const t = String(text || '').trim();
    if ((!t && !extra.confirm) || busy) return;
    if (!open) { open = true; fresh = true; }
    openTalk();
    if (t && !extra.silent) thread.push({ who: 'me', text: t });
    { const inp = $('#pl-in', panelEl); if (inp && t && inp.value.trim() === t) inp.value = ''; } // 보낸 말은 입력칸에서 비운다(다시 그릴 때 적던 글을 지키므로 여기서 먼저)
    const wait = { who: 'ai', wait: true }; thread.push(wait); busy = true; render();
    const recent = thread.filter((m) => !m.wait).slice(-7, -1).map((m) => ({ who: m.who, text: m.text }));
    const r = await api('/api/planner/talk', { text: t, day: sel, recent, ...extra });
    busy = false; thread = thread.filter((m) => m !== wait);
    for (const m of thread) { m.confirm = null; }
    if (r.status === 0 || (!r.ok && !r.say)) thread.push({ who: 'ai', text: r.error || '지금은 아이리스를 부를 수 없어요.' });
    else thread.push({ who: 'ai', text: r.say || '했어요.', cards: r.cards || [], undo: r.changeId || null, warn: r.warnings || [], confirm: r.confirm || null });
    if (r.changeId) for (const m of thread.slice(0, -1)) m.undo = null;   // 되돌리기 단추는 가장 새 것 하나에만
    if (r.goto) { sel = r.goto; month = sel.slice(0, 7); }
    load();   // 초점은 건드리지 않는다 — 입력칸에 있었으면 그대로 남고, 다른 곳으로 옮겨 갔으면 따라가지 않는다
  }
  function fixProposal(id) {
    const p = view && view.proposals.find((x) => x.id === id); if (!p) return;
    openTalk(); talkCtx = { proposal: id };
    thread.push({ who: 'ai', text: `「${p.title}」 제안을 어떻게 바꿀까요?` });
    render();
  }

  // ---- 눌림 ----
  function onClick(e) {
    const q = (s) => e.target.closest(s);
    let el;
    if ((el = q('[data-line-x]'))) { const l = cur && cur.lines[Number(el.dataset.lineX)]; if (l) closeLine(l); return; }
    if ((el = q('[data-act]'))) { const a = cur && cur.actions && cur.actions[Number(el.dataset.act)]; const b = cur; if (a) { for (const l of [...b.lines]) closeLine(l); a.run(); } return; }
    if ((el = q('[data-line]'))) { const l = cur && cur.lines[Number(el.dataset.line)]; if (l && l.pick) { closeLine(l); l.pick(l.id); } return; }
    if (q('[data-close]')) return closePanel();
    if (q('#pl-hex')) { if (open) closePanel(); else openPanel(null); return; }
    if (!open || !view) return;
    if ((el = q('[data-undo]'))) { const m = thread[Number(el.dataset.undo)]; if (m && m.undo) undoChange(m.undo); return; }
    if ((el = q('[data-yes]')) || (el = q('[data-no]'))) { const m = thread[Number(el.dataset.yes ?? el.dataset.no)]; if (m && m.confirm) talkSend('', { confirm: m.confirm, yes: 'yes' in el.dataset, silent: true }); return; }
    if (q('#pl-send')) { const inp = $('#pl-in'); const v = inp ? inp.value : ''; const c = talkCtx; talkCtx = null; return talkSend(v, c || {}); }
    if (q('[data-talk-x]')) return foldTalk();
    if (q('[data-strip]')) { strip = !strip; return renderPanel(); }
    if ((el = q('[data-acc]'))) return decide(el.dataset.acc, true);
    if ((el = q('[data-dec]'))) return decide(el.dataset.dec, false);
    if ((el = q('[data-fix]'))) return fixProposal(el.dataset.fix);
    if ((el = q('[data-work]'))) { const p = view.proposals.find((x) => x.id === el.dataset.work); if (p && p.action) opts.chatIn(p.action.folder, p.action.prompt || ''); return; }
    if ((el = q('[data-fold]'))) { const id = el.dataset.fold; if (folded.has(id)) folded.delete(id); else folded.add(id); return renderPanel(); }
    if ((el = q('[data-ck]'))) return check(el.dataset.ck, el.dataset.step || null, el.dataset.date || null, !el.classList.contains('on'));
    if ((el = q('[data-day]'))) { sel = el.dataset.day; month = sel.slice(0, 7); return load(); }
    if (q('[data-today]')) { sel = view.today; month = sel.slice(0, 7); return load(); }
    if ((el = q('[data-month]'))) { month = monthAdd(month || view.month, Number(el.dataset.month)); sel = month === view.today.slice(0, 7) ? view.today : `${month}-01`; return load(); } // 응답 전에 또 눌러도 한 달씩 더 간다
    if (q('[data-settings]')) return opts.openSettings('planner');
    if ((el = q('[data-folder]'))) return opts.openFolder(el.dataset.folder);
    if ((el = q('[data-chat]'))) return opts.chatIn(el.dataset.chat, '');
  }

  function init(o) {
    if (host) return;
    opts = { ...opts, ...o };
    const stage = $('#stage') || document.body;
    host = document.createElement('div'); host.id = 'pl'; host.className = 'pl'; stage.appendChild(host);
    panelEl = document.createElement('div'); panelEl.id = 'pl-panel'; host.appendChild(panelEl);
    rowEl = document.createElement('div'); rowEl.className = 'pl-row'; host.appendChild(rowEl);
    over = document.createElement('div'); over.id = 'pl-over'; over.className = 'pl pl-over'; over.hidden = true; document.body.appendChild(over);
    tipEl = document.createElement('div'); tipEl.id = 'pl-tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true; document.body.appendChild(tipEl);
    for (const h of [host, over]) {
      h.addEventListener('click', onClick);
      // 말풍선 · 단추는 초점을 뺏지 않는다(입력 중인 글 유지). 판 안의 입력칸만 초점을 받는다.
      h.addEventListener('pointerdown', (e) => { if (e.target.closest('button, .pl-say')) e.preventDefault(); });
      h.addEventListener('mouseover', (e) => { if (e.target.closest('.pl-say')) pause(); });
      h.addEventListener('mouseout', (e) => { if (e.target.closest('.pl-say') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.pl-say'))) resume(); });
    }
    host.addEventListener('focusin', (e) => { if (e.target.id === 'pl-in' && !talk) { openTalk(); renderPanel(); } });
    // 키 경계: 플래너 안(입력칸 · 단추)에서 누른 키는 본체로 올려 보내지 않는다 — 본체의 확인 카드(1~9 · y · n · Enter)나 단축키가 대신 눌리지 않게.
    // Esc 만 올려 보낸다(본체 onEscape 한 곳에서 "대화 → 판" 순서로 닫는다).
    for (const h of [host, over]) h.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') return;
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && e.target.id === 'pl-in') { e.preventDefault(); const c = talkCtx; talkCtx = null; talkSend(e.target.value, c || {}); }
    });
    // 한글을 조합하는 동안에는 판을 다시 그리지 않는다(조합이 끊기지 않게) — 끝나면 미뤄 둔 것을 그린다
    host.addEventListener('compositionstart', () => { composing = true; });
    host.addEventListener('compositionend', () => { composing = false; if (panelDirty) renderPanel(); });
    document.addEventListener('mouseover', overTip);
    document.addEventListener('focusin', overTip);
    document.addEventListener('scroll', hideTip, true);
    window.addEventListener('resize', () => { place(); });
    window.addEventListener('focus', back); document.addEventListener('visibilitychange', back);
    for (const b of early.splice(0)) say(b);   // 준비 전에 온 말
    try {
      const ro = new ResizeObserver(() => place());
      for (const id of ['#dock', '#sub', '#stage', '#approval', '#dead-bar']) { const el = $(id); if (el) ro.observe(el); }
      for (const id of ['#approval', '#dead-bar']) { const el = $(id); if (el) new MutationObserver(() => place()).observe(el, { attributes: true, attributeFilter: ['hidden'] }); }
      const sub = $('#sub'); if (sub) new MutationObserver(() => place()).observe(sub, { attributes: true, attributeFilter: ['hidden'] });
      // 설정 · 대시보드 서랍이 열리고 닫힐 때: 단추는 서랍 아래에 숨고, 말풍선만 구석에 뜬다
      for (const id of ['#settings', '#dash']) { const el = $(id); if (el) new MutationObserver(() => renderRow()).observe(el, { attributes: true, attributeFilter: ['hidden', 'class'] }); }
    } catch { /* 옛 환경: 창 크기 변화 때만 다시 잰다 */ }
    place(); render();
  }
  function onHello(p) { if (p && typeof p.proposals === 'number') { count = p.proposals; cfg.plannerEnabled = p.enabled !== false; renderRow(); if (open) load(); } }
  function onMessage(m) {
    if (!m) return;
    if (typeof m.proposals === 'number') count = m.proposals;
    if (m.cfg && typeof m.cfg === 'object') { try { opts.onCfg(m.cfg, m.cfgAt || null); } catch { /* 설정 화면이 아직 없음 */ } } // 데몬이 바꾼 설정(말로 "1시간 동안 알리지 마") — 화면의 설정 사본을 맞춘다
    if (m.say) sayFromDaemon(m.say);
    if (open) load(); else renderRow();
  }
  /** Esc: 대화 → 판 순서로 한 단계씩만 닫는다. 닫은 것이 있으면 true(본체는 다른 일을 하지 않는다). */
  function onEscape() {
    if (!open) return false;
    if (talk) { foldTalk(); return true; }
    closePanel(); return true;
  }
  function applySettings(c) {
    const was = cfg.plannerEnabled !== false; const wasQuiet = quietOn(cfg);
    cfg = { ...cfg, ...(c || {}) };
    if (was && cfg.plannerEnabled === false) dropPlannerSays(); // 방금 껐다: 플래너가 하던 말 · 차례를 기다리던 말을 거둔다(세션의 작업 알림은 그대로)
    else if (!wasQuiet && quietOn(cfg)) dropPlannerSays({ keepAsk: true }); // 방금 「잠시 조용히」를 켰다: 화면에 이미 와 있던 플래너의 말도 멈춘다(답을 기다리는 물음은 남긴다)
    render(); if (open) load();
  }
  /** 서랍이 열리거나 닫혔을 때(본체가 알려 준다) */
  function refresh() { place(); renderRow(); }
  return { init, onHello, onMessage, onEscape, say, bubbles, applySettings, refresh, isOpen: () => open, open: (day) => openPanel(day || null), close: closePanel };
})();
