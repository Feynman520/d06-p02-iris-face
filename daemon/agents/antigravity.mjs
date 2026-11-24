// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 어댑터 — Google Antigravity CLI(agy). 설계 = D09 안티그래비티-입점설계 4절 '노트북 단계 구현 기록'(2026-11-23).
//   agy --model <정확한 모델 이름> --dangerously-skip-permissions --log-file <카드마다 새 파일>      (재개: --conversation <id>)
//   · 실행 파일 = %LOCALAPPDATA%\agy\bin\agy.exe(공식 설치 자리)를 직접 띄운다. 없으면 PATH 의 agy 를 cmd.exe 로.
//   · 모델 이름 꼬리가 사고 깊이다(gemini-4-argon-high) — 화면은 「모델(머리) + 사고 깊이(꼬리)」 두 칸으로 고르고(antigravity.models.mjs),
//     CLI 에는 그 둘이 가리키는 agy models 의 정확한 이름 하나를 --model 로 넘긴다(모델 이름 = 실제 모델, --effort 는 쓰지 않는다).
//   · 권한 = 처음 값은 묻지 않음(IRIS 기준선 bypass) — 설정 → 세션 기본값의 Antigravity 칸에서 바꾼다(2026-11-25, table.permissions).
//     어느 값이든 안전은 ~/.gemini/config/hooks.json 의 iris-safety 훅(경로 · 일괄 종료 가드)이 지킨다.
//   · 대화 짝짓기 = 이 카드의 --log-file 에 agy 가 적는 "Created conversation <id>" 만 근거로 한다(폴더의 '마지막 대화' 캐시는 쓰지 않는다 —
//     같은 폴더의 다른 카드 · 사용자가 직접 띄운 agy 와 섞일 수 있다는 코덱스 설계 검토 지적). 근거가 없으면 잇지 않는다.
// 중계기(IRIS Gate)를 거친다(연결 방식 gate, 2026-11-23 사용자 "중계기 방식으로 가자"). 판정 · 환경 = antigravity.gate.mjs —
//   중계기를 못 쓰면 세션을 열지 않는다(이 PC 로그인으로 몰래 돌리지 않음). 직결로 되돌리기 = 아래 connection 한 줄을 'direct' 로.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prepare, cliHome } from './antigravity.setup.mjs';
import { applyRoute } from './antigravity.gate.mjs';
import { groupModels, mapLegacySel, actualOf as rowActual, EFFORT_ORDER, HAND_LIST } from './antigravity.models.mjs';

export const id = 'antigravity';
export const connection = 'gate';
const FACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = process.env.IRIS_FACE_STATE || path.join(FACE_ROOT, 'state');

/** 공식 설치 자리의 실행 파일(없으면 null — PATH 의 agy 를 cmd.exe 로 찾는다) */
export function agyExe() {
  if (process.env.IRIS_AGY_EXE) return process.env.IRIS_AGY_EXE; // 시험용
  const la = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const p = path.join(la, 'agy', 'bin', 'agy.exe');
  try { return fs.statSync(p).isFile() ? p : null; } catch { return null; }
}

export const isFast = () => false;

/**
 * 목록 뼈대. 모델 한 줄 = agy models 의 이름에서 사고 깊이 꼬리를 뗀 머리(gemini-4-argon), 사고 깊이 = 그 모델이 가진 꼬리들(2026-11-23 사용자 요청 —
 * 클로드 · 코덱스처럼 모델과 사고 깊이를 따로 고른다). CLI 에 넘기는 이름은 그 둘이 가리키는 agy models 의 정확한 이름 하나(actuals)다.
 * models 는 antigravity.status.mjs refreshModels 가 그 PC 의 agy 에서 다시 읽어 제자리에서 바꾼다(아래는 못 읽었을 때의 1.5.14 손 표).
 */
