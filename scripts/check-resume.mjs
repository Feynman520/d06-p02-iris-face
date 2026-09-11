// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 데몬 재시작 뒤 "잃은 세션 자동 재개"(구현계획 v2.42, 2026-09-11 16:31 사고 재발 방지) 무접촉 검사.
//   임시 state 폴더에 sessions.json 을 꾸며 SessionManager 를 올리고, spawn() 을 가짜 pty 로 바꿔 실제 CLI·프로세스 접촉 0.
//   1) load(): 살아 있던 상태(busy·idle·attention)+PID 없음+세션 id 있음 = lost / exited·세션 id 없음·PID 살아 있음(orphan) = lost 아님
//   2) resumeLost(): lost 만, 순서대로, 같은 카드에서 --resume(클로드) / resume(코덱스), 첫 요청 = RESUME_NOTE, lost 해제·resumedAt 기록
//   3) resume(): 죽은 카드(exited 포함)는 손으로 재개 가능, 살아 있는 카드는 거절, 세션 id 모르는 카드는 거절
//   4) IRIS_FACE_AUTO_RESUME=0 이면 resumeLost() 가 아무것도 하지 않는다(자식 프로세스로 확인)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SessionManager, RESUME_NOTE } from '../daemon/sessions.mjs';

const OFF = process.argv.includes('--off');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-resume-'));
const DEAD = 999999; // 존재하지 않는 PID
const cwd = process.cwd();
fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify([
  { id: 's1', cwd, agent: 'claude', model: 'fable', effort: 'high', status: 'busy', pid: DEAD, sessionId: '11111111-1111-4111-8111-111111111111', resumeCmd: 'claude --resume 1111', title: '일하다 죽은 카드' },
  { id: 's2', cwd, agent: 'claude', model: 'opus', effort: 'medium', status: 'idle', pid: DEAD, sessionId: '22222222-2222-4222-8222-222222222222', title: '대기하다 죽은 카드' },
  { id: 's3', cwd, agent: 'claude', model: 'fable', effort: 'high', status: 'exited', pid: DEAD, sessionId: '33333333-3333-4333-8333-333333333333', title: 'CLI 가 스스로 끝난 카드' },
  { id: 's4', cwd, agent: 'claude', model: 'fable', effort: 'high', status: 'busy', pid: DEAD, sessionId: null, title: '첫 메시지 전에 죽은 카드' },
  { id: 's5', cwd, agent: 'claude', model: 'fable', effort: 'high', status: 'busy', pid: process.pid, sessionId: '55555555-5555-4555-8555-555555555555', title: '아직 살아 있는 카드(orphan)' },
  { id: 's6', cwd, agent: 'codex', model: 'terra', effort: 'medium', status: 'attention', pid: DEAD, sessionId: '66666666-6666-4666-8666-666666666666', title: '코덱스 카드' },
], null, 2), 'utf8');

class FakePty { constructor(cols, rows) { this.pid = 40000 + FakePty.n++; this.cols = cols; this.rows = rows; } onData() {} onExit() {} write() {} resize() {} kill() {} }
FakePty.n = 1;
class TestSM extends SessionManager {
  spawn(cmd, cwd, cols, rows) { this.spawned = [...(this.spawned || []), { cmd, cwd }]; return new FakePty(cols, rows); }
}
const logs = [];
const sm = new TestSM(dir, { onLog: (m) => logs.push(m) });

// 1) load
const st = (id) => sm.get(id).status, lost = (id) => !!sm.get(id).lost;
ok(st('s1') === 'dead' && lost('s1'), 'load: busy+PID 없음 → dead·lost');
ok(st('s2') === 'dead' && lost('s2'), 'load: idle+PID 없음 → dead·lost');
ok(st('s3') === 'dead' && !lost('s3'), 'load: exited → dead·lost 아님(CLI 가 스스로 끝남)');
ok(st('s4') === 'dead' && !lost('s4'), 'load: 세션 id 없음 → lost 아님(재개 불가)');
ok(st('s5') === 'orphan' && !lost('s5'), 'load: PID 살아 있음 → orphan·lost 아님');
ok(st('s6') === 'dead' && lost('s6'), 'load: attention+PID 없음(코덱스) → dead·lost');
ok(sm.lost().map(r => r.id).join(',') === 's1,s2,s6', 'lost(): s1,s2,s6 순서');

