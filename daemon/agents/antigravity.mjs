// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 어댑터 — Google Antigravity CLI(agy). 설계 = D09 안티그래비티-입점설계 4절 '노트북 단계 구현 기록'(2026-11-23).
//   agy --model <정확한 모델 이름> --dangerously-skip-permissions --log-file <카드마다 새 파일>      (재개: --conversation <id>)
//   · 실행 파일 = %LOCALAPPDATA%\agy\bin\agy.exe(공식 설치 자리)를 직접 띄운다. 없으면 PATH 의 agy 를 cmd.exe 로.
//   · 모델 이름 꼬리가 사고 깊이다(gemini-4-argon-high) — 목록 한 줄 = agy models 의 정확한 이름 하나, 사고 깊이 칸은 없다(모델 이름 = 실제 모델).
//   · 권한 = 늘 묻지 않음(IRIS 기준선 bypass). 안전은 ~/.gemini/config/hooks.json 의 iris-safety 훅(경로 · 일괄 종료 가드)이 지킨다.
//   · 대화 짝짓기 = 이 카드의 --log-file 에 agy 가 적는 "Created conversation <id>" 만 근거로 한다(폴더의 '마지막 대화' 캐시는 쓰지 않는다 —
//     같은 폴더의 다른 카드 · 사용자가 직접 띄운 agy 와 섞일 수 있다는 코덱스 설계 검토 지적). 근거가 없으면 잇지 않는다.
// 중계기(IRIS Gate)를 거치지 않는다(연결 방식 direct, 조각 ⑥ 확정). 나중에 중계기로 바꿀 자리 = 이 파일의 buildCommand 환경(CLOUD_CODE_URL).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prepare, cliHome } from './antigravity.setup.mjs';

export const id = 'antigravity';
export const connection = 'direct';
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

/** 목록 뼈대. models 는 agy models(1.5.14, 2026-11-23 이 PC 실측)의 정확한 이름 그대로 — daemon/models.mjs 가 그 PC 의 agy 에서 다시 읽어 제자리에서 바꾼다. */
export const table = {
  label: 'Antigravity',
  models: [
    { id: 'gemini-4-argon-high',          label: 'Gemini 4 Argon (High)' },
    { id: 'gemini-4-argon-medium',        label: 'Gemini 4 Argon (Medium)' },
    { id: 'gemini-4-argon-low',           label: 'Gemini 4 Argon (Low)' },
    { id: 'gemini-4-neon-xhigh',          label: 'Gemini 4 Neon (XHigh)' },
    { id: 'gemini-4-neon-high',           label: 'Gemini 4 Neon (High)' },
    { id: 'gemini-4-neon-medium',         label: 'Gemini 4 Neon (Medium)' },
    { id: 'gemini-4-neon-low',            label: 'Gemini 4 Neon (Low)' },
    { id: 'gemini-4-hydrogen-xhigh',      label: 'Gemini 4 Hydrogen (XHigh)' },
    { id: 'gemini-4-hydrogen-high',       label: 'Gemini 4 Hydrogen (High)' },
    { id: 'gemini-4-hydrogen-medium',     label: 'Gemini 4 Hydrogen (Medium)' },
    { id: 'gemini-4-hydrogen-low',        label: 'Gemini 4 Hydrogen (Low)' },
    { id: 'gemini-pro-orchestrator-neon', label: 'Orchestrator (Neon)' },
    { id: 'gemini-pro-orchestrator-g1-pro', label: 'Orchestrator (Argon)' },
    { id: 'gemini-3.8-flash-high',        label: 'Gemini 3.8 Flash (High)' },
    { id: 'gemini-3.8-flash-medium',      label: 'Gemini 3.8 Flash (Medium)' },
    { id: 'gemini-3.8-flash-low',         label: 'Gemini 3.8 Flash (Low)' },
    { id: 'claude-opus-5-5-high',         label: 'Claude Opus 5.5 (High)' },
    { id: 'claude-opus-5-5-medium',       label: 'Claude Opus 5.5 (Medium)' },
    { id: 'claude-opus-5-5-low',          label: 'Claude Opus 5.5 (Low)' },
    { id: 'claude-sonnet-5-5-high',       label: 'Claude Sonnet 5.5 (High)' },
    { id: 'claude-sonnet-5-5-medium',     label: 'Claude Sonnet 5.5 (Medium)' },
    { id: 'claude-sonnet-5-5-low',        label: 'Claude Sonnet 5.5 (Low)' },
    { id: 'gpt-oss-120b-medium',          label: 'GPT-OSS 120B (Medium)' },
  ],
  efforts: [],
  default: { model: 'gemini-4-argon-high', effort: '' },
};

