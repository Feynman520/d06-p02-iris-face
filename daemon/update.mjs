// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 업데이트(설계 2·3·4절, 2026-09-14): 하루 한 번 릴리스 3곳(IRIS 창·메신저·구조판)을 읽어 설치된 판과 비교하고,
// 사용자가 설정의 「업데이트」를 누르면 필요한 첨부만 받아 sha256 + 서명을 검증한 뒤
//   · 메신저  = 이 자리에서 모듈로 설치(세션 무관)
//   · IRIS 창·구조판 = 받은 폴더에 풀고 plan.json 을 써서 바깥 적용기(_agent\shared\tools\updater\apply.mjs)에 넘긴다.
// **데몬은 자기 파일을 절대 바꾸지 않는다** — 폴더 교체는 데몬이 끝난 뒤 적용기가 한다(설계 9절).
// 바깥 연결은 두 가지뿐: enabled 일 때 하루 1회 확인, 사용자가 누른 내려받기(모듈 계약 v1 5절의 두 번째 예외).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { zipIndex, zipEntryData, zipRead } from './zip.mjs';
import { verifyManifest, OFFICIAL_PUBLIC_KEYS } from './modsign.mjs';
import { checkPaths, checkManifest } from './modinstall.mjs';
import { ALLOWED_HOSTS, loadCatalog, CATALOG_FILE } from './catalog.mjs';
import { soulRoot } from './paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FACE_ROOT = path.resolve(HERE, '..');
export const USER_AGENT = 'iris-face';
export const PART_NAMES = ['face', 'messenger', 'package'];   // 화면에 보이는 차례
export const APPLY_ORDER = ['package', 'face', 'messenger'];  // 적용 차례(설계 1절)
export const MESSENGER_MODULE = 'messenger';
const GH = (repo) => `https://api.github.com/repos/${repo}/releases/latest`;
/** 부품별 릴리스 원천(설계 1절). messenger 는 카탈로그(daemon/catalog.json)의 규칙을 그대로 쓴다. */
export const PART_SOURCE = {
  face: { api: GH('Feynman520/d06-p02-iris-face'), asset: '^iris-face-v.*\\.zip$' },
  package: { api: GH('Feynman520/d09-p03-iris-installer'), asset: '^IRIS-Setup_v.*\\.zip$' },
};
/** 부품별 내려받기 상한 — 구조판은 동봉 런타임까지 들어 있어 수백 MB 다. */
export const PART_LIMITS = {
  face: { maxBytes: 64 * 1024 * 1024, zip: { maxEntryBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024, maxEntries: 20000 } },
  messenger: { maxBytes: 50 * 1024 * 1024, zip: {} },
  package: { maxBytes: 600 * 1024 * 1024, zip: { maxEntryBytes: 512 * 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024 * 1024, maxEntries: 60000 } },
};
export const PART_LABEL = { face: 'IRIS 창', messenger: '메신저', package: '패키지' };
const REDIRECTS = [301, 302, 303, 307, 308];
const MAX_HOPS = 5;
const MAX_NOTES = 4000;
const FIRST_CHECK_MS = 30 * 1000;         // 데몬 시작 30초 뒤 1회
const EVERY_MS = 24 * 60 * 60 * 1000;     // 그 뒤 24시간마다
const RECHECK_MS = 5 * 60 * 1000;         // 적용 직전 확인 결과가 이보다 오래되면 다시 확인(설계 3절 1)
const SWEEP_MS = 7 * 24 * 60 * 60 * 1000; // 다 쓴 내려받기 폴더는 7일 뒤 치운다
export const DEV_REASON = '개발 폴더에서 실행 중 — git pull로 갱신';

// ---- 작은 도구 ----
export const versionFromTag = (tag) => (/--v(\d+\.\d+\.\d+)$/.exec(String(tag || '')) || /v?(\d+\.\d+\.\d+)$/.exec(String(tag || '')) || [])[1] || null;
/** semver(X.Y.Z) 비교: a > b 면 양수. 숫자 셋이 아니면 0(비교하지 않음). */
export function cmpSemver(a, b) {
  const pa = String(a || '').split('.').map(Number), pb = String(b || '').split('.').map(Number);
  if (pa.length !== 3 || pb.length !== 3 || [...pa, ...pb].some(n => !Number.isInteger(n))) return 0;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}
