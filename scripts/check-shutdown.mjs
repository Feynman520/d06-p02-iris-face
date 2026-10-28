// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// "창 닫기 = 전부 종료"(v2.97) 무접촉 검사 — 실제 CLI·실 데몬(3458) 접촉 0. 모든 프로세스는 이 검사가 띄운 가짜(node 가 자식·손자를 낳고 잠듦)다.
//   1) proctree: 가계도는 PID 재사용(부모보다 먼저 시작한 "자식")을 넣지 않고, 남의 PID 판정이 시작 시각으로 갈린다
//   2) 개별 ✕(close): 그 세션의 가계도만 끝나고 카드가 지워진다 — 다른 세션·무관한 프로세스는 그대로
//   3) endAll: 살아 있는 세션 + 이전 실행이 남긴 카드(orphan)의 가계도(가짜 MCP 자식·손자)까지 끝내고 확인 보고(ok·verified·survivors 0)
//      PID 를 다른 프로그램이 이어받은 카드는 건드리지 않음 · 무관한 프로세스 유지 · 카드는 '종료됨'으로 남음(첫 메시지 전 카드는 삭제) · 기록 파일 보존
//   4) 다시 불러오기: 닫은 카드는 lost 가 아니다 → resumeLost() 가 아무것도 되살리지 않음
//   5) 끝내기 실패 흉내: 보고가 ok=false·survivors 에 남은 PID 를 적는다(거짓 완료 없음)
//   6) 시험 데몬(3459): POST /api/shutdown?wait=1 두 번 동시 → 같은 보고 · 종료 중 새 요청 503 · 데몬 종료 · state\shutdown-report.json · 가계도 종료
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SessionManager } from '../daemon/sessions.mjs';
import { readTable, descendants, isOwnProcess, parseTable, pidAlive, taskkillTree } from '../daemon/proctree.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pty = require('node-pty');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const mine = new Set(); // 이 검사가 띄운 뿌리 PID — 끝에 남은 것만 PID 로 정리한다
const cleanup = () => { for (const pid of mine) if (pidAlive(pid)) taskkillTree(pid); };
process.on('exit', cleanup);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-shut-'));
// 가짜 세션: 깊이 N 이면 자식 하나를 낳고(그 자식도 N-1) 잠든다 → 세션 → 가짜 MCP → MCP 의 자식
const FAKE = path.join(tmp, 'fake-tree.cjs');
fs.writeFileSync(FAKE, "const { spawn } = require('child_process'); const d = Number(process.argv[2] || 0);\nif (d > 0) spawn(process.execPath, [__filename, String(d - 1)], { stdio: 'ignore', windowsHide: true });\nsetInterval(() => {}, 1e6);\n", 'utf8');
const spawnTree = (depth) => { const c = spawn(process.execPath, [FAKE, String(depth)], { stdio: 'ignore', windowsHide: true, detached: true }); c.unref(); mine.add(c.pid); return c.pid; };
async function treeOf(pid, want) { for (let i = 0; i < 40; i++) { const t = await readTable(); const d = descendants(t, pid); if (d.length >= want) return d; await sleep(250); } return descendants(await readTable(), pid); }
const allDead = (list) => list.every(p => !pidAlive(p.pid));

// ---------- 1) proctree 순수 함수 ----------
{
  const t = parseTable(['10|1|132000000000000000|parent.exe', '11|10|132000000010000000|child.exe', '12|10|131999999990000000|old.exe', '13|11|132000000020000000|grand.exe'].join('\r\n'));
  const d = descendants(t, 10).map(p => p.pid).sort();
  ok(JSON.stringify(d) === '[10,11,13]', `가계도 = 뿌리+자식+손자, 부모보다 먼저 시작한 PID 재사용 프로세스 제외 (${d})`);
  const start = t.get(11).start;
  ok(isOwnProcess(t, 11, start - 1000) === true && isOwnProcess(t, 11, start - 60_000) === false && isOwnProcess(t, 99, start) === null, '내 프로세스 판정: 받은 무렵 시작 = 내 것 / 한참 뒤 시작 = 재사용 / 표에 없음 = 모름');
}

