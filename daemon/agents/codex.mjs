// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 어댑터 — Codex. 이 CLI 에만 해당하는 것(목록 뼈대·권한 칸·실행 명령)을 한 파일에 모은다.
// 바깥은 daemon/agents.mjs 의 공개 함수(normalize·buildCommand …)로만 쓴다 — 여기 함수는 그 안에서 불린다.
//   codex -m <model> -c model_reasoning_effort=<effort> -c service_tier=fast [--sandbox read-only]   (재개: codex resume <id>)
//           service_tier=fast = 코덱스 /fast(빠른 응답) 항상 켬 — 사용자 결정 2026-09-09. 설정 파일이 아니라 시작 플래그로만 준다.
import fs from 'node:fs';
import path from 'node:path';
import { soulRoot } from '../paths.mjs';
import { normCwd, readFirstLine } from '../recordutil.mjs';

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
