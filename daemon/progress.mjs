// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// progress.mjs — 세팅 진행 막대(v2.65, 가이드 v14 0-6절). 에이전트가 _agent\setup\setup-progress.ps1 로 기록하는
// <root>\_agent\setup\setup-progress.json 을 3초마다 읽어, 바뀌었을 때만 화면에 방송한다. 파일이 없으면 아무것도 하지 않는다.
//
// v2 영혼에서는 잠든다(P03 Task 21): `_agent\setup\handoff.json` 이 있으면 세팅은 설치기가 자기 화면에서 끝까지 보여 주므로
// 창의 진행 막대가 할 일이 없다. 1.x 영혼(인수 문서 없음)에서는 지금까지와 똑같이 돈다.
import fs from 'node:fs';
import path from 'node:path';
import { handoffExists } from './handoff.mjs';

export const POLL_MS = 3_000;
export const STATUSES = new Set(['pending', 'running', 'done', 'skipped', 'blocked']);

export function progressFile(root) { return path.join(root, '_agent', 'setup', 'setup-progress.json'); }

/** 파일 → 화면용 요약. 없거나 깨졌으면 null. */
export function readProgress(root) {
  let raw;
  try { raw = fs.readFileSync(progressFile(root), 'utf8'); } catch { return null; }
  let j; try { j = JSON.parse(raw); } catch { return null; }
  const stages = (Array.isArray(j?.stages) ? j.stages : []).map((s) => ({
    id: String(s?.id || ''), label: String(s?.label || s?.id || ''), status: STATUSES.has(s?.status) ? s.status : 'pending', note: String(s?.note || '').slice(0, 200),
  })).filter((s) => s.id);
  if (!stages.length) return null;
  const total = stages.length;
  const done = stages.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const current = stages.find((s) => s.status === 'running') || null;
  const blocked = stages.find((s) => s.status === 'blocked') || null;
  return { title: String(j?.title || 'IRIS 세팅'), total, done, pct: Math.floor((done * 100) / total), current, blocked, stages, updatedAt: String(j?.updatedAt || ''), complete: done === total };
}

export class SetupProgress {
  constructor({ root, broadcast, log, now }) { this.root = root; this.broadcast = broadcast || (() => {}); this.log = log || (() => {}); this.now = now || (() => Date.now()); this.last = null; this.lastKey = null; this.timer = null; }
  /** hello 에 실을 현재 값. v2 영혼이면 언제나 null(화면에 막대를 그리지 않는다). */
  info() { return handoffExists(this.root) ? null : (this.last || readProgress(this.root)); }
  key(p) { return p ? JSON.stringify([p.updatedAt, p.done, p.current?.id, p.blocked?.id, p.stages.map((s) => s.status)]) : 'none'; }
  tick() {
    const p = readProgress(this.root);
    const k = this.key(p);
    if (k === this.lastKey) return false;
    this.lastKey = k; this.last = p;
    this.broadcast({ type: 'setup', progress: p });
    if (p) this.log(`setup progress ${p.done}/${p.total}${p.current ? ` current=${p.current.id}` : ''}${p.blocked ? ` blocked=${p.blocked.id}` : ''}`);
    return true;
  }
  /** v2 영혼(인수 문서 있음)이면 아예 돌지 않는다 — 진입점 가드 한 곳(P03 Task 21). */
  start() {
    if (handoffExists(this.root)) { this.log('setup progress: off (v2 영혼 — handoff.json 있음)'); return false; }
    this.tick(); this.timer = setInterval(() => { try { this.tick(); } catch (e) { this.log(`setup progress error: ${e?.message || e}`); } }, POLL_MS); this.timer.unref?.(); return true;
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
