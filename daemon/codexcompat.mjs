// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 코덱스 옛 대화 재개 호환(v2.98, 2026-11-04 다른 선생님 신고).
//
// 왜: 코덱스는 대화마다 "어느 연결(model_provider)로 만들었는지"를 두 곳에 적는다 —
//   ① 대화 기록 파일(sessions\…\rollout-…-<id>.jsonl) 첫 줄 session_meta.payload.model_provider
//   ② 목록 데이터베이스(state_5.sqlite) threads.model_provider  ← 재개 검사는 이쪽을 본다(2026-11-04 실측)
// 설치 패키지 2.0.49 가 코덱스 연결을 기본 'openai'(가로채기 프록시) → 'iris'(중계기 주소 직접 지정)로 바꾸자,
// 그 전에 만든 대화는 "This chat uses openai, but your current provider is iris." 로 재개가 거절됐다(종료 코드 1).
// 기본 'openai' 로 되돌려 여는 길은 쓰지 않는다 — openai_base_url 을 중계기로 돌려도 웹소켓·workspace routing
// discovery 가 chatgpt.com 으로 곧장 나가 중계기를 건너뛴다(2026-11-04 가짜 중계기 실측).
// 그래서: 지금 연결이 **이 PC 의 중계기**(base_url 이 127.0.0.1/localhost)일 때만, 재개 직전에 그 대화의 연결 이름을
// 지금 이름으로 맞춘다. 원본 기록 파일은 먼저 통째로 백업하고 바꾼 내역을 history.jsonl 에 남긴다(토큰·대화 내용은 적지 않는다).
// 실측: 두 곳을 맞춘 사본이 실제 중계기를 거쳐 "OK" 로 답했다(로그인 파일 불변).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// node:sqlite 는 Node 22.13+/24 에 있다. 없거나 막혔으면 DB 는 건너뛰고(재개 검사가 DB 를 보므로) 이유를 화면에 보인다.
function sqlite() { try { return require('node:sqlite'); } catch { return null; } }

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
export const BACKUP_DIR_NAME = path.join('iris-backup', 'provider-align');

/** config.toml 에서 최상위 model_provider(없으면 'openai')와 그 provider 의 base_url 을 읽는다. 파일이 없으면 기본값. */
export function currentProvider(codexHome, { fsImpl = fs } = {}) {
  let text = '';
  try { text = fsImpl.readFileSync(path.join(codexHome, 'config.toml'), 'utf8'); } catch { /* 기본값 */ }
  const top = text.split(/^\s*\[/m)[0];
  const m = top.match(/^\s*model_provider\s*=\s*["']([^"']+)["']/m);
  const id = m ? m[1] : 'openai';
  let baseUrl = null;
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sec = text.match(new RegExp(`^\\s*\\[model_providers\\.(?:"${esc}"|${esc})\\]\\s*$([\\s\\S]*?)(?=^\\s*\\[|(?![\\s\\S]))`, 'm'));
  if (sec) { const b = sec[1].match(/^\s*base_url\s*=\s*["']([^"']+)["']/m); if (b) baseUrl = b[1]; }
  return { id, baseUrl };
}

/** base_url 이 이 PC 안(중계기)인가. */
export function isLocalRelay(baseUrl) {
  try { return LOCAL_HOSTS.has(new URL(baseUrl).hostname.toLowerCase()); } catch { return false; }
}

function openDb(file, { readOnly }) {
  if (!fs.existsSync(file)) return null;
  try {
    const { DatabaseSync } = sqlite() || {};
    if (!DatabaseSync) return null;
    const db = new DatabaseSync(file, { readOnly });
    try { db.exec('PRAGMA busy_timeout = 3000'); } catch { /* 읽기 전용이면 무시 */ }
    return db;
  } catch { return null; }
}

/** sessions\ 와 archived_sessions\ 아래에서 rollout-…-<id>.jsonl 을 찾는다(목록 DB 에 없을 때). */
export function findRollout(codexHome, threadId, { fsImpl = fs } = {}) {
  const suffix = `-${threadId}.jsonl`;
  const walk = (dir, depth) => {
    let ents; try { ents = fsImpl.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith(suffix)) return p;
      if (e.isDirectory() && depth < 4) { const r = walk(p, depth + 1); if (r) return r; }
    }
    return null;
  };
  return walk(path.join(codexHome, 'sessions'), 0) || walk(path.join(codexHome, 'archived_sessions'), 0);
}

function readFirstLine(file) {
  const b = fs.readFileSync(file);
  const nl = b.indexOf(0x0a);
  return { bytes: b, nl, first: nl < 0 ? b.toString('utf8') : b.subarray(0, nl).toString('utf8') };
}

/** 이 대화가 어느 연결로 만들어졌는지(DB 우선, 없으면 기록 파일 첫 줄). → { provider, rollout, inDb } */
export function threadProvider(codexHome, threadId) {
  let provider = null, rollout = null, inDb = false;
  const db = openDb(path.join(codexHome, 'state_5.sqlite'), { readOnly: true });
  if (db) {
    try {
      const row = db.prepare('SELECT model_provider, rollout_path FROM threads WHERE id = ?').get(threadId);
      if (row) { provider = row.model_provider ?? null; rollout = row.rollout_path || null; inDb = true; }
    } catch { /* 표가 없거나 잠김 — 파일로 본다 */ } finally { try { db.close(); } catch {} }
  }
  if (!rollout || !fs.existsSync(rollout)) rollout = findRollout(codexHome, threadId);
  let fileProvider = null;
  if (rollout) {
    try { const j = JSON.parse(readFirstLine(rollout).first); if (j?.type === 'session_meta') fileProvider = j.payload?.model_provider ?? null; } catch { /* 첫 줄이 이상함 */ }
  }
  return { provider: provider ?? fileProvider, fileProvider, rollout, inDb };
}

