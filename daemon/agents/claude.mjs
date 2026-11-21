// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 어댑터 — Claude Code. 이 CLI 에만 해당하는 것(목록 뼈대·권한 칸·실행 명령·fast 설정)을 한 파일에 모은다.
// 바깥은 daemon/agents.mjs 의 공개 함수(normalize·buildCommand …)로만 쓴다 — 여기 함수는 그 안에서 불린다.
//   claude --chrome --model <id> --effort <effort> [--settings state\fast-mode.json] --session-id <UUID>      (재개: --resume <UUID>)
//           --settings = Opus 세션에만 fast 모드 항상 켬(사용자 결정 2026-09-10). settings.json 무접촉.
//           --chrome = Claude in Chrome(로그인된 실제 크롬 조작) 항상 켬 — 사용자 결정 2026-09-11. 확장 「Claude」가 없으면 도구만 안 붙고 세션은 정상.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { soulRoot } from '../paths.mjs';
import { normCwd } from '../recordutil.mjs';
import { preTrust as trustBeforeSpawn } from '../trust.mjs';
import { applyLongKey } from '../auth.mjs';

export const id = 'claude';
const FACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(soulRoot(), '_agent', 'claude');
const STATE = process.env.IRIS_FACE_STATE || path.join(FACE_ROOT, 'state');

// 클로드 /fast 항상 켬(사용자 결정 2026-09-10) — fast를 지원하는 모델(Opus)에만, settings.json 무접촉:
// Face 소유의 작은 설정 파일 { fastMode: true } 를 --settings 로 넘긴다(--settings 는 user 설정보다 우선).
// 공백·한글·〖〗가 든 이 경로가 cmd.exe /c 를 거쳐도 그대로 도착함을 node-pty 로 실측(2026-09-10).
// 2026-09-23: `opus` 별칭이 CLI 2.1.280부터 Opus 5.5 — 이전 Opus 5 는 전체 ID 항목이며 둘 다 fast 지원.
// v2.102: 모델 목록은 daemon/models.mjs 가 그 PC CLI 에서 읽어 바꾼다 — fast 판정도 별칭이 아니라 풀어 낸 정확한 이름(opus 계열)으로.
export const isFast = (model, actual) => model === 'opus' || /^claude-opus-/.test(actual || model || '');
const FAST_SETTINGS = path.join(STATE, 'fast-mode.json');
function fastSettingsFile() {
  const want = JSON.stringify({ fastMode: true }, null, 2) + '\n';
  try { if (fs.readFileSync(FAST_SETTINGS, 'utf8') === want) return FAST_SETTINGS; } catch {}
  fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(FAST_SETTINGS, want, 'utf8');
  return FAST_SETTINGS;
}

/** 목록 뼈대(AGENTS.claude 그 자체 — models 배열은 daemon/models.mjs 가 제자리에서 바꾼다) */
export const table = {
  label: 'Claude',
  // 🔴 v2.102(2026-11-10 사용자 지정): 아래 손 표는 '실행 파일을 못 읽었을 때'의 뼈대일 뿐이다. 실제 목록·이름은
  // daemon/models.mjs 가 그 PC 의 claude 실행 파일에서 별칭 표·모델 표를 읽어 정하고(이름 = 실제 모델), 세션에는
  // 별칭 대신 풀어 낸 정확한 이름을 넘긴다. 못 읽으면 별칭 줄은 판 번호 없이 「Opus (이 PC 최신)」으로 보인다.
  // 2026-09-29: Sonnet 5.5 출시 — 이전 Sonnet 5 는 전체 ID 항목. Sonnet 5.5 는 CLI 카탈로그에 fast_mode 가 없어 FAST_MODELS 에 넣지 않는다.
  // 2026-10-27: `haiku` 별칭이 Haiku 5.5 로 풀림(CLI 2.1.311 실측) — 표시 이름만 고침. Haiku 4.5 는 사고깊이가 없어 이전 항목으로 남기지 않는다.
  models: [
    { id: 'opus',            label: 'Opus 5.5' },
    { id: 'claude-opus-5',   label: 'Opus 5 (이전)' },
    { id: 'sonnet',          label: 'Sonnet 5.5' },
    { id: 'claude-sonnet-5', label: 'Sonnet 5 (이전)' },
    { id: 'fable',           label: 'Fable 5.1' },
    { id: 'haiku',           label: 'Haiku 5.5' },
  ],
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  default: { model: 'opus', effort: 'high' },
  // --permission-mode (빈 값 = 설정 파일 settings.json 대로)
  permissions: [
    { id: '', label: '설정 파일대로' }, { id: 'bypassPermissions', label: '전부 허용' }, { id: 'acceptEdits', label: '편집 자동 허용' },
    { id: 'auto', label: '자동' }, { id: 'dontAsk', label: '묻지 않음' }, { id: 'manual', label: '매번 묻기' }, { id: 'plan', label: '계획만' },
  ],
};

