// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// Windows에서 .cmd 셸 심(claude·codex)을 인용 안전하게 실행하는 공용 도우미.
// node의 shell:true 는 인자를 이어 붙이기만 하므로 공백·한글 경로를 직접 따옴표로 감싼다. 인자 안의 큰따옴표·줄바꿈은 제거한다.
import { spawn } from 'node:child_process';

export function quoteArg(a) {
  const s = String(a).replace(/[\r\n]+/g, ' ').replace(/"/g, "'");
  return /[\s&|<>^()]/.test(s) || s === '' ? `"${s}"` : s;
}

/** @returns {import('node:child_process').ChildProcess} */
export function spawnCmd(exe, args, { cwd, env = process.env, stdin = 'ignore' } = {}) {
  const line = [exe, ...args.map(quoteArg)].join(' ');
  return spawn(line, [], { cwd, env, windowsHide: true, shell: true, stdio: [stdin, 'pipe', 'pipe'] });
}
