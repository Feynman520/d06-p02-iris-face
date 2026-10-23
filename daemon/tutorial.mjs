// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// tutorial.mjs — 첫 실행 튜토리얼의 데몬 쪽(v2.90, 2026-10-19 사용자 결정: AI 첫 세션 자동 시작 폐기 → 기계적 튜토리얼).
//  · planStructure/createStructure: 튜토리얼 질문·답(역할 1~8(v2.94 spec.roles) · 영역 1~5 · 영역마다 프로젝트 0~5) → R/D/P 폴더 + 미니 AGENTS.md·CLAUDE.md
//    (설치기 setup/structure.mjs 와 같은 틀) → `_ontology\build_graph.py --init --write` · `--compile`(있을 때만). 이미 있는 폴더·파일은 건드리지 않는다.
//  · ontologyGraph: `_ontology\graph.json` 을 화면용으로 줄인 것(노드·관계만, 파일 내용 없음) — 설정 「온톨로지」 탭.
//  · listTools: 이 영혼의 Claude(`_agent\claude`)·Codex(`_agent\codex`) 스킬·MCP·플러그인을 **읽기만** — MCP 의 env·인자·주소 값은 싣지 않는다.
// 설계 정본 = docs\설계-튜토리얼-2026-10-19.md
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// ---------------- 폴더 만들기 ----------------
export const LIMITS = Object.freeze({ roles: 20, domains: 5, projects: 5, ko: 30, en: 40 }); // v2.95.1: 새 역할 8 → 20(역할 그림 20모습과 같게)
const BAD_CHARS = /[\\/:*?"<>|[\]{}()〖〗\u0000-\u001f]/;
const HAN_KANA = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/; // IRIS 폴더 이름은 한글·영어뿐(전역 경로 가드와 같은 규칙)
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const PERIOD = /^\d{4}년(?:\.[12]학기)?$/;

/** 이름 한 칸 검사. 돌려주는 값 = 오류 문장(사용자에게 그대로 보임) 또는 ''. */
export function checkName(s, { lang = 'ko', label = '이름' } = {}) {
  const v = String(s ?? '');
  if (lang === 'ko' && !v.trim()) return `${label}을(를) 적어 주세요.`;
  if (!v) return '';
  if (v !== v.trim()) return `${label}의 앞뒤 빈칸을 지워 주세요.`;
  if (/\.$/.test(v)) return `${label}은(는) 마침표로 끝날 수 없습니다.`;
  if (v.length > (lang === 'ko' ? LIMITS.ko : LIMITS.en)) return `${label}이(가) 너무 깁니다(${lang === 'ko' ? LIMITS.ko : LIMITS.en}자까지).`;
  if (BAD_CHARS.test(v)) return `${label}에 쓸 수 없는 글자가 있습니다: \\ / : * ? " < > | [ ] { } ( ) 〖 〗`;
  if (HAN_KANA.test(v)) return `${label}에는 한자·일본 글자를 쓰지 않습니다(한글·영어만).`;
  if (RESERVED.test(v)) return `${label}으로 쓸 수 없는 윈도 예약어입니다.`;
  if (lang === 'en' && !/^[A-Za-z0-9 &'.,+-]+$/.test(v)) return `${label}은(는) 영어·숫자로만 적어 주세요.`;
  return '';
}

export const folderName = (code, ko, en, period) => `${code}-${ko}${en ? `(${en})` : ''}${period ? ` 〖${period}〗` : ''}`;
const nextCode = (dir, letter) => {
  let used = new Set();
  try { used = new Set(fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => (new RegExp(`^${letter}(\\d{2})(?:\\.\\d{2})?-`).exec(d.name) || [])[1]).filter(Boolean).map(Number)); } catch {}
  for (let i = 1; i < 100; i++) if (!used.has(i)) return `${letter}${String(i).padStart(2, '0')}`;
  return null;
};
/** 폴더 이름 풀기: [〖그룹〗]코드-한글(영어) 〖태그〗… → { group, letter, code, ko, en, tags }. 위계 이름이 아니면 null. */
export function parseFolder(name) {
  const m = /^(〖[^〗]*〗)?([RDP])(\d{2}(?:\.\d{2})?)-(.+)$/.exec(String(name || ''));
  if (!m) return null;
  const rest = m[4], tags = [...rest.matchAll(/〖([^〗]*)〗/g)].map((x) => x[1]);
  const ko = rest.replace(/〖[^〗]*〗/g, '').replace(/\(.*$/, '').trim();
  const en = (/\(([^)]*)\)/.exec(rest.replace(/〖[^〗]*〗/g, '')) || [])[1] || '';
  return { group: m[1] ? m[1].slice(1, -1) : '', letter: m[2], code: `${m[2]}${m[3]}`, ko, en, tags };
}
/**
 * 같은 폴더 찾기(v2.95, 2026-10-23 사용자 결정): 번호를 뗀 **한글 이름**(+ 프로젝트는 기간 태그)이 같으면 같은 폴더 — 영어가 달라도 그 안에 더한다.
 * (옛 규칙 = 번호 뒤 전체가 같아야 함 → 「담임」이 `D05-담임(Homeroom Teacher)` 옆에 `D10-담임(Homeroom)` 을 새로 만들었다.)
 * 그룹 접두(〖교재〗D01)는 별개 번호 줄이라 대상에서 뺀다. 기간 아닌 태그가 붙은 폴더(〖화재〗 등)는 다른 폴더로 본다.
 */
const existingSame = (dir, letter, ko, period = '') => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
      .find((n) => { const f = parseFolder(n); return f && !f.group && f.letter === letter && f.ko === ko && f.tags.join('|') === (period || ''); }) || null;
  } catch { return null; }
};
/** spec 의 `existing`(이미 있는 폴더 이름) 검사 — 그 부모 바로 아래 실제 폴더이고 위계 이름일 때만 그 이름을 돌려준다. */
const existingNamed = (dir, letter, name) => {
  const n = String(name || '');
  if (!n || /[\\/]/.test(n) || n.startsWith('.') || parseFolder(n)?.letter !== letter) return null;
  try { return fs.statSync(path.join(dir, n)).isDirectory() ? n : null; } catch { return null; }
};