/** 권한 칸: 클로드는 permission 하나만 쓴다(코덱스 칸 approval·sandbox 는 빈 값) */
export function permissionFields(sel, t) {
  return { permission: t.permissions.some(p => p.id === sel.permission) ? sel.permission : '', approval: '', sandbox: '' };
}
/** 목록 항목에 정확한 이름(actual)이 없을 때 CLI 에 넘길 이름: 모름(null — 판 번호 없는 별칭일 때) */
export const actualFallback = () => null;
/** 재개가 지켜도 되는 "쓰던 정확한 모델 이름"의 머리 글자(이름 모양 검사는 agents.mjs 가 먼저 한다) */
export const actualPrefix = 'claude-';
/** 권한 표시용 짧은 말(tables = AGENTS 표 — 이름표는 부르는 그 순간의 표에서 찾는다) */
export function permLabel(s, tables) {
  return [...(isFast(s.model, s.modelActual) ? ['⚡ fast'] : []), ...(s.permission ? [(tables.claude.permissions.find(p => p.id === s.permission)?.label || s.permission).replace('권한: ', '')] : [])].join(' · ');
}

/** 클로드 기록파일 폴더 이름: cwd에서 영숫자 외 전부 '-' (2026-09-08 실측 규칙) */
export const claudeProjectSlug = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, '-');

/** 실행 명령(s = 정리된 선택값). 새 대화면 세션 id 를 여기서 정해 기록 경로를 미리 안다. */
export function buildCommand(s, cwd, { resumeId } = {}) {
  const sessionId = resumeId || randomUUID();
  const base = ['claude', '--chrome', '--model', s.modelActual || s.model, '--effort', s.effort, ...(s.permission ? ['--permission-mode', s.permission] : []), ...(isFast(s.model, s.modelActual) ? ['--settings', fastSettingsFile()] : [])];
  const args = resumeId ? [...base, '--resume', resumeId] : [...base, '--session-id', sessionId];
  const recordPath = path.join(CLAUDE_CONFIG_DIR, 'projects', claudeProjectSlug(cwd), `${sessionId}.jsonl`);
  return { file: 'cmd.exe', args: ['/c', ...args], sessionId, recordPath, resumeCmd: `claude --resume ${sessionId}`, cmdline: args.join(' ') };
}

// ───────────────────────── 세션을 띄우기 직전 ─────────────────────────
/** 폴더 신뢰 물음 선답: 이 폴더의 "Do you trust…" 를 미리 "예"로 적어 둔다(env = 자식에게 줄 환경 — 설정 폴더는 거기 것이 먼저). 절대 던지지 않는다. */
export const preTrust = (cwd, env) => trustBeforeSpawn({ agent: id, cwd, env, fallback: { claudeConfigDir: CLAUDE_CONFIG_DIR } });
/** 1년 열쇠가 살아 있으면 자식 환경에 넣는다(돌려주는 값에 열쇠는 없다) */
export const sessionKey = (env) => applyLongKey(env, { configDir: CLAUDE_CONFIG_DIR });

