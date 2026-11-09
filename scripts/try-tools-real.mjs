// 도구 카탈로그 실제 설치 시험(판 B, 2026-11-10) — 개발 PC 전용. 진짜 claude·codex CLI 로, 짧은 시험 영혼(기본 C:\IRIS-tt) 안에서만
// 설치 → 확인 → 제거 → 확인을 돌린다(이 PC 의 실제 CLAUDE_CONFIG_DIR·CODEX_HOME 은 건드리지 않음). 통과한 항목은 tested 결과 파일에 적는다.
//   node scripts/try-tools-real.mjs [--root C:\IRIS-tt] [--only id,id] [--out tested.json] [--keep]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ToolManager, makeRunner } from '../daemon/toolinstall.mjs';
import { TOOL_CATALOG_FILE } from '../daemon/toolcatalog.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
const ROOT = arg('--root', 'C:\\IRIS-tt');
if (!/^[A-Za-z]:\\IRIS-[a-z0-9]+$/i.test(ROOT) || /^C:\\IRIS$/i.test(ROOT)) { console.error('refusing root', ROOT); process.exit(2); }
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
const OUT = arg('--out', null);
const claudeDir = path.join(ROOT, '_agent', 'claude'), codexDir = path.join(ROOT, '_agent', 'codex');
for (const d of [claudeDir, codexDir, path.join(ROOT, '_agent', 'setup')]) fs.mkdirSync(d, { recursive: true });

// 시험용 카탈로그 사본: tested 를 임시로 채워 엔진이 읽게 한다(원본 파일은 그대로)
const cat = JSON.parse(fs.readFileSync(TOOL_CATALOG_FILE, 'utf8'));
for (const it of cat.items) it.tested = it.tested || { at: 'trial' };
const trialCatalog = path.join(ROOT, '_agent', 'setup', 'trial-catalog.json');
fs.writeFileSync(trialCatalog, JSON.stringify(cat, null, 2));

const env = { ...process.env, CLAUDE_CONFIG_DIR: claudeDir, CODEX_HOME: codexDir };
// --path-prepend <폴더;폴더> : 동봉 옛 판 CLI(설치 패키지 잠금판)로 시험할 때 그 폴더를 PATH 앞에
const pre = arg('--path-prepend', null);
if (pre) { const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path'; env[key] = `${pre};${env[key]}`; }
for (const k of Object.keys(env)) if (/^CLAUDE_CODE_/.test(k) || k === 'CLAUDECODE') delete env[k];
const run = makeRunner({ env, killTree: (pid) => spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) });
const ver = (exe) => { const r = spawnSync('cmd.exe', ['/d', '/c', exe, '--version'], { env, encoding: 'utf8' }); return (r.stdout || '').trim().split(/\s/)[0]; };
const versions = { claude: ver('claude'), codex: (spawnSync('cmd.exe', ['/d', '/c', 'codex', '--version'], { env, encoding: 'utf8' }).stdout || '').trim().split(/\s/).pop() };
console.log('versions', versions, 'root', ROOT);

let live = 0; // 열린 세션 수 흉내 — 제거는 실제 화면과 같은 길(세션 있음 → 「제거 대기」 → 세션 0 → processPending)로 시험
const tm = new ToolManager({ root: ROOT, claudeDir, codexDir, catalogFile: trialCatalog, run, log: (m) => console.log('   ', m), liveSessions: () => live });
const results = {};
for (const it of tm.catalog().items) {
  if (ONLY.length && !ONLY.includes(it.id)) continue;
  console.log(`\n=== ${it.id} (${it.kind}, ${it.agents.join('+')})`);
  const t0 = Date.now();
  const before = tm.quickState(it).agents;
  const ins = await tm.install(it.id);
  const mid = tm.quickState(it).agents;
  const present = Object.fromEntries(it.agents.map((a) => [a, tm.presentAsCatalog(it, a)]));
  console.log(`  install ${ins.ok ? 'OK' : 'FAIL ' + ins.error}  state=${JSON.stringify(mid)} asCatalog=${JSON.stringify(present)}`);
  let rem = { ok: false, error: 'skipped' }, after = mid;
  if (ins.ok && !process.argv.includes('--keep')) {
    live = 1;
    const d = await tm.remove(it.id);
    const still = tm.quickState(it);
    const deferredOk = d.ok && d.deferred && still.removeRequested && it.agents.every((a) => still.agents[a] === 'installed');
    console.log(`  remove(세션 열림) ${deferredOk ? 'deferred OK' : 'FAIL ' + JSON.stringify(d)}`);
    live = 0;
    const pp = await tm.processPending();
    const rec = JSON.parse(fs.readFileSync(path.join(ROOT, '_agent', 'setup', 'tools-installed.json'), 'utf8')).items[it.id];
    after = tm.quickState(it).agents;
    rem = deferredOk && pp.ok && !rec ? { ok: true } : { ok: false, error: `deferred=${deferredOk} pending=${JSON.stringify(pp)} rec=${JSON.stringify(rec || null)}` };
    console.log(`  processPending ${rem.ok ? 'OK' : 'FAIL ' + rem.error}  state=${JSON.stringify(after)}`);
  }
  const pass = ins.ok && it.agents.every((a) => mid[a] === 'installed' && present[a]) && (process.argv.includes('--keep') || (rem.ok && it.agents.every((a) => after[a] === 'absent')));
  results[it.id] = { pass, ms: Date.now() - t0, before, mid, after, error: ins.ok ? rem.error || null : ins.error };
  console.log(`  ${pass ? 'PASS' : 'FAIL'} (${Math.round((Date.now() - t0) / 1000)}s)`);
}
const tested = {};
for (const [id, r] of Object.entries(results)) if (r.pass) tested[id] = { at: new Date().toISOString().slice(0, 10), claude: versions.claude, codex: versions.codex, steps: 'install→verify→remove→verify', root: 'trial' };
if (OUT) { const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {}; fs.writeFileSync(OUT, JSON.stringify({ ...prev, ...tested }, null, 2)); console.log(`\ntested → ${OUT}`); }
console.log(`\n${Object.values(results).filter((r) => r.pass).length} PASS / ${Object.values(results).filter((r) => !r.pass).length} FAIL`);
// 하나라도 실패했거나 아무것도 시험하지 않았으면 0 이 아닌 종료 코드(코덱스 코드 검토 2차 B10)
if (!Object.keys(results).length || Object.values(results).some((r) => !r.pass)) process.exitCode = 1;
