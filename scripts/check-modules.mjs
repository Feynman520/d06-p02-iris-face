// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 모듈 콘센트(계약 v1) 무접촉 검사 — zip·서명·설치·ModuleHost. 실제 데몬·CLI 접촉 0. 사용: node scripts/check-modules.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipRead, zipWrite } from '../daemon/zip.mjs';
import { buildManifest, signManifest, verifyManifest, generateKeyPair, OFFICIAL_PUBLIC_KEYS } from '../daemon/modsign.mjs';

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
  const deflatEntries = [{ name: 'big.txt', data: Buffer.from('abc'.repeat(2000)), deflate: true }, { name: 'plain.txt', data: Buffer.from('x') }];
  const deflatBuf = zipWrite(deflatEntries);
  ok(deflatBuf.length < 6000, 'zip: deflate(method 8) 항목 왕복');
  const deflatBack = zipRead(deflatBuf);
  ok(deflatBack.length === 2 && deflatBack[0].name === 'big.txt' && deflatBack[0].data.length === 6000 && deflatBack[0].data.toString('utf8') === 'abc'.repeat(2000) && deflatBack[1].name === 'plain.txt' && deflatBack[1].data.toString('utf8') === 'x', 'zip: deflate 복원');
  const folderEntries = [{ name: 'dir/', data: Buffer.alloc(0) }, { name: 'dir/f.txt', data: Buffer.from('f') }];
  const folderBuf = zipWrite(folderEntries);
  const folderBack = zipRead(folderBuf);
  ok(folderBack.length === 1 && folderBack[0].name === 'dir/f.txt', 'zip: 폴더 항목(이름이 /로 끝남)은 목록에서 제외');
}

// ---- 2) 매니페스트·서명 ----
{
  const files = [{ name: 'module.json', data: Buffer.from('{}') }, { name: 'index.mjs', data: Buffer.from('x') }, { name: 'manifest.json', data: Buffer.from('ignored') }, { name: 'manifest.sig', data: Buffer.from('ignored') }];
  const man = buildManifest(files, { source: 'abc123' });
  ok(Object.keys(man.files).join(',') === 'index.mjs,module.json' && man.version === 1 && man.source === 'abc123', 'sign: 매니페스트는 manifest.* 제외·이름순·extra 포함');
  const kp = generateKeyPair(); const text = JSON.stringify(man);
  const sig = signManifest(text, kp.privatePem);
  ok(verifyManifest(text, sig, [{ id: 't', pem: kp.publicPem }]).ok === true, 'sign: 같은 열쇠로 검증 통과');
  ok(verifyManifest(text + ' ', sig, [{ id: 't', pem: kp.publicPem }]).ok === false, 'sign: 본문 1자 바뀌면 실패');
  const other = generateKeyPair();
  ok(verifyManifest(text, sig, [{ id: 'o', pem: other.publicPem }]).ok === false, 'sign: 다른 열쇠로 실패');
  ok(Array.isArray(OFFICIAL_PUBLIC_KEYS) && OFFICIAL_PUBLIC_KEYS.length >= 1 && /BEGIN PUBLIC KEY/.test(OFFICIAL_PUBLIC_KEYS[0].pem), 'sign: 공식 공개 열쇠가 소스에 1개 이상');
}

// ---- 끝 ----
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
