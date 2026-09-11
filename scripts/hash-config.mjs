// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 무접촉 검증: Face 사용 전후 전역 설정 파일 해시가 같은지. 사용: node scripts/hash-config.mjs [--save <이름>] [--compare <이름>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
  'C:\\IRIS\\_agent\\claude\\settings.json',
  'C:\\IRIS\\.claude\\settings.json',
  'C:\\IRIS\\.claude\\settings.local.json',
  'C:\\IRIS\\_agent\\codex\\config.toml',
  'C:\\IRIS\\_agent\\codex\\hooks.json',
  'C:\\IRIS\\_agent\\launchers',
];
function hashPath(p) {
  if (!fs.existsSync(p)) return 'missing';
  const st = fs.statSync(p);
  if (st.isDirectory()) { const h = crypto.createHash('sha256'); for (const f of fs.readdirSync(p).sort()) { const fp = path.join(p, f); if (fs.statSync(fp).isFile()) h.update(f).update(fs.readFileSync(fp)); } return h.digest('hex').slice(0, 16); }
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
}
const snap = Object.fromEntries(TARGETS.map(t => [t, hashPath(t)]));
const args = process.argv.slice(2);
const dir = path.join(ROOT, 'state', 'hashes'); fs.mkdirSync(dir, { recursive: true });
if (args[0] === '--save') { fs.writeFileSync(path.join(dir, `${args[1] || 'snap'}.json`), JSON.stringify(snap, null, 2)); console.log('saved', args[1] || 'snap'); }
else if (args[0] === '--compare') {
  const prev = JSON.parse(fs.readFileSync(path.join(dir, `${args[1]}.json`), 'utf8')); let ok = true;
  for (const t of TARGETS) { const same = prev[t] === snap[t]; ok &&= same; console.log(`${same ? 'SAME   ' : 'CHANGED'} ${t}  ${prev[t]} → ${snap[t]}`); }
  console.log(ok ? '\n무접촉 검증 통과: 전부 동일' : '\n⚠ 변경된 파일이 있습니다'); process.exit(ok ? 0 : 1);
} else for (const t of TARGETS) console.log(snap[t].padEnd(8), t);