export const table = {
  label: 'Antigravity',
  models: groupModels(HAND_LIST),
  efforts: [...EFFORT_ORDER],
  default: { model: 'gemini-4-argon', effort: 'high' },
  // 권한 모드(2026-11-25 사용자 요청 "세션 기본값에 Antigravity 가 없음"). 빈 값 = 전부 허용(--dangerously-skip-permissions) — IRIS 기준선이자 처음 값이고,
  // 값이 없거나 모르는 값이면 언제나 이것이다(예전 카드 · 예전 화면이 보낸 요청은 지금까지와 똑같은 명령이 된다). 나머지는 PERMISSION_ARGS 로.
  // 1.5.16 실측(2026-11-25, 실제 세션): 자동 = 편집 · 안전한 명령은 묻지 않음(옵션 없이 띄웠을 때의 기본이기도 하다) · 편집 자동 허용 · 계획만 = 명령 앞에서 묻는다.
  // "매번 묻기"는 CLI 에 그런 옵션이 없어 넣지 않는다.
  permissions: [
    { id: '', label: '전부 허용' }, { id: 'auto', label: '자동(안전한 명령만 허용)' }, { id: 'acceptEdits', label: '편집 자동 허용' }, { id: 'plan', label: '계획만' },
  ],
};
/** 권한 모드 → agy 인수(agy --help: --dangerously-skip-permissions · --mode accept-edits|auto|plan). 자동도 옵션을 적어 넘긴다 — CLI 의 기본이 바뀌어도 고른 대로. */
const PERMISSION_ARGS = { '': ['--dangerously-skip-permissions'], auto: ['--mode', 'auto'], acceptEdits: ['--mode', 'accept-edits'], plan: ['--mode', 'plan'] };

/** 권한 칸: 안티그래비티는 permission 하나만 쓴다(코덱스 칸 approval · sandbox 는 빈 값). 목록에 없는 값 = 빈 값(전부 허용) */
export function permissionFields(sel, t) {
  return { permission: (t?.permissions || []).some(p => p.id && p.id === sel?.permission) ? sel.permission : '', approval: '', sandbox: '' };
}
/** 옛 선택값(모델 칸에 정확한 이름이 통째로 — 2026-11-23 오전 판의 카드 · 화면 값)을 「모델 + 사고 깊이」로 — agents.mjs normalize 가 목록을 찾기 전에 부른다 */
export const mapSel = (sel, a) => mapLegacySel(sel, a.models);
/** 목록의 한 줄 + 사고 깊이 → CLI 에 넘길 정확한 이름 */
export const actualOf = (modelInfo, effort) => rowActual(modelInfo, effort);
/** 목록 이름 = 정확한 모델 이름(사고 깊이가 없는 줄) */
export const actualFallback = (model) => model;
/** 재개가 지켜도 되는 정확한 이름의 머리 글자: 어떤 꼴이든(gemini- · claude- · gpt-) — 이름 모양 검사는 agents.mjs 가 먼저 한다 */
export const actualPrefix = '';
export const permLabel = (s) => (s?.permission && table.permissions.find(p => p.id === s.permission)?.label) || '권한 자동 승인';

// 이 카드의 기록 파일(--log-file) — 명령 글자(cmdline) → 파일. 데몬이 다시 켜지면 비지만, 그때는 재개 id 를 이미 안다.
const LOG_OF = new Map();
export const logDir = () => path.join(STATE, 'agy-logs');
export const transcriptOf = (conv) => path.join(cliHome(), 'brain', conv, '.system_generated', 'logs', 'transcript.jsonl');

export function buildCommand(s, cwd, { resumeId } = {}) {
  // 넘기는 이름은 언제나 정확한 이름(modelActual)이다. 찾지 못했으면(목록이 어긋남) 머리 이름을 대신 넘기지 않고 띄우지 않는다 — 모델 이름 = 실제 모델
  if (!s.modelActual) { const e = new Error(`모델 목록에서 「${s.modelLabel || s.model}${s.effort ? ` · ${s.effort}` : ''}」의 정확한 이름을 찾지 못했습니다. 모델을 다시 골라 주세요.`); e.code = 'MODEL_CHANGED'; throw e; }
  const log = path.join(logDir(), `${randomUUID()}.log`);
  const args = ['--model', s.modelActual, ...(PERMISSION_ARGS[s.permission || ''] || PERMISSION_ARGS['']), '--log-file', log, ...(resumeId ? ['--conversation', resumeId] : [])];
  const exe = agyExe();
  const cmdline = ['agy', ...args].join(' ');
  if (!resumeId) { LOG_OF.set(cmdline, log); while (LOG_OF.size > 200) LOG_OF.delete(LOG_OF.keys().next().value); } // 재개는 id 를 이미 안다 · 띄우지 못한 명령이 쌓이지 않게 200개까지
  const base = { sessionId: resumeId, recordPath: resumeId ? transcriptOf(resumeId) : undefined, resumeCmd: resumeId ? `agy --conversation ${resumeId}` : '', cmdline };
  return exe ? { file: exe, args, ...base } : { file: 'cmd.exe', args: ['/c', 'agy', ...args], ...base };
}

