// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 클로드가 새 대화 번호로 재시작했을 때 기록 따라가기(sessions.mjs findRelaunchedRecord, v2.99) 무접촉 검사 — 임시 폴더만 쓴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findRelaunchedRecord } from '../daemon/sessions.mjs';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-relaunch-'));
const dir = path.join(tmp, 'C--IRIS');
fs.mkdirSync(dir, { recursive: true });
const cwd = 'C:\\IRIS';
const id = (n) => `${String(n).padStart(8, '0')}-1111-2222-3333-444444444444`;
const rec = (name, c = cwd) => {
  const file = path.join(dir, `${name}.jsonl`);
  fs.writeFileSync(file, [
    JSON.stringify({ type: 'mode', mode: 'normal', sessionId: name }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' }, cwd: c, sessionId: name }),
  ].join('\n') + '\n', 'utf8');
  return file;
};

// 1. 이 세션보다 먼저 있던 기록은 후보가 아니다
rec(id(1));
const since = Date.now() + 5000; // "세션 시작"을 미래로 둬 1번 파일을 '먼저 있던 것'으로 만든다
ok(findRelaunchedRecord({ dir, cwd, since }) === null, '먼저 있던 기록은 고르지 않음');

// 2. 시작 뒤 생긴 기록 하나 → 그것
const since2 = Date.now() - 1000;
fs.rmSync(path.join(dir, `${id(1)}.jsonl`));
const f2 = rec(id(2));
const r2 = findRelaunchedRecord({ dir, cwd, since: since2 });
ok(r2 && r2.file === f2 && r2.sessionId === id(2), '새로 생긴 기록 하나 = 따라감');

// 3. 대소문자·끝 구분자 다른 cwd 도 같은 폴더
ok(findRelaunchedRecord({ dir, cwd: 'c:\\iris\\', since: since2 })?.sessionId === id(2), 'cwd 대소문자·끝 역슬래시 무시');

// 4. 다른 세션이 이미 쓰는 기록(known)은 제외
ok(findRelaunchedRecord({ dir, cwd, since: since2, known: new Set([f2.toLowerCase()]) }) === null, '다른 카드가 쓰는 기록은 제외');

// 5. 다른 cwd 기록은 제외
rec(id(3), 'C:\\IRIS\\R01');
ok(findRelaunchedRecord({ dir, cwd, since: since2 })?.sessionId === id(2), '다른 폴더 기록은 제외');

// 6. 후보 둘이면 고르지 않는다
rec(id(4));
ok(findRelaunchedRecord({ dir, cwd, since: since2 }) === null, '후보 둘 = 고르지 않음');

// 7. cwd 줄이 아직 없는(막 생긴) 기록·이름이 번호가 아닌 파일은 제외
fs.rmSync(path.join(dir, `${id(4)}.jsonl`));
fs.writeFileSync(path.join(dir, `${id(5)}.jsonl`), JSON.stringify({ type: 'mode', sessionId: id(5) }) + '\n');
fs.writeFileSync(path.join(dir, 'notes.jsonl'), JSON.stringify({ cwd }) + '\n');
ok(findRelaunchedRecord({ dir, cwd, since: since2 })?.sessionId === id(2), 'cwd 없는 기록·번호 아닌 이름은 제외');

// 8. 폴더가 없으면 null(던지지 않음)
ok(findRelaunchedRecord({ dir: path.join(tmp, 'none'), cwd, since: since2 }) === null, '폴더 없음 = null');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
