// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
/* 작업 완료 알림(2026-09-11): 작업목록의 어떤 세션이 '작업 중'에서 '대기·확인 필요·종료'로 바뀌면 창 오른쪽 아래에 작은 알림을 띄운다.
   - 근거는 데몬의 status 방송에 실린 done 표시(요청을 실제로 받은 뒤의 busy→끝 전환에만 true — 세션 시작 직후 첫 프롬프트는 제외).
   - 지금 보고 있는 세션이고 창이 앞에 있으면 띄우지 않는다(화면에서 이미 끝난 것이 보이므로).
   - 창이 뒤에 있거나 숨어 있으면 윈도 OS 알림(화면 오른쪽 아래)도 함께(설정으로 끔). 누르면 창을 앞으로 가져와 그 세션을 연다.
   - 설정(⚙ → 알림): notifyDone(전체 켬/끔) · notifyOs(OS 알림). 알림은 초점을 뺏지 않는다(pointerdown preventDefault + tabindex -1).
   사용: Notify.init({ onPick, current, enabled, osEnabled }) · Notify.onStatus(msg, session) · Notify.push({...}) */
window.Notify = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STATUS_KO = { idle: '작업이 끝났습니다', attention: '확인이 필요합니다', exited: '세션이 종료됐습니다', dead: '세션이 종료됐습니다' };
  const AGENT_KO = { claude: 'Claude', codex: 'Codex' };
  const MAX = 4, TTL = 8000;
  let opts = { onPick: () => {}, current: () => null, enabled: () => true, osEnabled: () => true };
  const busyAt = new Map(); // 세션별 '작업 중' 시작 시각(걸린 시간 표시용)

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

  /** 데몬 status 방송 → 알림 판단. m = { id, status, done }, s = 세션 레코드(상태 갱신 전·후 무관: 제목·폴더·조합만 쓴다). */
  function onStatus(m, s) {
    if (m.status === 'busy') { busyAt.set(m.id, Date.now()); return; }
    if (!m.done) return;
    const started = busyAt.get(m.id); busyAt.delete(m.id);
    if (!opts.enabled()) return;
    const focused = document.hasFocus() && document.visibilityState === 'visible';
    if (m.id === opts.current() && focused) return; // 보고 있는 세션은 화면이 이미 말해 준다
    const title = (s?.title || shortPath(s?.cwd) || m.id).trim();
    const took = fmtDur(started ? Date.now() - started : 0);
    const combo = s ? `${AGENT_KO[s.agent] || s.agent || ''} ${s.modelLabel || s.model || ''}`.trim() : '';
    const sub = [STATUS_KO[m.status] || m.status, took && `${took} 걸림`, combo].filter(Boolean).join(' · ');
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
  return { init, onStatus, push, preview, requestOs };
})();
