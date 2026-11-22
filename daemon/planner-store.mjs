// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 플래너 장부(설계 조각 ③, 2026-11-22) — 노트북 안의 글 파일 세 가지. 쓰는 주체는 데몬 하나.
//   items.json            지금의 장부 { schema, seq, rev, last(방금 한 변경), items:[…] }
//   changes.jsonl         변경 기록(언제 · 누가 · 무엇을 · 바꾸기 전 값) — 지난 변경을 찾아보는 근거
//   backup\items-<날짜>.json   그날 사본이 없을 때의 직전 장부(읽을 수 있는 것 30장)
// 약속(코덱스 검토 걸음 1 반영):
//   · 쓰기 = 임시 파일(디스크에 밀어 넣음) → 이름 바꾸기. 저장에 성공한 뒤에만 메모리의 장부를 바꾼다(실패한 변경이 다음 저장에 섞이지 않게).
//   · 방금 한 변경은 장부 파일 머리(last)에 함께 적는다 — 장부와 「되돌리기」의 근거가 한 번에 저장된다. changes.jsonl 은 그 뒤에 덧붙이는 이력이다.
//   · 저장 직전에 파일이 내가 마지막으로 본 것과 다르면(다른 곳에서 씀) 적지 않고 다시 읽는다(conflict).
//   · 장부를 못 읽으면 덮어쓰지 않는다 — 깨진 파일을 따로 옮긴 것이 확인돼야 쓰기를 연다. 옮기지 못하면 읽기만 한다.
//   · 이 판이 모르는 새 형식(schema 가 더 큼)이면 구조를 따지기 전에 읽기만으로 연다(깨진 파일로 보지 않는다 · 사본도 건드리지 않는다).
//   · 모르는 칸은 지우지 않는다(파일 머리 · 항목 · alerts 안). 알아볼 수 없는 항목은 화면에 내지 않되 파일에는 그대로 둔다.
//   · 지운 일은 휴지통(state:'trash')에 30일. 제안(state:'proposed')은 승인 전이라 달력·알림에 없다.
//   · 데몬 로그에는 일정 내용을 싣지 않는다(개수 · 정해진 낱말만) — 이 파일들은 사용자 자료다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDate, isTime, localDate, endOf, isPeriod, hasSteps, occursOn } from './planner-core.mjs';

export const SCHEMA = 1;
export const TRASH_DAYS = 30;
export const BACKUP_KEEP = 30;
const TITLE_MAX = 200, TEXT_MAX = 2000, STEPS_MAX = 50, OPS_MAX = 200;
const STATES = new Set(['active', 'proposed', 'trash']);
/** 어디서 온 변경인지 — 정해진 낱말만 받는다(자유 글이 로그로 새지 않게) */
export const VIA = new Set(['panel', 'talk', 'cli', 'proposal', 'check', 'rules', 'undo', 'sweep', 'intro', 'test']);

/** 사용자에게 그대로 보여 줄 수 있는 거절 사유 */
export class PlannerError extends Error { constructor(code, message) { super(message); this.code = code; this.name = 'PlannerError'; } }
const bad = (code, message) => { throw new PlannerError(code, message); };

const newId = () => crypto.randomBytes(5).toString('hex');
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
const isCtl = (c) => { const n = c.charCodeAt(0); return n < 32 && n !== 9 && n !== 10 && n !== 13; };
const str = (v, max, what) => {
  if (typeof v !== 'string') bad('bad-field', `${what}을(를) 글자로 적어 주세요.`);
  const s = [...v].filter((c) => !isCtl(c)).join('').trim();
  if (s.length > max) bad('too-long', `${what}이(가) 너무 깁니다(${max}자까지).`);
  return s;
};
const sysTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } };
/** 화면·셈에 낼 수 있는 항목인가(최소한의 모양) */
const valid = (it) => !!it && typeof it === 'object' && typeof it.id === 'string' && !!it.id && typeof it.title === 'string' && isDate(it.start) && (it.end == null || isDate(it.end)) && STATES.has(it.state)
  && (it.time == null || isTime(it.time)) && (it.timeEnd == null || isTime(it.timeEnd)) && (it.steps == null || (Array.isArray(it.steps) && it.steps.every((s) => s && typeof s.id === 'string' && isDate(s.day))));
