// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 모델 표(daemon/agents.mjs) 무접촉 검사 — 2026-09-23 새 모델(Claude Opus 5.5 · Codex GPT-6 Sol/Luna) 반영.
//   1) 클로드: `opus` 별칭은 CLI 2.1.280부터 Opus 5.5 → 표시 이름 "Opus 5.5", 이전 판은 전체 ID `claude-opus-5`로 따로 고른다
//      2026-09-29: `sonnet` 별칭은 CLI 2.1.284부터 Sonnet 5.5 → 표시 이름 "Sonnet 5.5", 이전 판은 `claude-sonnet-5`
//      2026-10-27: `haiku` 별칭은 CLI 2.1.311부터 Haiku 5.5 → 표시 이름 "Haiku 5.5", 컨텍스트 창 추정도 1M(Haiku 4.x 만 200k)
//   2) 코덱스: gpt-6.1-sol(기본) · gpt-6-astra · gpt-6.1-terra · gpt-6-sol(이전) · gpt-6-luna 순(코덱스 0.164.0 우선순위),
//      5.6 계열은 "(구)" 표시로 남긴다(저장된 선택 호환)
//   3) normalize(): 기본값·모르는 모델·그 모델이 못 쓰는 사고깊이의 한 단계 아래 조정(luna: ultra → max; sol·astra 는 ultra 지원)
//   4) buildCommand(): fast 설정은 opus·claude-opus-5 둘 다, 코덱스는 service_tier=fast
//   5) 화면 기본값(app/main.js)·제목 생성 모델(daemon/titler.mjs)이 표와 어긋나지 않는다
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.IRIS_FACE_STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-models-'));
const { AGENTS, normalize, buildCommand, isFastModel } = await import('../daemon/agents.mjs');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = (a) => AGENTS[a].models.map(m => m.id);
const label = (a, id) => AGENTS[a].models.find(m => m.id === id)?.label;

// 1) 클로드 표
ok(label('claude', 'opus') === 'Opus 5.5', 'claude: opus 별칭 표시 = Opus 5.5');
ok(label('claude', 'claude-opus-5') === 'Opus 5 (이전)', 'claude: 이전 Opus 5 는 전체 ID 항목');
ok(['sonnet', 'fable', 'haiku'].every(id => ids('claude').includes(id)), 'claude: sonnet·fable·haiku 유지');
ok(label('claude', 'sonnet') === 'Sonnet 5.5', 'claude: sonnet 별칭 표시 = Sonnet 5.5(CLI 2.1.284)');
ok(label('claude', 'claude-sonnet-5') === 'Sonnet 5 (이전)' && ids('claude').indexOf('claude-sonnet-5') === ids('claude').indexOf('sonnet') + 1, 'claude: 이전 Sonnet 5 는 전체 ID 항목(sonnet 바로 뒤)');
ok(label('claude', 'haiku') === 'Haiku 5.5', 'claude: haiku 별칭 표시 = Haiku 5.5(CLI 2.1.311)');
ok(ids('claude')[0] === 'opus' && AGENTS.claude.default.model === 'opus' && AGENTS.claude.default.effort === 'high', 'claude: 기본 opus·high 유지');

// 2) 코덱스 표
ok(ids('codex').slice(0, 5).join(',') === 'gpt-6.1-sol,gpt-6-astra,gpt-6.1-terra,gpt-6-sol,gpt-6-luna', 'codex: 코덱스 우선순위 순(6.1-sol·astra·6.1-terra·6-sol·luna)');
ok(label('codex', 'gpt-6-sol') === 'gpt-6-sol (이전)' && label('codex', 'gpt-6.1-sol') === 'gpt-6.1-sol', 'codex: gpt-6-sol 은 "(이전)" 표시');
ok(['gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6-luna'].every(id => ids('codex').includes(id) && /\(구\)/.test(label('codex', id))), 'codex: 5.6 계열은 "(구)" 표시로 남김');
ok(!ids('codex').includes('gpt-5.5'), 'codex: gpt-5.5(10/14 은퇴) 없음');
ok(AGENTS.codex.default.model === 'gpt-6.1-sol' && AGENTS.codex.default.effort === 'medium', 'codex: 기본 gpt-6.1-sol·medium');
const cm = (id) => AGENTS.codex.models.find(m => m.id === id);
ok(['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-sol', 'gpt-6-astra'].every(id => !cm(id).efforts) && cm('gpt-6-luna').efforts?.join() === 'low,medium,high,xhigh,max', 'codex: 6.1-sol·6.1-terra·6-sol·astra 는 ultra 까지, gpt-6-luna 는 max 까지(0.164.0 메타데이터 실측)');

