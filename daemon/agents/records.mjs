// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 기록 해석 명부 — 에이전트 id → 기록 해석 어댑터(<id>.records.mjs). 새 에이전트 = 그 파일 하나 + 아래 한 줄.
// 실행 쪽 명부(index.mjs)와 따로 둔다: 기록을 읽는 코드(transcript.mjs)가 실행 설정(설정 폴더 자리 계산)을 끌고 오지 않게.
// 어댑터가 내놓는 것: parseRecord(tail, r) · turnState(tail) · contextWindowGuess(model)(추정할 것이 있는 에이전트만)
import * as claude from './claude.records.mjs';
import * as codex from './codex.records.mjs';
import * as antigravity from './antigravity.records.mjs';
import { strictIn, orDefaultIn } from './select.mjs';

export const RECORD_ADAPTERS = Object.freeze({ claude, codex, antigravity });
export const strictRecordAdapter = strictIn(RECORD_ADAPTERS);
/** 값이 없으면 기본(명부의 첫째) 해석기, 명부에 있으면 그 해석기, 명부에 없는 값이면 null(그 기록은 읽지 않는다) */
export const recordAdapterFor = orDefaultIn(RECORD_ADAPTERS);
