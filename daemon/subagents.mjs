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
import { adapterOrDefault } from './agents/index.mjs';

const QUIET_MS = 60_000;
const SCAN_BUSY_MS = 1500, SCAN_IDLE_MS = 10_000;
const shortModel = (id) => { const m = String(id || '').match(/(opus|sonnet|haiku)/i); return m ? m[1].toLowerCase() : String(id || ''); };
// 어느 폴더의 어떤 파일이 보조 기록인지·언제 끝났다고 보는지는 에이전트마다 다르다 — agents/<id>.mjs 의 subagent* 함수가 한다.

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
    const ad = adapterOrDefault(this.agent);
    return ad ? ad.subagentDirs(this) : []; // 명부에 없는 에이전트 = 볼 폴더 없음
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
        const ad = adapterOrDefault(this.agent); if (!ad) continue;
        if (!f.startsWith(ad.subagentFilePrefix)) continue; this.seen.add(full);
        if (ad.addSubagent(this, full, (file) => new TranscriptTail(file, ad.id, { sub: true }))) added = true;
      }
    }
    if (added) this.version++;
    return added;
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
      const adDetail = adapterOrDefault(this.agent);
      if (adDetail?.subagentDetail && !s.detail && s.tail.firstUser) { s.detail = adDetail.subagentDetail(s); changed = true; }
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
    // 완료 신호는 에이전트마다 다르다(클로드 = 부모 기록의 tool_result/알림 · 코덱스 = 그 보조 rollout 의 task_complete)
    if (adapterOrDefault(this.agent)?.subagentDone(this, s, parentTail)) return 'done';
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
    return adapterOrDefault(this.agent)?.subagentEndedAt(this, s, parentTail) ?? null;
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
