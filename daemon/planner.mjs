// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 플래너 창구(설계 조각 ④, 2026-11-22) — 장부로 들어가는 길은 여기 하나다.
//   판(화면) · 아이리스에게 말하기 · 일하던 세션의 명령 · 제안 승인이 모두 이 창구를 거쳐 planner-store 에 적는다.
//   창구가 하는 일 = 받기 → 검사(store) → 적기 → 겹침 알려 주기 → 화면에 방송({type:'planner'}) → 말풍선으로 알리기.
// 지킬 것:
//   · 화면에서 오는 쓰기는 같은 출처만(웹 페이지가 적지 못하게). 세션의 명령은 그 세션의 열쇠가 있어야 받는다(누가 넣었는지 알기 위해).
//     같은 사용자의 다른 프로그램까지 막는 장치는 아니다 — 그 프로그램은 장부 파일도 읽을 수 있다.
//   · 로그에 일정 내용 · 열쇠 값 · 요청이 준 글자를 싣지 않는다(정해진 낱말과 개수만).
//   · 플래너를 끄면(settings.plannerEnabled === false) 쓰기를 받지 않고 자동 정리도 하지 않는다(보기는 됨).
//   · 장부를 여는 일(start)은 데몬이 포트를 잡은 뒤에 한다 — 두 번째로 뜬 데몬이 장부를 건드리고 끝나지 않게.
//     여는 데 실패해도 데몬은 죽지 않고 플래너만 쉰다(failed).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PlannerStore, PlannerError } from './planner-store.mjs';
import { isDate, localDate, localTime, dayRows, monthDots, overlapsWith, dueInWeek, isPeriod, endOf, weekday, itemDone } from './planner-core.mjs';

/** 설정의 처음 값(설계 조각 ⑧) — 없는 키만 이것으로 본다(저장된 값은 건드리지 않는다). */
export const PLANNER_DEFAULTS = Object.freeze({
  plannerEnabled: true,        // 플래너 전체
  plannerMorning: true,        // 아침 인사(가까운 마감 · 몰린 주 포함)
  plannerMorningAt: '08:00',   // 밤새 켜 둔 날의 아침 인사 시각
  plannerStartAlert: true,     // 시작 전 알림
  plannerStartMin: 10,         // 몇 분 전(5 · 10 · 15 · 30)
  plannerEvening: true,        // 하루 끝 정리
  plannerEveningAt: '16:30',
  plannerOverlap: true,        // 겹침 알림
  plannerTalk: true,           // 아이리스에게 말하기
  plannerFromSessions: true,   // 다른 작업에서 넣기
  plannerCheck: false,         // 준비 점검(AI 가 스스로 도는 유일한 기능 — 알고 켜도록 끔)
  plannerQuietUntil: null,     // 잠시 조용히(이 시각까지)
});
export const CROWD_MIN = 4;    // 한 주(월~일)에 마감(기간의 마지막 날)이 이만큼이면 "몰렸다"고 말한다

const WD = ['일', '월', '화', '수', '목', '금', '토'];
/** 받침에 따라 조사 고르기: josa('출장', '을', '를') → '을' */
export function josa(word, withFinal, noFinal) {
  const c = String(word || '').trim().slice(-1).charCodeAt(0);
  if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 ? withFinal : noFinal;
  return `${withFinal}(${noFinal})`;
}
/** '2026-11-26' → '26일 목요일' (다른 달이면 '12월 1일 화요일') */
export function dayLabel(date, today) {
  const d = +date.slice(8), m = +date.slice(5, 7);
  return `${today && date.slice(0, 7) === today.slice(0, 7) ? '' : `${m}월 `}${d}일 ${WD[weekday(date)]}요일`;
}

