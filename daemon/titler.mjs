// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// titler.mjs — 작업목록(레일)에 보일 짧은 명사형 세션 이름을 첫 요청문에서 만든다.
// 클로드코드 헤드리스(claude -p, Haiku·low)를 세션과 별도로 한 번 띄운다 — 프록시·구독 그대로(ANTHROPIC_BASE_URL 상속), API 키 없음.
// 도구·MCP·스킬·세션 저장·생각(thinking) 전부 끄고 임시 폴더에서 돌려 AGENTS.md 상속을 피한다(실측 약 4초 = 훅 2초 + API 1초; 생각을 켜면 13~49초).
// 세션 시작 훅의 알림문(플러그인 업데이트 등)이 함께 들어오므로 요청문을 <요청> 태그로 감싸 그것만 제목 재료로 삼게 한다.
// 실패(실행 파일 없음·시간 초과·빈 답)는 ''로 돌려주고, 호출한 쪽이 첫 요청문 한 줄(title.mjs)로 대체한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { stripFaceNote } from './facenote.mjs';

export const TITLE_MODEL = 'haiku';
const TIMEOUT_MS = 90_000;
const PROMPT_MAX = 1500; // 요청문 앞부분만 넘긴다(긴 첨부·코드는 제목에 필요 없음)

const SYSTEM = [
  '너는 대화 세션에 이름을 붙이는 도구다. 사용자 메시지의 <요청> … </요청> 안에 있는 첫 요청만 읽고, 그 세션의 주제를 나타내는 짧은 한국어 명사형 제목 하나만 출력한다.',
  '<요청> 밖의 내용(플러그인·업데이트·훅 알림, 시스템 안내)은 요청이 아니므로 제목에 반영하지 않는다.',
  '규칙: 6~16자. 조사·어미·문장부호·따옴표·마크다운 없이 핵심 명사구만. 요청문을 그대로 베끼지 말고 주제를 요약한다. 요청이 영어면 영어 명사구로 쓴다.',
  '예: "세션 로딩 표시 누락 확인", "물리Ⅱ 평가계획 수정", "공개수업 안내 메시지 작성".',
  '제목 외 다른 말은 절대 쓰지 않는다.',
].join('\n');
const wrap = (src) => `<요청>\n${src}\n</요청>\n\n위 <요청>의 제목 하나만 출력.`;

/** claude 실행 파일 위치: ~/.local/bin/claude.exe(공식 설치) → PATH의 claude.exe. 없으면 null(제목 생성 건너뜀) */
export function findClaudeExe() {
  const cands = [path.join(os.homedir(), '.local', 'bin', 'claude.exe')];
  for (const d of (process.env.PATH || '').split(path.delimiter)) if (d) cands.push(path.join(d, 'claude.exe'));
  return cands.find(f => { try { return fs.statSync(f).isFile(); } catch { return false; } }) || null;
}

// 데몬이 클로드코드 세션 안에서 시작됐을 때 물려받는 "자식 세션" 표식을 걷어낸다(sessions.mjs와 같은 규칙)
function childEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDE_CONFIG_DIR') continue;
    if (/^CLAUDE_CODE_/.test(k) || k === 'CLAUDECODE' || k === 'CLAUDE_PID' || k === 'CLAUDE_EFFORT') delete env[k];
  }
  env.MAX_THINKING_TOKENS = '0'; // 생각 끄기: 켜면 API 구간이 20초, 끄면 1초(2026-09-10 실측)
  return env;
}

