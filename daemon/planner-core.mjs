// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 플래너의 셈(날짜 · 반복 · 그날의 목록 · 달력 점 · 겹침) — 파일도 시계도 모르는 순수 함수만 둔다.
// 화면은 이 셈을 다시 하지 않고 데몬이 만든 결과를 받아 그리기만 한다(같은 규칙을 두 군데에 두지 않는다).
// 설계 정본 = docs\설계-플래너-2026-11-13.md 6절(조각 ①·②·⑤).

const pad = (n) => String(n).padStart(2, '0');
const dayNo = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
const fromNo = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

/** 'YYYY-MM-DD' 이고 실제로 있는 날인가(2026-02-30 같은 것은 아님) */
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromNo(dayNo(s)) === s;
/** 'HH:MM'(00:00~23:59) 인가 */
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const addDays = (s, n) => fromNo(dayNo(s) + n);
/** b - a (날 수) */
export const diffDays = (a, b) => dayNo(b) - dayNo(a);
/** 0 = 일요일 … 6 = 토요일 */
export const weekday = (s) => new Date(dayNo(s) * 86400000).getUTCDay();
/** 그 PC 의 시계로 본 오늘 날짜·지금 시각(Date → 글자) */
export const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const minutesOf = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
/** 그 주의 월요일(월~일을 한 주로 본다) */
export const mondayOf = (s) => addDays(s, -((weekday(s) + 6) % 7));

export const endOf = (it) => it.end || it.start;
/** 이틀 이상 이어지는 일인가 — 기간의 마지막 날이 마감일이다 */
export const isPeriod = (it) => !!it.end && it.end !== it.start;
export const hasSteps = (it) => Array.isArray(it.steps) && it.steps.length > 0;
/** 끝난 일인가(반복하는 일은 날마다 따로라 여기서는 false — doneOn 을 쓴다) */
export const itemDone = (it) => (it.repeat ? false : hasSteps(it) ? it.steps.every((s) => s.done) : !!it.done);

/** 그 일이 그 날짜에 있는가(반복 · 기간 포함) */
export function occursOn(it, date) {
  if (!it.repeat) return date >= it.start && date <= endOf(it);
  const r = it.repeat;
  if (date < it.start || (r.until && date > r.until) || (Array.isArray(r.skip) && r.skip.includes(date))) return false;
  const every = Math.max(1, r.interval | 0);
  const gap = diffDays(it.start, date);
  if (r.freq === 'daily') return gap % every === 0;
  if (r.freq === 'weekly') {
    const days = Array.isArray(r.byDay) && r.byDay.length ? r.byDay : [weekday(it.start)];
    if (!days.includes(weekday(date))) return false;
    return (diffDays(mondayOf(it.start), mondayOf(date)) / 7) % every === 0;
  }
  if (r.freq === 'monthly') {
    if (date.slice(8) !== it.start.slice(8)) return false; // 그 날이 없는 달(31일 등)은 건너뛴다
    const months = (+date.slice(0, 4) - +it.start.slice(0, 4)) * 12 + (+date.slice(5, 7) - +it.start.slice(5, 7));
    return months % every === 0;
  }
  return false;
}
/** 그 날짜의 것이 끝났는가 */
export const doneOn = (it, date) => (it.repeat ? !!(it.repeat.done && it.repeat.done[date]) : itemDone(it));

const active = (items) => items.filter((it) => it.state === 'active');
const byTitle = (a, b) => (a.no || 0) - (b.no || 0);

/**
 * 고른 날의 목록(화면이 그대로 그리는 줄들). 순서 = 밀린 일 → 약속(시각순) → 마감이 가까운 순 → 나머지 (조각 ⑥ "오늘 순서").
 * 밀린 일 = 시각 없는 하루짜리·기간인 일 가운데 끝 날이 오늘보다 앞이고 안 끝낸 것 — 오늘 목록에만 따라온다.
 */
export function dayRows(items, date, today) {
  const rows = [];
  const push = (it, late) => {
    const period = isPeriod(it) ? { start: it.start, end: it.end, total: diffDays(it.start, it.end) + 1, index: date >= it.start && date <= it.end ? diffDays(it.start, date) + 1 : 0, last: date === it.end } : null;
    const done = doneOn(it, date);
    rows.push({
      id: it.id, no: it.no, title: it.title, date, time: it.time || null, timeEnd: it.timeEnd || null, done,
      late, lateFrom: late && !period ? it.start : null,
      period, red: !done && !!period && date >= it.end,
      steps: hasSteps(it) ? it.steps.map((s, i) => ({ id: s.id, n: i + 1, title: s.title, day: s.day, done: !!s.done, cur: s.day === date, over: !s.done && s.day < today })) : null,
      folder: it.folder || null, repeat: !!it.repeat,
    });
  };
  const list = active(items);
  if (date === today) for (const it of list.filter((x) => !x.repeat && !x.time && endOf(x) < today && !itemDone(x)).sort((a, b) => (endOf(a) < endOf(b) ? -1 : endOf(a) > endOf(b) ? 1 : byTitle(a, b)))) push(it, true);
  const on = list.filter((it) => occursOn(it, date));
  const timed = on.filter((it) => it.time && (!isPeriod(it) || date === it.start)).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : byTitle(a, b)));
  const rest = on.filter((it) => !timed.includes(it));
  const periods = rest.filter(isPeriod).sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : byTitle(a, b)));
  const plain = rest.filter((it) => !isPeriod(it)).sort(byTitle);
  for (const it of [...timed, ...periods, ...plain]) push(it, false);
  return rows;
}

/** 달력의 점: { 'YYYY-MM-DD': { n: 그날 할 것, due: 그날이 마감인 것(안 끝낸 기간의 마지막 날) } } — 것이 있는 날만 */
export function monthDots(items, ym) {
  const out = {};
  const list = active(items);
  const first = `${ym}-01`;
  for (let d = first; d.slice(0, 7) === ym; d = addDays(d, 1)) {
    const n = list.filter((it) => occursOn(it, d)).length;
    const due = list.filter((it) => !it.repeat && isPeriod(it) && it.end === d && !itemDone(it)).length;
    if (n || due) out[d] = { n, due };
  }
  return out;
}

/** 시각이 있는 약속끼리 겹치는가 — 끝 시각이 없으면 1시간으로 본다(조각 ⑤). cand 와 겹치는 일들을 돌려준다. */
export function overlapsWith(items, cand) {
  if (!cand.time || !isDate(cand.start)) return [];
  const span = (it) => { const a = minutesOf(it.time); const b = it.timeEnd && minutesOf(it.timeEnd) > a ? minutesOf(it.timeEnd) : a + 60; return [a, b]; };
  const [a1, b1] = span(cand);
  return active(items).filter((it) => it.id !== cand.id && it.time && occursOn(it, cand.start) && (!isPeriod(it) || cand.start === it.start))
    .filter((it) => { const [a2, b2] = span(it); return a1 < b2 && a2 < b1; })
    .map((it) => ({ id: it.id, no: it.no, title: it.title, time: it.time, timeEnd: it.timeEnd || null }));
}

/** 그 날짜가 든 주(월~일)에 마감이 몇 개인가(안 끝낸 기간의 마지막 날) */
export function dueInWeek(items, date) {
  const mon = mondayOf(date), sun = addDays(mon, 6);
  return active(items).filter((it) => !it.repeat && isPeriod(it) && it.end >= mon && it.end <= sun && !itemDone(it)).length;
}
