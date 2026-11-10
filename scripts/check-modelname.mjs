// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// verify:modelname — 🔴 모델 선택 이름 = 실제 모델(v2.102, 2026-11-10 사용자 지정) 영구 시험.
// (verify:models 는 손 표 = 실행 파일을 못 읽었을 때의 뼈대를 본다. 이 검사는 그 PC CLI 에서 읽은 실제 목록을 본다.)
// 가짜 CLI 실행 파일(2.1.272 꼴 · 2.1.321 꼴)과 가짜 심 사슬·코덱스 목록으로 확인한다. 실제 CLI·데몬 접촉 0
// (이 PC 에 실제 claude 가 있으면 마지막 절에서 읽기만 해 본다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../daemon/models.mjs';
import {
  scanClaudeBinary, claudeModelsFrom, claudeFallback, resolveClaudeBinary, nextFromCmd,
  readCodexCache, codexModelsFrom, ModelCatalog, modelMatches, versionOf,
} from '../daemon/models.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-models-'));
process.env.IRIS_FACE_STATE = path.join(tmp, 'state'); // agents.mjs 의 fast-mode.json 을 실 state 가 아닌 곳에(무접촉)

// ---- 가짜 실행 파일: 실제 CLI 안의 글자 모양 그대로(11/10 실측) + 경계 시험용 잡음 ----
const table = (ids) => ids.map(([id, fam, name]) => `{id:"${id}",family:"${fam}",display_name:"${name}",knowledge_cutoff:"x"}`).join(',');
const OLD = [ // 2.1.272 꼴
  ['claude-opus-4-8', 'opus', 'Opus 4.8'], ['claude-opus-5', 'opus', 'Opus 5'], ['claude-sonnet-5', 'sonnet', 'Sonnet 5'],
  ['claude-fable-5', 'fable', 'Fable 5'], ['claude-fable-5-1', 'fable', 'Fable 5.1'], ['claude-haiku-4-5', 'haiku', 'Haiku 4.5'],
];
const NEW = [...OLD, ['claude-opus-5-5', 'opus', 'Opus 5.5'], ['claude-sonnet-5-5', 'sonnet', 'Sonnet 5.5'], ['claude-fable-5-2', 'fable', 'Fable 5.2'], ['claude-haiku-5-5', 'haiku', 'Haiku 5.5']];
function fakeBin(file, ids, alias, { pad = 0 } = {}) {
  const head = Buffer.from('MZ' + 'x'.repeat(pad));
  const body = Buffer.from(`var a={${Object.entries(alias).map(([k, v]) => `${k}:"${v}"`).join(',')}};var t=[${table(ids)}];`, 'latin1');
  fs.writeFileSync(file, Buffer.concat([head, body, Buffer.from('tail')]));
  return file;
}
const oldBin = fakeBin(path.join(tmp, 'old.exe'), OLD, { opus: 'claude-opus-5', sonnet: 'claude-sonnet-5', fable: 'claude-fable-5-1', haiku: 'claude-haiku-4-5' });
const newBin = fakeBin(path.join(tmp, 'new.exe'), NEW, { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', fable: 'claude-fable-5-2', haiku: 'claude-haiku-5-5' });

// 1. 읽기
const so = scanClaudeBinary(oldBin), sn = scanClaudeBinary(newBin);
ok(so.alias.opus === 'claude-opus-5' && so.alias.fable === 'claude-fable-5-1' && so.alias.haiku === 'claude-haiku-4-5', '2.1.272 꼴: 별칭이 옛 모델로 읽힘');
ok(sn.alias.opus === 'claude-opus-5-5' && sn.alias.fable === 'claude-fable-5-2', '2.1.321 꼴: 별칭이 새 모델로 읽힘');
// 조각 경계에 걸친 표도 읽힘(작은 조각으로 강제)
const edge = scanClaudeBinary(newBin, { chunk: 37, overlap: 200 });
ok(edge.alias.fable === 'claude-fable-5-2' && edge.names['claude-fable-5-2']?.name === 'Fable 5.2', '조각 경계에 걸쳐도 같은 결과');

// 2. 🔴 핵심 불변식: 모든 줄의 이름 = 실제(넘기는) 모델의 이름
function invariant(scan, list, tag) {
  const bad = list.filter((m) => !m.actual || m.label.replace(/ \(이전\)$/, '') !== scan.names[m.actual]?.name);
  ok(list.length > 0 && bad.length === 0, `${tag}: 모든 줄 이름 = 실제 모델 이름 (${list.map((m) => `${m.label}→${m.actual}`).join(', ')})`);
}
const lo = claudeModelsFrom(so), ln = claudeModelsFrom(sn);
invariant(so, lo, '2.1.272 꼴'); invariant(sn, ln, '2.1.321 꼴');
ok(lo.find((m) => m.id === 'opus').label === 'Opus 5' && lo.find((m) => m.id === 'haiku').label === 'Haiku 4.5', '옛 CLI 에서 opus·haiku 를 5.5 라고 부르지 않음');
ok(ln.find((m) => m.id === 'fable').label === 'Fable 5.2' && ln.some((m) => m.id === 'claude-fable-5-1' && m.label === 'Fable 5.1 (이전)'), '새 CLI: Fable 5.2 + Fable 5.1 (이전)');
ok(!lo.some((m) => /4\.8|4\.5 \(이전\)/.test(m.label)), '4.x 는 「이전」으로 넣지 않음');
ok(versionOf('claude-opus-5-5').join('.') === '5.5' && versionOf('claude-fable-5').join('.') === '5', '판 번호 읽기');

// 3. 못 읽으면 판 번호를 말하지 않음
const fb = claudeFallback([{ id: 'opus', label: 'Opus 5.5' }, { id: 'claude-opus-5', label: 'Opus 5 (이전)' }, { id: 'fable', label: 'Fable 5.1' }]);
ok(fb.filter((m) => ['opus', 'fable'].includes(m.id)).every((m) => !/\d/.test(m.label) && m.actual === null), '읽기 실패: 별칭 줄은 판 번호 없는 이름');
ok(fb.find((m) => m.id === 'claude-opus-5').actual === 'claude-opus-5', '읽기 실패: 정확한 이름 줄은 그대로');

// 4. 심 사슬 따라가기(설치 PC 모양: shims\claude.cmd → tools\claude\claude.cmd → tools\claude\2.1.272\claude.exe)
const soul = path.join(tmp, 'soul'); const shims = path.join(soul, '_agent', 'shared', 'shims'); const tdir = path.join(soul, '_agent', 'shared', 'tools', 'claude');
fs.mkdirSync(shims, { recursive: true }); fs.mkdirSync(path.join(tdir, '2.1.272'), { recursive: true });
fs.writeFileSync(path.join(shims, 'claude.cmd'), '@echo off\r\nsetlocal\r\nif exist "%~dp0relay-ensure.cmd" call "%~dp0relay-ensure.cmd"\r\ncall "%~dp0..\\tools\\claude\\claude.cmd" %*\r\nexit /b %errorlevel%\r\n');
fs.writeFileSync(path.join(tdir, 'claude.cmd'), '@echo off\r\n"%~dp02.1.272\\claude.exe" %*\r\n');
fs.copyFileSync(oldBin, path.join(tdir, '2.1.272', 'claude.exe'));
const got = resolveClaudeBinary({ where: () => [path.join(shims, 'claude.cmd')] });
ok(got && path.normalize(got) === path.normalize(path.join(tdir, '2.1.272', 'claude.exe')), `심 → 전달자 → 실행 파일(${got && path.relative(soul, got)})`);
ok(nextFromCmd(path.join(shims, 'claude.cmd')) === path.join(tdir, 'claude.cmd'), '없는 relay-ensure.cmd 는 건너뜀');
ok(resolveClaudeBinary({ where: () => [] }) === null, 'PATH 에 claude 없음 = null');
// npm 판(cli.js)
const npmDir = path.join(tmp, 'npm'); fs.mkdirSync(path.join(npmDir, 'node_modules', '@anthropic-ai', 'claude-code'), { recursive: true });
fs.writeFileSync(path.join(npmDir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'), 'x');
fs.writeFileSync(path.join(npmDir, 'claude.cmd'), '@ECHO off\r\nSET dp0=%~dp0\r\n"%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n');
ok(/cli\.js$/.test(resolveClaudeBinary({ where: () => [path.join(npmDir, 'claude.cmd')] }) || ''), 'npm 판 claude.cmd → cli.js');

// 5. 코덱스: 그 PC 코덱스가 모르는 모델은 빼고, 새 모델은 더함
const cx = path.join(tmp, 'codex'); fs.mkdirSync(cx);
fs.writeFileSync(path.join(cx, 'models_cache.json'), JSON.stringify({ client_version: '0.154.0', models: [
  { slug: 'gpt-6-astra', visibility: 'list', priority: 1 }, { slug: 'gpt-6-sol', visibility: 'list', priority: 2 },
  { slug: 'gpt-6-luna', visibility: 'list', priority: 3 }, { slug: 'gpt-hidden', visibility: 'hide', priority: 4 },
  { slug: 'gpt-7-new', visibility: 'list', priority: 5, supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }] },
] }));
const stCodex = [{ id: 'gpt-6.1-sol', label: 'gpt-6.1-sol' }, { id: 'gpt-6-astra', label: 'gpt-6-astra' }, { id: 'gpt-6-sol', label: 'gpt-6-sol (이전)' }, { id: 'gpt-6-luna', label: 'gpt-6-luna', efforts: ['low', 'max'] }];
const cl = codexModelsFrom(stCodex, readCodexCache(cx));
ok(!cl.some((m) => m.id === 'gpt-6.1-sol'), '코덱스: 그 PC 가 모르는 gpt-6.1-sol 은 뺌');
ok(cl.some((m) => m.id === 'gpt-7-new' && m.efforts?.join() === 'low,high') && !cl.some((m) => m.id === 'gpt-hidden'), '코덱스: 새 모델(목록 표시)은 더하고 숨김 모델은 뺌');
ok(cl.every((m) => m.actual === m.id && m.label.replace(/ \((이전|구)\)$/, '') === m.id), '코덱스: 이름 = 넘기는 정확한 이름');
ok(codexModelsFrom(stCodex, null).length === stCodex.length, '코덱스 목록 파일 없음 = 손 표 그대로');

// 6. 붙이기: 실행 파일이 바뀌면(자동 업데이트) 다시 읽고 목록·기본값이 따라감 + normalize·buildCommand 가 정확한 이름을 넘김
const AG = { claude: { models: [{ id: 'opus', label: 'Opus 5.5' }, { id: 'fable', label: 'Fable 5.1' }], default: { model: 'opus' } }, codex: { models: stCodex.map((m) => ({ ...m })), default: { model: 'gpt-6.1-sol' } } };
const live = path.join(tmp, 'live.exe'); fs.copyFileSync(oldBin, live);
let scans = 0;
const cat = new ModelCatalog({ AGENTS: AG, codexHome: cx, cacheFile: path.join(tmp, 'scan.json'), resolve: () => live, scan: (f) => { scans++; return scanClaudeBinary(f); } });
cat.refresh({ force: true });
ok(AG.claude.models.find((m) => m.id === 'opus').label === 'Opus 5' && scans === 1, '붙이기: 옛 CLI → Opus 5');
ok(AG.codex.default.model === 'gpt-6-astra', '코덱스 기본 모델이 그 PC 에 없으면 목록 첫 모델로');
cat.refresh(); ok(scans === 1, '실행 파일 그대로면 다시 읽지 않음');
fs.copyFileSync(newBin, live); const t = new Date(Date.now() + 5000); fs.utimesSync(live, t, t);
const changed = cat.refresh();
ok(changed && scans === 2 && AG.claude.models.find((m) => m.id === 'fable').label === 'Fable 5.2', '실행 파일이 바뀌면 다시 읽어 Fable 5.2');
const cat2 = new ModelCatalog({ AGENTS: { claude: { models: [{ id: 'opus', label: 'x' }], default: { model: 'opus' } }, codex: { models: [], default: { model: '' } } }, codexHome: cx, cacheFile: path.join(tmp, 'scan.json'), resolve: () => live, scan: () => { throw new Error('should use cache'); } });
cat2.refresh({ force: true }); ok(cat2.AGENTS.claude.models[0].label === 'Opus 5.5', '저장해 둔 읽기 결과를 다시 씀(데몬 재시작)');

// IRIS 업데이트 도구 방식: 새 판을 새 폴더(2.1.321\claude.exe)에 받고 전달 claude.cmd 만 바꾼다(옛 판 폴더는 남김)
// → 10분을 기다리지 않고 다음 refresh(세션 열 때)에 바로 새 판을 읽어야 한다
fs.mkdirSync(path.join(tdir, '2.1.321'), { recursive: true }); fs.copyFileSync(newBin, path.join(tdir, '2.1.321', 'claude.exe'));
const AG2 = { claude: { models: [{ id: 'fable', label: 'x' }], default: { model: 'fable' } }, codex: { models: [], default: { model: '' } } };
const cat3 = new ModelCatalog({ AGENTS: AG2, codexHome: cx, cacheFile: path.join(tmp, 'scan3.json'), resolve: () => (M.resolveClaudeChain({ where: () => [path.join(shims, 'claude.cmd')] })) });
cat3.refresh({ force: true });
ok(AG2.claude.models.find((m) => m.id === 'fable').label === 'Fable 5.1', '업데이트 전: 전달자가 2.1.272 → Fable 5.1');
fs.writeFileSync(path.join(tdir, 'claude.cmd'), '@echo off\r\n"%~dp02.1.321\\claude.exe" %*\r\n');
const later = new Date(Date.now() + 9000); fs.utimesSync(path.join(tdir, 'claude.cmd'), later, later);
ok(cat3.refresh() && AG2.claude.models.find((m) => m.id === 'fable').label === 'Fable 5.2', '전달 .cmd 가 바뀌면 바로 새 판(Fable 5.2) — 10분 기다리지 않음');

// 실제 agents.mjs 경로: normalize → buildCommand 가 별칭이 아닌 정확한 이름을 넘김
const A = await import('../daemon/agents.mjs');
const realCat = new ModelCatalog({ AGENTS: A.AGENTS, codexHome: cx, cacheFile: path.join(tmp, 'scan2.json'), resolve: () => newBin });
A.setModelRefresher(() => realCat.refresh());
const s = A.normalize({ agent: 'claude', model: 'fable', effort: 'high' });
const cmd = A.buildCommand(s, tmp);
ok(s.modelLabel === 'Fable 5.2' && s.modelActual === 'claude-fable-5-2' && cmd.args.join(' ').includes('--model claude-fable-5-2'), `normalize·buildCommand: 「Fable 5.2」 → --model claude-fable-5-2`);
const so5 = A.normalize({ agent: 'claude', model: 'opus', effort: 'high' });
ok(A.buildCommand(so5, tmp).args.includes('--settings'), 'Opus 는 풀어 낸 이름이어도 fast 설정 유지');
ok(!A.buildCommand(s, tmp).args.includes('--settings'), 'Fable 은 fast 아님(9/10 결정: Opus 만)');
const sc = A.normalize({ agent: 'codex', model: 'gpt-6.1-sol', effort: 'high' });
ok(sc.model === 'gpt-6-astra' && A.buildCommand(sc, tmp).args.join(' ').includes('-m gpt-6-astra'), '코덱스: 그 PC 에 없는 모델을 고르면 있는 모델로 바뀌고 이름도 그것');
// 검토3: 5.1 로 시작한 세션이 업데이트(→ fable = 5.2) 뒤 재개되면 「Fable 5.1 (이전)」 줄로 이어 감(몰래 5.2 로 바뀌지 않음)
ok(A.modelForResume({ agent: 'claude', model: 'fable', modelActual: 'claude-fable-5-1' }) === 'claude-fable-5-1', '검토3: 재개 = 쓰던 정확한 모델(5.1) 유지');
ok(A.modelForResume({ agent: 'claude', model: 'fable', modelActual: 'claude-fable-5-2' }) === 'fable', '검토3: 쓰던 모델이 지금 최신이면 그 줄 그대로');
A.setModelRefresher(null);

// 7-0. 코덱스 검토(2026-11-10) 지적 재발 방지
// ① 설치 PC 심에 relay-ensure.cmd 가 실제로 있어도 그 사전 실행 줄이 아니라 인수(%*)를 넘기는 줄을 따라간다
fs.writeFileSync(path.join(shims, 'relay-ensure.cmd'), '@echo off\r\nexit /b 0\r\n');
const viaRelay = M.resolveClaudeChain({ where: () => [path.join(shims, 'claude.cmd')] });
ok(viaRelay.file && /2\.1\.321[\\/]claude\.exe$/.test(viaRelay.file) && !viaRelay.chain.some((c) => /relay-ensure/.test(c)), `검토1: relay-ensure.cmd 가 있어도 실제 전달 줄을 따라감(${viaRelay.file && path.relative(soul, viaRelay.file)})`);
// ② 읽기 중 오류 → 손 표의 판 번호를 남기지 않음
const AG3 = { claude: { models: [{ id: 'opus', label: 'Opus 5.5' }, { id: 'claude-opus-5', label: 'Opus 5 (이전)' }], default: { model: 'opus' } }, codex: { models: [], default: { model: '' } } };
const cat4 = new ModelCatalog({ AGENTS: AG3, codexHome: cx, cacheFile: path.join(tmp, 'scan4.json'), resolve: () => newBin, scan: () => { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; } });
cat4.refresh({ force: true });
ok(AG3.claude.models.find((m) => m.id === 'opus').label === 'Opus (이 PC 최신)' && AG3.claude.models.find((m) => m.id === 'opus').actual === null, '검토2: 읽기 오류면 「Opus (이 PC 최신)」(판 번호 없음)');
// ⑤ 같은 별칭이 겹친 구간에서 두 번 세지지 않고, 서로 다른 값이면 추측하지 않음
const amb = fakeBin(path.join(tmp, 'amb.exe'), NEW, { fable: 'claude-fable-5-2' });
fs.appendFileSync(amb, Buffer.from('xx;var b={fable:"claude-fable-5-1"};', 'latin1'));
const sa = scanClaudeBinary(amb, { chunk: 64, overlap: 300 });
ok(!sa.alias.fable && sa.ambiguous.includes('fable') && claudeModelsFrom(sa).find((m) => m.id === 'fable')?.label === 'Fable (이 PC 최신)', '검토5: 한 별칭에 다른 값 둘 = 모호 → 판 번호 없이');
const sameTwice = scanClaudeBinary(newBin, { chunk: 40, overlap: 400 });
ok(sameTwice.alias.fable === 'claude-fable-5-2' && !sameTwice.ambiguous.length, '검토5: 겹친 구간 중복은 한 번만');
// ⑥ 코덱스 사고깊이는 그 PC 목록을 따름
const cx2 = path.join(tmp, 'codex2'); fs.mkdirSync(cx2);
fs.writeFileSync(path.join(cx2, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'gpt-6-astra', visibility: 'list', priority: 1, supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }] }] }));
ok(codexModelsFrom(stCodex, readCodexCache(cx2)).find((m) => m.id === 'gpt-6-astra').efforts.join() === 'low,medium', '검토6: 아는 모델도 사고깊이 = 그 PC 코덱스 목록');
// ③ 고른 뒤 목록이 바뀌면 실행하지 않음 + 재개는 쓰던 모델 유지
const A0 = await import('../daemon/agents.mjs');
let thrown = null; try { A0.assertExpected({ modelActual: 'claude-fable-5-2' }, 'claude-fable-5-1'); } catch (e) { thrown = e; }
ok(thrown?.code === 'MODEL_CHANGED' && /다시/.test(thrown.message), '검토3: 고른 모델(5.1) ≠ 지금(5.2) → 실행 거절·다시 고르기');
let none = null; try { A0.assertExpected({ modelActual: 'claude-fable-5-2' }, 'claude-fable-5-2'); A0.assertExpected({ modelActual: 'x' }, null); } catch (e) { none = e; }
ok(!none, '검토3: 같거나 기대값이 없으면 통과(옛 화면 호환)');
// 2차 검토 3번: 고를 때 정확한 이름이 보였는데 지금 확인 못 함(읽기 실패) → 거절
let t2 = null; try { A0.assertExpected({ modelActual: null }, 'claude-fable-5-2'); } catch (e) { t2 = e; }
ok(t2?.code === 'MODEL_CHANGED', '2차3: 지금 모델을 확인 못 하면 거절');
// 2차 검토 3번: 쓰던 정확한 모델이 목록에서 사라져도 재개는 그 모델·그 이름 그대로(버전 안 바뀜), buildCommand 재정규화에도 유지
const kept = A0.keepResumeModel({ agent: 'claude', model: 'fable', modelLabel: 'Fable 5.3', modelActual: 'claude-fable-5-3', effort: 'high' }, { agent: 'claude', model: 'fable', modelLabel: 'Fable 5.1', modelActual: 'claude-fable-5-1' });
const kcmd = A0.buildCommand(kept, tmp);
ok(kept.modelActual === 'claude-fable-5-1' && kept.modelLabel === 'Fable 5.1' && kcmd.args.join(' ').includes('--model claude-fable-5-1'), '2차3: 목록에서 사라진 5.1 세션 재개 = 5.1 그대로(이름도)');
// 3차 검토 3번: 코덱스도 목록에서 빠진 모델로 시작한 세션의 재개는 그 모델 그대로(기본 모델로 몰래 바뀌지 않음, 이름도 쓰던 이름)
const ck = A0.keepResumeModel({ agent: 'codex', model: 'gpt-6.1-sol', modelLabel: 'gpt-6.1-sol', modelActual: 'gpt-6.1-sol', effort: 'high' }, { agent: 'codex', model: 'gpt-5.6-sol', modelLabel: 'gpt-5.6-sol (구)', modelActual: 'gpt-5.6-sol' });
ok(ck.modelActual === 'gpt-5.6-sol' && ck.modelLabel === 'gpt-5.6-sol (구)' && A0.buildCommand(ck, tmp).args.join(' ').includes('-m gpt-5.6-sol'), '3차3: 코덱스 재개 = 쓰던 모델 그대로(이름도)');
ok(A0.keepResumeModel({ agent: 'claude', model: 'opus', modelActual: 'claude-opus-5-5' }, { agent: 'codex', modelActual: 'gpt-5.6-sol' }).modelActual === 'claude-opus-5-5', '3차3: 다른 에이전트 기록은 섞지 않음');
// 2차 검토 5번: 옛 스캐너가 남긴 저장 결과는 믿지 않고 다시 읽음
const cf = path.join(tmp, 'scan-old.json');
const k0 = (() => { const s = fs.statSync(newBin); return `${newBin}|${s.size}|${Math.round(s.mtimeMs)}`; })();
fs.writeFileSync(cf, JSON.stringify({ key: k0, scan: { alias: { fable: 'claude-fable-9-9' }, names: {} } }));
let rescans = 0;
const AG5 = { claude: { models: [{ id: 'fable', label: 'x' }], default: { model: 'fable' } }, codex: { models: [], default: { model: '' } } };
new ModelCatalog({ AGENTS: AG5, codexHome: cx, cacheFile: cf, resolve: () => newBin, scan: (f) => { rescans++; return scanClaudeBinary(f); } }).refresh({ force: true });
ok(rescans === 1 && AG5.claude.models.find((m) => m.id === 'fable').label === 'Fable 5.2', '2차5: 옛 형식 저장 결과 무시 → 다시 읽음');
// 2차 검토 6번: 명시적인 빈 사고깊이 목록은 손 표로 되살리지 않음
fs.writeFileSync(path.join(cx2, 'models_cache.json'), JSON.stringify({ models: [{ slug: 'gpt-6-luna', visibility: 'list', priority: 1, supported_reasoning_levels: [] }] }));
ok(codexModelsFrom(stCodex, readCodexCache(cx2)).find((m) => m.id === 'gpt-6-luna').efforts.length === 0, '2차6: 빈 목록은 빈 목록 그대로');
// 3차 검토 6번: 빈 목록이면 실행 명령에도 사고깊이를 넣지 않는다(기본값으로 되살리지 않음)
const lunaIdx = A0.AGENTS.codex.models.findIndex((m) => m.id === 'gpt-6-luna');
if (lunaIdx >= 0) {
  const keep = A0.AGENTS.codex.models[lunaIdx];
  A0.AGENTS.codex.models[lunaIdx] = { ...keep, efforts: [] };
  const sl = A0.normalize({ agent: 'codex', model: 'gpt-6-luna', effort: 'high' });
  ok(sl.effort === '' && !A0.buildCommand(sl, tmp).args.join(' ').includes('model_reasoning_effort'), '3차6: 빈 사고깊이 목록 = 깊이 안 넘김');
  A0.AGENTS.codex.models[lunaIdx] = keep;
} else ok(false, '3차6: 시험용 gpt-6-luna 줄이 없음');

