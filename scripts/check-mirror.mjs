// 미러 주소 검사(2026-11-09) — 업데이트기의 미러 1순위가 빠른 창구(pages.dev)이고, 옛 r2.dev 주소는
// 허용 목록에 남되 latest.json 에서 읽은 r2.dev 주소는 빠른 창구로 돌려지는지. 네트워크·데몬 접촉 0.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIRROR_BASE, LEGACY_MIRROR_BASE, ALLOWED_HOSTS, mirrorUrl, fastMirror } from '../daemon/catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

ok(MIRROR_BASE === 'https://iris-workspace-dl.pages.dev', '미러 1순위 = 빠른 창구(pages.dev)');
ok(mirrorUrl('IRIS-Setup_v2.0.54_2026-11-04.zip') === `${MIRROR_BASE}/IRIS-Setup_v2.0.54_2026-11-04.zip`, 'mirrorUrl 은 빠른 창구 주소를 만든다');
ok(mirrorUrl('a b.zip') === `${MIRROR_BASE}/a%20b.zip`, 'mirrorUrl 은 이름을 인코딩한다');
ok(ALLOWED_HOSTS.includes(new URL(MIRROR_BASE).hostname), '허용 목록에 빠른 창구');
ok(ALLOWED_HOSTS.includes(new URL(LEGACY_MIRROR_BASE).hostname), '허용 목록에 옛 r2.dev(옛 latest.json 호환)');
ok(fastMirror(`${LEGACY_MIRROR_BASE}/iris-face-v2.98.0.zip`) === `${MIRROR_BASE}/iris-face-v2.98.0.zip`, 'fastMirror: r2.dev → 빠른 창구');
ok(fastMirror(`${LEGACY_MIRROR_BASE}/x.zip.sha256.sig`) === `${MIRROR_BASE}/x.zip.sha256.sig`, 'fastMirror: 서명 주소도');
const gh = 'https://github.com/o/r/releases/download/t/x.zip';
ok(fastMirror(gh) === gh, 'fastMirror: GitHub 주소는 그대로');
ok(fastMirror(`${LEGACY_MIRROR_BASE}.evil.example/x.zip`) === `${LEGACY_MIRROR_BASE}.evil.example/x.zip`, 'fastMirror: 비슷한 다른 호스트는 바꾸지 않는다');
ok(fastMirror(undefined) === '', 'fastMirror: 빈 값은 빈 문자열');
const upd = fs.readFileSync(path.join(ROOT, 'daemon', 'update.mjs'), 'utf8');
ok(/url:\s*fastMirror\(m\.url\)/.test(upd) && /sha256Url:\s*fastMirror\(/.test(upd) && /sigUrl:\s*fastMirror\(/.test(upd), 'update.mjs: latest.json 의 url·sha256Url·sigUrl 을 fastMirror 로 돌린다');

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
