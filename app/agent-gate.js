// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 단추의 켜짐 · 꺼짐 판정(순수 함수 — 화면을 만지지 않는다). main.js 가 단추를 그릴 때 · 단추로 여는 대화를 만들 때 쓴다.
// 화면 코드에서 떼어 둔 까닭: 판정을 node 에서 그대로 검사하려고(scripts/check-agy-lock.mjs — 안티그래비티 상태를 바꿔도 Claude · Codex 판정이 같은지).
//   AGENTS = GET /api/agents 의 표 · ACCT = GET /api/agents/status(계정 수 · 프로그램 없음) · AGY = 안티그래비티 판정({ state })
//   off(AGENTS, ACCT, AGY)       단추마다 꺼진 까닭. 없는 키 = 켜짐.  claude · codex: 'missing' | 'account' · antigravity: 'locked' | 'missing' | 'account' | 'gate'
//   block(k, AGENTS, ACCT, AGY)  그 에이전트 하나의 실제 상태('' = 쓸 수 있음) — "모두 꺼졌으면 막지 않는다" 예외가 없다
//   tip(k, why) = 꺼진 단추의 말풍선 · word(why) = 짧은 까닭 낱말 · locked(AGY) = 화면 잠금인가
// 🔴 안티그래비티 화면 잠금(2026-11-27 사용자 결정, 데몬 = daemon/agents/antigravity.lock.mjs): AGY.state === 'locked' 면 다른 판정보다 먼저 'locked' —
//   단추는 보이지만 눌리지 않고 꼬리표 「곧 열립니다」. 설치 · 로그인 안내 글은 잠겨 있는 동안 나오지 않는다. Claude · Codex 의 판정은 이 값과 무관하다.
window.AgentGate = (() => {
  const NAME = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity' };
  const LOCK_TAG = '곧 열립니다';
  const LOCK_TIP = 'Antigravity 는 준비 중입니다. 곧 열립니다.';
  // v2.96.2(2026-10-27 사용자 결정): 프로그램이 없거나 계정이 0개인 에이전트 단추는 비활성 + 마우스를 올리면 짧은 말풍선.
  const OFF_TIP = { missing: '프로그램 없음 — IRIS 설치 파일을 다시 실행하면 받습니다', account: '계정 연결 안 됨 — 대시보드에서 계정을 추가하면 켜집니다' };
  // 안티그래비티는 안내가 다르다(2026-11-23). 잠겨 있는 동안에는 이 글들이 나오지 않는다(잠금이 먼저다).
  const OFF_TIP_AGENT = { antigravity: { missing: '프로그램 없음 — 공식 설치(antigravity.google/cli) 뒤 IRIS 창을 다시 켜면 켜집니다', account: '로그인 안 됨 — 터미널에서 agy 를 한 번 실행해 구글 계정으로 로그인하면 켜집니다', gate: '중계기(IRIS Gate)를 쓸 수 없음 — 사용량 대시보드에서 구글 계정 · 재시작을 확인하면 1분 안에 켜집니다' } };

  const locked = (AGY) => AGY?.state === 'locked';
  /** 안티그래비티 판정 → 꺼진 까닭. 잠금이 맨 먼저. 모름(unknown) · 정상 · 값 없음이면 끄지 않는다. */
  const agyWhy = (AGY) => (locked(AGY) ? 'locked' : AGY?.state === 'missing' ? 'missing' : AGY?.state === 'auth' ? 'account' : AGY?.state === 'gate' ? 'gate' : '');

  function off(AGENTS, ACCT, AGY) {
    const out = {};
    for (const k of ACCT?.missing || []) if (AGENTS[k]) out[k] = 'missing';
    const acc = ACCT?.accounts;
    // "모두 꺼졌으면 막지 않는다"는 클로드 · 코덱스 둘만으로 예전과 똑같이 셈한다(셋째 에이전트가 생겨도 두 단추의 판정이 바뀌지 않게 — 2026-11-23 코덱스 재검토)
    const relayKeys = Object.keys(AGENTS).filter((k) => k !== 'antigravity');
    if (acc) for (const k of relayKeys) if (!out[k] && acc[k] === 0) out[k] = 'account';
    const base = Object.keys(out).length >= relayKeys.length ? {} : out;
    // 안티그래비티(중계기 밖)는 위 상태 객체에 없다 — 데몬이 따로 보내는 판정(AGY)으로만 끈다. 잠금은 위 예외와 상관없이 언제나 건다.
    if (AGENTS.antigravity) { const why = agyWhy(AGY); if (why) return { ...base, antigravity: why }; }
    return base;
  }
  // 단추로 여는 대화(quickStart)용 — 그 에이전트 하나의 실제 상태만 본다(없는 계정 · 없는 프로그램 · 잠긴 에이전트로 대화를 만들지 않게).
  // 계정 수를 모르는 PC(영수증 없음 = accounts null)는 판단하지 않는다 = 막지 않는다.
  function block(k, AGENTS, ACCT, AGY) {
    if (!AGENTS?.[k]) return 'missing';
    if (k === 'antigravity' && locked(AGY)) return 'locked';
    if ((ACCT?.missing || []).includes(k)) return 'missing';
    if (k === 'antigravity') return agyWhy(AGY);
    return ACCT?.accounts && ACCT.accounts[k] === 0 ? 'account' : '';
  }
  const tip = (k, why) => (why === 'locked' ? LOCK_TIP : `${NAME[k] || k} · ${OFF_TIP_AGENT[k]?.[why] || OFF_TIP[why]}`);
  const word = (why) => (why === 'locked' ? LOCK_TAG : why === 'missing' ? '프로그램 없음' : why === 'gate' ? '중계기를 쓸 수 없음' : '계정 연결 안 됨');
  return { off, block, tip, word, locked, NAME, LOCK_TAG, LOCK_TIP };
})();
