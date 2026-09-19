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
import { zipRead, zipOpenFile, zipEntryDataFile } from './zip.mjs';
import { verifyManifest, OFFICIAL_PUBLIC_KEYS } from './modsign.mjs';
import { checkPaths, checkManifest } from './modinstall.mjs';
import { ALLOWED_HOSTS, loadCatalog, CATALOG_FILE, mirrorUrl } from './catalog.mjs';
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

// ---- 1.x → 2.0 은 자동 적용하지 않는다(P03 Task 21, 구현계획-v2 D2-24) ----
// 2.0 부터 설치 방식(구조·영수증 schema)이 통째로 바뀌어 부품만 갈아 끼울 수 없다. 그래서 구조판이 2.x 인데
// 이 영혼의 영수증이 1.x(schema<2 또는 영수증 없음)이면 **구조판 내려받기를 아예 하지 않고** 글과 홈페이지 링크만 보인다.
// IRIS 창·메신저 부품은 그대로 업데이트된다(그 둘은 판이 바뀌어도 자리가 같다).
export const REINSTALL_NOTE = '2.0은 설치 방식이 바뀌어 새로 설치합니다. 기존 자료는 그대로 두고 설치기를 실행하면 됩니다.';
export const REINSTALL_URL = 'https://iris-workspace.com/install.html';
export const RECEIPT_SCHEMA_V2 = 2;
/** 구조판 최신 판이 2.x 이상인데 영수증 schema 가 2 미만(또는 영수증 없음)이면 true. */
export function needsReinstall({ latestPackageVersion, receipt } = {}) {
  const major = Number(String(latestPackageVersion || '').split('.')[0]);
  if (!Number.isInteger(major) || major < 2) return false;
  const schema = Number(receipt?.schema);
  return !(Number.isInteger(schema) && schema >= RECEIPT_SCHEMA_V2);
}

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
/** 설치 패키지 zip 은 항목 이름을 `./payload/…` 처럼 `./` 로 시작해 적는다(v1.3.0 실물 확인).
 *  `./x` 와 `x` 는 같은 자리라 경로 탈출이 아니므로 맨 앞 `./` 하나만 떼고 검사·해제한다.
 *  모듈 zip 검사(modinstall)는 예전처럼 `.` 세그먼트를 거부한다 — 거긴 우리가 만든 zip 만 들어온다. */
