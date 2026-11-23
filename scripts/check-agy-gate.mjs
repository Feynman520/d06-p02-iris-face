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
ok(JSON.stringify(gate.judge(NEW([C('a'), G('g1')])).accounts) === JSON.stringify([{ name: 'g1', status: 'active', disabled: false }]), 'judge: 판정에는 구글 계정만 담긴다');

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
ok(/setInterval\(\(\) => \{ agyGate\.refresh\(\)\.catch\(\(\) => \{\}\); \}, 15_000\)/.test(srv) && /agyConnection === 'gate'/.test(srv), '데몬: gate 일 때 15초마다 중계기 판정을 미리 읽음');

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
delete process.env.IRIS_AGY_EXE;

fake.close();
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
