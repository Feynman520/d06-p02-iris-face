// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 요청 보내기(sessions.mjs send()) — 첨부 이미지가 든 요청의 Enter 시점·전송 확인 무접촉 검사. 가짜 pty 가 CLI 화면을 흉내 낸다(실제 CLI·데몬 접촉 0).
//   실측(2026-11-05, 클로드코드 2.1.311): 붙여 넣은 글에 이미지 경로가 있으면 CLI 는 그림을 읽는 동안(0.5~1.8초) 아무것도 출력하지 않다가
//   글 + [Image #1] 을 한꺼번에 그리고, 경로 글자는 화면에 한 번도 나오지 않는다. 그 사이에 친 Enter 는 빠질 수 있다.
//   1) 이미지 경로: 화면이 붙여넣기에 반응한 뒤에 Enter → 전송됨(working) · 붙여넣기 전 출력만 보고 바로 치지 않음
//   2) 반응 전에 친 Enter 가 빠지면: 첫 줄 머리로 입력창에 남은 요청을 알아보고 Enter 재시도 → 전송됨(거짓 "enter ok" 없음)
//   3) 첨부만 있는 요청(앞 글 없음): 입력창의 「[첨부 파일]」 로 남은 요청을 알아봄
//   4) 보통 글: 곧바로 반응하면 전과 같이 한 번에 전송
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionManager } from '../daemon/sessions.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** 클로드코드 입력창 흉내: 붙여넣기를 받으면 echoMs 뒤 composer 를 그린다(그 전 Enter 는 dropEarly 면 버림). 그 뒤 Enter = 전송(working). */
class FakeCli {
  constructor({ echoMs, composer, dropEarly = true, dropFirstLateEnter = false }) { Object.assign(this, { echoMs, composer, dropEarly, dropFirstLateEnter }); this.pid = 42000 + FakeCli.n++; this.writes = []; this.landed = false; this.submitted = false; this.lateEnters = 0; }
  onData(cb) { this.emit = cb; }
  onExit() {}
  resize() {} kill() {}
  write(d) {
    const t = Date.now(); this.writes.push({ t, d });
    if (d.startsWith('\x1b[200~')) { this.pastedAt = t; setTimeout(() => { this.landed = true; this.landedAt = Date.now(); this.emit(`\x1b[2J\x1b[H${this.composer}`); }, this.echoMs); return; }
    if (d === '\r') {
      if (!this.landed) { this.earlyEnters = (this.earlyEnters || 0) + (this.dropEarly ? 1 : 0); if (this.dropEarly) return; }
      if (this.dropFirstLateEnter && this.lateEnters++ === 0) return; // 반응한 뒤인데도 한 번 빠지는 경우
      if (!this.submitted) { this.submitted = true; this.submittedAt = Date.now(); this.emit('\x1b[2J\x1b[H✻ Thinking… (esc to interrupt)\r\n\r\n❯ '); }
    }
  }
}
FakeCli.n = 1;
class TestSM extends SessionManager { spawn() { return this.next; } }

async function run(name, { text, cli }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-send-'));
  fs.writeFileSync(path.join(dir, 'sessions.json'), '[]', 'utf8');
  const logs = [];
  const sm = new TestSM(dir, { onLog: (m) => logs.push(m), codexHome: dir });
  sm.next = cli;
  const rec = sm.create({ cwd: process.cwd(), agent: 'claude', model: 'opus', effort: 'high', cols: 100, rows: 20 });
  cli.emit('\x1b[2J\x1b[H╭─ Claude Code ─╮\r\n\r\n❯ ');
  await sleep(1500); // 시작 출력이 잦아든 뒤(= 붙여넣기 전 출력은 오래전)
  sm.send(rec.id, text);
  await sleep(6500);
  const enters = cli.writes.filter(w => w.d === '\r');
  const out = { logs: logs.filter(l => /enter|send/.test(l)), enters: enters.map(w => w.t - cli.pastedAt), submitted: cli.submitted, landedAfter: cli.landedAt - cli.pastedAt, early: cli.earlyEnters || 0 };
  console.log(`  [${name}] Enter(ms after paste)=${out.enters.join(',')} · 화면 반응=${out.landedAfter}ms · 빠진 이른 Enter=${out.early} · 로그=${out.logs.map(l => l.replace(/^s\d+ /, '')).join(' | ')}`);
  try { sm.live.delete(rec.id); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

// 1) 이미지 경로 — 1초 동안 침묵한 뒤 글 + [Image #1]
const img = 'C:\\x\\state\\uploads\\2026-11-05T05-58-11-문제1.png';
const r1 = await run('이미지 경로', { text: `이 이미지 무슨 이미지야?\n\n[첨부 파일]\n${img}`, cli: new FakeCli({ echoMs: 1000, composer: '❯ [Image #1]이 이미지 무슨 이미지야?\r\n  [첨부 파일]' }) });
ok(r1.submitted, '1 이미지 경로: 요청이 실제로 전송됨');
ok(r1.enters.length >= 1 && r1.enters[0] >= r1.landedAfter, '1 첫 Enter 는 화면이 붙여넣기에 반응한 뒤(붙여넣기 전 출력만 보고 치지 않음)');
ok(r1.logs.some(l => /enter ok \(\d\) working/.test(l)) && !r1.logs.some(l => /enter ok \(\d\)$/.test(l)), '1 로그 = enter ok … working(거짓 성공 없음)');

// 2) 반응한 뒤 친 Enter 도 한 번 빠지는 경우 → 첫 줄 머리로 남은 요청을 보고 재시도
const r2 = await run('Enter 한 번 빠짐', { text: `그림 설명해 줘\n\n[첨부 파일]\n${img}`, cli: new FakeCli({ echoMs: 600, composer: '❯ [Image #1]그림 설명해 줘\r\n  [첨부 파일]', dropFirstLateEnter: true }) });
ok(r2.submitted && r2.logs.some(l => /enter retry 2/.test(l)), '2 빠진 Enter: 입력창에 남은 첫 줄 머리를 보고 재시도해 전송');
ok(!r2.logs.some(l => /enter ok \(1\)/.test(l)), '2 첫 Enter 를 성공으로 잘못 적지 않음(경로 꼬리가 화면에 없어도)');

// 3) 첨부만 있는 요청
const r3 = await run('첨부만', { text: `\n\n[첨부 파일]\n${img}`, cli: new FakeCli({ echoMs: 600, composer: '❯ [Image #1]\r\n  [첨부 파일]', dropFirstLateEnter: true }) });
ok(r3.submitted && r3.logs.some(l => /enter retry 2/.test(l)), '3 첨부만: 「[첨부 파일]」 로 남은 요청을 알아보고 재시도해 전송');

// 4) 보통 글 — 곧바로 반응
const r4 = await run('보통 글', { text: '안녕하세요. 오늘 할 일을 정리해 줘', cli: new FakeCli({ echoMs: 30, composer: '❯ 안녕하세요. 오늘 할 일을 정리해 줘' }) });
ok(r4.submitted && r4.enters.length === 1 && r4.logs.some(l => /enter ok \(1\) working/.test(l)), '4 보통 글: Enter 한 번에 전송');
ok(r4.enters[0] >= 300 && r4.enters[0] < 1000, `4 보통 글: 반응 뒤 조용해지면 바로(${r4.enters[0]}ms)`);

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
