// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 어댑터(기록 해석) — Antigravity CLI(agy). 기록 = ~/.gemini/antigravity-cli/brain/<대화 id>/.system_generated/logs/transcript.jsonl
// 한 줄 = { step_index, source(USER_EXPLICIT|MODEL|SYSTEM), type(USER_INPUT|PLANNER_RESPONSE|GENERIC|SYSTEM_MESSAGE), status, created_at,
//           content, model, input_tokens, output_tokens, cache_read_tokens, tool_calls:[{ name, args }] }   (1.5.14, 2026-11-23 이 PC 실측)
//   USER_INPUT 의 content = "<USER_REQUEST>\n…\n</USER_REQUEST>\n<ADDITIONAL_METADATA>…" — 사용자 글은 USER_REQUEST 안만.
//   GENERIC(source MODEL) = 도구 결과 글. 도구 인수 값은 JSON 글자로 한 번 더 싸여 온다("\"echo hi\"").
// 🔴 기록에 중단 표식이 없다(Esc 로 끊긴 답도 status DONE) → 차례 판정은 화면으로 한다(turnState = 모름).
// 실행 설정과 떨어져 있다 — 이 파일을 불러오는 것만으로 환경 변수를 읽거나 폴더를 찾지 않는다.
import { stripFaceNote, stripPasteMarks } from '../facenote.mjs';
import { clip, summarizeInput } from '../recordutil.mjs';

/** 사용자 글: <USER_REQUEST> … </USER_REQUEST> 안만(없으면 전체에서 뒤붙임 표를 뗀다) */
export function userRequest(content) {
  const s = String(content ?? '');
  const a = s.indexOf('<USER_REQUEST>');
  if (a >= 0) { const b = s.lastIndexOf('</USER_REQUEST>'); return (b > a ? s.slice(a + 14, b) : s.slice(a + 14)).trim(); }
  return s.split(/\n<(ADDITIONAL_METADATA|USER_SETTINGS_CHANGE)>/)[0].trim();
}
/** 도구 인수 값이 JSON 글자로 싸여 있으면 한 겹 벗긴다 */
function unwrapArgs(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && /^\s*["[{]/.test(v)) { try { out[k] = JSON.parse(v); continue; } catch {} }
    out[k] = v;
  }
  return out;
}
const TOOL_ALIAS = { run_command: 'Bash', view_file: 'Read', write_to_file: 'Write', replace_file_content: 'Edit', multi_replace_file_content: 'Edit', grep_search: 'Grep', find_by_name: 'Glob', list_dir: 'LS', search_web: 'WebSearch', read_url_content: 'WebFetch' };
function toolDetail(name, a) {
  const pick = (...ks) => { for (const k of ks) if (typeof a[k] === 'string' && a[k]) return a[k]; return ''; };
  const alias = TOOL_ALIAS[name];
  if (alias === 'Bash') return clip(pick('CommandLine', 'commandLine', 'command'), 300);
  if (alias === 'Read' || alias === 'Write' || alias === 'Edit') return clip(pick('AbsolutePath', 'TargetFile', 'FilePath', 'Path', 'path'), 300);
  if (alias === 'Grep' || alias === 'Glob') return clip(pick('Query', 'Pattern', 'SearchPath', 'query', 'pattern'), 300);
  if (alias === 'WebSearch') return clip(pick('query', 'Query'), 300);
  if (alias === 'WebFetch') return clip(pick('Url', 'url'), 300);
  return summarizeInput(name, a);
}

export function parseRecord(tail, r) {
  if (!r || typeof r !== 'object') return [];
  const t = r.created_at || null;
  if (typeof r.model === 'string' && r.model) tail.model = r.model;
  if (r.input_tokens != null || r.output_tokens != null) {
    const i = Number(r.input_tokens) || 0, o = Number(r.output_tokens) || 0, c = Number(r.cache_read_tokens) || 0;
    tail.lastUsage = { in: i + c, out: o, total: i + c + o };
  }
  if (r.source === 'USER_EXPLICIT' && r.type === 'USER_INPUT') {
    const clean = stripFaceNote(stripPasteMarks(userRequest(r.content))).trim();
    return clean ? [{ t, kind: 'user', text: clean }] : [];
  }
  if (r.source === 'MODEL' && r.type === 'PLANNER_RESPONSE') {
    const out = [];
    const text = typeof r.content === 'string' ? r.content.trim() : '';
    if (text) out.push({ t, kind: 'assistant', text, phase: null });
    for (const c of Array.isArray(r.tool_calls) ? r.tool_calls : []) {
      const name = String(c?.name || '?');
      if (name === 'ask_question') { out.push({ t, kind: 'ask', text: '답변이 필요합니다' }); continue; }
      out.push({ t, kind: 'tool', name: TOOL_ALIAS[name] || name, detail: toolDetail(name, unwrapArgs(c?.args)) });
    }
    return out;
  }
  if (r.source === 'MODEL' && r.type === 'GENERIC') {
    const text = typeof r.content === 'string' ? r.content : '';
    return text ? [{ t, kind: 'tool_result', text: clip(text, 6000) }] : [];
  }
  if (r.type === 'SYSTEM_MESSAGE') return [];
  return tail.countUnknown(`${r.source || '?'}/${r.type || '?'}`, []);
}
/** 기록에 차례 신호가 없다 — 판정하지 않는다(화면 판정을 그대로 믿는다) */
export const turnState = () => null;
/** 맥락 창 크기(기록에 적혀 오지 않음): Gemini 4 · 3.8 = 100만, 그 밖(Claude · GPT-OSS)은 모름 */
export const contextWindowGuess = (model) => (/^gemini-/i.test(model || '') ? 1048576 : null);
