// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 메모리 계기판(v2.78) 검사 — 실 데몬(3458)은 건드리지 않는다. 사용: node scripts/check-memory.mjs
//   1절 typeperf 줄 해석 · 2절 위험도 · 3절 프로세스 묶기(세션 → IRIS → 이름) · 4절 고리 버퍼·방송 · 5절 측정기 실패 → CIM 전환·정리
//   6절 잔여물 미리보기는 --apply 를 절대 붙이지 않음 · 7절(윈도) 진짜 typeperf 한 번 + 끝낸 뒤 프로세스가 남지 않음
//   8절(윈도) 시험 데몬 3459: features.memory · /api/memory · /api/memory/top · 다른 출처 403 · ws hello.mem·mem 방송 · 종료 뒤 고아 typeperf 0
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { parseTypeperfLine, levelOf, groupProcesses, MemoryMonitor, CommitProbe, KEEP, WARN_FREE_GB } from '../daemon/memory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const GB = 2 ** 30;
const WIN = process.platform === 'win32';

// ---- 1절 typeperf 줄 ----
ok(parseTypeperfLine('"(PDH-CSV 4.0)","\\\\PC\\Memory\\Committed Bytes","\\\\PC\\Memory\\Commit Limit"') === null, '1 머리줄 = null');
const v = parseTypeperfLine('"10/04/2026 13:09:54.053","38620225536.000000","76699983872.000000"\r');
ok(v && v.used === 38620225536 && v.limit === 76699983872, '1 숫자 줄 → used·limit(바이트, CR 무시)');
ok(parseTypeperfLine('\uFFFD\uFFFD\uFFFD \uFFFD\uFFFD\uFFFD\uFFFD.') === null, '1 깨진 한국어 안내 문구 = null');
ok(parseTypeperfLine('"10/04/2026 13:09:56.053"," "," "') === null, '1 빈 값 = null');
ok(parseTypeperfLine('"t","-1","100"') === null, '1 음수 = null');

// ---- 2절 위험도 ----
ok(levelOf({ ru: 10, rt: 32, cu: 30, cl: 76 }) === 'ok', '2 여유 46GB·RAM 31% = ok');
ok(levelOf({ ru: 10, rt: 32, cu: 66, cl: 76 }) === 'warn', '2 여유 10GB = warn');
ok(levelOf({ ru: 10, rt: 32, cu: 72, cl: 76 }) === 'bad', `2 여유 4GB(< ${WARN_FREE_GB}) = bad`);
ok(levelOf({ ru: 31, rt: 32, cu: null, cl: null }) === 'bad', '2 커밋 모름 + RAM 97% = bad');
ok(levelOf({ ru: 28, rt: 32, cu: null, cl: null }) === 'warn', '2 커밋 모름 + RAM 87% = warn');