export const isNewer = (latest, installed) => !!latest && !!installed && cmpSemver(latest, installed) > 0;
/** `<64자리 hex>  <파일이름>` 또는 hex 한 줄 → 소문자 hex. 없으면 null. */
export const parseSha256File = (text) => (/\b([0-9a-fA-F]{64})\b/.exec(String(text || '')) || [])[1]?.toLowerCase() || null;
export const stamp = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const writeJsonAtomic = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8'); fs.renameSync(tmp, file); };
const hostOk = (url) => { try { const u = new URL(url); return u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.hostname); } catch { return false; } };
const assertHost = (url) => { if (!hostOk(url)) throw new Error(`address not allowed: ${String(url).slice(0, 120)}`); };

/** 이 Face 폴더가 설치 패키지가 놓아 준 자리(<root>\_agent\shared\tools\face)이고 영수증이 있으면 'package', 아니면 'dev'. */
export function detectMode({ root, faceRoot = FACE_ROOT, receipt } = {}) {
  const home = path.join(root, '_agent', 'shared', 'tools', 'face');
  const same = path.resolve(faceRoot).toLowerCase() === path.resolve(home).toLowerCase();
  return same && receipt ? 'package' : 'dev';
}

/** 설치된 판(설계 1절 마지막 열). 모르면 null = 업데이트 대상 아님. */
export function readInstalled({ root, mode, modulesDir, faceRoot = FACE_ROOT, receipt }) {
  const face = receipt?.installed?.face?.version
    || readJson(path.join(root, '_agent', 'shared', 'tools', 'face', 'package.json'))?.version
    || (mode === 'dev' ? readJson(path.join(faceRoot, 'package.json'))?.version : null)
    || null;
  const messenger = readJson(path.join(modulesDir, MESSENGER_MODULE, 'module.json'))?.version || null;
  const pkg = receipt?.package?.version || null;
  return { face: face || null, messenger: messenger ? String(messenger) : null, package: pkg ? String(pkg) : null };
}

/** IRIS 창 zip: 모듈 zip 과 같은 규칙(경로 탈출·중복·매니페스트 일치) + 서명 필수. module.json 은 요구하지 않는다. */
export function verifyFaceZip(buf, { keys = OFFICIAL_PUBLIC_KEYS, limits = PART_LIMITS.face.zip } = {}) {
  let files; try { files = zipRead(buf, { ...limits, strictLocal: true }); } catch (e) { return { ok: false, reason: e.message }; }
  const errors = checkPaths(files);
  const m = checkManifest(files, keys); errors.push(...m.errors);
  if (errors.length) return { ok: false, reason: errors.join('; ') };
  if (!m.official) return { ok: false, reason: m.revoked ? '폐기된 열쇠로 서명됨' : '공식 서명이 없습니다' };
  return { ok: true, files, keyId: m.keyId };
}

/** 설치 패키지 매니페스트의 자리 — P03 build.mjs 는 payload\manifest.json 에 쓴다(2026-09-14 실물 확인).
 *  옛 꾸러미를 위해 zip 루트도 뒤로 본다. 먼저 찾은 하나의 텍스트에 대해 서명을 검증한다. */
export const PACKAGE_MANIFEST_PATHS = ['payload/manifest.json', 'manifest.json'];
/** 설치 패키지 zip 은 항목 이름을 `./payload/…` 처럼 `./` 로 시작해 적는다(v1.3.0 실물 확인).
 *  `./x` 와 `x` 는 같은 자리라 경로 탈출이 아니므로 맨 앞 `./` 하나만 떼고 검사·해제한다.
 *  모듈 zip 검사(modinstall)는 예전처럼 `.` 세그먼트를 거부한다 — 거긴 우리가 만든 zip 만 들어온다. */
