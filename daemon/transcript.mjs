// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 기록파일 꼬리 읽기 + 정규화 (읽기 전용). 클로드 projects\*.jsonl · 코덱스 sessions\rollout-*.jsonl
// 정규화 항목: { i, t, kind, text?, name?, detail?, n? }
//   kind: user | assistant | thinking | tool | tool_result | ask | command | compact | usage | subagent | notice | unknown
//   interrupt = Esc 로 멈춤(v2.80, 클로드 "[Request interrupted by user…]"·코덱스 turn_aborted)
//   notice = 새 차례를 연 작업 알림(배경 명령·보조 작업·감시 끝남, v2.79) — text 는 알림 한 줄씩, n = 알림 수
import fs from 'node:fs';
import { stripFaceNote, stripPasteMarks } from './facenote.mjs';

const MAX_ITEMS = 5000;
// Esc 중단 표식(클로드코드): 사용자 글 또는 도구 결과 전체가 이 문구다. 글 중간에 인용된 것은 해당 없음(^…$).
const INTERRUPT_RE = /^\s*\[Request interrupted by user(?: for tool use)?\]\s*$/;
const clip = (s, n) => (s && s.length > n ? s.slice(0, n) + `\n… (+${s.length - n}자)` : s || '');
const textOf = (c) => {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(b => (typeof b === 'string' ? b : (b?.text ?? ''))).filter(Boolean).join('\n');
  return '';
};

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
  /** 도구 결과 글에서 배경 작업의 시작을 읽는다(클로드코드 2.1.27x 실측 문구). */
  noteBackground(toolUseId, tx, t) {
    const ms = Date.parse(t || '') || Date.now();
    const inp = this.toolIn.get(toolUseId) || {}; this.toolIn.delete(toolUseId); // 결과가 오면 재료는 다 쓴 것
    let m = tx.match(/Command running in background with ID: ([\w-]+)/) || tx.match(/moved to the background \(ID: ([\w-]+)\)/);
    if (m) { this.bg.set(m[1], { t: ms, kind: 'bash', desc: inp.desc || '', until: null }); return; }
    m = tx.match(/^Monitor started \(task ([\w-]+)(?:, expires in (\d+(?:\.\d+)?)\s*(ms|s|m|h))?/);
    if (m) { const unit = { ms: 1, s: 1000, m: 60000, h: 3600000 }[m[3]] || 0; this.bg.set(m[1], { t: ms, kind: 'monitor', desc: inp.desc || '', until: m[2] ? ms + Number(m[2]) * unit : null }); return; }
    if ((inp.name === 'TaskStop' || inp.name === 'KillShell') && inp.task) this.finishedByTask.set(inp.task, t);
  }
  /** 이 차례가 아직 열려 있는가(v2.73, 2026-09-21). 화면 글자만 보는 sessions.mjs idleCheck 의 교차 확인 재료 — 도구 출력에 섞인
   *  `>` 줄이나 빈 프롬프트 줄 때문에 진행 중인 세션을 "작업 완료"로 잘못 알린 사건(2026-09-20 사용자 실측)의 대책.
   *    코덱스 = task_started~task_complete 사이면 'open', 끝났으면 'closed', 아직 모르면 null.
   *    클로드 = 마지막 항목(생각·압축 제외)이 요청·명령·도구 호출·도구 결과·보조 호출이면 'open'(모델이 아직 답할 차례),
   *             질문 카드(ask)면 'closed'(사람 차례), 답 글이면 null(다음 도구 호출 전 생각 중일 수 있어 단정하지 않는다).
   *  @returns {'open'|'closed'|null} */
  turnState() {
    if (this.agent === 'codex') return this.turnOpen == null ? null : (this.turnOpen ? 'open' : 'closed');
    for (let i = this.items.length - 1; i >= 0; i--) {
      const k = this.items[i].kind;
      if (k === 'thinking' || k === 'compact' || k === 'notice') continue; // notice(v2.79)는 화면 경계용 — 판정은 예전처럼 알림이 없던 것과 같게
      if (k === 'user' || k === 'command' || k === 'tool' || k === 'tool_result' || k === 'subagent') return 'open';
      if (k === 'ask' || k === 'interrupt') return 'closed'; // interrupt(v2.80) = Esc 로 멈춤 → 사람 차례(예전엔 사용자 글로 읽혀 'open' → 진행 중으로 굳었다)
      return null;
    }
    return null;
  }
  /** 컨텍스트 창 크기: 코덱스는 기록에 있음, 클로드는 모델로 추정(Claude 5 계열 1M, Haiku 200k) */
  contextWindow() {
    if (this.window) return this.window;
    if (this.agent === 'claude') return /haiku/i.test(this.model || '') ? 200000 : 1000000;
    return null;
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
      const items = this.agent === 'codex' ? this.fromCodex(rec) : this.fromClaude(rec);
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

  // ---------- Claude Code ----------
  fromClaude(r) {
    const t = r.timestamp || null;
    if (r.type === 'summary' || r.isCompactSummary) return [{ t, kind: 'compact', text: r.summary || '' }];
    if (r.type === 'ai-title') { if (typeof r.aiTitle === 'string' && r.aiTitle.trim()) this.aiTitle = r.aiTitle.trim(); return []; }
    if (r.isSidechain && !this.sub) { if (r.type === 'user' && r.parentUuid == null) this.sidechain.add(r.uuid); return r.type === 'user' && r.parentUuid == null ? [{ t, kind: 'subagent', n: this.sidechain.size }] : []; }
    // 배경형 보조의 완료 알림이 부모가 작업 중(다른 도구 대기 중)에 도착하면 user 메시지가 아니라
    // queue-operation(enqueue, reason absorbed_mid_turn)·attachment(queued_command) 레코드로만 남는다
    // (클로드코드 2.1.268, 2026-09-11 실측: 11개 보조 전부 user 메시지 0건 → 영원히 quiet). 이 두 레코드에서도 완료 신호를 읽는다.
    if (r.type === 'queue-operation') { if (r.operation === 'enqueue' && typeof r.content === 'string') this.noteTaskNotification(r.content, t); return []; }
    if (r.type === 'attachment') { const p = r.attachment?.prompt; if (typeof p === 'string') this.noteTaskNotification(p, t); return []; }
    if (r.type !== 'user' && r.type !== 'assistant') return this.countUnknown(r.type, ['attachment', 'last-prompt', 'mode', 'permission-mode', 'atis-latch', 'ai-title', 'file-history-delta', 'file-history-snapshot', 'system', 'progress', 'queue-operation', 'atis', 'last-user-prompt', 'cost-state']);
    if (r.isMeta) return [];
    const m = r.message || {}; const c = m.content;
    const out = [];
    if (r.type === 'user') {
      if (typeof c === 'string') return this.userText(t, c);
      for (const b of c || []) {
        if (b.type === 'text') out.push(...this.userText(t, b.text));
        else if (b.type === 'tool_result') {
          const tx = textOf(b.content);
          if (/^Async agent launched successfully/.test(tx)) continue; // 배경형 보조: 끝은 <task-notification>이 알린다
          if (this.calls.has(b.tool_use_id)) this.finished.set(b.tool_use_id, t); // 동기형 보조의 최종 보고 = 완료
          if (INTERRUPT_RE.test(tx)) { out.push({ t, kind: 'interrupt' }); continue; } // 도구 실행 중 Esc
          this.noteBackground(b.tool_use_id, tx, t);
          out.push({ t, kind: 'tool_result', text: clip(tx, 6000), error: !!b.is_error });
        }
        else if (b.type === 'image') out.push({ t, kind: 'user', text: '[이미지]' });
      }
      return out;
    }
    if (m.model) this.model = m.model;
    for (const b of c || []) {
      if (b.type === 'text') out.push({ t, kind: 'assistant', text: b.text });
      else if (b.type === 'thinking') out.push({ t, kind: 'thinking', text: clip(b.thinking || '(추론 내용 비공개)', 4000) });
      else if (b.type === 'tool_use') {
        if (b.name === 'AskUserQuestion') out.push({ t, kind: 'ask', text: (b.input?.questions || []).map(q => q.question).join('\n') });
        else if (b.name === 'Agent' || b.name === 'Task') { this.sidechain.add(b.id); this.calls.set(b.id, { t, desc: clip(b.input?.description || '', 120) }); out.push({ t, kind: 'subagent', n: this.sidechain.size, detail: clip(b.input?.description || '', 120), callId: b.id }); } // 서브에이전트 기록은 <세션id>\subagents\agent-*.jsonl 별도 파일(subagents.mjs가 읽는다)
        else {
          if (b.name === 'Bash' || b.name === 'Monitor' || b.name === 'TaskStop' || b.name === 'KillShell') this.toolIn.set(b.id, { name: b.name, desc: clip(b.input?.description || '', 120), task: b.input?.task_id || b.input?.shell_id || null });
          out.push({ t, kind: 'tool', name: b.name, detail: summarizeInput(b.name, b.input) });
        }
      }
    }
    if (m.usage) this.lastUsage = { in: (m.usage.input_tokens || 0) + (m.usage.cache_read_input_tokens || 0) + (m.usage.cache_creation_input_tokens || 0), out: m.usage.output_tokens || 0 };
    return out;
  }
  /** 배경형 보조 작업의 끝 = <task-notification>의 <tool-use-id>(부모 Agent 호출 id)와 <status>. user 본문·queue-operation·attachment 어디에 있든 같은 규칙.
   *  같은 알림의 <task-id>(보조 agent id)도 finishedByTask 에 적는다 — SendMessage 로 재개된 보조는 tool-use-id 가 달라져도 task-id 는 같다(v2.47.1). */
  noteTaskNotification(s, t) {
    // 알림 덩어리마다 따로 본다(v2.80): 한 글에 여러 알림이 붙으면 상태 없는 감시 이벤트의 task-id 가 다음 알림의 <status> 와 짝지어지던 구멍을 막는다.
    // 끝 = <status> 가 있는 알림(completed·failed·killed) 또는 감시 만료 이벤트("[Monitor expired …]"). 상태 없는 감시 이벤트는 끝이 아니다.
    for (const m of String(s).matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
      const body = m[1];
      const ended = /<status>[^<]+<\/status>/.test(body) || /\[Monitor expired\b/.test(body);
      if (!ended) continue;
      const tu = body.match(/<tool-use-id>([^<]+)<\/tool-use-id>/)?.[1].trim();
      if (tu && this.calls.has(tu)) this.finished.set(tu, t);
      const tk = body.match(/<task-id>([^<]+)<\/task-id>/)?.[1].trim();
      if (tk) this.finishedByTask.set(tk, t);
    }
  }
  userText(t, s) {
    if (!s) return [];
    const cmd = s.match(/<command-name>([^<]+)<\/command-name>/);
    if (cmd) { const args = s.match(/<command-args>([^<]*)<\/command-args>/); return [{ t, kind: 'command', text: `${cmd[1]}${args && args[1] ? ' ' + args[1] : ''}` }]; }
    this.noteTaskNotification(s, t);
    // Esc 로 멈춤(v2.80): 클로드코드는 "[Request interrupted by user]"(…for tool use) 를 사용자 글로 남긴다 — 요청이 아니라 중단 표식이다.
    if (INTERRUPT_RE.test(s)) return [{ t, kind: 'interrupt' }];
    // 사용자 차례로 들어온 작업 알림(배경 명령·보조 작업·감시 끝남)은 요청은 아니지만 새 차례를 연다(v2.79, 2026-10-07 사용자 신고).
    // 숨기기만 하면 화면이 차례 경계를 몰라 알림에 대한 답이 앞 결과를 "과정"으로 밀어낸다 → notice 항목으로 넘겨 경계로 쓴다.
    // 작업 도중 흡수된 알림(queue-operation·attachment)은 새 차례를 열지 않으므로 위 fromClaude 에서처럼 계속 버린다.
    if (/^\s*<task-notification>/.test(s)) { const notes = noticeLines(s); return notes.length ? [{ t, kind: 'notice', text: notes.join('\n'), n: notes.length }] : []; }
    // 시스템이 만든 사용자 차례(리마인더·로컬 명령 출력)는 요청이 아니므로 숨긴다
    if (/^\s*<(system-reminder|local-command-stdout|local-command-caveat|command-message)/.test(s)) return [];
    // 본문 뒤에 붙는 system-reminder 는 잘라낸다
    let body = s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
    // 괄호 붙여넣기 표식(v2.72): Face 는 요청을 CLI 입력창에 붙여넣기로 넣는데(sessions.mjs send), 클로드코드 2.1.27x 는
    // 붙여넣은 글을 `<pasted_content id="…">…</pasted_content id="…">` 로 감싸 기록한다. 화면엔 글만 보인다.
    body = stripPasteMarks(body);
    // Face가 첫 요청 앞에 붙인 안내문은 화면에서 지운다
    body = stripFaceNote(body).trim();
    // Face가 앞에 붙인 위임 정책 단락은 표식만 남긴다
    let policy = false;
    const pm = body.match(/^\[IRIS-Face 위임 정책[\s\S]*?아래가 실제 요청이다\.\s*/);
    if (pm) { body = body.slice(pm[0].length).trim(); policy = true; }
    return body ? [{ t, kind: 'user', text: body, policy }] : [];
  }

  // ---------- Codex ----------
  fromCodex(r) {
    const t = r.timestamp || null; const p = r.payload || {};
    switch (r.type) {
      case 'session_meta': return [];
      case 'turn_context': if (p.model) this.model = p.model; return [];
      case 'compacted': return [{ t, kind: 'compact', text: '' }];
      case 'token_usage_record': return [];
      case 'world_state': return [];
      case 'event_msg': {
        if (p.type === 'token_count') { const u = p.info?.last_token_usage || p.info?.total_token_usage; if (u) this.lastUsage = { in: u.input_tokens || 0, out: u.output_tokens || 0, total: u.total_tokens || 0 }; if (p.info?.model_context_window) this.window = p.info.model_context_window; return []; }
        if (p.type === 'task_started') { this.turnOpen = true; if (p.model_context_window) this.window = p.model_context_window; return []; }
        if (p.type === 'task_complete') { this.turnOpen = false; this.turnDoneAt = t; return []; } // 코덱스 보조 rollout의 완료 신호(2026-08-31 실측: task_started/complete 7:7)
        if (p.type === 'turn_aborted') { this.turnOpen = false; return [{ t, kind: 'interrupt' }]; } // Esc 중단(v2.80): 코덱스는 task_complete 없이 turn_aborted 만 남긴다(실측 started 217 · complete 144 · aborted 48)
        if (p.type === 'compacted' || p.type === 'context_compacted') return [{ t, kind: 'compact', text: '' }];
        if (p.type === 'request_user_input' || p.type === 'exec_approval_request' || p.type === 'apply_patch_approval_request') return [{ t, kind: 'ask', text: p.reason || p.command?.join?.(' ') || '승인·답변이 필요합니다' }];
        return [];
      }
      case 'response_item': {
        if (p.type === 'message') {
          const kinds = p.internal_chat_message_metadata_passthrough?.content_item_kinds || [];
          if (p.role === 'developer' || p.role === 'system') return [];
          const text = textOf(p.content);
          if (p.role === 'user') {
            if (kinds.some(k => /environment_context|instructions|skills/.test(k))) return [];
            if (/^\s*<(environment_context|permissions|collaboration_mode|user_instructions|turn_aborted)/.test(text) || /^# AGENTS\.md/.test(text)) return [];
            const clean = stripFaceNote(stripPasteMarks(text)).trim(); // Face 안내문·붙여넣기 표식은 화면에서 지운다
            return clean ? [{ t, kind: 'user', text: clean }] : [];
          }
          if (p.role === 'assistant') return text ? [{ t, kind: 'assistant', text, phase: p.phase || null }] : [];
          return [];
        }
        if (p.type === 'reasoning') { const s = textOf(p.summary); return [{ t, kind: 'thinking', text: clip(s || '(추론 내용 비공개)', 4000) }]; }
        if (p.type === 'function_call' || p.type === 'custom_tool_call') {
          const name = p.name || '?';
          if (name === 'spawn_agent') { const cid = p.call_id || String(this.seq); this.sidechain.add(cid); this.calls.set(cid, { t, desc: '' }); return [{ t, kind: 'subagent', n: this.sidechain.size, callId: cid }]; }
          if (name === 'request_user_input') return [{ t, kind: 'ask', text: '답변이 필요합니다' }];
          const raw = p.type === 'function_call' ? p.arguments : p.input;
          return [{ t, kind: 'tool', name, detail: summarizeInput(name, safeJson(raw)) }];
        }
        if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
          let o = p.output;
          if (typeof o === 'string' && /^\s*\[/.test(o)) { try { o = JSON.parse(o); } catch {} }
          o = typeof o === 'string' ? o : (Array.isArray(o) ? textOf(o) : textOf(o?.content) || JSON.stringify(o || ''));
          return [{ t, kind: 'tool_result', text: clip(o, 6000) }];
        }
        return this.countUnknown(p.type, ['web_search_call', 'local_shell_call', 'local_shell_call_output', 'ghost_snapshot', 'agent_message', 'inter_agent_communication_metadata']);
      }
      default: return this.countUnknown(r.type, []);
    }
  }
  countUnknown(type, silent) {
    if (silent.includes(type)) return [];
    this.unknown++;
    return [{ t: null, kind: 'unknown', name: type, n: this.unknown }];
  }
}

/** 작업 알림 글 → 화면용 한 줄씩(알림 하나당 한 줄, 한 메시지에 여러 개면 여러 줄). 모르는 요약은 원문 그대로. */
export function noticeLines(s) {
  const out = [];
  for (const m of String(s).matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
    const body = m[1];
    const status = (body.match(/<status>([^<]*)<\/status>/)?.[1] || '').trim();
    const sum = (body.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').trim();
    const q = sum.match(/"([\s\S]*)"/); const desc = q ? q[1].trim() : '';
    const end = status === 'failed' ? '실패' : status === 'killed' ? '중단됨' : '끝남';
    let label;
    if (/^Background command/i.test(sum)) label = `배경 명령 ${end}`;
    else if (/^Monitor event/i.test(sum)) label = '감시 알림';
    else if (/^Monitor/i.test(sum)) label = `감시 ${end}`;
    else if (/^(Background agent|Agent)\b/i.test(sum)) label = `보조 작업 ${end}`;
    else if (/^Dynamic workflow/i.test(sum)) label = `워크플로 ${end}`;
    else label = null;
    const line = (label ? (desc ? `${label} · ${desc}` : label) : (sum || '작업 알림')).replace(/\s+/g, ' ');
    out.push(line.length > 200 ? line.slice(0, 199) + '…' : line); // 한 줄 유지(clip 은 줄바꿈을 붙여 알림 줄이 쪼개진다)
  }
  return out;
}

function safeJson(s) { if (typeof s !== 'string') return s; try { return JSON.parse(s); } catch { return { raw: s }; } }
function summarizeInput(name, input) {
  if (!input || typeof input !== 'object') return typeof input === 'string' ? clip(input, 300) : '';
  const first = input.command || input.cmd || input.file_path || input.path || input.pattern || input.query || input.url || input.description || input.prompt || input.raw;
  if (typeof first === 'string') return clip(first, 300);
  if (Array.isArray(first)) return clip(first.join(' '), 300);
  const keys = Object.keys(input); if (!keys.length) return '';
  return clip(keys.map(k => `${k}=${typeof input[k] === 'string' ? input[k] : JSON.stringify(input[k])}`).join(' · '), 300);
}
