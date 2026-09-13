// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 모듈 콘센트(계약 v1) 무접촉 검사 — zip·서명·설치·ModuleHost. 실제 데몬·CLI 접촉 0. 사용: node scripts/check-modules.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { zipRead, zipWrite, zipIndex, MAX_ENTRY_BYTES, MAX_TOTAL_BYTES, MAX_ENTRIES } from '../daemon/zip.mjs';
import { buildManifest, signManifest, verifyManifest, generateKeyPair, OFFICIAL_PUBLIC_KEYS } from '../daemon/modsign.mjs';
import { ModuleHost, validateInfo, semverGte, CONTRACT, readModuleJson } from '../daemon/modules.mjs';
import { inspectZip, installZip, removeModule } from '../daemon/modinstall.mjs';

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
  ok(MAX_ENTRY_BYTES === 64 * 1024 * 1024 && MAX_TOTAL_BYTES === 256 * 1024 * 1024 && MAX_ENTRIES === 10000, 'zip: 상한 상수 export');
  const bombRaw = Buffer.from(zipWrite([{ name: 'small.txt', data: Buffer.from('x') }]));
  let bombThrew = false; try { zipRead(bombRaw, { maxEntryBytes: 0 }); } catch (e) { bombThrew = /entry too large/.test(e.message); }
  ok(bombThrew, 'zip: 폭탄 방어 — 항목 크기 상한');
  // 위조 usize: 실제 해제 결과(5000B)보다 선언된 usize(10)가 작은 zip — inflate 가 선언 크기를 넘으면 거부
  const forged = zipWrite([{ name: 'bomb.txt', data: Buffer.from('a'.repeat(5000)), deflate: true }]);
  const centralOff = forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  forged.writeUInt32LE(10, 22); forged.writeUInt32LE(10, centralOff + 24); // local·central usize 필드 둘 다 위조
  let forgedThrew = false; try { zipRead(forged); } catch (e) { forgedThrew = /inflate exceeded declared size/.test(e.message); }
  ok(forgedThrew, 'zip: 위조 usize 거부');
  // 로컬 헤더의 압축 방식(method)은 오프셋 8 — 중앙 디렉터리와 달라지면 우리 zipRead 는 넘어가지만
  // 탐색기·7-Zip·bsdtar 는 항목 전부를 CRC 오류로 거절한다(2026-09-14 고침).
  ok(zipIndex(buf).every(e => e.localMethod === e.method) && zipIndex(deflatBuf).every(e => e.localMethod === e.method), 'zip: 로컬 헤더 method(offset 8) == 중앙 디렉터리 method (저장·deflate 둘 다)');
  const bent = Buffer.from(deflatBuf); bent.writeUInt16LE(0, 8); // 첫 항목 로컬 헤더의 method 만 위조
  ok(zipIndex(bent)[0].localMethod === 0 && zipIndex(bent)[0].method === 8, 'zip: 로컬/중앙 method 불일치를 읽어 낸다(localMethod)');
  let mismatchThrew = false; try { zipIndex(bent, { strictLocal: true }); } catch (e) { mismatchThrew = /local header method mismatch/.test(e.message); }
  ok(mismatchThrew, 'zip: strictLocal 이면 불일치 거부(업데이트 검증이 쓴다)');
  // 바깥 zip 도구(윈도 기본 bsdtar)로도 풀리는지 — 도구가 없으면 건너뛴다
  const outDir = path.join(tmp, 'zip-extract'); fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'roundtrip.zip'), zipWrite([...entries, ...deflatEntries]));
  // 윈도 기본 bsdtar(System32\tar.exe — PATH 의 tar 는 zip 을 못 읽는 GNU tar 일 수 있다).
  // bsdtar 는 드라이브 문자가 든 경로를 원격 호스트로 보므로 그 폴더에서 상대 이름으로 부른다.
  const bsdtar = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : null;
  if (!bsdtar || !fs.existsSync(bsdtar)) { pass++; console.log('PASS zip: 바깥 zip 도구 없음 — 건너뜀'); }
  else {
    const tarRun = spawnSync(bsdtar, ['-xf', 'roundtrip.zip'], { cwd: outDir, encoding: 'utf8', windowsHide: true });
    ok(tarRun.status === 0 && fs.readFileSync(path.join(outDir, 'big.txt'), 'utf8').length === 6000 && fs.readFileSync(path.join(outDir, 'sub', '한글.txt'), 'utf8') === '안녕', `zip: 바깥 zip 도구(bsdtar)로도 풀린다 ${(tarRun.stderr || '').trim().slice(0, 90)}`);
  }
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

