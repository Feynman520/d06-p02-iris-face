// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// doctor.mjs — 창 안의 IRIS Doctor 입구(선택 기능). 설계 정본 = D09 「에이전트 업데이트·의사-설계」 D3 · 코덱스 협의 14차.
//  · 창 안 입구는 "바깥 Doctor 를 여는 손잡이"다. 검진 · 치료는 여기서 하지 않고, 열쇠 · 계정 이름은 데몬을 거치지 않는다.
//  · Doctor 의 코드를 데몬 안으로 불러오지 않는다(Doctor 가 깨져 있어도 데몬이 영향받지 않게) — 늘 짧게 끝나는 자식(node iris-doctor.mjs …)으로 부르고,
//    받은 답은 허용한 칸만 다시 짜서 내보낸다. 로그에는 결과 낱말만 적는다(경로 · 계정 · 원문 없음).
//  · Doctor 창은 그 자식이 탐색기에게 시작 파일 하나를 넘겨 띄운다(데몬 · 창의 자식이 아니게 — 「전부 종료」에서 살아남아야 한다. 완료 조건은 실제 ⏻ 뒤 생존 확인).
//  · 상태를 읽지 못해도(잠금 바쁨 · 깨짐 · 시간 초과) 열기는 막지 않는다. 열기 요청이 도는 동안의 중복 호출은 하나로 합친다.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { doctorPlace } from './paths.mjs';

const OPEN_MS = 30_000;   // 바깥 상한 — Doctor 쪽의 기다림(20초)보다 길어야 한다(먼저 끊으면 정상으로 뜨는 중인 것을 실패로 본다)
const STATUS_MS = 8_000;
const STATUS_KEEP_MS = 30_000;
const AGAIN_MS = 5_000;   // 끝난 뒤 이만큼은 같은 답을 돌려준다(연타)
const OUT_CAP = 8_192;
const STATES = ['ready', 'failed', 'card', 'expired', 'none', 'unreadable'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

// 자식에게 주는 환경: 윈도우가 프로그램을 띄우는 데 필요한 것 + 임시 폴더(Doctor 가 "떴다"는 표시를 남기는 자리 — 같아야 찾는다). 열쇠 · 연결 주소 변수는 넘기지 않는다.
const ENV_KEEP = ['SystemRoot', 'windir', 'SystemDrive', 'ComSpec', 'PATHEXT', 'PATH', 'Path', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'IRIS_ROOT'];
// 윈도우의 변수 이름은 대소문자를 가리지 않는다(셸에 따라 SYSTEMROOT · SystemRoot 로 온다) — 이름을 가리지 않고 찾아 정해 둔 이름으로 넘긴다.
export const childEnvFor = (env = process.env) => {
  const have = new Map(Object.entries(env).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k.toLowerCase(), v]));
  const out = {};
  for (const k of ENV_KEEP) { const v = have.get(k.toLowerCase()); if (v !== undefined && !(k === 'Path' && 'PATH' in out)) out[k] = v; }
  return out;
};

/** 요약의 한 계정: 허용한 낱말 · 모양이 맞는 시각만. 그 밖은 버린다. */
function cleanOne(c, withDays) {
  const iso = (v) => (typeof v === 'string' && ISO.test(v) && Number.isFinite(Date.parse(v)) ? v : null);
  const o = { state: STATES.includes(c?.state) ? c.state : 'unknown', okAt: iso(c?.okAt), failAt: iso(c?.failAt) };
  if (withDays) o.daysLeft = Number.isInteger(c?.daysLeft) && Math.abs(c.daysLeft) < 4000 ? c.daysLeft : null;
  return o;
}
/** Doctor 의 `link summary` 답 → 화면에 줄 것. 모양이 틀리면 null. */
export function cleanSummary(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  if (j.busy === true) return { state: 'busy' };
  // 두 계정 칸이 제 모양(객체 + 상태 낱말)이 아니면 판단할 수 없는 답이다 — "정상으로 읽었다"고 하지 않는다(화면이 "준비 안 됨"으로 경고하지 않게)
  const shaped = (c) => !!c && typeof c === 'object' && !Array.isArray(c) && typeof c.state === 'string';
  if (!shaped(j.claude) || !shaped(j.codex)) return null;
  return { state: 'ok', protected: j.protected === true, claude: cleanOne(j.claude, true), codex: cleanOne(j.codex, false) };
}

