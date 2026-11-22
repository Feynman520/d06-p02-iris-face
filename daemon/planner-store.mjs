// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 플래너 장부(설계 조각 ③, 2026-11-22) — 노트북 안의 글 파일 세 가지. 쓰는 주체는 데몬 하나.
//   items.json            지금의 장부 { schema, seq, rev, items:[…] }
//   changes.jsonl         변경 기록(언제 · 누가 · 무엇을 · 바꾸기 전 값) — 「되돌리기」와 "누가 넣었는지"의 근거
//   backup\items-<날짜>.json   그날 처음 쓰기 직전의 장부(최근 30장)
// 약속:
//   · 쓰기 = 임시 파일 → 이름 바꾸기(쓰다 꺼져도 옛 파일이 남는다).
//   · 장부를 못 읽으면 덮어쓰지 않는다 — 깨진 파일은 따로 두고 가장 새 사본으로 연다(recovered).
//   · 이 판이 모르는 새 형식(schema 가 더 큼)이면 읽기만 한다(readOnly) — 새 판의 자료를 옛 판이 망가뜨리지 않게.
//   · 모르는 칸은 지우지 않는다(파일 머리 · 항목 모두).
//   · 지운 일은 휴지통(state:'trash')에 30일. 제안(state:'proposed')은 승인 전이라 달력·알림에 없다.
//   · 데몬 로그에는 일정 내용을 싣지 않는다(개수 · 번호만) — 이 파일들은 사용자 자료다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDate, isTime, localDate, endOf, isPeriod, hasSteps, itemDone } from './planner-core.mjs';

export const SCHEMA = 1;
export const TRASH_DAYS = 30;
export const BACKUP_KEEP = 30;
const TITLE_MAX = 200, TEXT_MAX = 2000, STEPS_MAX = 50;

/** 사용자에게 그대로 보여 줄 수 있는 거절 사유 */
export class PlannerError extends Error { constructor(code, message) { super(message); this.code = code; this.name = 'PlannerError'; } }
const bad = (code, message) => { throw new PlannerError(code, message); };

const newId = () => crypto.randomBytes(5).toString('hex');
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const str = (v, max, what) => { if (typeof v !== 'string') bad('bad-field', `${what}을(를) 글자로 적어 주세요.`); const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim(); if (s.length > max) bad('too-long', `${what}이(가) 너무 깁니다(${max}자까지).`); return s; };

/** 반복 규칙을 다듬는다 — 하루짜리 일에만 붙인다. */
function cleanRepeat(r, base) {
  if (r == null) return null;
  if (typeof r !== 'object') bad('bad-repeat', '반복 규칙을 알아볼 수 없습니다.');
  if (!['daily', 'weekly', 'monthly'].includes(r.freq)) bad('bad-repeat', '반복은 매일 · 매주 · 매달 가운데 하나입니다.');
  const out = { ...(base && typeof base === 'object' ? base : {}), freq: r.freq, interval: Math.min(52, Math.max(1, Number(r.interval) | 0 || 1)) };
  if (r.freq === 'weekly' && r.byDay != null) {
    if (!Array.isArray(r.byDay) || !r.byDay.length || r.byDay.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) bad('bad-repeat', '반복할 요일을 알아볼 수 없습니다.');
    out.byDay = [...new Set(r.byDay)].sort();
  } else if (r.freq !== 'weekly') delete out.byDay;
  if (r.until != null) { if (!isDate(r.until)) bad('bad-date', '반복이 끝나는 날짜를 알아볼 수 없습니다.'); out.until = r.until; } else if ('until' in r) delete out.until;
  if (r.skip != null) { if (!Array.isArray(r.skip) || r.skip.some((d) => !isDate(d))) bad('bad-repeat', '건너뛸 날짜를 알아볼 수 없습니다.'); out.skip = [...new Set(r.skip)].sort(); }
  return out;
}