// ---------- 준비: 이전 실행이 남긴 카드 2장 + 무관한 프로세스 ----------
const orphanRoot = spawnTree(1);         // 이전 실행의 세션(+가짜 MCP 1)
const stranger = spawnTree(0);           // Face 와 무관한 프로세스(사용자가 따로 띄운 터미널 흉내)
await treeOf(orphanRoot, 2); await sleep(300);
const now = Date.now();
fs.writeFileSync(path.join(tmp, 'sessions.json'), JSON.stringify([
  { id: 's1', cwd: tmp, agent: 'claude', model: 'opus', effort: 'high', status: 'idle', pid: orphanRoot, pidAt: now, startedAt: new Date(now).toISOString(), sessionId: 'aaaaaaaa-1111-4111-8111-111111111111', title: '이전 실행이 남긴 내 세션' },
  { id: 's2', cwd: tmp, agent: 'claude', model: 'opus', effort: 'high', status: 'busy', pid: stranger, pidAt: now - 3_600_000, startedAt: new Date(now - 3_600_000).toISOString(), sessionId: 'bbbbbbbb-2222-4222-8222-222222222222', title: '번호를 남이 이어받은 카드' },
], null, 2), 'utf8');

class TestSM extends SessionManager {
  spawn(cmd, cwd, cols, rows) { const p = pty.spawn(process.execPath, [FAKE, '2'], { name: 'xterm-256color', cols, rows, cwd: tmp, env: process.env, useConpty: true }); mine.add(p.pid); return p; }
  nameSession() {} // 제목 생성기(Haiku) 호출 없음
}
const logs = [];
const sm = new TestSM(tmp, { onLog: (m) => logs.push(m) });
ok(sm.get('s1').status === 'orphan' && sm.get('s2').status === 'orphan', '이전 실행 카드 2장 = orphan 으로 읽힘');
const a = sm.create({ cwd: tmp, agent: 'claude', model: 'opus', effort: 'high' });
const b = sm.create({ cwd: tmp, agent: 'codex', model: 'terra', effort: 'medium' });
const c = sm.create({ cwd: tmp, agent: 'claude', model: 'opus', effort: 'high' });
const [ta, tb, tc] = [await treeOf(a.pid, 3), await treeOf(b.pid, 3), await treeOf(c.pid, 3)];
const to = await treeOf(orphanRoot, 2);
// 콘솔 프로그램마다 윈도가 붙이는 conhost.exe 도 가계도에 든다 — node 개수(세션·MCP·MCP 자식)로 센다
const nodes = (t) => t.filter(p => /^node(\.exe)?$/i.test(p.name)).length;
ok(nodes(ta) === 3 && nodes(tb) === 3 && nodes(tc) === 3 && nodes(to) === 2, `가짜 세션 가계도 준비(세션→MCP→MCP 자식, conhost 포함 ${ta.length}/${tb.length}/${tc.length}개), orphan node ${nodes(to)}`);

// ---------- 2) 개별 ✕ ----------
sm.close(c.id); await sleep(1500);
ok(allDead(tc), `개별 ✕: 그 세션 가계도 ${tc.length}개 종료`);
ok(!sm.get(c.id), '개별 ✕: 카드 삭제(기존 동작 유지)');
ok(!allDead(ta) && ta.every(p => pidAlive(p.pid)) && tb.every(p => pidAlive(p.pid)) && to.every(p => pidAlive(p.pid)) && pidAlive(stranger), '개별 ✕: 다른 세션·이전 실행 카드·무관한 프로세스는 그대로');

// ---------- 3) endAll ----------
const transcript = path.join(tmp, 'transcript.jsonl'); fs.writeFileSync(transcript, '{"type":"user"}\n', 'utf8');
sm.get(a.id).recordPath = transcript; sm.save();
const rep = await sm.endAll();
ok(rep.ok === true && rep.verified === true && rep.survivors.length === 0, `endAll 보고 ok·verified·남은 것 0 (ended=${rep.ended}, ${rep.ms}ms)`);
ok(allDead(ta) && allDead(tb) && allDead(to), '살아 있던 세션 2개 + 이전 실행 카드의 가계도(가짜 MCP 포함) 전부 종료');
ok(pidAlive(stranger), 'PID 를 이어받은 무관한 프로세스는 종료하지 않음');
ok(rep.sessions.find(r => r.id === 's2')?.result === 'skipped-reused', '보고: 재사용 PID 카드 = skipped-reused');
ok(sm.get(a.id)?.status === 'exited' && !sm.get(a.id).lost && sm.get(a.id).pid === null && sm.get('s1')?.status === 'exited', '세션 id 있는 카드는 종료됨으로 남음(↻ 이어가기 가능)');
ok(!sm.get(b.id), '세션 id 없는 카드(첫 메시지 전·코덱스 기록 미확인)는 삭제');
ok(fs.readFileSync(transcript, 'utf8') === '{"type":"user"}\n', '대화 기록 파일 보존');

