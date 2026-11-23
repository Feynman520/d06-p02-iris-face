// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 세션용 플래너 명령 — 손 시험(검사 아님, 2026-11-23 플래너 걸음 10).
// 시험 데몬(3459 · 임시 상태 폴더 · 임시 장부)을 띄우고, 실제 에이전트 세션(이 PC 의 claude · codex — 구독 · 중계기 그대로)을 하나 열어
// "플래너에 추가해 줘"라고 시킨 뒤 임시 장부에 들어가는지 본다. 안내문 · 환경 변수 · PATH · 껍데기 · 창구가 한 줄로 이어지는지 보는 것.
// 진짜 장부 · 진짜 데몬(3458)은 건드리지 않는다. 실제 세션이 돌아 토큰을 쓰므로 npm run verify:* 에는 넣지 않는다.
//   node scripts/try-planner-cli.mjs [claude|codex|both] [세션을 열 폴더(이미 믿는 폴더) — 기본: 이 저장소의 부모 폴더]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3459;                              // 시험 포트만 — 3458(진짜 데몬)에는 말하지 않는다
const B = `http://127.0.0.1:${PORT}`;
const which = process.argv[2] || 'claude';
const cwd = path.resolve(process.argv[3] || path.join(ROOT, '..'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-try-cli-'));
const mods = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-try-cli-mods-'));
fs.writeFileSync(path.join(state, 'settings.json'), JSON.stringify({ voice: { preload: false } }), 'utf8');
fs.writeFileSync(path.join(state, 'sessions.json'), '[]', 'utf8');
fs.writeFileSync(path.join(state, 'planner-rules.json'), JSON.stringify({ intro: 'seen' }), 'utf8');
const day = (n) => { const d = new Date(Date.now() + n * 86400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const post = async (u, body) => { const r = await fetch(`${B}${u}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { code: r.status, out: await r.json().catch(() => ({})) }; };
const rows = async (d) => { const v = await (await fetch(`${B}/api/planner/view?day=${d}`)).json(); return { rows: v.rows || [], proposals: v.proposals || [] }; };

const env = { ...process.env, IRIS_FACE_PORT: String(PORT), IRIS_FACE_STATE: state, IRIS_FACE_MODULES: mods, IRIS_FACE_AUTO_RESUME: '0', IRIS_FACE_UPDATE_CHECK: '0' };
for (const k of Object.keys(env)) if (/^IRIS_PLANNER_/.test(k)) delete env[k]; // 이 스크립트를 IRIS 세션 안에서 돌려도 진짜 데몬의 열쇠가 시험 세션으로 새지 않게
const d = spawn(process.execPath, [path.join(ROOT, 'daemon', 'server.mjs')], { cwd: ROOT, windowsHide: true, stdio: 'ignore', env });
let failed = 0;
try {
  let up = false; for (let i = 0; i < 80 && !up; i++) { await sleep(250); try { up = (await fetch(`${B}/api/health`)).ok; } catch { /* 아직 */ } }
  if (!up) throw new Error(`시험 데몬(${PORT})이 뜨지 않았습니다 — 다른 검사가 그 포트를 쓰는 중인지 보세요.`);
  console.log(`시험 데몬 ${PORT} pid=${d.pid} · 상태 ${state} · 세션 폴더 ${cwd}`);
  for (const agent of which === 'both' ? ['claude', 'codex'] : [which]) {
    const title = `손 시험 회의 ${agent}`; const when = day(2);
    const t0 = Date.now();
    const made = await post('/api/sessions', { cwd, agent, prompt: `플래너에 일정 하나를 넣어 줘. 내가 직접 시키는 것이다. 이름은 "${title}", 날짜는 ${when}, 시각은 14:00 이다. 다른 파일은 읽거나 고치지 말고, 넣은 뒤 결과를 한 줄로만 말해 줘.` });
    if (made.code !== 201) { failed++; console.log(`[${agent}] 세션을 열지 못함: ${made.code} ${JSON.stringify(made.out).slice(0, 200)}`); continue; }
    const id = made.out.id; let hit = null, asProposal = null;
    for (let i = 0; i < 120 && !hit; i++) { await sleep(2000); const v = await rows(when); hit = v.rows.find((r) => String(r.title || '').includes(title)) || null; asProposal = v.proposals.find((p) => String(p.title || '').includes(title)) || null; if (asProposal) break; }
    const sec = ((Date.now() - t0) / 1000).toFixed(0);
    const st = (await (await fetch(`${B}/api/sessions`)).json()).find((s) => s.id === id);
    if (hit) console.log(`[${agent}] OK ${sec}초 — 달력에 들어감: ${hit.time || ''} ${hit.title} (세션 상태 ${st?.status})`);
    else if (asProposal) { failed++; console.log(`[${agent}] 달력이 아니라 제안으로 올라감(--asked 를 붙이지 않음) ${sec}초: ${asProposal.title}`); }
    else {
      failed++; console.log(`[${agent}] 실패 ${sec}초 — 달력에 없음(세션 상태 ${st?.status}${st?.exitReason ? ` · ${st.exitReason}` : ''})`);
      // 왜 안 됐는지: 그 세션의 화면 끝(터미널 글)과 데몬 로그의 관련 줄을 보여 준다(임시 장부 · 시험 세션이라 내용이 드러나도 된다)
      try { const buf = await (await fetch(`${B}/api/sessions/${id}/buffer`)).text(); console.log(`    --- 세션 화면 끝 ---\n${buf.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[^\S\n]+/g, ' ').split(/\n/).filter((l) => l.trim()).slice(-25).map((l) => `    | ${l.slice(0, 160)}`).join('\n')}`); } catch { /* 길이 없음 */ }
      const all = fs.existsSync(path.join(state, 'daemon.log')) ? fs.readFileSync(path.join(state, 'daemon.log'), 'utf8').split(/\r?\n/).filter((l) => new RegExp(`\\b${id}\\b|planner|send|enter`).test(l)).slice(-25) : [];
      for (const l of all) console.log(`    # ${l.slice(0, 200)}`);
    }
    const log = fs.existsSync(path.join(state, 'daemon.log')) ? fs.readFileSync(path.join(state, 'daemon.log'), 'utf8').split(/\r?\n/).filter((l) => /planner-cli|planner:/.test(l)).slice(-6) : [];
    for (const l of log) console.log(`    ${l.replace(/^\S+\s+/, '')}`);
    try { await fetch(`${B}/api/sessions/${id}`, { method: 'DELETE' }); } catch { /* 이미 끝남 */ }
    await sleep(1500);
  }
} catch (e) { failed++; console.log(`오류: ${e?.message || e}`); }
finally {
  // 시험 데몬은 이 스크립트가 띄운 것이다 — 세션을 정리하며 끝내고(전부 종료 길), 그래도 남으면 그 프로세스 하나만 끝낸다
  try { await fetch(`${B}/api/shutdown?wait=1`, { method: 'POST', signal: AbortSignal.timeout(30_000) }); } catch { /* 끝나는 중 */ }
  await sleep(1500); try { d.kill(); } catch { /* 이미 끝남 */ }
  await sleep(500);
  try { fs.rmSync(state, { recursive: true, force: true }); fs.rmSync(mods, { recursive: true, force: true }); } catch { /* 열려 있는 파일 — 임시 폴더라 둔다 */ }
}
process.exit(failed ? 1 : 0);