if (OFF) {
  const ids = sm.resumeLost({ gapMs: 0 });
  ok(ids.length === 0 && !sm.spawned, 'IRIS_FACE_AUTO_RESUME=0: resumeLost() 아무것도 안 함');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} PASS / ${fail} FAIL (auto-resume off)`); process.exit(fail ? 1 : 0);
}

// 2) resumeLost
const ids = sm.resumeLost({ gapMs: 0 });
ok(ids.join(',') === 's1,s2,s6', 'resumeLost(): 대상 = lost 만');
await new Promise(r => setTimeout(r, 50));
ok((sm.spawned || []).length === 3, 'resumeLost(): spawn 3회(가짜 pty, 실제 CLI 접촉 0)');
const r1 = sm.get('s1'), r2 = sm.get('s2'), r6 = sm.get('s6');
ok(r1.status === 'busy' && r1.cmdline.includes('--resume 11111111-1111-4111-8111-111111111111') && r1.cmdline.includes('--model fable'), 's1: 같은 세션 id 로 claude --resume, 모델 유지');
ok(r2.cmdline.includes('--resume 22222222-2222-4222-8222-222222222222') && r2.cmdline.includes('--model opus'), 's2: opus 카드도 자기 모델로 재개');
ok(r6.status === 'busy' && /codex[^\n]*\bresume 66666666-6666-4666-8666-666666666666/.test(r6.cmdline), 's6: 코덱스는 codex resume <id>');
ok(!r1.lost && !r2.lost && !r6.lost && r1.resumedAt && r6.resumedAt, 'lost 해제 + resumedAt 기록');
ok(sm.live.get('s1')?.pendingPrompt === RESUME_NOTE && sm.live.get('s6')?.pendingPrompt === RESUME_NOTE, '첫 요청 = RESUME_NOTE(프롬프트가 뜨면 1회 전송)');
ok(r1.title === '일하다 죽은 카드' && r1.pid !== DEAD, '카드 이름 유지·새 PID');
ok(sm.get('s3').status === 'dead' && sm.get('s4').status === 'dead' && sm.get('s5').status === 'orphan', 'exited·id 없음·orphan 은 건드리지 않음');
ok(logs.filter(m => /auto-resume ok/.test(m)).length === 3, '로그: auto-resume ok ×3');
const saved = JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8'));
ok(saved.find(r => r.id === 's1').status === 'busy' && saved.find(r => r.id === 's1').lost === false, 'sessions.json 저장 반영');
ok(sm.resumeLost({ gapMs: 0 }).length === 0, '두 번째 resumeLost(): 대상 없음(중복 재개 없음)');

// 3) resume() 손으로
let threw = null; try { sm.resume('s1'); } catch (e) { threw = e.message; }
ok(/live/.test(threw || ''), 'resume(): 살아 있는 카드는 거절');
threw = null; try { sm.resume('s4'); } catch (e) { threw = e.message; }
ok(/세션 id/.test(threw || ''), 'resume(): 세션 id 모르는 카드는 거절');
const r3 = sm.resume('s3', { prompt: '' });
ok(r3.status === 'busy' && r3.cmdline.includes('--resume 33333333-3333-4333-8333-333333333333') && sm.live.get('s3')?.pendingPrompt === '', 'resume(): exited 카드는 손으로 재개(첫 요청 없음)');

// 4) auto-resume off (자식 프로세스)
const self = fileURLToPath(import.meta.url);
const sub = spawnSync(process.execPath, [self, '--off'], { env: { ...process.env, IRIS_FACE_AUTO_RESUME: '0' }, encoding: 'utf8' });
ok(sub.status === 0 && /auto-resume off/.test(sub.stdout), 'IRIS_FACE_AUTO_RESUME=0 자식 검사 통과');
if (sub.status !== 0) console.log(sub.stdout, sub.stderr);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
