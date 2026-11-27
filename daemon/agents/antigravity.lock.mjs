// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 안티그래비티 화면 잠금 — 판정은 이 파일 한 곳(2026-11-27 사용자 결정: "프론트엔드에서 안티그래비티만 전부 비활성 … 검증이 끝나면 이것만 풀면 된다").
//   뜻       일반 PC 에서 Antigravity 는 "보이지만 쓸 수 없고 「곧 열립니다」". 코드는 전부 실려 있고 잠들 뿐이다. 클로드 · 코덱스는 이 파일을 모른다.
//   잠금 값  'locked' | 'open'. 기본값은 antigravity.mjs 의 lockDefault 한 줄 — 그 줄을 'open' 으로 바꾸면 모든 PC 에서 열린다(푸는 값은 그 하나).
//   열쇠     <영혼 루트>\_agent\setup\iris-keys.json 의 "antigravity": "open" — **정확히 그 글자일 때만** 연다.
//            파일 없음 · 읽기 실패 · 깨진 JSON · 다른 값 = 기본값 그대로. 비밀이 아니라 스위치다(보안 장치가 아니다 — 아는 사람은 켤 수 있다).
//   읽는 때  처음 물을 때 한 번(데몬은 켜지자마자 묻는다 — server.mjs). 그 값을 끝까지 쓴다. 도는 중에 파일이 바뀌어도 따라가지 않는다(반영 = 다시 켤 때).
//   시험     IRIS_FACE_STATE 가 정해져 있으면 그 폴더의 iris-keys.json 만 본다 — 진짜 영혼의 열쇠는 절대 보지 않는다. 환경 변수로 여는 길은 만들지 않는다.
// 잠겨 있으면 하지 않는 것: 세션 열기 · 바꾸기 · 재개(antigravity.mjs preTrust, server.mjs agyGateReady) · agy 실행 · 한도 조회 · 모델 목록 갱신 ·
//   중계기에 구글 상태 묻기 · ~/.gemini 에 지침 · 훅 · 신뢰 폴더 쓰기 · 상태 파일 쓰기 · 기록 폴더 만들기 · 전용 타이머. 검사 = npm run verify:agy-lock.
// 이 파일은 불러오는 것만으로 아무것도 읽지 않는다(antigravity.mjs 와 서로 불러오므로 맨 위에서 값을 쓰지 않는다 — 함수 안에서만).
import fs from 'node:fs';
import path from 'node:path';
import { soulRoot } from '../paths.mjs';
import { lockDefault } from './antigravity.mjs';

export const KEY_FILE_NAME = 'iris-keys.json';
export const LOCK_ID = 'antigravity';
/** 거절할 때 화면에 보이는 글(세션 열기 · 바꾸기 · 재개 · 직접 요청) */
export const LOCKED_MESSAGE = 'Antigravity 는 아직 열리지 않았습니다. 곧 열립니다.';

/** 열쇠 파일의 자리. 시험 데몬(IRIS_FACE_STATE)은 그 상태 폴더 아래만 본다. */
export function keyFile(env = process.env) {
  if (env.IRIS_FACE_STATE) return path.join(env.IRIS_FACE_STATE, KEY_FILE_NAME);
  return path.join(soulRoot(), '_agent', 'setup', KEY_FILE_NAME);
}

/** 열쇠 파일의 글이 여는 글인가(순수 함수). 정확히 { "antigravity": "open" } 꼴일 때만 true — 그 밖은 전부 false. */
export function keyOpens(text) {
  if (typeof text !== 'string') return false;
  let j; try { j = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); } catch { return false; }
  return !!j && typeof j === 'object' && !Array.isArray(j) && Object.hasOwn(j, LOCK_ID) && j[LOCK_ID] === 'open';
}

/**
 * 잠금 판정(순수 함수): 기본값이 정확히 'open' 이면 열림, 아니면 열쇠가 열 때만 열림.
 * @returns {{ state: 'locked'|'open', source: 'default'|'key' }}
 */
export function judgeLock(def, keyText) {
  if (def === 'open') return { state: 'open', source: 'default' };
  return keyOpens(keyText) ? { state: 'open', source: 'key' } : { state: 'locked', source: 'default' };
}

let decided = null; // { state, source, at } — 한 번 정하면 프로세스가 끝날 때까지 그대로
/** 이 프로세스의 잠금 판정(처음 부를 때 한 번 읽는다) */
export function lockInfo() {
  if (decided) return decided;
  let text = null;
  if (lockDefault !== 'open') { try { text = fs.readFileSync(keyFile(), 'utf8'); } catch { text = null; } } // 기본값이 열림이면 열쇠를 읽을 일이 없다
  decided = Object.freeze({ ...judgeLock(lockDefault, text), at: new Date().toISOString() });
  return decided;
}
/** 잠겨 있는가 */
export const isLocked = () => lockInfo().state !== 'open';
/** 잠겼을 때 화면 · 조회에 내는 상태(처음부터 이 값 — unknown 을 거치지 않는다). groups 는 한도 묶음 자리(늘 빈 목록). */
export const lockedStatus = () => ({ state: 'locked', groups: [], at: lockInfo().at, detail: '' });
/** 거절 오류(code = AGY_LOCKED) */
export function lockedError() { const e = new Error(LOCKED_MESSAGE); e.code = 'AGY_LOCKED'; return e; }
/** 잠겨 있으면 던진다 — 세션을 띄우는 길의 문턱 */
export function assertOpen() { if (isLocked()) throw lockedError(); }
