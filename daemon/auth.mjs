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

export class AuthWatch {
  /** opts: { log, broadcast, node, dir, everyMs, ensureDash } — dir 를 주면 시험용 가짜 도구 폴더 */
  constructor({ log = () => {}, broadcast = () => {}, node = process.execPath, dir = authDir(), everyMs = 30 * 60_000, ensureDash = null } = {}) {
    Object.assign(this, { log, broadcast, node, dir, everyMs, ensureDash });
    this.available = !!dir;
    this.info = null; this.job = null; this.timer = null; this.lastKey = '';
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
  async refresh({ notify = false } = {}) {
    if (!this.available) return null;
    const r = await this.run('status.mjs', notify ? ['--json', '--notify'] : ['--json']);
    try { this.info = { ...JSON.parse(r.out.trim().split(/\r?\n/).pop()), checkedAt: new Date().toISOString() }; }
    catch { this.log(`auth: status 읽기 실패(code ${r.code})`); return this.info; }
    const key = `${this.info.worst}|${(this.info.due || []).join(',')}`;
    if (key !== this.lastKey) { this.lastKey = key; this.broadcast({ type: 'auth', info: this.public() }); }
    return this.info;
  }
  public() { return { available: this.available, info: this.info, job: this.job ? { ...this.job, lines: this.job.lines.slice(-6) } : null }; }
  start() {
    if (!this.available) return;
    setTimeout(() => this.refresh({ notify: true }).catch(() => {}), 20_000);
    this.timer = setInterval(() => this.refresh({ notify: true }).catch(() => {}), this.everyMs);
    this.timer.unref?.();
  }
  stop() { clearInterval(this.timer); }

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
      if (this.ensureDash) { const d = await this.ensureDash(); if (!d?.alive) return { ok: false, error: '대시보드 도구가 꺼져 있습니다' }; }
      const before = new Date(Date.now() - 1000).toISOString(); // 대시보드가 적는 startedAt 은 요청 직후라 이보다 늦다
      const r = await postJson(dashPort(), '/api/action', { op: 'login', provider: item.provider === 'codex' ? 'codex' : 'anthropic' });
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
