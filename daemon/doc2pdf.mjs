// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// doc2pdf.mjs — 문서(한/글·워드·엑셀·PPT)를 PDF로 변환해 캐시에 두고 그 경로를 돌려준다.
// 데몬은 순수 node 라 COM 을 직접 못 부른다 → 파이썬(doc2pdf.py)을 자식으로 띄운다.
//   · .hwp/.hwpx → pyhwpx 가 깔린 한/글 MCP venv 파이썬 (환경변수 IRIS_FACE_HWP_PY 로 덮어쓰기)
//   · 그 밖(오피스) → win32com 이 있는 시스템 파이썬 (환경변수 IRIS_FACE_PY / python)
// 변환은 원본을 읽기 전용으로만 열고 새 PDF 를 만든다. 실패하면 throw → 호출부가 카드로 대체.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toolPath } from './paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PY = path.join(HERE, 'doc2pdf.py');

export const DOC_EXTS = ['.hwp', '.hwpx', '.doc', '.docx', '.rtf', '.odt', '.xls', '.xlsx', '.xlsm', '.ods', '.ppt', '.pptx', '.odp'];

// 한/글은 pyhwpx 가 필요하다. 환경변수(IRIS_FACE_HWP_PY, PC마다 다른 실제 자리)를 우선 쓰고,
// 없으면 공유 도구 폴더(_agent\shared\tools\document-mcp\hwp\<커밋>\) 아래를 뒤져 venv 를 찾는다.
// 못 찾으면 hwp 변환만 불가(오피스·PDF 는 계속 됨).
const OFFICE_PY = process.env.IRIS_FACE_PY || 'python';

function hwpPyCandidatesFromSharedTools() {
  const base = toolPath('document-mcp', 'hwp');
  const found = [];
  try {
    for (const sub of fs.readdirSync(base, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const subDir = path.join(base, sub.name);
      found.push(path.join(subDir, '.venv', 'Scripts', 'python.exe'));
      found.push(path.join(subDir, 'hwp-form-automation-mcp', '.venv', 'Scripts', 'python.exe'));
    }
  } catch {}
  return found;
}

function hwpPython() {
  const candidates = [process.env.IRIS_FACE_HWP_PY, ...hwpPyCandidatesFromSharedTools()].filter(Boolean);
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch {} }
  return null;
}

export function isConvertible(file) {
  return DOC_EXTS.includes(path.extname(file).toLowerCase());
}

// 변환 결과 PDF 의 캐시 경로 = 원본 경로 + 수정시각 지문. 원본이 바뀌면 새로 변환한다.
function cachePath(cacheDir, src) {
  const st = fs.statSync(src);
  const key = crypto.createHash('sha1').update(`${src}|${st.mtimeMs}|${st.size}`).digest('hex').slice(0, 16);
  const base = path.basename(src).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  return path.join(cacheDir, `${key}-${base}.pdf`);
}

const inflight = new Map(); // 같은 파일 동시 요청은 한 번만 변환

// src(문서) → PDF 경로. 캐시 적중 시 즉시 반환. cacheDir = state/doc-cache.
export function toPdf(src, cacheDir, log = () => {}) {
  const ext = path.extname(src).toLowerCase();
  if (!fs.existsSync(src)) return Promise.reject(new Error(`파일이 없습니다: ${src}`));
  if (!isConvertible(src)) return Promise.reject(new Error(`변환할 수 없는 형식: ${ext}`));
  fs.mkdirSync(cacheDir, { recursive: true });
  const out = cachePath(cacheDir, src);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return Promise.resolve(out);
  if (inflight.has(out)) return inflight.get(out);

  const isHwp = ext === '.hwp' || ext === '.hwpx';
  const py = isHwp ? hwpPython() : OFFICE_PY;
  if (isHwp && !py) return Promise.reject(new Error('한/글 변환기(pyhwpx)를 찾지 못했습니다. 한/글이 설치된 PC에서만 미리보기가 됩니다.'));

  const t0 = Date.now();
  const job = new Promise((resolve, reject) => {
    let stderr = '';
    // PYTHONUTF8: 경로에 든 〖 같은 글자를 win32com makepy 가 cp949 콘솔로 print 하다 죽는 것을 막는다(R-010 계열).
    const child = spawn(py, [PY, src, out], { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
    const timer = setTimeout(() => { try { child.kill(); } catch {} reject(new Error('변환 시간 초과(90초)')); }, 90_000);
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(out) && fs.statSync(out).size > 0) {
        log(`doc2pdf ${ext} ${((Date.now() - t0) / 1000).toFixed(1)}s ${path.basename(src)}`);
        resolve(out);
      } else {
        reject(new Error(stderr.trim().split('\n').pop() || `변환 실패(code=${code})`));
      }
    });
  }).finally(() => inflight.delete(out));
  inflight.set(out, job);
  return job;
}