/** 이미 있는 R/D/P 구조(읽기만, v2.95) — 튜토리얼 다시 보기가 「이미 있음」으로 깔아 둔다. 서랍·`_` 폴더·파일은 뺀다. */
export function listExisting(root, { maxD = 40, maxP = 80 } = {}) {
  const dirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'ko')); } catch { return []; } };
  const pick = (d, letter) => dirs(d).map((n) => ({ n, f: parseFolder(n) })).filter((x) => x.f?.letter === letter)
    .sort((a, b) => (a.f.group ? 1 : 0) - (b.f.group ? 1 : 0) || a.n.localeCompare(b.n, 'ko')); // 그룹 접두(〖교재〗D01) 묶음은 맨 아래
  const roles = pick(root, 'R').filter((x) => !x.f.group).map(({ n, f }) => ({
    name: n, code: f.code, ko: f.ko, tags: f.tags,
    domains: pick(path.join(root, n), 'D').slice(0, maxD).map(({ n: dn, f: df }) => ({
      name: dn, code: df.code, ko: df.ko, group: df.group, tags: df.tags,
      projects: pick(path.join(root, n, dn), 'P').slice(0, maxP).map(({ n: pn, f: pf }) => ({ name: pn, code: pf.code, ko: pf.ko, tags: pf.tags })),
    })),
  }));
  return { ok: true, roles };
}

/**
 * 질문·답 → 만들 폴더 계획(아직 아무것도 쓰지 않는다). 오류가 있으면 { ok:false, errors:[{where, message}] }.
 * spec = { role:{ko,en}, domains:[{ ko, en, projects:[{ko,en,period}] }] }
 */