// ───────────────────────── 세션을 띄우기 직전 ─────────────────────────
/**
 * 폴더 신뢰 · 전역 지침 · 안전 훅(antigravity.setup.mjs). 기록 폴더도 여기서 만든다.
 * 🔴 클로드 · 코덱스의 preTrust 와 달리 **안전 준비가 안 되면 던진다** → sessions.mjs spawn() 이 CLI 를 띄우기 전에 멈추고 화면에 이유가 보인다
 * (권한을 묻지 않는 세션을 안전 훅 없이 열지 않는다 — 코덱스 코드 검토 2번).
 */
export function preTrust(cwd, env) {
  try { fs.mkdirSync(logDir(), { recursive: true }); } catch {}
  let r; try { r = prepare(cwd); } catch (e) { r = { ok: false, why: `준비 중 오류(${String(e?.message || e)})`, line: 'error' }; }
  if (!r.ok) { const e = new Error(`안티그래비티 안전 준비가 안 되어 세션을 열지 않았습니다 — ${r.why}`); e.code = 'AGY_NOT_READY'; throw e; }
  // 길(2026-11-23): gate 면 중계기 판정이 통과할 때만 CLOUD_CODE_URL 을 넣고, 아니면 던진다 — 세션을 띄우기 전에 멈추고 화면에 이유가 보인다.
  // env 가 없으면(readyCheck — 바꾸기 · 재개에서 지금 프로세스를 끄기 전) 판정만 한다.
  const { route } = applyRoute(env, connection);
  return { agent: id, result: r.line, route };
}
/** 바꾸기 · 재개에서 지금 프로세스를 끄기 전에 부른다 — 준비가 안 되면 던진다(끈 뒤에 실패해 세션을 잃지 않게). 결과는 preTrust 와 같다. */
export const readyCheck = (cwd) => { preTrust(cwd); };

// ───────────────────────── 화면 신호(에이전트별 — 클로드 · 코덱스의 공용 식은 그대로) ─────────────────────────
// 1.5.14 실측: 일하는 중 = 맨 아래 상태줄 "esc to cancel" + 위 "⡿  Generating..." / 기다림 = "? for shortcuts" / 중단 뒤 = "⎿  Interrupted · What should …"(그 뒤 기다림)
const BOTTOM = (lines) => lines.filter((l) => l.trim()).slice(-3).join('\n');
const WORK_RE = /esc to cancel/i;
const ATT_RE = /(Do you trust|trust the contents|\(y\/n\)|\[Y\/n\]|Enter to select|Enter to confirm|Do you want to (proceed|allow|run)|Allow this|1\. Yes)/i;
// 권한 물음(1.5.16 실측, 2026-11-25 — 전부 허용이 아닌 권한 모드에서 뜬다): "Requesting permission for:" … "> 1. Yes, run command" … "4. No, cancel" + 안내줄
// "↑/↓ Navigate · tab Amend …". 이 물음이 떠 있는 동안에도 맨 아래 상태줄은 "esc to cancel" 이라 일하는 중으로 보였다 — 물음을 먼저 본다.
// 대화 글 속의 같은 낱말에 속지 않게 화면 끝 16줄 안에서, 안내줄 또는 (제목 + 번호 선택지)가 함께 있을 때만.
const PERM_TAIL = (s) => String(s).split('\n').filter((l) => l.trim()).slice(-16).join('\n');
const permAsk = (s) => { const t = PERM_TAIL(s); return /↑\/↓ Navigate/.test(t) || (/Requesting permission for:/.test(t) && /^\s*>?\s*1\. Yes/m.test(t)); };
export const screen = {
  /** send() 의 Enter 확인용: 일하는 중인가 */
  working: { test: (s) => !permAsk(s) && WORK_RE.test(BOTTOM(String(s).split('\n'))) },
  /** send() 의 Enter 확인용: 확인 물음이 떠 있는가 */
  attention: { test: (s) => { if (permAsk(s)) return true; const b = BOTTOM(String(s).split('\n')); return !/\? for shortcuts/i.test(b) && !WORK_RE.test(b) && ATT_RE.test(s); } },
  /** idleCheck: 화면 끝 몇 줄 → busy | idle | attention */
  status(tail, lines) {
    const b = BOTTOM(lines);
    if (permAsk(tail)) return 'attention';
    if (WORK_RE.test(b)) return 'busy';
    if (/\? for shortcuts/i.test(b)) return 'idle';
    if (ATT_RE.test(tail)) return 'attention';
    return 'busy'; // 아직 준비 전(시작 화면)
  },
  /** 진행 문구: "⡿  Generating..." 줄의 낱말 */
  activity(lines) {
    const l = lines.find((x) => /^\s*\S\s+[A-Z][a-z]+(ing)?\.\.\.\s*$/.test(x));
    return l ? l.trim().replace(/^\S\s+/, '').replace(/\.\.\.$/, '…') : '';
  },
  /** 중단 표식(화면에서만 보인다) */
  interrupted: (tail) => /⎿\s+Interrupted · What should/.test(tail),
};

