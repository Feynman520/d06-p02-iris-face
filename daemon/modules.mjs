// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 모듈 콘센트(계약 v1, 2026-09-11 설계 조각 1): modules\<이름>\module.json 을 읽어 별 프로세스로 띄우고 stdio JSON 한 줄 계약으로만 대화한다.
// 코어는 모듈에 세션·폴더·기록·사용자 정보를 주지 않는다. 허용 목록 밖의 말은 버리고 로그만 남긴다. 정본 = docs/모듈-계약-v1.md.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

export const CONTRACT = 1;
export const NAME_RE = /^[a-z][a-z0-9-]{1,31}$/;
const STATUSES = ['stopped', 'running', 'failed', 'incompatible', 'grade-unsupported'];

export function semverGte(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0), pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y; }
  return true;
}

/** module.json 내용만 검증(파일 존재는 호출자가 본다). */
export function validateInfo(info, faceVersion) {
  if (!info || typeof info !== 'object') return { ok: false, status: 'incompatible', reason: 'module.json is not an object' };
  if (!NAME_RE.test(String(info.name || ''))) return { ok: false, status: 'incompatible', reason: `bad name: ${info.name}` };
  if (Number(info.contract) !== CONTRACT) return { ok: false, status: 'incompatible', reason: `contract ${info.contract} (Face supports ${CONTRACT})` };
  if (info.minFace && !semverGte(faceVersion, info.minFace)) return { ok: false, status: 'incompatible', reason: `needs Face ≥ ${info.minFace} (this is ${faceVersion})` };
  const grade = Number(info.grade ?? 0);
  if (![0, 1, 2].includes(grade)) return { ok: false, status: 'incompatible', reason: `bad grade: ${info.grade}` };
  if (grade !== 0) return { ok: false, status: 'grade-unsupported', reason: `grade ${grade} needs consent (not in contract v1)` };
  return { ok: true, status: 'ok', reason: '' };
}

export function readModuleJson(dir) {
  const file = path.join(dir, 'module.json');
  if (!fs.existsSync(file)) return { error: 'module.json missing' };
  try { return { info: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) { return { error: `module.json invalid JSON: ${e.message}` }; }
}

export class ModuleHost {
  constructor({ dir, faceVersion, log = () => {}, onChange = () => {}, onNotify = () => {}, theme = () => ({ id: 'indigo', mode: 'dark' }), lang = 'ko', restartMax = 3, restartDelayMs = 1000 }) {
    Object.assign(this, { dir, faceVersion, log, onChange, onNotify, theme, lang, restartMax, restartDelayMs });
    this.mods = new Map(); // name → { name, dir, info, status, reason, panel, badge, official, proc, pid, restarts, stopping }
  }
  scan() {
    const seen = new Set();
    if (fs.existsSync(this.dir)) for (const f of fs.readdirSync(this.dir).sort()) {
      const d = path.join(this.dir, f); if (!fs.statSync(d).isDirectory() || f.endsWith('.installing')) continue;
      seen.add(f);
      const prev = this.mods.get(f);
      const m = prev || { name: f, restarts: 0, panel: null, badge: 0, proc: null, pid: null, stopping: false };
      m.dir = d; m.official = fs.existsSync(path.join(d, '.official'));
      const r = readModuleJson(d);
      if (r.error) { m.info = null; m.status = 'incompatible'; m.reason = r.error; }
      else {
        m.info = r.info; const v = validateInfo(r.info, this.faceVersion);
        const entry = path.join(d, String(r.info.entry || 'index.mjs'));
        if (v.ok && r.info.name !== f) { m.status = 'incompatible'; m.reason = `folder "${f}" ≠ module.json name "${r.info.name}"`; }
        else if (v.ok && !fs.existsSync(entry)) { m.status = 'incompatible'; m.reason = `entry missing: ${r.info.entry || 'index.mjs'}`; }
        else if (!v.ok) { m.status = v.status; m.reason = v.reason; }
        else if (!m.proc) { m.status = 'stopped'; m.reason = ''; }
      }
      this.mods.set(f, m);
    }
    for (const name of [...this.mods.keys()]) if (!seen.has(name) && !this.mods.get(name).proc) this.mods.delete(name);
    this.onChange();
    return this.list();
  }
  list() {
    return [...this.mods.values()].map(m => ({ name: m.name, label: String(m.info?.label || m.name), icon: String(m.info?.icon || '▫'), version: String(m.info?.version || '?'), contract: Number(m.info?.contract) || null, grade: Number(m.info?.grade ?? 0), status: m.status, reason: m.reason || '', panel: m.panel, badge: m.badge || 0, official: !!m.official, pid: m.pid }));
  }
  // ---- 프로세스(Task 4) ----
  start(name) { throw new Error('not implemented'); }
  stop(name) { return Promise.resolve(); }
  startAll() { for (const m of this.mods.values()) if (m.status === 'stopped') this.start(m.name); }
  stopAll() { return Promise.all([...this.mods.keys()].map(n => this.stop(n))); }
}
