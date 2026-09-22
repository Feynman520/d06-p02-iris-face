// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트·모델·사고깊이 목록과 실행 명령. 터미널에서 치던 것과 같은 명령을 그대로 만든다(설정 파일 무접촉).
//   Claude: claude --chrome --model <id> --effort <effort> [--settings state\fast-mode.json] --session-id <UUID>      (재개: --resume <UUID>)
//           --settings = Opus 세션에만 fast 모드 항상 켬(사용자 결정 2026-09-10). settings.json 무접촉.
//           --chrome = Claude in Chrome(로그인된 실제 크롬 조작) 항상 켬 — 사용자 결정 2026-09-11. 확장 「Claude」가 없으면 도구만 안 붙고 세션은 정상.
//   Codex : codex -m <model> -c model_reasoning_effort=<effort> -c service_tier=fast [--sandbox read-only]   (재개: codex resume <id>)
//           service_tier=fast = 코덱스 /fast(빠른 응답) 항상 켬 — 사용자 결정 2026-09-09. 설정 파일이 아니라 시작 플래그로만 준다.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { soulRoot } from './paths.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(soulRoot(), '_agent', 'claude');
const STATE = process.env.IRIS_FACE_STATE || path.join(ROOT, 'state');

// 클로드 /fast 항상 켬(사용자 결정 2026-09-10) — fast를 지원하는 모델(Opus)에만, settings.json 무접촉:
// Face 소유의 작은 설정 파일 { fastMode: true } 를 --settings 로 넘긴다(--settings 는 user 설정보다 우선).
// 공백·한글·〖〗가 든 이 경로가 cmd.exe /c 를 거쳐도 그대로 도착함을 node-pty 로 실측(2026-09-10).
// 2026-09-23: `opus` 별칭이 CLI 2.1.280부터 Opus 5.5 — 이전 Opus 5 는 전체 ID 항목이며 둘 다 fast 지원.
const FAST_MODELS = ['opus', 'claude-opus-5'];
const FAST_SETTINGS = path.join(STATE, 'fast-mode.json');
function fastSettingsFile() {
  const want = JSON.stringify({ fastMode: true }, null, 2) + '\n';
  try { if (fs.readFileSync(FAST_SETTINGS, 'utf8') === want) return FAST_SETTINGS; } catch {}
  fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(FAST_SETTINGS, want, 'utf8');
  return FAST_SETTINGS;
}
export const isFastModel = (agent, model) => agent === 'codex' || (agent === 'claude' && FAST_MODELS.includes(model));
export const CODEX_HOME = process.env.CODEX_HOME || path.join(soulRoot(), '_agent', 'codex');

