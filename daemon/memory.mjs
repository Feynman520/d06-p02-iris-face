// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 메모리 계기판(v2.78, 2026-10-04): 실제 RAM(os 내장) + 커밋(typeperf 상주 1개) 을 2초마다 재서 최근 30분을 기억하고 화면에 {type:'mem'} 으로 방송한다.
//   커밋 = 프로그램들이 "이만큼 쓰겠다"고 잡아 둔 양. 한도(RAM+페이지 파일)에 닿으면 새 프로그램·세션이 켜지지 않는다(2026-09-26 램 부족 사건의 실제 원인).
//   측정기는 데몬이 직접 띄운 typeperf 하나(실측 10MB) — 2초마다 파워셸을 새로 띄우면 측정이 메모리를 먹는다.
//   typeperf 는 1시간(-sc 1800)마다 스스로 끝나고 다시 띄운다: 데몬이 갑자기 죽어도 고아 측정기가 1시간 넘게 남지 않는다.
//   3번 연속 숫자 없이 끝나면(성능 카운터 고장 PC) 15초마다 CIM(Win32_OperatingSystem) 으로 대신 잰다. 그것도 안 되면 커밋 = null(화면 "측정 불가").
//   "많이 차지하는 것" 목록(CIM 프로세스 표, 약 0.7초)은 화면이 계기판을 펼쳤을 때만 부른다. 세션 PID 아래 자손은 세션별로, 나머지는 이름별로 묶는다.
//   잔여물 미리보기는 IRIS 잔여물 청소기(orphan-sweeper.py)가 있는 PC 에서만 — 인자 없이(미리보기) 돌리며 --apply 는 이 파일 어디에도 없다.
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';

export const SAMPLE_MS = 2000;
export const KEEP = 900;              // 2초 × 900 = 30분
export const WARN_FREE_GB = 6;        // 커밋 여유가 이 아래 = 위험(세션 시작 훅 memory-notice 와 같은 값)
const GB = 2 ** 30;
const STALE_MS = 10000;               // 측정기 숫자가 이보다 오래되면 커밋을 모른다고 본다
const TOP_TTL_MS = 8000;
const TOP_LIMIT = 8;

const g2 = (bytes) => Math.round((bytes / GB) * 100) / 100;

/** typeperf CSV 한 줄 → { used, limit }(바이트). 머리줄·한국어 안내 문구·빈 값은 null. */
export function parseTypeperfLine(line) {
  const m = /^"[^"]*","\s*([\d.]+)\s*","\s*([\d.]+)\s*"\s*$/.exec(String(line).trim());
  if (!m) return null;
  const used = Number(m[1]), limit = Number(m[2]);
  if (!(used > 0) || !(limit > 0) || used > limit * 1.5) return null;
  return { used, limit };
}

/** 위험도 — 커밋 여유 6GB 미만 또는 RAM 95% 이상 = bad, 여유 12GB 미만 또는 RAM 85% 이상 = warn. 화면은 이 값만 쓴다(기준은 데몬 한 곳). */
export function levelOf({ ru, rt, cu, cl }) {
  const ramPct = rt > 0 ? ru / rt : 0;
  const free = cl != null && cu != null ? cl - cu : null;
  if ((free != null && free < WARN_FREE_GB) || ramPct >= 0.95) return 'bad';
  if ((free != null && free < WARN_FREE_GB * 2) || ramPct >= 0.85) return 'warn';
  return 'ok';
}