/** 넣기 · 고치기에서 받은 칸을 다듬는다. partial = 고치기(준 칸만). 모르는 칸은 받지 않는다(파일에 이미 있는 모르는 칸은 그대로 남는다). */
function cleanFields(input, partial) {
  if (!input || typeof input !== 'object') bad('bad-item', '항목을 알아볼 수 없습니다.');
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k) && input[k] !== undefined;
  if (has('title')) { out.title = str(input.title, TITLE_MAX, '이름'); if (!out.title) bad('no-title', '이름이 비어 있습니다.'); } else if (!partial) bad('no-title', '이름이 비어 있습니다.');
  if (has('start')) { if (!isDate(input.start)) bad('bad-date', '날짜를 알아볼 수 없습니다.'); out.start = input.start; } else if (!partial) bad('no-date', '날짜가 없습니다. 언제 할지 알려 주세요.');
  if (has('end')) { if (input.end !== null && !isDate(input.end)) bad('bad-date', '끝나는 날짜를 알아볼 수 없습니다.'); out.end = input.end; }
  for (const k of ['time', 'timeEnd']) if (has(k)) { if (input[k] !== null && !isTime(input[k])) bad('bad-time', '시각을 알아볼 수 없습니다.'); out[k] = input[k]; }
  if (has('steps')) {
    if (input.steps !== null && !Array.isArray(input.steps)) bad('bad-steps', '단계를 알아볼 수 없습니다.');
    if (input.steps && input.steps.length > STEPS_MAX) bad('too-many', `단계는 ${STEPS_MAX}개까지입니다.`);
    out.steps = (input.steps || []).map((s) => {
      if (!s || typeof s !== 'object') bad('bad-steps', '단계를 알아볼 수 없습니다.');
      const title = str(s.title ?? '', TITLE_MAX, '단계 이름'); if (!title) bad('no-title', '단계 이름이 비어 있습니다.');
      if (!isDate(s.day)) bad('bad-date', `단계 「${title}」의 날짜를 알아볼 수 없습니다.`);
      return { id: typeof s.id === 'string' && s.id ? s.id : null, title, day: s.day, done: !!s.done };
    });
  }
  if (has('repeat')) out.repeat = input.repeat; // 다듬기는 합친 뒤(하루짜리인지 봐야 한다)
  if (has('folder')) out.folder = input.folder === null ? null : str(input.folder, 600, '폴더');
  for (const k of ['note', 'place', 'who']) if (has(k)) out[k] = input[k] === null ? null : str(input[k], TEXT_MAX, k === 'note' ? '메모' : k === 'place' ? '장소' : '상대');
  if (has('tags')) { if (!Array.isArray(input.tags)) bad('bad-field', '꼬리표를 알아볼 수 없습니다.'); out.tags = input.tags.slice(0, 20).map((t) => str(t, 40, '꼬리표')).filter(Boolean); }
  for (const k of ['due', 'followUp']) if (has(k)) { if (input[k] !== null && !isDate(input[k])) bad('bad-date', '날짜를 알아볼 수 없습니다.'); out[k] = input[k]; }
  if (has('estimate')) { const n = input.estimate === null ? null : Number(input.estimate); if (n !== null && !(n >= 0 && n <= 100000)) bad('bad-field', '예상 시간을 알아볼 수 없습니다.'); out.estimate = n; }
  if (has('alerts')) { if (input.alerts !== null && typeof input.alerts !== 'object') bad('bad-field', '알림 설정을 알아볼 수 없습니다.'); out.alerts = clone(input.alerts); }
  if (has('links')) { if (!Array.isArray(input.links) || input.links.some((x) => typeof x !== 'string')) bad('bad-field', '연결을 알아볼 수 없습니다.'); out.links = input.links.slice(0, 50); }
  return out;
}

