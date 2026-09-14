// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 세팅 진행 막대(v2.65, progress.mjs) 무접촉 검사 — 가짜 영혼 폴더의 setup-progress.json 으로 읽기·요약·변경 감지·방송을 본다. 실 데몬 접촉 0.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SetupProgress, readProgress, progressFile } from '../daemon/progress.mjs';
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-face-progress-'));
const root = path.join(tmp, 'NOVA'); fs.mkdirSync(path.join(root, '_agent', 'setup'), { recursive: true });
const write = (o) => fs.writeFileSync(progressFile(root), JSON.stringify(o), 'utf8');
const stages = (statuses) => ['receipt', 'permissions', 'extract', 'structure'].map((id, i) => ({ id, label: `단계${i + 1}`, status: statuses[i] || 'pending' }));

ok(readProgress(root) === null, '파일 없음 → null');
fs.writeFileSync(progressFile(root), '{ broken', 'utf8');
ok(readProgress(root) === null, '깨진 JSON → null(예외 없음)');
write({ schema: 1, title: 'IRIS 세팅', updatedAt: 't1', stages: stages(['done', 'skipped', 'running', 'pending']) });
const p = readProgress(root);
ok(p.total === 4 && p.done === 2 && p.pct === 50 && p.current?.id === 'extract' && !p.complete && !p.blocked, '요약: done+skipped=2/4, 50%, current=extract');
ok(p.stages[0].label === '단계1', '한글 라벨 유지');
write({ schema: 1, updatedAt: 't2', stages: stages(['done', 'done', 'blocked', 'pending']).map((s) => s.id === 'extract' ? { ...s, note: '사람 손 필요' } : s) });
const b = readProgress(root);
ok(b.blocked?.id === 'extract' && b.blocked.note === '사람 손 필요' && b.title === 'IRIS 세팅', 'blocked 단계와 사유, 제목 기본값');
write({ schema: 1, updatedAt: 't3', stages: stages(['done', 'done', 'done', 'skipped']) });
ok(readProgress(root).complete === true && readProgress(root).pct === 100, '전부 done/skipped → complete, 100%');
write({ schema: 1, updatedAt: 't4', stages: [{ id: 'x', status: 'weird' }] });
ok(readProgress(root).stages[0].status === 'pending' && readProgress(root).stages[0].label === 'x', '모르는 상태는 pending, 라벨 없으면 id');

// 변경 감지·방송
const events = [];
const sp = new SetupProgress({ root, broadcast: (e) => events.push(e), log: () => {} });
write({ schema: 1, updatedAt: 't5', stages: stages(['running']) });
ok(sp.tick() === true && events.length === 1 && events[0].type === 'setup' && events[0].progress.current.id === 'receipt', '첫 tick: 방송');
ok(sp.tick() === false && events.length === 1, '같은 내용은 다시 방송하지 않음');
write({ schema: 1, updatedAt: 't6', stages: stages(['done', 'running']) });
ok(sp.tick() === true && events.length === 2 && events[1].progress.done === 1, '바뀌면 방송');
ok(sp.info()?.done === 1, 'info() = 마지막 값(hello 용)');
fs.rmSync(progressFile(root));
ok(sp.tick() === true && events[2].progress === null, '파일이 사라지면 null 방송(화면 숨김)');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
