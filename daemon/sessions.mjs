// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 세션 관리자: node-pty 세션 생성·입력·크기·종료(PID) · 200KB 링버퍼 · 헤드리스 화면 상태 판정 · sessions.json
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildCommand, normalize, CODEX_HOME } from './agents.mjs';
import { withFaceNote } from './facenote.mjs';
import { titleFromPrompt, clipTitle } from './title.mjs';
import { generateTitle } from './titler.mjs';
import { parseApproval } from './approval.mjs';
import { readReceipt, soulRoot, toolPath } from './paths.mjs';

const require = createRequire(import.meta.url);
const pty = require('node-pty');
const { Terminal: HeadlessTerminal } = require('@xterm/headless');

const BUFFER_MAX = 200 * 1024;
const BUSY_WINDOW_MS = 2000;
// 붙여넣기 뒤 Enter 타이밍(2026-09-10 사고 원인 — docs/구현계획.md v2.21):
//   코덱스 TUI는 빠르게 들어온 글자 묶음을 "붙여넣기 폭주"로 보고, 마지막 글자 뒤 120ms 안에 온 Enter를 전송이 아니라 줄바꿈으로 삼킨다
//   (Windows ConPTY는 괄호 붙여넣기 표식을 키 입력으로 풀어 전달하므로 이 휴리스틱을 피할 수 없다). 고정 150ms 뒤 Enter는 긴 한글 요청·MCP 15개
//   기동 중 같은 부하에서 그 창 안에 떨어져 요청이 입력창에 남은 채 "생각중"으로 굳었다.
//   → 화면 출력이 ENTER_QUIET_MS 동안 멈춘(붙여넣기를 다 소화한) 뒤 Enter를 치고, 이후에도 입력창에 요청이 남아 있으면 Enter를 다시 친다(최대 ENTER_TRIES회).
const ENTER_QUIET_MS = Number(process.env.IRIS_FACE_ENTER_QUIET_MS ?? 300);     // 마지막 화면 출력 뒤 이만큼 조용해야 Enter
const ENTER_MAX_WAIT_MS = Number(process.env.IRIS_FACE_ENTER_MAX_WAIT_MS ?? 3000); // 스피너 등으로 화면이 계속 움직여도 이 시간 뒤엔 Enter
const ENTER_VERIFY_MS = 1200;   // Enter 뒤 이만큼 지나도 요청이 입력창에 그대로면 미전송으로 판정
const ENTER_TRIES = 3;
// 작업 중 표식(두 CLI 공통 "esc to interrupt" + 클로드 스피너 문구 + 코덱스 MCP 기동 상태줄). 화면이 계속 갱신돼도 이 표식이 없으면 대기로 본다.
// "Starting MCP servers"가 보이는 동안은 세션이 아직 준비 전이라 첫 요청을 보내지 않는다(보내면 코덱스가 큐에 넣고 상태를 못 보여 준다).
const WORKING_RE = /(esc to interrupt|ctrl\+c to interrupt|Cogitating|Thinking…|Working \(|\(\d+s • esc|Starting MCP servers)/i;
// 클로드 스피너 줄(2.1.26x): "✢ Propagating…  11m 11s · ↓ 21.5k tokens)" — 글리프 + 동사…  (안내줄 "esc to interrupt"는 별도 줄로 내려갔다)
const SPINNER_RE = /^\s*[✢✶✻✽✳·•*]\s*([A-Za-z가-힣][A-Za-z가-힣 ]{1,30}…)/;
// 주의: 답변 본문에도 흔히 나오는 낱말("승인" 등)은 넣지 않는다 — 2026-09-10 "ISBN 승인" 답변이 노란불(확인 필요)로 오판된 사례.
const ATTENTION_RE = /(Do you trust|trust the contents|Press t to trust|enter to review hooks|Yes, continue|Yes, proceed|\(y\/n\)|\[Y\/n\]|Press enter|Esc to cancel|Enter to confirm|Enter to select|Do you want to proceed\?|Would you like to proceed\?|Ready to submit|Submit answers|1\. Yes|허용하시겠|계속하시겠|승인하시겠|승인할까요)/i; // v2.50: AskUserQuestion 답 검토 화면(❯ 1. Submit answers)·번호 없는 승인 화면도 노란불
// 코덱스 시작 시 업데이트 물음(대화형 3지선다) — idleCheck가 2(Skip)로 자동 응답한다
const CODEX_UPDATE_PROMPT_RE = /Update available[\s\S]*2\. Skip/;
// 입력 프롬프트: 클로드 ❯(~2.1.265) 또는 >(2.1.266부터) / 코덱스 ›(빈 입력창)·»(글이 든 입력창) — 헤드리스 화면의 아래쪽 줄에서만 찾는다
const PROMPT_RE = /(^|\n)\s*(❯|›|»|>)(\s|$)/;

// 데몬 재시작 뒤 잃어버린 세션 자동 재개(2026-09-11 16:31 사고 — 데몬 PID 종료 = ConPTY 자식인 세션 전부 동반 종료):
//   저장 상태가 살아 있던 것(busy·idle·attention)인데 PID가 없으면 "예기치 않게 잃은 세션(lost)"으로 보고 시작 뒤 같은 카드에서 --resume 한다.
//   CLI가 스스로 끝난 세션(exited)·이미 dead 였던 카드·세션 id를 모르는 카드(첫 메시지 전)는 되살리지 않는다. 끄기: IRIS_FACE_AUTO_RESUME=0
const AUTO_RESUME = process.env.IRIS_FACE_AUTO_RESUME !== '0';
const AUTO_RESUME_GAP_MS = Number(process.env.IRIS_FACE_AUTO_RESUME_GAP_MS ?? 2500); // 프록시·CPU 부하를 나누기 위한 세션 간 간격
const LIVE_STATUSES = new Set(['busy', 'idle', 'attention']);
export const RESUME_NOTE = '[IRIS-Face 자동 재개] IRIS-Face 데몬이 재시작되어 이 세션이 끊겼다가 같은 카드에서 자동으로 다시 열렸습니다. 파일은 그대로입니다. 직전에 하던 작업과 어디까지 끝났는지를 3줄 이내로 알리고 새 지시를 기다리세요(스스로 이어서 실행하지 마세요).';

const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const normCwd = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

// 데몬이 클로드코드 세션 안에서 시작됐을 때 물려받는 "자식 세션" 표식을 걷어낸다(남으면 새 세션이 기록파일을 저장하지 않음).
function childEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDE_CONFIG_DIR') continue;
    if (/^CLAUDE_CODE_/.test(k) || k === 'CLAUDECODE' || k === 'CLAUDE_PID' || k === 'CLAUDE_EFFORT') delete env[k];
  }
  return applyReceiptEnv(env);
}