export function planStructure(root, spec) {
  // v2.94: 역할 여러 개 = spec.roles:[{ko,en,domains}] — 한 번에 계획(새 역할끼리 번호가 겹치지 않게). 옛 모양 { role, domains } 도 그대로 받는다.
  if (Array.isArray(spec?.roles)) {
    if (!spec.roles.length) return { ok: false, errors: [{ where: 'roles', message: '역할을 하나 이상 골라 주세요.' }] };
    // 상한은 **새 역할**에만(v2.95: 이미 있는 역할 안에 더하는 것은 세지 않는다 — 이 PC 처럼 역할이 13개여도 다시 보기에서 더할 수 있게)
    if (spec.roles.filter((r) => !r?.existing).length > LIMITS.roles || spec.roles.length > 60) return { ok: false, errors: [{ where: 'roles', message: `역할은 ${LIMITS.roles}개까지 만들 수 있습니다.` }] };
    const errors = [], items = [], takenR = new Set(), seen = new Set();
    spec.roles.forEach((r, k) => {
      const key = r?.existing || r?.ko;
      if (key && seen.has(key)) errors.push({ where: `roles.${k}.ko`, message: `역할 이름 "${r.ko || r.existing}"이(가) 두 번 있습니다.` }); seen.add(key);
      const one = planStructure(root, { role: { ko: r?.ko, en: r?.en, existing: r?.existing }, domains: r?.domains, _takenR: takenR });
      if (!one.ok) errors.push(...one.errors.map((e) => ({ where: `roles.${k}.${e.where}`, message: `${r?.ko || `역할 ${k + 1}`}: ${e.message}` })));
      else items.push(...one.items);
    });
    return errors.length ? { ok: false, errors } : { ok: true, items };
  }
  const errors = []; const items = [];
  const err = (where, message) => errors.push({ where, message });
  const role = spec?.role || {}; const domains = Array.isArray(spec?.domains) ? spec.domains : [];
  const chk = (v, lang, label, where) => { const m = checkName(v, { lang, label }); if (m) err(where, m); return !m; };
  // v2.95: role/domain 의 `existing` = 이미 있는 폴더 이름(튜토리얼 다시 보기) — 이름 검사 대신 실제 폴더인지 본다
  const rEx = role.existing ? existingNamed(root, 'R', role.existing) : null;
  if (role.existing && !rEx) err('role.existing', `이미 있는 역할 폴더 "${role.existing}"을(를) 찾지 못했습니다.`);
  if (!role.existing) { chk(role.ko, 'ko', '역할 이름', 'role.ko'); chk(role.en || '', 'en', '역할 영어 이름', 'role.en'); }
  if (!domains.length) err('domains', '영역을 하나 이상 적어 주세요.');
  if (domains.filter((d) => !d?.existing).length > LIMITS.domains || domains.length > 60) err('domains', `영역은 ${LIMITS.domains}개까지 만들 수 있습니다.`);
  const seenD = new Set();
  domains.forEach((d, i) => {
    if (d?.existing) { if (rEx && !existingNamed(path.join(root, rEx), 'D', d.existing)) err(`domains.${i}.existing`, `이미 있는 영역 폴더 "${d.existing}"을(를) 찾지 못했습니다.`); }
    else { chk(d?.ko, 'ko', `영역 ${i + 1} 이름`, `domains.${i}.ko`); chk(d?.en || '', 'en', `영역 ${i + 1} 영어 이름`, `domains.${i}.en`); }
    const dk = d?.existing || d?.ko;
    if (dk && seenD.has(dk)) err(`domains.${i}.ko`, `영역 이름 "${d.ko || d.existing}"이(가) 두 번 있습니다.`); seenD.add(dk);
    const ps = Array.isArray(d?.projects) ? d.projects : [];
    if (ps.length > LIMITS.projects) err(`domains.${i}.projects`, `영역 하나에 프로젝트는 ${LIMITS.projects}개까지입니다.`);
    const seenP = new Set();
    ps.forEach((p, j) => {
      chk(p?.ko, 'ko', `프로젝트 이름`, `domains.${i}.projects.${j}.ko`); chk(p?.en || '', 'en', '프로젝트 영어 이름', `domains.${i}.projects.${j}.en`);
      if (p?.period && !PERIOD.test(p.period)) err(`domains.${i}.projects.${j}.period`, '기간은 "2026년" · "2026년.1학기" · "2026년.2학기" 모양만 됩니다.');
      const key = `${p?.ko}|${p?.period || ''}`; if (p?.ko && seenP.has(key)) err(`domains.${i}.projects.${j}.ko`, `프로젝트 "${p.ko}"이(가) 두 번 있습니다.`); seenP.add(key);
    });
  });
  if (errors.length) return { ok: false, errors };
  // 번호 매기기: 같은 한글 이름이 이미 있으면 그 폴더를 쓴다(그 안에 더함), 없으면 비어 있는 첫 번호.
  const takenR = spec?._takenR instanceof Set ? spec._takenR : new Set();
  let rName = rEx || existingSame(root, 'R', role.ko);
  if (!rName) { let c = nextCode(root, 'R'); while (takenR.has(c)) c = `R${String(Number(c.slice(1)) + 1).padStart(2, '0')}`; takenR.add(c); rName = folderName(c, role.ko, role.en); }
  const rDir = path.join(root, rName);
  items.push({ level: 'R', rel: rName, name: rName, ko: role.ko || parseFolder(rName)?.ko || '', exists: fs.existsSync(rDir) });
  const takenD = new Set();
  for (const d of domains) {
    let dName = (d.existing && existingNamed(rDir, 'D', d.existing)) || existingSame(rDir, 'D', d.ko);
    if (!dName) { let c = nextCode(rDir, 'D'); while (takenD.has(c)) c = `D${String(Number(c.slice(1)) + 1).padStart(2, '0')}`; takenD.add(c); dName = folderName(c, d.ko, d.en); }
    const dRel = path.join(rName, dName); const dDir = path.join(root, dRel);
    items.push({ level: 'D', rel: dRel, name: dName, ko: d.ko || parseFolder(dName)?.ko || '', exists: fs.existsSync(dDir) });
    const takenP = new Set();
    for (const p of (d.projects || [])) {
      let pName = existingSame(dDir, 'P', p.ko, p.period);
      if (!pName) { let c = nextCode(dDir, 'P'); while (takenP.has(c)) c = `P${String(Number(c.slice(1)) + 1).padStart(2, '0')}`; takenP.add(c); pName = folderName(c, p.ko, p.en, p.period); }
      const pRel = path.join(dRel, pName);
      items.push({ level: 'P', rel: pRel, name: pName, ko: p.ko, exists: fs.existsSync(path.join(root, pRel)) });
    }
  }
  return { ok: true, items };
}

