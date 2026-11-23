// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// verify:agy-gate — 안티그래비티 중계기 길(연결 방식 gate) 검사(2026-11-23, D09 안티그래비티-입점설계 4절 '중계 방식 설계').
// 지키는 것: 중계기를 못 쓰면(옛 판 · 꺼짐 · 구글 계정 없음 · 멈춤) agy 를 이 PC 로그인으로 띄우지 않는다 · 쓸 수 있을 때만 CLOUD_CODE_URL 을 넣는다.
// 실제 중계기(3456) · 실제 agy · 진짜 ~/.gemini 를 쓰지 않는다 — 가짜 중계기(이 시험이 띄운 127.0.0.1 서버)와 임시 폴더만.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-agy-gate-'));
fs.mkdirSync(path.join(TMP, 'emptyroot'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'work'), { recursive: true });
// 가짜 중계기: 응답 내용을 시험마다 바꾼다
let reply = { code: 200, body: null };
const fake = http.createServer((req, res) => { res.writeHead(reply.code, { 'content-type': 'application/json' }); res.end(reply.body == null ? '' : JSON.stringify(reply.body)); });
fake.listen(0, '127.0.0.1'); await once(fake, 'listening');
const GATE = `http://127.0.0.1:${fake.address().port}`;
Object.assign(process.env, {
  IRIS_ROOT: path.join(TMP, 'emptyroot'), IRIS_GEMINI_DIR: path.join(TMP, 'gemini'), IRIS_FACE_STATE: path.join(TMP, 'state'),
  IRIS_AGY_STATUS_FILE: path.join(TMP, 'agy-status.json'), LOCALAPPDATA: path.join(TMP, 'la'), IRIS_AGY_GATE_URL: GATE,
});
delete process.env.IRIS_AGY_EXE;
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`); } };

const gate = await imp('daemon/agents/antigravity.gate.mjs');
const ad = await imp('daemon/agents/antigravity.mjs');
const st = await imp('daemon/agents/antigravity.status.mjs');

const NEW = (accounts, halt = null) => ({ google: { supported: true, halt }, accounts });
const G = (name, status = 'active', disabled = false) => ({ name, provider: 'google', status, disabled });
const C = (name) => ({ name, provider: 'anthropic', status: 'active' });

// 1. 판정(순수 함수)
ok(!gate.judge(null).ok, 'judge: 상태 없음 = 막음');
ok(!gate.judge({ accounts: [C('a'), G('google-1')] }).ok && /옛 판/.test(gate.judge({ accounts: [] }).why), 'judge: google.supported 없는 옛 중계기 = 막음(구글 계정이 보여도)');
ok(!gate.judge(NEW([C('a')])).ok && /등록된 구글 계정이 없/.test(gate.judge(NEW([C('a')])).why), 'judge: 구글 계정 0 = 막음');
ok(!gate.judge(NEW([G('g1', 'error'), G('g2', 'active', true)])).ok, 'judge: 구글 계정이 모두 오류 · 꺼짐 = 막음');
const h = gate.judge(NEW([G('g1')], { account: 'g1', at: 't' }));
ok(!h.ok && h.halt && /멈춰/.test(h.why), 'judge: 구글 멈춤 = 막음(계정이 살아 있어도)');
ok(gate.judge(NEW([C('a'), G('g1', 'throttled'), G('g2')])).ok, 'judge: 쓸 수 있는 구글 계정 1개 이상 = 통과(쉬는 중인 계정은 중계기가 알아서 넘긴다)');
ok(JSON.stringify(gate.judge(NEW([C('a'), G('g1')])).accounts) === JSON.stringify([{ name: 'g1', status: 'active', disabled: false, quota: null }]), 'judge: 판정에는 구글 계정만 담긴다(한도를 아직 못 읽은 계정은 quota = null)');

// 2. 길 입히기
gate._setLast({ ok: true, why: '', at: Date.now(), accounts: [] });
let env = { cloud_code_url: 'http://stale', PATH: 'p' };
ok(gate.applyRoute(env, 'gate').route === 'gate' && env.CLOUD_CODE_URL === GATE && !('cloud_code_url' in env) && env.PATH === 'p', 'applyRoute gate 통과: CLOUD_CODE_URL = 중계기, 남은 값(대소문자 무관)은 지움');
gate._setLast({ ok: false, why: '시험', at: Date.now(), accounts: [] });
env = { CLOUD_CODE_URL: 'http://stale' };
let threw = null; try { gate.applyRoute(env, 'gate'); } catch (e) { threw = e; }
ok(threw?.code === 'AGY_GATE_DOWN' && /몰래 돌리지 않습니다/.test(threw.message) && !('CLOUD_CODE_URL' in env), 'applyRoute gate 막힘: 던지고 · 남은 CLOUD_CODE_URL 도 지움(직결로 새지 않음)');
env = { CLOUD_CODE_URL: 'x' };
ok(gate.applyRoute(env, 'direct').route === 'direct' && !('CLOUD_CODE_URL' in env), 'applyRoute direct: CLOUD_CODE_URL 을 지운다');
gate._setLast(null);
threw = null; try { gate.applyRoute({}, 'gate'); } catch (e) { threw = e; }
ok(threw?.code === 'AGY_GATE_DOWN' && /아직 확인하지 못했습니다/.test(threw.message), 'applyRoute gate · 판정 모름(데몬이 막 켜짐) = 막음, 기다리지 않음');
gate._setLast({ ok: true, why: '', at: Date.now() - 61_000, accounts: [] });
threw = null; try { gate.applyRoute({}, 'gate'); } catch (e) { threw = e; }
ok(threw?.code === 'AGY_GATE_DOWN' && /1분 넘게/.test(threw.message), 'applyRoute gate · 1분 넘은 통과 판정 = 막음(옛 값으로 보내지 않음)');
ok(!/execFileSync|spawnSync|execSync/.test(fs.readFileSync(path.join(ROOT, 'daemon/agents/antigravity.gate.mjs'), 'utf8')), '판정 모듈에 동기 실행 없음(데몬을 멈추지 않음 — 코덱스 검토 F-1)');

// 3. 실제로 묻기(가짜 중계기)
reply = { code: 200, body: NEW([G('google-1')]) };
ok((await gate.refresh()).ok, 'refresh: 새 중계기 + 구글 계정 = 통과');
reply = { code: 200, body: { accounts: [G('google-1')] } };
ok(!(await gate.refresh()).ok, 'refresh: 옛 중계기 모양 = 막음');
reply = { code: 503, body: { error: 'x' } };
ok(!(await gate.refresh()).ok, 'refresh: 중계기 오류 응답 = 막음');
reply = { code: 200, body: NEW([G('google-1')]) };
// 꺼진 중계기(닫힌 포트) = 막음, 몇 초 안에
process.env.IRIS_AGY_GATE_URL = 'http://127.0.0.1:9';
const gate2 = await import(`${pathToFileURL(path.join(ROOT, 'daemon/agents/antigravity.gate.mjs')).href}?closed`);
const t0 = Date.now(); const cs = await gate2.refresh();
ok(!cs.ok && /닿지 않습니다/.test(cs.why) && Date.now() - t0 < 8000, 'refresh: 꺼진 중계기 = 막음(몇 초 안에)', `${Date.now() - t0}ms`);
process.env.IRIS_AGY_GATE_URL = GATE;
// 데몬이 15초마다 미리 읽는다(세션 시작 때 기다리지 않게)
const srv = fs.readFileSync(path.join(ROOT, 'daemon/server.mjs'), 'utf8');
ok(/agyGateFirst = agyGate\.refresh\(\)/.test(srv) && /agyGate\.current\(\)\?\.ok \? 15_000 : 5_000/.test(srv) && /AGENTS\.antigravity && agyConnection === 'gate'/.test(srv), '데몬: gate 일 때 시작 즉시 + 통과 15초 · 막힘 5초마다 중계기 판정을 미리 읽음');
ok(/const waitGate = ar\.enabled && agyConnection === 'gate' && sm\.lost\(\)\.some\(\(r\) => r\.agent === 'antigravity'\)/.test(srv)
  && /const ids = waitGate \? sm\.resumeLost\(\{ enabled: ar\.enabled, filter: \(r\) => r\.agent !== 'antigravity' \}\) : sm\.resumeLost\(\{ enabled: ar\.enabled \}\);/.test(srv)
  && /agyGateFirst\.then\(agyLost, agyLost\)/.test(srv), '데몬: 자동 재개 — 클로드 · 코덱스 카드는 곧바로(예전과 같음), 안티그래비티 카드만 첫 판정 뒤');
ok(/await agyGateReady\(body\.agent\);\s*const rec = sm\.create\(body\);/.test(srv) && /const toOtherAgent = sm\.checkSwitch\(id, b\.agent\);[\s\S]{0,200}const before = sm\.get\(id\);[^\n]*\n\s*await agyGateReady\(b\.agent \|\| before\.agent\);/.test(srv) && /await agyGateReady\(sm\.get\(id\)\?\.agent\); const rec = sm\.resume\(id,/.test(srv), '데몬: 새로 열기 · 바꾸기 · 재개 전에 (안티그래비티만) 판정이 낡았으면 그 자리에서 다시 묻는다');
// resumeLost(filter) — 실제로 돌려 본다(가짜 세션 관리자)
{
  const { SessionManager } = await imp('daemon/sessions.mjs');
  const smd = path.join(TMP, 'sm'); fs.mkdirSync(smd, { recursive: true });
  fs.writeFileSync(path.join(smd, 'sessions.json'), JSON.stringify([
    { id: 's1', agent: 'claude', status: 'busy', pid: 999999, sessionId: 'a', cwd: TMP },
    { id: 's2', agent: 'antigravity', status: 'busy', pid: 999998, sessionId: 'b', cwd: TMP },
    { id: 's3', agent: 'codex', status: 'busy', pid: 999997, sessionId: 'c', cwd: TMP },
  ]));
  const sm = new SessionManager(smd, {});
  const resumed = []; sm.resume = (id) => { resumed.push(id); return {}; };
  const all = sm.resumeLost({ enabled: true, gapMs: 0, note: '' });
  ok(JSON.stringify(all) === JSON.stringify(['s1', 's2', 's3']), 'resumeLost: filter 없으면 예전과 같이 전부', JSON.stringify(all));
  const some = sm.resumeLost({ enabled: true, gapMs: 0, note: '', filter: (r) => r.agent !== 'antigravity' });
  ok(JSON.stringify(some) === JSON.stringify(['s1', 's3']), 'resumeLost: filter 로 안티그래비티 카드만 뒤로', JSON.stringify(some));
  await new Promise((r) => setTimeout(r, 30));
}

// 4. 어댑터
ok(ad.connection === 'gate', '어댑터 연결 방식 = gate(되돌리기 = 이 한 줄)');
const work = path.join(TMP, 'work');
// 이 시험 환경에는 진짜 안전 다리가 없어 준비(prepare)가 늘 먼저 막힌다 — 그때도 길을 입히지 않는다(환경 그대로)
gate._setLast({ ok: true, why: '', at: Date.now(), accounts: [] });
env = {};
threw = null; try { ad.preTrust(work, env); } catch (e) { threw = e; }
ok(threw?.code === 'AGY_NOT_READY' && !('CLOUD_CODE_URL' in env), 'preTrust: 안전 준비가 먼저 · 막히면 길도 입히지 않음');
// 순서와 연결: 준비가 통과한 뒤에만 applyRoute(env, connection) — 소스로 본다(준비를 통과시키려면 진짜 다리가 필요해서)
const src = fs.readFileSync(path.join(ROOT, 'daemon/agents/antigravity.mjs'), 'utf8');
const body = src.slice(src.indexOf('export function preTrust(cwd, env)'), src.indexOf('export const readyCheck'));
ok(body.indexOf("e.code = 'AGY_NOT_READY'") > 0 && body.indexOf('applyRoute(env, connection)') > body.indexOf("e.code = 'AGY_NOT_READY'"), 'preTrust: 준비 검사 뒤에 applyRoute(env, connection)');
ok(/export const readyCheck = \(cwd\) => \{ preTrust\(cwd\); \};/.test(src), 'readyCheck = preTrust(cwd) — 바꾸기 · 재개 전에도 길 판정(지금 세션을 끄기 전에 멈춤)');
const sess = fs.readFileSync(path.join(ROOT, 'daemon/sessions.mjs'), 'utf8');
ok(/const t = ad\.preTrust\(cwd, env\);/.test(sess) && sess.indexOf('const t = ad.preTrust(cwd, env);') < sess.indexOf('return pty.spawn(cmd.file, cmd.args'), 'sessions.spawn: 띄우기 전에 그 환경으로 preTrust');

// 5. 한도 조회: 중계기를 못 쓰면 agy 를 띄우지 않고 state = gate
process.env.IRIS_AGY_EXE = process.execPath; // 띄우면 안 되는 자리(띄우면 출력을 못 읽어 unknown 이 된다)
reply = { code: 200, body: NEW([]) };
const s1 = await st.refresh({ force: true });
ok(s1.state === 'gate' && /구글 계정이 없/.test(s1.detail), '한도 조회(막힘): state = gate + 이유, agy 를 띄우지 않음', JSON.stringify(s1));
const b = st.brief();
ok(b.state === 'gate' && b.connection === 'gate' && b.detail === s1.detail, 'brief: 화면에 길 · 이유를 보낸다');
let file = null; try { file = JSON.parse(fs.readFileSync(process.env.IRIS_AGY_STATUS_FILE, 'utf8')); } catch {}
ok(file?.connection === 'gate' && file?.state === 'gate', '상태 파일: connection = gate');
const tbl = { models: [{ id: 'gemini-4-argon', efforts: ['high'], actuals: {} }], default: { model: 'gemini-4-argon', effort: 'high' } };
const before = JSON.stringify(tbl);
await st.refreshModels(tbl);
ok(JSON.stringify(tbl) === before, '모델 목록(막힘): 목록을 바꾸지 않는다(이 PC 로그인으로 묻지 않음)');
// 6. 한도는 중계기에서 읽는다(2026-11-23 밤 사용자 결정 — 클로드 · 코덱스와 같은 방식). agy 를 실제로 띄우는 것은
//    창을 켤 때 한 번 · 6시간마다 · 실행 파일이 바뀌었을 때 · 지난 확인이 실패했으면 10분 뒤뿐이다(전에는 6분마다 = 하루 약 240번).
{
  const R1 = Date.parse('2026-11-30T05:55:15Z'), R2 = Date.parse('2026-11-30T11:51:33Z');
  const Q = (used) => ({ unified7d: used, unified7dReset: R1, unified7dSeenAt: 1_795_434_424_602, googleBucketsSeenAt: 1_795_434_424_602,
    googleBuckets: [{ group: 'Gemini Models', id: '', window: 'weekly', remaining: 1 - used, resetAt: R1 }, { group: 'Claude and GPT models', id: '', window: 'weekly', remaining: 1, resetAt: R2 }] });
  const GQ = (name, used, status = 'active', disabled = false) => ({ ...G(name, status, disabled), quota: used == null ? {} : Q(used), displayName: 'someone@example.com' });
  const body2 = (accs, cur) => ({ ...NEW(accs), currentAccounts: { google: cur } });
  // 순수 함수: 중계기 상태 → 한도 묶음
  const q1 = gate.quotaOf(Q(0.25));
  ok(q1 && q1.buckets.length === 2 && q1.buckets[0].remaining === 0.75 && q1.buckets[0].reset === '2026-11-30T05:55:15.000Z' && q1.seenAt === 1_795_434_424_602, 'quotaOf: 구글이 준 묶음 그대로(남은 비율 · 다시 차는 때)');
  ok(gate.quotaOf({}) === null && gate.quotaOf(null) === null && gate.quotaOf({ googleBuckets: [{ group: 'x', remaining: 'many' }] }) === null, 'quotaOf: 아직 읽은 값이 없으면 null(지어내지 않는다)');
  const q2 = gate.quotaOf({ unified7d: 0.4, unified7dReset: R1 });
  ok(q2 && q2.buckets.length === 1 && Math.abs(q2.buckets[0].remaining - 0.6) < 1e-9 && q2.buckets[0].window === 'weekly', 'quotaOf: 묶음이 없고 주간 값만 있으면 주간 한 줄(남은 비율 = 1 − 쓴 비율)');
  const jj = gate.judge(body2([C('a'), GQ('google-1', 0.0844064), GQ('google-2', 0.0212544)], 'google-2'));
  ok(jj.ok && jj.current === 'google-2' && !JSON.stringify(jj).includes('example.com'), 'judge: 지금 먼저 쓰는 구글 계정을 함께 싣는다 · 이메일은 싣지 않는다');
  const gg = st.groupsFromGate(jj);
  ok(gg && gg.account === 'google-2' && gg.groups.map((g) => g.name).join('|') === 'Gemini Models|Claude and GPT models' && Math.abs(gg.groups[0].buckets[0].remaining - 0.9787456) < 1e-9, 'groupsFromGate: 중계기가 지금 먼저 쓰는 계정의 한도');
  ok(st.groupsFromGate(gate.judge(body2([GQ('google-1', null), GQ('google-2', 0.5)], 'google-1'))) === null, 'groupsFromGate: 지금 먼저 쓰는 계정의 한도를 아직 못 읽었으면 null — 다른 계정의 값을 대신 보이지 않는다(코덱스 검토 1)');
  ok(st.groupsFromGate(gate.judge(body2([GQ('google-1', 0.3, 'active', true), GQ('google-2', 0.5)], 'google-1'))).account === 'google-2' && st.groupsFromGate(gate.judge(body2([GQ('google-1', 0.3), GQ('google-2', 0.5)], null))).account === 'google-1', 'groupsFromGate: 지금 먼저 쓰는 계정이 꺼졌거나 정해지지 않았으면 쓸 수 있는 첫 계정');
  ok(st.groupsFromGate(gate.judge(body2([GQ('google-1', 0.9, 'error'), GQ('google-2', null)], 'google-1'))) === null, 'groupsFromGate: 쓸 수 있는 계정 가운데 읽은 값이 없으면 null(오류 난 계정의 값은 쓰지 않는다)');

  // 실제로 돌려 본다: 가짜 중계기 + 가짜 agy(띄운 횟수를 센다)
  const exe = path.join(TMP, 'fake-agy.exe'); fs.writeFileSync(exe, 'v1');
  process.env.IRIS_AGY_EXE = exe;
  const USAGE = (rem) => JSON.stringify({ status: 'SUCCESS', command: { data: { groups: [{ name: 'Gemini Models', buckets: [{ id: 'gemini-weekly', name: 'Weekly Limit Remaining', window: 'weekly', remaining_fraction: rem, reset_time: '2026-11-30T05:55:15Z' }] }] } } });
  let calls = [], answer = () => ({ code: 0, out: USAGE(0.9), err: '', error: null });
  st._setRunner(async (file, args, opt) => { calls.push({ args: args.join(' '), url: opt?.env?.CLOUD_CODE_URL || null }); return answer(args); });
  st._resetReal();
  reply = { code: 200, body: body2([C('a'), GQ('google-1', 0.0844064)], 'google-1') };
  const a1 = await st.refresh({ force: true });
  ok(calls.length === 1 && calls[0].args === '--print /usage --output-format json' && calls[0].url === GATE && a1.state === 'ok' && a1.source === 'agy' && a1.groups[0].buckets[0].remaining === 0.9, '창을 켠 뒤 첫 확인: agy 를 한 번 실제로 띄워 본다(중계기 길로)', JSON.stringify({ n: calls.length, a1 }));
  // 그 뒤 1분마다의 확인: agy 를 띄우지 않고 중계기 값만
  for (let i = 0; i < 8; i++) { st._ageReal(60_000); await st.refresh(); }
  const a2 = st.current();
  ok(calls.length === 1 && a2.state === 'ok' && a2.source === 'gate' && a2.account === 'google-1' && Math.abs(a2.groups[0].buckets[0].remaining - 0.9155936) < 1e-9, `그 뒤 8분 동안 agy 를 띄우지 않음 · 한도 = 중계기가 읽어 둔 값(띄운 횟수 ${calls.length})`, JSON.stringify(a2));
  const hl = st.headline(a2);
  ok(hl && hl.window === 'weekly' && Math.abs(hl.remaining - 0.9155936) < 1e-9 && hl.reset === '2026-11-30T05:55:15.000Z' && st.brief().state === 'ok', '헤더 배터리 값(headline) = 중계기 값 그대로');
  // 중계기의 값이 바뀌면 다음 확인에 따라온다(1분 안)
  reply = { code: 200, body: body2([C('a'), GQ('google-1', 0.2)], 'google-1') };
  st._ageReal(60_000); await st.refresh();
  ok(calls.length === 1 && Math.abs(st.current().groups[0].buckets[0].remaining - 0.8) < 1e-9, '중계기의 한도가 바뀌면 다음 확인(1분)에 따라옴 — agy 는 띄우지 않음');
  let file2 = null; try { file2 = JSON.parse(fs.readFileSync(process.env.IRIS_AGY_STATUS_FILE, 'utf8')); } catch {}
  ok(file2?.state === 'ok' && file2?.source === 'gate' && file2?.account === 'google-1' && !JSON.stringify(file2).includes('example.com'), '상태 파일: 값의 출처(gate) · 계정 이름(이메일 아님)');
  // 중계기가 한도를 아직 못 읽었으면(막 켜짐) 지난 묶음을 그대로 둔다 — 빈 값으로 바꾸지 않는다
  reply = { code: 200, body: body2([C('a'), GQ('google-1', null)], 'google-1') };
  st._ageReal(60_000); await st.refresh();
  ok(st.current().state === 'ok' && st.current().groups.length === 2 && st.current().account === 'google-1' && calls.length === 1, '중계기가 그 계정의 한도를 아직 못 읽었으면 같은 계정의 지난 값을 그대로 둠');
  // 계정이 바뀌었는데 새 계정의 한도를 아직 못 읽었으면: 지난 계정의 값을 버린다(코덱스 검토 2)
  reply = { code: 200, body: body2([C('a'), GQ('google-1', 0.2, 'active', true), GQ('google-2', null)], 'google-1') };
  st._ageReal(60_000); await st.refresh();
  ok(st.current().state === 'ok' && st.current().groups.length === 0 && st.current().account === 'google-2' && st.headline(st.current()) === null && st.brief().account === 'google-2', '쓰던 계정이 꺼지고 새 계정의 한도를 아직 못 읽었으면 지난 값을 버림(헤더 = 모름) · 화면에 지금 계정 이름을 보냄', JSON.stringify(st.current()));
  reply = { code: 200, body: body2([C('a'), GQ('google-1', 0.2, 'active', true), GQ('google-2', 0.6)], 'google-1') };
  st._ageReal(60_000); await st.refresh();
  ok(st.current().account === 'google-2' && Math.abs(st.current().groups[0].buckets[0].remaining - 0.4) < 1e-9, '새 계정의 한도를 읽으면 그 값으로');
  // 지금 먼저 쓰는 계정은 못 읽었고 다른 계정만 읽었으면: 다른 계정의 값을 보이지 않는다
  reply = { code: 200, body: body2([C('a'), GQ('google-1', null), GQ('google-2', 0.6)], 'google-1') };
  st._ageReal(60_000); await st.refresh();
  ok(st.current().account === 'google-1' && st.current().groups.length === 0, '지금 먼저 쓰는 계정의 한도를 못 읽었으면 다른 계정의 값을 대신 보이지 않음(헤더 = 모름)');
  reply = { code: 200, body: body2([C('a'), GQ('google-1', 0.2)], 'google-1') };
  // 6시간이 지나면 한 번 다시 띄워 본다
  st._ageReal(6 * 3600_000 + 1000); await st.refresh();
  ok(calls.length === 2 && st.current().source === 'agy', '6시간이 지나면 agy 를 한 번 다시 띄워 봄');
  st._ageReal(60_000); await st.refresh();
  ok(calls.length === 2 && st.current().source === 'gate', '그 다음 확인은 다시 중계기 값');
  // agy 실행 파일이 바뀌면(스스로 업데이트) 곧바로 한 번 띄워 본다
  fs.writeFileSync(exe, 'v2-updated');
  st._ageReal(60_000); await st.refresh();
  ok(calls.length === 3, 'agy 실행 파일이 바뀌면(업데이트) 다음 확인에 한 번 띄워 봄');
  // 실제 확인이 실패하면: 중계기 값이 있어도 로그인됨으로 보이지 않고, 10분 뒤 다시 본다
  answer = () => ({ code: 1, out: '', err: 'Please sign in to continue', error: null });
  fs.writeFileSync(exe, 'v3-broken');
  st._ageReal(60_000); await st.refresh();
  ok(calls.length === 4 && st.current().state === 'auth' && st.headline(st.current()) === null, '실제 확인이 실패하면 그 결과(auth)를 보임 — 중계기 값으로 덮지 않음');
  for (let i = 0; i < 5; i++) { st._ageReal(60_000); await st.refresh(); }
  ok(calls.length === 4 && st.current().state === 'auth', '실패한 뒤 10분이 안 됐으면 다시 띄우지 않고 실패를 그대로 보임(5분째)');
  st._ageReal(6 * 60_000); answer = () => ({ code: 0, out: USAGE(0.7), err: '', error: null }); await st.refresh();
  ok(calls.length === 5 && st.current().state === 'ok', '10분이 지나면 다시 띄워 보고, 되면 돌아옴');
  // 중계기를 못 쓰게 되면: agy 를 띄우지 않고 state = gate
  reply = { code: 200, body: NEW([]) };
  st._ageReal(60_000); await st.refresh();
  ok(calls.length === 5 && st.current().state === 'gate', '중계기를 못 쓰게 되면 agy 를 띄우지 않고 state = gate');
  // 하루치: 1분마다 24시간(1,440번)을 돌려도 agy 를 띄우는 것은 4~5번뿐
  reply = { code: 200, body: body2([C('a'), GQ('google-1', 0.2)], 'google-1') };
  st._resetReal(); calls = [];
  for (let i = 0; i < 1440; i++) { st._ageReal(60_000); await st.refresh(); }
  ok(calls.length >= 4 && calls.length <= 5, `1분마다 하루(1,440번) 확인해도 agy 를 띄운 것은 ${calls.length}번(전에는 약 240번)`);
  st._setRunner(null);
}
delete process.env.IRIS_AGY_EXE;

// 끝내기: 열린 연결을 먼저 닫고 잠깐 뒤에 나간다 — 연결이 닫히는 중에 바로 process.exit 하면 윈도우의 Node 가
// "UV_HANDLE_CLOSING" 내부 오류로 죽는다(2026-11-23 전체 검사에서 한 번 실측).
fake.closeAllConnections?.();
fake.close();
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
console.log(`${pass} PASS / ${fail} FAIL`);
process.exitCode = fail ? 1 : 0;
setTimeout(() => process.exit(fail ? 1 : 0), 300);
