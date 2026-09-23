// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// v2.76 — 두 에이전트 항상 표시 · 자가 치유 · 계정 상태 안내 검사(옛 installer Task 17 잠든 에이전트 깨우기 검사를 대체).
//   실 데몬(3458)·라이브 프록시(3456)·대시보드(3457)는 절대 건드리지 않는다. 대신 임시 영혼 폴더
//   (IRIS_ROOT)와 임시 상태 폴더(IRIS_FACE_STATE)를 두고, 그 위에서 이 스크립트가 직접 자식 데몬
//   프로세스 하나를 새 포트(OS가 골라주는 빈 포트, 3466 이상)로 띄워 진짜 HTTP·웹소켓 경로로 검사한다.
//   시험 데몬은 이 스크립트가 스스로 띄운 PID이므로 끝에 그 자식만 종료한다.
//   ① 시작 자가 치유 — 2.0.37 이하 설치기(v2 엔진)는 영수증에 installed.codex 를 안 썼다: 프로그램이 있으면 켠다.
//   ② 계정 변화 — 대시보드에서 계정을 더하면 status 와 웹소켓 'agents' 방송이 따라온다.
//   ③ 프로그램 없음 — 버튼은 그대로 보이고 missing 으로 안내, 영수증은 건드리지 않는다.
//   ④ 수동 POST /api/wake — 옛 경로 호환(400·200·멱등).
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { agentShimText } from '../daemon/wake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  for (let i = 0; i < 20; i++) {
    const port = await new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.on('error', reject);
      srv.listen(0, '127.0.0.1', () => { const { port: p } = srv.address(); srv.close(() => resolve(p)); });
    });
    if (port >= 3466) return port;
  }
  throw new Error('3466 이상 빈 포트를 못 찾음');
}

async function waitReady(port, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) return true; } catch {}
    await sleep(150);
  }
  return false;
}

async function waitFor(fn, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) { try { if (await fn()) return true; } catch {} await sleep(500); }
  return false;
}

