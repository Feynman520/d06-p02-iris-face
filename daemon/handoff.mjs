// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// handoff.mjs — 설치 패키지 v2 의 인수 문서(`<root>\_agent\setup\handoff.json`)를 읽고 첫 실행을 가른다(P03 Task 21, 설계-v2 8절).
//
// 계약(정본 = P03 `docs\인수문서-handoff-v2.md`): 설치기가 쓰고 창이 읽는다. **창은 세팅을 절대 하지 않는다** —
//   이 파일과 영수증(`package-receipt.json`)만 읽고, `messenger.prompted` 한 필드만 되돌려 쓴다.
//
// 상태 4가지(resolveState):
//   ready            인수 문서가 ready 이고 영수증 9단계·로그인이 전부 끝남 → 주도 에이전트에 firstMessage 를 그대로 보낸다
//   login-pending    로그인이 남음                    → 대화 대신 안내 카드 + 「설치 이어하기」
//   setup-incomplete 세팅 단계가 덜 끝남(또는 영수증이 인수 문서와 어긋남) → 안내 카드 + 「설치 이어하기」
//   none             인수 문서 없음 = 1.x 영혼이거나 손으로 설치한 폴더 → 이 기능 전부 무동작(옛 보조 코드가 그대로 산다)
//
// **교차 확인이 규칙이다.** 인수 문서가 ready 라고 적혀 있어도 영수증의 9단계가 전부 done 이 아니면 setup-incomplete 로 본다.
// 파일 하나가 거짓말을 해도 사용자가 반쯤 된 영혼에서 대화를 시작하지 않게 하는 안전선이다.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const HANDOFF_SCHEMA = 1;
export const RECEIPT_SCHEMA_V2 = 2;
/** 세팅 엔진 v2 의 9단계(P03 `docs\세팅엔진-계약-v2.md`). 영수증 `setup.<id>.status` 가 전부 'done' 이어야 세팅이 끝난 것이다. */
export const SETUP_STAGES = Object.freeze(['unpack', 'env', 'skeleton', 'structure', 'venv', 'adapters', 'relay', 'ontology', 'checks']);
/** 로그인이 "더 할 일 없음" 인 값들. 그 밖(waiting·cli-done·failed·모르는 값)은 전부 남은 것으로 본다. */
export const LOGIN_DONE = Object.freeze(new Set(['done', 'not-needed', 'skipped']));
export const STATES = Object.freeze(['ready', 'login-pending', 'setup-incomplete', 'none']);

export const handoffFile = (root) => path.join(root, '_agent', 'setup', 'handoff.json');
export const receiptFile = (root) => path.join(root, '_agent', 'setup', 'package-receipt.json');

