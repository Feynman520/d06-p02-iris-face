// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// models.mjs — 모델 선택 칸의 이름 = 그 PC 에서 실제로 쓰는 모델(v2.102, 2026-11-10 사용자 지정 🔴).
//
// 사연: 클로드 `opus`·`fable` 같은 별칭이 실제로 어떤 모델인지는 그 PC 의 CLI 판이 정한다
//   (11/10 실측: CLI 2.1.321 `fable`=Fable 5.2 · 설치 패키지 2.1.272 `opus`=Opus 5 · `haiku`=Haiku 4.5).
//   그런데 화면 이름은 손으로 적어 두어 판이 바뀌면 어긋났다. 이제
//   ① 클로드: PATH 의 `claude` 를 심·전달 .cmd 를 따라가 실제 실행 파일까지 찾고, 그 안의 별칭 표
//      (`fable:"claude-fable-5-2"`)와 모델 표(`{id:"…",family:"…",display_name:"…"}`)를 읽어 이름을 정한다.
//      세션에는 별칭 대신 **풀어 낸 정확한 모델 이름**을 넘긴다 — 이름과 실제가 구조적으로 같다.
//      실행 파일이 바뀌면(자동 업데이트) 크기·수정 시각이 달라져 다시 읽는다.
//   ② 코덱스: 정확한 이름을 그대로 넘기므로 이름 = 실제. 다만 그 PC 코덱스가 모르는 모델은 오류가 나므로
//      코덱스가 스스로 받아 둔 `models_cache.json`(visibility=list)에 있는 것만 보인다(없으면 손 표 그대로).
//   ③ 그래도 어긋나면(세션 기록의 실제 응답 모델 ≠ 고른 모델) 화면이 경고한다(main.js · verify:models).
// 읽기 실패·실행 파일 없음이면 손 표로 돌아가되 클로드 별칭 이름에서 판 번호를 빼 거짓 판을 말하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FAMILIES = ['opus', 'sonnet', 'fable', 'haiku'];
const FAMILY_KO = { opus: 'Opus', sonnet: 'Sonnet', fable: 'Fable', haiku: 'Haiku' };
// 「(이전)」으로 함께 보일 수 있는 가장 낮은 세대 — 4.x 는 사고깊이(effort)가 없거나 옛 모델이라 넣지 않는다.
const PREV_MIN_MAJOR = 5;

/** 'claude-opus-5-5' → [5,5] · 'claude-fable-5' → [5] · 'claude-3-5-haiku' → [3,5] */
export function versionOf(id) {
  const m = String(id).match(/^claude-(?:[a-z]+-)?(\d+(?:-\d+)*)(?:-[a-z]+)?$/);
  return m ? m[1].split('-').map(Number) : [];
}
const cmpVer = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
export const familyOf = (id) => (String(id).match(/^claude-(opus|sonnet|fable|haiku|mythos)\b/) || [])[1] || null;

// ---------- 실행 파일 찾기 ----------
/** .cmd 한 장에서 다음 단계 경로를 뽑는다: 따옴표 안 `%~dp0…` 를 그 파일 폴더로 풀어 실존하는 첫 경로. */
export function nextFromCmd(cmdFile, read = (f) => fs.readFileSync(f, 'latin1'), exists = fs.existsSync) {
  let text = ''; try { text = read(cmdFile); } catch { return null; }
  const dir = path.dirname(cmdFile);
  for (const m of text.matchAll(/"([^"\r\n]*%~dp0[^"\r\n]*)"/g)) {
    const p = path.resolve(m[1].replace(/%~dp0/gi, dir + path.sep));
    if (!/\.(exe|cmd|bat|js|mjs)$/i.test(p)) continue;
    if (exists(p)) return p;
  }
  return null;
}
/** PATH 의 `claude` → 심·전달 .cmd 를 최대 5단 따라가 .exe(또는 npm 판 cli.js)까지. 못 찾으면 null. */
export function resolveClaudeBinary(opts = {}) { return resolveClaudeChain(opts).file; }
/** 같은 길을 따라가며 거친 .cmd 들도 돌려준다 — IRIS 업데이트 도구는 새 판을 새 폴더에 받고 전달 .cmd 만 바꾸므로
 *  ModelCatalog 가 그 .cmd 의 수정 시각을 보고 즉시 다시 따라간다(최대 10분 늦던 것을 세션 열 때마다로). */
