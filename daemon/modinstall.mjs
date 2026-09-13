// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 모듈 zip 설치(설계 조각 8): 경로 탈출·지문·서명·계약을 검사한 뒤 modules\<이름>\ 에 푼다. 비공식(서명 없음/검증 실패)은 명시 동의가 있어야 설치.
import fs from 'node:fs';
import path from 'node:path';
import { zipRead } from './zip.mjs';
import { buildManifest, verifyManifest, OFFICIAL_PUBLIC_KEYS } from './modsign.mjs';
import { validateInfo, NAME_RE } from './modules.mjs';

const DEVICE_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
export const unsafe = (name) => /^([A-Za-z]:|[\\/])/.test(name) || name.split(/[\\/]/).some(s => s === '..' || s === '.' || s === '' || /[. ]$/.test(s) || s.includes(':') || DEVICE_RE.test(s)) || name.includes('\0');

/** 항목 이름 공통 검사(경로 탈출·중복) — 모듈 zip 과 IRIS 창·구조판 zip 이 같은 규칙을 쓴다(v2.58).
 *  files 는 { name } 만 있으면 되므로 zipIndex 항목으로도 부를 수 있다. */
export function checkPaths(files) {
  const errors = [], seen = new Set();
  for (const f of files) {
    if (unsafe(f.name)) errors.push(`unsafe path: ${f.name}`);
    const lower = f.name.toLowerCase(); if (seen.has(lower)) errors.push(`duplicate entry: ${f.name}`); else seen.add(lower);
  }
  return errors;
}

/** manifest.json 이 파일 목록의 지문과 맞는지 + manifest.sig 가 공식 열쇠로 검증되는지(모듈·IRIS 창 공용, v2.58).
 *  files = [{ name, data }]. 돌려주는 errors 는 호출자가 자기 오류 목록에 이어 붙인다. */
export function checkManifest(files, keys = OFFICIAL_PUBLIC_KEYS) {
  const errors = []; let manifestOk = false, official = false, keyId = null, revoked = false;
  const man = files.find(f => f.name === 'manifest.json'), sig = files.find(f => f.name === 'manifest.sig');
  if (!man) errors.push('manifest.json missing');
  else {
    let parsed = null; try { parsed = JSON.parse(man.data.toString('utf8')); } catch { errors.push('manifest.json invalid JSON'); }
    if (parsed) {
      manifestOk = JSON.stringify(parsed.files || {}) === JSON.stringify(buildManifest(files).files);
      if (!manifestOk) errors.push('manifest mismatch (file tampered or missing)');
      if (sig && manifestOk) { const r = verifyManifest(man.data.toString('utf8'), sig.data.toString('utf8'), keys); official = r.ok && !r.revoked; keyId = r.keyId || null; revoked = !!r.revoked; }
    }
  }
  return { errors, manifestOk, official, keyId, revoked };
}

export function inspectZip(buf, { faceVersion, keys = OFFICIAL_PUBLIC_KEYS } = {}) {
  const errors = [];
  let files; try { files = zipRead(buf); } catch (e) { return { name: null, info: null, files: [], errors: [e.message], manifestOk: false, official: false, keyId: null, revoked: false }; }
  errors.push(...checkPaths(files));
  for (const f of files) { const seg0 = f.name.split(/[\\/]/)[0].toLowerCase(); if (seg0 === '.official' || seg0 === 'state') errors.push(`reserved path: ${f.name}`); } // 모듈 전용 예약 이름
  const mj = files.find(f => f.name === 'module.json'); let info = null;
  if (!mj) errors.push('module.json missing');
  else { try { info = JSON.parse(mj.data.toString('utf8')); } catch { errors.push('module.json invalid JSON'); } }
  if (info) {
    const v = validateInfo(info, faceVersion); if (!v.ok) errors.push(v.reason);
    const entry = String(info.entry || 'index.mjs'); if (!files.some(f => f.name === entry)) errors.push(`entry missing: ${entry}`);
  }
  const m = checkManifest(files, keys); errors.push(...m.errors);
  const { manifestOk, official, keyId, revoked } = m;
  return { name: info?.name || null, info, files, errors, manifestOk, official, keyId, revoked };
}

export function installZip(buf, { modulesDir, faceVersion, allowUnofficial = false, keys = OFFICIAL_PUBLIC_KEYS }) {
  const r = inspectZip(buf, { faceVersion, keys });
  if (r.errors.length) throw new Error(r.errors.join('; '));
  if (!r.official && !allowUnofficial) { const e = new Error('unofficial module (no valid signature)'); e.code = 'UNOFFICIAL'; e.inspect = { name: r.name, version: r.info?.version, revoked: r.revoked }; throw e; }
  const dest = path.join(modulesDir, r.name), tmp = dest + '.installing';
  const RM = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }; // Windows EBUSY(파일 핸들 아직 닫히는 중) 관용(F9)
  fs.rmSync(tmp, RM); fs.mkdirSync(tmp, { recursive: true });
  try {
    const root = path.resolve(tmp) + path.sep;
    for (const f of r.files) {
      const p = path.resolve(tmp, f.name); if (!p.startsWith(root)) throw new Error(`unsafe path: ${f.name}`);
      fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.data);
    }
    fs.rmSync(path.join(tmp, '.official'), { force: true });
    if (r.official) fs.writeFileSync(path.join(tmp, '.official'), JSON.stringify({ keyId: r.keyId, at: new Date().toISOString() }), 'utf8');
    const oldState = path.join(dest, 'state'); if (fs.existsSync(oldState)) fs.renameSync(oldState, path.join(tmp, 'state'));
    const old = dest + '.old'; fs.rmSync(old, RM); if (fs.existsSync(dest)) fs.renameSync(dest, old); try { fs.renameSync(tmp, dest); } catch (e) { if (fs.existsSync(old)) fs.renameSync(old, dest); throw e; } fs.rmSync(old, RM);
  } catch (e) { fs.rmSync(tmp, RM); throw e; }
  return { name: r.name, version: String(r.info?.version || '?'), official: r.official };
}

export function removeModule(modulesDir, name) {
  if (!NAME_RE.test(String(name))) throw new Error(`bad module name: ${name}`);
  fs.rmSync(path.join(modulesDir, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