/** 인수 문서가 그 자리에 있는가 — 옛 세팅 보조 코드(진행 막대·finalize 감시·첫 요청문 send)를 잠재우는 단 하나의 조건. */
export function handoffExists(root) {
  try { return fs.statSync(handoffFile(root)).isFile(); } catch { return false; }
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/** 인수 문서. 없거나 깨졌거나 schema 가 1이 아니면 null(= 모르는 판은 따르지 않는다). */
export function readHandoff(root) {
  const j = readJson(handoffFile(root));
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  if (Number(j.schema) !== HANDOFF_SCHEMA) return null;
  return j;
}
export const readReceipt = (root) => readJson(receiptFile(root));

/** 영수증의 9단계가 전부 done 인가. 영수증이 없거나 schema<2 면 false(= 이 문서로는 확인할 수 없음). */
export function receiptSetupOk(receipt) {
  if (!receipt || typeof receipt !== 'object') return false;
  if (!(Number(receipt.schema) >= RECEIPT_SCHEMA_V2)) return false;
  return SETUP_STAGES.every((id) => receipt.setup?.[id]?.status === 'done');
}
/** 영수증 `online.logins.*` 가 전부 끝났는가. online 자체가 없으면 false(온라인 단계를 아직 하지 않은 것). */
export function receiptLoginOk(receipt) {
  const logins = receipt?.online?.logins;
  if (!logins || typeof logins !== 'object') return false;
  const vals = Object.values(logins);
  if (!vals.length) return false;
  return vals.every((v) => LOGIN_DONE.has(String(v?.state ?? v ?? '')));
}
/** 인수 문서 쪽 로그인 표(`login.<provider>`)가 전부 끝났는가. 표가 비어 있으면 "물어볼 구독이 없다" = 끝난 것으로 본다. */
export function handoffLoginOk(handoff) {
  const l = handoff?.login;
  if (!l || typeof l !== 'object') return true;
  return Object.values(l).every((v) => LOGIN_DONE.has(String(v ?? '')));
}

/**
 * 인수 문서 + 영수증을 함께 보고 첫 실행 상태를 정한다.
 * 나쁜 쪽이 이긴다: 둘 중 하나라도 "세팅이 덜 됐다"고 하면 setup-incomplete, 그다음이 login-pending, 둘 다 깨끗할 때만 ready.
 * @returns {{state:string, reasons:string[], handoff:object|null, receipt:object|null}}
 */
export function resolveState(root) {
  const handoff = readHandoff(root);
  if (!handoff) return { state: 'none', reasons: ['handoff.json 없음(1.x 영혼 또는 손 설치)'], handoff: null, receipt: null };
  const receipt = readReceipt(root);
  const reasons = [];
  const setupOk = receiptSetupOk(receipt);
  const loginOk = receiptLoginOk(receipt) && handoffLoginOk(handoff);
  const declared = String(handoff.state || '');
  if (!setupOk) reasons.push(receipt ? '영수증 9단계가 전부 done 이 아님' : '영수증(package-receipt.json)이 없음');
  if (!loginOk) reasons.push('로그인이 끝나지 않음');
  if (declared && !STATES.includes(declared)) reasons.push(`모르는 state 값: ${declared.slice(0, 40)}`);

  let state;
  if (declared === 'setup-incomplete' || !setupOk) state = 'setup-incomplete';
  else if (declared === 'login-pending' || !loginOk) state = 'login-pending';
  else if (declared === 'ready') state = 'ready';
  else state = 'setup-incomplete';   // 모르는 값은 안전한 쪽으로
  if (state !== declared && declared) reasons.push(`인수 문서는 ${declared} 라고 적었지만 교차 확인 결과 ${state}`);
  return { state, reasons, handoff, receipt };
}

/**
 * `messenger.prompted = true` 만 원자적으로 갱신한다(임시 파일 → 이름 바꾸기).
 * **다른 필드는 하나도 건드리지 않는다** — 창이 인수 문서에 쓰는 것은 이 한 자리뿐이라는 계약이다.
 */
export function markMessengerPrompted(root) {
  const file = handoffFile(root);
  const raw = readJson(file);
  if (!raw || typeof raw !== 'object') return { ok: false, changed: false, reason: 'handoff.json 을 읽지 못했습니다' };
  if (raw.messenger?.prompted === true) return { ok: true, changed: false };
  const next = { ...raw, messenger: { ...(raw.messenger && typeof raw.messenger === 'object' ? raw.messenger : {}), prompted: true } };
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch {} return { ok: false, changed: false, reason: String(e?.message || e) }; }
  return { ok: true, changed: true };
}

// ---- 「설치 이어하기」 ----
const ARG_RE = /^--[a-z][a-z0-9-]{0,20}$/;
/** 계약(P03 `docs\인수문서-handoff-v2.md`)이 정한 **단 하나의** 설치기 사본 자리. 다른 값은 받지 않는다. */
export const CONTRACT_INSTALLER_PATH = '_agent/setup/installer/IRIS-설치.cmd';
/**
 * cmd.exe 가 명령줄을 **다시 읽으면서** 뜻을 갖는 글자들. `&`·`|` 는 명령을 하나 더 붙일 수 있고 `%` 는 따옴표 안에서도 환경변수로 바뀐다.
 * 우리는 따옴표로 감싸고 그대로 넘기지만(아래 `resume()`), 그래도 이런 글자가 든 경로는 아예 실행하지 않는다(겹겹 방어).
 */
