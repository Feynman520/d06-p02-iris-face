// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 모듈 zip 설치(설계 조각 8): 경로 탈출·지문·서명·계약을 검사한 뒤 modules\<이름>\ 에 푼다. 비공식(서명 없음/검증 실패)은 명시 동의가 있어야 설치.
import fs from 'node:fs';
import path from 'node:path';
import { zipRead } from './zip.mjs';
import { buildManifest, verifyManifest, OFFICIAL_PUBLIC_KEYS } from './modsign.mjs';
import { validateInfo, NAME_RE } from './modules.mjs';

const unsafe = (name) => /^([A-Za-z]:|[\\/])/.test(name) || name.split(/[\\/]/).some(s => s === '..' || s === '.' || s === '') || name.includes('\0');

export function inspectZip(buf, { faceVersion, keys = OFFICIAL_PUBLIC_KEYS } = {}) {
  const errors = [];
  let files; try { files = zipRead(buf); } catch (e) { return { name: null, info: null, files: [], errors: [e.message], manifestOk: false, official: false, keyId: null, revoked: false }; }
  for (const f of files) {
    if (unsafe(f.name)) errors.push(`unsafe path: ${f.name}`);
    if (f.name === '.official' || f.name === 'state' || f.name.startsWith('state/') || f.name.startsWith('state\\')) errors.push(`reserved path: ${f.name}`);
  }
  const mj = files.find(f => f.name === 'module.json'); let info = null;
  if (!mj) errors.push('module.json missing');
  else { try { info = JSON.parse(mj.data.toString('utf8')); } catch { errors.push('module.json invalid JSON'); } }
  if (info) {
    const v = validateInfo(info, faceVersion); if (!v.ok) errors.push(v.reason);
    const entry = String(info.entry || 'index.mjs'); if (!files.some(f => f.name === entry)) errors.push(`entry missing: ${entry}`);
  }
  const man = files.find(f => f.name === 'manifest.json'), sig = files.find(f => f.name === 'manifest.sig');
  let manifestOk = false, official = false, keyId = null, revoked = false;
  if (!man) errors.push('manifest.json missing');
  else {
    let parsed = null; try { parsed = JSON.parse(man.data.toString('utf8')); } catch { errors.push('manifest.json invalid JSON'); }
    if (parsed) {
      manifestOk = JSON.stringify(parsed.files || {}) === JSON.stringify(buildManifest(files).files);
      if (!manifestOk) errors.push('manifest mismatch (file tampered or missing)');
      if (sig && manifestOk) { const r = verifyManifest(man.data.toString('utf8'), sig.data.toString('utf8'), keys); official = r.ok && !r.revoked; keyId = r.keyId || null; revoked = !!r.revoked; }
    }
  }
  return { name: info?.name || null, info, files, errors, manifestOk, official, keyId, revoked };
}

export function installZip(buf, { modulesDir, faceVersion, allowUnofficial = false, keys = OFFICIAL_PUBLIC_KEYS }) {
  const r = inspectZip(buf, { faceVersion, keys });
  if (r.errors.length) throw new Error(r.errors.join('; '));
  if (!r.official && !allowUnofficial) { const e = new Error('unofficial module (no valid signature)'); e.code = 'UNOFFICIAL'; e.inspect = { name: r.name, version: r.info?.version, revoked: r.revoked }; throw e; }
  const dest = path.join(modulesDir, r.name), tmp = dest + '.installing';
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  try {
    const root = path.resolve(tmp) + path.sep;
    for (const f of r.files) {
      const p = path.resolve(tmp, f.name); if (!p.startsWith(root)) throw new Error(`unsafe path: ${f.name}`);
      fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.data);
    }
    if (r.official) fs.writeFileSync(path.join(tmp, '.official'), JSON.stringify({ keyId: r.keyId, at: new Date().toISOString() }), 'utf8');
    const oldState = path.join(dest, 'state'); if (fs.existsSync(oldState)) fs.renameSync(oldState, path.join(tmp, 'state'));
    const old = dest + '.old'; fs.rmSync(old, { recursive: true, force: true }); if (fs.existsSync(dest)) fs.renameSync(dest, old); fs.renameSync(tmp, dest); fs.rmSync(old, { recursive: true, force: true });
  } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
  return { name: r.name, version: String(r.info?.version || '?'), official: r.official };
}

export function removeModule(modulesDir, name) {
  if (!NAME_RE.test(String(name))) throw new Error(`bad module name: ${name}`);
  fs.rmSync(path.join(modulesDir, name), { recursive: true, force: true });
}
