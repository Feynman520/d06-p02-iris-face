// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 보조 작업(서브에이전트) 감시자 — 세션 하나의 서브에이전트 기록파일을 찾아 각각 꼬리 읽기(읽기 전용, 2026-09-11, 구현계획 v2.33).
//   클로드: <기록파일 폴더>\<세션id>\subagents\agent-<id>.jsonl + agent-<id>.meta.json(description·model·agentType·toolUseId)
//           부모 연결 = meta.toolUseId ↔ 부모의 Agent 도구호출 id. 완료 = 부모 기록에 그 id의 tool_result(동기형) 또는 <task-notification>(배경형).
//   코덱스: 같은 sessions\YYYY\MM\DD\ 의 rollout-*.jsonl 중 session_meta.payload.parent_thread_id == 부모 세션 id.
//           이름 = agent_nickname(+agent_path 끝 마디). 완료 = 그 rollout의 마지막 task_started 뒤 task_complete(2026-08-31 실측 7:7).
//   상태: running | done | quiet(완료 신호는 없는데 부모가 대기·종료 상태로 60초 넘게 조용함 — 완료라고 단정하지 않는다)
import fs from 'node:fs';
import path from 'node:path';
import { TranscriptTail } from './transcript.mjs';
import { CODEX_HOME } from './agents.mjs';

const QUIET_MS = 60_000;
const SCAN_BUSY_MS = 1500, SCAN_IDLE_MS = 10_000;
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
function readFirstLine(file) {
  const fd = fs.openSync(file, 'r');
  try { const buf = Buffer.alloc(64 * 1024); const n = fs.readSync(fd, buf, 0, buf.length, 0); const s = buf.subarray(0, n).toString('utf8'); const i = s.indexOf('\n'); return i >= 0 ? s.slice(0, i) : (n < buf.length ? s : ''); }
  finally { fs.closeSync(fd); }
}
const shortModel = (id) => { const m = String(id || '').match(/(opus|sonnet|haiku)/i); return m ? m[1].toLowerCase() : String(id || ''); };
const dayDir = (d) => path.join(CODEX_HOME, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));