/** 커밋 측정기. read() = 최근 숫자 { used, limit } 또는 null. mode = 'typeperf' | 'cim' | 'off'. */
export class CommitProbe {
  // 실행 한 번 = run { child, samples, ended }. 정상 = 숫자를 HEALTHY_SAMPLES 개 이상 낸 뒤 끝남(1시간 채움) → 곧바로 다시.
  // 첫 숫자가 firstSampleMs 안에 안 나오면(카운터 하나가 없으면 typeperf 는 멈추지 않고 열 1개짜리 줄만 낸다 — 2026-10-04 검토 실측) 끝내고 실패로 센다.
  // 숫자를 조금 내다 끝나도 실패(대기 뒤 재시도) — 첫 숫자 직후 계속 죽는 typeperf 를 2~4초마다 조용히 다시 띄우지 않게.
  constructor({ log = () => {}, platform = process.platform, spawnImpl = spawn, execImpl = execFile, now = Date.now, retryMs = 30000, cimMs = 15000, firstSampleMs = 15000, healthySamples = 10 } = {}) {
    Object.assign(this, { log, platform, spawnImpl, execImpl, now, retryMs, cimMs, firstSampleMs, healthySamples });
    this.mode = platform === 'win32' ? 'typeperf' : 'off';
    this.last = null; this.run = null; this.fails = 0; this.tried = false; this.stopped = false; this.timer = null;
  }
  get child() { return this.run?.child || null; }
  start() { if (this.mode === 'typeperf') this.spawnTypeperf(); }
  spawnTypeperf() {
    if (this.stopped) return;
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'typeperf.exe');
    const run = { child: null, samples: 0, ended: false, watchdog: null };
    const end = (why) => { if (run.ended) return; run.ended = true; clearTimeout(run.watchdog); if (this.run === run) this.run = null; this.onTypeperfEnd(run, why); };
    try { run.child = this.spawnImpl(exe, ['\\Memory\\Committed Bytes', '\\Memory\\Commit Limit', '-si', String(SAMPLE_MS / 1000), '-sc', '1800'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { end(`spawn ${e.message}`); return; }
    this.run = run;
    let buf = '';
    run.child.stdout?.on('data', (d) => {
      buf += d.toString('latin1');
      let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!run.ended) this.feed(line, run); }
    });
    run.child.on('error', (e) => end(`error ${e.message}`));
    run.child.on('close', (code) => end(`exit ${code}`));       // 'close' = 출력까지 다 비운 뒤 — 이전 실행의 늦은 줄이 새 실행에 섞이지 않는다
    run.watchdog = setTimeout(() => { if (!run.samples && !run.ended) { this.log('memory: typeperf gave no numbers in time — stopping it'); try { run.child.kill(); } catch {} end('no numbers'); } }, this.firstSampleMs);
    run.watchdog.unref?.();
  }
  feed(line, run = this.run) { const v = parseTypeperfLine(line); if (v) { this.last = { ...v, at: this.now() }; this.tried = true; if (run) run.samples++; } }
  /** 아직 첫 숫자를 기다리는 중(typeperf 는 켜진 뒤 첫 숫자까지 약 4초) — 화면은 "측정 불가" 대신 "측정 준비 중"을 쓴다. 첫 실패 뒤로는 "측정 불가". */
  get waiting() { return this.mode !== 'off' && !this.tried; }
  onTypeperfEnd(run, why) {
    if (this.stopped) return;
    if (run.samples >= this.healthySamples) { this.fails = 0; this.spawnTypeperf(); return; }   // 1시간 다 채우고 끝남 = 정상 → 곧바로 다시
    this.fails++; this.tried = true;
    this.log(`memory: typeperf ended after ${run.samples} sample(s) (${why}) fail ${this.fails}/3`);
    if (this.fails >= 3) { this.mode = 'cim'; this.log('memory: switching to CIM every 15s'); this.pollCim(); return; }
    this.timer = setTimeout(() => this.spawnTypeperf(), this.retryMs); this.timer.unref?.();
  }
  pollCim() {
    if (this.stopped) return;
    const again = () => { if (!this.stopped) { this.timer = setTimeout(() => this.pollCim(), this.cimMs); this.timer.unref?.(); } };
    const ps = '$o = Get-CimInstance Win32_OperatingSystem -Property TotalVirtualMemorySize,FreeVirtualMemory; "$($o.TotalVirtualMemorySize) $($o.FreeVirtualMemory)"';
    try {
      this.execImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }, (err, out) => {
        this.tried = true;
        const m = /(\d+)\s+(\d+)/.exec(String(out || ''));
        if (!err && m) { const limit = Number(m[1]) * 1024, free = Number(m[2]) * 1024; if (limit > 0 && free >= 0 && free <= limit) this.last = { used: limit - free, limit, at: this.now() }; }
        else if (err) this.log(`memory: CIM commit failed ${err.message}`);
        again();
      });
    } catch (e) { this.tried = true; this.log(`memory: CIM commit failed ${e.message}`); again(); }   // 실행 자체가 던져도 다음 차례는 건다
  }
  read() { return this.last && this.now() - this.last.at <= (this.mode === 'cim' ? 40000 : STALE_MS) ? this.last : null; }
  /** 화면에 보이는 측정 방식 — 'typeperf'·'cim' 이라도 숫자가 아직 없으면 그대로 두고, 화면이 cu=null 을 "측정 불가"로 그린다. */
  stop() { this.stopped = true; clearTimeout(this.timer); const r = this.run; this.run = null; if (r) { clearTimeout(r.watchdog); r.ended = true; try { r.child?.kill(); } catch {} } }
}

