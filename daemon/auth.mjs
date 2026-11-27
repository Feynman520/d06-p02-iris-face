// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// auth.mjs — 로그인 열쇠 만료 감시·갱신(선택 기능, v2.84). 2026-10-15 "Login expired" 사고: 클로드코드 자체 30일 열쇠가 감시 밖에서 만료.
//  · 판정·발급은 바깥 도구(paths.mjs authDir() = iris-auth 의 status.mjs·longkey.mjs)가 하고, 데몬은 부르고 전달만 한다. 도구가 없으면 기능 끔.
//  · 1년 열쇠(longkey.mjs 가 <CLAUDE_CONFIG_DIR>\secrets\iris-cli-token.json 에 저장)가 살아 있으면 클로드 세션 env 에 CLAUDE_CODE_OAUTH_TOKEN 으로 넣는다.
//  · 열쇠 값은 로그·방송·화면 어디에도 싣지 않는다(검사 = scripts/check-auth.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { authDir, dashPort } from './paths.mjs';

const MIN_LEFT_MS = 60_000;

export function longKeyFile(env = process.env, configDir = null) {
  return env.IRIS_LONGKEY_FILE || path.join(env.CLAUDE_CONFIG_DIR || configDir || path.join(os.homedir(), '.claude'), 'secrets', 'iris-cli-token.json');
}

/** 1년 열쇠가 살아 있으면 env 에 넣는다. 돌려주는 값에 열쇠는 없다. 끄기: IRIS_FACE_LONGKEY=0 */
export function applyLongKey(env, { now = Date.now(), read = (f) => fs.readFileSync(f, 'utf8'), off = process.env.IRIS_FACE_LONGKEY === '0', configDir = null } = {}) {
  if (off) return { applied: false, reason: 'off' };
  let k = null;
  try { k = JSON.parse(read(longKeyFile(env, configDir))); } catch { return { applied: false, reason: 'none' }; }
  if (!k || typeof k.token !== 'string' || !k.token) return { applied: false, reason: 'none' };
  if (!(Number(k.expiresAt) > now + MIN_LEFT_MS)) return { applied: false, reason: 'expired' };
  env.CLAUDE_CODE_OAUTH_TOKEN = k.token;
  return { applied: true, expiresAt: Number(k.expiresAt) };
}

/** 도구 출력에서 열쇠처럼 보이는 긴 토막을 가린다(혹시 모를 실수 대비). */
export const scrub = (s) => String(s ?? '').replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-…').replace(/[A-Za-z0-9_-]{60,}/g, '…');

function postJson(port, p, body, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body || {});
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }, timeout: timeoutMs }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(t) }); } catch { resolve({ status: res.statusCode, json: null }); } });
    });
    req.on('error', (e) => resolve({ status: 0, json: { ok: false, message: e.message } }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, json: { ok: false, message: 'timeout' } }); });
    req.end(data);
  });
}

/** 대시보드의 login 동작이 아는 공급자(대시보드 server.mjs 의 op:'login' — 클로드 · 코덱스). 여기 없는 공급자는 갱신을 시작하지 않는다. */
export const DASH_LOGIN = Object.freeze({ __proto__: null, anthropic: 'anthropic', claude: 'anthropic', codex: 'codex' });

/**
 * 중계기가 계정마다의 로그인 상태를 적어 두는 파일(설정 파일 옆 `….auth-health.json`). 자리 찾기는 판정 도구(iris-auth status.mjs)와 같은 차례.
 * 없으면 null — 그때는 30분 주기만 돈다.
 */
export function healthFileOf(env = process.env, home = os.homedir()) {
  const cands = [
    env.TEAMCLAUDE_CONFIG,
    path.join(home, '.config', 'teamclaude.json'),
    env.CLAUDE_CONFIG_DIR ? path.join(path.dirname(env.CLAUDE_CONFIG_DIR), 'shared', 'portable-state', 'teamclaude', 'teamclaude.json') : null,
  ].filter(Boolean);
  for (const c of cands) { try { if (fs.existsSync(c)) return c.replace(/\.json$/i, '.auth-health.json'); } catch {} }
  return null;
}
/** 그 파일의 (계정 = 상태) 지문. 읽지 못하면 null. 이름 · 상태 낱말만 본다(열쇠는 그 파일에 없다). */
export function healthSignature(file) {
  if (!file) return null;
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (Array.isArray(j?.accounts) ? j.accounts : []).map((a) => `${a?.provider || 'anthropic'}:${a?.name}=${a?.state}`).sort().join('|');
  } catch { return null; }
}