export class Planner {
  /**
   * @param {{ dir: string, stateDir: string, settings: { get: () => object }, broadcast?: (o: object) => void, log?: (m: string) => void, now?: () => Date }} o
   */
  constructor({ dir, stateDir, settings, broadcast = () => {}, log = () => {}, now = () => new Date() }) {
    this.now = now; this.log = log; this.settings = settings; this.stateDir = stateDir;
    this.cast = broadcast;
    this.store = new PlannerStore({ dir, now, log, autoload: false });
    this.secret = null; this.started = false; this.failed = false;
    this.rules = null;    // 규칙 알림(planner-rules.mjs) — server.mjs 가 꽂는다
    this.talkSvc = null;  // 아이리스에게 말하기(planner-talk.mjs) — server.mjs 가 꽂는다
  }
  /** 장부를 연다. 실패해도 던지지 않는다(플래너만 쉰다). */
  start() {
    try { this.store.load(); this.started = true; this.failed = false; }
    catch (e) { this.failed = true; this.log(`planner: 장부를 열지 못했습니다 (${e?.code || e?.name || 'error'})`); }
    return !this.failed;
  }
  #ready() { if (this.failed || !this.started) throw new PlannerError('unavailable', '플래너를 쓸 수 없는 상태입니다. IRIS 를 다시 켜 주세요.'); }
  cfg() { return { ...PLANNER_DEFAULTS, ...(this.settings.get() || {}) }; }
  get enabled() { return this.cfg().plannerEnabled !== false; }
  today() { return localDate(this.now()); }

  // ---- 보기 ----
  proposals() {
    return this.store.list('proposed').sort((a, b) => (a.no || 0) - (b.no || 0)).map((it) => ({
      id: it.id, no: it.no, title: it.title, start: it.start, end: it.end || null, time: it.time || null,
      evidence: it.source?.evidence || null, by: it.source?.by || 'iris', session: it.source?.session?.title || null, action: it.action || null,
    }));
  }
  /** 화면이 그대로 그리는 한 장: 달력 점 + 고른 날의 줄 + 제안. */
  view({ month, day } = {}) {
    const today = this.today();
    const d = isDate(day) ? day : today;
    const ym = /^\d{4}-\d{2}$/.test(month || '') && isDate(`${month}-01`) ? month : d.slice(0, 7);
    const items = this.store.list();
    const last = this.store.lastChange;
    return {
      ok: !this.failed, enabled: this.enabled, rev: this.store.rev, today, now: localTime(this.now()), month: ym, day: d,
      dots: monthDots(items, ym), rows: dayRows(items, d, today), proposals: this.proposals(),
      readOnly: this.store.readOnly ? (this.store.readOnlyReason || 'read-only') : null, recovered: this.store.recovered ? { from: this.store.recovered.from } : null,
      undo: last && !last.undoOf ? last.id : null,
      empty: !items.some((it) => it.state !== 'trash'),
    };
  }
  /** 웹소켓 첫 인사에 싣는 짧은 상태 */
  hello() { return { ok: !this.failed, enabled: this.enabled, rev: this.store.rev, proposals: this.store.list('proposed').length, readOnly: this.store.readOnly, recovered: !!this.store.recovered }; }