/** CIM 프로세스 표 → 묶음 목록. procs = [{ pid, ppid, name, ws, priv }](바이트), sessions = [{ id, title, pid }].
 *  세션 PID 와 그 자손 = 세션 하나(먼저 차지) → 데몬 자신의 나머지 자손 = "IRIS" → 그 밖 = 이름별. priv(잡아 둔 양) 큰 순 TOP_LIMIT 개. */
export function groupProcesses(procs, sessions = [], { selfPid = process.pid, limit = TOP_LIMIT } = {}) {
  const byPid = new Map(procs.map(p => [p.pid, p]));
  const kids = new Map();
  for (const p of procs) { if (p.ppid === p.pid) continue; if (!kids.has(p.ppid)) kids.set(p.ppid, []); kids.get(p.ppid).push(p); }
  const claimed = new Set();
  const walk = (rootPid) => {
    const out = []; const stack = byPid.has(rootPid) ? [byPid.get(rootPid)] : [];
    while (stack.length) { const p = stack.pop(); if (claimed.has(p.pid)) continue; claimed.add(p.pid); out.push(p); for (const k of kids.get(p.pid) || []) stack.push(k); }
    return out;
  };
  const sum = (list) => list.reduce((a, p) => ({ priv: a.priv + (p.priv || 0), ws: a.ws + (p.ws || 0) }), { priv: 0, ws: 0 });
  const groups = [];
  for (const s of sessions) {
    if (!s?.pid) continue;
    // 세션 프로세스는 데몬의 직속 자식이다(ConPTY, 2026-10-04 실측). 부모가 데몬이 아니면 끝난 세션의 PID 를 윈도가 다른 프로그램에 다시 준 것 — 묶지 않는다.
    if (byPid.get(s.pid)?.ppid !== selfPid) continue;
    const list = walk(s.pid); if (!list.length) continue;
    groups.push({ kind: 'session', id: s.id, label: s.title || '이름 없는 세션', count: list.length, ...sum(list) });
  }
  const self = walk(selfPid);
  if (self.length) groups.push({ kind: 'iris', label: 'IRIS 데몬', count: self.length, ...sum(self) });
  const named = new Map();
  for (const p of procs) {
    if (claimed.has(p.pid) || !p.pid) continue;
    const key = String(p.name || '?').replace(/\.exe$/i, '');
    const k = key.toLowerCase(); const cur = named.get(k) || { kind: 'name', label: key, count: 0, priv: 0, ws: 0 };
    cur.count++; cur.priv += p.priv || 0; cur.ws += p.ws || 0; named.set(k, cur);
  }
  groups.push(...named.values());
  return groups.sort((a, b) => b.priv - a.priv).slice(0, limit).map(x => ({ ...x, priv: g2(x.priv), ws: g2(x.ws) }));
}