/** 합친 항목이 말이 되는지 보고, 단계가 기간 밖으로 나가면 기간을 넓힌다. 단계 번호가 없으면 붙인다. */
function settle(it) {
  if (it.end === it.start) it.end = null;
  if (it.end && it.end < it.start) bad('end-before-start', '끝나는 날이 시작하는 날보다 앞입니다.');
  if (it.timeEnd && !it.time) bad('bad-time', '끝 시각만 있고 시작 시각이 없습니다.');
  if (hasSteps(it)) {
    for (const s of it.steps) { if (!s.id) s.id = newId(); if (s.done && !s.doneAt) s.doneAt = it.updatedAt; if (!s.done) delete s.doneAt; }
    if (new Set(it.steps.map((s) => s.id)).size !== it.steps.length) bad('bad-steps', '단계 번호가 겹칩니다.');
    const days = it.steps.map((s) => s.day).sort();
    if (days[0] < it.start) it.start = days[0];
    if (days[days.length - 1] > endOf(it)) it.end = days[days.length - 1];
    if (it.end === it.start) it.end = null;
  } else delete it.steps;
  if (it.repeat != null) {
    if (isPeriod(it) || hasSteps(it)) bad('bad-repeat', '반복은 하루짜리 일에만 붙일 수 있습니다.');
    if (it.repeat.until && it.repeat.until < it.start) bad('bad-repeat', '반복이 끝나는 날이 시작하는 날보다 앞입니다.');
  } else delete it.repeat;
  return it;
}

export class PlannerStore {
  /** @param {{ dir: string, now?: () => Date, log?: (m: string) => void }} o */
  constructor({ dir, now = () => new Date(), log = () => {} }) {
    this.dir = dir; this.now = now; this.log = log;
    this.file = path.join(dir, 'items.json'); this.changesFile = path.join(dir, 'changes.jsonl'); this.backupDir = path.join(dir, 'backup');
    this.head = { schema: SCHEMA, seq: 0, rev: 0 }; this.items = [];
    this.readOnly = false; this.recovered = null; this.lastChange = null;
    this.load();
  }