export class SubagentWatcher {
  /** @param {{agent:'claude'|'codex', recordPath:string, sessionId:string}} rec 부모 세션(레코드의 세 필드만 쓴다) */
  constructor(rec, log = () => {}) {
    this.agent = rec.agent; this.recordPath = rec.recordPath; this.sessionId = rec.sessionId; this.log = log;
    this.subs = new Map();        // key → 항목
    this.seen = new Set();        // 살펴본 파일(코덱스: 첫 줄을 다시 읽지 않기 위해)
    this.scannedAt = 0; this.version = 0; // version = 목록·상태·횟수가 바뀔 때마다 +1(화면 방송 판단)
  }
  /** 살펴볼 폴더들 */
  dirs() {
    if (this.agent === 'claude') return this.sessionId ? [path.join(path.dirname(this.recordPath), this.sessionId, 'subagents')] : [];
    const out = new Set([path.dirname(this.recordPath), dayDir(new Date()), dayDir(new Date(Date.now() - 86400000))]);
    return [...out];
  }
  /** 새 기록파일이 생겼는지 본다(파일 목록만). busy면 1.5초, 아니면 10초 간격. force=true 면 즉시. */
  scan(busy, force = false) {
    const now = Date.now();
    if (!force && now - this.scannedAt < (busy ? SCAN_BUSY_MS : SCAN_IDLE_MS)) return false;
    this.scannedAt = now;
    let added = false;
    for (const dir of this.dirs()) {
      let names; try { names = fs.readdirSync(dir); } catch { continue; }
      for (const f of names) {
        if (!f.endsWith('.jsonl')) continue;
        const full = path.join(dir, f); if (this.seen.has(full)) continue;
        if (this.agent === 'claude') { if (!f.startsWith('agent-')) continue; this.seen.add(full); if (this.addClaude(full)) added = true; }
        else { if (!f.startsWith('rollout-')) continue; this.seen.add(full); if (this.addCodex(full)) added = true; }
      }
    }
    if (added) this.version++;
    return added;
  }
  addClaude(file) {
    const key = path.basename(file, '.jsonl').replace(/^agent-/, '');
    const meta = readJson(file.replace(/\.jsonl$/, '.meta.json')) || {};
    let born = null; try { born = fs.statSync(file).birthtime?.toISOString?.() || null; } catch {}
    this.subs.set(key, {
      key, file, agentType: meta.agentType || '', name: meta.description || meta.agentType || key, detail: meta.agentType ? `${meta.agentType}${meta.requestShape === 'background' ? ' · 배경 실행' : ''}` : '',
      model: meta.model || '', toolUseId: meta.toolUseId || null, background: meta.requestShape === 'background',
      status: 'running', startedAt: born, endedAt: null, lastAt: born, tools: 0, items: 0,
      tail: new TranscriptTail(file, 'claude', { sub: true }),
    });
    return true;
  }
  addCodex(file) {
    let meta; try { meta = JSON.parse(readFirstLine(file) || 'null'); } catch { meta = null; }
    const p = meta?.payload; if (!p || meta.type !== 'session_meta' || !p.parent_thread_id || p.parent_thread_id !== this.sessionId) return false;
    const sp = p.source?.subagent?.thread_spawn || {};
    const nick = sp.agent_nickname || ''; const role = sp.agent_path ? String(sp.agent_path).split('/').filter(Boolean).pop() : '';
    const key = p.id || path.basename(file, '.jsonl');
    this.subs.set(key, {
      key, file, agentType: role, name: [nick, role].filter(Boolean).join(' · ') || key, detail: '',
      model: '', toolUseId: null, background: false,
      status: 'running', startedAt: p.timestamp || meta.timestamp || null, endedAt: null, lastAt: p.timestamp || null, tools: 0, items: 0,
      tail: new TranscriptTail(file, 'codex', { sub: true }),
    });
    return true;
  }
  /**
   * 작업 중인 보조의 기록을 읽고 상태를 다시 판정한다.
   * @param {TranscriptTail|null} parentTail 부모 세션의 꼬리(완료 신호 calls/finished)
   * @param {boolean} parentBusy 부모 세션이 작업 중인가(quiet 판정에 쓴다)
   * @returns {{changed:boolean, updates:Array<{key:string, items:any[]}>}} updates = 새 항목이 생긴 보조들(화면이 보고 있으면 보낸다)
   */
  poll(parentTail, parentBusy) {
    const updates = []; let changed = false; const now = Date.now();
    for (const s of this.subs.values()) {
      if (s.status === 'done' && s.drained) {
        // 끝났고 파일도 다 읽었다 — 그래도 기록 파일이 다시 자라면 '재개'다(배경 보조는 잠깐 멈췄다 이어 일하고, 그때마다 부모에 알림이 찍힌다 — 2026-09-11 실측, v2.40.2).
        let size = -1; try { size = fs.statSync(s.file).size; } catch {}
        if (size <= (s.doneSize ?? size)) continue;
        this.resume(s, now); changed = true;
      }
      let items = []; try { items = s.tail.poll(); } catch (e) { this.log(`sub ${s.key} poll: ${e.message}`); }
      if (items.length) { updates.push({ key: s.key, items }); s.items = s.tail.items.length; s.tools = s.tail.tools; s.lastAt = s.tail.lastT || s.lastAt; if (!s.startedAt || (s.tail.firstT && s.tail.firstT < s.startedAt)) s.startedAt = s.tail.firstT || s.startedAt; changed = true; }
      if (!s.model && s.tail.model) { s.model = shortModel(s.tail.model); changed = true; } // 클로드 meta.json에 model이 없는 보조(Explore 등)는 기록의 모델 id에서(2026-09-11 실측)
      if (this.agent === 'codex' && !s.detail && s.tail.firstUser) { s.detail = s.tail.firstUser.split('\n')[0].slice(0, 120); changed = true; }
      const next = this.judge(s, parentTail, parentBusy, now);
      if (next !== s.status) { s.status = next; if (next === 'done' && !s.endedAt) s.endedAt = this.endedAt(s, parentTail) || s.lastAt || new Date().toISOString(); if (next === 'running') s.endedAt = null; changed = true; }
      if (s.status === 'done' && !items.length && !s.drained) { s.drained = true; try { s.doneSize = fs.statSync(s.file).size; } catch { s.doneSize = null; } } // 완료 판정 뒤 한 번 더 읽어 비었으면 그만 읽는다(크기는 재개 감지용)
    }
    if (changed) this.version++;
    return { changed, updates };
  }
  /** 완료로 봤던 보조의 기록이 다시 자람 → running으로 되돌리고 읽기를 재개한다. 이 뒤의 완료 판정은 재개 시각보다 나중에 온 알림만 인정한다. */
  resume(s, now = Date.now()) {
    s.status = 'running'; s.endedAt = null; s.drained = false; s.doneSize = null;
    s.resumedAt = new Date(now).toISOString(); s.resumes = (s.resumes || 0) + 1;
    this.log(`sub ${s.key}: resumed (#${s.resumes})`);
  }
  judge(s, parentTail, parentBusy, now) {
    if (this.agent === 'claude') {
      // 완료 신호 = 부모 기록의 tool_result/<task-notification>(같은 id면 최신 시각으로 갱신됨). 재개된 보조는 재개 시각보다 나중 신호만 완료로 본다.
      // 신호는 두 갈래 중 늦은 것: Agent 호출 id(finished) · 알림의 task-id = 보조 key(finishedByTask, SendMessage 재개 뒤의 알림은 이쪽에만 잡힌다 — v2.47.1).
      const fin = this.finishedAt(s, parentTail);
      if (fin && (!s.resumedAt || Date.parse(fin) > Date.parse(s.resumedAt))) return 'done';
    } else {
      if (s.tail.turnOpen === false) return 'done';
    }
    // 완료 신호가 없다: 부모가 작업 중이면 running. 부모가 대기·종료인데 기록이 60초 넘게 조용하면 quiet(완료로 단정하지 않는다)
    const last = s.lastAt ? Date.parse(s.lastAt) : 0;
    if (!parentBusy && now - last > QUIET_MS) return 'quiet';
    return 'running';
  }
  /** 클로드 보조의 가장 늦은 완료 신호 시각(finished[toolUseId] 와 finishedByTask[key] 중 늦은 것). 없으면 null. */
  finishedAt(s, parentTail) {
    const a = s.toolUseId ? parentTail?.finished?.get(s.toolUseId) : null;
    const b = s.key ? parentTail?.finishedByTask?.get(s.key) : null;
    if (a && b) return Date.parse(b) > Date.parse(a) ? b : a;
    return a || b || null;
  }
  endedAt(s, parentTail) {
    if (this.agent === 'claude') return this.finishedAt(s, parentTail);
    return s.tail.turnDoneAt || null;
  }
  /** 화면에 보내는 목록(기록 본문 제외) */
  list() {
    return [...this.subs.values()].map(s => ({ key: s.key, file: s.file, agentType: s.agentType, name: s.name, detail: s.detail, model: s.model, toolUseId: s.toolUseId, background: s.background, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt, lastAt: s.lastAt, tools: s.tools, items: s.items }))
      .sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')));
  }
  get(key) { return this.subs.get(key) || null; }
  running() { let n = 0; for (const s of this.subs.values()) if (s.status === 'running') n++; return n; }
  /** 한 보조의 전체 기록(서랍을 열 때) */
  transcript(key) {
    const s = this.subs.get(key); if (!s) return null;
    try { s.tail.poll(); } catch {}
    return { items: s.tail.items, meta: { model: s.tail.model, usage: s.tail.lastUsage, unknown: s.tail.unknown, window: s.tail.contextWindow() } };
  }
}