const IDENTITY = { R: (n) => `역할: ${n} — 이 역할로 하는 모든 일의 규칙과 정체성`, D: (n) => `분야: ${n} — 계속 관리하는 분야`, P: (n) => `프로젝트: ${n} — 끝이 있는 구체적인 일` };
/** 설치기 payload-src/policy/mini-AGENTS.md 와 같은 모양(번호 체계·무중복 가드 주석). */
export const miniAgents = (name, identity) => `# ${name}\n\n${identity}\n\n<!-- 상위 규칙 재서술 금지: 이 폴더 고유 규칙만 적는다 -->\n`;

const inside = (root, p) => { const r = path.resolve(root) + path.sep; return (path.resolve(p) + path.sep).toLowerCase().startsWith(r.toLowerCase()); };

/** 계획대로 만든다. 이미 있는 폴더·AGENTS.md·CLAUDE.md 는 그대로 둔다. 그래프 갱신은 runOntology 로 따로(오래 걸릴 수 있음). */
export function createStructure(root, spec, { log = () => {} } = {}) {
  const plan = planStructure(root, spec);
  if (!plan.ok) return plan;
  const created = [], kept = [], guides = { created: 0, kept: 0 };
  for (const it of plan.items) {
    const dir = path.join(root, it.rel);
    if (!inside(root, dir)) return { ok: false, errors: [{ where: it.rel, message: '영혼 폴더 밖에는 만들 수 없습니다.' }] };
    if (fs.existsSync(dir)) { kept.push(it.rel); continue; } // v2.95: 이미 있는 폴더 안에는 아무것도 쓰지 않는다(규칙 메모가 없어도 — 사람이 일부러 비워 둔 것일 수 있다)
    fs.mkdirSync(dir, { recursive: false }); created.push(it.rel);
    for (const [file, body] of [['AGENTS.md', miniAgents(it.name, IDENTITY[it.level](it.ko))], ['CLAUDE.md', '@AGENTS.md\n']]) {
      const f = path.join(dir, file);
      if (fs.existsSync(f)) { guides.kept++; continue; }
      fs.writeFileSync(f, body, 'utf8'); guides.created++;
    }
  }
  log(`tutorial structure: 새 폴더 ${created.length} · 그대로 ${kept.length} · 규칙 메모 새로 ${guides.created}`);
  return { ok: true, created, kept, guides, items: plan.items };
}

/** 파이썬: IRIS_PYTHON → 영혼 동봉 심 → 데몬이 아는 파이썬 → PATH (설치기 ontology.mjs resolvePython 과 같은 순서 + 데몬 쪽 한 칸). */
export function ontologyPython(root, fallback) {
  if (process.env.IRIS_PYTHON) return process.env.IRIS_PYTHON;
  const shim = path.join(root, '_agent', 'shared', 'shims', 'python.cmd');
  if (fs.existsSync(shim)) return shim;
  return fallback || 'python';
}
function runPy(python, args, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const isCmd = /\.(cmd|bat)$/i.test(python);
    const child = isCmd ? spawn('cmd.exe', ['/d', '/s', '/c', `"${python}" ${args.map((a) => `"${a}"`).join(' ')}`], { cwd, env, windowsHide: true, windowsVerbatimArguments: true })
      : spawn(python, args, { cwd, env, windowsHide: true });
    let out = ''; const t = setTimeout(() => { try { child.kill(); } catch {} }, timeoutMs);
    child.stdout?.on('data', (c) => { out += c; }); child.stderr?.on('data', (c) => { out += c; });
    child.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: String(e?.message || e) }); });
    child.on('exit', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}