const CHECK_MS = 110_000;     // Doctor 쪽 검진 상한(90초)보다 길게
const CHECK_KEEP_MS = 60_000;
const CHECK_CAP = 400_000;
const F_STATES = ['ok', 'warn', 'bad', 'unknown', 'skipped'];
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,59}$/;
// 화면에 줄 글: 길이를 자르고, 프로세스 번호는 뺀다(화면의 말에 번호를 적지 않는다)
const text = (v, max) => (typeof v === 'string' ? v.replace(/\s*\(PID \d+\)/g, '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : '');
/** Doctor 의 `checkup` 답 → 화면에 줄 것(허용한 칸만). 모양이 틀리면 null. */
export function cleanCheckup(j) {
  if (!j || typeof j !== 'object' || j.ok !== true || !Array.isArray(j.findings) || !Array.isArray(j.groups)) return null;
  const groups = j.groups.filter((g) => g && ID_RE.test(String(g.id))).slice(0, 30).map((g) => ({ id: g.id, title: text(g.title, 40) || g.id }));
  const findings = j.findings.filter((f) => f && ID_RE.test(String(f.id)) && F_STATES.includes(f.state) && groups.some((g) => g.id === f.group)).slice(0, 300)
    .map((f) => ({ id: f.id, group: f.group, title: text(f.title, 120), state: f.state, summary: text(f.summary, 300) }));
  if (!findings.length) return null;
  return { ok: true, at: typeof j.at === 'string' && ISO.test(j.at) ? j.at : null, recorded: j.recorded === true, groups, findings };
}
const R_KINDS = ['checkup', 'checkup-failed', 'open', 'close', 'link', 'probe', 'treat-start', 'treat-end'];
const R_WORD = /^[a-z0-9][a-z0-9:._-]{0,59}$/i;
/** 장부 한 줄 → 화면에 줄 것. */
export function cleanRecord(r) {
  if (!r || typeof r !== 'object' || !R_KINDS.includes(r.kind) || typeof r.at !== 'string' || !ISO.test(r.at)) return null;
  const o = { at: r.at, kind: r.kind };
  for (const k of ['from', 'service', 'outcome', 'why']) if (typeof r[k] === 'string' && R_WORD.test(r[k])) o[k] = r[k];
  if (typeof r.ok === 'boolean') o.ok = r.ok;
  for (const k of ['okCount', 'warn', 'bad', 'unknown']) if (Number.isInteger(r[k]) && r[k] >= 0 && r[k] < 100000) o[k] = r[k];
  return o;
}

export class DoctorGate {
  constructor({ log = () => {}, place = () => doctorPlace(), spawnFn = spawn, node = process.execPath, env = process.env, now = () => Date.now(), openMs = OPEN_MS, statusMs = STATUS_MS, checkMs = CHECK_MS, systemRoot = process.env.SystemRoot || 'C:\\Windows', direct = !process.env.IRIS_FACE_STATE } = {}) {
    Object.assign(this, { log, place, spawnFn, node, env, now, openMs, statusMs, checkMs, systemRoot, direct });
    this.checking = null; this.report = null; this.reportAt = 0;
    this.opening = null; this.last = null; this.lastAt = 0; this.sum = null; this.sumAt = 0; this.reading = null;
  }

  /** 화면의 기능 표에 싣는 것 — 경로는 싣지 않는다. */
  public() { let p = null; try { p = this.place(); } catch {} return { available: !!p, broken: !!p?.broken }; }

  /** 자식 하나를 돌려 표준 출력의 JSON 한 줄을 받는다. → { ok:true, json } | { ok:false, why: 'spawn'|'timeout'|'bad-answer'|'too-long' } */
  run(program, args, ms, cap = OUT_CAP) {
    return new Promise((resolve) => {
      let child, out = '', over = false, done = false;
      const fin = (r) => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
      try { child = this.spawnFn(this.node, [program, ...args], { cwd: path.dirname(program), env: childEnvFor(this.env), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return resolve({ ok: false, why: 'spawn' }); }
      // 시간이 다 되면 이 짧은 자식만 끝낸다 — 이미 뜬 Doctor 창 · 탐색기는 건드리지 않는다
      const timer = setTimeout(() => { try { child.kill(); } catch {} fin({ ok: false, why: 'timeout' }); }, ms);
      child.on('error', () => fin({ ok: false, why: 'spawn' }));
      child.stdout?.on('data', (d) => { if (over) return; out += d; if (out.length > cap) { over = true; try { child.kill(); } catch {} fin({ ok: false, why: 'too-long' }); } });
      child.on('close', () => {
        const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length !== 1) return fin({ ok: false, why: 'bad-answer' });
        let j = null; try { j = JSON.parse(lines[0]); } catch {}
        fin(j && typeof j === 'object' && !Array.isArray(j) ? { ok: true, json: j } : { ok: false, why: 'bad-answer' });
      });
    });
  }

  /**
   * 검진(읽기만)을 돌려 검진표를 받는다 — Doctor 가 검진표를 자기 집에 기록한다(이 PC 에만).
   * → { ok:true, at, recorded, groups, findings } | { ok:false, why: 'timeout' | 'failed' | 'broken' }
   * 한 번에 하나만 돌고(겹친 요청은 합침), 끝난 검진표는 1분 동안 다시 준다(fresh 면 새로).
   */
  checkup({ fresh = false } = {}) {
    if (this.checking) return this.checking;
    if (!fresh && this.report?.ok && this.now() - this.reportAt < CHECK_KEEP_MS) return Promise.resolve(this.report);
    const job = (async () => {
      const pl = this.place();
      if (!pl?.hasProgram) return { ok: false, why: 'broken' };
      const r = await this.run(pl.program, ['checkup', '--from', 'window'], this.checkMs, CHECK_CAP);
      const res = r.ok ? (cleanCheckup(r.json) || { ok: false, why: r.json?.why === 'timeout' ? 'timeout' : 'failed' }) : { ok: false, why: r.why === 'timeout' ? 'timeout' : 'failed' };
      this.report = res; this.reportAt = this.now();
      this.log(`doctor checkup: ${res.ok ? `ok findings=${res.findings.length} recorded=${res.recorded}` : res.why}`);
      return res;
    })();
    this.checking = job;
    const clear = () => { if (this.checking === job) this.checking = null; };
    job.then(clear, clear);
    return job;
  }

  /** 기록 장부의 마지막 줄들(새것이 앞). 읽지 못하면 { ok:false }. */
  async records() {
    const pl = this.place();
    if (!pl?.hasProgram) return { ok: false, items: [] };
    const r = await this.run(pl.program, ['records'], this.statusMs, CHECK_CAP);
    return r.ok && r.json.ok === true && Array.isArray(r.json.items) ? { ok: true, items: r.json.items.map(cleanRecord).filter(Boolean).slice(0, 40) } : { ok: false, items: [] };
  }

  /** 복구에 쓸 계정의 상태 요약. 읽지 못하면 { state: 'unknown' }(= "상태 확인 못함" — "연결 안 됨"이 아니다). 열기를 막지 않는다. */
  async status({ fresh = false } = {}) {
    const p = this.public();
    if (!p.available) return { state: 'none' };
    if (!fresh && this.sum && this.now() - this.sumAt < STATUS_KEEP_MS) return this.sum;
    if (this.reading) return this.reading;
    const job = (async () => {
      let sum = { state: 'unknown' };
      const pl = this.place();
      if (pl?.hasProgram) { const r = await this.run(pl.program, ['link', 'summary'], this.statusMs); if (r.ok) sum = cleanSummary(r.json) || sum; }
      this.sum = sum; this.sumAt = this.now();
      return sum;
    })();
    // "읽는 중" 표시는 바깥에서 걸고 푼다 — 안에서 풀면, 기다릴 것 없이 곧바로 끝난 읽기(프로그램 파일 없음)가 표시를 먼저 풀고 그 뒤에 표시가 다시 걸려 영영 옛 답만 돌려준다
    this.reading = job;
    const clear = () => { if (this.reading === job) this.reading = null; };
    job.then(clear, clear);
    return job;
  }

  /**
   * Doctor 를 바깥 창으로 연다. → { ok:true, others, direct? } | { ok:false, why }
   *   why: unconfirmed(띄웠는데 떴는지 확인하지 못함 — 열렸을 수 있다) · start-file-missing · spawn · failed
   *   direct = Doctor 프로그램이 답하지 못해 시작 파일을 탐색기에 곧바로 넘김(시작 파일이 스스로 고정 안내를 띄운다 — 떴는지는 확인하지 못한다)
   */
  open() {
    if (this.opening) return this.opening; // 도는 동안의 요청은 하나로
    if (this.last && this.now() - this.lastAt < AGAIN_MS) return Promise.resolve({ ...this.last, repeated: true });
    const job = (async () => {
      let res = { ok: false, why: 'failed' };
      try { res = await this.openOnce(); } catch {}
      this.last = res; this.lastAt = this.now();
      this.log(`doctor open: ${res.ok ? `ok${res.direct ? ' direct' : ''}` : res.why}`);
      return res;
    })();
    this.opening = job;
    const clear = () => { if (this.opening === job) this.opening = null; };
    job.then(clear, clear);
    return job;
  }

  async openOnce() {
    const pl = this.place();
    if (!pl) return { ok: false, why: 'failed' };
    if (pl.hasProgram) {
      const r = await this.run(pl.program, ['open'], this.openMs);
      if (r.ok) {
        const j = r.json, others = Number.isInteger(j.others) && j.others >= 0 && j.others < 100 ? j.others : 0;
        if (j.ok === true) return { ok: true, others };
        if (j.why === 'no-response') return { ok: false, why: 'unconfirmed' };
        if (j.why === 'start-file-missing' || j.why === 'spawn') return { ok: false, why: j.why };
        // 그 밖의 실패 낱말: 아래의 곧바로 띄우기로 한 번 더
      } else if (r.why === 'timeout') return { ok: false, why: 'unconfirmed' };
    }
    // Doctor 프로그램이 없거나 답하지 못함 → 시작 파일을 탐색기에 곧바로(시작 파일의 사다리가 다른 node 를 찾거나 고정 안내를 띄운다)
    if (!pl.hasStart) return { ok: false, why: 'start-file-missing' };
    if (!this.direct) return { ok: false, why: 'failed' }; // 시험 데몬은 진짜 탐색기를 부르지 않는다
    // 탐색기가 실제로 떴는지(spawn)와 뜨지 못했는지(error)를 가린 뒤에 답한다 — 뜨지 못한 것을 "띄웠다"고 하지 않는다.
    // 떴다는 것은 "탐색기에 넘겼다"까지다: Doctor 창이 보이는지는 여기서 확인하지 못한다(direct = 화면이 그렇게 말한다).
    let c;
    try { c = this.spawnFn(path.join(this.systemRoot, 'explorer.exe'), [pl.startFile], { detached: true, stdio: 'ignore', windowsHide: false, shell: false, env: childEnvFor(this.env) }); } catch { return { ok: false, why: 'spawn' }; }
    const started = await new Promise((resolve) => {
      if (typeof c?.once !== 'function') return resolve(Number.isInteger(c?.pid));
      const t = setTimeout(() => resolve(Number.isInteger(c.pid)), 3000);
      c.once('spawn', () => { clearTimeout(t); resolve(true); });
      c.once('error', () => { clearTimeout(t); resolve(false); });
    });
    try { c.unref?.(); } catch {}
    return started ? { ok: true, others: 0, direct: true } : { ok: false, why: 'spawn' };
  }
}