// ───────────────────────── 보조 작업(서브에이전트) ─────────────────────────
//   <기록파일 폴더>\<세션id>\subagents\agent-<id>.jsonl + agent-<id>.meta.json(description·model·agentType·toolUseId)
//   부모 연결 = meta.toolUseId ↔ 부모의 Agent 도구호출 id. 완료 = 부모 기록에 그 id의 tool_result(동기형) 또는 <task-notification>(배경형).
//   (w = SubagentWatcher — 부모 세션의 기록 경로·세션 id 와 보조 목록 subs 를 지닌다)
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
/** 살펴볼 폴더들 */
export const subagentDirs = (w) => (w.sessionId ? [path.join(path.dirname(w.recordPath), w.sessionId, 'subagents')] : []);
export const subagentFilePrefix = 'agent-';
/** 보조 기록 파일 하나를 목록에 올린다(makeTail = 그 파일을 읽을 꼬리 읽기를 만드는 함수) */
export function addSubagent(w, file, makeTail) {
  const key = path.basename(file, '.jsonl').replace(/^agent-/, '');
  const meta = readJson(file.replace(/\.jsonl$/, '.meta.json')) || {};
  let born = null; try { born = fs.statSync(file).birthtime?.toISOString?.() || null; } catch {}
  w.subs.set(key, {
    key, file, agentType: meta.agentType || '', name: meta.description || meta.agentType || key, detail: meta.agentType ? `${meta.agentType}${meta.requestShape === 'background' ? ' · 배경 실행' : ''}` : '',
    model: meta.model || '', toolUseId: meta.toolUseId || null, background: meta.requestShape === 'background',
    status: 'running', startedAt: born, endedAt: null, lastAt: born, tools: 0, items: 0,
    tail: makeTail(file),
  });
  return true;
}
/** 끝났는가: 완료 신호 = 부모 기록의 tool_result/<task-notification>(같은 id면 최신 시각으로 갱신됨). 재개된 보조는 재개 시각보다 나중 신호만 완료로 본다.
 *  신호는 두 갈래 중 늦은 것: Agent 호출 id(finished) · 알림의 task-id = 보조 key(finishedByTask, SendMessage 재개 뒤의 알림은 이쪽에만 잡힌다 — v2.47.1). */
export function subagentDone(w, s, parentTail) {
  const fin = w.finishedAt(s, parentTail);
  return !!(fin && (!s.resumedAt || Date.parse(fin) > Date.parse(s.resumedAt)));
}
export const subagentEndedAt = (w, s, parentTail) => w.finishedAt(s, parentTail);