  // ---- 쓰기(창구) ----
  /**
   * 조작 묶음을 적는다. 겹침은 막지 않고 알려 주기만 한다(warnings) — 넣거나 고친 그때만, 끝낸 일에는 말하지 않는다.
   * @returns {{ ok: true, rev, changeId, ids, items, ops, warnings: string[] }}
   */
  apply(ops, meta = {}) {
    this.#ready();
    if (!this.enabled) throw new PlannerError('disabled', '플래너가 꺼져 있습니다. 설정 → 플래너에서 켤 수 있습니다.');
    let r;
    try { r = this.store.apply(ops, meta); }
    catch (e) { if (e instanceof PlannerError && e.code === 'conflict') this.#changed(null); throw e; } // 다시 읽은 장부를 화면도 다시 받게
    const placed = new Set(r.ops.filter((o) => ['add', 'update', 'accept'].includes(o.op)).map((o) => o.id));
    const warnings = this.#warnings(r.items.filter((it) => it && placed.has(it.id)));
    this.#changed(meta.say || null);
    return { ok: true, ...r, warnings };
  }
  #warnings(changed) {
    const out = []; const cfg = this.cfg(); const all = this.store.list(); const today = this.today();
    for (const it of changed) {
      if (it.state !== 'active' || itemDone(it)) continue;
      if (cfg.plannerOverlap && it.time) {
        const hit = overlapsWith(all, it);
        if (hit.length) out.push(`${dayLabel(hit[0].date, today)} ${hit[0].time} 「${hit[0].title}」${hit.length > 1 ? ` 외 ${hit.length - 1}건` : ''}${josa(hit.length > 1 ? '건' : hit[0].title, '과', '와')} 시간이 겹쳐요.`);
      }
      if (isPeriod(it)) { const n = dueInWeek(all, endOf(it)); if (n >= CROWD_MIN) out.push(`${dayLabel(endOf(it), today).replace(/ .요일$/, '')}이 든 주에 마감이 ${n}개 몰려 있어요.`); }
    }
    return [...new Set(out)];
  }
  undo(changeId = null) {
    this.#ready();
    if (!this.enabled) throw new PlannerError('disabled', '플래너가 꺼져 있습니다.');
    let r;
    try { r = this.store.undo(changeId); }
    catch (e) { if (e instanceof PlannerError && e.code === 'conflict') this.#changed(null); throw e; }
    this.#changed(null);
    return { ok: true, ...r };
  }
  /** 제안에 답하기: yes = 달력에 추가(patch 로 고쳐서), no = 추가 안 함 */
  decide(id, yes, patch = null) {
    if (typeof id !== 'string' || !id || typeof yes !== 'boolean') throw new PlannerError('bad-request', '제안에 대한 답을 알아볼 수 없습니다.');
    return this.apply([yes ? { op: 'accept', id, patch: patch || undefined } : { op: 'decline', id }], { by: 'user', via: 'proposal' });
  }
  /** 화면에 알린다 — 장부는 이미 저장됐으므로, 알리다 실패해도 던지지 않는다. */
  #changed(say) { this.#send({ type: 'planner', rev: this.store.rev, proposals: this.store.list('proposed').length, ...(say ? { say } : {}) }); }
  #send(o) { try { this.cast(o); } catch (e) { this.log(`planner: 화면에 알리지 못했습니다 (${e?.code || e?.name || 'error'})`); } }
  /** 말풍선으로 한마디(장부는 그대로) — 규칙 알림 · 세션이 넣었을 때 */
  say(say) { this.#send({ type: 'planner', rev: this.store.rev, proposals: this.store.list('proposed').length, say }); }

  /** 하루 한 번: 휴지통 30일 · 사본 30장. 플래너가 꺼져 있거나 쉬는 중이면 아무것도 하지 않는다. */
  sweep() {
    if (this.failed || !this.started || !this.enabled) return null;
    const rev0 = this.store.rev; let r = null;
    try { r = this.store.sweep(); if (r.purged || r.backupsRemoved) this.log(`planner: sweep purged=${r.purged} backups=${r.backupsRemoved}`); }
    catch (e) { this.log(`planner: sweep error ${e?.code || e?.name || 'error'}`); }
    finally { if (this.store.rev !== rev0) this.#changed(null); } // 일부만 됐어도 바뀐 만큼은 알린다
    return r;
  }

  // ---- 세션의 열쇠(누가 넣었는지 알기 위한 것) ----
  #secret() {
    if (this.secret) return this.secret;
    const f = path.join(this.stateDir, 'planner-key');
    try { const s = fs.readFileSync(f, 'utf8').trim(); if (/^[0-9a-f]{64}$/.test(s)) return (this.secret = s); } catch { /* 처음 */ }
    this.secret = crypto.randomBytes(32).toString('hex');
    try { fs.mkdirSync(this.stateDir, { recursive: true }); fs.writeFileSync(f, this.secret, { encoding: 'utf8', mode: 0o600 }); } catch (e) { this.log(`planner: 열쇠 파일을 쓰지 못했습니다 (${e?.code || 'error'})`); }
    return this.secret;
  }
  keyFor(sessionId) { return crypto.createHmac('sha256', this.#secret()).update(String(sessionId)).digest('hex').slice(0, 40); }
  keyOk(sessionId, key) {
    if (!sessionId || typeof key !== 'string' || key.length !== 40) return false;
    const a = Buffer.from(this.keyFor(sessionId)), b = Buffer.from(key);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // ---- HTTP: /api/planner/* ----
  /** server.mjs 가 넘겨 준다. h = { url, json, readBody, sameOrigin } */
  async route(req, res, h) {
    const p = h.url.pathname, q = h.url.searchParams;
    const where = `${req.method} ${p.slice(0, 40).replace(/[^\w/-]/g, '?')}`;
    const fail = (e) => {
      if (e instanceof PlannerError) { this.log(`planner: ${where} 거절 ${e.code}`); return h.json(res, e.code === 'not-found' ? 404 : ['disabled', 'read-only', 'conflict'].includes(e.code) ? 409 : e.code === 'unavailable' ? 503 : 400, { ok: false, code: e.code, error: e.message }); }
      this.log(`planner: ${where} 오류 ${e?.code || e?.name || 'error'}`);
      return h.json(res, 500, { ok: false, code: 'error', error: '플래너에서 오류가 났습니다.' });
    };
    try {
      if (req.method === 'GET' && p === '/api/planner/view') return h.json(res, 200, this.view({ month: q.get('month'), day: q.get('day') }));
      if (req.method === 'GET' && p === '/api/planner/changes') return h.json(res, 200, { ok: true, changes: this.store.changes(Math.min(100, Math.max(1, Number(q.get('limit')) || 20))) });
      if (req.method === 'GET' && p === '/api/planner/usage') return h.json(res, 200, { ok: true, ...(this.talkSvc ? this.talkSvc.usage() : { today: { calls: 0, tokens: 0 }, week: { calls: 0, tokens: 0 }, model: null, inbox: 0 }) });
      if (req.method === 'POST' && p === '/api/planner/talk') {
        // 아이리스에게 말하기: 같은 출처만. 말 · 답은 로그에 싣지 않는다. 결과는 언제나 200 + { ok, say, … }(화면이 대화에 그대로 적는다).
        if (!h.sameOrigin(req)) { this.log(`planner: 403 ${where} (다른 출처)`); return h.json(res, 403, { ok: false, code: 'forbidden', error: 'forbidden origin' }); }
        let b; try { b = await h.readBody(req); } catch { b = null; }
        if (!b || typeof b !== 'object' || Array.isArray(b)) return h.json(res, 400, { ok: false, code: 'bad-json', error: '요청을 알아볼 수 없습니다.' });
        if (!this.talkSvc) return h.json(res, 200, { ok: false, say: '지금은 아이리스를 부를 수 없어요.' });
        return h.json(res, 200, await this.talkSvc.talk(b));
      }
      if (req.method === 'POST' && ['/api/planner/ops', '/api/planner/undo', '/api/planner/decide'].includes(p)) {
        if (!h.sameOrigin(req)) { this.log(`planner: 403 ${where} (다른 출처)`); return h.json(res, 403, { ok: false, code: 'forbidden', error: 'forbidden origin' }); }
        let b; try { b = await h.readBody(req); } catch { b = null; }
        if (!b || typeof b !== 'object' || Array.isArray(b)) return h.json(res, 400, { ok: false, code: 'bad-json', error: '요청을 알아볼 수 없습니다.' });
        if (p === '/api/planner/ops') {
          // 판에서 손으로 하는 것은 「끝냄」 체크뿐이다(설계 조각 ② — 넣기·고치기·지우기는 말로). 다른 조작은 이 길로 받지 않는다.
          if (!Array.isArray(b.ops) || b.ops.some((o) => !o || o.op !== 'check')) throw new PlannerError('panel-check-only', '판에서는 끝냄 표시만 바꿀 수 있습니다. 넣기와 고치기는 아이리스에게 말해 주세요.');
          return h.json(res, 200, this.apply(b.ops, { by: 'user', via: 'panel' }));
        }
        if (p === '/api/planner/undo') return h.json(res, 200, this.undo(typeof b.changeId === 'string' ? b.changeId : null));
        return h.json(res, 200, this.decide(b.id, b.yes, b.patch && typeof b.patch === 'object' && !Array.isArray(b.patch) ? b.patch : null));
      }
      return h.json(res, 404, { ok: false, code: 'not-found', error: 'not found' });
    } catch (e) { return fail(e); }
  }
}
