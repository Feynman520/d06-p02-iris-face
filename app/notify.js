// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 작업 완료 알림(2026-09-11): 작업목록의 어떤 세션이 '작업 중'에서 '대기·확인 필요·종료'로 바뀌면 창 오른쪽 아래에 작은 알림을 띄운다.
   - 근거는 데몬의 status 방송에 실린 done 표시(요청을 실제로 받은 뒤의 busy→끝 전환에만 true — 세션 시작 직후 첫 프롬프트는 제외).
   - 지금 보고 있는 세션이고 창이 앞에 있으면 띄우지 않는다(화면에서 이미 끝난 것이 보이므로).
   - 창이 뒤에 있거나 숨어 있으면 윈도 OS 알림(화면 오른쪽 아래)도 함께(설정으로 끔). 누르면 창을 앞으로 가져와 그 세션을 연다.
   - 설정(⚙ → 알림): notifyDone(전체 켬/끔) · notifyOs(OS 알림). 알림은 초점을 뺏지 않는다(pointerdown preventDefault + tabindex -1).
   - 보조 작업 보류(v2.40, 2026-09-11): done이 왔는데 그 세션에 실행 중인 보조(서브에이전트)가 있으면 알림을 보류한다. 보조가 끝나 메인이 다시 '작업 중'이 되면
     보류를 지우고(진짜 끝날 때 원래 방식으로 알림), 마지막 보조가 끝나고 3초가 지나도 메인이 안 깨어나면 보류했던 알림을 '보조 N개 포함'을 붙여 띄운다.
     보조 자체의 완료 알림은 만들지 않는다(2026-09-11 사용자 결정).
   사용: Notify.init({ onPick, current, enabled, osEnabled }) · Notify.onStatus(msg, session, subsRunning) · Notify.onSubs(id, running, total, session) · Notify.push({...}) */
