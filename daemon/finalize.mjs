// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// finalize.mjs — 세팅가이드(v12)의 마무리(finalize)를 창이 대신 한다(사용자 결정 2026-09-14: "설치 패키지는 사용자가 따로 하는 것이 하나도 없어야").
//
// 배경: 내장 설치 엔진(v7)은 세팅의 마지막을 두 단계로 나눈다. 비서가 살아 있는 동안 새 구성을 옆에 준비만 하고
//   soul-state.json 에 lifecycle=pending-finalize 를 남긴 뒤, "비서가 0개일 때" 소환기(소환하기.cmd)가 finalize-v7 로 갈아 끼운다.
//   그래서 가이드는 사용자에게 "세션을 끄고 소환하기.cmd 를 다시 열라"고 했다. 창 안에서는 그걸 창이 한다.
// 동작: 5초마다 soul-state.json 을 본다 → pending-finalize 이고 _agent\setup\finalize-pipeline.ps1(가이드 v12 내장) 이 있으면
//   ① 모든 세션이 한가(busy 아님)해질 때까지 기다리고 → ② 살아 있는 세션의 CLI 를 끝내고(카드는 남김) → ③ 파이프라인을 돌리고
//   → ④ 같은 카드에서 --resume 으로 이어 열며 결과를 첫 메시지로 넘긴다. 결과 JSON 은 state\finalize.json 에 남긴다.
// 실패·미완(금고 복구 문구 창처럼 사람 손이 필요한 단계 등)은 같은 generationId 로 10분에 한 번만 다시 시도한다. 끄기: IRIS_FACE_AUTO_FINALIZE=0
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export const POLL_MS = 5_000;
export const QUIET_MS = 3_000;          // 마지막 상태 변화 뒤 이만큼 조용해야 "한가"로 본다
export const RETRY_MS = 10 * 60_000;    // 같은 세대 재시도 간격
export const TIMEOUT_MS = 20 * 60_000;  // 파이프라인 최대 실행 시간(기반 도구 내려받기 포함)
export const RESULT_RE = /FINALIZE-PIPELINE-RESULT:\s*(\{.*\})\s*$/m;
export const ENABLED = process.env.IRIS_FACE_AUTO_FINALIZE !== '0';

/** soul-state.json 이 마무리를 기다리는가(lifecycle 또는 bootstrap.stageStatus). 읽기 실패 = false */
export function readPending(root) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(root, 'soul-state.json'), 'utf8'));
    const pending = s?.lifecycle === 'pending-finalize' || s?.bootstrap?.stageStatus === 'pending-finalize';
    return pending ? { pending: true, generationId: String(s?.bootstrap?.generationId || ''), soulId: String(s?.soulId || '') } : { pending: false };
  } catch { return { pending: false }; }
}
export function pipelinePath(root) { return path.join(root, '_agent', 'setup', 'finalize-pipeline.ps1'); }
export function parseResult(text) { const m = RESULT_RE.exec(String(text || '')); if (!m) return null; try { return JSON.parse(m[1]); } catch { return null; } }
/** 이어 열 때 첫 메시지: 결과를 에이전트에게 넘긴다(가이드 v12 2-2절이 이 문장을 읽고 이어간다) */
export function resumeNote(result) {
  const mode = result?.mode || 'unknown';
  if (mode === 'ready') return 'IRIS 창이 세팅 마무리(finalize)를 대신 실행했습니다. 결과: mode=ready, machineReady=true. 사용자에게 세션을 닫거나 소환하기.cmd를 열라고 하지 말고, 가이드의 자동 검사와 완료 보고를 이어가세요.';
  return `IRIS 창이 세팅 마무리(finalize)를 대신 실행했지만 아직 끝나지 않았습니다. 결과: mode=${mode}, machineReady=false, 설명: ${String(result?.explanation || '').slice(0, 400)}. 사용자에게 무엇이 남았는지 쉬운 말로 알려 주고(예: 복구 문구 창), 창이 10분 뒤 다시 시도한다는 것도 말해 주세요. 소환하기.cmd를 열라고 하지 마세요.`;
}