/** `_ontology\build_graph.py --init --write` → `--compile`. 도구가 없으면 { ran:false }. 실패해도 폴더는 그대로(그래프만 다음 정리 때). */
export async function runOntology(root, { python, log = () => {}, timeoutMs = 180000 } = {}) {
  const ont = path.join(root, '_ontology'); const script = path.join(ont, 'build_graph.py');
  if (!fs.existsSync(script)) return { ran: false, reason: 'no-ontology' };
  try { fs.mkdirSync(path.join(root, '_cleanup', '리포트'), { recursive: true }); } catch {}
  const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONPATH: process.env.PYTHONPATH ? `${ont}${path.delimiter}${process.env.PYTHONPATH}` : ont };
  const steps = [];
  for (const args of [['--init', '--write'], ['--compile']]) {
    const r = await runPy(python, [script, ...args], { cwd: root, env, timeoutMs });
    steps.push({ args: args.join(' '), code: r.code });
    log(`tutorial ontology ${args.join(' ')} → ${r.code}${r.code ? ` ${String(r.out).trim().slice(-300)}` : ''}`);
    if (r.code !== 0) return { ran: true, ok: false, steps };
  }
  // v2.95: 구조 화면(IRIS-온톨로지-뷰.html)도 그래프의 거울이라 함께 다시 그린다 — 도구가 없으면 건너뛴다(실패해도 폴더·그래프는 그대로)
  const view = path.join(ont, 'render_view.py');
  if (fs.existsSync(view)) {
    const r = await runPy(python, [view], { cwd: root, env, timeoutMs });
    steps.push({ args: 'render_view', code: r.code });
    log(`tutorial ontology render_view → ${r.code}${r.code ? ` ${String(r.out).trim().slice(-300)}` : ''}`);
  }
  return { ran: true, ok: true, steps };
}

