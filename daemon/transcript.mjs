// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 기록파일 꼬리 읽기 + 정규화 (읽기 전용). 클로드 projects\*.jsonl · 코덱스 sessions\rollout-*.jsonl
// 정규화 항목: { i, t, kind, text?, name?, detail?, n? }
//   kind: user | assistant | thinking | tool | tool_result | ask | command | compact | usage | subagent | notice | unknown
//   interrupt = Esc 로 멈춤(v2.80, 클로드 "[Request interrupted by user…]"·코덱스 turn_aborted)
//   notice = 새 차례를 연 작업 알림(배경 명령·보조 작업·감시 끝남, v2.79) — text 는 알림 한 줄씩, n = 알림 수
//            src = task(작업 알림) · stop-hook · scheduled · peer · resume(v2.82, 시스템이 다시 연 차례 — detail = 전체 글, metaNotice)
// 기록 한 줄을 항목으로 바꾸는 일(형식이 에이전트마다 다르다)과 차례 판정·컨텍스트 창 추정은 daemon/agents/<id>.records.mjs 어댑터가 한다
// (parseRecord · turnState · contextWindowGuess — 2026-11-21 에이전트 장부 걸음 2). 이 파일은 파일을 조각조각 읽고 누적 상태를 지닌다.
// 이 파일과 기록 해석 어댑터는 에이전트의 실행 설정(agents.mjs · agents/<id>.mjs)을 불러오지 않는다.
import fs from 'node:fs';
import { recordAdapterFor } from './agents/records.mjs';

export { noticeLines, metaNotice } from './agents/claude.records.mjs';

const MAX_ITEMS = 5000;

