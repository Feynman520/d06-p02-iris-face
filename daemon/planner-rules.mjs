// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 플래너 규칙 알림(설계 조각 ⑤ · ⑥의 규칙 쪽, 2026-11-22) — AI 를 쓰지 않는다(토큰 0). 윈도우 예약도 쓰지 않는다.
//   데몬이 켜져 있는 동안 30초마다 장부와 시계를 견줘, 때가 된 것을 말풍선 한마디로 방송한다. 문장은 틀에 이름·숫자만 끼운다.
//   먼저 말 거는 것은 하루에 "아침 한 번 + 약속 직전 + 하루 끝 한 번"뿐이다. 마감 앞 알림은 아침 인사에 합친다.
// 규칙:
//   · 같은 알림은 한 번만 — 약속은 장부의 alerted(그 일의 그 날), 아침·저녁은 상태 파일(planner-rules.json)의 날짜.
//   · 끝낸 일 · 제안(승인 전) · 휴지통의 일은 알리지 않는다. 수첩이 비어 있으면 먼저 말하지 않는다.
//   · 꺼져 있던 동안 지나간 약속은 다음에 켤 때 한 번에 모아 말한다(오늘 것만). 잠자기에서 깨어나도 같은 길 — 타이머가 아니라 시계를 견준다.
//   · 「잠시 조용히」(settings.plannerQuietUntil) 동안에는 말하지 않고, 끝나면 그사이 지나간 약속을 모아 말한다.
//   · 시각 없는 그날 할 일은 아침 인사의 개수에만 들어가고 낮에 따로 알리지 않는다.
// 시험은 시계를 주입한다(now) — 실제 시간에 기대지 않는다. tick() 은 한 번의 점검이고, start() 가 30초마다 부른다.
import fs from 'node:fs';
import path from 'node:path';
import { localDate, localTime, addDays, diffDays, weekday, minutesOf, occursOn, doneOn, isPeriod, endOf, itemDone, isLate, dueInWeek } from './planner-core.mjs';
import { CROWD_MIN, josa } from './planner.mjs';

export const TICK_MS = 30_000;
export const DUE_DAYS = [3, 1, 0];      // 마감(기간의 마지막 날)을 며칠 전부터 말하는가 — 설정에 내놓지 않는 값(조각 ⑧)
const MISSED_MAX_MIN = 12 * 60;        // 지나간 약속을 "놓친 것"으로 모아 말하는 범위(그보다 오래된 것은 말하지 않는다)
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dayWord = (n) => (n === 0 ? '오늘' : n === 1 ? '내일' : n === 2 ? '모레' : `${n}일 뒤`);
const timeWord = (t) => { const h = +t.slice(0, 2), m = +t.slice(3, 5); const h12 = h % 12 === 0 ? 12 : h % 12; return `${h < 12 ? '오전' : '오후'} ${h12}시${m ? ` ${m}분` : ''}`; };

