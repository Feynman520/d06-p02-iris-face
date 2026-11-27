// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 어댑터(세션 띄우기 직전 준비) — Antigravity. ~/.gemini 아래에 IRIS 가 쓰는 것은 셋뿐이고, 모두 "없는 것만 더하고 남의 것은 그대로"다.
//   ① 폴더 신뢰   ~/.gemini/antigravity-cli/settings.json 의 trustedWorkspaces 에 이 폴더가 없으면 덧붙임(다른 키 · 다른 폴더 그대로, 바꾸기 전 사본)
//   ② 전역 지침   ~/.gemini/AGENTS.md — 첫 줄에 IRIS 표식이 있는 파일만 IRIS 가 쓴다. 표식 없는 파일(사용자가 쓴 것)은 건드리지 않는다.
//                 까닭(2026-11-23 실측): 안티그래비티는 작업 폴더 뿌리의 AGENTS.md(116KB)를 24,000 바이트에서 잘라 받는다 → 🔴 규칙 대부분이 빠진다.
//   ③ 안전 훅     ~/.gemini/config/hooks.json 의 이름 붙인 항목 `iris-safety` 하나(다른 항목 그대로, 바꾸기 전 사본).
//                 다리 스크립트(_agent\claude\scripts\agy-hook-bridge.py)가 기존 가드 둘(경로 · 일괄 종료)을 무수정으로 부른다.
// 설계 = D09 안티그래비티-입점설계 4절 '노트북 단계 구현 기록' 조각 ⑦ · ⑧. 이 파일의 함수는 절대 던지지 않는다(결과 글자만 돌려준다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { soulRoot } from '../paths.mjs';
import { isLocked, LOCKED_MESSAGE } from './antigravity.lock.mjs';

/** ~/.gemini (시험은 IRIS_GEMINI_DIR 로 임시 폴더를 준다) */
export const geminiDir = () => process.env.IRIS_GEMINI_DIR || path.join(os.homedir(), '.gemini');
export const cliHome = () => path.join(geminiDir(), 'antigravity-cli');

export const RULES_MARK = '<!-- IRIS-managed: antigravity-rules v1 — 이 줄을 지우면 IRIS 가 이 파일을 더는 고치지 않는다 -->';
export const RULES_MAX_BYTES = 8000;
export const HOOK_NAME = 'iris-safety';

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
/** 바꾸기 전 사본(같은 날 이미 있으면 다시 만들지 않는다 — 처음 모습을 남긴다) */
function backupOnce(file) {
  const d = new Date(); const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const bak = `${file}.iris-bak-${day}`;
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
  return bak;
}
const sameFolder = (a, b) => path.resolve(String(a)).replace(/[\\/]+$/, '').toLowerCase() === path.resolve(String(b)).replace(/[\\/]+$/, '').toLowerCase();

