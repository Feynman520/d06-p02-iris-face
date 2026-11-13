// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 모듈 카탈로그(v2.53, 2026-09-13): 공식 IRIS 모듈 목록(daemon/catalog.json)을 설치 여부와 합쳐 화면에 주고,
// 사용자가 「설치」를 누른 그때만 GitHub 릴리스에서 zip 을 내려받아 같은 설치 길(modinstall.installZip, 서명 필수)로 넣는다.
// 바깥 연결은 이 한 번뿐이며 허용 호스트(GitHub) 밖으로는 나가지 않는다. 카탈로그 파일이 없거나 깨져도 데몬은 죽지 않는다(빈 목록).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME_RE } from './modules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOG_FILE = process.env.IRIS_FACE_CATALOG || path.join(ROOT, 'daemon', 'catalog.json');
// 미러(2026-09-14): 일부 네트워크가 GitHub 릴리스 첨부 서버만 끊는다. 릴리스 도구가 같은 첨부를 Cloudflare R2 공개 버킷에도 올리므로,
// GitHub 첨부 내려받기가 실패하면 <MIRROR_BASE>/<첨부 이름> 을 한 번 더 시도한다. sha256·서명 검사는 어느 쪽에서 받았든 똑같이 거친다.
// 2026-11-09: 미러 1순위를 같은 버킷의 빠른 창구(Cloudflare Pages, P02 mirror-worker)로 바꿨다 — 학교 유선 실측 r2.dev 초당 60~80KB(미국 LA)
// vs pages.dev 초당 30~43MB(서울). r2.dev 는 미러의 latest.json 이 적은 주소(옛 창 호환)라 허용 목록에 남기고, 그 주소는 fastMirror() 로 빠른 창구에 돌린다.
export const MIRROR_BASE = 'https://iris-workspace-dl.pages.dev';
export const LEGACY_MIRROR_BASE = 'https://pub-6bb549660d7d4bd79ed07a7b6523f5c5.r2.dev';
export const ALLOWED_HOSTS = ['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', new URL(MIRROR_BASE).hostname, new URL(LEGACY_MIRROR_BASE).hostname];
export const mirrorUrl = (assetName) => `${MIRROR_BASE}/${encodeURIComponent(String(assetName))}`;
/** 옛 r2.dev 미러 주소면 같은 경로의 빠른 창구 주소로, 아니면 그대로. 내용 검사(sha256·서명)는 어느 주소든 같다. */
export const fastMirror = (url) => { const s = String(url ?? ''); return s.startsWith(`${LEGACY_MIRROR_BASE}/`) ? MIRROR_BASE + s.slice(LEGACY_MIRROR_BASE.length) : s; };
export const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_HOPS = 5;

/** catalog.json → 항목 배열. 이름 규칙에 맞고 release.api 가 허용 호스트인 항목만. 파일이 없거나 깨지면 []. */
export function loadCatalog(file = CATALOG_FILE) {
  let parsed; try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
  const list = Array.isArray(parsed?.modules) ? parsed.modules : [];
  return list.filter(c => c && NAME_RE.test(String(c.name || '')) && hostOk(String(c.release?.api || ''))).map(c => {
    const asset = String(c.release.asset || '\\.zip$');
    return {
      name: String(c.name), label: String(c.label || c.name), icon: String(c.icon || 'plug'), desc: String(c.desc || ''), repo: String(c.repo || ''),
      recommended: c.recommended === true,
      release: { api: String(c.release.api), asset },
      fallback: cleanFallback(c.fallback, asset),
    };
  });
}

// v2.106(2026-11-13): 메신저가 설치 패키지에서 빠져 "설정에서 설치"가 유일한 입구가 됐다. GitHub 에 최신 판을 묻는 길(api.github.com)이
// 막힌 망에서도 설치되도록, 그 물음이 실패했을 때만 쓰는 마지막 확인 판을 카탈로그에 적어 둔다 — 미러(<MIRROR_BASE>/<asset>)에서 받고,
// 서명 검사는 어느 길로 받았든 같은 설치 길(modinstall.installZip)이 한다. 모양이 조금이라도 어긋나면 없는 것으로 본다(null).
const FALLBACK_ASSET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.zip$/;
function cleanFallback(fb, assetPattern) {
  if (!fb || typeof fb !== 'object') return null;
  const version = String(fb.version || ''); const asset = String(fb.asset || '');
  if (!/^\d+\.\d+\.\d+$/.test(version) || !FALLBACK_ASSET_RE.test(asset)) return null;
  let re; try { re = new RegExp(assetPattern); } catch { return null; }
  return re.test(asset) ? { version, asset } : null;
}