window.Notify = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STATUS_KO = { idle: '작업이 끝났습니다', attention: '확인이 필요합니다', exited: '세션이 종료됐습니다', dead: '세션이 종료됐습니다' };
  const AGENT_KO = { claude: 'Claude', codex: 'Codex' };
  const MAX = 4, TTL = 8000;
  let opts = { onPick: () => {}, current: () => null, enabled: () => true, osEnabled: () => true };
  const busyAt = new Map(); // 세션별 '작업 중' 시작 시각(걸린 시간 표시용)
  const pending = new Map(); // 세션별 보류한 완료 알림 { m, s, started, timer } — 보조가 아직 실행 중일 때
  const SUBS_GRACE_MS = 3000; // 마지막 보조가 끝난 뒤 메인이 깨어나길 기다리는 시간

  function box() {
    let el = $('#toasts');
    if (!el) { el = document.createElement('div'); el.id = 'toasts'; el.className = 'toasts'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    return el;
  }
  const fmtDur = (ms) => { if (!ms || ms < 1000) return ''; const s = Math.round(ms / 1000); if (s < 60) return `${s}초`; const m = Math.floor(s / 60); return m < 60 ? `${m}분 ${s % 60}초` : `${Math.floor(m / 60)}시간 ${m % 60}분`; };
  const shortPath = (p) => String(p || '').split(/[\\/]/).filter(Boolean).slice(-1)[0] || p || '';

  /** 알림 하나. { id, title, sub, status, force } — force = 설정·초점 규칙을 무시(설정의 미리보기). */
  function push({ id, title, sub, status = 'idle', force = false }) {
    if (!force && !opts.enabled()) return null;
    const host = box();
    while (host.children.length >= MAX) host.firstElementChild.remove();
    const el = document.createElement('div'); el.className = `toast ${status}`; el.setAttribute('role', 'status');
    el.innerHTML = `<span class="dot ${esc(status)}"></span><span class="toast-body"><span class="toast-title">${esc(title)}</span><span class="toast-sub">${esc(sub || '')}</span></span><button class="toast-x" tabindex="-1" title="닫기">✕</button>`;
    let timer = 0;
    const close = () => { clearTimeout(timer); el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 220); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(close, TTL); };
    // 초점을 뺏지 않는다: 누르는 순간의 기본 동작(초점 이동)을 막고 click만 처리
    el.addEventListener('pointerdown', (e) => e.preventDefault());
    el.querySelector('.toast-x').addEventListener('click', (e) => { e.stopPropagation(); close(); });
    el.addEventListener('click', () => { close(); if (id) opts.onPick(id); });
    el.addEventListener('mouseenter', () => clearTimeout(timer)); el.addEventListener('mouseleave', arm);
    host.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    arm();
    return el;
  }

  // ---- 윈도 OS 알림(창이 뒤에 있을 때) ----
  function osNotify({ id, title, sub }) {
    if (!('Notification' in window)) return;
    const fire = () => {
      try {
        const n = new Notification(title, { body: sub || '', tag: `iris-${id || 'preview'}`, silent: false });
        n.onclick = () => { try { n.close(); } catch {} window.focus(); window.irisHost?.refocus?.().catch?.(() => {}); if (id) opts.onPick(id); };
      } catch {}
    };
    if (Notification.permission === 'granted') fire();
    else if (Notification.permission === 'default') Notification.requestPermission().then((p) => { if (p === 'granted') fire(); }).catch(() => {});
  }
  /** 사용자가 OS 알림을 켤 때 부른다(브라우저 모드에서는 권한을 미리 받아 둔다; Electron은 기본 허용). */
  function requestOs() { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch {} }

  function dropPending(id) { const p = pending.get(id); if (!p) return; if (p.timer) clearTimeout(p.timer); pending.delete(id); }

  /** 데몬 status 방송 → 알림 판단. m = { id, status, done }, s = 세션 레코드(상태 갱신 전·후 무관: 제목·폴더·조합만 쓴다).
   *  subsAlive = 그 세션에서 살아 있는 보조 수(running + quiet; 있으면 알림 보류 — 조용한 것도 끝난 게 아니다, v2.40.1). */
  function onStatus(m, s, subsAlive = 0) {
    if (m.status === 'busy') {
      // 보류 중이던 세션이 다시 일한다(보조가 끝나 메인이 깨어남): 보류를 지우되 시작 시각은 이어 간다(보조 시간까지 걸린 시간에 포함)
      const p = pending.get(m.id); dropPending(m.id);
      busyAt.set(m.id, p?.started || Date.now()); return;
    }
    if (!m.done) return;
    const started = busyAt.get(m.id); busyAt.delete(m.id);
    if (subsAlive > 0) { dropPending(m.id); pending.set(m.id, { m, s, started, timer: null }); return; }
    fire(m, s, started, 0);
  }
  /** 보조 목록 변화(살아 있는 수·전체 수). 보류가 있는 세션만 본다: 살아 있는 보조가 0이 되면 3초 뒤에도 메인이 조용하면 보류 알림을 띄운다. */
  function onSubs(id, alive, total, s) {
    const p = pending.get(id); if (!p) return;
    if (alive > 0) { if (p.timer) { clearTimeout(p.timer); p.timer = null; } return; }
    if (p.timer) return;
    p.timer = setTimeout(() => { if (pending.get(id) !== p) return; pending.delete(id); fire(p.m, s || p.s, p.started, total); }, SUBS_GRACE_MS);
  }
  function fire(m, s, started, subsTotal) {
    if (!opts.enabled()) return;
    const focused = document.hasFocus() && document.visibilityState === 'visible';
    if (m.id === opts.current() && focused) return; // 보고 있는 세션은 화면이 이미 말해 준다
    const title = (s?.title || shortPath(s?.cwd) || m.id).trim();
    const took = fmtDur(started ? Date.now() - started : 0);
    const combo = s ? `${AGENT_KO[s.agent] || s.agent || ''} ${s.modelLabel || s.model || ''}`.trim() : '';
    const sub = [STATUS_KO[m.status] || m.status, subsTotal > 0 && `보조 ${subsTotal}개 포함`, took && `${took} 걸림`, combo].filter(Boolean).join(' · ');
    push({ id: m.id, title, sub, status: m.status });
    if (!focused && opts.osEnabled()) osNotify({ id: m.id, title, sub });
  }

  /** 설정의 미리보기: 규칙을 무시하고 예시 알림 한 개(+OS 알림 켜져 있으면 그것도) */
  function preview() {
    const sample = { id: null, title: '예시 · 데이터 분석 보고서', sub: `${STATUS_KO.idle} · 2분 14초 걸림 · Claude Opus`, status: 'idle', force: true };
    push(sample);
    if (opts.osEnabled()) osNotify(sample);
  }
  function init(o) { opts = { ...opts, ...o }; box(); }
  return { init, onStatus, onSubs, push, preview, requestOs };
})();