const stripDot = (name) => name.replace(/^\.\//, '');
/** 구조판 zip: 항목 이름 검사 + zip 안 payload/manifest.json 텍스트를 릴리스 첨부 manifest.sig 로 검증(설계 3절 ⓒ).
 *  수백 MB 라 통째로 풀지 않고 중앙 디렉터리만 훑는다. */
export function verifyPackageZip(buf, sigText, { keys = OFFICIAL_PUBLIC_KEYS, limits = PART_LIMITS.package.zip } = {}) {
  let index; try { index = zipIndex(buf, { ...limits, strictLocal: true }); } catch (e) { return { ok: false, reason: e.message }; }
  const entries = index.filter(e => !e.name.endsWith('/')).map(e => ({ ...e, name: stripDot(e.name) }));
  const errors = checkPaths(entries);
  if (errors.length) return { ok: false, reason: errors.join('; ') };
  const man = PACKAGE_MANIFEST_PATHS.map(p => entries.find(e => e.name === p)).find(Boolean);
  if (!man) return { ok: false, reason: `manifest.json missing (${PACKAGE_MANIFEST_PATHS.join(' / ')})` };
  if (!String(sigText || '').trim()) return { ok: false, reason: 'manifest.sig 첨부가 없습니다' };
  let text; try { text = zipEntryData(buf, man).toString('utf8'); } catch (e) { return { ok: false, reason: e.message }; }
  const r = verifyManifest(text, sigText, keys);
  if (!r.ok || r.revoked) return { ok: false, reason: r.revoked ? '폐기된 열쇠로 서명됨' : '공식 서명이 없습니다' };
  return { ok: true, index: entries, keyId: r.keyId, manifest: man.name };
}

/** zip 항목을 폴더에 푼다(항목 하나씩 해제 — 큰 zip 도 메모리를 한 항목만 쓴다). 경로 탈출은 여기서도 막는다. */
export function extractTo(buf, entries, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const root = path.resolve(dest) + path.sep;
  for (const e of entries) {
    const p = path.resolve(dest, e.name); if (!p.startsWith(root)) throw new Error(`unsafe path: ${e.name}`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, e.data !== undefined ? e.data : zipEntryData(buf, e));
  }
  return dest;
}

export class Updater {
  constructor(opts = {}) {
    this.stateDir = opts.stateDir || path.join(FACE_ROOT, 'state');
    this.faceRoot = opts.faceRoot || FACE_ROOT;
    this.modulesDir = opts.modulesDir || path.join(this.faceRoot, 'modules');
    this.faceVersion = opts.faceVersion || readJson(path.join(this.faceRoot, 'package.json'))?.version || '0.0.0';
    this.root = opts.root || soulRoot();
    this.daemonPort = opts.daemonPort || 3458;
    this.keys = opts.keys || OFFICIAL_PUBLIC_KEYS;
    this.catalogFile = opts.catalogFile || CATALOG_FILE;
    this.fetchImpl = opts.fetchImpl || ((...a) => globalThis.fetch(...a));
    this.spawnImpl = opts.spawnImpl || spawn;
    this.installMessenger = opts.installMessenger || null;  // (buf) => { status, body } — 서버의 installFromBuffer
    this.now = opts.now || (() => Date.now());
    this.log = opts.log || (() => {});
    this.broadcast = opts.broadcast || (() => {});
    this.file = path.join(this.stateDir, 'update.json');
    this.state = readJson(this.file) || {};
    if (typeof this.state.enabled !== 'boolean') this.state.enabled = true;
    this.modeOverride = opts.mode || null;
    this.applying = null;
    this.timers = [];
  }

  // ---- 상태 ----
  persist() { try { writeJsonAtomic(this.file, this.state); } catch (e) { this.log(`update: state write failed ${e.message}`); } }
  receipt() { return readJson(path.join(this.root, '_agent', 'setup', 'package-receipt.json')); }
  get mode() { return this.modeOverride || detectMode({ root: this.root, faceRoot: this.faceRoot, receipt: this.receipt() }); }
  get enabled() { return this.state.enabled !== false; }
  installed() { return readInstalled({ root: this.root, mode: this.mode, modulesDir: this.modulesDir, faceRoot: this.faceRoot, receipt: this.receipt() }); }

  /** 부품별 릴리스 주소·첨부 규칙. messenger 는 카탈로그에서(없으면 null = 확인하지 않음). */
  sources() {
    const cat = loadCatalog(this.catalogFile).find(c => c.name === MESSENGER_MODULE);
    return { face: PART_SOURCE.face, messenger: cat ? { api: cat.release.api, asset: cat.release.asset } : null, package: PART_SOURCE.package };
  }

  /** 새 판이 있는 부품(화면 표시용). 구조판·IRIS 창 둘 다 새 판이면 표시는 둘 다 한다. */
  newParts() {
    const ins = this.installed(), latest = this.state.latest || {};
    return PART_NAMES.filter(n => isNewer(latest[n]?.version, ins[n]));
  }
  /** 실제로 받아 적용할 부품(설계 1절: 구조판이 있으면 그 안에 최신 IRIS 창이 들어 있으므로 face 는 건너뛴다). */
  applyParts() {
    const nw = new Set(this.newParts());
    if (nw.has('package')) nw.delete('face');
    return APPLY_ORDER.filter(n => nw.has(n));
  }
  /** 단추에 적을 대표 판 — IRIS 창이 있으면 그 판, 없으면 적용 차례의 첫 부품. */
  headline() { const nw = this.newParts(); const n = nw.includes('face') ? 'face' : nw[0]; return n ? { part: n, version: this.state.latest?.[n]?.version || null, more: nw.length - 1 } : null; }

  info() {
    return {
      mode: this.mode, enabled: this.enabled, lastCheck: this.state.lastCheck || null, checkError: this.state.checkError || null,
      installed: this.installed(), latest: this.state.latest || { face: null, messenger: null, package: null },
      available: this.newParts(), applyParts: this.applyParts(), headline: this.headline(),
      applying: this.applying || false, plan: this.state.plan || null, lastResult: this.state.lastResult || null,
    };
  }
  setEnabled(on) { this.state.enabled = !!on; this.persist(); this.log(`update: daily check ${this.state.enabled ? 'on' : 'off'}`); return this.info(); }

  // ---- 확인(하루 1회 + 즉시) ----
  async fetchLatest(src) {
    const rel = await this.json(src.api);
    const assets = Array.isArray(rel?.assets) ? rel.assets : [];
    let re; try { re = new RegExp(src.asset); } catch { re = /\.zip$/; }
    const zip = assets.find(a => re.test(String(a?.name || '')) && typeof a?.browser_download_url === 'string');
    if (!zip) throw new Error('release has no matching zip');
    const byName = (name) => assets.find(a => String(a?.name || '') === name)?.browser_download_url || null;
    return {
      version: versionFromTag(rel?.tag_name), tag: String(rel?.tag_name || ''), asset: String(zip.name),
      url: String(zip.browser_download_url), size: Number(zip.size) || 0,
      sha256Url: byName(`${zip.name}.sha256`), sigUrl: byName('manifest.sig'),
      publishedAt: rel?.published_at || null, notes: String(rel?.body || '').slice(0, MAX_NOTES),
    };
  }
  async check() {
    const src = this.sources(), latest = { ...(this.state.latest || {}) }, errors = [];
    for (const name of PART_NAMES) {
      const s = src[name];
      if (!s) { latest[name] = null; continue; }
      try { latest[name] = await this.fetchLatest(s); }
      catch (e) { errors.push(`${PART_LABEL[name]}: ${e.message}`); }
    }
    this.state.latest = latest;
    this.state.lastCheck = new Date(this.now()).toISOString();
    this.state.checkError = errors.length ? errors.join(' · ') : null;
    this.persist();
    const nw = this.newParts();
    this.log(`update check: ${PART_NAMES.map(n => `${n}=${latest[n]?.version || '?'}`).join(' ')} new=[${nw.join(',')}]${errors.length ? ` errors: ${errors.join(' · ')}` : ''}`);
    this.broadcast({ type: 'update', phase: 'checked', info: this.info() });
    return this.info();
  }
  /** 데몬 시작 30초 뒤 1회 + 24시간마다. IRIS_FACE_UPDATE_CHECK=0 이면 아예 돌지 않는다. */
  start() {
    if (process.env.IRIS_FACE_UPDATE_CHECK === '0') { this.log('update: daily check disabled by IRIS_FACE_UPDATE_CHECK=0'); return false; }
    const run = () => { if (!this.enabled) return; this.check().catch(e => this.log(`update check failed: ${e.message}`)); };
    const t1 = setTimeout(run, FIRST_CHECK_MS), t2 = setInterval(run, EVERY_MS);
    t1.unref?.(); t2.unref?.();
    this.timers.push(t1, t2);
    return true;
  }
  stop() { for (const t of this.timers) { clearTimeout(t); clearInterval(t); } this.timers = []; }

  // ---- 내려받기 ----
  async follow(url, headers) {
    let cur = url;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      assertHost(cur);
      const r = await this.fetchImpl(cur, { redirect: 'manual', headers: { 'user-agent': USER_AGENT, ...headers } });
      if (REDIRECTS.includes(r.status)) { const loc = r.headers.get('location'); if (!loc) throw new Error(`redirect without location (HTTP ${r.status})`); cur = new URL(loc, cur).toString(); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    }
    throw new Error('too many redirects');
  }
  async json(url) { const r = await this.follow(url, { accept: 'application/vnd.github+json' }); return await r.json(); }
  async text(url, maxBytes = 64 * 1024) {
    const r = await this.follow(url, { accept: 'application/octet-stream' });
    const declared = Number(r.headers.get('content-length') || 0); if (declared > maxBytes) throw new Error(`too large (${declared}B)`);
    const s = await r.text(); if (s.length > maxBytes) throw new Error(`too large (${s.length}B)`); return s;
  }
  /** 큰 첨부는 파일로 흘려 받으면서 sha256 을 함께 센다(메모리에 통째로 올리지 않는다). */
  async downloadTo(url, dest, { maxBytes, expectSize = 0, onProgress } = {}) {
    const r = await this.follow(url, { accept: 'application/octet-stream' });
    const declared = Number(r.headers.get('content-length') || expectSize || 0);
    if (declared > maxBytes) throw new Error(`too large (${declared}B > ${maxBytes}B)`);
    const total = declared || expectSize || 0;
    const hash = crypto.createHash('sha256'); let received = 0;
    const ws = fs.createWriteStream(dest);
    const put = (chunk) => {
      received += chunk.length; if (received > maxBytes) throw new Error(`too large (${received}B > ${maxBytes}B)`);
      hash.update(chunk); onProgress?.(received, total);
      return new Promise((res, rej) => { if (ws.write(chunk)) res(); else { ws.once('error', rej); ws.once('drain', res); } });
    };
    try {
      if (r.body?.getReader) { const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; await put(Buffer.from(value)); } }
      else await put(Buffer.from(await r.arrayBuffer()));
      await new Promise((res, rej) => ws.end((e) => (e ? rej(e) : res())));
    } catch (e) { try { ws.destroy(); } catch {} throw e; }
    return { bytes: received, sha256: hash.digest('hex') };
  }

  downloadsDir() { return this.mode === 'package' ? path.join(this.root, '_agent', 'shared', 'downloads') : path.join(this.stateDir, 'downloads'); }
  /** 다 쓴 내려받기 폴더(update-*)를 7일 뒤 치운다. 우리가 만든 이름만 본다. */
  sweep() {
    const base = this.downloadsDir(); let names = []; try { names = fs.readdirSync(base); } catch { return 0; }
    const keep = this.state.plan?.dir ? path.resolve(this.state.plan.dir) : null;
    let n = 0;
    for (const name of names) {
      if (!/^update-\d{8}-\d{6}$/.test(name)) continue;
      const dir = path.join(base, name); if (keep && path.resolve(dir) === keep) continue;
      try { if (this.now() - fs.statSync(dir).mtimeMs < SWEEP_MS) continue; fs.rmSync(dir, { recursive: true, force: true }); n++; } catch {}
    }
    if (n) this.log(`update: swept ${n} old download folder(s)`);
    return n;
  }

  // ---- 적용(설계 3절) ----
  /** 받기 + 검증 + (메신저는 바로 설치 / IRIS 창·구조판은 풀고 plan.json). 화면은 이 뒤에 확인 카드를 띄운다. */
  async apply() {
    if (this.applying) return { ok: false, reason: '이미 내려받는 중입니다.' };
    if (this.mode !== 'package') return { ok: false, reason: DEV_REASON };
    const age = this.state.lastCheck ? this.now() - Date.parse(this.state.lastCheck) : Infinity;
    if (!(age >= 0 && age < RECHECK_MS)) await this.check();
    const parts = this.applyParts();
    if (!parts.length) return { ok: false, reason: '새 판이 없습니다.' };
    const dir = path.join(this.downloadsDir(), `update-${stamp(this.now())}`);
    fs.mkdirSync(dir, { recursive: true });
    const items = [], installed = [];
    this.applying = { part: parts[0], index: 1, count: parts.length, received: 0, total: 0 };
    try {
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i], info = this.state.latest?.[name];
        if (!info?.url) throw new Error(`${PART_LABEL[name]}: 내려받을 주소가 없습니다`);
        const lim = PART_LIMITS[name];
        this.applying = { part: name, index: i + 1, count: parts.length, received: 0, total: info.size || 0 };
        const file = path.join(dir, info.asset);
        const got = await this.downloadTo(info.url, file, {
          maxBytes: lim.maxBytes, expectSize: info.size,
          onProgress: (received, total) => { this.applying = { part: name, index: i + 1, count: parts.length, received, total }; this.broadcast({ type: 'update', phase: 'download', part: name, received, total, index: i + 1, count: parts.length }); },
        });
        // ⓐ sha256 첨부와 대조
        if (!info.sha256Url) throw new Error(`${PART_LABEL[name]}: .sha256 첨부가 없습니다`);
        const want = parseSha256File(await this.text(info.sha256Url));
        if (!want) throw new Error(`${PART_LABEL[name]}: .sha256 첨부를 읽지 못했습니다`);
        if (want !== got.sha256) throw new Error(`${PART_LABEL[name]}: sha256 이 맞지 않습니다`);
        this.broadcast({ type: 'update', phase: 'verify', part: name, received: got.bytes, total: got.bytes });
        // ⓑ·ⓒ·ⓓ 서명·경로 검사 뒤 부품별 처리
        const buf = fs.readFileSync(file);
        if (name === 'messenger') {
          if (!this.installMessenger) throw new Error('메신저 설치 경로가 없습니다');
          const r = await this.installMessenger(buf);
          if (r.status !== 201) throw new Error(`메신저: ${r.body?.error || r.status}`);
          installed.push({ kind: 'messenger', version: info.version });
        } else if (name === 'face') {
          const v = verifyFaceZip(buf, { keys: this.keys });
          if (!v.ok) throw new Error(`IRIS 창: ${v.reason}`);
          extractTo(buf, v.files, path.join(dir, 'face'));
          items.push({ kind: 'face', dir: path.join(dir, 'face'), version: info.version });
        } else {
          if (!info.sigUrl) throw new Error('패키지: manifest.sig 첨부가 없습니다');
          const v = verifyPackageZip(buf, await this.text(info.sigUrl), { keys: this.keys });
          if (!v.ok) throw new Error(`패키지: ${v.reason}`);
          extractTo(buf, v.index, path.join(dir, 'package'));
          items.push({ kind: 'package', dir: path.join(dir, 'package'), version: info.version });
        }
      }
    } catch (e) {
      this.applying = null;
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      const reason = String(e.message || e);
      this.state.lastResult = { ok: false, reason, at: new Date(this.now()).toISOString() };
      this.persist(); this.log(`update apply failed: ${reason}`);
      this.broadcast({ type: 'update', phase: 'error', reason, info: this.info() });
      return { ok: false, reason };
    }
    this.applying = null;
    let plan = null;
    if (items.length) {
      const file = path.join(dir, 'plan.json');
      plan = { schema: 1, root: this.root, daemonPort: this.daemonPort, daemonPid: process.pid, createdAt: new Date(this.now()).toISOString(), items, relaunch: true };
      writeJsonAtomic(file, plan);
      this.state.plan = { file, dir, items, createdAt: plan.createdAt };
    } else this.state.plan = null;
    this.state.lastResult = { ok: true, at: new Date(this.now()).toISOString(), installed, planned: items.map(i => ({ kind: i.kind, version: i.version })) };
    this.persist();
    this.log(`update downloaded: installed=[${installed.map(i => i.kind).join(',')}] planned=[${items.map(i => i.kind).join(',')}] dir=${dir}`);
    this.broadcast({ type: 'update', phase: 'ready', info: this.info() });
    return { ok: true, installed, planned: items.map(i => ({ kind: i.kind, version: i.version })), plan: this.state.plan };
  }

  /** 동봉 Node(없으면 PATH 의 node)로 적용기를 분리 실행. 데몬은 응답 뒤 스스로 끝난다(서버가 shutdown). */
  nodeExe() { const bundled = path.join(this.root, '_agent', 'shared', 'tools', 'node', 'node.exe'); return fs.existsSync(bundled) ? bundled : 'node'; }
  updaterPath() { return path.join(this.root, '_agent', 'shared', 'tools', 'updater', 'apply.mjs'); }
  applyNow() {
    if (this.mode !== 'package') return { ok: false, reason: DEV_REASON };
    const plan = this.state.plan;
    if (!plan?.file || !fs.existsSync(plan.file)) return { ok: false, reason: '받아 둔 적용 계획이 없습니다. 먼저 내려받아 주세요.' };
    const apply = this.updaterPath();
    if (!fs.existsSync(apply)) return { ok: false, reason: '적용기가 아직 설치돼 있지 않습니다(설치 패키지 v1.3.0부터).' };
    // 「나중에」 뒤 데몬이 한 번 재시작됐을 수 있다 — 적용기가 기다릴 PID·포트는 지금 이 데몬의 것으로 다시 적는다.
    try { const p = readJson(plan.file); if (p) writeJsonAtomic(plan.file, { ...p, daemonPid: process.pid, daemonPort: this.daemonPort }); }
    catch (e) { return { ok: false, reason: `적용 계획을 고치지 못했습니다: ${e.message}` }; }
    let child;
    try { child = this.spawnImpl(this.nodeExe(), [apply, plan.file], { detached: true, stdio: 'ignore', windowsHide: true, cwd: path.dirname(apply) }); }
    catch (e) { return { ok: false, reason: `적용기를 실행하지 못했습니다: ${e.message}` }; }
    child?.unref?.();
    this.log(`update apply-now: updater pid=${child?.pid} plan=${plan.file}`);
    return { ok: true, pid: child?.pid ?? null, plan: plan.file };
  }

  /** 적용기가 남긴 결과가 지난번 본 것보다 새로우면 한 번만 돌려준다(화면 토스트용). 돌려준 뒤에는 본 것으로 기록. */
  consumeResult() {
    const r = readJson(path.join(this.root, '_agent', 'setup', 'update-result.json'));
    const at = Date.parse(r?.at || ''), seen = Date.parse(this.state.result?.at || '');
    if (!r || !at || (seen && at <= seen)) return null;
    this.state.result = { at: r.at };
    if (this.state.plan) { try { fs.rmSync(this.state.plan.dir, { recursive: true, force: true }); } catch {} this.state.plan = null; }
    this.persist();
    this.log(`update result: ok=${r.ok} items=${(r.items || []).map(i => `${i.kind}@${i.version}${i.ok ? '' : '(실패)'}`).join(',')}`);
    return r;
  }
}
