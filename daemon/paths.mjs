// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 경로 자립 — 다른 영혼 폴더(예: C:\NOVA\_agent\shared\tools\iris-face)에서 실행돼도
// 이 파일 위치를 기준으로 영혼 폴더 루트·공유 도구 폴더를 스스로 찾는다.
// 루트 탐색 자체는 workspace.mjs 의 findRoot() 를 재사용한다(여기서 새로 만들지 않는다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot } from './workspace.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 영혼 폴더 루트. IRIS_ROOT 환경변수가 있으면 그것이 우선(findRoot 안에서 처리). */
export const soulRoot = () => findRoot(path.join(HERE, '..'));

/** 여러 프로젝트가 공유하는 도구 폴더: <root>\_agent\shared\tools */
export const toolsDir = () => path.join(soulRoot(), '_agent', 'shared', 'tools');

/** 공유 도구 폴더 아래 한 도구의 경로: toolPath('document-mcp', 'hwp') 형태 */
export const toolPath = (name, ...rel) => path.join(toolsDir(), name, ...rel);

/** TeamClaude 대시보드 폴더 — 환경변수 TEAMCLAUDE_DASH_DIR → 공유 도구 폴더 → 옛 자리(이 PC 자리) 순서로 첫 존재. 없으면 null(= 한도·대시보드 기능 끔). */
export function dashDir() {
  const candidates = [
    process.env.TEAMCLAUDE_DASH_DIR,
    path.join(toolsDir(), 'teamclaude-dash'),
    path.join(soulRoot(), '_agent', 'claude', 'tools', 'teamclaude-dash'),
  ].filter(Boolean);
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch {} }
  return null;
}

/** TeamClaude 대시보드 뷰어 포트(기본 3457). 환경변수 TEAMCLAUDE_DASH_PORT 로 바꾼다. */
export const dashPort = () => Number(process.env.TEAMCLAUDE_DASH_PORT) || 3457;

// ---- 파이썬 실행 파일(2026-09-11 매듭 풀기): 환경변수 → 자동 탐색 → null(그 기능 끔). 사람 PC마다 다른 경로를 소스에 굳히지 않는다. ----
let pyCache; // undefined = 아직 안 찾음, null = 없음
/**
 * 파이썬 3 실행 파일 경로. 우선순위: IRIS_FACE_PYTHON → %LOCALAPPDATA%\Programs\Python\Python3xx(높은 버전 먼저)
 * → PATH 의 python.exe(스토어 스텁 WindowsApps 는 제외) → null. 결과는 프로세스 안에서 한 번만 계산한다.
 */
export function pythonExe() {
  if (pyCache !== undefined) return pyCache;
  const found = [];
  const env = process.env.IRIS_FACE_PYTHON; if (env) found.push(env);
  const la = process.env.LOCALAPPDATA;
  if (la) {
    const base = path.join(la, 'Programs', 'Python');
    try {
      fs.readdirSync(base).filter(d => /^Python3\d+$/i.test(d)).sort((a, b) => Number(b.slice(6)) - Number(a.slice(6)))
        .forEach(d => found.push(path.join(base, d, 'python.exe')));
    } catch {}
  }
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir || /WindowsApps/i.test(dir)) continue;
    found.push(path.join(dir, process.platform === 'win32' ? 'python.exe' : 'python3'));
  }
  pyCache = found.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || null;
  return pyCache;
}

/** 설치기가 남긴 영수증(package-receipt.json). 없으면 null. */
export function readReceipt() {
  try {
    const p = path.join(soulRoot(), '_agent', 'setup', 'package-receipt.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}
