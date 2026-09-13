// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 업데이트(설계 8절) 무접촉 검사 — 가짜 fetch·가짜 영혼 폴더·임시 state 로 확인/비교/available, 받기·검증(sha 불일치·서명 없음·경로 탈출 거부),
// plan.json 생성, dev/package 모드, 설정 토글, 타이머 끔 플래그, 적용기 인계, 결과 토스트를 본다.
// 실 데몬(3458)·네트워크·GitHub 접촉 0. 사용: node scripts/check-update.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipWrite } from '../daemon/zip.mjs';
import { buildManifest, signManifest, generateKeyPair, sha256 } from '../daemon/modsign.mjs';
import {
  Updater, versionFromTag, cmpSemver, isNewer, parseSha256File, stamp, detectMode, readInstalled,
  verifyFaceZip, verifyPackageZip, PART_NAMES, APPLY_ORDER, PART_SOURCE, DEV_REASON,
} from '../daemon/update.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-update-'));
const KP = generateKeyPair(); const KEYS = [{ id: 'test', pem: KP.publicPem }];
const OTHER = generateKeyPair();

// ---- 1) 판 도구(태그 → 판, semver 비교, .sha256 파일 읽기) ----
{
  ok(versionFromTag('iris-face--v2.58.0') === '2.58.0' && versionFromTag('iris-installer--v1.3.0') === '1.3.0' && versionFromTag('v0.3.2') === '0.3.2', '판: 태그에서 --v 뒤를 잘라 semver');
  ok(versionFromTag('') === null && versionFromTag('nightly') === null, '판: semver 가 아닌 태그 → null');
  ok(cmpSemver('2.58.0', '2.57.1') > 0 && cmpSemver('2.57.1', '2.58.0') < 0 && cmpSemver('1.0.0', '1.0.0') === 0 && cmpSemver('2.7.0', '2.10.0') < 0, '판: semver 비교(숫자 셋, 문자열 비교 아님)');
  ok(cmpSemver('2.58', '2.57.1') === 0 && cmpSemver(null, '1.0.0') === 0, '판: 숫자 셋이 아니면 비교하지 않음(0)');
  ok(isNewer('2.58.0', '2.57.1') && !isNewer('2.57.1', '2.58.0') && !isNewer('2.58.0', null) && !isNewer(null, '2.0.0'), '판: 설치 판을 모르면 업데이트 대상 아님');
  const hex = 'a'.repeat(64);
  ok(parseSha256File(`${hex}  iris-face-v2.58.0.zip\n`) === hex && parseSha256File(`${hex.toUpperCase()}\n`) === hex && parseSha256File('nope') === null, '판: .sha256 첨부에서 64자리 hex 만 뽑음(대문자 → 소문자)');
  ok(/^\d{8}-\d{6}$/.test(stamp(Date.now())), '판: 내려받기 폴더 시각 표기 YYYYMMDD-HHMMSS');
  ok(PART_NAMES.join(',') === 'face,messenger,package' && APPLY_ORDER.join(',') === 'package,face,messenger', '판: 표시 차례와 적용 차례(구조판 → 창 → 메신저)');
  ok(/d06-p02-iris-face\/releases\/latest$/.test(PART_SOURCE.face.api) && /d09-p03-iris-installer\/releases\/latest$/.test(PART_SOURCE.package.api), '판: 릴리스 주소는 설계 1절의 저장소 둘(메신저는 카탈로그)');
}

// ---- 2) 가짜 영혼 폴더(픽스처) ----
// 개인·기기 식별자를 넣지 않는다 — 가짜 영혼 이름은 ALPHA.
const root = path.join(tmp, 'ALPHA');
const faceHome = path.join(root, '_agent', 'shared', 'tools', 'face');
const setupDir = path.join(root, '_agent', 'setup');
const modulesDir = path.join(tmp, 'modules');
const stateDir = path.join(tmp, 'state');
for (const d of [faceHome, setupDir, modulesDir, stateDir]) fs.mkdirSync(d, { recursive: true });
const receipt = { schema: 1, package: { name: 'IRIS', version: '1.2.0' }, soul: { root, name: 'ALPHA' }, installed: { face: { version: '2.57.1', at: '2026-09-13T00:00:00.000Z' } } };
const writeReceipt = (r) => fs.writeFileSync(path.join(setupDir, 'package-receipt.json'), JSON.stringify(r, null, 2), 'utf8');
writeReceipt(receipt);
fs.writeFileSync(path.join(faceHome, 'package.json'), JSON.stringify({ name: 'iris-face', version: '2.50.0' }), 'utf8');
fs.mkdirSync(path.join(modulesDir, 'messenger'), { recursive: true });
fs.writeFileSync(path.join(modulesDir, 'messenger', 'module.json'), JSON.stringify({ name: 'messenger', version: '0.3.2', contract: 1, grade: 0, entry: 'index.mjs' }), 'utf8');