// ---------------- 온톨로지 그래프(화면용) ----------------
const NODE_TYPES = new Set(['role', 'domain', 'project']);
const LINK_RELS = new Set(['canonical', 'template', 'owner', 'sibling_group', 'promoted_to', 'uses_tool', 'stores', 'extends']); // 한 방향만(역방향 짝은 뺀다)
export function ontologyGraph(root) {
  const f = path.join(root, '_ontology', 'graph.json');
  let g; try { g = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { ok: false, reason: fs.existsSync(f) ? 'unreadable' : 'missing' }; }
  const raw = g.nodes && typeof g.nodes === 'object' ? (Array.isArray(g.nodes) ? Object.fromEntries(g.nodes.map((n) => [n.id, n])) : g.nodes) : {};
  const nodes = []; const byPath = new Map();
  for (const [id, n] of Object.entries(raw)) {
    if (!n || !NODE_TYPES.has(n.type) || typeof n.path !== 'string') continue;
    const p = n.path.replace(/\//g, '\\');
    byPath.set(p, id);
    nodes.push({ id, path: p, type: n.type, code: n.code || null, name: p.split('\\').pop(), lifecycle: n.lifecycle || null, tags: (n.tags || []).map((t) => t && t.value).filter(Boolean).slice(0, 4) });
  }
  for (const n of nodes) { const parentPath = n.path.includes('\\') ? n.path.slice(0, n.path.lastIndexOf('\\')) : null; n.parent = parentPath ? (byPath.get(parentPath) || null) : null; }
  const ids = new Set(nodes.map((n) => n.id));
  const links = (Array.isArray(g.edges) ? g.edges : []).filter((e) => e && LINK_RELS.has(e.rel) && ids.has(e.from) && ids.has(e.to)).map((e) => ({ from: e.from, to: e.to, rel: e.rel }));
  return { ok: true, generated: g.generated || null, counts: { role: nodes.filter((n) => n.type === 'role').length, domain: nodes.filter((n) => n.type === 'domain').length, project: nodes.filter((n) => n.type === 'project').length, links: links.length }, nodes, links };
}

// ---------------- 도구 목록(읽기만) ----------------
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const clip = (s, n = 160) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
/** SKILL.md 머리말의 name·description(한 줄 · 따옴표 · 접힌 > | 모두). */
export function skillMeta(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text || '')); if (!m) return null;
  const fm = m[1]; const get = (k) => {
    const re = new RegExp(`^${k}:\\s*(.*)$`, 'm'); const x = re.exec(fm); if (!x) return '';
    let v = x[1].trim();
    if (v === '>' || v === '|' || v === '>-' || v === '|-') { const after = fm.slice(x.index + x[0].length).split(/\r?\n/); const lines = []; for (const l of after.slice(1)) { if (/^\s+\S/.test(l)) lines.push(l.trim()); else if (l.trim()) break; } v = lines.join(' '); }
    return v.replace(/^["']|["']$/g, '');
  };
  return { name: get('name'), description: get('description') };
}
function skillsIn(dir, agent) {
  const out = [];
  let names = []; try { names = fs.readdirSync(dir); } catch { return out; }
  for (const n of names) {
    const meta = skillMeta(readText(path.join(dir, n, 'SKILL.md')));
    if (meta) out.push({ agent, name: meta.name || n, description: clip(meta.description) });
  }
  return out;
}
/** codex config.toml 의 [mcp_servers.<이름>] 머리와 command/url/type 줄만(값 중 실행 파일 이름만 남긴다). */
export function codexMcp(toml) {
  const out = []; let cur = null;
  for (const line of String(toml || '').split(/\r?\n/)) {
    const h = /^\s*\[mcp_servers\.([^\].]+)\]\s*$/.exec(line);
    if (h) { cur = { agent: 'codex', name: h[1].replace(/^"|"$/g, ''), kind: 'stdio', program: '' }; out.push(cur); continue; }
    if (/^\s*\[/.test(line)) { cur = null; continue; }
    if (!cur) continue;
    const c = /^\s*command\s*=\s*"([^"]*)"/.exec(line); if (c) cur.program = path.basename(c[1].replace(/\\\\/g, '\\'));
    if (/^\s*url\s*=/.test(line)) cur.kind = 'http';
    const en = /^\s*enabled\s*=\s*(true|false)/.exec(line); if (en) cur.enabled = en[1] === 'true';
  }
  return out;
}
/** home = 사용자 폴더(시험에서는 임시 폴더). 코덱스는 `CODEX_HOME\skills` 말고도 `<사용자 폴더>\.agents\skills`(여러 에이전트 공용 자리 — 이 PC 는 180개가 여기 링크로 있음)를 읽으므로 둘 다 센다(v2.92). */
export function listTools(root, { home = process.env.IRIS_AGENTS_HOME ?? os.homedir() } = {}) { // IRIS_AGENTS_HOME = 시험용(가짜 사용자 폴더)
  const cl = path.join(root, '_agent', 'claude'), cx = path.join(root, '_agent', 'codex');
  const skills = [...skillsIn(path.join(cl, 'skills'), 'claude'), ...skillsIn(path.join(cx, 'skills'), 'codex'), ...(home ? skillsIn(path.join(home, '.agents', 'skills'), 'codex') : [])];
  const mcp = [];
  const cj = readJson(path.join(cl, '.claude.json'));
  for (const [name, v] of Object.entries(cj?.mcpServers || {})) mcp.push({ agent: 'claude', name, kind: v?.type === 'http' || v?.type === 'sse' || v?.url ? 'http' : 'stdio', program: v?.command ? path.basename(String(v.command)) : '' });
  mcp.push(...codexMcp(readText(path.join(cx, 'config.toml'))));
  const plugins = [];
  const inst = readJson(path.join(cl, 'plugins', 'installed_plugins.json'));
  const enabled = readJson(path.join(cl, 'settings.json'))?.enabledPlugins || {};
  for (const [id, arr] of Object.entries(inst?.plugins || {})) {
    const e = Array.isArray(arr) ? arr[0] : arr; const [name, market] = id.split('@');
    const pj = e?.installPath ? (readJson(path.join(e.installPath, '.claude-plugin', 'plugin.json')) || {}) : {};
    plugins.push({ agent: 'claude', name, market: market || '', enabled: enabled[id] !== false, version: clip(e?.version || pj.version || '', 20), description: clip(pj.description) });
  }
  const by = (a, b) => a.name.localeCompare(b.name);
  return { ok: true, counts: { skills: skills.length, mcp: mcp.length, plugins: plugins.length }, skills: skills.sort(by), mcp: mcp.sort(by), plugins: plugins.sort(by) };
}
