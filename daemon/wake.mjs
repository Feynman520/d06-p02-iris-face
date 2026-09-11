// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// installer Task 17 — 잠든 에이전트 깨우기. 설치 때 구독을 하나만 고르면 나머지 에이전트는 "잠든" 채로
// 남는다(영수증 package-receipt.json 의 installed.<agent>.active=false, PATH에 그 shim 없음). 사용자가
// 나중에 대시보드(TeamClaude, 3456)에 그 계정을 로그인/릴레이하면 이 파일이 그 에이전트를 깨운다:
//   ① wake(agent)            — shim 파일을 쓰고 receipt.installed.<agent>.active=true 로 원자적 갱신(수동/자동 공용).
//   ② activeAgentsMap(AGENTS) — GET /api/agents 가 쓰는 필터. 영수증이 없으면(이 개발 PC처럼) 전부 그대로 준다.
//   ③ SleepWatcher            — 영수증이 있고 잠든 에이전트가 있을 때만 15초마다 TeamClaude 설정 파일(계정 배열
//     "길이"만)을 읽어, 그 에이전트의 계정이 0→1 이상이 되면 자동으로 wake() 를 부른다. 토큰 값은 절대
//     읽지도 로그로 남기지도 않는다 — 계정 배열의 provider 필드와 개수만 본다.
//
// shim 템플릿 출처(provenance): 아래 AGENT_SHIMS·crlf()·agentShimText() 는
// installer/lib/shims.mjs 의 AGENT_SHIMS·crlf()·agentShim() 을 바이트 그대로 옮긴 것이다(그 파일을
// import 하지 않는다 — P02·P03 은 별개 배포 단위). installer 의 정적 검사 ⑥이 두 원본을 바이트 비교하니,
// shims.mjs 가 바뀌면 이 사본도 같은 턴에 맞춰야 한다.
//
// 계정 분류 규칙 출처: installer/lib/login.mjs 의 accountMatchesProvider() —
// "TeamClaude 가 스스로 적립한 클로드 계정은 provider 필드가 아예 없고(providerOf() 기본값 'anthropic'),
// 코덱스 계정은 항상 provider:'codex' 를 갖는다." 이 규칙을 accountMatchesAgent() 로 재구현했다(임포트 없음).
import fs from 'node:fs';
import path from 'node:path';
import { soulRoot, readReceipt } from './paths.mjs';

export const KNOWN_AGENTS = ['claude', 'codex'];

// ---- shim 템플릿(installer/lib/shims.mjs agentShim() 그대로 — ASCII, CRLF) ----
const AGENT_SHIMS = {
  claude: { envName: 'CLAUDE_CONFIG_DIR', envDir: 'claude', tool: 'claude' },
  codex: { envName: 'CODEX_HOME', envDir: 'codex', tool: 'codex' },
};
function crlf(lines) {
  return lines.join('\r\n') + '\r\n';
}
export function agentShimText(agent) {
  const { envName, envDir, tool } = AGENT_SHIMS[agent];
  return crlf([
    '@echo off',
    'setlocal',
    'set "ANTHROPIC_BASE_URL=http://127.0.0.1:3456"',
    `set "${envName}=%~dp0..\\..\\${envDir}"`,
    'set "PATH=%~dp0..\\tools\\node;%PATH%"',
    `call "%~dp0..\\tools\\${tool}\\${tool}.cmd" %*`,
    'exit /b %errorlevel%',
  ]);
}
export function shimsDir(root) {
  return path.join(root, '_agent', 'shared', 'shims');
}

// ---- 영수증 원자적 갱신(installer/lib/receipt.mjs writeReceipt() 와 같은 패턴) ----
function receiptPath(root) {
  return path.join(root, '_agent', 'setup', 'package-receipt.json');
}
function writeReceiptAtomic(root, receipt) {
  const dest = receiptPath(root);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(receipt, null, 2), 'utf8');
  fs.renameSync(tmp, dest);
}

/** receipt.installed 로 활성 에이전트 목록을 계산. 영수증이 없거나 installed 필드가 없으면 null(=제한 없음). */
function activeListFromReceipt(receipt) {
  if (!receipt?.installed) return null;
  const known = KNOWN_AGENTS.filter((a) => receipt.installed[a]);
  if (!known.length) return null; // installed 에 알려진 에이전트가 하나도 없으면 판단 근거 없음 → 제한 없음
  return known.filter((a) => receipt.installed[a].active !== false);
}