export function resolveClaudeChain({ env = process.env, where = defaultWhere, read, exists = fs.existsSync } = {}) {
  const hits = where('claude', env);
  for (const first of hits) {
    let cur = first; const chain = [];
    for (let i = 0; i < 5 && cur; i++) {
      if (/\.(exe|js|mjs)$/i.test(cur)) return { file: exists(cur) ? cur : null, chain };
      if (/\.(cmd|bat)$/i.test(cur)) {
        chain.push(cur);
        const nxt = nextFromCmd(cur, read, exists);
        // npm 판 claude.cmd 는 `"%dp0%\node_modules\@anthropic-ai\claude-code\cli.js"` 꼴 — %~dp0 이 아니라 %dp0%
        if (!nxt) return { file: npmCliFromCmd(cur, read, exists), chain };
        cur = nxt; continue;
      }
      break;
    }
  }
  return { file: null, chain: [] };
}
const mtimeKey = (files) => files.map((f) => { try { const s = fs.statSync(f); return `${s.size}:${Math.round(s.mtimeMs)}`; } catch { return 'x'; } }).join('|');
function npmCliFromCmd(cmdFile, read = (f) => fs.readFileSync(f, 'latin1'), exists = fs.existsSync) {
  let text = ''; try { text = read(cmdFile); } catch { return null; }
  const m = text.match(/%dp0%\\([^"\r\n]*?cli\.(?:js|mjs))/i);
  if (!m) return null;
  const p = path.resolve(path.dirname(cmdFile), m[1]);
  return exists(p) ? p : null;
}
function defaultWhere(name, env) {
  try {
    const r = spawnSync('where', [name], { env, windowsHide: true, encoding: 'utf8', timeout: 5000 });
    return String(r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

// ---------- 실행 파일 읽기 ----------
const ALIAS_RE = /\b(opus|sonnet|fable|haiku):"(claude-[a-z0-9-]+)"/g;
const TABLE_RE = /\{id:"(claude-[a-z0-9-]+)",family:"([a-z]+)",display_name:"([^"]{1,40})"/g;
/** 실행 파일(수백 MB)을 16MB 씩 겹쳐 읽으며 별칭 표·모델 표를 모은다(동기, 처음 한 번 1~2초). */
export function scanClaudeBinary(file, { chunk = 16 * 1024 * 1024, overlap = 4096 } = {}) {
  const alias = {}, names = {};
  const votes = {}; // 같은 별칭이 다른 값으로 여러 번 나오면 가장 많이 나온 값(대개 한 가지)
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(chunk + overlap);
    let pos = 0, carry = 0;
    for (;;) {
      const n = fs.readSync(fd, buf, carry, chunk, pos);
      if (n <= 0) break;
      const s = buf.toString('latin1', 0, carry + n);
      for (const m of s.matchAll(ALIAS_RE)) { const k = `${m[1]}|${m[2]}`; votes[k] = (votes[k] || 0) + 1; }
      for (const m of s.matchAll(TABLE_RE)) names[m[1]] = { family: m[2], name: m[3] };
      pos += n;
      const total = carry + n, keep = Math.min(overlap, total);
      buf.copy(buf, 0, total - keep, total); // 끝 overlap 바이트를 앞으로(경계에 걸친 표를 놓치지 않게)
      carry = keep;
    }
  } finally { fs.closeSync(fd); }
  for (const f of FAMILIES) {
    const cands = Object.entries(votes).filter(([k]) => k.startsWith(f + '|')).sort((a, b) => b[1] - a[1]);
    if (cands.length) alias[f] = cands[0][0].split('|')[1];
  }
  return { alias, names };
}

/** 스캔 결과 → 모델 선택 목록. 별칭 줄은 풀어 낸 정확한 이름을 `actual` 로 갖는다. */
export function claudeModelsFrom(scan) {
  const out = [];
  for (const f of FAMILIES) {
    const target = scan.alias[f];
    if (!target) continue;
    const label = scan.names[target]?.name || prettyClaude(target);
    out.push({ id: f, label, actual: target });
    const tv = versionOf(target);
    const prev = Object.keys(scan.names)
      .filter((id) => scan.names[id].family === f && id !== target)
      .map((id) => ({ id, v: versionOf(id) }))
      .filter((x) => x.v.length && x.v[0] >= PREV_MIN_MAJOR && cmpVer(x.v, tv) < 0)
      .sort((a, b) => cmpVer(b.v, a.v))[0];
    if (prev) out.push({ id: prev.id, label: `${scan.names[prev.id].name} (이전)`, actual: prev.id });
  }
  return out;
}
export function prettyClaude(id) {
  const f = familyOf(id); const v = versionOf(id);
  return f ? `${FAMILY_KO[f] || f} ${v.join('.')}` : id;
}

/** 스캔을 못 했을 때: 손 표에서 별칭 줄의 판 번호를 지운다(거짓 판을 말하지 않음). 정확한 이름 줄은 그대로. */
export function claudeFallback(staticModels) {
  return staticModels.map((m) => FAMILIES.includes(m.id) ? { id: m.id, label: `${FAMILY_KO[m.id]} (이 PC 최신)`, actual: null } : { ...m, actual: m.id });
}

// ---------- 코덱스 ----------
/** 코덱스가 받아 둔 모델 목록(visibility=list). 없거나 못 읽으면 null. */
export function readCodexCache(codexHome, read = (f) => fs.readFileSync(f, 'utf8')) {
  try {
    const d = JSON.parse(read(path.join(codexHome, 'models_cache.json')));
    const list = (d.models || []).filter((m) => m && m.slug && m.visibility === 'list').sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    return list.length ? { clientVersion: d.client_version || null, list } : null;
  } catch { return null; }
}
const effortsOf = (m) => {
  let lv = m.supported_reasoning_levels;
  if (typeof lv === 'string') { try { lv = JSON.parse(lv.replace(/'/g, '"')); } catch { lv = null; } }
  return Array.isArray(lv) ? lv.map((x) => (typeof x === 'string' ? x : x?.effort)).filter(Boolean) : null;
};
/** 손 표(표시 꼬리말 「(이전)」「(구)」·사고깊이)를 유지하되, 그 PC 코덱스 목록에 없는 모델은 뺀다. 새 모델은 뒤에 더한다. */
export function codexModelsFrom(staticModels, cache) {
  if (!cache) return staticModels.map((m) => ({ ...m, actual: m.id }));
  const have = new Map(cache.list.map((m) => [m.slug, m]));
  const kept = staticModels.filter((m) => have.has(m.id)).map((m) => ({ ...m, actual: m.id }));
  const added = cache.list.filter((m) => !staticModels.some((s) => s.id === m.slug)).map((m) => {
    const e = effortsOf(m); return { id: m.slug, label: m.slug, actual: m.slug, ...(e?.length ? { efforts: e } : {}) };
  });
  return [...kept, ...added];
}

// ---------- 붙이기 ----------
/**
 * 데몬이 쓰는 한 곳. AGENTS 의 models 배열을 제자리에서 바꾼다(GET /api/agents·normalize 가 같은 배열을 본다).
 * 클로드 실행 파일이 바뀌었는지(경로·크기·수정 시각)는 refresh() 마다 stat 한 번으로 본다 — 세션 만들기 직전에 부른다.
 */
export class ModelCatalog {
  constructor({ AGENTS, env = () => process.env, codexHome, cacheFile, log = () => {}, resolve = resolveClaudeChain, scan = scanClaudeBinary } = {}) {
    Object.assign(this, { AGENTS, env, codexHome, cacheFile, log, resolve, scan });
    this.staticClaude = AGENTS.claude.models.map((m) => ({ ...m }));
    this.staticCodex = AGENTS.codex.models.map((m) => ({ ...m }));
    this.claude = { file: null, key: '', source: 'none' };
    this.codexKey = '';
    this.whereAt = 0;
  }
  /** @returns {boolean} 목록이 바뀌었으면 true */
  refresh({ force = false } = {}) {
    let changed = false;
    // 클로드
    try {
      const chainMoved = (this.claude.chain || []).length > 0 && mtimeKey(this.claude.chain) !== this.claude.chainKey;
      if (force || !this.claude.file || chainMoved || Date.now() - this.whereAt > 10 * 60_000) {
        const r = this.resolve({ env: this.env() });
        const o = r && typeof r === 'object' ? r : { file: r || null, chain: [] };
        this.claude.file = o.file; this.claude.chain = o.chain || []; this.claude.chainKey = mtimeKey(this.claude.chain); this.whereAt = Date.now();
      }
      const st = this.claude.file ? fs.statSync(this.claude.file) : null;
      const key = st ? `${this.claude.file}|${st.size}|${Math.round(st.mtimeMs)}` : 'none';
      if (key !== this.claude.key) {
        let models = null, source = 'fallback';
        if (st) {
          let scan = this.readCache(key);
          if (!scan) { const t0 = Date.now(); scan = this.scan(this.claude.file); this.writeCache(key, scan); this.log(`models: claude 실행 파일 읽음 ${path.basename(this.claude.file)} ${Date.now() - t0}ms → ${JSON.stringify(scan.alias)}`); }
          const list = claudeModelsFrom(scan);
          if (list.length) { models = list; source = 'binary'; }
        }
        if (!models) { models = claudeFallback(this.staticClaude); this.log('models: claude 실행 파일을 읽지 못해 판 번호 없는 이름으로 표시'); }
        this.replace('claude', models); this.claude.key = key; this.claude.source = source; changed = true;
      }
    } catch (e) { this.log(`models: claude 확인 실패 ${e?.message || e}`); }
    // 코덱스
    try {
      const f = path.join(this.codexHome, 'models_cache.json');
      let k = 'none'; try { const st = fs.statSync(f); k = `${st.size}|${Math.round(st.mtimeMs)}`; } catch {}
      if (k !== this.codexKey) {
        this.replace('codex', codexModelsFrom(this.staticCodex, readCodexCache(this.codexHome)));
        this.codexKey = k; changed = true;
      }
    } catch (e) { this.log(`models: codex 확인 실패 ${e?.message || e}`); }
    return changed;
  }
  replace(agent, models) {
    const a = this.AGENTS[agent];
    a.models.splice(0, a.models.length, ...models);
    if (!models.some((m) => m.id === a.default.model) && models.length) a.default.model = models[0].id;
  }
  readCache(key) {
    try { const c = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')); return c.key === key ? c.scan : null; } catch { return null; }
  }
  writeCache(key, scan) {
    try { fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true }); const tmp = this.cacheFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ key, scan }, null, 2)); fs.renameSync(tmp, this.cacheFile); } catch {}
  }
  info() { return { claude: { file: this.claude.file, source: this.claude.source }, codex: { cache: this.codexKey !== 'none' } }; }
}

/** 고른 모델(정확한 이름) ↔ 세션 기록의 실제 응답 모델이 같은가. 모르면 null. */
export function modelMatches(expected, actual) {
  if (!expected || !actual || actual === '<synthetic>') return null;
  const norm = (s) => String(s).toLowerCase().replace(/\[1m\]$/, '').replace(/-\d{8}$/, '');
  return norm(expected) === norm(actual);
}