export class TranscriptTail {
  /** @param {{sub?:boolean}} [opts] sub=true 면 서브에이전트 기록(isSidechain 줄을 버리지 않는다 — subagents.mjs, 2026-09-11) */
  constructor(file, agent, opts = {}) {
    this.file = file; this.agent = agent; this.sub = !!opts.sub;
    this.offset = 0; this.partial = ''; this.items = []; this.seq = 0;
    this.unknown = 0; this.sidechain = new Set(); this.model = null; this.lastUsage = null; this.window = null;
    this.aiTitle = null;   // 클로드코드가 기록에 적는 세션 제목(ai-title) — 가장 최근 값
    this.firstUser = null; // 화면에 보이는 첫 사용자 요청문(제목 2순위 재료)
    // 보조 작업(서브에이전트) 추적 재료(2026-09-11, subagents.mjs가 읽는다):
    //   calls    = 부모가 부른 Agent/Task 도구호출 id → 설명(클로드) · spawn_agent call_id(코덱스)
    //   finished = 그 호출이 끝난 시각: 동기형은 tool_result, 배경형은 <task-notification>의 <tool-use-id>
    //   finishedByTask = <task-notification>의 <task-id>(= 보조 agent id, 기록파일 agent-<id>) → 시각. SendMessage 로 재개된 보조의 두 번째 알림은
    //                    tool-use-id 가 SendMessage 호출 id 라 finished 로는 못 잡는다(2026-09-11 사건, v2.47.1) — task-id 로 잡는다.
    //   tools    = 이 기록 안의 도구 호출 수 · firstT/lastT = 첫·마지막 항목 시각 · turnOpen = 코덱스 task_started~task_complete 사이면 true
    this.calls = new Map(); this.finished = new Map(); this.finishedByTask = new Map(); this.tools = 0; this.firstT = null; this.lastT = null; this.turnOpen = null; this.turnDoneAt = null;
    // 배경 작업(v2.80, 2026-10-07): 배경 명령(run_in_background·120초 넘어 자동 배경)·감시(Monitor) — 코덱스 위임도 보통 배경 명령이다.
    //   bg     = 작업 id → { t(ms), kind:'bash'|'monitor', desc, until(ms|null) }. 끝 = finishedByTask(알림의 task-id) · TaskStop · 감시 만료.
    //   toolIn = 도구 호출 id → { name, desc, task } (결과가 올 때 설명·멈출 대상을 찾는 재료)
    this.bg = new Map(); this.toolIn = new Map();
  }
  /** 아직 안 끝난 배경 작업(v2.80). 메인이 대기여도 이게 있으면 화면은 '작업 중(배경)'으로 본다.
   *  sinceMs = 지금 CLI 프로세스가 뜬 시각 — 그 전에 시작한 작업은 프로세스와 함께 죽었으므로(재개·데몬 재시작) 세지 않는다.
   *  감시는 만료 시각 + 1분, 배경 명령은 24시간이 지나면 끝난 것으로 본다(알림을 못 받은 경우의 안전판). */
  backgroundPending(sinceMs = 0, now = Date.now()) {
    const out = [];
    for (const [id, b] of this.bg) {
      if (this.finishedByTask.has(id)) continue;
      if (b.t < sinceMs) continue;
      if (b.until != null ? now > b.until + 60000 : now - b.t > 24 * 3600000) continue;
      out.push({ id, kind: b.kind, desc: b.desc, t: new Date(b.t).toISOString() });
    }
    return out;
  }
  /** 이 차례가 아직 열려 있는가(v2.73, 2026-09-21). 화면 글자만 보는 sessions.mjs idleCheck 의 교차 확인 재료 — 도구 출력에 섞인
   *  `>` 줄이나 빈 프롬프트 줄 때문에 진행 중인 세션을 "작업 완료"로 잘못 알린 사건(2026-09-20 사용자 실측)의 대책.
   *    코덱스 = task_started~task_complete 사이면 'open', 끝났으면 'closed', 아직 모르면 null.
   *    클로드 = 마지막 항목(생각·압축 제외)이 요청·명령·도구 호출·도구 결과·보조 호출이면 'open'(모델이 아직 답할 차례),
   *             질문 카드(ask)면 'closed'(사람 차례), 답 글이면 null(다음 도구 호출 전 생각 중일 수 있어 단정하지 않는다).
   *  @returns {'open'|'closed'|null} */
  turnState() {
    const ad = recordAdapterFor(this.agent);
    return ad ? ad.turnState(this) : null; // 명부에 없는 에이전트의 기록 = 판정하지 않는다
  }
  /** 컨텍스트 창 크기: 코덱스는 기록에 있음, 클로드는 모델로 추정(Claude 5 계열 1M — Haiku 5.5 포함, Haiku 4.x 이하 200k) */
  contextWindow() {
    if (this.window) return this.window;
    const ad = recordAdapterFor(this.agent);
    return ad && ad.contextWindowGuess ? ad.contextWindowGuess(this.model) : null; // 추정 함수가 있는 에이전트만 model 을 읽는다
  }
  /** 새로 생긴 줄만 읽어 정규화 항목 배열을 돌려준다 */
  poll() {
    if (!fs.existsSync(this.file)) return [];
    const size = fs.statSync(this.file).size;
    if (size < this.offset) { this.offset = 0; this.partial = ''; this.items = []; this.reset = true; this.aiTitle = null; this.firstUser = null; }
    if (size === this.offset) return [];
    const fd = fs.openSync(this.file, 'r');
    let chunk;
    try { const buf = Buffer.alloc(size - this.offset); fs.readSync(fd, buf, 0, buf.length, this.offset); chunk = buf.toString('utf8'); }
    finally { fs.closeSync(fd); }
    this.offset = size;
    const text = this.partial + chunk;
    const lines = text.split('\n');
    this.partial = lines.pop() || '';
    const out = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let rec; try { rec = JSON.parse(line); } catch { continue; }
      const ad = recordAdapterFor(this.agent);
      const items = ad ? ad.parseRecord(this, rec) : []; // 명부에 없는 에이전트의 기록 = 다른 해석기로 읽지 않는다(항목 없음)
      for (const it of items) {
        it.i = ++this.seq; out.push(it);
        if (this.firstUser == null && it.kind === 'user' && it.text && it.text !== '[이미지]') this.firstUser = it.text;
        if (it.kind === 'tool' || it.kind === 'subagent') this.tools++;
        if (it.t) { if (!this.firstT) this.firstT = it.t; this.lastT = it.t; }
      }
    }
    this.items.push(...out);
    if (this.items.length > MAX_ITEMS) this.items = this.items.slice(-MAX_ITEMS);
    return out;
  }
  /** 모르는 종류의 줄: silent 목록에 있으면 버리고, 아니면 세어 unknown 항목으로 낸다(어댑터가 부른다) */
  countUnknown(type, silent) {
    if (silent.includes(type)) return [];
    this.unknown++;
    return [{ t: null, kind: 'unknown', name: type, n: this.unknown }];
  }
}