/** receipt.installed 에 존재하지만 active:false 인 에이전트들(= 잠든 에이전트). */
function sleepingAgents(receipt) {
  if (!receipt?.installed) return [];
  return KNOWN_AGENTS.filter((a) => receipt.installed[a] && receipt.installed[a].active === false);
}

/**
 * GET /api/agents 가 쓰는 필터. AGENTS(daemon/agents.mjs 의 정적 맵)는 절대 변형하지 않고, 그 부분집합만
 * 돌려준다. 영수증이 없으면(이 PC 포함 대부분의 개발/무설치 환경) 전부 그대로 — 동작 변화 없음.
 */
export function activeAgentsMap(AGENTS, receipt = readReceipt()) {
  const active = activeListFromReceipt(receipt);
  if (!active) return AGENTS;
  const out = {};
  for (const a of active) if (AGENTS[a]) out[a] = AGENTS[a];
  return out;
}

/**
 * 에이전트 하나를 깨운다 — shim 파일을 쓰고 receipt.installed.<agent>.active=true 로 갱신한다.
 * 이미 깨어 있으면 아무것도 다시 쓰지 않는 멱등(idempotent) 동작. 영수증이 아예 없으면(설치기를 거치지
 * 않은 이 개발 PC 같은 환경) 잠든 에이전트 개념이 없으므로 손대지 않고 전부 활성으로 본다.
 * @returns {{active: string[]}}
 */
export function wake(agent, { log = () => {} } = {}) {
  if (!KNOWN_AGENTS.includes(agent)) {
    throw Object.assign(new Error(`알 수 없는 에이전트: ${agent}`), { code: 'unknown_agent' });
  }
  const receipt = readReceipt();
  if (!receipt) {
    log(`wake ${agent}: 영수증 없음 — 이미 전부 활성(변경 없음)`);
    return { active: KNOWN_AGENTS };
  }
  const root = soulRoot();
  receipt.installed = receipt.installed || {};
  const info = receipt.installed[agent] || {};
  if (info.active === true) {
    log(`wake ${agent}: 이미 깨어 있음(멱등, 변경 없음)`);
  } else {
    const dir = shimsDir(root);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${agent}.cmd`), agentShimText(agent), 'ascii');
    receipt.installed[agent] = { ...info, active: true };
    writeReceiptAtomic(root, receipt);
    log(`wake ${agent}: shim 작성 + receipt.installed.${agent}.active=true`);
  }
  return { active: activeListFromReceipt(readReceipt()) ?? KNOWN_AGENTS };
}

// ---- 자동 감지: TeamClaude 설정 파일의 계정 "개수"만 본다(토큰 값 절대 미접근) ----
function accountMatchesAgent(account, agent) {
  const tcProvider = account?.provider ?? 'anthropic';
  return agent === 'claude' ? tcProvider === 'anthropic' : tcProvider === 'codex';
}

const POLL_MS = 15000;

/**
 * 영수증이 있고 잠든 에이전트가 있을 때만 의미가 있는 폴링 감시자. 매 tick마다
 * receipt.env.teamclaudeConfig 를 다시 읽어(사용자가 그 사이 relay import를 마쳤을 수 있으므로) 잠든
 * 에이전트의 계정 수를 세고, 1개 이상이면 wake() 를 부른 뒤 onWake 콜백으로 알린다.
 */
export class SleepWatcher {
  constructor({ onWake = () => {}, log = () => {}, intervalMs = POLL_MS } = {}) {
    this.onWake = onWake;
    this.log = log;
    this.intervalMs = intervalMs;
    this.timer = null;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { this.tick(); }, this.intervalMs);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  tick() {
    try {
      const receipt = readReceipt();
      const sleeping = sleepingAgents(receipt);
      if (!sleeping.length) return;
      const cfgPath = receipt?.env?.teamclaudeConfig;
      if (!cfgPath) return;
      let config;
      try { config = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return; }
      const accounts = Array.isArray(config?.accounts) ? config.accounts : [];
      for (const agent of sleeping) {
        const count = accounts.filter((a) => accountMatchesAgent(a, agent)).length;
        if (count >= 1) {
          this.log(`wake-watch: ${agent} 계정 ${count}개 감지 — 자동으로 깨움`);
          const result = wake(agent, { log: this.log });
          this.onWake(result);
        }
      }
    } catch (e) {
      this.log(`wake-watch error: ${e?.message || e}`);
    }
  }
}
