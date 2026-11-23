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
export const QUIET_MAX_MS = 48 * 3600_000; // 이보다 먼 「잠시 조용히」는 믿지 않는다(걸 수 있는 가장 긴 것이 하루)
export const MUTED_MAX = 20;               // 조용히 하는 동안 미뤄 두는 말의 수(넘으면 오래된 것부터 버린다 — 장부의 변경 기록에는 남는다)
export const CROWD_MIN = 4;
export const BODY_MAX = 64 * 1024; // /api/planner/* 가 받는 요청 본문의 상한    // 한 주(월~일)에 마감(기간의 마지막 날)이 이만큼이면 "몰렸다"고 말한다

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
  constructor({ dir, stateDir, settings, broadcast = () => {}, log = () => {}, now = () => new Date(), openDir = null }) {
    this.now = now; this.log = log; this.settings = settings; this.stateDir = stateDir; this.dir = dir;
    this.cast = broadcast; this.openDir = openDir; // openDir(dir) = 탐색기로 그 폴더 열기(server.mjs 가 꽂는다 — 시험에서는 없음)
    this.muted = 0; this.mutedSays = null;          // 「잠시 조용히」 동안 미뤄 둔 말(끝나면 규칙 알림이 다시 말한다) — 처음 쓸 때 파일에서 읽는다
    this.store = new PlannerStore({ dir, now, log, autoload: false });
    this.secret = null; this.started = false; this.failed = false;
    this.rules = null;    // 규칙 알림(planner-rules.mjs) — server.mjs 가 꽂는다
    this.talkSvc = null;  // 아이리스에게 말하기(planner-talk.mjs) — server.mjs 가 꽂는다
    this.cliSvc = null;   // 세션용 명령의 창구(planner-cli.mjs) — server.mjs 가 꽂는다
    this.checkSvc = null; // 준비 점검(planner-check.mjs) — server.mjs 가 꽂는다
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
  hello() { return { ok: !this.failed, enabled: this.enabled, rev: this.store.rev, proposals: this.store.list('proposed').length, readOnly: this.store.readOnly, recovered: !!this.store.recovered, asks: this.asks() }; }
  /** 답을 기다리는 물음(세션이 지우려는 것의 확인) — 화면이 다시 붙거나 플래너를 다시 켰을 때 말풍선을 되살리려고 준다. */
  asks() { try { return this.cliSvc && !this.failed && this.started ? this.cliSvc.asks() : []; } catch { return []; } }

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
  /** 전부 종료: 규칙 점검을 멈추고, 돌고 있는 숨은 호출이 있으면 끝낸다(새로 부르지도 않는다). */
  stop() { try { this.rules?.stop(); } catch { /* 이미 멈춤 */ } try { return this.talkSvc?.stop() || null; } catch { return null; } } // 돌려주는 것: 끝내려 한 숨은 호출 { pid, gone } 또는 null
  /** 화면에 알린다 — 장부는 이미 저장됐으므로, 알리다 실패해도 던지지 않는다. */
  #changed(say) { const s = say && !this.#mute() ? say : null; this.#send({ type: 'planner', rev: this.store.rev, proposals: this.store.list('proposed').length, ...(s ? { say: s } : {}) }); }
  #send(o) { try { this.cast(o); } catch (e) { this.log(`planner: 화면에 알리지 못했습니다 (${e?.code || e?.name || 'error'})`); } }
  /** 말풍선으로 한마디(장부는 그대로) — 규칙 알림 · 세션이 넣었을 때. 「잠시 조용히」 동안에는 말하지 않고 개수만 센다(달력 · 제안 숫자는 그대로 바뀐다). */
  say(say) { if (this.#mute(say)) return this.#send({ type: 'planner', rev: this.store.rev, proposals: this.store.list('proposed').length }); this.#send({ type: 'planner', rev: this.store.rev, proposals: this.store.list('proposed').length, say }); }
  // 조용히 하는 동안의 말은 버리지 않고 모아 둔다(되돌리기 · 확인 단추까지) — 끝나면 규칙 알림이 다시 말한다. 꺼졌다 켜져도 남게 파일에도 적는다.
  #mutedFile() { return path.join(this.stateDir, 'planner-muted.json'); }
  #mutedLoad() { if (this.mutedSays) return; this.mutedSays = []; try { const a = JSON.parse(fs.readFileSync(this.#mutedFile(), 'utf8')); if (Array.isArray(a)) this.mutedSays = a.filter((s) => s && typeof s.text === 'string').slice(-MUTED_MAX); } catch { /* 없음 */ } this.muted = this.mutedSays.length; }
  #mutedSave() { try { const f = this.#mutedFile(); if (!this.mutedSays.length) { try { fs.unlinkSync(f); } catch { /* 없음 */ } return; } fs.mkdirSync(this.stateDir, { recursive: true }); const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(this.mutedSays), 'utf8'); fs.renameSync(tmp, f); } catch (e) { this.log(`planner: 미뤄 둔 말을 적지 못했습니다 (${e?.code || 'error'})`); } }
  #mute(say) {
    if (!this.quietNow()) return false;
    this.#mutedLoad();
    if (say && typeof say.text === 'string') { this.mutedSays.push(say); if (this.mutedSays.length > MUTED_MAX) this.mutedSays.splice(0, this.mutedSays.length - MUTED_MAX); this.#mutedSave(); }
    this.muted = this.mutedSays.length;
    return true;
  }
  /** 조용히 하는 동안 미뤄 둔 말들을 돌려주고 비운다(규칙 알림이 조용히가 끝났을 때 부른다). */
  takeMuted() { this.#mutedLoad(); const list = this.mutedSays; this.mutedSays = []; this.muted = 0; if (list.length) this.#mutedSave(); return list; }

  // ---- 잠시 조용히(설계 조각 ⑧): 끝나는 시각 하나(settings.plannerQuietUntil). 플래너의 말풍선만 멈춘다 — 달력과 작업 완료 알림은 그대로. ----
  //   화면 · 말로 걸 수 있는 가장 긴 조용히는 하루다. 그보다 훨씬 먼 값(설정 파일을 손으로 고쳤거나 시계가 바뀐 경우)은 조용히로 보지 않는다 — 영영 말하지 않게 되는 것을 막는다.
  quietNow(nowMs = this.now().getTime()) { const u = this.cfg().plannerQuietUntil; const t = u ? Date.parse(u) : NaN; return Number.isFinite(t) && nowMs < t && t - nowMs <= QUIET_MAX_MS; }
  /**
   * 말로 시킨 조용히("1시간 동안 알리지 마"): minutes(1~1440) · until:'today'(오늘 하루 = 내일 0시까지) · off:true(다시 알리기).
   * 설정에 적고 화면의 설정 사본도 맞춘다(방송의 cfg). 던지지 않는다 — { ok, say }.
   */
  setQuiet({ minutes, until, off } = {}) {
    const now = this.now(); let t = null;
    if (off !== true) {
      if (until === 'today') t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      else { const m = Number(minutes); if (!Number.isInteger(m) || m < 1 || m > 1440) return { ok: false, say: '얼마 동안 조용히 할지 다시 말해 주세요(길어도 하루까지예요).' }; t = new Date(now.getTime() + m * 60_000); }
    }
    const iso = t ? t.toISOString() : null;
    if (typeof this.settings.set !== 'function') return { ok: false, say: '지금은 설정을 바꿀 수 없어요. 설정 → 플래너에서 바꿔 주세요.' };
    let saved; try { saved = this.settings.set({ plannerQuietUntil: iso }); } catch (e) { this.log(`planner: 설정을 적지 못했습니다 (${e?.code || 'error'})`); return { ok: false, say: '설정을 적지 못했어요. 설정 → 플래너에서 바꿔 주세요.' }; }
    // 화면의 설정 사본을 맞추는 방송: 바뀐 키와 데몬이 적은 시각(updatedAt)을 함께 — 화면이 자기 시각으로 "최신"을 만들지 않게
    this.#send({ type: 'planner', rev: this.store.rev, proposals: this.store.list('proposed').length, cfg: { plannerQuietUntil: iso }, cfgAt: (saved && saved.updatedAt) || null });
    this.log(`planner: quiet ${iso ? 'on' : 'off'}`);
    if (!t) return { ok: true, say: '네, 다시 알릴게요.', quietUntil: null };
    const h = t.getHours(), mi = t.getMinutes();
    const word = until === 'today' ? '오늘은' : `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시${mi ? ` ${mi}분` : ''}까지`;
    return { ok: true, say: `${word} 조용히 할게요. 그사이 지나간 약속은 끝나면 모아서 말할게요.`, quietUntil: iso };
  }

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
      // 플래너의 POST 는 모두 작은 JSON 이다 — 크기를 밝히지 않았거나(조각 전송) 큰 요청은 읽기 전에 거절한다(데몬의 메모리를 지킨다)
      if (req.method === 'POST') {
        const len = Number(req.headers?.['content-length']);
        if (req.headers && (req.headers['transfer-encoding'] || !(len >= 0) || len > BODY_MAX)) { this.log(`planner: 413 ${where}`); return h.json(res, 413, { ok: false, code: 'too-large', error: '요청이 너무 큽니다.', text: '요청이 너무 큽니다.' }); }
      }
      if (req.method === 'GET' && p === '/api/planner/view') return h.json(res, 200, this.view({ month: q.get('month'), day: q.get('day') }));
      if (req.method === 'GET' && p === '/api/planner/asks') return h.json(res, 200, { ok: true, asks: this.asks() });
      if (req.method === 'GET' && p === '/api/planner/changes') return h.json(res, 200, { ok: true, changes: this.store.changes(Math.min(100, Math.max(1, Number(q.get('limit')) || 20))) });
      if (req.method === 'GET' && p === '/api/planner/usage') return h.json(res, 200, { ok: true, ...(this.talkSvc ? this.talkSvc.usage() : { today: { calls: 0, tokens: 0 }, week: { calls: 0, tokens: 0 }, model: null, inbox: 0 }) });
      if (req.method === 'POST' && p === '/api/planner/cli') {
        // 세션용 명령(iris-planner): 화면이 아니라 세션 안의 명령이 부른다 — 출처가 붙어 온 요청(웹 쪽)은 받지 않고, 그 세션의 열쇠로 가린다.
        if (req.headers.origin) { this.log(`planner: 403 ${where} (웹 쪽 요청)`); return h.json(res, 403, { ok: false, text: 'forbidden' }); }
        let b; try { b = await h.readBody(req); } catch { b = null; }
        if (!b || typeof b !== 'object' || Array.isArray(b)) return h.json(res, 400, { ok: false, text: '요청을 알아볼 수 없습니다.' });
        if (!this.cliSvc) return h.json(res, 503, { ok: false, text: '플래너를 지금 쓸 수 없습니다.' });
        const r = this.cliSvc.handle(req.headers, b);
        return h.json(res, r.code, r.out);
      }
      if (req.method === 'POST' && p === '/api/planner/talk') {
        // 아이리스에게 말하기: 같은 출처만. 말 · 답은 로그에 싣지 않는다. 결과는 언제나 200 + { ok, say, … }(화면이 대화에 그대로 적는다).
        if (!h.sameOrigin(req)) { this.log(`planner: 403 ${where} (다른 출처)`); return h.json(res, 403, { ok: false, code: 'forbidden', error: 'forbidden origin' }); }
        let b; try { b = await h.readBody(req); } catch { b = null; }
        if (!b || typeof b !== 'object' || Array.isArray(b)) return h.json(res, 400, { ok: false, code: 'bad-json', error: '요청을 알아볼 수 없습니다.' });
        if (!this.talkSvc) return h.json(res, 200, { ok: false, say: '지금은 아이리스를 부를 수 없어요.' });
        return h.json(res, 200, await this.talkSvc.talk(b));
      }
      if (req.method === 'POST' && (p === '/api/planner/intro-seen' || p === '/api/planner/confirm')) {
        if (!h.sameOrigin(req)) { this.log(`planner: 403 ${where} (다른 출처)`); return h.json(res, 403, { ok: false, code: 'forbidden', error: 'forbidden origin' }); }
        let b; try { b = await h.readBody(req); } catch { b = null; }
        if (!b || typeof b !== 'object' || Array.isArray(b)) return h.json(res, 400, { ok: false, code: 'bad-json', error: '요청을 알아볼 수 없습니다.' });
        // 처음 한 번 소개: 화면이 말풍선을 실제로 보여 줬을 때 알려 온다 — 그때 "소개했다"고 적는다(방송만 하고 적으면 아무도 못 본 채 지나갈 수 있다)
        if (p === '/api/planner/intro-seen') { try { this.rules?.introSeen(); } catch { /* 적지 못해도 화면은 그대로 */ } return h.json(res, 200, { ok: true }); }
        // 세션이 지우려는 것에 대한 사용자의 답(말풍선의 「지우기」 · 「그대로 두기」)
        if (!this.cliSvc) return h.json(res, 503, { ok: false, say: '플래너를 지금 쓸 수 없습니다.' });
        return h.json(res, 200, this.cliSvc.confirm(typeof b.token === 'string' ? b.token : '', b.yes === true));
      }
      if (req.method === 'POST' && p === '/api/planner/open-folder') {
        // 설정의 「수첩 폴더 열기」: 같은 출처만, 요청이 준 경로는 쓰지 않는다(여는 곳은 언제나 수첩 폴더 하나). 쓰기 전에는 폴더가 없다 — 만들지 않고 그렇게 말한다.
        if (!h.sameOrigin(req)) { this.log(`planner: 403 ${where} (다른 출처)`); return h.json(res, 403, { ok: false, code: 'forbidden', error: 'forbidden origin' }); }
        let isDir = false; try { isDir = fs.statSync(this.dir).isDirectory(); } catch { /* 아직 없음 */ }
        if (!isDir) return h.json(res, 404, { ok: false, code: 'empty', error: '아직 수첩에 적은 것이 없어 폴더가 없습니다. 일정을 하나 넣으면 생깁니다.' });
        if (typeof this.openDir !== 'function') return h.json(res, 503, { ok: false, code: 'unavailable', error: '지금은 폴더를 열 수 없습니다.' });
        try { this.openDir(this.dir); this.log('planner: open-folder'); return h.json(res, 200, { ok: true }); }
        catch (e) { this.log(`planner: open-folder 실패 ${e?.code || e?.name || 'error'}`); return h.json(res, 500, { ok: false, code: 'error', error: '폴더를 열지 못했습니다.' }); }
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