/** 되돌리기에서 견줄 때 빼는 것: 알림을 했다는 기록은 사용자가 바꾼 것이 아니다 */
const userPart = (it) => { if (!it) return it; const { alerted, ...rest } = it; return rest; };

/** 반복 규칙을 다듬는다 — 준 칸만 바꾸고 나머지는 지금 것을 지킨다. */
function cleanRepeat(r, base) {
  if (r == null) return null;
  if (typeof r !== 'object' || Array.isArray(r)) bad('bad-repeat', '반복 규칙을 알아볼 수 없습니다.');
  const prev = base && typeof base === 'object' ? base : {};
  const out = { ...prev };
  const freq = own(r, 'freq') ? r.freq : prev.freq;
  if (!['daily', 'weekly', 'monthly'].includes(freq)) bad('bad-repeat', '반복은 매일 · 매주 · 매달 가운데 하나입니다.');
  out.freq = freq;
  if (own(r, 'interval')) { if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 52) bad('bad-repeat', '반복 간격은 1에서 52 사이의 수입니다.'); out.interval = r.interval; }
  else if (!Number.isInteger(out.interval)) out.interval = 1;
  if (freq !== 'weekly') delete out.byDay;
  else if (own(r, 'byDay')) {
    if (r.byDay === null) delete out.byDay;
    else { if (!Array.isArray(r.byDay) || !r.byDay.length || r.byDay.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) bad('bad-repeat', '반복할 요일을 알아볼 수 없습니다.'); out.byDay = [...new Set(r.byDay)].sort(); }
  }
  if (own(r, 'until')) { if (r.until === null) delete out.until; else { if (!isDate(r.until)) bad('bad-date', '반복이 끝나는 날짜를 알아볼 수 없습니다.'); out.until = r.until; } }
  if (own(r, 'skip')) { if (r.skip === null) delete out.skip; else { if (!Array.isArray(r.skip) || r.skip.length > 400 || r.skip.some((d) => !isDate(d))) bad('bad-repeat', '건너뛸 날짜를 알아볼 수 없습니다.'); out.skip = [...new Set(r.skip)].sort(); } }
  return out;
}

/** 넣기 · 고치기에서 받은 칸을 다듬는다. partial = 고치기(준 칸만). 모르는 칸은 받지 않는다(파일에 이미 있는 모르는 칸은 그대로 남는다). */
function cleanFields(input, partial) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad('bad-item', '항목을 알아볼 수 없습니다.');
  const out = {};
  const has = (k) => own(input, k);
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
      if (own(s, 'done') && typeof s.done !== 'boolean') bad('bad-field', '끝냄은 예 · 아니오로 적어 주세요.');
      return { id: typeof s.id === 'string' && s.id ? s.id : null, title, day: s.day, ...(own(s, 'done') ? { done: s.done } : {}) };
    });
  }
  if (has('repeat')) out.repeat = input.repeat; // 다듬기는 합친 뒤(지금 규칙과 하루짜리인지 봐야 한다)
  if (has('folder')) out.folder = input.folder === null ? null : str(input.folder, 600, '폴더');
  for (const k of ['note', 'place', 'who']) if (has(k)) out[k] = input[k] === null ? null : str(input[k], TEXT_MAX, k === 'note' ? '메모' : k === 'place' ? '장소' : '상대');
  if (has('tz')) out.tz = input.tz === null ? null : str(input.tz, 64, '시간대');
  if (has('detachedFrom')) out.detachedFrom = input.detachedFrom === null ? null : str(input.detachedFrom, 40, '연결');
  if (has('tags')) { if (!Array.isArray(input.tags)) bad('bad-field', '꼬리표를 알아볼 수 없습니다.'); if (input.tags.length > 20) bad('too-many', '꼬리표는 20개까지입니다.'); out.tags = input.tags.map((t) => str(t, 40, '꼬리표')).filter(Boolean); }
  for (const k of ['due', 'followUp']) if (has(k)) { if (input[k] !== null && !isDate(input[k])) bad('bad-date', '날짜를 알아볼 수 없습니다.'); out[k] = input[k]; }
  if (has('estimate')) { const n = input.estimate; if (n !== null && !(typeof n === 'number' && n >= 0 && n <= 100000)) bad('bad-field', '예상 시간을 알아볼 수 없습니다.'); out.estimate = n; }
  if (has('alerts')) { if (input.alerts !== null && (typeof input.alerts !== 'object' || Array.isArray(input.alerts))) bad('bad-field', '알림 설정을 알아볼 수 없습니다.'); out.alerts = clone(input.alerts); }
  if (has('action')) { if (input.action !== null && (typeof input.action !== 'object' || Array.isArray(input.action) || JSON.stringify(input.action).length > 6000)) bad('bad-field', '제안의 할 일을 알아볼 수 없습니다.'); out.action = clone(input.action); }
  if (has('links')) { if (!Array.isArray(input.links) || input.links.some((x) => typeof x !== 'string')) bad('bad-field', '연결을 알아볼 수 없습니다.'); if (input.links.length > 50) bad('too-many', '연결은 50개까지입니다.'); out.links = [...input.links]; }
  return out;
}