// ---- 3) 모드 판정 · 설치 판 읽기 ----
{
  ok(detectMode({ root, faceRoot: faceHome, receipt }) === 'package', '모드: 설치 자리 + 영수증 → package');
  ok(detectMode({ root, faceRoot: faceHome, receipt: null }) === 'dev', '모드: 영수증이 없으면 dev');
  ok(detectMode({ root, faceRoot: path.join(tmp, 'dev-face'), receipt }) === 'dev', '모드: 개발 폴더에서 실행하면 dev');
  const ins = readInstalled({ root, mode: 'package', modulesDir, faceRoot: faceHome, receipt });
  ok(ins.face === '2.57.1' && ins.messenger === '0.3.2' && ins.package === '1.2.0', '설치 판: 영수증 우선 · 메신저 module.json · 패키지 영수증');
  const noFace = readInstalled({ root, mode: 'package', modulesDir, faceRoot: faceHome, receipt: { package: { version: '1.2.0' } } });
  ok(noFace.face === '2.50.0', '설치 판: 영수증에 face 가 없던 옛 설치 → tools\\face\\package.json 으로 대체');
  const dev = readInstalled({ root: path.join(tmp, 'no-such-root'), mode: 'dev', modulesDir: path.join(tmp, 'no-mods'), faceRoot: path.resolve('.'), receipt: null });
  ok(dev.face === JSON.parse(fs.readFileSync('package.json', 'utf8')).version && dev.messenger === null && dev.package === null, '설치 판: dev 는 자기 package.json, 미설치 부품은 null');
}