// ---- 3절 프로세스 묶기 ----
{
  const P = (pid, ppid, name, privGb, wsGb = privGb / 2) => ({ pid, ppid, name, priv: privGb * GB, ws: wsGb * GB });
  const procs = [
    P(50, 1, 'node.exe', 0.3),                                   // 데몬 자신
    P(60, 50, 'OpenConsole.exe', 0.01),                          // 데몬 자손(세션 아님) → IRIS
    P(100, 50, 'claude.exe', 0.5), P(101, 100, 'node.exe', 1.2), P(102, 101, 'Hwp.exe', 0.8), // 세션 A 의 나무
    P(200, 50, 'codex.exe', 0.2),                                // 세션 B
    P(300, 1, 'chrome.exe', 1.0), P(301, 300, 'chrome.exe', 0.9), P(302, 300, 'Chrome.exe', 0.7), // 이름별 3개 → 하나로
    P(400, 1, 'Memory Compression', 0.0, 2.0),
    P(500, 501, 'loop-a.exe', 0.1), P(501, 500, 'loop-b.exe', 0.1), // 부모가 서로를 가리키는 고리(PID 재사용)
    P(0, 0, 'System Idle Process', 0),
  ];
  // D = 끝난 세션의 PID 를 윈도가 chrome 에 다시 준 경우(부모가 데몬이 아님) → 세션으로 묶지 않는다(검토 2번)
  const sessions = [{ id: 'A', title: '보고서 쓰기', pid: 100 }, { id: 'B', title: '', pid: 200 }, { id: 'C', title: '죽은 세션', pid: 999 }, { id: 'D', title: '재사용된 PID', pid: 300 }];
  const g = groupProcesses(procs, sessions, { selfPid: 50, limit: 20 });
  const find = (pred) => g.find(pred);
  const a = find(x => x.kind === 'session' && x.id === 'A');
  ok(a && a.count === 3 && Math.abs(a.priv - 2.5) < 0.01, `3 세션 A = 자기+자손 3개, 2.5GB (got ${a?.count}, ${a?.priv})`);
  ok(find(x => x.id === 'B')?.label === '이름 없는 세션', '3 제목 없는 세션 = "이름 없는 세션"');
  ok(!find(x => x.id === 'C'), '3 PID 가 없는 세션은 목록에 없음');
  ok(!find(x => x.id === 'D'), '3 부모가 데몬이 아닌 세션 PID(재사용) = 세션으로 묶지 않음');
  const iris = find(x => x.kind === 'iris');
  ok(iris && iris.count === 2, `3 IRIS 데몬 = 데몬+OpenConsole(세션 나무 제외) 2개 (got ${iris?.count})`);
  const chrome = g.filter(x => x.label.toLowerCase() === 'chrome');
  ok(chrome.length === 1 && chrome[0].count === 3 && Math.abs(chrome[0].priv - 2.6) < 0.01, '3 이름별 묶음: chrome ×3 = 2.6GB(대소문자 무시, .exe 뗌)');
  ok(g.every((x, i) => i === 0 || g[i - 1].priv >= x.priv), '3 잡아 둔 양 큰 순');
  ok(!g.some(x => /System Idle/.test(x.label)), '3 PID 0 제외');
  ok(groupProcesses(procs, sessions, { selfPid: 50 }).length <= 8, '3 기본 8개까지');
  ok(find(x => x.label === 'loop-a') && find(x => x.label === 'loop-b'), '3 부모 고리가 있어도 멈추지 않음');
}

// ---- 4절 고리 버퍼·방송 ----
{
  const sent = []; let t = 1_000_000;
  const probe = { start() {}, stop() {}, read: () => ({ used: 30 * GB, limit: 76 * GB }), mode: 'typeperf' };
  const m = new MemoryMonitor({ broadcast: (o) => sent.push(o), probe, osMem: () => ({ total: 32 * GB, free: 11 * GB }), now: () => (t += 2000), platform: 'win32' });
  for (let i = 0; i < KEEP + 50; i++) m.tick();
  const h = m.history();
  ok(h.samples.length === KEEP, `4 기록은 ${KEEP}개(30분)까지만 (got ${h.samples.length})`);
  const s = m.latest();
  ok(s.ru === 21 && s.rt === 32 && s.cu === 30 && s.cl === 76 && s.lvl === 'ok', `4 표본 = GB 두 자리·lvl (got ${JSON.stringify(s)})`);
  ok(sent.length === KEEP + 50 && sent.every(o => o.type === 'mem' && o.s), '4 표본마다 {type:"mem", s} 방송');
  ok(h.commit === 'typeperf' && h.top === true && h.warnFreeGb === WARN_FREE_GB && h.sweep === false, '4 features: commit·top·warnFreeGb, 청소기 없으면 sweep=false');
  const m2 = new MemoryMonitor({ probe: { ...probe, read: () => null }, osMem: () => ({ total: 32 * GB, free: 11 * GB }) });
  ok(m2.sample().cu === null && m2.sample().cl === null, '4 커밋 모르면 null(화면 "측정 불가")');
  const m3 = new MemoryMonitor({ probe: { ...probe, read: () => null, waiting: true }, osMem: () => ({ total: 32 * GB, free: 11 * GB }) });
  ok(m3.sample().cw === true && m2.sample().cw === undefined, '4 첫 숫자 기다리는 중 = cw:true(화면 "측정 준비 중")');
}