export const AGENTS = {
  claude: {
    label: 'Claude',
    // 별칭(opus·sonnet·fable·haiku)은 CLI 가 최신 판으로 푼다(2.1.280: opus→Opus 5.5, sonnet→5, fable→5.1, haiku→4.5).
    // 표시 이름은 손으로 맞춘다 — Sonnet 5.5·Haiku 5.5(Anthropic 예고, 2026-09-22)가 나오면 여기 이름만 고친다.
    models: [
      { id: 'opus',          label: 'Opus 5.5' },
      { id: 'claude-opus-5', label: 'Opus 5 (이전)' },
      { id: 'sonnet',        label: 'Sonnet 5' },
      { id: 'fable',         label: 'Fable 5.1' },
      { id: 'haiku',         label: 'Haiku 4.5' },
    ],
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    default: { model: 'opus', effort: 'high' },
    // --permission-mode (빈 값 = 설정 파일 settings.json 대로)
    permissions: [
      { id: '', label: '설정 파일대로' }, { id: 'bypassPermissions', label: '전부 허용' }, { id: 'acceptEdits', label: '편집 자동 허용' },
      { id: 'auto', label: '자동' }, { id: 'dontAsk', label: '묻지 않음' }, { id: 'manual', label: '매번 묻기' }, { id: 'plan', label: '계획만' },
    ],
  },
  codex: {
    label: 'Codex',
    // 2026-09-22 GPT-6 Sol(복잡한 코딩·에이전트, 기본)·Luna(가볍고 대량) 출시, 5.6 계열은 코덱스가 "Older" 로 내림(Terra 후속 없음).
    // 사고깊이는 코덱스 0.156.0 모델 메타데이터(models_cache.json, 2026-09-23 실측) 그대로: astra·sol·terra·5.6-sol = ultra 까지, luna 계열 = max 까지.
    // 5.6 계열은 저장된 선택(localStorage iris.sel)과의 호환을 위해 "(구)" 표시로 남긴다. gpt-5.5 는 2026-10-14 은퇴라 넣지 않는다.
    models: [
      { id: 'gpt-6-astra',   label: 'gpt-6-astra' },
      { id: 'gpt-6-sol',     label: 'gpt-6-sol' },
      { id: 'gpt-6-luna',    label: 'gpt-6-luna',  efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { id: 'gpt-5.6-terra', label: 'gpt-5.6-terra (구)' },
      { id: 'gpt-5.6-sol',   label: 'gpt-5.6-sol (구)' },
      { id: 'gpt-5.6-luna',  label: 'gpt-5.6-luna (구)', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
    ],
    efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
    default: { model: 'gpt-6-sol', effort: 'medium' },
    // -a/--ask-for-approval · -s/--sandbox (빈 값 = 설정 파일 config.toml 대로)
    approvals: [{ id: '', label: '설정 파일대로' }, { id: 'never', label: '묻지 않음' }, { id: 'on-request', label: '모델이 필요할 때 묻기' }],
    sandboxes: [{ id: '', label: '설정 파일대로' }, { id: 'read-only', label: '읽기 전용' }, { id: 'workspace-write', label: '작업 폴더 쓰기' }, { id: 'danger-full-access', label: '전체 접근' }],
  },
};

export function normalize(sel = {}) {
  const agent = AGENTS[sel.agent] ? sel.agent : 'claude';
  const a = AGENTS[agent];
  const modelInfo = a.models.find(m => m.id === sel.model) || a.models.find(m => m.id === a.default.model);
  const model = modelInfo.id;
  const efforts = modelInfo.efforts || a.efforts;
  // 모델 변경 시 지원되는 가장 가까운 이하 깊이로 조정(luna: ultra → max).
  const effort = a.efforts.slice(0, a.efforts.indexOf(sel.effort) + 1).reverse().find(e => efforts.includes(e)) || a.default.effort;
  const permission = agent === 'claude' && a.permissions.some(p => p.id === sel.permission) ? sel.permission : '';
  const approval = agent === 'codex' && a.approvals.some(p => p.id === sel.approval) ? sel.approval : '';
  let sandbox = agent === 'codex' && a.sandboxes.some(p => p.id === sel.sandbox) ? sel.sandbox : '';
  if (agent === 'codex' && !sandbox && sel.readOnly) sandbox = 'read-only'; // 예전 필드 호환
  const readOnly = sandbox === 'read-only';
  return { agent, model, modelLabel: a.models.find(m => m.id === model).label, effort, permission, approval, sandbox, readOnly };
}
/** 권한 표시용 짧은 말 */
export function permLabel(s) {
  if (s.agent === 'claude') return [...(FAST_MODELS.includes(s.model) ? ['⚡ fast'] : []), ...(s.permission ? [(AGENTS.claude.permissions.find(p => p.id === s.permission)?.label || s.permission).replace('권한: ', '')] : [])].join(' · ');
  const parts = ['⚡ fast']; if (s.approval) parts.push(AGENTS.codex.approvals.find(p => p.id === s.approval)?.label);
  if (s.sandbox) parts.push(AGENTS.codex.sandboxes.find(p => p.id === s.sandbox)?.label);
  return parts.join(' · ');
}

/** 클로드 기록파일 폴더 이름: cwd에서 영숫자 외 전부 '-' (2026-09-08 실측 규칙) */
export const claudeProjectSlug = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, '-');

/** @returns {{ file:string, args:string[], sessionId?:string, recordPath?:string, resumeCmd:string, cmdline:string }} */
export function buildCommand(sel, cwd, { resumeId } = {}) {
  const s = normalize(sel);
  if (s.agent === 'claude') {
    const sessionId = resumeId || randomUUID();
    const base = ['claude', '--chrome', '--model', s.model, '--effort', s.effort, ...(s.permission ? ['--permission-mode', s.permission] : []), ...(FAST_MODELS.includes(s.model) ? ['--settings', fastSettingsFile()] : [])];
    const args = resumeId ? [...base, '--resume', resumeId] : [...base, '--session-id', sessionId];
    const recordPath = path.join(CLAUDE_CONFIG_DIR, 'projects', claudeProjectSlug(cwd), `${sessionId}.jsonl`);
    return { file: 'cmd.exe', args: ['/c', ...args], sessionId, recordPath, resumeCmd: `claude --resume ${sessionId}`, cmdline: args.join(' ') };
  }
  // --dangerously-bypass-hook-trust(2026-09-19, v2.70): 코덱스 0.154+ 는 hooks.json 이 새것이면 첫 실행에 "Hooks need review" 를 띄운다.
  // 설치기가 config.toml 에 bypass_hook_trust=true 를 적어도 TUI 는 이 물음을 냈다(데스크탑 실측) → 세션 인수로 확실히 건너뛴다.
  // IRIS 세션은 최대 권한(approval never · danger-full-access)이 사용자 결정이고 훅은 설치기가 쓴 것이라 같은 결정의 연장.
  const base = ['codex', '-m', s.model, '-c', `model_reasoning_effort=${s.effort}`, '-c', 'service_tier=fast', '--dangerously-bypass-hook-trust', ...(s.approval ? ['-a', s.approval] : []), ...(s.sandbox ? ['--sandbox', s.sandbox] : [])];
  const args = resumeId ? [...base, 'resume', resumeId] : base;
  return { file: 'cmd.exe', args: ['/c', ...args], sessionId: resumeId, resumeCmd: resumeId ? `codex resume ${resumeId}` : '', cmdline: args.join(' ') };
}