/** 확인 카드 다듬기(2026-11-25 실측): 권한 물음의 마지막 선택지 아래에 붙는 안내줄("↑/↓ Navigate · tab Amend · …")이 그 선택지의 설명으로 읽힌다 — 뺀다. 키는 그대로(숫자 한 글자로 확정됨). */
export function promptKeys(prompt) {
  if (!prompt || !Array.isArray(prompt.options)) return prompt;
  return { ...prompt, options: prompt.options.map((o) => (/↑\/↓ Navigate/.test(o.desc || '') ? { ...o, desc: '' } : o)) };
}

// ───────────────────────── 보조 작업(미지원 — 부르는 쪽 계약만 채운다) ─────────────────────────
export const subagentDirs = () => [];
export const subagentFilePrefix = '\u0000antigravity-none';
export const addSubagent = () => false;
export const subagentDone = () => false;
export const subagentEndedAt = () => null;

// ───────────────────────── 제목 생성 = 하지 않음(첫 요청으로) ─────────────────────────
// 따로 부르는 agy -p 는 한도를 쓰고 대화 기록을 늘리며, 폴더의 '마지막 대화' 값을 바꾼다 — 노트북 단계는 첫 요청 제목으로 충분(코덱스 설계 검토).
export const titleCommand = () => ({ skip: 'title gen skipped: antigravity(첫 요청 제목)' });
export const titleFromOutput = () => '';

// ───────────────────────── 기록 파일 찾기 ─────────────────────────
/** 재개면 id 를 이미 안다. 새 대화면 이 카드의 --log-file 에 "Created conversation <id>" 가 적히길 기다린다(살아 있는 동안 2초마다). */
export function watchRecord(sm, cid, rec) {
  if (rec.sessionId) {
    if (!rec.recordPath) { rec.recordPath = transcriptOf(rec.sessionId); sm.save(); sm.hooks.onList?.(); }
    return;
  }
  const cmdline = rec.cmdline;
  const log = LOG_OF.get(cmdline);
  if (!log) { sm.hooks.onLog?.(`${cid} antigravity: 이 카드의 기록 파일을 모름 — 대화 기록을 잇지 않음`); return; }
  // 이 감시가 맡은 프로세스 = 지금 살아 있는 그 하나(같은 카드에서 다시 띄우면 새 감시가 맡는다 — 코덱스 코드 검토 B)
  const mine = sm.live.get(cid);
  const stop = () => LOG_OF.delete(cmdline);
  const tryPair = () => {
    let text; try { text = fs.readFileSync(log, 'utf8'); } catch { return false; }
    const m = text.match(/Created conversation ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    if (!m) return false;
    const conv = m[1];
    if ([...sm.sessions.values()].some((r) => r !== rec && r.sessionId === conv)) { sm.hooks.onLog?.(`${cid} antigravity: 대화 ${conv} 는 다른 카드가 이미 가짐 — 잇지 않음`); return true; }
    rec.sessionId = conv; rec.recordPath = transcriptOf(conv); rec.resumeCmd = `agy --conversation ${conv}`;
    sm.save(); sm.hooks.onList?.(); return true;
  };
  const tick = () => {
    if (!sm.sessions.has(cid) || sm.sessions.get(cid) !== rec || rec.sessionId || rec.cmdline !== cmdline) return stop();
    if (sm.live.get(cid) !== mine) { tryPair(); return stop(); } // 끝났거나 바뀜 — 마지막으로 한 번 읽고 멈춘다(곧바로 끝난 CLI 의 id 도 놓치지 않게)
    if (tryPair()) return stop();
    setTimeout(tick, 2000);
  };
  setTimeout(tick, 2000);
}