/** 권한 칸 없음(늘 --dangerously-skip-permissions) */
export const permissionFields = () => ({ permission: '', approval: '', sandbox: '' });
/** 목록 이름 = 정확한 모델 이름 */
export const actualFallback = (model) => model;
/** 재개가 지켜도 되는 정확한 이름의 머리 글자: 어떤 꼴이든(gemini- · claude- · gpt-) — 이름 모양 검사는 agents.mjs 가 먼저 한다 */
export const actualPrefix = '';
export const permLabel = () => '권한 자동 승인';

// 이 카드의 기록 파일(--log-file) — 명령 글자(cmdline) → 파일. 데몬이 다시 켜지면 비지만, 그때는 재개 id 를 이미 안다.
const LOG_OF = new Map();
export const logDir = () => path.join(STATE, 'agy-logs');
export const transcriptOf = (conv) => path.join(cliHome(), 'brain', conv, '.system_generated', 'logs', 'transcript.jsonl');

export function buildCommand(s, cwd, { resumeId } = {}) {
  const log = path.join(logDir(), `${randomUUID()}.log`);
  const args = ['--model', s.modelActual || s.model, '--dangerously-skip-permissions', '--log-file', log, ...(resumeId ? ['--conversation', resumeId] : [])];
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
export function preTrust(cwd) {
  try { fs.mkdirSync(logDir(), { recursive: true }); } catch {}
  let r; try { r = prepare(cwd); } catch (e) { r = { ok: false, why: `준비 중 오류(${String(e?.message || e)})`, line: 'error' }; }
  if (!r.ok) { const e = new Error(`안티그래비티 안전 준비가 안 되어 세션을 열지 않았습니다 — ${r.why}`); e.code = 'AGY_NOT_READY'; throw e; }
  return { agent: id, result: r.line };
}

// ───────────────────────── 화면 신호(에이전트별 — 클로드 · 코덱스의 공용 식은 그대로) ─────────────────────────
// 1.5.14 실측: 일하는 중 = 맨 아래 상태줄 "esc to cancel" + 위 "⡿  Generating..." / 기다림 = "? for shortcuts" / 중단 뒤 = "⎿  Interrupted · What should …"(그 뒤 기다림)
const BOTTOM = (lines) => lines.filter((l) => l.trim()).slice(-3).join('\n');
const WORK_RE = /esc to cancel/i;
const ATT_RE = /(Do you trust|trust the contents|\(y\/n\)|\[Y\/n\]|Enter to select|Enter to confirm|Do you want to (proceed|allow|run)|Allow this|1\. Yes)/i;
export const screen = {
  /** send() 의 Enter 확인용: 일하는 중인가 */
  working: { test: (s) => WORK_RE.test(BOTTOM(String(s).split('\n'))) },
  /** send() 의 Enter 확인용: 확인 물음이 떠 있는가 */
  attention: { test: (s) => { const b = BOTTOM(String(s).split('\n')); return !/\? for shortcuts/i.test(b) && !WORK_RE.test(b) && ATT_RE.test(s); } },
  /** idleCheck: 화면 끝 몇 줄 → busy | idle | attention */
  status(tail, lines) {
    const b = BOTTOM(lines);
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
