// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 어댑터(기록 해석) — Claude Code. 기록 한 줄을 정규화 항목으로 바꾸고 차례·컨텍스트 창을 판정한다.
// 실행 설정(설정 폴더·상태 폴더 자리)과 떨어져 있다 — 이 파일을 불러오는 것만으로는 환경 변수를 읽거나 폴더를 찾지 않는다(transcript.mjs 가 이 파일만 쓴다).
// tail = 그 기록을 읽고 있는 TranscriptTail(누적 상태를 여기에 적는다 — transcript.mjs 머리말 참조).
import { stripFaceNote, stripPasteMarks } from '../facenote.mjs';
import { clip, textOf, summarizeInput } from '../recordutil.mjs';

// Esc 중단 표식(클로드코드): 사용자 글 또는 도구 결과 전체가 이 문구다. 글 중간에 인용된 것은 해당 없음(^…$).
const INTERRUPT_RE = /^\s*\[Request interrupted by user(?: for tool use)?\]\s*$/;

export function parseRecord(tail, r) {
  const t = r.timestamp || null;
  if (r.type === 'summary' || r.isCompactSummary) return [{ t, kind: 'compact', text: r.summary || '' }];
  if (r.type === 'ai-title') { if (typeof r.aiTitle === 'string' && r.aiTitle.trim()) tail.aiTitle = r.aiTitle.trim(); return []; }
  if (r.isSidechain && !tail.sub) { if (r.type === 'user' && r.parentUuid == null) tail.sidechain.add(r.uuid); return r.type === 'user' && r.parentUuid == null ? [{ t, kind: 'subagent', n: tail.sidechain.size }] : []; }
  // 배경형 보조의 완료 알림이 부모가 작업 중(다른 도구 대기 중)에 도착하면 user 메시지가 아니라
  // queue-operation(enqueue, reason absorbed_mid_turn)·attachment(queued_command) 레코드로만 남는다
  // (클로드코드 2.1.268, 2026-09-11 실측: 11개 보조 전부 user 메시지 0건 → 영원히 quiet). 이 두 레코드에서도 완료 신호를 읽는다.
  if (r.type === 'queue-operation') { if (r.operation === 'enqueue' && typeof r.content === 'string') noteTaskNotification(tail, r.content, t); return []; }
  if (r.type === 'attachment') { const p = r.attachment?.prompt; if (typeof p === 'string') noteTaskNotification(tail, p, t); return []; }
  if (r.type !== 'user' && r.type !== 'assistant') return tail.countUnknown(r.type, ['attachment', 'last-prompt', 'mode', 'permission-mode', 'atis-latch', 'ai-title', 'file-history-delta', 'file-history-snapshot', 'system', 'progress', 'queue-operation', 'atis', 'last-user-prompt', 'cost-state']);
  if (r.isMeta) { const n = metaNotice(r); return n ? [{ t, kind: 'notice', n: 1, ...n }] : []; } // 시스템이 다시 연 차례(v2.82) — 나머지 isMeta 는 버린다
  const m = r.message || {}; const c = m.content;
  const out = [];
  if (r.type === 'user') {
    if (typeof c === 'string') return userText(tail, t, c);
    for (const b of c || []) {
      if (b.type === 'text') out.push(...userText(tail, t, b.text));
      else if (b.type === 'tool_result') {
        const tx = textOf(b.content);
        if (/^Async agent launched successfully/.test(tx)) continue; // 배경형 보조: 끝은 <task-notification>이 알린다
        if (tail.calls.has(b.tool_use_id)) tail.finished.set(b.tool_use_id, t); // 동기형 보조의 최종 보고 = 완료
        if (INTERRUPT_RE.test(tx)) { out.push({ t, kind: 'interrupt' }); continue; } // 도구 실행 중 Esc
        noteBackground(tail, b.tool_use_id, tx, t);
        out.push({ t, kind: 'tool_result', text: clip(tx, 6000), error: !!b.is_error });
      }
      else if (b.type === 'image') out.push({ t, kind: 'user', text: '[이미지]' });
    }
    return out;
  }
  if (m.model) tail.model = m.model;
  for (const b of c || []) {
    if (b.type === 'text') out.push({ t, kind: 'assistant', text: b.text });
    else if (b.type === 'thinking') out.push({ t, kind: 'thinking', text: clip(b.thinking || '(추론 내용 비공개)', 4000) });
    else if (b.type === 'tool_use') {
      if (b.name === 'AskUserQuestion') out.push({ t, kind: 'ask', text: (b.input?.questions || []).map(q => q.question).join('\n') });
      else if (b.name === 'Agent' || b.name === 'Task') { tail.sidechain.add(b.id); tail.calls.set(b.id, { t, desc: clip(b.input?.description || '', 120) }); out.push({ t, kind: 'subagent', n: tail.sidechain.size, detail: clip(b.input?.description || '', 120), callId: b.id }); } // 서브에이전트 기록은 <세션id>\subagents\agent-*.jsonl 별도 파일(subagents.mjs가 읽는다)
      else {
        if (b.name === 'Bash' || b.name === 'Monitor' || b.name === 'TaskStop' || b.name === 'KillShell') tail.toolIn.set(b.id, { name: b.name, desc: clip(b.input?.description || '', 120), task: b.input?.task_id || b.input?.shell_id || null });
        out.push({ t, kind: 'tool', name: b.name, detail: summarizeInput(b.name, b.input) });
      }
    }
  }
  if (m.usage) tail.lastUsage = { in: (m.usage.input_tokens || 0) + (m.usage.cache_read_input_tokens || 0) + (m.usage.cache_creation_input_tokens || 0), out: m.usage.output_tokens || 0 };
  return out;
}
/** 도구 결과 글에서 배경 작업의 시작을 읽는다(클로드코드 2.1.27x 실측 문구). */
function noteBackground(tail, toolUseId, tx, t) {
  const ms = Date.parse(t || '') || Date.now();
  const inp = tail.toolIn.get(toolUseId) || {}; tail.toolIn.delete(toolUseId); // 결과가 오면 재료는 다 쓴 것
  // 문구는 도구 결과의 **맨 앞**에만 온다(v2.81.1) — 문서·코드를 출력한 결과 속 예시 문장("…with ID: X")을 배경 작업으로 오인해
  // 끝날 일 없는 유령이 24시간 파란 고리를 붙잡던 사건(2026-10-07, 구현계획.md 를 sed 로 읽은 결과).
  const head = tx.trimStart();
  let m = head.match(/^Command running in background with ID: ([\w-]+)/) || head.match(/^Command did not complete within [^\n]*? moved to the background \(ID: ([\w-]+)\)/);
  if (m) { tail.bg.set(m[1], { t: ms, kind: 'bash', desc: inp.desc || '', until: null }); return; }
  m = tx.match(/^Monitor started \(task ([\w-]+)(?:, expires in (\d+(?:\.\d+)?)\s*(ms|s|m|h))?/);
  if (m) { const unit = { ms: 1, s: 1000, m: 60000, h: 3600000 }[m[3]] || 0; tail.bg.set(m[1], { t: ms, kind: 'monitor', desc: inp.desc || '', until: m[2] ? ms + Number(m[2]) * unit : null }); return; }
  if ((inp.name === 'TaskStop' || inp.name === 'KillShell') && inp.task) tail.finishedByTask.set(inp.task, t);
}
/** 배경형 보조 작업의 끝 = <task-notification>의 <tool-use-id>(부모 Agent 호출 id)와 <status>. user 본문·queue-operation·attachment 어디에 있든 같은 규칙.
 *  같은 알림의 <task-id>(보조 agent id)도 finishedByTask 에 적는다 — SendMessage 로 재개된 보조는 tool-use-id 가 달라져도 task-id 는 같다(v2.47.1). */
function noteTaskNotification(tail, s, t) {
  // 알림 덩어리마다 따로 본다(v2.80): 한 글에 여러 알림이 붙으면 상태 없는 감시 이벤트의 task-id 가 다음 알림의 <status> 와 짝지어지던 구멍을 막는다.
  // 끝 = <status> 가 있는 알림(completed·failed·killed) 또는 감시 만료 이벤트("[Monitor expired …]"). 상태 없는 감시 이벤트는 끝이 아니다.
  for (const m of String(s).matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
    const body = m[1];
    const ended = /<status>[^<]+<\/status>/.test(body) || /\[Monitor expired\b/.test(body);
    if (!ended) continue;
    const tu = body.match(/<tool-use-id>([^<]+)<\/tool-use-id>/)?.[1].trim();
    if (tu && tail.calls.has(tu)) tail.finished.set(tu, t);
    const tk = body.match(/<task-id>([^<]+)<\/task-id>/)?.[1].trim();
    if (tk) tail.finishedByTask.set(tk, t);
  }
}
function userText(tail, t, s) {
  if (!s) return [];
  const cmd = s.match(/<command-name>([^<]+)<\/command-name>/);
  if (cmd) { const args = s.match(/<command-args>([^<]*)<\/command-args>/); return [{ t, kind: 'command', text: `${cmd[1]}${args && args[1] ? ' ' + args[1] : ''}` }]; }
  noteTaskNotification(tail, s, t);
  // Esc 로 멈춤(v2.80): 클로드코드는 "[Request interrupted by user]"(…for tool use) 를 사용자 글로 남긴다 — 요청이 아니라 중단 표식이다.
  if (INTERRUPT_RE.test(s)) return [{ t, kind: 'interrupt' }];
  // 사용자 차례로 들어온 작업 알림(배경 명령·보조 작업·감시 끝남)은 요청은 아니지만 새 차례를 연다(v2.79, 2026-10-07 사용자 신고).
  // 숨기기만 하면 화면이 차례 경계를 몰라 알림에 대한 답이 앞 결과를 "과정"으로 밀어낸다 → notice 항목으로 넘겨 경계로 쓴다.
  // 작업 도중 흡수된 알림(queue-operation·attachment)은 새 차례를 열지 않으므로 위 parseRecord 에서처럼 계속 버린다.
  if (/^\s*<task-notification>/.test(s)) { const notes = noticeLines(s); return notes.length ? [{ t, kind: 'notice', src: 'task', text: notes.join('\n'), n: notes.length }] : []; }
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

/** 이 차례가 아직 열려 있는가: 마지막 항목(생각·압축·알림 제외)이 요청·명령·도구 호출·도구 결과·보조 호출이면 'open'(모델이 아직 답할 차례),
 *  질문 카드(ask)·중단이면 'closed'(사람 차례), 답 글이면 null(다음 도구 호출 전 생각 중일 수 있어 단정하지 않는다). */
export function turnState(tail) {
  for (let i = tail.items.length - 1; i >= 0; i--) {
    const k = tail.items[i].kind;
    if (k === 'thinking' || k === 'compact' || k === 'notice') continue; // notice(v2.79)는 화면 경계용 — 판정은 예전처럼 알림이 없던 것과 같게
    if (k === 'user' || k === 'command' || k === 'tool' || k === 'tool_result' || k === 'subagent') return 'open';
    if (k === 'ask' || k === 'interrupt') return 'closed'; // interrupt(v2.80) = Esc 로 멈춤 → 사람 차례(예전엔 사용자 글로 읽혀 'open' → 진행 중으로 굳었다)
    return null;
  }
  return null;
}
/** 기록에 컨텍스트 창 크기가 없을 때의 추정: Claude 5 계열 1M — Haiku 5.5 포함, Haiku 4.x 이하 200k */
export const contextWindowGuess = (model) => (/haiku-[1-4]/i.test(model || '') ? 200000 : 1000000);

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

/** 시스템이 사용자 자리에 넣은 글(isMeta) 가운데 **끝난 차례를 다시 여는 것**만 notice 재료로 바꾼다(v2.82, 2026-10-11 사용자 신고
 *  "출력이 2개가 나왔는데 마지막 출력만 대화에 표시되네"). 숨기면 화면이 차례 경계를 몰라 뒤의 답이 앞 결과를 "과정"으로 밀어낸다.
 *  대상(이 PC 기록 946개 실측, 답이 끝난 직후에 온 것): 정지 훅 피드백 180건 · 예약 깨우기 약 95건 · 끊긴 답 이어쓰기 12건 · 다른 세션 메시지 1건.
 *  차례 중간의 isMeta(이미지 설명·스킬 본문·로컬 명령 머리말)는 null → 예전처럼 버린다.
 *  @returns {{src:'stop-hook'|'scheduled'|'peer'|'resume', text:string, detail:string}|null} */
export function metaNotice(r) {
  const s = textOf(r?.message?.content).replace(/\r\n/g, '\n').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  const firstLine = (x) => (String(x || '').split('\n').map(l => l.trim()).find(Boolean) || '');
  const one = (x) => { const l = x.replace(/\s+/g, ' ').trim(); return l.length > 200 ? l.slice(0, 199) + '…' : l; }; // noticeLines 와 같은 한 줄 규칙
  if (/^Stop hook feedback:/.test(s)) {
    const body = s.replace(/^Stop hook feedback:[ \t]*\n?/, '').trim();
    const head = firstLine(body); const m = head.match(/^\[([^\]\n]{1,60})\]\s*(.*)$/);
    return { src: 'stop-hook', text: one(m ? `정지 훅 · ${m[1]}${m[2] ? ' — ' + m[2] : ''}` : `정지 훅${head ? ' — ' + head : ''}`), detail: body };
  }
  if (r.turnOrigin === 'scheduled') return { src: 'scheduled', text: one(`예약 깨우기${s ? ' · ' + firstLine(s) : ''}`), detail: s };
  if (r.turnOrigin === 'peer' || r.origin?.kind === 'peer') {
    const name = r.origin?.name || r.origin?.from || s.match(/<agent-message from="([^"]+)"/)?.[1] || '';
    const body = (typeof r.origin?.body === 'string' ? r.origin.body : (s.match(/<agent-message[^>]*>\n?([\s\S]*?)\n?<\/agent-message>/)?.[1] || s)).trim();
    return { src: 'peer', text: one(`다른 세션 메시지${name ? ' · ' + name : ''}${body ? ' — ' + firstLine(body) : ''}`), detail: body };
  }
  if (r.turnCompanion) {
    const why = /cut off mid-stream/i.test(s) ? '답이 중간에 끊겨 이어 씀' : /safety classifier/i.test(s) ? '안전 분류기가 답을 멈춰 이어 씀'
      : /no visible output/i.test(s) ? '보이는 답이 없어 이어 씀' : '답을 이어 씀';
    return { src: 'resume', text: why, detail: s };
  }
  return null;
}
