// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 도구 카탈로그(판 B, 2026-11-10 — 설계 정본 = docs\설계-도구화면-2026-11-10.md): 엄선 목록 읽기 · 트리 해시 · 안전한 부분 압축 해제.
// 목록은 저장소 안 정적 파일(daemon/tools-catalog.json) 하나 — 인터넷에서 받아 오지 않는다(창 판과 함께만 바뀐다).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { zipIndex, zipEntryData } from './zip.mjs';
import { unsafe } from './modinstall.mjs';

export const TOOL_CATALOG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tools-catalog.json');
export const KINDS = ['skill', 'mcp', 'plugin'];
export const AGENT_IDS = ['claude', 'codex'];
const ID_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REL_RE = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

/** 트리 해시: 경로(`/` 구분·NFC)를 바이트 순으로 정렬해 `경로\0크기\0sha256\n` 을 이어 붙인 것의 sha256. 압축 방식·시각과 무관. */
export function treeHash(entries) {
  const rows = entries.map((e) => ({ p: String(e.path).replace(/\\/g, '/').normalize('NFC'), d: e.data }));
  rows.sort((a, b) => Buffer.compare(Buffer.from(a.p, 'utf8'), Buffer.from(b.p, 'utf8')));
  const h = crypto.createHash('sha256');
  for (const r of rows) h.update(`${r.p}\0${r.d.length}\0${crypto.createHash('sha256').update(r.d).digest('hex')}\n`, 'utf8');
  return h.digest('hex');
}

/** 디스크 폴더의 트리 해시(설치 뒤 지문·삭제 전 대조용). 링크·연결점은 따라가지 않고 해시에 넣지 않는다. */
export function treeHashDir(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(full, r); else if (st.isFile()) out.push({ path: r, data: fs.readFileSync(full) });
    }
  };
  walk(dir, '');
  return treeHash(out);
}

/** codeload zip(`<repo>-<commit>/…`) 에서 하위 경로 sub 아래 파일만 꺼낸다. 경로 검사(예약 이름·끝 점·`:`·대소문자 중복·탈출)와 총량 상한.
 *  돌려주는 값 = [{ path(하위 경로 기준 상대), data }]. 하나라도 이상하면 throw. */
export function extractSubtree(zipBuf, sub, { maxBytes = 64 * 1024 * 1024, maxFiles = 4000 } = {}) {
  const entries = zipIndex(zipBuf, { maxTotalBytes: 2 * 1024 * 1024 * 1024, maxEntryBytes: 256 * 1024 * 1024, maxEntries: 200000 });
  if (!entries.length) throw new Error('empty zip');
  const top = entries[0].name.split('/')[0];
  const prefix = sub ? `${top}/${sub.replace(/\/+$/, '')}/` : `${top}/`;
  const picked = entries.filter((e) => e.name.startsWith(prefix) && !e.name.endsWith('/'));
  if (!picked.length) throw new Error(`nothing under ${sub || '(root)'}`);
  if (picked.length > maxFiles) throw new Error(`too many files (${picked.length})`);
  let total = 0;
  const files = new Set(), dirs = new Set(), out = [];
  for (const e of picked) {
    const rel = e.name.slice(prefix.length);
    if (unsafe(rel)) throw new Error(`unsafe path: ${rel}`);
    const low = rel.toLowerCase();
    if (files.has(low) || dirs.has(low)) throw new Error(`duplicate path (case/folder): ${rel}`);
    const parts = low.split('/');
    for (let i = 1; i < parts.length; i++) { const anc = parts.slice(0, i).join('/'); if (files.has(anc)) throw new Error(`file/folder clash: ${anc}`); dirs.add(anc); }
    files.add(low);
    total += e.usize; if (total > maxBytes) throw new Error('subtree too large');
    out.push({ path: rel, data: zipEntryData(zipBuf, e) });
  }
  return out;
}

/** 꺼낸 파일들을 임시 폴더에 쓴 뒤 dest 로 한 번에 옮긴다(dest 가 이미 있으면 거절). */
export function writeTreeAtomic(entries, dest) {
  if (fs.existsSync(dest)) throw new Error(`already exists: ${dest}`);
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const e of entries) {
      const f = path.join(tmp, ...e.path.split('/'));
      if (!path.resolve(f).startsWith(path.resolve(tmp) + path.sep)) throw new Error(`escape: ${e.path}`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, e.data);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(tmp, dest);
  } catch (err) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} throw err; }
}

/** 카탈로그 한 항목 검사. 돌려주는 값 = 오류 문자열 목록(비면 OK). */
export function validateItem(it) {
  const e = [];
  if (!it || typeof it !== 'object') return ['not an object'];
  if (!ID_RE.test(it.id || '')) e.push(`bad id: ${it.id}`);
  if (!KINDS.includes(it.kind)) e.push(`${it.id}: bad kind`);
  if (!Array.isArray(it.agents) || !it.agents.length || it.agents.some((a) => !AGENT_IDS.includes(a))) e.push(`${it.id}: bad agents`);
  if (!it.name || !it.desc) e.push(`${it.id}: name/desc missing`);
  if (it.key) e.push(`${it.id}: key-requiring tools are not allowed yet`); // 6-2절 6 — 첫 판은 키 필요 도구 없음
  const ins = it.install || {};
  if (it.kind === 'skill') {
    if (!REPO_RE.test(ins.repo || '') || !COMMIT_RE.test(ins.commit || '') || !REL_RE.test(ins.path || '') || !SHA_RE.test(ins.treeSha256 || '')) e.push(`${it.id}: skill install fields`);
  } else if (it.kind === 'plugin') {
    for (const a of it.agents) {
      const p = ins[a];
      if (!p || !REPO_RE.test(p.repo || '') || !COMMIT_RE.test(p.commit || '') || !(p.path === '.' || REL_RE.test(p.path || '')) || !SHA_RE.test(p.treeSha256 || '') || !/^[a-z0-9][a-z0-9-]*$/i.test(p.plugin || '')) e.push(`${it.id}: plugin install fields for ${a}`);
      if (p && p.unpinned) e.push(`${it.id}: plugin for ${a} fetches unpinned code at runtime`);
    }
  } else if (it.kind === 'mcp') {
    // 첫 판 = 원격 주소(https) MCP 만 — 이 PC 에 내려받아 실행하는 것이 없다(설계 6-2절 12)
    if (ins.via !== 'http' || !/^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9._~\/-]*)?$/.test(ins.url || '')) e.push(`${it.id}: mcp install fields (https url only)`);
  }
  if (!it.tested || !it.tested.at) e.push(`${it.id}: not tested`);
  return e;
}

/** 카탈로그 파일 읽기. 형식이 깨진 항목은 버리고(errors 에 사유), 시험 기록 없는 항목도 버린다. */
export function loadToolCatalog(file = TOOL_CATALOG_FILE) {
  let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return { base: {}, items: [], errors: [`catalog unreadable: ${err.message}`] }; }
  const errors = [], items = [], ids = new Set();
  for (const it of Array.isArray(j.items) ? j.items : []) {
    const errs = validateItem(it);
    if (ids.has(it?.id)) errs.push(`${it.id}: duplicate id`);
    if (errs.length) { errors.push(...errs); continue; }
    ids.add(it.id); items.push(it);
  }
  return { base: j.base || {}, items, errors };
}