// 7. 실제 응답 모델 대조
ok(modelMatches('claude-fable-5-2', 'claude-fable-5-2') === true && modelMatches('claude-fable-5-1', 'claude-fable-5-2') === false, '대조: 같음/다름');
ok(modelMatches('claude-opus-5-5', '<synthetic>') === null && modelMatches(null, 'x') === null, '대조: 모르면 판단 안 함');
ok(modelMatches('claude-opus-5-5', 'claude-opus-5-5[1m]') === true, '대조: [1m] 꼬리는 같은 모델');
// 화면 쪽(main.js)도 같은 규칙을 쓴다 — 글자 확인
const mainJs = fs.readFileSync(path.join(ROOT, 'app', 'main.js'), 'utf8');
ok(/function checkModel\(meta\)/.test(mainJs) && /모델 불일치/.test(mainJs) && /id="vh-mwarn"/.test(fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8')), '화면: 불일치 경고 자리·문구 있음');
ok(/afterTranscript\(meta\) \{\s*checkModel\(meta\);/.test(mainJs), '화면: 기록이 올 때마다 대조');

// 8. 이 PC 실제 CLI(있으면 읽기만)
const real = resolveClaudeBinary();
if (real) {
  const rs = scanClaudeBinary(real); const rl = claudeModelsFrom(rs);
  invariant(rs, rl, `이 PC 실제 CLI(${path.basename(real)})`);
} else console.log('SKIP 이 PC 에 claude 없음');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