// ---------- 4) 다시 불러오기 ----------
const sm2 = new TestSM(tmp, {});
ok(sm2.list().every(r => !r.lost) && sm2.resumeLost({ gapMs: 0 }).length === 0, '다시 실행: 닫은 카드는 자동 재개 대상 아님');
ok(!!sm2.get(a.id)?.sessionId && sm2.get(a.id).status === 'dead', '다시 실행: 카드가 「재개 가능」으로 남음(명시적 이어가기 보존)');

// ---------- 5) 끝내기 실패 흉내 ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-shut-fail-'));
  class StuckSM extends TestSM { killTree() {} }
  const s = new StuckSM(dir, {});
  const x = s.create({ cwd: tmp, agent: 'claude', model: 'opus', effort: 'high' });
  const tx = await treeOf(x.pid, 3);
  const r = await s.endAll({ settleMs: 300 });
  ok(r.ok === false && r.survivors.length === tx.length && r.survivors.every(p => tx.some(q => q.pid === p.pid)), `끝내기 실패: ok=false, 남은 PID ${r.survivors.length}개를 보고(거짓 완료 없음)`);
  taskkillTree(x.pid); await sleep(800);
}

// ---------- 6) 시험 데몬 3459 ----------
{
  const PORT = 3459;
  const st = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-shut-d-'));
  const mods = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-shut-m-'));
  fs.writeFileSync(path.join(st, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8');
  const root = spawnTree(1); await treeOf(root, 2); await sleep(300);
  fs.writeFileSync(path.join(st, 'sessions.json'), JSON.stringify([{ id: 's1', cwd: tmp, agent: 'claude', model: 'opus', effort: 'high', status: 'idle', pid: root, pidAt: Date.now(), startedAt: new Date().toISOString(), sessionId: 'cccccccc-3333-4333-8333-333333333333', title: 'daemon test' }]), 'utf8');
  const tr = await treeOf(root, 2);
  const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore', env: { ...process.env, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: st, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' } });
  mine.add(d.pid);
  const base = `http://127.0.0.1:${PORT}`;
  let h = null; for (let i = 0; i < 60 && !h; i++) { await sleep(250); try { const r = await fetch(base + '/api/health'); if (r.ok) h = await r.json(); } catch {} }
  ok(!!h && h.pid === d.pid, `시험 데몬 ${PORT} 기동 pid=${d.pid}`);
  if (h && h.pid === d.pid) {
    const post = () => fetch(base + '/api/shutdown?wait=1', { method: 'POST' }).then(r => r.json()).catch(e => ({ error: String(e) }));
    const p1 = post(); await sleep(50);
    const busy = await fetch(base + '/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(r => r.status).catch(() => 0);
    const p2 = post();
    const [r1, r2] = await Promise.all([p1, p2]);
    ok(busy === 503, `종료 중 새 세션 요청 = 503 (got ${busy})`);
    ok(r1.ok === true && r1.report?.verified === true && JSON.stringify(r1.report) === JSON.stringify(r2.report), '두 번 동시 종료 요청 → 정리는 한 번, 같은 보고');
    ok(allDead(tr), '시험 데몬이 이전 카드의 가계도를 종료');
    let gone = false; for (let i = 0; i < 20 && !gone; i++) { await sleep(150); gone = !pidAlive(d.pid); }
    ok(gone, '보고 뒤 데몬 프로세스 종료');
    const file = path.join(st, 'shutdown-report.json');
    ok(fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).ok === true, 'state\\shutdown-report.json 기록');
    const saved = JSON.parse(fs.readFileSync(path.join(st, 'sessions.json'), 'utf8'));
    ok(saved.length === 1 && saved[0].status === 'exited' && !saved[0].lost, '저장된 카드 = 종료됨(다음 실행 자동 재개 없음)');
  }
}

ok(pidAlive(stranger), '끝까지 무관한 프로세스 유지');
cleanup();
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