// ---- 4) zip 검증(IRIS 창 · 구조판) ----
const faceFiles = [
  { name: 'package.json', data: Buffer.from(JSON.stringify({ name: 'iris-face', version: '2.58.0' })) },
  { name: 'daemon/server.mjs', data: Buffer.from('// face\n') },
  { name: 'app/main.js', data: Buffer.from('// app\n') },
];
const packZip = (files, { sign = true, key = KP.privatePem } = {}) => {
  const text = JSON.stringify(buildManifest(files));
  const all = [...files, { name: 'manifest.json', data: Buffer.from(text) }];
  if (sign) all.push({ name: 'manifest.sig', data: Buffer.from(signManifest(text, key)) });
  return zipWrite(all);
};
const FACE_ZIP = packZip(faceFiles);
const pkgFiles = [
  { name: 'IRIS-설치.cmd', data: Buffer.from('@echo off\n') },
  { name: 'installer/server.mjs', data: Buffer.from('// installer\n') },
  { name: 'lock.json', data: Buffer.from('{"package":{"version":"1.3.0"}}') },
];
const PKG_MANIFEST = JSON.stringify({ version: 1, package: { name: 'IRIS', version: '1.3.0' }, files: Object.fromEntries(pkgFiles.map(f => [f.name, sha256(f.data)])) });
const PKG_ZIP = zipWrite([...pkgFiles, { name: 'manifest.json', data: Buffer.from(PKG_MANIFEST) }]);
const PKG_SIG = signManifest(PKG_MANIFEST, KP.privatePem);
{
  const good = verifyFaceZip(FACE_ZIP, { keys: KEYS });
  ok(good.ok && good.files.length === 5 && good.keyId === 'test', '검증(창): 서명된 zip 통과 — module.json 을 요구하지 않음');
  ok(verifyFaceZip(packZip(faceFiles, { sign: false }), { keys: KEYS }).reason === '공식 서명이 없습니다', '검증(창): 서명 없음 → 거부(비공식 동의 경로 없음)');
  ok(/공식 서명/.test(verifyFaceZip(packZip(faceFiles, { key: OTHER.privatePem }), { keys: KEYS }).reason), '검증(창): 다른 열쇠 서명 → 거부');
  const tampered = Buffer.from(FACE_ZIP); tampered.write('XX', tampered.indexOf(Buffer.from('// face')));
  ok(/manifest mismatch/.test(verifyFaceZip(tampered, { keys: KEYS }).reason || ''), '검증(창): 파일 변조 → 매니페스트 불일치');
  ok(/unsafe path/.test(verifyFaceZip(packZip([...faceFiles, { name: '../../evil.mjs', data: Buffer.from('x') }]), { keys: KEYS }).reason), '검증(창): 경로 탈출(../) 거부');
  ok(/unsafe path/.test(verifyFaceZip(packZip([...faceFiles, { name: 'C:\\evil.mjs', data: Buffer.from('x') }]), { keys: KEYS }).reason), '검증(창): 절대경로 항목 거부');
  ok(/duplicate entry/.test(verifyFaceZip(packZip([...faceFiles, { name: 'APP/main.js', data: Buffer.from('x') }]), { keys: KEYS }).reason), '검증(창): 중복 항목(대소문자 무시) 거부');
  ok(/not a zip/.test(verifyFaceZip(Buffer.from('not a zip at all'), { keys: KEYS }).reason), '검증(창): zip 이 아니면 조용히 거부(throw 없음)');
  const bentFace = Buffer.from(FACE_ZIP); bentFace.writeUInt16LE(8, 8);   // 첫 항목 로컬 헤더의 압축 방식만 위조
  ok(/local header method mismatch/.test(verifyFaceZip(bentFace, { keys: KEYS }).reason || ''), '검증(창): 로컬/중앙 압축 방식 불일치 거부(탐색기·7-Zip 이 못 푸는 zip)');
  const bentPkg = Buffer.from(PKG_ZIP); bentPkg.writeUInt16LE(8, 8);
  ok(/local header method mismatch/.test(verifyPackageZip(bentPkg, PKG_SIG, { keys: KEYS }).reason || ''), '검증(구조판): 로컬/중앙 압축 방식 불일치 거부');

  ok(verifyPackageZip(PKG_ZIP, PKG_SIG, { keys: KEYS }).ok, '검증(구조판): zip 안 manifest.json 을 첨부 manifest.sig 로 검증');
  ok(verifyPackageZip(PKG_ZIP, signManifest(PKG_MANIFEST, OTHER.privatePem), { keys: KEYS }).reason === '공식 서명이 없습니다', '검증(구조판): 다른 열쇠 서명 → 거부');
  ok(verifyPackageZip(PKG_ZIP, '', { keys: KEYS }).reason === 'manifest.sig 첨부가 없습니다', '검증(구조판): 서명 첨부 없음 → 거부');
  ok(verifyPackageZip(zipWrite(pkgFiles), PKG_SIG, { keys: KEYS }).reason === 'manifest.json missing', '검증(구조판): zip 안 manifest.json 없음 → 거부');
  ok(/unsafe path/.test(verifyPackageZip(zipWrite([...pkgFiles, { name: 'manifest.json', data: Buffer.from(PKG_MANIFEST) }, { name: '../out.txt', data: Buffer.from('x') }]), PKG_SIG, { keys: KEYS }).reason), '검증(구조판): 경로 탈출 거부(통째로 풀기 전)');
}

