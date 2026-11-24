// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// verify:antigravity — 셋째 에이전트(Google Antigravity CLI) 어댑터 검사. 네트워크 · 실제 agy · 진짜 ~/.gemini 를 쓰지 않는다(임시 폴더만).
// 설계 = D09 안티그래비티-입점설계 4절 '노트북 단계 구현 기록' 조각 ⑨. 클로드 · 코덱스 무회귀는 verify:agent-baseline 이 본다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-agy-check-'));
const GEM = path.join(TMP, 'gemini');
const STATE = path.join(TMP, 'state');
const FAKE_LA = path.join(TMP, 'localappdata');
fs.mkdirSync(path.join(TMP, 'emptyroot'), { recursive: true });
Object.assign(process.env, { IRIS_ROOT: path.join(TMP, 'emptyroot'), IRIS_GEMINI_DIR: GEM, IRIS_FACE_STATE: STATE, IRIS_AGY_STATUS_FILE: path.join(TMP, 'agy-status.json'), LOCALAPPDATA: FAKE_LA });
delete process.env.IRIS_AGY_EXE;
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; } else { fail++; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`); } };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name, `받음 ${JSON.stringify(a)} / 원함 ${JSON.stringify(b)}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const agents = await imp('daemon/agents.mjs');
const ad = await imp('daemon/agents/antigravity.mjs');
const rec = await imp('daemon/agents/antigravity.records.mjs');
const setup = await imp('daemon/agents/antigravity.setup.mjs');
const st = await imp('daemon/agents/antigravity.status.mjs');
const mdl = await imp('daemon/agents/antigravity.models.mjs');
const { TranscriptTail } = await imp('daemon/transcript.mjs');

// ── 1. 명부 · 선택값 · 명령 ──
eq(Object.keys(agents.AGENTS), ['claude', 'codex', 'antigravity'], '명부 순서(기본 = 클로드 그대로)');
// 모델 + 사고 깊이 두 칸(2026-11-23): 화면의 모델 = 꼬리를 뗀 머리, CLI 에 넘기는 이름 = 그 둘이 가리키는 agy models 의 정확한 이름
{
  const T = agents.AGENTS.antigravity;
  eq(T.models.map((m) => `${m.id}[${m.efforts.join('/')}]`), ['gemini-4-neon[low/medium/high/xhigh]', 'gemini-4-argon[low/medium/high]', 'gemini-4-hydrogen[low/medium/high/xhigh]', 'gemini-pro-orchestrator-neon[]', 'gemini-pro-orchestrator-g1-pro[]', 'gemini-3.8-flash[low/medium/high]'], '목록: 모델 6줄 + 모델마다 가진 사고 깊이');
  eq(T.models.map((m) => m.label), ['Gemini 4 Neon', 'Gemini 4 Argon', 'Gemini 4 Hydrogen', 'Orchestrator (Neon)', 'Orchestrator (Argon)', 'Gemini 3.8 Flash'], '목록: 보이는 이름에서 깊이 꼬리를 뗌(Orchestrator 의 괄호는 깊이가 아니라 그대로)');
  ok(!T.models.some((m) => /claude|gpt/i.test(m.id + m.label)), '목록: 클로드 · GPT 모델 없음');
  eq([T.efforts, T.default], [['low', 'medium', 'high', 'xhigh', 'max'], { model: 'gemini-4-argon', effort: 'high' }], '목록: 깊이 순서 · 기본 = Argon high');
  const all = T.models.flatMap((m) => (m.actuals ? Object.values(m.actuals) : [m.actual]));
  eq(all.slice().sort(), mdl.HAND_LIST.map((m) => m.id).sort(), '목록: 넘길 수 있는 이름 = 손 표의 정확한 이름 전부(지어낸 이름 0)');
}
let n = agents.normalize({ agent: 'antigravity', model: 'gemini-4-neon', effort: 'xhigh', permission: 'plan', approval: 'never', sandbox: 'read-only' });
eq([n.agent, n.model, n.modelLabel, n.modelActual, n.effort, n.permission, n.approval, n.sandbox, n.readOnly], ['antigravity', 'gemini-4-neon', 'Gemini 4 Neon', 'gemini-4-neon-xhigh', 'xhigh', 'plan', '', '', false], '정리: 모델 + 깊이 → 정확한 이름, 권한은 안티그래비티 목록의 값만(2026-11-25) · 코덱스 칸은 비움');
n = agents.normalize({ agent: 'antigravity', model: 'gemini-4-argon', effort: 'xhigh' });
eq([n.effort, n.modelActual], ['high', 'gemini-4-argon-high'], '정리: 그 모델에 없는 깊이 = 가장 가까운 아래(xhigh → high)');
n = agents.normalize({ agent: 'antigravity', model: 'gemini-4-argon', effort: 'max' });
eq([n.effort, n.modelActual], ['high', 'gemini-4-argon-high'], '정리: max 도 아래로');
n = agents.normalize({ agent: 'antigravity', model: 'gemini-pro-orchestrator-neon', effort: 'high' });
eq([n.model, n.effort, n.modelActual], ['gemini-pro-orchestrator-neon', '', 'gemini-pro-orchestrator-neon'], '정리: 깊이 없는 모델 = 깊이 빈 값, 이름 그대로');
n = agents.normalize({ agent: 'antigravity' });
eq([n.model, n.effort, n.modelActual], ['gemini-4-argon', 'high', 'gemini-4-argon-high'], '기본 모델 · 깊이');
// 옛 선택값(모델 칸에 정확한 이름 통째 — 오전 판의 카드 · 화면 값)
n = agents.normalize({ agent: 'antigravity', model: 'gemini-3.8-flash-low', effort: 'high' });
eq([n.model, n.effort, n.modelActual, n.modelLabel], ['gemini-3.8-flash', 'low', 'gemini-3.8-flash-low', 'Gemini 3.8 Flash'], '옛 값: 정확한 이름 → 모델 + 깊이(이름의 깊이가 이긴다)');
n = agents.normalize({ agent: 'antigravity', model: 'gemini-4-neon-xhigh', effort: '' });
eq([n.model, n.effort, n.modelActual], ['gemini-4-neon', 'xhigh', 'gemini-4-neon-xhigh'], '옛 값: 깊이 칸이 비어 있던 카드');
n = agents.normalize({ agent: 'antigravity', model: 'claude-opus-5-5-high', effort: '' });
eq([n.model, n.modelActual], ['gemini-4-argon', 'gemini-4-argon-high'], '새로 고르기: 목록에서 뺀 클로드 이름은 기본 모델로(조용히 클로드로 띄우지 않는다)');
{ // 재개: 옛 카드(정확한 이름 통째)가 같은 모델로 다시 열리고 카드가 새 모양이 된다
  const old = { agent: 'antigravity', model: 'gemini-4-argon-medium', modelActual: 'gemini-4-argon-medium', modelLabel: 'Gemini 4 Argon (Medium)', effort: '' };
  const base = agents.normalize({ agent: old.agent, model: agents.modelForResume(old), effort: old.effort });
  const kept = agents.keepResumeModel(base, old);
  eq([kept.model, kept.effort, kept.modelActual, kept.modelLabel, !!kept.keepActual], ['gemini-4-argon', 'medium', 'gemini-4-argon-medium', 'Gemini 4 Argon', false], '재개: 옛 카드 = 같은 정확한 이름 · 새 모양');
  // 재개: 목록에서 뺀 모델(클로드)로 열었던 옛 카드는 쓰던 이름 그대로(몰래 바꾸지 않는다)
  const oc = { agent: 'antigravity', model: 'claude-opus-5-5-high', modelActual: 'claude-opus-5-5-high', modelLabel: 'Claude Opus 5.5 (High)', effort: '' };
  const kc = agents.keepResumeModel(agents.normalize({ agent: oc.agent, model: agents.modelForResume(oc), effort: oc.effort }), oc);
  const again = agents.normalize(kc); // buildCommand 가 다시 정리해도 그대로
  eq([again.model, again.modelActual, again.modelLabel, again.effort, again.keepActual], ['claude-opus-5-5-high', 'claude-opus-5-5-high', 'Claude Opus 5.5 (High)', '', true], '재개: 뺀 모델의 옛 카드 = 쓰던 이름 그대로 · 깊이 칸 비움');
  const ka = agents.buildCommand(kc, TMP, { resumeId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }).args;
  eq(ka[ka.indexOf('--model') + 1], 'claude-opus-5-5-high', '재개: 명령에도 쓰던 이름');
  // 재개: 새 모양 카드인데 그 깊이가 목록에서 사라짐 → 쓰던 이름 · 깊이 그대로
  const gone = { agent: 'antigravity', model: 'gemini-4-argon', modelActual: 'gemini-4-argon-max', modelLabel: 'Gemini 4 Argon', effort: 'max' };
  const kg = agents.normalize(agents.keepResumeModel(agents.normalize({ agent: gone.agent, model: agents.modelForResume(gone), effort: gone.effort }), gone));
  eq([kg.model, kg.modelActual, kg.effort], ['gemini-4-argon', 'gemini-4-argon-max', 'max'], '재개: 사라진 깊이의 카드 = 쓰던 이름 · 깊이');
}
// 고른 순간의 이름과 실제로 넘길 이름이 다르면 거절(화면 expectOf = actuals[깊이])
{
  let code = null; try { agents.assertExpected(agents.normalize({ agent: 'antigravity', model: 'gemini-4-argon', effort: 'high' }), 'gemini-4-argon-high'); } catch (e) { code = e.code; }
  eq(code, null, '기대 이름 같음 = 통과');
  try { agents.assertExpected(agents.normalize({ agent: 'antigravity', model: 'gemini-4-argon', effort: 'xhigh' }), 'gemini-4-argon-xhigh'); } catch (e) { code = e.code; }
  eq(code, 'MODEL_CHANGED', '기대 이름 다름(그 깊이가 없어 아래로 맞춰짐) = 거절');
}
// 코덱스 검토 1번(2026-11-23): 모델마다 가진 깊이가 다르고 공통 기본 깊이(high)도 그 모델에 없을 때 — 없는 조합으로 이름을 지어 넘기지 않는다
{
  const T = agents.AGENTS.antigravity;
  st.applyModels(T, [{ id: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High)' }, { id: 'gemini-4-neon-xhigh', label: 'Gemini 4 Neon (XHigh)' }, { id: 'gemini-4-zinc-low', label: 'Gemini 4 Zinc (Low)' }, { id: 'gemini-4-zinc-max', label: 'Gemini 4 Zinc (Max)' }]);
  let x = agents.normalize({ agent: 'antigravity', model: 'gemini-4-neon', effort: 'high' });
  eq([x.effort, x.modelActual], ['xhigh', 'gemini-4-neon-xhigh'], '깊이 맞추기: 고른 깊이 이하도 · 기본 깊이도 그 모델에 없으면 그 모델이 가진 깊이로(이름을 지어내지 않음)');
  const cmdArgs = agents.buildCommand({ agent: 'antigravity', model: 'gemini-4-neon', effort: 'high' }, TMP).args;
  eq(cmdArgs[cmdArgs.indexOf('--model') + 1], 'gemini-4-neon-xhigh', '깊이 맞추기: 명령에도 목록에 있는 정확한 이름');
  x = agents.normalize({ agent: 'antigravity', model: 'gemini-4-zinc', effort: 'medium' });
  eq([x.effort, x.modelActual], ['low', 'gemini-4-zinc-low'], '깊이 맞추기: 고른 깊이 이하에 있으면 그것(medium → low)');
  x = agents.normalize({ agent: 'antigravity', model: 'gemini-4-zinc', effort: 'nope' });
  eq([x.effort, x.modelActual], ['low', 'gemini-4-zinc-low'], '깊이 맞추기: 모르는 깊이 값 = 기본(high) 이하에서 그 모델이 가진 것');
  for (const m of T.models) for (const e of [...T.efforts, '', 'nope']) { const y = agents.normalize({ agent: 'antigravity', model: m.id, effort: e }); if (!y.modelActual || !['gemini-4-argon-high', 'gemini-4-neon-xhigh', 'gemini-4-zinc-low', 'gemini-4-zinc-max'].includes(y.modelActual)) ok(false, `깊이 맞추기: ${m.id} + ${e} → ${y.modelActual}`); }
  ok(true, '깊이 맞추기: 모든 모델 × 모든 깊이 값이 목록에 있는 이름으로만 풀림');
  let code = null; try { ad.buildCommand({ agent: 'antigravity', model: 'gemini-4-neon', modelLabel: 'Gemini 4 Neon', effort: '', modelActual: null }, TMP); } catch (e) { code = e.code; }
  eq(code, 'MODEL_CHANGED', '정확한 이름이 없으면 띄우지 않음(머리 이름을 대신 넘기지 않는다)');
  st.applyModels(T, mdl.HAND_LIST); // 손 표로 되돌린다(뒤 검사가 쓰는 목록)
  eq([T.models.length, T.default], [6, { model: 'gemini-4-argon', effort: 'high' }], '(되돌림) 손 표 6줄 · 기본 Argon high');
}
// 묶기 함수(순수)
{
  const raw = st.parseModels('Fetching available models...\ngemini-4-neon-high\tGemini 4 Neon (High)\ngemini-4-neon-xhigh\tGemini 4 Neon (XHigh)\ngemini-9-solo\tGemini 9 Solo\nclaude-opus-5-5-low\tClaude Opus 5.5 (Low)\ngpt-oss-120b-medium\tGPT-OSS 120B (Medium)\ngemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\ngemini-4-neon-low\tGemini 4 Neon (Low)\nllama-x-high\tLlama X (High)\n');
  eq(mdl.groupModels(raw), [
    { id: 'gemini-4-neon', label: 'Gemini 4 Neon', efforts: ['low', 'high', 'xhigh'], actuals: { high: 'gemini-4-neon-high', xhigh: 'gemini-4-neon-xhigh', low: 'gemini-4-neon-low' } },
    { id: 'gemini-9-solo', label: 'Gemini 9 Solo', efforts: [], actual: 'gemini-9-solo' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', efforts: ['medium'], actuals: { medium: 'gemini-3.8-flash-medium' } },
    { id: 'llama-x', label: 'Llama X', efforts: ['high'], actuals: { high: 'llama-x-high' } },
  ], '묶기: 처음 나온 순서 · 깊이는 낮음 → 높음 · claude-/gpt- 만 뺌(그 밖의 새 이름은 보임)');
  eq(mdl.groupModels([{ id: 'claude-x-high', label: 'C' }, { id: 'gpt-y', label: 'G' }, null, { id: '' }]), [], '묶기: 남는 것이 없으면 빈 목록');
  const rows = mdl.groupModels(raw);
  eq([mdl.actualOf(rows[0], 'xhigh'), mdl.actualOf(rows[0], 'medium'), mdl.actualOf(rows[1], 'high'), mdl.actualOf(rows[1], '')], ['gemini-4-neon-xhigh', null, 'gemini-9-solo', 'gemini-9-solo'], '정확한 이름: 있는 조합만(없는 조합 = null — 이름을 지어내지 않는다)');
  eq(mdl.fitDefault({ model: 'gemini-4-argon', effort: 'high' }, rows), { model: 'gemini-4-neon', effort: 'high' }, '기본값: Argon 이 없는 목록 = 첫 줄');
  eq(mdl.fitDefault({ model: 'gemini-4-argon', effort: 'high' }, mdl.groupModels([{ id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' }, { id: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)' }])), { model: 'gemini-3.8-flash', effort: 'medium' }, '기본값: 무료 계정 꼴(Flash 만) = high 이하에서 가장 높은 깊이');
  eq(mdl.fitDefault({ model: 'gemini-4-argon', effort: 'high' }, mdl.groupModels([{ id: 'gemini-pro-orchestrator-neon', label: 'Orchestrator (Neon)' }])), { model: 'gemini-pro-orchestrator-neon', effort: '' }, '기본값: 깊이 없는 모델뿐 = 깊이 빈 값');
  // 그 PC 의 목록을 입힘: 목록 · 기본값이 함께 바뀌고, 같은 목록을 다시 입히면 바뀌지 않음
  const tbl = { models: mdl.groupModels(mdl.HAND_LIST), default: { model: 'gemini-4-argon', effort: 'high' } };
  eq(st.applyModels(tbl, raw), true, '입히기: 바뀜');
  eq([tbl.models.map((m) => m.id), tbl.default], [['gemini-4-neon', 'gemini-9-solo', 'gemini-3.8-flash', 'llama-x'], { model: 'gemini-4-neon', effort: 'high' }], '입히기: 목록 · 기본값');
  eq(st.applyModels(tbl, raw), false, '입히기: 같은 목록 = 안 바뀜');
  eq([st.applyModels(tbl, [{ id: 'claude-opus-5-5-low', label: 'x' }]), tbl.models.length], [false, 4], '입히기: 구글 모델이 하나도 없는 목록 = 목록 그대로');
}
// 화면(소스 확인): 옛 값 옮겨 읽기 · 기대 이름 = actuals[깊이] · 깊이 없는 모델은 깊이를 보내지 않음
{
  const src = fs.readFileSync(path.join(ROOT, 'app', 'main.js'), 'utf8');
  ok(/m\?\.actuals \? m\.actuals\[c\.effort\] : m\?\.actual/.test(src), '화면: 기대 이름 = actuals[사고 깊이]');
  ok(/const legacy = a\.models\.find\(m => m\.id === sel\.model\[sel\.agent\]\) \? null : a\.models\.find\(m => m\.actuals && Object\.values\(m\.actuals\)\.includes\(sel\.model\[sel\.agent\]\)\)/.test(src), '화면: 옛 값(정확한 이름 통째)을 모델 + 깊이로 옮겨 읽음');
  ok(/const effortFor = \(agent\) => \{ const m = agent === 'antigravity' \? /.test(src) && /effort: effortFor\(sel\.agent\)/.test(src), '화면: 깊이 없는 모델은 깊이를 보내지 않음 — 안티그래비티만(클로드 · 코덱스는 예전 그대로)');
  ok(/if \(model\.actuals && efforts\.length && !efforts\.includes\(effort\)\) effort = /.test(src), '화면: 맞춘 깊이는 그 모델이 가진 것으로(데몬과 같은 규칙, actuals 가 있는 목록만)');
}
// 실행 파일 없음 → cmd.exe /c agy
let c = agents.buildCommand({ agent: 'antigravity', model: 'gemini-4-neon-high' }, TMP);
eq([c.file, c.args.slice(0, 5)], ['cmd.exe', ['/c', 'agy', '--model', 'gemini-4-neon-high', '--dangerously-skip-permissions']], '실행 파일 없으면 PATH 의 agy');
ok(c.args.includes('--log-file') && c.args[c.args.indexOf('--log-file') + 1].startsWith(path.join(STATE, 'agy-logs')), '카드마다 기록 파일(--log-file, 상태 폴더 안)');
ok(!c.args.includes('--conversation') && !c.sessionId && !c.recordPath && c.resumeCmd === '', '새 대화 = 재개 id 없음');
ok(agents.adapterOfCommand(c)?.id === 'antigravity', '명령 ↔ 어댑터 짝');
// 공식 설치 자리에 실행 파일이 있으면 그것을 직접
fs.mkdirSync(path.join(FAKE_LA, 'agy', 'bin'), { recursive: true }); fs.writeFileSync(path.join(FAKE_LA, 'agy', 'bin', 'agy.exe'), '');
const conv = '11111111-2222-4333-8444-555555555555';
c = agents.buildCommand({ agent: 'antigravity', model: 'gemini-4-neon-high' }, TMP, { resumeId: conv });
eq([c.file, c.args.slice(-2), c.sessionId, c.resumeCmd], [path.join(FAKE_LA, 'agy', 'bin', 'agy.exe'), ['--conversation', conv], conv, `agy --conversation ${conv}`], '공식 자리 exe 직접 · 재개');
eq(c.recordPath, path.join(GEM, 'antigravity-cli', 'brain', conv, '.system_generated', 'logs', 'transcript.jsonl'), '재개 기록 경로');
const l1 = agents.buildCommand({ agent: 'antigravity' }, TMP), l2 = agents.buildCommand({ agent: 'antigravity' }, TMP);
ok(l1.cmdline !== l2.cmdline, '같은 선택이라도 카드마다 다른 기록 파일');
eq(agents.isFastModel('antigravity', 'gemini-4-argon-high'), false, 'fast 없음');
eq(agents.permLabel({ agent: 'antigravity' }), '권한 자동 승인', '권한 표시');
// 권한 모드(2026-11-25): 빈 값 · 모르는 값 = 전부 허용(지금까지와 같은 명령), 고른 값만 --mode 로
{
  const A = (permission) => { const a = agents.buildCommand({ agent: 'antigravity', model: 'gemini-4-neon', effort: 'high', permission }, TMP).args; return a.slice(2, a.indexOf('--log-file')).join(' '); };
  eq([A(undefined), A(''), A('nope'), A('bypassPermissions'), A('manual'), A('constructor')], Array(6).fill('--dangerously-skip-permissions'), '권한: 값 없음 · 모르는 값 · 클로드 값 = 전부 허용(예전과 같은 명령)');
  eq([A('auto'), A('acceptEdits'), A('plan')], ['--mode auto', '--mode accept-edits', '--mode plan'], '권한: 고른 모드 → --mode');
  eq(ad.table.permissions.map((p) => p.id), ['', 'auto', 'acceptEdits', 'plan'], '권한 목록 = 실측으로 확인한 넷(매번 묻기는 CLI 에 없음)');
  eq([agents.permLabel({ agent: 'antigravity', permission: 'plan' }), agents.permLabel({ agent: 'antigravity', permission: 'nope' })], ['계획만', '권한 자동 승인'], '권한 표시: 고른 모드 이름 · 모르는 값은 기본 표시');
  const kept = agents.normalize({ agent: 'antigravity', model: 'gemini-4-neon', effort: 'high', permission: 'acceptEdits', approval: 'never', sandbox: 'read-only' });
  eq([kept.permission, kept.approval, kept.sandbox, kept.readOnly], ['acceptEdits', '', '', false], '권한: 코덱스 칸(승인 · 샌드박스)은 언제나 빈 값');
}
// 재개 모델 지키기: 안티그래비티 이름은 지키고, 클로드 · 코덱스는 gemini 이름을 받지 않는다(머리 글자 검사 그대로)
eq(agents.keepResumeModel({ agent: 'antigravity', model: 'gemini-4-argon-high', modelActual: 'gemini-4-argon-high' }, { agent: 'antigravity', model: 'gemini-9-old', modelActual: 'gemini-9-old' }).modelActual, 'gemini-9-old', '재개: 목록에서 빠진 안티그래비티 모델도 그대로');
eq(agents.keepResumeModel({ agent: 'claude', model: 'opus', modelActual: 'claude-opus-5-5' }, { agent: 'claude', modelActual: 'gemini-4-argon-high' }).modelActual, 'claude-opus-5-5', '재개: 클로드는 gemini 이름을 받지 않음');
eq(agents.keepResumeModel({ agent: 'codex', model: 'gpt-6.1-sol', modelActual: 'gpt-6.1-sol' }, { agent: 'codex', modelActual: 'gemini-4-argon-high' }).modelActual, 'gpt-6.1-sol', '재개: 코덱스는 gemini 이름을 받지 않음');
let threw = null; try { agents.normalize({ agent: 'Antigravity' }); } catch (e) { threw = e.code; }
eq(threw, 'UNKNOWN_AGENT', '대소문자 다른 이름 = 거절(걸음 5 그대로)');

// ── 2. 기록 해석 ──
const recordFile = path.join(TMP, 'transcript.jsonl');
const L = (o) => JSON.stringify(o);
const lines = [
  L({ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-11-23T01:00:00Z', content: '<USER_REQUEST>\n안녕 <b>\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: x\n</ADDITIONAL_METADATA>' }),
  L({ step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-11-23T01:00:01Z', model: 'gemini-4-argon-high', input_tokens: 100, cache_read_tokens: 20, output_tokens: 7, tool_calls: [{ name: 'run_command', args: { CommandLine: '"git status"', WaitMsBeforeAsync: '5000' } }, { name: 'view_file', args: { AbsolutePath: '"C:\\\\x\\\\a.md"' } }] }),
  L({ step_index: 2, source: 'MODEL', type: 'GENERIC', status: 'DONE', created_at: '2026-11-23T01:00:02Z', content: 'Command exited with code 0.' }),
  L({ step_index: 3, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-11-23T01:00:03Z', content: '끝났습니다.' }),
  L({ step_index: 4, source: 'SYSTEM', type: 'SYSTEM_MESSAGE', status: 'DONE', created_at: '2026-11-23T01:00:04Z', content: '<SYSTEM_MESSAGE>x</SYSTEM_MESSAGE>' }),
  L({ step_index: 5, source: 'MODEL', type: 'SOMETHING_NEW', status: 'DONE', created_at: '2026-11-23T01:00:05Z' }),
  '{ 깨진 줄',
];
fs.writeFileSync(recordFile, lines.join('\n') + '\n', 'utf8');
const tail = new TranscriptTail(recordFile, 'antigravity');
const items = tail.poll();
eq(items.map((i) => i.kind), ['user', 'tool', 'tool', 'tool_result', 'assistant', 'unknown'], '항목 종류(모르는 종류 = unknown 하나 · 시스템 글 · 깨진 줄은 없음)');
eq(items[0].text, '안녕 <b>', '사용자 글 = USER_REQUEST 안만');
eq([items[1].name, items[1].detail, items[2].name, items[2].detail], ['Bash', 'git status', 'Read', 'C:\\x\\a.md'], '도구 이름 · 인수(한 겹 벗김)');
eq([tail.model, tail.lastUsage], ['gemini-4-argon-high', { in: 120, out: 7, total: 127 }], '모델 · 사용량(입력 = 입력 + 캐시)');
eq(tail.turnState(), null, '차례 판정 = 모름(기록에 중단 표식 없음)');
eq(tail.contextWindow(), 1048576, '맥락 창(Gemini)');
eq(rec.userRequest('<USER_REQUEST>\na\n</USER_REQUEST>\n<USER_REQUEST>b</USER_REQUEST>'), 'a\n</USER_REQUEST>\n<USER_REQUEST>b', '본문에 같은 표가 또 있어도 첫 여는 표 ~ 마지막 닫는 표');
eq(rec.userRequest('그냥 글\n<ADDITIONAL_METADATA>\nx'), '그냥 글', '표가 없으면 뒤붙임만 뗌');
// 이 PC 의 실제 기록(있으면) — 예외 없이 읽히는가
{
  const real = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
  let n = 0, bad = 0;
  try {
    for (const d of fs.readdirSync(real)) {
      const f = path.join(real, d, '.system_generated', 'logs', 'transcript.jsonl'); if (!fs.existsSync(f)) continue;
      try { new TranscriptTail(f, 'antigravity').poll(); n++; } catch { bad++; }
    }
  } catch {}
  ok(bad === 0, `이 PC 실제 기록 ${n}개를 예외 없이 읽음`);
}

// ── 3. 화면 신호 ──
const busy = 'header\n> Reply with exactly: PONG\n⡿  Generating...\n────\n>\n────\nesc to cancel                     auto · Gemini 3.8 Flash · low';
const idle = 'header\n> Reply\n  PONG\n────\n>\n────\n? for shortcuts                   auto · Gemini 3.8 Flash · low';
const quoted = 'Claude 의 확인 창에는 "Esc to cancel · Enter to confirm" 이 뜹니다\n────\n>\n────\n? for shortcuts';
const trust = 'Do you trust the contents of this project?\n> Yes\n  No\nEnter to select';
const S = (s) => ad.screen.status(s, s.split('\n'));
eq([S(busy), S(idle), S(quoted), S(trust), S('Antigravity CLI 1.5.14\n')], ['busy', 'idle', 'idle', 'attention', 'busy'], '화면 판정(일함 · 기다림 · 본문 인용 · 신뢰 물음 · 준비 전)');
eq([ad.screen.working.test(busy), ad.screen.working.test(idle), ad.screen.attention.test(quoted), ad.screen.attention.test(trust)], [true, false, false, true], 'Enter 확인용 식');
eq(ad.screen.activity(busy.split('\n')), 'Generating…', '진행 문구');
ok(ad.screen.interrupted('  ⎿  Interrupted · What should Antigravity CLI do instead?') && !ad.screen.interrupted('중단(Interrupted)이라는 낱말'), '중단 표식');
// 권한 물음(1.5.16 실제 세션에서 찍은 화면, 2026-11-25): 맨 아래 상태줄이 "esc to cancel" 이어도 일하는 중이 아니라 확인 필요다 —
// 이것을 놓치면 「전부 허용」이 아닌 권한 모드에서 물음이 떠도 화면은 계속 작업 중으로 보이고 확인 카드가 뜨지 않는다.
const perm = ['● Ran (echo IRIS_PERM_PROBE)', '────────────────', 'Requesting permission for:', '   echo IRIS_PERM_PROBE', 'Run this command?', '> 1. Yes, run command',
  "  2. Yes, and always allow in this conversation for commands that start with 'echo IRIS_PERM_PROBE'", "  3. Yes, and always allow for commands that start with 'echo IRIS_PERM_PROBE' (Persist to settings.json)",
  '  4. No, cancel', '  ↑/↓ Navigate · tab Amend · ctrl+g edit/expand command', 'esc to cancel                              accept-edits · Gemini 3.8 Flash · low'].join('\n');
const talked = ['> 권한 물음이 뭐야?', '  "Requesting permission for:" 다음에 1. Yes, run command 같은 선택지가 뜹니다.', ...Array.from({ length: 16 }, (_, i) => `  설명 ${i + 1}`), '────', '>', '────', '? for shortcuts'].join('\n');
eq([S(perm), ad.screen.working.test(perm), ad.screen.attention.test(perm)], ['attention', false, true], '권한 물음 = 확인 필요(상태줄 esc to cancel 에 속지 않음)');
eq([S(talked), ad.screen.attention.test(talked), S(busy)], ['idle', false, 'busy'], '대화 글 속의 같은 낱말 · 평소 일하는 화면은 그대로');
// 코덱스 검토 1번(2026-11-25): 방금 받은 답에 물음의 낱말이 그대로 있어도(화면 끝 가까이) 기다리는 화면은 기다림이고, 일하는 화면은 일함이다
const said1 = ['  답변: ↑/↓ Navigate 는 방향키 안내입니다.', '>', '? for shortcuts'].join('\n');
const said2 = ['  Requesting permission for:', '  1. Yes, run command 를 누르면 실행됩니다.', '  4. No, cancel 은 취소입니다.', '────', '>', '────', '? for shortcuts                   auto · Gemini 3.8 Flash · low'].join('\n');
const said3 = ['> 권한 물음의 뜻을 알려 줘', '  ↑/↓ Navigate 는 방향키, 1. Yes 는 허용입니다', '⡿  Generating...', '────', '>', '────', 'esc to cancel                     auto · Gemini 3.8 Flash · low'].join('\n');
eq([S(said1), S(said2), S(said3), ad.screen.attention.test(said1), ad.screen.attention.test(said2), ad.screen.working.test(said3)], ['idle', 'idle', 'busy', false, false, true], '답 글에 물음의 낱말이 있어도: 기다리는 화면 = 기다림 · 일하는 화면 = 일함');
// 방향키로 다른 선택지를 고른 물음 · 화면 끝 14줄만 남아 제목이 잘린 물음 · 창이 좁아 안내줄이 꺾인 물음도 확인 필요
const perm2 = perm.replace('> 1. Yes, run command', '  1. Yes, run command').replace("  2. Yes, and always allow in this", "> 2. Yes, and always allow in this");
const longCmd = ['Requesting permission for:', ...Array.from({ length: 12 }, (_, i) => `   command line ${i + 1} \\`), 'Run this command?', '> 1. Yes, run command', '  2. Yes, and always allow in this conversation', '  3. Yes, and always allow (Persist to settings.json)', '  4. No, cancel', '  ↑/↓ Navigate · tab Amend · ctrl+g edit/expand command', 'esc to cancel                 plan · Gemini 3.8 Flash · low'];
const cut14 = longCmd.filter((l) => l.trim()).slice(-14).join('\n'); // idleCheck 가 넘기는 만큼
const narrow = perm.replace('  ↑/↓ Navigate · tab Amend · ctrl+g edit/expand command', '  ↑/↓\n  Navigate · tab Amend ·\n  ctrl+g edit/expand command');
eq([S(perm2), S(cut14), S(narrow)], ['attention', 'attention', 'attention'], '권한 물음: 다른 선택지를 고른 때 · 제목이 14줄 밖 · 안내줄이 꺾인 때도 확인 필요');
// 재개 · 바꾸기는 카드의 권한 값으로 다시 명령을 만든다 — 고른 모드가 이어지고, 권한 값이 없는 옛 카드는 지금까지처럼 전부 허용
{
  const conv2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
  const r1 = agents.buildCommand({ agent: 'antigravity', model: 'gemini-4-neon', effort: 'high', permission: 'plan' }, TMP, { resumeId: conv2 }).args.join(' ');
  const r2 = agents.buildCommand({ agent: 'antigravity', model: 'gemini-4-neon', effort: 'high' }, TMP, { resumeId: conv2 }).args.join(' ');
  ok(/--mode plan /.test(r1) && r1.endsWith(`--conversation ${conv2}`) && !/dangerously/.test(r1), '재개: 카드의 권한 모드가 이어짐(--mode plan + --conversation)');
  ok(/--dangerously-skip-permissions /.test(r2) && !/--mode /.test(r2), '재개: 권한 값이 없는 옛 카드 = 전부 허용 그대로');
}
{
  const { parseApproval } = await imp('daemon/approval.mjs');
  const card = ad.promptKeys(parseApproval(perm));
  eq([card.kind, card.question, card.options.map((o) => o.key).join(''), card.options[0].label, card.options[3].label, card.options[3].desc], ['choice', 'Run this command?', '1234', 'Yes, run command', 'No, cancel', ''], '권한 물음 → 확인 카드(선택지 4개 · 숫자 키 · 안내줄은 설명에서 뺌)');
  eq(ad.promptKeys(null), null, '확인 카드 다듬기: 빈 값 그대로');
}

// ── 4. 띄우기 직전 준비(~/.gemini) ──
const cwdA = path.join(TMP, 'work A');
fs.mkdirSync(cwdA, { recursive: true });
eq(setup.trustFolder(cwdA), 'created', '신뢰: 파일 없음 → 만듦');
eq(setup.trustFolder(cwdA.toUpperCase()), 'unchanged', '신뢰: 대소문자만 다른 같은 폴더 = 그대로');
const sfile = path.join(GEM, 'antigravity-cli', 'settings.json');
fs.writeFileSync(sfile, JSON.stringify({ theme: 'x', trustedWorkspaces: ['C:\\other'] }), 'utf8');
eq(setup.trustFolder(cwdA), 'appended', '신뢰: 덧붙임');
const sj = JSON.parse(fs.readFileSync(sfile, 'utf8'));
eq([sj.theme, sj.trustedWorkspaces[0], sj.trustedWorkspaces.length], ['x', 'C:\\other', 2], '신뢰: 다른 키 · 다른 폴더 보존');
ok(fs.readdirSync(path.dirname(sfile)).some((f) => f.startsWith('settings.json.iris-bak-')), '신뢰: 바꾸기 전 사본');
fs.writeFileSync(sfile, '{ 깨짐', 'utf8');
eq(setup.trustFolder(cwdA), 'skipped:unreadable', '신뢰: 깨진 파일은 건드리지 않음');
eq(fs.readFileSync(sfile, 'utf8'), '{ 깨짐', '신뢰: 깨진 파일 그대로');
// 전역 지침
const fakeRoot = path.join(TMP, 'iris'); fs.mkdirSync(fakeRoot, { recursive: true });
fs.writeFileSync(path.join(fakeRoot, 'AGENTS.md'), '# x\n## 🔴 프록시 우회 금지\n- 직결 금지\n## 보통 절\n## 🔴 프로세스 종료 규칙 — 이름 기반 일괄 킬 금지 (2026-09-11 사용자 결정)\n', 'utf8');
eq(setup.ensureRules(fakeRoot), 'created', '지침: 없음 → 만듦');
const rtext = fs.readFileSync(path.join(GEM, 'AGENTS.md'), 'utf8');
ok(rtext.startsWith(setup.RULES_MARK) && rtext.includes('- **🔴 프록시 우회 금지**') && rtext.includes('  - 직결 금지') && rtext.includes('- **🔴 프로세스 종료 규칙 — 이름 기반 일괄 킬 금지**') && !rtext.includes('보통 절'), '지침: 표식 · 🔴 제목과 본문 앞줄 · 날짜 꼬리 뗌 · 다른 절 없음');
eq(setup.ensureRules(path.join(TMP, 'no-such-root')), 'skipped:no-root', '지침: 루트를 못 읽으면 빈 안내를 만들지 않음');
ok(Buffer.byteLength(rtext, 'utf8') <= setup.RULES_MAX_BYTES, '지침: 8KB 이하');
eq(setup.ensureRules(fakeRoot), 'unchanged', '지침: 같으면 그대로');
fs.writeFileSync(path.join(GEM, 'AGENTS.md'), '# 사용자가 쓴 지침\n', 'utf8');
eq(setup.ensureRules(fakeRoot), 'skipped:user-file', '지침: 표식 없는 파일은 건드리지 않음');
eq(fs.readFileSync(path.join(GEM, 'AGENTS.md'), 'utf8'), '# 사용자가 쓴 지침\n', '지침: 사용자 파일 그대로');
{ // 실제 루트 지침으로 만들면 크기 안에 들어가는가
  const realRoot = [path.resolve(ROOT, '..', '..', '..'), 'C:\\IRIS'].find((r) => fs.existsSync(path.join(r, 'AGENTS.md')) && /## 🔴/.test(fs.readFileSync(path.join(r, 'AGENTS.md'), 'utf8'))) || '';
  if (fs.existsSync(path.join(realRoot, 'AGENTS.md'))) ok(Buffer.byteLength(setup.rulesText(realRoot), 'utf8') <= setup.RULES_MAX_BYTES, '지침: 실제 루트로 만들어도 8KB 이하');
}
// 안전 훅
eq(setup.ensureHooks(fakeRoot, 'py'), 'skipped:no-bridge', '훅: 다리 스크립트 없으면 안 씀');
fs.mkdirSync(path.join(fakeRoot, '_agent', 'claude', 'scripts'), { recursive: true }); fs.writeFileSync(setup.bridgeScript(fakeRoot), '', 'utf8');
eq(setup.ensureHooks(fakeRoot, 'py'), 'created', '훅: 없음 → 만듦');
const hfile = path.join(GEM, 'config', 'hooks.json');
let hj = JSON.parse(fs.readFileSync(hfile, 'utf8'));
eq([Object.keys(hj), hj['iris-safety'].PreToolUse[0].matcher], [['iris-safety'], '.*'], '훅: 이름 붙인 항목 하나 · 도구 넷');
eq(setup.ensureHooks(fakeRoot, 'py'), 'unchanged', '훅: 같으면 그대로');
fs.writeFileSync(hfile, JSON.stringify({ mine: { Stop: [{ type: 'command', command: 'x' }] } }), 'utf8');
eq(setup.ensureHooks(fakeRoot, 'py'), 'set', '훅: 남의 항목이 있으면 우리 항목만 더함');
hj = JSON.parse(fs.readFileSync(hfile, 'utf8'));
eq(Object.keys(hj), ['mine', 'iris-safety'], '훅: 남의 항목 보존');
fs.writeFileSync(hfile, '[1,2]', 'utf8');
eq(setup.ensureHooks(fakeRoot, 'py'), 'skipped:not-object', '훅: 모양이 다르면 안 씀');
// 준비가 안 되면 세션을 띄우지 않는다
let p = setup.prepare(cwdA, fakeRoot);
ok(!p.ok && /가드 파일 없음/.test(p.why) && /안전 훅을 넣지 못함/.test(p.why), `준비: 가드 없음 · 훅 실패 = 막음 (${p.why})`);
for (const f of ['guard-iris-path.py', 'block-blanket-kill.ps1']) fs.writeFileSync(path.join(fakeRoot, '_agent', 'claude', 'scripts', f), '', 'utf8');
fs.writeFileSync(hfile, '{}', 'utf8');
fs.writeFileSync(path.join(GEM, 'AGENTS.md'), '# 사용자가 쓴 지침\n', 'utf8');
p = setup.prepare(cwdA, fakeRoot, { selfTest: () => '' });
ok(p.ok, `준비: 가드 · 훅 · 시험 호출 통과 · (사용자 지침 존중) = 띄움 (${p.why || p.line})`);
p = setup.prepare(cwdA, fakeRoot, { selfTest: () => '안전 다리 시험 호출이 막지 않음(allow)' });
ok(!p.ok && /시험 호출/.test(p.why), '준비: 다리가 실제로 막지 않으면 막음');
p = setup.prepare(cwdA, fakeRoot); // 진짜 시험 호출 — 빈 가짜 다리는 아무것도 출력하지 않으므로 막혀야 한다
ok(!p.ok && /시험 호출/.test(p.why), `준비: 빈 다리 = 시험 호출 실패로 막음 (${p.why})`);
if (fs.existsSync('C:\\IRIS\\_agent\\claude\\scripts\\agy-hook-bridge.py')) eq(setup.bridgeWorks('C:\\IRIS'), '', '이 PC 의 진짜 다리 = 시험 호출에서 막음(통과)');
fs.rmSync(path.join(GEM, 'AGENTS.md'));
p = setup.prepare(cwdA, path.join(TMP, 'no-such-root'));
ok(!p.ok, '준비: 루트 지침을 못 읽으면 막음');
let thrown = null; try { ad.preTrust(cwdA); } catch (e) { thrown = e.code; }
eq(thrown, 'AGY_NOT_READY', '띄우기 직전: 실제 루트에 가드가 없으면(시험 환경) 던져서 막음');

// ── 5. 대화 짝짓기(이 카드의 --log-file 만 근거) ──
{
  const sessions = new Map(), live = new Map(); let saved = 0; const logs = [];
  const sm = { sessions, live, save: () => { saved++; }, hooks: { onList: () => {}, onLog: (m) => logs.push(m) } };
  const mk = (id) => { const cmd = agents.buildCommand({ agent: 'antigravity' }, cwdA); const r = { id, agent: 'antigravity', cwd: cwdA, cmdline: cmd.cmdline, sessionId: null, recordPath: null }; sessions.set(id, r); live.set(id, {}); return [r, cmd.args[cmd.args.indexOf('--log-file') + 1]]; };
  const [a, logA] = mk('s1'), [b, logB] = mk('s2'), [d] = mk('s3');
  ad.watchRecord(sm, 's1', a); ad.watchRecord(sm, 's2', b); ad.watchRecord(sm, 's3', d);
  fs.mkdirSync(path.dirname(logA), { recursive: true });
  fs.writeFileSync(logA, 'I1123 x server.go:1] Created conversation ' + conv + ' (backend=X)\n', 'utf8');
  fs.writeFileSync(logB, 'I1123 x server.go:1] Created conversation ' + conv + ' (backend=X)\n', 'utf8');
  await wait(2600);
  eq([a.sessionId, a.recordPath === ad.transcriptOf(conv), a.resumeCmd], [conv, true, `agy --conversation ${conv}`], '짝짓기: 자기 기록 파일의 대화 id');
  eq(b.sessionId, null, '짝짓기: 다른 카드가 가진 id 는 받지 않음');
  eq(d.sessionId, null, '짝짓기: 기록 파일에 아직 없으면 잇지 않음');
  live.delete('s3'); live.delete('s2');
  const orphan = { id: 's9', agent: 'antigravity', cwd: cwdA, cmdline: 'agy --model x', sessionId: null };
  ad.watchRecord(sm, 's9', orphan);
  ok(orphan.sessionId === null && logs.some((m) => m.includes('기록 파일을 모름')), '짝짓기: 기록 파일을 모르면 잇지 않고 알림');
  const resumed = { id: 's8', agent: 'antigravity', sessionId: conv, recordPath: null };
  ad.watchRecord(sm, 's8', resumed);
  eq(resumed.recordPath, ad.transcriptOf(conv), '재개: id 로 기록 경로');
}

// ── 6. 로그인 · 한도 · 모델 목록 ──
const usageOk = JSON.stringify({ status: 'SUCCESS', command: { data: { groups: [{ name: 'Gemini Models', buckets: [{ id: 'gemini-weekly', name: 'W', window: 'weekly', remaining_fraction: 0.25, reset_time: '2026-11-30T02:00:00Z' }] }, { name: 'Gemini 4 Argon', buckets: [{ id: 'argon-weekly', window: 'weekly', remaining_fraction: 1.7, reset_time: 'x' }] }] } } });
const u = st.parseUsage(usageOk);
eq([u.state, u.groups.length, u.groups[1].buckets[0].remaining], ['ok', 2, 1], '한도: 해석 · 비율은 0~1 로 자름');
eq(st.headline(u).group, 'Gemini 4 Argon', '한도: 배터리 = Argon 주간 먼저');
eq(st.parseUsage('', { code: 1, stderr: 'Please sign in to view available models' }).state, 'auth', '로그인 안 됨');
eq(st.parseUsage('', { code: 1, stderr: 'timed out waiting for available models' }).state, 'unknown', '시간 초과 = 모름(로그아웃 아님)');
eq(st.parseUsage('{"status":"ERROR"}').state, 'unknown', '모르는 답 = 모름');
eq(st.brief().state, 'unknown', '상태: 아직 안 물었으면 모름');
fs.rmSync(path.join(FAKE_LA, 'agy'), { recursive: true, force: true });
eq((await st.refresh()).state, 'missing', '상태: 실행 파일 없음 = 프로그램 없음');
eq(JSON.parse(fs.readFileSync(process.env.IRIS_AGY_STATUS_FILE, 'utf8')).state, 'missing', '상태: 없음도 파일에 적음(대시보드가 옛 로그인됨을 붙들지 않게)');
ok(!('mergeStatus' in st), '상태: 클로드 · 코덱스 상태 객체에 섞는 함수가 없음(따로 보냄)');
{ // 서버가 /api/agents/status 와 agents 방송에 원래 agentStatus() 를 그대로 쓰는가(소스 확인)
  const src = fs.readFileSync(path.join(ROOT, 'daemon', 'server.mjs'), 'utf8');
  ok(/p === '\/api\/agents\/status'\) return json\(res, 200, agentStatus\(\)\)/.test(src) && /const agentsMsg = \(status = agentStatus\(\)\) => \(\{ type: 'agents', agents: activeAgentsMap\(AGENTS\), sleeping: status\.sleeping, status \}\);/.test(src), '서버: 클로드 · 코덱스 상태 계약 그대로');
}
fs.mkdirSync(path.join(FAKE_LA, 'agy', 'bin'), { recursive: true }); fs.writeFileSync(path.join(FAKE_LA, 'agy', 'bin', 'agy.exe'), '');
eq(st.parseModels('Fetching available models...\ngemini-4-argon-high\tGemini 4 Argon (High)\n\nbad line\ngpt-oss-120b-medium\tGPT-OSS 120B (Medium)\r\n'), [{ id: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High)' }, { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' }], '모델 목록 해석');
eq(ad.titleCommand({}).skip ? 'skip' : 'run', 'skip', '제목 생성 = 하지 않음(첫 요청 제목)');
eq([ad.subagentDirs(), ad.addSubagent(), ad.subagentDone(), ad.subagentEndedAt()], [[], false, false, null], '보조 작업 = 미지원(계약만)');

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
console.log(`${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