/** 카탈로그 + 설치된 모듈(ModuleHost.list()) → 화면용 목록. 카탈로그 순서 뒤에 카탈로그에 없는 설치 모듈. 설치된 것은 module.json 의 label·icon 이 우선.
 *  v2.56: 헤더 버튼도 이 목록을 쓰므로 설치된 행에는 콘센트 상태(panel·badge·pid)까지 싣는다. 미설치 행은 installed:false 에 panel·badge·status 가 없다. */
export function mergeCatalog(catalog, installed) {
  const byName = new Map((installed || []).map(m => [m.name, m]));
  const live = (m) => ({ version: m.version, status: m.status, reason: m.reason, official: m.official, panel: m.panel ?? null, badge: m.badge || 0, pid: m.pid ?? null });
  const rows = catalog.map(c => {
    const m = byName.get(c.name);
    const row = { name: c.name, label: m ? m.label : c.label, icon: m ? m.icon : c.icon, desc: c.desc, repo: c.repo, catalog: true, recommended: c.recommended === true, installed: !!m };
    if (m) Object.assign(row, live(m));
    return row;
  });
  for (const m of installed || []) if (!catalog.some(c => c.name === m.name)) rows.push({ name: m.name, label: m.label, icon: m.icon, desc: '', repo: '', catalog: false, installed: true, ...live(m) });
  return rows;
}

function hostOk(url) { try { const u = new URL(url); return u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.hostname); } catch { return false; } }
function assertHost(url) { if (!hostOk(url)) throw new Error(`address not allowed: ${String(url).slice(0, 120)}`); }

/** 리다이렉트를 손으로 따라가며(홉마다 호스트 검사) 본문을 받는다. 선언·실제 크기 둘 다 maxBytes 를 넘으면 중단. */
async function download(url, { fetchImpl, maxBytes, headers }) {
  let cur = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    assertHost(cur);
    const r = await fetchImpl(cur, { redirect: 'manual', headers });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get('location'); if (!loc) throw new Error(`redirect without location (HTTP ${r.status})`);
      cur = new URL(loc, cur).toString(); continue;
    }
    if (!r.ok) throw new Error(`download failed: HTTP ${r.status}`);
    const declared = Number(r.headers.get('content-length') || 0); if (declared > maxBytes) throw new Error(`too large (${declared}B > ${maxBytes}B)`);
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > maxBytes) throw new Error(`too large (${buf.length}B > ${maxBytes}B)`);
    return buf;
  }
  throw new Error('too many redirects');
}

/** 카탈로그 항목 → 최신 릴리스의 zip. { version, asset, url, buf }. fetchImpl 은 검사에서 가짜로 바꾼다. */
export async function fetchReleaseZip(entry, { fetchImpl = globalThis.fetch, maxBytes = MAX_ZIP_BYTES } = {}) {
  if (!entry?.release?.api) throw new Error('catalog entry has no release');
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'IRIS-Face' };
  assertHost(entry.release.api);
  let rel = null; let apiErr = null;
  try {
    const r = await fetchImpl(entry.release.api, { redirect: 'manual', headers });
    if (!r.ok) throw new Error(`release lookup failed: HTTP ${r.status}`);
    rel = await r.json();
  } catch (e) { apiErr = e; }
  if (!rel) {
    // 최신 판을 묻지 못했다(망이 api.github.com 을 막음 · 횟수 제한 등). 카탈로그의 마지막 확인 판이 있으면 미러에서 그 판을 받는다.
    const fb = entry.fallback;
    if (!fb?.asset) throw apiErr;
    const fbBuf = await download(mirrorUrl(fb.asset), { fetchImpl, maxBytes, headers: { 'user-agent': 'IRIS-Face' } }).catch(() => { throw apiErr; }); // 미러도 안 되면 원래 오류
    return { version: String(fb.version), asset: String(fb.asset), url: mirrorUrl(fb.asset), buf: fbBuf, viaFallback: true };
  }
  let re; try { re = new RegExp(entry.release.asset); } catch { re = /\.zip$/; }
  const asset = (Array.isArray(rel?.assets) ? rel.assets : []).find(a => re.test(String(a?.name || '')) && typeof a?.browser_download_url === 'string');
  if (!asset) throw new Error('release has no matching zip');
  if (Number(asset.size) > maxBytes) throw new Error(`too large (${asset.size}B > ${maxBytes}B)`);
  let buf;
  try { buf = await download(asset.browser_download_url, { fetchImpl, maxBytes, headers: { 'user-agent': 'IRIS-Face' } }); }
  catch (e) { buf = await download(mirrorUrl(asset.name), { fetchImpl, maxBytes, headers: { 'user-agent': 'IRIS-Face' } }).catch(() => { throw e; }); } // 미러도 안 되면 원래 오류
  const tag = String(rel.tag_name || ''); const version = (/v(\d+\.\d+\.\d+)$/.exec(tag) || [])[1] || tag;
  return { version, asset: String(asset.name), url: String(asset.browser_download_url), buf };
}