  // ---- 읽기 ----
  load() {
    this.readOnly = false; this.recovered = null;
    if (!fs.existsSync(this.file)) { this.head = { schema: SCHEMA, seq: 0, rev: 0 }; this.items = []; return; }
    const r = this.#read(this.file);
    if (r.ok) return this.#adopt(r.data);
    // 깨진 장부: 덮어쓰지 않고 따로 둔 뒤 가장 새 사본으로 연다
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const broken = path.join(this.dir, `items.broken-${stamp}.json`);
    try { fs.renameSync(this.file, broken); } catch { /* 옮기지 못해도 아래에서 덮어쓰지는 않는다 */ }
    for (const b of this.backups()) {
      const rb = this.#read(path.join(this.backupDir, b));
      if (rb.ok) { this.#adopt(rb.data); this.recovered = { broken: path.basename(broken), from: b, reason: r.reason }; this.log(`planner: 장부를 읽지 못해 사본 ${b} 로 열었습니다 (${r.reason})`); if (!this.readOnly && !fs.existsSync(this.file)) this.#write(); return; }
    }
    this.head = { schema: SCHEMA, seq: 0, rev: 0 }; this.items = [];
    this.recovered = { broken: path.basename(broken), from: null, reason: r.reason };
    this.log(`planner: 장부를 읽지 못했고 쓸 수 있는 사본도 없습니다 (${r.reason})`);
  }
  #read(f) {
    try {
      const raw = fs.readFileSync(f, 'utf8');
      const data = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
      if (!data || typeof data !== 'object' || !Array.isArray(data.items) || !Number.isInteger(data.schema)) return { ok: false, reason: 'shape' };
      if (data.items.some((it) => !it || typeof it !== 'object' || typeof it.id !== 'string')) return { ok: false, reason: 'items' };
      return { ok: true, data };
    } catch (e) { return { ok: false, reason: e instanceof SyntaxError ? 'json' : String(e.code || e.message).slice(0, 40) }; }
  }
  #adopt(data) {
    const { items, ...head } = data;
    this.head = { seq: 0, rev: 0, ...head }; this.items = items;
    if (head.schema > SCHEMA) { this.readOnly = true; this.log(`planner: 장부 형식 ${head.schema} 은(는) 이 판(${SCHEMA})보다 새것 — 읽기만 합니다`); }
  }
  backups() { try { return fs.readdirSync(this.backupDir).filter((n) => /^items-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse(); } catch { return []; } }

  get rev() { return this.head.rev || 0; }
  /** state: 'active' | 'proposed' | 'trash' | undefined(전부). 돌려주는 것은 사본이다. */
  list(state) { return clone(state ? this.items.filter((it) => it.state === state) : this.items); }
  get(id) { return clone(this.#find(id)); }
  /** 번호(#12)로 찾기 — 사람·에이전트가 부르는 이름 */
  byNo(no) { return clone(this.items.find((it) => it.no === Number(no)) || null); }
  #find(id) { return this.items.find((it) => it.id === id) || null; }

  // ---- 쓰기 ----
  /**
   * 조작 묶음을 한 번에. 하나라도 말이 안 되면 아무것도 적지 않는다(PlannerError).
   * ops: { op:'add'|'propose', item } · { op:'update', id, patch } · { op:'check', id, done, stepId?, date? }
   *      · { op:'remove', id }(휴지통) · { op:'restore', id } · { op:'accept', id, patch? } · { op:'decline', id } · { op:'purge', id }
   * meta: { by:'user'|'session'|'iris'|'system', via?, session?, asked?, evidence?, note? }
   * @returns {{ rev: number, changeId: string, ids: string[], items: object[] }}
   */
  apply(ops, meta = {}) {
    if (this.readOnly) bad('read-only', '이 장부는 더 새로운 IRIS 가 쓰던 것이라 지금 판에서는 고칠 수 없습니다. IRIS 를 업데이트해 주세요.');
    if (!Array.isArray(ops) || !ops.length) bad('no-ops', '바꿀 것이 없습니다.');
    if (ops.length > 200) bad('too-many', '한 번에 바꿀 수 있는 것은 200건까지입니다.');
    const at = this.now().toISOString();
    const work = clone(this.items); let seq = this.head.seq || 0;
    const find = (id) => { const it = work.find((x) => x.id === id); if (!it) bad('not-found', '그 일을 찾지 못했습니다.'); return it; };
    const before = new Map(); // id → 바꾸기 전(없던 것은 null)
    const touch = (id) => { if (!before.has(id)) before.set(id, clone(this.#find(id))); };
    const source = () => ({ by: ['user', 'session', 'iris', 'system'].includes(meta.by) ? meta.by : 'user', via: meta.via ? String(meta.via).slice(0, 40) : null, session: meta.session ? { id: String(meta.session.id || '').slice(0, 80), title: String(meta.session.title || '').slice(0, 120), agent: String(meta.session.agent || '').slice(0, 20) } : null, asked: !!meta.asked, evidence: meta.evidence ? String(meta.evidence).slice(0, TEXT_MAX) : null });
    for (const o of ops) {
      if (!o || typeof o !== 'object') bad('bad-op', '조작을 알아볼 수 없습니다.');
      if (o.op === 'add' || o.op === 'propose') {
        const f = cleanFields(o.item, false);
        const it = settle({ id: newId(), no: ++seq, kind: 'item', state: o.op === 'add' ? 'active' : 'proposed', end: null, time: null, timeEnd: null, done: false, ...f, repeat: cleanRepeat(f.repeat ?? null, null), source: source(), createdAt: at, updatedAt: at });
        touch(it.id); work.push(it);
      } else if (o.op === 'update' || o.op === 'accept') {
        const it = find(o.id); touch(it.id);
        if (o.op === 'accept') { if (it.state !== 'proposed') bad('not-proposed', '이미 처리한 제안입니다.'); it.state = 'active'; it.acceptedAt = at; }
        else if (it.state === 'trash') bad('in-trash', '휴지통에 있는 일입니다. 먼저 되살려 주세요.');
        const f = cleanFields(o.patch || {}, true);
        if (f.steps) { const old = new Map((it.steps || []).map((s) => [s.id, s])); f.steps = f.steps.map((s) => (s.id && old.has(s.id) ? { ...old.get(s.id), title: s.title, day: s.day, done: 'done' in (o.patch.steps.find((x) => x && x.id === s.id) || {}) ? s.done : !!old.get(s.id).done } : s)); }
        const repeat = 'repeat' in f ? cleanRepeat(f.repeat, it.repeat) : it.repeat;
        Object.assign(it, f, { repeat, updatedAt: at });
        if ('time' in f && f.time === null) it.timeEnd = null;
        settle(it);
      } else if (o.op === 'check') {
        const it = find(o.id); touch(it.id);
        if (it.state !== 'active') bad('not-active', '달력에 올라와 있는 일만 끝냄으로 바꿀 수 있습니다.');
        const done = !!o.done;
        if (it.repeat) {
          if (!isDate(o.date)) bad('bad-date', '반복하는 일은 어느 날의 것인지 알려 주세요.');
          it.repeat.done = { ...(it.repeat.done || {}) }; if (done) it.repeat.done[o.date] = at; else delete it.repeat.done[o.date];
        } else if (o.stepId) {
          const s = (it.steps || []).find((x) => x.id === o.stepId); if (!s) bad('not-found', '그 단계를 찾지 못했습니다.');
          s.done = done; if (done) s.doneAt = at; else delete s.doneAt;
        } else if (hasSteps(it)) { for (const s of it.steps) { s.done = done; if (done) s.doneAt = s.doneAt || at; else delete s.doneAt; } }
        else it.done = done;
        if (!it.repeat) { if (itemDone(it)) { it.done = true; it.doneAt = it.doneAt || at; } else { it.done = false; delete it.doneAt; } }
        it.updatedAt = at;
      } else if (o.op === 'remove') {
        const it = find(o.id); touch(it.id);
        if (it.state === 'trash') bad('in-trash', '이미 휴지통에 있습니다.');
        it.stateBefore = it.state; it.state = 'trash'; it.trashedAt = at; it.updatedAt = at;
      } else if (o.op === 'restore') {
        const it = find(o.id); touch(it.id);
        if (it.state !== 'trash') bad('not-in-trash', '휴지통에 있는 일이 아닙니다.');
        it.state = it.stateBefore === 'proposed' ? 'proposed' : 'active'; delete it.stateBefore; delete it.trashedAt; it.updatedAt = at;
      } else if (o.op === 'decline' || o.op === 'purge') {
        const it = find(o.id); touch(it.id);
        if (o.op === 'decline' && it.state !== 'proposed') bad('not-proposed', '이미 처리한 제안입니다.');
        if (o.op === 'purge' && it.state !== 'trash') bad('not-in-trash', '휴지통에 있는 일만 완전히 지울 수 있습니다.');
        work.splice(work.indexOf(it), 1);
      } else bad('bad-op', '조작을 알아볼 수 없습니다.');
    }
    const ids = [...before.keys()];
    const change = { id: `c${this.rev + 1}`, rev: this.rev + 1, at, by: source(), note: meta.note ? String(meta.note).slice(0, 200) : null, ops: ids.map((id) => ({ id, before: before.get(id), after: clone(work.find((x) => x.id === id) || null) })) };
    this.#commit(work, seq, change);
    this.log(`planner: rev ${this.rev} ops=${ops.map((o) => o.op).join(',')} by=${change.by.by}${change.by.via ? '/' + change.by.via : ''} items=${ids.length}`);
    return { rev: this.rev, changeId: change.id, ids, items: ids.map((id) => this.get(id)) };
  }

  /** 방금 한 변경(또는 changeId 의 변경)을 되돌린다. 그 뒤에 같은 항목이 또 바뀌었으면 거절한다. */
  undo(changeId = null) {
    if (this.readOnly) bad('read-only', '지금 판에서는 이 장부를 고칠 수 없습니다.');
    const ch = changeId ? this.changes(200).find((c) => c.id === changeId) : this.lastChange || this.changes(1)[0];
    if (!ch) bad('nothing-to-undo', '되돌릴 것이 없습니다.');
    if (ch.undone || ch.undoOf) bad('nothing-to-undo', ch.undoOf ? '되돌리기를 다시 되돌릴 수는 없습니다.' : '이미 되돌렸습니다.');
    const work = clone(this.items);
    for (const o of ch.ops) {
      const cur = work.find((x) => x.id === o.id) || null;
      if (JSON.stringify(cur) !== JSON.stringify(o.after)) bad('changed-since', '그 뒤에 또 바뀐 일이 있어 되돌릴 수 없습니다.');
      if (cur) work.splice(work.indexOf(cur), 1);
      if (o.before) work.push(clone(o.before));
    }
    const at = this.now().toISOString();
    const change = { id: `c${this.rev + 1}`, rev: this.rev + 1, at, by: { by: 'user', via: 'undo', session: null, asked: true, evidence: null }, note: null, undoOf: ch.id, ops: ch.ops.map((o) => ({ id: o.id, before: o.after, after: o.before })) };
    ch.undone = true;
    this.#commit(work.sort((a, b) => (a.no || 0) - (b.no || 0)), this.head.seq, change);
    this.log(`planner: rev ${this.rev} undo of ${ch.id} items=${ch.ops.length}`);
    return { rev: this.rev, changeId: change.id, ids: ch.ops.map((o) => o.id) };
  }

  /** 알림을 한 번만 하려고 적어 두는 기록(조각 ⑤) — 변경 기록에는 남기지 않는다(되돌리기 대상이 아님). */
  markAlerted(marks) {
    if (this.readOnly || !marks.length) return;
    const at = this.now().toISOString(); let n = 0;
    for (const { id, key } of marks) { const it = this.#find(id); if (!it) continue; it.alerted = { ...(it.alerted || {}), [key]: at }; n++; }
    if (n) this.#write();
  }

  /** 휴지통 30일 넘은 것 지우기 + 사본 30장만 남기기. 데몬 시작 때와 하루 한 번. */
  sweep() {
    const out = { purged: 0, backupsRemoved: 0 };
    if (!this.readOnly) { // 휴지통을 먼저 비운다(이 쓰기가 오늘 사본을 만들 수 있으므로 사본 정리는 그 뒤)
      const limit = this.now().getTime() - TRASH_DAYS * 86400000;
      const dead = this.items.filter((it) => it.state === 'trash' && Date.parse(it.trashedAt || 0) < limit);
      if (dead.length) { this.apply(dead.map((it) => ({ op: 'purge', id: it.id })), { by: 'system', via: 'sweep' }); out.purged = dead.length; }
    }
    for (const b of this.backups().slice(BACKUP_KEEP)) { try { fs.unlinkSync(path.join(this.backupDir, b)); out.backupsRemoved++; } catch { /* 다음 차례 */ } }
    return out;
  }

  /** 최근 변경 기록(새것부터). */
  changes(limit = 20) {
    let text; try { text = fs.readFileSync(this.changesFile, 'utf8'); } catch { return []; }
    const out = []; const undone = new Set();
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      if (!lines[i].trim()) continue;
      let c; try { c = JSON.parse(lines[i]); } catch { continue; }
      if (c.undoOf) undone.add(c.undoOf);
      if (undone.has(c.id)) c.undone = true;
      out.push(c);
    }
    return out;
  }

  #commit(work, seq, change) {
    fs.mkdirSync(this.dir, { recursive: true });
    this.#backupOnce();
    this.items = work; this.head = { ...this.head, schema: this.head.schema || SCHEMA, seq, rev: change.rev, updatedAt: change.at };
    this.#write();
    try { fs.appendFileSync(this.changesFile, `${JSON.stringify(change)}\n`, 'utf8'); } catch (e) { this.log(`planner: 변경 기록을 쓰지 못했습니다 (${e.code || e.message})`); }
    this.lastChange = change;
  }
  #write() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify({ ...this.head, items: this.items }, null, 1)}\n`, 'utf8');
    fs.renameSync(tmp, this.file);
  }
  /** 그날 처음 쓰기 직전의 장부를 사본으로(이미 있으면 두지 않는다). */
  #backupOnce() {
    if (!fs.existsSync(this.file)) return;
    const f = path.join(this.backupDir, `items-${localDate(this.now())}.json`);
    if (fs.existsSync(f)) return;
    try { fs.mkdirSync(this.backupDir, { recursive: true }); fs.copyFileSync(this.file, f); } catch (e) { this.log(`planner: 사본을 만들지 못했습니다 (${e.code || e.message})`); }
  }
}
