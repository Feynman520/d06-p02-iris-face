// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// installer Task 17 — 잠든 에이전트 깨우기 검사.
//   실 데몬(3458)·라이브 프록시(3456)·대시보드(3457)는 절대 건드리지 않는다. 대신 임시 영혼 폴더
//   (IRIS_ROOT)와 임시 상태 폴더(IRIS_FACE_STATE)를 두고, 그 위에서 이 스크립트가 직접 자식 데몬
//   프로세스 하나를 새 포트(OS가 골라주는 빈 포트, 3466 이상이 되도록 재시도)로 띄워 진짜 HTTP·웹소켓
//   경로로 검사한다. 시험 데몬은 이 스크립트가 스스로 띄운 PID이므로 끝에 그 PID만 종료한다.
//   시나리오 ①은 수동 POST /api/wake, 시나리오 ②는 SleepWatcher 자동 감지(같은 데몬을 이어 씀).
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

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

async function waitReady(port, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-wake-root-'));
  const tempState = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-wake-state-'));
  const configPath = path.join(tempRoot, 'teamclaude-config.json');
  const receiptPath = path.join(tempRoot, '_agent', 'setup', 'package-receipt.json');
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ accounts: [] }, null, 2), 'utf8');
  fs.writeFileSync(receiptPath, JSON.stringify({
    schema: 1,
    installed: { claude: { active: true, version: '1.0.0' }, codex: { active: false, version: '1.0.0' } },
    env: { teamclaudeConfig: configPath },
  }, null, 2), 'utf8');

  const port = await freePort();
  ok(port >= 3466, `시험 포트 ${port} 는 3466 이상(빈 포트, OS 배정)`);

  const daemonProc = spawn(process.execPath, ['daemon/server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, IRIS_ROOT: tempRoot, IRIS_FACE_STATE: tempState, IRIS_FACE_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  daemonProc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
  const pid = daemonProc.pid;

  try {
    const ready = await waitReady(port);
    ok(ready, `시험 데몬(pid ${pid}, 포트 ${port}) 기동`);
    if (!ready) { console.log(`stderr: ${stderr.slice(0, 2000)}`); throw new Error('daemon not ready'); }

    const base = `http://127.0.0.1:${port}`;

    // ---- 시나리오 ①: 수동 POST /api/wake ----
    {
      const a1 = await (await fetch(`${base}/api/agents`)).json();
      ok('claude' in a1, '깨우기 전: /api/agents 에 claude 있음(항상 활성)');
      ok(!('codex' in a1), '깨우기 전: /api/agents 에 codex 없음(잠든 상태, 영수증 반영)');

      const bad = await fetch(`${base}/api/wake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: 'nova' }) });
      ok(bad.status === 400, "알 수 없는 에이전트 'nova' → 400");

      const res = await fetch(`${base}/api/wake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: 'codex' }) });
      const body = await res.json();
      ok(res.status === 200, 'POST /api/wake {agent:codex} → 200');
      ok(body.ok === true && Array.isArray(body.active) && body.active.includes('codex'), '응답 {ok:true, active:[…]} 에 codex 포함');

      const shimPath = path.join(tempRoot, '_agent', 'shared', 'shims', 'codex.cmd');
      ok(fs.existsSync(shimPath), 'shim 파일 <root>\\_agent\\shared\\shims\\codex.cmd 생성됨');
      const bytes = fs.readFileSync(shimPath);
      const expected = Buffer.from(agentShimText('codex'), 'ascii');
      ok(bytes.equals(expected), 'shim 바이트가 installer/lib/shims.mjs 템플릿과 정확히 일치(ASCII, CRLF)');

      const receiptAfter = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      ok(receiptAfter.installed.codex.active === true, '영수증 installed.codex.active = true 로 갱신');
      ok(receiptAfter.installed.claude.active === true && receiptAfter.installed.claude.version === '1.0.0', '영수증의 다른 필드(claude, version)는 그대로 보존');

      const a2 = await (await fetch(`${base}/api/agents`)).json();
      ok('codex' in a2, '깨운 뒤: /api/agents 에 codex 포함');

      // 멱등성: 다시 깨워도 에러 없이 같은 결과
      const res2 = await fetch(`${base}/api/wake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: 'codex' }) });
      const body2 = await res2.json();
      ok(res2.status === 200 && body2.active.includes('codex'), '이미 깨어난 에이전트를 다시 깨워도 200(멱등)');
    }

    // ---- 시나리오 ②: SleepWatcher 자동 감지 (같은 데몬을 이어 씀) ----
    {
      // codex 를 다시 재우고(외부에서 영수증만 되돌림 — 데몬은 매 tick마다 파일을 다시 읽으므로 재시작 불필요),
      // TeamClaude 설정 파일에 계정을 1개 적립해 SleepWatcher 가 스스로 깨우는지 본다. 토큰 값은 절대 넣지 않는다.
      const receiptBack = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      receiptBack.installed.codex.active = false;
      fs.writeFileSync(receiptPath, JSON.stringify(receiptBack, null, 2), 'utf8');
      fs.unlinkSync(path.join(tempRoot, '_agent', 'shared', 'shims', 'codex.cmd'));

      const before = await (await fetch(`${base}/api/agents`)).json();
      ok(!('codex' in before), '재워둠: /api/agents 에 codex 다시 없음(외부 영수증 되돌림 확인)');

      // 계정 1개 적립(가짜 관리용 이메일만 — 토큰 필드 없음)
      fs.writeFileSync(configPath, JSON.stringify({ accounts: [{ email: 'codex-relay@localhost', provider: 'codex' }] }, null, 2), 'utf8');

      const untilMs = Date.now() + 20000;
      let woke = false;
      while (Date.now() < untilMs && !woke) {
        await new Promise((r) => setTimeout(r, 1000));
        const a = await (await fetch(`${base}/api/agents`)).json();
        if ('codex' in a) woke = true;
      }
      ok(woke, 'SleepWatcher 가 ≤20초 안에 계정 적립을 감지해 codex 를 자동으로 깨움');
      const receiptAuto = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      ok(receiptAuto.installed.codex.active === true, '자동 깨우기도 영수증 installed.codex.active=true 로 반영');
      const shimAuto = path.join(tempRoot, '_agent', 'shared', 'shims', 'codex.cmd');
      ok(fs.existsSync(shimAuto), '자동 깨우기도 shim 파일을 다시 씀');

      const logFile = path.join(tempState, 'daemon.log');
      const logText = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
      ok(!/token/i.test(logText), '데몬 로그에 토큰 관련 문자열 없음(계정 개수·provider 만 봄)');
    }
  } finally {
    try { daemonProc.kill(); } catch {}
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
