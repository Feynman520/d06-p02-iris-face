// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 음성 전사(🎤) — 로컬 faster-whisper 워커(whisper_worker.py)를 자식으로 거느리고 HTTP 요청을 넘긴다(2026-09-10, 사용자 결정: 로컬 위스퍼).
// 화면 → POST /api/transcribe(오디오 본문) → state\voice\<시각>.webm 저장 → 워커 → {text}. 성공하면 파일 삭제, 실패하면 남겨 '다시 시도'에 쓴다.
// 설정(settings.json `voice`): { model:'large-v3-turbo', preload:true, device:'auto'|'cuda'|'cpu' }. 용어 힌트 = state\voice-hints.txt(한 줄 한 낱말, 매 요청 때 읽음).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pythonExe } from './paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 파이썬 경로는 paths.mjs pythonExe()(IRIS_FACE_PYTHON → 자동 탐색 → null). 없거나 faster-whisper 가 없으면 🎤 기능만 꺼지고 데몬은 그대로 돈다(2026-09-11 매듭 풀기).
const DEFAULTS = { model: 'large-v3-turbo', preload: true, device: 'auto' };
const DEFAULT_HINTS = ['클로드코드', '코덱스', '클로드', 'IRIS', 'IRIS-Face', '아이리스', '온톨로지', '그래프', '데몬', '세션', '에이전트', '사고깊이', '배포 스택', '슈파베이스', '버셀', '한글', 'HWPX', '깃허브', '커밋'];
const MAX_RESTARTS = 3;         // 연속 실패 상한 — 넘으면 재기동을 멈춘다(무한 재기동 방지)
const REQUEST_TIMEOUT = 5 * 60 * 1000;
const PROBE_TIMEOUT = 20 * 1000; // faster-whisper import 확인 상한(첫 import 는 CUDA DLL 로딩으로 수 초 걸릴 수 있음)

export class Voice {
  constructor(stateDir, settings, log) {
    this.dir = path.join(stateDir, 'voice'); fs.mkdirSync(this.dir, { recursive: true });
    this.hintsFile = path.join(stateDir, 'voice-hints.txt');
    if (!fs.existsSync(this.hintsFile)) fs.writeFileSync(this.hintsFile, DEFAULT_HINTS.join('\n') + '\n', 'utf8');
    this.settings = settings; this.log = log;
    this.worker = null; this.pending = new Map(); this.seq = 0;
    this.py = pythonExe();
    // available: null = 아직 확인 전, true = 쓸 수 있음, false = 파이썬/faster-whisper 없음(reason 에 사유·설치 안내)
    this.state = { ready: false, loading: false, device: null, model: null, error: null, restarts: 0, pid: null, available: null, reason: null, python: this.py };
  }
  cfg() { return { ...DEFAULTS, ...(this.settings.get().voice || {}) }; }
  status() { return { ...this.state, model: this.state.model || this.cfg().model, preload: this.cfg().preload }; }