const LEVEL_RANK = { expired: 3, soon: 2, unknown: 1, ok: 0 }; // 급한 정도의 순서(판정 도구와 같다)
/**
 * 판정 도구의 결과에서 hide(item) 이 참인 항목을 뺀다(순수 함수). 급한 정도(worst) · 급한 항목(due) · 가장 먼저 끝나는 열쇠(nextExpiry)는
 * 남은 항목으로 도구와 같은 규칙(선택 항목 optional 은 세지 않는다)으로 다시 셈한다. hide 가 없거나 뺄 것이 없으면 받은 그대로 돌려준다.
 */
export function withoutHidden(info, hide) {
  if (typeof hide !== 'function' || !info || !Array.isArray(info.items)) return info;
  const items = info.items.filter((i) => !hide(i));
  if (items.length === info.items.length) return info;
  const counted = items.filter((i) => !i?.optional);
  const worst = counted.reduce((w, i) => ((LEVEL_RANK[i.level] ?? 0) > LEVEL_RANK[w] ? i.level : w), 'ok');
  const due = counted.filter((i) => i.level === 'expired' || i.level === 'soon').map((i) => i.id);
  const next = counted.filter((i) => Number.isFinite(i.expiresAt)).sort((x, y) => x.expiresAt - y.expiresAt)[0] || null;
  return { ...info, items, worst, due, nextExpiry: next ? { id: next.id, label: next.label, expiresAt: next.expiresAt } : null };
}