// ---- 4) 프로세스·계약 v1 ----
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
{
  const FACE = '2.43.0';
  const logs = []; const notes = []; let changes = 0;
  const FIX = path.resolve('scripts/fixtures/hello-module');
  const hd = path.join(tmp, 'mods4', 'hello'); fs.mkdirSync(hd, { recursive: true });
  for (const f of ['module.json', 'index.mjs']) fs.copyFileSync(path.join(FIX, f), path.join(hd, f));
  // 모르는 말·잘못된 panel·hello 로 받은 값 되돌려 보기
  fs.mkdirSync(path.join(tmp, 'mods4', 'noisy'));
  fs.writeFileSync(path.join(tmp, 'mods4', 'noisy', 'module.json'), JSON.stringify({ name: 'noisy', contract: 1, grade: 0, version: '1', entry: 'index.mjs' }));
  fs.writeFileSync(path.join(tmp, 'mods4', 'noisy', 'index.mjs'), `import readline from 'node:readline';
    const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
    out({ t: 'sessions.list' }); out({ t: 'panel', url: 'http://example.com/evil' }); out({ t: 'badge', count: -5 }); out({ t: 'queue', x: 1 });
    process.stdout.write('this is not json\\n');
    readline.createInterface({ input: process.stdin }).on('line', (l) => { const m = JSON.parse(l); if (m.t === 'hello') out({ t: 'notify', title: 'got ' + m.contract + ' ' + (m.sessions === undefined ? 'nosess' : 'SESS'), sub: m.stateDir, target: 'x' }); if (m.t === 'shutdown') process.exit(0); });`);
  // 곧바로 죽는 모듈
  fs.mkdirSync(path.join(tmp, 'mods4', 'crash'));
  fs.writeFileSync(path.join(tmp, 'mods4', 'crash', 'module.json'), JSON.stringify({ name: 'crash', contract: 1, grade: 0, version: '1', entry: 'index.mjs' }));
  fs.writeFileSync(path.join(tmp, 'mods4', 'crash', 'index.mjs'), 'process.exit(1);');
  // shutdown 을 무시하는 모듈(강제 종료 확인)
  fs.mkdirSync(path.join(tmp, 'mods4', 'stubborn'));
  fs.writeFileSync(path.join(tmp, 'mods4', 'stubborn', 'module.json'), JSON.stringify({ name: 'stubborn', contract: 1, grade: 0, version: '1', entry: 'index.mjs' }));
  fs.writeFileSync(path.join(tmp, 'mods4', 'stubborn', 'index.mjs'), 'process.stdin.resume(); setInterval(() => {}, 1000);');

  const host = new ModuleHost({ dir: path.join(tmp, 'mods4'), faceVersion: FACE, log: (m) => logs.push(m), onChange: () => changes++, onNotify: (n) => notes.push(n), restartDelayMs: 50, theme: () => ({ id: 'ember', mode: 'dark' }) });
  host.scan(); host.startAll();
  await sleep(1500);
  const by = () => Object.fromEntries(host.list().map(m => [m.name, m]));
  ok(by().hello.status === 'running' && typeof by().hello.pid === 'number', 'proc: hello 실행 중·pid 있음');
  ok(/^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{16}$/.test(by().hello.panel || ''), 'proc: hello 가 보낸 panel 주소(127.0.0.1+토큰) 반영');
  ok(by().hello.badge === 0, 'proc: hello 가 hello 응답으로 보낸 badge 0');
  ok(by().noisy.panel === null, 'proc: 127.0.0.1 이 아닌 panel 주소는 거부');
  ok(by().noisy.badge === 0, 'proc: 음수 badge 는 0 으로');
  ok(logs.some(l => /noisy.*dropped.*sessions\.list/.test(l)), 'proc: 모르는 말은 버리고 로그(dropped)');
  ok(logs.some(l => /noisy.*queue.*ignored/.test(l)), 'proc: queue 는 받되 무시(로그 ignored)');
  ok(logs.some(l => /noisy.*not json/.test(l)), 'proc: JSON 아닌 줄은 로그만');
  ok(notes.length === 1 && notes[0].module === 'noisy' && notes[0].title === 'got 1 nosess' && notes[0].sub === path.join(tmp, 'mods4', 'noisy', 'state') && notes[0].target === 'x', 'proc: hello 에 contract·stateDir 있고 sessions 없음 → notify 콜백');
  ok(fs.existsSync(path.join(tmp, 'mods4', 'noisy', 'state')), 'proc: stateDir 폴더를 코어가 만들어 둠');
  ok(by().crash.status === 'failed' && /3/.test(by().crash.reason), 'proc: 즉시 죽는 모듈 = 재시작 3회 뒤 failed');
  ok(host.mods.get('hello').proc.stdin.listenerCount('error') >= 1, 'proc: stdin error 리스너 등록');
  await host.stop('hello'); await sleep(100);
  ok(by().hello.status === 'stopped' && by().hello.panel === null && by().hello.pid === null, 'proc: stop → shutdown 으로 끝남·panel/pid 비움');
  const t0 = Date.now(); await host.stop('stubborn'); const dt = Date.now() - t0;
  ok(by().stubborn.status === 'stopped' && dt >= 1900 && dt < 4000, `proc: shutdown 무시 → 2초 뒤 그 PID 만 kill (${dt}ms)`);
  await host.stopAll();
  ok(by().crash.status === 'failed', 'proc: stopAll() 은 failed/incompatible 상태를 덮어쓰지 않음');
  ok(changes > 5, 'proc: onChange 가 전환마다 호출됨');

  // 재시작 대기 중 stop → 타이머 취소(고정 리뷰 1)
  {
    const flogs = [];
    const fd = path.join(tmp, 'mods4b', 'flappy'); fs.mkdirSync(fd, { recursive: true });
    fs.writeFileSync(path.join(fd, 'module.json'), JSON.stringify({ name: 'flappy', contract: 1, grade: 0, version: '1', entry: 'index.mjs' }));
    fs.writeFileSync(path.join(fd, 'index.mjs'), 'process.exit(1);');
    const fhost = new ModuleHost({ dir: path.join(tmp, 'mods4b'), faceVersion: FACE, log: (m) => flogs.push(m), restartDelayMs: 300 });
    fhost.scan(); fhost.start('flappy');
    await sleep(80);
    await fhost.stop('flappy');
    await sleep(500);
    const fby = Object.fromEntries(fhost.list().map(m => [m.name, m]));
    ok(fby.flappy.status === 'stopped' && fby.flappy.pid === null && flogs.filter(l => /module start flappy/.test(l)).length === 1, 'proc: 재시작 대기 중 stop → 타이머 취소, 새 프로세스 없음');
  }

  // healthyMs 이상 살면 restarts 초기화(고정 리뷰 1)
  {
    const slogs = [];
    const sd = path.join(tmp, 'mods4c', 'slowcrash'); fs.mkdirSync(sd, { recursive: true });
    fs.writeFileSync(path.join(sd, 'module.json'), JSON.stringify({ name: 'slowcrash', contract: 1, grade: 0, version: '1', entry: 'index.mjs' }));
    fs.writeFileSync(path.join(sd, 'index.mjs'), 'setTimeout(() => process.exit(1), 250);');
    const shost = new ModuleHost({ dir: path.join(tmp, 'mods4c'), faceVersion: FACE, log: (m) => slogs.push(m), restartDelayMs: 50, healthyMs: 100, restartMax: 3 });
    shost.scan(); shost.start('slowcrash');
    await sleep(1800);
    const sby = Object.fromEntries(shost.list().map(m => [m.name, m]));
    ok(sby.slowcrash.status !== 'failed' && slogs.filter(l => /module start slowcrash/.test(l)).length >= 4, 'proc: healthyMs 이상 살면 restarts 초기화(영구 failed 없음)');
    await shost.stop('slowcrash');
  }

  // 자기 포트(코어 자신의 HTTP 포트)로 panel 을 보내면 denyPorts 가 거부(F5)
  {
    const plogs = [];
    const pd = path.join(tmp, 'mods4d', 'selfport'); fs.mkdirSync(pd, { recursive: true });
    fs.writeFileSync(path.join(pd, 'module.json'), JSON.stringify({ name: 'selfport', contract: 1, grade: 0, version: '1', entry: 'index.mjs' }));
    fs.writeFileSync(path.join(pd, 'index.mjs'), `process.stdout.write(JSON.stringify({ t: 'panel', url: 'http://127.0.0.1:9458/x' }) + '\\n'); process.stdin.resume();`);
    const phost = new ModuleHost({ dir: path.join(tmp, 'mods4d'), faceVersion: FACE, log: (m) => plogs.push(m), denyPorts: [9458] });
    phost.scan(); phost.start('selfport');
    await sleep(400);
    const pby = Object.fromEntries(phost.list().map(m => [m.name, m]));
    ok(pby.selfport.panel === null && plogs.some(l => /selfport.*panel rejected \(own port\)/.test(l)), 'proc: 자기 포트 panel 거부');
    await phost.stop('selfport');
  }
}