// 설치기 영수증(package-receipt.json, installer Task 16)이 있으면 그 값으로 env를 보강한다 — 이 PC(영수증 없음)는 무접촉·현행 그대로.
// receipt 인자는 시험용 주입 지점(check-first-session.mjs가 실제 파일을 건드리지 않고 가짜 영수증을 넣을 수 있게).
export function applyReceiptEnv(env, receipt = readReceipt()) {
  const r = receipt?.env;
  if (!r) return env;
  if (r.CLAUDE_CONFIG_DIR && !env.CLAUDE_CONFIG_DIR) env.CLAUDE_CONFIG_DIR = r.CLAUDE_CONFIG_DIR;
  if (r.CODEX_HOME && !env.CODEX_HOME) env.CODEX_HOME = r.CODEX_HOME;
  if (r.ANTHROPIC_BASE_URL && !env.ANTHROPIC_BASE_URL) env.ANTHROPIC_BASE_URL = r.ANTHROPIC_BASE_URL;
  const root = soulRoot();
  const shims = path.join(root, '_agent', 'shared', 'shims');
  const nodeDir = toolPath('node');
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const cur = env[key] || '';
  const already = new Set(cur.split(path.delimiter).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const add = [shims, nodeDir].filter((p) => !already.has(p.toLowerCase()));
  if (add.length) env[key] = [...add, cur].filter(Boolean).join(path.delimiter);
  return env;
}

export class SessionManager {
  constructor(stateDir, hooks = {}) {
    this.stateDir = stateDir;
    this.file = path.join(stateDir, 'sessions.json');
    this.hooks = hooks; // onOutput(id,data) onStatus(id,status) onActivity(id,text) onList()
    this.sessions = new Map(); this.live = new Map(); this.seq = 0;
    this.load();
  }
  load() {
    fs.mkdirSync(this.stateDir, { recursive: true });
    if (!fs.existsSync(this.file)) return;
    let arr = []; try { arr = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { arr = []; }
    for (const r of arr) {
      const alive = pidAlive(r.pid);
      r.lost = !alive && LIVE_STATUSES.has(r.status) && !!r.sessionId; // 살아 있다고 저장돼 있었는데 PID가 없다 = 데몬과 함께 죽은 세션
      r.status = alive ? 'orphan' : 'dead'; r.titlePending = false; r.prompt = null; // 확인 카드는 살아 있는 화면에서만 뜬다
      this.sessions.set(r.id, r); this.seq = Math.max(this.seq, Number(r.id.replace(/\D/g, '')) || 0);
    }
  }
  /** 잃은 세션(lost) 목록 */
  lost() { return this.list().filter(r => r.lost && r.status === 'dead'); }
  /** 시작 직후: 잃은 세션을 하나씩 간격을 두고 자동 재개한다. 돌려주는 값 = 재개 대상 id 목록(비동기로 진행). */
  resumeLost({ gapMs = AUTO_RESUME_GAP_MS, note = RESUME_NOTE } = {}) {
    const ids = this.lost().map(r => r.id);
    if (!AUTO_RESUME || !ids.length) return [];
    ids.forEach((id, i) => setTimeout(() => {
      const rec = this.sessions.get(id); if (!rec || rec.status !== 'dead') return; // 그 사이 사용자가 지웠거나 손으로 재개함
      try { this.resume(id, { prompt: note }); this.hooks.onLog?.(`${id} auto-resume ok pid=${rec.pid} [${rec.cmdline}]`); }
      catch (e) { this.hooks.onLog?.(`${id} auto-resume failed: ${e?.message || e}`); }
    }, i * gapMs));
    return ids;
  }
  /** 죽은 카드 그 자리에서 재개(--resume / codex resume). 살아 있는 세션에는 쓰지 않는다(그건 switchTo). */
  resume(id, { prompt = '' } = {}) {
    const rec = this.sessions.get(id); if (!rec) throw new Error(`no session: ${id}`);
    if (this.live.has(id)) throw new Error('session is live; nothing to resume');
    const out = this.switchTo(id, { prompt });
    rec.lost = false; rec.resumedAt = new Date().toISOString(); this.save();
    return out;
  }
  save() { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify([...this.sessions.values()], null, 2), 'utf8'); fs.renameSync(tmp, this.file); }
  list() { return [...this.sessions.values()]; }
  get(id) { return this.sessions.get(id); }
  buffer(id) { return this.live.get(id)?.buffer || ''; }

  /** 새 세션: 폴더 + 에이전트·모델·사고깊이(사용자가 고른 그대로) + 첫 요청문(선택) */
  create({ cwd, agent, model, effort, readOnly, permission, approval, sandbox, prompt, cols = 120, rows = 36 }) {
    if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(`folder not found: ${cwd}`);
    const sel = normalize({ agent, model, effort, readOnly, permission, approval, sandbox });
    const cmd = buildCommand(sel, cwd);
    const id = `s${++this.seq}`;
    const proc = this.spawn(cmd, cwd, cols, rows);
    const rec = {
      id, cwd, ...sel, cmdline: cmd.cmdline,
      startedAt: new Date().toISOString(), pid: proc.pid,
      sessionId: cmd.sessionId || null, recordPath: cmd.recordPath || null, resumeCmd: cmd.resumeCmd || '',
      status: 'busy', exitCode: null, lastOutputAt: Date.now(),
      // 작업목록 이름: 헤드리스 Haiku가 첫 요청문에서 짧은 명사형 제목을 만든다(source=gen, 10~25초). 그 전까지는 빈 이름(화면은 폴더 이름을 보인다).
      // 클로드가 기록에 ai-title을 적으면 그것으로 바뀐다(source=ai, CLI의 재개 목록과 같은 이름). 생성 실패 시에만 첫 요청문 한 줄(source=first).
      title: '', titleSource: '', titlePending: true,
    };
    this.sessions.set(id, rec);
    this.nameSession(id, prompt);
    // Face 안내문을 첫 요청 앞에 붙인다(새 세션에만; 이어가기는 맥락에 이미 있음)
    this.wire(id, rec, proc, cols, rows, withFaceNote(prompt));
    if (sel.agent === 'codex') this.watchCodexRollout(id, rec);
    this.save(); this.hooks.onList?.();
    return rec;
  }
  spawn(cmd, cwd, cols, rows) { return pty.spawn(cmd.file, cmd.args, { name: 'xterm-256color', cols, rows, cwd, env: childEnv(), useConpty: true }); }

  /** 모델·사고깊이 바꾸기 = 재개 재시작: 현 PID 종료 → 같은 카드로 --resume / codex resume. 에이전트는 못 바꾼다. */
  switchTo(id, { model, effort, readOnly, permission, approval, sandbox, prompt } = {}) {
    const rec = this.sessions.get(id); if (!rec) throw new Error(`no session: ${id}`);
    if (!rec.sessionId) throw new Error('세션 id를 아직 모릅니다(첫 메시지 뒤에 바꿀 수 있습니다)');
    const sel = normalize({ agent: rec.agent, model: model ?? rec.model, effort: effort ?? rec.effort, readOnly: readOnly ?? rec.readOnly, permission: permission ?? rec.permission, approval: approval ?? rec.approval, sandbox: sandbox ?? rec.sandbox });
    const st = this.live.get(id); clearTimeout(st?.timer);
    const cols = st?.pty.cols || 120, rows = st?.pty.rows || 36;
    if (pidAlive(rec.pid)) spawnSync('taskkill', ['/PID', String(rec.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    this.live.delete(id);
    const cmd = buildCommand(sel, rec.cwd, { resumeId: rec.sessionId });
    const proc = this.spawn(cmd, rec.cwd, cols, rows);
    Object.assign(rec, sel, { cmdline: cmd.cmdline, pid: proc.pid, status: 'busy', exitCode: null, switchedAt: new Date().toISOString(), resumeCmd: cmd.resumeCmd || rec.resumeCmd });
    this.wire(id, rec, proc, cols, rows, (prompt || '').trim());
    this.save(); this.hooks.onList?.();
    return rec;
  }

  /** 에이전트 바꾸기(Claude↔Codex): 같은 카드에서 다른 CLI를 새로 띄우고, 이전 대화를 첫 요청으로 넘겨 맥락을 잇는다 */
  replaceAgent(id, { agent, model, effort, readOnly, permission, approval, sandbox, prompt } = {}) {
    const rec = this.sessions.get(id); if (!rec) throw new Error(`no session: ${id}`);
    const sel = normalize({ agent, model, effort, readOnly, permission, approval, sandbox });
    const st = this.live.get(id); clearTimeout(st?.timer);
    const cols = st?.pty.cols || 120, rows = st?.pty.rows || 36;
    if (pidAlive(rec.pid)) spawnSync('taskkill', ['/PID', String(rec.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    this.live.delete(id);
    const cmd = buildCommand(sel, rec.cwd);
    const proc = this.spawn(cmd, rec.cwd, cols, rows);
    if (rec.title) rec.titleSource = 'fixed'; // 이어받기 요청문("이전 대화…")으로 이름이 바뀌지 않게 고정
    rec.previous = [...(rec.previous || []), { agent: rec.agent, model: rec.model, effort: rec.effort, sessionId: rec.sessionId, recordPath: rec.recordPath, resumeCmd: rec.resumeCmd, until: new Date().toISOString() }];
    Object.assign(rec, sel, { cmdline: cmd.cmdline, pid: proc.pid, status: 'busy', exitCode: null, switchedAt: new Date().toISOString(), sessionId: cmd.sessionId || null, recordPath: cmd.recordPath || null, resumeCmd: cmd.resumeCmd || '' });
    // 다른 에이전트로 새로 띄우는 것이므로 안내문을 이어받기 요청 앞에 붙인다
    this.wire(id, rec, proc, cols, rows, withFaceNote(prompt));
    if (sel.agent === 'codex') this.watchCodexRollout(id, rec);
    this.save(); this.hooks.onList?.();
    return rec;
  }

  wire(id, rec, proc, cols, rows, firstPrompt) {
    const screen = new HeadlessTerminal({ cols, rows, allowProposedApi: true, scrollback: 0 });
    const state = { pty: proc, screen, buffer: '', timer: null, pendingPrompt: firstPrompt || '', promptSent: false, activity: '' };
    this.live.set(id, state);
    proc.onData((data) => {
      state.buffer += data; if (state.buffer.length > BUFFER_MAX) state.buffer = state.buffer.slice(-BUFFER_MAX);
      state.screen.write(data);
      rec.lastOutputAt = Date.now();
      if (!state.timer) state.timer = setTimeout(() => this.idleCheck(id), 700); // 스로틀
      this.hooks.onOutput?.(id, data);
    });
    proc.onExit(({ exitCode }) => {
      if (this.live.get(id) !== state) return;
      clearTimeout(state.timer); rec.exitCode = exitCode; this.setStatus(id, 'exited'); this.live.delete(id); this.save();
    });
  }

  /** 입력창 → 괄호 붙여넣기 → (화면이 잠잠해진 뒤) Enter → 전송됐는지 확인, 안 됐으면 Enter 재시도. 여러 줄을 한 메시지로. */
  send(id, text, { first = false } = {}) {
    const st = this.live.get(id); if (!st) throw new Error(`session not live: ${id}`);
    const rec = this.sessions.get(id);
    const log = (m) => this.hooks.onLog?.(`${id} ${m}`);
    const tail = text.replace(/\s+/g, ' ').trim().slice(-10); // 입력창에 요청이 남아 있는지 볼 때 쓰는 꼬리 글자
    const sentAt = Date.now();
    st.worked = true; // 이 뒤의 busy→끝 전환은 '작업 완료'(setStatus done) — 화면 알림 근거
    st.pty.write('\x1b[200~' + text + '\x1b[201~');
    log(`send${first ? ' first' : ''} ${text.length}c`);
    const alive = () => this.live.get(id) === st;
    const composerHolds = (screen) => tail && screen.replace(/\s+/g, ' ').includes(tail) && !WORKING_RE.test(screen);
    const verify = (n) => {
      if (!alive()) return;
      const screen = this.screenText(id, 10);
      if (WORKING_RE.test(screen)) { log(`enter ok (${n}) working`); return; }
      if (!composerHolds(screen)) { log(`enter ok (${n})`); return; }
      if (ATTENTION_RE.test(screen)) { log(`enter (${n}): 확인 프롬프트가 떠 있어 재시도하지 않음`); return; }
      if (n >= ENTER_TRIES) { log(`enter FAILED: ${n}회 뒤에도 요청이 입력창에 남아 있음 — 터미널에서 Enter를 눌러야 함`); return; }
      log(`enter retry ${n + 1}: 요청이 입력창에 남아 있음`);
      pressEnter(n + 1);
    };
    const pressEnter = (n) => {
      if (!alive()) return;
      try { st.pty.write('\r'); } catch { return; }
      setTimeout(() => verify(n), ENTER_VERIFY_MS);
    };
    // 화면 출력이 ENTER_QUIET_MS 동안 멈추면(붙여넣기를 다 소화함) Enter. 스피너 등으로 계속 움직여도 ENTER_MAX_WAIT_MS 뒤엔 친다.
    const settle = () => {
      if (!alive()) return;
      const quiet = Date.now() - (rec?.lastOutputAt || 0);
      if (quiet >= ENTER_QUIET_MS || Date.now() - sentAt >= ENTER_MAX_WAIT_MS) return pressEnter(1);
      setTimeout(settle, 50);
    };
    setTimeout(settle, Math.min(ENTER_QUIET_MS, 150));
  }

  idleCheck(id) {
    const rec = this.sessions.get(id); const st = this.live.get(id);
    if (!rec || !st) return;
    st.timer = null;
    const tail = this.screenText(id, 14);
    const lines = tail.split('\n');
    const spinner = lines.map(l => l.match(SPINNER_RE)).find(Boolean);
    // 화면 맨 아래 4줄 안에 "빈 입력 프롬프트"(❯ › > 만 있는 줄; 입력틀 테두리·상태줄이 그 아래 1~3줄)가 보이면 대기가 우선 —
    // 승인 대화상자는 입력틀을 통째로 덮으므로 빈 프롬프트가 보이면 확인 요청이 아니다. 사용자가 보낸 글의 메아리("> 좋아 …")는 빈 줄이 아니라 안 걸린다.
    const promptNear = lines.slice(-4).some(l => /^\s*(❯|›|>)\s*$/.test(l));
    const status = (WORKING_RE.test(tail) || spinner) ? 'busy' : (promptNear ? 'idle' : (ATTENTION_RE.test(tail) ? 'attention' : (PROMPT_RE.test(tail) ? 'idle' : 'busy')));
    this.setStatus(id, status);
    // 코덱스 시작 시 "Update available … 1. Update now / 2. Skip / 3. Skip until next version" 물음 → 2(이번만 건너뜀)로 자동 응답.
    // 실제 업데이트는 코덱스 SessionStart 훅(_agent\claude\scripts\codex-autoupdate.ps1)이 같은 세션에서 배경 설치한다(사용자 규칙 2026-09-10).
    if (status === 'attention' && !st.updateAnswered && CODEX_UPDATE_PROMPT_RE.test(tail)) {
      st.updateAnswered = true; this.hooks.onLog?.(`${id} codex update prompt → 2(Skip); 설치는 훅이 배경에서`);
      try { st.pty.write('2'); setTimeout(() => { try { st.pty.write('\r'); } catch {} }, 200); } catch {}
      return;
    }
    // 확인 카드(v2.43): 노란불이면 화면 글자에서 질문·선택지를 뽑아 rec.prompt 에 두고 방송한다(같은 내용이면 조용). 꺼지면 setStatus 가 비운다.
    if (status === 'attention') this.setPrompt(id, parseApproval(this.screenText(id, 40))); // v2.50: 대화상자가 14줄보다 길 수 있어(계획 승인·질문 5개+설명) 40줄을 읽힌다
    // 진행 문구: 스피너 줄의 동사("Propagating…")를 우선 쓰고, 없으면 옛 형식(스피너와 안내가 한 줄)에서 뽑는다
    const actLine = status === 'busy' ? (lines.find(l => WORKING_RE.test(l)) || '') : '';
    // 스피너 문구만 남긴다: 상태줄(⏵⏵ bypass permissions…, ← for agents, shift+tab to cycle)과 스피너 글리프 제거
    const legacy = actLine.split(/⏵|bypass permissions|← for agents|\(shift\+tab/)[0].replace(/[✢✶✻✽·•◦*]+/g, ' ').replace(/\(?\s*esc to interrupt\)?/i, '').replace(/ctrl\+c to interrupt/i, '').replace(/\s{2,}/g, ' ').replace(/^[\s·]+|[\s·]+$/g, '').trim().slice(0, 80);
    const act = status === 'busy' ? (spinner ? spinner[1].trim() : legacy) : '';
    if (act !== st.activity) { st.activity = act; this.hooks.onActivity?.(id, act); }
    if (status === 'busy' && !st.timer) st.timer = setTimeout(() => this.idleCheck(id), BUSY_WINDOW_MS);
    if (status === 'idle' && st.pendingPrompt && !st.promptSent) { // 첫 요청문: 프롬프트가 처음 보일 때 1회
      st.promptSent = true; const text = st.pendingPrompt; st.pendingPrompt = '';
      setTimeout(() => { try { this.send(id, text, { first: true }); } catch (e) { this.hooks.onLog?.(`${id} first send failed: ${e?.message || e}`); } }, 300);
    }
  }
  screenText(id, n = 14) {
    const st = this.live.get(id); if (!st) return '';
    const buf = st.screen.buffer.active; const lines = [];
    for (let y = 0; y < st.screen.rows; y++) { const l = buf.getLine(y)?.translateToString(true) ?? ''; if (l.trim()) lines.push(l); }
    return lines.slice(-n).join('\n');
  }
  /** 새 세션 이름 짓기(비동기): 헤드리스 Haiku → 실패하면 첫 요청문 한 줄. 끝나면 titlePending을 내린다. */
  nameSession(id, prompt) {
    const log = (m) => this.hooks.onLog?.(`${id} ${m}`);
    generateTitle(prompt, { log }).then((t) => {
      const rec = this.sessions.get(id); if (!rec) return;
      rec.titlePending = false;
      const changed = this.setTitle(id, t, 'gen') || (!rec.title && this.setTitle(id, titleFromPrompt(prompt), 'first'));
      if (!changed) { this.save(); this.hooks.onList?.(); } // 이름은 그대로여도 pending 해제는 저장·방송한다
    }).catch((e) => { const rec = this.sessions.get(id); if (rec) { rec.titlePending = false; log(`title gen threw: ${e?.message || e}`); if (!this.setTitle(id, titleFromPrompt(prompt), 'first')) { this.save(); this.hooks.onList?.(); } } });
  }
  /** 작업목록 이름 갱신. 우선순위 ai > gen > first. fixed(이어받기 뒤)는 건드리지 않고, 생성 대기 중엔 first를 받지 않는다. 바뀌었을 때만 true */
  setTitle(id, title, source) {
    const RANK = { first: 1, gen: 2, ai: 3 };
    const rec = this.sessions.get(id); const t = clipTitle(title, source === 'first' ? undefined : 48); if (!rec || !t) return false; // first만 24자, ai·gen은 원문대로(짧게 만들어 옴)
    if (rec.titleSource === 'fixed') return false;
    if (source === 'first' && rec.titlePending) return false;
    if ((RANK[rec.titleSource] || 0) > (RANK[source] || 0)) return false;
    if (rec.title === t && rec.titleSource === source) return false;
    rec.title = t; rec.titleSource = source; this.save(); this.hooks.onList?.(); return true;
  }
  /** 상태 전환 방송. done = "요청을 실제로 받은 뒤(worked)의 busy → 끝(idle·attention·exited)" 전환에만 true — 화면의 작업 완료 알림 근거(2026-09-11).
   *  세션 시작 직후 첫 프롬프트가 뜨는 busy→idle(아직 요청 전)은 worked=false 라 알림이 나가지 않는다. */
  setStatus(id, status) {
    const rec = this.sessions.get(id); if (!rec || rec.status === status) return;
    const st = this.live.get(id);
    const done = rec.status === 'busy' && status !== 'busy' && !!st?.worked;
    rec.status = status; this.hooks.onStatus?.(id, status, done ? { done: true } : undefined);
    if (status !== 'attention') this.setPrompt(id, null);
  }
  /** 확인 카드 내용(질문·선택지) 갱신·방송. null = 카드 내림. 같은 내용이면 아무것도 하지 않는다(idleCheck 는 700ms 마다 돈다). */
  setPrompt(id, prompt) {
    const rec = this.sessions.get(id); if (!rec) return;
    const next = prompt ? JSON.stringify(prompt) : '';
    const prev = rec.prompt ? JSON.stringify(rec.prompt) : '';
    if (next === prev) return;
    rec.prompt = prompt || null; this.hooks.onPrompt?.(id, rec.prompt);
  }
  write(id, data) { const st = this.live.get(id); if (!st) throw new Error(`session not live: ${id}`); if (/[\r\n]/.test(data)) st.worked = true; st.pty.write(data); } // 터미널 보기에서 Enter를 친 것도 요청으로 본다
  resize(id, cols, rows) { const st = this.live.get(id); if (st && cols > 0 && rows > 0) { st.pty.resize(Math.floor(cols), Math.floor(rows)); st.screen.resize(Math.floor(cols), Math.floor(rows)); } }

  /** 명시적 닫기: 그 세션의 cmd.exe PID 트리 하나만 종료하고 목록에서 제거 */
  close(id) {
    const rec = this.sessions.get(id); if (!rec) throw new Error(`no session: ${id}`);
    const st = this.live.get(id); clearTimeout(st?.timer);
    if (pidAlive(rec.pid)) spawnSync('taskkill', ['/PID', String(rec.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    this.live.delete(id); this.sessions.delete(id); this.save(); this.hooks.onList?.();
    return rec;
  }
  forget(id) {
    const rec = this.sessions.get(id); if (!rec) return null;
    if (this.live.has(id) || pidAlive(rec.pid)) throw new Error('session still alive; use close');
    this.sessions.delete(id); this.save(); this.hooks.onList?.(); return rec;
  }
  closeAll() { for (const id of [...this.sessions.keys()]) { const rec = this.sessions.get(id); if (this.live.has(id) || pidAlive(rec.pid)) this.close(id); } }

  // 코덱스 롤아웃 파일은 첫 메시지 뒤에 생기므로 세션이 살아 있는 동안 3초마다 cwd로 짝을 맞춘다
  watchCodexRollout(id, rec) {
    const started = Date.now();
    const known = new Set([...this.sessions.values()].map(r => r.recordPath).filter(Boolean));
    const tick = () => {
      if (!this.sessions.has(id) || rec.recordPath || !this.live.has(id)) return;
      try {
        for (const dir of recentSessionDirs()) for (const f of fs.readdirSync(dir)) {
          if (!f.startsWith('rollout-') || !f.endsWith('.jsonl')) continue;
          const full = path.join(dir, f); if (known.has(full)) continue;
          if (fs.statSync(full).mtimeMs < started - 10_000) continue;
          const first = readFirstLine(full); if (!first) continue;
          let meta; try { meta = JSON.parse(first); } catch { continue; }
          const p = meta?.payload || {};
          if (meta.type !== 'session_meta' || p.originator !== 'codex-tui' || p.parent_thread_id) continue;
          if (normCwd(p.cwd) !== normCwd(rec.cwd)) continue;
          rec.sessionId = p.id; rec.recordPath = full; rec.resumeCmd = `codex resume ${p.id}`;
          this.save(); this.hooks.onList?.(); return;
        }
      } catch { /* retry */ }
      setTimeout(tick, 3000);
    };
    setTimeout(tick, 3000);
  }
}
function recentSessionDirs() {
  const out = [];
  for (const d of [new Date(), new Date(Date.now() - 86400000)]) {
    const dir = path.join(CODEX_HOME, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    if (fs.existsSync(dir)) out.push(dir);
  }
  return out;
}
function readFirstLine(file) {
  const fd = fs.openSync(file, 'r');
  try { const buf = Buffer.alloc(64 * 1024); const n = fs.readSync(fd, buf, 0, buf.length, 0); const s = buf.subarray(0, n).toString('utf8'); const i = s.indexOf('\n'); return i >= 0 ? s.slice(0, i) : (n < buf.length ? s : ''); }
  finally { fs.closeSync(fd); }
}