export class Finalizer {
  /** @param {{root:string, sm:object, stateDir:string, log?:Function, broadcast?:Function, run?:Function, now?:Function}} o */
  constructor(o) {
    this.root = o.root; this.sm = o.sm; this.stateDir = o.stateDir;
    this.log = o.log || (() => {}); this.broadcast = o.broadcast || (() => {});
    this.run = o.run || ((script, env) => runPipeline(script, env));   // 시험에서 바꿔 끼운다
    this.now = o.now || (() => Date.now());
    this.running = false; this.timer = null; this.lastStatusAt = this.now(); this.attempts = new Map(); this.last = null;
  }
  file() { return path.join(this.stateDir, 'finalize.json'); }
  /** 세션 상태가 바뀔 때마다 데몬이 부른다 — "조용한 시간" 측정 */
  touch() { this.lastStatusAt = this.now(); }
  start() {
    if (!ENABLED) { this.log('finalize: off (IRIS_FACE_AUTO_FINALIZE=0)'); return false; }
    this.timer = setInterval(() => { this.tick().catch((e) => this.log(`finalize tick error: ${e?.message || e}`)); }, POLL_MS);
    this.timer.unref?.();
    return true;
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  /** 지금 돌릴 조건인가: pending + 스크립트 있음 + 재시도 간격 지남 + 세션 전부 한가(busy 없음) + 조용한 시간 지남 */
  eligible() {
    if (this.running) return { ok: false, why: 'running' };
    const p = readPending(this.root);
    if (!p.pending) return { ok: false, why: 'not-pending' };
    if (!fs.existsSync(pipelinePath(this.root))) return { ok: false, why: 'no-pipeline-script' };
    const key = p.generationId || 'unknown';
    const at = this.attempts.get(key);
    if (at && this.now() - at < RETRY_MS) return { ok: false, why: 'retry-wait' };
    const list = this.sm.list();
    if (list.some((r) => r.status === 'busy')) return { ok: false, why: 'busy' };
    if (this.now() - this.lastStatusAt < QUIET_MS) return { ok: false, why: 'not-quiet' };
    return { ok: true, key, generationId: p.generationId };
  }
  async tick() {
    const e = this.eligible();
    if (!e.ok) return e.why;
    this.running = true; this.attempts.set(e.key, this.now());
    const live = this.sm.list().filter((r) => ['busy', 'idle', 'attention'].includes(r.status) && r.pid);
    const ids = live.map((r) => r.id);
    this.log(`finalize: start generation=${e.generationId || '?'} sessions=${ids.join(',') || 'none'}`);
    this.broadcast({ type: 'finalize', phase: 'start', sessions: ids });
    try {
      // ② 살아 있는 CLI 를 끝낸다(자기 자식 PID 만). 카드는 남는다 → 뒤에서 같은 카드에 --resume.
      for (const r of live) { try { this.sm.pause(r.id); } catch (err) { this.log(`finalize: pause ${r.id} failed: ${err?.message || err}`); } }
      await sleep(1500);
      // ③ 파이프라인
      const env = { ...process.env, CLAUDE_CONFIG_DIR: path.join(this.root, '_agent', 'claude'), CODEX_HOME: path.join(this.root, '_agent', 'codex') };
      const out = await this.run(pipelinePath(this.root), env);
      const result = parseResult(out.text) || { mode: 'failed', machineReady: false, explanation: `no result line (exit ${out.code})`, tail: String(out.text || '').slice(-600) };
      this.last = { at: new Date().toISOString(), generationId: e.generationId, exit: out.code, result, resumed: ids };
      try { fs.mkdirSync(this.stateDir, { recursive: true }); fs.writeFileSync(this.file(), JSON.stringify(this.last, null, 2), 'utf8'); } catch {}
      this.log(`finalize: done mode=${result.mode} exit=${out.code}`);
      this.broadcast({ type: 'finalize', phase: result.mode === 'ready' ? 'ready' : 'pending', result: { mode: result.mode, machineReady: !!result.machineReady, explanation: String(result.explanation || '').slice(0, 300) } });
      // ④ 같은 카드에서 이어 열기 + 결과를 첫 메시지로
      const note = resumeNote(result);
      for (const id of ids) {
        try { this.sm.resume(id, { prompt: note }); this.log(`finalize: resumed ${id}`); }
        catch (err) { this.log(`finalize: resume ${id} failed: ${err?.message || err}`); this.broadcast({ type: 'finalize', phase: 'resume-failed', id, error: String(err?.message || err) }); }
      }
      return result.mode;
    } catch (err) {
      this.log(`finalize: error ${err?.stack || err}`);
      this.broadcast({ type: 'finalize', phase: 'error', error: String(err?.message || err) });
      for (const id of ids) { try { this.sm.resume(id, { prompt: '' }); } catch {} }
      return 'error';
    } finally { this.running = false; }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 실제 실행: Windows PowerShell 5.1(엔진이 5.1 전용) · 창 없음 · 20분 제한. 금고의 복구 문구 창(Windows Forms)은 별도 창으로 뜬다. */
export function runPipeline(script, env) {
  return new Promise((resolve) => {
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = ''; const add = (d) => { text += d.toString('utf8'); if (text.length > 400_000) text = text.slice(-200_000); };
    child.stdout.on('data', add); child.stderr.on('data', add);
    const t = setTimeout(() => { try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {} }, TIMEOUT_MS);
    child.on('close', (code) => { clearTimeout(t); resolve({ code, text }); });
    child.on('error', (e) => { clearTimeout(t); resolve({ code: -1, text: `${text}\nspawn error: ${e.message}` }); });
  });
}