/** 합친 항목이 말이 되는지 보고, 단계가 기간 밖으로 나가면 기간을 넓히고, 단계가 있으면 끝냄을 단계에서 다시 셈한다. */
function settle(it, at) {
  if (it.end === it.start) it.end = null;
  if (it.end && it.end < it.start) bad('end-before-start', '끝나는 날이 시작하는 날보다 앞입니다.');
  if (it.timeEnd && !it.time) bad('bad-time', '끝 시각만 있고 시작 시각이 없습니다.');
  if (it.time && it.timeEnd && !it.end && it.timeEnd <= it.time) bad('bad-time', '끝 시각이 시작 시각보다 앞이거나 같습니다.');
  if (hasSteps(it)) {
    for (const s of it.steps) { if (!s.id) s.id = newId(); s.done = !!s.done; if (s.done) s.doneAt = s.doneAt || at; else delete s.doneAt; }
    if (new Set(it.steps.map((s) => s.id)).size !== it.steps.length) bad('bad-steps', '단계 번호가 겹칩니다.');
    const days = it.steps.map((s) => s.day).sort();
    const first = it.start < days[0] ? it.start : days[0];                       // 지금 기간과 단계 날짜의 합집합
    const last = endOf(it) > days[days.length - 1] ? endOf(it) : days[days.length - 1];
    it.start = first; it.end = last === first ? null : last;
    it.done = it.steps.every((s) => s.done);
  } else delete it.steps;
  it.done = !!it.done;
  if (it.done) it.doneAt = it.doneAt || at; else delete it.doneAt;
  if (it.repeat != null) {
    if (isPeriod(it) || hasSteps(it)) bad('bad-repeat', '반복은 하루짜리 일에만 붙일 수 있습니다.');
    if (it.repeat.until && it.repeat.until < it.start) bad('bad-repeat', '반복이 끝나는 날이 시작하는 날보다 앞입니다.');
    it.done = false; delete it.doneAt; // 반복하는 일은 날마다 따로 끝낸다(repeat.done)
  } else delete it.repeat;
  return it;
}

export class PlannerStore {
  /** @param {{ dir: string, now?: () => Date, log?: (m: string) => void }} o */
  constructor({ dir, now = () => new Date(), log = () => {} }) {
    this.dir = dir; this.now = now; this.log = log;
    this.file = path.join(dir, 'items.json'); this.changesFile = path.join(dir, 'changes.jsonl'); this.backupDir = path.join(dir, 'backup');
    this.#reset();
    this.load();
  }
  #reset() { this.head = { schema: SCHEMA, seq: 0, rev: 0 }; this.items = []; this.junk = []; this.readOnly = false; this.readOnlyReason = null; this.recovered = null; this.sig = 'none'; }

