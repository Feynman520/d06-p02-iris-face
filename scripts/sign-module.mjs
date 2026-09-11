// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 모듈 폴더 → manifest.json + manifest.sig + zip. 운영자 전용(개인 열쇠 필요). 사용:
//   node scripts/sign-module.mjs <모듈 폴더> --key <개인열쇠.pem> --out <출력.zip> [--source <커밋해시>]
//   --key 없이 실행하면 서명 없이(비공식) zip 만 만든다(시험용).
import fs from 'node:fs';
import path from 'node:path';
import { zipWrite } from '../daemon/zip.mjs';
import { buildManifest, signManifest } from '../daemon/modsign.mjs';

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--'));
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
if (!dir) { console.error('usage: node scripts/sign-module.mjs <dir> --out <zip> [--key <pem>] [--source <hash>]'); process.exit(2); }
const out = opt('--out') || path.join(process.cwd(), `${path.basename(dir)}.zip`);
const SKIP = new Set(['state', 'node_modules', '.git', 'manifest.json', 'manifest.sig', '.official']);
function walk(base, rel = '') {
  const list = [];
  for (const f of fs.readdirSync(path.join(base, rel)).sort()) {
    if (SKIP.has(f)) continue;
    const r = rel ? `${rel}/${f}` : f; const p = path.join(base, r);
    if (fs.statSync(p).isDirectory()) list.push(...walk(base, r)); else list.push({ name: r, data: fs.readFileSync(p) });
  }
  return list;
}
const files = walk(dir);
if (!files.some(f => f.name === 'module.json')) { console.error('module.json missing'); process.exit(2); }
const manifest = buildManifest(files, opt('--source') ? { source: opt('--source') } : {});
const text = JSON.stringify(manifest, null, 2);
files.push({ name: 'manifest.json', data: Buffer.from(text, 'utf8') });
const key = opt('--key');
if (key) files.push({ name: 'manifest.sig', data: Buffer.from(signManifest(text, fs.readFileSync(key, 'utf8')) + '\n', 'utf8') });
fs.writeFileSync(out, zipWrite(files));
console.log(`${out}  files=${files.length}  signed=${!!key}`);