// ---- 5) 설치: 경로·지문·서명·계약 ----
{
  const kp = generateKeyPair(); const KEYS = [{ id: 'test', pem: kp.publicPem }];
  const base = [{ name: 'module.json', data: Buffer.from(JSON.stringify({ name: 'inst', label: 'Inst', version: '1.2.3', contract: 1, grade: 0, minFace: '2.43.0', entry: 'index.mjs' })) }, { name: 'index.mjs', data: Buffer.from('process.stdin.resume();') }, { name: 'sub/a.txt', data: Buffer.from('a') }];
  const pack = (files, sign) => { const man = buildManifest(files); const text = JSON.stringify(man); const all = [...files, { name: 'manifest.json', data: Buffer.from(text) }]; if (sign) all.push({ name: 'manifest.sig', data: Buffer.from(signManifest(text, kp.privatePem)) }); return zipWrite(all); };
  const mdir = path.join(tmp, 'mods5');
  const good = pack(base, true);
  const FACE = '2.43.0';
  const r = inspectZip(good, { faceVersion: FACE, keys: KEYS });
  ok(r.errors.length === 0 && r.name === 'inst' && r.manifestOk && r.official && r.keyId === 'test', 'install: 서명된 zip 검사 통과');
  ok(inspectZip(pack(base, false), { faceVersion: FACE, keys: KEYS }).official === false, 'install: 서명 없음 → 비공식');
  const tampered = pack(base, true); const idx = tampered.indexOf(Buffer.from('process.stdin')); tampered.write('PROCESS', idx);
  ok(inspectZip(tampered, { faceVersion: FACE, keys: KEYS }).errors.some(e => /manifest mismatch/.test(e)), 'install: 파일 변조 → manifest mismatch');
  ok(inspectZip(pack([...base, { name: '../../daemon/server.mjs', data: Buffer.from('x') }], true), { faceVersion: FACE, keys: KEYS }).errors.some(e => /unsafe path/.test(e)), 'install: zip slip(../) 거부');
  ok(inspectZip(pack([...base, { name: 'C:\\\\evil.txt', data: Buffer.from('x') }], true), { faceVersion: FACE, keys: KEYS }).errors.some(e => /unsafe path/.test(e)), 'install: 절대경로 항목 거부');
  ok(inspectZip(pack(base.filter(f => f.name !== 'index.mjs'), true), { faceVersion: FACE, keys: KEYS }).errors.some(e => /entry/.test(e)), 'install: entry 없음 거부');
  ok(inspectZip(pack([{ ...base[0], data: Buffer.from(JSON.stringify({ name: 'inst', contract: 2, grade: 0, version: '1' })) }, base[1]], true), { faceVersion: FACE, keys: KEYS }).errors.some(e => /contract/.test(e)), 'install: 계약 v2 거부');
  ok(inspectZip(zipWrite(base), { faceVersion: FACE, keys: KEYS }).errors.some(e => /manifest\.json missing/.test(e)), 'install: manifest 없음 거부');
  ok(inspectZip(pack([...base, { name: '.official', data: Buffer.from('{}') }], false), { faceVersion: FACE, keys: KEYS }).errors.some(e => /reserved path/.test(e)), 'install: zip 안 .official 항목은 예약 이름으로 거부');
  ok(inspectZip(pack([...base, { name: 'state/x.txt', data: Buffer.from('x') }], false), { faceVersion: FACE, keys: KEYS }).errors.some(e => /reserved path/.test(e)), 'install: zip 안 state/ 항목 거부');
  ok(inspectZip(pack([...base, { name: './evil.txt', data: Buffer.from('x') }], true), { faceVersion: FACE, keys: KEYS }).errors.some(e => /unsafe path/.test(e)), 'install: "." 세그먼트 거부');
  ok(inspectZip(pack([...base, { name: '.official/x.txt', data: Buffer.from('x') }], false), { faceVersion: FACE, keys: KEYS }).errors.some(e => /reserved path/.test(e)), 'install: 중첩 .official/x 항목 거부');
  ok(inspectZip(pack([...base, { name: '.OFFICIAL', data: Buffer.from('x') }], false), { faceVersion: FACE, keys: KEYS }).errors.some(e => /reserved path/.test(e)) && inspectZip(pack([...base, { name: 'State/x.txt', data: Buffer.from('x') }], false), { faceVersion: FACE, keys: KEYS }).errors.some(e => /reserved path/.test(e)), 'install: 대소문자 다른 .OFFICIAL·State/ 거부');
  ok(inspectZip(pack([...base, { name: 'state.txt', data: Buffer.from('x') }], true), { faceVersion: FACE, keys: KEYS }).errors.length === 0, 'install: state.txt 같은 이름은 허용');
  ok(inspectZip(pack([...base, { name: '.official.', data: Buffer.from('{}') }], false), { faceVersion: FACE, keys: KEYS }).errors.some(e => /unsafe path/.test(e)) && inspectZip(pack([...base, { name: 'state /x.txt', data: Buffer.from('x') }], false), { faceVersion: FACE, keys: KEYS }).errors.some(e => /unsafe path/.test(e)), 'install: 끝에 점·공백이 붙은 세그먼트(.official. / state ./x) 거부');
  ok(
    inspectZip(pack([...base, { name: 'evil.txt:hidden', data: Buffer.from('x') }], true), { faceVersion: FACE, keys: KEYS }).errors.some(e => /unsafe path/.test(e)) &&
    inspectZip(pack([...base, { name: 'con.txt', data: Buffer.from('x') }], true), { faceVersion: FACE, keys: KEYS }).errors.some(e => /unsafe path/.test(e)) &&
    inspectZip(pack([...base, { name: 'sub/COM1', data: Buffer.from('x') }], true), { faceVersion: FACE, keys: KEYS }).errors.some(e => /unsafe path/.test(e)),
    'install: 콜론(ADS)·장치명 세그먼트 거부'
  );
  ok(inspectZip(pack([...base, { name: 'DUP.txt', data: Buffer.from('a') }, { name: 'dup.txt', data: Buffer.from('b') }], true), { faceVersion: FACE, keys: KEYS }).errors.some(e => /duplicate entry/.test(e)), 'install: 중복 항목 이름 거부(대소문자 무시)');
  let code = null; try { installZip(pack(base, false), { modulesDir: mdir, faceVersion: FACE, keys: KEYS }); } catch (e) { code = e.code; }
  ok(code === 'UNOFFICIAL' && !fs.existsSync(path.join(mdir, 'inst')), 'install: 비공식은 allowUnofficial 없이 설치 안 됨');
  let failed = false; try { installZip(pack([...base, { name: '.official', data: Buffer.from('{}') }], false), { modulesDir: mdir, faceVersion: FACE, keys: KEYS, allowUnofficial: true }); } catch { failed = true; }
  ok(failed && !fs.existsSync(path.join(mdir, 'inst.installing')), 'install: 거부된 zip 은 .installing 폴더를 남기지 않음');
  const res = installZip(pack(base, false), { modulesDir: mdir, faceVersion: FACE, keys: KEYS, allowUnofficial: true });
  ok(res.name === 'inst' && res.official === false && fs.existsSync(path.join(mdir, 'inst', 'sub', 'a.txt')) && !fs.existsSync(path.join(mdir, 'inst', '.official')), 'install: 동의하면 비공식 설치·.official 없음');
  fs.mkdirSync(path.join(mdir, 'inst', 'state'), { recursive: true }); fs.writeFileSync(path.join(mdir, 'inst', 'state', 'keep.txt'), 'keep');
  const res2 = installZip(good, { modulesDir: mdir, faceVersion: FACE, keys: KEYS });
  ok(res2.official === true && fs.existsSync(path.join(mdir, 'inst', '.official')) && fs.readFileSync(path.join(mdir, 'inst', 'state', 'keep.txt'), 'utf8') === 'keep', 'install: 공식으로 덮어쓰기 = .official 생성·state\\ 보존');
  ok(!fs.existsSync(path.join(mdir, 'inst.old')), 'install: 교체 뒤 .old 폴더 없음');
  const mdir2 = path.join(tmp, 'mods5b'); installZip(pack(base, false), { modulesDir: mdir2, faceVersion: FACE, keys: KEYS, allowUnofficial: true });
  const before = !fs.existsSync(path.join(mdir2, 'inst', '.official')); installZip(good, { modulesDir: mdir2, faceVersion: FACE, keys: KEYS });
  ok(before && fs.existsSync(path.join(mdir2, 'inst', '.official')), 'install: 추출 뒤 .official 은 서명 검증 분기에서만 생성');
  removeModule(mdir, 'inst');
  ok(!fs.existsSync(path.join(mdir, 'inst')), 'install: removeModule 로 폴더 삭제');
  let bad = false; try { removeModule(mdir, '../daemon'); } catch { bad = true; }
  ok(bad, 'install: removeModule 이름 규칙 위반 거부');
}

