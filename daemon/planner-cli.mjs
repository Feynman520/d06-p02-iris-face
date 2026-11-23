// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 세션용 플래너 명령의 창구(설계 「플래너와 세션」, 2026-11-22) — 다른 세션의 에이전트가 `iris-planner` 명령으로 플래너에 넣는 길.
//   · IRIS 가 띄운 세션에만 환경 변수 셋(주소 · 세션 번호 · 그 세션만의 열쇠)과 명령 폴더를 준다. 열쇠는 "누가 넣었는지"를 가리는 것이다
//     (웹 쪽은 못 부른다. 같은 사용자의 다른 프로그램까지 막는 장치는 아니다).
//   · 사용자가 시킨 것(--asked)은 바로 넣고 화면에 "○○ 세션에서 추가했어요" + 되돌리기를 띄운다.
//     세션이 스스로 판단한 것은 달력에 넣지 않고 「아이리스 제안」에 올린다(사용자가 「추가」를 눌러야 들어간다).
//   · 세션이 할 수 있는 것(설계 조각 ④ 확정): 보기 · 넣기 · 고치기 · 끝냄 표시 · 지우기. 고치기 · 끝냄 · 지우기는 사용자가 시킨 것(--asked)만,
//     하나씩, 모두 화면에 알림 + 되돌리기. 지우기는 세션이 바로 하지 않는다 — 화면에 확인을 띄우고 사용자가 「지우기」를 눌러야 지워진다(휴지통 30일).
//     열쇠는 그 세션 카드가 살아 있는 동안만 받는다.
//   · 숨은 AI 를 부르지 않는다 — 토큰은 그 세션이 이미 쓰고 있는 것뿐이다.
//   · 로그에 일정 내용 · 열쇠 값을 싣지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PlannerError } from './planner-store.mjs';
import { isDate, addDays, endOf, itemDone, occursOn } from './planner-core.mjs';
import { josa } from './planner.mjs';
import { fmtItem, linkSteps } from './planner-talk.mjs';

export const BIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin');
export const WRITE_LIMIT = 20, WRITE_WINDOW_MS = 10 * 60_000; // 한 세션이 10분에 적을 수 있는 횟수(되풀이에 빠진 에이전트 막기)
export const READ_LIMIT = 120;                               // 한 세션이 10분에 볼 수 있는 횟수
export const BAD_KEY_LIMIT = 30;                             // 10분 동안 열쇠가 틀린 요청이 이만큼이면 그 뒤로는 잠시 받지 않는다
export const PROPOSE_MAX = 10;                               // 한 세션이 쌓아 둘 수 있는 제안 수
export const SAME_ADD_MS = 2 * 60_000;                       // 같은 세션이 이 시간 안에 똑같은 일을 또 넣으면 두 번 넣지 않는다(응답을 못 받고 다시 시도한 경우)
export const CONFIRM_KEEP_MS = 24 * 3600_000;                // 지우기 확인을 기다려 주는 시간(조용히 하는 동안 미뤄졌다가 나중에 뜰 수 있다)
export const PENDING_MAX = 5;                                // 한 세션이 물어 둘 수 있는 지우기의 수
const FIELDS = ['title', 'start', 'end', 'time', 'timeEnd', 'repeat', 'steps', 'note', 'place', 'who'];
const pick = (o, keys) => { const out = {}; if (o && typeof o === 'object') for (const k of keys) if (Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined) out[k] = o[k]; return out; };

// 세션의 첫 요청 앞 안내문에 덧붙이는 글. ⚠ 코덱스 TUI 는 붙여넣기에서 가운뎃점 등을 떨어뜨린다(facenote.mjs) — 한글 · 영문 · ASCII 문장부호만 쓴다.
export const CLI_NOTE =
  '이 PC에는 사용자의 플래너(달력)가 있다. 사용자가 일정이나 할 일을 플래너에 넣어 달라, 고쳐 달라, 끝냈다고 표시해 달라고 하면 ' +
  '셸에서 iris-planner 명령으로 한다(사용법은 iris-planner help). 사용자가 직접 시킨 것에는 --asked 를 붙인다. ' +
  '사용자가 시키지 않았는데 네가 필요하다고 판단한 일정은 --asked 없이 --why 에 근거를 적어 제안으로만 올린다. ' +
  '넣을 때 이름(--title)은 핵심만 짧게 15자 안팎으로 적고, 자세한 내용은 --note 에 적는다. ' + // 달력의 한 줄에는 이름만 보이고 긴 이름은 잘린다 — 전체 내용은 줄에 마우스를 올렸을 때 보인다(2026-11-23)
  '고치기, 끝냄 표시, 지우기는 사용자가 직접 시켰을 때만 한다.';

