// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 플래너 화면(설계 docs\설계-플래너-2026-11-13.md 조각 ② — 시안 8판, 2026-11-22).
   육각 단추 하나가 말풍선으로 말하고, 누르면 달력 한 화면이 펴진다. 다른 화면으로 넘어가지 않는다.
   · 셈은 하지 않는다 — 데몬이 준 한 장(GET /api/planner/view)을 그대로 그린다.
   · 넣기는 아래 칸에서 아이리스에게 말로(POST /api/planner/talk). 목록의 줄에서는 「끝냄」 체크 · 단계 접기만 바로 눌리고,
     줄을 누르면 일정 창이 떠서 그 일정의 설명을 보여 준다 — 끝냄 · 대화 이어가기 · 고치기(이름 · 기간 · 시각 · 장소 · 상대 · 메모) · 삭제는 모두 그 창에서(2026-11-23 사용자 요청).
     단계 · 반복처럼 창에 없는 고치기는 「말로 고치기」로.
   · 내용 하나에 말풍선 하나(2026-11-23). 같은 종류는 말풍선을 위로 쌓고(최대 4개), 다른 종류는 차례로(약속 직전 → 세션 확인 → 작업 완료 → 제안 → 인사).
   · 머무는 시간(2026-11-23): 중요한 말(약속 직전 · 지나감, 세션의 확인 · 물음)은 누를 때까지 남고(닫기 × 가 늘 보임), 나머지는 6초(단추 · 실패 알림은 10초) 뒤 사라진다.
     남는 말은 사라지는 말의 차례를 막지 않는다 — 단추 쪽(아래)에 남아 있고, 사라지는 말은 그 위에 함께 떴다가 간다.
   · 말풍선은 초점을 뺏지 않는다(입력 중인 글 유지). 폭은 글 길이만큼 늘어나고(최대 560px, 좁은 창에서는 남은 너비), 줄이 바뀌면 가장 긴 줄에 맞춘다.
   · 판은 두 모양(2026-11-23): 단추 위에 작게 뜨거나, 머리의 닫기 옆 단추로 무대 오른쪽 칸에 붙는다(대화 · 입력창이 그만큼 줄어 가려지지 않는다 · 왼쪽 가장자리를 끌어 너비 조절 · 고른 모양은 이 컴퓨터에 기억).
   · 화면에 이모지를 쓰지 않는다. 아이콘은 app/icons.js 이름으로만. 모든 글자는 esc() 를 거친다.
   사용: Planner.init({ openFolder, chatIn, openSession, drawerOpen }) · Planner.onHello(p) · Planner.onMessage(m) · Planner.onEscape() → bool · Planner.editing() → 일정 창이 떠 있는가
         Planner.say({ group, tone, text, sub?, tip?, id?, pick?, actions?, ttl?, force? }) · Planner.applySettings(cfg) */
