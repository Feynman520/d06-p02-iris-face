// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 첨부 보관 정리(daemon/uploads.mjs) 무접촉 검사 — 임시 폴더만 쓰고 실제 state/uploads·데몬(3458)은 건드리지 않는다.
//   1) 30일 넘은 파일만 지우고 그 안의 파일·하위 폴더·폴더 안 파일은 남긴다 · 지운 수·바이트 · 폴더가 없어도 오류 없음
//   2) server.mjs 연결(정적): 시작 때 한 번 + 하루 한 번(unref) · 업로드 폴더 = state/uploads
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sweepUploads, UPLOAD_KEEP_DAYS } from '../daemon/uploads.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const DAY = 24 * 60 * 60 * 1000, now = Date.now();

// 1) 정리 규칙
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-uploads-'));
const put = (name, ageDays, body = 'x') => { const f = path.join(dir, name); fs.writeFileSync(f, body); const t = new Date(now - ageDays * DAY); fs.utimesSync(f, t, t); return f; };
const old1 = put('2026-09-01T00-00-00-paste-old.png', 40, 'a'.repeat(1000));
const old2 = put('2026-10-01T00-00-00-old.pdf', 31, 'b'.repeat(24));
const edge = put('2026-10-06T00-00-00-edge.txt', UPLOAD_KEEP_DAYS - 0.01);
const fresh = put('2026-11-04T00-00-00-camera.png', 1);
fs.mkdirSync(path.join(dir, 'sub')); const inner = path.join(dir, 'sub', 'old-inside.png'); fs.writeFileSync(inner, 'c'); const t = new Date(now - 90 * DAY); fs.utimesSync(inner, t, t);
const r = sweepUploads(dir, { now });
ok(UPLOAD_KEEP_DAYS === 30, '보관 날수 = 30일');
ok(!fs.existsSync(old1) && !fs.existsSync(old2), '30일 넘은 첨부 2개 지움');
ok(fs.existsSync(edge) && fs.existsSync(fresh), '30일이 안 된 첨부는 남김(경계 직전 포함)');
ok(fs.existsSync(inner) && fs.existsSync(path.join(dir, 'sub')), '하위 폴더와 그 안 파일은 건드리지 않음');
ok(r.removed === 2 && r.bytes === 1024 && r.kept === 2, `돌려주는 값 = 지운 2개·1024B·남긴 2개 (${JSON.stringify(r)})`);
ok(sweepUploads(dir, { now }).removed === 0, '두 번째 정리: 지울 것 없음');
ok(sweepUploads(dir, { now: now + 31 * DAY }).removed === 2, '한 달 뒤 정리: 남겨 둔 2개도 그때 지움');
const none = sweepUploads(path.join(dir, 'no-such-folder'), { now });
ok(none.removed === 0 && none.kept === 0, '첨부 폴더가 없으면 아무 일 없이 끝남');
fs.rmSync(dir, { recursive: true, force: true });

// 2) 데몬 연결
const server = fs.readFileSync(new URL('../daemon/server.mjs', import.meta.url), 'utf8');
ok(/import \{ sweepUploads, UPLOAD_KEEP_DAYS \} from '\.\/uploads\.mjs'/.test(server), 'server.mjs: uploads.mjs 를 씀');
ok(/sweepUploads\(path\.join\(STATE, 'uploads'\)\)/.test(server) && /const dir = path\.join\(STATE, 'uploads'\)/.test(server), 'server.mjs: 정리 폴더 = 업로드가 쓰는 state/uploads');
ok(/sweepUp\(\); setInterval\(sweepUp, 24 \* 60 \* 60 \* 1000\)\.unref\(\)/.test(server), 'server.mjs: 시작 때 한 번 + 하루 한 번(데몬 종료를 붙잡지 않음)');

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
