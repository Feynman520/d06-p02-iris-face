// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// verify:agy-lock 의 기록기 — 시험 데몬에 먼저 불러온다(node --import). 동작은 바꾸지 않고 적기만 한다:
//   바깥 요청(fetch) · 프로세스 실행 · 타이머 등록 · 파일 쓰기(폴더 만들기 포함). 한 줄 = JSON 하나, 파일 = 환경 변수 AGYLOCK_TRACE.
// 이 기록으로 "잠긴 데몬은 안티그래비티 전용 실행 · 조회 · 쓰기 · 타이머가 0" 을 세고, 열쇠가 있는 데몬에서는 같은 기록기가 그것들을 실제로 잡는지(대조) 본다.
import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const OUT = process.env.AGYLOCK_TRACE;
if (OUT) {
  const append = fs.appendFileSync.bind(fs); // 감싸기 전의 것(기록이 기록을 부르지 않게)
  // 적는 동안 생기는 쓰기(appendFileSync 는 안에서 writeFileSync 를 부른다)는 다시 적지 않는다
  let busy = false;
  const put = (o) => { if (busy) return; busy = true; try { append(OUT, JSON.stringify(o) + '\n', 'utf8'); } catch {} finally { busy = false; } };
  const realFetch = globalThis.fetch;
  globalThis.fetch = function (u, ...rest) { put({ t: 'fetch', url: String(u?.url || u) }); return realFetch.call(this, u, ...rest); };
  for (const fn of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync']) {
    const orig = cp[fn];
    cp[fn] = function (file, ...rest) { put({ t: 'proc', fn, file: String(file), args: Array.isArray(rest[0]) ? rest[0].map(String).slice(0, 8) : [] }); return orig.call(this, file, ...rest); };
  }
  const where = () => (new Error().stack || '').split('\n').slice(3, 6).map((l) => l.trim()).join(' | ');
  for (const fn of ['setTimeout', 'setInterval']) {
    const orig = globalThis[fn];
    const wrapped = function (cb, ms, ...rest) { put({ t: 'timer', fn, ms: Number(ms) || 0, name: cb?.name || '', src: String(cb).slice(0, 200), at: where() }); return orig.call(this, cb, ms, ...rest); };
    for (const k of Reflect.ownKeys(orig)) { if (k === 'length' || k === 'name' || k === 'prototype') continue; try { Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(orig, k)); } catch {} }
    globalThis[fn] = wrapped;
  }
  for (const [fn, idx] of Object.entries({ writeFileSync: 0, appendFileSync: 0, mkdirSync: 0, renameSync: 1, copyFileSync: 1 })) {
    const orig = fs[fn];
    fs[fn] = function (...a) { put({ t: 'write', fn, path: String(a[idx]) }); return orig.apply(this, a); };
  }
  syncBuiltinESMExports();
}
