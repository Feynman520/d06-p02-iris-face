// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 기록 파일을 찾고 읽는 코드가 함께 쓰는 작은 도구(에이전트와 상관없는 것만). 부르는 쪽 = transcript.mjs · sessions.mjs · agents/<id>.mjs
import fs from 'node:fs';

/** 폴더 경로 비교용: 슬래시 방향·끝 역슬래시·대소문자를 한 모양으로 */
export const normCwd = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

/** 긴 글 자르기(뒤에 남은 글자 수를 적는다) */
export const clip = (s, n) => (s && s.length > n ? s.slice(0, n) + `\n… (+${s.length - n}자)` : s || '');
/** 내용 칸(글자 · 블록 배열)에서 글만 뽑아 잇는다 */
export const textOf = (c) => {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(b => (typeof b === 'string' ? b : (b?.text ?? ''))).filter(Boolean).join('\n');
  return '';
};
export function safeJson(s) { if (typeof s !== 'string') return s; try { return JSON.parse(s); } catch { return { raw: s }; } }
/** 도구 호출의 입력을 한 줄로 */
export function summarizeInput(name, input) {
  if (!input || typeof input !== 'object') return typeof input === 'string' ? clip(input, 300) : '';
  const first = input.command || input.cmd || input.file_path || input.path || input.pattern || input.query || input.url || input.description || input.prompt || input.raw;
  if (typeof first === 'string') return clip(first, 300);
  if (Array.isArray(first)) return clip(first.join(' '), 300);
  const keys = Object.keys(input); if (!keys.length) return '';
  return clip(keys.map(k => `${k}=${typeof input[k] === 'string' ? input[k] : JSON.stringify(input[k])}`).join(' · '), 300);
}
/** 파일의 첫 줄(64KB 안에서). 줄바꿈이 없으면 파일이 그보다 짧을 때만 통째로, 아니면 '' */
export function readFirstLine(file) {
  const fd = fs.openSync(file, 'r');
  try { const buf = Buffer.alloc(64 * 1024); const n = fs.readSync(fd, buf, 0, buf.length, 0); const s = buf.subarray(0, n).toString('utf8'); const i = s.indexOf('\n'); return i >= 0 ? s.slice(0, i) : (n < buf.length ? s : ''); }
  finally { fs.closeSync(fd); }
}