window.Planner = (() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = (name) => window.Icons.svg(name, 16);
  const HEX = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9Z" style="stroke:var(--iris)" stroke-width="1.3"/><path d="M12 3v9m0 0l7.8 4.5M12 12l-7.8 4.5" style="stroke:var(--iris-2)" stroke-width="1" opacity=".7"/></svg>';
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  /* 머무는 시간(2026-11-23 사용자 결정): 중요한 말(약속 직전 · 지나감, 세션의 확인 · 물음)은 누를 때까지 남고, 나머지는 몇 초 뒤 사라진다.
     글만 있는 말 6초 · 단추가 붙었거나 실패를 알리는 말 10초 · 처음 한 번 소개 20초. 부르는 쪽이 ttl 을 주면 그 값(0 = 남음)이 먼저다. */
  const TTL = 6000, TTL_ACT = 10000, TTL_INTRO = 20000, MAX_LINES = 4, PIN_MAX = 3;
  const KEEP = new Set(['sched', 'attention']);   // 누를 때까지 남는 종류
  const ttlOf = (b) => (b.ttl === 0 ? 0 : b.ttl ? b.ttl : KEEP.has(b.group || 'info') ? 0 : (b.actions && b.actions.length) || b.tone === 'warn' ? TTL_ACT : TTL);
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
  /** 월/일: '11/24' — 기간 뱃지 · 단계의 날짜는 언제나 이 모양이다(2026-11-23 사용자 결정: 같은 달이어도 '24~28일'로 줄이지 않는다) */
  const md = (d) => `${parts(d).m}/${parts(d).d}`;
  const rangeText = (a, b) => `${md(a)}~${md(b)}`;
  const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);

  // ---- 상태 ----
  let opts = { openFolder: () => {}, chatIn: () => {}, openSession: () => {}, hasSession: () => false, openSettings: () => {}, drawerOpen: () => false, onCfg: () => {} };
  let backTo = null;          // 일정 창을 열기 전에 초점이 있던 곳(닫으면 돌려준다)
  let refocus = null, refocusAt = 0;   // 돌려줄 자리가 사라졌을 때 대신 초점을 둘 일정(줄)과 그때
  let item = null;            // 열려 있는 일정 창 { id, date, mode: 'view'|'edit', busy, fresh } — 한 번에 하나
  let editEscAt = 0;          // 방금 Esc 로 일정 창(또는 그 안의 고치기)을 닫은 때(Esc 가 두 길로 올 때 두 번째가 판까지 닫지 않게)
  let cfg = { plannerEnabled: true, plannerTalk: true, notifyDone: true };
  let host = null, over = null, tipEl = null, panelEl = null, rowEl = null, modalEl = null;
  let open = false, talk = false, strip = false, fresh = false, talkFresh = false, focusIn = false;
  let composing = false, panelDirty = false, compact = false, threadLen = 0;
  // 오른쪽 칸으로 붙이기(2026-11-23 사용자 요청): docked = 사용자가 고른 모양(다음에 열 때도 그대로 — 이 컴퓨터의 화면 기억), dockW = 칸 너비, tall = 칸이 길어 대화 중에도 달 전체를 보일 수 있다
  const DOCK_W = 420, DOCK_MIN = 340, DOCK_MAX = 720, STAGE_KEEP = 360;   // STAGE_KEEP = 칸 옆에 대화가 설 최소 너비
  let docked = false, dockW = DOCK_W, tall = false, sizing = null, wasOn = false;
  const mem = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 기억하지 못해도 화면은 그대로 */ } } };
  const stageW = () => { const s = $('#stage'); return s ? s.clientWidth : 1000; };
  /** 칸으로 붙일 자리가 있는가(좁은 창에서는 붙이지 않고 작게 띄운다) */
  const canDock = () => stageW() >= DOCK_MIN + STAGE_KEEP;
  /** 지금 실제로 칸으로 붙어 있는가 */
  const dockOn = () => docked && open && canDock();
  const dockWidth = () => Math.round(Math.max(DOCK_MIN, Math.min(dockW, DOCK_MAX, stageW() - STAGE_KEEP)));
  let sel = null, month = null, view = null, count = 0, busy = false, loadSeq = 0;
  const folded = new Set();
  let thread = [];            // { who:'me'|'ai', text, cards?, undo?, warn?, confirm?, wait? }
  let talkCtx = null;         // 「말로 고치기」로 연 대화의 대상(제안) — 판이나 대화를 닫으면 지운다
  let cur = null;             // 떠 있는 말풍선(몇 초 뒤 사라지는 것) { group, tone, lines:[…], actions }
  const pins = [];            // 누를 때까지 남는 말풍선들(최대 PIN_MAX 묶음) — cur 아래(단추 쪽)에 함께 뜬다. 남는 말이 사라지는 말의 자리를 막지 않게 따로 둔다
  const queue = [];
  /** 화면에 떠 있는 묶음들, 위 → 아래(단추 쪽). 사라지는 말이 위, 남는 말이 아래 */
  const vis = () => [...(cur ? [cur] : []), ...pins];
  const keeps = (b) => b.lines.length > 0 && b.lines.every((l) => !l.ttl);

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

  /**
   * 기간 뱃지: 며칠째 | 11/24~12/11. 날짜는 언제나 월/일이고 「N일차」는 그대로 둔다(2026-11-23 사용자 결정).
   * 단 마감일(기간의 마지막 날)에는 「N일차」를 적지 않는다 — 안 끝냈으면 「마감」만, 끝냈으면 기간만(2026-11-24 사용자 지정: 'N일차 · 마감' → '마감').
   * 마감일(기간의 마지막 날)과 지난 기간은 빨간 글자 대신 글로 말하고(「마감」 · 「N일 지남」) 달력의 마감 점과 같은 노란색으로 둔다 — 빨간색은 오류처럼 보인다는 신고.
   */
  function badge(r) {
    if (!r.period) return '';
    const p = r.period;
    const overdue = r.red && !p.last ? Math.max(1, diffDays(p.end, view.today)) : 0;
    const lead = overdue ? `${overdue}일 지남` : p.last ? (r.red ? '마감' : '') : p.index ? `${p.index}일차` : '';
    const tip = `${longDay(p.start)}부터 ${longDay(p.end)}까지${p.last ? ' · 마감일' : ''}${overdue ? ` · 마감일이 ${overdue}일 지났어요` : ''}`;
    return `<span class="pl-pill span${r.red ? ' due' : ''}" data-tip="${esc(tip)}">${lead ? `<b>${esc(lead)}</b>` : ''}${esc(rangeText(p.start, p.end))}</span>`;
  }
  /**
   * 이름 자리에 올렸을 때의 전체 내용(2026-11-23): 이름은 한 줄만 보이고 길면 잘리므로, 올리면 이름 전체(굵게) + 메모 · 장소 · 상대가 풍선으로 뜬다.
   * 덧붙일 것이 없고 이름도 잘리지 않았으면 풍선을 띄우지 않는다(showTip 이 그때의 폭을 재서 가른다).
   */
  const fullAttr = (title, o = {}) => {
    const more = [o.note || '', o.place ? `장소: ${o.place}` : '', o.who ? `상대: ${o.who}` : '', o.extra || ''].filter(Boolean).join('\n');
    return ` data-full="${esc(title)}"${more ? ` data-tip="${esc(more)}" aria-description="${esc(more)}"` : ''}`; // aria-description = 화면 낭독기에는 이름 뒤에 메모를 읽어 준다(풍선은 마우스를 올렸을 때만 뜬다)
  };
  const TIP_MAX = 400; // 풍선에 보이는 메모의 길이(넘으면 앞부분 + …) — 풍선은 스크롤할 수 없으므로 화면보다 길어지지 않게 한다
  /** 단계 한 줄(목록 · 일정 창이 같이 쓴다). 날짜는 언제나 월/일 — 고른 날의 단계는 색으로만 구별한다 */
  const stepHtml = (r, s, off) => `<div class="pl-r step${s.cur ? ' cur' : ''}${s.over ? ' over' : ''}"><span class="no" data-tip="${s.n}번째 단계">${s.n}</span>${ck(s.done, `data-ck="${esc(r.id)}" data-step="${esc(s.id)}"`, off)}<span class="tx${s.done ? ' done' : ''}"${fullAttr(s.title)}>${esc(s.title)}</span><span class="dd" data-tip="하는 날 ${esc(longDay(s.day))}${s.day === view.today ? ' · 오늘' : ''}">${esc(md(s.day))}</span></div>`;
  function rowHtml(r) {
    const off = lock();
    const dateAttr = r.repeat ? ` data-date="${esc(r.date)}"` : '';
    const late = r.late && r.lateFrom ? `<span class="pl-pill" data-tip="${esc(longDay(r.lateFrom))}에 하려던 일">${esc(md(r.lateFrom))}</span>` : '';
    // 줄을 누르면 일정 창이 뜬다(2026-11-23 사용자 요청). 올리면 나오던 대화 · 삭제 단추와 이름 두 번 클릭은 줄에서 없애고 그 창으로 옮겼다 — 줄에서 바로 눌리는 것은 체크 상자와 단계 접기 단추뿐.
    const openAttr = ` data-open="${esc(r.id)}" data-open-date="${esc(r.date)}"`;
    const title = `<span class="tx${r.done ? ' done' : ''}"${fullAttr(r.title, r)} role="button" tabindex="0" aria-haspopup="dialog">${esc(r.title)}</span>`;
    if (r.steps) {
      const isOpen = !folded.has(r.id), dn = r.steps.filter((s) => s.done).length;
      const steps = isOpen ? `<div class="pl-steps"${openAttr}>${r.steps.map((s) => stepHtml(r, s, off)).join('')}</div>` : '';
      return `<div class="pl-r"${openAttr}>${ck(r.done, `data-ck="${esc(r.id)}"`, off)}${title}<button type="button" class="pl-pill fold" data-fold="${esc(r.id)}" aria-expanded="${isOpen}" data-tip="단계 ${r.steps.length}개 가운데 ${dn}개 끝남 · 눌러서 ${isOpen ? '접기' : '펴기'}">${I(isOpen ? 'chev-up' : 'chev-down')}${dn}/${r.steps.length}</button>${badge(r)}</div>${steps}`;
    }
    return `<div class="pl-r"${openAttr}>${ck(r.done, `data-ck="${esc(r.id)}"${dateAttr}`, off)}${r.time ? `<span class="tm"${r.timeEnd ? ` data-tip="${esc(r.time)}부터 ${esc(r.timeEnd)}까지"` : ''}>${esc(r.time)}</span>` : ''}${title}${late}${badge(r)}</div>`;
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
      return `<div class="pl-r"><span class="tx"${fullAttr(p.title, { ...p, extra: tip })}>${esc(p.title)}</span><span class="pl-pill">${esc(p.end ? rangeText(p.start, p.end) : when)}${p.time ? ` ${esc(p.time)}` : ''}</span>${act}${ib('check', '달력에 추가', 'main', `data-acc="${esc(p.id)}"${off ? ' disabled' : ''}`)}${ib('chat', '말로 고치기', 'line', `data-fix="${esc(p.id)}"${off ? ' disabled' : ''}`)}${ib('close', '추가 안 함', 'line', `data-dec="${esc(p.id)}"${off ? ' disabled' : ''}`)}</div>`;
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
    const on = dockOn();
    // 닫기 옆 단추: 오른쪽 칸으로 붙이기 ↔ 다시 작게 띄우기. 붙일 자리가 없는 좁은 창에서는 두지 않는다
    const dockBtn = on ? ib('dock-float', '작게 띄우기', '', 'data-dock aria-pressed="true"') : canDock() ? ib('dock-right', '오른쪽 칸으로 붙이기', '', 'data-dock aria-pressed="false"') : '';
    const grip = on ? '<div class="pl-grip" id="pl-grip" data-tip="끌어서 너비 조절 · 두 번 클릭 = 기본 너비"></div>' : '';
    if (!view) return `${grip}<div class="pl-panel${fresh ? ' in' : ''}" role="dialog" aria-label="플래너"><div class="pl-head"><strong>플래너</strong><span class="pl-sp"></span>${dockBtn}${ib('close', '닫기', '', 'data-close')}</div>${noteHtml()}<div class="pl-list"></div></div>`;
    const rows = view.rows.map(rowHtml).join('') || '<div class="pl-empty">할 것이 없어요</div>';
    const head = `<div class="pl-head"><strong>${esc(longDay(view.day))}</strong>${view.day === view.today ? '<span class="pl-pill now">오늘</span>' : ''}<span class="pl-sp"></span>${ib('chev-left', '이전 달', '', 'data-month="-1"')}${ib('target', '오늘로', '', 'data-today')}${ib('chev-right', '다음 달', '', 'data-month="1"')}${dockBtn}${ib('close', '닫기', '', 'data-close')}</div>`;
    const talkPart = talk ? `<div class="pl-talk${talkFresh ? ' in' : ''}"><button type="button" class="pl-talk-x" data-talk-x data-tip="대화 접기" aria-label="대화 접기">${I('chev-down')}</button><div class="pl-thread" id="pl-thread" aria-live="polite">${threadHtml()}</div></div>` : '';
    const small = compact || (talk && !(on && tall));   // 달 대신 그 주만: 낮은 창이거나 대화가 열렸을 때(길게 붙은 칸에서는 대화 중에도 달 전체)
    return `${grip}<div class="pl-panel${fresh ? ' in' : ''}" role="dialog" aria-label="플래너">${head}${noteHtml()}${stripHtml()}${small ? week() : grid()}<div class="pl-list">${rows}</div>${talkPart}${footHtml()}</div>`;
  }
  /**
   * 말풍선들. 내용 하나에 말풍선 하나(2026-11-23 사용자 결정) — 같은 종류가 여럿이면 말풍선이 위로 쌓이고, 꼬리는 단추와 가장 가까운 맨 아래 것에만 둔다.
   * 누를 수 있는 것의 표시는 pl-pick 이다. 본체의 .pick(선택 상자 모양)과 이름이 겹치면 그 테두리 · 바탕이 말풍선 안으로 묻어 들어온다(같은 날 신고의 원인).
   */
  function sayHtml(blocks, isNew) {
    const says = blocks.map((b, bi) => {
      const acts = (b.actions || []).map((a, i) => (a.label ? `<button type="button" class="pl-tb${a.main ? ' main' : ''}" data-act="${i}"${a.tip ? ` data-tip="${esc(a.tip)}"` : ''}>${a.icon ? I(a.icon) : ''}${esc(a.label)}</button>` : `<button type="button" class="pl-ib line" data-act="${i}" data-tip="${esc(a.tip || '')}" aria-label="${esc(a.tip || '')}">${I(a.icon)}</button>`)).join('');
      const last = b.lines.length - 1;
      return b.lines.map((l, i) => {
        const pop = (isNew && b === cur) || l.fresh; l.fresh = false;
        const tail = bi === blocks.length - 1 && i === last;   // 꼬리는 단추와 가장 가까운 맨 아래 것 하나에만
        // keep = 누를 때까지 남는 말(닫기 × 가 늘 보인다 — 눌러야 사라진다는 표시)
        return `<div class="pl-say${pop ? ' in' : ''}${tail ? ' tail' : ''}${l.pick ? ' pl-pick' : ''}${l.ttl ? '' : ' keep'}" data-tone="${esc(l.tone || b.tone)}" data-b="${bi}" data-line="${i}"${l.tip ? ` data-tip="${esc(l.tip)}"` : ''} role="status"><div class="pl-line"><p>${esc(l.text)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</p><button type="button" class="pl-x" data-line-x="${i}" tabindex="-1" aria-label="닫기">${I('close')}</button></div>${acts && i === last ? `<div class="pl-acts">${acts}</div>` : ''}</div>`;
      }).join('');
    }).join('');
    return `<div class="pl-says">${says}</div>`;
  }
  let sayNew = false;
  /** 단추 줄(말풍선 + 육각 단추)만 다시 그린다 — 판은 건드리지 않는다. */
  function renderRow() {
    if (!host) return;
    hideTip();
    const hidden = cfg.plannerEnabled === false && cfg.notifyDone === false; // 플래너도 작업 알림도 끈 사람에게는 단추를 두지 않는다
    const covered = !!opts.drawerOpen();                                    // 설정·대시보드 서랍이 무대를 덮고 있다
    const blocks = vis(); const front = blocks[blocks.length - 1] || null;   // front = 단추와 가장 가까운 묶음(단추의 색을 정한다)
    host.hidden = (hidden && !front) || covered;                            // 다만 말하는 동안(설정의 알림 미리보기 등)은 보인다
    const say = front ? sayHtml(blocks, sayNew) : '';
    sayNew = false;
    const tone = front ? front.tone : 'rest';
    rowEl.innerHTML = `${covered ? '' : say}<button type="button" class="pl-hex${front ? ' speak' : ''}" id="pl-hex" data-tone="${esc(tone)}"${open ? '' : ' data-tip="플래너 열기"'} aria-label="플래너" aria-expanded="${open}">${HEX}${count ? `<span class="pl-cnt">${count}</span>` : ''}</button>`;
    over.hidden = !(covered && front);        // 서랍이 덮고 있으면 말풍선만 구석에(지금의 알림과 같은 자리)
    over.innerHTML = covered && front ? say : '';
    fit(over.hidden ? rowEl : over);
    // 다시 그리면 마우스 아래의 말풍선이 새것으로 바뀌어 "떠났다"는 신호가 오지 않는다(2026-11-23 고장: 하나를 닫으면 나머지 · 새로 오는 것이 영영 남았다).
    // 그래서 다시 그린 뒤에는 멈춤을 풀고 시간을 다시 센다 — 마우스가 여전히 말풍선 위에 있으면 브라우저가 곧 다시 알려 주고, 사라질 때에도 한 번 더 본다(arm).
    if (hovering) resume();
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
    if (refocus) { const at = document.activeElement; if (at && at !== document.body && at.isConnected && !onRefocusRow(at)) refocus = null; }   // 사용자가 다른 곳으로 초점을 옮겼다 — 초점 돌려주기 예약을 버린다(코덱스 마지막 확인 2)
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
    focusRow();
    fit(panelEl);
  }
  function render() { renderPanel(); renderRow(); renderModal(); }
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
  function place(redraw = true) {   // redraw = false: 부른 쪽이 바로 뒤에 다시 그린다(열기 · 닫기 · 붙이기)
    if (!host) return;
    const stage = $('#stage'), dock = $('#dock'), sub = $('#sub');
    const high = (id) => { const el = $(id); return el && !el.hidden ? el.offsetHeight : 0; };
    // 본체의 확인 카드 · 끝난 세션 띠가 떠 있으면 그 위로 올라간다(그 단추를 가리지 않게)
    const bottom = (dock ? dock.offsetHeight : 76) + high('#approval') + high('#dead-bar') + 8;
    host.style.setProperty('--pl-bottom', `${bottom}px`);
    const sw = stage ? stage.clientWidth : 1000, sh = stage ? stage.clientHeight : 800;
    // 오른쪽 칸으로 붙은 모양: 무대가 칸 너비만큼 안쪽으로 줄고(대화 · 입력창이 가려지지 않는다), 단추 · 말풍선은 칸의 왼쪽에 선다
    const on = dockOn(); const dw = on ? dockWidth() : 0;
    const flipped = on !== wasOn; wasOn = on;                  // 창 크기가 바뀌어 붙일 자리가 생기거나 없어졌다 — 머리의 단추 · 모양이 달라지므로 다시 그린다
    host.classList.toggle('docked', on);
    if (stage) { stage.classList.toggle('pl-docked', on); if (on) stage.style.setProperty('--pl-dock-w', `${dw}px`); else stage.style.removeProperty('--pl-dock-w'); }
    let shift = sub && !sub.hidden ? sub.offsetWidth : 0;
    if (sw - dw - 44 - shift < 300) shift = 0;                // 서랍 옆에 판이 설 자리가 없으면 비켜나지 않는다
    host.style.setProperty('--pl-shift', `${shift}px`);
    host.style.setProperty('--pl-w', `${Math.max(260, Math.min(440, sw - 44 - shift))}px`);   // 떠 있는 판의 너비(2026-11-23: 384 → 440 — 이름이 덜 잘리게)
    // 말풍선의 최대 폭: 560px, 창이 좁으면 남은 너비까지(화면 밖으로 나가지 않게)
    host.style.setProperty('--pl-say-max', `${Math.max(200, Math.min(560, sw - dw - shift - 22 - 48 - 14 - 16))}px`);
    if (on) {
      const was = compact, wasTall = tall; compact = sh < 520; tall = sh >= 760;
      if (redraw && open && (flipped || was !== compact || wasTall !== tall)) renderPanel();
      return;
    }
    tall = false;
    if (redraw && open && flipped) renderPanel();
    let avail = sh - bottom - 76;
    if (avail < 240) {                                         // 확인 카드가 커서 그 위에 판이 설 자리가 없다 — 판은 입력창 위(카드를 덮는 자리)로 내려오고 화면 높이 안에 맞춘다
      const base = (dock ? dock.offsetHeight : 76) + 8;
      if (open) host.style.setProperty('--pl-bottom', `${base}px`);
      avail = sh - (open ? base : bottom) - 76;
    }
    host.style.setProperty('--pl-h', `${Math.max(160, Math.min(avail, sh - 24))}px`);
    const was = compact; compact = avail < 440;               // 낮은 창에서는 달 대신 그 주만 보인다(입력칸이 잘리지 않게)
    if (redraw && was !== compact && open) renderPanel();
  }

  // ---- 설명 풍선 ----
  function hideTip() { if (tipEl) tipEl.hidden = true; }
  function showTip(el) {
    const full = el.dataset.full, more = el.dataset.tip || '';
    if (full !== undefined) {
      // 이름 자리: 이름 전체(굵게) + 메모 등. 덧붙일 것이 없고 이름이 잘리지도 않았으면 띄우지 않는다
      if (!more && !(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) return hideTip();   // 이름은 두 줄까지 보이므로(2026-11-23) 높이로도 잘렸는지 본다
      tipEl.textContent = '';
      const head = document.createElement('b'); head.textContent = full; tipEl.appendChild(head);
      if (more) { const body = document.createElement('span'); body.textContent = more.length > TIP_MAX ? `${more.slice(0, TIP_MAX)}…` : more; tipEl.appendChild(body); }
    } else {
      if (!more) return hideTip();
      tipEl.textContent = more;
    }
    tipEl.hidden = false;
    const r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - 8));
    // 위에 설 자리가 없으면 아래로, 아래도 넘치면 화면 안으로 끌어올린다(긴 메모의 풍선이 화면 밖으로 잘리지 않게)
    const y = Math.max(8, Math.min(r.top - t.height - 8 < 8 ? r.bottom + 8 : r.top - t.height - 8, window.innerHeight - t.height - 8));
    tipEl.style.left = `${x}px`; tipEl.style.top = `${y}px`;
  }
  const overTip = (e) => { const el = e.target.closest && e.target.closest('.pl [data-tip], .pl [data-full]'); if (el) showTip(el); else hideTip(); };

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
    const line = { text: String(b.text), sub: b.sub ? String(b.sub) : '', tip: b.tip ? String(b.tip) : '', id: b.id ?? null, pick: typeof b.pick === 'function' ? b.pick : null, meta: b.meta || null, ttl: ttlOf(b), timer: 0, closed: false, tone: b.tone || 'iris', fresh: false };
    line.close = () => closeLine(line);
    const one = { group, tone: b.tone || 'iris', lines: [line], actions: b.actions || null };
    if (!line.ttl) return pin(one, line);                                        // 누를 때까지 남는 말: 사라지는 말의 차례와 따로, 단추 쪽에 함께 뜬다
    if (cur && cur.group === group && !cur.actions && !one.actions) {            // 같은 종류: 말풍선을 위로 쌓는다(최대 4개, 오래된 것부터 빠짐)
      while (cur.lines.length >= MAX_LINES) dropLine(cur.lines[0]);
      cur.lines.push(line); cur.tone = one.tone; line.fresh = true; if (!hovering) arm(line); renderRow();
      return line;
    }
    if (cur && away() && !hovering && (PRI[group] ?? 2) < (PRI[cur.group] ?? 2)) {
      // 안 보는 사이에 더 급한 말이 왔다(인사가 떠 있는데 작업 완료 · 약속 직전): 떠 있던 것은 차례로 돌려보내고 급한 것을 앞에 세운다 — 돌아왔을 때 급한 것부터 본다
      const old = cur; for (const l of old.lines) { clearTimeout(l.timer); l.waiting = false; } cur = null; queue.unshift(old); queue.sort((x, y) => (PRI[x.group] ?? 2) - (PRI[y.group] ?? 2));
      show(one);
      return line;
    }
    if (cur) {
      const same = one.actions ? null : queue.find((q) => q.group === group && !q.actions && !keeps(q)); // 차례를 기다리는 것끼리도 같은 종류는 한 말풍선으로(최대 4줄)
      if (same) { while (same.lines.length >= MAX_LINES) dropLine(same.lines[0]); same.lines.push(line); same.tone = one.tone; return line; }
      queue.push(one); queue.sort((x, y) => (PRI[x.group] ?? 2) - (PRI[y.group] ?? 2));
      return line;
    }
    show(one);
    return line;
  }
  /**
   * 누를 때까지 남는 말을 세운다. 같은 종류(단추 없는 것끼리)는 한 묶음에 위로 쌓고(최대 4개), 묶음은 급한 것이 단추 쪽(아래)에 오게 놓는다.
   * 묶음이 PIN_MAX 를 넘으면 차례를 기다렸다가 자리가 나면 올라온다(closeLine).
   */
  function pin(one, line) {
    const same = one.actions ? null : pins.find((p) => p.group === one.group && !p.actions);
    if (same) { while (same.lines.length >= MAX_LINES) dropLine(same.lines[0]); same.lines.push(line); same.tone = one.tone; line.fresh = true; renderRow(); return line; }
    if (pins.length >= PIN_MAX) { queue.push(one); queue.sort((x, y) => (PRI[x.group] ?? 2) - (PRI[y.group] ?? 2)); return line; }
    line.fresh = true; pins.push(one); pins.sort((x, y) => (PRI[y.group] ?? 2) - (PRI[x.group] ?? 2));
    renderRow();
    return line;
  }
  function show(b) { cur = b; sayNew = true; hovering = false; for (const l of b.lines) arm(l); renderRow(); }
  // 창이 뒤에 있거나 가려진 동안에는 사라지지 않는다 — 돌아왔을 때 그때부터 시간을 센다(안 보는 사이 지나간 알림을 놓치지 않게)
  const away = () => document.hidden || document.visibilityState !== 'visible' || !document.hasFocus();
  /** 지금 마우스가 정말 말풍선 더미 위에 있는가 — 기억해 둔 표시(hovering)가 아니라 화면에 직접 묻는다 */
  const overSays = () => { try { return !!document.querySelector('.pl-says:hover'); } catch { return false; } };
  function arm(l) {
    clearTimeout(l.timer); l.waiting = false;
    if (away()) { if (l.ttl || (l.meta && l.meta.intro)) l.waiting = true; return; }
    seen(l);
    if (!l.ttl) return;
    l.timer = setTimeout(() => {
      if (away()) { l.waiting = true; return; }
      if (overSays()) { pause(); return; }      // 사라질 때가 됐는데 마우스가 올라가 있다 — 멈췄다가, 떠나면 그때부터 다시 센다
      closeLine(l);
    }, l.ttl);
  }
  /** 처음 한 번 소개가 실제로 화면에 보였다(창이 앞에 있고 말풍선이 떴다) — 데몬에 알려 "소개했다"고 적게 한다. 알리지 못하면 데몬이 나중에 다시 보낸다. */
  function seen(l) {
    if (!(l.meta && l.meta.intro) || l.acked) return;
    l.acked = true;
    try { fetch('/api/planner/intro-seen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => { l.acked = false; }); } catch { l.acked = false; }
  }
  function back() { if (cur && !hovering && !away()) for (const l of cur.lines) if (l.waiting) arm(l); }
  function dropLine(l) { clearTimeout(l.timer); l.closed = true; if (cur) cur.lines = cur.lines.filter((x) => x !== l); for (const q of [...pins, ...queue]) q.lines = q.lines.filter((x) => x !== l); }
  function closeLine(l) {
    if (l.closed) return;
    dropLine(l);
    for (const list of [queue, pins]) for (let i = list.length - 1; i >= 0; i--) if (!list[i].lines.length) list.splice(i, 1);
    // 남는 말의 자리가 났으면 기다리던 남는 말을 올린다
    for (let i = 0; i < queue.length && pins.length < PIN_MAX;) { if (keeps(queue[i])) { const b = queue.splice(i, 1)[0]; for (const x of b.lines) x.fresh = true; pins.push(b); } else i++; }
    pins.sort((x, y) => (PRI[y.group] ?? 2) - (PRI[x.group] ?? 2));
    if (cur && !cur.lines.length) cur = null;
    if (!cur) { const i = queue.findIndex((q) => !keeps(q)); if (i >= 0) return show(queue.splice(i, 1)[0]); }
    renderRow();
  }
  let hovering = false; // 말풍선 위에 마우스가 있는 동안은 사라지지 않는다(그사이 쌓인 줄도)
  const pause = () => { hovering = true; if (cur) for (const l of cur.lines) clearTimeout(l.timer); };
  const resume = () => { hovering = false; if (cur) for (const l of cur.lines) arm(l); };
  /** 떠 있는 것 + 차례를 기다리는 것(검사 · 설정 미리보기용) */
  const bubbles = () => { const up = vis(); return [...up, ...queue].flatMap((b) => b.lines.map((l) => ({ group: b.group, tone: b.tone, text: l.text, sub: l.sub, tip: l.tip, id: l.id, meta: l.meta, keep: !l.ttl, ttl: l.ttl, shown: up.includes(b) }))); };

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
    for (const b of vis()) if (mine(b)) for (const l of [...b.lines]) closeLine(l);
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
    const askAct = (Array.isArray(s.actions) ? s.actions : []).find((a) => a && a.kind === 'confirm' && typeof a.token === 'string');
    const ask = !!askAct; const token = askAct ? askAct.token : null;
    // 같은 물음을 두 번 띄우지 않는다(조용히가 끝나 다시 온 것 · 다시 붙으며 되살린 것이 이미 떠 있는 경우)
    if (token && bubbles().some((b) => b.meta && b.meta.token === token)) return;
    if (s.intro) {
      // 처음 한 번 소개: 이미 들고 있으면(기다리는 중 · 떠 있음) 겹쳐 띄우지 않는다 — 데몬은 화면이 "보여 줬다"고 알릴 때까지 다시 보낸다
      if (introWait || bubbles().some((b) => b.meta && b.meta.intro)) return;
      // 「잠시 조용히」 중이면 받지 않는다(데몬이 조용히가 끝난 뒤 다시 보낸다)
      if (quietOn(cfg)) return;
      // 첫 실행 튜토리얼이 덮고 있는 동안 띄우지 않는다(뒤에서 떴다 사라지면 아무도 못 본다) — 닫힐 때까지 기다렸다가, 조금 더 오래 보인다
      if (tutorialOpen()) { introWait = setInterval(() => { if (!tutorialOpen()) { clearInterval(introWait); introWait = 0; sayFromDaemon(s); } }, 2000); return; }
    }
    say({ group: s.group || 'info', tone: s.tone || 'iris', text: s.text, sub: s.sub || '', tip: s.tip || '', actions: actions.length ? actions : null, ttl: s.sticky ? 0 : s.intro ? TTL_INTRO : undefined, meta: { src: 'planner', intro: !!s.intro, ask, token } });
    // 약속 알림(os 표시가 붙은 것)은 창이 뒤에 있으면 윈도우 알림으로도 — 설정의 「윈도우 알림」을 따른다(app/notify.js 의 같은 길)
    if (s.os && away()) { try { window.Notify?.os?.({ title: s.text, sub: s.tip || '', onClick: () => openPanel(null) }); } catch { /* 알림 실패는 넘어간다 */ } }
  }

  // ---- 하는 일 ----
  function openPanel(day) { open = true; fresh = true; if (day) { sel = day; month = day.slice(0, 7); } else if (!sel && view) sel = view.today; place(false); render(); load(); }
  function closePanel() { open = false; talk = false; talkCtx = null; item = null; backTo = null; refocus = null; place(false); render(); }
  /** 닫기 옆 단추: 오른쪽 칸으로 붙이기 ↔ 작게 띄우기. 고른 모양은 이 컴퓨터에 기억해 다음에 열 때도 그대로다. */
  function toggleDock() {
    docked = !dockOn(); mem.set('iris.planner.dock', docked ? '1' : '0');
    fresh = true; place(false); render();
  }
  /** 칸의 왼쪽 가장자리를 끌어 너비를 바꾼다(두 번 클릭 = 기본 너비). */
  function gripDown(e) {
    if (!e.target.closest || !e.target.closest('.pl-grip') || !dockOn()) return;
    e.preventDefault();
    const stage = $('#stage'); if (!stage) return;
    sizing = { right: stage.getBoundingClientRect().right };
    host.classList.add('resizing');
    try { e.target.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 창의 움직임으로 따라간다 */ }
    const move = (ev) => { if (!sizing) return; dockW = sizing.right - ev.clientX; place(); };
    const up = () => { sizing = null; host.classList.remove('resizing'); dockW = dockWidth(); mem.set('iris.planner.dockW', String(dockW)); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
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
  // ---- 일정 창(2026-11-23 사용자 요청): 목록의 줄을 누르면 화면 가운데에 뜬다. 그 일정의 설명을 보여 주고, 끝냄 · 대화 이어가기 · 고치기 · 삭제를 모두 여기서 한다 ----
  /** 일정 창이 보여 주는 줄(지금 달력 자료에서 찾는다 — 그 줄이 사라졌으면 null) */
  const rowOfItem = () => (item && view ? view.rows.find((r) => r.id === item.id && r.date === item.date) || view.rows.find((r) => r.id === item.id) || null : null);
  // 그 일의 처음 · 마지막 날. 데몬이 실어 주지만(start · end), 옛 데몬이 준 자료에서는 기간 · 밀린 날 · 고른 날로 가늠한다
  const startOf = (r) => r.start || (r.period ? r.period.start : r.lateFrom || r.date);
  const lastOf = (r) => r.end || (r.period ? r.period.end : startOf(r));
  const metaRow = (icon, html) => `<div class="pl-m-row">${I(icon)}<div>${html}</div></div>`;
  function itemViewHtml(r) {
    const off = lock();
    const s = startOf(r), e = lastOf(r);
    const when = r.repeat ? `<b>${esc(longDay(r.date))}</b><small>반복하는 일</small>` : e !== s ? `<b>${esc(longDay(s))} ~ ${esc(longDay(e))}</b><small>${diffDays(s, e) + 1}일 동안</small>` : `<b>${esc(longDay(s))}</b>`;
    const left = !r.done && r.period && !r.late ? diffDays(view.today, r.period.end) : 0;
    const tags = [badge(r), left > 0 ? `<span class="pl-pill">마감까지 ${left}일</span>` : '', r.late && !r.period ? '<span class="pl-pill due">하려던 날이 지남</span>' : '', r.done ? '<span class="pl-pill ok">끝냄</span>' : ''].filter(Boolean).join('');
    const body = [metaRow('calendar', when),
      r.time ? metaRow('clock', `<b>${esc(r.time)}${r.timeEnd ? ` ~ ${esc(r.timeEnd)}` : ''}</b>`) : '',
      r.place ? metaRow('pin', `<b>${esc(r.place)}</b>`) : '',
      r.who ? metaRow('people', `<b>${esc(r.who)}</b>`) : '',
      r.note ? metaRow('note', `<p class="pl-m-note">${esc(r.note)}</p>`) : ''].join('');
    const steps = r.steps ? `<div class="pl-m-steps">${r.steps.map((st) => stepHtml(r, st, off)).join('')}</div>` : '';
    const goSession = r.session && opts.hasSession(r.session);
    const chat = goSession ? `<button type="button" class="pl-tb main" data-m-chat data-tip="이 일정을 넣은 대화로 갑니다">${I('chat')}대화 이어가기</button>`
      : r.folder ? `<button type="button" class="pl-tb main" data-m-chat data-tip="연결 폴더에서 새 대화를 엽니다">${I('chat')}새 대화 열기</button>` : '';
    return `<div class="pl-m-hd">${ck(r.done, `data-ck="${esc(r.id)}"${r.repeat ? ` data-date="${esc(r.date)}"` : ''}`, off)}<h3 class="pl-m-ti${r.done ? ' done' : ''}">${esc(r.title)}</h3>${ib('close', '닫기', '', 'data-m-close')}</div>`
      + `<div class="pl-m-scroll">${tags ? `<div class="pl-m-tags">${tags}</div>` : ''}<div class="pl-m-bd">${body}</div>${steps}</div>`
      + `<div class="pl-m-ft">${chat}<button type="button" class="pl-tb" data-m-edit${off ? ' disabled' : ''}>${I('pencil')}고치기</button><span class="pl-sp"></span><button type="button" class="pl-tb del" data-m-del data-tip="${r.repeat ? '반복하는 일 전체를 휴지통으로' : '휴지통으로(되돌릴 수 있어요)'}"${off ? ' disabled' : ''}>${I('trash')}삭제</button></div>`;
  }
  function itemEditHtml(r) {
    const s = startOf(r), e = lastOf(r);
    const dates = r.repeat ? '<p class="pl-m-hint">반복하는 일의 날짜와 반복 규칙은 「말로 고치기」로 바꿔 주세요.</p>'
      : `<label><span>기간</span><span class="pl-m-two"><input type="date" id="pl-m-start" value="${esc(s)}" aria-label="시작하는 날"><i>~</i><input type="date" id="pl-m-end" value="${esc(e !== s ? e : '')}" aria-label="끝나는 날(하루짜리면 비워 둠)"></span></label>`;
    return `<div class="pl-m-hd"><input type="text" id="pl-m-title" class="pl-m-in" value="${esc(r.title)}" maxlength="200" aria-label="일정 이름" autocomplete="off">${ib('close', '닫기', '', 'data-m-close')}</div>`
      + `<div class="pl-m-scroll"><div class="pl-m-form">${dates}`
      + `<label><span>시각</span><span class="pl-m-two"><input type="time" id="pl-m-time" value="${esc(r.time || '')}" aria-label="시작 시각"><i>~</i><input type="time" id="pl-m-time-end" value="${esc(r.timeEnd || '')}" aria-label="끝 시각"></span></label>`
      + `<label><span>장소</span><input type="text" id="pl-m-place" value="${esc(r.place || '')}" maxlength="2000" autocomplete="off"></label>`
      + `<label><span>상대</span><input type="text" id="pl-m-who" value="${esc(r.who || '')}" maxlength="2000" autocomplete="off"></label>`
      + `<label class="top"><span>메모</span><textarea id="pl-m-note" rows="4" maxlength="2000">${esc(r.note || '')}</textarea></label></div>`
      + `<p class="pl-m-err" id="pl-m-err" role="alert" hidden></p></div>`
      + `<div class="pl-m-ft"><button type="button" class="pl-tb main" data-m-save>${I('check')}저장</button><button type="button" class="pl-tb" data-m-cancel>취소</button><span class="pl-sp"></span><button type="button" class="pl-tb" data-m-talk data-tip="단계 · 반복처럼 여기 없는 것은 아이리스에게 말로">${I('chat')}말로 고치기</button></div>`;
  }
  /** 일정 창을 다시 그린다. 고치는 중에는 다시 그리지 않는다(적던 글 · 커서 · 한글 조합을 지킨다) — force 일 때만. */
  function renderModal(force) {
    if (!modalEl) return;
    const r = open ? rowOfItem() : null;
    if (!r) { item = null; if (!modalEl.hidden) { modalEl.hidden = true; modalEl.innerHTML = ''; } return; }   // 그 줄이 사라졌다(지워짐 · 다른 날로 감 · 판을 닫음)
    if (item.mode === 'edit' && lock()) { item.mode = 'view'; force = true; }                                  // 고치는 사이 플래너가 꺼졌거나 볼 수만 있게 됐다 — 저장하지 않고 보기로
    if (item.mode === 'edit' && !force && $('#pl-m-title', modalEl)) return;
    const sc0 = $('.pl-m-scroll', modalEl); const top = sc0 ? sc0.scrollTop : 0;
    hideTip();
    modalEl.innerHTML = `<div class="pl-m${force && item.fresh ? ' in' : ''}" role="dialog" aria-modal="true" aria-label="일정" tabindex="-1">${item.mode === 'edit' ? itemEditHtml(r) : itemViewHtml(r)}</div>`;
    modalEl.hidden = false; item.fresh = false;
    const sc = $('.pl-m-scroll', modalEl); if (sc && !force) sc.scrollTop = top;
    if (force) { const f = item.mode === 'edit' ? $('#pl-m-title', modalEl) : $('.pl-m', modalEl); try { if (f) { f.focus(); if (item.mode === 'edit') f.select(); } } catch { /* 초점을 못 줘도 그대로 */ } }
  }
  function openItem(id, date) { if (!view || !id) return; backTo = document.activeElement; item = { id, date: date || view.day, mode: 'view', busy: false, fresh: true, at: Date.now() }; renderModal(true); }
  /** 창을 닫는다(× · Esc · 바깥 · 저장 · 삭제 모두 이 길). 초점은 창을 열기 전 자리로 — 그 자리가 사라졌으면(달력이 다시 그려짐) 그 일정의 줄로 돌려준다. */
  function closeItem() {
    if (!item) return;
    const id = item.id, prev = backTo; item = null; backTo = null; renderModal(true);
    try {
      if (prev && prev.isConnected && prev !== document.body && !prev.disabled && prev.offsetParent !== null) {
        prev.focus({ preventScroll: true });
        if (prev.closest && prev.closest('.pl-list')) { refocus = id; refocusAt = Date.now(); }   // 목록의 줄로 돌려준 경우: 곧 달력이 다시 그려지면 그 줄이 새것으로 바뀐다 — 그때도 따라가게 예약을 남긴다
        return;
      }
    } catch { /* 돌아갈 자리가 사라졌다 */ }
    refocus = id; refocusAt = Date.now(); focusRow();
  }
  /** 그 요소가 초점을 돌려줄 일정의 줄 안에 있는가 */
  const onRefocusRow = (el) => { const row = el && el.closest ? el.closest('.pl-list [data-open]') : null; return !!row && row.dataset.open === refocus; };
  /** 창을 닫은 뒤 초점이 갈 곳을 잃었으면(아무 데도 없으면) 그 일정의 줄 이름에 둔다 — 달력이 다시 그려진 직후에도 한 번 더 본다 */
  function focusRow() {
    if (!refocus || item || !panelEl) return;
    if (Date.now() - refocusAt > 1500) { refocus = null; return; }
    const at = document.activeElement;
    if (at && at !== document.body && at.isConnected) { if (!onRefocusRow(at)) refocus = null; return; }   // 사용자가 그사이 다른 곳에 초점을 뒀다 — 뺏지 않고 예약도 버린다
    const row = [...panelEl.querySelectorAll('.pl-list > .pl-r[data-open]')].find((x) => x.dataset.open === refocus);
    const el = row && row.querySelector('.tx');
    try { if (el) el.focus({ preventScroll: true }); } catch { /* 초점을 못 줘도 그대로 */ }
  }
  /** 일정 창 안에서 초점을 받을 수 있는 것들(Tab 이 창 밖으로 나가지 않게 돌린다) */
  const tabStops = () => [...modalEl.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')].filter((el) => el.offsetParent !== null);
  /**
   * 일정 창이 떠 있는 동안의 키 경계(코덱스 검토 4). 창은 화면을 덮는 모달이라 그 밖의 것은 누를 수 없어야 한다:
   * Tab 은 창 안에서만 돌고, 초점이 창 밖에 있을 때 난 키는 본체(확인 카드 1~9 · y · n · Enter · 단축키)로 가지 않게 막고 초점을 창으로 데려온다. Esc 만 예외(본체 onEscape 가 창을 닫는다).
   */
  function modalKeys(e) {
    if (!item || !modalEl || modalEl.hidden || e.key === 'Escape' || e.code === 'Escape') return;
    const inside = modalEl.contains(e.target);
    if (e.key === 'Tab') {
      const stops = tabStops(); if (!stops.length) { e.preventDefault(); return; }
      const first = stops[0], last = stops[stops.length - 1], at = document.activeElement;
      if (!inside || !stops.includes(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      return;
    }
    if (inside) return;
    e.stopPropagation(); e.preventDefault();
    try { const d = $('.pl-m', modalEl); if (d) d.focus(); } catch { /* 초점을 못 줘도 키는 막았다 */ }
  }
  function editItem() {
    const r = rowOfItem(); if (!item || !r || lock()) return;
    // 고치기를 시작한 때의 값(코덱스 검토 3): 저장할 때 이것과 견줘 사용자가 바꾼 칸만 보낸다 — 고치는 사이 다른 세션이 바꾼 칸을 옛 값으로 덮지 않게
    item.orig = { title: r.title, start: startOf(r), end: lastOf(r), time: r.time || '', timeEnd: r.timeEnd || '', place: r.place || '', who: r.who || '', note: r.note || '' };
    item.mode = 'edit'; renderModal(true);
  }
  function viewItem() { if (!item) return; item.mode = 'view'; renderModal(true); }
  /** 「저장」: 사용자가 바꾼 칸만 보낸다(고치기를 시작한 때의 값과 견준다). 실패하면 창을 그대로 두고 사유를 적는다(적던 글을 지우지 않는다). */
  async function saveItem() {
    const me = item; const r = rowOfItem();
    if (!r || !me || me.mode !== 'edit' || me.busy || lock()) return;
    const o = me.orig || { title: r.title, start: startOf(r), end: lastOf(r), time: r.time || '', timeEnd: r.timeEnd || '', place: r.place || '', who: r.who || '', note: r.note || '' };
    const val = (id) => { const el = $(`#${id}`, modalEl); return el ? String(el.value ?? '') : ''; };
    const one = (v) => v.replace(/\s+/g, ' ').trim();
    const fail = (msg) => { const el = $('#pl-m-err', modalEl); if (el) { el.textContent = msg; el.hidden = false; } };
    const patch = {};
    const title = one(val('pl-m-title')); if (!title) return fail('이름이 비어 있어요.');
    if (title !== o.title) patch.title = title;
    let s = startOf(r), e = lastOf(r);                            // 지금 장부의 기간(고치는 사이 다른 세션이 바꿨을 수 있다)
    if (!r.repeat) {
      const s1 = val('pl-m-start'), endRaw = val('pl-m-end');
      if (!s1) return fail('시작하는 날을 골라 주세요.');
      // 시작 · 끝 칸을 따로 본다(코덱스 재검토 1): 손대지 않은 쪽은 보내지 않는다 — 시작만 고쳤는데 그사이 다른 세션이 바꾼 끝 날을 옛 값으로 되돌리지 않게
      const sTouched = s1 !== o.start, eTouched = endRaw !== (o.end !== o.start ? o.end : '');
      if (sTouched || eTouched) {
        const single = e === s;                                    // 지금 하루짜리인가(끝 칸을 안 건드렸으면 하루짜리는 하루짜리로 따라간다)
        const fs = sTouched ? s1 : s;
        const fe = eTouched ? (endRaw || fs) : (single ? fs : e);
        if (fe < fs) return fail('끝나는 날이 시작하는 날보다 앞이에요.');
        // 단계가 새 기간 밖에 있으면 장부가 기간을 단계까지 다시 늘린다 — "고쳤어요"라고 해 놓고 그대로인 일이 없게 미리 막는다(코덱스 검토 2)
        const out = (r.steps || []).filter((st) => st.day < fs || st.day > fe);
        if (out.length) return fail(`단계 「${out[0].title}」(${md(out[0].day)})${out.length > 1 ? ` 등 ${out.length}개` : ''}가 그 기간 밖에 있어요. 단계의 날짜는 「말로 고치기」로 함께 바꿔 주세요.`);
        if (sTouched) patch.start = s1;
        if (eTouched) patch.end = fe !== fs ? fe : null;
        s = fs; e = fe;
      }
    }
    const t = val('pl-m-time'), te = val('pl-m-time-end');
    if (te && !t) return fail('끝 시각만 있어요. 시작 시각도 적어 주세요.');
    if (t !== o.time) patch.time = t || null;
    if (te !== o.timeEnd) patch.timeEnd = te || null;
    for (const [k, id] of [['place', 'pl-m-place'], ['who', 'pl-m-who']]) { const v = one(val(id)); if (v !== o[k]) patch[k] = v || null; }
    { const v = val('pl-m-note').trim(); if (v !== o.note) patch.note = v || null; }
    if (!Object.keys(patch).length) return viewItem();           // 바꾼 것이 없다
    me.busy = true;
    const res = await api('/api/planner/ops', { ops: [{ op: 'update', id: r.id, patch }] });
    me.busy = false;
    // 답을 기다리는 사이 이 창을 닫았거나 다른 일정의 창을 열었다(코덱스 검토 1): 지금 떠 있는 창은 건드리지 않고, 결과만 말풍선으로 알린다
    const mine = item === me;
    if (!res.ok) {
      const why = res.code === 'panel-check-only' && Object.keys(patch).some((k) => k !== 'title')
        ? '지금 켜져 있는 IRIS 는 창에서 이름만 고칠 수 있어요. IRIS 를 다시 켜면(전부 종료 뒤 다시 실행) 여기서 바로 고칠 수 있습니다.' : (res.error || '고치지 못했어요.');
      if (mine) fail(why); else say({ group: 'info', tone: 'warn', text: `「${o.title}」 일정을 고치지 못했어요.`, sub: why });
      return;
    }
    if (mine) {
      closeItem();                                               // 저장했으면 창을 닫는다 — 「되돌리기」 말풍선이 창의 어두운 바탕 뒤에 가려지지 않게
      if (!r.repeat && ('start' in patch || 'end' in patch) && !(sel >= s && sel <= e)) { sel = s; month = s.slice(0, 7); }   // 고른 날에 이 일이 더는 없으면 그 일이 시작하는 날로 따라간다
    }
    say({ group: 'info', tone: 'iris', text: `「${title}」 일정을 고쳤어요.`, actions: res.changeId ? [{ label: '되돌리기', icon: 'undo', run: () => undoChange(res.changeId) }] : null });
    load();
  }
  /** 「말로 고치기」: 창을 닫고 아이리스 대화를 연다. 입력칸에 그 일정의 이름을 미리 적어 둔다(보내기는 직접). */
  function talkAbout() {
    const r = rowOfItem(); if (!r) return;
    item = null; openTalk();
    thread.push({ who: 'ai', text: `「${r.title}」 일정을 어떻게 바꿀까요?` });
    render();
    const inp = $('#pl-in', panelEl);
    if (inp && !inp.disabled) { inp.value = `「${r.title}」 일정 `; try { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } catch { /* 잠긴 칸 */ } }
  }
  /** 일정 삭제: 휴지통으로 옮기고 되돌리기를 함께 보인다. 반복하는 일은 전체가 지워지므로 먼저 묻는다. */
  function removeItem(id) {
    if (lock() || !view) return;
    const row = view.rows.find((r) => r.id === id); if (!row) return;
    if (!row.repeat) return doRemove(id, row.title);
    say({ group: 'attention', tone: 'warn', ttl: 0, text: `「${row.title}」 일정은 반복하는 일이에요. 전체를 지울까요?`, sub: '이 날 것만 빼려면 아이리스에게 말해 주세요.', actions: [{ label: '전체 지우기', icon: 'trash', main: true, run: () => doRemove(id, row.title) }, { label: '그대로 두기', icon: 'close', run: () => {} }] });
  }
  async function doRemove(id, title) {
    const r = await api('/api/planner/ops', { ops: [{ op: 'remove', id }] });
    if (!r.ok) say({ group: 'info', tone: 'warn', text: r.error || '일정을 지우지 못했어요.' });
    else say({ group: 'info', tone: 'iris', text: `「${title}」 일정을 지웠어요.`, sub: '휴지통에 30일 동안 남아 있어요.', actions: r.changeId ? [{ label: '되돌리기', icon: 'undo', run: () => undoChange(r.changeId) }] : null });
    load();
  }
  /** 대화 열기: 이 일을 넣은 대화가 아직 있으면 그 대화로, 없으면 연결 폴더에서 새 대화(요청문은 비워 둔다). */
  function openChat(session, folder) {
    if (session && opts.hasSession(session)) return opts.openSession(session);
    if (folder) return opts.chatIn(folder, '');
    say({ group: 'info', tone: 'warn', text: '이 일정을 넣은 대화가 이제 없어요.' });
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
    const blk = (x) => { const s = x.closest('.pl-say'); return (s && vis()[Number(s.dataset.b)]) || null; };   // 누른 말풍선이 든 묶음
    if ((el = q('[data-line-x]'))) { const b = blk(el); const l = b && b.lines[Number(el.dataset.lineX)]; if (l) closeLine(l); return; }
    if ((el = q('.pl-say [data-act]'))) { const b = blk(el); const a = b && b.actions && b.actions[Number(el.dataset.act)]; if (a) { for (const l of [...b.lines]) closeLine(l); a.run(); } return; }
    if ((el = q('[data-line]'))) { const b = blk(el); const l = b && b.lines[Number(el.dataset.line)]; if (l && l.pick) { closeLine(l); l.pick(l.id); } return; }
    if (q('[data-close]')) return closePanel();
    if (q('[data-dock]')) return toggleDock();
    if (q('#pl-hex')) { if (open) closePanel(); else openPanel(null); return; }
    if (!open || !view) return;
    if (item) {   // 일정 창이 떠 있는 동안: 창 안의 단추들. 창 바깥(어두운 자리)을 누르면 닫는다
      if (e.target === modalEl) { if (Date.now() - item.at < 400) return; return closeItem(); }   // 바깥 누르기 = 닫기. 다만 줄을 두 번 클릭했을 때의 두 번째 클릭(방금 뜬 창의 바깥에 떨어진다)은 닫지 않는다
      if (q('[data-m-close]')) return closeItem();
      if (q('[data-m-edit]')) return editItem();
      if (q('[data-m-save]')) return saveItem();
      if (q('[data-m-cancel]')) return viewItem();
      if (q('[data-m-talk]')) return talkAbout();
      if (q('[data-m-del]')) { const id = item.id; closeItem(); return removeItem(id); }
      if (q('[data-m-chat]')) { const r = rowOfItem(); closeItem(); if (r) openChat(r.session, r.folder); return; }
    }
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
    if ((el = q('[data-open]'))) return openItem(el.dataset.open, el.dataset.openDate);   // 목록의 줄(이름 · 뱃지 · 빈자리 · 단계)을 눌렀다 → 일정 창
  }
  /** 칸의 가장자리를 두 번 클릭 = 기본 너비(이름 두 번 클릭 고치기는 2026-11-23 일정 창으로 옮겼다) */
  function onDblClick(e) {
    if (e.target.closest('.pl-grip')) { dockW = DOCK_W; mem.set('iris.planner.dockW', String(DOCK_W)); place(); }
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
    // 일정 창: 화면 전체를 덮는 어두운 바탕 + 가운데 창. 판(#pl) 밖 body 에 둔다 — 작은 판 · 오른쪽 칸 어느 모양에서도 화면 가운데에 뜨게
    modalEl = document.createElement('div'); modalEl.id = 'pl-modal'; modalEl.className = 'pl pl-modal'; modalEl.hidden = true; document.body.appendChild(modalEl);
    for (const h of [host, over, modalEl]) {
      h.addEventListener('click', onClick);
      // 말풍선 · 단추는 초점을 뺏지 않는다(입력 중인 글 유지). 판 안의 입력칸만 초점을 받는다.
      h.addEventListener('pointerdown', (e) => { if (e.target.closest('button, .pl-say, .pl-list [data-open]')) e.preventDefault(); });   // 목록의 줄도(2026-11-23): 눌러서 일정 창을 열어도 쓰던 입력칸의 초점이 그대로라, 창을 닫으면 거기로 돌아간다
      // 말풍선 더미(.pl-says) 위에 있는 동안은 멈춘다 — 말풍선 사이의 틈을 지날 때 풀렸다 걸렸다 하지 않게 더미 전체로 본다
      h.addEventListener('mouseover', (e) => { if (e.target.closest('.pl-says')) pause(); });
      h.addEventListener('mouseout', (e) => { if (e.target.closest('.pl-says') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.pl-says'))) resume(); });
    }
    // 지난번에 고른 모양(오른쪽 칸 · 그 너비)을 되살린다 — 이 컴퓨터의 화면 기억일 뿐이라, 읽지 못하면 작게 띄운 모양으로 시작한다
    docked = mem.get('iris.planner.dock') === '1';
    { const w = Number(mem.get('iris.planner.dockW')); if (Number.isFinite(w) && w >= DOCK_MIN && w <= DOCK_MAX) dockW = w; }
    host.addEventListener('pointerdown', gripDown);
    host.addEventListener('focusin', (e) => { if (e.target.id === 'pl-in' && !talk) { openTalk(); renderPanel(); } });
    host.addEventListener('dblclick', onDblClick);
    document.addEventListener('keydown', modalKeys, true);   // 잡는 단계에서 — 본체의 키 처리보다 먼저
    // 키 경계: 플래너 안(입력칸 · 단추)에서 누른 키는 본체로 올려 보내지 않는다 — 본체의 확인 카드(1~9 · y · n · Enter)나 단축키가 대신 눌리지 않게.
    // Esc 만 올려 보낸다(본체 onEscape 한 곳에서 "대화 → 판" 순서로 닫는다).
    for (const h of [host, over, modalEl]) h.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') return;
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && e.target.id === 'pl-in') { e.preventDefault(); const c = talkCtx; talkCtx = null; talkSend(e.target.value, c || {}); }
      // 목록의 이름에 초점이 있을 때 Enter · 스페이스 = 일정 창 열기(마우스 없이도)
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.tx[role="button"]')) { const el = e.target.closest('[data-open]'); if (el) { e.preventDefault(); openItem(el.dataset.open, el.dataset.openDate); } }
      // 일정 창의 고치기: 한 줄 칸에서 Enter = 저장, 메모 칸에서는 줄바꿈(Ctrl+Enter = 저장)
      if (e.key === 'Enter' && item && item.mode === 'edit' && e.target.closest && e.target.closest('.pl-m') && (e.target.tagName === 'INPUT' || (e.target.tagName === 'TEXTAREA' && (e.ctrlKey || e.metaKey)))) { e.preventDefault(); saveItem(); }
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
  function onHello(p) {
    if (!(p && typeof p.proposals === 'number')) return;
    count = p.proposals; cfg.plannerEnabled = p.enabled !== false; renderRow(); if (open) load();
    restoreAsks(p.asks); // 화면을 다시 열었거나 데몬이 다시 붙었다: 답을 기다리는 물음(세션이 지우려는 것)을 되살린다
  }
  /** 답을 기다리는 물음을 되살린다(이미 떠 있는 것은 sayFromDaemon 이 걸러 낸다). list 가 없으면 데몬에 묻는다. */
  async function restoreAsks(list) {
    let asks = Array.isArray(list) ? list : null;
    if (!asks) { try { const r = await fetch('/api/planner/asks'); const j = await r.json(); asks = Array.isArray(j.asks) ? j.asks : []; } catch { asks = []; } }
    if (cfg.plannerEnabled === false) return;
    for (const s of asks.slice(0, 20)) sayFromDaemon(s);
  }
  function onMessage(m) {
    if (!m) return;
    if (typeof m.proposals === 'number') count = m.proposals;
    if (m.cfg && typeof m.cfg === 'object') { try { opts.onCfg(m.cfg, m.cfgAt || null); } catch { /* 설정 화면이 아직 없음 */ } } // 데몬이 바꾼 설정(말로 "1시간 동안 알리지 마") — 화면의 설정 사본을 맞춘다
    if (m.say) sayFromDaemon(m.say);
    if (open) load(); else renderRow();
  }
  /** Esc: 대화 → 판 순서로 한 단계씩만 닫는다. 닫은 것이 있으면 true(본체는 다른 일을 하지 않는다). */
  function onEscape() {
    // 일정 창이 떠 있으면 Esc = 한 단계만(고치는 중이면 고치기 취소 → 보기, 보기면 창 닫기). 판 · 다른 서랍은 닫지 않는다.
    // Esc 는 두 길(페이지 · Electron 중계)로 올 수 있어 바로 뒤의 한 번도 삼킨다.
    if (item) { editEscAt = Date.now(); if (item.mode === 'edit') viewItem(); else closeItem(); return true; }
    if (Date.now() - editEscAt < 400) return true;
    if (!open) return false;
    if (talk) { foldTalk(); return true; }
    closePanel(); return true;
  }
  function applySettings(c) {
    const was = cfg.plannerEnabled !== false; const wasQuiet = quietOn(cfg);
    cfg = { ...cfg, ...(c || {}) };
    if (was && cfg.plannerEnabled === false) dropPlannerSays(); // 방금 껐다: 플래너가 하던 말 · 차례를 기다리던 말을 거둔다(세션의 작업 알림은 그대로)
    else if (!was && cfg.plannerEnabled !== false) restoreAsks(null); // 다시 켰다: 끌 때 거둔 물음(세션이 지우려는 것)을 되살린다 — 답할 길이 없어지지 않게
    else if (!wasQuiet && quietOn(cfg)) dropPlannerSays({ keepAsk: true }); // 방금 「잠시 조용히」를 켰다: 화면에 이미 와 있던 플래너의 말도 멈춘다(답을 기다리는 물음은 남긴다)
    render(); if (open) load();
  }
  /** 서랍이 열리거나 닫혔을 때(본체가 알려 준다) */
  function refresh() { place(); renderRow(); }
  return { init, onHello, onMessage, onEscape, say, bubbles, applySettings, refresh, editing: () => !!item,   /* 일정 창이 떠 있는가 — 본체의 Esc 가 이것을 먼저 본다(창부터 닫는다) */ isOpen: () => open, open: (day) => openPanel(day || null), close: closePanel };
})();