// ───────── ① 폴더 신뢰 ─────────
export function trustFolder(cwd) {
  try {
    if (!cwd) return 'skipped:no-cwd';
    const file = path.join(cliHome(), 'settings.json');
    if (!fs.existsSync(file)) { writeAtomic(file, JSON.stringify({ trustedWorkspaces: [path.resolve(cwd)] }, null, 2) + '\n'); return 'created'; }
    let data; try { data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return 'skipped:unreadable'; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'skipped:not-object';
    const list = data.trustedWorkspaces;
    if (list !== undefined && !Array.isArray(list)) return 'skipped:not-array';
    if ((list || []).some((p) => typeof p === 'string' && sameFolder(p, cwd))) return 'unchanged';
    backupOnce(file);
    data.trustedWorkspaces = [...(list || []), path.resolve(cwd)];
    writeAtomic(file, JSON.stringify(data, null, 2) + '\n');
    return 'appended';
  } catch (e) { return `skipped:${String(e?.message || e)}`; }
}

// ───────── ② 전역 지침 ─────────
/** 루트 지침의 🔴 절 제목(손으로 옮겨 적지 않는다 — 루트가 바뀌면 다음 세션에 따라 바뀐다) */
export function redHeadings(rootText) {
  return redSections(rootText).map((s) => s.title);
}
/** 🔴 절마다 제목 + 본문 앞 몇 줄(목록 줄 · 문장 줄, 줄마다 최대 260자). 코덱스 설계 검토: 제목만으로는 규칙이 안 선다 → 핵심 본문을 직접 싣는다. */
export function redSections(rootText, maxLines = 2) {
  const out = []; let cur = null;
  for (const l of String(rootText || '').split(/\r?\n/)) {
    if (/^##\s/.test(l)) { cur = /^##\s+🔴/.test(l) ? { title: l.replace(/^##\s+/, '').replace(/\s*\((?:20\d\d-\d\d-\d\d)[^)]*\)\s*$/, '').trim(), body: [] } : null; if (cur) out.push(cur); continue; }
    if (!cur || cur.body.length >= maxLines) continue;
    const t = l.trim(); if (!t || /^(#|```|\|)/.test(t)) continue;
    const s = t.replace(/^[-*]\s+/, ''); cur.body.push(s.length > 260 ? s.slice(0, 259) + '…' : s);
  }
  return out;
}
/** 지침 글. 루트 지침을 읽지 못하면 null(빈 안내로 만들지 않는다 — 세션을 막는다). */
export function rulesText(root = soulRoot()) {
  const rootFile = path.join(root, 'AGENTS.md');
  let rootText; try { rootText = fs.readFileSync(rootFile, 'utf8'); } catch { return null; }
  const size = Buffer.byteLength(rootText, 'utf8');
  const secs = redSections(rootText);
  if (!secs.length) return null;
  const lines = [
    RULES_MARK,
    '# IRIS 안에서 일하는 안티그래비티에게 (IRIS 창이 만든 파일)',
    '',
    `- 이 PC 는 IRIS 작업공간이다. 지침의 원본은 폴더마다 있는 \`AGENTS.md\` 이고, 가장 위가 \`${rootFile}\`${size ? `(약 ${Math.round(size / 1024)}KB)` : ''} 이다.`,
    '- **그 루트 지침은 24,000 바이트에서 잘려 들어온다.** 대화의 첫 일을 하기 전에 그 파일을 파일 읽기 도구로 **끝까지**(여러 번 나눠) 읽고 따른다. 잘린 앞부분만으로 일하지 않는다.',
    '- 루트 지침과 이 파일이 다르면 루트 지침이 맞다. 이 파일은 안내일 뿐이다.',
    '- 사용자에게 보이는 답은 한국어로 쓴다.',
    '- 이 세션은 IRIS 창 안에서 돈다. 사용자에게 고르게 할 때는 묻는 도구(ask_question) 대신 답 본문에 번호 선택지를 글로 적는다.',
    '',
    '## 루트 지침의 🔴(반드시 지킬) 절 — 제목과 앞 문장. 전체는 루트 지침에서 읽는다',
  ];
  const head = lines.join('\n') + '\n';
  // 크기 상한 안에서: 먼저 모든 절의 제목 + 본문, 넘치면 뒤 절부터 본문을 한 줄씩 줄인다(제목은 끝까지 남긴다)
  const build = (bodyN) => head + secs.map((s, i) => [`- **${s.title}**`, ...s.body.slice(0, bodyN[i]).map((b) => `  - ${b}`)].join('\n')).join('\n') + '\n';
  const n = secs.map((s) => s.body.length);
  let text = build(n);
  for (let i = secs.length - 1; Buffer.byteLength(text, 'utf8') > RULES_MAX_BYTES && i >= 0; ) { if (n[i] > 0) { n[i]--; text = build(n); } else i--; }
  return text;
}
export function ensureRules(root = soulRoot()) {
  try {
    const file = path.join(geminiDir(), 'AGENTS.md');
    const want = rulesText(root);
    if (want == null) return 'skipped:no-root';
    if (fs.existsSync(file)) {
      let have; try { have = fs.readFileSync(file, 'utf8'); } catch { return 'skipped:unreadable'; }
      if (!have.startsWith(RULES_MARK)) return 'skipped:user-file';
      if (have === want) return 'unchanged';
      backupOnce(file); writeAtomic(file, want); return 'updated';
    }
    writeAtomic(file, want); return 'created';
  } catch (e) { return `skipped:${String(e?.message || e)}`; }
}

// ───────── ③ 안전 훅 ─────────
function findPython() {
  const la = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  for (const v of ['312', '313', '311', '314']) { const p = path.join(la, 'Programs', 'Python', `Python${v}`, 'python.exe'); try { if (fs.statSync(p).isFile()) return p; } catch {} }
  return 'python';
}
export const bridgeScript = (root = soulRoot()) => path.join(root, '_agent', 'claude', 'scripts', 'agy-hook-bridge.py');
export function hookEntry(root = soulRoot(), python = findPython()) {
  return {
    // 모든 도구에 건다 — 도구 이름이 문서(write_to_file)와 실제 1.5.14(write_file · edit_file)가 달라, 이름을 골라 걸면 새어 나갔다(2026-11-23 실측).
    // 어느 도구를 가드에 보낼지는 다리가 이름으로 가른다(읽기 도구는 바로 통과).
    PreToolUse: [{
      matcher: '.*',
      hooks: [{ type: 'command', command: `"${python}" "${bridgeScript(root)}"`, timeout: 30 }],
    }],
  };
}
export function ensureHooks(root = soulRoot(), python) {
  try {
    if (!fs.existsSync(bridgeScript(root))) return 'skipped:no-bridge';
    const file = path.join(geminiDir(), 'config', 'hooks.json');
    const want = hookEntry(root, python);
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
      const existed = fs.existsSync(file);
      writeAtomic(file, JSON.stringify({ [HOOK_NAME]: want }, null, 2) + '\n'); return existed ? 'filled' : 'created';
    }
    let data; try { data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return 'skipped:unreadable'; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'skipped:not-object';
    if (JSON.stringify(data[HOOK_NAME]) === JSON.stringify(want)) return 'unchanged';
    backupOnce(file);
    data[HOOK_NAME] = want;
    writeAtomic(file, JSON.stringify(data, null, 2) + '\n');
    return 'set';
  } catch (e) { return `skipped:${String(e?.message || e)}`; }
}

/** 안전 가드 셋(다리 · 경로 가드 · 일괄 종료 가드)이 제자리에 있는가 */
export function guardsPresent(root = soulRoot()) {
  const dir = path.join(root, '_agent', 'claude', 'scripts');
  return ['agy-hook-bridge.py', 'guard-iris-path.py', 'block-blanket-kill.ps1'].filter((f) => !fs.existsSync(path.join(dir, f)));
}
/**
 * 세션을 띄우기 직전 한 번에. { ok, line, results } — ok=false 면 부르는 쪽이 세션을 띄우지 않는다(코덱스 코드 검토 2번:
 * 안티그래비티 세션은 권한을 묻지 않으므로 안전 훅 · 핵심 지침이 준비되지 않은 채 열면 안 된다).
 * 막는 경우 = 가드 파일이 없음 · 훅을 넣지 못함(skipped:*) · 지침을 만들지 못함(루트를 못 읽음 등 — 사용자가 직접 쓴 전역 지침 파일은 존중해 막지 않음).
 * 폴더 신뢰를 못 적은 것은 막지 않는다(그러면 agy 가 화면에서 묻고 창은 노란불로 보인다).
 */
/**
 * 다리가 **실제로 막는지** 시험 호출(코덱스 재검토: 파일이 있다 ≠ 돈다). IRIS 루트에 낱개 파일을 쓰는 가짜 호출을 넣어 deny 가 나오면 통과.
 * 파이썬 · 가드 둘을 띄우므로 약 1초 — 30분 동안 결과를 기억한다. 실패하면 이유 글자, 통과면 ''.
 */
let selfTestAt = 0, selfTestKey = '', selfTestWhy = '';
export function bridgeWorks(root = soulRoot(), python = findPython()) {
  const key = `${root}|${python}`;
  if (key === selfTestKey && Date.now() - selfTestAt < 30 * 60_000) return selfTestWhy;
  let why = '';
  try {
    // 이름은 루트 허용 목록(IRIS-* · AGENTS.md …)에 걸리지 않는 것으로(가드 ROOT_ALLOW_NEW). 실제로 쓰지는 않는다 — 판정만 받는다.
    const probe = { toolCall: { name: 'write_file', args: { Path: JSON.stringify(path.join(root, 'agy-selftest-probe.txt')), Content: '"x"' } }, workspacePaths: [root] };
    const r = spawnSync(python, [bridgeScript(root)], { input: JSON.stringify(probe), encoding: 'utf8', timeout: 30000, windowsHide: true });
    const line = String(r.stdout || '').trim().split(/\r?\n/).pop() || '';
    let d; try { d = JSON.parse(line).decision; } catch { d = null; }
    if (d !== 'deny') why = `안전 다리 시험 호출이 막지 않음(${d ?? (r.error ? r.error.message : `exit ${r.status}`)})`;
  } catch (e) { why = `안전 다리 시험 호출 실패(${e.message})`; }
  selfTestAt = Date.now(); selfTestKey = key; selfTestWhy = why;
  return why;
}
export function prepare(cwd, root = soulRoot(), { selfTest = bridgeWorks } = {}) {
  // 화면 잠금(antigravity.lock.mjs): 잠겨 있으면 ~/.gemini 에 아무것도 쓰지 않고 다리 시험 호출도 하지 않는다(문턱은 preTrust 맨 앞 — 여기는 한 겹 더)
  if (isLocked()) return { ok: false, why: LOCKED_MESSAGE, results: {}, line: 'locked' };
  const results = { trust: trustFolder(cwd), rules: ensureRules(root), hooks: ensureHooks(root) };
  const missing = guardsPresent(root);
  const why = [];
  if (missing.length) why.push(`가드 파일 없음(${missing.join(', ')})`);
  else { const w = selfTest(root); if (w) why.push(w); }
  if (String(results.hooks).startsWith('skipped:')) why.push(`안전 훅을 넣지 못함(${results.hooks})`);
  if (String(results.rules).startsWith('skipped:') && results.rules !== 'skipped:user-file') why.push(`전역 지침을 만들지 못함(${results.rules})`);
  const changed = Object.entries(results).filter(([, v]) => v !== 'unchanged');
  return { ok: !why.length, why: why.join(' · '), results, line: changed.length ? changed.map(([k, v]) => `${k}=${v}`).join(' ') : 'unchanged' };
}
