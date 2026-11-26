// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 설정 → IRIS Doctor(창 안 입구). 설계 정본 = D09 「에이전트 업데이트·의사-설계」 D3 · 코덱스 협의 14차.
//  · 이 묶음은 "바깥 Doctor 를 여는 손잡이"다 — 검진 · 치료 · 계정 연결은 열린 Doctor 창에서 한다(열쇠 · 계정 이름이 이 화면을 거치지 않는다).
//  · 화면은 데몬에만 말한다: GET /api/doctor(복구에 쓸 계정의 상태 요약) · POST /api/doctor/open(바깥 창 열기).
//  · 상태를 읽지 못해도 「열기」는 된다. 읽지 못한 것을 "연결 안 됨"으로 적지 않는다.
window.DoctorView = (() => {
  const $ = (s) => document.querySelector(s);
  const NAME = { claude: 'Claude', codex: 'Codex' };
  const KEEP_MS = 30_000;
  let info = null, at = 0, wired = false, busy = false, onChange = () => {};

  const day = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`; };
  /** 한 계정의 말과 색. level: ok | warn | bad | off */
  function word(a, kind) {
    const left = kind === 'claude' && Number.isInteger(a?.daysLeft) ? ` · 열쇠 ${a.daysLeft}일 남음` : '';
    switch (a?.state) {
      case 'ready': return { text: `준비됨 · 마지막 확인 성공 ${day(a.okAt)}${left}`, level: 'ok' };
      case 'failed': return { text: `마지막 연결 확인 실패${a.failAt ? ` ${day(a.failAt)}` : ''}`, level: 'warn' };
      case 'card': return { text: '연결됨 · 아직 확인 전', level: 'warn' };
      case 'expired': return { text: '열쇠 만료 — 다시 연결 필요', level: 'bad' };
      case 'none': return { text: '연결 안 됨', level: 'off' };
      case 'unreadable': return { text: '연결 파일을 읽지 못함', level: 'warn' };
      default: return { text: '상태를 확인하지 못함', level: 'off' };
    }
  }
  const DEFINITE = ['ready', 'failed', 'card', 'expired', 'none', 'unreadable']; // 뜻을 아는 상태 낱말(그 밖 = 판단할 수 없음)
  const shaped = (a) => !!a && typeof a === 'object' && typeof a.state === 'string';
  /** 상태를 읽었는가: 전체가 정상이고 두 계정 칸이 제 모양일 때만(칸이 빠진 답을 "읽었다"고 하지 않는다) */
  const known = () => info?.link?.state === 'ok' && shaped(info.link.claude) && shaped(info.link.codex);
  const readyCount = () => (known() ? ['claude', 'codex'].filter((k) => info.link[k].state === 'ready').length : 0);
  /** 두 계정 모두 뜻을 아는 상태인가 — "준비된 계정이 없다"는 경고는 이때만 한다 */
  const allDefinite = () => known() && ['claude', 'codex'].every((k) => DEFINITE.includes(info.link[k].state));
  /** 목차 한 줄과 꼬리표. warn = 상태를 읽었는데 준비된 계정이 하나도 없음(읽지 못했으면 경고하지 않는다). */
  function summary() {
    if (!info) return { text: '먹통일 때 부르는 도구', warn: false };
    if (info.broken) return { text: '프로그램 파일 일부 없음', warn: true };
    if (!known()) return { text: info.link?.state === 'busy' ? '계정 연결 작업 중' : '계정 상태 확인 못함', warn: false };
    const n = readyCount();
    if (n) return { text: `복구 계정 ${n}개 준비됨`, warn: false };
    return allDefinite() ? { text: '복구 준비 미완료', warn: true } : { text: '계정 상태 확인 못함', warn: false };
  }

  function render() {
    const box = $('#dr-accounts'); if (!box) return;
    box.textContent = '';
    for (const kind of ['claude', 'codex']) {
      const w = known() ? word(info.link[kind], kind) : { text: info?.link?.state === 'busy' ? '계정 연결 작업 중 — 잠시 뒤 다시 보입니다' : '상태를 확인하지 못함', level: 'off' };
      const row = document.createElement('div'); row.className = `st-opt auth-row dr-row ${w.level}`;
      const name = document.createElement('span'); name.className = 'st-opt-text'; name.textContent = NAME[kind];
      const st = document.createElement('span'); st.className = 'auth-d'; st.textContent = w.text;
      row.append(name, st); box.append(row);
    }
    const s = summary();
    $('#dr-tag').hidden = !(s.warn && !info?.broken);
    $('#dr-broken').hidden = !info?.broken;
    $('#dr-note').textContent = !known() ? '계정 상태를 읽지 못했습니다. 「IRIS Doctor 열기」는 그대로 됩니다 — 열린 창의 [4] 계정 연결에서 확인할 수 있습니다.'
      : readyCount() ? '계정을 바꾸거나 더 연결하려면 IRIS Doctor 를 열어 [4] 계정 연결을 고르세요.'
        : allDefinite() ? '문제가 생기기 전에 복구에 쓸 계정을 연결해 두세요 — 「IRIS Doctor 열기」 → [4] 계정 연결.'
          : '일부 계정의 상태를 알 수 없습니다 — 「IRIS Doctor 열기」 → [4] 계정 연결에서 확인할 수 있습니다.';
  }

  /** 상태 요약을 읽는다(설정을 열 때 한 번 · 묶음에 다시 들어올 때 오래됐으면). 실패해도 화면은 "확인 못함"으로 남고 열기는 된다. */
  async function load(force = false) {
    if (!force && info && Date.now() - at < KEEP_MS) return info;
    // 읽지 못하면(통신 · 답의 모양) 앞서 본 「준비됨」이나 경고를 남겨 두지 않는다 — "상태를 확인하지 못함"으로 바꾼다
    const unknown = () => ({ available: true, broken: !!info?.broken, link: { state: 'unknown' } });
    try {
      const r = await fetch(force ? '/api/doctor?fresh=1' : '/api/doctor');
      if (r.status === 404) info = null;
      else { const j = r.ok ? await r.json() : null; info = j && typeof j === 'object' && j.link && typeof j.link === 'object' ? j : unknown(); }
    } catch { info = unknown(); }
    at = Date.now();
    render(); onChange();
    return info;
  }

  // 실패의 까닭: [무엇을 하면 되는지(본문), 접힌 「자세히」에 적을 한 줄] — 안쪽 낱말(why 값)을 화면에 그대로 내지 않는다
  const WHY = {
    'start-file-missing': ['IRIS Doctor 의 시작 파일이 없습니다. IRIS 설치 프로그램을 다시 실행하면 다시 놓입니다.', '시작 파일을 찾지 못했습니다.'],
    spawn: ['윈도우가 IRIS Doctor 를 띄우지 못했습니다.', '윈도우가 실행을 받아들이지 않았습니다.'],
    failed: ['IRIS Doctor 가 답하지 않았습니다.', 'IRIS Doctor 프로그램이 답을 주지 않았습니다.'],
    none: ['IRIS 가 요청에 답하지 않았습니다.', 'IRIS 창 안쪽에서 답을 받지 못했습니다.'],
  };
  const ELSEWHERE = '바탕화면이나 시작 메뉴의 「IRIS Doctor」로도 열 수 있습니다.';
  /** 바깥 Doctor 를 연다(설정 묶음의 단추 · 끊김 안내의 바로가기 줄이 함께 쓴다). */
  async function open() {
    if (busy) return;
    busy = true; const b = $('#dr-open'); if (b) { b.disabled = true; b.textContent = '여는 중'; }
    let r = null;
    try { const res = await fetch('/api/doctor/open', { method: 'POST' }); r = await res.json().catch(() => null); } catch {}
    busy = false; if (b) { b.disabled = false; b.textContent = 'IRIS Doctor 열기'; }
    // 말은 확인된 만큼만 한다: 떴음이 확인됨 = "열었습니다" / 띄웠지만 확인 못함 = "띄웠습니다 — 확인하지 못했습니다" / 띄우지 못함 = "열지 못했습니다"
    if (r?.ok && !r.direct) {
      const sub = r.others > 0 ? `작업 표시줄의 새 창을 확인하세요. 이미 열려 있던 창이 ${r.others}개 있습니다 — 치료는 한 번에 한 창에서만 됩니다.` : '작업 표시줄의 새 창을 확인하세요.';
      Dialog.notice('IRIS Doctor 를 열었습니다', { sub, tone: 'info' });
    } else if (r?.ok || r?.why === 'unconfirmed') {
      Dialog.notice('IRIS Doctor 를 띄웠습니다 — 떴는지는 확인하지 못했습니다', { sub: `작업 표시줄에 새 창이 있는지 보세요. 창이 안내 글만 보이면 그 글을 따라 주세요. 창이 없으면 한 번 더 누르거나, ${ELSEWHERE}`, tone: 'warn' });
    } else {
      const [msg, detail] = WHY[r ? r.why : 'none'] || WHY.failed;
      Dialog.error({ title: 'IRIS Doctor 를 열지 못했습니다', message: `${msg} ${ELSEWHERE}`, detail });
    }
    load(true); // 열린 창에서 계정을 바꿨을 수 있다 — 다음에 볼 때 새로 읽게
  }

  function wire() {
    if (wired) return; wired = true;
    $('#dr-open')?.addEventListener('click', open);
  }
  function show() { wire(); render(); load(); }
  return { show, load, open, summary, onChange: (fn) => { onChange = typeof fn === 'function' ? fn : () => {}; }, _word: word };
})();
