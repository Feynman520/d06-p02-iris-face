// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 모듈 콘센트(계약 v1) 무접촉 검사 — zip·서명·설치·ModuleHost. 실제 데몬·CLI 접촉 0. 사용: node scripts/check-modules.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipRead, zipWrite } from '../daemon/zip.mjs';
import { buildManifest, signManifest, verifyManifest, generateKeyPair, OFFICIAL_PUBLIC_KEYS } from '../daemon/modsign.mjs';
import { ModuleHost, validateInfo, semverGte, CONTRACT, readModuleJson } from '../daemon/modules.mjs';

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

// ---- 3) module.json 검증·탐색(프로세스 없음) ----
{
  const FACE = '2.43.0';
  const mkmod = (name, patch = {}, entry = 'process.stdin.resume();') => {
    const d = path.join(tmp, 'mods', name); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'module.json'), JSON.stringify({ name, label: name, icon: '·', version: '0.1.0', contract: 1, grade: 0, minFace: '2.43.0', entry: 'index.mjs', ...patch }), 'utf8');
    fs.writeFileSync(path.join(d, 'index.mjs'), entry, 'utf8');
    return d;
  };
  ok(semverGte('2.43.0', '2.43.0') && semverGte('2.43.1', '2.43.0') && semverGte('3.0.0', '2.99.9') && !semverGte('2.42.9', '2.43.0'), 'semverGte');
  ok(validateInfo({ name: 'good', contract: 1, grade: 0, minFace: '2.43.0', version: '1.0.0' }, FACE).ok, 'validateInfo: 정상');
  ok(validateInfo({ name: 'Bad Name', contract: 1, grade: 0, version: '1' }, FACE).status === 'incompatible', 'validateInfo: 이름 규칙 위반 → incompatible');
  ok(validateInfo({ name: 'c2', contract: 2, grade: 0, version: '1' }, FACE).status === 'incompatible', 'validateInfo: 계약 v2 → incompatible');
  ok(validateInfo({ name: 'newer', contract: 1, grade: 0, minFace: '9.0.0', version: '1' }, FACE).status === 'incompatible', 'validateInfo: minFace 초과 → incompatible');
  ok(validateInfo({ name: 'g1', contract: 1, grade: 1, version: '1' }, FACE).status === 'grade-unsupported', 'validateInfo: 등급 1 → grade-unsupported');
  mkmod('good'); mkmod('c2', { contract: 2 }); mkmod('g1', { grade: 1 });
  fs.mkdirSync(path.join(tmp, 'mods', 'noentry')); fs.writeFileSync(path.join(tmp, 'mods', 'noentry', 'module.json'), JSON.stringify({ name: 'noentry', contract: 1, grade: 0, version: '1' }));
  fs.mkdirSync(path.join(tmp, 'mods', 'notjson')); fs.writeFileSync(path.join(tmp, 'mods', 'notjson', 'module.json'), '{oops');
  fs.writeFileSync(path.join(tmp, 'mods', 'stray.txt'), 'x');
  const host = new ModuleHost({ dir: path.join(tmp, 'mods'), faceVersion: FACE, log: () => {} });
  host.scan();
  const by = Object.fromEntries(host.list().map(m => [m.name, m]));
  ok(Object.keys(by).sort().join(',') === 'c2,g1,good,noentry,notjson', 'scan: 폴더 5개 모두 목록에(파일은 무시)');
  ok(by.good.status === 'stopped' && by.good.contract === CONTRACT && by.good.official === false, 'scan: 정상 모듈 = stopped·비공식(.official 없음)');
  ok(by.c2.status === 'incompatible' && by.g1.status === 'grade-unsupported', 'scan: 계약·등급 상태');
  ok(by.noentry.status === 'incompatible' && /entry/.test(by.noentry.reason), 'scan: entry 파일 없음 → incompatible(reason 에 entry)');
  ok(by.notjson.status === 'incompatible' && /json/i.test(by.notjson.reason), 'scan: module.json 깨짐 → incompatible');
  fs.writeFileSync(path.join(tmp, 'mods', 'good', '.official'), JSON.stringify({ keyId: '2026-09' }));
  host.scan(); ok(host.list().find(m => m.name === 'good').official === true, 'scan: .official 표시 파일 → official true');
  fs.mkdirSync(path.join(tmp, 'mods', 'weird')); fs.mkdirSync(path.join(tmp, 'mods', 'weird', 'module.json'));
  host.scan();
  const by2 = Object.fromEntries(host.list().map(m => [m.name, m]));
  ok(by2.weird && by2.weird.status === 'incompatible' && /unreadable|scan error/.test(by2.weird.reason), 'scan: 항목 하나의 읽기 오류가 다른 모듈을 경고하기');
  ok(by2.good && by2.good.status === 'stopped', 'scan: 항목 하나의 읽기 오류가 다른 모듈 목록을 지우지 않음');
  ok(/invalid JSON/.test(readModuleJson(path.join(tmp, 'mods', 'notjson')).error), 'readModuleJson: 읽기 오류와 JSON 오류 구분(JSON)');
  ok(/unreadable/.test(readModuleJson(path.join(tmp, 'mods', 'weird')).error), 'readModuleJson: 읽기 오류와 JSON 오류 구분(읽기)');
  const none = new ModuleHost({ dir: path.join(tmp, 'no-such-dir'), faceVersion: FACE, log: () => {} }); none.scan();
  ok(none.list().length === 0, 'scan: modules 폴더 없음 → 빈 목록(오류 없음)');
}

// ---- 끝 ----
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