export class PlannerRules {
  /** @param {{ planner: import('./planner.mjs').Planner, stateDir: string, now?: () => Date, log?: (m: string) => void }} o */
  constructor({ planner, stateDir, now = () => new Date(), log = () => {} }) {
    this.pl = planner; this.now = now; this.log = log;
    this.file = path.join(stateDir, 'planner-rules.json');
    this.state = { morning: null, evening: null, seenAt: null }; this.loaded = false; this.timer = null; this.first = true;
  }
  #load() {
    if (this.loaded) return; this.loaded = true;
    try { const s = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (s && typeof s === 'object') this.state = { morning: s.morning || null, evening: s.evening || null, seenAt: s.seenAt || null }; } catch { /* 처음 */ }
  }
  #save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); const tmp = `${this.file}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(this.state), 'utf8'); fs.renameSync(tmp, this.file); } catch (e) { this.log(`planner-rules: 상태를 적지 못했습니다 (${e?.code || 'error'})`); } }
  start() { if (this.timer) return; this.timer = setInterval(() => { try { this.tick(); } catch (e) { this.log(`planner-rules: tick error ${e?.code || e?.name || 'error'}`); } }, TICK_MS); this.timer.unref?.(); try { this.tick(); } catch (e) { this.log(`planner-rules: tick error ${e?.code || e?.name || 'error'}`); } }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** 지금 조용히 해야 하는가 */
  quiet(nowMs) { const u = this.pl.cfg().plannerQuietUntil; const t = u ? Date.parse(u) : NaN; return Number.isFinite(t) && nowMs < t; }

  /** 아침 인사의 재료(화면 · 시험도 쓴다): 오늘 할 것 · 밀린 일 · 가까운 마감 · 몰린 주 */
  summary(today) {
    const items = this.pl.store.list('active');
    const onToday = items.filter((it) => occursOn(it, today) && !doneOn(it, today));
    const late = items.filter((it) => isLate(it, today));
    // 가까운 마감 = 이미 시작한 기간의 마지막 날이 3일 뒤 · 내일 · 오늘인 것(아직 시작하지 않은 기간은 시작하는 날의 "오늘 할 것"에서 말한다)
    const due = items.filter((it) => !it.repeat && isPeriod(it) && it.start <= today && !itemDone(it) && DUE_DAYS.includes(diffDays(today, it.end)))
      .sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : (a.no || 0) - (b.no || 0))).map((it) => ({ id: it.id, title: it.title, days: diffDays(today, it.end), end: it.end }));
    const crowd = weekday(today) === 1 ? dueInWeek(items, today) : 0; // 몰림은 월요일 아침에만
    const starts = onToday.filter((it) => it.time && (!isPeriod(it) || it.start === today)).sort((a, b) => (a.time < b.time ? -1 : 1));
    return { todo: onToday.length, late: late.length, due, crowd: crowd >= CROWD_MIN ? crowd : 0, first: starts[0] ? { title: starts[0].title, time: starts[0].time } : null };
  }
  morningText(s, hm = '08:00') {
    const hello = hm < '12:00' ? '좋은 아침이에요.' : '안녕하세요.';
    const parts = [];
    if (s.todo && s.late) parts.push(`오늘 할 것이 ${s.todo}개, 밀린 일이 ${s.late}개 있어요.`);
    else if (s.todo) parts.push(`오늘 할 것이 ${s.todo}개 있어요.`);
    else if (s.late) parts.push(`밀린 일이 ${s.late}개 있어요.`);
    if (s.due.length === 1) parts.push(`「${s.due[0].title}」${josa(s.due[0].title, '이', '가')} ${s.due[0].days > 2 ? `${WD[weekday(s.due[0].end)]}요일` : dayWord(s.due[0].days)}까지예요.`);
    else if (s.due.length > 1) parts.push(`마감이 가까운 일이 ${s.due.length}개 있어요.`);
    if (s.crowd) parts.push(`이번 주에 마감이 ${s.crowd}개 몰려 있어요.`);
    return parts.length ? `${hello} ${parts.join(' ')}` : '';
  }

  /** 한 번의 점검. 말한 것들을 돌려준다(시험용). */
  tick() {
    const pl = this.pl; const said = [];
    if (!pl.started || pl.failed || !pl.enabled) return said;
    this.#load();
    const now = this.now(); const nowMs = now.getTime(); const today = localDate(now); const hm = localTime(now); const cfg = pl.cfg();
    const prev = this.state.seenAt ? Date.parse(this.state.seenAt) : NaN;
    const gapMin = Number.isFinite(prev) ? (nowMs - prev) / 60000 : Infinity;
    const resumed = this.first || gapMin > 3;       // 처음 켰거나, 꺼져 있었거나 잠들었다 깨어났다(점검이 3분 넘게 비었다)
    this.first = false;
    const quiet = this.quiet(nowMs);
    const quietEnded = this.wasQuiet === true && !quiet; this.wasQuiet = quiet;
    const catchUp = resumed || quietEnded;          // 막 켰거나 · 깨어났거나 · 조용히가 끝났다 → 그사이 지나간 약속을 모아 말한다
    const items = pl.store.list('active');
    const empty = !items.length;
    const speak = (s) => { said.push(s); pl.say(s); };

    // ---- 시작 전 알림 + 놓친 약속 ----
    if (cfg.plannerStartAlert !== false && !empty) {
      const lead = [5, 10, 15, 30].includes(Number(cfg.plannerStartMin)) ? Number(cfg.plannerStartMin) : 10;
      const nowMin = minutesOf(hm); const marks = []; const soon = []; const missed = [];
      for (const it of items) {
        if (!it.time || !occursOn(it, today) || doneOn(it, today) || (isPeriod(it) && it.start !== today)) continue;
        const key = `start:${today}`; if (it.alerted && it.alerted[key]) continue;
        const left = minutesOf(it.time) - nowMin;                 // 시작까지 남은 분(음수 = 지남)
        if (left > lead) continue;                                 // 아직 멀다
        if (quiet) continue;                                       // 조용히: 적어 두지 않는다 — 끝난 뒤 "지나간 약속"으로 말한다
        if (left >= 0) soon.push({ it, left });
        else if (catchUp && -left <= MISSED_MAX_MIN) missed.push({ it, left }); // 켜져 있는 동안 지나간 것(이미 지난 시각으로 넣은 약속 등)은 말없이 적어 두기만 한다
        marks.push({ id: it.id, key });
      }
      for (const { it, left } of soon.sort((a, b) => a.left - b.left)) {
        const text = left <= 0 ? `「${it.title}」${josa(it.title, '이', '가')} 지금 시작해요.` : `${timeWord(it.time)} 「${it.title}」${josa(it.title, '이', '가')} ${left}분 남았어요.`;
        speak({ group: 'sched', tone: 'iris', text, tip: `${it.time}${it.timeEnd ? `~${it.timeEnd}` : ''} ${it.title}`, actions: it.folder ? [{ kind: 'folder', path: it.folder }, { kind: 'chat', path: it.folder }] : [{ kind: 'open', day: today }] });
      }
      if (missed.length) {
        // 막 켰거나 깨어났거나 조용히가 끝났을 때 한 번에: "꺼져 있는 동안 지난 약속이 2개 있어요"
        const one = missed.length === 1 ? missed[0].it : null;
        speak({ group: 'sched', tone: 'iris', text: one ? `${timeWord(one.time)} 「${one.title}」 시간이 지났어요.` : `지나간 약속이 ${missed.length}개 있어요.`, tip: missed.map(({ it }) => `${it.time} ${it.title}`).join(' · '), actions: [{ kind: 'open', day: today }] });
      }
      if (marks.length) pl.store.markAlerted(marks);
    }

    // ---- 그날의 첫 인사(가까운 마감 · 몰린 주 포함): 그날 처음 켰을 때, 밤새 켜 두었으면 정한 아침 시각에 ----
    //   새벽(05시 전)에는 하지 않는다 — 밤늦게까지 쓰다 자정을 넘긴 사람에게 인사하지 않게. 하루 끝 정리 시각이 지난 뒤 처음 켠 날은 정리만 말한다.
    const eveAt = /^\d\d:\d\d$/.test(cfg.plannerEveningAt || '') ? cfg.plannerEveningAt : '16:30';
    if (this.state.morning !== today && !quiet && !empty) {
      const at = /^\d\d:\d\d$/.test(cfg.plannerMorningAt || '') ? cfg.plannerMorningAt : '08:00';
      if (cfg.plannerMorning === false || (hm >= eveAt && cfg.plannerEvening !== false)) this.state.morning = today;
      else if (hm >= '05:00' && (resumed || hm >= at)) {
        const s = this.summary(today); const text = this.morningText(s, hm);
        if (text) speak({ group: 'greet', tone: 'iris', text, tip: s.first ? `첫 약속 ${s.first.time} ${s.first.title}` : '', actions: [{ kind: 'open', day: today, label: '오늘 보기' }] });
        this.state.morning = today;
      }
    }

    // ---- 하루 끝 정리: 정한 시각이 지나면 한 번(그 시각에 꺼져 있었으면 그날 안에 켰을 때) ----
    if (cfg.plannerEvening !== false && this.state.evening !== today && !quiet && !empty) {
      const at = eveAt;
      if (hm >= at) {
        const all = pl.store.list('active');
        const mine = all.filter((it) => occursOn(it, today));
        const done = mine.filter((it) => doneOn(it, today)).length;
        const rest = mine.filter((it) => !doneOn(it, today));
        const movable = rest.filter((it) => !it.repeat && !it.time && !isPeriod(it) && !(it.steps && it.steps.length)); // 내일로 옮길 수 있는 것 = 시각 없는 하루짜리
        if (done || rest.length) {
          const text = rest.length ? `오늘 끝낸 일 ${done}개, 남은 일 ${rest.length}개예요.` : `오늘 할 일 ${done}개를 다 끝냈어요.`;
          speak({ group: 'greet', tone: 'iris', text, tip: rest.map((it) => it.title).slice(0, 6).join(' · '), actions: [...(movable.length ? [{ kind: 'move', count: movable.length }] : []), { kind: 'open', day: today, label: '오늘 보기' }] });
        }
        this.state.evening = today;
      }
    }

    this.state.seenAt = now.toISOString();
    this.#save();
    return said;
  }

  /** 하루 끝 정리의 「내일로 옮기기」: 오늘 남은 시각 없는 하루짜리 일을 내일로(기간 · 약속 · 반복 · 단계 있는 일은 그대로). 한 번에 되돌릴 수 있다. */
  moveRestToTomorrow() {
    const today = localDate(this.now()); const tomorrow = addDays(today, 1);
    const rest = this.pl.store.list('active').filter((it) => it.start === today && !it.repeat && !it.time && !isPeriod(it) && !(it.steps && it.steps.length) && !itemDone(it));
    if (!rest.length) return { ok: true, moved: 0, say: '내일로 옮길 일이 없어요.' };
    const r = this.pl.apply(rest.map((it) => ({ op: 'update', id: it.id, patch: { start: tomorrow } })), { by: 'user', via: 'rules' });
    return { ok: true, moved: rest.length, changeId: r.changeId, say: `남은 일 ${rest.length}개를 내일로 옮겼어요.`, cards: r.items.map((it) => ({ title: it.title, start: it.start, end: it.end || null, time: it.time || null })), goto: tomorrow };
  }
}