  // ---- 읽기 ----
  load() {
    this.#reset();
    if (!fs.existsSync(this.file)) return;
    const r = this.#read(this.file);
    if (r.ok) return this.#adopt(r.data, r.future);
    // 깨진 장부: 따로 옮긴 것이 확인돼야 쓰기를 연다. 그 뒤 가장 새(읽을 수 있는) 사본으로 연다.
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const broken = path.join(this.dir, `items.broken-${stamp}.json`);
    let moved = false;
    try { this._quarantine(this.file, broken); moved = !fs.existsSync(this.file) && fs.existsSync(broken); } catch { moved = false; }
    for (const b of this.backups()) {
      const rb = this.#read(path.join(this.backupDir, b));
      if (!rb.ok || rb.future) continue;
      this.#adopt(rb.data, false);
      this.recovered = { broken: moved ? path.basename(broken) : null, from: b, reason: r.reason };
      this.log(`planner: 장부를 읽지 못해 사본 ${b} 로 열었습니다 (${r.reason})`);
      break;
    }
    if (!this.recovered) { this.recovered = { broken: moved ? path.basename(broken) : null, from: null, reason: r.reason }; this.log(`planner: 장부를 읽지 못했고 쓸 수 있는 사본도 없습니다 (${r.reason})`); }
    if (!moved) { this.readOnly = true; this.readOnlyReason = 'quarantine-failed'; this.log('planner: 깨진 장부를 따로 옮기지 못해 읽기만 합니다(덮어쓰지 않음)'); return; }
    this.sig = 'none';
    if (this.recovered.from) { try { this.#save(this.head, this.items); } catch (e) { this.log(`planner: 복구한 장부를 다시 쓰지 못했습니다 (${e.code || 'error'})`); } }
  }
  /** 깨진 장부를 따로 옮긴다(시험에서 바꿔 끼울 수 있게 따로 둔다). */
  _quarantine(from, to) { fs.renameSync(from, to); }
  #read(f) {
    try {
      const raw = fs.readFileSync(f, 'utf8');
      const data = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'shape' };
      if (Number.isInteger(data.schema) && data.schema > SCHEMA) return { ok: true, future: true, data }; // 더 새로운 형식: 구조를 따지지 않는다
      if (!Number.isInteger(data.schema) || data.schema < 1 || !Array.isArray(data.items)) return { ok: false, reason: 'shape' };
      return { ok: true, future: false, data };
    } catch (e) { return { ok: false, reason: e instanceof SyntaxError ? 'json' : String(e.code || 'read').slice(0, 20) }; }
  }
  #adopt(data, future) {
    const { items, ...head } = data;
    const all = Array.isArray(items) ? items : [];
    const seen = new Set(); this.items = []; this.junk = [];
    for (const it of all) { if (valid(it) && !seen.has(it.id)) { seen.add(it.id); this.items.push(it); } else this.junk.push(it); }
    const maxNo = this.items.reduce((m, it) => (Number.isSafeInteger(it.no) && it.no > m ? it.no : m), 0);
    this.head = { ...head, seq: Number.isSafeInteger(head.seq) && head.seq >= maxNo ? head.seq : maxNo, rev: Number.isSafeInteger(head.rev) && head.rev >= 0 ? head.rev : 0 };
    if (this.junk.length) this.log(`planner: 알아볼 수 없는 항목 ${this.junk.length}개는 화면에 내지 않고 파일에 그대로 둡니다`);
    if (future) { this.readOnly = true; this.readOnlyReason = 'newer-schema'; this.log(`planner: 장부 형식 ${head.schema} 은(는) 이 판(${SCHEMA})보다 새것 — 읽기만 합니다`); }
    this.sig = this.#stat();
  }
  #stat() { try { const s = fs.statSync(this.file); return `${s.mtimeMs}:${s.size}`; } catch { return 'none'; } }
  backups() { try { return fs.readdirSync(this.backupDir).filter((n) => /^items-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse(); } catch { return []; } }

  get rev() { return this.head.rev || 0; }
  get lastChange() { return this.head.last || null; }
  /** state: 'active' | 'proposed' | 'trash' | undefined(전부). 돌려주는 것은 사본이다. */
  list(state) { return clone(state ? this.items.filter((it) => it.state === state) : this.items); }
  get(id) { return clone(this.#find(id)); }
  /** 번호(#12)로 찾기 — 사람·에이전트가 부르는 이름 */
  byNo(no) { return clone(this.items.find((it) => it.no === Number(no)) || null); }
  #find(id) { return this.items.find((it) => it.id === id) || null; }
  #blocked() {
    if (!this.readOnly) return;
    if (this.readOnlyReason === 'newer-schema') bad('read-only', '이 장부는 더 새로운 IRIS 가 쓰던 것이라 지금 판에서는 고칠 수 없습니다. IRIS 를 업데이트해 주세요.');
    bad('read-only', '장부 파일을 읽지 못했고 따로 옮기지도 못해, 덮어쓰지 않으려고 고치기를 막아 두었습니다.');
  }

  // ---- 쓰기 ----
  /**
   * 조작 묶음을 한 번에. 하나라도 말이 안 되면 아무것도 적지 않는다(PlannerError).
   * ops: { op:'add'|'propose', item } · { op:'update', id, patch } · { op:'check', id, done, stepId?, date? }
   *      · { op:'remove', id }(휴지통) · { op:'restore', id } · { op:'accept', id, patch? } · { op:'decline', id } · { op:'purge', id }
   * meta: { by:'user'|'session'|'iris'|'system', via?(VIA), session?, asked?, evidence?, note? }
   * @returns {{ rev: number, changeId: string, ids: string[], items: object[] }}
   */
  apply(ops, meta = {}) {
    this.#blocked();
    if (!Array.isArray(ops) || !ops.length) bad('no-ops', '바꿀 것이 없습니다.');
    if (ops.length > OPS_MAX) bad('too-many', `한 번에 바꿀 수 있는 것은 ${OPS_MAX}건까지입니다.`);
    const at = this.now().toISOString();
    const work = clone(this.items); let seq = this.head.seq || 0;
    const find = (id) => { const it = work.find((x) => x.id === id); if (!it) bad('not-found', '그 일을 찾지 못했습니다.'); return it; };
    const before = new Map(); // id → 바꾸기 전(없던 것은 null)
    const touch = (id) => { if (!before.has(id)) before.set(id, clone(this.#find(id))); };
    const source = this.#source(meta);
    for (const o of ops) {
      if (!o || typeof o !== 'object') bad('bad-op', '조작을 알아볼 수 없습니다.');
      if (o.op === 'add' || o.op === 'propose') {
        const f = cleanFields(o.item, false);
        const it = settle({ id: newId(), no: ++seq, kind: 'item', state: o.op === 'add' ? 'active' : 'proposed', end: null, time: null, timeEnd: null, done: false, tz: sysTz(), ...f, repeat: cleanRepeat(f.repeat ?? null, null), source: clone(source), createdAt: at, updatedAt: at }, at);
        touch(it.id); work.push(it);
      } else if (o.op === 'update' || o.op === 'accept') {
        const it = find(o.id); touch(it.id);
        if (o.op === 'accept') { if (it.state !== 'proposed') bad('not-proposed', '이미 처리한 제안입니다.'); it.state = 'active'; it.acceptedAt = at; }
        else if (it.state === 'trash') bad('in-trash', '휴지통에 있는 일입니다. 먼저 되살려 주세요.');
        const f = cleanFields(o.patch || {}, true);
        if (f.steps) { const old = new Map((it.steps || []).map((s) => [s.id, s])); f.steps = f.steps.map((s) => (s.id && old.has(s.id) ? { ...old.get(s.id), title: s.title, day: s.day, done: 'done' in s ? s.done : !!old.get(s.id).done } : s)); }
        const repeat = 'repeat' in f ? cleanRepeat(f.repeat, it.repeat) : it.repeat;
        const alerts = 'alerts' in f ? (f.alerts === null ? null : { ...(it.alerts && typeof it.alerts === 'object' ? it.alerts : {}), ...f.alerts }) : it.alerts; // 모르는 알림 칸을 지우지 않는다
        Object.assign(it, f, { repeat, updatedAt: at });
        if (alerts == null) delete it.alerts; else it.alerts = alerts;
        if ('time' in f && f.time === null) it.timeEnd = null;
        settle(it, at);
      } else if (o.op === 'check') {
        const it = find(o.id); touch(it.id);
        if (it.state !== 'active') bad('not-active', '달력에 올라와 있는 일만 끝냄으로 바꿀 수 있습니다.');
        if (typeof o.done !== 'boolean') bad('bad-field', '끝냄은 예 · 아니오로 알려 주세요.');
        if (it.repeat) {
          if (!isDate(o.date)) bad('bad-date', '반복하는 일은 어느 날의 것인지 알려 주세요.');
          if (!occursOn(it, o.date)) bad('bad-date', '그날에는 이 일이 없습니다.');
          it.repeat.done = { ...(it.repeat.done || {}) }; if (o.done) it.repeat.done[o.date] = at; else delete it.repeat.done[o.date];
        } else if (o.stepId) {
          const s = (it.steps || []).find((x) => x.id === o.stepId); if (!s) bad('not-found', '그 단계를 찾지 못했습니다.');
          s.done = o.done; if (!o.done) delete s.doneAt;
        } else if (hasSteps(it)) { for (const s of it.steps) { s.done = o.done; if (!o.done) delete s.doneAt; } }
        else it.done = o.done;
        it.updatedAt = at; settle(it, at);
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
    const change = { id: `c${this.rev + 1}-${crypto.randomBytes(3).toString('hex')}`, rev: this.rev + 1, at, by: source, note: meta.note ? str(String(meta.note), 200, '메모') : null, ops: ids.map((id) => ({ id, before: before.get(id), after: clone(work.find((x) => x.id === id) || null) })) };
    this.#commit(work, seq, change);
    this.log(`planner: rev ${this.rev} ops=${[...new Set(ops.map((o) => o.op))].join(',')} n=${ops.length} by=${source.by}${source.via ? '/' + source.via : ''} items=${ids.length}`);
    return { rev: this.rev, changeId: change.id, ids, items: ids.map((id) => this.get(id)) };
  }
  #source(meta) {
    return {
      by: ['user', 'session', 'iris', 'system'].includes(meta.by) ? meta.by : 'user',
      via: VIA.has(meta.via) ? meta.via : null,
      session: meta.session ? { id: String(meta.session.id || '').slice(0, 80), title: String(meta.session.title || '').slice(0, 120), agent: String(meta.session.agent || '').slice(0, 20) } : null,
      asked: !!meta.asked, evidence: meta.evidence ? String(meta.evidence).slice(0, TEXT_MAX) : null,
    };
  }

  /** 방금 한 변경(또는 changeId 의 변경)을 되돌린다. 그 뒤에 같은 항목을 사용자가 또 바꿨으면 거절한다(알림 기록은 바뀐 것으로 치지 않는다). */
  undo(changeId = null) {
    this.#blocked();
    const last = this.lastChange;
    const ch = changeId ? (last && last.id === changeId ? last : this.changes(300).find((c) => c.id === changeId)) : last;
    if (!ch) bad('nothing-to-undo', '되돌릴 것이 없습니다.');
    if (ch.undoOf) bad('nothing-to-undo', '되돌리기를 다시 되돌릴 수는 없습니다.');
    if (ch.undone) bad('nothing-to-undo', '이미 되돌렸습니다.');
    const work = clone(this.items);
    for (const o of ch.ops) {
      const cur = work.find((x) => x.id === o.id) || null;
      if (JSON.stringify(userPart(cur)) !== JSON.stringify(userPart(o.after))) bad('changed-since', '그 뒤에 또 바뀐 일이 있어 되돌릴 수 없습니다.');
      if (cur) work.splice(work.indexOf(cur), 1);
      if (o.before) work.push({ ...clone(o.before), ...(cur && cur.alerted ? { alerted: cur.alerted } : {}) });
    }
    const at = this.now().toISOString();
    const change = { id: `c${this.rev + 1}-${crypto.randomBytes(3).toString('hex')}`, rev: this.rev + 1, at, by: { by: 'user', via: 'undo', session: null, asked: true, evidence: null }, note: null, undoOf: ch.id, ops: ch.ops.map((o) => ({ id: o.id, before: o.after, after: o.before })) };
    this.#commit(work.sort((a, b) => (a.no || 0) - (b.no || 0)), this.head.seq, change);
    this.log(`planner: rev ${this.rev} undo items=${ch.ops.length}`);
    return { rev: this.rev, changeId: change.id, ids: ch.ops.map((o) => o.id) };
  }

  /** 알림을 한 번만 하려고 적어 두는 기록(조각 ⑤) — 변경 기록 · 판 번호에는 남기지 않는다(되돌리기 대상이 아님). */
  markAlerted(marks) {
    if (this.readOnly || !Array.isArray(marks) || !marks.length) return 0;
    const at = this.now().toISOString(); let n = 0;
    const work = clone(this.items);
    for (const { id, key } of marks) { const it = work.find((x) => x.id === id); if (!it || typeof key !== 'string') continue; it.alerted = { ...(it.alerted || {}), [key]: at }; n++; }
    if (!n) return 0;
    try { this.#fresh(); this.#save(this.head, work); this.items = work; } catch (e) { this.log(`planner: 알린 기록을 적지 못했습니다 (${e.code || 'error'})`); return 0; }
    return n;
  }

  /** 휴지통 30일 넘은 것 지우기 + 사본은 읽을 수 있는 것 30장만 남기기. 데몬 시작 때와 하루 한 번. 읽기만일 때는 아무것도 지우지 않는다. */
  sweep() {
    const out = { purged: 0, backupsRemoved: 0 };
    if (this.readOnly) return out;
    const limit = this.now().getTime() - TRASH_DAYS * 86400000;
    const dead = this.items.filter((it) => it.state === 'trash' && !(Date.parse(it.trashedAt || '') >= limit));
    for (let i = 0; i < dead.length; i += OPS_MAX) { this.apply(dead.slice(i, i + OPS_MAX).map((it) => ({ op: 'purge', id: it.id })), { by: 'system', via: 'sweep' }); out.purged += Math.min(OPS_MAX, dead.length - i); }
    let good = 0; // 읽을 수 있는 사본을 새것부터 세어, 30장을 채운 뒤의 것만 지운다(깨진 사본이 멀쩡한 옛 사본을 밀어내지 않게)
    for (const b of this.backups()) {
      if (good >= BACKUP_KEEP) { try { fs.unlinkSync(path.join(this.backupDir, b)); out.backupsRemoved++; } catch { /* 다음 차례 */ } continue; }
      const r = this.#read(path.join(this.backupDir, b)); if (r.ok && !r.future) good++;
    }
    return out;
  }

  /** 지난 변경 기록(새것부터). */
  changes(limit = 20) {
    let text; try { text = fs.readFileSync(this.changesFile, 'utf8'); } catch { return []; }
    const out = []; const undone = new Set();
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      if (!lines[i].trim()) continue;
      let c; try { c = JSON.parse(lines[i]); } catch { continue; }
      if (!c || typeof c !== 'object' || !Array.isArray(c.ops)) continue;
      if (c.undoOf) undone.add(c.undoOf);
      if (undone.has(c.id)) c.undone = true;
      out.push(c);
    }
    return out;
  }

  /** 저장 직전: 파일이 내가 마지막으로 본 것과 다르면(다른 곳에서 씀) 다시 읽고 거절한다. */
  #fresh() {
    if (this.#stat() === this.sig) return;
    this.log('planner: 장부가 다른 곳에서 바뀌어 다시 읽었습니다');
    this.load();
    bad('conflict', '장부가 다른 곳에서 바뀌어 다시 읽었습니다. 한 번 더 해 주세요.');
  }
  #commit(work, seq, change) {
    this.#fresh();
    this.#backupOnce();
    const head = { ...this.head, schema: this.head.schema || SCHEMA, seq, rev: change.rev, updatedAt: change.at, last: change };
    this.#save(head, work);            // 여기서 실패하면 메모리는 그대로다
    this.items = work; this.head = head;
    try { fs.appendFileSync(this.changesFile, `${JSON.stringify(change)}\n`, 'utf8'); } catch (e) { this.log(`planner: 변경 이력을 덧붙이지 못했습니다 (${e.code || 'error'}) — 장부와 방금 것 되돌리기는 저장됨`); }
  }
  /** 임시 파일에 다 쓰고 디스크로 밀어 넣은 뒤 이름을 바꾼다. 실패하면 PlannerError('write-failed'). */
  #save(head, items) {
    const tmp = `${this.file}.tmp-${process.pid}`;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const fd = fs.openSync(tmp, 'w');
      try { fs.writeSync(fd, `${JSON.stringify({ ...head, items: [...items, ...this.junk] }, null, 1)}\n`, null, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, this.file);
    } catch (e) {
      try { if (fs.statSync(tmp).isFile()) fs.unlinkSync(tmp); } catch { /* 없음 */ }
      this.log(`planner: 장부를 저장하지 못했습니다 (${e.code || 'error'})`);
      throw new PlannerError('write-failed', '장부를 저장하지 못했습니다. 바꾼 것은 적용되지 않았습니다.');
    }
    this.sig = this.#stat();
  }
  /** 그날 사본이 없으면 직전 장부를 사본으로(임시 파일 → 이름 바꾸기). 못 만들어도 저장은 계속한다. */
  #backupOnce() {
    if (!fs.existsSync(this.file)) return;
    const f = path.join(this.backupDir, `items-${localDate(this.now())}.json`);
    if (fs.existsSync(f)) return;
    const tmp = `${f}.tmp-${process.pid}`;
    try { fs.mkdirSync(this.backupDir, { recursive: true }); fs.copyFileSync(this.file, tmp); fs.renameSync(tmp, f); }
    catch (e) { try { fs.unlinkSync(tmp); } catch { /* 없음 */ } this.log(`planner: 사본을 만들지 못했습니다 (${e.code || 'error'})`); }
  }
}