// ---- 5절 측정기 실패 → CIM 전환·정리 ----
{
  const spawned = [];
  const fakeSpawn = (exe, args) => {
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.killed = false; c.kill = () => { c.killed = true; };
    spawned.push({ exe, args, c }); setTimeout(() => c.emit('close', 1), 5); return c;   // 숫자 없이 바로 끝나는 고장 PC
  };
  const execs = [];
  const fakeExec = (file, args, o, cb) => { execs.push({ file, args }); setTimeout(() => cb(null, '75000000 30000000\r\n'), 1); };
  const p = new CommitProbe({ platform: 'win32', spawnImpl: fakeSpawn, execImpl: fakeExec, retryMs: 10, cimMs: 50 });
  p.start(); await sleep(150);
  ok(spawned.length === 3, `5 숫자 없이 끝나면 3번까지 다시 띄움 (got ${spawned.length})`);
  ok(/typeperf\.exe$/i.test(spawned[0].exe) && spawned[0].args.includes('-sc') && spawned[0].args.includes('1800'), '5 typeperf.exe 전체 경로 + 1시간(-sc 1800) 뒤 스스로 끝남');
  ok(p.mode === 'cim' && execs.length >= 1, `5 3번 실패 → CIM 으로 전환 (mode=${p.mode})`);
  const r = p.read();
  ok(r && r.limit === 75000000 * 1024 && r.used === (75000000 - 30000000) * 1024, '5 CIM 숫자(KB) → 바이트');
  p.stop(); const n = execs.length; await sleep(120);
  ok(execs.length === n, '5 stop() 뒤 CIM 더 부르지 않음');

  // 정상: 숫자를 충분히(healthySamples) 낸 typeperf 가 끝나면(1시간) 곧바로 다시 띄운다. stop() 은 지금 자식을 끝낸다.
  const live = []; const okSpawn = () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.kill = () => { c.killed = true; }; live.push(c); return c; };
  const lines = (n) => Buffer.from('"(PDH-CSV 4.0)","a","b"\r\n' + Array.from({ length: n }, (_, i) => `"t","${1000 + i}","2000"\r\n`).join(''));
  const q = new CommitProbe({ platform: 'win32', spawnImpl: okSpawn, retryMs: 30, healthySamples: 10 });
  q.start(); live[0].stdout.emit('data', lines(12));
  ok(q.read()?.used === 1011, '5 stdout 줄 → read()(마지막 값)');
  live[0].emit('close', 0);
  ok(live.length === 2, '5 숫자를 충분히 낸 뒤 끝나면 곧바로 다시 띄움');
  // 숫자를 조금만 내고 끝나면 실패 — 대기 없이 계속 다시 띄우지 않는다(검토 3번)
  live[1].stdout.emit('data', lines(1)); live[1].emit('close', 1);
  ok(live.length === 2 && q.fails === 1, '5 숫자 1개 뒤 끝남 = 실패 1회, 곧바로 다시 띄우지 않음');
  await sleep(60);
  ok(live.length === 3, '5 retryMs 대기 뒤에야 다시 띄움');
  // 이전 실행의 늦은 줄은 끝난 실행에 섞이지 않는다(검토 4번): 끝난 live[1] 에 줄이 와도 새 실행 횟수에 안 셈
  live[1].stdout.emit('data', lines(20));
  ok(q.run && q.run.samples === 0, '5 끝난 실행의 늦은 출력은 새 실행에 섞이지 않음');
  q.stop(); ok(live[2].killed === true, '5 stop() = 지금 자식 프로세스 끝냄');
  // 첫 숫자를 끝내 내지 않는 typeperf(카운터 하나가 없는 PC — 열 1개짜리 줄만 냄)는 firstSampleMs 뒤 끝내고 실패로 센다(검토 1번)
  const silent = []; const silentSpawn = () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.kill = () => { c.killed = true; setTimeout(() => c.emit('close', 1), 1); }; silent.push(c); return c; };
  const w = new CommitProbe({ platform: 'win32', spawnImpl: silentSpawn, retryMs: 10, firstSampleMs: 20, execImpl: fakeExec, cimMs: 1000 });
  w.start(); silent[0].stdout.emit('data', Buffer.from('"(PDH-CSV 4.0)","x"\r\n"t","123"\r\n'));
  ok(w.waiting === true, '5 첫 숫자 전 = 측정 준비 중');
  await sleep(40);
  ok(silent[0].killed === true && w.fails === 1 && w.waiting === false, '5 firstSampleMs 안에 숫자 없음 → 끝내고 실패 1회, 이후 "측정 불가"');
  await sleep(150);
  ok(w.mode === 'cim', `5 3번 연속이면 CIM 으로 (mode=${w.mode}, spawned=${silent.length})`);
  w.stop();
  // CIM 실행 자체가 던져도 다음 차례를 건다(검토 5번)
  let throws = 0; const throwExec = () => { throws++; throw new Error('boom'); };
  const t5 = new CommitProbe({ platform: 'win32', execImpl: throwExec, cimMs: 10 }); t5.mode = 'cim'; t5.pollCim(); await sleep(45);
  ok(throws >= 2, `5 CIM 실행이 던져도 다시 시도 (${throws}회)`);
  t5.stop();
  const off = new CommitProbe({ platform: 'darwin', spawnImpl: () => { throw new Error('no'); } }); off.start();
  ok(off.mode === 'off' && off.read() === null, '5 윈도가 아니면 커밋 측정 안 함(off)');
}

