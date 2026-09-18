// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 폴더 신뢰 선답(daemon/trust.mjs) + 확인 카드 키 나누기(sessions.mjs splitArrowEnter) 무접촉 검사 — 임시 폴더만 쓴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { trustClaude, trustCodex, preTrust, claudeProjectKey, codexProjectKey } from '../daemon/trust.mjs';
import { splitArrowEnter } from '../daemon/sessions.mjs';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-trust-'));
const cwd = path.join(tmp, 'R01-교사(Teacher)', 'D01-수업');
fs.mkdirSync(cwd, { recursive: true });

// ---- 키 ----
ok(claudeProjectKey('C:\\IRIS\\a\\') === 'C:/IRIS/a', '클로드 키 = 슬래시·끝 구분자 제거');
ok(codexProjectKey('C:/IRIS/A/') === 'c:\\iris\\a', '코덱스 키 = 소문자·역슬래시');

// ---- 클로드: 없던 파일 → 만든다 ----
const cdir = path.join(tmp, 'claude');
ok(trustClaude(cwd, cdir) === 'created', '클로드 .claude.json 새로 만듦');
let j = JSON.parse(fs.readFileSync(path.join(cdir, '.claude.json'), 'utf8'));
ok(j.hasCompletedOnboarding === true && j.projects[claudeProjectKey(cwd)].hasTrustDialogAccepted === true, '클로드 신뢰 키 두 개');
ok(trustClaude(cwd, cdir) === 'unchanged', '클로드 두 번째 = 변경 없음');
// 기존 값 보존 + 다른 프로젝트 추가
fs.writeFileSync(path.join(cdir, '.claude.json'), JSON.stringify({ oauthAccount: { id: 'keep' }, hasCompletedOnboarding: false, projects: { 'C:/x': { allowedTools: ['a'] } } }), 'utf8');
ok(trustClaude('C:\\x', cdir) === 'added', '클로드 기존 프로젝트에 키 추가');
j = JSON.parse(fs.readFileSync(path.join(cdir, '.claude.json'), 'utf8'));
ok(j.oauthAccount.id === 'keep' && j.hasCompletedOnboarding === false && j.projects['C:/x'].allowedTools[0] === 'a' && j.projects['C:/x'].hasTrustDialogAccepted === true, '클로드 있는 값은 그대로(hasCompletedOnboarding=false 유지)');
fs.writeFileSync(path.join(cdir, '.claude.json'), '{ broken', 'utf8');
ok(trustClaude(cwd, cdir) === 'skipped:unreadable' && fs.readFileSync(path.join(cdir, '.claude.json'), 'utf8') === '{ broken', '클로드 깨진 파일은 손대지 않음');

// ---- 코덱스 ----
const xdir = path.join(tmp, 'codex');
ok(trustCodex(cwd, xdir) === 'created', '코덱스 config.toml 새로 만듦');
let t = fs.readFileSync(path.join(xdir, 'config.toml'), 'utf8');
ok(t.includes(`[projects.'${codexProjectKey(cwd)}']`) && t.includes('trust_level = "trusted"'), '코덱스 신뢰 표');
ok(trustCodex(cwd, xdir) === 'unchanged', '코덱스 두 번째 = 변경 없음');
fs.writeFileSync(path.join(xdir, 'config.toml'), 'model = "x"\n[projects."c:\\\\iris\\\\y"]\ntrust_level = "trusted"', 'utf8');
ok(trustCodex('C:\\IRIS\\y', xdir) === 'unchanged', '코덱스 큰따옴표 표기도 같은 표로 인정');
ok(trustCodex('C:\\IRIS\\z', xdir) === 'appended', '코덱스 다른 폴더는 덧붙임');
t = fs.readFileSync(path.join(xdir, 'config.toml'), 'utf8');
ok(t.startsWith('model = "x"\n') && t.includes(`[projects.'c:\\iris\\z']`), '코덱스 있는 줄은 그대로');

// ---- preTrust: env 우선, 없으면 fallback, 절대 던지지 않음 ----
const r1 = preTrust({ agent: 'claude', cwd, env: { CLAUDE_CONFIG_DIR: path.join(tmp, 'c2') }, fallback: { claudeConfigDir: cdir } });
ok(r1.result === 'created' && fs.existsSync(path.join(tmp, 'c2', '.claude.json')), 'preTrust 클로드 = env 의 CLAUDE_CONFIG_DIR');
const r2 = preTrust({ agent: 'codex', cwd, env: {}, fallback: { codexHome: path.join(tmp, 'x2') } });
ok(r2.result === 'created' && fs.existsSync(path.join(tmp, 'x2', 'config.toml')), 'preTrust 코덱스 = fallback CODEX_HOME');
ok(preTrust({ agent: 'claude', cwd, env: {}, fallback: {} }).result === 'skipped:no-dir', 'preTrust 폴더 없으면 건너뜀');

// ---- 키 나누기 ----
ok(JSON.stringify(splitArrowEnter('\x1b[B\r')) === JSON.stringify(['\x1b[B', '\r']), '↓+Enter → 두 조각');
ok(JSON.stringify(splitArrowEnter('\x1b[A\x1b[A\r')) === JSON.stringify(['\x1b[A\x1b[A', '\r']), '↑↑+Enter → 두 조각');
ok(splitArrowEnter('\r') === null && splitArrowEnter('2\r') === null && splitArrowEnter('\x1b[B') === null && splitArrowEnter('\x1b') === null, '그 밖의 입력은 그대로');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