// ---- 5) 가짜 GitHub(바깥 연결 0) ----
const FACE_SHA = sha256(FACE_ZIP), PKG_SHA = sha256(PKG_ZIP);
const MSG_ZIP = Buffer.from('PK-fake-messenger-zip'); const MSG_SHA = sha256(MSG_ZIP);
const DL = 'https://github.com/x/y/releases/download/t/';
const OBJ = 'https://objects.githubusercontent.com/blob/';
let calls = [];
let shaOverride = null;          // 검사에서 sha256 첨부 값을 일부러 틀리게
const asset = (name, size) => ({ name, size, browser_download_url: DL + name });
const rel = (tag, names, body) => JSON.stringify({ tag_name: tag, published_at: '2026-09-14T00:00:00Z', body, assets: names });
const BODY_FACE = '## v2.58.0\n- 설정에 업데이트 절\n- 하루 한 번 확인\n- 내려받기 검증\n- 적용기 인계\n- 여섯째 줄은 잘린다\n- 일곱째 줄';
const R = (status, body, headers = {}) => new Response(body, { status, headers });
function fakeFetch(url, opts) {
  calls.push({ url, redirect: opts?.redirect });
  if (/d06-p02-iris-face\/releases\/latest$/.test(url)) return Promise.resolve(R(200, rel('iris-face--v2.58.0', [asset('iris-face-v2.58.0.zip', FACE_ZIP.length), asset('iris-face-v2.58.0.zip.sha256', 80)], BODY_FACE)));
  if (/d06-p04-iris-messenger\/releases\/latest$/.test(url)) return Promise.resolve(R(200, rel('iris-messenger--v0.4.0', [asset('iris-messenger-v0.4.0.zip', MSG_ZIP.length), asset('iris-messenger-v0.4.0.zip.sha256', 80)], '메신저 새 판')));
  if (/d09-p03-iris-installer\/releases\/latest$/.test(url)) return Promise.resolve(R(200, rel('iris-installer--v1.3.0', [asset('IRIS-Setup_v1.3.0_2026-09-14.zip', PKG_ZIP.length), asset('IRIS-Setup_v1.3.0_2026-09-14.zip.sha256', 80), asset('manifest.sig', 100)], '구조판 새 판')));
  const name = url.startsWith(DL) ? url.slice(DL.length) : url.startsWith(OBJ) ? url.slice(OBJ.length) : null;
  if (url.startsWith(DL)) return Promise.resolve(R(302, null, { location: OBJ + name }));   // 실제 GitHub 처럼 한 번 넘긴다
  if (name === 'iris-face-v2.58.0.zip') return Promise.resolve(R(200, FACE_ZIP, { 'content-length': String(FACE_ZIP.length) }));
  if (name === 'iris-messenger-v0.4.0.zip') return Promise.resolve(R(200, MSG_ZIP, { 'content-length': String(MSG_ZIP.length) }));
  if (name === 'IRIS-Setup_v1.3.0_2026-09-14.zip') return Promise.resolve(R(200, PKG_ZIP, { 'content-length': String(PKG_ZIP.length) }));
  if (name === 'iris-face-v2.58.0.zip.sha256') return Promise.resolve(R(200, `${shaOverride || FACE_SHA}  iris-face-v2.58.0.zip\n`));
  if (name === 'iris-messenger-v0.4.0.zip.sha256') return Promise.resolve(R(200, `${MSG_SHA}  iris-messenger-v0.4.0.zip\n`));
  if (name === 'IRIS-Setup_v1.3.0_2026-09-14.zip.sha256') return Promise.resolve(R(200, `${PKG_SHA}  IRIS-Setup_v1.3.0_2026-09-14.zip\n`));
  if (name === 'manifest.sig') return Promise.resolve(R(200, PKG_SIG));
  return Promise.resolve(R(404, 'unexpected ' + url));
}

let nowMs = Date.parse('2026-09-14T09:00:00.000Z');
const broadcasts = [];
const msgInstalls = [];
const spawns = [];
const mkUpdater = (extra = {}) => new Updater({
  root, faceRoot: faceHome, stateDir, modulesDir, faceVersion: '2.57.1', daemonPort: 3459, keys: KEYS,
  fetchImpl: fakeFetch, now: () => nowMs, log: () => {}, broadcast: (o) => broadcasts.push(o),
  installMessenger: async (buf) => { msgInstalls.push(buf.length); return { status: 201, body: { name: 'messenger', version: '0.4.0' } }; },
  spawnImpl: (cmd, args, o) => { spawns.push({ cmd, args, o }); return { pid: 4242, unref() {} }; },
  ...extra,
});