// ───────────────────────── 제목 생성(헤드리스) ─────────────────────────
/** 제목 한 줄을 짓게 할 실행 사양. 실행 파일을 못 찾으면 { skip: 이유 }. (exe 를 안 주면 findExe 로 찾는다) */
export function titleCommand({ system, request, exe, findExe, titleModel }) {
  const file = exe === undefined ? findExe() : exe;
  if (!file) return { skip: 'title gen skipped: claude.exe not found' };
  return { file, stdinText: null, args: ['-p', '--model', titleModel, '--effort', 'low', '--system-prompt', system, '--tools', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--output-format', 'text', '--', request] };
}
/** 헤드리스 출력에서 제목 재료: 출력 그대로 */
export const titleFromOutput = (out) => out;

// ───────────────────────── 기록 파일 찾기 ─────────────────────────
// 클로드는 세션 id 를 우리가 정해 넘기므로 기록 경로를 미리 안다(buildCommand 의 recordPath). 여기서는 그 기록이 "안 생겼을 때"만 본다.
const RELAUNCH_WATCH_MS = 15 * 60_000;
const UUID_JSONL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

/**
 * 클로드가 새 대화 번호로 스스로 재시작했는지 지켜본다(v2.99, 2026-11-09 학교 컴퓨터실 "대화창에 아무것도 안 나옴").
 * 클로드코드 2.1.27x 는 대화가 없을 때 시작 권유(전체화면 렌더러 등)를 수락하면 `--session-id` 로 준 번호를 버리고 새 번호로 다시 뜬다
 * → 우리가 예상한 기록 파일은 영영 안 생긴다. 예상 파일이 없으면 같은 프로젝트 폴더에서 이 세션 뒤에 생긴 새 기록 **하나**를 찾아 따라간다.
 * (sm = SessionManager — 카드 표·살아 있는 세션 표·저장·방송을 빌려 쓴다)
 */
export function watchRecord(sm, id, rec) {
  const since = Date.now(), expected = rec.recordPath;
  if (!expected) return;
  const tick = () => {
    if (!sm.sessions.has(id) || !sm.live.has(id) || rec.recordPath !== expected) return;
    if (fs.existsSync(expected) || Date.now() - since > RELAUNCH_WATCH_MS) return;
    const known = new Set([...sm.sessions.values()].filter(r => r !== rec).flatMap(r => [r.recordPath, ...(r.previous || []).map(p => p.recordPath)]).filter(Boolean).map(p => p.toLowerCase()));
    const found = findRelaunchedRecord({ dir: path.dirname(expected), cwd: rec.cwd, since, known });
    if (found) {
      rec.previous = [...(rec.previous || []), { agent: rec.agent, sessionId: rec.sessionId, recordPath: expected, until: new Date().toISOString(), reason: 'relaunched' }];
      rec.sessionId = found.sessionId; rec.recordPath = found.file; rec.resumeCmd = `claude --resume ${found.sessionId}`;
      sm.hooks.onLog?.(`${id} claude relaunched with a new session id → following ${found.sessionId} (expected ${path.basename(expected)} never appeared)`);
      sm.save(); sm.hooks.onList?.(); return;
    }
    setTimeout(tick, 3000);
  };
  setTimeout(tick, 3000);
}
/** 같은 프로젝트 폴더에서 since 뒤에 생긴, known 에 없는, cwd 가 같은 클로드 기록. 후보가 정확히 하나일 때만 돌려준다(둘 이상이면 고르지 않음).
 *  @returns {{file:string, sessionId:string}|null} */
export function findRelaunchedRecord({ dir, cwd, since, known = new Set() }) {
  let names; try { names = fs.readdirSync(dir); } catch { return null; }
  const hits = [];
  for (const f of names) {
    if (!UUID_JSONL.test(f)) continue;
    const full = path.join(dir, f);
    if (known.has(full.toLowerCase())) continue;
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile() || Math.max(st.birthtimeMs || 0, st.mtimeMs) < since - 2000) continue;
    if (st.birthtimeMs && st.birthtimeMs < since - 2000) continue; // 이 세션보다 먼저 있던 기록(다른 창이 이어 쓰는 중)은 아니다
    const recCwd = readRecordCwd(full);
    if (recCwd == null || normCwd(recCwd) !== normCwd(cwd)) continue;
    hits.push({ file: full, sessionId: f.slice(0, -'.jsonl'.length) });
  }
  return hits.length === 1 ? hits[0] : null;
}
function readRecordCwd(file) {
  let fd; try { fd = fs.openSync(file, 'r'); } catch { return null; }
  try {
    const buf = Buffer.alloc(256 * 1024); const n = fs.readSync(fd, buf, 0, buf.length, 0);
    for (const line of buf.subarray(0, n).toString('utf8').split('\n')) {
      if (!line.includes('"cwd"')) continue;
      try { const o = JSON.parse(line); if (typeof o.cwd === 'string') return o.cwd; } catch { /* 잘린 줄 */ }
    }
    return null;
  } finally { fs.closeSync(fd); }
}