export class AuthWatch {
  /** opts: { log, broadcast, node, dir, everyMs, ensureDash, post, healthFile, watchMs } — dir 를 주면 시험용 가짜 도구 폴더, post 는 시험용 가짜 대시보드 호출 */
  constructor({ log = () => {}, broadcast = () => {}, node = process.execPath, dir = authDir(), everyMs = 30 * 60_000, ensureDash = null, post = postJson, healthFile = healthFileOf(), watchMs = 30_000, hide = null } = {}) {
    // hide(item) = 감시 결과에서 뺄 항목(2026-11-27 안티그래비티 화면 잠금 — 잠겨 있으면 구글 계정 항목). 없으면(null) 도구가 준 그대로다.
    Object.assign(this, { log, broadcast, node, dir, everyMs, ensureDash, post, healthFile, watchMs, hide: typeof hide === 'function' ? hide : null });
    this.available = !!dir;
    this.info = null; this.job = null; this.timer = null; this.lastKey = '';
    // 2026-11-25 사용자 신고 "재로그인하고 재시작까지 했는데 설정에는 계속 끊김": 사본을 30분에 한 번만 다시 읽었다.
    this.refreshing = null; this.healthSig = null; this.watchTimer = null;
  }
  run(script, args = [], { timeoutMs = 15_000, onLine } = {}) {
    return new Promise((resolve) => {
      let out = '', done = false;
      const child = spawn(this.node, [path.join(this.dir, script), ...args], { cwd: this.dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const finish = (code) => { if (done) return; done = true; clearTimeout(t); resolve({ code, out }); };
      const t = setTimeout(() => { try { child.kill(); } catch {} finish(-1); }, timeoutMs);
      const take = (d) => { const s = String(d); out += s; if (onLine) for (const l of s.split(/\r?\n/)) if (l.trim()) onLine(l); };
      child.stdout.on('data', take); child.stderr.on('data', take);
      child.on('error', () => finish(-1)); child.on('exit', finish);
    });
  }
  /** 판정 도구를 한 번 돌려 사본을 갈아 끼운다. 도는 중에 또 부르면 그 결과를 함께 기다린다(화면 열기와 감시가 겹쳐도 도구는 한 번). 실패하면 지난 사본을 그대로 둔다. */
  refresh({ notify = false } = {}) {
    if (!this.available) return Promise.resolve(null);
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const r = await this.run('status.mjs', notify ? ['--json', '--notify'] : ['--json']);
        try { this.info = { ...withoutHidden(JSON.parse(r.out.trim().split(/\r?\n/).pop()), this.hide), checkedAt: new Date().toISOString() }; }
        catch { this.log(`auth: status 읽기 실패(code ${r.code})`); return this.info; }
        // 방송 조건 = 급한 정도 · 급한 항목 + 항목마다의 단계와 중계기 판정(health). 「정상 ↔ 확인 중」처럼 급한 정도가 같은 변화도 화면에 가야 한다.
        const key = `${this.info.worst}|${(this.info.due || []).join(',')}|${(this.info.items || []).map((i) => `${i.id}:${i.level}:${i.health || ''}`).join(',')}`;
        if (key !== this.lastKey) { this.lastKey = key; this.broadcast({ type: 'auth', info: this.public() }); }
        return this.info;
      } finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }
  /** 사본이 maxAgeMs 보다 오래됐으면(또는 없으면) 다시 읽는다 — 설정의 계정 · 보안을 열 때. */
  async refreshIfStale(maxAgeMs = 60_000) {
    if (!this.available) return null;
    const at = Date.parse(this.info?.checkedAt || '');
    if (!this.info || !Number.isFinite(at) || Date.now() - at > maxAgeMs) return this.refresh();
    return this.info;
  }
  /** 중계기의 계정 상태가 바뀌었는가(파일의 (계정 = 상태) 지문만 본다 — 도구는 바뀐 때만 돌린다). 바뀌었으면 다시 읽고 true. */
  async watchTick() {
    const sig = healthSignature(this.healthFile);
    if (sig === null) return false;
    if (this.healthSig === null) { this.healthSig = sig; return false; }
    if (sig === this.healthSig) return false;
    // 지문은 **새로 읽기에 성공한 뒤에** 확정한다(코덱스 검토): 먼저 확정하면 그 읽기가 실패하거나, 변화보다 먼저 시작한 읽기에 합쳐졌을 때
    // 다음 감시가 "변화 없음"으로 보고 화면이 다시 30분 낡는다. 도는 중인 읽기는 끝나기를 기다린 뒤 새로 한 번 읽는다.
    if (this.refreshing) await this.refreshing.catch(() => {});
    const before = this.info?.checkedAt || null;
    await this.refresh().catch(() => {});
    if (this.info && this.info.checkedAt !== before) this.healthSig = sig;
    return true;
  }
  public() { return { available: this.available, info: this.info, job: this.job ? { ...this.job, lines: this.job.lines.slice(-6) } : null }; }
  start() {
    if (!this.available) return;
    setTimeout(() => this.refresh({ notify: true }).catch(() => {}), 20_000);
    this.timer = setInterval(() => this.refresh({ notify: true }).catch(() => {}), this.everyMs);
    this.timer.unref?.();
    if (this.healthFile && this.watchMs > 0) {
      this.healthSig = healthSignature(this.healthFile);
      this.watchTimer = setInterval(() => { this.watchTick().catch(() => {}); }, this.watchMs);
      this.watchTimer.unref?.();
    }
  }
  stop() { clearInterval(this.timer); clearInterval(this.watchTimer); this.watchTimer = null; }

  /** 한 항목 갱신. iris:* = 1년 열쇠 발급(브라우저 승인 1회), tc:anthropic:* / tc:codex:* = 대시보드 로그인 흐름. */
  async renew(id) {
    if (!this.available) return { ok: false, error: 'auth tool not installed' };
    if (this.job?.running) return { ok: false, error: '다른 갱신이 진행 중입니다' };
    const item = (this.info?.items || []).find((i) => i.id === id);
    if (!item) return { ok: false, error: `모르는 항목: ${id}` };
    // 1년 열쇠 발급: IRIS 창용(iris:*) 또는 이미 1년 열쇠로 바꾼 중계기 계정(renew = teamclaude-longkey, --account 로 그 계정만 교체)
    const tcLong = item.group === 'teamclaude' && item.renew === 'teamclaude-longkey';
    if (tcLong || item.group === 'iris' || item.renew === 'iris-longkey' || item.renew === 'claude-login') {
      const hint = /@/.test(item.name || '') ? item.name : null;
      // 중계기 계정은 시크릿 창(--private)으로 — 평소 브라우저가 다른 계정이면 그 계정으로 자동 승인돼 버린다(도구가 대조해 거절).
      const args = tcLong ? ['--account', item.name, '--private'] : hint ? ['--hint', hint] : [];
      this.job = { running: true, id, kind: tcLong ? 'teamclaude-longkey' : 'iris-longkey', startedAt: new Date().toISOString(), lines: [], result: null };
      this.broadcast({ type: 'auth', info: this.public() });
      this.run('longkey.mjs', args, {
        timeoutMs: 11 * 60_000,
        onLine: (l) => { if (!l.startsWith('https://')) { this.job.lines.push(scrub(l)); this.broadcast({ type: 'auth', info: this.public() }); } },
      }).then(async (r) => {
        const last = r.out.split(/\r?\n/).filter((l) => l.startsWith('RESULT ')).pop();
        let res = null; try { res = JSON.parse(last.slice(7)); } catch {}
        this.job = { ...this.job, running: false, result: res || { ok: false, error: `종료 코드 ${r.code}` } };
        this.log(`auth: 1년 열쇠 발급 ${res?.ok ? 'ok' : 'fail'}`);
        await this.refresh();
        this.broadcast({ type: 'auth', info: this.public(), done: true });
      });
      return { ok: true, started: 'iris-longkey', message: '브라우저에서 승인해 주세요. 끝나면 새 세션부터 1년 열쇠를 씁니다.' };
    }
    if (item.group === 'teamclaude') {
      // 2026-11-25 사용자 신고("Antigravity 계정의 갱신을 누르니 Claude 브라우저가 떴다"): 공급자를 "코덱스가 아니면 클로드"로 넘기지 않는다.
      // 대시보드의 login 은 클로드 · 코덱스 둘뿐이다 — 그 밖의 공급자(구글 = Antigravity, 앞으로 생길 것)는 여기서 거절하고 대시보드로 안내한다.
      // 값이 없거나 'claude' 인 것(옛 도구 · 옛 자료)은 지금까지처럼 Claude 로 본다 — 이름이 있는데 모르는 공급자만 거절한다.
      const provider = DASH_LOGIN[item.provider || 'anthropic'];
      if (!provider) return { ok: false, dashboard: true, error: `${item.label} 계정은 여기서 갱신하지 않습니다 — 사용량 대시보드에서 다시 로그인하세요.` };
      if (this.ensureDash) { const d = await this.ensureDash(); if (!d?.alive) return { ok: false, error: '대시보드 도구가 꺼져 있습니다' }; }
      const before = new Date(Date.now() - 1000).toISOString(); // 대시보드가 적는 startedAt 은 요청 직후라 이보다 늦다
      const r = await this.post(dashPort(), '/api/action', { op: 'login', provider });
      if (!r.json?.ok) return { ok: false, error: r.json?.message || `HTTP ${r.status}` };
      this.job = { running: true, id, kind: 'teamclaude-login', startedAt: before, lines: [`브라우저에서 ${item.label} 계정으로 로그인돼 있는지 확인한 뒤 승인하세요.`], result: null };
      this.broadcast({ type: 'auth', info: this.public() });
      this.pollDashLogin(item);
      return { ok: true, started: 'teamclaude-login', message: `브라우저에서 ${item.label} 계정으로 승인해 주세요.` };
    }
    return { ok: false, error: `갱신 방법 없음: ${item.renew}` };
  }
  async pollDashLogin(item, { everyMs = 3000, maxMs = 11 * 60_000 } = {}) {
    const until = Date.now() + maxMs;
    const get = () => new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: dashPort(), path: '/api/login/last', timeout: 4000 }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { try { resolve(JSON.parse(t)); } catch { resolve(null); } }); }).on('error', () => resolve(null));
    });
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, everyMs));
      const s = await get();
      if (s && s.done && String(s.startedAt) >= this.job.startedAt) {
        const ok = s.code === 0 && ((s.added || []).length > 0 || (s.updated || []).length > 0);
        this.job = { ...this.job, running: false, result: { ok, message: scrub(s.message) } };
        break;
      }
    }
    if (this.job.running) this.job = { ...this.job, running: false, result: { ok: false, error: '시간 초과(승인 없음)' } };
    await this.refresh();
    this.broadcast({ type: 'auth', info: this.public(), done: true });
  }
}
