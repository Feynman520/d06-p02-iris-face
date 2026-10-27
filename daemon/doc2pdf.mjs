// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// doc2pdf.mjs — 문서(한/글·워드·엑셀·PPT)를 PDF로 변환해 캐시에 두고 그 경로를 돌려준다.
// 데몬은 순수 node 라 COM 을 직접 못 부른다 → 파이썬(doc2pdf.py)을 자식으로 띄운다.
//   · .hwp/.hwpx → pyhwpx 가 깔린 한/글 MCP venv 파이썬 (환경변수 IRIS_FACE_HWP_PY 로 덮어쓰기)
//   · 그 밖(오피스) → win32com 이 있는 시스템 파이썬 (환경변수 IRIS_FACE_PY / python)
//   · macOS → 오피스는 LibreOffice(soffice --headless, 시스템 글꼴은 fonts.conf 로), 한/글은 python-hwpx → HTML → LibreOffice 근사본
// 변환은 원본을 읽기 전용으로만 열고 새 PDF 를 만든다. 실패하면 throw → 호출부가 카드로 대체.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { toolPath, soulRoot } from './paths.mjs';

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

// ---- macOS(2026-10-27): COM 이 없다 → 오피스 문서만 LibreOffice(설치돼 있으면)로 변환한다. 한/글 미리보기는 아직 없다(P03 설계-macOS M6). ----
/** LibreOffice 실행 파일: IRIS_FACE_SOFFICE → /Applications → ~/Applications. 없으면 null. */
export function sofficePath() {
  const cands = [process.env.IRIS_FACE_SOFFICE, '/Applications/LibreOffice.app/Contents/MacOS/soffice', path.join(os.homedir(), 'Applications', 'LibreOffice.app', 'Contents', 'MacOS', 'soffice')].filter(Boolean);
  return cands.find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } }) || null;
}
// 화면 없는 LibreOffice 는 macOS 글꼴 시스템이 아니라 fontconfig 로 글꼴을 찾아 시스템 글꼴(한글)을 하나도 못 본다 —
// 한글이 □ 로 나온다(2026-10-27 실측). 시스템 글꼴 폴더를 적은 fonts.conf 를 캐시에 두고 FONTCONFIG_FILE 로 넘긴다
// (문서 MCP 들의 engine/lo_bridge.py 와 같은 처리).
const FONT_DIRS = ['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/System/Library/AssetsV2/com_apple_MobileAsset_Font7', '/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts')];
function fontconfigFile(cacheDir) {
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const text = '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n<fontconfig>\n'
    + FONT_DIRS.filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } }).map((d) => `  <dir>${esc(d)}</dir>\n`).join('')
    + `  <cachedir>${esc(path.join(cacheDir, 'fontconfig-cache'))}</cachedir>\n</fontconfig>\n`;
  const file = path.join(cacheDir, 'fonts.conf');
  try { if (fs.readFileSync(file, 'utf8') === text) return file; } catch {}
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

function sofficeToPdf(soffice, src, out, cacheDir, { infilter } = {}) {
  // 사용자가 LibreOffice 를 열어 둔 채여도 부딪히지 않게 데몬 전용 프로필(state/doc-cache/lo-profile)로 돌린다.
  const work = fs.mkdtempSync(path.join(cacheDir, 'lo-'));
  const profile = pathToFileURL(path.join(cacheDir, 'lo-profile')).href;
  const env = { ...process.env };
  if (!env.FONTCONFIG_FILE) env.FONTCONFIG_FILE = fontconfigFile(cacheDir);
  return new Promise((resolve, reject) => {
    let stderr = '';
    const args = [`-env:UserInstallation=${profile}`, '--headless', '--norestore', ...(infilter ? [`--infilter=${infilter}`] : []), '--convert-to', 'pdf', '--outdir', work, src];
    const child = spawn(soffice, args, { stdio: ['ignore', 'ignore', 'pipe'], env });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} reject(new Error('변환 시간 초과(90초)')); }, 90_000);
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const made = path.join(work, `${path.basename(src, path.extname(src))}.pdf`);
      try {
        if (code === 0 && fs.existsSync(made) && fs.statSync(made).size > 0) { fs.renameSync(made, out); resolve(out); }
        else reject(new Error(stderr.trim().split('\n').pop() || `변환 실패(code=${code})`));
      } finally { try { fs.rmSync(work, { recursive: true, force: true }); } catch {} }
    });
  });
}

// macOS 한/글 미리보기: 문서 도구 venv 의 python-hwpx 로 본문·표를 HTML 로 꺼내 LibreOffice 로 PDF 를 만든다.
// 한컴 렌더러가 아니라 내용 확인용 근사본이다(쪽 배치·글꼴이 한컴과 다름) — 원본은 ⧉ 로 기본 앱에서.
const HWPX_HTML_PY = [
  'import sys, warnings',
  'warnings.simplefilter("ignore")',
  'from hwpx import HwpxDocument',
  'doc = HwpxDocument.open(sys.argv[1])',
  'css = "<style>body{font-family:\'Apple SD Gothic Neo\',sans-serif;font-size:11pt;line-height:1.6}p{margin:0 0 4pt}table{border-collapse:collapse;margin:6pt 0}td,th{border:0.75pt solid #444;padding:3pt 5pt;vertical-align:top}</style>"',
  'html = doc.export_html(title="preview")',
  'html = html.replace("</head>", css + "</head>", 1)',
  'open(sys.argv[2], "w", encoding="utf-8").write(html)',
].join('\n');
function documentMcpPython() {
  const p = path.join(soulRoot(), '_agent', 'runtime', 'venvs', 'document-mcp', 'bin', 'python');
  return fs.existsSync(p) ? p : null;
}
function hwpxPreview(src, out, cacheDir, soffice) {
  const py = documentMcpPython();
  if (!py) return Promise.reject(new Error('한/글 미리보기에 필요한 문서 도구(python-hwpx)가 없습니다. ⧉ 로 기본 앱에서 여세요.'));
  const work = fs.mkdtempSync(path.join(cacheDir, 'hwpx-'));
  const html = path.join(work, `${path.basename(src, path.extname(src))}.html`);
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(py, ['-c', HWPX_HTML_PY, src, html], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, PYTHONUTF8: '1' } });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} reject(new Error('한/글 문서 읽기 시간 초과(60초)')); }, 60_000);
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || !fs.existsSync(html)) { reject(new Error(stderr.trim().split('\n').pop() || `한/글 문서를 읽지 못했습니다(code=${code})`)); return; }
      resolve(sofficeToPdf(soffice, html, out, cacheDir, { infilter: 'HTML (StarWriter)' }));
    });
  }).finally(() => { try { fs.rmSync(work, { recursive: true, force: true }); } catch {} });
}

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
  if (process.platform !== 'win32') {
    const soffice = sofficePath();
    if (!soffice) return Promise.reject(new Error('LibreOffice 가 없어 미리보기를 만들 수 없습니다. ⧉ 로 기본 앱에서 여세요.'));
    const t0 = Date.now();
    const made = isHwp ? hwpxPreview(src, out, cacheDir, soffice) : sofficeToPdf(soffice, src, out, cacheDir);
    const job = made.then((r) => { log(`doc2pdf(${isHwp ? 'hwpx' : 'soffice'}) ${ext} ${((Date.now() - t0) / 1000).toFixed(1)}s ${path.basename(src)}`); return r; }).finally(() => inflight.delete(out));
    inflight.set(out, job);
    return job;
  }
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
