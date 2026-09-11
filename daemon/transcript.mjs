// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 기록파일 꼬리 읽기 + 정규화 (읽기 전용). 클로드 projects\*.jsonl · 코덱스 sessions\rollout-*.jsonl
// 정규화 항목: { i, t, kind, text?, name?, detail?, n? }
//   kind: user | assistant | thinking | tool | tool_result | ask | command | compact | usage | subagent | unknown
import fs from 'node:fs';
import { stripFaceNote } from './facenote.mjs';

const MAX_ITEMS = 5000;
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
    //   tools    = 이 기록 안의 도구 호출 수 · firstT/lastT = 첫·마지막 항목 시각 · turnOpen = 코덱스 task_started~task_complete 사이면 true
    this.calls = new Map(); this.finished = new Map(); this.tools = 0; this.firstT = null; this.lastT = null; this.turnOpen = null; this.turnDoneAt = null;
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
        else out.push({ t, kind: 'tool', name: b.name, detail: summarizeInput(b.name, b.input) });
      }
    }
    if (m.usage) this.lastUsage = { in: (m.usage.input_tokens || 0) + (m.usage.cache_read_input_tokens || 0) + (m.usage.cache_creation_input_tokens || 0), out: m.usage.output_tokens || 0 };
    return out;
  }
  /** 배경형 보조 작업의 끝 = <task-notification>의 <tool-use-id>(부모 Agent 호출 id)와 <status>. user 본문·queue-operation·attachment 어디에 있든 같은 규칙. */
  noteTaskNotification(s, t) {
    const tn = s.match(/<task-notification>[\s\S]*?<tool-use-id>([^<]+)<\/tool-use-id>[\s\S]*?<status>([^<]+)<\/status>/);
    if (tn && this.calls.has(tn[1].trim())) this.finished.set(tn[1].trim(), t);
  }
  userText(t, s) {
    if (!s) return [];
    const cmd = s.match(/<command-name>([^<]+)<\/command-name>/);
    if (cmd) { const args = s.match(/<command-args>([^<]*)<\/command-args>/); return [{ t, kind: 'command', text: `${cmd[1]}${args && args[1] ? ' ' + args[1] : ''}` }]; }
    this.noteTaskNotification(s, t);
    // 시스템이 만든 사용자 차례(서브에이전트 완료 알림·리마인더·로컬 명령 출력)는 요청이 아니므로 숨긴다
    if (/^\s*<(system-reminder|local-command-stdout|local-command-caveat|command-message|task-notification)/.test(s)) return [];
    // 본문 뒤에 붙는 system-reminder 는 잘라낸다
    let body = s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
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
            const clean = stripFaceNote(text).trim(); // Face 안내문은 화면에서 지운다
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

function safeJson(s) { if (typeof s !== 'string') return s; try { return JSON.parse(s); } catch { return { raw: s }; } }
function summarizeInput(name, input) {
  if (!input || typeof input !== 'object') return typeof input === 'string' ? clip(input, 300) : '';
  const first = input.command || input.cmd || input.file_path || input.path || input.pattern || input.query || input.url || input.description || input.prompt || input.raw;
  if (typeof first === 'string') return clip(first, 300);
  if (Array.isArray(first)) return clip(first.join(' '), 300);
  const keys = Object.keys(input); if (!keys.length) return '';
  return clip(keys.map(k => `${k}=${typeof input[k] === 'string' ? input[k] : JSON.stringify(input[k])}`).join(' · '), 300);
}
