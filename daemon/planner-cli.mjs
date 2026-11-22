// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 세션용 플래너 명령의 창구(설계 「플래너와 세션」, 2026-11-22) — 다른 세션의 에이전트가 `iris-planner` 명령으로 플래너에 넣는 길.
//   · IRIS 가 띄운 세션에만 환경 변수 셋(주소 · 세션 번호 · 그 세션만의 열쇠)과 명령 폴더를 준다. 열쇠는 "누가 넣었는지"를 가리는 것이다
//     (웹 쪽은 못 부른다. 같은 사용자의 다른 프로그램까지 막는 장치는 아니다).
//   · 사용자가 시킨 것(--asked)은 바로 넣고 화면에 "○○ 세션에서 추가했어요" + 되돌리기를 띄운다.
//     세션이 스스로 판단한 것은 달력에 넣지 않고 「아이리스 제안」에 올린다(사용자가 「추가」를 눌러야 들어간다).
//   · 세션이 할 수 있는 것: 보기 · 넣기 · 고치기 · 끝냄 표시. 지우기는 못 한다(지우기는 사용자가 판에서 아이리스에게 말로).
//   · 숨은 AI 를 부르지 않는다 — 토큰은 그 세션이 이미 쓰고 있는 것뿐이다.
//   · 로그에 일정 내용 · 열쇠 값을 싣지 않는다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlannerError } from './planner-store.mjs';
import { isDate, addDays, endOf, itemDone, occursOn } from './planner-core.mjs';
import { josa } from './planner.mjs';
import { fmtItem } from './planner-talk.mjs';

export const BIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin');
export const WRITE_LIMIT = 20, WRITE_WINDOW_MS = 10 * 60_000; // 한 세션이 10분에 적을 수 있는 횟수(되풀이에 빠진 에이전트 막기)
export const PROPOSE_MAX = 10;                               // 한 세션이 쌓아 둘 수 있는 제안 수
const FIELDS = ['title', 'start', 'end', 'time', 'timeEnd', 'repeat', 'steps', 'note', 'place', 'who'];
const pick = (o, keys) => { const out = {}; if (o && typeof o === 'object') for (const k of keys) if (Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined) out[k] = o[k]; return out; };

// 세션의 첫 요청 앞 안내문에 덧붙이는 글. ⚠ 코덱스 TUI 는 붙여넣기에서 가운뎃점 등을 떨어뜨린다(facenote.mjs) — 한글 · 영문 · ASCII 문장부호만 쓴다.
export const CLI_NOTE =
  '이 PC에는 사용자의 플래너(달력)가 있다. 사용자가 일정이나 할 일을 플래너에 넣어 달라, 고쳐 달라, 끝냈다고 표시해 달라고 하면 ' +
  '셸에서 iris-planner 명령으로 한다(사용법은 iris-planner help). 사용자가 직접 시킨 것에는 --asked 를 붙인다. ' +
  '사용자가 시키지 않았는데 네가 필요하다고 판단한 일정은 --asked 없이 --why 에 근거를 적어 제안으로만 올린다. 플래너의 일을 지우지는 않는다.';

export class PlannerCli {
  /**
   * @param {{ planner: import('./planner.mjs').Planner, port: number, session: (id: string) => any, now?: () => Date, log?: (m: string) => void, node?: string }} o
   *   session(id) = 그 번호의 세션 카드({ id, title, agent, cwd, status }) 또는 없으면 null
   */
  constructor({ planner, port, session, now = () => new Date(), log = () => {}, node = process.execPath }) {
    this.pl = planner; this.port = port; this.session = session; this.now = now; this.log = log; this.node = node;
    this.writes = new Map(); // 세션 번호 → 최근에 적은 시각들
  }
  /** 지금 세션에게 플래너를 열어 줄 것인가(플래너 켬 + 「다른 세션에서 넣기」 켬 + 장부가 열림) */
  get on() { const pl = this.pl; return !!(pl.started && !pl.failed && pl.enabled && pl.cfg().plannerFromSessions !== false); }
  /** 새 세션의 첫 요청 앞에 붙일 글(꺼져 있으면 빈 글) */
  note() { return this.on ? CLI_NOTE : ''; }
  /** 세션을 띄울 때 환경 변수에 더한다(꺼져 있으면 아무것도 하지 않는다). 명령 폴더는 PATH 맨 뒤에 — 다른 도구를 가리지 않게. */
  applyEnv(env, id) {
    if (!this.on || !id) return false;
    env.IRIS_PLANNER_URL = `http://127.0.0.1:${this.port}`;
    env.IRIS_PLANNER_SESSION = String(id);
    env.IRIS_PLANNER_KEY = this.pl.keyFor(id);
    env.IRIS_PLANNER_NODE = this.node;
    const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
    const cur = String(env[key] || ''); const parts = cur.split(path.delimiter).map((p) => p.toLowerCase());
    // 두 폴더: bin = PowerShell · cmd 가 찾는 iris-planner.cmd / bin\sh = Git Bash 가 찾는 확장자 없는 iris-planner
    const add = [BIN_DIR, path.join(BIN_DIR, 'sh')].filter((d) => !parts.includes(d.toLowerCase()));
    if (add.length) env[key] = [cur, ...add].filter(Boolean).join(path.delimiter);
    return true;
  }

