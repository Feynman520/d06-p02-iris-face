// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 어댑터 — Codex. 이 CLI 에만 해당하는 것(목록 뼈대·권한 칸·실행 명령)을 한 파일에 모은다.
// 바깥은 daemon/agents.mjs 의 공개 함수(normalize·buildCommand …)로만 쓴다 — 여기 함수는 그 안에서 불린다.
//   codex -m <model> -c model_reasoning_effort=<effort> -c service_tier=fast [--sandbox read-only]   (재개: codex resume <id>)
//           service_tier=fast = 코덱스 /fast(빠른 응답) 항상 켬 — 사용자 결정 2026-09-09. 설정 파일이 아니라 시작 플래그로만 준다.
import fs from 'node:fs';
import path from 'node:path';
import { soulRoot } from '../paths.mjs';
import { normCwd, readFirstLine } from '../recordutil.mjs';
import { preTrust as trustBeforeSpawn } from '../trust.mjs';

export const id = 'codex';
export const CODEX_HOME = process.env.CODEX_HOME || path.join(soulRoot(), '_agent', 'codex');

/** fast(빠른 응답)는 모델과 상관없이 늘 켠다 */
export const isFast = () => true;

/** 목록 뼈대(AGENTS.codex 그 자체 — models 배열은 daemon/models.mjs 가 제자리에서 바꾼다) */
export const table = {
  label: 'Codex',
  // 2026-09-22 GPT-6 Sol(복잡한 코딩·에이전트, 기본)·Luna(가볍고 대량) 출시, 5.6 계열은 코덱스가 "Older" 로 내림(Terra 후속 없음).
  // 사고깊이는 코덱스 0.156.0 모델 메타데이터(models_cache.json, 2026-09-23 실측) 그대로: astra·sol·terra·5.6-sol = ultra 까지, luna 계열 = max 까지.
  // 5.6 계열은 저장된 선택(localStorage iris.sel)과의 호환을 위해 "(구)" 표시로 남긴다. gpt-5.5 는 2026-10-14 은퇴라 넣지 않는다.
  // 2026-10-27: GPT-6.1 Sol(최신 주력, 기본)·GPT-6.1 Terra 추가(코덱스 0.164.0 models_cache.json 실측, 둘 다 ultra 까지).
  //   gpt-6-sol 은 코덱스가 "Previous generation" 으로 내려 "(이전)" 표시. Luna 는 6.1 판이 없어 gpt-6-luna 가 그대로 최신.
  models: [
    { id: 'gpt-6.1-sol',   label: 'gpt-6.1-sol' },
    { id: 'gpt-6-astra',   label: 'gpt-6-astra' },
    { id: 'gpt-6.1-terra', label: 'gpt-6.1-terra' },
    { id: 'gpt-6-sol',     label: 'gpt-6-sol (이전)' },
    { id: 'gpt-6-luna',    label: 'gpt-6-luna',  efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { id: 'gpt-5.6-terra', label: 'gpt-5.6-terra (구)' },
    { id: 'gpt-5.6-sol',   label: 'gpt-5.6-sol (구)' },
    { id: 'gpt-5.6-luna',  label: 'gpt-5.6-luna (구)', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  ],
  efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  default: { model: 'gpt-6.1-sol', effort: 'medium' },
  // -a/--ask-for-approval · -s/--sandbox (빈 값 = 설정 파일 config.toml 대로)
  approvals: [{ id: '', label: '설정 파일대로' }, { id: 'never', label: '묻지 않음' }, { id: 'on-request', label: '모델이 필요할 때 묻기' }],
  sandboxes: [{ id: '', label: '설정 파일대로' }, { id: 'read-only', label: '읽기 전용' }, { id: 'workspace-write', label: '작업 폴더 쓰기' }, { id: 'danger-full-access', label: '전체 접근' }],
};

/** 권한 칸: 코덱스는 approval·sandbox 둘을 쓴다(클로드 칸 permission 은 빈 값) */
export function permissionFields(sel, t) {
  const approval = t.approvals.some(p => p.id === sel.approval) ? sel.approval : '';
  let sandbox = t.sandboxes.some(p => p.id === sel.sandbox) ? sel.sandbox : '';
  if (!sandbox && sel.readOnly) sandbox = 'read-only'; // 예전 필드 호환
  return { permission: '', approval, sandbox };
}
/** 목록 항목에 정확한 이름(actual)이 없을 때 CLI 에 넘길 이름: 목록의 이름 그대로 */
export const actualFallback = (model) => model;
/** 재개가 지켜도 되는 "쓰던 정확한 모델 이름"의 머리 글자(이름 모양 검사는 agents.mjs 가 먼저 한다) */
export const actualPrefix = 'gpt-';
/** 권한 표시용 짧은 말(tables = AGENTS 표 — 이름표는 부르는 그 순간의 표에서 찾는다) */
export function permLabel(s, tables) {
  const parts = ['⚡ fast']; if (s.approval) parts.push(tables.codex.approvals.find(p => p.id === s.approval)?.label);
  if (s.sandbox) parts.push(tables.codex.sandboxes.find(p => p.id === s.sandbox)?.label);
  return parts.join(' · ');
}

/** 실행 명령(s = 정리된 선택값). 새 대화의 id 는 코덱스가 정하므로(rollout 파일) 여기서는 재개 id 만 돌려준다. */
export function buildCommand(s, cwd, { resumeId } = {}) {
  // --dangerously-bypass-hook-trust(2026-09-19, v2.70): 코덱스 0.154+ 는 hooks.json 이 새것이면 첫 실행에 "Hooks need review" 를 띄운다.
  // 설치기가 config.toml 에 bypass_hook_trust=true 를 적어도 TUI 는 이 물음을 냈다(데스크탑 실측) → 세션 인수로 확실히 건너뛴다.
  // IRIS 세션은 최대 권한(approval never · danger-full-access)이 사용자 결정이고 훅은 설치기가 쓴 것이라 같은 결정의 연장.
  const base = ['codex', '-m', s.modelActual || s.model, ...(s.effort ? ['-c', `model_reasoning_effort=${s.effort}`] : []), '-c', 'service_tier=fast', '--dangerously-bypass-hook-trust', ...(s.approval ? ['-a', s.approval] : []), ...(s.sandbox ? ['--sandbox', s.sandbox] : [])];
  const args = resumeId ? [...base, 'resume', resumeId] : base;
  return { file: 'cmd.exe', args: ['/c', ...args], sessionId: resumeId, resumeCmd: resumeId ? `codex resume ${resumeId}` : '', cmdline: args.join(' ') };
}

// ───────────────────────── 세션을 띄우기 직전 · 재개 전 · 확인 카드 ─────────────────────────
/** 폴더 신뢰 물음 선답: config.toml 에 이 폴더의 신뢰 표를 덧붙인다(env = 자식에게 줄 환경 — 설정 폴더는 거기 것이 먼저). 절대 던지지 않는다. */
export const preTrust = (cwd, env) => trustBeforeSpawn({ agent: id, cwd, env, fallback: { codexHome: CODEX_HOME } });
/**
 * 코덱스 재개 전: 이 대화를 만든 연결 이름이 지금 설정과 다르면(설치 패키지 2.0.49 의 openai → iris 등) 맞춘다.
 * 지금 연결이 이 PC 중계기일 때만 맞추고(원본 백업 + history.jsonl), 아니면 이유만 남겨 곧 끝날 때 화면에 보인다.
 * (sm = SessionManager — alignCodex · codexHome 은 시험이 가짜로 바꿔 끼울 수 있게 거기 달려 있다) @returns 곧 끝났을 때 카드에 보일 이유(없으면 null)
 */
export function beforeResume(sm, sid, rec, faceVersion) {
  let preReason = null;
  try {
    const a = sm.alignCodex({ codexHome: sm.codexHome, threadId: rec.sessionId, faceVersion, log: (m) => sm.hooks.onLog?.(`${sid} ${m}`) });
    if (a && a.action !== 'none') rec.compat = { action: a.action, from: a.from, to: a.to, at: new Date().toISOString(), ...(a.backup ? { backup: a.backup } : {}) };
    if (a && (a.action === 'blocked' || a.action === 'error')) preReason = a.reason || null;
  } catch (e) { sm.hooks.onLog?.(`${sid} codex-compat skipped: ${e?.message || e}`); }
  return preReason;
}
/** 코덱스 대화상자(번호·글자 선택지)는 숫자만 눌러서는 확정되지 않고 Enter 가 따라야 한다("Update available" 자동 응답과 같은 규칙,
 *  2026-09-19 데스크탑 실측: 훅 신뢰 물음의 「2」 클릭 무반응). 코덱스 세션의 한 글자 키에 Enter 를 붙인다(write 가 160ms 뒤에 나눠 보냄). */
export function promptKeys(prompt) {
  if (!prompt || !Array.isArray(prompt.options)) return prompt;
  const fix = (k) => (/^[0-9a-z]$/i.test(String(k ?? '')) ? `${k}\r` : k);
  return { ...prompt, options: prompt.options.map((o) => ({ ...o, key: fix(o.key) })), actions: Array.isArray(prompt.actions) ? prompt.actions : prompt.actions };
}

// ───────────────────────── 보조 작업(서브에이전트) ─────────────────────────
//   같은 sessions\YYYY\MM\DD\ 의 rollout-*.jsonl 중 session_meta.payload.parent_thread_id == 부모 세션 id.
//   이름 = agent_nickname(+agent_path 끝 마디). 완료 = 그 rollout의 마지막 task_started 뒤 task_complete(2026-08-31 실측 7:7).
//   (w = SubagentWatcher — 부모 세션의 기록 경로·세션 id 와 보조 목록 subs 를 지닌다)
const dayDir = (d) => path.join(CODEX_HOME, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
/** 살펴볼 폴더들 */
export function subagentDirs(w) {
  const out = new Set([path.dirname(w.recordPath), dayDir(new Date()), dayDir(new Date(Date.now() - 86400000))]);
  return [...out];
}
export const subagentFilePrefix = 'rollout-';
/** 보조 기록 파일 하나를 목록에 올린다 — 첫 줄의 부모 id 가 이 세션일 때만(makeTail = 그 파일을 읽을 꼬리 읽기를 만드는 함수) */
export function addSubagent(w, file, makeTail) {
  let meta; try { meta = JSON.parse(readFirstLine(file) || 'null'); } catch { meta = null; }
  const p = meta?.payload; if (!p || meta.type !== 'session_meta' || !p.parent_thread_id || p.parent_thread_id !== w.sessionId) return false;
  const sp = p.source?.subagent?.thread_spawn || {};
  const nick = sp.agent_nickname || ''; const role = sp.agent_path ? String(sp.agent_path).split('/').filter(Boolean).pop() : '';
  const key = p.id || path.basename(file, '.jsonl');
  w.subs.set(key, {
    key, file, agentType: role, name: [nick, role].filter(Boolean).join(' · ') || key, detail: '',
    model: '', toolUseId: null, background: false,
    status: 'running', startedAt: p.timestamp || meta.timestamp || null, endedAt: null, lastAt: p.timestamp || null, tools: 0, items: 0,
    tail: makeTail(file),
  });
  return true;
}
/** 설명이 비어 있으면 그 보조가 받은 첫 요청의 첫 줄로 채운다 */
export const subagentDetail = (s) => s.tail.firstUser.split('\n')[0].slice(0, 120);
/** 끝났는가: 그 보조 rollout 의 차례가 닫혔으면(task_complete·turn_aborted) */
export const subagentDone = (w, s) => s.tail.turnOpen === false;
export const subagentEndedAt = (w, s) => s.tail.turnDoneAt || null;

// ───────────────────────── 제목 생성(헤드리스) ─────────────────────────
/** 제목 한 줄을 짓게 할 실행 사양. codex.cmd(심)는 PATH 로 찾는다 — cmd.exe /c 를 거치므로 요청문은 인수가 아니라 표준 입력으로 넘긴다(따옴표·한글 안전). */
export function titleCommand({ system, request, model, codexTitleModel }) {
  // --dangerously-bypass-hook-trust: 코덱스 0.156.0 부터 설정 키 bypass_hook_trust 는 무시("unrecognized configuration setting")되고 이 깃발만 통한다(2026-09-23 실측; TUI 세션과 같은 깃발).
  return { file: 'cmd.exe', args: ['/c', 'codex', 'exec', '--skip-git-repo-check', '--dangerously-bypass-hook-trust', '-m', model || codexTitleModel, '-c', 'model_reasoning_effort=low', '-'], stdinText: `${system}\n\n${request}\n` };
}
/** 헤드리스 출력에서 제목 재료: 마지막 답 줄(앞에 "tokens used" 같은 진행 줄이 섞인다 — lastAnswer 는 titler.mjs 의 것) */
export const titleFromOutput = (out, { lastAnswer }) => lastAnswer(out);

// ───────────────────────── 기록 파일 찾기 ─────────────────────────
/** 코덱스 롤아웃 파일은 첫 메시지 뒤에 생기므로 세션이 살아 있는 동안 3초마다 cwd로 짝을 맞춘다
 *  (sm = SessionManager — 카드 표·살아 있는 세션 표·저장·방송을 빌려 쓴다) */
export function watchRecord(sm, id, rec) {
  const started = Date.now();
  const known = new Set([...sm.sessions.values()].map(r => r.recordPath).filter(Boolean));
  const tick = () => {
    if (!sm.sessions.has(id) || rec.recordPath || !sm.live.has(id)) return;
    try {
      for (const dir of recentSessionDirs()) for (const f of fs.readdirSync(dir)) {
        if (!f.startsWith('rollout-') || !f.endsWith('.jsonl')) continue;
        const full = path.join(dir, f); if (known.has(full)) continue;
        if (fs.statSync(full).mtimeMs < started - 10_000) continue;
        const first = readFirstLine(full); if (!first) continue;
        let meta; try { meta = JSON.parse(first); } catch { continue; }
        const p = meta?.payload || {};
        if (meta.type !== 'session_meta' || p.originator !== 'codex-tui' || p.parent_thread_id) continue;
        if (normCwd(p.cwd) !== normCwd(rec.cwd)) continue;
        rec.sessionId = p.id; rec.recordPath = full; rec.resumeCmd = `codex resume ${p.id}`;
        sm.save(); sm.hooks.onList?.(); return;
      }
    } catch { /* retry */ }
    setTimeout(tick, 3000);
  };
  setTimeout(tick, 3000);
}
function recentSessionDirs() {
  const out = [];
  for (const d of [new Date(), new Date(Date.now() - 86400000)]) {
    const dir = path.join(CODEX_HOME, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    if (fs.existsSync(dir)) out.push(dir);
  }
  return out;
}