const stripDot = (name) => name.replace(/^\.\//, '');

/** 구조판 무결성(2026-09-14 컨트롤러 판정으로 방식 교체).
 *  zip **안**의 매니페스트를 서명하는 방식은 폐기했다 — `installer\`·`IRIS-설치.cmd` 처럼 매니페스트 밖에 있는 파일을 덮지 못해 zip 전체를 보호하지 못했다.
 *  대신 릴리스 첨부 `<zip>.sha256` 텍스트가 ⓐ 내려받은 zip 의 실제 해시와 같고 ⓑ 그 텍스트 자체가 공식 열쇠로 서명(`<zip>.sha256.sig`)돼야 한다.
 *  해시는 받으면서 흐름 중에 세므로 **zip 을 메모리에 올리지 않고도 zip 전체 바이트가 서명으로 보호된다.** */
export function verifySignedSha256(shaText, sigB64, computedSha, { keys = OFFICIAL_PUBLIC_KEYS } = {}) {
  const want = parseSha256File(shaText);
  if (!want) return { ok: false, reason: '.sha256 첨부를 읽지 못했습니다' };
  if (want !== String(computedSha || '').toLowerCase()) return { ok: false, reason: 'sha256 이 맞지 않습니다' };
  if (!String(sigB64 || '').trim()) return { ok: false, reason: '.sha256.sig 첨부가 없습니다' };
  const r = verifyManifest(shaText, sigB64, keys);
  if (!r.ok || r.revoked) return { ok: false, reason: r.revoked ? '폐기된 열쇠로 서명됨' : '공식 서명이 없습니다' };
  return { ok: true, sha: want, keyId: r.keyId };
}

/** 큰 zip 을 통째로 메모리에 올리지 않고 파일에서 바로 푼다(항목 하나씩). 경로 탈출·중복은 여기서도 막고 맨 앞 `./` 는 뗀다. */
export function extractZipFile(file, dest, { limits = PART_LIMITS.package.zip } = {}) {
  const z = zipOpenFile(file, { ...limits, strictLocal: true });
  try {
    const entries = z.entries.filter(e => !e.name.endsWith('/')).map(e => ({ ...e, name: stripDot(e.name) }));
    const errors = checkPaths(entries);
    if (errors.length) throw new Error(errors.join('; '));
    fs.mkdirSync(dest, { recursive: true });
    const root = path.resolve(dest) + path.sep;
    for (const e of entries) {
      const p = path.resolve(dest, e.name); if (!p.startsWith(root)) throw new Error(`unsafe path: ${e.name}`);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, zipEntryDataFile(z.fd, e));
    }
    return entries.length;
  } finally { z.close(); }
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
  /** 1.x 영혼인데 구조판 최신 판이 2.x — 자동 적용 대신 "새로 설치" 안내만(Task 21). */
  get reinstall() { return needsReinstall({ latestPackageVersion: this.state.latest?.package?.version, receipt: this.receipt() }); }
  /** 그 안내에 화면이 쓸 값. 해당 없으면 null. */
  reinstallInfo() {
    if (!this.reinstall) return null;
    const p = this.state.latest?.package || null;
    return { note: REINSTALL_NOTE, url: REINSTALL_URL, version: p?.version || null, asset: p?.asset || null, download: p?.url || null };
  }
  /** 실제로 받아 적용할 부품(설계 1절: 구조판이 있으면 그 안에 최신 IRIS 창이 들어 있으므로 face 는 건너뛴다). */
  applyParts() {
    const nw = new Set(this.newParts());
    // 새로 설치가 필요한 판 차이면 구조판은 아예 빼고 IRIS 창·메신저만 간다(창을 빼는 규칙도 이때는 쓰지 않는다).
    if (this.reinstall) nw.delete('package');
    else if (nw.has('package')) nw.delete('face');
    return APPLY_ORDER.filter(n => nw.has(n));
  }
  /** 단추에 적을 대표 판 — IRIS 창이 있으면 그 판, 없으면 적용 차례의 첫 부품. 새로 설치 안내 중인 구조판은 단추에 올리지 않는다. */
  headline() {
    const re = this.reinstall;
    const nw = this.newParts().filter(n => !(re && n === 'package'));
    const n = nw.includes('face') ? 'face' : nw[0];
    return n ? { part: n, version: this.state.latest?.[n]?.version || null, more: nw.length - 1 } : null;
  }

  info() {
    return {
      mode: this.mode, enabled: this.enabled, lastCheck: this.state.lastCheck || null, checkError: this.state.checkError || null,
      installed: this.installed(), latest: this.state.latest || { face: null, messenger: null, package: null },
      available: this.newParts(), applyParts: this.applyParts(), headline: this.headline(),
      reinstall: this.reinstallInfo(),
      applying: this.applying || false, plan: this.state.plan || null, lastResult: this.state.lastResult || null,
    };
  }
  setEnabled(on) { this.state.enabled = !!on; this.persist(); this.log(`update: daily check ${this.state.enabled ? 'on' : 'off'}`); return this.info(); }

  // ---- 확인(하루 1회 + 즉시) ----
  async fetchLatest(src, name = null) {
    let rel, ghErr = null;
    try { rel = await this.json(src.api); }
    catch (e) { rel = null; ghErr = e; this.log?.(`update: ${name || src.api} github api failed (${String(e.message).slice(0, 80)}) → mirror latest.json`); }
    let assets = Array.isArray(rel?.assets) ? rel.assets : [];
    // GitHub API 가 403(익명 rate limit·망 차단 — 2026-09-19 데스크탑 실측 "update check … HTTP 403")이거나 첨부가 없으면
    // 미러의 latest.json(릴리스 도구·mirror-upload 가 부품별로 적음)에서 같은 모양을 만든다. 내려받기·sha256·서명도 미러 주소.
    if (!assets.length && name) {
      const latest = await this.json(mirrorUrl('latest.json')).catch(() => null);
      const m = latest && latest[name];
      if (m && m.version && m.asset && m.url) {
        this.log?.(`update: ${name} using mirror latest.json → ${m.version}`);
        return {
          version: String(m.version), tag: String(m.tag || ''), asset: String(m.asset), url: String(m.url), size: Number(m.size) || 0,
          sha256Url: m.sha256Url || mirrorUrl(`${m.asset}.sha256`), sigUrl: m.sigUrl || mirrorUrl(`${m.asset}.sha256.sig`),
          publishedAt: m.publishedAt || null, notes: '', viaMirror: true,
        };
      }
      if (!rel) throw new Error(`${ghErr?.message || 'github api unreachable'} (mirror latest.json has no ${name} entry either)`);
    }
    let re; try { re = new RegExp(src.asset); } catch { re = /\.zip$/; }
    const zip = assets.find(a => re.test(String(a?.name || '')) && typeof a?.browser_download_url === 'string');
    if (!zip) throw new Error('release has no matching zip');
    const byName = (name) => assets.find(a => String(a?.name || '') === name)?.browser_download_url || null;
    return {
      version: versionFromTag(rel?.tag_name), tag: String(rel?.tag_name || ''), asset: String(zip.name),
      url: String(zip.browser_download_url), size: Number(zip.size) || 0,
      sha256Url: byName(`${zip.name}.sha256`), sigUrl: byName(`${zip.name}.sha256.sig`),   // 구조판은 .sha256 텍스트에 대한 서명 첨부를 함께 올린다
      publishedAt: rel?.published_at || null, notes: String(rel?.body || '').slice(0, MAX_NOTES),
    };
  }
  async check() {
    const src = this.sources(), latest = { ...(this.state.latest || {}) }, errors = [];
    for (const name of PART_NAMES) {
      const s = src[name];
      if (!s) { latest[name] = null; continue; }
      try { latest[name] = await this.fetchLatest(s, name); }
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
  /** 부품 하나를 받아 검증하고 (메신저는 바로 설치 / IRIS 창·구조판은 풀어 둔다).
   *  실패는 throw 로 알린다 — 부르는 쪽(apply)이 **그 부품만** 접고 나머지는 계속한다.
   *  이 부품이 만든 자리는 전부 `mine` 에 적어 둔다: 실패했을 때 지울 것이 자기 것뿐이어야 하기 때문이다. */
  async applyPart(name, dir, index, count, mine) {
    const info = this.state.latest?.[name];
    if (!info?.url) throw new Error('내려받을 주소가 없습니다');
    const lim = PART_LIMITS[name];
    this.applying = { part: name, index, count, received: 0, total: info.size || 0 };
    const file = path.join(dir, info.asset);
    mine.push(file);
    const dlOpts = {
      maxBytes: lim.maxBytes, expectSize: info.size,
      onProgress: (received, total) => { this.applying = { part: name, index, count, received, total }; this.broadcast({ type: 'update', phase: 'download', part: name, received, total, index, count }); },
    };
    // 미러(2026-09-14): GitHub 첨부 서버가 막힌 네트워크에서는 같은 이름의 첨부를 R2 미러에서 받는다. 검증(sha256·서명)은 아래에서 똑같이 한다.
    let got;
    try { got = await this.downloadTo(info.url, file, dlOpts); }
    catch (e) { this.log?.(`update: ${name} github download failed (${String(e.message).slice(0, 80)}) → mirror`); try { fs.rmSync(file, { force: true }); } catch {} got = await this.downloadTo(mirrorUrl(info.asset), file, dlOpts).catch(() => { throw e; }); }
    // ⓐ 릴리스 첨부 .sha256 과 대조(해시는 받으면서 흐름 중에 셌다)
    if (!info.sha256Url) throw new Error('.sha256 첨부가 없습니다');
    const shaText = await this.text(info.sha256Url).catch((e) => this.text(mirrorUrl(`${info.asset}.sha256`)).catch(() => { throw e; }));
    if (name === 'package') {
      // ⓑ 구조판: .sha256 텍스트가 zip 해시와 같고 그 텍스트가 공식 서명(.sha256.sig)돼야 한다 → zip 전체가 보호된다.
      const sigText = info.sigUrl ? await this.text(info.sigUrl).catch((e) => this.text(mirrorUrl(`${info.asset}.sha256.sig`)).catch(() => { throw e; })) : '';
      const v = verifySignedSha256(shaText, sigText, got.sha256, { keys: this.keys });
      if (!v.ok) throw new Error(v.reason);
      this.broadcast({ type: 'update', phase: 'verify', part: name, received: got.bytes, total: got.bytes });
      // ⓓ 경로 탈출·중복은 푸는 자리에서. 수백 MB 라 파일에서 항목 하나씩 읽어 푼다(통째로 메모리에 올리지 않음).
      const out = path.join(dir, 'package'); mine.push(out);
      extractZipFile(file, out, { limits: PART_LIMITS.package.zip });
      return { item: { kind: 'package', dir: out, version: info.version }, version: info.version };
    }
    const want = parseSha256File(shaText);
    if (!want) throw new Error('.sha256 첨부를 읽지 못했습니다');
    if (want !== got.sha256) throw new Error('sha256 이 맞지 않습니다');
    this.broadcast({ type: 'update', phase: 'verify', part: name, received: got.bytes, total: got.bytes });
    const buf = fs.readFileSync(file);   // 메신저·IRIS 창 zip 은 수 MB
    if (name === 'messenger') {
      if (!this.installMessenger) throw new Error('메신저 설치 경로가 없습니다');
      const r = await this.installMessenger(buf);
      if (r.status !== 201) throw new Error(String(r.body?.error || r.status));
      return { installed: { kind: 'messenger', version: info.version }, version: info.version };
    }
    // ⓒ IRIS 창: zip 안 manifest.json+manifest.sig 가 모든 파일을 덮으므로 그대로 둔다(모듈 zip 과 같은 규칙).
    const v = verifyFaceZip(buf, { keys: this.keys });
    if (!v.ok) throw new Error(v.reason);
    const out = path.join(dir, 'face'); mine.push(out);
    extractTo(buf, v.files, out);
    return { item: { kind: 'face', dir: out, version: info.version }, version: info.version };
  }

  /** 받기 + 검증 + (메신저는 바로 설치 / IRIS 창·구조판은 풀고 plan.json). 화면은 이 뒤에 확인 카드를 띄운다.
   *
   *  **부품마다 따로 선다(2026-09-14 검토 2회차).** 예전에는 부품 하나가 걸리면 for 문 전체를 throw 로 빠져나와
   *  받은 폴더를 통째로 지웠다 — 메신저 릴리스에 `.sha256` 첨부 하나가 빠진 것만으로 IRIS 창·구조판 업데이트가
   *  영영 막혔고, 사용자는 고칠 방법이 없었다(남의 저장소라서). 지금은 부품 하나의 실패가 그 부품에서 끝난다:
   *  실패한 부품이 받아 둔 것만 지우고, 사유를 `lastResult.items` 에 부품별로 적고, 다음 부품으로 넘어간다.
   *  받은 폴더를 통째로 지우는 것은 **아무 부품도 성공하지 못했을 때**(따라서 plan.json 도 쓰지 않았을 때)뿐이다.
   *  검증 자체는 조금도 느슨해지지 않는다 — 서명·해시가 어긋난 부품은 전과 똑같이 적용되지 않는다. */
  async apply() {
    if (this.applying) return { ok: false, reason: '이미 내려받는 중입니다.' };
    if (this.mode !== 'package') return { ok: false, reason: DEV_REASON };
    const age = this.state.lastCheck ? this.now() - Date.parse(this.state.lastCheck) : Infinity;
    if (!(age >= 0 && age < RECHECK_MS)) await this.check();
    const parts = this.applyParts();
    // 구조판만 새 판인데 그것이 1.x→2.0 이면 받지 않는다 — 화면이 "새로 설치" 글과 홈페이지 링크를 대신 보인다.
    if (!parts.length) return this.reinstall ? { ok: false, reason: REINSTALL_NOTE, reinstall: this.reinstallInfo() } : { ok: false, reason: '새 판이 없습니다.' };
    const dir = path.join(this.downloadsDir(), `update-${stamp(this.now())}`);
    fs.mkdirSync(dir, { recursive: true });
    const items = [], installed = [], results = [];
    this.applying = { part: parts[0], index: 1, count: parts.length, received: 0, total: 0 };
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i], mine = [];
      try {
        const r = await this.applyPart(name, dir, i + 1, parts.length, mine);
        if (r.item) items.push(r.item);
        if (r.installed) installed.push(r.installed);
        results.push({ part: name, ok: true, version: r.version || null });
      } catch (e) {
        const reason = String(e?.message || e);
        for (const p of mine) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
        results.push({ part: name, ok: false, reason });
        this.log(`update apply: ${name} failed — ${reason}`);
      }
    }
    this.applying = null;
    const failed = results.filter(r => !r.ok);
    const at = new Date(this.now()).toISOString();
    if (items.length) {
      const file = path.join(dir, 'plan.json');
      const plan = { schema: 1, root: this.root, daemonPort: this.daemonPort, daemonPid: process.pid, createdAt: at, items, relaunch: true };
      writeJsonAtomic(file, plan);
      this.state.plan = { file, dir, items, createdAt: plan.createdAt };
    } else this.state.plan = null;
    // 성공한 것이 하나도 없으면 받은 폴더는 남길 이유가 없다(계획도 쓰지 않았다).
    if (!items.length && !installed.length) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
    // 부품 이름표는 요약 한 줄에만 붙인다 — 부품 행에는 이미 이름이 있으니 사유만 적는다.
    const reason = failed.length ? failed.map(f => `${PART_LABEL[f.part]}: ${f.reason}`).join(' · ') : null;
    const planned = items.map(i => ({ kind: i.kind, version: i.version }));
    this.state.lastResult = { ok: failed.length === 0, at, items: results, installed, planned, ...(reason ? { reason } : {}) };
    this.persist();
    this.log(`update downloaded: installed=[${installed.map(i => i.kind).join(',')}] planned=[${items.map(i => i.kind).join(',')}]${failed.length ? ` failed=[${failed.map(f => f.part).join(',')}]` : ''} dir=${dir}`);
    // 여기서의 ok = "무언가 적용되었는가" — 하나라도 되었으면 화면은 확인 카드까지 가야 한다.
    // 부품별 성패는 lastResult.items 가, 한 줄 요약은 lastResult.reason 이 들고 있다.
    const ok = items.length > 0 || installed.length > 0;
    this.broadcast({ type: 'update', phase: ok ? 'ready' : 'error', ...(reason ? { reason } : {}), info: this.info() });
    return { ok, ...(reason ? { reason } : {}), items: results, installed, planned, plan: this.state.plan };
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
    // 적용기는 `--plan <경로>` 한 가지만 받는다(P03 parseArgs) — 자리 인자로 주면 계획을 못 읽는다.
    try { child = this.spawnImpl(this.nodeExe(), [apply, '--plan', plan.file], { detached: true, stdio: 'ignore', windowsHide: true, cwd: path.dirname(apply) }); }
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
