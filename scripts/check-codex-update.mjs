#!/usr/bin/env node
// 코덱스 시작 시 업데이트 물음 회귀 검사(2026-11-09).
// 코덱스 0.165 의 물음은 안내줄이 "enter continue · esc skip" 이고 커서 줄이 `› 1. Update now` 다.
// 예전 판정은 이 화면을 '대기'로 읽어 첫 요청문과 Enter 를 보냈고, Enter 가 「1. Update now」를 골라
// 코덱스가 npm 으로 스스로 업데이트한 뒤 끝났다(세션 소실). 기대: 물음에 2(Skip)+Enter 로 먼저 답하고,
// 물음이 걷힌 뒤에야 첫 요청문을 붙여넣는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionManager } from '../daemon/sessions.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MENU = '\x1b[2J\x1b[H'
  + '  ✨ Update available! 0.165.0 -> 0.167.0\r\n\r\n'
  + '  Release notes: https://github.com/openai/codex/releases/latest\r\n\r\n'
  + '› 1. Update now (runs `npm install -g @openai/codex`)\r\n'
  + '  2. Skip\r\n'
  + '  3. Skip until next version\r\n\r\n'
  + '  enter continue · esc skip\r\n';
const READY = '\x1b[2J\x1b[H>_ OpenAI Codex (v0.165.0)\r\n\r\n› Ask Codex to do anything\r\n\r\n  gpt-6-luna medium · /tmp\r\n';

class FakeCodex {
  constructor() { this.pid = 43001; this.writes = []; this.menu = true; }
  onData(cb) { this.emit = cb; setTimeout(() => this.emit(MENU), 50); }
  onExit() {}
  resize() {} kill() {}
  write(d) {
    this.writes.push({ d, menu: this.menu });
    if (!this.menu) return;
    if (d.startsWith('\x1b[200~') || (d === '\r' && !this.writes.some(w => w.d === '2'))) { this.updated = true; return; } // 물음 위 Enter = 1. Update now
    if (d === '\r') { this.menu = false; setTimeout(() => this.emit(READY), 100); }
  }
}
class TestSM extends SessionManager { spawn() { return this.next; } }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-codexupd-'));
fs.writeFileSync(path.join(dir, 'sessions.json'), '[]', 'utf8');
const logs = [];
const sm = new TestSM(dir, { onLog: (m) => logs.push(m), codexHome: dir });
const cli = new FakeCodex(); sm.next = cli;
sm.nameSession = () => {}; // 제목 생성(실제 코덱스 호출)은 이 검사와 무관
const rec = sm.create({ cwd: process.cwd(), agent: 'codex', model: 'gpt-6-luna', effort: 'medium', prompt: '엑셀 상태 알려줘', cols: 100, rows: 20 });
for (let i = 0; i < 60 && !cli.writes.some(w => w.d.startsWith('\x1b[200~') || w.d.includes('엑셀')); i++) await sleep(250);

const firstPaste = cli.writes.findIndex(w => w.d.startsWith('\x1b[200~') || w.d.includes('엑셀'));
const skip = cli.writes.findIndex(w => w.d === '2');
ok(skip >= 0, '1 업데이트 물음에 2(Skip)로 답함');
ok(!cli.updated, '2 물음 위에서 Enter·붙여넣기를 보내 「Update now」를 고르지 않음');
ok(firstPaste > skip && cli.writes[firstPaste] && !cli.writes[firstPaste].menu, '3 첫 요청문은 물음이 걷힌 뒤에 들어감');
ok(logs.some(l => /codex update prompt → 2/.test(l)), '4 로그 = codex update prompt → 2(Skip)');
try { sm.close(rec.id); } catch {}
try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
