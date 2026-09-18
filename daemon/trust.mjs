// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 폴더 신뢰 물음을 미리 답한다(2026-09-19, 실제 사용자 실측: 첫 설치 뒤 "Do you trust the files in this folder?" 가
// 대화 화면에 떠서 누르는 대로 되지 않았다). Face 가 여는 세션은 사용자가 고른 폴더에서 최대 권한으로 도는 것이
// 설계이므로(2026-09-14 결정), CLI 가 그 폴더를 처음 볼 때 묻는 신뢰 물음은 여기서 같은 답("예")을 미리 적어 둔다.
//
//   클로드: <CLAUDE_CONFIG_DIR>\.claude.json — projects["<cwd, 슬래시>"].hasTrustDialogAccepted = true (+ 첫 실행 안내 2키)
//   코덱스: <CODEX_HOME>\config.toml       — [projects.'<cwd, 소문자·역슬래시>'] trust_level = "trusted"
//
// 규칙: 있는 값은 절대 바꾸지 않는다(빠진 키만 더한다). 파일을 읽지 못하면 손대지 않는다. 쓰기는 임시 파일 → 이름 바꾸기.
// 키 이름·모양은 설치 패키지 `installer/lib/firstrun.mjs` 와 같다(그쪽은 설치 폴더 하나, 여기는 세션마다 그 폴더).
import fs from 'node:fs';
import path from 'node:path';

export const claudeProjectKey = (cwd) => String(cwd).replace(/\\/g, '/').replace(/\/+$/, '');
export const codexProjectKey = (cwd) => String(cwd).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

/** 클로드: .claude.json 에 이 폴더의 신뢰 답을 더한다. → 'created' | 'added' | 'unchanged' | 'skipped:<why>' */
export function trustClaude(cwd, configDir) {
  if (!cwd || !configDir) return 'skipped:no-dir';
  const file = path.join(configDir, '.claude.json');
  const key = claudeProjectKey(cwd);
  let data = null;
  if (fs.existsSync(file)) {
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return 'skipped:unreadable'; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'skipped:not-object';
  }
  const fresh = data == null;
  if (fresh) data = {};
  let changed = false;
  if (data.hasCompletedOnboarding === undefined) { data.hasCompletedOnboarding = true; changed = true; }
  if (data.projects === undefined || data.projects === null || typeof data.projects !== 'object') { if (data.projects === undefined) { data.projects = {}; changed = true; } else return 'skipped:projects-not-object'; }
  const p = data.projects[key];
  if (p === undefined) { data.projects[key] = { hasTrustDialogAccepted: true }; changed = true; }
  else if (p && typeof p === 'object' && p.hasTrustDialogAccepted === undefined) { p.hasTrustDialogAccepted = true; changed = true; }
  if (!changed) return 'unchanged';
  writeAtomic(file, JSON.stringify(data, null, 2) + '\n');
  return fresh ? 'created' : 'added';
}

/** 코덱스: config.toml 에 이 폴더의 [projects.'…'] 표를 덧붙인다. → 'created' | 'appended' | 'unchanged' | 'skipped:<why>' */
export function trustCodex(cwd, codexHome) {
  if (!cwd || !codexHome) return 'skipped:no-dir';
  const file = path.join(codexHome, 'config.toml');
  const key = codexProjectKey(cwd);
  const block = `[projects.'${key}']\ntrust_level = "trusted"\n`;
  if (!fs.existsSync(file)) { writeAtomic(file, block); return 'created'; }
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return 'skipped:unreadable'; }
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tableRe = new RegExp(`^\\s*\\[projects\\.(?:'${reEsc(key)}'|"${reEsc(key.replace(/\\/g, '\\\\'))}"|${reEsc(key)})\\]`, 'im');
  if (tableRe.test(text)) return 'unchanged';
  const sep = text.length === 0 || text.endsWith('\n') ? '' : '\n';
  fs.appendFileSync(file, `${sep}\n${block}`, 'utf8');
  return 'appended';
}

/** 세션을 띄우기 직전에 부른다. env 는 자식에게 줄 환경(영수증이 채운 CLAUDE_CONFIG_DIR·CODEX_HOME 포함). 절대 던지지 않는다. */
export function preTrust({ agent, cwd, env = {}, fallback = {} }) {
  try {
    if (agent === 'codex') return { agent, result: trustCodex(cwd, env.CODEX_HOME || fallback.codexHome) };
    return { agent: 'claude', result: trustClaude(cwd, env.CLAUDE_CONFIG_DIR || fallback.claudeConfigDir) };
  } catch (e) { return { agent, result: `skipped:${String(e?.message || e)}` }; }
}