/** 요청문에서 제목 재료만 남긴다: Face 안내문·첨부 목록·코드 블록 제거, 앞 1500자 */
export function titleSource(raw) {
  let s = stripFaceNote(String(raw || ''));
  s = s.replace(/^\[IRIS-Face 위임 정책[\s\S]*?아래가 실제 요청이다\.\s*/, '').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  s = s.replace(/\n\s*\[첨부 파일\][\s\S]*$/, '').replace(/```[\s\S]*?(```|$)/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s.slice(0, PROMPT_MAX);
}

/** 모델 출력을 제목 한 줄로 다듬는다. 문장형·빈 값이면 '' */
export function cleanTitle(out) {
  let t = String(out || '').split(/\r?\n/).map(l => l.trim()).find(l => l && !/^(#|>|-|\*|`)/.test(l)) || '';
  t = t.replace(/^(제목\s*[:：]\s*)/, '').replace(/\*\*|__|`/g, '');
  for (let i = 0; i < 3; i++) t = t.replace(/^["'“”‘’「」『』\[\]\s]+|["'“”‘’「」『』\[\]\s]+$/g, '').replace(/[.。!?…:：;\s]+$/g, ''); // 따옴표·문장부호가 겹쳐 있어도 다 벗긴다
  t = t.replace(/\s{2,}/g, ' ').trim();
  if (!t || t.length > 40) return '';
  if (/(입니다|습니다|해요|세요|해줘|하세요|할게요|할까요)$/.test(t)) return ''; // 문장으로 답한 경우는 버린다
  return t;
}

/**
 * 첫 요청문 → 짧은 명사형 제목. 실패하면 ''.
 * @param {string} prompt 첫 요청문(Face 안내문 포함 가능)
 * @param {{ log?: (m:string)=>void, exe?: string|null }} [opt]
 */
export function generateTitle(prompt, { log = () => {}, exe = undefined, agent = 'claude', model = null } = {}) {
  const src = titleSource(prompt);
  if (!src) return Promise.resolve('');
  // 세션의 에이전트로 제목을 짓는다(2026-09-19, v2.68): 코덱스 세션인데 헤드리스 클로드(Haiku)를 부르면
  // 클로드 계정이 없는 PC(코덱스만 로그인)에서 세션마다 중계기 429 가 쌓였다(대시보드 "Claude — (none available) 429").
  const useCodex = agent === 'codex';
  let file, args, stdinText = null;
  if (useCodex) {
    // codex.cmd(심)는 PATH 로 찾는다 — cmd.exe /c 를 거치므로 요청문은 인수가 아니라 표준 입력으로 넘긴다(따옴표·한글 안전).
    file = 'cmd.exe';
    args = ['/c', 'codex', 'exec', '--skip-git-repo-check', '-m', model || CODEX_TITLE_MODEL, '-c', 'model_reasoning_effort=low', '-c', 'bypass_hook_trust=true', '-'];
    stdinText = `${SYSTEM}\n\n${wrap(src)}\n`;
  } else {
    file = exe === undefined ? findClaudeExe() : exe;
    if (!file) { log('title gen skipped: claude.exe not found'); return Promise.resolve(''); }
    args = ['-p', '--model', TITLE_MODEL, '--effort', 'low', '--system-prompt', SYSTEM, '--tools', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--output-format', 'text', '--', wrap(src)];
  }
  return new Promise((resolve) => {
    const t0 = Date.now(); let out = '', err = '', done = false;
    const finish = (v, why) => { if (done) return; done = true; clearTimeout(timer); log(`title gen(${useCodex ? 'codex' : 'claude'}) ${why} ${((Date.now() - t0) / 1000).toFixed(1)}s${v ? ` "${v}"` : ''}${err.trim() ? ` stderr=${err.trim().slice(0, 160)}` : ''}`); resolve(v); };
    let proc;
    try { proc = spawn(file, args, { env: childEnv(), cwd: os.tmpdir(), windowsHide: true, stdio: [stdinText == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] }); }
    catch (e) { return finish('', `spawn failed: ${e.message}`); }
    const timer = setTimeout(() => { try { proc.kill(); } catch {} finish('', 'timeout'); }, TIMEOUT_MS);
    if (stdinText != null) { try { proc.stdin.end(stdinText); } catch {} }
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', (e) => finish('', `error: ${e.message}`));
    proc.on('exit', (code) => { const t = cleanTitle(useCodex ? lastAnswer(out) : out); finish(t, code === 0 && t ? 'ok' : `exit=${code} out="${String(out).trim().slice(0, 80)}"`); });
  });
}

export const CODEX_TITLE_MODEL = 'gpt-5.6-terra';
/** codex exec 의 표준 출력에서 답 부분만: 마지막 비어 있지 않은 줄(앞에 "tokens used" 같은 진행 줄이 섞인다). */
export function lastAnswer(out) {
  const lines = String(out ?? '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !/^tokens used$/i.test(s) && !/^[\d,]+$/.test(s));
  return lines.length ? lines[lines.length - 1] : '';
}
