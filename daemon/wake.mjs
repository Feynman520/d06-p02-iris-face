// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// v2.76(2026-09-23): 두 에이전트 버튼은 항상 보이고, 프로그램이 있는 잠든 에이전트는 계정과 상관없이 스스로 켠다
// (healAgents). 계정 수·프로그램 없음은 agentStatus() 로 따로 알린다. 아래 Task 17 설명은 그 전의 이력이다.
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
// 코덱스 전용 3줄(P03 shims.mjs CODEX_PROXY_LINES 그대로): TeamClaude 는 코덱스를
// 전달 프록시(MITM) 방식으로만 중계하므로 심 안에서만 HTTPS_PROXY + CA 번들을 준다.
const CODEX_PROXY_LINES = [
  'set "HTTPS_PROXY=http://127.0.0.1:3456"',
  'set "NO_PROXY=localhost,127.0.0.1,::1"',
  'set "SSL_CERT_FILE=%~dp0..\\portable-state\\teamclaude\\codex-ca-bundle.pem"',
];
export function agentShimText(agent) {
  const { envName, envDir, tool } = AGENT_SHIMS[agent];
  return crlf([
    '@echo off',
    'setlocal',
    'set "ANTHROPIC_BASE_URL=http://127.0.0.1:3456"',
    ...(agent === 'codex' ? CODEX_PROXY_LINES : []),
    `set "${envName}=%~dp0..\\..\\${envDir}"`,
    'set "PATH=%~dp0..\\tools\\node;%PATH%"',
    'if exist "%~dp0relay-ensure.cmd" call "%~dp0relay-ensure.cmd"',
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

/** receipt.installed 에 존재하지만 active:false 인 에이전트들(= 잠든 에이전트). 영수증이 없으면 빈 목록.
 *  GET /api/agents/sleeping · 'agents' 방송이 싣는다 — Face 가 "Codex 는 잠들어 있음" 안내를 그린다(2026-09-23). */
export function sleepingAgents(receipt = readReceipt()) {
  if (!receipt?.installed) return [];
  return KNOWN_AGENTS.filter((a) => receipt.installed[a] && receipt.installed[a].active === false);
}

/**
 * GET /api/agents 가 쓰는 맵. v2.76(2026-09-23 사용자 결정): 설치 때 어느 구독을 골랐든 **두 에이전트 버튼을
 * 항상 다 보인다** — 계정은 나중에 대시보드에서 더하면 바로 연결되므로, 버튼을 숨기면 고장으로만 보인다.
 * 계정이 없거나 프로그램이 없는 쪽은 agentStatus() 가 따로 알려 화면이 한 줄 안내를 그린다.
 * (receipt 인자는 옛 호출부 호환용으로만 남긴다.)
 */
export function activeAgentsMap(AGENTS, receipt) { // eslint-disable-line no-unused-vars
  return AGENTS;
}

/** 그 에이전트의 실행 파일(설치기가 놓는 전달 .cmd). 심은 이 파일을 부르므로, 없으면 깨워도 켜지지 않는다. */
export function toolCmdPath(root, agent) {
  const { tool } = AGENT_SHIMS[agent];
  return path.join(root, '_agent', 'shared', 'tools', tool, `${tool}.cmd`);
}

/** 영수증이 있는 설치본에서 프로그램 자체가 아직 없는 에이전트(예: 2.0.37 이하 코덱스 단독 설치의 Claude). */
export function missingAgents(receipt = readReceipt(), root = soulRoot()) {
  if (!receipt) return [];
  return KNOWN_AGENTS.filter((a) => !fs.existsSync(toolCmdPath(root, a)));
}

/** TeamClaude 설정의 에이전트별 계정 "개수"(토큰 미접근). 영수증·설정 경로가 없거나 못 읽으면 null(=판단 안 함). */
export function agentAccounts(receipt = readReceipt()) {
  const cfgPath = receipt?.env?.teamclaudeConfig;
  if (!cfgPath) return null;
  let config;
  try { config = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return null; }
  const accounts = Array.isArray(config?.accounts) ? config.accounts : [];
  const out = {};
  for (const a of KNOWN_AGENTS) out[a] = accounts.filter((x) => accountMatchesAgent(x, a)).length;
  return out;
}

/** 화면이 버튼 옆 안내를 그릴 재료: 계정 수·프로그램 없음·(옛) 잠든 목록. GET /api/agents/status 와 'agents' 방송. */
export function agentStatus(receipt = readReceipt(), root = soulRoot()) {
  return { accounts: agentAccounts(receipt), missing: missingAgents(receipt, root), sleeping: sleepingAgents(receipt) };
}

/**
 * 자가 치유(v2.76): 영수증에 빠졌거나(설치기 v2 엔진이 installed.codex 를 안 쓰던 판) 잠든(active:false)
 * 에이전트라도 프로그램이 제자리에 있으면 계정과 상관없이 깨운다 — 심을 쓰고 active:true 로 적는다.
 * 프로그램이 없으면 깨워도 소용없으니 그대로 둔다(missingAgents 가 안내). 영수증이 없으면 무동작.
 * @returns {string[]} 이번에 깨운 에이전트
 */
export function healAgents({ log = () => {} } = {}) {
  const receipt = readReceipt();
  if (!receipt) return [];
  const root = soulRoot();
  const woke = [];
  for (const a of KNOWN_AGENTS) {
    const info = receipt.installed?.[a];
    if (info && info.active === true && fs.existsSync(path.join(shimsDir(root), `${a}.cmd`))) continue;
    if (!fs.existsSync(toolCmdPath(root, a))) continue;
    if (info?.active === true) {
      // 영수증은 켜짐인데 심만 사라졌다 — 심만 다시 쓴다.
      fs.mkdirSync(shimsDir(root), { recursive: true });
      fs.writeFileSync(path.join(shimsDir(root), `${a}.cmd`), agentShimText(a), 'ascii');
      log(`heal ${a}: 심 다시 씀`);
    } else {
      wake(a, { log });
      log(`heal ${a}: 프로그램이 있어 켬(영수증 ${info ? 'active:false' : '항목 없음'} → active:true)`);
    }
    woke.push(a);
  }
  return woke;
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

// v2.76: 시작하자마자 한 번(자가 치유) + 15초마다 — ① 프로그램이 있는 잠든/빠진 에이전트를 켜고
// ② 계정 수·프로그램 없음 상태가 바뀌면 onChange(status) 로 알린다(화면의 "계정 없음" 안내가 저절로 사라지게).
// 영수증이 없는 PC 에서는 healAgents 가 무동작이고 status 도 늘 같아 알림이 없다.
export class SleepWatcher {
  constructor({ onWake, onChange, log = () => {}, intervalMs = POLL_MS } = {}) {
    this.onChange = onChange || onWake || (() => {});
    this.log = log;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.last = null;
  }
  start() {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => { this.tick(); }, this.intervalMs);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  tick() {
    try {
      const woke = healAgents({ log: (m) => this.log(`wake-watch: ${m}`) });
      const status = agentStatus();
      const key = JSON.stringify(status);
      if (woke.length || (this.last !== null && key !== this.last)) this.onChange(status);
      this.last = key;
    } catch (e) {
      this.log(`wake-watch error: ${e?.message || e}`);
    }
  }
}