// ---- 6절 잔여물 미리보기 ----
{
  const calls = [];
  const m = new MemoryMonitor({ probe: { start() {}, stop() {}, read: () => null, mode: 'off' }, sweeper: 'C:/x/orphan-sweeper.py', python: () => 'C:/py/python.exe',
    execImpl: (file, args, o, cb) => { calls.push({ file, args, env: o.env }); setTimeout(() => cb(null, '   preview  1234 Hwp.exe  C1\n대상 1개, 종료 0개'), 1); } });
  const [r1, r2] = await Promise.all([m.sweepPreview(), m.sweepPreview()]);
  ok(calls.length === 1 && r1 === r2, '6 동시에 두 번 눌러도 한 번만 실행');
  ok(calls[0].args.length === 1 && calls[0].args[0] === 'C:/x/orphan-sweeper.py' && !calls.some(c => c.args.includes('--apply')), '6 인자 = 스크립트 하나뿐(--apply 없음)');
  ok(r1.ok && /대상 1개/.test(r1.text) && calls[0].env.PYTHONUTF8 === '1', '6 결과 글 + 파이썬 UTF-8');
  const src = fs.readFileSync(path.join(ROOT, 'daemon', 'memory.mjs'), 'utf8');
  ok(!/['"]--apply['"]/.test(src), '6 memory.mjs 소스에 "--apply" 문자열 인자 없음');
  // top·미리보기 실행이 던져도 약속이 거부된 채 남지 않고, 다음 요청은 다시 실행된다(검토 5번)
  let n5 = 0;
  const bad = new MemoryMonitor({ platform: 'win32', probe: { start() {}, stop() {}, read: () => null, mode: 'off' }, sweeper: 'x.py', python: () => 'py',
    execImpl: (file, args, o, cb) => { n5++; if (n5 <= 2) throw new Error('spawn EPERM'); setTimeout(() => cb(null, file === 'powershell.exe' ? '1\t0\t10\t20\tfoo.exe\r\n' : 'ok'), 1); } });
  const b1 = await bad.top(), b2 = await bad.sweepPreview();
  ok(b1.error === 'failed' && b2.ok === false, '6 실행이 던지면 실패로 답함(거부 아님)');
  const b3 = await bad.top(), b4 = await bad.sweepPreview();
  ok(b3.groups?.length === 1 && b4.ok === true, '6 그다음 요청은 정상 실행');
  const none = new MemoryMonitor({ probe: { start() {}, stop() {}, read: () => null, mode: 'off' } });
  ok((await none.sweepPreview()).error === 'unavailable' && none.features().sweep === false, '6 청소기 없는 PC = unavailable');
}

// ---- 7절 진짜 typeperf ----
const typeperfPids = (parentPid) => {
  const ps = `Get-CimInstance Win32_Process -Filter "Name='typeperf.exe'" | Where-Object { $_.ParentProcessId -eq ${parentPid} } | ForEach-Object { $_.ProcessId }`;
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true });
  return (r.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(Number);
};
if (WIN) {
  const p = new CommitProbe({});
  p.start(); let r = null; for (let i = 0; i < 40 && !r; i++) { await sleep(200); r = p.read(); }
  ok(r && r.limit >= os.totalmem() * 0.9 && r.used > 0 && r.used < r.limit, `7 진짜 typeperf: 커밋 ${r ? (r.used / GB).toFixed(1) : '?'} / ${r ? (r.limit / GB).toFixed(1) : '?'}GB`);
  const childPid = p.child?.pid;
  ok(typeperfPids(process.pid).includes(childPid), `7 측정기는 이 프로세스의 자식 1개 (pid ${childPid})`);
  p.stop(); await sleep(600);
  ok(typeperfPids(process.pid).length === 0, '7 stop() 뒤 남은 typeperf 0');
} else console.log('SKIP 7 (윈도 아님)');

// ---- 8절 시험 데몬 3459 ----
if (WIN) {
  const PORT = 3459;
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-mem-state-'));
  const mods = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-mem-mods-'));
  const daemon = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' } });
  const pid = daemon.pid;
  const api = async (p, init) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  let health = null;
  for (let i = 0; i < 40 && !health; i++) { await sleep(250); try { const r = await api('/api/health'); if (r.status === 200) health = r.body; } catch {} }
  ok(!!health && health.pid === pid, `8 시험 데몬 ${PORT} pid=${pid}`);
  const fm = health?.features?.memory;
  ok(fm && fm.commit === 'typeperf' && fm.top === true && fm.warnFreeGb === WARN_FREE_GB, `8 features.memory (${JSON.stringify(fm)})`);
  // ws: hello 에 mem, 그 뒤 2초 안팎으로 mem 방송
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const got = [];
  ws.on('message', (d) => { try { got.push(JSON.parse(d.toString())); } catch {} });
  await new Promise((res) => { ws.on('open', res); ws.on('error', res); });
  // typeperf 는 켜진 뒤 첫 숫자까지 약 4.3초(2026-10-04 실측) → 방송에 커밋이 실리기까지 최대 9초 기다린다
  for (let i = 0; i < 45 && !got.some(m => m.type === 'mem' && m.s?.cu != null); i++) await sleep(200);
  const hello = got.find(m => m.type === 'hello'); const mems = got.filter(m => m.type === 'mem');
  ok(hello && hello.mem && typeof hello.mem.ru === 'number', '8 ws hello.mem 표본');
  ok(mems.length >= 1 && mems.every(m => m.s && m.s.rt > 0), `8 ws mem 방송 ${mems.length}회`);
  ok(mems.some(m => m.s.cu != null && m.s.cl > 0), '8 방송에 커밋 숫자가 실림(typeperf 동작, 9초 안)');
  ok(mems.filter(m => m.s.cu == null).every(m => m.s.cw === true), '8 첫 숫자 전 표본은 cw(준비 중) 표시');
  ws.close();
  const h = await api('/api/memory');
  ok(h.status === 200 && Array.isArray(h.body.samples) && h.body.samples.length >= 2, `8 /api/memory 기록 ${h.body.samples?.length}개`);
  const t = await api('/api/memory/top');
  ok(t.status === 200 && Array.isArray(t.body.groups) && t.body.groups.length > 0 && t.body.groups.some(x => x.kind === 'iris'), `8 /api/memory/top ${t.body.groups?.length}묶음(IRIS 데몬 포함, 프로세스 ${t.body.procs}개)`);
  const f = await api('/api/memory/sweep-preview', { method: 'POST', headers: { Origin: 'http://evil.example.com' } });
  ok(f.status === 403, `8 다른 출처의 잔여물 미리보기 거부(403) (got ${f.status})`);
  const tp = typeperfPids(pid);
  ok(tp.length === 1, `8 시험 데몬의 typeperf 자식 = 1개 (got ${tp.length})`);
  try { await api('/api/shutdown', { method: 'POST' }); } catch {}
  let alive = true; for (let i = 0; i < 16 && alive; i++) { await sleep(250); try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; } }
  if (alive) { try { process.kill(pid); } catch {} }
  ok(!alive, '8 시험 데몬 종료');
  await sleep(500);
  const leftover = tp.filter(x => { try { process.kill(x, 0); return true; } catch { return false; } });
  ok(leftover.length === 0, `8 종료 뒤 고아 typeperf 0 (남음 ${leftover.join(',') || '없음'})`);
  fs.rmSync(state, { recursive: true, force: true }); fs.rmSync(mods, { recursive: true, force: true });
} else console.log('SKIP 8 (윈도 아님)');

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
