#!/usr/bin/env node
// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// iris-planner — IRIS 가 띄운 세션의 에이전트가 사용자의 플래너(달력)에 넣는 명령.
// IRIS 창이 세션을 띄울 때 준 환경 변수(IRIS_PLANNER_URL · _SESSION · _KEY)로 이 PC 의 IRIS 창에만 말한다(바깥 연결 없음).
const HELP = `iris-planner — 사용자의 플래너(달력)에 넣기 · 보기 (IRIS 가 띄운 세션에서만 동작)

  iris-planner list [--from YYYY-MM-DD] [--to YYYY-MM-DD]
      수첩 보기(기본: 오늘부터 14일). 줄 머리의 #번호를 update · done 에 쓴다.

  iris-planner add --title "이름" --start YYYY-MM-DD [--end YYYY-MM-DD] [--time HH:MM] [--time-end HH:MM]
                   [--step "단계 이름@YYYY-MM-DD"]... [--repeat daily|weekly|monthly] [--by-day 0-6,...] [--until YYYY-MM-DD]
                   [--note "메모"] [--place "장소"] [--why "근거"] [--asked]
      --asked 가 있으면(사용자가 직접 시킨 것) 달력에 바로 넣고 사용자 화면에 알림 + 되돌리기를 띄운다.
      --asked 가 없으면(네가 판단한 것) 달력에 넣지 않고 「아이리스 제안」에 올린다 — --why 에 근거를 꼭 적는다.
      기간이 있는 일(마감이 있는 일)은 --start = 시작하는 날, --end = 마지막 날. 하루짜리는 --end 를 쓰지 않는다.
      --by-day: 0=일요일 ... 6=토요일(주마다 반복할 때).

  iris-planner update --no 번호 [add 와 같은 칸들] --asked
      사용자가 시킨 것만 고친다. --step 을 주면 단계 전체를 그 순서로 다시 적는다.

  iris-planner done --no 번호 [--step 순서] [--date YYYY-MM-DD] [--undone] --asked
      끝냄 표시(--undone 은 풀기). 반복하는 일은 --date 로 어느 날 것인지 적는다.

  이름에 따옴표나 특수 문자가 많으면 JSON 으로:  iris-planner --stdin  < 파일
      {"cmd":"add","asked":true,"why":"...","item":{"title":"...","start":"2026-11-26","end":"2026-11-27","steps":[{"title":"...","day":"2026-11-26"}]}}

  지우기는 없다 — 사용자가 플래너 판에서 아이리스에게 말로 한다.`;

function parse(argv) {
  const out = { _: [], step: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2);
    if (['asked', 'undone', 'stdin', 'help'].includes(k)) { out[k] = true; continue; }
    const v = argv[++i];
    if (v === undefined) throw new Error(`--${k} 뒤에 값이 없습니다.`);
    if (k === 'step') out.step.push(v); else out[k] = v;
  }
  return out;
}
function itemOf(a) {
  const it = {};
  for (const [flag, key] of [['title', 'title'], ['start', 'start'], ['end', 'end'], ['time', 'time'], ['time-end', 'timeEnd'], ['note', 'note'], ['place', 'place']]) if (a[flag] !== undefined) it[key] = a[flag] === '' ? null : a[flag];
  if (a.repeat !== undefined) {
    if (a.repeat === 'none' || a.repeat === '') it.repeat = null;
    else { it.repeat = { freq: a.repeat }; if (a.every) it.repeat.interval = Number(a.every); if (a['by-day']) it.repeat.byDay = String(a['by-day']).split(',').map((x) => Number(x.trim())); if (a.until) it.repeat.until = a.until; }
  }
  if (a.step.length) it.steps = a.step.map((s) => { const i = s.lastIndexOf('@'); return i > 0 ? { title: s.slice(0, i).trim(), day: s.slice(i + 1).trim() } : { title: s.trim(), day: a.start }; });
  return it;
}
async function readStdin() { const ch = []; for await (const c of process.stdin) ch.push(c); const s = Buffer.concat(ch).toString('utf8'); return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

async function main() {
  let a; try { a = parse(process.argv.slice(2)); } catch (e) { console.error(e.message); return 2; }
  const cmd = a._[0];
  if (a.help || cmd === 'help' || (!cmd && !a.stdin)) { console.log(HELP); return 0; }
  const url = process.env.IRIS_PLANNER_URL, sid = process.env.IRIS_PLANNER_SESSION, key = process.env.IRIS_PLANNER_KEY;
  if (!url || !sid || !key || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) { console.error('이 세션은 IRIS 창이 띄운 세션이 아니어서(또는 플래너가 꺼져 있을 때 시작해서) 플래너에 넣을 수 없습니다. 사용자에게 그대로 알려 주세요.'); return 3; }
  let body;
  if (a.stdin) { try { body = JSON.parse(await readStdin()); } catch { console.error('표준 입력의 JSON 을 읽지 못했습니다.'); return 2; } }
  else if (cmd === 'list') body = { cmd, from: a.from, to: a.to };
  else if (cmd === 'add') body = { cmd, asked: !!a.asked, why: a.why, item: itemOf(a) };
  else if (cmd === 'update') body = { cmd, asked: !!a.asked, why: a.why, no: Number(a.no), item: itemOf(a) };
  else if (cmd === 'done') body = { cmd, asked: !!a.asked, why: a.why, no: Number(a.no), step: a.step.length ? Number(a.step[0]) : undefined, date: a.date, undone: !!a.undone };
  else { console.error(`모르는 명령: ${cmd}\n\n${HELP}`); return 2; }
  let res, out;
  try {
    res = await fetch(`${url}/api/planner/cli`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-iris-session': sid, 'x-iris-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    out = await res.json();
  } catch { console.error('IRIS 창에 닿지 못했습니다(창이 꺼져 있거나 다시 시작하는 중). 넣지 않았습니다 — 사용자에게 그대로 알려 주세요.'); return 4; }
  if (out && out.ok) { console.log(out.text); return 0; }
  console.error((out && out.text) || `넣지 못했습니다(${res.status}).`);
  return 1;
}
main().then((code) => { process.exitCode = code; });
