// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 어댑터(기록 해석) — Codex. 기록 한 줄을 정규화 항목으로 바꾸고 차례를 판정한다.
// 실행 설정(설정 폴더·상태 폴더 자리)과 떨어져 있다 — 이 파일을 불러오는 것만으로는 환경 변수를 읽거나 폴더를 찾지 않는다(transcript.mjs 가 이 파일만 쓴다).
// tail = 그 기록을 읽고 있는 TranscriptTail(누적 상태를 여기에 적는다 — transcript.mjs 머리말 참조).
import { stripFaceNote, stripPasteMarks } from '../facenote.mjs';
import { clip, textOf, safeJson, summarizeInput } from '../recordutil.mjs';

export function parseRecord(tail, r) {
  const t = r.timestamp || null; const p = r.payload || {};
  switch (r.type) {
    case 'session_meta': return [];
    case 'turn_context': if (p.model) tail.model = p.model; return [];
    case 'compacted': return [{ t, kind: 'compact', text: '' }];
    case 'token_usage_record': return [];
    case 'world_state': return [];
    case 'event_msg': {
      if (p.type === 'token_count') { const u = p.info?.last_token_usage || p.info?.total_token_usage; if (u) tail.lastUsage = { in: u.input_tokens || 0, out: u.output_tokens || 0, total: u.total_tokens || 0 }; if (p.info?.model_context_window) tail.window = p.info.model_context_window; return []; }
      if (p.type === 'task_started') { tail.turnOpen = true; if (p.model_context_window) tail.window = p.model_context_window; return []; }
      if (p.type === 'task_complete') { tail.turnOpen = false; tail.turnDoneAt = t; return []; } // 코덱스 보조 rollout의 완료 신호(2026-08-31 실측: task_started/complete 7:7)
      if (p.type === 'turn_aborted') { tail.turnOpen = false; return [{ t, kind: 'interrupt' }]; } // Esc 중단(v2.80): 코덱스는 task_complete 없이 turn_aborted 만 남긴다(실측 started 217 · complete 144 · aborted 48)
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
        if (name === 'spawn_agent') { const cid = p.call_id || String(tail.seq); tail.sidechain.add(cid); tail.calls.set(cid, { t, desc: '' }); return [{ t, kind: 'subagent', n: tail.sidechain.size, callId: cid }]; }
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
      return tail.countUnknown(p.type, ['web_search_call', 'local_shell_call', 'local_shell_call_output', 'ghost_snapshot', 'agent_message', 'inter_agent_communication_metadata']);
    }
    default: return tail.countUnknown(r.type, []);
  }
}
/** 이 차례가 아직 열려 있는가: task_started~task_complete 사이면 'open', 끝났으면 'closed', 아직 모르면 null */
export const turnState = (tail) => (tail.turnOpen == null ? null : (tail.turnOpen ? 'open' : 'closed'));
// 컨텍스트 창 크기는 기록에 적혀 온다(token_count·task_started) — 추정 함수(contextWindowGuess)를 두지 않는다.
