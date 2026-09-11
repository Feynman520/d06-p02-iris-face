// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 모듈 콘센트(계약 v1) 무접촉 검사 — zip·서명·설치·ModuleHost. 실제 데몬·CLI 접촉 0. 사용: node scripts/check-modules.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipRead, zipWrite } from '../daemon/zip.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-modules-'));

// ---- 1) zip 왕복 ----
{
  const entries = [{ name: 'module.json', data: Buffer.from('{"a":1}') }, { name: 'sub/한글.txt', data: Buffer.from('안녕', 'utf8') }, { name: 'empty.bin', data: Buffer.alloc(0) }];
  const buf = zipWrite(entries);
  const back = zipRead(buf);
  ok(back.length === 3 && back[1].name === 'sub/한글.txt' && back[1].data.toString('utf8') === '안녕' && back[2].data.length === 0, 'zip: 저장 방식 왕복(한글 이름·빈 파일)');
  let threw = false; try { zipRead(Buffer.from('not a zip')); } catch { threw = true; }
  ok(threw, 'zip: zip 아님 → throw');
}

// ---- 끝 ----
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
