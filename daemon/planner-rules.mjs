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
const MUTED_REPLAY = 3;                // 조용히가 끝났을 때 다시 말하는 미뤄 둔 말의 수(그보다 많으면 개수를 먼저 말한다)
const INTRO_RESEND_MS = 10 * 60_000;   // 화면이 "보여 줬다"고 알려 오지 않은 소개를 다시 보내는 간격
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dayWord = (n) => (n === 0 ? '오늘' : n === 1 ? '내일' : n === 2 ? '모레' : `${n}일 뒤`);
const timeWord = (t) => { const h = +t.slice(0, 2), m = +t.slice(3, 5); const h12 = h % 12 === 0 ? 12 : h % 12; return `${h < 12 ? '오전' : '오후'} ${h12}시${m ? ` ${m}분` : ''}`; };

export class PlannerRules {
  /**
   * @param {{ planner: import('./planner.mjs').Planner, stateDir: string, now?: () => Date, log?: (m: string) => void, ready?: () => boolean }} o
   *   ready() = 지금 말을 받을 창이 있는가(데몬이 창보다 먼저 뜬다 — 받는 창이 없을 때 말하면 "알렸다"고만 적히고 아무도 못 본다)
   */
  constructor({ planner, stateDir, now = () => new Date(), log = () => {}, ready = () => true }) {
    this.pl = planner; this.now = now; this.log = log; this.ready = ready;
    this.told = new Set(); // 이번 실행에서 이미 말한 약속(장부에 적지 못해도 30초마다 되풀이하지 않게)
    this.file = path.join(stateDir, 'planner-rules.json');
    this.state = { morning: null, evening: null, seenAt: null, intro: null }; this.loaded = false; this.timer = null; this.first = true;
  }
  #load() {
    if (this.loaded) return; this.loaded = true;
    try { const s = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (s && typeof s === 'object') this.state = { morning: s.morning || null, evening: s.evening || null, seenAt: s.seenAt || null, intro: s.intro || null }; } catch { /* 처음 */ }
  }
  #save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); const tmp = `${this.file}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(this.state), 'utf8'); fs.renameSync(tmp, this.file); } catch (e) { this.log(`planner-rules: 상태를 적지 못했습니다 (${e?.code || 'error'})`); } }
  start() { if (this.timer) return; this.timer = setInterval(() => { try { this.tick(); } catch (e) { this.log(`planner-rules: tick error ${e?.code || e?.name || 'error'}`); } }, TICK_MS); this.timer.unref?.(); try { this.tick(); } catch (e) { this.log(`planner-rules: tick error ${e?.code || e?.name || 'error'}`); } }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  /** 화면이 소개 말풍선을 실제로 보여 줬다(POST /api/planner/intro-seen) — 이제 다시 소개하지 않는다. */
  introSeen() { this.#load(); if (this.state.intro) return false; this.state.intro = localDate(this.now()); this.#save(); return true; }

  /** 지금 조용히 해야 하는가 */
  quiet(nowMs) { return this.pl.quietNow(nowMs); }

  /** 아침 인사의 재료(화면 · 시험도 쓴다): 오늘 할 것 · 밀린 일 · 가까운 마감 · 몰린 주 */
  summary(today) {
    const items = this.pl.store.list('active');
    const onToday = items.filter((it) => occursOn(it, today) && !doneOn(it, today));
    const late = items.filter((it) => isLate(it, today));
    // 가까운 마감 = 이미 시작한 기간의 마지막 날이 3일 뒤 · 내일 · 오늘인 것(아직 시작하지 않은 기간은 시작하는 날의 "오늘 할 것"에서 말한다)
    const daysOf = (it) => { const d = it.alerts && it.alerts.dueDays; return Array.isArray(d) && d.length && d.every((n) => Number.isInteger(n) && n >= 0 && n <= 60) ? d : DUE_DAYS; }; // 이 일만 다르게("이건 일주일 전에도 알려 줘")
    const due = items.filter((it) => !it.repeat && isPeriod(it) && it.start <= today && !itemDone(it) && daysOf(it).includes(diffDays(today, it.end)))
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
    if (s.due.length === 1) parts.push(`「${s.due[0].title}」${josa(s.due[0].title, '이', '가')} ${s.due[0].days > 6 ? `${+s.due[0].end.slice(5, 7)}월 ${+s.due[0].end.slice(8, 10)}일` : s.due[0].days > 2 ? `${WD[weekday(s.due[0].end)]}요일` : dayWord(s.due[0].days)}까지예요.`);
    else if (s.due.length > 1) parts.push(`마감이 가까운 일이 ${s.due.length}개 있어요.`);
    if (s.crowd) parts.push(`이번 주에 마감이 ${s.crowd}개 몰려 있어요.`);
    return parts.length ? `${hello} ${parts.join(' ')}` : '';
  }

  /** 한 번의 점검. 말한 것들을 돌려준다(시험용). */
  tick() {
    const pl = this.pl; const said = [];
    if (!pl.started || pl.failed || !pl.enabled) return said;
    if (!this.ready()) return said;                 // 받을 창이 아직 없다 — 아무것도 소비하지 않고 다음 점검에(그때 "막 켠 것"으로 본다)
    this.#load();
    const now = this.now(); const nowMs = now.getTime(); const today = localDate(now); const hm = localTime(now); const cfg = pl.cfg();
    const prev = this.state.seenAt ? Date.parse(this.state.seenAt) : NaN;
    const gapMin = Number.isFinite(prev) ? (nowMs - prev) / 60000 : Infinity;
    const resumed = this.first || gapMin > 3;       // 처음 켰거나, 꺼져 있었거나 잠들었다 깨어났다(점검이 3분 넘게 비었다)
    this.first = false;
    const quiet = this.quiet(nowMs);
    const quietEnded = this.wasQuiet === true && !quiet; this.wasQuiet = quiet;
    // 조용히 한 동안 지나간 약속은 조용히가 끝났을 때 모아 말한다 — 「오늘 하루」처럼 12시간보다 길었으면 그 길이만큼 거슬러 본다
    if (quiet && !this.quietSince) this.quietSince = nowMs;
    const missedMax = quietEnded && this.quietSince ? Math.max(MISSED_MAX_MIN, Math.ceil((nowMs - this.quietSince) / 60000) + 60) : MISSED_MAX_MIN;
    if (!quiet) this.quietSince = null;
    const catchUp = resumed || quietEnded;          // 막 켰거나 · 깨어났거나 · 조용히가 끝났다 → 그사이 지나간 약속을 모아 말한다
    const items = pl.store.list('active');
    const empty = !items.length;
    const speak = (s) => { said.push(s); pl.say(s); };

    // ---- 시작 전 알림 + 놓친 약속 ----
    //   날짜가 아니라 실제 시각으로 견준다: 내일 0시 5분 약속의 10분 전은 오늘 밤이고, 어젯밤 약속을 자정 넘어 깨어나서 알 수도 있다.
    if (cfg.plannerStartAlert !== false && !empty) {
      const baseLead = [5, 10, 15, 30].includes(Number(cfg.plannerStartMin)) ? Number(cfg.plannerStartMin) : 10;
      const floorMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()).getTime();
      const marks = []; const soon = []; const missed = [];
      for (const date of [addDays(today, -1), today, addDays(today, 1)]) {
        for (const it of items) {
          if (!it.time || !occursOn(it, date) || doneOn(it, date) || (isPeriod(it) && it.start !== date)) continue;
          const key = `start:${date}T${it.time}`;          // 시각까지 넣는다 — 알린 뒤 시각을 바꾸면 새 시각에 다시 알린다
          if ((it.alerted && it.alerted[key]) || this.told.has(`${it.id}|${key}`)) continue;
          const atMs = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), +it.time.slice(0, 2), +it.time.slice(3, 5)).getTime();
          const left = Math.round((atMs - floorMs) / 60000);     // 시작까지 남은 분(음수 = 지남)
          const own = Number(it.alerts && it.alerts.leadMin);     // 이 일만 다르게("이건 30분 전에 알려 줘")
          const lead = Number.isInteger(own) && own >= 0 && own <= 1440 ? own : baseLead;
          if (left > lead || -left > missedMax) continue;        // 아직 멀다 / 너무 오래 지났다(말하지도 적지도 않는다)
          if (quiet) continue;                                    // 조용히: 적어 두지 않는다 — 끝난 뒤 "지나간 약속"으로 말한다
          if (left >= 0) soon.push({ it, left, date });
          else if (catchUp || (Number.isFinite(prev) && atMs > prev)) missed.push({ it, left, date }); // 막 켰거나 · 깨어났거나 · 시계가 건너뛰어 그사이 지나간 약속
          // 그 밖(켜져 있는 동안 이미 지난 시각으로 넣은 약속)은 말없이 적어 두기만 한다
          marks.push({ id: it.id, key });
        }
      }
      soon.sort((a, b) => a.left - b.left);
      const actOf = (it) => (it.folder ? [{ kind: 'folder', path: it.folder }, { kind: 'chat', path: it.folder }] : [{ kind: 'open', day: today }]);
      if (soon.length === 1) {
        const { it, left } = soon[0];
        const text = left <= 0 ? `「${it.title}」${josa(it.title, '이', '가')} 지금 시작해요.` : `${timeWord(it.time)} 「${it.title}」${josa(it.title, '이', '가')} ${left}분 남았어요.`;
        speak({ group: 'sched', tone: 'iris', os: true, text, tip: `${it.time}${it.timeEnd ? `~${it.timeEnd}` : ''} ${it.title}`, actions: actOf(it) });
      } else if (soon.length > 1) {
        // 같은 때에 여럿이면 말풍선 하나로 모은다
        speak({ group: 'sched', tone: 'iris', os: true, text: `곧 시작하는 약속이 ${soon.length}개 있어요.`, tip: soon.map(({ it }) => `${it.time} ${it.title}`).join(' · '), actions: [{ kind: 'open', day: today }] });
      }
      if (missed.length) {
        // 막 켰거나 깨어났거나 조용히가 끝났을 때 한 번에: "지나간 약속이 2개 있어요"
        missed.sort((a, b) => b.left - a.left);
        const one = missed.length === 1 ? missed[0].it : null;
        speak({ group: 'sched', tone: 'iris', os: true, text: one ? `${timeWord(one.time)} 「${one.title}」 시간이 지났어요.` : `지나간 약속이 ${missed.length}개 있어요.`, tip: [...missed].reverse().map(({ it }) => `${it.time} ${it.title}`).join(' · '), actions: [{ kind: 'open', day: today }] });
      }
      if (marks.length) { for (const m of marks) this.told.add(`${m.id}|${m.key}`); pl.store.markAlerted(marks); if (this.told.size > 2000) this.told.clear(); }
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
          speak({ group: 'greet', tone: 'iris', text, tip: rest.map((it) => it.title).slice(0, 6).join(' · '), actions: [...(movable.length ? [{ kind: 'move', count: movable.length, day: today }] : []), { kind: 'open', day: today, label: '오늘 보기' }] });
        }
        this.state.evening = today;
      }
    }

    // ---- 조용히가 끝났을 때: 그사이 미뤄 둔 말(세션이 넣은 것 · 지우려는 것 · 제안)을 다시 말한다 — 되돌리기 · 확인 단추가 그대로 달린 채 ----
    //   많으면 먼저 개수를 말하고 최근 것 셋만 다시 말한다(나머지는 달력과 변경 기록에 있다).
    if (!quiet) {
      const held = pl.takeMuted();
      if (held.length > MUTED_REPLAY) speak({ group: 'info', tone: 'iris', text: `조용히 하는 동안 플래너 소식이 ${held.length}개 있었어요. 최근 것부터 알려 드릴게요.`, actions: [{ kind: 'open', day: today, label: '플래너 열기' }] });
      for (const s of held.slice(-MUTED_REPLAY)) speak(s);
    }

    // ---- 처음 한 번 소개(설계 조각 ⑧): 플래너를 처음 받은 사람에게 한 번만. 수첩이 비어 있어도 말한다(먼저 말하지 않는다는 규칙의 하나뿐인 예외). ----
    //   방송했다고 "소개했다"고 적지 않는다 — 화면이 말풍선을 실제로 보여 줬다고 알려 올 때(introSeen) 적는다.
    //   그때까지는 10분마다 다시 보낸다(첫 실행 튜토리얼이 덮고 있거나 창을 닫아 못 본 경우 — 화면은 이미 들고 있으면 겹쳐 띄우지 않는다).
    if (!this.state.intro && !quiet && (!this.introSentAt || nowMs - this.introSentAt >= INTRO_RESEND_MS || nowMs < this.introSentAt)) {
      speak({ group: 'greet', tone: 'iris', intro: true, text: '일정은 저한테 말해 주세요. 달력에 넣고 때맞춰 알려 드릴게요.', actions: [{ kind: 'open', day: today, label: '열어 보기' }] });
      this.introSentAt = nowMs;
    }

    this.state.seenAt = now.toISOString();
    this.#save();
    return said;
  }

  /** 하루 끝 정리의 「내일로 옮기기」: 오늘 남은 시각 없는 하루짜리 일을 내일로(기간 · 약속 · 반복 · 단계 있는 일은 그대로). 한 번에 되돌릴 수 있다. */
  moveRestToTomorrow(day = null) {
    const today = localDate(this.now()); const tomorrow = addDays(today, 1);
    // 말풍선이 자정을 넘겨 남아 있다가 눌린 경우: 그때 말한 "오늘"이 아니면 옮기지 않는다(다른 날의 일을 옮기게 되므로)
    if (day && day !== today) return { ok: false, moved: 0, say: '날짜가 바뀌어서 옮기지 않았어요. 달력에서 다시 확인해 주세요.' };
    const rest = this.pl.store.list('active').filter((it) => it.start === today && !it.repeat && !it.time && !isPeriod(it) && !(it.steps && it.steps.length) && !itemDone(it));
    if (!rest.length) return { ok: true, moved: 0, say: '내일로 옮길 일이 없어요.' };
    const r = this.pl.apply(rest.map((it) => ({ op: 'update', id: it.id, patch: { start: tomorrow } })), { by: 'user', via: 'rules' });
    return { ok: true, moved: rest.length, changeId: r.changeId, say: `남은 일 ${rest.length}개를 내일로 옮겼어요.`, cards: r.items.map((it) => ({ title: it.title, start: it.start, end: it.end || null, time: it.time || null })), goto: tomorrow };
  }
}
