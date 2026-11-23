// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 에이전트 어댑터(세션 띄우기 직전 준비) — Antigravity. ~/.gemini 아래에 IRIS 가 쓰는 것은 셋뿐이고, 모두 "없는 것만 더하고 남의 것은 그대로"다.
//   ① 폴더 신뢰   ~/.gemini/antigravity-cli/settings.json 의 trustedWorkspaces 에 이 폴더가 없으면 덧붙임(다른 키 · 다른 폴더 그대로, 바꾸기 전 사본)
//   ② 전역 지침   ~/.gemini/AGENTS.md — 첫 줄에 IRIS 표식이 있는 파일만 IRIS 가 쓴다. 표식 없는 파일(사용자가 쓴 것)은 건드리지 않는다.
//                 까닭(2026-11-23 실측): 안티그래비티는 C:\IRIS\AGENTS.md(116KB)를 24,000 바이트에서 잘라 받는다 → 🔴 규칙 대부분이 빠진다.
//   ③ 안전 훅     ~/.gemini/config/hooks.json 의 이름 붙인 항목 `iris-safety` 하나(다른 항목 그대로, 바꾸기 전 사본).
//                 다리 스크립트(_agent\claude\scripts\agy-hook-bridge.py)가 기존 가드 둘(경로 · 일괄 종료)을 무수정으로 부른다.
// 설계 = D09 안티그래비티-입점설계 4절 '노트북 단계 구현 기록' 조각 ⑦ · ⑧. 이 파일의 함수는 절대 던지지 않는다(결과 글자만 돌려준다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { soulRoot } from '../paths.mjs';

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
  return String(rootText || '').split(/\r?\n/).filter((l) => /^##\s+🔴/.test(l)).map((l) => l.replace(/^##\s+/, '').replace(/\s*\((?:20\d\d-\d\d-\d\d)[^)]*\)\s*$/, '').trim());
}
export function rulesText(root = soulRoot()) {
  const rootFile = path.join(root, 'AGENTS.md');
  let rootText = ''; try { rootText = fs.readFileSync(rootFile, 'utf8'); } catch {}
  const size = Buffer.byteLength(rootText, 'utf8');
  const heads = redHeadings(rootText);
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
    '## 루트 지침의 🔴(반드시 지킬) 절 — 제목만. 내용은 루트 지침에서 읽는다',
    ...heads.map((h) => `- ${h}`),
    '',
  ];
  let text = lines.join('\n');
  while (Buffer.byteLength(text, 'utf8') > RULES_MAX_BYTES && lines.length > 12) { lines.splice(lines.length - 2, 1); text = lines.join('\n'); }
  return text;
}
export function ensureRules(root = soulRoot()) {
  try {
    const file = path.join(geminiDir(), 'AGENTS.md');
    const want = rulesText(root);
    if (fs.existsSync(file)) {
      let have; try { have = fs.readFileSync(file, 'utf8'); } catch { return 'skipped:unreadable'; }
      if (!have.startsWith(RULES_MARK)) return 'skipped:user-file';
      if (have === want) return 'unchanged';
      writeAtomic(file, want); return 'updated';
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
    PreToolUse: [{
      matcher: 'run_command|write_to_file|replace_file_content|multi_replace_file_content',
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

/** 세션을 띄우기 직전 한 번에: 결과 글자 셋을 한 줄로(로그용). 모두 바뀐 것이 없으면 'unchanged'. */
export function prepare(cwd) {
  const r = { trust: trustFolder(cwd), rules: ensureRules(), hooks: ensureHooks() };
  const changed = Object.entries(r).filter(([, v]) => v !== 'unchanged');
  return changed.length ? changed.map(([k, v]) => `${k}=${v}`).join(' ') : 'unchanged';
}