  #limit(id) {
    const t = this.now().getTime(); const arr = (this.writes.get(id) || []).filter((x) => t - x < WRITE_WINDOW_MS);
    if (arr.length >= WRITE_LIMIT) { this.writes.set(id, arr); return false; }
    arr.push(t); this.writes.set(id, arr); return true;
  }
  #who(rec) { const t = String(rec.title || '').trim() || path.basename(String(rec.cwd || '')) || '세션'; return t.length > 24 ? `${t.slice(0, 24)}…` : t; }

  /**
   * 명령 한 번. 던지지 않는다 — { code, out: { ok, text } }. text 는 그 세션의 에이전트가 읽는 글(여러 줄).
   * headers = { 'x-iris-session', 'x-iris-key' } · body = { cmd, asked?, why?, item?, no?, step?, date?, undone?, from?, to? }
   */
  handle(headers = {}, body = {}) {
    const pl = this.pl; const sid = String(headers['x-iris-session'] || ''); const key = String(headers['x-iris-key'] || '');
    const no = (code, text, why) => { this.log(`planner-cli: ${code} ${why}`); return { code, out: { ok: false, text } }; };
    if (!pl.started || pl.failed) return no(503, '플래너를 지금 쓸 수 없습니다(수첩을 열지 못함). 사용자에게 그대로 알려 주세요.', 'unavailable');
    if (!pl.enabled) return no(409, '사용자가 플래너를 꺼 두었습니다. 넣지 않았습니다.', 'disabled');
    if (pl.cfg().plannerFromSessions === false) return no(409, '사용자가 「다른 세션에서 넣기」를 꺼 두었습니다. 넣지 않았습니다. 사용자가 플래너 판에서 직접 말하면 됩니다.', 'from-sessions-off');
    if (!pl.keyOk(sid, key)) return no(401, '이 세션은 플래너에 넣을 수 없습니다(IRIS 가 띄운 세션의 열쇠가 아닙니다).', 'bad-key');
    const rec = this.session(sid);
    if (!rec) return no(401, '이 세션을 찾을 수 없습니다.', 'no-session');
    const cmd = String(body?.cmd || '');
    const source = { id: sid, title: this.#who(rec), agent: rec.agent === 'codex' ? 'codex' : 'claude' };
    try {
      if (cmd === 'list') return { code: 200, out: { ok: true, text: this.#list(body) } };
      if (!['add', 'update', 'done'].includes(cmd)) return no(400, '모르는 명령입니다. iris-planner help 를 보세요.', 'bad-cmd');
      if (pl.store.readOnly) return no(409, '수첩이 읽기 전용이라 넣지 못했습니다. 사용자에게 그대로 알려 주세요.', 'read-only');
      if (!this.#limit(sid)) return no(429, `이 세션에서 너무 자주 적었습니다(10분에 ${WRITE_LIMIT}번까지). 잠시 뒤에 다시 하세요.`, 'rate');
      const asked = body.asked === true; const why = typeof body.why === 'string' ? body.why.trim().slice(0, 300) : '';
      const meta = { by: 'session', via: 'cli', session: source, asked, ...(why ? { evidence: why } : {}) };
      if (cmd === 'add') return this.#add(body, meta, rec, source);
      if (!asked) return no(403, '고치기와 끝냄 표시는 사용자가 직접 시킨 것만 할 수 있습니다(--asked). 시키지 않은 것은 사용자에게 먼저 물어보세요.', 'not-asked');
      const it = pl.store.list('active').find((x) => x.no === Number(body.no));
      if (!it) return no(404, `#${String(body.no).slice(0, 8)} 번 일을 찾을 수 없습니다. iris-planner list 로 번호를 확인하세요.`, 'no-item');
      if (cmd === 'done') {
        const op = { op: 'check', id: it.id, done: body.undone !== true };
        if (body.step != null) { const s = (it.steps || [])[Number(body.step) - 1]; if (!s) return no(404, '그 순서의 단계가 없습니다.', 'no-step'); op.stepId = s.id; }
        if (it.repeat) { if (!isDate(body.date)) return no(400, '반복하는 일은 어느 날 것인지 --date YYYY-MM-DD 를 붙여야 합니다.', 'no-date'); op.date = body.date; }
        const r = pl.apply([op], meta);
        return { code: 200, out: { ok: true, text: `${op.done ? '끝냄으로 표시했습니다' : '끝냄 표시를 풀었습니다'}: ${fmtItem(r.items[0])}` } };
      }
      const patch = pick(body.item, FIELDS);
      if (!Object.keys(patch).length) return no(400, '바꿀 것이 없습니다. iris-planner help 를 보세요.', 'empty');
      if (Array.isArray(patch.steps)) patch.steps = patch.steps.map((s, i) => (s && typeof s === 'object' ? { ...pick(s, ['title', 'day', 'done']), ...(it.steps && it.steps[i] ? { id: it.steps[i].id } : {}) } : s));
      const say = { group: 'info', tone: 'iris', text: `「${source.title}」 세션에서 「${it.title}」${josa(it.title, '을', '를')} 고쳤어요.`, actions: [{ kind: 'undo' }, { kind: 'open', day: null, label: '보기' }] };
      const r = pl.apply([{ op: 'update', id: it.id, patch }], meta);
      say.actions[0].changeId = r.changeId; say.actions[1].day = r.items[0].start; pl.say(say);
      return { code: 200, out: { ok: true, text: [`고쳤습니다: ${fmtItem(r.items[0])}`, ...r.warnings.map((w) => `알림: ${w}`), '사용자 화면에 알림과 되돌리기 단추를 띄웠습니다.'].join('\n') } };
    } catch (e) {
      if (e instanceof PlannerError) return no(e.code === 'conflict' || e.code === 'read-only' ? 409 : 400, `넣지 못했습니다: ${e.message}`, e.code);
      this.log(`planner-cli: 오류 ${e?.code || e?.name || 'error'}`);
      return { code: 500, out: { ok: false, text: '플래너에서 오류가 났습니다. 넣지 않았습니다.' } };
    }
  }

  #add(body, meta, rec, source) {
    const pl = this.pl; const item = pick(body.item, FIELDS);
    if (typeof rec.cwd === 'string' && rec.cwd) item.folder = rec.cwd; // 그 세션이 일하던 폴더를 붙여 둔다(알림의 「폴더 열기」 · 「작업 시작」)
    if (Array.isArray(item.steps)) item.steps = item.steps.map((s) => (s && typeof s === 'object' ? pick(s, ['title', 'day']) : s));
    if (!meta.asked) {
      const mine = pl.store.list('proposed').filter((x) => x.source?.session?.id === source.id).length;
      if (mine >= PROPOSE_MAX) { this.log('planner-cli: 429 proposals'); return { code: 429, out: { ok: false, text: `이 세션이 올린 제안이 이미 ${mine}개 쌓여 있습니다. 사용자가 답한 뒤에 다시 올리세요.` } }; }
      const r = pl.apply([{ op: 'propose', item }], meta);
      const it = r.items[0];
      pl.say({ group: 'proposal', tone: 'iris', text: `「${source.title}」 세션이 「${it.title}」${josa(it.title, '을', '를')} 제안했어요.`, actions: [{ kind: 'proposals' }] });
      return { code: 200, out: { ok: true, text: `제안으로 올렸습니다(달력에는 아직 없습니다 — 사용자가 플래너에서 「추가」를 눌러야 들어갑니다): ${fmtItem(it).replace(/^#\d+ /, '')}` } };
    }
    const r = pl.apply([{ op: 'add', item }], meta);
    const it = r.items[0];
    pl.say({ group: 'info', tone: 'iris', text: `「${source.title}」 세션에서 「${it.title}」${josa(it.title, '을', '를')} 추가했어요.`, actions: [{ kind: 'undo', changeId: r.changeId }, { kind: 'open', day: it.start, label: '보기' }] });
    return { code: 200, out: { ok: true, text: [`넣었습니다: ${fmtItem(it)}`, ...r.warnings.map((w) => `알림: ${w}`), '사용자 화면에 알림과 되돌리기 단추를 띄웠습니다.'].join('\n') } };
  }

  #list(body) {
    const today = this.pl.today();
    const from = isDate(body.from) ? body.from : today; let to = isDate(body.to) ? body.to : addDays(from, 14);
    if (to < from) to = from; if (to > addDays(from, 92)) to = addDays(from, 92);
    const items = this.pl.store.list('active').filter((it) => {
      if (it.repeat) { for (let d = from; d <= to; d = addDays(d, 1)) if (occursOn(it, d)) return true; return false; }
      return endOf(it) >= from && it.start <= to || (endOf(it) < from && from === today && !itemDone(it)); // 밀린 일은 오늘부터 볼 때 함께
    }).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : (a.no || 0) - (b.no || 0))).slice(0, 80);
    return [`플래너 ${from} ~ ${to} (오늘 ${today})`, ...(items.length ? items.map(fmtItem) : ['(비어 있음)'])].join('\n');
  }
}