const CMD_META_RE = /[&|^<>()%!]/;
const normRel = (s) => String(s).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
/**
 * 인수 문서 `resume` → 실제로 실행할 것. 네 겹으로 막는다:
 *   ⓐ 값이 **계약의 그 경로 하나**여야 한다(슬래시 방향·대소문자만 너그럽게) — 인수 문서가 아무 파일이나 가리킬 수 없다.
 *   ⓑ 절대경로·UNC 금지, 풀어 본 경로가 영혼 루트 밖이면 거부.
 *   ⓒ 그 자리에 파일이 실제로 있어야 한다.
 *   ⓓ 풀어 본 절대경로에 cmd 가 다르게 읽는 글자(`& | ^ < > ( ) % !`)가 하나라도 있으면 거부.
 * 인자도 `--소문자` 형태만 통과시킨다.
 * @returns {{ok:true, file:string, args:string[]}|{ok:false, reason:string}}
 */
export function resumeTarget(root, handoff) {
  const rel = String(handoff?.resume?.installerPath || '').trim();
  if (!rel) return { ok: false, reason: '인수 문서에 설치기 경로가 없습니다' };
  if (/^[A-Za-z]:|^\\\\/.test(rel)) return { ok: false, reason: '설치기 경로는 영혼 폴더 안 상대경로여야 합니다' };
  if (normRel(rel) !== normRel(CONTRACT_INSTALLER_PATH)) {
    return { ok: false, reason: `설치기 경로가 계약과 다릅니다(${CONTRACT_INSTALLER_PATH} 만 허용): ${rel.slice(0, 120)}` };
  }
  const base = path.resolve(root);
  const file = path.resolve(base, rel.replace(/\//g, path.sep));
  if (!(file.toLowerCase() === base.toLowerCase() || file.toLowerCase().startsWith(base.toLowerCase() + path.sep))) {
    return { ok: false, reason: '설치기 경로가 영혼 폴더 밖을 가리킵니다' };
  }
  if (!fs.existsSync(file)) return { ok: false, reason: `설치기 사본이 없습니다: ${rel}` };
  if (CMD_META_RE.test(file)) return { ok: false, reason: '설치기 경로에 셸이 다르게 읽는 글자(& | ^ < > ( ) % !)가 있어 실행하지 않습니다' };
  const raw = Array.isArray(handoff?.resume?.args) && handoff.resume.args.length ? handoff.resume.args : ['--resume'];
  const args = raw.map((a) => String(a)).filter((a) => ARG_RE.test(a));
  if (!args.length) args.push('--resume');
  return { ok: true, file, args };
}

/**
 * 첫 실행 분기. 데몬이 한 번 부르고(서버 listen 직후), 화면은 `hello.handoff` / `{type:'handoff'}` 방송으로 받아 카드를 그린다.
 * 실제 세션 만들기·보내기는 전부 주입받은 `sm`(SessionManager) 로만 한다 — 새 전송 길을 만들지 않는다(v2.64 send 경로 재사용).
 */
export class HandoffFlow {
  /** @param {{root:string, stateDir:string, sm:object, log?:Function, broadcast?:Function, spawnImpl?:Function, now?:Function}} o */
  constructor(o = {}) {
    this.root = o.root;
    this.stateDir = o.stateDir;
    this.sm = o.sm || null;
    this.log = o.log || (() => {});
    this.broadcast = o.broadcast || (() => {});
    this.spawnImpl = o.spawnImpl || spawn;
    this.now = o.now || (() => Date.now());
    this.card = null;       // 지금 화면에 띄울 카드(없으면 null)
    this.last = null;       // 마지막 runOnce 결과
    this.ran = false;
  }
  seenFile() { return path.join(this.stateDir, 'handoff-seen.json'); }
  readSeen() { return readJson(this.seenFile()) || {}; }
  writeSeen(o) {
    try { fs.mkdirSync(this.stateDir, { recursive: true }); fs.writeFileSync(this.seenFile(), JSON.stringify(o, null, 2), 'utf8'); return true; }
    catch (e) { this.log(`handoff: seen 기록 실패 ${e?.message || e}`); return false; }
  }
  /** 인수 문서 한 벌을 가리키는 열쇠 — 설치기를 다시 돌려 새 문서가 들어오면 첫 인사도 다시 한다. */
  key(h) { return `${h?.writtenAt || ''}|${h?.packageVersion || ''}`; }

  /** 화면에 주는 값(hello·방송·GET /api/handoff 공통). 카드 글은 전부 여기서 만든다. */
  info() {
    const r = resolveState(this.root);
    return {
      state: r.state,
      packageVersion: r.handoff?.packageVersion || null,
      // 주도 에이전트(설치기가 고른 것) — 화면의 새 세션 기본값이 코덱스만 있는 PC 에서 클로드로 서지 않게(2026-09-19).
      leadAgent: r.handoff?.leadAgent === 'chatgpt' ? 'codex' : (r.handoff?.leadAgent === 'codex' ? 'codex' : (r.handoff?.leadAgent ? 'claude' : null)),
      card: this.card,
      greeted: this.readSeen().greetedFor === this.key(r.handoff) && !!r.handoff,
    };
  }
  publish() { try { this.broadcast({ type: 'handoff', ...this.info() }); } catch {} }

  /** 안내 카드 글(왕초보용 한 문장씩). 사용자에게 보이는 글에 내부 도구 이름을 쓰지 않는다. */
  setupCard(state) {
    if (state === 'login-pending') {
      return {
        kind: 'setup-status', state,
        title: '로그인이 남았습니다',
        lines: [
          '설치는 거의 끝났지만 구독 로그인 한 가지가 아직 남아 있습니다.',
          '아래 「설치 이어하기」를 누르면 설치 창이 다시 열려 로그인부터 이어서 합니다.',
          '로그인을 마치면 이 창에서 바로 대화를 시작할 수 있습니다.',
        ],
        resume: true, later: true,
      };
    }
    return {
      kind: 'setup-status', state,
      title: '세팅이 끝나지 않았습니다',
      lines: [
        '설치를 마치는 도중에 멈춘 단계가 있습니다.',
        '아래 「설치 이어하기」를 누르면 설치 창이 다시 열려 멈춘 곳부터 이어서 합니다.',
        '지금까지 만들어 둔 자료는 그대로 있습니다. 지워지는 것은 없습니다.',
      ],
      resume: true, later: true,
    };
  }
  messengerCard() {
    return {
      kind: 'messenger-prompt', state: 'ready',
      title: '메신저에 로그인해 보세요',
      lines: [
        '메신저가 함께 설치되어 있습니다.',
        '「메신저 열기」를 누르면 오른쪽 서랍이 열립니다. 이메일을 적고 받은 번호를 넣으면 로그인이 끝납니다.',
        '지금 하지 않아도 됩니다. 나중에 위쪽 메신저 단추로 언제든 다시 열 수 있습니다.',
      ],
      // 첫 화면은 홈이다(2026-09-19 사용자 결정) — 서랍은 카드의 단추를 눌렀을 때만 연다(openModule 은 단추 행동).
      resume: false, later: true, openModule: 'messenger', openLabel: '메신저 열기',
    };
  }

  /** 같은 폴더에 이미 살아 있는 세션(중복 방지 — launch.mjs --first-session 과 같은 규칙). */
  liveInRoot() {
    const norm = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
    const want = norm(this.root);
    return (this.sm?.list?.() || []).find((r) => norm(r.cwd) === want && r.status !== 'exited') || null;
  }

  /**
   * 첫 실행 한 번. 데몬 시작마다 불러도 안전하다 — 첫 인사는 인수 문서 한 벌에 한 번, 메신저 안내는 `messenger.prompted` 로 한 번.
   * @returns {{state:string, action:string, reason?:string}}
   */
  runOnce() {
    if (this.ran) return this.last || { state: 'none', action: 'already-ran' };
    this.ran = true;
    const r = resolveState(this.root);
    let out = { state: r.state, action: 'none' };
    if (r.state === 'none') { this.card = null; this.last = out; return out; }
    this.log(`handoff: state=${r.state}${r.reasons.length ? ` (${r.reasons.join(' · ')})` : ''}`);

    if (r.state !== 'ready') {
      this.card = this.setupCard(r.state);
      out = { state: r.state, action: 'card' };
      this.last = out; this.publish(); return out;
    }

    // ---- ready: 주도 에이전트에게 첫 인사를 그대로 보낸다(창이 문장을 만들지 않는다) ----
    const seen = this.readSeen();
    const key = this.key(r.handoff);
    const text = String(r.handoff.firstMessage || '').trim();
    if (seen.greetedFor === key) out = { state: 'ready', action: 'already-greeted' };
    else if (!text) { out = { state: 'ready', action: 'skip', reason: 'firstMessage 가 비어 있음' }; this.log('handoff: firstMessage 가 비어 있어 첫 인사를 건너뜁니다'); }
    else if (!this.sm) out = { state: 'ready', action: 'skip', reason: 'session manager 없음' };
    else {
      // 설치기 2.0.24 까지는 구독 id 'chatgpt' 가 그대로 왔다(코덱스만 고른 설치의 첫 세션이 클로드로 열린 원인, 2026-09-19).
      const agent = (r.handoff.leadAgent === 'codex' || r.handoff.leadAgent === 'chatgpt') ? 'codex' : 'claude';
      const dup = this.liveInRoot();
      try {
        if (dup && dup.status === 'busy') { out = { state: 'ready', action: 'busy-skip', reason: `세션 ${dup.id} 이 바쁨` }; }
        else if (dup) { this.sm.send(dup.id, text); out = { state: 'ready', action: 'sent', id: dup.id }; }
        else { const rec = this.sm.create({ cwd: this.root, agent, prompt: text }); out = { state: 'ready', action: 'created', id: rec.id }; }
      } catch (e) { out = { state: 'ready', action: 'failed', reason: String(e?.message || e) }; this.log(`handoff: 첫 인사 실패 — ${out.reason}`); }
      // 바빠서 미룬 것·실패는 "했다"고 적지 않는다 → 다음 실행 때 다시 시도한다.
      if (out.action === 'sent' || out.action === 'created') {
        this.writeSeen({ ...seen, greetedFor: key, greetedAt: new Date(this.now()).toISOString(), action: out.action });
        this.log(`handoff: 첫 인사 ${out.action} agent=${agent} id=${out.id}`);
      }
    }

    // ---- 메신저 로그인 안내: 설치돼 있고 아직 한 번도 보인 적 없을 때만, 보이는 즉시 표시했다고 적는다 ----
    const m = r.handoff.messenger || {};
    if (m.installed === true && m.prompted !== true) {
      this.card = this.messengerCard();
      const w = markMessengerPrompted(this.root);
      this.log(`handoff: 메신저 안내 1회 표시 (prompted 기록 ${w.ok ? 'ok' : `실패: ${w.reason}`})`);
      out.messenger = 'prompted';
    } else this.card = null;

    this.last = out; this.publish(); return out;
  }

  /** 카드의 「나중에」 — 카드만 내린다. 상태 파일은 건드리지 않는다. */
  dismiss() { this.card = null; this.publish(); return { ok: true }; }

  /** 카드의 「설치 이어하기」 — 영혼 안 설치기 사본을 새 창으로 띄운다. 창(Face)은 그대로 둔다. */
  resume() {
    const h = readHandoff(this.root);
    if (!h) return { ok: false, reason: '인수 문서를 읽지 못했습니다' };
    const t = resumeTarget(this.root, h);
    if (!t.ok) { this.log(`handoff resume 거부: ${t.reason}`); return t; }
    try {
      // 명령줄을 **우리가 직접 만들어 그대로** 넘긴다(`windowsVerbatimArguments`). Node 가 배열을 조립할 때는 cmd 의 재해석을
      // 염두에 두지 않아 경로 속 `&` 같은 글자가 명령 구분자가 될 수 있다 — 여기서 경로를 따옴표로 감싸 한 덩어리로 못 박는다.
      // (그런 글자가 든 경로는 resumeTarget 이 이미 거부했다. 이것은 두 번째 자물쇠다.)
      const line = `start "" "${t.file}"${t.args.length ? ` ${t.args.join(' ')}` : ''}`;
      const child = this.spawnImpl('cmd.exe', ['/c', line], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, cwd: this.root });
      child?.unref?.();
      this.log(`handoff resume: ${t.file} ${t.args.join(' ')} pid=${child?.pid ?? '?'}`);
      return { ok: true, file: t.file, args: t.args, pid: child?.pid ?? null };
    } catch (e) { return { ok: false, reason: String(e?.message || e) }; }
  }
}
