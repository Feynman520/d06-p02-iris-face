// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 코덱스 옛 대화 재개 호환(v2.98) 무접촉 검사 — 임시 CODEX_HOME(가짜 config.toml·기록 파일·state_5.sqlite)만 쓴다.
//   1) config.toml 읽기: 최상위 model_provider + 그 provider 의 base_url, 없으면 openai
//   2) 이름이 다르고 지금 연결 = 이 PC 중계기 → 맞춤: 기록 첫 줄·DB 한 줄만 바뀜, 나머지 바이트 그대로, 원본 백업 = 원본과 같음, history.jsonl
//   3) 두 번째 부름은 아무것도 안 함
//   4) 지금 연결이 중계기가 아니면(기본 openai) 맞추지 않고 이유만(blocked) — 파일·DB 불변
//   5) DB 에 없는 대화(기록 파일만) → 파일만 맞춤
//   6) 화면 마지막 줄 → 원인 글(연결 이름 불일치는 한국어로 풀어 씀)
//   7) SessionManager: 코덱스 재개 때만 맞추기를 부르고, 곧바로 끝나면 exitReason 을 카드에 남기며, 다시 띄우면 지운다
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentProvider, alignThreadProvider, threadProvider, exitReasonFrom, isLocalRelay, BACKUP_DIR_NAME } from '../daemon/codexcompat.mjs';
import { SessionManager } from '../daemon/sessions.mjs';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

const RELAY_CFG = 'model_provider = "iris"\napproval_policy = "never"\n\n[model_providers.iris]\nname = "OpenAI"\nbase_url = "http://127.0.0.1:3456/backend-api/codex"\nwire_api = "responses"\nrequires_openai_auth = true\nsupports_websockets = false\n\n[mcp_servers.x]\ncommand = "y"\n';
const ID = '01a03c8d-5039-7fd0-b759-6a27c4ebef51';
const ID2 = '01a03c8d-0000-7fd0-b759-000000000002';

function makeHome({ cfg = RELAY_CFG, inDb = true, id = ID, provider = 'openai' } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-cxc-'));
  if (cfg != null) fs.writeFileSync(path.join(home, 'config.toml'), cfg, 'utf8');
  const day = path.join(home, 'sessions', '2026', '11', '02');
  fs.mkdirSync(day, { recursive: true });
  const rollout = path.join(day, `rollout-2026-11-02T10-00-00-${id}.jsonl`);
  const meta = { timestamp: '2026-11-02T01:00:00.000Z', type: 'session_meta', payload: { id, cwd: 'C:\\x', model_provider: provider, base_instructions: { text: '한글 지시 — 그대로' } } };
  const rest = '{"type":"response_item","payload":{"text":"안녕 \\u0007 그대로"}}\r\n{"type":"event_msg"}\n';
  fs.writeFileSync(rollout, JSON.stringify(meta) + '\n' + rest, 'utf8');
  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'));
  db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL, model_provider TEXT NOT NULL, title TEXT NOT NULL DEFAULT "")');
  if (inDb) db.prepare('INSERT INTO threads (id, rollout_path, model_provider) VALUES (?, ?, ?)').run(id, rollout, provider);
  db.close();
  return { home, rollout, rest };
}
const dbProvider = (home, id) => { const db = new DatabaseSync(path.join(home, 'state_5.sqlite'), { readOnly: true }); try { return db.prepare('SELECT model_provider FROM threads WHERE id = ?').get(id)?.model_provider ?? null; } finally { db.close(); } };
const firstMeta = (f) => JSON.parse(fs.readFileSync(f, 'utf8').split('\n')[0]);
const homes = [];

// 1) config.toml
{
  const h = makeHome(); homes.push(h.home);
  const c = currentProvider(h.home);
  ok(c.id === 'iris' && c.baseUrl === 'http://127.0.0.1:3456/backend-api/codex', 'config: iris + 중계기 base_url');
  ok(isLocalRelay(c.baseUrl) && !isLocalRelay('https://chatgpt.com/backend-api/codex') && !isLocalRelay(null), 'isLocalRelay: 127.0.0.1 만 참');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-cxc-')); homes.push(empty);
  ok(currentProvider(empty).id === 'openai' && currentProvider(empty).baseUrl === null, 'config 없음 → openai, base_url 없음');
  fs.writeFileSync(path.join(empty, 'config.toml'), '[model_providers.iris]\nbase_url = "http://127.0.0.1:3456/x"\n\n[profiles.p]\nmodel_provider = "iris"\n', 'utf8');
  ok(currentProvider(empty).id === 'openai', '표 안의 model_provider(profiles)는 최상위로 치지 않음');
}