function spawnDaemon(tempRoot, tempState, port) {
  const proc = spawn(process.execPath, ['daemon/server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, IRIS_ROOT: tempRoot, IRIS_FACE_STATE: tempState, IRIS_FACE_PORT: String(port), IRIS_FACE_UPDATE_CHECK: '0', IRIS_FACE_AUTO_RESUME: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.errText = '';
  proc.stderr.on('data', (d) => { proc.errText += d.toString('utf8'); });
  return proc;
}

function writeTool(root, tool) {
  const p = path.join(root, '_agent', 'shared', 'tools', tool, `${tool}.cmd`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '@echo off\r\n', 'ascii');
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-wake-root-'));
  const tempState = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-wake-state-'));
  const configPath = path.join(tempRoot, 'teamclaude-config.json');
  const receiptPath = path.join(tempRoot, '_agent', 'setup', 'package-receipt.json');
  const shimsDir = path.join(tempRoot, '_agent', 'shared', 'shims');
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.mkdirSync(shimsDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ accounts: [] }, null, 2), 'utf8');
  // 다른 선생님 PC(2026-09-23) 재현: 두 프로그램 다 있음 · 클로드 심만 있음 · 영수증에 codex 항목 자체가 없음.
  writeTool(tempRoot, 'claude');
  writeTool(tempRoot, 'codex');
  fs.writeFileSync(path.join(shimsDir, 'claude.cmd'), agentShimText('claude'), 'ascii');
  fs.writeFileSync(receiptPath, JSON.stringify({
    schema: 2,
    installed: { claude: { active: true, version: '1.0.0' } },
    env: { teamclaudeConfig: configPath },
  }, null, 2), 'utf8');

  const port = await freePort();
  ok(port >= 3466, `시험 포트 ${port} 는 3466 이상(빈 포트, OS 배정)`);
  const daemonProc = spawnDaemon(tempRoot, tempState, port);
  const pid = daemonProc.pid;
  let sock = null;

  try {
    const ready = await waitReady(port);
    ok(ready, `시험 데몬(pid ${pid}, 포트 ${port}) 기동`);
    if (!ready) { console.log(`stderr: ${daemonProc.errText.slice(0, 2000)}`); throw new Error('daemon not ready'); }
    const base = `http://127.0.0.1:${port}`;
    const getJson = async (p) => (await fetch(`${base}${p}`)).json();

    // ---- ① 시작 자가 치유 ----
    {
      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      ok(receipt.installed.codex?.active === true, '① 시작하자마자 영수증 installed.codex.active = true(항목이 없던 설치본 치유)');
      ok(receipt.installed.claude.active === true && receipt.installed.claude.version === '1.0.0', '① 영수증의 다른 필드(claude, version)는 그대로 보존');
      const shim = path.join(shimsDir, 'codex.cmd');
      ok(fs.existsSync(shim) && fs.readFileSync(shim).equals(Buffer.from(agentShimText('codex'), 'ascii')), '① codex 심이 installer 템플릿과 바이트 그대로 생성됨(ASCII, CRLF)');
      const a = await getJson('/api/agents');
      ok('claude' in a && 'codex' in a, '① /api/agents 에 두 에이전트 모두 있음(버튼 항상 표시)');
      const st = await getJson('/api/agents/status');
      ok(st.accounts && st.accounts.claude === 0 && st.accounts.codex === 0, '① status.accounts = {claude:0, codex:0} → 화면이 "계정 없음" 안내');
      ok(Array.isArray(st.missing) && st.missing.length === 0, '① status.missing = [] (두 프로그램 다 있음)');
      ok(Array.isArray(st.sleeping) && st.sleeping.length === 0, '① status.sleeping = [] (잠든 에이전트 없음)');
    }

    // ---- ② 계정 변화: 대시보드에서 코덱스 계정을 더하면 status·웹소켓 방송이 따라온다 ----
    {
      const msgs = [];
      sock = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      sock.onmessage = (e) => { try { msgs.push(JSON.parse(String(e.data))); } catch {} };
      await waitFor(() => sock.readyState === 1, 5000);
      // 계정 1개 적립(가짜 관리용 이메일만 — 토큰 필드 없음)
      fs.writeFileSync(configPath, JSON.stringify({ accounts: [{ email: 'codex-relay@localhost', provider: 'codex' }] }, null, 2), 'utf8');
      const seen = await waitFor(async () => (await getJson('/api/agents/status')).accounts?.codex === 1);
      ok(seen, '② status.accounts.codex = 1 (GET 은 매번 새로 읽음)');
      const bc = await waitFor(() => msgs.some((m) => m.type === 'agents' && m.status?.accounts?.codex === 1), 20000);
      ok(bc, "② ≤20초(감시 주기 15초) 안에 웹소켓 'agents' 방송에 status 실림 → 안내가 저절로 사라짐");
      const m = msgs.find((x) => x.type === 'agents' && x.status);
      ok(m && 'claude' in m.agents && 'codex' in m.agents, "② 방송의 agents 에도 두 에이전트 모두");
    }

    // ---- ③ 프로그램 없음: 클로드 프로그램이 없는 옛 코덱스 단독 설치본 ----
    {
      fs.rmSync(path.join(tempRoot, '_agent', 'shared', 'tools', 'claude'), { recursive: true, force: true });
      fs.rmSync(path.join(shimsDir, 'claude.cmd'), { force: true });
      const r = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      r.installed.claude.active = false;
      fs.writeFileSync(receiptPath, JSON.stringify(r, null, 2), 'utf8');
      const seen = await waitFor(async () => (await getJson('/api/agents/status')).missing?.includes('claude'));
      ok(seen, '③ status.missing 에 claude → 화면이 "프로그램 없음 — 설치 파일 다시 실행" 안내');
      const a = await getJson('/api/agents');
      ok('claude' in a && 'codex' in a, '③ 프로그램이 없어도 버튼은 그대로(두 에이전트)');
      await sleep(16000); // 한 번 더 감시 주기가 돌아도
      const r2 = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      ok(r2.installed.claude.active === false && !fs.existsSync(path.join(shimsDir, 'claude.cmd')), '③ 프로그램 없는 쪽은 켜지 않음(영수증 active:false·심 없음 그대로)');
    }

    // ---- ④ 수동 POST /api/wake(옛 경로 호환) ----
    {
      const post = (agent) => fetch(`${base}/api/wake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent }) });
      ok((await post('nova')).status === 400, "④ 알 수 없는 에이전트 'nova' → 400");
      const res = await post('codex');
      const body = await res.json();
      ok(res.status === 200 && body.ok === true && body.active.includes('codex'), '④ POST /api/wake {agent:codex} → 200, active 에 codex');
      const res2 = await post('codex');
      ok(res2.status === 200, '④ 다시 깨워도 200(멱등)');
    }

    // ---- ⑤ 토큰 미접근 ----
    {
      const logFile = path.join(tempState, 'daemon.log');
      const logText = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
      ok(/heal codex/.test(logText), '⑤ 데몬 로그에 자가 치유 기록(heal codex)');
      ok(!/token/i.test(logText), '⑤ 데몬 로그에 토큰 관련 문자열 없음(계정 개수·provider 만 봄)');
    }
  } finally {
    try { sock?.close(); } catch {}
    try { daemonProc.kill(); } catch {}
    await sleep(300);
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(tempState, { recursive: true, force: true }); } catch {}
  }
}

main().then(() => {
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}).catch((e) => {
  console.error(`오류: ${e?.stack || e}`);
  console.log(`\n${pass} PASS / ${fail + 1} FAIL`);
  process.exit(1);
});