// ---- 7) 카탈로그(v2.53): 목록 읽기·합치기·릴리스 zip 내려받기(가짜 fetch, 바깥 연결 0) ----
{
  const { loadCatalog, mergeCatalog, fetchReleaseZip, ALLOWED_HOSTS } = await import('../daemon/catalog.mjs');
  const real = loadCatalog();
  ok(real.length >= 1 && real.every(c => /^[a-z][a-z0-9-]{1,31}$/.test(c.name) && /^https:\/\/api\.github\.com\//.test(c.release.api)), 'catalog: daemon/catalog.json 항목 = 이름 규칙 + api.github.com 릴리스 주소');
  const bad = path.join(tmp, 'bad-catalog.json');
  fs.writeFileSync(bad, JSON.stringify({ version: 1, modules: [
    { name: 'okmod', label: 'Ok', icon: 'bell', release: { api: 'https://api.github.com/repos/a/b/releases/latest' } },
    { name: 'Bad Name', release: { api: 'https://api.github.com/repos/a/b/releases/latest' } },
    { name: 'evilhost', release: { api: 'https://evil.example.com/releases/latest' } },
    { name: 'plainhttp', release: { api: 'http://api.github.com/repos/a/b/releases/latest' } },
  ] }), 'utf8');
  const filtered = loadCatalog(bad);
  ok(filtered.length === 1 && filtered[0].name === 'okmod' && filtered[0].release.asset === '\\.zip$', 'catalog: 이름 규칙 위반·허용 밖 호스트·http 항목 제외, asset 기본값');
  ok(loadCatalog(path.join(tmp, 'nope.json')).length === 0, 'catalog: 파일 없음 → 빈 목록(데몬 안 죽음)');
  const merged = mergeCatalog(filtered, [{ name: 'okmod', label: 'From module.json', icon: 'chat', version: '1.2.3', status: 'running', reason: '', official: true }, { name: 'extra', label: 'Extra', icon: 'plug', version: '0.1', status: 'stopped', reason: '', official: false }]);
  ok(merged.length === 2 && merged[0].installed && merged[0].catalog && merged[0].label === 'From module.json' && merged[0].icon === 'chat' && merged[0].version === '1.2.3', 'catalog: 설치된 모듈은 module.json 의 label·icon 우선 + 상태 합침');
  ok(merged[1].name === 'extra' && merged[1].installed && !merged[1].catalog, 'catalog: 카탈로그 밖 설치 모듈은 뒤에 catalog:false 로');
  ok(mergeCatalog(filtered, [])[0].installed === false && mergeCatalog(filtered, [])[0].version === undefined, 'catalog: 미설치 항목은 installed:false');

  // 가짜 fetch: api → 릴리스 JSON, github.com 자산 → 302 → objects.githubusercontent.com → 본문
  const zipBody = Buffer.from('PK-fake-zip');
  const mk = (status, body, headers = {}) => new Response(body, { status, headers });
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, redirect: opts?.redirect });
    if (url === 'https://api.github.com/repos/a/b/releases/latest') return mk(200, JSON.stringify({ tag_name: 'okmod--v1.4.0', assets: [{ name: 'okmod-v1.4.0.sha256', size: 64, browser_download_url: 'https://github.com/a/b/releases/download/x/okmod-v1.4.0.sha256' }, { name: 'okmod-v1.4.0.zip', size: zipBody.length, browser_download_url: 'https://github.com/a/b/releases/download/x/okmod-v1.4.0.zip' }] }), { 'content-type': 'application/json' });
    if (url === 'https://github.com/a/b/releases/download/x/okmod-v1.4.0.zip') return mk(302, null, { location: 'https://objects.githubusercontent.com/blob/okmod.zip' });
    if (url === 'https://objects.githubusercontent.com/blob/okmod.zip') return mk(200, zipBody, { 'content-length': String(zipBody.length) });
    if (url === 'https://api.github.com/repos/a/evil/releases/latest') return mk(200, JSON.stringify({ tag_name: 'v9', assets: [{ name: 'x.zip', size: 5, browser_download_url: 'https://github.com/a/evil/x.zip' }] }));
    if (url === 'https://github.com/a/evil/x.zip') return mk(302, null, { location: 'https://evil.example.com/x.zip' });
    if (url === 'https://api.github.com/repos/a/big/releases/latest') return mk(200, JSON.stringify({ tag_name: 'v1', assets: [{ name: 'big.zip', size: 999, browser_download_url: 'https://github.com/a/big/big.zip' }] }));
    if (url === 'https://api.github.com/repos/a/none/releases/latest') return mk(200, JSON.stringify({ tag_name: 'v1', assets: [{ name: 'readme.txt', size: 1, browser_download_url: 'https://github.com/a/none/readme.txt' }] }));
    if (url === 'https://api.github.com/repos/a/gone/releases/latest') return mk(404, '{}');
    return mk(500, 'unexpected ' + url);
  };
  const entry = { ...filtered[0], release: { api: 'https://api.github.com/repos/a/b/releases/latest', asset: '^okmod-v.*\\.zip$' } };
  const got = await fetchReleaseZip(entry, { fetchImpl: fakeFetch });
  ok(got.version === '1.4.0' && got.asset === 'okmod-v1.4.0.zip' && got.buf.equals(zipBody), 'catalog fetch: 태그 → 버전, 정규식으로 zip 자산 선택, 302 따라가 본문 수신');
  ok(calls.every(c => c.redirect === 'manual') && calls.every(c => ALLOWED_HOSTS.includes(new URL(c.url).hostname)), 'catalog fetch: 모든 홉이 redirect:manual + 허용 호스트');
  const rejects = async (e, re) => { try { await fetchReleaseZip(e, { fetchImpl: fakeFetch, maxBytes: 100 }); return false; } catch (err) { return re.test(err.message); } };
  ok(await rejects({ release: { api: 'https://api.github.com/repos/a/evil/releases/latest', asset: '\\.zip$' } }, /address not allowed/), 'catalog fetch: 허용 밖 호스트로 리다이렉트 → 거부');
  ok(await rejects({ release: { api: 'https://api.github.com/repos/a/big/releases/latest', asset: '\\.zip$' } }, /too large/), 'catalog fetch: 자산 크기 상한 초과 → 거부(내려받기 전)');
  ok(await rejects({ release: { api: 'https://api.github.com/repos/a/none/releases/latest', asset: '\\.zip$' } }, /no matching zip/), 'catalog fetch: 맞는 zip 없음 → 거부');
  ok(await rejects({ release: { api: 'https://api.github.com/repos/a/gone/releases/latest', asset: '\\.zip$' } }, /HTTP 404/), 'catalog fetch: 릴리스 조회 실패 → HTTP 상태 포함 오류');
  ok(await rejects({ release: { api: 'http://api.github.com/repos/a/b/releases/latest', asset: '\\.zip$' } }, /address not allowed/), 'catalog fetch: http 주소 → 거부');
}

// ---- 끝 ----
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