// 2) 맞추기
{
  const h = makeHome(); homes.push(h.home);
  const before = fs.readFileSync(h.rollout);
  const logs = [];
  const r = alignThreadProvider({ codexHome: h.home, threadId: ID, faceVersion: '9.9.9', log: (m) => logs.push(m) });
  ok(r.action === 'aligned' && r.from === 'openai' && r.to === 'iris', `맞춤: openai → iris (${r.action})`);
  ok(firstMeta(h.rollout).payload.model_provider === 'iris', '기록 첫 줄 model_provider = iris');
  ok(firstMeta(h.rollout).payload.base_instructions.text === '한글 지시 — 그대로', '첫 줄의 다른 칸(한글) 그대로');
  const after = fs.readFileSync(h.rollout);
  ok(after.subarray(after.indexOf(0x0a) + 1).equals(Buffer.from(h.rest, 'utf8')), '둘째 줄부터 바이트 그대로(CRLF·이스케이프 포함)');
  ok(dbProvider(h.home, ID) === 'iris', '목록 DB 의 그 대화 = iris');
  ok(r.backup && fs.existsSync(r.backup) && fs.readFileSync(r.backup).equals(before), '백업 = 고치기 전 원본과 같음');
  ok(r.backup.startsWith(path.join(h.home, BACKUP_DIR_NAME)), '백업 자리 = CODEX_HOME\\iris-backup\\provider-align');
  const hist = fs.readFileSync(path.join(h.home, BACKUP_DIR_NAME, 'history.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  ok(hist.length === 1 && hist[0].from === 'openai' && hist[0].to === 'iris' && hist[0].thread === ID && hist[0].faceVersion === '9.9.9' && hist[0].dbChanged && hist[0].fileChanged, 'history.jsonl 한 줄(전후 값·판·백업)');
  ok(!/token|안녕/i.test(JSON.stringify(hist[0])), 'history 에 토큰·대화 내용 없음');
  ok(logs.some((l) => /openai → iris/.test(l)), '데몬 로그 한 줄');
  ok(!fs.readdirSync(path.dirname(h.rollout)).some((f) => f.endsWith('.iris-tmp')), '임시 파일 남지 않음');
  // 3) 두 번째
  const r2 = alignThreadProvider({ codexHome: h.home, threadId: ID });
  ok(r2.action === 'none', '두 번째 부름 = 아무것도 안 함');
  ok(fs.readFileSync(path.join(h.home, BACKUP_DIR_NAME, 'history.jsonl'), 'utf8').trim().split('\n').length === 1, '두 번째 부름은 기록을 더하지 않음');
}

// 4) 중계기가 아니면 맞추지 않음
{
  const h = makeHome({ cfg: '' }); homes.push(h.home);
  const before = fs.readFileSync(h.rollout);
  const h2 = makeHome({ cfg: '', provider: 'iris' }); homes.push(h2.home);
  const r = alignThreadProvider({ codexHome: h2.home, threadId: ID });
  ok(r.action === 'blocked' && /중계기/.test(r.reason) && /'iris' 연결로 만들어졌고/.test(r.reason), `지금 연결 openai(중계기 아님) → blocked + 이유 (${r.action})`);
  ok(dbProvider(h2.home, ID) === 'iris' && firstMeta(h2.rollout).payload.model_provider === 'iris', 'blocked 때 파일·DB 불변');
  ok(!fs.existsSync(path.join(h2.home, BACKUP_DIR_NAME)), 'blocked 때 백업 폴더도 만들지 않음');
  const same = alignThreadProvider({ codexHome: h.home, threadId: ID });
  ok(same.action === 'none' && fs.readFileSync(h.rollout).equals(before), '이름이 같으면(openai=openai) 아무것도 안 함');
}

// 5) DB 에 없는 대화
{
  const h = makeHome({ inDb: false, id: ID2 }); homes.push(h.home);
  const t = threadProvider(h.home, ID2);
  ok(t.provider === 'openai' && t.rollout === h.rollout && !t.inDb, 'DB 에 없으면 기록 파일을 찾아 읽음');
  const r = alignThreadProvider({ codexHome: h.home, threadId: ID2 });
  ok(r.action === 'aligned' && firstMeta(h.rollout).payload.model_provider === 'iris' && dbProvider(h.home, ID2) === null, 'DB 에 없는 대화 → 파일만 맞춤');
  const none = alignThreadProvider({ codexHome: h.home, threadId: '01a00000-0000-7000-8000-00000000dead' });
  ok(none.action === 'none', '기록이 아예 없는 대화 → 아무것도 안 함');
}

// 6) 원인 글
{
  const lines = ['', 'Error: thread/resume: thread/resume failed: This chat uses openai, but your current provider is iris. Switch to openai to continue. (code -32600)', '', ''];
  const t = exitReasonFrom(lines);
  ok(/'openai' 연결로 만들어졌고/.test(t) && /'iris' 연결/.test(t), `불일치 → 한국어 풀이 (${t.slice(0, 40)}…)`);
  ok(exitReasonFrom(['a', 'b', 'c']) === 'b · c', '오류 낱말이 없으면 마지막 두 줄');
  ok(exitReasonFrom(['', '  ']) === null, '빈 화면 → null');
  ok(exitReasonFrom(['x'.repeat(900) + ' error']).length <= 400, '400자로 자름');
}

// 7) SessionManager 결선(가짜 pty·가짜 맞추기 — 실제 CLI·기록 접촉 0)
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-cxc-sm-')); homes.push(dir);
  const cwd = process.cwd();
  fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify([
    { id: 's1', cwd, agent: 'codex', model: 'terra', effort: 'medium', status: 'exited', pid: 999999, sessionId: ID, title: '옛 코덱스' },
    { id: 's2', cwd, agent: 'claude', model: 'fable', effort: 'high', status: 'exited', pid: 999999, sessionId: '22222222-2222-4222-8222-222222222222', title: '클로드' },
  ]), 'utf8');
  class FakePty {
    constructor(cols, rows) { this.pid = 41000 + FakePty.n++; this.cols = cols; this.rows = rows; this.d = []; this.e = []; FakePty.last = this; }
    onData(f) { this.d.push(f); } onExit(f) { this.e.push(f); } write() {} resize() {} kill() {}
    emit(data) { this.d.forEach((f) => f(data)); } exit(code) { this.e.forEach((f) => f({ exitCode: code })); }
  }
  FakePty.n = 1;
  class TestSM extends SessionManager { spawn(cmd, c, cols, rows) { return new FakePty(cols, rows); } }
  const calls = [];
  const sm = new TestSM(dir, { codexHome: dir, alignCodex: (a) => { calls.push(a); return { action: 'blocked', from: 'openai', to: 'iris', reason: '미리 본 이유' }; } });
  sm.resume('s2');
  ok(calls.length === 0, '클로드 재개는 맞추기를 부르지 않음');
  sm.resume('s1');
  ok(calls.length === 1 && calls[0].threadId === ID && calls[0].codexHome === dir, '코덱스 재개 = 맞추기 1회(그 대화 id, 주어진 CODEX_HOME)');
  ok(sm.get('s1').compat?.action === 'blocked', '카드에 compat 기록');
  FakePty.last.emit('Error: thread/resume failed: This chat uses openai, but your current provider is iris.\r\n');
  await new Promise((r) => setTimeout(r, 30));
  FakePty.last.exit(1);
  const rec = sm.get('s1');
  ok(rec.status === 'exited' && /미리 본 이유/.test(rec.exitReason || '') && /'openai' 연결로 만들어졌고/.test(rec.exitReason || ''), `곧바로 끝남 → exitReason 에 미리 본 이유 + 화면 원인`);
  sm.resume('s1');
  ok(sm.get('s1').exitReason === null, '다시 띄우면 exitReason 지움');
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8')).find((r) => r.id === 's1');
  ok('compat' in saved, 'sessions.json 에 compat 저장');
  sm.close?.('s1'); sm.close?.('s2');
}

for (const h of homes) { try { fs.rmSync(h, { recursive: true, force: true }); } catch {} }
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
