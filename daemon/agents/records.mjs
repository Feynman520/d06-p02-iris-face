// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 기록 해석 명부 — 에이전트 id → 기록 해석 어댑터(<id>.records.mjs). 새 에이전트 = 그 파일 하나 + 아래 한 줄.
// 실행 쪽 명부(index.mjs)와 따로 둔다: 기록을 읽는 코드(transcript.mjs)가 실행 설정(설정 폴더 자리 계산)을 끌고 오지 않게.
// 어댑터가 내놓는 것: parseRecord(tail, r) · turnState(tail) · contextWindowGuess(model)(추정할 것이 있는 에이전트만)
import * as claude from './claude.records.mjs';
import * as codex from './codex.records.mjs';
import { strictIn, elseClaudeIn } from './select.mjs';

export const RECORD_ADAPTERS = Object.freeze({ claude, codex });
export const strictRecordAdapter = strictIn(RECORD_ADAPTERS);
export const legacyElseClaudeRecord = elseClaudeIn(RECORD_ADAPTERS);