  // ---- 사용 가능 여부(파이썬 + faster-whisper) — 데몬 시작 때 한 번, 워커를 띄우지 않고 가볍게 확인 ----
  probe() {
    if (this.probing) return this.probing;
    this.probing = new Promise((resolve) => {
      const fail = (reason) => { this.state.available = false; this.state.reason = reason; this.log(`voice: unavailable — ${reason}`); resolve(false); };
      if (!this.py) return fail('파이썬 3을 찾지 못했습니다. 설치 뒤 IRIS_FACE_PYTHON 환경변수로 경로를 알려 주거나 PATH 에 두면 🎤 음성 입력이 켜집니다.');
      let out = '', done = false;
      const child = spawn(this.py, ['-c', 'import faster_whisper; print(faster_whisper.__version__)'], { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
      const timer = setTimeout(() => { if (done) return; done = true; try { child.kill(); } catch {} fail('faster-whisper 확인이 20초 안에 끝나지 않았습니다(파이썬 환경이 느리거나 깨짐).'); }, PROBE_TIMEOUT);
      child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
      child.on('error', (e) => { if (done) return; done = true; clearTimeout(timer); fail(`파이썬 실행 실패: ${e.message}`); });
      child.on('close', (code) => {
        if (done) return; done = true; clearTimeout(timer);
        if (code === 0) { this.state.available = true; this.state.reason = null; this.log(`voice: available python=${this.py} faster-whisper=${out.trim().split('\n').pop()}`); return resolve(true); }
        fail(`faster-whisper 가 설치돼 있지 않습니다(${this.py}). 터미널에서 "${this.py}" -m pip install faster-whisper 로 설치하면 🎤 음성 입력이 켜집니다.`);
      });
    });
    return this.probing;
  }

  // ---- 워커 수명 ----
  ensureWorker() {
    if (this.worker && this.worker.exitCode === null && !this.worker.killed) return this.worker;
    if (this.state.restarts >= MAX_RESTARTS) throw new Error(`음성 엔진이 ${MAX_RESTARTS}번 연속 실패해 멈췄습니다 — ⏻ 전부 종료 후 다시 실행해 주세요 (${this.state.error || ''})`);
    if (this.state.available === false) throw new Error(this.state.reason || '음성 입력을 쓸 수 없는 환경입니다');
    if (!this.py || !fs.existsSync(this.py)) throw new Error(`파이썬을 찾을 수 없습니다: ${this.py || '(IRIS_FACE_PYTHON 미설정)'}`);
    const PY = this.py;
    const w = spawn(PY, [path.join(HERE, 'whisper_worker.py')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
    this.worker = w; this.state = { ...this.state, ready: false, loading: false, pid: w.pid, error: null };
    this.log(`voice: worker start pid=${w.pid}`);
    let buf = '';
    w.stdout.on('data', (d) => {
      buf += d.toString('utf8'); let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) this.onLine(line); }
    });
    w.stderr.on('data', (d) => { const s = d.toString('utf8').trim(); if (s && !/^\s*(\d+%|\|)/.test(s)) this.log(`voice:err ${s.slice(0, 300)}`); });
    w.on('exit', (code) => {
      this.log(`voice: worker exit code=${code}`);
      const clean = code === 0; if (!clean) this.state.restarts += 1;
      this.state = { ...this.state, ready: false, loading: false, pid: null, error: this.state.error || (clean ? null : `worker exit ${code}`) };
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(this.state.error || `음성 엔진이 종료됐습니다(code ${code})`)); }
      this.pending.clear();
      if (this.worker === w) this.worker = null;
    });
    return w;
  }
  onLine(line) {
    let m; try { m = JSON.parse(line); } catch { this.log(`voice:out ${line.slice(0, 200)}`); return; }
    if (m.event === 'ready') { this.log(`voice: worker ready pid=${m.pid}`); return; }
    if (m.event === 'loading') { this.state.loading = true; this.state.model = m.model; return; }
    if (m.event === 'loaded') { this.state = { ...this.state, ready: true, loading: false, device: m.device, model: m.model, restarts: 0, error: null }; this.log(`voice: model ${m.model} loaded on ${m.device} in ${m.secs}s`); return; }
    if (m.event === 'log') { this.log(`voice: ${m.text}`); return; }
    if (m.event === 'fatal') { this.state.error = m.error; this.state.restarts = MAX_RESTARTS; this.log(`voice: fatal ${m.error}`); return; }
    const p = this.pending.get(m.id); if (!p) return;
    this.pending.delete(m.id); clearTimeout(p.timer);
    m.error ? p.reject(new Error(m.error)) : p.resolve(m);
  }
  request(obj) {
    const w = this.ensureWorker(); const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('전사 시간 초과(5분)')); }, REQUEST_TIMEOUT);
      this.pending.set(id, { resolve, reject, timer });
      const c = this.cfg(); w.stdin.write(JSON.stringify({ id, model: c.model, device: c.device, ...obj }) + '\n');
    });
  }
  /** 데몬 시작 때 모델을 미리 올린다(설정 preload). 실패해도 데몬은 계속(기록만). */
  preload() {
    // 먼저 쓸 수 있는 환경인지 확인(파이썬·faster-whisper). 못 쓰면 워커를 띄우지 않고 조용히 끝난다 — 화면은 /api/voice/status 의 available 로 🎤 안내만.
    return this.probe().then((ok) => {
      if (!ok || !this.cfg().preload) return;
      return this.request({ cmd: 'load' }).then((r) => this.log(`voice: preload ok ${r.model} ${r.device}`)).catch((e) => this.log(`voice: preload failed ${e.message}`));
    });
  }
  stop() {
    const w = this.worker; if (!w || w.exitCode !== null) return;
    try { w.stdin.end(); } catch {}
    setTimeout(() => { try { if (w.exitCode === null) process.kill(w.pid); } catch {} }, 1500);   // 이 PID 하나만
    this.log(`voice: worker stop pid=${w.pid}`);
  }

  // ---- 힌트 ----
  hints(extra) {
    let words = [];
    try { words = fs.readFileSync(this.hintsFile, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')); } catch {}
    for (const e of extra || []) if (e && !words.includes(e)) words.unshift(e);
    // 위스퍼는 힌트의 문체도 따라가므로 마침표로 끝나는 짧은 나열 한 줄로. 224토큰 한도 → 넉넉히 300자 안쪽.
    let s = ''; for (const wd of words) { if ((s + wd).length > 300) break; s += (s ? ', ' : '') + wd; }
    return s ? s + '.' : '';
  }

  // ---- 전사 ----
  saveAudio(buf, ext) {
    const file = path.join(this.dir, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${(ext || 'webm').replace(/[^a-z0-9]/gi, '') || 'webm'}`);
    fs.writeFileSync(file, buf); return file;
  }
  async transcribe(file, { folderHint } = {}) {
    if (!fs.existsSync(file)) throw new Error(`녹음 파일이 없습니다: ${file}`);
    const t = Date.now();
    const r = await this.request({ cmd: 'transcribe', file, language: 'ko', prompt: this.hints(folderHint ? [folderHint] : []) });
    const out = { text: r.text || '', secs: r.secs, wall: (Date.now() - t) / 1000, device: r.device, model: r.model, audioSecs: r.audio_secs, file };
    try { fs.unlinkSync(file); out.file = null; } catch {}
    return out;
  }
  /** 남은 실패 녹음 정리(7일 지난 것) */
  sweep() { try { const cut = Date.now() - 7 * 86400e3; for (const f of fs.readdirSync(this.dir)) { const p = path.join(this.dir, f); if (fs.statSync(p).mtimeMs < cut) fs.unlinkSync(p); } } catch {} }
}