/** 계기판 본체. sessions() = [{ id, title, pid }], sweeper = 청소기 .py 경로 또는 null, python = () => 파이썬 경로 또는 null. */
export class MemoryMonitor {
  constructor({ log = () => {}, broadcast = () => {}, sessions = () => [], sweeper = null, python = () => null, platform = process.platform, probe, osMem, execImpl = execFile, now = Date.now } = {}) {
    Object.assign(this, { log, broadcast, sessions, sweeper, python, platform, execImpl, now });
    this.probe = probe || new CommitProbe({ log, platform, now });
    this.osMem = osMem || (() => ({ total: os.totalmem(), free: os.freemem() }));
    this.buf = []; this.timer = null; this.topCache = null; this.topBusy = null; this.sweepBusy = null;
  }
  start() { this.probe.start(); this.tick(); this.timer = setInterval(() => { try { this.tick(); } catch (e) { this.log(`memory tick error: ${e.message}`); } }, SAMPLE_MS); this.timer.unref?.(); }
  stop() { clearInterval(this.timer); this.probe.stop(); }
  sample() {
    const { total, free } = this.osMem(); const c = this.probe.read();
    const s = { t: this.now(), ru: g2(total - free), rt: g2(total), cu: c ? g2(c.used) : null, cl: c ? g2(c.limit) : null };
    if (!c && this.probe.waiting) s.cw = true;   // 커밋 첫 숫자 기다리는 중
    s.lvl = levelOf(s); return s;
  }
  tick() {
    const s = this.sample(); this.buf.push(s); if (this.buf.length > KEEP) this.buf.splice(0, this.buf.length - KEEP);
    this.broadcast({ type: 'mem', s });
    return s;
  }
  latest() { return this.buf[this.buf.length - 1] || null; }
  features() { return { commit: this.probe.mode, top: this.platform === 'win32', sweep: !!(this.sweeper && this.python()), warnFreeGb: WARN_FREE_GB, sampleMs: SAMPLE_MS, keep: KEEP }; }
  history() { return { ...this.features(), samples: this.buf }; }

  /** 많이 차지하는 것 TOP — 8초 캐시, 동시에 여러 번 불려도 CIM 은 한 번. */
  top() {
    if (this.platform !== 'win32') return Promise.resolve({ at: this.now(), groups: [], error: 'unsupported' });
    if (this.topCache && this.now() - this.topCache.at < TOP_TTL_MS) return Promise.resolve(this.topCache);
    if (this.topBusy) return this.topBusy;
    const ps = 'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,WorkingSetSize,PrivatePageCount | ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.WorkingSetSize)`t$($_.PrivatePageCount)`t$($_.Name)" }';
    // 실행이 던지든 결과 처리가 던지든 topBusy 를 비우고 반드시 답한다 — 거부된 약속이 남아 이후 요청이 전부 실패하지 않게(2026-10-04 검토).
    // 실행이 곧바로 던지면 fail 이 아래 대입보다 먼저 돈다 → settled 로 알고 topBusy 에 끝난 약속을 남기지 않는다.
    let settled = false;
    const p = new Promise((resolve) => {
      const fail = (msg) => { settled = true; this.topBusy = null; this.log(`memory: top failed ${msg}`); resolve({ at: this.now(), groups: [], error: 'failed' }); };
      try {
        this.execImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, out) => {
          if (err) { fail(err.message); return; }
          try {
            const procs = String(out || '').split(/\r?\n/).map(l => l.split('\t')).filter(a => a.length >= 5)
              .map(([pid, ppid, ws, priv, ...name]) => ({ pid: Number(pid), ppid: Number(ppid), ws: Number(ws) || 0, priv: Number(priv) || 0, name: name.join('\t') }))
              .filter(p => Number.isFinite(p.pid));
            this.topCache = { at: this.now(), groups: groupProcesses(procs, this.sessions()), procs: procs.length };
            this.topBusy = null; resolve(this.topCache);
          } catch (e) { fail(e.message); }
        });
      } catch (e) { fail(e.message); }
    });
    this.topBusy = settled ? null : p;
    return p;
  }

  /** 잔여물 청소기 미리보기(아무것도 종료하지 않음). 인자는 고정 — 화면이 무엇을 보내든 --apply 는 붙지 않는다. */
  sweepPreview() {
    const py = this.python();
    if (!this.sweeper || !py) return Promise.resolve({ ok: false, error: 'unavailable' });
    if (this.sweepBusy) return this.sweepBusy;
    let settled = false;
    const p = new Promise((resolve) => {
      const fail = (msg) => { settled = true; this.sweepBusy = null; this.log(`memory: sweep preview failed ${msg}`); resolve({ ok: false, error: String(msg).slice(-600) }); };
      try {
        this.execImpl(py, [this.sweeper], { windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } }, (err, out, errOut) => {
          if (err && !out) { fail(errOut || err.message); return; }
          this.sweepBusy = null; resolve({ ok: true, text: String(out || '').slice(-6000) });
        });
      } catch (e) { fail(e.message); }
    });
    this.sweepBusy = settled ? null : p;
    return p;
  }
}
