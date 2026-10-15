// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 인증(v2.84) 검사 — 실 데몬·실 열쇠·네트워크 접촉 0. 사용: node scripts/check-auth.mjs
//   1절 1년 열쇠 주입(살아 있음·곧 끝남·없음·끔·값이 돌려주는 값에 없음) · 2절 가리기 · 3절 가짜 도구로 AuthWatch 상태·방송
//   4절 가짜 발급 도구로 갱신 흐름(진행 줄에 열쇠·주소 없음, 끝나면 done 방송) · 5절 화면 코드에 열쇠 필드 이름 없음
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLongKey, longKeyFile, scrub, AuthWatch } from '../daemon/auth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SECRET = 'sk-ant-oat01-' + 'x'.repeat(80);
const NOW = 1_800_000_000_000;

// ---- 1절 주입 ----
{
  const read = (k) => () => JSON.stringify(k);
  const env = {};
  const r = applyLongKey(env, { now: NOW, read: read({ token: SECRET, expiresAt: NOW + 86400e3 }) });
  ok(r.applied && env.CLAUDE_CODE_OAUTH_TOKEN === SECRET, '1 살아 있는 열쇠 → env 에 들어감');
  ok(!JSON.stringify(r).includes(SECRET), '1 돌려주는 값에 열쇠 없음');
  const e2 = {}; ok(!applyLongKey(e2, { now: NOW, read: read({ token: SECRET, expiresAt: NOW + 30e3 }) }).applied && !e2.CLAUDE_CODE_OAUTH_TOKEN, '1 1분 안에 끝나는 열쇠 → 안 넣음');
  const e3 = {}; ok(applyLongKey(e3, { now: NOW, read: () => { throw new Error('ENOENT'); } }).reason === 'none' && !e3.CLAUDE_CODE_OAUTH_TOKEN, '1 파일 없음 → 안 넣음');
  const e4 = {}; ok(applyLongKey(e4, { now: NOW, off: true, read: read({ token: SECRET, expiresAt: NOW + 86400e3 }) }).reason === 'off', '1 IRIS_FACE_LONGKEY=0 → 끔');
  ok(longKeyFile({ CLAUDE_CONFIG_DIR: 'C:\\X' }).endsWith(path.join('C:\\X', 'secrets', 'iris-cli-token.json')), '1 열쇠 파일 자리 = <설정 폴더>\\secrets');
  ok(longKeyFile({}, 'C:\\Y').startsWith('C:\\Y'), '1 env 에 설정 폴더가 없으면 데몬의 설정 폴더');
}

// ---- 2절 가리기 ----
ok(!scrub(`발급 ${SECRET} 끝`).includes('x'.repeat(40)), '2 sk-ant 토막 가림');
ok(scrub('만료 2027-10-15') === '만료 2027-10-15', '2 보통 글은 그대로');

// ---- 3·4절 가짜 도구 ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-auth-check-'));
const items = [
  { id: 'iris:login', group: 'iris', provider: 'anthropic', name: 'me@example.com', label: 'IRIS 로그인', longKey: false, expiresAt: NOW + 86400e3, daysLeft: 1, level: 'soon', renew: 'claude-login', optional: false },
  { id: 'tc:anthropic:a@example.com', group: 'teamclaude', provider: 'anthropic', name: 'a@example.com', label: 'a', longKey: false, expiresAt: NOW + 20 * 86400e3, daysLeft: 20, level: 'ok', renew: 'teamclaude-login', optional: false },
];
fs.writeFileSync(path.join(dir, 'status.mjs'), `process.stdout.write(JSON.stringify(${JSON.stringify({ items, worst: 'soon', due: ['iris:login'], nextExpiry: null })})+'\\n');`);
fs.writeFileSync(path.join(dir, 'longkey.mjs'), [
  "console.log('브라우저에서 승인해 주세요.');",
  "console.log('https://claude.ai/oauth/authorize?state=abc');",
  `console.log('발급 완료 ${SECRET}');`,
  "console.log('RESULT ' + JSON.stringify({ ok: true, email: 'me@example.com', expiresAt: 1 }));",
].join('\n'));
const sent = [];
const w = new AuthWatch({ dir, broadcast: (o) => sent.push(JSON.parse(JSON.stringify(o))) });
ok(w.available, '3 도구 폴더 있음 → available');
const info = await w.refresh();
ok(info?.worst === 'soon' && info.items.length === 2, '3 status.mjs --json 결과를 읽음');
ok(sent.length === 1 && sent[0].type === 'auth', '3 상태가 바뀌면 방송 1번');
await w.refresh();
ok(sent.length === 1, '3 같은 상태면 다시 방송하지 않음');
ok(!new AuthWatch({ dir: null }).available, '3 도구 없음 → 기능 끔');
ok((await new AuthWatch({ dir: null }).renew('x')).ok === false, '3 도구 없으면 갱신 거절');

const r = await w.renew('iris:login');
ok(r.ok && r.started === 'iris-longkey', '4 IRIS 항목 → 1년 열쇠 발급 시작');
ok((await w.renew('iris:login')).ok === false, '4 진행 중에는 두 번째 갱신 거절');
for (let i = 0; i < 80 && !sent.some(m => m.done); i++) await sleep(100);
const all = JSON.stringify(sent);
ok(w.job && !w.job.running && w.job.result?.ok === true, '4 RESULT 줄로 끝 판정');
ok(!all.includes('x'.repeat(40)), '4 방송에 열쇠 토막 없음');
ok(!all.includes('oauth/authorize'), '4 방송에 승인 주소(state 포함) 없음');
ok(sent.some(m => m.done === true), '4 끝나면 done 방송');
ok((await w.renew('nope')).ok === false, '4 모르는 항목 거절');
await sleep(300); // 도구 자식 프로세스의 작업 폴더가 풀리길 기다린다(윈도 EPERM)
try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* 임시 폴더 — 남아도 무해 */ }

// ---- 5절 화면 코드 ----
const ui = fs.readFileSync(path.join(ROOT, 'app', 'settings.js'), 'utf8');
ok(!/\.token\b|CLAUDE_CODE_OAUTH_TOKEN/.test(ui), '5 화면 코드는 열쇠 필드를 다루지 않음');
ok(/st-auth-sec/.test(fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8')), '5 설정 서랍에 인증 절 있음');
ok(!/TeamClaude/.test(ui.slice(ui.indexOf('// ---- 인증'), ui.indexOf('// ---- 정보'))), '5 인증 절 사용자 글에 "TeamClaude" 없음');

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