export class PlannerCli {
  /**
   * @param {{ planner: import('./planner.mjs').Planner, port: number, session: (id: string) => any, now?: () => Date, log?: (m: string) => void, node?: string }} o
   *   session(id) = 그 번호의 세션 카드({ id, title, agent, cwd, status }) 또는 없으면 null
   */
  constructor({ planner, port, session, now = () => new Date(), log = () => {}, node = process.execPath }) {
    this.pl = planner; this.port = port; this.session = session; this.now = now; this.log = log; this.node = node;
    this.writes = new Map(); // 세션 번호 → 최근에 적은 시각들
    this.reads = new Map();  // 세션 번호 → 최근에 본 시각들
    this.badKeys = [];       // 열쇠가 틀린 요청의 시각들
    this.lastAdd = new Map(); // 세션 번호 → [{ sig, at, id }] 방금 넣은 것들(똑같은 것을 다시 넣지 않게)
    this.pending = new Map(); // 지우려고 사용자에게 물어 둔 것: token → { id, title, scope, date, updatedAt, meta, source, at }
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

  #limit(id, map = this.writes, max = WRITE_LIMIT) {
    const t = this.now().getTime(); const arr = (map.get(id) || []).filter((x) => t - x < WRITE_WINDOW_MS);
    if (arr.length >= max) { map.set(id, arr); return false; }
    arr.push(t); map.set(id, arr); return true;
  }
  /** 열쇠가 틀린 요청이 짧은 동안 너무 많았는가(맞히려고 두드리는 것을 늦춘다 — 맞는 열쇠의 요청은 그대로 받는다) */
  #badKey() { const t = this.now().getTime(); this.badKeys = this.badKeys.filter((x) => t - x < WRITE_WINDOW_MS); if (this.badKeys.length >= BAD_KEY_LIMIT) return true; this.badKeys.push(t); return false; }
  // ---- 지우려고 물어 둔 것(답을 기다리는 물음): 메모리 + 파일(state\planner-pending.json). 24시간이 지난 것은 읽을 때 버린다. ----
  #pendingFile() { return path.join(this.pl.stateDir, 'planner-pending.json'); }
  #pendingLoad() {
    if (!this.pendingLoaded) {
      this.pendingLoaded = true;
      try { const o = JSON.parse(fs.readFileSync(this.#pendingFile(), 'utf8')); if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) if (/^[0-9a-f]{24}$/.test(k) && v && typeof v.id === 'string' && v.source && typeof v.at === 'number') this.pending.set(k, v); } catch { /* 없음 · 깨짐 = 빈 목록 */ }
    }
    const nowMs = this.now().getTime(); let cut = false;
    for (const [k, v] of this.pending) if (nowMs - v.at > CONFIRM_KEEP_MS || nowMs < v.at - 60_000) { this.pending.delete(k); cut = true; }
    if (cut) this.#pendingSave();
  }
  #pendingSave() {
    const f = this.#pendingFile();
    try {
      if (!this.pending.size) { try { fs.unlinkSync(f); } catch { /* 없음 */ } return; }
      fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.pending)), 'utf8'); fs.renameSync(tmp, f);
    } catch (e) { this.log(`planner-cli: 물어 둔 것을 적지 못했습니다 (${e?.code || 'error'})`); }
  }
  /** 아직 답을 기다리는 물음들(말풍선 모양 그대로) — 화면이 다시 붙거나 플래너를 다시 켰을 때 되살리려고 준다. 꺼져 있으면 빈 목록. */
  asks() { if (!this.on) return []; this.#pendingLoad(); return [...this.pending.values()].sort((a, b) => a.at - b.at).map((v) => v.say).filter((s) => s && typeof s.text === 'string'); }
  /**
   * 세션이 지우려던 것에 대한 사용자의 답(화면의 말풍선 → POST /api/planner/confirm). 던지지 않는다 — { ok, say, changeId? }.
   * 물어본 뒤로 그 일이 바뀌었으면(이름 · 날짜를 고쳤거나 이미 지웠거나) 지우지 않는다.
   */
  confirm(token, yes) {
    this.#pendingLoad();
    const pl = this.pl; const p = this.pending.get(token); if (this.pending.delete(token)) this.#pendingSave();
    if (!p || this.now().getTime() - p.at > CONFIRM_KEEP_MS) return { ok: false, say: '물어본 지 오래돼서 그 일은 그대로 두었어요.' };
    if (!yes) { this.log('planner-cli: confirm no'); return { ok: true, say: `「${p.title}」${josa(p.title, '은', '는')} 그대로 두었어요.` }; }
    try {
      if (!pl.started || pl.failed || !pl.enabled) return { ok: false, say: '플래너가 꺼져 있어서 지우지 않았어요.' };
      const it = pl.store.get(p.id);
      if (!it || it.state !== 'active') return { ok: false, say: '그 일은 이미 달력에 없어요.' };
      if ((it.updatedAt || null) !== p.updatedAt || it.title !== p.title) return { ok: false, say: '물어본 뒤로 그 일이 바뀌어서 지우지 않았어요. 달력에서 확인해 주세요.' };
      const op = p.scope === 'day' ? { op: 'update', id: it.id, patch: { repeat: { skip: [...new Set([...((it.repeat && it.repeat.skip) || []), p.date])] } } } : { op: 'remove', id: it.id };
      const r = pl.apply([op], { ...p.meta, confirmed: true });
      this.log(`planner-cli: confirm yes ${p.scope}`);
      return { ok: true, changeId: r.changeId, say: p.scope === 'day' ? `「${p.title}」의 그날 것만 뺐어요.` : `「${p.title}」${josa(p.title, '을', '를')} 지웠어요. 휴지통에 30일 남아요.` };
    } catch (e) {
      if (e instanceof PlannerError) return { ok: false, say: `지우지 못했어요. ${e.message}` };
      this.log(`planner-cli: confirm 오류 ${e?.code || e?.name || 'error'}`);
      return { ok: false, say: '지우다가 문제가 생겼어요.' };
    }
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
    if (!pl.keyOk(sid, key)) return this.#badKey() ? no(429, '열쇠가 맞지 않는 요청이 너무 많습니다. 잠시 뒤에 다시 하세요.', 'bad-key-rate') : no(401, '이 세션은 플래너에 넣을 수 없습니다(IRIS 가 띄운 세션의 열쇠가 아닙니다).', 'bad-key');
    const rec = this.session(sid);
    if (!rec) return no(401, '이 세션을 찾을 수 없습니다.', 'no-session');
    // 열쇠는 세션 카드의 것이라 재개해도 같다. 끝난 카드(종료됨 · 끊김)의 열쇠는 받지 않는다 — 다시 열면(재개) 그때부터 받는다.
    if (rec.status === 'exited' || rec.status === 'dead') return no(401, '이 세션은 이미 끝난 세션입니다. 넣지 않았습니다.', 'ended-session');
    const cmd = String(body?.cmd || '');
    const source = { id: sid, title: this.#who(rec), agent: rec.agent === 'codex' ? 'codex' : 'claude' };
    try {
      if (cmd === 'list') return this.#limit(sid, this.reads, READ_LIMIT) ? { code: 200, out: { ok: true, text: this.#list(body) } } : no(429, `이 세션에서 너무 자주 봤습니다(10분에 ${READ_LIMIT}번까지). 잠시 뒤에 다시 하세요.`, 'read-rate');
      if (!['add', 'update', 'done', 'remove'].includes(cmd)) return no(400, '모르는 명령입니다. iris-planner help 를 보세요.', 'bad-cmd');
      if (pl.store.readOnly) return no(409, '수첩이 읽기 전용이라 넣지 못했습니다. 사용자에게 그대로 알려 주세요.', 'read-only');
      if (!this.#limit(sid)) return no(429, `이 세션에서 너무 자주 적었습니다(10분에 ${WRITE_LIMIT}번까지). 잠시 뒤에 다시 하세요.`, 'rate');
      const asked = body.asked === true; const why = typeof body.why === 'string' ? body.why.trim().slice(0, 300) : '';
      const meta = { by: 'session', via: 'cli', session: source, asked, ...(why ? { evidence: why } : {}) };
      if (cmd === 'add') return this.#add(body, meta, rec, source);
      if (!asked) return no(403, '고치기 · 끝냄 표시 · 지우기는 사용자가 직접 시킨 것만 할 수 있습니다(--asked). 시키지 않은 것은 사용자에게 먼저 물어보세요.', 'not-asked');
      const it = pl.store.list('active').find((x) => x.no === Number(body.no));
      if (!it) return no(404, `#${String(body.no).slice(0, 8)} 번 일을 찾을 수 없습니다. iris-planner list 로 번호를 확인하세요.`, 'no-item');
      const T = `「${it.title}」`; const told = '사용자 화면에 알림과 되돌리기 단추를 띄웠습니다.';
      const bubble = (verb, r, day) => pl.say({ group: 'info', tone: 'iris', text: `「${source.title}」 세션에서 ${T}${josa(it.title, '을', '를')} ${verb}`, actions: [{ kind: 'undo', changeId: r.changeId }, { kind: 'open', day: day || null, label: '보기' }] });
      if (cmd === 'done') {
        const op = { op: 'check', id: it.id, done: body.undone !== true };
        if (body.step != null) { const s = (it.steps || [])[Number(body.step) - 1]; if (!s) return no(404, '그 순서의 단계가 없습니다.', 'no-step'); op.stepId = s.id; }
        if (it.repeat) { if (!isDate(body.date)) return no(400, '반복하는 일은 어느 날 것인지 --date YYYY-MM-DD 를 붙여야 합니다.', 'no-date'); op.date = body.date; }
        const r = pl.apply([op], meta);
        bubble(op.done ? (op.stepId ? '한 단계 끝냈다고 표시했어요.' : '끝냈다고 표시했어요.') : '끝냄 표시를 풀었어요.', r, op.date || (r.items[0] && r.items[0].start));
        return { code: 200, out: { ok: true, text: [`${op.done ? '끝냄으로 표시했습니다' : '끝냄 표시를 풀었습니다'}: ${fmtItem(r.items[0])}`, told].join('\n') } };
      }
      if (cmd === 'remove') {
        // 지우기(설계 조각 ④: 지우기는 먼저 확인): 세션이 바로 지우지 않는다 — 사용자 화면에 "○○ 세션이 「…」을 지우려고 해요"를 띄우고,
        // 사용자가 「지우기」를 눌러야 지워진다(휴지통으로 · 되돌리기 포함). 하나씩. 반복하는 일은 그날 것만(--date) 또는 전부(--all)를 밝혀야 한다.
        let scope = 'one';
        if (it.repeat) {
          if (isDate(body.date)) { if (!occursOn(it, body.date)) return no(400, '그날에는 그 반복 일이 없습니다.', 'no-occurrence'); scope = 'day'; }
          else if (body.all === true) scope = 'all';
          else return no(400, '반복하는 일입니다. 그날 것만 빼려면 --date YYYY-MM-DD, 반복 전체를 지우려면 --all 을 붙이세요(사용자가 어느 쪽을 말했는지 확인하세요).', 'repeat-scope');
        }
        const nowMs = this.now().getTime();
        this.#pendingLoad();
        // 같은 일을 같은 범위로 또 물으면 새로 묻지 않는다(되풀이에 빠진 세션이 물음을 쌓지 않게)
        const dupAsk = [...this.pending.values()].find((v) => v.id === it.id && v.scope === scope && v.date === (scope === 'day' ? body.date : null) && v.source.id === sid);
        if (dupAsk) return { code: 200, out: { ok: true, text: `이미 사용자 화면에 확인을 띄워 두었습니다(아직 지우지 않았습니다): ${fmtItem(it)}\n사용자에게 화면의 확인을 눌러 달라고 알려 주세요. 다시 요청하지 마세요.` } };
        if ([...this.pending.values()].filter((v) => v.source.id === sid).length >= PENDING_MAX) return no(429, `이 세션이 지우려고 물어 둔 것이 이미 ${PENDING_MAX}개 있습니다. 사용자가 답한 뒤에 다시 하세요.`, 'pending-max');
        const token = crypto.randomBytes(12).toString('hex');
        const what = scope === 'day' ? `${+body.date.slice(5, 7)}월 ${+body.date.slice(8, 10)}일 것만 빼려고` : scope === 'all' ? '반복 전체를 지우려고' : '지우려고';
        const ask = { group: 'attention', tone: 'warn', sticky: true, text: `「${source.title}」 세션이 ${T}${josa(it.title, '을', '를')} ${what} 해요.`, tip: fmtItem(it), actions: [{ kind: 'confirm', token, yes: true, label: scope === 'day' ? '그날만 빼기' : '지우기' }, { kind: 'confirm', token, yes: false, label: '그대로 두기' }] };
        // 물음은 답하거나 24시간이 지날 때까지 남는다(파일에도 — 데몬이 다시 켜져도, 화면을 다시 열어도, 플래너를 껐다 켜도 답할 수 있게)
        this.pending.set(token, { id: it.id, title: it.title, scope, date: scope === 'day' ? body.date : null, updatedAt: it.updatedAt || null, meta, source, at: nowMs, say: ask });
        this.#pendingSave();
        pl.say(ask);
        return { code: 200, out: { ok: true, text: [`아직 지우지 않았습니다. 사용자 화면에 확인을 띄웠습니다 — 사용자가 「${scope === 'day' ? '그날만 빼기' : '지우기'}」를 눌러야 지워집니다: ${fmtItem(it)}`, '사용자에게 화면의 확인을 눌러 달라고 알려 주세요. 다시 요청하지 마세요.'].join('\n') } };
      }
      const patch = pick(body.item, FIELDS);
      if (!Object.keys(patch).length) return no(400, '바꿀 것이 없습니다. iris-planner help 를 보세요.', 'empty');
      // 단계를 다시 적을 때는 이름으로 옛 단계와 잇는다(자리로 이으면 끝낸 표시가 다른 단계에 붙는다 — 말하기와 같은 규칙).
      // 이어지지 못한 옛 단계(사라지는 단계)가 있으면 --drop-steps 를 밝혀야 한다.
      if (Array.isArray(patch.steps)) {
        const l = linkSteps(patch.steps, it.steps || []); patch.steps = l.steps;
        if (l.lost.length && body.dropSteps !== true) return no(409, `이대로 고치면 단계 ${l.lost.map((s) => `「${s.title}」`).slice(0, 5).join(', ')}${l.lost.length > 5 ? ' 등' : ''}이(가) 사라집니다. 고치지 않았습니다. 그 단계를 남기려면 --step 에 같은 이름으로 함께 적고, 정말 빼려면 --drop-steps 를 붙이세요.`, 'step-loss');
      } else if (patch.steps === null && (it.steps || []).length && body.dropSteps !== true) return no(409, '이대로 고치면 단계가 모두 사라집니다. 고치지 않았습니다. 정말 빼려면 --drop-steps 를 붙이세요.', 'step-loss');
      const r = pl.apply([{ op: 'update', id: it.id, patch }], meta);
      bubble('고쳤어요.', r, r.items[0].start);
      return { code: 200, out: { ok: true, text: [`고쳤습니다: ${fmtItem(r.items[0])}`, ...r.warnings.map((w) => `알림: ${w}`), told].join('\n') } };
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
    // 응답을 받지 못해 같은 것을 다시 넣는 경우: 같은 세션이 방금(2분 안) 똑같은 일을 넣었고 그 일이 아직 있으면 두 번 넣지 않는다
    //   "똑같은"의 기준 = 보낸 칸 전부(이름 · 날짜 · 시각 · 단계 · 반복 · 메모 …)가 같은 것. 사이에 다른 것을 넣었어도 알아본다(최근 몇 건을 기억).
    const sig = JSON.stringify([meta.asked, FIELDS.map((k) => (item[k] === undefined ? null : item[k]))]); const nowMs = this.now().getTime();
    const recent = (this.lastAdd.get(source.id) || []).filter((x) => nowMs - x.at < SAME_ADD_MS);
    const last = recent.find((x) => x.sig === sig);
    if (last) {
      const same = pl.store.get(last.id);
      if (same && same.state !== 'trash') return { code: 200, out: { ok: true, text: `방금 같은 것을 이미 ${same.state === 'proposed' ? '제안으로 올렸습니다' : '넣었습니다'}(두 번 넣지 않았습니다): ${fmtItem(same)}` } };
    }
    const remember = (it) => this.lastAdd.set(source.id, [...recent, { sig, at: nowMs, id: it.id }].slice(-8));
    if (!meta.asked) {
      if (!meta.evidence) return { code: 400, out: { ok: false, text: '사용자가 시키지 않은 일정은 --why 에 근거(어느 대화의 무엇 때문인지)를 적어야 제안으로 올릴 수 있습니다. 사용자가 직접 시킨 것이면 --asked 를 붙이세요.' } };
      const mine = pl.store.list('proposed').filter((x) => x.source?.session?.id === source.id).length;
      if (mine >= PROPOSE_MAX) { this.log('planner-cli: 429 proposals'); return { code: 429, out: { ok: false, text: `이 세션이 올린 제안이 이미 ${mine}개 쌓여 있습니다. 사용자가 답한 뒤에 다시 올리세요.` } }; }
      const r = pl.apply([{ op: 'propose', item }], meta);
      const it = r.items[0]; remember(it);
      pl.say({ group: 'proposal', tone: 'iris', text: `「${source.title}」 세션이 「${it.title}」${josa(it.title, '을', '를')} 제안했어요.`, actions: [{ kind: 'proposals' }] });
      return { code: 200, out: { ok: true, text: `제안으로 올렸습니다(달력에는 아직 없습니다 — 사용자가 플래너에서 「추가」를 눌러야 들어갑니다): ${fmtItem(it).replace(/^#\d+ /, '')}` } };
    }
    const r = pl.apply([{ op: 'add', item }], meta);
    const it = r.items[0]; remember(it);
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