// ---- 6) 확인 · 비교 · available ----
let up;
{
  calls = [];
  up = mkUpdater();
  ok(calls.length === 0, '확인: Updater 를 만드는 것만으로는 바깥으로 나가지 않는다');
  ok(up.mode === 'package' && up.enabled === true, '확인: 설치 자리 + 영수증 → package 모드, 하루 1회 기본 켬');
  const info = await up.check();
  ok(calls.length === 3 && calls.every(c => c.redirect === 'manual' && /^https:\/\/api\.github\.com\//.test(c.url)), '확인: 요청 3개(부품마다 1개) · redirect:manual · api.github.com');
  ok(info.latest.face.version === '2.58.0' && info.latest.face.asset === 'iris-face-v2.58.0.zip' && /\.sha256$/.test(info.latest.face.sha256Url), '확인: 창 = 태그의 판 + 첨부 정규식으로 zip + .sha256 주소');
  ok(info.latest.package.version === '1.3.0' && /manifest\.sig$/.test(info.latest.package.sigUrl), '확인: 구조판 = manifest.sig 첨부 주소까지');
  ok(info.latest.messenger.version === '0.4.0', '확인: 메신저는 카탈로그(daemon/catalog.json)의 주소·정규식 재사용');
  ok(info.installed.face === '2.57.1' && info.installed.package === '1.2.0' && info.installed.messenger === '0.3.2', '확인: 설치 판 3개를 함께 준다');
  ok(info.available.join(',') === 'face,messenger,package', '비교: 세 부품 모두 새 판 → available');
  ok(info.applyParts.join(',') === 'package,messenger', '비교: 구조판이 있으면 창(face)은 건너뛴다 — 구조판 안에 최신 창이 들어 있다');
  ok(info.headline.part === 'face' && info.headline.version === '2.58.0' && info.headline.more === 2, '비교: 단추에 쓸 대표 판 = 창');
  ok(typeof info.lastCheck === 'string' && info.checkError === null, '확인: 마지막 확인 시각 기록 · 오류 없음');
  ok(fs.existsSync(path.join(stateDir, 'update.json')) && JSON.parse(fs.readFileSync(path.join(stateDir, 'update.json'), 'utf8')).latest.face.version === '2.58.0', '확인: state\\update.json 에 남는다');
  ok(broadcasts.some(b => b.type === 'update' && b.phase === 'checked'), '확인: 화면에 방송(phase=checked)');
  ok(String(info.latest.face.notes).split('\n').length >= 6, '확인: 릴리스 노트 원문 보관(자르기는 화면 몫)');
}

// ---- 7) 확인 실패는 조용히 기록 ----
{
  const bad = new Updater({ root, faceRoot: faceHome, stateDir: fs.mkdtempSync(path.join(tmp, 'st2-')), modulesDir, keys: KEYS, now: () => nowMs, fetchImpl: async () => R(503, 'nope') });
  const info = await bad.check();
  ok(info.checkError && /503/.test(info.checkError) && info.available.length === 0, '확인 실패: 사유만 기록하고 목록은 비운다(데몬 안 죽음)');
  const off = new Updater({ root, faceRoot: faceHome, stateDir: fs.mkdtempSync(path.join(tmp, 'st3-')), modulesDir, keys: KEYS, fetchImpl: async () => { throw new Error('no network'); } });
  ok((await off.check()).checkError.includes('no network'), '확인 실패: fetch 자체가 터져도 info 를 돌려준다');
}

// ---- 8) 설정 토글 · 타이머 끔 플래그 ----
{
  const t = new Updater({ root, faceRoot: faceHome, stateDir, modulesDir, keys: KEYS, fetchImpl: fakeFetch, now: () => nowMs });
  ok(t.setEnabled(false).enabled === false && JSON.parse(fs.readFileSync(path.join(stateDir, 'update.json'), 'utf8')).enabled === false, '설정: 스위치를 끄면 state 에 남는다');
  const reread = new Updater({ root, faceRoot: faceHome, stateDir, modulesDir, keys: KEYS, fetchImpl: fakeFetch, now: () => nowMs });
  ok(reread.enabled === false, '설정: 데몬을 다시 띄워도 꺼진 채로');
  reread.stop();
  ok(reread.start() === true && reread.timers.length === 2, '타이머: 기본은 30초 뒤 1회 + 24시간마다');
  reread.stop(); ok(reread.timers.length === 0, '타이머: stop() 으로 전부 해제');
  process.env.IRIS_FACE_UPDATE_CHECK = '0';
  ok(reread.start() === false && reread.timers.length === 0, '타이머: IRIS_FACE_UPDATE_CHECK=0 이면 아예 걸지 않는다');
  delete process.env.IRIS_FACE_UPDATE_CHECK;
  t.setEnabled(true);
}

// ---- 9) dev 모드는 적용하지 않는다 ----
{
  const dev = new Updater({ root, faceRoot: path.join(tmp, 'dev-face'), stateDir: fs.mkdtempSync(path.join(tmp, 'st4-')), modulesDir, keys: KEYS, fetchImpl: fakeFetch, now: () => nowMs });
  ok(dev.mode === 'dev', 'dev: 개발 폴더에서 실행 → dev 모드');
  const r = await dev.apply();
  ok(r.ok === false && r.reason === DEV_REASON, 'dev: apply 거부 · 사유는 "git pull로 갱신"');
  ok(dev.applyNow().ok === false, 'dev: apply-now 도 거부');
  ok(dev.downloadsDir().startsWith(path.resolve(tmp)) && !dev.downloadsDir().startsWith(path.resolve(root)), 'dev: 받는 자리는 state\\downloads(영혼 폴더를 건드리지 않음)');
}

// ---- 10) sha256 이 맞지 않으면 받은 폴더를 지우고 적용하지 않는다 ----
// 구조판은 이미 최신인 상황(창 + 메신저만 새 판)으로 바꿔 창 zip 을 실제로 받게 한다.
writeReceipt({ ...receipt, package: { name: 'IRIS', version: '1.3.0' } });
{
  nowMs += 1000; shaOverride = 'b'.repeat(64);
  const bad = mkUpdater();
  await bad.check();
  ok(bad.info().applyParts.join(',') === 'face,messenger', '비교: 구조판이 최신이면 창·메신저만 받는다');
  const before = msgInstalls.length;
  const r = await bad.apply();
  shaOverride = null;
  ok(r.ok === false && /sha256/.test(r.reason), '거부: sha256 불일치 → 실패 사유');
  const dir = path.join(root, '_agent', 'shared', 'downloads', `update-${stamp(nowMs)}`);
  ok(!fs.existsSync(dir), '거부: 받은 폴더를 통째로 지운다');
  ok(msgInstalls.length === before, '거부: 하나라도 실패하면 아무것도 설치하지 않는다');
  ok(bad.info().lastResult.ok === false && bad.info().plan === null, '거부: lastResult 에 사유만 남고 plan 은 없다');
  ok(broadcasts.some(b => b.phase === 'error'), '거부: 화면에 실패 방송');
}

// ---- 11) 정상 적용 ⓐ 창 + 메신저: 받기 → 검증 → 메신저 설치 → face\ 풀기 → plan.json ----
let planFile = null;
{
  nowMs += 1000;
  broadcasts.length = 0;
  up = mkUpdater();
  await up.check();
  const r = await up.apply();
  ok(r.ok === true, '적용: 받기·검증 통과');
  const dir = path.join(root, '_agent', 'shared', 'downloads', `update-${stamp(nowMs)}`);
  ok(fs.existsSync(dir), `적용: 받는 자리 = _agent\\shared\\downloads\\update-<시각> (${path.basename(dir)})`);
  ok(msgInstalls.length === 1 && msgInstalls[0] === MSG_ZIP.length, '적용: 메신저는 그 자리에서 기존 설치 함수로(세션 무관)');
  ok(fs.existsSync(path.join(dir, 'face', 'package.json')) && fs.existsSync(path.join(dir, 'face', 'daemon', 'server.mjs')), '적용: 창 zip 을 face\\ 에 풀었다');
  planFile = path.join(dir, 'plan.json');
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  ok(plan.schema === 1 && plan.root === root && plan.daemonPort === 3459 && plan.daemonPid === process.pid && plan.relaunch === true, 'plan.json: schema·root·daemonPort·daemonPid·relaunch');
  ok(plan.items.length === 1 && plan.items[0].kind === 'face' && plan.items[0].version === '2.58.0' && plan.items[0].dir === path.join(dir, 'face'), 'plan.json: items = { kind, dir, version }');
  ok(plan.items.every(i => fs.existsSync(i.dir)), 'plan.json: items[].dir 은 실제로 푼 폴더');
  ok(!plan.items.some(i => i.kind === 'messenger'), 'plan.json: 메신저는 적용기에 넘기지 않는다(이미 설치됨)');
  const dl = broadcasts.filter(b => b.phase === 'download');
  ok(dl.length >= 2 && dl.every(b => b.type === 'update' && typeof b.received === 'number' && typeof b.total === 'number' && b.index >= 1 && b.count === 2), '적용: 내려받기 진행 방송 {type:update, phase:download, part, received, total}');
  ok(up.info().applying === false && up.info().plan.file === planFile, '적용: 끝나면 applying 을 내리고 plan 을 남긴다(「나중에」 대비)');
  ok(up.info().lastResult.ok === true && up.info().lastResult.installed[0].kind === 'messenger', '적용: lastResult 에 설치·예정 목록');
}

// ---- 11ⓑ) 구조판이 있으면 창 대신 구조판만 풀고 적용기에 넘긴다 ----
{
  writeReceipt(receipt);      // 구조판 1.2.0 으로 되돌림 → 세 부품 모두 새 판
  nowMs += 1000;
  const pk = mkUpdater();
  await pk.check();
  const r = await pk.apply();
  const dir = path.join(root, '_agent', 'shared', 'downloads', `update-${stamp(nowMs)}`);
  ok(r.ok === true && fs.existsSync(path.join(dir, 'package', 'IRIS-설치.cmd')) && fs.existsSync(path.join(dir, 'package', 'lock.json')), '적용(구조판): zip 을 package\\ 에 풀었다(한글 이름 포함)');
  ok(!fs.existsSync(path.join(dir, 'face')), '적용(구조판): 창 zip 은 받지도 풀지도 않는다(구조판 안에 들어 있다)');
  const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'));
  ok(plan.items.length === 1 && plan.items[0].kind === 'package' && plan.items[0].version === '1.3.0', 'plan.json(구조판): items = package 하나 — 설치기가 나머지를 다 한다');
  writeReceipt({ ...receipt, package: { name: 'IRIS', version: '1.3.0' } });
}

// ---- 12) 적용기 인계(분리 실행) ----
{
  const noUpdater = up.applyNow();
  ok(noUpdater.ok === false && /적용기/.test(noUpdater.reason), '인계: 적용기가 없으면 거부(설치 패키지 v1.3.0 전)');
  const updDir = path.join(root, '_agent', 'shared', 'tools', 'updater');
  fs.mkdirSync(updDir, { recursive: true }); fs.writeFileSync(path.join(updDir, 'apply.mjs'), '// updater stub\n', 'utf8');
  const r = up.applyNow();
  ok(r.ok === true && r.pid === 4242 && r.plan === planFile, '인계: 적용기를 분리 실행하고 plan 경로를 돌려준다');
  const s = spawns[spawns.length - 1];
  ok(s.cmd === 'node' && s.args[0] === path.join(updDir, 'apply.mjs') && s.args[1] === planFile, '인계: 동봉 node 가 없으면 PATH 의 node + apply.mjs <plan>');
  ok(s.o.detached === true && s.o.stdio === 'ignore' && s.o.windowsHide === true, '인계: detached·stdio ignore — 데몬이 끝나도 살아남는다');
  const nodeDir = path.join(root, '_agent', 'shared', 'tools', 'node');
  fs.mkdirSync(nodeDir, { recursive: true }); fs.writeFileSync(path.join(nodeDir, 'node.exe'), 'stub', 'utf8');
  up.applyNow();
  ok(spawns[spawns.length - 1].cmd === path.join(nodeDir, 'node.exe'), '인계: 동봉 node 가 있으면 그것으로');
}

// ---- 13) 적용기 결과 → 화면 토스트(한 번만) ----
{
  const resultFile = path.join(setupDir, 'update-result.json');
  fs.writeFileSync(resultFile, JSON.stringify({ ok: true, at: '2026-09-14T10:00:00.000Z', items: [{ kind: 'face', version: '2.58.0', ok: true }] }), 'utf8');
  const fresh = mkUpdater();
  const r1 = fresh.consumeResult();
  ok(r1 && r1.ok === true && r1.items[0].version === '2.58.0', '결과: update-result.json 이 새로우면 한 번 돌려준다');
  ok(fresh.consumeResult() === null && mkUpdater().consumeResult() === null, '결과: 같은 결과를 두 번 띄우지 않는다(state.result.at 기록)');
  ok(fresh.info().plan === null, '결과: 적용이 끝났으므로 받아 둔 plan 을 치운다');
  fs.writeFileSync(resultFile, JSON.stringify({ ok: false, at: '2026-09-14T11:00:00.000Z', items: [{ kind: 'face', version: '2.58.0', ok: false, reason: 'npm ci 실패' }] }), 'utf8');
  ok(mkUpdater().consumeResult()?.ok === false, '결과: 더 새로운 결과는 다시 돌려준다');
  fs.rmSync(resultFile, { force: true });
  ok(mkUpdater().consumeResult() === null, '결과: 파일이 없으면 조용히 null');
}

// ---- 14) 받아 둔 뒤 「나중에」 · 새 판이 없을 때 · 다 쓴 폴더 치우기 ----
{
  nowMs += 1000;
  const later = mkUpdater();
  await later.check();
  await later.apply();
  const info = later.info();
  ok(info.plan && fs.existsSync(info.plan.file), '나중에: plan 을 남겨 두면 다음 클릭은 내려받기 없이 적용만');
  // 영수증을 최신으로 바꾸면 새 판이 없다
  writeReceipt({ ...receipt, package: { name: 'IRIS', version: '1.3.0' }, installed: { face: { version: '2.58.0' } } });
  fs.writeFileSync(path.join(modulesDir, 'messenger', 'module.json'), JSON.stringify({ name: 'messenger', version: '0.4.0', contract: 1, grade: 0, entry: 'index.mjs' }), 'utf8');
  const same = mkUpdater(); await same.check();
  ok(same.info().available.length === 0 && same.info().headline === null, '비교: 설치 판이 최신이면 available 0 · 단추는 「지금 확인」');
  ok((await same.apply()).reason === '새 판이 없습니다.', '적용: 새 판이 없으면 아무것도 받지 않는다');
  // 오래된 내려받기 폴더 치우기(plan 이 가리키는 폴더는 남긴다)
  const old = path.join(root, '_agent', 'shared', 'downloads', 'update-20260101-000000');
  fs.mkdirSync(old, { recursive: true });
  const keepMine = path.join(root, '_agent', 'shared', 'downloads', 'not-ours');
  fs.mkdirSync(keepMine, { recursive: true });
  const sweeper = mkUpdater(); sweeper.state.plan = later.info().plan;
  nowMs += 30 * 24 * 60 * 60 * 1000;
  const n = sweeper.sweep();
  ok(n >= 1 && !fs.existsSync(old) && fs.existsSync(keepMine), `치우기: 7일 지난 update-* 폴더만 지운다(${n}개, 우리 이름이 아닌 폴더는 그대로)`);
  ok(fs.existsSync(later.info().plan.dir), '치우기: 적용을 기다리는 plan 폴더는 남긴다');
}

// ---- 15) 화면 코드가 규칙을 지키는지(이모지 0 · 네이티브 alert 금지 · 설정 행 모양) ----
{
  const js = fs.readFileSync('app/settings.js', 'utf8'), html = fs.readFileSync('app/index.html', 'utf8');
  const upSection = html.slice(html.indexOf('id="st-update-act"') - 400, html.indexOf('id="st-update-auto"') + 200);
  ok(/st-h-row/.test(upSection) && /id="st-update-act"/.test(upSection), '화면: 절 머리(h3.st-h-row) 오른쪽에 그 절의 유일한 행동 단추');
  ok(/class="st-opt"[^>]*>[\s\S]{0,200}st-update-auto/.test(upSection) && /class="sw"/.test(upSection), '화면: 켜고 끄는 항목은 .st-opt + 오른쪽 .sw 스위치');
  ok(/Icons\.svg\('bolt'/.test(js), '화면: 아이콘은 icons.js 이름(bolt) — 이모지 0');
  const updCode = js.slice(js.indexOf('renderUpdate'), js.indexOf('ABOUT_DEF'));
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(updCode), '화면: 업데이트 코드에 이모지 문자 0');
  ok(!/(^|[^.\w])alert\(/.test(updCode.replace(/Dialog\.alert\(/g, 'Dialog_alert(')), '화면: 알림·확인은 Dialog 만(네이티브 alert 금지)');
  ok(/el\.textContent = String\(notes\)/.test(js), '화면: 릴리스 노트는 textContent(HTML 로 넣지 않음)');
  ok(/iris\.update\.noticed/.test(js), '화면: 첫 실행 한 줄 고지는 localStorage 로 1회');
  ok(/sessionCount/.test(js) && /지금 적용/.test(js) && /나중에/.test(js), '화면: 확인 카드 = 세션 수 + [지금 적용] [나중에]');
  const main = fs.readFileSync('app/main.js', 'utf8');
  ok(/Settings\.onUpdate\(m\)/.test(main) && /Settings\.showUpdateResult/.test(main), '화면: 웹소켓 update 방송과 적용 결과를 설정으로 넘긴다');
  const server = fs.readFileSync('daemon/server.mjs', 'utf8');
  ok(/sameOrigin\(req\)[\s\S]{0,200}update/.test(server) || /startsWith\('\/api\/update\/'\)/.test(server), '데몬: 업데이트 POST 라우트는 같은 출처만');
  ok(/update: \{ mode: updater\.mode, enabled: updater\.enabled \}/.test(server), '데몬: /api/health.features.update = { mode, enabled }');
  ok(!/rmSync\(\s*ROOT/.test(fs.readFileSync('daemon/update.mjs', 'utf8')), '데몬: 자기 폴더를 지우거나 바꾸는 코드가 없다(교체는 적용기 몫)');
}

// ---- 끝 ----
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