// 3) normalize
let n = normalize({ agent: 'codex' });
ok(n.model === 'gpt-6.1-sol' && n.effort === 'medium', 'normalize: 코덱스 빈 선택 → gpt-6.1-sol·medium');
n = normalize({ agent: 'codex', model: 'gpt-5.5', effort: 'high' });
ok(n.model === 'gpt-6.1-sol', 'normalize: 모르는 모델(gpt-5.5) → 기본 gpt-6.1-sol');
n = normalize({ agent: 'codex', model: 'gpt-6-sol', effort: 'high' });
ok(n.model === 'gpt-6-sol' && n.modelLabel === 'gpt-6-sol (이전)', 'normalize: 저장된 옛 선택(gpt-6-sol) 그대로 유효');
n = normalize({ agent: 'codex', model: 'gpt-6.1-terra', effort: 'ultra' });
ok(n.model === 'gpt-6.1-terra' && n.effort === 'ultra', 'normalize: gpt-6.1-terra 는 ultra 그대로');
n = normalize({ agent: 'codex', model: 'gpt-6-luna', effort: 'ultra' });
ok(n.effort === 'max', 'normalize: gpt-6-luna 에 ultra → max 로 한 단계 조정');
n = normalize({ agent: 'codex', model: 'gpt-6-sol', effort: 'ultra' });
ok(n.effort === 'ultra', 'normalize: gpt-6-sol 은 ultra 그대로');
n = normalize({ agent: 'codex', model: 'gpt-6-astra', effort: 'ultra' });
ok(n.effort === 'ultra', 'normalize: gpt-6-astra 는 ultra 그대로');
n = normalize({ agent: 'codex', model: 'gpt-5.6-terra', effort: 'medium' });
ok(n.model === 'gpt-5.6-terra' && n.modelLabel === 'gpt-5.6-terra (구)', 'normalize: 저장된 옛 선택(terra) 그대로 유효');
n = normalize({ agent: 'claude', model: 'claude-opus-5', effort: 'high' });
ok(n.model === 'claude-opus-5' && n.modelLabel === 'Opus 5 (이전)', 'normalize: claude-opus-5 선택 유지·표시');
n = normalize({ agent: 'claude', model: 'opus', effort: 'high' });
ok(n.modelLabel === 'Opus 5.5', 'normalize: opus → 표시 Opus 5.5');
n = normalize({ agent: 'claude', model: 'claude-sonnet-5', effort: 'max' });
ok(n.model === 'claude-sonnet-5' && n.effort === 'max' && n.modelLabel === 'Sonnet 5 (이전)', 'normalize: claude-sonnet-5 선택 유지·표시');

// 4) buildCommand
const cwd = process.cwd();
const has = (cmd, s) => cmd.args.includes(s);
ok(has(buildCommand({ agent: 'claude', model: 'opus', effort: 'high' }, cwd), '--settings'), 'buildCommand: opus 에 fast 설정');
ok(has(buildCommand({ agent: 'claude', model: 'claude-opus-5', effort: 'high' }, cwd), '--settings'), 'buildCommand: claude-opus-5 에도 fast 설정');
ok(!has(buildCommand({ agent: 'claude', model: 'sonnet', effort: 'low' }, cwd), '--settings'), 'buildCommand: sonnet 은 fast 설정 없음');
ok(!has(buildCommand({ agent: 'claude', model: 'claude-sonnet-5', effort: 'low' }, cwd), '--settings'), 'buildCommand: claude-sonnet-5 도 fast 설정 없음');
ok(isFastModel('claude', 'claude-opus-5') && isFastModel('claude', 'opus') && !isFastModel('claude', 'fable') && !isFastModel('claude', 'sonnet'), 'isFastModel: opus·claude-opus-5 만(Sonnet 5.5 는 CLI 카탈로그에 fast_mode 없음)');
const cx = buildCommand({ agent: 'codex', model: 'gpt-6-luna', effort: 'low' }, cwd);
ok(/^codex -m gpt-6-luna -c model_reasoning_effort=low -c service_tier=fast /.test(cx.cmdline), 'buildCommand: codex -m gpt-6-luna … service_tier=fast');
ok(fs.existsSync(path.join(process.env.IRIS_FACE_STATE, 'fast-mode.json')), 'fast-mode.json 은 IRIS_FACE_STATE 에만 생김(실 state 무접촉)');

// 5) 화면·제목 생성기 기본값
const mainJs = fs.readFileSync(path.join(ROOT, 'app', 'main.js'), 'utf8');
ok(/codex:\s*'gpt-6\.1-sol'/.test(mainJs) && !/gpt-5\.6-terra/.test(mainJs), 'app/main.js: 저장값 없을 때 코덱스 기본 gpt-6.1-sol');
const { TranscriptTail } = await import('../daemon/transcript.mjs');
const win = (model) => Object.assign(Object.create(TranscriptTail.prototype), { agent: 'claude', model, window: null }).contextWindow();
ok(win('claude-haiku-5-5') === 1000000 && win('claude-haiku-4-5-20251001') === 200000 && win('claude-opus-5-5') === 1000000, 'transcript: 컨텍스트 창 = Haiku 5.5·Opus 1M, Haiku 4.5 200k');
const titler = fs.readFileSync(path.join(ROOT, 'daemon', 'titler.mjs'), 'utf8');
ok(/CODEX_TITLE_MODEL = 'gpt-6-luna'/.test(titler), 'daemon/titler.mjs: 제목 생성 = gpt-6-luna');

fs.rmSync(process.env.IRIS_FACE_STATE, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
