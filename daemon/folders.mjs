// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 폴더 선택기 데이터: 온톨로지 graph.json(R·D·P 559개) + 루트 + 최근 5개 + 신선도(check_fresh.py)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findRoot } from './workspace.mjs';
import { pythonExe } from './paths.mjs';
import { parseFolder } from './tutorial.mjs';

const IRIS = findRoot(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')); // 영혼 폴더(작업공간 루트)
const GRAPH = path.join(IRIS, '_ontology', 'graph.json');
const FRESH_PY = path.join(IRIS, '_ontology', 'check_fresh.py');
const PY = pythonExe(); // IRIS_FACE_PYTHON → 자동 탐색 → null(신선도 검사 생략)
let graphCache = { mtime: 0, list: [], generated: null };
let freshCache = { at: 0, value: null };

const codesOf = (rel) => rel.split('\\').map(seg => (seg.match(/(?:^|〗)([RDPST]\d{2}(?:\.\d{2})?)/) || [])[1]).filter(Boolean);
const entry = (rel, n = {}) => ({ path: path.join(IRIS, rel), rel, type: n.type, code: n.code, lifecycle: n.lifecycle || 'active', frozen: !!n.frozen, name: rel.split('\\').pop(), codes: codesOf(rel) });

/** 디스크의 R → D(그룹 접두 포함) → P 폴더(이름 규칙 = 튜토리얼 parseFolder). 이 PC 폴더 635개 실측 11ms. */
export function scanDisk(root = IRIS) {
  const dirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };
  const TYPE = { R: 'role', D: 'domain', P: 'project' };
  const out = [];
  const walk = (relDir, letter) => {
    for (const n of dirs(path.join(root, relDir))) {
      const f = parseFolder(n); if (!f || f.letter !== letter || (letter === 'R' && f.group)) continue;
      const rel = relDir ? `${relDir}\\${n}` : n;
      out.push({ rel, type: TYPE[letter], code: f.code });
      if (letter === 'R') walk(rel, 'D'); else if (letter === 'D') walk(rel, 'P');
    }
  };
  walk('', 'R');
  return out;
}

/**
 * 폴더 목록 = 온톨로지 그래프 + 디스크 직접 훑기(v2.96.2, 2026-10-27 사용자 신고: 다른 PC에서 튜토리얼로 폴더를 만든 뒤
 * 그래프 재생성이 실패하자 새 폴더가 목록에 안 떴다 — 재시작으로도 안 고쳐짐). 그래프는 휴면·얼림 같은 속성을 주고,
 * 디스크는 "지금 실제로 있는 것"을 준다: 그래프에만 있고 디스크에 없는 것(옛 이름)은 빼고, 디스크에만 있는 것은 더한다.
 * 그래프 파일이 없거나 깨져도 디스크 목록으로 동작한다.
 */
export function listFolders() {
  const st = fs.existsSync(GRAPH) ? fs.statSync(GRAPH).mtimeMs : 0;
  if (st !== graphCache.mtime) {
    let g = null; try { g = st ? JSON.parse(fs.readFileSync(GRAPH, 'utf8')) : null; } catch {}
    const nodes = g ? (Array.isArray(g.nodes) ? g.nodes : Object.values(g.nodes || {})) : [];
    const list = nodes.filter(n => n && typeof n.path === 'string').map(n => entry(n.path.replace(/\//g, '\\'), n));
    graphCache = { mtime: st, list, generated: g?.generated || null };
  }
  const disk = scanDisk();
  const onDisk = new Set(disk.map(d => d.rel.toLowerCase()));
  const kept = graphCache.list.filter(f => onDisk.has(f.rel.toLowerCase()) || fs.existsSync(f.path));
  const known = new Set(kept.map(f => f.rel.toLowerCase()));
  const added = disk.filter(d => !known.has(d.rel.toLowerCase())).map(d => entry(d.rel, d));
  return { generated: graphCache.generated, root: { path: IRIS, rel: '', type: 'root', code: 'IRIS', name: 'IRIS 루트', lifecycle: 'active', codes: [] }, folders: [...kept, ...added] };
}

/** 온톨로지 신선도: check_fresh.py 종료코드 0 = 최신 (10분 캐시). 파이썬이나 검사 스크립트가 없는 PC면 {fresh:null} — 화면은 경고 없이 넘어간다. */
export function checkFresh() {
  if (Date.now() - freshCache.at < 10 * 60 * 1000) return Promise.resolve(freshCache.value);
  if (!PY || !fs.existsSync(FRESH_PY)) { freshCache = { at: Date.now(), value: { fresh: null, message: PY ? '신선도 검사 도구(_ontology/check_fresh.py) 없음' : '파이썬 없음 — 신선도 검사 생략' } }; return Promise.resolve(freshCache.value); }
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(PY, [FRESH_PY], { cwd: IRIS, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    const timer = setTimeout(() => { try { child.kill(); } catch {} finish(null, 'timeout'); }, 20000);
    child.on('error', (e) => { clearTimeout(timer); finish(null, `실행 실패: ${e.message}`); });
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => { clearTimeout(timer); finish(code, out.trim()); });
    function finish(code, msg) { freshCache = { at: Date.now(), value: { fresh: code === 0, message: String(msg || '').split('\n').pop() } }; resolve(freshCache.value); }
  });
}

// 최근 폴더(최대 5개 — 2026-09-10 사용자 지정, 구 8개). 읽을 때도 잘라 옛 파일의 6~8번째가 화면에 남지 않게 한다.
const RECENT_MAX = 5;
export class RecentFolders {
  constructor(stateDir) { this.file = path.join(stateDir, 'recent-folders.json'); try { this.list = JSON.parse(fs.readFileSync(this.file, 'utf8')).slice(0, RECENT_MAX); } catch { this.list = []; } }
  touch(p) { this.list = [p, ...this.list.filter(x => x.toLowerCase() !== p.toLowerCase())].slice(0, RECENT_MAX); fs.writeFileSync(this.file, JSON.stringify(this.list, null, 2), 'utf8'); }
  get() { return this.list; }
}