/**
 * 재개 직전 호출. 연결 이름이 다르고 지금 연결이 이 PC 중계기면 맞춘다.
 * → { action: 'none'|'aligned'|'blocked'|'error', from, to, backup?, reason? }
 *   blocked = 이름이 다른데 지금 연결이 중계기가 아니라 맞추지 않음(맞추면 중계기를 건너뛴다) — 화면에 이유로 보인다.
 */
export function alignThreadProvider({ codexHome, threadId, now = () => new Date(), faceVersion = '', log = () => {} } = {}) {
  if (!codexHome || !threadId) return { action: 'none' };
  const cur = currentProvider(codexHome);
  const th = threadProvider(codexHome, threadId);
  const from = th.provider;
  const needFile = th.fileProvider && th.fileProvider !== cur.id;
  if (!from || (from === cur.id && !needFile)) return { action: 'none', from, to: cur.id };
  if (!isLocalRelay(cur.baseUrl)) {
    return { action: 'blocked', from, to: cur.id, reason: providerReason(from, cur.id) + ' 지금 설정이 IRIS 중계기를 가리키지 않아 자동으로 맞추지 않았습니다.' };
  }
  if (!th.rollout) return { action: 'error', from, to: cur.id, reason: providerReason(from, cur.id) + ' 대화 기록 파일을 찾지 못해 맞추지 못했습니다.' };
  try {
    // ① 백업: 원본 기록 파일 통째로(복구 = 이 파일을 제자리에 되돌리고 history 의 from 으로 DB 를 되돌림)
    const stamp = now().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
    const dir = path.join(codexHome, BACKUP_DIR_NAME);
    fs.mkdirSync(dir, { recursive: true });
    const backup = path.join(dir, `${stamp}-${path.basename(th.rollout)}`);
    fs.copyFileSync(th.rollout, backup);
    // ② 기록 파일 첫 줄(session_meta)만 고친다 — 나머지 바이트는 그대로
    let fileChanged = false;
    const { bytes, nl, first } = readFirstLine(th.rollout);
    const j = JSON.parse(first);
    if (j?.type === 'session_meta' && j.payload && j.payload.model_provider !== cur.id) {
      j.payload.model_provider = cur.id;
      const head = Buffer.from(JSON.stringify(j), 'utf8');
      const out = nl < 0 ? head : Buffer.concat([head, bytes.subarray(nl)]);
      const tmp = th.rollout + '.iris-tmp';
      fs.writeFileSync(tmp, out);
      fs.renameSync(tmp, th.rollout);
      fileChanged = true;
    }
    // ③ 목록 DB 의 그 대화 한 줄
    let dbChanged = false;
    if (th.inDb) {
      const db = openDb(path.join(codexHome, 'state_5.sqlite'), { readOnly: false });
      if (!db) throw new Error('목록 데이터베이스를 열지 못했습니다');
      try { dbChanged = db.prepare('UPDATE threads SET model_provider = ? WHERE id = ?').run(cur.id, threadId).changes > 0; } finally { try { db.close(); } catch {} }
    }
    const entry = { at: now().toISOString(), faceVersion, thread: threadId, from, to: cur.id, rollout: th.rollout, backup, fileChanged, dbChanged };
    fs.appendFileSync(path.join(dir, 'history.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
    log(`[codex-compat] ${threadId} provider ${from} → ${cur.id} (file=${fileChanged} db=${dbChanged}) backup=${backup}`);
    return { action: 'aligned', from, to: cur.id, backup };
  } catch (e) {
    log(`[codex-compat] ${threadId} align failed: ${e?.message || e}`);
    return { action: 'error', from, to: cur.id, reason: providerReason(from, cur.id) + ` 자동으로 맞추다 실패했습니다(${String(e?.message || e).slice(0, 120)}).` };
  }
}

export function providerReason(from, to) {
  return `이 대화는 '${from}' 연결로 만들어졌고 지금 코덱스 설정은 '${to}' 연결입니다.`;
}

/** 프로세스가 곧바로 끝났을 때 화면 마지막 줄들에서 실제 원인 한두 줄을 고른다(ANSI 는 헤드리스 터미널이 이미 걷어 냄). */
export function exitReasonFrom(lines) {
  const ls = (lines || []).map((l) => String(l).trim()).filter(Boolean);
  const hit = ls.filter((l) => /(error|failed|fatal|오류|실패|not found|denied|refused)/i.test(l));
  const pick = (hit.length ? hit.slice(-2) : ls.slice(-2)).join(' · ');
  if (!pick) return null;
  const mismatch = pick.match(/This chat uses ([\w-]+), but your current provider is ([\w-]+)/i);
  const text = mismatch ? `${providerReason(mismatch[1], mismatch[2])} (${pick})` : pick;
  return text.length > 400 ? text.slice(0, 399) + '…' : text;
}
