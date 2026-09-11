// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// installer Task 16 — applyReceiptEnv() 무접촉 검사.
//   실제 package-receipt.json 파일은 절대 건드리지 않는다(이 PC는 영수증 없음이 정상) —
//   applyReceiptEnv(env, receipt) 의 receipt 인자로 가짜 영수증 객체를 직접 주입해서 시험한다.
import path from 'node:path';
import { applyReceiptEnv } from '../daemon/sessions.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

// 1) 영수증 없음(null) → env 그대로(이 PC의 현재 상태)
{
  const before = { FOO: 'bar', PATH: 'C:\\Windows;C:\\Windows\\System32' };
  const after = applyReceiptEnv({ ...before }, null);
  ok(JSON.stringify(after) === JSON.stringify(before), '영수증 없음: env 무변경(현행 그대로)');
}

// 2) 영수증 있음, 필드 비어 있음 → 채워짐 + PATH 앞에 shims·node 붙음
{
  const receipt = { env: { CLAUDE_CONFIG_DIR: 'C:\\NOVA\\_agent\\claude', CODEX_HOME: 'C:\\NOVA\\_agent\\codex', ANTHROPIC_BASE_URL: 'http://127.0.0.1:3456' } };
  const before = { PATH: 'C:\\Windows;C:\\Windows\\System32' };
  const after = applyReceiptEnv({ ...before }, receipt);
  ok(after.CLAUDE_CONFIG_DIR === receipt.env.CLAUDE_CONFIG_DIR, '영수증 있음: CLAUDE_CONFIG_DIR 채워짐');
  ok(after.CODEX_HOME === receipt.env.CODEX_HOME, '영수증 있음: CODEX_HOME 채워짐');
  ok(after.ANTHROPIC_BASE_URL === receipt.env.ANTHROPIC_BASE_URL, '영수증 있음: ANTHROPIC_BASE_URL 채워짐');
  const parts = after.PATH.split(path.delimiter);
  ok(parts[0].toLowerCase().endsWith(path.join('_agent', 'shared', 'shims').toLowerCase()), 'PATH 맨 앞 = <root>\\_agent\\shared\\shims');
  ok(parts[1].toLowerCase().endsWith(path.join('_agent', 'shared', 'tools', 'node').toLowerCase()), '두 번째 = <tools>\\node');
  ok(after.PATH.endsWith(before.PATH), '원래 PATH 는 뒤에 그대로 보존');
}

// 3) 영수증 있지만 이미 값이 있는 env(설치기 이전에 사용자가 이미 세팅) → 덮어쓰지 않음(없을 때만 채운다)
{
  const receipt = { env: { CLAUDE_CONFIG_DIR: 'C:\\NOVA\\_agent\\claude', ANTHROPIC_BASE_URL: 'http://127.0.0.1:3456' } };
  const before = { CLAUDE_CONFIG_DIR: 'C:\\IRIS\\_agent\\claude', PATH: 'C:\\Windows' };
  const after = applyReceiptEnv({ ...before }, receipt);
  ok(after.CLAUDE_CONFIG_DIR === 'C:\\IRIS\\_agent\\claude', '이미 있는 CLAUDE_CONFIG_DIR 은 덮어쓰지 않음');
  ok(after.ANTHROPIC_BASE_URL === receipt.env.ANTHROPIC_BASE_URL, '없던 ANTHROPIC_BASE_URL 은 채움');
}

// 4) 같은 env 에 두 번 적용해도 PATH 가 계속 늘어나지 않음(dedupe) — 실제 soulRoot() 기준 shims·node 가 이미 들어간 뒤 재적용
{
  const receipt = { env: {} };
  const before = { PATH: 'C:\\Windows;C:\\Windows\\System32' };
  const after1 = applyReceiptEnv({ ...before }, receipt);
  const after2 = applyReceiptEnv({ ...after1 }, receipt);
  ok(JSON.stringify(after1) === JSON.stringify(after2), '두 번 적용해도 PATH 가 계속 늘어나지 않음(dedupe, 대소문자 무시)');
}

// 5) Windows 대문자 아닌 'Path' 키(스프레드 결과에서 흔함)도 case-insensitive 로 찾아 처리
{
  const receipt = { env: { CODEX_HOME: 'C:\\NOVA\\_agent\\codex' } };
  const before = { Path: 'C:\\Windows' };
  const after = applyReceiptEnv({ ...before }, receipt);
  ok(after.CODEX_HOME === receipt.env.CODEX_HOME, "'Path'(대문자 아님) 키에서도 CODEX_HOME 채움");
  ok(!('PATH' in after) && typeof after.Path === 'string' && after.Path.endsWith('C:\\Windows'), "기존 'Path' 키 이름 그대로 갱신(새 PATH 키를 만들지 않음)");
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
